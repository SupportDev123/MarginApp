import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Target, TrendingUp, Trophy, Flame, Calendar, 
  DollarSign, Zap, Star, CheckCircle, Plus, 
  ArrowRight, Sparkles, Award, Crown
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { BottomNav } from "@/components/BottomNav";
import { MarginLogoFull } from "@/components/MarginLogo";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

type UserStatsData = {
  totalScans: number;
  totalFlips: number;
  totalSkips: number;
  totalProfitPotential: number;
  currentStreak: number;
  longestStreak: number;
  largestSingleProfit: number;
};

type Achievement = {
  id: number;
  achievementType: string;
  earnedAt: string;
  metadata?: Record<string, any>;
};

type ProfitGoalData = {
  id: number;
  targetAmount: number;
  currentAmount: number;
  flipsToday: number;
  scansToday: number;
  completed: boolean;
};

const ACHIEVEMENT_INFO: Record<string, { icon: JSX.Element; title: string; description: string; color: string }> = {
  FIRST_SCAN: { icon: <Zap className="w-5 h-5" />, title: "First Steps", description: "Completed your first scan", color: "bg-blue-500" },
  FIRST_FLIP: { icon: <DollarSign className="w-5 h-5" />, title: "Money Maker", description: "Found your first flip", color: "bg-green-500" },
  TEN_FLIPS: { icon: <TrendingUp className="w-5 h-5" />, title: "Getting Warmed Up", description: "Found 10 flips", color: "bg-green-600" },
  FIFTY_FLIPS: { icon: <Trophy className="w-5 h-5" />, title: "Flip Master", description: "Found 50 flips", color: "bg-yellow-500" },
  HUNDRED_FLIPS: { icon: <Crown className="w-5 h-5" />, title: "Centurion", description: "Found 100 flips", color: "bg-purple-500" },
  FIRST_100_PROFIT: { icon: <DollarSign className="w-5 h-5" />, title: "Benjamin", description: "$100+ profit potential", color: "bg-green-500" },
  FIRST_500_PROFIT: { icon: <Star className="w-5 h-5" />, title: "High Roller", description: "$500+ profit potential", color: "bg-yellow-500" },
  FIRST_1000_PROFIT: { icon: <Crown className="w-5 h-5" />, title: "Thousandaire", description: "$1000+ profit potential", color: "bg-purple-500" },
  STREAK_3: { icon: <Flame className="w-5 h-5" />, title: "On Fire", description: "3-day scanning streak", color: "bg-orange-500" },
  STREAK_7: { icon: <Flame className="w-5 h-5" />, title: "Weekly Warrior", description: "7-day scanning streak", color: "bg-orange-600" },
  STREAK_30: { icon: <Flame className="w-5 h-5" />, title: "Unstoppable", description: "30-day scanning streak", color: "bg-red-500" },
  BATCH_MASTER: { icon: <Sparkles className="w-5 h-5" />, title: "Batch Master", description: "50+ items in batch mode", color: "bg-indigo-500" },
  CATEGORY_EXPERT_SHOES: { icon: <Award className="w-5 h-5" />, title: "Sneakerhead", description: "50+ shoe scans", color: "bg-blue-600" },
  CATEGORY_EXPERT_WATCHES: { icon: <Award className="w-5 h-5" />, title: "Horologist", description: "50+ watch scans", color: "bg-amber-600" },
  CATEGORY_EXPERT_CARDS: { icon: <Award className="w-5 h-5" />, title: "Card Shark", description: "50+ card scans", color: "bg-red-600" },
  SHARP_EYE: { icon: <Target className="w-5 h-5" />, title: "Sharp Eye", description: "Found 5x value item", color: "bg-cyan-500" },
  WHALE_FINDER: { icon: <Award className="w-5 h-5" />, title: "Whale Finder", description: "$500+ single profit", color: "bg-purple-600" },
  QUICK_DRAW: { icon: <Zap className="w-5 h-5" />, title: "Quick Draw", description: "10 scans in 5 minutes", color: "bg-yellow-400" },
};

export default function ProfitDashboard() {
  const [goalInput, setGoalInput] = useState("100");
  const [showGoalInput, setShowGoalInput] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading } = useQuery<UserStatsData>({
    queryKey: ['/api/gamification/stats'],
  });

  const { data: achievements, isLoading: achievementsLoading } = useQuery<Achievement[]>({
    queryKey: ['/api/gamification/achievements'],
  });

  const { data: todayGoal } = useQuery<ProfitGoalData | null>({
    queryKey: ['/api/gamification/goal/today'],
  });

  const setGoalMutation = useMutation({
    mutationFn: async (targetAmount: number) => {
      const res = await apiRequest("POST", "/api/gamification/goal", { targetAmount });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/goal/today'] });
      setShowGoalInput(false);
      toast({ title: "Daily goal set!" });
    },
  });

  const handleSetGoal = () => {
    const amount = parseFloat(goalInput);
    if (amount > 0) {
      setGoalMutation.mutate(amount);
    }
  };

  const goalProgress = todayGoal 
    ? Math.min((Number(todayGoal.currentAmount) / Number(todayGoal.targetAmount)) * 100, 100)
    : 0;

  const earnedAchievements = new Set(achievements?.map(a => a.achievementType) || []);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10">
        <div className="h-1 bg-gradient-to-r from-primary via-yellow-400 to-orange-500" />
        <div className="bg-background/95 backdrop-blur-md border-b border-border/50 px-4 py-3">
          <div className="flex items-center justify-between">
            <MarginLogoFull height={32} />
            {stats && stats.currentStreak > 0 && (
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-500" />
                <span className="font-bold">{stats.currentStreak}</span>
                <span className="text-xs text-muted-foreground">day streak</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="p-4 space-y-4">
        <Card className="p-4 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              <h2 className="font-bold">Daily Profit Goal</h2>
            </div>
            {!showGoalInput && (
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => setShowGoalInput(true)}
                data-testid="button-edit-goal"
              >
                <Plus className="w-4 h-4 mr-1" />
                {todayGoal ? 'Edit' : 'Set Goal'}
              </Button>
            )}
          </div>

          <AnimatePresence mode="wait">
            {showGoalInput ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3"
              >
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-muted-foreground" />
                  <Input
                    type="number"
                    value={goalInput}
                    onChange={(e) => setGoalInput(e.target.value)}
                    placeholder="Enter target..."
                    className="flex-1"
                    data-testid="input-goal-amount"
                  />
                </div>
                <div className="flex gap-2">
                  {[50, 100, 200, 500].map((amount) => (
                    <Button
                      key={amount}
                      size="sm"
                      variant="outline"
                      onClick={() => setGoalInput(amount.toString())}
                      className="flex-1"
                    >
                      ${amount}
                    </Button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="ghost" 
                    onClick={() => setShowGoalInput(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleSetGoal}
                    disabled={setGoalMutation.isPending}
                    className="flex-1"
                    data-testid="button-save-goal"
                  >
                    Set Goal
                  </Button>
                </div>
              </motion.div>
            ) : todayGoal ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <div className="flex items-end justify-between mb-2">
                  <div>
                    <span className="text-3xl font-bold text-primary">
                      ${Number(todayGoal.currentAmount).toFixed(0)}
                    </span>
                    <span className="text-muted-foreground"> / ${Number(todayGoal.targetAmount).toFixed(0)}</span>
                  </div>
                  {todayGoal.completed && (
                    <Badge className="bg-green-500">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Complete!
                    </Badge>
                  )}
                </div>
                <Progress value={goalProgress} className="h-3 mb-2" />
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{todayGoal.scansToday} scans today</span>
                  <span>{todayGoal.flipsToday} flips found</span>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-4 space-y-3"
              >
                <div>
                  <p className="text-muted-foreground mb-1 font-medium">No goal set for today</p>
                  <p className="text-sm text-muted-foreground">Set a daily target to stay motivated!</p>
                </div>
                <Button 
                  onClick={() => setShowGoalInput(true)}
                  variant="outline"
                  size="sm"
                  className="w-full"
                  data-testid="button-set-goal-empty"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Set Daily Goal
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        {/* Scan Now Quick Action */}
        <Link href="/deep-scan?mode=live">
          <Button 
            className="w-full h-12 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-white font-semibold text-base"
            data-testid="button-scan-now-dashboard"
          >
            <Plus className="w-5 h-5 mr-2" />
            Scan Now
          </Button>
        </Link>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Total Profit Found</span>
            </div>
            <p className="text-2xl font-bold text-green-500">
              ${stats ? Number(stats.totalProfitPotential).toFixed(0) : '0'}
            </p>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm text-muted-foreground">Total Scans</span>
            </div>
            <p className="text-2xl font-bold">{stats?.totalScans || 0}</p>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Flips Found</span>
            </div>
            <p className="text-2xl font-bold text-green-500">{stats?.totalFlips || 0}</p>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-4 h-4 text-yellow-500" />
              <span className="text-sm text-muted-foreground">Biggest Find</span>
            </div>
            <p className="text-2xl font-bold text-yellow-500">
              ${stats ? Number(stats.largestSingleProfit).toFixed(0) : '0'}
            </p>
          </Card>
        </div>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-500" />
              <h2 className="font-bold">Achievements</h2>
            </div>
            <Badge variant="outline">
              {earnedAchievements.size} / {Object.keys(ACHIEVEMENT_INFO).length}
            </Badge>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {Object.entries(ACHIEVEMENT_INFO).map(([type, info]) => {
              const earned = earnedAchievements.has(type);
              return (
                <motion.div
                  key={type}
                  className={`relative flex flex-col items-center p-3 rounded-lg transition-all ${
                    earned 
                      ? `${info.color} text-white shadow-lg` 
                      : 'bg-muted/30 text-muted-foreground/50'
                  }`}
                  whileHover={earned ? { scale: 1.05 } : {}}
                  data-testid={`achievement-${type}`}
                >
                  <div className={`mb-1 ${!earned && 'opacity-30'}`}>
                    {info.icon}
                  </div>
                  <p className="text-[10px] text-center leading-tight font-medium">
                    {info.title}
                  </p>
                  {earned && (
                    <div className="absolute -top-1 -right-1">
                      <CheckCircle className="w-4 h-4 text-white drop-shadow-md" />
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Flame className="w-5 h-5 text-orange-500" />
            <h2 className="font-bold">Streak Stats</h2>
          </div>
          
          <div className="flex items-center justify-around">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-orange-500/20 flex items-center justify-center mb-2">
                <span className="text-2xl font-bold text-orange-500">{stats?.currentStreak || 0}</span>
              </div>
              <p className="text-xs text-muted-foreground">Current</p>
            </div>
            <ArrowRight className="w-5 h-5 text-muted-foreground/30" />
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-2">
                <span className="text-2xl font-bold text-primary">{stats?.longestStreak || 0}</span>
              </div>
              <p className="text-xs text-muted-foreground">Best</p>
            </div>
          </div>
        </Card>

        <Link href="/scan">
          <Button className="w-full h-14 text-lg" data-testid="button-start-scanning">
            <Zap className="w-5 h-5 mr-2" />
            Start Scanning
          </Button>
        </Link>
      </main>

      <BottomNav />
    </div>
  );
}
