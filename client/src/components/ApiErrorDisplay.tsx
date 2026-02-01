import { AlertCircle, RefreshCw, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { parseApiError, ApiErrorInfo } from "@/lib/api-errors";
import { useLocation } from "wouter";

interface ApiErrorDisplayProps {
  error: Error | string | null;
  onRetry?: () => void;
  onDismiss?: () => void;
  showUpgrade?: boolean;
  showResearchMode?: boolean;
}

export function ApiErrorDisplay({ 
  error, 
  onRetry, 
  onDismiss,
  showUpgrade = true,
  showResearchMode = true 
}: ApiErrorDisplayProps) {
  const [, setLocation] = useLocation();
  
  if (!error) return null;
  
  const errorObj = typeof error === 'string' ? new Error(error) : error;
  const errorInfo: ApiErrorInfo = parseApiError(errorObj);
  
  const isLimitError = errorInfo.title === "Daily Limit Reached";
  const isNoCompsError = errorInfo.title === "Not Enough Sales Data";
  
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
                data-testid="button-retry"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Try Again
              </Button>
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
