import { db } from './db';
import { toolFamilies, toolImages, ToolSeedReport } from '@shared/schema';
import { eq, sql, and, count, asc } from 'drizzle-orm';
import { downloadImage, validateImage, storeToolImage } from './tool-image-storage';
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
  'vintage', 'antique',
  'read description', 'see description'
];

const TOOL_FAMILIES = [
  { brand: 'Milwaukee', family: 'M18 Fuel Hammer Drill', subcategory: 'power_tools', queueOrder: 1 },
  { brand: 'Milwaukee', family: 'M18 Fuel Impact Driver', subcategory: 'power_tools', queueOrder: 2 },
  { brand: 'Milwaukee', family: 'M18 Fuel Circular Saw', subcategory: 'power_tools', queueOrder: 3 },
  { brand: 'Milwaukee', family: 'M18 Fuel Reciprocating Saw', subcategory: 'power_tools', queueOrder: 4 },
  { brand: 'Milwaukee', family: 'M18 Fuel Angle Grinder', subcategory: 'power_tools', queueOrder: 5 },
  { brand: 'Milwaukee', family: 'M12 Fuel Drill', subcategory: 'power_tools', queueOrder: 6 },
  { brand: 'Milwaukee', family: 'M12 Fuel Impact Driver', subcategory: 'power_tools', queueOrder: 7 },
  { brand: 'Milwaukee', family: 'M18 Fuel Combo Kit', subcategory: 'combo_kits', queueOrder: 8 },
  { brand: 'Milwaukee', family: 'M18 Battery', subcategory: 'accessories', queueOrder: 9 },
  { brand: 'Milwaukee', family: 'Packout Tool Box', subcategory: 'storage', queueOrder: 10 },
  
  { brand: 'DeWalt', family: '20V MAX Hammer Drill', subcategory: 'power_tools', queueOrder: 11 },
  { brand: 'DeWalt', family: '20V MAX Impact Driver', subcategory: 'power_tools', queueOrder: 12 },
  { brand: 'DeWalt', family: '20V MAX Circular Saw', subcategory: 'power_tools', queueOrder: 13 },
  { brand: 'DeWalt', family: '20V MAX Reciprocating Saw', subcategory: 'power_tools', queueOrder: 14 },
  { brand: 'DeWalt', family: '20V MAX Angle Grinder', subcategory: 'power_tools', queueOrder: 15 },
  { brand: 'DeWalt', family: '20V MAX Jigsaw', subcategory: 'power_tools', queueOrder: 16 },
  { brand: 'DeWalt', family: 'XR Brushless Drill', subcategory: 'power_tools', queueOrder: 17 },
  { brand: 'DeWalt', family: '20V MAX Combo Kit', subcategory: 'combo_kits', queueOrder: 18 },
  { brand: 'DeWalt', family: '20V MAX Battery', subcategory: 'accessories', queueOrder: 19 },
  { brand: 'DeWalt', family: 'ToughSystem Tool Box', subcategory: 'storage', queueOrder: 20 },
  
  { brand: 'Makita', family: 'LXT Hammer Drill', subcategory: 'power_tools', queueOrder: 21 },
  { brand: 'Makita', family: 'LXT Impact Driver', subcategory: 'power_tools', queueOrder: 22 },
  { brand: 'Makita', family: 'LXT Circular Saw', subcategory: 'power_tools', queueOrder: 23 },
  { brand: 'Makita', family: 'LXT Reciprocating Saw', subcategory: 'power_tools', queueOrder: 24 },
  { brand: 'Makita', family: 'LXT Angle Grinder', subcategory: 'power_tools', queueOrder: 25 },
  { brand: 'Makita', family: 'XGT 40V Drill', subcategory: 'power_tools', queueOrder: 26 },
  { brand: 'Makita', family: 'LXT Combo Kit', subcategory: 'combo_kits', queueOrder: 27 },
  { brand: 'Makita', family: 'LXT Battery', subcategory: 'accessories', queueOrder: 28 },
  
  { brand: 'Ryobi', family: 'ONE+ Drill', subcategory: 'power_tools', queueOrder: 29 },
  { brand: 'Ryobi', family: 'ONE+ Impact Driver', subcategory: 'power_tools', queueOrder: 30 },
  { brand: 'Ryobi', family: 'ONE+ Circular Saw', subcategory: 'power_tools', queueOrder: 31 },
  { brand: 'Ryobi', family: 'ONE+ Reciprocating Saw', subcategory: 'power_tools', queueOrder: 32 },
  { brand: 'Ryobi', family: 'ONE+ Angle Grinder', subcategory: 'power_tools', queueOrder: 33 },
  { brand: 'Ryobi', family: 'HP Brushless Drill', subcategory: 'power_tools', queueOrder: 34 },
  { brand: 'Ryobi', family: 'ONE+ Combo Kit', subcategory: 'combo_kits', queueOrder: 35 },
  { brand: 'Ryobi', family: 'ONE+ Battery', subcategory: 'accessories', queueOrder: 36 },
  
  { brand: 'Bosch', family: '18V Hammer Drill', subcategory: 'power_tools', queueOrder: 37 },
  { brand: 'Bosch', family: '18V Impact Driver', subcategory: 'power_tools', queueOrder: 38 },
  { brand: 'Bosch', family: '18V Circular Saw', subcategory: 'power_tools', queueOrder: 39 },
  { brand: 'Bosch', family: '18V Reciprocating Saw', subcategory: 'power_tools', queueOrder: 40 },
  { brand: 'Bosch', family: '18V Angle Grinder', subcategory: 'power_tools', queueOrder: 41 },
  { brand: 'Bosch', family: 'Rotary Hammer', subcategory: 'power_tools', queueOrder: 42 },
  
  { brand: 'Ridgid', family: '18V Hammer Drill', subcategory: 'power_tools', queueOrder: 43 },
  { brand: 'Ridgid', family: '18V Impact Driver', subcategory: 'power_tools', queueOrder: 44 },
  { brand: 'Ridgid', family: '18V Combo Kit', subcategory: 'combo_kits', queueOrder: 45 },
  
  { brand: 'Craftsman', family: 'V20 Drill', subcategory: 'power_tools', queueOrder: 46 },
  { brand: 'Craftsman', family: 'V20 Impact Driver', subcategory: 'power_tools', queueOrder: 47 },
  { brand: 'Craftsman', family: 'V20 Combo Kit', subcategory: 'combo_kits', queueOrder: 48 },
  
  { brand: 'Kobalt', family: '24V Drill', subcategory: 'power_tools', queueOrder: 49 },
  { brand: 'Kobalt', family: '24V Impact Driver', subcategory: 'power_tools', queueOrder: 50 },
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

async function searchEbayTools(
  query: string,
  offset: number = 0,
  limit: number = 50
): Promise<{ response: EbaySearchResponse | null; apiCalled: boolean }> {
  const accessToken = await getAccessToken('https://api.ebay.com/oauth/api_scope');
  
  if (!accessToken) {
    console.log('    eBay API credentials not configured');
    return { response: null, apiCalled: false };
  }

  const categoryId = '631';
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

async function processToolItem(
  item: EbayItemSummary,
  familyId: number,
  brand: string,
  family: string,
  existingSha256s: Set<string>,
  failureReasons: Map<string, number>
): Promise<{ stored: number; duplicates: number; failed: number }> {
  const result = { stored: 0, duplicates: 0, failed: 0 };
  
  const existingItem = await db.execute(sql`
    SELECT 1 FROM processed_tool_items WHERE ebay_item_id = ${item.itemId} LIMIT 1
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

      const stored = await storeToolImage(
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

      await db.insert(toolImages).values({
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
          UPDATE tool_images 
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
    INSERT INTO processed_tool_items (ebay_item_id, family_id, title, condition, image_count)
    VALUES (${item.itemId}, ${familyId}, ${item.title}, ${item.condition || null}, ${result.stored})
    ON CONFLICT (ebay_item_id) DO NOTHING
  `);

  return result;
}

async function seedSingleToolFamily(
  family: typeof toolFamilies.$inferSelect,
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
    .from(toolImages)
    .where(eq(toolImages.familyId, familyId));
  
  let currentImageCount = Number(imageCountResult[0]?.count || 0);

  if (currentImageCount >= IMAGES_TARGET_PER_FAMILY) {
    await db.update(toolFamilies)
      .set({ status: 'locked', updatedAt: new Date() })
      .where(eq(toolFamilies.id, familyId));
    
    console.log(`  [${brand} ${familyName}] Already complete: ${currentImageCount}/${IMAGES_TARGET_PER_FAMILY} images`);
    result.completed = true;
    result.status = 'locked';
    return result;
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`SEEDING TOOLS: ${brand} ${familyName}`);
  console.log(`Current: ${currentImageCount}/${IMAGES_TARGET_PER_FAMILY} images`);
  console.log(`Listings scanned so far: ${result.listingsScanned}/${MAX_LISTINGS_PER_FAMILY}`);
  console.log(`${'─'.repeat(50)}`);

  const existingSha256s = new Set<string>();
  const existingImages = await db
    .select({ sha256: toolImages.sha256 })
    .from(toolImages)
    .where(eq(toolImages.familyId, familyId));
  existingImages.forEach(img => existingSha256s.add(img.sha256));

  const searchTerms = [
    `${brand} ${familyName}`,
    `${brand} ${familyName} tool`,
    `${brand} ${familyName} cordless`,
  ];

  for (const query of searchTerms) {
    if (currentImageCount >= IMAGES_TARGET_PER_FAMILY) break;
    if (result.listingsScanned >= MAX_LISTINGS_PER_FAMILY) break;

    console.log(`  Query: "${query}"`);
    let offset = 0;
    let consecutiveEmptyPages = 0;

    while (currentImageCount < IMAGES_TARGET_PER_FAMILY && result.listingsScanned < MAX_LISTINGS_PER_FAMILY) {
      const { response: searchResult, apiCalled } = await searchEbayTools(query, offset, 50);
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

        const itemResult = await processToolItem(item, familyId, brand, familyName, existingSha256s, failureReasons);
        
        result.imagesStored += itemResult.stored;
        result.duplicatesSkipped += itemResult.duplicates;
        result.downloadFailed += itemResult.failed;
        currentImageCount += itemResult.stored;

        if (itemResult.stored > 0) {
          console.log(`    + ${itemResult.stored} images (now ${currentImageCount}/${IMAGES_TARGET_PER_FAMILY})`);
        }
      }

      await db.update(toolFamilies)
        .set({ listingsScanned: result.listingsScanned, updatedAt: new Date() })
        .where(eq(toolFamilies.id, familyId));

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
  
  await db.update(toolFamilies)
    .set({ 
      status: result.status, 
      listingsScanned: result.listingsScanned,
      updatedAt: new Date() 
    })
    .where(eq(toolFamilies.id, familyId));

  console.log(`\n  RESULT: ${result.status.toUpperCase()}`);
  console.log(`  Images: ${currentImageCount}/${IMAGES_TARGET_PER_FAMILY}`);
  console.log(`  Listings scanned: ${result.listingsScanned}`);
  console.log(`  Junk filtered: ${result.junkFiltered}`);
  console.log(`  Duplicates: ${result.duplicatesSkipped}`);

  return result;
}

export async function initializeToolFamilies(): Promise<void> {
  console.log('Initializing tool families...');
  
  for (const family of TOOL_FAMILIES) {
    const existing = await db
      .select()
      .from(toolFamilies)
      .where(and(
        eq(toolFamilies.brand, family.brand),
        eq(toolFamilies.family, family.family)
      ))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(toolFamilies).values({
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
  
  console.log(`Tool families initialized: ${TOOL_FAMILIES.length} total`);
}

export async function runToolImageSeeder(): Promise<SeederStats> {
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

  await initializeToolFamilies();

  console.log('='.repeat(60));
  console.log('TOOL IMAGE SEEDER v1.0 - FILL-FIRST MODE');
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
      .from(toolFamilies)
      .where(eq(toolFamilies.status, 'active'))
      .orderBy(asc(toolFamilies.queueOrder));

    if (activeFamilies.length === 0) {
      const queuedFamilies = await db
        .select()
        .from(toolFamilies)
        .where(eq(toolFamilies.status, 'queued'))
        .orderBy(asc(toolFamilies.queueOrder))
        .limit(MAX_ACTIVE_FAMILIES);

      if (queuedFamilies.length === 0) {
        console.log('\nNo more families to process.');
        break;
      }

      for (const family of queuedFamilies) {
        await db.update(toolFamilies)
          .set({ status: 'active', updatedAt: new Date() })
          .where(eq(toolFamilies.id, family.id));
      }

      console.log(`\nActivated ${queuedFamilies.length} new families from queue.`);
      continue;
    }

    const family = activeFamilies[0];
    console.log(`\nProcessing: ${family.brand} ${family.family} (queue order: ${family.queueOrder})`);

    const result = await seedSingleToolFamily(family, stats.failureReasons);
    
    stats.totalApiCalls += result.apiCalls;
    stats.totalImagesStored += result.imagesStored;
    stats.totalDownloadFailed += result.downloadFailed;
    stats.totalDownloadSuccess += result.imagesStored;

    if (result.status === 'locked') {
      stats.lockedFamilies.push(result);
      
      const nextQueued = await db
        .select()
        .from(toolFamilies)
        .where(eq(toolFamilies.status, 'queued'))
        .orderBy(asc(toolFamilies.queueOrder))
        .limit(1);

      if (nextQueued.length > 0) {
        await db.update(toolFamilies)
          .set({ status: 'active', updatedAt: new Date() })
          .where(eq(toolFamilies.id, nextQueued[0].id));
        console.log(`  Activated next family: ${nextQueued[0].brand} ${nextQueued[0].family}`);
      }
    } else if (result.status === 'hard') {
      stats.hardFamilies.push(result);
      
      const nextQueued = await db
        .select()
        .from(toolFamilies)
        .where(eq(toolFamilies.status, 'queued'))
        .orderBy(asc(toolFamilies.queueOrder))
        .limit(1);

      if (nextQueued.length > 0) {
        await db.update(toolFamilies)
          .set({ status: 'active', updatedAt: new Date() })
          .where(eq(toolFamilies.id, nextQueued[0].id));
        console.log(`  Activated next family: ${nextQueued[0].brand} ${nextQueued[0].family}`);
      }
    } else {
      stats.activeFamilies.push(result);
    }

    await delay(2000);
  }

  const remainingQueued = await db
    .select({ brand: toolFamilies.brand, family: toolFamilies.family, subcategory: toolFamilies.subcategory })
    .from(toolFamilies)
    .where(eq(toolFamilies.status, 'queued'))
    .orderBy(asc(toolFamilies.queueOrder));
  
  stats.queuedFamilies = remainingQueued;

  printSeederReport(stats);
  
  return stats;
}

function printSeederReport(stats: SeederStats): void {
  console.log('\n' + '='.repeat(60));
  console.log('TOOL SEEDER REPORT');
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
  console.log(`  Total tool images stored: ${stats.totalImagesStored}`);
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

export async function getToolSeederReport(): Promise<ToolSeedReport> {
  const families = await db.select().from(toolFamilies);
  
  const imageCounts = await db
    .select({
      familyId: toolImages.familyId,
      count: count(),
    })
    .from(toolImages)
    .groupBy(toolImages.familyId);

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

  const processedItemsResult = await db.execute(sql`SELECT COUNT(*) as count FROM processed_tool_items`);
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
