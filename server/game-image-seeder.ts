import { db } from './db';
import { sql } from 'drizzle-orm';
import { downloadImage, validateImage, storeGameImage } from './game-image-storage';
import { generateImageEmbedding } from './embedding-service';
import { getAccessToken } from './ebay-api';

const DELAY_BETWEEN_REQUESTS_MS = 500;
const DELAY_ON_RATE_LIMIT_MS = 60000;
const IMAGES_TARGET_PER_FAMILY = 25;
const MAX_ACTIVE_FAMILIES = 15;
const MAX_LISTINGS_PER_FAMILY = 300;
const MAX_IMAGES_PER_LISTING = 3;

const JUNK_TITLE_FILTERS = [
  'for parts', 'parts only', 'broken', 'not working', 'defective',
  'case only', 'box only', 'manual only', 'artwork only', 'disc only',
  'replacement case', 'replacement box', 'empty case', 'no game',
  'lot of', 'bundle of', 'mixed lot', 'pick your game',
  'display only', 'dummy', 'replica', 'fake', 'reproduction', 'repro',
  'digital code', 'download code', 'dlc code', 'season pass',
  'strategy guide', 'game guide', 'poster', 'sticker',
  'read description', 'please read', 'as is', 'untested',
  'disc resurfaced', 'resurfaced', 'scratched'
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

export interface GameSeedReport {
  totalFamilies: number;
  totalImages: number;
  minImagesPerFamily: number;
  maxImagesPerFamily: number;
  avgImagesPerFamily: number;
  lockedFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string }>;
  activeFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string }>;
  queuedFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string }>;
  hardFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string; listingsScanned: number }>;
  apiStats: {
    totalApiCalls: number;
    downloadSuccess: number;
    downloadFailed: number;
    topFailureReasons: Array<{ reason: string; count: number }>;
  };
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

function getEbayCategoryId(subcategory: string): string {
  switch (subcategory) {
    case 'cartridge':
      return '139973'; // Video Games
    case 'disc':
      return '139973'; // Video Games
    case 'retro':
      return '139973'; // Video Games
    default:
      return '139973'; // Video Games
  }
}

async function searchEbayGames(
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

  const categoryId = getEbayCategoryId(subcategory);
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

async function processGameItem(
  item: EbayItemSummary,
  familyId: number,
  brand: string,
  family: string,
  existingSha256s: Set<string>,
  failureReasons: Map<string, number>
): Promise<{ stored: number; duplicates: number; failed: number }> {
  const result = { stored: 0, duplicates: 0, failed: 0 };
  
  const existingItem = await db.execute(sql`
    SELECT 1 FROM processed_game_items WHERE ebay_item_id = ${item.itemId} LIMIT 1
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
        SELECT 1 FROM game_images WHERE sha256 = ${validation.sha256} LIMIT 1
      `);
      if (existingHash.rows && existingHash.rows.length > 0) {
        existingSha256s.add(validation.sha256!);
        result.duplicates++;
        continue;
      }
      
      const stored = await storeGameImage(
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
          INSERT INTO game_images (family_id, sha256, storage_path, original_url, file_size, width, height, content_type, embedding, source)
          VALUES (${familyId}, ${validation.sha256}, ${stored.storagePath}, ${imageUrl}, ${stored.fileSize}, ${stored.width}, ${stored.height}, ${stored.contentType}, ${embedding}::vector, 'ebay')
        `);
      } else {
        await db.execute(sql`
          INSERT INTO game_images (family_id, sha256, storage_path, original_url, file_size, width, height, content_type, source)
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
    INSERT INTO processed_game_items (ebay_item_id, family_id, title, condition, image_count)
    VALUES (${item.itemId}, ${familyId}, ${item.title}, ${item.condition || null}, ${storedCount})
  `);
  
  return result;
}

interface GameFamily {
  id: number;
  brand: string;
  family: string;
  displayName: string;
  subcategory: string | null;
  listingsScanned: number | null;
  status: string | null;
}

async function seedFamily(
  familyRecord: GameFamily,
  existingSha256s: Set<string>,
  failureReasons: Map<string, number>
): Promise<FamilySeederResult> {
  const { id, brand, family, displayName, subcategory, listingsScanned } = familyRecord;
  
  const result: FamilySeederResult = {
    brand,
    family,
    subcategory: subcategory || 'cartridge',
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
  
  const currentImages = await db.execute(sql`
    SELECT COUNT(*) as count FROM game_images WHERE family_id = ${id}
  `);
  
  const imageCount = Number(currentImages.rows[0]?.count) || 0;
  console.log(`    Current images: ${imageCount}/${IMAGES_TARGET_PER_FAMILY}`);
  
  if (imageCount >= IMAGES_TARGET_PER_FAMILY) {
    console.log(`    Already at target, locking family`);
    await db.execute(sql`
      UPDATE game_families SET status = 'locked', updated_at = NOW() WHERE id = ${id}
    `);
    result.status = 'locked';
    result.completed = true;
    return result;
  }
  
  if (result.listingsScanned >= MAX_LISTINGS_PER_FAMILY) {
    console.log(`    Hit listings limit with only ${imageCount} images, marking HARD`);
    await db.execute(sql`
      UPDATE game_families SET status = 'hard', updated_at = NOW() WHERE id = ${id}
    `);
    result.status = 'hard';
    result.completed = true;
    return result;
  }
  
  const searchQuery = displayName;
  let offset = 0;
  
  while (imageCount + result.imagesStored < IMAGES_TARGET_PER_FAMILY && 
         result.listingsScanned < MAX_LISTINGS_PER_FAMILY) {
    
    const { response, apiCalled } = await searchEbayGames(searchQuery, subcategory || 'cartridge', offset, 50);
    if (apiCalled) result.apiCalls++;
    
    if (!response || !response.itemSummaries || response.itemSummaries.length === 0) {
      console.log(`    No more results at offset ${offset}`);
      break;
    }
    
    console.log(`    Processing ${response.itemSummaries.length} listings at offset ${offset}`);
    
    for (const item of response.itemSummaries) {
      if (imageCount + result.imagesStored >= IMAGES_TARGET_PER_FAMILY) {
        break;
      }
      
      if (isJunkTitle(item.title)) {
        result.junkFiltered++;
        continue;
      }
      
      result.listingsScanned++;
      
      const itemResult = await processGameItem(
        item,
        id,
        brand,
        family,
        existingSha256s,
        failureReasons
      );
      
      result.imagesStored += itemResult.stored;
      result.duplicatesSkipped += itemResult.duplicates;
      result.downloadFailed += itemResult.failed;
      
      await delay(200);
    }
    
    await db.execute(sql`
      UPDATE game_families SET listings_scanned = ${result.listingsScanned}, updated_at = NOW() WHERE id = ${id}
    `);
    
    offset += 50;
    await delay(DELAY_BETWEEN_REQUESTS_MS);
  }
  
  const finalImageCount = imageCount + result.imagesStored;
  console.log(`    Final: ${finalImageCount} images, ${result.listingsScanned} listings scanned`);
  
  if (finalImageCount >= IMAGES_TARGET_PER_FAMILY) {
    await db.execute(sql`
      UPDATE game_families SET status = 'locked', updated_at = NOW() WHERE id = ${id}
    `);
    result.status = 'locked';
    result.completed = true;
  } else if (result.listingsScanned >= MAX_LISTINGS_PER_FAMILY) {
    await db.execute(sql`
      UPDATE game_families SET status = 'hard', updated_at = NOW() WHERE id = ${id}
    `);
    result.status = 'hard';
    result.completed = true;
  }
  
  return result;
}

export async function runGameImageSeeder(): Promise<SeederStats> {
  console.log('Starting Game Image Seeder...');
  
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
  const existingHashes = await db.execute(sql`SELECT sha256 FROM game_images`);
  for (const row of existingHashes.rows as any[]) {
    existingSha256s.add(row.sha256);
  }
  console.log(`Loaded ${existingSha256s.size} existing image hashes`);
  
  const activeFamiliesResult = await db.execute(sql`
    SELECT * FROM game_families WHERE status = 'active' ORDER BY queue_order ASC LIMIT ${MAX_ACTIVE_FAMILIES}
  `);
  const activeFamilies = activeFamiliesResult.rows as unknown as GameFamily[];
  
  const activeCount = activeFamilies.length;
  
  if (activeCount < MAX_ACTIVE_FAMILIES) {
    const needed = MAX_ACTIVE_FAMILIES - activeCount;
    const queuedFamiliesResult = await db.execute(sql`
      SELECT * FROM game_families WHERE status = 'queued' ORDER BY queue_order ASC LIMIT ${needed}
    `);
    const queuedFamilies = queuedFamiliesResult.rows as unknown as GameFamily[];
    
    for (const family of queuedFamilies) {
      await db.execute(sql`
        UPDATE game_families SET status = 'active', updated_at = NOW() WHERE id = ${family.id}
      `);
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
  
  const remainingResult = await db.execute(sql`
    SELECT brand, family, subcategory FROM game_families WHERE status = 'queued' ORDER BY queue_order ASC
  `);
  const remaining = remainingResult.rows as any[];
  
  stats.queuedFamilies = remaining.map(f => ({ brand: f.brand, family: f.family, subcategory: f.subcategory || 'cartridge' }));
  
  console.log('\nSeeder complete!');
  console.log(`  Total API calls: ${stats.totalApiCalls}`);
  console.log(`  Images stored: ${stats.totalImagesStored}`);
  console.log(`  Locked: ${stats.lockedFamilies.length}, Active: ${stats.activeFamilies.length}, Hard: ${stats.hardFamilies.length}, Queued: ${stats.queuedFamilies.length}`);
  
  return stats;
}

export async function getGameSeederReport(): Promise<GameSeedReport> {
  const allFamiliesResult = await db.execute(sql`SELECT * FROM game_families`);
  const allFamilies = allFamiliesResult.rows as unknown as GameFamily[];
  
  const imageCountsResult = await db.execute(sql`
    SELECT family_id, COUNT(*) as count FROM game_images GROUP BY family_id
  `);
  
  const countMap = new Map<number, number>();
  for (const row of imageCountsResult.rows as any[]) {
    countMap.set(row.family_id, Number(row.count));
  }
  
  const lockedFamilies: GameSeedReport['lockedFamilies'] = [];
  const activeFamilies: GameSeedReport['activeFamilies'] = [];
  const queuedFamilies: GameSeedReport['queuedFamilies'] = [];
  const hardFamilies: GameSeedReport['hardFamilies'] = [];
  
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
      subcategory: family.subcategory || 'cartridge',
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
