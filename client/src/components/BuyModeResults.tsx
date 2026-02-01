import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Share2, TrendingUp, TrendingDown, Minus, Clock, Activity, Zap, AlertTriangle, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";
import type { CompsResult, SoldComp } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface BuyModeResultsProps {
  item: {
    id: number;
    title?: string | null;
    confirmedTitle?: string | null;
    price?: string | null;
    url: string;
    rawAnalysis?: any;
    avgComp?: string | null;
    lowComp?: string | null;
    highComp?: string | null;
  };
  onShare?: () => void;
}

interface BuyModeData {
  verdict: 'under_market' | 'fair_market' | 'over_market';
  verdictLabel: string;
  marketMedian: number;
  low25: number;
  high75: number;
  demand: 'hot' | 'active' | 'slow';
  demandLabel: string;
  demandDescription: string;
  lastSoldDate: Date | null;
  confidence: 'high' | 'medium' | 'low';
  confidenceReason?: string;
  cleanCompsCount: number;
  sales30d: number;
  ratio: number;
  askPrice: number;
  hasRecentData: boolean;
}

function computeBuyModeData(item: BuyModeResultsProps['item']): BuyModeData | null {
  const rawAnalysis = item.rawAnalysis as { comps?: CompsResult } | null;
  const compsResult = rawAnalysis?.comps;
  
  if (!compsResult?.comps || !Array.isArray(compsResult.comps) || compsResult.comps.length === 0) {
    return null;
  }
  
  const allComps = compsResult.comps as SoldComp[];
  const askPrice = parseFloat(item.price || '0') || 0;
  
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  
  const sortedByPrice = [...allComps].sort((a, b) => a.soldPrice - b.soldPrice);
  const trimCount = Math.floor(sortedByPrice.length * 0.1);
  const cleanComps = trimCount > 0 && sortedByPrice.length > 10 
    ? sortedByPrice.slice(trimCount, sortedByPrice.length - trimCount)
    : sortedByPrice;
  
  const parseDate = (comp: SoldComp): Date | null => {
    if (!comp.dateSold) return null;
    const d = new Date(comp.dateSold);
    return isNaN(d.getTime()) ? null : d;
  };
  
  const compsWithDates = cleanComps.map(c => ({ ...c, parsedDate: parseDate(c) }));
  const comps30d = compsWithDates.filter(c => c.parsedDate && c.parsedDate >= thirtyDaysAgo);
  const comps7d = compsWithDates.filter(c => c.parsedDate && c.parsedDate >= sevenDaysAgo);
  const comps90d = compsWithDates.filter(c => c.parsedDate && c.parsedDate >= ninetyDaysAgo);
  
  const sales30d = comps30d.length;
  const sales90d = comps90d.length;
  
  let pricesForStats = comps30d.map(c => c.soldPrice);
  let dataWindow: '30d' | '90d' | 'all' = '30d';
  let hasRecentData = true;
  
  if (pricesForStats.length === 0) {
    pricesForStats = comps90d.map(c => c.soldPrice);
    dataWindow = '90d';
    hasRecentData = false;
  }
  
  if (pricesForStats.length === 0) {
    pricesForStats = cleanComps.map(c => c.soldPrice);
    dataWindow = 'all';
  }
  
  if (pricesForStats.length === 0) {
    return null;
  }
  
  pricesForStats.sort((a, b) => a - b);
  
  const median = pricesForStats.length % 2 === 0
    ? (pricesForStats[pricesForStats.length / 2 - 1] + pricesForStats[pricesForStats.length / 2]) / 2
    : pricesForStats[Math.floor(pricesForStats.length / 2)];
  
  const low25Idx = Math.floor(pricesForStats.length * 0.25);
  const high75Idx = Math.floor(pricesForStats.length * 0.75);
  const low25 = pricesForStats[low25Idx] || pricesForStats[0];
  const high75 = pricesForStats[high75Idx] || pricesForStats[pricesForStats.length - 1];
  
  const ratio = askPrice > 0 ? askPrice / median : 1;
  
  let verdict: BuyModeData['verdict'];
  let verdictLabel: string;
  
  if (ratio <= 0.85) {
    verdict = 'under_market';
    verdictLabel = 'Under Market';
  } else if (ratio <= 1.05) {
    verdict = 'fair_market';
    verdictLabel = 'Fair Market';
  } else {
    verdict = 'over_market';
    verdictLabel = 'Over Market';
  }
  
  // Calculate velocity based on actual data window used
  let velocityDaily: number;
  let salesInWindow: number;
  if (dataWindow === '30d') {
    velocityDaily = sales30d / 30;
    salesInWindow = sales30d;
  } else if (dataWindow === '90d') {
    velocityDaily = sales90d / 90;
    salesInWindow = sales90d;
  } else {
    // For 'all' fallback, use total comps over rough estimate
    velocityDaily = cleanComps.length / 90; // Conservative estimate
    salesInWindow = cleanComps.length;
  }
  
  let demand: BuyModeData['demand'];
  let demandLabel: string;
  let demandDescription: string;
  
  if (velocityDaily >= 1.0) {
    demand = 'hot';
    demandLabel = 'Hot';
    demandDescription = 'Sells multiple times per day';
  } else if (velocityDaily >= 0.2) {
    demand = 'active';
    demandLabel = 'Active';
    demandDescription = 'Sells weekly';
  } else {
    demand = 'slow';
    demandLabel = 'Slow';
    demandDescription = 'Infrequent sales';
  }
  
  const allDates = compsWithDates
    .filter(c => c.parsedDate)
    .map(c => c.parsedDate!)
    .sort((a, b) => b.getTime() - a.getTime());
  const lastSoldDate = allDates.length > 0 ? allDates[0] : null;
  
  // Confidence based on data quality aligned with actual data window
  let confidence: BuyModeData['confidence'];
  let confidenceReason: string | undefined;
  
  if (dataWindow === '30d' && cleanComps.length >= 30 && sales30d >= 10) {
    confidence = 'high';
  } else if (cleanComps.length >= 15 && salesInWindow >= 5) {
    confidence = 'medium';
  } else {
    confidence = 'low';
    confidenceReason = 'Limited recent sales data.';
  }
  
  if (!hasRecentData && confidence !== 'low') {
    confidence = 'low';
    confidenceReason = 'No recent purchases in last 30 days.';
  }
  
  return {
    verdict,
    verdictLabel,
    marketMedian: median,
    low25,
    high75,
    demand,
    demandLabel,
    demandDescription,
    lastSoldDate,
    confidence,
    confidenceReason,
    cleanCompsCount: cleanComps.length,
    sales30d,
    ratio,
    askPrice,
    hasRecentData,
  };
}

export function BuyModeResults({ item, onShare }: BuyModeResultsProps) {
  const { toast } = useToast();
  const buyModeData = computeBuyModeData(item);
  
  const handleShare = () => {
    if (onShare) {
      onShare();
    } else if (navigator.share) {
      navigator.share({
        title: item.confirmedTitle || item.title || "Market Analysis",
        text: `Market Check: ${buyModeData?.verdictLabel || 'Analysis'}`,
        url: window.location.href,
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast({ title: "Copied to clipboard" });
    }
  };
  
  const verdictColors = {
    under_market: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/30',
      text: 'text-emerald-400',
      icon: TrendingDown,
    },
    fair_market: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/30',
      text: 'text-blue-400',
      icon: Minus,
    },
    over_market: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      text: 'text-red-400',
      icon: TrendingUp,
    },
  };
  
  const demandColors = {
    hot: 'text-red-400',
    active: 'text-emerald-400',
    slow: 'text-muted-foreground',
  };
  
  const confidenceColors = {
    high: 'text-emerald-400',
    medium: 'text-amber-400',
    low: 'text-muted-foreground',
  };

  if (!buyModeData) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 bg-background/80 backdrop-blur-md border-b border-border/50">
          <Link href="/deep-scan?mode=buy">
            <Button variant="ghost" size="icon" className="-ml-2" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="font-semibold text-sm uppercase tracking-wide opacity-70">Market Check</h1>
          <Button variant="ghost" size="icon" className="-mr-2" onClick={handleShare} data-testid="button-share">
            <Share2 className="w-5 h-5" />
          </Button>
        </div>
        
        <div className="p-4">
          <Card className="p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Insufficient Data</h2>
            <p className="text-muted-foreground text-sm">
              Not enough sold data to compute market verdict. Try a different item or check eBay directly.
            </p>
          </Card>
        </div>
      </div>
    );
  }

  const VerdictIcon = verdictColors[buyModeData.verdict].icon;
  const colors = verdictColors[buyModeData.verdict];

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 flex items-center justify-between p-4 bg-background/80 backdrop-blur-md border-b border-border/50">
        <Link href="/deep-scan?mode=buy">
          <Button variant="ghost" size="icon" className="-ml-2" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="font-semibold text-sm uppercase tracking-wide opacity-70">Market Check</h1>
        <Button variant="ghost" size="icon" className="-mr-2" onClick={handleShare} data-testid="button-share">
          <Share2 className="w-5 h-5" />
        </Button>
      </div>

      <div className="p-4 space-y-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "rounded-2xl py-4 px-6 text-center border",
            colors.bg,
            colors.border
          )}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="flex items-center justify-center gap-3 mb-2"
          >
            <VerdictIcon className={cn("w-8 h-8", colors.text)} />
            <h2 className={cn("text-2xl font-bold", colors.text)} data-testid="text-buy-verdict">
              {buyModeData.verdictLabel}
            </h2>
          </motion.div>

          {buyModeData.askPrice > 0 && (
            <p className="text-sm text-muted-foreground">
              Asking ${buyModeData.askPrice.toFixed(2)} — {buyModeData.ratio > 1 
                ? `${Math.round((buyModeData.ratio - 1) * 100)}% above` 
                : buyModeData.ratio < 1 
                  ? `${Math.round((1 - buyModeData.ratio) * 100)}% below` 
                  : 'at'} market median
            </p>
          )}
        </motion.div>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">Market Median</span>
            <span className="text-lg font-bold" data-testid="text-market-median">
              ${buyModeData.marketMedian.toFixed(2)}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Typical Range</span>
            <span className="text-sm font-medium" data-testid="text-market-range">
              ${buyModeData.low25.toFixed(2)} – ${buyModeData.high75.toFixed(2)}
            </span>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Activity className={cn("w-5 h-5", demandColors[buyModeData.demand])} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Demand</p>
              <p className={cn("text-lg font-bold", demandColors[buyModeData.demand])} data-testid="text-demand">
                {buyModeData.demandLabel}
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground ml-13" data-testid="text-demand-description">
            {buyModeData.demandDescription}
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Last Sold</p>
              <p className="text-base font-medium" data-testid="text-last-sold">
                {buyModeData.lastSoldDate 
                  ? formatDistanceToNow(buyModeData.lastSoldDate, { addSuffix: true })
                  : 'Unknown'}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Zap className={cn("w-5 h-5", confidenceColors[buyModeData.confidence])} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Confidence</p>
                <p className={cn("text-base font-medium capitalize", confidenceColors[buyModeData.confidence])} data-testid="text-confidence">
                  {buyModeData.confidence}
                </p>
              </div>
            </div>
            <Badge variant="secondary" className="text-xs">
              {buyModeData.cleanCompsCount} comps
            </Badge>
          </div>
          
          {buyModeData.confidenceReason && (
            <p className="text-xs text-muted-foreground mt-2 ml-13" data-testid="text-confidence-warning">
              {buyModeData.confidenceReason}
            </p>
          )}
        </Card>

        <Card className="p-4">
          <p className="text-sm font-medium mb-2 line-clamp-2" data-testid="text-item-title">
            {item.confirmedTitle || item.title}
          </p>
          {item.url && !item.url.startsWith('camera://') && !item.url.startsWith('market://') && (
            <a 
              href={item.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              View on eBay
            </a>
          )}
        </Card>
      </div>
    </div>
  );
}
