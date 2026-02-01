import { populateQueueFromSeedFile, runSeederWorker, getWatchSeedReport } from '../server/watch-seeder-worker';

async function main() {
  console.log('='.repeat(60));
  console.log('WATCH PHOTO DATABASE SEEDER');
  console.log('='.repeat(60));
  console.log('');

  console.log('Step 1: Populating queue from seed file...');
  const queuedCount = await populateQueueFromSeedFile();
  console.log(`  Queued ${queuedCount} new URLs`);
  console.log('');

  console.log('Step 2: Running seeder worker...');
  const stats = await runSeederWorker();
  console.log('');

  console.log('Step 3: Generating report...');
  const report = await getWatchSeedReport();
  
  console.log('\n' + '='.repeat(60));
  console.log('FINAL SEED REPORT');
  console.log('='.repeat(60));
  console.log(`Total watch families: ${report.totalFamilies}`);
  console.log(`Total stored images: ${report.totalStoredImages}`);
  console.log(`Min images per family: ${report.minImagesPerFamily}`);
  console.log(`Max images per family: ${report.maxImagesPerFamily}`);
  console.log(`Avg images per family: ${report.avgImagesPerFamily}`);
  console.log(`Ready families: ${report.readyFamilies}/${report.totalFamilies}`);
  console.log(`Library ready: ${report.libraryReady ? 'YES' : 'NO'}`);
  
  console.log('\nQueue Health:');
  console.log(`  Pending: ${report.queueHealth.pending}`);
  console.log(`  Processing: ${report.queueHealth.processing}`);
  console.log(`  Completed: ${report.queueHealth.completed}`);
  console.log(`  Failed: ${report.queueHealth.failed}`);
  console.log(`  Skipped: ${report.queueHealth.skipped}`);

  if (report.underfilledFamilies.length > 0) {
    console.log(`\nUnderfilled families (${report.underfilledFamilies.length}):`);
    for (const uf of report.underfilledFamilies.slice(0, 20)) {
      console.log(`  - ${uf.brand} ${uf.family}: ${uf.imageCount}/${uf.required}`);
    }
    if (report.underfilledFamilies.length > 20) {
      console.log(`  ... and ${report.underfilledFamilies.length - 20} more`);
    }
  }

  console.log('\n' + '='.repeat(60));

  process.exit(0);
}

main().catch(err => {
  console.error('Seeder failed:', err);
  process.exit(1);
});
