import { runEbayImageSeeder } from '../server/ebay-image-seeder';

async function main() {
  console.log('Starting eBay image seeder (v2.0 - Sequential Mode)...\n');

  const stats = await runEbayImageSeeder();

  console.log('\n' + '═'.repeat(60));
  console.log('FINAL STATS');
  console.log('═'.repeat(60));
  console.log(JSON.stringify({
    completedFamilies: stats.completedFamilies.map(f => ({
      name: `${f.brand} ${f.family}`,
      images: f.imagesStored,
      apiCalls: f.apiCalls,
    })),
    incompleteFamilies: stats.incompleteFamilies.map(f => ({
      name: `${f.brand} ${f.family}`,
      images: f.imagesStored,
      apiCalls: f.apiCalls,
    })),
    summary: {
      completed: stats.completedFamilies.length,
      incomplete: stats.incompleteFamilies.length,
      totalImages: stats.totalImagesStored,
      totalApiCalls: stats.totalApiCalls,
    }
  }, null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error('Seeder failed:', err);
  process.exit(1);
});
