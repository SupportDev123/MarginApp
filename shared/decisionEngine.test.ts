/**
 * Decision Engine Tests
 * 
 * These tests verify the margin-based decision logic is working correctly.
 * CRITICAL RULES:
 * 1. HARD GATE: If netProfit ≤ 0, verdict MUST be SKIP (regardless of margin %)
 * 2. Net margin ≥ 25% AND netProfit > 0 → FLIP IT
 * 3. Net margin < 25% OR netProfit ≤ 0 → SKIP IT
 */

import { calculateDecision, type DecisionInput } from './decisionEngine';

describe('calculateDecision - Margin-Based Verdicts', () => {
  
  it('should return FLIP IT for 64% margin even with low dollar profit (~$13)', () => {
    const input: DecisionInput = {
      buyPrice: 8,
      shippingIn: 0,
      expectedSalePrice: 35,
      platformFeeRate: 0.13,
      outboundShipping: 0,
    };
    
    const result = calculateDecision(input);
    
    expect(result.verdict).toBe('flip');
    expect(result.label).toBe('Flip IT!');
    expect(result.marginPercent).toBeGreaterThanOrEqual(25);
    
    if (result._diagnostics) {
      expect(result._diagnostics.netProfit).toBeGreaterThan(10);
      expect(result._diagnostics.netProfit).toBeLessThan(25);
    }
    
    console.log('64% margin test result:', {
      verdict: result.verdict,
      marginPercent: result.marginPercent,
      diagnosticProfit: result._diagnostics?.netProfit,
    });
  });

  it('should return FLIP IT for exactly 25% margin', () => {
    const input: DecisionInput = {
      buyPrice: 50,
      shippingIn: 5,
      expectedSalePrice: 100,
      platformFeeRate: 0.13,
      outboundShipping: 7,
    };
    
    const result = calculateDecision(input);
    
    expect(result.verdict).toBe('flip');
    expect(result.marginPercent).toBeGreaterThanOrEqual(25);
  });

  it('should return SKIP IT for 24% margin', () => {
    const input: DecisionInput = {
      buyPrice: 60,
      shippingIn: 5,
      expectedSalePrice: 100,
      platformFeeRate: 0.13,
      outboundShipping: 7,
    };
    
    const result = calculateDecision(input);
    
    expect(result.verdict).toBe('skip');
    expect(result.label).toBe('Skip IT');
    expect(result.marginPercent).toBeLessThan(25);
  });

  it('should return SKIP IT for negative margin even with high sale price', () => {
    const input: DecisionInput = {
      buyPrice: 100,
      shippingIn: 10,
      expectedSalePrice: 90,
      platformFeeRate: 0.13,
      outboundShipping: 5,
    };
    
    const result = calculateDecision(input);
    
    expect(result.verdict).toBe('skip');
    expect(result.marginPercent).toBeLessThan(0);
  });

  it('should return FLIP IT for high margin with HIGH dollar profit', () => {
    const input: DecisionInput = {
      buyPrice: 100,
      shippingIn: 10,
      expectedSalePrice: 300,
      platformFeeRate: 0.13,
      outboundShipping: 10,
    };
    
    const result = calculateDecision(input);
    
    expect(result.verdict).toBe('flip');
    expect(result.marginPercent).toBeGreaterThanOrEqual(25);
    
    if (result._diagnostics) {
      expect(result._diagnostics.netProfit).toBeGreaterThan(100);
    }
  });

  it('low dollar profit with high margin should FLIP (when profit > 0)', () => {
    const lowDollarHighMargin: DecisionInput = {
      buyPrice: 5,
      shippingIn: 0,
      expectedSalePrice: 20,
      platformFeeRate: 0.13,
      outboundShipping: 0,
    };
    
    const result = calculateDecision(lowDollarHighMargin);
    
    expect(result.verdict).toBe('flip');
    expect(result.marginPercent).toBeGreaterThanOrEqual(25);
    if (result._diagnostics) {
      expect(result._diagnostics.netProfit).toBeGreaterThan(0);
    }
  });

  it('high dollar profit with low margin should SKIP', () => {
    const highDollarLowMargin: DecisionInput = {
      buyPrice: 800,
      shippingIn: 50,
      expectedSalePrice: 1000,
      platformFeeRate: 0.13,
      outboundShipping: 50,
    };
    
    const result = calculateDecision(highDollarLowMargin);
    
    expect(result.verdict).toBe('skip');
    expect(result.marginPercent).toBeLessThan(25);
  });

  it('HARD GATE: netProfit ≤ 0 MUST always return SKIP regardless of any other factors', () => {
    const negativeProfitCase: DecisionInput = {
      buyPrice: 100,
      shippingIn: 20,
      expectedSalePrice: 100,
      platformFeeRate: 0.13,
      outboundShipping: 0,
    };
    
    const result = calculateDecision(negativeProfitCase);
    
    expect(result.verdict).toBe('skip');
    expect(result.label).toBe('Skip IT');
    if (result._diagnostics) {
      expect(result._diagnostics.netProfit).toBeLessThanOrEqual(0);
    }
  });

  it('HARD GATE: exactly zero profit MUST return SKIP', () => {
    const zeroProfitCase: DecisionInput = {
      buyPrice: 74,
      shippingIn: 0,
      expectedSalePrice: 100,
      platformFeeRate: 0.13,
      outboundShipping: 13,
    };
    
    const result = calculateDecision(zeroProfitCase);
    
    expect(result.verdict).toBe('skip');
    if (result._diagnostics) {
      expect(result._diagnostics.netProfit).toBeLessThanOrEqual(0);
    }
  });

  // Tests for canonical skip reason codes
  describe('Canonical Skip Reason Codes', () => {
    it('should return skipReason "no_valid_comps" when expectedSalePrice is null', () => {
      const input: DecisionInput = {
        buyPrice: 50,
        shippingIn: 5,
        expectedSalePrice: null, // No valid comps
        platformFeeRate: 0.13,
        outboundShipping: 0,
      };
      
      const result = calculateDecision(input);
      
      expect(result.verdict).toBe('skip');
      expect(result.skipReason).toBe('no_valid_comps');
    });

    it('should return skipReason "no_valid_comps" when expectedSalePrice is 0', () => {
      const input: DecisionInput = {
        buyPrice: 50,
        shippingIn: 5,
        expectedSalePrice: 0, // Invalid comps
        platformFeeRate: 0.13,
        outboundShipping: 0,
      };
      
      const result = calculateDecision(input);
      
      expect(result.verdict).toBe('skip');
      expect(result.skipReason).toBe('no_valid_comps');
    });

    it('should return skipReason "max_buy_too_low" when maxBuy is 0', () => {
      const input: DecisionInput = {
        buyPrice: 0,
        shippingIn: 0,
        expectedSalePrice: 10, // Low sale price makes maxBuy 0
        platformFeeRate: 0.13,
        outboundShipping: 0,
      };
      
      const result = calculateDecision(input);
      
      expect(result.verdict).toBe('skip');
      expect(result.skipReason).toBe('max_buy_too_low');
    });

    it('should return skipReason "negative_profit" when netProfit <= 0', () => {
      const input: DecisionInput = {
        buyPrice: 90,
        shippingIn: 10,
        expectedSalePrice: 100, // Total cost exceeds net revenue
        platformFeeRate: 0.13,
        outboundShipping: 0,
      };
      
      const result = calculateDecision(input);
      
      expect(result.verdict).toBe('skip');
      expect(result.skipReason).toBe('negative_profit');
    });

    it('should return skipReason "low_margin" when margin < 25%', () => {
      const input: DecisionInput = {
        buyPrice: 60,
        shippingIn: 5,
        expectedSalePrice: 100, // ~22% margin
        platformFeeRate: 0.13,
        outboundShipping: 7,
      };
      
      const result = calculateDecision(input);
      
      expect(result.verdict).toBe('skip');
      expect(result.skipReason).toBe('low_margin');
      expect(result.marginPercent).toBeLessThan(25);
    });

    it('should NOT have skipReason when verdict is FLIP', () => {
      const input: DecisionInput = {
        buyPrice: 30,
        shippingIn: 5,
        expectedSalePrice: 100, // Good margin
        platformFeeRate: 0.13,
        outboundShipping: 0,
      };
      
      const result = calculateDecision(input);
      
      expect(result.verdict).toBe('flip');
      expect(result.skipReason).toBeUndefined();
    });
  });
});
