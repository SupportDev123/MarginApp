import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Camera, Upload, Loader2, Star, CheckCircle, AlertTriangle, XCircle, Sparkles, Info, Award, Shield, Zap } from "lucide-react";
import { PSALookup } from "@/components/PSALookup";
import { motion, AnimatePresence } from "framer-motion";

interface GradingTier {
  cost: number;
  profit: number;
  roi: number;
  recommended: boolean;
}

interface GradingResult {
  overallGrade: string;
  predictedPSA: number;
  confidence: number;
  centering: { score: number; description: string; frontBack?: string };
  corners: { score: number; description: string };
  edges: { score: number; description: string };
  surface: { score: number; description: string };
  backCondition?: { score: number | null; description: string };
  recommendations: string[];
  worthGrading: boolean;
  gradingRisk?: string;
  detectedIssues?: string[];
  estimatedValue?: { raw: number; graded: number; profit: number; multiplier: number };
  gradingCosts?: {
    tiers: Record<string, GradingTier>;
    bestTier: string | null;
    bestProfit: number;
    worthIt: boolean;
  };
  submissionChecklist?: { step: string; done: boolean }[];
}

export default function CardGradingPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backFileInputRef = useRef<HTMLInputElement>(null);
  
  const [step, setStep] = useState<'upload' | 'analyzing' | 'result'>('upload');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [backImagePreview, setBackImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [cardName, setCardName] = useState("");
  const [cardYear, setCardYear] = useState("");
  const [cardSet, setCardSet] = useState("");
  const [estimatedRawValue, setEstimatedRawValue] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<GradingResult | null>(null);
  const [checklist, setChecklist] = useState<{ step: string; done: boolean }[]>([]);
  
  const isPro = user?.subscriptionTier === 'pro' || user?.isAdmin;

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleBackImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setBackImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleAnalyze = async () => {
    if (!imagePreview) {
      toast({ title: "No image", description: "Please upload a card image first", variant: "destructive" });
      return;
    }

    setIsAnalyzing(true);
    setStep('analyzing');

    try {
      const response = await apiRequest('POST', '/api/card-grading/analyze', {
        image: imagePreview,
        backImage: backImagePreview || undefined,
        cardName: cardName || undefined,
        cardYear: cardYear || undefined,
        cardSet: cardSet || undefined,
        estimatedRawValue: estimatedRawValue ? parseFloat(estimatedRawValue) : undefined,
      });

      const data = await response.json();
      setResult(data);
      if (data.submissionChecklist) {
        setChecklist(data.submissionChecklist);
      }
      setStep('result');
    } catch (error: any) {
      console.error('Grading analysis error:', error);
      toast({ 
        title: "Analysis failed", 
        description: error.message || "Could not analyze the card. Please try again.",
        variant: "destructive" 
      });
      setStep('upload');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetAnalysis = () => {
    setStep('upload');
    setImagePreview(null);
    setBackImagePreview(null);
    setImageFile(null);
    setCardName("");
    setCardYear("");
    setCardSet("");
    setEstimatedRawValue("");
    setResult(null);
    setChecklist([]);
  };

  const toggleChecklistItem = (index: number) => {
    setChecklist(prev => prev.map((item, i) => 
      i === index ? { ...item, done: !item.done } : item
    ));
  };

  const getTierName = (key: string): string => {
    const names: Record<string, string> = {
      value: "Value ($20)",
      regular: "Regular ($50)",
      express: "Express ($100)",
      super: "Super Express ($150)"
    };
    return names[key] || key;
  };

  const getGradeColor = (grade: number) => {
    if (grade >= 9) return 'text-emerald-500';
    if (grade >= 7) return 'text-blue-500';
    if (grade >= 5) return 'text-amber-500';
    return 'text-red-500';
  };

  const getGradeBg = (grade: number) => {
    if (grade >= 9) return 'bg-emerald-500/10';
    if (grade >= 7) return 'bg-blue-500/10';
    if (grade >= 5) return 'bg-amber-500/10';
    return 'bg-red-500/10';
  };

  const getScoreIcon = (score: number) => {
    if (score >= 9) return <CheckCircle className="w-4 h-4 text-emerald-500" />;
    if (score >= 7) return <CheckCircle className="w-4 h-4 text-blue-500" />;
    if (score >= 5) return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    return <XCircle className="w-4 h-4 text-red-500" />;
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="p-4 pt-6">
        <div className="flex items-center gap-3 mb-6">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setLocation('/')}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Card Grading</h1>
            <p className="text-sm text-muted-foreground">AI-powered condition assessment</p>
          </div>
          <Badge variant="outline" className="border-primary/30 text-primary">
            <Sparkles className="w-3 h-3 mr-1" />
            Pro
          </Badge>
        </div>

        <AnimatePresence mode="wait">
          {step === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <Card 
                className="p-6 border-dashed border-2 cursor-pointer hover-elevate"
                onClick={() => fileInputRef.current?.click()}
                data-testid="card-upload-zone"
              >
                {imagePreview ? (
                  <div className="relative">
                    <img 
                      src={imagePreview} 
                      alt="Card preview" 
                      className="w-full max-h-80 object-contain rounded-lg"
                    />
                    <Button 
                      variant="secondary" 
                      size="sm" 
                      className="absolute bottom-2 right-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setImagePreview(null);
                        setImageFile(null);
                      }}
                    >
                      Change Image
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                      <Camera className="w-8 h-8 text-primary" />
                    </div>
                    <p className="font-semibold text-lg mb-1">Upload Card Image</p>
                    <p className="text-sm text-muted-foreground">Take a photo or choose from gallery</p>
                    <p className="text-xs text-muted-foreground mt-2">For best results, use good lighting and a flat surface</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageSelect}
                  className="hidden"
                  data-testid="input-card-image"
                />
              </Card>

              {imagePreview && (
                <Card 
                  className="p-4 border-dashed border-2 cursor-pointer hover-elevate"
                  onClick={() => backFileInputRef.current?.click()}
                  data-testid="card-back-upload-zone"
                >
                  {backImagePreview ? (
                    <div className="relative">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary">Back</Badge>
                        <span className="text-sm text-muted-foreground">Card back image</span>
                      </div>
                      <img 
                        src={backImagePreview} 
                        alt="Card back preview" 
                        className="w-full max-h-40 object-contain rounded-lg"
                      />
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="absolute bottom-2 right-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          setBackImagePreview(null);
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 py-2">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        <Upload className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Add Back Image (Recommended)</p>
                        <p className="text-xs text-muted-foreground">More accurate grading with both sides</p>
                      </div>
                    </div>
                  )}
                  <input
                    ref={backFileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleBackImageSelect}
                    className="hidden"
                    data-testid="input-card-back-image"
                  />
                </Card>
              )}

              <Card className="p-4 bg-muted/30 border-muted">
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-base">
                  <Zap className="w-4 h-4 text-yellow-500" />
                  Upload Tips
                </h3>
                <ul className="space-y-2 text-sm text-foreground/80">
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold min-w-fit">📷</span>
                    <span><strong>Clear photo:</strong> Use bright natural lighting and focus on the entire card</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold min-w-fit">✓</span>
                    <span><strong>Both sides:</strong> Card front and back for more accurate predictions</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold min-w-fit">🎯</span>
                    <span><strong>Flat surface:</strong> Lay the card flat to avoid glare and shadows</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold min-w-fit">💬</span>
                    <span><strong>Optional details:</strong> Add card name, year, and set for context</span>
                  </li>
                </ul>
              </Card>

              <Card className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Info className="w-4 h-4 text-muted-foreground" />
                  Card Details (Optional)
                </h3>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="cardName" className="text-sm">Card Name / Player</Label>
                    <Input
                      id="cardName"
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value)}
                      placeholder="e.g., Patrick Mahomes RC"
                      className="mt-1"
                      data-testid="input-card-name"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="cardYear" className="text-sm">Year</Label>
                      <Input
                        id="cardYear"
                        value={cardYear}
                        onChange={(e) => setCardYear(e.target.value)}
                        placeholder="e.g., 2017"
                        className="mt-1"
                        data-testid="input-card-year"
                      />
                    </div>
                    <div>
                      <Label htmlFor="cardSet" className="text-sm">Set / Brand</Label>
                      <Input
                        id="cardSet"
                        value={cardSet}
                        onChange={(e) => setCardSet(e.target.value)}
                        placeholder="e.g., Prizm"
                        className="mt-1"
                        data-testid="input-card-set"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="rawValue" className="text-sm">Estimated Raw Value ($)</Label>
                    <Input
                      id="rawValue"
                      type="number"
                      value={estimatedRawValue}
                      onChange={(e) => setEstimatedRawValue(e.target.value)}
                      placeholder="e.g., 50"
                      className="mt-1"
                      data-testid="input-raw-value"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Used to calculate ROI for grading</p>
                  </div>
                </div>
              </Card>

              <Card className="p-4 bg-muted/30">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Award className="w-4 h-4 text-primary" />
                  What We Analyze
                </h3>
                <TooltipProvider>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2 cursor-help hover:text-primary transition-colors">
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                          <span>Centering (F/B)</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        How centered the image is on the card (front & back)
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2 cursor-help hover:text-primary transition-colors">
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                          <span>All 4 Corners</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        Sharpness and condition of all corner points
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2 cursor-help hover:text-primary transition-colors">
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                          <span>Edge Quality</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        Wear and damage along card edges
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2 cursor-help hover:text-primary transition-colors">
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                          <span>Surface Defects</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        Scratches, wear, or printing imperfections
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2 cursor-help hover:text-primary transition-colors">
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                          <span>ROI Calculator</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        Estimates profit from grading vs selling raw
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2 cursor-help hover:text-primary transition-colors">
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                          <span>Submission Prep</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        Step-by-step checklist for PSA submission
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              </Card>

              <Button 
                className="w-full h-12"
                onClick={handleAnalyze}
                disabled={!imagePreview || isAnalyzing || (!isPro && !user?.isAdmin)}
                data-testid="button-analyze-grade"
              >
                {!isPro && !user?.isAdmin ? (
                  <>
                    <Shield className="w-4 h-4 mr-2" />
                    Pro Feature - Upgrade to Use
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Analyze Card Condition
                  </>
                )}
              </Button>
            </motion.div>
          )}

          {step === 'analyzing' && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-16"
            >
              <div className="relative w-24 h-24 mb-6">
                <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                <div className="absolute inset-4 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-primary animate-pulse" />
                </div>
              </div>
              <p className="font-semibold text-lg mb-2">Analyzing Card...</p>
              <p className="text-sm text-muted-foreground text-center max-w-xs">
                Our AI is examining centering, corners, edges, and surface condition
              </p>
            </motion.div>
          )}

          {step === 'result' && result && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <Card className={`p-6 ${getGradeBg(result.predictedPSA)}`}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Predicted PSA Grade</p>
                    <p className={`text-4xl font-bold ${getGradeColor(result.predictedPSA)}`}>
                      PSA {result.predictedPSA}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Confidence</p>
                    <p className="text-2xl font-bold">{Math.round(result.confidence * 100)}%</p>
                  </div>
                </div>
                
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${result.worthGrading ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'}`}>
                  {result.worthGrading ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-sm font-medium">Worth Grading</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-sm font-medium">Consider Selling Raw</span>
                    </>
                  )}
                </div>

                {/* PSA Grading Scale Reference */}
                <div className="mt-4 pt-4 border-t border-border/30 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground mb-2">PSA 10-Point Grading Scale:</p>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <div><span className="font-mono">10</span> - Gem Mint (Perfect)</div>
                    <div><span className="font-mono">9</span> - Mint</div>
                    <div><span className="font-mono">8</span> - NM/Mint</div>
                    <div><span className="font-mono">7</span> - NM</div>
                    <div><span className="font-mono">6</span> - Excellent</div>
                    <div><span className="font-mono">5</span> - Good +</div>
                  </div>
                  <p className="mt-2 text-muted-foreground/70">Also compatible with BGS, CGC, SGC standards</p>
                </div>
              </Card>

              {imagePreview && (
                <Card className="p-4">
                  <img 
                    src={imagePreview} 
                    alt="Analyzed card" 
                    className="w-full max-h-48 object-contain rounded-lg"
                  />
                </Card>
              )}

              <Card className="p-4">
                <h3 className="font-semibold mb-4">Condition Breakdown</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getScoreIcon(result.centering.score)}
                      <span>Centering</span>
                    </div>
                    <div className="text-right">
                      <span className={`font-bold ${getGradeColor(result.centering.score)}`}>
                        {result.centering.score}/10
                      </span>
                      <p className="text-xs text-muted-foreground">{result.centering.description}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getScoreIcon(result.corners.score)}
                      <span>Corners</span>
                    </div>
                    <div className="text-right">
                      <span className={`font-bold ${getGradeColor(result.corners.score)}`}>
                        {result.corners.score}/10
                      </span>
                      <p className="text-xs text-muted-foreground">{result.corners.description}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getScoreIcon(result.edges.score)}
                      <span>Edges</span>
                    </div>
                    <div className="text-right">
                      <span className={`font-bold ${getGradeColor(result.edges.score)}`}>
                        {result.edges.score}/10
                      </span>
                      <p className="text-xs text-muted-foreground">{result.edges.description}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getScoreIcon(result.surface.score)}
                      <span>Surface</span>
                    </div>
                    <div className="text-right">
                      <span className={`font-bold ${getGradeColor(result.surface.score)}`}>
                        {result.surface.score}/10
                      </span>
                      <p className="text-xs text-muted-foreground">{result.surface.description}</p>
                    </div>
                  </div>
                  
                  {result.backCondition && result.backCondition.score !== null && (
                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="flex items-center gap-2">
                        {getScoreIcon(result.backCondition.score)}
                        <span>Back Condition</span>
                      </div>
                      <div className="text-right">
                        <span className={`font-bold ${getGradeColor(result.backCondition.score)}`}>
                          {result.backCondition.score}/10
                        </span>
                        <p className="text-xs text-muted-foreground">{result.backCondition.description}</p>
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              {result.recommendations.length > 0 && (
                <Card className="p-4">
                  <h3 className="font-semibold mb-3">Recommendations</h3>
                  <ul className="space-y-2">
                    {result.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {result.gradingRisk && (
                <Card className={`p-4 ${
                  result.gradingRisk === 'low' ? 'bg-emerald-500/10 border-emerald-500/30' :
                  result.gradingRisk === 'medium' ? 'bg-amber-500/10 border-amber-500/30' :
                  'bg-red-500/10 border-red-500/30'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className={`w-5 h-5 ${
                        result.gradingRisk === 'low' ? 'text-emerald-500' :
                        result.gradingRisk === 'medium' ? 'text-amber-500' :
                        'text-red-500'
                      }`} />
                      <span className="font-semibold">Grading Risk: {result.gradingRisk.toUpperCase()}</span>
                    </div>
                    <Badge variant={result.gradingRisk === 'low' ? 'default' : result.gradingRisk === 'medium' ? 'secondary' : 'destructive'}>
                      {result.gradingRisk === 'low' ? 'Safe Submission' : result.gradingRisk === 'medium' ? 'Borderline' : 'Risky'}
                    </Badge>
                  </div>
                </Card>
              )}

              {result.detectedIssues && result.detectedIssues.length > 0 && (
                <Card className="p-4 border-amber-500/30">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Detected Issues
                  </h3>
                  <ul className="space-y-2">
                    {result.detectedIssues.map((issue, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                        <span>{issue}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {result.estimatedValue && result.gradingCosts && (
                <Card className="p-4 bg-primary/5">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" />
                    ROI Calculator
                  </h3>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="text-center p-2 rounded-lg bg-background">
                      <p className="text-xs text-muted-foreground">Raw Value</p>
                      <p className="text-lg font-bold">${result.estimatedValue.raw}</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-background">
                      <p className="text-xs text-muted-foreground">Graded Value</p>
                      <p className="text-lg font-bold text-primary">${result.estimatedValue.graded}</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-background">
                      <p className="text-xs text-muted-foreground">Multiplier</p>
                      <p className="text-lg font-bold">{result.estimatedValue.multiplier}x</p>
                    </div>
                  </div>
                  
                  <h4 className="text-sm font-medium mb-2">PSA Submission Tiers</h4>
                  <div className="space-y-2">
                    {Object.entries(result.gradingCosts.tiers).map(([key, tier]) => (
                      <div 
                        key={key} 
                        className={`flex items-center justify-between p-2 rounded-lg ${
                          result.gradingCosts?.bestTier === key ? 'bg-emerald-500/20 border border-emerald-500/40' : 'bg-background'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {result.gradingCosts?.bestTier === key && (
                            <CheckCircle className="w-4 h-4 text-emerald-500" />
                          )}
                          <span className="text-sm font-medium">{getTierName(key)}</span>
                        </div>
                        <div className="text-right">
                          <span className={`font-bold ${tier.profit > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {tier.profit > 0 ? '+' : ''}${tier.profit}
                          </span>
                          <span className="text-xs text-muted-foreground ml-2">
                            ({tier.roi > 0 ? '+' : ''}{tier.roi}% ROI)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {result.gradingCosts.worthIt ? (
                    <div className="mt-3 p-2 rounded-lg bg-emerald-500/20 text-center">
                      <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                        Best Profit: ${result.gradingCosts.bestProfit} with {getTierName(result.gradingCosts.bestTier || '')}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3 p-2 rounded-lg bg-amber-500/20 text-center">
                      <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                        Grading may not be profitable at current value
                      </p>
                    </div>
                  )}
                </Card>
              )}

              {checklist.length > 0 && (
                <Card className="p-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Award className="w-4 h-4 text-primary" />
                    Submission Prep Checklist
                  </h3>
                  <ul className="space-y-2">
                    {checklist.map((item, i) => (
                      <li 
                        key={i} 
                        className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover-elevate"
                        onClick={() => toggleChecklistItem(i)}
                        data-testid={`checklist-item-${i}`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          item.done ? 'bg-emerald-500 border-emerald-500' : 'border-muted-foreground'
                        }`}>
                          {item.done && <CheckCircle className="w-3 h-3 text-white" />}
                        </div>
                        <span className={item.done ? 'line-through text-muted-foreground' : ''}>
                          {item.step}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground mt-3">
                    {checklist.filter(c => c.done).length}/{checklist.length} steps completed
                  </p>
                </Card>
              )}

              <PSALookup />

              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={resetAnalysis}
                  data-testid="button-scan-another"
                >
                  Scan Another Card
                </Button>
                <Button 
                  className="flex-1"
                  onClick={() => setLocation('/')}
                  data-testid="button-done"
                >
                  Done
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <BottomNav />
    </div>
  );
}
