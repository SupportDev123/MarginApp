// Internal Vehicle Recognition Library - Top 20 car producers with model families
// This is the reference data for vehicle recognition at scan time

export const vehicleBrands = [
  { id: 'toyota', name: 'Toyota' },
  { id: 'ford', name: 'Ford' },
  { id: 'chevrolet', name: 'Chevrolet' },
  { id: 'honda', name: 'Honda' },
  { id: 'nissan', name: 'Nissan' },
  { id: 'bmw', name: 'BMW' },
  { id: 'mercedes', name: 'Mercedes-Benz' },
  { id: 'volkswagen', name: 'Volkswagen' },
  { id: 'audi', name: 'Audi' },
  { id: 'hyundai', name: 'Hyundai' },
  { id: 'kia', name: 'Kia' },
  { id: 'subaru', name: 'Subaru' },
  { id: 'mazda', name: 'Mazda' },
  { id: 'lexus', name: 'Lexus' },
  { id: 'jeep', name: 'Jeep' },
  { id: 'tesla', name: 'Tesla' },
  { id: 'porsche', name: 'Porsche' },
  { id: 'dodge', name: 'Dodge' },
  { id: 'ram', name: 'RAM' },
  { id: 'gmc', name: 'GMC' },
] as const;

export type VehicleBrandId = typeof vehicleBrands[number]['id'];

// Model families organized by brand
export const vehicleFamilies: Record<VehicleBrandId, { id: string; name: string }[]> = {
  toyota: [
    { id: 'camry', name: 'Camry' },
    { id: 'corolla', name: 'Corolla' },
    { id: 'rav4', name: 'RAV4' },
    { id: 'highlander', name: 'Highlander' },
    { id: 'tacoma', name: 'Tacoma' },
    { id: 'tundra', name: 'Tundra' },
    { id: '4runner', name: '4Runner' },
    { id: 'prius', name: 'Prius' },
    { id: 'supra', name: 'Supra' },
    { id: 'land_cruiser', name: 'Land Cruiser' },
  ],
  ford: [
    { id: 'f150', name: 'F-150' },
    { id: 'mustang', name: 'Mustang' },
    { id: 'explorer', name: 'Explorer' },
    { id: 'bronco', name: 'Bronco' },
    { id: 'escape', name: 'Escape' },
    { id: 'ranger', name: 'Ranger' },
    { id: 'edge', name: 'Edge' },
    { id: 'expedition', name: 'Expedition' },
    { id: 'maverick', name: 'Maverick' },
    { id: 'gt', name: 'GT' },
  ],
  chevrolet: [
    { id: 'silverado', name: 'Silverado' },
    { id: 'camaro', name: 'Camaro' },
    { id: 'corvette', name: 'Corvette' },
    { id: 'equinox', name: 'Equinox' },
    { id: 'tahoe', name: 'Tahoe' },
    { id: 'suburban', name: 'Suburban' },
    { id: 'colorado', name: 'Colorado' },
    { id: 'malibu', name: 'Malibu' },
    { id: 'blazer', name: 'Blazer' },
    { id: 'traverse', name: 'Traverse' },
  ],
  honda: [
    { id: 'civic', name: 'Civic' },
    { id: 'accord', name: 'Accord' },
    { id: 'crv', name: 'CR-V' },
    { id: 'pilot', name: 'Pilot' },
    { id: 'hrv', name: 'HR-V' },
    { id: 'odyssey', name: 'Odyssey' },
    { id: 'ridgeline', name: 'Ridgeline' },
    { id: 'passport', name: 'Passport' },
    { id: 'fit', name: 'Fit' },
    { id: 'insight', name: 'Insight' },
  ],
  nissan: [
    { id: 'altima', name: 'Altima' },
    { id: 'rogue', name: 'Rogue' },
    { id: 'sentra', name: 'Sentra' },
    { id: 'pathfinder', name: 'Pathfinder' },
    { id: 'frontier', name: 'Frontier' },
    { id: 'maxima', name: 'Maxima' },
    { id: 'murano', name: 'Murano' },
    { id: '370z', name: '370Z / Z' },
    { id: 'gtr', name: 'GT-R' },
    { id: 'titan', name: 'Titan' },
  ],
  bmw: [
    { id: '3_series', name: '3 Series' },
    { id: '5_series', name: '5 Series' },
    { id: 'x3', name: 'X3' },
    { id: 'x5', name: 'X5' },
    { id: 'm3', name: 'M3' },
    { id: 'm5', name: 'M5' },
    { id: 'x1', name: 'X1' },
    { id: '7_series', name: '7 Series' },
    { id: 'z4', name: 'Z4' },
    { id: 'i4', name: 'i4' },
  ],
  mercedes: [
    { id: 'c_class', name: 'C-Class' },
    { id: 'e_class', name: 'E-Class' },
    { id: 's_class', name: 'S-Class' },
    { id: 'gle', name: 'GLE' },
    { id: 'glc', name: 'GLC' },
    { id: 'amg_gt', name: 'AMG GT' },
    { id: 'g_wagon', name: 'G-Class (G-Wagon)' },
    { id: 'a_class', name: 'A-Class' },
    { id: 'cla', name: 'CLA' },
    { id: 'gls', name: 'GLS' },
  ],
  volkswagen: [
    { id: 'jetta', name: 'Jetta' },
    { id: 'passat', name: 'Passat' },
    { id: 'golf', name: 'Golf' },
    { id: 'tiguan', name: 'Tiguan' },
    { id: 'atlas', name: 'Atlas' },
    { id: 'id4', name: 'ID.4' },
    { id: 'arteon', name: 'Arteon' },
    { id: 'beetle', name: 'Beetle' },
    { id: 'gti', name: 'GTI' },
    { id: 'r', name: 'Golf R' },
  ],
  audi: [
    { id: 'a4', name: 'A4' },
    { id: 'a6', name: 'A6' },
    { id: 'q5', name: 'Q5' },
    { id: 'q7', name: 'Q7' },
    { id: 'a3', name: 'A3' },
    { id: 'rs6', name: 'RS6' },
    { id: 'r8', name: 'R8' },
    { id: 'tt', name: 'TT' },
    { id: 'e_tron', name: 'e-tron' },
    { id: 's4', name: 'S4' },
  ],
  hyundai: [
    { id: 'elantra', name: 'Elantra' },
    { id: 'sonata', name: 'Sonata' },
    { id: 'tucson', name: 'Tucson' },
    { id: 'santa_fe', name: 'Santa Fe' },
    { id: 'palisade', name: 'Palisade' },
    { id: 'kona', name: 'Kona' },
    { id: 'ioniq', name: 'Ioniq' },
    { id: 'veloster', name: 'Veloster' },
    { id: 'venue', name: 'Venue' },
    { id: 'santa_cruz', name: 'Santa Cruz' },
  ],
  kia: [
    { id: 'forte', name: 'Forte' },
    { id: 'optima', name: 'K5 (Optima)' },
    { id: 'sportage', name: 'Sportage' },
    { id: 'sorento', name: 'Sorento' },
    { id: 'telluride', name: 'Telluride' },
    { id: 'seltos', name: 'Seltos' },
    { id: 'ev6', name: 'EV6' },
    { id: 'stinger', name: 'Stinger' },
    { id: 'soul', name: 'Soul' },
    { id: 'carnival', name: 'Carnival' },
  ],
  subaru: [
    { id: 'outback', name: 'Outback' },
    { id: 'forester', name: 'Forester' },
    { id: 'crosstrek', name: 'Crosstrek' },
    { id: 'wrx', name: 'WRX' },
    { id: 'impreza', name: 'Impreza' },
    { id: 'legacy', name: 'Legacy' },
    { id: 'ascent', name: 'Ascent' },
    { id: 'brz', name: 'BRZ' },
    { id: 'sti', name: 'STI' },
    { id: 'solterra', name: 'Solterra' },
  ],
  mazda: [
    { id: 'mazda3', name: 'Mazda3' },
    { id: 'mazda6', name: 'Mazda6' },
    { id: 'cx5', name: 'CX-5' },
    { id: 'cx9', name: 'CX-9' },
    { id: 'cx30', name: 'CX-30' },
    { id: 'mx5', name: 'MX-5 Miata' },
    { id: 'cx50', name: 'CX-50' },
    { id: 'cx90', name: 'CX-90' },
    { id: 'rx7', name: 'RX-7' },
    { id: 'rx8', name: 'RX-8' },
  ],
  lexus: [
    { id: 'rx', name: 'RX' },
    { id: 'es', name: 'ES' },
    { id: 'nx', name: 'NX' },
    { id: 'is', name: 'IS' },
    { id: 'gx', name: 'GX' },
    { id: 'lx', name: 'LX' },
    { id: 'rc', name: 'RC' },
    { id: 'lc', name: 'LC' },
    { id: 'ux', name: 'UX' },
    { id: 'ls', name: 'LS' },
  ],
  jeep: [
    { id: 'wrangler', name: 'Wrangler' },
    { id: 'grand_cherokee', name: 'Grand Cherokee' },
    { id: 'cherokee', name: 'Cherokee' },
    { id: 'gladiator', name: 'Gladiator' },
    { id: 'compass', name: 'Compass' },
    { id: 'renegade', name: 'Renegade' },
    { id: 'wagoneer', name: 'Wagoneer' },
    { id: 'grand_wagoneer', name: 'Grand Wagoneer' },
    { id: '4xe', name: '4xe (Hybrid)' },
    { id: 'cj', name: 'CJ (Classic)' },
  ],
  tesla: [
    { id: 'model_3', name: 'Model 3' },
    { id: 'model_y', name: 'Model Y' },
    { id: 'model_s', name: 'Model S' },
    { id: 'model_x', name: 'Model X' },
    { id: 'cybertruck', name: 'Cybertruck' },
    { id: 'roadster', name: 'Roadster' },
  ],
  porsche: [
    { id: '911', name: '911' },
    { id: 'cayenne', name: 'Cayenne' },
    { id: 'macan', name: 'Macan' },
    { id: 'panamera', name: 'Panamera' },
    { id: 'taycan', name: 'Taycan' },
    { id: 'boxster', name: '718 Boxster' },
    { id: 'cayman', name: '718 Cayman' },
    { id: 'gt3', name: '911 GT3' },
    { id: 'turbo', name: '911 Turbo' },
    { id: 'carrera', name: '911 Carrera' },
  ],
  dodge: [
    { id: 'challenger', name: 'Challenger' },
    { id: 'charger', name: 'Charger' },
    { id: 'durango', name: 'Durango' },
    { id: 'hornet', name: 'Hornet' },
    { id: 'viper', name: 'Viper' },
    { id: 'hellcat', name: 'Hellcat' },
    { id: 'demon', name: 'Demon' },
    { id: 'srt', name: 'SRT' },
  ],
  ram: [
    { id: '1500', name: '1500' },
    { id: '2500', name: '2500' },
    { id: '3500', name: '3500' },
    { id: 'trx', name: 'TRX' },
    { id: 'promaster', name: 'ProMaster' },
    { id: 'rebel', name: 'Rebel' },
    { id: 'laramie', name: 'Laramie' },
    { id: 'limited', name: 'Limited' },
  ],
  gmc: [
    { id: 'sierra', name: 'Sierra' },
    { id: 'yukon', name: 'Yukon' },
    { id: 'acadia', name: 'Acadia' },
    { id: 'terrain', name: 'Terrain' },
    { id: 'canyon', name: 'Canyon' },
    { id: 'hummer_ev', name: 'Hummer EV' },
    { id: 'denali', name: 'Denali' },
    { id: 'at4', name: 'AT4' },
  ],
};

// Vehicle body types
export const vehicleBodyTypes = [
  { id: 'sedan', name: 'Sedan' },
  { id: 'suv', name: 'SUV' },
  { id: 'truck', name: 'Truck' },
  { id: 'coupe', name: 'Coupe' },
  { id: 'convertible', name: 'Convertible' },
  { id: 'hatchback', name: 'Hatchback' },
  { id: 'wagon', name: 'Wagon' },
  { id: 'van', name: 'Van / Minivan' },
  { id: 'crossover', name: 'Crossover' },
  { id: 'sports', name: 'Sports Car' },
] as const;

export type VehicleBodyType = typeof vehicleBodyTypes[number]['id'];

// Transmission types
export const vehicleTransmissions = [
  { id: 'automatic', name: 'Automatic' },
  { id: 'manual', name: 'Manual' },
  { id: 'cvt', name: 'CVT' },
  { id: 'dct', name: 'Dual-Clutch (DCT)' },
  { id: 'ev', name: 'Electric (Single Speed)' },
] as const;

export type VehicleTransmission = typeof vehicleTransmissions[number]['id'];

// Fuel types
export const vehicleFuelTypes = [
  { id: 'gasoline', name: 'Gasoline' },
  { id: 'diesel', name: 'Diesel' },
  { id: 'hybrid', name: 'Hybrid' },
  { id: 'plugin_hybrid', name: 'Plug-in Hybrid' },
  { id: 'electric', name: 'Electric' },
] as const;

export type VehicleFuelType = typeof vehicleFuelTypes[number]['id'];

// Text-based similarity matching for vehicles
export function matchVehicleToLibrary(detectedText: string): {
  brand: string | null;
  family: string | null;
  bodyType: string | null;
  matchConfidence: number;
  topMatches: { brand: string; family: string; score: number }[];
} {
  const text = detectedText.toLowerCase();
  const matches: { brand: string; family: string; score: number }[] = [];
  
  for (const brand of vehicleBrands) {
    const brandName = brand.name.toLowerCase();
    const brandId = brand.id;
    
    // Check if brand name appears in text
    let brandScore = 0;
    if (text.includes(brandName)) {
      brandScore = 50;
    } else if (text.includes(brandId.replace('_', ' '))) {
      brandScore = 40;
    }
    
    if (brandScore > 0) {
      // Check families for this brand
      const families = vehicleFamilies[brandId] || [];
      for (const family of families) {
        const familyName = family.name.toLowerCase();
        const familyId = family.id.replace('_', ' ');
        
        let familyScore = 0;
        if (text.includes(familyName)) {
          familyScore = 50;
        } else if (text.includes(familyId)) {
          familyScore = 40;
        } else if (text.includes(family.id)) {
          familyScore = 30;
        }
        
        if (familyScore > 0) {
          matches.push({
            brand: brand.name,
            family: family.name,
            score: brandScore + familyScore,
          });
        }
      }
      
      // If brand found but no family, still add with lower score
      if (matches.filter(m => m.brand === brand.name).length === 0) {
        matches.push({
          brand: brand.name,
          family: 'Unknown Model',
          score: brandScore,
        });
      }
    }
  }
  
  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);
  
  // Detect body type from text
  let detectedBodyType: string | null = null;
  for (const bt of vehicleBodyTypes) {
    if (text.includes(bt.name.toLowerCase()) || text.includes(bt.id)) {
      detectedBodyType = bt.id;
      break;
    }
  }
  
  const topMatch = matches[0];
  
  return {
    brand: topMatch?.brand || null,
    family: topMatch?.family !== 'Unknown Model' ? topMatch?.family : null,
    bodyType: detectedBodyType,
    matchConfidence: topMatch?.score || 0,
    topMatches: matches.slice(0, 5),
  };
}
