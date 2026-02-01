import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import { syncPrintfulProducts, submitOrderToPrintful, createPrintfulClient } from "./printful";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, hashPassword, comparePasswords } from "./auth";
import { api } from "@shared/routes";
import { setupWebSocket } from "./websocket";
import { PLATFORM_FEE_RATE, OUTBOUND_SHIPPING_DEFAULT, parseShipping } from "@shared/calculations";
import { getCategoryFeeRate, getCategoryFeeMultiplier, getShippingAllowance } from "@shared/pricingEngine";
import { z } from "zod";
import { db } from "./db";
import { users, items, mysteryFlips, mysteryFlipVotes, priceAlerts, brands, brandItems, shopProducts, shopOrders, gamingFamilies, gamingImages, antiqueFamilies, antiqueImages, electronicsFamilies, electronicsImages, toyFamilies, toyImages, userCorrections, watchFamilies as watchFamiliesTable, userAchievements, userStats, profitGoals, AchievementType, pushSubscriptions } from "@shared/schema";
import { saveSubscription, removeSubscription, getVapidPublicKey, isPushEnabled } from "./push-service";
import { eq, and, sql, desc } from "drizzle-orm";
import OpenAI from "openai";
import type { SoldComp, CompsResult } from "@shared/schema";
import { cache, cacheKeys } from "./cache-service";
import { AppError, ErrorCode, toAppError } from "./error-handling";
import { callEbayWithRetry, callStripeWithRetry, withTimeout } from "./retry-strategy";
import { trackApiCall, monitoring } from "./monitoring";
import { logCompsRequest } from "./comps-logger";
import { parseCardTitle, getParallelsForCard, isSportsCardCategory } from "@shared/cardParallels";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { 
  fetchCompsWithFallback,
  fetchCompsByCondition,
  getApiStatus as getEbayApiStatus,
  buildEbaySearchUrl,
  // fetchBrowseAPIWithSignals - REMOVED: Browse API uses active listings, not sold data
  getAccessToken as getEbayOAuthToken,
  fetchItemById
} from "./ebay-api";
import {
  getChrono24WatchPricing,
  buildChrono24SearchUrl,
  extractWatchBrand,
  isChrono24Configured
} from "./chrono24-api";
import {
  identifyCard as ximilarIdentifyCard,
  gradeCard as ximilarGradeCard,
  analyzeCardCentering as ximilarCardCentering,
  analyzeCardFull as ximilarFullAnalysis
} from "./ximilar-api";
import { soldListingsProvider, type UserSelectableListing } from "./sold-listings-provider";
import { 
  calculateDecision,
  type DecisionInput,
  type DecisionResult
} from "@shared/decisionEngine";
import {
  executeCardPipeline,
  shouldUseCardPipeline,
  resolveCardIdentity,
  buildPriceTruth,
  type CardScanInput,
} from "./cardPipeline";
import type { CardAnalysisResult } from "@shared/cardDecisionEngine";
import {
  processComps,
  getCategoryCeiling,
  applySanityClamp,
  normalizeResaleRange,
  HIGH_CONFIDENCE_MIN_COMPS,
  HIGH_CONFIDENCE_MAX_CV,
  HIGH_CONFIDENCE_MAX_SPREAD,
  CATEGORY_PRICE_CEILINGS,
  type ConfidenceLevel,
  type DisplayMode
} from "@shared/pricingEngine";
import {
  watchBrands,
  watchFamilies,
  getBandSuggestions,
  getSuggestedMovementType,
  type WatchBrandId
} from "@shared/watchLibrary";
import { matchVehicleToLibrary } from "@shared/vehicleLibrary";
import { matchMarvelToLibrary } from "@shared/marvelLibrary";
import { getWatchSeedReport, populateQueueFromSeedFile, runSeederWorker } from "./watch-seeder-worker";
import { runEbayImageSeeder, getEbaySeederReport } from "./ebay-image-seeder";
import { runShoeImageSeeder, getShoeSeederReport } from "./shoe-image-seeder";
import { identifyWithVisualLibrary, addLibraryImage, addUserScanToVisualLibrary, learnNewItem, type VisualIdentifyCandidate, type MatchStrength } from "./visual-matching";
import { runGameImageSeeder, getGameSeederReport } from "./game-image-seeder";
import { runToolImageSeeder, getToolSeederReport } from "./tool-image-seeder";
import { runHandbagImageSeeder, getHandbagSeederReport } from "./handbag-image-seeder";
import { runAntiqueImageSeeder, getAntiqueSeederReport } from "./antique-image-seeder";
import { runGamingImageSeeder, getGamingSeederReport } from "./gaming-image-seeder";
import { getCategoryStatuses, turboActivateAll, resetHardFamilies, printSeedingStatus } from "./turbo-seeder";
import { filterComps } from "./comp-filter";
import { lookupPSACert, isPSAConfigured, getPSAStatus, formatPSAGrade, estimateGradePremium } from "./psa-api";

// Valid categories for the API - normalize any AI-detected categories to these values
const VALID_CATEGORIES = ['Collectibles', 'Shoes', 'Watches', 'Trading Cards', 'Electronics', 'Other'] as const;
type ValidCategory = typeof VALID_CATEGORIES[number];

/**
 * Normalize AI-detected categories to valid enum values.
 * Maps non-standard categories like "Gaming", "Toys" to the closest valid category.
 */
function normalizeCategory(category: string | null | undefined): ValidCategory {
  if (!category) return 'Other';
  
  const normalized = category.toLowerCase().trim();
  
  // Direct matches
  if (normalized === 'shoes') return 'Shoes';
  if (normalized === 'watches' || normalized === 'watch') return 'Watches';
  if (normalized === 'trading cards' || normalized === 'cards' || normalized === 'sports cards') return 'Trading Cards';
  if (normalized === 'electronics' || normalized === 'electronic') return 'Electronics';
  if (normalized === 'collectibles' || normalized === 'collectible') return 'Collectibles';
  
  // Category mappings for non-standard categories
  if (normalized === 'gaming' || normalized === 'video games' || normalized === 'games') return 'Electronics';
  if (normalized === 'toys' || normalized === 'toy' || normalized === 'funko' || normalized === 'lego') return 'Collectibles';
  if (normalized === 'clothing' || normalized === 'apparel' || normalized === 'fashion') return 'Other';
  if (normalized === 'tools' || normalized === 'tool') return 'Other';
  if (normalized === 'antiques' || normalized === 'antique' || normalized === 'vintage') return 'Collectibles';
  if (normalized === 'handbags' || normalized === 'bags' || normalized === 'purses') return 'Other';
  
  return 'Other';
}

/**
 * Match detected brand against the brand library database.
 * Returns brand info if a match is found.
 */
async function matchBrandLibrary(brandDetected: string | null, category: string, title: string, keyIdentifiers: string[]): Promise<{
  brandName: string | null;
  brandSlug: string | null;
  brandCategory: string | null;
  matchConfidence: number;
} | null> {
  if (!brandDetected && !title) return null;
  
  const searchText = (brandDetected || '').toLowerCase() + ' ' + title.toLowerCase() + ' ' + keyIdentifiers.join(' ').toLowerCase();
  
  // Map our categories to brand library categories
  const categoryMap: Record<string, string> = {
    'shoes': 'shoes',
    'tools': 'tools',
    'electronics': 'electronics',
    'gaming': 'gaming',
    'apparel': 'apparel',
  };
  
  const brandCategory = categoryMap[category.toLowerCase()];
  if (!brandCategory) return null;
  
  try {
    // Fetch brands from the category
    const categoryBrands = await db.select().from(brands).where(eq(brands.category, brandCategory));
    
    let bestMatch: { brand: typeof categoryBrands[0]; score: number } | null = null;
    
    for (const brand of categoryBrands) {
      let score = 0;
      
      // Check brand name
      if (searchText.includes(brand.name.toLowerCase())) {
        score += 60;
      }
      
      // Check aliases
      if (brand.aliases) {
        for (const alias of brand.aliases) {
          if (searchText.includes(alias.toLowerCase())) {
            score += 50;
            break;
          }
        }
      }
      
      // Check keywords
      if (brand.keywords) {
        for (const keyword of brand.keywords) {
          if (searchText.includes(keyword.toLowerCase())) {
            score += 10;
          }
        }
      }
      
      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { brand, score };
      }
    }
    
    if (bestMatch && bestMatch.score >= 50) {
      return {
        brandName: bestMatch.brand.name,
        brandSlug: bestMatch.brand.slug,
        brandCategory: bestMatch.brand.category,
        matchConfidence: Math.min(100, bestMatch.score),
      };
    }
    
    return null;
  } catch (err) {
    console.error("Brand library match error:", err);
    return null;
  }
}

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

/**
 * Match vision-detected watch details against the watch library.
 * Uses text similarity matching to find best brand/family match.
 * Returns watch metadata with suggested brand, family, band type.
 */
function matchWatchToLibrary(title: string, keyIdentifiers: string[]): {
  watchBrand: string | null;
  watchFamily: string | null;
  watchBandType: string | null;
  watchMovementType: string | null;
  matchConfidence: number;
  topMatches: { brand: string; family: string; score: number }[];
} {
  const combined = (title + ' ' + keyIdentifiers.join(' ')).toLowerCase();
  
  interface Match {
    brand: string;
    brandId: string;
    family: string;
    familyId: string;
    score: number;
  }
  
  const matches: Match[] = [];
  
  // Score each brand/family combination against the detected text
  for (const brand of watchBrands) {
    const brandName = brand.name.toLowerCase();
    const brandId = brand.id;
    
    // Check if brand name appears in the text
    let brandScore = 0;
    if (combined.includes(brandName)) {
      brandScore = 50; // Base score for brand match
    } else if (combined.includes(brandName.replace(/[^a-z]/g, ''))) {
      brandScore = 40; // Partial match (without special chars)
    }
    
    if (brandScore > 0) {
      // Check family matches for this brand
      const families = watchFamilies[brandId as WatchBrandId] || [];
      
      for (const family of families) {
        const familyName = family.name.toLowerCase();
        const familyId = family.id;
        
        let familyScore = 0;
        
        // Check for family name in text (handle multi-word names)
        const familyWords = familyName.split(/[\s-]+/).filter(w => w.length > 2);
        const matchedWords = familyWords.filter(word => combined.includes(word));
        
        if (matchedWords.length === familyWords.length && familyWords.length > 0) {
          familyScore = 40; // Full family match
        } else if (matchedWords.length > 0) {
          familyScore = 20 * (matchedWords.length / familyWords.length); // Partial match
        }
        
        // Also check for family ID patterns (e.g., "prx", "submariner")
        if (combined.includes(familyId.replace(/_/g, ' ')) || combined.includes(familyId.replace(/_/g, ''))) {
          familyScore = Math.max(familyScore, 35);
        }
        
        const totalScore = brandScore + familyScore;
        if (totalScore > 0) {
          matches.push({
            brand: brand.name,
            brandId,
            family: family.name,
            familyId,
            score: totalScore,
          });
        }
      }
      
      // Also add brand-only match if no families matched well
      const hasGoodFamilyMatch = matches.some(m => m.brandId === brandId && m.score > brandScore + 10);
      if (!hasGoodFamilyMatch && brandScore > 0) {
        matches.push({
          brand: brand.name,
          brandId,
          family: '',
          familyId: '',
          score: brandScore,
        });
      }
    }
  }
  
  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);
  
  // Get top match
  const topMatch = matches[0] || null;
  const topMatches = matches.slice(0, 5).map(m => ({
    brand: m.brand,
    family: m.family,
    score: m.score,
  }));
  
  if (!topMatch) {
    return {
      watchBrand: null,
      watchFamily: null,
      watchBandType: null,
      watchMovementType: null,
      matchConfidence: 0,
      topMatches: [],
    };
  }
  
  // Get suggested band and movement from library
  const bandSuggestions = getBandSuggestions(topMatch.brandId, topMatch.familyId || null);
  const suggestedBand = bandSuggestions.length > 0 ? bandSuggestions[0].bandId : null;
  const suggestedMovement = getSuggestedMovementType(topMatch.brandId, topMatch.familyId || null);
  
  return {
    watchBrand: topMatch.brandId,
    watchFamily: topMatch.familyId || null,
    watchBandType: suggestedBand,
    watchMovementType: suggestedMovement !== 'unknown' ? suggestedMovement : null,
    matchConfidence: Math.min(100, topMatch.score),
    topMatches,
  };
}

/**
 * Fetch product image from Google Custom Search API
 * Returns the first matching image URL or null
 */
async function fetchProductImage(searchQuery: string): Promise<string | null> {
  const apiKey = process.env.GOOGLE_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
  
  if (!apiKey || !searchEngineId) {
    console.log("Google Custom Search not configured - skipping image fetch");
    return null;
  }
  
  try {
    // Clean the query - keep it focused on the product
    const cleanQuery = searchQuery
      .replace(/[#&]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100); // Limit query length
    
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(cleanQuery)}&searchType=image&num=1&imgSize=medium&safe=active`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.log(`Google Search API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data.items && data.items.length > 0) {
      // Return the thumbnail link (smaller, faster loading)
      return data.items[0].image?.thumbnailLink || data.items[0].link || null;
    }
    
    return null;
  } catch (err) {
    console.error("Image search error:", err);
    return null;
  }
}

// REMOVED: fetchGooglePricing function - was using for-sale prices, NOT real sold data
// All pricing now comes from real sold comps only. When no real data available, 
// system triggers Research Mode for manual comp selection.

/**
 * Detect watch gender (men's/women's/unisex) from title and case size.
 * Women's watches typically have case sizes <=32mm, men's >=36mm.
 * Keywords like "Ladies", "Women's", "Boy Size" indicate gender.
 */
function detectWatchGender(title: string): 'mens' | 'womens' | 'unisex' {
  const lower = title.toLowerCase();
  
  // Keywords that indicate women's/ladies watches
  const womensKeywords = [
    'ladies', "lady's", 'womens', "women's", 'female', 'girls', 
    'midsize', 'mid-size', 'mid size', 'boy size', 'petite'
  ];
  
  // Keywords that indicate men's watches
  const mensKeywords = [
    'mens', "men's", 'gentleman', 'gents', 'male'
  ];
  
  // Check for explicit keywords first
  for (const kw of womensKeywords) {
    if (lower.includes(kw)) return 'womens';
  }
  for (const kw of mensKeywords) {
    if (lower.includes(kw)) return 'mens';
  }
  
  // Check case size (common formats: 26mm, 36 mm, 41MM)
  const sizeMatch = lower.match(/\b(\d{2})\s*mm\b/i);
  if (sizeMatch) {
    const caseSize = parseInt(sizeMatch[1], 10);
    if (caseSize <= 32) return 'womens';
    if (caseSize >= 36) return 'mens';
    // 33-35mm is ambiguous/unisex
    return 'unisex';
  }
  
  // Model-specific patterns for Rolex (most common watch brand)
  // Datejust 26, 28, 31 = women's; 36, 41 = men's
  const datejustMatch = lower.match(/datejust\s*(\d{2})/i);
  if (datejustMatch) {
    const size = parseInt(datejustMatch[1], 10);
    if (size <= 31) return 'womens';
    if (size >= 36) return 'mens';
  }
  
  // Day-Date 36, 40 = men's (rarely women's)
  if (lower.includes('day-date') || lower.includes('daydate') || lower.includes('day date')) {
    return 'mens';
  }
  
  // Submariner, GMT-Master, Daytona = almost always men's
  if (lower.includes('submariner') || lower.includes('gmt-master') || lower.includes('daytona') ||
      lower.includes('sea-dweller') || lower.includes('yacht-master 40') || lower.includes('yacht-master 42')) {
    return 'mens';
  }
  
  // Default to unisex if can't determine
  return 'unisex';
}

/**
 * Build progressive search queries from title.
 * Strips non-essential tokens and creates increasingly looser searches.
 * isSportsCard flag enables aggressive card-specific token removal.
 */
/**
 * Build a specific search query that PRESERVES important identifiers.
 * Key principle: Keep details that distinguish different variants/values.
 * - Model numbers, reference numbers, item numbers
 * - Years, sizes, editions
 * - Character names, player names
 * - Watch dial types, materials, model lines
 * - Shoe colorways
 */
function buildSpecificSearchQuery(title: string, category: string): string {
  const lowerTitle = title.toLowerCase();
  const identifiers: string[] = [];
  
  // ===== EXTRACT IMPORTANT IDENTIFIERS =====
  
  // Model/reference numbers (e.g., "116610", "ref 116610", "model A1234")
  const modelNumbers = title.match(/(?:ref\.?\s*|model\s*)?(\d{4,6}[A-Z]?)/gi) || [];
  modelNumbers.forEach(m => {
    const num = m.replace(/^(ref\.?\s*|model\s*)/i, '').trim();
    if (num.length >= 4 && num.length <= 7) identifiers.push(num);
  });
  
  // Item numbers with # prefix (e.g., "#1248", "#787")
  const itemNumbers = title.match(/#(\d{2,4})/g) || [];
  itemNumbers.forEach(n => identifiers.push(n.replace('#', '')));
  
  // Years (4-digit years from 1900-2030)
  const years = title.match(/\b(19\d{2}|20[0-2]\d)\b/g) || [];
  years.forEach(y => identifiers.push(y));
  
  // Sizes (for shoes, clothing)
  const sizes = title.match(/\bsize\s*(\d+\.?\d?)/gi) || [];
  sizes.forEach(s => identifiers.push(s));
  
  // ===== WATCH-SPECIFIC ATTRIBUTES =====
  // Dial types, materials, model lines - these dramatically affect value
  const watchAttributes = [
    // Dial types
    'roman dial', 'arabic dial', 'stick dial', 'diamond dial', 'skeleton',
    // Materials
    'mother of pearl', 'mop dial', 'gold', 'rose gold', 'two tone', 'stainless steel',
    // Invicta model lines (values vary 10x between lines)
    'pro diver', 'bolt', 'subaqua', 'venom', 'reserve', 'speedway', 'aviator', 'specialty',
    // Rolex/luxury specifics
    'submariner', 'datejust', 'daytona', 'gmt master', 'explorer', 'oyster perpetual',
    // Bezel types
    'rotating bezel', 'ceramic bezel', 'fluted bezel',
  ];
  
  for (const attr of watchAttributes) {
    if (lowerTitle.includes(attr)) {
      identifiers.push(attr);
    }
  }
  
  // ===== SHOE-SPECIFIC ATTRIBUTES =====
  // Colorways are CRITICAL - Jordan 1 Bred vs Jordan 1 Hyper Royal = $300 difference
  const shoeColorways = [
    // Jordan classics
    'bred', 'chicago', 'royal', 'shadow', 'mocha', 'obsidian', 'court purple',
    'university blue', 'hyper royal', 'dark mocha', 'banned', 'black toe', 'shattered backboard',
    'pine green', 'clay green', 'rookie of the year', 'turbo green', 'fearless',
    // Nike/general
    'triple white', 'triple black', 'panda', 'zebra', 'cream', 'bone', 'sail',
    // Yeezy
    'beluga', 'wave runner', 'static', 'cloud white', 'cinder', 'desert sage',
  ];
  
  for (const colorway of shoeColorways) {
    if (lowerTitle.includes(colorway)) {
      identifiers.push(colorway);
    }
  }
  
  // ===== CARD-SPECIFIC ATTRIBUTES =====
  const cardAttributes = [
    // Valuable parallels
    'prizm', 'silver prizm', 'gold prizm', 'kaboom', 'downtown', 'case hit',
    'refractor', 'atomic refractor', 'xfractor', 'superfractor',
    'auto', 'autograph', 'patch', 'rpa', 'rookie patch auto',
    // Grades
    'psa 10', 'psa 9', 'bgs 10', 'bgs 9.5', 'cgc 10', 'sgc 10',
  ];
  
  for (const attr of cardAttributes) {
    if (lowerTitle.includes(attr)) {
      identifiers.push(attr);
    }
  }
  
  // ===== FUNKO-SPECIFIC ATTRIBUTES =====
  const funkoAttributes = [
    'chase', 'exclusive', 'flocked', 'glow', 'gitd', 'metallic', 'diamond', 'blacklight',
    'convention exclusive', 'sdcc', 'nycc', 'eccc', 'funko shop',
  ];
  
  for (const attr of funkoAttributes) {
    if (lowerTitle.includes(attr)) {
      identifiers.push(attr);
    }
  }
  
  // ===== CLEAN THE TITLE =====
  let cleaned = title
    .replace(/[()[\]{}]/g, ' ')           // Remove brackets
    .replace(/[^\w\s\-'#]/g, ' ')         // Remove punctuation except # - '
    .replace(/\b(vinyl\s*figure|brand\s*new|pre-?owned|mint|sealed)\b/gi, '')
    .replace(/\b(free\s*shipping|fast\s*ship|authentic|genuine|official)\b/gi, '')
    .replace(/\b(wristwatch|timepiece|luxury|collectible)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // ===== BUILD FINAL QUERY =====
  const words = cleaned.split(' ').filter(w => w.length > 1);
  let query = words.slice(0, 10).join(' ');
  
  // Ensure critical identifiers are in the query
  for (const id of identifiers) {
    if (!query.toLowerCase().includes(id.toLowerCase())) {
      query = `${query} ${id}`;
    }
  }
  
  // Trim to reasonable length but don't cut mid-word
  if (query.length > 120) {
    const trimmed = query.slice(0, 120);
    const lastSpace = trimmed.lastIndexOf(' ');
    query = lastSpace > 80 ? trimmed.slice(0, lastSpace) : trimmed;
  }
  
  console.log(`[SearchQuery] "${title.slice(0, 50)}..." -> "${query}"`);
  return query;
}

function buildProgressiveQueries(title: string, isSportsCard: boolean = false): string[] {
  // Use the new specific query builder
  const specificQuery = buildSpecificSearchQuery(title, isSportsCard ? 'Trading Cards' : 'General');
  return [specificQuery];
}

/**
 * Build search query from title for eBay API/search.
 * Uses buildSpecificSearchQuery to preserve important identifiers.
 * For watches, detects gender and appends appropriate modifier.
 */
function buildSearchQuery(title: string, category: string): string {
  // Use the unified specific query builder for all categories
  let baseQuery = buildSpecificSearchQuery(title, category);
  const lowerTitle = title.toLowerCase();
  const lowerQuery = baseQuery.toLowerCase();
  
  // For watches, append gender modifier if not already present
  if (category === 'Watches') {
    const gender = detectWatchGender(title);
    
    // Only append if gender detected and not already in query
    if (gender === 'womens' && !lowerQuery.includes('ladies') && !lowerQuery.includes('women')) {
      baseQuery = `${baseQuery} ladies`;
    } else if (gender === 'mens' && !lowerQuery.includes('mens') && !lowerQuery.includes('men')) {
      // Most watch comps default to men's, so only add if query is ambiguous
      // Skip adding "mens" as it may exclude unisex listings
    }
    // unisex: don't modify query, let it match both
  }
  
  // GAMING CONTROLLER DISAMBIGUATION
  // Different controllers have vastly different values - must be precise
  if (lowerTitle.includes('controller') || lowerTitle.includes('gamepad')) {
    
    // Xbox controllers: Elite Series 2 costs 3-4x more than standard
    if (lowerTitle.includes('xbox')) {
      const isElite = lowerTitle.includes('elite');
      const isSeriesX = lowerTitle.includes('series x') || lowerTitle.includes('series s');
      const isOne = lowerTitle.includes('xbox one') && !isSeriesX;
      const is360 = lowerTitle.includes('360');
      
      if (isElite && !lowerQuery.includes('elite')) {
        baseQuery = baseQuery.replace(/xbox/i, 'Xbox Elite');
        // Add Series 2 if specified
        if (lowerTitle.includes('series 2') && !lowerQuery.includes('series 2')) {
          baseQuery += ' Series 2';
        }
      } else if (!isElite && !lowerQuery.includes('-elite')) {
        baseQuery = `${baseQuery} -elite`;
      }
      
      // Add generation specificity
      if (is360 && !lowerQuery.includes('360')) {
        baseQuery = baseQuery.replace(/xbox/i, 'Xbox 360');
      } else if (isSeriesX && !lowerQuery.includes('series x') && !lowerQuery.includes('series s')) {
        baseQuery = baseQuery.replace(/xbox/i, 'Xbox Series X');
      } else if (isOne && !lowerQuery.includes('xbox one')) {
        baseQuery = baseQuery.replace(/xbox/i, 'Xbox One');
      }
    }
    
    // PlayStation controllers: DualSense (PS5) vs DualShock 4 (PS4) vs DualShock 3 (PS3)
    if (lowerTitle.includes('playstation') || lowerTitle.includes('ps5') || 
        lowerTitle.includes('ps4') || lowerTitle.includes('ps3') || 
        lowerTitle.includes('dualsense') || lowerTitle.includes('dualshock')) {
      
      const isDualSense = lowerTitle.includes('dualsense') || lowerTitle.includes('ps5');
      const isEdge = lowerTitle.includes('edge');
      const isDualShock4 = lowerTitle.includes('dualshock 4') || (lowerTitle.includes('ps4') && !isDualSense);
      const isDualShock3 = lowerTitle.includes('dualshock 3') || lowerTitle.includes('ps3');
      
      if (isDualSense) {
        if (isEdge) {
          // DualSense Edge is premium ($200 vs $70)
          if (!lowerQuery.includes('edge')) {
            baseQuery = 'PlayStation DualSense Edge Controller';
          }
        } else {
          if (!lowerQuery.includes('dualsense')) {
            baseQuery = 'PlayStation 5 DualSense Controller';
          }
          // Exclude Edge from standard DualSense searches
          if (!lowerQuery.includes('-edge')) {
            baseQuery += ' -edge';
          }
        }
      } else if (isDualShock4) {
        if (!lowerQuery.includes('dualshock 4') && !lowerQuery.includes('ps4')) {
          baseQuery = 'PlayStation 4 DualShock 4 Controller';
        }
        // Exclude PS5 controllers
        baseQuery += ' -ps5 -dualsense';
      } else if (isDualShock3) {
        if (!lowerQuery.includes('dualshock 3') && !lowerQuery.includes('ps3')) {
          baseQuery = 'PlayStation 3 DualShock 3 Controller';
        }
      }
    }
    
    // Nintendo controllers: Pro Controller vs Joy-Con vs GameCube
    if (lowerTitle.includes('nintendo') || lowerTitle.includes('switch') || 
        lowerTitle.includes('joy-con') || lowerTitle.includes('joycon') ||
        lowerTitle.includes('pro controller') || lowerTitle.includes('gamecube')) {
      
      const isProController = lowerTitle.includes('pro controller');
      const isJoyCon = lowerTitle.includes('joy-con') || lowerTitle.includes('joycon');
      const isGameCube = lowerTitle.includes('gamecube');
      const isWavebird = lowerTitle.includes('wavebird');
      
      if (isProController) {
        if (!lowerQuery.includes('pro controller')) {
          baseQuery = 'Nintendo Switch Pro Controller';
        }
        // Exclude Joy-Con
        baseQuery += ' -joy-con -joycon';
      } else if (isJoyCon) {
        if (!lowerQuery.includes('joy-con') && !lowerQuery.includes('joycon')) {
          baseQuery = 'Nintendo Switch Joy-Con';
        }
        // Check for left/right/pair
        if (lowerTitle.includes('left') && !lowerQuery.includes('left')) {
          baseQuery += ' left';
        } else if (lowerTitle.includes('right') && !lowerQuery.includes('right')) {
          baseQuery += ' right';
        } else if ((lowerTitle.includes('pair') || lowerTitle.includes('set')) && !lowerQuery.includes('pair')) {
          baseQuery += ' pair';
        }
      } else if (isWavebird) {
        baseQuery = 'Nintendo WaveBird Wireless Controller';
      } else if (isGameCube) {
        if (!lowerQuery.includes('gamecube')) {
          baseQuery = 'Nintendo GameCube Controller';
        }
      }
    }
  }
  
  // For Funko Pops, extract the key identifiers: character, series, number
  if (category === 'Funko Pop' || lowerTitle.includes('funko') || lowerTitle.includes('pop!')) {
    // Extract number if present (e.g., #123, #1234)
    const numMatch = lowerTitle.match(/#(\d+)/);
    const popNum = numMatch ? numMatch[1] : null;
    
    // Check for exclusives (Chase, Convention, etc.)
    const isChase = lowerTitle.includes('chase');
    const exclusiveType = lowerTitle.includes('sdcc') ? 'SDCC' :
                          lowerTitle.includes('nycc') ? 'NYCC' :
                          lowerTitle.includes('target exclusive') ? 'Target' :
                          lowerTitle.includes('walmart exclusive') ? 'Walmart' :
                          lowerTitle.includes('hot topic') ? 'Hot Topic' :
                          lowerTitle.includes('funko shop') ? 'Funko Shop' :
                          lowerTitle.includes('exclusive') ? 'exclusive' : null;
    
    // Try to extract character/series name from title FIRST (most important for identification)
    const cleanTitle = lowerTitle
      .replace(/funko\s*pop!?/gi, '')
      .replace(/vinyl\s*figure/gi, '')
      .replace(/figure/gi, '')
      .replace(/#\d+/g, '')
      .replace(/chase/gi, '')
      .replace(/exclusive/gi, '')
      .replace(/sdcc|nycc|target|walmart|hot\s*topic|funko\s*shop/gi, '')
      .replace(/new|sealed|box|in\s*box|nib|mint|rare/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Get significant words as character/series identifiers - preserve more context
    const words = cleanTitle.split(/\s+/).filter(w => w.length > 2).slice(0, 6);
    
    // Build optimized Funko query - character/series first, then specifics
    let funkoQuery = 'Funko Pop';
    
    // Add character/series name (most important for identification)
    if (words.length > 0) {
      funkoQuery += ' ' + words.join(' ');
    }
    
    // Add number if found - helps narrow down specific variants
    if (popNum) {
      funkoQuery += ` #${popNum}`;
    }
    
    // Add chase/exclusive modifiers last
    if (isChase) {
      funkoQuery += ' chase';
    } else if (exclusiveType) {
      funkoQuery += ` ${exclusiveType}`;
    }
    
    return funkoQuery.slice(0, 80);
  }
  
  return baseQuery;
}

/**
 * Calculate comp statistics from an array of comps.
 */
function calculateCompStats(comps: SoldComp[]): {
  lowPrice: number | null;
  medianPrice: number | null;
  highPrice: number | null;
  averagePrice: number | null;
  spreadPercent: number | null;
  variance: number | null;
  priceRange: { min: number; max: number } | null;
} {
  if (comps.length === 0) {
    return {
      lowPrice: null,
      medianPrice: null,
      highPrice: null,
      averagePrice: null,
      spreadPercent: null,
      variance: null,
      priceRange: null,
    };
  }

  const prices = comps.map(c => c.soldPrice).sort((a, b) => a - b);
  const lowPrice = prices[0];
  const highPrice = prices[prices.length - 1];
  
  const mid = Math.floor(prices.length / 2);
  const medianPrice = prices.length % 2 !== 0
    ? prices[mid]
    : (prices[mid - 1] + prices[mid]) / 2;
  
  // Remove outliers: ignore bottom 2 and top 2 sales for better average
  // Only apply if we have at least 5 comps (so we keep at least 1 after trimming)
  let trimmedPrices = prices;
  if (prices.length >= 5) {
    trimmedPrices = prices.slice(2, prices.length - 2);
  } else if (prices.length >= 3) {
    // For 3-4 comps, just remove the single highest and lowest
    trimmedPrices = prices.slice(1, prices.length - 1);
  }
  // For 1-2 comps, use all prices (no trimming possible)
  
  const averagePrice = trimmedPrices.reduce((sum, p) => sum + p, 0) / trimmedPrices.length;
  
  const spreadPercent = medianPrice > 0 
    ? Math.round(((highPrice - lowPrice) / medianPrice) * 100)
    : null;
  
  const variance = prices.length >= 2
    ? prices.reduce((sum, p) => sum + Math.pow(p - averagePrice, 2), 0) / prices.length
    : null;

  return {
    lowPrice,
    medianPrice,
    highPrice,
    averagePrice,
    spreadPercent,
    variance,
    priceRange: { min: lowPrice, max: highPrice },
  };
}

// Fixed costs (packaging, supplies, etc.) - fee rates and shipping imported from pricingEngine
const DEFAULT_FIXED_COSTS = 2;

export interface PriceGuideResult {
  maxBuyPrice: number;
  expectedSalePrice: number;
  medianSoldPrice: number;
  feeRate: number;
  shippingCost: number;
  fixedCosts: number;
  netAfterFees: number;
  targetMargin: number;
  targetProfit: number;
  soldSampleCount: number;
  trimmedCount: number;
  confidence: 'high' | 'moderate' | 'low' | 'ai_estimate';
  displayMode: 'single' | 'range' | 'estimate_range';
  source: 'sold_comps' | 'insufficient_data';
  resaleRange: { low: number; high: number };
  cv: number;
  spread: number;
  ceilingApplied: boolean;
  clampApplied: boolean;
  inconsistentComps: boolean;
}

/**
 * Calculate Price Guide using SOLD comps with robust outlier removal and clamps.
 * 
 * Algorithm v2 (with sanity clamps and category ceilings):
 * 1. Parse sold prices into dollars
 * 2. IQR trim outliers
 * 3. Reject 2.5x/0.4x median outliers
 * 4. Calculate median, CV, spread
 * 5. Apply category ceiling
 * 6. Apply sanity ratio clamp
 * 7. Assign strict confidence (HIGH requires no clamps + low variance)
 * 8. Choose display mode (single/range/estimate_range)
 */
function calculatePriceGuide(
  comps: SoldComp[],
  category: string,
  options?: { targetMargin?: number; isSoldData?: boolean; buyPrice?: number }
): PriceGuideResult | null {
  const isSoldData = options?.isSoldData ?? true;
  const userBuyPrice = options?.buyPrice;
  
  // Require at least 1 sold comp
  if (!isSoldData || comps.length < 1) {
    return null;
  }
  
  // Step 1: Parse prices into dollars
  const rawPrices = comps.map(c => {
    let price = c.soldPrice;
    if (price > 10000) {
      price = price / 100;
    }
    return price;
  }).filter(p => p > 0);
  
  const originalCount = rawPrices.length;
  if (originalCount < 1) return null;
  
  // Steps 2-5: Process comps using shared pricing engine
  const compResult = processComps(rawPrices);
  const { trimmedMedian, cv, spread, lowComp, highComp, finalComps } = compResult;
  
  if (trimmedMedian <= 0) return null;
  
  const trimmedCount = originalCount - finalComps.length;
  let expectedResale = trimmedMedian;
  
  // Step 6: Apply category ceiling
  const categoryCeiling = getCategoryCeiling(category, trimmedMedian);
  let ceilingApplied = false;
  if (expectedResale > categoryCeiling) {
    console.log(`[PRICE GUIDE] Category ceiling applied: ${category} ceiling=$${categoryCeiling}, was=$${expectedResale}`);
    expectedResale = categoryCeiling;
    ceilingApplied = true;
  }
  
  // Step 7: Apply sanity ratio clamp
  const { clampedResale, wasClampApplied } = applySanityClamp(expectedResale, userBuyPrice, trimmedMedian);
  if (wasClampApplied) {
    console.log(`[PRICE GUIDE] Sanity clamp applied: was=$${expectedResale}, now=$${clampedResale}`);
  }
  expectedResale = clampedResale;
  const clampApplied = wasClampApplied;
  
  // Get category-specific shipping allowance and fee rate from pricingEngine
  const shippingAllowance = getShippingAllowance(category);
  const feeRate = getCategoryFeeRate(category);
  const feeMultiplier = getCategoryFeeMultiplier(category);
  
  // STANDARDIZED FORMULA:
  // Net After Fees = Expected Resale × (1 - fee rate)
  const netAfterFees = expectedResale * feeMultiplier;
  
  // Target Profit = MAX($15, 25% of Expected Resale)
  const percentBasedProfit = expectedResale * 0.25;
  const targetProfit = Math.max(15, percentBasedProfit);
  
  // Max Buy Price = Net After Fees - Target Profit
  // Apply 20% reduction for safety margin in flip mode
  let maxBuyPrice = Math.floor((netAfterFees - targetProfit) * 0.8);
  if (maxBuyPrice < 0) maxBuyPrice = 0;
  
  // Step 8: Assign strict confidence
  const soldSampleCount = originalCount;
  const meetsHighCompCount = finalComps.length >= HIGH_CONFIDENCE_MIN_COMPS;
  const meetsHighCV = cv <= HIGH_CONFIDENCE_MAX_CV;
  const meetsHighSpread = spread <= HIGH_CONFIDENCE_MAX_SPREAD;
  const noClampOrCeiling = !ceilingApplied && !clampApplied;
  
  let confidence: 'high' | 'moderate' | 'low' | 'ai_estimate';
  if (meetsHighCompCount && meetsHighCV && meetsHighSpread && noClampOrCeiling) {
    confidence = 'high';
  } else if (finalComps.length >= 2) {
    confidence = 'moderate';
  } else if (finalComps.length >= 1) {
    confidence = 'low';
  } else {
    confidence = 'ai_estimate';
  }
  
  // Downgrade if ceiling/clamp applied
  if (ceilingApplied && confidence === 'high') {
    confidence = 'moderate';
  }
  if (clampApplied) {
    confidence = 'low'; // Sanity clamp always forces LOW
  }
  
  // Step 9: Choose display mode
  let displayMode: 'single' | 'range' | 'estimate_range';
  if (confidence === 'high') {
    displayMode = 'single';
  } else if (confidence === 'moderate') {
    displayMode = 'range';
  } else {
    displayMode = 'estimate_range';
  }
  
  // Calculate and normalize resale range using centralized function
  const rawRange = lowComp > 0 && highComp > 0 
    ? { low: Math.round(lowComp), high: Math.round(highComp) }
    : { 
        low: Math.round(expectedResale * 0.65), 
        high: Math.round(expectedResale * 1.35) 
      };
  const resaleRange = normalizeResaleRange(rawRange, expectedResale, { ceilingApplied, clampApplied });
  
  // Inconsistent comps warning
  const inconsistentComps = cv > 0.35 || spread > 2.5;
  
  // VALIDATION GUARDS (relaxed for clamped values)
  if (maxBuyPrice >= expectedResale && !clampApplied) {
    console.error('[PRICE GUIDE GUARD FAILURE] maxBuy >= expectedResale', {
      expectedResale,
      netAfterFees,
      targetProfit,
      maxBuy: maxBuyPrice
    });
    return null;
  }
  
  console.log(`[PRICE GUIDE v2] category=${category} comps=${soldSampleCount} finalComps=${finalComps.length} cv=${cv.toFixed(2)} spread=${spread.toFixed(1)} confidence=${confidence} displayMode=${displayMode} median=$${trimmedMedian.toFixed(2)} expectedResale=$${expectedResale.toFixed(2)} maxBuy=$${maxBuyPrice} ceilingApplied=${ceilingApplied} clampApplied=${clampApplied}`);
  
  return {
    maxBuyPrice,
    expectedSalePrice: Math.round(expectedResale * 100) / 100,
    medianSoldPrice: Math.round(trimmedMedian * 100) / 100,
    feeRate: feeRate,
    shippingCost: shippingAllowance,
    fixedCosts: 0,
    netAfterFees: Math.round(netAfterFees * 100) / 100,
    targetMargin: 0.25,
    targetProfit: Math.round(targetProfit * 100) / 100,
    soldSampleCount,
    trimmedCount,
    confidence,
    displayMode,
    source: 'sold_comps',
    resaleRange,
    cv: Math.round(cv * 100) / 100,
    spread: Math.round(spread * 100) / 100,
    ceilingApplied,
    clampApplied,
    inconsistentComps,
  };
}

/**
 * Attempt to fetch sold comps from eBay Marketplace Insights API.
 * This API requires special access approval from eBay.
 * Returns null if API is not available or fails.
 */
async function fetchCompsFromMarketplaceInsightsAPI(
  searchQuery: string,
  category: string
): Promise<SoldComp[] | null> {
  const startTime = Date.now();
  
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    logCompsRequest({
      query: searchQuery,
      category,
      source: 'api',
      resultsCount: 0,
      success: false,
      error: 'eBay API credentials not configured',
      durationMs: Date.now() - startTime,
    });
    return null;
  }

  try {
    const authResponse = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope/buy.marketplace.insights',
    });

    if (!authResponse.ok) {
      const errorText = await authResponse.text();
      logCompsRequest({
        query: searchQuery,
        category,
        source: 'api',
        resultsCount: 0,
        success: false,
        error: `OAuth failed: ${authResponse.status} - ${errorText.slice(0, 100)}`,
        durationMs: Date.now() - startTime,
        apiEndpoint: 'oauth2/token',
      });
      return null;
    }

    const authData = await authResponse.json();
    const accessToken = authData.access_token;

    const categoryMap: Record<string, string> = {
      'Trading Cards': '212',
      'Watches': '14324',
      'Electronics': '293',
      'Shoes': '93427',
    };
    const categoryId = categoryMap[category] || '';
    const categoryParam = categoryId ? `&category_ids=${categoryId}` : '';
    
    const apiUrl = `https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search?q=${encodeURIComponent(searchQuery)}${categoryParam}&limit=5`;
    
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logCompsRequest({
        query: searchQuery,
        category,
        source: 'api',
        resultsCount: 0,
        success: false,
        error: `API request failed: ${response.status} - ${errorText.slice(0, 100)}`,
        durationMs: Date.now() - startTime,
        apiEndpoint: 'marketplace_insights/search',
      });
      return null;
    }

    const data = await response.json();
    const itemSales = data.itemSales || [];

    const comps: SoldComp[] = itemSales.slice(0, 5).map((item: any) => {
      const soldPrice = parseFloat(item.lastSoldPrice?.value || '0');
      let shippingCost = 'Unknown';
      if (item.shippingCost) {
        const shipValue = parseFloat(item.shippingCost.value || '0');
        shippingCost = shipValue === 0 ? 'Free' : `$${shipValue.toFixed(2)}`;
      }
      
      const totalPrice = soldPrice + (shippingCost === 'Free' ? 0 : parseFloat(shippingCost.replace('$', '') || '0'));
      
      return {
        soldPrice,
        shippingCost,
        dateSold: item.lastSoldDate || 'Recently',
        condition: item.condition || 'Not specified',
        totalPrice,
      };
    });

    logCompsRequest({
      query: searchQuery,
      category,
      source: 'api',
      resultsCount: comps.length,
      success: true,
      durationMs: Date.now() - startTime,
      apiEndpoint: 'marketplace_insights/search',
    });

    return comps;
  } catch (error) {
    const err = error as Error;
    logCompsRequest({
      query: searchQuery,
      category,
      source: 'api',
      resultsCount: 0,
      success: false,
      error: err.message,
      durationMs: Date.now() - startTime,
    });
    return null;
  }
}

/**
 * Get sold comps using unified eBay API layer.
 * STRICT SOLD-DATA-ONLY: Only returns real sold data from verified sources.
 * 
 * ALLOWED Sources (real sold data):
 * 1. Cache (if from allowed source)
 * 2. PriceCharting API (games/trading cards)
 * 3. SerpAPI with LH_Sold=1 + LH_Complete=1 filters
 * 
 * BLOCKED Sources (not real sold data):
 * - Browse API (active listings) - REMOVED
 * - Google Pricing (for-sale prices) - REMOVED
 * - Chrono24 (asking prices) - Provides search URL only, NOT comps
 * 
 * When no real sold data found, returns empty comps to trigger Research Mode.
 */
async function getSoldCompsWithCache(title: string, category: string, condition?: string, options?: { lenient?: boolean }): Promise<CompsResult> {
  const startTime = Date.now();
  const searchQuery = buildSearchQuery(title, category);
  
  // For watches, use gender-specific category for more accurate comps
  let effectiveCategory = category;
  let watchGender: 'mens' | 'womens' | 'unisex' | null = null;
  if (category === 'Watches') {
    watchGender = detectWatchGender(title);
    if (watchGender === 'womens') {
      effectiveCategory = "Women's Watches";
    } else if (watchGender === 'mens') {
      effectiveCategory = "Men's Watches";
    }
    // unisex: keep generic 'Watches' category
  }
  
  const ebaySearchUrl = buildEbaySearchUrl(searchQuery, effectiveCategory);
  // For watches, also include Chrono24 search URL for luxury watch reference pricing
  const chrono24SearchUrl = category === 'Watches' ? buildChrono24SearchUrl(searchQuery) : undefined;
  
  // Include effectiveCategory in cache key to prevent cross-gender cache contamination
  const queryKey = `${title.toLowerCase().trim()}:${effectiveCategory.toLowerCase().trim()}`.slice(0, 200);
  
  const fallbackResult: CompsResult = {
    comps: [],
    lowPrice: null,
    medianPrice: null,
    highPrice: null,
    spreadPercent: null,
    averagePrice: null,
    priceRange: null,
    variance: null,
    message: category === 'Watches' 
      ? "View sold results on eBay or check Chrono24 for market prices."
      : "View sold results on eBay for pricing data.",
    searchQuery,
    source: 'fallback',
    ebaySearchUrl,
    chrono24SearchUrl,
  };

  // ALLOWED_COMP_SOURCES: Centralized allowlist for sold-data-only enforcement
  // Only these sources are verified to contain real sold data
  const ALLOWED_COMP_SOURCES_LOCAL = ['serpapi', 'marketplace_insights', 'pricecharting', 'api'];
  
  // CACHE VERSION: Invalidate old cache entries that may contain non-sold data
  // Increment this when changing data sources to force cache refresh
  const CACHE_VERSION = 'v2_sold_only';
  
  try {
    const cached = await storage.getCompsCache(queryKey);
    if (cached) {
      // VALIDATION: Require cache version AND allowed source
      // Old entries without version or with disallowed source are ignored
      const cachedVersion = (cached as any).version;
      const cachedSource = (cached as any).source;
      
      // STRICT: Only accept cache entries with v2+ version AND allowed source
      const isValidVersion = cachedVersion === CACHE_VERSION;
      const isAllowedSource = cachedSource && ALLOWED_COMP_SOURCES_LOCAL.includes(cachedSource);
      
      if (!isValidVersion) {
        console.log(`[CACHE VALIDATION] Ignoring old cache version: ${cachedVersion || 'none'} (expected ${CACHE_VERSION})`);
        // Fall through to fetch fresh data
      } else if (!isAllowedSource) {
        console.log(`[CACHE VALIDATION] Ignoring cached comps with disallowed source: ${cachedSource}`);
        // Fall through to fetch fresh data
      } else {
        logCompsRequest({
          query: searchQuery,
          category,
          source: 'cache',
          resultsCount: (cached.comps as SoldComp[]).length,
          success: true,
          durationMs: Date.now() - startTime,
        });
        
        // Propagate actual source from cache, NOT normalized 'api'
        return {
          comps: cached.comps as SoldComp[],
          lowPrice: cached.lowPrice ? parseFloat(cached.lowPrice) : null,
          medianPrice: cached.medianPrice ? parseFloat(cached.medianPrice) : null,
          highPrice: cached.highPrice ? parseFloat(cached.highPrice) : null,
          spreadPercent: cached.spreadPercent ? parseFloat(cached.spreadPercent) : null,
          message: cached.message || undefined,
          searchQuery,
          source: cachedSource, // Propagate original source for provenance
          ebaySearchUrl,
          chrono24SearchUrl,
        };
      }
    }

    // Use condition-separated fetching for more accurate pricing
    const conditionResult = await fetchCompsByCondition(searchQuery, effectiveCategory, {
      limit: 10,
      itemTitle: title,
    });
    
    if (conditionResult && conditionResult.all.count > 0) {
      const allComps = conditionResult.all.comps;
      
      // For watches, use the pre-computed cleaned stats from conditionResult.all
      // (which comes from cleanSoldComps with IQR trimming and parts/repair filtering)
      // For non-watches, calculate stats from raw comps
      const isWatchCat = category.toLowerCase().includes('watch');
      const cleanedCompCount = conditionResult.all.count;
      
      // Use cleaned stats directly for watches (already computed in fetchCompsByCondition)
      // These stats are from cleanSoldComps which excludes parts/repair, uses median, trims outliers
      // For non-watches, apply universal comp filtering before calculating stats
      // LENIENT MODE: For LiveCapture, skip strict filtering - trust eBay's search
      let compsForStats = allComps;
      if (!isWatchCat && allComps.length > 0) {
        if (options?.lenient) {
          // LENIENT: For fast auctions, use all comps that eBay returned (already filtered by search query)
          // Only exclude obvious junk patterns, no keyword matching
          const filterResult = filterComps(allComps, title, category, condition, {
            minMatchScore: 0, // No keyword match required - trust eBay search
            strictCondition: false,
          });
          compsForStats = filterResult.filteredComps.length > 0 ? filterResult.filteredComps : allComps;
          console.log(`[COMP FILTER LENIENT] ${category}: ${allComps.length} → ${compsForStats.length} comps`);
        } else {
          const filterResult = filterComps(allComps, title, category, condition, {
            minMatchScore: 0.25, // Require 25% keyword match
            strictCondition: false, // Don't strictly filter by condition initially
          });
          // Use filtered comps if we have at least 1 (even sparse results should exclude junk)
          if (filterResult.filteredComps.length >= 1) {
            compsForStats = filterResult.filteredComps;
            console.log(`[COMP FILTER] ${category}: ${allComps.length} → ${compsForStats.length} comps (${filterResult.matchScore.toFixed(2)} avg match)`);
          } else {
            // STRICT: Do NOT use unfiltered as fallback - this leads to wrong comps
            // Return insufficient data instead of misleading prices
            console.log(`[COMP FILTER] ${category}: All ${allComps.length} comps excluded - insufficient matching data`);
            compsForStats = []; // Empty = will trigger low confidence warning
          }
        }
      }
      
      const stats = isWatchCat ? {
        lowPrice: conditionResult.all.lowPrice,
        medianPrice: conditionResult.all.medianPrice,
        highPrice: conditionResult.all.highPrice,
        averagePrice: conditionResult.all.medianPrice, // Use median for watches, not average
        spreadPercent: conditionResult.all.medianPrice && conditionResult.all.lowPrice && conditionResult.all.highPrice
          ? Math.round(((conditionResult.all.highPrice - conditionResult.all.lowPrice) / conditionResult.all.medianPrice) * 100)
          : null,
        variance: null,
        priceRange: conditionResult.all.lowPrice && conditionResult.all.highPrice
          ? { min: conditionResult.all.lowPrice, max: conditionResult.all.highPrice }
          : null,
      } : calculateCompStats(compsForStats);
      
      // Preserve original source for provenance tracking
      // All sources now return real sold data only (browse_api fallback removed)
      const sourceLabel = conditionResult.source; // Preserve actual source (serpapi, marketplace_insights, etc.)
      
      let message: string | undefined;
      if (isWatchCat && cleanedCompCount < 8) {
        // For watches, warn about low confidence when <8 clean comps
        message = `Low comp confidence: ${cleanedCompCount}/8 clean comps. Consider manual verification.`;
      } else if (allComps.length < 3) {
        message = `Only ${allComps.length} comp${allComps.length === 1 ? '' : 's'} found. Results may be less reliable.`;
      }

      // Build condition-separated stats for UI
      const conditionStats = {
        newLike: {
          count: conditionResult.newLike.count,
          medianPrice: conditionResult.newLike.medianPrice,
          lowPrice: conditionResult.newLike.lowPrice,
          highPrice: conditionResult.newLike.highPrice,
        },
        used: {
          count: conditionResult.used.count,
          medianPrice: conditionResult.used.medianPrice,
          lowPrice: conditionResult.used.lowPrice,
          highPrice: conditionResult.used.highPrice,
        },
      };

      const result: CompsResult = {
        comps: compsForStats, // Use filtered comps for all categories
        ...stats,
        searchQuery,
        source: sourceLabel,
        ebaySearchUrl,
        chrono24SearchUrl,
        message,
        conditionStats,
        // For watches, cleanedCompCount is the count after parts/repair filtering and IQR trimming
        // For non-watches, it's the count after universal comp filtering
        cleanedCompCount: isWatchCat ? cleanedCompCount : compsForStats.length,
      };

      const expiresAt = new Date(Date.now() + 45 * 60 * 1000);
      await storage.setCompsCache({
        queryKey,
        comps: allComps,
        lowPrice: stats.lowPrice?.toString() || null,
        medianPrice: stats.medianPrice?.toString() || null,
        highPrice: stats.highPrice?.toString() || null,
        spreadPercent: stats.spreadPercent?.toString() || null,
        message: result.message || null,
        expiresAt,
        // SOLD-DATA-ONLY: Include version and source for cache validation
        version: CACHE_VERSION,
        source: sourceLabel,
      } as any); // Type assertion since we're adding fields for validation

      console.log(`[Comps Cache] Stored ${isWatchCat ? 'cleaned' : 'raw'} stats for "${title.slice(0, 40)}..." median=$${stats.medianPrice} count=${cleanedCompCount}`);

      return result;
    }

    // CHRONO24 BLOCKED: Uses asking prices, NOT real sold data
    // For watches, we only provide Chrono24 search URL for manual research
    // We do NOT use Chrono24 comps for pricing decisions
    // The chrono24SearchUrl is already set above for Research Mode reference

    logCompsRequest({
      query: searchQuery,
      category,
      source: 'fallback',
      resultsCount: 0,
      success: true,
      durationMs: Date.now() - startTime,
    });

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await storage.setCompsCache({
      queryKey,
      comps: [],
      lowPrice: null,
      medianPrice: null,
      highPrice: null,
      spreadPercent: null,
      message: fallbackResult.message || null,
      expiresAt,
      // SOLD-DATA-ONLY: Include version, source is 'none' for fallback (no comps)
      version: CACHE_VERSION,
      source: 'none',
    } as any);

    return fallbackResult;
  } catch (err) {
    const error = err as Error;
    logCompsRequest({
      query: searchQuery,
      category,
      source: 'fallback',
      resultsCount: 0,
      success: false,
      error: error.message,
      durationMs: Date.now() - startTime,
    });
    
    return fallbackResult;
  }
}

/**
 * Adjust confidence based on comp spread.
 * Tight spread → boost confidence
 * Wide spread → reduce confidence
 * No comps → reduce confidence (don't inflate)
 */
function adjustConfidenceBySpread(baseConfidence: number, spreadPercent: number | null, compCount: number): number {
  // If no comps found, reduce confidence but don't inflate low scores
  if (compCount === 0) {
    return Math.max(baseConfidence - 15, 15);
  }
  
  // Single comp - slight reduction due to limited data
  if (compCount < 2 || spreadPercent === null) {
    return Math.max(baseConfidence - 5, 15);
  }

  let adjustment = 0;
  
  if (spreadPercent <= 15) {
    // Very tight spread - moderate confidence boost
    adjustment = 10;
  } else if (spreadPercent <= 25) {
    // Tight spread - small boost
    adjustment = 5;
  } else if (spreadPercent <= 40) {
    // Normal spread - no change
    adjustment = 0;
  } else if (spreadPercent <= 60) {
    // Wide spread - small reduction
    adjustment = -5;
  } else if (spreadPercent <= 80) {
    // Very wide spread - moderate reduction
    adjustment = -10;
  } else {
    // Extremely wide spread - significant reduction
    adjustment = -15;
  }

  // Small boost for more comps (capped)
  if (compCount >= 5) adjustment += 3;
  else if (compCount >= 3) adjustment += 1;

  // Cap result: never inflate below 15, never exceed 95
  return Math.min(Math.max(baseConfidence + adjustment, 15), 95);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup Auth
  setupAuth(app);
  
  // Setup WebSocket for real-time auction overlay
  setupWebSocket(httpServer);
  
  // Serve app store screenshots for download
  app.get("/download/screenshots/:name", (req, res) => {
    const validScreenshots = [
      "screenshot-1-scan",
      "screenshot-2-flip", 
      "screenshot-3-inventory",
      "screenshot-4-dashboard",
      "screenshot-5-history",
      "screenshot-6-settings"
    ];
    const name = req.params.name;
    if (!validScreenshots.includes(name)) {
      return res.status(404).json({ error: "Screenshot not found" });
    }
    const filePath = `${process.cwd()}/client/public/screenshots/${name}.png`;
    res.download(filePath, `${name}.png`);
  });

  // Download all screenshots as individual files page
  app.get("/download/screenshots", (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html><head><title>Download Screenshots</title>
      <style>body{font-family:system-ui;max-width:600px;margin:40px auto;padding:20px;background:#111;color:#fff}
      a{display:block;padding:12px 20px;margin:8px 0;background:#10b981;color:#fff;text-decoration:none;border-radius:8px;text-align:center}
      a:hover{background:#059669}</style></head>
      <body><h1>App Store Screenshots</h1>
      <a href="/download/screenshots/screenshot-1-scan" download>1. Scan Screen</a>
      <a href="/download/screenshots/screenshot-2-flip" download>2. Flip Result</a>
      <a href="/download/screenshots/screenshot-3-inventory" download>3. Inventory</a>
      <a href="/download/screenshots/screenshot-4-dashboard" download>4. Dashboard</a>
      <a href="/download/screenshots/screenshot-5-history" download>5. History</a>
      <a href="/download/screenshots/screenshot-6-settings" download>6. Settings</a>
      </body></html>
    `);
  });

  // Protected routes middleware
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  };

  // Stripe checkout route - create checkout session for Pro upgrade
  app.post("/api/checkout", requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      const stripe = await getUncachableStripeClient();
      
      // Get or create Stripe customer with retry
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await callStripeWithRetry(() =>
          stripe.customers.create({
            metadata: { userId: String(user.id), username: user.username }
          })
        );
        await storage.updateUserSubscription(user.id, { stripeCustomerId: customer.id });
        customerId = customer.id;
      }
      
      // Find the Pro price from Stripe with retry
      const prices = await callStripeWithRetry(() =>
        stripe.prices.list({
          active: true,
          type: 'recurring',
          limit: 10
        })
      );
      
      // Find the Margin Pro price ($24.99/month)
      const proPrice = prices.data.find(p => {
        return p.unit_amount === 2499 && p.recurring?.interval === 'month';
      });
      
      if (!proPrice) {
        return res.status(400).json({ error: "Pro subscription not available" });
      }
      
      // Create checkout session - use X-Forwarded-Proto for Replit environment
      const protocol = req.get('X-Forwarded-Proto') || req.protocol || 'https';
      const baseUrl = `${protocol}://${req.get('host')}`;
      const session = await callStripeWithRetry(() =>
        stripe.checkout.sessions.create({
          customer: customerId,
          payment_method_types: ['card'],
          line_items: [{ price: proPrice.id, quantity: 1 }],
          mode: 'subscription',
          allow_promotion_codes: true, // Enable promo codes at checkout
          success_url: `${baseUrl}/settings?upgraded=true`,
          cancel_url: `${baseUrl}/settings`,
        })
      );
      
      // Track successful Stripe call
      await trackApiCall('stripe', async () => ({}));
      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Checkout error:", error);
      // Track failed Stripe call
      await trackApiCall('stripe', async () => { throw error; }).catch(() => {});
      
      const appError = toAppError(error, ErrorCode.STRIPE_UNAVAILABLE);
      res.status(appError.getStatusCode()).json(appError.toJSON());
    }
  });

  // Stripe customer portal - manage subscription
  app.post("/api/billing-portal", requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user.stripeCustomerId) {
        return res.status(400).json({ error: "No subscription found" });
      }
      
      const stripe = await getUncachableStripeClient();
      const protocol = req.get('X-Forwarded-Proto') || req.protocol || 'https';
      const baseUrl = `${protocol}://${req.get('host')}`;
      
      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${baseUrl}/settings`,
      });
      
      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Billing portal error:", error);
      res.status(500).json({ error: error.message || "Portal access failed" });
    }
  });

  // Pause subscription for 30 days (retention feature)
  app.post("/api/subscription/pause", requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user.stripeCustomerId) {
        return res.status(400).json({ error: "No subscription found" });
      }

      const stripe = await getUncachableStripeClient();
      
      // Get active subscription
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        status: 'active',
        limit: 1
      });

      if (subscriptions.data.length === 0) {
        return res.status(400).json({ error: "No active subscription to pause" });
      }

      const subscription = subscriptions.data[0];
      
      // Pause collection for 30 days
      const resumeDate = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
      await stripe.subscriptions.update(subscription.id, {
        pause_collection: {
          behavior: 'void',
          resumes_at: resumeDate
        }
      });

      console.log(`[Retention] Subscription ${subscription.id} paused for user ${user.id}`);
      res.json({ paused: true, resumesAt: new Date(resumeDate * 1000).toISOString() });
    } catch (error: any) {
      console.error("Pause subscription error:", error);
      res.status(500).json({ error: error.message || "Failed to pause subscription" });
    }
  });

  // Apply retention discount (50% off next month)
  app.post("/api/subscription/apply-retention-discount", requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      if (!user.stripeCustomerId) {
        return res.status(400).json({ error: "No subscription found" });
      }

      const stripe = await getUncachableStripeClient();
      
      // Get active subscription
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        status: 'active',
        limit: 1
      });

      if (subscriptions.data.length === 0) {
        return res.status(400).json({ error: "No active subscription", applied: false });
      }

      const subscription = subscriptions.data[0];
      
      // Check if already has a discount
      if (subscription.discounts && subscription.discounts.length > 0) {
        return res.json({ 
          applied: false, 
          message: "You already have an active discount" 
        });
      }

      // Create or find retention coupon
      let coupon;
      try {
        coupon = await stripe.coupons.retrieve('RETENTION50');
      } catch {
        // Create coupon if it doesn't exist
        coupon = await stripe.coupons.create({
          id: 'RETENTION50',
          percent_off: 50,
          duration: 'once',
          name: 'Stay with us - 50% off'
        });
      }

      // Apply coupon to subscription using discounts array
      await stripe.subscriptions.update(subscription.id, {
        discounts: [{ coupon: coupon.id }]
      });

      console.log(`[Retention] 50% discount applied for user ${user.id}`);
      res.json({ applied: true, discount: '50%' });
    } catch (error: any) {
      console.error("Apply retention discount error:", error);
      res.status(500).json({ error: error.message || "Failed to apply discount", applied: false });
    }
  });

  // Support contact form
  app.post("/api/support", async (req, res) => {
    try {
      const { email, category, subject, message } = req.body;
      
      if (!email || !category || !subject || !message) {
        return res.status(400).json({ error: "All fields are required" });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email format" });
      }

      // Validate lengths
      if (subject.length > 200) {
        return res.status(400).json({ error: "Subject too long (max 200 characters)" });
      }
      if (message.length > 5000) {
        return res.status(400).json({ error: "Message too long (max 5000 characters)" });
      }

      const validCategories = ["bug", "feature", "billing", "account", "accuracy", "other"];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: "Invalid category" });
      }

      // Log support request
      console.log("[Support Request]", {
        email,
        category,
        subject,
        message: message.substring(0, 100) + (message.length > 100 ? "..." : ""),
        timestamp: new Date().toISOString()
      });

      // In production, would integrate with Resend email service
      res.json({ success: true, message: "Support request received" });
    } catch (error: any) {
      console.error("Support form error:", error);
      res.status(500).json({ error: "Failed to submit support request" });
    }
  });

  // Change password endpoint
  app.post("/api/user/change-password", requireAuth, async (req: any, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const user = req.user;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new password are required" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters" });
      }

      // Verify current password
      const fullUser = await storage.getUser(user.id);
      if (!fullUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const isValid = await comparePasswords(currentPassword, fullUser.password);
      if (!isValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      // Hash and update new password
      const hashedPassword = await hashPassword(newPassword);
      await storage.updateUserPassword(user.id, hashedPassword);

      res.json({ message: "Password changed successfully" });
    } catch (error: any) {
      console.error("Change password error:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  // Delete account - Apple/Google require this for app store compliance
  app.post("/api/user/delete-account", requireAuth, async (req: any, res) => {
    try {
      const { password } = req.body;
      const user = req.user;

      if (!password) {
        return res.status(400).json({ message: "Password is required to delete account" });
      }

      // Verify password
      const fullUser = await storage.getUser(user.id);
      if (!fullUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const isValid = await comparePasswords(password, fullUser.password);
      if (!isValid) {
        return res.status(400).json({ message: "Password is incorrect" });
      }

      // Delete all user data in a transaction (atomic operation)
      const { 
        dailyScans, inventoryItems, businessExpenses, sourcingLocations, 
        scanSessions, batchSessions, batchItems, mysteryFlipVotes, 
        priceAlerts, shopOrders, visualMatchSessions, userCorrections,
        passwordResetTokens
      } = await import("@shared/schema");
      
      await db.transaction(async (tx) => {
        // Delete in dependency order (child tables first)
        await tx.delete(batchItems).where(eq(batchItems.userId, user.id));
        await tx.delete(batchSessions).where(eq(batchSessions.userId, user.id));
        await tx.delete(scanSessions).where(eq(scanSessions.userId, user.id));
        await tx.delete(items).where(eq(items.userId, user.id));
        await tx.delete(dailyScans).where(eq(dailyScans.userId, user.id));
        await tx.delete(inventoryItems).where(eq(inventoryItems.userId, user.id));
        await tx.delete(businessExpenses).where(eq(businessExpenses.userId, user.id));
        await tx.delete(sourcingLocations).where(eq(sourcingLocations.userId, user.id));
        await tx.delete(userAchievements).where(eq(userAchievements.userId, user.id));
        await tx.delete(userStats).where(eq(userStats.userId, user.id));
        await tx.delete(profitGoals).where(eq(profitGoals.userId, user.id));
        await tx.delete(mysteryFlipVotes).where(eq(mysteryFlipVotes.userId, user.id));
        await tx.delete(priceAlerts).where(eq(priceAlerts.userId, user.id));
        await tx.delete(shopOrders).where(eq(shopOrders.userId, user.id));
        await tx.delete(visualMatchSessions).where(eq(visualMatchSessions.userId, user.id));
        await tx.delete(userCorrections).where(eq(userCorrections.userId, user.id));
        await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
        await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id));
        
        // Finally delete the user account
        await tx.delete(users).where(eq(users.id, user.id));
      });

      // Logout the user by destroying session
      req.logout((err: any) => {
        if (err) {
          console.error("Logout error during account deletion:", err);
        }
        req.session.destroy((err: any) => {
          if (err) {
            console.error("Session destroy error:", err);
          }
          res.json({ message: "Account deleted successfully" });
        });
      });
    } catch (error: any) {
      console.error("Delete account error:", error);
      res.status(500).json({ message: "Failed to delete account" });
    }
  });

  // Push notification routes
  app.get("/api/push/vapid-key", (req, res) => {
    const key = getVapidPublicKey();
    if (!key) {
      return res.status(503).json({ message: "Push notifications not configured" });
    }
    res.json({ vapidPublicKey: key });
  });

  app.post("/api/push/subscribe", requireAuth, async (req: any, res) => {
    try {
      const { subscription } = req.body;
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return res.status(400).json({ message: "Invalid subscription data" });
      }
      await saveSubscription(req.user.id, subscription);
      res.json({ message: "Subscription saved" });
    } catch (error: any) {
      console.error("Push subscribe error:", error);
      res.status(500).json({ message: "Failed to save subscription" });
    }
  });

  app.post("/api/push/unsubscribe", requireAuth, async (req: any, res) => {
    try {
      const { endpoint } = req.body;
      if (!endpoint) {
        return res.status(400).json({ message: "Missing endpoint" });
      }
      await removeSubscription(endpoint);
      res.json({ message: "Subscription removed" });
    } catch (error: any) {
      console.error("Push unsubscribe error:", error);
      res.status(500).json({ message: "Failed to remove subscription" });
    }
  });

  // Default category profit percentages - 6 core categories
  const DEFAULT_CATEGORY_PROFIT_PERCENTS: Record<string, number> = {
    'Watches': 30,
    'Trading Cards': 25,
    'Collectibles': 25,
    'Shoes': 25,
    'Electronics': 20,
    'Other': 25
  };

  // Get category profit settings
  app.get("/api/user/category-profits", requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      const settings = user.categoryProfitPercents || DEFAULT_CATEGORY_PROFIT_PERCENTS;
      res.json({ categoryProfitPercents: { ...DEFAULT_CATEGORY_PROFIT_PERCENTS, ...settings } });
    } catch (error: any) {
      console.error("Get category profits error:", error);
      res.status(500).json({ message: "Failed to get category profit settings" });
    }
  });

  // Update category profit settings
  app.post("/api/user/category-profits", requireAuth, async (req: any, res) => {
    try {
      const { categoryProfitPercents } = req.body;
      const user = req.user;

      // Validate input
      if (!categoryProfitPercents || typeof categoryProfitPercents !== 'object') {
        return res.status(400).json({ message: "Invalid category profit settings" });
      }

      // Validate each percentage is between 15-50
      for (const [category, percent] of Object.entries(categoryProfitPercents)) {
        if (typeof percent !== 'number' || percent < 15 || percent > 50) {
          return res.status(400).json({ message: `Invalid profit percentage for ${category}. Must be 15-50%` });
        }
      }

      // Update user's category profit settings
      await db.update(users).set({ categoryProfitPercents }).where(eq(users.id, user.id));
      res.json({ message: "Category profit settings updated", categoryProfitPercents });
    } catch (error: any) {
      console.error("Update category profits error:", error);
      res.status(500).json({ message: "Failed to update category profit settings" });
    }
  });

  // Change username endpoint
  app.post("/api/user/change-username", requireAuth, async (req: any, res) => {
    try {
      const { newUsername } = req.body;
      const user = req.user;

      if (!newUsername || typeof newUsername !== 'string' || newUsername.trim().length < 3) {
        return res.status(400).json({ message: "Username must be at least 3 characters" });
      }

      const normalizedUsername = newUsername.trim();

      // Check if username is already taken
      const existingUser = await storage.getUserByUsername(normalizedUsername);
      if (existingUser && existingUser.id !== user.id) {
        return res.status(400).json({ message: "Username already taken" });
      }

      // Update username
      const updatedUser = await storage.updateUsername(user.id, normalizedUsername);
      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to update username" });
      }

      res.json({ message: "Username changed successfully", user: updatedUser });
    } catch (error: any) {
      console.error("Change username error:", error);
      res.status(500).json({ message: "Failed to change username" });
    }
  });

  // Category inference function based on keywords
  const inferCategory = (title: string): { category: string | null; confidence: 'high' | 'low' } => {
    const lowerTitle = title.toLowerCase();
    
    // Trading Cards keywords - Sports
    const sportsCardsKeywords = [
      'panini', 'prizm', 'select', 'topps', 'bowman', 'donruss', 'fleer', 'upper deck',
      'nba card', 'nfl card', 'mlb card', 'hockey card', 'basketball card', 'football card', 'baseball card',
      'lebron', 'jordan', 'kobe', 'mahomes', 'brady', 'trout', 'ohtani', 'rookie card', 'rc',
      'autograph card', 'auto card', 'psa', 'bgs', 'sgc', 'graded card', 'sports card',
      'mosaic', 'optic', 'chronicles', 'contenders', 'national treasures', 'immaculate'
    ];
    
    // Watches keywords
    const watchesKeywords = [
      'invicta', 'seiko', 'rolex', 'omega', 'casio', 'citizen', 'timex', 'fossil', 'bulova',
      'tissot', 'hamilton', 'orient', 'tag heuer', 'breitling', 'cartier', 'longines',
      'wristwatch', 'watch', 'chronograph', 'automatic watch', 'quartz watch', 'dive watch',
      'g-shock', 'submariner', 'speedmaster', 'datejust'
    ];
    
    // Electronics keywords
    const electronicsKeywords = [
      'iphone', 'ipad', 'macbook', 'samsung', 'galaxy', 'playstation', 'ps5', 'ps4', 'xbox',
      'nintendo', 'switch', 'laptop', 'tablet', 'airpods', 'headphones', 'speaker', 'camera',
      'gopro', 'drone', 'gpu', 'graphics card', 'rtx', 'processor', 'cpu', 'ssd', 'hard drive',
      'monitor', 'tv', 'television', 'smart tv', 'roku', 'apple tv', 'kindle', 'android'
    ];
    
    // Shoes keywords
    const shoesKeywords = [
      'nike', 'jordan', 'adidas', 'yeezy', 'new balance', 'air max', 'dunk', 'sb dunk',
      'air force', 'sneaker', 'sneakers', 'shoe', 'shoes', 'trainer', 'trainers',
      'puma', 'reebok', 'asics', 'vans', 'converse', 'boots', 'running shoe',
      'basketball shoe', 'air zoom', 'lebron', 'kd', 'kyrie', 'foamposite'
    ];
    
    // Trading Cards keywords - TCG (Pokemon, Magic, Yu-Gi-Oh)
    const tcgKeywords = [
      'pokemon', 'magic the gathering', 'mtg', 'yugioh', 'yu-gi-oh', 'digimon',
      'one piece card', 'flesh and blood', 'lorcana', 'charizard', 'pikachu',
      'holographic', 'holo rare', 'full art', 'v card', 'vmax', 'ex card', 'gx card',
      'booster box', 'tcg', 'trading card game', 'psa pokemon', 'bgs pokemon'
    ];
    
    // Check for matches (prioritize more specific categories)
    for (const keyword of sportsCardsKeywords) {
      if (lowerTitle.includes(keyword)) {
        return { category: 'Trading Cards', confidence: 'high' };
      }
    }
    
    for (const keyword of tcgKeywords) {
      if (lowerTitle.includes(keyword)) {
        return { category: 'Trading Cards', confidence: 'high' };
      }
    }
    
    for (const keyword of watchesKeywords) {
      if (lowerTitle.includes(keyword)) {
        return { category: 'Watches', confidence: 'high' };
      }
    }
    
    for (const keyword of electronicsKeywords) {
      if (lowerTitle.includes(keyword)) {
        return { category: 'Electronics', confidence: 'high' };
      }
    }
    
    for (const keyword of shoesKeywords) {
      if (lowerTitle.includes(keyword)) {
        return { category: 'Shoes', confidence: 'high' };
      }
    }
    
    return { category: null, confidence: 'low' };
  };

  // Barcode/UPC lookup using PriceCharting API
  app.post("/api/barcode/lookup", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as { id: number }).id;
      
      const { barcode } = req.body;
      if (!barcode || typeof barcode !== 'string') {
        return res.status(400).json({ message: "Barcode required" });
      }

      // Clean and validate barcode format (UPC-A is 12 digits, EAN-13 is 13 digits)
      const cleanBarcode = barcode.replace(/[\s-]/g, '');
      if (!/^\d{8,14}$/.test(cleanBarcode)) {
        return res.status(400).json({ message: "Invalid barcode format" });
      }

      console.log(`[Barcode] Looking up: ${cleanBarcode} for user ${userId}`);

      // Import and use PriceCharting lookup
      const { lookupByUpc } = await import('./pricecharting-api');
      const result = await lookupByUpc(cleanBarcode);

      if (!result.success) {
        return res.status(404).json({ 
          message: "Product not found in database",
          barcode: cleanBarcode,
          error: result.error
        });
      }

      // Return product info with prices
      res.json({
        success: true,
        barcode: cleanBarcode,
        product: {
          name: result.productName,
          platform: result.consoleName,
          priceChartingId: result.priceChartingId,
          prices: result.prices,
        }
      });

    } catch (error) {
      console.error("[Barcode] Lookup error:", error);
      res.status(500).json({ message: "Failed to lookup barcode" });
    }
  });

  // ============ FINALIZE SCAN RESULT (UNIFIED EXIT POINT) ============
  // ALL identification branches (toyPipeline, visualLibrary, openAI) MUST flow through this.
  // Enforces: (1) Lock objectType, (2) Brand-object allowlist, (3) min() confidence gating
  // OCR Brand Lock - immutable once set by OCR
  interface OcrBrandLock {
    locked: boolean;
    source: 'OCR' | 'VISUAL' | 'VISUAL_FIRST' | 'VISUAL_MATCH'; // OCR = text-based detection (IMMUTABLE), VISUAL = shape-based detection (requires confirmation)
    objectType: string | null;
    brandDetected: string | null;
    deterministicSignals: string[];
    rawText: string[];
    confidence: number;
  }
  
  interface ScanResultInput {
    sessionId: number;
    candidates: any[];
    source: 'toy_pipeline' | 'visual_library' | 'visual_library_fast' | 'openai' | 'brand_required';
    toyPipeline?: any;
    matchStrength?: string;
    alternatives?: any[];
    brandRequired?: boolean;
    brandAlternatives?: any[];
    requiresUpcScan?: boolean;
    upcScanReason?: string | null;
    ocrLock?: OcrBrandLock; // OCR-first authoritative lock
  }
  
  // ============ BRAND-OBJECT ALLOWLIST (GENERIC) ============
  // Each objectType maps to:
  //   - allowedBrands: brands that CAN appear in title/brandDetected
  //   - primaryBrand: the locked brand to force onto candidates (only for manufacturer brands)
  //   - isManufacturerBrand: true if primaryBrand is a real manufacturer (Funko, LEGO)
  //                          false if it's a format/category label (Action Figure) - NOT surfaced to user
  //   - excludedTerms: terms that indicate incompatible products (optional)
  // To add a new objectType, just add an entry here - no code changes needed
  const BRAND_OBJECT_CONFIG: Record<string, {
    allowedBrands: string[];
    primaryBrand: string;
    isManufacturerBrand: boolean;
    excludedTerms?: string[];
  }> = {
    'FUNKO_POP': {
      allowedBrands: ['funko', 'funko pop', 'pop!', 'pop'],
      primaryBrand: 'Funko',
      isManufacturerBrand: true,
      excludedTerms: ['lego', 'ucs', 'technic', 'creator', 'bionicle', 'duplo', 'mindstorms'],
    },
    'LEGO_SET': {
      allowedBrands: ['lego', 'duplo'],
      primaryBrand: 'LEGO',
      isManufacturerBrand: true,
      excludedTerms: ['funko', 'pop!', 'vinyl figure', 'bobblehead'],
    },
    'HOT_WHEELS': {
      allowedBrands: ['hot wheels', 'hotwheels', 'mattel'],
      primaryBrand: 'Hot Wheels',
      isManufacturerBrand: true,
      excludedTerms: ['matchbox', 'johnny lightning', 'greenlight'],
    },
    'ACTION_FIGURE': {
      allowedBrands: ['hasbro', 'mattel', 'neca', 'mcfarlane', 'mezco', 'diamond select'],
      primaryBrand: 'Action Figure',
      isManufacturerBrand: false, // Format label, NOT surfaced to user
      excludedTerms: ['funko', 'lego'],
    },
    // GENERIC FALLBACK: Used when objectType confidence is too low to trust
    'GENERIC_TOY_COLLECTIBLE': {
      allowedBrands: [], // Allow any brand
      primaryBrand: '', // No brand - forces "Unknown" display
      isManufacturerBrand: false,
      excludedTerms: [],
    },
  };
  
  // Franchise terms that are NOT product brands (should never trigger exclusion)
  const FRANCHISE_TERMS = ['marvel', 'star wars', 'disney', 'dc', 'pokemon', 'nintendo', 'harry potter', 'lord of the rings', 'game of thrones', 'stranger things', 'anime'];
  
  // ============================================================================
  // DETERMINISTIC SIGNAL REQUIREMENTS for manufacturer brand labels
  // Only allow brand labels when these STRONG packaging signals are detected
  // ============================================================================
  interface ObjectTypeSignalResult {
    objectType: string | null;
    signalStrength: 'STRONG' | 'WEAK' | 'NONE';
    deterministicSignals: string[]; // Which strong signals were detected
  }
  
  // Helper: Derive objectType with signal strength assessment
  // STRONG = deterministic packaging signals (logos, text patterns)
  // WEAK = inferred from category/title keywords (unreliable)
  function deriveObjectTypeFromSignals(candidate: any): ObjectTypeSignalResult {
    const titleLower = (candidate.title || '').toLowerCase();
    const categoryLower = (candidate.category || '').toLowerCase();
    const brandLower = (candidate.brandDetected || '').toLowerCase();
    const combined = `${titleLower} ${categoryLower} ${brandLower}`;
    const visionSignals = (candidate.visionSignals || []).map((s: string) => s.toLowerCase());
    const combinedSignals = [...visionSignals, combined].join(' ');
    
    const deterministicSignals: string[] = [];
    
    // ============================================================================
    // FUNKO_POP: Require STRONG deterministic signals
    // STRONG: "funko" + "pop!" combo, OR "funko pop", OR Funko packaging patterns
    // WEAK: Just "vinyl figure" or "pop figure" alone
    // ============================================================================
    const hasFunkoText = combinedSignals.includes('funko');
    const hasPopBang = combinedSignals.includes('pop!');
    const hasFunkoPop = combinedSignals.includes('funko pop');
    const hasPopNumberBadge = /pop[!]?\s*#?\d+/.test(combinedSignals); // "Pop #123" pattern
    const hasVinylFigure = combinedSignals.includes('vinyl figure');
    
    // Strong Funko signals: multiple packaging indicators
    const funkoStrongSignalCount = [
      hasFunkoText && hasPopBang, // Funko + Pop! combo
      hasFunkoPop, // Explicit "Funko Pop"
      hasPopNumberBadge, // Pop number badge (e.g., "Pop #123")
    ].filter(Boolean).length;
    
    if (funkoStrongSignalCount >= 1) {
      if (hasFunkoText) deterministicSignals.push('FUNKO_TEXT');
      if (hasPopBang) deterministicSignals.push('POP_LOGO');
      if (hasPopNumberBadge) deterministicSignals.push('NUMBER_BADGE');
      
      // Exclude if LEGO signals present
      if (!combinedSignals.includes('lego') && !combinedSignals.includes('brickheadz')) {
        return { objectType: 'FUNKO_POP', signalStrength: 'STRONG', deterministicSignals };
      }
    }
    
    // Weak Funko signal: just vinyl figure (could be other brands)
    if (hasVinylFigure && !combinedSignals.includes('lego')) {
      return { objectType: 'FUNKO_POP', signalStrength: 'WEAK', deterministicSignals: ['VINYL_FIGURE_ONLY'] };
    }
    
    // ============================================================================
    // LEGO_SET: Require STRONG deterministic signals
    // STRONG: Explicit "LEGO" text, studded brick patterns, LEGO box layout
    // WEAK: Just "building blocks" or "UCS" alone
    // ============================================================================
    const hasLegoText = combinedSignals.includes('lego');
    const hasLegoSet = combinedSignals.includes('lego set');
    const hasLegoMinifigure = combinedSignals.includes('lego minifigure');
    const hasUcs = combinedSignals.includes('ucs'); // UCS alone is weak
    const hasBuildingBlocks = combinedSignals.includes('building blocks');
    
    // Strong LEGO signals
    if (hasLegoText || hasLegoSet || hasLegoMinifigure) {
      if (hasLegoText) deterministicSignals.push('LEGO_TEXT');
      if (hasLegoMinifigure) deterministicSignals.push('MINIFIGURE');
      return { objectType: 'LEGO_SET', signalStrength: 'STRONG', deterministicSignals };
    }
    
    // Weak LEGO signal: UCS or building blocks alone
    if (hasUcs || (hasBuildingBlocks && !combinedSignals.includes('mega bloks'))) {
      return { objectType: 'LEGO_SET', signalStrength: 'WEAK', deterministicSignals: ['UCS_OR_BLOCKS_ONLY'] };
    }
    
    // ============================================================================
    // HOT_WHEELS: Require STRONG deterministic signals
    // STRONG: "Hot Wheels" text
    // WEAK: Just "diecast car" alone
    // ============================================================================
    const hasHotWheels = combinedSignals.includes('hot wheels') || combinedSignals.includes('hotwheels');
    const hasMatchbox = combinedSignals.includes('matchbox');
    const hasDiecastCar = combinedSignals.includes('diecast car');
    
    if (hasHotWheels) {
      deterministicSignals.push('HOT_WHEELS_TEXT');
      return { objectType: 'HOT_WHEELS', signalStrength: 'STRONG', deterministicSignals };
    }
    if (hasMatchbox) {
      deterministicSignals.push('MATCHBOX_TEXT');
      return { objectType: 'HOT_WHEELS', signalStrength: 'STRONG', deterministicSignals };
    }
    
    // Weak Hot Wheels signal
    if (hasDiecastCar) {
      return { objectType: 'HOT_WHEELS', signalStrength: 'WEAK', deterministicSignals: ['DIECAST_CAR_ONLY'] };
    }
    
    // ============================================================================
    // ACTION_FIGURE: Always WEAK (no deterministic brand signals)
    // ============================================================================
    if ((combinedSignals.includes('action figure') || combinedSignals.includes('poseable figure')) &&
        !combinedSignals.includes('funko') && !combinedSignals.includes('pop!')) {
      return { objectType: 'ACTION_FIGURE', signalStrength: 'WEAK', deterministicSignals: ['ACTION_FIGURE_KEYWORD'] };
    }
    
    // No specific objectType detected
    return { objectType: null, signalStrength: 'NONE', deterministicSignals: [] };
  }
  
  function finalizeScanResult(input: ScanResultInput): any {
    console.log('=== FINAL_PIPELINE_CONFIRMED: finalizeScanResult invoked ===');
    
    const { sessionId, candidates, source, toyPipeline, ocrLock } = input;
    
    // ============================================================================
    // STEP 1: DERIVE objectType from signals with OCR as AUTHORITATIVE source
    // Priority: OCR (IMMUTABLE) > toyPipeline > candidates' visual signals > GENERIC
    // If OCR locked a brand, NO downstream stage may override it
    // ============================================================================
    let lockedObjectType: string | null = null;
    let lockedBrand: string | null = null;
    let brandConfig: typeof BRAND_OBJECT_CONFIG[string] | null = null;
    let objectTypeConfidence = 1; // Default to 100% if no objectType detection
    
    let signalStrength: 'STRONG' | 'WEAK' | 'NONE' = 'NONE';
    let deterministicSignals: string[] = [];
    let brandSource: 'OCR' | 'VISION' | 'NONE' = 'NONE';
    
    // ============================================================================
    // Priority 0: OCR LOCK (HIGHEST AUTHORITY - IMMUTABLE)
    // If OCR detected a manufacturer brand, it is LOCKED and cannot be overridden
    // ============================================================================
    if (ocrLock?.locked && ocrLock.objectType && ocrLock.brandDetected) {
      lockedObjectType = ocrLock.objectType;
      lockedBrand = ocrLock.brandDetected;
      objectTypeConfidence = ocrLock.confidence;
      signalStrength = 'STRONG';
      deterministicSignals = ocrLock.deterministicSignals;
      brandSource = 'OCR';
      console.log(`[Finalize] === OCR LOCK APPLIED (IMMUTABLE) ===`);
      console.log(`[Finalize] objectType: ${lockedObjectType}, brand: ${lockedBrand}, conf: ${objectTypeConfidence}`);
      console.log(`[Finalize] OCR signals: ${deterministicSignals.join(', ')}`);
    }
    // Priority 1: Use toyPipeline if OCR not locked
    else if (toyPipeline?.stage1?.objectType) {
      lockedObjectType = toyPipeline.stage1.objectType;
      objectTypeConfidence = toyPipeline.stage1.confidence || 0.9;
      signalStrength = 'STRONG';
      deterministicSignals = toyPipeline.stage1.deterministicSignals || ['TOY_PIPELINE_DETECTION'];
      brandSource = 'VISION';
      
      // If OCR found partial signals (not locked but has signals), require agreement
      if (ocrLock && ocrLock.deterministicSignals.length > 0 && !ocrLock.locked) {
        // OCR found some signals but not enough to lock - check if vision agrees
        const ocrSignalsLower = ocrLock.deterministicSignals.join(' ').toLowerCase();
        const visionObjectType = toyPipeline.stage1.objectType.toLowerCase();
        
        // If OCR found "Mattel" but vision says "FUNKO_POP", that's a conflict
        if (ocrSignalsLower.includes('mattel') && !visionObjectType.includes('barbie') && !visionObjectType.includes('hot_wheels')) {
          console.log(`[Finalize] OCR/VISION CONFLICT: OCR found Mattel but vision says ${lockedObjectType} - forcing generic`);
          lockedObjectType = 'GENERIC_TOY_COLLECTIBLE';
          lockedBrand = null;
          objectTypeConfidence = 0.50;
          signalStrength = 'WEAK';
        }
      }
      
      console.log(`[Finalize] objectType from toyPipeline: ${lockedObjectType} (conf=${objectTypeConfidence}, signals=${deterministicSignals.join(',')})`);
    } else {
      // Priority 2: Derive objectType from candidate signals (visualLibrary/OpenAI paths)
      const signalResults: ObjectTypeSignalResult[] = [];
      
      for (const c of candidates) {
        const result = deriveObjectTypeFromSignals(c);
        if (result.objectType) {
          signalResults.push(result);
        }
      }
      
      const strongSignals = signalResults.filter(r => r.signalStrength === 'STRONG');
      const weakSignals = signalResults.filter(r => r.signalStrength === 'WEAK');
      
      if (strongSignals.length > 0) {
        const bestResult = strongSignals[0];
        lockedObjectType = bestResult.objectType;
        signalStrength = 'STRONG';
        deterministicSignals = bestResult.deterministicSignals;
        objectTypeConfidence = 0.85;
        brandSource = 'VISION';
        
        // Cross-check with OCR: if vision says FUNKO but OCR saw nothing, downgrade
        if (ocrLock && ocrLock.rawText.length > 0 && ocrLock.deterministicSignals.length === 0) {
          // OCR ran but found NO brand signals - vision alone is not enough for manufacturer brand
          console.log(`[Finalize] Vision detected ${lockedObjectType} but OCR found no brand signals - downgrading`);
          lockedObjectType = 'GENERIC_TOY_COLLECTIBLE';
          lockedBrand = null;
          objectTypeConfidence = 0.60;
          signalStrength = 'WEAK';
        }
        
        console.log(`[Finalize] objectType from STRONG signals: ${lockedObjectType} (conf=${objectTypeConfidence}, signals=${deterministicSignals.join(',')})`);
      } else if (weakSignals.length > 0) {
        const detectedType = weakSignals[0].objectType;
        lockedObjectType = 'GENERIC_TOY_COLLECTIBLE';
        signalStrength = 'WEAK';
        deterministicSignals = weakSignals[0].deterministicSignals;
        objectTypeConfidence = 0.50;
        brandSource = 'NONE';
        console.log(`[Finalize] WEAK signals detected (${detectedType}) - forcing GENERIC_TOY_COLLECTIBLE (conf=${objectTypeConfidence})`);
      } else {
        console.log(`[Finalize] No objectType detected - using GENERIC path`);
      }
    }
    
    // ============================================================================
    // CRITICAL: Enforce 80% confidence threshold for manufacturer brand labels
    // If objectTypeConfidence < 0.80, downgrade to GENERIC_TOY_COLLECTIBLE
    // ============================================================================
    if (lockedObjectType && objectTypeConfidence < 0.80) {
      const originalType = lockedObjectType;
      lockedObjectType = 'GENERIC_TOY_COLLECTIBLE';
      console.log(`[Finalize] objectTypeConf ${objectTypeConfidence} < 0.80 - downgrading ${originalType} to GENERIC_TOY_COLLECTIBLE`);
    }
    
    // Get brand config if objectType was determined
    // CRITICAL: If OCR already locked the brand, do NOT override it
    if (lockedObjectType) {
      brandConfig = BRAND_OBJECT_CONFIG[lockedObjectType] || null;
      
      // If OCR locked the brand, it is IMMUTABLE - use it directly
      if (brandSource === 'OCR' && ocrLock?.brandDetected) {
        lockedBrand = ocrLock.brandDetected;
        console.log(`[Finalize] Brand from OCR (IMMUTABLE): ${lockedBrand}`);
      }
      // Otherwise, only set lockedBrand for STRONG signals with high confidence
      else if (signalStrength === 'STRONG' && objectTypeConfidence >= 0.80 && brandConfig?.isManufacturerBrand) {
        // CRITICAL: Vision-only brand requires OCR to have found NO conflicting signals
        if (!ocrLock || ocrLock.rawText.length === 0 || ocrLock.deterministicSignals.length === 0) {
          lockedBrand = brandConfig.primaryBrand || null;
        } else {
          // OCR ran and found signals - vision cannot assign brand without OCR agreement
          console.log(`[Finalize] Vision wants brand but OCR found signals - blocking brand assignment`);
          lockedBrand = null;
        }
      } else {
        lockedBrand = null; // Force null for weak/low confidence
      }
      console.log(`[Finalize] Brand lock: ${lockedBrand || 'null'} (source=${brandSource}, strength=${signalStrength})`);
    }
    
    // ============================================================================
    // STEP 2: UNCONDITIONALLY apply brand-object compatibility filter
    // Runs for ALL scans when objectType is known, regardless of source
    // ============================================================================
    const filteredCandidates = candidates.map((c: any) => {
      // If we have a locked objectType with config, enforce brand compatibility
      if (lockedObjectType && brandConfig) {
        const titleLower = (c.title || '').toLowerCase();
        const brandLower = (c.brandDetected || '').toLowerCase();
        const combinedText = `${titleLower} ${brandLower}`;
        
        // Check for excluded terms (but ignore if it's a franchise term)
        if (brandConfig.excludedTerms) {
          for (const excludedTerm of brandConfig.excludedTerms) {
            if (combinedText.includes(excludedTerm)) {
              // Only discard if this is actually an incompatible product brand
              if (!FRANCHISE_TERMS.includes(excludedTerm)) {
                console.log(`[Finalize] DISCARDED candidate: "${c.title}" - contains excluded term "${excludedTerm}" for ${lockedObjectType}`);
                return null;
              }
            }
          }
        }
        
        // Enforce allowedBrands list (if objectType has one)
        if (brandConfig.allowedBrands && brandConfig.allowedBrands.length > 0) {
          const candidateBrandLower = (c.brandDetected || '').toLowerCase();
          const hasAllowedBrand = brandConfig.allowedBrands.some(allowed => 
            combinedText.includes(allowed.toLowerCase())
          );
          
          // If candidate has a brand but it's NOT in allowedBrands, it's incompatible
          if (candidateBrandLower && !hasAllowedBrand) {
            // Check if it's a franchise term (those are OK)
            const isFranchise = FRANCHISE_TERMS.some(f => candidateBrandLower.includes(f));
            if (!isFranchise) {
              console.log(`[Finalize] DISCARDED candidate: "${c.title}" - brand "${c.brandDetected}" not in allowedBrands for ${lockedObjectType}`);
              return null;
            }
          }
        }
        
        // Only set brandDetected if it's a real manufacturer brand (not a format label)
        if (brandConfig.isManufacturerBrand && lockedBrand) {
          c.brandDetected = lockedBrand;
        }
        // For format-based entries (isManufacturerBrand=false), preserve original brandDetected
      }
      
      return c;
    }).filter(Boolean); // Remove nulls (discarded candidates)
    
    // ============================================================================
    // NEVER-FAIL SAFEGUARD: If all candidates were filtered, add a fallback
    // Detection ≠ failure. Always return at least one candidate for confirmation.
    // ============================================================================
    if (filteredCandidates.length === 0) {
      console.log('[Finalize] All candidates filtered - adding NEVER-FAIL fallback');
      filteredCandidates.push({
        id: "never_fail_fallback",
        title: lockedBrand ? `${lockedBrand} Item (Unconfirmed)` : 'Unknown Item',
        category: 'General',
        estimatedValue: "Unknown",
        keyIdentifiers: [],
        confidence: 10,
        visionSignals: ['Could not identify - please enter details manually'],
        source: source,
        matchStrength: 'weak',
        requiresManualEntry: true,
        brandDetected: null,
        overallConfidence: 10,
      });
    }
    
    // ============================================================================
    // STEP 3: UNCONDITIONALLY compute overallConfidence
    // overallConfidence = min(objectTypeConf, brandConf, itemConf)
    // This runs for ALL scans, regardless of source
    // ============================================================================
    const isGenericFallback = lockedObjectType === 'GENERIC_TOY_COLLECTIBLE';
    
    const finalCandidates = filteredCandidates.map((c: any) => {
      const brandConf = 1; // After filtering, brand is compatible
      const itemConf = (c.confidence || 0) / 100;
      
      // Use objectTypeConfidence derived above (from toyPipeline or signals)
      const overallConfidence = Math.min(objectTypeConfidence, brandConf, itemConf);
      c.overallConfidence = Math.round(overallConfidence * 100);
      
      // ============================================================================
      // CRITICAL: Handle GENERIC_TOY_COLLECTIBLE fallback
      // When we couldn't determine a specific objectType with high confidence,
      // NEVER show a manufacturer brand - UNLESS OCR LOCKED IT (IMMUTABLE)
      // ============================================================================
      // OCR-LOCKED BRANDS ARE IMMUTABLE: If ocrLock.locked=true, NEVER clear the brand
      const isOcrLocked = ocrLock && ocrLock.locked === true;
      
      if ((isGenericFallback || signalStrength === 'WEAK') && !isOcrLocked) {
        // Force generic label for toys with weak/uncertain signals - ONLY if OCR didn't lock
        c.brandDetected = null; // Clear any guessed brand
        c.title = 'Toy & Collectible (Unconfirmed)';
        c.requiresSelection = true;
        c.visionSignals = ['Could not confirm brand - please verify or enter manually'];
        console.log(`[Finalize] GENERIC_FALLBACK: "${c.title}" - brand cleared (OCR not locked)`);
        return c;
      }
      
      // If OCR locked the brand but confidence is low, KEEP the brand but adjust UI messaging
      if ((isGenericFallback || signalStrength === 'WEAK') && isOcrLocked) {
        // Brand stays LOCKED, but UI messaging shows low confidence
        c.brandDetected = lockedBrand; // IMMUTABLE - keep OCR brand
        c.title = `${lockedBrand} Item (Confirm Details)`;
        c.requiresSelection = true;
        c.visionSignals = ['Brand confirmed via text - please verify item details'];
        console.log(`[Finalize] OCR-LOCKED BRAND: "${lockedBrand}" preserved despite low confidence (UI prompts for details)`);
        return c;
      }
      
      // Store brandDetected for UI display (only for STRONG signals with high confidence)
      if (lockedBrand && !c.brandDetected && signalStrength === 'STRONG' && objectTypeConfidence >= 0.80) {
        c.brandDetected = lockedBrand;
      }
      
      // Enforce: no item-level labels below 80%
      if (c.overallConfidence < 80 && !c.requiresManualEntry && !c.requiresSelection) {
        // Downgrade to generic label - but only use lockedBrand if it's trustworthy
        const genericLabel = (lockedBrand && signalStrength === 'STRONG') 
          ? `${lockedBrand} Collectible` 
          : (c.category ? `${c.category} Item` : 'Collectible Item');
        console.log(`[Finalize] Downgrading "${c.title}" to "${genericLabel}" (conf=${c.overallConfidence}%)`);
        c.title = genericLabel;
        c.requiresSelection = true;
        c.visionSignals = ['Low confidence - please select or enter details'];
      }
      
      return c;
    });
    
    // ============================================================================
    // SELF-CHECK ASSERTIONS: Prove OCR-first brand gating is working
    // These assertions run EVERY time and log violations for debugging
    // CRITICAL: Manufacturer brands MUST originate from OCR
    // ============================================================================
    const MANUFACTURER_BRANDS = ['funko', 'lego', 'hot wheels', 'mattel', 'hasbro', 'barbie'];
    let brandGatingViolations: string[] = [];
    
    for (const c of finalCandidates) {
      const candidateBrand = (c.brandDetected || '').toLowerCase();
      const candidateTitle = (c.title || '').toLowerCase();
      
      // Check 1: If brandDetected is a manufacturer brand, it MUST have come from OCR
      // CRITICAL: OCR-locked brands are IMMUTABLE - confidence may affect UI, never classification
      const candidateOcrLocked = ocrLock && ocrLock.locked === true;
      
      if (MANUFACTURER_BRANDS.some(mb => candidateBrand.includes(mb))) {
        // CRITICAL: Manufacturer brand MUST originate from OCR
        if (brandSource !== 'OCR') {
          brandGatingViolations.push(
            `OCR_VIOLATION: brandDetected="${c.brandDetected}" emitted without OCR authority (source=${brandSource})`
          );
          // FIX: Clear the brand - OCR did not authorize it
          c.brandDetected = null;
        }
        // NOTE: When OCR locked the brand, confidence does NOT affect classification
        // Only log violations for non-OCR-locked brands
        if (!candidateOcrLocked) {
          if (signalStrength !== 'STRONG') {
            brandGatingViolations.push(
              `VIOLATION: brandDetected="${c.brandDetected}" emitted with signalStrength=${signalStrength} (expected STRONG)`
            );
            c.brandDetected = null;
          }
          if (objectTypeConfidence < 0.80) {
            brandGatingViolations.push(
              `VIOLATION: brandDetected="${c.brandDetected}" emitted with objectTypeConf=${objectTypeConfidence} (expected >=0.80)`
            );
            c.brandDetected = null;
          }
        } else {
          // OCR-locked: confidence affects UI messaging only, NOT classification
          console.log(`[Finalize] OCR-LOCKED: "${c.brandDetected}" preserved (conf=${objectTypeConfidence} affects UI only)`);
        }
      }
      
      // Check 2: If title contains manufacturer brand, must have OCR authority
      // EXCEPTION: OCR-locked brands can appear in title regardless of confidence
      if (MANUFACTURER_BRANDS.some(mb => candidateTitle.includes(mb))) {
        if (brandSource !== 'OCR') {
          brandGatingViolations.push(
            `OCR_VIOLATION: title="${c.title}" contains manufacturer brand without OCR authority (source=${brandSource})`
          );
          // FIX: Force generic title - OCR did not authorize manufacturer brand
          c.title = 'Toy & Collectible (Unconfirmed)';
          c.brandDetected = null;
          c.requiresSelection = true;
        }
        // NOTE: If OCR locked, confidence does NOT affect title - brand stays in title
        // Only clear title for non-OCR-locked brands with low confidence
        else if (!candidateOcrLocked && (signalStrength !== 'STRONG' || objectTypeConfidence < 0.80)) {
          brandGatingViolations.push(
            `VIOLATION: title="${c.title}" contains brand with low confidence (not OCR-locked)`
          );
          c.title = 'Toy & Collectible (Unconfirmed)';
          c.brandDetected = null;
          c.requiresSelection = true;
        }
      }
    }
    
    // ============================================================================
    // INVARIANT SELF-CHECK: Funko brand MUST have OCR "Funko" text
    // If manufacturer is Funko but OCR doesn't contain "Funko", downgrade to generic
    // ============================================================================
    const ocrRawTextLower = (ocrLock?.rawText || []).join(' ').toLowerCase();
    const ocrHasFunkoText = ocrRawTextLower.includes('funko');
    
    for (const c of finalCandidates) {
      const candidateBrand = (c.brandDetected || '').toLowerCase();
      const candidateTitle = (c.title || '').toLowerCase();
      
      // INVARIANT: If candidate claims Funko brand but OCR doesn't have "Funko" text
      if (candidateBrand.includes('funko') && !ocrHasFunkoText) {
        brandGatingViolations.push(
          `INVARIANT_VIOLATION: brandDetected="${c.brandDetected}" claims Funko but OCR text does not contain "Funko"`
        );
        // FIX: Clear brand and downgrade to generic
        c.brandDetected = null;
        c.title = 'Toy & Collectible (Unconfirmed)';
        c.requiresSelection = true;
        c.visionSignals = ['Could not verify Funko branding - please confirm'];
        console.log(`[INVARIANT] Funko brand cleared - OCR did not contain "Funko" text`);
      }
      
      // Also check title for Funko without OCR authority
      if (candidateTitle.includes('funko') && !ocrHasFunkoText) {
        brandGatingViolations.push(
          `INVARIANT_VIOLATION: title="${c.title}" mentions Funko but OCR text does not contain "Funko"`
        );
        c.title = 'Toy & Collectible (Unconfirmed)';
        c.brandDetected = null;
        c.requiresSelection = true;
        console.log(`[INVARIANT] Funko title cleared - OCR did not contain "Funko" text`);
      }
    }
    
    // Log all violations for debugging
    if (brandGatingViolations.length > 0) {
      console.error('[BRAND_GATING_VIOLATION]', JSON.stringify(brandGatingViolations, null, 2));
    } else {
      console.log('[BRAND_GATING_PASSED] All candidates passed OCR-first brand gating checks');
    }
    
    // ============================================================================
    // FUNKO POP: Apply canonical label from OCR parsing if available
    // This ensures the displayed title matches "Funko – {Name} – #{Number}"
    // ============================================================================
    const funkoParsed = (ocrLock as any)?.funkoParsed;
    if (funkoParsed && ocrLock?.locked && ocrLock.objectType === 'FUNKO_POP') {
      for (const c of finalCandidates) {
        // Apply canonical label from OCR parsing
        c.title = funkoParsed.canonicalLabel;
        c.brandDetected = 'Funko';
        c.category = 'Collectibles';
        
        // Mark for confirmation if partial match
        if (funkoParsed.requiresConfirmation) {
          c.requiresSelection = true;
          c.visionSignals = ['Funko Pop detected - please confirm item details'];
        }
        
        // Store Funko-specific metadata for downstream use
        c.funkoParsed = funkoParsed;
        
        console.log(`[Finalize] Applied Funko canonical label: "${funkoParsed.canonicalLabel}"`);
      }
    }
    
    // Build final response
    const response: any = {
      sessionId,
      candidates: finalCandidates,
      matchStrength: input.matchStrength || (source === 'toy_pipeline' ? 'pipeline' : 'none'),
      identifySource: source,
      alternatives: input.alternatives || [],
      // DEBUG: Include OCR-first gating metadata
      _brandGating: {
        brandSource,
        signalStrength,
        objectTypeConfidence,
        lockedObjectType,
        lockedBrand,
        deterministicSignals,
        ocrRawText: ocrLock?.rawText || [],
        ocrLocked: ocrLock?.locked || false,
        funkoParsed: funkoParsed || null,
        violations: brandGatingViolations,
        passed: brandGatingViolations.length === 0,
      },
    };
    
    // Add optional fields
    if (toyPipeline) {
      response.toyPipeline = {
        ...toyPipeline,
        lockedBrand, // Ensure lockedBrand is always present
      };
    }
    if (input.brandRequired) {
      response.brandRequired = true;
      response.brandAlternatives = input.brandAlternatives;
    }
    if (input.requiresUpcScan) {
      response.requiresUpcScan = true;
      response.upcScanReason = input.upcScanReason;
    }
    
    console.log(`[Finalize] Returning ${finalCandidates.length} candidates via ${source} (brandGating: ${brandGatingViolations.length === 0 ? 'PASSED' : 'FIXED'})`);
    return response;
  }

  // Photo-based item identification using OpenAI Vision
  app.post("/api/scan-sessions/identify", requireAuth, async (req, res) => {
    console.log('[Identify] === REQUEST RECEIVED ===' );
    try {
      const userId = (req.user as { id: number }).id;
      
      // Validate request body - front image required, back image optional
      const { imageBase64, backImageBase64 } = req.body;
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({ message: "Image data required" });
      }
      
      const hasBackImage = backImageBase64 && typeof backImageBase64 === 'string';
      if (hasBackImage) {
        console.log('[Scan] Front + Back card images provided for enhanced identification');
      }

      // Check scan limits
      const scanStatus = await storage.canUserScan(userId);
      if (!scanStatus.allowed) {
        return res.status(429).json({ message: "Daily scan limit reached" });
      }

      // Create scan session early
      const session = await storage.createScanSession(userId);
      const imageDataUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
      await storage.updateScanSession(session.id, userId, { 
        status: 'identifying',
        imageUrl: imageDataUrl,
      });

      // ============================================================================
      // VISUAL-FIRST PIPELINE WITH PARALLEL QUALITY CHECK
      // Run visual library match + quality check in PARALLEL for speed
      // Quality check must pass before returning on fast path
      // Watch brand verification is enforced via visual matching's built-in brand detection
      // ============================================================================
      const visualFirstStartTime = Date.now();
      
      // Declare these outside try block so fallback path can access them
      let visualFirstDetectedCategory: string | undefined = undefined;
      let visualFirstQualityPassed = true;
      
      try {
        console.log('[VisualFirst] === PARALLEL: Category Detection + Quality Check ===');
        
        // Import detectCategoryVisual for brand/category routing
        const { detectCategoryVisual } = await import('./visual-matching');
        
        // STEP 1: Run category detection + quality check in parallel (both are fast)
        const [categoryResult, qualityCheckResult] = await Promise.all([
          // Category/brand detection (fast - uses embedding)
          detectCategoryVisual(imageBase64).catch(() => null),
          // Lightweight quality check (low detail for speed)
          (async () => {
            try {
              const qcResponse = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{
                  role: 'user',
                  content: [
                    { type: 'text', text: 'Is this image clear enough to identify an item? Respond with JSON: {"isUsable": true/false, "reason": "brief reason"}' },
                    { type: 'image_url', image_url: { url: imageDataUrl, detail: 'low' } }
                  ]
                }],
                max_tokens: 100,
                temperature: 0.1
              });
              const content = qcResponse.choices[0]?.message?.content || '{}';
              const match = content.match(/\{[\s\S]*\}/);
              return match ? JSON.parse(match[0]) : { isUsable: true };
            } catch {
              return { isUsable: true }; // Don't block on quality check failure
            }
          })()
        ]);
        
        // Log category detection result and store for fallback path
        visualFirstDetectedCategory = categoryResult && categoryResult.confidence >= 0.90 ? categoryResult.categoryKey : undefined;
        visualFirstQualityPassed = qualityCheckResult.isUsable !== false;
        
        if (visualFirstDetectedCategory && categoryResult) {
          console.log(`[VisualFirst] Brand-detected category: ${categoryResult.category} (${(categoryResult.confidence * 100).toFixed(0)}%) - routing to ${visualFirstDetectedCategory}`);
        }
        
        // STEP 2: Run visual matching WITH category routing
        const visualResult = await identifyWithVisualLibrary(imageBase64, {
          fallbackToOpenAI: false,
          category: visualFirstDetectedCategory, // Pass detected category for focused search
        });
        
        const visualDuration = Date.now() - visualFirstStartTime;
        console.log(`[VisualFirst] Parallel ops completed in ${visualDuration}ms`);
        console.log(`[VisualFirst] Quality check: ${visualFirstQualityPassed ? 'PASS' : 'FAIL'}`);
        
        // QUALITY GATE: Block if image is unusable
        if (!qualityCheckResult.isUsable) {
          console.log(`[VisualFirst] Image quality too low: ${qualityCheckResult.reason}`);
          return res.status(422).json({
            message: "Image quality too low for identification",
            code: "IMAGE_QUALITY_LOW",
            issues: [qualityCheckResult.reason || 'unclear'],
            recommendation: 'retake',
            allowManualEntry: true
          });
        }
        
        // WATCH BRAND REQUIRED: If watch detected but brand unreadable
        if (!visualResult.success && visualResult.error === 'BRAND_REQUIRED') {
          console.log('[VisualFirst] Watch brand unreadable - requiring retry or manual entry');
          
          const finalResponse = finalizeScanResult({
            sessionId: session.id,
            candidates: [],
            source: 'brand_required',
            brandRequired: true,
            brandAlternatives: visualResult.brandAlternatives || [],
            ocrLock: { locked: false, source: 'VISUAL_FIRST', objectType: null, brandDetected: null, deterministicSignals: [], rawText: [], confidence: 0 },
          });
          finalResponse.error = 'Could not read watch brand. Please try again with a clearer photo or enter details manually.';
          
          console.log('=== FAST PATH: BRAND_REQUIRED ===');
          return res.json(finalResponse);
        }
        
        // HIGH CONFIDENCE MATCH - CHECK TIERED GATES
        if (visualResult.success && visualResult.candidate) {
          const vc = visualResult.candidate;
          const confidence = vc.confidence || 0;
          const matchStrength = vc.matchStrength || 'weak';
          
          // Tiered confidence gates:
          // - "strong" matchStrength OR confidence ≥90% → immediate return
          // - "moderate" matchStrength OR confidence ≥80% → return with verify prompt
          // - "weak" or <80% → fall through to AI pipeline
          
          const isHighConfidence = matchStrength === 'strong' || confidence >= 0.90;
          const isMediumConfidence = matchStrength === 'moderate' || (confidence >= 0.80 && confidence < 0.90);
          
          // For watches: require brand confirmation (visual matching already handles this)
          const isWatch = (vc.category || '').toLowerCase().includes('watch');
          const hasBrand = !!(vc.brand && vc.brand.length > 0);
          
          // WATCH GATE: Don't fast-return watches without confirmed brand
          if (isWatch && !hasBrand) {
            console.log(`[VisualFirst] Watch detected but no brand confirmed - falling through to full pipeline`);
            // Fall through to full pipeline for proper brand verification
          } else if (isHighConfidence || isMediumConfidence) {
            console.log(`[VisualFirst] ${isHighConfidence ? 'HIGH' : 'MEDIUM'} confidence match: ${vc.title} (${matchStrength}, ${(confidence * 100).toFixed(0)}%)`);
            
            // Build proper OCR lock for downstream compatibility
            const fastOcrLock: OcrBrandLock = {
              locked: hasBrand,
              source: 'VISUAL_MATCH',
              objectType: isWatch ? 'WATCH' : null,
              brandDetected: vc.brand || null,
              deterministicSignals: hasBrand ? ['VISUAL_BRAND_CONFIRMED'] : [],
              rawText: [],
              confidence: confidence,
            };
            
            // Convert to candidate format
            // DIAGNOSTIC: Log watch colors for debugging
            if (isWatch) {
              console.log(`[WATCH COLORS] Visual match colors: dialColor=${vc.dialColor}, bezelColor=${vc.bezelColor}`);
            }
            
            const visualCandidate = {
              id: "match_1",
              title: vc.title,
              category: vc.category,
              familyId: vc.familyId,
              estimatedValue: vc.estimatedValue || "Unknown",
              keyIdentifiers: [vc.brand, vc.familyName].filter(Boolean) as string[],
              confidence: Math.round(confidence * 100),
              visionSignals: [`Visual library match (${(confidence * 100).toFixed(0)}%)`],
              brandDetected: vc.brand || null,
              source: 'visual_library_fast',
              matchStrength,
              needsMoreInfo: isMediumConfidence ? 'Please verify this identification' : undefined,
              needsModelSelection: vc.needsModelSelection,
              modelCandidates: vc.modelCandidates,
              // Include watch colors detected via OCR - with fallbacks
              dialColor: vc.dialColor || undefined,
              bezelColor: vc.bezelColor || undefined,
            };
            
            // Early library learning (fire-and-forget)
            if (vc.familyId && imageDataUrl) {
              const catLower = (vc.category || '').toLowerCase();
              let categoryKey = 'watch';
              if (catLower.includes('watch')) categoryKey = 'watch';
              else if (catLower.includes('shoe')) categoryKey = 'shoe';
              else if (catLower.includes('card') || catLower.includes('tcg')) categoryKey = 'cards';
              else if (catLower.includes('handbag')) categoryKey = 'handbag';
              else if (catLower.includes('gaming')) categoryKey = 'gaming';
              else if (catLower.includes('electronic')) categoryKey = 'electronics';
              else if (catLower.includes('toy') || catLower.includes('funko')) categoryKey = 'toy';
              else if (catLower.includes('antique')) categoryKey = 'antique';
              else if (catLower.includes('tool')) categoryKey = 'tool';
              else if (catLower.includes('vintage')) categoryKey = 'vintage_clothing';
              
              addUserScanToVisualLibrary(categoryKey, vc.familyId, imageDataUrl)
                .then(result => {
                  if (result.success) console.log(`[Fast Library Learning] Added to ${categoryKey}`);
                })
                .catch(() => {});
            }
            
            await storage.updateScanSession(session.id, userId, {
              status: 'pending',
              candidates: [visualCandidate],
            });
            
            // Build alternatives
            const alternatives = (vc.topAlternatives || []).map((alt: any) => ({
              name: `${alt.family} (${alt.category})`,
              score: alt.confidence,
            }));
            
            const finalResponse = finalizeScanResult({
              sessionId: session.id,
              candidates: [visualCandidate],
              source: 'visual_library_fast',
              matchStrength,
              alternatives,
              ocrLock: fastOcrLock, // Uses properly defined OCR lock from above
            });
            
            const totalDuration = Date.now() - visualFirstStartTime;
            console.log(`[VisualFirst] === FAST PATH COMPLETE: ${totalDuration}ms (saved ~15s) ===`);
            return res.json(finalResponse);
          }
          
          console.log(`[VisualFirst] Weak match (${matchStrength}, ${(confidence * 100).toFixed(0)}%), falling through to AI pipeline`);
        } else {
          console.log(`[VisualFirst] No visual match, falling through to AI pipeline`);
        }
      } catch (visualErr: any) {
        console.log(`[VisualFirst] Visual matching failed: ${visualErr.message}, falling through to AI pipeline`);
      }

      // ============================================================================
      // FALLBACK: Full AI pipeline (only runs if visual matching didn't return)
      // Uses detected category from visual-first for proper brand routing
      // Quality check already done in visual-first - skip duplicate
      // ============================================================================
      console.log('[Fallback] === STARTING AI PIPELINE (visual match was weak/missing) ===');
      const fallbackStartTime = Date.now();
      if (visualFirstDetectedCategory) {
        console.log(`[Fallback] Using detected category from visual-first: ${visualFirstDetectedCategory}`);
      }

      // Quality check already done in visual-first path above - no need to repeat
      // The visual-first path will have blocked if quality was low

      // Quality check already done in visual-first path above
      // Session already created in visual-first block above

      // ============================================================================
      // PARALLEL EXECUTION: Run OCR + Main Vision simultaneously to save ~5 seconds
      // OCR is authoritative for brand locks, but we don't need to wait for it
      // before starting vision - we apply locks after both complete
      // ============================================================================
      let ocrLock: OcrBrandLock = {
        locked: false,
        source: 'OCR',
        objectType: null,
        brandDetected: null,
        deterministicSignals: [],
        rawText: [],
        confidence: 0,
      };
      
      // Pre-seed category routing hint from visual-first detection
      let priorCategoryHint: string | undefined = visualFirstDetectedCategory;
      if (priorCategoryHint) {
        console.log(`[Fallback] Using category hint from visual-first: ${priorCategoryHint}`);
      }

      // Build the vision prompt once (used in parallel call)
      const categoryHintLine = priorCategoryHint 
        ? `\n\nHINT: Visual analysis suggests this may be in the "${priorCategoryHint}" category. Consider this when identifying, but override if evidence suggests otherwise.\n`
        : '';
      
      const visionPromptForParallel = `You are an expert at identifying collectibles and resellable items. Analyze this image carefully and identify what the item is. ALWAYS provide at least one result - even if you're uncertain, give your best guess.${categoryHintLine}

Categories (pick the closest match - USE ONLY THESE EXACT VALUES):
- Shoes (Nike, Jordan, Adidas, Yeezy, New Balance, Hoka, sneakers, athletic shoes)
- Watches (luxury, vintage, or popular brands - Rolex, Omega, Seiko, Casio, Tag Heuer, etc.)
- Trading Cards (sports cards, Pokemon, Magic the Gathering, Yu-Gi-Oh, rookie cards, autographed cards)
- Collectibles (Funko Pop, LEGO sets, Hot Wheels, action figures, Squishmallows, toys, Marvel collectibles)
- Electronics (phones, gaming consoles, PlayStation, Xbox, Nintendo, controllers, tablets, laptops, headphones, speakers, earbuds, gaming accessories)
- Other (use this for tools, apparel, vehicles, or anything that doesn't fit above categories)

CRITICAL: READ ALL TEXT, be specific with details, and report brandDetected ONLY if you can ACTUALLY SEE the brand.

Return a JSON array with 1-3 matches, each having: id, title, category, estimatedValue, keyIdentifiers, confidence (0-100), visionSignals, brandDetected (null if not visible), needsMoreInfo.
Return ONLY valid JSON, no markdown.`;

      // ============================================================================
      // PARALLEL: Start OCR and Vision simultaneously
      // ============================================================================
      console.log('[Parallel] === STARTING OCR + VISION IN PARALLEL ===');
      
      const [ocrResult, visionResult] = await Promise.all([
        // OCR extraction (fast, ~2s)
        (async () => {
          try {
            const ocrPrompt = `You are an OCR text extraction system. Extract ALL visible text from this image.
Focus on:
1. Brand names and logos (e.g., "Funko", "LEGO", "Hot Wheels", "Barbie", "Mattel", "Hasbro")
2. Product line text (e.g., "Pop!", "Vinyl", "UCS", "Technic", "Creator")
3. Item numbers (e.g., "#123", "75192", "Set 42100")
4. Character/item names on packaging
5. Any other visible text on boxes, labels, or packaging

Return a JSON object with:
{
  "allText": ["text1", "text2", ...],
  "brandSignals": ["FUNKO", "POP!", ...],
  "itemNumbers": ["#123", ...],
  "characterNames": ["Spider-Man", ...]
}

If no text is visible, return: {"allText": [], "brandSignals": [], "itemNumbers": [], "characterNames": []}`;

            const ocrResponse = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [{
                role: "user",
                content: [
                  { type: "text", text: ocrPrompt },
                  { type: "image_url", image_url: { url: imageDataUrl, detail: "low" } },
                ],
              }],
              max_tokens: 300,
              response_format: { type: "json_object" },
            });
            
            const content = ocrResponse.choices[0]?.message?.content || '{}';
            return JSON.parse(content);
          } catch (e: any) {
            console.log('[Parallel OCR] Failed:', e.message);
            return { allText: [], brandSignals: [], itemNumbers: [], characterNames: [] };
          }
        })(),
        
        // Main vision identification (slower, ~4-5s with gpt-4o)
        (async () => {
          try {
            const imageContent: any[] = [
              { type: "text", text: visionPromptForParallel },
              { type: "image_url", image_url: { url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}` } },
            ];
            
            if (hasBackImage) {
              imageContent.splice(1, 0, { type: "text", text: "Image 1 (FRONT): The main image. Image 2 (BACK): Additional details. Back text is authoritative." });
              imageContent.push({ type: "image_url", image_url: { url: backImageBase64.startsWith('data:') ? backImageBase64 : `data:image/jpeg;base64,${backImageBase64}` } });
            }
            
            const visionResponse = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: [{ role: "user", content: imageContent }],
              max_tokens: 1500,
            });
            
            return visionResponse.choices[0]?.message?.content || "[]";
          } catch (e: any) {
            console.log('[Parallel Vision] Failed:', e.message);
            return "[]";
          }
        })()
      ]);
      
      const parallelDuration = Date.now() - fallbackStartTime;
      console.log(`[Parallel] OCR + Vision completed in ${parallelDuration}ms (saved ~5s vs sequential)`);

      // ============================================================================
      // PROCESS OCR RESULTS: Build brand lock from parallel OCR data
      // ============================================================================
      try {
        console.log('[OCR] Processing extracted text for brand signals...');
        console.log('[OCR] Extracted text:', JSON.stringify(ocrResult, null, 2));
        
        ocrLock.rawText = ocrResult.allText || [];
        const allTextLower = (ocrResult.allText || []).join(' ').toLowerCase();
        const brandSignalsLower = (ocrResult.brandSignals || []).join(' ').toLowerCase();
        const combinedOcr = `${allTextLower} ${brandSignalsLower}`;
        
        // ============================================================================
        // EVALUATE DETERMINISTIC BRAND SIGNALS FROM OCR
        // These patterns MUST be detected via OCR to lock a manufacturer brand
        // ============================================================================
        
        // FUNKO_POP: Require "Funko" + "Pop!" combo OR "Funko Pop" text
        const hasFunkoOcr = combinedOcr.includes('funko');
        const hasPopBangOcr = combinedOcr.includes('pop!') || combinedOcr.includes('pop #');
        const hasFunkoPopOcr = combinedOcr.includes('funko pop');
        
        if ((hasFunkoOcr && hasPopBangOcr) || hasFunkoPopOcr) {
          ocrLock.locked = true;
          ocrLock.objectType = 'FUNKO_POP';
          ocrLock.brandDetected = 'Funko';
          ocrLock.confidence = 0.95;
          if (hasFunkoOcr) ocrLock.deterministicSignals.push('OCR_FUNKO_TEXT');
          if (hasPopBangOcr) ocrLock.deterministicSignals.push('OCR_POP_LOGO');
          
          // ============================================================================
          // FUNKO POP OCR PARSING: Extract Pop Number and Character Name
          // This runs ONLY after deterministic Funko signals are confirmed
          // ============================================================================
          const allTextLines = ocrResult.allText || [];
          const itemNumbers = ocrResult.itemNumbers || [];
          
          // Step 1: Extract Pop Number using regex \b\d{3,5}\b
          // Prefer numbers from itemNumbers array first, then search allText
          let popNumber: string | null = null;
          
          // Check itemNumbers first (e.g., "#1248", "1248")
          for (const num of itemNumbers) {
            const match = num.replace(/[#]/g, '').match(/\b(\d{3,5})\b/);
            if (match) {
              popNumber = match[1];
              break;
            }
          }
          
          // If not found, search through allText (prefer top-right positioning)
          if (!popNumber) {
            // Search in reverse order as numbers often appear in top-right
            for (let i = allTextLines.length - 1; i >= 0; i--) {
              const line = allTextLines[i];
              const match = line.match(/\b(\d{3,5})\b/);
              if (match) {
                popNumber = match[1];
                break;
              }
            }
          }
          
          // Fallback: search entire combined text
          if (!popNumber) {
            const match = combinedOcr.match(/\b(\d{3,5})\b/);
            if (match) popNumber = match[1];
          }
          
          // Step 2: Extract Character/Name - find strongest non-stopword line
          const FUNKO_STOPWORDS = [
            'funko', 'pop!', 'pop', 'vinyl', 'figure', 'figurine', 'movies', 'television',
            'tv', 'animation', 'games', 'rocks', 'icons', 'marvel', 'dc', 'disney',
            'star wars', 'heroes', 'warning', 'choking', 'hazard', 'attention', 'danger',
            'advertencia', 'peligro', 'ages', 'not for', 'small parts', 'exclusive',
            'chase', 'special', 'edition', 'limited', 'de vinyle', 'en vinyle', 'de vinil',
            'figura', 'vinyl figure', 'figurine en vinyle', 'figura de vinil',
          ];
          
          let characterName: string | null = null;
          let bestLineScore = 0;
          
          for (const line of allTextLines) {
            const lineLower = line.toLowerCase().trim();
            
            // Skip if line is too short or too long
            if (lineLower.length < 2 || lineLower.length > 50) continue;
            
            // Skip if line is mostly numbers
            if (/^\d+$/.test(lineLower)) continue;
            
            // Skip if line contains stopwords as primary content
            let isStopword = false;
            for (const sw of FUNKO_STOPWORDS) {
              if (lineLower === sw || lineLower.replace(/[^a-z0-9 ]/g, '') === sw) {
                isStopword = true;
                break;
              }
            }
            if (isStopword) continue;
            
            // Score the line: prefer longer meaningful text, penalize stopword presence
            let score = line.length;
            for (const sw of FUNKO_STOPWORDS) {
              if (lineLower.includes(sw)) score -= sw.length * 2;
            }
            
            // Boost lines that look like character names (Title Case, single word or 2-3 words)
            const words = line.trim().split(/\s+/).filter((w: string) => w.length > 0);
            if (words.length >= 1 && words.length <= 4) {
              // Check if Title Case (first letter uppercase)
              const isTitleCase = words.every((w: string) => /^[A-Z]/.test(w));
              if (isTitleCase) score += 10;
            }
            
            // Boost if line appears to be ALL CAPS name (common for character names on box)
            if (/^[A-Z][A-Z\s\-\']+$/.test(line.trim()) && line.length >= 3 && line.length <= 30) {
              score += 15;
            }
            
            if (score > bestLineScore) {
              bestLineScore = score;
              characterName = line.trim();
            }
          }
          
          // Clean up character name - remove any trailing/leading punctuation
          if (characterName) {
            characterName = characterName.replace(/^[\-\s\.]+|[\-\s\.]+$/g, '').trim();
            // Title case if ALL CAPS
            if (/^[A-Z\s\-\']+$/.test(characterName) && characterName.length > 1) {
              characterName = characterName.split(' ')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(' ');
            }
          }
          
          // Step 3: Build Canonical Display Label
          // Format: "Funko – {Name} – {Number}" or partial variants
          let canonicalLabel: string;
          let requiresConfirmation = false;
          
          if (characterName && popNumber) {
            // Full match: "Funko – Hannibal – 1248"
            canonicalLabel = `Funko – ${characterName} – #${popNumber}`;
            ocrLock.confidence = 0.98;
          } else if (popNumber && !characterName) {
            // Number only: "Funko Pop – #1248"
            canonicalLabel = `Funko Pop – #${popNumber}`;
            requiresConfirmation = true;
            ocrLock.confidence = 0.85;
          } else if (characterName && !popNumber) {
            // Name only: "Funko Pop – Hannibal"
            canonicalLabel = `Funko Pop – ${characterName}`;
            requiresConfirmation = true;
            ocrLock.confidence = 0.85;
          } else {
            // Neither found: "Funko Pop (Confirm Details)"
            canonicalLabel = 'Funko Pop (Confirm Details)';
            requiresConfirmation = true;
            ocrLock.confidence = 0.75;
          }
          
          // Store parsed Funko data in ocrLock for downstream use
          (ocrLock as any).funkoParsed = {
            popNumber: popNumber,
            characterName: characterName,
            canonicalLabel: canonicalLabel,
            requiresConfirmation: requiresConfirmation,
            franchise: null, // Enriched by vision/similarity later
          };
          
          console.log(`[OCR] FUNKO PARSED: Number="${popNumber || 'N/A'}", Name="${characterName || 'N/A'}", Label="${canonicalLabel}"`);
          console.log('[OCR] LOCKED: Funko Pop detected via OCR (signals: ' + ocrLock.deterministicSignals.join(', ') + ')');
        }
        
        // LEGO_SET: Require "LEGO" text
        const hasLegoOcr = combinedOcr.includes('lego');
        if (!ocrLock.locked && hasLegoOcr) {
          ocrLock.locked = true;
          ocrLock.objectType = 'LEGO_SET';
          ocrLock.brandDetected = 'LEGO';
          ocrLock.confidence = 0.95;
          ocrLock.deterministicSignals.push('OCR_LEGO_TEXT');
          console.log('[OCR] LOCKED: LEGO detected via OCR');
        }
        
        // HOT_WHEELS: Require "Hot Wheels" text
        const hasHotWheelsOcr = combinedOcr.includes('hot wheels') || combinedOcr.includes('hotwheels');
        if (!ocrLock.locked && hasHotWheelsOcr) {
          ocrLock.locked = true;
          ocrLock.objectType = 'HOT_WHEELS';
          ocrLock.brandDetected = 'Hot Wheels';
          ocrLock.confidence = 0.95;
          ocrLock.deterministicSignals.push('OCR_HOT_WHEELS_TEXT');
          console.log('[OCR] LOCKED: Hot Wheels detected via OCR');
        }
        
        // BARBIE: Require "Barbie" text
        const hasBarbieOcr = combinedOcr.includes('barbie');
        if (!ocrLock.locked && hasBarbieOcr) {
          ocrLock.locked = true;
          ocrLock.objectType = 'BARBIE';
          ocrLock.brandDetected = 'Barbie';
          ocrLock.confidence = 0.95;
          ocrLock.deterministicSignals.push('OCR_BARBIE_TEXT');
          console.log('[OCR] LOCKED: Barbie detected via OCR');
        }
        
        // MATTEL: Require "Mattel" text (parent company)
        const hasMattelOcr = combinedOcr.includes('mattel');
        if (!ocrLock.locked && hasMattelOcr) {
          // Mattel is parent company - don't lock specific objectType yet
          ocrLock.deterministicSignals.push('OCR_MATTEL_TEXT');
          console.log('[OCR] Mattel parent company detected - will refine objectType downstream');
        }
        
        // HASBRO: Require "Hasbro" text (parent company)
        const hasHasbroOcr = combinedOcr.includes('hasbro');
        if (!ocrLock.locked && hasHasbroOcr) {
          ocrLock.deterministicSignals.push('OCR_HASBRO_TEXT');
          console.log('[OCR] Hasbro parent company detected - will refine objectType downstream');
        }
        
        if (ocrLock.locked) {
          console.log(`[OCR] === BRAND LOCKED: ${ocrLock.brandDetected} (${ocrLock.objectType}) - IMMUTABLE ===`);
        } else {
          console.log('[OCR] No deterministic brand signals found - will try visual Funko detection');
          
          // ============================================================================
          // VISUAL FUNKO DETECTION: For out-of-box Funko Pops without packaging
          // When OCR doesn't find "Funko" text, try visual detection based on:
          // - Distinctive Funko Pop shape (oversized head, small body, large round eyes)
          // - Vinyl figure characteristics
          // ============================================================================
          try {
            console.log('[Visual] Attempting out-of-box Funko Pop detection...');
            
            const visualFunkoPrompt = `You are a Funko Pop expert. Analyze this image and determine if it shows a Funko Pop vinyl figure.

Funko Pop figures have these distinctive characteristics:
1. OVERSIZED HEAD relative to body (usually 2-3x body size)
2. Small, stylized body with short legs
3. Large round BLACK EYES (usually solid black dots)
4. Vinyl/plastic material with matte finish
5. Approximately 4-6 inches tall
6. Chibi/bobblehead style proportions

If this IS a Funko Pop figure, identify:
- Character name (who is this character?)
- Franchise/series (what movie, TV show, game, etc.)
- Any variant info (chase, exclusive, flocked, etc.)
- Distinguishing features (costume, props, pose)

Return JSON:
{
  "isFunkoPop": true/false,
  "confidence": 0.0-1.0,
  "characterName": "Character Name" or null,
  "franchise": "Movie/Show Name" or null,
  "variant": "Chase/Exclusive/etc" or null,
  "description": "Brief description of the figure",
  "visualSignals": ["signal1", "signal2"] // What made you identify this as Funko
}`;

            const visualResponse = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: visualFunkoPrompt },
                    {
                      type: "image_url",
                      image_url: {
                        url: imageDataUrl,
                        detail: "high",
                      },
                    },
                  ],
                },
              ],
              max_tokens: 500,
              response_format: { type: "json_object" },
            });
            
            const visualContent = visualResponse.choices[0]?.message?.content || '{}';
            const visualResult = JSON.parse(visualContent);
            
            console.log('[Visual] Funko detection result:', JSON.stringify(visualResult, null, 2));
            
            // If visual detection confirms Funko Pop with high confidence
            if (visualResult.isFunkoPop && visualResult.confidence >= 0.75) {
              // For out-of-box figures, we use visual detection but mark as VISUAL source
              // This is NOT a full OCR lock since we can't verify via packaging text
              ocrLock.objectType = 'FUNKO_POP';
              ocrLock.brandDetected = 'Funko';
              ocrLock.confidence = visualResult.confidence * 0.9; // Slightly lower than OCR
              ocrLock.deterministicSignals.push('VISUAL_FUNKO_SHAPE');
              ocrLock.source = 'VISUAL'; // Mark as visual detection, not OCR
              
              // Build canonical label from visual detection
              const charName = visualResult.characterName || null;
              const franchise = visualResult.franchise || null;
              
              let canonicalLabel: string;
              if (charName && franchise) {
                canonicalLabel = `Funko Pop – ${charName} (${franchise})`;
              } else if (charName) {
                canonicalLabel = `Funko Pop – ${charName}`;
              } else {
                canonicalLabel = 'Funko Pop (Out of Box)';
              }
              
              // Store parsed data for downstream use
              (ocrLock as any).funkoParsed = {
                popNumber: null, // Can't determine from out-of-box
                characterName: charName,
                canonicalLabel: canonicalLabel,
                requiresConfirmation: true, // Always confirm out-of-box
                franchise: franchise,
                variant: visualResult.variant || null,
                description: visualResult.description || null,
                visualSignals: visualResult.visualSignals || [],
                isOutOfBox: true,
              };
              
              console.log(`[Visual] OUT-OF-BOX FUNKO DETECTED: "${canonicalLabel}" (conf=${visualResult.confidence})`);
              console.log(`[Visual] Character: ${charName || 'Unknown'}, Franchise: ${franchise || 'Unknown'}`);
            } else {
              console.log('[Visual] Not a Funko Pop or low confidence - continuing with standard pipeline');
            }
            
          } catch (visualError: any) {
            console.log('[Visual] Funko detection failed:', visualError.message);
          }
        }
        
      } catch (ocrError: any) {
        console.log('[OCR] Text extraction failed, continuing with vision inference:', ocrError.message);
      }

      // ============ TOY-SPECIFIC STRICT PIPELINE (5-STAGE GATING) ============
      // Only applies to: Funko Pop, LEGO, Hot Wheels, Action Figures
      // For toys, we use a strict multi-stage pipeline to prevent misidentification
      // 
      // VISUAL FUNKO BYPASS: If visual detection already identified a Funko Pop,
      // skip Stage 1 and use visual detection results directly
      // ============================================================================
      
      // Check if we already have a visual Funko detection
      const hasVisualFunko = ocrLock.source === 'VISUAL' && ocrLock.objectType === 'FUNKO_POP' && (ocrLock as any).funkoParsed;
      
      if (hasVisualFunko) {
        console.log('[Identify] VISUAL FUNKO DETECTED - Skipping Stage 1, using visual detection results');
        
        const funkoParsed = (ocrLock as any).funkoParsed;
        const candidates = [];
        
        // Build candidate from visual detection
        const visualCandidate = {
          id: "funko_visual_" + Date.now(),
          title: funkoParsed.canonicalLabel,
          category: "Collectibles",
          estimatedValue: "Check eBay sold listings",
          keyIdentifiers: ['Funko Pop', funkoParsed.franchise, funkoParsed.characterName].filter(Boolean) as string[],
          confidence: Math.round(ocrLock.confidence * 100),
          visionSignals: funkoParsed.visualSignals || ['Out-of-box visual detection'],
          source: 'visual_funko',
          matchStrength: ocrLock.confidence >= 0.8 ? 'strong' as const : 'moderate' as const,
          requiresSelection: true, // Always require confirmation for visual detection
          isOutOfBox: true,
          franchise: funkoParsed.franchise,
          characterName: funkoParsed.characterName,
          variant: funkoParsed.variant,
        };
        
        candidates.push(visualCandidate);
        
        // CRITICAL: Update session with candidates so confirm endpoint can find them
        await storage.updateScanSession(session.id, userId, {
          status: 'pending',
          candidates: candidates,
        });
        
        // Process through finalizeScanResult for consistent output formatting
        const finalResponse = finalizeScanResult({
          sessionId: session.id,
          candidates: candidates,
          source: 'toy_pipeline',
          ocrLock: ocrLock,
        });
        
        console.log('[Identify] VISUAL FUNKO - Returning response with candidates stored in session');
        
        // Return immediately - don't run toy pipeline
        return res.json({
          ...finalResponse,
          sessionId: session.id,
          requiresSelection: true,
          selectionPrompt: 'Confirm this Funko Pop figure',
          identificationMethod: 'visual_funko',
          isOutOfBox: true,
        });
      }
      
      try {
        const { runToyStage1Detection, runToyIdentificationPipeline, isToyCategory, getLockedBrandFromObjectType } = await import('./identification-pipeline');
        
        // Quick Stage 1 check to see if this is a toy
        const stage1Check = await runToyStage1Detection(imageBase64);
        
        if (stage1Check.confidence > 0.6 && isToyCategory(stage1Check.objectType, null)) {
          console.log('[Identify] TOY DETECTED - Running strict 5-stage pipeline');
          
          // Run full toy pipeline
          const toyResult = await runToyIdentificationPipeline(imageBase64);
          
          // BRAND-OBJECT COMPATIBILITY: Get locked brand from objectType
          // This is the ONLY source of truth for the product brand (not stage2.brand which is franchise)
          const lockedBrand = getLockedBrandFromObjectType(toyResult.stage1.objectType);
          const franchise = toyResult.stage2.brand; // This is franchise (Marvel, Star Wars), NOT product brand
          
          console.log(`[Identify] Locked Brand: ${lockedBrand}, Franchise: ${franchise}`);
          
          // Build response based on confidence tier
          const candidates = [];
          const tier = toyResult.stage5.confidenceTier;
          
          if (tier === 'LOW') {
            // <60%: Generic label only, manual entry required
            candidates.push({
              id: "toy_generic",
              title: toyResult.stage5.displayLabel,
              category: "Collectibles",
              estimatedValue: "Unknown",
              keyIdentifiers: [lockedBrand].filter(Boolean) as string[],
              confidence: Math.round(toyResult.finalConfidence * 100),
              visionSignals: ['Low confidence - please enter details manually'],
              source: 'toy_pipeline',
              matchStrength: 'weak' as const,
              requiresManualEntry: true,
              pipelineStage: 1,
              brandDetected: lockedBrand,
            });
          } else if (tier === 'MEDIUM') {
            // 60-79%: Type + franchise only, no specific item names
            // displayLabel should be: "Funko Pop - Marvel" not "Marvel Pop Figure"
            const displayTitle = franchise 
              ? `${lockedBrand} ${toyResult.stage1.objectType === 'FUNKO_POP' ? 'Pop' : 'Set'} - ${franchise}`
              : `${lockedBrand} ${toyResult.stage1.objectType === 'FUNKO_POP' ? 'Pop' : 'Set'}`;
            
            candidates.push({
              id: "toy_type_only",
              title: displayTitle,
              category: "Collectibles",
              estimatedValue: "Unknown",
              keyIdentifiers: [lockedBrand, franchise].filter(Boolean) as string[],
              confidence: Math.round(toyResult.finalConfidence * 100),
              visionSignals: ['Type detected - select from options or enter details'],
              source: 'toy_pipeline',
              matchStrength: 'moderate' as const,
              requiresSelection: true,
              pipelineStage: 2,
              brandDetected: lockedBrand,
            });
          } else if (tier === 'HIGH') {
            // 80-89%: Show candidates with "Select the correct item"
            for (const candidate of toyResult.stage4.candidates.slice(0, 3)) {
              candidates.push({
                id: candidate.id,
                title: candidate.title,
                familyId: candidate.familyId,
                category: "Collectibles",
                estimatedValue: "Unknown",
                keyIdentifiers: [lockedBrand, franchise, ...(candidate.keyIdentifiers || [])].filter(Boolean) as string[],
                confidence: Math.round(candidate.confidence * 100),
                visionSignals: ['Select the correct item'],
                source: 'toy_pipeline',
                matchStrength: 'moderate' as const,
                requiresSelection: true,
                pipelineStage: 4,
                brandDetected: lockedBrand,
              });
            }
          } else {
            // >=90%: Auto-confirm single item
            const topCandidate = toyResult.stage4.candidates[0];
            if (topCandidate) {
              candidates.push({
                id: topCandidate.id,
                title: topCandidate.title,
                familyId: topCandidate.familyId,
                category: "Collectibles",
                estimatedValue: "Unknown",
                keyIdentifiers: [lockedBrand, franchise, ...(topCandidate.keyIdentifiers || [])].filter(Boolean) as string[],
                confidence: Math.round(toyResult.finalConfidence * 100),
                visionSignals: ['High confidence match'],
                source: 'toy_pipeline',
                matchStrength: 'strong' as const,
                autoConfirmed: true,
                pipelineStage: 5,
                brandDetected: lockedBrand,
              });
            }
          }
          
          // REMOVED EARLY RETURN: Store toyPipeline result and flow through finalizeScanResult
          const toyPipelineData = {
            stage1: toyResult.stage1,
            stage2: toyResult.stage2,
            stage3: toyResult.stage3,
            confidenceTier: tier,
            finalConfidence: toyResult.finalConfidence,
            lockedBrand,
            franchise,
          };
          
          // Update session with candidates
          await storage.updateScanSession(session.id, userId, {
            status: candidates.length > 0 ? 'pending' : 'expired',
            candidates: candidates,
          });
          
          // Flow through finalizeScanResult (unified exit point)
          const finalResponse = finalizeScanResult({
            sessionId: session.id,
            candidates,
            source: 'toy_pipeline',
            toyPipeline: toyPipelineData,
            matchStrength: 'pipeline',
            alternatives: [],
            ocrLock, // Pass OCR lock for authoritative brand gating
          });
          
          console.log('=== FINAL_PIPELINE_CONFIRMED: Sending response via TOY_PIPELINE path ===');
          return res.json(finalResponse);
        }
        
        console.log('[Identify] Not a toy (or low confidence), using standard identification');
      } catch (toyPipelineError: any) {
        console.log('[Identify] Toy pipeline check failed, continuing with standard flow:', toyPipelineError.message);
      }

      // ============ USE PARALLEL VISION RESULT ============
      // Vision was already called in parallel above - use visionResult directly
      try {
        const content = visionResult || "[]";
        
        // Parse the candidates
        let candidates = [];
        try {
          // Clean the response - remove markdown if present
          let cleanContent = content.trim();
          if (cleanContent.startsWith("```")) {
            cleanContent = cleanContent.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
          }
          candidates = JSON.parse(cleanContent);
          
          // Validate structure
          if (!Array.isArray(candidates)) {
            candidates = [];
          }
          
          // Limit to 3 candidates for better UX and fewer API calls
          candidates = candidates.slice(0, 3);
          
          // Normalize categories to valid schema values
          const validCategories = ['Shoes', 'Watches', 'Trading Cards', 'Collectibles', 'Electronics', 'Other'];
          const categoryNormalizationMap: Record<string, string> = {
            'gaming': 'Electronics',
            'tools': 'Other',
            'apparel': 'Other',
            'vehicles': 'Other',
            'unknown': 'Other',
            'marvel': 'Trading Cards',
            'sports cards': 'Trading Cards',
            'tcg cards': 'Trading Cards',
            'marvel cards': 'Trading Cards',
            'funko': 'Collectibles',
            'funko pop': 'Collectibles',
            'toy': 'Collectibles',
            'toys': 'Collectibles',
            'collectibles': 'Collectibles',
            'toys & collectibles': 'Collectibles',
            'action figure': 'Collectibles',
            'lego': 'Collectibles',
          };
          candidates = candidates.map((c: any) => {
            const cat = (c.category || 'Other').trim();
            // Check if it's already valid (case-insensitive)
            const validMatch = validCategories.find(v => v.toLowerCase() === cat.toLowerCase());
            if (validMatch) {
              c.category = validMatch;
            } else {
              // Try normalization map
              const normalized = categoryNormalizationMap[cat.toLowerCase()];
              c.category = normalized || 'Other';
            }
            
            // For Funko Pops, check if boxed and set requiresUpcScan flag
            if (c.category === 'Funko Pop' && c.funkoMeta?.isBoxed === true) {
              c.requiresUpcScan = true;
              c.upcScanReason = 'Boxed Funko Pop detected - scan barcode on box for exact identification';
            }
            
            return c;
          });
          
          // If no candidates were returned, create a fallback "Unknown" result
          if (candidates.length === 0) {
            console.log("[VISION] No candidates from AI, creating Unknown fallback");
            candidates = [{
              id: "match_1",
              title: "Unidentified Item",
              category: "Unknown",
              estimatedValue: "Unknown",
              keyIdentifiers: ["Unable to identify specific item"],
              confidence: 15,
              visionSignals: ["Image received but item not clearly identifiable"],
              reason: "low_confidence"
            }];
          }
          
          // For sports/TCG cards, ensure cardMeta is populated (fallback to title parsing)
          // For watches, match against the watch library for accurate brand/style
          candidates = candidates.map((candidate: any) => {
            const category = (candidate.category || '').toLowerCase();
            
            if (isSportsCardCategory(category)) {
              console.log(`[CARD-PARSE] Processing card: "${candidate.title}"`);
              console.log(`[CARD-PARSE] AI cardMeta:`, JSON.stringify(candidate.cardMeta));
              
              if (!candidate.cardMeta || !candidate.cardMeta.set) {
                // Parse card metadata from title as fallback
                const parsed = parseCardTitle(candidate.title || '');
                console.log(`[CARD-PARSE] Title parsed:`, JSON.stringify(parsed));
                
                candidate.cardMeta = {
                  ...candidate.cardMeta,
                  brand: candidate.cardMeta?.brand || parsed.brand,
                  set: candidate.cardMeta?.set || parsed.set,
                  year: candidate.cardMeta?.year || parsed.year,
                  playerName: candidate.cardMeta?.playerName || parsed.playerName,
                  detectedParallel: candidate.cardMeta?.detectedParallel || parsed.parallel,
                };
                console.log(`[CARD-PARSE] Final cardMeta:`, JSON.stringify(candidate.cardMeta));
              } else {
                console.log(`[CARD-PARSE] Using AI cardMeta as-is`);
              }
            }
            
            // Watch library matching - use similarity matching to find brand/family
            if (category === 'watches' || category === 'watch') {
              const watchMatch = matchWatchToLibrary(
                candidate.title || '',
                candidate.keyIdentifiers || []
              );
              
              if (watchMatch.matchConfidence > 0) {
                // Add watch metadata from library match
                candidate.watchMeta = {
                  watchBrand: watchMatch.watchBrand,
                  watchFamily: watchMatch.watchFamily,
                  watchBandType: watchMatch.watchBandType,
                  watchMovementType: watchMatch.watchMovementType,
                  matchConfidence: watchMatch.matchConfidence,
                  topMatches: watchMatch.topMatches,
                };
                console.log(`Watch matched: ${candidate.title} -> Brand: ${watchMatch.watchBrand}, Family: ${watchMatch.watchFamily}, Confidence: ${watchMatch.matchConfidence}`);
              }
            }
            
            // Vehicle library matching
            if (category === 'vehicles' || category === 'vehicle' || category === 'cars' || category === 'car') {
              const vehicleMatch = matchVehicleToLibrary(
                (candidate.title || '') + ' ' + (candidate.keyIdentifiers || []).join(' ')
              );
              
              if (vehicleMatch.matchConfidence > 0) {
                candidate.vehicleMeta = {
                  brand: vehicleMatch.brand,
                  model: vehicleMatch.family,
                  bodyType: vehicleMatch.bodyType,
                  matchConfidence: vehicleMatch.matchConfidence,
                  topMatches: vehicleMatch.topMatches,
                };
                console.log(`Vehicle matched: ${candidate.title} -> Brand: ${vehicleMatch.brand}, Model: ${vehicleMatch.family}, Confidence: ${vehicleMatch.matchConfidence}`);
              }
            }
            
            // Marvel library matching
            if (category === 'marvel') {
              const marvelMatch = matchMarvelToLibrary(
                (candidate.title || '') + ' ' + (candidate.keyIdentifiers || []).join(' ')
              );
              
              if (marvelMatch.matchConfidence > 0) {
                candidate.marvelMeta = {
                  character: marvelMatch.character,
                  series: marvelMatch.series,
                  collectibleType: marvelMatch.collectibleType,
                  matchConfidence: marvelMatch.matchConfidence,
                  topMatches: marvelMatch.topMatches,
                };
                console.log(`Marvel matched: ${candidate.title} -> Character: ${marvelMatch.character}, Series: ${marvelMatch.series}, Confidence: ${marvelMatch.matchConfidence}`);
              }
            }
            
            return candidate;
          });
          
          // Run brand library matching for Tools, Shoes, Electronics, Gaming, Apparel
          const brandMatchCategories = ['shoes', 'tools', 'electronics', 'gaming', 'apparel'];
          candidates = await Promise.all(candidates.map(async (candidate: any) => {
            const category = (candidate.category || '').toLowerCase();
            
            if (brandMatchCategories.includes(category)) {
              const brandMatch = await matchBrandLibrary(
                candidate.brandDetected || null,
                category,
                candidate.title || '',
                candidate.keyIdentifiers || []
              );
              
              if (brandMatch) {
                candidate.brandMeta = {
                  brandName: brandMatch.brandName,
                  brandSlug: brandMatch.brandSlug,
                  brandCategory: brandMatch.brandCategory,
                  matchConfidence: brandMatch.matchConfidence,
                };
                console.log(`Brand matched: ${candidate.title} -> ${brandMatch.brandName} (${brandMatch.brandCategory}), Confidence: ${brandMatch.matchConfidence}`);
              }
            }
            
            return candidate;
          }));
        } catch (parseErr) {
          console.error("Failed to parse vision response:", parseErr);
          candidates = [];
        }

        // ============================================================================
        // NEVER-FAIL FALLBACK: If no candidates, create a generic one for manual entry
        // Low confidence ≠ failure. Detection always returns a result.
        // ============================================================================
        if (candidates.length === 0) {
          console.log('[Identify] No candidates from OpenAI - creating GENERIC fallback');
          
          // Use OCR text to help with title if available
          const ocrTitle = ocrLock.rawText.length > 0 
            ? ocrLock.rawText.slice(0, 3).join(' ') 
            : 'Unknown Item';
          
          candidates = [{
            id: "generic_fallback",
            title: ocrLock.locked ? `${ocrLock.brandDetected} Item` : (ocrTitle || 'Unknown Item'),
            category: ocrLock.objectType === 'FUNKO_POP' ? 'Collectibles' :
                      ocrLock.objectType === 'LEGO_SET' ? 'Collectibles' :
                      ocrLock.objectType === 'HOT_WHEELS' ? 'Collectibles' :
                      'General',
            estimatedValue: "Unknown",
            keyIdentifiers: ocrLock.rawText.slice(0, 5),
            confidence: ocrLock.locked ? 50 : 20, // Low confidence triggers generic UI
            visionSignals: ['Could not identify specific item - please enter details manually'],
            source: 'fallback',
            matchStrength: 'weak' as const,
            requiresManualEntry: true,
            brandDetected: ocrLock.locked ? ocrLock.brandDetected : null,
            overallConfidence: ocrLock.locked ? 50 : 20,
          }];
          
          console.log(`[Identify] Created fallback candidate: "${candidates[0].title}"`);
        }

        // Fetch product images for each candidate in parallel (limit to 3)
        if (candidates.length > 0) {
          console.log(`Fetching images for ${candidates.length} candidates...`);
          const imagePromises = candidates.map(async (candidate: any) => {
            try {
              // Build a focused search query from title
              const searchQuery = `${candidate.title} product photo`;
              const imageUrl = await fetchProductImage(searchQuery);
              return { ...candidate, thumbnailUrl: imageUrl };
            } catch (err) {
              console.error(`Failed to fetch image for ${candidate.title}:`, err);
              return candidate;
            }
          });
          
          candidates = await Promise.all(imagePromises);
        }

        // Update session with candidates - always 'pending' since we always have at least one
        await storage.updateScanSession(session.id, userId, {
          status: 'pending', // Never 'expired' from scan - always proceed to confirmation
          candidates: candidates,
        });

        // Check if any candidate requires UPC scan (boxed Funko Pop)
        const requiresUpcScan = candidates.some((c: any) => c.requiresUpcScan === true);
        const upcScanReason = requiresUpcScan 
          ? candidates.find((c: any) => c.requiresUpcScan)?.upcScanReason 
          : null;

        // Flow through finalizeScanResult (unified exit point)
        const finalResponse = finalizeScanResult({
          sessionId: session.id,
          candidates,
          source: 'openai',
          matchStrength: 'none',
          alternatives: [],
          requiresUpcScan,
          upcScanReason,
          ocrLock, // Pass OCR lock for authoritative brand gating
        });
        
        console.log('=== FINAL_PIPELINE_CONFIRMED: Sending response via OPENAI path ===');
        res.json(finalResponse);
      } catch (visionError: any) {
        console.error("Vision API error:", visionError);
        
        // ============================================================================
        // NEVER-FAIL: Even on vision API error, return a generic candidate for manual entry
        // Only show "Scan Failed" if image is truly unusable (blank/corrupt)
        // ============================================================================
        console.log('[Identify] Vision error - returning fallback for manual entry');
        
        const fallbackCandidate = {
          id: "error_fallback",
          title: ocrLock.locked ? `${ocrLock.brandDetected} Item` : 'Unknown Item',
          category: 'General',
          estimatedValue: "Unknown",
          keyIdentifiers: ocrLock.rawText.slice(0, 5),
          confidence: 10,
          visionSignals: ['Vision processing failed - please enter details manually'],
          source: 'fallback',
          matchStrength: 'weak' as const,
          requiresManualEntry: true,
          brandDetected: ocrLock.locked ? ocrLock.brandDetected : null,
          overallConfidence: 10,
        };
        
        await storage.updateScanSession(session.id, userId, { 
          status: 'pending',
          candidates: [fallbackCandidate],
        });
        
        const finalResponse = finalizeScanResult({
          sessionId: session.id,
          candidates: [fallbackCandidate],
          source: 'openai',
          matchStrength: 'none',
          alternatives: [],
          ocrLock,
        });
        
        console.log('=== FINAL_PIPELINE_CONFIRMED: Sending FALLBACK response after vision error ===');
        return res.json(finalResponse);
      }
    } catch (error: any) {
      console.error("Photo scan error:", error);
      res.status(500).json({ message: "Failed to process image" });
    }
  });

  // ============ FAST LIVE CAPTURE ENDPOINT ============
  // In-memory cache for live capture results (60s TTL)
  const liveCaptureCache = new Map<string, { result: any; timestamp: number }>();
  const LIVE_CAPTURE_CACHE_TTL = 60000; // 60 seconds

  // Fast single-endpoint for live capture - combines identify + decision in ~3 seconds
  app.post("/api/live-capture/analyze", requireAuth, async (req, res) => {
    const startTime = Date.now();
    try {
      const userId = (req.user as { id: number }).id;
      const { imageBase64, buyPrice, ocrHints } = req.body;

      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({ message: "Image data required" });
      }

      // Build OCR hints context if provided by client-side Burst Click
      let ocrContext = '';
      if (ocrHints && typeof ocrHints === 'object') {
        const hints: string[] = [];
        if (ocrHints.brand) hints.push(`Brand detected: ${ocrHints.brand}`);
        if (ocrHints.model) hints.push(`Model detected: ${ocrHints.model}`);
        if (ocrHints.playerName) hints.push(`Player name: ${ocrHints.playerName}`);
        if (ocrHints.cardSet) hints.push(`Card set: ${ocrHints.cardSet}`);
        if (ocrHints.cardYear) hints.push(`Year: ${ocrHints.cardYear}`);
        if (ocrHints.cardNumber) hints.push(`Card #: ${ocrHints.cardNumber}`);
        if (hints.length > 0) {
          ocrContext = `\n\nCLIENT OCR HINTS (pre-extracted text identifiers):\n${hints.join('\n')}\nUse these hints to help identify the item more accurately.\n`;
        }
      }

      // Check scan limits
      const scanStatus = await storage.canUserScan(userId);
      if (!scanStatus.allowed) {
        return res.status(429).json({ message: "Daily scan limit reached" });
      }

      // Enhanced vision prompt for live auction streams - OCR-FIRST approach
      const liveStreamVisionPrompt = `LIVE AUCTION STREAM SCREENSHOT - TWO-STAGE IDENTIFICATION

STEP 1: OCR THE LISTING TITLE (PRIORITY)
- Look for the ITEM TITLE LINE in the stream UI (the bold product name line)
- On Whatnot: The title is the FIRST LINE below the video, format: "CODE - Brand Model Details - Size, Colors, #1"
- Example: "TM-124031 - TechnoMarine Cruise Original Men's Watch w/ Mother of Pearl Dial - 43mm, Black, White, #1"
- IGNORE the description paragraph below the title (starts with detailed text like "This impressive...")
- IGNORE bid amounts, usernames, shipping costs
- This title text is MORE ACCURATE than visual guessing - COPY IT EXACTLY!

STEP 2: VISUAL ANALYSIS (SUPPLEMENT)
- Extract COLOR of the item from the video feed (bezel color, dial color, case color for watches)
- Extract CONDITION visible (new in box, used, graded slab, etc.)
- Extract any details NOT in the listing text

GENERIC LISTING DETECTION:
If the listing title is GENERIC or AUCTION UI TEXT, then set "listingTitleGeneric": true and rely on VISUAL product identification instead:
- Generic patterns: "Watch Lot #5", "Item 3", "Bundle", just numbers
- Auction UI patterns: "Auction X-Xoz #XXX", "Lot #XX", weight/number codes like "4-7oz #110"
- NO BRAND or MODEL visible in title text

When listingTitleGeneric is true:
- Look at the ACTUAL PRODUCT shown in the video feed
- Read text from the PRODUCT PACKAGING (brand logos, model numbers on boxes)
- Identify the product visually: What brand? What type of product? What model if readable?
- Build the title from what you SEE on the product, not the auction UI
- Still report the auction text in "ocrTitle" for reference

RETURN JSON:
{
  "ocrTitle": "EXACT text from listing title (copy it verbatim)",
  "listingTitleGeneric": false,
  "visualColor": "Black/Gold" or "Blue dial, silver case" or null,
  "visualCondition": "New in box" or "Used" or "Graded PSA 10" or null,
  "title": "Final combined title: ocrTitle + color details if helpful",
  "category": "Shoes|Watches|Electronics|Trading Cards|Collectibles|Other",
  "estimatedValue": "$XX" or "Unknown",
  "confidence": 0-100,
  "playerName": "Player name if Sports Card (null otherwise)",
  "cardSet": "Set/product name if card",
  "cardYear": "Year if visible",
  "cardNumber": "Card number if visible"
}

OCR PRIORITY EXAMPLES:
- Whatnot shows "ACW1968-005 - Activa Kadron X Invicta Digital Men's Watch" → USE THIS as ocrTitle!
- eBay Live shows "Seiko Prospex SRPD25 Turtle Blue" → USE THIS as ocrTitle!
- If title says "Lot #7" → listingTitleGeneric: true, fall back to visual

VISUAL COLOR EXTRACTION:
- For watches: "Blue dial, silver bezel" or "Black/Gold" or "Orange case"
- For shoes: "White/Red" or "Black Cement"
- For cards: "Gold parallel" or "Refractor"

CONFIDENCE RULES:
- 85-100: OCR found specific listing title with brand/model
- 70-84: OCR found partial title + visual confirms details
- 50-69: Generic listing, relying on visual identification
- 30-49: Cannot read title AND visual unclear
- 0-29: Cannot determine what product is being shown`;

      console.log(`[LIVE-CAPTURE] Starting fast analysis...${ocrContext ? ' (with OCR hints)' : ''}`);

      // Append OCR hints to the vision prompt if available
      const fullPrompt = liveStreamVisionPrompt + ocrContext;

      // TURBO MODE: Use gpt-4o-mini with auto detail for speed (~2s vs ~6s)
      // For fast auctions, speed > maximum accuracy
      const visionResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: fullPrompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                  detail: "auto" // Auto for balance of speed and accuracy
                }
              }
            ]
          }
        ],
        max_tokens: 250,
        temperature: 0.1
      });

      const visionTime = Date.now() - startTime;
      console.log(`[LIVE-CAPTURE] Vision completed in ${visionTime}ms`);

      const content = visionResponse.choices[0]?.message?.content || '';
      let identified: {
        title: string;
        category: string;
        estimatedValue: string;
        confidence: number;
        ocrTitle?: string | null;
        listingTitleGeneric?: boolean;
        visualColor?: string | null;
        visualCondition?: string | null;
        playerName?: string | null;
        cardSet?: string | null;
        cardYear?: string | null;
        cardNumber?: string | null;
      } = { title: 'Unknown Item', category: 'Other', estimatedValue: 'Unknown', confidence: 30 };

      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          identified = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.log(`[LIVE-CAPTURE] Failed to parse vision response`);
      }

      // Log OCR results
      if (identified.ocrTitle) {
        console.log(`[LIVE-CAPTURE] OCR Title: "${identified.ocrTitle}" (generic: ${identified.listingTitleGeneric || false})`);
      }
      if (identified.visualColor) {
        console.log(`[LIVE-CAPTURE] Visual Color: ${identified.visualColor}`);
      }

      // Use OCR title as primary search query if not generic
      let searchTitle = identified.title;
      if (identified.ocrTitle && !identified.listingTitleGeneric) {
        // Clean up OCR title - remove lot numbers, item codes at start
        const cleanOcrTitle = identified.ocrTitle
          .replace(/^[A-Z0-9]{3,}-\d+\s*-?\s*/i, '') // Remove codes like "ACW1968-005 -"
          .replace(/\s*#\d+\s*$/, '') // Remove trailing "#1"
          .trim();
        
        // Add visual color if it adds value (not already in title)
        if (identified.visualColor && !cleanOcrTitle.toLowerCase().includes(identified.visualColor.toLowerCase().split('/')[0])) {
          searchTitle = `${cleanOcrTitle} ${identified.visualColor}`;
        } else {
          searchTitle = cleanOcrTitle;
        }
        console.log(`[LIVE-CAPTURE] Using OCR-enhanced search: "${searchTitle}"`);
      }

      // For cards, enhance the title with player/set info if not already included
      if ((identified.category === 'Trading Cards' || identified.category === 'Trading Cards') && identified.playerName) {
        const hasPlayerInTitle = identified.title.toLowerCase().includes(identified.playerName.toLowerCase());
        if (!hasPlayerInTitle && identified.playerName !== 'null') {
          // Reconstruct title with card details
          const parts = [];
          if (identified.cardYear) parts.push(identified.cardYear);
          if (identified.cardSet) parts.push(identified.cardSet);
          if (identified.playerName) parts.push(identified.playerName);
          if (identified.cardNumber) parts.push(identified.cardNumber);
          if (parts.length > 0) {
            identified.title = parts.join(' ');
          }
        }
      }

      // Parse buy price if provided
      const userBuyPrice = buyPrice ? parseFloat(buyPrice) : null;
      const hasBuyPrice = userBuyPrice !== null && userBuyPrice > 0;

      // Check cache for this title + buyPrice combination (use searchTitle for accuracy)
      const cacheKey = `${searchTitle.toLowerCase().replace(/[^a-z0-9]/g, '')}_${userBuyPrice || 'nobuy'}`;
      const cachedEntry = liveCaptureCache.get(cacheKey);
      if (cachedEntry && Date.now() - cachedEntry.timestamp < LIVE_CAPTURE_CACHE_TTL) {
        console.log(`[LIVE-CAPTURE] Cache hit for "${searchTitle}"`);
        const totalTime = Date.now() - startTime;
        return res.json({
          ...cachedEntry.result,
          cached: true,
          processingTimeMs: totalTime
        });
      }

      // Try to get cached comps from database first (fast path)
      let avgPrice = 0;
      let compsCount = 0;
      let maxBuy = 0;
      let priceSource = 'vision';

      const compsStartTime = Date.now();
      try {
        // Check if we have cached comps in database (use searchTitle)
        const normalizedTitle = searchTitle.replace(/[^\w\s]/g, ' ').trim();
        const cacheQueryKey = `live_${normalizedTitle.toLowerCase().replace(/\s+/g, '_').slice(0, 50)}`;
        const cachedComps = await storage.getCompsCache(cacheQueryKey);
        
        if (cachedComps && cachedComps.medianPrice) {
          avgPrice = typeof cachedComps.medianPrice === 'string' 
            ? parseFloat(cachedComps.medianPrice) 
            : cachedComps.medianPrice;
          compsCount = Array.isArray(cachedComps.comps) ? cachedComps.comps.length : 0;
          priceSource = 'cached_comps';
          console.log(`[LIVE-CAPTURE] Using cached comps: $${avgPrice} from ${compsCount} comps`);
        }
      } catch (e) {
        console.log(`[LIVE-CAPTURE] No cached comps available`);
      }
      
      // If no cached comps, fetch REAL comps from eBay with TURBO TIMEOUT (3s max)
      // Use searchTitle (OCR-enhanced) for better query accuracy
      // SKIP if title is generic - searching "VIDEO GAMES" returns garbage like Pokemon Emerald
      const isGenericTitle = identified.listingTitleGeneric || 
        /^(\d+\s+)?(brand new\s+)?video games?$/i.test(searchTitle) ||
        /^(lot|bundle|auction)\s*(#?\d+)?$/i.test(searchTitle) ||
        searchTitle.split(/\s+/).filter(w => w.length > 2).length < 2;
      
      if (isGenericTitle) {
        console.log(`[LIVE-CAPTURE] Skipping comps - title too generic: "${searchTitle}"`);
      }
      
      if (avgPrice === 0 && searchTitle && searchTitle !== 'Unknown Item' && !isGenericTitle) {
        try {
          console.log(`[LIVE-CAPTURE] Fetching real comps for: "${searchTitle}"`);
          
          // TURBO: 5-second timeout on comp lookup for fast auctions (3s was too aggressive)
          const COMPS_TIMEOUT = 5000;
          const compsPromise = getSoldCompsWithCache(searchTitle, identified.category, undefined, { lenient: true });
          const timeoutPromise = new Promise<null>((_, reject) => 
            setTimeout(() => reject(new Error('Comps timeout')), COMPS_TIMEOUT)
          );
          
          const compsResult = await Promise.race([compsPromise, timeoutPromise]) as Awaited<ReturnType<typeof getSoldCompsWithCache>> | null;
          
          if (compsResult && compsResult.comps && compsResult.comps.length > 0) {
            // Calculate median from real comps
            const prices = compsResult.comps.map(c => c.soldPrice).sort((a, b) => a - b);
            const mid = Math.floor(prices.length / 2);
            avgPrice = prices.length % 2 === 0 
              ? (prices[mid - 1] + prices[mid]) / 2 
              : prices[mid];
            compsCount = compsResult.comps.length;
            priceSource = 'ebay_sold';
            console.log(`[LIVE-CAPTURE] Found ${compsCount} eBay comps, median: $${avgPrice.toFixed(2)}`);
          }
        } catch (e: any) {
          if (e.message === 'Comps timeout') {
            console.log(`[LIVE-CAPTURE] Comps lookup timed out (>3s) - using vision estimate`);
          } else {
            console.log(`[LIVE-CAPTURE] Failed to fetch real comps: ${e}`);
          }
        }
      }
      
      const compsTime = Date.now() - compsStartTime;
      console.log(`[LIVE-CAPTURE] Comps lookup took ${compsTime}ms`);

      // If still no comps, use vision estimate as last resort
      if (avgPrice === 0) {
        const estimatedMatch = identified.estimatedValue?.match(/\$?([\d,]+)/);
        if (estimatedMatch) {
          avgPrice = parseFloat(estimatedMatch[1].replace(/,/g, ''));
          priceSource = 'vision_estimate';
          console.log(`[LIVE-CAPTURE] Falling back to vision estimate: $${avgPrice}`);
        }
      }

      // Calculate max buy with 30% margin target after fees + 20% safety reduction
      if (avgPrice > 0) {
        const platformFees = avgPrice * PLATFORM_FEE_RATE;
        const outboundShipping = OUTBOUND_SHIPPING_DEFAULT;
        const netAfterFees = avgPrice - platformFees - outboundShipping;
        // 0.7 = 30% margin target, * 0.8 = additional 20% safety reduction
        maxBuy = Math.floor(netAfterFees * 0.7 * 0.8);
        if (priceSource === 'vision_estimate') compsCount = 1;
      }

      // Determine verdict
      let verdict: 'flip' | 'skip' | 'max_buy' | 'insufficient_data';
      let marginPercent: number | null = null;

      // Reduce confidence for vision-only estimates
      const adjustedConfidence = priceSource === 'vision_estimate' 
        ? Math.min(identified.confidence, 60) 
        : identified.confidence;

      // Check if we have a usable identification (brand or category identified)
      const titleLower = searchTitle.toLowerCase();
      const isUnknown = titleLower.includes('unknown') || titleLower === 'unknown item';
      const hasUsableId = !isUnknown && searchTitle.length > 3;
      
      // RELAXED CONFIDENCE LOGIC: 
      // - If we have brand OR category identified (not "Unknown"), proceed even with lower confidence
      // - Only trigger insufficient_data when truly unrecognizable OR no price data
      // - Threshold: 35 with usable ID, 50 without
      const minConfidence = hasUsableId ? 35 : 50;
      
      if (adjustedConfidence < minConfidence || (avgPrice === 0 && !hasUsableId)) {
        verdict = 'insufficient_data';
      } else if (hasBuyPrice && userBuyPrice !== null) {
        marginPercent = maxBuy > 0 ? ((maxBuy - userBuyPrice) / userBuyPrice) * 100 : 0;
        verdict = userBuyPrice <= maxBuy ? 'flip' : 'skip';
      } else {
        verdict = 'max_buy';
      }

      const result = {
        title: searchTitle, // Use OCR-enhanced title
        category: identified.category,
        confidence: adjustedConfidence,
        maxBuy: maxBuy > 0 ? maxBuy : null,
        sellEstimate: avgPrice > 0 ? avgPrice : null,
        verdict,
        marginPercent,
        compsCount,
        hasBuyPrice,
        buyPrice: userBuyPrice,
        priceSource,
        // OCR extraction info
        ocrTitle: identified.ocrTitle || null,
        visualColor: identified.visualColor || null,
        listingGeneric: identified.listingTitleGeneric || false,
        // Card-specific fields for Sports Cards / TCG Cards
        playerName: identified.playerName || null,
        cardSet: identified.cardSet || null,
        cardYear: identified.cardYear || null,
        cardNumber: identified.cardNumber || null,
      };

      // Cache the result
      liveCaptureCache.set(cacheKey, { result, timestamp: Date.now() });

      // Clean old cache entries periodically (use Array.from to avoid iteration issues)
      if (liveCaptureCache.size > 100) {
        const now = Date.now();
        const entries = Array.from(liveCaptureCache.entries());
        for (const [key, entry] of entries) {
          if (now - entry.timestamp > LIVE_CAPTURE_CACHE_TTL) {
            liveCaptureCache.delete(key);
          }
        }
      }

      // Increment scan count
      await storage.incrementDailyScanCount(userId);

      const totalTime = Date.now() - startTime;
      console.log(`[LIVE-CAPTURE] Complete in ${totalTime}ms - ${verdict} for "${identified.title}"`);

      res.json({
        ...result,
        cached: false,
        processingTimeMs: totalTime
      });

    } catch (error: any) {
      console.error("[LIVE-CAPTURE] Error:", error);
      res.status(500).json({ message: "Analysis failed" });
    }
  });

  // Learn from confirmed scan - adds image to visual library
  app.post("/api/live-capture/learn", requireAuth, async (req, res) => {
    try {
      const { learnFromConfirmedScan } = await import('./scan-learning-service');
      
      const { imageBase64, category, title, brand, model, confidence } = req.body;
      
      if (!imageBase64 || !category || !title) {
        return res.status(400).json({ message: "Missing required fields: imageBase64, category, title" });
      }
      
      const result = await learnFromConfirmedScan({
        imageBase64,
        category,
        title,
        brand,
        model,
        condition: null,
        confidence: confidence || 80,
        source: 'margin_live',
      });
      
      console.log(`[LIVE-CAPTURE-LEARN] ${result.imageAdded ? 'Added' : 'Skipped'}: "${title}" (${category})`);
      
      res.json(result);
    } catch (error: any) {
      console.error("[LIVE-CAPTURE-LEARN] Error:", error);
      res.status(500).json({ message: "Learning failed", error: error.message });
    }
  });

  // Get parallels for a card based on metadata
  app.get("/api/card-parallels", requireAuth, async (req, res) => {
    try {
      const { brand, set, year, sport } = req.query;
      console.log("[Card Parallels] Request params:", { brand, set, year, sport });
      
      const parallels = getParallelsForCard({
        brand: brand as string | undefined,
        set: set as string | undefined,
        year: year ? parseInt(year as string) : undefined,
        sport: sport as string | undefined,
      });
      
      console.log("[Card Parallels] Found", parallels.length, "parallels for", set, year);
      res.json({ parallels });
    } catch (error: any) {
      console.error("Get parallels error:", error);
      res.status(500).json({ message: "Failed to get parallels" });
    }
  });

  // ============ PRODUCT FAMILY AUTOCOMPLETE ============
  
  // Search across all product families for autocomplete
  app.get("/api/product-families/search", async (req, res) => {
    try {
      const query = (req.query.q as string || '').toLowerCase().trim();
      if (query.length < 2) {
        return res.json({ results: [] });
      }
      
      const results: Array<{
        id: string;
        title: string;
        brand: string;
        family: string;
        category: string;
        displayName: string;
      }> = [];
      
      // Search watch families
      const watchResults = await db.execute(sql`
        SELECT id, brand, family, display_name
        FROM watch_families
        WHERE LOWER(brand) LIKE ${`%${query}%`}
           OR LOWER(family) LIKE ${`%${query}%`}
           OR LOWER(display_name) LIKE ${`%${query}%`}
        LIMIT 10
      `);
      for (const row of watchResults.rows as any[]) {
        results.push({
          id: `watch_${row.id}`,
          title: row.display_name,
          brand: row.brand,
          family: row.family,
          category: 'Watches',
          displayName: row.display_name,
        });
      }
      
      // Search shoe families
      const shoeResults = await db.execute(sql`
        SELECT id, brand, family, display_name
        FROM shoe_families
        WHERE LOWER(brand) LIKE ${`%${query}%`}
           OR LOWER(family) LIKE ${`%${query}%`}
           OR LOWER(display_name) LIKE ${`%${query}%`}
        LIMIT 10
      `);
      for (const row of shoeResults.rows as any[]) {
        results.push({
          id: `shoe_${row.id}`,
          title: row.display_name,
          brand: row.brand,
          family: row.family,
          category: 'Shoes',
          displayName: row.display_name,
        });
      }
      
      // Search handbag families
      const handbagResults = await db.execute(sql`
        SELECT id, brand, family, display_name
        FROM handbag_families
        WHERE LOWER(brand) LIKE ${`%${query}%`}
           OR LOWER(family) LIKE ${`%${query}%`}
           OR LOWER(display_name) LIKE ${`%${query}%`}
        LIMIT 10
      `);
      for (const row of handbagResults.rows as any[]) {
        results.push({
          id: `handbag_${row.id}`,
          title: row.display_name,
          brand: row.brand,
          family: row.family,
          category: 'Other',
          displayName: row.display_name,
        });
      }
      
      // Search gaming families
      const gamingResults = await db.execute(sql`
        SELECT id, brand, family, display_name
        FROM gaming_families
        WHERE LOWER(brand) LIKE ${`%${query}%`}
           OR LOWER(family) LIKE ${`%${query}%`}
           OR LOWER(display_name) LIKE ${`%${query}%`}
        LIMIT 10
      `);
      for (const row of gamingResults.rows as any[]) {
        results.push({
          id: `gaming_${row.id}`,
          title: row.display_name,
          brand: row.brand,
          family: row.family,
          category: 'Electronics',
          displayName: row.display_name,
        });
      }
      
      // Search electronics families
      const electronicsResults = await db.execute(sql`
        SELECT id, brand, family, display_name
        FROM electronics_families
        WHERE LOWER(brand) LIKE ${`%${query}%`}
           OR LOWER(family) LIKE ${`%${query}%`}
           OR LOWER(display_name) LIKE ${`%${query}%`}
        LIMIT 10
      `);
      for (const row of electronicsResults.rows as any[]) {
        results.push({
          id: `electronics_${row.id}`,
          title: row.display_name,
          brand: row.brand,
          family: row.family,
          category: 'Electronics',
          displayName: row.display_name,
        });
      }
      
      // Search toy families (Funko Pops, LEGO, etc.)
      const toyResults = await db.execute(sql`
        SELECT id, brand, family, display_name
        FROM toy_families
        WHERE LOWER(brand) LIKE ${`%${query}%`}
           OR LOWER(family) LIKE ${`%${query}%`}
           OR LOWER(display_name) LIKE ${`%${query}%`}
        LIMIT 10
      `);
      for (const row of toyResults.rows as any[]) {
        results.push({
          id: `toy_${row.id}`,
          title: row.display_name,
          brand: row.brand,
          family: row.family,
          category: 'Other',
          displayName: row.display_name,
        });
      }
      
      // Sort by relevance (exact matches first)
      results.sort((a, b) => {
        const aExact = a.brand.toLowerCase() === query || a.family.toLowerCase() === query;
        const bExact = b.brand.toLowerCase() === query || b.family.toLowerCase() === query;
        if (aExact && !bExact) return -1;
        if (bExact && !aExact) return 1;
        return 0;
      });
      
      res.json({ results: results.slice(0, 15) });
    } catch (error: any) {
      console.error("Product family search error:", error);
      res.status(500).json({ message: "Search failed" });
    }
  });

  // ============ WATCH RECOGNITION LIBRARY ENDPOINTS ============
  
  // Get all watch brands
  app.get("/api/watch-library/brands", async (_req, res) => {
    try {
      const { watchBrands } = await import("@shared/watchLibrary");
      res.json({ brands: watchBrands });
    } catch (error: any) {
      console.error("Get watch brands error:", error);
      res.status(500).json({ message: "Failed to get watch brands" });
    }
  });

  // Get style families for a specific brand
  app.get("/api/watch-library/families/:brandId", async (req, res) => {
    try {
      const { brandId } = req.params;
      const { getFamiliesForBrand } = await import("@shared/watchLibrary");
      const families = getFamiliesForBrand(brandId);
      res.json({ families });
    } catch (error: any) {
      console.error("Get watch families error:", error);
      res.status(500).json({ message: "Failed to get watch families" });
    }
  });

  // Get all band types
  app.get("/api/watch-library/band-types", async (_req, res) => {
    try {
      const { bandTypes } = await import("@shared/watchLibrary");
      res.json({ bandTypes });
    } catch (error: any) {
      console.error("Get band types error:", error);
      res.status(500).json({ message: "Failed to get band types" });
    }
  });

  // Get all case sizes
  app.get("/api/watch-library/case-sizes", async (_req, res) => {
    try {
      const { caseSizes } = await import("@shared/watchLibrary");
      res.json({ caseSizes });
    } catch (error: any) {
      console.error("Get case sizes error:", error);
      res.status(500).json({ message: "Failed to get case sizes" });
    }
  });

  // Get suggested movement type for brand/family
  app.get("/api/watch-library/movement-type", async (req, res) => {
    try {
      const { getSuggestedMovementType } = await import("@shared/watchLibrary");
      const brandId = req.query.brand as string | undefined;
      const familyId = req.query.family as string | undefined;
      const suggestedMovement = getSuggestedMovementType(brandId || null, familyId || null);
      res.json({ suggestedMovement });
    } catch (error: any) {
      console.error("Get movement type error:", error);
      res.status(500).json({ message: "Failed to get movement type" });
    }
  });

  // Get counterfeit context for brand/family
  app.get("/api/watch-library/counterfeit-context", async (req, res) => {
    try {
      const { getCounterfeitContext } = await import("@shared/watchLibrary");
      const brandId = req.query.brand as string | undefined;
      const familyId = req.query.family as string | undefined;
      const context = getCounterfeitContext(brandId || null, familyId || null);
      res.json({ context });
    } catch (error: any) {
      console.error("Get counterfeit context error:", error);
      res.status(500).json({ message: "Failed to get counterfeit context" });
    }
  });

  // Update watch metadata for an item
  app.patch("/api/items/:id/watch-metadata", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const itemId = parseInt(req.params.id);
      const { watchBrand, watchFamily, watchBandType, watchCaseSize, watchMovementType, watchWearAssessment, watchBoxAndPapers, watchDialColor, watchDialStyle, watchBezelColor, watchMaterials } = req.body;
      
      const updated = await storage.updateItemWatchMetadata(itemId, userId, {
        watchBrand: watchBrand || null,
        watchFamily: watchFamily || null,
        watchBandType: watchBandType || null,
        watchCaseSize: watchCaseSize || null,
        watchMovementType: watchMovementType || null,
        watchWearAssessment: watchWearAssessment || null,
        watchBoxAndPapers: watchBoxAndPapers || null,
        watchDialColor: watchDialColor || null,
        watchDialStyle: watchDialStyle || null,
        watchBezelColor: watchBezelColor || null,
        watchMaterials: watchMaterials || null,
      });
      
      if (!updated) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      res.json({ item: updated });
    } catch (error: any) {
      console.error("Update watch metadata error:", error);
      res.status(500).json({ message: "Failed to update watch metadata" });
    }
  });

  // ============ USER CORRECTIONS (LEARNING SYSTEM) ============

  // Save user correction for learning
  app.post("/api/user-corrections", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { 
        scanSessionId,
        category,
        originalBrand,
        originalModel,
        originalDialColor,
        originalBezelColor,
        originalFamilyId,
        correctedBrand,
        correctedModel,
        correctedDialColor,
        correctedDialStyle,
        correctedBezelColor,
        correctedFamilyId,
        confidenceSource,
        imageSha256,
        imageStoragePath
      } = req.body;

      if (!category) {
        return res.status(400).json({ message: "Category is required" });
      }

      // Insert user correction
      const [correction] = await db.insert(userCorrections).values({
        userId,
        scanSessionId: scanSessionId || null,
        category,
        originalBrand: originalBrand || null,
        originalModel: originalModel || null,
        originalDialColor: originalDialColor || null,
        originalBezelColor: originalBezelColor || null,
        originalFamilyId: originalFamilyId || null,
        correctedBrand: correctedBrand || null,
        correctedModel: correctedModel || null,
        correctedDialColor: correctedDialColor || null,
        correctedBezelColor: correctedBezelColor || null,
        correctedDialStyle: correctedDialStyle || null,
        correctedFamilyId: correctedFamilyId || null,
        confidenceSource: confidenceSource || null,
        imageSha256: imageSha256 || null,
        imageStoragePath: imageStoragePath || null,
        appliedToLibrary: false
      }).returning();
      
      console.log(`[Learning API] Saved user correction: brand=${correctedBrand}, model=${correctedModel}, familyId=${correctedFamilyId}, source=${confidenceSource}`);

      console.log(`[UserCorrections] Saved correction for ${category}: ${originalModel} → ${correctedModel}`);
      
      res.json({ 
        success: true, 
        correctionId: correction.id,
        message: "Correction saved for future learning"
      });
    } catch (error: any) {
      console.error("[UserCorrections] Save error:", error);
      res.status(500).json({ message: "Failed to save correction" });
    }
  });

  // Get unapplied corrections for admin review/learning
  app.get("/api/user-corrections/pending", requireAuth, async (req: any, res) => {
    try {
      const pendingCorrections = await db
        .select()
        .from(userCorrections)
        .where(eq(userCorrections.appliedToLibrary, false))
        .orderBy(desc(userCorrections.createdAt))
        .limit(100);

      res.json({ corrections: pendingCorrections });
    } catch (error: any) {
      console.error("[UserCorrections] Fetch pending error:", error);
      res.status(500).json({ message: "Failed to fetch pending corrections" });
    }
  });

  // ============ GLOBAL LEARNING API ============
  // Uses the Global Learning Contract for consistent behavior across all categories

  app.post("/api/learning", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const {
        category,
        identityKey,
        configurationGroup,
        suggestedConfigGroup,
        normalizedAttributes,
        embeddingRef,
        imageStoragePath,
        scanSessionId,
        source
      } = req.body;

      // Validate required fields per Global Learning Contract
      if (!category) {
        return res.status(400).json({ message: "Category is required" });
      }
      if (!identityKey) {
        return res.status(400).json({ message: "Identity key is required (modelId/sku/reference)" });
      }
      if (source !== 'USER_CONFIRMED') {
        return res.status(400).json({ message: "Learning must be USER_CONFIRMED" });
      }

      // Extract normalized attributes
      const attrs = normalizedAttributes || {};
      
      // Check if family is 'unclassified' (for watch category)
      let familyWasUnclassified = false;
      let detectedConfigGroup: string | null = null;
      
      if (category.toLowerCase() === 'watch' && typeof identityKey === 'number') {
        // Check if the confirmed family has configuration_group = 'unclassified'
        const [family] = await db
          .select({ configGroup: watchFamiliesTable.configurationGroup })
          .from(watchFamiliesTable)
          .where(eq(watchFamiliesTable.id, identityKey))
          .limit(1);
        
        if (family && family.configGroup === 'unclassified') {
          familyWasUnclassified = true;
          // Use suggested configGroup from vision analysis if provided
          detectedConfigGroup = suggestedConfigGroup || attrs.suggestedConfigGroup || null;
          console.log(`[Learning API] UNCLASSIFIED family detected: id=${identityKey}, suggestedConfigGroup=${detectedConfigGroup}`);
        }
      }

      // Log debug trace
      console.log(`[Learning API] Saving ${category} learning:`, {
        userId,
        identityKey,
        configurationGroup,
        familyWasUnclassified,
        suggestedConfigGroup: detectedConfigGroup,
        source,
        attributeCount: Object.keys(attrs).length,
        attributes: Object.keys(attrs),
      });

      // Insert into user_corrections table (additive learning layer)
      const [correction] = await db.insert(userCorrections).values({
        userId,
        scanSessionId: scanSessionId || null,
        category: category.toLowerCase(),
        originalBrand: null,
        originalModel: null,
        originalDialColor: null,
        originalBezelColor: null,
        originalFamilyId: null,
        correctedBrand: attrs.brand || configurationGroup || null,
        correctedModel: attrs.model || null,
        correctedDialColor: attrs.dialColor || null,
        correctedDialStyle: attrs.dialStyle || null,
        correctedBezelColor: attrs.bezelColor || null,
        correctedFamilyId: typeof identityKey === 'number' ? identityKey : null,
        suggestedConfigGroup: detectedConfigGroup,
        familyWasUnclassified,
        confidenceSource: source,
        imageSha256: null,
        imageStoragePath: imageStoragePath || null,
        appliedToLibrary: false
      }).returning();

      console.log(`[Learning API] SUCCESS: Saved learning entry #${correction.id} for ${category}${familyWasUnclassified ? ' [UNCLASSIFIED - needs admin review]' : ''}`);

      res.json({
        success: true,
        id: correction.id,
        category,
        identityKey,
        source,
        familyWasUnclassified,
        suggestedConfigGroup: detectedConfigGroup,
        message: familyWasUnclassified 
          ? "Learning data saved - unclassified family flagged for admin review"
          : "Learning data saved (additive layer)"
      });
    } catch (error: any) {
      console.error("[Learning API] Error:", error);
      res.status(500).json({ message: "Failed to save learning data" });
    }
  });

  // ============ END WATCH LIBRARY ENDPOINTS ============

  // ============ WATCH PIPELINE TEST ENDPOINT ============
  // Test endpoint to run watch scans and show debug traces
  app.post("/api/watch-pipeline/test-scan", requireAuth, async (req: any, res) => {
    try {
      const { analyzeWatch, resolveWatchIdentity } = await import("./watchAdapterService");
      const { imageBase64, listingText, buyPrice = 100, testMode = false } = req.body;
      
      if (!imageBase64 && !listingText) {
        return res.status(400).json({ message: "Must provide imageBase64 or listingText" });
      }
      
      // Mock fetchComps for test mode
      const mockFetchComps = async (query: string, negatives: string[], condition: string) => {
        console.log(`[TEST] Mock fetchComps: "${query}" (${condition})`);
        // Return empty for testing BLOCKED state
        if (testMode) {
          return { prices: [], soldCount: 0, source: 'mock' };
        }
        // Return some mock prices for demo
        return { 
          prices: [150, 175, 160, 180, 155], 
          soldCount: 5, 
          source: 'mock' 
        };
      };
      
      // Run full pipeline
      const result = await analyzeWatch({
        scanId: Date.now(),
        faceImageBase64: imageBase64 || '',
        listingText: listingText || '',
        buyPrice: parseFloat(buyPrice) || 100,
        shippingIn: 0,
        buyerPaidShipping: true,
        fetchComps: mockFetchComps
      });
      
      res.json({
        identity: {
          brand: result.identity.brand,
          modelName: result.identity.modelName,
          configurationGroup: result.identity.configurationGroup,
          dialColor: result.identity.dialColor,
          identityConfidence: result.identity.identityConfidence,
          needsModelSelection: result.identity.needsModelSelection,
          modelCandidates: result.identity.modelCandidates
        },
        priceTruth: {
          sourceUsed: result.priceTruth.sourceUsed,
          anchorPrice: result.priceTruth.anchorPriceItemOnly,
          soldCount: result.priceTruth.soldCountUsed,
          pricingConfidence: result.priceTruth.pricingConfidence,
          blockReasonCodes: result.priceTruth.blockReasonCodes
        },
        decision: {
          verdict: result.decision.decision,
          profitDollars: result.decision.profitDollars,
          marginPercent: result.decision.marginPercent,
          maxBuyPrice: result.decision.maxBuyPrice,
          reasonCodes: result.decision.reasonCodes
        },
        debugTrace: result.debugTrace
      });
    } catch (error: any) {
      console.error("Watch pipeline test error:", error);
      res.status(500).json({ message: "Pipeline test failed", error: error.message });
    }
  });
  // ============ END WATCH PIPELINE TEST ============

  // ============ SPORTS CARD LIBRARY ENDPOINTS ============
  
  // Get all graders
  app.get("/api/card-library/graders", async (_req, res) => {
    try {
      const { cardGraders } = await import("@shared/sportsCardLibrary");
      res.json({ graders: cardGraders });
    } catch (error: any) {
      console.error("Get card graders error:", error);
      res.status(500).json({ message: "Failed to get graders" });
    }
  });
  
  // Get grades for a specific grader
  app.get("/api/card-library/grades/:graderId", async (req, res) => {
    try {
      const { getGradesForGrader } = await import("@shared/sportsCardLibrary");
      const grades = getGradesForGrader(req.params.graderId);
      res.json({ grades });
    } catch (error: any) {
      console.error("Get card grades error:", error);
      res.status(500).json({ message: "Failed to get grades" });
    }
  });
  
  // Get popular sets
  app.get("/api/card-library/sets", async (_req, res) => {
    try {
      const { popularSets } = await import("@shared/sportsCardLibrary");
      res.json({ sets: popularSets });
    } catch (error: any) {
      console.error("Get card sets error:", error);
      res.status(500).json({ message: "Failed to get sets" });
    }
  });
  
  // Get parallels
  app.get("/api/card-library/parallels", async (_req, res) => {
    try {
      const { parallels } = await import("@shared/sportsCardLibrary");
      res.json({ parallels });
    } catch (error: any) {
      console.error("Get card parallels error:", error);
      res.status(500).json({ message: "Failed to get parallels" });
    }
  });
  
  // Parse serial number from text
  app.post("/api/card-library/parse-serial", async (req, res) => {
    try {
      const { parseSerialNumber } = await import("@shared/sportsCardLibrary");
      const { text } = req.body;
      const result = parseSerialNumber(text || "");
      res.json({ result });
    } catch (error: any) {
      console.error("Parse serial number error:", error);
      res.status(500).json({ message: "Failed to parse serial number" });
    }
  });

  // Card Grading Analysis - AI-powered condition assessment
  app.post("/api/card-grading/analyze", requireAuth, async (req: any, res) => {
    // Check Pro tier
    const user = req.user;
    const tier = user?.subscriptionTier || 'free';
    if (tier !== 'pro' && tier !== 'elite' && !user?.isAdmin) {
      return res.status(403).json({ message: "This feature requires a Pro subscription" });
    }
    try {
      const { image, backImage, cardName, cardYear, cardSet, estimatedRawValue } = req.body;
      
      if (!image) {
        return res.status(400).json({ message: "Image is required" });
      }
      
      // Build image content array - support front + back
      const imageContent: any[] = [];
      
      const prompt = `You are an expert trading card grader with decades of experience grading for PSA, BGS, and SGC. Analyze this trading card image(s) and provide a detailed condition assessment.

${cardName ? `Card: ${cardName}` : ''}
${cardYear ? `Year: ${cardYear}` : ''}
${cardSet ? `Set: ${cardSet}` : ''}
${backImage ? 'NOTE: Two images provided - FRONT and BACK. Analyze BOTH sides.' : ''}

Evaluate the card on these criteria (score each 1-10):
1. CENTERING - Check left/right and top/bottom borders. 50/50 is perfect (10), 60/40 is good (8), 70/30 is fair (6).
2. CORNERS - Look for softness, dings, whitening on ALL 4 corners. Sharp = 10, slight wear = 7-8, visible wear = 5-6.
3. EDGES - Check for chips, rough cuts, whitening. Clean = 10, minor issues = 7-8.
4. SURFACE - Look for scratches, print defects, creases, stains, print lines. Pristine = 10, minor marks = 7-8.

${backImage ? 'For BACK analysis: Check for print defects, centering, damage. Back issues can lower overall grade.' : ''}

Based on your analysis, predict what PSA grade this card would receive (1-10 scale).
The final grade is determined by the LOWEST individual score (PSA uses weakest attribute).

Respond in this exact JSON format:
{
  "predictedPSA": <number 1-10, use .5 increments like 8.5>,
  "confidence": <number 0-1>,
  "centering": {"score": <1-10>, "description": "<specific measurements like 55/45>", "frontBack": "<front centering / back centering>"},
  "corners": {"score": <1-10>, "description": "<describe each corner briefly>"},
  "edges": {"score": <1-10>, "description": "<describe edge condition>"},
  "surface": {"score": <1-10>, "description": "<describe any marks, scratches, print issues>"},
  "backCondition": {"score": <1-10 or null if no back image>, "description": "<back-specific issues>"},
  "recommendations": ["<actionable tip 1>", "<actionable tip 2>", "<tip 3>"],
  "worthGrading": <true if predicted PSA 8+ AND profit potential exists>,
  "overallGrade": "<Gem Mint/Mint/NM-MT/NM/EX-MT/EX/VG/Good/Poor>",
  "gradingRisk": "<low/medium/high - based on borderline scores>",
  "detectedIssues": ["<issue 1>", "<issue 2>"]
}`;

      imageContent.push({ type: "text", text: prompt });
      imageContent.push({ 
        type: "image_url", 
        image_url: { url: image, detail: "high" } 
      });
      
      // Add back image if provided
      if (backImage) {
        imageContent.push({ 
          type: "image_url", 
          image_url: { url: backImage, detail: "high" } 
        });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: imageContent }],
        max_tokens: 1500,
        response_format: { type: "json_object" }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from AI");
      }

      const result = JSON.parse(content);
      
      // Normalize gradingRisk to strict enum values
      if (result.gradingRisk) {
        const riskLower = result.gradingRisk.toLowerCase();
        if (riskLower.includes('low')) {
          result.gradingRisk = 'low';
        } else if (riskLower.includes('high')) {
          result.gradingRisk = 'high';
        } else {
          result.gradingRisk = 'medium';
        }
      } else {
        result.gradingRisk = 'medium';
      }
      
      // Calculate ROI for different PSA tiers
      const rawValue = estimatedRawValue || 25;
      const gradeMultipliers: Record<number, number> = {
        10: 12, 9.5: 6, 9: 3.5, 8.5: 2.2, 8: 1.8, 7.5: 1.4, 7: 1.2, 6: 1, 5: 0.9, 4: 0.7, 3: 0.5, 2: 0.3, 1: 0.2
      };
      
      const predictedGrade = result.predictedPSA || 7;
      const multiplier = gradeMultipliers[predictedGrade] || gradeMultipliers[Math.floor(predictedGrade)] || 1;
      const gradedValue = Math.round(rawValue * multiplier);
      
      // PSA submission tiers (2024 pricing)
      const psaTiers = {
        value: { name: "Value", cost: 20, maxValue: 499, turnaround: "65 business days" },
        regular: { name: "Regular", cost: 50, maxValue: 999, turnaround: "30 business days" },
        express: { name: "Express", cost: 100, maxValue: 2499, turnaround: "15 business days" },
        super: { name: "Super Express", cost: 150, maxValue: 4999, turnaround: "5 business days" }
      };
      
      // Calculate ROI for each tier
      const roiByTier: Record<string, { cost: number; profit: number; roi: number; recommended: boolean }> = {};
      for (const [key, tier] of Object.entries(psaTiers)) {
        const profit = gradedValue - rawValue - tier.cost;
        const roi = rawValue > 0 ? Math.round((profit / (rawValue + tier.cost)) * 100) : 0;
        roiByTier[key] = {
          cost: tier.cost,
          profit: Math.round(profit),
          roi,
          recommended: profit > 0 && gradedValue <= tier.maxValue
        };
      }
      
      // Find best tier
      const bestTier = Object.entries(roiByTier)
        .filter(([_, v]) => v.recommended && v.profit > 0)
        .sort((a, b) => b[1].roi - a[1].roi)[0];
      
      result.estimatedValue = {
        raw: rawValue,
        graded: gradedValue,
        profit: gradedValue - rawValue,
        multiplier: multiplier
      };
      
      const isWorthIt = bestTier ? bestTier[1].profit > 10 : false;
      
      result.gradingCosts = {
        tiers: roiByTier,
        bestTier: bestTier ? bestTier[0] : null,
        bestProfit: bestTier ? bestTier[1].profit : 0,
        worthIt: isWorthIt
      };
      
      // Override worthGrading based on ROI calculation (server-side decision)
      // Card is worth grading if: predicted grade >= 8 AND ROI is positive
      const predictedGradeInt = Math.floor(predictedGrade);
      result.worthGrading = predictedGradeInt >= 8 && isWorthIt;
      
      // Add submission prep checklist
      result.submissionChecklist = [
        { step: "Remove from holder/toploader", done: false },
        { step: "Place in PSA-approved semi-rigid holder", done: false },
        { step: "Fill out submission form online", done: false },
        { step: "Print packing slip", done: false },
        { step: "Use cardboard sandwich for shipping", done: false },
        { step: "Ship with tracking & insurance", done: false }
      ];
      
      // Add photo tips if back image wasn't provided
      if (!backImage) {
        result.recommendations.unshift("Add back image for more accurate grading - back defects can lower the grade");
      }

      res.json(result);
    } catch (error: any) {
      console.error("Card grading analysis error:", error);
      res.status(500).json({ message: "Failed to analyze card condition" });
    }
  });

  // Ximilar Card Analysis - Test endpoint for comparing against OpenAI
  app.post("/api/ximilar/analyze-card", requireAuth, async (req: any, res) => {
    const user = req.user;
    if (!user?.isAdmin) {
      return res.status(403).json({ message: "Admin only feature for testing" });
    }

    try {
      const { imageUrl } = req.body;
      const ximilarToken = process.env.XIMILAR_API_TOKEN;

      if (!ximilarToken) {
        return res.status(400).json({ 
          message: "XIMILAR_API_TOKEN not configured",
          setup: "Add your Ximilar API token to secrets. Get free 3,000 credits/month at ximilar.com"
        });
      }

      if (!imageUrl) {
        return res.status(400).json({ message: "imageUrl is required" });
      }

      // Run all Ximilar analyses in parallel
      const [identification, grading, centering] = await Promise.all([
        ximilarIdentifyCard(imageUrl, ximilarToken, { pricing: true, lang: true }).catch(e => ({ error: e.message })),
        ximilarGradeCard(imageUrl, ximilarToken, 'PSA').catch(e => ({ error: e.message })),
        ximilarCardCentering(imageUrl, ximilarToken).catch(e => ({ error: e.message }))
      ]);

      res.json({
        provider: 'ximilar',
        identification,
        grading,
        centering,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Ximilar analysis error:", error);
      res.status(500).json({ message: error.message || "Ximilar API error" });
    }
  });

  // Ximilar status check
  app.get("/api/ximilar/status", requireAuth, async (req: any, res) => {
    const configured = !!process.env.XIMILAR_API_TOKEN;
    res.json({
      configured,
      message: configured 
        ? "Ximilar API is configured and ready" 
        : "Add XIMILAR_API_TOKEN to secrets (free 3,000 credits/month)"
    });
  });

  // Sports Memorabilia Analysis - AI-powered analysis for jerseys, helmets, signed balls
  app.post("/api/sports-memorabilia/analyze", requireAuth, async (req: any, res) => {
    try {
      const { image, itemType, certNumber, authenticator } = req.body;
      
      if (!image) {
        return res.status(400).json({ message: "Image is required" });
      }

      const prompt = `You are an expert sports memorabilia authenticator and appraiser. Analyze this image of a ${itemType || 'sports collectible'}.

IDENTIFY:
1. Item Type: (jersey, helmet, signed ball, signed photo, game-used equipment, other)
2. Sport: (NFL, NBA, MLB, NHL, NCAA, Soccer, other)
3. Player/Team: Look for jersey numbers, team logos, signatures
4. Era/Year: Estimate based on design, manufacturer tags, style

AUTHENTICATION ANALYSIS:
- Signature Quality: (bold/clean, faded, questionable, not visible)
- Signature Location: Where on the item
- Visible COA/Authentication: Any stickers, holograms, tags (PSA/DNA, JSA, Beckett, Fanatics)
- Authentication Markers: Look for hologram stickers, numbered certificates, tamper-proof tags
${certNumber ? `- Certificate Number to verify: ${certNumber}` : ''}
${authenticator ? `- Claimed Authenticator: ${authenticator}` : ''}

CONDITION FACTORS:
- For Jerseys: Stains, tears, repairs, fading, tag condition
- For Helmets: Scratches, cracks, facemask condition, decal wear
- For Balls: Ink fading, leather/panel condition, scuffs
- For Photos: Creases, fading, matting condition

VALUE FACTORS:
- Hall of Famer / Star player premium
- Game-worn vs team-issued vs replica
- Championship/significant game association
- Inscription presence and content

Respond in this exact JSON format:
{
  "itemType": "<jersey|helmet|signed_ball|signed_photo|game_used|other>",
  "sport": "<sport name>",
  "player": "<player name or 'Unknown'>",
  "team": "<team name>",
  "era": "<estimated year/era>",
  "signature": {
    "present": <true/false>,
    "quality": "<bold|clean|faded|questionable|none>",
    "location": "<where on item>",
    "inscriptions": ["<any inscriptions>"]
  },
  "authentication": {
    "visible": <true/false>,
    "authenticator": "<PSA|JSA|Beckett|Fanatics|Unknown|None>",
    "hologramPresent": <true/false>,
    "certNumberVisible": "<cert number if visible or null>"
  },
  "condition": {
    "grade": "<Mint|Excellent|Very Good|Good|Fair|Poor>",
    "issues": ["<list of condition issues>"]
  },
  "valueFactors": {
    "isHallOfFamer": <true/false/unknown>,
    "isGameWorn": <true/false/unknown>,
    "hasInscription": <true/false>,
    "premiumFactors": ["<list of value boosters>"]
  },
  "recommendations": ["<actionable tips>"],
  "authenticationAdvice": "<specific advice about verifying authenticity>",
  "confidence": <0-1>
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: image, detail: "high" } }
            ]
          }
        ],
        max_tokens: 1500,
        response_format: { type: "json_object" }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from AI");
      }

      const result = JSON.parse(content);
      
      // Add authentication verification tips
      result.verificationSteps = [
        { step: "Check for hologram sticker", description: "Authentic items have tamper-proof holograms from PSA, JSA, Beckett, or Fanatics" },
        { step: "Verify certificate number", description: "Look up the cert number on the authenticator's website" },
        { step: "Examine signature consistency", description: "Compare to known authentic examples" },
        { step: "Check item provenance", description: "Ask for photos of the signing or chain of custody" }
      ];
      
      // Add authenticator verification URLs
      result.verificationUrls = {
        PSA: "https://www.psacard.com/adn",
        JSA: "https://www.spenceloa.com/verify",
        Beckett: "https://www.beckett-authentication.com/services/authentication-verification",
        Fanatics: "https://www.fanaticsauthentic.com/verify"
      };

      res.json(result);
    } catch (error: any) {
      console.error("Sports memorabilia analysis error:", error);
      res.status(500).json({ message: "Failed to analyze sports memorabilia" });
    }
  });
  
  // Update card metadata for an item
  app.patch("/api/items/:id/card-metadata", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const itemId = parseInt(req.params.id);
      const {
        cardIsGraded,
        cardGrader,
        cardGrade,
        cardYear,
        cardSet,
        cardPlayer,
        cardNumber,
        cardParallel,
        cardCertNumber,
        cardSerialNumber,
        cardSerialTotal,
        cardImageFrontUrl,
        cardImageBackUrl,
        cardVariationType,
        cardVariationName,
        cardVariationFinish,
        cardVariationConfirmed,
      } = req.body;
      
      const updated = await storage.updateItemCardMetadata(itemId, userId, {
        cardIsGraded: cardIsGraded ?? null,
        cardGrader: cardGrader || null,
        cardGrade: cardGrade || null,
        cardYear: cardYear || null,
        cardSet: cardSet || null,
        cardPlayer: cardPlayer || null,
        cardNumber: cardNumber || null,
        cardParallel: cardParallel || null,
        cardCertNumber: cardCertNumber || null,
        cardSerialNumber: cardSerialNumber || null,
        cardSerialTotal: cardSerialTotal || null,
        cardImageFrontUrl: cardImageFrontUrl || null,
        cardImageBackUrl: cardImageBackUrl || null,
        cardVariationType: cardVariationType || null,
        cardVariationName: cardVariationName || null,
        cardVariationFinish: cardVariationFinish || null,
        cardVariationConfirmed: cardVariationConfirmed ?? null,
      });
      
      if (!updated) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      res.json({ item: updated });
    } catch (error: any) {
      console.error("Update card metadata error:", error);
      res.status(500).json({ message: "Failed to update card metadata" });
    }
  });
  
  // Analyze grading readiness for raw cards (visual assessment only)
  app.post("/api/items/:id/grading-readiness", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const itemId = parseInt(req.params.id);
      
      // Get the item first
      const item = await storage.getItem(itemId, userId);
      if (!item) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      // Only allow for raw cards (not graded)
      if (item.cardIsGraded) {
        return res.status(400).json({ message: "Grading readiness is only available for raw cards" });
      }
      
      // Need at least front image
      const frontImage = item.cardImageFrontUrl;
      const backImage = item.cardImageBackUrl;
      
      if (!frontImage) {
        return res.status(400).json({ message: "Front card image is required for grading readiness assessment" });
      }
      
      const { buildGradingReadinessPrompt, GRADING_READINESS_DISCLAIMER, calculateGradingROI, validateGradingResponse } = await import("@shared/gradingReadiness");
      
      // Get the raw value for ROI calculation from comps data (avgComp or median from soldComps)
      let rawValue: number | null = null;
      
      // Try avgComp first (most reliable)
      if (item.avgComp) {
        rawValue = parseFloat(String(item.avgComp));
      }
      // Try lowComp as fallback (conservative estimate for raw cards)
      else if (item.lowComp) {
        rawValue = parseFloat(String(item.lowComp));
      }
      // Try price field as last resort (may be listing price, not raw value)
      else if (item.price) {
        rawValue = parseFloat(item.price);
      }
      
      // Validate raw value is reasonable (between $1 and $100,000)
      if (rawValue !== null && (rawValue < 1 || rawValue > 100000 || isNaN(rawValue))) {
        rawValue = null;
      }
      
      // Build image content array
      const imageContent: any[] = [];
      
      if (frontImage) {
        imageContent.push({
          type: "image_url",
          image_url: { url: frontImage, detail: "high" }
        });
      }
      
      if (backImage) {
        imageContent.push({
          type: "image_url", 
          image_url: { url: backImage, detail: "high" }
        });
      }
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: buildGradingReadinessPrompt()
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Analyze this ${backImage ? 'front and back of a' : 'front of a'} sports card for grading readiness.` },
              ...imageContent
            ]
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 500
      });
      
      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ message: "Failed to analyze card" });
      }
      
      const rawResult = JSON.parse(content);
      
      // Validate and sanitize the AI response
      const validatedResult = validateGradingResponse(rawResult);
      
      // Build the full result with disclaimer and ROI
      const result: any = {
        ...validatedResult,
        disclaimer: GRADING_READINESS_DISCLAIMER,
      };
      
      // Calculate ROI only if we have a valid raw value AND condition tier
      // If no comps data available, skip ROI calculation entirely
      if (rawValue !== null && result.conditionTier?.tier) {
        // Map condition tiers to approximate grade ranges for ROI estimation
        // These are NOT predictions - just rough estimates for ROI math
        const tierToGradeRange: Record<string, { low: number; high: number }> = {
          'gem-candidate': { low: 8, high: 10 },
          'high-grade': { low: 7, high: 9 },
          'mid-grade': { low: 5, high: 7 },
          'low-grade': { low: 1, high: 5 },
        };
        const range = tierToGradeRange[result.conditionTier.tier] || { low: 5, high: 7 };
        result.roi = calculateGradingROI(rawValue, range.low, range.high);
      }
      
      // Save to database
      await storage.updateItemGradingReadiness(itemId, userId, result);
      
      res.json({ gradingReadiness: result });
    } catch (error: any) {
      console.error("Grading readiness analysis error:", error);
      res.status(500).json({ message: "Failed to analyze grading readiness" });
    }
  });
  
  // Generate eBay listing from analyzed item
  app.post("/api/items/:id/generate-listing", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const itemId = parseInt(req.params.id);
      
      // Get the item
      const item = await storage.getItem(itemId, userId);
      if (!item) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      // Extract relevant data for listing generation
      const title = item.confirmedTitle || item.title || "Unknown Item";
      const condition = item.condition || "Pre-owned";
      const avgSoldPrice = item.avgComp ? parseFloat(String(item.avgComp)) : null;
      const lowComp = item.lowComp ? parseFloat(String(item.lowComp)) : null;
      const highComp = item.highComp ? parseFloat(String(item.highComp)) : null;
      
      // Parse raw analysis for additional details
      let category = "General";
      let brand = "";
      let modelInfo = "";
      
      if (item.rawAnalysis && typeof item.rawAnalysis === 'object') {
        const raw = item.rawAnalysis as any;
        category = raw.category || raw.detectedCategory || category;
        brand = raw.brand || raw.detectedBrand || "";
        modelInfo = raw.model || raw.modelFamily || raw.family || "";
      }
      
      // Build the prompt for listing generation with SEO scoring
      const listingPrompt = `Generate an optimized eBay listing for this item. Return a JSON object with these fields:
      
1. "title" - An 80-character max eBay title optimized for search. Include brand, model, key features. No special characters.
2. "description" - A 150-300 word eBay description. Include:
   - Opening hook about the item
   - Key features and specifications
   - Condition details
   - What's included
   - Professional closing
3. "suggestedPrice" - Recommended listing price (number only, based on market data)
4. "suggestedCategory" - Best eBay category for this item
5. "itemSpecifics" - Object with key-value pairs for eBay item specifics (brand, model, color, size, etc.)
6. "keywords" - Array of objects with SEO analysis for each keyword:
   {
     "keyword": "exact search term buyers use",
     "score": 1-100 (higher = better combination of search volume and lower competition),
     "competition": "low" | "medium" | "high",
     "searchVolume": "low" | "medium" | "high",
     "tip": "brief tip on why this keyword is effective"
   }
   Include 6-8 keywords ranked from best to worst.
7. "titleScore" - A 1-100 score for the generated title's SEO effectiveness
8. "titleAnalysis" - Brief explanation of why the title is optimized (mention keyword placement, character usage)
9. "alternativeTitles" - Array of 2 alternative title options with different keyword emphasis

Item Details:
- Current Title: ${title}
- Brand: ${brand || "Unknown"}
- Model/Type: ${modelInfo || "N/A"}
- Condition: ${condition}
- Category: ${category}
${avgSoldPrice ? `- Average Sold Price: $${avgSoldPrice.toFixed(2)}` : ""}
${lowComp && highComp ? `- Price Range: $${lowComp.toFixed(2)} - $${highComp.toFixed(2)}` : ""}

Generate a professional, SEO-optimized listing that will attract buyers and maximize sale price.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert eBay listing writer who creates compelling, SEO-optimized listings that sell. You understand eBay's best practices for titles, descriptions, and item specifics."
          },
          {
            role: "user",
            content: listingPrompt
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 1000
      });
      
      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ message: "Failed to generate listing" });
      }
      
      let listing;
      try {
        listing = JSON.parse(content);
      } catch (parseErr) {
        console.error("Failed to parse listing response:", parseErr);
        return res.status(500).json({ message: "Failed to parse listing data" });
      }
      
      // Sanitize and validate title - enforce 80 char max, remove special chars
      let sanitizedTitle = String(listing.title || title)
        .replace(/[^\w\s\-.,&()]/g, '')
        .trim()
        .substring(0, 80);
      
      // Parse and validate keywords with SEO scores
      // Handle both object format (preferred) and string format (fallback)
      let validatedKeywords: any[] = [];
      if (Array.isArray(listing.keywords)) {
        validatedKeywords = listing.keywords
          .filter((k: any) => k && (typeof k === 'object' || typeof k === 'string'))
          .map((k: any, idx: number) => {
            // If it's a string, convert to object with default SEO scores
            if (typeof k === 'string') {
              return {
                keyword: String(k).trim(),
                score: Math.max(50, 85 - (idx * 5)), // Descending scores for ranked keywords
                competition: idx < 2 ? 'low' : idx < 5 ? 'medium' : 'high',
                searchVolume: idx < 3 ? 'high' : idx < 6 ? 'medium' : 'low',
                tip: ''
              };
            }
            // Object format - validate fields
            return {
              keyword: String(k.keyword || '').trim(),
              score: typeof k.score === 'number' ? Math.min(100, Math.max(1, k.score)) : 50,
              competition: ['low', 'medium', 'high'].includes(k.competition) ? k.competition : 'medium',
              searchVolume: ['low', 'medium', 'high'].includes(k.searchVolume) ? k.searchVolume : 'medium',
              tip: k.tip ? String(k.tip).substring(0, 150) : ''
            };
          })
          .filter((k: any) => k.keyword.length > 0)
          .slice(0, 10);
      }
      
      // Ensure all fields have valid fallback values
      const validatedListing = {
        title: sanitizedTitle || title.substring(0, 80),
        description: String(listing.description || `${title} - ${condition}. Ships fast!`),
        suggestedPrice: typeof listing.suggestedPrice === 'number' 
          ? listing.suggestedPrice 
          : (avgSoldPrice || 0),
        suggestedCategory: String(listing.suggestedCategory || category),
        itemSpecifics: (listing.itemSpecifics && typeof listing.itemSpecifics === 'object') 
          ? listing.itemSpecifics 
          : {},
        keywords: validatedKeywords,
        titleScore: typeof listing.titleScore === 'number' 
          ? Math.min(100, Math.max(1, listing.titleScore)) 
          : null,
        titleAnalysis: listing.titleAnalysis ? String(listing.titleAnalysis).substring(0, 300) : null,
        alternativeTitles: Array.isArray(listing.alternativeTitles)
          ? listing.alternativeTitles
              .filter((t: any) => typeof t === 'string')
              .map((t: any) => String(t).substring(0, 80))
              .slice(0, 3)
          : [],
        originalItem: {
          id: item.id,
          title: title,
          condition: condition,
          avgSoldPrice: avgSoldPrice
        }
      };
      
      res.json({
        success: true,
        listing: validatedListing
      });
      
    } catch (error: any) {
      console.error("Generate listing error:", error);
      res.status(500).json({ message: "Failed to generate listing" });
    }
  });
  
  // PSA Cert Verification - lookup grading info from PSA Public API
  app.get("/api/psa/verify/:certNumber", requireAuth, async (req: any, res) => {
    try {
      const certNumber = req.params.certNumber;
      
      // Validate cert number format (should be numeric, 8-10 digits typically)
      if (!certNumber || !/^\d{6,12}$/.test(certNumber)) {
        return res.status(400).json({ 
          message: "Invalid cert number. PSA cert numbers are 6-12 digits." 
        });
      }
      
      const psaToken = process.env.PSA_API_TOKEN;
      if (!psaToken) {
        return res.status(503).json({ 
          message: "PSA API not configured. Please add PSA_API_TOKEN to secrets.",
          needsConfig: true
        });
      }
      
      // Call PSA Public API
      const response = await fetch(
        `https://api.psacard.com/publicapi/cert/GetByCertNumber/${certNumber}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `bearer ${psaToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        if (response.status === 401) {
          return res.status(401).json({ message: "PSA API token invalid or expired" });
        }
        throw new Error(`PSA API returned ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.PSACert) {
        return res.status(404).json({ 
          message: "Cert number not found in PSA database",
          valid: false
        });
      }
      
      // Return verified cert data
      res.json({
        valid: true,
        cert: {
          certNumber: data.PSACert.CertNumber,
          grade: data.PSACert.CardGrade,
          category: data.PSACert.Category,
          subject: data.PSACert.Subject,
          brand: data.PSACert.Brand,
          cardNumber: data.PSACert.CardNumber,
          year: data.PSACert.Year,
          variety: data.PSACert.Variety,
          labelType: data.PSACert.LabelType,
          reverseBarcode: data.PSACert.ReverseBarcode,
          isTrueGrade: data.IsTrueGrade,
          specNumber: data.PSACert.SpecNumber
        }
      });
      
    } catch (error: any) {
      console.error("PSA verification error:", error);
      res.status(500).json({ message: "Failed to verify cert number" });
    }
  });
  
  // Analyze by text query - sold comps driven analysis for general market verdict
  app.post("/api/items/analyze-text", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { query, category, scanMode } = req.body;
      
      if (!query || typeof query !== 'string' || query.trim().length < 3) {
        return res.status(400).json({ message: "Please enter an item description (at least 3 characters)" });
      }
      
      if (!category) {
        return res.status(400).json({ message: "Please select a category" });
      }
      
      // Check scan limit
      const scanStatus = await storage.canUserScan(userId);
      if (!scanStatus.allowed) {
        return res.status(429).json({ 
          message: "Daily scan limit reached (5/day). Upgrade to Pro for unlimited scans.",
          remaining: 0,
          limit: scanStatus.limit,
        });
      }
      
      const searchQuery = query.trim();
      
      // Get sold comps for this query
      const compsResult = await getSoldCompsWithCache(searchQuery, category);
      
      // Calculate expiry date for the item
      const user = await storage.getUser(userId);
      const tier = user?.subscriptionTier || 'free';
      // History expiry: Elite/Admin = permanent, Pro = 30 days, Free = 7 days
      const expiresAt = (user?.isAdmin || tier === 'elite')
        ? null
        : tier === 'pro'
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      
      // Calculate market-based verdict using pricing engine
      let verdict = "skip";
      let verdictLabel = "Skip It";
      let confidence = 40;
      let avgPrice = 0;
      let explanation = "";
      let marginPercent = 0;
      
      // Pricing engine outputs
      let priceConfidence: ConfidenceLevel = 'low';
      let displayMode: DisplayMode = 'estimate_range';
      let resaleRange: { low: number; high: number } | undefined;
      let trimmedMedian = 0;
      let cv = 0;
      let spread = 0;
      let inconsistentComps = false;
      let ceilingApplied = false;
      let clampApplied = false;
      
      if (compsResult && compsResult.comps.length >= 1 && compsResult.medianPrice) {
        // Use pricing engine for consistent comp processing
        const compPrices = compsResult.comps.map((c: SoldComp) => c.soldPrice || c.totalPrice).filter((p): p is number => p !== undefined);
        const processed = processComps(compPrices);
        
        trimmedMedian = processed.trimmedMedian;
        cv = processed.cv;
        spread = processed.spread;
        avgPrice = trimmedMedian;
        
        // Apply category ceiling
        const ceiling = getCategoryCeiling(category, trimmedMedian);
        if (trimmedMedian > ceiling) {
          avgPrice = ceiling;
          ceilingApplied = true;
        }
        
        // Determine confidence level using strict rules
        const compCount = processed.finalComps.length;
        if (compCount >= HIGH_CONFIDENCE_MIN_COMPS && 
            cv <= HIGH_CONFIDENCE_MAX_CV && 
            spread <= HIGH_CONFIDENCE_MAX_SPREAD && 
            !ceilingApplied) {
          priceConfidence = 'high';
          displayMode = 'single';
        } else if (compCount >= 2 && compCount < HIGH_CONFIDENCE_MIN_COMPS) {
          priceConfidence = 'moderate';
          displayMode = 'range';
        } else {
          priceConfidence = 'low';
          displayMode = 'estimate_range';
        }
        
        // Mark inconsistent comps
        inconsistentComps = cv > HIGH_CONFIDENCE_MAX_CV || spread > HIGH_CONFIDENCE_MAX_SPREAD;
        
        // Apply sanity clamp (no buy price for text queries, use median-only clamp)
        const clampResult = applySanityClamp(avgPrice, undefined, trimmedMedian);
        if (clampResult.wasClampApplied) {
          avgPrice = clampResult.clampedResale;
          clampApplied = true;
          // Downgrade confidence if clamp was applied
          priceConfidence = 'low';
          displayMode = 'estimate_range';
        }
        
        // Set and normalize resale range using centralized function
        const rawRange = { 
          low: Math.round(processed.lowComp), 
          high: Math.round(processed.highComp) 
        };
        resaleRange = normalizeResaleRange(rawRange, avgPrice, { ceilingApplied, clampApplied });
        
        // Calculate net after fees
        const platformFees = avgPrice * PLATFORM_FEE_RATE;
        const outboundShipping = OUTBOUND_SHIPPING_DEFAULT;
        const netAfterFees = avgPrice - platformFees - outboundShipping;
        
        // Map confidence to numeric score
        confidence = priceConfidence === 'high' ? 85 : 
                     priceConfidence === 'moderate' ? 65 : 45;
        
        explanation = `Based on ${compCount} sold comps, items like this typically sell for $${avgPrice.toFixed(2)} (median). After ~13% fees and ~$8 shipping, net proceeds are approximately $${netAfterFees.toFixed(2)}. Compare this against your acquisition cost to assess profitability.`;
        
        // General guidance based on market activity
        if (priceConfidence === 'high') {
          verdict = "flip";
          verdictLabel = "Active Market";
          explanation += " This item has strong market activity with consistent pricing.";
        } else if (compCount >= 2) {
          verdict = "flip";
          verdictLabel = "Market Available";
          explanation += " There is market activity for this item.";
        }
      } else {
        // No real sold data found - trigger Research Mode
        // REMOVED: Browse API fallback (was using active listings, not sold data)
        confidence = 25;
        priceConfidence = 'low';
        displayMode = 'estimate_range';
        explanation = "Insufficient sold data found for this item. Consider checking eBay directly or refining your search terms.";
        verdict = "skip";
        verdictLabel = "Insufficient Data";
      }
      
      // Create a market analysis item (not a specific listing)
      const item = await storage.createItem({
        userId,
        url: `market://query/${encodeURIComponent(searchQuery)}`,
        title: searchQuery,
        confirmedTitle: searchQuery,
        price: null,
        buyPrice: null,
        shipping: null,
        shippingIn: null,
        condition: null,
        analysis: verdictLabel,
        confidence,
        explanation,
        rawAnalysis: {
          comps: compsResult,
          avgSoldPrice: avgPrice,
          netProfit: null,
          verdict: verdictLabel,
          confidence,
          shortExplanation: explanation,
          // Pricing engine fields for consistent display
          priceConfidence,
          displayMode,
          resaleRange,
          trimmedMedian,
          cv,
          spread,
          inconsistentComps,
          ceilingApplied,
          clampApplied,
        },
        platformFeeRate: PLATFORM_FEE_RATE.toString(),
        outboundShipping: OUTBOUND_SHIPPING_DEFAULT.toString(),
        lowComp: resaleRange?.low?.toString() || compsResult?.lowPrice?.toString() || null,
        avgComp: avgPrice?.toString() || compsResult?.medianPrice?.toString() || null,
        highComp: resaleRange?.high?.toString() || compsResult?.highPrice?.toString() || null,
        tax: null,
        category,
        recommendation: explanation,
        userDecision: null,
        expiresAt,
        manualCompPrices: null,
        compSource: compsResult?.source || 'none',
        flipPrice: null,
        decisionVerdict: verdict,
        decisionScore: confidence,
        decisionData: {
          verdict,
          marginPercent: 0,
          confidence,
          dataSource: 'sold_comps',
          explanation,
          priceConfidence,
          displayMode,
          resaleRange,
          inconsistentComps,
        },
        scanMode: scanMode || 'flip',
        watchBrand: null,
        watchFamily: null,
        watchBandType: null,
        watchCaseSize: null,
        watchMovementType: null,
        watchWearAssessment: null,
        watchBoxAndPapers: null,
        watchAftermarketFlags: null,
        watchDialColor: null,
        watchDialStyle: null,
        watchBezelColor: null,
        watchMaterials: null,
        cardIsGraded: null,
        cardGrader: null,
        cardGrade: null,
        cardYear: null,
        cardSet: null,
        cardPlayer: null,
        cardNumber: null,
        cardParallel: null,
        cardCertNumber: null,
        cardSerialNumber: null,
        cardSerialTotal: null,
        cardImageFrontUrl: null,
        cardImageBackUrl: null,
        cardVariationType: null,
        cardVariationName: null,
        cardVariationFinish: null,
        cardVariationConfirmed: null,
        gradingReadiness: null,
        gradingReadinessAnalyzedAt: null,
      });
      
      // Increment scan count
      await storage.incrementDailyScanCount(userId);
      
      res.json({
        id: item.id,
        verdict: verdictLabel,
        confidence,
        avgPrice,
        compsCount: compsResult?.comps.length || 0,
        explanation,
        comps: compsResult,
      });
    } catch (error: any) {
      console.error("Text query analysis error:", error);
      res.status(500).json({ message: "Failed to analyze item" });
    }
  });

  // Get variation types
  app.get("/api/card-library/variation-types", async (_req, res) => {
    try {
      const { variationTypes } = await import("@shared/sportsCardLibrary");
      res.json({ variationTypes });
    } catch (error: any) {
      console.error("Get variation types error:", error);
      res.status(500).json({ message: "Failed to get variation types" });
    }
  });
  
  // Get parallel names for dropdown
  app.get("/api/card-library/parallel-names", async (_req, res) => {
    try {
      const { getAllParallelNames } = await import("@shared/sportsCardLibrary");
      res.json({ parallelNames: getAllParallelNames() });
    } catch (error: any) {
      console.error("Get parallel names error:", error);
      res.status(500).json({ message: "Failed to get parallel names" });
    }
  });
  
  // Get insert sets for dropdown
  app.get("/api/card-library/insert-sets", async (_req, res) => {
    try {
      const { getAllInsertSets } = await import("@shared/sportsCardLibrary");
      res.json({ insertSets: getAllInsertSets() });
    } catch (error: any) {
      console.error("Get insert sets error:", error);
      res.status(500).json({ message: "Failed to get insert sets" });
    }
  });
  
  // Get finish patterns for tags
  app.get("/api/card-library/finish-patterns", async (_req, res) => {
    try {
      const { getAllFinishPatterns } = await import("@shared/sportsCardLibrary");
      res.json({ finishPatterns: getAllFinishPatterns() });
    } catch (error: any) {
      console.error("Get finish patterns error:", error);
      res.status(500).json({ message: "Failed to get finish patterns" });
    }
  });
  
  // Suggest variation from text
  app.post("/api/card-library/suggest-variation", async (req, res) => {
    try {
      const { suggestVariation, hasSerialNumber } = await import("@shared/sportsCardLibrary");
      const { text, serialNumber } = req.body;
      const hasSerial = serialNumber ? true : hasSerialNumber(text || "");
      const suggestion = suggestVariation(text || "", hasSerial);
      res.json({ suggestion });
    } catch (error: any) {
      console.error("Suggest variation error:", error);
      res.status(500).json({ message: "Failed to suggest variation" });
    }
  });

  // ============ END SPORTS CARD LIBRARY ENDPOINTS ============

  // ============ BRAND LIBRARY ENDPOINTS ============
  
  // Get all brands (with optional category filter)
  app.get("/api/brands", async (req, res) => {
    try {
      const { category } = req.query;
      
      let result;
      if (category && typeof category === 'string') {
        result = await db.select().from(brands)
          .where(and(eq(brands.isActive, true), eq(brands.category, category)))
          .orderBy(brands.category, brands.name);
      } else {
        result = await db.select().from(brands)
          .where(eq(brands.isActive, true))
          .orderBy(brands.category, brands.name);
      }
      
      res.json(result);
    } catch (error: any) {
      console.error("Get brands error:", error);
      res.status(500).json({ message: "Failed to get brands" });
    }
  });
  
  // Get brand items for a specific brand
  app.get("/api/brands/:slug/items", async (req, res) => {
    try {
      const { slug } = req.params;
      
      const [brand] = await db.select().from(brands)
        .where(and(eq(brands.slug, slug), eq(brands.isActive, true)));
      
      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }
      
      const items = await db.select().from(brandItems)
        .where(eq(brandItems.brandId, brand.id))
        .orderBy(brandItems.name);
      
      res.json({ brand, items });
    } catch (error: any) {
      console.error("Get brand items error:", error);
      res.status(500).json({ message: "Failed to get brand items" });
    }
  });
  
  // ============ END BRAND LIBRARY ENDPOINTS ============

  // Confirm a photo scan candidate selection
  app.post("/api/scan-sessions/:id/confirm", requireAuth, async (req, res) => {
    console.log(`[Confirm] === CONFIRM REQUEST ===`);
    try {
      const userId = (req.user as { id: number }).id;
      const sessionId = parseInt(req.params.id);
      const { candidateId, selectedParallel, candidateOverride } = req.body;
      
      console.log(`[Confirm] sessionId=${sessionId}, candidateId=${candidateId}, userId=${userId}`);

      if (!candidateId) {
        console.log('[Confirm] ERROR: Missing candidateId');
        return res.status(400).json({ message: "Candidate ID required" });
      }

      const session = await storage.getScanSession(sessionId, userId);
      if (!session) {
        console.log(`[Confirm] ERROR: Session ${sessionId} not found for user ${userId}`);
        return res.status(404).json({ message: "Session not found" });
      }
      
      console.log(`[Confirm] Session found, status=${session.status}, has candidates=${!!(session.candidates)}`);

      const candidates = (session.candidates as any[]) || [];
      console.log(`[Confirm] Candidates count: ${candidates.length}, searching for ID: ${candidateId}`);
      console.log(`[Confirm] Available candidate IDs: ${candidates.map((c: any) => c.id).join(', ')}`);
      
      // Extract colorOverride for watch color selections from client
      const { colorOverride } = req.body;
      
      // Use candidateOverride if provided (user selected from model candidates)
      // This allows library learning when user corrects a misidentification
      // CRITICAL: Normalize ID comparison to string to prevent type mismatch failures
      const candidateIdStr = String(candidateId);
      let selectedCandidate = candidateOverride || candidates.find((c: any) => String(c.id) === candidateIdStr);

      if (!selectedCandidate) {
        console.log(`[Confirm] ERROR: Candidate ${candidateId} not found in session candidates`);
        return res.status(400).json({ message: "Candidate not found" });
      }
      
      // Apply color selections from client (user may have updated dial/bezel colors)
      // DIAGNOSTIC: Log incoming and outgoing colors
      const isWatchConfirm = (selectedCandidate.category || '').toLowerCase().includes('watch');
      if (isWatchConfirm) {
        console.log(`[WATCH COLORS] Confirm - before: dialColor=${selectedCandidate.dialColor}, bezelColor=${selectedCandidate.bezelColor}`);
      }
      
      if (colorOverride) {
        console.log(`[Confirm] Applying color override: dial=${colorOverride.dialColor}, bezel=${colorOverride.bezelColor}, style=${colorOverride.dialStyle}`);
        if (colorOverride.dialColor) selectedCandidate.dialColor = colorOverride.dialColor;
        if (colorOverride.bezelColor) selectedCandidate.bezelColor = colorOverride.bezelColor;
        if (colorOverride.dialStyle) selectedCandidate.dialStyle = colorOverride.dialStyle;
      }
      
      if (isWatchConfirm) {
        console.log(`[WATCH COLORS] Confirm - after: dialColor=${selectedCandidate.dialColor}, bezelColor=${selectedCandidate.bezelColor}`);
      }
      
      console.log(`[Confirm] Found candidate: ${selectedCandidate.title}`);
      
      // Log library learning attempt
      if (candidateOverride) {
        console.log(`[Library Learning] User selected model: ${candidateOverride.title} (familyId: ${candidateOverride.familyId})`);
      }

      // Add selected parallel to the candidate if provided
      if (selectedParallel) {
        selectedCandidate.selectedParallel = selectedParallel;
        // Append parallel to title if not already present
        const titleLower = selectedCandidate.title.toLowerCase();
        const parallelLower = selectedParallel.toLowerCase();
        if (!titleLower.includes(parallelLower)) {
          // Simply append the parallel to the title
          selectedCandidate.title = `${selectedCandidate.title} ${selectedParallel}`.trim();
        }
      }

      // Update session with confirmed candidate
      await storage.updateScanSession(sessionId, userId, {
        status: 'confirmed',
        confirmedCandidate: selectedCandidate,
        confirmedAt: new Date(),
      });

      // Increment scan count
      await storage.incrementDailyScanCount(userId);

      // ADD TO VISUAL LIBRARY: If the candidate has a familyId and we have an image, add it
      let imageAdded = false;
      let newFamilyCreated = false;
      let learningStatus: { attempted: boolean; success: boolean; reason?: string } = { attempted: false, success: false };
      const rawFamilyId = selectedCandidate.familyId;
      let familyId = typeof rawFamilyId === 'string' ? parseInt(rawFamilyId, 10) : rawFamilyId;
      const imageUrl = session.imageUrl;
      const category = selectedCandidate.category || '';
      
      // Map display category to table key
      let categoryKey: 'watch' | 'shoe' | 'cards' | 'toy' | 'handbag' | 'electronics' = 'watch';
      const catLower = category.toLowerCase();
      if (catLower.includes('watch')) categoryKey = 'watch';
      else if (catLower.includes('shoe')) categoryKey = 'shoe';
      else if (catLower.includes('card') || catLower.includes('tcg')) categoryKey = 'cards';
      else if (catLower.includes('handbag')) categoryKey = 'handbag';
      else if (catLower.includes('toy') || catLower.includes('funko')) categoryKey = 'toy';
      else if (catLower.includes('electronic')) categoryKey = 'electronics';
      
      // Debug log all values to diagnose library learning issues
      console.log(`[Library Learning DEBUG] familyId=${familyId} (raw=${rawFamilyId}), category=${categoryKey}, hasImageUrl=${!!imageUrl}, imageUrlPrefix=${imageUrl?.substring(0, 30)}`);
      
      // INTELLIGENT LEARNING: If no familyId exists, try to learn this as a new item
      if ((!familyId || isNaN(familyId)) && imageUrl && imageUrl.startsWith('data:')) {
        // Extract brand and model from candidate - check multiple possible fields
        const candidateBrand = selectedCandidate.brand || selectedCandidate.brandDetected || '';
        const candidateModel = selectedCandidate.model || selectedCandidate.family || selectedCandidate.title || '';
        
        if (candidateBrand && candidateModel) {
          console.log(`[Library Learning] NEW ITEM DETECTED: ${candidateBrand} ${candidateModel} - attempting to learn...`);
          learningStatus.attempted = true;
          
          try {
            const learnResult = await learnNewItem(
              categoryKey,
              candidateBrand,
              candidateModel,
              imageUrl,
              {
                dialColor: selectedCandidate.dialColor,
                bezelType: selectedCandidate.bezelType,
                dialStyle: selectedCandidate.dialStyle,
                uniqueFeatures: selectedCandidate.uniqueFeatures,
              }
            );
            
            if (learnResult.success && learnResult.familyId) {
              familyId = learnResult.familyId;
              newFamilyCreated = learnResult.isNewFamily;
              imageAdded = true;
              learningStatus.success = true;
              learningStatus.reason = learnResult.message;
              console.log(`[Library Learning] SUCCESS: ${learnResult.message} (familyId=${familyId}, isNew=${newFamilyCreated})`);
            } else {
              learningStatus.success = false;
              learningStatus.reason = learnResult.message;
              console.log(`[Library Learning] Could not learn new item: ${learnResult.message}`);
            }
          } catch (learnErr: any) {
            learningStatus.success = false;
            learningStatus.reason = `Error: ${learnErr.message}`;
            console.error(`[Library Learning ERROR] Failed to learn new item: ${learnErr.message}`);
          }
        } else {
          learningStatus.attempted = true;
          learningStatus.success = false;
          learningStatus.reason = 'Missing brand or model name for learning';
          console.log(`[Library Learning] Missing brand/model for new item learning`);
        }
      } else if (familyId && !isNaN(familyId) && imageUrl && imageUrl.startsWith('data:')) {
        console.log(`[Library Learning] Adding confirmed scan to ${categoryKey} family ${familyId}`);
        
        try {
          const result = await addUserScanToVisualLibrary(categoryKey, familyId, imageUrl);
          imageAdded = result.success;
          
          if (result.success) {
            console.log(`[Library Learning] Successfully added image to ${categoryKey} family ${familyId}`);
          } else {
            console.log(`[Library Learning] Could not add image: ${result.message}`);
          }
        } catch (libErr: any) {
          console.error(`[Library Learning ERROR] Exception adding image: ${libErr.message}`);
        }
      } else {
        if (!familyId || isNaN(familyId)) console.log('[Library Learning] No valid familyId - skipping library add');
        else if (!imageUrl) console.log('[Library Learning] No imageUrl stored - skipping library add');
        else if (!imageUrl.startsWith('data:')) console.log(`[Library Learning] imageUrl not base64 (starts with ${imageUrl?.substring(0, 10)}) - skipping`);
      }

      res.json({
        success: true,
        candidate: selectedCandidate,
        imageAddedToLibrary: imageAdded,
        newFamilyCreated,
        familyId: familyId || undefined,
        learningStatus: learningStatus.attempted ? learningStatus : undefined,
      });
    } catch (error: any) {
      console.error("Confirm candidate error:", error);
      res.status(500).json({ message: "Failed to confirm selection" });
    }
  });

  // Step 1: Extract Item Details from URL using eBay Browse API (no scraping)
  app.post(api.items.extract.path, requireAuth, async (req, res) => {
    try {
      const { url } = api.items.extract.input.parse(req.body);

      // Extract item ID from URL
      const itemIdMatch = url.match(/\/itm\/(\d+)/);
      const itemId = itemIdMatch ? itemIdMatch[1] : null;
      const fallbackTitle = itemId ? `eBay Item #${itemId}` : "Unknown Item (Review Required)";

      if (!itemId) {
        return res.status(400).json({
          message: "Could not extract item ID from URL. Please use a direct eBay listing URL (e.g., ebay.com/itm/123456789)."
        });
      }

      // Use official eBay Browse API to get item details
      const itemDetails = await fetchItemById(itemId);

      let extractedTitle = "";
      let extractedPrice = "";
      let extractedCondition = "Used";
      let extractedShipping = "";

      if (itemDetails) {
        extractedTitle = itemDetails.title;
        extractedPrice = itemDetails.price;
        extractedCondition = itemDetails.condition;
        extractedShipping = itemDetails.shipping;
      }

      // Use extracted title or fallback
      const title = extractedTitle || fallbackTitle;

      // Infer category from title
      const categoryInference = inferCategory(title);
      const suggestedCategory = categoryInference.confidence === 'high' ? categoryInference.category : null;

      res.status(200).json({
        needsConfirmation: true,
        item: {
          title,
          price: extractedPrice,
          condition: extractedCondition,
          shipping: extractedShipping,
          url,
          suggestedCategory: suggestedCategory as 'Shoes' | 'Watches' | 'Trading Cards' | 'Trading Cards' | 'Trading Cards' | 'Electronics' | undefined,
        }
      });
    } catch (err) {
      console.error("Extraction error:", err);
      res.status(500).json({ message: "Failed to extract item details" });
    }
  });

  // Scan Status Endpoint
  app.get(api.user.scanStatus.path, requireAuth, async (req, res) => {
    try {
      const userId = (req.user as { id: number }).id;
      const user = await storage.getUser(userId);
      const scanStatus = await storage.canUserScan(userId);
      
      res.json({
        tier: (user?.subscriptionTier || 'free') as 'free' | 'pro',
        scansRemaining: scanStatus.remaining,
        scansLimit: scanStatus.limit,
        canScan: scanStatus.allowed,
      });
    } catch (err) {
      console.error("Scan status error:", err);
      res.status(500).json({ message: "Failed to get scan status" });
    }
  });

  // Step 2: Confirm and Analyze
  app.post(api.items.confirmAndAnalyze.path, requireAuth, async (req, res) => {
    try {
      const userId = (req.user as { id: number }).id;
      
      // Check scan limit
      const scanStatus = await storage.canUserScan(userId);
      if (!scanStatus.allowed) {
        return res.status(429).json({ 
          message: "Daily scan limit reached (5/day). Upgrade to Pro for unlimited scans.",
          remaining: 0,
          limit: scanStatus.limit,
        });
      }
      
      const parseResult = api.items.confirmAndAnalyze.input.safeParse(req.body);
      if (!parseResult.success) {
        const firstError = parseResult.error.errors[0];
        return res.status(400).json({ 
          message: firstError?.message || "Invalid input",
          field: firstError?.path?.join('.') 
        });
      }
      const input = parseResult.data;
      
      // Validate category is selected (enforce at confirmation step)
      if (!input.category) {
        return res.status(400).json({
          message: "Please select a category before analyzing",
          field: "category"
        });
      }
      const confirmedCategory = input.category;
      
      const buyPrice = parseFloat(input.price) || 0;
      // Parse shipping - always default to 0 for calculations
      // "Free" or empty/unknown both result in 0 for calculations
      const shippingIn = parseShipping(input.shipping);
      const totalCost = buyPrice + shippingIn;
      const platformFeePercent = Math.round(PLATFORM_FEE_RATE * 100);
      const outboundShipping = OUTBOUND_SHIPPING_DEFAULT;
      
      // Fetch REAL SOLD COMPS only - no active listings, no Google for-sale prices
      // For "Other" category, require Research Mode (user must manually select comps)
      const isOtherCategory = confirmedCategory === 'Other';
      
      // Build search query - for watches, include bezel/dial colors for accurate comps
      let searchQuery = input.title;
      if (confirmedCategory === 'Watches') {
        const colorParts: string[] = [];
        if (input.watchBezelColor && input.watchBezelColor !== 'unknown') {
          colorParts.push(input.watchBezelColor);
        }
        if (input.watchDialColor && input.watchDialColor !== 'unknown') {
          colorParts.push(input.watchDialColor + ' dial');
        }
        if (colorParts.length > 0) {
          searchQuery = `${input.title} ${colorParts.join(' ')}`;
          console.log('[WatchComps] Enhanced search query with colors:', searchQuery);
        }
      }
      
      const compsPromise = isOtherCategory 
        ? Promise.resolve(null) // "Other" category MUST use Research Mode
        : getSoldCompsWithCache(searchQuery, confirmedCategory);
      
      // REMOVED: Google pricing (for-sale prices, NOT sold data)
      // REMOVED: Browse API (active listings, NOT sold data)
      // If no real sold comps found, system will trigger Research Mode
      
      // AI prompt: IDENTIFICATION ONLY - never ask AI to estimate prices
      // Pricing comes from real sold comps only, never from AI hallucination
      const prompt = `You are an expert reseller. Identify this item and assess its resellability.

Item Details:
- Title: ${input.title}
- Category: ${confirmedCategory}
- Condition: ${input.condition}
- Buy Price: $${buyPrice.toFixed(2)}
- Total Cost: $${totalCost.toFixed(2)}

Instructions:
1. Verify the item identification is correct for the category.
2. Assess the general resellability of this item type (demand, common issues, etc.).
3. DO NOT estimate prices - pricing will be determined from real sold comps only.

Return a JSON object with EXACTLY these fields:
{
  "itemIdentified": true or false (whether you can confidently identify this item),
  "identificationNotes": "Brief notes about the item identification",
  "resellabilityNotes": "Brief notes about typical demand and resale considerations for this item type"
}`;

      // Run AI and comps fetch concurrently - ONLY real sold data
      const [completion, ebayCompsResult] = await Promise.all([
        openai.chat.completions.create({
          model: "gpt-4o-mini", // Use mini for speed (just identification, no pricing)
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        }),
        compsPromise,
      ]);
      
      // Normalize compsResult - ONLY use real sold data
      let compsResult: CompsResult;
      
      if (isOtherCategory) {
        // "Other" category requires Research Mode - no automatic pricing
        // Return empty comps to trigger Research Mode on frontend
        compsResult = {
          comps: [],
          source: 'none',
          medianPrice: null,
          averagePrice: null,
          lowPrice: null,
          highPrice: null,
          spreadPercent: null,
          priceRange: null,
          variance: null,
          searchQuery: input.title,
          message: 'Category requires Research Mode - please select your own comps',
        };
        console.log(`[COMPS] "Other" category - Research Mode required for "${input.title}"`);
      } else if (ebayCompsResult && ebayCompsResult.comps.length > 0) {
        // Use real sold comps from eBay/SerpAPI/PriceCharting
        compsResult = ebayCompsResult;
      } else {
        // No real sold data found - trigger Research Mode
        compsResult = {
          comps: [],
          source: 'none',
          medianPrice: null,
          averagePrice: null,
          lowPrice: null,
          highPrice: null,
          spreadPercent: null,
          priceRange: null,
          variance: null,
          searchQuery: input.title,
          message: 'No sold comps found - please use Research Mode',
        };
        console.log(`[COMPS] No real sold data for "${input.title}" - Research Mode required`);
      }
      
      // Log comps result for debugging
      console.log(`[COMPS DEBUG] title="${input.title}" source=${compsResult.source} comps=${compsResult.comps.length} median=${compsResult.medianPrice}`);
      
      // Phase-1 Decision Engine: Calculate verdict based on margin
      // UNIFIED LOGIC: Always calculate when we have comps, regardless of buyPrice
      let decisionResult: DecisionResult | null = null;
      
      // Determine data source confidence and valid comp count
      // For watches: HIGH only if ≥8 clean comps, otherwise LOW
      // For others: use source-based confidence
      const isWatchCategory = confirmedCategory.toLowerCase().includes('watch');
      
      // Get the cleaned comp count from CompsResult
      // For watches, cleanedCompCount is the count after parts/repair filtering and IQR trimming
      // For non-watches, it equals raw comp count
      const cleanedCompCount = compsResult.cleanedCompCount ?? compsResult.comps.length;
      
      // CONDITION-SPECIFIC PRICING: Used and New are NEVER mixed
      // Get the appropriate median based on item condition
      const itemConditionLower = (input.condition || '').toLowerCase();
      const isUsedCondition = itemConditionLower.includes('used') || itemConditionLower.includes('pre-owned') || itemConditionLower === '';
      
      // VINTAGE CARDS EXCEPTION: For sports cards pre-1990, "New" vs "Used" is meaningless
      // A 1968 Topps card cannot be "new" - eBay sellers use "New" to mean "unplayed/mint"
      // For vintage cards, ignore condition separation and use all comps
      const titleLower = (input.title || '').toLowerCase();
      const yearMatch = titleLower.match(/\b(19[0-8][0-9])\b/); // Match 1900-1989
      const isVintageCard = confirmedCategory === 'Trading Cards' && yearMatch && parseInt(yearMatch[1]) < 1990;
      
      // Use condition-specific median if available, fall back to overall median
      let conditionSpecificMedian: number | null = null;
      let conditionSpecificCount = cleanedCompCount;
      
      if (isVintageCard) {
        // For vintage cards, use overall median regardless of condition
        // eBay condition labels are unreliable for 35+ year old cards
        conditionSpecificMedian = compsResult.medianPrice || null;
        conditionSpecificCount = compsResult.comps.length;
        console.log(`[CONDITION PRICING] VINTAGE CARD (${yearMatch?.[1]}) - using overall median: $${conditionSpecificMedian} from ${conditionSpecificCount} comps`);
      } else if (compsResult.conditionStats) {
        if (isUsedCondition && compsResult.conditionStats.used.count > 0 && compsResult.conditionStats.used.medianPrice) {
          // Item is Used - ONLY use Used comp prices
          conditionSpecificMedian = compsResult.conditionStats.used.medianPrice;
          conditionSpecificCount = compsResult.conditionStats.used.count;
          console.log(`[CONDITION PRICING] Using USED median: $${conditionSpecificMedian} from ${conditionSpecificCount} comps`);
        } else if (!isUsedCondition && compsResult.conditionStats.newLike.count > 0 && compsResult.conditionStats.newLike.medianPrice) {
          // Item is New/Like New - ONLY use New comp prices
          conditionSpecificMedian = compsResult.conditionStats.newLike.medianPrice;
          conditionSpecificCount = compsResult.conditionStats.newLike.count;
          console.log(`[CONDITION PRICING] Using NEW median: $${conditionSpecificMedian} from ${conditionSpecificCount} comps`);
        } else {
          // NO condition-specific comps available - fall back to overall median with reduced confidence
          // For most items, overall median is better than no data at all
          // Watches are excluded from this fallback (condition matters more for luxury items)
          if (!isWatchCategory && compsResult.medianPrice && compsResult.medianPrice > 0) {
            conditionSpecificMedian = compsResult.medianPrice;
            conditionSpecificCount = compsResult.comps?.length || 0;
            console.log(`[CONDITION PRICING] No ${isUsedCondition ? 'Used' : 'New'} comps - using overall median $${conditionSpecificMedian} as fallback (non-watch)`);
          } else {
            conditionSpecificMedian = null;
            conditionSpecificCount = 0;
            console.log(`[CONDITION PRICING] No ${isUsedCondition ? 'Used' : 'New'} comps available - insufficient data for this condition`);
          }
        }
      } else {
        // Legacy path: no conditionStats available, must use overall but log warning
        // This should rarely happen with current comp fetching logic
        conditionSpecificMedian = compsResult.medianPrice || null;
        console.log(`[CONDITION PRICING] WARNING: No conditionStats available, using overall median: $${conditionSpecificMedian}`);
      }
      
      const hasValidComps = conditionSpecificMedian && conditionSpecificMedian > 0;
      
      // For watches, require ≥3 clean comps for valid pricing
      // Reduced from 8 to 3 to allow more items to get verdicts
      const hasEnoughWatchComps = !isWatchCategory || conditionSpecificCount >= 3;
      const expectedSalePrice = (hasValidComps && hasEnoughWatchComps) 
        ? conditionSpecificMedian 
        : null;
      
      let dataSourceConfidence: 'high' | 'medium' | 'low' | 'none' = 'none';
      if (!hasEnoughWatchComps && isWatchCategory) {
        // Watch with <3 comps = no valid comps
        dataSourceConfidence = 'none';
        console.log(`[DECISION ENGINE] Watch with ${conditionSpecificCount}/3 required comps - marking as no valid comps`);
      } else if (compsResult.source === 'api') {
        dataSourceConfidence = isWatchCategory ? 'high' : 'high';
      } else if (compsResult.source === 'browse') {
        dataSourceConfidence = 'low';
      }
      
      // Use buyPrice if provided, else use 0 (to get maxBuy recommendation)
      const effectiveBuyPrice = buyPrice > 0 ? buyPrice : 0;
      const effectiveShippingIn = buyPrice > 0 ? shippingIn : 0;
      
      const decisionInput: DecisionInput = {
        buyPrice: effectiveBuyPrice,
        shippingIn: effectiveShippingIn,
        expectedSalePrice, // null if no valid comps OR watch with <8 comps (condition-specific)
        platformFeeRate: PLATFORM_FEE_RATE,
        outboundShipping: 0, // Default to 0, will be refined later
        dataSourceConfidence,
        dataSourceType: compsResult.source === 'api' ? 'serpapi' as const : 'manual' as const,
        compCount: conditionSpecificCount, // Use condition-specific comp count
        compConfidence: hasEnoughWatchComps && conditionSpecificCount >= 5 ? 'high' : 'low',
      };
      
      decisionResult = calculateDecision(decisionInput);
      console.log(`[DECISION ENGINE] verdict=${decisionResult.verdict} margin=${decisionResult.marginPercent}% confidence=${decisionResult.confidence} maxBuy=${decisionResult.maxBuy} cleanedComps=${cleanedCompCount} skipReason=${decisionResult.skipReason || 'N/A'}`);
      console.log(`[DECISION ENGINE] Input: buyPrice=${effectiveBuyPrice}, shippingIn=${effectiveShippingIn}, expectedSalePrice=${expectedSalePrice}, conditionCount=${conditionSpecificCount}`);

      // CARD PIPELINE: Execute unified card analysis for trading cards
      let cardAnalysisResult: CardAnalysisResult | null = null;
      const isCardCategory = shouldUseCardPipeline(confirmedCategory);
      
      if (isCardCategory) {
        // Parse card metadata from title for card pipeline
        const parsedCardMeta = parseCardTitle(input.title);
        
        const cardScanInput: CardScanInput = {
          frontScan: {
            aiExtractedData: {
              candidateName: input.title,
              playerName: parsedCardMeta.playerName,
              setName: parsedCardMeta.set,
              brand: parsedCardMeta.brand,
              year: parsedCardMeta.year,
              parallel: parsedCardMeta.parallel,
              cardNumber: undefined, // Will be extracted from back scan in future
              sport: confirmedCategory.toLowerCase().includes('sports') ? 'sports' : undefined,
            },
            confidence: 50,
          },
          userInputs: {
            buyPrice: effectiveBuyPrice,
            shippingIn: effectiveShippingIn,
            condition: input.condition,
          },
          legacyAiResult: {
            title: input.title,
            category: confirmedCategory,
            cardMeta: {
              brand: parsedCardMeta.brand,
              set: parsedCardMeta.set,
              year: parsedCardMeta.year,
              playerName: parsedCardMeta.playerName,
              detectedParallel: parsedCardMeta.parallel,
            },
            confidence: 50,
          },
        };
        
        // Map SoldComp to expected format for card pipeline
        const mappedComps = compsResult.comps.map(c => ({
          title: `${input.title} - ${c.condition || 'Unknown'}`,
          price: c.soldPrice || c.totalPrice || 0,
          condition: c.condition,
          soldDate: c.dateSold,
        }));
        
        cardAnalysisResult = executeCardPipeline(cardScanInput, {
          medianPrice: compsResult.medianPrice,
          source: compsResult.source,
          comps: mappedComps,
          conditionStats: compsResult.conditionStats,
        });
        
        // ALWAYS override decision result with card pipeline decision for consistency
        // This ensures ALL screens use the same math - no contradictory results possible
        // 
        // CRITICAL: Confidence state and decision state are DECOUPLED:
        // - FlipDecision is now only FLIP | SKIP | BLOCKED (math-based)
        // - decisionConfidence tracks HIGH | ESTIMATE | NONE separately
        // - FLIP with ESTIMATE confidence shows "Likely Flip" in UI
        // Only BLOCKED suppresses pricing and forces skip.
        const flipDecision = cardAnalysisResult.decision.flipDecision;
        const decisionConfidence = cardAnalysisResult.decision.decisionConfidence;
        
        decisionResult = {
          ...decisionResult,
          // FLIP -> flip, SKIP/BLOCKED -> skip
          verdict: flipDecision === 'FLIP' ? 'flip' : 'skip',
          label: cardAnalysisResult.decision.displayLabel,
          marginPercent: cardAnalysisResult.decision.marginPercent || 0,
          maxBuy: cardAnalysisResult.decision.maxBuyPrice,
          marketValue: cardAnalysisResult.priceTruth.anchorPrice,
          // Only blocked if identity failed completely
          skipReason: flipDecision === 'BLOCKED' ? 'identity_blocked' : undefined,
          // Flag for ESTIMATE confidence (UI can show "Likely Flip" or "Verify Details")
          lowConfidence: decisionConfidence === 'ESTIMATE',
          _diagnostics: {
            netProfit: cardAnalysisResult.decision.profitDollars || 0,
            totalCost: cardAnalysisResult.decision.totalCosts,
            platformFees: cardAnalysisResult.decision.platformFees,
            outboundShipping: cardAnalysisResult.decision.shippingOut,
            compCount: cardAnalysisResult.priceTruth.compCount,
            compConfidence: cardAnalysisResult.identity.confidenceState,
          },
        };
        
        console.log(`[CARD PIPELINE] Unified result: ${cardAnalysisResult.displaySummary.headline} | Confidence: ${cardAnalysisResult.identity.confidenceState}`);
      }

      const aiResult = JSON.parse(completion.choices[0].message.content || "{}");
      
      // STRICT SOLD-DATA-ONLY: HARD GATE - only accept comps from verified sold-data sources
      // Allowlist: serpapi (with sold filters), marketplace_insights, pricecharting, api (same as serpapi)
      // Blocklist: browse (active listings), google (for-sale), none, unknown, cache (if from old source)
      const ALLOWED_COMP_SOURCES = ['serpapi', 'marketplace_insights', 'pricecharting', 'api'];
      const hasRealComps = compsResult && 
        compsResult.comps.length > 0 && 
        compsResult.source &&
        ALLOWED_COMP_SOURCES.includes(compsResult.source);
      
      // Log source validation for debugging
      console.log(`[COMP SOURCE GATE] source="${compsResult?.source}" count=${compsResult?.comps?.length || 0} allowed=${hasRealComps}`);
      
      // Adjust confidence based on comp spread - ONLY if we have real comps
      const baseConfidence = hasRealComps ? 50 : 0;
      const adjustedConfidence = hasRealComps 
        ? adjustConfidenceBySpread(baseConfidence, compsResult.spreadPercent, compsResult.comps.length)
        : 0;
      
      // Verdict comes from decision engine (real comps) or defaults to Risky
      const verdict = decisionResult?.verdict || "Risky";
      
      // STRICT: Use ONLY real sold comp prices - never AI estimates
      // CRITICAL FIX: Use the SAME price for explanation as decision engine (condition-specific)
      // Previously used compsResult.medianPrice (overall) which caused mismatch with verdict
      const actualAvgPrice = expectedSalePrice; // Use condition-specific median for consistency
      
      // For cards, use the card pipeline's profit calculation (single source of truth)
      // For non-cards, calculate profit from real comps only
      let actualNetProfit: number | null = null;
      if (cardAnalysisResult) {
        // Use card pipeline's calculated profit - this is the AUTHORITATIVE value
        actualNetProfit = cardAnalysisResult.decision.profitDollars || 0;
      } else if (hasRealComps && decisionResult?.marginPercent !== undefined && actualAvgPrice !== null) {
        // Calculate from REAL comps only
        actualNetProfit = actualAvgPrice - effectiveBuyPrice - effectiveShippingIn - (actualAvgPrice * PLATFORM_FEE_RATE);
      }
      // If no real comps, actualNetProfit stays null - Research Mode required
      
      // Build explanation from actual data - if no comps, indicate Research Mode needed
      let consistentExplanation: string;
      if (hasRealComps && actualAvgPrice !== null && actualNetProfit !== null) {
        const netProfitDisplay = actualNetProfit >= 0 ? `~$${Math.round(actualNetProfit)}` : `-$${Math.abs(Math.round(actualNetProfit))}`;
        consistentExplanation = `Recent sold comps average $${Math.round(actualAvgPrice)}, leaving ${netProfitDisplay} net profit after fees.`;
      } else {
        consistentExplanation = "No real sold comps found. Use Research Mode to manually select comparables.";
      }
      
      // Calculate expiry date - admins and pro users never expire
      const user = await storage.getUser(userId);
      const tier = user?.subscriptionTier || 'free';
      // History expiry: Elite/Admin = permanent, Pro = 30 days, Free = 7 days
      const expiresAt = (user?.isAdmin || tier === 'elite')
        ? null
        : tier === 'pro'
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      
      // Determine if shipping is known/verified
      const isShippingVerified = input.shipping && input.shipping !== "" && input.shipping.toLowerCase() !== "unknown";
      
      // Store shipping as provided - preserve null/empty for unverified, else numeric
      // "Free" → store "Free", numeric → store numeric string, unknown → store null
      const normalizedShipping = isShippingVerified 
        ? (input.shipping.toLowerCase() === "free" ? "Free" : shippingIn.toFixed(2))
        : null;
      
      const item = await storage.createItem({
        userId,
        url: input.url,
        title: input.title,
        price: input.price,
        shipping: normalizedShipping,
        condition: input.condition,
        analysis: verdict,
        confidence: adjustedConfidence,
        explanation: consistentExplanation,
        rawAnalysis: {
          ...aiResult,
          netProfit: actualNetProfit,
          avgSoldPrice: actualAvgPrice, // Use actual comps data, not AI estimate
          shortExplanation: consistentExplanation, // Override AI explanation with consistent one
          comps: compsResult,
        },
        confirmedTitle: input.title,
        category: confirmedCategory,
        buyPrice: input.price,
        shippingIn: isShippingVerified ? shippingIn.toFixed(2) : null,
        platformFeeRate: PLATFORM_FEE_RATE.toString(),
        outboundShipping: OUTBOUND_SHIPPING_DEFAULT.toFixed(2),
        lowComp: compsResult.lowPrice?.toString() || null,
        avgComp: compsResult.medianPrice?.toString() || null, // SOLD-DATA-ONLY: Never use AI estimates
        highComp: compsResult.highPrice?.toString() || null,
        tax: null,
        recommendation: verdict,
        userDecision: null,
        expiresAt,
        manualCompPrices: input.manualCompPrices || null,
        compSource: compsResult.source === 'api' || compsResult.source === 'browse' 
          ? compsResult.source 
          : (input.compSource || 'none'),
        flipPrice: null,
        decisionVerdict: decisionResult?.verdict || null,
        decisionScore: decisionResult?.marginPercent != null ? Math.round(decisionResult.marginPercent) : null,
        decisionData: decisionResult || null,
        watchBrand: input.watchBrand || null,
        watchFamily: input.watchFamily || null,
        watchBandType: input.watchBandType || null,
        watchCaseSize: null,
        watchMovementType: input.watchMovementType || null,
        watchWearAssessment: null,
        watchBoxAndPapers: null,
        watchAftermarketFlags: null,
        cardIsGraded: cardAnalysisResult?.identity.isGraded || null,
        cardGrader: cardAnalysisResult?.identity.grader || null,
        cardGrade: cardAnalysisResult?.identity.gradeValue || null,
        cardYear: cardAnalysisResult?.identity.year?.toString() || null,
        cardSet: cardAnalysisResult?.identity.setName || null,
        cardPlayer: cardAnalysisResult?.identity.name || null,
        cardNumber: cardAnalysisResult?.identity.cardNumber || null,
        cardParallel: cardAnalysisResult?.identity.variantLabel || null,
        cardCertNumber: null,
        cardSerialNumber: cardAnalysisResult?.identity.serialNumber || null,
        cardSerialTotal: null,
        cardImageFrontUrl: null,
        cardImageBackUrl: null,
        cardVariationType: cardAnalysisResult?.identity.variantFinish || null,
        cardVariationName: cardAnalysisResult?.identity.variantLabel || null,
        cardVariationFinish: cardAnalysisResult?.identity.variantFinish || null,
        cardVariationConfirmed: cardAnalysisResult?.identity.confidenceState === 'HIGH' ? true : 
                                 cardAnalysisResult?.identity.confidenceState === 'ESTIMATE' ? false : null,
        gradingReadiness: null,
        gradingReadinessAnalyzedAt: null,
        scanMode: input.scanMode || 'flip',
        watchDialColor: input.watchDialColor || null,
        watchDialStyle: input.watchDialStyle || null,
        watchBezelColor: input.watchBezelColor || null,
        watchMaterials: null,
      });

      // Increment scan count after successful analysis
      await storage.incrementDailyScanCount(userId);
      
      // Upsert hot item for trending feature (fire-and-forget)
      if (confirmedCategory && compsResult.comps && compsResult.comps.length > 0) {
        try {
          const now = new Date();
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          
          // Count sales in 7d and 30d windows
          let sales7d = 0;
          let sales30d = 0;
          let lastSoldAt: Date | null = null;
          
          for (const comp of compsResult.comps) {
            if (comp.dateSold) {
              const soldDate = new Date(comp.dateSold);
              if (!isNaN(soldDate.getTime())) {
                if (soldDate >= sevenDaysAgo) sales7d++;
                if (soldDate >= thirtyDaysAgo) sales30d++;
                if (!lastSoldAt || soldDate > lastSoldAt) {
                  lastSoldAt = soldDate;
                }
              }
            }
          }
          
          // Only track if there's meaningful activity
          if (sales7d >= 3 || sales30d >= 5) {
            const queryKey = input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 100);
            await storage.upsertHotItem({
              category: confirmedCategory,
              queryKey,
              sampleTitle: input.title.slice(0, 200),
              sales7d,
              sales30d,
              lastSoldAt,
              medianPrice: compsResult.medianPrice?.toString() || null,
            });
          }
        } catch (hotItemErr) {
          // Don't fail the request if hot item tracking fails
          console.error("Hot item upsert failed:", hotItemErr);
        }
      }

      // Return item with comps data
      res.status(200).json({
        ...item,
        comps: compsResult,
      });
    } catch (err) {
      console.error("Analysis error:", err);
      res.status(500).json({ message: "Failed to finalize analysis" });
    }
  });

  // List Items (only non-expired items for free users)
  app.get(api.items.list.path, requireAuth, async (req, res) => {
    const items = await storage.getActiveItems((req.user as { id: number }).id);
    res.json(items);
  });

  // Update Item Buy Price (cost input for accurate margin)
  app.patch('/api/items/:id', requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.id;
      const { buyPrice, cardImageFrontUrl, cardImageBackUrl } = req.body;
      
      // Build update object based on what was provided
      const updateData: Record<string, any> = {};
      
      if (buyPrice !== undefined && buyPrice !== null) {
        const numericPrice = parseFloat(buyPrice);
        if (isNaN(numericPrice) || numericPrice < 0) {
          return res.status(400).json({ message: "Invalid buyPrice value" });
        }
        updateData.buyPrice = String(numericPrice);
      }
      
      if (cardImageFrontUrl !== undefined) {
        updateData.cardImageFrontUrl = cardImageFrontUrl || null;
      }
      
      if (cardImageBackUrl !== undefined) {
        updateData.cardImageBackUrl = cardImageBackUrl || null;
      }
      
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }
      
      // Update the item
      const [updated] = await db.update(items)
        .set(updateData)
        .where(and(eq(items.id, id), eq(items.userId, userId)))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      console.log(`[ITEM UPDATE] Updated item ${id}:`, Object.keys(updateData));
      res.json(updated);
    } catch (err) {
      console.error("Update item error:", err);
      res.status(500).json({ message: "Failed to update item" });
    }
  });

  // Update Item Decision (Flip/Skip)
  app.patch('/api/items/:id/decision', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const parseResult = api.items.updateDecision.input.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid decision value" });
      }
      
      const userId = (req.user as { id: number }).id;
      const updated = await storage.updateItemDecision(id, userId, parseResult.data.decision);
      
      if (!updated) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      res.json(updated);
    } catch (err) {
      console.error("Update decision error:", err);
      res.status(500).json({ message: "Failed to update decision" });
    }
  });

  // Update Item Flip Price (record what item sold for)
  app.patch('/api/items/:id/flip', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const parseResult = api.items.updateFlipPrice.input.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid flip price value" });
      }
      
      const userId = (req.user as { id: number }).id;
      const updated = await storage.updateItemFlipPrice(id, userId, parseResult.data.flipPrice.toString());
      
      if (!updated) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      res.json(updated);
    } catch (err) {
      console.error("Update flip price error:", err);
      res.status(500).json({ message: "Failed to update flip price" });
    }
  });

  // ========== INVENTORY ROUTES ==========
  
  // List Inventory Items
  app.get(api.inventory.list.path, requireAuth, async (req, res) => {
    try {
      const userId = (req.user as { id: number }).id;
      const inventoryItems = await storage.getInventoryItems(userId);
      res.json(inventoryItems);
    } catch (err) {
      console.error("Get inventory error:", err);
      res.status(500).json({ message: "Failed to get inventory" });
    }
  });

  // Create Inventory Item
  app.post(api.inventory.create.path, requireAuth, async (req, res) => {
    try {
      const parseResult = api.inventory.create.input.safeParse(req.body);
      
      if (!parseResult.success) {
        console.log("Create inventory validation error:", parseResult.error.format());
        return res.status(400).json({ message: "Invalid inventory data", errors: parseResult.error.format() });
      }
      
      const userId = (req.user as { id: number }).id;
      const input = parseResult.data;
      
      // Check for duplicate if itemId is provided
      if (input.itemId) {
        const existingItems = await storage.getInventoryItems(userId);
        const duplicate = existingItems.find(item => item.itemId === input.itemId);
        if (duplicate) {
          console.log(`Inventory item already exists for scan ${input.itemId}`);
          return res.status(409).json({ message: "Item already in inventory" });
        }
      }
      
      const newItem = await storage.createInventoryItem({
        userId,
        itemId: input.itemId || null,
        title: input.title,
        imageUrl: input.imageUrl || null,
        estimatedResale: input.estimatedResale || null,
        purchasePrice: input.purchasePrice,
        feesEstimate: input.feesEstimate || null,
        shippingEstimate: input.shippingEstimate || null,
        status: 'bought',
        purchaseDate: new Date(),
        listedDate: null,
        soldDate: null,
        actualSalePrice: null,
        outboundShippingActual: null,
        condition: input.condition || null,
        notes: input.notes || null,
        category: input.category || null,
        brand: input.brand || null,
        sourceLocationId: input.sourceLocationId || null,
        sourceLocationName: input.sourceLocationName || null,
        storageLocation: input.storageLocation || null,
        salePlatform: input.salePlatform || null,
        platformFeeActual: input.platformFeeActual || null,
      });
      
      res.status(201).json(newItem);
    } catch (err) {
      console.error("Create inventory error:", err);
      res.status(500).json({ message: "Failed to create inventory item" });
    }
  });

  // Update Inventory Item
  app.patch('/api/inventory/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const parseResult = api.inventory.update.input.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid update data" });
      }
      
      const userId = (req.user as { id: number }).id;
      const input = parseResult.data;
      
      // Build update object
      const updates: Record<string, unknown> = {};
      if (input.status !== undefined) updates.status = input.status;
      if (input.listedDate !== undefined) updates.listedDate = input.listedDate ? new Date(input.listedDate) : null;
      if (input.soldDate !== undefined) updates.soldDate = input.soldDate ? new Date(input.soldDate) : null;
      if (input.actualSalePrice !== undefined) updates.actualSalePrice = input.actualSalePrice;
      if (input.outboundShippingActual !== undefined) updates.outboundShippingActual = input.outboundShippingActual;
      if (input.notes !== undefined) updates.notes = input.notes;
      if (input.sourceLocationId !== undefined) updates.sourceLocationId = input.sourceLocationId;
      if (input.sourceLocationName !== undefined) updates.sourceLocationName = input.sourceLocationName;
      if (input.storageLocation !== undefined) updates.storageLocation = input.storageLocation;
      if (input.salePlatform !== undefined) updates.salePlatform = input.salePlatform;
      if (input.platformFeeActual !== undefined) updates.platformFeeActual = input.platformFeeActual;
      
      const updated = await storage.updateInventoryItem(id, userId, updates);
      
      if (!updated) {
        return res.status(404).json({ message: "Inventory item not found" });
      }
      
      res.json(updated);
    } catch (err) {
      console.error("Update inventory error:", err);
      res.status(500).json({ message: "Failed to update inventory item" });
    }
  });

  // Delete Inventory Item
  app.delete('/api/inventory/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as { id: number }).id;
      
      const deleted = await storage.deleteInventoryItem(id, userId);
      
      if (!deleted) {
        return res.status(404).json({ message: "Inventory item not found" });
      }
      
      res.json({ success: true });
    } catch (err) {
      console.error("Delete inventory error:", err);
      res.status(500).json({ message: "Failed to delete inventory item" });
    }
  });

  // ========== BUSINESS EXPENSE ROUTES ==========
  
  // List expenses (optionally filter by tax year)
  app.get('/api/expenses', requireAuth, async (req, res) => {
    try {
      const userId = (req.user as { id: number }).id;
      const taxYear = req.query.year ? parseInt(req.query.year as string) : undefined;
      const expenses = await storage.getBusinessExpenses(userId, taxYear);
      res.json(expenses);
    } catch (err) {
      console.error("Get expenses error:", err);
      res.status(500).json({ message: "Failed to get expenses" });
    }
  });

  // Get expense summary by category for a tax year
  app.get('/api/expenses/summary/:year', requireAuth, async (req, res) => {
    try {
      const userId = (req.user as { id: number }).id;
      const taxYear = parseInt(req.params.year);
      const summary = await storage.getExpenseSummaryByCategory(userId, taxYear);
      res.json(summary);
    } catch (err) {
      console.error("Get expense summary error:", err);
      res.status(500).json({ message: "Failed to get expense summary" });
    }
  });

  // Create expense
  app.post(api.expenses.create.path, requireAuth, async (req, res) => {
    try {
      const parseResult = api.expenses.create.input.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid expense data" });
      }
      
      const userId = (req.user as { id: number }).id;
      const input = parseResult.data;

      // Calculate amount for mileage category
      let finalAmount = parseFloat(input.amount);
      if (input.category === 'mileage' && input.miles && input.mileageRate) {
        finalAmount = parseFloat(input.miles) * parseFloat(input.mileageRate);
      }
      
      const expense = await storage.createBusinessExpense({
        userId,
        category: input.category,
        description: input.description,
        amount: String(finalAmount),
        date: input.date ? new Date(input.date) : new Date(),
        miles: input.miles || null,
        mileageRate: input.mileageRate || null,
        startLocation: input.startLocation || null,
        endLocation: input.endLocation || null,
        receiptUrl: input.receiptUrl || null,
        notes: input.notes || null,
        taxYear: input.taxYear,
      });
      
      res.status(201).json(expense);
    } catch (err) {
      console.error("Create expense error:", err);
      res.status(500).json({ message: "Failed to create expense" });
    }
  });

  // Update expense
  app.patch('/api/expenses/:id', requireAuth, async (req, res) => {
    try {
      const parseResult = api.expenses.update.input.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid expense data" });
      }
      
      const id = parseInt(req.params.id);
      const userId = (req.user as { id: number }).id;
      const input = parseResult.data;
      
      // If mileage fields are being updated, recalculate amount
      let updateData: Record<string, any> = { ...input };
      if (input.category === 'mileage' && input.miles && input.mileageRate) {
        updateData.amount = String(parseFloat(input.miles) * parseFloat(input.mileageRate));
      }
      if (input.date) {
        updateData.date = new Date(input.date);
      }
      
      const expense = await storage.updateBusinessExpense(id, userId, updateData);
      
      if (!expense) {
        return res.status(404).json({ message: "Expense not found" });
      }
      
      res.json(expense);
    } catch (err) {
      console.error("Update expense error:", err);
      res.status(500).json({ message: "Failed to update expense" });
    }
  });

  // Delete expense
  app.delete('/api/expenses/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as { id: number }).id;
      
      await storage.deleteBusinessExpense(id, userId);
      res.json({ success: true });
    } catch (err) {
      console.error("Delete expense error:", err);
      res.status(500).json({ message: "Failed to delete expense" });
    }
  });

  // ========== SOURCING LOCATION ROUTES ==========
  
  // List sourcing locations
  app.get('/api/sourcing-locations', requireAuth, async (req, res) => {
    try {
      const userId = (req.user as { id: number }).id;
      const locations = await storage.getSourcingLocations(userId);
      res.json(locations);
    } catch (err) {
      console.error("Get sourcing locations error:", err);
      res.status(500).json({ message: "Failed to get sourcing locations" });
    }
  });

  // Create sourcing location
  app.post(api.sourcingLocations.create.path, requireAuth, async (req, res) => {
    try {
      const parseResult = api.sourcingLocations.create.input.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid sourcing location data" });
      }
      
      const userId = (req.user as { id: number }).id;
      const input = parseResult.data;
      
      const location = await storage.createSourcingLocation({
        userId,
        name: input.name,
        type: input.type,
        address: input.address || null,
        notes: input.notes || null,
      });
      
      res.status(201).json(location);
    } catch (err) {
      console.error("Create sourcing location error:", err);
      res.status(500).json({ message: "Failed to create sourcing location" });
    }
  });

  // Delete sourcing location
  app.delete('/api/sourcing-locations/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req.user as { id: number }).id;
      
      await storage.deleteSourcingLocation(id, userId);
      res.json({ success: true });
    } catch (err) {
      console.error("Delete sourcing location error:", err);
      res.status(500).json({ message: "Failed to delete sourcing location" });
    }
  });

  // ========== SALES ANALYTICS ROUTES ==========
  
  // Helper: Extract brand from item title
  function extractBrandFromTitle(title: string): string | null {
    const knownBrands = [
      // Watches
      'Rolex', 'Omega', 'Seiko', 'Tag Heuer', 'Citizen', 'Casio', 'Invicta', 'Fossil', 'Tissot', 'Bulova',
      // Shoes
      'Nike', 'Jordan', 'Adidas', 'New Balance', 'Yeezy', 'Converse', 'Vans', 'Reebok', 'Puma', 'Asics',
      // Handbags
      'Louis Vuitton', 'Gucci', 'Coach', 'Michael Kors', 'Kate Spade', 'Prada', 'Chanel', 'Hermes', 'Dooney',
      // Tools
      'Milwaukee', 'DeWalt', 'Makita', 'Ryobi', 'Bosch', 'Craftsman', 'Snap-on', 'Ridgid', 'Kobalt',
      // Electronics
      'Apple', 'Samsung', 'Sony', 'Nintendo', 'PlayStation', 'Xbox', 'Bose', 'JBL', 'LG', 'Canon', 'Nikon',
      // Cards
      'Panini', 'Topps', 'Bowman', 'Upper Deck', 'Pokemon', 'Yu-Gi-Oh', 'MTG', 'Donruss',
      // Gaming
      'PS5', 'PS4', 'Xbox', 'Switch', 'Steam Deck',
      // Toys
      'LEGO', 'Hot Wheels', 'Funko', 'Hasbro', 'Mattel', 'Fisher-Price',
      // Vintage/Antiques
      'Pyrex', 'Fenton', 'McCoy', 'Roseville', 'Hummel', 'Fiesta'
    ];
    
    const lowerTitle = title.toLowerCase();
    
    for (const brand of knownBrands) {
      if (lowerTitle.includes(brand.toLowerCase())) {
        return brand;
      }
    }
    
    // Fallback: use first word if it looks like a brand (capitalized, reasonable length)
    const firstWord = title.split(/[\s\-\/]/)[0];
    if (firstWord && firstWord.length >= 3 && firstWord.length <= 20 && /^[A-Z]/.test(firstWord)) {
      return firstWord;
    }
    
    return null;
  }
  
  // Helper: Extract category from item title
  function extractCategoryFromTitle(title: string): string | null {
    const lowerTitle = title.toLowerCase();
    
    const categoryKeywords: Record<string, string[]> = {
      'Watches': ['watch', 'timepiece', 'chronograph', 'diver', 'submariner'],
      'Shoes': ['shoes', 'sneakers', 'jordan', 'yeezy', 'dunks', 'air max', 'boots', 'nike', 'adidas', 'sneaker', 'shoe', 'trainer'],
      'Electronics': ['phone', 'laptop', 'tablet', 'airpods', 'headphones', 'camera', 'ipad', 'iphone', 'console', 'controller', 'playstation', 'xbox', 'nintendo', 'switch', 'ps5', 'ps4'],
      'Trading Cards': ['card', 'prizm', 'chrome', 'refractor', 'auto', 'psa', 'bgs', 'graded', 'rookie', 'pokemon', 'topps', 'panini'],
      'Collectibles': ['lego', 'funko', 'hot wheels', 'action figure', 'toy', 'playset', 'vintage', 'antique', 'pyrex', 'bag', 'purse', 'handbag', 'wallet', 'drill', 'tool']
    };
    
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      for (const keyword of keywords) {
        if (lowerTitle.includes(keyword)) {
          return category;
        }
      }
    }
    
    return 'Other';
  }
  
  // Get sales analytics - top brands, category profit, sell-through rate
  app.get('/api/analytics', requireAuth, async (req, res) => {
    try {
      const userId = (req.user as { id: number }).id;
      
      // Get all inventory items for this user
      const allItems = await storage.getInventoryItems(userId);
      
      // Filter to sold items only
      const soldItems = allItems.filter(item => item.status === 'sold' && item.actualSalePrice);
      const listedItems = allItems.filter(item => item.status === 'listed' || item.status === 'sold');
      
      // 1. Top-Selling Brands (by items sold and total profit)
      const brandStats: Record<string, { sold: number; profit: number }> = {};
      
      for (const item of soldItems) {
        // Extract brand from title (first word or common patterns)
        const brand = extractBrandFromTitle(item.title);
        if (!brand) continue;
        
        if (!brandStats[brand]) {
          brandStats[brand] = { sold: 0, profit: 0 };
        }
        
        const salePrice = parseFloat(item.actualSalePrice || '0');
        const purchasePrice = parseFloat(item.purchasePrice || '0');
        const itemFeeRate = getCategoryFeeRate(item.category || undefined);
        const fees = salePrice * itemFeeRate;
        const profit = salePrice - purchasePrice - fees;
        
        brandStats[brand].sold += 1;
        brandStats[brand].profit += profit;
      }
      
      const topBrands = Object.entries(brandStats)
        .map(([brand, stats]) => ({ brand, ...stats }))
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 10);
      
      // 2. Average Profit per Category
      const categoryStats: Record<string, { totalProfit: number; count: number }> = {};
      
      for (const item of soldItems) {
        // Try to determine category from linked item or title
        const category = extractCategoryFromTitle(item.title);
        if (!category) continue;
        
        if (!categoryStats[category]) {
          categoryStats[category] = { totalProfit: 0, count: 0 };
        }
        
        const salePrice = parseFloat(item.actualSalePrice || '0');
        const purchasePrice = parseFloat(item.purchasePrice || '0');
        const catFeeRate = getCategoryFeeRate(category);
        const fees = salePrice * catFeeRate;
        const profit = salePrice - purchasePrice - fees;
        
        categoryStats[category].totalProfit += profit;
        categoryStats[category].count += 1;
      }
      
      const categoryProfit = Object.entries(categoryStats)
        .map(([category, stats]) => ({
          category,
          avgProfit: stats.count > 0 ? Math.round(stats.totalProfit / stats.count) : 0,
          itemsSold: stats.count,
          totalProfit: Math.round(stats.totalProfit)
        }))
        .sort((a, b) => b.avgProfit - a.avgProfit);
      
      // 3. Sell-Through Rate (items sold / items listed)
      const totalListed = listedItems.length;
      const totalSold = soldItems.length;
      const sellThroughRate = totalListed > 0 ? Math.round((totalSold / totalListed) * 100) : 0;
      
      // Calculate total profit
      const totalProfit = soldItems.reduce((sum, item) => {
        const salePrice = parseFloat(item.actualSalePrice || '0');
        const purchasePrice = parseFloat(item.purchasePrice || '0');
        const soldFeeRate = getCategoryFeeRate(item.category || undefined);
        const fees = salePrice * soldFeeRate;
        return sum + (salePrice - purchasePrice - fees);
      }, 0);
      
      // Calculate average profit per item
      const avgProfitPerItem = soldItems.length > 0 ? Math.round(totalProfit / soldItems.length) : 0;
      
      res.json({
        topBrands,
        categoryProfit,
        sellThrough: {
          rate: sellThroughRate,
          sold: totalSold,
          listed: totalListed
        },
        summary: {
          totalProfit: Math.round(totalProfit),
          avgProfitPerItem,
          totalSold,
          totalListed
        }
      });
    } catch (err) {
      console.error("Analytics error:", err);
      res.status(500).json({ message: "Failed to calculate analytics" });
    }
  });

  // ========== BATCH SCANNING ROUTES (Pro Only) ==========
  
  // Helper to check Pro/Elite access
  const requireProOrElite = async (req: any, res: any, next: any) => {
    const user = await storage.getUser((req.user as { id: number }).id);
    const tier = user?.subscriptionTier;
    if (tier !== 'pro' && tier !== 'elite' && !user?.isAdmin) {
      return res.status(403).json({ 
        message: "Batch scanning is a Pro feature. Upgrade to unlock unlimited batch scans." 
      });
    }
    next();
  };

  // Price Guide endpoint - calculates max buy price from sold comps
  app.post('/api/price-guide', requireAuth, async (req: any, res) => {
    try {
      const { title, category, condition } = req.body;
      
      if (!title || !category) {
        return res.status(400).json({ 
          message: "Title and category are required",
          priceGuide: null 
        });
      }
      
      // Condition: 'new' or 'used' - defaults to 'used' for yard sale sourcing
      const itemCondition = condition === 'new' ? 'newLike' : 'used';
      
      console.log(`[PRICE GUIDE] Calculating for: "${title}" (${category}) - condition: ${itemCondition}`);
      
      // Fetch sold comps directly from Marketplace Insights API (bypass cache for accuracy)
      // This ensures we only use actual sold data, not cached browse data
      const searchQuery = buildSearchQuery(title, category);
      let soldComps = await fetchCompsFromMarketplaceInsightsAPI(searchQuery, category);
      
      // Filter comps by condition if specified
      // Use robust matching to avoid false positives like "new battery" for used items
      if (soldComps && soldComps.length > 0 && itemCondition) {
        const originalCount = soldComps.length;
        const filteredComps = soldComps.filter((comp: SoldComp) => {
          const condStr = comp.condition?.toLowerCase() || '';
          
          // Explicit new-like condition indicators (standalone terms)
          const isNewLike = /\bnew\b/.test(condStr) || // "new" as whole word
                           /\bsealed\b/.test(condStr) ||
                           /\bunopened\b/.test(condStr) ||
                           /\bbrand new\b/.test(condStr) ||
                           /\bfactory sealed\b/.test(condStr) ||
                           /\brefurbished\b/.test(condStr) ||
                           /\bcertified\b/.test(condStr) ||
                           condStr === 'new' ||
                           condStr.startsWith('new ') ||
                           condStr.includes('new in box') ||
                           condStr.includes('new with tags');
          
          // Exclude "like new" from new-like (it's used)
          const isLikeNew = /\blike new\b/.test(condStr);
          
          if (itemCondition === 'newLike') {
            return isNewLike && !isLikeNew;
          } else {
            // 'used' - include used, pre-owned, like new, and items without explicit "new" condition
            return !isNewLike || isLikeNew;
          }
        });
        
        // Only apply filter if we still have enough comps, otherwise use all
        if (filteredComps.length >= 3) {
          soldComps = filteredComps;
          console.log(`[PRICE GUIDE] Filtered ${originalCount} comps to ${soldComps.length} for condition: ${itemCondition}`);
        } else {
          console.log(`[PRICE GUIDE] Condition filter would leave only ${filteredComps.length} comps, using all ${originalCount}`);
        }
      }
      
      // If Marketplace Insights is not available, we cannot provide reliable price guide
      if (!soldComps || soldComps.length < 3) {
        console.log(`[PRICE GUIDE] Insufficient sold comps from Marketplace Insights: ${soldComps?.length || 0}`);
        return res.json({
          priceGuide: null,
          debug: {
            soldSampleCount: soldComps?.length || 0,
            source: soldComps ? 'marketplace_insights' : 'not_available',
            reason: 'insufficient_sold_comps'
          }
        });
      }
      
      // Calculate price guide using the robust algorithm with sold data only
      const priceGuide = calculatePriceGuide(soldComps, category, { isSoldData: true });
      
      if (!priceGuide) {
        return res.json({
          priceGuide: null,
          debug: {
            soldSampleCount: soldComps.length,
            source: 'marketplace_insights',
            reason: 'calculation_failed'
          }
        });
      }
      
      // Standardized response format with all pricing data
      res.json({
        priceGuide: {
          maxBuyPrice: priceGuide.maxBuyPrice,
          medianSoldPrice: priceGuide.medianSoldPrice,
          netAfterFees: priceGuide.netAfterFees,
          targetProfit: priceGuide.targetProfit,
          shippingAllowance: priceGuide.shippingCost,
          soldCompCount: priceGuide.soldSampleCount,
          confidence: priceGuide.confidence,
          source: 'sold_comps',
          formattedMaxBuy: `$${priceGuide.maxBuyPrice.toLocaleString('en-US')}`,
          formattedMedian: `$${priceGuide.medianSoldPrice.toLocaleString('en-US')}`
        },
        debug: {
          expectedSalePrice: priceGuide.expectedSalePrice,
          medianSoldPrice: priceGuide.medianSoldPrice,
          feeRate: priceGuide.feeRate,
          shippingCost: priceGuide.shippingCost,
          fixedCosts: priceGuide.fixedCosts,
          netAfterFees: priceGuide.netAfterFees,
          targetMargin: priceGuide.targetMargin,
          targetProfit: priceGuide.targetProfit,
          maxBuy: priceGuide.maxBuyPrice,
          soldSampleCount: priceGuide.soldSampleCount,
          trimmedCount: priceGuide.trimmedCount,
          confidence: priceGuide.confidence,
          source: 'marketplace_insights'
        }
      });
    } catch (err: any) {
      console.error('[PRICE GUIDE] Error:', err);
      res.status(500).json({ 
        message: err.message || "Failed to calculate price guide",
        priceGuide: null 
      });
    }
  });

  // Get or create active batch session
  app.get('/api/batch/session', requireAuth, requireProOrElite, async (req: any, res) => {
    try {
      const userId = req.user.id;
      let session = await storage.getActiveBatchSession(userId);
      
      if (!session) {
        session = await storage.createBatchSession(userId);
      }
      
      const items = await storage.getBatchItems(session.id, userId);
      res.json({ session, items });
    } catch (err) {
      console.error("Get batch session error:", err);
      res.status(500).json({ message: "Failed to get batch session" });
    }
  });

  // Create new batch session
  app.post('/api/batch/session', requireAuth, requireProOrElite, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Complete any existing active session first
      const existing = await storage.getActiveBatchSession(userId);
      if (existing) {
        await storage.updateBatchSession(existing.id, userId, { 
          status: 'completed', 
          completedAt: new Date() 
        });
      }
      
      const session = await storage.createBatchSession(userId);
      res.status(201).json({ session, items: [] });
    } catch (err) {
      console.error("Create batch session error:", err);
      res.status(500).json({ message: "Failed to create batch session" });
    }
  });

  // Add item to batch queue
  app.post('/api/batch/items', requireAuth, requireProOrElite, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { inputType, inputValue } = req.body;
      
      if (!inputType || !inputValue) {
        return res.status(400).json({ message: "inputType and inputValue are required" });
      }
      
      if (!['url', 'camera', 'photo'].includes(inputType)) {
        return res.status(400).json({ message: "inputType must be 'url', 'camera', or 'photo'" });
      }
      
      // Get active session
      let session = await storage.getActiveBatchSession(userId);
      if (!session) {
        session = await storage.createBatchSession(userId);
      }
      
      // Check batch limit (max 20 items per session)
      const existingItems = await storage.getBatchItems(session.id, userId);
      if (existingItems.length >= 20) {
        return res.status(400).json({ 
          message: "Maximum 20 items per batch session. Complete this batch before adding more." 
        });
      }
      
      const item = await storage.addBatchItem(session.id, userId, inputType, inputValue);
      res.status(201).json(item);
    } catch (err) {
      console.error("Add batch item error:", err);
      res.status(500).json({ message: "Failed to add item to batch" });
    }
  });

  // Scan and analyze immediately - combined endpoint for instant results
  app.post('/api/batch/scanAndAnalyze', requireAuth, requireProOrElite, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { imageBase64, buyPrice, maxBuyPrice, appliedProfitPercent, priceGuideSource, condition } = req.body;
      // Default to 'Used' for yard sale/batch mode - items are always assumed used unless explicitly changed
      const itemCondition = condition || 'Used';
      
      if (!imageBase64) {
        return res.status(400).json({ message: "imageBase64 is required" });
      }
      
      console.log(`[BATCH INSTANT] Starting scan+analyze for user ${userId}, image length: ${imageBase64.length}, buyPrice: ${buyPrice || 'not provided'}, maxBuy: ${maxBuyPrice || 'N/A'}, profit%: ${appliedProfitPercent || 'N/A'}, source: ${priceGuideSource || 'N/A'}`);
      
      // Get or create active session
      let session = await storage.getActiveBatchSession(userId);
      if (!session) {
        session = await storage.createBatchSession(userId);
      }
      
      // Check batch limit
      const existingItems = await storage.getBatchItems(session.id, userId);
      if (existingItems.length >= 20) {
        return res.status(400).json({ 
          message: "Maximum 20 items per batch. Start a new batch to continue." 
        });
      }
      
      // Create batch item in processing state
      const item = await storage.addBatchItem(session.id, userId, 'photo', imageBase64);
      await storage.updateBatchItem(item.id, userId, { status: 'processing' });
      
      try {
        // Step 1: VISUAL-FIRST IDENTIFICATION
        // Try Jina CLIP embeddings + pgvector search first, OpenAI Vision as fallback
        console.log(`[BATCH INSTANT] Step 1: Visual-first identification`);
        
        // OpenAI fallback function (called only if visual library match is weak)
        const openAIFallback = async (imgBase64: string) => {
          console.log(`[BATCH INSTANT] OpenAI fallback triggered`);
          const identifyRes = await fetchJsonWithDebugInternal(
            `http://localhost:${process.env.PORT || 5000}/api/scan-sessions/identify`,
            {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Cookie': req.headers.cookie 
              },
              body: JSON.stringify({ imageBase64: imgBase64 })
            },
            'OpenAI-Identify'
          );
          return identifyRes;
        };
        
        const visualResult = await identifyWithVisualLibrary(imageBase64, {
          fallbackToOpenAI: true,
          openAIIdentifyFn: openAIFallback,
        });
        
        if (!visualResult.success || !visualResult.candidate) {
          throw new Error(visualResult.error || 'Could not identify item - try a clearer photo');
        }
        
        const bestCandidate = visualResult.candidate;
        const matchStrength: MatchStrength = bestCandidate.matchStrength;
        const identifySource = bestCandidate.source;
        
        console.log(`[BATCH INSTANT] Identified: "${bestCandidate.title}" (${bestCandidate.category}) via ${identifySource}, strength: ${matchStrength}, confidence: ${bestCandidate.confidence.toFixed(3)}`);
        
        // Step 2: Confirm and analyze - use same endpoint as single scan
        // If user provided buyPrice, use that; otherwise fall back to estimated value
        const priceToUse = buyPrice ? String(buyPrice) : (bestCandidate.estimatedValue?.replace(/[^0-9.]/g, '') || '0');
        console.log(`[BATCH INSTANT] Step 2: Analyze via /api/items/analyze with price: ${priceToUse}`);
        const analysisResult = await fetchJsonWithDebugInternal(
          `http://localhost:${process.env.PORT || 5000}/api/items/analyze`,
          {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Cookie': req.headers.cookie 
            },
            body: JSON.stringify({
              url: 'camera://batch-scan', // Placeholder URL for camera scans
              title: bestCandidate.title,
              price: priceToUse,
              condition: itemCondition, // User-selected or default 'Used'
              category: normalizeCategory(bestCandidate.category),
              shipping: '0',
              sourceType: 'camera',
              compSource: 'none',
              buyPrice: buyPrice ? String(buyPrice) : undefined
            })
          },
          'Analyze'
        );
        
        // Update batch item with results including title, cost, margin, and max buy info
        const itemTitle = analysisResult.title || bestCandidate.title || bestCandidate.category || 'Unknown Item';
        const marginPercent = analysisResult.decisionData?.marginPercent ?? null;
        await storage.updateBatchItem(item.id, userId, {
          status: 'completed',
          itemId: analysisResult.id,
          title: itemTitle,
          buyPrice: buyPrice ? String(buyPrice) : null,
          maxBuyPrice: maxBuyPrice ? String(maxBuyPrice) : null,
          appliedProfitPercent: appliedProfitPercent ? Number(appliedProfitPercent) : null,
          priceGuideSource: priceGuideSource || null,
          decisionVerdict: analysisResult.decisionVerdict || null,
          decisionScore: analysisResult.decisionScore || null,
          marginPercent: marginPercent !== null ? String(marginPercent) : null,
          processedAt: new Date()
        });
        await storage.incrementBatchProcessed(session.id);
        
        const updatedItem = await storage.getBatchItem(item.id, userId);
        const updatedSession = await storage.getBatchSession(session.id, userId);
        
        console.log(`[BATCH INSTANT] Complete: ${itemTitle} → ${analysisResult.decisionVerdict}`);
        
        res.json({ 
          success: true,
          item: updatedItem, 
          session: updatedSession,
          analysisResult,
          candidate: bestCandidate,
          matchStrength,
          identifySource,
          compThumbnail: bestCandidate.compThumbnail,
          processingTimeMs: visualResult.processingTimeMs,
        });
        
      } catch (processErr: any) {
        const errorDetail = processErr.message || 'Unknown processing error';
        console.error(`[BATCH INSTANT] Failed: ${errorDetail}`);
        
        await storage.updateBatchItem(item.id, userId, {
          status: 'failed',
          errorMessage: errorDetail,
          processedAt: new Date()
        });
        await storage.incrementBatchProcessed(session.id);
        
        const updatedItem = await storage.getBatchItem(item.id, userId);
        const updatedSession = await storage.getBatchSession(session.id, userId);
        
        res.json({ 
          success: false,
          item: updatedItem,
          session: updatedSession,
          error: errorDetail 
        });
      }
    } catch (err: any) {
      console.error("Scan and analyze error:", err);
      res.status(500).json({ message: err.message || "Failed to scan and analyze" });
    }
  });
  
  // Internal helper for fetchJsonWithDebug (reused by multiple endpoints)
  async function fetchJsonWithDebugInternal(url: string, opts: RequestInit, stepName: string): Promise<any> {
    console.log(`[STEP] ${stepName}: Starting request to ${url}`);
    const res = await fetch(url, opts);
    const ct = res.headers.get("content-type") || "";
    const raw = await res.text();
    
    console.log(`[STEP] ${stepName}: HTTP ${res.status}, ct=${ct}, body=${raw.slice(0, 200)}...`);
    
    if (!res.ok || !ct.includes("application/json")) {
      throw new Error(`${stepName} failed: HTTP ${res.status} ct=${ct} snippet=${raw.slice(0, 300)}`);
    }
    
    try {
      return JSON.parse(raw);
    } catch (parseErr) {
      throw new Error(`${stepName} failed: JSON parse error, raw=${raw.slice(0, 300)}`);
    }
  }

  // Helper function for batch processing - validates response before parsing JSON
  async function fetchJsonWithDebug(url: string, opts: RequestInit, stepName: string): Promise<any> {
    console.log(`[BATCH STEP] ${stepName}: Starting request to ${url}`);
    const res = await fetch(url, opts);
    const ct = res.headers.get("content-type") || "";
    const raw = await res.text(); // always read text first
    
    console.log(`[BATCH STEP] ${stepName}: HTTP ${res.status}, content-type=${ct}, body=${raw.slice(0, 200)}...`);
    
    if (!res.ok || !ct.includes("application/json")) {
      throw new Error(`${stepName} failed: HTTP ${res.status} ct=${ct} snippet=${raw.slice(0, 300)}`);
    }
    
    try {
      return JSON.parse(raw);
    } catch (parseErr) {
      throw new Error(`${stepName} failed: JSON parse error, raw=${raw.slice(0, 300)}`);
    }
  }

  // Process next pending item in batch
  app.post('/api/batch/process', requireAuth, requireProOrElite, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      const session = await storage.getActiveBatchSession(userId);
      if (!session) {
        return res.status(404).json({ message: "No active batch session" });
      }
      
      // Update session to processing
      if (session.status === 'active') {
        await storage.updateBatchSession(session.id, userId, { status: 'processing' });
      }
      
      // Atomically claim next pending item (prevents race conditions)
      const pendingItem = await storage.claimNextPendingBatchItem(session.id, userId);
      if (!pendingItem) {
        // All done - complete the session
        await storage.updateBatchSession(session.id, userId, { 
          status: 'completed', 
          completedAt: new Date() 
        });
        return res.json({ complete: true, session: await storage.getBatchSession(session.id, userId) });
      }
      
      console.log(`[BATCH] Processing item ${pendingItem.id}, type=${pendingItem.inputType}`);
      
      try {
        // Process the item based on input type
        let analysisResult: any;
        
        if (pendingItem.inputType === 'url') {
          // Use existing extract+analyze flow for URL
          const url = pendingItem.inputValue;
          
          // Step 1: Extract item details
          const extractData = await fetchJsonWithDebug(
            `http://localhost:${process.env.PORT || 5000}/api/items/extract`,
            {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Cookie': req.headers.cookie 
              },
              body: JSON.stringify({ url })
            },
            'Extract'
          );
          
          // Step 2: Analyze the extracted item
          analysisResult = await fetchJsonWithDebug(
            `http://localhost:${process.env.PORT || 5000}/api/items/analyze`,
            {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Cookie': req.headers.cookie 
              },
              body: JSON.stringify({
                url,
                title: extractData.title,
                price: extractData.price,
                shipping: extractData.shipping,
                condition: extractData.condition
              })
            },
            'Analyze'
          );
        } else {
          // Photo/Camera input - first identify item via OpenAI Vision, then analyze
          console.log(`[BATCH] Step: Identify - sending image to vision API (base64 length: ${pendingItem.inputValue?.length || 0})`);
          
          const identifyData = await fetchJsonWithDebug(
            `http://localhost:${process.env.PORT || 5000}/api/scan-sessions/identify`,
            {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Cookie': req.headers.cookie 
              },
              body: JSON.stringify({
                imageBase64: pendingItem.inputValue
              })
            },
            'Identify'
          );
          
          console.log(`[BATCH] Identify response: sessionId=${identifyData.sessionId}, candidates=${identifyData.candidates?.length || 0}`);
          
          // The identify endpoint returns { sessionId, candidates }
          // For batch processing, auto-select the best candidate and analyze
          if (identifyData.candidates && identifyData.candidates.length > 0) {
            // Auto-select best candidate (first one, sorted by confidence)
            const bestCandidate = identifyData.candidates[0];
            console.log(`[BATCH] Selected candidate: "${bestCandidate.title}" (${bestCandidate.category}, confidence: ${bestCandidate.confidence})`);
            
            // Step 3: Confirm and analyze the identified item
            analysisResult = await fetchJsonWithDebug(
              `http://localhost:${process.env.PORT || 5000}/api/items/analyze`,
              {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json',
                  'Cookie': req.headers.cookie 
                },
                body: JSON.stringify({
                  url: 'camera://batch-process', // Placeholder URL for camera scans
                  title: bestCandidate.title,
                  price: bestCandidate.estimatedValue?.replace(/[^0-9.]/g, '') || '0',
                  condition: 'Used',
                  category: bestCandidate.category || 'Electronics',
                  shipping: '0',
                  sourceType: 'camera',
                  compSource: 'none'
                })
              },
              'Analyze'
            );
          } else {
            // No candidates - create a placeholder result with unknown category
            console.log(`[BATCH] No candidates found, creating unknown item`);
            throw new Error('Could not identify item - try a clearer photo or different angle');
          }
        }
        
        // Update batch item with results including title
        const itemTitle = analysisResult.title || analysisResult.confirmedTitle || 'Unknown Item';
        await storage.updateBatchItem(pendingItem.id, userId, {
          status: 'completed',
          itemId: analysisResult.id,
          title: itemTitle,
          decisionVerdict: analysisResult.decisionVerdict || null,
          decisionScore: analysisResult.decisionScore || null,
          processedAt: new Date()
        });
        
        await storage.incrementBatchProcessed(session.id);
        
        // Get updated session and item
        const updatedItem = await storage.getBatchItem(pendingItem.id, userId);
        const updatedSession = await storage.getBatchSession(session.id, userId);
        
        res.json({ 
          complete: false, 
          item: updatedItem, 
          session: updatedSession,
          analysisResult 
        });
        
      } catch (processErr: any) {
        // Mark item as failed with detailed error
        const errorDetail = processErr.message || 'Unknown processing error';
        console.error(`[BATCH] Item ${pendingItem.id} failed: ${errorDetail}`);
        
        await storage.updateBatchItem(pendingItem.id, userId, {
          status: 'failed',
          errorMessage: errorDetail,
          processedAt: new Date()
        });
        await storage.incrementBatchProcessed(session.id);
        
        const updatedItem = await storage.getBatchItem(pendingItem.id, userId);
        res.json({ 
          complete: false, 
          item: updatedItem, 
          error: errorDetail 
        });
      }
    } catch (err) {
      console.error("Process batch item error:", err);
      res.status(500).json({ message: "Failed to process batch item" });
    }
  });

  // Update batch item user action (accept/skip)
  app.patch('/api/batch/items/:id', requireAuth, requireProOrElite, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.id;
      const { action } = req.body;
      
      if (!['accepted', 'skipped'].includes(action)) {
        return res.status(400).json({ message: "action must be 'accepted' or 'skipped'" });
      }
      
      const updated = await storage.updateBatchItemAction(id, userId, action);
      if (!updated) {
        return res.status(404).json({ message: "Batch item not found" });
      }
      
      res.json(updated);
    } catch (err) {
      console.error("Update batch item action error:", err);
      res.status(500).json({ message: "Failed to update batch item" });
    }
  });

  // Delete/dismiss batch item
  app.delete('/api/batch/items/:id', requireAuth, requireProOrElite, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.id;
      
      const deleted = await storage.deleteBatchItem(id, userId);
      if (!deleted) {
        return res.status(404).json({ message: "Batch item not found" });
      }
      
      res.json({ success: true, id });
    } catch (err) {
      console.error("Delete batch item error:", err);
      res.status(500).json({ message: "Failed to delete batch item" });
    }
  });

  // Get batch session history
  app.get('/api/batch/history', requireAuth, requireProOrElite, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const sessions = await storage.getUserBatchSessions(userId);
      res.json(sessions);
    } catch (err) {
      console.error("Get batch history error:", err);
      res.status(500).json({ message: "Failed to get batch history" });
    }
  });

  // Complete/cancel current batch session
  app.post('/api/batch/complete', requireAuth, requireProOrElite, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { cancel } = req.body;
      
      const session = await storage.getActiveBatchSession(userId);
      if (!session) {
        return res.status(404).json({ message: "No active batch session" });
      }
      
      const updated = await storage.updateBatchSession(session.id, userId, { 
        status: cancel ? 'cancelled' : 'completed', 
        completedAt: new Date() 
      });
      
      res.json(updated);
    } catch (err) {
      console.error("Complete batch session error:", err);
      res.status(500).json({ message: "Failed to complete batch session" });
    }
  });

  // ========== EBAY API STATUS ==========
  
  // Get eBay API status (admin only)
  app.get('/api/ebay/status', requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser((req.user as { id: number }).id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const status = await getEbayApiStatus();
      res.json(status);
    } catch (err) {
      console.error("eBay status error:", err);
      res.status(500).json({ message: "Failed to check eBay API status" });
    }
  });

  // Get eBay API debug info - error samples and stats (admin only)
  app.get('/api/ebay/debug', requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser((req.user as { id: number }).id);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { getErrorSamples, getApiStats, getAverageCallsPerScan } = await import('./ebay-api');
      
      res.json({
        timestamp: new Date().toISOString(),
        errorSamples: getErrorSamples(),
        stats: getApiStats(),
        averageCallsPerScan: getAverageCallsPerScan(),
        notes: {
          retryPolicy: 'Exponential backoff with jitter: 500ms → 1.5s → 4s, max 3 retries for 5xx errors only',
          spikeDetection: '5+ 500 errors in 2 minutes triggers warning',
          callTracking: 'Tracks total calls, success/failure rates, calls per scan',
          ebayStatusPage: 'https://developer.ebay.com/support/api-status',
        },
      });
    } catch (err) {
      console.error("eBay debug error:", err);
      res.status(500).json({ message: "Failed to get eBay debug info" });
    }
  });

  // ========== EXPORT ROUTES ==========
  
  // Export P&L as CSV (QuickBooks/Excel compatible) - Pro-only, tax-ready format
  // Excludes intelligence signals (scores, confidence) - clean accountant-ready data only
  app.get('/api/exports/pnl', requireAuth, async (req, res) => {
    try {
      const userId = (req.user as { id: number }).id;
      const user = await storage.getUser(userId);
      
      // Pro-only feature (admins also have access)
      if (user?.subscriptionTier !== 'pro' && !user?.isAdmin) {
        return res.status(403).json({ 
          message: "P&L Export is a Pro feature. Upgrade to access tax-ready exports." 
        });
      }
      
      const inventoryItems = await storage.getInventoryItems(userId);
      
      // Build CSV rows
      const rows: string[] = [];
      
      // Header row - Clean accountant-ready format (no intelligence signals)
      rows.push([
        'Item Name',
        'Category', 
        'Purchase Date',
        'Sale Date',
        'Purchase Price',
        'Sale Price',
        'Platform Fees',
        'Shipping Cost',
        'Net Profit',
        'Status',
        'Source'
      ].join(','));
      
      // Helper to escape CSV values
      const escapeCSV = (val: string | null | undefined): string => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      
      // Helper to format date
      const formatDate = (date: Date | string | null): string => {
        if (!date) return '';
        const d = new Date(date);
        return d.toISOString().split('T')[0]; // YYYY-MM-DD format
      };
      
      // Process all inventory items - one row per item
      for (const item of inventoryItems) {
        const cost = parseFloat(item.purchasePrice || '0');
        const fees = parseFloat(item.feesEstimate || '0');
        const shipping = parseFloat(item.outboundShippingActual || item.shippingEstimate || '0');
        
        // Determine source (eBay scan, camera, manual)
        const source = item.itemId ? 'Margin Scan' : 'Manual Entry';
        
        if (item.status === 'sold' && item.actualSalePrice) {
          // SOLD ITEMS - Complete transaction
          const salePrice = parseFloat(item.actualSalePrice);
          const profit = salePrice - cost - fees - shipping;
          
          rows.push([
            escapeCSV(item.title),
            escapeCSV(item.condition || ''), // Using condition as category proxy
            formatDate(item.purchaseDate || item.createdAt),
            formatDate(item.soldDate),
            cost.toFixed(2),
            salePrice.toFixed(2),
            fees.toFixed(2),
            shipping.toFixed(2),
            profit.toFixed(2),
            'Sold',
            source
          ].join(','));
          
        } else {
          // UNSOLD ITEMS (bought/listed) - Current inventory
          rows.push([
            escapeCSV(item.title),
            escapeCSV(item.condition || ''),
            formatDate(item.purchaseDate || item.createdAt),
            '', // No sale date yet
            cost.toFixed(2),
            '', // No sale price yet
            fees.toFixed(2),
            shipping.toFixed(2),
            '', // No profit yet
            item.status === 'listed' ? 'Listed' : 'In Stock',
            source
          ].join(','));
        }
      }
      
      // Generate filename with date
      const filename = `margin-pnl-${new Date().toISOString().split('T')[0]}.csv`;
      
      // Set headers for file download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      res.send(rows.join('\n'));
    } catch (err) {
      console.error("Export P&L error:", err);
      res.status(500).json({ message: "Failed to export P&L" });
    }
  });

  // ==================== AFFILIATE ENDPOINTS ====================

  // Get affiliate stats for current user
  app.get("/api/affiliate/stats", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Ensure user has a referral code
      let referralCode = user.referralCode;
      if (!referralCode) {
        referralCode = await storage.generateReferralCode();
        await storage.setUserReferralCode(userId, referralCode);
      }

      // Get referred users
      const referredUsers = await storage.getReferredUsers(userId);
      const proReferrals = referredUsers.filter(u => u.subscriptionTier === 'pro').length;
      
      // Get earnings
      const earnings = await storage.getAffiliateEarnings(userId);
      const totalEarned = earnings.reduce((sum, e) => sum + parseFloat(e.amount), 0);
      const pendingEarnings = earnings
        .filter(e => e.status === 'pending')
        .reduce((sum, e) => sum + parseFloat(e.amount), 0);
      const paidEarnings = earnings
        .filter(e => e.status === 'paid')
        .reduce((sum, e) => sum + parseFloat(e.amount), 0);

      res.json({
        referralCode,
        referralLink: `https://marginhq.replit.app/?ref=${referralCode}`,
        totalReferrals: referredUsers.length,
        proReferrals,
        totalEarned: totalEarned.toFixed(2),
        pendingEarnings: pendingEarnings.toFixed(2),
        paidEarnings: paidEarnings.toFixed(2),
        commissionRate: 20, // 20% commission
        recentEarnings: earnings.slice(0, 10).map(e => ({
          id: e.id,
          amount: e.amount,
          month: e.paymentMonth,
          status: e.status,
          createdAt: e.createdAt,
        })),
      });
    } catch (err) {
      console.error("Affiliate stats error:", err);
      res.status(500).json({ message: "Failed to get affiliate stats" });
    }
  });

  // Get referred users list (for affiliate dashboard)
  app.get("/api/affiliate/referrals", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const referredUsers = await storage.getReferredUsers(userId);
      
      res.json(referredUsers.map(u => ({
        id: u.id,
        username: u.username,
        tier: u.subscriptionTier,
        joinedAt: u.createdAt,
      })));
    } catch (err) {
      console.error("Affiliate referrals error:", err);
      res.status(500).json({ message: "Failed to get referrals" });
    }
  });

  // ==================== PARTNER PROGRAM ENDPOINTS ====================

  // Get partner program summary (for Partner Dashboard)
  app.get("/api/partner/summary", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get partner program settings
      const settings = await storage.getPartnerProgramSettings();
      
      // Ensure user has a referral code
      let referralCode = user.referralCode;
      if (!referralCode) {
        referralCode = await storage.generateReferralCode();
        await storage.setUserReferralCode(userId, referralCode);
      }

      // Get partner stats
      const stats = await storage.getPartnerStats(userId);
      
      res.json({
        programActive: settings?.isActive ?? true,
        commissionRate: settings?.commissionRate ?? 20,
        minimumPayoutCents: settings?.minimumPayoutCents ?? 2500,
        payoutDelayDays: settings?.payoutDelayDays ?? 45,
        referralCode,
        referralLink: `https://marginhq.replit.app/?ref=${referralCode}`,
        stats: {
          totalReferrals: stats.totalReferrals,
          activeSubscriptions: stats.activeSubscriptions,
          pendingCents: stats.pendingEarnings,
          eligibleCents: stats.eligibleEarnings,
          payableCents: stats.payableEarnings,
          paidCents: stats.paidEarnings,
        },
      });
    } catch (err) {
      console.error("Partner summary error:", err);
      res.status(500).json({ message: "Failed to get partner summary" });
    }
  });

  // Get partner earnings history
  app.get("/api/partner/earnings", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const earnings = await storage.getPartnerEarnings(userId);
      
      res.json(earnings.map(e => ({
        id: e.id,
        amountCents: e.amountCents || Math.round(parseFloat(e.amount) * 100),
        paymentMonth: e.paymentMonth,
        status: e.status,
        unlockAt: e.unlockAt,
        paidAt: e.paidAt,
        voidReason: e.voidReason,
        createdAt: e.createdAt,
      })));
    } catch (err) {
      console.error("Partner earnings error:", err);
      res.status(500).json({ message: "Failed to get partner earnings" });
    }
  });

  // ==================== ADMIN PARTNER PROGRAM ENDPOINTS ====================

  const requireAdmin = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  };

  // Get partner program settings (admin)
  app.get("/api/admin/partner-settings", requireAdmin, async (req: any, res) => {
    try {
      const settings = await storage.getPartnerProgramSettings();
      res.json(settings || {
        commissionRate: 20,
        minimumPayoutCents: 2500,
        payoutDelayDays: 45,
        isActive: true,
      });
    } catch (err) {
      console.error("Admin partner settings error:", err);
      res.status(500).json({ message: "Failed to get settings" });
    }
  });

  // Update partner program settings (admin)
  app.patch("/api/admin/partner-settings", requireAdmin, async (req: any, res) => {
    try {
      const { commissionRate, minimumPayoutCents, payoutDelayDays, isActive } = req.body;
      
      const updates: any = {};
      if (typeof commissionRate === 'number') updates.commissionRate = commissionRate;
      if (typeof minimumPayoutCents === 'number') updates.minimumPayoutCents = minimumPayoutCents;
      if (typeof payoutDelayDays === 'number') updates.payoutDelayDays = payoutDelayDays;
      if (typeof isActive === 'boolean') updates.isActive = isActive;
      
      const updated = await storage.updatePartnerProgramSettings(updates, req.user.id);
      console.log(`[Admin] Partner settings updated by ${req.user.username}:`, updates);
      
      res.json(updated);
    } catch (err) {
      console.error("Admin update partner settings error:", err);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // Get all payable commissions (admin - for processing payouts)
  app.get("/api/admin/payable-commissions", requireAdmin, async (req: any, res) => {
    try {
      const settings = await storage.getPartnerProgramSettings();
      const minimumCents = settings?.minimumPayoutCents ?? 2500;
      
      const payable = await storage.getPayableCommissions(minimumCents);
      
      // Get usernames for each affiliate
      const result = await Promise.all(payable.map(async p => {
        const user = await storage.getUser(p.affiliateId);
        return {
          affiliateId: p.affiliateId,
          username: user?.username || 'Unknown',
          email: user?.email || '',
          totalCents: p.totalCents,
          earningIds: p.earningIds,
        };
      }));
      
      res.json({
        minimumPayoutCents: minimumCents,
        payable: result,
      });
    } catch (err) {
      console.error("Admin payable commissions error:", err);
      res.status(500).json({ message: "Failed to get payable commissions" });
    }
  });

  // Mark commissions as paid (admin)
  app.post("/api/admin/mark-paid", requireAdmin, async (req: any, res) => {
    try {
      const { earningIds } = req.body;
      
      if (!Array.isArray(earningIds)) {
        return res.status(400).json({ message: "earningIds must be an array" });
      }
      
      const count = await storage.markCommissionsPaid(earningIds);
      console.log(`[Admin] Marked ${count} commissions as paid by ${req.user.username}`);
      
      res.json({ markedPaid: count });
    } catch (err) {
      console.error("Admin mark paid error:", err);
      res.status(500).json({ message: "Failed to mark commissions paid" });
    }
  });

  // Manually unlock eligible commissions (admin - for testing)
  app.post("/api/admin/unlock-commissions", requireAdmin, async (req: any, res) => {
    try {
      const count = await storage.unlockEligibleCommissions();
      console.log(`[Admin] Unlocked ${count} commissions by ${req.user.username}`);
      
      res.json({ unlocked: count });
    } catch (err) {
      console.error("Admin unlock commissions error:", err);
      res.status(500).json({ message: "Failed to unlock commissions" });
    }
  });

  // =====================================================
  // PERSONAL STATS DASHBOARD
  // =====================================================
  app.get("/api/user/stats", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Get all user's items
      const userItems = await db.select().from(items).where(eq(items.userId, userId));
      
      // Calculate stats
      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      
      // Filter by month
      const thisMonthItems = userItems.filter(item => 
        item.createdAt && new Date(item.createdAt) >= thisMonth
      );
      const lastMonthItems = userItems.filter(item => 
        item.createdAt && new Date(item.createdAt) >= lastMonth && new Date(item.createdAt) <= lastMonthEnd
      );
      
      // Flip items (items with flip verdict)
      const flipItems = userItems.filter(item => item.decisionVerdict === 'flip');
      const thisMonthFlips = thisMonthItems.filter(item => item.decisionVerdict === 'flip');
      
      // Calculate potential value from flip items (avg comp price after fees)
      let totalPotentialProfit = 0;
      let thisMonthProfit = 0;
      const categoryProfit: Record<string, number> = {};
      const categoryCount: Record<string, number> = {};
      
      for (const item of flipItems) {
        // Use avg_comp as the expected sell price, calculate actual profit
        const sellPrice = Number(item.avgComp) || Number(item.flipPrice) || 0;
        const buyPrice = Number(item.buyPrice) || 0;
        const shippingIn = Number(item.shippingIn) || 0;
        const outboundShipping = Number(item.outboundShipping) || 5;
        const feeRate = Number(item.platformFeeRate) || 0.13;
        
        if (sellPrice > 0 && buyPrice > 0) {
          // Calculate actual profit: sell price - fees - costs
          const fees = sellPrice * feeRate;
          const netProfit = sellPrice - fees - buyPrice - shippingIn - outboundShipping;
          if (netProfit > 0) {
            totalPotentialProfit += netProfit;
            
            const cat = item.category || 'Other';
            categoryProfit[cat] = (categoryProfit[cat] || 0) + netProfit;
            categoryCount[cat] = (categoryCount[cat] || 0) + 1;
          }
        }
      }
      
      for (const item of thisMonthFlips) {
        const sellPrice = Number(item.avgComp) || Number(item.flipPrice) || 0;
        const buyPrice = Number(item.buyPrice) || 0;
        const shippingIn = Number(item.shippingIn) || 0;
        const outboundShipping = Number(item.outboundShipping) || 5;
        const feeRate = Number(item.platformFeeRate) || 0.13;
        
        if (sellPrice > 0 && buyPrice > 0) {
          const fees = sellPrice * feeRate;
          const netProfit = sellPrice - fees - buyPrice - shippingIn - outboundShipping;
          if (netProfit > 0) {
            thisMonthProfit += netProfit;
          }
        }
      }
      
      // Calculate avg margin (based on items where buy price is known)
      const margins: number[] = [];
      for (const item of flipItems) {
        const data = item.decisionData as any;
        const buyPrice = Number(item.buyPrice) || 0;
        const sellPrice = Number(item.avgComp) || Number(item.flipPrice) || 0;
        
        if (data?.marginPercent && data.marginPercent > 0) {
          margins.push(data.marginPercent);
        } else if (buyPrice > 0 && sellPrice > 0) {
          // Calculate margin: (sell - buy) / sell * 100
          const margin = ((sellPrice - buyPrice) / sellPrice) * 100;
          if (margin > 0) margins.push(margin);
        }
      }
      const avgMargin = margins.length > 0 ? margins.reduce((a, b) => a + b, 0) / margins.length : 0;
      
      // Find best category
      let bestCategory = 'None';
      let bestCategoryProfit = 0;
      for (const [cat, profit] of Object.entries(categoryProfit)) {
        if (profit > bestCategoryProfit) {
          bestCategoryProfit = profit;
          bestCategory = cat;
        }
      }
      
      // Flip rate (flip vs skip)
      const skipItems = userItems.filter(item => item.decisionVerdict === 'skip');
      const flipRate = userItems.length > 0 ? (flipItems.length / userItems.length) * 100 : 0;
      
      // NEW: Profit Realized - items with flipPrice recorded (means they were sold)
      // The app marks items as sold by setting flipPrice, not by userDecision
      const soldItems = userItems.filter(item => 
        item.flipPrice && (item.userDecision === 'flip' || item.userDecision === 'bought' || item.userDecision === 'sold')
      );
      let profitRealized = 0;
      for (const item of soldItems) {
        const salePrice = Number(item.flipPrice) || 0;
        const buyPrice = Number(item.buyPrice) || 0;
        const shippingIn = Number(item.shippingIn) || 0;
        const outboundShipping = Number(item.outboundShipping) || 5;
        const feeRate = Number(item.platformFeeRate) || 0.13;
        
        if (salePrice > 0) {
          // Use actual stored fee rate or default 13%
          const fees = salePrice * feeRate;
          const actualProfit = salePrice - fees - buyPrice - shippingIn - outboundShipping;
          profitRealized += actualProfit;
        }
      }
      
      // NEW: Win Rate - of our flip recommendations, how many did user actually sell?
      const flipsActuallySold = soldItems.filter(item => item.decisionVerdict === 'flip');
      const winRate = flipItems.length > 0 
        ? (flipsActuallySold.length / flipItems.length) * 100 
        : 0;
      
      // NEW: Time saved - 5 minutes research per scan
      const timeSavedMinutes = userItems.length * 5;
      const timeSavedHours = Math.floor(timeSavedMinutes / 60);
      
      // NEW: Weekly scan trend (last 4 weeks)
      const weeklyTrend: number[] = [];
      for (let i = 0; i < 4; i++) {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - (7 * (i + 1)));
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() - (7 * i));
        
        const weekScans = userItems.filter(item => 
          item.createdAt && 
          new Date(item.createdAt) >= weekStart && 
          new Date(item.createdAt) < weekEnd
        ).length;
        weeklyTrend.unshift(weekScans); // oldest first
      }
      
      // NEW: Current streak (consecutive days with at least 1 scan)
      let streak = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      for (let i = 0; i < 365; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - i);
        const nextDay = new Date(checkDate);
        nextDay.setDate(nextDay.getDate() + 1);
        
        const hasScans = userItems.some(item => 
          item.createdAt && 
          new Date(item.createdAt) >= checkDate && 
          new Date(item.createdAt) < nextDay
        );
        
        if (hasScans) {
          streak++;
        } else if (i > 0) {
          break; // streak broken
        }
      }
      
      res.json({
        totalScans: userItems.length,
        totalFlips: flipItems.length,
        totalSkips: skipItems.length,
        flipRate: Math.round(flipRate),
        totalPotentialProfit: Math.round(totalPotentialProfit),
        thisMonthProfit: Math.round(thisMonthProfit),
        thisMonthScans: thisMonthItems.length,
        lastMonthScans: lastMonthItems.length,
        avgMargin: Math.round(avgMargin),
        bestCategory,
        bestCategoryProfit: Math.round(bestCategoryProfit),
        categoryBreakdown: Object.entries(categoryCount).map(([name, count]) => ({
          name,
          count,
          profit: Math.round(categoryProfit[name] || 0)
        })).sort((a, b) => b.profit - a.profit),
        // NEW metrics
        profitRealized: Math.round(profitRealized),
        itemsSold: soldItems.length,
        winRate: Math.round(winRate),
        timeSavedHours,
        weeklyTrend,
        streak,
      });
    } catch (err) {
      console.error("Stats error:", err);
      res.status(500).json({ message: "Failed to get stats" });
    }
  });

  // =====================================================
  // PSA CERT VERIFICATION (Public API Integration)
  // =====================================================
  
  // Get PSA API status
  app.get("/api/psa/status", requireAuth, async (req: any, res) => {
    try {
      const status = getPSAStatus();
      res.json(status);
    } catch (err) {
      console.error("PSA status error:", err);
      res.status(500).json({ message: "Failed to get PSA status" });
    }
  });

  // Lookup PSA cert by number
  app.get("/api/psa/cert/:certNumber", requireAuth, async (req: any, res) => {
    try {
      const { certNumber } = req.params;
      
      if (!certNumber) {
        return res.status(400).json({ message: "Cert number required" });
      }
      
      console.log(`[PSA] Looking up cert: ${certNumber}`);
      const result = await lookupPSACert(certNumber);
      
      if (!result.success) {
        return res.status(result.error === 'NOT_FOUND' ? 404 : 400).json({
          message: result.message,
          error: result.error
        });
      }
      
      res.json(result.data);
    } catch (err: any) {
      console.error("PSA cert lookup error:", err);
      res.status(500).json({ message: err.message || "Failed to lookup PSA cert" });
    }
  });

  // Get PSA grade premium estimate
  app.post("/api/psa/grade-premium", requireAuth, async (req: any, res) => {
    try {
      const { grade, basePrice } = req.body;
      
      if (!grade || basePrice === undefined) {
        return res.status(400).json({ message: "Grade and basePrice required" });
      }
      
      const gradeLabel = formatPSAGrade(grade);
      const estimatedPrice = estimateGradePremium(grade, parseFloat(basePrice));
      
      res.json({
        grade,
        gradeLabel,
        basePrice: parseFloat(basePrice),
        estimatedPrice,
        premium: Math.round((estimatedPrice / parseFloat(basePrice) - 1) * 100)
      });
    } catch (err: any) {
      console.error("PSA grade premium error:", err);
      res.status(500).json({ message: err.message || "Failed to calculate grade premium" });
    }
  });

  // =====================================================
  // GAMIFICATION SYSTEM
  // =====================================================
  
  // Get user gamification stats - always recalculate from actual items for accuracy
  app.get("/api/gamification/stats", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Always calculate fresh stats from actual items data
      const userItems = await db.select().from(items).where(eq(items.userId, userId));
      const flipItems = userItems.filter(i => i.decisionVerdict === 'flip');
      const skipItems = userItems.filter(i => i.decisionVerdict === 'skip');
      
      let totalProfit = 0;
      let largestProfit = 0;
      
      for (const item of flipItems) {
        // Try multiple sources for profit data
        let profit = 0;
        
        // First try decisionData
        const decisionData = item.decisionData as any;
        if (decisionData) {
          profit = decisionData.netProfit || decisionData.profit || decisionData.expectedProfit || 0;
        }
        
        // If no profit in decisionData, calculate from avgComp and price
        if (profit === 0 && item.avgComp) {
          const avgComp = parseFloat(String(item.avgComp));
          const buyPrice = item.price ? parseFloat(item.price) : 0;
          if (avgComp > 0 && buyPrice > 0) {
            // Calculate profit: avgComp - 13% fees - $5 fixed costs - buy price
            const netAfterFees = avgComp * 0.87 - 5;
            profit = netAfterFees - buyPrice;
          } else if (avgComp > 0) {
            // No buy price, use maxBuy calculation (25% margin)
            const netAfterFees = avgComp * 0.87 - 5;
            const maxBuy = netAfterFees * 0.75;
            profit = netAfterFees - maxBuy; // Potential profit at max buy
          }
        }
        
        if (profit > 0) {
          totalProfit += profit;
          if (profit > largestProfit) largestProfit = profit;
        }
      }
      
      // Get or update stored stats for streak tracking
      let [stats] = await db.select().from(userStats).where(eq(userStats.userId, userId));
      
      if (!stats) {
        [stats] = await db.insert(userStats).values({
          userId,
          totalScans: userItems.length,
          totalFlips: flipItems.length,
          totalSkips: skipItems.length,
          totalProfitPotential: totalProfit.toString(),
          currentStreak: 0,
          longestStreak: 0,
          largestSingleProfit: largestProfit.toString(),
        }).returning();
      } else {
        // Update stored stats with fresh calculations
        await db.update(userStats)
          .set({
            totalScans: userItems.length,
            totalFlips: flipItems.length,
            totalSkips: skipItems.length,
            totalProfitPotential: totalProfit.toString(),
            largestSingleProfit: largestProfit.toString(),
          })
          .where(eq(userStats.userId, userId));
      }
      
      res.json({
        totalScans: userItems.length,
        totalFlips: flipItems.length,
        totalSkips: skipItems.length,
        totalProfitPotential: Math.round(totalProfit),
        currentStreak: stats.currentStreak || 0,
        longestStreak: stats.longestStreak || 0,
        largestSingleProfit: Math.round(largestProfit),
      });
    } catch (err) {
      console.error("Gamification stats error:", err);
      res.status(500).json({ message: "Failed to get gamification stats" });
    }
  });
  
  // Get user achievements
  app.get("/api/gamification/achievements", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const achievements = await db.select().from(userAchievements)
        .where(eq(userAchievements.userId, userId))
        .orderBy(desc(userAchievements.earnedAt));
      
      res.json(achievements);
    } catch (err) {
      console.error("Achievements error:", err);
      res.status(500).json({ message: "Failed to get achievements" });
    }
  });
  
  // Get today's profit goal
  app.get("/api/gamification/goal/today", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const today = new Date().toISOString().split('T')[0];
      
      const [goal] = await db.select().from(profitGoals)
        .where(and(
          eq(profitGoals.userId, userId),
          eq(profitGoals.goalDate, today)
        ));
      
      res.json(goal || null);
    } catch (err) {
      console.error("Goal error:", err);
      res.status(500).json({ message: "Failed to get goal" });
    }
  });
  
  // Set daily profit goal
  app.post("/api/gamification/goal", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { targetAmount } = req.body;
      const today = new Date().toISOString().split('T')[0];
      
      // Upsert goal for today
      const [existing] = await db.select().from(profitGoals)
        .where(and(
          eq(profitGoals.userId, userId),
          eq(profitGoals.goalDate, today)
        ));
      
      let goal;
      if (existing) {
        [goal] = await db.update(profitGoals)
          .set({ targetAmount: targetAmount.toString() })
          .where(eq(profitGoals.id, existing.id))
          .returning();
      } else {
        [goal] = await db.insert(profitGoals).values({
          userId,
          goalDate: today,
          targetAmount: targetAmount.toString(),
          currentAmount: "0",
          flipsToday: 0,
          scansToday: 0,
        }).returning();
      }
      
      res.json(goal);
    } catch (err) {
      console.error("Set goal error:", err);
      res.status(500).json({ message: "Failed to set goal" });
    }
  });
  
  // AR Overlay scan endpoint
  app.post("/api/ar-overlay/scan", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Check AR scan limits for free users
      const arScanStatus = await storage.canUserArScan(userId);
      if (!arScanStatus.allowed) {
        return res.status(429).json({ 
          error: "Daily AR scan limit reached (7/day). Upgrade to Pro for unlimited AR scans.",
          remaining: arScanStatus.remaining,
          limit: arScanStatus.limit,
        });
      }
      
      const { image } = req.body;
      if (!image) {
        return res.status(400).json({ error: "No image provided" });
      }
      
      // Increment AR scan count
      await storage.incrementDailyArScanCount(userId);
      
      // Use OpenAI vision to identify item and get pricing
      // Uses the global openai client configured at the top of the file
      
      const visionResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
          role: "user",
          content: [
            { 
              type: "text", 
              text: `Identify this item for resale. Return JSON with:
{
  "title": "item name with brand/model",
  "category": "Shoes|Watches|Trading Cards|Collectibles|Electronics|Other",
  "brand": "brand name or null",
  "model": "model name or null",
  "condition": "New|Used",
  "searchQuery": "ebay search query for sold comps"
}` 
            },
            { type: "image_url", image_url: { url: image, detail: "low" } }
          ]
        }],
        max_tokens: 300,
        response_format: { type: "json_object" }
      });
      
      const content = visionResponse.choices[0]?.message?.content || '{}';
      let identified;
      try {
        identified = JSON.parse(content);
      } catch {
        return res.json({ error: "Could not identify item" });
      }
      
      if (!identified.title) {
        return res.json({ error: "Could not identify item" });
      }
      
      // Fetch comps for pricing - with caching, retry, and error handling
      const category = identified.category || 'Other';
      const searchQuery = identified.searchQuery || identified.title;
      const condition = identified.condition || 'Used';
      
      let compsResult: any = null;
      try {
        // Try to get from cache first (4 weeks for shoes, 1 week for others, 24h for cards)
        const compsKey = cacheKeys.ebayComps(searchQuery);
        const { data: cached, source } = await cache.getOrFetch(
          compsKey,
          async () => {
            // Use retry logic with timeout for eBay API
            return await withTimeout(
              callEbayWithRetry(() =>
                fetchCompsWithFallback(searchQuery, condition, category)
              ),
              30000 // 30 second timeout
            );
          },
          category // Pass category for smart TTL (24h for cards, 4w for shoes, etc)
        );
        
        compsResult = cached;
        console.log(`[ARScan] Comps ${source === 'cached' ? 'CACHED' : 'FRESH'} (${category}): ${cached?.comps?.length || 0} comps`);
        
        // Track successful eBay API call
        await trackApiCall('ebay', async () => ({}));
      } catch (error: any) {
        console.error(`[ARScan] Comps fetch failed: ${error.message}`);
        // Track failed eBay API call
        await trackApiCall('ebay', async () => { throw error; }).catch(() => {});
        
        // Convert to app error with user-friendly message
        const appError = toAppError(error, ErrorCode.EBAY_UNAVAILABLE);
        console.warn(`[ARScan] Using empty fallback due to: ${appError.getUserMessage().message}`);
        compsResult = { comps: [] }; // Graceful fallback
      }
      
      const comps = compsResult?.comps || [];
      if (comps.length === 0) {
        return res.json({
          title: identified.title,
          category: identified.category || 'Other',
          maxBuy: null,
          expectedSale: null,
          profit: null,
          marginPercent: null,
          verdict: 'skip',
          confidence: 30,
          compsCount: 0,
        });
      }
      
      // Calculate pricing using the decision engine
      const prices = comps.map((c: any) => c.soldPrice || c.totalPrice || 0).filter((p: number) => p > 0).sort((a: number, b: number) => a - b);
      const medianPrice = prices[Math.floor(prices.length / 2)] || 0;
      
      const feeRate = getCategoryFeeRate(identified.category || 'Other');
      const shipping = getShippingAllowance(identified.category || 'Other');
      
      // Calculate max buy based on 25% margin threshold
      const fees = medianPrice * feeRate;
      const netAfterFees = medianPrice - fees - shipping - 5; // 5 = fixed costs
      const maxBuy = netAfterFees * 0.75; // 25% margin means max buy is 75% of net
      
      const verdict = maxBuy > 10 ? 'flip' : 'skip';
      const marginPercent = maxBuy > 0 ? ((netAfterFees - maxBuy) / netAfterFees) * 100 : 0;
      
      res.json({
        title: identified.title,
        category: identified.category || 'Other',
        maxBuy: maxBuy > 0 ? Math.round(maxBuy) : null,
        expectedSale: medianPrice > 0 ? Math.round(medianPrice) : null,
        profit: maxBuy > 0 ? Math.round(netAfterFees - maxBuy) : null,
        marginPercent: marginPercent > 0 ? Math.round(marginPercent) : null,
        verdict,
        confidence: Math.min(90, 50 + comps.length * 5),
        compsCount: comps.length,
      });
    } catch (err) {
      console.error("AR scan error:", err);
      res.status(500).json({ error: "Analysis failed" });
    }
  });

  // =====================================================
  // MYSTERY FLIP OF THE DAY
  // =====================================================
  app.get("/api/mystery-flip", requireAuth, async (req: any, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const userId = req.user.id;
      
      // Check if we have today's mystery flip
      const [existing] = await db.select().from(mysteryFlips)
        .where(eq(mysteryFlips.flipDate, today))
        .limit(1);
      
      if (existing) {
        // Check if user already voted
        const [vote] = await db.select().from(mysteryFlipVotes)
          .where(and(
            eq(mysteryFlipVotes.mysteryFlipId, existing.id),
            eq(mysteryFlipVotes.userId, userId)
          ))
          .limit(1);
        
        // Get vote counts
        const allVotes = await db.select().from(mysteryFlipVotes)
          .where(eq(mysteryFlipVotes.mysteryFlipId, existing.id));
        
        const flipVotes = allVotes.filter(v => v.vote === 'flip').length;
        const skipVotes = allVotes.filter(v => v.vote === 'skip').length;
        
        return res.json({
          id: existing.id,
          title: existing.title,
          price: existing.price,
          imageUrl: existing.imageUrl,
          category: existing.category,
          userVote: vote?.vote || null,
          flipVotes,
          skipVotes,
          totalVotes: flipVotes + skipVotes,
        });
      }
      
      // No mystery flip for today yet - create one by fetching from eBay
      try {
        const categories = ['watch', 'sports card', 'electronics', 'collectibles'];
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];
        
        // Use Browse API to get a random active listing
        const token = await getEbayOAuthToken();
        if (!token) {
          return res.json({ message: "Mystery flip not available today" });
        }
        
        const searchResponse = await fetch(
          `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(randomCategory)}&limit=20&offset=${Math.floor(Math.random() * 100)}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
            }
          }
        );
        
        if (!searchResponse.ok) {
          return res.json({ message: "Mystery flip not available today" });
        }
        
        const data = await searchResponse.json();
        if (!data.itemSummaries || data.itemSummaries.length === 0) {
          return res.json({ message: "Mystery flip not available today" });
        }
        
        // Pick a random item
        const randomItem = data.itemSummaries[Math.floor(Math.random() * data.itemSummaries.length)];
        
        // Insert the mystery flip
        const [newFlip] = await db.insert(mysteryFlips).values({
          flipDate: today,
          ebayItemId: randomItem.itemId || 'unknown',
          title: randomItem.title || 'Mystery Item',
          price: randomItem.price?.value ? `$${randomItem.price.value}` : '$0',
          imageUrl: randomItem.image?.imageUrl || randomItem.thumbnailImages?.[0]?.imageUrl,
          category: randomCategory,
        }).returning();
        
        return res.json({
          id: newFlip.id,
          title: newFlip.title,
          price: newFlip.price,
          imageUrl: newFlip.imageUrl,
          category: newFlip.category,
          userVote: null,
          flipVotes: 0,
          skipVotes: 0,
          totalVotes: 0,
        });
      } catch (fetchErr) {
        console.error("Error creating mystery flip:", fetchErr);
        return res.json({ message: "Mystery flip not available today" });
      }
    } catch (err) {
      console.error("Mystery flip error:", err);
      res.status(500).json({ message: "Failed to get mystery flip" });
    }
  });

  // Vote on mystery flip
  app.post("/api/mystery-flip/:id/vote", requireAuth, async (req: any, res) => {
    try {
      const flipId = parseInt(req.params.id);
      const userId = req.user.id;
      const { vote } = req.body;
      
      if (!['flip', 'skip'].includes(vote)) {
        return res.status(400).json({ message: "Vote must be 'flip' or 'skip'" });
      }
      
      // Check if user already voted
      const existing = await db.select().from(mysteryFlipVotes)
        .where(and(
          eq(mysteryFlipVotes.mysteryFlipId, flipId),
          eq(mysteryFlipVotes.userId, userId)
        ));
      
      if (existing.length > 0) {
        return res.status(400).json({ message: "You already voted on this" });
      }
      
      // Insert vote
      await db.insert(mysteryFlipVotes).values({
        mysteryFlipId: flipId,
        userId,
        vote,
      });
      
      // Get updated counts
      const allVotes = await db.select().from(mysteryFlipVotes)
        .where(eq(mysteryFlipVotes.mysteryFlipId, flipId));
      
      const flipVotes = allVotes.filter(v => v.vote === 'flip').length;
      const skipVotes = allVotes.filter(v => v.vote === 'skip').length;
      
      res.json({
        success: true,
        userVote: vote,
        flipVotes,
        skipVotes,
        totalVotes: flipVotes + skipVotes,
      });
    } catch (err) {
      console.error("Vote error:", err);
      res.status(500).json({ message: "Failed to record vote" });
    }
  });

  // =====================================================
  // PRICE DROP ALERTS
  // =====================================================
  app.get("/api/price-alerts", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const alerts = await db.select().from(priceAlerts)
        .where(and(eq(priceAlerts.userId, userId), eq(priceAlerts.isActive, true)));
      
      res.json(alerts);
    } catch (err) {
      console.error("Price alerts error:", err);
      res.status(500).json({ message: "Failed to get price alerts" });
    }
  });

  // Create price alert (watch an item for price drops)
  app.post("/api/price-alerts", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { itemId, title, originalPrice, maxBuyPrice, ebayItemId } = req.body;
      
      if (!title || !originalPrice) {
        return res.status(400).json({ message: "Title and original price required" });
      }
      
      const [alert] = await db.insert(priceAlerts).values({
        userId,
        itemId: itemId || null,
        ebayItemId: ebayItemId || null,
        title,
        originalPrice: String(originalPrice),
        maxBuyPrice: maxBuyPrice ? String(maxBuyPrice) : null,
        currentPrice: String(originalPrice),
      }).returning();
      
      res.json(alert);
    } catch (err) {
      console.error("Create price alert error:", err);
      res.status(500).json({ message: "Failed to create price alert" });
    }
  });

  // Delete price alert
  app.delete("/api/price-alerts/:id", requireAuth, async (req: any, res) => {
    try {
      const alertId = parseInt(req.params.id);
      const userId = req.user.id;
      
      await db.update(priceAlerts)
        .set({ isActive: false })
        .where(and(eq(priceAlerts.id, alertId), eq(priceAlerts.userId, userId)));
      
      res.json({ success: true });
    } catch (err) {
      console.error("Delete price alert error:", err);
      res.status(500).json({ message: "Failed to delete price alert" });
    }
  });

  // Get triggered alerts (price dropped below max buy)
  app.get("/api/price-alerts/triggered", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const alerts = await db.select().from(priceAlerts)
        .where(and(
          eq(priceAlerts.userId, userId),
          eq(priceAlerts.alertTriggered, true),
          eq(priceAlerts.isActive, true)
        ));
      
      res.json(alerts);
    } catch (err) {
      console.error("Triggered alerts error:", err);
      res.status(500).json({ message: "Failed to get triggered alerts" });
    }
  });

  // ==========================================================
  // SHOP ENDPOINTS - Printful Integration
  // ==========================================================

  // Get all active shop products
  app.get("/api/shop/products", async (req, res) => {
    try {
      const products = await db.select().from(shopProducts)
        .where(eq(shopProducts.isActive, true));
      
      res.json(products);
    } catch (err) {
      console.error("Shop products error:", err);
      res.status(500).json({ message: "Failed to get products" });
    }
  });

  // Create checkout session for a product
  app.post("/api/shop/checkout", requireAuth, async (req: any, res) => {
    try {
      const { productId, quantity = 1 } = req.body;
      const userId = req.user.id;
      
      // Get product
      const [product] = await db.select().from(shopProducts)
        .where(and(
          eq(shopProducts.id, productId),
          eq(shopProducts.isActive, true)
        ));
      
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      if (!product.inStock) {
        return res.status(400).json({ message: "Product out of stock" });
      }
      
      const totalPrice = Number(product.price) * quantity;
      
      // Create order record
      const [order] = await db.insert(shopOrders).values({
        userId,
        productId: product.id,
        quantity,
        totalPrice: totalPrice.toString(),
        status: "pending",
      }).returning();
      
      // Create Stripe checkout session
      const stripe = new (await import("stripe")).default(process.env.STRIPE_SECRET_KEY!);
      
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: product.name,
                description: product.description || undefined,
                images: product.imageUrl ? [product.imageUrl] : undefined,
              },
              unit_amount: Math.round(Number(product.price) * 100), // cents
            },
            quantity,
          },
        ],
        mode: "payment",
        success_url: `${req.headers.origin}/shop?success=true&order=${order.id}`,
        cancel_url: `${req.headers.origin}/shop?canceled=true`,
        metadata: {
          orderId: order.id.toString(),
          productId: product.id.toString(),
        },
        shipping_address_collection: {
          allowed_countries: ["US", "CA", "GB", "AU"],
        },
      });
      
      res.json({ url: session.url });
    } catch (err) {
      console.error("Shop checkout error:", err);
      res.status(500).json({ message: "Failed to create checkout" });
    }
  });

  // Webhook handler for shop order completion (Stripe)
  app.post("/api/shop/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const stripe = new (await import("stripe")).default(process.env.STRIPE_SECRET_KEY!);
    const sig = req.headers["stripe-signature"];
    
    // Note: In production, use STRIPE_SHOP_WEBHOOK_SECRET
    const webhookSecret = process.env.STRIPE_SHOP_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.log("Shop webhook: no secret configured, skipping verification");
      return res.json({ received: true });
    }
    
    try {
      const event = stripe.webhooks.constructEvent(req.body, sig as string, webhookSecret);
      
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as any;
        const orderId = parseInt(session.metadata?.orderId);
        
        if (orderId) {
          // Update order status
          await db.update(shopOrders)
            .set({ 
              status: "paid",
              stripePaymentIntentId: session.payment_intent,
              shippingName: session.shipping?.name,
              shippingAddress: session.shipping?.address?.line1,
              shippingCity: session.shipping?.address?.city,
              shippingState: session.shipping?.address?.state,
              shippingZip: session.shipping?.address?.postal_code,
              shippingCountry: session.shipping?.address?.country,
            })
            .where(eq(shopOrders.id, orderId));
          
          // Submit order to Printful
          try {
            const [order] = await db.select().from(shopOrders).where(eq(shopOrders.id, orderId));
            const [product] = await db.select().from(shopProducts).where(eq(shopProducts.id, order.productId));
            
            if (order && product) {
              const printfulResult = await submitOrderToPrintful(
                {
                  id: order.id,
                  shippingName: session.shipping?.name || null,
                  shippingAddress: session.shipping?.address?.line1 || null,
                  shippingCity: session.shipping?.address?.city || null,
                  shippingState: session.shipping?.address?.state || null,
                  shippingZip: session.shipping?.address?.postal_code || null,
                  shippingCountry: session.shipping?.address?.country || null,
                },
                {
                  printfulVariantId: product.printfulVariantId,
                  price: product.price,
                },
                order.quantity
              );
              
              if (printfulResult) {
                await db.update(shopOrders)
                  .set({ 
                    printfulOrderId: printfulResult.printfulOrderId,
                    status: "submitted",
                  })
                  .where(eq(shopOrders.id, orderId));
                console.log(`Shop order ${orderId} submitted to Printful: ${printfulResult.printfulOrderId}`);
              }
            }
          } catch (printfulError) {
            console.error("Printful submission error:", printfulError);
            // Order is paid but Printful submission failed - mark for manual review
            await db.update(shopOrders)
              .set({ status: "paid_pending_fulfillment" })
              .where(eq(shopOrders.id, orderId));
          }
        }
      }
      
      res.json({ received: true });
    } catch (err) {
      console.error("Shop webhook error:", err);
      res.status(400).send(`Webhook Error: ${err}`);
    }
  });

  // Admin: Add a shop product (for testing)
  app.post("/api/admin/shop/products", requireAuth, async (req: any, res) => {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { name, description, price, baseCost, imageUrl, category, printfulProductId, printfulVariantId } = req.body;
      
      const [product] = await db.insert(shopProducts).values({
        name,
        description,
        price: price.toString(),
        baseCost: baseCost?.toString(),
        imageUrl,
        category,
        printfulProductId,
        printfulVariantId,
        inStock: true,
        isActive: true,
      }).returning();
      
      res.json(product);
    } catch (err) {
      console.error("Add shop product error:", err);
      res.status(500).json({ message: "Failed to add product" });
    }
  });

  // Get user's orders
  app.get("/api/shop/orders", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const orders = await db.select().from(shopOrders)
        .where(eq(shopOrders.userId, userId));
      
      res.json(orders);
    } catch (err) {
      console.error("Shop orders error:", err);
      res.status(500).json({ message: "Failed to get orders" });
    }
  });

  // Admin: Sync products from Printful
  app.post("/api/admin/shop/sync-printful", requireAuth, async (req: any, res) => {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const client = createPrintfulClient();
      if (!client) {
        return res.status(400).json({ 
          message: "Printful API key not configured. Add PRINTFUL_API_KEY to secrets." 
        });
      }
      
      // Get products from Printful
      const printfulProducts = await client.getSyncProducts();
      let syncedCount = 0;
      
      for (const product of printfulProducts) {
        if (product.is_ignored) continue;
        
        // Get full product with variants
        const fullProduct = await client.getSyncProduct(product.id);
        
        for (const variant of fullProduct.sync_variants) {
          // Check if already exists
          const [existing] = await db.select().from(shopProducts)
            .where(eq(shopProducts.printfulVariantId, variant.id.toString()));
          
          const productData = {
            name: `${product.name} - ${variant.name}`,
            description: null,
            price: variant.retail_price,
            imageUrl: variant.files?.[0]?.preview_url || variant.product?.image || product.thumbnail_url,
            category: "Apparel",
            printfulProductId: product.id.toString(),
            printfulVariantId: variant.id.toString(),
            inStock: variant.synced,
            isActive: true,
          };
          
          if (existing) {
            await db.update(shopProducts)
              .set(productData)
              .where(eq(shopProducts.id, existing.id));
          } else {
            await db.insert(shopProducts).values(productData);
          }
          
          syncedCount++;
        }
      }
      
      res.json({ 
        success: true, 
        message: `Synced ${syncedCount} product variants from Printful`,
        count: syncedCount 
      });
    } catch (err: any) {
      console.error("Printful sync error:", err);
      res.status(500).json({ 
        message: err.message || "Failed to sync from Printful" 
      });
    }
  });

  // Check Printful connection status
  app.get("/api/shop/printful-status", requireAuth, async (req: any, res) => {
    try {
      const client = createPrintfulClient();
      if (!client) {
        return res.json({ 
          connected: false,
          message: "Printful API key not configured" 
        });
      }
      
      // Try to fetch products to verify connection
      const products = await client.getSyncProducts();
      res.json({ 
        connected: true,
        productCount: products.length,
        message: `Connected to Printful with ${products.length} products` 
      });
    } catch (err: any) {
      res.json({ 
        connected: false,
        message: err.message || "Failed to connect to Printful" 
      });
    }
  });

  // ============================================
  // STREAM OVERLAY API (for OBS/live streaming)
  // ============================================
  
  // Simple in-memory rate limiter for stream overlay
  const overlayRateLimiter = new Map<string, { count: number; resetTime: number }>();
  const OVERLAY_RATE_LIMIT = 30; // requests per minute
  const OVERLAY_RATE_WINDOW = 60 * 1000; // 1 minute
  
  // Quick market value lookup for stream overlay - no auth required for ease of use
  app.post("/api/stream-overlay/lookup", async (req, res) => {
    try {
      // Rate limiting by IP
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      const now = Date.now();
      const rateData = overlayRateLimiter.get(clientIp);
      
      if (rateData) {
        if (now > rateData.resetTime) {
          overlayRateLimiter.set(clientIp, { count: 1, resetTime: now + OVERLAY_RATE_WINDOW });
        } else if (rateData.count >= OVERLAY_RATE_LIMIT) {
          return res.status(429).json({ error: "Too many requests. Please wait a moment." });
        } else {
          rateData.count++;
        }
      } else {
        overlayRateLimiter.set(clientIp, { count: 1, resetTime: now + OVERLAY_RATE_WINDOW });
      }
      
      // Clean up old entries periodically
      if (overlayRateLimiter.size > 1000) {
        Array.from(overlayRateLimiter.entries()).forEach(([ip, data]) => {
          if (now > data.resetTime) overlayRateLimiter.delete(ip);
        });
      }
      
      const { query } = req.body;
      
      if (!query || typeof query !== 'string' || query.trim().length < 2) {
        return res.status(400).json({ error: "Please enter an item name" });
      }
      
      const searchQuery = query.trim();
      
      // Infer category from query for better results
      const categoryInference = inferCategory(searchQuery);
      const category = categoryInference.category || 'Electronics';
      
      // Get sold comps - this uses the eBay Marketplace Insights API
      const compsResult = await getSoldCompsWithCache(searchQuery, category);
      
      if (!compsResult || compsResult.comps.length === 0) {
        return res.json({
          title: searchQuery,
          marketValue: null,
          lowPrice: null,
          highPrice: null,
          avgPrice: null,
          sampleSize: 0,
          source: "no_data",
          category: category,
          condition: "Used",
          error: "No recent sales data found for this item"
        });
      }
      
      // Calculate price statistics
      const prices = compsResult.comps.map(c => c.soldPrice).filter((p): p is number => p !== null && p !== undefined);
      const lowPrice = prices.length > 0 ? Math.min(...prices) : null;
      const highPrice = prices.length > 0 ? Math.max(...prices) : null;
      const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
      
      res.json({
        title: searchQuery,
        marketValue: compsResult.medianPrice,
        lowPrice,
        highPrice,
        avgPrice,
        sampleSize: compsResult.comps.length,
        source: compsResult.source,
        category: category,
        condition: "Used",
      });
    } catch (err: any) {
      console.error("Stream overlay lookup error:", err);
      res.status(500).json({ error: "Failed to lookup item" });
    }
  });

  // ============================================
  // HOTTEST ITEMS API
  // ============================================
  
  // Get hottest items across all categories (public, no auth required)
  app.get("/api/hottest", async (_req, res) => {
    try {
      const hottestItems = await storage.getHottestItems(10);
      res.json(hottestItems);
    } catch (err: any) {
      console.error("Error fetching hottest items:", err);
      res.status(500).json({ message: "Failed to fetch hottest items" });
    }
  });
  
  // Get hottest items by category
  app.get("/api/hottest/:category", async (req, res) => {
    try {
      const { category } = req.params;
      const hottestItems = await storage.getHottestByCategory(category, 5);
      res.json(hottestItems);
    } catch (err: any) {
      console.error("Error fetching hottest items by category:", err);
      res.status(500).json({ message: "Failed to fetch hottest items" });
    }
  });

  // ============================================
  // VISUAL MATCHING LIBRARY API
  // ============================================

  const { 
    findVisualMatches, 
    confirmMatch, 
    getLibraryStats, 
    createLibraryItem, 
    addLibraryImage,
    getLibraryItems 
  } = await import('./visual-matching');

  // Start a visual matching scan
  app.post("/api/scan/start", requireAuth, async (req: any, res) => {
    try {
      const { category, imageUrl, imageBase64 } = req.body;
      
      if (!category || !['watch', 'shoe', 'card'].includes(category)) {
        return res.status(400).json({ message: "Invalid category. Must be 'watch', 'shoe', or 'card'" });
      }
      
      if (!imageUrl && !imageBase64) {
        return res.status(400).json({ message: "Either imageUrl or imageBase64 is required" });
      }

      const imageInput = imageBase64 || imageUrl;
      const result = await findVisualMatches(imageInput, category, req.user.id);
      
      res.json({
        sessionId: result.sessionId,
        topMatches: result.topMatches,
        decision: result.decision,
        autoSelectedItem: result.autoSelectedItem,
        bestScore: result.bestScore,
        scoreGap: result.scoreGap,
        libraryImageCount: result.libraryImageCount,
        requiresUserChoice: result.decision === 'user_required' || result.decision === 'no_confident_match' || result.decision === 'library_building',
      });
    } catch (err: any) {
      console.error("Visual match error:", err);
      if (err.message?.includes('JINA_API_KEY')) {
        return res.status(503).json({ 
          message: "Visual matching not configured. Please add JINA_API_KEY.",
          fallbackToVision: true 
        });
      }
      res.status(500).json({ message: err.message || "Visual matching failed" });
    }
  });

  // Confirm a visual match (user selects the correct item)
  app.post("/api/scan/confirm", requireAuth, async (req: any, res) => {
    try {
      const { sessionId, chosenItemId, addToLibrary = true } = req.body;
      
      if (!sessionId || !chosenItemId) {
        return res.status(400).json({ message: "sessionId and chosenItemId are required" });
      }

      const result = await confirmMatch(sessionId, chosenItemId, addToLibrary);
      res.json(result);
    } catch (err: any) {
      console.error("Confirm match error:", err);
      res.status(500).json({ message: err.message || "Failed to confirm match" });
    }
  });

  // User-Selected Comps Mode: Search eBay sold listings for manual selection
  app.post("/api/user-comps/search", requireAuth, async (req: any, res) => {
    try {
      const { query, minPrice, maxPrice } = req.body;
      
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({ 
          success: false,
          message: "Search query is required" 
        });
      }

      console.log(`[UserComps] Searching for: "${query}"`);
      
      const result = await soldListingsProvider.search(query.trim(), {
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        limit: 30
      });

      res.json(result);
    } catch (err: any) {
      console.error("[UserComps] Search error:", err);
      res.status(500).json({ 
        success: false,
        listings: [],
        totalResults: 0,
        query: req.body.query || '',
        error: err.message || "Failed to search sold listings" 
      });
    }
  });

  // User-Selected Comps Mode: Calculate pricing from selected listings
  app.post("/api/user-comps/calculate", requireAuth, async (req: any, res) => {
    try {
      const { selectedListings, buyPrice, shippingIn = 0 } = req.body;
      
      if (!Array.isArray(selectedListings) || selectedListings.length < 3) {
        return res.status(400).json({ 
          success: false,
          message: "At least 3 sold listings must be selected" 
        });
      }

      if (buyPrice === undefined || buyPrice === null || Number(buyPrice) < 0) {
        return res.status(400).json({ 
          success: false,
          message: "Buy price is required" 
        });
      }

      // Calculate average sold price from selected listings
      const totalPrices = selectedListings.map((l: UserSelectableListing) => l.totalPrice);
      const avgSoldPrice = totalPrices.reduce((a: number, b: number) => a + b, 0) / totalPrices.length;
      
      // Use median for internal calculation (more robust)
      const sortedPrices = [...totalPrices].sort((a, b) => a - b);
      const medianSoldPrice = sortedPrices.length % 2 === 0
        ? (sortedPrices[sortedPrices.length / 2 - 1] + sortedPrices[sortedPrices.length / 2]) / 2
        : sortedPrices[Math.floor(sortedPrices.length / 2)];

      // Use LOCKED MATH constants
      const platformFeeRate = 0.13; // 13% platform fee
      const fixedCosts = 5; // $5 fixed costs
      const outboundShipping = 8; // Default outbound shipping estimate

      const buyPriceNum = Number(buyPrice);
      const shippingInNum = Number(shippingIn) || 0;
      
      // Calculate using average for display (user expectation)
      const expectedSalePrice = avgSoldPrice;
      const totalCost = buyPriceNum + shippingInNum + fixedCosts + outboundShipping;
      const platformFee = expectedSalePrice * platformFeeRate;
      const netProfit = expectedSalePrice - totalCost - platformFee;
      const marginPercent = expectedSalePrice > 0 ? (netProfit / expectedSalePrice) * 100 : 0;

      // MANUAL pricing mode: No verdict, no confidence, no learning
      // This data is excluded from analytics and training
      res.json({
        success: true,
        pricing: {
          expectedSalePrice: Math.round(expectedSalePrice * 100) / 100,
          medianPrice: Math.round(medianSoldPrice * 100) / 100,
          lowComp: Math.min(...totalPrices),
          highComp: Math.max(...totalPrices),
          compsCount: selectedListings.length,
        },
        calculation: {
          buyPrice: buyPriceNum,
          shippingIn: shippingInNum,
          fixedCosts,
          outboundShipping,
          platformFee: Math.round(platformFee * 100) / 100,
          totalCost: Math.round(totalCost * 100) / 100,
          netProfit: Math.round(netProfit * 100) / 100,
          marginPercent: Math.round(marginPercent * 10) / 10,
        },
        pricingMode: 'MANUAL',
        source: 'user_selected_comps',
        excludeFromAnalytics: true,
      });
    } catch (err: any) {
      console.error("[UserComps] Calculate error:", err);
      res.status(500).json({ 
        success: false,
        message: err.message || "Failed to calculate pricing" 
      });
    }
  });

  // Open Market Search: Same as user-comps but branded for "Other" category catch-all
  app.post("/api/open-market/search", requireAuth, async (req: any, res) => {
    try {
      const { query, minPrice, maxPrice } = req.body;
      
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({ 
          success: false,
          message: "Search query is required" 
        });
      }

      console.log(`[OpenMarket] Searching for: "${query}"`);
      
      const result = await soldListingsProvider.search(query.trim(), {
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        limit: 30
      });

      res.json(result);
    } catch (err: any) {
      console.error("[OpenMarket] Search error:", err);
      res.status(500).json({ 
        success: false,
        listings: [],
        totalResults: 0,
        query: req.body.query || '',
        error: err.message || "Failed to search sold listings" 
      });
    }
  });

  // Open Market Calculate: Same as user-comps calculate
  app.post("/api/open-market/calculate", requireAuth, async (req: any, res) => {
    try {
      const { selectedListings, buyPrice, shippingIn = 0 } = req.body;
      
      if (!Array.isArray(selectedListings) || selectedListings.length < 3) {
        return res.status(400).json({ 
          success: false,
          message: "At least 3 sold listings must be selected" 
        });
      }

      if (buyPrice === undefined || buyPrice === null || Number(buyPrice) < 0) {
        return res.status(400).json({ 
          success: false,
          message: "Buy price is required" 
        });
      }

      const totalPrices = selectedListings.map((l: any) => l.totalPrice);
      const avgSoldPrice = totalPrices.reduce((a: number, b: number) => a + b, 0) / totalPrices.length;
      
      const sortedPrices = [...totalPrices].sort((a: number, b: number) => a - b);
      const medianSoldPrice = sortedPrices.length % 2 === 0
        ? (sortedPrices[sortedPrices.length / 2 - 1] + sortedPrices[sortedPrices.length / 2]) / 2
        : sortedPrices[Math.floor(sortedPrices.length / 2)];

      const platformFeeRate = 0.13;
      const fixedCosts = 5;
      const outboundShipping = 8;

      const buyPriceNum = Number(buyPrice);
      const shippingInNum = Number(shippingIn) || 0;
      
      const expectedSalePrice = avgSoldPrice;
      const totalCost = buyPriceNum + shippingInNum + fixedCosts + outboundShipping;
      const platformFee = expectedSalePrice * platformFeeRate;
      const netProfit = expectedSalePrice - totalCost - platformFee;
      const marginPercent = expectedSalePrice > 0 ? (netProfit / expectedSalePrice) * 100 : 0;

      res.json({
        success: true,
        pricing: {
          expectedSalePrice: Math.round(expectedSalePrice * 100) / 100,
          medianPrice: Math.round(medianSoldPrice * 100) / 100,
          lowComp: Math.min(...totalPrices),
          highComp: Math.max(...totalPrices),
          compsCount: selectedListings.length,
        },
        calculation: {
          buyPrice: buyPriceNum,
          shippingIn: shippingInNum,
          fixedCosts,
          outboundShipping,
          platformFee: Math.round(platformFee * 100) / 100,
          totalCost: Math.round(totalCost * 100) / 100,
          netProfit: Math.round(netProfit * 100) / 100,
          marginPercent: Math.round(marginPercent * 10) / 10,
        },
        pricingMode: 'MANUAL',
        source: 'open_market',
        excludeFromAnalytics: true,
      });
    } catch (err: any) {
      console.error("[OpenMarket] Calculate error:", err);
      res.status(500).json({ 
        success: false,
        message: err.message || "Failed to calculate pricing" 
      });
    }
  });

  // Get library statistics
  app.get("/api/library/stats", async (req, res) => {
    try {
      const category = req.query.category as string | undefined;
      const validCategory = category && ['watch', 'shoe', 'card'].includes(category) 
        ? category as 'watch' | 'shoe' | 'card' 
        : undefined;
      
      const stats = await getLibraryStats(validCategory);
      res.json(stats);
    } catch (err: any) {
      console.error("Library stats error:", err);
      res.status(500).json({ message: err.message || "Failed to get library stats" });
    }
  });

  // Watch Photo Database: Get seed report
  app.get("/api/watch-db/report", async (req, res) => {
    try {
      const report = await getWatchSeedReport();
      res.json(report);
    } catch (err: any) {
      console.error("Watch seed report error:", err);
      res.status(500).json({ message: err.message || "Failed to get watch seed report" });
    }
  });

  // Watch Photo Database: Populate queue from seed file (admin only)
  app.post("/api/watch-db/populate-queue", requireAdmin, async (req: any, res) => {
    try {
      const count = await populateQueueFromSeedFile();
      res.json({ success: true, queuedCount: count });
    } catch (err: any) {
      console.error("Populate queue error:", err);
      res.status(500).json({ message: err.message || "Failed to populate queue" });
    }
  });

  // Watch Photo Database: Run seeder worker (admin only)
  app.post("/api/watch-db/run-seeder", requireAdmin, async (req: any, res) => {
    try {
      const maxItems = parseInt(req.body.maxItems) || undefined;
      res.json({ message: "Seeder started in background", maxItems });
      runSeederWorker(maxItems).catch(err => console.error("Seeder error:", err));
    } catch (err: any) {
      console.error("Run seeder error:", err);
      res.status(500).json({ message: err.message || "Failed to run seeder" });
    }
  });

  // Watch Photo Database: eBay seeder report
  app.get("/api/watch-db/ebay-report", async (req, res) => {
    try {
      const report = await getEbaySeederReport();
      res.json(report);
    } catch (err: any) {
      console.error("eBay seed report error:", err);
      res.status(500).json({ message: err.message || "Failed to get eBay seed report" });
    }
  });

  // Watch Photo Database: Run eBay seeder (admin only)
  app.post("/api/watch-db/run-ebay-seeder", requireAdmin, async (req: any, res) => {
    try {
      res.json({ message: "eBay seeder started in background" });
      runEbayImageSeeder().catch(err => console.error("eBay seeder error:", err));
    } catch (err: any) {
      console.error("Run eBay seeder error:", err);
      res.status(500).json({ message: err.message || "Failed to run eBay seeder" });
    }
  });

  // Shoe Photo Database: Get seeder report
  app.get("/api/shoe-db/report", async (req, res) => {
    try {
      const report = await getShoeSeederReport();
      res.json(report);
    } catch (err: any) {
      console.error("Shoe seed report error:", err);
      res.status(500).json({ message: err.message || "Failed to get shoe seed report" });
    }
  });

  // Shoe Photo Database: Run seeder (admin only)
  app.post("/api/shoe-db/run-seeder", requireAdmin, async (req: any, res) => {
    try {
      res.json({ message: "Shoe seeder started in background" });
      runShoeImageSeeder().catch(err => console.error("Shoe seeder error:", err));
    } catch (err: any) {
      console.error("Run shoe seeder error:", err);
      res.status(500).json({ message: err.message || "Failed to run shoe seeder" });
    }
  });

  // Gaming Photo Database: Get seeder report
  app.get("/api/gaming-db/report", async (req, res) => {
    try {
      const report = await getGamingSeederReport();
      res.json(report);
    } catch (err: any) {
      console.error("Gaming seed report error:", err);
      res.status(500).json({ message: err.message || "Failed to get gaming seed report" });
    }
  });

  // Gaming Photo Database: Run seeder (admin only)
  app.post("/api/gaming-db/run-seeder", requireAdmin, async (req: any, res) => {
    try {
      res.json({ message: "Gaming seeder started in background" });
      runGamingImageSeeder().catch(err => console.error("Gaming seeder error:", err));
    } catch (err: any) {
      console.error("Run gaming seeder error:", err);
      res.status(500).json({ message: err.message || "Failed to run gaming seeder" });
    }
  });

  // Game Photo Database: Get seeder report
  app.get("/api/game-db/report", async (req, res) => {
    try {
      const report = await getGameSeederReport();
      res.json(report);
    } catch (err: any) {
      console.error("Game seed report error:", err);
      res.status(500).json({ message: err.message || "Failed to get game seed report" });
    }
  });

  // Game Photo Database: Run seeder (admin only)
  app.post("/api/game-db/run-seeder", requireAdmin, async (req: any, res) => {
    try {
      res.json({ message: "Game seeder started in background" });
      runGameImageSeeder().catch(err => console.error("Game seeder error:", err));
    } catch (err: any) {
      console.error("Run game seeder error:", err);
      res.status(500).json({ message: err.message || "Failed to run game seeder" });
    }
  });

  // Tool Photo Database: Get seeder report
  app.get("/api/tool-db/report", async (req, res) => {
    try {
      const report = await getToolSeederReport();
      res.json(report);
    } catch (err: any) {
      console.error("Tool seed report error:", err);
      res.status(500).json({ message: err.message || "Failed to get tool seed report" });
    }
  });

  // Tool Photo Database: Run seeder (admin only)
  app.post("/api/tool-db/run-seeder", requireAdmin, async (req: any, res) => {
    try {
      res.json({ message: "Tool seeder started in background" });
      runToolImageSeeder().catch(err => console.error("Tool seeder error:", err));
    } catch (err: any) {
      console.error("Run tool seeder error:", err);
      res.status(500).json({ message: err.message || "Failed to run tool seeder" });
    }
  });

  // Handbag Photo Database: Get seeder report
  app.get("/api/handbag-db/report", async (req, res) => {
    try {
      const report = await getHandbagSeederReport();
      res.json(report);
    } catch (err: any) {
      console.error("Handbag seed report error:", err);
      res.status(500).json({ message: err.message || "Failed to get handbag seed report" });
    }
  });

  // Handbag Photo Database: Run seeder (admin only)
  app.post("/api/handbag-db/run-seeder", requireAdmin, async (req: any, res) => {
    try {
      res.json({ message: "Handbag seeder started in background" });
      runHandbagImageSeeder().catch(err => console.error("Handbag seeder error:", err));
    } catch (err: any) {
      console.error("Run handbag seeder error:", err);
      res.status(500).json({ message: err.message || "Failed to run handbag seeder" });
    }
  });

  // Antique Photo Database: Get seeder report
  app.get("/api/antique-db/report", async (req, res) => {
    try {
      const report = await getAntiqueSeederReport();
      res.json(report);
    } catch (err: any) {
      console.error("Antique seed report error:", err);
      res.status(500).json({ message: err.message || "Failed to get antique seed report" });
    }
  });

  // Antique Photo Database: Run seeder (admin only)
  app.post("/api/antique-db/run-seeder", requireAdmin, async (req: any, res) => {
    try {
      res.json({ message: "Antique seeder started in background" });
      runAntiqueImageSeeder().catch(err => console.error("Antique seeder error:", err));
    } catch (err: any) {
      console.error("Run antique seeder error:", err);
      res.status(500).json({ message: err.message || "Failed to run antique seeder" });
    }
  });

  // Get library items (with optional category filter)
  app.get("/api/library/items", async (req, res) => {
    try {
      const category = req.query.category as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const validCategory = category && ['watch', 'shoe', 'card'].includes(category) 
        ? category as 'watch' | 'shoe' | 'card' 
        : undefined;
      
      const items = await getLibraryItems(validCategory, limit, offset);
      res.json(items);
    } catch (err: any) {
      console.error("Library items error:", err);
      res.status(500).json({ message: err.message || "Failed to get library items" });
    }
  });

  // Admin: Create a new library item
  app.post("/api/admin/library/item", requireAdmin, async (req: any, res) => {
    try {
      const { category, title, brand, modelFamily, modelName, variant, attributes } = req.body;
      
      if (!category || !['watch', 'shoe', 'card'].includes(category)) {
        return res.status(400).json({ message: "Invalid category" });
      }
      if (!title) {
        return res.status(400).json({ message: "Title is required" });
      }

      const item = await createLibraryItem({
        category,
        title,
        brand,
        modelFamily,
        modelName,
        variant,
        attributes,
      });
      
      res.json(item);
    } catch (err: any) {
      console.error("Create library item error:", err);
      res.status(500).json({ message: err.message || "Failed to create library item" });
    }
  });

  // Admin: Add image to a library item
  app.post("/api/admin/library/item/:id/images", requireAdmin, async (req: any, res) => {
    try {
      const itemId = parseInt(req.params.id);
      const { imageUrl, imageType } = req.body;
      
      if (!imageUrl) {
        return res.status(400).json({ message: "imageUrl is required" });
      }

      const image = await addLibraryImage(itemId, imageUrl, imageType);
      res.json(image);
    } catch (err: any) {
      console.error("Add library image error:", err);
      if (err.message?.includes('JINA_API_KEY')) {
        return res.status(503).json({ message: "Embedding service not configured. Please add JINA_API_KEY." });
      }
      res.status(500).json({ message: err.message || "Failed to add library image" });
    }
  });

  // Admin: Seed library with initial data
  app.post("/api/admin/library/seed", requireAdmin, async (req: any, res) => {
    try {
      const { seedLibrary } = await import('./seed-library');
      const result = await seedLibrary();
      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error("Seed library error:", err);
      res.status(500).json({ message: err.message || "Failed to seed library" });
    }
  });

  // Admin: Get visual matching library seeding status
  app.get("/api/admin/seeder/status", requireAdmin, async (req: any, res) => {
    try {
      const statuses = await getCategoryStatuses();
      printSeedingStatus(statuses);
      
      const totalImages = statuses.reduce((sum, s) => sum + s.totalImages, 0);
      const totalTarget = statuses.reduce((sum, s) => sum + s.targetImages, 0);
      
      res.json({
        categories: statuses,
        overall: {
          totalImages,
          targetImages: totalTarget,
          percentComplete: Math.round((totalImages / totalTarget) * 100),
        }
      });
    } catch (err: any) {
      console.error("Seeder status error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // Admin: Turbo activate all queued families
  app.post("/api/admin/seeder/turbo-activate", requireAdmin, async (req: any, res) => {
    try {
      const results = await turboActivateAll();
      console.log("[TURBO] Activated all queued families:", results);
      res.json({ success: true, activated: results });
    } catch (err: any) {
      console.error("Turbo activate error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // Admin: Reset hard families to try again
  app.post("/api/admin/seeder/reset-hard", requireAdmin, async (req: any, res) => {
    try {
      const results = await resetHardFamilies();
      console.log("[TURBO] Reset hard families:", results);
      res.json({ success: true, reset: results });
    } catch (err: any) {
      console.error("Reset hard families error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // Admin: Trigger all seeders to run now
  app.post("/api/admin/seeder/run-all", requireAdmin, async (req: any, res) => {
    try {
      console.log("[TURBO] Starting all seeders...");
      
      runEbayImageSeeder().catch(err => console.error("Watch seeder error:", err));
      runShoeImageSeeder().catch(err => console.error("Shoe seeder error:", err));
      runGamingImageSeeder().catch(err => console.error("Gaming seeder error:", err));
      runToolImageSeeder().catch(err => console.error("Tool seeder error:", err));
      runHandbagImageSeeder().catch(err => console.error("Handbag seeder error:", err));
      runAntiqueImageSeeder().catch(err => console.error("Antique seeder error:", err));
      
      const { runVintageImageSeeder } = await import('./vintage-image-seeder');
      runVintageImageSeeder().catch(err => console.error("Vintage seeder error:", err));
      
      const { runElectronicsImageSeeder } = await import('./electronics-image-seeder');
      runElectronicsImageSeeder().catch(err => console.error("Electronics seeder error:", err));
      
      const { runToyImageSeeder } = await import('./toy-image-seeder');
      runToyImageSeeder().catch(err => console.error("Toy seeder error:", err));
      
      const { runSerpApiCollectiblesSeeder } = await import('./serpapi-collectibles-seeder');
      runSerpApiCollectiblesSeeder().catch(err => console.error("Collectibles seeder error:", err));
      
      res.json({ success: true, message: "All seeders started" });
    } catch (err: any) {
      console.error("Run all seeders error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // Admin: Seed collectibles using SerpAPI (comics, vinyl, vintage games, action figures)
  app.post("/api/admin/seeder/collectibles", requireAdmin, async (req: any, res) => {
    try {
      console.log("[SEEDER] Starting SerpAPI collectibles seeder...");
      const { runSerpApiCollectiblesSeeder, seedNewCollectibleCategories } = await import('./serpapi-collectibles-seeder');
      
      // First ensure new collectible categories exist
      await seedNewCollectibleCategories();
      
      // Then run the image seeder
      const result = await runSerpApiCollectiblesSeeder();
      
      res.json({ 
        success: true, 
        message: "Collectibles seeder completed",
        ...result 
      });
    } catch (err: any) {
      console.error("Collectibles seeder error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // Admin: Backfill embeddings for images missing them
  app.post("/api/admin/embeddings/backfill", requireAdmin, async (req: any, res) => {
    try {
      const { category, batchSize = 50 } = req.body;
      
      const categoryTables: Record<string, { images: string; families: string }> = {
        watch: { images: 'watch_images', families: 'watch_families' },
        shoe: { images: 'shoe_images', families: 'shoe_families' },
        handbag: { images: 'handbag_images', families: 'handbag_families' },
        gaming: { images: 'gaming_images', families: 'gaming_families' },
        electronics: { images: 'electronics_images', families: 'electronics_families' },
        toy: { images: 'toy_images', families: 'toy_families' },
        antique: { images: 'antique_images', families: 'antique_families' },
        tool: { images: 'tool_images', families: 'tool_families' },
        vintage: { images: 'vintage_images', families: 'vintage_families' },
        cards: { images: 'card_images', families: 'card_families' },
      };
      
      const tables = categoryTables[category?.toLowerCase()];
      if (!tables) {
        return res.status(400).json({ message: `Invalid category: ${category}` });
      }
      
      // Get count of images missing embeddings
      const countResult = await db.execute(
        sql`SELECT COUNT(*) as missing FROM ${sql.raw(tables.images)} WHERE embedding IS NULL AND original_url IS NOT NULL`
      );
      const missingCount = Number((countResult.rows[0] as any)?.missing || 0);
      
      if (missingCount === 0) {
        return res.json({ success: true, message: `No images missing embeddings in ${category}`, processed: 0 });
      }
      
      // Start background job
      res.json({ 
        success: true, 
        message: `Starting embedding backfill for ${category}`,
        missingCount,
        batchSize
      });
      
      // Process in background
      (async () => {
        const { generateImageEmbedding } = await import('./embedding-service');
        
        let processed = 0;
        let failed = 0;
        
        // Process in batches
        while (processed + failed < missingCount) {
          try {
            const batch = await db.execute(
              sql`SELECT id, original_url FROM ${sql.raw(tables.images)} 
                  WHERE embedding IS NULL AND original_url IS NOT NULL 
                  LIMIT ${batchSize}`
            );
            
            if (batch.rows.length === 0) break;
            
            for (const row of batch.rows as any[]) {
              try {
                const { embedding } = await generateImageEmbedding(row.original_url);
                
                await db.execute(
                  sql`UPDATE ${sql.raw(tables.images)} 
                      SET embedding = ${JSON.stringify(embedding)}::vector 
                      WHERE id = ${row.id}`
                );
                
                processed++;
                if (processed % 10 === 0) {
                  console.log(`[Backfill ${category}] Processed ${processed}/${missingCount}, failed: ${failed}`);
                }
                
                // Rate limit: 100ms between requests
                await new Promise(r => setTimeout(r, 100));
              } catch (err: any) {
                failed++;
                console.error(`[Backfill ${category}] Failed image ${row.id}:`, err.message);
              }
            }
          } catch (err: any) {
            console.error(`[Backfill ${category}] Batch error:`, err.message);
            break;
          }
        }
        
        console.log(`[Backfill ${category}] Complete: ${processed} processed, ${failed} failed`);
      })();
      
    } catch (err: any) {
      console.error("Backfill embeddings error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // Admin: Scrape images from a website URL
  app.post("/api/admin/library/scrape-images", requireAdmin, async (req: any, res) => {
    try {
      const { url } = req.body;
      
      if (!url || !url.startsWith('http')) {
        return res.status(400).json({ message: "Valid URL required" });
      }

      // SSRF protection: block private/internal IPs and metadata endpoints
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return res.status(400).json({ message: "Invalid URL format" });
      }

      const hostname = parsedUrl.hostname.toLowerCase();
      
      // Block localhost, private networks, and cloud metadata endpoints
      const blockedPatterns = [
        /^localhost$/i,
        /^127\./,
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^192\.168\./,
        /^0\./,
        /^169\.254\./,
        /^metadata\.google/i,
        /^metadata\.aws/i,
        /\.internal$/i,
        /\.local$/i,
      ];
      
      if (blockedPatterns.some(pattern => pattern.test(hostname))) {
        return res.status(400).json({ message: "URL not allowed for security reasons" });
      }

      console.log(`[Scraper] Fetching images from: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(30000)
      });

      if (!response.ok) {
        return res.status(400).json({ message: `Failed to fetch page: ${response.status}` });
      }

      const html = await response.text();
      const images: string[] = [];
      
      // Extract image URLs from various patterns
      const patterns = [
        /src=["']([^"']+\.(jpg|jpeg|png|webp)[^"']*)/gi,
        /data-src=["']([^"']+\.(jpg|jpeg|png|webp)[^"']*)/gi,
        /srcset=["']([^"'\s]+\.(jpg|jpeg|png|webp)[^"'\s]*)/gi,
        /content=["']([^"']+\.(jpg|jpeg|png|webp)[^"']*)/gi,
        /(https?:\/\/[^"'\s<>]+\.(jpg|jpeg|png|webp))/gi,
      ];

      const baseUrl = new URL(url);
      const seenUrls = new Set<string>();

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
          let imgUrl = match[1];
          
          // Handle relative URLs
          if (imgUrl.startsWith('//')) {
            imgUrl = 'https:' + imgUrl;
          } else if (imgUrl.startsWith('/')) {
            imgUrl = baseUrl.origin + imgUrl;
          } else if (!imgUrl.startsWith('http')) {
            imgUrl = new URL(imgUrl, url).href;
          }

          // Filter out tiny icons, thumbnails, logos
          if (imgUrl.includes('icon') || imgUrl.includes('logo') || imgUrl.includes('thumb') ||
              imgUrl.includes('1x1') || imgUrl.includes('pixel') || imgUrl.includes('spacer') ||
              imgUrl.includes('favicon') || imgUrl.includes('sprite')) {
            continue;
          }

          if (!seenUrls.has(imgUrl)) {
            seenUrls.add(imgUrl);
            images.push(imgUrl);
          }
        }
      }

      console.log(`[Scraper] Found ${images.length} images`);
      res.json({ images: images.slice(0, 100) });
    } catch (err: any) {
      console.error("Scrape images error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // Admin: Bulk add images to a category family by URLs
  app.post("/api/admin/library/bulk-upload", requireAdmin, async (req: any, res) => {
    try {
      const { category, familyId, imageUrls } = req.body;
      
      if (!category || !familyId || !Array.isArray(imageUrls) || imageUrls.length === 0) {
        return res.status(400).json({ message: "category, familyId, and imageUrls array required" });
      }

      const jinaKey = process.env.JINA_API_KEY;
      if (!jinaKey) {
        return res.status(503).json({ message: "JINA_API_KEY not configured" });
      }

      const crypto = await import('crypto');
      const results = { added: 0, skipped: 0, errors: [] as string[] };

      for (const url of imageUrls.slice(0, 25)) {
        try {
          // Validate image URL
          const imgResponse = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(15000)
          });
          
          if (!imgResponse.ok) {
            results.errors.push(`Failed to fetch: ${url.substring(0, 50)}...`);
            continue;
          }

          const contentType = imgResponse.headers.get('content-type') || '';
          if (!contentType.includes('image')) {
            results.errors.push(`Not an image: ${url.substring(0, 50)}...`);
            continue;
          }

          const buffer = await imgResponse.arrayBuffer();
          if (buffer.byteLength < 5000) {
            results.errors.push(`Image too small: ${url.substring(0, 50)}...`);
            continue;
          }

          const hash = crypto.createHash('sha256').update(Buffer.from(buffer)).digest('hex');

          // Generate Jina embedding
          const jinaResponse = await fetch('https://api.jina.ai/v1/embeddings', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${jinaKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'jina-clip-v2',
              input: [{ image: url }]
            })
          });

          if (!jinaResponse.ok) {
            results.errors.push(`Embedding failed: ${url.substring(0, 50)}...`);
            continue;
          }

          const jinaData = await jinaResponse.json();
          const embedding = jinaData.data?.[0]?.embedding;
          if (!embedding) {
            results.errors.push(`No embedding returned: ${url.substring(0, 50)}...`);
            continue;
          }

          // Insert based on category
          if (category === 'gaming') {
            const existing = await db.select().from(gamingImages).where(eq(gamingImages.sha256, hash)).limit(1);
            if (existing.length > 0) { results.skipped++; continue; }
            await db.insert(gamingImages).values({
              familyId: parseInt(familyId),
              sha256: hash,
              storagePath: url,
              originalUrl: url,
              fileSize: buffer.byteLength,
              width: 400, height: 400,
              contentType: contentType,
              embedding,
              source: 'admin_upload',
              qualityScore: '1.0'
            });
          } else if (category === 'antique') {
            const existing = await db.select().from(antiqueImages).where(eq(antiqueImages.sha256, hash)).limit(1);
            if (existing.length > 0) { results.skipped++; continue; }
            await db.insert(antiqueImages).values({
              familyId: parseInt(familyId),
              sha256: hash,
              storagePath: url,
              originalUrl: url,
              fileSize: buffer.byteLength,
              width: 400, height: 400,
              contentType: contentType,
              embedding,
              source: 'admin_upload',
              qualityScore: '1.0'
            });
          } else if (category === 'electronics') {
            const existing = await db.select().from(electronicsImages).where(eq(electronicsImages.sha256, hash)).limit(1);
            if (existing.length > 0) { results.skipped++; continue; }
            await db.insert(electronicsImages).values({
              familyId: parseInt(familyId),
              sha256: hash,
              storagePath: url,
              originalUrl: url,
              fileSize: buffer.byteLength,
              width: 400, height: 400,
              contentType: contentType,
              embedding,
              source: 'admin_upload',
              qualityScore: '1.0'
            });
          } else if (category === 'toy') {
            const existing = await db.select().from(toyImages).where(eq(toyImages.sha256, hash)).limit(1);
            if (existing.length > 0) { results.skipped++; continue; }
            await db.insert(toyImages).values({
              familyId: parseInt(familyId),
              sha256: hash,
              storagePath: url,
              originalUrl: url,
              fileSize: buffer.byteLength,
              width: 400, height: 400,
              contentType: contentType,
              embedding,
              source: 'admin_upload',
              qualityScore: '1.0'
            });
          } else {
            results.errors.push(`Unknown category: ${category}`);
            continue;
          }

          results.added++;
        } catch (err: any) {
          results.errors.push(`Error: ${err.message?.substring(0, 50) || 'Unknown'}`);
        }
      }

      res.json(results);
    } catch (err: any) {
      console.error("Bulk upload error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // Admin: Auto-seed images using SerpAPI Google Images
  app.post("/api/admin/library/auto-seed-serpapi", requireAdmin, async (req: any, res) => {
    try {
      const serpApiKey = process.env.SERPAPI_KEY;
      const jinaKey = process.env.JINA_API_KEY;
      
      if (!serpApiKey) {
        return res.status(503).json({ message: "SERPAPI_KEY not configured" });
      }
      if (!jinaKey) {
        return res.status(503).json({ message: "JINA_API_KEY not configured" });
      }

      console.log("[SerpAPI Seeder] Starting auto-seed for all blocked categories...");
      
      // Get families with < 10 images from all 4 categories
      const familiesToSeed: { category: string; id: number; name: string }[] = [];
      
      const gamingFams = await db.select({ id: gamingFamilies.id, name: gamingFamilies.displayName })
        .from(gamingFamilies).where(eq(gamingFamilies.status, 'active')).limit(10);
      for (const f of gamingFams) {
        const count = await db.select({ c: sql<number>`count(*)` }).from(gamingImages).where(eq(gamingImages.familyId, f.id));
        if (Number(count[0]?.c || 0) < 10) familiesToSeed.push({ category: 'gaming', ...f });
      }
      
      const antiqueFams = await db.select({ id: antiqueFamilies.id, name: antiqueFamilies.displayName })
        .from(antiqueFamilies).where(eq(antiqueFamilies.status, 'active')).limit(10);
      for (const f of antiqueFams) {
        const count = await db.select({ c: sql<number>`count(*)` }).from(antiqueImages).where(eq(antiqueImages.familyId, f.id));
        if (Number(count[0]?.c || 0) < 10) familiesToSeed.push({ category: 'antique', ...f });
      }
      
      const electronicsFams = await db.select({ id: electronicsFamilies.id, name: electronicsFamilies.displayName })
        .from(electronicsFamilies).where(eq(electronicsFamilies.status, 'active')).limit(10);
      for (const f of electronicsFams) {
        const count = await db.select({ c: sql<number>`count(*)` }).from(electronicsImages).where(eq(electronicsImages.familyId, f.id));
        if (Number(count[0]?.c || 0) < 10) familiesToSeed.push({ category: 'electronics', ...f });
      }
      
      const toyFams = await db.select({ id: toyFamilies.id, name: toyFamilies.displayName })
        .from(toyFamilies).where(eq(toyFamilies.status, 'active')).limit(10);
      for (const f of toyFams) {
        const count = await db.select({ c: sql<number>`count(*)` }).from(toyImages).where(eq(toyImages.familyId, f.id));
        if (Number(count[0]?.c || 0) < 10) familiesToSeed.push({ category: 'toy', ...f });
      }

      console.log(`[SerpAPI Seeder] Found ${familiesToSeed.length} families needing images`);
      
      // Limit to first 20 to conserve API credits
      const toProcess = familiesToSeed.slice(0, 20);
      const results = { searched: 0, imagesAdded: 0, errors: [] as string[] };
      const crypto = await import('crypto');

      for (const family of toProcess) {
        try {
          console.log(`[SerpAPI] Searching: ${family.name} (${family.category})`);
          
          // Search Google Images via SerpAPI
          const searchUrl = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(family.name + " product")}&num=15&api_key=${serpApiKey}`;
          const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(30000) });
          
          if (!searchRes.ok) {
            results.errors.push(`Search failed for ${family.name}: ${searchRes.status}`);
            continue;
          }
          
          const searchData = await searchRes.json();
          const imageResults = searchData.images_results || [];
          results.searched++;

          // Process up to 10 images per family
          let addedForFamily = 0;
          for (const img of imageResults.slice(0, 10)) {
            if (addedForFamily >= 5) break;
            
            const imgUrl = img.original || img.thumbnail;
            if (!imgUrl) continue;

            try {
              // Fetch and validate image
              const imgRes = await fetch(imgUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                signal: AbortSignal.timeout(10000)
              });
              if (!imgRes.ok) continue;

              const contentType = imgRes.headers.get('content-type') || '';
              if (!contentType.includes('image')) continue;

              const buffer = await imgRes.arrayBuffer();
              if (buffer.byteLength < 10000) continue;

              const hash = crypto.createHash('sha256').update(Buffer.from(buffer)).digest('hex');

              // Generate embedding
              const jinaRes = await fetch('https://api.jina.ai/v1/embeddings', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${jinaKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'jina-clip-v1', input: [{ image: imgUrl }] })
              });
              if (!jinaRes.ok) continue;

              const jinaData = await jinaRes.json();
              const embedding = jinaData.data?.[0]?.embedding;
              if (!embedding) continue;

              // Insert based on category
              const insertData = {
                familyId: family.id,
                sha256: hash,
                storagePath: imgUrl,
                originalUrl: imgUrl,
                fileSize: buffer.byteLength,
                width: 400, height: 400,
                contentType,
                embedding,
                source: 'serpapi_google',
                qualityScore: '0.9'
              };

              if (family.category === 'gaming') {
                const exists = await db.select().from(gamingImages).where(eq(gamingImages.sha256, hash)).limit(1);
                if (exists.length === 0) {
                  await db.insert(gamingImages).values(insertData);
                  addedForFamily++;
                  results.imagesAdded++;
                }
              } else if (family.category === 'antique') {
                const exists = await db.select().from(antiqueImages).where(eq(antiqueImages.sha256, hash)).limit(1);
                if (exists.length === 0) {
                  await db.insert(antiqueImages).values(insertData);
                  addedForFamily++;
                  results.imagesAdded++;
                }
              } else if (family.category === 'electronics') {
                const exists = await db.select().from(electronicsImages).where(eq(electronicsImages.sha256, hash)).limit(1);
                if (exists.length === 0) {
                  await db.insert(electronicsImages).values(insertData);
                  addedForFamily++;
                  results.imagesAdded++;
                }
              } else if (family.category === 'toy') {
                const exists = await db.select().from(toyImages).where(eq(toyImages.sha256, hash)).limit(1);
                if (exists.length === 0) {
                  await db.insert(toyImages).values(insertData);
                  addedForFamily++;
                  results.imagesAdded++;
                }
              }
            } catch (imgErr) {
              // Skip failed images silently
            }
          }
          
          console.log(`[SerpAPI] Added ${addedForFamily} images for ${family.name}`);
          
          // Small delay between searches
          await new Promise(r => setTimeout(r, 500));
        } catch (err: any) {
          results.errors.push(`${family.name}: ${err.message}`);
        }
      }

      console.log(`[SerpAPI Seeder] Complete: ${results.searched} searches, ${results.imagesAdded} images added`);
      res.json(results);
    } catch (err: any) {
      console.error("SerpAPI seeder error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // Admin: Get families needing images for a category
  app.get("/api/admin/library/families-needing-images", requireAdmin, async (req: any, res) => {
    try {
      const { category } = req.query;
      
      let families: any[] = [];
      
      if (category === 'gaming' || !category) {
        const gaming = await db.select({
          id: gamingFamilies.id,
          name: gamingFamilies.displayName,
          subcategory: gamingFamilies.subcategory,
          status: gamingFamilies.status,
        }).from(gamingFamilies).where(eq(gamingFamilies.status, 'active')).limit(20);
        
        for (const f of gaming) {
          const imgs = await db.select({ count: sql<number>`count(*)` }).from(gamingImages).where(eq(gamingImages.familyId, f.id));
          families.push({ ...f, category: 'gaming', imageCount: Number(imgs[0]?.count || 0) });
        }
      }
      
      if (category === 'antique' || !category) {
        const antiques = await db.select({
          id: antiqueFamilies.id,
          name: antiqueFamilies.displayName,
          subcategory: antiqueFamilies.subcategory,
          status: antiqueFamilies.status,
        }).from(antiqueFamilies).where(eq(antiqueFamilies.status, 'active')).limit(20);
        
        for (const f of antiques) {
          const imgs = await db.select({ count: sql<number>`count(*)` }).from(antiqueImages).where(eq(antiqueImages.familyId, f.id));
          families.push({ ...f, category: 'antique', imageCount: Number(imgs[0]?.count || 0) });
        }
      }
      
      if (category === 'electronics' || !category) {
        const electronics = await db.select({
          id: electronicsFamilies.id,
          name: electronicsFamilies.displayName,
          subcategory: electronicsFamilies.subcategory,
          status: electronicsFamilies.status,
        }).from(electronicsFamilies).where(eq(electronicsFamilies.status, 'active')).limit(20);
        
        for (const f of electronics) {
          const imgs = await db.select({ count: sql<number>`count(*)` }).from(electronicsImages).where(eq(electronicsImages.familyId, f.id));
          families.push({ ...f, category: 'electronics', imageCount: Number(imgs[0]?.count || 0) });
        }
      }
      
      if (category === 'toy' || !category) {
        const toys = await db.select({
          id: toyFamilies.id,
          name: toyFamilies.displayName,
          subcategory: toyFamilies.subcategory,
          status: toyFamilies.status,
        }).from(toyFamilies).where(eq(toyFamilies.status, 'active')).limit(20);
        
        for (const f of toys) {
          const imgs = await db.select({ count: sql<number>`count(*)` }).from(toyImages).where(eq(toyImages.familyId, f.id));
          families.push({ ...f, category: 'toy', imageCount: Number(imgs[0]?.count || 0) });
        }
      }
      
      // Sort by lowest image count first
      families.sort((a, b) => a.imageCount - b.imageCount);
      
      res.json(families);
    } catch (err: any) {
      console.error("Get families error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // Admin: Get CATEGORY_COMPLETE status for all categories
  app.get("/api/admin/library/category-status", requireAdmin, async (req: any, res) => {
    try {
      // CATEGORY_COMPLETE thresholds
      const THRESHOLDS: Record<string, number> = {
        shoes: 100, watches: 100, handbags: 100,
        toys: 200, gaming: 200, antiques: 200, vintage_clothing: 200,
        electronics: 300, tools: 300,
      };
      
      const categories: any[] = [];
      
      // Get counts for each category (excluding serp_bootstrap from quotas)
      const queries = [
        { name: 'shoes', table: 'shoe_images' },
        { name: 'watches', table: 'watch_images' },
        { name: 'handbags', table: 'handbag_images' },
        { name: 'toys', table: 'toy_images' },
        { name: 'gaming', table: 'gaming_images' },
        { name: 'antiques', table: 'antique_images' },
        { name: 'electronics', table: 'electronics_images' },
        { name: 'tools', table: 'tool_images' },
        { name: 'vintage_clothing', table: 'vintage_images' },
      ];
      
      for (const q of queries) {
        try {
          const total = await db.execute(sql`SELECT COUNT(*) as c FROM ${sql.raw(q.table)} WHERE embedding IS NOT NULL`);
          const nonBootstrap = await db.execute(sql`SELECT COUNT(*) as c FROM ${sql.raw(q.table)} WHERE embedding IS NOT NULL AND (source IS NULL OR source != 'serp_bootstrap')`);
          
          const totalCount = Number(total.rows[0]?.c || 0);
          const nonBootstrapCount = Number(nonBootstrap.rows[0]?.c || 0);
          const threshold = THRESHOLDS[q.name] || 200;
          const isComplete = totalCount >= threshold;
          
          categories.push({
            name: q.name,
            totalImages: totalCount,
            nonBootstrapImages: nonBootstrapCount,
            bootstrapImages: totalCount - nonBootstrapCount,
            threshold,
            status: isComplete ? 'CATEGORY_COMPLETE' : 'building',
            percentComplete: Math.min(100, Math.round((totalCount / threshold) * 100)),
            canSeedCategory: !isComplete,
          });
        } catch (e) {
          // Table might not exist
          categories.push({
            name: q.name,
            totalImages: 0,
            threshold: THRESHOLDS[q.name] || 200,
            status: 'building',
            percentComplete: 0,
            canSeedCategory: true,
          });
        }
      }
      
      res.json({
        categories,
        summary: {
          complete: categories.filter(c => c.status === 'CATEGORY_COMPLETE').length,
          building: categories.filter(c => c.status === 'building').length,
          totalImages: categories.reduce((sum, c) => sum + c.totalImages, 0),
        }
      });
    } catch (err: any) {
      console.error("Category status error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // Universal SerpAPI Seeder - seed all categories with Google Images via SerpAPI
  app.get("/api/admin/serpapi/stats", requireAdmin, async (req: any, res) => {
    try {
      const { getCategoryImageStats } = await import('./universal-serpapi-seeder');
      const stats = await getCategoryImageStats();
      res.json(stats);
    } catch (err: any) {
      console.error("SerpAPI stats error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/serpapi/seed/:category", requireAdmin, async (req: any, res) => {
    try {
      const { category } = req.params;
      const maxFamilies = req.body.maxFamilies || 20;
      
      const { seedCategoryWithSerpAPI } = await import('./universal-serpapi-seeder');
      const result = await seedCategoryWithSerpAPI(category, maxFamilies);
      
      res.json({
        success: true,
        category,
        ...result
      });
    } catch (err: any) {
      console.error("SerpAPI seed error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/serpapi/seed-all", requireAdmin, async (req: any, res) => {
    try {
      const { seedAllCategoriesWithSerpAPI } = await import('./universal-serpapi-seeder');
      const results = await seedAllCategoriesWithSerpAPI();
      
      res.json({
        success: true,
        results
      });
    } catch (err: any) {
      console.error("SerpAPI seed-all error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // ========== ELITE-ONLY FEATURES: Tax Reports & Data Export ==========
  
  // Helper to check Elite access
  const requireElite = async (req: any, res: any, next: any) => {
    const user = await storage.getUser((req.user as { id: number }).id);
    if (user?.subscriptionTier !== 'elite' && !user?.isAdmin) {
      return res.status(403).json({ 
        message: "This feature is available only to Elite subscribers. Upgrade to unlock tax reports and data export." 
      });
    }
    next();
  };

  // Export scan history as CSV
  app.get('/api/export/csv', requireAuth, requireElite, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { startDate, endDate, category } = req.query;
      
      // Get all user's items
      let allItems = await db.select().from(items)
        .where(eq(items.userId, userId))
        .orderBy(desc(items.createdAt));
      
      // Apply filters
      if (startDate) {
        allItems = allItems.filter(item => 
          item.createdAt && new Date(item.createdAt) >= new Date(startDate as string)
        );
      }
      if (endDate) {
        allItems = allItems.filter(item => 
          item.createdAt && new Date(item.createdAt) <= new Date(endDate as string)
        );
      }
      if (category && category !== 'all') {
        allItems = allItems.filter(item => item.category === category);
      }
      
      // Generate CSV headers
      const headers = [
        'Date',
        'Title',
        'Category',
        'Condition',
        'Buy Price',
        'Expected Sale Price',
        'Estimated Profit',
        'Margin %',
        'Decision',
        'Verdict'
      ];
      
      // Generate CSV rows
      const rows = allItems.map(item => {
        const buyPrice = item.buyPrice ? parseFloat(item.buyPrice.toString()) : 0;
        const flipPrice = item.flipPrice ? parseFloat(item.flipPrice.toString()) : 0;
        const profit = flipPrice - buyPrice;
        const margin = flipPrice > 0 ? ((profit / flipPrice) * 100).toFixed(1) : '0';
        
        return [
          item.createdAt ? new Date(item.createdAt).toISOString().split('T')[0] : '',
          `"${(item.confirmedTitle || item.title || '').replace(/"/g, '""')}"`,
          item.category || 'Other',
          item.condition || 'Unknown',
          buyPrice.toFixed(2),
          flipPrice.toFixed(2),
          profit.toFixed(2),
          margin,
          item.userDecision || 'pending',
          item.decisionVerdict || item.recommendation || ''
        ];
      });
      
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="margin-export-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv);
    } catch (err: any) {
      console.error("CSV export error:", err);
      res.status(500).json({ message: "Failed to export data" });
    }
  });

  // Tax report summary
  app.get('/api/export/tax-report', requireAuth, requireElite, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { year } = req.query;
      const reportYear = year ? parseInt(year as string) : new Date().getFullYear();
      
      // Get all items from the specified year
      const startOfYear = new Date(reportYear, 0, 1);
      const endOfYear = new Date(reportYear, 11, 31, 23, 59, 59);
      
      const yearItems = await db.select().from(items)
        .where(eq(items.userId, userId))
        .orderBy(desc(items.createdAt));
      
      const filteredItems = yearItems.filter(item => {
        if (!item.createdAt) return false;
        const itemDate = new Date(item.createdAt);
        return itemDate >= startOfYear && itemDate <= endOfYear;
      });
      
      // Calculate tax-relevant metrics
      const flips = filteredItems.filter(item => item.userDecision === 'flip');
      const skips = filteredItems.filter(item => item.userDecision === 'skip');
      
      let totalCost = 0;
      let totalRevenue = 0;
      let totalProfit = 0;
      let totalFees = 0;
      
      const categoryBreakdown: Record<string, { count: number; cost: number; revenue: number; profit: number }> = {};
      const monthlyBreakdown: Record<string, { count: number; cost: number; revenue: number; profit: number }> = {};
      
      flips.forEach(item => {
        const buyPrice = item.buyPrice ? parseFloat(item.buyPrice.toString()) : 0;
        const flipPrice = item.flipPrice ? parseFloat(item.flipPrice.toString()) : 0;
        const profit = flipPrice - buyPrice;
        const fees = flipPrice * 0.13; // Platform fees
        
        totalCost += buyPrice;
        totalRevenue += flipPrice;
        totalProfit += profit;
        totalFees += fees;
        
        // Category breakdown
        const cat = item.category || 'Other';
        if (!categoryBreakdown[cat]) {
          categoryBreakdown[cat] = { count: 0, cost: 0, revenue: 0, profit: 0 };
        }
        categoryBreakdown[cat].count++;
        categoryBreakdown[cat].cost += buyPrice;
        categoryBreakdown[cat].revenue += flipPrice;
        categoryBreakdown[cat].profit += profit;
        
        // Monthly breakdown
        if (item.createdAt) {
          const month = new Date(item.createdAt).toLocaleString('default', { month: 'short', year: 'numeric' });
          if (!monthlyBreakdown[month]) {
            monthlyBreakdown[month] = { count: 0, cost: 0, revenue: 0, profit: 0 };
          }
          monthlyBreakdown[month].count++;
          monthlyBreakdown[month].cost += buyPrice;
          monthlyBreakdown[month].revenue += flipPrice;
          monthlyBreakdown[month].profit += profit;
        }
      });
      
      res.json({
        year: reportYear,
        summary: {
          totalScans: filteredItems.length,
          totalFlips: flips.length,
          totalSkips: skips.length,
          totalCost: parseFloat(totalCost.toFixed(2)),
          totalRevenue: parseFloat(totalRevenue.toFixed(2)),
          totalProfit: parseFloat(totalProfit.toFixed(2)),
          totalFees: parseFloat(totalFees.toFixed(2)),
          netIncome: parseFloat((totalProfit - totalFees).toFixed(2)),
          averageMargin: totalRevenue > 0 ? parseFloat(((totalProfit / totalRevenue) * 100).toFixed(1)) : 0,
        },
        categoryBreakdown: Object.entries(categoryBreakdown).map(([name, data]) => ({
          category: name,
          ...data,
          cost: parseFloat(data.cost.toFixed(2)),
          revenue: parseFloat(data.revenue.toFixed(2)),
          profit: parseFloat(data.profit.toFixed(2)),
        })),
        monthlyBreakdown: Object.entries(monthlyBreakdown).map(([month, data]) => ({
          month,
          ...data,
          cost: parseFloat(data.cost.toFixed(2)),
          revenue: parseFloat(data.revenue.toFixed(2)),
          profit: parseFloat(data.profit.toFixed(2)),
        })),
        disclaimer: "This report is for informational purposes only. Consult a tax professional for official tax advice.",
      });
    } catch (err: any) {
      console.error("Tax report error:", err);
      res.status(500).json({ message: "Failed to generate tax report" });
    }
  });

  // Download tax report as PDF (simplified - returns structured data for client-side PDF generation)
  app.get('/api/export/tax-report/download', requireAuth, requireElite, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      const { year } = req.query;
      const reportYear = year ? parseInt(year as string) : new Date().getFullYear();
      
      // Get tax report data
      const startOfYear = new Date(reportYear, 0, 1);
      const endOfYear = new Date(reportYear, 11, 31, 23, 59, 59);
      
      const yearItems = await db.select().from(items)
        .where(eq(items.userId, userId))
        .orderBy(desc(items.createdAt));
      
      const filteredItems = yearItems.filter(item => {
        if (!item.createdAt) return false;
        const itemDate = new Date(item.createdAt);
        return itemDate >= startOfYear && itemDate <= endOfYear;
      });
      
      const flips = filteredItems.filter(item => item.userDecision === 'flip');
      
      let totalCost = 0;
      let totalRevenue = 0;
      
      flips.forEach(item => {
        const buyPrice = item.buyPrice ? parseFloat(item.buyPrice.toString()) : 0;
        const flipPrice = item.flipPrice ? parseFloat(item.flipPrice.toString()) : 0;
        totalCost += buyPrice;
        totalRevenue += flipPrice;
      });
      
      const totalProfit = totalRevenue - totalCost;
      const totalFees = totalRevenue * 0.13;
      
      // Generate plain text report for download
      const reportText = `
MARGIN TAX SUMMARY REPORT
=========================
Year: ${reportYear}
Generated: ${new Date().toISOString()}
User: ${user?.username || 'Unknown'}

SUMMARY
-------
Total Scans: ${filteredItems.length}
Total Flips: ${flips.length}
Total Cost of Goods: $${totalCost.toFixed(2)}
Total Revenue: $${totalRevenue.toFixed(2)}
Total Gross Profit: $${totalProfit.toFixed(2)}
Estimated Platform Fees: $${totalFees.toFixed(2)}
Estimated Net Income: $${(totalProfit - totalFees).toFixed(2)}

ITEM DETAILS
------------
${flips.map(item => {
  const buyPrice = item.buyPrice ? parseFloat(item.buyPrice.toString()) : 0;
  const flipPrice = item.flipPrice ? parseFloat(item.flipPrice.toString()) : 0;
  return `${item.createdAt ? new Date(item.createdAt).toISOString().split('T')[0] : 'N/A'} | ${item.confirmedTitle || item.title || 'Unknown'} | Cost: $${buyPrice.toFixed(2)} | Sale: $${flipPrice.toFixed(2)}`;
}).join('\n')}

DISCLAIMER
----------
This report is for informational purposes only and should not be considered tax advice.
Please consult with a qualified tax professional for your specific tax situation.
Margin does not provide tax, legal, or accounting advice.
      `.trim();
      
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="margin-tax-report-${reportYear}.txt"`);
      res.send(reportText);
    } catch (err: any) {
      console.error("Tax report download error:", err);
      res.status(500).json({ message: "Failed to download tax report" });
    }
  });

  // =========================================================================
  // MERCARI API TEST ENDPOINTS
  // =========================================================================
  
  // =========================================================================
  // COMPS CACHE STATS ENDPOINT
  // =========================================================================
  
  app.get("/api/comps/stats", requireAuth, async (_req, res) => {
    try {
      const stats = soldListingsProvider.getCacheStats();
      const totalRequests = stats.totalCacheHits + stats.totalLiveRequests;
      res.json({
        success: true,
        ...stats,
        status: totalRequests > 0 
          ? `${stats.primaryCacheSize} cached queries, ${stats.hitRate} hit rate` 
          : 'No requests yet'
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  
  app.post("/api/comps/clear-cache", requireAdmin, async (_req, res) => {
    try {
      soldListingsProvider.clearCache();
      res.json({ success: true, message: "Cache cleared" });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  
  app.get("/api/mercari/test", async (_req, res) => {
    try {
      const { testMercariConnection } = await import("./mercari-api");
      const result = await testMercariConnection();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });
  
  app.get("/api/mercari/search", async (req, res) => {
    try {
      const { searchMercariSoldItems } = await import("./mercari-api");
      const keyword = req.query.keyword as string;
      
      if (!keyword) {
        return res.status(400).json({ success: false, error: "keyword is required" });
      }
      
      const limit = parseInt(req.query.limit as string) || 20;
      const minPrice = req.query.minPrice ? parseInt(req.query.minPrice as string) : undefined;
      const maxPrice = req.query.maxPrice ? parseInt(req.query.maxPrice as string) : undefined;
      
      const result = await searchMercariSoldItems(keyword, { limit, minPrice, maxPrice });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return httpServer;
}
