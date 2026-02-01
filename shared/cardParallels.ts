/**
 * Sports Card Parallel/Variation Checklist
 * 
 * Complete checklists for 5 major brands covering 2015-2025:
 * 1. Panini - Prizm, Mosaic, Select, Optic, National Treasures, Flawless, Contenders
 * 2. Topps - Chrome, Bowman Chrome, Stadium Club, Archives
 * 3. Upper Deck - SP Authentic, Exquisite, The Cup (Hockey)
 * 4. Leaf - Metal, Trinity
 * 5. Fanatics - Topps Now, Bowman Draft
 */

export interface CardParallel {
  id: string;
  label: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'super-rare';
  numbered?: string; // e.g., "/199", "/25"
}

export interface CardSet {
  brand: string;
  set: string;
  year: number;
  sport: 'football' | 'basketball' | 'baseball' | 'hockey' | 'soccer' | 'multi' | 'pokemon' | 'marvel' | 'non-sport';
  parallels: CardParallel[];
}

// ============================================================================
// PANINI BRAND (2020-2025)
// ============================================================================

// Prizm Football 2024 (Complete with all 40+ variations)
const PRIZM_FOOTBALL_2024: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'silver', label: 'Silver Prizm', rarity: 'uncommon' },
  // Numbered parallels
  { id: 'pandora', label: 'Pandora', rarity: 'uncommon', numbered: '/400' },
  { id: 'red', label: 'Red', rarity: 'uncommon', numbered: '/299' },
  { id: 'pink', label: 'Pink', rarity: 'uncommon', numbered: '/249' },
  { id: 'orange', label: 'Orange', rarity: 'uncommon', numbered: '/249' },
  { id: 'blue-wave', label: 'Blue Wave', rarity: 'uncommon', numbered: '/230' },
  { id: 'purple-ice', label: 'Purple Ice', rarity: 'uncommon', numbered: '/225' },
  { id: 'hyper', label: 'Hyper', rarity: 'uncommon', numbered: '/180' },
  { id: 'red-wave', label: 'Red Wave', rarity: 'rare', numbered: '/149' },
  { id: 'purple', label: 'Purple', rarity: 'rare', numbered: '/125' },
  { id: 'blue-ice', label: 'Blue Ice', rarity: 'rare', numbered: '/99' },
  { id: 'no-huddle-blue', label: 'No Huddle Blue', rarity: 'rare', numbered: '/99' },
  { id: 'purple-wave', label: 'Purple Wave', rarity: 'rare', numbered: '/99' },
  { id: 'blue-sparkle', label: 'Blue Sparkle', rarity: 'rare', numbered: '/96' },
  { id: 'no-huddle-red', label: 'No Huddle Red', rarity: 'rare', numbered: '/75' },
  { id: 'green-scope', label: 'Green Scope', rarity: 'rare', numbered: '/75' },
  { id: 'orange-wave', label: 'Orange Wave', rarity: 'rare', numbered: '/60' },
  { id: 'no-huddle-purple', label: 'No Huddle Purple', rarity: 'rare', numbered: '/49' },
  { id: 'purple-power', label: 'Purple Power', rarity: 'rare', numbered: '/49' },
  { id: 'red-yellow', label: 'Red and Yellow', rarity: 'rare', numbered: '/44' },
  { id: 'white', label: 'White', rarity: 'rare', numbered: '/35' },
  { id: 'red-shimmer', label: 'Red Shimmer', rarity: 'rare', numbered: '/35' },
  { id: 'no-huddle-pink', label: 'No Huddle Pink', rarity: 'rare', numbered: '/25' },
  { id: 'navy-camo', label: 'Navy Camo', rarity: 'rare', numbered: '/25' },
  { id: 'blue-shimmer', label: 'Blue Shimmer', rarity: 'rare', numbered: '/25' },
  { id: 'gold-sparkle', label: 'Gold Sparkle', rarity: 'super-rare', numbered: '/24' },
  { id: 'choice-red', label: 'Choice Red', rarity: 'super-rare', numbered: '/20' },
  { id: 'forest-camo', label: 'Forest Camo', rarity: 'super-rare', numbered: '/15' },
  { id: 'choice-cherry-blossom', label: 'Choice Cherry Blossom', rarity: 'super-rare', numbered: '/15' },
  { id: 'choice-blue', label: 'Choice Blue', rarity: 'super-rare', numbered: '/14' },
  { id: 'gold-wave', label: 'Gold Wave', rarity: 'super-rare', numbered: '/10' },
  { id: 'gold', label: 'Gold', rarity: 'super-rare', numbered: '/10' },
  { id: 'choice-gold', label: 'Choice Gold', rarity: 'super-rare', numbered: '/10' },
  { id: 'gold-shimmer', label: 'Gold Shimmer', rarity: 'super-rare', numbered: '/10' },
  { id: 'no-huddle-neon-green', label: 'No Huddle Neon Green', rarity: 'super-rare', numbered: '/10' },
  { id: 'green-sparkle', label: 'Green Sparkle', rarity: 'super-rare', numbered: '/8' },
  { id: 'green-shimmer', label: 'Green Shimmer', rarity: 'super-rare', numbered: '/5' },
  { id: 'gold-vinyl', label: 'Gold Vinyl', rarity: 'super-rare', numbered: '/5' },
  { id: 'white-knight', label: 'White Knight', rarity: 'super-rare', numbered: '/3' },
  { id: 'choice-nebula', label: 'Choice Nebula', rarity: 'super-rare', numbered: '/1' },
  { id: 'black-stars', label: 'Black Stars', rarity: 'super-rare', numbered: '/1' },
  { id: 'black-shimmer', label: 'Black Shimmer', rarity: 'super-rare', numbered: '/1' },
  { id: 'black', label: 'Black', rarity: 'super-rare', numbered: '/1' },
  // Unnumbered parallels
  { id: 'red-white-blue', label: 'Red White & Blue', rarity: 'uncommon' },
  { id: 'black-red-checker', label: 'Black & Red Checker', rarity: 'uncommon' },
  { id: 'black-white-checker', label: 'Black & White Checker', rarity: 'uncommon' },
  { id: 'blue', label: 'Blue', rarity: 'uncommon' },
  { id: 'disco', label: 'Disco', rarity: 'rare' },
  { id: 'green', label: 'Green', rarity: 'uncommon' },
  { id: 'green-ice', label: 'Green Ice', rarity: 'rare' },
  { id: 'green-wave', label: 'Green Wave', rarity: 'rare' },
  { id: 'lazer', label: 'Lazer', rarity: 'rare' },
  { id: 'neon-green-pulsar', label: 'Neon Green Pulsar', rarity: 'rare' },
  { id: 'orange-ice', label: 'Orange Ice', rarity: 'rare' },
  { id: 'pink-wave', label: 'Pink Wave', rarity: 'rare' },
  { id: 'purple-pulsar', label: 'Purple Pulsar', rarity: 'rare' },
  { id: 'red-sparkle', label: 'Red Sparkle', rarity: 'rare' },
  { id: 'snakeskin', label: 'Snakeskin', rarity: 'rare' },
  { id: 'white-sparkle', label: 'White Sparkle', rarity: 'rare' },
  { id: 'white-tiger', label: 'White Tiger Stripe', rarity: 'rare' },
];

// Prizm Basketball 2024-25 (Complete with 80+ variations)
const PRIZM_BASKETBALL_2024: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'silver', label: 'Silver Prizm', rarity: 'uncommon' },
  // Numbered parallels
  { id: 'red', label: 'Red', rarity: 'uncommon', numbered: '/299' },
  { id: 'red-seismic', label: 'Red Seismic', rarity: 'uncommon', numbered: '/299' },
  { id: 'white-lazer', label: 'White Lazer', rarity: 'uncommon', numbered: '/275' },
  { id: 'pink', label: 'Pink', rarity: 'uncommon', numbered: '/249' },
  { id: 'skewed', label: 'Skewed', rarity: 'uncommon', numbered: '/249' },
  { id: 'basketball', label: 'Basketball', rarity: 'uncommon', numbered: '/225' },
  { id: 'teal-ice', label: 'Teal Ice', rarity: 'uncommon', numbered: '/225' },
  { id: 'blue', label: 'Blue', rarity: 'uncommon', numbered: '/199' },
  { id: 'orange-seismic', label: 'Orange Seismic', rarity: 'uncommon', numbered: '/199' },
  { id: 'white', label: 'White', rarity: 'rare', numbered: '/175' },
  { id: 'fast-break-blue', label: 'Fast Break Blue', rarity: 'rare', numbered: '/150' },
  { id: 'purple-ice', label: 'Purple Ice', rarity: 'rare', numbered: '/149' },
  { id: 'blue-sparkle', label: 'Blue Sparkle', rarity: 'rare', numbered: '/144' },
  { id: 'blue-ice', label: 'Blue Ice', rarity: 'rare', numbered: '/125' },
  { id: 'fast-break-orange', label: 'Fast Break Orange', rarity: 'rare', numbered: '/125' },
  { id: 'wave-blue', label: 'Wave Blue', rarity: 'rare', numbered: '/125' },
  { id: 'fast-break-red', label: 'Fast Break Red', rarity: 'rare', numbered: '/100' },
  { id: 'blue-pulsar', label: 'Blue Pulsar', rarity: 'rare', numbered: '/99' },
  { id: 'blue-seismic', label: 'Blue Seismic', rarity: 'rare', numbered: '/99' },
  { id: 'purple', label: 'Purple', rarity: 'rare', numbered: '/99' },
  { id: 'dragon-year', label: 'Dragon Year', rarity: 'rare', numbered: '/88' },
  { id: 'multi-wave', label: 'Multi Wave', rarity: 'rare', numbered: '/88' },
  { id: 'choice-red', label: 'Choice Red', rarity: 'rare', numbered: '/88' },
  { id: 'red-power', label: 'Red Power', rarity: 'rare', numbered: '/75' },
  { id: 'red-pulsar', label: 'Red Pulsar', rarity: 'rare', numbered: '/75' },
  { id: 'fast-break-purple', label: 'Fast Break Purple', rarity: 'rare', numbered: '/75' },
  { id: 'wave-orange', label: 'Wave Orange', rarity: 'rare', numbered: '/60' },
  { id: 'orange', label: 'Orange', rarity: 'rare', numbered: '/49' },
  { id: 'choice-blue', label: 'Choice Blue', rarity: 'rare', numbered: '/49' },
  { id: 'jade-dragon', label: 'Jade Dragon Scale', rarity: 'rare', numbered: '/48' },
  { id: 'pink-pulsar', label: 'Pink Pulsar', rarity: 'rare', numbered: '/42' },
  { id: 'white-wave', label: 'White Wave', rarity: 'rare', numbered: '/38' },
  { id: 'blue-shimmer-fotl', label: 'Blue Shimmer FOTL', rarity: 'super-rare', numbered: '/35' },
  { id: 'purple-pulsar', label: 'Purple Pulsar', rarity: 'super-rare', numbered: '/35' },
  { id: 'red-lazer', label: 'Red Lazer', rarity: 'super-rare', numbered: '/35' },
  { id: 'white-ice', label: 'White Ice', rarity: 'super-rare', numbered: '/35' },
  { id: 'green-pulsar', label: 'Green Pulsar', rarity: 'super-rare', numbered: '/25' },
  { id: 'mojo', label: 'Mojo', rarity: 'super-rare', numbered: '/25' },
  { id: 'gold-sparkle', label: 'Gold Sparkle', rarity: 'super-rare', numbered: '/24' },
  { id: 'choice-cherry-blossom', label: 'Choice Cherry Blossom', rarity: 'super-rare', numbered: '/20' },
  { id: 'fast-break-bronze', label: 'Fast Break Bronze', rarity: 'super-rare', numbered: '/20' },
  { id: 'lotus-flower', label: 'Lotus Flower', rarity: 'super-rare', numbered: '/18' },
  { id: 'gold', label: 'Gold', rarity: 'super-rare', numbered: '/10' },
  { id: 'gold-shimmer-fotl', label: 'Gold Shimmer FOTL', rarity: 'super-rare', numbered: '/10' },
  { id: 'ice-gold', label: 'Ice Gold', rarity: 'super-rare', numbered: '/10' },
  { id: 'lazer-gold', label: 'Lazer Gold', rarity: 'super-rare', numbered: '/10' },
  { id: 'wave-gold', label: 'Wave Gold', rarity: 'super-rare', numbered: '/10' },
  { id: 'choice-green', label: 'Choice Green', rarity: 'super-rare', numbered: '/8' },
  { id: 'green-sparkle', label: 'Green Sparkle', rarity: 'super-rare', numbered: '/8' },
  { id: 'lucky-envelopes', label: 'Lucky Envelopes', rarity: 'super-rare', numbered: '/8' },
  { id: 'plum-blossom', label: 'Plum Blossom', rarity: 'super-rare', numbered: '/8' },
  { id: 'fast-break-neon-green', label: 'Fast Break Neon Green', rarity: 'super-rare', numbered: '/5' },
  { id: 'black-gold', label: 'Black Gold', rarity: 'super-rare', numbered: '/1' },
  { id: 'choice-nebula', label: 'Choice Nebula', rarity: 'super-rare', numbered: '/1' },
  { id: 'black', label: 'Black', rarity: 'super-rare', numbered: '/1' },
  // Unnumbered parallels
  { id: 'red-white-blue', label: 'Red White & Blue', rarity: 'uncommon' },
  { id: 'china', label: 'China', rarity: 'uncommon' },
  { id: 'black-white', label: 'Black White', rarity: 'uncommon' },
  { id: 'glitter', label: 'Glitter', rarity: 'rare' },
  { id: 'green-ice', label: 'Green Ice', rarity: 'rare' },
  { id: 'green-wave', label: 'Green Wave', rarity: 'rare' },
  { id: 'hyper', label: 'Hyper', rarity: 'rare' },
  { id: 'ice', label: 'Ice', rarity: 'rare' },
  { id: 'orange-ice', label: 'Orange Ice', rarity: 'rare' },
  { id: 'pink-ice', label: 'Pink Ice', rarity: 'rare' },
  { id: 'pulsar', label: 'Pulsar', rarity: 'rare' },
  { id: 'red-ice', label: 'Red Ice', rarity: 'rare' },
  { id: 'red-sparkle', label: 'Red Sparkle', rarity: 'rare' },
  { id: 'ruby-wave', label: 'Ruby Wave', rarity: 'rare' },
  { id: 'snakeskin', label: 'Snakeskin', rarity: 'rare' },
  { id: 'wave', label: 'Wave', rarity: 'rare' },
  { id: 'white-sparkle', label: 'White Sparkle', rarity: 'rare' },
  { id: 'white-tiger', label: 'White Tiger Stripe', rarity: 'rare' },
];

// Prizm Standard (2020-2023, less variations than 2024)
const PRIZM_STANDARD: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'silver', label: 'Silver Prizm', rarity: 'uncommon' },
  { id: 'red-white-blue', label: 'Red White & Blue', rarity: 'uncommon' },
  { id: 'blue', label: 'Blue', rarity: 'uncommon', numbered: '/199' },
  { id: 'blue-shimmer', label: 'Blue Shimmer', rarity: 'rare', numbered: '/175' },
  { id: 'blue-wave', label: 'Blue Wave', rarity: 'rare', numbered: '/149' },
  { id: 'green', label: 'Green', rarity: 'uncommon', numbered: '/275' },
  { id: 'green-shimmer', label: 'Green Shimmer', rarity: 'rare', numbered: '/75' },
  { id: 'green-wave', label: 'Green Wave', rarity: 'rare', numbered: '/75' },
  { id: 'hyper', label: 'Hyper', rarity: 'rare' },
  { id: 'lazer', label: 'Lazer', rarity: 'rare' },
  { id: 'orange', label: 'Orange', rarity: 'rare', numbered: '/249' },
  { id: 'orange-wave', label: 'Orange Wave', rarity: 'rare', numbered: '/75' },
  { id: 'pink', label: 'Pink', rarity: 'rare' },
  { id: 'pink-wave', label: 'Pink Wave', rarity: 'rare' },
  { id: 'purple', label: 'Purple', rarity: 'rare', numbered: '/100' },
  { id: 'purple-wave', label: 'Purple Wave', rarity: 'rare' },
  { id: 'purple-ice', label: 'Purple Ice', rarity: 'rare', numbered: '/149' },
  { id: 'red', label: 'Red', rarity: 'rare', numbered: '/299' },
  { id: 'red-shimmer', label: 'Red Shimmer', rarity: 'rare', numbered: '/35' },
  { id: 'red-wave', label: 'Red Wave', rarity: 'rare', numbered: '/149' },
  { id: 'red-ice', label: 'Red Ice', rarity: 'rare', numbered: '/99' },
  { id: 'blue-ice', label: 'Blue Ice', rarity: 'rare', numbered: '/99' },
  { id: 'disco', label: 'Disco', rarity: 'rare', numbered: '/75' },
  { id: 'camo', label: 'Camo', rarity: 'rare', numbered: '/25' },
  { id: 'mojo', label: 'Mojo', rarity: 'rare', numbered: '/25' },
  { id: 'snakeskin', label: 'Snakeskin', rarity: 'rare', numbered: '/75' },
  { id: 'white-sparkle', label: 'White Sparkle', rarity: 'rare', numbered: '/20' },
  { id: 'gold', label: 'Gold', rarity: 'super-rare', numbered: '/10' },
  { id: 'gold-shimmer', label: 'Gold Shimmer', rarity: 'super-rare', numbered: '/10' },
  { id: 'gold-wave', label: 'Gold Wave', rarity: 'super-rare', numbered: '/10' },
  { id: 'neon-green', label: 'Neon Green', rarity: 'rare', numbered: '/75' },
  { id: 'black', label: 'Black', rarity: 'super-rare', numbered: '/1' },
  { id: 'black-gold', label: 'Black Gold', rarity: 'super-rare', numbered: '/5' },
  { id: 'nebula', label: 'Nebula', rarity: 'super-rare', numbered: '/1' },
];

// Prizm Legacy (2015-2019)
const PRIZM_LEGACY: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'silver', label: 'Silver Prizm', rarity: 'uncommon' },
  { id: 'red-white-blue', label: 'Red White & Blue', rarity: 'uncommon' },
  { id: 'blue', label: 'Blue', rarity: 'uncommon', numbered: '/199' },
  { id: 'green', label: 'Green', rarity: 'uncommon', numbered: '/75' },
  { id: 'orange', label: 'Orange', rarity: 'rare', numbered: '/49' },
  { id: 'purple', label: 'Purple', rarity: 'rare', numbered: '/49' },
  { id: 'red', label: 'Red', rarity: 'rare', numbered: '/125' },
  { id: 'gold', label: 'Gold', rarity: 'super-rare', numbered: '/10' },
  { id: 'black', label: 'Black Finite', rarity: 'super-rare', numbered: '/1' },
  { id: 'hyper', label: 'Hyper', rarity: 'rare' },
  { id: 'camo', label: 'Camo', rarity: 'rare', numbered: '/25' },
  { id: 'tie-dye', label: 'Tie-Dye', rarity: 'rare', numbered: '/25' },
  { id: 'neon-green', label: 'Neon Green', rarity: 'rare', numbered: '/75' },
  { id: 'pink', label: 'Pink', rarity: 'rare', numbered: '/50' },
];

// Panini Mosaic (2020-2024)
const MOSAIC_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'silver', label: 'Silver', rarity: 'uncommon' },
  { id: 'red', label: 'Red', rarity: 'uncommon', numbered: '/299' },
  { id: 'blue', label: 'Blue', rarity: 'uncommon', numbered: '/199' },
  { id: 'green', label: 'Green', rarity: 'rare', numbered: '/99' },
  { id: 'pink-camo', label: 'Pink Camo', rarity: 'rare' },
  { id: 'reactive-blue', label: 'Reactive Blue', rarity: 'rare' },
  { id: 'reactive-gold', label: 'Reactive Gold', rarity: 'rare' },
  { id: 'genesis', label: 'Genesis', rarity: 'rare' },
  { id: 'orange-fluorescent', label: 'Orange Fluorescent', rarity: 'rare', numbered: '/25' },
  { id: 'white', label: 'White', rarity: 'rare', numbered: '/25' },
  { id: 'gold', label: 'Gold', rarity: 'super-rare', numbered: '/10' },
  { id: 'gold-wave', label: 'Gold Wave', rarity: 'super-rare', numbered: '/10' },
  { id: 'black', label: 'Black', rarity: 'super-rare', numbered: '/1' },
  { id: 'camo-pink', label: 'Camo Pink', rarity: 'rare' },
  { id: 'fusion-red-blue', label: 'Fusion Red Blue', rarity: 'rare' },
  { id: 'purple-fluorescent', label: 'Purple Fluorescent', rarity: 'rare', numbered: '/49' },
  { id: 'blue-fluorescent', label: 'Blue Fluorescent', rarity: 'rare', numbered: '/75' },
  { id: 'green-fluorescent', label: 'Green Fluorescent', rarity: 'super-rare', numbered: '/5' },
];

// Panini Select (2020-2024)
const SELECT_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'silver', label: 'Silver', rarity: 'uncommon' },
  // Concourse level
  { id: 'concourse-blue', label: 'Concourse Blue', rarity: 'uncommon', numbered: '/249' },
  { id: 'concourse-green', label: 'Concourse Green', rarity: 'rare', numbered: '/75' },
  { id: 'concourse-orange', label: 'Concourse Orange', rarity: 'rare', numbered: '/49' },
  { id: 'concourse-purple', label: 'Concourse Purple', rarity: 'rare', numbered: '/99' },
  { id: 'concourse-gold', label: 'Concourse Gold', rarity: 'super-rare', numbered: '/10' },
  { id: 'concourse-black', label: 'Concourse Black', rarity: 'super-rare', numbered: '/1' },
  // Premier level
  { id: 'premier-blue', label: 'Premier Blue', rarity: 'uncommon', numbered: '/249' },
  { id: 'premier-green', label: 'Premier Green', rarity: 'rare', numbered: '/75' },
  { id: 'premier-orange', label: 'Premier Orange', rarity: 'rare', numbered: '/49' },
  { id: 'premier-purple', label: 'Premier Purple', rarity: 'rare', numbered: '/99' },
  { id: 'premier-gold', label: 'Premier Gold', rarity: 'super-rare', numbered: '/10' },
  { id: 'premier-black', label: 'Premier Black', rarity: 'super-rare', numbered: '/1' },
  // Club level
  { id: 'club-blue', label: 'Club Blue', rarity: 'uncommon', numbered: '/249' },
  { id: 'club-green', label: 'Club Green', rarity: 'rare', numbered: '/75' },
  { id: 'club-orange', label: 'Club Orange', rarity: 'rare', numbered: '/49' },
  { id: 'club-purple', label: 'Club Purple', rarity: 'rare', numbered: '/99' },
  { id: 'club-gold', label: 'Club Gold', rarity: 'super-rare', numbered: '/10' },
  { id: 'club-black', label: 'Club Black', rarity: 'super-rare', numbered: '/1' },
  // Special
  { id: 'tie-dye', label: 'Tie-Dye', rarity: 'rare', numbered: '/25' },
  { id: 'zebra', label: 'Zebra', rarity: 'rare' },
  { id: 'disco', label: 'Disco', rarity: 'rare', numbered: '/49' },
  { id: 'white-disco', label: 'White Disco', rarity: 'super-rare', numbered: '/25' },
];

// Panini Donruss Optic (2020-2024)
const OPTIC_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'holo', label: 'Holo', rarity: 'uncommon' },
  { id: 'red', label: 'Red', rarity: 'uncommon', numbered: '/299' },
  { id: 'blue', label: 'Blue', rarity: 'uncommon', numbered: '/199' },
  { id: 'purple', label: 'Purple', rarity: 'rare', numbered: '/125' },
  { id: 'pink', label: 'Pink', rarity: 'rare', numbered: '/99' },
  { id: 'blue-velocity', label: 'Blue Velocity', rarity: 'rare', numbered: '/75' },
  { id: 'orange', label: 'Orange', rarity: 'rare', numbered: '/49' },
  { id: 'lime-green', label: 'Lime Green', rarity: 'rare', numbered: '/35' },
  { id: 'gold', label: 'Gold', rarity: 'super-rare', numbered: '/10' },
  { id: 'black', label: 'Black', rarity: 'super-rare', numbered: '/1' },
  { id: 'purple-shock', label: 'Purple Shock', rarity: 'rare' },
  { id: 'pink-velocity', label: 'Pink Velocity', rarity: 'rare' },
  { id: 'red-velocity', label: 'Red Velocity', rarity: 'rare' },
  { id: 'blue-shock', label: 'Blue Shock', rarity: 'rare' },
  { id: 'green', label: 'Green', rarity: 'super-rare', numbered: '/5' },
  { id: 'gold-vinyl', label: 'Gold Vinyl', rarity: 'super-rare', numbered: '/1' },
  { id: 'rated-rookie', label: 'Rated Rookie', rarity: 'uncommon' },
  { id: 'rated-rookie-auto', label: 'Rated Rookie Auto', rarity: 'rare', numbered: '/150' },
];

// Panini Flawless (Ultra High-End - All Sports)
const FLAWLESS_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Flawless Base', rarity: 'rare', numbered: '/20' },
  { id: 'ruby', label: 'Ruby', rarity: 'rare', numbered: '/15' },
  { id: 'sapphire', label: 'Sapphire', rarity: 'rare', numbered: '/10' },
  { id: 'emerald', label: 'Emerald', rarity: 'super-rare', numbered: '/5' },
  { id: 'gold', label: 'Gold', rarity: 'super-rare', numbered: '/10' },
  { id: 'platinum', label: 'Platinum', rarity: 'super-rare', numbered: '/1' },
  { id: 'black', label: 'Black', rarity: 'super-rare', numbered: '/1' },
  // Patch variations
  { id: 'patch', label: 'Patch', rarity: 'rare', numbered: '/25' },
  { id: 'patch-ruby', label: 'Patch Ruby', rarity: 'rare', numbered: '/15' },
  { id: 'patch-sapphire', label: 'Patch Sapphire', rarity: 'super-rare', numbered: '/10' },
  { id: 'patch-emerald', label: 'Patch Emerald', rarity: 'super-rare', numbered: '/5' },
  { id: 'patch-gold', label: 'Patch Gold', rarity: 'super-rare', numbered: '/10' },
  { id: 'patch-platinum', label: 'Patch Platinum', rarity: 'super-rare', numbered: '/1' },
  // Autograph variations
  { id: 'auto', label: 'Autograph', rarity: 'rare', numbered: '/25' },
  { id: 'auto-ruby', label: 'Autograph Ruby', rarity: 'rare', numbered: '/15' },
  { id: 'auto-sapphire', label: 'Autograph Sapphire', rarity: 'super-rare', numbered: '/10' },
  { id: 'auto-emerald', label: 'Autograph Emerald', rarity: 'super-rare', numbered: '/5' },
  { id: 'auto-gold', label: 'Autograph Gold', rarity: 'super-rare', numbered: '/10' },
  { id: 'auto-platinum', label: 'Autograph Platinum', rarity: 'super-rare', numbered: '/1' },
  // Patch Auto
  { id: 'patch-auto', label: 'Patch Auto', rarity: 'super-rare', numbered: '/25' },
  { id: 'patch-auto-ruby', label: 'Patch Auto Ruby', rarity: 'super-rare', numbered: '/15' },
  { id: 'patch-auto-sapphire', label: 'Patch Auto Sapphire', rarity: 'super-rare', numbered: '/10' },
  { id: 'patch-auto-emerald', label: 'Patch Auto Emerald', rarity: 'super-rare', numbered: '/5' },
  { id: 'patch-auto-gold', label: 'Patch Auto Gold', rarity: 'super-rare', numbered: '/10' },
  { id: 'patch-auto-platinum', label: 'Patch Auto Platinum', rarity: 'super-rare', numbered: '/1' },
];

// Panini National Treasures (Ultra High-End)
const NATIONAL_TREASURES_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'rare', numbered: '/99' },
  { id: 'bronze', label: 'Bronze', rarity: 'rare', numbered: '/49' },
  { id: 'silver', label: 'Silver', rarity: 'rare', numbered: '/25' },
  { id: 'gold', label: 'Gold', rarity: 'super-rare', numbered: '/10' },
  { id: 'platinum', label: 'Platinum', rarity: 'super-rare', numbered: '/5' },
  { id: 'black', label: 'Black', rarity: 'super-rare', numbered: '/1' },
  { id: 'holo-silver', label: 'Holo Silver', rarity: 'rare', numbered: '/25' },
  { id: 'holo-gold', label: 'Holo Gold', rarity: 'super-rare', numbered: '/10' },
  // Rookie Patch Auto
  { id: 'rpa', label: 'Rookie Patch Auto', rarity: 'super-rare', numbered: '/99' },
  { id: 'rpa-bronze', label: 'RPA Bronze', rarity: 'super-rare', numbered: '/49' },
  { id: 'rpa-silver', label: 'RPA Silver', rarity: 'super-rare', numbered: '/25' },
  { id: 'rpa-gold', label: 'RPA Gold', rarity: 'super-rare', numbered: '/10' },
  { id: 'rpa-platinum', label: 'RPA Platinum', rarity: 'super-rare', numbered: '/5' },
  { id: 'rpa-black', label: 'RPA Black', rarity: 'super-rare', numbered: '/1' },
  { id: 'material', label: 'Material', rarity: 'rare', numbered: '/99' },
  { id: 'dual-material', label: 'Dual Material', rarity: 'rare', numbered: '/49' },
  { id: 'jumbo-patch', label: 'Jumbo Patch', rarity: 'super-rare', numbered: '/25' },
];

// Panini Immaculate (High-End)
const IMMACULATE_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'rare', numbered: '/99' },
  { id: 'silver', label: 'Silver', rarity: 'rare', numbered: '/49' },
  { id: 'gold', label: 'Gold', rarity: 'super-rare', numbered: '/25' },
  { id: 'platinum', label: 'Platinum', rarity: 'super-rare', numbered: '/10' },
  { id: 'black', label: 'Black', rarity: 'super-rare', numbered: '/1' },
  { id: 'patch', label: 'Patch', rarity: 'rare', numbered: '/99' },
  { id: 'patch-silver', label: 'Patch Silver', rarity: 'rare', numbered: '/49' },
  { id: 'patch-gold', label: 'Patch Gold', rarity: 'super-rare', numbered: '/25' },
  { id: 'patch-platinum', label: 'Patch Platinum', rarity: 'super-rare', numbered: '/10' },
  { id: 'patch-black', label: 'Patch Black', rarity: 'super-rare', numbered: '/1' },
  { id: 'rpa', label: 'Rookie Patch Auto', rarity: 'super-rare', numbered: '/99' },
  { id: 'rpa-silver', label: 'RPA Silver', rarity: 'super-rare', numbered: '/49' },
  { id: 'rpa-gold', label: 'RPA Gold', rarity: 'super-rare', numbered: '/25' },
  { id: 'rpa-platinum', label: 'RPA Platinum', rarity: 'super-rare', numbered: '/10' },
  { id: 'rpa-black', label: 'RPA Black', rarity: 'super-rare', numbered: '/1' },
  { id: 'auto', label: 'Autograph', rarity: 'rare', numbered: '/99' },
  { id: 'auto-silver', label: 'Auto Silver', rarity: 'rare', numbered: '/49' },
  { id: 'auto-gold', label: 'Auto Gold', rarity: 'super-rare', numbered: '/25' },
];

// Panini Contenders (Football/Basketball)
const CONTENDERS_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'playoff-ticket', label: 'Playoff Ticket', rarity: 'uncommon', numbered: '/199' },
  { id: 'championship-ticket', label: 'Championship Ticket', rarity: 'rare', numbered: '/49' },
  { id: 'super-bowl-ticket', label: 'Super Bowl Ticket', rarity: 'super-rare', numbered: '/25' },
  { id: 'gold', label: 'Gold', rarity: 'super-rare', numbered: '/10' },
  { id: 'black', label: 'Black', rarity: 'super-rare', numbered: '/1' },
  { id: 'rookie-ticket-auto', label: 'Rookie Ticket Auto', rarity: 'rare' },
  { id: 'rookie-ticket-auto-variation', label: 'Rookie Ticket Auto Variation', rarity: 'rare' },
  { id: 'cracked-ice-auto', label: 'Cracked Ice Auto', rarity: 'rare', numbered: '/25' },
  { id: 'playoff-ticket-auto', label: 'Playoff Ticket Auto', rarity: 'rare', numbered: '/99' },
  { id: 'championship-ticket-auto', label: 'Championship Ticket Auto', rarity: 'super-rare', numbered: '/49' },
  { id: 'super-bowl-ticket-auto', label: 'Super Bowl Ticket Auto', rarity: 'super-rare', numbered: '/10' },
  { id: 'gold-auto', label: 'Gold Auto', rarity: 'super-rare', numbered: '/5' },
  { id: 'black-auto', label: 'Black Auto', rarity: 'super-rare', numbered: '/1' },
];

// Panini Spectra (Mid-High End)
const SPECTRA_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'blue', label: 'Blue', rarity: 'uncommon', numbered: '/99' },
  { id: 'neon-blue', label: 'Neon Blue', rarity: 'uncommon', numbered: '/75' },
  { id: 'green', label: 'Green', rarity: 'rare', numbered: '/49' },
  { id: 'neon-green', label: 'Neon Green', rarity: 'rare', numbered: '/35' },
  { id: 'orange', label: 'Orange', rarity: 'rare', numbered: '/25' },
  { id: 'neon-orange', label: 'Neon Orange', rarity: 'rare', numbered: '/15' },
  { id: 'gold', label: 'Gold', rarity: 'super-rare', numbered: '/10' },
  { id: 'neon-gold', label: 'Neon Gold', rarity: 'super-rare', numbered: '/5' },
  { id: 'black', label: 'Black', rarity: 'super-rare', numbered: '/1' },
  { id: 'auto', label: 'Autograph', rarity: 'rare', numbered: '/99' },
  { id: 'auto-blue', label: 'Auto Blue', rarity: 'rare', numbered: '/75' },
  { id: 'auto-green', label: 'Auto Green', rarity: 'rare', numbered: '/49' },
  { id: 'auto-orange', label: 'Auto Orange', rarity: 'super-rare', numbered: '/25' },
  { id: 'auto-gold', label: 'Auto Gold', rarity: 'super-rare', numbered: '/10' },
  { id: 'auto-black', label: 'Auto Black', rarity: 'super-rare', numbered: '/1' },
];

// Panini Obsidian (Mid-High End)
const OBSIDIAN_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'electric-etch-white', label: 'Electric Etch White', rarity: 'uncommon' },
  { id: 'electric-etch-green', label: 'Electric Etch Green', rarity: 'uncommon', numbered: '/75' },
  { id: 'electric-etch-blue', label: 'Electric Etch Blue', rarity: 'rare', numbered: '/50' },
  { id: 'electric-etch-purple', label: 'Electric Etch Purple', rarity: 'rare', numbered: '/35' },
  { id: 'electric-etch-orange', label: 'Electric Etch Orange', rarity: 'rare', numbered: '/25' },
  { id: 'electric-etch-gold', label: 'Electric Etch Gold', rarity: 'super-rare', numbered: '/10' },
  { id: 'electric-etch-black', label: 'Electric Etch Black', rarity: 'super-rare', numbered: '/1' },
  { id: 'vitreous', label: 'Vitreous', rarity: 'rare' },
  { id: 'vitreous-orange', label: 'Vitreous Orange', rarity: 'rare', numbered: '/49' },
  { id: 'vitreous-gold', label: 'Vitreous Gold', rarity: 'super-rare', numbered: '/10' },
  { id: 'auto', label: 'Autograph', rarity: 'rare', numbered: '/99' },
  { id: 'auto-green', label: 'Auto Green', rarity: 'rare', numbered: '/49' },
  { id: 'auto-orange', label: 'Auto Orange', rarity: 'super-rare', numbered: '/25' },
  { id: 'auto-gold', label: 'Auto Gold', rarity: 'super-rare', numbered: '/10' },
  { id: 'auto-black', label: 'Auto Black', rarity: 'super-rare', numbered: '/1' },
];

// ============================================================================
// TOPPS BRAND (2015-2025)
// ============================================================================

// Topps Chrome 2024 (Complete with all variations)
const TOPPS_CHROME_2024: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'refractor', label: 'Refractor', rarity: 'uncommon' },
  { id: 'prism-refractor', label: 'Prism Refractor', rarity: 'uncommon' },
  { id: 'negative-refractor', label: 'Negative Refractor', rarity: 'uncommon' },
  // Numbered parallels
  { id: 'magenta-speckle', label: 'Magenta Speckle Refractor', rarity: 'uncommon', numbered: '/350' },
  { id: 'purple-speckle', label: 'Purple Speckle Refractor', rarity: 'uncommon', numbered: '/299' },
  { id: 'sonar-purple', label: 'Sonar Purple Refractor', rarity: 'uncommon', numbered: '/275' },
  { id: 'purple', label: 'Purple Refractor', rarity: 'uncommon', numbered: '/250' },
  { id: 'aqua', label: 'Aqua Refractor', rarity: 'rare', numbered: '/199' },
  { id: 'aqua-lava', label: 'Aqua Lava Refractor', rarity: 'rare', numbered: '/199' },
  { id: 'blue', label: 'Blue Refractor', rarity: 'rare', numbered: '/150' },
  { id: 'blue-sonar', label: 'Blue Sonar Refractor', rarity: 'rare', numbered: '/125' },
  { id: 'green', label: 'Green Refractor', rarity: 'rare', numbered: '/99' },
  { id: 'green-wave', label: 'Green Wave Refractor', rarity: 'rare', numbered: '/99' },
  { id: 'green-sonar', label: 'Green Sonar Refractor', rarity: 'rare', numbered: '/99' },
  { id: 'blue-wave', label: 'Blue Wave Refractor', rarity: 'rare', numbered: '/75' },
  { id: 'gold', label: 'Gold Refractor', rarity: 'super-rare', numbered: '/50' },
  { id: 'gold-wave', label: 'Gold Wave Refractor', rarity: 'super-rare', numbered: '/50' },
  { id: 'orange', label: 'Orange Refractor', rarity: 'super-rare', numbered: '/25' },
  { id: 'orange-wave', label: 'Orange Wave Refractor', rarity: 'super-rare', numbered: '/25' },
  { id: 'black', label: 'Black Refractor', rarity: 'super-rare', numbered: '/10' },
  { id: 'red', label: 'Red Refractor', rarity: 'super-rare', numbered: '/5' },
  { id: 'superfractor', label: 'SuperFractor', rarity: 'super-rare', numbered: '/1' },
  // Autos
  { id: 'auto', label: 'Autograph', rarity: 'rare' },
  { id: 'auto-refractor', label: 'Auto Refractor', rarity: 'rare', numbered: '/499' },
  { id: 'auto-blue', label: 'Auto Blue', rarity: 'rare', numbered: '/150' },
  { id: 'auto-green', label: 'Auto Green', rarity: 'rare', numbered: '/99' },
  { id: 'auto-gold', label: 'Auto Gold', rarity: 'super-rare', numbered: '/50' },
  { id: 'auto-orange', label: 'Auto Orange', rarity: 'super-rare', numbered: '/25' },
  { id: 'auto-red', label: 'Auto Red', rarity: 'super-rare', numbered: '/5' },
  { id: 'auto-superfractor', label: 'Auto SuperFractor', rarity: 'super-rare', numbered: '/1' },
];

// Topps Chrome Standard (2020-2023)
const TOPPS_CHROME_STANDARD: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'refractor', label: 'Refractor', rarity: 'uncommon' },
  { id: 'prism-refractor', label: 'Prism Refractor', rarity: 'uncommon' },
  { id: 'x-fractor', label: 'X-Fractor', rarity: 'rare' },
  { id: 'sepia-refractor', label: 'Sepia Refractor', rarity: 'rare' },
  { id: 'pink-refractor', label: 'Pink Refractor', rarity: 'rare' },
  { id: 'purple', label: 'Purple Refractor', rarity: 'rare', numbered: '/299' },
  { id: 'blue', label: 'Blue Refractor', rarity: 'rare', numbered: '/150' },
  { id: 'green', label: 'Green Refractor', rarity: 'rare', numbered: '/99' },
  { id: 'gold', label: 'Gold Refractor', rarity: 'super-rare', numbered: '/50' },
  { id: 'orange', label: 'Orange Refractor', rarity: 'super-rare', numbered: '/25' },
  { id: 'red', label: 'Red Refractor', rarity: 'super-rare', numbered: '/5' },
  { id: 'superfractor', label: 'SuperFractor', rarity: 'super-rare', numbered: '/1' },
  { id: 'negative-refractor', label: 'Negative Refractor', rarity: 'rare' },
  { id: 'atomic-refractor', label: 'Atomic Refractor', rarity: 'rare' },
];

// Topps Chrome Legacy (2015-2019)
const TOPPS_CHROME_LEGACY: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'refractor', label: 'Refractor', rarity: 'uncommon' },
  { id: 'pink-refractor', label: 'Pink Refractor', rarity: 'rare' },
  { id: 'sepia-refractor', label: 'Sepia Refractor', rarity: 'rare' },
  { id: 'purple', label: 'Purple Refractor', rarity: 'rare', numbered: '/250' },
  { id: 'blue', label: 'Blue Refractor', rarity: 'rare', numbered: '/150' },
  { id: 'green', label: 'Green Refractor', rarity: 'rare', numbered: '/99' },
  { id: 'gold', label: 'Gold Refractor', rarity: 'super-rare', numbered: '/50' },
  { id: 'orange', label: 'Orange Refractor', rarity: 'super-rare', numbered: '/25' },
  { id: 'red', label: 'Red Refractor', rarity: 'super-rare', numbered: '/5' },
  { id: 'superfractor', label: 'SuperFractor', rarity: 'super-rare', numbered: '/1' },
  { id: 'negative-refractor', label: 'Negative Refractor', rarity: 'rare' },
];

// Bowman Chrome (2015-2025)
const BOWMAN_CHROME_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'refractor', label: 'Refractor', rarity: 'uncommon' },
  { id: 'blue', label: 'Blue Refractor', rarity: 'uncommon', numbered: '/150' },
  { id: 'green', label: 'Green Refractor', rarity: 'rare', numbered: '/99' },
  { id: 'purple', label: 'Purple Refractor', rarity: 'rare', numbered: '/250' },
  { id: 'orange', label: 'Orange Refractor', rarity: 'rare', numbered: '/25' },
  { id: 'gold', label: 'Gold Refractor', rarity: 'super-rare', numbered: '/50' },
  { id: 'red', label: 'Red Refractor', rarity: 'super-rare', numbered: '/5' },
  { id: 'superfractor', label: 'Superfractor', rarity: 'super-rare', numbered: '/1' },
  { id: 'atomic-refractor', label: 'Atomic Refractor', rarity: 'rare' },
  { id: 'x-fractor', label: 'X-Fractor', rarity: 'rare' },
  { id: 'speckle-refractor', label: 'Speckle Refractor', rarity: 'rare' },
  { id: 'aqua', label: 'Aqua Refractor', rarity: 'rare', numbered: '/199' },
  { id: 'shimmer', label: 'Shimmer Refractor', rarity: 'rare' },
  // Autos
  { id: 'auto', label: 'Autograph', rarity: 'rare' },
  { id: 'auto-refractor', label: 'Auto Refractor', rarity: 'rare', numbered: '/499' },
  { id: 'auto-blue', label: 'Auto Blue', rarity: 'rare', numbered: '/150' },
  { id: 'auto-green', label: 'Auto Green', rarity: 'rare', numbered: '/99' },
  { id: 'auto-gold', label: 'Auto Gold', rarity: 'super-rare', numbered: '/50' },
  { id: 'auto-orange', label: 'Auto Orange', rarity: 'super-rare', numbered: '/25' },
  { id: 'auto-red', label: 'Auto Red', rarity: 'super-rare', numbered: '/5' },
  { id: 'auto-superfractor', label: 'Auto Superfractor', rarity: 'super-rare', numbered: '/1' },
];

// Topps Stadium Club (2020-2024)
const STADIUM_CLUB_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'chrome', label: 'Chrome', rarity: 'uncommon' },
  { id: 'chrome-refractor', label: 'Chrome Refractor', rarity: 'rare' },
  { id: 'red-foil', label: 'Red Foil', rarity: 'uncommon' },
  { id: 'gold-foil', label: 'Gold Foil', rarity: 'rare' },
  { id: 'black-foil', label: 'Black Foil', rarity: 'rare', numbered: '/99' },
  { id: 'orange', label: 'Orange', rarity: 'rare', numbered: '/50' },
  { id: 'gold-minted', label: 'Gold Minted', rarity: 'super-rare', numbered: '/25' },
  { id: 'black', label: 'Black', rarity: 'super-rare', numbered: '/10' },
  { id: 'gold-rainbow-foil', label: 'Gold Rainbow Foil', rarity: 'super-rare', numbered: '/5' },
  { id: 'rainbow-foil', label: 'Rainbow Foil', rarity: 'super-rare', numbered: '/1' },
  { id: 'auto', label: 'Autograph', rarity: 'rare' },
  { id: 'auto-red', label: 'Auto Red', rarity: 'rare', numbered: '/50' },
  { id: 'auto-gold', label: 'Auto Gold', rarity: 'super-rare', numbered: '/25' },
];

// Topps Archives (2020-2024)
const ARCHIVES_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'blue', label: 'Blue', rarity: 'uncommon', numbered: '/199' },
  { id: 'purple', label: 'Purple', rarity: 'rare', numbered: '/175' },
  { id: 'gold', label: 'Gold', rarity: 'rare', numbered: '/50' },
  { id: 'black', label: 'Black', rarity: 'super-rare', numbered: '/1' },
  { id: 'silver', label: 'Silver', rarity: 'uncommon' },
  { id: 'foil', label: 'Foil', rarity: 'uncommon' },
  { id: 'auto', label: 'Autograph', rarity: 'rare' },
  { id: 'auto-blue', label: 'Auto Blue', rarity: 'rare', numbered: '/99' },
  { id: 'auto-gold', label: 'Auto Gold', rarity: 'super-rare', numbered: '/25' },
];

// ============================================================================
// UPPER DECK BRAND (2015-2025) - Primarily Hockey
// ============================================================================

// SP Authentic (2020-2025)
const SP_AUTHENTIC_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'limited-red', label: 'Limited Red', rarity: 'uncommon' },
  { id: 'limited-gold', label: 'Limited Gold', rarity: 'rare', numbered: '/99' },
  { id: 'limited-black', label: 'Limited Black', rarity: 'super-rare', numbered: '/1' },
  // Future Watch Rookies
  { id: 'future-watch', label: 'Future Watch', rarity: 'rare', numbered: '/999' },
  { id: 'future-watch-auto', label: 'Future Watch Auto', rarity: 'rare', numbered: '/999' },
  { id: 'future-watch-inscribed', label: 'Future Watch Inscribed', rarity: 'super-rare', numbered: '/50' },
  { id: 'future-watch-auto-patch', label: 'Future Watch Auto Patch', rarity: 'super-rare', numbered: '/100' },
  // Spectrum FX
  { id: 'spectrum-fx', label: 'Spectrum FX', rarity: 'rare' },
  { id: 'spectrum-fx-gold', label: 'Spectrum FX Gold', rarity: 'super-rare', numbered: '/50' },
  // Pageantry
  { id: 'pageantry', label: 'Pageantry', rarity: 'uncommon' },
  { id: 'pageantry-red', label: 'Pageantry Red', rarity: 'rare' },
  { id: 'pageantry-auto', label: 'Pageantry Auto', rarity: 'rare' },
  // Limited Autos
  { id: 'limited-auto', label: 'Limited Auto', rarity: 'rare' },
  { id: 'limited-auto-materials', label: 'Limited Auto Materials', rarity: 'super-rare', numbered: '/100' },
];

// Upper Deck Exquisite (2020-2025)
const EXQUISITE_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'rare', numbered: '/99' },
  { id: 'silver', label: 'Silver', rarity: 'rare', numbered: '/75' },
  { id: 'gold', label: 'Gold', rarity: 'super-rare', numbered: '/25' },
  { id: 'platinum', label: 'Platinum', rarity: 'super-rare', numbered: '/10' },
  { id: 'black', label: 'Black', rarity: 'super-rare', numbered: '/1' },
  // Rookie Patch Auto
  { id: 'rpa', label: 'Rookie Patch Auto', rarity: 'super-rare', numbered: '/99' },
  { id: 'rpa-silver', label: 'RPA Silver', rarity: 'super-rare', numbered: '/75' },
  { id: 'rpa-gold', label: 'RPA Gold', rarity: 'super-rare', numbered: '/25' },
  { id: 'rpa-platinum', label: 'RPA Platinum', rarity: 'super-rare', numbered: '/10' },
  { id: 'rpa-black', label: 'RPA Black', rarity: 'super-rare', numbered: '/1' },
  // Material
  { id: 'material', label: 'Material', rarity: 'rare', numbered: '/75' },
  { id: 'dual-material', label: 'Dual Material', rarity: 'super-rare', numbered: '/35' },
  { id: 'quad-material', label: 'Quad Material', rarity: 'super-rare', numbered: '/10' },
];

// The Cup (Ultra High-End Hockey)
const THE_CUP_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'rare', numbered: '/249' },
  { id: 'gold', label: 'Gold', rarity: 'super-rare', numbered: '/25' },
  { id: 'black', label: 'Black', rarity: 'super-rare', numbered: '/1' },
  // Rookie Patch Auto
  { id: 'rpa', label: 'Rookie Patch Auto', rarity: 'super-rare', numbered: '/99' },
  { id: 'rpa-gold', label: 'RPA Gold', rarity: 'super-rare', numbered: '/25' },
  { id: 'rpa-platinum', label: 'RPA Platinum', rarity: 'super-rare', numbered: '/10' },
  { id: 'rpa-black', label: 'RPA Black', rarity: 'super-rare', numbered: '/1' },
  // Rookie Materials
  { id: 'rookie-materials', label: 'Rookie Materials', rarity: 'rare', numbered: '/249' },
  { id: 'rookie-dual-materials', label: 'Rookie Dual Materials', rarity: 'super-rare', numbered: '/99' },
  // Cup Components
  { id: 'cup-foundations', label: 'Cup Foundations', rarity: 'rare', numbered: '/249' },
  { id: 'cup-foundations-auto', label: 'Cup Foundations Auto', rarity: 'super-rare', numbered: '/99' },
  // Scripted Swatches
  { id: 'scripted-swatches', label: 'Scripted Swatches', rarity: 'super-rare', numbered: '/35' },
  { id: 'scripted-swatches-gold', label: 'Scripted Swatches Gold', rarity: 'super-rare', numbered: '/10' },
];

// ============================================================================
// LEAF BRAND (2020-2025)
// ============================================================================

// Leaf Metal (2020-2025)
const LEAF_METAL_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'silver-prismatic', label: 'Silver Prismatic', rarity: 'uncommon', numbered: '/185' },
  { id: 'crystal', label: 'Crystal', rarity: 'rare', numbered: '/35' },
  { id: 'lava', label: 'Lava', rarity: 'rare', numbered: '/35' },
  { id: 'mojo', label: 'Mojo', rarity: 'rare', numbered: '/35' },
  { id: 'pulsar', label: 'Pulsar', rarity: 'rare', numbered: '/35' },
  { id: 'super-prismatic', label: 'Super Prismatic', rarity: 'super-rare', numbered: '/10' },
  { id: 'super-prismatic-gold', label: 'Super Prismatic Gold', rarity: 'super-rare', numbered: '/1' },
  // Autos
  { id: 'auto', label: 'Autograph', rarity: 'rare', numbered: '/35' },
  { id: 'auto-silver', label: 'Auto Silver', rarity: 'rare', numbered: '/35' },
  { id: 'auto-crystal', label: 'Auto Crystal', rarity: 'super-rare', numbered: '/10' },
  { id: 'auto-gold', label: 'Auto Gold', rarity: 'super-rare', numbered: '/1' },
  { id: 'mojo-auto', label: 'Mojo Auto', rarity: 'super-rare', numbered: '/35' },
  { id: 'pulsar-auto', label: 'Pulsar Auto', rarity: 'super-rare', numbered: '/35' },
  { id: 'slabbed-proof', label: 'Slabbed Auto Proof', rarity: 'super-rare', numbered: '/1' },
];

// Leaf Trinity (2020-2025)
const LEAF_TRINITY_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'silver', label: 'Silver', rarity: 'uncommon', numbered: '/199' },
  { id: 'blue', label: 'Blue', rarity: 'rare', numbered: '/75' },
  { id: 'green', label: 'Green', rarity: 'rare', numbered: '/50' },
  { id: 'purple', label: 'Purple', rarity: 'rare', numbered: '/35' },
  { id: 'orange', label: 'Orange', rarity: 'super-rare', numbered: '/25' },
  { id: 'red', label: 'Red', rarity: 'super-rare', numbered: '/10' },
  { id: 'gold', label: 'Gold', rarity: 'super-rare', numbered: '/5' },
  { id: 'black', label: 'Black', rarity: 'super-rare', numbered: '/1' },
  // Autos
  { id: 'auto', label: 'Autograph', rarity: 'rare', numbered: '/99' },
  { id: 'auto-blue', label: 'Auto Blue', rarity: 'rare', numbered: '/50' },
  { id: 'auto-green', label: 'Auto Green', rarity: 'rare', numbered: '/35' },
  { id: 'auto-purple', label: 'Auto Purple', rarity: 'super-rare', numbered: '/25' },
  { id: 'auto-gold', label: 'Auto Gold', rarity: 'super-rare', numbered: '/5' },
  { id: 'auto-black', label: 'Auto Black', rarity: 'super-rare', numbered: '/1' },
];

// ============================================================================
// FANATICS BRAND (2020-2025)
// ============================================================================

// Topps Now (On-Demand - 2020-2025)
const TOPPS_NOW_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'blue', label: 'Blue', rarity: 'rare', numbered: '/49' },
  { id: 'purple', label: 'Purple', rarity: 'rare', numbered: '/25' },
  { id: 'red', label: 'Red', rarity: 'super-rare', numbered: '/10' },
  { id: 'orange', label: 'Orange', rarity: 'super-rare', numbered: '/5' },
  { id: 'gold', label: 'Gold', rarity: 'super-rare', numbered: '/1' },
  { id: 'korean', label: 'Korean Language', rarity: 'rare', numbered: '/99' },
  { id: 'auto', label: 'Autograph', rarity: 'super-rare' },
  { id: 'relic', label: 'Relic', rarity: 'super-rare' },
];

// Bowman Draft (2020-2025)
const BOWMAN_DRAFT_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'refractor', label: 'Refractor', rarity: 'uncommon' },
  { id: 'blue', label: 'Blue Refractor', rarity: 'uncommon', numbered: '/150' },
  { id: 'sky-blue', label: 'Sky Blue', rarity: 'uncommon' },
  { id: 'green', label: 'Green Refractor', rarity: 'rare', numbered: '/99' },
  { id: 'purple', label: 'Purple Refractor', rarity: 'rare', numbered: '/250' },
  { id: 'orange', label: 'Orange Refractor', rarity: 'rare', numbered: '/25' },
  { id: 'gold', label: 'Gold Refractor', rarity: 'super-rare', numbered: '/50' },
  { id: 'red', label: 'Red Refractor', rarity: 'super-rare', numbered: '/5' },
  { id: 'superfractor', label: 'Superfractor', rarity: 'super-rare', numbered: '/1' },
  { id: 'chrome-auto', label: 'Chrome Auto', rarity: 'rare' },
  { id: 'chrome-auto-blue', label: 'Chrome Auto Blue', rarity: 'rare', numbered: '/150' },
  { id: 'chrome-auto-green', label: 'Chrome Auto Green', rarity: 'rare', numbered: '/99' },
  { id: 'chrome-auto-gold', label: 'Chrome Auto Gold', rarity: 'super-rare', numbered: '/50' },
  { id: 'chrome-auto-red', label: 'Chrome Auto Red', rarity: 'super-rare', numbered: '/5' },
  { id: 'chrome-auto-superfractor', label: 'Chrome Auto Superfractor', rarity: 'super-rare', numbered: '/1' },
];

// ============================================================================
// LEGACY SETS (1995-2014)
// ============================================================================

// Topps Finest (1993-2010) - Bronze/Silver/Gold tiers with Refractors
const FINEST_VINTAGE_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'bronze', label: 'Bronze', rarity: 'common' },
  { id: 'silver', label: 'Silver', rarity: 'uncommon' },
  { id: 'gold', label: 'Gold', rarity: 'rare' },
  { id: 'refractor', label: 'Refractor', rarity: 'rare' },
  { id: 'bronze-refractor', label: 'Bronze Refractor', rarity: 'rare' },
  { id: 'silver-refractor', label: 'Silver Refractor', rarity: 'super-rare' },
  { id: 'gold-refractor', label: 'Gold Refractor', rarity: 'super-rare' },
  { id: 'embossed-refractor', label: 'Embossed Refractor', rarity: 'super-rare' },
  { id: 'gold-embossed-refractor', label: 'Gold Embossed Refractor', rarity: 'super-rare' },
];

// Topps Finest (2000-2014) - Modern refractor rainbow
const FINEST_2000S_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'refractor', label: 'Refractor', rarity: 'uncommon' },
  { id: 'blue-refractor', label: 'Blue Refractor', rarity: 'rare', numbered: '/150' },
  { id: 'green-refractor', label: 'Green Refractor', rarity: 'rare', numbered: '/99' },
  { id: 'gold-refractor', label: 'Gold Refractor', rarity: 'super-rare', numbered: '/50' },
  { id: 'orange-refractor', label: 'Orange Refractor', rarity: 'super-rare', numbered: '/25' },
  { id: 'red-refractor', label: 'Red Refractor', rarity: 'super-rare', numbered: '/5' },
  { id: 'x-fractor', label: 'X-Fractor', rarity: 'rare' },
  { id: 'superfractor', label: 'SuperFractor', rarity: 'super-rare', numbered: '/1' },
  { id: 'auto', label: 'Autograph', rarity: 'rare' },
  { id: 'auto-refractor', label: 'Auto Refractor', rarity: 'rare' },
];

// Upper Deck SPx (1996-2010)
const SPX_VINTAGE_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'gold', label: 'Gold', rarity: 'rare' },
  { id: 'grand-finale', label: 'Grand Finale', rarity: 'super-rare', numbered: '/50' },
  { id: 'holoview', label: 'Holoview', rarity: 'rare' },
  { id: 'spectrum', label: 'Spectrum', rarity: 'rare', numbered: '/99' },
  { id: 'gold-spectrum', label: 'Gold Spectrum', rarity: 'super-rare', numbered: '/25' },
  { id: 'silver-spectrum', label: 'Silver Spectrum', rarity: 'rare', numbered: '/49' },
  { id: 'platinum-spectrum', label: 'Platinum Spectrum', rarity: 'super-rare', numbered: '/10' },
  { id: 'radiance', label: 'Radiance', rarity: 'rare', numbered: '/100' },
];

// Upper Deck Young Guns (1990s-2014)
const YOUNG_GUNS_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Young Guns Base', rarity: 'uncommon' },
  { id: 'exclusives', label: 'Exclusives', rarity: 'rare', numbered: '/100' },
  { id: 'high-gloss', label: 'High Gloss', rarity: 'super-rare', numbered: '/10' },
  { id: 'clear-cut', label: 'Clear Cut', rarity: 'super-rare' },
  { id: 'canvas', label: 'Canvas', rarity: 'uncommon' },
  { id: 'retro', label: 'Retro', rarity: 'rare' },
];

// Fleer/Skybox Metal Universe (1995-2000)
const METAL_UNIVERSE_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'pmg-red', label: 'Precious Metal Gems Red', rarity: 'super-rare', numbered: '/90' },
  { id: 'pmg-green', label: 'Precious Metal Gems Green', rarity: 'super-rare', numbered: '/10' },
  { id: 'platinum', label: 'Platinum', rarity: 'rare' },
  { id: 'titanium', label: 'Titanium', rarity: 'super-rare' },
];

// Fleer Ultra (1991-2007)
const FLEER_ULTRA_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'gold-medallion', label: 'Gold Medallion', rarity: 'rare' },
  { id: 'platinum-medallion', label: 'Platinum Medallion', rarity: 'super-rare' },
  { id: 'masterpiece', label: 'Masterpiece', rarity: 'super-rare', numbered: '/1' },
];

// Fleer Flair (1993-2005)
const FLEER_FLAIR_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'row-0', label: 'Row 0', rarity: 'super-rare' },
  { id: 'row-1', label: 'Row 1', rarity: 'rare' },
  { id: 'row-2', label: 'Row 2', rarity: 'uncommon' },
  { id: 'legacy', label: 'Legacy', rarity: 'super-rare', numbered: '/100' },
  { id: 'showcase-legacy', label: 'Showcase Legacy', rarity: 'super-rare', numbered: '/50' },
];

// Pacific Revolution (1998-2001)
const PACIFIC_REVOLUTION_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'shadow', label: 'Shadow Series', rarity: 'rare', numbered: '/99' },
  { id: 'gold', label: 'Gold', rarity: 'super-rare', numbered: '/50' },
  { id: 'red', label: 'Red', rarity: 'rare', numbered: '/199' },
  { id: 'blue', label: 'Blue', rarity: 'rare', numbered: '/150' },
];

// Pacific Aurora (1998-2001)
const PACIFIC_AURORA_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'red', label: 'Red', rarity: 'rare', numbered: '/200' },
  { id: 'opening-day', label: 'Opening Day', rarity: 'rare', numbered: '/200' },
  { id: 'premiere-date', label: 'Premiere Date', rarity: 'rare' },
  { id: 'pinstripes', label: 'Pinstripes', rarity: 'uncommon' },
  { id: 'ice-blue', label: 'Ice Blue', rarity: 'rare', numbered: '/100' },
  { id: 'copper', label: 'Copper', rarity: 'super-rare', numbered: '/20' },
];

// Pinnacle/Select Certified (1995-1998)
const PINNACLE_CERTIFIED_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'mirror-gold', label: 'Mirror Gold', rarity: 'rare' },
  { id: 'mirror-red', label: 'Mirror Red', rarity: 'rare' },
  { id: 'mirror-blue', label: 'Mirror Blue', rarity: 'super-rare' },
  { id: 'mirror-black', label: 'Mirror Black', rarity: 'super-rare', numbered: '/1' },
  { id: 'certified-red', label: 'Certified Red', rarity: 'uncommon' },
];

// Pinnacle Totally Certified (1997-1998)
const TOTALLY_CERTIFIED_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'platinum-red', label: 'Platinum Red', rarity: 'rare', numbered: '/3999' },
  { id: 'platinum-blue', label: 'Platinum Blue', rarity: 'rare', numbered: '/1999' },
  { id: 'platinum-gold', label: 'Platinum Gold', rarity: 'super-rare', numbered: '/30' },
];

// Score (1988-2000s)
const SCORE_VINTAGE_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'gold', label: 'Gold', rarity: 'rare' },
  { id: 'platinum', label: 'Platinum', rarity: 'super-rare' },
  { id: 'showcase', label: 'Showcase', rarity: 'rare' },
  { id: 'artist-proof', label: 'Artist Proof', rarity: 'super-rare' },
];

// Donruss (1981-2005)
const DONRUSS_VINTAGE_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'press-proof', label: 'Press Proof', rarity: 'rare' },
  { id: 'stat-line', label: 'Stat Line', rarity: 'rare', numbered: '/100' },
  { id: 'elite', label: 'Elite Series', rarity: 'super-rare' },
  { id: 'studio', label: 'Studio', rarity: 'uncommon' },
];

// Bowman's Best (1994-2010)
const BOWMANS_BEST_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'refractor', label: 'Refractor', rarity: 'uncommon' },
  { id: 'atomic-refractor', label: 'Atomic Refractor', rarity: 'rare' },
  { id: 'blue-refractor', label: 'Blue Refractor', rarity: 'rare', numbered: '/150' },
  { id: 'gold-refractor', label: 'Gold Refractor', rarity: 'super-rare', numbered: '/50' },
  { id: 'orange-refractor', label: 'Orange Refractor', rarity: 'super-rare', numbered: '/25' },
  { id: 'red-refractor', label: 'Red Refractor', rarity: 'super-rare', numbered: '/5' },
  { id: 'superfractor', label: 'SuperFractor', rarity: 'super-rare', numbered: '/1' },
];

// Upper Deck Black Diamond (1997-2014)
const BLACK_DIAMOND_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'single-diamond', label: 'Single Diamond', rarity: 'common' },
  { id: 'double-diamond', label: 'Double Diamond', rarity: 'uncommon' },
  { id: 'triple-diamond', label: 'Triple Diamond', rarity: 'rare' },
  { id: 'quad-diamond', label: 'Quad Diamond', rarity: 'super-rare' },
  { id: 'gold', label: 'Gold', rarity: 'super-rare', numbered: '/25' },
  { id: 'platinum', label: 'Platinum', rarity: 'super-rare', numbered: '/1' },
];

// Upper Deck Ultimate Collection (2001-2014)
const ULTIMATE_COLLECTION_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'rare', numbered: '/350' },
  { id: 'silver', label: 'Silver', rarity: 'rare', numbered: '/150' },
  { id: 'gold', label: 'Gold', rarity: 'super-rare', numbered: '/99' },
  { id: 'platinum', label: 'Platinum', rarity: 'super-rare', numbered: '/25' },
  { id: 'auto', label: 'Autograph', rarity: 'super-rare', numbered: '/99' },
  { id: 'auto-gold', label: 'Auto Gold', rarity: 'super-rare', numbered: '/25' },
  { id: 'auto-platinum', label: 'Auto Platinum', rarity: 'super-rare', numbered: '/5' },
  { id: 'shield', label: 'Shield', rarity: 'super-rare', numbered: '/1' },
];

// Playoff Contenders (1998-2010)
const PLAYOFF_CONTENDERS_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'gold', label: 'Gold', rarity: 'rare', numbered: '/100' },
  { id: 'platinum', label: 'Platinum', rarity: 'super-rare', numbered: '/25' },
  { id: 'blue', label: 'Blue', rarity: 'rare', numbered: '/50' },
  { id: 'rookie-ticket', label: 'Rookie Ticket', rarity: 'rare' },
  { id: 'rookie-ticket-auto', label: 'Rookie Ticket Auto', rarity: 'super-rare' },
];

// ============================================================================
// BOWMAN CHROME SUBSETS (Sapphire, etc.)
// ============================================================================

// Bowman Chrome Sapphire (Premium subset - 2017-2025)
const BOWMAN_CHROME_SAPPHIRE_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base Sapphire', rarity: 'uncommon' },
  { id: 'green', label: 'Green', rarity: 'rare', numbered: '/50' },
  { id: 'orange', label: 'Orange', rarity: 'rare', numbered: '/25' },
  { id: 'red', label: 'Red', rarity: 'super-rare', numbered: '/5' },
  { id: 'gold', label: 'Gold', rarity: 'super-rare', numbered: '/1' },
  { id: 'auto', label: 'Autograph', rarity: 'rare' },
  { id: 'auto-green', label: 'Auto Green', rarity: 'rare', numbered: '/50' },
  { id: 'auto-orange', label: 'Auto Orange', rarity: 'super-rare', numbered: '/25' },
  { id: 'auto-red', label: 'Auto Red', rarity: 'super-rare', numbered: '/5' },
  { id: 'auto-gold', label: 'Auto Gold', rarity: 'super-rare', numbered: '/1' },
];

// Topps Chrome Sapphire (Premium subset)
const TOPPS_CHROME_SAPPHIRE_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base Sapphire', rarity: 'uncommon' },
  { id: 'green', label: 'Green', rarity: 'rare', numbered: '/75' },
  { id: 'orange', label: 'Orange', rarity: 'rare', numbered: '/25' },
  { id: 'red', label: 'Red', rarity: 'super-rare', numbered: '/5' },
  { id: 'black', label: 'Black', rarity: 'super-rare', numbered: '/1' },
  { id: 'auto', label: 'Autograph', rarity: 'rare' },
  { id: 'auto-orange', label: 'Auto Orange', rarity: 'super-rare', numbered: '/25' },
  { id: 'auto-red', label: 'Auto Red', rarity: 'super-rare', numbered: '/5' },
];

// ============================================================================
// POKEMON TCG (1999-2025)
// ============================================================================

// Pokemon Base/Vintage Era (1999-2003) - Wizards of the Coast
const POKEMON_WOTC_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'holo', label: 'Holo Rare', rarity: 'rare' },
  { id: 'first-edition', label: '1st Edition', rarity: 'super-rare' },
  { id: 'first-edition-holo', label: '1st Edition Holo', rarity: 'super-rare' },
  { id: 'shadowless', label: 'Shadowless', rarity: 'super-rare' },
  { id: 'shadowless-holo', label: 'Shadowless Holo', rarity: 'super-rare' },
  { id: 'reverse-holo', label: 'Reverse Holo', rarity: 'uncommon' },
];

// Pokemon EX Era (2003-2007) - Nintendo
const POKEMON_EX_ERA_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'holo', label: 'Holo Rare', rarity: 'rare' },
  { id: 'reverse-holo', label: 'Reverse Holo', rarity: 'uncommon' },
  { id: 'ex', label: 'EX Pokemon', rarity: 'super-rare' },
  { id: 'gold-star', label: 'Gold Star', rarity: 'super-rare' },
  { id: 'shiny', label: 'Shiny Pokemon', rarity: 'super-rare' },
];

// Pokemon Diamond/Pearl/Platinum Era (2007-2011)
const POKEMON_DP_ERA_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'holo', label: 'Holo Rare', rarity: 'rare' },
  { id: 'reverse-holo', label: 'Reverse Holo', rarity: 'uncommon' },
  { id: 'lv-x', label: 'LV.X', rarity: 'super-rare' },
  { id: 'prime', label: 'Prime', rarity: 'super-rare' },
  { id: 'legend', label: 'LEGEND', rarity: 'super-rare' },
  { id: 'shiny', label: 'Shiny Collection', rarity: 'super-rare' },
];

// Pokemon Black & White/XY Era (2011-2016)
const POKEMON_BW_XY_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'holo', label: 'Holo Rare', rarity: 'rare' },
  { id: 'reverse-holo', label: 'Reverse Holo', rarity: 'uncommon' },
  { id: 'ex', label: 'EX', rarity: 'rare' },
  { id: 'full-art', label: 'Full Art', rarity: 'super-rare' },
  { id: 'full-art-ex', label: 'Full Art EX', rarity: 'super-rare' },
  { id: 'secret-rare', label: 'Secret Rare', rarity: 'super-rare' },
  { id: 'mega-ex', label: 'Mega EX', rarity: 'super-rare' },
  { id: 'break', label: 'BREAK', rarity: 'rare' },
];

// Pokemon Sun & Moon Era (2017-2019)
const POKEMON_SM_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'holo', label: 'Holo Rare', rarity: 'rare' },
  { id: 'reverse-holo', label: 'Reverse Holo', rarity: 'uncommon' },
  { id: 'gx', label: 'GX', rarity: 'rare' },
  { id: 'full-art-gx', label: 'Full Art GX', rarity: 'super-rare' },
  { id: 'rainbow-rare', label: 'Rainbow Rare', rarity: 'super-rare' },
  { id: 'gold-secret', label: 'Gold Secret Rare', rarity: 'super-rare' },
  { id: 'shiny-vault', label: 'Shiny Vault', rarity: 'super-rare' },
  { id: 'tag-team-gx', label: 'Tag Team GX', rarity: 'super-rare' },
  { id: 'alt-art', label: 'Alternate Art', rarity: 'super-rare' },
];

// Pokemon Sword & Shield Era (2020-2023)
const POKEMON_SWSH_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'holo', label: 'Holo Rare', rarity: 'rare' },
  { id: 'reverse-holo', label: 'Reverse Holo', rarity: 'uncommon' },
  { id: 'v', label: 'Pokemon V', rarity: 'rare' },
  { id: 'vmax', label: 'VMAX', rarity: 'super-rare' },
  { id: 'vstar', label: 'VSTAR', rarity: 'super-rare' },
  { id: 'full-art-v', label: 'Full Art V', rarity: 'super-rare' },
  { id: 'alt-art-v', label: 'Alternate Art V', rarity: 'super-rare' },
  { id: 'alt-art-vmax', label: 'Alternate Art VMAX', rarity: 'super-rare' },
  { id: 'rainbow-rare', label: 'Rainbow Rare', rarity: 'super-rare' },
  { id: 'gold-secret', label: 'Gold Secret Rare', rarity: 'super-rare' },
  { id: 'trainer-gallery', label: 'Trainer Gallery', rarity: 'super-rare' },
  { id: 'radiant', label: 'Radiant Pokemon', rarity: 'super-rare' },
];

// Pokemon Scarlet & Violet Era (2023-2025)
const POKEMON_SV_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'holo', label: 'Holo Rare', rarity: 'rare' },
  { id: 'reverse-holo', label: 'Reverse Holo', rarity: 'uncommon' },
  { id: 'pokeball-holo', label: 'Poke Ball Holo', rarity: 'uncommon' },
  { id: 'masterball-holo', label: 'Master Ball Holo', rarity: 'rare' },
  { id: 'ex', label: 'Pokemon ex', rarity: 'rare' },
  { id: 'full-art-ex', label: 'Full Art ex', rarity: 'super-rare' },
  { id: 'special-art-rare', label: 'Special Art Rare (SAR)', rarity: 'super-rare' },
  { id: 'illustration-rare', label: 'Illustration Rare', rarity: 'super-rare' },
  { id: 'special-illustration', label: 'Special Illustration Rare', rarity: 'super-rare' },
  { id: 'hyper-rare', label: 'Hyper Rare (Gold)', rarity: 'super-rare' },
  { id: 'tera-ex', label: 'Tera ex', rarity: 'super-rare' },
  { id: 'shiny', label: 'Shiny Rare', rarity: 'super-rare' },
  { id: 'shiny-ex', label: 'Shiny ex', rarity: 'super-rare' },
];

// Pokemon Hidden Fates / Shining Fates / Shiny Vault special sets
const POKEMON_SHINY_VAULT_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'shiny', label: 'Shiny', rarity: 'super-rare' },
  { id: 'shiny-v', label: 'Shiny V', rarity: 'super-rare' },
  { id: 'shiny-vmax', label: 'Shiny VMAX', rarity: 'super-rare' },
  { id: 'shiny-gx', label: 'Shiny GX', rarity: 'super-rare' },
  { id: 'full-art', label: 'Full Art', rarity: 'super-rare' },
  { id: 'gold-secret', label: 'Gold Secret', rarity: 'super-rare' },
];

// ============================================================================
// MARVEL TRADING CARDS (1990-2025)
// ============================================================================

// Marvel Classic Era - Impel/Fleer (1990-1999)
const MARVEL_CLASSIC_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'holo', label: 'Hologram', rarity: 'rare' },
  { id: 'gold-foil', label: 'Gold Foil', rarity: 'super-rare' },
  { id: 'prism', label: 'Prism', rarity: 'rare' },
  { id: 'spectra', label: 'Battle Spectra', rarity: 'super-rare' },
  { id: 'mirage', label: 'Mirage', rarity: 'super-rare' },
];

// Marvel Masterpieces (1992-2024)
const MARVEL_MASTERPIECES_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'foil', label: 'Foil', rarity: 'uncommon' },
  { id: 'canvas', label: 'Canvas', rarity: 'rare' },
  { id: 'holofoil', label: 'Holofoil', rarity: 'rare' },
  { id: 'gold', label: 'Gold', rarity: 'super-rare', numbered: '/99' },
  { id: 'sketch', label: 'Sketch Card', rarity: 'super-rare' },
  { id: 'auto', label: 'Autograph', rarity: 'super-rare' },
];

// Marvel Upper Deck Modern (2020-2025)
const MARVEL_UPPER_DECK_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'foil', label: 'Foil', rarity: 'uncommon' },
  { id: 'photo-variation', label: 'Photo Variation', rarity: 'uncommon' },
  { id: 'high-noon-flair', label: 'High Noon Flair', rarity: 'rare', numbered: '/15' },
  { id: 'twilight-flair', label: 'Twilight Flair', rarity: 'super-rare', numbered: '/5' },
  { id: 'midnight-flair', label: 'Midnight Flair', rarity: 'super-rare', numbered: '/1' },
  { id: 'sketch', label: 'Sketch Card', rarity: 'super-rare' },
  { id: 'auto', label: 'Autograph', rarity: 'super-rare' },
  { id: 'relic', label: 'Relic/Memorabilia', rarity: 'super-rare' },
];

// Marvel Fleer Ultra (2022-2025)
const MARVEL_FLEER_ULTRA_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'gold-medallion', label: 'Gold Medallion', rarity: 'rare' },
  { id: 'platinum-medallion', label: 'Platinum Medallion', rarity: 'super-rare' },
  { id: 'pmg-green', label: 'PMG Green', rarity: 'super-rare', numbered: '/10' },
  { id: 'pmg-red', label: 'PMG Red', rarity: 'super-rare', numbered: '/90' },
  { id: 'sketch', label: 'Sketch Card', rarity: 'super-rare' },
  { id: 'auto', label: 'Autograph', rarity: 'super-rare' },
];

// Marvel Topps Chrome (2024-2025)
const MARVEL_TOPPS_CHROME_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'refractor', label: 'Refractor', rarity: 'uncommon' },
  { id: 'raywave', label: 'RayWave Refractor', rarity: 'uncommon' },
  { id: 'spider-web', label: 'Spider Web Refractor', rarity: 'rare', numbered: '/399' },
  { id: 'blue', label: 'Blue Refractor', rarity: 'rare', numbered: '/299' },
  { id: 'green', label: 'Green Shimmer', rarity: 'rare', numbered: '/199' },
  { id: 'iron-man-lazer', label: 'Iron Man Lazer', rarity: 'rare', numbered: '/100' },
  { id: 'hulk-lazer', label: 'Hulk Green Lazer', rarity: 'rare', numbered: '/99' },
  { id: 'purple-shimmer', label: 'Purple Shimmer', rarity: 'rare', numbered: '/75' },
  { id: 'gold-wave', label: 'Gold Wave', rarity: 'super-rare', numbered: '/50' },
  { id: 'black', label: 'Black Refractor', rarity: 'super-rare', numbered: '/10' },
  { id: 'red', label: 'Red Refractor', rarity: 'super-rare', numbered: '/5' },
  { id: 'superfractor', label: 'SuperFractor', rarity: 'super-rare', numbered: '/1' },
  { id: 'clawed-chrome', label: 'Clawed Chrome', rarity: 'super-rare', numbered: '/20' },
  { id: 'sketch', label: 'Sketch Card', rarity: 'super-rare' },
  { id: 'auto', label: 'Autograph', rarity: 'super-rare' },
];

// Marvel Topps Chrome Sapphire (2025)
const MARVEL_TOPPS_SAPPHIRE_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base Sapphire', rarity: 'uncommon' },
  { id: 'green', label: 'Green', rarity: 'rare' },
  { id: 'orange', label: 'Orange', rarity: 'rare' },
  { id: 'black', label: 'Black', rarity: 'super-rare' },
  { id: 'red', label: 'Red', rarity: 'super-rare' },
  { id: 'padparadscha', label: 'Padparadscha', rarity: 'super-rare', numbered: '/1' },
  { id: 'auto', label: 'Autograph', rarity: 'super-rare' },
];

// ============================================================================
// VINTAGE SPORTS CARDS (Pre-1993) - Base Cards are Valuable!
// ============================================================================

// Early Topps Baseball (1952-1969) - The Golden Age
// No parallels existed - the base cards themselves are the prize
const TOPPS_VINTAGE_GOLDEN_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'rare' }, // All vintage base cards are valuable
  { id: 'high-number', label: 'High Number Series', rarity: 'super-rare' }, // Short printed series
];

// Topps Baseball (1970-1980) - The Bronze Age
const TOPPS_VINTAGE_BRONZE_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'uncommon' },
  { id: 'high-number', label: 'High Number Series', rarity: 'rare' },
];

// Topps Baseball (1981-1992) - Junk Wax Era (lower base value, but variations exist)
const TOPPS_JUNK_WAX_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'tiffany', label: 'Tiffany', rarity: 'rare' }, // 1984-1991
  { id: 'glossy', label: 'Glossy All-Stars', rarity: 'uncommon' },
  { id: 'traded', label: 'Traded/Update', rarity: 'common' },
  { id: 'traded-tiffany', label: 'Traded Tiffany', rarity: 'super-rare' },
];

// Bowman Vintage Baseball (1948-1955) - Pre-Topps Era
const BOWMAN_VINTAGE_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'super-rare' }, // 1948-1955 Bowman are highly collectible
];

// Bowman Modern Pre-Chrome (1989-1992)
const BOWMAN_PRE_CHROME_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'tiffany', label: 'Tiffany', rarity: 'rare' },
];

// Fleer Baseball (1981-1992)
const FLEER_VINTAGE_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'glossy', label: 'Glossy', rarity: 'uncommon' }, // 1987-1992
  { id: 'update', label: 'Update/Final Edition', rarity: 'common' },
  { id: 'glossy-update', label: 'Glossy Update', rarity: 'rare' },
];

// Donruss Baseball (1981-1992)  
const DONRUSS_EARLY_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'diamond-kings', label: 'Diamond Kings', rarity: 'uncommon' },
  { id: 'rated-rookie', label: 'Rated Rookie', rarity: 'uncommon' },
];

// Upper Deck Baseball (1989-1992) - The Premium Era Begins
const UPPER_DECK_EARLY_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'high-number', label: 'High Number', rarity: 'uncommon' },
  { id: 'final-edition', label: 'Final Edition', rarity: 'uncommon' },
];

// Score Baseball (1988-1992)
const SCORE_EARLY_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'traded', label: 'Traded/Rookies', rarity: 'common' },
];

// Topps Football Vintage (1956-1979)
const TOPPS_FOOTBALL_VINTAGE_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'rare' },
  { id: 'high-number', label: 'High Number Series', rarity: 'super-rare' },
];

// Topps Football (1980-1992)
const TOPPS_FOOTBALL_MODERN_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'tiffany', label: 'Tiffany', rarity: 'super-rare' }, // 1984-1988
];

// Pro Set Football (1989-1991) - First real competition to Topps
const PRO_SET_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'error', label: 'Error Card', rarity: 'rare' }, // Notorious for errors
  { id: 'platinum', label: 'Platinum', rarity: 'rare' }, // 1991
];

// Score Football (1989-1992)
const SCORE_FOOTBALL_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'supplemental', label: 'Supplemental', rarity: 'uncommon' },
];

// Fleer Football (1990-1992)
const FLEER_FOOTBALL_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'update', label: 'Update', rarity: 'common' },
];

// Topps Basketball Vintage (1957-1981)
const TOPPS_BASKETBALL_VINTAGE_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'super-rare' }, // Very few basketball sets made
];

// Fleer Basketball (1961 + 1986-1992) - THE basketball card brand
const FLEER_BASKETBALL_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'uncommon' }, // 1986-1992 common, 1961 super rare
  { id: 'sticker', label: 'Sticker', rarity: 'rare' },
  { id: 'all-star', label: 'All-Star', rarity: 'uncommon' },
];

// NBA Hoops (1989-1992) - First licensed NBA cards since Fleer 61
const HOOPS_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'action-photos', label: 'Action Photos', rarity: 'uncommon' },
];

// Skybox Basketball (1990-1992) - Revolutionary design
const SKYBOX_BASKETBALL_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'prototype', label: 'Prototype', rarity: 'super-rare' }, // Pre-production samples
];

// Upper Deck Basketball (1991-1992)
const UPPER_DECK_BASKETBALL_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'extended', label: 'Extended', rarity: 'uncommon' },
];

// Stadium Club (1991-1992) - Premium glossy brand
const STADIUM_CLUB_EARLY_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'members-only', label: 'Members Only', rarity: 'rare' },
  { id: 'first-day-issue', label: 'First Day Issue', rarity: 'super-rare' },
];

// ============================================================================
// DEFAULT PARALLELS (for unknown sets)
// ============================================================================

const DEFAULT_PARALLELS: CardParallel[] = [
  { id: 'base', label: 'Base', rarity: 'common' },
  { id: 'parallel', label: 'Parallel/Refractor', rarity: 'uncommon' },
  { id: 'numbered', label: 'Numbered', rarity: 'rare' },
  { id: 'auto', label: 'Autograph', rarity: 'rare' },
  { id: 'patch', label: 'Patch/Relic', rarity: 'rare' },
  { id: 'auto-patch', label: 'Auto Patch', rarity: 'super-rare' },
  { id: 'gold', label: 'Gold', rarity: 'super-rare', numbered: '/10' },
  { id: 'black', label: 'Black', rarity: 'super-rare', numbered: '/1' },
];

// ============================================================================
// CARD SETS REGISTRY
// ============================================================================

export const CARD_SETS: CardSet[] = [
  // ============ PANINI ============
  
  // Prizm Football (2024 with new variations)
  { brand: 'panini', set: 'prizm', year: 2024, sport: 'football', parallels: PRIZM_FOOTBALL_2024 },
  { brand: 'panini', set: 'prizm', year: 2023, sport: 'football', parallels: PRIZM_STANDARD },
  { brand: 'panini', set: 'prizm', year: 2022, sport: 'football', parallels: PRIZM_STANDARD },
  { brand: 'panini', set: 'prizm', year: 2021, sport: 'football', parallels: PRIZM_STANDARD },
  { brand: 'panini', set: 'prizm', year: 2020, sport: 'football', parallels: PRIZM_STANDARD },
  { brand: 'panini', set: 'prizm', year: 2019, sport: 'football', parallels: PRIZM_LEGACY },
  { brand: 'panini', set: 'prizm', year: 2018, sport: 'football', parallels: PRIZM_LEGACY },
  { brand: 'panini', set: 'prizm', year: 2017, sport: 'football', parallels: PRIZM_LEGACY },
  { brand: 'panini', set: 'prizm', year: 2016, sport: 'football', parallels: PRIZM_LEGACY },
  { brand: 'panini', set: 'prizm', year: 2015, sport: 'football', parallels: PRIZM_LEGACY },
  
  // Prizm Basketball (2024-25 with new variations)
  { brand: 'panini', set: 'prizm', year: 2024, sport: 'basketball', parallels: PRIZM_BASKETBALL_2024 },
  { brand: 'panini', set: 'prizm', year: 2023, sport: 'basketball', parallels: PRIZM_STANDARD },
  { brand: 'panini', set: 'prizm', year: 2022, sport: 'basketball', parallels: PRIZM_STANDARD },
  { brand: 'panini', set: 'prizm', year: 2021, sport: 'basketball', parallels: PRIZM_STANDARD },
  { brand: 'panini', set: 'prizm', year: 2020, sport: 'basketball', parallels: PRIZM_STANDARD },
  { brand: 'panini', set: 'prizm', year: 2019, sport: 'basketball', parallels: PRIZM_LEGACY },
  { brand: 'panini', set: 'prizm', year: 2018, sport: 'basketball', parallels: PRIZM_LEGACY },
  { brand: 'panini', set: 'prizm', year: 2017, sport: 'basketball', parallels: PRIZM_LEGACY },
  { brand: 'panini', set: 'prizm', year: 2016, sport: 'basketball', parallels: PRIZM_LEGACY },
  { brand: 'panini', set: 'prizm', year: 2015, sport: 'basketball', parallels: PRIZM_LEGACY },
  
  // Prizm Baseball
  { brand: 'panini', set: 'prizm', year: 2024, sport: 'baseball', parallels: PRIZM_STANDARD },
  { brand: 'panini', set: 'prizm', year: 2023, sport: 'baseball', parallels: PRIZM_STANDARD },
  { brand: 'panini', set: 'prizm', year: 2022, sport: 'baseball', parallels: PRIZM_STANDARD },
  { brand: 'panini', set: 'prizm', year: 2021, sport: 'baseball', parallels: PRIZM_STANDARD },
  { brand: 'panini', set: 'prizm', year: 2020, sport: 'baseball', parallels: PRIZM_STANDARD },
  
  // Mosaic (All Sports)
  { brand: 'panini', set: 'mosaic', year: 2024, sport: 'football', parallels: MOSAIC_PARALLELS },
  { brand: 'panini', set: 'mosaic', year: 2023, sport: 'football', parallels: MOSAIC_PARALLELS },
  { brand: 'panini', set: 'mosaic', year: 2022, sport: 'football', parallels: MOSAIC_PARALLELS },
  { brand: 'panini', set: 'mosaic', year: 2021, sport: 'football', parallels: MOSAIC_PARALLELS },
  { brand: 'panini', set: 'mosaic', year: 2020, sport: 'football', parallels: MOSAIC_PARALLELS },
  { brand: 'panini', set: 'mosaic', year: 2024, sport: 'basketball', parallels: MOSAIC_PARALLELS },
  { brand: 'panini', set: 'mosaic', year: 2023, sport: 'basketball', parallels: MOSAIC_PARALLELS },
  { brand: 'panini', set: 'mosaic', year: 2022, sport: 'basketball', parallels: MOSAIC_PARALLELS },
  { brand: 'panini', set: 'mosaic', year: 2021, sport: 'basketball', parallels: MOSAIC_PARALLELS },
  { brand: 'panini', set: 'mosaic', year: 2020, sport: 'basketball', parallels: MOSAIC_PARALLELS },
  { brand: 'panini', set: 'mosaic', year: 2024, sport: 'baseball', parallels: MOSAIC_PARALLELS },
  { brand: 'panini', set: 'mosaic', year: 2023, sport: 'baseball', parallels: MOSAIC_PARALLELS },
  
  // Select (All Sports)
  { brand: 'panini', set: 'select', year: 2024, sport: 'football', parallels: SELECT_PARALLELS },
  { brand: 'panini', set: 'select', year: 2023, sport: 'football', parallels: SELECT_PARALLELS },
  { brand: 'panini', set: 'select', year: 2022, sport: 'football', parallels: SELECT_PARALLELS },
  { brand: 'panini', set: 'select', year: 2021, sport: 'football', parallels: SELECT_PARALLELS },
  { brand: 'panini', set: 'select', year: 2020, sport: 'football', parallels: SELECT_PARALLELS },
  { brand: 'panini', set: 'select', year: 2019, sport: 'football', parallels: SELECT_PARALLELS },
  { brand: 'panini', set: 'select', year: 2018, sport: 'football', parallels: SELECT_PARALLELS },
  { brand: 'panini', set: 'select', year: 2024, sport: 'basketball', parallels: SELECT_PARALLELS },
  { brand: 'panini', set: 'select', year: 2023, sport: 'basketball', parallels: SELECT_PARALLELS },
  { brand: 'panini', set: 'select', year: 2022, sport: 'basketball', parallels: SELECT_PARALLELS },
  { brand: 'panini', set: 'select', year: 2021, sport: 'basketball', parallels: SELECT_PARALLELS },
  { brand: 'panini', set: 'select', year: 2020, sport: 'basketball', parallels: SELECT_PARALLELS },
  
  // Donruss Optic (All Sports)
  { brand: 'panini', set: 'optic', year: 2024, sport: 'football', parallels: OPTIC_PARALLELS },
  { brand: 'panini', set: 'optic', year: 2023, sport: 'football', parallels: OPTIC_PARALLELS },
  { brand: 'panini', set: 'optic', year: 2022, sport: 'football', parallels: OPTIC_PARALLELS },
  { brand: 'panini', set: 'optic', year: 2021, sport: 'football', parallels: OPTIC_PARALLELS },
  { brand: 'panini', set: 'optic', year: 2020, sport: 'football', parallels: OPTIC_PARALLELS },
  { brand: 'panini', set: 'optic', year: 2019, sport: 'football', parallels: OPTIC_PARALLELS },
  { brand: 'panini', set: 'optic', year: 2018, sport: 'football', parallels: OPTIC_PARALLELS },
  { brand: 'panini', set: 'optic', year: 2024, sport: 'basketball', parallels: OPTIC_PARALLELS },
  { brand: 'panini', set: 'optic', year: 2023, sport: 'basketball', parallels: OPTIC_PARALLELS },
  { brand: 'panini', set: 'optic', year: 2022, sport: 'basketball', parallels: OPTIC_PARALLELS },
  { brand: 'panini', set: 'optic', year: 2021, sport: 'basketball', parallels: OPTIC_PARALLELS },
  { brand: 'panini', set: 'optic', year: 2020, sport: 'basketball', parallels: OPTIC_PARALLELS },
  { brand: 'panini', set: 'optic', year: 2024, sport: 'baseball', parallels: OPTIC_PARALLELS },
  { brand: 'panini', set: 'optic', year: 2023, sport: 'baseball', parallels: OPTIC_PARALLELS },
  
  // Flawless (All Sports - Ultra High-End)
  { brand: 'panini', set: 'flawless', year: 2024, sport: 'football', parallels: FLAWLESS_PARALLELS },
  { brand: 'panini', set: 'flawless', year: 2023, sport: 'football', parallels: FLAWLESS_PARALLELS },
  { brand: 'panini', set: 'flawless', year: 2022, sport: 'football', parallels: FLAWLESS_PARALLELS },
  { brand: 'panini', set: 'flawless', year: 2021, sport: 'football', parallels: FLAWLESS_PARALLELS },
  { brand: 'panini', set: 'flawless', year: 2020, sport: 'football', parallels: FLAWLESS_PARALLELS },
  { brand: 'panini', set: 'flawless', year: 2019, sport: 'football', parallels: FLAWLESS_PARALLELS },
  { brand: 'panini', set: 'flawless', year: 2018, sport: 'football', parallels: FLAWLESS_PARALLELS },
  { brand: 'panini', set: 'flawless', year: 2017, sport: 'football', parallels: FLAWLESS_PARALLELS },
  { brand: 'panini', set: 'flawless', year: 2024, sport: 'basketball', parallels: FLAWLESS_PARALLELS },
  { brand: 'panini', set: 'flawless', year: 2023, sport: 'basketball', parallels: FLAWLESS_PARALLELS },
  { brand: 'panini', set: 'flawless', year: 2022, sport: 'basketball', parallels: FLAWLESS_PARALLELS },
  { brand: 'panini', set: 'flawless', year: 2021, sport: 'basketball', parallels: FLAWLESS_PARALLELS },
  { brand: 'panini', set: 'flawless', year: 2020, sport: 'basketball', parallels: FLAWLESS_PARALLELS },
  { brand: 'panini', set: 'flawless', year: 2019, sport: 'basketball', parallels: FLAWLESS_PARALLELS },
  { brand: 'panini', set: 'flawless', year: 2024, sport: 'baseball', parallels: FLAWLESS_PARALLELS },
  { brand: 'panini', set: 'flawless', year: 2023, sport: 'baseball', parallels: FLAWLESS_PARALLELS },
  { brand: 'panini', set: 'flawless', year: 2022, sport: 'baseball', parallels: FLAWLESS_PARALLELS },
  { brand: 'panini', set: 'flawless', year: 2021, sport: 'baseball', parallels: FLAWLESS_PARALLELS },
  { brand: 'panini', set: 'flawless', year: 2020, sport: 'baseball', parallels: FLAWLESS_PARALLELS },
  
  // National Treasures (All Sports - Ultra High-End)
  { brand: 'panini', set: 'national-treasures', year: 2024, sport: 'football', parallels: NATIONAL_TREASURES_PARALLELS },
  { brand: 'panini', set: 'national-treasures', year: 2023, sport: 'football', parallels: NATIONAL_TREASURES_PARALLELS },
  { brand: 'panini', set: 'national-treasures', year: 2022, sport: 'football', parallels: NATIONAL_TREASURES_PARALLELS },
  { brand: 'panini', set: 'national-treasures', year: 2021, sport: 'football', parallels: NATIONAL_TREASURES_PARALLELS },
  { brand: 'panini', set: 'national-treasures', year: 2020, sport: 'football', parallels: NATIONAL_TREASURES_PARALLELS },
  { brand: 'panini', set: 'national-treasures', year: 2019, sport: 'football', parallels: NATIONAL_TREASURES_PARALLELS },
  { brand: 'panini', set: 'national-treasures', year: 2018, sport: 'football', parallels: NATIONAL_TREASURES_PARALLELS },
  { brand: 'panini', set: 'national-treasures', year: 2017, sport: 'football', parallels: NATIONAL_TREASURES_PARALLELS },
  { brand: 'panini', set: 'national-treasures', year: 2024, sport: 'basketball', parallels: NATIONAL_TREASURES_PARALLELS },
  { brand: 'panini', set: 'national-treasures', year: 2023, sport: 'basketball', parallels: NATIONAL_TREASURES_PARALLELS },
  { brand: 'panini', set: 'national-treasures', year: 2022, sport: 'basketball', parallels: NATIONAL_TREASURES_PARALLELS },
  { brand: 'panini', set: 'national-treasures', year: 2021, sport: 'basketball', parallels: NATIONAL_TREASURES_PARALLELS },
  { brand: 'panini', set: 'national-treasures', year: 2020, sport: 'basketball', parallels: NATIONAL_TREASURES_PARALLELS },
  { brand: 'panini', set: 'national-treasures', year: 2019, sport: 'basketball', parallels: NATIONAL_TREASURES_PARALLELS },
  { brand: 'panini', set: 'national-treasures', year: 2024, sport: 'baseball', parallels: NATIONAL_TREASURES_PARALLELS },
  { brand: 'panini', set: 'national-treasures', year: 2023, sport: 'baseball', parallels: NATIONAL_TREASURES_PARALLELS },
  { brand: 'panini', set: 'national-treasures', year: 2022, sport: 'baseball', parallels: NATIONAL_TREASURES_PARALLELS },
  { brand: 'panini', set: 'national-treasures', year: 2021, sport: 'baseball', parallels: NATIONAL_TREASURES_PARALLELS },
  { brand: 'panini', set: 'national-treasures', year: 2020, sport: 'baseball', parallels: NATIONAL_TREASURES_PARALLELS },
  
  // Immaculate (All Sports - High-End)
  { brand: 'panini', set: 'immaculate', year: 2024, sport: 'football', parallels: IMMACULATE_PARALLELS },
  { brand: 'panini', set: 'immaculate', year: 2023, sport: 'football', parallels: IMMACULATE_PARALLELS },
  { brand: 'panini', set: 'immaculate', year: 2022, sport: 'football', parallels: IMMACULATE_PARALLELS },
  { brand: 'panini', set: 'immaculate', year: 2021, sport: 'football', parallels: IMMACULATE_PARALLELS },
  { brand: 'panini', set: 'immaculate', year: 2020, sport: 'football', parallels: IMMACULATE_PARALLELS },
  { brand: 'panini', set: 'immaculate', year: 2019, sport: 'football', parallels: IMMACULATE_PARALLELS },
  { brand: 'panini', set: 'immaculate', year: 2024, sport: 'basketball', parallels: IMMACULATE_PARALLELS },
  { brand: 'panini', set: 'immaculate', year: 2023, sport: 'basketball', parallels: IMMACULATE_PARALLELS },
  { brand: 'panini', set: 'immaculate', year: 2022, sport: 'basketball', parallels: IMMACULATE_PARALLELS },
  { brand: 'panini', set: 'immaculate', year: 2021, sport: 'basketball', parallels: IMMACULATE_PARALLELS },
  { brand: 'panini', set: 'immaculate', year: 2020, sport: 'basketball', parallels: IMMACULATE_PARALLELS },
  { brand: 'panini', set: 'immaculate', year: 2024, sport: 'baseball', parallels: IMMACULATE_PARALLELS },
  { brand: 'panini', set: 'immaculate', year: 2023, sport: 'baseball', parallels: IMMACULATE_PARALLELS },
  
  // Contenders (Football/Basketball)
  { brand: 'panini', set: 'contenders', year: 2024, sport: 'football', parallels: CONTENDERS_PARALLELS },
  { brand: 'panini', set: 'contenders', year: 2023, sport: 'football', parallels: CONTENDERS_PARALLELS },
  { brand: 'panini', set: 'contenders', year: 2022, sport: 'football', parallels: CONTENDERS_PARALLELS },
  { brand: 'panini', set: 'contenders', year: 2021, sport: 'football', parallels: CONTENDERS_PARALLELS },
  { brand: 'panini', set: 'contenders', year: 2020, sport: 'football', parallels: CONTENDERS_PARALLELS },
  { brand: 'panini', set: 'contenders', year: 2019, sport: 'football', parallels: CONTENDERS_PARALLELS },
  { brand: 'panini', set: 'contenders', year: 2018, sport: 'football', parallels: CONTENDERS_PARALLELS },
  { brand: 'panini', set: 'contenders', year: 2017, sport: 'football', parallels: CONTENDERS_PARALLELS },
  { brand: 'panini', set: 'contenders', year: 2016, sport: 'football', parallels: CONTENDERS_PARALLELS },
  { brand: 'panini', set: 'contenders', year: 2015, sport: 'football', parallels: CONTENDERS_PARALLELS },
  { brand: 'panini', set: 'contenders', year: 2024, sport: 'basketball', parallels: CONTENDERS_PARALLELS },
  { brand: 'panini', set: 'contenders', year: 2023, sport: 'basketball', parallels: CONTENDERS_PARALLELS },
  { brand: 'panini', set: 'contenders', year: 2022, sport: 'basketball', parallels: CONTENDERS_PARALLELS },
  { brand: 'panini', set: 'contenders', year: 2021, sport: 'basketball', parallels: CONTENDERS_PARALLELS },
  { brand: 'panini', set: 'contenders', year: 2020, sport: 'basketball', parallels: CONTENDERS_PARALLELS },
  
  // Spectra (Football/Basketball)
  { brand: 'panini', set: 'spectra', year: 2024, sport: 'football', parallels: SPECTRA_PARALLELS },
  { brand: 'panini', set: 'spectra', year: 2023, sport: 'football', parallels: SPECTRA_PARALLELS },
  { brand: 'panini', set: 'spectra', year: 2022, sport: 'football', parallels: SPECTRA_PARALLELS },
  { brand: 'panini', set: 'spectra', year: 2021, sport: 'football', parallels: SPECTRA_PARALLELS },
  { brand: 'panini', set: 'spectra', year: 2020, sport: 'football', parallels: SPECTRA_PARALLELS },
  { brand: 'panini', set: 'spectra', year: 2019, sport: 'football', parallels: SPECTRA_PARALLELS },
  { brand: 'panini', set: 'spectra', year: 2024, sport: 'basketball', parallels: SPECTRA_PARALLELS },
  { brand: 'panini', set: 'spectra', year: 2023, sport: 'basketball', parallels: SPECTRA_PARALLELS },
  { brand: 'panini', set: 'spectra', year: 2022, sport: 'basketball', parallels: SPECTRA_PARALLELS },
  { brand: 'panini', set: 'spectra', year: 2021, sport: 'basketball', parallels: SPECTRA_PARALLELS },
  { brand: 'panini', set: 'spectra', year: 2020, sport: 'basketball', parallels: SPECTRA_PARALLELS },
  
  // Obsidian (Football/Basketball)
  { brand: 'panini', set: 'obsidian', year: 2024, sport: 'football', parallels: OBSIDIAN_PARALLELS },
  { brand: 'panini', set: 'obsidian', year: 2023, sport: 'football', parallels: OBSIDIAN_PARALLELS },
  { brand: 'panini', set: 'obsidian', year: 2022, sport: 'football', parallels: OBSIDIAN_PARALLELS },
  { brand: 'panini', set: 'obsidian', year: 2021, sport: 'football', parallels: OBSIDIAN_PARALLELS },
  { brand: 'panini', set: 'obsidian', year: 2020, sport: 'football', parallels: OBSIDIAN_PARALLELS },
  { brand: 'panini', set: 'obsidian', year: 2024, sport: 'basketball', parallels: OBSIDIAN_PARALLELS },
  { brand: 'panini', set: 'obsidian', year: 2023, sport: 'basketball', parallels: OBSIDIAN_PARALLELS },
  { brand: 'panini', set: 'obsidian', year: 2022, sport: 'basketball', parallels: OBSIDIAN_PARALLELS },
  { brand: 'panini', set: 'obsidian', year: 2021, sport: 'basketball', parallels: OBSIDIAN_PARALLELS },
  { brand: 'panini', set: 'obsidian', year: 2020, sport: 'basketball', parallels: OBSIDIAN_PARALLELS },
  
  // ============ TOPPS ============
  
  // Topps Chrome Baseball (2024 with new variations)
  { brand: 'topps', set: 'chrome', year: 2024, sport: 'baseball', parallels: TOPPS_CHROME_2024 },
  { brand: 'topps', set: 'chrome', year: 2023, sport: 'baseball', parallels: TOPPS_CHROME_STANDARD },
  { brand: 'topps', set: 'chrome', year: 2022, sport: 'baseball', parallels: TOPPS_CHROME_STANDARD },
  { brand: 'topps', set: 'chrome', year: 2021, sport: 'baseball', parallels: TOPPS_CHROME_STANDARD },
  { brand: 'topps', set: 'chrome', year: 2020, sport: 'baseball', parallels: TOPPS_CHROME_STANDARD },
  { brand: 'topps', set: 'chrome', year: 2019, sport: 'baseball', parallels: TOPPS_CHROME_LEGACY },
  { brand: 'topps', set: 'chrome', year: 2018, sport: 'baseball', parallels: TOPPS_CHROME_LEGACY },
  { brand: 'topps', set: 'chrome', year: 2017, sport: 'baseball', parallels: TOPPS_CHROME_LEGACY },
  { brand: 'topps', set: 'chrome', year: 2016, sport: 'baseball', parallels: TOPPS_CHROME_LEGACY },
  { brand: 'topps', set: 'chrome', year: 2015, sport: 'baseball', parallels: TOPPS_CHROME_LEGACY },
  
  // Topps Chrome Football
  { brand: 'topps', set: 'chrome', year: 2024, sport: 'football', parallels: TOPPS_CHROME_2024 },
  { brand: 'topps', set: 'chrome', year: 2023, sport: 'football', parallels: TOPPS_CHROME_STANDARD },
  { brand: 'topps', set: 'chrome', year: 2022, sport: 'football', parallels: TOPPS_CHROME_STANDARD },
  { brand: 'topps', set: 'chrome', year: 2021, sport: 'football', parallels: TOPPS_CHROME_STANDARD },
  { brand: 'topps', set: 'chrome', year: 2020, sport: 'football', parallels: TOPPS_CHROME_STANDARD },
  
  // Bowman Chrome Baseball
  { brand: 'topps', set: 'bowman-chrome', year: 2024, sport: 'baseball', parallels: BOWMAN_CHROME_PARALLELS },
  { brand: 'topps', set: 'bowman-chrome', year: 2023, sport: 'baseball', parallels: BOWMAN_CHROME_PARALLELS },
  { brand: 'topps', set: 'bowman-chrome', year: 2022, sport: 'baseball', parallels: BOWMAN_CHROME_PARALLELS },
  { brand: 'topps', set: 'bowman-chrome', year: 2021, sport: 'baseball', parallels: BOWMAN_CHROME_PARALLELS },
  { brand: 'topps', set: 'bowman-chrome', year: 2020, sport: 'baseball', parallels: BOWMAN_CHROME_PARALLELS },
  { brand: 'topps', set: 'bowman-chrome', year: 2019, sport: 'baseball', parallels: BOWMAN_CHROME_PARALLELS },
  { brand: 'topps', set: 'bowman-chrome', year: 2018, sport: 'baseball', parallels: BOWMAN_CHROME_PARALLELS },
  { brand: 'topps', set: 'bowman-chrome', year: 2017, sport: 'baseball', parallels: BOWMAN_CHROME_PARALLELS },
  { brand: 'topps', set: 'bowman-chrome', year: 2016, sport: 'baseball', parallels: BOWMAN_CHROME_PARALLELS },
  { brand: 'topps', set: 'bowman-chrome', year: 2015, sport: 'baseball', parallels: BOWMAN_CHROME_PARALLELS },
  
  // Stadium Club
  { brand: 'topps', set: 'stadium-club', year: 2024, sport: 'baseball', parallels: STADIUM_CLUB_PARALLELS },
  { brand: 'topps', set: 'stadium-club', year: 2023, sport: 'baseball', parallels: STADIUM_CLUB_PARALLELS },
  { brand: 'topps', set: 'stadium-club', year: 2022, sport: 'baseball', parallels: STADIUM_CLUB_PARALLELS },
  { brand: 'topps', set: 'stadium-club', year: 2021, sport: 'baseball', parallels: STADIUM_CLUB_PARALLELS },
  { brand: 'topps', set: 'stadium-club', year: 2020, sport: 'baseball', parallels: STADIUM_CLUB_PARALLELS },
  
  // Archives
  { brand: 'topps', set: 'archives', year: 2024, sport: 'baseball', parallels: ARCHIVES_PARALLELS },
  { brand: 'topps', set: 'archives', year: 2023, sport: 'baseball', parallels: ARCHIVES_PARALLELS },
  { brand: 'topps', set: 'archives', year: 2022, sport: 'baseball', parallels: ARCHIVES_PARALLELS },
  { brand: 'topps', set: 'archives', year: 2021, sport: 'baseball', parallels: ARCHIVES_PARALLELS },
  { brand: 'topps', set: 'archives', year: 2020, sport: 'baseball', parallels: ARCHIVES_PARALLELS },
  
  // ============ UPPER DECK ============
  
  // SP Authentic Hockey
  { brand: 'upper-deck', set: 'sp-authentic', year: 2024, sport: 'hockey', parallels: SP_AUTHENTIC_PARALLELS },
  { brand: 'upper-deck', set: 'sp-authentic', year: 2023, sport: 'hockey', parallels: SP_AUTHENTIC_PARALLELS },
  { brand: 'upper-deck', set: 'sp-authentic', year: 2022, sport: 'hockey', parallels: SP_AUTHENTIC_PARALLELS },
  { brand: 'upper-deck', set: 'sp-authentic', year: 2021, sport: 'hockey', parallels: SP_AUTHENTIC_PARALLELS },
  { brand: 'upper-deck', set: 'sp-authentic', year: 2020, sport: 'hockey', parallels: SP_AUTHENTIC_PARALLELS },
  { brand: 'upper-deck', set: 'sp-authentic', year: 2019, sport: 'hockey', parallels: SP_AUTHENTIC_PARALLELS },
  { brand: 'upper-deck', set: 'sp-authentic', year: 2018, sport: 'hockey', parallels: SP_AUTHENTIC_PARALLELS },
  { brand: 'upper-deck', set: 'sp-authentic', year: 2017, sport: 'hockey', parallels: SP_AUTHENTIC_PARALLELS },
  { brand: 'upper-deck', set: 'sp-authentic', year: 2016, sport: 'hockey', parallels: SP_AUTHENTIC_PARALLELS },
  { brand: 'upper-deck', set: 'sp-authentic', year: 2015, sport: 'hockey', parallels: SP_AUTHENTIC_PARALLELS },
  
  // Exquisite (Multi-Sport)
  { brand: 'upper-deck', set: 'exquisite', year: 2024, sport: 'multi', parallels: EXQUISITE_PARALLELS },
  { brand: 'upper-deck', set: 'exquisite', year: 2023, sport: 'multi', parallels: EXQUISITE_PARALLELS },
  { brand: 'upper-deck', set: 'exquisite', year: 2022, sport: 'multi', parallels: EXQUISITE_PARALLELS },
  { brand: 'upper-deck', set: 'exquisite', year: 2021, sport: 'multi', parallels: EXQUISITE_PARALLELS },
  { brand: 'upper-deck', set: 'exquisite', year: 2020, sport: 'multi', parallels: EXQUISITE_PARALLELS },
  
  // The Cup Hockey
  { brand: 'upper-deck', set: 'the-cup', year: 2024, sport: 'hockey', parallels: THE_CUP_PARALLELS },
  { brand: 'upper-deck', set: 'the-cup', year: 2023, sport: 'hockey', parallels: THE_CUP_PARALLELS },
  { brand: 'upper-deck', set: 'the-cup', year: 2022, sport: 'hockey', parallels: THE_CUP_PARALLELS },
  { brand: 'upper-deck', set: 'the-cup', year: 2021, sport: 'hockey', parallels: THE_CUP_PARALLELS },
  { brand: 'upper-deck', set: 'the-cup', year: 2020, sport: 'hockey', parallels: THE_CUP_PARALLELS },
  { brand: 'upper-deck', set: 'the-cup', year: 2019, sport: 'hockey', parallels: THE_CUP_PARALLELS },
  { brand: 'upper-deck', set: 'the-cup', year: 2018, sport: 'hockey', parallels: THE_CUP_PARALLELS },
  { brand: 'upper-deck', set: 'the-cup', year: 2017, sport: 'hockey', parallels: THE_CUP_PARALLELS },
  { brand: 'upper-deck', set: 'the-cup', year: 2016, sport: 'hockey', parallels: THE_CUP_PARALLELS },
  { brand: 'upper-deck', set: 'the-cup', year: 2015, sport: 'hockey', parallels: THE_CUP_PARALLELS },
  
  // ============ LEAF ============
  
  // Leaf Metal (Multi-Sport)
  { brand: 'leaf', set: 'metal', year: 2024, sport: 'multi', parallels: LEAF_METAL_PARALLELS },
  { brand: 'leaf', set: 'metal', year: 2023, sport: 'multi', parallels: LEAF_METAL_PARALLELS },
  { brand: 'leaf', set: 'metal', year: 2022, sport: 'multi', parallels: LEAF_METAL_PARALLELS },
  { brand: 'leaf', set: 'metal', year: 2021, sport: 'multi', parallels: LEAF_METAL_PARALLELS },
  { brand: 'leaf', set: 'metal', year: 2020, sport: 'multi', parallels: LEAF_METAL_PARALLELS },
  { brand: 'leaf', set: 'metal', year: 2024, sport: 'baseball', parallels: LEAF_METAL_PARALLELS },
  { brand: 'leaf', set: 'metal', year: 2023, sport: 'baseball', parallels: LEAF_METAL_PARALLELS },
  { brand: 'leaf', set: 'metal', year: 2024, sport: 'football', parallels: LEAF_METAL_PARALLELS },
  { brand: 'leaf', set: 'metal', year: 2023, sport: 'football', parallels: LEAF_METAL_PARALLELS },
  
  // Leaf Trinity (Multi-Sport)
  { brand: 'leaf', set: 'trinity', year: 2024, sport: 'multi', parallels: LEAF_TRINITY_PARALLELS },
  { brand: 'leaf', set: 'trinity', year: 2023, sport: 'multi', parallels: LEAF_TRINITY_PARALLELS },
  { brand: 'leaf', set: 'trinity', year: 2022, sport: 'multi', parallels: LEAF_TRINITY_PARALLELS },
  { brand: 'leaf', set: 'trinity', year: 2021, sport: 'multi', parallels: LEAF_TRINITY_PARALLELS },
  { brand: 'leaf', set: 'trinity', year: 2020, sport: 'multi', parallels: LEAF_TRINITY_PARALLELS },
  
  // ============ FANATICS ============
  
  // Topps Now (On-Demand - All Sports)
  { brand: 'fanatics', set: 'topps-now', year: 2024, sport: 'baseball', parallels: TOPPS_NOW_PARALLELS },
  { brand: 'fanatics', set: 'topps-now', year: 2023, sport: 'baseball', parallels: TOPPS_NOW_PARALLELS },
  { brand: 'fanatics', set: 'topps-now', year: 2022, sport: 'baseball', parallels: TOPPS_NOW_PARALLELS },
  { brand: 'fanatics', set: 'topps-now', year: 2021, sport: 'baseball', parallels: TOPPS_NOW_PARALLELS },
  { brand: 'fanatics', set: 'topps-now', year: 2020, sport: 'baseball', parallels: TOPPS_NOW_PARALLELS },
  { brand: 'fanatics', set: 'topps-now', year: 2024, sport: 'basketball', parallels: TOPPS_NOW_PARALLELS },
  { brand: 'fanatics', set: 'topps-now', year: 2023, sport: 'basketball', parallels: TOPPS_NOW_PARALLELS },
  
  // Bowman Draft
  { brand: 'fanatics', set: 'bowman-draft', year: 2024, sport: 'baseball', parallels: BOWMAN_DRAFT_PARALLELS },
  { brand: 'fanatics', set: 'bowman-draft', year: 2023, sport: 'baseball', parallels: BOWMAN_DRAFT_PARALLELS },
  { brand: 'fanatics', set: 'bowman-draft', year: 2022, sport: 'baseball', parallels: BOWMAN_DRAFT_PARALLELS },
  { brand: 'fanatics', set: 'bowman-draft', year: 2021, sport: 'baseball', parallels: BOWMAN_DRAFT_PARALLELS },
  { brand: 'fanatics', set: 'bowman-draft', year: 2020, sport: 'baseball', parallels: BOWMAN_DRAFT_PARALLELS },
  
  // ============ LEGACY SETS (1995-2014) ============
  
  // Topps Finest (1993-2014)
  { brand: 'topps', set: 'finest', year: 2014, sport: 'baseball', parallels: FINEST_2000S_PARALLELS },
  { brand: 'topps', set: 'finest', year: 2013, sport: 'baseball', parallels: FINEST_2000S_PARALLELS },
  { brand: 'topps', set: 'finest', year: 2012, sport: 'baseball', parallels: FINEST_2000S_PARALLELS },
  { brand: 'topps', set: 'finest', year: 2011, sport: 'baseball', parallels: FINEST_2000S_PARALLELS },
  { brand: 'topps', set: 'finest', year: 2010, sport: 'baseball', parallels: FINEST_2000S_PARALLELS },
  { brand: 'topps', set: 'finest', year: 2009, sport: 'baseball', parallels: FINEST_2000S_PARALLELS },
  { brand: 'topps', set: 'finest', year: 2008, sport: 'baseball', parallels: FINEST_2000S_PARALLELS },
  { brand: 'topps', set: 'finest', year: 2007, sport: 'baseball', parallels: FINEST_2000S_PARALLELS },
  { brand: 'topps', set: 'finest', year: 2006, sport: 'baseball', parallels: FINEST_2000S_PARALLELS },
  { brand: 'topps', set: 'finest', year: 2005, sport: 'baseball', parallels: FINEST_2000S_PARALLELS },
  { brand: 'topps', set: 'finest', year: 2004, sport: 'baseball', parallels: FINEST_2000S_PARALLELS },
  { brand: 'topps', set: 'finest', year: 2003, sport: 'baseball', parallels: FINEST_2000S_PARALLELS },
  { brand: 'topps', set: 'finest', year: 2002, sport: 'baseball', parallels: FINEST_2000S_PARALLELS },
  { brand: 'topps', set: 'finest', year: 2001, sport: 'baseball', parallels: FINEST_2000S_PARALLELS },
  { brand: 'topps', set: 'finest', year: 2000, sport: 'baseball', parallels: FINEST_2000S_PARALLELS },
  { brand: 'topps', set: 'finest', year: 1999, sport: 'baseball', parallels: FINEST_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'finest', year: 1998, sport: 'baseball', parallels: FINEST_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'finest', year: 1997, sport: 'baseball', parallels: FINEST_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'finest', year: 1996, sport: 'baseball', parallels: FINEST_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'finest', year: 1995, sport: 'baseball', parallels: FINEST_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'finest', year: 1994, sport: 'baseball', parallels: FINEST_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'finest', year: 1993, sport: 'baseball', parallels: FINEST_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'finest', year: 2014, sport: 'basketball', parallels: FINEST_2000S_PARALLELS },
  { brand: 'topps', set: 'finest', year: 2005, sport: 'basketball', parallels: FINEST_2000S_PARALLELS },
  { brand: 'topps', set: 'finest', year: 2004, sport: 'basketball', parallels: FINEST_2000S_PARALLELS },
  { brand: 'topps', set: 'finest', year: 2003, sport: 'basketball', parallels: FINEST_2000S_PARALLELS },
  { brand: 'topps', set: 'finest', year: 1999, sport: 'basketball', parallels: FINEST_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'finest', year: 1998, sport: 'basketball', parallels: FINEST_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'finest', year: 1997, sport: 'basketball', parallels: FINEST_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'finest', year: 1996, sport: 'basketball', parallels: FINEST_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'finest', year: 1995, sport: 'basketball', parallels: FINEST_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'finest', year: 2014, sport: 'football', parallels: FINEST_2000S_PARALLELS },
  { brand: 'topps', set: 'finest', year: 2011, sport: 'football', parallels: FINEST_2000S_PARALLELS },
  { brand: 'topps', set: 'finest', year: 2010, sport: 'football', parallels: FINEST_2000S_PARALLELS },
  { brand: 'topps', set: 'finest', year: 1998, sport: 'football', parallels: FINEST_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'finest', year: 1997, sport: 'football', parallels: FINEST_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'finest', year: 1996, sport: 'football', parallels: FINEST_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'finest', year: 1995, sport: 'football', parallels: FINEST_VINTAGE_PARALLELS },
  
  // Bowman's Best (1994-2010)
  { brand: 'topps', set: 'bowmans-best', year: 2010, sport: 'baseball', parallels: BOWMANS_BEST_PARALLELS },
  { brand: 'topps', set: 'bowmans-best', year: 2009, sport: 'baseball', parallels: BOWMANS_BEST_PARALLELS },
  { brand: 'topps', set: 'bowmans-best', year: 2008, sport: 'baseball', parallels: BOWMANS_BEST_PARALLELS },
  { brand: 'topps', set: 'bowmans-best', year: 2007, sport: 'baseball', parallels: BOWMANS_BEST_PARALLELS },
  { brand: 'topps', set: 'bowmans-best', year: 2006, sport: 'baseball', parallels: BOWMANS_BEST_PARALLELS },
  { brand: 'topps', set: 'bowmans-best', year: 2005, sport: 'baseball', parallels: BOWMANS_BEST_PARALLELS },
  { brand: 'topps', set: 'bowmans-best', year: 2004, sport: 'baseball', parallels: BOWMANS_BEST_PARALLELS },
  { brand: 'topps', set: 'bowmans-best', year: 2003, sport: 'baseball', parallels: BOWMANS_BEST_PARALLELS },
  { brand: 'topps', set: 'bowmans-best', year: 2002, sport: 'baseball', parallels: BOWMANS_BEST_PARALLELS },
  { brand: 'topps', set: 'bowmans-best', year: 2001, sport: 'baseball', parallels: BOWMANS_BEST_PARALLELS },
  { brand: 'topps', set: 'bowmans-best', year: 2000, sport: 'baseball', parallels: BOWMANS_BEST_PARALLELS },
  { brand: 'topps', set: 'bowmans-best', year: 1999, sport: 'baseball', parallels: BOWMANS_BEST_PARALLELS },
  { brand: 'topps', set: 'bowmans-best', year: 1998, sport: 'baseball', parallels: BOWMANS_BEST_PARALLELS },
  { brand: 'topps', set: 'bowmans-best', year: 1997, sport: 'baseball', parallels: BOWMANS_BEST_PARALLELS },
  { brand: 'topps', set: 'bowmans-best', year: 1996, sport: 'baseball', parallels: BOWMANS_BEST_PARALLELS },
  { brand: 'topps', set: 'bowmans-best', year: 1995, sport: 'baseball', parallels: BOWMANS_BEST_PARALLELS },
  { brand: 'topps', set: 'bowmans-best', year: 1994, sport: 'baseball', parallels: BOWMANS_BEST_PARALLELS },
  { brand: 'topps', set: 'bowmans-best', year: 1999, sport: 'football', parallels: BOWMANS_BEST_PARALLELS },
  { brand: 'topps', set: 'bowmans-best', year: 1998, sport: 'football', parallels: BOWMANS_BEST_PARALLELS },
  { brand: 'topps', set: 'bowmans-best', year: 1997, sport: 'football', parallels: BOWMANS_BEST_PARALLELS },
  { brand: 'topps', set: 'bowmans-best', year: 1996, sport: 'football', parallels: BOWMANS_BEST_PARALLELS },
  
  // Upper Deck SPx (1996-2014)
  { brand: 'upper-deck', set: 'spx', year: 2014, sport: 'hockey', parallels: SPX_VINTAGE_PARALLELS },
  { brand: 'upper-deck', set: 'spx', year: 2013, sport: 'hockey', parallels: SPX_VINTAGE_PARALLELS },
  { brand: 'upper-deck', set: 'spx', year: 2012, sport: 'hockey', parallels: SPX_VINTAGE_PARALLELS },
  { brand: 'upper-deck', set: 'spx', year: 2011, sport: 'hockey', parallels: SPX_VINTAGE_PARALLELS },
  { brand: 'upper-deck', set: 'spx', year: 2010, sport: 'hockey', parallels: SPX_VINTAGE_PARALLELS },
  { brand: 'upper-deck', set: 'spx', year: 2009, sport: 'hockey', parallels: SPX_VINTAGE_PARALLELS },
  { brand: 'upper-deck', set: 'spx', year: 2008, sport: 'hockey', parallels: SPX_VINTAGE_PARALLELS },
  { brand: 'upper-deck', set: 'spx', year: 2007, sport: 'hockey', parallels: SPX_VINTAGE_PARALLELS },
  { brand: 'upper-deck', set: 'spx', year: 2006, sport: 'hockey', parallels: SPX_VINTAGE_PARALLELS },
  { brand: 'upper-deck', set: 'spx', year: 2005, sport: 'hockey', parallels: SPX_VINTAGE_PARALLELS },
  { brand: 'upper-deck', set: 'spx', year: 2004, sport: 'hockey', parallels: SPX_VINTAGE_PARALLELS },
  { brand: 'upper-deck', set: 'spx', year: 2003, sport: 'hockey', parallels: SPX_VINTAGE_PARALLELS },
  { brand: 'upper-deck', set: 'spx', year: 2002, sport: 'hockey', parallels: SPX_VINTAGE_PARALLELS },
  { brand: 'upper-deck', set: 'spx', year: 2001, sport: 'hockey', parallels: SPX_VINTAGE_PARALLELS },
  { brand: 'upper-deck', set: 'spx', year: 2000, sport: 'hockey', parallels: SPX_VINTAGE_PARALLELS },
  { brand: 'upper-deck', set: 'spx', year: 1999, sport: 'hockey', parallels: SPX_VINTAGE_PARALLELS },
  { brand: 'upper-deck', set: 'spx', year: 1998, sport: 'hockey', parallels: SPX_VINTAGE_PARALLELS },
  { brand: 'upper-deck', set: 'spx', year: 1997, sport: 'hockey', parallels: SPX_VINTAGE_PARALLELS },
  { brand: 'upper-deck', set: 'spx', year: 1996, sport: 'hockey', parallels: SPX_VINTAGE_PARALLELS },
  { brand: 'upper-deck', set: 'spx', year: 1997, sport: 'basketball', parallels: SPX_VINTAGE_PARALLELS },
  { brand: 'upper-deck', set: 'spx', year: 1996, sport: 'basketball', parallels: SPX_VINTAGE_PARALLELS },
  
  // Upper Deck Young Guns (Hockey - 1990s-2014)
  { brand: 'upper-deck', set: 'young-guns', year: 2014, sport: 'hockey', parallels: YOUNG_GUNS_PARALLELS },
  { brand: 'upper-deck', set: 'young-guns', year: 2013, sport: 'hockey', parallels: YOUNG_GUNS_PARALLELS },
  { brand: 'upper-deck', set: 'young-guns', year: 2012, sport: 'hockey', parallels: YOUNG_GUNS_PARALLELS },
  { brand: 'upper-deck', set: 'young-guns', year: 2011, sport: 'hockey', parallels: YOUNG_GUNS_PARALLELS },
  { brand: 'upper-deck', set: 'young-guns', year: 2010, sport: 'hockey', parallels: YOUNG_GUNS_PARALLELS },
  { brand: 'upper-deck', set: 'young-guns', year: 2009, sport: 'hockey', parallels: YOUNG_GUNS_PARALLELS },
  { brand: 'upper-deck', set: 'young-guns', year: 2008, sport: 'hockey', parallels: YOUNG_GUNS_PARALLELS },
  { brand: 'upper-deck', set: 'young-guns', year: 2007, sport: 'hockey', parallels: YOUNG_GUNS_PARALLELS },
  { brand: 'upper-deck', set: 'young-guns', year: 2006, sport: 'hockey', parallels: YOUNG_GUNS_PARALLELS },
  { brand: 'upper-deck', set: 'young-guns', year: 2005, sport: 'hockey', parallels: YOUNG_GUNS_PARALLELS },
  { brand: 'upper-deck', set: 'young-guns', year: 2000, sport: 'hockey', parallels: YOUNG_GUNS_PARALLELS },
  { brand: 'upper-deck', set: 'young-guns', year: 1999, sport: 'hockey', parallels: YOUNG_GUNS_PARALLELS },
  { brand: 'upper-deck', set: 'young-guns', year: 1998, sport: 'hockey', parallels: YOUNG_GUNS_PARALLELS },
  { brand: 'upper-deck', set: 'young-guns', year: 1997, sport: 'hockey', parallels: YOUNG_GUNS_PARALLELS },
  
  // Upper Deck Black Diamond (1997-2014)
  { brand: 'upper-deck', set: 'black-diamond', year: 2014, sport: 'hockey', parallels: BLACK_DIAMOND_PARALLELS },
  { brand: 'upper-deck', set: 'black-diamond', year: 2013, sport: 'hockey', parallels: BLACK_DIAMOND_PARALLELS },
  { brand: 'upper-deck', set: 'black-diamond', year: 2012, sport: 'hockey', parallels: BLACK_DIAMOND_PARALLELS },
  { brand: 'upper-deck', set: 'black-diamond', year: 2011, sport: 'hockey', parallels: BLACK_DIAMOND_PARALLELS },
  { brand: 'upper-deck', set: 'black-diamond', year: 2010, sport: 'hockey', parallels: BLACK_DIAMOND_PARALLELS },
  { brand: 'upper-deck', set: 'black-diamond', year: 2009, sport: 'hockey', parallels: BLACK_DIAMOND_PARALLELS },
  { brand: 'upper-deck', set: 'black-diamond', year: 2008, sport: 'hockey', parallels: BLACK_DIAMOND_PARALLELS },
  { brand: 'upper-deck', set: 'black-diamond', year: 2007, sport: 'hockey', parallels: BLACK_DIAMOND_PARALLELS },
  { brand: 'upper-deck', set: 'black-diamond', year: 2006, sport: 'hockey', parallels: BLACK_DIAMOND_PARALLELS },
  { brand: 'upper-deck', set: 'black-diamond', year: 2005, sport: 'hockey', parallels: BLACK_DIAMOND_PARALLELS },
  { brand: 'upper-deck', set: 'black-diamond', year: 2004, sport: 'hockey', parallels: BLACK_DIAMOND_PARALLELS },
  { brand: 'upper-deck', set: 'black-diamond', year: 2003, sport: 'hockey', parallels: BLACK_DIAMOND_PARALLELS },
  { brand: 'upper-deck', set: 'black-diamond', year: 2002, sport: 'hockey', parallels: BLACK_DIAMOND_PARALLELS },
  { brand: 'upper-deck', set: 'black-diamond', year: 2001, sport: 'hockey', parallels: BLACK_DIAMOND_PARALLELS },
  { brand: 'upper-deck', set: 'black-diamond', year: 2000, sport: 'hockey', parallels: BLACK_DIAMOND_PARALLELS },
  { brand: 'upper-deck', set: 'black-diamond', year: 1999, sport: 'hockey', parallels: BLACK_DIAMOND_PARALLELS },
  { brand: 'upper-deck', set: 'black-diamond', year: 1998, sport: 'hockey', parallels: BLACK_DIAMOND_PARALLELS },
  { brand: 'upper-deck', set: 'black-diamond', year: 1997, sport: 'hockey', parallels: BLACK_DIAMOND_PARALLELS },
  
  // Upper Deck Ultimate Collection (2001-2014)
  { brand: 'upper-deck', set: 'ultimate-collection', year: 2014, sport: 'hockey', parallels: ULTIMATE_COLLECTION_PARALLELS },
  { brand: 'upper-deck', set: 'ultimate-collection', year: 2013, sport: 'hockey', parallels: ULTIMATE_COLLECTION_PARALLELS },
  { brand: 'upper-deck', set: 'ultimate-collection', year: 2012, sport: 'hockey', parallels: ULTIMATE_COLLECTION_PARALLELS },
  { brand: 'upper-deck', set: 'ultimate-collection', year: 2011, sport: 'hockey', parallels: ULTIMATE_COLLECTION_PARALLELS },
  { brand: 'upper-deck', set: 'ultimate-collection', year: 2010, sport: 'hockey', parallels: ULTIMATE_COLLECTION_PARALLELS },
  { brand: 'upper-deck', set: 'ultimate-collection', year: 2009, sport: 'hockey', parallels: ULTIMATE_COLLECTION_PARALLELS },
  { brand: 'upper-deck', set: 'ultimate-collection', year: 2008, sport: 'hockey', parallels: ULTIMATE_COLLECTION_PARALLELS },
  { brand: 'upper-deck', set: 'ultimate-collection', year: 2007, sport: 'hockey', parallels: ULTIMATE_COLLECTION_PARALLELS },
  { brand: 'upper-deck', set: 'ultimate-collection', year: 2006, sport: 'hockey', parallels: ULTIMATE_COLLECTION_PARALLELS },
  { brand: 'upper-deck', set: 'ultimate-collection', year: 2005, sport: 'hockey', parallels: ULTIMATE_COLLECTION_PARALLELS },
  { brand: 'upper-deck', set: 'ultimate-collection', year: 2004, sport: 'hockey', parallels: ULTIMATE_COLLECTION_PARALLELS },
  { brand: 'upper-deck', set: 'ultimate-collection', year: 2003, sport: 'hockey', parallels: ULTIMATE_COLLECTION_PARALLELS },
  { brand: 'upper-deck', set: 'ultimate-collection', year: 2002, sport: 'hockey', parallels: ULTIMATE_COLLECTION_PARALLELS },
  { brand: 'upper-deck', set: 'ultimate-collection', year: 2001, sport: 'hockey', parallels: ULTIMATE_COLLECTION_PARALLELS },
  { brand: 'upper-deck', set: 'ultimate-collection', year: 2008, sport: 'football', parallels: ULTIMATE_COLLECTION_PARALLELS },
  { brand: 'upper-deck', set: 'ultimate-collection', year: 2007, sport: 'football', parallels: ULTIMATE_COLLECTION_PARALLELS },
  { brand: 'upper-deck', set: 'ultimate-collection', year: 2006, sport: 'football', parallels: ULTIMATE_COLLECTION_PARALLELS },
  { brand: 'upper-deck', set: 'ultimate-collection', year: 2005, sport: 'football', parallels: ULTIMATE_COLLECTION_PARALLELS },
  { brand: 'upper-deck', set: 'ultimate-collection', year: 2003, sport: 'basketball', parallels: ULTIMATE_COLLECTION_PARALLELS },
  { brand: 'upper-deck', set: 'ultimate-collection', year: 2002, sport: 'basketball', parallels: ULTIMATE_COLLECTION_PARALLELS },
  
  // Fleer/Skybox Metal Universe (1995-2000)
  { brand: 'fleer', set: 'metal-universe', year: 2000, sport: 'basketball', parallels: METAL_UNIVERSE_PARALLELS },
  { brand: 'fleer', set: 'metal-universe', year: 1999, sport: 'basketball', parallels: METAL_UNIVERSE_PARALLELS },
  { brand: 'fleer', set: 'metal-universe', year: 1998, sport: 'basketball', parallels: METAL_UNIVERSE_PARALLELS },
  { brand: 'fleer', set: 'metal-universe', year: 1997, sport: 'basketball', parallels: METAL_UNIVERSE_PARALLELS },
  { brand: 'fleer', set: 'metal-universe', year: 1996, sport: 'basketball', parallels: METAL_UNIVERSE_PARALLELS },
  { brand: 'fleer', set: 'metal-universe', year: 2000, sport: 'football', parallels: METAL_UNIVERSE_PARALLELS },
  { brand: 'fleer', set: 'metal-universe', year: 1999, sport: 'football', parallels: METAL_UNIVERSE_PARALLELS },
  { brand: 'fleer', set: 'metal-universe', year: 1998, sport: 'football', parallels: METAL_UNIVERSE_PARALLELS },
  { brand: 'fleer', set: 'metal-universe', year: 1997, sport: 'football', parallels: METAL_UNIVERSE_PARALLELS },
  { brand: 'fleer', set: 'metal-universe', year: 1998, sport: 'baseball', parallels: METAL_UNIVERSE_PARALLELS },
  { brand: 'fleer', set: 'metal-universe', year: 1997, sport: 'baseball', parallels: METAL_UNIVERSE_PARALLELS },
  { brand: 'skybox', set: 'metal-universe', year: 1998, sport: 'basketball', parallels: METAL_UNIVERSE_PARALLELS },
  { brand: 'skybox', set: 'metal-universe', year: 1997, sport: 'basketball', parallels: METAL_UNIVERSE_PARALLELS },
  
  // Fleer Ultra (1991-2007)
  { brand: 'fleer', set: 'ultra', year: 2007, sport: 'baseball', parallels: FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'ultra', year: 2006, sport: 'baseball', parallels: FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'ultra', year: 2005, sport: 'baseball', parallels: FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'ultra', year: 2004, sport: 'baseball', parallels: FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'ultra', year: 2003, sport: 'baseball', parallels: FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'ultra', year: 2002, sport: 'baseball', parallels: FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'ultra', year: 2001, sport: 'baseball', parallels: FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'ultra', year: 2000, sport: 'baseball', parallels: FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'ultra', year: 1999, sport: 'baseball', parallels: FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'ultra', year: 1998, sport: 'baseball', parallels: FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'ultra', year: 1997, sport: 'baseball', parallels: FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'ultra', year: 1996, sport: 'baseball', parallels: FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'ultra', year: 1995, sport: 'baseball', parallels: FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'ultra', year: 1994, sport: 'baseball', parallels: FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'ultra', year: 1993, sport: 'baseball', parallels: FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'ultra', year: 1992, sport: 'baseball', parallels: FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'ultra', year: 1991, sport: 'baseball', parallels: FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'ultra', year: 2000, sport: 'basketball', parallels: FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'ultra', year: 1999, sport: 'basketball', parallels: FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'ultra', year: 1998, sport: 'basketball', parallels: FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'ultra', year: 1997, sport: 'basketball', parallels: FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'ultra', year: 1996, sport: 'basketball', parallels: FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'ultra', year: 1995, sport: 'basketball', parallels: FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'ultra', year: 2000, sport: 'football', parallels: FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'ultra', year: 1999, sport: 'football', parallels: FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'ultra', year: 1998, sport: 'football', parallels: FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'ultra', year: 1997, sport: 'football', parallels: FLEER_ULTRA_PARALLELS },
  
  // Fleer Flair (1993-2005)
  { brand: 'fleer', set: 'flair', year: 2005, sport: 'baseball', parallels: FLEER_FLAIR_PARALLELS },
  { brand: 'fleer', set: 'flair', year: 2004, sport: 'baseball', parallels: FLEER_FLAIR_PARALLELS },
  { brand: 'fleer', set: 'flair', year: 2003, sport: 'baseball', parallels: FLEER_FLAIR_PARALLELS },
  { brand: 'fleer', set: 'flair', year: 2002, sport: 'baseball', parallels: FLEER_FLAIR_PARALLELS },
  { brand: 'fleer', set: 'flair', year: 1998, sport: 'baseball', parallels: FLEER_FLAIR_PARALLELS },
  { brand: 'fleer', set: 'flair', year: 1997, sport: 'baseball', parallels: FLEER_FLAIR_PARALLELS },
  { brand: 'fleer', set: 'flair', year: 1996, sport: 'baseball', parallels: FLEER_FLAIR_PARALLELS },
  { brand: 'fleer', set: 'flair', year: 1995, sport: 'baseball', parallels: FLEER_FLAIR_PARALLELS },
  { brand: 'fleer', set: 'flair', year: 1994, sport: 'baseball', parallels: FLEER_FLAIR_PARALLELS },
  { brand: 'fleer', set: 'flair', year: 1993, sport: 'baseball', parallels: FLEER_FLAIR_PARALLELS },
  { brand: 'fleer', set: 'flair', year: 1998, sport: 'basketball', parallels: FLEER_FLAIR_PARALLELS },
  { brand: 'fleer', set: 'flair', year: 1997, sport: 'basketball', parallels: FLEER_FLAIR_PARALLELS },
  { brand: 'fleer', set: 'flair', year: 1996, sport: 'basketball', parallels: FLEER_FLAIR_PARALLELS },
  { brand: 'fleer', set: 'flair', year: 1995, sport: 'basketball', parallels: FLEER_FLAIR_PARALLELS },
  { brand: 'fleer', set: 'flair', year: 1994, sport: 'basketball', parallels: FLEER_FLAIR_PARALLELS },
  
  // Pacific Revolution (1998-2001)
  { brand: 'pacific', set: 'revolution', year: 2001, sport: 'baseball', parallels: PACIFIC_REVOLUTION_PARALLELS },
  { brand: 'pacific', set: 'revolution', year: 2000, sport: 'baseball', parallels: PACIFIC_REVOLUTION_PARALLELS },
  { brand: 'pacific', set: 'revolution', year: 1999, sport: 'baseball', parallels: PACIFIC_REVOLUTION_PARALLELS },
  { brand: 'pacific', set: 'revolution', year: 1998, sport: 'baseball', parallels: PACIFIC_REVOLUTION_PARALLELS },
  { brand: 'pacific', set: 'revolution', year: 2000, sport: 'football', parallels: PACIFIC_REVOLUTION_PARALLELS },
  { brand: 'pacific', set: 'revolution', year: 1999, sport: 'football', parallels: PACIFIC_REVOLUTION_PARALLELS },
  { brand: 'pacific', set: 'revolution', year: 1998, sport: 'football', parallels: PACIFIC_REVOLUTION_PARALLELS },
  { brand: 'pacific', set: 'revolution', year: 2000, sport: 'hockey', parallels: PACIFIC_REVOLUTION_PARALLELS },
  { brand: 'pacific', set: 'revolution', year: 1999, sport: 'hockey', parallels: PACIFIC_REVOLUTION_PARALLELS },
  
  // Pacific Aurora (1998-2001)
  { brand: 'pacific', set: 'aurora', year: 2001, sport: 'baseball', parallels: PACIFIC_AURORA_PARALLELS },
  { brand: 'pacific', set: 'aurora', year: 2000, sport: 'baseball', parallels: PACIFIC_AURORA_PARALLELS },
  { brand: 'pacific', set: 'aurora', year: 1999, sport: 'baseball', parallels: PACIFIC_AURORA_PARALLELS },
  { brand: 'pacific', set: 'aurora', year: 1998, sport: 'baseball', parallels: PACIFIC_AURORA_PARALLELS },
  { brand: 'pacific', set: 'aurora', year: 2000, sport: 'football', parallels: PACIFIC_AURORA_PARALLELS },
  { brand: 'pacific', set: 'aurora', year: 1999, sport: 'football', parallels: PACIFIC_AURORA_PARALLELS },
  { brand: 'pacific', set: 'aurora', year: 2000, sport: 'hockey', parallels: PACIFIC_AURORA_PARALLELS },
  { brand: 'pacific', set: 'aurora', year: 1999, sport: 'hockey', parallels: PACIFIC_AURORA_PARALLELS },
  
  // Pinnacle/Select Certified (1995-1998)
  { brand: 'pinnacle', set: 'certified', year: 1998, sport: 'baseball', parallels: PINNACLE_CERTIFIED_PARALLELS },
  { brand: 'pinnacle', set: 'certified', year: 1997, sport: 'baseball', parallels: PINNACLE_CERTIFIED_PARALLELS },
  { brand: 'pinnacle', set: 'certified', year: 1996, sport: 'baseball', parallels: PINNACLE_CERTIFIED_PARALLELS },
  { brand: 'pinnacle', set: 'certified', year: 1998, sport: 'hockey', parallels: PINNACLE_CERTIFIED_PARALLELS },
  { brand: 'pinnacle', set: 'certified', year: 1997, sport: 'hockey', parallels: PINNACLE_CERTIFIED_PARALLELS },
  { brand: 'pinnacle', set: 'certified', year: 1998, sport: 'football', parallels: PINNACLE_CERTIFIED_PARALLELS },
  { brand: 'pinnacle', set: 'certified', year: 1997, sport: 'football', parallels: PINNACLE_CERTIFIED_PARALLELS },
  { brand: 'select', set: 'certified', year: 1996, sport: 'baseball', parallels: PINNACLE_CERTIFIED_PARALLELS },
  { brand: 'select', set: 'certified', year: 1995, sport: 'baseball', parallels: PINNACLE_CERTIFIED_PARALLELS },
  { brand: 'select', set: 'certified', year: 1996, sport: 'hockey', parallels: PINNACLE_CERTIFIED_PARALLELS },
  { brand: 'select', set: 'certified', year: 1995, sport: 'hockey', parallels: PINNACLE_CERTIFIED_PARALLELS },
  { brand: 'select', set: 'certified', year: 1995, sport: 'football', parallels: PINNACLE_CERTIFIED_PARALLELS },
  
  // Totally Certified (1997-1998)
  { brand: 'pinnacle', set: 'totally-certified', year: 1998, sport: 'baseball', parallels: TOTALLY_CERTIFIED_PARALLELS },
  { brand: 'pinnacle', set: 'totally-certified', year: 1997, sport: 'baseball', parallels: TOTALLY_CERTIFIED_PARALLELS },
  { brand: 'pinnacle', set: 'totally-certified', year: 1998, sport: 'football', parallels: TOTALLY_CERTIFIED_PARALLELS },
  { brand: 'pinnacle', set: 'totally-certified', year: 1997, sport: 'football', parallels: TOTALLY_CERTIFIED_PARALLELS },
  
  // Score (1988-2000)
  { brand: 'score', set: 'score', year: 2000, sport: 'baseball', parallels: SCORE_VINTAGE_PARALLELS },
  { brand: 'score', set: 'score', year: 1999, sport: 'baseball', parallels: SCORE_VINTAGE_PARALLELS },
  { brand: 'score', set: 'score', year: 1998, sport: 'baseball', parallels: SCORE_VINTAGE_PARALLELS },
  { brand: 'score', set: 'score', year: 1997, sport: 'baseball', parallels: SCORE_VINTAGE_PARALLELS },
  { brand: 'score', set: 'score', year: 1996, sport: 'baseball', parallels: SCORE_VINTAGE_PARALLELS },
  { brand: 'score', set: 'score', year: 1995, sport: 'baseball', parallels: SCORE_VINTAGE_PARALLELS },
  { brand: 'score', set: 'score', year: 2000, sport: 'football', parallels: SCORE_VINTAGE_PARALLELS },
  { brand: 'score', set: 'score', year: 1999, sport: 'football', parallels: SCORE_VINTAGE_PARALLELS },
  { brand: 'score', set: 'score', year: 1998, sport: 'football', parallels: SCORE_VINTAGE_PARALLELS },
  { brand: 'score', set: 'score', year: 1997, sport: 'football', parallels: SCORE_VINTAGE_PARALLELS },
  { brand: 'score', set: 'score', year: 1996, sport: 'football', parallels: SCORE_VINTAGE_PARALLELS },
  { brand: 'score', set: 'score', year: 1995, sport: 'football', parallels: SCORE_VINTAGE_PARALLELS },
  { brand: 'score', set: 'score', year: 1998, sport: 'hockey', parallels: SCORE_VINTAGE_PARALLELS },
  { brand: 'score', set: 'score', year: 1997, sport: 'hockey', parallels: SCORE_VINTAGE_PARALLELS },
  
  // Donruss (1981-2005)
  { brand: 'donruss', set: 'donruss', year: 2005, sport: 'baseball', parallels: DONRUSS_VINTAGE_PARALLELS },
  { brand: 'donruss', set: 'donruss', year: 2004, sport: 'baseball', parallels: DONRUSS_VINTAGE_PARALLELS },
  { brand: 'donruss', set: 'donruss', year: 2003, sport: 'baseball', parallels: DONRUSS_VINTAGE_PARALLELS },
  { brand: 'donruss', set: 'donruss', year: 2002, sport: 'baseball', parallels: DONRUSS_VINTAGE_PARALLELS },
  { brand: 'donruss', set: 'donruss', year: 2001, sport: 'baseball', parallels: DONRUSS_VINTAGE_PARALLELS },
  { brand: 'donruss', set: 'donruss', year: 2000, sport: 'baseball', parallels: DONRUSS_VINTAGE_PARALLELS },
  { brand: 'donruss', set: 'donruss', year: 1999, sport: 'baseball', parallels: DONRUSS_VINTAGE_PARALLELS },
  { brand: 'donruss', set: 'donruss', year: 1998, sport: 'baseball', parallels: DONRUSS_VINTAGE_PARALLELS },
  { brand: 'donruss', set: 'donruss', year: 1997, sport: 'baseball', parallels: DONRUSS_VINTAGE_PARALLELS },
  { brand: 'donruss', set: 'donruss', year: 1996, sport: 'baseball', parallels: DONRUSS_VINTAGE_PARALLELS },
  { brand: 'donruss', set: 'donruss', year: 1995, sport: 'baseball', parallels: DONRUSS_VINTAGE_PARALLELS },
  { brand: 'donruss', set: 'elite', year: 2005, sport: 'baseball', parallels: DONRUSS_VINTAGE_PARALLELS },
  { brand: 'donruss', set: 'elite', year: 2004, sport: 'baseball', parallels: DONRUSS_VINTAGE_PARALLELS },
  { brand: 'donruss', set: 'elite', year: 2003, sport: 'baseball', parallels: DONRUSS_VINTAGE_PARALLELS },
  { brand: 'donruss', set: 'elite', year: 2002, sport: 'baseball', parallels: DONRUSS_VINTAGE_PARALLELS },
  { brand: 'donruss', set: 'elite', year: 2001, sport: 'baseball', parallels: DONRUSS_VINTAGE_PARALLELS },
  { brand: 'donruss', set: 'elite', year: 2000, sport: 'football', parallels: DONRUSS_VINTAGE_PARALLELS },
  { brand: 'donruss', set: 'elite', year: 1999, sport: 'football', parallels: DONRUSS_VINTAGE_PARALLELS },
  { brand: 'donruss', set: 'elite', year: 1998, sport: 'football', parallels: DONRUSS_VINTAGE_PARALLELS },
  
  // Playoff Contenders (1998-2010) - Pre-Panini
  { brand: 'playoff', set: 'contenders', year: 2010, sport: 'football', parallels: PLAYOFF_CONTENDERS_PARALLELS },
  { brand: 'playoff', set: 'contenders', year: 2009, sport: 'football', parallels: PLAYOFF_CONTENDERS_PARALLELS },
  { brand: 'playoff', set: 'contenders', year: 2008, sport: 'football', parallels: PLAYOFF_CONTENDERS_PARALLELS },
  { brand: 'playoff', set: 'contenders', year: 2007, sport: 'football', parallels: PLAYOFF_CONTENDERS_PARALLELS },
  { brand: 'playoff', set: 'contenders', year: 2006, sport: 'football', parallels: PLAYOFF_CONTENDERS_PARALLELS },
  { brand: 'playoff', set: 'contenders', year: 2005, sport: 'football', parallels: PLAYOFF_CONTENDERS_PARALLELS },
  { brand: 'playoff', set: 'contenders', year: 2004, sport: 'football', parallels: PLAYOFF_CONTENDERS_PARALLELS },
  { brand: 'playoff', set: 'contenders', year: 2003, sport: 'football', parallels: PLAYOFF_CONTENDERS_PARALLELS },
  { brand: 'playoff', set: 'contenders', year: 2002, sport: 'football', parallels: PLAYOFF_CONTENDERS_PARALLELS },
  { brand: 'playoff', set: 'contenders', year: 2001, sport: 'football', parallels: PLAYOFF_CONTENDERS_PARALLELS },
  { brand: 'playoff', set: 'contenders', year: 2000, sport: 'football', parallels: PLAYOFF_CONTENDERS_PARALLELS },
  { brand: 'playoff', set: 'contenders', year: 1999, sport: 'football', parallels: PLAYOFF_CONTENDERS_PARALLELS },
  { brand: 'playoff', set: 'contenders', year: 1998, sport: 'football', parallels: PLAYOFF_CONTENDERS_PARALLELS },
  
  // ============================================================================
  // PRE-1993 VINTAGE SPORTS CARDS - Complete Checklists
  // ============================================================================
  
  // ============ TOPPS BASEBALL - GOLDEN AGE (1952-1969) ============
  { brand: 'topps', set: 'topps', year: 1952, sport: 'baseball', parallels: TOPPS_VINTAGE_GOLDEN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1953, sport: 'baseball', parallels: TOPPS_VINTAGE_GOLDEN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1954, sport: 'baseball', parallels: TOPPS_VINTAGE_GOLDEN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1955, sport: 'baseball', parallels: TOPPS_VINTAGE_GOLDEN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1956, sport: 'baseball', parallels: TOPPS_VINTAGE_GOLDEN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1957, sport: 'baseball', parallels: TOPPS_VINTAGE_GOLDEN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1958, sport: 'baseball', parallels: TOPPS_VINTAGE_GOLDEN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1959, sport: 'baseball', parallels: TOPPS_VINTAGE_GOLDEN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1960, sport: 'baseball', parallels: TOPPS_VINTAGE_GOLDEN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1961, sport: 'baseball', parallels: TOPPS_VINTAGE_GOLDEN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1962, sport: 'baseball', parallels: TOPPS_VINTAGE_GOLDEN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1963, sport: 'baseball', parallels: TOPPS_VINTAGE_GOLDEN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1964, sport: 'baseball', parallels: TOPPS_VINTAGE_GOLDEN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1965, sport: 'baseball', parallels: TOPPS_VINTAGE_GOLDEN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1966, sport: 'baseball', parallels: TOPPS_VINTAGE_GOLDEN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1967, sport: 'baseball', parallels: TOPPS_VINTAGE_GOLDEN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1968, sport: 'baseball', parallels: TOPPS_VINTAGE_GOLDEN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1969, sport: 'baseball', parallels: TOPPS_VINTAGE_GOLDEN_PARALLELS },
  
  // ============ TOPPS BASEBALL - BRONZE AGE (1970-1980) ============
  { brand: 'topps', set: 'topps', year: 1970, sport: 'baseball', parallels: TOPPS_VINTAGE_BRONZE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1971, sport: 'baseball', parallels: TOPPS_VINTAGE_BRONZE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1972, sport: 'baseball', parallels: TOPPS_VINTAGE_BRONZE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1973, sport: 'baseball', parallels: TOPPS_VINTAGE_BRONZE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1974, sport: 'baseball', parallels: TOPPS_VINTAGE_BRONZE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1975, sport: 'baseball', parallels: TOPPS_VINTAGE_BRONZE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1976, sport: 'baseball', parallels: TOPPS_VINTAGE_BRONZE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1977, sport: 'baseball', parallels: TOPPS_VINTAGE_BRONZE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1978, sport: 'baseball', parallels: TOPPS_VINTAGE_BRONZE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1979, sport: 'baseball', parallels: TOPPS_VINTAGE_BRONZE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1980, sport: 'baseball', parallels: TOPPS_VINTAGE_BRONZE_PARALLELS },
  
  // ============ TOPPS BASEBALL - JUNK WAX ERA (1981-1992) ============
  { brand: 'topps', set: 'topps', year: 1981, sport: 'baseball', parallels: TOPPS_JUNK_WAX_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1982, sport: 'baseball', parallels: TOPPS_JUNK_WAX_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1983, sport: 'baseball', parallels: TOPPS_JUNK_WAX_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1984, sport: 'baseball', parallels: TOPPS_JUNK_WAX_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1985, sport: 'baseball', parallels: TOPPS_JUNK_WAX_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1986, sport: 'baseball', parallels: TOPPS_JUNK_WAX_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1987, sport: 'baseball', parallels: TOPPS_JUNK_WAX_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1988, sport: 'baseball', parallels: TOPPS_JUNK_WAX_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1989, sport: 'baseball', parallels: TOPPS_JUNK_WAX_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1990, sport: 'baseball', parallels: TOPPS_JUNK_WAX_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1991, sport: 'baseball', parallels: TOPPS_JUNK_WAX_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1992, sport: 'baseball', parallels: TOPPS_JUNK_WAX_PARALLELS },
  
  // ============ BOWMAN BASEBALL - VINTAGE (1948-1955) ============
  { brand: 'bowman', set: 'bowman', year: 1948, sport: 'baseball', parallels: BOWMAN_VINTAGE_PARALLELS },
  { brand: 'bowman', set: 'bowman', year: 1949, sport: 'baseball', parallels: BOWMAN_VINTAGE_PARALLELS },
  { brand: 'bowman', set: 'bowman', year: 1950, sport: 'baseball', parallels: BOWMAN_VINTAGE_PARALLELS },
  { brand: 'bowman', set: 'bowman', year: 1951, sport: 'baseball', parallels: BOWMAN_VINTAGE_PARALLELS },
  { brand: 'bowman', set: 'bowman', year: 1952, sport: 'baseball', parallels: BOWMAN_VINTAGE_PARALLELS },
  { brand: 'bowman', set: 'bowman', year: 1953, sport: 'baseball', parallels: BOWMAN_VINTAGE_PARALLELS },
  { brand: 'bowman', set: 'bowman', year: 1954, sport: 'baseball', parallels: BOWMAN_VINTAGE_PARALLELS },
  { brand: 'bowman', set: 'bowman', year: 1955, sport: 'baseball', parallels: BOWMAN_VINTAGE_PARALLELS },
  
  // ============ BOWMAN BASEBALL - PRE-CHROME (1989-1992) ============
  { brand: 'bowman', set: 'bowman', year: 1989, sport: 'baseball', parallels: BOWMAN_PRE_CHROME_PARALLELS },
  { brand: 'bowman', set: 'bowman', year: 1990, sport: 'baseball', parallels: BOWMAN_PRE_CHROME_PARALLELS },
  { brand: 'bowman', set: 'bowman', year: 1991, sport: 'baseball', parallels: BOWMAN_PRE_CHROME_PARALLELS },
  { brand: 'bowman', set: 'bowman', year: 1992, sport: 'baseball', parallels: BOWMAN_PRE_CHROME_PARALLELS },
  
  // ============ FLEER BASEBALL (1981-1992) ============
  { brand: 'fleer', set: 'fleer', year: 1981, sport: 'baseball', parallels: FLEER_VINTAGE_PARALLELS },
  { brand: 'fleer', set: 'fleer', year: 1982, sport: 'baseball', parallels: FLEER_VINTAGE_PARALLELS },
  { brand: 'fleer', set: 'fleer', year: 1983, sport: 'baseball', parallels: FLEER_VINTAGE_PARALLELS },
  { brand: 'fleer', set: 'fleer', year: 1984, sport: 'baseball', parallels: FLEER_VINTAGE_PARALLELS },
  { brand: 'fleer', set: 'fleer', year: 1985, sport: 'baseball', parallels: FLEER_VINTAGE_PARALLELS },
  { brand: 'fleer', set: 'fleer', year: 1986, sport: 'baseball', parallels: FLEER_VINTAGE_PARALLELS },
  { brand: 'fleer', set: 'fleer', year: 1987, sport: 'baseball', parallels: FLEER_VINTAGE_PARALLELS },
  { brand: 'fleer', set: 'fleer', year: 1988, sport: 'baseball', parallels: FLEER_VINTAGE_PARALLELS },
  { brand: 'fleer', set: 'fleer', year: 1989, sport: 'baseball', parallels: FLEER_VINTAGE_PARALLELS },
  { brand: 'fleer', set: 'fleer', year: 1990, sport: 'baseball', parallels: FLEER_VINTAGE_PARALLELS },
  { brand: 'fleer', set: 'fleer', year: 1991, sport: 'baseball', parallels: FLEER_VINTAGE_PARALLELS },
  { brand: 'fleer', set: 'fleer', year: 1992, sport: 'baseball', parallels: FLEER_VINTAGE_PARALLELS },
  
  // ============ DONRUSS BASEBALL (1981-1992) ============
  { brand: 'donruss', set: 'donruss', year: 1981, sport: 'baseball', parallels: DONRUSS_EARLY_PARALLELS },
  { brand: 'donruss', set: 'donruss', year: 1982, sport: 'baseball', parallels: DONRUSS_EARLY_PARALLELS },
  { brand: 'donruss', set: 'donruss', year: 1983, sport: 'baseball', parallels: DONRUSS_EARLY_PARALLELS },
  { brand: 'donruss', set: 'donruss', year: 1984, sport: 'baseball', parallels: DONRUSS_EARLY_PARALLELS },
  { brand: 'donruss', set: 'donruss', year: 1985, sport: 'baseball', parallels: DONRUSS_EARLY_PARALLELS },
  { brand: 'donruss', set: 'donruss', year: 1986, sport: 'baseball', parallels: DONRUSS_EARLY_PARALLELS },
  { brand: 'donruss', set: 'donruss', year: 1987, sport: 'baseball', parallels: DONRUSS_EARLY_PARALLELS },
  { brand: 'donruss', set: 'donruss', year: 1988, sport: 'baseball', parallels: DONRUSS_EARLY_PARALLELS },
  { brand: 'donruss', set: 'donruss', year: 1989, sport: 'baseball', parallels: DONRUSS_EARLY_PARALLELS },
  { brand: 'donruss', set: 'donruss', year: 1990, sport: 'baseball', parallels: DONRUSS_EARLY_PARALLELS },
  { brand: 'donruss', set: 'donruss', year: 1991, sport: 'baseball', parallels: DONRUSS_EARLY_PARALLELS },
  { brand: 'donruss', set: 'donruss', year: 1992, sport: 'baseball', parallels: DONRUSS_EARLY_PARALLELS },
  
  // ============ UPPER DECK BASEBALL (1989-1992) ============
  { brand: 'upper-deck', set: 'upper-deck', year: 1989, sport: 'baseball', parallels: UPPER_DECK_EARLY_PARALLELS },
  { brand: 'upper-deck', set: 'upper-deck', year: 1990, sport: 'baseball', parallels: UPPER_DECK_EARLY_PARALLELS },
  { brand: 'upper-deck', set: 'upper-deck', year: 1991, sport: 'baseball', parallels: UPPER_DECK_EARLY_PARALLELS },
  { brand: 'upper-deck', set: 'upper-deck', year: 1992, sport: 'baseball', parallels: UPPER_DECK_EARLY_PARALLELS },
  
  // ============ SCORE BASEBALL (1988-1992) ============
  { brand: 'score', set: 'score', year: 1988, sport: 'baseball', parallels: SCORE_EARLY_PARALLELS },
  { brand: 'score', set: 'score', year: 1989, sport: 'baseball', parallels: SCORE_EARLY_PARALLELS },
  { brand: 'score', set: 'score', year: 1990, sport: 'baseball', parallels: SCORE_EARLY_PARALLELS },
  { brand: 'score', set: 'score', year: 1991, sport: 'baseball', parallels: SCORE_EARLY_PARALLELS },
  { brand: 'score', set: 'score', year: 1992, sport: 'baseball', parallels: SCORE_EARLY_PARALLELS },
  
  // ============ STADIUM CLUB BASEBALL (1991-1992) ============
  { brand: 'topps', set: 'stadium-club', year: 1991, sport: 'baseball', parallels: STADIUM_CLUB_EARLY_PARALLELS },
  { brand: 'topps', set: 'stadium-club', year: 1992, sport: 'baseball', parallels: STADIUM_CLUB_EARLY_PARALLELS },
  
  // ============ TOPPS FOOTBALL - VINTAGE (1956-1979) ============
  { brand: 'topps', set: 'topps', year: 1956, sport: 'football', parallels: TOPPS_FOOTBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1957, sport: 'football', parallels: TOPPS_FOOTBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1958, sport: 'football', parallels: TOPPS_FOOTBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1959, sport: 'football', parallels: TOPPS_FOOTBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1960, sport: 'football', parallels: TOPPS_FOOTBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1961, sport: 'football', parallels: TOPPS_FOOTBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1962, sport: 'football', parallels: TOPPS_FOOTBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1963, sport: 'football', parallels: TOPPS_FOOTBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1964, sport: 'football', parallels: TOPPS_FOOTBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1965, sport: 'football', parallels: TOPPS_FOOTBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1966, sport: 'football', parallels: TOPPS_FOOTBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1967, sport: 'football', parallels: TOPPS_FOOTBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1968, sport: 'football', parallels: TOPPS_FOOTBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1969, sport: 'football', parallels: TOPPS_FOOTBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1970, sport: 'football', parallels: TOPPS_FOOTBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1971, sport: 'football', parallels: TOPPS_FOOTBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1972, sport: 'football', parallels: TOPPS_FOOTBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1973, sport: 'football', parallels: TOPPS_FOOTBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1974, sport: 'football', parallels: TOPPS_FOOTBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1975, sport: 'football', parallels: TOPPS_FOOTBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1976, sport: 'football', parallels: TOPPS_FOOTBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1977, sport: 'football', parallels: TOPPS_FOOTBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1978, sport: 'football', parallels: TOPPS_FOOTBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1979, sport: 'football', parallels: TOPPS_FOOTBALL_VINTAGE_PARALLELS },
  
  // ============ TOPPS FOOTBALL (1980-1992) ============
  { brand: 'topps', set: 'topps', year: 1980, sport: 'football', parallels: TOPPS_FOOTBALL_MODERN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1981, sport: 'football', parallels: TOPPS_FOOTBALL_MODERN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1982, sport: 'football', parallels: TOPPS_FOOTBALL_MODERN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1983, sport: 'football', parallels: TOPPS_FOOTBALL_MODERN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1984, sport: 'football', parallels: TOPPS_FOOTBALL_MODERN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1985, sport: 'football', parallels: TOPPS_FOOTBALL_MODERN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1986, sport: 'football', parallels: TOPPS_FOOTBALL_MODERN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1987, sport: 'football', parallels: TOPPS_FOOTBALL_MODERN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1988, sport: 'football', parallels: TOPPS_FOOTBALL_MODERN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1989, sport: 'football', parallels: TOPPS_FOOTBALL_MODERN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1990, sport: 'football', parallels: TOPPS_FOOTBALL_MODERN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1991, sport: 'football', parallels: TOPPS_FOOTBALL_MODERN_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1992, sport: 'football', parallels: TOPPS_FOOTBALL_MODERN_PARALLELS },
  
  // ============ PRO SET FOOTBALL (1989-1991) ============
  { brand: 'pro-set', set: 'pro-set', year: 1989, sport: 'football', parallels: PRO_SET_PARALLELS },
  { brand: 'pro-set', set: 'pro-set', year: 1990, sport: 'football', parallels: PRO_SET_PARALLELS },
  { brand: 'pro-set', set: 'pro-set', year: 1991, sport: 'football', parallels: PRO_SET_PARALLELS },
  
  // ============ SCORE FOOTBALL (1989-1992) ============
  { brand: 'score', set: 'score', year: 1989, sport: 'football', parallels: SCORE_FOOTBALL_PARALLELS },
  { brand: 'score', set: 'score', year: 1990, sport: 'football', parallels: SCORE_FOOTBALL_PARALLELS },
  { brand: 'score', set: 'score', year: 1991, sport: 'football', parallels: SCORE_FOOTBALL_PARALLELS },
  { brand: 'score', set: 'score', year: 1992, sport: 'football', parallels: SCORE_FOOTBALL_PARALLELS },
  
  // ============ FLEER FOOTBALL (1990-1992) ============
  { brand: 'fleer', set: 'fleer', year: 1990, sport: 'football', parallels: FLEER_FOOTBALL_PARALLELS },
  { brand: 'fleer', set: 'fleer', year: 1991, sport: 'football', parallels: FLEER_FOOTBALL_PARALLELS },
  { brand: 'fleer', set: 'fleer', year: 1992, sport: 'football', parallels: FLEER_FOOTBALL_PARALLELS },
  
  // ============ UPPER DECK FOOTBALL (1991-1992) ============
  { brand: 'upper-deck', set: 'upper-deck', year: 1991, sport: 'football', parallels: UPPER_DECK_EARLY_PARALLELS },
  { brand: 'upper-deck', set: 'upper-deck', year: 1992, sport: 'football', parallels: UPPER_DECK_EARLY_PARALLELS },
  
  // ============ TOPPS BASKETBALL - VINTAGE (1957-1981) ============
  { brand: 'topps', set: 'topps', year: 1957, sport: 'basketball', parallels: TOPPS_BASKETBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1958, sport: 'basketball', parallels: TOPPS_BASKETBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1969, sport: 'basketball', parallels: TOPPS_BASKETBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1970, sport: 'basketball', parallels: TOPPS_BASKETBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1971, sport: 'basketball', parallels: TOPPS_BASKETBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1972, sport: 'basketball', parallels: TOPPS_BASKETBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1973, sport: 'basketball', parallels: TOPPS_BASKETBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1974, sport: 'basketball', parallels: TOPPS_BASKETBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1975, sport: 'basketball', parallels: TOPPS_BASKETBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1976, sport: 'basketball', parallels: TOPPS_BASKETBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1977, sport: 'basketball', parallels: TOPPS_BASKETBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1978, sport: 'basketball', parallels: TOPPS_BASKETBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1979, sport: 'basketball', parallels: TOPPS_BASKETBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1980, sport: 'basketball', parallels: TOPPS_BASKETBALL_VINTAGE_PARALLELS },
  { brand: 'topps', set: 'topps', year: 1981, sport: 'basketball', parallels: TOPPS_BASKETBALL_VINTAGE_PARALLELS },
  
  // ============ FLEER BASKETBALL (1961 + 1986-1992) ============
  { brand: 'fleer', set: 'fleer', year: 1961, sport: 'basketball', parallels: FLEER_BASKETBALL_PARALLELS },
  { brand: 'fleer', set: 'fleer', year: 1986, sport: 'basketball', parallels: FLEER_BASKETBALL_PARALLELS },
  { brand: 'fleer', set: 'fleer', year: 1987, sport: 'basketball', parallels: FLEER_BASKETBALL_PARALLELS },
  { brand: 'fleer', set: 'fleer', year: 1988, sport: 'basketball', parallels: FLEER_BASKETBALL_PARALLELS },
  { brand: 'fleer', set: 'fleer', year: 1989, sport: 'basketball', parallels: FLEER_BASKETBALL_PARALLELS },
  { brand: 'fleer', set: 'fleer', year: 1990, sport: 'basketball', parallels: FLEER_BASKETBALL_PARALLELS },
  { brand: 'fleer', set: 'fleer', year: 1991, sport: 'basketball', parallels: FLEER_BASKETBALL_PARALLELS },
  { brand: 'fleer', set: 'fleer', year: 1992, sport: 'basketball', parallels: FLEER_BASKETBALL_PARALLELS },
  
  // ============ NBA HOOPS (1989-1992) ============
  { brand: 'hoops', set: 'hoops', year: 1989, sport: 'basketball', parallels: HOOPS_PARALLELS },
  { brand: 'hoops', set: 'hoops', year: 1990, sport: 'basketball', parallels: HOOPS_PARALLELS },
  { brand: 'hoops', set: 'hoops', year: 1991, sport: 'basketball', parallels: HOOPS_PARALLELS },
  { brand: 'hoops', set: 'hoops', year: 1992, sport: 'basketball', parallels: HOOPS_PARALLELS },
  
  // ============ SKYBOX BASKETBALL (1990-1992) ============
  { brand: 'skybox', set: 'skybox', year: 1990, sport: 'basketball', parallels: SKYBOX_BASKETBALL_PARALLELS },
  { brand: 'skybox', set: 'skybox', year: 1991, sport: 'basketball', parallels: SKYBOX_BASKETBALL_PARALLELS },
  { brand: 'skybox', set: 'skybox', year: 1992, sport: 'basketball', parallels: SKYBOX_BASKETBALL_PARALLELS },
  
  // ============ UPPER DECK BASKETBALL (1991-1992) ============
  { brand: 'upper-deck', set: 'upper-deck', year: 1991, sport: 'basketball', parallels: UPPER_DECK_BASKETBALL_PARALLELS },
  { brand: 'upper-deck', set: 'upper-deck', year: 1992, sport: 'basketball', parallels: UPPER_DECK_BASKETBALL_PARALLELS },
  
  // ============ STADIUM CLUB BASKETBALL (1991-1992) ============
  { brand: 'topps', set: 'stadium-club', year: 1991, sport: 'basketball', parallels: STADIUM_CLUB_EARLY_PARALLELS },
  { brand: 'topps', set: 'stadium-club', year: 1992, sport: 'basketball', parallels: STADIUM_CLUB_EARLY_PARALLELS },
  
  // ============ BOWMAN CHROME SAPPHIRE (Premium Subset 2017-2025) ============
  { brand: 'topps', set: 'bowman-chrome-sapphire', year: 2025, sport: 'baseball', parallels: BOWMAN_CHROME_SAPPHIRE_PARALLELS },
  { brand: 'topps', set: 'bowman-chrome-sapphire', year: 2024, sport: 'baseball', parallels: BOWMAN_CHROME_SAPPHIRE_PARALLELS },
  { brand: 'topps', set: 'bowman-chrome-sapphire', year: 2023, sport: 'baseball', parallels: BOWMAN_CHROME_SAPPHIRE_PARALLELS },
  { brand: 'topps', set: 'bowman-chrome-sapphire', year: 2022, sport: 'baseball', parallels: BOWMAN_CHROME_SAPPHIRE_PARALLELS },
  { brand: 'topps', set: 'bowman-chrome-sapphire', year: 2021, sport: 'baseball', parallels: BOWMAN_CHROME_SAPPHIRE_PARALLELS },
  { brand: 'topps', set: 'bowman-chrome-sapphire', year: 2020, sport: 'baseball', parallels: BOWMAN_CHROME_SAPPHIRE_PARALLELS },
  { brand: 'topps', set: 'bowman-chrome-sapphire', year: 2019, sport: 'baseball', parallels: BOWMAN_CHROME_SAPPHIRE_PARALLELS },
  { brand: 'topps', set: 'bowman-chrome-sapphire', year: 2018, sport: 'baseball', parallels: BOWMAN_CHROME_SAPPHIRE_PARALLELS },
  { brand: 'topps', set: 'bowman-chrome-sapphire', year: 2017, sport: 'baseball', parallels: BOWMAN_CHROME_SAPPHIRE_PARALLELS },
  
  // Topps Chrome Sapphire (Premium Subset)
  { brand: 'topps', set: 'chrome-sapphire', year: 2025, sport: 'baseball', parallels: TOPPS_CHROME_SAPPHIRE_PARALLELS },
  { brand: 'topps', set: 'chrome-sapphire', year: 2024, sport: 'baseball', parallels: TOPPS_CHROME_SAPPHIRE_PARALLELS },
  { brand: 'topps', set: 'chrome-sapphire', year: 2023, sport: 'baseball', parallels: TOPPS_CHROME_SAPPHIRE_PARALLELS },
  { brand: 'topps', set: 'chrome-sapphire', year: 2022, sport: 'baseball', parallels: TOPPS_CHROME_SAPPHIRE_PARALLELS },
  { brand: 'topps', set: 'chrome-sapphire', year: 2021, sport: 'baseball', parallels: TOPPS_CHROME_SAPPHIRE_PARALLELS },
  { brand: 'topps', set: 'chrome-sapphire', year: 2020, sport: 'baseball', parallels: TOPPS_CHROME_SAPPHIRE_PARALLELS },
  
  // ============ POKEMON TCG (1999-2025) ============
  
  // Wizards of the Coast Era (1999-2003)
  { brand: 'pokemon', set: 'base-set', year: 1999, sport: 'pokemon', parallels: POKEMON_WOTC_PARALLELS },
  { brand: 'pokemon', set: 'jungle', year: 1999, sport: 'pokemon', parallels: POKEMON_WOTC_PARALLELS },
  { brand: 'pokemon', set: 'fossil', year: 1999, sport: 'pokemon', parallels: POKEMON_WOTC_PARALLELS },
  { brand: 'pokemon', set: 'base-set-2', year: 2000, sport: 'pokemon', parallels: POKEMON_WOTC_PARALLELS },
  { brand: 'pokemon', set: 'team-rocket', year: 2000, sport: 'pokemon', parallels: POKEMON_WOTC_PARALLELS },
  { brand: 'pokemon', set: 'gym-heroes', year: 2000, sport: 'pokemon', parallels: POKEMON_WOTC_PARALLELS },
  { brand: 'pokemon', set: 'gym-challenge', year: 2000, sport: 'pokemon', parallels: POKEMON_WOTC_PARALLELS },
  { brand: 'pokemon', set: 'neo-genesis', year: 2000, sport: 'pokemon', parallels: POKEMON_WOTC_PARALLELS },
  { brand: 'pokemon', set: 'neo-discovery', year: 2001, sport: 'pokemon', parallels: POKEMON_WOTC_PARALLELS },
  { brand: 'pokemon', set: 'neo-revelation', year: 2001, sport: 'pokemon', parallels: POKEMON_WOTC_PARALLELS },
  { brand: 'pokemon', set: 'neo-destiny', year: 2002, sport: 'pokemon', parallels: POKEMON_WOTC_PARALLELS },
  { brand: 'pokemon', set: 'legendary-collection', year: 2002, sport: 'pokemon', parallels: POKEMON_WOTC_PARALLELS },
  { brand: 'pokemon', set: 'expedition', year: 2002, sport: 'pokemon', parallels: POKEMON_WOTC_PARALLELS },
  { brand: 'pokemon', set: 'aquapolis', year: 2003, sport: 'pokemon', parallels: POKEMON_WOTC_PARALLELS },
  { brand: 'pokemon', set: 'skyridge', year: 2003, sport: 'pokemon', parallels: POKEMON_WOTC_PARALLELS },
  
  // EX Era (2003-2007)
  { brand: 'pokemon', set: 'ex-ruby-sapphire', year: 2003, sport: 'pokemon', parallels: POKEMON_EX_ERA_PARALLELS },
  { brand: 'pokemon', set: 'ex-sandstorm', year: 2003, sport: 'pokemon', parallels: POKEMON_EX_ERA_PARALLELS },
  { brand: 'pokemon', set: 'ex-dragon', year: 2003, sport: 'pokemon', parallels: POKEMON_EX_ERA_PARALLELS },
  { brand: 'pokemon', set: 'ex-team-magma-aqua', year: 2004, sport: 'pokemon', parallels: POKEMON_EX_ERA_PARALLELS },
  { brand: 'pokemon', set: 'ex-hidden-legends', year: 2004, sport: 'pokemon', parallels: POKEMON_EX_ERA_PARALLELS },
  { brand: 'pokemon', set: 'ex-firered-leafgreen', year: 2004, sport: 'pokemon', parallels: POKEMON_EX_ERA_PARALLELS },
  { brand: 'pokemon', set: 'ex-team-rocket-returns', year: 2004, sport: 'pokemon', parallels: POKEMON_EX_ERA_PARALLELS },
  { brand: 'pokemon', set: 'ex-deoxys', year: 2005, sport: 'pokemon', parallels: POKEMON_EX_ERA_PARALLELS },
  { brand: 'pokemon', set: 'ex-emerald', year: 2005, sport: 'pokemon', parallels: POKEMON_EX_ERA_PARALLELS },
  { brand: 'pokemon', set: 'ex-unseen-forces', year: 2005, sport: 'pokemon', parallels: POKEMON_EX_ERA_PARALLELS },
  { brand: 'pokemon', set: 'ex-delta-species', year: 2005, sport: 'pokemon', parallels: POKEMON_EX_ERA_PARALLELS },
  { brand: 'pokemon', set: 'ex-legend-maker', year: 2006, sport: 'pokemon', parallels: POKEMON_EX_ERA_PARALLELS },
  { brand: 'pokemon', set: 'ex-holon-phantoms', year: 2006, sport: 'pokemon', parallels: POKEMON_EX_ERA_PARALLELS },
  { brand: 'pokemon', set: 'ex-crystal-guardians', year: 2006, sport: 'pokemon', parallels: POKEMON_EX_ERA_PARALLELS },
  { brand: 'pokemon', set: 'ex-dragon-frontiers', year: 2006, sport: 'pokemon', parallels: POKEMON_EX_ERA_PARALLELS },
  { brand: 'pokemon', set: 'ex-power-keepers', year: 2007, sport: 'pokemon', parallels: POKEMON_EX_ERA_PARALLELS },
  
  // Diamond & Pearl / Platinum Era (2007-2011)
  { brand: 'pokemon', set: 'diamond-pearl', year: 2007, sport: 'pokemon', parallels: POKEMON_DP_ERA_PARALLELS },
  { brand: 'pokemon', set: 'mysterious-treasures', year: 2007, sport: 'pokemon', parallels: POKEMON_DP_ERA_PARALLELS },
  { brand: 'pokemon', set: 'secret-wonders', year: 2007, sport: 'pokemon', parallels: POKEMON_DP_ERA_PARALLELS },
  { brand: 'pokemon', set: 'great-encounters', year: 2008, sport: 'pokemon', parallels: POKEMON_DP_ERA_PARALLELS },
  { brand: 'pokemon', set: 'majestic-dawn', year: 2008, sport: 'pokemon', parallels: POKEMON_DP_ERA_PARALLELS },
  { brand: 'pokemon', set: 'legends-awakened', year: 2008, sport: 'pokemon', parallels: POKEMON_DP_ERA_PARALLELS },
  { brand: 'pokemon', set: 'stormfront', year: 2008, sport: 'pokemon', parallels: POKEMON_DP_ERA_PARALLELS },
  { brand: 'pokemon', set: 'platinum', year: 2009, sport: 'pokemon', parallels: POKEMON_DP_ERA_PARALLELS },
  { brand: 'pokemon', set: 'rising-rivals', year: 2009, sport: 'pokemon', parallels: POKEMON_DP_ERA_PARALLELS },
  { brand: 'pokemon', set: 'supreme-victors', year: 2009, sport: 'pokemon', parallels: POKEMON_DP_ERA_PARALLELS },
  { brand: 'pokemon', set: 'arceus', year: 2009, sport: 'pokemon', parallels: POKEMON_DP_ERA_PARALLELS },
  { brand: 'pokemon', set: 'heartgold-soulsilver', year: 2010, sport: 'pokemon', parallels: POKEMON_DP_ERA_PARALLELS },
  { brand: 'pokemon', set: 'unleashed', year: 2010, sport: 'pokemon', parallels: POKEMON_DP_ERA_PARALLELS },
  { brand: 'pokemon', set: 'undaunted', year: 2010, sport: 'pokemon', parallels: POKEMON_DP_ERA_PARALLELS },
  { brand: 'pokemon', set: 'triumphant', year: 2010, sport: 'pokemon', parallels: POKEMON_DP_ERA_PARALLELS },
  { brand: 'pokemon', set: 'call-of-legends', year: 2011, sport: 'pokemon', parallels: POKEMON_DP_ERA_PARALLELS },
  
  // Black & White / XY Era (2011-2016)
  { brand: 'pokemon', set: 'black-white', year: 2011, sport: 'pokemon', parallels: POKEMON_BW_XY_PARALLELS },
  { brand: 'pokemon', set: 'emerging-powers', year: 2011, sport: 'pokemon', parallels: POKEMON_BW_XY_PARALLELS },
  { brand: 'pokemon', set: 'noble-victories', year: 2011, sport: 'pokemon', parallels: POKEMON_BW_XY_PARALLELS },
  { brand: 'pokemon', set: 'next-destinies', year: 2012, sport: 'pokemon', parallels: POKEMON_BW_XY_PARALLELS },
  { brand: 'pokemon', set: 'dark-explorers', year: 2012, sport: 'pokemon', parallels: POKEMON_BW_XY_PARALLELS },
  { brand: 'pokemon', set: 'dragons-exalted', year: 2012, sport: 'pokemon', parallels: POKEMON_BW_XY_PARALLELS },
  { brand: 'pokemon', set: 'boundaries-crossed', year: 2012, sport: 'pokemon', parallels: POKEMON_BW_XY_PARALLELS },
  { brand: 'pokemon', set: 'plasma-storm', year: 2013, sport: 'pokemon', parallels: POKEMON_BW_XY_PARALLELS },
  { brand: 'pokemon', set: 'plasma-freeze', year: 2013, sport: 'pokemon', parallels: POKEMON_BW_XY_PARALLELS },
  { brand: 'pokemon', set: 'plasma-blast', year: 2013, sport: 'pokemon', parallels: POKEMON_BW_XY_PARALLELS },
  { brand: 'pokemon', set: 'legendary-treasures', year: 2013, sport: 'pokemon', parallels: POKEMON_BW_XY_PARALLELS },
  { brand: 'pokemon', set: 'xy', year: 2014, sport: 'pokemon', parallels: POKEMON_BW_XY_PARALLELS },
  { brand: 'pokemon', set: 'flashfire', year: 2014, sport: 'pokemon', parallels: POKEMON_BW_XY_PARALLELS },
  { brand: 'pokemon', set: 'furious-fists', year: 2014, sport: 'pokemon', parallels: POKEMON_BW_XY_PARALLELS },
  { brand: 'pokemon', set: 'phantom-forces', year: 2014, sport: 'pokemon', parallels: POKEMON_BW_XY_PARALLELS },
  { brand: 'pokemon', set: 'primal-clash', year: 2015, sport: 'pokemon', parallels: POKEMON_BW_XY_PARALLELS },
  { brand: 'pokemon', set: 'roaring-skies', year: 2015, sport: 'pokemon', parallels: POKEMON_BW_XY_PARALLELS },
  { brand: 'pokemon', set: 'ancient-origins', year: 2015, sport: 'pokemon', parallels: POKEMON_BW_XY_PARALLELS },
  { brand: 'pokemon', set: 'breakthrough', year: 2015, sport: 'pokemon', parallels: POKEMON_BW_XY_PARALLELS },
  { brand: 'pokemon', set: 'breakpoint', year: 2016, sport: 'pokemon', parallels: POKEMON_BW_XY_PARALLELS },
  { brand: 'pokemon', set: 'generations', year: 2016, sport: 'pokemon', parallels: POKEMON_BW_XY_PARALLELS },
  { brand: 'pokemon', set: 'fates-collide', year: 2016, sport: 'pokemon', parallels: POKEMON_BW_XY_PARALLELS },
  { brand: 'pokemon', set: 'steam-siege', year: 2016, sport: 'pokemon', parallels: POKEMON_BW_XY_PARALLELS },
  { brand: 'pokemon', set: 'evolutions', year: 2016, sport: 'pokemon', parallels: POKEMON_BW_XY_PARALLELS },
  
  // Sun & Moon Era (2017-2019)
  { brand: 'pokemon', set: 'sun-moon', year: 2017, sport: 'pokemon', parallels: POKEMON_SM_PARALLELS },
  { brand: 'pokemon', set: 'guardians-rising', year: 2017, sport: 'pokemon', parallels: POKEMON_SM_PARALLELS },
  { brand: 'pokemon', set: 'burning-shadows', year: 2017, sport: 'pokemon', parallels: POKEMON_SM_PARALLELS },
  { brand: 'pokemon', set: 'shining-legends', year: 2017, sport: 'pokemon', parallels: POKEMON_SM_PARALLELS },
  { brand: 'pokemon', set: 'crimson-invasion', year: 2017, sport: 'pokemon', parallels: POKEMON_SM_PARALLELS },
  { brand: 'pokemon', set: 'ultra-prism', year: 2018, sport: 'pokemon', parallels: POKEMON_SM_PARALLELS },
  { brand: 'pokemon', set: 'forbidden-light', year: 2018, sport: 'pokemon', parallels: POKEMON_SM_PARALLELS },
  { brand: 'pokemon', set: 'celestial-storm', year: 2018, sport: 'pokemon', parallels: POKEMON_SM_PARALLELS },
  { brand: 'pokemon', set: 'dragon-majesty', year: 2018, sport: 'pokemon', parallels: POKEMON_SM_PARALLELS },
  { brand: 'pokemon', set: 'lost-thunder', year: 2018, sport: 'pokemon', parallels: POKEMON_SM_PARALLELS },
  { brand: 'pokemon', set: 'team-up', year: 2019, sport: 'pokemon', parallels: POKEMON_SM_PARALLELS },
  { brand: 'pokemon', set: 'detective-pikachu', year: 2019, sport: 'pokemon', parallels: POKEMON_SM_PARALLELS },
  { brand: 'pokemon', set: 'unbroken-bonds', year: 2019, sport: 'pokemon', parallels: POKEMON_SM_PARALLELS },
  { brand: 'pokemon', set: 'unified-minds', year: 2019, sport: 'pokemon', parallels: POKEMON_SM_PARALLELS },
  { brand: 'pokemon', set: 'hidden-fates', year: 2019, sport: 'pokemon', parallels: POKEMON_SHINY_VAULT_PARALLELS },
  { brand: 'pokemon', set: 'cosmic-eclipse', year: 2019, sport: 'pokemon', parallels: POKEMON_SM_PARALLELS },
  
  // Sword & Shield Era (2020-2023)
  { brand: 'pokemon', set: 'sword-shield', year: 2020, sport: 'pokemon', parallels: POKEMON_SWSH_PARALLELS },
  { brand: 'pokemon', set: 'rebel-clash', year: 2020, sport: 'pokemon', parallels: POKEMON_SWSH_PARALLELS },
  { brand: 'pokemon', set: 'darkness-ablaze', year: 2020, sport: 'pokemon', parallels: POKEMON_SWSH_PARALLELS },
  { brand: 'pokemon', set: 'champions-path', year: 2020, sport: 'pokemon', parallels: POKEMON_SWSH_PARALLELS },
  { brand: 'pokemon', set: 'vivid-voltage', year: 2020, sport: 'pokemon', parallels: POKEMON_SWSH_PARALLELS },
  { brand: 'pokemon', set: 'shining-fates', year: 2021, sport: 'pokemon', parallels: POKEMON_SHINY_VAULT_PARALLELS },
  { brand: 'pokemon', set: 'battle-styles', year: 2021, sport: 'pokemon', parallels: POKEMON_SWSH_PARALLELS },
  { brand: 'pokemon', set: 'chilling-reign', year: 2021, sport: 'pokemon', parallels: POKEMON_SWSH_PARALLELS },
  { brand: 'pokemon', set: 'evolving-skies', year: 2021, sport: 'pokemon', parallels: POKEMON_SWSH_PARALLELS },
  { brand: 'pokemon', set: 'celebrations', year: 2021, sport: 'pokemon', parallels: POKEMON_SWSH_PARALLELS },
  { brand: 'pokemon', set: 'fusion-strike', year: 2021, sport: 'pokemon', parallels: POKEMON_SWSH_PARALLELS },
  { brand: 'pokemon', set: 'brilliant-stars', year: 2022, sport: 'pokemon', parallels: POKEMON_SWSH_PARALLELS },
  { brand: 'pokemon', set: 'astral-radiance', year: 2022, sport: 'pokemon', parallels: POKEMON_SWSH_PARALLELS },
  { brand: 'pokemon', set: 'pokemon-go', year: 2022, sport: 'pokemon', parallels: POKEMON_SWSH_PARALLELS },
  { brand: 'pokemon', set: 'lost-origin', year: 2022, sport: 'pokemon', parallels: POKEMON_SWSH_PARALLELS },
  { brand: 'pokemon', set: 'silver-tempest', year: 2022, sport: 'pokemon', parallels: POKEMON_SWSH_PARALLELS },
  { brand: 'pokemon', set: 'crown-zenith', year: 2023, sport: 'pokemon', parallels: POKEMON_SWSH_PARALLELS },
  
  // Scarlet & Violet Era (2023-2025)
  { brand: 'pokemon', set: 'scarlet-violet', year: 2023, sport: 'pokemon', parallels: POKEMON_SV_PARALLELS },
  { brand: 'pokemon', set: 'paldea-evolved', year: 2023, sport: 'pokemon', parallels: POKEMON_SV_PARALLELS },
  { brand: 'pokemon', set: 'obsidian-flames', year: 2023, sport: 'pokemon', parallels: POKEMON_SV_PARALLELS },
  { brand: 'pokemon', set: '151', year: 2023, sport: 'pokemon', parallels: POKEMON_SV_PARALLELS },
  { brand: 'pokemon', set: 'paradox-rift', year: 2023, sport: 'pokemon', parallels: POKEMON_SV_PARALLELS },
  { brand: 'pokemon', set: 'paldean-fates', year: 2024, sport: 'pokemon', parallels: POKEMON_SHINY_VAULT_PARALLELS },
  { brand: 'pokemon', set: 'temporal-forces', year: 2024, sport: 'pokemon', parallels: POKEMON_SV_PARALLELS },
  { brand: 'pokemon', set: 'twilight-masquerade', year: 2024, sport: 'pokemon', parallels: POKEMON_SV_PARALLELS },
  { brand: 'pokemon', set: 'shrouded-fable', year: 2024, sport: 'pokemon', parallels: POKEMON_SV_PARALLELS },
  { brand: 'pokemon', set: 'stellar-crown', year: 2024, sport: 'pokemon', parallels: POKEMON_SV_PARALLELS },
  { brand: 'pokemon', set: 'surging-sparks', year: 2024, sport: 'pokemon', parallels: POKEMON_SV_PARALLELS },
  { brand: 'pokemon', set: 'prismatic-evolutions', year: 2025, sport: 'pokemon', parallels: POKEMON_SV_PARALLELS },
  { brand: 'pokemon', set: 'journey-together', year: 2025, sport: 'pokemon', parallels: POKEMON_SV_PARALLELS },
  
  // ============ MARVEL TRADING CARDS (1990-2025) ============
  
  // Classic Era - Impel/Fleer (1990-1999)
  { brand: 'impel', set: 'marvel-universe', year: 1990, sport: 'marvel', parallels: MARVEL_CLASSIC_PARALLELS },
  { brand: 'impel', set: 'marvel-universe', year: 1991, sport: 'marvel', parallels: MARVEL_CLASSIC_PARALLELS },
  { brand: 'skybox', set: 'marvel-universe', year: 1992, sport: 'marvel', parallels: MARVEL_CLASSIC_PARALLELS },
  { brand: 'skybox', set: 'marvel-universe', year: 1993, sport: 'marvel', parallels: MARVEL_CLASSIC_PARALLELS },
  { brand: 'skybox', set: 'marvel-universe', year: 1994, sport: 'marvel', parallels: MARVEL_CLASSIC_PARALLELS },
  
  // Marvel Masterpieces (1992-2024)
  { brand: 'skybox', set: 'marvel-masterpieces', year: 1992, sport: 'marvel', parallels: MARVEL_MASTERPIECES_PARALLELS },
  { brand: 'skybox', set: 'marvel-masterpieces', year: 1993, sport: 'marvel', parallels: MARVEL_MASTERPIECES_PARALLELS },
  { brand: 'fleer', set: 'marvel-masterpieces', year: 1994, sport: 'marvel', parallels: MARVEL_MASTERPIECES_PARALLELS },
  { brand: 'fleer', set: 'marvel-masterpieces', year: 1995, sport: 'marvel', parallels: MARVEL_MASTERPIECES_PARALLELS },
  { brand: 'fleer', set: 'marvel-masterpieces', year: 1996, sport: 'marvel', parallels: MARVEL_MASTERPIECES_PARALLELS },
  { brand: 'upper-deck', set: 'marvel-masterpieces', year: 2007, sport: 'marvel', parallels: MARVEL_MASTERPIECES_PARALLELS },
  { brand: 'upper-deck', set: 'marvel-masterpieces', year: 2008, sport: 'marvel', parallels: MARVEL_MASTERPIECES_PARALLELS },
  { brand: 'upper-deck', set: 'marvel-masterpieces', year: 2016, sport: 'marvel', parallels: MARVEL_MASTERPIECES_PARALLELS },
  { brand: 'upper-deck', set: 'marvel-masterpieces', year: 2020, sport: 'marvel', parallels: MARVEL_MASTERPIECES_PARALLELS },
  { brand: 'upper-deck', set: 'marvel-masterpieces', year: 2022, sport: 'marvel', parallels: MARVEL_MASTERPIECES_PARALLELS },
  { brand: 'upper-deck', set: 'marvel-masterpieces', year: 2024, sport: 'marvel', parallels: MARVEL_MASTERPIECES_PARALLELS },
  
  // Marvel Fleer Ultra (1994-2025)
  { brand: 'fleer', set: 'marvel-ultra', year: 1994, sport: 'marvel', parallels: MARVEL_FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'marvel-ultra', year: 1995, sport: 'marvel', parallels: MARVEL_FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'marvel-ultra-x-men', year: 1995, sport: 'marvel', parallels: MARVEL_FLEER_ULTRA_PARALLELS },
  { brand: 'fleer', set: 'marvel-ultra-spider-man', year: 1995, sport: 'marvel', parallels: MARVEL_FLEER_ULTRA_PARALLELS },
  { brand: 'upper-deck', set: 'fleer-ultra-avengers', year: 2022, sport: 'marvel', parallels: MARVEL_FLEER_ULTRA_PARALLELS },
  { brand: 'upper-deck', set: 'fleer-ultra-wolverine', year: 2023, sport: 'marvel', parallels: MARVEL_FLEER_ULTRA_PARALLELS },
  { brand: 'upper-deck', set: 'fleer-ultra-midnight-sons', year: 2023, sport: 'marvel', parallels: MARVEL_FLEER_ULTRA_PARALLELS },
  { brand: 'upper-deck', set: 'fleer-ultra-matriarchs', year: 2024, sport: 'marvel', parallels: MARVEL_FLEER_ULTRA_PARALLELS },
  
  // Marvel Upper Deck Modern (2020-2025)
  { brand: 'upper-deck', set: 'marvel-ages', year: 2020, sport: 'marvel', parallels: MARVEL_UPPER_DECK_PARALLELS },
  { brand: 'upper-deck', set: 'marvel-annual', year: 2021, sport: 'marvel', parallels: MARVEL_UPPER_DECK_PARALLELS },
  { brand: 'upper-deck', set: 'marvel-annual', year: 2022, sport: 'marvel', parallels: MARVEL_UPPER_DECK_PARALLELS },
  { brand: 'upper-deck', set: 'marvel-annual', year: 2023, sport: 'marvel', parallels: MARVEL_UPPER_DECK_PARALLELS },
  { brand: 'upper-deck', set: 'marvel-annual', year: 2024, sport: 'marvel', parallels: MARVEL_UPPER_DECK_PARALLELS },
  { brand: 'upper-deck', set: 'marvel-allure', year: 2022, sport: 'marvel', parallels: MARVEL_UPPER_DECK_PARALLELS },
  { brand: 'upper-deck', set: 'marvel-metal-universe', year: 2022, sport: 'marvel', parallels: MARVEL_FLEER_ULTRA_PARALLELS },
  { brand: 'upper-deck', set: 'marvel-metal-universe', year: 2024, sport: 'marvel', parallels: MARVEL_FLEER_ULTRA_PARALLELS },
  { brand: 'upper-deck', set: 'marvel-flair', year: 2023, sport: 'marvel', parallels: MARVEL_UPPER_DECK_PARALLELS },
  { brand: 'upper-deck', set: 'marvel-flair', year: 2024, sport: 'marvel', parallels: MARVEL_UPPER_DECK_PARALLELS },
  { brand: 'upper-deck', set: 'marvel-allegiance-avengers-xmen', year: 2023, sport: 'marvel', parallels: MARVEL_UPPER_DECK_PARALLELS },
  { brand: 'upper-deck', set: 'marvel-allegiance-infinity', year: 2023, sport: 'marvel', parallels: MARVEL_UPPER_DECK_PARALLELS },
  { brand: 'upper-deck', set: 'marvel-allegiance-secret-wars', year: 2024, sport: 'marvel', parallels: MARVEL_UPPER_DECK_PARALLELS },
  { brand: 'upper-deck', set: 'marvel-beginnings', year: 2024, sport: 'marvel', parallels: MARVEL_UPPER_DECK_PARALLELS },
  
  // Marvel Topps Chrome (2024-2025)
  { brand: 'topps', set: 'marvel-chrome', year: 2024, sport: 'marvel', parallels: MARVEL_TOPPS_CHROME_PARALLELS },
  { brand: 'topps', set: 'marvel-chrome', year: 2025, sport: 'marvel', parallels: MARVEL_TOPPS_CHROME_PARALLELS },
  { brand: 'topps', set: 'marvel-studios-chrome', year: 2024, sport: 'marvel', parallels: MARVEL_TOPPS_CHROME_PARALLELS },
  { brand: 'topps', set: 'marvel-studios-chrome', year: 2025, sport: 'marvel', parallels: MARVEL_TOPPS_CHROME_PARALLELS },
  { brand: 'topps', set: 'marvel-comics-chrome', year: 2025, sport: 'marvel', parallels: MARVEL_TOPPS_CHROME_PARALLELS },
  
  // Marvel Topps Chrome Sapphire (2025)
  { brand: 'topps', set: 'marvel-chrome-sapphire', year: 2025, sport: 'marvel', parallels: MARVEL_TOPPS_SAPPHIRE_PARALLELS },
  { brand: 'topps', set: 'marvel-studios-sapphire', year: 2025, sport: 'marvel', parallels: MARVEL_TOPPS_SAPPHIRE_PARALLELS },
  
  // Marvel Topps Special Releases (2025)
  { brand: 'topps', set: 'marvel-mint', year: 2025, sport: 'marvel', parallels: MARVEL_TOPPS_CHROME_PARALLELS },
  { brand: 'topps', set: 'marvel-finest-xmen-97', year: 2025, sport: 'marvel', parallels: MARVEL_TOPPS_CHROME_PARALLELS },
  { brand: 'topps', set: 'marvel-the-collector', year: 2025, sport: 'marvel', parallels: MARVEL_TOPPS_CHROME_PARALLELS },
  { brand: 'topps', set: 'marvel-golden-anniversary', year: 2025, sport: 'marvel', parallels: MARVEL_TOPPS_CHROME_PARALLELS },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Look up parallels for a specific card set.
 * Returns default parallels if set is not found.
 */
export function getParallelsForCard(params: {
  brand?: string;
  set?: string;
  year?: number;
  sport?: string;
}): CardParallel[] {
  const { brand, set, year, sport } = params;
  
  // Normalize inputs for matching
  const normBrand = brand?.toLowerCase().trim().replace(/\s+/g, '-');
  const normSet = set?.toLowerCase().trim().replace(/\s+/g, '-');
  const normSport = sport?.toLowerCase().trim();
  
  // Find matching card set
  const cardSet = CARD_SETS.find(cs => {
    // Brand matching - handle various formats
    let brandMatch = !normBrand || cs.brand === normBrand;
    if (!brandMatch && normBrand) {
      // Try partial matches
      brandMatch = normBrand.includes(cs.brand) || cs.brand.includes(normBrand) ||
        (normBrand === 'panini-prizm' && cs.brand === 'panini' && cs.set === 'prizm') ||
        (normBrand === 'topps-chrome' && cs.brand === 'topps' && cs.set === 'chrome') ||
        (normBrand === 'upper-deck' && cs.brand === 'upper-deck') ||
        (normBrand === 'upperdeck' && cs.brand === 'upper-deck');
    }
    
    // Set matching
    let setMatch = !normSet || cs.set === normSet;
    if (!setMatch && normSet) {
      setMatch = normSet.includes(cs.set) || cs.set.includes(normSet) ||
        (normSet === 'national-treasures' && cs.set === 'national-treasures') ||
        (normSet === 'nationaltreasures' && cs.set === 'national-treasures') ||
        (normSet === 'bowman-chrome' && cs.set === 'bowman-chrome') ||
        (normSet === 'bowmanchrome' && cs.set === 'bowman-chrome') ||
        (normSet === 'sp-authentic' && cs.set === 'sp-authentic') ||
        (normSet === 'spauthentic' && cs.set === 'sp-authentic') ||
        (normSet === 'stadium-club' && cs.set === 'stadium-club') ||
        (normSet === 'stadiumclub' && cs.set === 'stadium-club') ||
        (normSet === 'topps-now' && cs.set === 'topps-now') ||
        (normSet === 'toppsnow' && cs.set === 'topps-now') ||
        (normSet === 'the-cup' && cs.set === 'the-cup') ||
        (normSet === 'thecup' && cs.set === 'the-cup');
    }
    
    // Year matching
    const yearMatch = !year || cs.year === year;
    
    // Sport matching
    let sportMatch = !normSport || cs.sport === normSport || cs.sport === 'multi';
    
    return brandMatch && setMatch && yearMatch && sportMatch;
  });
  
  return cardSet?.parallels || DEFAULT_PARALLELS;
}

/**
 * Parse card title to extract brand, year, set, parallel, and player name.
 */
export function parseCardTitle(title: string): {
  brand?: string;
  set?: string;
  year?: number;
  parallel?: string;
  playerName?: string;
} {
  const result: { brand?: string; set?: string; year?: number; parallel?: string; playerName?: string } = {};
  const titleLower = title.toLowerCase();
  
  // Extract year
  const yearMatch = title.match(/\b(19\d{2}|20[0-2]\d)\b/);
  if (yearMatch) {
    result.year = parseInt(yearMatch[1]);
  }
  
  // Extract brand (ordered by specificity)
  if (titleLower.includes('panini')) result.brand = 'panini';
  else if (titleLower.includes('topps')) result.brand = 'topps';
  else if (titleLower.includes('upper deck') || titleLower.includes('upperdeck') || titleLower.includes('ud ')) result.brand = 'upper-deck';
  else if (titleLower.includes('leaf')) result.brand = 'leaf';
  else if (titleLower.includes('fanatics')) result.brand = 'fanatics';
  // Legacy brands (1995-2005)
  else if (titleLower.includes('fleer') || titleLower.includes('skybox')) result.brand = 'fleer';
  else if (titleLower.includes('pacific')) result.brand = 'pacific';
  else if (titleLower.includes('pinnacle')) result.brand = 'pinnacle';
  else if (titleLower.includes('donruss')) result.brand = 'donruss';
  else if (titleLower.includes('score')) result.brand = 'score';
  else if (titleLower.includes('playoff')) result.brand = 'playoff';
  else if (titleLower.includes('select certified')) result.brand = 'select';
  // Pokemon & Marvel brands
  else if (titleLower.includes('pokemon') || titleLower.includes('pokémon') || titleLower.includes('tcg')) result.brand = 'pokemon';
  else if (titleLower.includes('marvel') || titleLower.includes('impel') || titleLower.includes('mcu')) result.brand = 'topps';
  // Vintage brands
  else if (titleLower.includes('bowman') && !titleLower.includes('chrome')) result.brand = 'bowman';
  else if (titleLower.includes('hoops') || titleLower.includes('nba hoops')) result.brand = 'hoops';
  else if (titleLower.includes('skybox')) result.brand = 'skybox';
  else if (titleLower.includes('pro set') || titleLower.includes('pro-set')) result.brand = 'pro-set';
  
  // Extract set (ordered by specificity - longer matches first)
  // Multi-word sets must come before single-word versions
  if (titleLower.includes('select certified')) { result.set = 'certified'; result.brand = result.brand || 'select'; }
  else if (titleLower.includes('totally certified')) { result.set = 'totally-certified'; result.brand = result.brand || 'pinnacle'; }
  else if (titleLower.includes('pinnacle certified')) { result.set = 'certified'; result.brand = 'pinnacle'; }
  else if (titleLower.includes('bowman chrome')) result.set = 'bowman-chrome';
  else if (titleLower.includes('bowman draft')) result.set = 'bowman-draft';
  else if (titleLower.includes('bowmans best') || titleLower.includes("bowman's best")) result.set = 'bowmans-best';
  else if (titleLower.includes('stadium club')) result.set = 'stadium-club';
  else if (titleLower.includes('national treasures')) result.set = 'national-treasures';
  else if (titleLower.includes('sp authentic')) result.set = 'sp-authentic';
  else if (titleLower.includes('topps now')) result.set = 'topps-now';
  else if (titleLower.includes('metal universe')) result.set = 'metal-universe';
  else if (titleLower.includes('black diamond')) result.set = 'black-diamond';
  else if (titleLower.includes('ultimate collection')) result.set = 'ultimate-collection';
  else if (titleLower.includes('young guns')) result.set = 'young-guns';
  else if (titleLower.includes('the cup')) result.set = 'the-cup';
  // Single word sets
  else if (titleLower.includes('prizm')) result.set = 'prizm';
  else if (titleLower.includes('mosaic')) result.set = 'mosaic';
  else if (titleLower.includes('select') && !titleLower.includes('certified')) result.set = 'select';
  else if (titleLower.includes('optic')) result.set = 'optic';
  else if (titleLower.includes('flawless')) result.set = 'flawless';
  else if (titleLower.includes('immaculate')) result.set = 'immaculate';
  else if (titleLower.includes('contenders')) result.set = 'contenders';
  else if (titleLower.includes('spectra')) result.set = 'spectra';
  else if (titleLower.includes('obsidian')) result.set = 'obsidian';
  else if (titleLower.includes('chrome')) result.set = 'chrome';
  else if (titleLower.includes('archives')) result.set = 'archives';
  else if (titleLower.includes('exquisite')) result.set = 'exquisite';
  else if (titleLower.includes('metal')) result.set = 'metal';
  else if (titleLower.includes('trinity')) result.set = 'trinity';
  else if (titleLower.includes('finest')) result.set = 'finest';
  else if (titleLower.includes('spx')) result.set = 'spx';
  // Legacy sets
  else if (titleLower.includes('ultra')) result.set = 'ultra';
  else if (titleLower.includes('flair')) result.set = 'flair';
  else if (titleLower.includes('revolution')) result.set = 'revolution';
  else if (titleLower.includes('aurora')) result.set = 'aurora';
  else if (titleLower.includes('certified')) result.set = 'certified';
  else if (titleLower.includes('elite')) result.set = 'elite';
  
  // Bowman Chrome Sapphire / Topps Chrome Sapphire (Subsets)
  else if (titleLower.includes('bowman chrome sapphire')) result.set = 'bowman-chrome-sapphire';
  else if (titleLower.includes('chrome sapphire') || titleLower.includes('sapphire edition')) result.set = 'chrome-sapphire';
  
  // Pokemon TCG sets
  else if (titleLower.includes('base set') && (titleLower.includes('pokemon') || titleLower.includes('pokémon'))) result.set = 'base-set';
  else if (titleLower.includes('jungle')) result.set = 'jungle';
  else if (titleLower.includes('fossil') && !titleLower.includes('football')) result.set = 'fossil';
  else if (titleLower.includes('team rocket')) result.set = 'team-rocket';
  else if (titleLower.includes('neo genesis')) result.set = 'neo-genesis';
  else if (titleLower.includes('neo destiny')) result.set = 'neo-destiny';
  else if (titleLower.includes('legendary collection')) result.set = 'legendary-collection';
  else if (titleLower.includes('skyridge')) result.set = 'skyridge';
  else if (titleLower.includes('aquapolis')) result.set = 'aquapolis';
  else if (titleLower.includes('expedition')) result.set = 'expedition';
  else if (titleLower.includes('ex ruby') || titleLower.includes('ruby sapphire')) result.set = 'ex-ruby-sapphire';
  else if (titleLower.includes('ex delta species') || titleLower.includes('delta species')) result.set = 'ex-delta-species';
  else if (titleLower.includes('diamond pearl') || titleLower.includes('diamond & pearl')) result.set = 'diamond-pearl';
  else if (titleLower.includes('black white') || titleLower.includes('black & white')) result.set = 'black-white';
  else if (titleLower.includes('xy ') || titleLower.includes(' xy ')) result.set = 'xy';
  else if (titleLower.includes('sun moon') || titleLower.includes('sun & moon')) result.set = 'sun-moon';
  else if (titleLower.includes('hidden fates')) result.set = 'hidden-fates';
  else if (titleLower.includes('shining fates')) result.set = 'shining-fates';
  else if (titleLower.includes('sword shield') || titleLower.includes('sword & shield')) result.set = 'sword-shield';
  else if (titleLower.includes('evolving skies')) result.set = 'evolving-skies';
  else if (titleLower.includes('brilliant stars')) result.set = 'brilliant-stars';
  else if (titleLower.includes('crown zenith')) result.set = 'crown-zenith';
  else if (titleLower.includes('scarlet violet') || titleLower.includes('scarlet & violet')) result.set = 'scarlet-violet';
  else if (titleLower.includes('paldea evolved')) result.set = 'paldea-evolved';
  else if (titleLower.includes('obsidian flames')) result.set = 'obsidian-flames';
  else if (titleLower.includes('151')) result.set = '151';
  else if (titleLower.includes('prismatic evolutions')) result.set = 'prismatic-evolutions';
  else if (titleLower.includes('paldean fates')) result.set = 'paldean-fates';
  
  // Marvel sets
  else if (titleLower.includes('marvel universe')) result.set = 'marvel-universe';
  else if (titleLower.includes('marvel masterpieces') || titleLower.includes('masterpieces')) result.set = 'marvel-masterpieces';
  else if (titleLower.includes('marvel chrome') || titleLower.includes('mcu chrome')) result.set = 'marvel-chrome';
  else if (titleLower.includes('marvel studios chrome')) result.set = 'marvel-studios-chrome';
  else if (titleLower.includes('marvel sapphire')) result.set = 'marvel-chrome-sapphire';
  else if (titleLower.includes('fleer ultra') && titleLower.includes('marvel')) result.set = 'fleer-ultra-avengers';
  else if (titleLower.includes('marvel flair')) result.set = 'marvel-flair';
  else if (titleLower.includes('marvel annual')) result.set = 'marvel-annual';
  else if (titleLower.includes('marvel metal')) result.set = 'marvel-metal-universe';
  else if (titleLower.includes('marvel mint')) result.set = 'marvel-mint';
  else if (titleLower.includes('x-men 97') || titleLower.includes("x-men '97")) result.set = 'marvel-finest-xmen-97';
  
  // Extract parallel (common patterns)
  const parallelPatterns = [
    // Prizm/refractors
    { pattern: /silver\s*prizm/i, id: 'silver' },
    { pattern: /gold\s*shimmer/i, id: 'gold-shimmer' },
    { pattern: /gold\s*wave/i, id: 'gold-wave' },
    { pattern: /gold\s*refractor/i, id: 'gold' },
    { pattern: /gold\s*vinyl/i, id: 'gold-vinyl' },
    { pattern: /\bgold\b/i, id: 'gold' },
    { pattern: /superfractor/i, id: 'superfractor' },
    { pattern: /black\s*shimmer/i, id: 'black-shimmer' },
    { pattern: /\bblack\b/i, id: 'black' },
    { pattern: /red\s*shimmer/i, id: 'red-shimmer' },
    { pattern: /red\s*wave/i, id: 'red-wave' },
    { pattern: /\bred\b/i, id: 'red' },
    { pattern: /blue\s*shimmer/i, id: 'blue-shimmer' },
    { pattern: /blue\s*wave/i, id: 'blue-wave' },
    { pattern: /blue\s*ice/i, id: 'blue-ice' },
    { pattern: /\bblue\b/i, id: 'blue' },
    { pattern: /green\s*shimmer/i, id: 'green-shimmer' },
    { pattern: /green\s*wave/i, id: 'green-wave' },
    { pattern: /\bgreen\b/i, id: 'green' },
    { pattern: /purple\s*wave/i, id: 'purple-wave' },
    { pattern: /purple\s*ice/i, id: 'purple-ice' },
    { pattern: /\bpurple\b/i, id: 'purple' },
    { pattern: /orange\s*wave/i, id: 'orange-wave' },
    { pattern: /\borange\b/i, id: 'orange' },
    { pattern: /\bpink\b/i, id: 'pink' },
    { pattern: /\bmojo\b/i, id: 'mojo' },
    { pattern: /\bdisco\b/i, id: 'disco' },
    { pattern: /\bhyper\b/i, id: 'hyper' },
    { pattern: /\blazer\b/i, id: 'lazer' },
    { pattern: /red\s*white\s*(?:&|and)?\s*blue/i, id: 'red-white-blue' },
    { pattern: /snakeskin/i, id: 'snakeskin' },
    { pattern: /camo/i, id: 'camo' },
    { pattern: /tie[\s-]dye/i, id: 'tie-dye' },
    // Flawless specific
    { pattern: /\bruby\b/i, id: 'ruby' },
    { pattern: /\bsapphire\b/i, id: 'sapphire' },
    { pattern: /\bemerald\b/i, id: 'emerald' },
    { pattern: /\bplatinum\b/i, id: 'platinum' },
    // National Treasures
    { pattern: /\bbronze\b/i, id: 'bronze' },
    { pattern: /rpa|rookie\s*patch\s*auto/i, id: 'rpa' },
    // Topps Chrome / Finest
    { pattern: /refractor/i, id: 'refractor' },
    { pattern: /x[\s-]*fractor/i, id: 'x-fractor' },
    { pattern: /prism/i, id: 'prism-refractor' },
    { pattern: /negative/i, id: 'negative-refractor' },
    { pattern: /atomic/i, id: 'atomic-refractor' },
    { pattern: /sepia/i, id: 'sepia-refractor' },
    { pattern: /embossed/i, id: 'embossed-refractor' },
    // Legacy parallels (1995-2005)
    { pattern: /precious\s*metal\s*gems?\s*green|pmg\s*green/i, id: 'pmg-green' },
    { pattern: /precious\s*metal\s*gems?\s*red|pmg\s*red/i, id: 'pmg-red' },
    { pattern: /precious\s*metal\s*gems?|pmg/i, id: 'pmg-red' },
    { pattern: /mirror\s*gold/i, id: 'mirror-gold' },
    { pattern: /mirror\s*red/i, id: 'mirror-red' },
    { pattern: /mirror\s*blue/i, id: 'mirror-blue' },
    { pattern: /mirror\s*black/i, id: 'mirror-black' },
    { pattern: /gold\s*medallion/i, id: 'gold-medallion' },
    { pattern: /platinum\s*medallion/i, id: 'platinum-medallion' },
    { pattern: /grand\s*finale/i, id: 'grand-finale' },
    { pattern: /holoview/i, id: 'holoview' },
    { pattern: /spectrum/i, id: 'spectrum' },
    { pattern: /radiance/i, id: 'radiance' },
    { pattern: /premiere\s*date/i, id: 'premiere-date' },
    { pattern: /opening\s*day/i, id: 'opening-day' },
    { pattern: /shadow\s*series/i, id: 'shadow' },
    { pattern: /press\s*proof/i, id: 'press-proof' },
    { pattern: /row\s*0/i, id: 'row-0' },
    { pattern: /row\s*1/i, id: 'row-1' },
    { pattern: /row\s*2/i, id: 'row-2' },
    { pattern: /double\s*diamond/i, id: 'double-diamond' },
    { pattern: /triple\s*diamond/i, id: 'triple-diamond' },
    { pattern: /quad\s*diamond/i, id: 'quad-diamond' },
    { pattern: /exclusives/i, id: 'exclusives' },
    { pattern: /high\s*gloss/i, id: 'high-gloss' },
    { pattern: /canvas/i, id: 'canvas' },
    { pattern: /titanium/i, id: 'titanium' },
    // Pokemon TCG parallels
    { pattern: /1st\s*edition|first\s*edition/i, id: 'first-edition' },
    { pattern: /shadowless/i, id: 'shadowless' },
    { pattern: /reverse\s*holo/i, id: 'reverse-holo' },
    { pattern: /holo\s*rare/i, id: 'holo' },
    { pattern: /\bholo\b/i, id: 'holo' },
    { pattern: /gold\s*star/i, id: 'gold-star' },
    { pattern: /rainbow\s*rare/i, id: 'rainbow-rare' },
    { pattern: /special\s*art\s*rare|sar\b/i, id: 'special-art-rare' },
    { pattern: /illustration\s*rare|sir\b/i, id: 'special-illustration' },
    { pattern: /hyper\s*rare/i, id: 'hyper-rare' },
    { pattern: /shiny\s*vault/i, id: 'shiny-vault' },
    { pattern: /full\s*art/i, id: 'full-art' },
    { pattern: /alt(?:ernate)?\s*art/i, id: 'alt-art' },
    { pattern: /trainer\s*gallery/i, id: 'trainer-gallery' },
    { pattern: /radiant/i, id: 'radiant' },
    { pattern: /vmax/i, id: 'vmax' },
    { pattern: /vstar/i, id: 'vstar' },
    { pattern: /\bv\b.*pokemon|pokemon.*\bv\b/i, id: 'v' },
    { pattern: /\bgx\b/i, id: 'gx' },
    { pattern: /\bex\b/i, id: 'ex' },
    { pattern: /tag\s*team/i, id: 'tag-team-gx' },
    { pattern: /master\s*ball\s*holo/i, id: 'masterball-holo' },
    { pattern: /poke\s*ball\s*holo/i, id: 'pokeball-holo' },
    // Marvel parallels
    { pattern: /spider[\s-]*web\s*refractor/i, id: 'spider-web' },
    { pattern: /iron\s*man\s*lazer/i, id: 'iron-man-lazer' },
    { pattern: /hulk\s*lazer|green\s*lazer/i, id: 'hulk-lazer' },
    { pattern: /clawed\s*chrome/i, id: 'clawed-chrome' },
    { pattern: /raywave/i, id: 'raywave' },
    { pattern: /padparadscha/i, id: 'padparadscha' },
    { pattern: /high\s*noon\s*flair/i, id: 'high-noon-flair' },
    { pattern: /twilight\s*flair/i, id: 'twilight-flair' },
    { pattern: /midnight\s*flair/i, id: 'midnight-flair' },
    { pattern: /sketch\s*card/i, id: 'sketch' },
    { pattern: /relic|memorabilia/i, id: 'relic' },
    // Vintage parallels (pre-1993)
    { pattern: /tiffany/i, id: 'tiffany' },
    { pattern: /traded\s*tiffany/i, id: 'traded-tiffany' },
    { pattern: /high[\s-]*number|high[\s-]*series/i, id: 'high-number' },
    { pattern: /traded|update|rookies\s*traded/i, id: 'traded' },
    { pattern: /diamond\s*kings?/i, id: 'diamond-kings' },
    { pattern: /rated\s*rookie/i, id: 'rated-rookie' },
    { pattern: /members?\s*only/i, id: 'members-only' },
    { pattern: /first\s*day\s*issue/i, id: 'first-day-issue' },
    { pattern: /all[\s-]*star/i, id: 'all-star' },
    { pattern: /prototype/i, id: 'prototype' },
    { pattern: /error\s*card/i, id: 'error' },
    // Auto/Patch
    { pattern: /patch\s*auto/i, id: 'patch-auto' },
    { pattern: /auto\s*patch/i, id: 'patch-auto' },
    { pattern: /autograph/i, id: 'auto' },
    { pattern: /\bauto\b/i, id: 'auto' },
    { pattern: /\bpatch\b/i, id: 'patch' },
  ];
  
  for (const { pattern, id } of parallelPatterns) {
    if (pattern.test(titleLower)) {
      result.parallel = id;
      break;
    }
  }
  
  return result;
}

/**
 * Get parallel from serial number (e.g., /10 = Gold, /1 = Black)
 */
export function getParallelFromSerial(serialNumber?: string, isAutograph?: boolean): string | null {
  if (!serialNumber) return null;
  
  // Parse denominator from serial (e.g., "7/10" -> 10)
  const match = serialNumber.match(/\/(\d+)/);
  if (!match) return null;
  
  const denominator = parseInt(match[1]);
  
  // Map denominator to parallel - prioritize auto variants if isAutograph
  if (isAutograph) {
    if (denominator === 1) return 'auto-black';
    if (denominator <= 5) return 'auto-gold';
    if (denominator <= 10) return 'auto-gold';
    if (denominator <= 25) return 'auto-orange';
    if (denominator <= 49) return 'auto-green';
    if (denominator <= 99) return 'auto-blue';
    return 'auto';
  }
  
  // Standard parallels based on denominator
  if (denominator === 1) return 'black';
  if (denominator <= 5) return 'green-shimmer';
  if (denominator <= 10) return 'gold';
  if (denominator <= 15) return 'ruby';
  if (denominator <= 20) return 'sapphire';
  if (denominator <= 25) return 'orange';
  if (denominator <= 35) return 'red-shimmer';
  if (denominator <= 49) return 'purple';
  if (denominator <= 75) return 'green';
  if (denominator <= 99) return 'blue';
  if (denominator <= 149) return 'red';
  if (denominator <= 199) return 'blue';
  if (denominator <= 299) return 'red';
  
  return null;
}

/**
 * Filter parallels based on detected type and serial number
 */
export function filterParallelsByType(
  parallels: CardParallel[],
  detectedParallel?: string,
  serialNumber?: string,
  isAutograph?: boolean
): CardParallel[] {
  // If autograph, filter to show auto variants
  if (isAutograph) {
    const autoParallels = parallels.filter(p => 
      p.id.includes('auto') || p.id.includes('rpa') || p.id === 'base'
    );
    if (autoParallels.length > 1) return autoParallels;
  }
  
  // If we have a serial number, show parallels with matching or similar numbering
  if (serialNumber) {
    const match = serialNumber.match(/\/(\d+)/);
    if (match) {
      const denom = parseInt(match[1]);
      // Show parallels within a reasonable range of the detected numbering
      const filteredByNumber = parallels.filter(p => {
        if (!p.numbered) return p.id === 'base'; // Always include base
        const pMatch = p.numbered.match(/\/(\d+)/);
        if (!pMatch) return false;
        const pDenom = parseInt(pMatch[1]);
        // Allow matches within ±50% of the detected numbering, or exact match
        return pDenom === denom || (pDenom >= denom * 0.5 && pDenom <= denom * 1.5);
      });
      if (filteredByNumber.length > 1) return filteredByNumber;
    }
  }
  
  // Return all parallels if no filtering criteria matched
  return parallels;
}

/**
 * Check if a category is a sports card category
 */
export function isSportsCardCategory(category: string): boolean {
  return category.toLowerCase() === 'sports cards';
}

/**
 * Check if a category is any card category (sports or TCG)
 */
export function isAnyCardCategory(category: string): boolean {
  const cardCategories = ['sports cards', 'tcg cards'];
  return cardCategories.includes(category.toLowerCase());
}
