/**
 * Grading Readiness Assessment Module
 * 
 * Provides conservative, visual-only assessment of whether a raw card
 * appears suitable for professional grading. This is informational only
 * and does not predict grading outcomes.
 */

export type GradingReadinessLevel = 'high' | 'medium' | 'low';

export interface ConditionFactor {
  name: string;
  assessment: 'good' | 'fair' | 'concern';
  notes: string;
}

export interface DefectLocation {
  area: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-edge' | 'bottom-edge' | 'left-edge' | 'right-edge' | 'center' | 'surface';
  issue: string;
  severity: 'minor' | 'moderate' | 'major';
}

export type ConditionTier = 'gem-candidate' | 'high-grade' | 'mid-grade' | 'low-grade';

export interface ConditionAssessment {
  tier: ConditionTier;
  description: string;
  submissionAdvice: string;
}

export interface ROICalculation {
  rawValue: number;
  gradedValueLow: number;
  gradedValueHigh: number;
  gradingCost: number;
  profitPotentialLow: number;
  profitPotentialHigh: number;
  recommendation: 'grade' | 'keep-raw' | 'borderline';
  reasoning: string;
}

export interface GradingReadinessResult {
  readinessLevel: GradingReadinessLevel;
  summary: string;
  factors: ConditionFactor[];
  defectLocations?: DefectLocation[];
  conditionTier?: ConditionAssessment;
  roi?: ROICalculation;
  disclaimer: string;
}

export const GRADING_READINESS_DISCLAIMER = 
  "IMPORTANT: This is a visual assessment only. PSA grading is highly subjective and inconsistent - the same card can receive different grades from different graders or even the same grader on different days. Surface imperfections, print defects, and handling marks invisible in photos can drastically affect outcomes. This tool identifies visible condition factors to help you make informed decisions, but CANNOT predict grades. Use this as one data point among many, not as a guarantee of any outcome.";

export const CONDITION_FACTORS = [
  'centering',
  'corners', 
  'edges',
  'surface'
] as const;

export type ConditionFactorType = typeof CONDITION_FACTORS[number];

export function getReadinessLabel(level: GradingReadinessLevel): string {
  switch (level) {
    case 'high':
      return 'High Grading Readiness';
    case 'medium':
      return 'Medium Grading Readiness';
    case 'low':
      return 'Low Grading Readiness';
  }
}

export function getReadinessDescription(level: GradingReadinessLevel): string {
  switch (level) {
    case 'high':
      return 'Based on visible evidence, this card appears well-suited for professional grading consideration.';
    case 'medium':
      return 'Based on visible evidence, this card shows some factors that may affect grading outcomes.';
    case 'low':
      return 'Based on visible evidence, this card shows visible concerns that suggest professional grading may not be cost-effective.';
  }
}

export function getReadinessColor(level: GradingReadinessLevel): string {
  switch (level) {
    case 'high':
      return 'text-green-600 dark:text-green-400';
    case 'medium':
      return 'text-amber-600 dark:text-amber-400';
    case 'low':
      return 'text-red-600 dark:text-red-400';
  }
}

export function getReadinessBgColor(level: GradingReadinessLevel): string {
  switch (level) {
    case 'high':
      return 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800';
    case 'medium':
      return 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800';
    case 'low':
      return 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800';
  }
}

export function getFactorIcon(assessment: 'good' | 'fair' | 'concern'): string {
  switch (assessment) {
    case 'good':
      return '●';
    case 'fair':
      return '◐';
    case 'concern':
      return '○';
  }
}

export function getFactorColor(assessment: 'good' | 'fair' | 'concern'): string {
  switch (assessment) {
    case 'good':
      return 'text-green-600 dark:text-green-400';
    case 'fair':
      return 'text-amber-600 dark:text-amber-400';
    case 'concern':
      return 'text-red-600 dark:text-red-400';
  }
}

// PSA Grading Cost Tiers (as of 2024)
export const PSA_PRICING = {
  value: { name: 'Value', cost: 25, maxDeclaredValue: 499, turnaround: '65 business days' },
  regular: { name: 'Regular', cost: 50, maxDeclaredValue: 999, turnaround: '30 business days' },
  express: { name: 'Express', cost: 100, maxDeclaredValue: 2499, turnaround: '10 business days' },
  super: { name: 'Super Express', cost: 200, maxDeclaredValue: 4999, turnaround: '5 business days' },
  walkthrough: { name: 'Walkthrough', cost: 600, maxDeclaredValue: null, turnaround: '1 business day' },
} as const;

// Graded value multipliers by grade (rough industry averages)
export const GRADE_VALUE_MULTIPLIERS: Record<number, { low: number; high: number }> = {
  10: { low: 3.0, high: 10.0 },   // Gem Mint: 3-10x raw
  9: { low: 1.5, high: 3.0 },     // Mint: 1.5-3x raw
  8: { low: 1.0, high: 1.5 },     // NM-MT: 1-1.5x raw
  7: { low: 0.7, high: 1.0 },     // NM: 0.7-1x raw
  6: { low: 0.5, high: 0.7 },     // EX-MT: 0.5-0.7x raw
};

/**
 * Calculate ROI for grading based on raw value and estimated grade
 */
export function calculateGradingROI(
  rawValue: number,
  estimatedGradeLow: number,
  estimatedGradeHigh: number
): ROICalculation {
  // Determine appropriate PSA tier based on potential value
  const potentialMaxValue = rawValue * (GRADE_VALUE_MULTIPLIERS[estimatedGradeHigh]?.high || 1);
  let gradingCost: number = PSA_PRICING.value.cost;
  
  if (potentialMaxValue > 4999) gradingCost = PSA_PRICING.walkthrough.cost;
  else if (potentialMaxValue > 2499) gradingCost = PSA_PRICING.super.cost;
  else if (potentialMaxValue > 999) gradingCost = PSA_PRICING.express.cost;
  else if (potentialMaxValue > 499) gradingCost = PSA_PRICING.regular.cost;
  
  const lowMultiplier = GRADE_VALUE_MULTIPLIERS[estimatedGradeLow] || { low: 0.5, high: 0.7 };
  const highMultiplier = GRADE_VALUE_MULTIPLIERS[estimatedGradeHigh] || { low: 1.5, high: 3.0 };
  
  const gradedValueLow = Math.round(rawValue * lowMultiplier.low);
  const gradedValueHigh = Math.round(rawValue * highMultiplier.high);
  
  const profitPotentialLow = gradedValueLow - rawValue - gradingCost;
  const profitPotentialHigh = gradedValueHigh - rawValue - gradingCost;
  
  let recommendation: 'grade' | 'keep-raw' | 'borderline';
  let reasoning: string;
  
  if (profitPotentialLow > 0) {
    recommendation = 'grade';
    reasoning = `Even at the low end (grade ${estimatedGradeLow}), grading could net +$${profitPotentialLow}. High upside of +$${profitPotentialHigh} at grade ${estimatedGradeHigh}.`;
  } else if (profitPotentialHigh > 50) {
    recommendation = 'borderline';
    reasoning = `Risk/reward is mixed. Could lose $${Math.abs(profitPotentialLow)} if grade ${estimatedGradeLow}, but gain +$${profitPotentialHigh} if grade ${estimatedGradeHigh}.`;
  } else {
    recommendation = 'keep-raw';
    reasoning = `Grading cost of $${gradingCost} likely exceeds value gain. Better to sell raw or hold for now.`;
  }
  
  return {
    rawValue,
    gradedValueLow,
    gradedValueHigh,
    gradingCost,
    profitPotentialLow,
    profitPotentialHigh,
    recommendation,
    reasoning,
  };
}

// Valid area codes for defect locations
const VALID_AREA_CODES = [
  'top-left', 'top-right', 'bottom-left', 'bottom-right',
  'top-edge', 'bottom-edge', 'left-edge', 'right-edge',
  'center', 'surface'
] as const;

const VALID_SEVERITIES = ['minor', 'moderate', 'major'] as const;
const VALID_ASSESSMENTS = ['good', 'fair', 'concern'] as const;
const VALID_CONDITION_TIERS = ['gem-candidate', 'high-grade', 'mid-grade', 'low-grade'] as const;
const VALID_READINESS_LEVELS = ['high', 'medium', 'low'] as const;

/**
 * Validate and sanitize the AI grading response
 * Ensures all fields are properly typed and within expected bounds
 */
export function validateGradingResponse(raw: any): Omit<GradingReadinessResult, 'roi' | 'disclaimer'> {
  const result: Omit<GradingReadinessResult, 'roi' | 'disclaimer'> = {
    readinessLevel: 'medium',
    summary: '',
    factors: [],
  };
  
  // Validate readinessLevel
  if (raw.readinessLevel && VALID_READINESS_LEVELS.includes(raw.readinessLevel)) {
    result.readinessLevel = raw.readinessLevel;
  }
  
  // Validate summary
  if (typeof raw.summary === 'string' && raw.summary.length > 0 && raw.summary.length < 500) {
    result.summary = raw.summary;
  } else {
    result.summary = 'Visual assessment completed.';
  }
  
  // Validate factors
  if (Array.isArray(raw.factors)) {
    result.factors = raw.factors
      .filter((f: any) => 
        typeof f === 'object' &&
        typeof f.name === 'string' &&
        VALID_ASSESSMENTS.includes(f.assessment)
      )
      .map((f: any) => ({
        name: String(f.name).slice(0, 50),
        assessment: f.assessment as 'good' | 'fair' | 'concern',
        notes: typeof f.notes === 'string' ? f.notes.slice(0, 200) : '',
      }));
  }
  
  // Validate defectLocations
  if (Array.isArray(raw.defectLocations) && raw.defectLocations.length > 0) {
    const validDefects = raw.defectLocations
      .filter((d: any) =>
        typeof d === 'object' &&
        VALID_AREA_CODES.includes(d.area) &&
        VALID_SEVERITIES.includes(d.severity)
      )
      .map((d: any) => ({
        area: d.area as DefectLocation['area'],
        issue: typeof d.issue === 'string' ? d.issue.slice(0, 100) : 'Defect noted',
        severity: d.severity as 'minor' | 'moderate' | 'major',
      }));
    
    if (validDefects.length > 0) {
      result.defectLocations = validDefects;
    }
  }
  
  // Validate conditionTier
  if (raw.conditionTier && typeof raw.conditionTier === 'object') {
    if (VALID_CONDITION_TIERS.includes(raw.conditionTier.tier)) {
      result.conditionTier = {
        tier: raw.conditionTier.tier as ConditionTier,
        description: typeof raw.conditionTier.description === 'string' 
          ? raw.conditionTier.description.slice(0, 200) 
          : 'Condition assessment based on visible factors.',
        submissionAdvice: typeof raw.conditionTier.submissionAdvice === 'string'
          ? raw.conditionTier.submissionAdvice.slice(0, 300)
          : 'Consider all factors before submitting for grading.',
      };
    }
  }
  
  return result;
}

/**
 * Build the AI prompt for grading readiness assessment
 */
export function buildGradingReadinessPrompt(): string {
  return `You are a conservative card condition assessor. Analyze the provided card images (front and/or back) and assess the card's visual condition for grading readiness.

IMPORTANT RULES:
- Be intentionally conservative and downside-biased
- Never imply gem-mint outcomes or guaranteed results
- Focus only on what is VISIBLE in the images
- Acknowledge limitations of photo-based assessment

Assess these four condition factors:
1. CENTERING - Is the card visibly off-center? Check borders on all sides.
2. CORNERS - Are corners sharp, slightly soft, or visibly worn/damaged?
3. EDGES - Are edges clean or show whitening, chips, or damage?
4. SURFACE - Any visible scratches, print defects, staining, or creases?

For each factor, provide:
- assessment: "good" (no visible concerns), "fair" (minor visible concerns), or "concern" (clear visible issues)
- notes: Brief explanation tied to what you see (1 sentence max)

DEFECT LOCATIONS: Identify specific areas where defects are visible. Use these area codes:
- "top-left", "top-right", "bottom-left", "bottom-right" for corners
- "top-edge", "bottom-edge", "left-edge", "right-edge" for edges
- "center", "surface" for surface issues

CONDITION TIER (NOT a grade prediction - PSA is notoriously inconsistent):
- "gem-candidate": Appears flawless in photos - sharp corners, perfect centering, clean surfaces. BUT photo assessment is very limited.
- "high-grade": Shows minimal visible issues but could have hidden flaws. May grade well but no guarantees.
- "mid-grade": Visible wear or issues that will likely affect grading. Still worth submitting for valuable cards.
- "low-grade": Significant visible defects. Only submit if raw value is already low.

IMPORTANT: Do NOT predict specific grades. PSA grading is subjective and the same card can receive wildly different grades.

Then determine overall readinessLevel:
- "high": Visible factors look promising for submission
- "medium": Some visible concerns but may still be worth submitting
- "low": Visible issues suggest grading may not add value

Respond in this exact JSON format:
{
  "readinessLevel": "high" | "medium" | "low",
  "summary": "Brief 1-2 sentence summary of what you can see (not a grade prediction)",
  "factors": [
    { "name": "Centering", "assessment": "good|fair|concern", "notes": "..." },
    { "name": "Corners", "assessment": "good|fair|concern", "notes": "..." },
    { "name": "Edges", "assessment": "good|fair|concern", "notes": "..." },
    { "name": "Surface", "assessment": "good|fair|concern", "notes": "..." }
  ],
  "defectLocations": [
    { "area": "area-code", "issue": "brief description", "severity": "minor|moderate|major" }
  ],
  "conditionTier": {
    "tier": "gem-candidate|high-grade|mid-grade|low-grade",
    "description": "What visible factors led to this tier",
    "submissionAdvice": "Practical advice about whether to submit, keeping in mind PSA's inconsistency"
  }
}`;
}
