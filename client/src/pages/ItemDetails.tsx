import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useItems, useCreateInventoryItem, useUpdateInventoryItem, useInventory, useScanStatus, useUpdateDecision } from "@/hooks/use-items";
import { BottomNav } from "@/components/BottomNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, ExternalLink, Share2, CheckCircle, Check, TrendingUp, TrendingDown, Minus, ChevronDown, Calculator, Package, Loader2, Sparkles, Truck, Zap, X, RefreshCw, AlertTriangle, DollarSign, Save, Camera, ThumbsUp, ThumbsDown, FileText, Copy, CheckCheck, Tag } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PLATFORM_FEE_RATE, OUTBOUND_SHIPPING_DEFAULT, formatShippingDisplay, calculatePlatformFees, calculateNetProfit, parseShipping, safeNumber, safeToFixed } from "@shared/calculations";
import type { CompsResult, SoldComp } from "@shared/schema";
import { computeCompsStats } from "@/lib/comps";
import { getFlipTierInfo, getFlipTierInfoByProfit, generateEbaySearchUrl, FLIP_THRESHOLDS, getFlipScoreBreakdown, getFlipHeadline, calculateROI, formatROI, getMomentumBadges, calculateFlipScore, type MomentumIndicator } from "@shared/flipScore";
import { type DecisionResult, getMarginBand, calculateDecision } from "@shared/decisionEngine";
import { JudgmentAnimation } from "@/components/JudgmentAnimation";
import { getAutoSuggestedBand, getBandSuggestions } from "@shared/watchLibrary";
import { BuyModeResults } from "@/components/BuyModeResults";
import { MultiPlatformListing } from "@/components/MultiPlatformListing";
import { LearningModeBanner } from "@/components/LearningModeBanner";
import { SkipSuggestion } from "@/components/ScanEfficiency";

export default function ItemDetails() {
  const [, params] = useRoute("/item/:id");
  const { data: items, isLoading } = useItems();
  const { data: scanStatus } = useScanStatus();
  const { toast } = useToast();
  const [isCalcOpen, setIsCalcOpen] = useState(false);
  const [location, navigate] = useLocation();
  const createInventoryItem = useCreateInventoryItem();
  const updateInventoryItem = useUpdateInventoryItem();
  const { data: inventoryItems } = useInventory();
  const updateDecision = useUpdateDecision();
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showListingModal, setShowListingModal] = useState(false);
  const [showCrossPostModal, setShowCrossPostModal] = useState(false);
  const [showListNowPrompt, setShowListNowPrompt] = useState(false); // Prompt after marking as bought
  const [generatedListing, setGeneratedListing] = useState<{
    title: string;
    description: string;
    suggestedPrice: number;
    suggestedCategory: string;
    itemSpecifics: Record<string, string>;
    keywords: Array<{
      keyword: string;
      score: number;
      competition: 'low' | 'medium' | 'high';
      searchVolume: 'low' | 'medium' | 'high';
      tip: string;
    }>;
    titleScore?: number | null;
    titleAnalysis?: string | null;
    alternativeTitles?: string[];
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [buyerPaysShipping, setBuyerPaysShipping] = useState(true); // Default ON for optimistic estimate
  const [showAllComps, setShowAllComps] = useState(false); // For expandable market evidence
  const [editableCost, setEditableCost] = useState<string>(""); // User-editable purchase cost
  const [costSaved, setCostSaved] = useState(false);
  const queryClient = useQueryClient();
  
  // Parse batch navigation context from URL
  const searchParams = new URLSearchParams(location.split('?')[1] || '');
  const batchItemIds = searchParams.get('batch')?.split(',').map(Number).filter(n => !isNaN(n)) || [];
  const currentBatchIndex = parseInt(searchParams.get('idx') || '-1', 10);
  const isInBatchMode = batchItemIds.length > 0 && currentBatchIndex >= 0;
  
  // Mutation to update item cost
  const updateCostMutation = useMutation({
    mutationFn: async ({ itemId, buyPrice }: { itemId: number; buyPrice: number }) => {
      const res = await apiRequest('PATCH', `/api/items/${itemId}`, { buyPrice });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/items'] });
      // Clear the editable cost so decision recalculates with the new stored value
      setEditableCost(variables.buyPrice.toString());
      setCostSaved(true);
      toast({ title: "Cost saved!", description: "Margin recalculated with your purchase price." });
      setTimeout(() => setCostSaved(false), 2000);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save cost", description: err.message, variant: "destructive" });
    }
  });
  
  // Mutation to generate eBay listing
  const generateListingMutation = useMutation({
    mutationFn: async (itemId: number) => {
      // Reset previous state before new request
      setGeneratedListing(null);
      setCopiedField(null);
      
      const res = await apiRequest('POST', `/api/items/${itemId}/generate-listing`, {});
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ message: 'Request failed' }));
        throw new Error(errData.message || 'Failed to generate listing');
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success && data.listing) {
        setGeneratedListing(data.listing);
        setShowListingModal(true);
      } else {
        toast({ title: "Failed to generate listing", variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Failed to generate listing", description: err.message, variant: "destructive" });
    }
  });

  // Copy to clipboard helper with error handling
  const copyToClipboard = async (text: string, fieldName: string) => {
    if (!text) {
      toast({ title: "Nothing to copy", variant: "destructive" });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Clipboard API failed:', err);
      toast({ title: "Copy failed - try selecting text manually", variant: "destructive" });
    }
  };

  // Reset showAllComps when item changes to ensure default collapsed state
  useEffect(() => {
    setShowAllComps(false);
  }, [params?.id]);
  
  // Debug logging for item details page
  console.log("ITEM DETAILS - params:", params, "items count:", items?.length);
  
  const item = items?.find(i => i.id === Number(params?.id));
  
  // Initialize editable cost from item when item loads
  useEffect(() => {
    if (item) {
      const savedCost = item.buyPrice || item.price;
      setEditableCost(savedCost ? String(savedCost) : "");
    }
  }, [item?.id, item?.buyPrice, item?.price]);
  
  console.log("ITEM DETAILS - found item:", item ? { id: item.id, title: item.confirmedTitle || item.title } : null);

  const handleShare = () => {
    if (navigator.share && item) {
      navigator.share({
        title: item.confirmedTitle || item.title || "eBay Analysis",
        text: `Check out this analysis: ${item.analysis}`,
        url: window.location.href,
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast({ title: "Copied to clipboard" });
    }
  };

  // Show loading if items haven't loaded yet (isLoading or items is undefined)
  if (isLoading || !items) {
    return <div className="min-h-screen flex items-center justify-center bg-background">Loading...</div>;
  }

  if (!item) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-2xl font-bold mb-2">Item not found</h2>
        <p className="text-muted-foreground mb-6">This scan may have been deleted or does not exist.</p>
        <Link href="/scans">
          <Button>Back to Scans</Button>
        </Link>
      </div>
    );
  }

  // Buy Mode: render completely separate results UI
  if ((item as any).scanMode === 'buy') {
    return (
      <>
        <BuyModeResults 
          item={item} 
          onShare={handleShare}
        />
        <BottomNav />
      </>
    );
  }

  // Extract data from rawAnalysis and stored values - with defensive guards
  console.log("ITEM DETAILS - extracting data from item:", {
    rawAnalysis: item.rawAnalysis,
    manualCompPrices: item.manualCompPrices,
    compSource: item.compSource,
    avgComp: item.avgComp,
    buyPrice: item.buyPrice,
    price: item.price,
    confidence: item.confidence,
    decisionVerdict: (item as any).decisionVerdict,
    decisionScore: (item as any).decisionScore
  });
  
  // Note: All decision logic now goes through calculateDecision() in shared/decisionEngine.ts
  // The margin-based decision is calculated fresh on every render to ensure consistency
  
  type RawAnalysisType = { 
    netProfit?: number; 
    avgSoldPrice?: number; 
    comps?: CompsResult;
    priceConfidence?: 'high' | 'moderate' | 'low' | 'ai_estimate';
    displayMode?: 'single' | 'range' | 'estimate_range';
    resaleRange?: { low: number; high: number };
    inconsistentComps?: boolean;
    ceilingApplied?: boolean;
    clampApplied?: boolean;
  };
  let rawAnalysis: RawAnalysisType | null = null;
  try {
    if (item.rawAnalysis && typeof item.rawAnalysis === 'object') {
      rawAnalysis = item.rawAnalysis as RawAnalysisType;
    }
  } catch (err) {
    console.error('ITEM DETAILS ERROR - Failed to parse rawAnalysis:', err);
  }
  const compsResult = rawAnalysis?.comps || null;
  
  // Extract pricing engine fields for confidence display
  const priceConfidence = rawAnalysis?.priceConfidence || 'low';
  const displayMode = rawAnalysis?.displayMode || 'estimate_range';
  const resaleRange = rawAnalysis?.resaleRange;
  const inconsistentComps = rawAnalysis?.inconsistentComps || false;
  const clampApplied = rawAnalysis?.clampApplied || false;
  const ceilingApplied = rawAnalysis?.ceilingApplied || false;
  
  // Use clamped avgSoldPrice from rawAnalysis when available (pricing engine source of truth)
  const pricingEngineValue = rawAnalysis?.avgSoldPrice;
  
  // Check for manual comps - with defensive array handling
  let manualCompPrices: number[] = [];
  try {
    const rawPrices = item.manualCompPrices;
    if (rawPrices && Array.isArray(rawPrices)) {
      manualCompPrices = rawPrices.filter((p): p is number => typeof p === 'number' && !isNaN(p) && isFinite(p) && p > 0);
    }
  } catch (err) {
    console.error('ITEM DETAILS ERROR - Failed to parse manualCompPrices:', err);
  }
  
  let manualCompsStats: ReturnType<typeof computeCompsStats> = null;
  try {
    if (manualCompPrices.length >= 3) {
      manualCompsStats = computeCompsStats(manualCompPrices);
    }
  } catch (err) {
    console.error('ITEM DETAILS ERROR - Failed to compute comps stats:', err);
  }
  
  const compSource = (item.compSource as 'ebay_api' | 'manual' | 'none' | null) || 'none';
  
  // Use manual comp stats if available, otherwise use API comps
  // IMPORTANT: Used and New are COMPLETELY SEPARATE pricing - never mixed
  // Priority: Manual comps > Condition-specific (Used OR New) > Fallback
  const hasManualComps = compSource === 'manual' && manualCompsStats !== null;
  let avgSoldPrice = 0;
  try {
    // Determine item condition first
    const itemCondition = (item.condition || '').toLowerCase();
    const isUsedCondition = itemCondition.includes('used') || itemCondition.includes('pre-owned') || itemCondition === '';
    
    if (hasManualComps && manualCompsStats) {
      // Manual comps always take priority - user's explicit input
      avgSoldPrice = safeNumber(manualCompsStats.avg, 0);
    } else if (compsResult?.conditionStats) {
      // ALWAYS use condition-specific pricing - Used and New NEVER mix
      if (isUsedCondition && compsResult.conditionStats.used.count > 0 && compsResult.conditionStats.used.medianPrice) {
        // Item is Used - ONLY use Used comp prices
        avgSoldPrice = safeNumber(compsResult.conditionStats.used.medianPrice, 0);
      } else if (!isUsedCondition && compsResult.conditionStats.newLike.count > 0 && compsResult.conditionStats.newLike.medianPrice) {
        // Item is New/Like New - ONLY use New comp prices
        avgSoldPrice = safeNumber(compsResult.conditionStats.newLike.medianPrice, 0);
      } else {
        // NO comps for this specific condition - DO NOT mix with other condition
        // Leave avgSoldPrice at 0 to indicate insufficient condition-specific data
        avgSoldPrice = 0;
        console.log(`[CONDITION PRICING] No ${isUsedCondition ? 'Used' : 'New'} comps - insufficient data`);
      }
    } else if (pricingEngineValue && pricingEngineValue > 0) {
      // Legacy fallback - only use if no conditionStats at all
      avgSoldPrice = pricingEngineValue;
    } else {
      avgSoldPrice = safeNumber(rawAnalysis?.avgSoldPrice, safeNumber(item.avgComp, 0));
    }
  } catch (err) {
    console.error('ITEM DETAILS ERROR - Failed to calculate avgSoldPrice:', err);
  }
  
  const itemConditionUsed = (item.condition || '').toLowerCase();
  const usedConditionApplied = itemConditionUsed.includes('used') || itemConditionUsed.includes('pre-owned') || itemConditionUsed === '';
  
  console.log("ITEM DETAILS - calculated values:", {
    hasManualComps,
    avgSoldPrice,
    manualCompPrices,
    manualCompsStats,
    compSource,
    itemCondition: item.condition,
    usedConditionApplied,
    conditionStats: compsResult?.conditionStats
  });

  // Generate eBay search URL for fallback (always available)
  const itemTitle = item.confirmedTitle || item.title || "";
  let ebaySearchUrl = "";
  try {
    ebaySearchUrl = compsResult?.ebaySearchUrl || generateEbaySearchUrl(itemTitle);
  } catch (err) {
    console.error('ITEM DETAILS ERROR - Failed to generate eBay URL:', err);
    ebaySearchUrl = "https://www.ebay.com/sch/i.html?_nkw=";
  }
  
  // Calculate effective outbound shipping (0 if buyer pays)
  const effectiveOutboundShipping = buyerPaysShipping 
    ? 0 
    : safeNumber(item.outboundShipping, OUTBOUND_SHIPPING_DEFAULT);
  
  // Calculate net profit using single source of truth with safe number parsing
  let netProfit = 0;
  try {
    const profitInputs = {
      avgSoldPrice,
      buyPrice: safeNumber(item.buyPrice || item.price, 0),
      shippingIn: parseShipping(item.shippingIn || item.shipping),
      platformFeeRate: safeNumber(item.platformFeeRate, PLATFORM_FEE_RATE),
      outboundShipping: effectiveOutboundShipping,
    };
    console.log("ITEM DETAILS - profit calculation inputs:", profitInputs);
    netProfit = calculateNetProfit(profitInputs);
    console.log("ITEM DETAILS - netProfit result:", netProfit);
  } catch (err) {
    console.error('ITEM DETAILS ERROR - Failed to calculate netProfit:', err);
    netProfit = 0;
  }
  
  const isPositive = netProfit > 0;
  const isNegative = netProfit < 0;

  // Get tier info from profit-based helper (deterministic, single source of truth)
  // Flip: profit > $0, Marginal: profit -$5 to $0, Skip: profit < -$5
  let tierInfo: ReturnType<typeof getFlipTierInfoByProfit> = { tier: 'skip', label: 'Skip', color: '#ef4444', bgColor: '#ef4444', textClass: 'text-red-400', bgClass: 'bg-red-500' };
  try {
    tierInfo = getFlipTierInfoByProfit(netProfit);
  } catch (err) {
    console.error('ITEM DETAILS ERROR - Failed to get tier info:', err);
  }
  
  // MARGIN-BASED DECISION - Single source of truth
  // Always recalculate with current effectiveBuyPrice to keep UI in sync with user input
  const effectiveBuyPrice = editableCost ? parseFloat(editableCost) || 0 : safeNumber(item.buyPrice || item.price, 0);
  
  // Get stored decision from backend
  const storedDecision = (item as any).decisionData as {
    verdict?: 'flip' | 'skip';
    label?: string;
    marginPercent?: number;
    confidence?: number;
    decisionTrace?: string[];
    maxBuy?: number;
    marketValue?: number;
  } | null;
  
  const marginDecision = (() => {
    try {
      const shippingIn = parseShipping(item.shippingIn || item.shipping);
      // Use stored market value from backend decision, or fall back to avgSoldPrice
      const expectedSalePrice = storedDecision?.marketValue || avgSoldPrice;
      
      // Always recalculate with current effectiveBuyPrice to ensure UI stays in sync
      // This handles both user input changes and saved cost updates
      if (expectedSalePrice > 0 && effectiveBuyPrice > 0) {
        return calculateDecision({
          buyPrice: effectiveBuyPrice,
          shippingIn,
          expectedSalePrice,
          platformFeeRate: PLATFORM_FEE_RATE,
          outboundShipping: effectiveOutboundShipping,
        });
      }
      
      // Fallback to stored decision if we can't recalculate
      if (storedDecision && storedDecision.verdict) {
        return storedDecision;
      }
      
      return null;
    } catch (err) {
      console.error('Failed to calculate margin decision:', err);
      return null;
    }
  })();
  
  // Use margin-based verdict ONLY (no dollar-based overrides)
  const finalVerdict = marginDecision?.verdict || 'skip';
  const finalLabel = marginDecision?.label || 'Skip IT';
  const marginBand = marginDecision ? getMarginBand(marginDecision.marginPercent ?? 0) : null;
  
  // Derive verdict icon from margin-based decision (binary: FLIP or SKIP only)
  const VerdictIcon = finalVerdict === 'flip' ? TrendingUp : TrendingDown;
  
  // NEUTRAL GREY result card - no red/green gradients on verdict screen
  const verdictStyles = {
    bg: "bg-card border border-border",
    text: "text-foreground",
    label: finalLabel,
  };
  const flipScoreColors = { 
    text: tierInfo.textClass, 
    bg: tierInfo.bgClass, 
    hex: tierInfo.color 
  };
  
  // Calculate confidence score breakdown for transparency
  let hasCompsData = false;
  let compsCount = 0;
  let spreadPercent: number | null = null;
  let buyPrice = 0;
  let marginPercent: number | null = null;
  let scoreBreakdown: ReturnType<typeof getFlipScoreBreakdown> = { factors: [], summary: '' };
  let roi = 0;
  let momentumBadges: MomentumIndicator[] = [];
  let flipScore = 0; // New ROI-weighted score
  
  try {
    hasCompsData = Boolean(hasManualComps) || Boolean(compsResult?.comps && Array.isArray(compsResult.comps) && compsResult.comps.length > 0);
    compsCount = hasManualComps 
      ? manualCompPrices.length 
      : (compsResult?.comps && Array.isArray(compsResult.comps) ? compsResult.comps.length : 0);
    
    const rawSpread = hasManualComps && manualCompsStats
      ? manualCompsStats.spread
      : compsResult?.spreadPercent;
    const spreadValue = rawSpread !== undefined && rawSpread !== null ? safeNumber(rawSpread, 0) : null;
    spreadPercent = typeof spreadValue === 'number' && !isNaN(spreadValue) ? spreadValue : null;
    
    buyPrice = safeNumber(item.buyPrice || item.price, 0);
    marginPercent = avgSoldPrice > 0 && buyPrice > 0 
      ? ((netProfit / buyPrice) * 100) 
      : null;
    
    // Calculate ROI for return efficiency scoring
    roi = calculateROI(buyPrice, netProfit);
    
    // Calculate NEW ROI-weighted confidence score
    flipScore = calculateFlipScore({
      buyPrice,
      netProfit,
      compsCount,
      spreadPercent,
      hasComps: hasCompsData
    });
    
    // Get momentum badges for high-quality flips
    momentumBadges = getMomentumBadges({
      buyPrice,
      netProfit,
      compsCount,
      spreadPercent
    });
    
    scoreBreakdown = getFlipScoreBreakdown(
      flipScore, 
      hasCompsData, 
      compsCount, 
      spreadPercent, 
      marginPercent,
      roi
    );
    console.log("ITEM DETAILS - ROI score:", flipScore, "ROI:", roi, "badges:", momentumBadges);
  } catch (err) {
    console.error('ITEM DETAILS ERROR - Failed to calculate score breakdown:', err);
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Navbar */}
      <div className="sticky top-0 z-10 flex items-center justify-between p-4 bg-background/80 backdrop-blur-md border-b border-border/50">
        <Link href="/scans">
          <Button variant="ghost" size="icon" className="-ml-2" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="font-semibold text-sm uppercase tracking-wide opacity-70">Analysis Result</h1>
        <Button variant="ghost" size="icon" className="-mr-2" onClick={handleShare} data-testid="button-share">
          <Share2 className="w-5 h-5" />
        </Button>
      </div>

      <div className="p-4 space-y-6">
        <LearningModeBanner variant="compact" />
        
        {/* Main Result Card - Neutral Grey with Verdict + Margin Band ONLY */}
        <motion.div 
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="relative overflow-hidden rounded-3xl p-6 text-center bg-muted/50 border border-border"
        >
          {/* VERDICT - JudgmentAnimation with 240ms reveal - key ensures animation replays on new items */}
          <div className="mb-3">
            <JudgmentAnimation 
              key={`verdict-${item.id}`}
              verdict={finalVerdict} 
              className="justify-center"
            />
          </div>
          
          {/* Plain-language verdict subheading */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15, delay: 0.20 }}
            className={cn(
              "text-sm font-medium mb-3",
              finalVerdict === 'flip' ? "text-emerald-400" : "text-red-400"
            )}
            data-testid="text-verdict-subheading"
          >
            {finalVerdict === 'flip' 
              ? "Profitable at current market prices." 
              : "You lose money on this item."}
          </motion.p>
          
          {/* Margin visual display */}
          {marginBand && marginDecision && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, delay: 0.25 }}
              className="mb-3"
            >
              <p className={cn("text-sm font-medium mb-2", marginBand.color)} data-testid="text-margin-band">
                {marginDecision.marginPercent}% profit margin
              </p>
              <div className="flex items-center gap-2 px-4">
                <span className="text-[10px] text-muted-foreground">0%</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden relative">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(marginDecision.marginPercent ?? 0, 100)}%` }}
                    transition={{ duration: 0.4, delay: 0.3, ease: "easeOut" }}
                    className={cn(
                      "h-full rounded-full",
                      (marginDecision.marginPercent ?? 0) >= 50 ? "bg-emerald-500" :
                      (marginDecision.marginPercent ?? 0) >= 25 ? "bg-green-500" :
                      (marginDecision.marginPercent ?? 0) >= 10 ? "bg-yellow-500" :
                      "bg-red-500"
                    )}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">100%</span>
              </div>
            </motion.div>
          )}

          {/* Price Confidence Badge + Signal Strength */}
          {marginDecision && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, delay: 0.30 }}
              className="pt-3 border-t border-border/50"
            >
              <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
                {/* Price Confidence Badge */}
                <Badge 
                  variant={priceConfidence === 'high' ? 'default' : priceConfidence === 'moderate' ? 'secondary' : 'destructive'}
                  className={cn(
                    "text-[10px] px-1.5 h-5",
                    priceConfidence === 'high' && "bg-green-500",
                    priceConfidence === 'moderate' && "bg-yellow-500 text-black",
                    priceConfidence === 'low' && "bg-red-500/80",
                    priceConfidence === 'ai_estimate' && "bg-red-500"
                  )}
                  data-testid="badge-price-confidence"
                >
                  {priceConfidence === 'high' ? 'High Conf' : 
                   priceConfidence === 'moderate' ? 'Mod Conf' : 
                   priceConfidence === 'ai_estimate' ? 'AI Est' : 'Limited'}
                </Badge>
                
                <span data-testid="text-signal-strength">
                  Signal {marginDecision.confidence}%
                </span>
                <div className="w-12 h-1 bg-muted rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${marginDecision.confidence}%` }}
                    transition={{ duration: 0.3, delay: 0.35, ease: "easeOut" }}
                    className="h-full rounded-full bg-foreground/30"
                  />
                </div>
              </div>
              
              {/* Pricing Warnings */}
              {(inconsistentComps || clampApplied || ceilingApplied) && (
                <div className="flex items-center justify-center gap-1.5 mt-2 text-[10px] text-yellow-500">
                  <AlertTriangle className="w-3 h-3" />
                  <span>
                    {clampApplied 
                      ? 'Price capped to prevent overestimation' 
                      : ceilingApplied 
                        ? 'Category ceiling applied'
                        : 'Wide price range due to inconsistent comps'}
                  </span>
                </div>
              )}
            </motion.div>
          )}
          
          {/* Decision Trace - Why this result? */}
          {marginDecision?.decisionTrace && marginDecision.decisionTrace.length > 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, delay: 0.33 }}
              className="mt-4 pt-3 border-t border-border/50"
            >
              <Collapsible>
                <CollapsibleTrigger className="flex items-center justify-center gap-1.5 w-full text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="button-decision-trace-toggle">
                  <span>Why this result?</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-3 space-y-1.5 text-left" data-testid="decision-trace-list">
                    {marginDecision.decisionTrace.map((line, idx) => (
                      <div 
                        key={idx} 
                        className="flex items-start gap-2 text-xs text-muted-foreground"
                        data-testid={`decision-trace-item-${idx}`}
                      >
                        <span className="text-muted-foreground/50 font-mono min-w-[1rem]">{idx + 1}.</span>
                        <span>{line}</span>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </motion.div>
          )}
          
          {/* Assumptions and risk disclaimer */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15, delay: 0.38 }}
            className="mt-3 space-y-1"
          >
            <p className="text-xs text-muted-foreground/60" data-testid="text-assumptions">
              Assumes buyer-paid shipping, standard platform fees.
            </p>
            {finalVerdict === 'flip' && (
              <p className="text-xs text-muted-foreground/50" data-testid="text-risk-disclaimer">
                Actual results may vary due to price volatility and condition differences.
              </p>
            )}
          </motion.div>
          
          {/* Efficiency tip for skip/risky verdicts */}
          {finalVerdict === 'skip' && (
            <SkipSuggestion verdict="skip" category={item.category || undefined} />
          )}
        </motion.div>

        {/* Purchase Cost Input - for accurate margin calculation */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
        >
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Your Purchase Cost
              </h4>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={editableCost}
                  onChange={(e) => setEditableCost(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'e' || e.key === 'E' || e.key === '+' || e.key === '-') {
                      e.preventDefault();
                    }
                  }}
                  className="pl-7 text-lg font-mono"
                  data-testid="input-purchase-cost"
                />
              </div>
              <Button
                onClick={() => {
                  const cost = parseFloat(editableCost);
                  if (!isNaN(cost) && cost >= 0 && item) {
                    updateCostMutation.mutate({ itemId: item.id, buyPrice: cost });
                  }
                }}
                disabled={updateCostMutation.isPending || !editableCost}
                className="min-w-[80px]"
                data-testid="button-save-cost"
              >
                {updateCostMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : costSaved ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-1" />
                    Save
                  </>
                )}
              </Button>
            </div>
            
            <p className="text-xs text-muted-foreground mt-2">
              Enter what you paid to see accurate profit margin
            </p>
            
            {/* FLIP IT / SKIP IT Decision Buttons */}
            <div className="flex gap-3 mt-4 pt-4 border-t border-border">
              <Button
                className="flex-1 bg-green-500 hover-elevate"
                onClick={async () => {
                  if (!item) return;
                  setIsFlipping(true);
                  try {
                    // Save cost first if entered
                    const cost = parseFloat(editableCost);
                    if (!isNaN(cost) && cost >= 0) {
                      await updateCostMutation.mutateAsync({ itemId: item.id, buyPrice: cost });
                    }
                    // Update decision to flip
                    await updateDecision.mutateAsync({ id: item.id, decision: 'flip' });
                    
                    // Create inventory item with status 'bought' (server handles duplicate check)
                    const purchasePrice = !isNaN(cost) && cost >= 0 ? String(cost) : String(item.buyPrice || item.price || '0');
                    const estimatedResale = String(item.avgComp || item.flipPrice || '0');
                    
                    try {
                      await createInventoryItem.mutateAsync({
                        itemId: item.id,
                        title: item.confirmedTitle || item.title || 'Unknown Item',
                        purchasePrice: purchasePrice,
                        estimatedResale: estimatedResale,
                      });
                      toast({ title: "FLIP IT! Added to Inventory" });
                    } catch (inventoryErr: any) {
                      // Handle duplicate gracefully - item already in inventory is OK
                      if (inventoryErr?.message?.includes("already in inventory")) {
                        toast({ title: "Already in Inventory", description: "This item was already added." });
                      } else {
                        throw inventoryErr;
                      }
                    }
                    // Show prompt to list now or wait
                    setShowListNowPrompt(true);
                  } catch (err: any) {
                    console.error("FLIP IT error:", err);
                    const errorMessage = err?.message || "Failed to save decision";
                    toast({ title: errorMessage, variant: "destructive" });
                  } finally {
                    setIsFlipping(false);
                  }
                }}
                disabled={isFlipping || isSkipping}
                data-testid="button-flip-it"
              >
                {isFlipping ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <ThumbsUp className="w-4 h-4 mr-2" />
                    FLIP IT
                  </>
                )}
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={async () => {
                  if (!item) return;
                  setIsSkipping(true);
                  try {
                    // Update decision to skip
                    await updateDecision.mutateAsync({ id: item.id, decision: 'skip' });
                    toast({ title: "SKIP IT! Item passed" });
                    navigate('/scans?filter=skip');
                  } catch (err) {
                    console.error("SKIP IT error:", err);
                    const errorMessage = err instanceof Error ? err.message : "Failed to save decision";
                    toast({ title: errorMessage, variant: "destructive" });
                  } finally {
                    setIsSkipping(false);
                  }
                }}
                disabled={isFlipping || isSkipping}
                data-testid="button-skip-it"
              >
                {isSkipping ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <ThumbsDown className="w-4 h-4 mr-2" />
                    SKIP IT
                  </>
                )}
              </Button>
            </div>
          </Card>
        </motion.div>

        {/* Pricing Confidence Section */}
        {(hasManualComps && manualCompsStats || (compsResult && compsResult.lowPrice !== null && compsResult.highPrice !== null)) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08 }}
          >
            {(() => {
              const lowPrice = hasManualComps && manualCompsStats 
                ? manualCompsStats.min 
                : compsResult?.lowPrice ?? 0;
              const highPrice = hasManualComps && manualCompsStats 
                ? manualCompsStats.max 
                : compsResult?.highPrice ?? 0;
              const rawSpread = hasManualComps && manualCompsStats
                ? manualCompsStats.spread
                : compsResult?.spreadPercent;
              const spread = rawSpread !== null && rawSpread !== undefined ? Number(rawSpread) : 0;
              
              const isHighConfidence = spread <= 25;
              const isMediumConfidence = spread > 25 && spread <= 50;
              const isLowConfidence = spread > 50;
              
              const confidenceLabel = isHighConfidence ? "Strong signal" : isMediumConfidence ? "Mixed signals" : "Wide range";
              const confidenceColor = isHighConfidence 
                ? "text-green-400 bg-green-500/15 border-green-500/30" 
                : isMediumConfidence 
                  ? "text-amber-400 bg-amber-500/15 border-amber-500/30" 
                  : "text-red-400 bg-red-500/15 border-red-500/30";
              
              const uncertaintyMessage = isMediumConfidence
                ? "We found some variation in sold prices. This is normal for items with different conditions or versions."
                : isLowConfidence
                  ? "Prices vary widely for this item. We recommend checking comps manually before committing."
                  : null;
              
              // Calculate net payout range (after ~13% platform fees)
              const feeRate = 0.13; // Standard platform fee
              const netLow = Math.round(lowPrice * (1 - feeRate));
              const netHigh = Math.round(highPrice * (1 - feeRate));
              
              // Calculate actual PROFIT (net payout minus cost)
              const buyPrice = safeNumber(item.buyPrice || item.price, 0);
              const profitLow = netLow - buyPrice;
              const profitHigh = netHigh - buyPrice;
              
              return (
                <Card className="p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Expected Sell Price
                    </h4>
                    <Badge 
                      variant="outline" 
                      className={cn("text-xs border", confidenceColor)}
                      data-testid="badge-pricing-confidence"
                    >
                      {confidenceLabel}
                    </Badge>
                  </div>
                  
                  {/* Gross sale range */}
                  <div className="mb-2">
                    <p className="text-xs text-muted-foreground mb-1">Gross sale price</p>
                    <span className="text-2xl font-bold font-mono" data-testid="text-price-range">
                      ${safeToFixed(safeNumber(lowPrice, 0), 0)} – ${safeToFixed(safeNumber(highPrice, 0), 0)}
                    </span>
                  </div>
                  
                  {/* Net Profit range - what you actually pocket after fees and cost */}
                  <div className="mb-3 pt-2 border-t border-border/50">
                    <p className="text-xs text-muted-foreground mb-1">Your profit (after ${buyPrice} cost + 13% fees)</p>
                    <span className={cn(
                      "text-xl font-bold font-mono",
                      profitLow >= 0 ? "text-green-500" : "text-red-500"
                    )} data-testid="text-profit-range">
                      ${profitLow} – ${profitHigh}
                    </span>
                  </div>
                  
                  <p className="text-xs text-muted-foreground/70 mb-2" data-testid="text-fee-note">
                    Assumes buyer-paid shipping, standard platform fees (~13%).
                  </p>
                  
                  {uncertaintyMessage && (
                    <p className="text-xs text-muted-foreground leading-relaxed" data-testid="text-pricing-warning">
                      {uncertaintyMessage}
                    </p>
                  )}
                </Card>
              );
            })()}
          </motion.div>
        )}

        {/* Short Explanation - Generated from actual data */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Card className="p-5">
            <p className="text-base text-foreground leading-relaxed mb-4" data-testid="text-explanation">
              {(() => {
                // Generate truthful explanation from actual calculated data
                const lowPrice = hasManualComps && manualCompsStats 
                  ? manualCompsStats.min 
                  : compsResult?.lowPrice ?? 0;
                const highPrice = hasManualComps && manualCompsStats 
                  ? manualCompsStats.max 
                  : compsResult?.highPrice ?? 0;
                const profitAmount = Math.abs(Math.round(netProfit));
                const profitSign = netProfit >= 0 ? "profit" : "loss";
                const maxBuyValue = marginDecision?.maxBuy;
                const userBuyPrice = safeNumber(item.buyPrice || item.price, 0);
                
                // Calculate net range for explanation
                const feeRate = 0.13; // Standard platform fee
                const netLow = Math.round(lowPrice * (1 - feeRate));
                const netHigh = Math.round(highPrice * (1 - feeRate));
                
                // Max Buy context: show whether user is above/below max buy
                const maxBuyContext = maxBuyValue && maxBuyValue > 0
                  ? userBuyPrice <= maxBuyValue 
                    ? ` At your price of $${Math.round(userBuyPrice)}, you're within the max buy of $${Math.round(maxBuyValue)}.`
                    : ` At your price of $${Math.round(userBuyPrice)}, you're above the max buy of $${Math.round(maxBuyValue)}, reducing target profit.`
                  : '';
                
                if (hasManualComps && lowPrice > 0 && highPrice > 0) {
                  return `Based on the sold prices you entered, similar items are selling for $${Math.round(lowPrice)}–$${Math.round(highPrice)} gross. After fees, you'd receive $${netLow}–$${netHigh} net, resulting in an expected ${profitSign} of about $${profitAmount} at your price.${maxBuyContext}`;
                } else if (compSource === 'ebay_api' && lowPrice > 0 && highPrice > 0) {
                  return `Based on recent eBay sold listings, similar items are selling for $${Math.round(lowPrice)}–$${Math.round(highPrice)} gross. After fees, you'd receive $${netLow}–$${netHigh} net, resulting in an expected ${profitSign} of about $${profitAmount} at your price.${maxBuyContext}`;
                } else if (avgSoldPrice > 0) {
                  const avgNet = Math.round(avgSoldPrice * (1 - feeRate));
                  return `Based on available market data, we estimate this item sells for around $${Math.round(avgSoldPrice)} gross ($${avgNet} net after fees), resulting in an expected ${profitSign} of about $${profitAmount} at your price.${maxBuyContext} For more accuracy, enter sold comps manually.`;
                } else {
                  return `We couldn't find reliable pricing data for this item. Enter sold comps manually to get an accurate profit estimate.`;
                }
              })()}
            </p>
            
            {/* View eBay Comps Link */}
            <a
              href={ebaySearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-green-400 hover:text-green-300 transition-colors"
              data-testid="link-view-ebay-comps"
            >
              <ExternalLink className="w-4 h-4" />
              View sold comps on eBay
            </a>
          </Card>
        </motion.div>

        {/* Calculation Breakdown - Collapsible */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          <Collapsible open={isCalcOpen} onOpenChange={setIsCalcOpen}>
            <Card className="overflow-hidden">
              <CollapsibleTrigger asChild>
                <button 
                  className="flex items-center justify-between w-full p-4 text-left hover:bg-secondary/50 transition-colors"
                  data-testid="button-toggle-calculation"
                >
                  <div className="flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">How we calculated this</span>
                  </div>
                  <ChevronDown className={cn(
                    "w-4 h-4 text-muted-foreground transition-transform duration-200",
                    isCalcOpen && "rotate-180"
                  )} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 pt-0 space-y-3 border-t border-border/50">
                  {/* Buyer Pays Shipping Toggle */}
                  <div className="flex items-center justify-between pt-3 pb-2 border-b border-border/30">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-muted-foreground" />
                      <Label 
                        htmlFor="buyer-pays-shipping" 
                        className="text-sm font-medium cursor-pointer"
                      >
                        Buyer pays shipping
                      </Label>
                    </div>
                    <Switch
                      id="buyer-pays-shipping"
                      checked={buyerPaysShipping}
                      onCheckedChange={setBuyerPaysShipping}
                      data-testid="switch-buyer-pays-shipping"
                    />
                  </div>
                  {buyerPaysShipping && (
                    <p className="text-xs text-muted-foreground -mt-1 pb-2 border-b border-border/30">
                      Outbound shipping set to $0. Your actual profit may be higher.
                    </p>
                  )}
                  
                  {/* Median Sold - Primary reference (uses displayMode for single vs range) */}
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-sm text-muted-foreground">
                      {displayMode === 'single' ? 'Median Sold' : 'Typical Resale'}
                    </span>
                    <span className="text-sm font-mono font-medium" data-testid="calc-median">
                      {hasManualComps && manualCompsStats ? (
                        <>${safeToFixed(safeNumber(manualCompsStats.median, 0), 2)}</>
                      ) : displayMode === 'single' && avgSoldPrice > 0 ? (
                        <>${safeToFixed(avgSoldPrice, 0)}</>
                      ) : resaleRange && (displayMode === 'range' || displayMode === 'estimate_range') ? (
                        <span className={displayMode === 'estimate_range' ? 'text-muted-foreground italic' : ''}>
                          ${resaleRange.low}–${resaleRange.high}
                          {displayMode === 'estimate_range' && ' (est.)'}
                        </span>
                      ) : compsResult?.medianPrice ? (
                        <>${safeToFixed(safeNumber(compsResult.medianPrice, 0), 2)}</>
                      ) : avgSoldPrice > 0 ? (
                        <span className="text-muted-foreground italic">~${safeToFixed(safeNumber(avgSoldPrice, 0), 2)} (est.)</span>
                      ) : (
                        <span className="text-muted-foreground italic">Unavailable</span>
                      )}
                    </span>
                  </div>
                  
                  {/* Condition-specific pricing breakdown */}
                  {compsResult?.conditionStats && (compsResult.conditionStats.newLike.count > 0 || compsResult.conditionStats.used.count > 0) && (
                    <div className="mt-2 p-2 bg-muted/30 rounded-md space-y-1" data-testid="container-condition-stats">
                      <p className="text-xs font-medium text-muted-foreground mb-1" data-testid="text-condition-header">Pricing by condition:</p>
                      {compsResult.conditionStats.newLike.count > 0 && compsResult.conditionStats.newLike.medianPrice && (
                        <div className="flex flex-wrap justify-between items-center gap-1" data-testid="row-new-median">
                          <span className="text-xs text-muted-foreground" data-testid="text-new-label">New/Like New ({compsResult.conditionStats.newLike.count})</span>
                          <span className="text-xs font-mono font-medium text-foreground" data-testid="text-new-price">
                            ${safeToFixed(compsResult.conditionStats.newLike.medianPrice, 2)} median
                          </span>
                        </div>
                      )}
                      {compsResult.conditionStats.used.count > 0 && compsResult.conditionStats.used.medianPrice && (
                        <div className="flex flex-wrap justify-between items-center gap-1" data-testid="row-used-median">
                          <span className="text-xs text-muted-foreground" data-testid="text-used-label">Used ({compsResult.conditionStats.used.count})</span>
                          <span className="text-xs font-mono font-medium text-foreground" data-testid="text-used-price">
                            ${safeToFixed(compsResult.conditionStats.used.medianPrice, 2)} median
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="border-t border-border/30 pt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Buy Price</span>
                      <span className="text-sm font-mono font-medium" data-testid="calc-buy-price">
                        ${safeToFixed(safeNumber(item.buyPrice || item.price, 0), 2)}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">+ Inbound Shipping</span>
                    <span className="text-sm font-mono font-medium" data-testid="calc-shipping">
                      {formatShippingDisplay(item.shippingIn || item.shipping, true)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">− Platform Fees ({Math.round(safeNumber(item.platformFeeRate, PLATFORM_FEE_RATE) * 100)}%)</span>
                    <span className="text-sm font-mono font-medium text-red-400" data-testid="calc-fees">
                      −${safeToFixed(calculatePlatformFees(avgSoldPrice, safeNumber(item.platformFeeRate, PLATFORM_FEE_RATE)), 2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      − Outbound Shipping (est.)
                      {buyerPaysShipping && <span className="text-xs ml-1">(buyer pays)</span>}
                    </span>
                    <span className={cn(
                      "text-sm font-mono font-medium",
                      buyerPaysShipping ? "text-green-400" : "text-red-400"
                    )} data-testid="calc-outbound">
                      {buyerPaysShipping ? "$0.00" : `−$${safeToFixed(safeNumber(item.outboundShipping, OUTBOUND_SHIPPING_DEFAULT), 2)}`}
                    </span>
                  </div>
                  
                  <div className="border-t border-border/50 pt-3 flex justify-between items-center">
                    <span className="text-sm font-semibold">Profit at your price</span>
                    <span className={cn(
                      "text-sm font-mono font-bold",
                      netProfit >= 0 ? "text-green-400" : "text-red-400"
                    )} data-testid="calc-net-profit">
                      {netProfit < 0 ? "−" : "+"}${safeToFixed(Math.abs(safeNumber(netProfit, 0)), 2)}
                    </span>
                  </div>
                  
                  {/* Max Buy - Maximum price to hit target margin */}
                  {marginDecision?.maxBuy != null && marginDecision.maxBuy > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/30 space-y-1" data-testid="container-max-buy">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-muted-foreground">Max Buy</span>
                        <span className="text-sm font-mono font-bold text-foreground" data-testid="text-max-buy">
                          ${safeToFixed(marginDecision.maxBuy ?? 0, 2)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground/70" data-testid="text-max-buy-helper">
                        Purchasing above this price reduces or eliminates target profit.
                      </p>
                    </div>
                  )}
                  
                  {/* Missing comps notice */}
                  {!hasManualComps && (!compsResult || compsResult.comps.length === 0) && (
                    <div className="mt-2 p-2 bg-muted/50 border border-border rounded-md">
                      <p className="text-xs text-muted-foreground">
                        No sold comps available. Price estimate based on market data we could find.
                      </p>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </motion.div>

        {/* Watch Metadata Section */}
        <WatchMetadataSection item={item} />

        {/* Sports Card Metadata Section */}
        <CardMetadataSection item={item} />

        {/* Grading Readiness Section (raw cards only) */}
        <GradingReadinessSection item={item} />

        {/* Market Evidence Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.18 }}
        >
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Market Evidence{hasManualComps ? " (Manual)" : ""}
              </h3>
              {hasManualComps && manualCompsStats && (
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-xs",
                    manualCompsStats.spread <= 25 
                      ? "text-green-400 border-green-500/20 bg-green-500/5" 
                      : manualCompsStats.spread <= 50 
                        ? "text-[#F59E0B] border-[#F59E0B]/20 bg-[#F59E0B]/5"
                        : "text-[#DC2626] border-[#DC2626]/20 bg-[#DC2626]/5"
                  )}
                  data-testid="badge-spread"
                >
                  {manualCompsStats.spread <= 25 ? "Tight" : manualCompsStats.spread <= 50 ? "Moderate" : "Wide"} spread ({manualCompsStats.spread}%)
                </Badge>
              )}
              {!hasManualComps && compsResult && compsResult.comps.length >= 3 && compsResult.spreadPercent !== null && (
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-xs",
                    compsResult.spreadPercent <= 25 
                      ? "text-green-400 border-green-500/20 bg-green-500/5" 
                      : compsResult.spreadPercent <= 50 
                        ? "text-[#F59E0B] border-[#F59E0B]/20 bg-[#F59E0B]/5"
                        : "text-[#DC2626] border-[#DC2626]/20 bg-[#DC2626]/5"
                  )}
                  data-testid="badge-spread"
                >
                  {compsResult.spreadPercent <= 25 ? "Tight" : compsResult.spreadPercent <= 50 ? "Moderate" : "Wide"} spread ({compsResult.spreadPercent}%)
                </Badge>
              )}
            </div>

            {/* Manual Comps Display */}
            {hasManualComps && manualCompsStats ? (
              <div className="space-y-4">
                {/* Stats Grid */}
                <div className="space-y-3 pb-3 border-b border-border/50">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-0.5">Low</p>
                      <p className="font-mono text-sm font-medium" data-testid="manual-comp-low">${safeToFixed(safeNumber(manualCompsStats.min, 0), 2)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-0.5">Market Mean</p>
                      <p className="font-mono text-sm font-bold text-foreground" data-testid="manual-comp-avg">${safeToFixed(safeNumber(manualCompsStats.avg, 0), 2)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-0.5">High</p>
                      <p className="font-mono text-sm font-medium" data-testid="manual-comp-high">${safeToFixed(safeNumber(manualCompsStats.max, 0), 2)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-0.5">Median</p>
                      <p className="font-mono text-sm font-medium" data-testid="manual-comp-median">${safeToFixed(safeNumber(manualCompsStats.median, 0), 2)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-0.5">Spread</p>
                      <p className="font-mono text-sm font-medium" data-testid="manual-comp-spread">{safeToFixed(safeNumber(manualCompsStats.spread, 0), 1)}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-0.5">Signal Strength</p>
                      <p className="font-mono text-sm font-medium" data-testid="manual-comp-signal-strength">{safeNumber(manualCompsStats.confidence, 0)}/100</p>
                    </div>
                  </div>
                </div>
                
                {/* Manual Comp Prices List */}
                <div className="space-y-2">
                  {manualCompPrices.map((price, index) => (
                    <div 
                      key={index} 
                      className="flex items-center justify-between py-2 border-b border-border/30 last:border-0"
                      data-testid={`manual-comp-row-${index}`}
                    >
                      <span className="font-mono text-sm font-medium">${safeToFixed(safeNumber(price, 0), 2)}</span>
                      <Badge variant="secondary" className="text-xs">Comp {index + 1}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : compSource === 'none' && manualCompPrices.length === 0 && (!compsResult || compsResult.comps.length === 0) ? (
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 border border-border rounded-lg">
                  <h4 className="text-sm font-semibold mb-2 text-foreground">No Sold Comps Found</h4>
                  <p className="text-sm text-muted-foreground mb-3" data-testid="text-no-comps">
                    This could happen due to low sales volume, a new or rare listing, or limited data availability.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    We recommend verifying pricing on eBay before making a decision.
                  </p>
                </div>
                <a 
                  href={ebaySearchUrl}
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center h-11 rounded-lg bg-green-500 text-white hover:bg-green-500/90 font-medium text-sm transition-colors shadow-sm"
                  data-testid="link-open-ebay-sold"
                >
                  View Sold Listings on eBay <ExternalLink className="w-4 h-4 ml-2" />
                </a>
              </div>
            ) : !compsResult || compsResult.comps.length === 0 ? (
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 border border-border rounded-lg">
                  <h4 className="text-sm font-semibold mb-2 text-foreground">No Sold Comps Found</h4>
                  <p className="text-sm text-muted-foreground mb-3" data-testid="text-no-comps">
                    {compsResult?.message || "This could happen due to low sales volume, a new or rare listing, or limited data availability."}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    We recommend verifying pricing on eBay before making a decision.
                  </p>
                </div>
                <a 
                  href={ebaySearchUrl}
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center h-11 rounded-lg bg-green-500 text-white hover:bg-green-500/90 font-medium text-sm transition-colors shadow-sm"
                  data-testid="link-open-ebay-sold"
                >
                  View Sold Listings on eBay <ExternalLink className="w-4 h-4 ml-2" />
                </a>
              </div>
            ) : (
              <>
                {/* Price Stats: Low / Market Mean / High + Range + Interpretive Sentence */}
                {compsResult.lowPrice !== null && compsResult.highPrice !== null && (
                  <div className="space-y-3 pb-3 border-b border-border/50">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-0.5">Low</p>
                        <p className="font-mono text-sm font-medium" data-testid="comp-low">${safeToFixed(safeNumber(compsResult.lowPrice, 0), 2)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-0.5">Market Mean</p>
                        <p className="font-mono text-sm font-bold text-foreground" data-testid="comp-average">
                          ${safeToFixed(safeNumber(compsResult.averagePrice || compsResult.medianPrice, 0), 2)}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-0.5">High</p>
                        <p className="font-mono text-sm font-medium" data-testid="comp-high">${safeToFixed(safeNumber(compsResult.highPrice, 0), 2)}</p>
                      </div>
                    </div>
                    {compsResult.priceRange && (
                      <div className="text-center space-y-1">
                        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                          <span>Range: ${safeToFixed(safeNumber(compsResult.priceRange.min, 0), 2)} - ${safeToFixed(safeNumber(compsResult.priceRange.max, 0), 2)}</span>
                        </div>
                        {/* Interpretive sentence based on spread/variance */}
                        <p className="text-xs font-medium text-foreground/80" data-testid="text-market-interpretation">
                          {(() => {
                            const spread = compsResult.spreadPercent;
                            if (spread === null || spread === undefined) return "Market data available.";
                            if (spread <= 15) return "Pricing is tightly clustered.";
                            if (spread <= 30) return "Market supports resale.";
                            if (spread <= 50) return "Prices show moderate variance.";
                            return "Market pricing is unstable.";
                          })()}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Comps List - Show top 5 by default, expandable */}
                <div className="space-y-2">
                  {(() => {
                    const displayLimit = 5;
                    const compsToShow = showAllComps ? compsResult.comps : compsResult.comps.slice(0, displayLimit);
                    const hasMore = compsResult.comps.length > displayLimit;
                    
                    return (
                      <>
                        {compsToShow.map((comp: SoldComp, index: number) => {
                          const shippingValue = comp.shippingCost === "Free" 
                            ? 0 
                            : comp.shippingCost !== "Unknown" 
                              ? safeNumber(String(comp.shippingCost).replace('$', ''), 0)
                              : 0;
                          const totalPrice = safeNumber(comp.totalPrice, safeNumber(comp.soldPrice, 0) + shippingValue);
                          
                          return (
                            <div 
                              key={index} 
                              className="flex items-center justify-between py-2 border-b border-border/30 last:border-0"
                              data-testid={`comp-row-${index}`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-sm font-medium" data-testid={`comp-price-${index}`}>
                                    ${safeToFixed(safeNumber(comp.soldPrice, 0), 2)}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {comp.shippingCost === "Free" ? "+ Free ship" : comp.shippingCost !== "Unknown" ? `+ ${comp.shippingCost} ship` : ""}
                                  </span>
                                  <span className="text-xs font-medium text-foreground" data-testid={`comp-total-${index}`}>
                                    = ${safeToFixed(totalPrice, 2)} total
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>{comp.condition}</span>
                                  <span>|</span>
                                  <span data-testid={`comp-date-${index}`}>{comp.dateSold}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        
                        {/* View full market evidence - expandable */}
                        {hasMore && !showAllComps && (
                          <button
                            onClick={() => setShowAllComps(true)}
                            className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1"
                            data-testid="button-view-full-evidence"
                          >
                            <ChevronDown className="w-3 h-3" />
                            View full market evidence ({compsResult.comps.length - displayLimit} more)
                          </button>
                        )}
                        {showAllComps && hasMore && (
                          <button
                            onClick={() => setShowAllComps(false)}
                            className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1"
                            data-testid="button-collapse-evidence"
                          >
                            <ChevronDown className="w-3 h-3 rotate-180" />
                            Show less
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* Fewer than 3 comps warning */}
                {compsResult.comps.length < 3 && compsResult.message && (
                  <p className="text-xs text-muted-foreground italic" data-testid="text-comps-warning">
                    {compsResult.message}
                  </p>
                )}

                {/* Always show link to verify on eBay */}
                {compsResult.ebaySearchUrl && (
                  <div className="pt-2 border-t border-border/50 flex flex-wrap gap-3">
                    <a 
                      href={compsResult.ebaySearchUrl}
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors"
                      data-testid="link-verify-ebay-sold"
                    >
                      Verify on eBay <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                    {/* Show Chrono24 link for watches */}
                    {compsResult.chrono24SearchUrl && (
                      <a 
                        href={compsResult.chrono24SearchUrl}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors"
                        data-testid="link-verify-chrono24"
                      >
                        Chrono24 Prices <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    )}
                  </div>
                )}
              </>
            )}
          </Card>
        </motion.div>

        {/* Item Summary */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Card className="p-5 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Item</h3>
                {item.confirmedTitle && (
                  <Badge variant="outline" className="text-xs gap-1 text-green-400 border-green-500/20 bg-green-500/5 dark:text-[#4ade80] dark:border-[#4ade80]/30 dark:bg-[#4ade80]/10" data-testid="badge-user-confirmed">
                    <CheckCircle className="w-3 h-3" />
                    Confirmed
                  </Badge>
                )}
              </div>
              <p className="font-medium text-base leading-tight" data-testid="text-item-title">
                {item.confirmedTitle || item.title || "Unknown Item"}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border/50">
              <div>
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Buy</h3>
                <p className="font-mono text-sm">${item.buyPrice || item.price || "0"}</p>
              </div>
              <div>
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Ship</h3>
                <p className="font-mono text-sm">{formatShippingDisplay(item.shippingIn || item.shipping, true)}</p>
              </div>
              <div>
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Cond.</h3>
                <p className="text-sm">{item.condition || "Used"}</p>
              </div>
            </div>

            {item.category && (
              <div className="pt-3 border-t border-border/50">
                <Badge variant="secondary" className="text-xs" data-testid="badge-item-category">{item.category}</Badge>
              </div>
            )}

            <div className="pt-3 border-t border-border/50">
              <a 
                href={ebaySearchUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center h-10 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 font-medium text-sm transition-colors"
                data-testid="link-view-ebay"
              >
                View on eBay <ExternalLink className="w-4 h-4 ml-2 opacity-70" />
              </a>
            </div>
          </Card>
        </motion.div>

        {/* Batch Navigation - Show "Flip Accepted" when in batch mode */}
        {isInBatchMode && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.25 }}
          >
            <Card className="p-5 bg-green-500/10 border-green-500/30">
              <div className="text-center mb-3">
                <span className="text-sm text-muted-foreground">
                  Item {currentBatchIndex + 1} of {batchItemIds.length}
                </span>
              </div>
              <Button
                className="w-full bg-green-500 hover:bg-green-500/90 text-white text-lg py-6"
                onClick={() => {
                  const nextIndex = currentBatchIndex + 1;
                  if (nextIndex < batchItemIds.length) {
                    // Navigate to next batch item
                    const nextItemId = batchItemIds[nextIndex];
                    navigate(`/item/${nextItemId}?batch=${batchItemIds.join(',')}&idx=${nextIndex}`);
                  } else {
                    // All items reviewed - go to Flip It page (Inventory for now)
                    navigate('/inventory');
                    toast({ 
                      title: "Batch Complete!", 
                      description: `All ${batchItemIds.length} items reviewed. Check your Flips!` 
                    });
                  }
                }}
                data-testid="button-flip-accepted"
              >
                <Check className="w-5 h-5 mr-2" />
                {currentBatchIndex + 1 < batchItemIds.length 
                  ? `Flip Accepted - Next (${batchItemIds.length - currentBatchIndex - 1} remaining)`
                  : 'Flip Accepted - View All Flips'
                }
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                {currentBatchIndex + 1 < batchItemIds.length 
                  ? 'Continue to next scanned item'
                  : 'Complete batch and view all your flips'
                }
              </p>
            </Card>
          </motion.div>
        )}

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <Card className="p-5 space-y-3">
            {/* List It Now - Primary Action */}
            <Button
              className="w-full bg-blue-500 hover:bg-blue-600 text-white"
              onClick={() => generateListingMutation.mutate(item.id)}
              disabled={generateListingMutation.isPending}
              data-testid="button-list-it-now"
            >
              {generateListingMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <FileText className="w-4 h-4 mr-2" />
              )}
              {generateListingMutation.isPending ? "Generating Listing..." : "List It Now"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              AI generates a ready-to-post eBay listing with title, description & price
            </p>
            
            {/* Add to Inventory - Secondary Action */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                createInventoryItem.mutate({
                  itemId: item.id,
                  title: item.confirmedTitle || item.title || "Unknown Item",
                  purchasePrice: item.buyPrice || item.price || "0",
                  estimatedResale: avgSoldPrice > 0 ? safeToFixed(safeNumber(avgSoldPrice, 0), 2) : null,
                  feesEstimate: avgSoldPrice > 0 ? safeToFixed(safeNumber(avgSoldPrice, 0) * PLATFORM_FEE_RATE, 2) : null,
                  shippingEstimate: item.outboundShipping || String(OUTBOUND_SHIPPING_DEFAULT),
                  condition: item.condition || null,
                }, {
                  onSuccess: () => {
                    setShowSuccessModal(true);
                  }
                });
              }}
              disabled={createInventoryItem.isPending}
              data-testid="button-add-inventory"
            >
              {createInventoryItem.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Package className="w-4 h-4 mr-2" />
              )}
              Add to Inventory
            </Button>
          </Card>
        </motion.div>

      </div>
      
      {/* Success Modal with eBay Live Referral */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex justify-center mb-2">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10">
                <CheckCircle className="w-6 h-6 text-green-400" />
              </div>
            </div>
            <DialogTitle className="text-center">Added to Inventory</DialogTitle>
            <DialogDescription className="text-center">
              {tierInfo.tier === 'ready' 
                ? "Great find! This item is ready to flip." 
                : "Item tracked. Check your inventory to manage it."}
            </DialogDescription>
          </DialogHeader>
          
          {tierInfo.tier === 'ready' && (
            <div className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-500/20 rounded-lg p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-semibold">Try eBay Live</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Live selling can get you better prices for flips like this.
              </p>
              <a
                href="https://www.ebay.com/live"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-xs text-blue-600 hover:text-blue-700 font-medium"
                data-testid="link-ebay-live-referral"
              >
                Learn more about live selling <ExternalLink className="w-3 h-3 ml-1" />
              </a>
            </div>
          )}
          
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="w-full bg-green-500 hover:bg-green-600"
              onClick={() => {
                setShowSuccessModal(false);
                navigate("/inventory");
              }}
              data-testid="button-go-to-inventory"
            >
              Go to Inventory
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setShowSuccessModal(false);
                navigate("/scan");
              }}
              data-testid="button-scan-another"
            >
              Scan Another Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* List Now or Wait Prompt - After marking as bought */}
      <Dialog open={showListNowPrompt} onOpenChange={setShowListNowPrompt}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex justify-center mb-2">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10">
                <CheckCircle className="w-6 h-6 text-green-400" />
              </div>
            </div>
            <DialogTitle className="text-center">Item Added to Inventory</DialogTitle>
            <DialogDescription className="text-center">
              What would you like to do next?
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="w-full bg-green-500 hover:bg-green-600 text-white"
              onClick={() => {
                setShowListNowPrompt(false);
                navigate('/scan');
              }}
              data-testid="button-scan-another"
            >
              <Camera className="w-4 h-4 mr-2" />
              Scan Another Item
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setShowListNowPrompt(false);
                if (item) {
                  generateListingMutation.mutate(item.id);
                }
              }}
              data-testid="button-list-now"
            >
              <FileText className="w-4 h-4 mr-2" />
              List It Now
            </Button>
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => {
                setShowListNowPrompt(false);
                navigate('/inventory?status=bought');
              }}
              data-testid="button-list-later"
            >
              Go to Inventory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Listing Generator Modal */}
      <Dialog open={showListingModal} onOpenChange={(open) => {
        setShowListingModal(open);
        if (!open) {
          setCopiedField(null);
        }
      }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex justify-center mb-2">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/10">
                <FileText className="w-6 h-6 text-blue-500" />
              </div>
            </div>
            <DialogTitle className="text-center">Your eBay Listing</DialogTitle>
            <DialogDescription className="text-center">
              AI-generated listing ready to copy
            </DialogDescription>
          </DialogHeader>
          
          {!generatedListing && generateListingMutation.isPending && (
            <div className="flex flex-col items-center py-8 space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              <p className="text-sm text-muted-foreground">Generating your listing...</p>
            </div>
          )}
          
          {generatedListing && (
            <div className="space-y-4">
              {/* Title with SEO Score */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Title</Label>
                    {generatedListing.titleScore && (
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        generatedListing.titleScore >= 80 ? 'bg-green-500/20 text-green-500' :
                        generatedListing.titleScore >= 60 ? 'bg-yellow-500/20 text-yellow-600' :
                        'bg-red-500/20 text-red-500'
                      }`}>
                        SEO: {generatedListing.titleScore}/100
                      </span>
                    )}
                  </div>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-6 px-2"
                    onClick={() => copyToClipboard(generatedListing.title, 'title')}
                    data-testid="button-copy-title"
                  >
                    {copiedField === 'title' ? <CheckCheck className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg text-sm font-medium">
                  {generatedListing.title}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{generatedListing.title.length}/80 characters</p>
                </div>
                {generatedListing.titleAnalysis && (
                  <p className="text-xs text-blue-500 italic">{generatedListing.titleAnalysis}</p>
                )}
                {generatedListing.alternativeTitles && generatedListing.alternativeTitles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <Label className="text-xs text-muted-foreground">Alternative Titles:</Label>
                    {generatedListing.alternativeTitles.map((altTitle, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className="flex-1 p-2 bg-muted/30 rounded text-xs">{altTitle}</div>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-6 px-2"
                          onClick={() => copyToClipboard(altTitle, `alt-title-${idx}`)}
                          data-testid={`button-copy-alt-title-${idx}`}
                        >
                          {copiedField === `alt-title-${idx}` ? <CheckCheck className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Suggested Price */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Suggested Price</Label>
                <div className="p-3 bg-green-500/10 rounded-lg">
                  <span className="text-xl font-bold text-green-500">${generatedListing.suggestedPrice?.toFixed(2) || '0.00'}</span>
                </div>
              </div>
              
              {/* Description */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">Description</Label>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-6 px-2"
                    onClick={() => copyToClipboard(generatedListing.description, 'description')}
                    data-testid="button-copy-description"
                  >
                    {copiedField === 'description' ? <CheckCheck className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg text-sm max-h-40 overflow-y-auto">
                  {generatedListing.description}
                </div>
              </div>
              
              {/* Category */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">Category</Label>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-6 px-2"
                    onClick={() => copyToClipboard(generatedListing.suggestedCategory, 'category')}
                    data-testid="button-copy-category"
                  >
                    {copiedField === 'category' ? <CheckCheck className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg text-sm">
                  {generatedListing.suggestedCategory}
                </div>
              </div>
              
              {/* Item Specifics */}
              {Object.keys(generatedListing.itemSpecifics || {}).length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Item Specifics</Label>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-6 px-2"
                      onClick={() => copyToClipboard(
                        Object.entries(generatedListing.itemSpecifics).map(([k, v]) => `${k}: ${v}`).join('\n'),
                        'specifics'
                      )}
                      data-testid="button-copy-specifics"
                    >
                      {copiedField === 'specifics' ? <CheckCheck className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                    </Button>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
                    {Object.entries(generatedListing.itemSpecifics).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-muted-foreground">{key}:</span>
                        <span className="font-medium">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Keywords with SEO Scores */}
              {generatedListing.keywords && generatedListing.keywords.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">SEO Keywords</Label>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-6 px-2"
                      onClick={() => copyToClipboard(
                        generatedListing.keywords.map(k => typeof k === 'object' ? k.keyword : k).join(', '), 
                        'keywords'
                      )}
                      data-testid="button-copy-keywords"
                    >
                      {copiedField === 'keywords' ? <CheckCheck className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {generatedListing.keywords.map((kw, i) => {
                      const keyword = typeof kw === 'object' ? kw : { keyword: kw, score: 50, competition: 'medium' as const, searchVolume: 'medium' as const, tip: '' };
                      return (
                        <div key={i} className="p-2 bg-muted/30 rounded-lg">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm">{keyword.keyword}</span>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                keyword.score >= 75 ? 'bg-green-500/20 text-green-500' :
                                keyword.score >= 50 ? 'bg-yellow-500/20 text-yellow-600' :
                                'bg-red-500/20 text-red-500'
                              }`}>
                                {keyword.score}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <span className={`w-2 h-2 rounded-full ${
                                keyword.competition === 'low' ? 'bg-green-500' :
                                keyword.competition === 'medium' ? 'bg-yellow-500' :
                                'bg-red-500'
                              }`} />
                              {keyword.competition} competition
                            </span>
                            <span className="flex items-center gap-1">
                              <span className={`w-2 h-2 rounded-full ${
                                keyword.searchVolume === 'high' ? 'bg-green-500' :
                                keyword.searchVolume === 'medium' ? 'bg-yellow-500' :
                                'bg-red-500'
                              }`} />
                              {keyword.searchVolume} volume
                            </span>
                          </div>
                          {keyword.tip && (
                            <p className="text-xs text-blue-500 mt-1 italic">{keyword.tip}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter className="flex-col gap-2 sm:flex-col mt-4">
            <Button
              className="w-full"
              onClick={() => {
                const keywordsText = generatedListing?.keywords?.map(k => 
                  typeof k === 'object' ? k.keyword : k
                ).join(', ') || '';
                const allText = generatedListing ? 
                  `Title: ${generatedListing.title}${generatedListing.titleScore ? ` (SEO Score: ${generatedListing.titleScore}/100)` : ''}\n\nPrice: $${generatedListing.suggestedPrice}\n\nCategory: ${generatedListing.suggestedCategory}\n\nDescription:\n${generatedListing.description}\n\nItem Specifics:\n${Object.entries(generatedListing.itemSpecifics || {}).map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nKeywords: ${keywordsText}` 
                  : '';
                copyToClipboard(allText, 'all');
                toast({ title: "Copied all listing details!" });
              }}
              data-testid="button-copy-all-listing"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy All to Clipboard
            </Button>
            {/* Mark as Listed in Inventory */}
            {(() => {
              const relatedInventory = inventoryItems?.find(inv => inv.itemId === item?.id);
              if (relatedInventory && relatedInventory.status === 'bought') {
                return (
                  <Button
                    variant="secondary"
                    className="w-full bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400"
                    onClick={() => {
                      updateInventoryItem.mutate({
                        id: relatedInventory.id,
                        status: 'listed',
                        listedDate: new Date().toISOString(),
                      }, {
                        onSuccess: () => {
                          toast({ title: "Marked as Listed!", description: "Item status updated in inventory." });
                        }
                      });
                    }}
                    disabled={updateInventoryItem.isPending}
                    data-testid="button-mark-listed-from-listing"
                  >
                    {updateInventoryItem.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Tag className="w-4 h-4 mr-2" />
                    )}
                    Mark as Listed in Inventory
                  </Button>
                );
              }
              return null;
            })()}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setShowListingModal(false);
                setShowCrossPostModal(true);
              }}
              data-testid="button-cross-post"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Cross-Post to All Platforms
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCrossPostModal} onOpenChange={setShowCrossPostModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cross-Post Listing</DialogTitle>
            <DialogDescription>
              Copy your listing to multiple selling platforms
            </DialogDescription>
          </DialogHeader>
          <MultiPlatformListing 
            itemData={{
              title: generatedListing?.title || item?.title || '',
              description: generatedListing?.description || '',
              suggestedPrice: generatedListing?.suggestedPrice || 0,
              condition: item?.condition || 'Used - Good',
              category: generatedListing?.suggestedCategory || item?.category || '',
              keywords: generatedListing?.keywords?.map(k => typeof k === 'object' ? k.keyword : k) || []
            }}
            onClose={() => setShowCrossPostModal(false)}
          />
        </DialogContent>
      </Dialog>
      
      <BottomNav />
    </div>
  );
}

// Watch Metadata Section Component
function WatchMetadataSection({ item }: { item: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const [brand, setBrand] = useState(item.watchBrand || '');
  const [family, setFamily] = useState(item.watchFamily || '');
  const [bandType, setBandType] = useState(item.watchBandType || '');
  const [caseSize, setCaseSize] = useState(item.watchCaseSize || 'Unknown');
  const [movementType, setMovementType] = useState(item.watchMovementType || 'unknown');
  const [wearAssessment, setWearAssessment] = useState(item.watchWearAssessment || 'unknown');
  const [boxAndPapers, setBoxAndPapers] = useState(item.watchBoxAndPapers || 'unknown');
  const [dialColor, setDialColor] = useState(item.watchDialColor || '');
  const [dialStyle, setDialStyle] = useState(item.watchDialStyle || '');
  const [bezelColor, setBezelColor] = useState(item.watchBezelColor || '');
  const [materials, setMaterials] = useState(item.watchMaterials || '');
  const [isSaving, setIsSaving] = useState(false);
  const [bandManuallySet, setBandManuallySet] = useState(!!item.watchBandType);
  const [movementManuallySet, setMovementManuallySet] = useState(!!item.watchMovementType);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch watch library data
  const { data: brandsData } = useQuery<{ brands: { id: string; name: string }[] }>({
    queryKey: ['/api/watch-library/brands'],
  });

  const { data: familiesData } = useQuery<{ families: { id: string; name: string }[] }>({
    queryKey: ['/api/watch-library/families', brand],
    enabled: !!brand,
  });

  const { data: bandTypesData } = useQuery<{ bandTypes: { id: string; name: string; description: string; category?: string }[] }>({
    queryKey: ['/api/watch-library/band-types'],
  });

  const { data: caseSizesData } = useQuery<{ caseSizes: string[] }>({
    queryKey: ['/api/watch-library/case-sizes'],
  });

  // Fetch movement type suggestions
  const { data: movementData } = useQuery<{ suggestedMovement: string }>({
    queryKey: ['/api/watch-library/movement-type', brand, family],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (brand) params.append('brand', brand);
      if (family) params.append('family', family);
      const res = await fetch(`/api/watch-library/movement-type?${params}`, { credentials: 'include' });
      return res.json();
    },
    enabled: !!brand,
  });

  // Fetch counterfeit context
  const { data: counterfeitData } = useQuery<{ context: { riskLevel: string; note: string } | null }>({
    queryKey: ['/api/watch-library/counterfeit-context', brand, family],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (brand) params.append('brand', brand);
      if (family) params.append('family', family);
      const res = await fetch(`/api/watch-library/counterfeit-context?${params}`, { credentials: 'include' });
      return res.json();
    },
    enabled: !!brand,
  });

  // Reset family when brand changes, and auto-suggest band and movement
  useEffect(() => {
    if (brand !== item.watchBrand) {
      setFamily('');
    }
    // Auto-suggest band when brand/family changes (if not manually set)
    if (!bandManuallySet) {
      const suggestedBand = getAutoSuggestedBand(brand || null, family || null);
      if (suggestedBand) {
        setBandType(suggestedBand);
      }
    }
    // Auto-suggest movement type (if not manually set)
    if (!movementManuallySet && movementData?.suggestedMovement && movementData.suggestedMovement !== 'unknown') {
      setMovementType(movementData.suggestedMovement);
    }
  }, [brand, family, item.watchBrand, bandManuallySet, movementManuallySet, movementData]);

  // Handle manual band selection
  const handleBandChange = (value: string) => {
    setBandType(value);
    setBandManuallySet(true); // User has manually overridden
  };

  // Handle movement type change
  const handleMovementChange = (value: string) => {
    setMovementType(value);
    setMovementManuallySet(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/items/${item.id}/watch-metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          watchBrand: brand || null,
          watchFamily: family || null,
          watchBandType: bandType || null,
          watchCaseSize: caseSize || null,
          watchMovementType: movementType || null,
          watchWearAssessment: wearAssessment || null,
          watchBoxAndPapers: boxAndPapers || null,
          watchDialColor: dialColor || null,
          watchDialStyle: dialStyle || null,
          watchBezelColor: bezelColor || null,
          watchMaterials: materials || null,
        }),
      });

      if (!response.ok) throw new Error('Failed to save');

      queryClient.invalidateQueries({ queryKey: ['/api/items'] });
      toast({ title: 'Watch details saved' });
      setIsOpen(false);
    } catch (err) {
      toast({ title: 'Failed to save', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const brands = brandsData?.brands || [];
  const families = familiesData?.families || [];
  const bandTypes = bandTypesData?.bandTypes || [];
  const caseSizes = caseSizesData?.caseSizes || [];

  const selectedBrandName = brands.find(b => b.id === brand)?.name;
  const selectedFamilyName = families.find(f => f.id === family)?.name;
  const selectedBandName = bandTypes.find(b => b.id === bandType)?.name;

  // Only show for watch category
  const category = item.category?.toLowerCase() || '';
  const isWatch = category.includes('watch') || category.includes('watches');
  if (!isWatch) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.16 }}
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card className="overflow-hidden">
          <CollapsibleTrigger asChild>
            <button 
              className="flex items-center justify-between w-full p-4 text-left hover:bg-secondary/50 transition-colors"
              data-testid="button-toggle-watch-metadata"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Watch Details</span>
                {(brand || bandType) && (
                  <Badge variant="secondary" className="text-xs ml-2">
                    {selectedBrandName || 'Set'}
                    {selectedFamilyName && ` • ${selectedFamilyName}`}
                  </Badge>
                )}
              </div>
              <ChevronDown className={cn(
                "w-4 h-4 text-muted-foreground transition-transform duration-200",
                isOpen && "rotate-180"
              )} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4 pt-0 space-y-4 border-t border-border/50">
              {/* Brand Dropdown */}
              <div className="pt-3">
                <Label className="text-xs text-muted-foreground mb-1.5 block">Brand</Label>
                <select
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm"
                  data-testid="select-watch-brand"
                >
                  <option value="">Select brand...</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Style/Family Dropdown - only show if brand selected */}
              {brand && (
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Style / Family</Label>
                  <select
                    value={family}
                    onChange={(e) => setFamily(e.target.value)}
                    className="w-full h-11 px-3 rounded-md border border-border bg-card text-foreground text-sm appearance-none cursor-pointer"
                    style={{ WebkitAppearance: 'menulist' }}
                    data-testid="select-watch-family"
                  >
                    <option value="">Select style...</option>
                    {families.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Band Type Dropdown - auto-suggested based on brand/family */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">
                  Band / Bracelet Type
                  {bandType && !bandManuallySet && (
                    <span className="text-muted-foreground/60 ml-1">(suggested)</span>
                  )}
                </Label>
                <select
                  value={bandType}
                  onChange={(e) => handleBandChange(e.target.value)}
                  className="w-full h-11 px-3 rounded-md border border-border bg-card text-foreground text-sm appearance-none cursor-pointer"
                  style={{ WebkitAppearance: 'menulist' }}
                  data-testid="select-watch-band"
                >
                  <option value="">Select band type...</option>
                  {bandTypes.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                {bandType && bandTypes.find(b => b.id === bandType)?.description && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {bandTypes.find(b => b.id === bandType)?.description}
                  </p>
                )}
              </div>

              {/* Case Size Dropdown */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Case Size (mm)</Label>
                <select
                  value={caseSize}
                  onChange={(e) => setCaseSize(e.target.value)}
                  className="w-full h-11 px-3 rounded-md border border-border bg-card text-foreground text-sm appearance-none cursor-pointer"
                  style={{ WebkitAppearance: 'menulist' }}
                  data-testid="select-case-size"
                >
                  {caseSizes.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
                {caseSize === 'Unknown' && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Market value can vary significantly by case size.
                  </p>
                )}
              </div>

              {/* Movement Type Dropdown */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">
                  Movement Type
                  {movementType !== 'unknown' && !movementManuallySet && (
                    <span className="text-muted-foreground/60 ml-1">(suggested)</span>
                  )}
                </Label>
                <select
                  value={movementType}
                  onChange={(e) => handleMovementChange(e.target.value)}
                  className="w-full h-11 px-3 rounded-md border border-border bg-card text-foreground text-sm appearance-none cursor-pointer"
                  style={{ WebkitAppearance: 'menulist' }}
                  data-testid="select-movement-type"
                >
                  <option value="unknown">Unknown</option>
                  <option value="automatic">Automatic</option>
                  <option value="quartz">Quartz</option>
                  <option value="manual">Manual Wind</option>
                </select>
              </div>

              {/* Dial Color */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Dial Color</Label>
                <select
                  value={dialColor}
                  onChange={(e) => setDialColor(e.target.value)}
                  className="w-full h-11 px-3 rounded-md border border-border bg-card text-foreground text-sm appearance-none cursor-pointer"
                  style={{ WebkitAppearance: 'menulist' }}
                  data-testid="select-dial-color"
                >
                  <option value="">Select dial color...</option>
                  <option value="black">Black</option>
                  <option value="blue">Blue</option>
                  <option value="white">White</option>
                  <option value="silver">Silver</option>
                  <option value="gold">Gold / Champagne</option>
                  <option value="green">Green</option>
                  <option value="red">Red</option>
                  <option value="brown">Brown</option>
                  <option value="mother-of-pearl">Mother of Pearl</option>
                  <option value="skeleton">Skeleton</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Dial Style */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Dial Style (Index Type)</Label>
                <select
                  value={dialStyle}
                  onChange={(e) => setDialStyle(e.target.value)}
                  className="w-full h-11 px-3 rounded-md border border-border bg-card text-foreground text-sm appearance-none cursor-pointer"
                  style={{ WebkitAppearance: 'menulist' }}
                  data-testid="select-dial-style"
                >
                  <option value="">Select dial style...</option>
                  <option value="stick">Stick / Baton Indices</option>
                  <option value="arabic">Arabic Numerals</option>
                  <option value="roman">Roman Numerals</option>
                  <option value="diamond">Diamond Indices</option>
                  <option value="mixed">Mixed</option>
                </select>
              </div>

              {/* Bezel Color */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Bezel Color</Label>
                <select
                  value={bezelColor}
                  onChange={(e) => setBezelColor(e.target.value)}
                  className="w-full h-11 px-3 rounded-md border border-border bg-card text-foreground text-sm appearance-none cursor-pointer"
                  style={{ WebkitAppearance: 'menulist' }}
                  data-testid="select-bezel-color"
                >
                  <option value="">Select bezel color...</option>
                  <option value="black">Black</option>
                  <option value="blue">Blue</option>
                  <option value="red">Red</option>
                  <option value="green">Green</option>
                  <option value="silver">Silver / Steel</option>
                  <option value="gold">Gold</option>
                  <option value="ceramic-black">Ceramic Black</option>
                  <option value="ceramic-blue">Ceramic Blue</option>
                  <option value="pepsi">Pepsi (Red/Blue)</option>
                  <option value="batman">Batman (Black/Blue)</option>
                  <option value="rootbeer">Rootbeer (Brown/Gold)</option>
                  <option value="coke">Coke (Black/Red)</option>
                  <option value="other">Other</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  For dive watches and GMTs, bezel color affects value significantly.
                </p>
              </div>

              {/* Case/Bracelet Materials */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Case / Bracelet Material</Label>
                <select
                  value={materials}
                  onChange={(e) => setMaterials(e.target.value)}
                  className="w-full h-11 px-3 rounded-md border border-border bg-card text-foreground text-sm appearance-none cursor-pointer"
                  style={{ WebkitAppearance: 'menulist' }}
                  data-testid="select-materials"
                >
                  <option value="">Select material...</option>
                  <option value="stainless-steel">Stainless Steel</option>
                  <option value="gold-tone">Gold Tone / Gold Plated</option>
                  <option value="two-tone">Two-Tone (Steel & Gold)</option>
                  <option value="titanium">Titanium</option>
                  <option value="ceramic">Ceramic</option>
                  <option value="rose-gold">Rose Gold</option>
                  <option value="yellow-gold">Yellow Gold (Solid)</option>
                  <option value="white-gold">White Gold</option>
                  <option value="platinum">Platinum</option>
                  <option value="carbon-fiber">Carbon Fiber</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Wear Assessment */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Wear Assessment (Visual)</Label>
                <select
                  value={wearAssessment}
                  onChange={(e) => setWearAssessment(e.target.value)}
                  className="w-full h-11 px-3 rounded-md border border-border bg-card text-foreground text-sm appearance-none cursor-pointer"
                  style={{ WebkitAppearance: 'menulist' }}
                  data-testid="select-wear-assessment"
                >
                  <option value="unknown">Unknown</option>
                  <option value="clean">Appears Clean</option>
                  <option value="moderate">Moderate Wear</option>
                  <option value="heavy">Heavy Wear</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Based on visible case, crystal, bezel, and bracelet condition.
                </p>
              </div>

              {/* Box & Papers */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Box & Papers</Label>
                <select
                  value={boxAndPapers}
                  onChange={(e) => setBoxAndPapers(e.target.value)}
                  className="w-full h-11 px-3 rounded-md border border-border bg-card text-foreground text-sm appearance-none cursor-pointer"
                  style={{ WebkitAppearance: 'menulist' }}
                  data-testid="select-box-papers"
                >
                  <option value="unknown">Unknown</option>
                  <option value="yes">Yes - Included</option>
                  <option value="no">No - Watch Only</option>
                </select>
                {boxAndPapers === 'yes' && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    Box & papers can add significant value, especially for luxury brands.
                  </p>
                )}
                {boxAndPapers === 'no' && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Missing box/papers is common but may reduce value for collectors.
                  </p>
                )}
              </div>

              {/* Counterfeit Context - educational only */}
              {counterfeitData?.context && (
                <div className={`p-3 rounded-md border ${
                  counterfeitData.context.riskLevel === 'high' 
                    ? 'border-amber-500/50 bg-amber-500/10' 
                    : 'border-muted bg-muted/30'
                }`}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                      counterfeitData.context.riskLevel === 'high' 
                        ? 'text-amber-500' 
                        : 'text-muted-foreground'
                    }`} />
                    <div>
                      <p className="text-xs font-medium">Market Context</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {counterfeitData.context.note}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Save Button */}
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full"
                data-testid="button-save-watch-metadata"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Watch Details'
                )}
              </Button>
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </motion.div>
  );
}

// Sports Card Metadata Section Component
function CardMetadataSection({ item }: { item: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGraded, setIsGraded] = useState(item.cardIsGraded ?? false);
  const [grader, setGrader] = useState(item.cardGrader || '');
  const [grade, setGrade] = useState(item.cardGrade || '');
  const [year, setYear] = useState(item.cardYear || '');
  const [cardSet, setCardSet] = useState(item.cardSet || '');
  const [player, setPlayer] = useState(item.cardPlayer || '');
  const [cardNumber, setCardNumber] = useState(item.cardNumber || '');
  const [parallel, setParallel] = useState(item.cardParallel || '');
  const [certNumber, setCertNumber] = useState(item.cardCertNumber || '');
  const [serialNumber, setSerialNumber] = useState(item.cardSerialNumber || '');
  const [serialTotal, setSerialTotal] = useState(item.cardSerialTotal || '');
  // Variation fields
  const [variationType, setVariationType] = useState<string>(item.cardVariationType || 'base');
  const [variationName, setVariationName] = useState(item.cardVariationName || '');
  const [variationFinish, setVariationFinish] = useState<string[]>(
    Array.isArray(item.cardVariationFinish) ? item.cardVariationFinish : []
  );
  const [variationConfirmed, setVariationConfirmed] = useState(item.cardVariationConfirmed ?? false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isVerifyingCert, setIsVerifyingCert] = useState(false);
  const [certVerified, setCertVerified] = useState<{
    valid: boolean;
    grade?: string;
    subject?: string;
    brand?: string;
    year?: string;
  } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // PSA Cert Verification
  const handleVerifyCert = async () => {
    if (!certNumber || certNumber.length < 6) {
      toast({ title: "Invalid cert number", variant: "destructive" });
      return;
    }
    
    setIsVerifyingCert(true);
    try {
      const res = await fetch(`/api/psa/verify/${certNumber}`, { credentials: 'include' });
      const data = await res.json();
      
      // Handle specific error cases
      if (!res.ok) {
        setCertVerified({ valid: false });
        if (data.needsConfig) {
          toast({ 
            title: "PSA API Not Configured", 
            description: "Please add PSA_API_TOKEN in settings to enable verification.",
            variant: "destructive" 
          });
        } else if (res.status === 401) {
          toast({ 
            title: "PSA Token Invalid", 
            description: "The PSA API token has expired or is invalid.",
            variant: "destructive" 
          });
        } else if (res.status === 404) {
          toast({ 
            title: "Cert Not Found", 
            description: "This cert number was not found in PSA's database.",
            variant: "destructive" 
          });
        } else {
          toast({ 
            title: data.message || "Verification failed", 
            variant: "destructive" 
          });
        }
        return;
      }
      
      if (data.valid && data.cert) {
        setCertVerified({
          valid: true,
          grade: data.cert.grade,
          subject: data.cert.subject,
          brand: data.cert.brand,
          year: data.cert.year,
        });
        // Auto-fill grade if PSA
        if (data.cert.grade && grader === 'psa') {
          setGrade(data.cert.grade);
        }
        toast({ 
          title: "PSA Verified!", 
          description: `${data.cert.subject} - Grade ${data.cert.grade}` 
        });
      } else {
        setCertVerified({ valid: false });
        toast({ 
          title: "Cert not found", 
          variant: "destructive" 
        });
      }
    } catch (err: any) {
      toast({ title: "Verification failed", variant: "destructive" });
    } finally {
      setIsVerifyingCert(false);
    }
  };

  // Fetch card library data
  const { data: gradersData } = useQuery<{ graders: { id: string; name: string; fullName: string }[] }>({
    queryKey: ['/api/card-library/graders'],
  });

  const { data: gradesData } = useQuery<{ grades: { grade: string; label: string }[] }>({
    queryKey: ['/api/card-library/grades', grader],
    enabled: !!grader,
  });

  const { data: setsData } = useQuery<{ sets: { id: string; name: string; sport: string }[] }>({
    queryKey: ['/api/card-library/sets'],
  });

  const { data: parallelsData } = useQuery<{ parallels: { id: string; name: string }[] }>({
    queryKey: ['/api/card-library/parallels'],
  });

  // Variation data
  const { data: variationTypesData } = useQuery<{ variationTypes: { id: string; name: string; description: string }[] }>({
    queryKey: ['/api/card-library/variation-types'],
  });

  const { data: parallelNamesData } = useQuery<{ parallelNames: { id: string; name: string; numbered: boolean }[] }>({
    queryKey: ['/api/card-library/parallel-names'],
  });

  const { data: insertSetsData } = useQuery<{ insertSets: { id: string; name: string; rarity: string }[] }>({
    queryKey: ['/api/card-library/insert-sets'],
  });

  const { data: finishPatternsData } = useQuery<{ finishPatterns: { id: string; name: string }[] }>({
    queryKey: ['/api/card-library/finish-patterns'],
  });

  // Auto-suggest variation when title changes or serial number is detected
  useEffect(() => {
    if (variationConfirmed) return; // Don't override if user confirmed
    
    const hasSerial = !!(serialNumber && serialTotal);
    
    // Suggest variation from title
    const suggestFromTitle = async () => {
      try {
        const res = await fetch('/api/card-library/suggest-variation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ text: item.title || '', serialNumber }),
        });
        if (res.ok) {
          const { suggestion } = await res.json();
          if (suggestion) {
            if (suggestion.variationType) setVariationType(suggestion.variationType);
            if (suggestion.variationName) setVariationName(suggestion.variationName);
            if (suggestion.variationFinish?.length > 0) setVariationFinish(suggestion.variationFinish);
            if (suggestion.needsConfirmation && !variationConfirmed) {
              setShowConfirmation(true);
            }
          }
        }
      } catch (e) {
        // Ignore errors
      }
    };
    
    if (item.title && !variationConfirmed) {
      suggestFromTitle();
    }
  }, [item.title, serialNumber, variationConfirmed]);

  // Check if confirmation needed when serial number changes
  useEffect(() => {
    if (serialNumber && serialTotal && !variationConfirmed) {
      if (variationType === 'base') {
        setShowConfirmation(true);
      }
    }
  }, [serialNumber, serialTotal, variationType, variationConfirmed]);

  const handleConfirmVariation = () => {
    setVariationConfirmed(true);
    setShowConfirmation(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/items/${item.id}/card-metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          cardIsGraded: isGraded,
          cardGrader: grader || null,
          cardGrade: grade || null,
          cardYear: year || null,
          cardSet: cardSet || null,
          cardPlayer: player || null,
          cardNumber: cardNumber || null,
          cardParallel: parallel || null,
          cardCertNumber: certNumber || null,
          cardSerialNumber: serialNumber || null,
          cardSerialTotal: serialTotal || null,
          cardVariationType: variationType || null,
          cardVariationName: variationName || null,
          cardVariationFinish: variationFinish.length > 0 ? variationFinish : null,
          cardVariationConfirmed: variationConfirmed,
        }),
      });

      if (!response.ok) throw new Error('Failed to save');

      queryClient.invalidateQueries({ queryKey: ['/api/items'] });
      toast({ title: 'Card details saved' });
      setIsOpen(false);
    } catch (err) {
      toast({ title: 'Failed to save', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const graders = gradersData?.graders || [];
  const grades = gradesData?.grades || [];
  const sets = setsData?.sets || [];
  const parallels = parallelsData?.parallels || [];
  const variationTypesList = variationTypesData?.variationTypes || [];
  const parallelNamesList = parallelNamesData?.parallelNames || [];
  const insertSetsList = insertSetsData?.insertSets || [];
  const finishPatternsList = finishPatternsData?.finishPatterns || [];

  const selectedGraderName = graders.find(g => g.id === grader)?.name;
  const hasCardData = isGraded || player || cardSet || variationType !== 'base';

  // Toggle finish pattern
  const toggleFinish = (id: string) => {
    if (variationFinish.includes(id)) {
      setVariationFinish(variationFinish.filter(f => f !== id));
    } else {
      setVariationFinish([...variationFinish, id]);
    }
    setVariationConfirmed(true); // User made a manual change
  };

  // Show for any card type: sports, TCG (Pokemon, Magic, Yu-Gi-Oh), Marvel, etc.
  const category = item.category?.toLowerCase() || '';
  const title = item.title?.toLowerCase() || '';
  const isCard = category.includes('card') || category.includes('sports') || 
                 category.includes('tcg') || category.includes('pokemon') || 
                 category.includes('magic') || category.includes('marvel') ||
                 category.includes('collectible') ||
                 title.includes('card') || title.includes('tcg');
  if (!isCard) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.17 }}
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card className="overflow-hidden">
          <CollapsibleTrigger asChild>
            <button 
              className="flex items-center justify-between w-full p-4 text-left hover:bg-secondary/50 transition-colors"
              data-testid="button-toggle-card-metadata"
            >
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Card Details</span>
                {hasCardData && (
                  <Badge variant="secondary" className="text-xs ml-2">
                    {isGraded ? `${selectedGraderName || 'Graded'} ${grade}` : (player || 'Set')}
                  </Badge>
                )}
                {/* Confidence State Badge - HIGH (Verified), ESTIMATE (yellow), BLOCKED (red) */}
                {variationConfirmed !== undefined && variationConfirmed !== null && (
                  <Badge 
                    variant={variationConfirmed ? "default" : "outline"} 
                    className={cn(
                      "text-xs ml-1",
                      variationConfirmed 
                        ? "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30" 
                        : "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30"
                    )}
                  >
                    {variationConfirmed ? "Verified" : "Estimate"}
                  </Badge>
                )}
                {/* BLOCKED state - null means identity could not be validated */}
                {variationConfirmed === null && (
                  <Badge 
                    variant="outline" 
                    className="text-xs ml-1 bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30"
                  >
                    Not Verified
                  </Badge>
                )}
              </div>
              <ChevronDown className={cn(
                "w-4 h-4 text-muted-foreground transition-transform duration-200",
                isOpen && "rotate-180"
              )} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4 pt-0 space-y-4 border-t border-border/50">
              {/* Graded Toggle */}
              <div className="pt-3 flex items-center justify-between">
                <Label className="text-sm">Is this card graded (slabbed)?</Label>
                <Switch 
                  checked={isGraded} 
                  onCheckedChange={setIsGraded}
                  data-testid="switch-card-graded"
                />
              </div>

              {/* Graded Card Fields */}
              {isGraded && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Grader */}
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Grader</Label>
                      <select
                        value={grader}
                        onChange={(e) => { setGrader(e.target.value); setGrade(''); }}
                        className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm"
                        data-testid="select-card-grader"
                      >
                        <option value="">Select grader...</option>
                        {graders.map((g) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    </div>
                    {/* Grade */}
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1.5 block">Grade</Label>
                      <select
                        value={grade}
                        onChange={(e) => setGrade(e.target.value)}
                        className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm"
                        data-testid="select-card-grade"
                        disabled={!grader}
                      >
                        <option value="">Select grade...</option>
                        {grades.map((g) => (
                          <option key={g.grade} value={g.grade}>{g.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {/* Cert Number with PSA Verify */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Cert Number</Label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={certNumber}
                        onChange={(e) => {
                          setCertNumber(e.target.value);
                          setCertVerified(null);
                        }}
                        placeholder="e.g., 12345678"
                        className={cn(
                          "flex-1 h-9 px-3 rounded-md border bg-background text-sm",
                          certVerified?.valid 
                            ? "border-green-500 bg-green-500/10" 
                            : certVerified?.valid === false 
                            ? "border-red-500 bg-red-500/10" 
                            : "border-border"
                        )}
                        data-testid="input-card-cert"
                      />
                      {grader === 'psa' && certNumber.length >= 6 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleVerifyCert}
                          disabled={isVerifyingCert}
                          className="h-9 px-3"
                          data-testid="button-verify-psa"
                        >
                          {isVerifyingCert ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : certVerified?.valid ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            "Verify"
                          )}
                        </Button>
                      )}
                    </div>
                    {certVerified?.valid && (
                      <p className="text-xs text-green-600 mt-1">
                        Verified: {certVerified.subject} (Grade {certVerified.grade})
                      </p>
                    )}
                  </div>
                </>
              )}

              {/* Common Fields (both graded and raw) */}
              <div className="grid grid-cols-2 gap-3">
                {/* Year */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Year</Label>
                  <input
                    type="text"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder="e.g., 2020"
                    className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm"
                    data-testid="input-card-year"
                  />
                </div>
                {/* Set */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Set</Label>
                  <select
                    value={cardSet}
                    onChange={(e) => setCardSet(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm"
                    data-testid="select-card-set"
                  >
                    <option value="">Select set...</option>
                    {sets.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Player */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Player Name</Label>
                <input
                  type="text"
                  value={player}
                  onChange={(e) => setPlayer(e.target.value)}
                  placeholder="e.g., LeBron James"
                  className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm"
                  data-testid="input-card-player"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Card Number */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Card #</Label>
                  <input
                    type="text"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder="e.g., 101"
                    className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm"
                    data-testid="input-card-number"
                  />
                </div>
                {/* Parallel */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Parallel/Variant</Label>
                  <select
                    value={parallel}
                    onChange={(e) => setParallel(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm"
                    data-testid="select-card-parallel"
                  >
                    <option value="">Select parallel...</option>
                    {parallels.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Serial Numbering */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Serial Number (if numbered)</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    placeholder="e.g., 123"
                    className="w-24 h-9 px-3 rounded-md border border-border bg-background text-sm"
                    data-testid="input-serial-number"
                  />
                  <span className="text-muted-foreground">/</span>
                  <input
                    type="text"
                    value={serialTotal}
                    onChange={(e) => setSerialTotal(e.target.value)}
                    placeholder="e.g., 499"
                    className="w-24 h-9 px-3 rounded-md border border-border bg-background text-sm"
                    data-testid="input-serial-total"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Enter if card is serial numbered (e.g., 123/499)
                </p>
              </div>

              {/* Variation Section */}
              <div className="pt-2 border-t border-border/50">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 block">
                  Card Variation
                </Label>
                
                {/* Confirmation Prompt */}
                {showConfirmation && (
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-md mb-3">
                    <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400 mb-2">
                      Please confirm card variation
                    </p>
                    <p className="text-xs text-muted-foreground mb-3">
                      {serialNumber && serialTotal 
                        ? `Serial number ${serialNumber}/${serialTotal} detected - this is likely a parallel, not a base card.`
                        : 'We detected variation keywords but need confirmation for accurate pricing.'}
                    </p>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        onClick={handleConfirmVariation}
                        data-testid="button-confirm-variation"
                      >
                        Confirm Selection
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => { setVariationType('base'); setShowConfirmation(false); setVariationConfirmed(true); }}
                        data-testid="button-set-base"
                      >
                        It's a Base Card
                      </Button>
                    </div>
                  </div>
                )}

                {/* Variation Type */}
                <div className="mb-3">
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Variation Type</Label>
                  <div className="flex gap-2">
                    {variationTypesList.map((vt) => (
                      <button
                        key={vt.id}
                        onClick={() => { setVariationType(vt.id); setVariationName(''); setVariationConfirmed(true); }}
                        className={cn(
                          "flex-1 h-9 px-3 rounded-md border text-sm transition-colors",
                          variationType === vt.id 
                            ? "bg-primary text-primary-foreground border-primary" 
                            : "bg-background border-border hover:bg-secondary"
                        )}
                        data-testid={`button-variation-type-${vt.id}`}
                      >
                        {vt.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Variation Name (Parallel or Insert) */}
                {variationType === 'parallel' && (
                  <div className="mb-3">
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Parallel Name</Label>
                    <select
                      value={variationName}
                      onChange={(e) => { setVariationName(e.target.value); setVariationConfirmed(true); }}
                      className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm"
                      data-testid="select-parallel-name"
                    >
                      <option value="">Select parallel...</option>
                      {parallelNamesList.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name} {p.numbered && '(#)'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {variationType === 'insert' && (
                  <div className="mb-3">
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Insert Set</Label>
                    <select
                      value={variationName}
                      onChange={(e) => { setVariationName(e.target.value); setVariationConfirmed(true); }}
                      className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm"
                      data-testid="select-insert-name"
                    >
                      <option value="">Select insert...</option>
                      {insertSetsList.map((i) => (
                        <option key={i.id} value={i.name}>
                          {i.name} ({i.rarity})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Finish/Pattern Tags */}
                {(variationType === 'parallel' || variationType === 'insert') && (
                  <div className="mb-3">
                    <Label className="text-xs text-muted-foreground mb-1.5 block">
                      Finish/Pattern (select all that apply)
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {finishPatternsList.slice(0, 12).map((f) => (
                        <button
                          key={f.id}
                          onClick={() => toggleFinish(f.id)}
                          className={cn(
                            "px-2 py-1 rounded text-xs border transition-colors",
                            variationFinish.includes(f.id)
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background border-border hover:bg-secondary"
                          )}
                          data-testid={`button-finish-${f.id}`}
                        >
                          {f.name}
                        </button>
                      ))}
                    </div>
                    {variationFinish.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Selected: {variationFinish.join(', ')}
                      </p>
                    )}
                  </div>
                )}

                {/* Variation confirmed indicator */}
                {variationConfirmed && (
                  <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                    <Check className="w-3 h-3" />
                    <span>Variation confirmed</span>
                  </div>
                )}
              </div>

              {/* Raw Card Back Image Note */}
              {!isGraded && (
                <div className="p-3 bg-secondary/30 rounded-md">
                  <p className="text-xs text-muted-foreground">
                    For raw cards, capturing the back image helps confirm set, year, and card number from fine print.
                  </p>
                </div>
              )}

              {/* Save Button */}
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full"
                data-testid="button-save-card-metadata"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Card Details'
                )}
              </Button>
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </motion.div>
  );
}

function GradingReadinessSection({ item }: { item: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploadingFront, setIsUploadingFront] = useState(false);
  const [isUploadingBack, setIsUploadingBack] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const category = item.category?.toLowerCase() || '';
  const title = item.title?.toLowerCase() || '';
  // Show for any card type: sports, TCG (Pokemon, Magic, Yu-Gi-Oh), Marvel, etc.
  const isCard = category.includes('card') || category.includes('sports') || 
                 category.includes('tcg') || category.includes('pokemon') || 
                 category.includes('magic') || category.includes('marvel') ||
                 category.includes('collectible') ||
                 title.includes('card') || title.includes('tcg');
  const isGraded = item.cardIsGraded ?? false;
  const hasFrontImage = !!item.cardImageFrontUrl;
  const hasBackImage = !!item.cardImageBackUrl;
  
  // Handle image upload for front/back card photos
  const handleImageUpload = async (file: File, side: 'front' | 'back') => {
    const setSaving = side === 'front' ? setIsUploadingFront : setIsUploadingBack;
    setSaving(true);
    
    try {
      // Convert to base64
      const reader = new FileReader();
      const imageBase64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      // Upload to server
      const fieldName = side === 'front' ? 'cardImageFrontUrl' : 'cardImageBackUrl';
      const response = await fetch(`/api/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ [fieldName]: imageBase64 })
      });
      
      if (!response.ok) {
        throw new Error('Upload failed');
      }
      
      await queryClient.invalidateQueries({ queryKey: ['/api/items'] });
      toast({ title: `${side === 'front' ? 'Front' : 'Back'} image uploaded` });
    } catch (error) {
      toast({ 
        title: "Upload failed", 
        description: "Could not save card image",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };
  
  if (!isCard || isGraded) {
    return null;
  }
  
  const gradingReadiness = item.gradingReadiness as {
    readinessLevel?: 'high' | 'medium' | 'low';
    summary?: string;
    factors?: Array<{ name: string; assessment: 'good' | 'fair' | 'concern'; notes: string }>;
    defectLocations?: Array<{ area: string; issue: string; severity: 'minor' | 'moderate' | 'major' }>;
    conditionTier?: { tier: 'gem-candidate' | 'high-grade' | 'mid-grade' | 'low-grade'; description: string; submissionAdvice: string };
    roi?: { 
      rawValue: number; 
      gradedValueLow: number; 
      gradedValueHigh: number; 
      gradingCost: number;
      profitPotentialLow: number;
      profitPotentialHigh: number;
      recommendation: 'grade' | 'keep-raw' | 'borderline';
      reasoning: string;
    };
    disclaimer?: string;
  } | null;
  
  const handleAnalyze = async () => {
    if (!hasFrontImage) {
      toast({
        title: "Image Required",
        description: "Please upload a front card image first to assess grading readiness.",
        variant: "destructive"
      });
      return;
    }
    
    setIsAnalyzing(true);
    try {
      const response = await fetch(`/api/items/${item.id}/grading-readiness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Analysis failed');
      }
      
      await queryClient.invalidateQueries({ queryKey: ['/api/items'] });
      toast({ title: "Assessment Complete", description: "Grading readiness has been analyzed." });
    } catch (error: any) {
      toast({ 
        title: "Analysis Failed", 
        description: error.message || "Could not analyze grading readiness",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };
  
  const getReadinessColor = (level: string) => {
    switch (level) {
      case 'high': return 'text-green-600 dark:text-green-400';
      case 'medium': return 'text-amber-600 dark:text-amber-400';
      case 'low': return 'text-red-600 dark:text-red-400';
      default: return 'text-muted-foreground';
    }
  };
  
  const getReadinessBg = (level: string) => {
    switch (level) {
      case 'high': return 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800';
      case 'medium': return 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800';
      case 'low': return 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800';
      default: return 'bg-secondary/30';
    }
  };
  
  const getFactorIcon = (assessment: string) => {
    switch (assessment) {
      case 'good': return <span className="text-green-600 dark:text-green-400">●</span>;
      case 'fair': return <span className="text-amber-600 dark:text-amber-400">◐</span>;
      case 'concern': return <span className="text-red-600 dark:text-red-400">○</span>;
      default: return null;
    }
  };
  
  const getReadinessLabel = (level: string) => {
    switch (level) {
      case 'high': return 'High Grading Readiness';
      case 'medium': return 'Medium Grading Readiness';
      case 'low': return 'Low Grading Readiness';
      default: return 'Not Assessed';
    }
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.22 }}
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card className="overflow-hidden">
          <CollapsibleTrigger asChild>
            <button 
              className="w-full p-4 flex items-center justify-between gap-2 text-left hover-elevate"
              data-testid="button-grading-readiness-toggle"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="font-medium text-sm">Grading Readiness</span>
                {gradingReadiness?.readinessLevel && (
                  <Badge 
                    variant="outline" 
                    className={cn("text-xs", getReadinessColor(gradingReadiness.readinessLevel))}
                    data-testid="badge-readiness-level"
                  >
                    {gradingReadiness.readinessLevel === 'high' ? 'High' : 
                     gradingReadiness.readinessLevel === 'medium' ? 'Medium' : 'Low'}
                  </Badge>
                )}
              </div>
              <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <div className="px-4 pb-4 space-y-4">
              {/* Camera capture buttons for front and back images */}
              <div className="grid grid-cols-2 gap-3">
                {/* Front Image */}
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file, 'front');
                      e.target.value = '';
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    disabled={isUploadingFront}
                    data-testid="input-card-front-camera"
                  />
                  <div className={cn(
                    "border-2 border-dashed rounded-lg p-3 text-center transition-colors",
                    hasFrontImage 
                      ? "border-green-500/50 bg-green-500/10" 
                      : "border-border hover:border-primary/50"
                  )}>
                    {isUploadingFront ? (
                      <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
                    ) : hasFrontImage ? (
                      <img 
                        src={item.cardImageFrontUrl} 
                        alt="Front" 
                        className="w-full h-20 object-contain rounded"
                      />
                    ) : (
                      <div className="py-2">
                        <Camera className="w-6 h-6 mx-auto text-muted-foreground mb-1" />
                        <span className="text-xs text-muted-foreground">Front</span>
                      </div>
                    )}
                  </div>
                  {hasFrontImage && (
                    <Badge variant="outline" className="absolute -top-2 -right-2 text-xs bg-green-500 text-white border-green-500">
                      <Check className="w-3 h-3" />
                    </Badge>
                  )}
                </div>
                
                {/* Back Image */}
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file, 'back');
                      e.target.value = '';
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    disabled={isUploadingBack}
                    data-testid="input-card-back-camera"
                  />
                  <div className={cn(
                    "border-2 border-dashed rounded-lg p-3 text-center transition-colors",
                    hasBackImage 
                      ? "border-green-500/50 bg-green-500/10" 
                      : "border-border hover:border-primary/50"
                  )}>
                    {isUploadingBack ? (
                      <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
                    ) : hasBackImage ? (
                      <img 
                        src={item.cardImageBackUrl} 
                        alt="Back" 
                        className="w-full h-20 object-contain rounded"
                      />
                    ) : (
                      <div className="py-2">
                        <Camera className="w-6 h-6 mx-auto text-muted-foreground mb-1" />
                        <span className="text-xs text-muted-foreground">Back</span>
                      </div>
                    )}
                  </div>
                  {hasBackImage && (
                    <Badge variant="outline" className="absolute -top-2 -right-2 text-xs bg-green-500 text-white border-green-500">
                      <Check className="w-3 h-3" />
                    </Badge>
                  )}
                </div>
              </div>
              
              <p className="text-xs text-muted-foreground text-center">
                Tap to capture card photos for grading assessment
              </p>
              
              {hasFrontImage && !gradingReadiness && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Analyze visible card condition to assess whether professional grading may be worth considering.
                  </p>
                  <Button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    variant="outline"
                    className="w-full"
                    data-testid="button-analyze-grading-readiness"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Assess Grading Readiness
                      </>
                    )}
                  </Button>
                </div>
              )}
              
              {gradingReadiness?.readinessLevel && (
                <div className="space-y-4">
                  <div className={cn("p-4 rounded-lg border", getReadinessBg(gradingReadiness.readinessLevel))}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn("text-lg font-semibold", getReadinessColor(gradingReadiness.readinessLevel))}>
                        {getReadinessLabel(gradingReadiness.readinessLevel)}
                      </span>
                    </div>
                    {gradingReadiness.summary && (
                      <p className="text-sm text-foreground/80">{gradingReadiness.summary}</p>
                    )}
                  </div>
                  
                  {gradingReadiness.factors && gradingReadiness.factors.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Visible Factors</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {gradingReadiness.factors.map((factor, idx) => (
                          <div key={idx} className="p-2 bg-secondary/20 rounded-md">
                            <div className="flex items-center gap-2 mb-1">
                              {getFactorIcon(factor.assessment)}
                              <span className="text-sm font-medium">{factor.name}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{factor.notes}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Condition Tier - NOT a grade prediction */}
                  {gradingReadiness.conditionTier && (
                    <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Condition Assessment</h4>
                        <Badge variant="outline" className={cn(
                          "text-xs",
                          gradingReadiness.conditionTier.tier === 'gem-candidate' && "border-green-500 text-green-600",
                          gradingReadiness.conditionTier.tier === 'high-grade' && "border-blue-500 text-blue-600",
                          gradingReadiness.conditionTier.tier === 'mid-grade' && "border-amber-500 text-amber-600",
                          gradingReadiness.conditionTier.tier === 'low-grade' && "border-red-500 text-red-600"
                        )}>
                          {gradingReadiness.conditionTier.tier === 'gem-candidate' ? 'Gem Candidate' :
                           gradingReadiness.conditionTier.tier === 'high-grade' ? 'High Grade Potential' :
                           gradingReadiness.conditionTier.tier === 'mid-grade' ? 'Mid-Grade' : 'Lower Grade'}
                        </Badge>
                      </div>
                      {gradingReadiness.conditionTier.description && (
                        <p className="text-sm text-foreground/80 mb-2">{gradingReadiness.conditionTier.description}</p>
                      )}
                      {gradingReadiness.conditionTier.submissionAdvice && (
                        <p className="text-xs text-muted-foreground italic">{gradingReadiness.conditionTier.submissionAdvice}</p>
                      )}
                    </div>
                  )}
                  
                  {/* Defect Locations */}
                  {gradingReadiness.defectLocations && gradingReadiness.defectLocations.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Defect Locations</h4>
                      <div className="relative">
                        {/* Card outline with defect markers */}
                        <div className="border-2 border-dashed border-muted rounded-lg aspect-[2.5/3.5] relative bg-secondary/10">
                          {gradingReadiness.defectLocations.map((defect, idx) => {
                            const positionMap: Record<string, string> = {
                              'top-left': 'top-2 left-2',
                              'top-right': 'top-2 right-2',
                              'bottom-left': 'bottom-2 left-2',
                              'bottom-right': 'bottom-2 right-2',
                              'top-edge': 'top-2 left-1/2 -translate-x-1/2',
                              'bottom-edge': 'bottom-2 left-1/2 -translate-x-1/2',
                              'left-edge': 'top-1/2 left-2 -translate-y-1/2',
                              'right-edge': 'top-1/2 right-2 -translate-y-1/2',
                              'center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
                              'surface': 'top-1/3 left-1/2 -translate-x-1/2',
                            };
                            const severityColor = defect.severity === 'major' ? 'bg-red-500' : 
                                                  defect.severity === 'moderate' ? 'bg-amber-500' : 'bg-yellow-400';
                            const position = positionMap[defect.area] || 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2';
                            return (
                              <div 
                                key={idx}
                                className={cn(
                                  "absolute w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md",
                                  severityColor,
                                  position
                                )}
                                title={`${defect.issue} (${defect.severity})`}
                              >
                                {idx + 1}
                              </div>
                            );
                          })}
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xs text-muted-foreground">Card Defect Map</span>
                          </div>
                        </div>
                        {/* Defect legend */}
                        <div className="mt-2 space-y-1">
                          {gradingReadiness.defectLocations.map((defect, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs">
                              <span className={cn(
                                "w-4 h-4 rounded-full flex items-center justify-center text-white text-xs",
                                defect.severity === 'major' ? 'bg-red-500' : 
                                defect.severity === 'moderate' ? 'bg-amber-500' : 'bg-yellow-400'
                              )}>
                                {idx + 1}
                              </span>
                              <span className="text-muted-foreground">{defect.area}:</span>
                              <span>{defect.issue}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* ROI Calculator - only shown when we have comps data */}
                  {!gradingReadiness.roi && gradingReadiness.conditionTier && (
                    <div className="p-3 bg-secondary/20 rounded-md border border-secondary/30">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <DollarSign className="w-4 h-4" />
                        <span>ROI calculator unavailable - no pricing data found for this card.</span>
                      </div>
                    </div>
                  )}
                  
                  {gradingReadiness.roi && (
                    <div className={cn(
                      "p-4 rounded-lg border",
                      gradingReadiness.roi.recommendation === 'grade' ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800" :
                      gradingReadiness.roi.recommendation === 'keep-raw' ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800" :
                      "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
                    )}>
                      <div className="flex items-center gap-2 mb-3">
                        <DollarSign className="w-4 h-4 text-primary" />
                        <h4 className="font-semibold text-sm">Grading ROI Calculator</h4>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="text-center p-2 bg-background/50 rounded">
                          <div className="text-xs text-muted-foreground">Raw Value</div>
                          <div className="font-bold">${gradingReadiness.roi.rawValue}</div>
                        </div>
                        <div className="text-center p-2 bg-background/50 rounded">
                          <div className="text-xs text-muted-foreground">Grading Cost</div>
                          <div className="font-bold">${gradingReadiness.roi.gradingCost}</div>
                        </div>
                        <div className="text-center p-2 bg-background/50 rounded">
                          <div className="text-xs text-muted-foreground">Graded Value</div>
                          <div className="font-bold">${gradingReadiness.roi.gradedValueLow}-${gradingReadiness.roi.gradedValueHigh}</div>
                        </div>
                      </div>
                      
                      <div className={cn(
                        "p-3 rounded-md mb-3 text-center",
                        gradingReadiness.roi.recommendation === 'grade' ? "bg-green-100 dark:bg-green-900/50" :
                        gradingReadiness.roi.recommendation === 'keep-raw' ? "bg-red-100 dark:bg-red-900/50" :
                        "bg-amber-100 dark:bg-amber-900/50"
                      )}>
                        <div className="text-lg font-bold mb-1">
                          {gradingReadiness.roi.recommendation === 'grade' ? 'Grade It!' :
                           gradingReadiness.roi.recommendation === 'keep-raw' ? 'Keep Raw' : 'Borderline'}
                        </div>
                        <div className="text-sm">
                          Profit potential: <span className={gradingReadiness.roi.profitPotentialHigh > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                            ${gradingReadiness.roi.profitPotentialLow} to ${gradingReadiness.roi.profitPotentialHigh}
                          </span>
                        </div>
                      </div>
                      
                      <p className="text-xs text-muted-foreground">{gradingReadiness.roi.reasoning}</p>
                    </div>
                  )}
                  
                  <div className="p-3 bg-secondary/10 rounded-md border border-secondary/20">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {gradingReadiness.disclaimer || "This is a visual assessment only based on provided images. Professional grading outcomes may vary significantly due to factors not visible in photos. This assessment is advisory and should not be used to predict or guarantee grading results."}
                    </p>
                  </div>
                  
                  <Button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    data-testid="button-reanalyze-grading-readiness"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Re-analyzing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Re-analyze with New Images
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </motion.div>
  );
}
