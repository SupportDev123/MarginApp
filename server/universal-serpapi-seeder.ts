import { db } from './db';
import { 
  watchFamilies, watchImages,
  shoeFamilies, shoeImages,
  electronicsFamilies, electronicsImages,
  toyFamilies, toyImages,
  cardFamilies, cardImages
} from '@shared/schema';
import { eq, sql, and, lt, count } from 'drizzle-orm';
import { generateImageEmbedding } from './embedding-service';
import crypto from 'crypto';

const IMAGES_TARGET_PER_FAMILY = 25;
const MAX_FAMILIES_PER_RUN = 20;
const DELAY_BETWEEN_SEARCHES_MS = 300;

interface SerpImageResult {
  original?: string;
  thumbnail?: string;
  title?: string;
  source?: string;
}

interface CategoryConfig {
  name: string;
  familiesTable: any;
  imagesTable: any;
  searchTermBuilder: (brand: string, family: string) => string[];
}

const CATEGORY_CONFIGS: Record<string, CategoryConfig> = {
  watches: {
    name: 'Watches',
    familiesTable: watchFamilies,
    imagesTable: watchImages,
    searchTermBuilder: (brand, family) => [
      `${brand} ${family} watch`,
      `${brand} ${family} wristwatch`,
      `${brand} ${family} timepiece`
    ]
  },
  shoes: {
    name: 'Shoes',
    familiesTable: shoeFamilies,
    imagesTable: shoeImages,
    searchTermBuilder: (brand, family) => [
      `${brand} ${family} sneakers`,
      `${brand} ${family} shoes`,
      `${brand} ${family} footwear`
    ]
  },
  electronics: {
    name: 'Electronics',
    familiesTable: electronicsFamilies,
    imagesTable: electronicsImages,
    searchTermBuilder: (brand, family) => [
      `${brand} ${family}`,
      `${brand} ${family} product`,
      `${brand} ${family} electronics`
    ]
  },
  toys: {
    name: 'Collectibles',
    familiesTable: toyFamilies,
    imagesTable: toyImages,
    searchTermBuilder: (brand, family) => [
      `${brand} ${family}`,
      `${brand} ${family} collectible`,
      `${brand} ${family} toy`
    ]
  },
  cards: {
    name: 'Trading Cards',
    familiesTable: cardFamilies,
    imagesTable: cardImages,
    searchTermBuilder: (brand, family) => [
      `${brand} ${family} trading card`,
      `${brand} ${family} card`,
      `${family} ${brand} sports card`
    ]
  }
};

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
    
    if (buffer.length < 10000) return null;
    if (buffer.length > 5000000) return null;
    
    const dimensions = getImageDimensions(buffer);
    if (!dimensions) return null;
    if (dimensions.width < 200 || dimensions.height < 200) return null;

    return { buffer, contentType, width: dimensions.width, height: dimensions.height };
  } catch {
    return null;
  }
}

async function searchSerpAPIImages(query: string, apiKey: string): Promise<SerpImageResult[]> {
  try {
    const searchUrl = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(query)}&num=30&safe=active&api_key=${apiKey}`;
    
    const response = await fetch(searchUrl, {
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.log(`[SerpAPI] Search failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.images_results || [];
  } catch (error: any) {
    console.log(`[SerpAPI] Search error: ${error.message}`);
    return [];
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function seedCategoryWithSerpAPI(
  categoryKey: string,
  maxFamilies: number = MAX_FAMILIES_PER_RUN
): Promise<{ familiesProcessed: number; imagesAdded: number; errors: string[] }> {
  const config = CATEGORY_CONFIGS[categoryKey];
  if (!config) {
    return { familiesProcessed: 0, imagesAdded: 0, errors: [`Unknown category: ${categoryKey}`] };
  }

  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    return { familiesProcessed: 0, imagesAdded: 0, errors: ['SERPAPI_KEY not configured'] };
  }

  console.log(`[SerpAPI Seeder] Starting ${config.name} seeding...`);

  const familiesNeedingImages = await db.select({
    id: config.familiesTable.id,
    brand: config.familiesTable.brand,
    family: config.familiesTable.family,
    displayName: config.familiesTable.displayName,
  })
  .from(config.familiesTable)
  .where(
    sql`(SELECT COUNT(*) FROM ${config.imagesTable} WHERE family_id = ${config.familiesTable.id}) < ${IMAGES_TARGET_PER_FAMILY}`
  )
  .limit(maxFamilies);

  console.log(`[SerpAPI Seeder] Found ${familiesNeedingImages.length} ${config.name} families needing images`);

  let totalImagesAdded = 0;
  const errors: string[] = [];

  for (const family of familiesNeedingImages) {
    const currentCount = await db.select({ count: count() })
      .from(config.imagesTable)
      .where(eq(config.imagesTable.familyId, family.id));
    
    const existingCount = currentCount[0]?.count || 0;
    const needed = IMAGES_TARGET_PER_FAMILY - existingCount;
    
    if (needed <= 0) continue;

    console.log(`[SerpAPI Seeder] Seeding ${family.brand} ${family.family} (need ${needed} more images)`);

    const searchTerms = config.searchTermBuilder(family.brand, family.family);
    let imagesAddedForFamily = 0;

    for (const searchTerm of searchTerms) {
      if (imagesAddedForFamily >= needed) break;

      const results = await searchSerpAPIImages(searchTerm, apiKey);
      await delay(DELAY_BETWEEN_SEARCHES_MS);

      for (const result of results) {
        if (imagesAddedForFamily >= needed) break;
        
        const imageUrl = result.original || result.thumbnail;
        if (!imageUrl) continue;

        try {
          const imageData = await downloadAndValidateImage(imageUrl);
          if (!imageData) continue;

          // Generate SHA256 hash for deduplication
          const sha256Hash = crypto.createHash('sha256').update(imageData.buffer).digest('hex');
          
          // Check for duplicate by SHA256
          const existing = await db.select({ id: config.imagesTable.id })
            .from(config.imagesTable)
            .where(eq(config.imagesTable.sha256, sha256Hash))
            .limit(1);
          
          if (existing.length > 0) continue;

          const embeddingResult = await generateImageEmbedding(imageData.buffer);
          if (!embeddingResult || !embeddingResult.embedding) continue;

          // Storage path format: category/brand/family_id/sha256.jpg
          const storagePath = `${categoryKey}/${family.brand}/${family.id}/${sha256Hash}.jpg`;

          await db.insert(config.imagesTable).values({
            familyId: family.id,
            sha256: sha256Hash,
            storagePath: storagePath,
            originalUrl: imageUrl,
            fileSize: imageData.buffer.length,
            width: imageData.width,
            height: imageData.height,
            contentType: imageData.contentType,
            embedding: embeddingResult.embedding,
            source: 'serpapi',
            qualityScore: '0.85',
          });

          imagesAddedForFamily++;
          totalImagesAdded++;
          console.log(`[SerpAPI Seeder] Added image ${imagesAddedForFamily}/${needed} for ${family.brand} ${family.family}`);
        } catch (error: any) {
          errors.push(`Error adding image for ${family.brand} ${family.family}: ${error.message}`);
        }
      }
    }
  }

  console.log(`[SerpAPI Seeder] Completed ${config.name}: ${totalImagesAdded} images added`);
  
  return {
    familiesProcessed: familiesNeedingImages.length,
    imagesAdded: totalImagesAdded,
    errors
  };
}

export async function seedAllCategoriesWithSerpAPI(): Promise<Record<string, { familiesProcessed: number; imagesAdded: number }>> {
  const results: Record<string, { familiesProcessed: number; imagesAdded: number }> = {};
  
  for (const categoryKey of Object.keys(CATEGORY_CONFIGS)) {
    const result = await seedCategoryWithSerpAPI(categoryKey, 10);
    results[categoryKey] = {
      familiesProcessed: result.familiesProcessed,
      imagesAdded: result.imagesAdded
    };
  }
  
  return results;
}

export async function getCategoryImageStats(): Promise<Record<string, { current: number; target: number; needed: number }>> {
  const stats: Record<string, { current: number; target: number; needed: number }> = {};
  
  for (const [key, config] of Object.entries(CATEGORY_CONFIGS)) {
    const [imageCount] = await db.select({ count: count() }).from(config.imagesTable);
    const [familyCount] = await db.select({ count: count() }).from(config.familiesTable);
    
    const current = imageCount?.count || 0;
    const target = (familyCount?.count || 0) * IMAGES_TARGET_PER_FAMILY;
    
    stats[key] = {
      current,
      target,
      needed: Math.max(0, target - current)
    };
  }
  
  return stats;
}
