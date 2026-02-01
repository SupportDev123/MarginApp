export interface CompsLogEntry {
  timestamp: string;
  query: string;
  category: string;
  source: 'api' | 'fallback' | 'cache' | 'chrono24';
  resultsCount: number;
  success: boolean;
  error?: string;
  durationMs?: number;
  apiEndpoint?: string;
}

export function logCompsRequest(entry: Omit<CompsLogEntry, 'timestamp'>): void {
  const logEntry: CompsLogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };
  
  const prefix = entry.success 
    ? `[COMPS:${entry.source.toUpperCase()}]` 
    : `[COMPS:ERROR]`;
  
  const details = [
    `query="${entry.query}"`,
    `category="${entry.category}"`,
    `results=${entry.resultsCount}`,
    entry.durationMs ? `duration=${entry.durationMs}ms` : null,
    entry.error ? `error="${entry.error}"` : null,
  ].filter(Boolean).join(' | ');
  
  if (entry.success) {
    console.log(`${prefix} ${details}`);
  } else {
    console.error(`${prefix} ${details}`);
  }
}

export function buildEbaySearchUrl(searchQuery: string, category?: string): string {
  const encodedQuery = encodeURIComponent(searchQuery);
  
  const categoryMap: Record<string, string> = {
    'Trading Cards': '212',
    'Watches': '14324',
    'Electronics': '293',
    'Collectibles': '220',
    'Other': ''
  };
  
  const ebayCategory = category ? categoryMap[category] || '' : '';
  const categoryParam = ebayCategory ? `&_sacat=${ebayCategory}` : '';
  
  // Always use 90-day lookback for sold comps
  return `https://www.ebay.com/sch/i.html?_nkw=${encodedQuery}&LH_Sold=1&LH_Complete=1&rt=nc&_sop=13${categoryParam}`;
}
