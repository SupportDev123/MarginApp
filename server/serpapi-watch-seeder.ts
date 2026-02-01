import { db } from './db';
import { watchFamilies, watchImages } from '@shared/schema';
import { eq, sql, and, lt } from 'drizzle-orm';
import { generateImageEmbedding } from './embedding-service';
import crypto from 'crypto';

const IMAGES_TARGET_PER_FAMILY = 25;
const MAX_FAMILIES_PER_RUN = 20;
const DELAY_BETWEEN_SEARCHES_MS = 500;

interface SerpImageResult {
  original?: string;
  thumbnail?: string;
  title?: string;
  source?: string;
}

interface FamilyToSeed {
  id: number;
  brand: string;
  family: string;
  displayName: string;
  currentCount: number;
}

function getImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  try {
    // PNG signature check
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }
    
    // JPEG signature check
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
    
    // WebP signature check
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

async function searchGoogleImages(query: string, apiKey: string): Promise<SerpImageResult[]> {
  try {
    const searchUrl = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(query)}&num=30&safe=active&api_key=${apiKey}`;
    
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

export async function runSerpApiWatchSeeder(): Promise<{
  familiesProcessed: number;
  imagesAdded: number;
  apiCalls: number;
}> {
  const serpApiKey = process.env.SERPAPI_KEY;
  
  if (!serpApiKey) {
    console.log('[SerpAPI Watch Seeder] SERPAPI_KEY not configured - skipping');
    return { familiesProcessed: 0, imagesAdded: 0, apiCalls: 0 };
  }

  console.log('════════════════════════════════════════════════════════════');
  console.log('SERPAPI WATCH SEEDER - Google Images');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`Target: ${IMAGES_TARGET_PER_FAMILY} images per family`);
  console.log(`Max families per run: ${MAX_FAMILIES_PER_RUN}`);
  console.log('════════════════════════════════════════════════════════════');

  const familiesToSeed: FamilyToSeed[] = [];

  const allFamilies = await db
    .select({
      id: watchFamilies.id,
      brand: watchFamilies.brand,
      family: watchFamilies.family,
      displayName: watchFamilies.displayName,
    })
    .from(watchFamilies);

  for (const family of allFamilies) {
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(watchImages)
      .where(eq(watchImages.familyId, family.id));
    
    const currentCount = Number(countResult[0]?.count || 0);
    
    if (currentCount < IMAGES_TARGET_PER_FAMILY) {
      familiesToSeed.push({
        ...family,
        currentCount,
      });
    }
  }

  familiesToSeed.sort((a, b) => a.currentCount - b.currentCount);

  console.log(`\nFound ${familiesToSeed.length} families needing images:`);
  familiesToSeed.slice(0, 10).forEach(f => {
    console.log(`  - ${f.displayName}: ${f.currentCount}/${IMAGES_TARGET_PER_FAMILY}`);
  });

  const toProcess = familiesToSeed.slice(0, MAX_FAMILIES_PER_RUN);
  let totalImagesAdded = 0;
  let totalApiCalls = 0;

  for (const family of toProcess) {
    const needed = IMAGES_TARGET_PER_FAMILY - family.currentCount;
    console.log(`\n──────────────────────────────────────────────────`);
    console.log(`SEEDING: ${family.displayName}`);
    console.log(`Current: ${family.currentCount}/${IMAGES_TARGET_PER_FAMILY} (need ${needed})`);
    console.log(`──────────────────────────────────────────────────`);

    const searchQueries = [
      `${family.displayName} watch`,
      `${family.brand} ${family.family} watch photo`,
      `${family.displayName} wristwatch`,
    ];

    let addedForFamily = 0;
    const existingHashes = new Set<string>();

    const existingImages = await db
      .select({ hash: watchImages.sha256 })
      .from(watchImages)
      .where(eq(watchImages.familyId, family.id));
    
    existingImages.forEach(img => {
      if (img.hash) existingHashes.add(img.hash);
    });

    for (const query of searchQueries) {
      if (addedForFamily >= needed) break;

      console.log(`  Query: "${query}"`);
      const results = await searchGoogleImages(query, serpApiKey);
      totalApiCalls++;
      console.log(`    Found ${results.length} images`);

      for (const img of results) {
        if (addedForFamily >= needed) break;

        const imgUrl = img.original || img.thumbnail;
        if (!imgUrl) continue;

        if (imgUrl.includes('placeholder') || imgUrl.includes('logo')) continue;

        try {
          const downloaded = await downloadAndValidateImage(imgUrl);
          if (!downloaded) {
            continue;
          }

          const hash = crypto.createHash('sha256').update(downloaded.buffer).digest('hex');

          if (existingHashes.has(hash)) {
            continue;
          }

          console.log(`    Processing image (${Math.round(downloaded.buffer.length/1024)}KB)...`);
          const base64 = `data:${downloaded.contentType};base64,${downloaded.buffer.toString('base64')}`;
          
          let embedding: number[];
          try {
            const embeddingResult = await generateImageEmbedding(base64);
            embedding = embeddingResult.embedding;
            console.log(`    Embedding done (${embedding.length} dims)`);
          } catch (embErr: any) {
            console.log(`    Embedding failed: ${embErr.message}`);
            continue;
          }

          const embeddingStr = `[${embedding.join(',')}]`;

          try {
            const fileSize = downloaded.buffer.length;
            await db.execute(sql`
              INSERT INTO watch_images (family_id, storage_path, original_url, sha256, source, embedding, file_size, width, height, content_type, created_at)
              VALUES (${family.id}, ${imgUrl}, ${imgUrl}, ${hash}, 'google_images', ${embeddingStr}::vector, ${fileSize}, ${downloaded.width}, ${downloaded.height}, ${downloaded.contentType}, NOW())
            `);
          } catch (dbErr: any) {
            console.log(`    DB insert failed: ${dbErr.message}`);
            continue;
          }

          existingHashes.add(hash);
          addedForFamily++;
          totalImagesAdded++;
          console.log(`    ✓ Added image ${addedForFamily}/${needed}`);

        } catch (err: any) {
          console.log(`    Error: ${err.message}`);
          continue;
        }
      }

      await new Promise(r => setTimeout(r, DELAY_BETWEEN_SEARCHES_MS));
    }

    const finalCount = family.currentCount + addedForFamily;
    if (finalCount >= IMAGES_TARGET_PER_FAMILY) {
      console.log(`  ✓ COMPLETE: ${finalCount}/${IMAGES_TARGET_PER_FAMILY}`);
    } else {
      console.log(`  ⚠ INCOMPLETE: ${finalCount}/${IMAGES_TARGET_PER_FAMILY}`);
    }
  }

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('SERPAPI WATCH SEEDER COMPLETE');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`Families processed: ${toProcess.length}`);
  console.log(`Images added: ${totalImagesAdded}`);
  console.log(`API calls made: ${totalApiCalls}`);
  console.log('════════════════════════════════════════════════════════════\n');

  return {
    familiesProcessed: toProcess.length,
    imagesAdded: totalImagesAdded,
    apiCalls: totalApiCalls,
  };
}
