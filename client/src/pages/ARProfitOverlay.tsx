import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Camera, X, Loader2, TrendingUp, TrendingDown, 
  Target, Zap, ArrowLeft, Volume2, VolumeX, Monitor,
  Check, Ban, ShoppingCart, Search, Trash2, Package
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";

type ScanResult = {
  title: string;
  category: string;
  maxBuy: number | null;
  expectedSale: number | null;
  profit: number | null;
  marginPercent: number | null;
  verdict: 'flip' | 'skip' | 'risky';
  confidence: number;
  compsCount: number;
  thumbnail?: string;
};

type CapturedItem = ScanResult & {
  id: string;
  capturedAt: Date;
};

type OverlayState = 'ready' | 'capturing' | 'analyzing' | 'result';

export default function ARProfitOverlay() {
  const isMobile = useIsMobile();
  const [state, setState] = useState<OverlayState>('ready');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [capturedItems, setCapturedItems] = useState<CapturedItem[]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const [currentThumbnail, setCurrentThumbnail] = useState<string | null>(null);
  const [itemToAdd, setItemToAdd] = useState<CapturedItem | null>(null);
  const [purchasePrice, setPurchasePrice] = useState("");
  const [isAddingToInventory, setIsAddingToInventory] = useState(false);
  const [showMarginDetail, setShowMarginDetail] = useState(false);
  const [scanMode, setScanMode] = useState<'flip' | 'buy'>('flip');
  
  // Check camera preference from Settings
  const cameraPreferenceEnabled = localStorage.getItem('margin_camera_enabled') === 'true';
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const startCamera = useCallback(async () => {
    // Guard: never auto-request camera if preference is disabled
    const cameraEnabled = localStorage.getItem('margin_camera_enabled') === 'true';
    if (!cameraEnabled) {
      return;
    }
    
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
        setCameraStarted(true);
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        toast({ title: "Camera access denied", variant: "destructive" });
      } else {
        toast({ title: "Camera error", description: err.message, variant: "destructive" });
      }
    }
  }, [toast]);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setCameraStarted(false);
    }
  }, [stream]);

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Don't auto-start camera - wait for user to tap the start button
  // This prevents the permission dialog from appearing on every page load

  // Handle file selection when camera is disabled
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setState('analyzing');
    setError(null);
    
    const reader = new FileReader();
    reader.onload = async () => {
      const imageDataUrl = reader.result as string;
      setCurrentThumbnail(imageDataUrl);
      
      try {
        const response = await apiRequest("POST", "/api/ar-overlay/scan", {
          image: imageDataUrl,
        });
        
        const data = await response.json();
        
        if (data.error) {
          setError(data.error);
          setState('ready');
        } else {
          setResult({ ...data, thumbnail: imageDataUrl });
          setState('result');
          
          if (soundEnabled) {
            try {
              const soundFile = data.verdict === 'flip' ? '/sounds/flip.mp3' : '/sounds/skip.mp3';
              const audio = new Audio(soundFile);
              audio.volume = 0.5;
              audio.play().catch(() => {});
            } catch {}
          }
        }
      } catch (err) {
        setError("Failed to analyze item");
        setState('ready');
      }
    };
    reader.readAsDataURL(file);
    
    // Reset input so same file can be selected again
    e.target.value = '';
  }, [soundEnabled]);

  const captureAndAnalyze = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    setState('capturing');
    setError(null);
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    
    // Create small thumbnail for queue (100x100 max) to save memory
    const thumbCanvas = document.createElement('canvas');
    const thumbSize = 100;
    const scale = Math.min(thumbSize / video.videoWidth, thumbSize / video.videoHeight);
    thumbCanvas.width = video.videoWidth * scale;
    thumbCanvas.height = video.videoHeight * scale;
    const thumbCtx = thumbCanvas.getContext('2d');
    if (thumbCtx) {
      thumbCtx.drawImage(video, 0, 0, thumbCanvas.width, thumbCanvas.height);
      setCurrentThumbnail(thumbCanvas.toDataURL('image/jpeg', 0.5));
    }
    
    setState('analyzing');
    
    try {
      const response = await apiRequest("POST", "/api/ar-overlay/scan", {
        image: imageDataUrl,
      });
      
      const data = await response.json();
      
      if (data.error) {
        setError(data.error);
        setState('ready');
      } else {
        // Show result overlay (works for both Flip and Buy modes)
        setResult({ ...data, thumbnail: imageDataUrl });
        setState('result');
        
        if (soundEnabled) {
          try {
            const soundFile = data.verdict === 'flip' ? '/sounds/flip.mp3' : '/sounds/skip.mp3';
            const audio = new Audio(soundFile);
            audio.volume = 0.5;
            audio.play().catch(() => {});
          } catch {}
        }
      }
    } catch (err) {
      setError("Failed to analyze item");
      setState('ready');
    }
  }, [soundEnabled, scanMode, stopCamera, toast, setLocation]);

  const handleFlip = useCallback(() => {
    if (!result) return;
    
    const newItem: CapturedItem = {
      ...result,
      id: Date.now().toString(),
      capturedAt: new Date(),
      thumbnail: currentThumbnail || undefined,
    };
    
    // Limit queue to 20 items to prevent memory bloat
    setCapturedItems(prev => [...prev, newItem].slice(-20));
    
    toast({
      title: "Saved!",
      description: `${result.title} added to your catches`,
    });
    
    setResult(null);
    setCurrentThumbnail(null);
    setState('ready');
    // Ensure camera is still running
    if (!stream || stream.getTracks().some(t => t.readyState === 'ended')) {
      startCamera();
    }
  }, [result, currentThumbnail, toast, stream, startCamera]);

  const handleSkip = useCallback(() => {
    setResult(null);
    setCurrentThumbnail(null);
    setState('ready');
    // Ensure camera is still running
    if (!stream || stream.getTracks().some(t => t.readyState === 'ended')) {
      startCamera();
    }
  }, [stream, startCamera]);

  const handleExit = useCallback(() => {
    if (capturedItems.length > 0) {
      setShowSummary(true);
    } else {
      stopCamera();
      setLocation("/deep-scan");
    }
  }, [capturedItems.length, stopCamera, setLocation]);

  const handleFullScan = useCallback((item: CapturedItem) => {
    stopCamera();
    setLocation(`/deep-scan?title=${encodeURIComponent(item.title)}&category=${encodeURIComponent(item.category)}`);
  }, [stopCamera, setLocation]);

  const openAddDialog = useCallback((item: CapturedItem) => {
    setItemToAdd(item);
    setPurchasePrice(item.maxBuy?.toString() || "");
  }, []);

  const handleAddToInventory = useCallback(async () => {
    if (!itemToAdd) return;
    
    const price = parseFloat(purchasePrice);
    if (isNaN(price) || price < 0) {
      toast({ title: "Please enter a valid purchase price", variant: "destructive" });
      return;
    }
    
    setIsAddingToInventory(true);
    try {
      await apiRequest("POST", "/api/inventory", {
        title: itemToAdd.title,
        purchasePrice: price.toString(),
        estimatedResale: itemToAdd.expectedSale?.toString() || null,
        category: itemToAdd.category,
        imageUrl: itemToAdd.thumbnail || null,
      });
      
      toast({
        title: "Added to Inventory",
        description: itemToAdd.title,
      });
      
      setCapturedItems(prev => prev.filter(i => i.id !== itemToAdd.id));
      setItemToAdd(null);
      setPurchasePrice("");
    } catch {
      toast({
        title: "Failed to add",
        variant: "destructive",
      });
    } finally {
      setIsAddingToInventory(false);
    }
  }, [itemToAdd, purchasePrice, toast]);

  const handleRemoveItem = useCallback((itemId: string) => {
    setCapturedItems(prev => prev.filter(i => i.id !== itemId));
  }, []);

  const handleCloseSummary = useCallback(() => {
    setShowSummary(false);
    setCapturedItems([]);
    stopCamera();
    setLocation("/deep-scan");
  }, [stopCamera, setLocation]);

  if (!isMobile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Monitor className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Mobile Only Feature</h1>
          <p className="text-muted-foreground mb-6">
            Scan is designed for mobile devices. Open this page on your phone to point your camera at items and see instant profit potential.
          </p>
          <Button 
            className="w-full" 
            data-testid="button-deep-scan"
            onClick={() => setLocation("/deep-scan")}
          >
            <Search className="w-4 h-4 mr-2" />
            Use Deep Scan
          </Button>
        </Card>
      </div>
    );
  }

  const getVerdictColor = (verdict: string) => {
    switch (verdict) {
      case 'flip': return 'text-green-500';
      case 'skip': return 'text-red-500';
      case 'risky': return 'text-yellow-500';
      default: return 'text-muted-foreground';
    }
  };

  const getVerdictBg = (verdict: string) => {
    switch (verdict) {
      case 'flip': return 'bg-green-500/20 border-green-500/50';
      case 'skip': return 'bg-red-500/20 border-red-500/50';
      case 'risky': return 'bg-yellow-500/20 border-yellow-500/50';
      default: return 'bg-muted/50';
    }
  };

  const totalPotentialProfit = capturedItems.reduce((sum, item) => sum + (item.profit || 0), 0);

  return (
    <div className="fixed inset-0 bg-black" data-testid="ar-overlay-container">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onLoadedMetadata={(e) => {
          const video = e.currentTarget;
          video.play().catch(() => {});
        }}
        className="absolute inset-0 w-full h-full object-cover"
        data-testid="ar-video-feed"
      />
      <canvas ref={canvasRef} className="hidden" />
      
      <div className="absolute inset-0 pointer-events-none">
        <div className={`absolute top-4 left-4 right-4 flex justify-between items-center pointer-events-auto transition-opacity duration-300 ${(state === 'capturing' || state === 'analyzing') ? 'opacity-30' : 'opacity-100'}`}>
          <div className="flex items-center gap-2">
            <Button 
              size="icon" 
              variant="ghost" 
              className="bg-black/50 text-white" 
              data-testid="button-back-ar"
              onClick={handleExit}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            {capturedItems.length > 0 && (
              <Button
                variant="ghost"
                className="bg-green-500/30 text-white px-2 h-8 text-xs"
                onClick={() => setShowSummary(true)}
                data-testid="button-view-catches"
              >
                <Package className="w-3 h-3 mr-1" />
                {capturedItems.length}
              </Button>
            )}
          </div>
          
          {/* Flip/Buy Toggle - Secondary Interpretation Switch */}
          <div className="absolute left-1/2 -translate-x-1/2 flex bg-black/40 rounded-full p-0.5 border border-white/10" data-testid="toggle-scan-mode">
            <button
              onClick={() => setScanMode('flip')}
              className={`px-2.5 py-0.5 text-[10px] font-medium rounded-full transition-all ${
                scanMode === 'flip' 
                  ? 'bg-white/15 text-white/80' 
                  : 'text-white/30 hover:text-white/50'
              }`}
              data-testid="button-mode-flip"
            >
              Flip
            </button>
            <button
              onClick={() => setScanMode('buy')}
              className={`px-2.5 py-0.5 text-[10px] font-medium rounded-full transition-all ${
                scanMode === 'buy' 
                  ? 'bg-white/15 text-white/80' 
                  : 'text-white/30 hover:text-white/50'
              }`}
              data-testid="button-mode-buy"
            >
              Buy
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            {!soundEnabled && (
              <Button 
                size="icon" 
                variant="ghost" 
                className="bg-black/50 text-white"
                onClick={() => setSoundEnabled(true)}
                data-testid="button-sound-toggle"
              >
                <VolumeX className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>
        
        {state === 'ready' && !cameraStarted && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
            <div className="text-center">
              <div className="mb-6">
                <h1 className="text-3xl font-bold text-white">Margin<span className="text-pulse">Scan</span></h1>
                <p className="text-white/60 text-sm mt-1">Point. Scan. Profit.</p>
              </div>
              {cameraPreferenceEnabled ? (
                <Button 
                  onClick={startCamera}
                  className="bg-primary text-white px-8 py-6 text-lg rounded-xl margin-pulse"
                  data-testid="button-start-camera"
                >
                  <Camera className="w-6 h-6 mr-3" />
                  Start Scanning
                </Button>
              ) : (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Button 
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-primary text-white px-8 py-6 text-lg rounded-xl margin-pulse"
                    data-testid="button-select-photo"
                  >
                    <Camera className="w-6 h-6 mr-3" />
                    Take Photo
                  </Button>
                  <p className="text-white/40 text-xs mt-4">Camera disabled in Settings</p>
                </>
              )}
            </div>
          </div>
        )}
        
        {state === 'ready' && cameraStarted && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-72 h-72 border-2 border-white/30 rounded-lg relative">
              <div className={`absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 rounded-tl-lg ${scanMode === 'buy' ? 'border-blue-500' : 'border-primary'}`} />
              <div className={`absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 rounded-tr-lg ${scanMode === 'buy' ? 'border-blue-500' : 'border-primary'}`} />
              <div className={`absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 rounded-bl-lg ${scanMode === 'buy' ? 'border-blue-500' : 'border-primary'}`} />
              <div className={`absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 rounded-br-lg ${scanMode === 'buy' ? 'border-blue-500' : 'border-primary'}`} />
              <div className="absolute inset-0 flex items-center justify-center">
                <Target className="w-10 h-10 text-white/40" />
              </div>
            </div>
          </div>
        )}
        
        {(state === 'capturing' || state === 'analyzing') && (
          <div className="absolute inset-0 flex items-center justify-center">
            {/* Dim overlay for focus */}
            <div className="absolute inset-0 bg-black/40 pointer-events-none" />
            
            {/* Scan brackets with lock-on animation */}
            <motion.div 
              className="w-72 h-72 relative"
              initial={{ scale: 1.1, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              {/* Top-left bracket */}
              <motion.div 
                className="absolute -top-1 -left-1 w-10 h-10 border-t-[3px] border-l-[3px] rounded-tl-md border-white/70"
                initial={{ x: -8, y: -8, opacity: 0.5 }}
                animate={{ x: 0, y: 0, opacity: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
              {/* Top-right bracket */}
              <motion.div 
                className="absolute -top-1 -right-1 w-10 h-10 border-t-[3px] border-r-[3px] rounded-tr-md border-white/70"
                initial={{ x: 8, y: -8, opacity: 0.5 }}
                animate={{ x: 0, y: 0, opacity: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
              {/* Bottom-left bracket */}
              <motion.div 
                className="absolute -bottom-1 -left-1 w-10 h-10 border-b-[3px] border-l-[3px] rounded-bl-md border-white/70"
                initial={{ x: -8, y: 8, opacity: 0.5 }}
                animate={{ x: 0, y: 0, opacity: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
              {/* Bottom-right bracket */}
              <motion.div 
                className="absolute -bottom-1 -right-1 w-10 h-10 border-b-[3px] border-r-[3px] rounded-br-md border-white/70"
                initial={{ x: 8, y: 8, opacity: 0.5 }}
                animate={{ x: 0, y: 0, opacity: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
              
              {/* Subtle scanning pulse */}
              <motion.div
                className="absolute inset-0 border border-white/20 rounded-sm"
                animate={{ opacity: [0.2, 0.5, 0.2] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              />
            </motion.div>
            
            {/* Status message */}
            <div className="absolute bottom-32 flex flex-col items-center gap-2">
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              >
                <Loader2 className="w-5 h-5 text-white/80 animate-spin" />
              </motion.div>
              <p className="text-white/90 font-medium text-sm tracking-wide">
                {state === 'capturing' ? 'Capturing image...' : 'Analyzing market data...'}
              </p>
            </div>
          </div>
        )}
        
        <AnimatePresence>
          {state === 'result' && result && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="absolute bottom-24 left-4 right-4 pointer-events-auto"
            >
              {scanMode === 'flip' ? (
                <Card className={`p-4 border-2 ${getVerdictBg(result.verdict)} backdrop-blur-xl`}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-2xl font-bold uppercase ${getVerdictColor(result.verdict)}`}>
                          {result.verdict === 'flip' ? 'FLIP IT!' : result.verdict === 'skip' ? 'SKIP' : 'RISKY'}
                        </span>
                        {result.verdict === 'flip' && (
                          <Zap className="w-6 h-6 text-green-500" />
                        )}
                      </div>
                      {result.title && result.title !== 'null' && (
                        <p className="text-sm text-white/70 truncate mt-1">{result.title}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-3 text-center mb-4">
                    <div className="bg-black/30 rounded-lg p-2">
                      <p className="text-xs text-white/50 mb-0.5">Max Buy</p>
                      <p className="text-lg font-bold text-white">
                        {result.maxBuy ? `$${result.maxBuy.toFixed(0)}` : '--'}
                      </p>
                    </div>
                    <div className="bg-black/30 rounded-lg p-2">
                      <p className="text-xs text-white/50 mb-0.5">Sells For</p>
                      <p className="text-lg font-bold text-white">
                        {result.expectedSale ? `$${result.expectedSale.toFixed(0)}` : '--'}
                      </p>
                    </div>
                    <div className="bg-black/30 rounded-lg p-2">
                      <p className="text-xs text-white/50 mb-0.5">Profit</p>
                      <p className={`text-lg font-bold ${result.verdict === 'flip' ? 'text-green-400 profit-pulse' : result.profit && result.profit > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {result.profit ? (result.profit > 0 ? '+' : '') + `$${result.profit.toFixed(0)}` : '--'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-white/70 border-white/30">
                        {result.category}
                      </Badge>
                      <span className="text-xs text-white/50">{result.compsCount} comps</span>
                    </div>
                    {result.marginPercent !== null && (
                      <button 
                        onClick={() => setShowMarginDetail(!showMarginDetail)}
                        className="flex items-center gap-1 text-sm bg-black/30 rounded-full px-2 py-1"
                        data-testid="button-toggle-margin"
                      >
                        {showMarginDetail ? (
                          <>
                            {result.marginPercent > 0 ? (
                              <TrendingUp className="w-4 h-4 text-green-400" />
                            ) : (
                              <TrendingDown className="w-4 h-4 text-red-400" />
                            )}
                            <span className={result.marginPercent > 0 ? 'text-green-400' : 'text-red-400'}>
                              {result.marginPercent.toFixed(0)}%
                            </span>
                          </>
                        ) : (
                          <TrendingUp className="w-4 h-4 text-white/50" />
                        )}
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <Button 
                      variant="outline"
                      className="bg-red-500/20 border-red-500/50 text-white"
                      onClick={handleSkip}
                      data-testid="button-skip"
                    >
                      <Ban className="w-4 h-4 mr-2" />
                      Skip
                    </Button>
                    <Button 
                      className="bg-green-500 text-white"
                      onClick={handleFlip}
                      data-testid="button-flip-save"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Lock It In!
                    </Button>
                  </div>
                </Card>
              ) : (
                <Card className="p-4 border-2 border-blue-500/50 bg-blue-500/20 backdrop-blur-xl">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold text-blue-400">
                          MARKET CHECK
                        </span>
                        <Target className="w-6 h-6 text-blue-400" />
                      </div>
                      {result.title && result.title !== 'null' && (
                        <p className="text-sm text-white/70 truncate mt-1">{result.title}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 text-center mb-4">
                    <div className="bg-black/30 rounded-lg p-3">
                      <p className="text-xs text-white/50 mb-0.5">Worth Paying</p>
                      <p className="text-2xl font-bold text-white">
                        {result.expectedSale ? `$${result.expectedSale.toFixed(0)}` : '--'}
                      </p>
                    </div>
                    <div className="bg-black/30 rounded-lg p-3">
                      <p className="text-xs text-white/50 mb-0.5">Buy Under</p>
                      <p className="text-2xl font-bold text-blue-400">
                        {result.maxBuy ? `$${result.maxBuy.toFixed(0)}` : '--'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="bg-black/20 rounded-lg p-3 mb-4">
                    <p className="text-xs text-white/50 mb-2">Price Guide</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-green-400">Under ${result.maxBuy ? Math.round(result.maxBuy * 0.85) : '--'}</span>
                      <span className="text-yellow-400">Fair ${result.maxBuy || '--'} - ${result.expectedSale ? Math.round(result.expectedSale * 0.9) : '--'}</span>
                      <span className="text-red-400">Over ${result.expectedSale || '--'}+</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-white/70 border-white/30">
                        {result.category}
                      </Badge>
                      <span className="text-xs text-white/50">{result.compsCount} comps</span>
                    </div>
                  </div>
                  
                  <Button 
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                    onClick={handleFlip}
                    data-testid="button-save-deal"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Save Deal
                  </Button>
                </Card>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        
        {error && (
          <div className="absolute bottom-24 left-4 right-4 pointer-events-auto">
            <Card className="p-4 bg-red-500/20 border-red-500/50 backdrop-blur-xl">
              <p className="text-red-400 text-center">{error}</p>
              <Button 
                variant="ghost" 
                className="w-full mt-2 text-white"
                onClick={handleSkip}
              >
                Try Again
              </Button>
            </Card>
          </div>
        )}
      </div>
      
      {cameraStarted && state !== 'result' && (
        <div className={`absolute bottom-6 left-0 right-0 flex justify-center pointer-events-auto safe-area-bottom transition-opacity duration-300 ${(state === 'capturing' || state === 'analyzing') ? 'opacity-30' : 'opacity-100'}`}>
          <Button
            size="lg"
            onClick={captureAndAnalyze}
            disabled={state === 'capturing' || state === 'analyzing'}
            className={`w-20 h-20 rounded-full shadow-lg ${scanMode === 'buy' ? 'bg-blue-500 shadow-blue-500/30 hover:bg-blue-600' : 'bg-primary shadow-primary/30'}`}
            data-testid="button-capture"
          >
            {state === 'capturing' || state === 'analyzing' ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : (
              <Camera className="w-8 h-8" />
            )}
          </Button>
        </div>
      )}
      
      <AnimatePresence>
        {showSummary && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 z-50 overflow-auto"
          >
            <div className="min-h-full p-4 pb-24">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-white">Your Catches</h2>
                  <p className="text-sm text-white/60">
                    {capturedItems.length} items • ${totalPotentialProfit.toFixed(0)} potential profit
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-white"
                  onClick={() => setShowSummary(false)}
                  data-testid="button-close-summary"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
              
              {capturedItems.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-white/60">No items saved yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-white/40 text-center mb-2">
                    Swipe right to add • Swipe left to remove
                  </p>
                  {capturedItems.map((item, index) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0, x: 0 }}
                      exit={{ opacity: 0, x: -200 }}
                      transition={{ delay: index * 0.05 }}
                      drag="x"
                      dragConstraints={{ left: 0, right: 0 }}
                      dragElastic={0.3}
                      onDragEnd={(e, info) => {
                        const threshold = 80;
                        if (info.offset.x > threshold) {
                          openAddDialog(item);
                        } else if (info.offset.x < -threshold) {
                          handleRemoveItem(item.id);
                        }
                      }}
                      style={{ touchAction: "pan-y" }}
                      whileDrag={{ cursor: "grabbing" }}
                    >
                      <Card className="p-3 bg-white/10 border-white/20">
                        <div className="flex gap-3">
                          {item.thumbnail && (
                            <div className="w-16 h-16 rounded-lg overflow-hidden bg-black/30 shrink-0">
                              <img 
                                src={item.thumbnail} 
                                alt={item.title}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white font-medium truncate">{item.title}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs text-white/60 border-white/30">
                                {item.category}
                              </Badge>
                              {item.profit && (
                                <span className="text-sm text-green-400 font-medium">
                                  +${item.profit.toFixed(0)}
                                </span>
                              )}
                            </div>
                            <div className="flex gap-2 mt-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs bg-transparent border-white/30 text-white"
                                onClick={() => handleFullScan(item)}
                                data-testid={`button-full-scan-${item.id}`}
                              >
                                <Search className="w-3 h-3 mr-1" />
                                Full Scan
                              </Button>
                              <Button
                                size="sm"
                                className="text-xs bg-primary"
                                onClick={() => openAddDialog(item)}
                                data-testid={`button-add-inventory-${item.id}`}
                              >
                                <ShoppingCart className="w-3 h-3 mr-1" />
                                Add
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-red-400"
                                onClick={() => handleRemoveItem(item.id)}
                                data-testid={`button-remove-${item.id}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
              
              <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black to-transparent">
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 bg-transparent border-white/30 text-white"
                    onClick={() => setShowSummary(false)}
                    data-testid="button-continue-scanning"
                  >
                    Continue Scanning
                  </Button>
                  <Button
                    className="flex-1 bg-primary"
                    onClick={handleCloseSummary}
                    data-testid="button-done-scanning"
                  >
                    Done
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={!!itemToAdd} onOpenChange={(open) => !open && setItemToAdd(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add to Inventory</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground truncate">{itemToAdd?.title}</p>
            <div className="space-y-2">
              <label className="text-sm font-medium">Purchase Price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  className="pl-7"
                  data-testid="input-purchase-price"
                />
              </div>
              {itemToAdd?.maxBuy && (
                <p className="text-xs text-muted-foreground">
                  Max Buy recommendation: ${itemToAdd.maxBuy.toFixed(0)}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setItemToAdd(null)}
              data-testid="button-cancel-add"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleAddToInventory}
              disabled={isAddingToInventory || !purchasePrice}
              data-testid="button-confirm-add"
            >
              {isAddingToInventory ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add to Inventory"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
