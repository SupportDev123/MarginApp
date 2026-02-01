import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, X, Sparkles, Search } from 'lucide-react';

interface VisualMatchResult {
  itemId: number;
  title: string;
  brand?: string;
  modelFamily?: string;
  variant?: string;
  imageUrl?: string;
  bestImageScore: number;
  avgTop3Score: number;
  supportCount: number;
  confidence: 'high' | 'medium' | 'low';
}

interface VisualMatchResultsProps {
  sessionId: number;
  topMatches: VisualMatchResult[];
  decision: 'auto_selected' | 'user_required' | 'no_confident_match';
  autoSelectedItem?: VisualMatchResult;
  bestScore: number;
  onConfirm: (item: VisualMatchResult) => void;
  onDeepScan: () => void;
  onCancel: () => void;
}

export default function VisualMatchResults({
  sessionId,
  topMatches,
  decision,
  autoSelectedItem,
  bestScore,
  onConfirm,
  onDeepScan,
  onCancel,
}: VisualMatchResultsProps) {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<VisualMatchResult | null>(
    decision === 'auto_selected' ? autoSelectedItem || null : null
  );

  const confirmMutation = useMutation({
    mutationFn: async (chosenItemId: number) => {
      const res = await apiRequest('POST', '/api/scan/confirm', {
        sessionId,
        chosenItemId,
        addToLibrary: true,
      });
      return res.json();
    },
    onSuccess: (_, chosenItemId) => {
      const item = topMatches.find(m => m.itemId === chosenItemId);
      if (item) {
        onConfirm(item);
      }
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const getConfidenceColor = (confidence: 'high' | 'medium' | 'low') => {
    switch (confidence) {
      case 'high': return 'bg-green-500/20 text-green-500 border-green-500/30';
      case 'medium': return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30';
      case 'low': return 'bg-red-500/20 text-red-500 border-red-500/30';
    }
  };

  const getScoreLabel = (score: number) => {
    if (score >= 0.86) return 'Excellent Match';
    if (score >= 0.75) return 'Good Match';
    if (score >= 0.60) return 'Possible Match';
    return 'Low Match';
  };

  return (
    <div className="space-y-4">
      {decision === 'auto_selected' && autoSelectedItem && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-green-500" />
              <span className="font-semibold text-green-500">Auto-Identified</span>
              <Badge variant="outline" className={getConfidenceColor('high')}>
                {Math.round(bestScore * 100)}% match
              </Badge>
            </div>
            <div className="flex gap-4">
              {autoSelectedItem.imageUrl && (
                <img
                  src={autoSelectedItem.imageUrl}
                  alt=""
                  className="w-20 h-20 object-cover rounded-lg"
                />
              )}
              <div className="flex-1">
                <h3 className="font-semibold">{autoSelectedItem.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {autoSelectedItem.brand} {autoSelectedItem.modelFamily} {autoSelectedItem.variant}
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button
                onClick={() => confirmMutation.mutate(autoSelectedItem.itemId)}
                disabled={confirmMutation.isPending}
                className="flex-1"
                data-testid="button-confirm-auto"
              >
                {confirmMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Yes, this is it
              </Button>
              <Button
                variant="outline"
                onClick={() => setSelectedItem(null)}
                data-testid="button-not-quite"
              >
                Not quite
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {(decision !== 'auto_selected' || !autoSelectedItem) && (
        <>
          <div className="text-center space-y-2">
            <h3 className="font-semibold">
              {topMatches.length === 0 
                ? "No matches found in library"
                : decision === 'no_confident_match' 
                  ? "Couldn't find a confident match" 
                  : "Select the correct match"
              }
            </h3>
            <p className="text-sm text-muted-foreground">
              {topMatches.length === 0
                ? "The library is still building. Use Deep Scan for AI analysis."
                : decision === 'no_confident_match'
                  ? "Try Deep Scan for AI analysis, or select the closest match below"
                  : "Tap the item that matches your scan"
              }
            </p>
          </div>

          {topMatches.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {topMatches.map((match) => (
              <Card
                key={match.itemId}
                className={`cursor-pointer transition-all ${
                  selectedItem?.itemId === match.itemId
                    ? 'ring-2 ring-primary'
                    : 'hover-elevate'
                }`}
                onClick={() => setSelectedItem(match)}
                data-testid={`card-match-${match.itemId}`}
              >
                <CardContent className="p-3">
                  {match.imageUrl && (
                    <img
                      src={match.imageUrl}
                      alt=""
                      className="w-full aspect-square object-cover rounded-lg mb-2"
                    />
                  )}
                  <h4 className="font-medium text-sm truncate">{match.title}</h4>
                  <p className="text-xs text-muted-foreground truncate">
                    {match.brand} {match.variant}
                  </p>
                  <div className="flex justify-between items-center mt-2">
                    <Badge
                      variant="outline"
                      className={`text-xs ${getConfidenceColor(match.confidence)}`}
                    >
                      {Math.round(match.bestImageScore * 100)}%
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {getScoreLabel(match.bestImageScore)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          )}

          {topMatches.length > 0 && (
          <div className="flex gap-2">
            <Button
              onClick={() => selectedItem && confirmMutation.mutate(selectedItem.itemId)}
              disabled={!selectedItem || confirmMutation.isPending}
              className="flex-1"
              data-testid="button-confirm-selection"
            >
              {confirmMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              Confirm Selection
            </Button>
          </div>
          )}
        </>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={onDeepScan}
          className="flex-1"
          data-testid="button-deep-scan"
        >
          <Search className="w-4 h-4 mr-2" />
          Deep Scan (AI)
        </Button>
        <Button
          variant="ghost"
          onClick={onCancel}
          data-testid="button-none-of-these"
        >
          <X className="w-4 h-4 mr-2" />
          None of these
        </Button>
      </div>
    </div>
  );
}
