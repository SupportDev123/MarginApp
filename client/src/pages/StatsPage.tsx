import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "@/components/BottomNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  TrendingUp, DollarSign, Target, Award, 
  ThumbsUp, ThumbsDown, Bell, Trash2, Loader2,
  BarChart3, Zap, Calendar, Clock, Trophy, Flame, CheckCircle, Settings
} from "lucide-react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";

interface UserStats {
  totalScans: number;
  totalFlips: number;
  totalSkips: number;
  flipRate: number;
  totalPotentialProfit: number;
  thisMonthProfit: number;
  thisMonthScans: number;
  lastMonthScans: number;
  avgMargin: number;
  bestCategory: string;
  bestCategoryProfit: number;
  categoryBreakdown: { name: string; count: number; profit: number }[];
  profitRealized: number;
  itemsSold: number;
  winRate: number;
  timeSavedHours: number;
  weeklyTrend: number[];
  streak: number;
}

interface MysteryFlip {
  id: number;
  title: string;
  price: string;
  imageUrl?: string;
  category?: string;
  userVote: 'flip' | 'skip' | null;
  flipVotes: number;
  skipVotes: number;
  totalVotes: number;
  message?: string;
}

interface PriceAlert {
  id: number;
  title: string;
  originalPrice: string;
  currentPrice?: string;
  maxBuyPrice?: string;
  alertTriggered: boolean;
  createdAt: string;
}

export default function StatsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [votingId, setVotingId] = useState<number | null>(null);

  // Fetch user stats
  const { data: stats, isLoading: statsLoading } = useQuery<UserStats>({
    queryKey: ['/api/user/stats'],
    enabled: !!user,
  });

  // Fetch mystery flip
  const { data: mysteryFlip, isLoading: mysteryLoading } = useQuery<MysteryFlip>({
    queryKey: ['/api/mystery-flip'],
    enabled: !!user,
  });

  // Fetch price alerts
  const { data: priceAlerts = [], isLoading: alertsLoading } = useQuery<PriceAlert[]>({
    queryKey: ['/api/price-alerts'],
    enabled: !!user,
  });

  // Vote mutation - navigates after voting
  const voteMutation = useMutation({
    mutationFn: async ({ id, vote }: { id: number; vote: 'flip' | 'skip' }) => {
      setVotingId(id);
      const res = await apiRequest('POST', `/api/mystery-flip/${id}/vote`, { vote });
      return { ...(await res.json()), vote };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/mystery-flip'] });
      if (data.vote === 'flip') {
        toast({ title: "FLIP IT! Added to Bought" });
        navigate('/inventory?status=bought');
      } else {
        toast({ title: "SKIP IT! Item passed" });
        navigate('/scans?filter=skip');
      }
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to vote", variant: "destructive" });
    },
    onSettled: () => setVotingId(null),
  });

  // Delete alert mutation
  const deleteAlertMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/price-alerts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/price-alerts'] });
      toast({ title: "Alert removed" });
    },
  });

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="p-4 pt-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-display font-bold">Your Stats</h1>
              <p className="text-sm text-muted-foreground">Track your flipping progress</p>
            </div>
          </div>
          <Link href="/settings">
            <Button size="icon" variant="ghost" className="text-muted-foreground" data-testid="button-settings">
              <Settings className="w-5 h-5" />
            </Button>
          </Link>
        </div>

        {/* Stats Dashboard */}
        {statsLoading ? (
          <Card className="p-8 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </Card>
        ) : stats ? (
          <div className="space-y-4 mb-6">
            {/* Money Stats - Top Row */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="p-4" data-testid="card-profit-realized">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-xs text-muted-foreground">Profit Realized</span>
                </div>
                <div className="text-2xl font-bold text-green-500" data-testid="text-profit-realized">
                  ${stats.profitRealized.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {stats.itemsSold} items sold
                </div>
              </Card>

              <Card className="p-4" data-testid="card-potential-value">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-amber-500" />
                  <span className="text-xs text-muted-foreground">Potential Value</span>
                </div>
                <div className="text-2xl font-bold text-amber-500" data-testid="text-flip-value">
                  ${stats.totalPotentialProfit.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  ${stats.thisMonthProfit} this month
                </div>
              </Card>
            </div>

            {/* Performance Stats - Second Row */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="p-4" data-testid="card-win-rate">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  <span className="text-xs text-muted-foreground">Win Rate</span>
                </div>
                <div className="text-2xl font-bold" data-testid="text-win-rate">{stats.winRate}%</div>
                <div className="text-xs text-muted-foreground mt-1">
                  of our flips you sold
                </div>
              </Card>

              <Card className="p-4" data-testid="card-time-saved">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Time Saved</span>
                </div>
                <div className="text-2xl font-bold" data-testid="text-time-saved">{stats.timeSavedHours}h</div>
                <div className="text-xs text-muted-foreground mt-1">
                  of research time
                </div>
              </Card>
            </div>

            {/* Activity Stats */}
            <div className="grid grid-cols-4 gap-2">
              {stats.streak > 0 && (
                <Card className="p-3 text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Flame className={`w-4 h-4 ${stats.streak > 0 ? 'text-orange-500' : 'text-muted-foreground'}`} />
                  </div>
                  <div className={`text-lg font-bold ${stats.streak > 0 ? 'text-orange-500' : ''}`}>
                    {stats.streak}
                  </div>
                  <div className="text-xs text-muted-foreground">Day Streak</div>
                </Card>
              )}
              <Card className="p-3 text-center">
                <div className="text-lg font-bold">{stats.totalScans}</div>
                <div className="text-xs text-muted-foreground">Scans</div>
              </Card>
              <Card className="p-3 text-center">
                <div className="text-lg font-bold text-green-500">{stats.totalFlips}</div>
                <div className="text-xs text-muted-foreground">Flips</div>
              </Card>
              <Card className="p-3 text-center">
                <div className="text-lg font-bold">{stats.avgMargin}%</div>
                <div className="text-xs text-muted-foreground">Margin</div>
              </Card>
            </div>

            {/* Weekly Trend */}
            {stats.weeklyTrend && stats.weeklyTrend.some(v => v > 0) && (
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Weekly Activity</span>
                </div>
                <div className="flex items-end justify-between gap-2 h-16">
                  {stats.weeklyTrend.map((count, i) => {
                    const maxCount = Math.max(...stats.weeklyTrend, 1);
                    const height = (count / maxCount) * 100;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div 
                          className="w-full bg-primary/20 rounded-t transition-all"
                          style={{ height: `${Math.max(height, 4)}%` }}
                        >
                          <div 
                            className="w-full h-full bg-primary rounded-t"
                            style={{ opacity: count > 0 ? 1 : 0.3 }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {i === 3 ? 'Now' : `W${i + 1}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Best Category */}
            {stats.bestCategory !== 'None' && (
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-amber-500" />
                    <div>
                      <div className="text-sm font-medium">Best Category</div>
                      <div className="text-xs text-muted-foreground">Highest profit potential</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="mb-1">{stats.bestCategory}</Badge>
                    <div className="text-sm font-bold text-green-500">
                      +${stats.bestCategoryProfit}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Category Breakdown */}
            {stats.categoryBreakdown.length > 0 && (
              <Card className="p-4">
                <h3 className="text-xs font-bold text-muted-foreground uppercase mb-3">
                  By Category
                </h3>
                <div className="space-y-2">
                  {stats.categoryBreakdown.slice(0, 5).map((cat) => (
                    <div key={cat.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{cat.name}</span>
                        <span className="text-xs text-muted-foreground">({cat.count})</span>
                      </div>
                      <span className="text-sm font-medium text-green-500">+${cat.profit}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        ) : (
          <Card className="p-6 text-center mb-6">
            <p className="text-muted-foreground">No stats yet. Start scanning items!</p>
          </Card>
        )}

        {/* Price Drop Alerts */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Bell className="w-5 h-5 text-primary" />
            <h2 className="font-bold">Price Drop Alerts</h2>
            <Badge variant="outline" className="ml-auto">
              {priceAlerts.length} watching
            </Badge>
          </div>

          {alertsLoading ? (
            <Card className="p-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </Card>
          ) : priceAlerts.length === 0 ? (
            <Card className="p-6 text-center">
              <Bell className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-2">No price alerts yet</p>
              <p className="text-xs text-muted-foreground">
                When you skip an item, you can watch it for price drops
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {priceAlerts.map((alert) => (
                <Card key={alert.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{alert.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          Was: ${alert.originalPrice}
                        </span>
                        {alert.alertTriggered && (
                          <Badge variant="default" className="bg-green-500 text-xs">
                            Price Dropped!
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteAlertMutation.mutate(alert.id)}
                      data-testid={`button-delete-alert-${alert.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
