import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Check, X, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import marginMIcon from "../assets/image_1768676379919.png";

type JudgmentResult = {
  decision: 'flip' | 'skip' | 'risky';
  reason?: string;
  maxBuy?: number;
  expectedSalePrice?: number;
  confidence?: 'strong' | 'moderate' | 'weak';
  scanDuration?: number;
};

type JudgmentOverlayProps = {
  isOpen: boolean;
  result: JudgmentResult | null;
  onComplete: () => void;
  onNewScan?: () => void;
  autoAdvance?: boolean;
  targetMargin?: number;
  onMarginChange?: (margin: number) => void;
};

export function JudgmentOverlay({ 
  isOpen, 
  result, 
  onComplete,
  onNewScan,
  autoAdvance = false,
  targetMargin = 25,
  onMarginChange
}: JudgmentOverlayProps) {
  const [phase, setPhase] = useState<'lockOn' | 'judgment' | 'verdict' | 'reveal'>('lockOn');
  const [showResult, setShowResult] = useState(false);
  const [localMargin, setLocalMargin] = useState(targetMargin);

  const isFlip = result?.decision === 'flip';
  
  // Calculate maxBuy based on current margin slider
  const PLATFORM_FEE = 0.13;
  const FIXED_COSTS = 5;
  const calculateMaxBuy = (salePrice: number, marginRate: number) => {
    return (salePrice * (1 - PLATFORM_FEE) - FIXED_COSTS) / (1 + marginRate / 100);
  };
  
  const expectedSalePrice = result?.expectedSalePrice || 0;
  const dynamicMaxBuy = expectedSalePrice > 0 
    ? calculateMaxBuy(expectedSalePrice, localMargin) 
    : result?.maxBuy || 0;
  
  useEffect(() => {
    if (!isOpen || !result) {
      setPhase('lockOn');
      setShowResult(false);
      return;
    }

    const timers: NodeJS.Timeout[] = [];

    // Timing per spec: total 900-1200ms
    // Step A - Lock On: 0-150ms
    // Step B - Judgment Frame: 150-500ms (brackets draw)
    // Step C - Verdict Strike: 500-850ms (impact pulse + glow)
    // Step D - Reveal Result: 850-1100ms (logo fades, result appears)
    timers.push(setTimeout(() => setPhase('judgment'), 150));
    timers.push(setTimeout(() => setPhase('verdict'), 500));
    timers.push(setTimeout(() => {
      setPhase('reveal');
      setShowResult(true);
    }, 900));

    if (autoAdvance) {
      // Batch mode: auto-advance 500ms after reveal per spec
      timers.push(setTimeout(() => onComplete(), 1400));
    }

    return () => timers.forEach(t => clearTimeout(t));
  }, [isOpen, result, autoAdvance, onComplete]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        data-testid="judgment-overlay"
      >
        {/* Dimmed background */}
        <motion.div 
          className="absolute inset-0 bg-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === 'lockOn' ? 0.7 : 0.85 }}
          transition={{ duration: 0.15 }}
        />

        {/* Logo animation container */}
        <div className="relative z-10 flex flex-col items-center">
          {!showResult ? (
            <motion.div
              className="relative"
              initial={{ scale: 0.9, opacity: 0.85 }}
              animate={{
                scale: phase === 'verdict' ? [1, 1.02, 1] : phase === 'reveal' ? 0.95 : 0.9,
                opacity: phase === 'reveal' ? 0 : phase === 'verdict' ? 1 : 0.85,
              }}
              transition={{ 
                duration: phase === 'verdict' ? 0.3 : 0.2,
                ease: phase === 'verdict' ? [0.22, 1, 0.36, 1] : 'easeOut'
              }}
            >
              {/* Animated Logo SVG */}
              <svg 
                width="200" 
                height="160" 
                viewBox="0 0 200 160" 
                className="drop-shadow-2xl"
              >
                {/* Left Red Bracket - draws top to bottom */}
                <motion.path
                  d="M 30 20 L 30 140"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="12"
                  strokeLinecap="square"
                  initial={{ pathLength: 0 }}
                  animate={{ 
                    pathLength: phase !== 'lockOn' ? 1 : 0,
                    filter: phase === 'verdict' && !isFlip ? 'drop-shadow(0 0 20px #ef4444)' : 'none'
                  }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                />
                {/* Left bracket top arm */}
                <motion.path
                  d="M 30 20 L 55 20"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="12"
                  strokeLinecap="square"
                  initial={{ pathLength: 0 }}
                  animate={{ 
                    pathLength: phase !== 'lockOn' ? 1 : 0,
                    filter: phase === 'verdict' && !isFlip ? 'drop-shadow(0 0 20px #ef4444)' : 'none'
                  }}
                  transition={{ duration: 0.12, delay: 0.08, ease: 'easeOut' }}
                />
                {/* Left bracket bottom arm */}
                <motion.path
                  d="M 30 140 L 55 140"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="12"
                  strokeLinecap="square"
                  initial={{ pathLength: 0 }}
                  animate={{ 
                    pathLength: phase !== 'lockOn' ? 1 : 0,
                    filter: phase === 'verdict' && !isFlip ? 'drop-shadow(0 0 20px #ef4444)' : 'none'
                  }}
                  transition={{ duration: 0.12, delay: 0.2, ease: 'easeOut' }}
                />

                {/* Right Green Bracket - draws bottom to top */}
                <motion.path
                  d="M 170 140 L 170 20"
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="12"
                  strokeLinecap="square"
                  initial={{ pathLength: 0 }}
                  animate={{ 
                    pathLength: phase !== 'lockOn' ? 1 : 0,
                    filter: phase === 'verdict' && isFlip ? 'drop-shadow(0 0 20px #22c55e)' : 'none'
                  }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                />
                {/* Right bracket bottom arm */}
                <motion.path
                  d="M 170 140 L 145 140"
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="12"
                  strokeLinecap="square"
                  initial={{ pathLength: 0 }}
                  animate={{ 
                    pathLength: phase !== 'lockOn' ? 1 : 0,
                    filter: phase === 'verdict' && isFlip ? 'drop-shadow(0 0 20px #22c55e)' : 'none'
                  }}
                  transition={{ duration: 0.12, delay: 0.08, ease: 'easeOut' }}
                />
                {/* Right bracket top arm */}
                <motion.path
                  d="M 170 20 L 145 20"
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="12"
                  strokeLinecap="square"
                  initial={{ pathLength: 0 }}
                  animate={{ 
                    pathLength: phase !== 'lockOn' ? 1 : 0,
                    filter: phase === 'verdict' && isFlip ? 'drop-shadow(0 0 20px #22c55e)' : 'none'
                  }}
                  transition={{ duration: 0.12, delay: 0.2, ease: 'easeOut' }}
                />

                {/* Center M - Graphite gradient text */}
                <defs>
                  <linearGradient id="graphiteGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#9ca3af" />
                    <stop offset="50%" stopColor="#6b7280" />
                    <stop offset="100%" stopColor="#4b5563" />
                  </linearGradient>
                </defs>
                <motion.text
                  x="100"
                  y="110"
                  textAnchor="middle"
                  className="font-black"
                  style={{ 
                    fontSize: '90px',
                    fill: 'url(#graphiteGradient)',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    fontWeight: 900,
                  }}
                  initial={{ opacity: 0.6 }}
                  animate={{ opacity: phase === 'verdict' ? 1 : 0.6 }}
                >
                  M
                </motion.text>
              </svg>

              {/* Glow effect on verdict */}
              {phase === 'verdict' && (
                <motion.div
                  className={`absolute inset-0 rounded-full blur-3xl ${
                    isFlip ? 'bg-green-500/30' : 'bg-red-500/30'
                  }`}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: [0, 0.6, 0], scale: [0.8, 1.2, 1] }}
                  transition={{ duration: 0.3 }}
                />
              )}
            </motion.div>
          ) : (
            /* Result Card */
            <motion.div
              className="flex flex-col items-center text-center px-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Decision Badge */}
              <motion.div
                className={`flex items-center gap-3 px-8 py-4 rounded-lg mb-6 ${
                  isFlip 
                    ? 'bg-green-500/20 border-2 border-green-500' 
                    : 'bg-red-500/20 border-2 border-red-500'
                }`}
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.2, delay: 0.1 }}
              >
                {isFlip ? (
                  <Check className="w-10 h-10 text-green-500" strokeWidth={3} />
                ) : (
                  <X className="w-10 h-10 text-red-500" strokeWidth={3} />
                )}
                <span className={`text-4xl font-black tracking-tight ${
                  isFlip ? 'text-green-500' : 'text-red-500'
                }`}>
                  {isFlip ? 'FLIP IT!' : 'SKIP IT!'}
                </span>
              </motion.div>

              {/* Reason */}
              {result?.reason && (
                <motion.p 
                  className="text-lg text-white/80 mb-4 max-w-xs"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  {result.reason}
                </motion.p>
              )}

              {/* Max Buy with Slider */}
              {dynamicMaxBuy > 0 && (
                <motion.div 
                  className="flex flex-col items-center gap-3 mb-4 w-full max-w-xs"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.25 }}
                >
                  <div className="flex items-center gap-2 text-2xl font-bold text-white">
                    <TrendingUp className="w-6 h-6 text-green-400" />
                    Max Buy: ${dynamicMaxBuy.toFixed(0)}
                  </div>
                  
                  {/* Target Margin Slider */}
                  <div className="w-full px-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-white/60">Target Margin</span>
                      <span className="text-sm font-semibold text-primary">{localMargin}%</span>
                    </div>
                    <Slider
                      value={[localMargin]}
                      onValueChange={(value) => {
                        setLocalMargin(value[0]);
                        onMarginChange?.(value[0]);
                      }}
                      min={0}
                      max={100}
                      step={5}
                      className="w-full"
                      data-testid="slider-target-margin"
                    />
                    <div className="flex justify-between text-[10px] text-white/40 mt-1">
                      <span>0%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Confidence + Scan Time */}
              <motion.div
                className="flex items-center gap-3 text-sm text-white/60 mb-8"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                {result?.confidence && (
                  <span>
                    {result.confidence === 'strong' ? 'Strong confidence' : 
                     result.confidence === 'moderate' ? 'Moderate confidence' : 
                     'Weak confidence'}
                  </span>
                )}
                {result?.scanDuration !== undefined && (
                  <>
                    {result?.confidence && <span className="text-white/30">|</span>}
                    <span data-testid="text-scan-duration">
                      {(result.scanDuration / 1000).toFixed(1)}s scan
                    </span>
                  </>
                )}
              </motion.div>

              {/* Actions */}
              <motion.div
                className="flex gap-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
              >
                <Button 
                  onClick={onComplete}
                  variant="default"
                  size="lg"
                  className="px-8"
                  data-testid="button-view-details"
                >
                  View Details
                </Button>
                {onNewScan && (
                  <Button 
                    onClick={onNewScan}
                    variant="outline"
                    size="lg"
                    className="px-8 bg-white/10 border-white/30 text-white hover:bg-white/20"
                    data-testid="button-new-scan"
                  >
                    New Scan
                  </Button>
                )}
              </motion.div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

interface JudgmentAnimationProps {
  verdict: 'flip' | 'skip';
  className?: string;
  onComplete?: () => void;
  expectedSalePrice?: number;
  targetMargin?: number;
  onMarginChange?: (margin: number) => void;
}

export function JudgmentAnimation({ 
  verdict, 
  className, 
  onComplete,
  expectedSalePrice,
  targetMargin = 25,
  onMarginChange
}: JudgmentAnimationProps) {
  const [localMargin, setLocalMargin] = useState(targetMargin);
  
  const PLATFORM_FEE = 0.13;
  const FIXED_COSTS = 5;
  const calculateMaxBuy = (salePrice: number, marginRate: number) => {
    return (salePrice * (1 - PLATFORM_FEE) - FIXED_COSTS) / (1 + marginRate / 100);
  };
  
  const maxBuy = expectedSalePrice ? calculateMaxBuy(expectedSalePrice, localMargin) : null;
  const showSlider = expectedSalePrice && expectedSalePrice > 0;
  
  const verdictConfig = {
    flip: {
      label: 'Flip It',
      icon: Check,
      textColor: 'text-emerald-400',
      iconColor: 'text-emerald-400',
    },
    skip: {
      label: 'Skip It',
      icon: X,
      textColor: 'text-red-400',
      iconColor: 'text-red-400',
    },
  };

  const config = verdictConfig[verdict];
  const Icon = config.icon;

  return (
    <div className={cn("inline-flex items-center justify-center", className)} data-testid="judgment-animation">
      <motion.div
        className="relative flex items-center gap-3 px-5 py-3 rounded-lg bg-muted/60 border border-border backdrop-blur-sm"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ 
          duration: 0.06, 
          delay: 0, 
          ease: "easeOut" 
        }}
      >
        <motion.img
          src={marginMIcon}
          alt="M"
          className="h-16 w-auto"
          style={{
            maskImage: 'radial-gradient(ellipse 70% 70% at center, black 30%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at center, black 30%, transparent 75%)'
          }}
          initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ 
            delay: 0.06,
            duration: 0.08,
            ease: "easeOut"
          }}
        />

        <motion.div
          className="flex items-center gap-2"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ 
            delay: 0.14,
            duration: 0.06,
            ease: "easeOut"
          }}
          onAnimationComplete={onComplete}
        >
          <span className={cn("font-display font-bold text-2xl tracking-wide", config.textColor)} data-testid="text-verdict">
            {config.label}
          </span>
          <Icon className={cn("w-6 h-6", config.iconColor)} strokeWidth={3} />
        </motion.div>
      </motion.div>
    </div>
  );
}

export function JudgmentBadge({ verdict }: { verdict: 'flip' | 'skip' }) {
  const config = {
    flip: {
      label: 'Flip It',
      icon: Check,
      bg: 'bg-emerald-500',
      text: 'text-white',
    },
    skip: {
      label: 'Skip It',
      icon: X,
      bg: 'bg-red-500',
      text: 'text-white',
    },
  };

  const c = config[verdict];
  const Icon = c.icon;

  return (
    <span className={cn(
      "inline-flex items-center gap-2 px-3 py-1 rounded-full font-semibold text-sm",
      c.bg,
      c.text
    )} data-testid="judgment-badge">
      <img 
        src={marginMIcon} 
        alt="" 
        className="h-7 w-auto"
        style={{
          maskImage: 'radial-gradient(ellipse 65% 65% at center, black 25%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse 65% 65% at center, black 25%, transparent 70%)'
        }}
      />
      {c.label}
      <Icon className="w-4 h-4" strokeWidth={3} />
    </span>
  );
}
