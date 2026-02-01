/**
 * Standardized Pricing Engine v2
 * 
 * SINGLE SOURCE OF TRUTH for all profit and pricing calculations.
 * Used across Single Scan, Yard Sale Mode, Batch Mode, and URL Analysis.
 * 
 * ALGORITHM ORDER:
 * 1. Pull sold comps (prefer sold over active)
 * 1.5. Percentile trim: Remove top 15% and bottom 15% (when >5 comps)
 * 2. Compute median
 * 3. IQR trim
 * 4. Recompute trimmedMedian, CV, range
 * 5. Reject outliers again (2.5x/0.4x thresholds)
 * 6. Compute expectedResale (median)
 * 7. Apply category ceiling
 * 8. Apply sanity ratio clamp
 * 9. Assign confidence (with "no clamp/ceiling = no HIGH" rule)
 * 10. Choose display mode (HIGH=single, else range)
 * 
 * FORMULAS (LOCKED):
 * 1. Net After Fees = Expected Resale × 0.87 (13% eBay/PayPal fees)
 * 2. Estimated GP = Net After Fees − Buy Price − Shipping Allowance
 * 3. Max Buy Price = Net After Fees − Target Profit
 * 4. Target Profit = MAX($15, Expected Resale × 0.25)
 * 
 * CONFIDENCE LEVELS (strict):
 * - HIGH: ≥5 comps + CV ≤ 0.30 + spread ≤ 2.2 + no ceiling/clamp applied
 * - MODERATE: 2-4 comps OR high variance OR ceiling applied
 * - LOW: 0-1 comps OR AI estimate OR sanity clamp applied
 */

// DEPRECATED: Use getCategoryFeeMultiplier(category) for category-specific fees
// Kept for backward compatibility - default 13% fee (0.87 multiplier)
export const PLATFORM_FEE_MULTIPLIER = 0.87;
export const DEFAULT_SHIPPING_ALLOWANCE = 6; // $6 default

// Category-specific fee rates - 6 core categories (Watches have higher processing fees)
export const CATEGORY_FEE_RATES: Record<string, number> = {
  'Shoes': 0.13,
  'Watches': 0.15,
  'Trading Cards': 0.13,
  'Collectibles': 0.13,
  'Electronics': 0.13,
  'Other': 0.13,
};

export function getCategoryFeeRate(category?: string): number {
  if (!category) return 0.13;
  return CATEGORY_FEE_RATES[category] ?? 0.13;
}

export function getCategoryFeeMultiplier(category?: string): number {
  return 1 - getCategoryFeeRate(category);
}
export const MIN_TARGET_PROFIT = 15; // $15 minimum
export const MIN_MARGIN_PERCENT = 0.25; // 25% minimum

// Confidence thresholds
export const HIGH_CONFIDENCE_MIN_COMPS = 5;
export const HIGH_CONFIDENCE_MAX_CV = 0.30;
export const HIGH_CONFIDENCE_MAX_SPREAD = 2.2;

// Outlier rejection thresholds (post-IQR)
export const OUTLIER_HIGH_MULTIPLIER = 2.5;
export const OUTLIER_LOW_MULTIPLIER = 0.4;

// Sanity clamp thresholds (strict)
export const SANITY_MAX_RESALE_VS_BUY = 3; // Max 3x buy price
export const SANITY_MAX_RESALE_VS_MEDIAN = 3; // Max 3x trimmed median

// Category ceiling fallback multiplier
export const CATEGORY_CEILING_FALLBACK_MULTIPLIER = 2.5;

// Hard-coded category ceilings - 6 core categories
export const CATEGORY_PRICE_CEILINGS: Record<string, number> = {
  'Shoes': 350,
  'Watches': 2000,
  'Trading Cards': 500,
  'Collectibles': 300,
  'Electronics': 300,
  'Other': 500,
};

export type ConfidenceLevel = 'high' | 'moderate' | 'low' | 'ai_estimate';
export type PriceSource = 'sold_comps' | 'active_listings' | 'ai_estimate';
export type DisplayMode = 'single' | 'range' | 'estimate_range';

export interface ShippingOverrides {
  [category: string]: number;
}

// Shipping costs - 6 core categories
export const CATEGORY_SHIPPING: ShippingOverrides = {
  'Shoes': 10,
  'Watches': 8,
  'Trading Cards': 4,
  'Collectibles': 8,
  'Electronics': 12,
  'Other': 8,
};

export function getShippingAllowance(category?: string): number {
  if (!category) return DEFAULT_SHIPPING_ALLOWANCE;
  return CATEGORY_SHIPPING[category] ?? DEFAULT_SHIPPING_ALLOWANCE;
}

export function getConfidenceLabel(confidence: ConfidenceLevel): string {
  switch (confidence) {
    case 'high': return 'High confidence';
    case 'moderate': return 'Moderate confidence';
    case 'low': return 'Limited data';
    case 'ai_estimate': return 'AI Estimate';
  }
}

export function getConfidenceColor(confidence: ConfidenceLevel): 'green' | 'yellow' | 'red' {
  switch (confidence) {
    case 'high': return 'green';
    case 'moderate': return 'yellow';
    case 'low': return 'red';
    case 'ai_estimate': return 'red';
  }
}

export function getConfidenceBadgeVariant(confidence: ConfidenceLevel): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (confidence) {
    case 'high': return 'default';
    case 'moderate': return 'secondary';
    case 'low': return 'outline';
    case 'ai_estimate': return 'destructive';
  }
}

/**
 * Calculate coefficient of variation (standard deviation / mean)
 */
export function calculateCV(prices: number[]): number {
  if (prices.length < 2) return 1; // Max uncertainty for single/no comps
  
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  if (mean === 0) return 1;
  
  const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
  const stdDev = Math.sqrt(variance);
  
  return stdDev / mean;
}

/**
 * Calculate spread ratio (max/min)
 */
export function calculateSpread(prices: number[]): number {
  if (prices.length < 2) return Infinity;
  
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  
  if (min <= 0) return Infinity;
  return max / min;
}

/**
 * Calculate median from an array of prices
 */
export function calculateMedian(prices: number[]): number {
  if (!prices || prices.length === 0) return 0;
  
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Percentile trim: Remove top 15% and bottom 15% of comps
 * Only applied when there are more than 5 comps to ensure we keep enough data
 * Ensures at least 1 is removed from each end, and at least 3 comps remain
 */
export function trimPercentile(prices: number[], trimPercent: number = 0.15): number[] {
  if (prices.length <= 5) return prices; // Don't trim if 5 or fewer comps
  
  const sorted = [...prices].sort((a, b) => a - b);
  // Calculate trim count, but ensure at least 1 from each end
  const trimCount = Math.max(1, Math.floor(sorted.length * trimPercent));
  
  // Remove bottom 15% and top 15%
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
  
  // Ensure we keep at least 3 comps after trimming
  if (trimmed.length < 3) {
    return sorted.slice(1, sorted.length - 1); // Just remove 1 from each end
  }
  
  return trimmed;
}

/**
 * IQR-based outlier filtering (Step 3)
 */
export function filterOutliersIQR(prices: number[]): number[] {
  if (prices.length < 4) return prices;
  
  const sorted = [...prices].sort((a, b) => a - b);
  const q1Index = Math.floor(sorted.length * 0.25);
  const q3Index = Math.floor(sorted.length * 0.75);
  const q1 = sorted[q1Index];
  const q3 = sorted[q3Index];
  const iqr = q3 - q1;
  
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;
  
  return sorted.filter(p => p >= lowerBound && p <= upperBound);
}

/**
 * Median-based outlier rejection (Step 5)
 * Reject comps that are >2.5x or <0.4x the trimmed median
 */
export function rejectMedianOutliers(prices: number[], trimmedMedian: number): number[] {
  if (trimmedMedian <= 0) return prices;
  
  const upperBound = trimmedMedian * OUTLIER_HIGH_MULTIPLIER;
  const lowerBound = trimmedMedian * OUTLIER_LOW_MULTIPLIER;
  
  return prices.filter(p => p >= lowerBound && p <= upperBound);
}

/**
 * Get category ceiling (Step 7)
 * Uses hardcoded ceilings until rolling percentile data is available
 */
export function getCategoryCeiling(category?: string, trimmedMedian?: number): number {
  if (category && CATEGORY_PRICE_CEILINGS[category]) {
    return CATEGORY_PRICE_CEILINGS[category];
  }
  
  // Fallback: 2.5x trimmed median
  if (trimmedMedian && trimmedMedian > 0) {
    return trimmedMedian * CATEGORY_CEILING_FALLBACK_MULTIPLIER;
  }
  
  return Infinity; // No ceiling if no data
}

/**
 * Apply sanity ratio clamp (Step 8)
 * STRICT: If expectedResale > 3x buy price (when provided) OR > 3x median → clamp
 * Uses the MORE RESTRICTIVE of the two limits to prevent inflated values
 */
export function applySanityClamp(
  expectedResale: number, 
  buyPrice: number | undefined, 
  trimmedMedian: number
): { clampedResale: number; wasClampApplied: boolean } {
  const medianClamp = trimmedMedian * SANITY_MAX_RESALE_VS_MEDIAN;
  
  if (buyPrice === undefined || buyPrice <= 0) {
    // No buy price - use median clamp only
    if (expectedResale > medianClamp && medianClamp > 0) {
      return { clampedResale: medianClamp, wasClampApplied: true };
    }
    return { clampedResale: expectedResale, wasClampApplied: false };
  }
  
  const buyPriceClamp = buyPrice * SANITY_MAX_RESALE_VS_BUY;
  // Use the MORE RESTRICTIVE (smaller) of the two limits
  const maxAllowed = Math.min(buyPriceClamp, medianClamp > 0 ? medianClamp : buyPriceClamp);
  
  if (expectedResale > maxAllowed && maxAllowed > 0) {
    // Apply the tighter clamp (3x buy price) when sanity fails
    const finalClamp = buyPrice * SANITY_MAX_RESALE_VS_MEDIAN;
    return { clampedResale: Math.max(finalClamp, trimmedMedian), wasClampApplied: true };
  }
  
  return { clampedResale: expectedResale, wasClampApplied: false };
}

export interface CompProcessingResult {
  originalComps: number[];
  iqrFilteredComps: number[];
  finalComps: number[];
  trimmedMedian: number;
  cv: number;
  spread: number;
  lowComp: number;
  highComp: number;
}

/**
 * Normalize resale range to ensure it aligns with guardrails (ceiling/clamp)
 * Guarantees: low <= expectedResale <= high
 * When clampApplied or ceilingApplied, constrains range to expectedResale +/- 15%
 */
export function normalizeResaleRange(
  range: { low: number; high: number },
  expectedResale: number,
  options: { ceilingApplied?: boolean; clampApplied?: boolean } = {}
): { low: number; high: number } {
  const { ceilingApplied, clampApplied } = options;
  
  if (!ceilingApplied && !clampApplied) {
    // No guardrails - adjust range to bracket expectedResale if needed
    return {
      low: Math.min(range.low, Math.round(expectedResale * 0.85)),
      high: Math.max(range.high, Math.round(expectedResale * 1.15))
    };
  }
  
  // Guardrails applied - constrain range to expectedResale +/- 15%
  // Ensure range always contains expectedResale (low <= expectedResale <= high)
  const targetLow = Math.round(expectedResale * 0.85);
  const targetHigh = Math.round(expectedResale * 1.15);
  
  return {
    low: Math.max(1, Math.min(range.low, targetLow)),
    high: Math.max(targetHigh, Math.round(expectedResale)) // Ensure high >= expectedResale
  };
}

/**
 * Process comps through the full pipeline (Steps 1-5)
 * 
 * NEW: Step 1.5 - Percentile trim (15% top/bottom) when >5 comps
 */
export function processComps(rawPrices: number[]): CompProcessingResult {
  const originalComps = rawPrices.filter(p => p > 0);
  
  if (originalComps.length === 0) {
    return {
      originalComps: [],
      iqrFilteredComps: [],
      finalComps: [],
      trimmedMedian: 0,
      cv: 1,
      spread: Infinity,
      lowComp: 0,
      highComp: 0,
    };
  }
  
  // Step 1.5: Percentile trim (removes top 15% and bottom 15% when >5 comps)
  const percentileTrimmed = trimPercentile(originalComps, 0.15);
  
  // Step 2-3: IQR filtering on percentile-trimmed data
  const iqrFilteredComps = filterOutliersIQR(percentileTrimmed);
  const intermediateMedian = calculateMedian(iqrFilteredComps);
  
  // Step 4-5: Reject outliers again using 2.5x/0.4x thresholds
  const finalComps = rejectMedianOutliers(iqrFilteredComps, intermediateMedian);
  
  // Recompute stats on final comps
  const trimmedMedian = calculateMedian(finalComps);
  const cv = calculateCV(finalComps);
  const spread = calculateSpread(finalComps);
  const lowComp = finalComps.length > 0 ? Math.min(...finalComps) : 0;
  const highComp = finalComps.length > 0 ? Math.max(...finalComps) : 0;
  
  return {
    originalComps,
    iqrFilteredComps,
    finalComps,
    trimmedMedian,
    cv,
    spread,
    lowComp,
    highComp,
  };
}

export interface PricingInput {
  rawCompPrices?: number[];
  medianSoldPrice?: number; // Can provide directly if comps already processed
  buyPrice?: number;
  category?: string;
  shippingAllowance?: number;
  soldCompCount?: number;
  priceSource: PriceSource;
}

export interface PricingResult {
  expectedResale: number;
  netAfterFees: number;
  maxBuyPrice: number;
  targetProfit: number;
  estimatedGP: number | null;
  estimatedGPRange: { low: number; high: number } | null;
  shippingAllowance: number;
  confidence: ConfidenceLevel;
  confidenceLabel: string;
  confidenceColor: 'green' | 'yellow' | 'red';
  displayMode: DisplayMode;
  priceSource: PriceSource;
  soldCompCount: number;
  isEstimate: boolean;
  marginPercent: number | null;
  resaleRange: { low: number; high: number };
  cv: number;
  spread: number;
  ceilingApplied: boolean;
  clampApplied: boolean;
  lowComp: number;
  highComp: number;
  inconsistentCompsWarning: boolean;
}

/**
 * MAIN PRICING CALCULATION
 * 
 * Implements full algorithm with clamps, ceilings, and strict confidence rules.
 */
export function calculatePricing(input: PricingInput): PricingResult {
  const {
    rawCompPrices,
    medianSoldPrice: providedMedian,
    buyPrice,
    category,
    shippingAllowance: customShipping,
    soldCompCount: providedCount,
    priceSource,
  } = input;

  const shippingAllowance = customShipping ?? getShippingAllowance(category);
  
  // Process comps if provided
  let compResult: CompProcessingResult;
  if (rawCompPrices && rawCompPrices.length > 0) {
    compResult = processComps(rawCompPrices);
  } else {
    // Use provided median as fallback
    const median = providedMedian ?? 0;
    compResult = {
      originalComps: [],
      iqrFilteredComps: [],
      finalComps: [],
      trimmedMedian: median,
      cv: 1,
      spread: Infinity,
      lowComp: median,
      highComp: median,
    };
  }
  
  const soldCompCount = compResult.finalComps.length || providedCount || 0;
  let expectedResale = compResult.trimmedMedian;
  
  // Step 7: Apply category ceiling
  const categoryCeiling = getCategoryCeiling(category, compResult.trimmedMedian);
  let ceilingApplied = false;
  if (expectedResale > categoryCeiling) {
    expectedResale = categoryCeiling;
    ceilingApplied = true;
  }
  
  // Step 8: Apply sanity ratio clamp
  const { clampedResale, wasClampApplied } = applySanityClamp(
    expectedResale, 
    buyPrice, 
    compResult.trimmedMedian
  );
  expectedResale = clampedResale;
  const clampApplied = wasClampApplied;
  
  // Step 9: Assign confidence with strict rules
  let confidence: ConfidenceLevel;
  
  const meetsHighCompCount = soldCompCount >= HIGH_CONFIDENCE_MIN_COMPS;
  const meetsHighCV = compResult.cv <= HIGH_CONFIDENCE_MAX_CV;
  const meetsHighSpread = compResult.spread <= HIGH_CONFIDENCE_MAX_SPREAD;
  const noClampOrCeiling = !ceilingApplied && !clampApplied;
  const isSoldComps = priceSource === 'sold_comps';
  
  if (meetsHighCompCount && meetsHighCV && meetsHighSpread && noClampOrCeiling && isSoldComps) {
    confidence = 'high';
  } else if (soldCompCount >= 2 && isSoldComps) {
    confidence = 'moderate';
  } else if (soldCompCount >= 1 || priceSource === 'active_listings') {
    confidence = 'low';
  } else {
    confidence = 'ai_estimate';
  }
  
  // Downgrade confidence if ceiling/clamp was applied
  if (ceilingApplied && confidence === 'high') {
    confidence = 'moderate';
  }
  if (clampApplied) {
    confidence = 'low'; // Sanity clamp always forces LOW
  }
  
  // Step 10: Choose display mode
  let displayMode: DisplayMode;
  if (confidence === 'high') {
    displayMode = 'single';
  } else if (confidence === 'moderate') {
    displayMode = 'range';
  } else {
    displayMode = 'estimate_range';
  }
  
  // Calculate and normalize resale range using centralized function
  const rawRange = compResult.lowComp > 0 && compResult.highComp > 0
    ? { low: Math.round(compResult.lowComp), high: Math.round(compResult.highComp) }
    : { 
        low: Math.round(expectedResale * 0.65), 
        high: Math.round(expectedResale * 1.35) 
      };
  const resaleRange = normalizeResaleRange(rawRange, expectedResale, { ceilingApplied, clampApplied });
  
  // Net After Fees = Expected Resale × (1 - category fee rate)
  const feeMultiplier = getCategoryFeeMultiplier(category);
  const netAfterFees = Math.round(expectedResale * feeMultiplier * 100) / 100;

  // Target Profit = MAX($15, 25% of expected resale)
  const percentBasedProfit = expectedResale * MIN_MARGIN_PERCENT;
  const targetProfit = Math.max(MIN_TARGET_PROFIT, percentBasedProfit);

  // Max Buy = Net After Fees - Target Profit (with 20% safety reduction)
  let maxBuyPrice = Math.floor((netAfterFees - targetProfit) * 0.8);
  if (maxBuyPrice < 0) maxBuyPrice = 0;

  // Estimated GP (only if buyPrice provided)
  let estimatedGP: number | null = null;
  let estimatedGPRange: { low: number; high: number } | null = null;
  let marginPercent: number | null = null;
  
  if (buyPrice !== undefined && buyPrice !== null && buyPrice > 0) {
    estimatedGP = Math.round((netAfterFees - buyPrice - shippingAllowance) * 100) / 100;
    
    if (expectedResale > 0) {
      marginPercent = Math.round((estimatedGP / expectedResale) * 100);
    }
    
    // Calculate GP range for non-HIGH confidence
    if (confidence !== 'high') {
      const lowNetAfterFees = resaleRange.low * feeMultiplier;
      const highNetAfterFees = resaleRange.high * feeMultiplier;
      estimatedGPRange = {
        low: Math.round(lowNetAfterFees - buyPrice - shippingAllowance),
        high: Math.round(highNetAfterFees - buyPrice - shippingAllowance),
      };
    }
  }

  const isEstimate = priceSource !== 'sold_comps' || soldCompCount < 1;
  const inconsistentCompsWarning = compResult.cv > 0.35 || compResult.spread > 2.5;

  return {
    expectedResale,
    netAfterFees,
    maxBuyPrice,
    targetProfit: Math.round(targetProfit * 100) / 100,
    estimatedGP,
    estimatedGPRange,
    shippingAllowance,
    confidence,
    confidenceLabel: getConfidenceLabel(confidence),
    confidenceColor: getConfidenceColor(confidence),
    displayMode,
    priceSource,
    soldCompCount,
    isEstimate,
    marginPercent,
    resaleRange,
    cv: compResult.cv,
    spread: compResult.spread,
    ceilingApplied,
    clampApplied,
    lowComp: compResult.lowComp,
    highComp: compResult.highComp,
    inconsistentCompsWarning,
  };
}

/**
 * Calculate verdict based on pricing
 */
export function getFlipVerdict(pricing: PricingResult, buyPrice: number): 'flip' | 'skip' {
  if (pricing.maxBuyPrice <= 0) return 'skip';
  if (buyPrice > pricing.maxBuyPrice) return 'skip';
  if (pricing.estimatedGP === null || pricing.estimatedGP <= 0) return 'skip';
  if (pricing.marginPercent === null || pricing.marginPercent < 25) return 'skip';
  return 'flip';
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '--';
  return `$${Math.abs(amount).toFixed(0)}`;
}

/**
 * Format price range for display
 */
export function formatPriceRange(range: { low: number; high: number }): string {
  return `$${range.low}–$${range.high}`;
}

/**
 * Format profit with sign
 */
export function formatProfit(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '--';
  const sign = amount >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(amount).toFixed(0)}`;
}

/**
 * Format profit range
 */
export function formatProfitRange(range: { low: number; high: number } | null): string {
  if (!range) return '--';
  if (range.low < 0 && range.high < 0) {
    return `-$${Math.abs(range.high)} to -$${Math.abs(range.low)}`;
  }
  if (range.low < 0) {
    return `-$${Math.abs(range.low)} to +$${range.high}`;
  }
  return `+$${range.low} to +$${range.high}`;
}

/**
 * Get display text for expected resale based on confidence
 */
export function getResaleDisplayText(pricing: PricingResult): string {
  if (pricing.displayMode === 'single') {
    return `$${Math.round(pricing.expectedResale)}`;
  }
  if (pricing.displayMode === 'range') {
    return formatPriceRange(pricing.resaleRange);
  }
  return `Estimate: ${formatPriceRange(pricing.resaleRange)}`;
}

/**
 * Legacy function for backward compatibility
 * Maps old confidence level logic to new system
 */
export function getConfidenceLevel(soldCompCount: number): ConfidenceLevel {
  if (soldCompCount >= HIGH_CONFIDENCE_MIN_COMPS) return 'high';
  if (soldCompCount >= 2) return 'moderate';
  if (soldCompCount >= 1) return 'low';
  return 'ai_estimate';
}

/**
 * Legacy filterOutliers function for backward compatibility
 */
export function filterOutliers(prices: number[]): number[] {
  return filterOutliersIQR(prices);
}
