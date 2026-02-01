import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, Upload, Loader2, CheckCircle, AlertCircle, ChevronRight, ChevronLeft, ScanBarcode, Watch, Package, PackageOpen, HelpCircle, Search } from "lucide-react";
import { BarcodeScanner, type BarcodeProduct } from "./BarcodeScanner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { saveLearningData } from "@/lib/learning";
import type { ScanCandidate } from "@shared/schema";
import { type CardParallel, parseCardTitle } from "@shared/cardParallels";

interface CameraScanProps {
  onCandidateConfirmed: (candidate: ScanCandidate) => void;
  onManualEntry: () => void;
  onCancel: () => void;
}

function getConfidenceLabel(confidence: number, category?: string): { 
  tier: 'high' | 'medium' | 'low';
  label: string; 
  color: string;
  action: string;
} {
  // For toys, never show low confidence - minimum is medium
  const isToyCategory = category?.toLowerCase().includes('toy') || 
                        category?.toLowerCase().includes('funko') ||
                        category?.toLowerCase().includes('collectible');
  
  // If we identified a toy category, boost minimum confidence tier to medium
  const effectiveConfidence = isToyCategory && confidence < 50 ? 50 : confidence;
  
  if (effectiveConfidence >= 70) {
    return { 
      tier: 'high',
      label: "High Confidence", 
      color: "bg-green-500/10 text-green-400 border-green-500/20",
      action: "Recommended to proceed"
    };
  } else if (effectiveConfidence >= 50) {
    return { 
      tier: 'medium',
      label: "Medium Confidence", 
      color: "bg-amber-50 text-amber-700 border-amber-200",
      action: "Tap to confirm"
    };
  }
  return { 
    tier: 'low',
    label: "Low Confidence", 
    color: "bg-secondary text-muted-foreground border-border",
    action: "Consider rescanning"
  };
}

function isSportsCardCategory(category: string): boolean {
  // Only sports cards require back photo - TCG cards don't need it for now
  return category.toLowerCase() === 'sports cards';
}

function isAnyCardCategory(category: string): boolean {
  const cardCategories = ['sports cards', 'tcg cards'];
  return cardCategories.includes(category.toLowerCase());
}

function isWatchCategory(category: string): boolean {
  return category.toLowerCase() === 'watches';
}

type ScanStep = 'capture' | 'captureBack' | 'identifying' | 'select' | 'selectModel' | 'selectWatchColors' | 'selectParallel' | 'selectWatchCompleteness' | 'brandRequired' | 'error' | 'barcode' | 'imageQuality';

interface ModelCandidate {
  familyId: number;
  family: string;
  displayName: string;
  score: number;
}

type WatchCompleteness = 'FULL_SET' | 'WATCH_ONLY' | 'UNKNOWN';

export function CameraScan({ onCandidateConfirmed, onManualEntry, onCancel }: CameraScanProps) {
  const [step, setStep] = useState<ScanStep>('capture');
  const [candidates, setCandidates] = useState<ScanCandidate[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<ScanCandidate | null>(null);
  const [parallels, setParallels] = useState<CardParallel[]>([]);
  const [selectedParallel, setSelectedParallel] = useState<string | null>(null);
  const [loadingParallels, setLoadingParallels] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [watchCompleteness, setWatchCompleteness] = useState<WatchCompleteness>('UNKNOWN');
  const [brandAlternatives, setBrandAlternatives] = useState<string[]>([]);
  const [modelCandidates, setModelCandidates] = useState<ModelCandidate[]>([]);
  const [detectedBrand, setDetectedBrand] = useState<string | null>(null);
  const [selectedBezelColor, setSelectedBezelColor] = useState<string | null>(null);
  const [selectedDialColor, setSelectedDialColor] = useState<string | null>(null);
  const [selectedDialStyle, setSelectedDialStyle] = useState<string | null>(null);
  
  // Card front/back scanning
  const [scanMode, setScanMode] = useState<'general' | 'card'>('general');
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const backCameraInputRef = useRef<HTMLInputElement>(null);

  const processImage = useCallback(async (base64: string, backImageBase64?: string) => {
    setPreviewUrl(base64);
    setStep('identifying');

    try {
      const response = await apiRequest("POST", "/api/scan-sessions/identify", {
        imageBase64: base64,
        backImageBase64: backImageBase64, // Optional back image for cards
      });

      const data = await response.json();
      
      // Handle BRAND_REQUIRED - watch detected but brand unreadable
      if (data.brandRequired) {
        console.log('[Watch Scan] Brand unreadable - prompting for retry or manual entry');
        setSessionId(data.sessionId);
        setBrandAlternatives(data.brandAlternatives || []);
        setFrontImage(base64);
        setStep('brandRequired');
        return;
      }
      
      // ============ TOY PIPELINE HANDLING ============
      // Handle 5-stage toy pipeline response with confidence-gated UI
      if (data.toyPipeline) {
        const tier = data.toyPipeline.confidenceTier;
        console.log(`[Toy Pipeline] Confidence tier: ${tier}, Final: ${(data.toyPipeline.finalConfidence * 100).toFixed(0)}%`);
        
        setCandidates(data.candidates);
        setSessionId(data.sessionId);
        setFrontImage(base64);
        
        if (tier === 'LOW') {
          // <60%: Show generic label, require manual entry
          console.log('[Toy Pipeline] LOW confidence - prompting manual entry');
          setStep('select');
          return;
        } else if (tier === 'MEDIUM') {
          // 60-79%: Show type + franchise only
          console.log('[Toy Pipeline] MEDIUM confidence - showing type only');
          setStep('select');
          return;
        } else if (tier === 'HIGH') {
          // 80-89%: Show up to 3 candidates with selection
          console.log('[Toy Pipeline] HIGH confidence - showing candidates for selection');
          setStep('select');
          return;
        } else {
          // >=90%: Auto-confirm (but still show select for safety)
          console.log('[Toy Pipeline] CONFIRMED confidence - auto-confirm ready');
          setStep('select');
          return;
        }
      }
      
      if (data.candidates && data.candidates.length > 0) {
        // Check if boxed Funko Pop requires UPC scan
        if (data.requiresUpcScan) {
          console.log('[Funko Scan] Boxed Funko Pop detected - prompting for UPC scan');
          setCandidates(data.candidates);
          setSessionId(data.sessionId);
          setFrontImage(base64);
          // Show barcode step UI with option to scan or skip - do NOT auto-open scanner
          setStep('barcode');
          return;
        }
        
        // Check if watch needs model selection (brand confirmed but model unclear)
        const firstCandidate = data.candidates[0];
        if (firstCandidate?.needsModelSelection && firstCandidate?.modelCandidates?.length > 0) {
          console.log('[Watch Scan] Model selection needed - showing candidates');
          setCandidates(data.candidates);
          setSessionId(data.sessionId);
          setFrontImage(base64);
          setDetectedBrand(firstCandidate.brandDetected || firstCandidate.title);
          setModelCandidates(firstCandidate.modelCandidates);
          setStep('selectModel');
          return;
        }
        
        // Check if ANY candidate is a sports card and we don't have back image yet
        const hasSportsCard = data.candidates.some((c: ScanCandidate) => 
          isSportsCardCategory(c.category)
        );
        
        // If it's a sports card and we don't have the back image, prompt for it
        if (hasSportsCard && !backImageBase64) {
          console.log('[Card Scan] Sports card detected - prompting for back photo');
          setFrontImage(base64);
          setCandidates(data.candidates);
          setSessionId(data.sessionId);
          setStep('captureBack');
          return;
        }
        
        setCandidates(data.candidates);
        setSessionId(data.sessionId);
        setStep('select');
      } else {
        setError("Could not identify the item. Try a clearer photo or different angle.");
        setStep('error');
      }
    } catch (err: any) {
      console.error("Identify error:", err);
      
      // Check for image quality error
      if (err.message?.includes("IMAGE_QUALITY_LOW") || err.message?.includes("quality too low")) {
        setError("Image is blurry or unclear. Please retake the photo or enter details manually.");
        setStep('imageQuality');
        return;
      }
      
      if (err.message?.includes("429") || err.message?.includes("limit")) {
        setError("Daily scan limit reached. Upgrade to Pro for unlimited scans.");
      } else {
        setError("Failed to analyze image. Please try again.");
      }
      setStep('error');
    }
  }, []);
  
  // Process card with front+back
  const processCardImages = useCallback(async () => {
    if (!frontImage) return;
    await processImage(frontImage, backImage || undefined);
  }, [frontImage, backImage, processImage]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError("Please select an image file");
      return;
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setError("Image is too large. Please use an image under 10MB.");
      return;
    }

    setError(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      
      // If we're in captureBack step, this is the back image
      if (step === 'captureBack' && frontImage) {
        setBackImage(base64);
        setStep('identifying');
        // Re-process with both images for better identification
        await processImage(frontImage, base64);
      } else {
        // Regular scan - process immediately (will auto-detect cards and prompt for back)
        setFrontImage(null);
        setBackImage(null);
        processImage(base64);
      }
    };

    reader.onerror = () => {
      setError("Failed to read image file");
      setStep('error');
    };

    reader.readAsDataURL(file);
    
    e.target.value = '';
  }, [processImage, step, frontImage]);
  
  // Handle back image capture for cards
  const handleBackImageCapture = useCallback(() => {
    backCameraInputRef.current?.click();
  }, []);
  
  // Skip back photo and continue with candidates we already have
  const skipBackPhoto = useCallback(() => {
    // We already have candidates from the first scan, just go to select
    if (candidates.length > 0) {
      setStep('select');
    }
  }, [candidates]);
  
  // Start card scanning mode (legacy - now happens automatically)
  const startCardScan = useCallback(() => {
    setScanMode('card');
    setFrontImage(null);
    setBackImage(null);
    cameraInputRef.current?.click();
  }, []);

  const handleScanClick = useCallback(() => {
    setError(null);
    cameraInputRef.current?.click();
  }, []);

  const handleUploadClick = useCallback(() => {
    setError(null);
    galleryInputRef.current?.click();
  }, []);

  const fetchParallels = async (candidate: ScanCandidate) => {
    console.log('[Card Parallels] Fetching for candidate:', candidate.title, 'cardMeta:', candidate.cardMeta);
    
    // Try to get cardMeta from candidate, or parse from title as fallback
    let meta = candidate.cardMeta;
    if (!meta || (!meta.set && !meta.brand)) {
      // No cardMeta or missing essential fields - try parsing from title
      console.log('[Card Parallels] cardMeta missing or incomplete, parsing from title');
      const parsed = parseCardTitle(candidate.title);
      console.log('[Card Parallels] Parsed from title:', parsed);
      meta = {
        ...meta,
        brand: meta?.brand || parsed.brand,
        set: meta?.set || parsed.set,
        year: meta?.year || parsed.year,
        playerName: meta?.playerName || parsed.playerName,
        detectedParallel: meta?.detectedParallel || parsed.parallel,
      };
    }
    
    // If still no set/brand, return empty (can't look up parallels)
    if (!meta?.set && !meta?.brand) {
      console.log('[Card Parallels] Still no set/brand after parsing, returning empty');
      return [];
    }
    
    setLoadingParallels(true);
    try {
      const params = new URLSearchParams();
      if (meta.brand) params.set('brand', meta.brand);
      if (meta.set) params.set('set', meta.set);
      if (meta.year) params.set('year', meta.year.toString());
      if (meta.sport) params.set('sport', meta.sport);
      
      console.log('[Card Parallels] API params:', params.toString());
      
      const response = await apiRequest("GET", `/api/card-parallels?${params.toString()}`);
      const data = await response.json();
      console.log('[Card Parallels] API response:', data.parallels?.length, 'parallels');
      return data.parallels || [];
    } catch (err) {
      console.error("Failed to fetch parallels:", err);
      return [];
    } finally {
      setLoadingParallels(false);
    }
  };

  // Map serial number denominator to parallel ID
  const getParallelFromSerial = (serialNumber?: string, isAutograph?: boolean): string | null => {
    if (!serialNumber) return null;
    
    const match = serialNumber.match(/\/(\d+)$/);
    if (!match) return null;
    
    const denom = parseInt(match[1]);
    
    // For autograph cards
    if (isAutograph) {
      if (denom === 1) return 'rookie-scripts-black';
      if (denom === 10) return 'rookie-scripts-gold';
      return 'rookie-scripts'; // Base auto
    }
    
    // For regular parallels (Mosaic)
    const serialToParallel: Record<number, string> = {
      1: 'black', // or 'nebula'
      5: 'red',
      8: 'black-gold',
      9: 'red-wave',
      10: 'gold',
      11: 'green-swirl', // or pink-swirl
      15: 'blue-fluorescent', // or tessellation
      17: 'gold-wave',
      25: 'orange-fluorescent', // or white
      49: 'purple',
      80: 'fusion-red-yellow',
      99: 'blue',
    };
    
    return serialToParallel[denom] || null;
  };

  // Filter parallels based on detected type (e.g., show only autograph variants if an auto was detected)
  const filterParallelsByType = (allParallels: CardParallel[], detectedParallel?: string, serialNumber?: string, isAutograph?: boolean): CardParallel[] => {
    // Helper to create a detected parallel entry if not in the list
    const createDetectedParallelEntry = (parallelId: string): CardParallel => {
      const label = parallelId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return { id: parallelId, label: `${label} (Detected)`, rarity: 'rare' as const };
    };
    
    // Try to determine parallel from serial number first (most accurate)
    const serialParallel = getParallelFromSerial(serialNumber, isAutograph);
    if (serialParallel) {
      const exactMatch = allParallels.find(p => p.id === serialParallel);
      if (exactMatch) {
        console.log('[Card Parallels] Exact match from serial number:', serialParallel);
        // Return the exact match plus a few alternatives
        const alternatives = allParallels.filter(p => 
          p.numbered === `/${serialNumber?.split('/')[1]}` || // Same numbering
          p.id === detectedParallel
        );
        return [exactMatch, ...alternatives.filter(a => a.id !== exactMatch.id)].slice(0, 5);
      }
    }
    
    if (!detectedParallel) return allParallels;
    
    // If it's an autograph card, show only autograph-related parallels
    const isAutographType = ['rookie-scripts', 'scripts', 'auto'].includes(detectedParallel) || isAutograph;
    
    if (isAutographType) {
      // Filter to show only autograph parallels that match the detected type
      const autoParallels = allParallels.filter(p => 
        p.id.includes('script') || 
        p.id.includes('auto') ||
        p.id === detectedParallel
      );
      
      // If we found matching autograph parallels, return them
      if (autoParallels.length > 0) {
        console.log('[Card Parallels] Filtered to', autoParallels.length, 'autograph variants');
        return autoParallels;
      }
    }
    
    // Check if detected parallel exists in the list - if not, add it at the top
    const detectedExists = allParallels.some(p => p.id === detectedParallel);
    if (!detectedExists && detectedParallel) {
      console.log('[Card Parallels] Detected parallel not in list, adding:', detectedParallel);
      return [createDetectedParallelEntry(detectedParallel), ...allParallels];
    }
    
    // For color parallels, show all (user can pick the exact one)
    return allParallels;
  };

  const handleCandidateSelect = async (candidate: ScanCandidate) => {
    if (!sessionId || isConfirming) return;

    // Watches get completeness prompt
    if (isWatchCategory(candidate.category)) {
      setSelectedCandidate(candidate);
      setWatchCompleteness('UNKNOWN');
      setStep('selectWatchCompleteness');
      return;
    }

    if (isSportsCardCategory(candidate.category)) {
      setSelectedCandidate(candidate);
      const fetchedParallels = await fetchParallels(candidate);
      
      // Get detected parallel from cardMeta or parse from title
      const detectedParallel = candidate.cardMeta?.detectedParallel || 
        parseCardTitle(candidate.title).parallel;
      
      // Get serial number and autograph status from cardMeta
      const serialNumber = candidate.cardMeta?.serialNumber;
      const isAutograph = candidate.cardMeta?.isAutograph;
      
      console.log('[Card Parallels] Serial number:', serialNumber, 'isAutograph:', isAutograph);
      
      // Filter parallels to show relevant options based on what was detected
      const filteredParallels = filterParallelsByType(fetchedParallels, detectedParallel, serialNumber, isAutograph);
      setParallels(filteredParallels);
      
      // Try to auto-select based on serial number first
      const serialParallel = getParallelFromSerial(serialNumber, isAutograph);
      if (serialParallel) {
        const exactMatch = filteredParallels.find((p: CardParallel) => p.id === serialParallel);
        if (exactMatch) {
          console.log('[Card Parallels] Auto-selected from serial:', exactMatch.label);
          setSelectedParallel(exactMatch.label);
        }
      } else if (detectedParallel) {
        const detected = filteredParallels.find(
          (p: CardParallel) => p.id === detectedParallel
        );
        if (detected) {
          setSelectedParallel(detected.label);
        }
      } else if (filteredParallels.length > 0) {
        const baseParallel = filteredParallels.find((p: CardParallel) => p.id === 'base');
        setSelectedParallel(baseParallel?.label || filteredParallels[0].label);
      }
      
      setStep('selectParallel');
    } else {
      confirmCandidate(candidate);
    }
  };

  const confirmCandidate = async (candidate: ScanCandidate, parallel?: string, completeness?: WatchCompleteness) => {
    if (!sessionId || isConfirming) return;

    setIsConfirming(true);
    try {
      // For watches, ALWAYS send colorOverride to ensure colors are preserved
      const isWatch = candidate.category === 'Watches';
      const colorOverride = isWatch ? {
        dialColor: candidate.dialColor || selectedDialColor || 'Black',
        bezelColor: candidate.bezelColor || selectedBezelColor || 'Silver',
        dialStyle: candidate.dialStyle || selectedDialStyle || undefined,
      } : undefined;
      
      const response = await apiRequest("POST", `/api/scan-sessions/${sessionId}/confirm`, {
        candidateId: candidate.id,
        selectedParallel: parallel,
        watchCompleteness: completeness,
        colorOverride,
        // Pass the full candidate info for library learning when user corrects/selects model
        candidateOverride: candidate.id === 'model_selected' ? {
          id: candidate.id,
          title: candidate.title,
          category: candidate.category,
          familyId: candidate.familyId,
          confidence: candidate.confidence,
          visionSignals: candidate.visionSignals,
          bezelColor: colorOverride?.bezelColor,
          dialColor: colorOverride?.dialColor,
          dialStyle: colorOverride?.dialStyle,
        } : undefined,
      });
      const data = await response.json();
      onCandidateConfirmed(data.candidate || candidate);
    } catch (err) {
      console.error("Confirm error:", err);
      setError("Failed to confirm selection. Please try again.");
      setIsConfirming(false);
    }
  };

  const handleParallelConfirm = () => {
    if (!selectedCandidate || !selectedParallel) return;
    confirmCandidate(selectedCandidate, selectedParallel);
  };

  const handleWatchCompletenessConfirm = async (completeness: WatchCompleteness) => {
    if (!selectedCandidate) return;
    setWatchCompleteness(completeness);
    
    // Use global learning contract via saveLearningData utility
    await saveLearningData({
      category: 'watch',
      identityConfidence: selectedCandidate.id === 'model_selected' && (selectedCandidate.confidence || 0) >= 70 ? 'HIGH' : 'ESTIMATE',
      identityKey: selectedCandidate.familyId ? parseInt(selectedCandidate.familyId, 10) : null,
      configurationGroup: detectedBrand || undefined,
      attributes: {
        brand: detectedBrand,
        model: selectedCandidate.title,
        dialColor: selectedDialColor,
        dialStyle: selectedDialStyle,
        bezelColor: selectedBezelColor,
        completeness: completeness,
      },
      imageStoragePath: frontImage || previewUrl || undefined,
      scanSessionId: sessionId || undefined,
      isUserConfirmed: true, // This is explicit user confirmation via Confirm button
    });
    
    confirmCandidate(selectedCandidate, undefined, completeness);
  };

  const handleModelSelect = (model: ModelCandidate) => {
    // Get original candidate to preserve backend-provided fields
    const originalCandidate = candidates[0];
    
    // Create updated candidate carrying forward backend fields while swapping model info
    const updatedCandidate: ScanCandidate = {
      ...originalCandidate, // Preserve source, matchStrength, etc.
      id: 'model_selected',
      title: model.displayName,
      category: 'Watches',
      confidence: Math.round(model.score * 100),
      familyId: String(model.familyId),
      visionSignals: [`Model: ${model.family}`, `Brand confirmed: ${detectedBrand}`],
      // Ensure watchMeta is preserved with detected brand
      watchMeta: {
        ...originalCandidate?.watchMeta,
        watchBrand: detectedBrand || originalCandidate?.watchMeta?.watchBrand || null,
        watchFamily: model.family || originalCandidate?.watchMeta?.watchFamily || null,
      },
    };
    
    // Pre-select colors from original candidate's detected values if available
    if (originalCandidate?.bezelColor) {
      setSelectedBezelColor(originalCandidate.bezelColor);
    } else {
      // Default to common color based on brand heuristics
      setSelectedBezelColor('Silver');
    }
    if (originalCandidate?.dialColor) {
      setSelectedDialColor(originalCandidate.dialColor);
    } else {
      setSelectedDialColor('Black');
    }
    if (originalCandidate?.dialStyle) {
      setSelectedDialStyle(originalCandidate.dialStyle);
      setShowDialStyle(true);
    } else {
      setSelectedDialStyle(null);
      setShowDialStyle(false);
    }
    
    // Go to watch colors step (bezel + dial)
    setSelectedCandidate(updatedCandidate);
    setStep('selectWatchColors');
  };

  // Common color options for watches
  const BEZEL_COLORS = ['Black', 'Gold', 'Silver', 'Rose Gold', 'Blue', 'Green', 'Bronze', 'Two Tone'];
  const DIAL_COLORS = ['Black', 'Blue', 'White', 'Green', 'Orange', 'Gold', 'Silver', 'Mother of Pearl', 'Tiffany Blue', 'Carbon Fiber'];
  const DIAL_STYLES = ['Stick', 'Roman', 'Arabic', 'Diamond', 'Skeleton', 'None/Plain'];
  
  // State for collapsing optional dial style section
  const [showDialStyle, setShowDialStyle] = useState(false);

  const handleWatchColorsConfirm = () => {
    if (!selectedCandidate) return;
    
    // Update candidate with color info in visionSignals
    const colorSignals: string[] = [];
    if (selectedBezelColor) colorSignals.push(`Bezel: ${selectedBezelColor}`);
    if (selectedDialColor) colorSignals.push(`Dial: ${selectedDialColor}`);
    if (selectedDialStyle) colorSignals.push(`Style: ${selectedDialStyle}`);
    
    const updatedCandidate: ScanCandidate = {
      ...selectedCandidate,
      visionSignals: [...(selectedCandidate.visionSignals || []), ...colorSignals],
      bezelColor: selectedBezelColor || undefined,
      dialColor: selectedDialColor || undefined,
      dialStyle: selectedDialStyle || undefined,
    };
    
    setSelectedCandidate(updatedCandidate);
    setStep('selectWatchCompleteness');
  };

  const handleBackToSelect = () => {
    setStep('select');
    setSelectedCandidate(null);
    setParallels([]);
    setSelectedParallel(null);
    setWatchCompleteness('UNKNOWN');
  };

  const handleRetry = () => {
    setStep('capture');
    setCandidates([]);
    setError(null);
    setPreviewUrl(null);
    setSessionId(null);
    setSelectedCandidate(null);
    setParallels([]);
    setSelectedParallel(null);
    setWatchCompleteness('UNKNOWN');
    setModelCandidates([]);
    setDetectedBrand(null);
    setSelectedBezelColor(null);
    setSelectedDialColor(null);
    setSelectedDialStyle(null);
  };

  const handleBarcodeClick = useCallback(() => {
    setStep('barcode');
    setShowBarcodeScanner(true);
  }, []);

  const handleBarcodeProductFound = useCallback((product: BarcodeProduct) => {
    setShowBarcodeScanner(false);
    
    // Check if we already have a Funko candidate from photo scan
    const existingFunkoCandidate = candidates.find((c: any) => 
      c.category === 'Funko Pop' || c.title?.toLowerCase().includes('funko')
    );
    
    // Determine category based on existing candidate or product data
    let category = 'Electronics';
    if (existingFunkoCandidate) {
      category = 'Funko Pop';
    } else if (product.platform?.toLowerCase().includes('funko')) {
      category = 'Funko Pop';
    }
    
    const candidate: ScanCandidate = {
      id: `barcode-${product.barcode}`,
      title: product.name,
      category: category as ScanCandidate['category'],
      confidence: 100, // Barcode is exact match
      keyIdentifiers: [
        category === 'Funko Pop' ? 'Funko Pop' : (product.platform || 'Video Game'),
        `UPC: ${product.barcode}`,
        product.prices.cib ? `CIB: $${product.prices.cib.toFixed(2)}` : '',
      ].filter(Boolean),
      estimatedValue: product.prices.cib 
        ? `$${product.prices.cib.toFixed(2)}`
        : product.prices.loose 
          ? `$${product.prices.loose.toFixed(2)}`
          : undefined,
    };
    onCandidateConfirmed(candidate);
  }, [onCandidateConfirmed, candidates]);

  const handleBarcodeScannerCancel = useCallback(() => {
    setShowBarcodeScanner(false);
    // If we have candidates from photo scan, go to select instead of capture
    if (candidates.length > 0) {
      setStep('select');
    } else {
      setStep('capture');
    }
  }, [candidates]);

  return (
    <div className="space-y-6">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
        data-testid="input-camera-capture"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        data-testid="input-gallery-upload"
      />

      <AnimatePresence mode="wait">
        {step === 'capture' && (
          <motion.div
            key="capture"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#22c55e] to-[#4ade80] mb-4 shadow-xl shadow-green-500/20">
                <Camera className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Scan Item</h2>
              <p className="text-muted-foreground text-sm">
                Tap to open camera and take a photo
              </p>
              {error && (
                <div className="mt-3 p-2 bg-destructive/10 text-destructive text-sm rounded-lg">
                  {error}
                </div>
              )}
            </div>

            <Card className="p-6 border-dashed border-2 border-border hover:border-green-500/50 transition-colors">
              <div className="flex flex-col items-center gap-4">
                <Button
                  size="lg"
                  onClick={handleScanClick}
                  className="w-full h-14 bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/20"
                  data-testid="button-take-photo"
                >
                  <Camera className="w-5 h-5 mr-2" />
                  Scan Item
                </Button>
              
                <div className="flex items-center gap-3 w-full">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground uppercase">or</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleUploadClick}
                  className="w-full h-12"
                  data-testid="button-upload-photo"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload from Gallery
                </Button>

                <div className="flex items-center gap-3 w-full">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground uppercase">or</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <Button
                  variant="outline"
                  size="lg"
                  onClick={startCardScan}
                  className="w-full h-12 border-amber-500/50 text-amber-600"
                  data-testid="button-card-scan"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Scan Trading Card (Front + Back)
                </Button>

                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleBarcodeClick}
                  className="w-full h-12"
                  data-testid="button-barcode-scan"
                >
                  <ScanBarcode className="w-4 h-4 mr-2" />
                  Scan Barcode (Games/Cards)
                </Button>
              </div>
            </Card>

            <div className="bg-secondary/50 rounded-lg p-4">
              <h3 className="text-sm font-medium mb-2">Tips for best results:</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-start gap-2">
                  <span className="text-green-400">•</span>
                  Good lighting, avoid shadows
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400">•</span>
                  Show the front of items clearly
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-400">•</span>
                  Center the item in frame
                </li>
              </ul>
            </div>

            <Button
              variant="ghost"
              onClick={onCancel}
              className="w-full"
              data-testid="button-cancel-scan"
            >
              Cancel
            </Button>
          </motion.div>
        )}

        {/* Capture Back of Card */}
        {step === 'captureBack' && (
          <motion.div
            key="captureBack"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="text-center mb-4">
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 mb-3">
                Sports Card Detected
              </Badge>
              <h2 className="text-xl font-bold mb-1">Now Flip the Card</h2>
              <p className="text-sm text-muted-foreground">
                Scan the back to read the card number (e.g., RS-15, /10) for accurate pricing
              </p>
            </div>

            {/* Show front preview */}
            {previewUrl && (
              <div className="w-24 h-32 mx-auto rounded-xl overflow-hidden border-2 border-green-500/50 mb-4">
                <img src={previewUrl} alt="Card front" className="w-full h-full object-cover" />
                <p className="text-xs text-center text-muted-foreground mt-1">Front captured</p>
              </div>
            )}

            <input
              type="file"
              ref={backCameraInputRef}
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
              data-testid="input-back-camera"
            />

            <Button
              size="lg"
              onClick={handleBackImageCapture}
              className="w-full h-14 bg-green-600 hover:bg-green-700"
              data-testid="button-capture-back"
            >
              <Camera className="w-5 h-5 mr-2" />
              Capture Back of Card
            </Button>

            <Button
              variant="outline"
              onClick={skipBackPhoto}
              className="w-full"
              data-testid="button-skip-back"
            >
              Skip (use front only)
            </Button>

            <Button
              variant="ghost"
              onClick={() => {
                setStep('capture');
                setScanMode('general');
                setFrontImage(null);
              }}
              className="w-full"
              data-testid="button-cancel-card-scan"
            >
              Cancel
            </Button>
          </motion.div>
        )}

        {step === 'identifying' && (
          <motion.div
            key="identifying"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="text-center py-12"
          >
            {previewUrl && (
              <div className="flex gap-2 justify-center mb-6">
                <div className="w-24 h-32 rounded-xl overflow-hidden">
                  <img src={previewUrl} alt="Front" className="w-full h-full object-cover" />
                </div>
                {backImage && (
                  <div className="w-24 h-32 rounded-xl overflow-hidden">
                    <img src={backImage} alt="Back" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            )}
            <Loader2 className="w-10 h-10 animate-spin text-green-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Identifying Item...</h3>
            <p className="text-sm text-muted-foreground">
              {backImage ? 'Analyzing front and back...' : 'Using AI to recognize your item'}
            </p>
          </motion.div>
        )}

        {step === 'select' && candidates.length > 0 && (
          <motion.div
            key="select"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Confidence-gated header for toy pipeline */}
            {candidates[0]?.source === 'toy_pipeline' ? (
              <div className="text-center mb-4">
                {candidates[0].requiresManualEntry ? (
                  <>
                    <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
                    <h2 className="text-xl font-bold mb-1">Item Type Detected</h2>
                    <p className="text-sm text-muted-foreground">
                      We detected a {candidates[0].title}. Please enter details manually for accurate pricing.
                    </p>
                  </>
                ) : candidates[0].requiresSelection ? (
                  <>
                    <Search className="w-12 h-12 text-blue-400 mx-auto mb-3" />
                    <h2 className="text-xl font-bold mb-1">Select the Correct Item</h2>
                    <p className="text-sm text-muted-foreground">
                      We found possible matches. Please select the correct one.
                    </p>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                    <h2 className="text-xl font-bold mb-1">High Confidence Match</h2>
                    <p className="text-sm text-muted-foreground">
                      Strong match found. Tap to confirm.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="text-center mb-4">
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <h2 className="text-xl font-bold mb-1">Confirm Item Match</h2>
                <p className="text-sm text-muted-foreground">
                  Our image analysis identified your item. Tap to confirm the match.
                </p>
              </div>
            )}

            <div className="space-y-3">
              {candidates.map((candidate, index) => {
                // Use finalized overallConfidence when available, fallback to raw confidence
                const finalConfidence = candidate.overallConfidence ?? candidate.confidence;
                const conf = getConfidenceLabel(finalConfidence, candidate.category);
                const isToyPipeline = candidate.source === 'toy_pipeline';
                
                // CONFIDENCE-GATED DISPLAY RULES (applies to ALL sources):
                // When overallConfidence < 80%: Show generic label, not specific item title
                // When overallConfidence >= 80%: Show full item details
                const isLowConfidenceResult = finalConfidence < 80;
                const isLowConfidence = isToyPipeline && candidate.requiresManualEntry;
                const isMediumConfidence = isToyPipeline && candidate.requiresSelection && (candidate.pipelineStage || 0) < 4;
                const showThumbnail = !isLowConfidence && !isMediumConfidence && !isLowConfidenceResult;
                
                // Determine display title based on confidence:
                // < 80%: Generic label (category or "Collectible Item")
                // >= 80%: Full item title
                const displayTitle = isLowConfidenceResult 
                  ? (candidate.brandDetected 
                      ? `${candidate.brandDetected} ${candidate.category || 'Item'}` 
                      : candidate.category || 'Collectible Item')
                  : candidate.title;
                
                // Use finalized brandDetected
                const displayBrand = candidate.brandDetected || null;
                
                return (
                  <Card
                    key={candidate.id}
                    className="p-4 hover-elevate cursor-pointer border-border hover:border-green-500/50 transition-colors"
                    onClick={() => handleCandidateSelect(candidate)}
                    data-testid={`card-candidate-${index}`}
                  >
                    <div className="flex items-start gap-3">
                      {showThumbnail && candidate.thumbnailUrl && (
                        <img 
                          src={candidate.thumbnailUrl} 
                          alt="" 
                          className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        {/* Display title gated by overallConfidence - generic for <80%, full for >=80% */}
                        <h3 className="font-semibold text-sm line-clamp-2 mb-2">{displayTitle}</h3>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {/* Show brand only when finalized and confidence >= 80% */}
                          {!isLowConfidenceResult && displayBrand && (
                            <div className="text-xs">
                              <span className="text-muted-foreground">Detected: </span>
                              <span className="font-medium">{displayBrand}</span>
                            </div>
                          )}
                          <div className="text-xs">
                            <span className="text-muted-foreground">Category: </span>
                            <span className="font-medium">{candidate.category}</span>
                          </div>
                          {(isToyPipeline || isLowConfidenceResult) && (
                            <Badge variant="secondary" className="text-xs">
                              {isLowConfidence ? 'Manual Entry Needed' : isLowConfidenceResult ? 'Consider rescanning' : isMediumConfidence ? 'Selection Needed' : 'Match Found'}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={conf.color}>
                            {conf.label}
                          </Badge>
                          <span className={`text-xs ${conf.tier === 'high' ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                            {conf.action}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0 self-center" />
                    </div>
                  </Card>
                );
              })}
            </div>

            <p className="text-xs text-center text-muted-foreground pt-2">
              Tap a match above to confirm, or choose an option below
            </p>
            <div className="flex gap-3 pt-1">
              <Button
                variant="outline"
                onClick={handleRetry}
                className="flex-1"
                data-testid="button-scan-retry"
              >
                Try Again
              </Button>
              <Button
                variant="ghost"
                onClick={onManualEntry}
                className="flex-1 text-muted-foreground"
                data-testid="button-manual-entry"
              >
                Enter Manually
              </Button>
            </div>
            <Button
              variant="ghost"
              onClick={onCancel}
              className="w-full mt-2"
              data-testid="button-select-cancel"
            >
              Back
            </Button>
          </motion.div>
        )}

        {step === 'selectModel' && modelCandidates.length > 0 && (
          <motion.div
            key="selectModel"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="text-center mb-4">
              <Watch className="w-12 h-12 text-blue-400 mx-auto mb-3" />
              <h2 className="text-xl font-bold mb-1">Select Your Watch Model</h2>
              <p className="text-sm text-muted-foreground">
                We detected <span className="font-semibold text-foreground">{detectedBrand}</span> - which model is yours?
              </p>
            </div>

            <div className="space-y-3 max-h-[50vh] overflow-y-auto">
              {modelCandidates.map((model, index) => {
                const matchPercent = Math.round(model.score * 100);
                return (
                  <Card
                    key={model.familyId}
                    className="p-4 hover-elevate cursor-pointer border-border"
                    onClick={() => handleModelSelect(model)}
                    data-testid={`card-model-${index}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm">{model.displayName}</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          Match: {matchPercent}%
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    </div>
                  </Card>
                );
              })}
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={handleRetry}
                className="flex-1"
                data-testid="button-model-retry"
              >
                Try Again
              </Button>
              <Button
                variant="ghost"
                onClick={onManualEntry}
                className="flex-1"
                data-testid="button-model-manual"
              >
                Enter Manually
              </Button>
            </div>
          </motion.div>
        )}

        {step === 'selectWatchColors' && selectedCandidate && (
          <motion.div
            key="selectWatchColors"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setStep('selectModel')}
                data-testid="button-back-to-model"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div>
                <h2 className="text-lg font-bold">Confirm Watch Details</h2>
                <p className="text-xs text-muted-foreground">{selectedCandidate.title}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              We've pre-selected common options. Adjust if needed, or skip to continue.
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Bezel Color</label>
                <div className="flex flex-wrap gap-2">
                  {BEZEL_COLORS.map((color) => (
                    <Badge
                      key={color}
                      variant={selectedBezelColor === color ? "default" : "secondary"}
                      className={`cursor-pointer px-3 py-1 toggle-elevate ${selectedBezelColor === color ? 'toggle-elevated' : ''}`}
                      onClick={() => setSelectedBezelColor(selectedBezelColor === color ? null : color)}
                      data-testid={`badge-bezel-${color.toLowerCase().replace(' ', '-')}`}
                    >
                      {color}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Dial Color</label>
                <div className="flex flex-wrap gap-2">
                  {DIAL_COLORS.map((color) => (
                    <Badge
                      key={color}
                      variant={selectedDialColor === color ? "default" : "secondary"}
                      className={`cursor-pointer px-3 py-1 toggle-elevate ${selectedDialColor === color ? 'toggle-elevated' : ''}`}
                      onClick={() => setSelectedDialColor(selectedDialColor === color ? null : color)}
                      data-testid={`badge-dial-${color.toLowerCase().replace(' ', '-')}`}
                    >
                      {color}
                    </Badge>
                  ))}
                </div>
              </div>

              {showDialStyle ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-muted-foreground">Dial Style (optional)</label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowDialStyle(false);
                        setSelectedDialStyle(null);
                      }}
                      className="text-xs h-6 px-2"
                    >
                      Hide
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {DIAL_STYLES.map((style) => (
                      <Badge
                        key={style}
                        variant={selectedDialStyle === style ? "default" : "secondary"}
                        className={`cursor-pointer px-3 py-1 toggle-elevate ${selectedDialStyle === style ? 'toggle-elevated' : ''}`}
                        onClick={() => setSelectedDialStyle(selectedDialStyle === style ? null : style)}
                        data-testid={`badge-style-${style.toLowerCase().replace('/', '-')}`}
                      >
                        {style}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => setShowDialStyle(true)}
                  className="text-xs text-muted-foreground w-full justify-start h-8"
                  data-testid="button-show-dial-style"
                >
                  + Add dial style (optional)
                </Button>
              )}
            </div>

            <p className="text-xs text-center text-muted-foreground pt-2">
              Skipping won't affect pricing accuracy for most watches
            </p>
            <div className="flex gap-3 pt-1">
              <Button
                variant="ghost"
                onClick={handleWatchColorsConfirm}
                className="flex-1 text-muted-foreground"
                data-testid="button-skip-colors"
              >
                Skip This Step
              </Button>
              <Button
                onClick={handleWatchColorsConfirm}
                className="flex-1"
                data-testid="button-confirm-colors"
              >
                Confirm Details
              </Button>
            </div>
          </motion.div>
        )}

        {step === 'selectParallel' && selectedCandidate && (
          <motion.div
            key="selectParallel"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2 mb-4">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleBackToSelect}
                data-testid="button-back-to-select"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div>
                <h2 className="text-lg font-bold">Select Card Variant</h2>
                <p className="text-xs text-muted-foreground line-clamp-1">{selectedCandidate.title}</p>
              </div>
            </div>

            {loadingParallels ? (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-green-400 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Loading variants...</p>
              </div>
            ) : parallels.length > 0 ? (
              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {parallels.map((parallel) => (
                  <Card
                    key={parallel.id}
                    className={`p-3 cursor-pointer transition-colors ${
                      selectedParallel === parallel.label 
                        ? 'border-green-500 bg-green-500/5' 
                        : 'hover:border-green-500/50'
                    }`}
                    onClick={() => setSelectedParallel(parallel.label)}
                    data-testid={`card-parallel-${parallel.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{parallel.label}</p>
                        {parallel.numbered && (
                          <p className="text-xs text-muted-foreground">
                            Numbered {parallel.numbered}
                          </p>
                        )}
                      </div>
                      {selectedParallel === parallel.label && (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">No specific variants found. Using base card.</p>
              </div>
            )}

            <Button
              onClick={handleParallelConfirm}
              disabled={!selectedParallel || isConfirming}
              className="w-full h-12 bg-green-500 hover:bg-green-600 text-white"
              data-testid="button-confirm-parallel"
            >
              {isConfirming ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'Confirm Selection'
              )}
            </Button>
          </motion.div>
        )}

        {step === 'selectWatchCompleteness' && selectedCandidate && (
          <motion.div
            key="selectWatchCompleteness"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2 mb-4">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleBackToSelect}
                data-testid="button-back-to-select-watch"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div>
                <h2 className="text-lg font-bold">What's Included?</h2>
                <p className="text-xs text-muted-foreground line-clamp-1">{selectedCandidate.title}</p>
              </div>
            </div>

            <div className="text-center mb-4">
              <Watch className="w-12 h-12 text-blue-400 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Does this watch come with box and papers? This affects pricing.
              </p>
            </div>

            <div className="space-y-3">
              <Card
                className="p-4 hover-elevate cursor-pointer border-border hover:border-green-500/50 transition-colors"
                onClick={() => handleWatchCompletenessConfirm('FULL_SET')}
                data-testid="button-watch-full-set"
              >
                <div className="flex items-center gap-3">
                  <Package className="w-8 h-8 text-green-400 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold">Full Set</h3>
                    <p className="text-xs text-muted-foreground">Box, papers, and all accessories</p>
                  </div>
                </div>
              </Card>

              <Card
                className="p-4 hover-elevate cursor-pointer border-border hover:border-amber-500/50 transition-colors"
                onClick={() => handleWatchCompletenessConfirm('WATCH_ONLY')}
                data-testid="button-watch-only"
              >
                <div className="flex items-center gap-3">
                  <PackageOpen className="w-8 h-8 text-amber-400 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold">Watch Only</h3>
                    <p className="text-xs text-muted-foreground">No box or papers included</p>
                  </div>
                </div>
              </Card>

              <Card
                className="p-4 hover-elevate cursor-pointer border-border hover:border-muted-foreground/50 transition-colors"
                onClick={() => handleWatchCompletenessConfirm('UNKNOWN')}
                data-testid="button-watch-unknown"
              >
                <div className="flex items-center gap-3">
                  <HelpCircle className="w-8 h-8 text-muted-foreground flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold">Not Sure</h3>
                    <p className="text-xs text-muted-foreground">Unknown or partial set</p>
                  </div>
                </div>
              </Card>
            </div>

            {isConfirming && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-green-400" />
                <span className="ml-2 text-sm text-muted-foreground">Confirming...</span>
              </div>
            )}
          </motion.div>
        )}

        {step === 'brandRequired' && (
          <motion.div
            key="brandRequired"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="text-center py-8"
          >
            <Watch className="w-16 h-16 text-amber-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">Couldn't Read Watch Brand</h3>
            <p className="text-sm text-muted-foreground mb-4 px-4">
              We detected a watch but couldn't read the brand from the dial. Please take a clearer photo showing the brand name, or enter the details manually.
            </p>
            {frontImage && (
              <div className="w-24 h-24 rounded-lg overflow-hidden mx-auto mb-4 border border-border">
                <img src={frontImage} alt="Watch photo" className="w-full h-full object-cover" />
              </div>
            )}
            {brandAlternatives.length > 0 && (
              <div className="mb-6 px-4">
                <p className="text-xs text-muted-foreground mb-2">Visual match guesses:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {brandAlternatives.map((brand) => (
                    <Badge key={brand} variant="secondary">{brand}</Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-col gap-3 px-4">
              <Button
                onClick={handleRetry}
                className="w-full"
                data-testid="button-retry-watch-photo"
              >
                <Camera className="w-4 h-4 mr-2" />
                Take Clearer Photo
              </Button>
              <Button
                variant="outline"
                onClick={onManualEntry}
                className="w-full"
                data-testid="button-manual-watch-entry"
              >
                Enter Details Manually
              </Button>
            </div>
          </motion.div>
        )}

        {step === 'barcode' && (
          <motion.div
            key="barcode"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="text-center py-8"
          >
            <ScanBarcode className="w-16 h-16 text-amber-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">Scan the Box Barcode</h3>
            <p className="text-sm text-muted-foreground mb-6 px-4">
              We detected a boxed Funko Pop! Scan the UPC barcode on the box for exact identification and accurate pricing.
            </p>
            {frontImage && (
              <div className="w-20 h-28 rounded-lg overflow-hidden mx-auto mb-6 border border-border">
                <img src={frontImage} alt="Detected item" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex flex-col gap-3 px-4">
              <Button
                onClick={() => setShowBarcodeScanner(true)}
                className="w-full"
                data-testid="button-scan-upc"
              >
                <ScanBarcode className="w-4 h-4 mr-2" />
                Scan Barcode
              </Button>
              <Button
                variant="outline"
                onClick={() => setStep('select')}
                className="w-full"
                data-testid="button-skip-barcode"
              >
                Skip - Use Photo ID
              </Button>
            </div>
          </motion.div>
        )}

        {step === 'imageQuality' && (
          <motion.div
            key="imageQuality"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="text-center py-12"
          >
            <Camera className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Image Not Clear Enough</h3>
            <p className="text-sm text-muted-foreground mb-6 px-4">
              The photo is too blurry or dark to identify the item. Please retake with better lighting and focus, or enter details manually.
            </p>
            <div className="flex flex-col gap-3">
              <Button
                onClick={handleRetry}
                className="w-full"
                data-testid="button-quality-retake"
              >
                <Camera className="w-4 h-4 mr-2" />
                Retake Photo
              </Button>
              <Button
                variant="outline"
                onClick={onManualEntry}
                className="w-full"
                data-testid="button-quality-manual"
              >
                Enter Details Manually
              </Button>
            </div>
          </motion.div>
        )}

        {step === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="text-center py-12"
          >
            <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Scan Failed</h3>
            <p className="text-sm text-muted-foreground mb-6 px-4">
              {error || "Something went wrong. Please try again."}
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleRetry}
                className="flex-1"
                data-testid="button-error-retry"
              >
                Try Again
              </Button>
              <Button
                variant="ghost"
                onClick={onManualEntry}
                className="flex-1"
                data-testid="button-error-manual"
              >
                Enter Manually
              </Button>
            </div>
            <Button
              variant="ghost"
              onClick={onCancel}
              className="w-full mt-3"
              data-testid="button-error-cancel"
            >
              Back
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {showBarcodeScanner && (
        <BarcodeScanner
          onProductFound={handleBarcodeProductFound}
          onCancel={handleBarcodeScannerCancel}
        />
      )}
    </div>
  );
}
