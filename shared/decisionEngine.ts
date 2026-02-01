/**
 * Phase-1 Margin-Based Decision Engine
 * 
 * SINGLE SOURCE OF TRUTH for Flip/Skip verdicts.
 * 
 * Rules (LOCKED - do not modify without explicit approval):
 * 1. HARD GATE: If maxBuy ≤ 0 OR maxBuy is null → SKIP IT (no valid comps)
 * 2. HARD GATE: If netProfit ≤ 0 → SKIP IT (regardless of margin %)
 * 3. Net margin ≥ 25% AND netProfit > 0 → FLIP IT
 * 4. Net margin < 25% OR netProfit ≤ 0 → SKIP IT
 * 
 * Max Buy MUST be derived from cleaned comps ONLY (no fallback).
 * Vision confidence NEVER overrides profitability.
 */

export type DecisionVerdict = 'flip' | 'skip';

export type DataSourceConfidence = 'high' | 'medium' | 'low' | 'none';

export interface DecisionInput {
  buyPrice: number;
  shippingIn: number;
  expectedSalePrice: number | null;
  platformFeeRate?: number;
  outboundShipping?: number;
  dataSourceConfidence?: DataSourceConfidence;
  dataSourceType?: 'pricecharting' | 'marketplace_insights' | 'serpapi' | 'browse_api' | 'manual' | 'none';
  compCount?: number;
  compConfidence?: 'high' | 'low';
}

export interface DecisionResult {
  verdict: DecisionVerdict;
  label: string;
  marginPercent: number;
  confidence: number;
  dataSource: 'sold_comps' | 'active_listings' | 'manual' | 'none';
  dataSourceConfidence: DataSourceConfidence;
  maxBuy: number | null;
  marketValue: number | null;
  skipReason?: string;
  lowConfidence?: boolean;
  decisionTrace: string[];
  _diagnostics?: {
    netProfit: number;
    totalCost: number;
    platformFees: number;
    outboundShipping: number;
    compCount?: number;
    compConfidence?: string;
  };
}

// LOCKED CONSTANTS - DO NOT CHANGE
const MARGIN_THRESHOLD = 0.25; // 25% minimum margin for FLIP - LOCKED
const DEFAULT_PLATFORM_FEE_RATE = 0.13; // 13% eBay + PayPal - LOCKED
const DEFAULT_OUTBOUND_SHIPPING = 0; // Buyer pays shipping - LOCKED
const DEFAULT_FIXED_COSTS = 5; // Packaging, labels, etc. - LOCKED

/**
 * ============================================================================
 * LOCKED MATH - DO NOT MODIFY WITHOUT EXPLICIT APPROVAL
 * ============================================================================
 * 
 * THE SINGLE DECISION FUNCTION (NON-CARD ITEMS)
 * 
 * All verdict logic MUST go through this function.
 * No external code should override or bypass this.
 * 
 * DECISION GATES (LOCKED - IN ORDER):
 * 1. No valid comps (expectedSalePrice null) → SKIP
 * 2. maxBuy ≤ 0 → SKIP
 * 3. netProfit ≤ 0 → SKIP
 * 4. margin < 25% → SKIP
 * 5. ALL conditions met → FLIP
 * 
 * FORMULA (LOCKED):
 * - Total Cost = Buy Price + Shipping In
 * - Platform Fees = Expected Sale Price × 13%
 * - Net Profit = Expected Sale Price - Total Cost - Platform Fees - Outbound Shipping
 * - Margin = (Net Profit / Expected Sale Price) × 100
 * - Max Buy = Expected Sale Price - Platform Fees - Outbound Shipping - Fixed Costs - Shipping In - Target Profit
 * 
 * CONSTANTS (LOCKED):
 * - Platform Fee Rate: 13% (DEFAULT_PLATFORM_FEE_RATE = 0.13)
 * - Outbound Shipping: $0 (DEFAULT_OUTBOUND_SHIPPING - buyer pays)
 * - Fixed Costs: $5 (DEFAULT_FIXED_COSTS)
 * - Margin Threshold: 25% (MARGIN_THRESHOLD = 0.25)
 * 
 * This is the SINGLE SOURCE OF TRUTH for non-card profit calculations.
 * ============================================================================
 */
export function calculateDecision(input: DecisionInput): DecisionResult {
  const {
    buyPrice,
    shippingIn,
    expectedSalePrice,
    platformFeeRate = DEFAULT_PLATFORM_FEE_RATE,
    outboundShipping = DEFAULT_OUTBOUND_SHIPPING,
    dataSourceConfidence = 'high',
    dataSourceType = 'manual',
    compCount,
    compConfidence,
  } = input;

  // HARD GATE 1: No valid comps - cannot make decision
  if (expectedSalePrice === null || expectedSalePrice === undefined || expectedSalePrice <= 0) {
    const trace: string[] = [
      `Gate 1 FAILED: No valid sold comps found`,
      `Cannot calculate profit without market data`,
      `Need sold listings to determine expected sale price`,
    ];
    return {
      verdict: 'skip',
      label: 'Skip IT',
      marginPercent: 0,
      confidence: 0,
      dataSource: 'none',
      dataSourceConfidence: 'none',
      maxBuy: null,
      marketValue: null,
      skipReason: 'no_valid_comps',
      decisionTrace: trace,
      _diagnostics: {
        netProfit: 0,
        totalCost: buyPrice + shippingIn,
        platformFees: 0,
        outboundShipping,
        compCount: compCount || 0,
        compConfidence: compConfidence || 'none',
      },
    };
  }

  const totalCost = buyPrice + shippingIn;
  const platformFees = expectedSalePrice * platformFeeRate;
  const netProfit = expectedSalePrice - totalCost - platformFees - outboundShipping;
  
  const marginPercent = (netProfit / expectedSalePrice) * 100;

  // Calculate MAX BUY from comps (NO FALLBACK)
  // Formula: maxBuy = expectedSalePrice - platformFees - outboundShipping - fixedCosts - shippingIn - targetProfit
  // Apply 20% safety reduction to all max buy prices
  const targetProfit = expectedSalePrice * MARGIN_THRESHOLD;
  const calculatedMaxBuy = expectedSalePrice - platformFees - outboundShipping - DEFAULT_FIXED_COSTS - shippingIn - targetProfit;
  const maxBuy = calculatedMaxBuy > 0 ? Math.floor(calculatedMaxBuy * 0.8) : 0;

  // HARD GATE 2: maxBuy ≤ 0 means comps don't support any profitable purchase
  if (maxBuy <= 0) {
    const trace: string[] = [
      `Gate 1 PASSED: Found comps with median $${expectedSalePrice.toFixed(2)}`,
      `Gate 2 FAILED: Max buy price is $0 or less`,
      `After fees ($${platformFees.toFixed(2)}) and 25% target margin, no room for profit`,
    ];
    return {
      verdict: 'skip',
      label: 'Skip IT',
      marginPercent: Math.round(marginPercent * 10) / 10,
      confidence: 25,
      dataSource: mapDataSourceType(dataSourceType),
      dataSourceConfidence,
      maxBuy: 0,
      marketValue: expectedSalePrice,
      skipReason: 'max_buy_too_low',
      decisionTrace: trace,
      _diagnostics: {
        netProfit: Math.round(netProfit * 100) / 100,
        totalCost,
        platformFees: Math.round(platformFees * 100) / 100,
        outboundShipping,
        compCount,
        compConfidence,
      },
    };
  }

  // HARD GATE 3: netProfit ≤ 0 = SKIP regardless of margin
  if (netProfit <= 0) {
    const trace: string[] = [
      `Gate 1 PASSED: Found comps with median $${expectedSalePrice.toFixed(2)}`,
      `Gate 2 PASSED: Max buy is $${maxBuy}`,
      `Gate 3 FAILED: Net profit is -$${Math.abs(netProfit).toFixed(2)}`,
      `Total cost $${totalCost.toFixed(2)} + fees $${platformFees.toFixed(2)} exceeds sale price`,
    ];
    return {
      verdict: 'skip',
      label: 'Skip IT',
      marginPercent: Math.round(marginPercent * 10) / 10,
      confidence: calculateFinalConfidence(marginPercent, expectedSalePrice, dataSourceConfidence),
      dataSource: mapDataSourceType(dataSourceType),
      dataSourceConfidence,
      maxBuy,
      marketValue: expectedSalePrice,
      skipReason: 'negative_profit',
      decisionTrace: trace,
      _diagnostics: {
        netProfit: Math.round(netProfit * 100) / 100,
        totalCost,
        platformFees: Math.round(platformFees * 100) / 100,
        outboundShipping,
        compCount,
        compConfidence,
      },
    };
  }

  // HARD GATE 4: margin < 25% = SKIP
  const meetsMarginThreshold = marginPercent >= MARGIN_THRESHOLD * 100;
  if (!meetsMarginThreshold) {
    const roundedMargin = Math.round(marginPercent * 10) / 10;
    const trace: string[] = [
      `Gate 1 PASSED: Found comps with median $${expectedSalePrice.toFixed(2)}`,
      `Gate 2 PASSED: Max buy is $${maxBuy}`,
      `Gate 3 PASSED: Net profit is $${netProfit.toFixed(2)}`,
      `Gate 4 FAILED: Margin is ${roundedMargin}%, below 25% threshold`,
    ];
    return {
      verdict: 'skip',
      label: 'Skip IT',
      marginPercent: roundedMargin,
      confidence: calculateFinalConfidence(marginPercent, expectedSalePrice, dataSourceConfidence),
      dataSource: mapDataSourceType(dataSourceType),
      dataSourceConfidence,
      maxBuy,
      marketValue: expectedSalePrice,
      skipReason: 'low_margin',
      decisionTrace: trace,
      _diagnostics: {
        netProfit: Math.round(netProfit * 100) / 100,
        totalCost,
        platformFees: Math.round(platformFees * 100) / 100,
        outboundShipping,
        compCount,
        compConfidence,
      },
    };
  }

  // ALL GATES PASSED: FLIP IT!
  const roundedMargin = Math.round(marginPercent * 10) / 10;
  const roundedProfit = Math.round(netProfit * 100) / 100;
  const trace: string[] = [
    `Gate 1 PASSED: Found comps with median $${expectedSalePrice.toFixed(2)}`,
    `Gate 2 PASSED: Max buy is $${maxBuy}`,
    `Gate 3 PASSED: Net profit is $${roundedProfit}`,
    `Gate 4 PASSED: Margin is ${roundedMargin}%, exceeds 25% threshold`,
    `All gates passed → FLIP IT!`,
  ];
  return {
    verdict: 'flip' as DecisionVerdict,
    label: 'Flip IT!',
    marginPercent: roundedMargin,
    confidence: calculateFinalConfidence(marginPercent, expectedSalePrice, dataSourceConfidence),
    dataSource: mapDataSourceType(dataSourceType),
    dataSourceConfidence,
    maxBuy,
    marketValue: expectedSalePrice,
    decisionTrace: trace,
    _diagnostics: {
      netProfit: roundedProfit,
      totalCost,
      platformFees: Math.round(platformFees * 100) / 100,
      outboundShipping,
      compCount,
      compConfidence,
    },
  };
}

/**
 * Map data source type to legacy dataSource field
 */
function mapDataSourceType(dataSourceType: string | undefined): 'sold_comps' | 'active_listings' | 'manual' | 'none' {
  switch (dataSourceType) {
    case 'pricecharting':
    case 'marketplace_insights':
    case 'serpapi':
      return 'sold_comps';
    case 'browse_api':
      return 'active_listings';
    case 'none':
      return 'none';
    default:
      return 'manual';
  }
}

function calculateBaseConfidence(marginPercent: number, expectedSalePrice: number): number {
  let confidence = 50;
  
  if (expectedSalePrice > 0) confidence += 15;
  
  const marginDistance = Math.abs(marginPercent - 25);
  if (marginDistance > 20) confidence += 25;
  else if (marginDistance > 10) confidence += 15;
  else confidence += 5;
  
  return Math.min(95, Math.max(25, confidence));
}

/**
 * Calculate final confidence combining base confidence with data source quality
 * - High (PriceCharting, SerpAPI SOLD, eBay SOLD): No penalty
 * - Medium (SerpAPI for non-watches): -15% confidence
 * - Low (Browse API active listings): -25% confidence
 * - None (no comps): 0% confidence
 */
function calculateFinalConfidence(
  marginPercent: number, 
  expectedSalePrice: number, 
  sourceConfidence: DataSourceConfidence
): number {
  if (sourceConfidence === 'none') {
    return 0;
  }
  
  const base = calculateBaseConfidence(marginPercent, expectedSalePrice);
  
  switch (sourceConfidence) {
    case 'high':
      return base;
    case 'medium':
      return Math.max(25, base - 15);
    case 'low':
      return Math.max(25, base - 25);
    default:
      return base;
  }
}

export function getDecisionColors(verdict: DecisionVerdict): { text: string; bg: string; border: string } {
  switch (verdict) {
    case 'flip':
      return { text: 'text-green-400', bg: 'bg-green-500', border: 'border-green-500' };
    case 'skip':
      return { text: 'text-red-400', bg: 'bg-red-500', border: 'border-red-500' };
  }
}

export function formatDecisionLabel(verdict: DecisionVerdict): string {
  switch (verdict) {
    case 'flip':
      return 'Flip IT!';
    case 'skip':
      return 'Skip IT';
  }
}

export function getMarginBand(marginPercent: number, targetMargin: number = 25): { label: string; color: string } {
  // Compare actual margin to user's target margin
  const ratio = marginPercent / targetMargin;
  
  if (ratio >= 2) return { label: 'Well above target', color: 'text-green-500' };
  if (ratio >= 1.4) return { label: 'Above target margin', color: 'text-green-400' };
  if (ratio >= 1) return { label: 'Meets target margin', color: 'text-green-300' };
  if (ratio >= 0.6) return { label: 'Below target margin', color: 'text-amber-400' };
  if (ratio >= 0.2) return { label: 'Minimal margin', color: 'text-orange-400' };
  return { label: 'Below minimum threshold', color: 'text-red-400' };
}
