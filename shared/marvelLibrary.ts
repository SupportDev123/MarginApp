// Internal Marvel Recognition Library - Characters, Series, and Collectible Types
// This is the reference data for Marvel collectible recognition at scan time

export const marvelCharacters = [
  { id: 'spider_man', name: 'Spider-Man' },
  { id: 'iron_man', name: 'Iron Man' },
  { id: 'captain_america', name: 'Captain America' },
  { id: 'thor', name: 'Thor' },
  { id: 'hulk', name: 'Hulk' },
  { id: 'black_panther', name: 'Black Panther' },
  { id: 'wolverine', name: 'Wolverine' },
  { id: 'deadpool', name: 'Deadpool' },
  { id: 'doctor_strange', name: 'Doctor Strange' },
  { id: 'scarlet_witch', name: 'Scarlet Witch' },
  { id: 'black_widow', name: 'Black Widow' },
  { id: 'captain_marvel', name: 'Captain Marvel' },
  { id: 'ant_man', name: 'Ant-Man' },
  { id: 'vision', name: 'Vision' },
  { id: 'hawkeye', name: 'Hawkeye' },
  { id: 'venom', name: 'Venom' },
  { id: 'thanos', name: 'Thanos' },
  { id: 'loki', name: 'Loki' },
  { id: 'groot', name: 'Groot' },
  { id: 'rocket_raccoon', name: 'Rocket Raccoon' },
  { id: 'star_lord', name: 'Star-Lord' },
  { id: 'gamora', name: 'Gamora' },
  { id: 'drax', name: 'Drax' },
  { id: 'nebula', name: 'Nebula' },
  { id: 'miles_morales', name: 'Miles Morales' },
  { id: 'ghost_rider', name: 'Ghost Rider' },
  { id: 'punisher', name: 'Punisher' },
  { id: 'daredevil', name: 'Daredevil' },
  { id: 'moon_knight', name: 'Moon Knight' },
  { id: 'shang_chi', name: 'Shang-Chi' },
] as const;

export type MarvelCharacterId = typeof marvelCharacters[number]['id'];

// Comic series / storylines
export const marvelSeries = [
  { id: 'amazing_spider_man', name: 'Amazing Spider-Man' },
  { id: 'uncanny_xmen', name: 'Uncanny X-Men' },
  { id: 'avengers', name: 'Avengers' },
  { id: 'fantastic_four', name: 'Fantastic Four' },
  { id: 'secret_wars', name: 'Secret Wars' },
  { id: 'infinity_gauntlet', name: 'Infinity Gauntlet' },
  { id: 'civil_war', name: 'Civil War' },
  { id: 'house_of_m', name: 'House of M' },
  { id: 'age_of_ultron', name: 'Age of Ultron' },
  { id: 'endgame', name: 'Endgame' },
  { id: 'ultimate_spider_man', name: 'Ultimate Spider-Man' },
  { id: 'new_mutants', name: 'New Mutants' },
  { id: 'guardians_galaxy', name: 'Guardians of the Galaxy' },
  { id: 'daredevil', name: 'Daredevil' },
  { id: 'moon_knight', name: 'Moon Knight' },
  { id: 'wolverine', name: 'Wolverine' },
  { id: 'x_force', name: 'X-Force' },
  { id: 'black_panther', name: 'Black Panther' },
  { id: 'thor', name: 'Thor' },
  { id: 'captain_america', name: 'Captain America' },
] as const;

export type MarvelSeriesId = typeof marvelSeries[number]['id'];

// Collectible types for Marvel items
export const marvelCollectibleTypes = [
  { id: 'comic', name: 'Comic Book' },
  { id: 'action_figure', name: 'Action Figure' },
  { id: 'funko_pop', name: 'Funko Pop!' },
  { id: 'hot_toys', name: 'Hot Toys' },
  { id: 'statue', name: 'Statue / Bust' },
  { id: 'trading_card', name: 'Trading Card' },
  { id: 'poster', name: 'Poster / Art Print' },
  { id: 'prop_replica', name: 'Prop Replica' },
  { id: 'clothing', name: 'Clothing / Apparel' },
  { id: 'toy', name: 'Toy / Playset' },
  { id: 'lego', name: 'LEGO Set' },
  { id: 'video_game', name: 'Video Game' },
] as const;

export type MarvelCollectibleType = typeof marvelCollectibleTypes[number]['id'];

// Comic grading companies
export const comicGraders = [
  { id: 'cgc', name: 'CGC' },
  { id: 'cbcs', name: 'CBCS' },
  { id: 'pgx', name: 'PGX' },
  { id: 'raw', name: 'Raw (Ungraded)' },
] as const;

// Key issue markers
export const keyIssueTypes = [
  { id: 'first_appearance', name: 'First Appearance' },
  { id: 'death', name: 'Death Issue' },
  { id: 'origin', name: 'Origin Story' },
  { id: 'first_cover', name: 'First Cover' },
  { id: 'variant', name: 'Variant Cover' },
  { id: 'signed', name: 'Signed / Autographed' },
  { id: 'newsstand', name: 'Newsstand Edition' },
  { id: 'direct', name: 'Direct Edition' },
  { id: 'limited', name: 'Limited Edition' },
  { id: 'anniversary', name: 'Anniversary Issue' },
] as const;

// Text-based similarity matching for Marvel collectibles
export function matchMarvelToLibrary(detectedText: string): {
  character: string | null;
  series: string | null;
  collectibleType: string | null;
  matchConfidence: number;
  topMatches: { character: string; series: string; score: number }[];
} {
  const text = detectedText.toLowerCase();
  const matches: { character: string; series: string; score: number }[] = [];
  
  // Check characters
  for (const character of marvelCharacters) {
    const charName = character.name.toLowerCase();
    const charId = character.id.replace('_', ' ');
    
    let charScore = 0;
    if (text.includes(charName)) {
      charScore = 50;
    } else if (text.includes(charId)) {
      charScore = 40;
    }
    
    if (charScore > 0) {
      // Check for associated series
      for (const series of marvelSeries) {
        const seriesName = series.name.toLowerCase();
        const seriesId = series.id.replace('_', ' ');
        
        let seriesScore = 0;
        if (text.includes(seriesName)) {
          seriesScore = 50;
        } else if (text.includes(seriesId)) {
          seriesScore = 40;
        }
        
        if (seriesScore > 0) {
          matches.push({
            character: character.name,
            series: series.name,
            score: charScore + seriesScore,
          });
        }
      }
      
      // If character found but no series, still add with lower score
      if (matches.filter(m => m.character === character.name).length === 0) {
        matches.push({
          character: character.name,
          series: 'Unknown Series',
          score: charScore,
        });
      }
    }
  }
  
  // Also check series independently
  for (const series of marvelSeries) {
    const seriesName = series.name.toLowerCase();
    if (text.includes(seriesName) && !matches.some(m => m.series === series.name)) {
      matches.push({
        character: 'Unknown Character',
        series: series.name,
        score: 40,
      });
    }
  }
  
  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);
  
  // Detect collectible type from text
  let detectedType: string | null = null;
  for (const ct of marvelCollectibleTypes) {
    if (text.includes(ct.name.toLowerCase()) || text.includes(ct.id.replace('_', ' '))) {
      detectedType = ct.id;
      break;
    }
  }
  
  // Check for specific keywords
  if (!detectedType) {
    if (text.includes('funko') || text.includes('pop!')) {
      detectedType = 'funko_pop';
    } else if (text.includes('hot toys')) {
      detectedType = 'hot_toys';
    } else if (text.includes('comic') || text.includes('#') || text.includes('issue')) {
      detectedType = 'comic';
    } else if (text.includes('figure')) {
      detectedType = 'action_figure';
    } else if (text.includes('lego')) {
      detectedType = 'lego';
    }
  }
  
  const topMatch = matches[0];
  
  return {
    character: topMatch?.character !== 'Unknown Character' ? topMatch?.character : null,
    series: topMatch?.series !== 'Unknown Series' ? topMatch?.series : null,
    collectibleType: detectedType,
    matchConfidence: topMatch?.score || 0,
    topMatches: matches.slice(0, 5),
  };
}
