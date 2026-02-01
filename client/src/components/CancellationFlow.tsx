import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, Scan, DollarSign, Pause, Gift, ArrowRight, X, Loader2, Heart } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface CancellationFlowProps {
  open: boolean;
  onClose: () => void;
}

type FlowStep = "stats" | "pause" | "discount" | "confirm";

export function CancellationFlow({ open, onClose }: CancellationFlowProps) {
  const [step, setStep] = useState<FlowStep>("stats");
  const { toast } = useToast();

  const { data: stats, isLoading: statsLoading } = useQuery<{
    totalScans: number;
    flipCount: number;
    totalPotentialProfit: number;
    thisMonthProfit: number;
  }>({
    queryKey: ["/api/user/stats"],
    enabled: open,
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/billing-portal");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: () => {
      toast({ title: "Unable to open billing portal", variant: "destructive" });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/subscription/pause");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Subscription paused for 30 days", description: "We'll be here when you're ready!" });
      onClose();
    },
    onError: () => {
      toast({ title: "Unable to pause subscription", variant: "destructive" });
    },
  });

  const discountMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/subscription/apply-retention-discount");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.applied) {
        toast({ title: "50% off applied!", description: "Your next month is just $12.49" });
        onClose();
      } else {
        toast({ title: data.message || "Discount not available", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Unable to apply discount", variant: "destructive" });
    },
  });

  const handleClose = () => {
    setStep("stats");
    onClose();
  };

  const totalScans = stats?.totalScans || 0;
  const totalFlips = stats?.flipCount || 0;
  const totalProfit = stats?.totalPotentialProfit || 0;
  const thisMonthProfit = stats?.thisMonthProfit || 0;

  const renderStep = () => {
    switch (step) {
      case "stats":
        return (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <DialogHeader className="mb-4">
              <DialogTitle className="text-xl">Before you go...</DialogTitle>
              <DialogDescription>
                Here's what you've accomplished with Margin Pro
              </DialogDescription>
            </DialogHeader>

            {statsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <Card className="p-4 text-center">
                    <Scan className="h-6 w-6 mx-auto mb-2 text-primary" />
                    <p className="text-2xl font-bold">{totalScans.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Total Scans</p>
                  </Card>
                  <Card className="p-4 text-center">
                    <TrendingUp className="h-6 w-6 mx-auto mb-2 text-emerald-500" />
                    <p className="text-2xl font-bold">{totalFlips.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Flips Found</p>
                  </Card>
                  <Card className="p-4 text-center col-span-2 bg-emerald-500/10 border-emerald-500/30">
                    <DollarSign className="h-6 w-6 mx-auto mb-2 text-emerald-500" />
                    <p className="text-3xl font-bold text-emerald-500">
                      ${totalProfit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-xs text-muted-foreground">Profit Potential Identified</p>
                  </Card>
                </div>

                {thisMonthProfit > 0 && (
                  <p className="text-sm text-center text-muted-foreground mb-4">
                    This month alone: <span className="text-emerald-500 font-medium">${thisMonthProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> in profit potential
                  </p>
                )}

                <div className="space-y-2">
                  <Button 
                    className="w-full" 
                    variant="default"
                    onClick={handleClose}
                    data-testid="button-stay-subscribed"
                  >
                    <Heart className="h-4 w-4 mr-2" />
                    Keep My Pro Access
                  </Button>
                  <Button 
                    className="w-full" 
                    variant="outline"
                    onClick={() => setStep("pause")}
                    data-testid="button-continue-cancel"
                  >
                    I still want to cancel
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </>
            )}
          </motion.div>
        );

      case "pause":
        return (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <DialogHeader className="mb-4">
              <DialogTitle className="text-xl flex items-center gap-2">
                <Pause className="h-5 w-5" />
                Need a break?
              </DialogTitle>
              <DialogDescription>
                Pause your subscription instead of canceling
              </DialogDescription>
            </DialogHeader>

            <Card className="p-4 mb-6 bg-blue-500/10 border-blue-500/30">
              <h4 className="font-medium mb-2">30-Day Pause</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• No charges during pause</li>
                <li>• Keep your scan history</li>
                <li>• Resume anytime</li>
                <li>• Pro features return when you unpause</li>
              </ul>
            </Card>

            <div className="space-y-2">
              <Button 
                className="w-full" 
                variant="default"
                onClick={() => pauseMutation.mutate()}
                disabled={pauseMutation.isPending}
                data-testid="button-pause-subscription"
              >
                {pauseMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Pause className="h-4 w-4 mr-2" />
                )}
                Pause for 30 Days
              </Button>
              <Button 
                className="w-full" 
                variant="outline"
                onClick={() => setStep("discount")}
                data-testid="button-continue-cancel-2"
              >
                No, I want to cancel
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </motion.div>
        );

      case "discount":
        return (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <DialogHeader className="mb-4">
              <DialogTitle className="text-xl flex items-center gap-2">
                <Gift className="h-5 w-5 text-amber-500" />
                Special Offer
              </DialogTitle>
              <DialogDescription>
                We'd hate to see you go
              </DialogDescription>
            </DialogHeader>

            <Card className="p-4 mb-6 bg-amber-500/10 border-amber-500/30">
              <div className="text-center">
                <Badge className="bg-amber-500 mb-3">50% OFF</Badge>
                <p className="text-2xl font-bold mb-1">$12.49</p>
                <p className="text-sm text-muted-foreground line-through">$24.99/month</p>
                <p className="text-xs text-muted-foreground mt-2">Applied to your next billing cycle</p>
              </div>
            </Card>

            <div className="space-y-2">
              <Button 
                className="w-full bg-amber-500 hover:bg-amber-600" 
                onClick={() => discountMutation.mutate()}
                disabled={discountMutation.isPending}
                data-testid="button-apply-discount"
              >
                {discountMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Gift className="h-4 w-4 mr-2" />
                )}
                Apply 50% Discount
              </Button>
              <Button 
                className="w-full" 
                variant="outline"
                onClick={() => setStep("confirm")}
                data-testid="button-continue-cancel-3"
              >
                No thanks, cancel my subscription
              </Button>
            </div>
          </motion.div>
        );

      case "confirm":
        return (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <DialogHeader className="mb-4">
              <DialogTitle className="text-xl">Cancel Subscription</DialogTitle>
              <DialogDescription>
                You'll be redirected to Stripe to complete cancellation
              </DialogDescription>
            </DialogHeader>

            <Card className="p-4 mb-6 bg-red-500/10 border-red-500/30">
              <h4 className="font-medium mb-2 text-red-400">What you'll lose:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Unlimited scans (back to 5/day)</li>
                <li>• Permanent history (expires after 7 days)</li>
                <li>• Batch scanning</li>
                <li>• Analytics & insights</li>
                <li>• Listing tools</li>
              </ul>
            </Card>

            <div className="space-y-2">
              <Button 
                className="w-full" 
                variant="default"
                onClick={handleClose}
                data-testid="button-keep-subscription"
              >
                Keep My Subscription
              </Button>
              <Button 
                className="w-full" 
                variant="destructive"
                onClick={() => portalMutation.mutate()}
                disabled={portalMutation.isPending}
                data-testid="button-final-cancel"
              >
                {portalMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <X className="h-4 w-4 mr-2" />
                )}
                Cancel Subscription
              </Button>
            </div>
          </motion.div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <AnimatePresence mode="wait">
          {renderStep()}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
