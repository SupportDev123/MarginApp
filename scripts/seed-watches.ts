import { db } from '../server/db';
import { libraryItems, libraryImages } from '../shared/schema';
import { generateImageEmbedding } from '../server/embedding-service';
import { sql, eq } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

const MIN_IMAGES_PER_FAMILY = 6;
const DELAY_BETWEEN_IMAGES_MS = 4000;  // Increased to 4s to stay under 100k tokens/min
const DELAY_BETWEEN_FAMILIES_MS = 8000;
const MAX_RETRIES = 3;
const RATE_LIMIT_WAIT_MS = 65000;  // Wait 65 seconds on rate limit

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateEmbeddingWithRetry(imageUrl: string, retries = MAX_RETRIES): Promise<{embedding: number[], hash: string}> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await generateImageEmbedding(imageUrl);
    } catch (error: any) {
      if (error.message?.includes('429') || error.message?.includes('RATE')) {
        console.log(`    Rate limited, waiting ${RATE_LIMIT_WAIT_MS/1000}s (attempt ${attempt}/${retries})...`);
        await delay(RATE_LIMIT_WAIT_MS);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded for rate limiting');
}

interface SeedFamily {
  brand: string;
  modelFamily: string;
  title: string;
  variant: string;
  attributes: Record<string, any>;
  images: string[];
}

interface SeedData {
  version: string;
  category: string;
  minImagesPerFamily: number;
  families: SeedFamily[];
}

async function seedWatches() {
  console.log('='.repeat(60));
  console.log('WATCH LIBRARY SEED v1.0');
  console.log('='.repeat(60));

  const seedPath = path.join(process.cwd(), 'seed', 'watches.seed.json');
  
  if (!fs.existsSync(seedPath)) {
    console.error(`ERROR: Seed file not found at ${seedPath}`);
    process.exit(1);
  }

  const seedData: SeedData = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
  
  console.log(`\nLoaded ${seedData.families.length} families from seed file`);
  console.log(`Min images per family: ${MIN_IMAGES_PER_FAMILY}`);
  console.log('');

  const validFamilies = seedData.families.filter(f => f.images.length >= MIN_IMAGES_PER_FAMILY);
  const skippedFamilies = seedData.families.filter(f => f.images.length < MIN_IMAGES_PER_FAMILY);

  if (skippedFamilies.length > 0) {
    console.log(`SKIPPING ${skippedFamilies.length} families with < ${MIN_IMAGES_PER_FAMILY} images:`);
    skippedFamilies.forEach(f => {
      console.log(`  - ${f.brand} ${f.modelFamily}: ${f.images.length} images`);
    });
    console.log('');
  }

  console.log(`Processing ${validFamilies.length} valid families...`);
  console.log('');

  let totalItemsCreated = 0;
  let totalItemsUpdated = 0;
  let totalImagesCreated = 0;
  let totalImagesSkipped = 0;
  const imageCountsByFamily: Record<string, number> = {};
  const existingHashes = new Set<string>();

  const allHashes = await db
    .select({ hash: libraryImages.imageHash })
    .from(libraryImages)
    .where(eq(libraryImages.category, 'watch'));
  
  allHashes.forEach(h => {
    if (h.hash) existingHashes.add(h.hash);
  });
  
  console.log(`Found ${existingHashes.size} existing image hashes in database`);
  console.log('');

  for (const family of validFamilies) {
    const familyKey = `${family.brand}:${family.modelFamily}`;
    console.log(`\n[${familyKey}] Processing...`);

    const existingItem = await db
      .select()
      .from(libraryItems)
      .where(
        sql`${libraryItems.category} = 'watch' 
            AND ${libraryItems.brand} = ${family.brand} 
            AND ${libraryItems.modelFamily} = ${family.modelFamily}`
      )
      .limit(1);

    let itemId: number;

    if (existingItem.length > 0) {
      itemId = existingItem[0].id;
      console.log(`  Found existing item ID: ${itemId}`);
      totalItemsUpdated++;
    } else {
      const [newItem] = await db
        .insert(libraryItems)
        .values({
          category: 'watch',
          brand: family.brand,
          modelFamily: family.modelFamily,
          title: family.title,
          variant: family.variant,
          attributes: family.attributes,
          status: 'active',
        })
        .returning();
      
      itemId = newItem.id;
      console.log(`  Created new item ID: ${itemId}`);
      totalItemsCreated++;
    }

    let familyImageCount = 0;

    for (const imageUrl of family.images) {
      try {
        await delay(DELAY_BETWEEN_IMAGES_MS);
        
        const { embedding, hash } = await generateEmbeddingWithRetry(imageUrl);

        if (existingHashes.has(hash)) {
          console.log(`  SKIP (duplicate hash): ${imageUrl.substring(0, 50)}...`);
          totalImagesSkipped++;
          continue;
        }

        const [newImage] = await db
          .insert(libraryImages)
          .values({
            itemId,
            category: 'watch',
            imageUrl,
            imageHash: hash,
            imageType: 'dial',
            source: 'seed',
            qualityScore: '1.0',
          })
          .returning();

        await db.execute(sql`
          UPDATE library_images 
          SET embedding = ${`[${embedding.join(',')}]`}::vector
          WHERE id = ${newImage.id}
        `);

        existingHashes.add(hash);
        familyImageCount++;
        totalImagesCreated++;
        console.log(`  + Image ${familyImageCount}: ${hash.substring(0, 8)}...`);
      } catch (error: any) {
        console.log(`  ERROR: ${imageUrl.substring(0, 50)}... - ${error.message}`);
      }
    }

    imageCountsByFamily[familyKey] = familyImageCount;
    console.log(`  Total images for ${familyKey}: ${familyImageCount}`);
    
    await delay(DELAY_BETWEEN_FAMILIES_MS);
  }

  console.log('\n' + '='.repeat(60));
  console.log('SEED COMPLETE');
  console.log('='.repeat(60));

  console.log(`\nItems created: ${totalItemsCreated}`);
  console.log(`Items updated: ${totalItemsUpdated}`);
  console.log(`Images created: ${totalImagesCreated}`);
  console.log(`Images skipped (duplicate): ${totalImagesSkipped}`);

  const imageCounts = Object.values(imageCountsByFamily);
  const minImages = Math.min(...imageCounts);
  const maxImages = Math.max(...imageCounts);
  const avgImages = imageCounts.reduce((a, b) => a + b, 0) / imageCounts.length;

  console.log(`\nImages per family:`);
  console.log(`  Min: ${minImages}`);
  console.log(`  Max: ${maxImages}`);
  console.log(`  Avg: ${avgImages.toFixed(1)}`);

  const totalWatchImages = await db
    .select({ count: sql<number>`count(*)` })
    .from(libraryImages)
    .where(eq(libraryImages.category, 'watch'));

  const totalCount = Number(totalWatchImages[0]?.count || 0);
  
  console.log(`\nTotal watch images in library: ${totalCount}`);
  
  if (totalCount < 500) {
    console.log(`\nWARNING: Library has < 500 images. Confidence gating will show 'library_building'.`);
    console.log(`Need ${500 - totalCount} more images to reach minimum threshold.`);
  } else if (totalCount < 1500) {
    console.log(`\nNOTE: Library has ${totalCount} images. Limited confidence mode active.`);
    console.log(`Need ${1500 - totalCount} more images for full auto-select.`);
  } else {
    console.log(`\nLibrary is fully seeded. Full confidence and auto-select enabled.`);
  }

  console.log('\n' + '='.repeat(60));
  
  return {
    familiesSeeded: validFamilies.length,
    itemsCreated: totalItemsCreated,
    itemsUpdated: totalItemsUpdated,
    imagesCreated: totalImagesCreated,
    imagesSkipped: totalImagesSkipped,
    minImagesPerFamily: minImages,
    maxImagesPerFamily: maxImages,
    avgImagesPerFamily: avgImages,
    totalLibraryImages: totalCount,
  };
}

seedWatches()
  .then(result => {
    console.log('\nFinal result:', JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
