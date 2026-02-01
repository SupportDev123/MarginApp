/**
 * Chrono24 Watch Pricing Integration
 * 
 * Provides luxury watch pricing data as a secondary source for Watches category.
 * Uses Retailed.io API (50 free requests) when available, otherwise provides
 * deep link to Chrono24 search for manual lookup.
 * 
 * Note: Chrono24 has no official public API. This integration uses third-party
 * services and search URL generation for pricing reference.
 */

import type { SoldComp } from '@shared/schema';

const RETAILED_API_BASE = 'https://app.retailed.io/api/v1/scraper/chrono24';

interface Chrono24Listing {
  id: string;
  name: string;
  brand: string;
  model?: string;
  price: string;
  currency?: string;
  location?: string;
  condition?: string;
  year?: number;
  images?: string[];
  url?: string;
}

interface Chrono24SearchResult {
  success: boolean;
  listings: Chrono24Listing[];
  totalCount?: number;
  error?: string;
}

/**
 * Extract numeric price from Chrono24 price string
 * Handles formats like "$16,553", "€14,500", "16553 USD"
 */
function parsePrice(priceStr: string): number {
  if (!priceStr) return 0;
  const cleaned = priceStr.replace(/[^0-9.]/g, '');
  return parseFloat(cleaned) || 0;
}

/**
 * Build Chrono24 search URL for manual lookup
 * Creates a deep link to their search page with relevant filters
 */
export function buildChrono24SearchUrl(query: string, options?: {
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
}): string {
  const encodedQuery = encodeURIComponent(query);
  let url = `https://www.chrono24.com/search/index.htm?query=${encodedQuery}`;
  
  if (options?.minPrice) {
    url += `&priceFrom=${options.minPrice}`;
  }
  if (options?.maxPrice) {
    url += `&priceTo=${options.maxPrice}`;
  }
  
  return url;
}

/**
 * Extract watch brand from title for better search accuracy
 */
export function extractWatchBrand(title: string): string | null {
  const brands = [
    'Rolex', 'Omega', 'Cartier', 'Patek Philippe', 'Audemars Piguet',
    'Tudor', 'Breitling', 'TAG Heuer', 'IWC', 'Panerai', 'Jaeger-LeCoultre',
    'Vacheron Constantin', 'Hublot', 'Zenith', 'Longines', 'Tissot',
    'Seiko', 'Grand Seiko', 'Casio', 'G-Shock', 'Citizen', 'Bulova',
    'Hamilton', 'Oris', 'Movado', 'Fossil', 'Invicta', 'Michael Kors',
    'Gucci', 'Versace', 'Armani', 'Swatch'
  ];
  
  const lower = title.toLowerCase();
  for (const brand of brands) {
    if (lower.includes(brand.toLowerCase())) {
      return brand;
    }
  }
  return null;
}

/**
 * Extract watch model reference from title
 * Looks for patterns like "116610", "Datejust", "Submariner"
 */
export function extractWatchModel(title: string): string | null {
  // Common Rolex model names
  const models = [
    'Submariner', 'Datejust', 'Day-Date', 'GMT-Master', 'Daytona',
    'Explorer', 'Sea-Dweller', 'Yacht-Master', 'Air-King', 'Milgauss',
    'Sky-Dweller', 'Cellini', 'Oyster Perpetual',
    // Other brands
    'Speedmaster', 'Seamaster', 'Constellation', 'De Ville',
    'Royal Oak', 'Nautilus', 'Aquanaut', 'Tank', 'Santos', 'Ballon Bleu',
    'Black Bay', 'Pelagos', 'Navitimer', 'Superocean', 'Carrera', 'Monaco'
  ];
  
  const lower = title.toLowerCase();
  for (const model of models) {
    if (lower.includes(model.toLowerCase())) {
      return model;
    }
  }
  
  // Try to extract reference number (5-7 digits, sometimes with letters)
  const refMatch = title.match(/\b([A-Z]?\d{5,7}[A-Z]?)\b/i);
  if (refMatch) {
    return refMatch[1];
  }
  
  return null;
}

/**
 * Fetch watch pricing from Chrono24 via Retailed.io API
 * Requires CHRONO24_API_KEY environment variable
 * 
 * Returns null if API not configured or request fails
 */
export async function fetchChrono24Listings(
  searchQuery: string,
  options?: { limit?: number }
): Promise<Chrono24SearchResult | null> {
  const apiKey = process.env.CHRONO24_API_KEY;
  
  if (!apiKey) {
    console.log('[Chrono24] API key not configured, skipping');
    return null;
  }
  
  try {
    const limit = options?.limit || 10;
    const url = `${RETAILED_API_BASE}/search?query=${encodeURIComponent(searchQuery)}&limit=${limit}`;
    
    const response = await fetch(url, {
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        console.log('[Chrono24] API key invalid or expired');
      } else if (response.status === 429) {
        console.log('[Chrono24] Rate limit exceeded (50 free requests/month)');
      } else {
        console.log(`[Chrono24] API error: ${response.status}`);
      }
      return null;
    }
    
    const data = await response.json();
    
    // Map response to our format
    const listings: Chrono24Listing[] = (data.results || data.listings || []).map((item: any) => ({
      id: item.id || item.sku || String(Math.random()),
      name: item.name || item.title || '',
      brand: item.brand || '',
      model: item.model || '',
      price: item.price || '',
      currency: item.currency || 'USD',
      location: item.location || item.seller_location || '',
      condition: item.condition || '',
      year: item.year || null,
      images: item.images || item.image_urls || [],
      url: item.url || item.link || '',
    }));
    
    return {
      success: true,
      listings,
      totalCount: data.total || listings.length,
    };
  } catch (error: any) {
    console.error('[Chrono24] Fetch error:', error.message);
    return null;
  }
}

/**
 * Convert Chrono24 listings to SoldComp format for unified display
 * Note: Chrono24 shows asking prices, not sold prices
 */
export function chrono24ToComps(listings: Chrono24Listing[]): SoldComp[] {
  return listings.map(listing => ({
    title: listing.name,
    soldPrice: parsePrice(listing.price),
    totalPrice: parsePrice(listing.price),
    dateSold: 'Chrono24 Asking Price',
    imageUrl: listing.images?.[0] || '',
    condition: listing.condition || 'Pre-owned',
    shippingCost: 'Contact seller',
  }));
}

/**
 * Get Chrono24 pricing data for a watch
 * Falls back to search URL if API not available
 */
export async function getChrono24WatchPricing(
  title: string,
  options?: { limit?: number }
): Promise<{
  comps: SoldComp[];
  source: 'chrono24_api' | 'chrono24_link';
  searchUrl: string;
  message?: string;
} | null> {
  // Extract brand and model for better search
  const brand = extractWatchBrand(title);
  const model = extractWatchModel(title);
  
  // Build optimized search query
  let searchQuery = title;
  if (brand && model) {
    searchQuery = `${brand} ${model}`;
  } else if (brand) {
    // Use first few words after brand
    const words = title.split(/\s+/).slice(0, 5).join(' ');
    searchQuery = words;
  }
  
  const searchUrl = buildChrono24SearchUrl(searchQuery, { brand: brand || undefined });
  
  // Try API if configured
  const apiResult = await fetchChrono24Listings(searchQuery, options);
  
  if (apiResult && apiResult.listings.length > 0) {
    const comps = chrono24ToComps(apiResult.listings);
    return {
      comps,
      source: 'chrono24_api',
      searchUrl,
      message: 'Prices from Chrono24 (asking prices, actual sale prices may differ)',
    };
  }
  
  // Return search URL for manual lookup
  return {
    comps: [],
    source: 'chrono24_link',
    searchUrl,
    message: 'View current market prices on Chrono24',
  };
}

/**
 * Check if Chrono24 integration is properly configured
 */
export function isChrono24Configured(): boolean {
  return !!process.env.CHRONO24_API_KEY;
}
