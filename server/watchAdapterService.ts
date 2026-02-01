/**
 * Watch Adapter Service - Server-side implementation
 * 
 * Resolves WatchIdentity from photos using visual library match + OCR
 * Fetches PriceTruth using condition-separated comps
 * Produces ComputedDecision via shared watchAdapter functions
 */

import { db } from './db';
import { watchFamilies, watchImages, WatchPipelineDebugTrace } from '@shared/schema';
import { eq, sql, desc, and, gt } from 'drizzle-orm';
import { generateImageEmbedding } from './embedding-service';
import OpenAI from 'openai';
import {
  WatchIdentity,
  WatchMatchingDebugTrace,
  PriceTruth,
  ComputedDecision,
  WatchEvidence,
  ConditionBucket,
  CompletenessBucket,
  IdentityConfidence,
  detectConditionBucket,
  determineIdentityConfidence,
  determinePricingConfidence,
  buildCompsQuery,
  buildNegativeKeywords,
  computeWatchDecision,
  generatePriceTruthCacheKey
} from '@shared/watchAdapter';

const openai = new OpenAI({ apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY });

// ============================================================================
// VISUAL LIBRARY MATCHING
// ============================================================================

interface LibraryMatchCandidate {
  familyId: number;
  brand: string;
  collection?: string; // e.g., "Subaqua", "Pro Diver"
  configurationGroup?: string; // e.g., "rotating_bezel_diver", "fixed_bezel_chrono"
  family: string;
  displayName: string;
  modelNumber?: string;
  score: number;
}

// Standard configuration groups based on visual traits
// These apply across all watch brands
export const CONFIGURATION_GROUPS = {
  // Diver configurations
  ROTATING_BEZEL_DIVER: 'rotating_bezel_diver',
  FIXED_BEZEL_DIVER: 'fixed_bezel_diver',
  
  // Chronograph configurations
  CHRONO_SUBDIALS: 'chrono_subdials',
  CHRONO_TACHYMETER: 'chrono_tachymeter',
  
  // Dress/sport configurations
  SKELETON_DIAL: 'skeleton_dial',
  OPEN_HEART: 'open_heart',
  DRESS_SIMPLE: 'dress_simple',
  SPORT_DIGITAL: 'sport_digital',
  
  // Case shape variants
  TONNEAU_CASE: 'tonneau_case',
  SQUARE_CASE: 'square_case',
  CUSHION_CASE: 'cushion_case',
  
  // Special features
  GMT_BEZEL: 'gmt_bezel',
  WORLD_TIME: 'world_time',
  MOONPHASE: 'moonphase',
  
  // Special bucket for unclassified families - used when configGroup is unknown
  UNCLASSIFIED: 'unclassified',
} as const;

// WatchMatchingDebugTrace is now imported from @shared/watchAdapter

/**
 * Match watch photo against visual library using CLIP embeddings
 * HIERARCHICAL ROUTING: Brand → Collection → ConfigurationGroup → Model
 */
async function matchWatchToLibrary(
  imageBuffer: Buffer,
  topK: number = 10,
  brandFilter?: string,
  collectionFilter?: string,
  configGroupFilter?: string
): Promise<LibraryMatchCandidate[]> {
  try {
    const embeddingResult = await generateImageEmbedding(imageBuffer);
    const embedding = embeddingResult.embedding;
    
    const vectorStr = `[${embedding.join(',')}]`;
    
    // HIERARCHICAL FILTERS: Brand → Collection → ConfigurationGroup
    const brandClause = brandFilter 
      ? sql`AND LOWER(wf.brand) = LOWER(${brandFilter})`
      : sql``;
    const collectionClause = collectionFilter
      ? sql`AND LOWER(wf.collection) = LOWER(${collectionFilter})`
      : sql``;
    const configGroupClause = configGroupFilter
      ? sql`AND wf.configuration_group = ${configGroupFilter}`
      : sql``;
    
    console.log(`[WatchAdapter] Library search: brand=${brandFilter || 'ALL'}, collection=${collectionFilter || 'ALL'}, configGroup=${configGroupFilter || 'ALL'}, topK=${topK}`);
    
    const results = await db.execute(sql`
      WITH image_matches AS (
        SELECT 
          wi.family_id,
          wf.brand,
          wf.collection,
          wf.configuration_group,
          wf.family,
          wf.display_name,
          wf.attributes->>'modelNumber' as model_number,
          1 - (wi.embedding <=> ${vectorStr}::vector) as similarity
        FROM watch_images wi
        JOIN watch_families wf ON wi.family_id = wf.id
        WHERE wi.embedding IS NOT NULL
          AND wf.status IN ('locked', 'ready', 'active', 'building')
          ${brandClause}
          ${collectionClause}
          ${configGroupClause}
        ORDER BY wi.embedding <=> ${vectorStr}::vector
        LIMIT 100
      )
      SELECT 
        family_id,
        brand,
        collection,
        configuration_group,
        family,
        display_name,
        model_number,
        MAX(similarity) as score,
        COUNT(*) as match_count
      FROM image_matches
      GROUP BY family_id, brand, collection, configuration_group, family, display_name, model_number
      ORDER BY score DESC
      LIMIT ${topK}
    `);
    
    const rows = results.rows as any[];
    return rows.map(row => ({
      familyId: row.family_id,
      brand: row.brand,
      collection: row.collection || undefined,
      configurationGroup: row.configuration_group || undefined,
      family: row.family,
      displayName: row.display_name,
      modelNumber: row.model_number || undefined,
      score: parseFloat(row.score) || 0
    }));
  } catch (error) {
    console.error('[WatchAdapter] Library match error:', error);
    return [];
  }
}

// ============================================================================
// VISION ANALYSIS (BRAND DETECTION FROM DIAL)
// ============================================================================

interface VisionAnalysis {
  brand?: string;
  modelName?: string;
  collection?: string;
  dialColor?: string;
  dialStyle?: 'roman' | 'arabic' | 'stick' | 'diamond' | 'mixed' | 'unknown';
  materials?: string;
  bezelType?: 'fluted' | 'smooth' | 'diver' | 'tachymeter' | 'gmt' | 'diamond' | 'ceramic' | 'coin_edge' | 'fixed' | 'unknown';
  hasChronograph?: boolean; // subdials visible
  hasSkeleton?: boolean; // visible movement through dial
  hasOpenHeart?: boolean; // partial skeleton at specific position
  caseShape?: 'round' | 'square' | 'tonneau' | 'cushion' | 'rectangular';
  ocrText?: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Infer configurationGroup from visual traits
 * This determines which bucket within a collection the watch belongs to
 */
function inferConfigurationGroup(vision: VisionAnalysis): string | undefined {
  // Skeleton takes priority
  if (vision.hasSkeleton) return CONFIGURATION_GROUPS.SKELETON_DIAL;
  if (vision.hasOpenHeart) return CONFIGURATION_GROUPS.OPEN_HEART;
  
  // Chronograph detection
  if (vision.hasChronograph) {
    if (vision.bezelType === 'tachymeter') return CONFIGURATION_GROUPS.CHRONO_TACHYMETER;
    return CONFIGURATION_GROUPS.CHRONO_SUBDIALS;
  }
  
  // Bezel-based groups
  if (vision.bezelType === 'diver') return CONFIGURATION_GROUPS.ROTATING_BEZEL_DIVER;
  if (vision.bezelType === 'gmt') return CONFIGURATION_GROUPS.GMT_BEZEL;
  if (vision.bezelType === 'fixed') return CONFIGURATION_GROUPS.FIXED_BEZEL_DIVER;
  
  // Case shape variants
  if (vision.caseShape === 'tonneau') return CONFIGURATION_GROUPS.TONNEAU_CASE;
  if (vision.caseShape === 'square') return CONFIGURATION_GROUPS.SQUARE_CASE;
  if (vision.caseShape === 'cushion') return CONFIGURATION_GROUPS.CUSHION_CASE;
  
  // Default for simple dress watches
  if (vision.bezelType === 'smooth' || vision.bezelType === 'fluted') {
    return CONFIGURATION_GROUPS.DRESS_SIMPLE;
  }
  
  return undefined; // Cannot determine
}

const WATCH_VISION_PROMPT = `Analyze this watch dial/face photo for identification.

Extract ALL visible details:
1. BRAND - Read the brand name from the dial (e.g., "Invicta", "Seiko", "Rolex", "Omega")
2. MODEL NAME - Specific model visible on dial (e.g., "Pro Diver", "Submariner", "Speedmaster")
3. COLLECTION - Collection/line name if visible (e.g., "Specialty", "Presage", "Datejust")
4. DIAL COLOR - Describe the dial color (e.g., "blue sunburst", "black", "silver", "champagne")
5. DIAL STYLE - Hour marker style:
   - "roman" = Roman numeral hour markers (I, II, III, IV...)
   - "arabic" = Arabic number hour markers (1, 2, 3...)
   - "stick" = Line/baton indices only
   - "diamond" = Diamond or gem hour markers
   - "mixed" = Combination (e.g., roman + stick)
   - "unknown" = cannot determine
6. MATERIALS - Case/bracelet material:
   - "stainless steel" = silver-tone steel
   - "gold-tone" = gold plated/colored
   - "two-tone" = mixed gold and silver (IMPORTANT - look for gold accents on steel)
   - "rose gold" = pink gold color
   - "titanium" = grey matte metal
7. BEZEL TYPE - Bezel style:
   - "fluted" = ridged vertical lines around bezel
   - "smooth" = plain polished or brushed bezel
   - "diver" = rotating bezel with minute markers (can rotate)
   - "tachymeter" = speed scale on bezel
   - "gmt" = 24-hour scale for dual timezone
   - "diamond" = gem-set bezel
   - "ceramic" = ceramic insert bezel
   - "coin_edge" = serrated edge bezel
   - "fixed" = decorative non-rotating bezel (NOT a diver bezel)
   - "unknown" = cannot determine
8. CONFIGURATION TRAITS - CRITICAL for accurate identification:
   - hasChronograph: true if watch has subdials (small inner dials for timing)
   - hasSkeleton: true if watch movement is visible through the dial (can see gears/mechanism)
   - hasOpenHeart: true if there's a small cutout showing the balance wheel
   - caseShape: "round", "square", "tonneau" (barrel shape), "cushion", or "rectangular"
9. ANY TEXT - All readable text on the dial, bezel, or case

Return JSON ONLY:
{
  "brand": "Invicta",
  "modelName": "Pro Diver",
  "collection": "Specialty",
  "dialColor": "champagne",
  "dialStyle": "roman",
  "materials": "two-tone",
  "bezelType": "diver",
  "hasChronograph": false,
  "hasSkeleton": false,
  "hasOpenHeart": false,
  "caseShape": "round",
  "ocrText": "INVICTA SPECIALTY",
  "confidence": "high"
}

CRITICAL DISTINCTIONS:
- "diver" bezel = Has minute markers 0-60 and can physically rotate (diving watches)
- "fixed" bezel = Decorative bezel that does NOT rotate, may look similar but is fixed in place
- hasChronograph = Multiple small subdials (usually 2-3) for stopwatch function
- hasSkeleton = Can see actual watch movement/gears through dial (not just open caseback)

If brand cannot be read from the dial, set "brand": null and "confidence": "low".
IMPORTANT: Only report what you can actually READ/SEE from the image. Do not guess.`;

/**
 * Use OpenAI Vision to analyze watch dial for brand/model text
 */
async function analyzeWatchWithVision(imageBase64: string): Promise<VisionAnalysis | null> {
  try {
    const imageUrl = imageBase64.startsWith('data:') 
      ? imageBase64 
      : `data:image/jpeg;base64,${imageBase64}`;
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Use mini for speed
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: WATCH_VISION_PROMPT },
            { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } } // Low detail for speed
          ]
        }
      ],
      max_tokens: 300, // Reduced for speed
      temperature: 0.1
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) return null;
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const parsed = JSON.parse(jsonMatch[0]);
    const result: VisionAnalysis = {
      brand: parsed.brand || undefined,
      modelName: parsed.modelName || undefined,
      collection: parsed.collection || undefined,
      dialColor: parsed.dialColor || undefined,
      dialStyle: parsed.dialStyle || undefined,
      materials: parsed.materials || undefined,
      bezelType: parsed.bezelType || undefined,
      hasChronograph: parsed.hasChronograph === true,
      hasSkeleton: parsed.hasSkeleton === true,
      hasOpenHeart: parsed.hasOpenHeart === true,
      caseShape: parsed.caseShape || undefined,
      ocrText: parsed.ocrText || undefined,
      confidence: parsed.confidence || 'low'
    };
    console.log(`[WatchAdapter] Vision extracted config traits: chrono=${result.hasChronograph}, skeleton=${result.hasSkeleton}, openHeart=${result.hasOpenHeart}, caseShape=${result.caseShape}, bezel=${result.bezelType}`);
    
    // VISUAL MODEL INFERENCE: For brands where model isn't printed on dial
    // Infer model line from visual characteristics
    const inferredModel = inferModelFromVisualTraits(result);
    if (inferredModel && !result.modelName) {
      console.log(`[WatchAdapter] Inferred model from visual traits: ${inferredModel}`);
      result.modelName = inferredModel;
    }
    
    return result;
  } catch (error) {
    console.error('[WatchAdapter] Vision analysis error:', error);
    return null;
  }
}

/**
 * Infer model line from visual traits when not printed on dial
 * Critical for Invicta, Seiko, Casio etc. where model names aren't always visible
 */
function inferModelFromVisualTraits(vision: VisionAnalysis): string | null {
  const brand = vision.brand?.toLowerCase();
  
  // INVICTA MODEL INFERENCE
  if (brand === 'invicta') {
    // Pro Diver: Rotating diver bezel + round case (numbered bezel that rotates)
    if (vision.bezelType === 'diver') {
      return 'Pro Diver';
    }
    // Specialty: Fluted bezel dress watch (Datejust homage style)
    if (vision.bezelType === 'fluted') {
      return 'Specialty';
    }
    // Bolt: Distinctive cable-style case design, usually with tachymeter
    if (vision.caseShape === 'tonneau' || (vision.hasChronograph && vision.bezelType === 'tachymeter')) {
      return 'Bolt';
    }
    // Reserve: Large skeleton or complex chronograph
    if (vision.hasSkeleton || vision.hasOpenHeart) {
      return 'Reserve';
    }
    // Speedway: Chronograph with tachymeter, not skeleton
    if (vision.hasChronograph && vision.bezelType === 'tachymeter') {
      return 'Speedway';
    }
    // Aviator: Often has Arabic numerals, chronograph subdials
    if (vision.dialStyle === 'arabic' && vision.hasChronograph) {
      return 'Aviator';
    }
    // Specialty fallback: Smooth/fixed bezel dress watch without chronograph
    if ((vision.bezelType === 'smooth' || vision.bezelType === 'fixed') && !vision.hasChronograph) {
      return 'Specialty';
    }
  }
  
  // SEIKO MODEL INFERENCE
  if (brand === 'seiko') {
    if (vision.hasSkeleton || vision.hasOpenHeart) {
      return 'Presage';
    }
    if (vision.bezelType === 'diver') {
      return 'Prospex';
    }
  }
  
  // ORIENT MODEL INFERENCE
  if (brand === 'orient') {
    if (vision.hasOpenHeart) {
      return 'Bambino Open Heart';
    }
    if (vision.bezelType === 'diver') {
      return 'Mako';
    }
  }
  
  // CASIO MODEL INFERENCE
  if (brand === 'casio') {
    if (vision.bezelType === 'diver' || vision.caseShape === 'square') {
      return 'G-Shock';
    }
  }
  
  return null;
}

// ============================================================================
// IDENTITY RESOLUTION PIPELINE
// ============================================================================

export interface ResolveIdentityOptions {
  faceImageBase64: string;
  casebackImageBase64?: string; // OPTIONAL - never required, never blocks
  listingText?: string; // For URL-based scans only
  conditionHint?: ConditionBucket;
  /**
   * Completeness for photo scans MUST come from user prompt after identity resolution.
   * Do NOT infer completeness from images - it's impossible to see if box/papers exist.
   * For URL scans, can be inferred from listing text via detectCompletenessFromText().
   */
  completeness?: CompletenessBucket;
}

/**
 * Stage A + B + C: Full identity resolution pipeline
 * 
 * 1. Extract signals (OCR, visual match)
 * 2. Resolve Brand → Model
 * 3. Condition & completeness gating
 */
export async function resolveWatchIdentity(
  options: ResolveIdentityOptions
): Promise<WatchIdentity> {
  const { 
    faceImageBase64, 
    casebackImageBase64, 
    listingText = '',
    conditionHint,
    completeness = 'UNKNOWN'
  } = options;
  
  console.log('[WatchAdapter] Starting HIERARCHICAL identity resolution: Brand → Collection → ConfigGroup → Model');
  
  // Initialize debug trace
  const debugTrace: WatchMatchingDebugTrace = {
    detectedBrand: null,
    detectedConfigGroup: null,
    configGroupFilterApplied: false,
    configGroupFilterBypassed: false,
    candidateCount: 0,
    candidates: [],
    reasonCodes: []
  };
  
  const base64Data = faceImageBase64.includes(',') 
    ? faceImageBase64.split(',')[1] 
    : faceImageBase64;
  const imageBuffer = Buffer.from(base64Data, 'base64');
  
  // STEP 1: Vision analysis for brand + configuration detection (must happen first)
  const visionAnalysis = await analyzeWatchWithVision(faceImageBase64);
  const detectedBrand = visionAnalysis?.brand || null;
  const detectedConfigGroup = visionAnalysis ? inferConfigurationGroup(visionAnalysis) : undefined;
  const detectedCollection = visionAnalysis?.collection || undefined;
  
  debugTrace.detectedBrand = detectedBrand;
  debugTrace.detectedConfigGroup = detectedConfigGroup || null;
  
  console.log(`[WatchAdapter] STEP 1 - Vision analysis:`);
  console.log(`  Brand: ${detectedBrand || 'NONE'}`);
  console.log(`  Collection: ${detectedCollection || 'NONE'}`);
  console.log(`  ConfigGroup: ${detectedConfigGroup || 'NONE'}`);
  console.log(`  Bezel: ${visionAnalysis?.bezelType || 'unknown'}, Chrono: ${visionAnalysis?.hasChronograph || false}, Skeleton: ${visionAnalysis?.hasSkeleton || false}`);
  
  // STEP 2: HIERARCHICAL library matching with UNCLASSIFIED handling
  // configurationGroup is a HARD FILTER when it's a known value
  // 'unclassified' families are included when configGroup filter is bypassed
  let libraryMatches: LibraryMatchCandidate[];
  
  if (detectedBrand && detectedConfigGroup) {
    // Hard filter: Brand + ConfigGroup
    // ALSO include 'unclassified' families from same brand (they might match)
    debugTrace.configGroupFilterApplied = true;
    
    // First try exact configGroup match
    libraryMatches = await matchWatchToLibrary(imageBuffer, 10, detectedBrand, undefined, detectedConfigGroup);
    
    // Also search 'unclassified' families within same brand
    const unclassifiedMatches = await matchWatchToLibrary(imageBuffer, 5, detectedBrand, undefined, CONFIGURATION_GROUPS.UNCLASSIFIED);
    
    // Merge and re-sort by score
    if (unclassifiedMatches.length > 0) {
      libraryMatches = [...libraryMatches, ...unclassifiedMatches]
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      debugTrace.reasonCodes.push('UNCLASSIFIED_INCLUDED');
    }
    
    if (libraryMatches.length === 0) {
      console.log(`[WatchAdapter] HARD FILTER: No matches for brand=${detectedBrand} + configGroup=${detectedConfigGroup}. Library needs this variant seeded.`);
      debugTrace.reasonCodes.push('NO_LIBRARY_MATCHES');
    }
  } else if (detectedBrand) {
    // Brand detected but no configGroup from vision - search all configs within brand
    // This includes 'unclassified' families automatically
    debugTrace.configGroupFilterBypassed = true;
    debugTrace.bypassReason = 'NO_CONFIG_GROUP_DETECTED';
    libraryMatches = await matchWatchToLibrary(imageBuffer, 10, detectedBrand);
  } else {
    // No brand detected - search entire library (includes all configGroups)
    debugTrace.configGroupFilterBypassed = true;
    debugTrace.bypassReason = 'NO_BRAND_DETECTED';
    libraryMatches = await matchWatchToLibrary(imageBuffer, 10);
  }
  
  // Update debug trace with candidates
  debugTrace.candidateCount = libraryMatches.length;
  debugTrace.candidates = libraryMatches.slice(0, 5).map(m => ({
    familyId: m.familyId,
    displayName: m.displayName,
    configGroup: m.configurationGroup,
    score: m.score
  }));
  
  console.log(`[WatchAdapter] DEBUG TRACE:`, JSON.stringify(debugTrace, null, 2));
  
  console.log(`[WatchAdapter] STEP 2 - Library matches: ${libraryMatches.length} families`);
  
  const evidence: WatchEvidence = {
    photoSignals: [],
    libraryMatchCandidates: libraryMatches
  };
  
  if (visionAnalysis) {
    evidence.visionAnalysis = {
      brand: visionAnalysis.brand,
      modelName: visionAnalysis.modelName,
      collection: visionAnalysis.collection,
      dialColor: visionAnalysis.dialColor,
      dialStyle: visionAnalysis.dialStyle,
      materials: visionAnalysis.materials,
      bezelType: visionAnalysis.bezelType,
      hasChronograph: visionAnalysis.hasChronograph,
      hasSkeleton: visionAnalysis.hasSkeleton,
      hasOpenHeart: visionAnalysis.hasOpenHeart,
      caseShape: visionAnalysis.caseShape,
      inferredConfigGroup: detectedConfigGroup
    };
    evidence.ocrText = visionAnalysis.ocrText;
    
    if (visionAnalysis.brand) {
      evidence.photoSignals.push(`dial_brand:${visionAnalysis.brand}`);
    }
    if (visionAnalysis.collection) {
      evidence.photoSignals.push(`collection:${visionAnalysis.collection}`);
    }
    if (visionAnalysis.dialStyle) {
      evidence.photoSignals.push(`dial_style:${visionAnalysis.dialStyle}`);
    }
    if (visionAnalysis.materials) {
      evidence.photoSignals.push(`materials:${visionAnalysis.materials}`);
    }
    if (visionAnalysis.modelName) {
      evidence.photoSignals.push(`dial_model:${visionAnalysis.modelName}`);
    }
    if (detectedConfigGroup) {
      evidence.photoSignals.push(`config_group:${detectedConfigGroup}`);
    }
  }
  
  // STEP 3: Model resolution within brand bucket
  let resolvedBrand: string | null = detectedBrand;
  let resolvedModel: string | null = null;
  let resolvedModelNumber: string | undefined;
  let resolvedCollection: string | undefined;
  let brandConfirmed = !!detectedBrand;
  let modelConfirmed = false;
  let bestLibraryScore = 0;
  let modelCandidates: LibraryMatchCandidate[] = [];
  
  // CANDIDATE threshold for shortlist (user selection needed) - MUST match visual-matching.ts
  const CANDIDATE_THRESHOLD = 0.55;
  // MIN and MAX candidates to show user
  const MIN_CANDIDATES = 2;
  const MAX_CANDIDATES = 5;
  
  if (libraryMatches.length > 0) {
    const topMatch = libraryMatches[0];
    bestLibraryScore = topMatch.score;
    
    // Log all candidates for debugging
    console.log('[WatchAdapter] STEP 3 - Model candidates:');
    libraryMatches.forEach((m, i) => {
      console.log(`  ${i + 1}. ${m.family} (${m.brand}) - score: ${m.score.toFixed(3)}`);
    });
    
    // ALWAYS show candidates for user confirmation (no auto-select)
    // User must confirm model even if score is very high
    if (topMatch.score >= CANDIDATE_THRESHOLD) {
      // Get candidates above threshold, bounded between MIN and MAX
      const aboveThreshold = libraryMatches.filter(m => m.score >= CANDIDATE_THRESHOLD);
      
      // Ensure we show at least MIN_CANDIDATES (even if below threshold)
      if (aboveThreshold.length < MIN_CANDIDATES) {
        modelCandidates = libraryMatches.slice(0, MIN_CANDIDATES);
      } else {
        modelCandidates = aboveThreshold.slice(0, MAX_CANDIDATES);
      }
      
      // Model NOT resolved - always needs user confirmation
      resolvedModel = null;
      console.log(`[WatchAdapter] CANDIDATES FOR CONFIRMATION: ${modelCandidates.length} options (top score: ${topMatch.score.toFixed(3)})`);
    } else {
      // Low confidence - still show at least MIN_CANDIDATES if available
      if (libraryMatches.length >= MIN_CANDIDATES) {
        modelCandidates = libraryMatches.slice(0, MIN_CANDIDATES);
        resolvedModel = null;
        console.log(`[WatchAdapter] LOW CONFIDENCE - showing ${MIN_CANDIDATES} best candidates (top score: ${topMatch.score.toFixed(3)})`);
      } else if (libraryMatches.length > 0) {
        modelCandidates = libraryMatches;
        resolvedModel = null;
        console.log(`[WatchAdapter] LOW CONFIDENCE - showing ${modelCandidates.length} available candidates`);
      } else {
        resolvedModel = visionAnalysis?.modelName || null;
        console.log(`[WatchAdapter] NO LIBRARY MATCHES for visual comparison`);
      }
    }
  } else if (detectedBrand) {
    // Brand detected but no library matches for this brand
    console.log(`[WatchAdapter] NO LIBRARY IMAGES for brand: ${detectedBrand}`);
    resolvedModel = visionAnalysis?.modelName || visionAnalysis?.collection || null;
  }
  
  const conditionBucket = conditionHint || detectConditionBucket(listingText);
  const conditionResolved = conditionHint !== undefined || listingText.length > 0;
  
  // STEP 4: Determine if model selection is needed BEFORE confidence check
  const needsModelSelection = !resolvedModel && modelCandidates.length > 0;
  
  // CRITICAL: Brand-only is NEVER valid for watches - must have model
  // Pass needsModelSelection so BLOCKED is returned when user must select model
  const identityConfidence = determineIdentityConfidence(
    brandConfirmed,
    modelConfirmed,
    conditionResolved,
    bestLibraryScore,
    needsModelSelection
  );
  
  // If model not resolved, set modelName to indicate this
  const finalModelName = resolvedModel || (needsModelSelection ? 'SELECT_MODEL' : 'Unknown Model');
  
  const identity: WatchIdentity = {
    category: 'watches',
    brand: resolvedBrand || 'Unknown',
    collection: resolvedCollection,
    configurationGroup: detectedConfigGroup,
    modelName: finalModelName,
    modelNumber: resolvedModelNumber,
    dialColor: visionAnalysis?.dialColor,
    movementType: 'unknown',
    bezelType: visionAnalysis?.bezelType,
    materials: visionAnalysis?.materials,
    conditionBucket,
    completeness,
    identityConfidence,
    evidence,
    needsModelSelection,
    modelCandidates: needsModelSelection ? modelCandidates.map(c => ({
      familyId: c.familyId,
      family: c.family,
      displayName: c.displayName,
      configurationGroup: c.configurationGroup,
      score: c.score
    })) : undefined,
    debugTrace
  };
  
  if (needsModelSelection) {
    console.log(`[WatchAdapter] MODEL SELECTION REQUIRED: ${modelCandidates.length} candidates for ${resolvedBrand}`);
  } else {
    console.log(`[WatchAdapter] Identity resolved: ${identity.brand} ${identity.modelName} (${identity.identityConfidence})`);
  }
  
  return identity;
}

// ============================================================================
// PRICE TRUTH GENERATION
// ============================================================================

const PRICE_CACHE = new Map<string, { data: PriceTruth; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Fetch PriceTruth for a WatchIdentity using condition-separated comps
 * HARD BLOCK: Returns blocked PriceTruth if identityConfidence is BLOCKED
 */
export async function fetchPriceTruth(
  identity: WatchIdentity,
  fetchComps: (query: string, negatives: string[], condition: ConditionBucket) => Promise<{
    prices: number[];
    soldCount: number;
    source: string;
  }>
): Promise<PriceTruth> {
  // =========================================================================
  // HARD BLOCK: No pricing when identity is BLOCKED (brand-only, model missing)
  // =========================================================================
  if (identity.identityConfidence === 'BLOCKED') {
    console.log(`[WatchAdapter] HARD BLOCK: Pricing blocked - identityConfidence=${identity.identityConfidence}, model=${identity.modelName}`);
    const blockReasons: string[] = [];
    if (identity.brand === 'Unknown') blockReasons.push('BRAND_UNIDENTIFIED');
    if (identity.needsModelSelection) blockReasons.push('MODEL_SELECTION_REQUIRED');
    if (identity.modelName === 'Unknown Model' || identity.modelName === 'SELECT_MODEL') blockReasons.push('MODEL_UNRESOLVED');
    
    return {
      sourceUsed: 'none',
      anchorPriceItemOnly: null,
      anchorPriceTotal: null,
      soldCountUsed: 0,
      timeWindowDays: 0,
      updatedAt: new Date(),
      pricingConfidence: 'BLOCKED',
      conditionQueried: identity.conditionBucket,
      completenessQueried: identity.completeness,
      blockReasonCodes: blockReasons
    };
  }
  
  const cacheKey = generatePriceTruthCacheKey(identity);
  
  const cached = PRICE_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[WatchAdapter] Cache hit for ${cacheKey}`);
    return cached.data;
  }
  
  const query = buildCompsQuery(identity);
  const negatives = buildNegativeKeywords(identity.conditionBucket);
  
  console.log(`[WatchAdapter] Fetching comps: "${query}" (${identity.conditionBucket})`);
  
  try {
    const compsResult = await fetchComps(query, negatives, identity.conditionBucket);
    
    let anchorPrice: number | null = null;
    if (compsResult.prices.length > 0) {
      const sorted = [...compsResult.prices].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      anchorPrice = sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    }
    
    const pricingConfidence = determinePricingConfidence(
      compsResult.soldCount,
      90,
      identity.identityConfidence
    );
    
    const priceTruth: PriceTruth = {
      sourceUsed: compsResult.source as any || 'ebay_sold_cache',
      anchorPriceItemOnly: anchorPrice,
      anchorPriceTotal: anchorPrice,
      priceRangeLow: compsResult.prices.length > 0 ? Math.min(...compsResult.prices) : undefined,
      priceRangeHigh: compsResult.prices.length > 0 ? Math.max(...compsResult.prices) : undefined,
      soldCountUsed: compsResult.soldCount,
      timeWindowDays: 90,
      updatedAt: new Date(),
      pricingConfidence,
      conditionQueried: identity.conditionBucket,
      completenessQueried: identity.completeness,
      cacheKey
    };
    
    PRICE_CACHE.set(cacheKey, { data: priceTruth, timestamp: Date.now() });
    
    console.log(`[WatchAdapter] PriceTruth: $${anchorPrice?.toFixed(2) || 'N/A'} (${compsResult.soldCount} comps, ${pricingConfidence})`);
    
    return priceTruth;
  } catch (error) {
    console.error('[WatchAdapter] Failed to fetch comps:', error);
    
    return {
      sourceUsed: 'none',
      anchorPriceItemOnly: null,
      anchorPriceTotal: null,
      soldCountUsed: 0,
      timeWindowDays: 0,
      updatedAt: new Date(),
      pricingConfidence: 'BLOCKED',
      conditionQueried: identity.conditionBucket,
      completenessQueried: identity.completeness
    };
  }
}

// ============================================================================
// FULL PIPELINE
// ============================================================================

export interface WatchAnalysisResult {
  identity: WatchIdentity;
  priceTruth: PriceTruth;
  decision: ComputedDecision;
  debugTrace: WatchPipelineDebugTrace;
}

/**
 * Full watch analysis pipeline: Identity → PriceTruth → ComputedDecision
 * Builds and returns a complete PipelineDebugTrace for diagnostics
 */
export async function analyzeWatch(
  options: ResolveIdentityOptions & {
    scanId?: number;
    buyPrice: number;
    shippingIn: number;
    buyerPaidShipping?: boolean;
    fetchComps: (query: string, negatives: string[], condition: ConditionBucket) => Promise<{
      prices: number[];
      soldCount: number;
      source: string;
    }>;
  }
): Promise<WatchAnalysisResult> {
  const { scanId = 0, buyPrice, shippingIn, buyerPaidShipping = true, fetchComps, ...identityOptions } = options;
  
  const identity = await resolveWatchIdentity(identityOptions);
  
  const priceTruth = await fetchPriceTruth(identity, fetchComps);
  
  const decision = computeWatchDecision(identity, priceTruth, {
    buyPrice,
    shippingIn,
    buyerPaidShipping
  });
  
  // Build Pipeline Debug Trace
  const debugTrace: WatchPipelineDebugTrace = buildDebugTrace(
    scanId,
    identityOptions,
    identity,
    priceTruth,
    decision,
    buyPrice,
    buyerPaidShipping
  );
  
  return { identity, priceTruth, decision, debugTrace };
}

/**
 * Build comprehensive PipelineDebugTrace for diagnostics
 */
function buildDebugTrace(
  scanId: number,
  inputs: ResolveIdentityOptions,
  identity: WatchIdentity,
  priceTruth: PriceTruth,
  decision: ComputedDecision,
  buyPrice: number,
  buyerPaidShipping: boolean
): WatchPipelineDebugTrace {
  // Extract brand candidates from evidence
  const brandCandidates = identity.evidence?.visionAnalysis?.brand 
    ? [{ brand: identity.evidence.visionAnalysis.brand, confidence: 0.9 }]
    : [];
  
  // Build model candidates step
  const modelCandidates = identity.modelCandidates?.map(c => ({
    familyId: c.familyId,
    family: c.family,
    score: c.score
  })) || [];
  
  // Compute score gap between top 2 candidates
  let scoreGap: number | null = null;
  if (modelCandidates.length >= 2) {
    scoreGap = modelCandidates[0].score - modelCandidates[1].score;
  }
  
  // Determine selection reason
  // Note: No longer auto-selecting - user always confirms model from candidates
  let selectionReason: 'user_confirmed' | 'vision_text_match' | 'awaiting_selection' | 'blocked' = 'blocked';
  if (identity.identityConfidence !== 'BLOCKED') {
    if (identity.evidence?.visionAnalysis?.collection && identity.modelName?.includes(identity.evidence.visionAnalysis.collection)) {
      selectionReason = 'vision_text_match';
    } else {
      selectionReason = 'user_confirmed'; // User confirmed from candidates
    }
  } else if (identity.needsModelSelection) {
    selectionReason = 'awaiting_selection'; // Waiting for user to pick from candidates
  }
  
  // Build reason codes
  const reasonCodes: string[] = [];
  if (identity.brand === 'Unknown') reasonCodes.push('BRAND_UNIDENTIFIED');
  if (identity.needsModelSelection) reasonCodes.push('MODEL_SELECTION_REQUIRED');
  if (identity.identityConfidence === 'BLOCKED' && !identity.needsModelSelection) reasonCodes.push('MODEL_UNRESOLVED');
  
  // Compute IQR range if we have price data
  let iqrRange: [number, number] | null = null;
  if (priceTruth.priceRangeLow !== undefined && priceTruth.priceRangeHigh !== undefined) {
    iqrRange = [priceTruth.priceRangeLow, priceTruth.priceRangeHigh];
  }
  
  return {
    scanId,
    rawInputs: {
      inputType: inputs.faceImageBase64 ? 'photo' : 'url',
      hasBackImage: !!inputs.casebackImageBase64
    },
    brandStep: {
      top3Brands: brandCandidates.slice(0, 3),
      selectedBrand: identity.brand !== 'Unknown' ? identity.brand : null,
      winningSignal: identity.evidence?.visionAnalysis?.brand ? 'dial_ocr' : 'library_match'
    },
    bucketStep: {
      configGroupDetected: identity.configurationGroup || null,
      bucketSize: identity.evidence?.libraryMatchCandidates?.length || 0,
      filterStrategy: identity.configurationGroup ? 'brand+configGroup' : 
                      identity.brand !== 'Unknown' ? 'brand_only' : 'all'
    },
    modelCandidatesStep: {
      topKModels: modelCandidates.slice(0, 5),
      scoreGap,
      selectedModel: identity.identityConfidence !== 'BLOCKED' ? identity.modelName : null,
      selectionReason
    },
    finalIdentity: {
      brand: identity.brand,
      model: identity.modelName || 'Unknown',
      modelNumber: identity.modelNumber || null,
      dialColor: identity.dialColor || null,
      identityConfidence: identity.identityConfidence,
      reasonCodes
    },
    compsQuery: identity.identityConfidence === 'BLOCKED' ? {
      queryString: '',
      negativeKeywords: [],
      condition: identity.conditionBucket
    } : {
      queryString: buildCompsQuery(identity),
      negativeKeywords: buildNegativeKeywords(identity.conditionBucket),
      condition: identity.conditionBucket
    },
    pricingSummary: priceTruth.pricingConfidence === 'BLOCKED' ? {
      soldCount: 0,
      timeWindowDays: 0,
      medianPrice: null,
      p25Price: null,
      iqrRange: null,
      cacheHit: false
    } : {
      soldCount: priceTruth.soldCountUsed,
      timeWindowDays: priceTruth.timeWindowDays,
      medianPrice: priceTruth.anchorPriceItemOnly,
      p25Price: priceTruth.priceRangeLow || null,
      iqrRange,
      cacheHit: !!priceTruth.cacheKey
    },
    decisionSummary: {
      buyPrice,
      buyerPaidShipping,
      feeBaseUsed: decision.expectedSellPrice || 0,
      profitDollars: decision.profitDollars,
      marginPercent: decision.marginPercent,
      roiPercent: decision.roiPercent,
      maxBuyPrice: decision.maxBuyPrice,
      verdict: decision.decision,
      reasonCodes: decision.reasonCodes
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * Check if brand needs clarification (prompt for another photo)
 */
export function needsBrandClarification(identity: WatchIdentity): boolean {
  return identity.brand === 'Unknown' || identity.identityConfidence === 'BLOCKED';
}
