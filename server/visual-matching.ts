import { db } from './db';
import { 
  libraryItems, 
  libraryImages, 
  watchImages,
  watchFamilies,
  shoeImages,
  shoeFamilies,
  cardFamilies,
  cardImages,
  visualMatchSessions,
  matchFeedback,
  VisualMatchResult,
  VisualMatchResponse,
  VisualMatchCategory
} from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { cosineDistance } from 'drizzle-orm';
import { generateImageEmbedding, assessImageQuality, distanceToSimilarity } from './embedding-service';
import OpenAI from 'openai';

// Lazy-initialize OpenAI client to avoid module-level initialization issues
// Uses Replit AI Integrations environment variables
let _openaiClient: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (!_openaiClient) {
    _openaiClient = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return _openaiClient;
}

// SPEED OPTIMIZATION: Pre-warm the OpenAI client to avoid cold-start delay on first scan
// Call this once at server startup
export function preWarmOpenAIClient(): void {
  try {
    getOpenAIClient();
    console.log('[VisualMatching] OpenAI client pre-warmed for faster first scan');
  } catch (err) {
    console.log('[VisualMatching] Pre-warm failed (will lazy-init on first use)');
  }
}

// Known watch brands for OCR matching
const KNOWN_WATCH_BRANDS = [
  'Rolex', 'Omega', 'Tag Heuer', 'Seiko', 'Citizen', 'Casio', 'Invicta', 
  'Fossil', 'Michael Kors', 'Tissot', 'Hamilton', 'Bulova', 'Orient',
  'Timex', 'Movado', 'Longines', 'Breitling', 'Cartier', 'Patek Philippe',
  'Audemars Piguet', 'IWC', 'Panerai', 'Tudor', 'Grand Seiko', 'Oris',
  'Frederique Constant', 'Raymond Weil', 'Baume & Mercier', 'Maurice Lacroix',
  'Garmin', 'Apple', 'Samsung', 'Fitbit', 'Suunto', 'Polar', 'Hublot',
  'Zenith', 'Jaeger-LeCoultre', 'Vacheron Constantin', 'A. Lange & Söhne',
  'Blancpain', 'Ulysse Nardin', 'Girard-Perregaux', 'Piaget', 'Chopard',
  'Nixon', 'Swatch', 'G-Shock', 'Baby-G', 'Stuhrling', 'Victorinox',
  'Swiss Army', 'Luminox', 'Ball', 'Rado', 'Certina', 'Mido'
];

// Known trading card sets for visual recognition
const KNOWN_CARD_SETS = [
  // Panini sets
  { brand: 'Panini', set: 'Prizm', patterns: ['prizm', 'silver prizm', 'red white blue'] },
  { brand: 'Panini', set: 'Mosaic', patterns: ['mosaic', 'reactive'] },
  { brand: 'Panini', set: 'Select', patterns: ['select', 'concourse', 'premier'] },
  { brand: 'Panini', set: 'Donruss Optic', patterns: ['optic', 'donruss optic', 'rated rookie optic'] },
  { brand: 'Panini', set: 'Donruss', patterns: ['donruss', 'rated rookie'] },
  { brand: 'Panini', set: 'Contenders', patterns: ['contenders', 'rookie ticket'] },
  { brand: 'Panini', set: 'National Treasures', patterns: ['national treasures', 'nt'] },
  { brand: 'Panini', set: 'Flawless', patterns: ['flawless'] },
  { brand: 'Panini', set: 'Immaculate', patterns: ['immaculate'] },
  { brand: 'Panini', set: 'Spectra', patterns: ['spectra'] },
  { brand: 'Panini', set: 'Chronicles', patterns: ['chronicles'] },
  // Topps sets
  { brand: 'Topps', set: 'Chrome', patterns: ['topps chrome', 'chrome', 'refractor'] },
  { brand: 'Topps', set: 'Bowman Chrome', patterns: ['bowman chrome', '1st bowman'] },
  { brand: 'Topps', set: 'Bowman', patterns: ['bowman'] },
  { brand: 'Topps', set: 'Heritage', patterns: ['heritage', 'topps heritage'] },
  { brand: 'Topps', set: 'Stadium Club', patterns: ['stadium club'] },
  { brand: 'Topps', set: 'Series 1', patterns: ['series 1', 'topps series'] },
  { brand: 'Topps', set: 'Update', patterns: ['update', 'topps update'] },
  { brand: 'Topps', set: 'Finest', patterns: ['finest', 'topps finest'] },
  { brand: 'Topps', set: 'Tier One', patterns: ['tier one'] },
  { brand: 'Topps', set: 'Inception', patterns: ['inception'] },
  // Upper Deck
  { brand: 'Upper Deck', set: 'SP Authentic', patterns: ['sp authentic'] },
  { brand: 'Upper Deck', set: 'The Cup', patterns: ['the cup'] },
  { brand: 'Upper Deck', set: 'Young Guns', patterns: ['young guns'] },
  // Pokemon
  { brand: 'Pokemon', set: 'Base Set', patterns: ['base set', '1st edition'] },
  { brand: 'Pokemon', set: 'Scarlet & Violet', patterns: ['scarlet', 'violet', 'paldea'] },
  { brand: 'Pokemon', set: 'Sword & Shield', patterns: ['sword', 'shield'] },
  // Yu-Gi-Oh
  { brand: 'Konami', set: 'Yu-Gi-Oh', patterns: ['yugioh', 'yu-gi-oh'] },
  // Magic
  { brand: 'Wizards', set: 'MTG', patterns: ['magic', 'mtg', 'gathering'] },
];

export interface TradingCardOCRResult {
  isCard: boolean;
  playerName: string | null;
  brand: string | null;
  set: string | null;
  year: number | null;
  sport: string | null;
  parallel: string | null;
  cardNumber: string | null;
  isGraded: boolean;
  grader: string | null;
  grade: string | null;
}

/**
 * Use OpenAI Vision to analyze a trading card image
 * 1. Read the player/character NAME from the card text
 * 2. Identify the SET (Prizm, Mosaic, Chrome) from visual design
 * 3. Determine the YEAR from card styling/logos
 */
export async function detectTradingCardDetails(imageBase64: string): Promise<TradingCardOCRResult> {
  try {
    console.log('[CardOCR] Analyzing trading card image...');
    
    const imageUrl = imageBase64.startsWith('data:') 
      ? imageBase64 
      : `data:image/jpeg;base64,${imageBase64}`;
    
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini', // Use mini for speed
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are an expert trading card identifier. Analyze this card image carefully.

CRITICAL TASKS (in order):
1. READ THE PLAYER/CHARACTER NAME - This is printed on the card. Look for:
   - Name at bottom of card (most common)
   - Name overlaid on image
   - Name in header/banner area
   - For graded cards: name visible through slab

2. IDENTIFY THE SET by visual design patterns:
   - PRIZM: Distinctive rainbow/silver prismatic refractor patterns, geometric borders
   - MOSAIC: Mosaic tile pattern background, bold colors
   - SELECT: Tiered design (Concourse/Premier/Courtside), silver borders
   - DONRUSS OPTIC: Clean design with Optic shimmer, "Rated Rookie" shield logo
   - TOPPS CHROME: Chrome refractor finish, Topps logo, clean modern design
   - BOWMAN CHROME: "1st" designation for prospects, chrome finish
   
3. DETERMINE THE YEAR from:
   - Year printed on card (check corners, bottom)
   - Rookie year context (when player entered league)
   - Card design evolution (each year has distinctive styling)

4. DETECT IF GRADED:
   - PSA: Red/white label, PSA logo, "GEM MINT 10" style grades
   - BGS: Black label or silver label, Beckett logo, subgrades
   - SGC: Black label with gold trim, tuxedo design
   - CGC: Blue/white label

Return JSON ONLY:
{
  "isCard": true,
  "playerName": "Patrick Mahomes",
  "brand": "Panini",
  "set": "Prizm",
  "year": 2023,
  "sport": "football",
  "parallel": "Silver Prizm",
  "cardNumber": "123",
  "isGraded": true,
  "grader": "PSA",
  "grade": "10"
}

If NOT a trading card: {"isCard": false}

IMPORTANT: 
- The image may be ROTATED or UPSIDE DOWN - mentally rotate to read text correctly
- playerName is CRITICAL - read it directly from the card
- For Pokemon/Yu-Gi-Oh: use character name instead
- Set MUST be identified from visual design, not guessed
- Include parallel type if visible (Silver, Gold, Holo, etc.)
- For graded slabs: The label may be upside down - still read ALL info (player, year, set, grade)`
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl, detail: 'high' }
            }
          ]
        }
      ],
      max_tokens: 300,
    });
    
    const content = response.choices[0]?.message?.content?.trim() || '';
    console.log(`[CardOCR] Raw result: "${content.substring(0, 200)}..."`);
    
    try {
      let cleanContent = content;
      if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      }
      
      const parsed = JSON.parse(cleanContent);
      
      if (!parsed.isCard) {
        console.log('[CardOCR] Not a trading card');
        return { isCard: false, playerName: null, brand: null, set: null, year: null, sport: null, parallel: null, cardNumber: null, isGraded: false, grader: null, grade: null };
      }
      
      // Normalize the set name against known sets
      let normalizedSet = parsed.set;
      let normalizedBrand = parsed.brand;
      
      if (normalizedSet) {
        const setLower = normalizedSet.toLowerCase();
        for (const knownSet of KNOWN_CARD_SETS) {
          for (const pattern of knownSet.patterns) {
            if (setLower.includes(pattern)) {
              normalizedSet = knownSet.set;
              normalizedBrand = knownSet.brand;
              break;
            }
          }
        }
      }
      
      console.log(`[CardOCR] Detected: ${parsed.playerName || 'Unknown'} - ${normalizedBrand} ${normalizedSet} ${parsed.year || ''}`);
      
      return {
        isCard: true,
        playerName: parsed.playerName || null,
        brand: normalizedBrand || parsed.brand || null,
        set: normalizedSet || parsed.set || null,
        year: parsed.year ? parseInt(parsed.year) : null,
        sport: parsed.sport || null,
        parallel: parsed.parallel || null,
        cardNumber: parsed.cardNumber || null,
        isGraded: parsed.isGraded || false,
        grader: parsed.grader || null,
        grade: parsed.grade || null,
      };
    } catch (parseErr) {
      console.error('[CardOCR] Failed to parse response:', parseErr);
      return { isCard: false, playerName: null, brand: null, set: null, year: null, sport: null, parallel: null, cardNumber: null, isGraded: false, grader: null, grade: null };
    }
  } catch (err: any) {
    console.error('[CardOCR] Failed:', err.message);
    return { isCard: false, playerName: null, brand: null, set: null, year: null, sport: null, parallel: null, cardNumber: null, isGraded: false, grader: null, grade: null };
  }
}

/**
 * Search card category filtered by set and year
 */
async function searchCardsBySetAndYear(
  embeddingVector: number[],
  setFilter: string,
  yearFilter?: number,
  limit: number = 10
): Promise<CrossCategoryMatch[]> {
  try {
    const embeddingStr = `[${embeddingVector.join(',')}]`;
    
    // Build WHERE clauses for set and optional year filtering
    const result = await db.execute(sql`
      SELECT 
        i.family_id,
        f.family,
        f.brand,
        f.display_name,
        i.storage_path,
        1 - (i.embedding <=> ${embeddingStr}::vector) as similarity
      FROM card_images i
      JOIN card_families f ON i.family_id = f.id
      WHERE i.embedding IS NOT NULL
        AND (i.source IS NULL OR i.source != 'serp_bootstrap')
        AND LOWER(f.family) LIKE LOWER(${'%' + setFilter + '%'})
        ${yearFilter ? sql`AND (f.attributes->>'year')::int = ${yearFilter}` : sql``}
      ORDER BY i.embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `);
    
    console.log(`[CardOCR] Found ${result.rows.length} matches for set: ${setFilter}${yearFilter ? `, year: ${yearFilter}` : ''}`);
    
    return (result.rows as any[]).map(row => ({
      category: 'cards',
      categoryDisplayName: 'Trading Cards',
      familyId: row.family_id,
      familyName: row.family,
      brand: row.brand,
      displayName: row.display_name,
      similarity: parseFloat(row.similarity),
      imagePath: row.storage_path,
    }));
  } catch (err: any) {
    console.error('[CardOCR] Set search failed:', err.message);
    return [];
  }
}

/**
 * Use OpenAI Vision to detect if image is a watch AND read brand, colors from dial
 * Returns { isWatch: boolean, brand: string | null, dialColor, bezelColor }
 */
async function detectWatchAndBrand(imageBase64: string): Promise<{ 
  isWatch: boolean; 
  brand: string | null; 
  model?: string;
  dialColor?: string;
  bezelColor?: string;
}> {
  try {
    console.log('[WatchOCR] Detecting watch brand and colors...');
    
    const imageUrl = imageBase64.startsWith('data:') 
      ? imageBase64 
      : `data:image/jpeg;base64,${imageBase64}`;
    
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini', // Use mini for speed
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this watch. Read the brand from dial. Identify dial and bezel colors.

Common brands: INVICTA, ROLEX, OMEGA, SEIKO, CITIZEN, CASIO, TAG HEUER, FOSSIL, TISSOT, HAMILTON, BULOVA, ORIENT, TIMEX, MOVADO, BREITLING, TUDOR, LONGINES, CARTIER, HUBLOT

Bezel colors: black, blue, red, green, gold, silver, two-tone, pepsi (blue+red), batman (blue+black), coke (black+red), root_beer (brown+gold)
Dial colors: black, blue, white, silver, gold, champagne, green, gray, mother_of_pearl, skeleton, panda (white with black subdials)

Return JSON: {"isWatch": true, "brand": "BrandName", "dialColor": "color", "bezelColor": "color"} or {"isWatch": false}`
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl, detail: 'low' }
            }
          ]
        }
      ],
      max_tokens: 80,
      response_format: { type: "json_object" },
    });
    
    const content = response.choices[0]?.message?.content?.trim() || '';
    console.log(`[WatchOCR] Raw result: "${content}"`);
    
    // Parse JSON response
    try {
      let cleanContent = content;
      if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      }
      
      const parsed = JSON.parse(cleanContent);
      
      if (!parsed.isWatch) {
        console.log('[WatchOCR] Not a watch');
        return { isWatch: false, brand: null };
      }
      
      let brand = parsed.brand;
      if (brand) {
        // Normalize brand name to match known brands
        const brandLower = brand.toLowerCase().replace(/[^a-z0-9\s]/g, '');
        for (const knownBrand of KNOWN_WATCH_BRANDS) {
          if (brandLower.includes(knownBrand.toLowerCase()) || 
              knownBrand.toLowerCase().includes(brandLower)) {
            brand = knownBrand;
            break;
          }
        }
        console.log(`[WatchOCR] Detected: brand=${brand}, dial=${parsed.dialColor}, bezel=${parsed.bezelColor}`);
      }
      
      return { 
        isWatch: true, 
        brand: brand || null,
        model: parsed.model || undefined,
        dialColor: parsed.dialColor || undefined,
        bezelColor: parsed.bezelColor || undefined,
      };
    } catch (parseErr) {
      console.error('[WatchOCR] Failed to parse response:', parseErr);
      return { isWatch: false, brand: null };
    }
  } catch (err: any) {
    console.error('[WatchOCR] Failed:', err.message);
    return { isWatch: false, brand: null };
  }
}

/**
 * Search watch category filtered by brand
 */
async function searchWatchesByBrand(
  embeddingVector: number[],
  brandFilter: string,
  limit: number = 10
): Promise<CrossCategoryMatch[]> {
  try {
    const embeddingStr = `[${embeddingVector.join(',')}]`;
    
    // Case-insensitive brand matching
    const result = await db.execute(sql`
      SELECT 
        i.family_id,
        f.family,
        f.brand,
        i.storage_path,
        1 - (i.embedding <=> ${embeddingStr}::vector) as similarity
      FROM watch_images i
      JOIN watch_families f ON i.family_id = f.id
      WHERE i.embedding IS NOT NULL
        AND (i.source IS NULL OR i.source != 'serp_bootstrap')
        AND LOWER(f.brand) = LOWER(${brandFilter})
      ORDER BY i.embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `);
    
    console.log(`[WatchOCR] Found ${result.rows.length} matches for brand: ${brandFilter}`);
    
    return (result.rows as any[]).map(row => ({
      category: 'watch',
      categoryDisplayName: 'Watches',
      familyId: row.family_id,
      familyName: row.family,
      brand: row.brand,
      similarity: parseFloat(row.similarity),
      imagePath: row.storage_path,
    }));
  } catch (err: any) {
    console.error('[WatchOCR] Brand search failed:', err.message);
    return [];
  }
}

const TOP_K_IMAGES = 60;
const TOP_N_RESULTS = 8;

const AUTO_SELECT_HIGH_THRESHOLD = 0.86;
const AUTO_SELECT_MEDIUM_THRESHOLD = 0.82;
const AUTO_SELECT_MIN_GAP = 0.04;
const AUTO_SELECT_MIN_SUPPORT = 3;
const USER_REQUIRED_THRESHOLD = 0.75;

const LIBRARY_BUILDING_THRESHOLD = 500;
const LIBRARY_LIMITED_THRESHOLD = 1500;

// Family locking constants
const FAMILY_TARGET_MIN = 25;
const FAMILY_TARGET_MAX = 40;

// Category to table mapping for all 10 categories
const CATEGORY_TABLES: Record<string, { images: string; families: string; displayName: string }> = {
  watch: { images: 'watch_images', families: 'watch_families', displayName: 'Watches' },
  shoe: { images: 'shoe_images', families: 'shoe_families', displayName: 'Shoes' },
  handbag: { images: 'handbag_images', families: 'handbag_families', displayName: 'Handbags' },
  gaming: { images: 'gaming_images', families: 'gaming_families', displayName: 'Gaming' },
  electronics: { images: 'electronics_images', families: 'electronics_families', displayName: 'Electronics' },
  toy: { images: 'toy_images', families: 'toy_families', displayName: 'Collectibles' },
  antique: { images: 'antique_images', families: 'antique_families', displayName: 'Antiques' },
  tool: { images: 'tool_images', families: 'tool_families', displayName: 'Tools' },
  vintage_clothing: { images: 'vintage_images', families: 'vintage_families', displayName: 'Vintage Clothing' },
  cards: { images: 'card_images', families: 'card_families', displayName: 'Trading Cards' },
};

/**
 * Get count of non-bootstrap images for a family (excludes serp_bootstrap).
 * Used for family quota/locking logic. Supports all 9 categories.
 */
export async function getFamilyImageCount(
  category: string,
  familyId: number
): Promise<{ total: number; nonBootstrap: number; isLocked: boolean }> {
  const tables = CATEGORY_TABLES[category.toLowerCase()] || CATEGORY_TABLES[category];
  
  if (!tables) {
    console.warn(`[getFamilyImageCount] Unknown category: ${category}`);
    return { total: 0, nonBootstrap: 0, isLocked: false };
  }
  
  try {
    const totalResult = await db.execute(
      sql`SELECT COUNT(*) as c FROM ${sql.raw(tables.images)} WHERE family_id = ${familyId}`
    );
    const nonBootstrapResult = await db.execute(
      sql`SELECT COUNT(*) as c FROM ${sql.raw(tables.images)} WHERE family_id = ${familyId} AND (source IS NULL OR source != 'serp_bootstrap')`
    );
    
    const total = Number((totalResult.rows[0] as any)?.c || 0);
    const nonBootstrap = Number((nonBootstrapResult.rows[0] as any)?.c || 0);
    
    return {
      total,
      nonBootstrap,
      isLocked: nonBootstrap >= FAMILY_TARGET_MIN  // Family is locked when it reaches minimum quota
    };
  } catch (error) {
    console.error(`[getFamilyImageCount] Error for ${category}/${familyId}:`, error);
    return { total: 0, nonBootstrap: 0, isLocked: false };
  }
}

export interface MatchCandidate {
  itemId: number;
  title: string;
  brand: string | null;
  modelFamily: string | null;
  variant: string | null;
  imageUrl: string | null;
  scores: number[];
  bestScore: number;
  avgTop3Score: number;
  supportCount: number;
}

export async function findVisualMatches(
  imageInput: string | Buffer,
  category: VisualMatchCategory,
  userId?: number
): Promise<VisualMatchResponse> {
  // Use category-specific tables for image count
  // IMPORTANT: Exclude serp_bootstrap images from family quotas and confidence scoring
  // serp_bootstrap images are for category recognition only
  const tables = CATEGORY_TABLES[category] || CATEGORY_TABLES['shoe'];
  const imageCountResult = await db.execute(
    sql`SELECT COUNT(*) as count FROM ${sql.raw(tables.images)} WHERE embedding IS NOT NULL AND (source IS NULL OR source != 'serp_bootstrap')`
  );
  
  const libraryImageCount = Number(imageCountResult.rows[0]?.count || 0);
  const libraryStatus = libraryImageCount < LIBRARY_BUILDING_THRESHOLD ? 'library_building' :
                        libraryImageCount < LIBRARY_LIMITED_THRESHOLD ? 'limited' : 'full';

  const { embedding, hash } = await generateImageEmbedding(imageInput);

  if (userId) {
    const existingSession = await db
      .select()
      .from(visualMatchSessions)
      .where(
        and(
          eq(visualMatchSessions.scanImageHash, hash),
          eq(visualMatchSessions.category, category),
          eq(visualMatchSessions.userId, userId)
        )
      )
      .limit(1);

    if (existingSession.length > 0 && existingSession[0].decision !== 'pending') {
      const session = existingSession[0];
      return {
        sessionId: session.id,
        topMatches: session.topMatches as VisualMatchResult[],
        decision: session.decision as 'auto_selected' | 'user_required' | 'no_confident_match',
        autoSelectedItem: session.bestItemId ? 
          (session.topMatches as VisualMatchResult[]).find(m => m.itemId === session.bestItemId) : undefined,
        bestScore: parseFloat(session.bestScore || '0'),
        scoreGap: parseFloat(session.scoreGap || '0'),
      };
    }
  }

  const embeddingArray = `[${embedding.join(',')}]`;
  
  // Use category-specific tables for vector search
  // IMPORTANT: Exclude serp_bootstrap images from scoring - they're for category routing only
  // All 9 categories now use generalized table mapping
  const nearestImages = await db.execute(sql`
    SELECT 
      img.id as image_id,
      img.family_id as item_id,
      img.original_url as image_url,
      fam.brand,
      fam.family as model_family,
      img.embedding <=> ${embeddingArray}::vector as distance
    FROM ${sql.raw(tables.images)} img
    JOIN ${sql.raw(tables.families)} fam ON img.family_id = fam.id
    WHERE fam.status IN ('locked', 'ready', 'active', 'building')
      AND img.embedding IS NOT NULL
      AND (img.source IS NULL OR img.source != 'serp_bootstrap')
    ORDER BY img.embedding <=> ${embeddingArray}::vector
    LIMIT ${TOP_K_IMAGES}
  `);

  const itemCandidates = new Map<number, MatchCandidate>();

  for (const row of nearestImages.rows as any[]) {
    const itemId = row.item_id;
    const distance = parseFloat(row.distance);
    const similarity = distanceToSimilarity(distance);

    if (!itemCandidates.has(itemId)) {
      // Build title from brand + model_family
      const title = `${row.brand || ''} ${row.model_family || ''}`.trim();
      itemCandidates.set(itemId, {
        itemId,
        title,
        brand: row.brand || null,
        modelFamily: row.model_family || null,
        variant: null,
        imageUrl: row.image_url,
        scores: [],
        bestScore: 0,
        avgTop3Score: 0,
        supportCount: 0,
      });
    }

    const candidate = itemCandidates.get(itemId)!;
    candidate.scores.push(similarity);
    if (similarity > candidate.bestScore) {
      candidate.bestScore = similarity;
      candidate.imageUrl = row.image_url;
    }
  }

  // No need for separate item lookup - we already have brand/family from the join

  const candidateValues = Array.from(itemCandidates.values());
  for (const candidate of candidateValues) {
    candidate.supportCount = candidate.scores.length;
    const sortedScores = [...candidate.scores].sort((a, b) => b - a);
    const top3 = sortedScores.slice(0, 3);
    candidate.avgTop3Score = top3.reduce((a, b) => a + b, 0) / top3.length;
  }

  const rankedCandidates = Array.from(itemCandidates.values())
    .sort((a, b) => {
      if (Math.abs(a.bestScore - b.bestScore) > 0.01) {
        return b.bestScore - a.bestScore;
      }
      if (Math.abs(a.avgTop3Score - b.avgTop3Score) > 0.01) {
        return b.avgTop3Score - a.avgTop3Score;
      }
      return b.supportCount - a.supportCount;
    })
    .slice(0, TOP_N_RESULTS);

  const topMatches: VisualMatchResult[] = rankedCandidates.map(c => ({
    itemId: c.itemId,
    title: c.title,
    brand: c.brand || undefined,
    modelFamily: c.modelFamily || undefined,
    variant: c.variant || undefined,
    imageUrl: c.imageUrl || undefined,
    bestImageScore: c.bestScore,
    avgTop3Score: c.avgTop3Score,
    supportCount: c.supportCount,
    confidence: c.bestScore >= AUTO_SELECT_HIGH_THRESHOLD ? 'high' :
                c.bestScore >= USER_REQUIRED_THRESHOLD ? 'medium' : 'low',
  }));

  const bestScore = topMatches[0]?.bestImageScore || 0;
  const secondScore = topMatches[1]?.bestImageScore || 0;
  const scoreGap = bestScore - secondScore;
  const bestSupport = topMatches[0]?.supportCount || 0;

  let decision: 'auto_selected' | 'user_required' | 'no_confident_match' | 'library_building';
  let autoSelectedItem: VisualMatchResult | undefined;

  if (libraryStatus === 'library_building') {
    decision = 'library_building';
  } else if (libraryStatus === 'limited') {
    if (bestScore >= AUTO_SELECT_HIGH_THRESHOLD) {
      decision = 'auto_selected';
      autoSelectedItem = topMatches[0];
    } else if (bestScore >= USER_REQUIRED_THRESHOLD) {
      decision = 'user_required';
    } else {
      decision = 'no_confident_match';
    }
  } else {
    if (bestScore >= AUTO_SELECT_HIGH_THRESHOLD) {
      decision = 'auto_selected';
      autoSelectedItem = topMatches[0];
    } else if (
      bestScore >= AUTO_SELECT_MEDIUM_THRESHOLD &&
      scoreGap >= AUTO_SELECT_MIN_GAP &&
      bestSupport >= AUTO_SELECT_MIN_SUPPORT
    ) {
      decision = 'auto_selected';
      autoSelectedItem = topMatches[0];
    } else if (bestScore >= USER_REQUIRED_THRESHOLD) {
      decision = 'user_required';
    } else {
      decision = 'no_confident_match';
    }
  }

  const [session] = await db
    .insert(visualMatchSessions)
    .values({
      userId: userId || null,
      category,
      scanImageUrl: typeof imageInput === 'string' ? imageInput : 'uploaded',
      scanImageHash: hash,
      topMatches,
      bestItemId: null, // family IDs are stored in topMatches, not library_items
      bestScore: bestScore.toString(),
      scoreGap: scoreGap.toString(),
      decision,
      visionUsed: false,
    })
    .returning();

  return {
    sessionId: session.id,
    topMatches,
    decision,
    autoSelectedItem,
    bestScore,
    scoreGap,
    libraryImageCount,
  };
}

export async function confirmMatch(
  sessionId: number,
  chosenItemId: number,
  addToLibrary: boolean = true
): Promise<{ success: boolean; imageAdded: boolean }> {
  const [session] = await db
    .select()
    .from(visualMatchSessions)
    .where(eq(visualMatchSessions.id, sessionId))
    .limit(1);

  if (!session) {
    throw new Error('Session not found');
  }

  const wasAutoSelected = session.decision === 'auto_selected' && session.bestItemId === chosenItemId;
  const action = wasAutoSelected ? 'confirmed' : 'corrected';

  await db.insert(matchFeedback).values({
    sessionId,
    chosenItemId,
    wasAutoSelected,
    autoSelectedItemId: session.bestItemId,
    autoSelectedScore: session.bestScore,
    finalScore: session.bestScore,
    action,
  });

  let imageAdded = false;

  if (addToLibrary && session.scanImageUrl && session.scanImageUrl !== 'uploaded') {
    const existingImage = await db
      .select()
      .from(libraryImages)
      .where(eq(libraryImages.imageHash, session.scanImageHash || ''))
      .limit(1);

    if (existingImage.length === 0) {
      try {
        const { embedding, hash } = await generateImageEmbedding(session.scanImageUrl);
        const quality = assessImageQuality(500, 500);
        
        if (quality.passesThreshold) {
          await db.insert(libraryImages).values({
            itemId: chosenItemId,
            category: session.category,
            imageUrl: session.scanImageUrl,
            imageHash: hash,
            imageType: session.category === 'watch' ? 'dial' : 
                       session.category === 'shoe' ? 'side' : 'front',
            source: 'user_scan',
            qualityScore: quality.score.toString(),
            width: quality.width,
            height: quality.height,
          });

          await db.execute(sql`
            UPDATE library_images 
            SET embedding = ${`[${embedding.join(',')}]`}::vector
            WHERE image_hash = ${hash}
          `);

          imageAdded = true;
        }
      } catch (error) {
        console.error('Failed to add scan image to library:', error);
      }
    }
  }

  return { success: true, imageAdded };
}

export async function getLibraryStats(category?: VisualMatchCategory) {
  const itemCountResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(libraryItems)
    .where(category ? eq(libraryItems.category, category) : sql`1=1`);

  const imageCountResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(libraryImages)
    .where(category ? eq(libraryImages.category, category) : sql`1=1`);

  const sessionCountResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(visualMatchSessions)
    .where(category ? eq(visualMatchSessions.category, category) : sql`1=1`);

  const autoSelectRate = await db.execute(sql`
    SELECT 
      COUNT(*) FILTER (WHERE decision = 'auto_selected') * 100.0 / NULLIF(COUNT(*), 0) as rate
    FROM visual_match_sessions
    ${category ? sql`WHERE category = ${category}` : sql``}
  `);

  const visionUsageRate = await db.execute(sql`
    SELECT 
      COUNT(*) FILTER (WHERE vision_used = true) * 100.0 / NULLIF(COUNT(*), 0) as rate
    FROM visual_match_sessions
    ${category ? sql`WHERE category = ${category}` : sql``}
  `);

  return {
    itemCount: Number(itemCountResult[0]?.count || 0),
    imageCount: Number(imageCountResult[0]?.count || 0),
    sessionCount: Number(sessionCountResult[0]?.count || 0),
    autoSelectRate: parseFloat((autoSelectRate.rows[0] as any)?.rate || '0'),
    visionUsageRate: parseFloat((visionUsageRate.rows[0] as any)?.rate || '0'),
  };
}

export async function createLibraryItem(data: {
  category: VisualMatchCategory;
  title: string;
  brand?: string;
  modelFamily?: string;
  modelName?: string;
  variant?: string;
  attributes?: Record<string, any>;
}) {
  const [item] = await db
    .insert(libraryItems)
    .values({
      category: data.category,
      title: data.title,
      brand: data.brand || null,
      modelFamily: data.modelFamily || null,
      modelName: data.modelName || null,
      variant: data.variant || null,
      attributes: data.attributes || {},
      status: 'active',
    })
    .returning();

  return item;
}

export async function addLibraryImage(
  itemId: number,
  imageUrl: string,
  imageType?: string
) {
  const [item] = await db
    .select()
    .from(libraryItems)
    .where(eq(libraryItems.id, itemId))
    .limit(1);

  if (!item) {
    throw new Error('Item not found');
  }

  const { embedding, hash } = await generateImageEmbedding(imageUrl);

  const existingImage = await db
    .select()
    .from(libraryImages)
    .where(eq(libraryImages.imageHash, hash))
    .limit(1);

  if (existingImage.length > 0) {
    throw new Error('Image already exists in library');
  }

  const [image] = await db
    .insert(libraryImages)
    .values({
      itemId,
      category: item.category,
      imageUrl,
      imageHash: hash,
      imageType: imageType || (item.category === 'watch' ? 'dial' : 
                               item.category === 'shoe' ? 'side' : 'front'),
      source: 'admin_upload',
      qualityScore: '1.0',
    })
    .returning();

  await db.execute(sql`
    UPDATE library_images 
    SET embedding = ${`[${embedding.join(',')}]`}::vector
    WHERE id = ${image.id}
  `);

  return image;
}

/**
 * Add a user-scanned image to the category-specific visual library tables.
 * This feeds the visual matching pipeline that uses watch_images, card_images, etc.
 */
export async function addUserScanToVisualLibrary(
  category: string,
  familyId: number,
  imageUrl: string,
  imageType?: string
): Promise<{ success: boolean; message: string }> {
  const tables = CATEGORY_TABLES[category.toLowerCase()];
  
  if (!tables) {
    return { success: false, message: `Unknown category: ${category}` };
  }
  
  try {
    // Generate embedding and hash
    const { embedding, hash } = await generateImageEmbedding(imageUrl);
    
    // Check for duplicate (category tables use sha256, not image_hash)
    const existing = await db.execute(
      sql`SELECT id FROM ${sql.raw(tables.images)} WHERE sha256 = ${hash} LIMIT 1`
    );
    
    if (existing.rows.length > 0) {
      return { success: false, message: 'Image already exists in library (duplicate)' };
    }
    
    // Verify family exists
    const familyCheck = await db.execute(
      sql`SELECT id FROM ${sql.raw(tables.families)} WHERE id = ${familyId} LIMIT 1`
    );
    
    if (familyCheck.rows.length === 0) {
      return { success: false, message: `Family ${familyId} not found in ${tables.families}` };
    }
    
    // Determine image type
    const type = imageType || (category === 'watch' ? 'dial' : 
                               category === 'shoe' ? 'side' : 
                               category === 'cards' ? 'front' : 'front');
    
    // Insert into category-specific table (using sha256 column name)
    const embeddingStr = `[${embedding.join(',')}]`;
    
    await db.execute(sql`
      INSERT INTO ${sql.raw(tables.images)} 
        (family_id, storage_path, sha256, source, embedding, created_at)
      VALUES 
        (${familyId}, ${imageUrl}, ${hash}, 'user_scan', ${embeddingStr}::vector, NOW())
    `);
    
    console.log(`[VisualLibrary] Added user scan to ${tables.images} for family ${familyId}`);
    return { success: true, message: 'Image added to visual library' };
    
  } catch (error: any) {
    console.error(`[VisualLibrary] Failed to add image:`, error.message);
    return { success: false, message: error.message };
  }
}

export async function getLibraryItems(
  category?: VisualMatchCategory,
  limit: number = 50,
  offset: number = 0
) {
  const items = await db
    .select()
    .from(libraryItems)
    .where(category ? eq(libraryItems.category, category) : sql`1=1`)
    .orderBy(desc(libraryItems.createdAt))
    .limit(limit)
    .offset(offset);

  const itemIds = items.map(i => i.id);
  
  let imagesByItem: Record<number, typeof libraryImages.$inferSelect[]> = {};
  
  if (itemIds.length > 0) {
    const images = await db
      .select()
      .from(libraryImages)
      .where(sql`${libraryImages.itemId} IN ${itemIds}`);
    
    for (const img of images) {
      if (!imagesByItem[img.itemId]) {
        imagesByItem[img.itemId] = [];
      }
      imagesByItem[img.itemId].push(img);
    }
  }

  return items.map(item => ({
    ...item,
    images: imagesByItem[item.id] || [],
    imageCount: (imagesByItem[item.id] || []).length,
  }));
}

// ============================================================================
// UNIFIED VISUAL-FIRST IDENTIFICATION PIPELINE
// Uses Jina CLIP embeddings + pgvector as PRIMARY, OpenAI Vision as BACKUP
// ============================================================================

export type MatchStrength = 'strong' | 'moderate' | 'weak' | 'none';
export type IdentifySource = 'visual_library' | 'openai' | 'combined' | 'verified' | 'openai_override' | 'openai_vision';

export interface VisualIdentifyCandidate {
  title: string;
  category: string;
  familyId?: number;
  familyName?: string;
  brand?: string;
  estimatedValue?: string;
  keyIdentifiers?: string[];
  visionSignals?: string[];
  confidence: number;
  matchStrength: MatchStrength;
  source: IdentifySource;
  compThumbnail?: string;
  needsMoreInfo?: string;
  brandAlternatives?: string[];  // Top brand guesses when brand text couldn't be read
  topAlternatives?: Array<{
    family: string;
    category: string;
    confidence: number;
  }>;
  // MODEL SELECTION: For watches when brand confirmed but model unclear
  needsModelSelection?: boolean;
  modelCandidates?: Array<{
    familyId: number;
    family: string;
    displayName: string;
    score: number;
  }>;
  // Watch colors detected from vision
  dialColor?: string;
  bezelColor?: string;
}

export interface VisualIdentifyResult {
  success: boolean;
  candidate?: VisualIdentifyCandidate | null;
  candidates?: VisualIdentifyCandidate[];
  error?: string;
  brandAlternatives?: string[];
  processingTimeMs?: number;
}

const STRONG_THRESHOLD = 0.25;
const MODERATE_THRESHOLD = 0.18;
const WEAK_THRESHOLD = 0.12;

interface CrossCategoryMatch {
  category: string;
  categoryDisplayName: string;
  familyId: number;
  familyName: string;
  brand?: string;
  similarity: number;
  imagePath?: string;
}

/**
 * Search a single category table for top matches
 */
async function searchCategoryTable(
  category: string,
  tables: { images: string; families: string; displayName: string },
  embeddingVector: number[],
  limit: number = 5
): Promise<CrossCategoryMatch[]> {
  try {
    const embeddingStr = `[${embeddingVector.join(',')}]`;
    
    const result = await db.execute(sql`
      SELECT 
        i.family_id,
        f.family,
        f.brand,
        i.storage_path,
        1 - (i.embedding <=> ${embeddingStr}::vector) as similarity
      FROM ${sql.raw(tables.images)} i
      JOIN ${sql.raw(tables.families)} f ON i.family_id = f.id
      WHERE i.embedding IS NOT NULL
        AND (i.source IS NULL OR i.source != 'serp_bootstrap')
      ORDER BY i.embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `);
    
    return (result.rows as any[]).map(row => ({
      category,
      categoryDisplayName: tables.displayName,
      familyId: row.family_id,
      familyName: row.family,
      brand: row.brand,
      similarity: parseFloat(row.similarity) || 0,
      imagePath: row.storage_path,
    }));
  } catch (error) {
    return [];
  }
}

/**
 * Aggregate matches by family across all categories
 */
function aggregateCrossCategory(matches: CrossCategoryMatch[]): Array<{
  category: string;
  categoryDisplayName: string;
  familyId: number;
  familyName: string;
  brand?: string;
  maxSimilarity: number;
  avgSimilarity: number;
  matchCount: number;
  bestImagePath?: string;
}> {
  const familyMap = new Map<string, {
    category: string;
    categoryDisplayName: string;
    familyId: number;
    familyName: string;
    brand?: string;
    similarities: number[];
    bestImagePath?: string;
    bestSimilarity: number;
  }>();
  
  for (const match of matches) {
    const key = `${match.category}:${match.familyId}`;
    const existing = familyMap.get(key);
    
    if (existing) {
      existing.similarities.push(match.similarity);
      if (match.similarity > existing.bestSimilarity) {
        existing.bestSimilarity = match.similarity;
        existing.bestImagePath = match.imagePath;
      }
    } else {
      familyMap.set(key, {
        category: match.category,
        categoryDisplayName: match.categoryDisplayName,
        familyId: match.familyId,
        familyName: match.familyName,
        brand: match.brand,
        similarities: [match.similarity],
        bestImagePath: match.imagePath,
        bestSimilarity: match.similarity,
      });
    }
  }
  
  return Array.from(familyMap.values()).map(data => ({
    category: data.category,
    categoryDisplayName: data.categoryDisplayName,
    familyId: data.familyId,
    familyName: data.familyName,
    brand: data.brand,
    maxSimilarity: data.bestSimilarity,
    avgSimilarity: data.similarities.reduce((a, b) => a + b, 0) / data.similarities.length,
    matchCount: data.similarities.length,
    bestImagePath: data.bestImagePath,
  })).sort((a, b) => b.maxSimilarity - a.maxSimilarity);
}

/**
 * Determine match strength from similarity score
 */
function computeMatchStrength(similarity: number): MatchStrength {
  if (similarity >= STRONG_THRESHOLD) return 'strong';
  if (similarity >= MODERATE_THRESHOLD) return 'moderate';
  if (similarity >= WEAK_THRESHOLD) return 'weak';
  return 'none';
}

/**
 * Get estimated value range based on category and family
 */
function getValueEstimate(category: string, familyName: string): string {
  const estimates: Record<string, Record<string, string>> = {
    watch: { 'Rolex': '$5,000 - $50,000', 'Omega': '$2,000 - $15,000', 'Tag Heuer': '$1,000 - $5,000', 'Seiko': '$100 - $800', 'default': '$50 - $500' },
    gaming: { 'PlayStation 5': '$300 - $500', 'Xbox Series X': '$350 - $500', 'Nintendo Switch': '$200 - $350', 'default': '$50 - $300' },
    shoe: { 'Jordan': '$150 - $500', 'Yeezy': '$200 - $600', 'default': '$50 - $200' },
    cards: { 'Prizm': '$20 - $500', 'Pokemon': '$10 - $300', 'default': '$5 - $100' },
    default: { default: '$25 - $200' },
  };
  
  const categoryEstimates = estimates[category] || estimates.default;
  for (const [key, value] of Object.entries(categoryEstimates)) {
    if (key !== 'default' && familyName.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }
  return categoryEstimates.default || '$25 - $200';
}

/**
 * MAIN: Visual-first identification with OpenAI fallback
 * 
 * Flow:
 * 1. Generate Jina CLIP embedding from image
 * 2. Search across ALL 10 category tables using pgvector cosine similarity
 * 3. Aggregate top hits by family, compute confidence
 * 4. If weak confidence (<0.18 similarity), fallback to OpenAI Vision
 * 5. Return best candidate with metadata for analysis
 */
// Cache for recent scan results (in-memory, clears on restart)
const scanResultCache = new Map<string, { result: VisualIdentifyResult; timestamp: number; category?: string }>();

// Tiered cache TTL by category - stable categories cache longer
const CACHE_TTL_BY_CATEGORY: Record<string, number> = {
  'watch': 24 * 60 * 60 * 1000,      // 24 hours - prices move over weeks
  'watches': 24 * 60 * 60 * 1000,    // 24 hours
  'shoe': 24 * 60 * 60 * 1000,       // 24 hours - stable market
  'shoes': 24 * 60 * 60 * 1000,      // 24 hours
  'vintage': 24 * 60 * 60 * 1000,    // 24 hours - slowest moving
  'antique': 24 * 60 * 60 * 1000,    // 24 hours
  'collectibles': 12 * 60 * 60 * 1000, // 12 hours - moderate stability
  'toy': 12 * 60 * 60 * 1000,        // 12 hours
  'funko': 12 * 60 * 60 * 1000,      // 12 hours
  'lego': 12 * 60 * 60 * 1000,       // 12 hours
  'electronics': 12 * 60 * 60 * 1000, // 12 hours - spikes on new releases
  'cards': 3 * 60 * 60 * 1000,       // 3 hours - events/games spike prices
  'trading_cards': 3 * 60 * 60 * 1000, // 3 hours
  'sports_cards': 3 * 60 * 60 * 1000,  // 3 hours
};
const DEFAULT_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours default

function getCacheTTL(category?: string): number {
  if (!category) return DEFAULT_CACHE_TTL_MS;
  const normalized = category.toLowerCase().replace(/[^a-z]/g, '');
  return CACHE_TTL_BY_CATEGORY[normalized] || DEFAULT_CACHE_TTL_MS;
}

// Pre-warm OCR promise cache (for speculative parallel execution)
let speculativeOCRPromise: Promise<{ isWatch: boolean; brand: string | null; model?: string; dialColor?: string; bezelColor?: string }> | null = null;

export async function identifyWithVisualLibrary(
  imageBase64: string,
  options: {
    fallbackToOpenAI?: boolean;
    openAIIdentifyFn?: (imageBase64: string) => Promise<any>;
    category?: string;  // If provided, search only this category first
  } = {}
): Promise<VisualIdentifyResult> {
  const { fallbackToOpenAI = true, openAIIdentifyFn, category } = options;
  const startTime = Date.now();
  
  try {
    console.log('[VisualFirst] Starting visual-first identification...');
    if (category) {
      console.log(`[VisualFirst] Brand-detected category: ${category} - searching this category first`);
    }
    
    const base64Data = imageBase64.includes(',') 
      ? imageBase64.split(',')[1] 
      : imageBase64;
    const buffer = Buffer.from(base64Data, 'base64');
    
    // SPEED OPTIMIZATION: Check cache for repeat scans (saves ~10-15 seconds)
    const crypto = await import('crypto');
    const imageHash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
    const cacheKey = `${imageHash}-${category || 'all'}`;
    const cachedResult = scanResultCache.get(cacheKey);
    const cacheTTL = getCacheTTL(cachedResult?.category || category);
    if (cachedResult && (Date.now() - cachedResult.timestamp) < cacheTTL) {
      const ttlHours = Math.round(cacheTTL / (60 * 60 * 1000));
      console.log(`[VisualFirst] Cache HIT for ${cacheKey} (TTL: ${ttlHours}h) - returning cached result instantly`);
      return { ...cachedResult.result, processingTimeMs: 0 }; // Instant!
    }
    
    // SPEED OPTIMIZATION: Start OCR speculatively in parallel with embedding
    // This saves ~5-8 seconds when the item turns out to be a watch
    console.log('[VisualFirst] Starting speculative OCR in parallel...');
    speculativeOCRPromise = detectWatchAndBrand(imageBase64).catch(err => {
      console.log('[VisualFirst] Speculative OCR failed (will retry if needed):', err.message);
      return { isWatch: false, brand: null };
    });
    
    // Pure visual matching - search across all 10 categories (or focused category first)
    let embeddingVector: number[];
    try {
      const embeddingResult = await generateImageEmbedding(buffer);
      embeddingVector = embeddingResult.embedding;
      console.log(`[VisualFirst] Generated embedding (${embeddingVector.length} dims)`);
    } catch (embErr: any) {
      console.error('[VisualFirst] Embedding failed:', embErr.message);
      
      if (fallbackToOpenAI && openAIIdentifyFn) {
        console.log('[VisualFirst] Falling back to OpenAI...');
        return await runOpenAIFallback(imageBase64, openAIIdentifyFn, startTime);
      }
      
      return {
        success: false,
        error: 'Failed to generate image embedding',
        processingTimeMs: Date.now() - startTime,
      };
    }
    
    const allMatches: CrossCategoryMatch[] = [];
    
    // If category detected via brand with high confidence, ONLY search that category
    // This prevents misrouting (e.g., Funko Pop being matched to Sports Cards)
    if (category && CATEGORY_TABLES[category]) {
      console.log(`[VisualFirst] BRAND-LOCKED: Only searching ${category} category`);
      const priorityMatches = await searchCategoryTable(category, CATEGORY_TABLES[category], embeddingVector, 15);
      allMatches.push(...priorityMatches);
      
      // DON'T search other categories when brand is detected
      // This ensures Funko Pops stay in Toys, not misrouted to Cards
    } else {
      // No brand detected - search all categories
      const searchPromises = Object.entries(CATEGORY_TABLES).map(([cat, tables]) =>
        searchCategoryTable(cat, tables, embeddingVector, 5)
      );
      
      const categoryResults = await Promise.all(searchPromises);
      for (const matches of categoryResults) {
        allMatches.push(...matches);
      }
    }
    
    console.log(`[VisualFirst] Found ${allMatches.length} matches across 10 categories`);
    
    if (allMatches.length === 0) {
      if (fallbackToOpenAI && openAIIdentifyFn) {
        console.log('[VisualFirst] No library matches, falling back to OpenAI...');
        return await runOpenAIFallback(imageBase64, openAIIdentifyFn, startTime);
      }
      
      return {
        success: false,
        error: 'No matches found in visual library',
        processingTimeMs: Date.now() - startTime,
      };
    }
    
    let sorted = aggregateCrossCategory(allMatches);
    let topMatch = sorted[0];
    let matchStrength = computeMatchStrength(topMatch.maxSimilarity);
    
    console.log(`[VisualFirst] Top: ${topMatch.familyName} (${topMatch.categoryDisplayName}) - similarity: ${topMatch.maxSimilarity.toFixed(3)}, strength: ${matchStrength}`);
    
    // WATCH BRAND VERIFICATION: Read brand from dial and filter results
    // This is critical because watches from different brands can look visually similar
    let brandConfirmed = false;
    let brandUncertain = false;
    let brandAlternatives: string[] = [];
    let watchColors: { dialColor?: string; bezelColor?: string } = {};
    
    if (topMatch.category === 'watch') {
      console.log('[VisualFirst] Watch detected - using speculative OCR result...');
      
      // Get unique brands from top visual matches for alternatives
      const brandsSet = new Set<string>();
      sorted.slice(0, 10).forEach(m => { if (m.brand) brandsSet.add(m.brand); });
      brandAlternatives = Array.from(brandsSet).slice(0, 3);
      
      // SPEED OPTIMIZATION: Use the speculatively-started OCR promise instead of starting new one
      // This saves ~5-8 seconds because OCR was running in parallel with embedding generation
      const brandCheck = speculativeOCRPromise 
        ? await speculativeOCRPromise 
        : await detectWatchAndBrand(imageBase64);
      speculativeOCRPromise = null; // Clear for next scan
      
      // Save detected colors for use in final candidate
      if (brandCheck.dialColor) watchColors.dialColor = brandCheck.dialColor;
      if (brandCheck.bezelColor) watchColors.bezelColor = brandCheck.bezelColor;
      
      if (brandCheck.isWatch && brandCheck.brand) {
        const detectedBrand = brandCheck.brand.toLowerCase();
        const topBrand = (topMatch.brand || '').toLowerCase();
        
        console.log(`[VisualFirst] OCR detected brand: "${brandCheck.brand}", top match brand: "${topMatch.brand}"`);
        
        // If detected brand differs from top match brand, re-filter results
        if (!topBrand.includes(detectedBrand) && !detectedBrand.includes(topBrand)) {
          console.log(`[VisualFirst] Brand mismatch! Filtering to ${brandCheck.brand} only...`);
          
          // Filter sorted matches to only include the detected brand
          const brandFiltered = sorted.filter(m => {
            const matchBrand = (m.brand || '').toLowerCase();
            return matchBrand.includes(detectedBrand) || detectedBrand.includes(matchBrand);
          });
          
          if (brandFiltered.length > 0) {
            sorted = brandFiltered;
            topMatch = sorted[0];
            matchStrength = computeMatchStrength(topMatch.maxSimilarity);
            brandConfirmed = true;
            console.log(`[VisualFirst] Brand-filtered top: ${topMatch.familyName} (${topMatch.brand}) - similarity: ${topMatch.maxSimilarity.toFixed(3)}`);
            
            // Check if we need model selection (multiple close candidates or low confidence)
            const AUTO_SELECT_THRESHOLD = 0.82;
            const CANDIDATE_THRESHOLD = 0.55;
            
            // Filter to unique families
            const uniqueFamilies = new Map<number, typeof sorted[0]>();
            for (const m of sorted) {
              if (!uniqueFamilies.has(m.familyId) && m.maxSimilarity >= CANDIDATE_THRESHOLD) {
                uniqueFamilies.set(m.familyId, m);
              }
            }
            const modelCandidates = Array.from(uniqueFamilies.values()).slice(0, 5);
            
            // INVICTA DIVER SPECIAL CASE: Pro Diver and Grand Diver are visually identical
            // from the front (especially 48mm Pro Diver vs 47mm Grand Diver). Always force
            // model selection when any diver model is detected.
            const isInvictaDiver = detectedBrand === 'invicta' && 
              modelCandidates.some(m => {
                const familyLower = (m.familyName || '').toLowerCase();
                return familyLower.includes('diver') || familyLower.includes('subaqua');
              });
            
            if (isInvictaDiver && modelCandidates.length > 1) {
              console.log(`[VisualFirst] INVICTA DIVER: Force model selection - Pro Diver/Grand Diver visually identical`);
              // Always require user to select between diver models
            }
            
            // If top match is below auto-select threshold and we have multiple candidates
            // OR if this is an Invicta diver (visually indistinguishable models)
            if ((topMatch.maxSimilarity < AUTO_SELECT_THRESHOLD && modelCandidates.length > 1) || 
                (isInvictaDiver && modelCandidates.length > 1)) {
              console.log(`[VisualFirst] MODEL SELECTION NEEDED: ${modelCandidates.length} candidates (top: ${topMatch.maxSimilarity.toFixed(3)} < ${AUTO_SELECT_THRESHOLD})`);
              
              return {
                success: true,
                candidate: {
                  title: brandCheck.brand,
                  category: 'Watches',
                  brand: brandCheck.brand,
                  estimatedValue: getValueEstimate('watch', brandCheck.brand),
                  keyIdentifiers: [brandCheck.brand],
                  visionSignals: [`Brand "${brandCheck.brand}" confirmed`],
                  confidence: 0.70,
                  matchStrength: 'moderate' as MatchStrength,
                  source: 'visual_library',
                  needsMoreInfo: 'Select your watch model',
                  needsModelSelection: true,
                  dialColor: brandCheck.dialColor,
                  bezelColor: brandCheck.bezelColor,
                  modelCandidates: modelCandidates.map(m => ({
                    familyId: m.familyId,
                    family: m.familyName,
                    displayName: `${m.brand} ${m.familyName}`,
                    score: m.maxSimilarity,
                  })),
                },
                processingTimeMs: Date.now() - startTime,
              };
            }
          } else {
            // Brand detected but no models in library - return generic result
            console.log(`[VisualFirst] No library images for ${brandCheck.brand}, returning brand-only result`);
            
            return {
              success: true,
              candidate: {
                title: brandCheck.model ? `${brandCheck.brand} ${brandCheck.model}` : brandCheck.brand,
                category: 'Watches',
                brand: brandCheck.brand,
                estimatedValue: getValueEstimate('watch', brandCheck.brand),
                keyIdentifiers: [brandCheck.brand, brandCheck.model].filter(Boolean) as string[],
                visionSignals: [`Brand "${brandCheck.brand}" read from dial`],
                confidence: 0.85,
                matchStrength: 'strong' as MatchStrength,
                source: 'openai_vision',
                needsMoreInfo: 'Model not in library - select specific model',
                dialColor: brandCheck.dialColor,
                bezelColor: brandCheck.bezelColor,
              },
              processingTimeMs: Date.now() - startTime,
            };
          }
        } else {
          brandConfirmed = true;
          console.log(`[VisualFirst] Brand confirmed: ${brandCheck.brand} matches ${topMatch.brand}`);
          
          // For watches, always show model selection if there are close alternatives
          // This prevents confusion between similar models like Pro Diver vs Grand Diver
          const MODEL_SELECTION_GAP = 0.05; // If top 2 matches are within 5%, show selection
          const detectedBrandLower = brandCheck.brand.toLowerCase();
          
          // Filter to only same-brand families
          const uniqueFamilies = new Map<number, typeof sorted[0]>();
          for (const m of sorted) {
            const matchBrand = (m.brand || '').toLowerCase();
            const sameBrand = matchBrand === detectedBrandLower || 
                              matchBrand.includes(detectedBrandLower) || 
                              detectedBrandLower.includes(matchBrand);
            if (!uniqueFamilies.has(m.familyId) && m.maxSimilarity >= 0.55 && sameBrand) {
              uniqueFamilies.set(m.familyId, m);
            }
          }
          const modelCandidates = Array.from(uniqueFamilies.values()).slice(0, 5);
          
          console.log(`[VisualFirst] Brand-filtered candidates for ${brandCheck.brand}: ${modelCandidates.map(m => m.familyName).join(', ')}`);
          
          // INVICTA DIVER SPECIAL CASE: Pro Diver and Grand Diver are visually identical
          // (especially 48mm Pro Diver vs 47mm Grand Diver). Force-include both families
          // when ANY diver model is detected, even if similarity is low.
          const isInvictaDiverBrandMatch = detectedBrandLower === 'invicta' && 
            modelCandidates.some(m => {
              const familyLower = (m.familyName || '').toLowerCase();
              return familyLower.includes('diver') || familyLower.includes('subaqua');
            });
          
          // Force-add Pro Diver and Grand Diver if they're missing from candidates
          if (isInvictaDiverBrandMatch) {
            let hasProDiver = modelCandidates.some(m => (m.familyName || '').toLowerCase().includes('pro diver'));
            let hasGrandDiver = modelCandidates.some(m => (m.familyName || '').toLowerCase().includes('grand diver'));
            
            // First, look for missing diver families in the full sorted list
            for (const m of sorted) {
              const familyLower = (m.familyName || '').toLowerCase();
              const matchBrand = (m.brand || '').toLowerCase();
              if (matchBrand !== 'invicta') continue;
              
              if (!hasProDiver && familyLower.includes('pro diver') && !uniqueFamilies.has(m.familyId)) {
                console.log(`[VisualFirst] INVICTA DIVER: Force-adding Pro Diver (was below threshold)`);
                uniqueFamilies.set(m.familyId, m);
                hasProDiver = true;
              }
              if (!hasGrandDiver && familyLower.includes('grand diver') && !uniqueFamilies.has(m.familyId)) {
                console.log(`[VisualFirst] INVICTA DIVER: Force-adding Grand Diver (was below threshold)`);
                uniqueFamilies.set(m.familyId, m);
                hasGrandDiver = true;
              }
            }
            
            // If still missing, query database directly for these families
            if (!hasProDiver || !hasGrandDiver) {
              console.log(`[VisualFirst] INVICTA DIVER: Querying database for missing diver families (Pro: ${hasProDiver}, Grand: ${hasGrandDiver})`);
              const invictaDiverFamilies = await db.select()
                .from(watchFamilies)
                .where(sql`LOWER(brand) = 'invicta' AND (LOWER(family) LIKE '%pro diver%' OR LOWER(family) LIKE '%grand diver%')`);
              
              for (const fam of invictaDiverFamilies) {
                const familyLower = (fam.family || '').toLowerCase();
                if (!hasProDiver && familyLower.includes('pro diver') && !uniqueFamilies.has(fam.id)) {
                  console.log(`[VisualFirst] INVICTA DIVER: Force-adding Pro Diver from DB (id=${fam.id})`);
                  uniqueFamilies.set(fam.id, {
                    familyId: fam.id,
                    familyName: fam.family,
                    brand: fam.brand,
                    maxSimilarity: 0.5, // Default score for DB-added families
                    category: 'watch',
                    categoryDisplayName: 'Watches',
                  } as any);
                }
                if (!hasGrandDiver && familyLower.includes('grand diver') && !uniqueFamilies.has(fam.id)) {
                  console.log(`[VisualFirst] INVICTA DIVER: Force-adding Grand Diver from DB (id=${fam.id})`);
                  uniqueFamilies.set(fam.id, {
                    familyId: fam.id,
                    familyName: fam.family,
                    brand: fam.brand,
                    maxSimilarity: 0.5, // Default score for DB-added families
                    category: 'watch',
                    categoryDisplayName: 'Watches',
                  } as any);
                }
              }
            }
            
            // Re-build candidates with forced additions
            const updatedCandidates = Array.from(uniqueFamilies.values()).slice(0, 6);
            modelCandidates.length = 0;
            modelCandidates.push(...updatedCandidates);
          }
          
          // Check if we have close alternatives OR if this is an Invicta diver
          if (modelCandidates.length > 1) {
            const gap = topMatch.maxSimilarity - (modelCandidates[1]?.maxSimilarity || 0);
            const needsSelection = gap < MODEL_SELECTION_GAP || isInvictaDiverBrandMatch;
            
            if (needsSelection) {
              if (isInvictaDiverBrandMatch) {
                console.log(`[VisualFirst] INVICTA DIVER: Force model selection - Pro Diver/Grand Diver visually identical`);
              } else {
                console.log(`[VisualFirst] WATCH MODEL SELECTION: Close alternatives detected (gap: ${(gap * 100).toFixed(1)}%)`);
              }
              
              return {
                success: true,
                candidate: {
                  title: brandCheck.brand,
                  category: 'Watches',
                  brand: brandCheck.brand,
                  estimatedValue: getValueEstimate('watch', brandCheck.brand),
                  keyIdentifiers: [brandCheck.brand],
                  visionSignals: [`Brand "${brandCheck.brand}" confirmed`, 'Select your watch model'],
                  confidence: 0.75,
                  matchStrength: 'moderate' as MatchStrength,
                  source: 'visual_library',
                  needsMoreInfo: 'Select your watch model',
                  needsModelSelection: true,
                  dialColor: brandCheck.dialColor,
                  bezelColor: brandCheck.bezelColor,
                  modelCandidates: modelCandidates.map(m => ({
                    familyId: m.familyId,
                    family: m.familyName,
                    displayName: `${brandCheck.brand} ${m.familyName}`,
                    score: m.maxSimilarity,
                  })),
                },
                processingTimeMs: Date.now() - startTime,
              };
            }
          }
        }
      } else {
        // Brand could NOT be read from dial - BLOCK and require retry or manual entry
        console.log(`[VisualFirst] BLOCKED: Could not read brand from dial. User must retry or enter manually.`);
        
        return {
          success: false,
          error: 'BRAND_REQUIRED',
          candidate: null,
          brandAlternatives,
          processingTimeMs: Date.now() - startTime,
        };
      }
    }
    
    // ELECTRONICS BRAND VERIFICATION: Many electronics (earbuds, headphones) look similar across brands
    // Verify the brand through OpenAI vision to prevent misidentification
    if (topMatch.category === 'electronics' && fallbackToOpenAI && openAIIdentifyFn) {
      console.log('[VisualFirst] Electronics detected - verifying brand through vision...');
      
      // For electronics with <85% similarity OR for earbuds/headphones (which look similar across brands)
      const isAudioProduct = topMatch.familyName.toLowerCase().includes('pod') ||
                             topMatch.familyName.toLowerCase().includes('bud') ||
                             topMatch.familyName.toLowerCase().includes('headphone') ||
                             topMatch.familyName.toLowerCase().includes('earphone') ||
                             (topMatch as any).subcategory === 'audio';
      
      if (isAudioProduct || topMatch.maxSimilarity < 0.85) {
        console.log(`[VisualFirst] Audio/low-confidence electronics - verifying brand...`);
        
        const openAIResult = await runOpenAIFallback(imageBase64, openAIIdentifyFn, startTime);
        
        if (openAIResult.success && openAIResult.candidate) {
          const openAIBrand = (openAIResult.candidate.brand || openAIResult.candidate.title?.split(' ')[0] || '').toLowerCase();
          const libraryBrand = (topMatch.brand || '').toLowerCase();
          
          console.log(`[VisualFirst] Electronics brand check: OpenAI says "${openAIBrand}", library match is "${libraryBrand}"`);
          
          // If OpenAI detected a different brand, prefer OpenAI result
          if (openAIBrand && libraryBrand && !libraryBrand.includes(openAIBrand) && !openAIBrand.includes(libraryBrand)) {
            console.log(`[VisualFirst] Brand mismatch for electronics! Using OpenAI result instead.`);
            
            // Check if OpenAI brand exists in our library
            const brandFiltered = sorted.filter(m => {
              const matchBrand = (m.brand || '').toLowerCase();
              return matchBrand.includes(openAIBrand) || openAIBrand.includes(matchBrand);
            });
            
            if (brandFiltered.length > 0) {
              // Switch to the brand-filtered result
              sorted = brandFiltered;
              topMatch = sorted[0];
              matchStrength = computeMatchStrength(topMatch.maxSimilarity);
              console.log(`[VisualFirst] Switched to ${topMatch.brand} ${topMatch.familyName}`);
            } else {
              // Brand not in library - return OpenAI result directly
              return openAIResult;
            }
          } else if (!openAIBrand || openAIBrand === 'null' || openAIBrand === 'unknown') {
            // OpenAI couldn't identify brand either - lower confidence
            console.log(`[VisualFirst] OpenAI couldn't verify brand - returning with lower confidence`);
            openAIResult.candidate.confidence = Math.min((openAIResult.candidate.confidence || 50), 60);
            openAIResult.candidate.needsMoreInfo = 'Brand could not be verified - confirm product';
            return openAIResult;
          }
        }
      }
    }
    
    // TRADING CARD OCR: Read player name + identify set/year from visual design
    // Cards require BOTH visual recognition (for set) AND text reading (for player name)
    let cardOCRResult: TradingCardOCRResult | null = null;
    
    if (topMatch.category === 'cards') {
      console.log('[VisualFirst] Trading card detected - reading card details...');
      
      cardOCRResult = await detectTradingCardDetails(imageBase64);
      
      if (cardOCRResult.isCard) {
        console.log(`[VisualFirst] Card OCR: ${cardOCRResult.playerName || 'Unknown Player'} - ${cardOCRResult.brand} ${cardOCRResult.set} ${cardOCRResult.year || ''}`);
        
        // If OCR detected a specific set, filter library results to that set
        if (cardOCRResult.set) {
          const setFiltered = sorted.filter(m => {
            const matchFamily = (m.familyName || '').toLowerCase();
            const detectedSet = (cardOCRResult!.set || '').toLowerCase();
            return matchFamily.includes(detectedSet) || detectedSet.includes(matchFamily);
          });
          
          if (setFiltered.length > 0) {
            sorted = setFiltered;
            topMatch = sorted[0];
            matchStrength = computeMatchStrength(topMatch.maxSimilarity);
            console.log(`[VisualFirst] Set-filtered to ${cardOCRResult.set}: ${topMatch.familyName}`);
          }
        }
      }
    }
    
    // For matches with close alternatives, use OpenAI to verify the specific model
    // This prevents confusion like PS5 controller vs PS4 controller
    const secondBest = sorted[1];
    const similarityGap = secondBest ? (topMatch.maxSimilarity - secondBest.maxSimilarity) : 1.0;
    const hasCloseAlternative = similarityGap < 0.05;
    
    // Require verification for moderate matches with close alternatives
    const needsVerification = matchStrength === 'moderate' && hasCloseAlternative;
    
    if (needsVerification) {
      console.log(`[VisualFirst] Close alternatives detected (gap: ${(similarityGap * 100).toFixed(1)}%), verifying...`);
    }
    
    if ((matchStrength === 'none' || matchStrength === 'weak' || needsVerification) && fallbackToOpenAI && openAIIdentifyFn) {
      console.log(`[VisualFirst] ${needsVerification ? 'Verifying moderate match' : 'Weak/no match'}, trying OpenAI...`);
      const openAIResult = await runOpenAIFallback(imageBase64, openAIIdentifyFn, startTime);
      
      if (openAIResult.success && openAIResult.candidate) {
        // For verification mode, check if OpenAI confirms the library match
        if (needsVerification) {
          const libraryTitle = topMatch.familyName.toLowerCase();
          const libraryBrand = (topMatch.brand || '').toLowerCase();
          const openAITitle = (openAIResult.candidate.title || '').toLowerCase();
          const openAIBrand = (openAIResult.candidate.brand || '').toLowerCase();
          
          // Robust verification: check multiple criteria for product match
          // 1. Brand match (if both have brands)
          const brandMatches = libraryBrand && openAIBrand && 
            (libraryBrand.includes(openAIBrand) || openAIBrand.includes(libraryBrand));
          
          // 2. HIGH-SIGNAL model identifiers (specific model variants, not generic terms)
          // These are mutually exclusive identifiers that distinguish similar products
          const highSignalIdentifiers: [string, string[]][] = [
            // PlayStation generation (mutually exclusive)
            ['ps5', ['ps5', 'playstation 5']],
            ['ps4', ['ps4', 'playstation 4']],
            ['ps3', ['ps3', 'playstation 3']],
            // PlayStation controller types (mutually exclusive)
            ['dualsense_edge', ['dualsense edge']],
            ['dualsense', ['dualsense']],
            ['dualshock4', ['dualshock 4', 'ds4']],
            ['dualshock3', ['dualshock 3', 'ds3', 'sixaxis']],
            // Xbox generation (mutually exclusive)
            ['xbox_series', ['series x', 'series s', 'xbox series']],
            ['xbox_one', ['xbox one']],
            ['xbox_360', ['xbox 360', '360 controller']],
            // Xbox controller variants
            ['elite_2', ['elite series 2', 'elite 2']],
            ['elite_1', ['elite controller', 'elite series 1']],
            // Nintendo
            ['switch_pro', ['pro controller', 'switch pro']],
            ['joycon', ['joy-con', 'joycon']],
            ['gamecube', ['gamecube', 'wavebird']],
          ];
          
          // Find which high-signal identifiers each title has
          const getSignalId = (title: string): string | null => {
            for (const [id, patterns] of highSignalIdentifiers) {
              if (patterns.some(p => title.includes(p))) return id;
            }
            return null;
          };
          
          const librarySignalId = getSignalId(libraryTitle);
          const openAISignalId = getSignalId(openAITitle);
          
          // High-signal match: both have the SAME specific identifier
          const highSignalMatch = librarySignalId !== null && librarySignalId === openAISignalId;
          
          // 3. Significant word overlap (at least 2 meaningful words match, excluding generic terms)
          const genericTerms = ['controller', 'wireless', 'gaming', 'game', 'video', 'console', 'black', 'white', 'edition'];
          const libraryWords = libraryTitle.split(/\s+/).filter(w => w.length > 2 && !genericTerms.includes(w));
          const openAIWords = openAITitle.split(/\s+/).filter(w => w.length > 2 && !genericTerms.includes(w));
          const commonWords = libraryWords.filter(w => openAIWords.some(ow => ow.includes(w) || w.includes(ow)));
          const wordOverlap = commonWords.length >= 2;
          
          // Verification passes if: 
          // - High-signal identifiers match exactly (most reliable)
          // - OR brand matches AND word overlap (for non-gaming items)
          const verificationPassed = highSignalMatch || (brandMatches && wordOverlap);
          
          console.log(`[VisualFirst] Verification check: brand=${brandMatches}, highSignal=${librarySignalId}==${openAISignalId} (${highSignalMatch}), words=${commonWords.join(',')} (${wordOverlap})`);
          
          if (verificationPassed) {
            console.log(`[VisualFirst] OpenAI verified library match: ${topMatch.familyName}`);
            // Boost confidence since OpenAI confirmed
            const verifiedCandidate: VisualIdentifyCandidate = {
              title: topMatch.brand 
                ? `${topMatch.brand} ${topMatch.familyName}`
                : topMatch.familyName,
              category: topMatch.categoryDisplayName,
              familyId: topMatch.familyId,
              familyName: topMatch.familyName,
              brand: topMatch.brand,
              estimatedValue: getValueEstimate(topMatch.category, topMatch.familyName),
              confidence: Math.min(topMatch.maxSimilarity + 0.1, 0.95),
              matchStrength: 'strong', // Upgraded from moderate since verified
              source: 'verified', // Indicates both library + OpenAI agreed
              compThumbnail: topMatch.bestImagePath,
              topAlternatives: sorted.slice(1, 4).map(m => ({
                family: m.familyName,
                category: m.categoryDisplayName,
                confidence: m.maxSimilarity,
              })),
            };
            return {
              success: true,
              candidate: verifiedCandidate,
              candidates: [verifiedCandidate],
              processingTimeMs: Date.now() - startTime,
            };
          } else {
            // OpenAI disagrees - use OpenAI's identification but include library alternatives
            console.log(`[VisualFirst] OpenAI suggests different item: ${openAIResult.candidate.title} vs library: ${topMatch.familyName}`);
            openAIResult.candidate.topAlternatives = sorted.slice(0, 3).map(m => ({
              family: m.familyName,
              category: m.categoryDisplayName,
              confidence: m.maxSimilarity,
            }));
            openAIResult.candidate.source = 'openai_override';
            return openAIResult;
          }
        }
        
        if (matchStrength !== 'none') {
          openAIResult.candidate.topAlternatives = sorted.slice(0, 3).map(m => ({
            family: m.familyName,
            category: m.categoryDisplayName,
            confidence: m.maxSimilarity,
          }));
          openAIResult.candidate.source = 'combined';
        }
        return openAIResult;
      }
      
      if (matchStrength === 'none') {
        return openAIResult;
      }
    }
    
    // For trading cards with OCR, build title from player name + set + year
    let cardTitle = topMatch.brand 
      ? `${topMatch.brand} ${topMatch.familyName}`
      : topMatch.familyName;
    
    if (cardOCRResult?.isCard && cardOCRResult.playerName) {
      // Build comprehensive card title: Year Set Player Parallel [Grade]
      const parts: string[] = [];
      if (cardOCRResult.year) parts.push(cardOCRResult.year.toString());
      if (cardOCRResult.brand) parts.push(cardOCRResult.brand);
      if (cardOCRResult.set) parts.push(cardOCRResult.set);
      if (cardOCRResult.playerName) parts.push(cardOCRResult.playerName);
      if (cardOCRResult.parallel) parts.push(cardOCRResult.parallel);
      if (cardOCRResult.cardNumber) parts.push(`#${cardOCRResult.cardNumber}`);
      // Add grade info for graded cards (e.g., "PSA 10")
      if (cardOCRResult.isGraded && cardOCRResult.grader && cardOCRResult.grade) {
        parts.push(`${cardOCRResult.grader} ${cardOCRResult.grade}`);
      }
      cardTitle = parts.join(' ');
    }
    
    const candidate: VisualIdentifyCandidate = {
      title: topMatch.category === 'cards' && cardOCRResult?.isCard
        ? cardTitle
        : (topMatch.brand 
            ? `${topMatch.brand} ${topMatch.familyName}`
            : topMatch.familyName),
      category: topMatch.categoryDisplayName,
      familyId: topMatch.familyId,
      familyName: topMatch.familyName,
      brand: cardOCRResult?.isCard ? (cardOCRResult.brand || undefined) : topMatch.brand,
      estimatedValue: getValueEstimate(topMatch.category, topMatch.familyName),
      confidence: topMatch.maxSimilarity,
      matchStrength,
      source: 'visual_library',
      compThumbnail: topMatch.bestImagePath,
      topAlternatives: sorted.slice(1, 4).map(m => ({
        family: m.familyName,
        category: m.categoryDisplayName,
        confidence: m.maxSimilarity,
      })),
      // Include watch colors if detected via OCR
      ...(watchColors.dialColor && { dialColor: watchColors.dialColor }),
      ...(watchColors.bezelColor && { bezelColor: watchColors.bezelColor }),
    };
    
    // Add card metadata from OCR if available
    if (cardOCRResult?.isCard) {
      (candidate as any).cardMeta = {
        playerName: cardOCRResult.playerName,
        brand: cardOCRResult.brand,
        set: cardOCRResult.set,
        year: cardOCRResult.year,
        sport: cardOCRResult.sport,
        parallel: cardOCRResult.parallel,
        cardNumber: cardOCRResult.cardNumber,
        isGraded: cardOCRResult.isGraded,
        grader: cardOCRResult.grader,
        grade: cardOCRResult.grade,
      };
    }
    
    // Add brand uncertainty info for watches when brand couldn't be read
    if (brandUncertain && topMatch.category === 'watch') {
      candidate.needsMoreInfo = 'Brand unclear from photo - verify brand is correct';
      candidate.brandAlternatives = brandAlternatives;
      // Reduce confidence when brand is uncertain
      candidate.confidence = Math.max(candidate.confidence - 0.1, 0.5);
      candidate.matchStrength = candidate.confidence >= 0.75 ? 'moderate' : 'weak';
    } else if (matchStrength === 'weak' || matchStrength === 'moderate') {
      const secondBest = sorted[1];
      if (secondBest && (topMatch.maxSimilarity - secondBest.maxSimilarity) < 0.03) {
        candidate.needsMoreInfo = 'Multiple possible matches - confirm item type';
      }
    }
    
    const result = {
      success: true as const,
      candidate,
      candidates: [candidate],
      processingTimeMs: Date.now() - startTime,
    };
    
    // SPEED OPTIMIZATION: Cache successful results for repeat scans (tiered by category)
    const detectedCategory = result.candidate?.category || category;
    const ttlMs = getCacheTTL(detectedCategory);
    const ttlHours = Math.round(ttlMs / (60 * 60 * 1000));
    scanResultCache.set(cacheKey, { result, timestamp: Date.now(), category: detectedCategory });
    console.log(`[VisualFirst] Cached result for ${cacheKey} (TTL: ${ttlHours}h for ${detectedCategory || 'unknown'})`);
    
    return result;
    
  } catch (error: any) {
    console.error('[VisualFirst] Error:', error);
    
    if (fallbackToOpenAI && openAIIdentifyFn) {
      return await runOpenAIFallback(imageBase64, openAIIdentifyFn, startTime);
    }
    
    return {
      success: false,
      error: error.message || 'Visual matching failed',
      processingTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * OpenAI Vision fallback helper
 */
async function runOpenAIFallback(
  imageBase64: string,
  openAIIdentifyFn: (imageBase64: string) => Promise<any>,
  startTime: number
): Promise<VisualIdentifyResult> {
  try {
    console.log('[VisualFirst] Using OpenAI Vision fallback...');
    const result = await openAIIdentifyFn(imageBase64);
    
    if (result.candidates && result.candidates.length > 0) {
      const best = result.candidates[0];
      const candidate: VisualIdentifyCandidate = {
        title: best.title || 'Unknown Item',
        category: best.category || 'Other',
        brand: best.brand || best.brandDetected,
        estimatedValue: best.estimatedValue,
        confidence: best.confidence || 0.5,
        matchStrength: 'moderate',
        source: 'openai',
        needsMoreInfo: best.needsMoreInfo,
      };
      
      return {
        success: true,
        candidate,
        candidates: [candidate],
        processingTimeMs: Date.now() - startTime,
      };
    }
    
    return {
      success: false,
      error: 'OpenAI could not identify the item',
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error: any) {
    console.error('[VisualFirst] OpenAI fallback failed:', error);
    return {
      success: false,
      error: error.message || 'OpenAI identification failed',
      processingTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Quick brand detection for routing (checks for Funko, specific collectibles)
 */
async function detectBrandForRouting(imageBase64: string): Promise<{
  brand: string | null;
  category: string | null;
  confidence: number;
} | null> {
  try {
    const imageUrl = imageBase64.startsWith('data:') 
      ? imageBase64 
      : `data:image/jpeg;base64,${imageBase64}`;
    
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Quick check: Is this a Funko Pop, LEGO, Hot Wheels, or action figure box/product? 
Return JSON only: {"isFunko": true/false, "isLEGO": true/false, "isHotWheels": true/false, "isActionFigure": true/false, "brand": "Funko" or null}`
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl, detail: 'low' }
            }
          ]
        }
      ],
      temperature: 0.1,
    });
    
    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const result = JSON.parse(jsonMatch[0]);
    
    if (result.isFunko || result.brand === 'Funko') {
      console.log('[BrandDetect] Detected Funko Pop - routing to Toys');
      return { brand: 'Funko', category: 'toy', confidence: 0.95 };
    }
    if (result.isLEGO) {
      console.log('[BrandDetect] Detected LEGO - routing to Toys');
      return { brand: 'LEGO', category: 'toy', confidence: 0.95 };
    }
    if (result.isHotWheels) {
      console.log('[BrandDetect] Detected Hot Wheels - routing to Toys');
      return { brand: 'Hot Wheels', category: 'toy', confidence: 0.95 };
    }
    if (result.isActionFigure) {
      console.log('[BrandDetect] Detected Action Figure - routing to Toys');
      return { brand: 'Action Figure', category: 'toy', confidence: 0.90 };
    }
    
    return null;
  } catch (error) {
    console.error('[BrandDetect] Quick brand detection failed:', error);
    return null;
  }
}

/**
 * Quick category detection (for routing decisions)
 */
export async function detectCategoryVisual(imageBase64: string): Promise<{
  category: string;
  categoryKey: string;
  confidence: number;
} | null> {
  try {
    // First: Quick brand check for known collectibles (Funko, LEGO, etc.)
    const brandResult = await detectBrandForRouting(imageBase64);
    if (brandResult && brandResult.category) {
      console.log(`[VisualFirst] Brand-based routing: ${brandResult.brand} -> ${brandResult.category}`);
      return {
        category: CATEGORY_TABLES[brandResult.category]?.displayName || 'Collectibles',
        categoryKey: brandResult.category,
        confidence: brandResult.confidence,
      };
    }
    
    // Fallback: Embedding-based category detection
    const base64Data = imageBase64.includes(',') 
      ? imageBase64.split(',')[1] 
      : imageBase64;
    const buffer = Buffer.from(base64Data, 'base64');
    
    const embeddingResult = await generateImageEmbedding(buffer);
    const embeddingVector = embeddingResult.embedding;
    
    const categoryScores: Array<{ categoryKey: string; displayName: string; maxSimilarity: number }> = [];
    
    for (const [categoryKey, tables] of Object.entries(CATEGORY_TABLES)) {
      const matches = await searchCategoryTable(categoryKey, tables, embeddingVector, 3);
      if (matches.length > 0) {
        categoryScores.push({
          categoryKey,
          displayName: tables.displayName,
          maxSimilarity: Math.max(...matches.map(m => m.similarity)),
        });
      }
    }
    
    if (categoryScores.length === 0) return null;
    
    categoryScores.sort((a, b) => b.maxSimilarity - a.maxSimilarity);
    
    return {
      category: categoryScores[0].displayName,
      categoryKey: categoryScores[0].categoryKey,
      confidence: categoryScores[0].maxSimilarity,
    };
  } catch (error) {
    console.error('[VisualFirst] Category detection failed:', error);
    return null;
  }
}

// ============ INTELLIGENT LEARNING SYSTEM ============
// Validates and adds new items to the library when users scan them

interface NewModelValidation {
  isValid: boolean;
  brand: string;
  model: string;
  collection?: string;
  configurationGroup?: string;
  confidence: number;
  reason: string;
}

// ============================================================================
// KNOWN COLLECTIONS - Deterministic verification sources for all categories
// ============================================================================

// WATCHES - Known collections by brand
const KNOWN_WATCH_COLLECTIONS: Record<string, string[]> = {
  'invicta': ['pro diver', 'subaqua', 'bolt', 'specialty', 'reserve', 'venom', 'aviator', 'angel', 'lupah', 'russian diver', 'ocean voyage', 's1 rally', 'dna', 'speedway', 'coalition forces', 'marvel', 'disney', 'star wars', 'noma', 'excursion', 'akula', 'objet d art'],
  'seiko': ['prospex', 'presage', 'astron', 'premier', 'solar', 'automatic', '5 sports', 'cocktail time', 'alpinist', 'turtle', 'samurai', 'monster', 'king turtle', 'king samurai'],
  'orient': ['mako', 'ray', 'bambino', 'kamasu', 'triton', 'star', 'defender'],
  'casio': ['g-shock', 'edifice', 'pro trek', 'oceanus', 'baby-g', 'duro'],
  'citizen': ['eco-drive', 'promaster', 'chandler', 'corso', 'nighthawk', 'atomic', 'satellite wave'],
  'fossil': ['grant', 'machine', 'neutra', 'townsman', 'minimalist', 'hybrid'],
  'tissot': ['prx', 'seastar', 'gentleman', 'everytime', 't-race', 'chemin des tourelles', 'ballade'],
  'hamilton': ['khaki field', 'khaki navy', 'khaki aviation', 'jazzmaster', 'ventura', 'intra-matic', 'american classic'],
  'bulova': ['marine star', 'classic', 'precisionist', 'curv', 'computron', 'oceanographer'],
  'timex': ['weekender', 'expedition', 'easy reader', 'waterbury', 'q timex', 'mk1', 'marlin'],
};

// SHOES - Known models by brand
const KNOWN_SHOE_MODELS: Record<string, string[]> = {
  'nike': ['air force 1', 'air max', 'dunk', 'jordan', 'blazer', 'cortez', 'vapormax', 'react', 'pegasus', 'free run', 'huarache', 'zoom', 'sb', 'waffle', 'air flight'],
  'adidas': ['ultraboost', 'superstar', 'stan smith', 'nmd', 'yeezy', 'gazelle', 'samba', 'forum', 'campus', 'ozweego', 'continental', 'swift run'],
  'yeezy': ['350', '350 v2', '500', '700', '700 v2', '700 v3', '380', 'foam runner', 'slide', 'boost', 'quantum', 'qntm'],
  'jordan': ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', 'retro', 'mid', 'low', 'high'],
  'new balance': ['550', '990', '992', '993', '574', '327', '2002r', '530', '997', '998', '999', '1300', '1500'],
  'converse': ['chuck taylor', 'all star', 'one star', 'pro leather', 'run star', 'weapon'],
  'vans': ['old skool', 'sk8', 'era', 'authentic', 'slip-on', 'ultrarange'],
  'puma': ['suede', 'clyde', 'rs-x', 'cali', 'future rider', 'mayze'],
  'reebok': ['classic', 'club c', 'question', 'answer', 'shaq attaq', 'instapump'],
  'asics': ['gel-lyte', 'gel-kayano', 'gel-nimbus', 'gt-2000', 'gel-contend'],
};

// TRADING CARDS - Known sets by brand (for learning validation)
const KNOWN_CARD_SETS_BY_BRAND: Record<string, string[]> = {
  'panini': ['prizm', 'mosaic', 'select', 'contenders', 'national treasures', 'flawless', 'immaculate', 'donruss', 'hoops', 'absolute', 'optic', 'chronicles', 'revolution'],
  'topps': ['chrome', 'flagship', 'finest', 'dynasty', 'definitive', 'museum collection', 'allen & ginter', 'heritage', 'archives', 'stadium club', 'tier one', 'triple threads', 'bowman', 'bowman chrome'],
  'upper deck': ['sp authentic', 'spx', 'exquisite', 'the cup', 'young guns', 'series 1', 'series 2', 'black diamond', 'synergy'],
  'pokemon': ['base set', 'jungle', 'fossil', 'team rocket', 'scarlet & violet', 'sword & shield', 'sun & moon', 'xy', 'black & white', 'celebrations', 'evolving skies', 'fusion strike', 'brilliant stars', '151'],
  'konami': ['legend of blue eyes', 'metal raiders', 'pharaonic guardian', 'invasion of chaos', 'tactical masters'],
  'magic': ['alpha', 'beta', 'unlimited', 'arabian nights', 'antiquities', 'legends', 'modern horizons', 'double masters', 'commander legends'],
};

// FUNKO - Known lines
const KNOWN_FUNKO_LINES: string[] = [
  'pop!', 'pop', 'mystery mini', 'vinyl soda', 'hikari', 'dorbz', 'rock candy', 'pint size heroes', 'vynl', 'five star', 'bitty pop'
];

// Known Funko franchises
const KNOWN_FUNKO_FRANCHISES: string[] = [
  'marvel', 'star wars', 'disney', 'dc comics', 'harry potter', 'anime', 'stranger things', 'the office', 'friends', 'game of thrones', 'nba', 'nfl', 'mlb', 'wwe', 'pokemon', 'my hero academia', 'dragon ball', 'naruto', 'demon slayer', 'one piece'
];

// HANDBAGS - Known brands and lines
const KNOWN_HANDBAG_LINES: Record<string, string[]> = {
  'louis vuitton': ['neverfull', 'speedy', 'alma', 'keepall', 'pochette', 'dauphine', 'twist', 'capucines', 'noe', 'petit sac plat'],
  'chanel': ['classic flap', 'boy bag', 'gabrielle', '2.55', 'timeless', 'coco handle', 'deauville', 'grand shopping tote'],
  'gucci': ['dionysus', 'marmont', 'jackie', 'ophidia', 'soho', 'horsebit', 'bamboo', 'sylvie'],
  'prada': ['galleria', 're-edition', 'cleo', 'cahier', 'double bag', 'nylon'],
  'hermes': ['birkin', 'kelly', 'constance', 'garden party', 'lindy', 'picotin', 'herbag'],
  'dior': ['lady dior', 'book tote', 'saddle', 'bobby', '30 montaigne', 'diorissimo'],
  'fendi': ['baguette', 'peekaboo', 'kan i', 'sunshine', 'first'],
  'celine': ['luggage', 'phantom', 'belt bag', 'trio', 'classic box'],
  'ysl': ['loulou', 'kate', 'envelope', 'sunset', 'niki', 'manhattan'],
  'bottega veneta': ['pouch', 'cassette', 'arco', 'jodie', 'padded cassette'],
};

/**
 * Deterministic check: does the model name contain a known collection for this brand?
 */
function matchesKnownCollection(brand: string, modelName: string): { matches: boolean; collection?: string } {
  const brandLower = brand.toLowerCase();
  const modelLower = modelName.toLowerCase();
  
  const collections = KNOWN_WATCH_COLLECTIONS[brandLower];
  if (!collections) {
    // Unknown brand - can't verify deterministically
    return { matches: false };
  }
  
  for (const collection of collections) {
    if (modelLower.includes(collection)) {
      return { matches: true, collection };
    }
  }
  
  return { matches: false };
}

/**
 * Uses AI to validate that a watch model is real and not made up.
 * FIRST checks against known collections (deterministic), then AI for confirmation.
 */
export async function validateNewWatchModel(
  brand: string,
  modelName: string,
  visualTraits: {
    dialColor?: string;
    bezelType?: string;
    dialStyle?: string;
    uniqueFeatures?: string[];
  }
): Promise<NewModelValidation> {
  console.log(`[Learning Validation] Validating new model: ${brand} ${modelName}`);
  
  // STEP 1: Deterministic check against known collections
  const collectionCheck = matchesKnownCollection(brand, modelName);
  if (collectionCheck.matches) {
    console.log(`[Learning Validation] DETERMINISTIC MATCH: ${brand} ${modelName} matches known collection "${collectionCheck.collection}"`);
    return {
      isValid: true,
      brand,
      model: modelName,
      collection: collectionCheck.collection,
      configurationGroup: 'user_verified',
      confidence: 0.9, // High confidence for deterministic match
      reason: `Matches known ${brand} collection: ${collectionCheck.collection}`,
    };
  }
  
  // STEP 2: AI validation for models not in known collections
  const client = getOpenAIClient();
  
  const prompt = `You are a watch expert validating if a model name is a real, legitimate product.

Brand: ${brand}
Model Name: ${modelName}
Visual Traits: ${JSON.stringify(visualTraits)}

Determine if this is a REAL watch model from this brand. Consider:
1. Does this brand make a model with this name?
2. Do the visual traits match what this model should look like?
3. Is this a known product line/collection?

KNOWN INVICTA COLLECTIONS: Pro Diver, Subaqua, Bolt, Specialty, Reserve, Venom, Aviator, Angel, Lupah, Russian Diver, Ocean Voyage, S1 Rally, DNA, Speedway, Coalition Forces, Marvel, Disney, Star Wars

RESPONSE FORMAT (JSON only):
{
  "isValid": true/false,
  "confidence": 0.0-1.0,
  "collection": "collection name if known",
  "configurationGroup": "visual config group (e.g., rotating_bezel_diver, fixed_bezel_dress, anchor_nautical)",
  "reason": "brief explanation"
}`;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 300,
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      console.log(`[Learning Validation] Result: ${result.isValid ? 'VALID' : 'INVALID'} (${result.confidence}) - ${result.reason}`);
      
      return {
        isValid: result.isValid === true,
        brand,
        model: modelName,
        collection: result.collection || undefined,
        configurationGroup: result.configurationGroup || 'unclassified',
        confidence: result.confidence || 0,
        reason: result.reason || 'Validation complete',
      };
    }
  } catch (error: any) {
    console.error(`[Learning Validation] Error: ${error.message}`);
  }
  
  // STRICT: If AI validation failed, DO NOT accept with fallback
  // This prevents fabricated models from entering the library
  console.log(`[Learning Validation] AI validation failed - REJECTING ${brand} ${modelName}`);
  return {
    isValid: false,
    brand,
    model: modelName,
    configurationGroup: 'unclassified',
    confidence: 0,
    reason: 'Could not verify model exists - AI validation required',
  };
}

// ============================================================================
// SHOE VALIDATION
// ============================================================================

/**
 * Deterministic check for shoes - does model contain known shoe line?
 */
function matchesKnownShoeModel(brand: string, modelName: string): { matches: boolean; collection?: string } {
  const brandLower = brand.toLowerCase();
  const modelLower = modelName.toLowerCase();
  
  const models = KNOWN_SHOE_MODELS[brandLower];
  if (!models) return { matches: false };
  
  for (const model of models) {
    if (modelLower.includes(model)) {
      return { matches: true, collection: model };
    }
  }
  return { matches: false };
}

/**
 * Validates a shoe model using deterministic check + AI fallback.
 */
export async function validateNewShoeModel(
  brand: string,
  modelName: string,
  visualTraits: Record<string, any> = {}
): Promise<NewModelValidation> {
  console.log(`[Shoe Validation] Validating: ${brand} ${modelName}`);
  
  // STEP 1: Deterministic check
  const modelCheck = matchesKnownShoeModel(brand, modelName);
  if (modelCheck.matches) {
    console.log(`[Shoe Validation] DETERMINISTIC MATCH: ${modelCheck.collection}`);
    return {
      isValid: true,
      brand,
      model: modelName,
      collection: modelCheck.collection,
      configurationGroup: 'sneaker',
      confidence: 0.9,
      reason: `Matches known ${brand} model: ${modelCheck.collection}`,
    };
  }
  
  // STEP 2: AI validation fallback
  const client = getOpenAIClient();
  const prompt = `Validate if this is a REAL shoe model:
Brand: ${brand}
Model: ${modelName}
Visual: ${JSON.stringify(visualTraits)}

KNOWN SHOE BRANDS: Nike, Adidas, Yeezy, Jordan, New Balance, Converse, Vans, Puma, Reebok, ASICS

RESPONSE (JSON only):
{ "isValid": true/false, "confidence": 0.0-1.0, "collection": "model line", "reason": "brief" }`;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 200,
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        isValid: result.isValid === true,
        brand,
        model: modelName,
        collection: result.collection || undefined,
        configurationGroup: 'sneaker',
        confidence: result.confidence || 0,
        reason: result.reason || 'Validation complete',
      };
    }
  } catch (error: any) {
    console.error(`[Shoe Validation] Error: ${error.message}`);
  }
  
  return { isValid: false, brand, model: modelName, configurationGroup: 'sneaker', confidence: 0, reason: 'Could not verify shoe model' };
}

// ============================================================================
// TRADING CARD VALIDATION
// ============================================================================

/**
 * Deterministic check for cards - does model contain known card set?
 */
function matchesKnownCardSet(brand: string, modelName: string): { matches: boolean; collection?: string } {
  const brandLower = brand.toLowerCase();
  const modelLower = modelName.toLowerCase();
  
  const sets = KNOWN_CARD_SETS_BY_BRAND[brandLower];
  if (!sets) return { matches: false };
  
  for (const set of sets) {
    if (modelLower.includes(set)) {
      return { matches: true, collection: set };
    }
  }
  return { matches: false };
}

/**
 * Validates a trading card using deterministic check + AI fallback.
 */
export async function validateNewCardModel(
  brand: string,
  modelName: string,
  visualTraits: Record<string, any> = {}
): Promise<NewModelValidation> {
  console.log(`[Card Validation] Validating: ${brand} ${modelName}`);
  
  // STEP 1: Deterministic check
  const setCheck = matchesKnownCardSet(brand, modelName);
  if (setCheck.matches) {
    console.log(`[Card Validation] DETERMINISTIC MATCH: ${setCheck.collection}`);
    return {
      isValid: true,
      brand,
      model: modelName,
      collection: setCheck.collection,
      configurationGroup: 'trading_card',
      confidence: 0.9,
      reason: `Matches known ${brand} set: ${setCheck.collection}`,
    };
  }
  
  // STEP 2: AI validation fallback
  const client = getOpenAIClient();
  const prompt = `Validate if this is a REAL trading card:
Brand: ${brand}
Card: ${modelName}
Visual: ${JSON.stringify(visualTraits)}

KNOWN CARD BRANDS: Panini, Topps, Upper Deck, Pokemon, Konami, Magic

RESPONSE (JSON only):
{ "isValid": true/false, "confidence": 0.0-1.0, "collection": "set name", "reason": "brief" }`;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 200,
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        isValid: result.isValid === true,
        brand,
        model: modelName,
        collection: result.collection || undefined,
        configurationGroup: 'trading_card',
        confidence: result.confidence || 0,
        reason: result.reason || 'Validation complete',
      };
    }
  } catch (error: any) {
    console.error(`[Card Validation] Error: ${error.message}`);
  }
  
  return { isValid: false, brand, model: modelName, configurationGroup: 'trading_card', confidence: 0, reason: 'Could not verify card' };
}

// ============================================================================
// FUNKO VALIDATION
// ============================================================================

/**
 * Validates a Funko Pop using line and franchise checks.
 */
export async function validateNewFunkoModel(
  brand: string,
  modelName: string,
  visualTraits: Record<string, any> = {}
): Promise<NewModelValidation> {
  console.log(`[Funko Validation] Validating: ${brand} ${modelName}`);
  const modelLower = modelName.toLowerCase();
  
  // Check if it's a known Funko line
  const hasKnownLine = KNOWN_FUNKO_LINES.some(line => modelLower.includes(line));
  const hasKnownFranchise = KNOWN_FUNKO_FRANCHISES.some(franchise => modelLower.includes(franchise));
  
  if (hasKnownLine && hasKnownFranchise) {
    console.log(`[Funko Validation] DETERMINISTIC MATCH: Known line + franchise`);
    return {
      isValid: true,
      brand: 'Funko',
      model: modelName,
      collection: 'Pop!',
      configurationGroup: 'funko_pop',
      confidence: 0.9,
      reason: 'Matches known Funko line and franchise',
    };
  }
  
  // AI fallback for less common items
  const client = getOpenAIClient();
  const prompt = `Validate if this is a REAL Funko product:
Product: ${modelName}
Visual: ${JSON.stringify(visualTraits)}

KNOWN FUNKO LINES: Pop!, Mystery Mini, Vinyl Soda, Hikari, Dorbz
KNOWN FRANCHISES: Marvel, Star Wars, Disney, DC, Harry Potter, Anime

RESPONSE (JSON only):
{ "isValid": true/false, "confidence": 0.0-1.0, "collection": "line name", "reason": "brief" }`;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 200,
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        isValid: result.isValid === true,
        brand: 'Funko',
        model: modelName,
        collection: result.collection || 'Pop!',
        configurationGroup: 'funko_pop',
        confidence: result.confidence || 0,
        reason: result.reason || 'Validation complete',
      };
    }
  } catch (error: any) {
    console.error(`[Funko Validation] Error: ${error.message}`);
  }
  
  return { isValid: false, brand: 'Funko', model: modelName, configurationGroup: 'funko_pop', confidence: 0, reason: 'Could not verify Funko product' };
}

// ============================================================================
// HANDBAG VALIDATION
// ============================================================================

/**
 * Deterministic check for handbags - does model contain known bag line?
 */
function matchesKnownHandbagLine(brand: string, modelName: string): { matches: boolean; collection?: string } {
  const brandLower = brand.toLowerCase();
  const modelLower = modelName.toLowerCase();
  
  const lines = KNOWN_HANDBAG_LINES[brandLower];
  if (!lines) return { matches: false };
  
  for (const line of lines) {
    if (modelLower.includes(line)) {
      return { matches: true, collection: line };
    }
  }
  return { matches: false };
}

/**
 * Validates a handbag using deterministic check + AI fallback.
 */
export async function validateNewHandbagModel(
  brand: string,
  modelName: string,
  visualTraits: Record<string, any> = {}
): Promise<NewModelValidation> {
  console.log(`[Handbag Validation] Validating: ${brand} ${modelName}`);
  
  // STEP 1: Deterministic check
  const lineCheck = matchesKnownHandbagLine(brand, modelName);
  if (lineCheck.matches) {
    console.log(`[Handbag Validation] DETERMINISTIC MATCH: ${lineCheck.collection}`);
    return {
      isValid: true,
      brand,
      model: modelName,
      collection: lineCheck.collection,
      configurationGroup: 'luxury_handbag',
      confidence: 0.9,
      reason: `Matches known ${brand} line: ${lineCheck.collection}`,
    };
  }
  
  // STEP 2: AI validation fallback
  const client = getOpenAIClient();
  const prompt = `Validate if this is a REAL luxury handbag:
Brand: ${brand}
Model: ${modelName}
Visual: ${JSON.stringify(visualTraits)}

KNOWN BRANDS: Louis Vuitton, Chanel, Gucci, Prada, Hermes, Dior, Fendi, Celine, YSL, Bottega Veneta

RESPONSE (JSON only):
{ "isValid": true/false, "confidence": 0.0-1.0, "collection": "bag line", "reason": "brief" }`;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 200,
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        isValid: result.isValid === true,
        brand,
        model: modelName,
        collection: result.collection || undefined,
        configurationGroup: 'luxury_handbag',
        confidence: result.confidence || 0,
        reason: result.reason || 'Validation complete',
      };
    }
  } catch (error: any) {
    console.error(`[Handbag Validation] Error: ${error.message}`);
  }
  
  return { isValid: false, brand, model: modelName, configurationGroup: 'luxury_handbag', confidence: 0, reason: 'Could not verify handbag' };
}

// ============================================================================
// GENERIC ITEM VALIDATION (Electronics, etc.)
// ============================================================================

/**
 * Generic AI validation for categories without deterministic lists.
 */
export async function validateGenericItem(
  category: string,
  brand: string,
  modelName: string,
  visualTraits: Record<string, any> = {}
): Promise<NewModelValidation> {
  console.log(`[Generic Validation] Validating ${category}: ${brand} ${modelName}`);
  
  const client = getOpenAIClient();
  const prompt = `Validate if this is a REAL ${category} product:
Brand: ${brand}
Model: ${modelName}
Visual: ${JSON.stringify(visualTraits)}

Determine if this is a legitimate product that exists in the market.

RESPONSE (JSON only):
{ "isValid": true/false, "confidence": 0.0-1.0, "collection": "product line if known", "reason": "brief explanation" }`;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 200,
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        isValid: result.isValid === true,
        brand,
        model: modelName,
        collection: result.collection || undefined,
        configurationGroup: category.toLowerCase(),
        confidence: result.confidence || 0,
        reason: result.reason || 'Validation complete',
      };
    }
  } catch (error: any) {
    console.error(`[Generic Validation] Error: ${error.message}`);
  }
  
  return { isValid: false, brand, model: modelName, configurationGroup: category.toLowerCase(), confidence: 0, reason: `Could not verify ${category}` };
}

/**
 * Creates a new watch family for a validated model and adds the first image.
 * Called when user confirms a model that doesn't exist in the database.
 * Uses existing addUserScanToVisualLibrary to properly store images.
 */
export async function createNewWatchFamily(
  brand: string,
  model: string,
  collection: string | undefined,
  configurationGroup: string,
  imageDataUrl: string,
  attributes: Record<string, any> = {}
): Promise<{ familyId: number; imageAdded: boolean; message: string }> {
  console.log(`[Learning Create] Creating new family: ${brand} ${model}`);
  
  try {
    // Check if family already exists
    const existingFamily = await db
      .select()
      .from(watchFamilies)
      .where(and(
        eq(watchFamilies.brand, brand),
        eq(watchFamilies.family, model)
      ))
      .limit(1);
    
    if (existingFamily.length > 0) {
      console.log(`[Learning Create] Family already exists: ${existingFamily[0].id}`);
      return {
        familyId: existingFamily[0].id,
        imageAdded: false,
        message: 'Family already exists',
      };
    }
    
    // Create new family with 'building' status
    const displayName = collection 
      ? `${brand} ${collection} ${model}`
      : `${brand} ${model}`;
    
    const [newFamily] = await db
      .insert(watchFamilies)
      .values({
        brand,
        collection: collection || null,
        configurationGroup: configurationGroup || 'unclassified',
        family: model,
        displayName,
        attributes: {
          ...attributes,
          source: 'user_learning',
          createdFromScan: true,
        },
        minImagesRequired: 15,
        targetImages: 25,
        status: 'building',
      })
      .returning();
    
    console.log(`[Learning Create] Created family #${newFamily.id}: ${displayName}`);
    
    // Use existing addUserScanToVisualLibrary to properly add image with embedding
    let imageAdded = false;
    if (imageDataUrl && imageDataUrl.startsWith('data:')) {
      try {
        const result = await addUserScanToVisualLibrary('watch', newFamily.id, imageDataUrl, 'dial');
        imageAdded = result.success;
        
        if (result.success) {
          console.log(`[Learning Create] First image added to new family #${newFamily.id}`);
        } else {
          console.log(`[Learning Create] Could not add first image: ${result.message}`);
        }
      } catch (imgError: any) {
        console.error(`[Learning Create] Image add failed: ${imgError.message}`);
      }
    }
    
    return {
      familyId: newFamily.id,
      imageAdded,
      message: `Created new family: ${displayName}`,
    };
  } catch (error: any) {
    console.error(`[Learning Create] Error: ${error.message}`);
    throw error;
  }
}

/**
 * Main entry point for learning new items across ALL categories.
 * Validates item is real, creates family if needed, and adds image.
 */
export async function learnNewItem(
  category: 'watch' | 'shoe' | 'cards' | 'toy' | 'handbag' | 'electronics',
  brand: string,
  model: string,
  imageDataUrl: string,
  visualTraits: Record<string, any> = {}
): Promise<{ 
  success: boolean; 
  familyId?: number; 
  isNewFamily: boolean; 
  message: string;
}> {
  console.log(`[Learning] Processing new ${category}: ${brand} ${model}`);
  
  // Route to category-specific validation and creation
  switch (category) {
    case 'watch':
      return await learnWatch(brand, model, imageDataUrl, visualTraits);
    case 'shoe':
      return await learnShoe(brand, model, imageDataUrl, visualTraits);
    case 'cards':
      return await learnCard(brand, model, imageDataUrl, visualTraits);
    case 'toy':
      return await learnToy(brand, model, imageDataUrl, visualTraits);
    case 'handbag':
      return await learnHandbag(brand, model, imageDataUrl, visualTraits);
    case 'electronics':
      return await learnGenericItem('electronics', brand, model, imageDataUrl, visualTraits);
    default:
      console.log(`[Learning] Category ${category} not supported`);
      return { success: false, isNewFamily: false, message: `Category not supported: ${category}` };
  }
}

// ============================================================================
// CATEGORY-SPECIFIC LEARNING FUNCTIONS
// ============================================================================

async function learnWatch(brand: string, model: string, imageDataUrl: string, visualTraits: Record<string, any>) {
  const validation = await validateNewWatchModel(brand, model, visualTraits);
  
  if (!validation.isValid || validation.confidence < 0.7) {
    console.log(`[Learning Watch] REJECTED (confidence=${validation.confidence}): ${validation.reason}`);
    return {
      success: false,
      isNewFamily: false,
      message: `Could not verify "${model}" as a real ${brand} watch (${Math.round(validation.confidence * 100)}%). ${validation.reason}`,
    };
  }
  
  // Check if family exists
  const existingFamily = await db.select().from(watchFamilies)
    .where(and(eq(watchFamilies.brand, brand), eq(watchFamilies.family, model)))
    .limit(1);
  
  if (existingFamily.length > 0) {
    const result = await addUserScanToVisualLibrary('watch', existingFamily[0].id, imageDataUrl);
    return { success: result.success, familyId: existingFamily[0].id, isNewFamily: false, message: result.success ? 'Image added to existing watch family' : result.message };
  }
  
  // Create new family
  const result = await createNewWatchFamily(brand, model, validation.collection, validation.configurationGroup || 'unclassified', imageDataUrl, visualTraits);
  return { success: true, familyId: result.familyId, isNewFamily: true, message: result.message };
}

async function learnShoe(brand: string, model: string, imageDataUrl: string, visualTraits: Record<string, any>) {
  const validation = await validateNewShoeModel(brand, model, visualTraits);
  
  if (!validation.isValid || validation.confidence < 0.7) {
    console.log(`[Learning Shoe] REJECTED (confidence=${validation.confidence}): ${validation.reason}`);
    return {
      success: false,
      isNewFamily: false,
      message: `Could not verify "${model}" as a real ${brand} shoe (${Math.round(validation.confidence * 100)}%). ${validation.reason}`,
    };
  }
  
  // Check if family exists
  const existingFamily = await db.select().from(shoeFamilies)
    .where(and(eq(shoeFamilies.brand, brand), eq(shoeFamilies.family, model)))
    .limit(1);
  
  if (existingFamily.length > 0) {
    const result = await addUserScanToVisualLibrary('shoe', existingFamily[0].id, imageDataUrl);
    return { success: result.success, familyId: existingFamily[0].id, isNewFamily: false, message: result.success ? 'Image added to existing shoe family' : result.message };
  }
  
  // Create new shoe family
  const displayName = `${brand} ${model}`;
  const [newFamily] = await db.insert(shoeFamilies).values({
    brand,
    family: model,
    displayName,
    attributes: { ...visualTraits, source: 'user_learning', createdFromScan: true },
    minImagesRequired: 15,
    targetImages: 25,
    status: 'building',
  }).returning();
  
  console.log(`[Learning Shoe] Created family #${newFamily.id}: ${displayName}`);
  
  // Add first image
  let imageAdded = false;
  if (imageDataUrl?.startsWith('data:')) {
    try {
      const result = await addUserScanToVisualLibrary('shoe', newFamily.id, imageDataUrl);
      imageAdded = result.success;
    } catch (e: any) {
      console.error(`[Learning Shoe] Image add error: ${e.message}`);
    }
  }
  
  return { success: true, familyId: newFamily.id, isNewFamily: true, message: `Created shoe family: ${displayName}` };
}

async function learnCard(brand: string, model: string, imageDataUrl: string, visualTraits: Record<string, any>) {
  const validation = await validateNewCardModel(brand, model, visualTraits);
  
  if (!validation.isValid || validation.confidence < 0.7) {
    console.log(`[Learning Card] REJECTED (confidence=${validation.confidence}): ${validation.reason}`);
    return {
      success: false,
      isNewFamily: false,
      message: `Could not verify "${model}" as a real ${brand} card (${Math.round(validation.confidence * 100)}%). ${validation.reason}`,
    };
  }
  
  // Check if family exists
  const existingFamily = await db.select().from(cardFamilies)
    .where(and(eq(cardFamilies.brand, brand), eq(cardFamilies.family, model)))
    .limit(1);
  
  if (existingFamily.length > 0) {
    const result = await addUserScanToVisualLibrary('cards', existingFamily[0].id, imageDataUrl);
    return { success: result.success, familyId: existingFamily[0].id, isNewFamily: false, message: result.success ? 'Image added to existing card family' : result.message };
  }
  
  // Create new card family
  const displayName = `${brand} ${model}`;
  const [newFamily] = await db.insert(cardFamilies).values({
    brand,
    family: model,
    displayName,
    subcategory: visualTraits.subcategory || 'sports',
    sport: visualTraits.sport || null,
    attributes: { ...visualTraits, source: 'user_learning', createdFromScan: true },
    minImagesRequired: 15,
    targetImages: 25,
    status: 'building',
  }).returning();
  
  console.log(`[Learning Card] Created family #${newFamily.id}: ${displayName}`);
  
  // Add first image
  if (imageDataUrl?.startsWith('data:')) {
    try {
      await addUserScanToVisualLibrary('cards', newFamily.id, imageDataUrl);
    } catch (e: any) {
      console.error(`[Learning Card] Image add error: ${e.message}`);
    }
  }
  
  return { success: true, familyId: newFamily.id, isNewFamily: true, message: `Created card family: ${displayName}` };
}

async function learnToy(brand: string, model: string, imageDataUrl: string, visualTraits: Record<string, any>) {
  const validation = await validateNewFunkoModel(brand, model, visualTraits);
  
  if (!validation.isValid || validation.confidence < 0.7) {
    console.log(`[Learning Toy] REJECTED (confidence=${validation.confidence}): ${validation.reason}`);
    return {
      success: false,
      isNewFamily: false,
      message: `Could not verify "${model}" as a real toy/Funko (${Math.round(validation.confidence * 100)}%). ${validation.reason}`,
    };
  }
  
  // Toys use the generic libraryItems table
  const existingItem = await db.select().from(libraryItems)
    .where(and(eq(libraryItems.brand, brand), eq(libraryItems.modelName, model)))
    .limit(1);
  
  if (existingItem.length > 0) {
    const result = await addUserScanToVisualLibrary('toy', existingItem[0].id, imageDataUrl);
    return { success: result.success, familyId: existingItem[0].id, isNewFamily: false, message: result.success ? 'Image added to existing toy' : result.message };
  }
  
  // Create new library item for toy
  const [newItem] = await db.insert(libraryItems).values({
    category: 'toy',
    brand,
    modelName: model,
    modelFamily: validation.collection || 'Pop!',
    title: `${brand} ${model}`,
    attributes: { ...visualTraits, source: 'user_learning', line: validation.collection },
    status: 'building',
  }).returning();
  
  console.log(`[Learning Toy] Created item #${newItem.id}: ${brand} ${model}`);
  
  if (imageDataUrl?.startsWith('data:')) {
    try {
      await addUserScanToVisualLibrary('toy', newItem.id, imageDataUrl);
    } catch (e: any) {
      console.error(`[Learning Toy] Image add error: ${e.message}`);
    }
  }
  
  return { success: true, familyId: newItem.id, isNewFamily: true, message: `Created toy: ${brand} ${model}` };
}

async function learnHandbag(brand: string, model: string, imageDataUrl: string, visualTraits: Record<string, any>) {
  const validation = await validateNewHandbagModel(brand, model, visualTraits);
  
  if (!validation.isValid || validation.confidence < 0.7) {
    console.log(`[Learning Handbag] REJECTED (confidence=${validation.confidence}): ${validation.reason}`);
    return {
      success: false,
      isNewFamily: false,
      message: `Could not verify "${model}" as a real ${brand} handbag (${Math.round(validation.confidence * 100)}%). ${validation.reason}`,
    };
  }
  
  // Handbags use the generic libraryItems table
  const existingItem = await db.select().from(libraryItems)
    .where(and(eq(libraryItems.brand, brand), eq(libraryItems.modelName, model)))
    .limit(1);
  
  if (existingItem.length > 0) {
    const result = await addUserScanToVisualLibrary('handbag', existingItem[0].id, imageDataUrl);
    return { success: result.success, familyId: existingItem[0].id, isNewFamily: false, message: result.success ? 'Image added to existing handbag' : result.message };
  }
  
  // Create new library item for handbag
  const [newItem] = await db.insert(libraryItems).values({
    category: 'handbag',
    brand,
    modelName: model,
    modelFamily: validation.collection || model,
    title: `${brand} ${model}`,
    attributes: { ...visualTraits, source: 'user_learning', line: validation.collection },
    status: 'building',
  }).returning();
  
  console.log(`[Learning Handbag] Created item #${newItem.id}: ${brand} ${model}`);
  
  if (imageDataUrl?.startsWith('data:')) {
    try {
      await addUserScanToVisualLibrary('handbag', newItem.id, imageDataUrl);
    } catch (e: any) {
      console.error(`[Learning Handbag] Image add error: ${e.message}`);
    }
  }
  
  return { success: true, familyId: newItem.id, isNewFamily: true, message: `Created handbag: ${brand} ${model}` };
}

async function learnGenericItem(category: string, brand: string, model: string, imageDataUrl: string, visualTraits: Record<string, any>) {
  const validation = await validateGenericItem(category, brand, model, visualTraits);
  
  if (!validation.isValid || validation.confidence < 0.7) {
    console.log(`[Learning ${category}] REJECTED (confidence=${validation.confidence}): ${validation.reason}`);
    return {
      success: false,
      isNewFamily: false,
      message: `Could not verify "${model}" as a real ${brand} ${category} (${Math.round(validation.confidence * 100)}%). ${validation.reason}`,
    };
  }
  
  // Generic items use the libraryItems table
  const existingItem = await db.select().from(libraryItems)
    .where(and(eq(libraryItems.brand, brand), eq(libraryItems.modelName, model), eq(libraryItems.category, category)))
    .limit(1);
  
  if (existingItem.length > 0) {
    const result = await addUserScanToVisualLibrary(category as any, existingItem[0].id, imageDataUrl);
    return { success: result.success, familyId: existingItem[0].id, isNewFamily: false, message: result.success ? `Image added to existing ${category}` : result.message };
  }
  
  // Create new library item
  const [newItem] = await db.insert(libraryItems).values({
    category,
    brand,
    modelName: model,
    modelFamily: validation.collection || model,
    title: `${brand} ${model}`,
    attributes: { ...visualTraits, source: 'user_learning' },
    status: 'building',
  }).returning();
  
  console.log(`[Learning ${category}] Created item #${newItem.id}: ${brand} ${model}`);
  
  if (imageDataUrl?.startsWith('data:')) {
    try {
      await addUserScanToVisualLibrary(category as any, newItem.id, imageDataUrl);
    } catch (e: any) {
      console.error(`[Learning ${category}] Image add error: ${e.message}`);
    }
  }
  
  return { success: true, familyId: newItem.id, isNewFamily: true, message: `Created ${category}: ${brand} ${model}` };
}
