/**
 * PSA (Professional Sports Authenticator) Public API Integration
 * 
 * Provides cert verification and graded card data lookup.
 * Free tier: 100 API calls/day
 * 
 * API Docs: https://www.psacard.com/publicapi/documentation
 * Swagger: https://api.psacard.com/publicapi/swagger
 */

const PSA_API_BASE = 'https://api.psacard.com/publicapi';

export interface PSACertData {
  PSACert: {
    CertNumber: string;
    Brand: string;
    Year: string;
    CardNumber: string;
    Subject: string;
    Variety: string;
    Grade: string;
    GradeDescription: string;
    CardGrade: string;
    TotalPopulation: number;
    PopulationHigher: number;
    LabelType: string;
    ReverseBarCode: string;
    SpecID: number;
    SpecNumber: string;
    IsDualCert: boolean;
    IsPSADNA: boolean;
  };
  IsValidRequest: boolean;
  ServerMessage: string;
}

export interface PSALookupResult {
  success: boolean;
  data?: {
    certNumber: string;
    brand: string;
    year: string;
    cardNumber: string;
    subject: string;
    variety: string;
    grade: string;
    gradeDescription: string;
    population: number;
    populationHigher: number;
    labelType: string;
    specNumber: string;
  };
  error?: string;
  message?: string;
}

let requestCount = 0;
let requestResetTime = Date.now() + 24 * 60 * 60 * 1000;

function checkRateLimit(): boolean {
  const now = Date.now();
  if (now > requestResetTime) {
    requestCount = 0;
    requestResetTime = now + 24 * 60 * 60 * 1000;
  }
  return requestCount < 100;
}

export function isPSAConfigured(): boolean {
  return !!process.env.PSA_API_TOKEN;
}

export function getPSAStatus(): { configured: boolean; remainingCalls: number } {
  return {
    configured: isPSAConfigured(),
    remainingCalls: Math.max(0, 100 - requestCount)
  };
}

export async function lookupPSACert(certNumber: string): Promise<PSALookupResult> {
  const token = process.env.PSA_API_TOKEN;
  
  if (!token) {
    return {
      success: false,
      error: 'PSA_NOT_CONFIGURED',
      message: 'PSA API token not configured. Register at psacard.com/publicapi for a free API key.'
    };
  }

  const cleanCertNumber = certNumber.replace(/\D/g, '');
  
  if (!cleanCertNumber || cleanCertNumber.length < 6) {
    return {
      success: false,
      error: 'INVALID_CERT_NUMBER',
      message: 'Invalid cert number. Must be at least 6 digits.'
    };
  }

  if (!checkRateLimit()) {
    return {
      success: false,
      error: 'RATE_LIMITED',
      message: 'PSA API daily limit reached (100 calls/day). Resets at midnight.'
    };
  }

  try {
    requestCount++;
    
    const response = await fetch(`${PSA_API_BASE}/cert/GetByCertNumber/${cleanCertNumber}`, {
      method: 'GET',
      headers: {
        'Authorization': `bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          error: 'AUTH_FAILED',
          message: 'PSA API authentication failed. Check your API token.'
        };
      }
      return {
        success: false,
        error: 'API_ERROR',
        message: `PSA API returned status ${response.status}`
      };
    }

    const data: PSACertData = await response.json();

    if (!data.IsValidRequest) {
      return {
        success: false,
        error: 'INVALID_REQUEST',
        message: data.ServerMessage || 'Invalid request to PSA API'
      };
    }

    if (data.ServerMessage === 'No data found' || !data.PSACert) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: `No PSA cert found for number ${cleanCertNumber}`
      };
    }

    const cert = data.PSACert;
    
    return {
      success: true,
      data: {
        certNumber: cert.CertNumber,
        brand: cert.Brand,
        year: cert.Year,
        cardNumber: cert.CardNumber,
        subject: cert.Subject,
        variety: cert.Variety || '',
        grade: cert.Grade,
        gradeDescription: cert.GradeDescription,
        population: cert.TotalPopulation,
        populationHigher: cert.PopulationHigher,
        labelType: cert.LabelType,
        specNumber: cert.SpecNumber
      }
    };
  } catch (err: any) {
    console.error('[PSA API] Lookup error:', err);
    return {
      success: false,
      error: 'NETWORK_ERROR',
      message: err.message || 'Failed to connect to PSA API'
    };
  }
}

export function formatPSAGrade(grade: string): string {
  const gradeNum = parseFloat(grade);
  if (isNaN(gradeNum)) return grade;
  
  const gradeLabels: Record<number, string> = {
    10: 'Gem Mint',
    9: 'Mint',
    8: 'Near Mint-Mint',
    7: 'Near Mint',
    6: 'Excellent-Mint',
    5: 'Excellent',
    4: 'Very Good-Excellent',
    3: 'Very Good',
    2: 'Good',
    1.5: 'Fair',
    1: 'Poor'
  };
  
  return gradeLabels[gradeNum] || grade;
}

export function estimateGradePremium(grade: string, basePrice: number): number {
  const gradeNum = parseFloat(grade);
  if (isNaN(gradeNum)) return basePrice;
  
  const premiumMultipliers: Record<number, number> = {
    10: 3.5,
    9.5: 2.2,
    9: 1.5,
    8.5: 1.25,
    8: 1.1,
    7: 1.0,
    6: 0.85,
    5: 0.7,
    4: 0.55,
    3: 0.4,
    2: 0.25,
    1: 0.15
  };
  
  const multiplier = premiumMultipliers[gradeNum] || 1.0;
  return Math.round(basePrice * multiplier * 100) / 100;
}
