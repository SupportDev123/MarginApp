import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ThumbsUp, AlertTriangle, Send } from "lucide-react";

const FEEDBACK_GATE_KEY = "margin_feedback_gate";
const SCAN_COUNT_KEY = "margin_scan_count";
const YARD_SALE_COMPLETE_KEY = "margin_yard_sale_complete";

interface FeedbackGateState {
  lastPromptDate: string | null;
  hasResponded: boolean;
}

function getFeedbackState(): FeedbackGateState {
  try {
    const stored = localStorage.getItem(FEEDBACK_GATE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {}
  return { lastPromptDate: null, hasResponded: false };
}

function saveFeedbackState(state: FeedbackGateState) {
  localStorage.setItem(FEEDBACK_GATE_KEY, JSON.stringify(state));
}

function getScanCount(): number {
  try {
    return parseInt(localStorage.getItem(SCAN_COUNT_KEY) || "0", 10);
  } catch {
    return 0;
  }
}

export function incrementScanCount() {
  const current = getScanCount();
  localStorage.setItem(SCAN_COUNT_KEY, String(current + 1));
}

export function markYardSaleComplete() {
  localStorage.setItem(YARD_SALE_COMPLETE_KEY, "true");
}

function hasCompletedYardSale(): boolean {
  return localStorage.getItem(YARD_SALE_COMPLETE_KEY) === "true";
}

function daysSinceLastPrompt(state: FeedbackGateState): number {
  if (!state.lastPromptDate) return Infinity;
  const lastDate = new Date(state.lastPromptDate);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - lastDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function shouldShowFeedbackGate(): boolean {
  const state = getFeedbackState();
  
  if (daysSinceLastPrompt(state) < 21) {
    return false;
  }
  
  const scanCount = getScanCount();
  const yardSaleComplete = hasCompletedYardSale();
  
  return scanCount >= 12 || yardSaleComplete;
}

function requestAppStoreReview() {
  if (typeof window !== "undefined" && (window as any).webkit?.messageHandlers?.requestReview) {
    (window as any).webkit.messageHandlers.requestReview.postMessage({});
  } else if (typeof window !== "undefined" && (window as any).Android?.requestReview) {
    (window as any).Android.requestReview();
  } else if ("requestIdleCallback" in window) {
    console.log("[FeedbackGate] App Store review would be triggered here (PWA context)");
  }
}

export function FeedbackGate() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackEmail, setFeedbackEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (shouldShowFeedbackGate()) {
        setOpen(true);
      }
    }, 2000);
    
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = useCallback(() => {
    const state = getFeedbackState();
    saveFeedbackState({
      ...state,
      lastPromptDate: new Date().toISOString(),
    });
    setOpen(false);
    setShowFeedbackForm(false);
  }, []);

  const handleYesHelpful = useCallback(() => {
    saveFeedbackState({
      lastPromptDate: new Date().toISOString(),
      hasResponded: true,
    });
    setOpen(false);
    
    requestAppStoreReview();
    
    toast({
      title: "Thank you!",
      description: "Your feedback helps us improve Margin.",
    });
  }, [toast]);

  const handleNeedsImprovement = useCallback(() => {
    setShowFeedbackForm(true);
  }, []);

  const handleSubmitFeedback = useCallback(async () => {
    if (!feedbackText.trim()) {
      toast({
        title: "Please enter your feedback",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    
    try {
      console.log("[FeedbackGate] Feedback submitted:", { 
        feedback: feedbackText, 
        email: feedbackEmail 
      });
      
      saveFeedbackState({
        lastPromptDate: new Date().toISOString(),
        hasResponded: true,
      });
      
      toast({
        title: "Feedback received",
        description: "Thank you for helping us improve Margin.",
      });
      
      setOpen(false);
      setShowFeedbackForm(false);
      setFeedbackText("");
      setFeedbackEmail("");
    } catch (err) {
      toast({
        title: "Failed to submit",
        description: "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [feedbackText, feedbackEmail, toast]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleDismiss()}>
      <DialogContent className="sm:max-w-md">
        {!showFeedbackForm ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-center text-lg">
                Is Margin helping you decide faster?
              </DialogTitle>
            </DialogHeader>
            
            <DialogFooter className="flex-col gap-2 sm:flex-col mt-4">
              <Button 
                onClick={handleYesHelpful} 
                className="w-full"
                data-testid="button-feedback-yes"
              >
                <ThumbsUp className="w-4 h-4 mr-2" />
                Yes, it's helpful
              </Button>
              <Button 
                variant="outline" 
                onClick={handleNeedsImprovement}
                className="w-full"
                data-testid="button-feedback-needs-improvement"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Needs improvement
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>How can we improve?</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="feedback">Your feedback</Label>
                <Textarea
                  id="feedback"
                  placeholder="Tell us what's not working or what you'd like to see..."
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  rows={4}
                  data-testid="textarea-feedback"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email (optional)</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={feedbackEmail}
                  onChange={(e) => setFeedbackEmail(e.target.value)}
                  data-testid="input-feedback-email"
                />
                <p className="text-xs text-muted-foreground">
                  We'll only use this to follow up on your feedback
                </p>
              </div>
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button 
                onClick={handleSubmitFeedback} 
                className="w-full"
                disabled={isSubmitting}
                data-testid="button-submit-feedback"
              >
                <Send className="w-4 h-4 mr-2" />
                {isSubmitting ? "Sending..." : "Send Feedback"}
              </Button>
              <Button 
                variant="ghost" 
                onClick={handleDismiss}
                className="w-full"
                data-testid="button-feedback-later"
              >
                Maybe later
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
