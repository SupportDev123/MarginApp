/**
 * Global Learning Service - Reusable module for consistent learning behavior
 * 
 * GLOBAL LEARNING CONTRACT:
 * 1. Only save learning on explicit user confirmation (Confirm button)
 * 2. Only save when identityConfidence === HIGH (never on ESTIMATE/BLOCKED)
 * 3. Persist only structured/normalized fields (no raw free-text)
 * 4. Learning is ADDITIVE (biases future matching, never overwrites base catalog)
 * 5. Always log debug trace when learning is saved
 */

export type IdentityConfidence = 'HIGH' | 'ESTIMATE' | 'BLOCKED' | 'UNKNOWN';
export type ConfidenceSource = 'USER_CONFIRMED' | 'AUTO_DETECTED' | 'INFERRED';

export interface LearningPayload {
  category: string;
  identityKey: string | number; // modelId, sku, reference, familyId
  configurationGroup?: string; // optional grouping (e.g., watch collection)
  normalizedAttributes: Record<string, string | number | null>; // structured attributes only
  embeddingRef?: string; // reference to stored image embedding
  imageStoragePath?: string; // path to stored image
  scanSessionId?: number;
  source: ConfidenceSource;
  timestamp: Date;
}

export interface LearningGateResult {
  shouldSave: boolean;
  reason: string;
  gates: {
    hasHighConfidence: boolean;
    hasIdentityKey: boolean;
    isUserConfirmed: boolean;
    hasCategory: boolean;
  };
}

export interface LearningDebugTrace {
  timestamp: string;
  action: 'SAVED' | 'SKIPPED';
  category: string;
  reason: string;
  gates: LearningGateResult['gates'];
  payload?: Partial<LearningPayload>;
}

/**
 * Check if all learning gates pass before saving
 * Returns detailed gate results for debugging
 */
export function checkLearningGates(
  identityConfidence: IdentityConfidence,
  identityKey: string | number | null | undefined,
  category: string | null | undefined,
  isUserConfirmed: boolean
): LearningGateResult {
  const gates = {
    hasHighConfidence: identityConfidence === 'HIGH',
    hasIdentityKey: !!identityKey,
    isUserConfirmed: isUserConfirmed,
    hasCategory: !!category,
  };

  const allGatesPass = gates.hasHighConfidence && 
                       gates.hasIdentityKey && 
                       gates.isUserConfirmed && 
                       gates.hasCategory;

  let reason = '';
  if (!gates.hasHighConfidence) {
    reason = `Identity confidence is ${identityConfidence}, not HIGH`;
  } else if (!gates.hasIdentityKey) {
    reason = 'Missing identity key (modelId/sku/reference)';
  } else if (!gates.isUserConfirmed) {
    reason = 'User has not explicitly confirmed';
  } else if (!gates.hasCategory) {
    reason = 'Missing category';
  } else {
    reason = 'All gates passed';
  }

  return {
    shouldSave: allGatesPass,
    reason,
    gates,
  };
}

/**
 * Normalize an attribute value to a standard format
 * Ensures no raw free-text is stored
 */
export function normalizeAttribute(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.toLowerCase().trim();
}

/**
 * Build a structured learning payload from category-specific data
 * Ensures only normalized fields are included
 */
export function buildLearningPayload(params: {
  category: string;
  identityKey: string | number;
  configurationGroup?: string;
  attributes: Record<string, string | null | undefined>;
  embeddingRef?: string;
  imageStoragePath?: string;
  scanSessionId?: number;
}): LearningPayload {
  const normalizedAttributes: Record<string, string | number | null> = {};
  
  for (const [key, value] of Object.entries(params.attributes)) {
    normalizedAttributes[key] = normalizeAttribute(value);
  }

  return {
    category: params.category.toLowerCase(),
    identityKey: params.identityKey,
    configurationGroup: params.configurationGroup?.toLowerCase(),
    normalizedAttributes,
    embeddingRef: params.embeddingRef,
    imageStoragePath: params.imageStoragePath,
    scanSessionId: params.scanSessionId,
    source: 'USER_CONFIRMED',
    timestamp: new Date(),
  };
}

/**
 * Create a debug trace for logging
 */
export function createDebugTrace(
  action: 'SAVED' | 'SKIPPED',
  category: string,
  gateResult: LearningGateResult,
  payload?: Partial<LearningPayload>
): LearningDebugTrace {
  return {
    timestamp: new Date().toISOString(),
    action,
    category,
    reason: gateResult.reason,
    gates: gateResult.gates,
    payload: action === 'SAVED' ? payload : undefined,
  };
}

/**
 * Log learning debug trace to console
 */
export function logLearningTrace(trace: LearningDebugTrace): void {
  const prefix = trace.action === 'SAVED' 
    ? '[Learning] SUCCESS:' 
    : '[Learning] SKIPPED:';
  
  console.log(`${prefix} ${trace.reason}`, {
    category: trace.category,
    gates: trace.gates,
    ...(trace.payload && { savedFields: Object.keys(trace.payload.normalizedAttributes || {}) }),
    timestamp: trace.timestamp,
  });
}

/**
 * Main learning function - validates gates and prepares payload
 * Returns null if gates don't pass, otherwise returns the payload to save
 */
export function prepareLearningData(params: {
  category: string;
  identityConfidence: IdentityConfidence;
  identityKey: string | number | null | undefined;
  configurationGroup?: string;
  attributes: Record<string, string | null | undefined>;
  embeddingRef?: string;
  imageStoragePath?: string;
  scanSessionId?: number;
  isUserConfirmed: boolean;
}): { payload: LearningPayload | null; trace: LearningDebugTrace } {
  const gateResult = checkLearningGates(
    params.identityConfidence,
    params.identityKey,
    params.category,
    params.isUserConfirmed
  );

  if (!gateResult.shouldSave) {
    const trace = createDebugTrace('SKIPPED', params.category || 'unknown', gateResult);
    logLearningTrace(trace);
    return { payload: null, trace };
  }

  const payload = buildLearningPayload({
    category: params.category,
    identityKey: params.identityKey!,
    configurationGroup: params.configurationGroup,
    attributes: params.attributes,
    embeddingRef: params.embeddingRef,
    imageStoragePath: params.imageStoragePath,
    scanSessionId: params.scanSessionId,
  });

  const trace = createDebugTrace('SAVED', params.category, gateResult, payload);
  logLearningTrace(trace);

  return { payload, trace };
}

// Category-specific attribute mappings
export const WATCH_ATTRIBUTES = ['dialColor', 'dialStyle', 'bezelColor', 'bezelType', 'materials', 'completeness'] as const;
export const CARD_ATTRIBUTES = ['parallel', 'grader', 'grade', 'serialNumber', 'isAutograph'] as const;
export const SHOE_ATTRIBUTES = ['size', 'colorway', 'condition'] as const;
export const ELECTRONICS_ATTRIBUTES = ['brand', 'model', 'storage', 'color', 'condition'] as const;

export type WatchAttribute = typeof WATCH_ATTRIBUTES[number];
export type CardAttribute = typeof CARD_ATTRIBUTES[number];
export type ShoeAttribute = typeof SHOE_ATTRIBUTES[number];
export type ElectronicsAttribute = typeof ELECTRONICS_ATTRIBUTES[number];
