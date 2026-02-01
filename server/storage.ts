import { db } from "./db";
import { users, items, dailyScans, compsCache, inventoryItems, scanSessions, affiliateEarnings, batchSessions, batchItems, passwordResetTokens, partnerProgramSettings, hotItems, businessExpenses, sourcingLocations, type User, type InsertUser, type Item, type DailyScan, type CompsCache, type SoldComp, type InventoryItem, type InsertInventoryItem, type InventoryStatus, type ScanSession, type ScanCandidate, type AffiliateEarning, type BatchSession, type BatchItem, type PasswordResetToken, type PartnerProgramSettings, type CommissionStatus, type HotItem, type InsertHotItem, type BusinessExpense, type InsertBusinessExpense, type SourcingLocation, type InsertSourcingLocation } from "@shared/schema";
import { eq, desc, and, gt, lt, isNull, or, sql, gte, lte } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);

export interface CompsCacheInput {
  queryKey: string;
  comps: SoldComp[];
  lowPrice: string | null;
  medianPrice: string | null;
  highPrice: string | null;
  spreadPercent: string | null;
  message: string | null;
  expiresAt: Date;
}

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  
  createItem(item: Omit<Item, "id" | "createdAt">): Promise<Item>;
  getItems(userId: number): Promise<Item[]>;
  getActiveItems(userId: number): Promise<Item[]>; // Excludes expired items
  getItem(id: number, userId: number): Promise<Item | undefined>;
  updateItemDecision(id: number, userId: number, decision: string | null): Promise<Item | undefined>;
  updateItemFlipPrice(id: number, userId: number, flipPrice: string): Promise<Item | undefined>;
  updateItemWatchMetadata(id: number, userId: number, metadata: { watchBrand?: string | null; watchFamily?: string | null; watchBandType?: string | null; watchCaseSize?: string | null; watchMovementType?: string | null; watchWearAssessment?: string | null; watchBoxAndPapers?: string | null; watchAftermarketFlags?: string[] | null; watchDialColor?: string | null; watchDialStyle?: string | null; watchBezelColor?: string | null; watchMaterials?: string | null }): Promise<Item | undefined>;
  updateItemCardMetadata(id: number, userId: number, metadata: {
    cardIsGraded?: boolean | null;
    cardGrader?: string | null;
    cardGrade?: string | null;
    cardYear?: string | null;
    cardSet?: string | null;
    cardPlayer?: string | null;
    cardNumber?: string | null;
    cardParallel?: string | null;
    cardCertNumber?: string | null;
    cardSerialNumber?: string | null;
    cardSerialTotal?: string | null;
    cardImageFrontUrl?: string | null;
    cardImageBackUrl?: string | null;
    cardVariationType?: string | null;
    cardVariationName?: string | null;
    cardVariationFinish?: string[] | null;
    cardVariationConfirmed?: boolean | null;
  }): Promise<Item | undefined>;
  updateItemGradingReadiness(id: number, userId: number, gradingReadiness: object): Promise<Item | undefined>;
  
  // Scan limits
  getDailyScanCount(userId: number): Promise<number>;
  incrementDailyScanCount(userId: number): Promise<void>;
  canUserScan(userId: number): Promise<{ allowed: boolean; remaining: number; limit: number }>;
  getDailyArScanCount(userId: number): Promise<number>;
  incrementDailyArScanCount(userId: number): Promise<void>;
  canUserArScan(userId: number): Promise<{ allowed: boolean; remaining: number; limit: number }>;
  
  // Comps cache
  getCompsCache(queryKey: string): Promise<CompsCache | undefined>;
  setCompsCache(input: CompsCacheInput): Promise<void>;
  
  // Inventory
  getInventoryItems(userId: number): Promise<InventoryItem[]>;
  getInventoryItem(id: number, userId: number): Promise<InventoryItem | undefined>;
  createInventoryItem(item: Omit<InventoryItem, "id" | "createdAt" | "updatedAt">): Promise<InventoryItem>;
  updateInventoryItem(id: number, userId: number, updates: Partial<InventoryItem>): Promise<InventoryItem | undefined>;
  deleteInventoryItem(id: number, userId: number): Promise<boolean>;
  
  // Scan sessions (photo-based)
  createScanSession(userId: number): Promise<ScanSession>;
  getScanSession(id: number, userId: number): Promise<ScanSession | undefined>;
  updateScanSession(id: number, userId: number, updates: Partial<ScanSession>): Promise<ScanSession | undefined>;
  
  // Hot items (trending by category)
  upsertHotItem(item: InsertHotItem): Promise<HotItem>;
  getHottestItems(limit?: number): Promise<HotItem[]>;
  getHottestByCategory(category: string, limit?: number): Promise<HotItem[]>;
  
  // Business expenses (for tax tracking)
  getBusinessExpenses(userId: number, taxYear?: number): Promise<BusinessExpense[]>;
  getBusinessExpense(id: number, userId: number): Promise<BusinessExpense | undefined>;
  createBusinessExpense(expense: Omit<BusinessExpense, "id" | "createdAt" | "updatedAt">): Promise<BusinessExpense>;
  updateBusinessExpense(id: number, userId: number, updates: Partial<BusinessExpense>): Promise<BusinessExpense | undefined>;
  deleteBusinessExpense(id: number, userId: number): Promise<boolean>;
  getExpenseSummaryByCategory(userId: number, taxYear: number): Promise<{ category: string; total: number; count: number }[]>;
  
  // Sourcing locations
  getSourcingLocations(userId: number): Promise<SourcingLocation[]>;
  createSourcingLocation(location: Omit<SourcingLocation, "id" | "createdAt">): Promise<SourcingLocation>;
  deleteSourcingLocation(id: number, userId: number): Promise<boolean>;
  
  sessionStore: session.Store;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(
      sql`LOWER(${users.username}) = LOWER(${username})`
    );
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(
      sql`LOWER(${users.email}) = LOWER(${email})`
    );
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getUserByStripeCustomerId(stripeCustomerId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.stripeCustomerId, stripeCustomerId));
    return user;
  }

  async updateUserSubscription(userId: number, updates: { 
    subscriptionTier?: string; 
    stripeCustomerId?: string | null; 
    stripeSubscriptionId?: string | null;
  }): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async createItem(item: Omit<Item, "id" | "createdAt">): Promise<Item> {
    const [newItem] = await db.insert(items).values(item).returning();
    return newItem;
  }

  async getItems(userId: number): Promise<Item[]> {
    return db.select().from(items).where(eq(items.userId, userId)).orderBy(desc(items.createdAt));
  }

  async getItem(id: number, userId: number): Promise<Item | undefined> {
    const [item] = await db.select().from(items).where(eq(items.id, id));
    if (item && item.userId === userId) {
      return item;
    }
    return undefined;
  }

  async updateItemDecision(id: number, userId: number, decision: string | null): Promise<Item | undefined> {
    const existing = await this.getItem(id, userId);
    if (!existing) return undefined;
    
    const [updated] = await db
      .update(items)
      .set({ userDecision: decision })
      .where(eq(items.id, id))
      .returning();
    return updated;
  }

  async updateItemFlipPrice(id: number, userId: number, flipPrice: string): Promise<Item | undefined> {
    const existing = await this.getItem(id, userId);
    if (!existing) return undefined;
    
    const [updated] = await db
      .update(items)
      .set({ flipPrice })
      .where(eq(items.id, id))
      .returning();
    return updated;
  }

  async updateItemWatchMetadata(id: number, userId: number, metadata: { watchBrand?: string | null; watchFamily?: string | null; watchBandType?: string | null; watchCaseSize?: string | null; watchMovementType?: string | null; watchWearAssessment?: string | null; watchBoxAndPapers?: string | null; watchAftermarketFlags?: string[] | null; watchDialColor?: string | null; watchDialStyle?: string | null; watchBezelColor?: string | null; watchMaterials?: string | null }): Promise<Item | undefined> {
    const existing = await this.getItem(id, userId);
    if (!existing) return undefined;
    
    const [updated] = await db
      .update(items)
      .set({
        watchBrand: metadata.watchBrand ?? null,
        watchFamily: metadata.watchFamily ?? null,
        watchBandType: metadata.watchBandType ?? null,
        watchCaseSize: metadata.watchCaseSize ?? null,
        watchMovementType: metadata.watchMovementType ?? null,
        watchWearAssessment: metadata.watchWearAssessment ?? null,
        watchBoxAndPapers: metadata.watchBoxAndPapers ?? null,
        watchAftermarketFlags: metadata.watchAftermarketFlags ?? null,
        watchDialColor: metadata.watchDialColor ?? null,
        watchDialStyle: metadata.watchDialStyle ?? null,
        watchBezelColor: metadata.watchBezelColor ?? null,
        watchMaterials: metadata.watchMaterials ?? null,
      })
      .where(eq(items.id, id))
      .returning();
    return updated;
  }

  async updateItemCardMetadata(id: number, userId: number, metadata: {
    cardIsGraded?: boolean | null;
    cardGrader?: string | null;
    cardGrade?: string | null;
    cardYear?: string | null;
    cardSet?: string | null;
    cardPlayer?: string | null;
    cardNumber?: string | null;
    cardParallel?: string | null;
    cardCertNumber?: string | null;
    cardSerialNumber?: string | null;
    cardSerialTotal?: string | null;
    cardImageFrontUrl?: string | null;
    cardImageBackUrl?: string | null;
    cardVariationType?: string | null;
    cardVariationName?: string | null;
    cardVariationFinish?: string[] | null;
    cardVariationConfirmed?: boolean | null;
  }): Promise<Item | undefined> {
    const existing = await this.getItem(id, userId);
    if (!existing) return undefined;
    
    const [updated] = await db
      .update(items)
      .set({
        cardIsGraded: metadata.cardIsGraded ?? null,
        cardGrader: metadata.cardGrader ?? null,
        cardGrade: metadata.cardGrade ?? null,
        cardYear: metadata.cardYear ?? null,
        cardSet: metadata.cardSet ?? null,
        cardPlayer: metadata.cardPlayer ?? null,
        cardNumber: metadata.cardNumber ?? null,
        cardParallel: metadata.cardParallel ?? null,
        cardCertNumber: metadata.cardCertNumber ?? null,
        cardSerialNumber: metadata.cardSerialNumber ?? null,
        cardSerialTotal: metadata.cardSerialTotal ?? null,
        cardImageFrontUrl: metadata.cardImageFrontUrl ?? null,
        cardImageBackUrl: metadata.cardImageBackUrl ?? null,
        cardVariationType: metadata.cardVariationType ?? null,
        cardVariationName: metadata.cardVariationName ?? null,
        cardVariationFinish: metadata.cardVariationFinish ?? null,
        cardVariationConfirmed: metadata.cardVariationConfirmed ?? null,
      })
      .where(eq(items.id, id))
      .returning();
    return updated;
  }
  
  async updateItemGradingReadiness(id: number, userId: number, gradingReadiness: object): Promise<Item | undefined> {
    const existing = await this.getItem(id, userId);
    if (!existing) return undefined;
    
    const [updated] = await db
      .update(items)
      .set({
        gradingReadiness: gradingReadiness,
        gradingReadinessAnalyzedAt: new Date(),
      })
      .where(eq(items.id, id))
      .returning();
    return updated;
  }

  async getActiveItems(userId: number): Promise<Item[]> {
    const now = new Date();
    return db.select().from(items)
      .where(and(
        eq(items.userId, userId),
        or(
          isNull(items.expiresAt),
          gt(items.expiresAt, now)
        )
      ))
      .orderBy(desc(items.createdAt));
  }

  async getDailyScanCount(userId: number): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const [record] = await db.select().from(dailyScans)
      .where(and(
        eq(dailyScans.userId, userId),
        sql`${dailyScans.scanDate}::text = ${today}`
      ));
    return record?.count || 0;
  }

  async incrementDailyScanCount(userId: number): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const [existing] = await db.select().from(dailyScans)
      .where(and(
        eq(dailyScans.userId, userId),
        sql`${dailyScans.scanDate}::text = ${today}`
      ));
    
    if (existing) {
      await db.update(dailyScans)
        .set({ count: existing.count + 1 })
        .where(eq(dailyScans.id, existing.id));
    } else {
      await db.insert(dailyScans).values({
        userId,
        scanDate: today,
        count: 1,
      });
    }
  }

  async canUserScan(userId: number): Promise<{ allowed: boolean; remaining: number; limit: number }> {
    const user = await this.getUser(userId);
    const tier = user?.subscriptionTier || 'free';
    
    // Admin users have unlimited scans with no restrictions
    if (user?.isAdmin) {
      return { allowed: true, remaining: -1, limit: -1 }; // -1 = unlimited
    }
    
    // Pro and Elite users have unlimited scans
    if (tier === 'pro' || tier === 'elite') {
      return { allowed: true, remaining: -1, limit: -1 }; // -1 = unlimited
    }
    
    // Free users: 5 scans per day
    const limit = 5;
    const currentCount = await this.getDailyScanCount(userId);
    const remaining = Math.max(0, limit - currentCount);
    
    return {
      allowed: currentCount < limit,
      remaining,
      limit,
    };
  }

  async getDailyArScanCount(userId: number): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const [record] = await db.select().from(dailyScans)
      .where(and(
        eq(dailyScans.userId, userId),
        sql`${dailyScans.scanDate}::text = ${today}`
      ));
    return record?.arCount || 0;
  }

  async incrementDailyArScanCount(userId: number): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const [existing] = await db.select().from(dailyScans)
      .where(and(
        eq(dailyScans.userId, userId),
        sql`${dailyScans.scanDate}::text = ${today}`
      ));
    
    if (existing) {
      await db.update(dailyScans)
        .set({ arCount: (existing.arCount || 0) + 1 })
        .where(eq(dailyScans.id, existing.id));
    } else {
      await db.insert(dailyScans).values({
        userId,
        scanDate: today,
        count: 0,
        arCount: 1,
      });
    }
  }

  async canUserArScan(userId: number): Promise<{ allowed: boolean; remaining: number; limit: number }> {
    const user = await this.getUser(userId);
    const tier = user?.subscriptionTier || 'free';
    
    // Admin users have unlimited AR scans
    if (user?.isAdmin) {
      return { allowed: true, remaining: -1, limit: -1 };
    }
    
    // Pro and Elite users have unlimited AR scans
    if (tier === 'pro' || tier === 'elite') {
      return { allowed: true, remaining: -1, limit: -1 };
    }
    
    // Free users: 7 AR scans per day
    const limit = 7;
    const currentCount = await this.getDailyArScanCount(userId);
    const remaining = Math.max(0, limit - currentCount);
    
    return {
      allowed: currentCount < limit,
      remaining,
      limit,
    };
  }

  async getCompsCache(queryKey: string): Promise<CompsCache | undefined> {
    const now = new Date();
    const [cached] = await db.select().from(compsCache)
      .where(and(
        eq(compsCache.queryKey, queryKey),
        gt(compsCache.expiresAt, now)
      ));
    return cached;
  }

  async setCompsCache(input: CompsCacheInput): Promise<void> {
    // Upsert: delete old entry if exists, then insert new
    await db.delete(compsCache).where(eq(compsCache.queryKey, input.queryKey));
    await db.insert(compsCache).values({
      queryKey: input.queryKey,
      comps: input.comps,
      lowPrice: input.lowPrice,
      medianPrice: input.medianPrice,
      highPrice: input.highPrice,
      spreadPercent: input.spreadPercent,
      message: input.message,
      expiresAt: input.expiresAt,
    });
  }

  // Inventory CRUD
  async getInventoryItems(userId: number): Promise<InventoryItem[]> {
    return db.select().from(inventoryItems)
      .where(eq(inventoryItems.userId, userId))
      .orderBy(desc(inventoryItems.createdAt));
  }

  async getInventoryItem(id: number, userId: number): Promise<InventoryItem | undefined> {
    const [item] = await db.select().from(inventoryItems)
      .where(and(eq(inventoryItems.id, id), eq(inventoryItems.userId, userId)));
    return item;
  }

  async createInventoryItem(item: Omit<InventoryItem, "id" | "createdAt" | "updatedAt">): Promise<InventoryItem> {
    const [newItem] = await db.insert(inventoryItems).values(item).returning();
    return newItem;
  }

  async updateInventoryItem(id: number, userId: number, updates: Partial<InventoryItem>): Promise<InventoryItem | undefined> {
    const existing = await this.getInventoryItem(id, userId);
    if (!existing) return undefined;
    
    const [updated] = await db
      .update(inventoryItems)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(inventoryItems.id, id))
      .returning();
    return updated;
  }

  async deleteInventoryItem(id: number, userId: number): Promise<boolean> {
    const existing = await this.getInventoryItem(id, userId);
    if (!existing) return false;
    
    await db.delete(inventoryItems).where(eq(inventoryItems.id, id));
    return true;
  }

  // Scan sessions (photo-based)
  async createScanSession(userId: number): Promise<ScanSession> {
    const [session] = await db.insert(scanSessions).values({
      userId,
      status: 'pending',
    }).returning();
    return session;
  }

  async getScanSession(id: number, userId: number): Promise<ScanSession | undefined> {
    const [session] = await db.select().from(scanSessions)
      .where(and(eq(scanSessions.id, id), eq(scanSessions.userId, userId)));
    return session;
  }

  async updateScanSession(id: number, userId: number, updates: Partial<ScanSession>): Promise<ScanSession | undefined> {
    const existing = await this.getScanSession(id, userId);
    if (!existing) return undefined;
    
    const [updated] = await db
      .update(scanSessions)
      .set(updates)
      .where(eq(scanSessions.id, id))
      .returning();
    return updated;
  }

  // Affiliate methods
  async getUserByReferralCode(code: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.referralCode, code));
    return user;
  }

  async setUserReferralCode(userId: number, code: string): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({ referralCode: code })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async setUserReferredBy(userId: number, referrerId: number): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({ referredBy: referrerId })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async getReferredUsers(affiliateId: number): Promise<User[]> {
    return db.select().from(users).where(eq(users.referredBy, affiliateId));
  }

  async getAffiliateEarnings(affiliateId: number): Promise<AffiliateEarning[]> {
    return db.select().from(affiliateEarnings)
      .where(eq(affiliateEarnings.affiliateId, affiliateId))
      .orderBy(desc(affiliateEarnings.createdAt));
  }

  async createAffiliateEarning(earning: {
    affiliateId: number;
    referredUserId: number;
    amount: string;
    paymentMonth: string;
  }): Promise<AffiliateEarning> {
    const [newEarning] = await db.insert(affiliateEarnings).values(earning).returning();
    return newEarning;
  }

  async markEarningPaid(earningId: number): Promise<AffiliateEarning | undefined> {
    const [updated] = await db.update(affiliateEarnings)
      .set({ status: 'paid', paidAt: new Date() })
      .where(eq(affiliateEarnings.id, earningId))
      .returning();
    return updated;
  }

  async generateReferralCode(): Promise<string> {
    const prefixes = [
      'FLIP', 'PROFIT', 'DEAL', 'MARGIN', 'STACK', 'CASH', 'SNIPE', 'HUSTLE', 'SCORE', 'WIN'
    ];
    const suffixes = [
      'ACE', 'PRO', 'KING', 'BOSS', 'GOLD', 'STAR', 'MAX', 'TOP', 'VIP', 'ONE',
      '22', '23', '24', '25', '42', '77', '88', '99', '100', '365'
    ];
    
    let code: string;
    let exists = true;
    let attempts = 0;
    const maxAttempts = 50;
    
    while (exists && attempts < maxAttempts) {
      const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
      const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
      code = `${prefix}-${suffix}`;
      const existing = await this.getUserByReferralCode(code);
      exists = !!existing;
      attempts++;
    }
    
    if (exists) {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      code = '';
      for (let i = 0; i < 8; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
    }
    
    return code!;
  }

  // Partner Program methods
  async getPartnerProgramSettings(): Promise<PartnerProgramSettings> {
    const [settings] = await db.select().from(partnerProgramSettings).limit(1);
    if (settings) {
      return settings as PartnerProgramSettings;
    }
    // Create default settings if none exist
    const [created] = await db.insert(partnerProgramSettings).values({
      commissionRate: 30,
      minimumPayoutCents: 2500,
      payoutDelayDays: 45,
      isActive: true,
    }).returning();
    return created as PartnerProgramSettings;
  }

  async updatePartnerProgramSettings(updates: Partial<PartnerProgramSettings>, adminId: number): Promise<PartnerProgramSettings> {
    // Ensure settings exist first
    await this.getPartnerProgramSettings();
    
    const [updated] = await db.update(partnerProgramSettings)
      .set({ ...updates, updatedAt: new Date(), updatedBy: adminId })
      .returning();
    return updated as PartnerProgramSettings;
  }

  async createPartnerCommission(data: {
    affiliateId: number;
    referredUserId: number;
    amountCents: number;
    stripeInvoiceId: string;
    stripeSubscriptionId: string;
    paymentMonth: string;
    unlockAt: Date;
  }): Promise<AffiliateEarning> {
    const [earning] = await db.insert(affiliateEarnings).values({
      ...data,
      amount: (data.amountCents / 100).toFixed(2), // Legacy field
      status: 'pending',
    }).returning();
    return earning as AffiliateEarning;
  }

  async getCommissionByInvoice(stripeInvoiceId: string): Promise<AffiliateEarning | undefined> {
    const [earning] = await db.select().from(affiliateEarnings)
      .where(eq(affiliateEarnings.stripeInvoiceId, stripeInvoiceId));
    return earning as AffiliateEarning | undefined;
  }

  async voidCommissionsForSubscription(stripeSubscriptionId: string, reason: string): Promise<number> {
    const result = await db.update(affiliateEarnings)
      .set({ 
        status: 'void', 
        voidedAt: new Date(), 
        voidReason: reason 
      })
      .where(and(
        eq(affiliateEarnings.stripeSubscriptionId, stripeSubscriptionId),
        or(
          eq(affiliateEarnings.status, 'pending'),
          eq(affiliateEarnings.status, 'eligible'),
          eq(affiliateEarnings.status, 'payable')
        )
      ))
      .returning();
    return (result as AffiliateEarning[]).length;
  }

  async unlockEligibleCommissions(): Promise<number> {
    const now = new Date();
    // First move pending -> eligible when unlock time has passed
    const unlocked = await db.update(affiliateEarnings)
      .set({ status: 'eligible' })
      .where(and(
        eq(affiliateEarnings.status, 'pending'),
        lte(affiliateEarnings.unlockAt, now)
      ))
      .returning();
    
    // Then move eligible -> payable (all eligible become payable)
    const promoted = await db.update(affiliateEarnings)
      .set({ status: 'payable' })
      .where(eq(affiliateEarnings.status, 'eligible'))
      .returning();
    
    return (unlocked as AffiliateEarning[]).length + (promoted as AffiliateEarning[]).length;
  }

  async getPartnerEarnings(affiliateId: number): Promise<AffiliateEarning[]> {
    return db.select().from(affiliateEarnings)
      .where(eq(affiliateEarnings.affiliateId, affiliateId))
      .orderBy(desc(affiliateEarnings.createdAt)) as Promise<AffiliateEarning[]>;
  }

  async getPartnerStats(affiliateId: number): Promise<{
    totalReferrals: number;
    activeSubscriptions: number;
    pendingEarnings: number;
    eligibleEarnings: number;
    payableEarnings: number;
    paidEarnings: number;
  }> {
    const referredUsers = await db.select().from(users)
      .where(eq(users.referredBy, affiliateId)) as User[];
    
    const activeSubscriptions = referredUsers.filter(u => u.subscriptionTier === 'pro').length;
    
    const earnings = await this.getPartnerEarnings(affiliateId);
    
    const pendingEarnings = earnings
      .filter(e => e.status === 'pending')
      .reduce((sum, e) => sum + (e.amountCents || 0), 0);
    
    const eligibleEarnings = earnings
      .filter(e => e.status === 'eligible')
      .reduce((sum, e) => sum + (e.amountCents || 0), 0);
    
    const payableEarnings = earnings
      .filter(e => e.status === 'payable')
      .reduce((sum, e) => sum + (e.amountCents || 0), 0);
    
    const paidEarnings = earnings
      .filter(e => e.status === 'paid')
      .reduce((sum, e) => sum + (e.amountCents || 0), 0);
    
    return {
      totalReferrals: referredUsers.length,
      activeSubscriptions,
      pendingEarnings,
      eligibleEarnings,
      payableEarnings,
      paidEarnings,
    };
  }

  async getPayableCommissions(minimumCents: number): Promise<{
    affiliateId: number;
    totalCents: number;
    earningIds: number[];
  }[]> {
    const payable = await db.select().from(affiliateEarnings)
      .where(eq(affiliateEarnings.status, 'payable')) as AffiliateEarning[];
    
    const byAffiliate = new Map<number, { totalCents: number; earningIds: number[] }>();
    
    for (const earning of payable) {
      const existing = byAffiliate.get(earning.affiliateId) || { totalCents: 0, earningIds: [] };
      existing.totalCents += earning.amountCents || 0;
      existing.earningIds.push(earning.id);
      byAffiliate.set(earning.affiliateId, existing);
    }
    
    return Array.from(byAffiliate.entries())
      .filter(([_, data]) => data.totalCents >= minimumCents)
      .map(([affiliateId, data]) => ({ affiliateId, ...data }));
  }

  async markCommissionsPaid(earningIds: number[]): Promise<number> {
    if (earningIds.length === 0) return 0;
    
    let count = 0;
    for (const id of earningIds) {
      const [updated] = await db.update(affiliateEarnings)
        .set({ status: 'paid', paidAt: new Date() })
        .where(eq(affiliateEarnings.id, id))
        .returning();
      if (updated) count++;
    }
    return count;
  }

  // Batch scanning methods
  async createBatchSession(userId: number): Promise<BatchSession> {
    const [session] = await db.insert(batchSessions).values({
      userId,
      status: 'active',
    }).returning();
    return session;
  }

  async getBatchSession(id: number, userId: number): Promise<BatchSession | undefined> {
    const [session] = await db.select().from(batchSessions)
      .where(and(eq(batchSessions.id, id), eq(batchSessions.userId, userId)));
    return session;
  }

  async getActiveBatchSession(userId: number): Promise<BatchSession | undefined> {
    const [session] = await db.select().from(batchSessions)
      .where(and(
        eq(batchSessions.userId, userId),
        or(eq(batchSessions.status, 'active'), eq(batchSessions.status, 'processing'))
      ))
      .orderBy(desc(batchSessions.startedAt));
    return session;
  }

  async updateBatchSession(id: number, userId: number, updates: Partial<BatchSession>): Promise<BatchSession | undefined> {
    const existing = await this.getBatchSession(id, userId);
    if (!existing) return undefined;
    
    const [updated] = await db
      .update(batchSessions)
      .set(updates)
      .where(eq(batchSessions.id, id))
      .returning();
    return updated;
  }

  async addBatchItem(batchId: number, userId: number, inputType: string, inputValue: string): Promise<BatchItem> {
    const [item] = await db.insert(batchItems).values({
      batchId,
      userId,
      inputType,
      inputValue,
      status: 'pending',
    }).returning();
    
    // Update total items count
    await db.update(batchSessions)
      .set({ totalItems: sql`${batchSessions.totalItems} + 1` })
      .where(eq(batchSessions.id, batchId));
    
    return item;
  }

  async getBatchItems(batchId: number, userId: number): Promise<BatchItem[]> {
    return db.select().from(batchItems)
      .where(and(eq(batchItems.batchId, batchId), eq(batchItems.userId, userId)))
      .orderBy(batchItems.createdAt);
  }

  async getBatchItem(id: number, userId: number): Promise<BatchItem | undefined> {
    const [item] = await db.select().from(batchItems)
      .where(and(eq(batchItems.id, id), eq(batchItems.userId, userId)));
    return item;
  }

  async updateBatchItem(id: number, userId: number, updates: Partial<BatchItem>): Promise<BatchItem | undefined> {
    const [updated] = await db
      .update(batchItems)
      .set(updates)
      .where(and(eq(batchItems.id, id), eq(batchItems.userId, userId)))
      .returning();
    return updated;
  }

  async claimNextPendingBatchItem(batchId: number, userId: number): Promise<BatchItem | undefined> {
    const [item] = await db.select().from(batchItems)
      .where(and(
        eq(batchItems.batchId, batchId), 
        eq(batchItems.userId, userId),
        eq(batchItems.status, 'pending')
      ))
      .orderBy(batchItems.createdAt)
      .limit(1);
    
    if (!item) return undefined;
    
    const [claimed] = await db
      .update(batchItems)
      .set({ status: 'processing' })
      .where(and(
        eq(batchItems.id, item.id),
        eq(batchItems.status, 'pending')
      ))
      .returning();
    
    return claimed;
  }

  async getNextPendingBatchItem(batchId: number): Promise<BatchItem | undefined> {
    const [item] = await db.select().from(batchItems)
      .where(and(eq(batchItems.batchId, batchId), eq(batchItems.status, 'pending')))
      .orderBy(batchItems.createdAt)
      .limit(1);
    return item;
  }

  async incrementBatchProcessed(batchId: number): Promise<void> {
    await db.update(batchSessions)
      .set({ processedItems: sql`${batchSessions.processedItems} + 1` })
      .where(eq(batchSessions.id, batchId));
  }

  async updateBatchItemAction(id: number, userId: number, action: 'accepted' | 'skipped'): Promise<BatchItem | undefined> {
    const existing = await this.getBatchItem(id, userId);
    if (!existing) return undefined;
    
    const [updated] = await db
      .update(batchItems)
      .set({ userAction: action })
      .where(eq(batchItems.id, id))
      .returning();
    
    // Update session counters
    if (existing.batchId) {
      if (action === 'accepted') {
        await db.update(batchSessions)
          .set({ acceptedItems: sql`${batchSessions.acceptedItems} + 1` })
          .where(eq(batchSessions.id, existing.batchId));
      } else {
        await db.update(batchSessions)
          .set({ skippedItems: sql`${batchSessions.skippedItems} + 1` })
          .where(eq(batchSessions.id, existing.batchId));
      }
    }
    
    return updated;
  }

  async deleteBatchItem(id: number, userId: number): Promise<boolean> {
    const existing = await this.getBatchItem(id, userId);
    if (!existing) return false;
    
    await db
      .delete(batchItems)
      .where(eq(batchItems.id, id));
    
    // Update session total count
    if (existing.batchId) {
      await db.update(batchSessions)
        .set({ totalItems: sql`${batchSessions.totalItems} - 1` })
        .where(eq(batchSessions.id, existing.batchId));
    }
    
    return true;
  }

  async getUserBatchSessions(userId: number): Promise<BatchSession[]> {
    return db.select().from(batchSessions)
      .where(eq(batchSessions.userId, userId))
      .orderBy(desc(batchSessions.startedAt));
  }

  // Password reset token methods
  async createPasswordResetToken(userId: number, token: string, expiresAt: Date): Promise<PasswordResetToken> {
    const [resetToken] = await db.insert(passwordResetTokens)
      .values({ userId, token, expiresAt })
      .returning();
    return resetToken;
  }

  async getValidPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    const [resetToken] = await db.select().from(passwordResetTokens)
      .where(and(
        eq(passwordResetTokens.token, token),
        gt(passwordResetTokens.expiresAt, new Date()),
        isNull(passwordResetTokens.usedAt)
      ));
    return resetToken;
  }

  async markPasswordResetTokenUsed(id: number): Promise<void> {
    await db.update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, id));
  }

  async updateUserPassword(userId: number, hashedPassword: string): Promise<void> {
    await db.update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, userId));
  }

  async updateUsername(userId: number, newUsername: string): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set({ username: newUsername })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateUserGoogleId(userId: number, googleId: string): Promise<void> {
    await db.update(users)
      .set({ googleId })
      .where(eq(users.id, userId));
  }

  async updateUserAppleId(userId: number, appleId: string): Promise<void> {
    await db.update(users)
      .set({ appleId })
      .where(eq(users.id, userId));
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
    return user;
  }

  async getUserByAppleId(appleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.appleId, appleId));
    return user;
  }
  
  // Hot items methods
  async upsertHotItem(item: InsertHotItem): Promise<HotItem> {
    // Check if item exists by category + queryKey
    const existing = await db.select()
      .from(hotItems)
      .where(and(
        eq(hotItems.category, item.category),
        eq(hotItems.queryKey, item.queryKey)
      ));
    
    if (existing.length > 0) {
      // Update existing
      const [updated] = await db.update(hotItems)
        .set({
          sampleTitle: item.sampleTitle,
          sales7d: item.sales7d,
          sales30d: item.sales30d,
          lastSoldAt: item.lastSoldAt,
          medianPrice: item.medianPrice,
          updatedAt: new Date(),
        })
        .where(eq(hotItems.id, existing[0].id))
        .returning();
      return updated;
    } else {
      // Insert new
      const [created] = await db.insert(hotItems)
        .values(item)
        .returning();
      return created;
    }
  }
  
  async getHottestItems(limit: number = 10): Promise<HotItem[]> {
    // Get top items by sales7d, fallback to sales30d
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    return db.select()
      .from(hotItems)
      .where(gte(hotItems.updatedAt, sevenDaysAgo))
      .orderBy(desc(hotItems.sales7d), desc(hotItems.lastSoldAt))
      .limit(limit);
  }
  
  async getHottestByCategory(category: string, limit: number = 5): Promise<HotItem[]> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    return db.select()
      .from(hotItems)
      .where(and(
        eq(hotItems.category, category),
        gte(hotItems.updatedAt, sevenDaysAgo)
      ))
      .orderBy(desc(hotItems.sales7d), desc(hotItems.lastSoldAt))
      .limit(limit);
  }

  // Business expenses methods
  async getBusinessExpenses(userId: number, taxYear?: number): Promise<BusinessExpense[]> {
    if (taxYear) {
      return db.select()
        .from(businessExpenses)
        .where(and(
          eq(businessExpenses.userId, userId),
          eq(businessExpenses.taxYear, taxYear)
        ))
        .orderBy(desc(businessExpenses.date));
    }
    return db.select()
      .from(businessExpenses)
      .where(eq(businessExpenses.userId, userId))
      .orderBy(desc(businessExpenses.date));
  }

  async getBusinessExpense(id: number, userId: number): Promise<BusinessExpense | undefined> {
    const [expense] = await db.select()
      .from(businessExpenses)
      .where(and(
        eq(businessExpenses.id, id),
        eq(businessExpenses.userId, userId)
      ));
    return expense;
  }

  async createBusinessExpense(expense: Omit<BusinessExpense, "id" | "createdAt" | "updatedAt">): Promise<BusinessExpense> {
    const [created] = await db.insert(businessExpenses)
      .values(expense)
      .returning();
    return created;
  }

  async updateBusinessExpense(id: number, userId: number, updates: Partial<BusinessExpense>): Promise<BusinessExpense | undefined> {
    const [updated] = await db.update(businessExpenses)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(
        eq(businessExpenses.id, id),
        eq(businessExpenses.userId, userId)
      ))
      .returning();
    return updated;
  }

  async deleteBusinessExpense(id: number, userId: number): Promise<boolean> {
    const result = await db.delete(businessExpenses)
      .where(and(
        eq(businessExpenses.id, id),
        eq(businessExpenses.userId, userId)
      ));
    return true;
  }

  async getExpenseSummaryByCategory(userId: number, taxYear: number): Promise<{ category: string; total: number; count: number }[]> {
    const expenses = await db.select()
      .from(businessExpenses)
      .where(and(
        eq(businessExpenses.userId, userId),
        eq(businessExpenses.taxYear, taxYear)
      ));
    
    const summary: Record<string, { total: number; count: number }> = {};
    for (const exp of expenses) {
      if (!summary[exp.category]) {
        summary[exp.category] = { total: 0, count: 0 };
      }
      summary[exp.category].total += parseFloat(exp.amount || '0');
      summary[exp.category].count++;
    }
    
    return Object.entries(summary).map(([category, data]) => ({
      category,
      total: data.total,
      count: data.count
    }));
  }

  // Sourcing locations methods
  async getSourcingLocations(userId: number): Promise<SourcingLocation[]> {
    return db.select()
      .from(sourcingLocations)
      .where(eq(sourcingLocations.userId, userId))
      .orderBy(sourcingLocations.name);
  }

  async createSourcingLocation(location: Omit<SourcingLocation, "id" | "createdAt">): Promise<SourcingLocation> {
    const [created] = await db.insert(sourcingLocations)
      .values(location)
      .returning();
    return created;
  }

  async deleteSourcingLocation(id: number, userId: number): Promise<boolean> {
    await db.delete(sourcingLocations)
      .where(and(
        eq(sourcingLocations.id, id),
        eq(sourcingLocations.userId, userId)
      ));
    return true;
  }
}

export const storage = new DatabaseStorage();
