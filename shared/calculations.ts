/**
 * ============================================================================
 * LOCKED CONSTANTS - DO NOT MODIFY WITHOUT EXPLICIT APPROVAL
 * ============================================================================
 * 
 * Single source of truth for profit calculation constants and logic.
 * Used by both server (for AI prompts and storage) and client (for display).
 * 
 * These values are LOCKED and must remain consistent across all calculations.
 * Changing these will affect profit calculations for ALL items in the app.
 * ============================================================================
 */

// LOCKED CONSTANTS - DO NOT CHANGE
export const PLATFORM_FEE_RATE = 0.13; // 13% eBay/PayPal fees - LOCKED
export const OUTBOUND_SHIPPING_DEFAULT = 0; // Buyer pays shipping - LOCKED

/**
 * Safe number converter - ALWAYS returns a valid number.
 * Converts undefined, null, empty string, NaN → 0 (or specified default).
 * This prevents runtime crashes from toFixed(), reduce(), or arithmetic on invalid values.
 */
export function safeNumber(value: unknown, defaultValue: number = 0): number {
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }
  
  if (typeof value === 'number') {
    return isNaN(value) || !isFinite(value) ? defaultValue : value;
  }
  
  if (typeof value === 'string') {
    // Handle "Free" and other text values
    if (value.toLowerCase() === 'free' || value.toLowerCase() === 'unknown' || value.toLowerCase() === 'calculated') {
      return defaultValue;
    }
    // Parse numeric strings
    const parsed = parseFloat(value.replace(/[^0-9.-]/g, ''));
    return isNaN(parsed) || !isFinite(parsed) ? defaultValue : parsed;
  }
  
  return defaultValue;
}

/**
 * Safe toFixed wrapper - never crashes on invalid values.
 */
export function safeToFixed(value: unknown, decimals: number = 2): string {
  const num = safeNumber(value, 0);
  return num.toFixed(decimals);
}

/**
 * Safe average calculation for arrays - handles empty arrays and invalid values.
 */
export function safeAverage(values: unknown[], defaultValue: number = 0): number {
  if (!Array.isArray(values) || values.length === 0) {
    return defaultValue;
  }
  
  const validNumbers = values
    .map(v => safeNumber(v, NaN))
    .filter(n => !isNaN(n) && isFinite(n) && n > 0);
  
  if (validNumbers.length === 0) {
    return defaultValue;
  }
  
  const sum = validNumbers.reduce((a, b) => a + b, 0);
  return sum / validNumbers.length;
}

// Verdict thresholds
export const PROFITABLE_THRESHOLD = 15; // >= $15 net profit
export const MARGINAL_MIN_THRESHOLD = 1; // >= $1 and < $15

/**
 * Parse shipping value for calculations.
 * - "Free" or "0" → 0 (explicitly free)
 * - Numeric value → that value
 * - null, empty, "Unknown" → 0 (for calculation purposes, unknown treated as 0)
 * 
 * DEFENSIVE: Handles both string and numeric inputs to prevent runtime crashes
 */
export function parseShipping(value: string | number | null | undefined): number {
  // Handle null/undefined/empty
  if (value === null || value === undefined) {
    return 0;
  }
  
  // Handle numeric inputs directly
  if (typeof value === 'number') {
    return isNaN(value) ? 0 : Math.max(0, value);
  }
  
  // Convert to string for string operations
  const strValue = String(value);
  
  if (strValue === "" || strValue.toLowerCase() === "unknown") {
    return 0; // Unknown shipping treated as 0 for calculations
  }
  if (strValue.toLowerCase() === "free") {
    return 0;
  }
  // "Calculated" shipping is unknown - treat as 0 for optimistic calculations
  // but UI should flag this for user verification
  if (strValue.toLowerCase() === "calculated") {
    return 0;
  }
  const num = parseFloat(strValue.replace(/[^0-9.-]/g, ''));
  return isNaN(num) ? 0 : Math.max(0, num);
}

/**
 * Check if shipping value is unknown (not extracted) or calculated (needs user verification).
 * CRITICAL: "Calculated" means the Shipping section explicitly shows calculated shipping,
 * which requires user to verify the actual cost.
 * 
 * DEFENSIVE: Handles both string and numeric inputs to prevent runtime crashes
 */
export function isShippingUnknown(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  
  // Numeric values are known (not unknown)
  if (typeof value === 'number') {
    return isNaN(value);
  }
  
  const strValue = String(value);
  if (strValue === "" || strValue.toLowerCase() === "unknown") {
    return true;
  }
  if (strValue.toLowerCase() === "calculated") {
    return true;
  }
  return false;
}

/**
 * ============================================================================
 * LOCKED MATH - DO NOT MODIFY WITHOUT EXPLICIT APPROVAL
 * ============================================================================
 * 
 * Calculate net profit using consistent formula.
 * 
 * FORMULA (LOCKED):
 * Net Profit = Avg Sold Price - Buy Price - Inbound Shipping - Platform Fees - Outbound Shipping
 * 
 * CONSTANTS (LOCKED):
 * - Platform Fee Rate: 13% (PLATFORM_FEE_RATE = 0.13)
 * - Outbound Shipping Default: $0 (buyer pays shipping)
 * 
 * This is the SINGLE SOURCE OF TRUTH for profit calculations.
 * All UI screens MUST use this function or the pre-calculated values from backend.
 * 
 * NEVER recalculate profit separately - always use this function.
 * ============================================================================
 */
export function calculateNetProfit(params: {
  avgSoldPrice: number;
  buyPrice: number;
  shippingIn: number;
  platformFeeRate?: number;
  outboundShipping?: number;
}): number {
  const {
    avgSoldPrice,
    buyPrice,
    shippingIn,
    platformFeeRate = PLATFORM_FEE_RATE,
    outboundShipping = OUTBOUND_SHIPPING_DEFAULT,
  } = params;

  const platformFees = avgSoldPrice * platformFeeRate;
  const netProfit = avgSoldPrice - buyPrice - shippingIn - platformFees - outboundShipping;
  
  return Math.round(netProfit * 100) / 100; // Round to 2 decimal places
}

/**
 * Calculate platform fees.
 */
export function calculatePlatformFees(avgSoldPrice: number, feeRate: number = PLATFORM_FEE_RATE): number {
  return Math.round(avgSoldPrice * feeRate * 100) / 100;
}

/**
 * Determine verdict based on net profit.
 */
export function getVerdict(netProfit: number): 'Profitable' | 'Marginal' | 'Risky' {
  if (netProfit >= PROFITABLE_THRESHOLD) {
    return 'Profitable';
  } else if (netProfit >= MARGINAL_MIN_THRESHOLD) {
    return 'Marginal';
  }
  return 'Risky';
}

/**
 * Format shipping for display.
 * - "Free" → "Free"
 * - "0" or "0.00" → "Free" (explicitly zero cost)
 * - Numeric value > 0 → formatted as $X.XX
 * - null, empty → "Tap to verify" (prompt user to check)
 * 
 * Note: Never show "Unknown" - either show the value or prompt to verify.
 */
export function formatShippingDisplay(value: string | number | null | undefined, fallbackToVerify: boolean = false): string {
  // Handle null/undefined/empty - prompt to verify
  if (value === null || value === undefined || value === "" || 
      (typeof value === 'string' && value.toLowerCase() === "unknown")) {
    return fallbackToVerify ? "Tap to verify" : "Free";
  }
  
  // Handle "Calculated" shipping - always prompt to verify
  // CRITICAL: This is explicitly from the Shipping section saying shipping is calculated
  if (typeof value === 'string' && value.toLowerCase() === "calculated") {
    return "Calculated (verify)";
  }
  
  // Handle explicit "Free" string
  if (typeof value === 'string' && value.toLowerCase() === "free") {
    return "Free";
  }
  
  // Handle numeric values
  const numValue = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  
  if (isNaN(numValue)) {
    return fallbackToVerify ? "Tap to verify" : "Free";
  }
  
  // 0 means free shipping
  return numValue === 0 ? "Free" : `$${numValue.toFixed(2)}`;
}
