import OpenAI from 'openai';

function getOpenAIClient(): OpenAI {
  return new OpenAI({ apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY });
}
import {
  ObjectType,
  ConfidenceTier,
  CONFIDENCE_THRESHOLDS,
  PipelineStage1Result,
  PipelineStage2Result,
  PipelineStage3Result,
  PipelineStage4Result,
  PipelineStage5Result,
  IdentificationPipelineResult,
} from '@shared/schema';

// ============================================================
// TOY-SPECIFIC 5-STAGE GATING PIPELINE
// Only applies to: Funko Pop, LEGO, Hot Wheels, Action Figures
// Other categories continue using existing visual-matching flow
// ============================================================

const TOY_OBJECT_TYPES = new Set([
  ObjectType.FUNKO_POP,
  ObjectType.LEGO_SET,
]);

const TOY_BRANDS = ['Funko', 'LEGO', 'Hot Wheels', 'Hasbro', 'Mattel', 'NECA', 'McFarlane'];

// ============================================================
// MANDATORY BRAND-OBJECT COMPATIBILITY FILTER (HARD GATE)
// Each object-type has an explicit allowlist of compatible brands.
// If detected brand is NOT compatible with locked object-type,
// it MUST be discarded (confidence = 0, excluded from candidates).
// This filter is a HARD STOP and applies globally.
// ============================================================
const BRAND_OBJECT_COMPATIBILITY: Record<string, string[]> = {
  [ObjectType.FUNKO_POP]: ['Funko', 'Funko Pop', 'Pop!'],
  [ObjectType.LEGO_SET]: ['LEGO', 'Lego'],
  [ObjectType.GENERIC_COLLECTIBLE]: [], // No restrictions for generic
};

/**
 * Check if a brand is compatible with a locked object-type.
 * Returns true if compatible, false if should be discarded.
 */
export function isBrandCompatibleWithObjectType(
  brand: string | null,
  objectType: string
): boolean {
  // No brand detected - compatible by default
  if (!brand) return true;
  
  // Generic collectible has no restrictions
  if (objectType === ObjectType.GENERIC_COLLECTIBLE) return true;
  
  // Get allowlist for this object type
  const allowedBrands = BRAND_OBJECT_COMPATIBILITY[objectType];
  
  // If no allowlist defined, allow all
  if (!allowedBrands || allowedBrands.length === 0) return true;
  
  // Check if detected brand matches any allowed brand (case-insensitive)
  const brandLower = brand.toLowerCase();
  const isCompatible = allowedBrands.some(allowed => 
    brandLower.includes(allowed.toLowerCase()) || 
    allowed.toLowerCase().includes(brandLower)
  );
  
  if (!isCompatible) {
    console.log(`[Brand Filter] REJECTED: Brand "${brand}" is NOT compatible with ${objectType}. Allowed: ${allowedBrands.join(', ')}`);
  }
  
  return isCompatible;
}

/**
 * Validate and filter a detected brand against locked object-type.
 * Returns null if incompatible (forces discard).
 */
export function validateBrandForObjectType(
  detectedBrand: string | null,
  lockedObjectType: string
): { brand: string | null; isValid: boolean; reason?: string } {
  if (!detectedBrand) {
    return { brand: null, isValid: true };
  }
  
  const isValid = isBrandCompatibleWithObjectType(detectedBrand, lockedObjectType);
  
  if (!isValid) {
    return {
      brand: null,
      isValid: false,
      reason: `Brand "${detectedBrand}" incompatible with ${lockedObjectType}`,
    };
  }
  
  return { brand: detectedBrand, isValid: true };
}

/**
 * Get the LOCKED product brand from objectType.
 * This is the ONLY source of truth for the product brand.
 * Stage 2 returns franchise (Marvel, Star Wars), NOT product brand.
 */
export function getLockedBrandFromObjectType(objectType: string): string {
  if (objectType === ObjectType.FUNKO_POP) return 'Funko';
  if (objectType === ObjectType.LEGO_SET) return 'LEGO';
  return 'Unknown';
}

export function isToyCategory(objectType: string | null, brand: string | null): boolean {
  if (objectType && TOY_OBJECT_TYPES.has(objectType as typeof ObjectType.FUNKO_POP | typeof ObjectType.LEGO_SET)) return true;
  if (brand && TOY_BRANDS.some(b => brand.toLowerCase().includes(b.toLowerCase()))) return true;
  return false;
}

// STAGE 1: Toy-Type Classification (HARD GATE)
export async function runToyStage1Detection(
  imageBase64: string
): Promise<PipelineStage1Result> {
  console.log('[Toy Pipeline Stage 1] Toy-Type Classification starting...');
  
  const imageUrl = imageBase64.startsWith('data:') 
    ? imageBase64 
    : `data:image/jpeg;base64,${imageBase64}`;
  
  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `TOY IDENTIFICATION - STAGE 1: Toy-Type Classification (HARD GATE)

Is this a TOY/COLLECTIBLE FIGURE? If yes, classify the specific type.

TOY TYPES (choose exactly one):
- FUNKO_POP: Funko Pop vinyl figures in boxes with "POP!" branding
- LEGO_SET: LEGO building sets in boxes  
- NOT_A_TOY: This is NOT a toy (cards, watches, shoes, electronics, etc.)

For FUNKO_POP, check for these specific signals (mark true/false):
- POP_LOGO: Visible "POP!" logo text
- FUNKO_TEXT: Visible "Funko" text anywhere
- NUMBER_BADGE: Circular number badge (usually top-right, shows #xxx)
- DISPLAY_WINDOW: Large clear plastic window showing figure
- CHARACTER_ILLUSTRATION: Character artwork on box
- CHARACTER_NAME: Character name printed on box
- VINYL_FIGURE_TEXT: "Vinyl Figure" or similar text

For LEGO_SET, check for:
- LEGO_LOGO: Visible LEGO logo
- SET_NUMBER: Set number visible
- PIECE_COUNT: Piece count visible

Return JSON only:
{
  "objectType": "FUNKO_POP",
  "isToy": true,
  "confidence": 0.95,
  "signals": {
    "POP_LOGO": true,
    "FUNKO_TEXT": true,
    "NUMBER_BADGE": true,
    "DISPLAY_WINDOW": true,
    "CHARACTER_ILLUSTRATION": true,
    "CHARACTER_NAME": true,
    "VINYL_FIGURE_TEXT": false
  },
  "reasoning": "Clear Funko Pop box with 6/7 signals detected"
}`
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl, detail: 'low' }
            }
          ]
        }
      ],
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      console.log('[Toy Pipeline Stage 1] Failed to parse response');
      return {
        objectType: ObjectType.GENERIC_COLLECTIBLE,
        confidence: 0.3,
        signals: [],
        isForced: false,
      };
    }

    const result = JSON.parse(jsonMatch[0]);
    
    // Not a toy - return early
    if (result.objectType === 'NOT_A_TOY' || result.isToy === false) {
      console.log('[Toy Pipeline Stage 1] Not a toy, skip toy pipeline');
      return {
        objectType: ObjectType.GENERIC_COLLECTIBLE,
        confidence: 0,
        signals: [],
        isForced: false,
      };
    }

    const detectedSignals: string[] = [];
    let signalCount = 0;

    if (result.signals) {
      for (const [signal, detected] of Object.entries(result.signals)) {
        if (detected === true) {
          detectedSignals.push(signal);
          signalCount++;
        }
      }
    }

    // DETERMINISTIC OVERRIDE: Force Funko Pop if 2+ key signals detected
    const hasFunkoKeySignal = result.signals?.POP_LOGO || result.signals?.FUNKO_TEXT || result.signals?.DISPLAY_WINDOW;
    const isFunkoForced = signalCount >= 2 && hasFunkoKeySignal;

    if (isFunkoForced) {
      console.log(`[Toy Pipeline Stage 1] DETERMINISTIC OVERRIDE: Funko Pop forced (${signalCount} signals: ${detectedSignals.join(', ')})`);
      return {
        objectType: ObjectType.FUNKO_POP,
        confidence: 0.95,
        signals: detectedSignals,
        isForced: true,
      };
    }

    // Check for LEGO deterministic signals
    const hasLegoKeySignal = result.signals?.LEGO_LOGO || result.signals?.SET_NUMBER;
    const legoSignalCount = [result.signals?.LEGO_LOGO, result.signals?.SET_NUMBER, result.signals?.PIECE_COUNT].filter(Boolean).length;
    if (legoSignalCount >= 2 && hasLegoKeySignal) {
      console.log(`[Toy Pipeline Stage 1] DETERMINISTIC OVERRIDE: LEGO Set forced`);
      return {
        objectType: ObjectType.LEGO_SET,
        confidence: 0.95,
        signals: detectedSignals,
        isForced: true,
      };
    }

    const objectType = (ObjectType as any)[result.objectType] || ObjectType.GENERIC_COLLECTIBLE;
    const confidence = Math.min(result.confidence || 0.5, 1.0);

    console.log(`[Toy Pipeline Stage 1] Classified as ${objectType} (${(confidence * 100).toFixed(0)}%)`);

    return {
      objectType,
      confidence,
      signals: detectedSignals,
      isForced: false,
    };

  } catch (error: any) {
    console.error('[Toy Pipeline Stage 1] Error:', error.message);
    return {
      objectType: ObjectType.GENERIC_COLLECTIBLE,
      confidence: 0.3,
      signals: [],
      isForced: false,
    };
  }
}

// STAGE 2: Franchise/Line Detection (for Toys)
export async function runToyStage2FranchiseDetection(
  imageBase64: string,
  stage1: PipelineStage1Result
): Promise<PipelineStage2Result> {
  console.log(`[Toy Pipeline Stage 2] Franchise Detection for ${stage1.objectType}...`);

  const imageUrl = imageBase64.startsWith('data:') 
    ? imageBase64 
    : `data:image/jpeg;base64,${imageBase64}`;

  let franchisePrompt = '';
  if (stage1.objectType === ObjectType.FUNKO_POP) {
    franchisePrompt = `For this Funko Pop, identify the FRANCHISE/LICENSE:
- Marvel, DC, Star Wars, Disney, Harry Potter, Anime, Movies, TV, Gaming, Sports, etc.
Look for franchise logos, character names, and license text on the box.`;
  } else if (stage1.objectType === ObjectType.LEGO_SET) {
    franchisePrompt = `For this LEGO set, identify the THEME:
- Star Wars, Marvel, City, Technic, Creator, Ideas, Architecture, etc.
Look for theme logos and set branding.`;
  }

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `TOY IDENTIFICATION - STAGE 2: Franchise/Line Detection

Toy Type: ${stage1.objectType}

${franchisePrompt}

Return JSON only:
{
  "franchise": "Marvel",
  "confidence": 0.90,
  "franchiseLocation": "Marvel logo visible on top of box"
}`
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl, detail: 'low' }
            }
          ]
        }
      ],
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return { brand: null, confidence: 0.3, compatibleWithObjectType: true };
    }

    const result = JSON.parse(jsonMatch[0]);
    const franchise = result.franchise || null;
    const confidence = Math.min(result.confidence || 0.5, 1.0);

    console.log(`[Toy Pipeline Stage 2] Franchise: ${franchise} (${(confidence * 100).toFixed(0)}%)`);

    return {
      brand: franchise,
      confidence,
      compatibleWithObjectType: true,
    };

  } catch (error: any) {
    console.error('[Toy Pipeline Stage 2] Error:', error.message);
    return { brand: null, confidence: 0.3, compatibleWithObjectType: true };
  }
}

// STAGE 3: Character/Item Name Detection
export async function runToyStage3CharacterDetection(
  imageBase64: string,
  stage1: PipelineStage1Result,
  stage2: PipelineStage2Result
): Promise<PipelineStage3Result> {
  console.log(`[Toy Pipeline Stage 3] Character/Item Name Detection...`);

  const imageUrl = imageBase64.startsWith('data:') 
    ? imageBase64 
    : `data:image/jpeg;base64,${imageBase64}`;

  let characterPrompt = '';
  if (stage1.objectType === ObjectType.FUNKO_POP) {
    characterPrompt = `For this Funko Pop (${stage2.brand || 'Unknown'} franchise):
Read the CHARACTER NAME from the box. This is usually printed on the front bottom.
Also read the POP NUMBER (e.g., #123) if visible.`;
  } else if (stage1.objectType === ObjectType.LEGO_SET) {
    characterPrompt = `For this LEGO set (${stage2.brand || 'Unknown'} theme):
Read the SET NAME and SET NUMBER from the box.`;
  }

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `TOY IDENTIFICATION - STAGE 3: Character/Item Name

${characterPrompt}

Return JSON only:
{
  "characterName": "Iron Man",
  "itemNumber": "#467",
  "variant": null,
  "confidence": 0.85
}`
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl, detail: 'low' }
            }
          ]
        }
      ],
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return { line: null, series: null, confidence: 0.3 };
    }

    const result = JSON.parse(jsonMatch[0]);
    console.log(`[Toy Pipeline Stage 3] Character: ${result.characterName}, Number: ${result.itemNumber} (${(result.confidence * 100).toFixed(0)}%)`);

    return {
      line: result.characterName || null,
      series: result.itemNumber || result.variant || null,
      confidence: Math.min(result.confidence || 0.5, 1.0),
    };

  } catch (error: any) {
    console.error('[Toy Pipeline Stage 3] Error:', error.message);
    return { line: null, series: null, confidence: 0.3 };
  }
}

// STAGE 4: Candidate Generation (search visual library)
export async function runToyStage4CandidateGeneration(
  imageBase64: string,
  stage1: PipelineStage1Result,
  stage2: PipelineStage2Result,
  stage3: PipelineStage3Result
): Promise<PipelineStage4Result> {
  console.log(`[Toy Pipeline Stage 4] Candidate Generation...`);

  // CRITICAL: Get locked brand from objectType - ONLY source of truth
  const lockedBrand = getLockedBrandFromObjectType(stage1.objectType);
  const franchise = stage2.brand; // This is franchise (Marvel, Star Wars), NOT product brand
  
  console.log(`[Toy Pipeline Stage 4] Using Locked Brand: ${lockedBrand}, Franchise: ${franchise}`);

  // Build search query using LOCKED BRAND (not stage2.brand which is franchise)
  const searchQuery = [
    lockedBrand,
    franchise,
    stage3.line,
    stage3.series
  ].filter(Boolean).join(' ');

  try {
    const { identifyWithVisualLibrary } = await import('./visual-matching');
    const visualResult = await identifyWithVisualLibrary(imageBase64, {
      fallbackToOpenAI: false,
      category: 'toy',
    });

    const candidates: PipelineStage4Result['candidates'] = [];

    if (visualResult.success && visualResult.candidate) {
      candidates.push({
        id: 'visual_match_1',
        title: visualResult.candidate.title,
        familyId: visualResult.candidate.familyId,
        confidence: visualResult.candidate.confidence || 0.5,
        keyIdentifiers: [lockedBrand, franchise, stage3.line, stage3.series].filter(Boolean) as string[],
      });

      // Add alternatives if available
      if (visualResult.candidate.topAlternatives) {
        for (let i = 0; i < Math.min(2, visualResult.candidate.topAlternatives.length); i++) {
          const alt = visualResult.candidate.topAlternatives[i];
          candidates.push({
            id: `visual_match_${i + 2}`,
            title: alt.family,
            confidence: alt.confidence,
            keyIdentifiers: [lockedBrand],
          });
        }
      }
    }

    // If no visual matches, create candidate from OCR data using LOCKED BRAND
    if (candidates.length === 0) {
      // Format: "Funko Pop - Marvel Iron Man #467" or "LEGO Star Wars UCS"
      const titleParts = [lockedBrand];
      if (stage1.objectType === 'FUNKO_POP') titleParts.push('Pop');
      if (franchise) titleParts.push('-', franchise);
      if (stage3.line) titleParts.push(stage3.line);
      if (stage3.series) titleParts.push(stage3.series);
      
      const title = titleParts.join(' ').replace('  ', ' ') || `${lockedBrand} Item`;
      candidates.push({
        id: 'ocr_match_1',
        title,
        confidence: Math.min(stage2.confidence, stage3.confidence),
        keyIdentifiers: [lockedBrand, franchise, stage3.line].filter(Boolean) as string[],
      });
    }

    const topConfidence = Math.max(...candidates.map(c => c.confidence), 0);
    console.log(`[Toy Pipeline Stage 4] Found ${candidates.length} candidates, top confidence: ${(topConfidence * 100).toFixed(0)}%`);

    return { candidates, topConfidence };

  } catch (error: any) {
    console.error('[Toy Pipeline Stage 4] Error:', error.message);
    return { candidates: [], topConfidence: 0 };
  }
}

// STAGE 5: Confidence Aggregation & UI Decision
export function runToyStage5ConfidenceAggregation(
  stage1: PipelineStage1Result,
  stage2: PipelineStage2Result,
  stage3: PipelineStage3Result,
  stage4: PipelineStage4Result
): PipelineStage5Result {
  console.log(`[Toy Pipeline Stage 5] Confidence Aggregation...`);

  // CRITICAL: Get locked brand from objectType - ONLY source of truth
  const lockedBrand = getLockedBrandFromObjectType(stage1.objectType);
  const franchise = stage2.brand; // This is franchise (Marvel, Star Wars), NOT product brand
  
  console.log(`[Toy Pipeline Stage 5] Locked Brand: ${lockedBrand}, Franchise: ${franchise}`);

  // CRITICAL: Item confidence cannot exceed the lowest upstream gate
  const aggregatedConfidence = Math.min(
    stage1.confidence,
    stage2.confidence,
    stage3.confidence,
    stage4.topConfidence
  );

  let confidenceTier: ConfidenceTier;
  let displayLabel: string;
  let canShowItemName: boolean;
  let canAutoConfirm: boolean;
  let requiresUserSelection: boolean;

  if (aggregatedConfidence < CONFIDENCE_THRESHOLDS.LOW_MAX) {
    // <60%: Generic label only, manual entry required
    confidenceTier = ConfidenceTier.LOW;
    displayLabel = getToyGenericLabel(stage1.objectType);
    canShowItemName = false;
    canAutoConfirm = false;
    requiresUserSelection = true;
  } else if (aggregatedConfidence < CONFIDENCE_THRESHOLDS.MEDIUM_MAX) {
    // 60-79%: Type + franchise only, no item names
    // Format: "Funko Pop - Marvel" or "LEGO Set - Star Wars"
    confidenceTier = ConfidenceTier.MEDIUM;
    displayLabel = franchise 
      ? `${lockedBrand} ${getToyTypeLabel(stage1.objectType)} - ${franchise}`
      : `${lockedBrand} ${getToyTypeLabel(stage1.objectType)}`;
    canShowItemName = false;
    canAutoConfirm = false;
    requiresUserSelection = true;
  } else if (aggregatedConfidence < CONFIDENCE_THRESHOLDS.HIGH_MAX) {
    // 80-89%: Show candidates with "Select the correct item"
    confidenceTier = ConfidenceTier.HIGH;
    displayLabel = stage4.candidates[0]?.title || getToyGenericLabel(stage1.objectType);
    canShowItemName = true;
    canAutoConfirm = false;
    requiresUserSelection = true;
  } else {
    // >=90%: Auto-confirm single item
    confidenceTier = ConfidenceTier.CONFIRMED;
    displayLabel = stage4.candidates[0]?.title || getToyGenericLabel(stage1.objectType);
    canShowItemName = true;
    canAutoConfirm = true;
    requiresUserSelection = false;
  }

  console.log(`[Toy Pipeline Stage 5] Tier: ${confidenceTier}, Confidence: ${(aggregatedConfidence * 100).toFixed(0)}%`);
  console.log(`[Toy Pipeline Stage 5] Display: "${displayLabel}", canShowItemName: ${canShowItemName}, autoConfirm: ${canAutoConfirm}`);

  return {
    aggregatedConfidence,
    confidenceTier,
    displayLabel,
    canShowItemName,
    canAutoConfirm,
    requiresUserSelection,
  };
}

function getToyGenericLabel(objectType: string): string {
  const labels: Record<string, string> = {
    FUNKO_POP: 'Collectible Figure',
    LEGO_SET: 'Building Set',
  };
  return labels[objectType] || 'Collectible Toy';
}

function getToyTypeLabel(objectType: string): string {
  const labels: Record<string, string> = {
    FUNKO_POP: 'Pop Figure',
    LEGO_SET: 'LEGO Set',
  };
  return labels[objectType] || 'Toy';
}

// MAIN: Run full 5-stage pipeline for Toys
export async function runToyIdentificationPipeline(
  imageBase64: string
): Promise<IdentificationPipelineResult> {
  console.log('[Toy Pipeline] ========== STARTING 5-STAGE TOY IDENTIFICATION ==========');
  const startTime = Date.now();

  // Stage 1: Toy-Type Classification (HARD GATE)
  const stage1 = await runToyStage1Detection(imageBase64);

  // If not a toy or very low confidence, abort pipeline
  if (stage1.confidence === 0 || stage1.objectType === ObjectType.GENERIC_COLLECTIBLE) {
    console.log('[Toy Pipeline] Not a toy or failed Stage 1, aborting');
    return createNotToyResult(stage1);
  }

  if (stage1.confidence < 0.3) {
    console.log('[Toy Pipeline] Stage 1 confidence too low, aborting');
    return createFailedPipelineResult(stage1);
  }

  // Stage 2: Franchise/Line Detection
  const stage2 = await runToyStage2FranchiseDetection(imageBase64, stage1);

  // Stage 3: Character/Item Name Detection
  const stage3 = await runToyStage3CharacterDetection(imageBase64, stage1, stage2);

  // Stage 4: Candidate Generation
  const stage4 = await runToyStage4CandidateGeneration(imageBase64, stage1, stage2, stage3);

  // Stage 5: Confidence Aggregation
  const stage5 = runToyStage5ConfidenceAggregation(stage1, stage2, stage3, stage4);

  const duration = Date.now() - startTime;
  console.log(`[Toy Pipeline] ========== PIPELINE COMPLETE (${duration}ms) ==========`);
  console.log(`[Toy Pipeline] Result: ${stage5.displayLabel} | Tier: ${stage5.confidenceTier} | Confidence: ${(stage5.aggregatedConfidence * 100).toFixed(0)}%`);

  return {
    stage1,
    stage2,
    stage3,
    stage4,
    stage5,
    finalConfidence: stage5.aggregatedConfidence,
    pipelineLocked: stage1.confidence >= 0.6,
  };
}

function createNotToyResult(stage1: PipelineStage1Result): IdentificationPipelineResult {
  return {
    stage1,
    stage2: { brand: null, confidence: 0, compatibleWithObjectType: true },
    stage3: { line: null, series: null, confidence: 0 },
    stage4: { candidates: [], topConfidence: 0 },
    stage5: {
      aggregatedConfidence: 0,
      confidenceTier: ConfidenceTier.LOW,
      displayLabel: 'Not a Toy',
      canShowItemName: false,
      canAutoConfirm: false,
      requiresUserSelection: false,
    },
    finalConfidence: 0,
    pipelineLocked: false,
  };
}

function createFailedPipelineResult(stage1: PipelineStage1Result): IdentificationPipelineResult {
  return {
    stage1,
    stage2: { brand: null, confidence: 0, compatibleWithObjectType: true },
    stage3: { line: null, series: null, confidence: 0 },
    stage4: { candidates: [], topConfidence: 0 },
    stage5: {
      aggregatedConfidence: 0,
      confidenceTier: ConfidenceTier.LOW,
      displayLabel: 'Unknown Item',
      canShowItemName: false,
      canAutoConfirm: false,
      requiresUserSelection: true,
    },
    finalConfidence: 0,
    pipelineLocked: false,
  };
}

export function getCategoryFromObjectType(objectType: string): string {
  const mapping: Record<string, string> = {
    FUNKO_POP: 'toy',
    LEGO_SET: 'toy',
  };
  return mapping[objectType] || 'antique';
}
