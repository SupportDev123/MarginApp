import { useState, useRef, useCallback, useEffect } from "react";
import { ScanBarcode, Camera, Loader2, CheckCircle, AlertCircle, X, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import Quagga from "@ericblade/quagga2";

interface BarcodeScannerProps {
  onProductFound: (product: BarcodeProduct) => void;
  onCancel: () => void;
}

export interface BarcodeProduct {
  barcode: string;
  name: string;
  platform?: string;
  priceChartingId?: string;
  prices: {
    loose: number | null;
    cib: number | null;
    new: number | null;
    graded: number | null;
  };
}

type ScanStep = 'scanning' | 'looking_up' | 'found' | 'not_found' | 'error';

export function BarcodeScanner({ onProductFound, onCancel }: BarcodeScannerProps) {
  const [step, setStep] = useState<ScanStep>('scanning');
  const [detectedCode, setDetectedCode] = useState<string | null>(null);
  const [product, setProduct] = useState<BarcodeProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const scannerRef = useRef<HTMLDivElement>(null);
  const isInitialized = useRef(false);
  const lastScannedCode = useRef<string | null>(null);

  const lookupBarcode = useCallback(async (barcode: string) => {
    if (isProcessing || barcode === lastScannedCode.current) return;
    
    setIsProcessing(true);
    lastScannedCode.current = barcode;
    setDetectedCode(barcode);
    setStep('looking_up');

    try {
      Quagga.stop();
      
      const response = await apiRequest("POST", "/api/barcode/lookup", { barcode });
      const data = await response.json();

      if (data.success && data.product) {
        const foundProduct: BarcodeProduct = {
          barcode,
          name: data.product.name,
          platform: data.product.platform,
          priceChartingId: data.product.priceChartingId,
          prices: data.product.prices,
        };
        setProduct(foundProduct);
        setStep('found');
      } else {
        setError(data.message || "Product not found");
        setStep('not_found');
      }
    } catch (err: any) {
      console.error("Barcode lookup error:", err);
      setError(err.message || "Failed to lookup barcode");
      setStep('error');
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing]);

  const initScanner = useCallback(() => {
    if (!scannerRef.current || isInitialized.current) return;

    isInitialized.current = true;

    Quagga.init({
      inputStream: {
        type: "LiveStream",
        target: scannerRef.current,
        constraints: {
          facingMode: "environment",
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 },
        },
      },
      locator: {
        patchSize: "medium",
        halfSample: true,
      },
      numOfWorkers: navigator.hardwareConcurrency || 4,
      decoder: {
        readers: [
          "ean_reader",
          "ean_8_reader",
          "upc_reader",
          "upc_e_reader",
          "code_128_reader",
        ],
      },
      locate: true,
    }, (err: any) => {
      if (err) {
        console.error("Quagga init error:", err);
        setError("Camera access denied or not available");
        setStep('error');
        return;
      }
      
      Quagga.start();
    });

    Quagga.onDetected((result: any) => {
      if (result?.codeResult?.code) {
        const code = result.codeResult.code;
        if (code.length >= 8 && /^\d+$/.test(code)) {
          lookupBarcode(code);
        }
      }
    });
  }, [lookupBarcode]);

  useEffect(() => {
    initScanner();

    return () => {
      Quagga.offDetected();
      Quagga.stop();
      isInitialized.current = false;
    };
  }, [initScanner]);

  const handleRetry = useCallback(() => {
    setStep('scanning');
    setDetectedCode(null);
    setProduct(null);
    setError(null);
    lastScannedCode.current = null;
    
    Quagga.offDetected();
    isInitialized.current = false;
    
    setTimeout(() => {
      initScanner();
    }, 100);
  }, [initScanner]);

  const handleConfirm = useCallback(() => {
    if (product) {
      onProductFound(product);
    }
  }, [product, onProductFound]);

  const formatPrice = (price: number | null) => {
    if (price === null) return "N/A";
    return `$${price.toFixed(2)}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <ScanBarcode className="h-5 w-5 text-primary" />
            <span className="font-semibold">Barcode Scanner</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel} data-testid="button-close-scanner">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 relative overflow-hidden">
          <AnimatePresence mode="wait">
            {step === 'scanning' && (
              <motion.div
                key="scanning"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full"
              >
                <div 
                  ref={scannerRef} 
                  className="relative w-full h-full bg-black"
                  data-testid="barcode-scanner-viewport"
                >
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-64 h-32 border-2 border-primary rounded-lg relative">
                      <div className="absolute inset-0 border-2 border-primary/30 animate-pulse rounded-lg" />
                      <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-primary animate-[scan_2s_ease-in-out_infinite]" />
                    </div>
                  </div>
                  <div className="absolute bottom-4 left-0 right-0 text-center">
                    <p className="text-white text-sm bg-black/50 inline-block px-3 py-1 rounded-full">
                      Position barcode within the frame
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 'looking_up' && (
              <motion.div
                key="looking_up"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col items-center justify-center p-6"
              >
                <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
                <p className="text-lg font-medium">Looking up barcode...</p>
                <Badge variant="outline" className="mt-2 font-mono">
                  {detectedCode}
                </Badge>
              </motion.div>
            )}

            {step === 'found' && product && (
              <motion.div
                key="found"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col p-4"
              >
                <Card className="p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-green-500/10 rounded-lg">
                      <CheckCircle className="h-6 w-6 text-green-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg truncate" data-testid="text-product-name">
                        {product.name}
                      </h3>
                      {product.platform && (
                        <Badge variant="secondary" className="mt-1">
                          {product.platform}
                        </Badge>
                      )}
                      <p className="text-xs text-muted-foreground mt-1 font-mono">
                        UPC: {product.barcode}
                      </p>
                    </div>
                  </div>
                </Card>

                <Card className="p-4 mb-4">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Market Prices
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Loose</p>
                      <p className="text-lg font-bold" data-testid="text-price-loose">
                        {formatPrice(product.prices.loose)}
                      </p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Complete</p>
                      <p className="text-lg font-bold" data-testid="text-price-cib">
                        {formatPrice(product.prices.cib)}
                      </p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">New/Sealed</p>
                      <p className="text-lg font-bold" data-testid="text-price-new">
                        {formatPrice(product.prices.new)}
                      </p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground">Graded</p>
                      <p className="text-lg font-bold" data-testid="text-price-graded">
                        {formatPrice(product.prices.graded)}
                      </p>
                    </div>
                  </div>
                </Card>

                <div className="mt-auto flex gap-3">
                  <Button 
                    variant="outline" 
                    className="flex-1" 
                    onClick={handleRetry}
                    data-testid="button-scan-another"
                  >
                    Scan Another
                  </Button>
                  <Button 
                    className="flex-1" 
                    onClick={handleConfirm}
                    data-testid="button-use-product"
                  >
                    Use This Product
                  </Button>
                </div>
              </motion.div>
            )}

            {(step === 'not_found' || step === 'error') && (
              <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col items-center justify-center p-6"
              >
                <div className="p-4 bg-destructive/10 rounded-full mb-4">
                  <AlertCircle className="h-12 w-12 text-destructive" />
                </div>
                <p className="text-lg font-medium text-center mb-2">
                  {step === 'not_found' ? 'Product Not Found' : 'Scan Error'}
                </p>
                <p className="text-muted-foreground text-center text-sm mb-2">
                  {error}
                </p>
                {detectedCode && (
                  <Badge variant="outline" className="font-mono mb-4">
                    {detectedCode}
                  </Badge>
                )}
                <div className="flex gap-3 mt-4">
                  <Button variant="outline" onClick={onCancel}>
                    Cancel
                  </Button>
                  <Button onClick={handleRetry} data-testid="button-try-again">
                    Try Again
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <style>{`
        @keyframes scan {
          0%, 100% { transform: translateY(-50%); }
          50% { transform: translateY(50%); }
        }
        #interactive.viewport video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
        }
        #interactive.viewport canvas {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
