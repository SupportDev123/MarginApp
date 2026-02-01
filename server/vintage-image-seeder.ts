import { db } from './db';
import { vintageFamilies, vintageImages } from '@shared/schema';
import { eq, sql, and, count, asc } from 'drizzle-orm';
import { downloadImage, validateImage, storeVintageImage } from './vintage-image-storage';
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
  'for parts', 'parts only', 'not working', 'broken', 'as is', 'as-is',
  'repair', 'needs repair', 'damaged',
  'lot', 'bundle', 'bulk', 'wholesale',
  'buttons only', 'zipper only', 'patch only',
  'pattern', 'sewing pattern', 'craft',
  'replacement', 'reproduction', 'replica', 'fake',
  'read description', 'see description', 'see photos',
  'stained', 'ripped', 'torn', 'holes',
  'costume', 'halloween', 'cosplay',
  'modern', 'new with tags', 'nwt', 'brand new',
];

const VINTAGE_FAMILIES = [
  // DENIM - Classic Jeans
  { brand: "Levi's", family: '501 Jeans', subcategory: 'denim', queueOrder: 1 },
  { brand: "Levi's", family: '505 Jeans', subcategory: 'denim', queueOrder: 2 },
  { brand: "Levi's", family: '517 Bootcut', subcategory: 'denim', queueOrder: 3 },
  { brand: "Levi's", family: '550 Relaxed', subcategory: 'denim', queueOrder: 4 },
  { brand: "Levi's", family: '560 Loose Fit', subcategory: 'denim', queueOrder: 5 },
  { brand: "Levi's", family: '501XX Selvedge', subcategory: 'denim', queueOrder: 6 },
  { brand: 'Lee', family: 'Storm Rider Jacket', subcategory: 'denim', queueOrder: 7 },
  { brand: 'Lee', family: 'Riders Jeans', subcategory: 'denim', queueOrder: 8 },
  { brand: 'Wrangler', family: '13MWZ Cowboy Cut', subcategory: 'denim', queueOrder: 9 },
  { brand: 'Wrangler', family: '936 Slim Fit', subcategory: 'denim', queueOrder: 10 },
  { brand: 'Carhartt', family: 'Double Knee Pants', subcategory: 'denim', queueOrder: 11 },
  { brand: 'Carhartt', family: 'Duck Canvas Pants', subcategory: 'denim', queueOrder: 12 },
  { brand: 'Dickies', family: '874 Work Pants', subcategory: 'denim', queueOrder: 13 },
  { brand: 'Dickies', family: 'Double Knee Work Pants', subcategory: 'denim', queueOrder: 14 },

  // BAND_TEES - Rock & Metal
  { brand: 'Vintage', family: '70s Band Tee', subcategory: 'band_tees', queueOrder: 15 },
  { brand: 'Vintage', family: '80s Band Tee', subcategory: 'band_tees', queueOrder: 16 },
  { brand: 'Vintage', family: '90s Band Tee', subcategory: 'band_tees', queueOrder: 17 },
  { brand: 'Vintage', family: 'Concert Tour Tee', subcategory: 'band_tees', queueOrder: 18 },
  { brand: 'Vintage', family: 'Metal Band Tee', subcategory: 'band_tees', queueOrder: 19 },
  { brand: 'Vintage', family: 'Punk Band Tee', subcategory: 'band_tees', queueOrder: 20 },
  { brand: 'Vintage', family: 'Rap Tee', subcategory: 'band_tees', queueOrder: 21 },
  { brand: 'Vintage', family: 'Hip Hop Tee', subcategory: 'band_tees', queueOrder: 22 },
  { brand: 'Vintage', family: 'Grateful Dead Tee', subcategory: 'band_tees', queueOrder: 23 },
  { brand: 'Vintage', family: 'Rolling Stones Tee', subcategory: 'band_tees', queueOrder: 24 },
  { brand: 'Vintage', family: 'Nirvana Tee', subcategory: 'band_tees', queueOrder: 25 },
  { brand: 'Vintage', family: 'Metallica Tee', subcategory: 'band_tees', queueOrder: 26 },

  // SPORTSWEAR - Athletic Brands
  { brand: 'Champion', family: 'Reverse Weave Hoodie', subcategory: 'sportswear', queueOrder: 27 },
  { brand: 'Champion', family: 'Reverse Weave Crewneck', subcategory: 'sportswear', queueOrder: 28 },
  { brand: 'Nike', family: 'Vintage Swoosh Tee', subcategory: 'sportswear', queueOrder: 29 },
  { brand: 'Nike', family: 'Grey Tag Sweatshirt', subcategory: 'sportswear', queueOrder: 30 },
  { brand: 'Nike', family: 'Windbreaker Jacket', subcategory: 'sportswear', queueOrder: 31 },
  { brand: 'Nike', family: 'ACG Jacket', subcategory: 'sportswear', queueOrder: 32 },
  { brand: 'Adidas', family: 'Trefoil Logo Tee', subcategory: 'sportswear', queueOrder: 33 },
  { brand: 'Adidas', family: 'Track Jacket', subcategory: 'sportswear', queueOrder: 34 },
  { brand: 'Adidas', family: 'Windbreaker', subcategory: 'sportswear', queueOrder: 35 },
  { brand: 'Russell Athletic', family: 'Vintage Sweatshirt', subcategory: 'sportswear', queueOrder: 36 },
  { brand: 'Russell Athletic', family: 'Pro Cotton Tee', subcategory: 'sportswear', queueOrder: 37 },
  { brand: 'Starter', family: 'Satin Jacket', subcategory: 'sportswear', queueOrder: 38 },
  { brand: 'Starter', family: 'Pullover Jacket', subcategory: 'sportswear', queueOrder: 39 },
  { brand: 'Reebok', family: 'Vintage Windbreaker', subcategory: 'sportswear', queueOrder: 40 },
  { brand: 'Fila', family: 'Vintage Track Jacket', subcategory: 'sportswear', queueOrder: 41 },

  // OUTERWEAR - Jackets & Coats
  { brand: 'Carhartt', family: 'Detroit Jacket', subcategory: 'outerwear', queueOrder: 42 },
  { brand: 'Carhartt', family: 'Chore Coat', subcategory: 'outerwear', queueOrder: 43 },
  { brand: 'Carhartt', family: 'Arctic Jacket', subcategory: 'outerwear', queueOrder: 44 },
  { brand: 'Carhartt', family: 'Santa Fe Jacket', subcategory: 'outerwear', queueOrder: 45 },
  { brand: 'Pendleton', family: 'Wool Shirt Jacket', subcategory: 'outerwear', queueOrder: 46 },
  { brand: 'Pendleton', family: 'Board Shirt', subcategory: 'outerwear', queueOrder: 47 },
  { brand: 'Patagonia', family: 'Retro X Fleece', subcategory: 'outerwear', queueOrder: 48 },
  { brand: 'Patagonia', family: 'Synchilla Fleece', subcategory: 'outerwear', queueOrder: 49 },
  { brand: 'Patagonia', family: 'Snap-T Pullover', subcategory: 'outerwear', queueOrder: 50 },
  { brand: 'The North Face', family: 'Nuptse Puffer', subcategory: 'outerwear', queueOrder: 51 },
  { brand: 'The North Face', family: 'Denali Fleece', subcategory: 'outerwear', queueOrder: 52 },
  { brand: 'The North Face', family: 'Gore-Tex Jacket', subcategory: 'outerwear', queueOrder: 53 },
  { brand: 'Columbia', family: 'Bugaboo Jacket', subcategory: 'outerwear', queueOrder: 54 },
  { brand: 'LL Bean', family: 'Barn Coat', subcategory: 'outerwear', queueOrder: 55 },

  // DESIGNER - Premium Vintage
  { brand: 'Burberry', family: 'Trench Coat', subcategory: 'designer', queueOrder: 56 },
  { brand: 'Burberry', family: 'Nova Check Shirt', subcategory: 'designer', queueOrder: 57 },
  { brand: 'Ralph Lauren', family: 'Polo Bear Sweater', subcategory: 'designer', queueOrder: 58 },
  { brand: 'Ralph Lauren', family: 'Polo Sport Jacket', subcategory: 'designer', queueOrder: 59 },
  { brand: 'Ralph Lauren', family: 'Chaps Denim Jacket', subcategory: 'designer', queueOrder: 60 },
  { brand: 'Tommy Hilfiger', family: 'Big Flag Sweater', subcategory: 'designer', queueOrder: 61 },
  { brand: 'Tommy Hilfiger', family: 'Colorblock Jacket', subcategory: 'designer', queueOrder: 62 },
  { brand: 'Tommy Hilfiger', family: 'Sailing Jacket', subcategory: 'designer', queueOrder: 63 },
  { brand: 'FUBU', family: 'Jersey', subcategory: 'designer', queueOrder: 64 },
  { brand: 'FUBU', family: 'Denim Jacket', subcategory: 'designer', queueOrder: 65 },
  { brand: 'Karl Kani', family: 'Denim Set', subcategory: 'designer', queueOrder: 66 },
  { brand: 'Karl Kani', family: 'Jersey', subcategory: 'designer', queueOrder: 67 },
  { brand: 'Cross Colours', family: 'Denim Jacket', subcategory: 'designer', queueOrder: 68 },
  { brand: 'Cross Colours', family: 'Color Block Tee', subcategory: 'designer', queueOrder: 69 },
  { brand: 'Nautica', family: 'Sailing Jacket', subcategory: 'designer', queueOrder: 70 },
  { brand: 'Guess', family: 'Denim Jacket', subcategory: 'designer', queueOrder: 71 },
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

async function searchEbayVintage(
  query: string,
  offset: number = 0,
  limit: number = 50
): Promise<{ response: EbaySearchResponse | null; apiCalled: boolean }> {
  const accessToken = await getAccessToken('https://api.ebay.com/oauth/api_scope');
  
  if (!accessToken) {
    console.log('    eBay API credentials not configured');
    return { response: null, apiCalled: false };
  }

  const categoryId = '11450';
  const encodedQuery = encodeURIComponent(`vintage ${query}`);
  
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

async function processVintageItem(
  item: EbayItemSummary,
  familyId: number,
  brand: string,
  family: string,
  existingSha256s: Set<string>,
  failureReasons: Map<string, number>
): Promise<{ stored: number; duplicates: number; failed: number }> {
  const result = { stored: 0, duplicates: 0, failed: 0 };
  
  const existingItem = await db.execute(sql`
    SELECT 1 FROM processed_vintage_items WHERE ebay_item_id = ${item.itemId} LIMIT 1
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
      if (img.imageUrl) imageUrls.push(img.imageUrl);
    }
  }

  for (const url of imageUrls.slice(0, MAX_IMAGES_PER_LISTING)) {
    try {
      const buffer = await downloadImage(url);
      const validation = await validateImage(buffer);
      
      if (!validation.valid) {
        const reason = validation.error || 'Unknown validation error';
        failureReasons.set(reason, (failureReasons.get(reason) || 0) + 1);
        result.failed++;
        continue;
      }

      if (existingSha256s.has(validation.sha256!)) {
        result.duplicates++;
        continue;
      }

      const stored = await storeVintageImage(
        validation.buffer!,
        validation.sha256!,
        brand,
        family,
        familyId
      );

      let embedding: number[] | null = null;
      try {
        const embeddingResult = await generateImageEmbedding(validation.buffer!);
        embedding = embeddingResult.embedding;
      } catch (embErr: any) {
        console.log(`    Embedding error: ${embErr.message}`);
      }

      await db.insert(vintageImages).values({
        familyId,
        sha256: stored.sha256,
        storagePath: stored.storagePath,
        originalUrl: url,
        fileSize: stored.fileSize,
        width: stored.width,
        height: stored.height,
        contentType: stored.contentType,
        source: 'ebay',
      });

      if (embedding) {
        await db.execute(sql`
          UPDATE vintage_images 
          SET embedding = ${JSON.stringify(embedding)}::vector 
          WHERE sha256 = ${stored.sha256}
        `);
      }

      existingSha256s.add(validation.sha256!);
      result.stored++;

    } catch (error: any) {
      const reason = error.message || 'Unknown error';
      failureReasons.set(reason, (failureReasons.get(reason) || 0) + 1);
      result.failed++;
    }
  }

  await db.execute(sql`
    INSERT INTO processed_vintage_items (ebay_item_id, family_id, title, condition, image_count)
    VALUES (${item.itemId}, ${familyId}, ${item.title}, ${item.condition || null}, ${result.stored})
    ON CONFLICT (ebay_item_id) DO NOTHING
  `);

  return result;
}

async function seedSingleVintageFamily(
  family: typeof vintageFamilies.$inferSelect,
  failureReasons: Map<string, number>
): Promise<FamilySeederResult> {
  const { id: familyId, brand, family: familyName, subcategory, listingsScanned: previouslyScanned } = family;
  
  const result: FamilySeederResult = {
    brand,
    family: familyName,
    subcategory,
    imagesStored: 0,
    listingsScanned: previouslyScanned,
    apiCalls: 0,
    duplicatesSkipped: 0,
    downloadFailed: 0,
    junkFiltered: 0,
    completed: false,
    status: 'active',
  };

  const imageCountResult = await db
    .select({ count: count() })
    .from(vintageImages)
    .where(eq(vintageImages.familyId, familyId));
  
  let currentImageCount = Number(imageCountResult[0]?.count || 0);

  if (currentImageCount >= IMAGES_TARGET_PER_FAMILY) {
    await db.update(vintageFamilies)
      .set({ status: 'locked', updatedAt: new Date() })
      .where(eq(vintageFamilies.id, familyId));
    
    console.log(`  [${brand} ${familyName}] Already complete: ${currentImageCount}/${IMAGES_TARGET_PER_FAMILY} images`);
    result.completed = true;
    result.status = 'locked';
    return result;
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`SEEDING VINTAGE: ${brand} ${familyName}`);
  console.log(`Current: ${currentImageCount}/${IMAGES_TARGET_PER_FAMILY} images`);
  console.log(`Listings scanned so far: ${result.listingsScanned}/${MAX_LISTINGS_PER_FAMILY}`);
  console.log(`${'─'.repeat(50)}`);

  const existingSha256s = new Set<string>();
  const existingImages = await db
    .select({ sha256: vintageImages.sha256 })
    .from(vintageImages)
    .where(eq(vintageImages.familyId, familyId));
  existingImages.forEach(img => existingSha256s.add(img.sha256));

  const searchTerms = [
    `${brand} ${familyName}`,
    `${brand} ${familyName} vintage`,
    `${brand} ${familyName} 90s`,
  ];

  for (const query of searchTerms) {
    if (currentImageCount >= IMAGES_TARGET_PER_FAMILY) break;
    if (result.listingsScanned >= MAX_LISTINGS_PER_FAMILY) break;

    console.log(`  Query: "${query}"`);
    let offset = 0;
    let consecutiveEmptyPages = 0;

    while (currentImageCount < IMAGES_TARGET_PER_FAMILY && result.listingsScanned < MAX_LISTINGS_PER_FAMILY) {
      const { response: searchResult, apiCalled } = await searchEbayVintage(query, offset, 50);
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
        if (result.listingsScanned >= MAX_LISTINGS_PER_FAMILY) break;

        result.listingsScanned++;
        
        if (isJunkTitle(item.title)) {
          result.junkFiltered++;
          continue;
        }

        const itemResult = await processVintageItem(item, familyId, brand, familyName, existingSha256s, failureReasons);
        
        result.imagesStored += itemResult.stored;
        result.duplicatesSkipped += itemResult.duplicates;
        result.downloadFailed += itemResult.failed;
        currentImageCount += itemResult.stored;

        if (itemResult.stored > 0) {
          console.log(`    + ${itemResult.stored} images (now ${currentImageCount}/${IMAGES_TARGET_PER_FAMILY})`);
        }
      }

      await db.update(vintageFamilies)
        .set({ listingsScanned: result.listingsScanned, updatedAt: new Date() })
        .where(eq(vintageFamilies.id, familyId));

      offset += searchResult.itemSummaries.length;
      await delay(DELAY_BETWEEN_REQUESTS_MS);

      if (!searchResult.next) break;
    }
  }

  if (currentImageCount >= IMAGES_TARGET_PER_FAMILY) {
    result.completed = true;
    result.status = 'locked';
    console.log(`  LOCKED: Reached ${IMAGES_TARGET_PER_FAMILY} images`);
  } else if (result.listingsScanned >= MAX_LISTINGS_PER_FAMILY) {
    result.status = 'hard';
    console.log(`  HARD STOP: Scanned ${MAX_LISTINGS_PER_FAMILY} listings but only got ${currentImageCount} images`);
  } else {
    result.status = 'active';
  }
  
  await db.update(vintageFamilies)
    .set({ 
      status: result.status, 
      listingsScanned: result.listingsScanned,
      updatedAt: new Date() 
    })
    .where(eq(vintageFamilies.id, familyId));

  console.log(`\n  RESULT: ${result.status.toUpperCase()}`);
  console.log(`  Images: ${currentImageCount}/${IMAGES_TARGET_PER_FAMILY}`);
  console.log(`  Listings scanned: ${result.listingsScanned}`);
  console.log(`  Junk filtered: ${result.junkFiltered}`);
  console.log(`  Duplicates: ${result.duplicatesSkipped}`);

  return result;
}

export async function initializeVintageFamilies(): Promise<void> {
  console.log('Initializing vintage clothing families...');
  
  for (const family of VINTAGE_FAMILIES) {
    const existing = await db
      .select()
      .from(vintageFamilies)
      .where(and(
        eq(vintageFamilies.brand, family.brand),
        eq(vintageFamilies.family, family.family)
      ))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(vintageFamilies).values({
        brand: family.brand,
        family: family.family,
        displayName: `${family.brand} ${family.family}`,
        subcategory: family.subcategory,
        queueOrder: family.queueOrder,
        status: family.queueOrder <= MAX_ACTIVE_FAMILIES ? 'active' : 'queued',
      });
      console.log(`  Created: ${family.brand} ${family.family}`);
    }
  }
  
  console.log(`Vintage families initialized: ${VINTAGE_FAMILIES.length} total`);
}

export async function runVintageImageSeeder(): Promise<SeederStats> {
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

  await initializeVintageFamilies();

  console.log('='.repeat(60));
  console.log('VINTAGE CLOTHING IMAGE SEEDER v1.0 - FILL-FIRST MODE');
  console.log('='.repeat(60));
  console.log(`Target: ${IMAGES_TARGET_PER_FAMILY} images per family`);
  console.log(`Max active families: ${MAX_ACTIVE_FAMILIES}`);
  console.log(`Max listings per family: ${MAX_LISTINGS_PER_FAMILY}`);
  console.log(`Max images per listing: ${MAX_IMAGES_PER_LISTING}`);
  console.log(`Title filtering: ENABLED`);
  console.log('='.repeat(60));

  while (true) {
    const activeFamilies = await db
      .select()
      .from(vintageFamilies)
      .where(eq(vintageFamilies.status, 'active'))
      .orderBy(asc(vintageFamilies.queueOrder));

    if (activeFamilies.length === 0) {
      const queuedFamilies = await db
        .select()
        .from(vintageFamilies)
        .where(eq(vintageFamilies.status, 'queued'))
        .orderBy(asc(vintageFamilies.queueOrder))
        .limit(MAX_ACTIVE_FAMILIES);

      if (queuedFamilies.length === 0) {
        console.log('\nNo more families to process.');
        break;
      }

      for (const family of queuedFamilies) {
        await db.update(vintageFamilies)
          .set({ status: 'active', updatedAt: new Date() })
          .where(eq(vintageFamilies.id, family.id));
      }

      console.log(`\nActivated ${queuedFamilies.length} new families from queue.`);
      continue;
    }

    const family = activeFamilies[0];
    console.log(`\nProcessing: ${family.brand} ${family.family} (queue order: ${family.queueOrder})`);

    const result = await seedSingleVintageFamily(family, stats.failureReasons);
    
    stats.totalApiCalls += result.apiCalls;
    stats.totalImagesStored += result.imagesStored;
    stats.totalDownloadFailed += result.downloadFailed;
    stats.totalDownloadSuccess += result.imagesStored;

    if (result.status === 'locked') {
      stats.lockedFamilies.push(result);
      
      const nextQueued = await db
        .select()
        .from(vintageFamilies)
        .where(eq(vintageFamilies.status, 'queued'))
        .orderBy(asc(vintageFamilies.queueOrder))
        .limit(1);

      if (nextQueued.length > 0) {
        await db.update(vintageFamilies)
          .set({ status: 'active', updatedAt: new Date() })
          .where(eq(vintageFamilies.id, nextQueued[0].id));
        console.log(`  Activated next family: ${nextQueued[0].brand} ${nextQueued[0].family}`);
      }
    } else if (result.status === 'hard') {
      stats.hardFamilies.push(result);
      
      const nextQueued = await db
        .select()
        .from(vintageFamilies)
        .where(eq(vintageFamilies.status, 'queued'))
        .orderBy(asc(vintageFamilies.queueOrder))
        .limit(1);

      if (nextQueued.length > 0) {
        await db.update(vintageFamilies)
          .set({ status: 'active', updatedAt: new Date() })
          .where(eq(vintageFamilies.id, nextQueued[0].id));
        console.log(`  Activated next family: ${nextQueued[0].brand} ${nextQueued[0].family}`);
      }
    } else {
      stats.activeFamilies.push(result);
    }

    await delay(2000);
  }

  const remainingQueued = await db
    .select({ brand: vintageFamilies.brand, family: vintageFamilies.family, subcategory: vintageFamilies.subcategory })
    .from(vintageFamilies)
    .where(eq(vintageFamilies.status, 'queued'))
    .orderBy(asc(vintageFamilies.queueOrder));
  
  stats.queuedFamilies = remainingQueued;

  printSeederReport(stats);
  
  return stats;
}

function printSeederReport(stats: SeederStats): void {
  console.log('\n' + '='.repeat(60));
  console.log('VINTAGE SEEDER REPORT');
  console.log('='.repeat(60));
  
  console.log('\nA) LOCKED FAMILIES:');
  console.log('-'.repeat(50));
  if (stats.lockedFamilies.length === 0) {
    console.log('  (none)');
  } else {
    console.log('  family_name | image_count | status');
    for (const f of stats.lockedFamilies) {
      console.log(`  ${f.brand} ${f.family} | ${f.imagesStored} | LOCKED`);
    }
  }

  console.log('\nB) ACTIVE / QUEUED FAMILIES:');
  console.log('-'.repeat(50));
  console.log('  family_name | image_count | status');
  for (const f of stats.activeFamilies) {
    console.log(`  ${f.brand} ${f.family} | ${f.imagesStored} | ACTIVE`);
  }
  for (const f of stats.queuedFamilies) {
    console.log(`  ${f.brand} ${f.family} | 0 | QUEUED`);
  }

  console.log('\nC) HARD FAMILIES (if any):');
  console.log('-'.repeat(50));
  if (stats.hardFamilies.length === 0) {
    console.log('  (none)');
  } else {
    console.log('  family_name | image_count | listings_scanned');
    for (const f of stats.hardFamilies) {
      console.log(`  ${f.brand} ${f.family} | ${f.imagesStored} | ${f.listingsScanned}`);
    }
  }

  console.log('\nD) GLOBAL STATS:');
  console.log('-'.repeat(50));
  console.log(`  Total API calls: ${stats.totalApiCalls}`);
  console.log(`  Total images stored: ${stats.totalImagesStored}`);
  console.log(`  Total download failures: ${stats.totalDownloadFailed}`);
  
  if (stats.failureReasons.size > 0) {
    console.log('\nE) TOP FAILURE REASONS:');
    console.log('-'.repeat(50));
    const sorted = Array.from(stats.failureReasons.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    for (const [reason, count] of sorted) {
      console.log(`  ${count}x: ${reason.substring(0, 60)}`);
    }
  }

  console.log('\n' + '='.repeat(60));
}

export interface VintageSeedReport {
  timestamp: string;
  totalFamilies: number;
  lockedCount: number;
  activeCount: number;
  hardCount: number;
  queuedCount: number;
  totalImages: number;
  globalStats: {
    apiCalls: number;
    imagesStored: number;
    downloadFailed: number;
    topFailureReasons: Array<{ reason: string; count: number }>;
  };
}

export function generateVintageSeedReport(stats: SeederStats): VintageSeedReport {
  const topReasons = Array.from(stats.failureReasons.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));

  return {
    timestamp: new Date().toISOString(),
    totalFamilies: VINTAGE_FAMILIES.length,
    lockedCount: stats.lockedFamilies.length,
    activeCount: stats.activeFamilies.length,
    hardCount: stats.hardFamilies.length,
    queuedCount: stats.queuedFamilies.length,
    totalImages: stats.totalImagesStored,
    globalStats: {
      apiCalls: stats.totalApiCalls,
      imagesStored: stats.totalImagesStored,
      downloadFailed: stats.totalDownloadFailed,
      topFailureReasons: topReasons,
    },
  };
}
