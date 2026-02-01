import { db } from './db';
import { watchFamilies, watchImages, WatchSeedReport } from '@shared/schema';
import { eq, sql, and, count } from 'drizzle-orm';
import { downloadImage, validateImage, storeWatchImage } from './watch-image-storage';
import { generateImageEmbedding } from './embedding-service';
import { getAccessToken } from './ebay-api';

const DELAY_BETWEEN_REQUESTS_MS = 500;
const DELAY_ON_RATE_LIMIT_MS = 60000;
const IMAGES_TARGET_PER_FAMILY = 25;
const MAX_ACTIVE_FAMILIES = 60;

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
  imagesStored: number;
  listingsScanned: number;
  apiCalls: number;
  duplicatesSkipped: number;
  downloadFailed: number;
  completed: boolean;
}

interface SeederStats {
  completedFamilies: FamilySeederResult[];
  incompleteFamilies: FamilySeederResult[];
  totalApiCalls: number;
  totalImagesStored: number;
}

const PRIORITY_FAMILIES = [
  { brand: 'Citizen', family: 'Eco-Drive', searchTerms: ['Citizen Eco-Drive watch', 'Citizen Eco-Drive men', 'Citizen Eco-Drive solar'] },
  { brand: 'Tissot', family: 'PRX', searchTerms: ['Tissot PRX watch', 'Tissot PRX automatic', 'Tissot PRX Powermatic'] },
  { brand: 'Hamilton', family: 'Khaki', searchTerms: ['Hamilton Khaki watch', 'Hamilton Khaki Field', 'Hamilton Khaki automatic'] },
  { brand: 'Bulova', family: 'Precisionist', searchTerms: ['Bulova Precisionist watch', 'Bulova Precisionist chronograph'] },
  { brand: 'Casio', family: 'G-Shock', searchTerms: ['Casio G-Shock watch', 'G-Shock digital', 'G-Shock analog'] },
  { brand: 'Invicta', family: 'Pro Diver', searchTerms: ['Invicta Pro Diver watch', 'Invicta Pro Diver men watch', 'Invicta Pro Diver automatic'] },
  { brand: 'Invicta', family: 'Speedway', searchTerms: ['Invicta Speedway watch', 'Invicta Speedway chronograph'] },
  { brand: 'Invicta', family: 'Bolt', searchTerms: ['Invicta Bolt watch', 'Invicta Bolt Zeus'] },
  { brand: 'Invicta', family: 'Subaqua', searchTerms: ['Invicta Subaqua watch', 'Invicta Subaqua Noma'] },
  { brand: 'Invicta', family: 'Reserve', searchTerms: ['Invicta Reserve watch', 'Invicta Reserve collection'] },
  { brand: 'Seiko', family: 'Prospex', searchTerms: ['Seiko Prospex watch', 'Seiko Prospex diver', 'Seiko Prospex automatic'] },
  { brand: 'Seiko', family: 'Presage', searchTerms: ['Seiko Presage watch', 'Seiko Presage cocktail', 'Seiko Presage automatic'] },
  { brand: 'Seiko', family: '5 Sports', searchTerms: ['Seiko 5 Sports watch', 'Seiko 5 automatic'] },
  { brand: 'Seiko', family: 'SKX', searchTerms: ['Seiko SKX watch', 'Seiko SKX007', 'Seiko SKX009'] },
  { brand: 'Seiko', family: 'Turtle', searchTerms: ['Seiko Turtle watch', 'Seiko Turtle diver', 'Seiko SRPE'] },
  { brand: 'Orient', family: 'Bambino', searchTerms: ['Orient Bambino watch', 'Orient Bambino automatic', 'Orient Bambino dress'] },
  { brand: 'Orient', family: 'Kamasu', searchTerms: ['Orient Kamasu watch', 'Orient Kamasu diver'] },
  { brand: 'Orient', family: 'Mako', searchTerms: ['Orient Mako watch', 'Orient Mako II', 'Orient Mako diver'] },
  { brand: 'Citizen', family: 'Promaster', searchTerms: ['Citizen Promaster watch', 'Citizen Promaster diver'] },
  { brand: 'Fossil', family: 'Grant', searchTerms: ['Fossil Grant watch', 'Fossil Grant chronograph'] },
  { brand: 'Fossil', family: 'Machine', searchTerms: ['Fossil Machine watch', 'Fossil Machine chronograph'] },
  { brand: 'Fossil', family: 'Townsman', searchTerms: ['Fossil Townsman watch', 'Fossil Townsman automatic'] },
  { brand: 'Fossil', family: 'Minimalist', searchTerms: ['Fossil Minimalist watch', 'Fossil Minimalist leather'] },
  { brand: 'Michael Kors', family: 'Bradshaw', searchTerms: ['Michael Kors Bradshaw watch', 'MK Bradshaw'] },
  { brand: 'Michael Kors', family: 'Lexington', searchTerms: ['Michael Kors Lexington watch', 'MK Lexington'] },
  { brand: 'Michael Kors', family: 'Parker', searchTerms: ['Michael Kors Parker watch', 'MK Parker'] },
  { brand: 'Michael Kors', family: 'Runway', searchTerms: ['Michael Kors Runway watch', 'MK Runway'] },
  { brand: 'Movado', family: 'Bold', searchTerms: ['Movado Bold watch', 'Movado Bold Evolution'] },
  { brand: 'Movado', family: 'Museum Classic', searchTerms: ['Movado Museum Classic watch', 'Movado Museum watch'] },
  { brand: 'Casio', family: 'Edifice', searchTerms: ['Casio Edifice watch', 'Casio Edifice chronograph'] },
  { brand: 'Casio', family: 'Duro', searchTerms: ['Casio Duro watch', 'Casio Duro Marlin', 'Casio MDV106'] },
  { brand: 'Bulova', family: 'Marine Star', searchTerms: ['Bulova Marine Star watch', 'Bulova Marine Star chronograph'] },
  { brand: 'Bulova', family: 'Lunar Pilot', searchTerms: ['Bulova Lunar Pilot watch', 'Bulova Moon watch'] },
  { brand: 'Timex', family: 'Expedition', searchTerms: ['Timex Expedition watch', 'Timex Expedition Scout'] },
  { brand: 'Timex', family: 'Weekender', searchTerms: ['Timex Weekender watch', 'Timex Weekender Chrono'] },
  { brand: 'Timex', family: 'Waterbury', searchTerms: ['Timex Waterbury watch', 'Timex Waterbury Classic'] },
  { brand: 'Tag Heuer', family: 'Carrera', searchTerms: ['Tag Heuer Carrera watch', 'Tag Heuer Carrera automatic'] },
  { brand: 'Tag Heuer', family: 'Formula 1', searchTerms: ['Tag Heuer Formula 1 watch', 'Tag Heuer F1'] },
  { brand: 'Tag Heuer', family: 'Aquaracer', searchTerms: ['Tag Heuer Aquaracer watch', 'Tag Heuer Aquaracer diver'] },
  { brand: 'Omega', family: 'Seamaster Diver 300M', searchTerms: ['Omega Seamaster 300M watch', 'Omega Seamaster diver'] },
  { brand: 'Omega', family: 'Speedmaster Professional', searchTerms: ['Omega Speedmaster Professional watch', 'Omega Speedmaster Moon'] },
  { brand: 'Garmin', family: 'Fenix', searchTerms: ['Garmin Fenix watch', 'Garmin Fenix 7', 'Garmin Fenix 6'] },
  { brand: 'Garmin', family: 'Instinct', searchTerms: ['Garmin Instinct watch', 'Garmin Instinct Solar'] },
  { brand: 'Apple', family: 'Watch Series', searchTerms: ['Apple Watch Series 9', 'Apple Watch Series 8', 'Apple Watch Ultra'] },
  { brand: 'Samsung', family: 'Galaxy Watch', searchTerms: ['Samsung Galaxy Watch', 'Galaxy Watch 6', 'Galaxy Watch 5'] },
];

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function searchEbayWatches(
  query: string,
  offset: number = 0,
  limit: number = 50
): Promise<{ response: EbaySearchResponse | null; apiCalled: boolean }> {
  const accessToken = await getAccessToken('https://api.ebay.com/oauth/api_scope');
  
  if (!accessToken) {
    console.log('    eBay API credentials not configured');
    return { response: null, apiCalled: false };
  }

  const categoryId = '31387';
  const encodedQuery = encodeURIComponent(query);
  
  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?` +
    `q=${encodedQuery}` +
    `&category_ids=${categoryId}` +
    `` +
    `&limit=${limit}` +
    `&offset=${offset}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 429 || response.status === 503) {
      console.log(`    Rate limited (${response.status}), waiting ${DELAY_ON_RATE_LIMIT_MS / 1000}s...`);
      await delay(DELAY_ON_RATE_LIMIT_MS);
      return { response: null, apiCalled: true };
    }

    if (!response.ok) {
      console.log(`    eBay API error: ${response.status}`);
      return { response: null, apiCalled: true };
    }

    return { response: await response.json(), apiCalled: true };
  } catch (error: any) {
    console.log(`    eBay API exception: ${error.message}`);
    return { response: null, apiCalled: true };
  }
}

async function processEbayItem(
  item: EbayItemSummary,
  familyId: number,
  brand: string,
  family: string,
  existingSha256s: Set<string>
): Promise<{ stored: number; duplicates: number; failed: number }> {
  const result = { stored: 0, duplicates: 0, failed: 0 };
  
  const existingItem = await db.execute(sql`
    SELECT 1 FROM processed_ebay_items WHERE ebay_item_id = ${item.itemId} LIMIT 1
  `);
  
  if (existingItem.rows && existingItem.rows.length > 0) {
    return result;
  }

  const imageUrls: string[] = [];
  if (item.image?.imageUrl) {
    imageUrls.push(item.image.imageUrl);
  }
  if (item.additionalImages) {
    for (const img of item.additionalImages.slice(0, 2)) {
      if (img.imageUrl) imageUrls.push(img.imageUrl);
    }
  }

  if (imageUrls.length === 0) return result;

  for (const imageUrl of imageUrls) {
    try {
      const buffer = await downloadImage(imageUrl);
      const validation = await validateImage(buffer);
      
      if (!validation.valid || !validation.sha256 || !validation.buffer) {
        result.failed++;
        continue;
      }

      if (existingSha256s.has(validation.sha256)) {
        result.duplicates++;
        continue;
      }

      const existingImage = await db
        .select()
        .from(watchImages)
        .where(eq(watchImages.sha256, validation.sha256))
        .limit(1);

      if (existingImage.length > 0) {
        existingSha256s.add(validation.sha256);
        result.duplicates++;
        continue;
      }

      const stored = await storeWatchImage(
        validation.buffer,
        brand,
        family,
        familyId,
        validation.sha256
      );

      let embedding: number[] | null = null;
      try {
        const embResult = await generateImageEmbedding(validation.buffer);
        embedding = embResult.embedding;
      } catch (embError: any) {
        if (embError.message?.includes('429')) {
          await delay(DELAY_ON_RATE_LIMIT_MS);
          try {
            const embResult = await generateImageEmbedding(validation.buffer);
            embedding = embResult.embedding;
          } catch { }
        }
      }

      const [newImage] = await db
        .insert(watchImages)
        .values({
          familyId,
          sha256: stored.sha256,
          storagePath: stored.storagePath,
          originalUrl: imageUrl,
          fileSize: stored.fileSize,
          width: stored.width,
          height: stored.height,
          contentType: stored.contentType,
          source: 'ebay',
        })
        .returning();

      if (embedding) {
        await db.execute(sql`
          UPDATE watch_images 
          SET embedding = ${`[${embedding.join(',')}]`}::vector
          WHERE id = ${newImage.id}
        `);
      }

      existingSha256s.add(validation.sha256);
      result.stored++;

    } catch (error: any) {
      result.failed++;
    }
  }

  await db.execute(sql`
    INSERT INTO processed_ebay_items (ebay_item_id, family_id, title, condition, image_count)
    VALUES (${item.itemId}, ${familyId}, ${item.title}, ${item.condition || 'unknown'}, ${result.stored})
    ON CONFLICT (ebay_item_id) DO NOTHING
  `);

  return result;
}

async function seedSingleFamily(
  brand: string,
  family: string,
  searchTerms: string[]
): Promise<FamilySeederResult> {
  const result: FamilySeederResult = {
    brand,
    family,
    imagesStored: 0,
    listingsScanned: 0,
    apiCalls: 0,
    duplicatesSkipped: 0,
    downloadFailed: 0,
    completed: false,
  };

  let [familyRecord] = await db
    .select()
    .from(watchFamilies)
    .where(and(eq(watchFamilies.brand, brand), eq(watchFamilies.family, family)))
    .limit(1);

  if (!familyRecord) {
    const [newFamily] = await db
      .insert(watchFamilies)
      .values({
        brand,
        family,
        displayName: `${brand} ${family}`,
        status: 'building',
      })
      .returning();
    familyRecord = newFamily;
  }

  const existingCountResult = await db
    .select({ count: count() })
    .from(watchImages)
    .where(eq(watchImages.familyId, familyRecord.id));
  
  let currentImageCount = Number(existingCountResult[0]?.count || 0);
  
  if (currentImageCount >= IMAGES_TARGET_PER_FAMILY) {
    console.log(`  [${brand} ${family}] Already complete: ${currentImageCount}/${IMAGES_TARGET_PER_FAMILY} images`);
    result.completed = true;
    return result;
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`SEEDING: ${brand} ${family}`);
  console.log(`Current: ${currentImageCount}/${IMAGES_TARGET_PER_FAMILY} images`);
  console.log(`${'─'.repeat(50)}`);

  const existingSha256s = new Set<string>();
  const existingImages = await db
    .select({ sha256: watchImages.sha256 })
    .from(watchImages)
    .where(eq(watchImages.familyId, familyRecord.id));
  existingImages.forEach(img => existingSha256s.add(img.sha256));

  for (const query of searchTerms) {
    if (currentImageCount >= IMAGES_TARGET_PER_FAMILY) break;

    console.log(`  Query: "${query}"`);
    let offset = 0;
    let consecutiveEmptyPages = 0;

    while (currentImageCount < IMAGES_TARGET_PER_FAMILY) {
      const { response: searchResult, apiCalled } = await searchEbayWatches(query, offset, 50);
      if (apiCalled) result.apiCalls++;

      if (!searchResult || !searchResult.itemSummaries || searchResult.itemSummaries.length === 0) {
        consecutiveEmptyPages++;
        if (consecutiveEmptyPages >= 2) {
          console.log(`    No more results for this query`);
          break;
        }
        offset += 50;
        await delay(DELAY_BETWEEN_REQUESTS_MS);
        continue;
      }

      consecutiveEmptyPages = 0;
      console.log(`    Processing ${searchResult.itemSummaries.length} listings (offset ${offset})...`);

      for (const item of searchResult.itemSummaries) {
        if (currentImageCount >= IMAGES_TARGET_PER_FAMILY) break;

        result.listingsScanned++;
        const itemResult = await processEbayItem(item, familyRecord.id, brand, family, existingSha256s);
        
        result.imagesStored += itemResult.stored;
        result.duplicatesSkipped += itemResult.duplicates;
        result.downloadFailed += itemResult.failed;
        currentImageCount += itemResult.stored;

        if (itemResult.stored > 0) {
          console.log(`    ✓ +${itemResult.stored} images (now ${currentImageCount}/${IMAGES_TARGET_PER_FAMILY})`);
        }
      }

      offset += searchResult.itemSummaries.length;
      await delay(DELAY_BETWEEN_REQUESTS_MS);

      if (!searchResult.next) break;
    }
  }

  result.completed = currentImageCount >= IMAGES_TARGET_PER_FAMILY;
  
  // Auto-lock at 25 images, otherwise set to ready at 15+ or building
  let newStatus: string;
  if (currentImageCount >= IMAGES_TARGET_PER_FAMILY) {
    newStatus = 'locked';
    console.log(`  🔒 AUTO-LOCKING: Reached ${IMAGES_TARGET_PER_FAMILY} images`);
  } else if (currentImageCount >= 15) {
    newStatus = 'ready';
  } else {
    newStatus = 'building';
  }
  
  await db.update(watchFamilies)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(watchFamilies.id, familyRecord.id));

  console.log(`\n  RESULT: ${result.completed ? '✓ COMPLETE' : '⚠ INCOMPLETE'}`);
  console.log(`  Images: ${currentImageCount}/${IMAGES_TARGET_PER_FAMILY}`);
  console.log(`  Status: ${newStatus}`);
  console.log(`  API calls: ${result.apiCalls}`);
  console.log(`  Listings scanned: ${result.listingsScanned}`);
  console.log(`  Duplicates: ${result.duplicatesSkipped}`);

  return result;
}

export async function runEbayImageSeeder(): Promise<SeederStats> {
  const stats: SeederStats = {
    completedFamilies: [],
    incompleteFamilies: [],
    totalApiCalls: 0,
    totalImagesStored: 0,
  };

  console.log('═'.repeat(60));
  console.log('EBAY IMAGE SEEDER v2.0 - SEQUENTIAL MODE');
  console.log('═'.repeat(60));
  console.log(`Target: ${IMAGES_TARGET_PER_FAMILY} images per family (hard target)`);
  console.log(`Max active families: ${MAX_ACTIVE_FAMILIES}`);
  console.log(`Strategy: Complete each family before moving to next`);
  console.log('═'.repeat(60));

  let activeFamiliesCount = 0;

  for (const familyConfig of PRIORITY_FAMILIES) {
    if (activeFamiliesCount >= MAX_ACTIVE_FAMILIES) {
      console.log(`\nReached max active families limit (${MAX_ACTIVE_FAMILIES}). Stopping.`);
      break;
    }

    const result = await seedSingleFamily(
      familyConfig.brand,
      familyConfig.family,
      familyConfig.searchTerms
    );

    stats.totalApiCalls += result.apiCalls;
    stats.totalImagesStored += result.imagesStored;

    if (result.completed) {
      stats.completedFamilies.push(result);
    } else {
      stats.incompleteFamilies.push(result);
    }

    activeFamiliesCount++;
    
    await delay(2000);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('SEEDER COMPLETE - SUMMARY');
  console.log('═'.repeat(60));
  
  console.log('\n📊 COMPLETED FAMILIES:');
  console.log('─'.repeat(50));
  if (stats.completedFamilies.length === 0) {
    console.log('  (none)');
  } else {
    for (const f of stats.completedFamilies) {
      console.log(`  ✓ ${f.brand} ${f.family}: ${f.imagesStored} images, ${f.apiCalls} API calls`);
    }
  }

  console.log('\n⚠ INCOMPLETE FAMILIES:');
  console.log('─'.repeat(50));
  if (stats.incompleteFamilies.length === 0) {
    console.log('  (none)');
  } else {
    for (const f of stats.incompleteFamilies) {
      console.log(`  ⚠ ${f.brand} ${f.family}: ${f.imagesStored} images, ${f.apiCalls} API calls`);
    }
  }

  console.log('\n📈 TOTALS:');
  console.log('─'.repeat(50));
  console.log(`  Completed families: ${stats.completedFamilies.length}`);
  console.log(`  Incomplete families: ${stats.incompleteFamilies.length}`);
  console.log(`  Total images stored: ${stats.totalImagesStored}`);
  console.log(`  Total API calls: ${stats.totalApiCalls}`);
  console.log(`  Avg API calls per family: ${(stats.totalApiCalls / (stats.completedFamilies.length + stats.incompleteFamilies.length) || 0).toFixed(1)}`);

  return stats;
}

export async function getEbaySeederReport(): Promise<WatchSeedReport & { apiStats: any }> {
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

  const processedItemsResult = await db.execute(sql`SELECT COUNT(*) as count FROM processed_ebay_items`);
  const processedItems = Number(processedItemsResult.rows[0]?.count || 0);

  return {
    totalFamilies: families.length,
    totalStoredImages,
    minImagesPerFamily,
    maxImagesPerFamily,
    avgImagesPerFamily: Math.round(avgImagesPerFamily * 10) / 10,
    underfilledFamilies,
    readyFamilies,
    queueHealth: {
      pending: 0,
      processing: 0,
      completed: processedItems,
      failed: 0,
      skipped: 0,
    },
    libraryReady: underfilledFamilies.length === 0 && families.length > 0,
    apiStats: {
      processedEbayItems: processedItems,
      totalStoredImages,
    },
  };
}

/**
 * Seed specific families with auto-lock at target images.
 * Fill-first mode: completes each family before moving to next.
 */
export async function seedSpecificFamilies(
  families: Array<{ brand: string; family: string }>,
  options: { maxListings?: number } = {}
): Promise<SeederStats> {
  const maxListings = options.maxListings || 300;
  const stats: SeederStats = {
    completedFamilies: [],
    incompleteFamilies: [],
    totalApiCalls: 0,
    totalImagesStored: 0,
  };

  console.log('═'.repeat(60));
  console.log('EBAY IMAGE SEEDER - SPECIFIC FAMILIES MODE');
  console.log('═'.repeat(60));
  console.log(`Families to seed: ${families.length}`);
  console.log(`Target: ${IMAGES_TARGET_PER_FAMILY} images per family`);
  console.log(`Max listings per family: ${maxListings}`);
  console.log(`Auto-lock at ${IMAGES_TARGET_PER_FAMILY} images: ENABLED`);
  console.log('═'.repeat(60));

  for (const familyConfig of families) {
    // Generate search terms for this family
    const searchTerms = [
      `${familyConfig.brand} ${familyConfig.family} watch`,
      `${familyConfig.brand} ${familyConfig.family} men watch`,
      `${familyConfig.brand} ${familyConfig.family} automatic`,
    ];

    const result = await seedSingleFamily(
      familyConfig.brand,
      familyConfig.family,
      searchTerms
    );

    stats.totalApiCalls += result.apiCalls;
    stats.totalImagesStored += result.imagesStored;

    if (result.completed) {
      stats.completedFamilies.push(result);
    } else {
      stats.incompleteFamilies.push(result);
    }

    // Check max listings limit
    if (result.listingsScanned >= maxListings) {
      console.log(`  ⚠ Max listings limit (${maxListings}) reached for this family`);
    }

    await delay(2000);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('SEEDER COMPLETE - SUMMARY');
  console.log('═'.repeat(60));
  
  console.log('\n📊 COMPLETED FAMILIES (LOCKED):');
  console.log('─'.repeat(50));
  if (stats.completedFamilies.length === 0) {
    console.log('  (none)');
  } else {
    for (const f of stats.completedFamilies) {
      console.log(`  🔒 ${f.brand} ${f.family}: ${f.imagesStored} images, ${f.apiCalls} API calls`);
    }
  }

  console.log('\n⚠ INCOMPLETE FAMILIES:');
  console.log('─'.repeat(50));
  if (stats.incompleteFamilies.length === 0) {
    console.log('  (none)');
  } else {
    for (const f of stats.incompleteFamilies) {
      console.log(`  ⚠ ${f.brand} ${f.family}: ${f.imagesStored} images, ${f.apiCalls} API calls`);
    }
  }

  console.log('\n📈 TOTALS:');
  console.log('─'.repeat(50));
  console.log(`  Completed (locked): ${stats.completedFamilies.length}`);
  console.log(`  Incomplete: ${stats.incompleteFamilies.length}`);
  console.log(`  Total images stored: ${stats.totalImagesStored}`);
  console.log(`  Total API calls: ${stats.totalApiCalls}`);

  return stats;
}
