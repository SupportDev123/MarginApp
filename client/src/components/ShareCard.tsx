import { useRef, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Share2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ShareCardProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  verdict: 'flip' | 'skip' | 'risky';
  profit?: number | null;
  category?: string | null;
  maxBuy?: number | null;
  sellPrice?: number | null;
}

export function ShareCard({ 
  isOpen, 
  onClose, 
  title, 
  verdict, 
  profit, 
  category,
  maxBuy,
  sellPrice 
}: ShareCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const generateCard = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = 1080;
    const height = 1080;
    canvas.width = width;
    canvas.height = height;

    const isFlip = verdict === 'flip';
    const bgColor = isFlip ? '#0a1a0f' : '#1a0a0a';
    const accentColor = isFlip ? '#22c55e' : '#ef4444';
    const gradientEnd = isFlip ? '#0f2a1a' : '#2a0f0f';

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, bgColor);
    gradient.addColorStop(1, gradientEnd);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = accentColor + '20';
    ctx.lineWidth = 2;
    for (let i = 0; i < 20; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * 60);
      ctx.lineTo(width, i * 60);
      ctx.stroke();
    }

    const verdictText = isFlip ? 'FLIP IT!' : 'SKIP IT';
    ctx.font = 'bold 140px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 30;
    ctx.fillStyle = accentColor;
    ctx.fillText(verdictText, width / 2, 320);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px system-ui, -apple-system, sans-serif';
    const truncatedTitle = title.length > 35 ? title.substring(0, 35) + '...' : title;
    ctx.fillText(truncatedTitle, width / 2, 450);

    if (category) {
      ctx.fillStyle = '#9ca3af';
      ctx.font = '36px system-ui, -apple-system, sans-serif';
      ctx.fillText(category.toUpperCase(), width / 2, 510);
    }

    let yPos = 600;
    
    if (isFlip && profit && profit > 0) {
      ctx.fillStyle = accentColor;
      ctx.font = 'bold 72px system-ui, -apple-system, sans-serif';
      ctx.fillText(`+$${profit.toFixed(0)} PROFIT`, width / 2, yPos);
      yPos += 100;
    }

    if (maxBuy) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '44px system-ui, -apple-system, sans-serif';
      ctx.fillText(`Max Buy: $${maxBuy.toFixed(0)}`, width / 2, yPos);
      yPos += 70;
    }

    if (sellPrice) {
      ctx.fillStyle = '#9ca3af';
      ctx.font = '40px system-ui, -apple-system, sans-serif';
      ctx.fillText(`Est. Sell: $${sellPrice.toFixed(0)}`, width / 2, yPos);
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px system-ui, -apple-system, sans-serif';
    ctx.fillText('[M]', width / 2, height - 180);
    
    ctx.fillStyle = '#6b7280';
    ctx.font = '32px system-ui, -apple-system, sans-serif';
    ctx.fillText('margin.app', width / 2, height - 120);
    
    ctx.fillStyle = '#4b5563';
    ctx.font = '28px system-ui, -apple-system, sans-serif';
    ctx.fillText('We decide. So you don\'t have to.', width / 2, height - 70);

  }, [title, verdict, profit, category, maxBuy, sellPrice]);

  const downloadImage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsGenerating(true);
    generateCard();

    setTimeout(() => {
      const link = document.createElement('a');
      link.download = `margin-${verdict}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      setIsGenerating(false);
      toast({
        title: "Image saved!",
        description: "Share it on Instagram, Twitter, or anywhere",
      });
    }, 100);
  }, [generateCard, verdict, toast]);

  const shareImage = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsGenerating(true);
    generateCard();

    setTimeout(async () => {
      try {
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b!), 'image/png');
        });
        
        const file = new File([blob], `margin-${verdict}.png`, { type: 'image/png' });
        
        if (navigator.share && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `${verdict === 'flip' ? 'FLIP IT!' : 'SKIP IT'} - ${title}`,
            text: `Found with Margin - We decide. So you don't have to.`,
          });
        } else {
          downloadImage();
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          downloadImage();
        }
      }
      setIsGenerating(false);
    }, 100);
  }, [generateCard, verdict, title, downloadImage]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5" />
            Share Your Find
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="relative bg-muted rounded-lg overflow-hidden aspect-square">
            <canvas 
              ref={canvasRef} 
              className="w-full h-full"
              style={{ imageRendering: 'auto' }}
            />
            {!canvasRef.current?.getContext('2d') && (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                Generating preview...
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={shareImage} 
              className="flex-1"
              disabled={isGenerating}
              data-testid="button-share-image"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
            <Button 
              onClick={downloadImage} 
              variant="outline"
              className="flex-1"
              disabled={isGenerating}
              data-testid="button-download-image"
            >
              <Download className="w-4 h-4 mr-2" />
              Save
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Perfect for Instagram Stories, Twitter, or anywhere you share
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
