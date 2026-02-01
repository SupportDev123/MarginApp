/**
 * Card Decision Engine - Single Source of Truth for Card Identification & Pricing
 * 
 * This module implements a unified pipeline for trading cards that ensures
 * consistency across ALL screens in the application.
 * 
 * ============================================================================
 * LOCKED SYSTEM MODEL (DO NOT MODIFY WITHOUT EXPLICIT APPROVAL)
 * ============================================================================
 * 
 * CORE IDENTITY PRINCIPLE:
 * Card number is the PRIMARY economic identity. Variants do NOT create a new
 * comp universe. Example: 2020 Prizm Justin Herbert #325 — all variants (base,
 * silver, red ice, disco, etc.) share the same card number and base demand.
 * Variant only affects premium, not whether pricing is valid.
 * 
 * PRICING RULES:
 * - If set + cardNumber confirmed AND base comps exist → pricing allowed
 * - Variant uncertainty must NEVER block pricing (uses conservative base)
 * - Variant uncertainty defaults to conservative base pricing
 * - Ultra-precise variant pricing is NOT required to function
 * - No comps at all = legitimate data gap → BLOCKED (not a model violation)
 * 
 * CONFIDENCE RULES (degrade confidence, NOT functionality):
 * - HIGH: Set + cardNumber confirmed + variant confirmed → full pricing
 * - ESTIMATE: Set + cardNumber confirmed (variant uncertain) → conservative base pricing
 * - BLOCKED: Set OR cardNumber cannot be validated → no pricing
 * 
 * DECISION RULES (decoupled from confidence):
 * - FLIP: Profit > 0 AND margin >= threshold (any confidence except BLOCKED)
 * - SKIP: Profit <= 0 OR margin < threshold (math-based, not confidence-based)
 * - BLOCKED: Identity validation failed → forced skip
 * 
 * KEY INVARIANTS:
 * - Uncertainty alone cannot force SKIP
 * - Profit < 0 always forces SKIP (regardless of confidence)
 * - ESTIMATE can return FLIP with lowConfidence flag
 * - No fallback fuzzy pricing outside checklist universe
 * 
 * Key Principles:
 * 1. ONE canonical CardIdentity object consumed by all screens
 * 2. ONE PriceTruth snapshot for stable pricing
 * 3. ONE ComputedDecision with all math - no local calculations per screen
 * 4. Confidence states (HIGH/ESTIMATE/BLOCKED) for graceful degradation
 * 5. Checklist validation - cards must exist in our database
 */

// ============================================================================
// CONFIDENCE STATES
// ============================================================================

export type IdentityConfidenceState = 'HIGH' | 'ESTIMATE' | 'BLOCKED';

/**
 * HIGH: Set + cardNumber confirmed + variant confirmed → full pricing
 * ESTIMATE: Set + cardNumber confirmed, variant uncertain → conservative base pricing
 * BLOCKED: Set OR cardNumber cannot be validated → no pricing
 * 
 * NOTE: Variant uncertainty does NOT block pricing. Card number is the primary
 * economic identity; variants are pricing modifiers only.
 */

// ============================================================================
// CARD IDENTITY - The Canonical Card Object
// ============================================================================

export type CardGame = 'pokemon' | 'mtg' | 'yugioh' | 'sports' | 'marvel' | 'one-piece' | 'lorcana' | 'other';

export type VariantFinish = 
  | 'normal' 
  | 'holo' 
  | 'reverse-holo' 
  | 'full-art' 
  | 'parallel' 
  | 'refractor'
  | 'prizm'
  | 'auto'
  | 'relic'
  | 'graded'
  | 'unknown';

export interface ScanEvidence {
  source: 'front' | 'back' | 'ai-vision' | 'barcode' | 'manual';
  rawText?: string;
  confidence: number; // 0-100
  extractedData?: {
    candidateNames?: string[];
    setCode?: string;
    setSymbol?: string;
    cardNumber?: string;
    year?: number;
    language?: string;
    grader?: string;
    gradeValue?: string;
    serialNumber?: string;
  };
}

export interface ChecklistMatchDetails {
  matchType: 'exact' | 'name-only' | 'fuzzy' | 'none';
  checklistSetId?: string;
  checklistCardId?: string;
  alternativeCandidates?: number; // How many other cards could this be?
  matchConfidence: number; // 0-100
}

export interface CardIdentity {
  // Core identification
  game: CardGame;
  setName: string;
  setCode?: string; // e.g., "BASE", "SWSH1", "2024 Prizm"
  setId?: string; // Internal reference
  cardNumber?: string; // As printed, e.g., "4/102" or "4"
  cardNumberTotal?: number; // Total cards in set if known
  name: string; // Card/player name
  
  // Variant & condition
  variantFinish: VariantFinish;
  variantLabel?: string; // Full label like "Silver Prizm /299"
  serialNumber?: string; // e.g., "/299" or "123/299"
  isGraded: boolean;
  grader?: string; // PSA, BGS, SGC, CGC
  gradeValue?: string; // "10", "9.5", "MINT 9"
  
  // Metadata
  year?: number;
  language?: string; // "EN", "JP", etc.
  sport?: string; // For sports cards: "football", "basketball", etc.
  
  // Confidence & evidence
  confidenceState: IdentityConfidenceState;
  identityEvidence: {
    frontScan?: ScanEvidence;
    backScan?: ScanEvidence;
    checklistMatch?: ChecklistMatchDetails;
  };
  
  // Resolution metadata
  resolvedAt: Date;
  resolutionPath: string[]; // Trace of how we identified this card
  blockReason?: string; // If BLOCKED, why?
}

// ============================================================================
// PRICE TRUTH - Stable Price Snapshot Layer
// ============================================================================

export type PriceSourceType = 
  | 'pricecharting'
  | 'serpapi-sold'
  | 'ebay-browse'
  | 'tcgplayer'
  | 'cached-snapshot'
  | 'manual'
  | 'none';

export interface PriceTruth {
  // Core pricing
  sourceUsed: PriceSourceType;
  anchorPrice: number | null; // The primary price we use for decisions
  priceRangeLow?: number;
  priceRangeHigh?: number;
  
  // Confidence
  pricingConfidence: 'HIGH' | 'ESTIMATE' | 'NONE';
  compCount?: number;
  
  // Metadata
  updatedAt: Date;
  snapshotKey?: string; // Cache key: game+setId+cardNumber+variant
  
  // Conservative pricing flag
  isConservativeEstimate: boolean; // True if variant unknown, using base price
  
  // Raw data reference
  rawComps?: Array<{
    title: string;
    price: number;
    condition?: string;
    soldDate?: string;
  }>;
}

// ============================================================================
// COMPUTED DECISION - Single Math Output for All Screens
// ============================================================================

// LOCKED: Decision is math-based. Confidence tracked separately via decisionConfidence.
// FLIP = profitable, SKIP = not profitable, BLOCKED = identity failed
export type FlipDecision = 'FLIP' | 'SKIP' | 'BLOCKED';

export interface ComputedDecision {
  // The verdict
  flipDecision: FlipDecision;
  displayLabel: string; // User-friendly label
  
  // Core financials (computed once, used everywhere)
  buyPrice: number;
  expectedSellPrice: number | null;
  profitDollars: number | null;
  marginPercent: number | null;
  roiPercent: number | null; // Return on investment
  maxBuyPrice: number | null;
  
  // Fee breakdown
  platformFees: number;
  shippingIn: number;
  shippingOut: number;
  otherCosts: number;
  totalCosts: number;
  
  // Confidence
  decisionConfidence: 'HIGH' | 'ESTIMATE' | 'NONE';
  
  // Trace for debugging
  decisionTrace: string[];
  
  // Warnings to display
  warnings: string[];
}

// ============================================================================
// CARD ANALYSIS RESULT - Complete Package for UI Consumption
// ============================================================================

export interface CardAnalysisResult {
  identity: CardIdentity;
  priceTruth: PriceTruth;
  decision: ComputedDecision;
  
  // Timestamp
  analyzedAt: Date;
  
  // For UI display
  displaySummary: {
    headline: string; // "FLIP IT - $45 Profit" or "BLOCKED - Card Not Found"
    subheadline: string; // "2024 Prizm Silver /299"
    confidenceLabel: string; // "High Confidence" or "Estimate - Verify Variant"
  };
}

// ============================================================================
// DECISION ENGINE CONSTANTS - LOCKED (DO NOT CHANGE)
// ============================================================================

const MARGIN_THRESHOLD = 0.25; // 25% minimum margin for FLIP - LOCKED
const DEFAULT_PLATFORM_FEE_RATE = 0.13; // 13% eBay + PayPal - LOCKED
const DEFAULT_FIXED_COSTS = 5; // Packaging, labels, etc. - LOCKED
const CONSERVATIVE_PRICE_MULTIPLIER = 0.85; // 85% of anchor for unknown variants - LOCKED

// ============================================================================
// CARD DECISION ENGINE - The Single Calculator
// ============================================================================

export interface CardDecisionInput {
  identity: CardIdentity;
  priceTruth: PriceTruth;
  userInputs: {
    buyPrice: number;
    shippingIn?: number;
    shippingOut?: number;
    platformFeeRate?: number;
    otherCosts?: number;
  };
}

/**
 * ============================================================================
 * LOCKED MATH - DO NOT MODIFY WITHOUT EXPLICIT APPROVAL
 * ============================================================================
 * 
 * THE SINGLE DECISION FUNCTION FOR CARDS
 * 
 * All card verdict logic MUST go through this function.
 * Every screen must consume this output - no local calculations.
 * 
 * DECISION GATES (LOCKED - IN ORDER):
 * 1. If identity is BLOCKED → decision is BLOCKED
 * 2. If no valid price anchor → decision is BLOCKED
 * 3. If profit <= 0 → decision is SKIP (NEVER FLIP)
 * 4. If margin < 25% → decision is SKIP
 * 5. All profit/margin gates passed → decision is FLIP
 * 
 * FORMULA (LOCKED):
 * - Platform Fees = Expected Sell Price × 13%
 * - Total Costs = Buy Price + Shipping In + Shipping Out + Platform Fees + Other Costs
 * - Profit = Expected Sell Price - Total Costs
 * - Margin = (Profit / Expected Sell Price) × 100
 * - Max Buy = Expected Sell Price - Fees - Shipping - Target Profit (25%)
 * 
 * CONSTANTS (LOCKED):
 * - Platform Fee Rate: 13% (DEFAULT_PLATFORM_FEE_RATE = 0.13)
 * - Margin Threshold: 25% (MARGIN_THRESHOLD = 0.25)
 * - Conservative Price Multiplier: 85% (when variant unknown)
 * - Fixed Costs: $5 (DEFAULT_FIXED_COSTS)
 * 
 * This is the SINGLE SOURCE OF TRUTH for card profit calculations.
 * The profitDollars returned here MUST be used by all UI screens.
 * 
 * NEVER recalculate card profit separately - use decision.profitDollars.
 * ============================================================================
 */
export function calculateCardDecision(input: CardDecisionInput): ComputedDecision {
  const { identity, priceTruth, userInputs } = input;
  const trace: string[] = [];
  const warnings: string[] = [];
  
  const {
    buyPrice,
    shippingIn = 0,
    shippingOut = 0,
    platformFeeRate = DEFAULT_PLATFORM_FEE_RATE,
    otherCosts = DEFAULT_FIXED_COSTS,
  } = userInputs;
  
  // GATE 1: Identity must not be BLOCKED
  if (identity.confidenceState === 'BLOCKED') {
    trace.push(`Gate 1 FAILED: Card identity is BLOCKED`);
    trace.push(`Reason: ${identity.blockReason || 'Unknown'}`);
    return createBlockedDecision(buyPrice, shippingIn, shippingOut, otherCosts, trace, [
      identity.blockReason || 'Card could not be identified'
    ]);
  }
  
  // GATE 2: Must have valid anchor price
  // NOTE: This blocks when NO comps exist at all (legitimate data gap)
  // This is different from variant uncertainty - if base comps exist but variant
  // is unknown, anchorPrice will be set to conservative base pricing (doesn't block)
  // Only blocks when we truly have no market data to price from
  if (priceTruth.anchorPrice === null || priceTruth.anchorPrice <= 0) {
    trace.push(`Gate 2 FAILED: No valid price data`);
    trace.push(`Price source: ${priceTruth.sourceUsed}`);
    return createBlockedDecision(buyPrice, shippingIn, shippingOut, otherCosts, trace, [
      'No pricing data available for this card'
    ]);
  }
  
  trace.push(`Gate 1 PASSED: Identity confidence = ${identity.confidenceState}`);
  trace.push(`Gate 2 PASSED: Anchor price = $${priceTruth.anchorPrice.toFixed(2)}`);
  
  // Calculate expected sell price (conservative if variant unknown)
  let expectedSellPrice = priceTruth.anchorPrice;
  if (priceTruth.isConservativeEstimate || identity.variantFinish === 'unknown') {
    expectedSellPrice = priceTruth.anchorPrice * CONSERVATIVE_PRICE_MULTIPLIER;
    trace.push(`Conservative pricing applied: $${expectedSellPrice.toFixed(2)} (85% of anchor)`);
    warnings.push('Variant not confirmed - using conservative estimate');
  }
  
  // Calculate all costs
  const platformFees = expectedSellPrice * platformFeeRate;
  const totalCosts = buyPrice + shippingIn + shippingOut + platformFees + otherCosts;
  
  // Calculate profit and margins
  const profitDollars = expectedSellPrice - totalCosts;
  const marginPercent = expectedSellPrice > 0 ? (profitDollars / expectedSellPrice) * 100 : 0;
  const roiPercent = buyPrice > 0 ? (profitDollars / buyPrice) * 100 : null;
  
  // Calculate max buy price (what's the most we'd pay and still hit 25% margin?)
  // Apply 20% safety reduction to max buy price
  const targetProfit = expectedSellPrice * MARGIN_THRESHOLD;
  const rawMaxBuyPrice = expectedSellPrice - platformFees - shippingIn - shippingOut - otherCosts - targetProfit;
  const maxBuyPrice = rawMaxBuyPrice * 0.8;
  
  trace.push(`Costs: Buy=$${buyPrice}, Fees=$${platformFees.toFixed(2)}, Total=$${totalCosts.toFixed(2)}`);
  trace.push(`Profit: $${profitDollars.toFixed(2)}, Margin: ${marginPercent.toFixed(1)}%`);
  
  // GATE 3: Profit must be positive (CRITICAL - prevents "$X profit" but "SKIP" contradiction)
  if (profitDollars <= 0) {
    trace.push(`Gate 3 FAILED: Negative profit ($${profitDollars.toFixed(2)})`);
    return {
      flipDecision: 'SKIP',
      displayLabel: 'Skip It',
      buyPrice,
      expectedSellPrice,
      profitDollars,
      marginPercent,
      roiPercent,
      maxBuyPrice: maxBuyPrice > 0 ? Math.floor(maxBuyPrice) : 0,
      platformFees,
      shippingIn,
      shippingOut,
      otherCosts,
      totalCosts,
      decisionConfidence: priceTruth.pricingConfidence,
      decisionTrace: trace,
      warnings: [...warnings, 'No profit at this buy price'],
    };
  }
  
  // GATE 4: Margin must meet threshold
  if (marginPercent < MARGIN_THRESHOLD * 100) {
    trace.push(`Gate 4 FAILED: Margin ${marginPercent.toFixed(1)}% < ${MARGIN_THRESHOLD * 100}%`);
    return {
      flipDecision: 'SKIP',
      displayLabel: 'Skip It',
      buyPrice,
      expectedSellPrice,
      profitDollars,
      marginPercent,
      roiPercent,
      maxBuyPrice: maxBuyPrice > 0 ? Math.floor(maxBuyPrice) : 0,
      platformFees,
      shippingIn,
      shippingOut,
      otherCosts,
      totalCosts,
      decisionConfidence: priceTruth.pricingConfidence,
      decisionTrace: trace,
      warnings: [...warnings, `Margin below ${MARGIN_THRESHOLD * 100}% threshold`],
    };
  }
  
  trace.push(`Gate 3 PASSED: Positive profit`);
  trace.push(`Gate 4 PASSED: Margin meets threshold`);
  
  // ALL PROFIT/MARGIN GATES PASSED - FLIP IT
  // Per locked system model: ESTIMATE can return FLIP with lowConfidence
  // Decision is decoupled from confidence - math determines flip/skip
  const isEstimate = identity.confidenceState === 'ESTIMATE';
  
  if (isEstimate) {
    trace.push(`All gates PASSED with ESTIMATE confidence: FLIP IT (low confidence)`);
  } else {
    trace.push(`All gates PASSED: FLIP IT`);
  }
  
  return {
    // LOCKED SYSTEM MODEL: Decision is math-based, confidence is separate
    // FLIP for all profitable cases - lowConfidence flag signals ESTIMATE
    flipDecision: 'FLIP',
    displayLabel: isEstimate ? 'Likely Flip' : 'Flip It',
    buyPrice,
    expectedSellPrice,
    profitDollars,
    marginPercent,
    roiPercent,
    maxBuyPrice: maxBuyPrice > 0 ? Math.floor(maxBuyPrice) : 0,
    platformFees,
    shippingIn,
    shippingOut,
    otherCosts,
    totalCosts,
    // Confidence still tracked for UI display, but doesn't change decision
    decisionConfidence: isEstimate ? 'ESTIMATE' : 'HIGH',
    decisionTrace: trace,
    warnings: isEstimate 
      ? [...warnings, 'Verify card details for final confirmation'] 
      : warnings,
  };
}

// Helper to create BLOCKED decision
function createBlockedDecision(
  buyPrice: number,
  shippingIn: number,
  shippingOut: number,
  otherCosts: number,
  trace: string[],
  warnings: string[]
): ComputedDecision {
  return {
    flipDecision: 'BLOCKED',
    displayLabel: 'Unable to Analyze',
    buyPrice,
    expectedSellPrice: null,
    profitDollars: null,
    marginPercent: null,
    roiPercent: null,
    maxBuyPrice: null,
    platformFees: 0,
    shippingIn,
    shippingOut,
    otherCosts,
    totalCosts: buyPrice + shippingIn + shippingOut + otherCosts,
    decisionConfidence: 'NONE',
    decisionTrace: trace,
    warnings,
  };
}

// ============================================================================
// IDENTITY RESOLUTION HELPERS
// ============================================================================

/**
 * Create a CardIdentity from scan results
 * This is the entry point for the identity resolution pipeline
 */
export function createCardIdentity(params: {
  game: CardGame;
  name: string;
  setName: string;
  setCode?: string;
  cardNumber?: string;
  variantFinish?: VariantFinish;
  variantLabel?: string;
  year?: number;
  isGraded?: boolean;
  grader?: string;
  gradeValue?: string;
  sport?: string;
  frontScanEvidence?: ScanEvidence;
  backScanEvidence?: ScanEvidence;
  checklistMatch?: ChecklistMatchDetails;
}): CardIdentity {
  const {
    game,
    name,
    setName,
    setCode,
    cardNumber,
    variantFinish = 'unknown',
    variantLabel,
    year,
    isGraded = false,
    grader,
    gradeValue,
    sport,
    frontScanEvidence,
    backScanEvidence,
    checklistMatch,
  } = params;
  
  // Determine confidence state based on available evidence
  let confidenceState: IdentityConfidenceState = 'ESTIMATE';
  let blockReason: string | undefined;
  const resolutionPath: string[] = [];
  
  // Per LOCKED SYSTEM MODEL:
  // - BLOCKED: set OR cardNumber cannot be validated
  // - HIGH: set + cardNumber confirmed AND variant confirmed
  // - ESTIMATE: set + cardNumber confirmed BUT variant uncertain
  
  if (!checklistMatch || checklistMatch.matchType === 'none') {
    // No checklist match at all
    confidenceState = 'BLOCKED';
    blockReason = 'Card not found in checklist database';
    resolutionPath.push('Checklist lookup failed - no matching card');
  } else if (!cardNumber && checklistMatch.matchType !== 'exact') {
    // LOCKED MODEL: cardNumber is required for pricing
    // Name-only matches without cardNumber → BLOCKED
    confidenceState = 'BLOCKED';
    blockReason = 'Card number required for pricing - could not identify card number';
    resolutionPath.push('Partial match without card number - pricing not allowed');
  } else if (checklistMatch.matchType === 'exact' && (variantFinish !== 'unknown' || !hasMultipleVariants(game, setName))) {
    // Exact match with variant confirmed (or variant doesn't matter for this set)
    confidenceState = 'HIGH';
    resolutionPath.push(`Exact checklist match: ${checklistMatch.checklistSetId}/${checklistMatch.checklistCardId}`);
    if (variantFinish !== 'unknown') {
      resolutionPath.push(`Variant confirmed: ${variantFinish}`);
    }
  } else {
    // ESTIMATE: Set + cardNumber confirmed, variant uncertain
    // Per locked model: this MUST allow pricing with conservative estimate
    confidenceState = 'ESTIMATE';
    resolutionPath.push(`Set + card number confirmed: ${checklistMatch.matchType}`);
    if (variantFinish === 'unknown') {
      resolutionPath.push('Variant not confirmed - using conservative base pricing');
    }
  }
  
  return {
    game,
    name,
    setName,
    setCode,
    cardNumber,
    variantFinish,
    variantLabel,
    isGraded,
    grader,
    gradeValue,
    year,
    sport,
    confidenceState,
    blockReason,
    identityEvidence: {
      frontScan: frontScanEvidence,
      backScan: backScanEvidence,
      checklistMatch,
    },
    resolvedAt: new Date(),
    resolutionPath,
  };
}

/**
 * Create a PriceTruth from comps data
 */
export function createPriceTruth(params: {
  source: PriceSourceType;
  anchorPrice: number | null;
  priceRangeLow?: number;
  priceRangeHigh?: number;
  compCount?: number;
  isConservativeEstimate?: boolean;
  rawComps?: Array<{ title: string; price: number; condition?: string; soldDate?: string }>;
}): PriceTruth {
  const {
    source,
    anchorPrice,
    priceRangeLow,
    priceRangeHigh,
    compCount,
    isConservativeEstimate = false,
    rawComps,
  } = params;
  
  let pricingConfidence: 'HIGH' | 'ESTIMATE' | 'NONE' = 'NONE';
  
  if (anchorPrice !== null && anchorPrice > 0) {
    if (compCount && compCount >= 3 && !isConservativeEstimate) {
      pricingConfidence = 'HIGH';
    } else {
      pricingConfidence = 'ESTIMATE';
    }
  }
  
  return {
    sourceUsed: source,
    anchorPrice,
    priceRangeLow,
    priceRangeHigh,
    pricingConfidence,
    compCount,
    updatedAt: new Date(),
    isConservativeEstimate,
    rawComps,
  };
}

/**
 * Create the complete CardAnalysisResult for UI consumption
 */
export function createCardAnalysisResult(
  identity: CardIdentity,
  priceTruth: PriceTruth,
  buyPrice: number,
  shippingIn: number = 0
): CardAnalysisResult {
  const decision = calculateCardDecision({
    identity,
    priceTruth,
    userInputs: { buyPrice, shippingIn },
  });
  
  // Generate display summary
  let headline: string;
  let confidenceLabel: string;
  
  switch (decision.flipDecision) {
    case 'FLIP':
      // Check decisionConfidence to differentiate FLIP with HIGH vs ESTIMATE confidence
      if (decision.decisionConfidence === 'ESTIMATE') {
        headline = `LIKELY FLIP - ~$${decision.profitDollars?.toFixed(0)} Profit`;
        confidenceLabel = 'Estimate - Verify Details';
      } else {
        headline = `FLIP IT - $${decision.profitDollars?.toFixed(0)} Profit`;
        confidenceLabel = 'High Confidence';
      }
      break;
    case 'SKIP':
      headline = decision.profitDollars && decision.profitDollars > 0 
        ? `SKIP - Only $${decision.profitDollars.toFixed(0)} Profit`
        : 'SKIP - No Profit';
      confidenceLabel = decision.decisionConfidence === 'HIGH' ? 'High Confidence' : 'Estimate';
      break;
    case 'BLOCKED':
      headline = 'BLOCKED - Card Not Identified';
      confidenceLabel = 'Rescan Required';
      break;
  }
  
  const subheadline = identity.variantLabel 
    ? `${identity.year || ''} ${identity.setName} ${identity.variantLabel}`.trim()
    : `${identity.year || ''} ${identity.setName} ${identity.name}`.trim();
  
  return {
    identity,
    priceTruth,
    decision,
    analyzedAt: new Date(),
    displaySummary: {
      headline,
      subheadline,
      confidenceLabel,
    },
  };
}

// Helper to check if a set has multiple variant options
function hasMultipleVariants(game: CardGame, setName: string): boolean {
  // Most modern sets have parallels
  if (game === 'sports') return true;
  if (game === 'pokemon' && setName.toLowerCase().includes('prizm')) return true;
  if (game === 'pokemon') return true; // Holos, reverse holos, etc.
  return false;
}
