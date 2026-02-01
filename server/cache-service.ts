/**
 * Cache Service
 * 
 * In-memory cache with Redis-ready interface.
 * Category-aware TTL based on market volatility.
 * Easy to swap to Redis in production without changing application code.
 */

export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  source: 'cached' | 'fresh';
}

/**
 * Market volatility-based cache TTL (in milliseconds)
 * Cards trade frequently → short TTL
 * Shoes/watches are stable → longer TTL
 */
const CATEGORY_TTL: Record<string, number> = {
  // Volatile markets (prices change fast)
  'trading-cards': 24 * 60 * 60 * 1000, // 24 hours
  'pokemon': 24 * 60 * 60 * 1000,
  'sports-cards': 24 * 60 * 60 * 1000,
  'magic': 24 * 60 * 60 * 1000,
  
  // Semi-volatile markets (weekly updates)
  'collectibles': 7 * 24 * 60 * 60 * 1000, // 7 days
  'electronics': 7 * 24 * 60 * 60 * 1000,
  'handbags': 7 * 24 * 60 * 60 * 1000,
  'vintage': 7 * 24 * 60 * 60 * 1000,
  
  // Stable markets (monthly updates)
  'shoes': 28 * 24 * 60 * 60 * 1000, // 4 weeks
  'watches': 21 * 24 * 60 * 60 * 1000, // 3 weeks
  'toys': 21 * 24 * 60 * 60 * 1000,
  'gaming': 14 * 24 * 60 * 60 * 1000, // 2 weeks
  'tools': 14 * 24 * 60 * 60 * 1000,
  'antiques': 14 * 24 * 60 * 60 * 1000,
  
  // Default (1 week)
  'default': 7 * 24 * 60 * 60 * 1000,
};

class CacheService {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly cleanupInterval = 60000; // Clean up expired entries every minute

  constructor() {
    this.startCleanupInterval();
  }

  /**
   * Get value from cache if not expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data as T;
  }

  /**
   * Set value in cache with TTL
   */
  set<T>(key: string, data: T, ttlMs: number): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
      source: 'fresh',
    });
  }

  /**
   * Get from cache OR fetch fresh, automatically caching result
   */
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    category?: string
  ): Promise<{ data: T; source: 'cached' | 'fresh' }> {
    const cached = this.get<T>(key);
    
    if (cached !== null) {
      return { data: cached, source: 'cached' };
    }

    try {
      const fresh = await fetcher();
      const ttl = this.getTTL(category);
      this.set(key, fresh, ttl);
      return { data: fresh, source: 'fresh' };
    } catch (error) {
      // If fetch fails, check if there's stale data we can fall back to
      const entry = this.cache.get(key);
      if (entry) {
        console.warn(`[Cache] Fetch failed for ${key}, using stale data (expired ${Math.round((Date.now() - entry.expiresAt) / 1000)}s ago)`);
        return { data: entry.data, source: 'cached' };
      }
      throw error;
    }
  }

  /**
   * Delete specific key
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get TTL for category
   */
  private getTTL(category?: string): number {
    if (!category) return CATEGORY_TTL['default'];
    
    const normalized = category.toLowerCase().replace(/\s+/g, '-');
    return CATEGORY_TTL[normalized] || CATEGORY_TTL['default'];
  }

  /**
   * Get cache stats for monitoring
   */
  getStats() {
    let totalEntries = 0;
    let expiredEntries = 0;

    this.cache.forEach((entry) => {
      totalEntries++;
      if (entry.expiresAt < Date.now()) {
        expiredEntries++;
      }
    });

    return {
      totalEntries,
      expiredEntries,
      activeEntries: totalEntries - expiredEntries,
      percentExpired: totalEntries > 0 ? (expiredEntries / totalEntries * 100).toFixed(1) : '0',
    };
  }

  /**
   * Clean up expired entries every minute
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      let cleaned = 0;
      const now = Date.now();

      this.cache.forEach((entry, key) => {
        if (entry.expiresAt < now) {
          this.cache.delete(key);
          cleaned++;
        }
      });

      if (cleaned > 0) {
        console.log(`[Cache] Cleaned up ${cleaned} expired entries`);
      }
    }, this.cleanupInterval);
  }
}

// Export singleton instance
export const cache = new CacheService();

/**
 * Cache key builders for type safety
 */
export const cacheKeys = {
  // eBay comps for specific item
  ebayComps: (itemId: string) => `ebay:comps:${itemId}`,
  
  // OpenAI identification result
  aiIdentification: (imageHash: string) => `ai:id:${imageHash}`,
  
  // Category pricing trends
  categoryTrend: (category: string, period: '7d' | '30d' | '90d') => `cat:trend:${category}:${period}`,
  
  // Historical comps (fallback when API is down)
  historicalComps: (category: string) => `historical:comps:${category}`,
  
  // eBay token cache
  ebayAccessToken: () => 'ebay:token',
  
  // Stripe session cache
  stripeSession: (userId: string) => `stripe:session:${userId}`,
  
  // Card-specific caching
  cardComps: (cardNumber: string, set: string) => `card:comps:${set}:${cardNumber}`,
  cardPricing: (cardNumber: string) => `card:pricing:${cardNumber}`,
};

