import { runEbayImageSeeder } from '../server/ebay-image-seeder';
import { runShoeImageSeeder } from '../server/shoe-image-seeder';

async function main() {
  console.log('=== RUNNING BOTH IMAGE SEEDERS ===\n');
  
  console.log('1. Starting WATCH seeder...');
  console.log('   (This will fetch images from eBay sold listings)\n');
  
  try {
    const watchResult = await runEbayImageSeeder();
    console.log('\n   Watch seeder complete:');
    console.log(`   - Total images stored: ${watchResult.totalImagesStored || 0}`);
    console.log(`   - API calls made: ${watchResult.totalApiCalls || 0}`);
    if (watchResult.completedFamilies) {
      console.log(`   - Families completed: ${watchResult.completedFamilies.length}`);
    }
  } catch (err: any) {
    console.log(`   Watch seeder error: ${err.message}`);
  }
  
  console.log('\n2. Starting SHOE seeder...');
  console.log('   (This will fetch images from eBay sold listings)\n');
  
  try {
    const shoeResult = await runShoeImageSeeder();
    console.log('\n   Shoe seeder complete:');
    console.log(`   - Total images stored: ${shoeResult.totalImagesStored || 0}`);
    console.log(`   - API calls made: ${shoeResult.totalApiCalls || 0}`);
    if (shoeResult.lockedFamilies) {
      console.log(`   - Locked families: ${shoeResult.lockedFamilies.length}`);
    }
    if (shoeResult.activeFamilies) {
      console.log(`   - Active families: ${shoeResult.activeFamilies.length}`);
    }
  } catch (err: any) {
    console.log(`   Shoe seeder error: ${err.message}`);
  }
  
  console.log('\n=== SEEDER RUN COMPLETE ===');
  process.exit(0);
}

main();
