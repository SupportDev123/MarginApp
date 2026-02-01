/**
 * Seed next batch of watch families
 * 
 * Families: Orient Bambino, Timex Expedition, Citizen Promaster, Seiko Samurai, Tag Heuer Carrera
 * Target: 25 images per family
 * Max listings: 300 per family
 * Auto-lock: enabled
 */

import { seedSpecificFamilies } from '../server/ebay-image-seeder';

const FAMILIES_TO_SEED = [
  { brand: 'Orient', family: 'Bambino' },
  { brand: 'Timex', family: 'Expedition' },
  { brand: 'Citizen', family: 'Promaster' },
  { brand: 'Seiko', family: 'Samurai' },
  { brand: 'Tag Heuer', family: 'Carrera' },
];

async function main() {
  console.log('Starting watch family seeder...');
  console.log('Families:', FAMILIES_TO_SEED.map(f => `${f.brand} ${f.family}`).join(', '));
  
  const stats = await seedSpecificFamilies(FAMILIES_TO_SEED, { maxListings: 300 });
  
  console.log('\n\n=== FINAL RESULTS ===');
  console.log(`Completed (locked): ${stats.completedFamilies.length}`);
  console.log(`Incomplete: ${stats.incompleteFamilies.length}`);
  console.log(`Total images: ${stats.totalImagesStored}`);
  console.log(`Total API calls: ${stats.totalApiCalls}`);
  
  process.exit(0);
}

main().catch((error) => {
  console.error('Seeder failed:', error);
  process.exit(1);
});
