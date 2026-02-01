/**
 * SerpAPI Integration for eBay Sold Items
 * 
 * Provides real sold item data from eBay using SerpAPI's eBay Search API.
 * This replaces the need for eBay Marketplace Insights API approval.
 * 
 * API Docs: https://serpapi.com/ebay-search-api
 * Free tier: 250 searches/month
 */

interface SoldComp {
  soldPrice: number;
  shippingCost: string;
  dateSold: string;
  condition: string;
  totalPrice: number;
  title?: string;
  imageUrl?: string;
}

const SERPAPI_BASE = 'https://serpapi.com/search';

interface SerpApiEbayResult {
  title: string;
  link: string;
  price?: {
    raw?: string;
    extracted?: number;
  };
  thumbnail?: string;
  condition?: string;
  quantity?: {
    sold?: number;
    available?: number;
  };
  seller?: {
    name?: string;
    rating?: number;
    reviews?: number;
  };
  shipping?: {
    raw?: string;
    extracted?: number;
  };
}

interface SerpApiResponse {
  search_metadata?: {
    status: string;
    total_time_taken?: number;
  };
  search_information?: {
    total_results?: number;
  };
  organic_results?: SerpApiEbayResult[];
  error?: string;
}

export interface SerpApiSoldResult {
  success: boolean;
  comps: SoldComp[];
  totalResults: number;
  dataSource: 'serpapi_sold';
  error?: string;
}

/**
 * Fetch sold items from eBay via SerpAPI
 */
export async function fetchSoldItemsFromSerpApi(
  query: string,
  options: {
    condition?: 'new' | 'used' | 'all';
    minPrice?: number;
    maxPrice?: number;
    limit?: number;
  } = {}
): Promise<SerpApiSoldResult> {
  const apiKey = process.env.SERPAPI_KEY;
  
  if (!apiKey) {
    console.log('[SerpAPI] No API key configured');
    return {
      success: false,
      comps: [],
      totalResults: 0,
      dataSource: 'serpapi_sold',
      error: 'SerpAPI key not configured'
    };
  }

  const startTime = Date.now();
  
  try {
    // Use proper eBay sold item filters
    // LH_Sold=1 = Sold Items only
    // LH_Complete=1 = Completed listings
    const params = new URLSearchParams({
      engine: 'ebay',
      _nkw: query,
      LH_Sold: '1',
      LH_Complete: '1',
      ebay_domain: 'ebay.com',
      api_key: apiKey,
    });

    if (options.minPrice) {
      params.set('_udlo', options.minPrice.toString());
    }
    if (options.maxPrice) {
      params.set('_udhi', options.maxPrice.toString());
    }

    const url = `${SERPAPI_BASE}?${params.toString()}`;
    console.log(`[SerpAPI] Fetching sold items for: "${query}"`);

    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`SerpAPI returned ${response.status}: ${response.statusText}`);
    }

    const data: SerpApiResponse = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }

    const results = data.organic_results || [];
    const limit = options.limit || 20;
    
    // Bundle/lot exclusion patterns - we only want single items
    const bundlePatterns = /\b(bundle|lot|set of \d+|\d+\s*(pcs?|pieces?|watches|items?)|bulk|wholesale|collection of|x\s*\d+|\d+\s*x\b|pack of \d+|\d+\s*pack)\b/i;
    
    const comps: SoldComp[] = results
      .filter(item => {
        // Must have valid price
        if (!item.price?.extracted || item.price.extracted <= 0) return false;
        
        // Exclude bundles and lots
        if (item.title && bundlePatterns.test(item.title)) {
          console.log(`[SerpAPI] Excluding bundle: "${item.title}"`);
          return false;
        }
        
        return true;
      })
      .slice(0, limit)
      .map((item) => {
        let condition = 'Used';
        if (item.condition) {
          const condLower = item.condition.toLowerCase();
          if (condLower.includes('new') || condLower.includes('brand new')) {
            condition = 'New';
          } else if (condLower.includes('used') || condLower.includes('pre-owned') || condLower.includes('open box')) {
            condition = 'Used';
          } else {
            condition = item.condition;
          }
        }

        if (options.condition && options.condition !== 'all') {
          if (condition.toLowerCase() !== options.condition) {
            return null;
          }
        }

        const soldPrice = item.price?.extracted || 0;
        const shippingCost = item.shipping?.extracted ? `$${item.shipping.extracted.toFixed(2)}` : 'Free';
        
        const dateSold = (item as any)?.sold_date || (item as any)?.date_sold || (item as any)?.soldDate || 'Recently';
        
        const totalPrice = soldPrice + (item.shipping?.extracted || 0);
        const comp = {
          soldPrice,
          shippingCost,
          dateSold,
          condition,
          totalPrice,
        };
        return comp;
      })
      .filter((comp): comp is SoldComp => comp !== null);

    const durationMs = Date.now() - startTime;
    console.log(`[SerpAPI] Found ${comps.length} sold comps in ${durationMs}ms`);

    return {
      success: true,
      comps,
      totalResults: data.search_information?.total_results || comps.length,
      dataSource: 'serpapi_sold',
    };

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[SerpAPI] Error after ${durationMs}ms:`, errorMessage);

    return {
      success: false,
      comps: [],
      totalResults: 0,
      dataSource: 'serpapi_sold',
      error: errorMessage,
    };
  }
}

/**
 * Check if SerpAPI is configured and working
 */
export async function checkSerpApiStatus(): Promise<{
  configured: boolean;
  working: boolean;
  error?: string;
}> {
  const apiKey = process.env.SERPAPI_KEY;
  
  if (!apiKey) {
    return { configured: false, working: false, error: 'No API key' };
  }

  try {
    const result = await fetchSoldItemsFromSerpApi('test item', { limit: 1 });
    return {
      configured: true,
      working: result.success,
      error: result.error,
    };
  } catch (error) {
    return {
      configured: true,
      working: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// User-Selected Comps Mode - Extended listing details for browsing UI
export interface UserSelectableListing {
  id: string;
  title: string;
  soldPrice: number;
  shippingCost: number;
  totalPrice: number;
  condition: string;
  imageUrl: string | null;
  link: string;
  dateSold: string;
}

export interface UserSelectableCompsResult {
  success: boolean;
  listings: UserSelectableListing[];
  totalResults: number;
  query: string;
  error?: string;
}

/**
 * Fetch sold listings with full details for User-Selected Comps Mode
 * Returns listing details including images, titles, and links for user browsing
 */
export async function fetchUserSelectableComps(
  query: string,
  options: {
    minPrice?: number;
    maxPrice?: number;
    limit?: number;
  } = {}
): Promise<UserSelectableCompsResult> {
  const apiKey = process.env.SERPAPI_KEY;
  
  if (!apiKey) {
    console.log('[SerpAPI] No API key configured for user-selectable comps');
    return {
      success: false,
      listings: [],
      totalResults: 0,
      query,
      error: 'SerpAPI key not configured'
    };
  }

  const startTime = Date.now();
  
  try {
    const params = new URLSearchParams({
      engine: 'ebay',
      _nkw: query,
      LH_Sold: '1',
      LH_Complete: '1',
      ebay_domain: 'ebay.com',
      api_key: apiKey,
    });

    if (options.minPrice) {
      params.set('_udlo', options.minPrice.toString());
    }
    if (options.maxPrice) {
      params.set('_udhi', options.maxPrice.toString());
    }

    const url = `${SERPAPI_BASE}?${params.toString()}`;
    console.log(`[SerpAPI] Fetching user-selectable comps for: "${query}"`);

    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`SerpAPI returned ${response.status}: ${response.statusText}`);
    }

    const data: SerpApiResponse = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }

    const results = data.organic_results || [];
    const limit = options.limit || 30;
    
    // Bundle/lot exclusion patterns - we only want single items
    const bundlePatterns = /\b(bundle|lot|set of \d+|\d+\s*(pcs?|pieces?|watches|items?)|bulk|wholesale|collection of|x\s*\d+|\d+\s*x\b|pack of \d+|\d+\s*pack)\b/i;
    
    const listings: UserSelectableListing[] = results
      .filter(item => {
        // Must have valid price
        if (!item.price?.extracted || item.price.extracted <= 0) return false;
        
        // Exclude bundles and lots
        if (item.title && bundlePatterns.test(item.title)) {
          console.log(`[SerpAPI] Excluding bundle from comps: "${item.title}"`);
          return false;
        }
        
        return true;
      })
      .slice(0, limit)
      .map((item, index) => {
        let condition = 'Used';
        if (item.condition) {
          const condLower = item.condition.toLowerCase();
          if (condLower.includes('new') || condLower.includes('brand new')) {
            condition = 'New';
          } else if (condLower.includes('used') || condLower.includes('pre-owned') || condLower.includes('open box')) {
            condition = 'Used';
          } else {
            condition = item.condition;
          }
        }

        const soldPrice = item.price?.extracted || 0;
        const shippingCost = item.shipping?.extracted || 0;
        
        const dateSold = (item as any)?.sold_date || (item as any)?.date_sold || (item as any)?.soldDate || 'Recently';
        
        return {
          id: `serp-${Date.now()}-${index}`,
          title: item.title || 'Unknown Item',
          soldPrice,
          shippingCost,
          totalPrice: soldPrice + shippingCost,
          condition,
          imageUrl: item.thumbnail || null,
          link: item.link || '',
          dateSold,
        };
      });

    const durationMs = Date.now() - startTime;
    console.log(`[SerpAPI] Found ${listings.length} user-selectable listings in ${durationMs}ms`);

    return {
      success: true,
      listings,
      totalResults: data.search_information?.total_results || listings.length,
      query,
    };

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[SerpAPI] Error fetching user-selectable comps after ${durationMs}ms:`, errorMessage);

    return {
      success: false,
      listings: [],
      totalResults: 0,
      query,
      error: errorMessage,
    };
  }
}
