import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BottomNav } from "@/components/BottomNav";
import { ArrowLeft, Camera, Loader2, CheckCircle, AlertTriangle, XCircle, Shield, Award, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface MemorabiliaResult {
  itemType: string;
  sport: string;
  player: string;
  team: string;
  era: string;
  signature: {
    present: boolean;
    quality: string;
    location: string;
    inscriptions: string[];
  };
  authentication: {
    visible: boolean;
    authenticator: string;
    hologramPresent: boolean;
    certNumberVisible: string | null;
  };
  condition: {
    grade: string;
    issues: string[];
  };
  valueFactors: {
    isHallOfFamer: boolean | string;
    isGameWorn: boolean | string;
    hasInscription: boolean;
    premiumFactors: string[];
  };
  recommendations: string[];
  authenticationAdvice: string;
  confidence: number;
  verificationSteps: { step: string; description: string }[];
  verificationUrls: Record<string, string>;
}

const ITEM_TYPES = [
  { value: "jersey", label: "Jersey" },
  { value: "helmet", label: "Helmet" },
  { value: "signed_ball", label: "Signed Ball" },
  { value: "signed_photo", label: "Signed Photo" },
  { value: "game_used", label: "Game-Used Equipment" },
  { value: "other", label: "Other Memorabilia" }
];

export default function SportsMemorabiliaPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [step, setStep] = useState<'upload' | 'analyzing' | 'result'>('upload');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [itemType, setItemType] = useState("");
  const [certNumber, setCertNumber] = useState("");
  const [authenticator, setAuthenticator] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<MemorabiliaResult | null>(null);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleAnalyze = async () => {
    if (!imagePreview) {
      toast({ title: "No image", description: "Please upload an image first", variant: "destructive" });
      return;
    }

    setIsAnalyzing(true);
    setStep('analyzing');

    try {
      const response = await apiRequest('POST', '/api/sports-memorabilia/analyze', {
        image: imagePreview,
        itemType: itemType || undefined,
        certNumber: certNumber || undefined,
        authenticator: authenticator || undefined,
      });

      const data = await response.json();
      setResult(data);
      setStep('result');
    } catch (error: any) {
      console.error('Memorabilia analysis error:', error);
      toast({ 
        title: "Analysis failed", 
        description: error.message || "Could not analyze the item. Please try again.",
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
    setItemType("");
    setCertNumber("");
    setAuthenticator("");
    setResult(null);
  };

  const getConditionColor = (grade: string) => {
    const lower = grade.toLowerCase();
    if (lower.includes('mint') || lower.includes('excellent')) return 'text-emerald-500';
    if (lower.includes('very good') || lower.includes('good')) return 'text-blue-500';
    if (lower.includes('fair')) return 'text-amber-500';
    return 'text-red-500';
  };

  const getSignatureColor = (quality: string) => {
    const lower = quality.toLowerCase();
    if (lower === 'bold' || lower === 'clean') return 'text-emerald-500';
    if (lower === 'faded') return 'text-amber-500';
    if (lower === 'questionable') return 'text-red-500';
    return 'text-muted-foreground';
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
            <h1 className="text-xl font-bold">Sports Memorabilia</h1>
            <p className="text-sm text-muted-foreground">Jerseys, helmets, signed balls & more</p>
          </div>
          <Badge variant="outline" className="border-primary/30 text-primary">
            <Award className="w-3 h-3 mr-1" />
            New
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
                      alt="Item preview" 
                      className="w-full max-h-80 object-contain rounded-lg"
                    />
                    <Button 
                      variant="secondary" 
                      size="sm" 
                      className="absolute bottom-2 right-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setImagePreview(null);
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
                    <p className="font-semibold text-lg mb-1">Upload Memorabilia Photo</p>
                    <p className="text-sm text-muted-foreground">Take a photo or choose from gallery</p>
                    <p className="text-xs text-muted-foreground mt-2">Include any visible signatures, tags, or authentication stickers</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageSelect}
                  className="hidden"
                  data-testid="input-memorabilia-image"
                />
              </Card>

              <Card className="p-4">
                <h3 className="font-semibold mb-3">Item Details (Optional)</h3>
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm">Item Type</Label>
                    <Select value={itemType} onValueChange={setItemType}>
                      <SelectTrigger className="mt-1" data-testid="select-item-type">
                        <SelectValue placeholder="Select item type..." />
                      </SelectTrigger>
                      <SelectContent>
                        {ITEM_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="certNumber" className="text-sm">COA / Certificate Number</Label>
                    <Input
                      id="certNumber"
                      value={certNumber}
                      onChange={(e) => setCertNumber(e.target.value)}
                      placeholder="e.g., PSA 12345678"
                      className="mt-1"
                      data-testid="input-cert-number"
                    />
                  </div>
                  
                  <div>
                    <Label className="text-sm">Authenticator (if known)</Label>
                    <Select value={authenticator} onValueChange={setAuthenticator}>
                      <SelectTrigger className="mt-1" data-testid="select-authenticator">
                        <SelectValue placeholder="Select authenticator..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PSA">PSA/DNA</SelectItem>
                        <SelectItem value="JSA">JSA (James Spence)</SelectItem>
                        <SelectItem value="Beckett">Beckett Authentication</SelectItem>
                        <SelectItem value="Fanatics">Fanatics Authentic</SelectItem>
                        <SelectItem value="Unknown">Unknown / Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </Card>

              <Card className="p-4 bg-muted/30">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  What We Analyze
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    <span>Player/Team ID</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    <span>Signature Quality</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    <span>Authentication</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    <span>Condition Grade</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    <span>Value Factors</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    <span>COA Verification</span>
                  </div>
                </div>
              </Card>

              <Button 
                className="w-full h-12"
                onClick={handleAnalyze}
                disabled={!imagePreview || isAnalyzing}
                data-testid="button-analyze-memorabilia"
              >
                <Shield className="w-4 h-4 mr-2" />
                Analyze Memorabilia
              </Button>
            </motion.div>
          )}

          {step === 'analyzing' && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center justify-center py-12"
            >
              <div className="relative w-24 h-24 mb-6">
                <Loader2 className="w-24 h-24 animate-spin text-primary/20" />
                <div className="absolute inset-4 flex items-center justify-center">
                  <Shield className="w-8 h-8 text-primary animate-pulse" />
                </div>
              </div>
              <p className="font-semibold text-lg mb-2">Analyzing Memorabilia...</p>
              <p className="text-sm text-muted-foreground text-center max-w-xs">
                Checking signatures, authentication, and condition
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
              <Card className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <Badge variant="secondary" className="mb-2">{result.itemType}</Badge>
                    <h2 className="text-xl font-bold">{result.player}</h2>
                    <p className="text-muted-foreground">{result.team} - {result.sport}</p>
                    <p className="text-sm text-muted-foreground">{result.era}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Confidence</p>
                    <p className="text-xl font-bold">{Math.round(result.confidence * 100)}%</p>
                  </div>
                </div>
              </Card>

              {imagePreview && (
                <Card className="p-4">
                  <img 
                    src={imagePreview} 
                    alt="Analyzed item" 
                    className="w-full max-h-48 object-contain rounded-lg"
                  />
                </Card>
              )}

              <Card className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Award className="w-4 h-4 text-primary" />
                  Signature Analysis
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Present</span>
                    <span className={result.signature.present ? 'text-emerald-500' : 'text-muted-foreground'}>
                      {result.signature.present ? 'Yes' : 'No'}
                    </span>
                  </div>
                  {result.signature.present && (
                    <>
                      <div className="flex justify-between">
                        <span>Quality</span>
                        <span className={getSignatureColor(result.signature.quality)}>
                          {result.signature.quality}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Location</span>
                        <span className="text-right">{result.signature.location}</span>
                      </div>
                      {result.signature.inscriptions.length > 0 && (
                        <div>
                          <span className="text-sm text-muted-foreground">Inscriptions:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {result.signature.inscriptions.map((insc, i) => (
                              <Badge key={i} variant="outline">{insc}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </Card>

              <Card className={`p-4 ${
                result.authentication.visible && result.authentication.hologramPresent
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-amber-500/10 border-amber-500/30'
              }`}>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Authentication Status
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>COA Visible</span>
                    {result.authentication.visible ? (
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                  </div>
                  <div className="flex justify-between">
                    <span>Hologram Present</span>
                    {result.authentication.hologramPresent ? (
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                  </div>
                  <div className="flex justify-between">
                    <span>Authenticator</span>
                    <span className="font-medium">{result.authentication.authenticator}</span>
                  </div>
                  {result.authentication.certNumberVisible && (
                    <div className="flex justify-between">
                      <span>Cert Number</span>
                      <span className="font-mono">{result.authentication.certNumberVisible}</span>
                    </div>
                  )}
                </div>
                
                {result.authentication.authenticator && result.authentication.authenticator !== 'None' && result.authentication.authenticator !== 'Unknown' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-3"
                    onClick={() => window.open(result.verificationUrls[result.authentication.authenticator], '_blank')}
                    data-testid="button-verify-cert"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Verify on {result.authentication.authenticator} Website
                  </Button>
                )}
              </Card>

              <Card className="p-4">
                <h3 className="font-semibold mb-3">Condition</h3>
                <div className="flex items-center justify-between mb-2">
                  <span>Grade</span>
                  <span className={`font-bold ${getConditionColor(result.condition.grade)}`}>
                    {result.condition.grade}
                  </span>
                </div>
                {result.condition.issues.length > 0 && (
                  <div>
                    <span className="text-sm text-muted-foreground">Issues:</span>
                    <ul className="mt-1 space-y-1">
                      {result.condition.issues.map((issue, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                          <span>{issue}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>

              {result.valueFactors.premiumFactors.length > 0 && (
                <Card className="p-4 bg-primary/5">
                  <h3 className="font-semibold mb-3">Value Boosters</h3>
                  <div className="flex flex-wrap gap-2">
                    {result.valueFactors.isHallOfFamer === true && (
                      <Badge className="bg-amber-500">Hall of Famer</Badge>
                    )}
                    {result.valueFactors.isGameWorn === true && (
                      <Badge className="bg-emerald-500">Game-Worn</Badge>
                    )}
                    {result.valueFactors.hasInscription && (
                      <Badge variant="secondary">Inscribed</Badge>
                    )}
                    {result.valueFactors.premiumFactors.map((factor, i) => (
                      <Badge key={i} variant="outline">{factor}</Badge>
                    ))}
                  </div>
                </Card>
              )}

              {result.recommendations.length > 0 && (
                <Card className="p-4">
                  <h3 className="font-semibold mb-3">Recommendations</h3>
                  <ul className="space-y-2">
                    {result.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              <Card className="p-4">
                <h3 className="font-semibold mb-3">Verification Steps</h3>
                <ul className="space-y-3">
                  {result.verificationSteps.map((step, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-sm font-bold">
                        {i + 1}
                      </div>
                      <div>
                        <p className="font-medium">{step.step}</p>
                        <p className="text-sm text-muted-foreground">{step.description}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>

              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={resetAnalysis}
                  data-testid="button-scan-another"
                >
                  Scan Another
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
