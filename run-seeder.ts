import { seedAllCategoriesWithSerpAPI, getCategoryImageStats } from './server/universal-serpapi-seeder';

async function main() {
  console.log('Current image stats:');
  const stats = await getCategoryImageStats();
  console.log(JSON.stringify(stats, null, 2));
  
  console.log('\nStarting SerpAPI seeder for all categories...');
  const results = await seedAllCategoriesWithSerpAPI();
  console.log('\nSeeding results:');
  console.log(JSON.stringify(results, null, 2));
  
  console.log('\nUpdated image stats:');
  const newStats = await getCategoryImageStats();
  console.log(JSON.stringify(newStats, null, 2));
  
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
