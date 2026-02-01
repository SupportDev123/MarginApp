import { useQuery } from "@tanstack/react-query";
import { BottomNav } from "@/components/BottomNav";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, Award, Target, DollarSign, BarChart3, ArrowRight } from "lucide-react";
import { MarginLogoFull } from "@/components/MarginLogo";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

interface AnalyticsData {
  topBrands: Array<{
    brand: string;
    sold: number;
    profit: number;
  }>;
  categoryProfit: Array<{
    category: string;
    avgProfit: number;
    itemsSold: number;
    totalProfit: number;
  }>;
  sellThrough: {
    rate: number;
    sold: number;
    listed: number;
  };
  summary: {
    totalProfit: number;
    avgProfitPerItem: number;
    totalSold: number;
    totalListed: number;
  };
}

export default function AnalyticsPage() {
  const { data: analytics, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ['/api/analytics'],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-sm px-4 py-3">
          <MarginLogoFull />
        </header>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
        <BottomNav />
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-sm px-4 py-3">
          <MarginLogoFull />
        </header>
        <div className="flex-1 p-4">
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Unable to load analytics</p>
            </CardContent>
          </Card>
        </div>
        <BottomNav />
      </div>
    );
  }

  const hasData = analytics.summary.totalSold > 0;

  return (
    <div className="min-h-screen flex flex-col bg-background pb-20">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-sm px-4 py-3">
        <div className="flex items-center justify-between">
          <MarginLogoFull />
          <Badge variant="secondary" className="text-xs">
            {analytics.summary.totalSold} sold
          </Badge>
        </div>
      </header>

      <main className="flex-1 p-4 space-y-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Sales Analytics
        </h1>
        <p className="text-sm text-muted-foreground -mt-2">
          What's working? Where should you source next?
        </p>

        {!hasData ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <Target className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="font-medium mb-1">No sales data yet</p>
              <p className="text-sm text-muted-foreground mb-4">
                Mark items as "sold" in your inventory to see analytics
              </p>
              <Link href="/inventory">
                <Button size="sm" data-testid="button-go-to-inventory">
                  Go to Inventory
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <DollarSign className="h-3 w-3" />
                    Total Profit
                  </div>
                  <div className="text-2xl font-bold text-green-600">
                    ${analytics.summary.totalProfit.toLocaleString()}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Target className="h-3 w-3" />
                    Sell-Through
                  </div>
                  <div className="text-2xl font-bold">
                    {analytics.sellThrough.rate}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {analytics.sellThrough.sold}/{analytics.sellThrough.listed} items
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Top Brands Section */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Award className="h-4 w-4 text-amber-500" />
                  Top-Selling Brands
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Keep sourcing these
                </p>
              </CardHeader>
              <CardContent className="pt-0">
                {analytics.topBrands.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    Not enough data yet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {analytics.topBrands.slice(0, 5).map((brand, index) => (
                      <div
                        key={brand.brand}
                        className="flex items-center justify-between py-2 border-b last:border-0"
                        data-testid={`brand-row-${index}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-muted-foreground w-5">
                            {index + 1}
                          </span>
                          <div>
                            <div className="font-medium">{brand.brand}</div>
                            <div className="text-xs text-muted-foreground">
                              {brand.sold} item{brand.sold !== 1 ? 's' : ''} sold
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-green-600">
                            +${Math.round(brand.profit)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            profit
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Category Profit Section */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  Profit by Category
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Where your time pays off most
                </p>
              </CardHeader>
              <CardContent className="pt-0">
                {analytics.categoryProfit.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    Not enough data yet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {analytics.categoryProfit.map((cat, index) => (
                      <div
                        key={cat.category}
                        className="flex items-center justify-between py-2 border-b last:border-0"
                        data-testid={`category-row-${index}`}
                      >
                        <div>
                          <div className="font-medium">{cat.category}</div>
                          <div className="text-xs text-muted-foreground">
                            {cat.itemsSold} sale{cat.itemsSold !== 1 ? 's' : ''} • ${cat.totalProfit} total
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge
                            variant={cat.avgProfit >= 20 ? "default" : "secondary"}
                            className={cat.avgProfit >= 20 ? "bg-green-600" : ""}
                          >
                            ${cat.avgProfit}/item
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sell-Through Rate Section */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4 text-purple-500" />
                  Sell-Through Rate
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {analytics.sellThrough.rate >= 50 
                    ? "You're picking winners!" 
                    : analytics.sellThrough.rate >= 30 
                    ? "Solid performance" 
                    : "Consider being pickier at yard sales"}
                </p>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="flex items-end gap-4">
                  <div className="flex-1">
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-500"
                        style={{ width: `${Math.min(analytics.sellThrough.rate, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-2xl font-bold">
                    {analytics.sellThrough.rate}%
                  </div>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>{analytics.sellThrough.sold} sold</span>
                  <span>{analytics.sellThrough.listed - analytics.sellThrough.sold} still listed</span>
                </div>
              </CardContent>
            </Card>

            {/* Actionable Insight */}
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-4 pb-4">
                <div className="font-medium text-sm mb-1">Sourcing Tip</div>
                <p className="text-sm text-muted-foreground">
                  {analytics.topBrands.length > 0 
                    ? `${analytics.topBrands[0].brand} is your best performer. Look for more at yard sales!`
                    : analytics.categoryProfit.length > 0
                    ? `${analytics.categoryProfit[0].category} gives you the best profit per item. Focus there!`
                    : "Keep scanning items to build your analytics data."}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
