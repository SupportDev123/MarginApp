/**
 * Vision Routing Test System
 * 
 * Tests category classification accuracy by running sample images through
 * the visual matching system and verifying they route to the correct category.
 * 
 * Categories must pass routing tests before being marked CATEGORY_COMPLETE.
 */

import { db } from './db';
import { sql } from 'drizzle-orm';
import { generateImageEmbedding, distanceToSimilarity } from './embedding-service';

// Test images per category (URLs from web for testing)
const TEST_IMAGE_SOURCES: Record<string, string[]> = {
  watches: [
    'rolex submariner watch',
    'omega speedmaster watch', 
    'seiko presage watch',
  ],
  shoes: [
    'nike air jordan 1 sneaker',
    'adidas yeezy boost 350',
    'new balance 550 shoe',
  ],
  handbags: [
    'louis vuitton neverfull bag',
    'gucci marmont handbag',
    'chanel classic flap bag',
  ],
  gaming: [
    'nintendo switch console',
    'playstation 5 controller',
    'xbox series x console',
  ],
  electronics: [
    'apple airpods pro',
    'sony wh-1000xm5 headphones',
    'iphone 15 pro smartphone',
  ],
  toys: [
    'lego star wars set',
    'funko pop vinyl figure',
    'hot wheels car',
  ],
  antiques: [
    'depression glass bowl',
    'hummel figurine porcelain',
    'carnival glass vase',
  ],
  tools: [
    'milwaukee m18 drill',
    'dewalt impact driver',
    'makita circular saw',
  ],
};

interface RoutingTestResult {
  category: string;
  totalTests: number;
  correctRoutes: number;
  accuracy: number;
  misroutes: { expected: string; got: string; score: number }[];
  noMatches: number;
  passed: boolean;  // true if accuracy >= 80%
}

// Category tables for vector search
const CATEGORY_IMAGE_TABLES = [
  { name: 'watches', table: 'watch_images', familyTable: 'watch_families' },
  { name: 'shoes', table: 'shoe_images', familyTable: 'shoe_families' },
  { name: 'handbags', table: 'handbag_images', familyTable: 'handbag_families' },
  { name: 'gaming', table: 'gaming_images', familyTable: 'gaming_families' },
  { name: 'electronics', table: 'electronics_images', familyTable: 'electronics_families' },
  { name: 'toys', table: 'toy_images', familyTable: 'toy_families' },
  { name: 'antiques', table: 'antique_images', familyTable: 'antique_families' },
  { name: 'tools', table: 'tool_images', familyTable: 'tool_families' },
];

/**
 * Find best matching category for an image embedding
 */
async function findBestCategory(embedding: number[]): Promise<{ category: string; score: number } | null> {
  const embeddingArray = `[${embedding.join(',')}]`;
  let bestMatch: { category: string; score: number } | null = null;
  
  for (const cat of CATEGORY_IMAGE_TABLES) {
    try {
      const result = await db.execute(sql`
        SELECT 
          ${cat.name} as category,
          MIN(embedding <=> ${embeddingArray}::vector) as min_distance
        FROM ${sql.raw(cat.table)}
        WHERE embedding IS NOT NULL
      `);
      
      if (result.rows[0]?.min_distance !== null && result.rows[0]?.min_distance !== undefined) {
        const distance = parseFloat(String(result.rows[0]?.min_distance ?? '0'));
        const score = distanceToSimilarity(distance);
        
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { category: cat.name, score };
        }
      }
    } catch (e) {
      // Table might not exist, skip
    }
  }
  
  return bestMatch;
}

/**
 * Get test images using SerpAPI for a category
 */
async function getTestImagesForCategory(
  category: string, 
  count: number = 20
): Promise<string[]> {
  const serpKey = process.env.SERPAPI_KEY;
  if (!serpKey) return [];
  
  const searchTerms = TEST_IMAGE_SOURCES[category] || [`${category} product`];
  const images: string[] = [];
  
  for (const term of searchTerms) {
    if (images.length >= count) break;
    
    try {
      const url = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(term)}&num=10&api_key=${serpKey}`;
      const res = await fetch(url);
      const data = await res.json();
      
      for (const img of (data.images_results || []).slice(0, 8)) {
        if (images.length >= count) break;
        if (img.original) images.push(img.original);
      }
    } catch (e) {
      console.error(`Error fetching test images for ${category}:`, e);
    }
  }
  
  return images;
}

/**
 * Run routing test for a single category
 */
export async function testCategoryRouting(category: string): Promise<RoutingTestResult> {
  console.log(`[RoutingTest] Testing ${category}...`);
  
  const testImages = await getTestImagesForCategory(category, 20);
  console.log(`[RoutingTest] Got ${testImages.length} test images for ${category}`);
  
  const result: RoutingTestResult = {
    category,
    totalTests: 0,
    correctRoutes: 0,
    accuracy: 0,
    misroutes: [],
    noMatches: 0,
    passed: false,
  };
  
  for (const imgUrl of testImages) {
    try {
      const { embedding } = await generateImageEmbedding(imgUrl);
      const match = await findBestCategory(embedding);
      
      result.totalTests++;
      
      if (!match || match.score < 0.5) {
        result.noMatches++;
      } else if (match.category === category) {
        result.correctRoutes++;
      } else {
        result.misroutes.push({
          expected: category,
          got: match.category,
          score: match.score,
        });
      }
    } catch (e) {
      // Skip failed images
    }
  }
  
  result.accuracy = result.totalTests > 0 
    ? Math.round((result.correctRoutes / result.totalTests) * 100) 
    : 0;
  result.passed = result.accuracy >= 80;
  
  console.log(`[RoutingTest] ${category}: ${result.accuracy}% accuracy (${result.correctRoutes}/${result.totalTests}), passed: ${result.passed}`);
  
  return result;
}

/**
 * Run routing tests for all categories
 */
export async function testAllCategoryRouting(): Promise<RoutingTestResult[]> {
  const results: RoutingTestResult[] = [];
  
  for (const category of Object.keys(TEST_IMAGE_SOURCES)) {
    const result = await testCategoryRouting(category);
    results.push(result);
  }
  
  return results;
}

// Run if called directly
if (require.main === module) {
  testAllCategoryRouting()
    .then(results => {
      console.log('\n=== ROUTING TEST RESULTS ===');
      for (const r of results) {
        console.log(`${r.category}: ${r.accuracy}% (${r.correctRoutes}/${r.totalTests}) - ${r.passed ? 'PASSED' : 'FAILED'}`);
      }
      process.exit(0);
    })
    .catch(err => {
      console.error('Routing test failed:', err);
      process.exit(1);
    });
}
