import { AlertCircle, RefreshCw, ArrowRight, Sparkles, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { parseApiError, ApiErrorInfo } from "@/lib/api-errors";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";

interface ApiErrorDisplayProps {
  error: Error | string | null;
  errorResponse?: any; // Server error response for detailed parsing
  onRetry?: () => void;
  onDismiss?: () => void;
  showUpgrade?: boolean;
  showResearchMode?: boolean;
}

export function ApiErrorDisplay({ 
  error, 
  errorResponse,
  onRetry, 
  onDismiss,
  showUpgrade = true,
  showResearchMode = true 
}: ApiErrorDisplayProps) {
  const [, setLocation] = useLocation();
  const [retryCountdown, setRetryCountdown] = useState<number | undefined>();
  
  if (!error) return null;
  
  const errorObj = typeof error === 'string' ? new Error(error) : error;
  const errorInfo: ApiErrorInfo = parseApiError(errorObj, errorResponse);
  
  const isLimitError = errorInfo.title === "Daily Limit Reached";
  const isNoCompsError = errorInfo.title === "Not Enough Sales Data";
  const canRetryAfter = errorInfo.retryable && errorInfo.retryAfterSeconds;

  // Handle countdown timer for retry
  useEffect(() => {
    if (!canRetryAfter) return;
    
    setRetryCountdown(errorInfo.retryAfterSeconds);
    
    const timer = setInterval(() => {
      setRetryCountdown(prev => {
        if (prev === undefined || prev <= 1) {
          clearInterval(timer);
          return undefined;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [canRetryAfter, errorInfo.retryAfterSeconds]);
  
  return (
    <Card className="p-4 border-destructive/50 bg-destructive/5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <AlertCircle className="h-5 w-5 text-destructive" />
        </div>
        <div className="flex-1 space-y-2">
          <div>
            <h4 className="font-medium text-destructive">{errorInfo.title}</h4>
            <p className="text-sm text-muted-foreground mt-1">
              {errorInfo.message}
            </p>
            <p className="text-sm text-foreground mt-1">
              {errorInfo.suggestion}
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2 pt-2">
            {errorInfo.retryable && onRetry && (
              <Button 
                size="sm" 
                variant="outline" 
                onClick={onRetry}
                disabled={retryCountdown !== undefined && retryCountdown > 0}
                data-testid="button-retry"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                {retryCountdown !== undefined && retryCountdown > 0 
                  ? `Try again in ${retryCountdown}s`
                  : 'Try Again'}
              </Button>
            )}
            
            {canRetryAfter && retryCountdown === undefined && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Retry available now</span>
              </div>
            )}
            
            {isLimitError && showUpgrade && (
              <Button 
                size="sm" 
                onClick={() => setLocation('/settings')}
                data-testid="button-upgrade-from-error"
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Upgrade to Pro
              </Button>
            )}
            
            {isNoCompsError && showResearchMode && (
              <Button 
                size="sm" 
                variant="secondary"
                onClick={() => setLocation('/open-market')}
                data-testid="button-open-market-from-error"
              >
                <ArrowRight className="h-3.5 w-3.5 mr-1.5" />
                Try Open Market Search
              </Button>
            )}
            
            {onDismiss && (
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={onDismiss}
                data-testid="button-dismiss-error"
              >
                Dismiss
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
