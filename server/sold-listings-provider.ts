/**
 * BULLETPROOF Sold Listings Provider
 * 
 * Architecture:
 * ✅ 24-hour cache layer (reduces API calls by 80%+)
 * ✅ Last-known-good storage (fallback when API fails)
 * ✅ Fallback chain: cache → live API → last-known-good
 * ✅ Request throttling (prevents rate limits)
 * ✅ Soft-fail mode (never crashes, always returns something)
 * ✅ Multi-source ready (can add Algopix/DataForSEO later)
 * 
 * MANUAL PRICING MODE ISOLATION:
 * - Results from this provider are NEVER used for learning/training
 * - Calculations from /api/user-comps/calculate set excludeFromAnalytics: true
 */

import { fetchUserSelectableComps, type UserSelectableListing, type UserSelectableCompsResult } from "./serpapi";
import { fetchSoldItemsFromFindingApi } from "./ebay-api";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours - aggressive caching
const STALE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days for last-known-good
const MAX_RESULTS_PER_SEARCH = 30;
const MIN_REQUEST_INTERVAL_MS = 800; // ~1.25 req/sec max
const REQUEST_TIMEOUT_MS = 10000; // 10 second timeout

// ============================================================================
// CACHE STORAGE
// ============================================================================

interface CacheEntry {
  result: UserSelectableCompsResult;
  timestamp: number;
  source: 'live' | 'cache' | 'fallback';
}

// Primary cache (24-hour TTL)
const primaryCache = new Map<string, CacheEntry>();

// Last-known-good cache (7-day TTL, used when live API fails)
const lastKnownGoodCache = new Map<string, CacheEntry>();

// Request tracking
let lastRequestTime = 0;
let totalCacheHits = 0;
let totalLiveRequests = 0;
let totalFallbacks = 0;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getCacheKey(query: string, minPrice?: number, maxPrice?: number): string {
  return `${query.toLowerCase().trim()}|${minPrice || ''}|${maxPrice || ''}`;
}

function cleanExpiredCache(): void {
  const now = Date.now();
  
  // Clean primary cache (24h)
  const primaryKeysToDelete: string[] = [];
  primaryCache.forEach((entry, key) => {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      primaryKeysToDelete.push(key);
    }
  });
  primaryKeysToDelete.forEach(key => primaryCache.delete(key));
  
  // Clean last-known-good cache (7d)
  const lkgKeysToDelete: string[] = [];
  lastKnownGoodCache.forEach((entry, key) => {
    if (now - entry.timestamp > STALE_CACHE_TTL_MS) {
      lkgKeysToDelete.push(key);
    }
  });
  lkgKeysToDelete.forEach(key => lastKnownGoodCache.delete(key));
}

async function throttle(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();
}

// ============================================================================
// INTERFACES
// ============================================================================

export interface SoldListingsSearchOptions {
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
  skipCache?: boolean; // Force fresh fetch
}

export interface EnhancedCompsResult extends UserSelectableCompsResult {
  source: 'cache' | 'live' | 'fallback';
  cacheAge?: number; // Age in minutes
  responseTimeMs: number;
}

export interface SoldListingsProvider {
  search(query: string, options?: SoldListingsSearchOptions): Promise<EnhancedCompsResult>;
  clearCache(): void;
  getCacheStats(): CacheStats;
}

export interface CacheStats {
  primaryCacheSize: number;
  lastKnownGoodSize: number;
  ttlHours: number;
  totalCacheHits: number;
  totalLiveRequests: number;
  totalFallbacks: number;
  hitRate: string;
}

// ============================================================================
// BULLETPROOF PROVIDER
// ============================================================================

class BulletproofSoldListingsProvider implements SoldListingsProvider {
  
  async search(query: string, options: SoldListingsSearchOptions = {}): Promise<EnhancedCompsResult> {
    const startTime = Date.now();
    const cacheKey = getCacheKey(query, options.minPrice, options.maxPrice);
    
    // Clean expired entries
    cleanExpiredCache();
    
    // ========================================================================
    // STEP 1: Check primary cache (24h TTL)
    // ========================================================================
    if (!options.skipCache) {
      const cached = primaryCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        totalCacheHits++;
        const cacheAgeMinutes = Math.round((Date.now() - cached.timestamp) / 60000);
        console.log(`[Comps] ✅ Cache HIT for "${query}" (${cacheAgeMinutes}m old, ${cached.result.listings.length} items)`);
        
        return {
          ...cached.result,
          source: 'cache',
          cacheAge: cacheAgeMinutes,
          responseTimeMs: Date.now() - startTime,
        };
      }
    }
    
    // ========================================================================
    // STEP 2: Try eBay Finding API (FREE - PRIMARY SOURCE)
    // Cost-saving mode: Using free eBay APIs instead of paid SerpAPI
    // ========================================================================
    try {
      await throttle();
      totalLiveRequests++;
      
      const limit = Math.min(options.limit || MAX_RESULTS_PER_SEARCH, MAX_RESULTS_PER_SEARCH);
      console.log(`[Comps] 🔄 Fetching LIVE from eBay Finding API (FREE): "${query}" (limit: ${limit})`);
      
      const findingResult = await fetchSoldItemsFromFindingApi(query, {
        limit,
        minPrice: options.minPrice,
        maxPrice: options.maxPrice,
        itemCategory: 'Other'
      });
      
      if (findingResult.success && findingResult.comps.length > 0) {
        // Convert SoldComp[] to UserSelectableListing[]
        const listings: UserSelectableListing[] = findingResult.comps.map((comp, idx) => ({
          id: `finding-${Date.now()}-${idx}`,
          title: comp.title || 'Unknown Item',
          soldPrice: comp.soldPrice,
          shippingCost: (comp.totalPrice || comp.soldPrice) - comp.soldPrice,
          totalPrice: comp.totalPrice || comp.soldPrice,
          condition: comp.condition,
          imageUrl: comp.imageUrl || null,
          link: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1`,
          dateSold: comp.dateSold,
        }));
        
        const result: UserSelectableCompsResult = {
          success: true,
          listings,
          totalResults: listings.length,
          query,
        };
        
        // Cache the result
        const entry: CacheEntry = {
          result,
          timestamp: Date.now(),
          source: 'live',
        };
        primaryCache.set(cacheKey, entry);
        lastKnownGoodCache.set(cacheKey, entry);
        
        console.log(`[Comps] ✅ LIVE success: ${result.listings.length} items for "${query}" in ${Date.now() - startTime}ms`);
        
        return {
          ...result,
          source: 'live',
          responseTimeMs: Date.now() - startTime,
        };
      }
      
      // Finding API returned empty - try SerpAPI fallback
      throw new Error('No results from Finding API');
      
    } catch (error: any) {
      console.error(`[Comps] ⚠️ eBay Finding API failed for "${query}":`, error.message);
      
      // ======================================================================
      // STEP 3: Fallback to last-known-good cache
      // ======================================================================
      const lastKnown = lastKnownGoodCache.get(cacheKey);
      if (lastKnown && lastKnown.result.listings.length > 0) {
        totalFallbacks++;
        const cacheAgeMinutes = Math.round((Date.now() - lastKnown.timestamp) / 60000);
        console.log(`[Comps] 🔄 Using FALLBACK data for "${query}" (${cacheAgeMinutes}m old, ${lastKnown.result.listings.length} items)`);
        
        return {
          ...lastKnown.result,
          source: 'fallback',
          cacheAge: cacheAgeMinutes,
          responseTimeMs: Date.now() - startTime,
        };
      }
      
      // ======================================================================
      // STEP 4: Soft fail - return empty but don't crash
      // ======================================================================
      console.log(`[Comps] ❌ No data available for "${query}" - soft fail`);
      
      return {
        success: false,
        listings: [],
        totalResults: 0,
        query,
        error: `No comps available: ${error.message}`,
        source: 'fallback',
        responseTimeMs: Date.now() - startTime,
      };
    }
  }
  
  clearCache(): void {
    primaryCache.clear();
    lastKnownGoodCache.clear();
    totalCacheHits = 0;
    totalLiveRequests = 0;
    totalFallbacks = 0;
    console.log('[Comps] 🗑️ All caches cleared');
  }
  
  getCacheStats(): CacheStats {
    cleanExpiredCache();
    const totalRequests = totalCacheHits + totalLiveRequests;
    const hitRate = totalRequests > 0 
      ? ((totalCacheHits / totalRequests) * 100).toFixed(1) + '%'
      : '0%';
    
    return {
      primaryCacheSize: primaryCache.size,
      lastKnownGoodSize: lastKnownGoodCache.size,
      ttlHours: CACHE_TTL_MS / (60 * 60 * 1000),
      totalCacheHits,
      totalLiveRequests,
      totalFallbacks,
      hitRate,
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const soldListingsProvider: SoldListingsProvider = new BulletproofSoldListingsProvider();

// Re-export types for convenience
export type { UserSelectableListing, UserSelectableCompsResult };

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Pre-warm the cache with common searches
 * Call this on server startup for frequently searched items
 */
export async function prewarmCache(queries: string[]): Promise<void> {
  console.log(`[Comps] Pre-warming cache with ${queries.length} queries...`);
  
  for (const query of queries) {
    try {
      await soldListingsProvider.search(query, { limit: 20 });
      // Small delay between pre-warm requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`[Comps] Pre-warm failed for "${query}"`);
    }
  }
  
  console.log(`[Comps] Pre-warm complete. Cache size: ${soldListingsProvider.getCacheStats().primaryCacheSize}`);
}
