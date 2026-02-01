import { useInventory, useUpdateInventoryItem, useDeleteInventoryItem } from "@/hooks/use-items";
import { BottomNav } from "@/components/BottomNav";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow } from "date-fns";
import { Loader2, Package, DollarSign, TrendingUp, ShoppingCart, Tag, Trash2, CheckCircle, Search, Scan, ExternalLink, Copy, Undo2, Settings, Receipt } from "lucide-react";
import { HistoryPageSkeleton } from "@/components/ScanLoadingSkeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { useState, useMemo, useEffect } from "react";
import { MarginLogoFull } from "@/components/MarginLogo";
import { Link, useSearch } from "wouter";
import { safeNumber } from "@shared/calculations";
import { WinCard } from "@/components/WinCard";

type StatusFilter = 'all' | 'bought' | 'listed' | 'sold';
type InventoryItem = NonNullable<ReturnType<typeof useInventory>['data']>[number];

export default function InventoryPage() {
  const { data: inventory, isLoading } = useInventory();
  const updateItem = useUpdateInventoryItem();
  const deleteItem = useDeleteInventoryItem();
  const [search, setSearch] = useState("");
  const searchParams = useSearch();
  const urlStatus = new URLSearchParams(searchParams).get('status') as StatusFilter | null;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(urlStatus || 'all');
  
  useEffect(() => {
    if (urlStatus && ['all', 'bought', 'listed', 'sold'].includes(urlStatus)) {
      setStatusFilter(urlStatus);
    }
  }, [urlStatus]);
  const [soldModalOpen, setSoldModalOpen] = useState(false);
  const [soldModalItem, setSoldModalItem] = useState<InventoryItem | null>(null);
  const [soldPriceInput, setSoldPriceInput] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [listingModalOpen, setListingModalOpen] = useState(false);
  const [listingModalItem, setListingModalItem] = useState<InventoryItem | null>(null);
  const [winCardOpen, setWinCardOpen] = useState(false);
  const [winCardData, setWinCardData] = useState<{
    itemTitle: string;
    buyPrice: number;
    sellPrice: number;
    profit: number;
    imageUrl?: string | null;
  } | null>(null);
  const { toast } = useToast();

  const getActualProfit = (item: InventoryItem): number | null => {
    if (!item.actualSalePrice || !item.purchasePrice) return null;
    
    const salePrice = safeNumber(item.actualSalePrice, 0);
    const purchase = safeNumber(item.purchasePrice, 0);
    const fees = safeNumber(item.feesEstimate, 0);
    const shipping = safeNumber(item.outboundShippingActual || item.shippingEstimate, 5);
    
    if (salePrice === 0 || purchase === 0) return null;
    
    return salePrice - purchase - fees - shipping;
  };

  const getEstimatedProfit = (item: InventoryItem): number | null => {
    if (!item.estimatedResale || !item.purchasePrice) return null;
    
    const resale = safeNumber(item.estimatedResale, 0);
    const purchase = safeNumber(item.purchasePrice, 0);
    const fees = safeNumber(item.feesEstimate, 0);
    const shipping = safeNumber(item.shippingEstimate, 5);
    
    if (resale === 0 || purchase === 0) return null;
    
    return resale - purchase - fees - shipping;
  };

  const stats = useMemo(() => {
    const boughtItems = inventory?.filter(i => i.status === 'bought') || [];
    const listedItems = inventory?.filter(i => i.status === 'listed') || [];
    const soldItems = inventory?.filter(i => i.status === 'sold') || [];
    const unsoldItems = [...boughtItems, ...listedItems];
    
    const totalInvested = unsoldItems.reduce((sum, item) => {
      return sum + safeNumber(item.purchasePrice, 0);
    }, 0);
    
    const expectedProfit = unsoldItems.reduce((sum, item) => {
      const profit = getEstimatedProfit(item);
      return sum + (profit ?? 0);
    }, 0);
    
    const soldProfit = soldItems.reduce((sum, item) => {
      const profit = getActualProfit(item);
      return sum + (profit ?? 0);
    }, 0);
    
    const profitableFlips = soldItems.filter(i => {
      const profit = getActualProfit(i);
      return profit !== null && profit > 0;
    });
    
    const winRate = soldItems.length > 0 
      ? Math.round((profitableFlips.length / soldItems.length) * 100)
      : null;
    
    return {
      totalItems: inventory?.length || 0,
      boughtCount: boughtItems.length,
      listedCount: listedItems.length,
      soldCount: soldItems.length,
      totalInvested,
      expectedProfit,
      soldProfit,
      winRate
    };
  }, [inventory]);

  const filteredItems = inventory?.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    
    if (statusFilter === 'all') return true;
    return item.status === statusFilter;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'bought': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30';
      case 'listed': return 'bg-green-500/10 text-amber-600 dark:text-green-400 border-green-500/30';
      case 'sold': return 'bg-green-500 text-white border-green-500';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'bought': return <ShoppingCart className="w-3 h-3" />;
      case 'listed': return <Tag className="w-3 h-3" />;
      case 'sold': return <CheckCircle className="w-3 h-3" />;
      default: return null;
    }
  };

  const handleMarkListed = (item: InventoryItem) => {
    updateItem.mutate({
      id: item.id,
      status: 'listed',
      listedDate: new Date().toISOString(),
    });
  };

  const handleMarkSold = () => {
    if (!soldModalItem || !soldPriceInput) return;
    
    const sellPrice = parseFloat(soldPriceInput) || 0;
    const buyPrice = parseFloat(soldModalItem.purchasePrice || "0") || 0;
    const fees = parseFloat(soldModalItem.feesEstimate || "0") || 0;
    const shipping = parseFloat(soldModalItem.shippingEstimate || "5") || 5;
    const profit = sellPrice - buyPrice - fees - shipping;
    
    updateItem.mutate({
      id: soldModalItem.id,
      status: 'sold',
      soldDate: new Date().toISOString(),
      actualSalePrice: soldPriceInput,
    }, {
      onSuccess: () => {
        setSoldModalOpen(false);
        
        if (profit > 0) {
          setWinCardData({
            itemTitle: soldModalItem.title,
            buyPrice,
            sellPrice,
            profit,
            imageUrl: soldModalItem.imageUrl,
          });
          setWinCardOpen(true);
        }
        
        setSoldModalItem(null);
        setSoldPriceInput("");
      }
    });
  };

  const handleDelete = () => {
    if (deleteTargetId === null) return;
    deleteItem.mutate(deleteTargetId, {
      onSuccess: () => {
        setDeleteConfirmOpen(false);
        setDeleteTargetId(null);
      }
    });
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10">
        <div className="h-1 bg-gradient-to-r from-[#22c55e] via-[#4ade80] to-[#3b82f6]" />
        
        <div className="bg-background/95 backdrop-blur-md border-b border-border/50">
          <div className="px-4 pt-4 pb-3">
            <div className="flex justify-between items-center">
              <MarginLogoFull height={48} />
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs" data-testid="badge-total-inventory">
                  {inventory?.length || 0} Items
                </Badge>
                <Link href="/expenses">
                  <Button size="icon" variant="ghost" className="text-muted-foreground" data-testid="button-expenses">
                    <Receipt className="w-5 h-5" />
                  </Button>
                </Link>
                <Link href="/settings">
                  <Button size="icon" variant="ghost" className="text-muted-foreground" data-testid="button-settings">
                    <Settings className="w-5 h-5" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* KPI Header - Always visible */}
          <div className="px-4 pb-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-card rounded-lg p-2.5 text-center border border-border/50">
                <span className="text-xs text-muted-foreground block mb-1">Invested</span>
                <p className="font-mono font-bold text-base text-foreground" data-testid="stat-invested">
                  ${stats.totalInvested.toFixed(0)}
                </p>
              </div>
              <div className="bg-card rounded-lg p-2.5 text-center border border-border/50">
                <span className="text-xs text-muted-foreground block mb-1">Expected</span>
                <p className={`font-mono font-bold text-base ${
                  stats.expectedProfit > 0 ? 'text-green-400' : stats.expectedProfit < 0 ? 'text-muted-foreground' : 'text-muted-foreground'
                }`} data-testid="stat-expected-profit">
                  {stats.expectedProfit >= 0 
                    ? `+$${stats.expectedProfit.toFixed(0)}`
                    : `–$${Math.abs(stats.expectedProfit).toFixed(0)}`}
                </p>
              </div>
              {/* Sold Profit - emphasized only when there are sold items */}
              <div className={`rounded-lg p-2.5 text-center border ${
                stats.soldCount > 0 
                  ? 'bg-green-500/10 border-green-500/30' 
                  : 'bg-card border-border/50'
              }`}>
                <span className={`text-xs block mb-1 ${
                  stats.soldCount > 0 ? 'text-green-400 dark:text-[#4ade80] font-medium' : 'text-muted-foreground'
                }`}>Sold Profit</span>
                <p className={`font-mono font-bold text-base ${
                  stats.soldCount > 0 
                    ? (stats.soldProfit > 0 ? 'text-green-400' : stats.soldProfit < 0 ? 'text-red-500' : 'text-foreground')
                    : 'text-muted-foreground/50'
                }`} data-testid="stat-sold-profit">
                  {stats.soldCount > 0 
                    ? `${stats.soldProfit >= 0 ? '+' : ''}$${stats.soldProfit.toFixed(0)}`
                    : '$0'
                  }
                </p>
              </div>
            </div>
          </div>

          {/* Search bar - only shown when items exist */}
          {stats.totalItems > 0 && (
            <div className="px-4 pb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Search inventory..." 
                  className="pl-9 h-10 bg-secondary/50 border-transparent focus:bg-background focus:border-input transition-all"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="input-search-inventory"
                />
              </div>
            </div>
          )}
          
          <div className="px-4 pb-3">
            <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <TabsList className="w-full bg-muted/50 p-1">
                <TabsTrigger 
                  value="all" 
                  className="flex-1 data-[state=active]:bg-card data-[state=active]:shadow-md data-[state=active]:font-semibold data-[state=active]:text-foreground" 
                  data-testid="tab-all"
                >
                  All
                </TabsTrigger>
                <TabsTrigger 
                  value="bought" 
                  className="flex-1 data-[state=active]:bg-card data-[state=active]:shadow-md data-[state=active]:font-semibold data-[state=active]:text-foreground" 
                  data-testid="tab-bought"
                >
                  Bought
                </TabsTrigger>
                <TabsTrigger 
                  value="listed" 
                  className="flex-1 data-[state=active]:bg-card data-[state=active]:shadow-md data-[state=active]:font-semibold data-[state=active]:text-foreground" 
                  data-testid="tab-listed"
                >
                  Listed
                </TabsTrigger>
                <TabsTrigger 
                  value="sold" 
                  className="flex-1 data-[state=active]:bg-card data-[state=active]:shadow-md data-[state=active]:font-semibold data-[state=active]:text-foreground" 
                  data-testid="tab-sold"
                >
                  Sold
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </header>

      <main className="px-4 py-6 space-y-4">
        {isLoading ? (
          <HistoryPageSkeleton />
        ) : filteredItems && filteredItems.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((item, index) => {
              const estimatedProfit = getEstimatedProfit(item);
              const actualProfit = getActualProfit(item);
              
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <Card className="p-4" data-testid={`card-inventory-${item.id}`}>
                    <div className="flex justify-between items-start mb-3 gap-2">
                      <Badge className={`text-xs ${getStatusColor(item.status)}`} data-testid={`badge-status-${item.id}`}>
                        {getStatusIcon(item.status)}
                        <span className="ml-1 capitalize">{item.status}</span>
                      </Badge>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {item.purchaseDate && formatDistanceToNow(new Date(item.purchaseDate), { addSuffix: true })}
                      </span>
                    </div>
                    
                    <h3 className="font-semibold text-foreground line-clamp-2 mb-3" data-testid={`text-title-${item.id}`}>
                      {item.title}
                    </h3>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Purchase</span>
                        <span className="font-mono font-medium">${item.purchasePrice}</span>
                      </div>
                      {item.status === 'sold' && item.actualSalePrice ? (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Sold For</span>
                            <span className="font-mono font-medium">${item.actualSalePrice}</span>
                          </div>
                          {actualProfit !== null && (
                            <div className={`flex justify-between items-center pt-3 mt-2 rounded-lg px-3 py-2 -mx-1 ${
                              actualProfit >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'
                            }`}>
                              <span className={`font-medium ${actualProfit >= 0 ? 'text-green-400' : 'text-red-500'}`}>
                                {actualProfit >= 0 ? 'Decision Paid Off' : 'Lesson Learned'}
                              </span>
                              <span className={`font-mono font-bold text-lg ${actualProfit >= 0 ? 'text-green-400' : 'text-red-500'}`}>
                                {actualProfit >= 0 ? '+' : '-'}${Math.abs(actualProfit).toFixed(2)}
                              </span>
                            </div>
                          )}
                        </>
                      ) : item.estimatedResale ? (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Est. Resale</span>
                            <span className="font-mono">${parseFloat(item.estimatedResale).toFixed(2)}</span>
                          </div>
                          {estimatedProfit !== null && (
                            <div className="flex justify-between pt-2 border-t border-border/50">
                              <span className="text-muted-foreground">Est. Profit</span>
                              <span className={`font-mono font-medium ${estimatedProfit >= 0 ? 'text-[#2F7D63]' : 'text-muted-foreground'}`}>
                                {estimatedProfit >= 0 
                                  ? `+$${estimatedProfit.toFixed(2)}`
                                  : `–$${Math.abs(estimatedProfit).toFixed(2)} expected`}
                              </span>
                            </div>
                          )}
                        </>
                      ) : null}
                    </div>

                    <div className="mt-4 pt-3 border-t border-border/50 flex gap-2 flex-wrap">
                      {/* Undo for listed → bought */}
                      {item.status === 'listed' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            updateItem.mutate({ 
                              id: item.id, 
                              status: 'bought'
                            });
                          }}
                          disabled={updateItem.isPending}
                          data-testid={`button-undo-list-${item.id}`}
                        >
                          <Undo2 className="w-3 h-3 mr-1" />
                          Undo List
                        </Button>
                      )}
                      {/* Undo for sold → listed or bought */}
                      {item.status === 'sold' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            updateItem.mutate({ 
                              id: item.id, 
                              status: 'listed',
                              actualSalePrice: null,
                              soldDate: null
                            });
                          }}
                          disabled={updateItem.isPending}
                          data-testid={`button-undo-sold-${item.id}`}
                        >
                          <Undo2 className="w-3 h-3 mr-1" />
                          Undo Sold
                        </Button>
                      )}
                      {item.status === 'bought' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-blue-600 border-blue-500/30 hover:bg-blue-500/10"
                          onClick={() => {
                            setListingModalItem(item);
                            setListingModalOpen(true);
                          }}
                          disabled={updateItem.isPending}
                          data-testid={`button-list-${item.id}`}
                        >
                          <Tag className="w-3 h-3 mr-1" />
                          List Item
                        </Button>
                      )}
                      {(item.status === 'bought' || item.status === 'listed') && (
                        <Button
                          size="sm"
                          className="flex-1 bg-green-500 hover:bg-green-600 text-white"
                          onClick={() => {
                            setSoldModalItem(item);
                            // Fix floating-point precision by rounding to 2 decimal places
                            const resaleValue = item.estimatedResale ? parseFloat(item.estimatedResale) : 0;
                            setSoldPriceInput(resaleValue > 0 ? resaleValue.toFixed(2) : "");
                            setSoldModalOpen(true);
                          }}
                          disabled={updateItem.isPending}
                          data-testid={`button-sold-${item.id}`}
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Mark Sold
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setDeleteTargetId(item.id);
                          setDeleteConfirmOpen(true);
                        }}
                        disabled={deleteItem.isPending}
                        data-testid={`button-delete-${item.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <motion.div 
            className="text-center py-16 px-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-muted border-2 border-dashed border-border mb-6">
              <Package className="w-10 h-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-xl font-bold mb-3 text-foreground">No capital deployed</h3>
            <p className="text-muted-foreground text-base mb-8 max-w-xs mx-auto leading-relaxed">
              Flips you commit to appear here.
            </p>
            <Link href="/scan">
              <Button 
                size="lg" 
                className="shadow-lg px-8"
                data-testid="button-scan-first"
              >
                <Scan className="w-5 h-5 mr-2" />
                New Scan
              </Button>
            </Link>
          </motion.div>
        )}
      </main>

      <BottomNav />

      <Dialog open={soldModalOpen} onOpenChange={setSoldModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              Record Sale
            </DialogTitle>
            <DialogDescription>
              Enter the price you sold this item for.
            </DialogDescription>
          </DialogHeader>
          
          {soldModalItem && (
            <div className="space-y-4">
              <div className="bg-secondary/50 rounded-lg p-3">
                <p className="text-sm font-medium line-clamp-2">{soldModalItem.title}</p>
                <p className="text-xs text-muted-foreground mt-1">Bought for: ${soldModalItem.purchasePrice}</p>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="sold-price">
                  Sale Price
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="sold-price"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="pl-9 font-mono"
                    value={soldPriceInput}
                    onChange={(e) => setSoldPriceInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'e' || e.key === 'E' || e.key === '+' || e.key === '-') {
                        e.preventDefault();
                      }
                    }}
                    data-testid="input-sold-price"
                  />
                </div>
              </div>
              
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setSoldModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-green-500 hover:bg-green-600"
                  onClick={handleMarkSold}
                  disabled={!soldPriceInput || updateItem.isPending}
                  data-testid="button-confirm-sold"
                >
                  {updateItem.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Record Sale
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete Item
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this item from your inventory? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteItem.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteItem.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* List Item Modal */}
      <Dialog open={listingModalOpen} onOpenChange={setListingModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-blue-600" />
              List on eBay
            </DialogTitle>
            <DialogDescription>
              Use this draft to create your eBay listing. Copy the details below.
            </DialogDescription>
          </DialogHeader>
          
          {listingModalItem && (
            <div className="space-y-4">
              {/* Suggested List Price */}
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                <p className="text-xs text-muted-foreground mb-1">Suggested List Price</p>
                <p className="text-2xl font-bold font-mono text-green-400" data-testid="text-suggested-price">
                  ${listingModalItem.estimatedResale ? parseFloat(listingModalItem.estimatedResale).toFixed(2) : "—"}
                </p>
                {listingModalItem.estimatedResale && listingModalItem.purchasePrice && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Expected profit: ${(parseFloat(listingModalItem.estimatedResale) - parseFloat(listingModalItem.purchasePrice) - parseFloat(listingModalItem.feesEstimate || "0") - parseFloat(listingModalItem.shippingEstimate || "5")).toFixed(2)}
                  </p>
                )}
              </div>
              
              {/* Title to Copy */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Listing Title</label>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => {
                      navigator.clipboard.writeText(listingModalItem.title);
                      toast({ title: "Title copied!" });
                    }}
                    data-testid="button-copy-title"
                  >
                    <Copy className="w-3 h-3 mr-1" />
                    Copy
                  </Button>
                </div>
                <Textarea 
                  readOnly 
                  value={listingModalItem.title} 
                  className="resize-none text-sm bg-secondary/30"
                  rows={2}
                  data-testid="textarea-listing-title"
                />
              </div>
              
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <a
                  href="https://www.ebay.com/sl/prelist"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center h-10 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 font-medium text-sm transition-colors"
                  data-testid="link-open-ebay-create"
                >
                  Open eBay Seller <ExternalLink className="w-4 h-4 ml-2" />
                </a>
                <Button
                  className="w-full"
                  onClick={() => {
                    handleMarkListed(listingModalItem);
                    setListingModalOpen(false);
                  }}
                  disabled={updateItem.isPending}
                  data-testid="button-mark-listed"
                >
                  {updateItem.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                  Confirm Listed
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={() => setListingModalOpen(false)}
                  data-testid="button-cancel-listing"
                >
                  Cancel
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {winCardData && (
        <WinCard
          isOpen={winCardOpen}
          onClose={() => {
            setWinCardOpen(false);
            setWinCardData(null);
          }}
          itemTitle={winCardData.itemTitle}
          buyPrice={winCardData.buyPrice}
          sellPrice={winCardData.sellPrice}
          profit={winCardData.profit}
          imageUrl={winCardData.imageUrl}
        />
      )}
    </div>
  );
}
