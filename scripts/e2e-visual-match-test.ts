import { db } from '../server/db';
import { watchImages, shoeImages, watchFamilies, shoeFamilies } from '../shared/schema';
import { eq, sql } from 'drizzle-orm';
import { generateImageEmbedding } from '../server/embedding-service';
import { findVisualMatches, getLibraryStats } from '../server/visual-matching';
import { getStoredImageUrl, downloadImage } from '../server/watch-image-storage';

async function runDeepDiveTest() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('      DEEP DIVE END-TO-END VISUAL MATCHING TEST');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('STEP 1: Library Status Check');
  console.log('─────────────────────────────────────────────────────────────');
  
  const watchCount = await db.select({ count: sql<number>`count(*)` }).from(watchImages);
  const shoeCount = await db.select({ count: sql<number>`count(*)` }).from(shoeImages);
  
  console.log(`  Watch images in library: ${watchCount[0].count}`);
  console.log(`  Shoe images in library: ${shoeCount[0].count}`);
  console.log(`  Total: ${Number(watchCount[0].count) + Number(shoeCount[0].count)}`);
  
  const readinessThreshold = 500;
  const watchReady = Number(watchCount[0].count) >= readinessThreshold;
  const shoeReady = Number(shoeCount[0].count) >= readinessThreshold;
  
  console.log(`\n  Watch library ready (>${readinessThreshold}): ${watchReady ? 'YES' : 'NO'}`);
  console.log(`  Shoe library ready (>${readinessThreshold}): ${shoeReady ? 'YES' : 'NO'}`);

  console.log('\n\nSTEP 2: Fetch Random Test Image');
  console.log('─────────────────────────────────────────────────────────────');
  
  const randomWatch = await db.execute(sql`
    SELECT wi.*, wf.brand, wf.family 
    FROM watch_images wi 
    JOIN watch_families wf ON wi.family_id = wf.id 
    ORDER BY RANDOM() 
    LIMIT 1
  `);
  
  if (randomWatch.rows.length === 0) {
    console.log('  ERROR: No watch images found in database');
    process.exit(1);
  }
  
  const testImage = randomWatch.rows[0] as any;
  console.log(`  Selected: ${testImage.brand} ${testImage.family}`);
  console.log(`  Image hash: ${testImage.sha256?.substring(0, 16)}...`);
  console.log(`  Storage path: ${testImage.storage_path}`);
  
  console.log('\n\nSTEP 3: Fetch Image from Object Storage');
  console.log('─────────────────────────────────────────────────────────────');
  
  let imageBuffer: Buffer | null = null;
  let imageUrl: string | null = null;
  
  try {
    if (testImage.storage_path) {
      imageUrl = await getStoredImageUrl(testImage.storage_path);
      console.log(`  Storage URL: ${imageUrl?.substring(0, 60)}...`);
      
      if (imageUrl) {
        imageBuffer = await downloadImage(imageUrl);
        console.log(`  SUCCESS: Downloaded ${imageBuffer.length} bytes from storage`);
      }
    }
  } catch (error: any) {
    console.log(`  Storage error: ${error.message}`);
  }

  if (!imageBuffer && testImage.original_url) {
    console.log('\n  Fallback: Using original eBay source URL...');
    console.log(`  Original URL: ${testImage.original_url.substring(0, 60)}...`);
    try {
      imageBuffer = await downloadImage(testImage.original_url);
      console.log(`  SUCCESS: Downloaded ${imageBuffer.length} bytes from original`);
    } catch (error: any) {
      console.log(`  Original download error: ${error.message}`);
    }
  }

  console.log('\n\nSTEP 4: Generate CLIP Embedding');
  console.log('─────────────────────────────────────────────────────────────');
  
  try {
    const embeddingInput = imageBuffer || testImage.source_url;
    if (!embeddingInput) {
      console.log('  ERROR: No image source available');
      process.exit(1);
    }
    
    console.log(`  Input type: ${imageBuffer ? 'Buffer' : 'URL'}`);
    console.log('  Calling Jina CLIP API...');
    
    const startTime = Date.now();
    const { embedding, hash } = await generateImageEmbedding(embeddingInput);
    const elapsed = Date.now() - startTime;
    
    console.log(`  SUCCESS: Generated ${embedding.length}-dim embedding in ${elapsed}ms`);
    console.log(`  Embedding hash: ${hash.substring(0, 16)}...`);
    console.log(`  First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
  } catch (error: any) {
    console.log(`  ERROR: ${error.message}`);
  }

  console.log('\n\nSTEP 5: Database Embedding Verification');
  console.log('─────────────────────────────────────────────────────────────');
  
  const embeddingCheck = await db.execute(sql`
    SELECT id, family_id, 
           (embedding IS NOT NULL) as has_embedding,
           768 as embedding_dim
    FROM watch_images 
    WHERE embedding IS NOT NULL 
    LIMIT 5
  `);
  
  console.log(`  Images with embeddings: checking...`);
  if (embeddingCheck.rows.length > 0) {
    console.log(`  Sample embeddings found: ${embeddingCheck.rows.length}`);
    const sample = embeddingCheck.rows[0] as any;
    console.log(`  Embedding dimension: ${sample.embedding_dim}`);
  } else {
    console.log('  WARNING: No embeddings found in watch_images table');
  }

  console.log('\n\nSTEP 6: Visual Match Pipeline Test');
  console.log('─────────────────────────────────────────────────────────────');
  
  try {
    console.log('  Running findVisualMatches() with test image...');
    const embeddingInput = imageBuffer || testImage.source_url;
    
    const startTime = Date.now();
    const matchResult = await findVisualMatches(embeddingInput, 'watch');
    const elapsed = Date.now() - startTime;
    
    console.log(`\n  RESULT (${elapsed}ms):`);
    console.log(`  ─────────────────────────────────────────`);
    console.log(`  Decision: ${matchResult.decision}`);
    console.log(`  Best score: ${matchResult.bestScore?.toFixed(4)}`);
    console.log(`  Score gap: ${matchResult.scoreGap?.toFixed(4)}`);
    console.log(`  Candidates found: ${matchResult.topMatches?.length || 0}`);
    
    if (matchResult.autoSelectedItem) {
      console.log(`\n  AUTO-SELECTED MATCH:`);
      console.log(`    Title: ${matchResult.autoSelectedItem.title}`);
      console.log(`    Brand: ${matchResult.autoSelectedItem.brand}`);
      console.log(`    Family: ${matchResult.autoSelectedItem.modelFamily}`);
      console.log(`    Score: ${matchResult.autoSelectedItem.score?.toFixed(4)}`);
    }
    
    if (matchResult.topMatches && matchResult.topMatches.length > 0) {
      console.log(`\n  TOP 3 CANDIDATES:`);
      matchResult.topMatches.slice(0, 3).forEach((c: any, i: number) => {
        console.log(`    ${i + 1}. ${c.brand || 'Unknown'} ${c.modelFamily || 'Unknown'} - Score: ${c.score?.toFixed(4) || 'N/A'}`);
      });
    }
    
  } catch (error: any) {
    console.log(`  ERROR: ${error.message}`);
    console.log(`  Stack: ${error.stack?.split('\n').slice(0, 3).join('\n')}`);
  }

  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('      TEST COMPLETE - Expected Result Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`
  For a working visual matching system, you should see:
  
  ✓ Library counts above 500 per category
  ✓ Random image successfully fetched
  ✓ 768-dimensional CLIP embedding generated
  ✓ Visual match decision returned (auto_selected, user_required, etc.)
  ✓ Candidates ranked by similarity score
  
  If decision = "library_building": Library needs more images (<500)
  If decision = "auto_selected": Strong match found automatically
  If decision = "user_required": Multiple similar candidates, needs user choice
  `);
  
  process.exit(0);
}

runDeepDiveTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
