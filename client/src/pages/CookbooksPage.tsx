import { useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  BookOpen, 
  ChevronRight, 
  Trophy, 
  Watch, 
  Smartphone, 
  ShoppingBag,
  Gamepad2,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Search,
  DollarSign,
  Package,
  ArrowLeft
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { MarginLogoFull } from "@/components/MarginLogo";

interface Cookbook {
  id: string;
  title: string;
  category: string;
  icon: typeof Trophy;
  color: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  tips: string[];
  whatToLookFor: string[];
  redFlags: string[];
  avgMargin: string;
  turnTime: string;
}

const cookbooks: Cookbook[] = [
  {
    id: "sports-cards",
    title: "Sports Cards",
    category: "Trading Cards",
    icon: Trophy,
    color: "text-amber-500",
    description: "Flip graded cards, rookie cards, and hobby boxes for solid returns.",
    difficulty: "intermediate",
    avgMargin: "25-40%",
    turnTime: "1-4 weeks",
    tips: [
      "Focus on PSA 9-10 graded cards for consistent demand",
      "Rookie cards of active stars hold value better than retired players",
      "Check recent sales during the player's season - prices spike after big games",
      "Panini Prizm, Topps Chrome, and Select are the most liquid products",
      "Numbered cards (/99, /50, /25) command premium prices"
    ],
    whatToLookFor: [
      "PSA/BGS/SGC graded slabs with high grades (9+)",
      "Rookie cards (look for 'RC' designation)",
      "Numbered parallels - lower number = higher value",
      "Auto cards with on-card signatures (not sticker autos)",
      "Sealed hobby boxes from popular releases"
    ],
    redFlags: [
      "Fake grading slabs - check PSA/BGS cert numbers",
      "Reprints or unauthorized cards",
      "Damaged cases or tampered slabs",
      "Junk wax era cards (1987-1993) - oversupply killed value",
      "Base cards without special parallels or autos"
    ]
  },
  {
    id: "watches",
    title: "Watches",
    category: "Accessories",
    icon: Watch,
    color: "text-blue-500",
    description: "Invicta, Seiko, and fashion watches can yield quick flips.",
    difficulty: "beginner",
    avgMargin: "30-50%",
    turnTime: "1-2 weeks",
    tips: [
      "Invicta Pro Diver is the gateway watch - high volume, consistent margins",
      "Seiko automatics (especially SKX and Presage lines) have cult followings",
      "Check the movement type - automatic > quartz for collectors",
      "Box and papers add 10-20% to resale value",
      "Limited editions and discontinued models command premiums"
    ],
    whatToLookFor: [
      "Complete sets with box, papers, and warranty cards",
      "Working condition - test all functions",
      "Automatic movements (self-winding)",
      "Sapphire crystal (more scratch resistant than mineral)",
      "Water resistance ratings for dive watches"
    ],
    redFlags: [
      "Fake luxury watches - if the deal seems too good, it's fake",
      "Watches with scratched crystals or non-working features",
      "Missing crowns, pushers, or broken bracelets",
      "Watches with significant water damage",
      "Overly polished cases (removes original finish)"
    ]
  },
  {
    id: "electronics",
    title: "Electronics",
    category: "Tech",
    icon: Smartphone,
    color: "text-green-500",
    description: "iPhones, gaming consoles, and accessories move fast.",
    difficulty: "intermediate",
    avgMargin: "15-30%",
    turnTime: "3-7 days",
    tips: [
      "iPhones 2-3 generations back are the sweet spot for flipping",
      "Check battery health on phones - 80%+ is sellable",
      "Gaming consoles sell fastest during holiday season",
      "Sealed/new in box items command 20-40% premium",
      "AirPods and accessories have thin margins but high volume"
    ],
    whatToLookFor: [
      "Carrier unlocked phones (most valuable)",
      "Original chargers and accessories included",
      "Low cycle count on laptop batteries",
      "No iCloud/Google lock on devices",
      "Clean IMEI/ESN (not blacklisted)"
    ],
    redFlags: [
      "iCloud locked devices - worthless without password",
      "Cracked screens or water damage indicators",
      "Blacklisted IMEI numbers",
      "Aftermarket parts or repairs",
      "Devices that won't hold a charge"
    ]
  },
  {
    id: "sneakers",
    title: "Sneakers",
    category: "Fashion",
    icon: ShoppingBag,
    color: "text-purple-500",
    description: "Jordan, Yeezy, and Dunks remain highly flippable.",
    difficulty: "advanced",
    avgMargin: "20-60%",
    turnTime: "1-8 weeks",
    tips: [
      "Size 9-11 mens are the most liquid sizes",
      "Jordan 1s, 4s, and 11s are the most popular silhouettes",
      "Check StockX and GOAT for real-time pricing",
      "Deadstock (DS) with original box is the gold standard",
      "Buy on release day panic sells, sell 2-4 weeks later"
    ],
    whatToLookFor: [
      "Deadstock condition with original box and laces",
      "Matching size tags (box and shoe should match)",
      "Original receipts add authenticity",
      "Popular colorways and collaborations",
      "Limited release dates and low stock numbers"
    ],
    redFlags: [
      "Replica sneakers - check stitching, materials, and box labels",
      "Missing insoles or replacement laces",
      "Box damage or missing box",
      "Yellowing soles on older releases",
      "Heavy creasing or heel drag"
    ]
  },
  {
    id: "video-games",
    title: "Video Games",
    category: "Gaming",
    icon: Gamepad2,
    color: "text-red-500",
    description: "Retro games and sealed titles offer surprising profits.",
    difficulty: "beginner",
    avgMargin: "30-100%+",
    turnTime: "1-4 weeks",
    tips: [
      "Sealed games are worth 3-10x loose copies",
      "CIB (Complete in Box) adds 50-100% over loose cartridges",
      "Pokemon, Zelda, and Mario titles hold value best",
      "Retro (N64, GameCube, PS2) prices have stabilized after pandemic spike",
      "Japanese imports can be cheaper sources for the same games"
    ],
    whatToLookFor: [
      "Complete in box with manual and inserts",
      "Sealed games with intact factory seal",
      "Popular first-party Nintendo titles",
      "RPGs and JRPGs (typically scarcer)",
      "Limited print run titles"
    ],
    redFlags: [
      "Reproduction cartridges (especially GBA/DS)",
      "Resealed games claiming to be factory sealed",
      "Label damage or sun fading",
      "Non-working games (always test if possible)",
      "Common sports titles (usually worthless)"
    ]
  },
  {
    id: "tcg-cards",
    title: "Pokemon & TCG",
    category: "Trading Cards",
    icon: Sparkles,
    color: "text-pink-500",
    description: "Pokemon, Magic, and One Piece cards are hot right now.",
    difficulty: "intermediate",
    avgMargin: "25-50%",
    turnTime: "1-3 weeks",
    tips: [
      "Pokemon Charizard cards are always in demand regardless of set",
      "Japanese cards are often cheaper and sell well to collectors",
      "Graded cards (PSA/CGC) have more consistent pricing",
      "Sealed products from recent sets have thin margins",
      "Vintage Pokemon (Base Set, 1st Edition) requires expertise"
    ],
    whatToLookFor: [
      "Holographic and full-art cards",
      "Cards with PSA 9-10 grades",
      "Chase cards from current meta decks",
      "Alt-art and special illustration rares",
      "Sealed booster boxes from popular sets"
    ],
    redFlags: [
      "Weighed packs (heavy packs have holos removed)",
      "Fake/proxy cards (check texture and rosette pattern)",
      "Damaged cards listed as NM/Mint",
      "Suspiciously cheap sealed products",
      "Cards with creases, whitening, or surface scratches"
    ]
  }
];

const difficultyColors = {
  beginner: "bg-green-500/10 text-green-500 border-green-500/30",
  intermediate: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  advanced: "bg-red-500/10 text-red-500 border-red-500/30"
};

export default function CookbooksPage() {
  const [selectedCookbook, setSelectedCookbook] = useState<Cookbook | null>(null);

  return (
    <div className="min-h-screen bg-background pb-24">
      <AnimatePresence mode="wait">
        {selectedCookbook ? (
          <CookbookDetail 
            key="detail"
            cookbook={selectedCookbook} 
            onBack={() => setSelectedCookbook(null)} 
          />
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-4 pt-8"
          >
            <div className="flex justify-center mb-6">
              <MarginLogoFull height={64} />
            </div>
            
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-display font-bold">Guides</h1>
                <p className="text-sm text-muted-foreground">Flip guides by category</p>
              </div>
            </div>

            <div className="space-y-3">
              {cookbooks.map((cookbook) => {
                const Icon = cookbook.icon;
                return (
                  <button
                    key={cookbook.id}
                    className="w-full text-left"
                    onClick={() => setSelectedCookbook(cookbook)}
                    data-testid={`button-cookbook-${cookbook.id}`}
                  >
                    <Card className="p-4 hover-elevate">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl bg-secondary/50 flex items-center justify-center ${cookbook.color}`}>
                          <Icon className="w-6 h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold" data-testid={`text-cookbook-title-${cookbook.id}`}>{cookbook.title}</h3>
                            <Badge variant="outline" className={`text-[10px] ${difficultyColors[cookbook.difficulty]}`}>
                              {cookbook.difficulty}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-1">{cookbook.description}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1" data-testid={`text-avg-margin-${cookbook.id}`}>
                              <TrendingUp className="w-3 h-3" />
                              {cookbook.avgMargin}
                            </span>
                            <span className="flex items-center gap-1" data-testid={`text-turn-time-${cookbook.id}`}>
                              <Package className="w-3 h-3" />
                              {cookbook.turnTime}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      </div>
                    </Card>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <BottomNav />
    </div>
  );
}

function CookbookDetail({ cookbook, onBack }: { cookbook: Cookbook; onBack: () => void }) {
  const Icon = cookbook.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-4 pt-8"
    >
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={onBack}
        className="mb-4 -ml-2"
        data-testid="button-back"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back
      </Button>

      <div className="flex items-center gap-4 mb-6">
        <div className={`w-14 h-14 rounded-xl bg-secondary/50 flex items-center justify-center ${cookbook.color}`}>
          <Icon className="w-7 h-7" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold">{cookbook.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className={`text-xs ${difficultyColors[cookbook.difficulty]}`}>
              {cookbook.difficulty}
            </Badge>
            <span className="text-sm text-muted-foreground">{cookbook.category}</span>
          </div>
        </div>
      </div>

      <Card className="p-4 mb-4 bg-primary/5 border-primary/20">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Avg Margin</div>
            <div className="font-semibold flex items-center gap-1" data-testid={`text-detail-avg-margin-${cookbook.id}`}>
              <DollarSign className="w-4 h-4 text-primary" />
              {cookbook.avgMargin}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Turn Time</div>
            <div className="font-semibold flex items-center gap-1" data-testid={`text-detail-turn-time-${cookbook.id}`}>
              <Package className="w-4 h-4 text-primary" />
              {cookbook.turnTime}
            </div>
          </div>
        </div>
      </Card>

      <p className="text-muted-foreground mb-6">{cookbook.description}</p>

      <div className="space-y-6">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Pro Tips</h3>
          </div>
          <ul className="space-y-2">
            {cookbook.tips.map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-primary mt-1">•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Search className="w-5 h-5 text-green-500" />
            <h3 className="font-semibold">What to Look For</h3>
          </div>
          <ul className="space-y-2">
            {cookbook.whatToLookFor.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h3 className="font-semibold">Red Flags</h3>
          </div>
          <ul className="space-y-2">
            {cookbook.redFlags.map((flag, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <span>{flag}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </motion.div>
  );
}
