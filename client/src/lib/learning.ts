/**
 * Client-side Learning Utilities
 * Implements the Global Learning Contract for consistent behavior across all category adapters
 * 
 * GLOBAL LEARNING CONTRACT:
 * 1. Only save on explicit user confirmation (Confirm button)
 * 2. Only save when identityConfidence === HIGH (never on ESTIMATE/BLOCKED)
 * 3. Persist only structured/normalized fields (no raw free-text)
 * 4. Learning is ADDITIVE (biases future matching, never overwrites base catalog)
 * 5. Always log debug trace when learning is saved
 */

import { 
  prepareLearningData, 
  type IdentityConfidence,
  type LearningPayload 
} from '@shared/learningService';

export interface SaveLearningParams {
  category: string;
  identityConfidence: IdentityConfidence;
  identityKey: string | number | null | undefined;
  configurationGroup?: string;
  suggestedConfigGroup?: string; // For 'unclassified' families - inferred from vision analysis
  attributes: Record<string, string | null | undefined>;
  embeddingRef?: string;
  imageStoragePath?: string;
  scanSessionId?: number;
  isUserConfirmed: boolean;
}

/**
 * Save learning data to the backend
 * Enforces all global learning contract gates before saving
 */
export async function saveLearningData(params: SaveLearningParams): Promise<boolean> {
  const { payload, trace } = prepareLearningData(params);

  if (!payload) {
    console.log('[Learning Client] Gates not satisfied:', trace);
    return false;
  }

  try {
    const response = await fetch('/api/learning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        category: payload.category,
        identityKey: payload.identityKey,
        configurationGroup: payload.configurationGroup,
        suggestedConfigGroup: params.suggestedConfigGroup, // For unclassified families
        normalizedAttributes: payload.normalizedAttributes,
        embeddingRef: payload.embeddingRef,
        imageStoragePath: payload.imageStoragePath,
        scanSessionId: payload.scanSessionId,
        source: payload.source,
      }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log('[Learning Client] SUCCESS:', {
        id: result.id,
        category: payload.category,
        identityKey: payload.identityKey,
        savedAttributes: Object.keys(payload.normalizedAttributes),
      });
      return true;
    } else {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      console.warn('[Learning Client] API error:', error.message);
      return false;
    }
  } catch (err) {
    console.error('[Learning Client] Failed to save:', err);
    return false;
  }
}

/**
 * Category-specific learning helpers
 */
export function prepareWatchLearning(params: {
  familyId: number | null;
  brand: string | null;
  model: string | null;
  dialColor: string | null;
  dialStyle: string | null;
  bezelColor: string | null;
  completeness: string | null;
  isHighConfidence: boolean;
  isUserConfirmed: boolean;
  imageStoragePath?: string;
  scanSessionId?: number;
}): SaveLearningParams {
  return {
    category: 'watch',
    identityConfidence: params.isHighConfidence ? 'HIGH' : 'ESTIMATE',
    identityKey: params.familyId,
    configurationGroup: params.brand || undefined,
    attributes: {
      brand: params.brand,
      model: params.model,
      dialColor: params.dialColor,
      dialStyle: params.dialStyle,
      bezelColor: params.bezelColor,
      completeness: params.completeness,
    },
    imageStoragePath: params.imageStoragePath,
    scanSessionId: params.scanSessionId,
    isUserConfirmed: params.isUserConfirmed,
  };
}

export function prepareCardLearning(params: {
  familyId: number | null;
  player: string | null;
  year: string | null;
  setName: string | null;
  parallel: string | null;
  grader: string | null;
  grade: string | null;
  serialNumber: string | null;
  isHighConfidence: boolean;
  isUserConfirmed: boolean;
  imageStoragePath?: string;
  scanSessionId?: number;
}): SaveLearningParams {
  return {
    category: 'cards',
    identityConfidence: params.isHighConfidence ? 'HIGH' : 'ESTIMATE',
    identityKey: params.familyId,
    configurationGroup: params.setName || undefined,
    attributes: {
      player: params.player,
      year: params.year,
      setName: params.setName,
      parallel: params.parallel,
      grader: params.grader,
      grade: params.grade,
      serialNumber: params.serialNumber,
    },
    imageStoragePath: params.imageStoragePath,
    scanSessionId: params.scanSessionId,
    isUserConfirmed: params.isUserConfirmed,
  };
}

export function prepareElectronicsLearning(params: {
  sku: string | null;
  brand: string | null;
  model: string | null;
  storage: string | null;
  color: string | null;
  condition: string | null;
  isHighConfidence: boolean;
  isUserConfirmed: boolean;
  imageStoragePath?: string;
  scanSessionId?: number;
}): SaveLearningParams {
  return {
    category: 'electronics',
    identityConfidence: params.isHighConfidence ? 'HIGH' : 'ESTIMATE',
    identityKey: params.sku,
    configurationGroup: params.brand || undefined,
    attributes: {
      brand: params.brand,
      model: params.model,
      storage: params.storage,
      color: params.color,
      condition: params.condition,
    },
    imageStoragePath: params.imageStoragePath,
    scanSessionId: params.scanSessionId,
    isUserConfirmed: params.isUserConfirmed,
  };
}

export function prepareShoeLearning(params: {
  sku: string | null;
  brand: string | null;
  model: string | null;
  colorway: string | null;
  size: string | null;
  condition: string | null;
  isHighConfidence: boolean;
  isUserConfirmed: boolean;
  imageStoragePath?: string;
  scanSessionId?: number;
}): SaveLearningParams {
  return {
    category: 'shoes',
    identityConfidence: params.isHighConfidence ? 'HIGH' : 'ESTIMATE',
    identityKey: params.sku,
    configurationGroup: params.brand || undefined,
    attributes: {
      brand: params.brand,
      model: params.model,
      colorway: params.colorway,
      size: params.size,
      condition: params.condition,
    },
    imageStoragePath: params.imageStoragePath,
    scanSessionId: params.scanSessionId,
    isUserConfirmed: params.isUserConfirmed,
  };
}
