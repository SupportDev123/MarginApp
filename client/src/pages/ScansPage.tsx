import { useItems, useUpdateDecision, useScanStatus, useUpdateFlipPrice } from "@/hooks/use-items";
import { BottomNav } from "@/components/BottomNav";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Link, useSearch } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { Search, CheckCircle, ShoppingCart, X, TrendingUp, DollarSign, Tag, Undo2, Loader2 } from "lucide-react";
import { HistoryPageSkeleton } from "@/components/ScanLoadingSkeleton";
import { ShareButton } from "@/components/ShareButton";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { useState, useMemo, useEffect } from "react";
import { MarginLogoFull } from "@/components/MarginLogo";
import { getFlipTierInfo } from "@shared/flipScore";
import { safeNumber } from "@shared/calculations";
import { LearningModeBanner } from "@/components/LearningModeBanner";

type DecisionFilter = 'all' | 'skip' | 'flip';

export default function Dashboard() {
  const { data: items, isLoading } = useItems();
  const updateDecision = useUpdateDecision();
  const updateFlipPrice = useUpdateFlipPrice();
  const { data: scanStatus } = useScanStatus();
  const [search, setSearch] = useState("");
  const searchParams = useSearch();
  const urlFilter = new URLSearchParams(searchParams).get('filter') as DecisionFilter | null;
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>(urlFilter || 'flip');
  
  useEffect(() => {
    if (urlFilter && ['all', 'skip', 'flip'].includes(urlFilter)) {
      setDecisionFilter(urlFilter);
    }
  }, [urlFilter]);
  const [flipModalOpen, setFlipModalOpen] = useState(false);
  const [flipModalItem, setFlipModalItem] = useState<{ id: number; title: string; price: string } | null>(null);
  const [flipPriceInput, setFlipPriceInput] = useState("");

  // Helper to safely get netProfit from rawAnalysis
  const getNetProfit = (rawAnalysis: unknown): number => {
    if (rawAnalysis && typeof rawAnalysis === 'object' && 'netProfit' in rawAnalysis) {
      const np = (rawAnalysis as { netProfit: unknown }).netProfit;
      return typeof np === 'number' ? np : 0;
    }
    return 0;
  };
  
  // Helper to determine verdict from backend decision engine output
  // HARD GATE: Forces SKIP if netProfit ≤ 0, regardless of backend verdict
  const getVerdict = (item: { rawAnalysis?: unknown }): 'flip' | 'skip' => {
    const netProfit = getNetProfit(item.rawAnalysis);
    
    // Hard gate: negative/zero profit = ALWAYS SKIP
    if (netProfit <= 0) return 'skip';
    
    // Get verdict from backend decision engine if available
    if (item.rawAnalysis && typeof item.rawAnalysis === 'object') {
      const analysis = item.rawAnalysis as Record<string, unknown>;
      // Try verdict field directly, then decisionData.verdict
      const verdict = analysis.verdict || 
                     (analysis.decisionData && typeof analysis.decisionData === 'object' 
                       ? (analysis.decisionData as Record<string, unknown>).verdict 
                       : null);
      if (verdict === 'flip') return 'flip';
    }
    
    return 'skip';
  };

  // Helper to calculate actual profit from a flipped item
  type ItemType = NonNullable<typeof items>[number];
  const getActualProfit = (item: ItemType): number | null => {
    if (!item.flipPrice || !item.buyPrice) return null;
    
    const soldPrice = safeNumber(item.flipPrice, 0);
    const purchasePrice = safeNumber(item.buyPrice, 0);
    const shippingIn = safeNumber(item.shippingIn, 0);
    const outboundShipping = safeNumber(item.outboundShipping, 5);
    const feeRate = safeNumber(item.platformFeeRate, 0.13);
    
    if (soldPrice === 0 || purchasePrice === 0) return null;
    
    // Actual profit = sold price - fees - purchase cost - shipping costs
    const fees = soldPrice * feeRate;
    const actualProfit = soldPrice - fees - purchasePrice - shippingIn - outboundShipping;
    return actualProfit;
  };
  
  // Helper to check if item is a flip (supports both old 'bought' and new 'flip' values)
  const isFlipDecision = (decision: string | null | undefined) => 
    decision === 'flip' || decision === 'bought';
  
  const isSkipDecision = (decision: string | null | undefined) => 
    decision === 'skip' || decision === 'passed';

  // Helper to get confidence score color based on value
  const getConfidenceColor = (score: number) => {
    const info = getFlipTierInfo(score);
    return { text: info.textClass, bg: info.bgClass };
  };

  // Calculate summary stats
  const stats = useMemo(() => {
    if (!items || items.length === 0) return null;
    
    // Support both old 'bought/passed' and new 'flip/skip' values
    const flipItems = items.filter(i => isFlipDecision(i.userDecision));
    const skipItems = items.filter(i => isSkipDecision(i.userDecision));
    
    // Sold items = flip items that have a flipPrice recorded
    const soldItems = flipItems.filter(i => i.flipPrice);
    const profitableFlips = soldItems.filter(i => {
      const profit = getActualProfit(i);
      return profit !== null && profit > 0;
    });
    
    // Calculate total realized profit from sold items
    const totalRealizedProfit = soldItems.reduce((sum, item) => {
      const profit = getActualProfit(item);
      return sum + (profit ?? 0);
    }, 0);
    
    // Calculate total potential profit from unsold flip items
    const unsoldFlips = flipItems.filter(i => !i.flipPrice);
    const totalPotentialProfit = unsoldFlips.reduce((sum, item) => {
      return sum + getNetProfit(item.rawAnalysis);
    }, 0);
    
    // Profitable % = profitable flips / total sold (if any sold exist)
    const hasSoldItems = soldItems.length > 0;
    const profitableRate = hasSoldItems 
      ? Math.round((profitableFlips.length / soldItems.length) * 100)
      : null;
    
    return {
      totalScans: items.length,
      flipCount: flipItems.length,
      skipCount: skipItems.length,
      soldCount: soldItems.length,
      profitableFlips: profitableFlips.length,
      totalRealizedProfit,
      totalPotentialProfit,
      profitableRate,
      hasSoldItems
    };
  }, [items]);

  const filteredItems = items?.filter(item => {
    const displayTitle = item.confirmedTitle || item.title || "";
    const matchesSearch = displayTitle.toLowerCase().includes(search.toLowerCase()) || 
      item.analysis.toLowerCase().includes(search.toLowerCase()) ||
      item.category?.toLowerCase().includes(search.toLowerCase());
    
    if (!matchesSearch) return false;
    
    if (decisionFilter === 'all') return true;
    if (decisionFilter === 'flip') return isFlipDecision(item.userDecision);
    if (decisionFilter === 'skip') return isSkipDecision(item.userDecision);
    return true;
  });

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Dynamic Financial Header */}
      <header className="sticky top-0 z-10">
        {/* Gradient accent bar */}
        <div className="h-1 bg-gradient-to-r from-primary via-primary/80 to-primary/60" />
        
        <div className="bg-background/95 backdrop-blur-md border-b border-border/50">
          {/* Title row */}
          <div className="px-4 pt-4 pb-3">
            <div className="flex justify-between items-center">
              <MarginLogoFull height={48} />
              <Badge variant="outline" className="font-mono text-xs" data-testid="badge-total-scans">
                {items?.length || 0} Scans
              </Badge>
            </div>
          </div>

          {/* Stats row */}
          {stats && stats.totalScans > 0 && (
            <div className="px-4 pb-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <ShoppingCart className="w-3 h-3 text-green-400" />
                    <span className="text-xs text-muted-foreground">Flips Taken</span>
                  </div>
                  <p className="font-mono font-bold text-sm" data-testid="stat-flips">{stats.flipCount}</p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <TrendingUp className="w-3 h-3 text-green-400" />
                    <span className="text-xs text-muted-foreground">
                      {stats.hasSoldItems ? 'Win Rate' : 'Sold'}
                    </span>
                  </div>
                  <p className="font-mono font-bold text-sm" data-testid="stat-profitable">
                    {stats.hasSoldItems 
                      ? `${stats.profitableRate}%` 
                      : `${stats.soldCount}/${stats.flipCount}`
                    }
                  </p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-2.5 text-center">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <DollarSign className="w-3 h-3 text-green-400" />
                    <span className="text-xs text-muted-foreground">
                      {stats.hasSoldItems ? 'Profit' : 'Potential'}
                    </span>
                  </div>
                  {stats.hasSoldItems ? (
                    <p className={`font-mono font-bold text-sm ${stats.totalRealizedProfit >= 0 ? 'text-green-400' : 'text-red-400'}`} data-testid="stat-potential">
                      {stats.totalRealizedProfit >= 0 ? '+' : '-'}${Math.abs(stats.totalRealizedProfit).toFixed(0)}
                    </p>
                  ) : (
                    <p className={`font-mono font-bold text-sm ${stats.totalPotentialProfit >= 0 ? 'text-green-400' : 'text-red-400'}`} data-testid="stat-potential">
                      {stats.totalPotentialProfit >= 0 ? '' : '-'}${Math.abs(stats.totalPotentialProfit).toFixed(0)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Search */}
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search scans..." 
                className="pl-9 h-10 bg-secondary/50 border-transparent focus:bg-background focus:border-input transition-all"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search"
              />
            </div>
          </div>
          
          {/* Filter tabs */}
          <div className="px-4 pb-3">
            <Tabs value={decisionFilter} onValueChange={(v) => setDecisionFilter(v as DecisionFilter)}>
              <TabsList className="w-full bg-muted/50">
                <TabsTrigger 
                  value="flip" 
                  className="flex-1 data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400" 
                  data-testid="tab-flip"
                >
                  <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
                  <span>Flip IT!</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="skip" 
                  className="flex-1 data-[state=active]:bg-red-500/20 data-[state=active]:text-red-400" 
                  data-testid="tab-skip"
                >
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  <span>Skip IT!</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="all" 
                  className="flex-1" 
                  data-testid="tab-all"
                >
                  <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />
                  <span>All</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          
          {/* Free tier history notice */}
          {scanStatus?.tier === 'free' && filteredItems && filteredItems.length > 0 && (
            <div className="px-4 pb-3">
              <p className="text-xs text-muted-foreground text-center">
                Free history expires after 7 days. <Link href="/settings" className="text-primary hover:underline">Upgrade</Link> for permanent history.
              </p>
            </div>
          )}
        </div>
      </header>


      {/* Content */}
      <main className="px-4 py-6 space-y-4">
        <LearningModeBanner variant="compact" className="mb-2" />
        {isLoading ? (
          <HistoryPageSkeleton />
        ) : filteredItems && filteredItems.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <Link href={`/item/${item.id}`} className="block group">
                  <Card className={`p-4 transition-all duration-200 cursor-pointer active:scale-[0.98] ${
                    getVerdict(item) === 'flip' 
                      ? 'hover:shadow-[0_0_20px_rgba(34,197,94,0.15)] hover:border-green-500/40' 
                      : 'hover:shadow-md hover:border-primary/30'
                  }`}>
                    {/* Verdict Badge - Primary focal point (Binary: FLIP or SKIP only) */}
                    <div className="flex justify-between items-start mb-2 gap-2">
                      <div className="flex items-center gap-2">
                        {getVerdict(item) === 'flip' ? (
                          <Badge className="text-sm px-3 py-1 result-flip-badge font-bold tracking-wide">
                            FLIP IT!
                          </Badge>
                        ) : (
                          <Badge className="text-sm px-3 py-1 result-skip-badge font-bold tracking-wide">
                            SKIP IT!
                          </Badge>
                        )}
                        {(item.confidence || 0) >= 50 && (item.confidence || 0) < 70 && (
                          <span className="text-xs text-muted-foreground opacity-70">Lower confidence</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <ShareButton
                          title={item.confirmedTitle || item.title || "Unknown Item"}
                          verdict={getVerdict(item)}
                          profit={getNetProfit(item.rawAnalysis)}
                          category={item.category || undefined}
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        />
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {item.createdAt && formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    
                    <h3 className="font-semibold text-foreground line-clamp-2 mb-2 group-hover:text-primary transition-colors" data-testid={`text-title-${item.id}`}>
                      {item.confirmedTitle || item.title || "Unknown Item"}
                    </h3>

                    <div className="flex items-center gap-2 flex-wrap">
                      {item.category && (
                        <Badge variant="secondary" className="text-xs" data-testid={`badge-category-${item.id}`}>
                          {item.category}
                        </Badge>
                      )}
                      {item.confirmedTitle && (
                        <Badge variant="outline" className="text-xs gap-1 text-green-400 border-green-500/30 bg-green-500/10" data-testid={`badge-confirmed-${item.id}`}>
                          <CheckCircle className="w-3 h-3" />
                          Confirmed
                        </Badge>
                      )}
                    </div>
                    
                    {/* Profit - Secondary emphasis */}
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs text-muted-foreground">Est. Profit</span>
                          <p className={`font-mono font-bold text-lg ${
                            getNetProfit(item.rawAnalysis) > 0 ? 'text-green-400' : 
                            getNetProfit(item.rawAnalysis) < -5 ? 'text-muted-foreground' : 'text-muted-foreground'
                          }`}>
                            {getNetProfit(item.rawAnalysis) >= 0 
                              ? `+$${getNetProfit(item.rawAnalysis).toFixed(0)}` 
                              : `–$${Math.abs(getNetProfit(item.rawAnalysis)).toFixed(0)} expected`}
                          </p>
                          <span className="text-[10px] text-muted-foreground/60">Based on sold comps (30 days)</span>
                        </div>
                        {/* Confidence - Supporting context (reduced weight) */}
                        <div className="text-right" title="Confidence reflects how consistent recent sold data is for this item">
                          <span className="text-xs text-muted-foreground/60">Confidence</span>
                          <p className="text-xs text-muted-foreground/70 font-mono">{item.confidence}</p>
                        </div>
                      </div>
                    </div>

                    {/* User Decision Tracking */}
                    <div className="mt-3 pt-3 border-t border-border/50">
                      {item.userDecision ? (
                        <div className="flex items-center justify-between gap-2">
                          <Badge 
                            variant={isFlipDecision(item.userDecision) ? 'default' : 'secondary'}
                            className={isFlipDecision(item.userDecision) 
                              ? 'bg-green-500 text-white border-green-500' 
                              : 'bg-muted text-muted-foreground'
                            }
                            data-testid={`badge-decision-${item.id}`}
                          >
                            {isFlipDecision(item.userDecision) ? (
                              <>
                                <ShoppingCart className="w-3 h-3 mr-1" />
                                {item.flipPrice ? 'Sold' : 'Flipping'}
                              </>
                            ) : (
                              <>
                                <X className="w-3 h-3 mr-1" />
                                Skipped
                              </>
                            )}
                          </Badge>
                          {isSkipDecision(item.userDecision) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground hover:text-foreground"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                updateDecision.mutate({ id: item.id, decision: null });
                              }}
                              disabled={updateDecision.isPending}
                              data-testid={`button-undo-${item.id}`}
                            >
                              <Undo2 className="w-3 h-3 mr-1" />
                              Undo
                            </Button>
                          )}
                          {isFlipDecision(item.userDecision) && !item.flipPrice && (
                            <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground hover:text-foreground"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                updateDecision.mutate({ id: item.id, decision: null });
                              }}
                              disabled={updateDecision.isPending}
                              data-testid={`button-undo-${item.id}`}
                            >
                              <Undo2 className="w-3 h-3 mr-1" />
                              Undo
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-400 border-green-500/30"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setFlipModalItem({
                                  id: item.id,
                                  title: item.confirmedTitle || item.title || "Unknown Item",
                                  price: item.price || "N/A"
                                });
                                setFlipPriceInput("");
                                setFlipModalOpen(true);
                              }}
                              data-testid={`button-record-flip-${item.id}`}
                            >
                              <Tag className="w-3 h-3 mr-1" />
                              Record Flip
                            </Button>
                            </>
                          )}
                          {item.flipPrice && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-sm font-mono text-green-400 h-auto py-1 px-2"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setFlipModalItem({
                                  id: item.id,
                                  title: item.confirmedTitle || item.title || "Unknown Item",
                                  price: item.price || "N/A"
                                });
                                setFlipPriceInput(item.flipPrice || "");
                                setFlipModalOpen(true);
                              }}
                              data-testid={`button-edit-flip-${item.id}`}
                            >
                              Sold: ${item.flipPrice}
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 text-green-400 border-green-500/30 hover:bg-green-500/10"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              updateDecision.mutate({ id: item.id, decision: 'flip' });
                            }}
                            disabled={updateDecision.isPending}
                            data-testid={`button-flip-${item.id}`}
                          >
                            <ShoppingCart className="w-3 h-3 mr-1" />
                            Flip IT!
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              updateDecision.mutate({ id: item.id, decision: 'skip' });
                            }}
                            disabled={updateDecision.isPending}
                            data-testid={`button-skip-${item.id}`}
                          >
                            <X className="w-3 h-3 mr-1" />
                            Skip IT
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 px-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-secondary mb-4">
              <Search className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No decisions yet</h3>
            <p className="text-muted-foreground text-sm mb-6">
              Every scan becomes a verdict.
            </p>
            <Link href="/scan">
              <span className="inline-flex items-center justify-center h-11 px-8 rounded-xl bg-primary text-primary-foreground font-medium shadow-lg shadow-primary/25 hover:bg-primary/90 transition-colors">
                New Scan
              </span>
            </Link>
          </div>
        )}
      </main>

      <BottomNav />

      {/* Record Flip Modal */}
      <Dialog open={flipModalOpen} onOpenChange={setFlipModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-green-400" />
              {flipPriceInput ? 'Edit Flip' : 'Record Flip'}
            </DialogTitle>
            <DialogDescription>
              {flipPriceInput ? 'Update the price you sold this item for.' : 'Enter the price you sold this item for.'}
            </DialogDescription>
          </DialogHeader>
          
          {flipModalItem && (
            <div className="space-y-4">
              <div className="bg-secondary/50 rounded-lg p-3">
                <p className="text-sm font-medium line-clamp-2">{flipModalItem.title}</p>
                <p className="text-xs text-muted-foreground mt-1">Bought for: {flipModalItem.price}</p>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="flip-price">
                  Sold Price
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="flip-price"
                    type="number"
                    inputMode="decimal"
                    placeholder="0.00"
                    className="pl-7"
                    value={flipPriceInput}
                    onChange={(e) => setFlipPriceInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'e' || e.key === 'E' || e.key === '+' || e.key === '-') {
                        e.preventDefault();
                      }
                    }}
                    data-testid="input-flip-price"
                  />
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setFlipModalOpen(false)}
                  data-testid="button-cancel-flip"
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-green-500 hover:bg-green-500/90"
                  onClick={() => {
                    const price = parseFloat(flipPriceInput);
                    if (!isNaN(price) && price > 0) {
                      updateFlipPrice.mutate({ id: flipModalItem.id, flipPrice: price });
                      setFlipModalOpen(false);
                    }
                  }}
                  disabled={!flipPriceInput || parseFloat(flipPriceInput) <= 0 || updateFlipPrice.isPending}
                  data-testid="button-save-flip"
                >
                  {updateFlipPrice.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
