import { db } from './db';
import { electronicsFamilies, electronicsImages, ElectronicsSeedReport } from '@shared/schema';
import { eq, sql, and, count, asc } from 'drizzle-orm';
import { downloadImage, validateImage, storeElectronicsImage } from './electronics-image-storage';
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
  'repair', 'needs repair',
  'lot', 'bundle', 'bulk',
  'case only', 'bag only', 'box only', 'empty',
  'battery only', 'charger only',
  'manual only', 'instructions',
  'replacement', 'aftermarket',
  'read description', 'see description',
  'cracked screen', 'water damage', 'locked',
  'icloud locked', 'activation locked', 'blacklisted',
  'demo unit', 'display model', 'dummy',
  'replica', 'fake', 'counterfeit', 'knockoff'
];

const ELECTRONICS_FAMILIES = [
  // AUDIO - Headphones and Earbuds
  { brand: 'Apple', family: 'AirPods Pro 2nd Gen', subcategory: 'audio', queueOrder: 1 },
  { brand: 'Apple', family: 'AirPods Pro 1st Gen', subcategory: 'audio', queueOrder: 2 },
  { brand: 'Apple', family: 'AirPods Max', subcategory: 'audio', queueOrder: 3 },
  { brand: 'Apple', family: 'AirPods 3rd Gen', subcategory: 'audio', queueOrder: 4 },
  { brand: 'Apple', family: 'AirPods 2nd Gen', subcategory: 'audio', queueOrder: 5 },
  { brand: 'Sony', family: 'WH-1000XM5', subcategory: 'audio', queueOrder: 6 },
  { brand: 'Sony', family: 'WH-1000XM4', subcategory: 'audio', queueOrder: 7 },
  { brand: 'Sony', family: 'WF-1000XM5', subcategory: 'audio', queueOrder: 8 },
  { brand: 'Sony', family: 'WF-1000XM4', subcategory: 'audio', queueOrder: 9 },
  { brand: 'Bose', family: 'QuietComfort Ultra', subcategory: 'audio', queueOrder: 10 },
  { brand: 'Bose', family: 'QuietComfort 45', subcategory: 'audio', queueOrder: 11 },
  { brand: 'Bose', family: 'SoundLink Flex', subcategory: 'audio', queueOrder: 12 },
  { brand: 'Bose', family: 'SoundLink Mini', subcategory: 'audio', queueOrder: 13 },
  { brand: 'Beats', family: 'Studio Pro', subcategory: 'audio', queueOrder: 14 },
  { brand: 'Beats', family: 'Fit Pro', subcategory: 'audio', queueOrder: 15 },
  { brand: 'JBL', family: 'Flip 6', subcategory: 'audio', queueOrder: 16 },
  { brand: 'JBL', family: 'Charge 5', subcategory: 'audio', queueOrder: 17 },
  { brand: 'Marshall', family: 'Stanmore III', subcategory: 'audio', queueOrder: 18 },
  { brand: 'Marshall', family: 'Emberton II', subcategory: 'audio', queueOrder: 19 },
  // SteelSeries Gaming Audio
  { brand: 'SteelSeries', family: 'Arctis Nova Pro', subcategory: 'audio', queueOrder: 201 },
  { brand: 'SteelSeries', family: 'Arctis Nova 7', subcategory: 'audio', queueOrder: 202 },
  { brand: 'SteelSeries', family: 'Arctis 7+', subcategory: 'audio', queueOrder: 203 },
  { brand: 'SteelSeries', family: 'Arctis Prime', subcategory: 'audio', queueOrder: 204 },
  { brand: 'SteelSeries', family: 'Flux Earbuds', subcategory: 'audio', queueOrder: 205 },
  // Razer Gaming Audio
  { brand: 'Razer', family: 'BlackShark V2 Pro', subcategory: 'audio', queueOrder: 206 },
  { brand: 'Razer', family: 'Kraken V3', subcategory: 'audio', queueOrder: 207 },
  { brand: 'Razer', family: 'Hammerhead True Wireless', subcategory: 'audio', queueOrder: 208 },
  // Logitech Gaming Audio
  { brand: 'Logitech', family: 'G Pro X', subcategory: 'audio', queueOrder: 209 },
  { brand: 'Logitech', family: 'G733 Lightspeed', subcategory: 'audio', queueOrder: 210 },
  // HyperX Gaming Audio
  { brand: 'HyperX', family: 'Cloud III', subcategory: 'audio', queueOrder: 211 },
  { brand: 'HyperX', family: 'Cloud Alpha', subcategory: 'audio', queueOrder: 212 },
  // Samsung Earbuds
  { brand: 'Samsung', family: 'Galaxy Buds3 Pro', subcategory: 'audio', queueOrder: 213 },
  { brand: 'Samsung', family: 'Galaxy Buds2 Pro', subcategory: 'audio', queueOrder: 214 },
  { brand: 'Samsung', family: 'Galaxy Buds FE', subcategory: 'audio', queueOrder: 215 },

  // PHONES - iPhones
  { brand: 'Apple', family: 'iPhone 15 Pro Max', subcategory: 'phones', queueOrder: 20 },
  { brand: 'Apple', family: 'iPhone 15 Pro', subcategory: 'phones', queueOrder: 21 },
  { brand: 'Apple', family: 'iPhone 15 Plus', subcategory: 'phones', queueOrder: 22 },
  { brand: 'Apple', family: 'iPhone 15', subcategory: 'phones', queueOrder: 23 },
  { brand: 'Apple', family: 'iPhone 14 Pro Max', subcategory: 'phones', queueOrder: 24 },
  { brand: 'Apple', family: 'iPhone 14 Pro', subcategory: 'phones', queueOrder: 25 },
  { brand: 'Apple', family: 'iPhone 14', subcategory: 'phones', queueOrder: 26 },
  { brand: 'Apple', family: 'iPhone 13 Pro Max', subcategory: 'phones', queueOrder: 27 },
  { brand: 'Apple', family: 'iPhone 13 Pro', subcategory: 'phones', queueOrder: 28 },
  { brand: 'Apple', family: 'iPhone 13', subcategory: 'phones', queueOrder: 29 },
  // PHONES - Samsung
  { brand: 'Samsung', family: 'Galaxy S24 Ultra', subcategory: 'phones', queueOrder: 30 },
  { brand: 'Samsung', family: 'Galaxy S24 Plus', subcategory: 'phones', queueOrder: 31 },
  { brand: 'Samsung', family: 'Galaxy S24', subcategory: 'phones', queueOrder: 32 },
  { brand: 'Samsung', family: 'Galaxy Z Fold 5', subcategory: 'phones', queueOrder: 33 },
  { brand: 'Samsung', family: 'Galaxy Z Flip 5', subcategory: 'phones', queueOrder: 34 },
  { brand: 'Samsung', family: 'Galaxy S23 Ultra', subcategory: 'phones', queueOrder: 35 },
  // PHONES - Google
  { brand: 'Google', family: 'Pixel 8 Pro', subcategory: 'phones', queueOrder: 36 },
  { brand: 'Google', family: 'Pixel 8', subcategory: 'phones', queueOrder: 37 },
  { brand: 'Google', family: 'Pixel 7 Pro', subcategory: 'phones', queueOrder: 38 },

  // TABLETS - iPads
  { brand: 'Apple', family: 'iPad Pro 12.9 M2', subcategory: 'tablets', queueOrder: 39 },
  { brand: 'Apple', family: 'iPad Pro 11 M2', subcategory: 'tablets', queueOrder: 40 },
  { brand: 'Apple', family: 'iPad Air 5th Gen', subcategory: 'tablets', queueOrder: 41 },
  { brand: 'Apple', family: 'iPad 10th Gen', subcategory: 'tablets', queueOrder: 42 },
  { brand: 'Apple', family: 'iPad Mini 6th Gen', subcategory: 'tablets', queueOrder: 43 },
  // TABLETS - Samsung
  { brand: 'Samsung', family: 'Galaxy Tab S9 Ultra', subcategory: 'tablets', queueOrder: 44 },
  { brand: 'Samsung', family: 'Galaxy Tab S9 Plus', subcategory: 'tablets', queueOrder: 45 },
  { brand: 'Samsung', family: 'Galaxy Tab S9', subcategory: 'tablets', queueOrder: 46 },
  // TABLETS - Microsoft
  { brand: 'Microsoft', family: 'Surface Pro 9', subcategory: 'tablets', queueOrder: 47 },
  { brand: 'Microsoft', family: 'Surface Go 3', subcategory: 'tablets', queueOrder: 48 },

  // WEARABLES - Apple Watch
  { brand: 'Apple', family: 'Apple Watch Ultra 2', subcategory: 'wearables', queueOrder: 49 },
  { brand: 'Apple', family: 'Apple Watch Ultra', subcategory: 'wearables', queueOrder: 50 },
  { brand: 'Apple', family: 'Apple Watch Series 9', subcategory: 'wearables', queueOrder: 51 },
  { brand: 'Apple', family: 'Apple Watch Series 8', subcategory: 'wearables', queueOrder: 52 },
  { brand: 'Apple', family: 'Apple Watch SE 2nd Gen', subcategory: 'wearables', queueOrder: 53 },
  // WEARABLES - Samsung
  { brand: 'Samsung', family: 'Galaxy Watch 6 Classic', subcategory: 'wearables', queueOrder: 54 },
  { brand: 'Samsung', family: 'Galaxy Watch 6', subcategory: 'wearables', queueOrder: 55 },
  // WEARABLES - Garmin
  { brand: 'Garmin', family: 'Fenix 7X', subcategory: 'wearables', queueOrder: 56 },
  { brand: 'Garmin', family: 'Fenix 7', subcategory: 'wearables', queueOrder: 57 },
  { brand: 'Garmin', family: 'Forerunner 965', subcategory: 'wearables', queueOrder: 58 },
  // WEARABLES - Fitbit
  { brand: 'Fitbit', family: 'Sense 2', subcategory: 'wearables', queueOrder: 59 },
  { brand: 'Fitbit', family: 'Versa 4', subcategory: 'wearables', queueOrder: 60 },

  // PERIPHERALS - Keyboards
  { brand: 'Apple', family: 'Magic Keyboard', subcategory: 'peripherals', queueOrder: 61 },
  { brand: 'Apple', family: 'Magic Keyboard with Touch ID', subcategory: 'peripherals', queueOrder: 62 },
  { brand: 'Logitech', family: 'MX Keys S', subcategory: 'peripherals', queueOrder: 63 },
  // PERIPHERALS - Mice
  { brand: 'Apple', family: 'Magic Mouse', subcategory: 'peripherals', queueOrder: 64 },
  { brand: 'Apple', family: 'Magic Trackpad', subcategory: 'peripherals', queueOrder: 65 },
  { brand: 'Logitech', family: 'MX Master 3S', subcategory: 'peripherals', queueOrder: 66 },
  { brand: 'Logitech', family: 'MX Anywhere 3S', subcategory: 'peripherals', queueOrder: 67 },
  { brand: 'Razer', family: 'DeathAdder V3', subcategory: 'peripherals', queueOrder: 68 },
  { brand: 'Razer', family: 'Viper V2 Pro', subcategory: 'peripherals', queueOrder: 69 },
  // PERIPHERALS - Gaming Headsets
  { brand: 'SteelSeries', family: 'Arctis Nova Pro', subcategory: 'peripherals', queueOrder: 70 },
  { brand: 'SteelSeries', family: 'Arctis Nova 7', subcategory: 'peripherals', queueOrder: 71 },
  { brand: 'Razer', family: 'BlackShark V2 Pro', subcategory: 'peripherals', queueOrder: 72 },
  { brand: 'HyperX', family: 'Cloud III', subcategory: 'peripherals', queueOrder: 73 },
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

function getCategoryIdForSubcategory(subcategory: string): string {
  switch (subcategory) {
    case 'phones':
      return '9355';
    case 'tablets':
    case 'audio':
    case 'wearables':
    case 'peripherals':
    default:
      return '15032';
  }
}

async function searchEbayElectronics(
  query: string,
  categoryId: string,
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

async function processElectronicsItem(
  item: EbayItemSummary,
  familyId: number,
  brand: string,
  family: string,
  existingSha256s: Set<string>,
  failureReasons: Map<string, number>
): Promise<{ stored: number; duplicates: number; failed: number }> {
  const result = { stored: 0, duplicates: 0, failed: 0 };
  
  const existingItem = await db.execute(sql`
    SELECT 1 FROM processed_electronics_items WHERE ebay_item_id = ${item.itemId} LIMIT 1
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

      const stored = await storeElectronicsImage(
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

      await db.insert(electronicsImages).values({
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
          UPDATE electronics_images 
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
    INSERT INTO processed_electronics_items (ebay_item_id, family_id, title, condition, image_count)
    VALUES (${item.itemId}, ${familyId}, ${item.title}, ${item.condition || null}, ${result.stored})
    ON CONFLICT (ebay_item_id) DO NOTHING
  `);

  return result;
}

async function seedSingleElectronicsFamily(
  family: typeof electronicsFamilies.$inferSelect,
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
    .from(electronicsImages)
    .where(eq(electronicsImages.familyId, familyId));
  
  let currentImageCount = Number(imageCountResult[0]?.count || 0);

  if (currentImageCount >= IMAGES_TARGET_PER_FAMILY) {
    await db.update(electronicsFamilies)
      .set({ status: 'locked', updatedAt: new Date() })
      .where(eq(electronicsFamilies.id, familyId));
    
    console.log(`  [${brand} ${familyName}] Already complete: ${currentImageCount}/${IMAGES_TARGET_PER_FAMILY} images`);
    result.completed = true;
    result.status = 'locked';
    return result;
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`SEEDING ELECTRONICS: ${brand} ${familyName}`);
  console.log(`Current: ${currentImageCount}/${IMAGES_TARGET_PER_FAMILY} images`);
  console.log(`Listings scanned so far: ${result.listingsScanned}/${MAX_LISTINGS_PER_FAMILY}`);
  console.log(`${'─'.repeat(50)}`);

  const existingSha256s = new Set<string>();
  const existingImages = await db
    .select({ sha256: electronicsImages.sha256 })
    .from(electronicsImages)
    .where(eq(electronicsImages.familyId, familyId));
  existingImages.forEach(img => existingSha256s.add(img.sha256));

  const categoryId = getCategoryIdForSubcategory(subcategory);
  
  const searchTerms = [
    `${brand} ${familyName}`,
    `${brand} ${familyName} new`,
    `${brand} ${familyName} unlocked`,
  ];

  for (const query of searchTerms) {
    if (currentImageCount >= IMAGES_TARGET_PER_FAMILY) break;
    if (result.listingsScanned >= MAX_LISTINGS_PER_FAMILY) break;

    console.log(`  Query: "${query}"`);
    let offset = 0;
    let consecutiveEmptyPages = 0;

    while (currentImageCount < IMAGES_TARGET_PER_FAMILY && result.listingsScanned < MAX_LISTINGS_PER_FAMILY) {
      const { response: searchResult, apiCalled } = await searchEbayElectronics(query, categoryId, offset, 50);
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

        const itemResult = await processElectronicsItem(item, familyId, brand, familyName, existingSha256s, failureReasons);
        
        result.imagesStored += itemResult.stored;
        result.duplicatesSkipped += itemResult.duplicates;
        result.downloadFailed += itemResult.failed;
        currentImageCount += itemResult.stored;

        if (itemResult.stored > 0) {
          console.log(`    + ${itemResult.stored} images (now ${currentImageCount}/${IMAGES_TARGET_PER_FAMILY})`);
        }
      }

      await db.update(electronicsFamilies)
        .set({ listingsScanned: result.listingsScanned, updatedAt: new Date() })
        .where(eq(electronicsFamilies.id, familyId));

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
  
  await db.update(electronicsFamilies)
    .set({ 
      status: result.status, 
      listingsScanned: result.listingsScanned,
      updatedAt: new Date() 
    })
    .where(eq(electronicsFamilies.id, familyId));

  console.log(`\n  RESULT: ${result.status.toUpperCase()}`);
  console.log(`  Images: ${currentImageCount}/${IMAGES_TARGET_PER_FAMILY}`);
  console.log(`  Listings scanned: ${result.listingsScanned}`);
  console.log(`  Junk filtered: ${result.junkFiltered}`);
  console.log(`  Duplicates: ${result.duplicatesSkipped}`);

  return result;
}

export async function initializeElectronicsFamilies(): Promise<void> {
  console.log('Initializing electronics families...');
  
  for (const family of ELECTRONICS_FAMILIES) {
    const existing = await db
      .select()
      .from(electronicsFamilies)
      .where(and(
        eq(electronicsFamilies.brand, family.brand),
        eq(electronicsFamilies.family, family.family)
      ))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(electronicsFamilies).values({
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
  
  console.log(`Electronics families initialized: ${ELECTRONICS_FAMILIES.length} total`);
}

export async function runElectronicsImageSeeder(): Promise<SeederStats> {
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

  await initializeElectronicsFamilies();

  console.log('='.repeat(60));
  console.log('ELECTRONICS IMAGE SEEDER v1.0 - FILL-FIRST MODE');
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
      .from(electronicsFamilies)
      .where(eq(electronicsFamilies.status, 'active'))
      .orderBy(asc(electronicsFamilies.queueOrder));

    if (activeFamilies.length === 0) {
      const queuedFamilies = await db
        .select()
        .from(electronicsFamilies)
        .where(eq(electronicsFamilies.status, 'queued'))
        .orderBy(asc(electronicsFamilies.queueOrder))
        .limit(MAX_ACTIVE_FAMILIES);

      if (queuedFamilies.length === 0) {
        console.log('\nNo more families to process.');
        break;
      }

      for (const family of queuedFamilies) {
        await db.update(electronicsFamilies)
          .set({ status: 'active', updatedAt: new Date() })
          .where(eq(electronicsFamilies.id, family.id));
      }

      console.log(`\nActivated ${queuedFamilies.length} new families from queue.`);
      continue;
    }

    const family = activeFamilies[0];
    console.log(`\nProcessing: ${family.brand} ${family.family} (queue order: ${family.queueOrder})`);

    const result = await seedSingleElectronicsFamily(family, stats.failureReasons);
    
    stats.totalApiCalls += result.apiCalls;
    stats.totalImagesStored += result.imagesStored;
    stats.totalDownloadFailed += result.downloadFailed;
    stats.totalDownloadSuccess += result.imagesStored;

    if (result.status === 'locked') {
      stats.lockedFamilies.push(result);
      
      const nextQueued = await db
        .select()
        .from(electronicsFamilies)
        .where(eq(electronicsFamilies.status, 'queued'))
        .orderBy(asc(electronicsFamilies.queueOrder))
        .limit(1);

      if (nextQueued.length > 0) {
        await db.update(electronicsFamilies)
          .set({ status: 'active', updatedAt: new Date() })
          .where(eq(electronicsFamilies.id, nextQueued[0].id));
        console.log(`  Activated next family: ${nextQueued[0].brand} ${nextQueued[0].family}`);
      }
    } else if (result.status === 'hard') {
      stats.hardFamilies.push(result);
      
      const nextQueued = await db
        .select()
        .from(electronicsFamilies)
        .where(eq(electronicsFamilies.status, 'queued'))
        .orderBy(asc(electronicsFamilies.queueOrder))
        .limit(1);

      if (nextQueued.length > 0) {
        await db.update(electronicsFamilies)
          .set({ status: 'active', updatedAt: new Date() })
          .where(eq(electronicsFamilies.id, nextQueued[0].id));
        console.log(`  Activated next family: ${nextQueued[0].brand} ${nextQueued[0].family}`);
      }
    } else {
      stats.activeFamilies.push(result);
    }

    await delay(2000);
  }

  const remainingQueued = await db
    .select({ brand: electronicsFamilies.brand, family: electronicsFamilies.family, subcategory: electronicsFamilies.subcategory })
    .from(electronicsFamilies)
    .where(eq(electronicsFamilies.status, 'queued'))
    .orderBy(asc(electronicsFamilies.queueOrder));
  
  stats.queuedFamilies = remainingQueued;

  printSeederReport(stats);
  
  return stats;
}

function printSeederReport(stats: SeederStats): void {
  console.log('\n' + '='.repeat(60));
  console.log('ELECTRONICS SEEDER REPORT');
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
  console.log(`  Total electronics images stored: ${stats.totalImagesStored}`);
  console.log(`  Total families LOCKED: ${stats.lockedFamilies.length}`);
  console.log(`  Total families ACTIVE: ${stats.activeFamilies.length}`);
  console.log(`  Total families HARD: ${stats.hardFamilies.length}`);
  console.log(`  API calls made: ${stats.totalApiCalls}`);
  console.log(`  Image download success: ${stats.totalDownloadSuccess}`);
  console.log(`  Image download failed: ${stats.totalDownloadFailed}`);
  
  console.log('\n  Top 5 failure reasons:');
  const sortedReasons = Array.from(stats.failureReasons.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (sortedReasons.length === 0) {
    console.log('    (none)');
  } else {
    for (let i = 0; i < sortedReasons.length; i++) {
      const [reason, reasonCount] = sortedReasons[i];
      console.log(`    ${reason}: ${reasonCount}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
}

export async function getElectronicsSeederReport(): Promise<ElectronicsSeedReport> {
  const families = await db.select().from(electronicsFamilies);
  
  const imageCounts = await db
    .select({
      familyId: electronicsImages.familyId,
      count: count(),
    })
    .from(electronicsImages)
    .groupBy(electronicsImages.familyId);

  const countMap = new Map(imageCounts.map(ic => [ic.familyId, Number(ic.count)]));
  
  const totalImages = imageCounts.reduce((sum, ic) => sum + Number(ic.count), 0);
  
  const familyImageCounts = families.map(f => countMap.get(f.id) || 0);
  const minImagesPerFamily = familyImageCounts.length ? Math.min(...familyImageCounts) : 0;
  const maxImagesPerFamily = familyImageCounts.length ? Math.max(...familyImageCounts) : 0;
  const avgImagesPerFamily = familyImageCounts.length 
    ? familyImageCounts.reduce((a, b) => a + b, 0) / familyImageCounts.length 
    : 0;

  const lockedFamilies = families
    .filter(f => f.status === 'locked')
    .map(f => ({ brand: f.brand, family: f.family, imageCount: countMap.get(f.id) || 0, subcategory: f.subcategory }));

  const activeFamilies = families
    .filter(f => f.status === 'active')
    .map(f => ({ brand: f.brand, family: f.family, imageCount: countMap.get(f.id) || 0, subcategory: f.subcategory }));

  const queuedFamilies = families
    .filter(f => f.status === 'queued')
    .map(f => ({ brand: f.brand, family: f.family, imageCount: countMap.get(f.id) || 0, subcategory: f.subcategory }));

  const hardFamilies = families
    .filter(f => f.status === 'hard')
    .map(f => ({ brand: f.brand, family: f.family, imageCount: countMap.get(f.id) || 0, listingsScanned: f.listingsScanned, subcategory: f.subcategory }));

  const processedItemsResult = await db.execute(sql`SELECT COUNT(*) as count FROM processed_electronics_items`);
  const processedItems = Number(processedItemsResult.rows[0]?.count || 0);

  return {
    totalFamilies: families.length,
    totalImages,
    minImagesPerFamily,
    maxImagesPerFamily,
    avgImagesPerFamily: Math.round(avgImagesPerFamily * 10) / 10,
    lockedFamilies,
    activeFamilies,
    queuedFamilies,
    hardFamilies,
    apiStats: {
      totalApiCalls: 0,
      downloadSuccess: processedItems,
      downloadFailed: 0,
      topFailureReasons: [],
    },
  };
}
