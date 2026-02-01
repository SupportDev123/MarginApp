import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X, Trophy, TrendingUp, Sparkles } from "lucide-react";
import { SiInstagram, SiTiktok, SiX } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { toPng } from "html-to-image";

interface WinCardProps {
  isOpen: boolean;
  onClose: () => void;
  itemTitle: string;
  buyPrice: number;
  sellPrice: number;
  profit: number;
  imageUrl?: string | null;
}

export function WinCard({ 
  isOpen, 
  onClose, 
  itemTitle, 
  buyPrice, 
  sellPrice, 
  profit,
  imageUrl 
}: WinCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);
  const [hideImageForExport, setHideImageForExport] = useState(false);

  const roi = buyPrice > 0 ? Math.round((profit / buyPrice) * 100) : 0;
  const marginPercent = sellPrice > 0 ? Math.round((profit / sellPrice) * 100) : 0;

  const isExternalImage = (url: string | null | undefined): boolean => {
    if (!url) return false;
    try {
      const imageUrl = new URL(url, window.location.origin);
      return imageUrl.origin !== window.location.origin;
    } catch {
      return false;
    }
  };

  const downloadCard = async () => {
    if (!cardRef.current) return;
    
    setIsDownloading(true);
    
    const shouldHideImage = isExternalImage(imageUrl);
    if (shouldHideImage) {
      setHideImageForExport(true);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    try {
      const dataUrl = await toPng(cardRef.current, {
        quality: 1,
        pixelRatio: 3,
        backgroundColor: '#0a0a0a',
        cacheBust: true,
      });
      
      const link = document.createElement('a');
      link.download = `margin-win-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      
      toast({
        title: "Win Card saved!",
        description: "Share your flip on social media",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to download",
        description: "Please try again",
      });
    } finally {
      setHideImageForExport(false);
      setIsDownloading(false);
    }
  };

  const shareToSocial = async (platform: 'instagram' | 'tiktok' | 'twitter') => {
    const text = `Just made $${profit.toFixed(0)} profit on this flip! ${roi}% ROI\n\nAnalyzed with Margin - the reseller's secret weapon`;
    
    if (platform === 'twitter') {
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
    } else {
      await downloadCard();
      toast({
        title: `Share to ${platform === 'instagram' ? 'Instagram' : 'TikTok'}`,
        description: "Image saved! Open the app and share from your gallery.",
      });
    }
  };

  const showImage = imageUrl && !hideImageForExport;

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent className="max-w-sm p-0 bg-transparent border-0 shadow-none overflow-visible">
            <DialogTitle className="sr-only">Win Card</DialogTitle>
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className="relative"
            >
              <Button
                size="icon"
                variant="ghost"
                className="absolute -top-2 -right-2 z-50 rounded-full w-8 h-8"
                onClick={onClose}
                data-testid="button-close-wincard"
              >
                <X className="w-4 h-4" />
              </Button>

              <div 
                ref={cardRef}
                className="relative overflow-hidden rounded-2xl"
                style={{ 
                  background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 50%, #16213e 100%)',
                  padding: '2px',
                }}
                data-testid="wincard-container"
              >
                <div 
                  className="absolute inset-0 opacity-30"
                  style={{
                    background: 'linear-gradient(135deg, #22c55e 0%, #4ade80 25%, #3b82f6 50%, #8b5cf6 75%, #22c55e 100%)',
                    backgroundSize: '400% 400%',
                    animation: 'gradient-shift 3s ease infinite',
                  }}
                />
                
                <div className="relative bg-[#0a0a0a] rounded-2xl p-6">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#22c55e] via-[#4ade80] to-[#3b82f6]" />
                  
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#22c55e] to-[#3b82f6] flex items-center justify-center">
                        <Trophy className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-white/60 text-sm font-medium" data-testid="text-flip-win">FLIP WIN</span>
                    </div>
                    <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-green-500/20 border border-green-500/30">
                      <Sparkles className="w-3 h-3 text-green-400" />
                      <span className="text-green-400 text-xs font-bold" data-testid="text-roi">{roi}% ROI</span>
                    </div>
                  </div>

                  <div className="mb-6">
                    {showImage ? (
                      <div className="w-full h-32 rounded-xl overflow-hidden mb-4 bg-white/5">
                        <img 
                          src={imageUrl} 
                          alt={itemTitle}
                          className="w-full h-full object-cover"
                          crossOrigin="anonymous"
                          data-testid="img-item"
                        />
                      </div>
                    ) : (
                      <div className="w-full h-24 rounded-xl bg-gradient-to-br from-white/5 to-white/10 flex items-center justify-center mb-4">
                        <span className="text-4xl font-bold text-white/20" data-testid="text-item-initial">
                          {itemTitle.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <h3 className="text-white font-semibold text-lg leading-tight line-clamp-2" data-testid="text-item-title">
                      {itemTitle}
                    </h3>
                  </div>

                  <div className="flex items-center justify-between mb-6 px-4 py-3 rounded-xl bg-white/5">
                    <div className="text-center">
                      <p className="text-white/40 text-xs mb-1">BOUGHT</p>
                      <p className="text-white font-mono font-bold text-xl" data-testid="text-buy-price">${buyPrice.toFixed(0)}</p>
                    </div>
                    <div className="flex flex-col items-center">
                      <TrendingUp className="w-5 h-5 text-green-400 mb-1" />
                      <div className="w-12 h-0.5 bg-gradient-to-r from-white/20 via-green-400 to-white/20" />
                    </div>
                    <div className="text-center">
                      <p className="text-white/40 text-xs mb-1">SOLD</p>
                      <p className="text-white font-mono font-bold text-xl" data-testid="text-sell-price">${sellPrice.toFixed(0)}</p>
                    </div>
                  </div>

                  <div 
                    className="relative rounded-xl p-4 mb-6 overflow-hidden"
                    style={{
                      background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(59, 130, 246, 0.15) 100%)',
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-green-500/20 to-blue-500/20 blur-xl" />
                    <div className="relative text-center">
                      <p className="text-green-400/80 text-xs font-medium mb-1">NET PROFIT</p>
                      <p className="text-green-400 font-mono font-black text-4xl tracking-tight" data-testid="text-profit">
                        +${profit.toFixed(0)}
                      </p>
                      <p className="text-white/40 text-xs mt-1" data-testid="text-margin">{marginPercent}% margin</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-2 pt-2 border-t border-white/10">
                    <div className="w-6 h-6 rounded bg-[#22c55e] flex items-center justify-center">
                      <span className="text-white font-bold text-xs">M</span>
                    </div>
                    <span className="text-white/40 text-sm">
                      Analyzed with <span className="text-white font-semibold">Margin</span>
                    </span>
                  </div>
                </div>
              </div>

              <motion.div 
                className="flex gap-2 mt-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={downloadCard}
                  disabled={isDownloading}
                  data-testid="button-download-wincard"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {isDownloading ? "Saving..." : "Save Image"}
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => shareToSocial('instagram')}
                  data-testid="button-share-instagram"
                >
                  <SiInstagram className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => shareToSocial('tiktok')}
                  data-testid="button-share-tiktok"
                >
                  <SiTiktok className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => shareToSocial('twitter')}
                  data-testid="button-share-twitter"
                >
                  <SiX className="w-4 h-4" />
                </Button>
              </motion.div>
            </motion.div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
