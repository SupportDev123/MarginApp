import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Loader2, ExternalLink, Check, ChevronRight, DollarSign, TrendingUp, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";

interface UserSelectableListing {
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

interface UserCompsSearchResult {
  success: boolean;
  listings: UserSelectableListing[];
  totalResults: number;
  query: string;
  error?: string;
}

interface UserCompsCalculation {
  success: boolean;
  pricing: {
    expectedSalePrice: number;
    medianPrice: number;
    lowComp: number;
    highComp: number;
    compsCount: number;
  };
  calculation: {
    buyPrice: number;
    shippingIn: number;
    fixedCosts: number;
    outboundShipping: number;
    platformFee: number;
    totalCost: number;
    netProfit: number;
    marginPercent: number;
  };
  pricingMode: 'MANUAL';
  source: string;
}

interface UserSelectedCompsModeProps {
  initialQuery?: string;
  buyPrice?: number;
  shippingIn?: number;
  onComplete?: (result: UserCompsCalculation) => void;
  onBack?: () => void;
}

export function UserSelectedCompsMode({
  initialQuery = "",
  buyPrice: initialBuyPrice = 0,
  shippingIn: initialShippingIn = 0,
  onComplete,
  onBack,
}: UserSelectedCompsModeProps) {
  const [query, setQuery] = useState(initialQuery);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<UserSelectableListing[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedListings, setSelectedListings] = useState<Set<string>>(new Set());
  const [buyPrice, setBuyPrice] = useState(initialBuyPrice.toString());
  const [shippingIn, setShippingIn] = useState(initialShippingIn.toString());
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculationResult, setCalculationResult] = useState<UserCompsCalculation | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const selectedCount = selectedListings.size;
  const canCalculate = selectedCount >= 3 && buyPrice !== "" && Number(buyPrice) >= 0;

  const selectedListingsArray = useMemo(() => {
    return searchResults.filter(l => selectedListings.has(l.id));
  }, [searchResults, selectedListings]);

  const avgSelectedPrice = useMemo(() => {
    if (selectedListingsArray.length === 0) return 0;
    const sum = selectedListingsArray.reduce((acc, l) => acc + l.totalPrice, 0);
    return sum / selectedListingsArray.length;
  }, [selectedListingsArray]);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsSearching(true);
    setSearchError(null);
    setSelectedListings(new Set());
    setCalculationResult(null);

    try {
      const response = await apiRequest("POST", "/api/user-comps/search", { query: query.trim() });
      const result: UserCompsSearchResult = await response.json();

      if (result.success) {
        setSearchResults(result.listings);
        setHasSearched(true);
      } else {
        setSearchError(result.error || "No results found. Try different keywords.");
        setSearchResults([]);
      }
    } catch (err) {
      setSearchError("No results found. Try different keywords.");
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const toggleListing = (id: string) => {
    setSelectedListings(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setCalculationResult(null);
  };

  const handleCalculate = async () => {
    if (!canCalculate) return;

    setIsCalculating(true);

    try {
      const response = await apiRequest("POST", "/api/user-comps/calculate", {
        selectedListings: selectedListingsArray,
        buyPrice: Number(buyPrice),
        shippingIn: Number(shippingIn) || 0,
      });
      const result: UserCompsCalculation = await response.json();

      if (result.success) {
        setCalculationResult(result);
        onComplete?.(result);
      }
    } catch (err) {
      setSearchError("Could not complete calculation. Please try again.");
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-4">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        )}
        <div>
          <h2 className="text-lg font-semibold">Research Mode</h2>
          <p className="text-sm text-muted-foreground">For antiques, vintage, and unique items where pricing requires hands-on comparison</p>
        </div>
      </div>

      <Card className="p-4 mb-4">
        <div className="flex gap-2">
          <Input
            placeholder="Search eBay sold listings..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="flex-1"
            data-testid="input-search-query"
          />
          <Button onClick={handleSearch} disabled={isSearching || !query.trim()} data-testid="button-search">
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Tip: Use specific keywords like brand, model, size, or condition</p>
      </Card>

      {searchError && (
        <Card className="p-4 mb-4 border-amber-500/50 bg-amber-500/10">
          <p className="text-sm text-amber-600 dark:text-amber-400">{searchError}</p>
        </Card>
      )}

      {hasSearched && searchResults.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium">
                {selectedCount} of {searchResults.length} selected
              </p>
              <p className="text-xs text-muted-foreground">
                {selectedCount < 3 ? `Select at least ${3 - selectedCount} more` : "Ready to calculate"}
              </p>
            </div>
            {selectedCount > 0 && (
              <Badge variant="secondary" className="text-sm">
                Avg: ${avgSelectedPrice.toFixed(2)}
              </Badge>
            )}
          </div>

          <div className="flex-1 overflow-auto space-y-2 mb-4 max-h-[300px]">
            <AnimatePresence mode="popLayout">
              {searchResults.map((listing) => (
                <motion.div
                  key={listing.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  layout
                >
                  <Card
                    className={`p-3 cursor-pointer transition-colors ${
                      selectedListings.has(listing.id)
                        ? "border-primary bg-primary/5"
                        : "hover-elevate"
                    }`}
                    onClick={() => toggleListing(listing.id)}
                    data-testid={`card-listing-${listing.id}`}
                  >
                    <div className="flex gap-3">
                      <div className="flex items-center">
                        <Checkbox
                          checked={selectedListings.has(listing.id)}
                          onCheckedChange={() => toggleListing(listing.id)}
                          className="pointer-events-none"
                          data-testid={`checkbox-listing-${listing.id}`}
                        />
                      </div>
                      {listing.imageUrl && (
                        <img
                          src={listing.imageUrl}
                          alt=""
                          className="w-16 h-16 object-cover rounded"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-clamp-2">{listing.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            ${listing.totalPrice.toFixed(2)}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {listing.condition}
                          </Badge>
                        </div>
                      </div>
                      <a
                        href={listing.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-muted-foreground hover:text-foreground"
                        data-testid={`link-listing-${listing.id}`}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </>
      )}

      {hasSearched && searchResults.length === 0 && !searchError && (
        <Card className="p-6 text-center mb-4">
          <p className="text-muted-foreground">No sold listings found. Try different search terms.</p>
        </Card>
      )}

      {selectedCount >= 3 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="p-4 mb-4">
            <h3 className="font-medium mb-3">Your Costs</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Buy Price</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={buyPrice}
                    onChange={(e) => {
                      setBuyPrice(e.target.value);
                      setCalculationResult(null);
                    }}
                    className="pl-9"
                    placeholder="0.00"
                    data-testid="input-buy-price"
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
                    onChange={(e) => {
                      setShippingIn(e.target.value);
                      setCalculationResult(null);
                    }}
                    className="pl-9"
                    placeholder="0.00"
                    data-testid="input-shipping-in"
                  />
                </div>
              </div>
            </div>
          </Card>

          <Button
            className="w-full"
            size="lg"
            onClick={handleCalculate}
            disabled={!canCalculate || isCalculating}
            data-testid="button-calculate"
          >
            {isCalculating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Calculating...
              </>
            ) : (
              <>
                <TrendingUp className="w-4 h-4 mr-2" />
                Calculate Profit
              </>
            )}
          </Button>
        </motion.div>
      )}

      {calculationResult && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mt-4"
        >
          <Card className="p-6 border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Pricing Summary</h3>
              <Badge variant="secondary" className="text-xs">
                Research Mode
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Expected Sale</p>
                <p className="font-semibold text-xl">${calculationResult.pricing.expectedSalePrice.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Net Profit</p>
                <p className="font-semibold text-xl">
                  ${calculationResult.calculation.netProfit.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Total Cost</p>
                <p className="font-medium">${calculationResult.calculation.totalCost.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Margin</p>
                <p className="font-medium">{calculationResult.calculation.marginPercent.toFixed(1)}%</p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground space-y-1">
              <p>Based on {calculationResult.pricing.compsCount} selected comparables</p>
              <p>Range: ${calculationResult.pricing.lowComp.toFixed(2)} - ${calculationResult.pricing.highComp.toFixed(2)}</p>
              <p>Platform fee: ${calculationResult.calculation.platformFee.toFixed(2)} | Fixed costs: ${calculationResult.calculation.fixedCosts} | Outbound: ${calculationResult.calculation.outboundShipping}</p>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
