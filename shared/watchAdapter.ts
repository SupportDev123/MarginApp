/**
 * Watch Adapter - Category adapter that produces canonical objects for the Margin Core
 * 
 * Architecture mirrors the Card pipeline:
 * WatchIdentity → PriceTruth → ComputedDecision
 * 
 * All UI screens read from the single ComputedDecision output (no per-screen math).
 */

// ============================================================================
// CANONICAL TYPES
// ============================================================================

export type ConditionBucket = 'NEW' | 'USED' | 'PARTS';
export type CompletenessBucket = 'FULL_SET' | 'WATCH_ONLY' | 'UNKNOWN';
export type IdentityConfidence = 'HIGH' | 'ESTIMATE' | 'BLOCKED';

export interface WatchEvidence {
  photoSignals: string[];
  ocrText?: string;
  barcode?: string;
  libraryMatchCandidates: Array<{
    familyId: number;
    brand: string;
    family: string;
    displayName: string;
    modelNumber?: string;
    configurationGroup?: string;
    score: number;
  }>;
  visionAnalysis?: {
    brand?: string;
    modelName?: string;
    collection?: string;
    dialColor?: string;
    dialStyle?: string;
    materials?: string;
    bezelType?: string;
    hasChronograph?: boolean;
    hasSkeleton?: boolean;
    hasOpenHeart?: boolean;
    caseShape?: string;
    inferredConfigGroup?: string;
  };
}

/**
 * WatchIdentity - Canonical identity object
 * Equivalent to card identity (front photo + checklist metadata)
 */
// Debug trace for watch matching - tracks configGroup filter behavior
export interface WatchMatchingDebugTrace {
  detectedBrand: string | null;
  detectedConfigGroup: string | null;
  configGroupFilterApplied: boolean;
  configGroupFilterBypassed: boolean;
  bypassReason?: string;
  candidateCount: number;
  candidates: Array<{
    familyId: number;
    displayName: string;
    configGroup: string | undefined;
    score: number;
  }>;
  reasonCodes: string[];
}

export interface WatchIdentity {
  category: 'watches';
  brand: string;
  collection?: string; // e.g., "Subaqua", "Pro Diver" - groups multiple configurations
  configurationGroup?: string; // e.g., "rotating_bezel_diver", "skeleton_dial" - visual trait group
  modelName: string;
  modelNumber?: string;
  dialColor?: string; // e.g., "orange", "blue", "black", "tiffany blue" - for tighter comp searches
  dialStyle?: string; // e.g., "roman", "arabic", "stick" - dial marker style
  bezelColor?: string; // e.g., "black", "gold", "two tone" - bezel color for comp searches
  bezelType?: 'fluted' | 'smooth' | 'diver' | 'tachymeter' | 'gmt' | 'diamond' | 'ceramic' | 'coin_edge' | 'fixed' | 'unknown';
  movementType?: 'automatic' | 'quartz' | 'manual' | 'solar' | 'unknown';
  materials?: string;
  sizeMM?: number;
  conditionBucket: ConditionBucket;
  completeness: CompletenessBucket;
  identityConfidence: IdentityConfidence;
  evidence: WatchEvidence;
  // MODEL SELECTION: If true, user must select from candidates before pricing
  needsModelSelection?: boolean;
  // CONFIG GROUP SELECTION: If multiple config groups have similar scores, prompt user
  needsConfigGroupSelection?: boolean;
  configGroupCandidates?: Array<{
    configGroup: string;
    displayName: string;
    count: number; // number of models in this config group
  }>;
  modelCandidates?: Array<{
    familyId: number;
    family: string;
    displayName: string;
    configurationGroup?: string;
    score: number;
  }>;
  // Debug trace for matching behavior
  debugTrace?: WatchMatchingDebugTrace;
}

/**
 * PriceTruth - Pricing anchor, separate from decision math
 * Contains cleaned comp data for a specific condition bucket
 */
export interface PriceTruth {
  sourceUsed: 'ebay_sold_cache' | 'marketplace_insights' | 'browse_api' | 'chrono24' | 'none';
  anchorPriceItemOnly: number | null;
  anchorPriceTotal: number | null;
  priceRangeLow?: number;
  priceRangeHigh?: number;
  soldCountUsed: number;
  timeWindowDays: number;
  updatedAt: Date;
  pricingConfidence: IdentityConfidence;
  conditionQueried: ConditionBucket;
  completenessQueried: CompletenessBucket;
  cacheKey?: string;
  blockReasonCodes?: string[]; // Reason codes when pricing is BLOCKED
}

/**
 * ComputedDecision - Final output consumed by all UI screens
 * This is the SINGLE SOURCE OF TRUTH for display
 */
export interface ComputedDecision {
  expectedSellPrice: number | null;
  platformFees: number;
  shippingCostSeller: number;
  fixedCosts: number;
  profitDollars: number | null;
  marginPercent: number | null;
  roiPercent: number | null;
  maxBuyPrice: number | null;
  decision: 'FLIP' | 'SKIP' | 'NOT_ENOUGH_INFO';
  reasonCodes: string[];
  buyerPaidShipping: boolean;
}

// ============================================================================
// IDENTITY RESOLUTION HELPERS
// ============================================================================

const CONDITION_NEW_KEYWORDS = ['new', 'nwt', 'unworn', 'bnib', 'brand new', 'sealed', 'mint'];
const CONDITION_USED_KEYWORDS = ['used', 'pre-owned', 'preowned', 'worn', 'vintage', 'estate'];
const CONDITION_PARTS_KEYWORDS = ['parts', 'for parts', 'not working', 'broken', 'repair', 'as is', 'as-is'];

const COMPLETENESS_FULL_SET_KEYWORDS = ['full set', 'box', 'papers', 'complete set', 'with box', 'with papers', 'b&p'];
const COMPLETENESS_WATCH_ONLY_KEYWORDS = ['watch only', 'no box', 'no papers'];

/**
 * Detect condition bucket from listing text/title
 */
export function detectConditionBucket(text: string): ConditionBucket {
  const lower = text.toLowerCase();
  
  for (const kw of CONDITION_PARTS_KEYWORDS) {
    if (lower.includes(kw)) return 'PARTS';
  }
  
  for (const kw of CONDITION_NEW_KEYWORDS) {
    if (lower.includes(kw)) return 'NEW';
  }
  
  for (const kw of CONDITION_USED_KEYWORDS) {
    if (lower.includes(kw)) return 'USED';
  }
  
  return 'USED';
}

/**
 * Detect completeness from listing text
 * Note: This is only used for URL-based scans. Photo scans use user prompt.
 */
export function detectCompletenessFromText(text: string): CompletenessBucket {
  const lower = text.toLowerCase();
  
  for (const kw of COMPLETENESS_WATCH_ONLY_KEYWORDS) {
    if (lower.includes(kw)) return 'WATCH_ONLY';
  }
  
  for (const kw of COMPLETENESS_FULL_SET_KEYWORDS) {
    if (lower.includes(kw)) return 'FULL_SET';
  }
  
  return 'UNKNOWN';
}

/**
 * Determine identity confidence based on available data
 * 
 * HIGH requires:
 * - Brand confirmed (via OCR or strong library match)
 * - Model confirmed (library match with high score)
 * - Strong library match score (>= 0.85)
 * 
 * ESTIMATE when:
 * - Brand confirmed but model uncertain
 * - Library match score < 0.85
 * - Missing data that doesn't block
 * 
 * BLOCKED when:
 * - Brand cannot be determined at all
 */
export function determineIdentityConfidence(
  brandConfirmed: boolean,
  modelConfirmed: boolean,
  conditionResolved: boolean,
  libraryMatchScore?: number,
  needsModelSelection?: boolean
): IdentityConfidence {
  // BLOCKED: Brand must be identified
  if (!brandConfirmed) {
    return 'BLOCKED';
  }
  
  // BLOCKED: Brand-only is NEVER valid for watches
  // Model must be resolved before pricing (same as cards - "Topps" is not a card)
  if (!modelConfirmed && needsModelSelection) {
    return 'BLOCKED';
  }
  
  // BLOCKED: No model at all and no candidates to select from
  if (!modelConfirmed && !needsModelSelection) {
    return 'BLOCKED';
  }
  
  // HIGH: Requires model confirmed AND strong library match
  if (modelConfirmed && libraryMatchScore && libraryMatchScore >= 0.85) {
    return 'HIGH';
  }
  
  // ESTIMATE: Model known but weaker match
  return 'ESTIMATE';
}

// ============================================================================
// COMPS QUERY HELPERS
// ============================================================================

const NEGATIVE_KEYWORDS_DEFAULT = [
  'parts', 'broken', 'case only', 'band only', 'bezel', 'dial only',
  'crown', 'crystal', 'movement only', 'repair', 'not working'
];

const NEW_EXCLUDE_KEYWORDS = ['used', 'pre-owned', 'preowned', 'worn', 'vintage'];
const USED_EXCLUDE_KEYWORDS = ['new', 'unworn', 'bnib', 'sealed', 'nwt'];

/**
 * Build negative keywords for comps query based on condition
 */
export function buildNegativeKeywords(conditionBucket: ConditionBucket): string[] {
  if (conditionBucket === 'PARTS') {
    return [];
  }
  
  const negatives = [...NEGATIVE_KEYWORDS_DEFAULT];
  
  if (conditionBucket === 'NEW') {
    negatives.push(...NEW_EXCLUDE_KEYWORDS);
  } else if (conditionBucket === 'USED') {
    negatives.push(...USED_EXCLUDE_KEYWORDS);
  }
  
  return negatives;
}

/**
 * Build search query for comps from WatchIdentity
 * 
 * Bezel and dial colors are MAJOR pricing variants - different colorways have
 * significantly different values. Examples:
 * - "Invicta Pro Diver black bezel orange dial"
 * - "Rolex Datejust fluted bezel tiffany blue dial"
 * - "Seiko Presage two tone roman dial"
 */
export function buildCompsQuery(identity: WatchIdentity): string {
  const parts: string[] = [];
  
  // Brand is always first
  parts.push(identity.brand);
  
  // Model/Collection - add if known
  if (identity.modelNumber) {
    parts.push(identity.modelNumber);
  } else if (identity.modelName && identity.modelName !== 'Unknown Model' && identity.modelName !== 'SELECT_MODEL') {
    parts.push(identity.modelName);
  }
  
  if (identity.collection && !parts.some(p => p.toLowerCase().includes(identity.collection!.toLowerCase()))) {
    parts.push(identity.collection);
  }
  
  // ALWAYS ADD VISUAL DETAILS - even if model unknown
  // This ensures we never search just "Invicta watch" but always include specifics
  
  // DIAL COLOR + STYLE - major pricing variant (e.g., "green roman dial", "black stick dial")
  const dialDesc = buildDialDescription(identity.dialColor, identity.dialStyle);
  if (dialDesc && !parts.some(p => p.toLowerCase().includes(dialDesc.toLowerCase()))) {
    parts.push(dialDesc);
  }
  
  // BEZEL TYPE - critical for value (fluted vs diver vs smooth)
  if (identity.bezelType && identity.bezelType !== 'unknown') {
    const bezelTypeStr = identity.bezelType === 'diver' ? 'diver bezel' : 
                         identity.bezelType === 'fluted' ? 'fluted bezel' :
                         identity.bezelType === 'ceramic' ? 'ceramic bezel' :
                         identity.bezelType === 'tachymeter' ? 'tachymeter' :
                         null;
    if (bezelTypeStr && !parts.some(p => p.toLowerCase().includes(bezelTypeStr.toLowerCase()))) {
      parts.push(bezelTypeStr);
    }
  }
  
  // BEZEL COLOR - if different from bezel type (e.g., "green bezel", "gold bezel")
  if (identity.bezelColor) {
    const bezelDesc = normalizeBezelDescription(identity.bezelColor, identity.bezelType);
    if (bezelDesc && !parts.some(p => p.toLowerCase().includes(bezelDesc.toLowerCase()))) {
      parts.push(bezelDesc);
    }
  }
  
  // MATERIALS - stainless steel, gold, two-tone
  if (identity.materials && identity.materials !== 'unknown') {
    const mat = identity.materials.toLowerCase();
    if (!parts.some(p => p.toLowerCase().includes(mat))) {
      parts.push(identity.materials);
    }
  }
  
  console.log(`[WatchCompsQuery] Built: "${parts.join(' ')}" from brand=${identity.brand}, model=${identity.modelName}, dial=${identity.dialColor}/${identity.dialStyle}, bezel=${identity.bezelType}`);
  
  return parts.join(' ');
}

/**
 * Build dial description combining color and style
 * Examples: "green roman dial", "tiffany blue dial", "black stick dial"
 */
function buildDialDescription(dialColor?: string, dialStyle?: string): string | null {
  if (!dialColor && !dialStyle) return null;
  
  const parts: string[] = [];
  
  if (dialColor) {
    const normalized = normalizeDialColor(dialColor);
    if (normalized) parts.push(normalized);
  }
  
  if (dialStyle && dialStyle !== 'unknown') {
    parts.push(dialStyle);
  }
  
  if (parts.length > 0) {
    parts.push('dial');
    return parts.join(' ');
  }
  
  return null;
}

/**
 * Normalize bezel description for search
 * Examples: "black bezel", "fluted bezel", "two tone bezel"
 */
function normalizeBezelDescription(bezelColor: string, bezelType?: string): string | null {
  const color = bezelColor.toLowerCase().trim();
  if (color === 'unknown' || color === 'n/a' || color === '') return null;
  
  // If bezel type is fluted, include it as it's a major variant
  if (bezelType === 'fluted') {
    return `fluted ${color} bezel`;
  }
  
  return `${color} bezel`;
}

/**
 * Normalize dial color for consistent eBay searching
 * 
 * PRESERVE important descriptors that are major pricing variants:
 * - "tiffany blue" (premium variant)
 * - "mother of pearl" / "mop" (premium variant)
 * - "two tone" (distinct variant)
 * - "rose gold" (distinct from regular gold)
 * 
 * Only simplify generic sunburst/finish descriptors
 */
function normalizeDialColor(color: string): string | null {
  const c = color.toLowerCase().trim();
  
  // Skip generic/unhelpful colors
  if (c === 'unknown' || c === 'n/a' || c === '') return null;
  
  // PRESERVE these premium/distinct color descriptors as-is (major pricing variants)
  const preserveExact = [
    'tiffany blue',
    'mother of pearl',
    'rose gold',
    'two tone',
    'skeleton',
    'meteorite',
    'abalone',
    'salmon',
    'ice blue',
    'champagne',
  ];
  
  for (const preserve of preserveExact) {
    if (c.includes(preserve)) return preserve;
  }
  
  // Normalize abbreviations
  if (c === 'mop') return 'mother of pearl';
  
  // Simplify sunburst finishes to base color (finish doesn't affect pricing much)
  const sunburstMatch = c.match(/(black|blue|green|gray|silver|brown)\s*sunburst/);
  if (sunburstMatch) return sunburstMatch[1];
  const reverseSunburst = c.match(/sunburst\s*(black|blue|green|gray|silver|brown)/);
  if (reverseSunburst) return reverseSunburst[1];
  
  // Common color mappings
  const colorMap: Record<string, string> = {
    'navy': 'blue',
    'grey': 'gray',
    'burgundy': 'red',
    'maroon': 'red',
    'cream': 'white',
    'ivory': 'white',
  };
  
  if (colorMap[c]) return colorMap[c];
  
  // Return as-is for simple colors
  const simpleColors = ['black', 'blue', 'green', 'red', 'orange', 'yellow', 'gold', 'silver', 'white', 'gray', 'pink', 'purple', 'brown', 'bronze', 'copper'];
  if (simpleColors.includes(c)) return c;
  
  // For compound descriptions, extract primary color but preserve the full phrase if it's meaningful
  for (const primary of simpleColors) {
    if (c.includes(primary)) {
      // If it has a meaningful modifier, keep the whole thing
      if (c.includes('orange mother of pearl') || c.includes('blue mother of pearl')) {
        return c; // Keep full descriptor
      }
      return primary;
    }
  }
  
  // Return as-is if it's a reasonable color name
  if (c.length < 30) return c;
  
  return null;
}

// ============================================================================
// PRICING CONFIDENCE RULES
// ============================================================================

interface CompsThresholds {
  highConfidenceMinSold: number;
  highConfidenceWindowDays: number;
  estimateMinSold: number;
  estimateWindowDays: number;
}

const COMPS_THRESHOLDS: CompsThresholds = {
  highConfidenceMinSold: 8,
  highConfidenceWindowDays: 90,
  estimateMinSold: 3,
  estimateWindowDays: 180
};

/**
 * Determine pricing confidence based on comp count and window
 */
export function determinePricingConfidence(
  soldCount: number,
  windowDays: number,
  identityConfidence: IdentityConfidence
): IdentityConfidence {
  if (identityConfidence === 'BLOCKED') {
    return 'BLOCKED';
  }
  
  if (soldCount >= COMPS_THRESHOLDS.highConfidenceMinSold && 
      windowDays <= COMPS_THRESHOLDS.highConfidenceWindowDays) {
    return identityConfidence === 'HIGH' ? 'HIGH' : 'ESTIMATE';
  }
  
  if (soldCount >= COMPS_THRESHOLDS.estimateMinSold &&
      windowDays <= COMPS_THRESHOLDS.estimateWindowDays) {
    return 'ESTIMATE';
  }
  
  if (soldCount > 0) {
    return 'ESTIMATE';
  }
  
  return 'BLOCKED';
}

// ============================================================================
// DECISION COMPUTATION
// ============================================================================

// ============================================================================
// LOCKED CONSTANTS - DO NOT MODIFY WITHOUT EXPLICIT APPROVAL
// These must match shared/decisionEngine.ts exactly
// ============================================================================
const PLATFORM_FEE_RATE = 0.13; // 13% eBay + PayPal - LOCKED
const FIXED_COSTS = 5; // Packaging, labels, etc. - LOCKED
const DEFAULT_OUTBOUND_SHIPPING = 0; // Buyer pays shipping - LOCKED
const MARGIN_THRESHOLD = 0.25; // 25% minimum margin for FLIP - LOCKED
const CONSERVATIVE_MULTIPLIER = 0.85; // Applied for ESTIMATE confidence

/**
 * Compute final decision from WatchIdentity + PriceTruth + user inputs
 * 
 * LOCKED MATH - mirrors shared/decisionEngine.ts
 * 
 * DECISION GATES (LOCKED - IN ORDER):
 * 1. Brand unidentifiable (BLOCKED) → NOT_ENOUGH_INFO
 * 2. No valid comps → NOT_ENOUGH_INFO
 * 3. maxBuy ≤ 0 → SKIP
 * 4. netProfit ≤ 0 → SKIP
 * 5. margin < 25% → SKIP
 * 6. ALL conditions met → FLIP
 */
export function computeWatchDecision(
  identity: WatchIdentity,
  priceTruth: PriceTruth,
  userInputs: {
    buyPrice: number;
    shippingIn: number;
    buyerPaidShipping?: boolean;
  }
): ComputedDecision {
  const { buyPrice, shippingIn, buyerPaidShipping = true } = userInputs;
  const reasonCodes: string[] = [];
  
  // GATE 1: Brand must be identified AND model must be resolved
  // Brand-only is NEVER valid for watches (same as cards - "Topps" is not a card)
  if (identity.identityConfidence === 'BLOCKED' || identity.brand === 'Unknown') {
    const reason = identity.brand === 'Unknown' ? 'BRAND_UNIDENTIFIED' : 
                   identity.needsModelSelection ? 'MODEL_SELECTION_REQUIRED' : 'MODEL_UNIDENTIFIED';
    return {
      expectedSellPrice: null,
      platformFees: 0,
      shippingCostSeller: DEFAULT_OUTBOUND_SHIPPING,
      fixedCosts: FIXED_COSTS,
      profitDollars: null,
      marginPercent: null,
      roiPercent: null,
      maxBuyPrice: null,
      decision: 'NOT_ENOUGH_INFO',
      reasonCodes: [reason],
      buyerPaidShipping
    };
  }
  
  // GATE 2: Must have valid comps
  if (priceTruth.anchorPriceItemOnly === null || priceTruth.soldCountUsed === 0) {
    return {
      expectedSellPrice: null,
      platformFees: 0,
      shippingCostSeller: DEFAULT_OUTBOUND_SHIPPING,
      fixedCosts: FIXED_COSTS,
      profitDollars: null,
      marginPercent: null,
      roiPercent: null,
      maxBuyPrice: null,
      decision: 'NOT_ENOUGH_INFO',
      reasonCodes: ['NO_COMPS'],
      buyerPaidShipping
    };
  }
  
  let expectedSellPrice = priceTruth.anchorPriceItemOnly;
  if (identity.identityConfidence === 'ESTIMATE' || priceTruth.pricingConfidence === 'ESTIMATE') {
    expectedSellPrice = expectedSellPrice * CONSERVATIVE_MULTIPLIER;
    reasonCodes.push('CONSERVATIVE_ESTIMATE');
  }
  
  const totalCost = buyPrice + shippingIn;
  const platformFees = expectedSellPrice * PLATFORM_FEE_RATE;
  // LOCKED: Buyer-paid shipping is the default for watches
  const shippingCostSeller = buyerPaidShipping ? DEFAULT_OUTBOUND_SHIPPING : 8;
  
  const profitDollars = expectedSellPrice - totalCost - platformFees - shippingCostSeller - FIXED_COSTS;
  const marginPercent = expectedSellPrice > 0 ? (profitDollars / expectedSellPrice) * 100 : 0;
  const roiPercent = totalCost > 0 ? (profitDollars / totalCost) * 100 : 0;
  
  const targetProfit = expectedSellPrice * MARGIN_THRESHOLD;
  // Apply 20% safety reduction to max buy price
  const rawMaxBuyPrice = expectedSellPrice - platformFees - shippingCostSeller - FIXED_COSTS - shippingIn - targetProfit;
  const maxBuyPrice = rawMaxBuyPrice * 0.8;
  
  let decision: 'FLIP' | 'SKIP' | 'NOT_ENOUGH_INFO' = 'SKIP';
  
  if (maxBuyPrice <= 0) {
    reasonCodes.push('MAX_BUY_NEGATIVE');
  }
  
  if (profitDollars <= 0) {
    reasonCodes.push('NEGATIVE_PROFIT');
  } else if (marginPercent < MARGIN_THRESHOLD * 100) {
    reasonCodes.push('LOW_MARGIN');
  }
  
  if (profitDollars > 0 && marginPercent >= MARGIN_THRESHOLD * 100 && maxBuyPrice > 0) {
    decision = 'FLIP';
  }
  
  // Note: BLOCKED confidence already handled in early returns above
  
  return {
    expectedSellPrice: Math.round(expectedSellPrice * 100) / 100,
    platformFees: Math.round(platformFees * 100) / 100,
    shippingCostSeller,
    fixedCosts: FIXED_COSTS,
    profitDollars: Math.round(profitDollars * 100) / 100,
    marginPercent: Math.round(marginPercent * 10) / 10,
    roiPercent: Math.round(roiPercent * 10) / 10,
    maxBuyPrice: Math.round(Math.max(0, maxBuyPrice) * 100) / 100,
    decision,
    reasonCodes,
    buyerPaidShipping
  };
}

// ============================================================================
// CACHE KEY GENERATION
// ============================================================================

/**
 * Generate cache key for PriceTruth caching (24h TTL)
 */
export function generatePriceTruthCacheKey(identity: WatchIdentity): string {
  const parts = [
    identity.brand.toLowerCase().replace(/\s+/g, '_'),
    (identity.modelNumber || identity.modelName || 'unknown').toLowerCase().replace(/\s+/g, '_'),
    identity.conditionBucket,
    identity.completeness
  ];
  return `watch_price_${parts.join('_')}`;
}
