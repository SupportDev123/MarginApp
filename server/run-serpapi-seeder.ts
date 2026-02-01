import { db } from "./db";
import { gamingFamilies, gamingImages, antiqueFamilies, antiqueImages, electronicsFamilies, electronicsImages, toyFamilies, toyImages } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import crypto from "crypto";

async function runSerpApiSeeder() {
  const serpApiKey = process.env.SERPAPI_KEY;
  const jinaKey = process.env.JINA_API_KEY;
  
  if (!serpApiKey) {
    console.error("SERPAPI_KEY not configured");
    process.exit(1);
  }
  if (!jinaKey) {
    console.error("JINA_API_KEY not configured");
    process.exit(1);
  }

  console.log("[SerpAPI Seeder] Starting auto-seed with CATEGORY_COMPLETE system...");
  
  // CATEGORY_COMPLETE thresholds - categories are complete when they have enough
  // visual diversity for reliable coarse classification
  // Once complete: stop category-level ingestion, allow only family-level seeding
  //
  // Thresholds per user requirements:
  // - Shoes, Watches, Handbags: ≥100 (these use different tables, already complete)
  // - Toys, Gaming, Antiques: ≥200
  // - Electronics, Tools: ≥300
  const CATEGORY_THRESHOLDS: Record<string, number> = {
    gaming: 200,
    antique: 200,
    toy: 200,
    electronics: 300,
  };
  
  // Alias for compatibility - once threshold is met, category is COMPLETE
  const CATEGORY_CAPS = CATEGORY_THRESHOLDS;
  
  const familiesToSeed: { category: string; id: number; name: string; imgCount?: number }[] = [];
  
  // Check category-level counts first (only count images WITH embeddings for CATEGORY_COMPLETE status)
  const gamingTotal = await db.execute(sql`SELECT COUNT(*) as c FROM gaming_images WHERE embedding IS NOT NULL`);
  const antiqueTotal = await db.execute(sql`SELECT COUNT(*) as c FROM antique_images WHERE embedding IS NOT NULL`);
  const electronicsTotal = await db.execute(sql`SELECT COUNT(*) as c FROM electronics_images WHERE embedding IS NOT NULL`);
  const toyTotal = await db.execute(sql`SELECT COUNT(*) as c FROM toy_images WHERE embedding IS NOT NULL`);
  
  // Extract counts from execute results (different structure than select)
  const gamingCount = Number((gamingTotal.rows[0] as any)?.c || 0);
  const antiqueCount = Number((antiqueTotal.rows[0] as any)?.c || 0);
  const electronicsCount = Number((electronicsTotal.rows[0] as any)?.c || 0);
  const toyCount = Number((toyTotal.rows[0] as any)?.c || 0);
  
  console.log(`[Category Status] Gaming: ${gamingCount}/${CATEGORY_THRESHOLDS.gaming}, Antiques: ${antiqueCount}/${CATEGORY_THRESHOLDS.antique}, Electronics: ${electronicsCount}/${CATEGORY_THRESHOLDS.electronics}, Toys: ${toyCount}/${CATEGORY_THRESHOLDS.toy}`);
  
  // Only seed categories that haven't hit their threshold (CATEGORY_COMPLETE)
  if (gamingCount < CATEGORY_CAPS.gaming) {
    const gamingFams = await db.select({ id: gamingFamilies.id, name: gamingFamilies.displayName })
      .from(gamingFamilies).where(eq(gamingFamilies.status, 'active')).limit(40);
    for (const f of gamingFams) {
      const count = await db.select({ c: sql<number>`count(*)` }).from(gamingImages).where(eq(gamingImages.familyId, f.id));
      const imgCount = Number(count[0]?.c || 0);
      if (imgCount < 6) familiesToSeed.push({ category: 'gaming', ...f, imgCount });
    }
  } else {
    console.log("[CATEGORY_COMPLETE] Gaming at threshold - SKIPPING category seeding");
  }
  
  if (antiqueCount < CATEGORY_CAPS.antique) {
    const antiqueFams = await db.select({ id: antiqueFamilies.id, name: antiqueFamilies.displayName })
      .from(antiqueFamilies).where(eq(antiqueFamilies.status, 'active')).limit(40);
    for (const f of antiqueFams) {
      const count = await db.select({ c: sql<number>`count(*)` }).from(antiqueImages).where(eq(antiqueImages.familyId, f.id));
      const imgCount = Number(count[0]?.c || 0);
      if (imgCount < 6) familiesToSeed.push({ category: 'antique', ...f, imgCount });
    }
  } else {
    console.log("[CATEGORY_COMPLETE] Antiques at threshold - SKIPPING category seeding");
  }
  
  if (electronicsCount < CATEGORY_CAPS.electronics) {
    const electronicsFams = await db.select({ id: electronicsFamilies.id, name: electronicsFamilies.displayName })
      .from(electronicsFamilies).where(eq(electronicsFamilies.status, 'active')).limit(40);
    for (const f of electronicsFams) {
      const count = await db.select({ c: sql<number>`count(*)` }).from(electronicsImages).where(eq(electronicsImages.familyId, f.id));
      const imgCount = Number(count[0]?.c || 0);
      if (imgCount < 6) familiesToSeed.push({ category: 'electronics', ...f, imgCount });
    }
  } else {
    console.log("[CATEGORY_COMPLETE] Electronics at threshold - SKIPPING category seeding");
  }
  
  if (toyCount < CATEGORY_CAPS.toy) {
    const toyFams = await db.select({ id: toyFamilies.id, name: toyFamilies.displayName })
      .from(toyFamilies).where(eq(toyFamilies.status, 'active')).limit(40);
    for (const f of toyFams) {
      const count = await db.select({ c: sql<number>`count(*)` }).from(toyImages).where(eq(toyImages.familyId, f.id));
      const imgCount = Number(count[0]?.c || 0);
      if (imgCount < 6) familiesToSeed.push({ category: 'toy', ...f, imgCount });
    }
  } else {
    console.log("[CATEGORY_COMPLETE] Toys at threshold - SKIPPING category seeding");
  }

  console.log(`[SerpAPI Seeder] Found ${familiesToSeed.length} families needing images`);
  
  const toProcess = familiesToSeed.slice(0, 20);
  let totalSearched = 0;
  let totalImagesAdded = 0;

  for (const family of toProcess) {
    try {
      console.log(`\n[SerpAPI] Searching: ${family.name} (${family.category})`);
      
      const searchUrl = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(family.name + " product photo")}&num=20&api_key=${serpApiKey}`;
      const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(30000) });
      
      if (!searchRes.ok) {
        console.log(`  Search failed: ${searchRes.status}`);
        continue;
      }
      
      const searchData = await searchRes.json();
      const imageResults = searchData.images_results || [];
      totalSearched++;
      console.log(`  Found ${imageResults.length} image results`);

      let addedForFamily = 0;
      for (const img of imageResults.slice(0, 12)) {
        if (addedForFamily >= 6) break;
        
        const imgUrl = img.original || img.thumbnail;
        if (!imgUrl) continue;

        try {
          const imgRes = await fetch(imgUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(10000)
          });
          if (!imgRes.ok) {
            console.log(`    Fetch failed: ${imgRes.status}`);
            continue;
          }

          const contentType = imgRes.headers.get('content-type') || '';
          if (!contentType.includes('image')) {
            console.log(`    Not image: ${contentType}`);
            continue;
          }

          const buffer = await imgRes.arrayBuffer();
          if (buffer.byteLength < 8000) {
            console.log(`    Too small: ${buffer.byteLength}`);
            continue;
          }
          console.log(`    Image OK: ${buffer.byteLength} bytes`);

          const hash = crypto.createHash('sha256').update(Buffer.from(buffer)).digest('hex');

          const jinaRes = await fetch('https://api.jina.ai/v1/embeddings', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${jinaKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'jina-clip-v1', input: [{ image: imgUrl }] })
          });
          if (!jinaRes.ok) {
            const errText = await jinaRes.text();
            console.log(`    Jina failed: ${jinaRes.status} - ${errText.substring(0, 100)}`);
            continue;
          }

          const jinaData = await jinaRes.json();
          const embedding = jinaData.data?.[0]?.embedding;
          if (!embedding) {
            console.log(`    No embedding in response`);
            continue;
          }
          console.log(`    Embedding OK: ${embedding.length} dims`);

          const insertData = {
            familyId: family.id,
            sha256: hash,
            storagePath: imgUrl,
            originalUrl: imgUrl,
            fileSize: buffer.byteLength,
            width: 400, height: 400,
            contentType,
            embedding,
            source: 'serp_bootstrap',
            qualityScore: '0.9'
          };

          if (family.category === 'gaming') {
            const exists = await db.select().from(gamingImages).where(eq(gamingImages.sha256, hash)).limit(1);
            if (exists.length === 0) {
              await db.insert(gamingImages).values(insertData);
              addedForFamily++;
              totalImagesAdded++;
            }
          } else if (family.category === 'antique') {
            const exists = await db.select().from(antiqueImages).where(eq(antiqueImages.sha256, hash)).limit(1);
            if (exists.length === 0) {
              await db.insert(antiqueImages).values(insertData);
              addedForFamily++;
              totalImagesAdded++;
            }
          } else if (family.category === 'electronics') {
            const exists = await db.select().from(electronicsImages).where(eq(electronicsImages.sha256, hash)).limit(1);
            if (exists.length === 0) {
              await db.insert(electronicsImages).values(insertData);
              addedForFamily++;
              totalImagesAdded++;
            }
          } else if (family.category === 'toy') {
            const exists = await db.select().from(toyImages).where(eq(toyImages.sha256, hash)).limit(1);
            if (exists.length === 0) {
              await db.insert(toyImages).values(insertData);
              addedForFamily++;
              totalImagesAdded++;
            }
          }
        } catch (imgErr) {
          // Skip failed images
        }
      }
      
      console.log(`  Added ${addedForFamily} images for ${family.name}`);
      
      await new Promise(r => setTimeout(r, 300));
    } catch (err: any) {
      console.log(`  Error: ${err.message}`);
    }
  }

  console.log(`\n========================================`);
  console.log(`[SerpAPI Seeder] COMPLETE`);
  console.log(`  Searches made: ${totalSearched}`);
  console.log(`  Images added: ${totalImagesAdded}`);
  console.log(`========================================\n`);
  
  process.exit(0);
}

runSerpApiSeeder().catch(console.error);
