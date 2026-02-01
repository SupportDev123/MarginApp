import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, AlertTriangle, Clock, ArrowLeft, RefreshCw, X, Focus, Minimize2, Maximize2, ExternalLink, Volume2, VolumeX, Mic, MicOff, Play, Pause, PictureInPicture2, TrendingUp, Zap } from "lucide-react";
import { MarginLogoMark } from "@/components/MarginLogo";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type CaptureState = 'idle' | 'capturing' | 'scanning' | 'cooldown';
type Platform = 'desktop' | 'ios' | 'android' | 'macos-app';

type AnalysisResult = {
  title: string;
  category: string;
  confidence: number;
  maxBuy: number | null;
  sellEstimate: { low: number; high: number } | null;
  verdict: 'flip' | 'skip' | 'max_buy' | 'insufficient_data';
  marginPercent: number | null;
  compsCount: number;
  hasBuyPrice: boolean;
  buyPrice: number | null;
};

type CacheEntry = {
  hash: string;
  result: AnalysisResult;
  timestamp: number;
};

const CONFIDENCE_THRESHOLD = 65;
const COOLDOWN_MS = 10000; // 10 second cooldown between scans
const CACHE_TTL_MS = 60000;
const SCORING_WIDTH = 640; // Larger scoring canvas for better frame selection

// Quality scoring functions for frame selection
function computeSharpnessScore(imageData: ImageData): number {
  // Laplacian variance with center-weighted bias for product focus
  const { data, width, height } = imageData;
  let variance = 0;
  let count = 0;
  
  // Define center region (middle 60% of the frame where product typically is)
  const centerX = width / 2;
  const centerY = height / 2;
  const maxDistX = width * 0.5;
  const maxDistY = height * 0.5;
  
  // Sample every 3rd pixel for better accuracy
  for (let y = 2; y < height - 2; y += 3) {
    for (let x = 2; x < width - 2; x += 3) {
      const idx = (y * width + x) * 4;
      const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      
      // Laplacian kernel approximation (center - neighbors)
      const top = ((data[((y - 2) * width + x) * 4] + data[((y - 2) * width + x) * 4 + 1] + data[((y - 2) * width + x) * 4 + 2]) / 3);
      const bottom = ((data[((y + 2) * width + x) * 4] + data[((y + 2) * width + x) * 4 + 1] + data[((y + 2) * width + x) * 4 + 2]) / 3);
      const left = ((data[(y * width + (x - 2)) * 4] + data[(y * width + (x - 2)) * 4 + 1] + data[(y * width + (x - 2)) * 4 + 2]) / 3);
      const right = ((data[(y * width + (x + 2)) * 4] + data[(y * width + (x + 2)) * 4 + 1] + data[(y * width + (x + 2)) * 4 + 2]) / 3);
      
      const laplacian = Math.abs(4 * gray - top - bottom - left - right);
      
      // Center-weighted bias: pixels closer to center contribute more (product focus)
      const distX = Math.abs(x - centerX) / maxDistX;
      const distY = Math.abs(y - centerY) / maxDistY;
      const centerWeight = 1 + (1 - Math.max(distX, distY)) * 0.5; // 1.0 at edges, 1.5 at center
      
      variance += laplacian * laplacian * centerWeight;
      count++;
    }
  }
  
  return count > 0 ? Math.sqrt(variance / count) : 0;
}

function computeExposureScore(imageData: ImageData): number {
  // Good exposure: mean brightness ~128, low clipping
  const { data } = imageData;
  let sum = 0;
  let overexposed = 0;
  let underexposed = 0;
  const pixelCount = data.length / 4;
  
  for (let i = 0; i < data.length; i += 16) { // Sample every 4th pixel
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    sum += brightness;
    if (brightness > 250) overexposed++;
    if (brightness < 5) underexposed++;
  }
  
  const sampledCount = pixelCount / 4;
  const mean = sum / sampledCount;
  const clippedRatio = (overexposed + underexposed) / sampledCount;
  
  // Score: closer to 128 is better, less clipping is better
  const meanScore = 1 - Math.abs(mean - 128) / 128;
  const clipScore = 1 - Math.min(clippedRatio * 10, 1);
  
  return meanScore * 0.5 + clipScore * 0.5;
}

function computeContrastScore(imageData: ImageData): number {
  // Higher local contrast often means better text visibility
  const { data, width, height } = imageData;
  let contrastSum = 0;
  let count = 0;
  
  for (let y = 1; y < height - 1; y += 8) {
    for (let x = 1; x < width - 1; x += 8) {
      const idx = (y * width + x) * 4;
      const center = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      
      // Check neighbors for contrast
      let maxDiff = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nidx = ((y + dy) * width + (x + dx)) * 4;
          const neighbor = (data[nidx] + data[nidx + 1] + data[nidx + 2]) / 3;
          maxDiff = Math.max(maxDiff, Math.abs(center - neighbor));
        }
      }
      contrastSum += maxDiff;
      count++;
    }
  }
  
  return count > 0 ? contrastSum / count / 128 : 0; // Normalize to 0-2 range
}

function computeMotionBlurScore(imageData: ImageData): number {
  // Detect motion blur by measuring directional gradient consistency
  // High score = less motion blur (sharper edges in all directions)
  const { data, width, height } = imageData;
  let horizontalEdges = 0;
  let verticalEdges = 0;
  let count = 0;
  
  // Sample center region more densely (where product is)
  const startY = Math.floor(height * 0.2);
  const endY = Math.floor(height * 0.8);
  const startX = Math.floor(width * 0.2);
  const endX = Math.floor(width * 0.8);
  
  for (let y = startY; y < endY; y += 4) {
    for (let x = startX; x < endX; x += 4) {
      const idx = (y * width + x) * 4;
      const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      
      // Horizontal gradient (detect vertical edges)
      if (x > 0 && x < width - 1) {
        const leftIdx = (y * width + (x - 1)) * 4;
        const rightIdx = (y * width + (x + 1)) * 4;
        const left = (data[leftIdx] + data[leftIdx + 1] + data[leftIdx + 2]) / 3;
        const right = (data[rightIdx] + data[rightIdx + 1] + data[rightIdx + 2]) / 3;
        horizontalEdges += Math.abs(right - left);
      }
      
      // Vertical gradient (detect horizontal edges)
      if (y > 0 && y < height - 1) {
        const topIdx = ((y - 1) * width + x) * 4;
        const bottomIdx = ((y + 1) * width + x) * 4;
        const top = (data[topIdx] + data[topIdx + 1] + data[topIdx + 2]) / 3;
        const bottom = (data[bottomIdx] + data[bottomIdx + 1] + data[bottomIdx + 2]) / 3;
        verticalEdges += Math.abs(bottom - top);
      }
      count++;
    }
  }
  
  if (count === 0) return 0;
  
  // Motion blur typically affects one direction more than other
  // High score when both directions have similar edge strength (no directional blur)
  const avgH = horizontalEdges / count;
  const avgV = verticalEdges / count;
  const totalEdges = avgH + avgV;
  
  if (totalEdges < 1) return 0;
  
  // Balance ratio: 1.0 = perfectly balanced (no directional blur), lower = blurred in one direction
  const balance = 1 - Math.abs(avgH - avgV) / totalEdges;
  return balance * totalEdges / 128; // Normalize
}

function scoreFrame(imageData: ImageData): number {
  const sharpness = computeSharpnessScore(imageData);
  const exposure = computeExposureScore(imageData);
  const contrast = computeContrastScore(imageData);
  const motionBlur = computeMotionBlurScore(imageData);
  
  // Weighted combination: sharpness and motion blur most important for live video
  return sharpness * 0.4 + motionBlur * 0.25 + exposure * 0.15 + contrast * 0.2;
}

// Separate scoring for object recognition (sharpness + exposure priority)
function scoreObjectFrame(imageData: ImageData): number {
  const sharpness = computeSharpnessScore(imageData);
  const exposure = computeExposureScore(imageData);
  const motionBlur = computeMotionBlurScore(imageData);
  
  // Object recognition: prioritize overall sharpness and good exposure
  return sharpness * 0.5 + exposure * 0.25 + motionBlur * 0.25;
}

// Separate scoring for text/OCR readability (contrast + sharpness priority)
function scoreTextFrame(imageData: ImageData): number {
  const sharpness = computeSharpnessScore(imageData);
  const contrast = computeContrastScore(imageData);
  const motionBlur = computeMotionBlurScore(imageData);
  
  // Text readability: prioritize high contrast and sharpness for OCR
  return contrast * 0.4 + sharpness * 0.35 + motionBlur * 0.25;
}

// Lightweight client-side text extraction using basic pattern matching
// This runs before Vision API - if we get confident text, we skip Vision
type OCRResult = {
  text: string;
  confidence: number;
  extractedIdentifiers: {
    brand?: string;
    model?: string;
    playerName?: string;
    cardSet?: string;
    cardYear?: string;
    cardNumber?: string;
  };
};

// Common brand patterns for quick matching
const BRAND_PATTERNS = [
  /\b(nike|adidas|jordan|yeezy|puma|reebok|new balance)\b/i,
  /\b(rolex|omega|seiko|casio|tag heuer|breitling|patek)\b/i,
  /\b(sony|nintendo|playstation|xbox|sega|atari)\b/i,
  /\b(topps|panini|upper deck|bowman|donruss|fleer)\b/i,
  /\b(pokemon|magic|yugioh|mtg)\b/i,
  /\b(apple|samsung|lg|dell|hp|lenovo)\b/i,
  /\b(dewalt|milwaukee|makita|bosch|ridgid|craftsman)\b/i,
];

// Card number patterns: #/999, /999, 1/1, AUTO, RC, REFRACTOR, etc.
const CARD_PATTERNS = {
  numbering: /[#\/]?\s*(\d{1,4})\s*[\/]\s*(\d{1,5})/i,
  year: /\b(19[5-9]\d|20[0-2]\d)\b/,
  auto: /\b(auto|autograph|signed)\b/i,
  rc: /\b(rc|rookie)\b/i,
  refractor: /\b(refractor|prizm|chrome|holo|parallel)\b/i,
};

function extractIdentifiersFromText(text: string): OCRResult['extractedIdentifiers'] {
  const identifiers: OCRResult['extractedIdentifiers'] = {};
  
  // Try to match brands
  for (const pattern of BRAND_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      identifiers.brand = match[1].toLowerCase();
      break;
    }
  }
  
  // Extract card year
  const yearMatch = text.match(CARD_PATTERNS.year);
  if (yearMatch) {
    identifiers.cardYear = yearMatch[1];
  }
  
  // Extract card numbering (#/999)
  const numberMatch = text.match(CARD_PATTERNS.numbering);
  if (numberMatch) {
    identifiers.cardNumber = `${numberMatch[1]}/${numberMatch[2]}`;
  }
  
  return identifiers;
}

// Placeholder OCR function - currently returns low confidence
// Can be upgraded to use Tesseract.js worker for real OCR
async function performClientOCR(imageDataUrl: string): Promise<OCRResult> {
  // Stub implementation - in production, this would use Tesseract.js in a worker
  // For now, return low confidence to trigger Vision API
  return {
    text: '',
    confidence: 0,
    extractedIdentifiers: {},
  };
}

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  const isMacApp = /electron|tauri/.test(ua) && /macintosh/.test(ua);
  
  if (isIOS) return 'ios';
  if (isAndroid) return 'android';
  if (isMacApp) return 'macos-app';
  return 'desktop';
}

function usePlatform() {
  const [platform] = useState<Platform>(() => detectPlatform());
  const supportsScreenCapture = typeof navigator.mediaDevices?.getDisplayMedia === 'function';
  const usesCameraCapture = platform === 'ios' || platform === 'android';
  
  return { platform, supportsScreenCapture, usesCameraCapture };
}

// Voice announcement using Web Speech API
function speak(text: string, enabled: boolean) {
  if (!enabled || typeof speechSynthesis === 'undefined') return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.1;
  utterance.pitch = 1;
  utterance.volume = 0.8;
  speechSynthesis.speak(utterance);
}

// Sound effect player (using Web Audio API for minimal latency)
function playSound(type: 'flip' | 'skip' | 'scan' | 'error', enabled: boolean) {
  if (!enabled) return;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    switch (type) {
      case 'flip':
        osc.frequency.setValueAtTime(523, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1); // E5
        osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2); // G5
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
        break;
      case 'skip':
        osc.frequency.setValueAtTime(392, ctx.currentTime); // G4
        osc.frequency.setValueAtTime(294, ctx.currentTime + 0.15); // D4
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
        break;
      case 'scan':
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.1);
        break;
      case 'error':
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
        break;
    }
  } catch {
    // Audio context not available
  }
}

export default function LiveCapture() {
  const { platform, supportsScreenCapture, usesCameraCapture } = usePlatform();
  
  const [state, setState] = useState<CaptureState>('idle');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [buyPriceInput, setBuyPriceInput] = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [denialCount, setDenialCount] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(true);
  const [compactMode, setCompactMode] = useState(false);
  
  // NEXT-LEVEL FEATURES
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoScanEnabled, setAutoScanEnabled] = useState(false);
  const [autoScanInterval, setAutoScanInterval] = useState(5); // seconds
  const [sessionStats, setSessionStats] = useState({ scans: 0, flips: 0, skips: 0, potentialProfit: 0 });
  const [pipActive, setPipActive] = useState(false);
  
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef<CacheEntry[]>([]);
  const lastHashRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scoringCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const autoScanTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const scanInProgressRef = useRef<boolean>(false); // Debounce guard
  const lastImageBase64Ref = useRef<string | null>(null); // For library learning
  const justExitedCooldownRef = useRef<boolean>(false); // Prevent immediate auto-scan after cooldown
  const abortControllerRef = useRef<AbortController | null>(null); // Abort fetch on new scan
  const hasResultRef = useRef<boolean>(false); // Track if we have a result

  const computePerceptualHash = useCallback((imageData: ImageData): string => {
    const { data, width, height } = imageData;
    const blockW = Math.floor(width / 8);
    const blockH = Math.floor(height / 8);
    let hash = '';
    let totalBrightness = 0;
    const brightnesses: number[] = [];

    for (let by = 0; by < 8; by++) {
      for (let bx = 0; bx < 8; bx++) {
        let blockSum = 0;
        let count = 0;
        for (let y = by * blockH; y < (by + 1) * blockH && y < height; y++) {
          for (let x = bx * blockW; x < (bx + 1) * blockW && x < width; x++) {
            const i = (y * width + x) * 4;
            const gray = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
            blockSum += gray;
            count++;
          }
        }
        const avg = count > 0 ? blockSum / count : 0;
        brightnesses.push(avg);
        totalBrightness += avg;
      }
    }

    const avgBrightness = totalBrightness / 64;
    for (const b of brightnesses) {
      hash += b > avgBrightness ? '1' : '0';
    }
    return hash;
  }, []);

  const hashSimilarity = useCallback((h1: string, h2: string): number => {
    if (h1.length !== h2.length) return 0;
    let matches = 0;
    for (let i = 0; i < h1.length; i++) {
      if (h1[i] === h2[i]) matches++;
    }
    return (matches / h1.length) * 100;
  }, []);

  const checkCache = useCallback((hash: string): AnalysisResult | null => {
    const now = Date.now();
    cacheRef.current = cacheRef.current.filter(e => now - e.timestamp < CACHE_TTL_MS);
    
    for (const entry of cacheRef.current) {
      if (hashSimilarity(hash, entry.hash) > 90) {
        return entry.result;
      }
    }
    return null;
  }, [hashSimilarity]);

  const addToCache = useCallback((hash: string, result: AnalysisResult) => {
    cacheRef.current.push({ hash, result, timestamp: Date.now() });
  }, []);

  const startScreenCapture = useCallback(async () => {
    try {
      setPermissionDenied(false);
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' },
        audio: false,
        // @ts-ignore - Chrome-specific hints to prefer tabs
        preferCurrentTab: false,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'exclude'
      } as any);
      setMediaStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      stream.getVideoTracks()[0].onended = () => {
        setMediaStream(null);
      };
      
      // Note: Removed aggressive focus recovery to avoid any DOM manipulation
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setPermissionDenied(true);
        setDenialCount(prev => prev + 1);
        setError(null);
      } else {
        setError("Screen capture failed");
      }
    }
  }, []);

  const changeSource = useCallback(async () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      setMediaStream(null);
    }
    setResult(null);
    setError(null);
    await startScreenCapture();
  }, [mediaStream, startScreenCapture]);

  const stopCapture = useCallback(() => {
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      setMediaStream(null);
    }
    setResult(null);
    setError(null);
    setPreviewUrl(null);
  }, [mediaStream]);

  const exitLiveCapture = useCallback(() => {
    stopCapture();
    setLocation('/scan');
  }, [stopCapture, setLocation]);

  const analyzeImage = useCallback(async (
    imageBase64: string, 
    hash: string,
    ocrHints?: OCRResult['extractedIdentifiers']
  ) => {
    setState('scanning');
    playSound('scan', soundEnabled);
    console.log('[LiveCapture] Starting API analysis...');

    try {
      const userBuyPrice = buyPriceInput ? parseFloat(buyPriceInput) : null;
      
      // Use AbortController signal for cancellation
      const signal = abortControllerRef.current?.signal;
      
      const response = await apiRequest('POST', '/api/live-capture/analyze', { 
        imageBase64,
        buyPrice: userBuyPrice,
        ocrHints: ocrHints || undefined
      }, signal);
      
      // Check if aborted
      if (signal?.aborted) {
        console.log('[LiveCapture] EARLY EXIT: request was aborted');
        return;
      }
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('[LiveCapture] API response received:', data.title, 'maxBuy:', data.maxBuy);

      // Normalize sellEstimate - API may return number or {low, high} object
      let sellEstimate: { low: number; high: number } | null = null;
      if (data.sellEstimate) {
        if (typeof data.sellEstimate === 'number') {
          // Single number - use as both low and high
          sellEstimate = { low: data.sellEstimate, high: data.sellEstimate };
        } else if (data.sellEstimate.low !== undefined && data.sellEstimate.high !== undefined) {
          sellEstimate = data.sellEstimate;
        }
      }

      const analysisResult: AnalysisResult = {
        title: data.title || 'Unknown Item',
        category: data.category || 'Other',
        confidence: data.confidence || 0,
        maxBuy: data.maxBuy,
        sellEstimate,
        verdict: data.verdict || 'insufficient_data',
        marginPercent: data.marginPercent,
        compsCount: data.compsCount || 0,
        hasBuyPrice: data.hasBuyPrice || false,
        buyPrice: data.buyPrice,
      };

      console.log('[LiveCapture] Setting result and transitioning to cooldown');
      setResult(analysisResult);
      hasResultRef.current = true;
      addToCache(hash, analysisResult);
      setState('cooldown');
      setCooldownRemaining(COOLDOWN_MS);
      console.log('[LiveCapture] State set to cooldown, remaining:', COOLDOWN_MS);

      // Update session stats (estimate using standard 13% platform fee + $5 fixed + $8 shipping)
      setSessionStats(prev => {
        const newStats = { ...prev, scans: prev.scans + 1 };
        if (analysisResult.verdict === 'flip') {
          newStats.flips = prev.flips + 1;
          if (analysisResult.sellEstimate && analysisResult.buyPrice !== null) {
            const salePrice = (analysisResult.sellEstimate.low + analysisResult.sellEstimate.high) / 2;
            const platformFee = salePrice * 0.13;
            const fixedCosts = 5;
            const shipping = 8;
            const profit = salePrice - analysisResult.buyPrice - platformFee - fixedCosts - shipping;
            newStats.potentialProfit = prev.potentialProfit + Math.max(0, profit);
          }
        } else if (analysisResult.verdict === 'skip') {
          newStats.skips = prev.skips + 1;
        }
        return newStats;
      });

      // Play sound and voice based on verdict
      if (analysisResult.verdict === 'flip') {
        playSound('flip', soundEnabled);
        const maxBuy = analysisResult.maxBuy ? `Max buy ${analysisResult.maxBuy} dollars` : '';
        speak(`Flip it! ${maxBuy}`, voiceEnabled);
      } else if (analysisResult.verdict === 'skip') {
        playSound('skip', soundEnabled);
        speak('Skip it', voiceEnabled);
      } else if (analysisResult.verdict === 'max_buy' && analysisResult.maxBuy) {
        speak(`Max buy ${analysisResult.maxBuy} dollars`, voiceEnabled);
      }

    } catch (err: any) {
      console.error('[LiveCapture] Analysis error:', err);
      setError(err.message || 'Analysis failed');
      playSound('error', soundEnabled);
      setState('idle');
    }
  }, [buyPriceInput, addToCache, soundEnabled, voiceEnabled]);

  const captureScreenFrame = useCallback(async () => {
    // TRIPLE GUARD: state check + ref debounce
    if (state !== 'idle') {
      console.log('[LiveCapture] EARLY EXIT: state not idle, current state:', state);
      return;
    }
    if (scanInProgressRef.current) {
      console.log('[LiveCapture] EARLY EXIT: scan already in progress');
      return;
    }
    if (!mediaStream) {
      console.log('[LiveCapture] EARLY EXIT: no mediaStream');
      return;
    }
    if (!videoRef.current) {
      console.log('[LiveCapture] EARLY EXIT: no videoRef');
      return;
    }
    if (!canvasRef.current) {
      console.log('[LiveCapture] EARLY EXIT: no canvasRef');
      return;
    }
    
    // Check video readiness - if not ready, wait a bit
    if (videoRef.current.readyState < 2) {
      console.log('[LiveCapture] EARLY EXIT: video not ready, readyState:', videoRef.current.readyState);
      return;
    }

    // === HARD RESET all run-specific refs and state ===
    console.log('[LiveCapture] Starting scan - hard reset');
    
    // Abort any previous fetch request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    // Reset all refs
    scanInProgressRef.current = true;
    hasResultRef.current = false;
    lastHashRef.current = null;
    lastImageBase64Ref.current = null;
    
    // Reset all state
    setResult(null);
    setError(null);
    setPreviewUrl(null);
    setCooldownRemaining(0);
    setState('capturing');

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context failed');

      // Setup scoring canvas (downscaled for efficient quality scoring)
      if (!scoringCanvasRef.current) {
        scoringCanvasRef.current = document.createElement('canvas');
      }
      const scoringCanvas = scoringCanvasRef.current;
      const scoringCtx = scoringCanvas.getContext('2d');
      if (!scoringCtx) throw new Error('Scoring canvas context failed');

      const aspectRatio = video.videoHeight / video.videoWidth;
      scoringCanvas.width = SCORING_WIDTH;
      scoringCanvas.height = Math.round(SCORING_WIDTH * aspectRatio);

      // Always capture full frame - no cropping (focus mode only affects visual emphasis overlay)
      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;

      // BURST CLICK: Sample 12 frames over ~500ms for intelligent frame selection
      // Track BOTH best object frame (for Vision) AND best text frame (for OCR)
      const burstCount = 12;
      const burstInterval = 42; // ~500ms total (12 * 42ms)
      
      // Dual tracking: best object frame + best text frame
      let bestObjectScore = -Infinity;
      let bestObjectDataUrl: string | null = null;
      let bestObjectImageData: ImageData | null = null;
      
      let bestTextScore = -Infinity;
      let bestTextDataUrl: string | null = null;

      // Capture and score all frames, tracking both object and text quality separately
      for (let i = 0; i < burstCount; i++) {
        // Draw to scoring canvas for quality assessment
        const aspectRatioCropped = sourceHeight / sourceWidth;
        scoringCanvas.width = SCORING_WIDTH;
        scoringCanvas.height = Math.round(SCORING_WIDTH * aspectRatioCropped);
        scoringCtx.drawImage(video, 0, 0, sourceWidth, sourceHeight, 0, 0, scoringCanvas.width, scoringCanvas.height);
        const scoringData = scoringCtx.getImageData(0, 0, scoringCanvas.width, scoringCanvas.height);
        
        // Score for OBJECT recognition (sharpness + exposure)
        const objectScore = scoreObjectFrame(scoringData);
        
        // Score for TEXT readability (contrast + sharpness)
        const textScore = scoreTextFrame(scoringData);
        
        // Capture full-res frame for each best
        if (objectScore > bestObjectScore) {
          bestObjectScore = objectScore;
          canvas.width = sourceWidth;
          canvas.height = sourceHeight;
          ctx.drawImage(video, 0, 0, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
          bestObjectDataUrl = canvas.toDataURL('image/jpeg', 0.95);
          bestObjectImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }
        
        if (textScore > bestTextScore) {
          bestTextScore = textScore;
          canvas.width = sourceWidth;
          canvas.height = sourceHeight;
          ctx.drawImage(video, 0, 0, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
          bestTextDataUrl = canvas.toDataURL('image/jpeg', 0.95);
        }
        
        if (i < burstCount - 1) {
          await new Promise(resolve => setTimeout(resolve, burstInterval));
        }
      }

      // Validate we got frames
      if (!bestObjectDataUrl || !bestObjectImageData) {
        console.log('[LiveCapture] EARLY EXIT: No frames captured (bestObjectDataUrl or bestObjectImageData is null)');
        throw new Error('No frames captured');
      }
      
      console.log('[LiveCapture] Frames captured successfully, computing hash...');
      const hash = computePerceptualHash(bestObjectImageData);

      if (lastHashRef.current && hashSimilarity(hash, lastHashRef.current) > 95) {
        console.log('[LiveCapture] EARLY EXIT: same frame detected (hash similarity > 95%)');
        setState('idle');
        scanInProgressRef.current = false;
        return;
      }
      lastHashRef.current = hash;

      const cached = checkCache(hash);
      if (cached) {
        console.log('[LiveCapture] EARLY EXIT: using cached result for hash');
        setResult(cached);
        hasResultRef.current = true;
        setState('cooldown');
        setCooldownRemaining(COOLDOWN_MS);
        return;
      }

      // Run client-side OCR on the best text frame first
      let ocrIdentifiers: OCRResult['extractedIdentifiers'] = {};
      let ocrConfidence = 0;
      
      if (bestTextDataUrl) {
        try {
          const ocrResult = await performClientOCR(bestTextDataUrl);
          ocrIdentifiers = ocrResult.extractedIdentifiers;
          ocrConfidence = ocrResult.confidence;
          
          // If OCR extracted confident identifiers, merge them
          if (ocrResult.text) {
            const extractedFromText = extractIdentifiersFromText(ocrResult.text);
            ocrIdentifiers = { ...ocrIdentifiers, ...extractedFromText };
          }
        } catch (ocrErr) {
          // OCR failed silently - continue to Vision
          console.warn('Client OCR failed:', ocrErr);
        }
      }

      // Always use Vision API for now (OCR stub returns 0 confidence)
      // In production with Tesseract.js: if ocrConfidence > 0.7, skip Vision
      const imageBase64 = bestObjectDataUrl.split(',')[1];
      lastImageBase64Ref.current = imageBase64; // Store for library learning
      console.log('[LiveCapture] ABOUT TO ANALYZE - calling analyzeImage');
      await analyzeImage(imageBase64, hash, ocrIdentifiers);
    } catch (err: any) {
      console.log('[LiveCapture] EARLY EXIT: catch block error:', err.message || err);
      setError(err.message || 'Capture failed');
      setState('idle');
      scanInProgressRef.current = false; // Release guard on error
    }
  }, [state, mediaStream, focusMode, computePerceptualHash, hashSimilarity, checkCache, analyzeImage]);

  const handleCameraCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || state !== 'idle') return;

    setState('capturing');
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Data = event.target?.result as string;
        setPreviewUrl(base64Data);
        
        const imageBase64 = base64Data.split(',')[1];
        
        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            setError('Canvas context failed');
            setState('idle');
            return;
          }
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const hash = computePerceptualHash(imageData);

          if (lastHashRef.current && hashSimilarity(hash, lastHashRef.current) > 95) {
            setState('idle');
            return;
          }
          lastHashRef.current = hash;

          const cached = checkCache(hash);
          if (cached) {
            setResult(cached);
            setState('cooldown');
            setCooldownRemaining(COOLDOWN_MS);
            return;
          }

          lastImageBase64Ref.current = imageBase64; // Store for library learning
          await analyzeImage(imageBase64, hash);
        };
        img.src = base64Data;
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setError(err.message || 'Camera capture failed');
      setState('idle');
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [state, computePerceptualHash, hashSimilarity, checkCache, analyzeImage]);

  // REMOVED: Duplicate cooldown timer - only use the one at line 936

  useEffect(() => {
    if (usesCameraCapture) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && state === 'idle' && mediaStream && !scanInProgressRef.current) {
        e.preventDefault();
        captureScreenFrame();
      }
      if (e.code === 'Escape') {
        setResult(null);
        setError(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, mediaStream, captureScreenFrame, usesCameraCapture]);

  useEffect(() => {
    return () => {
      if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
      }
    };
  }, [mediaStream]);

  // Ensure video element stays connected to stream
  useEffect(() => {
    if (videoRef.current && mediaStream) {
      videoRef.current.srcObject = mediaStream;
      videoRef.current.play().catch(() => {
        // Autoplay might be blocked, user interaction will resume
      });
    }
  }, [mediaStream]);

  // Release debounce guard when state returns to idle
  useEffect(() => {
    if (state === 'idle') {
      scanInProgressRef.current = false;
    }
  }, [state]);

  // Auto-scan timer - only triggers when auto-scan is enabled and state is truly idle
  useEffect(() => {
    // Don't auto-scan if just exited cooldown (user gets a grace period)
    if (!autoScanEnabled || !mediaStream || state !== 'idle' || justExitedCooldownRef.current) {
      if (autoScanTimerRef.current) {
        clearTimeout(autoScanTimerRef.current);
        autoScanTimerRef.current = null;
      }
      return;
    }

    autoScanTimerRef.current = setTimeout(() => {
      // Double-check all conditions before auto-scanning
      if (state === 'idle' && mediaStream && !scanInProgressRef.current && !justExitedCooldownRef.current) {
        console.log('[LiveCapture] Auto-scan triggered');
        captureScreenFrame();
      }
    }, autoScanInterval * 1000);

    return () => {
      if (autoScanTimerRef.current) {
        clearTimeout(autoScanTimerRef.current);
      }
    };
  }, [autoScanEnabled, autoScanInterval, state, mediaStream, captureScreenFrame]);
  
  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      if (autoScanTimerRef.current) {
        clearTimeout(autoScanTimerRef.current);
        autoScanTimerRef.current = null;
      }
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    };
  }, []);

  // Picture-in-Picture toggle
  const togglePiP = useCallback(async () => {
    if (!videoRef.current) return;
    
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setPipActive(false);
      } else if (document.pictureInPictureEnabled) {
        await videoRef.current.requestPictureInPicture();
        setPipActive(true);
        toast({ title: "Picture-in-Picture Active", description: "Video floats on top while you browse" });
      }
    } catch (err) {
      toast({ title: "PiP Not Available", variant: "destructive" });
    }
  }, [toast]);

  // Listen for PiP exit
  useEffect(() => {
    const handlePiPExit = () => setPipActive(false);
    if (videoRef.current) {
      videoRef.current.addEventListener('leavepictureinpicture', handlePiPExit);
      return () => videoRef.current?.removeEventListener('leavepictureinpicture', handlePiPExit);
    }
  }, [mediaStream]);

  // Cooldown timer - countdown and return to idle after COOLDOWN_MS
  useEffect(() => {
    // Clear any existing cooldown timer first
    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
    
    if (state !== 'cooldown') {
      console.log('[LiveCapture] STATUS ->', state);
      return;
    }
    
    console.log('[LiveCapture] STATUS -> cooldown, starting countdown');
    
    // Start countdown from COOLDOWN_MS
    const startTime = Date.now();
    const endTime = startTime + COOLDOWN_MS;
    
    cooldownTimerRef.current = setInterval(() => {
      const remaining = Math.max(0, endTime - Date.now());
      setCooldownRemaining(remaining);
      
      if (remaining <= 0) {
        console.log('[LiveCapture] COOLDOWN END -> setting idle');
        justExitedCooldownRef.current = true; // Prevent immediate auto-scan
        setState('idle');
        if (cooldownTimerRef.current) {
          clearInterval(cooldownTimerRef.current);
          cooldownTimerRef.current = null;
        }
        // Clear the flag after a short delay to allow manual scans
        setTimeout(() => {
          justExitedCooldownRef.current = false;
        }, 500);
      }
    }, 100);
    
    return () => {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    };
  }, [state]);

  const clearResult = () => {
    setResult(null);
    setError(null);
    setPreviewUrl(null);
    setState('idle');
    setCooldownRemaining(0);
  };

  const triggerCameraCapture = () => {
    if (state === 'idle' && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const isReady = usesCameraCapture || mediaStream;
  const canCapture = state === 'idle' && isReady;

  // Lock in buy price and end cooldown early
  const handleLockIn = useCallback(async () => {
    if (!result || state !== 'cooldown') return;
    
    const price = buyPriceInput ? parseFloat(buyPriceInput) : null;
    const maxBuy = result.maxBuy ?? 0;
    console.log('[LiveCapture] Locking in buy price:', price);
    
    // Play sound based on verdict
    if (soundEnabled && price !== null && maxBuy > 0) {
      const isFlip = price <= maxBuy;
      const audio = new Audio(isFlip ? '/sounds/flip.mp3' : '/sounds/skip.mp3');
      audio.play().catch(() => {});
    }
    
    // Learn from this scan - add image to visual library (background, don't await)
    if (lastImageBase64Ref.current && result.title && result.confidence >= 70) {
      fetch('/api/live-capture/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          imageBase64: lastImageBase64Ref.current,
          category: result.category || 'other',
          title: result.title,
          brand: null,
          model: null,
          confidence: result.confidence,
        }),
      }).then(res => res.json())
        .then(data => {
          if (data.imageAdded) {
            console.log('[LiveCapture] Image added to library');
          }
        })
        .catch(err => console.warn('[LiveCapture] Learn failed:', err));
    }
    
    // End cooldown early - ready for next scan
    setCooldownRemaining(0);
    setState('idle');
    setBuyPriceInput(''); // Clear for next scan
    toast({
      title: price !== null && maxBuy > 0 ? (price <= maxBuy ? "Flip locked in!" : "Skip noted") : "Analysis complete",
      description: price !== null && maxBuy > 0 ? `Buy: $${price} → Sell: $${maxBuy * 2}` : "Ready for next scan",
    });
  }, [result, state, buyPriceInput, soundEnabled, toast]);

  // Start a new scan - only works when state === 'idle'
  const handleStartScan = useCallback(async () => {
    console.log('[LiveCapture] handleStartScan called, state:', state);
    
    // Guard: Only allow new scans when state is idle
    if (state !== 'idle') {
      console.log('[LiveCapture] EARLY EXIT: handleStartScan blocked - not idle, state:', state);
      return;
    }
    
    // === HARD RESET all run-specific state BEFORE scan ===
    console.log('[LiveCapture] Hard reset before scan');
    setResult(null);
    setError(null);
    setPreviewUrl(null);
    hasResultRef.current = false;
    lastHashRef.current = null;
    lastImageBase64Ref.current = null;
    cacheRef.current = []; // Clear cache to force fresh analysis
    
    if (!mediaStream && !usesCameraCapture) {
      await startScreenCapture();
    } else {
      captureScreenFrame();
    }
  }, [state, mediaStream, usesCameraCapture, startScreenCapture, captureScreenFrame]);

  // Lock in during cooldown - only works when state === 'cooldown'
  const handleClickIt = useCallback(async () => {
    console.log('[LiveCapture] Button clicked, state:', state, 'result:', !!result);
    
    // During cooldown: lock in the price
    if (state === 'cooldown') {
      if (result) {
        console.log('[LiveCapture] Calling handleLockIn...');
        handleLockIn();
      } else {
        console.log('[LiveCapture] EARLY EXIT: cooldown but no result');
      }
      return;
    }
    
    // Idle state: start a new scan
    if (state === 'idle') {
      handleStartScan();
      return;
    }
    
    console.log('[LiveCapture] EARLY EXIT: button blocked, state:', state);
  }, [state, result, handleLockIn, handleStartScan]);

  // Pop out controls in a new smaller window for side-by-side use
  const popOutWindow = useCallback(() => {
    const width = 400;
    const height = 500;
    const left = window.screen.width - width - 50;
    const top = 50;
    
    // Open a new window with the live capture page
    const popup = window.open(
      '/live-capture?popout=true',
      'margin-live-capture',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no`
    );
    
    if (popup) {
      toast({
        title: "Split Screen Setup",
        description: "Position this window next to your auction tab. Both will stay visible.",
      });
    } else {
      toast({
        title: "Pop-up Blocked",
        description: "Please allow pop-ups for this site and try again.",
        variant: "destructive"
      });
    }
  }, [toast]);

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 flex flex-col" data-testid="live-capture-page">
      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCameraCapture}
        className="hidden"
        data-testid="input-camera-capture"
      />

      <header className="flex items-center justify-between px-3 py-2 bg-black border-b border-neutral-800 gap-2">
        <div className="flex items-center gap-2">
          <Button 
            size="icon" 
            variant="ghost" 
            className="text-neutral-400" 
            onClick={exitLiveCapture}
            data-testid="button-exit"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <span className="font-bold text-lg text-live-capture-secondary">LIVE CAPTURE</span>
          {mediaStream && (
            <span className="flex items-center gap-1 text-xs text-live-capture-secondary">
              <span className="w-2 h-2 rounded-full animate-pulse bg-live-capture" />
              Active
            </span>
          )}
        </div>
        {/* Header controls - Pop Out for side-by-side, plus status */}
        <div className="flex items-center gap-2 text-sm">
          {mediaStream && (
            <Button
              size="sm"
              variant="ghost"
              onClick={popOutWindow}
              className="text-neutral-400 hover:text-live-capture-secondary"
              title="Open in new window for side-by-side view"
              data-testid="button-pop-out"
            >
              <ExternalLink className="w-4 h-4 mr-1" />
              Pop Out
            </Button>
          )}
          {(state === 'capturing' || state === 'scanning') && (
            <span className="flex items-center gap-1 text-neutral-400">
              <Loader2 className="w-4 h-4 animate-spin" />
            </span>
          )}
          {state === 'cooldown' && result && (
            <span className={`flex items-center gap-1 font-bold ${
              result.verdict === 'flip' ? 'text-green-400' : 
              result.verdict === 'skip' ? 'text-red-400' : 'text-yellow-400'
            }`}>
              {result.verdict === 'flip' ? 'FLIP' : result.verdict === 'skip' ? 'SKIP' : 'REVIEW'}
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* TWO-ZONE LAYOUT: Video viewport (untouched) + Decision console (Margin UI) */}
        {!usesCameraCapture && mediaStream && (
          <div className="flex-1 flex flex-col">
            {/* TOP CONTROL BAR - Compact, blends with video */}
            <div className="bg-black px-3 py-2">
              <Button
                onClick={handleClickIt}
                disabled={state === 'capturing' || state === 'scanning'}
                className={`w-full h-10 font-bold text-sm rounded-md transition-all ${
                  state === 'idle' 
                    ? 'bg-primary hover:bg-primary/90 text-white cursor-pointer' 
                    : state === 'cooldown'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                    : 'bg-neutral-700 text-neutral-400 cursor-not-allowed opacity-60'
                }`}
                data-testid="button-lock-it-in"
              >
                {state === 'idle' && (
                  <span className="flex items-center justify-center gap-2">
                    <Zap className="w-4 h-4" />
                    LOCK IT IN
                  </span>
                )}
                {(state === 'capturing' || state === 'scanning') && (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing...
                  </span>
                )}
                {state === 'cooldown' && (
                  <span className="flex items-center justify-center gap-2">
                    <Zap className="w-4 h-4" />
                    NEXT ITEM
                  </span>
                )}
              </Button>
            </div>
            
            {/* ZONE 1: Video Viewport - Hidden in compact mode for side-by-side use */}
            {!compactMode && (
              <div className="relative flex-1 bg-black flex items-start justify-center overflow-hidden">
                <div className="relative w-full h-full">
                  <video 
                    ref={videoRef} 
                    className="w-full h-full object-cover object-top"
                    playsInline 
                    muted 
                    autoPlay
                  />
                  
                  {/* RIGHT SIDE - Animated curtain + Result Panel */}
                  <AnimatePresence>
                    {result && (
                      <>
                        {/* Curtain backdrop that slides in - extends to card edge */}
                        <motion.div
                          initial={{ x: "100%" }}
                          animate={{ x: 0 }}
                          exit={{ x: "100%" }}
                          transition={{ type: "spring", damping: 25, stiffness: 200 }}
                          className="absolute top-0 bottom-0 right-0 w-[320px] bg-gradient-to-l from-black via-black to-black/80 pointer-events-none z-10"
                        />
                        
                        {/* Result card with flip animation */}
                        <motion.div
                          initial={{ opacity: 0, rotateY: -90, x: 20 }}
                          animate={{ opacity: 1, rotateY: 0, x: 0 }}
                          exit={{ opacity: 0, rotateY: 90, x: 20 }}
                          transition={{ type: "spring", damping: 20, stiffness: 150, delay: 0.1 }}
                          className="absolute top-4 right-4 w-72 z-20"
                          style={{ perspective: "1000px", transformStyle: "preserve-3d" }}
                        >
                        <div className={`rounded-2xl overflow-hidden shadow-2xl border-2 ${
                          result.verdict === 'flip' ? 'border-emerald-500 shadow-emerald-500/30' :
                          result.verdict === 'skip' ? 'border-red-500 shadow-red-500/30' :
                          result.verdict === 'max_buy' ? 'border-primary shadow-primary/30' :
                          'border-neutral-600'
                        } bg-neutral-900`}>
                          {/* Header with branding - colored accent */}
                          <div className={`px-4 py-2 flex items-center justify-between ${
                            result.verdict === 'flip' ? 'bg-gradient-to-r from-emerald-900/80 to-neutral-900' :
                            result.verdict === 'skip' ? 'bg-gradient-to-r from-red-900/80 to-neutral-900' :
                            result.verdict === 'max_buy' ? 'bg-gradient-to-r from-primary/30 to-neutral-900' :
                            'bg-neutral-800'
                          }`}>
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full animate-pulse ${
                                result.verdict === 'flip' ? 'bg-emerald-500' :
                                result.verdict === 'skip' ? 'bg-red-500' :
                                'bg-primary'
                              }`} />
                              <span className="text-xs font-medium text-neutral-400 uppercase tracking-wide">MarginLive</span>
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-neutral-400 hover:text-neutral-600"
                              onClick={clearResult}
                              data-testid="button-close-overlay"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                          
                          {result.verdict === 'insufficient_data' ? (
                            <div className="p-5 text-center">
                              <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-500" />
                              <p className="text-base font-semibold text-neutral-800 dark:text-white">Low Confidence</p>
                              <p className="text-xs text-neutral-500 mt-1">Try a clearer shot</p>
                            </div>
                          ) : result.verdict === 'max_buy' ? (
                            <div className="p-5 text-center">
                              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">
                                Maximum Buy Price
                              </p>
                              <p className="text-4xl font-black text-neutral-900 dark:text-white">
                                ${result.maxBuy || '—'}
                              </p>
                              {result.sellEstimate && result.sellEstimate.low > 0 && (
                                <p className="text-sm text-neutral-500 mt-2">
                                  Expected sale ~${Math.round((result.sellEstimate.low + result.sellEstimate.high) / 2)}
                                </p>
                              )}
                            </div>
                          ) : result.verdict === 'flip' ? (
                            <div className="p-5">
                              <div className="flex items-center justify-center gap-2 mb-3">
                                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                                <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">Good Flip</span>
                              </div>
                              <div className="grid grid-cols-2 gap-3 text-center">
                                <div className="bg-neutral-100 dark:bg-neutral-800 rounded-xl p-3">
                                  <p className="text-xs text-neutral-500">Max Buy</p>
                                  <p className="text-xl font-bold text-neutral-900 dark:text-white">${result.maxBuy}</p>
                                </div>
                                <div className="bg-emerald-50 dark:bg-emerald-900/30 rounded-xl p-3">
                                  <p className="text-xs text-emerald-600 dark:text-emerald-400">Margin</p>
                                  <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{result.marginPercent?.toFixed(0)}%</p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="p-5">
                              <div className="flex items-center justify-center gap-2 mb-3">
                                <div className="w-3 h-3 rounded-full bg-red-500" />
                                <span className="text-lg font-bold text-red-600 dark:text-red-400">Skip This One</span>
                              </div>
                              <div className="grid grid-cols-2 gap-3 text-center">
                                <div className="bg-neutral-100 dark:bg-neutral-800 rounded-xl p-3">
                                  <p className="text-xs text-neutral-500">Max Buy</p>
                                  <p className="text-xl font-bold text-neutral-900 dark:text-white">${result.maxBuy}</p>
                                </div>
                                <div className="bg-red-50 dark:bg-red-900/30 rounded-xl p-3">
                                  <p className="text-xs text-red-600 dark:text-red-400">Margin</p>
                                  <p className="text-xl font-bold text-red-600 dark:text-red-400">{result.marginPercent?.toFixed(0)}%</p>
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* Item info footer */}
                          <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-700">
                            <p className="text-sm text-neutral-700 dark:text-neutral-300 font-medium line-clamp-1">{result.title}</p>
                            <p className="text-xs text-neutral-500">{result.category} · {result.compsCount} comps</p>
                          </div>
                        </div>
                      </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}
            
            {/* Hidden video element to keep capture active in compact mode */}
            {compactMode && (
              <video 
                ref={videoRef} 
                className="hidden"
                playsInline 
                muted 
                autoPlay
              />
            )}
            
            {/* ZONE 2: Status Bar - Minimal footer with stats and tools */}
            <div className="bg-neutral-900 border-t border-neutral-700 px-4 py-2">
              <div className="max-w-2xl mx-auto flex items-center justify-between">
                {/* Session Stats - Left side */}
                <div className="flex items-center gap-4 text-xs">
                  {sessionStats.scans > 0 ? (
                    <>
                      <div className="flex items-center gap-1 text-neutral-400">
                        <Zap className="w-3 h-3" />
                        <span>{sessionStats.scans} scans</span>
                      </div>
                      <div className="flex items-center gap-1 text-emerald-400">
                        <TrendingUp className="w-3 h-3" />
                        <span>{sessionStats.flips} flips</span>
                      </div>
                      {sessionStats.potentialProfit > 0 && (
                        <div className="text-emerald-400 font-semibold">
                          +${sessionStats.potentialProfit.toFixed(0)}
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-neutral-500">
                      <kbd className="px-1 rounded bg-neutral-800 mr-1">Space</kbd> to capture
                    </span>
                  )}
                </div>

                {/* Tool Controls - Right side */}
                <div className="flex items-center gap-1">
                  <Button 
                    size="sm" 
                    variant={voiceEnabled ? "outline" : "ghost"}
                    onClick={() => setVoiceEnabled(!voiceEnabled)}
                    title="Voice"
                    data-testid="button-voice-toggle"
                  >
                    {voiceEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                  </Button>
                  <Button 
                    size="sm" 
                    variant={soundEnabled ? "outline" : "ghost"}
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    title="Sound"
                    data-testid="button-sound-toggle"
                  >
                    {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  </Button>
                  <Button 
                    size="sm" 
                    variant={autoScanEnabled ? "outline" : "ghost"}
                    onClick={() => setAutoScanEnabled(!autoScanEnabled)}
                    title={`Auto-scan every ${autoScanInterval}s`}
                    data-testid="button-auto-scan"
                  >
                    {autoScanEnabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>
                  <Button 
                    size="sm" 
                    variant={pipActive ? "outline" : "ghost"}
                    onClick={togglePiP}
                    title="PiP"
                    data-testid="button-pip"
                  >
                    <PictureInPicture2 className="w-4 h-4" />
                  </Button>
                  <Button 
                    size="sm" 
                    variant={focusMode ? "outline" : "ghost"}
                    onClick={() => setFocusMode(!focusMode)}
                    title="Focus"
                    data-testid="button-focus-mode"
                  >
                    <Focus className="w-4 h-4" />
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={changeSource}
                    title="Source"
                    data-testid="button-change-source"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={stopCapture}
                    title="Stop"
                    data-testid="button-stop"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Non-streaming state: CLICK IT is the single primary action */}
        {!mediaStream && !usesCameraCapture && (
          <div className="flex-1 flex flex-col items-center justify-center p-6">
            <div className="text-center space-y-6 max-w-md">
              <div className="space-y-4">
                <div className="mb-4">
                  <h2 className="text-3xl font-bold text-white mb-2">
                    Margin<span className="text-primary relative">
                      Live
                      <span className="absolute -right-2 -top-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    </span>
                  </h2>
                  <p className="text-neutral-400 text-sm">Watch auctions. Know your max. Win smart.</p>
                </div>
                <Button 
                  onClick={handleClickIt}
                  disabled={state !== 'idle'}
                  size="lg"
                  className="w-full text-xl font-black bg-primary hover:bg-primary/90"
                  data-testid="button-click-it-main"
                >
                  {state === 'idle' ? 'GO LIVE' : <Loader2 className="w-8 h-8 animate-spin" />}
                </Button>
              </div>
              
              <p className="text-neutral-500 text-sm">
                A picker will appear - click the <span className="text-neutral-400">"Chrome Tab"</span> option,
                <br />
                then select the tab you want to monitor.
              </p>
              
              {permissionDenied && (
                <div className="p-4 rounded-lg bg-neutral-800 border border-neutral-600 text-neutral-300 text-center">
                  <p className="text-sm text-neutral-400">
                    Click CLICK IT and select a screen or window to continue.
                  </p>
                  {denialCount >= 2 && platform === 'macos-app' && (
                    <p className="text-xs text-neutral-500 mt-2 border-t border-neutral-700 pt-2">
                      Check System Settings → Privacy & Security → Screen Recording
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mobile camera mode */}
        {usesCameraCapture && (
          <div className="flex-1 flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-lg space-y-4">
              <div className="text-center mb-4">
                <h2 className="text-3xl font-bold text-white mb-2">
                  Margin<span className="text-primary relative">
                    Live
                    <span className="absolute -right-2 -top-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  </span>
                </h2>
                <p className="text-neutral-400 text-sm">Snap items. Know your max. Flip smart.</p>
              </div>
              <Button
                onClick={triggerCameraCapture}
                disabled={state !== 'idle'}
                size="lg"
                className="w-full text-xl font-black bg-primary hover:bg-primary/90"
                data-testid="button-click-it-mobile"
              >
                {state === 'idle' && 'CAPTURE'}
                {(state === 'capturing' || state === 'scanning') && <Loader2 className="w-5 h-5 animate-spin" />}
                {state === 'cooldown' && (result ? (result.verdict === 'flip' ? 'FLIP!' : 'SKIP') : 'NEXT')}
              </Button>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="p-4 rounded-lg bg-neutral-800 border border-neutral-600 text-neutral-300 text-center"
                  >
                    <AlertTriangle className="w-5 h-5 mx-auto mb-2 text-neutral-400" />
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              {previewUrl && !result && (
                <div className="rounded-lg overflow-hidden bg-neutral-800">
                  <img src={previewUrl} alt="Captured" className="w-full h-40 object-contain" />
                </div>
              )}

              <AnimatePresence>
                {result && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="relative"
                  >
                    <Button
                      size="icon"
                      variant="ghost"
                      className="absolute -top-2 -right-2 z-10 rounded-full bg-neutral-700 text-neutral-400"
                      onClick={clearResult}
                      data-testid="button-clear-result"
                    >
                      ×
                    </Button>

                    <div className="rounded-xl bg-neutral-800 border border-neutral-700 overflow-hidden">
                      {result.verdict === 'insufficient_data' ? (
                        <div className="bg-neutral-700 p-4 text-center">
                          <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-neutral-400" />
                          <p className="text-lg font-bold text-neutral-300">INSUFFICIENT DATA</p>
                          <p className="text-sm text-neutral-500">Confidence too low to judge</p>
                        </div>
                      ) : result.verdict === 'max_buy' ? (
                        <div className="bg-gradient-to-b from-amber-900/50 to-neutral-800 p-6">
                          <div className="text-center mb-4">
                            <motion.div
                              initial={{ scale: 0, rotate: -10 }}
                              animate={{ scale: 1, rotate: 0 }}
                              transition={{ type: "spring", stiffness: 200 }}
                              className="inline-block"
                            >
                              <p className="text-2xl font-black text-amber-400 uppercase tracking-wide">
                                Don't Pay More Than
                              </p>
                            </motion.div>
                          </div>
                          <motion.p
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.1, type: "spring" }}
                            className="text-6xl font-black text-white text-center mb-3"
                            data-testid="text-max-buy"
                          >
                            ${result.maxBuy || '—'}
                          </motion.p>
                          {result.sellEstimate && result.sellEstimate.low > 0 && result.sellEstimate.high > 0 && (
                            <motion.div 
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.2 }}
                              className="text-center space-y-2"
                            >
                              <p className="text-sm text-neutral-400">
                                Sells for <span className="text-white font-semibold">${Math.round((result.sellEstimate.low + result.sellEstimate.high) / 2)}</span> avg
                              </p>
                              {result.marginPercent && result.marginPercent > 25 && (
                                <p className="text-xs text-emerald-400 font-medium">
                                  {result.marginPercent.toFixed(0)}% profit potential
                                </p>
                              )}
                            </motion.div>
                          )}
                          <motion.p 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.3 }}
                            className="text-xs text-amber-500/80 text-center mt-3 uppercase tracking-wider"
                          >
                            Pay less = bigger margins
                          </motion.p>
                        </div>
                      ) : result.verdict === 'flip' ? (
                        <div className="bg-emerald-900/40 p-5">
                          <p className="text-3xl font-black text-emerald-400 mb-3">FLIP IT</p>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div>
                              <p className="text-xs text-neutral-500 uppercase">Market</p>
                              <p className="text-lg font-bold text-white">
                                ${result.sellEstimate ? Math.round((result.sellEstimate.low + result.sellEstimate.high) / 2) : '—'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-neutral-500 uppercase">Max Buy</p>
                              <p className="text-lg font-bold text-white">${result.maxBuy || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-neutral-500 uppercase">Margin</p>
                              <p className="text-lg font-bold text-emerald-400">{result.marginPercent?.toFixed(0)}%</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-red-900/40 p-5">
                          <p className="text-3xl font-black text-red-400 mb-3">SKIP IT</p>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div>
                              <p className="text-xs text-neutral-500 uppercase">Market</p>
                              <p className="text-lg font-bold text-white">
                                ${result.sellEstimate ? Math.round((result.sellEstimate.low + result.sellEstimate.high) / 2) : '—'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-neutral-500 uppercase">Max Buy</p>
                              <p className="text-lg font-bold text-white">${result.maxBuy || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-neutral-500 uppercase">Margin</p>
                              <p className="text-lg font-bold text-red-400">{result.marginPercent?.toFixed(0)}%</p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="p-4 space-y-3">
                        <div>
                          <p className="font-semibold text-white line-clamp-2" data-testid="text-title">
                            {result.title}
                          </p>
                          <p className="text-sm text-neutral-500">{result.category}</p>
                        </div>

                        {/* Quick Price Check - enter current bid to see if it's a flip */}
                        {result.verdict === 'max_buy' && result.maxBuy && (
                          <div className="bg-neutral-900 rounded-lg p-3">
                            <p className="text-xs text-neutral-400 mb-2 text-center">Quick check: Is this price a flip?</p>
                            <div className="flex gap-2">
                              <Input
                                type="number"
                                inputMode="decimal"
                                placeholder="Current bid..."
                                value={buyPriceInput}
                                onChange={(e) => setBuyPriceInput(e.target.value)}
                                className="bg-neutral-800 border-neutral-700 text-neutral-100 text-center flex-1"
                                data-testid="input-quick-price-check"
                              />
                              {buyPriceInput && parseFloat(buyPriceInput) > 0 && (
                                <div className={`px-4 py-2 rounded-lg font-bold text-lg flex items-center ${
                                  parseFloat(buyPriceInput) <= result.maxBuy 
                                    ? 'bg-emerald-500/20 text-emerald-400' 
                                    : 'bg-red-500/20 text-red-400'
                                }`}>
                                  {parseFloat(buyPriceInput) <= result.maxBuy ? 'FLIP' : 'SKIP'}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 text-sm">
                          {result.sellEstimate && result.sellEstimate.low > 0 && (
                            <div className="bg-neutral-900 rounded-lg p-3">
                              <p className="text-neutral-500 text-xs">Sell Est.</p>
                              <p className="font-bold text-neutral-200">
                                ${result.sellEstimate.low}–${result.sellEstimate.high}
                              </p>
                            </div>
                          )}
                          <div className="bg-neutral-900 rounded-lg p-3">
                            <p className="text-neutral-500 text-xs">Confidence</p>
                            <p className="font-bold text-neutral-200">{result.confidence}%</p>
                          </div>
                        </div>

                        <p className="text-xs text-neutral-500 text-center">
                          Fees + shipping included · {result.compsCount} comps
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </main>

      <footer className="p-4 border-t border-neutral-700 text-center text-xs text-neutral-500">
        {usesCameraCapture ? (
          <p>Tap to capture</p>
        ) : mediaStream ? (
          <p>Press <kbd className="px-1 py-0.5 rounded bg-neutral-800">Esc</kbd> to clear · <kbd className="px-1 py-0.5 rounded bg-neutral-800">Space</kbd> to capture</p>
        ) : (
          <p>Select a screen to begin</p>
        )}
      </footer>
    </div>
  );
}
