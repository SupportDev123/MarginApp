import { Share2, Image, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShareCard } from "./ShareCard";

interface ShareButtonProps {
  title: string;
  verdict: 'flip' | 'skip' | 'risky';
  profit?: number | null;
  category?: string | null;
  maxBuy?: number | null;
  sellPrice?: number | null;
  className?: string;
  size?: 'sm' | 'icon' | 'default';
}

export function ShareButton({ 
  title, 
  verdict, 
  profit, 
  category,
  maxBuy,
  sellPrice,
  className = "",
  size = "icon"
}: ShareButtonProps) {
  const { toast } = useToast();
  const [showImageCard, setShowImageCard] = useState(false);

  const handleTextShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const verdictText = verdict === 'flip' ? 'FLIP IT!' : 'SKIP IT';
    const profitText = profit !== undefined && profit !== null
      ? profit >= 0 
        ? `+$${profit.toFixed(0)} profit` 
        : `-$${Math.abs(profit).toFixed(0)} loss`
      : '';
    
    const shareText = [
      `${verdictText} ${title}`,
      profitText,
      category ? `Category: ${category}` : '',
      '',
      'Analyzed with Margin - the reseller profit tool',
    ].filter(Boolean).join('\n');

    const shareData = {
      title: `Margin: ${verdictText}`,
      text: shareText,
    };

    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        toast({ title: "Shared successfully!" });
      } else {
        await navigator.clipboard.writeText(shareText);
        toast({ title: "Copied to clipboard!" });
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(shareText);
          toast({ title: "Copied to clipboard!" });
        } catch {
          toast({ title: "Couldn't share", variant: "destructive" });
        }
      }
    }
  };

  const handleImageShare = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowImageCard(true);
  };

  const normalizedVerdict = verdict === 'risky' ? 'skip' : verdict;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size={size}
            className={className}
            data-testid="button-share"
          >
            <Share2 className="w-4 h-4" />
            {size !== 'icon' && <span className="ml-1">Share</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={handleTextShare} data-testid="menu-share-text">
            <MessageSquare className="w-4 h-4 mr-2" />
            Share as Text
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleImageShare} data-testid="menu-share-image">
            <Image className="w-4 h-4 mr-2" />
            Create Image Card
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ShareCard
        isOpen={showImageCard}
        onClose={() => setShowImageCard(false)}
        title={title}
        verdict={normalizedVerdict}
        profit={profit}
        category={category}
        maxBuy={maxBuy}
        sellPrice={sellPrice}
      />
    </>
  );
}
