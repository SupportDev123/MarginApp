import { db } from './db';
import { cardFamilies, cardImages, CardSeedReport } from '@shared/schema';
import { eq, sql, and, count, asc, ne } from 'drizzle-orm';
import { generateImageEmbedding } from './embedding-service';
import crypto from 'crypto';

const DELAY_BETWEEN_REQUESTS_MS = 500;
const DELAY_ON_RATE_LIMIT_MS = 60000;
const IMAGES_TARGET_PER_FAMILY = 25;
const MAX_ACTIVE_FAMILIES = 5;
const MAX_LISTINGS_PER_FAMILY = 300;
const MAX_IMAGES_PER_LISTING = 3;
const DOWNLOAD_CONCURRENCY = 2;

const JUNK_TITLE_FILTERS = [
  'repack', 'mystery', 'box break', 'random', 'hit draft',
  'case break', 'pick your team', 'pyt', 'relic only',
  'auto only', 'break spot', 'lot of', 'bulk lot',
  'damaged', 'creased', 'poor condition',
];

// Sport-specific parallel patterns - order matters (most specific first)
// Using word boundaries (\b) to prevent false positives like "blue" in "Blue Eyes"
const PARALLEL_PATTERNS: Record<string, { pattern: RegExp; name: string }[]> = {
  basketball: [
    { pattern: /\bfast\s*break\b/i, name: 'fast-break' },
    { pattern: /\bhyper\b/i, name: 'hyper' },
    { pattern: /\bice\b(?!\s*hockey)/i, name: 'ice' },
    { pattern: /\bred\s*white\s*(?:&|and)?\s*blue\b|\brwb\b/i, name: 'red-white-blue' },
    { pattern: /\bdisco\b/i, name: 'disco' },
    { pattern: /\bmojo\b/i, name: 'mojo' },
    { pattern: /\bshimmer\b/i, name: 'shimmer' },
    { pattern: /\bsnakeskin\b/i, name: 'snakeskin' },
    { pattern: /\btiger\b(?!\s*woods)/i, name: 'tiger' },
    { pattern: /\bgold\s*vinyl\b/i, name: 'gold-vinyl' },
    { pattern: /\bblack\s*gold\b/i, name: 'black-gold' },
    { pattern: /\bneon\s*green\b/i, name: 'neon-green' },
    { pattern: /\bgold\b(?!\s*star)/i, name: 'gold' },
    { pattern: /\bsilver\b/i, name: 'silver' },
    { pattern: /\bblue\b(?!\s*eyes)/i, name: 'blue' },
    { pattern: /\bred\b/i, name: 'red' },
    { pattern: /\bpurple\b/i, name: 'purple' },
    { pattern: /\bpink\b/i, name: 'pink' },
    { pattern: /\borange\b/i, name: 'orange' },
    { pattern: /\bgreen\b/i, name: 'green' },
  ],
  football: [
    { pattern: /\bdowntown\b/i, name: 'downtown' },
    { pattern: /\bno\s*huddle\b/i, name: 'no-huddle' },
    { pattern: /\bred\s*white\s*(?:&|and)?\s*blue\b|\brwb\b/i, name: 'red-white-blue' },
    { pattern: /\bdisco\b/i, name: 'disco' },
    { pattern: /\bmojo\b/i, name: 'mojo' },
    { pattern: /\bshimmer\b/i, name: 'shimmer' },
    { pattern: /\bsnakeskin\b/i, name: 'snakeskin' },
    { pattern: /\btiger\b(?!\s*woods)/i, name: 'tiger' },
    { pattern: /\bcamo\b/i, name: 'camo' },
    { pattern: /\bblack\s*gold\b/i, name: 'black-gold' },
    { pattern: /\bgold\s*vinyl\b/i, name: 'gold-vinyl' },
    { pattern: /\bneon\s*green\b/i, name: 'neon-green' },
    { pattern: /\bgold\b(?!\s*star)/i, name: 'gold' },
    { pattern: /\bsilver\b/i, name: 'silver' },
    { pattern: /\bblue\b/i, name: 'blue' },
    { pattern: /\bred\b/i, name: 'red' },
    { pattern: /\bpurple\b/i, name: 'purple' },
    { pattern: /\bpink\b/i, name: 'pink' },
    { pattern: /\borange\b/i, name: 'orange' },
    { pattern: /\bgreen\b/i, name: 'green' },
  ],
  baseball: [
    { pattern: /\bsuperfractor\b/i, name: 'superfractor' },
    { pattern: /\bgold\s*refractor\b/i, name: 'gold-refractor' },
    { pattern: /\bblue\s*refractor\b/i, name: 'blue-refractor' },
    { pattern: /\bred\s*refractor\b/i, name: 'red-refractor' },
    { pattern: /\bpurple\s*refractor\b/i, name: 'purple-refractor' },
    { pattern: /\borange\s*refractor\b/i, name: 'orange-refractor' },
    { pattern: /\bpink\s*refractor\b/i, name: 'pink-refractor' },
    { pattern: /\bgreen\s*refractor\b/i, name: 'green-refractor' },
    { pattern: /\brefractor\b/i, name: 'refractor' },
    { pattern: /\bgold\b/i, name: 'gold' },
    { pattern: /\bsilver\b/i, name: 'silver' },
    { pattern: /\bblue\b/i, name: 'blue' },
    { pattern: /\bred\b/i, name: 'red' },
    { pattern: /\bpurple\b/i, name: 'purple' },
    { pattern: /\bpink\b/i, name: 'pink' },
    { pattern: /\borange\b/i, name: 'orange' },
    { pattern: /\bsepia\b/i, name: 'sepia' },
    { pattern: /\bblack\b(?!\s*diamond)/i, name: 'black' },
  ],
  soccer: [
    { pattern: /\bgold\s*vinyl\b/i, name: 'gold-vinyl' },
    { pattern: /\bblack\s*gold\b/i, name: 'black-gold' },
    { pattern: /\bshimmer\b/i, name: 'shimmer' },
    { pattern: /\bmojo\b/i, name: 'mojo' },
    { pattern: /\bgold\b/i, name: 'gold' },
    { pattern: /\bsilver\b/i, name: 'silver' },
    { pattern: /\bblue\b/i, name: 'blue' },
    { pattern: /\bred\b/i, name: 'red' },
    { pattern: /\bpurple\b/i, name: 'purple' },
    { pattern: /\bpink\b/i, name: 'pink' },
    { pattern: /\borange\b/i, name: 'orange' },
    { pattern: /\bgreen\b/i, name: 'green' },
  ],
  hockey: [
    { pattern: /\byoung\s*guns\b/i, name: 'young-guns' },
    { pattern: /\bexclusives\b/i, name: 'exclusives' },
    { pattern: /\bhigh\s*gloss\b/i, name: 'high-gloss' },
    { pattern: /\brainbow\b/i, name: 'rainbow' },
    { pattern: /\bgold\b/i, name: 'gold' },
    { pattern: /\bsilver\b/i, name: 'silver' },
    { pattern: /\bblue\b/i, name: 'blue' },
    { pattern: /\bred\b/i, name: 'red' },
    { pattern: /\bpurple\b/i, name: 'purple' },
  ],
  pokemon: [
    { pattern: /\bspecial\s*art\s*rare\b/i, name: 'special-art-rare' },
    { pattern: /\billustration\s*rare\b/i, name: 'illustration-rare' },
    { pattern: /\balt\s*art\b/i, name: 'alt-art' },
    { pattern: /\bfull\s*art\b/i, name: 'full-art' },
    { pattern: /\bsecret\s*rare\b/i, name: 'secret-rare' },
    { pattern: /\bgold\s*star\b/i, name: 'gold-star' },
    { pattern: /\breverse\s*holo\b/i, name: 'reverse-holo' },
    { pattern: /\bshadowless\b/i, name: 'shadowless' },
    { pattern: /\b1st\s*edition\b/i, name: 'first-edition' },
    { pattern: /\brainbow\b/i, name: 'rainbow' },
    { pattern: /\bholo\b/i, name: 'holo' },
  ],
};

function extractParallelFromTitle(title: string, sport: string | null, subcategory?: string): string | undefined {
  if (!title) return undefined;
  
  // Determine which pattern set to use
  let patternKey = sport?.toLowerCase();
  
  // Fallback to subcategory for Pokemon/TCG when sport is null
  if (!patternKey && subcategory) {
    if (subcategory.toLowerCase() === 'pokemon') patternKey = 'pokemon';
  }
  
  if (!patternKey) return undefined;
  
  const patterns = PARALLEL_PATTERNS[patternKey];
  if (!patterns) return undefined;
  
  for (const { pattern, name } of patterns) {
    if (pattern.test(title)) {
      return name;
    }
  }
  return undefined;
}

function extractYearFromTitle(title: string): string | undefined {
  const yearMatch = title.match(/\b(19[89]\d|20[0-2]\d)\b/);
  return yearMatch ? yearMatch[1] : undefined;
}

const CARD_FAMILIES = [
  // Panini Basketball - Flagship
  { brand: 'Panini', family: 'Prizm Basketball', displayName: 'Panini Prizm Basketball', subcategory: 'sports', sport: 'basketball', queueOrder: 1 },
  { brand: 'Panini', family: 'Donruss Optic Basketball', displayName: 'Panini Donruss Optic Basketball', subcategory: 'sports', sport: 'basketball', queueOrder: 2 },
  { brand: 'Panini', family: 'Select Basketball', displayName: 'Panini Select Basketball', subcategory: 'sports', sport: 'basketball', queueOrder: 3 },
  { brand: 'Panini', family: 'Mosaic Basketball', displayName: 'Panini Mosaic Basketball', subcategory: 'sports', sport: 'basketball', queueOrder: 4 },
  { brand: 'Panini', family: 'Donruss Basketball', displayName: 'Panini Donruss Basketball', subcategory: 'sports', sport: 'basketball', queueOrder: 5 },
  { brand: 'Panini', family: 'Contenders Basketball', displayName: 'Panini Contenders Basketball', subcategory: 'sports', sport: 'basketball', queueOrder: 6 },
  { brand: 'Panini', family: 'Chronicles Basketball', displayName: 'Panini Chronicles Basketball', subcategory: 'sports', sport: 'basketball', queueOrder: 7 },
  { brand: 'Panini', family: 'Hoops Basketball', displayName: 'Panini Hoops Basketball', subcategory: 'sports', sport: 'basketball', queueOrder: 8 },
  { brand: 'Panini', family: 'Spectra Basketball', displayName: 'Panini Spectra Basketball', subcategory: 'sports', sport: 'basketball', queueOrder: 9 },
  { brand: 'Panini', family: 'National Treasures Basketball', displayName: 'Panini National Treasures Basketball', subcategory: 'sports', sport: 'basketball', queueOrder: 10 },
  { brand: 'Panini', family: 'Flawless Basketball', displayName: 'Panini Flawless Basketball', subcategory: 'sports', sport: 'basketball', queueOrder: 11 },
  { brand: 'Panini', family: 'Court Kings Basketball', displayName: 'Panini Court Kings Basketball', subcategory: 'sports', sport: 'basketball', queueOrder: 12 },
  { brand: 'Panini', family: 'Immaculate Basketball', displayName: 'Panini Immaculate Basketball', subcategory: 'sports', sport: 'basketball', queueOrder: 13 },

  // Panini Football - Flagship
  { brand: 'Panini', family: 'Prizm Football', displayName: 'Panini Prizm Football', subcategory: 'sports', sport: 'football', queueOrder: 14 },
  { brand: 'Panini', family: 'Donruss Optic Football', displayName: 'Panini Donruss Optic Football', subcategory: 'sports', sport: 'football', queueOrder: 15 },
  { brand: 'Panini', family: 'Select Football', displayName: 'Panini Select Football', subcategory: 'sports', sport: 'football', queueOrder: 16 },
  { brand: 'Panini', family: 'Mosaic Football', displayName: 'Panini Mosaic Football', subcategory: 'sports', sport: 'football', queueOrder: 17 },
  { brand: 'Panini', family: 'Donruss Football', displayName: 'Panini Donruss Football', subcategory: 'sports', sport: 'football', queueOrder: 18 },
  { brand: 'Panini', family: 'Contenders Football', displayName: 'Panini Contenders Football', subcategory: 'sports', sport: 'football', queueOrder: 19 },
  { brand: 'Panini', family: 'Chronicles Football', displayName: 'Panini Chronicles Football', subcategory: 'sports', sport: 'football', queueOrder: 20 },
  { brand: 'Panini', family: 'Absolute Football', displayName: 'Panini Absolute Football', subcategory: 'sports', sport: 'football', queueOrder: 21 },
  { brand: 'Panini', family: 'Spectra Football', displayName: 'Panini Spectra Football', subcategory: 'sports', sport: 'football', queueOrder: 22 },
  { brand: 'Panini', family: 'National Treasures Football', displayName: 'Panini National Treasures Football', subcategory: 'sports', sport: 'football', queueOrder: 23 },
  { brand: 'Panini', family: 'Flawless Football', displayName: 'Panini Flawless Football', subcategory: 'sports', sport: 'football', queueOrder: 24 },
  { brand: 'Panini', family: 'Immaculate Football', displayName: 'Panini Immaculate Football', subcategory: 'sports', sport: 'football', queueOrder: 25 },

  // Topps Baseball - Flagship
  { brand: 'Topps', family: 'Topps Chrome Baseball', displayName: 'Topps Chrome Baseball', subcategory: 'sports', sport: 'baseball', queueOrder: 26 },
  { brand: 'Topps', family: 'Topps Series 1 Baseball', displayName: 'Topps Series 1 Baseball', subcategory: 'sports', sport: 'baseball', queueOrder: 27 },
  { brand: 'Topps', family: 'Topps Series 2 Baseball', displayName: 'Topps Series 2 Baseball', subcategory: 'sports', sport: 'baseball', queueOrder: 28 },
  { brand: 'Topps', family: 'Topps Update Baseball', displayName: 'Topps Update Baseball', subcategory: 'sports', sport: 'baseball', queueOrder: 29 },
  { brand: 'Topps', family: 'Bowman Chrome Baseball', displayName: 'Topps Bowman Chrome Baseball', subcategory: 'sports', sport: 'baseball', queueOrder: 30 },
  { brand: 'Topps', family: 'Bowman Draft Baseball', displayName: 'Topps Bowman Draft Baseball', subcategory: 'sports', sport: 'baseball', queueOrder: 31 },
  { brand: 'Topps', family: 'Bowman Baseball', displayName: 'Topps Bowman Baseball', subcategory: 'sports', sport: 'baseball', queueOrder: 32 },
  { brand: 'Topps', family: 'Stadium Club Baseball', displayName: 'Topps Stadium Club Baseball', subcategory: 'sports', sport: 'baseball', queueOrder: 33 },
  { brand: 'Topps', family: 'Allen & Ginter Baseball', displayName: 'Topps Allen & Ginter Baseball', subcategory: 'sports', sport: 'baseball', queueOrder: 34 },
  { brand: 'Topps', family: 'Gypsy Queen Baseball', displayName: 'Topps Gypsy Queen Baseball', subcategory: 'sports', sport: 'baseball', queueOrder: 35 },
  { brand: 'Topps', family: 'Heritage Baseball', displayName: 'Topps Heritage Baseball', subcategory: 'sports', sport: 'baseball', queueOrder: 36 },
  { brand: 'Topps', family: 'Topps Inception Baseball', displayName: 'Topps Inception Baseball', subcategory: 'sports', sport: 'baseball', queueOrder: 37 },
  { brand: 'Topps', family: 'Topps Tribute Baseball', displayName: 'Topps Tribute Baseball', subcategory: 'sports', sport: 'baseball', queueOrder: 38 },
  { brand: 'Topps', family: 'Topps Sterling Baseball', displayName: 'Topps Sterling Baseball', subcategory: 'sports', sport: 'baseball', queueOrder: 39 },
  { brand: 'Topps', family: 'Topps Finest Baseball', displayName: 'Topps Finest Baseball', subcategory: 'sports', sport: 'baseball', queueOrder: 40 },
  { brand: 'Topps', family: 'Topps Tier One Baseball', displayName: 'Topps Tier One Baseball', subcategory: 'sports', sport: 'baseball', queueOrder: 41 },
  { brand: 'Topps', family: 'Topps Luminaries Baseball', displayName: 'Topps Luminaries Baseball', subcategory: 'sports', sport: 'baseball', queueOrder: 42 },
  { brand: 'Topps', family: 'Topps Dynasty Baseball', displayName: 'Topps Dynasty Baseball', subcategory: 'sports', sport: 'baseball', queueOrder: 43 },
  { brand: 'Topps', family: 'Topps Transcendent Baseball', displayName: 'Topps Transcendent Baseball', subcategory: 'sports', sport: 'baseball', queueOrder: 44 },

  // Panini Soccer
  { brand: 'Panini', family: 'Prizm Premier League', displayName: 'Panini Prizm Premier League', subcategory: 'sports', sport: 'soccer', queueOrder: 45 },
  { brand: 'Panini', family: 'Prizm World Cup', displayName: 'Panini Prizm World Cup', subcategory: 'sports', sport: 'soccer', queueOrder: 46 },
  { brand: 'Panini', family: 'Select Premier League', displayName: 'Panini Select Premier League', subcategory: 'sports', sport: 'soccer', queueOrder: 47 },
  { brand: 'Panini', family: 'Donruss Soccer', displayName: 'Panini Donruss Soccer', subcategory: 'sports', sport: 'soccer', queueOrder: 48 },
  { brand: 'Topps', family: 'Topps Chrome UEFA', displayName: 'Topps Chrome UEFA', subcategory: 'sports', sport: 'soccer', queueOrder: 49 },
  { brand: 'Topps', family: 'Topps Merlin', displayName: 'Topps Merlin Soccer', subcategory: 'sports', sport: 'soccer', queueOrder: 50 },

  // Upper Deck Hockey
  { brand: 'Upper Deck', family: 'Young Guns Hockey', displayName: 'Upper Deck Young Guns Hockey', subcategory: 'sports', sport: 'hockey', queueOrder: 51 },
  { brand: 'Upper Deck', family: 'Series 1 Hockey', displayName: 'Upper Deck Series 1 Hockey', subcategory: 'sports', sport: 'hockey', queueOrder: 52 },
  { brand: 'Upper Deck', family: 'Series 2 Hockey', displayName: 'Upper Deck Series 2 Hockey', subcategory: 'sports', sport: 'hockey', queueOrder: 53 },
  { brand: 'Upper Deck', family: 'Extended Series Hockey', displayName: 'Upper Deck Extended Series Hockey', subcategory: 'sports', sport: 'hockey', queueOrder: 54 },
  { brand: 'Upper Deck', family: 'Ice Hockey', displayName: 'Upper Deck Ice Hockey', subcategory: 'sports', sport: 'hockey', queueOrder: 55 },
  { brand: 'Upper Deck', family: 'SP Authentic Hockey', displayName: 'Upper Deck SP Authentic Hockey', subcategory: 'sports', sport: 'hockey', queueOrder: 56 },
  { brand: 'Upper Deck', family: 'The Cup Hockey', displayName: 'Upper Deck The Cup Hockey', subcategory: 'sports', sport: 'hockey', queueOrder: 57 },
  { brand: 'Upper Deck', family: 'OPC Platinum Hockey', displayName: 'Upper Deck OPC Platinum Hockey', subcategory: 'sports', sport: 'hockey', queueOrder: 58 },
  { brand: 'Upper Deck', family: 'Synergy Hockey', displayName: 'Upper Deck Synergy Hockey', subcategory: 'sports', sport: 'hockey', queueOrder: 59 },
  { brand: 'Upper Deck', family: 'Black Diamond Hockey', displayName: 'Upper Deck Black Diamond Hockey', subcategory: 'sports', sport: 'hockey', queueOrder: 60 },

  // Pokemon TCG
  { brand: 'Pokemon', family: 'Base Set', displayName: 'Pokemon Base Set', subcategory: 'pokemon', sport: null, queueOrder: 61 },
  { brand: 'Pokemon', family: 'Jungle', displayName: 'Pokemon Jungle', subcategory: 'pokemon', sport: null, queueOrder: 62 },
  { brand: 'Pokemon', family: 'Fossil', displayName: 'Pokemon Fossil', subcategory: 'pokemon', sport: null, queueOrder: 63 },
  { brand: 'Pokemon', family: 'Team Rocket', displayName: 'Pokemon Team Rocket', subcategory: 'pokemon', sport: null, queueOrder: 64 },
  { brand: 'Pokemon', family: 'Neo Genesis', displayName: 'Pokemon Neo Genesis', subcategory: 'pokemon', sport: null, queueOrder: 65 },
  { brand: 'Pokemon', family: 'Neo Discovery', displayName: 'Pokemon Neo Discovery', subcategory: 'pokemon', sport: null, queueOrder: 66 },
  { brand: 'Pokemon', family: 'Skyridge', displayName: 'Pokemon Skyridge', subcategory: 'pokemon', sport: null, queueOrder: 67 },
  { brand: 'Pokemon', family: 'Aquapolis', displayName: 'Pokemon Aquapolis', subcategory: 'pokemon', sport: null, queueOrder: 68 },
  { brand: 'Pokemon', family: 'Expedition', displayName: 'Pokemon Expedition', subcategory: 'pokemon', sport: null, queueOrder: 69 },
  { brand: 'Pokemon', family: 'EX Ruby & Sapphire', displayName: 'Pokemon EX Ruby & Sapphire', subcategory: 'pokemon', sport: null, queueOrder: 70 },
  { brand: 'Pokemon', family: 'Diamond & Pearl', displayName: 'Pokemon Diamond & Pearl', subcategory: 'pokemon', sport: null, queueOrder: 71 },
  { brand: 'Pokemon', family: 'Black & White', displayName: 'Pokemon Black & White', subcategory: 'pokemon', sport: null, queueOrder: 72 },
  { brand: 'Pokemon', family: 'XY Base', displayName: 'Pokemon XY Base', subcategory: 'pokemon', sport: null, queueOrder: 73 },
  { brand: 'Pokemon', family: 'Sun & Moon', displayName: 'Pokemon Sun & Moon', subcategory: 'pokemon', sport: null, queueOrder: 74 },
  { brand: 'Pokemon', family: 'Sword & Shield', displayName: 'Pokemon Sword & Shield', subcategory: 'pokemon', sport: null, queueOrder: 75 },
  { brand: 'Pokemon', family: 'Vivid Voltage', displayName: 'Pokemon Vivid Voltage', subcategory: 'pokemon', sport: null, queueOrder: 76 },
  { brand: 'Pokemon', family: 'Evolving Skies', displayName: 'Pokemon Evolving Skies', subcategory: 'pokemon', sport: null, queueOrder: 77 },
  { brand: 'Pokemon', family: 'Celebrations', displayName: 'Pokemon Celebrations', subcategory: 'pokemon', sport: null, queueOrder: 78 },
  { brand: 'Pokemon', family: 'Crown Zenith', displayName: 'Pokemon Crown Zenith', subcategory: 'pokemon', sport: null, queueOrder: 79 },
  { brand: 'Pokemon', family: 'Scarlet & Violet', displayName: 'Pokemon Scarlet & Violet', subcategory: 'pokemon', sport: null, queueOrder: 80 },
  { brand: 'Pokemon', family: 'Paldea Evolved', displayName: 'Pokemon Paldea Evolved', subcategory: 'pokemon', sport: null, queueOrder: 81 },
  { brand: 'Pokemon', family: 'Obsidian Flames', displayName: 'Pokemon Obsidian Flames', subcategory: 'pokemon', sport: null, queueOrder: 82 },
  { brand: 'Pokemon', family: '151', displayName: 'Pokemon 151', subcategory: 'pokemon', sport: null, queueOrder: 83 },
  { brand: 'Pokemon', family: 'Paradox Rift', displayName: 'Pokemon Paradox Rift', subcategory: 'pokemon', sport: null, queueOrder: 84 },
  { brand: 'Pokemon', family: 'Temporal Forces', displayName: 'Pokemon Temporal Forces', subcategory: 'pokemon', sport: null, queueOrder: 85 },

  // Yu-Gi-Oh
  { brand: 'Konami', family: 'Legend of Blue Eyes White Dragon', displayName: 'Yu-Gi-Oh Legend of Blue Eyes', subcategory: 'tcg', sport: null, queueOrder: 86 },
  { brand: 'Konami', family: 'Metal Raiders', displayName: 'Yu-Gi-Oh Metal Raiders', subcategory: 'tcg', sport: null, queueOrder: 87 },
  { brand: 'Konami', family: 'Pharaohs Servant', displayName: 'Yu-Gi-Oh Pharaohs Servant', subcategory: 'tcg', sport: null, queueOrder: 88 },
  { brand: 'Konami', family: 'Dark Magician', displayName: 'Yu-Gi-Oh Dark Magician', subcategory: 'tcg', sport: null, queueOrder: 89 },
  { brand: 'Konami', family: 'Blue Eyes White Dragon', displayName: 'Yu-Gi-Oh Blue Eyes White Dragon', subcategory: 'tcg', sport: null, queueOrder: 90 },

  // Magic: The Gathering
  { brand: 'Wizards', family: 'Alpha', displayName: 'MTG Alpha', subcategory: 'tcg', sport: null, queueOrder: 91 },
  { brand: 'Wizards', family: 'Beta', displayName: 'MTG Beta', subcategory: 'tcg', sport: null, queueOrder: 92 },
  { brand: 'Wizards', family: 'Unlimited', displayName: 'MTG Unlimited', subcategory: 'tcg', sport: null, queueOrder: 93 },
  { brand: 'Wizards', family: 'Revised', displayName: 'MTG Revised', subcategory: 'tcg', sport: null, queueOrder: 94 },
  { brand: 'Wizards', family: 'Legends', displayName: 'MTG Legends', subcategory: 'tcg', sport: null, queueOrder: 95 },
  { brand: 'Wizards', family: 'Arabian Nights', displayName: 'MTG Arabian Nights', subcategory: 'tcg', sport: null, queueOrder: 96 },
  { brand: 'Wizards', family: 'Antiquities', displayName: 'MTG Antiquities', subcategory: 'tcg', sport: null, queueOrder: 97 },
  { brand: 'Wizards', family: 'The Dark', displayName: 'MTG The Dark', subcategory: 'tcg', sport: null, queueOrder: 98 },

  // Vintage Sports - Highly Valuable
  { brand: 'Topps', family: '1952 Topps Baseball', displayName: '1952 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 99 },
  { brand: 'Topps', family: '1953 Topps Baseball', displayName: '1953 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 100 },
  { brand: 'Topps', family: '1954 Topps Baseball', displayName: '1954 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 101 },
  { brand: 'Topps', family: '1955 Topps Baseball', displayName: '1955 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 102 },
  { brand: 'Bowman', family: '1948 Bowman Baseball', displayName: '1948 Bowman Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 103 },
  { brand: 'Bowman', family: '1949 Bowman Baseball', displayName: '1949 Bowman Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 104 },
  { brand: 'Bowman', family: '1951 Bowman Baseball', displayName: '1951 Bowman Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 105 },
  { brand: 'Topps', family: '1957 Topps Baseball', displayName: '1957 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 106 },
  { brand: 'Topps', family: '1958 Topps Baseball', displayName: '1958 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 107 },
  { brand: 'Topps', family: '1959 Topps Baseball', displayName: '1959 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 108 },
  { brand: 'Topps', family: '1986 Fleer Basketball', displayName: '1986 Fleer Basketball', subcategory: 'vintage', sport: 'basketball', queueOrder: 109 },
  { brand: 'Fleer', family: '1961 Fleer Basketball', displayName: '1961 Fleer Basketball', subcategory: 'vintage', sport: 'basketball', queueOrder: 110 },
  { brand: 'Topps', family: '1969 Topps Basketball', displayName: '1969 Topps Basketball', subcategory: 'vintage', sport: 'basketball', queueOrder: 111 },
  { brand: 'Topps', family: '1970 Topps Basketball', displayName: '1970 Topps Basketball', subcategory: 'vintage', sport: 'basketball', queueOrder: 112 },
  { brand: 'Topps', family: '1971 Topps Basketball', displayName: '1971 Topps Basketball', subcategory: 'vintage', sport: 'basketball', queueOrder: 113 },
  { brand: 'Topps', family: '1972 Topps Basketball', displayName: '1972 Topps Basketball', subcategory: 'vintage', sport: 'basketball', queueOrder: 114 },
  { brand: 'Topps', family: '1976 Topps Football', displayName: '1976 Topps Football', subcategory: 'vintage', sport: 'football', queueOrder: 115 },
  { brand: 'Topps', family: '1958 Topps Football', displayName: '1958 Topps Football', subcategory: 'vintage', sport: 'football', queueOrder: 116 },
  { brand: 'Topps', family: '1965 Topps Football', displayName: '1965 Topps Football', subcategory: 'vintage', sport: 'football', queueOrder: 117 },

  // Vintage Sports - Gap Fill (1956, 1960-1975)
  { brand: 'Topps', family: '1956 Topps Baseball', displayName: '1956 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 136 },
  { brand: 'Topps', family: '1960 Topps Baseball', displayName: '1960 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 137 },
  { brand: 'Topps', family: '1961 Topps Baseball', displayName: '1961 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 138 },
  { brand: 'Topps', family: '1962 Topps Baseball', displayName: '1962 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 139 },
  { brand: 'Topps', family: '1963 Topps Baseball', displayName: '1963 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 140 },
  { brand: 'Topps', family: '1964 Topps Baseball', displayName: '1964 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 141 },
  { brand: 'Topps', family: '1965 Topps Baseball', displayName: '1965 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 142 },
  { brand: 'Topps', family: '1966 Topps Baseball', displayName: '1966 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 143 },
  { brand: 'Topps', family: '1967 Topps Baseball', displayName: '1967 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 144 },
  { brand: 'Topps', family: '1968 Topps Baseball', displayName: '1968 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 145 },
  { brand: 'Topps', family: '1969 Topps Baseball', displayName: '1969 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 146 },
  { brand: 'Topps', family: '1970 Topps Baseball', displayName: '1970 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 147 },
  { brand: 'Topps', family: '1971 Topps Baseball', displayName: '1971 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 148 },
  { brand: 'Topps', family: '1972 Topps Baseball', displayName: '1972 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 149 },
  { brand: 'Topps', family: '1973 Topps Baseball', displayName: '1973 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 150 },
  { brand: 'Topps', family: '1974 Topps Baseball', displayName: '1974 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 151 },
  { brand: 'Topps', family: '1975 Topps Baseball', displayName: '1975 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 152 },
  { brand: 'Topps', family: '1976 Topps Baseball', displayName: '1976 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 160 },
  { brand: 'Topps', family: '1977 Topps Baseball', displayName: '1977 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 161 },
  { brand: 'Topps', family: '1978 Topps Baseball', displayName: '1978 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 162 },
  { brand: 'Topps', family: '1979 Topps Baseball', displayName: '1979 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 163 },
  { brand: 'Topps', family: '1980 Topps Baseball', displayName: '1980 Topps Baseball', subcategory: 'vintage', sport: 'baseball', queueOrder: 164 },

  // Vintage Basketball - Gap Fill (1973-1981 Topps)
  { brand: 'Topps', family: '1973 Topps Basketball', displayName: '1973 Topps Basketball', subcategory: 'vintage', sport: 'basketball', queueOrder: 165 },
  { brand: 'Topps', family: '1974 Topps Basketball', displayName: '1974 Topps Basketball', subcategory: 'vintage', sport: 'basketball', queueOrder: 166 },
  { brand: 'Topps', family: '1975 Topps Basketball', displayName: '1975 Topps Basketball', subcategory: 'vintage', sport: 'basketball', queueOrder: 167 },
  { brand: 'Topps', family: '1976 Topps Basketball', displayName: '1976 Topps Basketball', subcategory: 'vintage', sport: 'basketball', queueOrder: 168 },
  { brand: 'Topps', family: '1977 Topps Basketball', displayName: '1977 Topps Basketball', subcategory: 'vintage', sport: 'basketball', queueOrder: 169 },
  { brand: 'Topps', family: '1978 Topps Basketball', displayName: '1978 Topps Basketball', subcategory: 'vintage', sport: 'basketball', queueOrder: 170 },
  { brand: 'Topps', family: '1979 Topps Basketball', displayName: '1979 Topps Basketball', subcategory: 'vintage', sport: 'basketball', queueOrder: 171 },
  { brand: 'Topps', family: '1980 Topps Basketball', displayName: '1980 Topps Basketball', subcategory: 'vintage', sport: 'basketball', queueOrder: 172 },
  { brand: 'Topps', family: '1981 Topps Basketball', displayName: '1981 Topps Basketball', subcategory: 'vintage', sport: 'basketball', queueOrder: 173 },

  // Vintage Football - Gap Fill (1960s-1970s Topps)
  { brand: 'Topps', family: '1960 Topps Football', displayName: '1960 Topps Football', subcategory: 'vintage', sport: 'football', queueOrder: 174 },
  { brand: 'Topps', family: '1961 Topps Football', displayName: '1961 Topps Football', subcategory: 'vintage', sport: 'football', queueOrder: 175 },
  { brand: 'Topps', family: '1962 Topps Football', displayName: '1962 Topps Football', subcategory: 'vintage', sport: 'football', queueOrder: 176 },
  { brand: 'Topps', family: '1963 Topps Football', displayName: '1963 Topps Football', subcategory: 'vintage', sport: 'football', queueOrder: 177 },
  { brand: 'Topps', family: '1964 Topps Football', displayName: '1964 Topps Football', subcategory: 'vintage', sport: 'football', queueOrder: 178 },
  { brand: 'Topps', family: '1966 Topps Football', displayName: '1966 Topps Football', subcategory: 'vintage', sport: 'football', queueOrder: 179 },
  { brand: 'Topps', family: '1967 Topps Football', displayName: '1967 Topps Football', subcategory: 'vintage', sport: 'football', queueOrder: 180 },
  { brand: 'Topps', family: '1968 Topps Football', displayName: '1968 Topps Football', subcategory: 'vintage', sport: 'football', queueOrder: 181 },
  { brand: 'Topps', family: '1969 Topps Football', displayName: '1969 Topps Football', subcategory: 'vintage', sport: 'football', queueOrder: 182 },
  { brand: 'Topps', family: '1970 Topps Football', displayName: '1970 Topps Football', subcategory: 'vintage', sport: 'football', queueOrder: 183 },
  { brand: 'Topps', family: '1971 Topps Football', displayName: '1971 Topps Football', subcategory: 'vintage', sport: 'football', queueOrder: 184 },
  { brand: 'Topps', family: '1972 Topps Football', displayName: '1972 Topps Football', subcategory: 'vintage', sport: 'football', queueOrder: 185 },
  { brand: 'Topps', family: '1973 Topps Football', displayName: '1973 Topps Football', subcategory: 'vintage', sport: 'football', queueOrder: 186 },
  { brand: 'Topps', family: '1974 Topps Football', displayName: '1974 Topps Football', subcategory: 'vintage', sport: 'football', queueOrder: 187 },
  { brand: 'Topps', family: '1975 Topps Football', displayName: '1975 Topps Football', subcategory: 'vintage', sport: 'football', queueOrder: 188 },
  { brand: 'Topps', family: '1977 Topps Football', displayName: '1977 Topps Football', subcategory: 'vintage', sport: 'football', queueOrder: 189 },
  { brand: 'Topps', family: '1978 Topps Football', displayName: '1978 Topps Football', subcategory: 'vintage', sport: 'football', queueOrder: 190 },
  { brand: 'Topps', family: '1979 Topps Football', displayName: '1979 Topps Football', subcategory: 'vintage', sport: 'football', queueOrder: 191 },
  { brand: 'Topps', family: '1980 Topps Football', displayName: '1980 Topps Football', subcategory: 'vintage', sport: 'football', queueOrder: 192 },

  // Pokemon TCG - Missing Neo Era + 2024-2025 Sets
  { brand: 'Pokemon', family: 'Neo Revelation', displayName: 'Pokemon Neo Revelation', subcategory: 'pokemon', sport: null, queueOrder: 153 },
  { brand: 'Pokemon', family: 'Neo Destiny', displayName: 'Pokemon Neo Destiny', subcategory: 'pokemon', sport: null, queueOrder: 154 },
  { brand: 'Pokemon', family: 'Shrouded Fable', displayName: 'Pokemon Shrouded Fable', subcategory: 'pokemon', sport: null, queueOrder: 155 },
  { brand: 'Pokemon', family: 'Twilight Masquerade', displayName: 'Pokemon Twilight Masquerade', subcategory: 'pokemon', sport: null, queueOrder: 156 },
  { brand: 'Pokemon', family: 'Stellar Crown', displayName: 'Pokemon Stellar Crown', subcategory: 'pokemon', sport: null, queueOrder: 157 },
  { brand: 'Pokemon', family: 'Surging Sparks', displayName: 'Pokemon Surging Sparks', subcategory: 'pokemon', sport: null, queueOrder: 158 },
  { brand: 'Pokemon', family: 'Prismatic Evolutions', displayName: 'Pokemon Prismatic Evolutions', subcategory: 'pokemon', sport: null, queueOrder: 159 },

  // Graded Card Slabs - Visual matching identifies holder type, OCR reads grade from label
  { brand: 'PSA', family: 'PSA Slab', displayName: 'PSA Graded Card Slab', subcategory: 'graded', sport: null, queueOrder: 118 },
  { brand: 'BGS', family: 'BGS Slab', displayName: 'BGS/Beckett Graded Card Slab', subcategory: 'graded', sport: null, queueOrder: 119 },
  { brand: 'SGC', family: 'SGC Slab', displayName: 'SGC Graded Card Slab', subcategory: 'graded', sport: null, queueOrder: 120 },
  { brand: 'CGC', family: 'CGC Slab', displayName: 'CGC Graded Card Slab', subcategory: 'graded', sport: null, queueOrder: 121 },

  // Modern Parallels - High Value Variants
  { brand: 'Panini', family: 'Prizm Silver', displayName: 'Panini Prizm Silver Parallels', subcategory: 'parallels', sport: null, queueOrder: 124 },
  { brand: 'Panini', family: 'Prizm Gold', displayName: 'Panini Prizm Gold Parallels', subcategory: 'parallels', sport: null, queueOrder: 125 },
  { brand: 'Panini', family: 'Prizm Black', displayName: 'Panini Prizm Black Parallels', subcategory: 'parallels', sport: null, queueOrder: 126 },
  { brand: 'Panini', family: 'Select Tie Dye', displayName: 'Panini Select Tie Dye Parallels', subcategory: 'parallels', sport: null, queueOrder: 127 },
  { brand: 'Panini', family: 'Optic Holo', displayName: 'Panini Optic Holo Parallels', subcategory: 'parallels', sport: null, queueOrder: 128 },
  { brand: 'Topps', family: 'Sapphire Chrome', displayName: 'Topps Sapphire Chrome', subcategory: 'parallels', sport: null, queueOrder: 129 },
  { brand: 'Topps', family: 'Gold Refractor', displayName: 'Topps Gold Refractor', subcategory: 'parallels', sport: null, queueOrder: 130 },
  { brand: 'Topps', family: 'Superfractor', displayName: 'Topps Superfractor 1/1', subcategory: 'parallels', sport: null, queueOrder: 131 },

  // Autograph & Relic Cards
  { brand: 'Panini', family: 'Rookie Patch Auto', displayName: 'Panini Rookie Patch Auto (RPA)', subcategory: 'auto_relic', sport: null, queueOrder: 132 },
  { brand: 'Panini', family: 'National Treasures Auto', displayName: 'Panini National Treasures Auto', subcategory: 'auto_relic', sport: null, queueOrder: 133 },
  { brand: 'Topps', family: 'Bowman Chrome Auto', displayName: 'Topps Bowman Chrome Auto', subcategory: 'auto_relic', sport: null, queueOrder: 134 },
  { brand: 'Topps', family: 'Dynasty Auto Patch', displayName: 'Topps Dynasty Auto Patch', subcategory: 'auto_relic', sport: null, queueOrder: 135 },
];

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface SerpApiImageResult {
  original: string;
  thumbnail?: string;
  title?: string;
}

async function searchSerpApiCards(query: string): Promise<{ images: SerpApiImageResult[]; apiCalled: boolean }> {
  try {
    const serpApiKey = process.env.SERPAPI_KEY;
    if (!serpApiKey) {
      console.log('    SerpAPI key not configured');
      return { images: [], apiCalled: false };
    }

    const searchQuery = `${query} trading card`;
    const url = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(searchQuery)}&num=20&api_key=${serpApiKey}`;

    const response = await fetch(url);

    if (response.status === 429 || response.status === 503) {
      console.log(`    Rate limited (${response.status}), waiting ${DELAY_ON_RATE_LIMIT_MS / 1000}s...`);
      await delay(DELAY_ON_RATE_LIMIT_MS);
      return { images: [], apiCalled: true };
    }

    if (!response.ok) {
      console.error(`SerpAPI error: ${response.status}`);
      return { images: [], apiCalled: true };
    }

    const data = await response.json();
    
    if (data.error) {
      console.error(`SerpAPI error: ${data.error}`);
      return { images: [], apiCalled: true };
    }

    return { images: data.images_results || [], apiCalled: true };
  } catch (error) {
    console.error('Error searching SerpAPI:', error);
    return { images: [], apiCalled: false };
  }
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer;
  } catch {
    return null;
  }
}

function validateImage(buffer: Buffer): { valid: boolean; reason?: string; width?: number; height?: number } {
  if (buffer.length < 20 * 1024) {
    return { valid: false, reason: 'too_small' };
  }

  const header = buffer.subarray(0, 12).toString('hex');
  let isValidFormat = false;
  
  if (header.startsWith('ffd8ff')) isValidFormat = true;
  else if (header.startsWith('89504e47')) isValidFormat = true;
  else if (header.startsWith('47494638')) isValidFormat = true;
  else if (header.startsWith('52494646') && buffer.subarray(8, 12).toString('hex') === '57454250') isValidFormat = true;

  if (!isValidFormat) {
    return { valid: false, reason: 'invalid_format' };
  }

  return { valid: true, width: 400, height: 400 };
}

async function storeCardImage(
  familyId: number,
  brand: string,
  family: string,
  imageData: Buffer,
  originalUrl: string,
  metadata?: { year?: string; player?: string; parallel?: string; grade?: string }
): Promise<{ stored: boolean; reason?: string }> {
  try {
    const sha256 = crypto.createHash('sha256').update(imageData).digest('hex');
    
    const existing = await db
      .select({ id: cardImages.id })
      .from(cardImages)
      .where(eq(cardImages.sha256, sha256))
      .limit(1);
    
    if (existing.length > 0) {
      return { stored: false, reason: 'duplicate' };
    }

    const validation = validateImage(imageData);
    if (!validation.valid) {
      return { stored: false, reason: validation.reason };
    }

    const storagePath = `cards/${brand}/${family}/${familyId}/${sha256}.jpg`;
    
    let embedding: number[] | null = null;
    try {
      const embeddingResult = await generateImageEmbedding(imageData);
      embedding = embeddingResult.embedding;
    } catch (err) {
      console.error('Failed to generate embedding:', err);
    }

    await db.insert(cardImages).values({
      familyId,
      sha256,
      storagePath,
      originalUrl,
      fileSize: imageData.length,
      width: validation.width || 400,
      height: validation.height || 400,
      contentType: 'image/jpeg',
      source: 'serpapi',
      embedding,
      year: metadata?.year,
      player: metadata?.player,
      parallel: metadata?.parallel,
      grade: metadata?.grade,
    });

    return { stored: true };
  } catch (error) {
    console.error('Error storing card image:', error);
    return { stored: false, reason: 'store_error' };
  }
}

async function seedSingleCardFamily(
  family: { id: number; brand: string; family: string; displayName: string; subcategory: string; sport: string | null },
  failureReasons: Map<string, number>
): Promise<{ status: string; imagesStored: number; listingsScanned: number; apiCalls: number; downloadFailed: number }> {
  const result = { status: 'active', imagesStored: 0, listingsScanned: 0, apiCalls: 0, downloadFailed: 0 };
  
  const existingSha256s = new Set<string>();
  const existingImages = await db
    .select({ sha256: cardImages.sha256 })
    .from(cardImages)
    .where(eq(cardImages.familyId, family.id));
  existingImages.forEach(img => existingSha256s.add(img.sha256));

  let currentImageCount = existingImages.length;
  console.log(`  Starting with ${currentImageCount} images`);

  const searchTerms = [
    `${family.displayName}`,
    `${family.brand} ${family.family}`,
  ];

  for (const query of searchTerms) {
    if (currentImageCount >= IMAGES_TARGET_PER_FAMILY) break;

    console.log(`  Query: "${query}"`);

    const { images, apiCalled } = await searchSerpApiCards(query);
    if (apiCalled) result.apiCalls++;

    if (!images || images.length === 0) {
      console.log(`    No results from SerpAPI`);
      continue;
    }

    console.log(`    Processing ${images.length} images from SerpAPI`);

    for (const image of images) {
      if (currentImageCount >= IMAGES_TARGET_PER_FAMILY) break;

      if (!image.original) continue;
      
      // Filter by title if available
      const title = (image.title || '').toLowerCase();
      if (JUNK_TITLE_FILTERS.some(f => title.includes(f))) continue;

      result.listingsScanned++;
      
      const imageData = await downloadImage(image.original);
      if (!imageData) {
        result.downloadFailed++;
        const reason = 'download_failed';
        failureReasons.set(reason, (failureReasons.get(reason) || 0) + 1);
        continue;
      }

      const sha256 = crypto.createHash('sha256').update(imageData).digest('hex');
      if (existingSha256s.has(sha256)) continue;

      // Extract metadata from title
      const imageTitle = image.title || '';
      const parallel = extractParallelFromTitle(imageTitle, family.sport, family.subcategory);
      const year = extractYearFromTitle(imageTitle);
      
      const storeResult = await storeCardImage(family.id, family.brand, family.family, imageData, image.original, {
        parallel,
        year,
      });
      if (storeResult.stored) {
        existingSha256s.add(sha256);
        currentImageCount++;
        result.imagesStored++;
        const parallelLabel = parallel ? ` (${parallel})` : '';
        console.log(`    Stored image ${result.imagesStored}${parallelLabel}`);
      } else if (storeResult.reason) {
        failureReasons.set(storeResult.reason, (failureReasons.get(storeResult.reason) || 0) + 1);
        if (storeResult.reason !== 'duplicate') result.downloadFailed++;
      }

      await delay(200);
    }

    await delay(DELAY_BETWEEN_REQUESTS_MS);
  }

  if (currentImageCount >= IMAGES_TARGET_PER_FAMILY) {
    result.status = 'locked';
    await db.update(cardFamilies)
      .set({ status: 'locked', updatedAt: new Date() })
      .where(eq(cardFamilies.id, family.id));
  } else if (result.listingsScanned >= MAX_LISTINGS_PER_FAMILY) {
    result.status = 'hard';
    await db.update(cardFamilies)
      .set({ status: 'hard', listingsScanned: result.listingsScanned, updatedAt: new Date() })
      .where(eq(cardFamilies.id, family.id));
  } else {
    await db.update(cardFamilies)
      .set({ listingsScanned: result.listingsScanned, updatedAt: new Date() })
      .where(eq(cardFamilies.id, family.id));
  }

  console.log(`  Result: ${currentImageCount} images, status: ${result.status}`);
  return result;
}

export async function initializeCardFamilies(): Promise<void> {
  console.log('[CardSeeder] Initializing card families...');
  
  for (const family of CARD_FAMILIES) {
    try {
      await db.insert(cardFamilies).values({
        brand: family.brand,
        family: family.family,
        displayName: family.displayName,
        subcategory: family.subcategory,
        sport: family.sport,
        queueOrder: family.queueOrder,
        status: family.queueOrder <= MAX_ACTIVE_FAMILIES ? 'active' : 'queued',
      }).onConflictDoNothing();
    } catch (error) {
      // Ignore duplicate errors
    }
  }

  const count = await db.select({ count: sql<number>`count(*)` }).from(cardFamilies);
  console.log(`[CardSeeder] ${count[0]?.count || 0} card families initialized`);
}

export async function runCardImageSeeder(): Promise<CardSeedReport> {
  console.log('[CardSeeder] Starting card image seeder...');
  
  await initializeCardFamilies();

  const stats = {
    totalApiCalls: 0,
    totalImagesStored: 0,
    totalDownloadFailed: 0,
    totalDownloadSuccess: 0,
    lockedFamilies: [] as any[],
    activeFamilies: [] as any[],
    hardFamilies: [] as any[],
    failureReasons: new Map<string, number>(),
  };

  const activeFamilies = await db
    .select()
    .from(cardFamilies)
    .where(eq(cardFamilies.status, 'active'))
    .orderBy(asc(cardFamilies.queueOrder))
    .limit(MAX_ACTIVE_FAMILIES);

  if (activeFamilies.length === 0) {
    const queuedFamilies = await db
      .select()
      .from(cardFamilies)
      .where(eq(cardFamilies.status, 'queued'))
      .orderBy(asc(cardFamilies.queueOrder))
      .limit(MAX_ACTIVE_FAMILIES);

    for (const fam of queuedFamilies) {
      await db.update(cardFamilies)
        .set({ status: 'active' })
        .where(eq(cardFamilies.id, fam.id));
    }
    console.log(`[CardSeeder] Activated ${queuedFamilies.length} families from queue`);
  }

  for (const family of activeFamilies) {
    console.log(`\n[CardSeeder] Processing: ${family.displayName}`);
    
    const result = await seedSingleCardFamily(family, stats.failureReasons);
    
    stats.totalApiCalls += result.apiCalls;
    stats.totalImagesStored += result.imagesStored;
    stats.totalDownloadFailed += result.downloadFailed;

    if (result.status === 'locked') {
      const nextQueued = await db
        .select()
        .from(cardFamilies)
        .where(eq(cardFamilies.status, 'queued'))
        .orderBy(asc(cardFamilies.queueOrder))
        .limit(1);

      if (nextQueued.length > 0) {
        await db.update(cardFamilies)
          .set({ status: 'active' })
          .where(eq(cardFamilies.id, nextQueued[0].id));
        console.log(`  Activated next family: ${nextQueued[0].displayName}`);
      }
    }

    await delay(1000);
  }

  const allFamilies = await db.select().from(cardFamilies);
  const allImages = await db.select({ count: sql<number>`count(*)` }).from(cardImages);
  
  const familyImageCounts = await db
    .select({
      familyId: cardImages.familyId,
      count: sql<number>`count(*)`,
    })
    .from(cardImages)
    .where(ne(cardImages.source, 'serp_bootstrap'))
    .groupBy(cardImages.familyId);

  const imageCountMap = new Map(familyImageCounts.map(f => [f.familyId, Number(f.count)]));

  const lockedFamilies = allFamilies
    .filter(f => f.status === 'locked')
    .map(f => ({
      brand: f.brand,
      family: f.family,
      imageCount: imageCountMap.get(f.id) || 0,
      subcategory: f.subcategory,
      sport: f.sport || undefined,
    }));

  const activeFams = allFamilies
    .filter(f => f.status === 'active')
    .map(f => ({
      brand: f.brand,
      family: f.family,
      imageCount: imageCountMap.get(f.id) || 0,
      subcategory: f.subcategory,
      sport: f.sport || undefined,
    }));

  const queuedFamilies = allFamilies
    .filter(f => f.status === 'queued')
    .map(f => ({
      brand: f.brand,
      family: f.family,
      imageCount: imageCountMap.get(f.id) || 0,
      subcategory: f.subcategory,
      sport: f.sport || undefined,
    }));

  const hardFamilies = allFamilies
    .filter(f => f.status === 'hard')
    .map(f => ({
      brand: f.brand,
      family: f.family,
      imageCount: imageCountMap.get(f.id) || 0,
      listingsScanned: f.listingsScanned,
      subcategory: f.subcategory,
      sport: f.sport || undefined,
    }));

  const totalImages = Number(allImages[0]?.count || 0);
  const imageCounts = Array.from(imageCountMap.values());
  const minImages = imageCounts.length > 0 ? Math.min(...imageCounts) : 0;
  const maxImages = imageCounts.length > 0 ? Math.max(...imageCounts) : 0;

  return {
    totalFamilies: allFamilies.length,
    totalImages,
    minImagesPerFamily: minImages,
    maxImagesPerFamily: maxImages,
    avgImagesPerFamily: allFamilies.length > 0 ? Math.round(totalImages / allFamilies.length) : 0,
    lockedFamilies,
    activeFamilies: activeFams,
    queuedFamilies,
    hardFamilies,
    apiStats: {
      totalApiCalls: stats.totalApiCalls,
      downloadSuccess: stats.totalImagesStored,
      downloadFailed: stats.totalDownloadFailed,
      topFailureReasons: Array.from(stats.failureReasons.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([reason, count]) => ({ reason, count })),
    },
  };
}

export async function getCardSeedReport(): Promise<CardSeedReport> {
  const allFamilies = await db.select().from(cardFamilies);
  const allImages = await db.select({ count: sql<number>`count(*)` }).from(cardImages);
  
  const familyImageCounts = await db
    .select({
      familyId: cardImages.familyId,
      count: sql<number>`count(*)`,
    })
    .from(cardImages)
    .where(ne(cardImages.source, 'serp_bootstrap'))
    .groupBy(cardImages.familyId);

  const imageCountMap = new Map(familyImageCounts.map(f => [f.familyId, Number(f.count)]));

  const lockedFamilies = allFamilies
    .filter(f => f.status === 'locked')
    .map(f => ({
      brand: f.brand,
      family: f.family,
      imageCount: imageCountMap.get(f.id) || 0,
      subcategory: f.subcategory,
      sport: f.sport || undefined,
    }));

  const activeFamilies = allFamilies
    .filter(f => f.status === 'active')
    .map(f => ({
      brand: f.brand,
      family: f.family,
      imageCount: imageCountMap.get(f.id) || 0,
      subcategory: f.subcategory,
      sport: f.sport || undefined,
    }));

  const queuedFamilies = allFamilies
    .filter(f => f.status === 'queued')
    .map(f => ({
      brand: f.brand,
      family: f.family,
      imageCount: imageCountMap.get(f.id) || 0,
      subcategory: f.subcategory,
      sport: f.sport || undefined,
    }));

  const hardFamilies = allFamilies
    .filter(f => f.status === 'hard')
    .map(f => ({
      brand: f.brand,
      family: f.family,
      imageCount: imageCountMap.get(f.id) || 0,
      listingsScanned: f.listingsScanned,
      subcategory: f.subcategory,
      sport: f.sport || undefined,
    }));

  const totalImages = Number(allImages[0]?.count || 0);
  const imageCounts = Array.from(imageCountMap.values());
  const minImages = imageCounts.length > 0 ? Math.min(...imageCounts) : 0;
  const maxImages = imageCounts.length > 0 ? Math.max(...imageCounts) : 0;

  return {
    totalFamilies: allFamilies.length,
    totalImages,
    minImagesPerFamily: minImages,
    maxImagesPerFamily: maxImages,
    avgImagesPerFamily: allFamilies.length > 0 ? Math.round(totalImages / allFamilies.length) : 0,
    lockedFamilies,
    activeFamilies,
    queuedFamilies,
    hardFamilies,
    apiStats: {
      totalApiCalls: 0,
      downloadSuccess: totalImages,
      downloadFailed: 0,
      topFailureReasons: [],
    },
  };
}

console.log('[CardSeeder] Module loaded with', CARD_FAMILIES.length, 'families defined');
