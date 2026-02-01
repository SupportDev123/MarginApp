/**
 * Ximilar Visual AI API Integration
 * For trading card identification, pricing, and grading
 * 
 * Free tier: 3,000 credits/month
 * Docs: https://docs.ximilar.com/services/collectibles_recognition/
 */

const XIMILAR_API_BASE = 'https://api.ximilar.com';

interface XimilarRecord {
  _url?: string;
  _base64?: string;
}

interface XimilarCardResult {
  cardName?: string;
  cardSet?: string;
  cardNumber?: string;
  year?: string;
  publisher?: string;
  language?: string;
  isFoil?: boolean;
  isHolo?: boolean;
  tcgplayerUrl?: string;
  cardmarketUrl?: string;
}

interface XimilarGradingResult {
  overallGrade?: number;
  centeringScore?: number;
  cornersScore?: number;
  edgesScore?: number;
  surfaceScore?: number;
  gradingScale?: 'PSA' | 'BGS';
}

interface XimilarPricingResult {
  marketplace?: string;
  price?: number;
  currency?: string;
  listingUrl?: string;
  condition?: string;
}

export interface XimilarResponse {
  status?: { code: number; text: string };
  records?: Array<{
    _status?: { code: number };
    _objects?: Array<{
      name?: string;
      bound_box?: number[];
      labels?: Array<{ name: string; prob: number }>;
    }>;
    card?: XimilarCardResult;
    grading?: XimilarGradingResult;
    pricing?: XimilarPricingResult[];
    slab?: {
      certNumber?: string;
      grader?: string;
      grade?: string;
    };
  }>;
}

/**
 * Recognize collectibles in an image
 * Detects: trading cards, sports cards, comics, manga, stamps, coins
 */
export async function recognizeCollectibles(
  imageUrl: string,
  apiToken: string
): Promise<XimilarResponse> {
  const response = await fetch(`${XIMILAR_API_BASE}/collectibles/v2/recognize`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      records: [{ _url: imageUrl }]
    })
  });

  if (!response.ok) {
    throw new Error(`Ximilar API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Identify a trading card with full metadata
 * Returns: card name, set, number, year, publisher, TCGPlayer/Cardmarket links
 */
export async function identifyCard(
  imageUrl: string,
  apiToken: string,
  options: {
    lang?: boolean;      // Detect language
    pricing?: boolean;   // Get marketplace listings
    slab?: boolean;      // Analyze graded slab
    slabGrade?: boolean; // Extract grade from slab
  } = {}
): Promise<XimilarResponse> {
  const response = await fetch(`${XIMILAR_API_BASE}/collectibles/v2/card_id`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      records: [{ _url: imageUrl }],
      lang: options.lang ?? true,
      pricing: options.pricing ?? true,
      slab: options.slab ?? false,
      slab_grade: options.slabGrade ?? false
    })
  });

  if (!response.ok) {
    throw new Error(`Ximilar Card ID error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * AI Card Grading - evaluates condition using PSA or Beckett scales
 */
export async function gradeCard(
  imageUrl: string,
  apiToken: string,
  scale: 'PSA' | 'BGS' = 'PSA'
): Promise<XimilarResponse> {
  const response = await fetch(`${XIMILAR_API_BASE}/collectibles/v2/card_grader`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      records: [{ _url: imageUrl }],
      scale: scale.toLowerCase()
    })
  });

  if (!response.ok) {
    throw new Error(`Ximilar Grading error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Card Centering Analysis - precise alignment measurements
 */
export async function analyzeCardCentering(
  imageUrl: string,
  apiToken: string
): Promise<XimilarResponse> {
  const response = await fetch(`${XIMILAR_API_BASE}/collectibles/v2/card_centering`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      records: [{ _url: imageUrl }]
    })
  });

  if (!response.ok) {
    throw new Error(`Ximilar Centering error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get pricing from multiple marketplaces
 * Supports: eBay, Rakuten, Rakuma, Mercari
 */
export async function getCardPricing(
  imageUrl: string,
  apiToken: string,
  marketplaces: string[] = ['ebay']
): Promise<XimilarResponse> {
  const response = await fetch(`${XIMILAR_API_BASE}/collectibles/v2/pricing`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      records: [{ _url: imageUrl }],
      marketplaces
    })
  });

  if (!response.ok) {
    throw new Error(`Ximilar Pricing error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Full card analysis - combines identification, grading, and pricing
 */
export async function analyzeCardFull(
  imageUrl: string,
  apiToken: string
): Promise<{
  identification: XimilarResponse;
  grading: XimilarResponse;
  centering: XimilarResponse;
}> {
  const [identification, grading, centering] = await Promise.all([
    identifyCard(imageUrl, apiToken, { pricing: true, lang: true }),
    gradeCard(imageUrl, apiToken, 'PSA'),
    analyzeCardCentering(imageUrl, apiToken)
  ]);

  return { identification, grading, centering };
}
