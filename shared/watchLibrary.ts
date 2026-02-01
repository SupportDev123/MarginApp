// Internal Watch Recognition Library - 15 brands with style families and band types
// This is the reference data for watch recognition at scan time

export const watchBrands = [
  { id: 'invicta', name: 'Invicta' },
  { id: 'seiko', name: 'Seiko' },
  { id: 'citizen', name: 'Citizen' },
  { id: 'casio', name: 'Casio' },
  { id: 'timex', name: 'Timex' },
  { id: 'bulova', name: 'Bulova' },
  { id: 'orient', name: 'Orient' },
  { id: 'fossil', name: 'Fossil' },
  { id: 'tissot', name: 'Tissot' },
  { id: 'hamilton', name: 'Hamilton' },
  { id: 'tag_heuer', name: 'TAG Heuer' },
  { id: 'omega', name: 'Omega' },
  { id: 'rolex', name: 'Rolex' },
  { id: 'movado', name: 'Movado' },
  { id: 'michael_kors', name: 'Michael Kors' },
] as const;

export type WatchBrandId = typeof watchBrands[number]['id'];

// Style families organized by brand
export const watchFamilies: Record<WatchBrandId, { id: string; name: string }[]> = {
  invicta: [
    { id: 'pro_diver', name: 'Pro Diver' },
    { id: 'grand_diver', name: 'Grand Diver' },
    { id: 'speedway', name: 'Speedway' },
    { id: 'reserve', name: 'Reserve' },
    { id: 'specialty', name: 'Specialty' },
    { id: 'bolt', name: 'Bolt' },
    { id: 'lupah', name: 'Lupah' },
    { id: 's1_rally', name: 'S1 Rally' },
    { id: 'aviator', name: 'Aviator' },
    { id: 'sea_hunter', name: 'Sea Hunter / Subaqua' },
  ],
  seiko: [
    { id: 'seiko_5', name: 'Seiko 5 (Sports)' },
    { id: 'prospex_diver', name: 'Prospex Diver' },
    { id: 'presage', name: 'Presage (Cocktail Time)' },
    { id: 'chronograph', name: 'Chronograph' },
    { id: 'solar', name: 'Solar' },
    { id: 'kinetic', name: 'Kinetic' },
    { id: 'dress', name: 'Dress' },
    { id: 'field', name: 'Field' },
    { id: 'gmt', name: 'GMT' },
    { id: 'vintage', name: 'Vintage Seiko' },
  ],
  citizen: [
    { id: 'eco_drive_dress', name: 'Eco-Drive Dress' },
    { id: 'eco_drive_diver', name: 'Eco-Drive Diver' },
    { id: 'eco_drive_chrono', name: 'Eco-Drive Chronograph' },
    { id: 'promaster', name: 'Promaster' },
    { id: 'automatic', name: 'Automatic' },
    { id: 'axiom', name: 'Axiom / Minimalist' },
    { id: 'calendrier', name: 'Calendrier' },
    { id: 'atomic', name: 'Atomic Time' },
    { id: 'titanium', name: 'Titanium' },
    { id: 'vintage', name: 'Vintage Citizen' },
  ],
  casio: [
    { id: 'gshock_digital', name: 'G-Shock Classic Digital' },
    { id: 'gshock_analog', name: 'G-Shock Analog-Digital' },
    { id: 'edifice', name: 'Edifice' },
    { id: 'vintage_digital', name: 'Vintage Digital (A168/F91W)' },
    { id: 'duro', name: 'Duro (MDV)' },
    { id: 'protrek', name: 'Pro Trek' },
    { id: 'babyg', name: 'Baby-G' },
    { id: 'databank', name: 'Databank' },
    { id: 'wave_ceptor', name: 'Wave Ceptor' },
    { id: 'analog_dress', name: 'Analog Dress' },
  ],
  timex: [
    { id: 'expedition', name: 'Expedition' },
    { id: 'weekender', name: 'Weekender' },
    { id: 'ironman', name: 'Ironman' },
    { id: 'easy_reader', name: 'Easy Reader' },
    { id: 'marlin', name: 'Marlin' },
    { id: 'waterbury', name: 'Waterbury' },
    { id: 'fairfield', name: 'Fairfield' },
    { id: 'q_timex', name: 'Q Timex' },
    { id: 'chronograph', name: 'Chronograph' },
    { id: 'vintage', name: 'Vintage Timex' },
  ],
  bulova: [
    { id: 'precisionist', name: 'Precisionist' },
    { id: 'marine_star', name: 'Marine Star' },
    { id: 'curv', name: 'Curv' },
    { id: 'classic_dress', name: 'Classic Dress' },
    { id: 'sutton', name: 'Sutton' },
    { id: 'lunar_pilot', name: 'Lunar Pilot' },
    { id: 'accutron', name: 'Accutron' },
    { id: 'chronograph', name: 'Chronograph' },
    { id: 'diamond', name: 'Diamond Accents' },
    { id: 'vintage', name: 'Vintage Bulova' },
  ],
  orient: [
    { id: 'bambino', name: 'Bambino' },
    { id: 'mako', name: 'Mako' },
    { id: 'ray', name: 'Ray' },
    { id: 'kamasu', name: 'Kamasu' },
    { id: 'symphony', name: 'Symphony' },
    { id: 'sun_moon', name: 'Sun & Moon' },
    { id: 'open_heart', name: 'Open Heart' },
    { id: 'skeleton', name: 'Skeleton' },
    { id: 'orient_star', name: 'Orient Star' },
    { id: 'vintage', name: 'Vintage Orient' },
  ],
  fossil: [
    { id: 'q_smartwatch', name: 'Fossil Q / Smartwatch' },
    { id: 'grant', name: 'Grant' },
    { id: 'machine', name: 'Machine' },
    { id: 'townsman', name: 'Townsman' },
    { id: 'nate', name: 'Nate' },
    { id: 'minimalist', name: 'Minimalist' },
    { id: 'carlie', name: 'Carlie' },
    { id: 'hybrid', name: 'Hybrid Smartwatch' },
    { id: 'chronograph', name: 'Chronograph' },
    { id: 'fashion_dress', name: 'Fashion Dress' },
  ],
  tissot: [
    { id: 'prx', name: 'PRX' },
    { id: 'le_locle', name: 'Le Locle' },
    { id: 'seastar', name: 'Seastar' },
    { id: 'gentleman', name: 'Gentleman' },
    { id: 't_classic', name: 'T-Classic' },
    { id: 't_sport', name: 'T-Sport' },
    { id: 't_touch', name: 'T-Touch' },
    { id: 'visodate', name: 'Visodate' },
    { id: 'powermatic', name: 'Powermatic 80' },
    { id: 'vintage', name: 'Vintage Tissot' },
  ],
  hamilton: [
    { id: 'khaki_field', name: 'Khaki Field' },
    { id: 'khaki_aviation', name: 'Khaki Aviation' },
    { id: 'khaki_navy', name: 'Khaki Navy' },
    { id: 'jazzmaster', name: 'Jazzmaster' },
    { id: 'ventura', name: 'Ventura' },
    { id: 'american_classic', name: 'American Classic' },
    { id: 'chronograph', name: 'Chronograph' },
    { id: 'skeleton', name: 'Skeleton / Open Heart' },
    { id: 'vintage', name: 'Vintage Hamilton' },
    { id: 'pilot', name: 'Pilot Day/Date' },
  ],
  tag_heuer: [
    { id: 'formula_1', name: 'Formula 1' },
    { id: 'aquaracer', name: 'Aquaracer' },
    { id: 'carrera', name: 'Carrera' },
    { id: 'monaco', name: 'Monaco' },
    { id: 'link', name: 'Link' },
    { id: 'connected', name: 'Connected' },
    { id: 'autavia', name: 'Autavia' },
    { id: 'kirium', name: 'Kirium' },
    { id: 'chronograph', name: 'Chronograph' },
    { id: 'vintage', name: 'Vintage TAG / Heuer' },
  ],
  omega: [
    { id: 'seamaster_300', name: 'Seamaster Diver 300M' },
    { id: 'planet_ocean', name: 'Seamaster Planet Ocean' },
    { id: 'aqua_terra', name: 'Seamaster Aqua Terra' },
    { id: 'speedmaster_pro', name: 'Speedmaster Professional' },
    { id: 'speedmaster_racing', name: 'Speedmaster Racing' },
    { id: 'constellation', name: 'Constellation' },
    { id: 'de_ville', name: 'De Ville' },
    { id: 'railmaster', name: 'Railmaster' },
    { id: 'vintage_dress', name: 'Vintage Omega Dress' },
    { id: 'quartz', name: 'Omega Quartz' },
  ],
  rolex: [
    { id: 'submariner', name: 'Submariner' },
    { id: 'gmt_master', name: 'GMT-Master II' },
    { id: 'datejust', name: 'Datejust' },
    { id: 'day_date', name: 'Day-Date' },
    { id: 'daytona', name: 'Daytona' },
    { id: 'oyster_perpetual', name: 'Oyster Perpetual' },
    { id: 'explorer', name: 'Explorer / Explorer II' },
    { id: 'sea_dweller', name: 'Sea-Dweller' },
    { id: 'yacht_master', name: 'Yacht-Master' },
    { id: 'air_king', name: 'Air-King / Milgauss' },
  ],
  movado: [
    { id: 'museum_classic', name: 'Museum Classic' },
    { id: 'museum_sport', name: 'Museum Sport' },
    { id: 'bold', name: 'Bold' },
    { id: 'se', name: 'SE / Modern Sport' },
    { id: 'heritage', name: 'Heritage Series' },
    { id: 'chronograph', name: 'Chronograph' },
    { id: 'diamond', name: 'Diamond Accents' },
    { id: 'two_tone', name: 'Two-Tone Dress' },
    { id: 'womens_museum', name: "Women's Museum" },
    { id: 'vintage', name: 'Vintage Movado' },
  ],
  michael_kors: [
    { id: 'runway', name: 'Runway' },
    { id: 'bradshaw', name: 'Bradshaw' },
    { id: 'parker', name: 'Parker' },
    { id: 'lexington', name: 'Lexington' },
    { id: 'everest', name: 'Everest' },
    { id: 'dylan', name: 'Dylan' },
    { id: 'slim_runway', name: 'Slim Runway' },
    { id: 'smartwatch', name: 'MK Smartwatch' },
    { id: 'fashion_chrono', name: 'Fashion Chronograph' },
    { id: 'womens_bracelet', name: "Women's Dress/Bracelet" },
  ],
};

// Band/Bracelet types for recognition - 15 types (8 metal, 7 non-metal)
export const bandTypes = [
  // METAL BANDS (1-8)
  { id: 'oyster', name: 'Oyster-style 3-link', description: 'Classic 3-link sport bracelet', category: 'metal' },
  { id: 'jubilee', name: 'Jubilee 5-link', description: 'Dressy 5-link bracelet', category: 'metal' },
  { id: 'president', name: 'President-style', description: 'Semi-circular links formal bracelet', category: 'metal' },
  { id: 'engineer', name: 'Engineer bracelet', description: 'Chunky multi-link industrial style', category: 'metal' },
  { id: 'mesh', name: 'Milanese mesh', description: 'Woven metal mesh strap', category: 'metal' },
  { id: 'beads_of_rice', name: 'Beads-of-rice', description: 'Vintage-style multi-row bracelet', category: 'metal' },
  { id: 'two_tone', name: 'Two-tone metal', description: 'Mixed gold/silver metal bracelet', category: 'metal' },
  { id: 'integrated', name: 'Integrated bracelet', description: 'PRX-style no-lugs design', category: 'metal' },
  // NON-METAL BANDS (9-15)
  { id: 'rubber_diver', name: 'Rubber diver strap', description: 'Vented/tropic dive strap', category: 'non-metal' },
  { id: 'nato', name: 'NATO strap', description: 'Striped nylon pass-through', category: 'non-metal' },
  { id: 'leather', name: 'Leather strap', description: 'Dress leather band', category: 'non-metal' },
  { id: 'silicone', name: 'Silicone sport strap', description: 'Smooth silicone sport band', category: 'non-metal' },
  { id: 'fabric', name: 'Fabric strap', description: 'Single-piece fabric/canvas', category: 'non-metal' },
  { id: 'resin', name: 'Resin strap', description: 'G-Shock style resin band', category: 'non-metal' },
  { id: 'womens_jewelry', name: "Women's bracelet", description: 'Jewelry-style bracelet links', category: 'non-metal' },
  { id: 'unknown', name: 'Unknown', description: 'Band type not identified', category: 'unknown' },
] as const;

export type BandTypeId = typeof bandTypes[number]['id'];

// Common bezel types for watches
export const bezelTypes = [
  { id: 'fluted', name: 'Fluted', description: 'Ridged vertical lines (Rolex signature)', premiumIndicator: true },
  { id: 'smooth', name: 'Smooth', description: 'Plain polished or brushed bezel', premiumIndicator: false },
  { id: 'diver', name: 'Diver/Rotating', description: 'Unidirectional rotating timing bezel', premiumIndicator: false },
  { id: 'tachymeter', name: 'Tachymeter', description: 'Speed-measuring scale bezel', premiumIndicator: false },
  { id: 'gmt', name: 'GMT/Pepsi/Coke', description: '24-hour dual timezone bezel', premiumIndicator: true },
  { id: 'diamond', name: 'Diamond/Gem-set', description: 'Factory or aftermarket gem bezel', premiumIndicator: true },
  { id: 'ceramic', name: 'Ceramic', description: 'Scratch-resistant ceramic insert', premiumIndicator: true },
  { id: 'coin_edge', name: 'Coin Edge', description: 'Serrated edge for grip', premiumIndicator: false },
  { id: 'fixed', name: 'Fixed Bezel', description: 'Non-rotating decorative bezel', premiumIndicator: false },
  { id: 'unknown', name: 'Unknown', description: 'Bezel type not identified', premiumIndicator: false },
] as const;

export type BezelTypeId = typeof bezelTypes[number]['id'];

// Common case sizes for watches (mm) - 28mm to 60mm inclusive
export const caseSizes = [
  'Unknown',
  '28mm',
  '29mm',
  '30mm',
  '31mm',
  '32mm',
  '33mm',
  '34mm',
  '35mm',
  '36mm',
  '37mm',
  '38mm',
  '39mm',
  '40mm',
  '41mm',
  '42mm',
  '43mm',
  '44mm',
  '45mm',
  '46mm',
  '47mm',
  '48mm',
  '49mm',
  '50mm',
  '51mm',
  '52mm',
  '53mm',
  '54mm',
  '55mm',
  '56mm',
  '57mm',
  '58mm',
  '59mm',
  '60mm',
] as const;

export type CaseSize = typeof caseSizes[number];

// Helper to get brand by ID
export function getBrandById(brandId: string) {
  return watchBrands.find(b => b.id === brandId);
}

// Helper to get families for a brand
export function getFamiliesForBrand(brandId: string) {
  return watchFamilies[brandId as WatchBrandId] || [];
}

// Helper to get band type by ID
export function getBandTypeById(bandId: string) {
  return bandTypes.find(b => b.id === bandId);
}

// Band suggestion weights: higher = stronger correlation
// These are soft signals for reranking, not hard filters
type BandSuggestionWeight = 'strong' | 'medium' | 'weak';
const WEIGHT_VALUES: Record<BandSuggestionWeight, number> = { strong: 0.9, medium: 0.6, weak: 0.3 };

// Family-level band suggestions (takes priority over brand-level)
const familyBandSuggestions: Record<string, Record<string, BandSuggestionWeight>> = {
  // Tissot PRX - integrated bracelet is signature
  'tissot:prx': { integrated: 'strong', leather: 'weak' },
  
  // Rolex families
  'rolex:datejust': { jubilee: 'strong', oyster: 'medium' },
  'rolex:day_date': { president: 'strong' },
  'rolex:submariner': { oyster: 'strong', rubber_diver: 'medium' },
  'rolex:gmt_master': { oyster: 'strong', jubilee: 'medium' },
  'rolex:daytona': { oyster: 'strong', leather: 'medium' },
  'rolex:oyster_perpetual': { oyster: 'strong' },
  'rolex:explorer': { oyster: 'strong' },
  'rolex:sea_dweller': { oyster: 'strong' },
  'rolex:yacht_master': { oyster: 'strong', rubber_diver: 'medium' },
  
  // Casio G-Shock families - resin is signature
  'casio:gshock_digital': { resin: 'strong' },
  'casio:gshock_analog': { resin: 'strong' },
  'casio:babyg': { resin: 'strong' },
  'casio:vintage_digital': { resin: 'strong', mesh: 'weak' },
  'casio:duro': { rubber_diver: 'strong', oyster: 'medium' },
  
  // Seiko families
  'seiko:prospex_diver': { oyster: 'strong', rubber_diver: 'strong', nato: 'medium' },
  'seiko:seiko_5': { oyster: 'medium', nato: 'medium', jubilee: 'weak' },
  'seiko:presage': { leather: 'strong', mesh: 'medium' },
  'seiko:dress': { leather: 'strong' },
  
  // Omega families
  'omega:seamaster_300': { oyster: 'strong', rubber_diver: 'strong', nato: 'medium' },
  'omega:planet_ocean': { oyster: 'strong', rubber_diver: 'strong' },
  'omega:speedmaster_pro': { oyster: 'strong', nato: 'strong', leather: 'medium' },
  'omega:constellation': { integrated: 'strong' },
  'omega:de_ville': { leather: 'strong' },
  
  // Orient families
  'orient:bambino': { leather: 'strong' },
  'orient:mako': { oyster: 'strong', rubber_diver: 'medium' },
  'orient:ray': { oyster: 'strong', rubber_diver: 'medium' },
  'orient:kamasu': { oyster: 'strong' },
  
  // Timex families
  'timex:weekender': { nato: 'strong', leather: 'medium', fabric: 'medium' },
  'timex:expedition': { fabric: 'strong', nato: 'medium', leather: 'medium' },
  'timex:ironman': { silicone: 'strong', resin: 'medium' },
  'timex:marlin': { leather: 'strong', mesh: 'medium' },
  
  // Hamilton families
  'hamilton:khaki_field': { nato: 'strong', leather: 'medium', fabric: 'medium' },
  'hamilton:khaki_aviation': { leather: 'strong', nato: 'medium' },
  'hamilton:jazzmaster': { leather: 'strong' },
  
  // TAG Heuer families
  'tag_heuer:aquaracer': { oyster: 'strong', rubber_diver: 'medium' },
  'tag_heuer:formula_1': { oyster: 'strong', rubber_diver: 'medium' },
  'tag_heuer:carrera': { oyster: 'strong', leather: 'medium' },
  'tag_heuer:monaco': { leather: 'strong' },
  
  // Michael Kors - women's jewelry style common
  'michael_kors:runway': { oyster: 'medium', two_tone: 'medium', womens_jewelry: 'medium' },
  'michael_kors:bradshaw': { oyster: 'medium', two_tone: 'medium' },
  'michael_kors:parker': { womens_jewelry: 'strong', two_tone: 'medium' },
  'michael_kors:womens_bracelet': { womens_jewelry: 'strong' },
  
  // Movado families
  'movado:museum_classic': { leather: 'strong', mesh: 'medium' },
  'movado:museum_sport': { oyster: 'medium', rubber_diver: 'medium' },
  'movado:bold': { mesh: 'medium', silicone: 'medium' },
};

// Brand-level defaults (used when family not specified or no family match)
const brandBandDefaults: Record<string, Record<string, BandSuggestionWeight>> = {
  rolex: { oyster: 'strong', jubilee: 'medium' },
  omega: { oyster: 'medium', leather: 'medium' },
  casio: { resin: 'medium', silicone: 'weak' },
  seiko: { oyster: 'medium', leather: 'medium' },
  citizen: { oyster: 'weak', leather: 'weak' },
  tissot: { leather: 'medium', oyster: 'weak' },
  hamilton: { leather: 'medium', nato: 'medium' },
  orient: { leather: 'medium', oyster: 'medium' },
  timex: { nato: 'medium', leather: 'weak' },
  fossil: { leather: 'medium' },
  bulova: { leather: 'medium', oyster: 'weak' },
  tag_heuer: { oyster: 'medium', leather: 'weak' },
  movado: { leather: 'medium', mesh: 'weak' },
  invicta: { oyster: 'medium', rubber_diver: 'weak' },
  michael_kors: { oyster: 'weak', two_tone: 'weak', womens_jewelry: 'weak' },
};

// Get band suggestions for a brand/family combo - returns sorted array by weight
export function getBandSuggestions(brandId: string | null, familyId: string | null): { bandId: string; weight: number }[] {
  const suggestions: Record<string, number> = {};
  
  // Start with brand-level defaults
  if (brandId && brandBandDefaults[brandId]) {
    for (const [bandId, weight] of Object.entries(brandBandDefaults[brandId])) {
      suggestions[bandId] = WEIGHT_VALUES[weight];
    }
  }
  
  // Override/augment with family-level if available
  if (brandId && familyId) {
    const familyKey = `${brandId}:${familyId}`;
    if (familyBandSuggestions[familyKey]) {
      for (const [bandId, weight] of Object.entries(familyBandSuggestions[familyKey])) {
        suggestions[bandId] = WEIGHT_VALUES[weight]; // Family takes priority
      }
    }
  }
  
  // Convert to sorted array
  return Object.entries(suggestions)
    .map(([bandId, weight]) => ({ bandId, weight }))
    .sort((a, b) => b.weight - a.weight);
}

// Get the top suggested band for auto-selection (or null if no strong suggestion)
export function getAutoSuggestedBand(brandId: string | null, familyId: string | null): string | null {
  const suggestions = getBandSuggestions(brandId, familyId);
  // Only auto-select if there's a strong suggestion (weight >= 0.9)
  if (suggestions.length > 0 && suggestions[0].weight >= WEIGHT_VALUES.strong) {
    return suggestions[0].bandId;
  }
  return null;
}

// Recognition result type
export interface WatchRecognitionResult {
  suggestedBrand: string | null;
  suggestedFamily: string | null;
  suggestedBand: string | null;
  brandConfidence: number;
  familyConfidence: number;
  bandConfidence: number;
  topMatches: {
    brand: string;
    family: string;
    similarity: number;
  }[];
}

// =============================================================================
// MOVEMENT TYPES
// =============================================================================
export const movementTypes = ['quartz', 'automatic', 'manual', 'unknown'] as const;
export type MovementType = typeof movementTypes[number];

// Known movement types by brand/family - used for auto-detection
// 'auto' = automatic/mechanical, 'quartz' = quartz/battery, 'mixed' = family has both
const familyMovementTypes: Record<string, 'auto' | 'quartz' | 'mixed' | 'manual'> = {
  // Seiko - mostly mechanical for these families
  'seiko:seiko_5': 'auto',
  'seiko:prospex_diver': 'auto',
  'seiko:presage': 'auto',
  'seiko:solar': 'quartz', // Solar is quartz-based
  'seiko:kinetic': 'quartz', // Kinetic is quartz with capacitor
  
  // Citizen - mostly Eco-Drive (solar quartz)
  'citizen:eco_drive_dress': 'quartz',
  'citizen:eco_drive_diver': 'quartz',
  'citizen:eco_drive_chrono': 'quartz',
  'citizen:promaster': 'quartz',
  'citizen:automatic': 'auto',
  
  // Casio - all quartz
  'casio:gshock_digital': 'quartz',
  'casio:gshock_analog': 'quartz',
  'casio:edifice': 'quartz',
  'casio:vintage_digital': 'quartz',
  'casio:duro': 'quartz',
  'casio:protrek': 'quartz',
  'casio:babyg': 'quartz',
  
  // Orient - all automatic
  'orient:bambino': 'auto',
  'orient:mako': 'auto',
  'orient:ray': 'auto',
  'orient:kamasu': 'auto',
  'orient:orient_star': 'auto',
  'orient:sun_moon': 'auto',
  
  // Rolex - all automatic (except some vintage)
  'rolex:submariner': 'auto',
  'rolex:gmt_master': 'auto',
  'rolex:datejust': 'auto',
  'rolex:day_date': 'auto',
  'rolex:daytona': 'auto',
  'rolex:oyster_perpetual': 'auto',
  'rolex:explorer': 'auto',
  'rolex:sea_dweller': 'auto',
  'rolex:yacht_master': 'auto',
  
  // Omega - mostly automatic
  'omega:seamaster_300': 'auto',
  'omega:planet_ocean': 'auto',
  'omega:aqua_terra': 'auto',
  'omega:speedmaster_pro': 'manual', // Moonwatch is manual-wind
  'omega:speedmaster_racing': 'auto',
  'omega:constellation': 'auto',
  'omega:de_ville': 'auto',
  'omega:quartz': 'quartz',
  
  // Tissot - mixed
  'tissot:prx': 'mixed', // Has quartz and Powermatic
  'tissot:powermatic': 'auto',
  'tissot:seastar': 'mixed',
  'tissot:le_locle': 'auto',
  
  // Hamilton - mostly automatic
  'hamilton:khaki_field': 'auto',
  'hamilton:khaki_aviation': 'auto',
  'hamilton:jazzmaster': 'auto',
  'hamilton:ventura': 'mixed', // Has quartz and auto
  
  // TAG Heuer - mixed
  'tag_heuer:formula_1': 'quartz',
  'tag_heuer:aquaracer': 'mixed',
  'tag_heuer:carrera': 'auto',
  'tag_heuer:monaco': 'auto',
  
  // Movado - mostly quartz
  'movado:museum_classic': 'quartz',
  'movado:museum_sport': 'quartz',
  'movado:bold': 'quartz',
  
  // Fashion brands - mostly quartz
  'fossil:grant': 'quartz',
  'fossil:machine': 'quartz',
  'fossil:q_smartwatch': 'quartz',
  'michael_kors:runway': 'quartz',
  'michael_kors:bradshaw': 'quartz',
  
  // Invicta - mixed
  'invicta:pro_diver': 'mixed', // Auto and quartz versions
  
  // Timex - mostly quartz
  'timex:weekender': 'quartz',
  'timex:expedition': 'quartz',
  'timex:ironman': 'quartz',
  'timex:marlin': 'auto', // Marlin reissue is automatic
  'timex:q_timex': 'quartz',
  
  // Bulova - mixed
  'bulova:precisionist': 'quartz',
  'bulova:accutron': 'quartz', // Original was tuning fork, modern is quartz
  'bulova:lunar_pilot': 'quartz',
};

// Brand-level movement defaults
const brandMovementDefaults: Record<string, 'auto' | 'quartz' | 'mixed'> = {
  rolex: 'auto',
  omega: 'auto',
  orient: 'auto',
  casio: 'quartz',
  citizen: 'quartz', // Eco-Drive
  movado: 'quartz',
  michael_kors: 'quartz',
  fossil: 'quartz',
  timex: 'quartz',
  seiko: 'mixed',
  tissot: 'mixed',
  hamilton: 'auto',
  tag_heuer: 'mixed',
  invicta: 'mixed',
  bulova: 'mixed',
};

/**
 * Get suggested movement type for a brand/family
 * Returns 'unknown' if mixed or no data available
 */
export function getSuggestedMovementType(brandId: string | null, familyId: string | null): MovementType {
  if (brandId && familyId) {
    const familyKey = `${brandId}:${familyId}`;
    const familyMovement = familyMovementTypes[familyKey];
    if (familyMovement === 'auto') return 'automatic';
    if (familyMovement === 'quartz') return 'quartz';
    if (familyMovement === 'mixed') return 'unknown'; // Don't guess
  }
  
  if (brandId) {
    const brandMovement = brandMovementDefaults[brandId];
    if (brandMovement === 'auto') return 'automatic';
    if (brandMovement === 'quartz') return 'quartz';
  }
  
  return 'unknown';
}

// =============================================================================
// WEAR ASSESSMENT
// =============================================================================
export const wearLevels = ['clean', 'moderate', 'heavy', 'unknown'] as const;
export type WearLevel = typeof wearLevels[number];

export const wearLevelLabels: Record<WearLevel, string> = {
  clean: 'Appears Clean',
  moderate: 'Moderate Wear',
  heavy: 'Heavy Wear',
  unknown: 'Unknown',
};

export const wearLevelDescriptions: Record<WearLevel, string> = {
  clean: 'Minimal visible wear on case, crystal, bezel, and bracelet',
  moderate: 'Some visible scratches or marks on case, crystal, or bracelet',
  heavy: 'Significant wear, deep scratches, or damage visible',
  unknown: 'Wear level could not be determined from images',
};

// =============================================================================
// BOX AND PAPERS
// =============================================================================
export const boxPapersOptions = ['yes', 'no', 'unknown'] as const;
export type BoxPapersOption = typeof boxPapersOptions[number];

export const boxPapersLabels: Record<BoxPapersOption, string> = {
  yes: 'Box & Papers Included',
  no: 'Watch Only',
  unknown: 'Unknown',
};

export const boxPapersContext: Record<BoxPapersOption, string> = {
  yes: 'Original box and papers can add significant value, especially for luxury brands',
  no: 'Missing box/papers is common but may reduce value for collectors',
  unknown: 'Box and papers status is unknown - this can affect value',
};

// =============================================================================
// AFTERMARKET COMPONENT FLAGS
// =============================================================================
export const aftermarketFlags = [
  'aftermarket_band',
  'aftermarket_dial',
  'aftermarket_bezel',
  'aftermarket_crystal',
  'aftermarket_hands',
  'aftermarket_crown',
  'non_original_clasp',
  'service_dial', // Replacement dial from service
] as const;
export type AftermarketFlag = typeof aftermarketFlags[number];

export const aftermarketFlagLabels: Record<AftermarketFlag, string> = {
  aftermarket_band: 'Band may be aftermarket',
  aftermarket_dial: 'Dial may be aftermarket',
  aftermarket_bezel: 'Bezel may be aftermarket',
  aftermarket_crystal: 'Crystal may be aftermarket',
  aftermarket_hands: 'Hands may be aftermarket',
  aftermarket_crown: 'Crown may be aftermarket',
  non_original_clasp: 'Clasp may not be original',
  service_dial: 'Dial may be a service replacement',
};

// =============================================================================
// COUNTERFEIT PREVALENCE CONTEXT
// =============================================================================
// Educational only - never accusatory, just informational context
export interface CounterfeitContext {
  riskLevel: 'high' | 'moderate' | 'low';
  note: string;
}

// High-risk model families for counterfeiting (educational context)
const counterfeitPrevalence: Record<string, CounterfeitContext> = {
  // Rolex - very high counterfeit prevalence
  'rolex:submariner': { 
    riskLevel: 'high', 
    note: 'Submariner is one of the most replicated watches. Verification of authenticity is strongly recommended before purchase.' 
  },
  'rolex:daytona': { 
    riskLevel: 'high', 
    note: 'Daytona is heavily counterfeited. Professional authentication recommended.' 
  },
  'rolex:datejust': { 
    riskLevel: 'high', 
    note: 'Datejust is commonly replicated. Serial/model verification recommended.' 
  },
  'rolex:gmt_master': { 
    riskLevel: 'high', 
    note: 'GMT-Master II is frequently counterfeited. Authentication advised.' 
  },
  'rolex:day_date': { 
    riskLevel: 'high', 
    note: 'Day-Date ("President") is a common counterfeit target.' 
  },
  
  // Omega
  'omega:seamaster_300': { 
    riskLevel: 'moderate', 
    note: 'Seamaster has some counterfeit presence, especially "James Bond" editions.' 
  },
  'omega:speedmaster_pro': { 
    riskLevel: 'moderate', 
    note: 'Speedmaster Professional has some counterfeit presence.' 
  },
  
  // TAG Heuer
  'tag_heuer:carrera': { 
    riskLevel: 'moderate', 
    note: 'Carrera is occasionally counterfeited.' 
  },
  
  // Invicta - different concern: often confused with luxury brands
  'invicta:pro_diver': { 
    riskLevel: 'low', 
    note: 'Note: Invicta Pro Diver is an affordable watch that resembles Rolex Submariner styling, but is not a Rolex.' 
  },
};

// Brand-level counterfeit context
const brandCounterfeitContext: Record<string, CounterfeitContext> = {
  rolex: { 
    riskLevel: 'high', 
    note: 'Rolex is the most counterfeited watch brand. Professional authentication is recommended for any purchase.' 
  },
  omega: { 
    riskLevel: 'moderate', 
    note: 'Omega has moderate counterfeit presence. Verification recommended for high-value models.' 
  },
  tag_heuer: { 
    riskLevel: 'moderate', 
    note: 'TAG Heuer has some counterfeit presence in the market.' 
  },
};

/**
 * Get counterfeit prevalence context for a brand/family
 * Returns null if no specific context (low-risk or unknown)
 */
export function getCounterfeitContext(brandId: string | null, familyId: string | null): CounterfeitContext | null {
  // Check family-specific first
  if (brandId && familyId) {
    const familyKey = `${brandId}:${familyId}`;
    if (counterfeitPrevalence[familyKey]) {
      return counterfeitPrevalence[familyKey];
    }
  }
  
  // Fall back to brand-level
  if (brandId && brandCounterfeitContext[brandId]) {
    return brandCounterfeitContext[brandId];
  }
  
  return null;
}

// =============================================================================
// CASE SIZE CONTEXT
// =============================================================================
export const caseSizeUnknownContext = 
  'Case size is unknown. Market value can vary significantly by size (e.g., 36mm vs 41mm Datejust). ' +
  'Recommend measuring or selecting size for more accurate comp matching.';
