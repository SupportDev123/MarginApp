// Sports Card Recognition Library
// Grader taxonomy, serial number parsing, and example patterns

// Major grading companies
export const cardGraders = [
  { id: 'psa', name: 'PSA', fullName: 'Professional Sports Authenticator' },
  { id: 'bgs', name: 'BGS', fullName: 'Beckett Grading Services' },
  { id: 'sgc', name: 'SGC', fullName: 'Sportscard Guaranty Company' },
  { id: 'cgc', name: 'CGC', fullName: 'Certified Guaranty Company' },
  { id: 'hga', name: 'HGA', fullName: 'Hybrid Grading Approach' },
  { id: 'csg', name: 'CSG', fullName: 'Certified Sports Guaranty' },
  { id: 'isa', name: 'ISA', fullName: 'International Sports Authentication' },
  { id: 'gma', name: 'GMA', fullName: 'GMA Grading' },
  { id: 'unknown', name: 'Other/Unknown', fullName: 'Unknown Grading Company' },
] as const;

export type CardGraderId = typeof cardGraders[number]['id'];

// Common grade scales by grader
export const gradeScales: Record<string, { grade: string; label: string }[]> = {
  psa: [
    { grade: '10', label: 'GEM MT 10' },
    { grade: '9', label: 'MINT 9' },
    { grade: '8', label: 'NM-MT 8' },
    { grade: '7', label: 'NM 7' },
    { grade: '6', label: 'EX-MT 6' },
    { grade: '5', label: 'EX 5' },
    { grade: '4', label: 'VG-EX 4' },
    { grade: '3', label: 'VG 3' },
    { grade: '2', label: 'GOOD 2' },
    { grade: '1', label: 'PR 1' },
    { grade: 'A', label: 'Authentic' },
  ],
  bgs: [
    { grade: '10', label: 'Pristine 10' },
    { grade: '9.5', label: 'GEM MINT 9.5' },
    { grade: '9', label: 'MINT 9' },
    { grade: '8.5', label: 'NM-MT+ 8.5' },
    { grade: '8', label: 'NM-MT 8' },
    { grade: '7.5', label: 'NM+ 7.5' },
    { grade: '7', label: 'NM 7' },
    { grade: '6.5', label: 'EX-NM+ 6.5' },
    { grade: '6', label: 'EX-NM 6' },
  ],
  sgc: [
    { grade: '10', label: 'GEM MINT 10' },
    { grade: '9.5', label: 'MINT+ 9.5' },
    { grade: '9', label: 'MINT 9' },
    { grade: '8.5', label: 'NM-MT+ 8.5' },
    { grade: '8', label: 'NM-MT 8' },
    { grade: '7', label: 'NM 7' },
    { grade: '6', label: 'EX-NM 6' },
  ],
};

// Popular card sets for auto-suggestion
export const popularSets = [
  // Basketball
  { id: 'prizm', name: 'Panini Prizm', sport: 'basketball' },
  { id: 'select', name: 'Panini Select', sport: 'basketball' },
  { id: 'mosaic', name: 'Panini Mosaic', sport: 'basketball' },
  { id: 'donruss', name: 'Donruss', sport: 'basketball' },
  { id: 'optic', name: 'Donruss Optic', sport: 'basketball' },
  { id: 'hoops', name: 'NBA Hoops', sport: 'basketball' },
  { id: 'chronicles', name: 'Panini Chronicles', sport: 'basketball' },
  { id: 'contenders', name: 'Panini Contenders', sport: 'basketball' },
  { id: 'court_kings', name: 'Court Kings', sport: 'basketball' },
  { id: 'revolution', name: 'Revolution', sport: 'basketball' },
  { id: 'national_treasures_bball', name: 'National Treasures', sport: 'basketball' },
  // Football
  { id: 'prizm_football', name: 'Panini Prizm Football', sport: 'football' },
  { id: 'select_football', name: 'Panini Select Football', sport: 'football' },
  { id: 'mosaic_football', name: 'Panini Mosaic Football', sport: 'football' },
  { id: 'donruss_football', name: 'Donruss Football', sport: 'football' },
  { id: 'optic_football', name: 'Donruss Optic Football', sport: 'football' },
  { id: 'contenders_football', name: 'Panini Contenders Football', sport: 'football' },
  { id: 'score', name: 'Score Football', sport: 'football' },
  { id: 'absolute', name: 'Absolute Football', sport: 'football' },
  { id: 'national_treasures_fb', name: 'National Treasures Football', sport: 'football' },
  // Baseball
  { id: 'topps_chrome', name: 'Topps Chrome', sport: 'baseball' },
  { id: 'topps_series1', name: 'Topps Series 1', sport: 'baseball' },
  { id: 'topps_series2', name: 'Topps Series 2', sport: 'baseball' },
  { id: 'topps_update', name: 'Topps Update', sport: 'baseball' },
  { id: 'bowman', name: 'Bowman', sport: 'baseball' },
  { id: 'bowman_chrome', name: 'Bowman Chrome', sport: 'baseball' },
  { id: 'topps_heritage', name: 'Topps Heritage', sport: 'baseball' },
  { id: 'topps_stadium_club', name: 'Stadium Club', sport: 'baseball' },
  { id: 'topps_finest', name: 'Topps Finest', sport: 'baseball' },
  // Soccer
  { id: 'prizm_soccer', name: 'Panini Prizm Soccer', sport: 'soccer' },
  { id: 'select_soccer', name: 'Panini Select Soccer', sport: 'soccer' },
  { id: 'topps_chrome_soccer', name: 'Topps Chrome UCL', sport: 'soccer' },
  // Hockey
  { id: 'upper_deck', name: 'Upper Deck', sport: 'hockey' },
  { id: 'young_guns', name: 'Young Guns', sport: 'hockey' },
  { id: 'spx', name: 'SPx', sport: 'hockey' },
] as const;

// Common parallels/variants
export const parallels = [
  { id: 'base', name: 'Base' },
  // Prizm/Optic parallels
  { id: 'silver_prizm', name: 'Silver Prizm' },
  { id: 'red_prizm', name: 'Red Prizm' },
  { id: 'blue_prizm', name: 'Blue Prizm' },
  { id: 'green_prizm', name: 'Green Prizm' },
  { id: 'orange_prizm', name: 'Orange Prizm' },
  { id: 'pink_prizm', name: 'Pink Prizm' },
  { id: 'gold_prizm', name: 'Gold Prizm' },
  { id: 'black_prizm', name: 'Black Prizm' },
  { id: 'tiger_stripe', name: 'Tiger Stripe' },
  { id: 'camo', name: 'Camo' },
  { id: 'mojo', name: 'Mojo' },
  { id: 'snakeskin', name: 'Snakeskin' },
  { id: 'shimmer', name: 'Shimmer' },
  { id: 'fast_break', name: 'Fast Break' },
  // Topps Chrome parallels
  { id: 'refractor', name: 'Refractor' },
  { id: 'gold_refractor', name: 'Gold Refractor' },
  { id: 'orange_refractor', name: 'Orange Refractor' },
  { id: 'green_refractor', name: 'Green Refractor' },
  { id: 'blue_refractor', name: 'Blue Refractor' },
  { id: 'red_refractor', name: 'Red Refractor' },
  { id: 'purple_refractor', name: 'Purple Refractor' },
  { id: 'pink_refractor', name: 'Pink Refractor' },
  { id: 'xfractor', name: 'X-Fractor' },
  { id: 'superfractor', name: 'Superfractor' },
  { id: 'sepia', name: 'Sepia' },
  { id: 'aqua', name: 'Aqua' },
  { id: 'prism', name: 'Prism' },
  // Special types
  { id: 'auto', name: 'Autograph' },
  { id: 'patch', name: 'Patch/Relic' },
  { id: 'auto_patch', name: 'Auto Patch' },
  { id: 'rpa', name: 'Rookie Patch Auto (RPA)' },
  { id: 'printing_plate', name: 'Printing Plate' },
  { id: 'one_of_one', name: '1/1' },
  { id: 'unknown', name: 'Unknown' },
] as const;

// Serial number regex patterns with examples
// These help the system distinguish serial numbers from card numbers
export const serialNumberPatterns = [
  // Standard formats: "123/499", "001/100", "99/199"
  { pattern: /(\d{1,4})\s*\/\s*(\d{2,5})/, example: '123/499', location: 'front or back' },
  // With hash: "#123/499"
  { pattern: /#\s*(\d{1,4})\s*\/\s*(\d{2,5})/, example: '#15/75', location: 'front' },
  // Spelled out: "Card 001 of 100"
  { pattern: /(?:card|no\.?|#)\s*(\d{1,4})\s*(?:of|\/)\s*(\d{2,5})/i, example: 'Card 001 of 100', location: 'back' },
  // With space: "23 / 50"
  { pattern: /(\d{1,4})\s+\/\s+(\d{2,5})/, example: '23 / 50', location: 'front' },
  // Leading zeros: "001/100"
  { pattern: /(0\d{1,3})\s*\/\s*(\d{2,5})/, example: '001/100', location: 'front or back' },
];

// Example serial number library for training/recognition
export const serialNumberExamples = [
  // Front placements
  { text: '123/499', serialNumber: '123', serialTotal: '499', location: 'front-bottom', fontStyle: 'foil' },
  { text: '#15/75', serialNumber: '15', serialTotal: '75', location: 'front-top', fontStyle: 'gold-foil' },
  { text: '001/100', serialNumber: '001', serialTotal: '100', location: 'front-corner', fontStyle: 'silver-stamp' },
  { text: '99/199', serialNumber: '99', serialTotal: '199', location: 'front-center', fontStyle: 'holographic' },
  { text: '7/10', serialNumber: '7', serialTotal: '10', location: 'front-bottom', fontStyle: 'black-marker' },
  // Back placements
  { text: 'Card 001 of 100', serialNumber: '001', serialTotal: '100', location: 'back-bottom', fontStyle: 'printed' },
  { text: '250/299', serialNumber: '250', serialTotal: '299', location: 'back-corner', fontStyle: 'gold-stamp' },
  { text: '#1/1', serialNumber: '1', serialTotal: '1', location: 'front-center', fontStyle: 'gold-foil' },
  { text: '50 / 99', serialNumber: '50', serialTotal: '99', location: 'back-top', fontStyle: 'embossed' },
  { text: '175/500', serialNumber: '175', serialTotal: '500', location: 'front-side', fontStyle: 'silver-foil' },
];

// Parse serial number from text
export function parseSerialNumber(text: string): { serialNumber: string; serialTotal: string } | null {
  if (!text) return null;
  
  for (const { pattern } of serialNumberPatterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[2]) {
      return {
        serialNumber: match[1].trim(),
        serialTotal: match[2].trim(),
      };
    }
  }
  return null;
}

// Detect if text contains a serial number
export function hasSerialNumber(text: string): boolean {
  return parseSerialNumber(text) !== null;
}

// Get grader by ID
export function getGraderById(graderId: string) {
  return cardGraders.find(g => g.id === graderId);
}

// Get grades for a grader
export function getGradesForGrader(graderId: string) {
  return gradeScales[graderId] || gradeScales.psa; // Default to PSA scale
}

// Get set by ID
export function getSetById(setId: string) {
  return popularSets.find(s => s.id === setId);
}

// Get parallel by ID
export function getParallelById(parallelId: string) {
  return parallels.find(p => p.id === parallelId);
}

// Slab detection hints - keywords that indicate graded cards
export const slabDetectionKeywords = [
  'psa', 'bgs', 'sgc', 'cgc', 'hga', 'csg',
  'gem mint', 'gem mt', 'mint', 'nm-mt', 'nm',
  'graded', 'authenticated', 'certified',
  'cert', 'certification',
];

// Check if text suggests a graded card
export function suggestsGradedCard(text: string): boolean {
  const lowerText = text.toLowerCase();
  return slabDetectionKeywords.some(keyword => lowerText.includes(keyword));
}

// Label region detection hints for graded cards
export const labelRegions = {
  psa: { position: 'top', color: 'red-banner', hasLogo: true, hasCertNumber: true },
  bgs: { position: 'top', color: 'black-gold', hasLogo: true, hasCertNumber: true },
  sgc: { position: 'top', color: 'teal', hasLogo: true, hasCertNumber: true },
  cgc: { position: 'top', color: 'purple', hasLogo: true, hasCertNumber: true },
};

// Card recognition result type
export interface CardRecognitionResult {
  isGraded: boolean;
  grader: string | null;
  grade: string | null;
  year: string | null;
  set: string | null;
  player: string | null;
  cardNumber: string | null;
  parallel: string | null;
  certNumber: string | null;
  serialNumber: string | null;
  serialTotal: string | null;
  confidence: number;
  needsBackImage: boolean; // True for raw cards
  // Variation fields
  variationType: 'base' | 'parallel' | 'insert' | null;
  variationName: string | null;
  variationFinish: string[] | null;
}

// ============ VARIATION DICTIONARY ============
// Structured system for card variations with separate fields for type, name, and finish

// Variation Types
export const variationTypes = [
  { id: 'base', name: 'Base', description: 'Standard base card from the set' },
  { id: 'parallel', name: 'Parallel', description: 'Colored/numbered version of base card' },
  { id: 'insert', name: 'Insert', description: 'Special subset or chase card' },
] as const;

export type VariationType = typeof variationTypes[number]['id'];

// Finish/Pattern tags - used across parallels and inserts
export const finishPatterns = [
  // Refractor/Prizm finishes
  { id: 'refractor', name: 'Refractor', keywords: ['refractor', 'ref'], textureCue: 'rainbow-shimmer' },
  { id: 'prizm', name: 'Prizm', keywords: ['prizm'], textureCue: 'angular-refraction' },
  { id: 'holo', name: 'Holo/Holographic', keywords: ['holo', 'holographic', 'hologram'], textureCue: 'full-rainbow' },
  { id: 'shimmer', name: 'Shimmer', keywords: ['shimmer', 'shimmering'], textureCue: 'subtle-sparkle' },
  { id: 'wave', name: 'Wave', keywords: ['wave'], textureCue: 'wavy-lines' },
  { id: 'pulsar', name: 'Pulsar', keywords: ['pulsar'], textureCue: 'pulsing-pattern' },
  { id: 'mojo', name: 'Mojo', keywords: ['mojo'], textureCue: 'swirl-pattern' },
  { id: 'cracked_ice', name: 'Cracked Ice', keywords: ['cracked ice', 'ice'], textureCue: 'fractured-pattern' },
  { id: 'speckle', name: 'Speckle', keywords: ['speckle', 'speckled'], textureCue: 'dotted-pattern' },
  { id: 'laser', name: 'Laser', keywords: ['laser'], textureCue: 'laser-etched' },
  { id: 'disco', name: 'Disco', keywords: ['disco'], textureCue: 'disco-ball' },
  { id: 'scope', name: 'Scope', keywords: ['scope'], textureCue: 'circular-pattern' },
  // Foil/metallic finishes
  { id: 'silver', name: 'Silver', keywords: ['silver'], textureCue: 'silver-metallic' },
  { id: 'gold', name: 'Gold', keywords: ['gold', 'golden'], textureCue: 'gold-metallic' },
  { id: 'bronze', name: 'Bronze', keywords: ['bronze'], textureCue: 'bronze-metallic' },
  { id: 'platinum', name: 'Platinum', keywords: ['platinum'], textureCue: 'platinum-metallic' },
  { id: 'chrome', name: 'Chrome', keywords: ['chrome'], textureCue: 'chrome-reflective' },
  // Special patterns
  { id: 'camo', name: 'Camo', keywords: ['camo', 'camouflage'], textureCue: 'camo-pattern' },
  { id: 'snakeskin', name: 'Snakeskin', keywords: ['snakeskin', 'snake'], textureCue: 'scale-pattern' },
  { id: 'tiger', name: 'Tiger Stripe', keywords: ['tiger', 'tiger stripe'], textureCue: 'stripe-pattern' },
  { id: 'zebra', name: 'Zebra', keywords: ['zebra'], textureCue: 'zebra-stripes' },
  { id: 'marble', name: 'Marble', keywords: ['marble'], textureCue: 'marble-swirl' },
  { id: 'mosaic', name: 'Mosaic', keywords: ['mosaic'], textureCue: 'tile-pattern' },
  // Opacity/texture
  { id: 'matte', name: 'Matte', keywords: ['matte'], textureCue: 'non-glossy' },
  { id: 'glossy', name: 'Glossy', keywords: ['glossy'], textureCue: 'high-gloss' },
  { id: 'sepia', name: 'Sepia', keywords: ['sepia'], textureCue: 'brown-toned' },
  { id: 'negative', name: 'Negative', keywords: ['negative'], textureCue: 'inverted-colors' },
] as const;

export type FinishPattern = typeof finishPatterns[number]['id'];

// Color modifiers for parallels
export const colorModifiers = [
  { id: 'red', name: 'Red', keywords: ['red', 'ruby', 'crimson'] },
  { id: 'blue', name: 'Blue', keywords: ['blue', 'sapphire', 'royal'] },
  { id: 'green', name: 'Green', keywords: ['green', 'emerald'] },
  { id: 'orange', name: 'Orange', keywords: ['orange'] },
  { id: 'pink', name: 'Pink', keywords: ['pink', 'rose'] },
  { id: 'purple', name: 'Purple', keywords: ['purple', 'violet'] },
  { id: 'yellow', name: 'Yellow', keywords: ['yellow'] },
  { id: 'black', name: 'Black', keywords: ['black', 'obsidian'] },
  { id: 'white', name: 'White', keywords: ['white', 'ice'] },
  { id: 'aqua', name: 'Aqua', keywords: ['aqua', 'teal', 'turquoise'] },
  { id: 'neon', name: 'Neon', keywords: ['neon', 'electric'] },
  { id: 'rainbow', name: 'Rainbow', keywords: ['rainbow'] },
  { id: 'two_tone', name: 'Two-Tone', keywords: ['two-tone', 'dual'] },
] as const;

// Common parallel names (combination of color + finish)
export const parallelNames = [
  // Prizm/Panini parallels
  { id: 'silver_prizm', name: 'Silver Prizm', color: 'silver', finish: 'prizm', numbered: false },
  { id: 'red_prizm', name: 'Red Prizm', color: 'red', finish: 'prizm', numbered: true },
  { id: 'blue_prizm', name: 'Blue Prizm', color: 'blue', finish: 'prizm', numbered: true },
  { id: 'green_prizm', name: 'Green Prizm', color: 'green', finish: 'prizm', numbered: true },
  { id: 'orange_prizm', name: 'Orange Prizm', color: 'orange', finish: 'prizm', numbered: true },
  { id: 'pink_prizm', name: 'Pink Prizm', color: 'pink', finish: 'prizm', numbered: true },
  { id: 'gold_prizm', name: 'Gold Prizm', color: 'gold', finish: 'prizm', numbered: true },
  { id: 'black_prizm', name: 'Black Prizm', color: 'black', finish: 'prizm', numbered: true },
  { id: 'purple_prizm', name: 'Purple Prizm', color: 'purple', finish: 'prizm', numbered: true },
  { id: 'neon_green_prizm', name: 'Neon Green Prizm', color: 'neon', finish: 'prizm', numbered: true },
  { id: 'hyper_prizm', name: 'Hyper Prizm', color: null, finish: 'prizm', numbered: false },
  { id: 'fast_break_prizm', name: 'Fast Break Prizm', color: 'blue', finish: 'prizm', numbered: false },
  { id: 'ruby_wave_prizm', name: 'Ruby Wave Prizm', color: 'red', finish: 'wave', numbered: true },
  { id: 'tiger_stripe', name: 'Tiger Stripe', color: null, finish: 'tiger', numbered: true },
  { id: 'snakeskin', name: 'Snakeskin Prizm', color: null, finish: 'snakeskin', numbered: true },
  { id: 'camo_prizm', name: 'Camo Prizm', color: null, finish: 'camo', numbered: true },
  { id: 'mojo', name: 'Mojo', color: null, finish: 'mojo', numbered: true },
  { id: 'shimmer', name: 'Shimmer', color: null, finish: 'shimmer', numbered: true },
  // Topps Chrome/refractor parallels
  { id: 'refractor', name: 'Refractor', color: null, finish: 'refractor', numbered: false },
  { id: 'gold_refractor', name: 'Gold Refractor', color: 'gold', finish: 'refractor', numbered: true },
  { id: 'orange_refractor', name: 'Orange Refractor', color: 'orange', finish: 'refractor', numbered: true },
  { id: 'green_refractor', name: 'Green Refractor', color: 'green', finish: 'refractor', numbered: true },
  { id: 'blue_refractor', name: 'Blue Refractor', color: 'blue', finish: 'refractor', numbered: true },
  { id: 'red_refractor', name: 'Red Refractor', color: 'red', finish: 'refractor', numbered: true },
  { id: 'purple_refractor', name: 'Purple Refractor', color: 'purple', finish: 'refractor', numbered: true },
  { id: 'pink_refractor', name: 'Pink Refractor', color: 'pink', finish: 'refractor', numbered: true },
  { id: 'xfractor', name: 'X-Fractor', color: null, finish: 'refractor', numbered: false },
  { id: 'superfractor', name: 'Superfractor', color: 'gold', finish: 'refractor', numbered: true },
  { id: 'sepia_refractor', name: 'Sepia Refractor', color: null, finish: 'sepia', numbered: true },
  { id: 'aqua_refractor', name: 'Aqua Refractor', color: 'aqua', finish: 'refractor', numbered: true },
  { id: 'prism_refractor', name: 'Prism Refractor', color: null, finish: 'prizm', numbered: true },
  { id: 'negative_refractor', name: 'Negative Refractor', color: null, finish: 'negative', numbered: true },
  // Select parallels
  { id: 'concourse', name: 'Concourse', color: 'silver', finish: null, numbered: false },
  { id: 'premier', name: 'Premier Level', color: 'blue', finish: null, numbered: false },
  { id: 'courtside', name: 'Courtside', color: 'gold', finish: null, numbered: true },
  { id: 'tri_color', name: 'Tri-Color', color: 'rainbow', finish: 'prizm', numbered: true },
  { id: 'tie_dye', name: 'Tie-Dye', color: 'rainbow', finish: null, numbered: true },
  { id: 'zebra', name: 'Zebra', color: null, finish: 'zebra', numbered: true },
  { id: 'disco', name: 'Disco', color: null, finish: 'disco', numbered: true },
  { id: 'scope', name: 'Scope', color: null, finish: 'scope', numbered: true },
  { id: 'white_sparkle', name: 'White Sparkle', color: 'white', finish: 'shimmer', numbered: true },
  // Mosaic parallels
  { id: 'mosaic_silver', name: 'Silver Mosaic', color: 'silver', finish: 'mosaic', numbered: false },
  { id: 'mosaic_pink_camo', name: 'Pink Camo Mosaic', color: 'pink', finish: 'camo', numbered: true },
  { id: 'mosaic_green', name: 'Green Mosaic', color: 'green', finish: 'mosaic', numbered: true },
  // Special parallels
  { id: 'printing_plate', name: 'Printing Plate', color: null, finish: null, numbered: true },
  { id: 'one_of_one', name: '1/1', color: null, finish: null, numbered: true },
  { id: 'auto', name: 'Autograph', color: null, finish: null, numbered: false },
  { id: 'patch', name: 'Patch/Relic', color: null, finish: null, numbered: false },
  { id: 'auto_patch', name: 'Auto Patch', color: null, finish: null, numbered: true },
  { id: 'rpa', name: 'Rookie Patch Auto (RPA)', color: null, finish: null, numbered: true },
] as const;

// Major insert sets (chase cards, special subsets)
export const insertSets = [
  // Premium chase inserts
  { id: 'downtown', name: 'Downtown', brand: 'panini', rarity: 'ultra-rare', description: 'City skyline themed SSP' },
  { id: 'kaboom', name: 'Kaboom', brand: 'panini', rarity: 'ultra-rare', description: 'Comic book explosion style' },
  { id: 'color_blast', name: 'Color Blast', brand: 'panini', rarity: 'ultra-rare', description: 'Colorful explosion design' },
  { id: 'stained_glass', name: 'Stained Glass', brand: 'panini', rarity: 'rare', description: 'Stained glass art style' },
  { id: 'case_hit', name: 'Case Hit', brand: 'various', rarity: 'ultra-rare', description: 'One per case insert' },
  // Panini inserts
  { id: 'instant_impact', name: 'Instant Impact', brand: 'panini', rarity: 'common', description: 'Rookie highlight insert' },
  { id: 'emergent', name: 'Emergent', brand: 'panini', rarity: 'common', description: 'Rising star insert' },
  { id: 'sensational_swatches', name: 'Sensational Swatches', brand: 'panini', rarity: 'rare', description: 'Relic insert' },
  { id: 'fireworks', name: 'Fireworks', brand: 'panini', rarity: 'rare', description: 'Explosion design insert' },
  { id: 'my_house', name: 'My House', brand: 'panini', rarity: 'rare', description: 'Dominance themed insert' },
  { id: 'peacock', name: 'Peacock', brand: 'panini', rarity: 'ultra-rare', description: 'Peacock design SSP' },
  { id: 'nebula', name: 'Nebula', brand: 'panini', rarity: 'rare', description: 'Space themed insert' },
  // Topps inserts
  { id: 'topps_now', name: 'Topps Now', brand: 'topps', rarity: 'common', description: 'Current event cards' },
  { id: 'project70', name: 'Project 70', brand: 'topps', rarity: 'rare', description: 'Artist collaboration' },
  { id: 'dynasty', name: 'Dynasty', brand: 'topps', rarity: 'ultra-rare', description: 'Premium patch/auto' },
  { id: 'transcendent', name: 'Transcendent', brand: 'topps', rarity: 'ultra-rare', description: 'Ultra-premium insert' },
  // Upper Deck inserts
  { id: 'young_guns', name: 'Young Guns', brand: 'upper_deck', rarity: 'common', description: 'Rookie subset' },
  { id: 'canvas', name: 'Canvas', brand: 'upper_deck', rarity: 'common', description: 'Canvas texture insert' },
  { id: 'clear_cut', name: 'Clear Cut', brand: 'upper_deck', rarity: 'rare', description: 'Acetate insert' },
  { id: 'high_gloss', name: 'High Gloss', brand: 'upper_deck', rarity: 'ultra-rare', description: 'Premium parallel' },
  // Bowman inserts
  { id: 'bowman_best', name: 'Bowman Best', brand: 'bowman', rarity: 'common', description: 'Chrome subset' },
  { id: 'bowman_1st', name: '1st Bowman', brand: 'bowman', rarity: 'common', description: 'First Bowman card' },
  { id: 'sapphire', name: 'Sapphire', brand: 'bowman', rarity: 'rare', description: 'Blue sapphire insert' },
] as const;

export type InsertSetId = typeof insertSets[number]['id'];

// Variation suggestion result
export interface VariationSuggestion {
  variationType: VariationType | null;
  variationName: string | null;
  variationFinish: string[];
  confidence: 'high' | 'medium' | 'low';
  needsConfirmation: boolean;
  matchedKeywords: string[];
  reason: string;
}

// Analyze text to suggest variation
export function suggestVariation(text: string, hasSerial: boolean = false): VariationSuggestion {
  const lowerText = text.toLowerCase();
  const matchedKeywords: string[] = [];
  let variationType: VariationType | null = null;
  let variationName: string | null = null;
  const variationFinish: string[] = [];
  let confidence: 'high' | 'medium' | 'low' = 'low';
  
  // Check for insert sets first (they override parallel detection)
  for (const insert of insertSets) {
    if (lowerText.includes(insert.name.toLowerCase())) {
      variationType = 'insert';
      variationName = insert.name;
      matchedKeywords.push(insert.name);
      confidence = 'high';
      break;
    }
  }
  
  // Check for parallel names if not an insert
  if (!variationType) {
    for (const parallel of parallelNames) {
      const parallelLower = parallel.name.toLowerCase();
      if (lowerText.includes(parallelLower)) {
        variationType = 'parallel';
        variationName = parallel.name;
        matchedKeywords.push(parallel.name);
        if (parallel.finish) variationFinish.push(parallel.finish);
        confidence = 'high';
        break;
      }
    }
  }
  
  // Check for finish patterns
  for (const finish of finishPatterns) {
    for (const keyword of finish.keywords) {
      if (lowerText.includes(keyword)) {
        if (!variationFinish.includes(finish.id)) {
          variationFinish.push(finish.id);
        }
        if (!matchedKeywords.includes(keyword)) {
          matchedKeywords.push(keyword);
        }
        if (!variationType) {
          variationType = 'parallel';
          confidence = 'medium';
        }
        break;
      }
    }
  }
  
  // Check for color modifiers
  for (const color of colorModifiers) {
    for (const keyword of color.keywords) {
      if (lowerText.includes(keyword) && !matchedKeywords.includes(keyword)) {
        matchedKeywords.push(keyword);
        if (!variationType) {
          variationType = 'parallel';
          confidence = 'low';
        }
        break;
      }
    }
  }
  
  // If serial number present but no variation detected, likely parallel
  if (hasSerial && !variationType) {
    variationType = 'parallel';
    confidence = 'low';
  }
  
  // If nothing detected, assume base
  if (!variationType && matchedKeywords.length === 0) {
    variationType = 'base';
    confidence = 'medium';
  }
  
  // Determine if confirmation needed
  const needsConfirmation = hasSerial || 
    confidence === 'low' || 
    (confidence === 'medium' && variationType === 'parallel');
  
  return {
    variationType,
    variationName,
    variationFinish,
    confidence,
    needsConfirmation,
    matchedKeywords,
    reason: matchedKeywords.length > 0 
      ? `Detected: ${matchedKeywords.join(', ')}`
      : hasSerial ? 'Serial number suggests parallel' : 'No variation keywords found',
  };
}

// Get all parallel names for dropdown
export function getAllParallelNames() {
  return parallelNames.map(p => ({ id: p.id, name: p.name, numbered: p.numbered }));
}

// Get all insert sets for dropdown
export function getAllInsertSets() {
  return insertSets.map(i => ({ id: i.id, name: i.name, rarity: i.rarity }));
}

// Get all finish patterns for tags
export function getAllFinishPatterns() {
  return finishPatterns.map(f => ({ id: f.id, name: f.name }));
}

// Get variation type by ID
export function getVariationTypeById(id: string) {
  return variationTypes.find(v => v.id === id);
}
