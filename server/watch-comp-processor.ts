/**
 * Watch Comp Processor
 * 
 * Handles intelligent query building and comp cleaning specifically for watches.
 * Uses brand + family + model/movement identifiers for precise queries.
 * Cleans results by removing parts/repair/bundles, uses MEDIAN, trims outliers.
 */

export interface WatchIdentifiers {
  brand: string;
  family: string;
  modelNumber?: string;
  movement?: string;
  caseDiameter?: string;
  material?: string;
  gender?: 'mens' | 'womens' | 'unisex';
}

export interface CleanedCompResult {
  success: boolean;
  comps: CleanedComp[];
  medianPrice: number | null;
  lowPrice: number | null;
  highPrice: number | null;
  compCount: number;
  confidence: 'high' | 'low';
  reason?: string;
}

export interface CleanedComp {
  soldPrice: number;
  shippingCost: string;
  dateSold: string;
  condition: string;
  totalPrice: number;
  title?: string;
  isOutlier?: boolean;
}

const WATCH_BRANDS = [
  'rolex', 'omega', 'seiko', 'citizen', 'casio', 'tissot', 'hamilton', 'bulova',
  'orient', 'invicta', 'timex', 'fossil', 'movado', 'tag heuer', 'breitling',
  'cartier', 'longines', 'oris', 'tudor', 'iwc', 'panerai', 'hublot', 'audemars',
  'patek', 'vacheron', 'jaeger', 'zenith', 'grand seiko', 'ball', 'sinn', 'nomos',
  'junghans', 'mido', 'certina', 'rado', 'frederique', 'maurice lacroix', 'stuhrling',
  'alpina', 'glycine', 'marathon', 'luminox', 'victorinox', 'g-shock', 'garmin',
  'apple', 'samsung', 'fitbit', 'suunto', 'polar'
];

const WATCH_FAMILIES: Record<string, string[]> = {
  'seiko': ['prospex', 'presage', 'turtle', 'skx', 'samurai', 'monster', 'alpinist', 'cocktail time', '5 sports', 'king seiko', 'astron', 'premier', 'solar', 'kinetic'],
  'citizen': ['eco-drive', 'promaster', 'nighthawk', 'chandler', 'corso', 'axiom', 'stiletto'],
  'casio': ['g-shock', 'edifice', 'oceanus', 'pro trek', 'mudmaster', 'rangeman', 'frogman', 'gravitymaster'],
  'tissot': ['prx', 'powermatic', 'gentleman', 'seastar', 'prs', 'le locle', 'visodate', 'chemin des tourelles', 't-sport', 't-race'],
  'hamilton': ['khaki', 'jazzmaster', 'ventura', 'intra-matic', 'boulton', 'american classic'],
  'bulova': ['precisionist', 'lunar pilot', 'accutron', 'curv', 'marine star', 'classic', 'sutton'],
  'orient': ['bambino', 'mako', 'ray', 'kamasu', 'star', 'sun & moon', 'triton'],
  'invicta': ['pro diver', 'bolt', 'speedway', 'subaqua', 'specialty', 'reserve', 'activa', 'activa summit', 'elements', 'aviator', 'coalition forces', 'objet d art'],
  'omega': ['speedmaster', 'seamaster', 'constellation', 'de ville', 'aqua terra', 'planet ocean', 'moonwatch'],
  'rolex': ['submariner', 'datejust', 'daytona', 'gmt master', 'explorer', 'oyster perpetual', 'day-date', 'sea-dweller', 'yacht-master', 'air-king'],
  'tudor': ['black bay', 'pelagos', 'ranger', '1926', 'glamour'],
  'tag heuer': ['carrera', 'aquaracer', 'formula 1', 'monaco', 'autavia'],
  'apple': ['watch ultra 2', 'watch ultra', 'watch series 10', 'watch series 9', 'watch series 8', 'watch series 7', 'watch series 6', 'watch series 5', 'watch series 4', 'watch series 3', 'watch se 2', 'watch se'],
  'samsung': ['galaxy watch ultra', 'galaxy watch 7', 'galaxy watch 6', 'galaxy watch 5', 'galaxy watch 4', 'galaxy watch 3', 'galaxy watch active', 'gear s3', 'gear s2'],
  'garmin': ['fenix 8', 'fenix 7', 'fenix 6', 'fenix 5', 'forerunner 965', 'forerunner 955', 'forerunner 945', 'forerunner 745', 'forerunner 265', 'forerunner 255', 'venu 3', 'venu 2', 'instinct 2', 'instinct', 'epix'],
  'fitbit': ['sense 2', 'sense', 'versa 4', 'versa 3', 'versa 2', 'charge 6', 'charge 5', 'inspire 3', 'luxe'],
  'suunto': ['race', '9 peak', 'vertical', 'core', 'spartan'],
  'polar': ['vantage v3', 'vantage v2', 'grit x2', 'pacer pro', 'ignite 3'],
};

const SMARTWATCH_BRANDS = ['apple', 'samsung', 'garmin', 'fitbit', 'suunto', 'polar'];

const SMARTWATCH_ACCESSORY_TERMS = [
  'band', 'strap', 'bands', 'straps', 'loop', 'bracelet', 'wristband',
  'charger', 'charging', 'cable', 'dock', 'stand', 'holder',
  'screen protector', 'protector', 'film', 'tempered glass',
  'case only', 'cover', 'bumper', 'protective',
  'replacement', 'spare', 'extra', 'accessory', 'accessories'
];

const MOVEMENT_KEYWORDS = [
  'automatic', 'mechanical', 'hand-wound', 'handwound', 'manual', 'quartz', 'solar', 'kinetic', 'eco-drive',
  'nh35', 'nh36', 'nh38', 'sw200', 'sw300', 'eta 2824', 'eta 2892', 'miyota', 'sellita', 
  '7s26', '4r35', '4r36', '6r15', '6r35', '8l35', '9s65', 'caliber', 'cal.', 'movement'
];

const EXCLUDED_TITLE_PATTERNS = [
  /\b(parts?|repair|for parts|broken|not working|needs work|non.?working|damaged|as.?is)\b/i,
  /\b(bundle|lot of|set of|collection|bulk|wholesale)\b/i,
  /\b(band only|strap only|case only|dial only|movement only|bezel only|crown only)\b/i,
  /\b(replacement|spare|extra|accessory|accessories)\b/i,
  /\b(box only|papers only|certificate only)\b/i,
  /\b(display|dummy|replica|fake|homage|copy)\b/i,
  /\b(band|strap|bands|straps|loop|wristband)\b(?!.*\b(watch|ultra|series|se)\b.*\$[1-9]\d{2,})/i,
  /\b(charger|charging|cable|dock|stand|holder)\b/i,
  /\b(screen protector|protector|tempered glass|film)\b/i,
];

/**
 * Extract watch identifiers from a title
 */
export function extractWatchIdentifiers(title: string): WatchIdentifiers {
  const lowerTitle = title.toLowerCase();
  
  let brand = '';
  for (const b of WATCH_BRANDS) {
    if (lowerTitle.includes(b)) {
      brand = b;
      break;
    }
  }
  
  let family = '';
  if (brand && WATCH_FAMILIES[brand]) {
    for (const f of WATCH_FAMILIES[brand]) {
      if (lowerTitle.includes(f)) {
        family = f;
        break;
      }
    }
  }
  
  let modelNumber: string | undefined;
  const modelPatterns = [
    /\b([A-Z]{2,4}[0-9]{3,6}(?:-[0-9]{1,4})?)\b/i, // ACW8082-007 or ACW8082
    /\b([A-Z]{2,4}-?[0-9]{4,8})\b/i, // Simple alphanumeric with optional dash
    /\b(ref\.?\s*[0-9A-Z\-]{4,12})\b/i,
    /\b([0-9]{3,6}[A-Z]{1,3})\b/i,
    /\b([0-9]{4,6})\b/, // Just a 4-6 digit model number like 47484
  ];
  for (const pattern of modelPatterns) {
    const match = title.match(pattern);
    if (match) {
      // Extract just the core model (before dash suffix for variants)
      let cleaned = match[1].toUpperCase();
      // For patterns like ACW8082-007, extract base model ACW8082
      const dashMatch = cleaned.match(/^([A-Z]{2,4}[0-9]{4,6})/);
      if (dashMatch) {
        cleaned = dashMatch[1];
      }
      if (cleaned.length >= 4) {
        modelNumber = cleaned;
        break;
      }
    }
  }
  
  let movement: string | undefined;
  for (const mov of MOVEMENT_KEYWORDS) {
    if (lowerTitle.includes(mov)) {
      movement = mov;
      break;
    }
  }
  
  let caseDiameter: string | undefined;
  const sizeMatch = title.match(/\b(\d{2})\s*mm\b/i);
  if (sizeMatch) {
    caseDiameter = `${sizeMatch[1]}mm`;
  }
  
  let gender: 'mens' | 'womens' | 'unisex' | undefined;
  if (/\b(women'?s?|ladies?|female)\b/i.test(title)) {
    gender = 'womens';
  } else if (/\b(men'?s?|gents?|male)\b/i.test(title)) {
    gender = 'mens';
  } else if (caseDiameter) {
    const size = parseInt(caseDiameter);
    if (size <= 34) gender = 'womens';
    else if (size >= 40) gender = 'mens';
    else gender = 'unisex';
  }
  
  let material: string | undefined;
  if (/\b(stainless\s*steel|ss|316l)\b/i.test(title)) material = 'stainless steel';
  else if (/\b(gold|18k|14k|rose gold|yellow gold)\b/i.test(title)) material = 'gold';
  else if (/\b(titanium|ti)\b/i.test(title)) material = 'titanium';
  else if (/\b(ceramic)\b/i.test(title)) material = 'ceramic';
  else if (/\b(bronze)\b/i.test(title)) material = 'bronze';
  
  return { brand, family, modelNumber, movement, caseDiameter, material, gender };
}

/**
 * Build a tight search query for watch comps
 * Priority: brand + family + strongest identifier (model number OR movement)
 * Special handling for smartwatches to exclude accessory terms
 */
export function buildWatchCompQuery(title: string): { query: string; identifiers: WatchIdentifiers } {
  const identifiers = extractWatchIdentifiers(title);
  const lowerTitle = title.toLowerCase();
  
  const isSmartwatch = SMARTWATCH_BRANDS.some(brand => lowerTitle.includes(brand));
  
  if (isSmartwatch) {
    return buildSmartwatchQuery(title, identifiers);
  }
  
  const parts: string[] = [];
  
  if (identifiers.brand) {
    parts.push(identifiers.brand);
  }
  
  if (identifiers.family) {
    parts.push(identifiers.family);
  }
  
  if (identifiers.modelNumber) {
    parts.push(identifiers.modelNumber);
  } else if (identifiers.movement) {
    parts.push(identifiers.movement);
  }
  
  if (identifiers.caseDiameter && parts.length < 4) {
    parts.push(identifiers.caseDiameter);
  }
  
  if (parts.length < 2) {
    const words = title.split(/\s+/).filter(w => 
      w.length > 2 && 
      !/^(the|and|with|for|new|used|pre-owned|mint|excellent|great|good)$/i.test(w)
    ).slice(0, 5);
    return { 
      query: words.join(' '), 
      identifiers 
    };
  }
  
  const query = parts.join(' ');
  console.log(`[Watch Comp] Built query: "${query}" from identifiers:`, identifiers);
  
  return { query, identifiers };
}

/**
 * Build query specifically for smartwatches (Apple Watch, Samsung Galaxy Watch, etc.)
 * Filters out accessory terms to get actual watch comps, not bands/chargers
 */
function buildSmartwatchQuery(title: string, identifiers: WatchIdentifiers): { query: string; identifiers: WatchIdentifiers } {
  const lowerTitle = title.toLowerCase();
  
  const isAccessory = SMARTWATCH_ACCESSORY_TERMS.some(term => {
    const regex = new RegExp(`\\b${term}\\b`, 'i');
    return regex.test(lowerTitle);
  });
  
  if (isAccessory && !identifiers.family) {
    console.log(`[Watch Comp] Detected smartwatch ACCESSORY, not the watch itself: "${title}"`);
  }
  
  const brand = identifiers.brand;
  let family = identifiers.family;
  
  if (!family && brand === 'apple' && lowerTitle.includes('watch')) {
    if (lowerTitle.includes('ultra 2')) {
      family = 'watch ultra 2';
    } else if (lowerTitle.includes('ultra')) {
      family = 'watch ultra';
    } else if (lowerTitle.includes('se 2') || lowerTitle.includes('se2')) {
      family = 'watch se 2';
    } else if (lowerTitle.includes('se')) {
      family = 'watch se';
    } else {
      const seriesMatch = lowerTitle.match(/series\s*(\d+)/);
      if (seriesMatch) {
        family = `watch series ${seriesMatch[1]}`;
      } else {
        family = 'watch';
      }
    }
  }
  
  if (!family && brand === 'samsung' && lowerTitle.includes('galaxy watch')) {
    if (lowerTitle.includes('ultra')) {
      family = 'galaxy watch ultra';
    } else {
      const versionMatch = lowerTitle.match(/galaxy\s*watch\s*(\d+)/i);
      if (versionMatch) {
        family = `galaxy watch ${versionMatch[1]}`;
      } else if (lowerTitle.includes('active')) {
        family = 'galaxy watch active';
      }
    }
  }
  
  if (!family && brand === 'garmin') {
    const garminFamilies = WATCH_FAMILIES['garmin'] || [];
    for (const f of garminFamilies) {
      if (lowerTitle.includes(f.toLowerCase())) {
        family = f;
        break;
      }
    }
  }
  
  let sizeInfo = '';
  const sizeMatch = title.match(/(\d{2})\s*mm/i);
  if (sizeMatch) {
    sizeInfo = `${sizeMatch[1]}mm`;
  }
  
  const parts: string[] = [];
  if (brand) {
    parts.push(brand.charAt(0).toUpperCase() + brand.slice(1));
  }
  if (family) {
    const capitalizedFamily = family.split(' ').map(w => 
      w.charAt(0).toUpperCase() + w.slice(1)
    ).join(' ');
    parts.push(capitalizedFamily);
  }
  if (sizeInfo && parts.length < 4) {
    parts.push(sizeInfo);
  }
  
  const query = parts.length >= 2 ? parts.join(' ') : `${brand || ''} smartwatch`.trim();
  
  const negativeTerms = '-band -strap -charger -cable -case -protector -replacement';
  const finalQuery = `${query} ${negativeTerms}`;
  
  console.log(`[Watch Comp] Built SMARTWATCH query: "${finalQuery}" from identifiers:`, { ...identifiers, family });
  
  return { query: finalQuery, identifiers: { ...identifiers, family: family || identifiers.family } };
}

/**
 * Check if a comp title should be excluded (parts, repair, bundles, etc.)
 */
export function shouldExcludeComp(title: string): boolean {
  for (const pattern of EXCLUDED_TITLE_PATTERNS) {
    if (pattern.test(title)) {
      return true;
    }
  }
  return false;
}

/**
 * Clean comps by removing parts/repair/bundles, calculating MEDIAN, trimming outliers
 * Requires >= 8 clean comps for high confidence
 */
export function cleanSoldComps(rawComps: CleanedComp[], searchQuery: string): CleanedCompResult {
  if (!rawComps || rawComps.length === 0) {
    return {
      success: false,
      comps: [],
      medianPrice: null,
      lowPrice: null,
      highPrice: null,
      compCount: 0,
      confidence: 'low',
      reason: 'No comps found',
    };
  }
  
  const filteredComps = rawComps.filter(comp => {
    if (!comp.title) return true;
    return !shouldExcludeComp(comp.title);
  });
  
  console.log(`[Watch Comp] Filtered ${rawComps.length} -> ${filteredComps.length} comps (removed parts/repair/bundles)`);
  
  if (filteredComps.length === 0) {
    return {
      success: false,
      comps: [],
      medianPrice: null,
      lowPrice: null,
      highPrice: null,
      compCount: 0,
      confidence: 'low',
      reason: 'All comps filtered (parts/repair/bundles)',
    };
  }
  
  // Sort comps by price for quartile trimming
  const sortedComps = [...filteredComps].sort((a, b) => a.soldPrice - b.soldPrice);
  
  // Remove bottom 25% and top 25% - keep only middle 50%
  const q1Index = Math.floor(sortedComps.length * 0.25);
  const q3Index = Math.ceil(sortedComps.length * 0.75);
  
  // Mark comps as outliers if in bottom or top quartile
  const trimmedComps = sortedComps.map((comp, index) => ({
    ...comp,
    isOutlier: index < q1Index || index >= q3Index,
  }));
  
  const cleanComps = trimmedComps.filter(c => !c.isOutlier);
  const outlierCount = trimmedComps.filter(c => c.isOutlier).length;
  
  console.log(`[Watch Comp] Quartile trim: removed ${outlierCount} (bottom/top 25%), ${cleanComps.length} middle 50% remain`);
  
  if (cleanComps.length === 0) {
    return {
      success: false,
      comps: trimmedComps,
      medianPrice: null,
      lowPrice: null,
      highPrice: null,
      compCount: 0,
      confidence: 'low',
      reason: 'All comps were outliers after filtering',
    };
  }
  
  const cleanPrices = cleanComps.map(c => c.soldPrice).sort((a, b) => a - b);
  const mid = Math.floor(cleanPrices.length / 2);
  const medianPrice = cleanPrices.length % 2 !== 0
    ? cleanPrices[mid]
    : (cleanPrices[mid - 1] + cleanPrices[mid]) / 2;
  
  const lowPrice = cleanPrices[0];
  const highPrice = cleanPrices[cleanPrices.length - 1];
  
  const MIN_COMPS_FOR_HIGH_CONFIDENCE = 8;
  const confidence = cleanComps.length >= MIN_COMPS_FOR_HIGH_CONFIDENCE ? 'high' : 'low';
  
  return {
    success: true,
    comps: cleanComps,
    medianPrice: Math.round(medianPrice * 100) / 100,
    lowPrice: Math.round(lowPrice * 100) / 100,
    highPrice: Math.round(highPrice * 100) / 100,
    compCount: cleanComps.length,
    confidence,
    reason: confidence === 'low' 
      ? `Low comp confidence (${cleanComps.length}/${MIN_COMPS_FOR_HIGH_CONFIDENCE} required)`
      : undefined,
  };
}

/**
 * Calculate max buy price from cleaned comps
 * Formula: medianPrice - fees - outboundShipping - fixedCosts - targetProfit
 * NO FALLBACK - returns null if no valid comps
 */
export function calculateMaxBuyFromComps(
  cleanedResult: CleanedCompResult,
  options: {
    platformFeeRate?: number;
    outboundShipping?: number;
    fixedCosts?: number;
    targetMargin?: number;
    shippingIn?: number;
  } = {}
): { maxBuy: number | null; reason?: string } {
  const {
    platformFeeRate = 0.15, // Watches use 15% fee rate
    outboundShipping = 0,
    fixedCosts = 5,
    targetMargin = 0.25,
    shippingIn = 0,
  } = options;
  
  if (!cleanedResult.success || cleanedResult.medianPrice === null) {
    return { 
      maxBuy: null, 
      reason: cleanedResult.reason || 'No valid comps for max buy calculation' 
    };
  }
  
  const medianPrice = cleanedResult.medianPrice;
  const platformFees = medianPrice * platformFeeRate;
  const targetProfit = medianPrice * targetMargin;
  
  // Apply 20% safety reduction to max buy price
  const rawMaxBuy = medianPrice - platformFees - outboundShipping - fixedCosts - shippingIn - targetProfit;
  const maxBuy = rawMaxBuy * 0.8;
  
  if (maxBuy <= 0) {
    return { 
      maxBuy: 0, 
      reason: `Max buy would be negative (median $${medianPrice.toFixed(2)} - costs = $${maxBuy.toFixed(2)})` 
    };
  }
  
  return { 
    maxBuy: Math.floor(maxBuy) 
  };
}
