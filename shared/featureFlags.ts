/**
 * Feature Flags for Margin App
 * 
 * Controls data source behavior and feature availability.
 * Designed for easy injection of Marketplace Insights when approved.
 */

export interface FeatureFlags {
  useMarketplaceInsights: boolean;
  useBrowseAPIOnly: boolean;
  showDebugScores: boolean;
  enableSellerAdvantageScoring: boolean;
}

const defaultFlags: FeatureFlags = {
  useMarketplaceInsights: false,
  useBrowseAPIOnly: true,
  showDebugScores: false,
  enableSellerAdvantageScoring: true,
};

let currentFlags: FeatureFlags = { ...defaultFlags };

export function getFeatureFlags(): FeatureFlags {
  return { ...currentFlags };
}

export function setFeatureFlag<K extends keyof FeatureFlags>(key: K, value: FeatureFlags[K]): void {
  currentFlags[key] = value;
}

export function resetFeatureFlags(): void {
  currentFlags = { ...defaultFlags };
}

export type DataSourceType = 'marketplace_insights' | 'browse_api' | 'none';

export function getActiveDataSource(): DataSourceType {
  const flags = getFeatureFlags();
  
  if (flags.useMarketplaceInsights) {
    return 'marketplace_insights';
  }
  
  if (flags.useBrowseAPIOnly) {
    return 'browse_api';
  }
  
  return 'none';
}
