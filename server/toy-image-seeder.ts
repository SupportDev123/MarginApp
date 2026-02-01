import { db } from './db';
import { toyFamilies, toyImages, processedToyItems, ToySeedReport } from '@shared/schema';
import { eq, sql, and, count, asc } from 'drizzle-orm';
import { downloadImage, validateImage, storeToyImage } from './toy-image-storage';
import { generateImageEmbedding } from './embedding-service';
import { getAccessToken } from './ebay-api';

const DELAY_BETWEEN_REQUESTS_MS = 500;
const DELAY_ON_RATE_LIMIT_MS = 60000;
const IMAGES_TARGET_PER_FAMILY = 25;
const MAX_ACTIVE_FAMILIES = 15;
const MAX_LISTINGS_PER_FAMILY = 300;
const MAX_IMAGES_PER_LISTING = 3;
const DOWNLOAD_CONCURRENCY = 2;

const JUNK_TITLE_FILTERS = [
  'for parts', 'parts only', 'broken', 'as is', 'not working', 'defective',
  'for repair', 'incomplete', 'missing pieces', 'damaged',
  'instructions only', 'manual only', 'box only', 'empty box',
  'lot of', 'bundle of', 'mixed lot', 'bulk lot',
  'display only', 'dummy', 'replica', 'fake', 'knockoff', 'custom',
  'read description', 'please read', 'see description'
];

const TOY_FAMILIES_DATA = [
  { brand: 'LEGO', family: 'Star Wars UCS', subcategory: 'building_set', queueOrder: 1 },
  { brand: 'LEGO', family: 'Technic', subcategory: 'building_set', queueOrder: 2 },
  { brand: 'LEGO', family: 'Creator Expert', subcategory: 'building_set', queueOrder: 3 },
  { brand: 'LEGO', family: 'City', subcategory: 'building_set', queueOrder: 4 },
  { brand: 'LEGO', family: 'Ideas', subcategory: 'building_set', queueOrder: 5 },
  { brand: 'LEGO', family: 'Architecture', subcategory: 'building_set', queueOrder: 6 },
  { brand: 'LEGO', family: 'Harry Potter', subcategory: 'building_set', queueOrder: 7 },
  { brand: 'LEGO', family: 'Marvel', subcategory: 'building_set', queueOrder: 8 },
  { brand: 'LEGO', family: 'DC Comics', subcategory: 'building_set', queueOrder: 9 },
  { brand: 'LEGO', family: 'Ninjago', subcategory: 'building_set', queueOrder: 10 },
  { brand: 'Funko', family: 'Pop Marvel', subcategory: 'vinyl_figure', queueOrder: 11 },
  { brand: 'Funko', family: 'Pop Star Wars', subcategory: 'vinyl_figure', queueOrder: 12 },
  { brand: 'Funko', family: 'Pop Disney', subcategory: 'vinyl_figure', queueOrder: 13 },
  { brand: 'Funko', family: 'Pop Anime', subcategory: 'vinyl_figure', queueOrder: 14 },
  { brand: 'Funko', family: 'Pop DC Comics', subcategory: 'vinyl_figure', queueOrder: 15 },
  { brand: 'Funko', family: 'Pop Games', subcategory: 'vinyl_figure', queueOrder: 16 },
  { brand: 'Funko', family: 'Pop Movies', subcategory: 'vinyl_figure', queueOrder: 17 },
  { brand: 'Funko', family: 'Pop Television', subcategory: 'vinyl_figure', queueOrder: 18 },
  { brand: 'Funko', family: 'Pop Sports', subcategory: 'vinyl_figure', queueOrder: 19 },
  { brand: 'Funko', family: 'Soda', subcategory: 'vinyl_figure', queueOrder: 20 },
  { brand: 'Hot Wheels', family: 'Treasure Hunt', subcategory: 'diecast', queueOrder: 21 },
  { brand: 'Hot Wheels', family: 'Super Treasure Hunt', subcategory: 'diecast', queueOrder: 22 },
  { brand: 'Hot Wheels', family: 'RLC', subcategory: 'diecast', queueOrder: 23 },
  { brand: 'Hot Wheels', family: 'Premium', subcategory: 'diecast', queueOrder: 24 },
  { brand: 'Hot Wheels', family: 'Car Culture', subcategory: 'diecast', queueOrder: 25 },
  { brand: 'Hot Wheels', family: 'Boulevard', subcategory: 'diecast', queueOrder: 26 },
  { brand: 'Hot Wheels', family: 'Team Transport', subcategory: 'diecast', queueOrder: 27 },
  { brand: 'Matchbox', family: 'Premium', subcategory: 'diecast', queueOrder: 28 },
  { brand: 'Hasbro', family: 'Transformers G1', subcategory: 'action_figure', queueOrder: 29 },
  { brand: 'Hasbro', family: 'Transformers Masterpiece', subcategory: 'action_figure', queueOrder: 30 },
  { brand: 'Hasbro', family: 'Star Wars Black Series', subcategory: 'action_figure', queueOrder: 31 },
  { brand: 'Hasbro', family: 'Marvel Legends', subcategory: 'action_figure', queueOrder: 32 },
  { brand: 'Hasbro', family: 'GI Joe Classified', subcategory: 'action_figure', queueOrder: 33 },
  { brand: 'Bandai', family: 'Gundam MG', subcategory: 'model_kit', queueOrder: 34 },
  { brand: 'Bandai', family: 'Gundam PG', subcategory: 'model_kit', queueOrder: 35 },
  { brand: 'Bandai', family: 'Gundam RG', subcategory: 'model_kit', queueOrder: 36 },
  { brand: 'Bandai', family: 'SH Figuarts', subcategory: 'action_figure', queueOrder: 37 },
  { brand: 'NECA', family: 'Ultimate', subcategory: 'action_figure', queueOrder: 38 },
  { brand: 'McFarlane', family: 'DC Multiverse', subcategory: 'action_figure', queueOrder: 39 },
  { brand: 'McFarlane', family: 'Spawn', subcategory: 'action_figure', queueOrder: 40 },
  { brand: 'Mezco', family: 'One:12 Collective', subcategory: 'action_figure', queueOrder: 41 },
  { brand: 'Super7', family: 'ULTIMATES', subcategory: 'action_figure', queueOrder: 42 },
  { brand: 'Squishmallow', family: 'Original', subcategory: 'plush', queueOrder: 43 },
  { brand: 'Squishmallow', family: 'Hugmees', subcategory: 'plush', queueOrder: 44 },
  { brand: 'Beanie Baby', family: 'Original', subcategory: 'plush', queueOrder: 45 },
  { brand: 'Pokemon', family: 'Build-A-Bear', subcategory: 'plush', queueOrder: 46 },
  { brand: 'Barbie', family: 'Signature', subcategory: 'doll', queueOrder: 47 },
  { brand: 'Barbie', family: 'Collector', subcategory: 'doll', queueOrder: 48 },
  { brand: 'American Girl', family: 'Historical', subcategory: 'doll', queueOrder: 49 },
  { brand: 'American Girl', family: 'Truly Me', subcategory: 'doll', queueOrder: 50 },
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

function getEbayCategoryId(subcategory: string): string | null {
  return null;
}

async function searchEbayToys(
  query: string,
  subcategory: string,
  offset: number = 0,
  limit: number = 50
): Promise<{ response: EbaySearchResponse | null; apiCalled: boolean }> {
  const accessToken = await getAccessToken('https://api.ebay.com/oauth/api_scope');
  
  if (!accessToken) {
    console.log('    eBay API credentials not configured');
    return { response: null, apiCalled: false };
  }

  const encodedQuery = encodeURIComponent(query);
  
  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?` +
    `q=${encodedQuery}` +
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

async function processToyItem(
  item: EbayItemSummary,
  familyId: number,
  brand: string,
  family: string,
  existingHashes: Set<string>
): Promise<{ stored: number; failed: number; duplicates: number }> {
  let stored = 0;
  let failed = 0;
  let duplicates = 0;
  
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
  
  for (const url of imageUrls.slice(0, MAX_IMAGES_PER_LISTING)) {
    try {
      const buffer = await downloadImage(url);
      const validation = await validateImage(buffer);
      
      if (!validation.valid || !validation.sha256 || !validation.buffer) {
        failed++;
        continue;
      }
      
      if (existingHashes.has(validation.sha256)) {
        duplicates++;
        continue;
      }
      
      const storageResult = await storeToyImage(
        validation.buffer,
        brand,
        family,
        familyId,
        validation.sha256
      );
      
      let embedding: number[] | null = null;
      try {
        const embeddingResult = await generateImageEmbedding(validation.buffer);
        embedding = embeddingResult.embedding;
      } catch (embError: any) {
        console.log(`    Embedding failed: ${embError.message}`);
      }
      
      await db.insert(toyImages).values({
        familyId,
        sha256: validation.sha256,
        storagePath: storageResult.storagePath,
        originalUrl: url,
        fileSize: validation.fileSize!,
        width: validation.width!,
        height: validation.height!,
        contentType: validation.contentType!,
        source: 'ebay',
      });
      
      if (embedding) {
        await db.execute(
          sql`UPDATE toy_images SET embedding = ${JSON.stringify(embedding)}::vector WHERE sha256 = ${validation.sha256}`
        );
      }
      
      existingHashes.add(validation.sha256);
      stored++;
      
    } catch (error: any) {
      failed++;
    }
  }
  
  return { stored, failed, duplicates };
}

async function seedToyFamily(
  familyRow: typeof toyFamilies.$inferSelect,
  existingHashes: Set<string>
): Promise<FamilySeederResult> {
  const result: FamilySeederResult = {
    brand: familyRow.brand,
    family: familyRow.family,
    subcategory: familyRow.subcategory || 'action_figure',
    imagesStored: 0,
    listingsScanned: 0,
    apiCalls: 0,
    duplicatesSkipped: 0,
    downloadFailed: 0,
    junkFiltered: 0,
    completed: false,
    status: 'active',
  };
  
  const currentImages = await db.select({ count: count() })
    .from(toyImages)
    .where(eq(toyImages.familyId, familyRow.id));
  
  let imageCount = currentImages[0]?.count || 0;
  
  if (imageCount >= IMAGES_TARGET_PER_FAMILY) {
    result.status = 'locked';
    result.completed = true;
    result.imagesStored = imageCount;
    return result;
  }
  
  console.log(`  Seeding: ${familyRow.displayName} (${familyRow.subcategory})`);
  console.log(`    Current images: ${imageCount}/${IMAGES_TARGET_PER_FAMILY}`);
  
  const query = `${familyRow.brand} ${familyRow.family}`;
  let offset = 0;
  
  while (imageCount < IMAGES_TARGET_PER_FAMILY && result.listingsScanned < MAX_LISTINGS_PER_FAMILY) {
    console.log(`    Processing 50 listings at offset ${offset}`);
    
    const { response, apiCalled } = await searchEbayToys(
      query,
      familyRow.subcategory || 'action_figure',
      offset,
      50
    );
    
    if (apiCalled) result.apiCalls++;
    
    if (!response?.itemSummaries || response.itemSummaries.length === 0) {
      console.log(`    No more results for this query`);
      break;
    }
    
    for (const item of response.itemSummaries) {
      if (imageCount >= IMAGES_TARGET_PER_FAMILY) break;
      
      result.listingsScanned++;
      
      if (isJunkTitle(item.title)) {
        result.junkFiltered++;
        continue;
      }
      
      const alreadyProcessed = await db.select()
        .from(processedToyItems)
        .where(eq(processedToyItems.ebayItemId, item.itemId))
        .limit(1);
      
      if (alreadyProcessed.length > 0) {
        result.duplicatesSkipped++;
        continue;
      }
      
      const itemResult = await processToyItem(
        item,
        familyRow.id,
        familyRow.brand,
        familyRow.family,
        existingHashes
      );
      
      await db.insert(processedToyItems).values({
        ebayItemId: item.itemId,
        familyId: familyRow.id,
        title: item.title,
        condition: item.condition,
        imageCount: itemResult.stored,
      }).onConflictDoNothing();
      
      result.imagesStored += itemResult.stored;
      result.duplicatesSkipped += itemResult.duplicates;
      result.downloadFailed += itemResult.failed;
      imageCount += itemResult.stored;
      
      if (itemResult.stored > 0) {
        console.log(`    + ${itemResult.stored} images (now ${imageCount}/${IMAGES_TARGET_PER_FAMILY})`);
      }
    }
    
    offset += 50;
    await delay(DELAY_BETWEEN_REQUESTS_MS);
  }
  
  await db.update(toyFamilies)
    .set({ listingsScanned: result.listingsScanned })
    .where(eq(toyFamilies.id, familyRow.id));
  
  if (imageCount >= IMAGES_TARGET_PER_FAMILY) {
    result.status = 'locked';
    result.completed = true;
    await db.update(toyFamilies)
      .set({ status: 'locked' })
      .where(eq(toyFamilies.id, familyRow.id));
    console.log(`  LOCKED: Reached ${IMAGES_TARGET_PER_FAMILY} images`);
  } else if (result.listingsScanned >= MAX_LISTINGS_PER_FAMILY) {
    result.status = 'hard';
    await db.update(toyFamilies)
      .set({ status: 'hard' })
      .where(eq(toyFamilies.id, familyRow.id));
    console.log(`  HARD STOP: Scanned ${MAX_LISTINGS_PER_FAMILY} listings but only got ${imageCount} images`);
  }
  
  console.log(`  RESULT: ${result.status.toUpperCase()}`);
  console.log(`  Images: ${imageCount}/${IMAGES_TARGET_PER_FAMILY}`);
  console.log(`  Listings scanned: ${result.listingsScanned}`);
  console.log(`  Junk filtered: ${result.junkFiltered}`);
  console.log(`  Duplicates: ${result.duplicatesSkipped}`);
  
  return result;
}

async function initializeToyFamilies(): Promise<void> {
  console.log('Initializing toy families...');
  
  for (const familyData of TOY_FAMILIES_DATA) {
    const existing = await db.select()
      .from(toyFamilies)
      .where(and(
        eq(toyFamilies.brand, familyData.brand),
        eq(toyFamilies.family, familyData.family)
      ));
    
    if (existing.length === 0) {
      await db.insert(toyFamilies).values({
        brand: familyData.brand,
        family: familyData.family,
        displayName: `${familyData.brand} ${familyData.family}`,
        subcategory: familyData.subcategory,
        queueOrder: familyData.queueOrder,
        status: 'queued',
      });
    }
  }
  
  const total = await db.select({ count: count() }).from(toyFamilies);
  console.log(`Toy families initialized: ${total[0]?.count || 0} total`);
}

export async function runToyImageSeeder(): Promise<void> {
  console.log('Starting Toy Image Seeder...');
  
  await initializeToyFamilies();
  
  const existingImages = await db.select({ sha256: toyImages.sha256 }).from(toyImages);
  const existingHashes = new Set(existingImages.map(img => img.sha256));
  console.log(`Loaded ${existingHashes.size} existing image hashes`);
  
  const activeFamilies = await db.select()
    .from(toyFamilies)
    .where(sql`${toyFamilies.status} IN ('queued', 'active')`)
    .orderBy(asc(toyFamilies.queueOrder))
    .limit(MAX_ACTIVE_FAMILIES);
  
  console.log(`Processing ${activeFamilies.length} active families`);
  
  for (const family of activeFamilies) {
    if (family.status === 'queued') {
      await db.update(toyFamilies)
        .set({ status: 'active' })
        .where(eq(toyFamilies.id, family.id));
    }
    
    const result = await seedToyFamily(family, existingHashes);
    
    if (result.status === 'locked' || result.status === 'hard') {
      const nextFamily = await db.select()
        .from(toyFamilies)
        .where(eq(toyFamilies.status, 'queued'))
        .orderBy(asc(toyFamilies.queueOrder))
        .limit(1);
      
      if (nextFamily.length > 0) {
        await db.update(toyFamilies)
          .set({ status: 'active' })
          .where(eq(toyFamilies.id, nextFamily[0].id));
        console.log(`  Activated next family: ${nextFamily[0].displayName}`);
      }
    }
    
    await delay(2000);
  }
  
  console.log('Toy Image Seeder completed');
}

export async function getToySeederReport(): Promise<ToySeedReport> {
  const allFamilies = await db.select().from(toyFamilies);
  
  const imageCounts = await db.select({
    familyId: toyImages.familyId,
    count: count(),
  })
    .from(toyImages)
    .groupBy(toyImages.familyId);
  
  const countMap = new Map<number, number>();
  for (const row of imageCounts) {
    countMap.set(row.familyId, row.count);
  }
  
  const lockedFamilies: ToySeedReport['lockedFamilies'] = [];
  const activeFamilies: ToySeedReport['activeFamilies'] = [];
  const queuedFamilies: ToySeedReport['queuedFamilies'] = [];
  const hardFamilies: ToySeedReport['hardFamilies'] = [];
  
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
      subcategory: family.subcategory || 'action_figure',
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
