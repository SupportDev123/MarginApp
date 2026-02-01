import { useScanStatus } from "@/hooks/use-items";
import { useQuery } from "@tanstack/react-query";
import { Zap, Target, TrendingUp, Coins } from "lucide-react";
import { motion } from "framer-motion";

interface UserStats {
  totalScans: number;
  totalFlips: number;
  totalSkips: number;
  flipRate: number;
  totalPotentialProfit: number;
  streak: number;
}

export function useUserStats() {
  return useQuery<UserStats>({
    queryKey: ['/api/user/stats'],
    queryFn: async () => {
      const res = await fetch('/api/user/stats', { credentials: 'include' });
      if (!res.ok) {
        return { totalScans: 0, totalFlips: 0, totalSkips: 0, flipRate: 0, totalPotentialProfit: 0, streak: 0 };
      }
      return res.json();
    },
  });
}

export function EfficiencyScore() {
  const { data: stats } = useUserStats();
  
  if (!stats || stats.totalScans < 3) {
    return null;
  }
  
  const flipRate = stats.flipRate;
  const getEfficiencyLabel = (rate: number) => {
    if (rate >= 50) return { label: "Expert", color: "text-green-400", bg: "bg-green-400" };
    if (rate >= 35) return { label: "Sharp", color: "text-emerald-400", bg: "bg-emerald-400" };
    if (rate >= 20) return { label: "Learning", color: "text-yellow-400", bg: "bg-yellow-400" };
    return { label: "Warming Up", color: "text-orange-400", bg: "bg-orange-400" };
  };
  
  const efficiency = getEfficiencyLabel(flipRate);
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border"
      data-testid="efficiency-score-card"
    >
      <Target className={`w-3.5 h-3.5 ${efficiency.color}`} />
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground" data-testid="text-hit-rate-label">Hit Rate:</span>
        <span className={`text-xs font-bold ${efficiency.color}`} data-testid="text-hit-rate-value">{flipRate}%</span>
      </div>
      <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(flipRate, 100)}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className={`h-full ${efficiency.bg} rounded-full`}
        />
      </div>
    </motion.div>
  );
}

interface ScanTokensProps {
  className?: string;
}

export function ScanTokens({ className = "" }: ScanTokensProps) {
  const { data: scanStatus } = useScanStatus();
  
  if (!scanStatus || scanStatus.tier !== 'free') {
    return null;
  }
  
  const { scansRemaining, scansLimit } = scanStatus;
  const tokens = Array.from({ length: scansLimit }, (_, i) => i < scansRemaining);
  
  return (
    <div className={`flex items-center gap-1 ${className}`} data-testid="scan-tokens-container">
      <Coins className="w-4 h-4 text-primary mr-1" />
      <div className="flex gap-1">
        {tokens.map((active, i) => (
          <motion.div
            key={i}
            initial={{ scale: 0 }}
            animate={{ 
              scale: 1,
              opacity: active ? 1 : 0.25
            }}
            transition={{ delay: i * 0.05, duration: 0.2 }}
            className={`w-5 h-5 rounded-full flex items-center justify-center ${
              active 
                ? 'bg-primary/20 border border-primary scan-token-glow' 
                : 'bg-muted/50 border border-muted'
            }`}
            data-testid={`scan-token-${i}`}
          >
            <div className={`w-2.5 h-2.5 rounded-full ${
              active ? 'bg-primary' : 'bg-muted-foreground/30'
            }`} />
          </motion.div>
        ))}
      </div>
      <span className="text-xs text-muted-foreground ml-2" data-testid="text-scans-remaining">
        {scansRemaining} left today
      </span>
    </div>
  );
}

const SKIP_SUGGESTIONS = [
  "Items without visible prices often waste scans. Look for price tags first.",
  "Condition matters! Damaged items rarely flip for profit.",
  "Generic brands typically have lower resale value. Focus on recognizable names.",
  "If you can't identify it quickly, buyers might not either.",
  "Common items in good supply rarely flip. Look for rare or discontinued.",
  "Check the sold comps yourself if you're unsure - Open Market is free!",
  "Pro tip: Take a photo first, scan later when you have time to research.",
  "Items over $50 asking price need strong margins to be worth the risk.",
];

const RISKY_SUGGESTIONS = [
  "Risky items can work with the right price negotiation. Try lowballing.",
  "Consider if you have expertise in this category before buying.",
  "Risky usually means thin margins. Only worth it for fast-sellers.",
  "If the seller won't budge on price, it's often better to pass.",
];

interface SkipSuggestionProps {
  verdict: 'skip' | 'risky' | 'flip' | 'hold';
  category?: string;
}

export function SkipSuggestion({ verdict, category }: SkipSuggestionProps) {
  if (verdict === 'flip' || verdict === 'hold') {
    return null;
  }
  
  const suggestions = verdict === 'risky' ? RISKY_SUGGESTIONS : SKIP_SUGGESTIONS;
  const randomSuggestion = suggestions[Math.floor(Math.random() * suggestions.length)];
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="mt-3 p-3 rounded-lg bg-muted/50 border border-border"
      data-testid="skip-suggestion-container"
    >
      <div className="flex items-start gap-2">
        <TrendingUp className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Efficiency Tip</p>
          <p className="text-xs text-foreground/80" data-testid="text-skip-suggestion">{randomSuggestion}</p>
        </div>
      </div>
    </motion.div>
  );
}

export function ScansBadge() {
  const { data: scanStatus } = useScanStatus();
  const { data: stats } = useUserStats();
  
  if (!scanStatus) return null;
  
  const flipRate = stats?.flipRate || 0;
  const isPro = scanStatus.tier === 'pro';
  
  return (
    <div className="flex items-center gap-3">
      {!isPro && (
        <div className="flex items-center gap-1">
          {Array.from({ length: scanStatus.scansLimit }).map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all ${
                i < scanStatus.scansRemaining 
                  ? 'bg-primary scan-token-glow' 
                  : 'bg-muted-foreground/30'
              }`}
            />
          ))}
        </div>
      )}
      {stats && stats.totalScans >= 3 && (
        <div className="flex items-center gap-1 text-xs">
          <Zap className={`w-3 h-3 ${flipRate >= 30 ? 'text-green-400' : 'text-muted-foreground'}`} />
          <span className={flipRate >= 30 ? 'text-green-400' : 'text-muted-foreground'}>
            {flipRate}%
          </span>
        </div>
      )}
    </div>
  );
}
