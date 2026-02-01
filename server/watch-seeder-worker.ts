import { db } from './db';
import { watchFamilies, imageIngestQueue, watchImages, WatchSeedReport } from '@shared/schema';
import { eq, sql, and, or, lt, count } from 'drizzle-orm';
import { downloadImage, validateImage, storeWatchImage } from './watch-image-storage';
import { generateImageEmbedding } from './embedding-service';

const CONCURRENCY = 3;
const DELAY_BETWEEN_BATCHES_MS = 2000;
const DELAY_ON_RATE_LIMIT_MS = 65000;
const MAX_RETRIES = 3;
const MIN_IMAGES_PER_FAMILY = 15;

interface WorkerStats {
  processed: number;
  completed: number;
  failed: number;
  skipped: number;
  duplicates: number;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processQueueItem(queueId: number): Promise<'completed' | 'failed' | 'skipped' | 'duplicate'> {
  const [item] = await db
    .select()
    .from(imageIngestQueue)
    .where(eq(imageIngestQueue.id, queueId))
    .limit(1);

  if (!item || item.status !== 'processing') {
    return 'skipped';
  }

  const family = await db
    .select()
    .from(watchFamilies)
    .where(eq(watchFamilies.id, item.familyId))
    .limit(1);

  if (!family.length) {
    await db.update(imageIngestQueue)
      .set({ 
        status: 'failed', 
        errorMessage: 'Family not found',
        processedAt: new Date(),
      })
      .where(eq(imageIngestQueue.id, queueId));
    return 'failed';
  }

  const familyData = family[0];

  try {
    const buffer = await downloadImage(item.sourceUrl);
    
    const validation = await validateImage(buffer);
    
    if (!validation.valid || !validation.sha256 || !validation.buffer) {
      await db.update(imageIngestQueue)
        .set({ 
          status: 'failed', 
          errorMessage: validation.error || 'Validation failed',
          processedAt: new Date(),
        })
        .where(eq(imageIngestQueue.id, queueId));
      return 'failed';
    }

    const existingImage = await db
      .select()
      .from(watchImages)
      .where(eq(watchImages.sha256, validation.sha256))
      .limit(1);

    if (existingImage.length > 0) {
      await db.update(imageIngestQueue)
        .set({ 
          status: 'skipped', 
          errorMessage: 'Duplicate sha256',
          processedAt: new Date(),
        })
        .where(eq(imageIngestQueue.id, queueId));
      return 'duplicate';
    }

    const stored = await storeWatchImage(
      validation.buffer,
      familyData.brand,
      familyData.family,
      familyData.id,
      validation.sha256
    );

    let embedding: number[] | null = null;
    try {
      const result = await generateImageEmbedding(validation.buffer);
      embedding = result.embedding;
    } catch (embeddingError: any) {
      if (embeddingError.message?.includes('429') || embeddingError.message?.includes('RATE')) {
        await delay(DELAY_ON_RATE_LIMIT_MS);
        const result = await generateImageEmbedding(validation.buffer);
        embedding = result.embedding;
      } else {
        console.log(`  Warning: Embedding failed for ${queueId}: ${embeddingError.message}`);
      }
    }

    const [newImage] = await db
      .insert(watchImages)
      .values({
        familyId: item.familyId,
        sha256: stored.sha256,
        storagePath: stored.storagePath,
        originalUrl: item.sourceUrl,
        fileSize: stored.fileSize,
        width: stored.width,
        height: stored.height,
        contentType: stored.contentType,
        source: 'seed',
      })
      .returning();

    if (embedding) {
      await db.execute(sql`
        UPDATE watch_images 
        SET embedding = ${`[${embedding.join(',')}]`}::vector
        WHERE id = ${newImage.id}
      `);
    }

    await db.update(imageIngestQueue)
      .set({ 
        status: 'completed',
        processedAt: new Date(),
      })
      .where(eq(imageIngestQueue.id, queueId));

    return 'completed';

  } catch (error: any) {
    const isRateLimit = error.message?.includes('429') || error.message?.includes('503');
    
    if (isRateLimit && item.retryCount < MAX_RETRIES) {
      await db.update(imageIngestQueue)
        .set({ 
          status: 'pending',
          retryCount: item.retryCount + 1,
          errorMessage: `Rate limited, retry ${item.retryCount + 1}`,
        })
        .where(eq(imageIngestQueue.id, queueId));
      await delay(DELAY_ON_RATE_LIMIT_MS);
      return 'skipped';
    }

    await db.update(imageIngestQueue)
      .set({ 
        status: 'failed', 
        errorMessage: error.message?.substring(0, 500),
        processedAt: new Date(),
      })
      .where(eq(imageIngestQueue.id, queueId));
    return 'failed';
  }
}

export async function runSeederWorker(maxItems?: number): Promise<WorkerStats> {
  const stats: WorkerStats = {
    processed: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    duplicates: 0,
  };

  console.log('='.repeat(60));
  console.log('WATCH SEEDER WORKER v2.0');
  console.log('='.repeat(60));
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`Min images per family: ${MIN_IMAGES_PER_FAMILY}`);
  console.log('');

  while (true) {
    const pending = await db
      .select()
      .from(imageIngestQueue)
      .where(
        or(
          eq(imageIngestQueue.status, 'pending'),
          and(
            eq(imageIngestQueue.status, 'processing'),
            lt(imageIngestQueue.createdAt, new Date(Date.now() - 600000))
          )
        )
      )
      .orderBy(imageIngestQueue.createdAt)
      .limit(CONCURRENCY);

    if (pending.length === 0) {
      console.log('\nNo more pending items in queue.');
      break;
    }

    if (maxItems && stats.processed >= maxItems) {
      console.log(`\nReached max items limit: ${maxItems}`);
      break;
    }

    await Promise.all(
      pending.map(item =>
        db.update(imageIngestQueue)
          .set({ status: 'processing' })
          .where(eq(imageIngestQueue.id, item.id))
      )
    );

    const results = await Promise.all(
      pending.map(item => processQueueItem(item.id))
    );

    for (const result of results) {
      stats.processed++;
      if (result === 'completed') stats.completed++;
      else if (result === 'failed') stats.failed++;
      else if (result === 'duplicate') stats.duplicates++;
      else stats.skipped++;
    }

    console.log(`Processed batch: ${results.join(', ')} | Total: ${stats.processed} (${stats.completed} OK, ${stats.failed} failed, ${stats.duplicates} dupe)`);

    await delay(DELAY_BETWEEN_BATCHES_MS);
  }

  await updateFamilyStatuses();

  console.log('\n' + '='.repeat(60));
  console.log('SEEDER COMPLETE');
  console.log('='.repeat(60));
  console.log(`Processed: ${stats.processed}`);
  console.log(`Completed: ${stats.completed}`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`Duplicates: ${stats.duplicates}`);
  console.log(`Skipped: ${stats.skipped}`);

  return stats;
}

async function updateFamilyStatuses(): Promise<void> {
  const families = await db.select().from(watchFamilies);
  
  for (const family of families) {
    const imageCountResult = await db
      .select({ count: count() })
      .from(watchImages)
      .where(eq(watchImages.familyId, family.id));
    
    const imageCount = Number(imageCountResult[0]?.count || 0);
    const newStatus = imageCount >= family.minImagesRequired ? 'ready' : 'building';
    
    if (family.status !== 'locked' && family.status !== newStatus) {
      await db.update(watchFamilies)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(watchFamilies.id, family.id));
    }
  }
}

export async function getWatchSeedReport(): Promise<WatchSeedReport> {
  const families = await db.select().from(watchFamilies);
  
  const imageCounts = await db
    .select({
      familyId: watchImages.familyId,
      count: count(),
    })
    .from(watchImages)
    .groupBy(watchImages.familyId);

  const countMap = new Map(imageCounts.map(ic => [ic.familyId, Number(ic.count)]));
  
  const totalStoredImages = imageCounts.reduce((sum, ic) => sum + Number(ic.count), 0);
  
  const familyImageCounts = families.map(f => countMap.get(f.id) || 0);
  const minImagesPerFamily = familyImageCounts.length ? Math.min(...familyImageCounts) : 0;
  const maxImagesPerFamily = familyImageCounts.length ? Math.max(...familyImageCounts) : 0;
  const avgImagesPerFamily = familyImageCounts.length 
    ? familyImageCounts.reduce((a, b) => a + b, 0) / familyImageCounts.length 
    : 0;

  const underfilledFamilies = families
    .filter(f => (countMap.get(f.id) || 0) < f.minImagesRequired)
    .map(f => ({
      brand: f.brand,
      family: f.family,
      imageCount: countMap.get(f.id) || 0,
      required: f.minImagesRequired,
    }));

  const readyFamilies = families.filter(f => f.status === 'ready' || f.status === 'locked').length;

  const queueStats = await db
    .select({
      status: imageIngestQueue.status,
      count: count(),
    })
    .from(imageIngestQueue)
    .groupBy(imageIngestQueue.status);

  const queueMap = new Map(queueStats.map(qs => [qs.status, Number(qs.count)]));

  const libraryReady = underfilledFamilies.length === 0 && families.length > 0;

  return {
    totalFamilies: families.length,
    totalStoredImages,
    minImagesPerFamily,
    maxImagesPerFamily,
    avgImagesPerFamily: Math.round(avgImagesPerFamily * 10) / 10,
    underfilledFamilies,
    readyFamilies,
    queueHealth: {
      pending: queueMap.get('pending') || 0,
      processing: queueMap.get('processing') || 0,
      completed: queueMap.get('completed') || 0,
      failed: queueMap.get('failed') || 0,
      skipped: queueMap.get('skipped') || 0,
    },
    libraryReady,
  };
}

export async function populateQueueFromSeedFile(): Promise<number> {
  const fs = await import('fs');
  const path = await import('path');
  
  const seedPath = path.join(process.cwd(), 'seed', 'watches.seed.json');
  
  if (!fs.existsSync(seedPath)) {
    throw new Error(`Seed file not found: ${seedPath}`);
  }

  const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
  let queuedCount = 0;

  for (const familyData of seedData.families) {
    if (familyData.images.length < 6) continue;

    let [family] = await db
      .select()
      .from(watchFamilies)
      .where(
        and(
          eq(watchFamilies.brand, familyData.brand),
          eq(watchFamilies.family, familyData.modelFamily)
        )
      )
      .limit(1);

    if (!family) {
      const [newFamily] = await db
        .insert(watchFamilies)
        .values({
          brand: familyData.brand,
          family: familyData.modelFamily,
          displayName: `${familyData.brand} ${familyData.modelFamily}`,
          attributes: familyData.attributes || {},
          status: 'building',
        })
        .returning();
      family = newFamily;
    }

    for (const imageUrl of familyData.images) {
      const existing = await db
        .select()
        .from(imageIngestQueue)
        .where(
          and(
            eq(imageIngestQueue.familyId, family.id),
            eq(imageIngestQueue.sourceUrl, imageUrl)
          )
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(imageIngestQueue).values({
          familyId: family.id,
          sourceUrl: imageUrl,
          status: 'pending',
        });
        queuedCount++;
      }
    }
  }

  console.log(`Populated queue with ${queuedCount} new URLs`);
  return queuedCount;
}
