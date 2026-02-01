/**
 * CATEGORY_COMPLETE System
 * 
 * Categories are complete once they have sufficient visual diversity for reliable
 * coarse classification. Thresholds vary by category complexity.
 * 
 * Once complete:
 * - Stop all category-level ingestion (including SerpAPI)
 * - Allow only family-level seeding
 * - All SerpAPI images are tagged SERP_BOOTSTRAP (category routing only)
 */

import { db } from './db';
import { sql } from 'drizzle-orm';

// CATEGORY_COMPLETE thresholds
export const CATEGORY_THRESHOLDS: Record<string, number> = {
  shoes: 100,
  watches: 100,
  handbags: 100,
  toys: 200,
  gaming: 200,
  antiques: 200,
  electronics: 300,
  tools: 300,
  vintage_clothing: 200,
  cards: 300, // Trading cards need high diversity across sports, years, parallels
};

export type CategoryStatus = 'building' | 'category_complete' | 'family_focus';

export interface CategoryInfo {
  name: string;
  imageCount: number;
  threshold: number;
  status: CategoryStatus;
  percentComplete: number;
  canSeedCategory: boolean;  // false if CATEGORY_COMPLETE
  canSeedFamily: boolean;    // true always (except if category doesn't exist)
}

// Table mapping for each category
const CATEGORY_TABLES: Record<string, { images: string; families: string }> = {
  shoes: { images: 'shoe_images', families: 'shoe_families' },
  watches: { images: 'watch_images', families: 'watch_families' },
  handbags: { images: 'handbag_images', families: 'handbag_families' },
  toys: { images: 'toy_images', families: 'toy_families' },
  gaming: { images: 'gaming_images', families: 'gaming_families' },
  antiques: { images: 'antique_images', families: 'antique_families' },
  electronics: { images: 'electronics_images', families: 'electronics_families' },
  tools: { images: 'tool_images', families: 'tool_families' },
  vintage_clothing: { images: 'vintage_images', families: 'vintage_families' },
  cards: { images: 'card_images', families: 'card_families' },
};

/**
 * Get category status and counts
 */
export async function getCategoryStatus(category: string): Promise<CategoryInfo | null> {
  const tables = CATEGORY_TABLES[category.toLowerCase()];
  if (!tables) return null;
  
  const threshold = CATEGORY_THRESHOLDS[category.toLowerCase()] || 200;
  
  try {
    const result = await db.execute(
      sql`SELECT COUNT(*) as count FROM ${sql.raw(tables.images)} WHERE embedding IS NOT NULL`
    );
    const imageCount = Number(result.rows[0]?.count || 0);
    
    const status: CategoryStatus = imageCount >= threshold ? 'category_complete' : 'building';
    
    return {
      name: category,
      imageCount,
      threshold,
      status,
      percentComplete: Math.min(100, Math.round((imageCount / threshold) * 100)),
      canSeedCategory: status !== 'category_complete',
      canSeedFamily: true,
    };
  } catch (error) {
    console.error(`Error getting status for ${category}:`, error);
    return null;
  }
}

/**
 * Get all category statuses
 */
export async function getAllCategoryStatuses(): Promise<CategoryInfo[]> {
  const results: CategoryInfo[] = [];
  
  for (const category of Object.keys(CATEGORY_TABLES)) {
    const info = await getCategoryStatus(category);
    if (info) results.push(info);
  }
  
  return results;
}

/**
 * Check if category-level seeding is allowed
 */
export async function canSeedCategory(category: string): Promise<boolean> {
  const info = await getCategoryStatus(category);
  return info?.canSeedCategory ?? false;
}

/**
 * Get categories that still need category-level seeding
 */
export async function getCategoriesNeedingSeeding(): Promise<string[]> {
  const statuses = await getAllCategoryStatuses();
  return statuses
    .filter(s => s.canSeedCategory)
    .map(s => s.name);
}

/**
 * Get complete categories (for logging/reporting)
 */
export async function getCompletedCategories(): Promise<string[]> {
  const statuses = await getAllCategoryStatuses();
  return statuses
    .filter(s => s.status === 'category_complete')
    .map(s => s.name);
}

console.log('[CategoryStatus] Module loaded - thresholds:', CATEGORY_THRESHOLDS);
