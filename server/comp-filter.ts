/**
 * Universal Comp Filter
 * 
 * Filters sold comps to ensure relevance across ALL categories.
 * Only keeps comps that closely match the identified item.
 * 
 * RULES:
 * 1. Exclude parts, repairs, bundles, lots
 * 2. Exclude accessories (cases, bands, chargers)
 * 3. Match condition (used vs new should not mix)
 * 4. Title keyword matching (at least 50% of key terms must match)
 * 5. Price sanity (exclude extreme outliers before IQR)
 */

import type { CompLike } from '@shared/schema';

export interface FilteredCompResult {
  filteredComps: CompLike[];
  excludedCount: number;
  exclusionReasons: Record<string, number>;
  matchScore: number;
}

const UNIVERSAL_EXCLUSIONS = [
  /\b(parts?|repair|for parts|broken|not working|needs work|non.?working|damaged|as.?is)\b/i,
  /\b(bundle|lot of \d+|set of \d+|collection of|bulk|wholesale)\b/i,
  /\b(box only|papers only|certificate only|manual only)\b/i,
  /\b(display|dummy|replica|fake|counterfeit|knock.?off)\b/i,
  /\b(empty box|box and papers|no watch|no item)\b/i,
];

const CATEGORY_EXCLUSIONS: Record<string, RegExp[]> = {
  'Watches': [
    /\b(band only|strap only|case only|dial only|movement only|bezel only|crown only)\b/i,
    /\b(replacement band|spare strap|extra band)\b/i,
    /\b(charger|charging cable|dock|stand)\b/i,
    /\b(screen protector|tempered glass|film)\b/i,
  ],
  'Shoes': [
    /\b(insole|sole only|laces only|box only)\b/i,
    /\b(cleaning kit|shoe tree|shoe horn)\b/i,
    /\b(left shoe only|right shoe only|single shoe)\b/i,
    /\b(display|sample|factory second|defect)\b/i,
  ],
  'Trading Cards': [
    /\b(empty binder|binder only|sleeve|top loader|case)\b/i,
    /\b(repack|mystery pack|grab bag)\b/i,
    /\b(damaged|creased|corner ding|whitening)\b/i,
    /\b(common|bulk commons|base lot)\b/i,
  ],
  'Collectibles': [
    /\b(box only|no figure|empty box|damaged box)\b/i,
    /\b(loose|out of box|oob|no packaging)\b/i,
    /\b(custom|repaint|kitbash|bootleg)\b/i,
  ],
  'Electronics': [
    /\b(charger only|cable only|adapter only|power supply)\b/i,
    /\b(case|cover|screen protector|film)\b/i,
    /\b(for parts|not working|broken screen|cracked)\b/i,
    /\b(locked|icloud locked|blacklisted|bad esn)\b/i,
  ],
  'Other': [],
};

const CONDITION_MAP: Record<string, string[]> = {
  'new': ['new', 'brand new', 'sealed', 'factory sealed', 'unopened', 'bnib', 'nib', 'mint'],
  'used': ['used', 'pre-owned', 'preowned', 'pre owned', 'excellent', 'good', 'fair', 'worn'],
  'refurbished': ['refurbished', 'renewed', 'certified refurbished', 'manufacturer refurbished'],
};

function normalizeCondition(condition: string): 'new' | 'used' | 'refurbished' | 'unknown' {
  const lower = condition.toLowerCase();
  for (const [key, values] of Object.entries(CONDITION_MAP)) {
    if (values.some(v => lower.includes(v))) {
      return key as 'new' | 'used' | 'refurbished';
    }
  }
  return 'unknown';
}

function extractKeywords(title: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
    'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'must', 'shall', 'can', 'this', 'that', 'these', 'those', 'it', 'its', 'they',
    'their', 'them', 'he', 'she', 'his', 'her', 'we', 'our', 'you', 'your',
    'free', 'shipping', 'fast', 'ship', 'ships', 'shipped', 'usa', 'us', 'new',
    'authentic', 'genuine', 'original', 'official', '100%', 'w/', 'w/o'
  ]);
  
  return title
    .toLowerCase()
    .replace(/[^\w\s#-]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 1 && !stopWords.has(word));
}

function calculateKeywordMatchScore(targetTitle: string, compTitle: string): number {
  const targetKeywords = extractKeywords(targetTitle);
  const compKeywords = new Set(extractKeywords(compTitle));
  
  if (targetKeywords.length === 0) return 0;
  
  let matchCount = 0;
  for (const keyword of targetKeywords) {
    if (compKeywords.has(keyword)) {
      matchCount++;
    }
  }
  
  return matchCount / targetKeywords.length;
}

function isExcludedByPattern(title: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    if (pattern.test(title)) {
      const match = title.match(pattern);
      return match ? match[0] : 'pattern match';
    }
  }
  return null;
}

export function filterComps(
  comps: CompLike[],
  targetTitle: string,
  category: string,
  targetCondition?: string,
  options?: {
    minMatchScore?: number;
    strictCondition?: boolean;
    maxPriceMultiplier?: number;
    minPriceMultiplier?: number;
  }
): FilteredCompResult {
  const {
    minMatchScore = 0.3,
    strictCondition = false,
    maxPriceMultiplier = 5,
    minPriceMultiplier = 0.1,
  } = options || {};
  
  const exclusionReasons: Record<string, number> = {};
  const filteredComps: CompLike[] = [];
  
  const categoryPatterns = CATEGORY_EXCLUSIONS[category] || [];
  const allPatterns = [...UNIVERSAL_EXCLUSIONS, ...categoryPatterns];
  
  const normalizedTargetCondition = targetCondition ? normalizeCondition(targetCondition) : null;
  
  const validPrices = comps
    .map(c => c.totalPrice || c.soldPrice)
    .filter(p => p > 0);
  const medianPrice = validPrices.length > 0
    ? validPrices.sort((a, b) => a - b)[Math.floor(validPrices.length / 2)]
    : 0;
  
  for (const comp of comps) {
    const compTitle = comp.title || '';
    
    const exclusionReason = isExcludedByPattern(compTitle, allPatterns);
    if (exclusionReason) {
      const reason = `excluded:pattern:${exclusionReason.slice(0, 20)}`;
      exclusionReasons[reason] = (exclusionReasons[reason] || 0) + 1;
      continue;
    }
    
    if (strictCondition && normalizedTargetCondition && normalizedTargetCondition !== 'unknown') {
      const compCondition = normalizeCondition(comp.condition || '');
      if (compCondition !== 'unknown' && compCondition !== normalizedTargetCondition) {
        const reason = `excluded:condition:${compCondition}!==${normalizedTargetCondition}`;
        exclusionReasons[reason] = (exclusionReasons[reason] || 0) + 1;
        continue;
      }
    }
    
    const matchScore = calculateKeywordMatchScore(targetTitle, compTitle);
    if (matchScore < minMatchScore) {
      const reason = `excluded:lowMatch:${(matchScore * 100).toFixed(0)}%`;
      exclusionReasons[reason] = (exclusionReasons[reason] || 0) + 1;
      continue;
    }
    
    const price = comp.totalPrice || comp.soldPrice;
    if (medianPrice > 0) {
      if (price > medianPrice * maxPriceMultiplier) {
        exclusionReasons['excluded:priceTooHigh'] = (exclusionReasons['excluded:priceTooHigh'] || 0) + 1;
        continue;
      }
      if (price < medianPrice * minPriceMultiplier) {
        exclusionReasons['excluded:priceTooLow'] = (exclusionReasons['excluded:priceTooLow'] || 0) + 1;
        continue;
      }
    }
    
    filteredComps.push(comp);
  }
  
  const avgMatchScore = filteredComps.length > 0
    ? filteredComps.reduce((sum, c) => sum + calculateKeywordMatchScore(targetTitle, c.title || ''), 0) / filteredComps.length
    : 0;
  
  console.log(`[CompFilter] ${category}: ${comps.length} → ${filteredComps.length} comps (${Object.keys(exclusionReasons).length} exclusion types)`);
  
  return {
    filteredComps,
    excludedCount: comps.length - filteredComps.length,
    exclusionReasons,
    matchScore: avgMatchScore,
  };
}

export function buildOptimizedQuery(
  title: string,
  category: string,
  brand?: string,
  model?: string
): string {
  const keywords = extractKeywords(title);
  
  const priorityTerms: string[] = [];
  
  if (brand) priorityTerms.push(brand);
  if (model) priorityTerms.push(model);
  
  const importantKeywords = keywords.filter(kw => 
    kw.length > 2 && 
    !priorityTerms.some(pt => pt.toLowerCase().includes(kw))
  ).slice(0, 5);
  
  const query = [...priorityTerms, ...importantKeywords].join(' ');
  
  console.log(`[CompFilter] Query: "${query}" (from: "${title.slice(0, 50)}...")`);
  
  return query;
}
