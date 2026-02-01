import { pgTable, text, serial, integer, boolean, timestamp, jsonb, numeric, date, vector, index, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============ IDENTIFICATION PIPELINE - 5-STAGE GATING ============
// Stage 1: Object-Type Classification (HARD GATE - must lock before proceeding)
export const ObjectType = {
  FUNKO_POP: 'FUNKO_POP',
  LEGO_SET: 'LEGO_SET', 
  TRADING_CARD: 'TRADING_CARD',
  WATCH: 'WATCH',
  SHOE: 'SHOE',
  HANDBAG: 'HANDBAG',
  CLOTHING: 'CLOTHING',
  TOOL: 'TOOL',
  ELECTRONICS: 'ELECTRONICS',
  GAMING: 'GAMING',
  GENERIC_COLLECTIBLE: 'GENERIC_COLLECTIBLE',
} as const;
export type ObjectType = typeof ObjectType[keyof typeof ObjectType];

// Confidence tiers for UI rendering
export const ConfidenceTier = {
  LOW: 'LOW',           // <60% - Generic label only, manual entry
  MEDIUM: 'MEDIUM',     // 60-79% - Object-type + brand only, no item names
  HIGH: 'HIGH',         // 80-89% - Up to 3 candidates, "Select the correct item"
  CONFIRMED: 'CONFIRMED', // ≥90% - Auto-confirm single item
} as const;
export type ConfidenceTier = typeof ConfidenceTier[keyof typeof ConfidenceTier];

// Pipeline stage results
export interface PipelineStage1Result {
  objectType: ObjectType;
  confidence: number;
  signals: string[];
  isForced: boolean; // True if deterministic rules forced this type
}

export interface PipelineStage2Result {
  brand: string | null;
  confidence: number;
  compatibleWithObjectType: boolean;
}

export interface PipelineStage3Result {
  line: string | null;
  series: string | null;
  confidence: number;
}

export interface PipelineStage4Result {
  candidates: Array<{
    id: string;
    title: string;
    familyId?: number;
    confidence: number;
    keyIdentifiers: string[];
  }>;
  topConfidence: number;
}

export interface PipelineStage5Result {
  aggregatedConfidence: number;
  confidenceTier: ConfidenceTier;
  displayLabel: string;
  canShowItemName: boolean;
  canAutoConfirm: boolean;
  requiresUserSelection: boolean;
}

export interface IdentificationPipelineResult {
  stage1: PipelineStage1Result;
  stage2: PipelineStage2Result;
  stage3: PipelineStage3Result;
  stage4: PipelineStage4Result;
  stage5: PipelineStage5Result;
  finalConfidence: number;
  pipelineLocked: boolean;
}

// Funko Pop deterministic detection signals
export const FUNKO_POP_SIGNALS = [
  'POP_LOGO',           // Visible "POP!" logo
  'FUNKO_TEXT',         // Visible "Funko" text
  'NUMBER_BADGE',       // Top-right circular number badge (#xxx)
  'DISPLAY_WINDOW',     // Large clear front display window
  'CHARACTER_ILLUSTRATION', // Character illustration on box panel
  'CHARACTER_NAME',     // Character name printed on box
  'VINYL_FIGURE_TEXT',  // "Vinyl Figure" or "Figurine en vinyle" text
] as const;
export type FunkoPopSignal = typeof FUNKO_POP_SIGNALS[number];

// Confidence thresholds (LOCKED - do not modify)
export const CONFIDENCE_THRESHOLDS = {
  LOW_MAX: 0.60,        // Below this = generic label only
  MEDIUM_MAX: 0.80,     // Below this = type + brand only
  HIGH_MAX: 0.90,       // Below this = candidates with selection
  AUTO_CONFIRM: 0.90,   // At or above = auto-confirm
} as const;

export const subscriptionTiers = ['free', 'pro', 'elite'] as const;
export type SubscriptionTier = typeof subscriptionTiers[number];

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  phone: text("phone"), // optional, for forgot password backup
  password: text("password").notNull(),
  subscriptionTier: text("subscription_tier").notNull().default('free'),
  isAdmin: boolean("is_admin").notNull().default(false),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  referralCode: text("referral_code").unique(), // unique code for sharing
  referredBy: integer("referred_by").references((): AnyPgColumn => users.id), // who referred this user
  createdAt: timestamp("created_at").defaultNow(),
  // Category-specific profit percentage settings for batch scanning
  categoryProfitPercents: jsonb("category_profit_percents").$type<Record<string, number>>(),
  // OAuth provider IDs for social login
  googleId: text("google_id").unique(),
  appleId: text("apple_id").unique(),
  profileImageUrl: text("profile_image_url"),
});

// Password reset tokens for forgot password flow
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Push notification subscriptions
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({
  id: true,
  createdAt: true,
});
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;

// Track daily scan counts per user
export const dailyScans = pgTable("daily_scans", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  scanDate: date("scan_date").notNull(),
  count: integer("count").notNull().default(0),
  arCount: integer("ar_count").notNull().default(0),
});

// ============ GAMIFICATION SYSTEM ============
// Achievement definitions (static list of possible badges)
export const AchievementType = {
  FIRST_SCAN: 'FIRST_SCAN',
  FIRST_FLIP: 'FIRST_FLIP',
  TEN_FLIPS: 'TEN_FLIPS',
  FIFTY_FLIPS: 'FIFTY_FLIPS',
  HUNDRED_FLIPS: 'HUNDRED_FLIPS',
  FIRST_100_PROFIT: 'FIRST_100_PROFIT',
  FIRST_500_PROFIT: 'FIRST_500_PROFIT',
  FIRST_1000_PROFIT: 'FIRST_1000_PROFIT',
  STREAK_3: 'STREAK_3',
  STREAK_7: 'STREAK_7',
  STREAK_30: 'STREAK_30',
  BATCH_MASTER: 'BATCH_MASTER', // 50+ items in batch mode
  CATEGORY_EXPERT_SHOES: 'CATEGORY_EXPERT_SHOES',
  CATEGORY_EXPERT_WATCHES: 'CATEGORY_EXPERT_WATCHES',
  CATEGORY_EXPERT_CARDS: 'CATEGORY_EXPERT_CARDS',
  SHARP_EYE: 'SHARP_EYE', // Found an item worth 5x+ asking
  WHALE_FINDER: 'WHALE_FINDER', // Found an item with $500+ profit potential
  QUICK_DRAW: 'QUICK_DRAW', // 10 scans in under 5 minutes
} as const;
export type AchievementType = typeof AchievementType[keyof typeof AchievementType];

// User achievements earned
export const userAchievements = pgTable("user_achievements", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  achievementType: text("achievement_type").notNull(),
  earnedAt: timestamp("earned_at").defaultNow(),
  metadata: jsonb("metadata").$type<Record<string, any>>(), // extra context (item that triggered it, etc)
}, (table) => ({
  userAchievementUnique: uniqueIndex("user_achievement_unique_idx").on(table.userId, table.achievementType),
}));

export const insertUserAchievementSchema = createInsertSchema(userAchievements).omit({
  id: true,
  earnedAt: true,
});
export type UserAchievement = typeof userAchievements.$inferSelect;
export type InsertUserAchievement = z.infer<typeof insertUserAchievementSchema>;

// User stats for gamification (aggregated counters)
export const userStats = pgTable("user_stats", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  totalScans: integer("total_scans").notNull().default(0),
  totalFlips: integer("total_flips").notNull().default(0),
  totalSkips: integer("total_skips").notNull().default(0),
  totalProfitPotential: numeric("total_profit_potential").default("0"), // sum of all flip profits identified
  currentStreak: integer("current_streak").notNull().default(0), // consecutive days with scans
  longestStreak: integer("longest_streak").notNull().default(0),
  lastActiveDate: date("last_active_date"),
  quickestBatchTime: integer("quickest_batch_time"), // fastest batch completion in seconds
  largestSingleProfit: numeric("largest_single_profit").default("0"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserStatsSchema = createInsertSchema(userStats).omit({
  id: true,
  updatedAt: true,
});
export type UserStats = typeof userStats.$inferSelect;
export type InsertUserStats = z.infer<typeof insertUserStatsSchema>;

// Daily profit goals
export const profitGoals = pgTable("profit_goals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  goalDate: date("goal_date").notNull(),
  targetAmount: numeric("target_amount").notNull(), // daily goal amount
  currentAmount: numeric("current_amount").notNull().default("0"), // progress toward goal
  flipsToday: integer("flips_today").notNull().default(0),
  scansToday: integer("scans_today").notNull().default(0),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userDateUnique: uniqueIndex("profit_goals_user_date_idx").on(table.userId, table.goalDate),
}));

export const insertProfitGoalSchema = createInsertSchema(profitGoals).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});
export type ProfitGoal = typeof profitGoals.$inferSelect;
export type InsertProfitGoal = z.infer<typeof insertProfitGoalSchema>;

export const items = pgTable("items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  url: text("url").notNull(),
  title: text("title"),
  price: text("price"), 
  shipping: text("shipping"), 
  condition: text("condition"),
  analysis: text("analysis").notNull(), 
  confidence: integer("confidence").notNull(), 
  explanation: text("explanation").notNull(),
  rawAnalysis: jsonb("raw_analysis"),
  createdAt: timestamp("created_at").defaultNow(),
  
  // Aligning with existing DB schema columns
  confirmedTitle: text("confirmed_title"),
  buyPrice: numeric("buy_price"),
  shippingIn: numeric("shipping_in"),
  platformFeeRate: numeric("platform_fee_rate"),
  outboundShipping: numeric("outbound_shipping"),
  lowComp: numeric("low_comp"),
  avgComp: numeric("avg_comp"),
  highComp: numeric("high_comp"),
  tax: numeric("tax"),
  category: text("category"),
  scanMode: text("scan_mode"), // "flip" (reseller) | "buy" (collector)
  recommendation: text("recommendation"),
  userDecision: text("user_decision"),
  expiresAt: timestamp("expires_at"), // null = never expires (Pro), set for Free tier (7 days)
  manualCompPrices: jsonb("manual_comp_prices"), // array of positive numbers (max 5)
  compSource: text("comp_source"), // "api" (Marketplace Insights) | "browse" (Browse API) | "manual" | "none"
  flipPrice: numeric("flip_price"), // actual sale price when item is flipped/sold
  
  // Margin-Based Decision Engine data
  decisionVerdict: text("decision_verdict"), // "flip" | "skip" (margin-based, ≥25% = flip)
  decisionScore: integer("decision_score"), // confidence 0-100
  decisionData: jsonb("decision_data"), // DecisionResult with marginPercent
  
  // Watch Recognition Library fields (assistive, user-editable)
  watchBrand: text("watch_brand"), // e.g., "seiko", "rolex" - from watchLibrary
  watchFamily: text("watch_family"), // e.g., "prospex_diver", "submariner" - style family
  watchBandType: text("watch_band_type"), // e.g., "oyster", "leather" - band/bracelet type
  watchCaseSize: text("watch_case_size"), // e.g., "42mm" or "Unknown" - user-selected only
  watchMovementType: text("watch_movement_type"), // "quartz" | "automatic" | "manual" | "unknown"
  watchWearAssessment: text("watch_wear_assessment"), // "clean" | "moderate" | "heavy" | "unknown"
  watchBoxAndPapers: text("watch_box_and_papers"), // "yes" | "no" | "unknown"
  watchAftermarketFlags: jsonb("watch_aftermarket_flags"), // array of soft flags e.g., ["aftermarket_band", "non_original_dial"]
  watchDialColor: text("watch_dial_color"), // e.g., "black", "blue", "champagne" - detected from dial
  watchDialStyle: text("watch_dial_style"), // e.g., "roman", "arabic", "stick", "diamond"
  watchBezelColor: text("watch_bezel_color"), // e.g., "black", "red", "blue" - bezel insert color
  watchMaterials: text("watch_materials"), // e.g., "stainless steel", "gold-tone", "two-tone"
  
  // Sports Card Recognition fields (graded vs raw workflow)
  cardIsGraded: boolean("card_is_graded"), // true = graded/slabbed, false = raw
  cardGrader: text("card_grader"), // e.g., "psa", "bgs", "sgc" - grading company
  cardGrade: text("card_grade"), // e.g., "10", "9.5", "GEM MT 10"
  cardYear: text("card_year"), // e.g., "2020", "2021-22"
  cardSet: text("card_set"), // e.g., "Topps Chrome", "Prizm"
  cardPlayer: text("card_player"), // Player name
  cardNumber: text("card_number"), // Printed card number in set
  cardParallel: text("card_parallel"), // e.g., "Refractor", "Silver Prizm", "Base"
  cardCertNumber: text("card_cert_number"), // Grading cert number for verification
  cardSerialNumber: text("card_serial_number"), // e.g., "123" from "123/499"
  cardSerialTotal: text("card_serial_total"), // e.g., "499" from "123/499"
  cardImageFrontUrl: text("card_image_front_url"), // Front image for raw cards
  cardImageBackUrl: text("card_image_back_url"), // Back image for raw cards (required for final ID)
  
  // Card Variation System fields (for accurate comp matching)
  cardVariationType: text("card_variation_type"), // "base" | "parallel" | "insert"
  cardVariationName: text("card_variation_name"), // e.g., "Silver Prizm", "Downtown", "Refractor"
  cardVariationFinish: jsonb("card_variation_finish"), // array of finish tags: ["prizm", "silver"]
  cardVariationConfirmed: boolean("card_variation_confirmed"), // user confirmed variation selection
  
  // Grading Readiness Assessment (raw cards only, visual assessment)
  gradingReadiness: jsonb("grading_readiness"), // GradingReadinessResult object
  gradingReadinessAnalyzedAt: timestamp("grading_readiness_analyzed_at"), // when assessment was done
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  phone: true,
  password: true,
  googleId: true,
  appleId: true,
  profileImageUrl: true,
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({
  id: true,
  createdAt: true,
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;

export const insertItemSchema = createInsertSchema(items).omit({
  id: true,
  userId: true,
  createdAt: true,
  analysis: true,
  confidence: true,
  explanation: true,
  rawAnalysis: true,
  confirmedTitle: true,
  buyPrice: true,
  shippingIn: true,
  platformFeeRate: true,
  outboundShipping: true,
  lowComp: true,
  avgComp: true,
  highComp: true,
  tax: true,
  category: true,
  recommendation: true,
});

// Inventory statuses
export const inventoryStatuses = ['bought', 'listed', 'sold'] as const;
export type InventoryStatus = typeof inventoryStatuses[number];

// Inventory items - items user owns or plans to flip
export const inventoryItems = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  itemId: integer("item_id").references(() => items.id), // link to scan, nullable for manual entries
  title: text("title").notNull(),
  imageUrl: text("image_url"),
  brand: text("brand"), // extracted brand for analytics (e.g., "Nike", "Rolex")
  category: text("category"), // category for analytics (e.g., "Shoes", "Watches")
  estimatedResale: numeric("estimated_resale"), // from scan analysis
  purchasePrice: numeric("purchase_price").notNull(),
  feesEstimate: numeric("fees_estimate"), // platform fees estimate
  shippingEstimate: numeric("shipping_estimate"), // outbound shipping estimate
  status: text("status").notNull().default('bought'), // bought | listed | sold
  purchaseDate: timestamp("purchase_date").defaultNow(),
  listedDate: timestamp("listed_date"),
  soldDate: timestamp("sold_date"),
  actualSalePrice: numeric("actual_sale_price"),
  outboundShippingActual: numeric("outbound_shipping_actual"),
  condition: text("condition"),
  notes: text("notes"),
  // Enhanced tracking for analytics and tax
  sourceLocationId: integer("source_location_id"), // where item was purchased (references sourcingLocations)
  sourceLocationName: text("source_location_name"), // denormalized for quick display (e.g., "Goodwill")
  storageLocation: text("storage_location"), // where item is stored (e.g., "Bin A", "Garage shelf 2")
  salePlatform: text("sale_platform"), // 'ebay' | 'mercari' | 'poshmark' | 'facebook' | 'offerup' | 'other'
  platformFeeActual: numeric("platform_fee_actual"), // actual fee charged on sale
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItems).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;

// ============ EXPENSE TRACKING SYSTEM ============
// Expense categories for Schedule C tax reporting
export const expenseCategories = [
  'mileage',           // Vehicle expenses (IRS standard mileage rate)
  'shipping_supplies', // Boxes, tape, labels, etc.
  'platform_fees',     // eBay final value fees, payment processing
  'inventory_cost',    // Cost of goods sold (auto-tracked via inventory)
  'software',          // Tools, subscriptions (Margin Pro, etc.)
  'equipment',         // Camera, phone, scale, etc.
  'office_supplies',   // Printer ink, paper, etc.
  'storage',           // Storage unit, shelving
  'education',         // Courses, books
  'other'              // Miscellaneous
] as const;
export type ExpenseCategory = typeof expenseCategories[number];

// Business expenses for tax tracking
export const businessExpenses = pgTable("business_expenses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  category: text("category").notNull(), // ExpenseCategory
  description: text("description").notNull(), // e.g., "Trip to Goodwill", "Bubble mailers"
  amount: numeric("amount").notNull(), // dollar amount
  date: timestamp("expense_date").notNull().defaultNow(),
  // Mileage-specific fields
  miles: numeric("miles"), // for mileage category only
  mileageRate: numeric("mileage_rate"), // IRS rate used (e.g., 0.67 for 2024)
  startLocation: text("start_location"), // e.g., "Home"
  endLocation: text("end_location"), // e.g., "Goodwill"
  // Receipt/documentation
  receiptUrl: text("receipt_url"), // optional photo of receipt
  notes: text("notes"),
  // Tax year tracking
  taxYear: integer("tax_year").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userYearIdx: index("business_expenses_user_year_idx").on(table.userId, table.taxYear),
  categoryIdx: index("business_expenses_category_idx").on(table.userId, table.category),
}));

export const insertBusinessExpenseSchema = createInsertSchema(businessExpenses).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});
export type BusinessExpense = typeof businessExpenses.$inferSelect;
export type InsertBusinessExpense = z.infer<typeof insertBusinessExpenseSchema>;

// Sourcing locations for analytics (where you find items)
export const sourcingLocations = pgTable("sourcing_locations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(), // e.g., "Goodwill Main St", "Estate Sale"
  type: text("type").notNull(), // 'thrift' | 'estate_sale' | 'yard_sale' | 'auction' | 'online' | 'other'
  address: text("address"), // optional street address
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userNameUnique: uniqueIndex("sourcing_locations_user_name_idx").on(table.userId, table.name),
}));

export const insertSourcingLocationSchema = createInsertSchema(sourcingLocations).omit({
  id: true,
  userId: true,
  createdAt: true,
});
export type SourcingLocation = typeof sourcingLocations.$inferSelect;
export type InsertSourcingLocation = z.infer<typeof insertSourcingLocationSchema>;

// Photo scan sessions for camera-based identification
export const scanSessions = pgTable("scan_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  imageUrl: text("image_url"), // URL to the uploaded image
  status: text("status").notNull().default('pending'), // pending | identifying | confirmed | expired
  candidates: jsonb("candidates"), // array of candidate matches
  confirmedCandidate: jsonb("confirmed_candidate"), // the selected match
  pipelineDebugTrace: jsonb("pipeline_debug_trace"), // Full pipeline debug trace for diagnostics
  createdAt: timestamp("created_at").defaultNow(),
  confirmedAt: timestamp("confirmed_at"),
});

export type ScanSession = typeof scanSessions.$inferSelect;

// Pipeline Debug Trace structure for watches (persisted per scan for diagnostics)
export interface WatchPipelineDebugTrace {
  scanId: number;
  rawInputs: {
    inputType: 'photo' | 'url' | 'upc';
    hasBackImage?: boolean;
  };
  brandStep: {
    top3Brands: Array<{ brand: string; confidence: number }>;
    selectedBrand: string | null;
    winningSignal: string;
  };
  bucketStep: {
    configGroupDetected: string | null;
    bucketSize: number;
    filterStrategy: 'brand+configGroup' | 'brand_only' | 'all';
  };
  modelCandidatesStep: {
    topKModels: Array<{ familyId: number; family: string; score: number }>;
    scoreGap: number | null;
    selectedModel: string | null;
    selectionReason: 'user_confirmed' | 'awaiting_selection' | 'vision_text_match' | 'blocked';
  };
  finalIdentity: {
    brand: string;
    model: string;
    modelNumber: string | null;
    dialColor: string | null;
    identityConfidence: 'HIGH' | 'ESTIMATE' | 'BLOCKED';
    reasonCodes: string[];
  };
  compsQuery: {
    queryString: string;
    negativeKeywords: string[];
    condition: 'NEW' | 'USED' | 'PARTS';
  };
  pricingSummary: {
    soldCount: number;
    timeWindowDays: number;
    medianPrice: number | null;
    p25Price: number | null;
    iqrRange: [number, number] | null;
    cacheHit: boolean;
  };
  decisionSummary: {
    buyPrice: number;
    buyerPaidShipping: boolean;
    feeBaseUsed: number;
    profitDollars: number | null;
    marginPercent: number | null;
    roiPercent: number | null;
    maxBuyPrice: number | null;
    verdict: 'FLIP' | 'SKIP' | 'RISKY' | 'NOT_ENOUGH_INFO';
    reasonCodes: string[];
  };
  timestamp: string;
}

// Supported categories for scanning
export const scanCategories = [
  'Shoes',
  'Watches', 
  'Trading Cards',
  'Collectibles',
  'Electronics',
  'Sports Memorabilia',
  'Other'
] as const;
export type ScanCategory = typeof scanCategories[number];

// Candidate match for photo scan
export interface ScanCandidate {
  id: string;
  title: string;
  category: ScanCategory;
  estimatedValue?: string;
  keyIdentifiers: string[]; // e.g., ["2023 Topps", "Mike Trout", "PSA 10"]
  thumbnailUrl?: string;
  confidence: number; // 0-100
  familyId?: string; // Watch family ID when model is selected from candidates
  visionSignals?: string[]; // Signals from visual analysis
  // Top-level brand from OCR/visual matching (used for watches, etc.)
  brand?: string;
  // Watch color detection from vision - for auto-fill dropdowns
  bezelColor?: string;
  dialColor?: string;
  // Card-specific metadata for parallel lookup
  cardMeta?: {
    brand?: string;    // e.g., "panini", "topps"
    set?: string;      // e.g., "prizm", "chrome"
    year?: number;     // e.g., 2023
    sport?: string;    // e.g., "football", "basketball"
    playerName?: string;
    detectedParallel?: string; // AI-detected parallel, if any
    serialNumber?: string;     // e.g., "7/10" - determines exact parallel
    isAutograph?: boolean;     // true if card has a signature
  };
  // Watch-specific metadata from library matching
  watchMeta?: {
    watchBrand?: string | null;
    watchFamily?: string | null;
    watchBandType?: string | null;
    watchMovementType?: string | null;
    matchConfidence?: number;
    topMatches?: { brand: string; family: string; score: number }[];
  };
  // Vehicle-specific metadata from library matching
  vehicleMeta?: {
    brand?: string | null;
    model?: string | null;
    bodyType?: string | null;
    year?: number | null;
    matchConfidence?: number;
    topMatches?: { brand: string; family: string; score: number }[];
  };
  // Marvel-specific metadata from library matching
  marvelMeta?: {
    character?: string | null;
    series?: string | null;
    collectibleType?: string | null;
    issueNumber?: string | null;
    matchConfidence?: number;
    topMatches?: { character: string; series: string; score: number }[];
  };
  // Watch color selections (user-provided for accurate comp searches)
  dialStyle?: string;   // e.g., "Roman", "Stick", "Arabic"
  // Toy pipeline metadata (5-stage gating)
  source?: string;              // 'toy_pipeline' | 'visual_library' | 'openai'
  matchStrength?: 'strong' | 'moderate' | 'weak';
  requiresManualEntry?: boolean;  // LOW confidence tier
  requiresSelection?: boolean;    // MEDIUM/HIGH confidence tier
  autoConfirmed?: boolean;        // CONFIRMED confidence tier
  pipelineStage?: number;         // Which stage produced this candidate
  // Finalized fields from finalizeScanResult() - use these for UI display
  overallConfidence?: number;     // min(objectTypeConf, brandConf, itemConf) - use for display
  brandDetected?: string | null;  // Locked brand from objectType (Funko, LEGO, etc.)
}

// Cache for sold comps to avoid repeated scraping
export const compsCache = pgTable("comps_cache", {
  id: serial("id").primaryKey(),
  queryKey: text("query_key").notNull().unique(), // hash of title + category
  comps: jsonb("comps").notNull(), // array of comp objects
  lowPrice: numeric("low_price"),
  medianPrice: numeric("median_price"),
  highPrice: numeric("high_price"),
  spreadPercent: numeric("spread_percent"),
  message: text("message"), // reliability warning message
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

// Batch scanning sessions for Pro users
export const batchSessionStatuses = ['active', 'processing', 'completed', 'cancelled'] as const;
export type BatchSessionStatus = typeof batchSessionStatuses[number];

export const batchSessions = pgTable("batch_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  status: text("status").notNull().default('active'), // active | processing | completed | cancelled
  totalItems: integer("total_items").notNull().default(0),
  processedItems: integer("processed_items").notNull().default(0),
  acceptedItems: integer("accepted_items").notNull().default(0),
  skippedItems: integer("skipped_items").notNull().default(0),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const batchItemStatuses = ['pending', 'processing', 'completed', 'failed'] as const;
export type BatchItemStatus = typeof batchItemStatuses[number];

export const batchItems = pgTable("batch_items", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => batchSessions.id),
  userId: integer("user_id").notNull().references(() => users.id),
  inputType: text("input_type").notNull(), // "url" | "camera"
  inputValue: text("input_value").notNull(), // URL or image identifier
  status: text("status").notNull().default('pending'), // pending | processing | completed | failed
  itemId: integer("item_id").references(() => items.id), // linked item after processing
  title: text("title"), // Item title from analysis (e.g., "Invicta Grand Diver")
  buyPrice: numeric("buy_price"), // User-entered cost to buy the item
  maxBuyPrice: numeric("max_buy_price"), // Calculated max buy price for target profit %
  appliedProfitPercent: integer("applied_profit_percent"), // Profit % used (e.g., 30 for 30%)
  priceGuideSource: text("price_guide_source"), // 'sold_comps' = real eBay data, 'estimate' = AI fallback
  decisionVerdict: text("decision_verdict"), // flip | skip (margin-based)
  decisionScore: integer("decision_score"), // 0-100
  marginPercent: numeric("margin_percent"), // Calculated margin percentage
  userAction: text("user_action"), // "accepted" | "skipped" | null (pending action)
  errorMessage: text("error_message"), // if failed
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at"),
});

export type BatchSession = typeof batchSessions.$inferSelect;
export type BatchItem = typeof batchItems.$inferSelect;

// Partner Program commission statuses
export const commissionStatuses = ['pending', 'eligible', 'payable', 'paid', 'void'] as const;
export type CommissionStatus = typeof commissionStatuses[number];

// Partner Program settings (admin-configurable)
export const partnerProgramSettings = pgTable("partner_program_settings", {
  id: serial("id").primaryKey(),
  commissionRate: integer("commission_rate").notNull().default(30), // percentage (30 = 30%)
  minimumPayoutCents: integer("minimum_payout_cents").notNull().default(2500), // $25.00 minimum
  payoutDelayDays: integer("payout_delay_days").notNull().default(45), // 45-day hold
  isActive: boolean("is_active").notNull().default(true), // program on/off toggle
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: integer("updated_by").references(() => users.id),
});

// Partner earnings tracking (expanded for commission lifecycle)
export const affiliateEarnings = pgTable("affiliate_earnings", {
  id: serial("id").primaryKey(),
  affiliateId: integer("affiliate_id").notNull().references(() => users.id), // the partner/referrer
  referredUserId: integer("referred_user_id").notNull().references(() => users.id), // who they referred
  amount: numeric("amount").notNull(), // legacy field (dollars) - kept for backwards compatibility
  amountCents: integer("amount_cents"), // commission amount in cents (new preferred field)
  stripeInvoiceId: text("stripe_invoice_id"), // links to the Stripe invoice that triggered this
  stripeSubscriptionId: text("stripe_subscription_id"), // subscription being tracked
  paymentMonth: text("payment_month").notNull(), // "2026-01" format
  status: text("status").notNull().default('pending'), // pending | eligible | payable | paid | void
  unlockAt: timestamp("unlock_at"), // when commission becomes eligible (45 days after payment)
  paidAt: timestamp("paid_at"),
  voidedAt: timestamp("voided_at"),
  voidReason: text("void_reason"), // "refund" | "chargeback" | "cancellation" | "admin"
  createdAt: timestamp("created_at").defaultNow(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Item = typeof items.$inferSelect;
export type InsertItem = z.infer<typeof insertItemSchema>;
export type DailyScan = typeof dailyScans.$inferSelect;
export type CompsCache = typeof compsCache.$inferSelect;
export type AffiliateEarning = typeof affiliateEarnings.$inferSelect;
export type PartnerProgramSettings = typeof partnerProgramSettings.$inferSelect;

// Comp type for frontend and cross-module compatibility
// CompLike is the flexible interface used by comp-filter and routes
export interface SoldComp {
  soldPrice: number;
  shippingCost: string; // "Free" or numeric
  dateSold: string; // relative or date string
  condition: string;
  totalPrice?: number; // soldPrice + shipping (calculated)
  title?: string; // Comp listing title for filtering
  imageUrl?: string; // Comp image URL
}

// Re-export as CompLike for backward compatibility with comp-filter
export type CompLike = SoldComp;

export interface ConditionStats {
  count: number;
  medianPrice: number | null;
  lowPrice: number | null;
  highPrice: number | null;
}

export interface CompsResult {
  comps: SoldComp[];
  lowPrice: number | null;
  medianPrice: number | null;
  highPrice: number | null;
  spreadPercent: number | null;
  averagePrice?: number | null; // mean of sold prices
  priceRange?: { min: number; max: number } | null;
  variance?: number | null; // price variance for confidence calculation
  message?: string; // for graceful fallback messages
  searchQuery?: string; // the query used to find comps
  source?: 'api' | 'serpapi' | 'finding_api' | 'marketplace_insights' | 'pricecharting' | 'browse' | 'fallback' | 'chrono24' | 'google' | 'none'; // where comps came from
  ebaySearchUrl?: string; // deep-link to eBay sold search
  chrono24SearchUrl?: string; // deep-link to Chrono24 search (watches only)
  // Condition-separated pricing for new vs used items
  conditionStats?: {
    newLike: ConditionStats;
    used: ConditionStats;
  };
  // For watches: cleaned comp count after filtering parts/repair/bundles and IQR outlier trimming
  // Use this for confidence gating instead of comps.length
  cleanedCompCount?: number;
}

// Mystery Flip of the Day - daily random listing for engagement
export const mysteryFlips = pgTable("mystery_flips", {
  id: serial("id").primaryKey(),
  flipDate: date("flip_date").notNull().unique(), // one per day
  ebayItemId: text("ebay_item_id").notNull(),
  title: text("title").notNull(),
  price: text("price").notNull(),
  imageUrl: text("image_url"),
  category: text("category"),
  createdAt: timestamp("created_at").defaultNow(),
});

// User votes on Mystery Flip
export const mysteryFlipVotes = pgTable("mystery_flip_votes", {
  id: serial("id").primaryKey(),
  mysteryFlipId: integer("mystery_flip_id").notNull().references(() => mysteryFlips.id),
  userId: integer("user_id").notNull().references(() => users.id),
  vote: text("vote").notNull(), // "flip" | "skip"
  createdAt: timestamp("created_at").defaultNow(),
});

export type MysteryFlip = typeof mysteryFlips.$inferSelect;
export type MysteryFlipVote = typeof mysteryFlipVotes.$inferSelect;

export const insertMysteryFlipSchema = createInsertSchema(mysteryFlips).omit({
  id: true,
  createdAt: true,
});
export type InsertMysteryFlip = z.infer<typeof insertMysteryFlipSchema>;

export const insertMysteryFlipVoteSchema = createInsertSchema(mysteryFlipVotes).omit({
  id: true,
  createdAt: true,
});
export type InsertMysteryFlipVote = z.infer<typeof insertMysteryFlipVoteSchema>;

// Price Drop Alerts - track items user passed on
export const priceAlerts = pgTable("price_alerts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  itemId: integer("item_id").references(() => items.id), // optional link to scanned item
  ebayItemId: text("ebay_item_id"), // eBay item ID for tracking
  title: text("title").notNull(),
  originalPrice: numeric("original_price").notNull(),
  maxBuyPrice: numeric("max_buy_price"), // user's threshold
  currentPrice: numeric("current_price"),
  lastChecked: timestamp("last_checked"),
  alertTriggered: boolean("alert_triggered").default(false),
  alertTriggeredAt: timestamp("alert_triggered_at"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export type PriceAlert = typeof priceAlerts.$inferSelect;

export const insertPriceAlertSchema = createInsertSchema(priceAlerts).omit({
  id: true,
  createdAt: true,
  lastChecked: true,
  alertTriggered: true,
  alertTriggeredAt: true,
});
export type InsertPriceAlert = z.infer<typeof insertPriceAlertSchema>;

// Brand Library - top brands per category for logo recognition
export const brandLibraryCategories = ['tools', 'shoes', 'electronics', 'gaming', 'apparel'] as const;
export type BrandLibraryCategory = typeof brandLibraryCategories[number];

export const brands = pgTable("brands", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // Display name: "DeWalt", "Nike"
  slug: text("slug").notNull().unique(), // URL-safe: "dewalt", "nike"
  category: text("category").notNull(), // "tools", "shoes", "electronics", "gaming", "apparel"
  logoUrl: text("logo_url"), // Stock photo of logo
  aliases: jsonb("aliases").$type<string[]>(), // Alternative names: ["De Walt", "DEWALT"]
  keywords: jsonb("keywords").$type<string[]>(), // Recognition keywords
  avgResaleMultiplier: numeric("avg_resale_multiplier"), // Typical resale value vs retail
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const brandItems = pgTable("brand_items", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id),
  name: text("name").notNull(), // "20V MAX Drill", "Air Jordan 1"
  modelNumber: text("model_number"), // "DCD771C2", "555088-134"
  imageUrl: text("image_url"), // Stock photo
  typicalResaleLow: numeric("typical_resale_low"),
  typicalResaleHigh: numeric("typical_resale_high"),
  searchKeywords: jsonb("search_keywords").$type<string[]>(), // For eBay comp search
  isTopItem: boolean("is_top_item").default(true), // Top 20 indicator
  createdAt: timestamp("created_at").defaultNow(),
});

export type Brand = typeof brands.$inferSelect;
export type BrandItem = typeof brandItems.$inferSelect;

export const insertBrandSchema = createInsertSchema(brands).omit({
  id: true,
  createdAt: true,
});
export type InsertBrand = z.infer<typeof insertBrandSchema>;

export const insertBrandItemSchema = createInsertSchema(brandItems).omit({
  id: true,
  createdAt: true,
});
export type InsertBrandItem = z.infer<typeof insertBrandItemSchema>;

// Shop Products - Printful integration
export const shopProducts = pgTable("shop_products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  price: numeric("price").notNull(), // Your selling price (includes markup)
  baseCost: numeric("base_cost"), // Printful cost to you
  imageUrl: text("image_url"),
  category: text("category"),
  printfulProductId: text("printful_product_id"), // Printful sync product ID
  printfulVariantId: text("printful_variant_id"), // Specific variant ID
  inStock: boolean("in_stock").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Shop Orders - Track orders sent to Printful
export const shopOrders = pgTable("shop_orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  productId: integer("product_id").notNull().references(() => shopProducts.id),
  quantity: integer("quantity").notNull().default(1),
  totalPrice: numeric("total_price").notNull(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  printfulOrderId: text("printful_order_id"),
  status: text("status").notNull().default("pending"), // pending, paid, submitted, shipped, delivered
  shippingName: text("shipping_name"),
  shippingAddress: text("shipping_address"),
  shippingCity: text("shipping_city"),
  shippingState: text("shipping_state"),
  shippingZip: text("shipping_zip"),
  shippingCountry: text("shipping_country"),
  trackingNumber: text("tracking_number"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type ShopProduct = typeof shopProducts.$inferSelect;
export type ShopOrder = typeof shopOrders.$inferSelect;

export const insertShopProductSchema = createInsertSchema(shopProducts).omit({
  id: true,
  createdAt: true,
});
export type InsertShopProduct = z.infer<typeof insertShopProductSchema>;

export const insertShopOrderSchema = createInsertSchema(shopOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertShopOrder = z.infer<typeof insertShopOrderSchema>;

// Hot Items - tracks trending items by category for "Hottest This Week" display
export const hotItems = pgTable("hot_items", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(), // Electronics, Cards, Watches, etc.
  queryKey: text("query_key").notNull(), // normalized search key for deduplication
  sampleTitle: text("sample_title").notNull(), // display title
  sales7d: integer("sales_7d").notNull().default(0), // sales in last 7 days
  sales30d: integer("sales_30d").notNull().default(0), // sales in last 30 days
  lastSoldAt: timestamp("last_sold_at"), // most recent sale timestamp
  medianPrice: numeric("median_price"), // typical sold price
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertHotItemSchema = createInsertSchema(hotItems).omit({
  id: true,
  updatedAt: true,
});
export type HotItem = typeof hotItems.$inferSelect;
export type InsertHotItem = z.infer<typeof insertHotItemSchema>;

// ============================================
// VISUAL MATCHING LIBRARY (Image Embeddings)
// ============================================

// Categories supported by visual matching
export const visualMatchCategories = ['watch', 'shoe', 'card'] as const;
export type VisualMatchCategory = typeof visualMatchCategories[number];

// Library Items - canonical items in the reference library
export const libraryItems = pgTable("library_items", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(), // 'watch' | 'shoe' | 'card'
  brand: text("brand"), // e.g., "Invicta", "Nike", "Panini"
  modelFamily: text("model_family"), // style family: "Pro Diver", "Jordan 1", "Prizm"
  modelName: text("model_name"), // specific model: "8926OB", "Dunk Low"
  variant: text("variant"), // colorway/variant: "blue sunburst", "Chicago"
  title: text("title").notNull(), // display title
  attributes: jsonb("attributes").notNull().default({}), // flexible category-specific attributes
  status: text("status").notNull().default('active'), // 'active' | 'inactive'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  categoryIdx: index("library_items_category_idx").on(table.category),
  brandIdx: index("library_items_brand_idx").on(table.brand),
  modelFamilyIdx: index("library_items_model_family_idx").on(table.modelFamily),
  statusIdx: index("library_items_status_idx").on(table.status),
}));

export const insertLibraryItemSchema = createInsertSchema(libraryItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type LibraryItem = typeof libraryItems.$inferSelect;
export type InsertLibraryItem = z.infer<typeof insertLibraryItemSchema>;

// Library Images - multiple reference images per item with embeddings
// Using 768 dimensions for CLIP ViT-B/32 or Jina CLIP models
export const libraryImages = pgTable("library_images", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => libraryItems.id, { onDelete: 'cascade' }),
  category: text("category").notNull(), // duplicate for faster filtering
  imageUrl: text("image_url").notNull(),
  imageHash: text("image_hash"), // sha256 for deduplication
  imageType: text("image_type"), // watch: 'dial','side','caseback'; shoe: 'side','top','sole'; card: 'front'
  source: text("source").notNull().default('seed'), // 'seed' | 'user_scan' | 'admin_upload'
  qualityScore: numeric("quality_score"), // 0-1 quality heuristic
  width: integer("width"),
  height: integer("height"),
  embedding: vector("embedding", { dimensions: 768 }), // CLIP embedding vector
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  embeddingIdx: index("library_images_embedding_idx").using('hnsw', table.embedding.op('vector_cosine_ops')),
  categoryIdx: index("library_images_category_idx").on(table.category),
  itemIdIdx: index("library_images_item_id_idx").on(table.itemId),
  imageHashIdx: uniqueIndex("library_images_hash_idx").on(table.imageHash),
}));

export const insertLibraryImageSchema = createInsertSchema(libraryImages).omit({
  id: true,
  createdAt: true,
  embedding: true, // handled separately
});
export type LibraryImage = typeof libraryImages.$inferSelect;
export type InsertLibraryImage = z.infer<typeof insertLibraryImageSchema>;

// Visual Match Sessions - each visual matching scan event
export const visualMatchSessions = pgTable("visual_match_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  category: text("category").notNull(), // 'watch' | 'shoe' | 'card'
  scanImageUrl: text("scan_image_url").notNull(),
  scanImageHash: text("scan_image_hash"),
  scanEmbedding: vector("scan_embedding", { dimensions: 768 }),
  topMatches: jsonb("top_matches").notNull().default([]), // array of match results
  bestItemId: integer("best_item_id").references(() => libraryItems.id),
  bestScore: numeric("best_score"),
  scoreGap: numeric("score_gap"), // gap between best and second best
  decision: text("decision").notNull().default('pending'), // 'auto_selected' | 'user_required' | 'no_confident_match' | 'vision_used' | 'pending'
  visionUsed: boolean("vision_used").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  categoryIdx: index("visual_match_sessions_category_idx").on(table.category),
  userIdIdx: index("visual_match_sessions_user_id_idx").on(table.userId),
  createdAtIdx: index("visual_match_sessions_created_at_idx").on(table.createdAt),
}));

export const insertVisualMatchSessionSchema = createInsertSchema(visualMatchSessions).omit({
  id: true,
  createdAt: true,
  scanEmbedding: true, // handled separately
});
export type VisualMatchSession = typeof visualMatchSessions.$inferSelect;
export type InsertVisualMatchSession = z.infer<typeof insertVisualMatchSessionSchema>;

// Match Feedback - user confirmations/corrections (grows the library)
export const matchFeedback = pgTable("match_feedback", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => visualMatchSessions.id, { onDelete: 'cascade' }),
  chosenItemId: integer("chosen_item_id").notNull().references(() => libraryItems.id),
  wasAutoSelected: boolean("was_auto_selected").notNull(),
  autoSelectedItemId: integer("auto_selected_item_id").references(() => libraryItems.id),
  autoSelectedScore: numeric("auto_selected_score"),
  finalScore: numeric("final_score"),
  action: text("action").notNull(), // 'confirmed' | 'corrected' | 'created_new_item'
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMatchFeedbackSchema = createInsertSchema(matchFeedback).omit({
  id: true,
  createdAt: true,
});
export type MatchFeedback = typeof matchFeedback.$inferSelect;
export type InsertMatchFeedback = z.infer<typeof insertMatchFeedbackSchema>;

// Library Ingestion Jobs - admin batch seeding progress
export const libraryIngestionJobs = pgTable("library_ingestion_jobs", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  status: text("status").notNull().default('queued'), // 'queued' | 'running' | 'done' | 'failed'
  totalImages: integer("total_images").notNull().default(0),
  processedImages: integer("processed_images").notNull().default(0),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLibraryIngestionJobSchema = createInsertSchema(libraryIngestionJobs).omit({
  id: true,
  createdAt: true,
});
export type LibraryIngestionJob = typeof libraryIngestionJobs.$inferSelect;
export type InsertLibraryIngestionJob = z.infer<typeof insertLibraryIngestionJobSchema>;

// Visual match result interface for API responses
export interface VisualMatchResult {
  itemId: number;
  title: string;
  brand?: string;
  modelFamily?: string;
  variant?: string;
  imageUrl?: string;
  bestImageScore: number; // closest neighbor distance converted to similarity
  avgTop3Score: number; // average of top 3 images for this item
  supportCount: number; // # of neighbor images for this item in top-K
  confidence: 'high' | 'medium' | 'low';
}

// Visual match API response
export interface VisualMatchResponse {
  sessionId: number;
  topMatches: VisualMatchResult[];
  decision: 'auto_selected' | 'user_required' | 'no_confident_match' | 'library_building';
  autoSelectedItem?: VisualMatchResult;
  bestScore: number;
  scoreGap: number;
  libraryImageCount?: number;
}

// ============================================
// WATCH PHOTO DATABASE (New Architecture)
// ============================================

// Watch Families - canonical watch model families (brand + family = unique)
export const watchFamilies = pgTable("watch_families", {
  id: serial("id").primaryKey(),
  brand: text("brand").notNull(), // e.g., "Rolex", "Omega", "Seiko", "Invicta"
  collection: text("collection"), // e.g., "Subaqua", "Pro Diver", "Submariner" - groups multiple configs
  configurationGroup: text("configuration_group"), // Visual trait group: "rotating_bezel_diver", "fixed_bezel_chrono", "skeleton"
  family: text("family").notNull(), // e.g., "Submariner Date", "Subaqua Noma III" - specific model
  displayName: text("display_name").notNull(), // e.g., "Invicta Subaqua Noma III (Rotating Bezel)"
  attributes: jsonb("attributes").notNull().default({}), // flexible metadata including visual traits
  minImagesRequired: integer("min_images_required").notNull().default(15),
  targetImages: integer("target_images").notNull().default(25),
  status: text("status").notNull().default('building'), // 'building' | 'ready' | 'locked'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  brandFamilyUnique: uniqueIndex("watch_families_brand_family_idx").on(table.brand, table.family),
  statusIdx: index("watch_families_status_idx").on(table.status),
  collectionIdx: index("watch_families_collection_idx").on(table.brand, table.collection),
  configGroupIdx: index("watch_families_config_group_idx").on(table.brand, table.collection, table.configurationGroup),
}));

export const insertWatchFamilySchema = createInsertSchema(watchFamilies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type WatchFamily = typeof watchFamilies.$inferSelect;
export type InsertWatchFamily = z.infer<typeof insertWatchFamilySchema>;

// Image Ingest Queue - URLs waiting to be downloaded and processed
export const imageIngestQueue = pgTable("image_ingest_queue", {
  id: serial("id").primaryKey(),
  familyId: integer("family_id").notNull().references(() => watchFamilies.id, { onDelete: 'cascade' }),
  sourceUrl: text("source_url").notNull(),
  status: text("status").notNull().default('pending'), // 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  statusIdx: index("image_ingest_queue_status_idx").on(table.status),
  familyIdIdx: index("image_ingest_queue_family_id_idx").on(table.familyId),
}));

export const insertImageIngestQueueSchema = createInsertSchema(imageIngestQueue).omit({
  id: true,
  createdAt: true,
  processedAt: true,
});
export type ImageIngestQueue = typeof imageIngestQueue.$inferSelect;
export type InsertImageIngestQueue = z.infer<typeof insertImageIngestQueueSchema>;

// Watch Images - stored validated images with embeddings (NEVER uses remote URLs for matching)
export const watchImages = pgTable("watch_images", {
  id: serial("id").primaryKey(),
  familyId: integer("family_id").notNull().references(() => watchFamilies.id, { onDelete: 'cascade' }),
  sha256: text("sha256").notNull(), // deduplication key
  storagePath: text("storage_path").notNull(), // watches/{brand}/{family}/{family_id}/{sha256}.jpg
  originalUrl: text("original_url"), // where it came from (for reference only)
  fileSize: integer("file_size").notNull(), // bytes, must be >= 20KB
  width: integer("width").notNull(), // must be >= 200
  height: integer("height").notNull(), // must be >= 200
  contentType: text("content_type").notNull(), // must be image/*
  qualityScore: numeric("quality_score"), // 0-1 quality heuristic
  embedding: vector("embedding", { dimensions: 768 }), // CLIP embedding vector
  source: text("source").notNull().default('seed'), // 'seed' | 'user_upload' | 'admin'
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  sha256Unique: uniqueIndex("watch_images_sha256_idx").on(table.sha256),
  familyIdIdx: index("watch_images_family_id_idx").on(table.familyId),
  embeddingIdx: index("watch_images_embedding_idx").using('hnsw', table.embedding.op('vector_cosine_ops')),
}));

export const insertWatchImageSchema = createInsertSchema(watchImages).omit({
  id: true,
  createdAt: true,
  embedding: true, // handled separately
});
export type WatchImage = typeof watchImages.$inferSelect;
export type InsertWatchImage = z.infer<typeof insertWatchImageSchema>;

// Watch seed reporting interface
export interface WatchSeedReport {
  totalFamilies: number;
  totalStoredImages: number;
  minImagesPerFamily: number;
  maxImagesPerFamily: number;
  avgImagesPerFamily: number;
  underfilledFamilies: Array<{ brand: string; family: string; imageCount: number; required: number }>;
  readyFamilies: number;
  queueHealth: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    skipped: number;
  };
  libraryReady: boolean; // true if all families have >= minImagesRequired
}

// ============ SHOE IMAGE DATABASE ============
// Mirrors watch architecture for visual matching

export const shoeFamilies = pgTable("shoe_families", {
  id: serial("id").primaryKey(),
  brand: text("brand").notNull(), // e.g., "Nike", "Adidas", "Yeezy"
  family: text("family").notNull(), // e.g., "Air Force 1", "Ultraboost", "350 V2"
  displayName: text("display_name").notNull(), // e.g., "Nike Air Force 1"
  attributes: jsonb("attributes").notNull().default({}), // flexible metadata
  minImagesRequired: integer("min_images_required").notNull().default(15),
  targetImages: integer("target_images").notNull().default(25),
  queueOrder: integer("queue_order").notNull().default(999), // ingestion priority
  listingsScanned: integer("listings_scanned").notNull().default(0), // track API usage
  status: text("status").notNull().default('queued'), // 'queued' | 'active' | 'locked' | 'hard'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  brandFamilyUnique: uniqueIndex("shoe_families_brand_family_idx").on(table.brand, table.family),
  statusIdx: index("shoe_families_status_idx").on(table.status),
  queueOrderIdx: index("shoe_families_queue_order_idx").on(table.queueOrder),
}));

export const insertShoeFamilySchema = createInsertSchema(shoeFamilies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ShoeFamily = typeof shoeFamilies.$inferSelect;
export type InsertShoeFamily = z.infer<typeof insertShoeFamilySchema>;

export const shoeImages = pgTable("shoe_images", {
  id: serial("id").primaryKey(),
  familyId: integer("family_id").notNull().references(() => shoeFamilies.id, { onDelete: 'cascade' }),
  sha256: text("sha256").notNull(), // deduplication key
  storagePath: text("storage_path").notNull(), // shoes/{brand}/{family}/{family_id}/{sha256}.jpg
  originalUrl: text("original_url"), // where it came from (for reference only)
  fileSize: integer("file_size").notNull(), // bytes, must be >= 20KB
  width: integer("width").notNull(), // must be >= 200
  height: integer("height").notNull(), // must be >= 200
  contentType: text("content_type").notNull(), // must be image/*
  qualityScore: numeric("quality_score"), // 0-1 quality heuristic
  embedding: vector("embedding", { dimensions: 768 }), // CLIP embedding vector
  source: text("source").notNull().default('ebay'), // 'ebay' | 'user_upload' | 'admin'
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  sha256Unique: uniqueIndex("shoe_images_sha256_idx").on(table.sha256),
  familyIdIdx: index("shoe_images_family_id_idx").on(table.familyId),
  embeddingIdx: index("shoe_images_embedding_idx").using('hnsw', table.embedding.op('vector_cosine_ops')),
}));

export const insertShoeImageSchema = createInsertSchema(shoeImages).omit({
  id: true,
  createdAt: true,
  embedding: true,
});
export type ShoeImage = typeof shoeImages.$inferSelect;
export type InsertShoeImage = z.infer<typeof insertShoeImageSchema>;

// Processed eBay items for shoes (deduplication)
export const processedShoeItems = pgTable("processed_shoe_items", {
  id: serial("id").primaryKey(),
  ebayItemId: text("ebay_item_id").notNull(),
  familyId: integer("family_id").notNull().references(() => shoeFamilies.id, { onDelete: 'cascade' }),
  title: text("title"),
  condition: text("condition"),
  imageCount: integer("image_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  ebayItemIdUnique: uniqueIndex("processed_shoe_items_ebay_id_idx").on(table.ebayItemId),
}));

// Shoe seed reporting interface
export interface ShoeSeedReport {
  totalFamilies: number;
  totalImages: number;
  minImagesPerFamily: number;
  maxImagesPerFamily: number;
  avgImagesPerFamily: number;
  lockedFamilies: Array<{ brand: string; family: string; imageCount: number }>;
  activeFamilies: Array<{ brand: string; family: string; imageCount: number }>;
  queuedFamilies: Array<{ brand: string; family: string; imageCount: number }>;
  hardFamilies: Array<{ brand: string; family: string; imageCount: number; listingsScanned: number }>;
  apiStats: {
    totalApiCalls: number;
    downloadSuccess: number;
    downloadFailed: number;
    topFailureReasons: Array<{ reason: string; count: number }>;
  };
}

// ============ GAMING IMAGE DATABASE ============
// Mirrors shoe/watch architecture for visual matching of consoles, controllers, handhelds

export const gamingFamilies = pgTable("gaming_families", {
  id: serial("id").primaryKey(),
  brand: text("brand").notNull(), // e.g., "Nintendo", "Sony", "Microsoft"
  family: text("family").notNull(), // e.g., "Switch OLED", "PS5", "Xbox Series X"
  displayName: text("display_name").notNull(), // e.g., "Nintendo Switch OLED"
  subcategory: text("subcategory").notNull().default('console'), // 'console' | 'controller' | 'handheld'
  attributes: jsonb("attributes").notNull().default({}), // flexible metadata
  minImagesRequired: integer("min_images_required").notNull().default(15),
  targetImages: integer("target_images").notNull().default(25),
  queueOrder: integer("queue_order").notNull().default(999), // ingestion priority
  listingsScanned: integer("listings_scanned").notNull().default(0), // track API usage
  status: text("status").notNull().default('queued'), // 'queued' | 'active' | 'locked' | 'hard'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  brandFamilyUnique: uniqueIndex("gaming_families_brand_family_idx").on(table.brand, table.family),
  statusIdx: index("gaming_families_status_idx").on(table.status),
  queueOrderIdx: index("gaming_families_queue_order_idx").on(table.queueOrder),
  subcategoryIdx: index("gaming_families_subcategory_idx").on(table.subcategory),
}));

export const insertGamingFamilySchema = createInsertSchema(gamingFamilies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type GamingFamily = typeof gamingFamilies.$inferSelect;
export type InsertGamingFamily = z.infer<typeof insertGamingFamilySchema>;

export const gamingImages = pgTable("gaming_images", {
  id: serial("id").primaryKey(),
  familyId: integer("family_id").notNull().references(() => gamingFamilies.id, { onDelete: 'cascade' }),
  sha256: text("sha256").notNull(), // deduplication key
  storagePath: text("storage_path").notNull(), // gaming/{brand}/{family}/{family_id}/{sha256}.jpg
  originalUrl: text("original_url"), // where it came from (for reference only)
  fileSize: integer("file_size").notNull(), // bytes, must be >= 20KB
  width: integer("width").notNull(), // must be >= 200
  height: integer("height").notNull(), // must be >= 200
  contentType: text("content_type").notNull(), // must be image/*
  qualityScore: numeric("quality_score"), // 0-1 quality heuristic
  embedding: vector("embedding", { dimensions: 768 }), // CLIP embedding vector
  source: text("source").notNull().default('ebay'), // 'ebay' | 'user_upload' | 'admin'
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  sha256Unique: uniqueIndex("gaming_images_sha256_idx").on(table.sha256),
  familyIdIdx: index("gaming_images_family_id_idx").on(table.familyId),
  embeddingIdx: index("gaming_images_embedding_idx").using('hnsw', table.embedding.op('vector_cosine_ops')),
}));

export const insertGamingImageSchema = createInsertSchema(gamingImages).omit({
  id: true,
  createdAt: true,
  embedding: true,
});
export type GamingImage = typeof gamingImages.$inferSelect;
export type InsertGamingImage = z.infer<typeof insertGamingImageSchema>;

// Processed eBay items for gaming (deduplication)
export const processedGamingItems = pgTable("processed_gaming_items", {
  id: serial("id").primaryKey(),
  ebayItemId: text("ebay_item_id").notNull(),
  familyId: integer("family_id").notNull().references(() => gamingFamilies.id, { onDelete: 'cascade' }),
  title: text("title"),
  condition: text("condition"),
  imageCount: integer("image_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  ebayItemIdUnique: uniqueIndex("processed_gaming_items_ebay_id_idx").on(table.ebayItemId),
}));

// Gaming seed reporting interface
export interface GamingSeedReport {
  totalFamilies: number;
  totalImages: number;
  minImagesPerFamily: number;
  maxImagesPerFamily: number;
  avgImagesPerFamily: number;
  lockedFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string }>;
  activeFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string }>;
  queuedFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string }>;
  hardFamilies: Array<{ brand: string; family: string; imageCount: number; listingsScanned: number; subcategory: string }>;
  apiStats: {
    totalApiCalls: number;
    downloadSuccess: number;
    downloadFailed: number;
    topFailureReasons: Array<{ reason: string; count: number }>;
  };
}

// ============================================
// TOOL PHOTO LIBRARY (Power Tools Visual Matching)
// ============================================

export const toolFamilies = pgTable("tool_families", {
  id: serial("id").primaryKey(),
  brand: text("brand").notNull(), // e.g., "Milwaukee", "DeWalt", "Makita"
  family: text("family").notNull(), // e.g., "M18 Fuel Hammer Drill", "20V MAX Impact Driver"
  displayName: text("display_name").notNull(), // e.g., "Milwaukee M18 Fuel Hammer Drill"
  subcategory: text("subcategory").notNull().default('power_tools'), // 'power_tools' | 'hand_tools' | 'combo_kits'
  attributes: jsonb("attributes").notNull().default({}), // voltage, tool type, etc.
  minImagesRequired: integer("min_images_required").notNull().default(15),
  targetImages: integer("target_images").notNull().default(25),
  queueOrder: integer("queue_order").notNull().default(999), // ingestion priority
  listingsScanned: integer("listings_scanned").notNull().default(0), // track API usage
  status: text("status").notNull().default('queued'), // 'queued' | 'active' | 'locked' | 'hard'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  brandFamilyUnique: uniqueIndex("tool_families_brand_family_idx").on(table.brand, table.family),
  statusIdx: index("tool_families_status_idx").on(table.status),
  queueOrderIdx: index("tool_families_queue_order_idx").on(table.queueOrder),
}));

export const insertToolFamilySchema = createInsertSchema(toolFamilies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ToolFamily = typeof toolFamilies.$inferSelect;
export type InsertToolFamily = z.infer<typeof insertToolFamilySchema>;

export const toolImages = pgTable("tool_images", {
  id: serial("id").primaryKey(),
  familyId: integer("family_id").notNull().references(() => toolFamilies.id, { onDelete: 'cascade' }),
  sha256: text("sha256").notNull(), // deduplication key
  storagePath: text("storage_path").notNull(), // tools/{brand}/{family}/{family_id}/{sha256}.jpg
  originalUrl: text("original_url"), // where it came from (for reference only)
  fileSize: integer("file_size").notNull(), // bytes, must be >= 20KB
  width: integer("width").notNull(), // must be >= 200
  height: integer("height").notNull(), // must be >= 200
  contentType: text("content_type").notNull(), // must be image/*
  qualityScore: numeric("quality_score"), // 0-1 quality heuristic
  embedding: vector("embedding", { dimensions: 768 }), // CLIP embedding vector
  source: text("source").notNull().default('ebay'), // 'ebay' | 'user_upload' | 'admin'
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  sha256Unique: uniqueIndex("tool_images_sha256_idx").on(table.sha256),
  familyIdIdx: index("tool_images_family_id_idx").on(table.familyId),
  embeddingIdx: index("tool_images_embedding_idx").using('hnsw', table.embedding.op('vector_cosine_ops')),
}));

export const insertToolImageSchema = createInsertSchema(toolImages).omit({
  id: true,
  createdAt: true,
  embedding: true,
});
export type ToolImage = typeof toolImages.$inferSelect;
export type InsertToolImage = z.infer<typeof insertToolImageSchema>;

// Processed eBay items for tools (deduplication)
export const processedToolItems = pgTable("processed_tool_items", {
  id: serial("id").primaryKey(),
  ebayItemId: text("ebay_item_id").notNull(),
  familyId: integer("family_id").notNull().references(() => toolFamilies.id, { onDelete: 'cascade' }),
  title: text("title"),
  condition: text("condition"),
  imageCount: integer("image_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  ebayItemIdUnique: uniqueIndex("processed_tool_items_ebay_id_idx").on(table.ebayItemId),
}));

// Tool seed reporting interface
export interface ToolSeedReport {
  totalFamilies: number;
  totalImages: number;
  minImagesPerFamily: number;
  maxImagesPerFamily: number;
  avgImagesPerFamily: number;
  lockedFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string }>;
  activeFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string }>;
  queuedFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string }>;
  hardFamilies: Array<{ brand: string; family: string; imageCount: number; listingsScanned: number; subcategory: string }>;
  apiStats: {
    totalApiCalls: number;
    downloadSuccess: number;
    downloadFailed: number;
    topFailureReasons: Array<{ reason: string; count: number }>;
  };
}

// ============================================
// HANDBAG PHOTO LIBRARY (Designer Bags Visual Matching)
// ============================================

export const handbagFamilies = pgTable("handbag_families", {
  id: serial("id").primaryKey(),
  brand: text("brand").notNull(), // e.g., "Louis Vuitton", "Gucci", "Coach"
  family: text("family").notNull(), // e.g., "Neverfull", "Marmont", "Tabby"
  displayName: text("display_name").notNull(), // e.g., "Louis Vuitton Neverfull"
  subcategory: text("subcategory").notNull().default('tote'), // 'tote' | 'crossbody' | 'shoulder' | 'clutch' | 'backpack'
  attributes: jsonb("attributes").notNull().default({}), // size, material, etc.
  minImagesRequired: integer("min_images_required").notNull().default(15),
  targetImages: integer("target_images").notNull().default(25),
  queueOrder: integer("queue_order").notNull().default(999),
  listingsScanned: integer("listings_scanned").notNull().default(0),
  status: text("status").notNull().default('queued'), // 'queued' | 'active' | 'locked' | 'hard'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  brandFamilyUnique: uniqueIndex("handbag_families_brand_family_idx").on(table.brand, table.family),
  statusIdx: index("handbag_families_status_idx").on(table.status),
  queueOrderIdx: index("handbag_families_queue_order_idx").on(table.queueOrder),
}));

export const insertHandbagFamilySchema = createInsertSchema(handbagFamilies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type HandbagFamily = typeof handbagFamilies.$inferSelect;
export type InsertHandbagFamily = z.infer<typeof insertHandbagFamilySchema>;

export const handbagImages = pgTable("handbag_images", {
  id: serial("id").primaryKey(),
  familyId: integer("family_id").notNull().references(() => handbagFamilies.id, { onDelete: 'cascade' }),
  sha256: text("sha256").notNull(),
  storagePath: text("storage_path").notNull(),
  originalUrl: text("original_url"),
  fileSize: integer("file_size").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  contentType: text("content_type").notNull(),
  qualityScore: numeric("quality_score"),
  embedding: vector("embedding", { dimensions: 768 }),
  source: text("source").notNull().default('ebay'),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  sha256Unique: uniqueIndex("handbag_images_sha256_idx").on(table.sha256),
  familyIdIdx: index("handbag_images_family_id_idx").on(table.familyId),
  embeddingIdx: index("handbag_images_embedding_idx").using('hnsw', table.embedding.op('vector_cosine_ops')),
}));

export const insertHandbagImageSchema = createInsertSchema(handbagImages).omit({
  id: true,
  createdAt: true,
  embedding: true,
});
export type HandbagImage = typeof handbagImages.$inferSelect;
export type InsertHandbagImage = z.infer<typeof insertHandbagImageSchema>;

export const processedHandbagItems = pgTable("processed_handbag_items", {
  id: serial("id").primaryKey(),
  ebayItemId: text("ebay_item_id").notNull(),
  familyId: integer("family_id").notNull().references(() => handbagFamilies.id, { onDelete: 'cascade' }),
  title: text("title"),
  condition: text("condition"),
  imageCount: integer("image_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  ebayItemIdUnique: uniqueIndex("processed_handbag_items_ebay_id_idx").on(table.ebayItemId),
}));

export interface HandbagSeedReport {
  totalFamilies: number;
  totalImages: number;
  minImagesPerFamily: number;
  maxImagesPerFamily: number;
  avgImagesPerFamily: number;
  lockedFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string }>;
  activeFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string }>;
  queuedFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string }>;
  hardFamilies: Array<{ brand: string; family: string; imageCount: number; listingsScanned: number; subcategory: string }>;
  apiStats: {
    totalApiCalls: number;
    downloadSuccess: number;
    downloadFailed: number;
    topFailureReasons: Array<{ reason: string; count: number }>;
  };
}

// ============================================
// ANTIQUE PHOTO LIBRARY (Vintage & Antique Visual Matching)
// ============================================

export const antiqueFamilies = pgTable("antique_families", {
  id: serial("id").primaryKey(),
  brand: text("brand").notNull(), // e.g., "Tiffany", "Hummel", "Depression Glass"
  family: text("family").notNull(), // e.g., "Favrile Vase", "Figurine", "Cameo"
  displayName: text("display_name").notNull(),
  subcategory: text("subcategory").notNull().default('decorative'), // 'furniture' | 'pottery' | 'glass' | 'silver' | 'jewelry' | 'art' | 'decorative'
  attributes: jsonb("attributes").notNull().default({}),
  minImagesRequired: integer("min_images_required").notNull().default(15),
  targetImages: integer("target_images").notNull().default(25),
  queueOrder: integer("queue_order").notNull().default(999),
  listingsScanned: integer("listings_scanned").notNull().default(0),
  status: text("status").notNull().default('queued'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  brandFamilyUnique: uniqueIndex("antique_families_brand_family_idx").on(table.brand, table.family),
  statusIdx: index("antique_families_status_idx").on(table.status),
  queueOrderIdx: index("antique_families_queue_order_idx").on(table.queueOrder),
}));

export const insertAntiqueFamilySchema = createInsertSchema(antiqueFamilies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type AntiqueFamily = typeof antiqueFamilies.$inferSelect;
export type InsertAntiqueFamily = z.infer<typeof insertAntiqueFamilySchema>;

export const antiqueImages = pgTable("antique_images", {
  id: serial("id").primaryKey(),
  familyId: integer("family_id").notNull().references(() => antiqueFamilies.id, { onDelete: 'cascade' }),
  sha256: text("sha256").notNull(),
  storagePath: text("storage_path").notNull(),
  originalUrl: text("original_url"),
  fileSize: integer("file_size").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  contentType: text("content_type").notNull(),
  qualityScore: numeric("quality_score"),
  embedding: vector("embedding", { dimensions: 768 }),
  source: text("source").notNull().default('ebay'),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  sha256Unique: uniqueIndex("antique_images_sha256_idx").on(table.sha256),
  familyIdIdx: index("antique_images_family_id_idx").on(table.familyId),
  embeddingIdx: index("antique_images_embedding_idx").using('hnsw', table.embedding.op('vector_cosine_ops')),
}));

export const insertAntiqueImageSchema = createInsertSchema(antiqueImages).omit({
  id: true,
  createdAt: true,
  embedding: true,
});
export type AntiqueImage = typeof antiqueImages.$inferSelect;
export type InsertAntiqueImage = z.infer<typeof insertAntiqueImageSchema>;

export const processedAntiqueItems = pgTable("processed_antique_items", {
  id: serial("id").primaryKey(),
  ebayItemId: text("ebay_item_id").notNull(),
  familyId: integer("family_id").notNull().references(() => antiqueFamilies.id, { onDelete: 'cascade' }),
  title: text("title"),
  condition: text("condition"),
  imageCount: integer("image_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  ebayItemIdUnique: uniqueIndex("processed_antique_items_ebay_id_idx").on(table.ebayItemId),
}));

export interface AntiqueSeedReport {
  totalFamilies: number;
  totalImages: number;
  minImagesPerFamily: number;
  maxImagesPerFamily: number;
  avgImagesPerFamily: number;
  lockedFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string }>;
  activeFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string }>;
  queuedFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string }>;
  hardFamilies: Array<{ brand: string; family: string; imageCount: number; listingsScanned: number; subcategory: string }>;
  apiStats: {
    totalApiCalls: number;
    downloadSuccess: number;
    downloadFailed: number;
    topFailureReasons: Array<{ reason: string; count: number }>;
  };
}

// ============================================
// VINTAGE CLOTHING PHOTO LIBRARY (Visual Matching)
// ============================================

export const vintageFamilies = pgTable("vintage_families", {
  id: serial("id").primaryKey(),
  brand: text("brand").notNull(), // e.g., "Levi's", "Nike", "Champion", "Carhartt"
  family: text("family").notNull(), // e.g., "501 Jeans", "Band Tee", "Reverse Weave"
  displayName: text("display_name").notNull(),
  subcategory: text("subcategory").notNull().default('denim'), // 'denim' | 'tees' | 'outerwear' | 'sportswear' | 'designer'
  attributes: jsonb("attributes").notNull().default({}),
  minImagesRequired: integer("min_images_required").notNull().default(15),
  targetImages: integer("target_images").notNull().default(25),
  queueOrder: integer("queue_order").notNull().default(999),
  listingsScanned: integer("listings_scanned").notNull().default(0),
  status: text("status").notNull().default('queued'), // 'queued' | 'active' | 'locked' | 'hard'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  brandFamilyUnique: uniqueIndex("vintage_families_brand_family_idx").on(table.brand, table.family),
  statusIdx: index("vintage_families_status_idx").on(table.status),
  queueOrderIdx: index("vintage_families_queue_order_idx").on(table.queueOrder),
  subcategoryIdx: index("vintage_families_subcategory_idx").on(table.subcategory),
}));

export const insertVintageFamilySchema = createInsertSchema(vintageFamilies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type VintageFamily = typeof vintageFamilies.$inferSelect;
export type InsertVintageFamily = z.infer<typeof insertVintageFamilySchema>;

export const vintageImages = pgTable("vintage_images", {
  id: serial("id").primaryKey(),
  familyId: integer("family_id").notNull().references(() => vintageFamilies.id, { onDelete: 'cascade' }),
  sha256: text("sha256").notNull(),
  storagePath: text("storage_path").notNull(),
  originalUrl: text("original_url"),
  fileSize: integer("file_size").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  contentType: text("content_type").notNull(),
  qualityScore: numeric("quality_score"),
  embedding: vector("embedding", { dimensions: 768 }),
  source: text("source").notNull().default('ebay'),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  sha256Unique: uniqueIndex("vintage_images_sha256_idx").on(table.sha256),
  familyIdIdx: index("vintage_images_family_id_idx").on(table.familyId),
  embeddingIdx: index("vintage_images_embedding_idx").using('hnsw', table.embedding.op('vector_cosine_ops')),
}));

export const insertVintageImageSchema = createInsertSchema(vintageImages).omit({
  id: true,
  createdAt: true,
  embedding: true,
});
export type VintageImage = typeof vintageImages.$inferSelect;
export type InsertVintageImage = z.infer<typeof insertVintageImageSchema>;

export const processedVintageItems = pgTable("processed_vintage_items", {
  id: serial("id").primaryKey(),
  ebayItemId: text("ebay_item_id").notNull(),
  familyId: integer("family_id").notNull().references(() => vintageFamilies.id, { onDelete: 'cascade' }),
  title: text("title"),
  condition: text("condition"),
  imageCount: integer("image_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  ebayItemIdUnique: uniqueIndex("processed_vintage_items_ebay_id_idx").on(table.ebayItemId),
}));

export const insertProcessedVintageItemSchema = createInsertSchema(processedVintageItems).omit({
  id: true,
  createdAt: true,
});
export type ProcessedVintageItem = typeof processedVintageItems.$inferSelect;
export type InsertProcessedVintageItem = z.infer<typeof insertProcessedVintageItemSchema>;

export interface VintageSeedReport {
  totalFamilies: number;
  totalImages: number;
  minImagesPerFamily: number;
  maxImagesPerFamily: number;
  avgImagesPerFamily: number;
  lockedFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string }>;
  activeFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string }>;
  queuedFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string }>;
  hardFamilies: Array<{ brand: string; family: string; imageCount: number; listingsScanned: number; subcategory: string }>;
  apiStats: {
    totalApiCalls: number;
    downloadSuccess: number;
    downloadFailed: number;
    topFailureReasons: Array<{ reason: string; count: number }>;
  };
}

// ============================================
// ELECTRONICS PHOTO LIBRARY (Visual Matching)
// ============================================

export const electronicsFamilies = pgTable("electronics_families", {
  id: serial("id").primaryKey(),
  brand: text("brand").notNull(), // e.g., "Apple", "Sony", "Samsung", "Bose"
  family: text("family").notNull(), // e.g., "AirPods Pro", "WH-1000XM5", "Galaxy Buds"
  displayName: text("display_name").notNull(),
  subcategory: text("subcategory").notNull().default('audio'), // 'audio' | 'phones' | 'tablets' | 'wearables' | 'peripherals'
  attributes: jsonb("attributes").notNull().default({}),
  minImagesRequired: integer("min_images_required").notNull().default(15),
  targetImages: integer("target_images").notNull().default(25),
  queueOrder: integer("queue_order").notNull().default(999),
  listingsScanned: integer("listings_scanned").notNull().default(0),
  status: text("status").notNull().default('queued'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  brandFamilyUnique: uniqueIndex("electronics_families_brand_family_idx").on(table.brand, table.family),
  statusIdx: index("electronics_families_status_idx").on(table.status),
  queueOrderIdx: index("electronics_families_queue_order_idx").on(table.queueOrder),
  subcategoryIdx: index("electronics_families_subcategory_idx").on(table.subcategory),
}));

export const insertElectronicsFamilySchema = createInsertSchema(electronicsFamilies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ElectronicsFamily = typeof electronicsFamilies.$inferSelect;
export type InsertElectronicsFamily = z.infer<typeof insertElectronicsFamilySchema>;

export const electronicsImages = pgTable("electronics_images", {
  id: serial("id").primaryKey(),
  familyId: integer("family_id").notNull().references(() => electronicsFamilies.id, { onDelete: 'cascade' }),
  sha256: text("sha256").notNull(),
  storagePath: text("storage_path").notNull(),
  originalUrl: text("original_url"),
  fileSize: integer("file_size").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  contentType: text("content_type").notNull(),
  qualityScore: numeric("quality_score"),
  embedding: vector("embedding", { dimensions: 768 }),
  source: text("source").notNull().default('ebay'),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  sha256Unique: uniqueIndex("electronics_images_sha256_idx").on(table.sha256),
  familyIdIdx: index("electronics_images_family_id_idx").on(table.familyId),
  embeddingIdx: index("electronics_images_embedding_idx").using('hnsw', table.embedding.op('vector_cosine_ops')),
}));

export const insertElectronicsImageSchema = createInsertSchema(electronicsImages).omit({
  id: true,
  createdAt: true,
  embedding: true,
});
export type ElectronicsImage = typeof electronicsImages.$inferSelect;
export type InsertElectronicsImage = z.infer<typeof insertElectronicsImageSchema>;

export const processedElectronicsItems = pgTable("processed_electronics_items", {
  id: serial("id").primaryKey(),
  ebayItemId: text("ebay_item_id").notNull(),
  familyId: integer("family_id").notNull().references(() => electronicsFamilies.id, { onDelete: 'cascade' }),
  title: text("title"),
  condition: text("condition"),
  imageCount: integer("image_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  ebayItemIdUnique: uniqueIndex("processed_electronics_items_ebay_id_idx").on(table.ebayItemId),
}));

export const insertProcessedElectronicsItemSchema = createInsertSchema(processedElectronicsItems).omit({
  id: true,
  createdAt: true,
});
export type ProcessedElectronicsItem = typeof processedElectronicsItems.$inferSelect;
export type InsertProcessedElectronicsItem = z.infer<typeof insertProcessedElectronicsItemSchema>;

export interface ElectronicsSeedReport {
  totalFamilies: number;
  totalImages: number;
  minImagesPerFamily: number;
  maxImagesPerFamily: number;
  avgImagesPerFamily: number;
  lockedFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string }>;
  activeFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string }>;
  queuedFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string }>;
  hardFamilies: Array<{ brand: string; family: string; imageCount: number; listingsScanned: number; subcategory: string }>;
  apiStats: {
    totalApiCalls: number;
    downloadSuccess: number;
    downloadFailed: number;
    topFailureReasons: Array<{ reason: string; count: number }>;
  };
}

// ============================================
// TOYS & COLLECTIBLES LIBRARY (LEGO, Funko, Hot Wheels)
// ============================================

export const toyFamilies = pgTable("toy_families", {
  id: serial("id").primaryKey(),
  brand: text("brand").notNull(),
  family: text("family").notNull(),
  displayName: text("display_name").notNull(),
  subcategory: text("subcategory").notNull().default('action_figure'),
  attributes: jsonb("attributes").notNull().default({}),
  minImagesRequired: integer("min_images_required").notNull().default(15),
  targetImages: integer("target_images").notNull().default(25),
  queueOrder: integer("queue_order").notNull().default(999),
  listingsScanned: integer("listings_scanned").notNull().default(0),
  status: text("status").notNull().default('queued'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  brandFamilyUnique: uniqueIndex("toy_families_brand_family_idx").on(table.brand, table.family),
  statusIdx: index("toy_families_status_idx").on(table.status),
  queueOrderIdx: index("toy_families_queue_order_idx").on(table.queueOrder),
  subcategoryIdx: index("toy_families_subcategory_idx").on(table.subcategory),
}));

export const insertToyFamilySchema = createInsertSchema(toyFamilies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ToyFamily = typeof toyFamilies.$inferSelect;
export type InsertToyFamily = z.infer<typeof insertToyFamilySchema>;

export const toyImages = pgTable("toy_images", {
  id: serial("id").primaryKey(),
  familyId: integer("family_id").notNull().references(() => toyFamilies.id, { onDelete: 'cascade' }),
  sha256: text("sha256").notNull(),
  storagePath: text("storage_path").notNull(),
  originalUrl: text("original_url"),
  fileSize: integer("file_size").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  contentType: text("content_type").notNull(),
  qualityScore: numeric("quality_score"),
  embedding: vector("embedding", { dimensions: 768 }),
  source: text("source").notNull().default('ebay'),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  sha256Unique: uniqueIndex("toy_images_sha256_idx").on(table.sha256),
  familyIdIdx: index("toy_images_family_id_idx").on(table.familyId),
  embeddingIdx: index("toy_images_embedding_idx").using('hnsw', table.embedding.op('vector_cosine_ops')),
}));

export const insertToyImageSchema = createInsertSchema(toyImages).omit({
  id: true,
  createdAt: true,
  embedding: true,
});
export type ToyImage = typeof toyImages.$inferSelect;
export type InsertToyImage = z.infer<typeof insertToyImageSchema>;

export const processedToyItems = pgTable("processed_toy_items", {
  id: serial("id").primaryKey(),
  ebayItemId: text("ebay_item_id").notNull(),
  familyId: integer("family_id").notNull().references(() => toyFamilies.id, { onDelete: 'cascade' }),
  title: text("title"),
  condition: text("condition"),
  imageCount: integer("image_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  ebayItemIdUnique: uniqueIndex("processed_toy_items_ebay_id_idx").on(table.ebayItemId),
}));

export const insertProcessedToyItemSchema = createInsertSchema(processedToyItems).omit({
  id: true,
  createdAt: true,
});
export type ProcessedToyItem = typeof processedToyItems.$inferSelect;
export type InsertProcessedToyItem = z.infer<typeof insertProcessedToyItemSchema>;

export interface ToySeedReport {
  totalFamilies: number;
  totalImages: number;
  minImagesPerFamily: number;
  maxImagesPerFamily: number;
  avgImagesPerFamily: number;
  lockedFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string }>;
  activeFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string }>;
  queuedFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string }>;
  hardFamilies: Array<{ brand: string; family: string; imageCount: number; listingsScanned: number; subcategory: string }>;
  apiStats: {
    totalApiCalls: number;
    downloadSuccess: number;
    downloadFailed: number;
    topFailureReasons: Array<{ reason: string; count: number }>;
  };
}

// ============================================
// TRADING CARDS PHOTO LIBRARY (Sports Cards, TCG, Pokemon)
// ============================================
// For cards, set line / sub-brand is the primary family dimension
// Aggressively collect intra-family variation: years, sports, players, parallels, grades, conditions

export const cardFamilies = pgTable("card_families", {
  id: serial("id").primaryKey(),
  brand: text("brand").notNull(), // e.g., "Panini", "Topps", "Upper Deck", "Pokemon"
  family: text("family").notNull(), // e.g., "Prizm Basketball", "Bowman Chrome Baseball", "Base Set"
  displayName: text("display_name").notNull(), // e.g., "Panini Prizm Basketball"
  subcategory: text("subcategory").notNull().default('sports'), // 'sports' | 'pokemon' | 'tcg' | 'vintage'
  sport: text("sport"), // 'basketball', 'football', 'baseball', 'hockey', 'soccer', null for non-sports
  attributes: jsonb("attributes").notNull().default({}), // year ranges, parallel types, notable players
  minImagesRequired: integer("min_images_required").notNull().default(15),
  targetImages: integer("target_images").notNull().default(25),
  queueOrder: integer("queue_order").notNull().default(999), // ingestion priority
  listingsScanned: integer("listings_scanned").notNull().default(0), // track API usage
  status: text("status").notNull().default('queued'), // 'queued' | 'active' | 'locked' | 'hard'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  brandFamilyUnique: uniqueIndex("card_families_brand_family_idx").on(table.brand, table.family),
  statusIdx: index("card_families_status_idx").on(table.status),
  queueOrderIdx: index("card_families_queue_order_idx").on(table.queueOrder),
  subcategoryIdx: index("card_families_subcategory_idx").on(table.subcategory),
  sportIdx: index("card_families_sport_idx").on(table.sport),
}));

export const insertCardFamilySchema = createInsertSchema(cardFamilies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CardFamily = typeof cardFamilies.$inferSelect;
export type InsertCardFamily = z.infer<typeof insertCardFamilySchema>;

export const cardImages = pgTable("card_images", {
  id: serial("id").primaryKey(),
  familyId: integer("family_id").notNull().references(() => cardFamilies.id, { onDelete: 'cascade' }),
  sha256: text("sha256").notNull(), // deduplication key
  storagePath: text("storage_path").notNull(), // cards/{brand}/{family}/{family_id}/{sha256}.jpg
  originalUrl: text("original_url"), // where it came from (for reference only)
  fileSize: integer("file_size").notNull(), // bytes, must be >= 20KB
  width: integer("width").notNull(), // must be >= 200
  height: integer("height").notNull(), // must be >= 200
  contentType: text("content_type").notNull(), // must be image/*
  qualityScore: numeric("quality_score"), // 0-1 quality heuristic
  embedding: vector("embedding", { dimensions: 768 }), // CLIP embedding vector
  source: text("source").notNull().default('ebay'), // 'ebay' | 'serp_bootstrap' | 'user_upload' | 'admin'
  // Card-specific metadata
  year: text("year"), // e.g., "2023", "2021-22"
  player: text("player"), // e.g., "LeBron James", "Patrick Mahomes"
  parallel: text("parallel"), // e.g., "Silver", "Gold", "Red White Blue"
  grade: text("grade"), // e.g., "PSA 10", "BGS 9.5", "Raw"
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  sha256Unique: uniqueIndex("card_images_sha256_idx").on(table.sha256),
  familyIdIdx: index("card_images_family_id_idx").on(table.familyId),
  embeddingIdx: index("card_images_embedding_idx").using('hnsw', table.embedding.op('vector_cosine_ops')),
  yearIdx: index("card_images_year_idx").on(table.year),
  sourceIdx: index("card_images_source_idx").on(table.source),
}));

export const insertCardImageSchema = createInsertSchema(cardImages).omit({
  id: true,
  createdAt: true,
  embedding: true,
});
export type CardImage = typeof cardImages.$inferSelect;
export type InsertCardImage = z.infer<typeof insertCardImageSchema>;

export const processedCardItems = pgTable("processed_card_items", {
  id: serial("id").primaryKey(),
  ebayItemId: text("ebay_item_id").notNull(),
  familyId: integer("family_id").notNull().references(() => cardFamilies.id, { onDelete: 'cascade' }),
  title: text("title"),
  condition: text("condition"),
  imageCount: integer("image_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  ebayItemIdUnique: uniqueIndex("processed_card_items_ebay_id_idx").on(table.ebayItemId),
}));

export const insertProcessedCardItemSchema = createInsertSchema(processedCardItems).omit({
  id: true,
  createdAt: true,
});
export type ProcessedCardItem = typeof processedCardItems.$inferSelect;
export type InsertProcessedCardItem = z.infer<typeof insertProcessedCardItemSchema>;

export interface CardSeedReport {
  totalFamilies: number;
  totalImages: number;
  minImagesPerFamily: number;
  maxImagesPerFamily: number;
  avgImagesPerFamily: number;
  lockedFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string; sport?: string }>;
  activeFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string; sport?: string }>;
  queuedFamilies: Array<{ brand: string; family: string; imageCount: number; subcategory: string; sport?: string }>;
  hardFamilies: Array<{ brand: string; family: string; imageCount: number; listingsScanned: number; subcategory: string; sport?: string }>;
  apiStats: {
    totalApiCalls: number;
    downloadSuccess: number;
    downloadFailed: number;
    topFailureReasons: Array<{ reason: string; count: number }>;
  };
}

// ============ USER CORRECTIONS (LEARNING SYSTEM) ============
// Stores user edits to model names, bezel colors, dial colors for future learning

export const userCorrections = pgTable("user_corrections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  scanSessionId: integer("scan_session_id").references(() => scanSessions.id),
  category: text("category").notNull(), // 'watch' | 'shoe' | 'card' | 'electronics'
  
  // What the system originally detected
  originalBrand: text("original_brand"),
  originalModel: text("original_model"),
  originalDialColor: text("original_dial_color"),
  originalBezelColor: text("original_bezel_color"),
  originalFamilyId: integer("original_family_id"),
  
  // What the user corrected it to
  correctedBrand: text("corrected_brand"),
  correctedModel: text("corrected_model"),
  correctedDialColor: text("corrected_dial_color"),
  correctedDialStyle: text("corrected_dial_style"), // e.g., "roman", "stick", "arabic"
  correctedBezelColor: text("corrected_bezel_color"),
  correctedFamilyId: integer("corrected_family_id"),
  
  // Suggested configurationGroup for 'unclassified' families (for admin review)
  suggestedConfigGroup: text("suggested_config_group"), // e.g., "chrono_subdials", "rotating_bezel_diver"
  familyWasUnclassified: boolean("family_was_unclassified").default(false), // Flag for admin review queue
  
  // Confidence source for learning weighting
  confidenceSource: text("confidence_source"), // 'USER_CONFIRMED' | 'AUTO_DETECTED' | 'INFERRED'
  
  // Image hash for learning (links to the actual image that should match this identity)
  imageSha256: text("image_sha256"),
  imageStoragePath: text("image_storage_path"),
  
  // Learning status
  appliedToLibrary: boolean("applied_to_library").notNull().default(false),
  appliedAt: timestamp("applied_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("user_corrections_user_idx").on(table.userId),
  categoryIdx: index("user_corrections_category_idx").on(table.category),
  scanSessionIdx: index("user_corrections_scan_session_idx").on(table.scanSessionId),
  appliedIdx: index("user_corrections_applied_idx").on(table.appliedToLibrary),
}));

export const insertUserCorrectionSchema = createInsertSchema(userCorrections).omit({
  id: true,
  createdAt: true,
  appliedAt: true,
});
export type UserCorrection = typeof userCorrections.$inferSelect;
export type InsertUserCorrection = z.infer<typeof insertUserCorrectionSchema>;
