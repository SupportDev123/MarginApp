import { useState, useEffect } from "react";
import { useExtractItem, useConfirmAndAnalyze, useScanStatus } from "@/hooks/use-items";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScanLine, Loader2, Link as LinkIcon, AlertCircle, CheckCircle, ArrowLeft, Edit2, Sparkles, Zap, Camera, Layers, ShoppingBag, MonitorPlay, Watch, Target, Trophy, Globe, RefreshCw, CreditCard, Award } from "lucide-react";
import { ApiErrorDisplay } from "@/components/ApiErrorDisplay";
import { getUserFriendlyErrorMessage } from "@/lib/api-errors";
import { useIsMobile } from "@/hooks/use-mobile";
import { ManualCompsInput } from "@/components/ManualCompsInput";
import { CameraScan } from "@/components/CameraScan";
import { ProductAutocomplete } from "@/components/ProductAutocomplete";
import { HottestThisWeek } from "@/components/HottestThisWeek";
import { parseMoney } from "@/lib/comps";
import { incrementScanCount } from "@/components/FeedbackGate";
import { MarginLogoFull } from "@/components/MarginLogo";
import { JudgmentOverlay } from "@/components/JudgmentAnimation";
import { UserSelectedCompsMode } from "@/components/UserSelectedCompsMode";
import { motion, AnimatePresence } from "framer-motion";
import { z } from "zod";
import { api } from "@shared/routes";
import type { ScanCandidate } from "@shared/schema";
import { usePreferences } from "@/hooks/use-preferences";
import { useAuth } from "@/hooks/use-auth";
import { EfficiencyScore, ScanTokens } from "@/components/ScanEfficiency";

type ExtractedItem = {
  title?: string;
  price?: string;
  condition?: string;
  shipping?: string;
  url: string;
  suggestedCategory?: 'Collectibles' | 'Shoes' | 'Watches' | 'Trading Cards' | 'Electronics' | 'Sports Memorabilia' | 'Other' | null;
};

type Category = 'Collectibles' | 'Shoes' | 'Watches' | 'Trading Cards' | 'Electronics' | 'Sports Memorabilia' | 'Other';

const CATEGORIES: Category[] = ['Collectibles', 'Trading Cards', 'Watches', 'Shoes', 'Electronics', 'Sports Memorabilia', 'Other'];

const normalizeCategoryToValid = (cat: string | undefined | null): Category | "" => {
  if (!cat) return "";
  const lower = cat.toLowerCase().trim();
  const validMatch = CATEGORIES.find(c => c.toLowerCase() === lower);
  if (validMatch) return validMatch;
  const mappings: Record<string, Category> = {
    'toys': 'Collectibles',
    'toys & collectibles': 'Collectibles',
    'funko': 'Collectibles',
    'funko pop': 'Collectibles',
    'lego': 'Collectibles',
    'hot wheels': 'Collectibles',
    'barbie': 'Collectibles',
    'action figures': 'Collectibles',
    'collectibles': 'Collectibles',
    'gaming': 'Electronics',
    'tools': 'Other',
    'apparel': 'Other',
    'vehicles': 'Other',
    'unknown': 'Other',
    'sports cards': 'Trading Cards',
    'marvel cards': 'Trading Cards',
    'tcg cards': 'Trading Cards',
    'trading cards': 'Trading Cards',
    'pokemon': 'Trading Cards',
    'marvel': 'Trading Cards',
    'sports memorabilia': 'Sports Memorabilia',
    'memorabilia': 'Sports Memorabilia',
    'jersey': 'Sports Memorabilia',
    'jerseys': 'Sports Memorabilia',
    'helmet': 'Sports Memorabilia',
    'helmets': 'Sports Memorabilia',
    'signed ball': 'Sports Memorabilia',
    'signed balls': 'Sports Memorabilia',
    'autograph': 'Sports Memorabilia',
    'autographs': 'Sports Memorabilia',
    'game worn': 'Sports Memorabilia',
    'game-worn': 'Sports Memorabilia',
  };
  return mappings[lower] || 'Other';
};

export default function AnalyzePage() {
  const searchString = useSearch();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'url' | 'camera' | 'manual' | 'confirm' | 'text-confirm' | 'user-comps'>('url');
  
  // Handle step query param for Deep Scan access from Tools
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const stepParam = params.get('step');
    if (stepParam === 'camera') {
      setStep('camera');
    }
  }, [searchString]);
  const [isTextQuery, setIsTextQuery] = useState(false);
  const [textQueryLoading, setTextQueryLoading] = useState(false);
  const [extractedItem, setExtractedItem] = useState<ExtractedItem | null>(null);
  const [cameraCandidate, setCameraCandidate] = useState<ScanCandidate | null>(null);
  const [confirmedTitle, setConfirmedTitle] = useState("");
  const [confirmedPrice, setConfirmedPrice] = useState("");
  const [confirmedCondition, setConfirmedCondition] = useState("Used");
  const [confirmedShipping, setConfirmedShipping] = useState("");
  const [shippingFocused, setShippingFocused] = useState(false);
  const [category, setCategory] = useState<Category | "">("");
  const [suggestedCategory, setSuggestedCategory] = useState<Category | null>(null);
  const [detailsConfirmed, setDetailsConfirmed] = useState(false);
  const [manualComps, setManualComps] = useState<string[]>([]);
  
  // Funko Pop specific fields for structured search
  const [funkoLine, setFunkoLine] = useState("");
  const [funkoCharacter, setFunkoCharacter] = useState("");
  const [funkoNumber, setFunkoNumber] = useState("");
  const [showFunkoFields, setShowFunkoFields] = useState(false);
  
  // Watch specific fields for color selection
  const [watchBezelColor, setWatchBezelColor] = useState("");
  const [watchDialColor, setWatchDialColor] = useState("");
  
  // Check if this is a Watch item
  const isWatchItem = category === 'Watches' || 
                      confirmedTitle.toLowerCase().includes('watch') ||
                      cameraCandidate?.category === 'Watches';
  
  // Check if this is a Funko Pop item (user toggle, detected from title, or fields filled)
  const isFunkoItem = showFunkoFields ||
                      confirmedTitle.toLowerCase().includes('funko') || 
                      confirmedTitle.toLowerCase().includes('pop!') ||
                      funkoLine.toLowerCase().includes('funko');
  
  // Scan mode: 'flip' for resellers, 'buy' for collectors
  // Initialize from URL query param if present
  const [location, setLocation] = useLocation();
  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const modeFromUrl = urlParams.get('mode');
  const [scanMode, setScanMode] = useState<'flip' | 'buy'>(modeFromUrl === 'buy' ? 'buy' : 'flip');
  
  // Judgment animation state
  const [showJudgment, setShowJudgment] = useState(false);
  const [judgmentResult, setJudgmentResult] = useState<{
    decision: 'flip' | 'skip' | 'risky';
    reason?: string;
    maxBuy?: number;
    expectedSalePrice?: number;
    confidence?: 'strong' | 'moderate' | 'weak';
    itemId?: number;
    scanDuration?: number;
  } | null>(null);
  const [targetMargin, setTargetMargin] = useState(25);
  
  // Display shipping based on extracted/confirmed value
  const getShippingDisplayValue = (val: string): string => {
    if (!val || val === "" || val.toLowerCase() === "unknown") {
      return "Tap to verify";
    }
    if (val.toLowerCase() === "free") {
      return "Free";
    }
    const num = parseFloat(val);
    if (!isNaN(num) && num === 0) {
      return "Free";
    }
    return val;
  };
  
  // Check if shipping needs verification (wasn't extracted)
  const isShippingUnverified = !confirmedShipping || confirmedShipping === "" || confirmedShipping.toLowerCase() === "unknown";
  
  const shippingDisplayValue = shippingFocused ? confirmedShipping : getShippingDisplayValue(confirmedShipping);
  
  const extractMutation = useExtractItem();
  const confirmMutation = useConfirmAndAnalyze();
  const { data: scanStatus, refetch: refetchScanStatus } = useScanStatus();
  const queryClient = useQueryClient();
  const { preferences, updatePreference } = usePreferences();
  const { user } = useAuth();
  const isPro = user?.subscriptionTier === 'pro' || user?.isAdmin;
  const isMobile = useIsMobile();
  
  const isPending = extractMutation.isPending || confirmMutation.isPending;
  
  // Save last category when user selects one
  const handleCategoryChange = (newCategory: Category) => {
    setCategory(newCategory);
    updatePreference('lastCategory', newCategory);
  };

  // Detect if input is an eBay URL
  const isEbayUrl = (input: string): boolean => {
    const trimmed = input.trim();
    // Check for ebay.com in the URL
    if (trimmed.includes('ebay.com') || trimmed.includes('ebay.co.uk') || trimmed.includes('ebay.de')) {
      // Normalize: add https if missing
      const urlToTest = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
      try {
        const parsed = new URL(urlToTest);
        return parsed.hostname.includes('ebay');
      } catch {
        return false;
      }
    }
    return false;
  };
  
  const handleAnalyzeInput = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    const input = url.trim();
    if (!input) {
      setError("Please enter an item name or paste an eBay link");
      return;
    }
    
    // Determine if this is a URL or text query
    if (isEbayUrl(input)) {
      // URL path - use existing extract flow
      setIsTextQuery(false);
      const normalizedUrl = input.startsWith('http') ? input : `https://${input}`;
      
      try {
        z.string().url().parse(normalizedUrl);
      } catch {
        setError("Please enter a valid eBay listing link");
        return;
      }
      
      try {
        const result = await extractMutation.mutateAsync(normalizedUrl);
        setExtractedItem(result.item);
        setConfirmedTitle(result.item.title || "");
        setConfirmedPrice(result.item.price || "");
        setConfirmedCondition(result.item.condition || "Used");
        setConfirmedShipping(result.item.shipping || "");
        if (result.item.suggestedCategory) {
          const normalizedCat = normalizeCategoryToValid(result.item.suggestedCategory);
          setSuggestedCategory(normalizedCat || null);
          setCategory(normalizedCat);
        } else {
          setSuggestedCategory(null);
          const lastCat = preferences.lastCategory as Category | null;
          setCategory(lastCat && CATEGORIES.includes(lastCat) ? lastCat : "");
        }
        setDetailsConfirmed(false);
        setStep('confirm');
      } catch (err) {
        // Error handled by mutation hook
      }
    } else {
      // Text query path - go to simplified confirmation
      setIsTextQuery(true);
      setConfirmedTitle(input);
      setConfirmedPrice("");
      setConfirmedShipping("");
      setConfirmedCondition("Used");
      setSuggestedCategory(null);
      const lastCat = preferences.lastCategory as Category | null;
      setCategory(lastCat && CATEGORIES.includes(lastCat) ? lastCat : "");
      setExtractedItem({
        title: input,
        url: `text://query/${encodeURIComponent(input)}`,
        suggestedCategory: null,
      });
      setStep('text-confirm');
    }
  };
  
  const handleTextQueryAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!confirmedTitle.trim()) {
      setError("Please enter an item description");
      return;
    }
    
    if (!category) {
      setError("Please select a category");
      return;
    }
    
    setTextQueryLoading(true);
    try {
      const response = await fetch('/api/items/analyze-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          query: confirmedTitle.trim(),
          category,
          scanMode,
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Analysis failed');
      }
      
      const result = await response.json();
      
      // Increment scan count for feedback gate
      incrementScanCount();
      
      queryClient.invalidateQueries({ queryKey: [api.user.scanStatus.path] });
      
      if (result && typeof result.id === 'number') {
        setLocation(`/item/${result.id}`);
      } else {
        setError("Analysis completed but couldn't navigate to results");
      }
    } catch (err: any) {
      if (err?.message?.includes("Daily scan limit")) {
        setError("You've used all 5 free scans today. Upgrade to Pro for unlimited scans!");
        refetchScanStatus();
      } else {
        setError(err?.message || "An error occurred during analysis");
      }
    } finally {
      setTextQueryLoading(false);
    }
  };

  const handleExtract = async (e: React.FormEvent) => {
    // Legacy handler - redirect to unified handler
    return handleAnalyzeInput(e);
  };

  const handleConfirmAndAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const analyzeStartTime = Date.now();

    if (!confirmedTitle.trim()) {
      setError("Please enter an item title");
      return;
    }

    if (!category) {
      setError("Please select a category");
      return;
    }

    // Watch color validation - both colors required for accurate pricing
    if (isWatchItem && (!watchBezelColor || !watchDialColor)) {
      setError("Please select both bezel color and dial color for accurate watch pricing");
      return;
    }

    try {
      // Parse manual comps into numbers - with defensive guards
      let parsedPrices: number[] = [];
      try {
        if (Array.isArray(manualComps)) {
          parsedPrices = manualComps
            .map(c => {
              try {
                return parseMoney(c);
              } catch (parseErr) {
                console.error("PARSE MONEY ERROR:", parseErr, "input:", c);
                return null;
              }
            })
            .filter((p): p is number => p !== null && !isNaN(p) && p > 0);
        }
      } catch (compsErr) {
        console.error("COMPS PARSING ERROR:", compsErr);
        parsedPrices = [];
      }
      
      // Only submit manual comps if we have at least 3 valid prices
      const hasValidManualComps = parsedPrices.length >= 3;
      const compSource: 'manual' | 'none' = hasValidManualComps ? 'manual' : 'none';
      
      const isCameraScan = cameraCandidate !== null;
      const sourceType: 'camera' | 'url' = isCameraScan ? 'camera' : 'url';
      
      // Defensive: ensure extractedItem exists
      if (!extractedItem || !extractedItem.url) {
        console.error("ANALYZE ERROR: extractedItem missing or has no URL");
        setError("Please scan or enter an item first");
        return;
      }
      
      // Build search title: use Funko structured fields if filled, else use confirmedTitle
      let searchTitle = confirmedTitle;
      if (isFunkoItem && (funkoLine || funkoCharacter || funkoNumber)) {
        // Build structured Funko search: "Funko Pop - Movies Hannibal #1248"
        searchTitle = [funkoLine, funkoCharacter, funkoNumber].filter(Boolean).join(' ');
      }
      
      const mutationInput = {
        url: extractedItem.url,
        title: searchTitle,
        price: confirmedPrice || "0.00",
        condition: confirmedCondition,
        shipping: confirmedShipping,
        category: category as Category,
        manualCompPrices: hasValidManualComps ? parsedPrices : null,
        compSource,
        sourceType,
        scanMode,
        // Watch metadata from library matching (auto-fill dropdowns)
        // Check candidate.brand from OCR/visual matching as primary source
        watchBrand: cameraCandidate?.watchMeta?.watchBrand || cameraCandidate?.brand || (cameraCandidate as any)?.brandDetected?.toLowerCase() || null,
        watchFamily: cameraCandidate?.watchMeta?.watchFamily || null,
        watchBandType: cameraCandidate?.watchMeta?.watchBandType || null,
        watchMovementType: cameraCandidate?.watchMeta?.watchMovementType || null,
        // Watch colors from user selection (mandatory for watches)
        watchDialColor: watchDialColor || cameraCandidate?.dialColor || null,
        watchDialStyle: cameraCandidate?.dialStyle || null,
        watchBezelColor: watchBezelColor || cameraCandidate?.bezelColor || null,
      };
      
      const result = await confirmMutation.mutateAsync(mutationInput);
      
      // Increment scan count for feedback gate
      incrementScanCount();
      
      // Refresh scan status after successful analysis
      queryClient.invalidateQueries({ queryKey: [api.user.scanStatus.path] });
      
      // Defensive: ensure result has id before navigating
      if (result && typeof result.id === 'number') {
        // Buy Mode: skip judgment animation, go directly to results
        if (scanMode === 'buy') {
          setLocation(`/item/${result.id}`);
          return;
        }
        
        // Flip Mode: show judgment animation
        // Extract decision from margin-based decisionVerdict (single source of truth)
        const decision = result.decisionVerdict === 'flip' ? 'flip' : 
                        result.decisionVerdict === 'skip' ? 'skip' : 'risky';
        
        // Extract data from rawAnalysis or decisionData
        const rawAnalysis = result.rawAnalysis as any;
        const decisionData = result.decisionData as any;
        const compCount = rawAnalysis?.comps?.comps?.length || 0;
        const maxBuy = decisionData?.maxBuy || rawAnalysis?.maxBuy;
        const expectedSalePrice = decisionData?.marketValue || rawAnalysis?.medianPrice || 0;
        const reason = result.explanation || rawAnalysis?.shortExplanation;
        
        // Determine confidence based on data quality
        let confidence: 'strong' | 'moderate' | 'weak' = 'moderate';
        if (compCount >= 5) {
          confidence = 'strong';
        } else if (compCount >= 3) {
          confidence = 'moderate';
        } else {
          confidence = 'weak';
        }
        
        // Show judgment animation with scan duration
        const scanDuration = Date.now() - analyzeStartTime;
        setJudgmentResult({
          decision: decision as 'flip' | 'skip' | 'risky',
          reason: reason?.split('.')[0] || undefined,
          maxBuy: maxBuy || undefined,
          expectedSalePrice: expectedSalePrice || undefined,
          confidence,
          itemId: result.id,
          scanDuration,
        });
        setShowJudgment(true);
      } else {
        console.error("ANALYZE ERROR: result missing id", result);
        setError("Analysis completed but couldn't navigate to results");
      }
    } catch (err: any) {
      console.error("ANALYZE CATCH ERROR:", err, err?.stack);
      // Handle rate limit error
      if (err?.message?.includes("Daily scan limit")) {
        setError("You've used all 5 free scans today. Upgrade to Pro for unlimited scans!");
        refetchScanStatus();
      } else {
        setError(err?.message || "An error occurred during analysis");
      }
    }
  };

  const handleBack = () => {
    setStep('url');
    setExtractedItem(null);
    setCameraCandidate(null);
    setCategory("");
    setSuggestedCategory(null);
    setDetailsConfirmed(false);
    setManualComps([]);
    setFunkoLine("");
    setFunkoCharacter("");
    setFunkoNumber("");
    setShowFunkoFields(false);
    setError(null);
  };

  const handleCameraConfirm = (candidate: ScanCandidate) => {
    setCameraCandidate(candidate);
    setConfirmedTitle(candidate.title);
    setConfirmedPrice("");
    setConfirmedCondition("Used");
    setConfirmedShipping("");
    const normalizedCat = normalizeCategoryToValid(candidate.category);
    setCategory(normalizedCat);
    setSuggestedCategory(normalizedCat || null);
    setExtractedItem({
      title: candidate.title,
      url: `camera://scan/${Date.now()}`,
      suggestedCategory: normalizedCat || null,
    });
    setDetailsConfirmed(false);
    setManualComps([]);
    // Reset Funko fields, auto-detect if title contains Funko
    const isFunko = candidate.title.toLowerCase().includes('funko');
    setFunkoLine(isFunko ? 'Funko Pop' : "");
    setFunkoCharacter("");
    setFunkoNumber("");
    setShowFunkoFields(isFunko);
    // Auto-fill watch colors from vision detection - with sensible defaults for watches
    // Normalize OCR colors to match Select option values (lowercase, mapped)
    const normalizeWatchColor = (color: string | undefined, type: 'dial' | 'bezel'): string => {
      if (!color) return type === 'dial' ? 'black' : 'black';
      const c = color.toLowerCase().trim();
      // Map common variations
      if (c.includes('blue') && c.includes('mother') && c.includes('pearl')) return 'blue-mother-of-pearl';
      if (c.includes('mother') && c.includes('pearl')) return 'mother-of-pearl';
      if (c.includes('rose') && c.includes('gold')) return 'rose-gold';
      if (c.includes('two') && c.includes('tone')) return 'two-tone';
      if (c.includes('root') && c.includes('beer')) return 'root-beer';
      if (c.includes('pepsi')) return 'pepsi';
      if (c.includes('batman')) return 'batman';
      if (c.includes('coke')) return 'coke';
      if (c.includes('panda') && c.includes('reverse')) return 'reverse-panda';
      if (c.includes('panda')) return 'panda';
      if (c.includes('skeleton') || c.includes('open')) return 'skeleton';
      if (c.includes('champagne')) return 'gold';
      if (c.includes('anthracite')) return 'gray';
      if (c.includes('chocolate')) return 'brown';
      if (c.includes('ivory')) return 'cream';
      if (c.includes('burgundy')) return 'red';
      if (c.includes('ceramic')) return 'ceramic';
      // Direct color matches
      const directColors = ['black', 'blue', 'green', 'red', 'gold', 'silver', 'white', 'orange', 'gray', 'brown', 'cream'];
      for (const dc of directColors) {
        if (c.includes(dc)) return dc;
      }
      return type === 'dial' ? 'black' : 'black';
    };
    
    const isWatch = normalizedCat === 'Watches';
    if (isWatch) {
      setWatchDialColor(normalizeWatchColor(candidate.dialColor, 'dial'));
      setWatchBezelColor(normalizeWatchColor(candidate.bezelColor, 'bezel'));
    } else {
      // Non-watch: only set if values are present
      if (candidate.dialColor) setWatchDialColor(normalizeWatchColor(candidate.dialColor, 'dial'));
      if (candidate.bezelColor) setWatchBezelColor(normalizeWatchColor(candidate.bezelColor, 'bezel'));
    }
    setStep('confirm');
  };

  const handleManualEntry = () => {
    setCameraCandidate(null);
    setConfirmedTitle("");
    setConfirmedPrice("");
    setConfirmedCondition("Used");
    setConfirmedShipping("");
    // Use last category from preferences if available
    const lastCat = preferences.lastCategory as Category | null;
    setCategory(lastCat && CATEGORIES.includes(lastCat) ? lastCat : "");
    setSuggestedCategory(null);
    setExtractedItem({
      title: "",
      url: `manual://entry/${Date.now()}`,
      suggestedCategory: null,
    });
    setDetailsConfirmed(false);
    setManualComps([]);
    setFunkoLine("");
    setFunkoCharacter("");
    setFunkoNumber("");
    setShowFunkoFields(false);
    setStep('confirm');
  };

  // Handle judgment animation complete - navigate to item details
  const handleJudgmentComplete = () => {
    if (judgmentResult?.itemId) {
      setShowJudgment(false);
      setLocation(`/item/${judgmentResult.itemId}`);
    }
  };

  // Handle new scan from judgment overlay
  const handleNewScanFromJudgment = () => {
    setShowJudgment(false);
    setJudgmentResult(null);
    handleBack();
  };

  return (
    <>
      {/* Judgment Animation Overlay */}
      <JudgmentOverlay
        isOpen={showJudgment}
        result={judgmentResult}
        onComplete={handleJudgmentComplete}
        onNewScan={handleNewScanFromJudgment}
        targetMargin={targetMargin}
        onMarginChange={setTargetMargin}
      />
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex flex-col px-6 pt-6 pb-24">
        
        <AnimatePresence mode="wait">
          {step === 'url' ? (
            <motion.div
              key="url-step"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col h-full"
            >
              {/* Banner Header */}
              <div className="flex justify-center mb-2">
                <MarginLogoFull height={80} />
              </div>
              
              <div className="text-center mb-4">
                <h1 className="text-lg font-display font-medium text-muted-foreground">We decide. You don't have to.</h1>
              </div>

              {/* Hero Action - Pulse */}
              <Card className="p-6 border-2 border-primary/20 bg-card shadow-xl dark:shadow-primary/5 transition-all duration-200 hover:border-primary/30 hover:shadow-2xl dark:hover:shadow-primary/10">
                <button
                  onClick={() => setLocation('/scan')}
                  className="w-full group focus:outline-none"
                  data-testid="button-pulse"
                >
                  <div className="flex flex-col items-center pt-1 pb-4">
                    <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mb-3 shadow-lg shadow-primary/25 group-hover:shadow-xl group-hover:shadow-primary/35 group-active:scale-[0.97] transition-all duration-150">
                      <Camera className="w-10 h-10 text-primary-foreground transition-transform duration-150 group-hover:scale-105" />
                      <div className="absolute inset-0 rounded-2xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl font-bold text-foreground group-active:scale-[0.99] transition-transform duration-100">Scan</span>
                    </div>
                    <span className="text-sm text-muted-foreground">Point your camera for instant profit insights</span>
                  </div>
                </button>
              </Card>

              {/* Secondary Option */}
              <div className="flex items-center justify-center mt-4">
                <button
                  onClick={() => setStep('manual')}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
                  data-testid="button-search-item"
                >
                  Search item / Paste link
                </button>
              </div>

              {/* Bottom Note */}
              <p className="text-xs text-muted-foreground text-center mt-4">
                We check sold prices and calculate profit after fees.
              </p>

              {/* Hottest This Week Section */}
              <HottestThisWeek />

              {/* Pro Features Section - 2 Column Grid */}
              <div className="mt-6 pt-4 border-t border-border/50">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Power Tools</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {/* Deep Scan */}
                <Card 
                  className="p-3 cursor-pointer hover-elevate border-blue-500/20"
                  onClick={() => setStep('camera')}
                  data-testid="card-deep-scan"
                >
                  <div className="flex flex-col items-center text-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <ScanLine className="w-5 h-5 text-blue-500" />
                    </div>
                    <span className="font-semibold text-sm">Deep Scan</span>
                  </div>
                </Card>

                {/* Yard Sale Mode */}
                <Card 
                  className={`p-3 cursor-pointer hover-elevate border-orange-500/20 ${!isPro ? 'opacity-70' : ''}`}
                  onClick={() => setLocation('/yard-sale')}
                  data-testid="card-yard-sale-mode"
                >
                  <div className="flex flex-col items-center text-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                      <ShoppingBag className="w-5 h-5 text-orange-500" />
                    </div>
                    <span className="font-semibold text-sm">Yard Sale</span>
                  </div>
                </Card>

                {/* Open Market */}
                <Card 
                  className="p-3 cursor-pointer hover-elevate border-slate-400/20 dark:border-slate-600/20"
                  onClick={() => setLocation('/open-market')}
                  data-testid="card-open-market"
                >
                  <div className="flex flex-col items-center text-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-slate-400/10 dark:bg-slate-600/10 flex items-center justify-center">
                      <Globe className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                    </div>
                    <span className="font-semibold text-sm">Open Market</span>
                  </div>
                </Card>

                {/* Batch Scan */}
                <Card 
                  className={`p-3 cursor-pointer hover-elevate border-amber-500/20 ${!isPro ? 'opacity-70' : ''}`}
                  onClick={() => setLocation('/batch')}
                  data-testid="card-batch-scan"
                >
                  <div className="flex flex-col items-center text-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                      <Layers className="w-5 h-5 text-amber-500" />
                    </div>
                    <span className="font-semibold text-sm">Batch Scan</span>
                  </div>
                </Card>

                {/* Card Grading */}
                <Card 
                  className={`p-3 cursor-pointer hover-elevate border-emerald-500/30 ${!isPro ? 'opacity-80' : ''}`}
                  onClick={() => setLocation('/card-grading')}
                  data-testid="card-grading"
                >
                  <div className="flex flex-col items-center text-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                      <Award className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div>
                      <span className="font-semibold text-sm block">Card Grading</span>
                      <Badge variant="outline" className="text-[10px] mt-1 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">NEW</Badge>
                    </div>
                  </div>
                </Card>

                {/* Profit Dashboard */}
                <Card 
                  className="p-3 cursor-pointer hover-elevate border-blue-500/20"
                  onClick={() => setLocation('/dashboard')}
                  data-testid="card-profit-dashboard"
                >
                  <div className="flex flex-col items-center text-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <Trophy className="w-5 h-5 text-blue-500" />
                    </div>
                    <span className="font-semibold text-sm">Dashboard</span>
                  </div>
                </Card>
              </div>

              {/* Stats Footer */}
              <div className="mt-6 pt-4 border-t border-border/30 space-y-2">
                <div className="flex items-center justify-center gap-4">
                  {scanStatus && scanStatus.tier === 'free' && <ScanTokens />}
                  <EfficiencyScore />
                </div>
                <p className="text-xs text-muted-foreground/50 text-center">
                  One avoided mistake pays for Margin.
                </p>
              </div>
            </motion.div>
          ) : step === 'manual' ? (
            <motion.div
              key="manual-step"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="flex items-center mb-6">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setStep('url')}
                  data-testid="button-back-manual"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <h1 className="text-xl font-display font-bold ml-2">Search or Paste Link</h1>
              </div>

              <Card className="p-5 border-border shadow-lg">
                <form onSubmit={handleAnalyzeInput} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="manual-input" className="text-sm font-medium">eBay Link or Item Name</label>
                    <div className="relative">
                      <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="manual-input"
                        data-testid="input-manual"
                        value={url}
                        onChange={(e) => {
                          setUrl(e.target.value);
                          if (error) setError(null);
                        }}
                        placeholder="Paste eBay link or type item name..."
                        className="pl-9 h-12 text-base bg-background"
                        disabled={isPending || textQueryLoading}
                        autoComplete="off"
                        autoFocus
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Paste an eBay listing URL or type an item name to search
                    </p>
                  </div>
                  
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                      >
                        <ApiErrorDisplay 
                          error={error} 
                          onRetry={() => { setError(null); }}
                          onDismiss={() => setError(null)}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <Button 
                    type="submit" 
                    data-testid="button-analyze-manual"
                    className="w-full h-12 font-semibold"
                    disabled={isPending || textQueryLoading || !url || (scanStatus?.tier === 'free' && scanStatus?.scansRemaining === 0)}
                  >
                    {extractMutation.isPending || textQueryLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      "Analyze"
                    )}
                  </Button>
                </form>
              </Card>
            </motion.div>
          ) : step === 'camera' ? (
            <motion.div
              key="camera-step"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <CameraScan
                onCandidateConfirmed={handleCameraConfirm}
                onManualEntry={handleManualEntry}
                onCancel={() => setStep('url')}
              />
            </motion.div>
          ) : step === 'text-confirm' ? (
            <motion.div
              key="text-confirm-step"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="flex items-center mb-6">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={handleBack}
                  disabled={textQueryLoading}
                  data-testid="button-back-text"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <h1 className="text-2xl font-display font-bold ml-2">Deep Scan</h1>
              </div>

              <Card className="p-4 mb-6 border-primary/30 bg-primary/5">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-primary">Market Analysis</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      This will analyze sold prices for similar items. Select a category and refine the item name if needed.
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-6 border-border shadow-lg">
                <form onSubmit={handleTextQueryAnalyze} className="space-y-5">
                  <div className="space-y-2">
                    <label htmlFor="text-title" className="text-sm font-medium">Item Name *</label>
                    <Textarea
                      id="text-title"
                      data-testid="input-text-title"
                      value={confirmedTitle}
                      onChange={(e) => setConfirmedTitle(e.target.value)}
                      placeholder="Enter item name or description"
                      className="min-h-[60px] resize-none text-base"
                      disabled={textQueryLoading}
                      rows={2}
                    />
                    <p className="text-xs text-muted-foreground">
                      Be specific: include brand, model, year, condition keywords
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="text-category" className="text-sm font-medium">Category *</label>
                    <Select 
                      value={category} 
                      onValueChange={(v) => handleCategoryChange(v as Category)}
                      disabled={textQueryLoading}
                    >
                      <SelectTrigger id="text-category" data-testid="select-text-category" className="h-12">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat} data-testid={`option-text-${cat.toLowerCase().replace(' ', '-')}`}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                      >
                        <ApiErrorDisplay 
                          error={error} 
                          onRetry={() => { setError(null); }}
                          onDismiss={() => setError(null)}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="pt-2">
                    <Button 
                      type="submit"
                      className="w-full h-12 font-semibold"
                      disabled={textQueryLoading || !confirmedTitle || !category}
                      data-testid="button-text-analyze"
                    >
                      {textQueryLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Checking Sold Prices...
                        </>
                      ) : (
                        <>
                          <Zap className="mr-2 h-4 w-4" />
                          Analyze Market Data
                        </>
                      )}
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground text-center">
                    Results are based on recent sold listings for similar items
                  </p>
                </form>
              </Card>
            </motion.div>
          ) : step === 'user-comps' ? (
            <motion.div
              key="user-comps-step"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="h-full"
            >
              <UserSelectedCompsMode
                initialQuery={confirmedTitle || ""}
                buyPrice={confirmedPrice ? Number(confirmedPrice) : 0}
                shippingIn={confirmedShipping ? Number(confirmedShipping.replace(/[^0-9.]/g, '')) : 0}
                onBack={() => setStep(extractedItem ? 'confirm' : 'url')}
                onComplete={(result) => {
                  console.log('[UserComps] Calculation complete:', result);
                }}
              />
            </motion.div>
          ) : (
            <motion.div
              key="confirm-step"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="flex items-center mb-6">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={handleBack}
                  disabled={isPending}
                  data-testid="button-back"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <h1 className="text-2xl font-display font-bold ml-2">Confirm Item Details</h1>
              </div>

              <Card className="p-4 mb-6 border-primary/30 bg-primary/5">
                <div className="flex items-start gap-3">
                  <Edit2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-primary">Review Required</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Please confirm or edit the item title and select a category before analysis.
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-6 border-border shadow-lg">
                <form onSubmit={handleConfirmAndAnalyze} className="space-y-5">
                  <div className="space-y-2">
                    <label htmlFor="title" className="text-sm font-medium">Item Title *</label>
                    <ProductAutocomplete
                      value={confirmedTitle}
                      onChange={(val) => {
                        setConfirmedTitle(val);
                        // Auto-detect Funko from title
                        if (val.toLowerCase().includes('funko') && !funkoLine) {
                          setFunkoLine('Funko Pop');
                        }
                      }}
                      onSelect={(product) => {
                        setConfirmedTitle(product.displayName);
                        if (product.category === 'Watches' || product.category === 'Shoes' || product.category === 'Electronics') {
                          setCategory(product.category as Category);
                          setSuggestedCategory(product.category as Category);
                        }
                      }}
                      placeholder="Type brand or product name (e.g., Invicta, Jordan, Funko Pop)"
                      disabled={isPending}
                    />
                    <p className="text-xs text-muted-foreground">
                      Start typing to see suggestions from our product database
                    </p>
                  </div>

                  {/* Funko Pop Structured Entry Fields */}
                  {isFunkoItem && (
                    <div className="p-4 border border-primary/20 bg-primary/5 rounded-lg">
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Layers className="w-4 h-4 text-primary" />
                          <span className="text-sm font-medium text-primary">Funko Pop Details</span>
                        </div>
                        
                        <div className="space-y-2">
                          <label htmlFor="funko-line" className="text-sm font-medium">Line / Series</label>
                          <Select 
                            value={funkoLine} 
                            onValueChange={setFunkoLine}
                            disabled={isPending}
                          >
                            <SelectTrigger id="funko-line" data-testid="select-funko-line" className="h-10">
                              <SelectValue placeholder="Select Funko line" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Funko Pop - Movies">Funko Pop - Movies</SelectItem>
                              <SelectItem value="Funko Pop - TV">Funko Pop - TV</SelectItem>
                              <SelectItem value="Funko Pop - Marvel">Funko Pop - Marvel</SelectItem>
                              <SelectItem value="Funko Pop - DC">Funko Pop - DC</SelectItem>
                              <SelectItem value="Funko Pop - Disney">Funko Pop - Disney</SelectItem>
                              <SelectItem value="Funko Pop - Star Wars">Funko Pop - Star Wars</SelectItem>
                              <SelectItem value="Funko Pop - Anime">Funko Pop - Anime</SelectItem>
                              <SelectItem value="Funko Pop - Games">Funko Pop - Games</SelectItem>
                              <SelectItem value="Funko Pop - Sports">Funko Pop - Sports</SelectItem>
                              <SelectItem value="Funko Pop - Music">Funko Pop - Music</SelectItem>
                              <SelectItem value="Funko Pop - Icons">Funko Pop - Icons</SelectItem>
                              <SelectItem value="Funko Pop - Animation">Funko Pop - Animation</SelectItem>
                              <SelectItem value="Funko Pop">Funko Pop (Other)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <label htmlFor="funko-character" className="text-sm font-medium">Character / Name</label>
                          <Input
                            id="funko-character"
                            data-testid="input-funko-character"
                            value={funkoCharacter}
                            onChange={(e) => setFunkoCharacter(e.target.value)}
                            placeholder="e.g., Hannibal, Spider-Man, Baby Yoda"
                            className="h-10"
                            disabled={isPending}
                          />
                        </div>

                        <div className="space-y-2">
                          <label htmlFor="funko-number" className="text-sm font-medium">Pop Number</label>
                          <Input
                            id="funko-number"
                            data-testid="input-funko-number"
                            value={funkoNumber}
                            onChange={(e) => setFunkoNumber(e.target.value)}
                            placeholder="e.g., #1248"
                            className="h-10"
                            disabled={isPending}
                          />
                        </div>

                        {(funkoLine || funkoCharacter || funkoNumber) && (
                          <div className="pt-2 border-t border-primary/10">
                            <p className="text-xs text-muted-foreground">Search query will be:</p>
                            <p className="text-sm font-medium text-primary mt-1">
                              {[funkoLine, funkoCharacter, funkoNumber].filter(Boolean).join(' ')}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Watch Color Selection Fields */}
                  {isWatchItem && (
                    <div className="p-4 border border-primary/20 bg-primary/5 rounded-lg">
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Watch className="w-4 h-4 text-primary" />
                          <span className="text-sm font-medium text-primary">Watch Details (Required)</span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label htmlFor="watch-bezel-color" className="text-sm font-medium">Bezel Color *</label>
                            <Select 
                              value={watchBezelColor} 
                              onValueChange={setWatchBezelColor}
                              disabled={isPending}
                            >
                              <SelectTrigger id="watch-bezel-color" data-testid="select-bezel-color" className="h-10">
                                <SelectValue placeholder="Select bezel color" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="black">Black</SelectItem>
                                <SelectItem value="blue">Blue</SelectItem>
                                <SelectItem value="green">Green</SelectItem>
                                <SelectItem value="red">Red</SelectItem>
                                <SelectItem value="gold">Gold</SelectItem>
                                <SelectItem value="silver">Silver</SelectItem>
                                <SelectItem value="rose-gold">Rose Gold</SelectItem>
                                <SelectItem value="two-tone">Two-Tone</SelectItem>
                                <SelectItem value="white">White</SelectItem>
                                <SelectItem value="orange">Orange</SelectItem>
                                <SelectItem value="pepsi">Pepsi (Blue/Red)</SelectItem>
                                <SelectItem value="batman">Batman (Blue/Black)</SelectItem>
                                <SelectItem value="root-beer">Root Beer (Brown)</SelectItem>
                                <SelectItem value="coke">Coke (Black/Red)</SelectItem>
                                <SelectItem value="ceramic">Ceramic</SelectItem>
                                <SelectItem value="no-bezel">No Bezel / Fixed</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <label htmlFor="watch-dial-color" className="text-sm font-medium">Dial Color *</label>
                            <Select 
                              value={watchDialColor} 
                              onValueChange={setWatchDialColor}
                              disabled={isPending}
                            >
                              <SelectTrigger id="watch-dial-color" data-testid="select-dial-color" className="h-10">
                                <SelectValue placeholder="Select dial color" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="black">Black</SelectItem>
                                <SelectItem value="blue">Blue</SelectItem>
                                <SelectItem value="green">Green</SelectItem>
                                <SelectItem value="white">White</SelectItem>
                                <SelectItem value="silver">Silver</SelectItem>
                                <SelectItem value="gold">Gold/Champagne</SelectItem>
                                <SelectItem value="mother-of-pearl">Mother of Pearl</SelectItem>
                                <SelectItem value="blue-mother-of-pearl">Blue Mother of Pearl</SelectItem>
                                <SelectItem value="gray">Gray/Anthracite</SelectItem>
                                <SelectItem value="brown">Brown/Chocolate</SelectItem>
                                <SelectItem value="cream">Cream/Ivory</SelectItem>
                                <SelectItem value="red">Red/Burgundy</SelectItem>
                                <SelectItem value="skeleton">Skeleton/Open</SelectItem>
                                <SelectItem value="panda">Panda (White/Black)</SelectItem>
                                <SelectItem value="reverse-panda">Reverse Panda (Black/White)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {(!watchBezelColor || !watchDialColor) && (
                          <p className="text-xs text-destructive">
                            Both bezel and dial colors are required for accurate watch pricing
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label htmlFor="category" className="text-sm font-medium">Category *</label>
                      {suggestedCategory && category === suggestedCategory && (
                        <Badge variant="secondary" className="text-xs gap-1 bg-primary/10 text-primary border-primary/20" data-testid="badge-suggested">
                          <Sparkles className="w-3 h-3" />
                          Suggested
                        </Badge>
                      )}
                    </div>
                    <Select 
                      value={category} 
                      onValueChange={(v) => handleCategoryChange(v as Category)}
                      disabled={isPending}
                    >
                      <SelectTrigger id="category" data-testid="select-category" className="h-12">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat} data-testid={`option-${cat.toLowerCase().replace(' ', '-')}`}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label htmlFor="price" className="text-sm font-medium">Price</label>
                      <Input
                        id="price"
                        type="number"
                        inputMode="decimal"
                        data-testid="input-price"
                        value={confirmedPrice}
                        onChange={(e) => setConfirmedPrice(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'e' || e.key === 'E' || e.key === '+' || e.key === '-') {
                            e.preventDefault();
                          }
                        }}
                        placeholder="0.00"
                        className="h-12"
                        disabled={isPending}
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="shipping" className="text-sm font-medium">Shipping</label>
                      <Input
                        id="shipping"
                        data-testid="input-shipping"
                        value={shippingDisplayValue}
                        onChange={(e) => {
                          const val = e.target.value;
                          // If user types "free", set to "Free"
                          if (val.toLowerCase() === "free") {
                            setConfirmedShipping("Free");
                          } else {
                            setConfirmedShipping(val);
                          }
                        }}
                        onFocus={() => {
                          setShippingFocused(true);
                          // When focusing on unknown, clear the field for editing
                          if (!confirmedShipping || confirmedShipping.toLowerCase() === "unknown") {
                            setConfirmedShipping("");
                          }
                          // Keep "Free" and numeric values as-is for editing
                        }}
                        onBlur={() => {
                          setShippingFocused(false);
                          // On blur, normalize the value but preserve unverified state
                          const val = confirmedShipping.trim();
                          if (val === "" || val.toLowerCase() === "unknown") {
                            // Leave empty to show "Tap to verify" - calculations will use 0
                            setConfirmedShipping("");
                          } else if (val.toLowerCase() === "free" || val === "0" || val === "0.00" || val === "0.0") {
                            // Normalize to "Free" for explicit free shipping
                            setConfirmedShipping("Free");
                          }
                          // Otherwise keep the numeric value as-is
                        }}
                        placeholder="Enter amount or Free"
                        className="h-12"
                        disabled={isPending}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="condition" className="text-sm font-medium">Condition</label>
                    <Select 
                      value={confirmedCondition} 
                      onValueChange={setConfirmedCondition}
                      disabled={isPending}
                    >
                      <SelectTrigger id="condition" data-testid="select-condition" className="h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="New">New</SelectItem>
                        <SelectItem value="Open Box">Open Box</SelectItem>
                        <SelectItem value="Used">Used</SelectItem>
                        <SelectItem value="Parts">Parts</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="pt-2 border-t border-border">
                    <ManualCompsInput
                      value={manualComps}
                      onChange={setManualComps}
                      itemTitle={confirmedTitle}
                    />
                  </div>

                  <div className="flex items-start gap-3 pt-2">
                    <input
                      type="checkbox"
                      id="confirm-details"
                      data-testid="checkbox-confirm"
                      checked={detailsConfirmed}
                      onChange={(e) => setDetailsConfirmed(e.target.checked)}
                      disabled={isPending}
                      className="mt-1 h-4 w-4 rounded border-primary text-primary focus:ring-primary accent-primary"
                    />
                    <label 
                      htmlFor="confirm-details" 
                      className="text-sm text-muted-foreground cursor-pointer leading-tight"
                    >
                      I confirm these item details are correct
                    </label>
                  </div>

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                      >
                        <ApiErrorDisplay 
                          error={error} 
                          onRetry={() => { setError(null); }}
                          onDismiss={() => setError(null)}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {(!confirmedTitle || !category || !detailsConfirmed) && !isPending && (
                    <p className="text-sm text-amber-600 dark:text-teal-400 flex items-center pl-1">
                      <AlertCircle className="w-3 h-3 mr-1.5 flex-shrink-0" />
                      {!confirmedTitle ? "Enter an item title" : !category ? "Select a category" : "Check the confirmation box"}
                    </p>
                  )}

                  <Button 
                    type="submit" 
                    data-testid="button-analyze"
                    size="lg" 
                    className="w-full h-14 text-lg font-bold shadow-xl hover:shadow-2xl transition-all hover:-translate-y-0.5"
                    disabled={isPending || !confirmedTitle || !category || !detailsConfirmed}
                  >
                    {confirmMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="mr-2 h-5 w-5" />
                        Confirm & Analyze
                      </>
                    )}
                  </Button>

                  <div className="text-center pt-4 border-t border-border mt-4">
                    <button
                      type="button"
                      onClick={() => setStep('user-comps')}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors underline-offset-4 hover:underline"
                      data-testid="link-choose-own-comps"
                    >
                      Use Research Mode
                    </button>
                    <p className="text-xs text-muted-foreground mt-1">
                      For antiques, vintage, and unique items requiring hands-on comparison
                    </p>
                  </div>
                </form>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
      <BottomNav />
    </div>
    </>
  );
}
