export type FlipTier = 'ready' | 'marginal' | 'skip';

export interface FlipTierInfo {
  tier: FlipTier;
  label: string;
  color: string;
  bgColor: string;
  textClass: string;
  bgClass: string;
}

export const FLIP_THRESHOLDS = {
  READY: 70,
  MARGINAL: 50,
} as const;

// ROI-based thresholds (optimized for return efficiency)
export const ROI_THRESHOLDS = {
  EXCELLENT: 3.0,    // 3x+ return = excellent
  GOOD: 2.0,         // 2x return = good
  ACCEPTABLE: 1.5,   // 1.5x return = acceptable
  MINIMUM: 1.2,      // 1.2x return = minimum viable
} as const;

// Profit-based thresholds (secondary consideration)
export const PROFIT_THRESHOLDS = {
  FLIP_MIN: 0,       // net profit > $0 = Flip
  MARGINAL_MIN: -5,  // net profit between -$5 and $0 = Marginal
} as const;

/**
 * Momentum badges for high-quality flips
 */
export type MomentumBadge = 'money_multiplier' | 'fast_turn' | 'solid_margin' | 'quick_flip';

export interface MomentumIndicator {
  badge: MomentumBadge;
  label: string;
  description: string;
  icon: string;
}

export const MOMENTUM_BADGES: Record<MomentumBadge, MomentumIndicator> = {
  money_multiplier: {
    badge: 'money_multiplier',
    label: 'Money Multiplier',
    description: '3x+ return on investment',
    icon: 'multiply',
  },
  fast_turn: {
    badge: 'fast_turn',
    label: 'Fast Turn',
    description: 'High demand, quick sell',
    icon: 'zap',
  },
  solid_margin: {
    badge: 'solid_margin',
    label: 'Solid Margin',
    description: '$20+ profit per flip',
    icon: 'trending-up',
  },
  quick_flip: {
    badge: 'quick_flip',
    label: 'Quick Flip',
    description: 'Low cost, fast turnaround',
    icon: 'refresh',
  },
};

/**
 * Calculate ROI multiple from buy price and net profit
 * @returns ROI as a multiple (e.g., 2.0 = 2x return, 9.0 = 9x return)
 */
export function calculateROI(buyPrice: number, netProfit: number): number {
  if (buyPrice <= 0) return 0;
  // ROI = (sell - buy) / buy = netProfit / buy
  // For $2 buy, $16 profit: 16/2 = 8x (meaning you 9x'd your money: $2 → $18)
  return netProfit / buyPrice;
}

/**
 * Calculate Flip Score optimized for ROI efficiency
 * 
 * Weights:
 * - ROI Multiple: 40% (high ROI = high score even with small profit)
 * - Sell-through confidence: 25% (comps count, data quality)
 * - Margin safety: 20% (room for error, absolute profit)
 * - Risk factors: 15% (volatility, spread)
 */
export function calculateFlipScore(params: {
  buyPrice: number;
  netProfit: number;
  compsCount: number;
  spreadPercent: number | null;
  hasComps: boolean;
}): number {
  const { buyPrice, netProfit, compsCount, spreadPercent, hasComps } = params;
  
  // Calculate ROI multiple
  const roi = calculateROI(buyPrice, netProfit);
  
  // === ROI COMPONENT (40%) ===
  // Score ROI on a curve: 3x+ = max, 1x = neutral, <1x = penalty
  let roiScore: number;
  if (roi >= 5) {
    roiScore = 100; // 5x+ = perfect
  } else if (roi >= 3) {
    roiScore = 85 + (roi - 3) * 7.5; // 3x-5x = 85-100
  } else if (roi >= 2) {
    roiScore = 70 + (roi - 2) * 15; // 2x-3x = 70-85
  } else if (roi >= 1.5) {
    roiScore = 55 + (roi - 1.5) * 30; // 1.5x-2x = 55-70
  } else if (roi >= 1) {
    roiScore = 40 + (roi - 1) * 30; // 1x-1.5x = 40-55
  } else if (roi >= 0) {
    roiScore = roi * 40; // 0-1x = 0-40
  } else {
    roiScore = Math.max(0, 20 + roi * 20); // Negative ROI = penalty
  }
  
  // === SELL-THROUGH CONFIDENCE (25%) ===
  let confidenceScore: number;
  if (!hasComps || compsCount === 0) {
    confidenceScore = 30; // AI estimate only
  } else if (compsCount >= 10) {
    confidenceScore = 100; // Excellent data
  } else if (compsCount >= 5) {
    confidenceScore = 80 + (compsCount - 5) * 4; // 5-10 comps
  } else if (compsCount >= 3) {
    confidenceScore = 60 + (compsCount - 3) * 10; // 3-5 comps
  } else {
    confidenceScore = 40 + compsCount * 10; // 1-2 comps
  }
  
  // === MARGIN SAFETY (20%) ===
  // Absolute profit matters for risk buffer
  let marginScore: number;
  if (netProfit >= 50) {
    marginScore = 100;
  } else if (netProfit >= 30) {
    marginScore = 80 + (netProfit - 30) * 1;
  } else if (netProfit >= 15) {
    marginScore = 60 + (netProfit - 15) * 1.33;
  } else if (netProfit >= 5) {
    marginScore = 40 + (netProfit - 5) * 2;
  } else if (netProfit >= 0) {
    marginScore = 20 + netProfit * 4;
  } else {
    marginScore = Math.max(0, 20 + netProfit * 4);
  }
  
  // === RISK FACTORS (15%) ===
  // Lower spread = more predictable pricing
  let riskScore: number;
  if (spreadPercent === null) {
    riskScore = 50; // Unknown = neutral
  } else if (spreadPercent <= 15) {
    riskScore = 100; // Very tight spread
  } else if (spreadPercent <= 25) {
    riskScore = 80 + (25 - spreadPercent) * 2;
  } else if (spreadPercent <= 40) {
    riskScore = 50 + (40 - spreadPercent) * 2;
  } else if (spreadPercent <= 60) {
    riskScore = 30 + (60 - spreadPercent) * 1;
  } else {
    riskScore = Math.max(10, 30 - (spreadPercent - 60) * 0.5);
  }
  
  // === COMBINE WEIGHTED SCORES ===
  const finalScore = 
    (roiScore * 0.40) +
    (confidenceScore * 0.25) +
    (marginScore * 0.20) +
    (riskScore * 0.15);
  
  // Clamp to 0-100 range
  return Math.min(100, Math.max(0, Math.round(finalScore)));
}

/**
 * Get momentum badges for a flip based on its characteristics
 */
export function getMomentumBadges(params: {
  buyPrice: number;
  netProfit: number;
  compsCount: number;
  spreadPercent: number | null;
}): MomentumIndicator[] {
  const { buyPrice, netProfit, compsCount, spreadPercent } = params;
  const badges: MomentumIndicator[] = [];
  
  const roi = calculateROI(buyPrice, netProfit);
  
  // Money Multiplier: 3x+ ROI
  if (roi >= 3) {
    badges.push(MOMENTUM_BADGES.money_multiplier);
  }
  
  // Fast Turn: High comps + tight spread = quick sell
  if (compsCount >= 5 && (spreadPercent === null || spreadPercent <= 25)) {
    badges.push(MOMENTUM_BADGES.fast_turn);
  }
  
  // Solid Margin: $20+ profit
  if (netProfit >= 20) {
    badges.push(MOMENTUM_BADGES.solid_margin);
  }
  
  // Quick Flip: Low buy price + positive profit (momentum builder)
  if (buyPrice <= 20 && netProfit > 0 && roi >= 1.5) {
    badges.push(MOMENTUM_BADGES.quick_flip);
  }
  
  return badges;
}

/**
 * Format ROI as a display string
 */
export function formatROI(roi: number): string {
  if (roi >= 10) {
    return `${Math.round(roi)}×`;
  } else if (roi >= 2) {
    return `${roi.toFixed(1)}×`;
  } else if (roi >= 1) {
    return `${(roi * 100).toFixed(0)}%`;
  } else if (roi >= 0) {
    return `${(roi * 100).toFixed(0)}%`;
  } else {
    return `−${(Math.abs(roi) * 100).toFixed(0)}%`;
  }
}

export function getFlipTier(score: number): FlipTier {
  if (score >= FLIP_THRESHOLDS.READY) return 'ready';
  if (score >= FLIP_THRESHOLDS.MARGINAL) return 'marginal';
  return 'skip';
}

/**
 * Deterministic tier based on net profit (fallback when no score available)
 */
export function getFlipTierByProfit(netProfit: number): FlipTier {
  if (netProfit > PROFIT_THRESHOLDS.FLIP_MIN) return 'ready';
  if (netProfit >= PROFIT_THRESHOLDS.MARGINAL_MIN) return 'marginal';
  return 'skip';
}

/**
 * Get tier info based on net profit (deterministic).
 */
export function getFlipTierInfoByProfit(netProfit: number): FlipTierInfo {
  const tier = getFlipTierByProfit(netProfit);
  
  switch (tier) {
    case 'ready':
      return {
        tier,
        label: "FLIP IT!",
        color: '#22c55e',
        bgColor: '#22c55e',
        textClass: 'result-flip',
        bgClass: 'result-flip-badge',
      };
    case 'marginal':
      return {
        tier,
        label: "SKIP IT!",
        color: '#ef4444',
        bgColor: '#ef4444',
        textClass: 'result-skip',
        bgClass: 'result-skip-badge',
      };
    case 'skip':
      return {
        tier,
        label: "SKIP IT!",
        color: '#ef4444',
        bgColor: '#ef4444',
        textClass: 'result-skip',
        bgClass: 'result-skip-badge',
      };
  }
}

export function getFlipTierInfo(score: number): FlipTierInfo {
  const tier = getFlipTier(score);
  
  switch (tier) {
    case 'ready':
      return {
        tier,
        label: "FLIP IT!",
        color: '#22c55e',
        bgColor: '#22c55e',
        textClass: 'result-flip',
        bgClass: 'result-flip-badge',
      };
    case 'marginal':
      return {
        tier,
        label: "SKIP IT!",
        color: '#ef4444',
        bgColor: '#ef4444',
        textClass: 'result-skip',
        bgClass: 'result-skip-badge',
      };
    case 'skip':
      return {
        tier,
        label: "SKIP IT!",
        color: '#ef4444',
        bgColor: '#ef4444',
        textClass: 'result-skip',
        bgClass: 'result-skip-badge',
      };
  }
}

export const USER_DECISIONS = ['flip', 'skip'] as const;
export type UserDecision = typeof USER_DECISIONS[number];

export function generateEbaySearchUrl(query: string): string {
  const encodedQuery = encodeURIComponent(query);
  return `https://www.ebay.com/sch/i.html?_nkw=${encodedQuery}&_sop=13&LH_Complete=1&LH_Sold=1`;
}

export interface FlipScoreBreakdown {
  factors: { label: string; status: 'good' | 'neutral' | 'poor' }[];
  summary: string;
}

/**
 * Get collaborative headline message for result display.
 * Uses "we" language to reinforce team/partner dynamic.
 */
export function getFlipHeadline(tier: FlipTier): string {
  switch (tier) {
    case 'ready':
      return "We like this one.";
    case 'marginal':
    case 'skip':
      return "Not worth the risk.";
  }
}

/**
 * Get ROI-focused headline that explains WHY the flip is smart
 */
export function getROIHeadline(roi: number, netProfit: number): string {
  if (roi >= 5) {
    return "Huge multiplier!";
  } else if (roi >= 3) {
    return "Strong return.";
  } else if (roi >= 2) {
    return "Good ROI.";
  } else if (netProfit >= 30) {
    return "Solid profit.";
  } else if (roi >= 1.5) {
    return "Decent flip.";
  } else if (netProfit > 0) {
    return "Small win.";
  } else {
    return "Not enough margin.";
  }
}

export function getFlipScoreBreakdown(
  score: number,
  hasComps: boolean,
  compsCount: number,
  spreadPercent: number | null,
  marginPercent: number | null,
  roi?: number
): FlipScoreBreakdown {
  const factors: { label: string; status: 'good' | 'neutral' | 'poor' }[] = [];
  
  // ROI factor (most important for return efficiency)
  if (roi !== undefined) {
    if (roi >= 3) {
      factors.push({ label: `${formatROI(roi)} return`, status: 'good' });
    } else if (roi >= 1.5) {
      factors.push({ label: `${formatROI(roi)} return`, status: 'neutral' });
    } else if (roi > 0) {
      factors.push({ label: `${formatROI(roi)} return (thin)`, status: 'poor' });
    } else {
      factors.push({ label: 'Negative return', status: 'poor' });
    }
  }
  
  // Comps/data quality
  if (hasComps && compsCount >= 5) {
    factors.push({ label: `${compsCount} comps`, status: 'good' });
  } else if (hasComps && compsCount >= 3) {
    factors.push({ label: `${compsCount} comps`, status: 'neutral' });
  } else if (hasComps && compsCount > 0) {
    factors.push({ label: `${compsCount} comp${compsCount > 1 ? 's' : ''} (limited)`, status: 'poor' });
  } else {
    factors.push({ label: 'No comps (estimate)', status: 'poor' });
  }
  
  // Spread/volatility
  if (spreadPercent !== null) {
    if (spreadPercent <= 20) {
      factors.push({ label: `${spreadPercent.toFixed(0)}% spread`, status: 'good' });
    } else if (spreadPercent <= 40) {
      factors.push({ label: `${spreadPercent.toFixed(0)}% spread`, status: 'neutral' });
    } else {
      factors.push({ label: `${spreadPercent.toFixed(0)}% spread`, status: 'poor' });
    }
  }
  
  // Margin percent
  if (marginPercent !== null) {
    if (marginPercent >= 30) {
      factors.push({ label: `${marginPercent.toFixed(0)}% margin`, status: 'good' });
    } else if (marginPercent >= 15) {
      factors.push({ label: `${marginPercent.toFixed(0)}% margin`, status: 'neutral' });
    } else {
      factors.push({ label: `${marginPercent.toFixed(0)}% margin`, status: 'poor' });
    }
  }
  
  // Summary based on ROI-first thinking
  let summary = '';
  if (roi !== undefined && roi >= 3) {
    summary = 'High ROI multiplier';
  } else if (score >= 70) {
    summary = 'Strong flip opportunity';
  } else if (score >= 50) {
    summary = 'Proceed with caution';
  } else {
    summary = hasComps ? 'Weak return or high risk' : 'Limited data available';
  }
  
  return { factors, summary };
}
