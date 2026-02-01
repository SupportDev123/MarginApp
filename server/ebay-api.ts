/**
 * eBay API Integration Layer
 * 
 * This module provides a unified interface for pricing data with multiple sources:
 * 
 * Data Source Priority:
 * 1. PriceCharting (if category matches) - Trusted source for video games, trading cards, collectibles
 * 2. eBay Marketplace Insights - Primary transaction-based SOLD data (requires business approval)
 * 3. SerpAPI - Context/retail anchor layer (product confirmation, hype detection) - NOT primary pricing
 * 4. Browse API - Last resort with conservative category-aware discounting + explicitly lower confidence
 * 
 * Confidence Levels:
 * - 'high': PriceCharting, eBay Marketplace Insights (actual transaction data)
 * - 'medium': SerpAPI (context/retail anchor, not true sold data)
 * - 'low': Browse API (active listings with estimated discount)
 */

import { logCompsRequest } from './comps-logger';
import { fetchSoldItemsFromSerpApi } from './serpapi';
import { searchPriceCharting, isLikelyVideoGame, getMarketValue } from './pricecharting-api';
import { buildWatchCompQuery, cleanSoldComps, CleanedCompResult } from './watch-comp-processor';

// ============================================================
// EBAY API DEBUG & RETRY INFRASTRUCTURE
// ============================================================

interface EbayErrorSample {
  timestamp: string;
  endpoint: string;
  method: string;
  requestHeaders: Record<string, string>;
  responseStatus: number;
  responseBody: string;
  responseHeaders: Record<string, string>;
  correlationId?: string;
  errorType: 'finding_500' | 'oauth_500' | 'browse_500';
}

interface EbayApiStats {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  recent500Errors: { timestamp: number; endpoint: string }[];
  callsPerScan: number[];
  lastRateLimitCheck: number;
}

// Store last 10 error samples for debugging
const errorSamples: EbayErrorSample[] = [];
const MAX_ERROR_SAMPLES = 10;

// API stats tracking
const apiStats: EbayApiStats = {
  totalCalls: 0,
  successfulCalls: 0,
  failedCalls: 0,
  recent500Errors: [],
  callsPerScan: [],
  lastRateLimitCheck: 0,
};

// Track calls per scan session
let currentScanCallCount = 0;

/**
 * Log an error sample for debugging
 */
function logErrorSample(sample: EbayErrorSample): void {
  errorSamples.unshift(sample);
  if (errorSamples.length > MAX_ERROR_SAMPLES) {
    errorSamples.pop();
  }
  
  // Track 500 errors for spike detection
  if (sample.responseStatus >= 500) {
    apiStats.recent500Errors.push({ timestamp: Date.now(), endpoint: sample.endpoint });
    // Keep only last 5 minutes of 500 errors
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    apiStats.recent500Errors = apiStats.recent500Errors.filter(e => e.timestamp > fiveMinutesAgo);
    
    // Check for spike (5+ errors in 2 minutes)
    const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
    const recentCount = apiStats.recent500Errors.filter(e => e.timestamp > twoMinutesAgo).length;
    if (recentCount >= 5) {
      console.warn(`[eBay API] ⚠️ 500 ERROR SPIKE DETECTED: ${recentCount} errors in last 2 minutes`);
      console.warn(`[eBay API] ACTION: Check eBay API Status page for incidents: https://developer.ebay.com/support/api-status`);
    }
  }
  
  // Full debug log
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[eBay API] ERROR SAMPLE CAPTURED - ${sample.errorType}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Timestamp: ${sample.timestamp}`);
  console.log(`Endpoint: ${sample.endpoint}`);
  console.log(`Method: ${sample.method}`);
  console.log(`Status: ${sample.responseStatus}`);
  console.log(`Correlation ID: ${sample.correlationId || 'N/A'}`);
  console.log(`Response Headers:`, JSON.stringify(sample.responseHeaders, null, 2));
  console.log(`Response Body: ${sample.responseBody.slice(0, 500)}`);
  console.log(`${'='.repeat(60)}\n`);
}

/**
 * Extract correlation IDs from response headers
 */
function extractCorrelationId(headers: Headers): string | undefined {
  const correlationHeaders = [
    'x-ebay-c-correlation-id',
    'x-ebay-request-id', 
    'x-ebay-c-request-id',
    'x-ebay-c-tracking-id',
  ];
  
  for (const header of correlationHeaders) {
    const value = headers.get(header);
    if (value) return `${header}: ${value}`;
  }
  return undefined;
}

/**
 * Convert Headers to plain object for logging
 */
function headersToObject(headers: Headers): Record<string, string> {
  const obj: Record<string, string> = {};
  headers.forEach((value, key) => {
    // Redact sensitive headers
    if (key.toLowerCase() === 'authorization') {
      obj[key] = '[REDACTED]';
    } else {
      obj[key] = value;
    }
  });
  return obj;
}

/**
 * Retry with exponential backoff + jitter
 * Follows eBay's recommendation: retry up to 3 times for 5xx errors
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  context: { errorType: EbayErrorSample['errorType']; maxRetries?: number }
): Promise<Response> {
  const maxRetries = context.maxRetries ?? 3;
  let lastError: Error | null = null;
  let lastResponse: Response | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      apiStats.totalCalls++;
      currentScanCallCount++;
      
      const response = await fetch(url, options);
      
      // Success or 4xx client error - don't retry
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        if (response.ok) apiStats.successfulCalls++;
        else apiStats.failedCalls++;
        return response;
      }
      
      // 5xx server error - capture and maybe retry
      lastResponse = response;
      const responseBody = await response.text();
      const correlationId = extractCorrelationId(response.headers);
      
      logErrorSample({
        timestamp: new Date().toISOString(),
        endpoint: url.replace(/appid=[^&]+/, 'appid=[REDACTED]'),
        method: options.method || 'GET',
        requestHeaders: options.headers ? Object.fromEntries(
          Object.entries(options.headers as Record<string, string>).map(([k, v]) => 
            k.toLowerCase() === 'authorization' ? [k, '[REDACTED]'] : [k, v]
          )
        ) : {},
        responseStatus: response.status,
        responseBody,
        responseHeaders: headersToObject(response.headers),
        correlationId,
        errorType: context.errorType,
      });
      
      if (attempt < maxRetries) {
        // Exponential backoff with jitter: 0.5s, 1.5s, 4s (+ random 0-500ms)
        const baseDelay = Math.pow(3, attempt) * 500;
        const jitter = Math.random() * 500;
        const delay = baseDelay + jitter;
        console.log(`[eBay API] Retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms (${context.errorType})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
    } catch (error) {
      lastError = error as Error;
      apiStats.failedCalls++;
      
      if (attempt < maxRetries) {
        const baseDelay = Math.pow(3, attempt) * 500;
        const jitter = Math.random() * 500;
        const delay = baseDelay + jitter;
        console.log(`[eBay API] Network error, retry ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // All retries exhausted
  if (lastResponse) {
    return lastResponse;
  }
  throw lastError || new Error('All retries exhausted');
}

/**
 * Get error samples for debugging
 */
export function getErrorSamples(): EbayErrorSample[] {
  return [...errorSamples];
}

/**
 * Get API stats for monitoring
 */
export function getApiStats(): EbayApiStats & { errorSampleCount: number } {
  return {
    ...apiStats,
    errorSampleCount: errorSamples.length,
  };
}

/**
 * Start tracking calls for a new scan
 */
export function startScanCallTracking(): void {
  currentScanCallCount = 0;
}

/**
 * End scan and record call count
 */
export function endScanCallTracking(): number {
  const count = currentScanCallCount;
  apiStats.callsPerScan.push(count);
  // Keep last 100 scan counts
  if (apiStats.callsPerScan.length > 100) {
    apiStats.callsPerScan.shift();
  }
  currentScanCallCount = 0;
  return count;
}

/**
 * Get average calls per scan
 */
export function getAverageCallsPerScan(): number {
  if (apiStats.callsPerScan.length === 0) return 0;
  const sum = apiStats.callsPerScan.reduce((a, b) => a + b, 0);
  return Math.round(sum / apiStats.callsPerScan.length);
}

export interface SoldComp {
  soldPrice: number;
  shippingCost: string;
  dateSold: string;
  condition: string;
  totalPrice?: number; // Optional - computed when available
  title?: string;
  imageUrl?: string;
}

export interface SellerSignals {
  hasBuyItNow: boolean;
  freeShipping: boolean;
  handlingDays: number | null;
  feedbackPercent: number | null;
  feedbackCount: number | null;
}

export interface BrowseAPIResult {
  comps: SoldComp[];
  totalListings: number;
  sellerSignals: SellerSignals;
  rawPrices: number[];
}

export interface CompsDataSource {
  type: 'marketplace_insights' | 'browse_api' | 'fallback';
  available: boolean;
  message?: string;
}

export interface EbayAuthToken {
  accessToken: string;
  expiresAt: number;
  scope: string;
}

const eBayCategoryMap: Record<string, string> = {
  'Trading Cards': '212',
  'Watches': '14324',
  "Men's Watches": '31387',
  "Women's Watches": '31388',
  'Electronics': '293',
  'Shoes': '93427',
  'Household': '11700',
  'Video Games': '139973',
  'Video Game Consoles': '139971',
  'Video Game Controllers': '117042',
  'Gaming': '139973',
  'Controllers': '117042',
  'Phones': '9355',
  'Cell Phones': '9355',
  'Smartphones': '9355',
  'Tablets': '171485',
  'Laptops': '175672',
  'Computers': '58058',
  'Cameras': '625',
  'Audio': '293',
  'Headphones': '112529',
  'Speakers': '14990',
  'Collectibles': '1',
  'Toys': '220',
  'Action Figures': '246',
  'Funko Pop': '246',
  'LEGO': '19006',
  'Clothing': '11450',
  'Apparel': '11450',
  'Handbags': '169291',
  'Jewelry': '281',
  'Tools': '631',
  'Home & Garden': '159907',
  'Sporting Goods': '888',
  'Musical Instruments': '619',
  'Other': '',
};

/**
 * Auto-detect category from item title using keyword matching
 */
function detectCategoryFromTitle(title: string): string {
  const lowerTitle = title.toLowerCase();
  
  // Gaming/Controllers
  if (lowerTitle.includes('controller') && (lowerTitle.includes('xbox') || lowerTitle.includes('playstation') || lowerTitle.includes('ps5') || lowerTitle.includes('ps4') || lowerTitle.includes('nintendo') || lowerTitle.includes('switch'))) {
    return 'Video Game Controllers';
  }
  if (lowerTitle.includes('xbox') || lowerTitle.includes('playstation') || lowerTitle.includes('nintendo') || lowerTitle.includes('ps5') || lowerTitle.includes('ps4') || lowerTitle.includes('switch') || lowerTitle.includes('gaming')) {
    return 'Video Games';
  }
  
  // Phones
  if (lowerTitle.includes('iphone') || lowerTitle.includes('samsung galaxy') || lowerTitle.includes('pixel') || lowerTitle.includes('smartphone')) {
    return 'Cell Phones';
  }
  
  // Watches
  if (lowerTitle.includes('watch') && !lowerTitle.includes('apple watch')) {
    if (lowerTitle.includes('men') || lowerTitle.includes("men's")) return "Men's Watches";
    if (lowerTitle.includes('women') || lowerTitle.includes("women's")) return "Women's Watches";
    return 'Watches';
  }
  if (lowerTitle.includes('apple watch')) {
    return 'Electronics';
  }
  
  // Shoes
  if (lowerTitle.includes('shoe') || lowerTitle.includes('sneaker') || lowerTitle.includes('jordan') || lowerTitle.includes('nike') || lowerTitle.includes('yeezy') || lowerTitle.includes('dunk')) {
    return 'Shoes';
  }
  
  // Cards - all types unified as Trading Cards
  if (lowerTitle.includes('pokemon') || lowerTitle.includes('magic the gathering') || lowerTitle.includes('yugioh') || lowerTitle.includes('tcg') ||
      lowerTitle.includes('topps') || lowerTitle.includes('panini') || lowerTitle.includes('baseball card') || 
      lowerTitle.includes('football card') || lowerTitle.includes('basketball card') || lowerTitle.includes('marvel')) {
    return 'Trading Cards';
  }
  
  // Electronics
  if (lowerTitle.includes('laptop') || lowerTitle.includes('macbook')) {
    return 'Laptops';
  }
  if (lowerTitle.includes('ipad') || lowerTitle.includes('tablet')) {
    return 'Tablets';
  }
  if (lowerTitle.includes('headphone') || lowerTitle.includes('airpod') || lowerTitle.includes('earbuds')) {
    return 'Headphones';
  }
  if (lowerTitle.includes('speaker') || lowerTitle.includes('soundbar')) {
    return 'Speakers';
  }
  if (lowerTitle.includes('camera') || lowerTitle.includes('canon') || lowerTitle.includes('nikon') || lowerTitle.includes('sony')) {
    return 'Cameras';
  }
  
  // LEGO
  if (lowerTitle.includes('lego')) {
    return 'LEGO';
  }
  
  // Funko Pop - detect before general action figures
  if (lowerTitle.includes('funko') || lowerTitle.includes('pop!') || 
      (lowerTitle.includes('pop') && (lowerTitle.includes('vinyl') || lowerTitle.includes('figure') || lowerTitle.includes('#')))) {
    return 'Funko Pop';
  }
  
  // Tools
  if (lowerTitle.includes('dewalt') || lowerTitle.includes('milwaukee') || lowerTitle.includes('makita') || lowerTitle.includes('drill') || lowerTitle.includes('saw')) {
    return 'Tools';
  }
  
  return '';
}

let cachedToken: EbayAuthToken | null = null;

// Cache for Finding API sold items (tiered by category)
const findingApiCache = new Map<string, { data: SoldComp[], timestamp: number; category?: string }>();

// Tiered cache TTL for pricing data - stable categories cache longer
const PRICING_CACHE_TTL_BY_CATEGORY: Record<string, number> = {
  'watch': 24 * 60 * 60 * 1000,       // 24 hours - prices move over weeks
  'watches': 24 * 60 * 60 * 1000,
  'shoe': 24 * 60 * 60 * 1000,        // 24 hours - stable market
  'shoes': 24 * 60 * 60 * 1000,
  'vintage': 24 * 60 * 60 * 1000,     // 24 hours - slowest moving
  'antique': 24 * 60 * 60 * 1000,
  'jewelry': 24 * 60 * 60 * 1000,
  'collectible': 12 * 60 * 60 * 1000, // 12 hours
  'toy': 12 * 60 * 60 * 1000,
  'funko': 12 * 60 * 60 * 1000,
  'lego': 12 * 60 * 60 * 1000,
  'electronics': 12 * 60 * 60 * 1000, // 12 hours - spikes on new releases
  'cards': 3 * 60 * 60 * 1000,        // 3 hours - events/games spike prices
  'trading': 3 * 60 * 60 * 1000,
  'sports': 3 * 60 * 60 * 1000,
  'pokemon': 3 * 60 * 60 * 1000,
  'magic': 3 * 60 * 60 * 1000,
};
const DEFAULT_PRICING_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours default

function getPricingCacheTTL(category?: string): number {
  if (!category) return DEFAULT_PRICING_CACHE_TTL;
  const normalized = category.toLowerCase().replace(/[^a-z]/g, '');
  // Check if any key is contained in the category string
  for (const [key, ttl] of Object.entries(PRICING_CACHE_TTL_BY_CATEGORY)) {
    if (normalized.includes(key)) return ttl;
  }
  return DEFAULT_PRICING_CACHE_TTL;
}

/**
 * eBay Finding API - findCompletedItems
 * Returns SOLD items (completed listings) - FREE tier, no SerpAPI needed
 * This is the preferred method for getting sold comps
 */
export async function fetchSoldItemsFromFindingApi(
  query: string, 
  options?: { 
    categoryId?: string; 
    limit?: number;
    minPrice?: number;
    maxPrice?: number;
    itemCategory?: string; // For tiered cache TTL
  }
): Promise<{ success: boolean; comps: SoldComp[]; source: string }> {
  const appId = process.env.EBAY_CLIENT_ID;
  
  if (!appId) {
    console.log('[eBay Finding API] No EBAY_CLIENT_ID configured');
    return { success: false, comps: [], source: 'finding_api' };
  }
  
  // Check cache first (tiered by category)
  const cacheKey = `${query}_${options?.categoryId || ''}_${options?.limit || 30}`;
  const cached = findingApiCache.get(cacheKey);
  const cacheTTL = getPricingCacheTTL(cached?.category || options?.itemCategory);
  if (cached && Date.now() - cached.timestamp < cacheTTL) {
    const ttlHours = Math.round(cacheTTL / (60 * 60 * 1000));
    console.log(`[eBay Finding API] Cache hit for: "${query}" (${cached.data.length} items, TTL: ${ttlHours}h)`);
    return { success: true, comps: cached.data, source: 'finding_api_cached' };
  }
  
  try {
    const limit = options?.limit || 30;
    
    // Build Finding API URL - findCompletedItems operation
    // SoldItemsOnly=true ensures we only get sold items (not unsold)
    const params = new URLSearchParams({
      'OPERATION-NAME': 'findCompletedItems',
      'SERVICE-VERSION': '1.13.0',
      'SECURITY-APPNAME': appId,
      'RESPONSE-DATA-FORMAT': 'JSON',
      'REST-PAYLOAD': '',
      'keywords': query,
      'paginationInput.entriesPerPage': limit.toString(),
      'sortOrder': 'EndTimeSoonest',
      'itemFilter(0).name': 'SoldItemsOnly',
      'itemFilter(0).value': 'true',
    });
    
    // Add category filter if provided
    let filterIndex = 1;
    if (options?.categoryId) {
      params.append('categoryId', options.categoryId);
    }
    
    // Add price filters if provided
    if (options?.minPrice) {
      params.append(`itemFilter(${filterIndex}).name`, 'MinPrice');
      params.append(`itemFilter(${filterIndex}).value`, options.minPrice.toString());
      filterIndex++;
    }
    if (options?.maxPrice) {
      params.append(`itemFilter(${filterIndex}).name`, 'MaxPrice');
      params.append(`itemFilter(${filterIndex}).value`, options.maxPrice.toString());
    }
    
    const url = `https://svcs.ebay.com/services/search/FindingService/v1?${params.toString()}`;
    
    console.log(`[eBay Finding API] Fetching sold items: "${query}" (limit: ${limit})`);
    
    // Use retry logic for 5xx errors
    const response = await fetchWithRetry(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    }, { errorType: 'finding_500' });
    
    if (!response.ok) {
      console.log(`[eBay Finding API] Error: ${response.status} (after retries)`);
      return { success: false, comps: [], source: 'finding_api' };
    }
    
    const data = await response.json();
    
    // Parse the Finding API response
    const searchResult = data?.findCompletedItemsResponse?.[0]?.searchResult?.[0];
    const items = searchResult?.item || [];
    const totalEntries = parseInt(searchResult?.['@count'] || '0');
    
    console.log(`[eBay Finding API] Found ${totalEntries} total, processing ${items.length} items`);
    
    const comps: SoldComp[] = items
      .filter((item: any) => {
        // Only include items that actually sold (not just completed/unsold)
        const sellingStatus = item.sellingStatus?.[0];
        const sellingState = sellingStatus?.sellingState?.[0];
        return sellingState === 'EndedWithSales';
      })
      .map((item: any) => {
        const sellingStatus = item.sellingStatus?.[0];
        const currentPrice = sellingStatus?.currentPrice?.[0];
        const soldPrice = parseFloat(currentPrice?.['__value__'] || '0');
        
        const shippingInfo = item.shippingInfo?.[0];
        const shippingCost = shippingInfo?.shippingServiceCost?.[0]?.['__value__'] || '0';
        const shippingType = shippingInfo?.shippingType?.[0] || '';
        
        const condition = item.condition?.[0]?.conditionDisplayName?.[0] || 'Unknown';
        const endTime = item.listingInfo?.[0]?.endTime?.[0] || '';
        
        return {
          soldPrice,
          shippingCost: shippingType === 'FreePickup' || shippingCost === '0' ? 'Free' : `$${shippingCost}`,
          dateSold: endTime ? new Date(endTime).toLocaleDateString() : 'Unknown',
          condition,
          totalPrice: soldPrice + parseFloat(shippingCost || '0'),
          title: item.title?.[0] || '',
          imageUrl: item.galleryURL?.[0] || '',
        };
      });
    
    console.log(`[eBay Finding API] Parsed ${comps.length} sold items`);
    
    // Cache the results (with category for tiered TTL)
    if (comps.length > 0) {
      const category = options?.itemCategory;
      const ttlHours = Math.round(getPricingCacheTTL(category) / (60 * 60 * 1000));
      findingApiCache.set(cacheKey, { data: comps, timestamp: Date.now(), category });
      console.log(`[eBay Finding API] Cached ${comps.length} comps (TTL: ${ttlHours}h for ${category || 'unknown'})`);
    }
    
    return { success: comps.length > 0, comps, source: 'finding_api' };
  } catch (error) {
    console.error('[eBay Finding API] Error:', error);
    return { success: false, comps: [], source: 'finding_api' };
  }
}

/**
 * Get OAuth access token for eBay APIs
 * Uses retry logic with exponential backoff for 5xx errors
 */
export async function getAccessToken(scope: string = 'https://api.ebay.com/oauth/api_scope'): Promise<string | null> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.log('[eBay API] Credentials not configured');
    return null;
  }

  if (cachedToken && cachedToken.scope === scope && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.accessToken;
  }

  try {
    // Use retry logic for OAuth - 5xx errors are retried
    const response = await fetchWithRetry('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`,
    }, { errorType: 'oauth_500' });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[eBay API] OAuth failed: ${response.status} - ${errorText.slice(0, 100)} (after retries)`);
      return null;
    }

    const data = await response.json();
    cachedToken = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in * 1000),
      scope,
    };

    return cachedToken.accessToken;
  } catch (error) {
    console.error('[eBay API] OAuth error:', error);
    return null;
  }
}

/**
 * Check which data sources are available
 */
export async function checkDataSourceAvailability(): Promise<CompsDataSource[]> {
  const sources: CompsDataSource[] = [];

  const insightsToken = await getAccessToken('https://api.ebay.com/oauth/api_scope/buy.marketplace.insights');
  sources.push({
    type: 'marketplace_insights',
    available: !!insightsToken,
    message: insightsToken 
      ? 'Marketplace Insights API active - real sold data available'
      : 'Marketplace Insights requires eBay business approval',
  });

  const browseToken = await getAccessToken('https://api.ebay.com/oauth/api_scope');
  sources.push({
    type: 'browse_api',
    available: !!browseToken,
    message: browseToken
      ? 'Browse API active - using active listing prices'
      : 'Browse API unavailable - check credentials',
  });

  sources.push({
    type: 'fallback',
    available: true,
    message: 'Fallback always available - deep link to eBay search',
  });

  return sources;
}

/**
 * Fetch sold comps from Marketplace Insights API
 * Requires special business approval from eBay
 */
export async function fetchFromMarketplaceInsights(
  searchQuery: string,
  category: string,
  options?: { limit?: number; conditionMatch?: boolean }
): Promise<SoldComp[] | null> {
  const startTime = Date.now();
  const limit = options?.limit || 10;

  const accessToken = await getAccessToken('https://api.ebay.com/oauth/api_scope/buy.marketplace.insights');
  
  if (!accessToken) {
    logCompsRequest({
      query: searchQuery,
      category,
      source: 'api',
      resultsCount: 0,
      success: false,
      error: 'Marketplace Insights access not approved',
      durationMs: Date.now() - startTime,
      apiEndpoint: 'marketplace_insights/search',
    });
    return null;
  }

  try {
    const categoryId = eBayCategoryMap[category] || '';
    const categoryParam = categoryId ? `&category_ids=${categoryId}` : '';
    // Always use 90-day lookback filter for accurate comps
    const dateFilter = '&filter=lastSoldDate:[' + new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] + ']';
    
    const apiUrl = `https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search?q=${encodeURIComponent(searchQuery)}${categoryParam}${dateFilter}&limit=${limit}`;

    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logCompsRequest({
        query: searchQuery,
        category,
        source: 'api',
        resultsCount: 0,
        success: false,
        error: `Marketplace Insights: ${response.status} - ${errorText.slice(0, 100)}`,
        durationMs: Date.now() - startTime,
        apiEndpoint: 'marketplace_insights/search',
      });
      return null;
    }

    const data = await response.json();
    const itemSales = data.itemSales || [];

    const comps: SoldComp[] = itemSales.map((item: any) => {
      const soldPrice = parseFloat(item.lastSoldPrice?.value || '0');
      let shippingCost = 'Unknown';
      if (item.shippingCost) {
        const shipValue = parseFloat(item.shippingCost.value || '0');
        shippingCost = shipValue === 0 ? 'Free' : `$${shipValue.toFixed(2)}`;
      }

      const totalPrice = soldPrice + (shippingCost === 'Free' ? 0 : parseFloat(shippingCost.replace('$', '') || '0'));

      return {
        soldPrice,
        shippingCost,
        dateSold: item.lastSoldDate || 'Recently',
        condition: item.condition || 'Not specified',
        totalPrice,
        title: item.title,
        imageUrl: item.image?.imageUrl,
      };
    });

    logCompsRequest({
      query: searchQuery,
      category,
      source: 'api',
      resultsCount: comps.length,
      success: true,
      durationMs: Date.now() - startTime,
      apiEndpoint: 'marketplace_insights/search',
    });

    return comps;
  } catch (error) {
    const err = error as Error;
    logCompsRequest({
      query: searchQuery,
      category,
      source: 'api',
      resultsCount: 0,
      success: false,
      error: err.message,
      durationMs: Date.now() - startTime,
      apiEndpoint: 'marketplace_insights/search',
    });
    return null;
  }
}

/**
 * Fetch active listings from Browse API and derive price estimates
 * Used as fallback when Marketplace Insights is not available
 */
export async function fetchFromBrowseAPI(
  searchQuery: string,
  category: string,
  options?: { limit?: number; conditionMatch?: string }
): Promise<SoldComp[] | null> {
  const startTime = Date.now();
  const limit = options?.limit || 20;

  const accessToken = await getAccessToken('https://api.ebay.com/oauth/api_scope');

  if (!accessToken) {
    logCompsRequest({
      query: searchQuery,
      category,
      source: 'api',
      resultsCount: 0,
      success: false,
      error: 'Browse API credentials not configured',
      durationMs: Date.now() - startTime,
      apiEndpoint: 'browse/search',
    });
    return null;
  }

  try {
    const categoryId = eBayCategoryMap[category] || '';
    const categoryParam = categoryId ? `&category_ids=${categoryId}` : '';
    
    let filterParams = '&filter=buyingOptions:{FIXED_PRICE}';
    if (options?.conditionMatch) {
      const conditionMap: Record<string, string> = {
        'New': 'NEW',
        'Like New': 'LIKE_NEW',
        'Very Good': 'VERY_GOOD',
        'Good': 'GOOD',
        'Acceptable': 'ACCEPTABLE',
        'Used': 'USED',
        'For parts or not working': 'FOR_PARTS_OR_NOT_WORKING',
      };
      const conditionId = conditionMap[options.conditionMatch];
      if (conditionId) {
        filterParams += `,conditions:{${conditionId}}`;
      }
    }

    const apiUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(searchQuery)}${categoryParam}${filterParams}&sort=price&limit=${limit}`;

    // Use retry logic for Browse API 5xx errors
    const response = await fetchWithRetry(apiUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'Accept': 'application/json',
      },
    }, { errorType: 'browse_500' });

    if (!response.ok) {
      const errorText = await response.text();
      logCompsRequest({
        query: searchQuery,
        category,
        source: 'api',
        resultsCount: 0,
        success: false,
        error: `Browse API: ${response.status} - ${errorText.slice(0, 100)} (after retries)`,
        durationMs: Date.now() - startTime,
        apiEndpoint: 'browse/search',
      });
      return null;
    }

    const data = await response.json();
    const items = data.itemSummaries || [];

    const comps: SoldComp[] = items.map((item: any) => {
      const listPrice = parseFloat(item.price?.value || '0');
      let shippingCost = 'Unknown';
      if (item.shippingOptions && item.shippingOptions.length > 0) {
        const shipValue = parseFloat(item.shippingOptions[0].shippingCost?.value || '0');
        shippingCost = shipValue === 0 ? 'Free' : `$${shipValue.toFixed(2)}`;
      }

      const totalPrice = listPrice + (shippingCost === 'Free' ? 0 : parseFloat(shippingCost.replace('$', '') || '0'));

      return {
        soldPrice: listPrice,
        shippingCost,
        dateSold: 'Active listing',
        condition: item.condition || 'Not specified',
        totalPrice,
        title: item.title,
        imageUrl: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl,
      };
    });

    logCompsRequest({
      query: searchQuery,
      category,
      source: 'api',
      resultsCount: comps.length,
      success: true,
      durationMs: Date.now() - startTime,
      apiEndpoint: 'browse/search',
    });

    return comps;
  } catch (error) {
    const err = error as Error;
    logCompsRequest({
      query: searchQuery,
      category,
      source: 'api',
      resultsCount: 0,
      success: false,
      error: err.message,
      durationMs: Date.now() - startTime,
      apiEndpoint: 'browse/search',
    });
    return null;
  }
}

/**
 * Unified comps fetcher with automatic fallback
 * 
 * Priority:
 * 1. Marketplace Insights (if approved) - Real sold data (90-day lookback)
 * 2. Browse API - Active listing estimates (adjusted down ~10-15%)
 * 3. null - Caller should use fallback deep link
 */
/**
 * Normalize a title for comparison - removes special chars, normalizes spaces
 * Also normalizes common product codes and variants
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    // Normalize Xbox Series X|S variants
    .replace(/x\|s/gi, 'x s')
    .replace(/x\/s/gi, 'x s')
    .replace(/series\s*x\s*s/gi, 'series x s')
    .replace(/series\s*xs/gi, 'series x s')
    // Normalize Elite Series 2 variants
    .replace(/series\s*2/gi, 'series2')
    .replace(/elite\s*2/gi, 'elite2')
    .replace(/elite\s*series\s*2/gi, 'elite series2')
    // Remove special characters
    .replace(/[|\\\/\-_,.:;!?'"()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if a title matches Xbox standard controller pattern
 * Flexible matching: needs (xbox OR series x) AND (controller OR wireless OR gamepad), without premium indicators
 */
function isXboxStandardController(normalized: string): boolean {
  const hasXbox = normalized.includes('xbox') || 
                  normalized.includes('series x') || 
                  normalized.includes('series s');
  // Accept controller, wireless, or gamepad as the product type indicator
  const hasControllerType = normalized.includes('controller') || 
                            normalized.includes('wireless') || 
                            normalized.includes('gamepad');
  
  // Premium indicators that disqualify as "standard"
  // Includes "core" when paired with elite indicators
  const premiumIndicators = ['elite', 'series2', 'victrix', 'bfg', 'scuf', 'razer', 'pdp', 'pro controller'];
  const hasPremium = premiumIndicators.some(p => normalized.includes(p));
  
  // "core" is premium when it appears with elite context
  const hasEliteCore = normalized.includes('core') && (normalized.includes('elite') || normalized.includes('series2'));
  
  return hasXbox && hasControllerType && !hasPremium && !hasEliteCore;
}

/**
 * Check if a title matches Xbox Elite controller pattern
 * Only matches when "elite" context is clearly present
 */
function isXboxEliteController(normalized: string): boolean {
  const hasXbox = normalized.includes('xbox') || normalized.includes('microsoft');
  // Must have explicit "elite" marker - series2/elite2 imply elite
  const hasElite = normalized.includes('elite') || 
                   normalized.includes('series2') || 
                   normalized.includes('elite2');
  // "core" is elite only when paired with "elite" - "Elite Core" is premium
  // But "Xbox Core Controller" without "elite" is standard (different product line)
  return hasXbox && hasElite;
}

/**
 * Check if a title matches PlayStation standard controller pattern
 */
function isPSStandardController(normalized: string): boolean {
  const hasPS = normalized.includes('dualsense') || 
                (normalized.includes('ps5') && normalized.includes('controller')) ||
                (normalized.includes('playstation') && normalized.includes('controller'));
  const premiumIndicators = ['edge', 'scuf', 'razer', 'pro'];
  const hasPremium = premiumIndicators.some(p => normalized.includes(p));
  
  return hasPS && !hasPremium;
}

/**
 * Check if a title matches PlayStation Edge controller pattern
 */
function isPSEdgeController(normalized: string): boolean {
  return normalized.includes('dualsense') && normalized.includes('edge');
}

/**
 * Check if a title matches third-party premium controller pattern (Victrix, Scuf, etc.)
 */
function isThirdPartyPremiumController(normalized: string): boolean {
  const premiumBrands = ['victrix', 'bfg', 'scuf', 'razer', 'pdp'];
  return premiumBrands.some(b => normalized.includes(b));
}

/**
 * Extract key product identifiers (brand + model) from title
 */
function extractKeyTokens(title: string): string[] {
  const normalized = normalizeTitle(title);
  const stopwords = new Set(['the', 'and', 'for', 'with', 'new', 'used', 'like', 'very', 'good', 'great', 'excellent', 'condition', 'free', 'shipping', 'oem', 'authentic', 'genuine', 'original', 'brand', 'sealed', 'box', 'in', 'on', 'at', 'to', 'of', 'a', 'an']);
  
  return normalized
    .split(' ')
    .filter(t => t.length > 1 && !stopwords.has(t));
}

/**
 * Calculate relevance score between query and comp title
 * Returns score 0-1 where 1 is perfect match
 */
function calculateRelevanceScore(queryTokens: string[], compTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  
  let matchScore = 0;
  for (const qt of queryTokens) {
    // Exact match gets full point
    if (compTokens.includes(qt)) {
      matchScore += 1;
    } 
    // Partial match (contained) gets half point
    else if (compTokens.some(ct => ct.includes(qt) || qt.includes(ct))) {
      matchScore += 0.5;
    }
  }
  
  return matchScore / queryTokens.length;
}

/**
 * Controller family types for precise matching
 */
type ControllerFamily = 'xboxStandard' | 'xboxElite' | 'psStandard' | 'psEdge' | 'thirdPartyPremium' | 'nintendo' | 'generic';

/**
 * Family compatibility map - defines which families are compatible with each other
 * Used for soft matching when strict equality would over-filter
 */
const FAMILY_COMPATIBILITY: Record<ControllerFamily, ControllerFamily[]> = {
  xboxStandard: ['xboxStandard', 'generic'],
  xboxElite: ['xboxElite'],
  psStandard: ['psStandard', 'generic'],
  psEdge: ['psEdge'],
  thirdPartyPremium: ['thirdPartyPremium'],
  nintendo: ['nintendo', 'generic'],
  generic: ['generic'],
};

/**
 * Check if two controller families are compatible
 */
function areFamiliesCompatible(queryFamily: ControllerFamily, compFamily: ControllerFamily | null): boolean {
  if (!compFamily) return false;
  const compatible = FAMILY_COMPATIBILITY[queryFamily] || [];
  return compatible.includes(compFamily);
}

/**
 * Detect controller family from title using flexible matching functions
 */
function detectControllerFamily(title: string): ControllerFamily | null {
  const normalized = normalizeTitle(title);
  
  // Check in order of specificity (most specific first)
  if (isPSEdgeController(normalized)) return 'psEdge';
  if (isXboxEliteController(normalized)) return 'xboxElite';
  if (isThirdPartyPremiumController(normalized)) return 'thirdPartyPremium';
  if (isPSStandardController(normalized)) return 'psStandard';
  if (isXboxStandardController(normalized)) return 'xboxStandard';
  
  // Nintendo controllers
  if (normalized.includes('nintendo') || normalized.includes('switch') || normalized.includes('joy-con')) {
    return 'nintendo';
  }
  
  // Generic controller (has controller but no known brand)
  if (normalized.includes('controller')) {
    return 'generic';
  }
  
  return null;
}

/**
 * Filter comps to remove irrelevant results based on title similarity
 * Uses product family matching for controllers and relevance scoring for others
 */
function filterRelevantComps(comps: SoldComp[], searchQuery: string, itemTitle?: string): SoldComp[] {
  const title = itemTitle || searchQuery;
  const normalizedTitle = normalizeTitle(title);
  const queryTokens = extractKeyTokens(title);
  
  // Detect if this is a controller search - broad detection including wireless/gamepad
  const isController = normalizedTitle.includes('controller') || 
                       normalizedTitle.includes('dualsense') || 
                       normalizedTitle.includes('joy-con') ||
                       normalizedTitle.includes('joycon') ||
                       normalizedTitle.includes('gamepad') ||
                       // Xbox wireless without "controller" is still a controller
                       (normalizedTitle.includes('xbox') && normalizedTitle.includes('wireless')) ||
                       // PlayStation wireless pad
                       (normalizedTitle.includes('playstation') && normalizedTitle.includes('wireless'));
  const queryFamily = isController ? detectControllerFamily(title) : null;
  
  console.log(`[eBay API] Filtering comps - Title: "${title.slice(0, 50)}..." isController: ${isController}, family: ${queryFamily}`);
  
  const scoredComps = comps.map(comp => {
    const compTitle = comp.title || '';
    const compTokens = extractKeyTokens(compTitle);
    const relevanceScore = calculateRelevanceScore(queryTokens, compTokens);
    
    // For controllers, check family compatibility (not strict equality)
    let familyCompatible = true;
    let compFamily: ControllerFamily | null = null;
    if (isController && queryFamily) {
      compFamily = detectControllerFamily(compTitle);
      familyCompatible = areFamiliesCompatible(queryFamily, compFamily);
    }
    
    return { comp, relevanceScore, familyCompatible, compFamily };
  });
  
  // Filter based on relevance and family compatibility
  const filtered = scoredComps.filter(({ relevanceScore, familyCompatible }) => {
    // Must be compatible family for controllers (allows generic matches)
    if (isController && !familyCompatible) {
      return false;
    }
    
    // Require minimum relevance score (25% for compatible controllers, 35% otherwise)
    const minScore = isController && familyCompatible ? 0.25 : 0.35;
    return relevanceScore >= minScore;
  });
  
  // If filtering removed too many, fall back to top matches by score
  if (filtered.length < 3 && scoredComps.length >= 3) {
    const sorted = [...scoredComps].sort((a, b) => b.relevanceScore - a.relevanceScore);
    return sorted.slice(0, Math.min(5, sorted.length)).map(s => s.comp);
  }
  
  return filtered.map(f => f.comp);
}

export async function fetchCompsWithFallback(
  searchQuery: string,
  category: string,
  options?: { 
    limit?: number; 
    conditionMatch?: string;
    preferBrowse?: boolean;
    itemTitle?: string;
  }
): Promise<{ comps: SoldComp[]; source: DataSourceType; confidence: ConfidenceLevel; cleanedResult?: CleanedCompResult } | null> {
  
  // Auto-detect category from search query or item title if not provided
  let effectiveCategory = category;
  if (!effectiveCategory || effectiveCategory === 'Other' || !eBayCategoryMap[effectiveCategory]) {
    const detectedCategory = detectCategoryFromTitle(options?.itemTitle || searchQuery);
    if (detectedCategory) {
      effectiveCategory = detectedCategory;
      console.log(`[eBay API] Auto-detected category: ${effectiveCategory} from title`);
    }
  }
  
  // Priority 1: Try PriceCharting for video games, trading cards, collectibles
  // Exclude gaming accessories (controllers, headsets, etc.) - PriceCharting often returns wrong products for these
  const itemText = (options?.itemTitle || searchQuery).toLowerCase();
  const isGamingAccessory = /\b(controller|headset|headphones|charging|dock|stand|cable|adapter|skin|case|grip|thumbstick|joystick|gamepad|remote)\b/i.test(itemText);
  
  // Sports Cards should NEVER use PriceCharting - it only has video games, not vintage baseball/football/basketball cards
  // PriceCharting returns garbage like "Tom and Jerry comics" for "1968 Topps Nolan Ryan"
  const isSportsCard = effectiveCategory === 'Trading Cards' || 
    /\b(topps|panini|bowman|fleer|donruss|upper deck|prizm|select|optic|mosaic|score|stadium club)\b/i.test(itemText);
  
  // PriceCharting only for TCG/video games, not sports cards
  const isPokemonOrTCG = /\b(pokemon|magic the gathering|yugioh|mtg)\b/i.test(itemText);
  
  const isPriceChartingCategory = 
    !isGamingAccessory && 
    !isSportsCard && // Skip PriceCharting for sports cards - use Finding API instead
    (
      isPokemonOrTCG ||
      isLikelyVideoGame(options?.itemTitle || searchQuery)
    );
  
  if (isPriceChartingCategory && process.env.PRICECHARTING_API_KEY) {
    console.log(`[eBay API] Trying PriceCharting for category: ${effectiveCategory}`);
    const pcResult = await searchPriceCharting(searchQuery);
    
    if (pcResult.success && (pcResult.prices.loose || pcResult.prices.cib || pcResult.prices.new)) {
      console.log(`[eBay API] PriceCharting found: ${pcResult.productName}`);
      
      // Convert PriceCharting prices to SoldComp format
      const comps: SoldComp[] = [];
      
      if (pcResult.prices.loose) {
        comps.push({
          soldPrice: pcResult.prices.loose,
          shippingCost: 'Free',
          dateSold: 'PriceCharting (loose)',
          condition: 'Used',
          totalPrice: pcResult.prices.loose,
          title: `${pcResult.productName} (Loose)`,
        });
      }
      if (pcResult.prices.cib) {
        comps.push({
          soldPrice: pcResult.prices.cib,
          shippingCost: 'Free',
          dateSold: 'PriceCharting (CIB)',
          condition: 'Used - Complete',
          totalPrice: pcResult.prices.cib,
          title: `${pcResult.productName} (Complete in Box)`,
        });
      }
      if (pcResult.prices.new) {
        comps.push({
          soldPrice: pcResult.prices.new,
          shippingCost: 'Free',
          dateSold: 'PriceCharting (new/sealed)',
          condition: 'New',
          totalPrice: pcResult.prices.new,
          title: `${pcResult.productName} (Sealed)`,
        });
      }
      if (pcResult.prices.graded) {
        comps.push({
          soldPrice: pcResult.prices.graded,
          shippingCost: 'Free',
          dateSold: 'PriceCharting (graded)',
          condition: 'Graded',
          totalPrice: pcResult.prices.graded,
          title: `${pcResult.productName} (Graded)`,
        });
      }
      
      if (comps.length > 0) {
        return { comps, source: 'pricecharting', confidence: 'high' };
      }
    }
  }
  
  // Priority 2: eBay Finding API for SOLD items (FREE - no SerpAPI cost)
  const isWatchCategory = effectiveCategory === 'Watches' || 
    effectiveCategory === "Men's Watches" || 
    effectiveCategory === "Women's Watches";
  
  // For watches, build tighter query with brand + family + model/movement
  let effectiveQuery = searchQuery;
  if (isWatchCategory && options?.itemTitle) {
    const watchQuery = buildWatchCompQuery(options.itemTitle);
    if (watchQuery.query.length > 5) {
      effectiveQuery = watchQuery.query;
      console.log(`[eBay API] Using tight watch query: "${effectiveQuery}" (identifiers: ${JSON.stringify(watchQuery.identifiers)})`);
    }
  }
  
  // Try eBay Finding API first (FREE)
  const categoryId = eBayCategoryMap[effectiveCategory];
  console.log(`[eBay API] Trying Finding API for sold items: "${effectiveQuery}" (category: ${effectiveCategory})`);
  const findingResult = await fetchSoldItemsFromFindingApi(effectiveQuery, {
    categoryId,
    limit: options?.limit || 30,
  });
  
  if (findingResult.success && findingResult.comps.length > 0) {
    console.log(`[eBay API] Finding API returned ${findingResult.comps.length} sold items`);
    
    // For watches, use advanced cleaning
    if (isWatchCategory) {
      // Filter to only comps with valid totalPrice for cleanSoldComps
      const compsWithPrice = findingResult.comps
        .filter(c => c.totalPrice !== undefined && c.totalPrice > 0)
        .map(c => ({ ...c, totalPrice: c.totalPrice as number }));
      const cleanedResult = cleanSoldComps(compsWithPrice, effectiveQuery);
      console.log(`[eBay API] Watch comp cleaning: ${findingResult.comps.length} -> ${cleanedResult.compCount} clean comps`);
      
      if (cleanedResult.success && cleanedResult.compCount >= 3) {
        return { 
          comps: cleanedResult.comps, 
          source: 'finding_api', 
          confidence: cleanedResult.compCount >= 8 ? 'high' : 'medium',
          cleanedResult
        };
      }
    } else {
      // Non-watch: use standard filtering
      const filteredComps = filterRelevantComps(findingResult.comps, effectiveQuery, options?.itemTitle);
      if (filteredComps.length > 0) {
        return { comps: filteredComps, source: 'finding_api', confidence: 'medium' };
      }
    }
  }
  
  // Priority 3: SerpAPI fallback (if Finding API fails or returns insufficient results)
  if (process.env.SERPAPI_KEY) {
    console.log(`[eBay API] Falling back to SerpAPI for: "${effectiveQuery}"`);
    const serpApiResult = await fetchSoldItemsFromSerpApi(effectiveQuery, {
      limit: options?.limit || 30,
    });
    
    if (serpApiResult.success && serpApiResult.comps.length > 0) {
      console.log(`[eBay API] SerpAPI returned ${serpApiResult.comps.length} raw sold items`);
      
      // For watches, use advanced cleaning (remove parts/repair/bundles, use median, trim outliers)
      if (isWatchCategory) {
        // Filter to only comps with valid totalPrice for cleanSoldComps
        const serpCompsWithPrice = serpApiResult.comps
          .filter(c => c.totalPrice !== undefined && c.totalPrice > 0)
          .map(c => ({ ...c, totalPrice: c.totalPrice as number }));
        const cleanedResult = cleanSoldComps(serpCompsWithPrice, effectiveQuery);
        console.log(`[eBay API] Watch comp cleaning: ${serpApiResult.comps.length} -> ${cleanedResult.compCount} clean comps, confidence: ${cleanedResult.confidence}`);
        
        if (cleanedResult.success && cleanedResult.compCount >= 8) {
          // HIGH confidence only with ≥8 clean comps
          return { 
            comps: cleanedResult.comps, 
            source: 'serpapi', 
            confidence: 'high',
            cleanedResult // Include cleaned stats for decision engine
          };
        } else if (cleanedResult.success && cleanedResult.compCount > 0) {
          // Low confidence with <8 comps
          console.log(`[eBay API] Low comp confidence: ${cleanedResult.compCount}/8 required comps`);
          return { 
            comps: cleanedResult.comps, 
            source: 'serpapi', 
            confidence: 'low',
            cleanedResult
          };
        }
      } else {
        // Non-watch: use standard filtering
        const filteredComps = filterRelevantComps(serpApiResult.comps, effectiveQuery, options?.itemTitle);
        if (filteredComps.length > 0) {
          return { comps: filteredComps, source: 'serpapi', confidence: 'medium' };
        }
      }
    }
  }

  // REMOVED: Browse API fallback
  // Browse API returns ACTIVE listings, not sold items.
  // Estimating sold prices from active listings is inaccurate and misleading.
  // If we can't get real sold data, return null to trigger Research Mode.
  
  console.log(`[Comps] No real sold data found for "${searchQuery}" - will require Research Mode`);
  return null;
}

/**
 * Condition bucket classification for new vs used pricing
 */
export interface ConditionBucketStats {
  comps: SoldComp[];
  count: number;
  medianPrice: number | null;
  lowPrice: number | null;
  highPrice: number | null;
}

export type DataSourceType = 'pricecharting' | 'marketplace_insights' | 'browse' | 'fallback' | 'serpapi' | 'finding_api' | 'api' | 'none';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ConditionSeparatedComps {
  newLike: ConditionBucketStats;
  used: ConditionBucketStats;
  all: ConditionBucketStats;
  source: DataSourceType;
  confidence: ConfidenceLevel;
}

/**
 * Classify a condition string into "new-like" or "used" bucket
 * eBay condition types:
 * - New (1000): Brand new, never opened
 * - New other (1500): New without tags, open box
 * - New with defects (1750): New with minor defects
 * - Certified Refurbished (2000): Manufacturer refurbished
 * - Seller Refurbished (2500): Seller refurbished
 * - Used (3000): Pre-owned
 * - For parts or not working (7000)
 */
function classifyCondition(condition: string): 'newLike' | 'used' {
  const lowerCondition = condition.toLowerCase();
  
  // New-like conditions
  if (
    lowerCondition.includes('new') ||
    lowerCondition.includes('sealed') ||
    lowerCondition.includes('unopened') ||
    lowerCondition.includes('refurbished') ||
    lowerCondition.includes('certified') ||
    lowerCondition === 'brand new'
  ) {
    return 'newLike';
  }
  
  // Everything else is "used"
  return 'used';
}

/**
 * Compute stats for a set of comps
 */
function computeBucketStats(comps: SoldComp[]): ConditionBucketStats {
  if (comps.length === 0) {
    return { comps, count: 0, medianPrice: null, lowPrice: null, highPrice: null };
  }
  
  const prices = comps.map(c => c.totalPrice).filter((p): p is number => p !== undefined && p > 0).sort((a, b) => a - b);
  
  if (prices.length === 0) {
    return { comps, count: 0, medianPrice: null, lowPrice: null, highPrice: null };
  }
  
  const mid = Math.floor(prices.length / 2);
  const medianPrice = prices.length % 2 === 0 
    ? (prices[mid - 1] + prices[mid]) / 2 
    : prices[mid];
  
  return {
    comps,
    count: prices.length,
    medianPrice: Math.round(medianPrice * 100) / 100,
    lowPrice: Math.round(prices[0] * 100) / 100,
    highPrice: Math.round(prices[prices.length - 1] * 100) / 100,
  };
}

/**
 * Fetch comps and separate them into new-like vs used buckets
 * Returns stats for each bucket to support condition-aware pricing
 */
export async function fetchCompsByCondition(
  searchQuery: string,
  category: string,
  options?: { 
    limit?: number; 
    itemTitle?: string;
    preferBrowse?: boolean;
  }
): Promise<ConditionSeparatedComps | null> {
  // Fetch more comps to ensure we have enough for both buckets
  const fetchLimit = Math.max((options?.limit || 10) * 3, 30);
  
  const result = await fetchCompsWithFallback(searchQuery, category, {
    ...options,
    limit: fetchLimit,
  });
  
  if (!result || result.comps.length === 0) {
    return null;
  }
  
  // Separate comps by condition
  const newLikeComps: SoldComp[] = [];
  const usedComps: SoldComp[] = [];
  
  for (const comp of result.comps) {
    const bucket = classifyCondition(comp.condition);
    if (bucket === 'newLike') {
      newLikeComps.push(comp);
    } else {
      usedComps.push(comp);
    }
  }
  
  // For watches with cleanedResult, use the pre-computed cleaned median instead of recalculating
  // This ensures parts/repair/bundles are excluded and outliers are trimmed
  let allStats: ConditionBucketStats;
  if (result.cleanedResult && result.cleanedResult.success) {
    allStats = {
      comps: result.comps,
      count: result.cleanedResult.compCount,
      medianPrice: result.cleanedResult.medianPrice,
      lowPrice: result.cleanedResult.lowPrice,
      highPrice: result.cleanedResult.highPrice,
    };
    console.log(`[eBay API] Using cleaned median for watches: $${result.cleanedResult.medianPrice} (${result.cleanedResult.compCount} clean comps)`);
  } else {
    allStats = computeBucketStats(result.comps);
  }
  
  return {
    newLike: computeBucketStats(newLikeComps),
    used: computeBucketStats(usedComps),
    all: allStats,
    source: result.source,
    confidence: result.confidence,
  };
}

/**
 * Get eBay deep link for manual search
 * Always uses 90-day lookback for sold items
 */
export function buildEbaySearchUrl(searchQuery: string, category?: string, soldOnly: boolean = true): string {
  const encodedQuery = encodeURIComponent(searchQuery);
  const categoryId = category ? (eBayCategoryMap[category] || '') : '';
  const categoryParam = categoryId ? `&_sacat=${categoryId}` : '';
  const soldParams = soldOnly ? '&LH_Sold=1&LH_Complete=1' : '';
  // Add 90-day filter: _fspt=1 enables date filter, rt=nc for completed items
  const dateFilter = soldOnly ? '&rt=nc' : '';

  return `https://www.ebay.com/sch/i.html?_nkw=${encodedQuery}${soldParams}${dateFilter}&_sop=13${categoryParam}`;
}

/**
 * Fetch active listings with seller signals for Phase-1 decision engine
 * Returns comprehensive data for weighted scoring
 */
export async function fetchBrowseAPIWithSignals(
  searchQuery: string,
  category: string,
  options?: { limit?: number; conditionMatch?: string }
): Promise<BrowseAPIResult | null> {
  const startTime = Date.now();
  const limit = options?.limit || 30;

  const accessToken = await getAccessToken('https://api.ebay.com/oauth/api_scope');

  if (!accessToken) {
    logCompsRequest({
      query: searchQuery,
      category,
      source: 'api',
      resultsCount: 0,
      success: false,
      error: 'Browse API credentials not configured',
      durationMs: Date.now() - startTime,
      apiEndpoint: 'browse/search_signals',
    });
    return null;
  }

  try {
    const categoryId = eBayCategoryMap[category] || '';
    const categoryParam = categoryId ? `&category_ids=${categoryId}` : '';
    
    let filterParams = '&filter=buyingOptions:{FIXED_PRICE|AUCTION}';
    if (options?.conditionMatch) {
      const conditionMap: Record<string, string> = {
        'New': 'NEW',
        'Like New': 'LIKE_NEW',
        'Very Good': 'VERY_GOOD',
        'Good': 'GOOD',
        'Acceptable': 'ACCEPTABLE',
        'Used': 'USED',
        'For parts or not working': 'FOR_PARTS_OR_NOT_WORKING',
      };
      const conditionId = conditionMap[options.conditionMatch];
      if (conditionId) {
        filterParams += `,conditions:{${conditionId}}`;
      }
    }

    const apiUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(searchQuery)}${categoryParam}${filterParams}&sort=price&limit=${limit}`;

    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logCompsRequest({
        query: searchQuery,
        category,
        source: 'api',
        resultsCount: 0,
        success: false,
        error: `Browse API signals: ${response.status} - ${errorText.slice(0, 100)}`,
        durationMs: Date.now() - startTime,
        apiEndpoint: 'browse/search_signals',
      });
      return null;
    }

    const data = await response.json();
    const items = data.itemSummaries || [];
    const totalListings = data.total || items.length;

    let hasBuyItNow = false;
    let freeShippingCount = 0;
    let handlingDays: number | null = null;
    let feedbackPercent: number | null = null;
    let feedbackCount: number | null = null;
    const rawPrices: number[] = [];

    const comps: SoldComp[] = items.map((item: any) => {
      const listPrice = parseFloat(item.price?.value || '0');
      rawPrices.push(listPrice);
      
      let shippingCost = 'Unknown';
      if (item.shippingOptions && item.shippingOptions.length > 0) {
        const shipOption = item.shippingOptions[0];
        const shipValue = parseFloat(shipOption.shippingCost?.value || '0');
        shippingCost = shipValue === 0 ? 'Free' : `$${shipValue.toFixed(2)}`;
        
        if (shipValue === 0) freeShippingCount++;
        
        if (shipOption.maxEstimatedDeliveryDate && handlingDays === null) {
          try {
            const deliveryDate = new Date(shipOption.maxEstimatedDeliveryDate);
            const now = new Date();
            const diffDays = Math.ceil((deliveryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            handlingDays = Math.max(1, diffDays - 3);
          } catch {}
        }
      }

      if (item.buyingOptions?.includes('FIXED_PRICE')) {
        hasBuyItNow = true;
      }

      if (item.seller) {
        if (feedbackPercent === null && item.seller.feedbackPercentage) {
          feedbackPercent = parseFloat(item.seller.feedbackPercentage);
        }
        if (feedbackCount === null && item.seller.feedbackScore) {
          feedbackCount = parseInt(item.seller.feedbackScore, 10);
        }
      }

      const totalPrice = listPrice + (shippingCost === 'Free' ? 0 : parseFloat(shippingCost.replace('$', '') || '0'));

      return {
        soldPrice: listPrice,
        shippingCost,
        dateSold: 'Active listing',
        condition: item.condition || 'Not specified',
        totalPrice,
        title: item.title,
        imageUrl: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl,
      };
    });

    const sellerSignals: SellerSignals = {
      hasBuyItNow,
      freeShipping: freeShippingCount > items.length * 0.3,
      handlingDays,
      feedbackPercent,
      feedbackCount,
    };

    logCompsRequest({
      query: searchQuery,
      category,
      source: 'api',
      resultsCount: comps.length,
      success: true,
      durationMs: Date.now() - startTime,
      apiEndpoint: 'browse/search_signals',
    });

    return {
      comps,
      totalListings,
      sellerSignals,
      rawPrices,
    };
  } catch (error) {
    const err = error as Error;
    logCompsRequest({
      query: searchQuery,
      category,
      source: 'api',
      resultsCount: 0,
      success: false,
      error: err.message,
      durationMs: Date.now() - startTime,
      apiEndpoint: 'browse/search_signals',
    });
    return null;
  }
}

/**
 * Item details returned from Browse API getItem endpoint
 */
export interface EbayItemDetails {
  title: string;
  price: string;
  condition: string;
  shipping: string;
  imageUrl?: string;
  itemId: string;
  categoryId?: string;
}

/**
 * Fetch single item details by item ID using Browse API
 * This is the official, non-scraping way to get item information
 */
export async function fetchItemById(itemId: string): Promise<EbayItemDetails | null> {
  const accessToken = await getAccessToken('https://api.ebay.com/oauth/api_scope');

  if (!accessToken) {
    console.log('[eBay API] Cannot fetch item - no access token');
    return null;
  }

  try {
    // eBay Browse API uses legacy item IDs with a 'v1|' prefix format
    // For numeric IDs, we need to use the search endpoint instead
    const apiUrl = `https://api.ebay.com/buy/browse/v1/item/v1|${itemId}|0`;

    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country=US,zip=10001',
        'Accept': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      return parseItemResponse(data, itemId);
    }

    // If v1 format fails, try searching by item ID (legacy/EPID lookup)
    console.log(`[eBay API] Direct item lookup failed (${response.status}), trying search fallback`);
    return await fetchItemBySearch(itemId, accessToken);
  } catch (error) {
    console.error('[eBay API] Item fetch error:', error);
    return null;
  }
}

/**
 * Fallback: Search for item by ID when direct lookup fails
 */
async function fetchItemBySearch(itemId: string, accessToken: string): Promise<EbayItemDetails | null> {
  try {
    // Search using the item ID as a query - eBay often returns the item
    const searchUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${itemId}&limit=5`;

    const response = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country=US,zip=10001',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.log(`[eBay API] Search fallback failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const items = data.itemSummaries || [];

    // Find the exact item by checking if itemId is in the itemWebUrl or itemId field
    const exactMatch = items.find((item: any) => {
      const webUrl = item.itemWebUrl || '';
      const apiItemId = item.itemId || '';
      return webUrl.includes(`/itm/${itemId}`) || apiItemId.includes(itemId);
    });

    if (exactMatch) {
      return parseItemSummaryResponse(exactMatch, itemId);
    }

    // If no exact match, return first result as best guess
    if (items.length > 0) {
      return parseItemSummaryResponse(items[0], itemId);
    }

    return null;
  } catch (error) {
    console.error('[eBay API] Search fallback error:', error);
    return null;
  }
}

/**
 * Parse full item response from getItem endpoint
 */
function parseItemResponse(data: any, itemId: string): EbayItemDetails {
  let shipping = '';
  if (data.shippingOptions && data.shippingOptions.length > 0) {
    const shipOption = data.shippingOptions[0];
    const shipCost = parseFloat(shipOption.shippingCost?.value || '0');
    shipping = shipCost === 0 ? 'Free' : shipCost.toFixed(2);
  }

  let condition = 'Used';
  if (data.condition) {
    const cond = data.condition.toLowerCase();
    if (cond.includes('new')) condition = 'New';
    else if (cond.includes('open box')) condition = 'Open Box';
    else if (cond.includes('parts') || cond.includes('not working')) condition = 'Parts';
  }

  return {
    title: data.title || `eBay Item #${itemId}`,
    price: parseFloat(data.price?.value || '0').toFixed(2),
    condition,
    shipping,
    imageUrl: data.image?.imageUrl,
    itemId,
    categoryId: data.categoryId,
  };
}

/**
 * Parse item summary response from search endpoint
 */
function parseItemSummaryResponse(item: any, itemId: string): EbayItemDetails {
  let shipping = '';
  if (item.shippingOptions && item.shippingOptions.length > 0) {
    const shipCost = parseFloat(item.shippingOptions[0].shippingCost?.value || '0');
    shipping = shipCost === 0 ? 'Free' : shipCost.toFixed(2);
  }

  let condition = 'Used';
  if (item.condition) {
    const cond = item.condition.toLowerCase();
    if (cond.includes('new')) condition = 'New';
    else if (cond.includes('open box')) condition = 'Open Box';
    else if (cond.includes('parts') || cond.includes('not working')) condition = 'Parts';
  }

  return {
    title: item.title || `eBay Item #${itemId}`,
    price: parseFloat(item.price?.value || '0').toFixed(2),
    condition,
    shipping,
    imageUrl: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl,
    itemId,
    categoryId: item.categoryId,
  };
}

/**
 * Get API status for diagnostics
 */
export async function getApiStatus(): Promise<{
  credentialsConfigured: boolean;
  browseApiAvailable: boolean;
  marketplaceInsightsAvailable: boolean;
  message: string;
}> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      credentialsConfigured: false,
      browseApiAvailable: false,
      marketplaceInsightsAvailable: false,
      message: 'eBay API credentials not configured',
    };
  }

  const browseToken = await getAccessToken('https://api.ebay.com/oauth/api_scope');
  const insightsToken = await getAccessToken('https://api.ebay.com/oauth/api_scope/buy.marketplace.insights');

  return {
    credentialsConfigured: true,
    browseApiAvailable: !!browseToken,
    marketplaceInsightsAvailable: !!insightsToken,
    message: insightsToken 
      ? 'Full API access (sold data available)'
      : browseToken 
        ? 'Limited access (active listings only, awaiting Marketplace Insights approval)'
        : 'Authentication failed - check credentials',
  };
}
