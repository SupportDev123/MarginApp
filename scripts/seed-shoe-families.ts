import { runShoeImageSeeder, getShoeSeederReport } from '../server/shoe-image-seeder';

async function main() {
  console.log('Starting Shoe Image Seeder...\n');
  
  try {
    const stats = await runShoeImageSeeder();
    
    console.log('\n\nFinal Report:');
    const report = await getShoeSeederReport();
    console.log(JSON.stringify(report, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('Seeder failed:', error);
    process.exit(1);
  }
}

main();
