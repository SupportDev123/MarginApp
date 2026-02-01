export function parseMoney(input: string): number | null {
  if (!input || typeof input !== 'string') return null;
  const cleaned = input.replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) || num < 0 ? null : num;
}

export interface CompsStats {
  avg: number;
  median: number;
  min: number;
  max: number;
  spread: number;
  confidence: number;
}

export function computeCompsStats(prices: number[]): CompsStats | null {
  const validPrices = prices.filter(p => typeof p === 'number' && p > 0);
  if (validPrices.length < 3) return null;

  const sorted = [...validPrices].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / sorted.length;

  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];

  const spread = avg > 0 ? ((max - min) / avg) * 100 : 0;

  let confidence = 100;
  if (sorted.length < 4) confidence -= 15;
  if (spread > 50) confidence -= 25;
  else if (spread > 30) confidence -= 15;
  else if (spread > 15) confidence -= 5;

  confidence = Math.max(0, Math.min(100, confidence));

  return {
    avg: Math.round(avg * 100) / 100,
    median: Math.round(median * 100) / 100,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    spread: Math.round(spread * 10) / 10,
    confidence: Math.round(confidence),
  };
}
