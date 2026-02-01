import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  Camera, 
  TrendingUp, 
  Sparkles, 
  ChevronRight, 
  ChevronLeft,
  Watch,
  Package,
  Shirt,
  Gamepad2,
  Layers,
  Cpu,
  Zap,
  DollarSign,
  ShoppingBag,
  Target,
  BarChart3,
  Rocket,
  Archive,
  Receipt,
  FileText,
  Trophy,
  Search,
  ArrowRight
} from "lucide-react";
import { MarginLogoFull } from "./MarginLogo";

const WELCOME_SHOWN_KEY = "margin_welcome_shown";

interface OnboardingStep {
  title: string;
  content: React.ReactNode;
  icon: React.ReactNode;
}

export function WelcomeDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const hasSeenWelcome = localStorage.getItem(WELCOME_SHOWN_KEY);
    if (!hasSeenWelcome) {
      setOpen(true);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem(WELCOME_SHOWN_KEY, "true");
    setOpen(false);
  };

  const steps: OnboardingStep[] = [
    {
      title: "Welcome to Margin",
      icon: <Sparkles className="w-8 h-8 text-primary" />,
      content: (
        <div className="space-y-4">
          <div className="flex justify-center py-4">
            <MarginLogoFull height={64} />
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed text-center">
            Your AI-powered reselling assistant. Snap a photo of any item and get instant 
            <span className="font-semibold text-foreground"> Flip or Skip </span> 
            recommendations based on real sold data.
          </p>
          <div className="flex justify-center gap-6 pt-2">
            <div className="text-center" data-testid="stat-scan-speed">
              <div className="text-2xl font-bold text-primary">Fast</div>
              <div className="text-xs text-muted-foreground">AI Scanning</div>
            </div>
            <div className="text-center" data-testid="stat-min-margin">
              <div className="text-2xl font-bold text-green-400">25%+</div>
              <div className="text-xs text-muted-foreground">Min Margin</div>
            </div>
            <div className="text-center" data-testid="stat-real-data">
              <div className="text-2xl font-bold text-amber-400">eBay</div>
              <div className="text-xs text-muted-foreground">Sold Data</div>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Powered by Real Sold Data",
      icon: <DollarSign className="w-8 h-8 text-primary" />,
      content: (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Recommendations are based on actual eBay sold listings when available.
          </p>
          <div className="grid gap-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30" data-testid="feature-comparable-sales">
              <Target className="w-6 h-6 text-green-400 shrink-0" />
              <div>
                <p className="text-sm font-medium">Comparable Sales</p>
                <p className="text-xs text-muted-foreground">We search for recent sold items to price accurately</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30" data-testid="feature-median-pricing">
              <BarChart3 className="w-6 h-6 text-blue-400 shrink-0" />
              <div>
                <p className="text-sm font-medium">Median Pricing</p>
                <p className="text-xs text-muted-foreground">Uses median values for more reliable estimates</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30" data-testid="feature-fees-included">
              <Zap className="w-6 h-6 text-amber-400 shrink-0" />
              <div>
                <p className="text-sm font-medium">All Fees Included</p>
                <p className="text-xs text-muted-foreground">eBay fees, shipping, and fixed costs calculated</p>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "How It Works",
      icon: <Camera className="w-8 h-8 text-primary" />,
      content: (
        <div className="space-y-4">
          <div className="grid gap-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">
                1
              </div>
              <div>
                <p className="text-sm font-medium">Tap Scan</p>
                <p className="text-xs text-muted-foreground">Opens your camera for instant item scanning</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">
                2
              </div>
              <div>
                <p className="text-sm font-medium">Point and capture</p>
                <p className="text-xs text-muted-foreground">Frame the item and tap the capture button</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">
                3
              </div>
              <div>
                <p className="text-sm font-medium">See your verdict</p>
                <p className="text-xs text-muted-foreground">Instant overlay shows max buy, expected sale, and profit</p>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Power Tools",
      icon: <ShoppingBag className="w-8 h-8 text-primary" />,
      content: (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground text-center mb-2">
            Optional tools for specific situations
          </p>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50" data-testid="mode-deep-scan">
            <Target className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Deep Scan</p>
              <p className="text-xs text-muted-foreground">Detailed analysis with category selection and manual options</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50" data-testid="mode-yard-sale">
            <ShoppingBag className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Yard Sale Mode</p>
              <p className="text-xs text-muted-foreground">Queue up multiple items quickly at sales</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50" data-testid="mode-open-market">
            <Search className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Open Market</p>
              <p className="text-xs text-muted-foreground">Search for antiques and unique items by keyword</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Complete Inventory Workflow",
      icon: <Archive className="w-8 h-8 text-primary" />,
      content: (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground text-center mb-2">
            Track every item from purchase to sale automatically
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/30" data-testid="workflow-flip">
              <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                <span className="text-xs font-bold text-white">1</span>
              </div>
              <span className="text-sm">FLIP IT adds item to inventory</span>
            </div>
            <div className="flex justify-center">
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/30" data-testid="workflow-list">
              <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                <span className="text-xs font-bold text-white">2</span>
              </div>
              <span className="text-sm">List Item when posted</span>
            </div>
            <div className="flex justify-center">
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30" data-testid="workflow-sold">
              <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center">
                <span className="text-xs font-bold text-white">3</span>
              </div>
              <span className="text-sm">Mark Sold with actual sale price</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Expenses & Tax Reports",
      icon: <Receipt className="w-8 h-8 text-primary" />,
      content: (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground text-center">
            Track business expenses and generate Schedule C reports
          </p>
          <div className="grid gap-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-purple-500/10 border border-purple-500/30" data-testid="feature-expenses">
              <Receipt className="w-6 h-6 text-purple-400 shrink-0" />
              <div>
                <p className="text-sm font-medium">Monthly Expenses</p>
                <p className="text-xs text-muted-foreground">Track mileage, supplies, fees, and more</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30" data-testid="feature-schedule-c">
              <FileText className="w-6 h-6 text-cyan-400 shrink-0" />
              <div>
                <p className="text-sm font-medium">Schedule C Export</p>
                <p className="text-xs text-muted-foreground">IRS-ready P&L with expense categories</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30" data-testid="feature-mileage">
              <DollarSign className="w-6 h-6 text-rose-400 shrink-0" />
              <div>
                <p className="text-sm font-medium">Mileage @ $0.70/mi</p>
                <p className="text-xs text-muted-foreground">2025 IRS rate automatically applied</p>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Profit Dashboard & Goals",
      icon: <Trophy className="w-8 h-8 text-primary" />,
      content: (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground text-center">
            Set daily profit goals and track your achievements
          </p>
          <div className="grid gap-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30" data-testid="feature-profit-goals">
              <Target className="w-6 h-6 text-amber-400 shrink-0" />
              <div>
                <p className="text-sm font-medium">Daily Profit Goals</p>
                <p className="text-xs text-muted-foreground">Set targets and watch your progress</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30" data-testid="feature-achievements">
              <Trophy className="w-6 h-6 text-green-400 shrink-0" />
              <div>
                <p className="text-sm font-medium">17 Achievements</p>
                <p className="text-xs text-muted-foreground">Unlock badges as you grow your business</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30" data-testid="feature-streaks">
              <Zap className="w-6 h-6 text-blue-400 shrink-0" />
              <div>
                <p className="text-sm font-medium">Daily Streaks</p>
                <p className="text-xs text-muted-foreground">Keep your momentum going</p>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "6 Categories We Cover",
      icon: <Layers className="w-8 h-8 text-primary" />,
      content: (
        <div className="grid grid-cols-2 gap-2" data-testid="categories-grid">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50" data-testid="category-shoes">
            <Shirt className="w-5 h-5 text-blue-400" />
            <span className="text-sm font-medium">Shoes</span>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50" data-testid="category-watches">
            <Watch className="w-5 h-5 text-amber-400" />
            <span className="text-sm font-medium">Watches</span>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50" data-testid="category-cards">
            <Gamepad2 className="w-5 h-5 text-purple-400" />
            <span className="text-sm font-medium">Trading Cards</span>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50" data-testid="category-collectibles">
            <Package className="w-5 h-5 text-green-400" />
            <span className="text-sm font-medium">Collectibles</span>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50" data-testid="category-electronics">
            <Cpu className="w-5 h-5 text-cyan-400" />
            <span className="text-sm font-medium">Electronics</span>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50" data-testid="category-other">
            <TrendingUp className="w-5 h-5 text-rose-400" />
            <span className="text-sm font-medium">Other</span>
          </div>
        </div>
      ),
    },
    {
      title: "Flip Mode vs Buy Mode",
      icon: <TrendingUp className="w-8 h-8 text-primary" />,
      content: (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground text-center">
            After scanning, toggle between modes to see different perspectives on the same data.
          </p>
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30" data-testid="verdict-flip">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg font-bold text-green-400">Flip Mode</span>
              <span className="text-xs bg-green-500/20 px-2 py-0.5 rounded-full text-green-400">Reseller</span>
            </div>
            <p className="text-xs text-muted-foreground">
              "FLIP IT!" means profit gates pass: net profit &gt; $0 AND margin &gt; 25%.
              Shows max buy price for reselling.
            </p>
          </div>
          <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30" data-testid="verdict-buy">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg font-bold text-blue-400">Buy Mode</span>
              <span className="text-xs bg-blue-500/20 px-2 py-0.5 rounded-full text-blue-400">Buyer</span>
            </div>
            <p className="text-xs text-muted-foreground">
              "MARKET CHECK" shows fair market value. Use when buying for yourself to know if a deal is worth it.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: "Ready to Find Profit?",
      icon: <Rocket className="w-8 h-8 text-primary" />,
      content: (
        <div className="space-y-4 text-center">
          <div className="py-4" data-testid="cta-scan-intro">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
              <Camera className="w-8 h-8 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Tap <span className="font-semibold text-foreground">Scan</span> in the navigation to open your camera and point at any item for an instant verdict.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/30" data-testid="pro-tip">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Pro tip:</span> After scanning, toggle Flip/Buy to see both perspectives on the same item!
            </p>
          </div>
        </div>
      ),
    },
  ];

  const currentStep = steps[step];
  const isLastStep = step === steps.length - 1;
  const isFirstStep = step === 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-2">
            {currentStep.icon}
            <DialogTitle>{currentStep.title}</DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            Onboarding step {step + 1} of {steps.length}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 min-h-[320px] max-h-[320px] overflow-y-auto py-4">
          {currentStep.content}
        </div>

        <div className="shrink-0">
          <div className="flex items-center justify-center gap-1 mb-2" data-testid="onboarding-step-indicators">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index === step ? "bg-primary" : "bg-muted-foreground/30"
                }`}
                data-testid={`indicator-step-${index}`}
              />
            ))}
          </div>

          <DialogFooter className="flex-row gap-2">
            {!isFirstStep && (
              <Button 
                variant="outline" 
                onClick={() => setStep(step - 1)}
                className="flex-1"
                data-testid="button-onboarding-back"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            )}
            <Button 
              onClick={() => isLastStep ? handleClose() : setStep(step + 1)} 
              className="flex-1"
              data-testid="button-onboarding-next"
            >
              {isLastStep ? (
                "Start Scanning"
              ) : (
                <>
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
