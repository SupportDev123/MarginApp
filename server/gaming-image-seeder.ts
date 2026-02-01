import { db } from './db';
import { gamingFamilies, gamingImages, GamingSeedReport } from '@shared/schema';
import { eq, sql, and, count, asc } from 'drizzle-orm';
import { downloadImage, validateImage, storeGamingImage } from './gaming-image-storage';
import { generateImageEmbedding } from './embedding-service';

const DELAY_BETWEEN_REQUESTS_MS = 500;
const DELAY_ON_RATE_LIMIT_MS = 60000;
const IMAGES_TARGET_PER_FAMILY = 25;
const MAX_ACTIVE_FAMILIES = 15;
const MAX_LISTINGS_PER_FAMILY = 300;
const MAX_IMAGES_PER_LISTING = 3;
const DOWNLOAD_CONCURRENCY = 2;

const JUNK_TITLE_FILTERS = [
  'for parts', 'parts only', 'broken', 'as is', 'not working', 'defective',
  'for repair', 'no power', 'untested',
  'replacement', 'shell only', 'case only', 'housing only',
  'box only', 'empty box', 'manual only', 'cables only',
  'unit only', 'console only', 'controller only',
  'lot of', 'bundle of', 'mixed lot',
  'display only', 'dummy', 'replica', 'fake',
  'digital code', 'game code', 'subscription',
  'stand', 'charging dock', 'grip', 'faceplate', 'skin', 'decal',
  'read description', 'please read'
];

interface EbayItemSummary {
  itemId: string;
  title: string;
  condition?: string;
  image?: { imageUrl: string };
  additionalImages?: Array<{ imageUrl: string }>;
  price?: { value: string; currency: string };
}

interface EbaySearchResponse {
  itemSummaries?: EbayItemSummary[];
  total?: number;
  offset?: number;
  limit?: number;
  next?: string;
}

interface FamilySeederResult {
  brand: string;
  family: string;
  subcategory: string;
  imagesStored: number;
  listingsScanned: number;
  apiCalls: number;
  duplicatesSkipped: number;
  downloadFailed: number;
  junkFiltered: number;
  completed: boolean;
  status: 'locked' | 'active' | 'hard';
}

interface SeederStats {
  lockedFamilies: FamilySeederResult[];
  activeFamilies: FamilySeederResult[];
  hardFamilies: FamilySeederResult[];
  queuedFamilies: Array<{ brand: string; family: string; subcategory: string }>;
  totalApiCalls: number;
  totalImagesStored: number;
  totalDownloadSuccess: number;
  totalDownloadFailed: number;
  failureReasons: Map<string, number>;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isJunkTitle(title: string): boolean {
  const lowerTitle = title.toLowerCase();
  return JUNK_TITLE_FILTERS.some(filter => {
    if (filter.includes(' ')) {
      return lowerTitle.includes(filter);
    }
    const words = lowerTitle.split(/[\s,.-]+/);
    return words.includes(filter);
  });
}

interface SerpApiImageResult {
  original: string;
  thumbnail?: string;
  title?: string;
  source?: string;
}

interface SerpApiResponse {
  images_results?: SerpApiImageResult[];
  error?: string;
}

async function searchSerpApiImages(
  query: string,
  subcategory: string
): Promise<{ images: SerpApiImageResult[]; apiCalled: boolean }> {
  const serpApiKey = process.env.SERPAPI_KEY;
  
  if (!serpApiKey) {
    console.log('    SerpAPI key not configured');
    return { images: [], apiCalled: false };
  }

  const searchQuery = `${query} console gaming`;
  const url = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(searchQuery)}&num=20&api_key=${serpApiKey}`;

  try {
    const response = await fetch(url);

    if (response.status === 429 || response.status === 503) {
      console.log(`    Rate limited (${response.status}), waiting ${DELAY_ON_RATE_LIMIT_MS / 1000}s...`);
      await delay(DELAY_ON_RATE_LIMIT_MS);
      return { images: [], apiCalled: true };
    }

    if (!response.ok) {
      console.log(`    SerpAPI error: ${response.status}`);
      return { images: [], apiCalled: true };
    }

    const data: SerpApiResponse = await response.json();
    
    if (data.error) {
      console.log(`    SerpAPI error: ${data.error}`);
      return { images: [], apiCalled: true };
    }

    return { images: data.images_results || [], apiCalled: true };
  } catch (error: any) {
    console.log(`    SerpAPI exception: ${error.message}`);
    return { images: [], apiCalled: true };
  }
}

async function processGamingItem(
  item: EbayItemSummary,
  familyId: number,
  brand: string,
  family: string,
  existingSha256s: Set<string>,
  failureReasons: Map<string, number>
): Promise<{ stored: number; duplicates: number; failed: number }> {
  const result = { stored: 0, duplicates: 0, failed: 0 };
  
  const existingItem = await db.execute(sql`
    SELECT 1 FROM processed_gaming_items WHERE ebay_item_id = ${item.itemId} LIMIT 1
  `);
  
  if (existingItem.rows && existingItem.rows.length > 0) {
    return result;
  }

  const imageUrls: string[] = [];
  if (item.image?.imageUrl) {
    imageUrls.push(item.image.imageUrl);
  }
  if (item.additionalImages) {
    for (const img of item.additionalImages.slice(0, MAX_IMAGES_PER_LISTING - 1)) {
      if (img.imageUrl) {
        imageUrls.push(img.imageUrl);
      }
    }
  }

  let storedCount = 0;
  for (const imageUrl of imageUrls.slice(0, MAX_IMAGES_PER_LISTING)) {
    try {
      const buffer = await downloadImage(imageUrl);
      const validation = await validateImage(buffer);
      
      if (!validation.valid) {
        const reason = validation.error || 'unknown';
        failureReasons.set(reason, (failureReasons.get(reason) || 0) + 1);
        result.failed++;
        continue;
      }
      
      if (existingSha256s.has(validation.sha256!)) {
        result.duplicates++;
        continue;
      }
      
      const existingHash = await db.execute(sql`
        SELECT 1 FROM gaming_images WHERE sha256 = ${validation.sha256} LIMIT 1
      `);
      if (existingHash.rows && existingHash.rows.length > 0) {
        existingSha256s.add(validation.sha256!);
        result.duplicates++;
        continue;
      }
      
      const stored = await storeGamingImage(
        validation.buffer!,
        validation.sha256!,
        brand,
        family,
        familyId
      );
      
      if (!stored) {
        failureReasons.set('storage_failed', (failureReasons.get('storage_failed') || 0) + 1);
        result.failed++;
        continue;
      }
      
      let embedding: number[] | null = null;
      try {
        const embeddingResult = await generateImageEmbedding(validation.buffer!);
        embedding = embeddingResult.embedding;
      } catch (e) {
        console.log(`      Embedding failed, storing without vector`);
      }
      
      if (embedding) {
        await db.execute(sql`
          INSERT INTO gaming_images (family_id, sha256, storage_path, original_url, file_size, width, height, content_type, embedding, source)
          VALUES (${familyId}, ${validation.sha256}, ${stored.storagePath}, ${imageUrl}, ${stored.fileSize}, ${stored.width}, ${stored.height}, ${stored.contentType}, ${embedding}::vector, 'ebay')
        `);
      } else {
        await db.execute(sql`
          INSERT INTO gaming_images (family_id, sha256, storage_path, original_url, file_size, width, height, content_type, source)
          VALUES (${familyId}, ${validation.sha256}, ${stored.storagePath}, ${imageUrl}, ${stored.fileSize}, ${stored.width}, ${stored.height}, ${stored.contentType}, 'ebay')
        `);
      }
      
      existingSha256s.add(validation.sha256!);
      storedCount++;
      result.stored++;
      
    } catch (error: any) {
      const reason = error.message?.substring(0, 50) || 'unknown';
      failureReasons.set(reason, (failureReasons.get(reason) || 0) + 1);
      result.failed++;
    }
  }
  
  await db.execute(sql`
    INSERT INTO processed_gaming_items (ebay_item_id, family_id, title, condition, image_count)
    VALUES (${item.itemId}, ${familyId}, ${item.title}, ${item.condition || null}, ${storedCount})
  `);
  
  return result;
}

async function seedFamily(
  familyRecord: typeof gamingFamilies.$inferSelect,
  existingSha256s: Set<string>,
  failureReasons: Map<string, number>
): Promise<FamilySeederResult> {
  const { id, brand, family, displayName, subcategory, listingsScanned } = familyRecord;
  
  const result: FamilySeederResult = {
    brand,
    family,
    subcategory: subcategory || 'console',
    imagesStored: 0,
    listingsScanned: listingsScanned || 0,
    apiCalls: 0,
    duplicatesSkipped: 0,
    downloadFailed: 0,
    junkFiltered: 0,
    completed: false,
    status: 'active',
  };
  
  console.log(`\n  Seeding: ${displayName} (${subcategory})`);
  
  const currentImages = await db.select({ count: count() })
    .from(gamingImages)
    .where(eq(gamingImages.familyId, id));
  
  const imageCount = currentImages[0]?.count || 0;
  console.log(`    Current images: ${imageCount}/${IMAGES_TARGET_PER_FAMILY}`);
  
  if (imageCount >= IMAGES_TARGET_PER_FAMILY) {
    console.log(`    Already at target, locking family`);
    await db.update(gamingFamilies)
      .set({ status: 'locked', updatedAt: new Date() })
      .where(eq(gamingFamilies.id, id));
    result.status = 'locked';
    result.completed = true;
    return result;
  }
  
  if (result.listingsScanned >= MAX_LISTINGS_PER_FAMILY) {
    console.log(`    Hit listings limit with only ${imageCount} images, marking HARD`);
    await db.update(gamingFamilies)
      .set({ status: 'hard', updatedAt: new Date() })
      .where(eq(gamingFamilies.id, id));
    result.status = 'hard';
    result.completed = true;
    return result;
  }
  
  const rawQueries = [
    displayName,
    `${brand} ${family}`,
    family,
  ];
  const searchQueries = Array.from(new Set(rawQueries));
  
  for (const searchQuery of searchQueries) {
    if (imageCount + result.imagesStored >= IMAGES_TARGET_PER_FAMILY) break;
    
    console.log(`    Query: "${searchQuery}"`);
    
    const { images, apiCalled } = await searchSerpApiImages(searchQuery, subcategory || 'console');
    if (apiCalled) result.apiCalls++;
    
    if (!images || images.length === 0) {
      console.log(`      No results from SerpAPI`);
      continue;
    }
    
    console.log(`      Processing ${images.length} images from SerpAPI`);
    
    for (const image of images) {
      if (imageCount + result.imagesStored >= IMAGES_TARGET_PER_FAMILY) {
        break;
      }
      
      if (!image.original) continue;
      
      // Filter by title if available
      if (image.title && isJunkTitle(image.title)) {
        result.junkFiltered++;
        continue;
      }
      
      result.listingsScanned++;
      
      try {
        const buffer = await downloadImage(image.original);
        const validation = await validateImage(buffer);
        
        if (!validation.valid) {
          const reason = validation.error || 'unknown';
          failureReasons.set(reason, (failureReasons.get(reason) || 0) + 1);
          result.downloadFailed++;
          continue;
        }
        
        if (existingSha256s.has(validation.sha256!)) {
          result.duplicatesSkipped++;
          continue;
        }
        
        // Check DB for duplicates
        const existingHash = await db.execute(sql`
          SELECT 1 FROM gaming_images WHERE sha256 = ${validation.sha256} LIMIT 1
        `);
        if (existingHash.rows && existingHash.rows.length > 0) {
          result.duplicatesSkipped++;
          existingSha256s.add(validation.sha256!);
          continue;
        }
        
        // Generate embedding
        let embeddingVector: number[] | null = null;
        try {
          const embeddingResult = await generateImageEmbedding(buffer);
          embeddingVector = embeddingResult.embedding;
        } catch (embErr: any) {
          console.log(`      Embedding error: ${embErr.message?.substring(0, 50) || 'unknown'}`);
          failureReasons.set('embedding_failed', (failureReasons.get('embedding_failed') || 0) + 1);
          result.downloadFailed++;
          continue;
        }
        
        if (!embeddingVector || embeddingVector.length === 0) {
          failureReasons.set('embedding_empty', (failureReasons.get('embedding_empty') || 0) + 1);
          result.downloadFailed++;
          continue;
        }
        
        // Store image
        const storeResult = await storeGamingImage(buffer, validation.sha256!, brand, family, id);
        if (!storeResult) {
          failureReasons.set('storage_failed', (failureReasons.get('storage_failed') || 0) + 1);
          result.downloadFailed++;
          continue;
        }
        
        await db.insert(gamingImages).values({
          familyId: id,
          storagePath: storeResult.storagePath,
          originalUrl: image.original,
          sha256: storeResult.sha256,
          contentType: storeResult.contentType,
          fileSize: storeResult.fileSize,
          width: storeResult.width,
          height: storeResult.height,
          qualityScore: '0.5',
          embedding: sql`${JSON.stringify(embeddingVector)}::vector`,
          source: 'serpapi',
        });
        
        existingSha256s.add(validation.sha256!);
        result.imagesStored++;
        console.log(`      Stored image ${result.imagesStored}`);
        
        await delay(200);
      } catch (error: any) {
        const reason = error.message?.substring(0, 50) || 'unknown';
        failureReasons.set(reason, (failureReasons.get(reason) || 0) + 1);
        result.downloadFailed++;
      }
    }
    
    await db.update(gamingFamilies)
      .set({ listingsScanned: result.listingsScanned, updatedAt: new Date() })
      .where(eq(gamingFamilies.id, id));
    
    await delay(DELAY_BETWEEN_REQUESTS_MS);
  }
  
  const finalImageCount = imageCount + result.imagesStored;
  console.log(`    Final: ${finalImageCount} images, ${result.listingsScanned} listings scanned`);
  
  if (finalImageCount >= IMAGES_TARGET_PER_FAMILY) {
    await db.update(gamingFamilies)
      .set({ status: 'locked', updatedAt: new Date() })
      .where(eq(gamingFamilies.id, id));
    result.status = 'locked';
    result.completed = true;
  } else if (result.listingsScanned >= MAX_LISTINGS_PER_FAMILY) {
    await db.update(gamingFamilies)
      .set({ status: 'hard', updatedAt: new Date() })
      .where(eq(gamingFamilies.id, id));
    result.status = 'hard';
    result.completed = true;
  }
  
  return result;
}

export async function runGamingImageSeeder(): Promise<SeederStats> {
  console.log('Starting Gaming Image Seeder...');
  
  const stats: SeederStats = {
    lockedFamilies: [],
    activeFamilies: [],
    hardFamilies: [],
    queuedFamilies: [],
    totalApiCalls: 0,
    totalImagesStored: 0,
    totalDownloadSuccess: 0,
    totalDownloadFailed: 0,
    failureReasons: new Map(),
  };
  
  const existingSha256s = new Set<string>();
  const existingHashes = await db.select({ sha256: gamingImages.sha256 }).from(gamingImages);
  for (const row of existingHashes) {
    existingSha256s.add(row.sha256);
  }
  console.log(`Loaded ${existingSha256s.size} existing image hashes`);
  
  const activeFamilies = await db.select()
    .from(gamingFamilies)
    .where(eq(gamingFamilies.status, 'active'))
    .orderBy(asc(gamingFamilies.queueOrder))
    .limit(MAX_ACTIVE_FAMILIES);
  
  const activeCount = activeFamilies.length;
  
  if (activeCount < MAX_ACTIVE_FAMILIES) {
    const needed = MAX_ACTIVE_FAMILIES - activeCount;
    const queuedFamilies = await db.select()
      .from(gamingFamilies)
      .where(eq(gamingFamilies.status, 'queued'))
      .orderBy(asc(gamingFamilies.queueOrder))
      .limit(needed);
    
    for (const family of queuedFamilies) {
      await db.update(gamingFamilies)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(gamingFamilies.id, family.id));
      activeFamilies.push({ ...family, status: 'active' });
    }
  }
  
  console.log(`Processing ${activeFamilies.length} active families`);
  
  for (const family of activeFamilies) {
    const result = await seedFamily(family, existingSha256s, stats.failureReasons);
    
    stats.totalApiCalls += result.apiCalls;
    stats.totalImagesStored += result.imagesStored;
    stats.totalDownloadSuccess += result.imagesStored;
    stats.totalDownloadFailed += result.downloadFailed;
    
    if (result.status === 'locked') {
      stats.lockedFamilies.push(result);
    } else if (result.status === 'hard') {
      stats.hardFamilies.push(result);
    } else {
      stats.activeFamilies.push(result);
    }
  }
  
  const remaining = await db.select({ brand: gamingFamilies.brand, family: gamingFamilies.family, subcategory: gamingFamilies.subcategory })
    .from(gamingFamilies)
    .where(eq(gamingFamilies.status, 'queued'))
    .orderBy(asc(gamingFamilies.queueOrder));
  
  stats.queuedFamilies = remaining.map(f => ({ brand: f.brand, family: f.family, subcategory: f.subcategory || 'console' }));
  
  console.log('\nSeeder complete!');
  console.log(`  Total API calls: ${stats.totalApiCalls}`);
  console.log(`  Images stored: ${stats.totalImagesStored}`);
  console.log(`  Locked: ${stats.lockedFamilies.length}, Active: ${stats.activeFamilies.length}, Hard: ${stats.hardFamilies.length}, Queued: ${stats.queuedFamilies.length}`);
  
  return stats;
}

export async function getGamingSeederReport(): Promise<GamingSeedReport> {
  const allFamilies = await db.select().from(gamingFamilies);
  
  const imageCounts = await db.select({
    familyId: gamingImages.familyId,
    count: count(),
  })
    .from(gamingImages)
    .groupBy(gamingImages.familyId);
  
  const countMap = new Map<number, number>();
  for (const row of imageCounts) {
    countMap.set(row.familyId, row.count);
  }
  
  const lockedFamilies: GamingSeedReport['lockedFamilies'] = [];
  const activeFamilies: GamingSeedReport['activeFamilies'] = [];
  const queuedFamilies: GamingSeedReport['queuedFamilies'] = [];
  const hardFamilies: GamingSeedReport['hardFamilies'] = [];
  
  let totalImages = 0;
  let minImages = Infinity;
  let maxImages = 0;
  
  for (const family of allFamilies) {
    const imageCount = countMap.get(family.id) || 0;
    totalImages += imageCount;
    minImages = Math.min(minImages, imageCount);
    maxImages = Math.max(maxImages, imageCount);
    
    const familyInfo = {
      brand: family.brand,
      family: family.family,
      imageCount,
      subcategory: family.subcategory || 'console',
    };
    
    switch (family.status) {
      case 'locked':
        lockedFamilies.push(familyInfo);
        break;
      case 'active':
        activeFamilies.push(familyInfo);
        break;
      case 'hard':
        hardFamilies.push({ ...familyInfo, listingsScanned: family.listingsScanned || 0 });
        break;
      default:
        queuedFamilies.push(familyInfo);
    }
  }
  
  return {
    totalFamilies: allFamilies.length,
    totalImages,
    minImagesPerFamily: minImages === Infinity ? 0 : minImages,
    maxImagesPerFamily: maxImages,
    avgImagesPerFamily: allFamilies.length > 0 ? Math.round(totalImages / allFamilies.length) : 0,
    lockedFamilies,
    activeFamilies,
    queuedFamilies,
    hardFamilies,
    apiStats: {
      totalApiCalls: 0,
      downloadSuccess: totalImages,
      downloadFailed: 0,
      topFailureReasons: [],
    },
  };
}
