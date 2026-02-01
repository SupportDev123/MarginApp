/**
 * Card Pipeline - Single Authoritative Flow for Trading Card Analysis
 * 
 * Pipeline: Front Scan → Back Scan → Checklist Validation → CardIdentity → PriceTruth → ComputedDecision
 * 
 * Constraints:
 * 1. Pricing CANNOT run unless identity is validated against checklist (or explicitly ESTIMATE)
 * 2. Confidence degradation, not guessing:
 *    - Exact set + number → HIGH
 *    - Variant unclear or minor OCR ambiguity → ESTIMATE (conservative pricing)
 *    - Checklist conflict or missing required scan → BLOCKED
 * 3. Never invent cards outside checklist
 * 4. FLIP can NEVER occur if profitDollars < 0
 */

import {
  CardIdentity,
  CardGame,
  VariantFinish,
  IdentityConfidenceState,
  ScanEvidence,
  ChecklistMatchDetails,
  PriceTruth,
  PriceSourceType,
  ComputedDecision,
  CardAnalysisResult,
  calculateCardDecision,
  createCardIdentity,
  createPriceTruth,
  createCardAnalysisResult,
} from "@shared/cardDecisionEngine";
import { 
  CARD_SETS, 
  parseCardTitle, 
  getParallelsForCard,
  CardSet,
  CardParallel,
} from "@shared/cardParallels";

// ============================================================================
// SCAN INPUT TYPES
// ============================================================================

export interface CardScanInput {
  frontScan: {
    imageUrl?: string;
    aiExtractedData?: {
      candidateName?: string;
      candidateNames?: string[];
      year?: number;
      playerName?: string;
      setName?: string;
      brand?: string;
      parallel?: string;
      cardNumber?: string;
      grader?: string;
      grade?: string;
      sport?: string;
    };
    confidence?: number;
  };
  backScan?: {
    imageUrl?: string;
    aiExtractedData?: {
      setCode?: string;
      cardNumber?: string;
      year?: number;
      language?: string;
    };
    confidence?: number;
  };
  userInputs: {
    buyPrice: number;
    shippingIn?: number;
    condition?: string;
  };
  // Legacy compatibility: allow single AI analysis result
  legacyAiResult?: {
    title?: string;
    category?: string;
    cardMeta?: {
      brand?: string;
      set?: string;
      year?: number;
      playerName?: string;
      detectedParallel?: string;
      cardNumber?: string;
      grader?: string;
      grade?: string;
    };
    confidence?: number;
  };
}

export interface CardScanResult {
  success: boolean;
  analysisResult?: CardAnalysisResult;
  error?: string;
}

// ============================================================================
// CHECKLIST VALIDATION
// ============================================================================

interface ChecklistLookupResult {
  found: boolean;
  matchType: 'exact' | 'name-only' | 'fuzzy' | 'none';
  matchedSet?: CardSet;
  matchedParallel?: CardParallel;
  confidence: number;
  alternativeCandidates: number;
  reason?: string;
}

/**
 * Validate card against checklist database
 * 
 * ============================================================================
 * LOCKED SYSTEM MODEL - CARD IDENTITY RULES
 * ============================================================================
 * 
 * CORE PRINCIPLE: Card number is the PRIMARY economic identity.
 * Variants do NOT create a new comp universe - they share base demand.
 * Example: 2020 Prizm Justin Herbert #325 (base, silver, red ice, disco)
 * → All variants share card number #325 and base demand; variant = premium only.
 * 
 * CONFIDENCE RULES:
 * - HIGH: Set + cardNumber confirmed → pricing MUST always be allowed
 * - ESTIMATE: Set + name confirmed (cardNumber uncertain) → conservative base pricing
 * - BLOCKED: Set OR cardNumber cannot be validated, OR scans conflict
 * 
 * VARIANT HANDLING:
 * - Variant uncertainty must NEVER block pricing
 * - Unknown variant defaults to conservative base pricing
 * - Ultra-precise variant pricing is NOT required to function
 * 
 * KEY INVARIANTS:
 * - If set + card number confirmed → pricing allowed, regardless of variant
 * - ESTIMATE degrades confidence, not functionality
 * - BLOCKED only when set or card number cannot be validated
 */
function validateAgainstChecklist(
  game: CardGame,
  setName: string,
  cardNumber: string | undefined,
  name: string,
  year: number | undefined,
  variant: string | undefined
): ChecklistLookupResult {
  // Normalize inputs
  const normalizedSetName = setName.toLowerCase().trim();
  const normalizedName = name.toLowerCase().trim();
  const normalizedVariant = variant?.toLowerCase().trim();
  
  // GATE 1: Must have a meaningful set name to proceed
  if (!normalizedSetName || normalizedSetName === 'unknown set' || normalizedSetName.length < 2) {
    return {
      found: false,
      matchType: 'none',
      confidence: 0,
      alternativeCandidates: 0,
      reason: 'No valid set name provided - cannot validate card identity',
    };
  }
  
  // Find matching set(s) in checklist
  const matchingSets = CARD_SETS.filter(set => {
    const setNameMatch = set.set.toLowerCase().includes(normalizedSetName) ||
                         normalizedSetName.includes(set.set.toLowerCase());
    const yearMatch = !year || set.year === year || Math.abs(set.year - year) <= 1;
    return setNameMatch && yearMatch;
  });
  
  if (matchingSets.length === 0) {
    // BLOCKED: Brand-only matches are NOT sufficient for card identity
    // This prevents "inventing" cards that don't exist in our checklist
    const brandSets = CARD_SETS.filter(set => 
      set.brand.toLowerCase().includes(normalizedSetName) ||
      normalizedSetName.includes(set.brand.toLowerCase())
    );
    
    if (brandSets.length > 0) {
      // Found brand but not specific set - BLOCKED (not ESTIMATE)
      // User needs to provide more specific set information
      return {
        found: false, // BLOCKED - we don't allow brand-only matches
        matchType: 'none',
        confidence: 0,
        alternativeCandidates: brandSets.length,
        reason: `Found brand "${brandSets[0].brand}" but specific set not identified. Need set name for accurate pricing.`,
      };
    }
    
    return {
      found: false,
      matchType: 'none',
      confidence: 0,
      alternativeCandidates: 0,
      reason: 'No matching set found in checklist database',
    };
  }
  
  // We have matching set(s) - now check for parallel/variant
  const bestMatch = matchingSets[0];
  let matchedParallel: CardParallel | undefined;
  
  if (normalizedVariant) {
    // Try to match variant to parallel list
    matchedParallel = bestMatch.parallels.find(p => 
      p.label.toLowerCase().includes(normalizedVariant) ||
      normalizedVariant.includes(p.label.toLowerCase()) ||
      p.id === normalizedVariant
    );
  }
  
  // Determine match quality - degrade confidence, don't block unnecessarily
  // HIGH: set + cardNumber exact match (full card-level certainty)
  // ESTIMATE: set confirmed + name/cardNumber (card exists but details unclear)
  // BLOCKED: cannot validate card exists at all
  
  const hasCardNumber = !!cardNumber && cardNumber.length > 0;
  const hasMeaningfulName = normalizedName.length >= 3 && normalizedName !== 'unknown';
  const hasVariant = !!matchedParallel;
  
  if (matchingSets.length === 1 && hasCardNumber) {
    // HIGH: Set + cardNumber = full card-level certainty
    // Variant confirmation adds confidence but isn't required for HIGH
    return {
      found: true,
      matchType: 'exact',
      matchedSet: bestMatch,
      matchedParallel,
      confidence: hasVariant && matchedParallel ? 95 : 85,
      alternativeCandidates: 0,
      reason: hasVariant && matchedParallel
        ? `Fully verified: ${bestMatch.year} ${bestMatch.set} #${cardNumber} ${matchedParallel.label}`
        : `Card verified: ${bestMatch.year} ${bestMatch.set} #${cardNumber} (variant unclear)`,
    };
  } else if (matchingSets.length === 1 && hasMeaningfulName) {
    // ESTIMATE: Set confirmed + name matched (cardNumber/variant unclear but card exists)
    // This maintains match rate while using conservative pricing
    return {
      found: true,
      matchType: 'name-only',
      matchedSet: bestMatch,
      matchedParallel,
      confidence: hasVariant ? 70 : 55,
      alternativeCandidates: 0,
      reason: `Set confirmed, card "${normalizedName}" matched: ${bestMatch.year} ${bestMatch.set} (number unreadable)`,
    };
  } else if (matchingSets.length === 1) {
    // Set match only, no card identifier - BLOCKED
    // Cannot price without knowing which card (no name, no number)
    return {
      found: false,
      matchType: 'none',
      confidence: 0,
      alternativeCandidates: 0,
      reason: `Set "${bestMatch.year} ${bestMatch.set}" found but no card identifier (need name or number)`,
    };
  } else if (matchingSets.length > 1 && (hasCardNumber || hasMeaningfulName)) {
    // Multiple sets but have card identifier - ESTIMATE with lower confidence
    return {
      found: true,
      matchType: 'fuzzy',
      matchedSet: bestMatch,
      matchedParallel,
      confidence: 40,
      alternativeCandidates: matchingSets.length - 1,
      reason: `Card identified but set ambiguous (${matchingSets.length} possible): ${matchingSets.slice(0, 2).map(s => `${s.year} ${s.set}`).join(' or ')}`,
    };
  } else {
    // Multiple sets and no card identifier - BLOCKED
    return {
      found: false,
      matchType: 'none',
      matchedSet: bestMatch,
      confidence: 0,
      alternativeCandidates: matchingSets.length - 1,
      reason: `Multiple possible sets and no card identifier. Need more specific information.`,
    };
  }
}

// ============================================================================
// IDENTITY RESOLUTION
// ============================================================================

/**
 * Stage A: Extract signals from scans
 * Combines front scan, back scan, and AI extraction
 */
function extractSignals(input: CardScanInput): {
  name: string;
  setName: string;
  cardNumber?: string;
  year?: number;
  variant?: string;
  grader?: string;
  grade?: string;
  sport?: string;
  brand?: string;
  frontEvidence?: ScanEvidence;
  backEvidence?: ScanEvidence;
} {
  const front = input.frontScan.aiExtractedData;
  const back = input.backScan?.aiExtractedData;
  const legacy = input.legacyAiResult;
  
  // Merge signals with priority: back scan > front scan > legacy
  const cardNumber = back?.cardNumber || front?.cardNumber || legacy?.cardMeta?.cardNumber;
  const setCode = back?.setCode;
  const year = back?.year || front?.year || legacy?.cardMeta?.year;
  
  // Name comes primarily from front
  const name = front?.playerName || front?.candidateName || legacy?.cardMeta?.playerName || legacy?.title || 'Unknown';
  const setName = front?.setName || legacy?.cardMeta?.set || 'Unknown Set';
  const variant = front?.parallel || legacy?.cardMeta?.detectedParallel;
  const brand = front?.brand || legacy?.cardMeta?.brand;
  const sport = front?.sport;
  const grader = front?.grader || legacy?.cardMeta?.grader;
  const grade = front?.grade || legacy?.cardMeta?.grade;
  
  // Build evidence objects
  const frontEvidence: ScanEvidence | undefined = input.frontScan.imageUrl ? {
    source: 'front',
    confidence: input.frontScan.confidence || 50,
    extractedData: {
      candidateNames: front?.candidateNames || (front?.candidateName ? [front.candidateName] : undefined),
      year: front?.year,
    },
  } : undefined;
  
  const backEvidence: ScanEvidence | undefined = input.backScan?.imageUrl ? {
    source: 'back',
    confidence: input.backScan.confidence || 50,
    extractedData: {
      setCode: back?.setCode,
      cardNumber: back?.cardNumber,
      year: back?.year,
      language: back?.language,
    },
  } : undefined;
  
  return {
    name,
    setName,
    cardNumber,
    year,
    variant,
    grader,
    grade,
    sport,
    brand,
    frontEvidence,
    backEvidence,
  };
}

/**
 * Determine game type from signals
 */
function determineGame(signals: ReturnType<typeof extractSignals>, category?: string): CardGame {
  const cat = category?.toLowerCase() || '';
  const set = signals.setName.toLowerCase();
  const brand = signals.brand?.toLowerCase() || '';
  
  if (cat.includes('pokemon') || set.includes('pokemon') || brand.includes('pokemon')) return 'pokemon';
  if (cat.includes('mtg') || cat.includes('magic') || set.includes('magic')) return 'mtg';
  if (cat.includes('yugioh') || cat.includes('yu-gi-oh')) return 'yugioh';
  if (cat.includes('marvel') || set.includes('marvel')) return 'marvel';
  if (cat.includes('one piece') || set.includes('one piece')) return 'one-piece';
  if (cat.includes('lorcana') || set.includes('lorcana')) return 'lorcana';
  if (signals.sport || cat.includes('sport') || cat.includes('baseball') || 
      cat.includes('football') || cat.includes('basketball') || cat.includes('hockey')) return 'sports';
  
  return 'other';
}

/**
 * Determine variant finish from signals
 */
function determineVariant(variant?: string, grade?: string): VariantFinish {
  if (!variant) return 'unknown';
  
  const v = variant.toLowerCase();
  
  if (v.includes('prizm') || v.includes('refractor')) return 'refractor';
  if (v.includes('holo') && !v.includes('reverse')) return 'holo';
  if (v.includes('reverse')) return 'reverse-holo';
  if (v.includes('full art') || v.includes('full-art')) return 'full-art';
  if (v.includes('parallel')) return 'parallel';
  if (v.includes('auto') || v.includes('autograph')) return 'auto';
  if (v.includes('relic') || v.includes('patch') || v.includes('jersey')) return 'relic';
  
  // Check for graded
  if (grade) return 'graded';
  
  return 'parallel'; // Default for known parallels
}

/**
 * Build CardIdentity from scan inputs with checklist validation
 */
export function resolveCardIdentity(input: CardScanInput): CardIdentity {
  // Stage A: Extract signals
  const signals = extractSignals(input);
  const game = determineGame(signals, input.legacyAiResult?.category);
  
  // Stage B: Checklist validation (REQUIRED for card pipeline)
  const checklistResult = validateAgainstChecklist(
    game,
    signals.setName,
    signals.cardNumber,
    signals.name,
    signals.year,
    signals.variant
  );
  
  // Build checklist match details
  const checklistMatch: ChecklistMatchDetails = {
    matchType: checklistResult.matchType,
    checklistSetId: checklistResult.matchedSet ? `${checklistResult.matchedSet.year}-${checklistResult.matchedSet.set}` : undefined,
    checklistCardId: signals.cardNumber,
    alternativeCandidates: checklistResult.alternativeCandidates,
    matchConfidence: checklistResult.confidence,
  };
  
  // Stage C: Determine confidence state based on checklist result
  let confidenceState: IdentityConfidenceState;
  let blockReason: string | undefined;
  const resolutionPath: string[] = [];
  
  // Check for BLOCKED conditions
  const hasFrontScan = !!input.frontScan.imageUrl || !!input.frontScan.aiExtractedData;
  const hasBackScan = !!input.backScan?.imageUrl || !!input.backScan?.aiExtractedData;
  
  // For now, allow single scan until front+back is fully implemented
  // TODO: Enforce both scans once UI supports it
  const hasRequiredScans = hasFrontScan; // Will become: hasFrontScan && hasBackScan
  
  if (!hasRequiredScans) {
    confidenceState = 'BLOCKED';
    blockReason = 'Missing required scan data';
    resolutionPath.push('BLOCKED: No scan data provided');
  } else if (!checklistResult.found) {
    confidenceState = 'BLOCKED';
    blockReason = checklistResult.reason || 'Card not found in checklist';
    resolutionPath.push(`BLOCKED: ${blockReason}`);
  } else if (checklistResult.matchType === 'exact') {
    confidenceState = 'HIGH';
    resolutionPath.push(`HIGH: ${checklistResult.reason}`);
  } else {
    // name-only or fuzzy match = ESTIMATE
    confidenceState = 'ESTIMATE';
    resolutionPath.push(`ESTIMATE: ${checklistResult.reason}`);
  }
  
  // Determine variant
  const variantFinish = determineVariant(signals.variant, signals.grade);
  const variantLabel = checklistResult.matchedParallel?.label || signals.variant;
  
  // NOTE: We do NOT downgrade HIGH→ESTIMATE for variant uncertainty.
  // Per user requirement: HIGH = set + cardNumber exact match (variant not required)
  // Variant uncertainty is signaled separately but doesn't affect confidence state.
  // Conservative pricing for unknown variants is handled in PriceTruth stage.
  
  return {
    game,
    name: signals.name,
    setName: checklistResult.matchedSet?.set || signals.setName,
    setCode: checklistResult.matchedSet ? `${checklistResult.matchedSet.brand}-${checklistResult.matchedSet.year}` : undefined,
    setId: checklistMatch.checklistSetId,
    cardNumber: signals.cardNumber,
    year: checklistResult.matchedSet?.year || signals.year,
    sport: signals.sport || checklistResult.matchedSet?.sport,
    variantFinish,
    variantLabel,
    serialNumber: checklistResult.matchedParallel?.numbered,
    isGraded: !!signals.grader,
    grader: signals.grader,
    gradeValue: signals.grade,
    confidenceState,
    blockReason,
    identityEvidence: {
      frontScan: signals.frontEvidence,
      backScan: signals.backEvidence,
      checklistMatch,
    },
    resolvedAt: new Date(),
    resolutionPath,
  };
}

// ============================================================================
// PRICE SNAPSHOT
// ============================================================================

/**
 * Create PriceTruth from comps data
 * This is the price snapshot layer - cached and stable
 */
export function buildPriceTruth(
  compsResult: {
    medianPrice?: number | null;
    source?: string;
    comps?: Array<{ title: string; price: number; condition?: string; soldDate?: string }>;
    conditionStats?: {
      used: { count: number; medianPrice: number | null };
      newLike: { count: number; medianPrice: number | null };
    };
  },
  identity: CardIdentity,
  itemCondition?: string
): PriceTruth {
  // Determine source type
  let sourceUsed: PriceSourceType = 'none';
  if (compsResult.source === 'api') sourceUsed = 'serpapi-sold';
  else if (compsResult.source === 'browse') sourceUsed = 'ebay-browse';
  else if (compsResult.source === 'pricecharting') sourceUsed = 'pricecharting';
  
  // For vintage cards (pre-1990), ignore condition separation
  const isVintageCard = identity.game === 'sports' && identity.year && identity.year < 1990;
  
  let anchorPrice: number | null = null;
  let compCount = compsResult.comps?.length || 0;
  let isConservativeEstimate = false;
  
  if (isVintageCard) {
    // Vintage cards: use overall median
    anchorPrice = compsResult.medianPrice || null;
  } else if (compsResult.conditionStats) {
    // Modern cards: use condition-specific pricing
    const isUsed = !itemCondition || itemCondition.toLowerCase().includes('used') || 
                   itemCondition.toLowerCase().includes('pre-owned');
    
    if (isUsed && compsResult.conditionStats.used.count > 0) {
      anchorPrice = compsResult.conditionStats.used.medianPrice;
      compCount = compsResult.conditionStats.used.count;
    } else if (!isUsed && compsResult.conditionStats.newLike.count > 0) {
      anchorPrice = compsResult.conditionStats.newLike.medianPrice;
      compCount = compsResult.conditionStats.newLike.count;
    }
  } else {
    // Fallback to overall median
    anchorPrice = compsResult.medianPrice || null;
  }
  
  // If variant is unknown, mark as conservative estimate
  if (identity.variantFinish === 'unknown') {
    isConservativeEstimate = true;
  }
  
  // Calculate price range if we have comps
  let priceRangeLow: number | undefined;
  let priceRangeHigh: number | undefined;
  
  if (compsResult.comps && compsResult.comps.length > 0) {
    const prices = compsResult.comps.map(c => c.price).sort((a, b) => a - b);
    priceRangeLow = prices[0];
    priceRangeHigh = prices[prices.length - 1];
  }
  
  return createPriceTruth({
    source: sourceUsed,
    anchorPrice,
    priceRangeLow,
    priceRangeHigh,
    compCount,
    isConservativeEstimate,
    rawComps: compsResult.comps,
  });
}

// ============================================================================
// MAIN PIPELINE FUNCTION
// ============================================================================

/**
 * Execute the full card analysis pipeline
 * 
 * Pipeline: Front Scan → Back Scan → Checklist Validation → CardIdentity → PriceTruth → ComputedDecision
 * 
 * This is the SINGLE AUTHORITATIVE function for card analysis.
 * All UI screens must consume the CardAnalysisResult from this function.
 */
export function executeCardPipeline(
  input: CardScanInput,
  compsResult: {
    medianPrice?: number | null;
    source?: string;
    comps?: Array<{ title: string; price: number; condition?: string; soldDate?: string }>;
    conditionStats?: {
      used: { count: number; medianPrice: number | null };
      newLike: { count: number; medianPrice: number | null };
    };
  }
): CardAnalysisResult {
  // Step 1: Resolve identity with checklist validation
  const identity = resolveCardIdentity(input);
  
  // Step 2: Build price snapshot
  const priceTruth = buildPriceTruth(compsResult, identity, input.userInputs.condition);
  
  // Step 3: Calculate decision (single math authority)
  // This enforces: FLIP can NEVER occur if profitDollars < 0
  const result = createCardAnalysisResult(
    identity,
    priceTruth,
    input.userInputs.buyPrice,
    input.userInputs.shippingIn || 0
  );
  
  // Log pipeline execution for debugging
  console.log(`[CARD PIPELINE] Identity: ${identity.name} | Set: ${identity.setName} | Confidence: ${identity.confidenceState}`);
  console.log(`[CARD PIPELINE] Price: $${priceTruth.anchorPrice} | Source: ${priceTruth.sourceUsed} | Conservative: ${priceTruth.isConservativeEstimate}`);
  console.log(`[CARD PIPELINE] Decision: ${result.decision.flipDecision} | Profit: $${result.decision.profitDollars?.toFixed(2)} | Margin: ${result.decision.marginPercent?.toFixed(1)}%`);
  
  return result;
}

/**
 * Check if a category should use the card pipeline
 */
export function shouldUseCardPipeline(category: string): boolean {
  const cardCategories = [
    'sports cards',
    'trading cards',
    'tcg cards',
    'pokemon',
    'mtg',
    'magic the gathering',
    'yugioh',
    'yu-gi-oh',
    'marvel cards',
    'one piece',
    'lorcana',
    'baseball cards',
    'football cards',
    'basketball cards',
    'hockey cards',
  ];
  
  const normalizedCategory = category.toLowerCase().trim();
  return cardCategories.some(c => normalizedCategory.includes(c) || c.includes(normalizedCategory));
}
