import { db } from './db';
import { sql } from 'drizzle-orm';
import { generateImageEmbedding } from './embedding-service';

const BATCH_SIZE = 50;
const DELAY_MS = 150;

const CATEGORY_TABLES: Record<string, { images: string; families: string }> = {
  toy: { images: 'toy_images', families: 'toy_families' },
  cards: { images: 'card_images', families: 'card_families' },
  shoe: { images: 'shoe_images', families: 'shoe_families' },
  watch: { images: 'watch_images', families: 'watch_families' },
  handbag: { images: 'handbag_images', families: 'handbag_families' },
  gaming: { images: 'gaming_images', families: 'gaming_families' },
  electronics: { images: 'electronics_images', families: 'electronics_families' },
  antique: { images: 'antique_images', families: 'antique_families' },
  tool: { images: 'tool_images', families: 'tool_families' },
  vintage: { images: 'vintage_images', families: 'vintage_families' },
};

async function backfillCategory(category: string): Promise<{ processed: number; failed: number }> {
  const tables = CATEGORY_TABLES[category];
  if (!tables) {
    console.error(`Unknown category: ${category}`);
    return { processed: 0, failed: 0 };
  }

  const countResult = await db.execute(
    sql`SELECT COUNT(*) as missing FROM ${sql.raw(tables.images)} WHERE embedding IS NULL AND original_url IS NOT NULL`
  );
  const missingCount = Number((countResult.rows[0] as any)?.missing || 0);

  if (missingCount === 0) {
    console.log(`[${category}] No images missing embeddings`);
    return { processed: 0, failed: 0 };
  }

  console.log(`[${category}] Starting backfill for ${missingCount} images...`);

  let processed = 0;
  let failed = 0;

  while (processed + failed < missingCount) {
    const batch = await db.execute(
      sql`SELECT id, original_url FROM ${sql.raw(tables.images)} 
          WHERE embedding IS NULL AND original_url IS NOT NULL 
          LIMIT ${BATCH_SIZE}`
    );

    if (batch.rows.length === 0) break;

    for (const row of batch.rows as any[]) {
      try {
        const { embedding } = await generateImageEmbedding(row.original_url);

        await db.execute(
          sql`UPDATE ${sql.raw(tables.images)} 
              SET embedding = ${JSON.stringify(embedding)}::vector 
              WHERE id = ${row.id}`
        );

        processed++;
        if (processed % 25 === 0) {
          console.log(`[${category}] Progress: ${processed}/${missingCount} (failed: ${failed})`);
        }

        await new Promise(r => setTimeout(r, DELAY_MS));
      } catch (err: any) {
        failed++;
        console.error(`[${category}] Failed image ${row.id}:`, err.message?.slice(0, 100));
      }
    }
  }

  console.log(`[${category}] Complete: ${processed} processed, ${failed} failed`);
  return { processed, failed };
}

async function main() {
  console.log('=== EMBEDDING BACKFILL STARTED ===');
  console.log(`Categories: ${Object.keys(CATEGORY_TABLES).join(', ')}`);

  const results: Record<string, { processed: number; failed: number }> = {};

  for (const category of Object.keys(CATEGORY_TABLES)) {
    results[category] = await backfillCategory(category);
  }

  console.log('\n=== BACKFILL SUMMARY ===');
  for (const [cat, stats] of Object.entries(results)) {
    if (stats.processed > 0 || stats.failed > 0) {
      console.log(`  ${cat}: ${stats.processed} processed, ${stats.failed} failed`);
    }
  }
  console.log('=== COMPLETE ===');
}

main().catch(console.error);
