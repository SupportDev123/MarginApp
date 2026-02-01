import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, TrendingUp, TrendingDown, Minus, DollarSign, Package, Loader2, X, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

type MarketResult = {
  title: string;
  marketValue: number | null;
  lowPrice: number | null;
  highPrice: number | null;
  avgPrice: number | null;
  sampleSize: number;
  source: string;
  category: string;
  condition: string;
};

export default function StreamOverlay() {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<MarketResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInput, setShowInput] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const lookupItem = useCallback(async (itemQuery: string) => {
    if (!itemQuery.trim()) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await apiRequest("POST", "/api/stream-overlay/lookup", {
        query: itemQuery.trim(),
      });
      
      const data = await response.json();
      
      if (data.error) {
        setError(data.error);
        setResult(null);
      } else {
        setResult(data);
        setShowInput(false);
      }
    } catch (err) {
      setError("Failed to lookup item");
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    lookupItem(query);
  };

  const clearResult = () => {
    setResult(null);
    setQuery("");
    setShowInput(true);
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearResult();
      }
      if (e.key === "/" && !showInput) {
        e.preventDefault();
        clearResult();
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showInput]);

  useEffect(() => {
    if (showInput) {
      inputRef.current?.focus();
    }
  }, [showInput]);

  const formatPrice = (price: number | null) => {
    if (price === null) return "—";
    return `$${price.toFixed(0)}`;
  };

  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center p-4" data-testid="stream-overlay">
      <div className="w-full max-w-md">
        <AnimatePresence mode="wait">
          {showInput ? (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/20 border border-primary/30">
                  <Zap className="w-5 h-5 text-primary" />
                  <span className="text-lg font-bold text-primary">MARGIN LIVE</span>
                </div>
              </div>
              
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    ref={inputRef}
                    type="text"
                    placeholder="Enter item name..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="pl-12 pr-4 h-14 text-lg bg-background/90 backdrop-blur border-2 border-primary/30 focus:border-primary rounded-xl"
                    disabled={isLoading}
                    data-testid="input-overlay-query"
                  />
                </div>
                
                <Button 
                  type="submit" 
                  className="w-full h-12 text-lg font-bold rounded-xl"
                  disabled={isLoading || !query.trim()}
                  data-testid="button-overlay-lookup"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Looking up...
                    </>
                  ) : (
                    <>
                      <DollarSign className="w-5 h-5 mr-2" />
                      Get Market Value
                    </>
                  )}
                </Button>
              </form>
              
              {error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center text-destructive bg-destructive/10 rounded-lg p-3"
                >
                  {error}
                </motion.div>
              )}
              
              <p className="text-center text-xs text-muted-foreground mt-4">
                Press <kbd className="px-1.5 py-0.5 rounded bg-muted text-foreground">Enter</kbd> to search
                {" · "}
                <kbd className="px-1.5 py-0.5 rounded bg-muted text-foreground">Esc</kbd> to clear
              </p>
            </motion.div>
          ) : result ? (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative"
            >
              <Button
                variant="ghost"
                size="icon"
                className="absolute -top-2 -right-2 z-10 rounded-full bg-background/80 hover:bg-background"
                onClick={clearResult}
                data-testid="button-overlay-clear"
              >
                <X className="w-4 h-4" />
              </Button>
              
              <div className="bg-gradient-to-br from-background/95 to-background/85 backdrop-blur-lg border-2 border-primary/40 rounded-2xl p-6 shadow-2xl shadow-primary/20">
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-primary/20">
                    <Package className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-bold text-lg leading-tight line-clamp-2" data-testid="text-overlay-title">
                      {result.title}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {result.category} · {result.condition}
                    </p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-center py-4 px-6 rounded-xl bg-primary/10 border border-primary/30"
                  >
                    <p className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Market Value</p>
                    <motion.p
                      initial={{ scale: 0.5 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                      className="text-5xl font-black text-primary"
                      data-testid="text-overlay-value"
                    >
                      {formatPrice(result.marketValue)}
                    </motion.p>
                  </motion.div>
                  
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="grid grid-cols-3 gap-2"
                  >
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <TrendingDown className="w-4 h-4 mx-auto mb-1 text-blue-400" />
                      <p className="text-xs text-muted-foreground">Low</p>
                      <p className="font-bold text-blue-400" data-testid="text-overlay-low">{formatPrice(result.lowPrice)}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <Minus className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">Avg</p>
                      <p className="font-bold" data-testid="text-overlay-avg">{formatPrice(result.avgPrice)}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <TrendingUp className="w-4 h-4 mx-auto mb-1 text-green-400" />
                      <p className="text-xs text-muted-foreground">High</p>
                      <p className="font-bold text-green-400" data-testid="text-overlay-high">{formatPrice(result.highPrice)}</p>
                    </div>
                  </motion.div>
                  
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
                    <span>{result.sampleSize} recent sales</span>
                    <span className="flex items-center gap-1">
                      <Zap className="w-3 h-3 text-primary" />
                      Margin Live
                    </span>
                  </div>
                </div>
              </div>
              
              <p className="text-center text-xs text-muted-foreground mt-4">
                Press <kbd className="px-1.5 py-0.5 rounded bg-muted text-foreground">/</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-muted text-foreground">Esc</kbd> for new search
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
