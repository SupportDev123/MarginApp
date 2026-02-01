/**
 * PriceCharting API Integration
 * 
 * Provides pricing data for video games, trading cards, and collectibles.
 * Requires a Legendary subscription from pricecharting.com
 * 
 * API Docs: https://www.pricecharting.com/api-documentation
 * 
 * Key notes:
 * - Prices are returned in pennies (divide by 100 for dollars)
 * - Supports video games, trading cards, comics, toys
 * - Categories: Video Games, TCG Cards, Sports Cards, Comics, Toys
 */

const PRICECHARTING_BASE = 'https://www.pricecharting.com/api';

interface PriceChartingProduct {
  id: string;
  'product-name': string;
  'console-name'?: string;
  'loose-price'?: number;
  'cib-price'?: number;
  'new-price'?: number;
  'graded-price'?: number;
  'box-only-price'?: number;
  'manual-only-price'?: number;
  upc?: string;
  asin?: string;
  'release-date'?: string;
  genre?: string;
}

interface PriceChartingResponse {
  status: 'success' | 'error';
  message?: string;
  products?: PriceChartingProduct[];
  id?: string;
  'product-name'?: string;
  'console-name'?: string;
  'loose-price'?: number;
  'cib-price'?: number;
  'new-price'?: number;
  'graded-price'?: number;
}

export interface PriceChartingResult {
  success: boolean;
  productName: string;
  consoleName?: string;
  prices: {
    loose: number | null;
    cib: number | null;
    new: number | null;
    graded: number | null;
  };
  priceChartingId?: string;
  error?: string;
}

function penniesToDollars(pennies: number | undefined): number | null {
  if (pennies === undefined || pennies === 0) return null;
  return pennies / 100;
}

/**
 * Search for a product by name and optionally console/platform
 */
export async function searchPriceCharting(
  query: string,
  options?: {
    console?: string;
    type?: 'videogames' | 'trading-cards' | 'comics' | 'toys';
  }
): Promise<PriceChartingResult> {
  const apiKey = process.env.PRICECHARTING_API_KEY;
  
  if (!apiKey) {
    console.log('[PriceCharting] No API key configured');
    return {
      success: false,
      productName: query,
      prices: { loose: null, cib: null, new: null, graded: null },
      error: 'PriceCharting API key not configured'
    };
  }

  const startTime = Date.now();
  
  try {
    const searchQuery = options?.console 
      ? `${query} ${options.console}` 
      : query;
    
    const params = new URLSearchParams({
      t: apiKey,
      q: searchQuery,
    });

    const url = `${PRICECHARTING_BASE}/product?${params.toString()}`;
    console.log(`[PriceCharting] Searching for: "${searchQuery}"`);

    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`PriceCharting returned ${response.status}: ${response.statusText}`);
    }

    const data: PriceChartingResponse = await response.json();
    
    if (data.status === 'error') {
      throw new Error(data.message || 'PriceCharting API error');
    }

    const durationMs = Date.now() - startTime;
    console.log(`[PriceCharting] Found product in ${durationMs}ms`);

    return {
      success: true,
      productName: data['product-name'] || query,
      consoleName: data['console-name'],
      prices: {
        loose: penniesToDollars(data['loose-price']),
        cib: penniesToDollars(data['cib-price']),
        new: penniesToDollars(data['new-price']),
        graded: penniesToDollars(data['graded-price']),
      },
      priceChartingId: data.id,
    };

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[PriceCharting] Error after ${durationMs}ms:`, errorMessage);

    return {
      success: false,
      productName: query,
      prices: { loose: null, cib: null, new: null, graded: null },
      error: errorMessage,
    };
  }
}

/**
 * Search for multiple products (returns up to 20 matches)
 */
export async function searchPriceChartingMultiple(
  query: string,
  options?: {
    console?: string;
  }
): Promise<PriceChartingResult[]> {
  const apiKey = process.env.PRICECHARTING_API_KEY;
  
  if (!apiKey) {
    console.log('[PriceCharting] No API key configured');
    return [];
  }

  const startTime = Date.now();
  
  try {
    const searchQuery = options?.console 
      ? `${query} ${options.console}` 
      : query;
    
    const params = new URLSearchParams({
      t: apiKey,
      q: searchQuery,
    });

    const url = `${PRICECHARTING_BASE}/products?${params.toString()}`;
    console.log(`[PriceCharting] Multi-search for: "${searchQuery}"`);

    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`PriceCharting returned ${response.status}: ${response.statusText}`);
    }

    const data: PriceChartingResponse = await response.json();
    
    if (data.status === 'error') {
      throw new Error(data.message || 'PriceCharting API error');
    }

    const products = data.products || [];
    const durationMs = Date.now() - startTime;
    console.log(`[PriceCharting] Found ${products.length} products in ${durationMs}ms`);

    return products.map(product => ({
      success: true,
      productName: product['product-name'],
      consoleName: product['console-name'],
      prices: {
        loose: penniesToDollars(product['loose-price']),
        cib: penniesToDollars(product['cib-price']),
        new: penniesToDollars(product['new-price']),
        graded: penniesToDollars(product['graded-price']),
      },
      priceChartingId: product.id,
    }));

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[PriceCharting] Error after ${durationMs}ms:`, errorMessage);
    return [];
  }
}

/**
 * Get market value based on condition
 * For video games: loose = used, cib = complete in box, new = sealed
 * For cards: graded prices are also available
 */
export function getMarketValue(
  result: PriceChartingResult,
  condition: 'new' | 'used' | 'graded' = 'used'
): number | null {
  if (!result.success) return null;
  
  switch (condition) {
    case 'new':
      return result.prices.new || result.prices.cib;
    case 'graded':
      return result.prices.graded || result.prices.new;
    case 'used':
    default:
      return result.prices.loose || result.prices.cib;
  }
}

/**
 * Check if PriceCharting is configured and working
 */
export async function checkPriceChartingStatus(): Promise<{
  configured: boolean;
  working: boolean;
  error?: string;
}> {
  const apiKey = process.env.PRICECHARTING_API_KEY;
  
  if (!apiKey) {
    return { configured: false, working: false, error: 'No API key' };
  }

  try {
    const result = await searchPriceCharting('mario nintendo');
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

/**
 * Lookup a product by UPC/EAN barcode
 * This is the most accurate way to identify video games and collectibles
 */
export async function lookupByUpc(upc: string): Promise<PriceChartingResult> {
  const apiKey = process.env.PRICECHARTING_API_KEY;
  
  if (!apiKey) {
    console.log('[PriceCharting] No API key configured');
    return {
      success: false,
      productName: upc,
      prices: { loose: null, cib: null, new: null, graded: null },
      error: 'PriceCharting API key not configured'
    };
  }

  const startTime = Date.now();
  
  try {
    // Clean the UPC - remove any spaces or dashes
    const cleanUpc = upc.replace(/[\s-]/g, '');
    
    const params = new URLSearchParams({
      t: apiKey,
      upc: cleanUpc,
    });

    const url = `${PRICECHARTING_BASE}/product?${params.toString()}`;
    console.log(`[PriceCharting] Looking up UPC: ${cleanUpc}`);

    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`PriceCharting returned ${response.status}: ${response.statusText}`);
    }

    const data: PriceChartingResponse = await response.json();
    
    if (data.status === 'error') {
      throw new Error(data.message || 'Product not found');
    }

    const durationMs = Date.now() - startTime;
    console.log(`[PriceCharting] Found product by UPC in ${durationMs}ms: ${data['product-name']}`);

    return {
      success: true,
      productName: data['product-name'] || upc,
      consoleName: data['console-name'],
      prices: {
        loose: penniesToDollars(data['loose-price']),
        cib: penniesToDollars(data['cib-price']),
        new: penniesToDollars(data['new-price']),
        graded: penniesToDollars(data['graded-price']),
      },
      priceChartingId: data.id,
    };

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[PriceCharting] UPC lookup error after ${durationMs}ms:`, errorMessage);

    return {
      success: false,
      productName: upc,
      prices: { loose: null, cib: null, new: null, graded: null },
      error: errorMessage,
    };
  }
}

/**
 * Detect if a query is likely a video game or gaming-related item
 */
export function isLikelyVideoGame(title: string): boolean {
  const gamingKeywords = [
    'nintendo', 'playstation', 'ps1', 'ps2', 'ps3', 'ps4', 'ps5', 'psx',
    'xbox', 'sega', 'genesis', 'dreamcast', 'saturn', 'gamecube', 'wii',
    'switch', 'n64', 'nes', 'snes', 'gameboy', 'game boy', 'gba', 'ds', '3ds',
    'atari', 'neo geo', 'turbografx', 'pc engine', 'master system',
    'game disc', 'game cartridge', 'cib', 'complete in box', 'sealed game',
    'retro game', 'video game', 'console game'
  ];
  
  const titleLower = title.toLowerCase();
  return gamingKeywords.some(keyword => titleLower.includes(keyword));
}
