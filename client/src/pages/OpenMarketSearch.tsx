import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, Loader2, ExternalLink, DollarSign, TrendingUp, ArrowLeft,
  ShoppingCart, Tag, Package, SlidersHorizontal,
  ChevronDown, ChevronUp, CheckCircle2, XCircle, AlertCircle, Plus
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SoldListing {
  id: string;
  title: string;
  soldPrice: number;
  shippingCost: number;
  totalPrice: number;
  condition: string;
  imageUrl: string | null;
  link: string;
  dateSold: string;
}

interface SearchResult {
  success: boolean;
  listings: SoldListing[];
  totalResults: number;
  query: string;
  error?: string;
}

interface ProfitCalculation {
  expectedSalePrice: number;
  medianPrice: number;
  lowComp: number;
  highComp: number;
  netProfit: number;
  marginPercent: number;
  totalCost: number;
  platformFee: number;
  verdict: 'flip' | 'skip' | 'risky';
}

export default function OpenMarketSearch() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [listings, setListings] = useState<SoldListing[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [buyPrice, setBuyPrice] = useState("");
  const [shippingIn, setShippingIn] = useState("");
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculation, setCalculation] = useState<ProfitCalculation | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [targetMargin, setTargetMargin] = useState(25); // Default 25% margin
  const [addingToInventory, setAddingToInventory] = useState<string | null>(null);

  // Calculate Max Buy price based on sold price and target margin
  const calculateMaxBuy = (soldPrice: number) => {
    // MaxBuy = (SoldPrice × (1 - platformFee) - fixedCosts) / (1 + marginRate)
    const platformFee = 0.13;
    const fixedCosts = 5;
    const marginRate = targetMargin / 100;
    return (soldPrice * (1 - platformFee) - fixedCosts) / (1 + marginRate);
  };

  // Add listing to inventory
  const addToInventory = async (listing: SoldListing) => {
    setAddingToInventory(listing.id);
    try {
      const maxBuy = calculateMaxBuy(listing.totalPrice);
      await apiRequest('POST', '/api/inventory', {
        title: listing.title,
        imageUrl: listing.imageUrl,
        purchasePrice: maxBuy.toFixed(2),
        estimatedResale: listing.totalPrice.toFixed(2),
        feesEstimate: (listing.totalPrice * 0.13).toFixed(2),
      });
      toast({
        title: "Added to Inventory",
        description: `${listing.title.substring(0, 40)}... added at $${maxBuy.toFixed(2)}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add to inventory",
        variant: "destructive",
      });
    } finally {
      setAddingToInventory(null);
    }
  };

  const selectedListings = useMemo(() => 
    listings.filter(l => selectedIds.has(l.id)),
    [listings, selectedIds]
  );

  
  const stats = useMemo(() => {
    if (selectedListings.length === 0) return null;
    const prices = selectedListings.map(l => l.totalPrice);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const sorted = [...prices].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0 
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    return {
      avg,
      median,
      low: Math.min(...prices),
      high: Math.max(...prices),
      count: selectedListings.length
    };
  }, [selectedListings]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setIsSearching(true);
    setSearchError(null);
    setSelectedIds(new Set());
    setCalculation(null);
    
    try {
      const body: any = { query: query.trim() };
      if (minPrice) body.minPrice = parseFloat(minPrice);
      if (maxPrice) body.maxPrice = parseFloat(maxPrice);
      
      const response = await apiRequest("POST", "/api/open-market/search", body);
      const result: SearchResult = await response.json();
      
      if (result.success) {
        setListings(result.listings);
        setHasSearched(true);
      } else {
        setSearchError(result.error || "No results found");
        setListings([]);
      }
    } catch {
      setSearchError("Search failed. Try different keywords.");
      setListings([]);
    } finally {
      setIsSearching(false);
    }
  };

  const toggleListing = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setCalculation(null);
  };

  const selectAll = () => {
    if (selectedIds.size === listings.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(listings.map(l => l.id)));
    }
    setCalculation(null);
  };

  const handleCalculate = async () => {
    if (selectedListings.length < 3 || !buyPrice) return;
    
    setIsCalculating(true);
    
    try {
      const response = await apiRequest("POST", "/api/open-market/calculate", {
        selectedListings,
        buyPrice: parseFloat(buyPrice),
        shippingIn: parseFloat(shippingIn) || 0,
      });
      const result = await response.json();
      
      if (result.success) {
        setCalculation({
          expectedSalePrice: result.pricing.expectedSalePrice,
          medianPrice: result.pricing.medianPrice,
          lowComp: result.pricing.lowComp,
          highComp: result.pricing.highComp,
          netProfit: result.calculation.netProfit,
          marginPercent: result.calculation.marginPercent,
          totalCost: result.calculation.totalCost,
          platformFee: result.calculation.platformFee,
          verdict: result.calculation.netProfit > 0 && result.calculation.marginPercent >= 25 
            ? 'flip' 
            : result.calculation.netProfit > 0 
              ? 'risky' 
              : 'skip'
        });
      }
    } catch {
      setSearchError("Calculation failed");
    } finally {
      setIsCalculating(false);
    }
  };

  const canCalculate = selectedIds.size >= 3 && buyPrice && parseFloat(buyPrice) >= 0;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="flex items-center gap-3 p-4">
          <Link href="/scan">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Open Market</h1>
            <p className="text-xs text-muted-foreground">Search any item on eBay sold listings</p>
          </div>
        </div>

        {/* Target Margin Slider - Always visible */}
        <div className="px-4 pb-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Target Margin:</span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={targetMargin}
              onChange={(e) => setTargetMargin(parseInt(e.target.value))}
              className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
              data-testid="slider-target-margin-visible"
            />
            <span className="text-sm font-bold text-primary w-10 text-right">{targetMargin}%</span>
          </div>
        </div>

        <div className="px-4 pb-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search anything... vintage lamp, rare book, antique vase"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1"
              data-testid="input-open-market-query"
            />
            <Button 
              onClick={handleSearch} 
              disabled={isSearching || !query.trim()}
              data-testid="button-open-market-search"
            >
              {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>
          
          <Button 
            variant="ghost" 
            size="sm" 
            className="mt-2 text-xs"
            onClick={() => setShowFilters(!showFilters)}
            data-testid="button-toggle-filters"
          >
            <SlidersHorizontal className="w-3 h-3 mr-1" />
            Filters
            {showFilters ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
          </Button>
          
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Min Price</label>
                    <Input
                      type="number"
                      placeholder="$0"
                      value={minPrice}
                      onChange={(e) => setMinPrice(e.target.value)}
                      data-testid="input-min-price"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Max Price</label>
                    <Input
                      type="number"
                      placeholder="Any"
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(e.target.value)}
                      data-testid="input-max-price"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="p-4">
        {searchError && (
          <Card className="p-4 mb-4 border-amber-500/50 bg-amber-500/10">
            <p className="text-sm text-amber-600 dark:text-amber-400">{searchError}</p>
          </Card>
        )}

        {hasSearched && listings.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={selectAll}
                  data-testid="button-select-all"
                >
                  {selectedIds.size === listings.length ? "Deselect All" : "Select All"}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {selectedIds.size} selected
                </span>
              </div>
              
              <span className="text-xs text-muted-foreground">Most Recent</span>
            </div>

            {stats && (
              <Card className="p-3 mb-4 bg-primary/5 border-primary/20">
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div>
                    <p className="text-muted-foreground">Median</p>
                    <p className="font-bold text-primary">${stats.median.toFixed(0)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Average</p>
                    <p className="font-semibold">${stats.avg.toFixed(0)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Range</p>
                    <p className="font-semibold">${stats.low.toFixed(0)}-${stats.high.toFixed(0)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Count</p>
                    <p className="font-semibold">{stats.count}</p>
                  </div>
                </div>
              </Card>
            )}

            <div className="space-y-2 mb-4">
              {listings.map((listing) => (
                <Card
                  key={listing.id}
                  className={`p-3 cursor-pointer ${
                    selectedIds.has(listing.id)
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "hover-elevate"
                  }`}
                  onClick={() => toggleListing(listing.id)}
                  data-testid={`card-open-market-listing-${listing.id}`}
                >
                  <div className="flex gap-3">
                    <div className="flex items-center">
                      <Checkbox
                        checked={selectedIds.has(listing.id)}
                        className="pointer-events-none"
                      />
                    </div>
                    {listing.imageUrl && (
                      <img
                        src={listing.imageUrl}
                        alt=""
                        className="w-16 h-16 object-cover rounded"
                        loading="lazy"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-clamp-2">{listing.title}</p>
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        <Badge variant="default" className="text-xs">
                          Max Buy ${calculateMaxBuy(listing.totalPrice).toFixed(2)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Sold for ${listing.totalPrice.toFixed(2)}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          <Tag className="w-3 h-3 mr-0.5" />
                          {listing.condition}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button
                        size="icon"
                        variant="default"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          addToInventory(listing);
                        }}
                        disabled={addingToInventory === listing.id}
                        data-testid={`button-buy-${listing.id}`}
                      >
                        {addingToInventory === listing.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                      </Button>
                      <a
                        href={listing.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-muted-foreground hover:text-primary flex justify-center"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}

        {hasSearched && listings.length === 0 && !searchError && (
          <Card className="p-8 text-center">
            <Package className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">No sold listings found</p>
            <p className="text-sm text-muted-foreground mt-1">Try different or more specific keywords</p>
          </Card>
        )}

        {!hasSearched && (
          <Card className="p-8 text-center">
            <Search className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">Search the Open Market</p>
            <p className="text-sm text-muted-foreground mt-1">
              Find sold prices for ANY item - antiques, vintage, one-of-a-kind treasures
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {["vintage lamp", "antique vase", "rare book", "mcm furniture"].map(term => (
                <Badge 
                  key={term}
                  variant="outline" 
                  className="cursor-pointer"
                  onClick={() => { setQuery(term); }}
                >
                  {term}
                </Badge>
              ))}
            </div>
          </Card>
        )}
      </div>

      {selectedIds.size >= 3 && (
        <motion.div 
          className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t p-4 shadow-lg"
          initial={{ y: 100 }}
          animate={{ y: 0 }}
        >
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-muted-foreground">Your Buy Price</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={buyPrice}
                  onChange={(e) => { setBuyPrice(e.target.value); setCalculation(null); }}
                  className="pl-9"
                  placeholder="0.00"
                  data-testid="input-open-market-buy-price"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Shipping In</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={shippingIn}
                  onChange={(e) => { setShippingIn(e.target.value); setCalculation(null); }}
                  className="pl-9"
                  placeholder="0.00"
                  data-testid="input-open-market-shipping"
                />
              </div>
            </div>
          </div>

          {calculation ? (
            <Card className={`p-4 mb-3 ${
              calculation.verdict === 'flip' 
                ? 'border-green-500 bg-green-500/10' 
                : calculation.verdict === 'risky'
                  ? 'border-amber-500 bg-amber-500/10'
                  : 'border-red-500 bg-red-500/10'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {calculation.verdict === 'flip' ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : calculation.verdict === 'risky' ? (
                    <AlertCircle className="w-5 h-5 text-amber-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                  <span className="font-bold text-lg uppercase">
                    {calculation.verdict === 'flip' ? 'FLIP IT' : calculation.verdict === 'risky' ? 'RISKY' : 'SKIP'}
                  </span>
                </div>
                <Badge variant="secondary">Research Mode</Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Expected Sale</p>
                  <p className="font-bold">${calculation.expectedSalePrice.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Net Profit</p>
                  <p className={`font-bold ${calculation.netProfit > 0 ? 'text-green-500' : 'text-red-500'}`}>
                    ${calculation.netProfit.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Margin</p>
                  <p className="font-bold">{calculation.marginPercent.toFixed(1)}%</p>
                </div>
              </div>
            </Card>
          ) : (
            <Button
              className="w-full"
              size="lg"
              onClick={handleCalculate}
              disabled={!canCalculate || isCalculating}
              data-testid="button-open-market-calculate"
            >
              {isCalculating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Calculating...
                </>
              ) : (
                <>
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Calculate Profit ({selectedIds.size} comps)
                </>
              )}
            </Button>
          )}
        </motion.div>
      )}
    </div>
  );
}
