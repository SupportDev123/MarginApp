import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { incrementScanCount, markYardSaleComplete } from "@/components/FeedbackGate";
import { getCategoryFeeMultiplier, getShippingAllowance } from "@shared/pricingEngine";
import { 
  Camera, ArrowLeft, Volume2, VolumeX, DollarSign,
  CheckCircle, XCircle, Loader2, ShoppingBag, TrendingUp,
  Target, Zap, RotateCcw, ChevronRight, Check, RefreshCw, Share2,
  AlertTriangle
} from "lucide-react";
import { ShareButton } from "@/components/ShareButton";
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from "framer-motion";

interface ScannedItem {
  id: string;
  imageBase64: string;
  status: 'scanning' | 'complete' | 'error';
  title?: string;
  category?: string;
  brand?: string;
  verdict?: 'flip' | 'skip';
  maxBuy?: number;
  medianSoldPrice?: number;
  expectedResale?: number;
  netAfterFees?: number;
  targetProfit?: number;
  shippingAllowance?: number;
  soldCompCount?: number;
  priceConfidence?: 'high' | 'moderate' | 'low' | 'ai_estimate';
  priceSource?: 'sold_comps' | 'active_listings' | 'ai_estimate';
  displayMode?: 'single' | 'range' | 'estimate_range';
  lowComp?: number;
  highComp?: number;
  resaleRange?: { low: number; high: number };
  estimatedProfit?: number;
  estimatedProfitRange?: { low: number; high: number };
  avgComp?: number;
  error?: string;
  itemId?: number;
  needsMoreInfo?: string;
  brandDetected?: string;
  identifyConfidence?: number;
  swipeConfirmed?: boolean;
  compThumbnail?: string;
  dismissed?: boolean;
  matchStrength?: 'strong' | 'moderate' | 'weak' | 'none';
  matchSource?: 'library' | 'openai' | 'fallback';
  inconsistentComps?: boolean;
  ceilingApplied?: boolean;
  clampApplied?: boolean;
}

const SESSION_LIMIT = 20; // 20-swipe session limit

interface TripStats {
  itemsScanned: number;
  flips: number;
  skips: number;
  totalPotentialProfit: number;
  aiEstimatedItems: number;
  categoryBreakdown: Record<string, { count: number; profit: number }>;
}

const FLIP_SOUND_FREQUENCY = 800;
const SKIP_SOUND_FREQUENCY = 300;

// Haptic feedback helper
const triggerHaptic = (type: 'light' | 'medium' | 'heavy' = 'medium') => {
  if ('vibrate' in navigator) {
    const patterns = {
      light: [10],
      medium: [30],
      heavy: [50, 30, 50]
    };
    navigator.vibrate(patterns[type]);
  }
};

// Confidence badge helper with strict visual/text rules
// High (green) = single number, Moderate (yellow) = range, Low (red) = estimate range
const ConfidenceBadge = ({ confidence, source }: { 
  confidence?: 'high' | 'moderate' | 'low' | 'ai_estimate';
  source?: 'sold_comps' | 'active_listings' | 'ai_estimate';
}) => {
  if (!confidence) return null;
  
  if (confidence === 'ai_estimate') {
    return (
      <Badge variant="destructive" className="text-[10px] px-1.5 h-5 bg-red-500">
        AI Est
      </Badge>
    );
  }
  if (confidence === 'high') {
    return (
      <Badge variant="default" className="text-[10px] px-1.5 h-5 bg-green-500">
        High
      </Badge>
    );
  }
  if (confidence === 'moderate') {
    return (
      <Badge variant="secondary" className="text-[10px] px-1.5 h-5 bg-yellow-500 text-black">
        Mod
      </Badge>
    );
  }
  if (confidence === 'low') {
    return (
      <Badge variant="destructive" className="text-[10px] px-1.5 h-5 bg-red-500/80">
        Limited
      </Badge>
    );
  }
  return null;
};

// Helper to format resale display based on confidence/displayMode
const formatResaleDisplay = (item: ScannedItem): string => {
  if (item.displayMode === 'single' && item.expectedResale) {
    return `$${Math.round(item.expectedResale)}`;
  }
  if (item.resaleRange && (item.displayMode === 'range' || item.displayMode === 'estimate_range')) {
    return `$${item.resaleRange.low}–$${item.resaleRange.high}`;
  }
  // Fallback to median
  if (item.medianSoldPrice) {
    return `$${Math.round(item.medianSoldPrice)}`;
  }
  return '--';
};

// Helper to format profit display based on confidence
const formatProfitDisplay = (item: ScannedItem): string => {
  if (item.priceConfidence === 'high' && item.estimatedProfit !== undefined) {
    return item.estimatedProfit >= 0 ? `+$${item.estimatedProfit}` : `-$${Math.abs(item.estimatedProfit)}`;
  }
  if (item.estimatedProfitRange) {
    const { low, high } = item.estimatedProfitRange;
    if (low < 0 && high < 0) {
      return `-$${Math.abs(high)} to -$${Math.abs(low)}`;
    }
    if (low < 0) {
      return `-$${Math.abs(low)} to +$${high}`;
    }
    return `+$${low} to +$${high}`;
  }
  if (item.estimatedProfit !== undefined) {
    return item.estimatedProfit >= 0 ? `+$${item.estimatedProfit}` : `-$${Math.abs(item.estimatedProfit)}`;
  }
  return '--';
};

export default function YardSaleMode() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  const [isActive, setIsActive] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [tripStats, setTripStats] = useState<TripStats>({
    itemsScanned: 0,
    flips: 0,
    skips: 0,
    totalPotentialProfit: 0,
    aiEstimatedItems: 0,
    categoryBreakdown: {}
  });
  const [showSummary, setShowSummary] = useState(false);
  const [pricingItemId, setPricingItemId] = useState<string | null>(null);
  const [enteredPrice, setEnteredPrice] = useState('');
  const [swipedItems, setSwipedItems] = useState<Set<string>>(new Set());
  
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const isPro = user?.subscriptionTier === 'pro' || user?.isAdmin;

  // Track items with pending dismiss timers
  const dismissTimersRef = useRef<Set<string>>(new Set());
  
  // Auto-dismiss SKIP items after 3 seconds (only if swipe confirmed)
  useEffect(() => {
    const skipItems = scannedItems.filter(
      item => item.status === 'complete' && 
              item.verdict === 'skip' && 
              item.swipeConfirmed && 
              !item.dismissed &&
              !dismissTimersRef.current.has(item.id) // Guard against duplicate timers
    );
    
    if (skipItems.length === 0) return;
    
    const timers = skipItems.map(item => {
      dismissTimersRef.current.add(item.id);
      return setTimeout(() => {
        setScannedItems(prev => prev.map(i => 
          i.id === item.id ? { ...i, dismissed: true } : i
        ));
        dismissTimersRef.current.delete(item.id);
      }, 3000);
    });
    
    return () => {
      timers.forEach(t => clearTimeout(t));
      skipItems.forEach(item => dismissTimersRef.current.delete(item.id));
    };
  }, [scannedItems]);

  // Calculate running total from confirmed flips
  const runningTotal = scannedItems
    .filter(item => item.swipeConfirmed && item.verdict === 'flip' && item.estimatedProfit && item.estimatedProfit > 0)
    .reduce((sum, item) => sum + (item.estimatedProfit || 0), 0);

  // Start a fresh batch session when entering active mode
  useEffect(() => {
    if (isActive && scannedItems.length === 0) {
      // Start new backend batch session when user enters Yard Sale Mode
      (async () => {
        try {
          await apiRequest('POST', '/api/batch/session', {});
          queryClient.invalidateQueries({ queryKey: ['/api/batch/session'] });
        } catch (err) {
          console.error('Failed to start batch session:', err);
        }
      })();
    }
  }, [isActive, scannedItems.length]);

  // Initialize audio context on user gesture (called on Start Trip)
  const initAudio = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      // Resume if suspended (required for mobile)
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
    } catch (e) {
      console.log('Audio not available');
    }
  }, []);

  const playSound = useCallback((isFlip: boolean) => {
    if (!audioEnabled || !audioContextRef.current) return;
    
    try {
      const ctx = audioContextRef.current;
      
      // Resume if suspended
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = isFlip ? FLIP_SOUND_FREQUENCY : SKIP_SOUND_FREQUENCY;
      oscillator.type = isFlip ? 'sine' : 'square';
      
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + (isFlip ? 0.3 : 0.2));
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + (isFlip ? 0.3 : 0.2));
      
      if (isFlip) {
        setTimeout(() => {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.frequency.value = 1000;
          osc2.type = 'sine';
          gain2.gain.setValueAtTime(0.3, ctx.currentTime);
          gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
          osc2.start(ctx.currentTime);
          osc2.stop(ctx.currentTime + 0.2);
        }, 150);
      }
    } catch (e) {
      console.log('Audio not available');
    }
  }, [audioEnabled]);

  // Handle confirming the asking price and calculating final verdict
  const handleConfirmPrice = useCallback((itemId: string, askingPrice: number) => {
    // Find the item first to calculate verdict
    const targetItem = scannedItems.find(i => i.id === itemId);
    if (!targetItem) return;
    
    const maxBuy = targetItem.maxBuy || 0;
    const isGoodDeal = askingPrice <= maxBuy;
    const newVerdict: 'flip' | 'skip' = isGoodDeal ? 'flip' : 'skip';
    
    // Standardized GP formula: (Median × feeMultiplier) - Buy Price - Shipping
    const feeMultiplier = getCategoryFeeMultiplier(targetItem.category);
    const netAfterFees = targetItem.netAfterFees || (targetItem.medianSoldPrice || targetItem.avgComp || 0) * feeMultiplier;
    const shippingAllowance = targetItem.shippingAllowance || getShippingAllowance(targetItem.category);
    const newProfit = isGoodDeal && netAfterFees > 0 
      ? Math.round(netAfterFees - askingPrice - shippingAllowance) 
      : 0;
    
    // Update the item with new verdict and mark as confirmed
    setScannedItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, verdict: newVerdict, estimatedProfit: newProfit, swipeConfirmed: true } : item
    ));
    
    // Only update trip stats if this is the first user confirmation (not already confirmed via swipe)
    if (!targetItem.swipeConfirmed) {
      setTripStats(prevStats => ({
        ...prevStats,
        flips: isGoodDeal ? prevStats.flips + 1 : prevStats.flips,
        skips: !isGoodDeal ? prevStats.skips + 1 : prevStats.skips,
        totalPotentialProfit: prevStats.totalPotentialProfit + (isGoodDeal && newProfit > 0 ? newProfit : 0)
      }));
    }
    
    // Play audio feedback
    playSound(newVerdict === 'flip');
    
    setPricingItemId(null);
    setEnteredPrice('');
  }, [playSound, scannedItems]);

  // Handle swipe gestures - right = flip, left = skip
  // Only counts toward stats if no prior user confirmation (prevents double-counting)
  const handleSwipe = useCallback((itemId: string, direction: 'left' | 'right') => {
    const item = scannedItems.find(i => i.id === itemId);
    if (!item || item.status === 'scanning') return;
    
    // Check session limit
    if (sessionLimitReached) {
      toast({
        title: "Session limit reached",
        description: "End this session to start a new one",
        variant: "destructive"
      });
      return;
    }
    
    const isFlip = direction === 'right';
    const newVerdict: 'flip' | 'skip' = isFlip ? 'flip' : 'skip';
    
    // Standardized GP formula: (Median × feeMultiplier) - Buy Price - Shipping
    // For swipe, assume buy at maxBuy price
    const feeMultiplier = getCategoryFeeMultiplier(item.category);
    const netAfterFees = item.netAfterFees || (item.medianSoldPrice || item.avgComp || 0) * feeMultiplier;
    const shippingAllowance = item.shippingAllowance || getShippingAllowance(item.category);
    const buyPrice = item.maxBuy || 0;
    const profit = isFlip && netAfterFees > 0 
      ? Math.round(netAfterFees - buyPrice - shippingAllowance) 
      : 0;
    
    // Mark as swiped for animation
    setSwipedItems(prev => new Set(prev).add(itemId));
    
    // Update item verdict
    setScannedItems(prev => prev.map(i => 
      i.id === itemId ? { ...i, verdict: newVerdict, estimatedProfit: profit, swipeConfirmed: true } : i
    ));
    
    // Only update trip stats if this is first user decision (not double-counting auto-verdicts)
    // Auto-verdicts from scan don't count - only user confirmations (swipe or price entry)
    if (!item.swipeConfirmed) {
      setTripStats(prev => ({
        ...prev,
        flips: isFlip ? prev.flips + 1 : prev.flips,
        skips: !isFlip ? prev.skips + 1 : prev.skips,
        totalPotentialProfit: prev.totalPotentialProfit + (isFlip && profit > 0 ? profit : 0)
      }));
    }
    
    // Play audio feedback
    playSound(isFlip);
    
    // Haptic feedback - stronger for flips
    triggerHaptic(isFlip ? 'heavy' : 'medium');
    
    // Remove swiped state after animation
    setTimeout(() => {
      setSwipedItems(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }, 300);
  }, [scannedItems, playSound]);

  const scanMutation = useMutation({
    mutationFn: async ({ imageBase64, itemId }: { imageBase64: string; itemId: string }) => {
      const res = await apiRequest('POST', '/api/batch/scanAndAnalyze', { 
        imageBase64,
        condition: 'Used' // Yard sale items are always Used by default
      });
      return { ...(await res.json()), localItemId: itemId };
    },
    onSuccess: (data) => {
      const { localItemId, success, analysisResult, candidate, matchStrength, identifySource } = data;
      
      if (success && analysisResult) {
        // Extract pricing data - prefer backend-computed standardized fields
        const priceGuide = analysisResult.priceGuide || {};
        const medianSoldPrice = priceGuide.medianSoldPrice || analysisResult.avgComp || analysisResult.decisionData?.avgComp || 0;
        const maxBuy = priceGuide.maxBuyPrice || analysisResult.maxBuy || analysisResult.decisionData?.maxBuy || 0;
        const soldCompCount = priceGuide.soldCompCount || analysisResult.compCount || analysisResult.decisionData?.compsCount || 0;
        const itemCategory = candidate?.category || analysisResult.category || 'Other';
        const categoryFeeMultiplier = getCategoryFeeMultiplier(itemCategory);
        const netAfterFees = priceGuide.netAfterFees || Math.round(medianSoldPrice * categoryFeeMultiplier * 100) / 100;
        const targetProfit = priceGuide.targetProfit || Math.max(15, Math.round(medianSoldPrice * 0.25 * 100) / 100);
        const shippingAllowance = priceGuide.shippingAllowance || getShippingAllowance(itemCategory);
        // Use backend-provided estimatedGP if available (already correctly calculated)
        const backendEstimatedGP = priceGuide.estimatedGP;
        const priceSource = priceGuide.source || (soldCompCount > 0 ? 'sold_comps' : 'ai_estimate');
        
        // Standardized confidence levels STRICTLY by comp count:
        // High (≥10), Moderate (5-9), Low (1-4), AI Estimate (0)
        let priceConfidence: 'high' | 'moderate' | 'low' | 'ai_estimate';
        if (soldCompCount >= 10) priceConfidence = 'high';
        else if (soldCompCount >= 5) priceConfidence = 'moderate';
        else if (soldCompCount >= 1) priceConfidence = 'low';
        else priceConfidence = 'ai_estimate';
        
        const lowComp = analysisResult.lowComp || analysisResult.decisionData?.lowComp || 0;
        const highComp = analysisResult.highComp || analysisResult.decisionData?.highComp || 0;
        const category = candidate?.category || analysisResult.category || 'Unknown';
        const brand = candidate?.brandMeta?.brandName || candidate?.brandDetected || candidate?.brand || analysisResult.brand || null;
        const needsMoreInfo = candidate?.needsMoreInfo || null;
        const brandDetected = candidate?.brandDetected || null;
        const identifyConfidence = candidate?.confidence || 0;
        const itemMatchStrength = matchStrength || candidate?.matchStrength || null;
        const itemMatchSource = identifySource || candidate?.source || null;
        
        // YARD SALE MODE VERDICT LOGIC:
        // FLIP if maxBuy > 0 (we have a buy price guidance)
        // SKIP only if no pricing data available
        let verdict: 'flip' | 'skip' = maxBuy > 0 ? 'flip' : 'skip';
        
        // Use backend-provided estimatedGP if available (already correctly calculated)
        // Otherwise fall back to client calculation using locked formula:
        // Estimated GP = (Median × feeMultiplier) − Buy Price − Shipping
        // For initial display, assume buy at maxBuy
        const estimatedProfit = backendEstimatedGP !== undefined 
          ? Math.round(backendEstimatedGP)
          : (medianSoldPrice > 0 ? Math.round(netAfterFees - maxBuy - shippingAllowance) : 0);
        
        setScannedItems(prev => prev.map(item => 
          item.id === localItemId ? {
            ...item,
            status: 'complete' as const,
            title: candidate?.title || analysisResult.title || 'Unknown Item',
            category,
            brand,
            verdict,
            maxBuy,
            medianSoldPrice,
            netAfterFees,
            targetProfit,
            shippingAllowance,
            soldCompCount,
            priceConfidence,
            priceSource: priceSource as 'sold_comps' | 'active_listings' | 'ai_estimate',
            lowComp,
            highComp,
            estimatedProfit,
            avgComp: medianSoldPrice,
            itemId: analysisResult.id,
            needsMoreInfo,
            brandDetected,
            identifyConfidence,
            swipeConfirmed: false,
            matchStrength: itemMatchStrength,
            matchSource: itemMatchSource,
          } : item
        ));
        
        // Increment scan count for feedback gate
        incrementScanCount();
        
        playSound(verdict === 'flip');
      } else {
        setScannedItems(prev => prev.map(item => 
          item.id === localItemId ? {
            ...item,
            status: 'error' as const,
            error: data.error || 'Analysis failed'
          } : item
        ));
      }
      
      queryClient.invalidateQueries({ queryKey: ['/api/items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/batch/session'] });
    },
    onError: (err: Error, variables) => {
      setScannedItems(prev => prev.map(item => 
        item.id === variables.itemId ? {
          ...item,
          status: 'error' as const,
          error: err.message
        } : item
      ));
    }
  });

  const handleCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) return;
    
    // Haptic feedback on capture
    triggerHaptic('light');
    
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      const itemId = `ys-${Date.now()}`;
      
      setScannedItems(prev => [{
        id: itemId,
        imageBase64: base64,
        status: 'scanning'
      }, ...prev]);
      
      // Count the capture immediately (not waiting for success)
      setTripStats(prev => ({
        ...prev,
        itemsScanned: prev.itemsScanned + 1
      }));
      
      scanMutation.mutate({ imageBase64: base64, itemId });
      
      if (cameraInputRef.current) {
        cameraInputRef.current.value = '';
      }
    } catch (err) {
      toast({ title: "Failed to capture", variant: "destructive" });
    }
  }, [scanMutation, toast]);

  const startTrip = () => {
    // Initialize audio on user gesture for mobile compatibility
    initAudio();
    setIsActive(true);
    setScannedItems([]);
    setTripStats({
      itemsScanned: 0,
      flips: 0,
      skips: 0,
      totalPotentialProfit: 0,
      aiEstimatedItems: 0,
      categoryBreakdown: {}
    });
    setShowSummary(false);
  };

  const scanningCount = scannedItems.filter(i => i.status === 'scanning').length;
  const confirmedSwipes = scannedItems.filter(i => i.swipeConfirmed).length;
  const sessionLimitReached = confirmedSwipes >= SESSION_LIMIT;
  
  // Auto-show summary and start new batch when session limit reached
  useEffect(() => {
    if (confirmedSwipes === SESSION_LIMIT && !showSummary && isActive) {
      // Show summary automatically at 20 swipes
      setIsActive(false);
      setShowSummary(true);
      
      // Mark Yard Sale session complete for feedback gate
      markYardSaleComplete();
      
      // Auto-start a new backend batch session so user can continue after recap
      (async () => {
        try {
          await apiRequest('POST', '/api/batch/session', {});
          queryClient.invalidateQueries({ queryKey: ['/api/batch/session'] });
        } catch (err) {
          console.error('Failed to start new batch session:', err);
        }
      })();
      
      toast({
        title: "Session complete!",
        description: "20 items scanned. Review your finds below.",
      });
    }
  }, [confirmedSwipes, showSummary, isActive]);

  const endTrip = () => {
    // Block trip end if scans are still pending
    if (scanningCount > 0) {
      toast({ 
        title: `${scanningCount} item${scanningCount > 1 ? 's' : ''} still analyzing`,
        description: "Please wait for analysis to complete",
        variant: "destructive"
      });
      return; // Don't end trip yet
    }
    setIsActive(false);
    setShowSummary(true);
  };

  const resetTrip = async () => {
    setShowSummary(false);
    setScannedItems([]);
    setTripStats({
      itemsScanned: 0,
      flips: 0,
      skips: 0,
      totalPotentialProfit: 0,
      aiEstimatedItems: 0,
      categoryBreakdown: {}
    });
    
    // Start a new backend batch session (this also ends any existing one)
    try {
      await apiRequest('POST', '/api/batch/session', {});
      queryClient.invalidateQueries({ queryKey: ['/api/batch/session'] });
    } catch (err) {
      console.error('Failed to reset batch session:', err);
    }
  };

  if (!isPro) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="p-4 pt-8">
          <Card className="p-6 text-center">
            <ShoppingBag className="w-12 h-12 mx-auto mb-4 text-primary" />
            <h2 className="text-xl font-bold mb-2">Yard Sale Mode is Pro Only</h2>
            <p className="text-muted-foreground mb-4">
              Upgrade to Pro for rapid-fire scanning at yard sales and thrift stores.
            </p>
            <Button onClick={() => setLocation('/settings')} data-testid="button-upgrade-pro">
              Upgrade to Pro - $24.99/mo
            </Button>
          </Card>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (showSummary) {
    const hitRate = tripStats.itemsScanned > 0 
      ? Math.round((tripStats.flips / tripStats.itemsScanned) * 100) 
      : 0;
    
    const flipItems = scannedItems.filter(i => i.verdict === 'flip' && i.swipeConfirmed);
    const aiEstimatedItems = scannedItems.filter(i => i.priceConfidence === 'ai_estimate' && i.swipeConfirmed);
    
    // Calculate average margin
    const margins = flipItems
      .filter(i => i.medianSoldPrice && i.medianSoldPrice > 0 && i.estimatedProfit)
      .map(i => (i.estimatedProfit! / i.medianSoldPrice!) * 100);
    const avgMargin = margins.length > 0 
      ? Math.round(margins.reduce((a, b) => a + b, 0) / margins.length) 
      : 0;
    
    // Calculate category breakdown
    const categoryBreakdown: Record<string, { count: number; profit: number }> = {};
    flipItems.forEach(item => {
      const cat = item.category || 'Unknown';
      if (!categoryBreakdown[cat]) {
        categoryBreakdown[cat] = { count: 0, profit: 0 };
      }
      categoryBreakdown[cat].count++;
      categoryBreakdown[cat].profit += item.estimatedProfit || 0;
    });
    
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="bg-gradient-to-b from-green-500/20 to-background p-4 pt-8">
          <div className="flex items-center gap-3 mb-6">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={resetTrip}
              data-testid="button-back-from-summary"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-2xl font-bold">Trip Summary</h1>
          </div>
          
          <div className="grid grid-cols-2 gap-3 mb-6">
            <Card className="p-4 text-center bg-green-500/10 border-green-500/30">
              <TrendingUp className="w-6 h-6 mx-auto mb-2 text-green-500" />
              <p className="text-2xl font-bold text-green-500">
                ${tripStats.totalPotentialProfit.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Potential Profit</p>
            </Card>
            <Card className="p-4 text-center bg-yard-sale/10 border-yard-sale/30">
              <Target className="w-6 h-6 mx-auto mb-2 text-yard-sale" />
              <p className="text-2xl font-bold text-yard-sale">{hitRate}%</p>
              <p className="text-xs text-muted-foreground">Hit Rate</p>
            </Card>
          </div>
          
          <div className="flex justify-around text-center mb-6">
            <div>
              <p className="text-xl font-bold">{tripStats.itemsScanned}</p>
              <p className="text-xs text-muted-foreground">Scanned</p>
            </div>
            <div>
              <p className="text-xl font-bold text-green-500">{tripStats.flips}</p>
              <p className="text-xs text-muted-foreground">Flips</p>
            </div>
            <div>
              <p className="text-xl font-bold text-red-500">{tripStats.skips}</p>
              <p className="text-xs text-muted-foreground">Skips</p>
            </div>
            <div>
              <p className="text-xl font-bold text-primary">{avgMargin}%</p>
              <p className="text-xs text-muted-foreground">Avg Margin</p>
            </div>
          </div>
          
          {/* Category Breakdown */}
          {Object.keys(categoryBreakdown).length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-muted-foreground mb-2">By Category</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(categoryBreakdown)
                  .sort((a, b) => b[1].profit - a[1].profit)
                  .map(([cat, data]) => (
                    <Badge key={cat} variant="secondary" className="text-xs">
                      {cat}: {data.count} (+${data.profit})
                    </Badge>
                  ))
                }
              </div>
            </div>
          )}
          
          {/* AI Estimated Warning */}
          {aiEstimatedItems.length > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-2 text-yellow-500">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {aiEstimatedItems.length} item{aiEstimatedItems.length > 1 ? 's' : ''} with AI estimates
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                These items lack sold comp data. Verify prices before purchasing.
              </p>
            </div>
          )}
        </div>
        
        <div className="p-4">
          <h2 className="font-bold mb-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            Items to Flip ({flipItems.length})
          </h2>
          
          {flipItems.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground">
              No flip-worthy items found this trip
            </Card>
          ) : (
            <div className="space-y-2">
              {flipItems.map(item => (
                <Card 
                  key={item.id} 
                  className="p-3 flex items-center gap-3 cursor-pointer hover-elevate"
                  onClick={() => item.itemId && setLocation(`/item/${item.itemId}`)}
                  data-testid={`card-flip-item-${item.id}`}
                >
                  <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                    <img src={item.imageBase64} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{item.title}</p>
                      <ConfidenceBadge confidence={item.priceConfidence} source={item.priceSource} />
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-green-500 font-bold">
                        Pay up to ${item.maxBuy?.toLocaleString()}
                      </span>
                      <span className="text-muted-foreground">•</span>
                      <span className="text-muted-foreground">
                        Sells ~${Math.round(item.medianSoldPrice || item.avgComp || 0)}
                      </span>
                      {item.estimatedProfit && item.estimatedProfit > 0 && (
                        <span className="text-green-500 ml-auto">
                          +${item.estimatedProfit}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </Card>
              ))}
            </div>
          )}
          
          {/* Share Haul Button */}
          {flipItems.length > 0 && (
            <Button 
              variant="outline" 
              className="w-full mb-4"
              onClick={() => {
                const summary = `YARD SALE HAUL\n\n` +
                  `${tripStats.itemsScanned} items scanned\n` +
                  `${tripStats.flips} flips found\n` +
                  `$${tripStats.totalPotentialProfit} potential profit\n\n` +
                  `Top finds:\n` +
                  flipItems.slice(0, 3).map(i => `- ${i.title} (+$${i.estimatedProfit})`).join('\n');
                
                if (navigator.share) {
                  navigator.share({
                    title: 'My Yard Sale Haul',
                    text: summary
                  }).catch(() => {});
                } else {
                  navigator.clipboard.writeText(summary);
                  toast({ title: "Copied to clipboard!" });
                }
              }}
              data-testid="button-share-haul"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share Haul
            </Button>
          )}
          
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={resetTrip}
              data-testid="button-new-trip"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              New Trip
            </Button>
            <Button 
              className="flex-1"
              onClick={() => setLocation('/inventory')}
              data-testid="button-view-inventory"
            >
              View Inventory
            </Button>
          </div>
        </div>
        
        <BottomNav />
      </div>
    );
  }

  if (!isActive) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="p-4 pt-8">
          <div className="flex items-center gap-3 mb-6">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setLocation('/scan')}
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-2xl font-bold">Yard Sale Mode</h1>
          </div>
          
          <Card className="p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-yard-sale/20 flex items-center justify-center">
                <Zap className="w-6 h-6 text-yard-sale" />
              </div>
              <div>
                <h2 className="font-bold">Rapid-Fire Scanning</h2>
                <p className="text-sm text-muted-foreground">
                  Snap photos quickly, get instant verdicts
                </p>
              </div>
            </div>
            
            <div className="space-y-3 text-sm text-muted-foreground mb-6">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-yard-sale" />
                <span>See category, brand, and resale range</span>
              </div>
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-yard-sale" />
                <span>Get the MAX price to pay</span>
              </div>
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-yard-sale" />
                <span>Audio feedback - hear FLIP or SKIP</span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-yard-sale" />
                <span>Running tally of potential profit</span>
              </div>
            </div>
            
            <Button 
              size="lg" 
              className="w-full bg-yard-sale hover:bg-yard-sale/90 text-yard-sale-dark"
              onClick={startTrip}
              data-testid="button-start-trip"
            >
              <ShoppingBag className="w-5 h-5 mr-2" />
              Start Sourcing Trip
            </Button>
          </Card>
        </div>
        
        <BottomNav />
      </div>
    );
  }

  // scanningCount is already defined above in the component scope

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="bg-card border-b p-3">
        {/* Running GP Total - prominent at top */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span className="text-xs text-muted-foreground">Est. Profit</span>
          </div>
          <motion.div 
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            key={runningTotal}
            className="text-xl font-bold text-green-500"
          >
            +${runningTotal.toLocaleString()}
          </motion.div>
        </div>
        
        {/* Session progress bar */}
        <div className="mb-2">
          <Progress 
            value={(confirmedSwipes / SESSION_LIMIT) * 100} 
            className="h-1.5"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
            <span>{confirmedSwipes}/{SESSION_LIMIT} swipes</span>
            {sessionLimitReached && (
              <span className="text-yellow-500">Session complete</span>
            )}
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={endTrip}
              data-testid="button-end-trip"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <p className="font-bold text-sm">Yard Sale Mode</p>
              <p className="text-xs text-muted-foreground">
                {tripStats.flips} flips • {tripStats.skips} skips
              </p>
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setAudioEnabled(!audioEnabled)}
            data-testid="button-toggle-audio"
          >
            {audioEnabled ? (
              <Volume2 className="w-5 h-5" />
            ) : (
              <VolumeX className="w-5 h-5 text-muted-foreground" />
            )}
          </Button>
        </div>
      </div>
      
      {scanningCount > 0 && (
        <div className="bg-primary/10 px-4 py-2 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span className="text-sm">Analyzing {scanningCount} item{scanningCount > 1 ? 's' : ''}...</span>
        </div>
      )}
      
      <div className="flex-1 overflow-auto p-4 pb-32">
        <AnimatePresence>
          {scannedItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Camera className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Tap the camera button to start scanning</p>
              <p className="text-sm mt-1">Snap photos of items as you browse</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Swipe hint */}
              {scannedItems.length > 0 && scannedItems.some(i => !i.swipeConfirmed && i.status === 'complete') && (
                <div className="text-center text-xs text-muted-foreground pb-1 flex items-center justify-center gap-2">
                  <span className="text-red-400">← SKIP</span>
                  <span>swipe</span>
                  <span className="text-green-400">FLIP →</span>
                </div>
              )}
              {scannedItems.filter(item => !item.dismissed).map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.9, y: -20 }}
                  animate={swipedItems.has(item.id) 
                    ? { opacity: 0, scale: 0.9, x: item.verdict === 'flip' ? 300 : -300 }
                    : { opacity: 1, scale: 1, y: 0 }
                  }
                  transition={{ duration: 0.2 }}
                  drag={item.status === 'complete' && !item.swipeConfirmed ? "x" : false}
                  dragSnapToOrigin={true}
                  dragElastic={0.5}
                  whileDrag={{ scale: 1.02, zIndex: 50 }}
                  onDragEnd={(event, info: PanInfo) => {
                    const swipeThreshold = 80;
                    if (info.offset.x > swipeThreshold) {
                      handleSwipe(item.id, 'right');
                    } else if (info.offset.x < -swipeThreshold) {
                      handleSwipe(item.id, 'left');
                    }
                  }}
                  style={{ 
                    touchAction: item.status === 'complete' && !item.swipeConfirmed ? 'pan-y' : 'auto'
                  }}
                  className="relative"
                >
                  {/* Swipe indicators */}
                  {item.status === 'complete' && !item.swipeConfirmed && (
                    <>
                      <div className="absolute left-0 top-0 bottom-0 -ml-12 flex items-center justify-center w-12 text-red-500 font-bold text-xs opacity-50">
                        SKIP
                      </div>
                      <div className="absolute right-0 top-0 bottom-0 -mr-12 flex items-center justify-center w-12 text-green-500 font-bold text-xs opacity-50">
                        FLIP
                      </div>
                    </>
                  )}
                  <Card 
                    className={`p-3 ${
                      item.verdict === 'flip' 
                        ? 'bg-green-500/10 border-green-500/30' 
                        : item.verdict === 'skip'
                        ? 'bg-red-500/10 border-red-500/30'
                        : ''
                    } ${item.itemId ? 'cursor-pointer hover-elevate' : ''}`}
                    onClick={() => item.itemId && !swipedItems.has(item.id) && setLocation(`/item/${item.itemId}`)}
                    data-testid={`card-scanned-item-${index}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 relative">
                        <img 
                          src={item.imageBase64} 
                          alt="" 
                          className="w-full h-full object-cover"
                        />
                        {item.status === 'scanning' && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-white" />
                          </div>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        {item.status === 'scanning' ? (
                          <p className="text-sm text-muted-foreground">Analyzing...</p>
                        ) : item.status === 'error' ? (
                          <div className="flex items-center gap-2">
                            <p className="text-sm text-destructive flex-1">{item.error}</p>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Re-scan the item
                                setScannedItems(prev => prev.map(i => 
                                  i.id === item.id ? { ...i, status: 'scanning' as const, error: undefined } : i
                                ));
                                scanMutation.mutate({ imageBase64: item.imageBase64, itemId: item.id });
                              }}
                              data-testid={`button-rescan-${item.id}`}
                            >
                              <RefreshCw className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            {/* Title with brand - compact */}
                            <div className="flex items-center gap-2 mb-1">
                              {item.brand && (
                                <span className="text-xs font-medium text-primary">
                                  {item.brand}
                                </span>
                              )}
                              <p className="font-medium text-sm truncate flex-1">
                                {item.title}
                              </p>
                              {/* Low confidence indicator - tap to verify */}
                              {(item.matchStrength === 'weak' || item.matchStrength === 'none') && !item.swipeConfirmed && (
                                <Badge variant="outline" className="text-yellow-500 border-yellow-500/50 text-[10px] px-1.5 flex items-center gap-0.5">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  {item.matchStrength === 'none' ? 'AI' : 'low'}
                                </Badge>
                              )}
                              {item.priceConfidence === 'low' && item.matchStrength !== 'weak' && item.matchStrength !== 'none' && !item.swipeConfirmed && (
                                <Badge variant="outline" className="text-yellow-500 border-yellow-500/50 text-[10px] px-1.5">
                                  verify
                                </Badge>
                              )}
                            </div>
                            
                            {/* MAX BUY - Dominant tappable area */}
                            <div className="flex items-center justify-between">
                              {/* Show confirmed verdict if user has swiped/confirmed */}
                              {item.swipeConfirmed ? (
                                <motion.div 
                                  initial={{ scale: 0.8, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  className="flex items-center gap-3"
                                >
                                  <Badge 
                                    variant={item.verdict === 'flip' ? 'default' : 'destructive'} 
                                    className={`text-base px-3 py-1 ${item.verdict === 'flip' ? 'bg-green-500' : ''}`}
                                  >
                                    {item.verdict === 'flip' ? (
                                      <><CheckCircle className="w-4 h-4 mr-1.5" /> FLIP</>
                                    ) : (
                                      <><XCircle className="w-4 h-4 mr-1.5" /> SKIP</>
                                    )}
                                  </Badge>
                                  {item.verdict === 'flip' && item.estimatedProfit && item.estimatedProfit > 0 && (
                                    <motion.span 
                                      initial={{ x: -10, opacity: 0 }}
                                      animate={{ x: 0, opacity: 1 }}
                                      transition={{ delay: 0.1 }}
                                      className="text-lg text-green-500 font-bold"
                                    >
                                      +${item.estimatedProfit}
                                    </motion.span>
                                  )}
                                </motion.div>
                              ) : pricingItemId !== item.id ? (
                                /* Standardized pricing display: Pay up to $X, Sells around $Y (HIGH) or Typical resale: $A–$B (MOD/LOW) */
                                <div 
                                  className={`flex-1 cursor-pointer rounded-md p-1 -m-1 transition-colors ${
                                    item.verdict === 'flip' ? 'hover:bg-green-500/10' : 'hover:bg-muted/50'
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPricingItemId(item.id);
                                    setEnteredPrice('');
                                  }}
                                  data-testid={`area-enter-price-${item.id}`}
                                >
                                  {/* Primary: Pay up to $X */}
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Pay up to</span>
                                    <span className={`text-2xl font-bold ${
                                      item.verdict === 'flip' ? 'text-green-500' : 'text-muted-foreground'
                                    }`}>
                                      ${item.maxBuy?.toLocaleString() || '0'}
                                    </span>
                                    <ConfidenceBadge confidence={item.priceConfidence} source={item.priceSource} />
                                  </div>
                                  {/* Secondary: Confidence-based resale display */}
                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    {item.priceConfidence === 'high' ? (
                                      /* HIGH confidence: "Sells around $Y" single number */
                                      item.expectedResale || item.medianSoldPrice ? (
                                        <span className="text-xs text-muted-foreground">
                                          Sells around ${Math.round(item.expectedResale || item.medianSoldPrice || 0)}
                                        </span>
                                      ) : null
                                    ) : item.priceConfidence === 'moderate' || item.priceConfidence === 'low' ? (
                                      /* MOD/LOW confidence: "Typical resale: $A–$B" range */
                                      item.resaleRange ? (
                                        <span className="text-xs text-muted-foreground">
                                          Typical resale: ${item.resaleRange.low}–${item.resaleRange.high}
                                        </span>
                                      ) : item.lowComp && item.highComp ? (
                                        <span className="text-xs text-muted-foreground">
                                          Typical resale: ${item.lowComp}–${item.highComp}
                                        </span>
                                      ) : item.medianSoldPrice ? (
                                        <span className="text-xs text-muted-foreground">
                                          Estimated resale: ~${Math.round(item.medianSoldPrice)}
                                        </span>
                                      ) : null
                                    ) : item.priceConfidence === 'ai_estimate' ? (
                                      <span className="text-xs text-yellow-500">
                                        {item.medianSoldPrice ? `Estimate: ~$${Math.round(item.medianSoldPrice)}` : 'AI estimate only'}
                                      </span>
                                    ) : item.medianSoldPrice ? (
                                      <span className="text-xs text-muted-foreground">
                                        Sells around ${Math.round(item.medianSoldPrice)}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-yellow-500">No pricing data</span>
                                    )}
                                    {item.soldCompCount !== undefined && item.soldCompCount > 0 && (
                                      <span className="text-xs text-muted-foreground">
                                        ({item.soldCompCount} comps)
                                      </span>
                                    )}
                                  </div>
                                  {/* Microcopy for inconsistent comps */}
                                  {item.inconsistentComps && (item.priceConfidence === 'moderate' || item.priceConfidence === 'low') && (
                                    <div className="text-[10px] text-yellow-600 mt-0.5">
                                      Wide range due to inconsistent comps
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="flex-1" />
                              )}
                              
                              {/* Share button - always visible when not in price entry */}
                              {pricingItemId !== item.id && (
                                <ShareButton
                                  title={item.title || "Unknown Item"}
                                  verdict={item.verdict || 'skip'}
                                  profit={item.estimatedProfit}
                                  category={item.category}
                                  size="icon"
                                  className="flex-shrink-0"
                                />
                              )}
                            </div>
                            
                            {/* Inline price entry - only show if not already confirmed */}
                            {pricingItemId === item.id && !item.swipeConfirmed && (
                              <div className="mt-2 space-y-2">
                                {/* Live profit preview while typing - uses maxBuy as the decision point */}
                                {enteredPrice && !isNaN(parseFloat(enteredPrice)) && item.maxBuy && item.maxBuy > 0 && (
                                  <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                                    {(() => {
                                      const askPrice = parseFloat(enteredPrice);
                                      const maxBuy = item.maxBuy;
                                      const isGoodDeal = askPrice <= maxBuy;
                                      // Profit = what you keep if you buy at askPrice
                                      // Using maxBuy difference as a simple proxy for profit guidance
                                      const margin = maxBuy - askPrice;
                                      return (
                                        <>
                                          <span className={`text-sm font-bold ${isGoodDeal ? 'text-green-500' : 'text-red-500'}`}>
                                            {isGoodDeal ? 'FLIP IT' : 'SKIP IT'}
                                          </span>
                                          <span className={`text-sm font-medium ${isGoodDeal ? 'text-green-500' : 'text-red-500'}`}>
                                            {isGoodDeal 
                                              ? `$${Math.round(margin)} under max` 
                                              : `$${Math.abs(Math.round(margin))} over max`}
                                          </span>
                                        </>
                                      );
                                    })()}
                                  </div>
                                )}
                                <div className="flex items-center gap-2">
                                  <div className="relative flex-1">
                                    <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                      type="number"
                                      inputMode="decimal"
                                      placeholder="Asking price"
                                      value={enteredPrice}
                                      onChange={(e) => setEnteredPrice(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          const price = parseFloat(enteredPrice);
                                          if (!isNaN(price) && price >= 0) {
                                            handleConfirmPrice(item.id, price);
                                          }
                                        }
                                      }}
                                      className="pl-7"
                                      autoFocus
                                      onClick={(e) => e.stopPropagation()}
                                      data-testid={`input-asking-price-${item.id}`}
                                    />
                                  </div>
                                  <Button
                                    size="icon"
                                    className="bg-green-500"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const price = parseFloat(enteredPrice);
                                      if (!isNaN(price) && price >= 0) {
                                        handleConfirmPrice(item.id, price);
                                      }
                                    }}
                                    disabled={!enteredPrice || isNaN(parseFloat(enteredPrice))}
                                    data-testid={`button-confirm-price-${item.id}`}
                                  >
                                    <Check className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPricingItemId(null);
                                      setEnteredPrice('');
                                    }}
                                    data-testid={`button-cancel-price-${item.id}`}
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>
      
      <div className="fixed bottom-20 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent">
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleCapture}
          className="hidden"
          data-testid="input-camera"
        />
        
        <Button
          size="lg"
          className="w-full h-16 text-lg bg-yard-sale hover:bg-yard-sale/90 text-yard-sale-dark"
          onClick={() => cameraInputRef.current?.click()}
          disabled={scanMutation.isPending && scanningCount >= 3}
          data-testid="button-capture"
        >
          <Camera className="w-6 h-6 mr-3" />
          Scan Item
        </Button>
      </div>
      
      {/* BottomNav hidden during active scanning to avoid overlap with capture button */}
    </div>
  );
}
