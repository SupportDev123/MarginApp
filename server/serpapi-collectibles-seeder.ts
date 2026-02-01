/**
 * SerpAPI Collectibles Seeder
 * 
 * Uses SerpAPI's Google Images to automatically populate the visual library
 * with images for collectibles (comics, vinyl, vintage games, action figures, etc.)
 * 
 * Much faster than manual seeding - pulls high-quality product images automatically.
 */

import { db } from './db';
import { libraryItems, libraryImages } from '@shared/schema';
import { eq, sql, and, lt, isNull, or } from 'drizzle-orm';
import { generateImageEmbedding } from './embedding-service';
import crypto from 'crypto';

const IMAGES_TARGET_PER_ITEM = 15;
const MAX_ITEMS_PER_RUN = 30;
const DELAY_BETWEEN_SEARCHES_MS = 400;

interface SerpImageResult {
  original?: string;
  thumbnail?: string;
  title?: string;
  source?: string;
}

interface ItemToSeed {
  id: number;
  category: string;
  brand: string | null;
  modelFamily: string | null;
  title: string;
  variant: string | null;
  currentCount: number;
}

function getImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  try {
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }
    
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
      let offset = 2;
      while (offset < buffer.length - 8) {
        if (buffer[offset] !== 0xFF) break;
        const marker = buffer[offset + 1];
        if (marker === 0xC0 || marker === 0xC2) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height };
        }
        const segmentLength = buffer.readUInt16BE(offset + 2);
        offset += 2 + segmentLength;
      }
    }
    
    if (buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP') {
      if (buffer.slice(12, 16).toString() === 'VP8 ') {
        const width = buffer.readUInt16LE(26) & 0x3FFF;
        const height = buffer.readUInt16LE(28) & 0x3FFF;
        return { width, height };
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

async function downloadAndValidateImage(url: string): Promise<{ buffer: Buffer; contentType: string; width: number; height: number } | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/*',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('image')) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    
    if (buffer.length < 8000) return null;
    if (buffer.length > 5000000) return null;
    
    const dimensions = getImageDimensions(buffer);
    if (!dimensions) return null;
    if (dimensions.width < 150 || dimensions.height < 150) return null;

    return { buffer, contentType, width: dimensions.width, height: dimensions.height };
  } catch {
    return null;
  }
}

async function searchGoogleImages(query: string, apiKey: string): Promise<SerpImageResult[]> {
  try {
    const searchUrl = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(query)}&num=25&safe=active&api_key=${apiKey}`;
    
    const response = await fetch(searchUrl, {
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.log(`  [SerpAPI] Search failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.images_results || [];
  } catch (err: any) {
    console.log(`  [SerpAPI] Search error: ${err.message}`);
    return [];
  }
}

function buildSearchQuery(item: ItemToSeed): string[] {
  const queries: string[] = [];
  const { brand, modelFamily, title, variant } = item;
  const family = modelFamily || '';
  
  if (brand === 'Marvel' || brand === 'DC' || brand === 'Image') {
    queries.push(`${title} comic book CGC graded slab`);
    queries.push(`${family} comic key issue`);
  } else if (brand === 'Vinyl') {
    queries.push(`${title} vinyl record LP`);
    queries.push(`${title} album vinyl sealed`);
  } else if (family.includes('NES') || family.includes('SNES') || family.includes('N64') || family.includes('Genesis') || family.includes('GameBoy')) {
    queries.push(`${title} complete in box CIB`);
    queries.push(`${title} sealed graded WATA VGA`);
  } else if (brand === 'McFarlane' || brand === 'NECA' || brand === 'Mezco' || brand === 'Super7' || brand === 'Hasbro') {
    queries.push(`${title} action figure ${variant || ''}`);
    queries.push(`${brand} ${family} figure`);
  } else if (brand === 'Bandai' || brand === 'Good Smile' || brand === 'Banpresto' || brand === 'Kotobukiya') {
    queries.push(`${title} anime figure`);
    queries.push(`${brand} ${family}`);
  } else if (brand === 'Funko') {
    queries.push(`${title} Funko Pop vinyl figure`);
    queries.push(`Funko Pop ${family} ${variant || ''}`);
  } else if (brand === 'LEGO') {
    queries.push(`${title} LEGO set box`);
    queries.push(`LEGO ${family} ${variant || ''} sealed`);
  } else if (brand === 'Hot Wheels') {
    queries.push(`${title} Hot Wheels car`);
    queries.push(`Hot Wheels ${family} ${variant || ''}`);
  } else {
    queries.push(`${title} ${variant || ''} collectible`);
    queries.push(`${brand || ''} ${family}`);
  }
  
  return queries;
}

export async function runSerpApiCollectiblesSeeder(): Promise<{
  itemsProcessed: number;
  imagesAdded: number;
  apiCalls: number;
}> {
  const serpApiKey = process.env.SERPAPI_KEY;
  
  if (!serpApiKey) {
    console.log('[SerpAPI Collectibles Seeder] SERPAPI_KEY not configured - skipping');
    return { itemsProcessed: 0, imagesAdded: 0, apiCalls: 0 };
  }

  console.log('════════════════════════════════════════════════════════════');
  console.log('SERPAPI COLLECTIBLES SEEDER - Google Images');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`Target: ${IMAGES_TARGET_PER_ITEM} images per item`);
  console.log(`Max items per run: ${MAX_ITEMS_PER_RUN}`);
  console.log('Categories: Comics, Vinyl, Vintage Games, Action Figures, Anime');
  console.log('════════════════════════════════════════════════════════════');

  const itemsToSeed: ItemToSeed[] = [];

  const allItems = await db
    .select({
      id: libraryItems.id,
      category: libraryItems.category,
      brand: libraryItems.brand,
      modelFamily: libraryItems.modelFamily,
      title: libraryItems.title,
      variant: libraryItems.variant,
    })
    .from(libraryItems)
    .where(eq(libraryItems.category, 'collectible'));

  for (const item of allItems) {
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(libraryImages)
      .where(eq(libraryImages.itemId, item.id));
    
    const currentCount = Number(countResult[0]?.count || 0);
    
    if (currentCount < IMAGES_TARGET_PER_ITEM) {
      itemsToSeed.push({
        ...item,
        variant: item.variant,
        currentCount,
      });
    }
  }

  itemsToSeed.sort((a, b) => a.currentCount - b.currentCount);
  
  const toProcess = itemsToSeed.slice(0, MAX_ITEMS_PER_RUN);
  
  console.log(`\nFound ${itemsToSeed.length} collectible items needing images`);
  console.log(`Processing ${toProcess.length} items this run\n`);

  let itemsProcessed = 0;
  let totalImagesAdded = 0;
  let totalApiCalls = 0;

  for (const item of toProcess) {
    const imagesNeeded = IMAGES_TARGET_PER_ITEM - item.currentCount;
    console.log(`\n[${item.brand}] ${item.title} - need ${imagesNeeded} images`);
    
    const queries = buildSearchQuery(item);
    let imagesAddedForItem = 0;
    
    for (const query of queries) {
      if (imagesAddedForItem >= imagesNeeded) break;
      
      console.log(`  Searching: "${query}"`);
      const results = await searchGoogleImages(query, serpApiKey);
      totalApiCalls++;
      
      console.log(`  Found ${results.length} image results`);
      
      for (const result of results) {
        if (imagesAddedForItem >= imagesNeeded) break;
        
        const imageUrl = result.original;
        if (!imageUrl) continue;
        
        const urlHash = crypto.createHash('md5').update(imageUrl).digest('hex');
        
        const existing = await db
          .select({ id: libraryImages.id })
          .from(libraryImages)
          .where(eq(libraryImages.imageHash, urlHash))
          .limit(1);
        
        if (existing.length > 0) continue;
        
        const imageData = await downloadAndValidateImage(imageUrl);
        if (!imageData) continue;
        
        console.log(`    Generating embedding for ${imageData.width}x${imageData.height} image...`);
        
        const embedding = await generateImageEmbedding(imageData.buffer);
        if (!embedding) {
          console.log(`    Failed to generate embedding`);
          continue;
        }
        
        const embeddingFormatted = `[${embedding.embedding.join(',')}]`;
        
        await db.insert(libraryImages).values({
          itemId: item.id,
          category: item.category,
          imageUrl: imageUrl,
          imageHash: urlHash,
          source: result.source || 'google_images',
          width: imageData.width,
          height: imageData.height,
          embedding: sql`${embeddingFormatted}::vector(768)`,
        });
        
        imagesAddedForItem++;
        totalImagesAdded++;
        console.log(`    Added image ${imagesAddedForItem}/${imagesNeeded}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_SEARCHES_MS));
    }
    
    itemsProcessed++;
    console.log(`  Completed: added ${imagesAddedForItem} images`);
  }

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('SERPAPI COLLECTIBLES SEEDER COMPLETE');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`Items processed: ${itemsProcessed}`);
  console.log(`Images added: ${totalImagesAdded}`);
  console.log(`API calls made: ${totalApiCalls}`);
  console.log('════════════════════════════════════════════════════════════');

  return {
    itemsProcessed,
    imagesAdded: totalImagesAdded,
    apiCalls: totalApiCalls,
  };
}

export async function seedNewCollectibleCategories(): Promise<void> {
  console.log('\n[Collectibles Seeder] Creating new collectible categories in library...\n');
  
  const newCollectibles = [
    { brand: 'Marvel', modelFamily: 'Amazing Spider-Man', title: 'Amazing Spider-Man #300 CGC', variant: 'First Venom' },
    { brand: 'Marvel', modelFamily: 'X-Men', title: 'Giant-Size X-Men #1 CGC', variant: 'First New X-Men' },
    { brand: 'Marvel', modelFamily: 'Incredible Hulk', title: 'Incredible Hulk #181 CGC', variant: 'First Wolverine' },
    { brand: 'DC', modelFamily: 'Batman', title: 'Batman #1 CGC', variant: 'Golden Age' },
    { brand: 'DC', modelFamily: 'Action Comics', title: 'Action Comics #1 CGC', variant: 'First Superman' },
    { brand: 'DC', modelFamily: 'Detective Comics', title: 'Detective Comics #27 CGC', variant: 'First Batman' },
    { brand: 'Image', modelFamily: 'Spawn', title: 'Spawn #1 CGC', variant: 'First Print' },
    { brand: 'Marvel', modelFamily: 'New Mutants', title: 'New Mutants #98 CGC', variant: 'First Deadpool' },
    { brand: 'Vinyl', modelFamily: 'Classic Rock', title: 'Pink Floyd The Dark Side of the Moon', variant: 'First Press' },
    { brand: 'Vinyl', modelFamily: 'Classic Rock', title: 'Led Zeppelin IV', variant: 'Original Press' },
    { brand: 'Nintendo', modelFamily: 'NES', title: 'Super Mario Bros NES CIB', variant: 'Complete In Box' },
    { brand: 'Nintendo', modelFamily: 'SNES', title: 'Chrono Trigger SNES CIB', variant: 'Complete' },
    { brand: 'Nintendo', modelFamily: 'N64', title: 'Legend of Zelda Ocarina of Time N64', variant: 'Gold Cart' },
    { brand: 'McFarlane', modelFamily: 'DC Multiverse', title: 'McFarlane DC Multiverse Batman', variant: 'Gold Label' },
    { brand: 'NECA', modelFamily: 'TMNT', title: 'NECA TMNT Leonardo', variant: '1990 Movie' },
    { brand: 'Bandai', modelFamily: 'S.H. Figuarts', title: 'S.H. Figuarts Dragon Ball Goku', variant: 'Ultra Instinct' },
    { brand: 'Good Smile', modelFamily: 'Nendoroid', title: 'Nendoroid Demon Slayer Tanjiro', variant: 'Standard' },
  ];

  for (const item of newCollectibles) {
    const existing = await db
      .select({ id: libraryItems.id })
      .from(libraryItems)
      .where(
        and(
          eq(libraryItems.category, 'collectible'),
          eq(libraryItems.title, item.title)
        )
      )
      .limit(1);
    
    if (existing.length === 0) {
      await db.insert(libraryItems).values({
        category: 'collectible',
        brand: item.brand,
        modelFamily: item.modelFamily,
        title: item.title,
        variant: item.variant,
      });
      console.log(`  Created: ${item.brand} - ${item.title}`);
    }
  }
  
  console.log('\n[Collectibles Seeder] Category creation complete');
}
