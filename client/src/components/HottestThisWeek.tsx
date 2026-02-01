import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flame, TrendingUp, DollarSign } from "lucide-react";

interface HotItem {
  id: number;
  category: string;
  queryKey: string;
  sampleTitle: string;
  sales7d: number;
  sales30d: number;
  lastSoldAt: string | null;
  medianPrice: string | null;
  createdAt: string;
  updatedAt: string;
}

export function HottestThisWeek() {
  const { data: hotItems, isLoading } = useQuery<HotItem[]>({
    queryKey: ['/api/hottest'],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="mt-6" data-testid="container-hottest-loading">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Flame className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground" data-testid="text-hottest-header">Hottest This Week</span>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted/30 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!hotItems || hotItems.length === 0) {
    return null;
  }

  const formatPrice = (price: string | null) => {
    if (!price) return null;
    const num = parseFloat(price);
    if (isNaN(num)) return null;
    return `$${num.toFixed(0)}`;
  };

  const truncateTitle = (title: string, maxLen: number = 40) => {
    if (title.length <= maxLen) return title;
    return title.slice(0, maxLen).trim() + '...';
  };

  return (
    <div className="mt-6" data-testid="container-hottest-items">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Flame className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground" data-testid="text-hottest-header">Hottest This Week</span>
        <Badge variant="outline" className="text-xs ml-auto" data-testid="badge-hottest-live">
          <TrendingUp className="w-3 h-3 mr-1" />
          Live
        </Badge>
      </div>
      
      <div className="space-y-2">
        {hotItems.slice(0, 5).map((item, idx) => (
          <Card 
            key={item.id} 
            className="p-3 border-border/50 bg-card/50"
            data-testid={`card-hot-item-${item.id}`}
          >
            <div className="flex flex-wrap items-start gap-3">
              <div 
                className="flex items-center justify-center w-7 h-7 rounded-full bg-muted text-muted-foreground text-sm font-bold shrink-0"
                data-testid={`text-hot-item-rank-${item.id}`}
              >
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground leading-tight truncate" data-testid={`text-hot-item-title-${item.id}`}>
                  {truncateTitle(item.sampleTitle)}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-xs" data-testid={`badge-hot-item-category-${item.id}`}>
                    {item.category}
                  </Badge>
                  <span className="text-xs text-muted-foreground" data-testid={`text-hot-item-sales-${item.id}`}>
                    {item.sales7d} sold in 7d
                  </span>
                </div>
              </div>
              {item.medianPrice && (
                <div className="flex items-center gap-1 text-sm font-semibold text-foreground shrink-0" data-testid={`text-hot-item-price-${item.id}`}>
                  <DollarSign className="w-3 h-3" />
                  {formatPrice(item.medianPrice)?.replace('$', '')}
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
      
      <p className="text-xs text-muted-foreground/60 text-center mt-3" data-testid="text-hottest-footer">
        Based on recent eBay sold data
      </p>
    </div>
  );
}
