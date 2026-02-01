import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Layers, Play, CheckCircle, XCircle, Clock, 
  Loader2, ArrowLeft, Sparkles, Camera, Upload,
  ThumbsUp, ThumbsDown, Trash2, Image, X, DollarSign,
  AlertTriangle, RefreshCw
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { MarginLogoFull, MarginLogoMark } from "@/components/MarginLogo";
import { JudgmentOverlay } from "@/components/JudgmentAnimation";
import type { BatchSession, BatchItem } from "@shared/schema";
import { getShippingAllowance, getCategoryFeeRate } from "@shared/pricingEngine";

interface BatchSessionResponse {
  session: BatchSession;
  items: BatchItem[];
}

// Profit percent slider snap points (percentage of expected sale price)
const PROFIT_PERCENT_SNAP_POINTS = [15, 20, 25, 30, 35, 40, 45, 50];

// Snap to nearest profit percent point
function snapToProfitPercent(value: number): number {
  return PROFIT_PERCENT_SNAP_POINTS.reduce((prev, curr) => 
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  );
}

// Category-based max buy price ceilings - 6 core categories
// Brand-specific caps still useful for luxury items
const CATEGORY_PRICE_CAPS: Record<string, number> = {
  // 6 Core Categories
  'Shoes': 350,
  'Watches': 2000,
  'Trading Cards': 500,
  'Collectibles': 300,
  'Electronics': 300,
  'Other': 500,
  // Luxury watch brand overrides
  'Rolex': 15000,
  'Omega': 8000,
  'Breitling': 6000,
  'Tag Heuer': 4000,
  // Default
  'default': 500
};

function applyCategoryCap(price: number, title: string | null, category?: string): number {
  const searchText = `${title || ''} ${category || ''}`.toLowerCase();
  
  // Luxury watch brands first (allow high prices)
  if (searchText.includes('rolex')) return Math.min(price, CATEGORY_PRICE_CAPS['Rolex']);
  if (searchText.includes('omega')) return Math.min(price, CATEGORY_PRICE_CAPS['Omega']);
  if (searchText.includes('breitling')) return Math.min(price, CATEGORY_PRICE_CAPS['Breitling']);
  if (searchText.includes('tag heuer')) return Math.min(price, CATEGORY_PRICE_CAPS['Tag Heuer']);
  
  // 6 Core Categories
  if (category) {
    const cap = CATEGORY_PRICE_CAPS[category];
    if (cap) return Math.min(price, cap);
  }
  
  // Fallback keyword detection
  if (searchText.includes('watch')) return Math.min(price, CATEGORY_PRICE_CAPS['Watches']);
  if (searchText.includes('card') || searchText.includes('pokemon')) return Math.min(price, CATEGORY_PRICE_CAPS['Trading Cards']);
  if (searchText.includes('shoe') || searchText.includes('sneaker')) return Math.min(price, CATEGORY_PRICE_CAPS['Shoes']);
  if (searchText.includes('phone') || searchText.includes('laptop') || searchText.includes('tablet')) return Math.min(price, CATEGORY_PRICE_CAPS['Electronics']);
  if (searchText.includes('funko') || searchText.includes('lego') || searchText.includes('figure')) return Math.min(price, CATEGORY_PRICE_CAPS['Collectibles']);
  
  return Math.min(price, CATEGORY_PRICE_CAPS['default']);
}

interface ProcessResult {
  complete: boolean;
  item?: BatchItem;
  session?: BatchSession;
  analysisResult?: any;
  error?: string;
}

export default function BatchScanPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  
  // Cost input modal state
  const [showCostModal, setShowCostModal] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [buyPrice, setBuyPrice] = useState("");
  const [suggestedMaxPrice, setSuggestedMaxPrice] = useState<number | null>(null);
  const [identifiedTitle, setIdentifiedTitle] = useState<string | null>(null);
  const [identifiedCategory, setIdentifiedCategory] = useState<string | null>(null);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [priceGuideDebug, setPriceGuideDebug] = useState<any>(null);
  const [profitPercent, setProfitPercent] = useState(25); // Default 25% profit
  const [priceGuideSource, setPriceGuideSource] = useState<'sold_comps' | 'estimate' | null>(null);
  const [baseSellPrice, setBaseSellPrice] = useState<number | null>(null); // For real-time slider updates
  
  // Weak-confidence match state
  const [matchStrength, setMatchStrength] = useState<'strong' | 'moderate' | 'weak' | 'none' | null>(null);
  const [matchSource, setMatchSource] = useState<'library' | 'openai' | 'fallback' | 'verified' | 'openai_override' | null>(null);
  const [topAlternatives, setTopAlternatives] = useState<Array<{ name: string; score: number }>>([]);
  
  // Condition and comp thumbnail state
  const [itemCondition, setItemCondition] = useState<'used' | 'new'>('used');
  const [compThumbnail, setCompThumbnail] = useState<string | null>(null);
  const [isRefetchingPrice, setIsRefetchingPrice] = useState(false);
  
  // Judgment animation state (batch mode - auto-advances)
  const [showJudgment, setShowJudgment] = useState(false);
  const [judgmentResult, setJudgmentResult] = useState<{
    decision: 'flip' | 'skip' | 'risky';
    reason?: string;
    maxBuy?: number;
    confidence?: 'strong' | 'moderate' | 'weak';
  } | null>(null);
  const [decisionsCount, setDecisionsCount] = useState(0);
  
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const isPro = user?.subscriptionTier === 'pro' || user?.isAdmin;
  
  // Fetch user's category profit settings for auto-apply
  const { data: categoryProfitData } = useQuery<{ categoryProfitPercents: Record<string, number> }>({
    queryKey: ['/api/user/category-profits'],
    enabled: isPro,
  });
  
  // Default category profit percentages (same as backend)
  const DEFAULT_CATEGORY_PROFITS: Record<string, number> = {
    'Watches': 30, 'Trading Cards': 25, 'Shoes': 25,
    'Collectibles': 25, 'Electronics': 20, 'Other': 25
  };
  
  // Get profit % for a category from user settings or defaults
  const getCategoryProfitPercent = (category: string): number => {
    const settings = categoryProfitData?.categoryProfitPercents || DEFAULT_CATEGORY_PROFITS;
    return settings[category] || settings['Other'] || 25;
  };

  // Real-time slider update effect - compute maxBuy from sellPrice and profitPercent
  useEffect(() => {
    if (baseSellPrice !== null && identifiedTitle && identifiedCategory) {
      const feeRate = getCategoryFeeRate(identifiedCategory);
      const shippingCost = getShippingAllowance(identifiedCategory);
      const fixedCosts = 2;
      
      // Formula: profitGoal = sellPrice * profitPercent, maxBuy = floor(sellPrice - fees - shipping - fixedCosts - profitGoal)
      const profitGoal = baseSellPrice * (profitPercent / 100);
      const fees = baseSellPrice * feeRate;
      let maxBuyPrice = Math.floor(baseSellPrice - fees - shippingCost - fixedCosts - profitGoal);
      if (maxBuyPrice < 0) maxBuyPrice = 0;
      
      // Guard: maxBuy must be < sellPrice
      if (maxBuyPrice >= baseSellPrice) maxBuyPrice = Math.floor(baseSellPrice * 0.5);
      
      maxBuyPrice = applyCategoryCap(maxBuyPrice, identifiedTitle, identifiedCategory);
      setSuggestedMaxPrice(Math.round(maxBuyPrice));
    }
  }, [profitPercent, baseSellPrice, identifiedTitle, identifiedCategory]);

  // Fetch batch session - this is the single source of truth
  const { data: batchData, isLoading, refetch } = useQuery<BatchSessionResponse>({
    queryKey: ['/api/batch/session'],
    enabled: isPro,
  });
  
  // Fetch user's items to check which have been user-decided (FLIP IT/SKIP IT)
  const { data: userItems } = useQuery<Array<{ id: number; userDecision: string | null }>>({
    queryKey: ['/api/items'],
    enabled: isPro,
  });

  // Add photo mutation (for gallery bulk upload - just adds to queue)
  const addPhotoMutation = useMutation({
    mutationFn: async (imageBase64: string) => {
      const res = await apiRequest('POST', '/api/batch/items', { inputType: 'photo', inputValue: imageBase64 });
      return res.json();
    },
    onSuccess: () => {
      refetch();
    },
    onError: (err: any) => {
      toast({ title: err.message || "Failed to add photo", variant: "destructive" });
    }
  });

  // Instant scan+analyze mutation - for camera capture, analyzes immediately
  const scanAndAnalyzeMutation = useMutation({
    mutationFn: async ({ imageBase64, buyPrice, maxBuyPrice, appliedProfitPercent, priceGuideSource }: { 
      imageBase64: string; 
      buyPrice?: number;
      maxBuyPrice?: number;
      appliedProfitPercent?: number;
      priceGuideSource?: 'sold_comps' | 'estimate';
    }) => {
      const res = await apiRequest('POST', '/api/batch/scanAndAnalyze', { imageBase64, buyPrice, maxBuyPrice, appliedProfitPercent, priceGuideSource });
      return res.json();
    },
    onSuccess: (data) => {
      refetch();
      if (data.success && data.analysisResult) {
        const verdict = data.analysisResult.decisionVerdict;
        const margin = data.analysisResult.decisionData?.marginPercent ?? data.analysisResult.marginPercent;
        const maxBuy = data.analysisResult.decisionData?.maxBuy ?? data.analysisResult.maxBuy;
        
        // Show judgment animation
        setJudgmentResult({
          decision: verdict === 'flip' ? 'flip' : 'skip',
          reason: data.candidate?.title || (verdict === 'flip' ? 'Profitable item' : 'Not profitable'),
          maxBuy: maxBuy,
          confidence: data.analysisResult.compCount >= 5 ? 'strong' : 
                      data.analysisResult.compCount >= 3 ? 'moderate' : 'weak',
        });
        setShowJudgment(true);
        setDecisionsCount(prev => prev + 1);
      } else if (data.error) {
        toast({ title: "Analysis failed", description: data.error, variant: "destructive" });
      }
    },
    onError: (err: any) => {
      refetch();
      toast({ title: err.message || "Failed to analyze", variant: "destructive" });
    }
  });

  // Process mutation
  const processMutation = useMutation({
    mutationFn: async (): Promise<ProcessResult> => {
      const res = await apiRequest('POST', '/api/batch/process');
      return res.json();
    },
    onSuccess: (data) => {
      refetch();
      if (data.complete) {
        setIsProcessing(false);
        toast({ title: "Batch complete!", description: "All items have been processed." });
      }
    },
    onError: (err: any) => {
      setIsProcessing(false);
      toast({ title: err.message || "Processing failed", variant: "destructive" });
    }
  });

  // Action mutation for accept/skip
  const actionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: 'accepted' | 'skipped' }) => {
      const res = await apiRequest('PATCH', `/api/batch/items/${id}`, { action });
      return res.json();
    },
    onSuccess: () => {
      refetch();
    }
  });

  // Dismiss/delete item mutation
  const dismissMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/batch/items/${id}`);
      return res.json();
    },
    onSuccess: () => {
      refetch();
    }
  });

  // New session mutation
  const newSessionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/batch/session');
      return res.json();
    },
    onSuccess: () => {
      refetch();
      toast({ title: "New batch session started" });
    }
  });

  // Capture handler - identifies item first, then shows price range modal
  const handleCameraCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) return;

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      // Store image and start identifying
      setPendingImage(base64);
      setBuyPrice("");
      setSuggestedMaxPrice(null);
      setIdentifiedTitle(null);
      setIdentifiedCategory(null);
      setPriceGuideDebug(null);
      setMatchStrength(null);
      setMatchSource(null);
      setTopAlternatives([]);
      setIsIdentifying(true);
      setShowCostModal(true);
      
      // Identify the item first to get estimated value
      try {
        const identifyRes = await apiRequest('POST', '/api/scan-sessions/identify', { imageBase64: base64 });
        const identifyData = await identifyRes.json();
        
        // Capture match confidence from visual library
        if (identifyData.matchStrength) {
          setMatchStrength(identifyData.matchStrength);
        }
        if (identifyData.identifySource) {
          setMatchSource(identifyData.identifySource);
        }
        if (identifyData.alternatives && Array.isArray(identifyData.alternatives)) {
          setTopAlternatives(identifyData.alternatives);
        }
        // Capture comp thumbnail for verification
        if (identifyData.compThumbnail) {
          setCompThumbnail(identifyData.compThumbnail);
        }
        
        if (identifyData.candidates && identifyData.candidates.length > 0) {
          const bestCandidate = identifyData.candidates[0];
          const title = bestCandidate.title || bestCandidate.category || 'Item';
          const category = bestCandidate.category || '';
          setIdentifiedTitle(title);
          setIdentifiedCategory(category);
          
          // Capture comp thumbnail from candidate if available
          if (bestCandidate.compThumbnail) {
            setCompThumbnail(bestCandidate.compThumbnail);
          }
          
          // Auto-apply category profit % from user settings
          const categoryProfit = getCategoryProfitPercent(category);
          setProfitPercent(categoryProfit);
          
          // Fetch price guide from backend using sold comps
          // Default to 'used' condition for yard sale sourcing
          try {
            const priceGuideRes = await apiRequest('POST', '/api/price-guide', { title, category, condition: itemCondition });
            const priceGuideData = await priceGuideRes.json();
            
            console.log('[PRICE GUIDE] Response:', priceGuideData);
            
            if (priceGuideData.priceGuide && priceGuideData.debug?.expectedSalePrice) {
              // Use backend's expectedSalePrice and compute maxBuy locally with profitPercent
              const expectedSalePrice = priceGuideData.debug.expectedSalePrice;
              setBaseSellPrice(expectedSalePrice); // Store for slider real-time updates
              
              const feeRate = getCategoryFeeRate(category);
              const shippingCost = getShippingAllowance(category);
              const fixedCosts = 2;
              
              const profitGoal = expectedSalePrice * (profitPercent / 100);
              const fees = expectedSalePrice * feeRate;
              let maxBuyPrice = Math.floor(expectedSalePrice - fees - shippingCost - fixedCosts - profitGoal);
              if (maxBuyPrice < 0) maxBuyPrice = 0;
              
              // Guard: maxBuy must be < sellPrice
              if (maxBuyPrice >= expectedSalePrice) maxBuyPrice = Math.floor(expectedSalePrice * 0.5);
              
              maxBuyPrice = applyCategoryCap(maxBuyPrice, title, category);
              setSuggestedMaxPrice(Math.round(maxBuyPrice));
              setPriceGuideSource('sold_comps'); // Real eBay sold data
              setPriceGuideDebug(priceGuideData.debug);
            } else if (!priceGuideData.priceGuide) {
              // Fallback: use EXACT same formula as backend when no sold comps available
              // This calculates what you should PAY, not what you'd sell for
              // Remove $ and spaces but KEEP the dash for range parsing
              const estimatedValue = bestCandidate.estimatedValue?.replace(/[\$\s,]/g, '') || '';
              if (estimatedValue) {
                // Parse expected sale price (take high end of range if provided)
                const parts = estimatedValue.split('-');
                const expectedSalePrice = parseFloat(parts[parts.length - 1] || parts[0]);
                
                const feeRate = getCategoryFeeRate(category);
                const shippingCost = getShippingAllowance(category);
                const fixedCosts = 2;
                
                setBaseSellPrice(expectedSalePrice);
                
                const profitGoal = expectedSalePrice * (profitPercent / 100);
                const fees = expectedSalePrice * feeRate;
                let maxBuyPrice = Math.floor(expectedSalePrice - fees - shippingCost - fixedCosts - profitGoal);
                if (maxBuyPrice < 0) maxBuyPrice = 0;
                
                // GUARD: maxBuy must be < sellPrice
                if (maxBuyPrice >= expectedSalePrice) {
                  console.error('[PRICE GUIDE GUARD] Invalid maxBuy', { expectedSalePrice, maxBuyPrice });
                  setSuggestedMaxPrice(null);
                  setPriceGuideDebug({ soldSampleCount: 0, source: 'guard_failure' });
                  return;
                }
                
                maxBuyPrice = applyCategoryCap(maxBuyPrice, title, category);
                setSuggestedMaxPrice(Math.round(maxBuyPrice));
                setPriceGuideSource('estimate'); // AI estimate, not real eBay data
                setPriceGuideDebug({ 
                  source: 'fallback_estimate',
                  expectedSalePrice,
                  soldSampleCount: 0,
                  reason: priceGuideData.debug?.reason || 'no_sold_comps'
                });
              }
            }
          } catch (priceErr) {
            console.error("Failed to fetch price guide:", priceErr);
            // Fallback to simple estimate using same formula as backend
            // Remove $ and spaces but KEEP the dash for range parsing
            const estimatedValue = bestCandidate.estimatedValue?.replace(/[\$\s,]/g, '') || '';
            if (estimatedValue) {
              const parts = estimatedValue.split('-');
              const expectedSalePrice = parseFloat(parts[parts.length - 1] || parts[0]);
              
              const feeRate = getCategoryFeeRate(category);
              const shippingCost = getShippingAllowance(category);
              const fixedCosts = 2;
              
              setBaseSellPrice(expectedSalePrice);
              
              const profitGoal = expectedSalePrice * (profitPercent / 100);
              const fees = expectedSalePrice * feeRate;
              let maxBuyPrice = Math.floor(expectedSalePrice - fees - shippingCost - fixedCosts - profitGoal);
              if (maxBuyPrice < 0) maxBuyPrice = 0;
              
              // GUARD: maxBuy must be < sellPrice
              if (maxBuyPrice >= expectedSalePrice) {
                console.error('[PRICE GUIDE GUARD] Invalid maxBuy in fallback', { expectedSalePrice, maxBuyPrice });
                setSuggestedMaxPrice(null);
                setPriceGuideDebug({ soldSampleCount: 0, source: 'guard_failure' });
                return;
              }
              
              maxBuyPrice = applyCategoryCap(maxBuyPrice, title, category);
              setSuggestedMaxPrice(Math.round(maxBuyPrice));
              setPriceGuideSource('estimate'); // AI estimate, not real eBay data
              setPriceGuideDebug({ 
                source: 'fallback_estimate', 
                expectedSalePrice,
                soldSampleCount: 0,
                reason: 'api_error' 
              });
            }
          }
        }
      } catch (err) {
        console.error("Failed to identify item:", err);
      } finally {
        setIsIdentifying(false);
      }
    } catch (err) {
      console.error("Failed to read image:", err);
    }
    
    // Reset input to allow repeated captures
    e.target.value = '';
  }, []);

  // Handle cost submission and analyze
  const handleCostSubmit = useCallback(async () => {
    if (!pendingImage) return;
    
    setShowCostModal(false);
    setIsCapturing(true);
    
    try {
      const cost = buyPrice ? parseFloat(buyPrice) : undefined;
      await scanAndAnalyzeMutation.mutateAsync({ 
        imageBase64: pendingImage, 
        buyPrice: cost,
        maxBuyPrice: suggestedMaxPrice ?? undefined,
        appliedProfitPercent: profitPercent,
        priceGuideSource: priceGuideSource ?? undefined
      });
    } catch (err) {
      console.error("Failed to scan:", err);
    } finally {
      setIsCapturing(false);
      setPendingImage(null);
      setBuyPrice("");
      setSuggestedMaxPrice(null);
      setProfitPercent(25);
      setPriceGuideSource(null);
    }
  }, [pendingImage, buyPrice, scanAndAnalyzeMutation, suggestedMaxPrice, profitPercent, priceGuideSource]);
  
  // Refetch price guide when condition changes
  const refetchPriceForCondition = useCallback(async (newCondition: 'used' | 'new') => {
    if (!identifiedTitle || !identifiedCategory || isRefetchingPrice) return;
    
    setIsRefetchingPrice(true);
    try {
      const priceGuideRes = await apiRequest('POST', '/api/price-guide', { 
        title: identifiedTitle, 
        category: identifiedCategory, 
        condition: newCondition 
      });
      const priceGuideData = await priceGuideRes.json();
      
      if (priceGuideData.priceGuide && priceGuideData.debug?.expectedSalePrice) {
        const expectedSalePrice = priceGuideData.debug.expectedSalePrice;
        setBaseSellPrice(expectedSalePrice);
        
        const feeRate = getCategoryFeeRate(identifiedCategory);
        const shippingCost = getShippingAllowance(identifiedCategory);
        const fixedCosts = 2;
        
        const profitGoal = expectedSalePrice * (profitPercent / 100);
        const fees = expectedSalePrice * feeRate;
        let maxBuyPrice = Math.floor(expectedSalePrice - fees - shippingCost - fixedCosts - profitGoal);
        if (maxBuyPrice < 0) maxBuyPrice = 0;
        
        if (maxBuyPrice >= expectedSalePrice) {
          setSuggestedMaxPrice(null);
        } else {
          maxBuyPrice = applyCategoryCap(maxBuyPrice, identifiedTitle, identifiedCategory);
          setSuggestedMaxPrice(Math.round(maxBuyPrice));
          setBuyPrice(String(Math.round(maxBuyPrice)));
        }
        
        setPriceGuideSource('sold_comps');
        setPriceGuideDebug({ 
          source: 'sold_comps',
          expectedSalePrice,
          soldSampleCount: priceGuideData.debug.soldSampleCount,
          condition: newCondition
        });
      }
    } catch (err) {
      console.error("Failed to refetch price for condition:", err);
    } finally {
      setIsRefetchingPrice(false);
    }
  }, [identifiedTitle, identifiedCategory, isRefetchingPrice, profitPercent]);

  // Handle condition toggle
  const handleConditionChange = useCallback((newCondition: 'used' | 'new') => {
    if (newCondition === itemCondition) return;
    setItemCondition(newCondition);
    refetchPriceForCondition(newCondition);
  }, [itemCondition, refetchPriceForCondition]);

  // Auto-advance effect: when price guide is calculated, auto-submit after brief delay
  // Disabled when refetching to allow user to see updated price
  useEffect(() => {
    if (suggestedMaxPrice !== null && !isIdentifying && !isRefetchingPrice && pendingImage && showCostModal) {
      // Set the buyPrice from suggested max price
      setBuyPrice(String(suggestedMaxPrice));
      
      // Auto-advance after 1.5 seconds to let user see the price
      const timer = setTimeout(() => {
        handleCostSubmit();
      }, 1500);
      
      return () => clearTimeout(timer);
    }
  }, [suggestedMaxPrice, isIdentifying, isRefetchingPrice, pendingImage, showCostModal, handleCostSubmit]);

  // Gallery handler - adds multiple photos directly to server
  const handleGallerySelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsCapturing(true);
    let addedCount = 0;
    const items = batchData?.items || [];
    const maxToAdd = Math.min(files.length, 20 - items.length);
    
    for (let i = 0; i < maxToAdd; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        
        await addPhotoMutation.mutateAsync(base64);
        addedCount++;
      } catch (err) {
        console.error("Failed to add photo:", err);
      }
    }
    
    setIsCapturing(false);
    
    if (addedCount > 0) {
      toast({ title: `Added ${addedCount} photo${addedCount > 1 ? 's' : ''} to queue` });
    }
    
    e.target.value = '';
  }, [addPhotoMutation, batchData?.items, toast]);

  const handleScanClick = useCallback(() => {
    cameraInputRef.current?.click();
  }, []);

  const handleUploadClick = useCallback(() => {
    galleryInputRef.current?.click();
  }, []);

  // Start processing all pending items
  const handleStartProcessing = async () => {
    const pendingItems = items.filter(i => i.status === 'pending');
    if (pendingItems.length === 0) {
      toast({ title: "No items to process", variant: "destructive" });
      return;
    }
    
    setIsProcessing(true);
    processNextItem();
  };

  const processNextItem = async () => {
    try {
      const result = await processMutation.mutateAsync();
      if (!result.complete) {
        setTimeout(processNextItem, 500);
      }
    } catch {
      setIsProcessing(false);
    }
  };

  const session = batchData?.session;
  // Get IDs of items that have been user-decided (FLIP IT/SKIP IT clicked)
  const userDecidedItemIds = new Set(
    (userItems || [])
      .filter(item => item.userDecision !== null)
      .map(item => item.id)
  );
  // Filter out batch items whose corresponding item has been user-decided
  const items = (batchData?.items || []).filter(batchItem => 
    !batchItem.itemId || !userDecidedItemIds.has(batchItem.itemId)
  );
  const pendingCount = items.filter(i => i.status === 'pending').length;
  const completedCount = items.filter(i => i.status === 'completed').length;
  const failedCount = items.filter(i => i.status === 'failed').length;
  const progress = items.length > 0 ? ((completedCount + failedCount) / items.length) * 100 : 0;

  const getVerdictColor = (verdict: string | null) => {
    if (verdict === 'flip') return 'text-green-500';
    if (verdict === 'skip') return 'text-red-500';
    return 'text-muted-foreground';
  };

  const getVerdictLabel = (verdict: string | null) => {
    if (verdict === 'flip') return 'Flip IT!';
    if (verdict === 'skip') return 'Skip IT';
    return 'Pending';
  };

  if (!isPro) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="p-4 pt-8">
          <Card className="p-6 text-center">
            <Sparkles className="w-12 h-12 mx-auto mb-4 text-primary" />
            <h2 className="text-xl font-bold mb-2">Batch Scanning is Pro Only</h2>
            <p className="text-muted-foreground mb-4">
              Upgrade to Pro to scan up to 20 items at once during sourcing trips.
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Handle judgment animation complete (batch mode auto-advances)
  const handleJudgmentComplete = () => {
    setShowJudgment(false);
  };

  return (
    <>
      {/* Judgment Animation Overlay (auto-advances in batch mode) */}
      <JudgmentOverlay
        isOpen={showJudgment}
        result={judgmentResult}
        onComplete={handleJudgmentComplete}
        autoAdvance={true}
      />
      
    <div className="min-h-screen bg-background pb-24">
      <div className="p-4 pt-8">
        <div className="flex justify-center mb-4">
          <MarginLogoFull height={64} />
        </div>
        
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => setLocation('/scan')} data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-display font-bold flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              Batch Scan
            </h1>
            <p className="text-sm text-muted-foreground">Queue multiple items for analysis</p>
          </div>
          {session?.status === 'completed' && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => newSessionMutation.mutate()}
              disabled={newSessionMutation.isPending}
              data-testid="button-new-batch"
            >
              New Batch
            </Button>
          )}
        </div>

        {/* Hidden file inputs */}
        {session?.status !== 'completed' && (
          <>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleCameraCapture}
              className="hidden"
              data-testid="input-batch-camera"
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleGallerySelect}
              className="hidden"
              data-testid="input-batch-gallery"
            />
            
            {/* Capture controls */}
            <Card className="p-4 mb-4">
              <div className="flex gap-2 mb-3">
                <Button
                  className="flex-1 bg-green-500 text-white"
                  onClick={handleScanClick}
                  disabled={isCapturing || scanAndAnalyzeMutation.isPending || isProcessing || items.length >= 20}
                  data-testid="button-batch-scan"
                >
                  {isCapturing || scanAndAnalyzeMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4 mr-2" />
                  )}
                  {scanAndAnalyzeMutation.isPending ? 'Analyzing...' : 'Scan & Analyze'}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleUploadClick}
                  disabled={isCapturing || scanAndAnalyzeMutation.isPending || isProcessing || items.length >= 20}
                  data-testid="button-batch-upload"
                >
                  {isCapturing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  Upload
                </Button>
              </div>
              
              <p className="text-xs text-muted-foreground">
                {items.length}/20 items • Scan instantly analyzes each item
              </p>
            </Card>
          </>
        )}

        {/* Process button */}
        {items.length > 0 && (
          <>
            {pendingCount > 0 && !isProcessing && session?.status !== 'completed' && (
              <Button 
                className="w-full mb-4" 
                onClick={handleStartProcessing}
                disabled={processMutation.isPending}
                data-testid="button-start-processing"
              >
                {processMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                Process {pendingCount} Item{pendingCount !== 1 ? 's' : ''}
              </Button>
            )}

            {/* Processing indicator */}
            {isProcessing && (
              <Card className="p-4 mb-4 border-primary/50 bg-primary/5">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <div>
                    <p className="font-medium">Processing batch...</p>
                    <p className="text-sm text-muted-foreground">
                      {completedCount + failedCount} of {items.length} complete
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Progress bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Progress</span>
                <span className="text-sm text-muted-foreground">
                  {completedCount + failedCount}/{items.length}
                </span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            {/* Queue items - swipe left to skip, right to flip */}
            <div className="space-y-3">
              <AnimatePresence>
                {items.map((item, index) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0, x: 0 }}
                    exit={{ opacity: 0, x: item.decisionVerdict === 'flip' ? 200 : -200 }}
                    transition={{ delay: index * 0.05 }}
                    drag={item.status === 'completed' ? "x" : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.3}
                    onDragEnd={(e, info) => {
                      if (item.status !== 'completed') return;
                      const threshold = 80;
                      if (info.offset.x > threshold) {
                        // Swipe right = flip - navigate to item details
                        if (item.itemId) {
                          const completedItemIds = items
                            .filter(i => i.status === 'completed' && i.itemId)
                            .map(i => i.itemId);
                          const currentIndex = completedItemIds.indexOf(item.itemId);
                          setLocation(`/item/${item.itemId}?batch=${completedItemIds.join(',')}&idx=${currentIndex}&returnTo=/batch`);
                        }
                      } else if (info.offset.x < -threshold) {
                        // Swipe left = dismiss
                        dismissMutation.mutate(item.id);
                      }
                    }}
                    style={{ touchAction: "pan-y" }}
                    whileDrag={{ cursor: "grabbing" }}
                  >
                    <Card 
                      className={`p-3 transition-colors ${
                        item.status === 'completed' && item.decisionVerdict === 'flip' 
                          ? 'bg-green-500/20 border-green-500/50' 
                          : item.status === 'completed' && item.decisionVerdict === 'skip'
                          ? 'bg-red-500/20 border-red-500/50'
                          : item.status === 'failed'
                          ? 'bg-destructive/10 border-destructive/30'
                          : ''
                      } ${item.status === 'completed' && item.itemId ? 'cursor-pointer hover-elevate' : ''}`}
                      onClick={() => {
                        if (item.status === 'completed' && item.itemId) {
                          // Pass batch context and returnTo so ItemDetails can navigate back
                          const completedItemIds = items
                            .filter(i => i.status === 'completed' && i.itemId)
                            .map(i => i.itemId);
                          const currentIndex = completedItemIds.indexOf(item.itemId);
                          setLocation(`/item/${item.itemId}?batch=${completedItemIds.join(',')}&idx=${currentIndex}&returnTo=/batch`);
                        }
                      }}
                      data-testid={`card-batch-item-${item.id}`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Thumbnail */}
                        <div className="w-12 h-12 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {item.inputType === 'photo' && item.inputValue?.startsWith('data:') ? (
                            <img src={item.inputValue} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Image className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {item.status === 'pending' && (
                              <Clock className="w-4 h-4 text-muted-foreground" />
                            )}
                            {item.status === 'processing' && (
                              <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            )}
                            {item.status === 'completed' && item.decisionVerdict === 'flip' && (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            )}
                            {item.status === 'completed' && item.decisionVerdict === 'skip' && (
                              <XCircle className="w-4 h-4 text-red-600" />
                            )}
                            {item.status === 'failed' && (
                              <XCircle className="w-4 h-4 text-destructive" />
                            )}
                            <span className="font-medium text-sm truncate" title={item.title || undefined}>
                              {item.title || `Item ${index + 1}`}
                            </span>
                          </div>
                          {/* Show max buy price and profit % only when from real eBay sold data */}
                          {item.maxBuyPrice && item.appliedProfitPercent && item.priceGuideSource === 'sold_comps' && (
                            <p className="text-xs text-green-600 mt-0.5 font-medium">
                              Max buy @ ${Number(item.maxBuyPrice).toLocaleString()} ({item.appliedProfitPercent}% profit)
                            </p>
                          )}
                          {/* Show estimate indicator when not from real data */}
                          {item.priceGuideSource === 'estimate' && (
                            <p className="text-xs text-amber-500 mt-0.5">
                              No eBay sold data available
                            </p>
                          )}
                          
                          {item.status === 'completed' && item.decisionVerdict && (
                            <div className="mt-2">
                              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md font-bold text-base ${
                                item.decisionVerdict === 'flip' 
                                  ? 'bg-green-500/20 text-green-600 border border-green-500/50' 
                                  : 'bg-red-500/20 text-red-600 border border-red-500/50'
                              }`}>
                                {item.decisionVerdict === 'flip' ? (
                                  <CheckCircle className="w-4 h-4" />
                                ) : (
                                  <XCircle className="w-4 h-4" />
                                )}
                                {item.decisionVerdict === 'flip' ? 'Flip It!' : 'Skip It!'}
                              </div>
                              {item.maxBuyPrice && item.appliedProfitPercent && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Max buy ${Number(item.maxBuyPrice).toLocaleString()} • {item.appliedProfitPercent}% target profit
                                  {item.buyPrice && ` • Cost: $${Number(item.buyPrice).toFixed(2)}`}
                                </p>
                              )}
                              <p className="text-[10px] text-muted-foreground mt-1">
                                Swipe right to view • Swipe left to dismiss
                              </p>
                            </div>
                          )}
                          
                          {item.status === 'failed' && (
                            <div className="text-xs text-destructive space-y-1">
                              <p className="font-medium">Analysis failed</p>
                              {item.errorMessage && (
                                <p className="break-all opacity-80" title={item.errorMessage}>
                                  {item.errorMessage.length > 80 
                                    ? item.errorMessage.slice(0, 80) + '...' 
                                    : item.errorMessage}
                                </p>
                              )}
                            </div>
                          )}
                          
                          {item.status === 'processing' && (
                            <p className="text-xs text-muted-foreground animate-pulse">
                              Analyzing...
                            </p>
                          )}
                        </div>
                        
                        {/* Dismiss button - always visible */}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => dismissMutation.mutate(item.id)}
                          disabled={dismissMutation.isPending}
                          data-testid={`button-dismiss-${item.id}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </>
        )}

        {/* Empty state */}
        {items.length === 0 && (
          <Card className="p-8 text-center">
            <Camera className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Batch Mode Active</h3>
            <p className="text-muted-foreground text-sm">
              Rapid-fire decisions. Up to 20 items queued.
            </p>
          </Card>
        )}
      </div>
      
      {/* Price Range Modal */}
      <Dialog open={showCostModal} onOpenChange={(open) => {
        if (!open) {
          setShowCostModal(false);
          setPendingImage(null);
          setSuggestedMaxPrice(null);
          setIdentifiedTitle(null);
          setIdentifiedCategory(null);
          setPriceGuideDebug(null);
          setBaseSellPrice(null);
          setProfitPercent(25); // Reset to default
          setMatchStrength(null);
          setMatchSource(null);
          setTopAlternatives([]);
          setItemCondition('used'); // Reset condition
          setCompThumbnail(null); // Reset thumbnail
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-500" />
              {isIdentifying ? 'Identifying item...' : 'Price Guide'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {isIdentifying ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : suggestedMaxPrice !== null ? (
              <div className="space-y-4">
                {/* Comp thumbnail + title header */}
                <div className="flex items-center gap-3">
                  {compThumbnail && (
                    <img 
                      src={compThumbnail} 
                      alt="Matched item" 
                      className="w-16 h-16 object-cover rounded-md border border-border"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    {identifiedTitle && (
                      <p className="text-sm font-medium truncate">{identifiedTitle}</p>
                    )}
                    {identifiedCategory && (
                      <p className="text-xs text-muted-foreground">{identifiedCategory}</p>
                    )}
                  </div>
                </div>
                
                {/* Condition toggle - affects comp pricing */}
                <div className="flex items-center justify-center gap-2 p-2 bg-muted/50 rounded-lg">
                  <span className="text-xs text-muted-foreground">Condition:</span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant={itemCondition === 'used' ? 'default' : 'ghost'}
                      className="h-7 px-3 text-xs"
                      onClick={() => handleConditionChange('used')}
                      disabled={isRefetchingPrice}
                      data-testid="button-condition-used"
                    >
                      Used
                    </Button>
                    <Button
                      size="sm"
                      variant={itemCondition === 'new' ? 'default' : 'ghost'}
                      className="h-7 px-3 text-xs"
                      onClick={() => handleConditionChange('new')}
                      disabled={isRefetchingPrice}
                      data-testid="button-condition-new"
                    >
                      New
                    </Button>
                  </div>
                  {isRefetchingPrice && (
                    <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                  )}
                </div>
                
                {/* Weak confidence warning banner */}
                {matchStrength === 'weak' && (
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-yellow-600" />
                      <span className="text-sm font-medium text-yellow-700 dark:text-yellow-400">Low confidence match</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      We're not 100% sure about this item. Consider retaking the photo or proceeding with caution.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs"
                        onClick={() => {
                          setShowCostModal(false);
                          setPendingImage(null);
                          setSuggestedMaxPrice(null);
                          setIdentifiedTitle(null);
                          setIdentifiedCategory(null);
                          setMatchStrength(null);
                          setMatchSource(null);
                          setTopAlternatives([]);
                          setPriceGuideDebug(null);
                          setBaseSellPrice(null);
                          setItemCondition('used');
                          setCompThumbnail(null);
                        }}
                        data-testid="button-retake-photo"
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Retake Photo
                      </Button>
                    </div>
                    {topAlternatives.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-yellow-500/20">
                        <p className="text-xs text-muted-foreground mb-1">Other possibilities:</p>
                        <div className="flex flex-wrap gap-1">
                          {topAlternatives.slice(0, 3).map((alt, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {alt.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                {matchStrength === 'none' && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                      <span className="text-sm font-medium text-red-700 dark:text-red-400">No match found</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This item isn't in our library yet. We used AI fallback - results may be less accurate.
                    </p>
                  </div>
                )}
                
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-3">Pay no more than:</p>
                  <div className="flex items-center justify-center gap-2">
                    <MarginLogoMark size={36} />
                    <p className="text-4xl font-bold text-green-600">${Math.round(suggestedMaxPrice).toLocaleString('en-US')}</p>
                  </div>
                  {/* Secondary line: approx profit % */}
                  <p className="text-sm text-green-600 font-medium mt-1">≈ {profitPercent}% profit</p>
                  {priceGuideDebug?.expectedSalePrice ? (
                    <p className="text-xs text-muted-foreground mt-3 pt-2 border-t border-green-500/20">
                      Expected sale: ${Math.round(priceGuideDebug.expectedSalePrice).toLocaleString('en-US')} (estimate)
                    </p>
                  ) : null}
                </div>
                
                {/* Category info - no slider needed when using preset settings */}
                <p className="text-xs text-muted-foreground text-center pt-2">
                  {identifiedCategory || 'Other'} • {profitPercent}% target
                </p>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground">
                  Couldn't estimate value for this item. Proceed to analyze for detailed pricing.
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowCostModal(false);
                setPendingImage(null);
                setSuggestedMaxPrice(null);
                setIdentifiedTitle(null);
                setIdentifiedCategory(null);
                setPriceGuideDebug(null);
                setBaseSellPrice(null);
                setProfitPercent(25); // Reset to default
                setMatchStrength(null);
                setMatchSource(null);
                setTopAlternatives([]);
                setItemCondition('used');
                setCompThumbnail(null);
              }}
              disabled={isIdentifying}
              data-testid="button-cancel-scan"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => {
                // Use suggested max price as the buy price for analysis
                if (suggestedMaxPrice !== null) {
                  setBuyPrice(String(suggestedMaxPrice));
                }
                handleCostSubmit();
              }}
              className="bg-green-500 text-white"
              disabled={isIdentifying}
              data-testid="button-analyze-item"
            >
              {isIdentifying ? 'Please wait...' : 'Analyze'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <BottomNav />
    </div>
    </>
  );
}
