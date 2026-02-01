import { db } from './db';
import { 
  watchFamilies, watchImages,
  shoeFamilies, shoeImages,
  gamingFamilies, gamingImages,
  toolFamilies, toolImages,
  handbagFamilies, handbagImages,
  antiqueFamilies, antiqueImages,
  vintageFamilies, vintageImages,
  electronicsFamilies, electronicsImages,
  toyFamilies, toyImages
} from '@shared/schema';
import { count, eq, or, sql } from 'drizzle-orm';

interface CategoryStatus {
  name: string;
  totalFamilies: number;
  lockedFamilies: number;
  activeFamilies: number;
  queuedFamilies: number;
  hardFamilies: number;
  totalImages: number;
  targetImages: number;
  percentComplete: number;
}

export async function getCategoryStatuses(): Promise<CategoryStatus[]> {
  const categories = [
    { name: 'Watches', families: watchFamilies, images: watchImages, total: 92 },
    { name: 'Shoes', families: shoeFamilies, images: shoeImages, total: 44 },
    { name: 'Gaming', families: gamingFamilies, images: gamingImages, total: 40 },
    { name: 'Tools', families: toolFamilies, images: toolImages, total: 50 },
    { name: 'Handbags', families: handbagFamilies, images: handbagImages, total: 50 },
    { name: 'Antiques', families: antiqueFamilies, images: antiqueImages, total: 205 },
    { name: 'Vintage Clothing', families: vintageFamilies, images: vintageImages, total: 71 },
    { name: 'Electronics', families: electronicsFamilies, images: electronicsImages, total: 73 },
    { name: 'Collectibles', families: toyFamilies, images: toyImages, total: 50 },
  ];

  const statuses: CategoryStatus[] = [];

  for (const cat of categories) {
    const [imageCount] = await db.select({ count: count() }).from(cat.images);
    const [locked] = await db.select({ count: count() }).from(cat.families).where(eq(cat.families.status, 'locked'));
    const [active] = await db.select({ count: count() }).from(cat.families).where(eq(cat.families.status, 'active'));
    const [queued] = await db.select({ count: count() }).from(cat.families).where(eq(cat.families.status, 'queued'));
    const [hard] = await db.select({ count: count() }).from(cat.families).where(eq(cat.families.status, 'hard'));

    const targetImages = cat.total * 25;
    const totalImages = imageCount?.count || 0;

    statuses.push({
      name: cat.name,
      totalFamilies: cat.total,
      lockedFamilies: locked?.count || 0,
      activeFamilies: active?.count || 0,
      queuedFamilies: queued?.count || 0,
      hardFamilies: hard?.count || 0,
      totalImages,
      targetImages,
      percentComplete: Math.round((totalImages / targetImages) * 100),
    });
  }

  return statuses;
}

export async function activateMoreFamilies(categoryName: string, count: number = 10): Promise<number> {
  const categoryMap: Record<string, any> = {
    'watches': watchFamilies,
    'shoes': shoeFamilies,
    'gaming': gamingFamilies,
    'tools': toolFamilies,
    'handbags': handbagFamilies,
    'antiques': antiqueFamilies,
    'vintage': vintageFamilies,
    'electronics': electronicsFamilies,
    'toys': toyFamilies,
  };

  const table = categoryMap[categoryName.toLowerCase()];
  if (!table) return 0;

  const result = await db.update(table)
    .set({ status: 'active' })
    .where(eq(table.status, 'queued'))
    .returning();

  return result.length;
}

export async function turboActivateAll(): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  
  const categories = [
    { name: 'watches', table: watchFamilies },
    { name: 'shoes', table: shoeFamilies },
    { name: 'gaming', table: gamingFamilies },
    { name: 'tools', table: toolFamilies },
    { name: 'handbags', table: handbagFamilies },
    { name: 'antiques', table: antiqueFamilies },
    { name: 'vintage', table: vintageFamilies },
    { name: 'electronics', table: electronicsFamilies },
    { name: 'toys', table: toyFamilies },
  ];

  for (const cat of categories) {
    const result = await db.update(cat.table)
      .set({ status: 'active' })
      .where(or(
        eq(cat.table.status, 'queued'),
        eq(cat.table.status, 'hard')
      ))
      .returning();
    results[cat.name] = result.length;
  }

  return results;
}

export async function resetHardFamilies(): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  
  const categories = [
    { name: 'watches', table: watchFamilies },
    { name: 'shoes', table: shoeFamilies },
    { name: 'gaming', table: gamingFamilies },
    { name: 'tools', table: toolFamilies },
    { name: 'handbags', table: handbagFamilies },
    { name: 'antiques', table: antiqueFamilies },
    { name: 'vintage', table: vintageFamilies },
    { name: 'electronics', table: electronicsFamilies },
    { name: 'toys', table: toyFamilies },
  ];

  for (const cat of categories) {
    const result = await db.update(cat.table)
      .set({ status: 'active' })
      .where(eq(cat.table.status, 'hard'))
      .returning();
    results[cat.name] = result.length;
  }

  return results;
}

export function printSeedingStatus(statuses: CategoryStatus[]): void {
  console.log('\n============================================================');
  console.log('VISUAL MATCHING LIBRARY - SEEDING STATUS');
  console.log('============================================================');
  
  let totalImages = 0;
  let totalTarget = 0;
  
  for (const s of statuses) {
    const bar = generateProgressBar(s.percentComplete);
    const status = s.percentComplete >= 100 ? 'COMPLETE' : 
                   s.activeFamilies > 0 ? 'SEEDING' : 'QUEUED';
    console.log(`${s.name.padEnd(20)} ${bar} ${s.percentComplete.toString().padStart(3)}% | ${s.totalImages}/${s.targetImages} images | ${status}`);
    totalImages += s.totalImages;
    totalTarget += s.targetImages;
  }
  
  console.log('------------------------------------------------------------');
  const overallPercent = Math.round((totalImages / totalTarget) * 100);
  console.log(`OVERALL: ${totalImages}/${totalTarget} images (${overallPercent}%)`);
  console.log('============================================================\n');
}

function generateProgressBar(percent: number, width: number = 20): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return '[' + '█'.repeat(Math.min(filled, width)) + '░'.repeat(Math.max(empty, 0)) + ']';
}
