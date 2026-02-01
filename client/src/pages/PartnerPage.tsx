import { useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Users, Copy, DollarSign, Share2, Clock, CheckCircle, XCircle, Loader2, TrendingUp, Calendar, ArrowRight, Crown } from "lucide-react";
import { format } from "date-fns";
import { MarginLogoFull } from "@/components/MarginLogo";

interface PartnerSummary {
  programActive: boolean;
  commissionRate: number;
  minimumPayoutCents: number;
  payoutDelayDays: number;
  referralCode: string;
  referralLink: string;
  stats: {
    totalReferrals: number;
    activeSubscriptions: number;
    pendingCents: number;
    eligibleCents: number;
    payableCents: number;
    paidCents: number;
  };
}

interface PartnerEarning {
  id: number;
  amountCents: number;
  paymentMonth: string;
  status: string;
  unlockAt: string | null;
  paidAt: string | null;
  voidReason: string | null;
  createdAt: string;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'pending':
      return <Badge variant="outline" className="text-amber-500 border-amber-500/30 bg-amber-500/10"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    case 'eligible':
      return <Badge variant="outline" className="text-blue-500 border-blue-500/30 bg-blue-500/10"><CheckCircle className="w-3 h-3 mr-1" />Eligible</Badge>;
    case 'payable':
      return <Badge variant="outline" className="text-green-500 border-green-500/30 bg-green-500/10"><DollarSign className="w-3 h-3 mr-1" />Payable</Badge>;
    case 'paid':
      return <Badge variant="outline" className="text-primary border-primary/30 bg-primary/10"><CheckCircle className="w-3 h-3 mr-1" />Paid</Badge>;
    case 'void':
      return <Badge variant="outline" className="text-red-500 border-red-500/30 bg-red-500/10"><XCircle className="w-3 h-3 mr-1" />Void</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function PartnerPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data: summary, isLoading: summaryLoading } = useQuery<PartnerSummary>({
    queryKey: ['/api/partner/summary'],
    enabled: !!user,
  });

  const { data: earnings, isLoading: earningsLoading } = useQuery<PartnerEarning[]>({
    queryKey: ['/api/partner/earnings'],
    enabled: !!user,
  });

  const copyLink = () => {
    if (summary?.referralLink) {
      navigator.clipboard.writeText(summary.referralLink);
      setCopied(true);
      toast({ title: "Link copied!", description: "Share it with friends to earn commissions." });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Please log in to access the Partner Program</p>
      </div>
    );
  }

  if (summaryLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalEarningsCents = (summary?.stats.pendingCents || 0) + 
    (summary?.stats.eligibleCents || 0) + 
    (summary?.stats.payableCents || 0) + 
    (summary?.stats.paidCents || 0);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="p-4 pt-8">
        <div className="flex justify-center mb-6">
          <MarginLogoFull height={64} />
        </div>
        
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold">Partner Program</h1>
            <p className="text-sm text-muted-foreground">Earn {summary?.commissionRate || 30}% on every referral</p>
          </div>
        </div>

        {!summary?.programActive && (
          <Card className="p-4 mb-4 border-amber-500/30 bg-amber-500/10">
            <p className="text-amber-600 font-medium">The Partner Program is currently paused. Existing commissions will still be processed.</p>
          </Card>
        )}

        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Your Referral Link</h3>
            <div className="bg-muted/50 rounded-lg p-3 mb-3 break-all">
              <code className="text-sm" data-testid="text-referral-link">{summary?.referralLink}</code>
            </div>
            <Button onClick={copyLink} className="w-full" data-testid="button-copy-link">
              {copied ? <CheckCircle className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
              {copied ? "Copied!" : "Copy Link"}
            </Button>
            <p className="text-xs text-muted-foreground mt-3 text-center">
              Code: <span className="font-mono font-bold">{summary?.referralCode}</span>
            </p>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4 text-center">
              <Users className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-2xl font-bold" data-testid="text-total-referrals">{summary?.stats.totalReferrals || 0}</p>
              <p className="text-xs text-muted-foreground">Total Referrals</p>
            </Card>
            <Card className="p-4 text-center">
              <Crown className="w-5 h-5 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold" data-testid="text-active-subs">{summary?.stats.activeSubscriptions || 0}</p>
              <p className="text-xs text-muted-foreground">Active Pro Subs</p>
            </Card>
          </div>

          <Card className="p-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Earnings Overview</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span className="text-sm">Pending (45-day hold)</span>
                </div>
                <span className="font-mono font-medium" data-testid="text-pending-earnings">{formatCents(summary?.stats.pendingCents || 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-500" />
                  <span className="text-sm">Eligible</span>
                </div>
                <span className="font-mono font-medium" data-testid="text-eligible-earnings">{formatCents(summary?.stats.eligibleCents || 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-green-500" />
                  <span className="text-sm">Payable</span>
                </div>
                <span className="font-mono font-medium text-green-500" data-testid="text-payable-earnings">{formatCents(summary?.stats.payableCents || 0)}</span>
              </div>
              <div className="border-t pt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Total Paid Out</span>
                </div>
                <span className="font-mono font-bold text-primary" data-testid="text-paid-earnings">{formatCents(summary?.stats.paidCents || 0)}</span>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">How It Works</h3>
            <div className="space-y-3 text-sm">
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Share2 className="w-3 h-3 text-primary" />
                </div>
                <p>Share your unique link with friends</p>
              </div>
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Crown className="w-3 h-3 text-primary" />
                </div>
                <p>They sign up and subscribe to Pro</p>
              </div>
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <DollarSign className="w-3 h-3 text-primary" />
                </div>
                <p>Earn {summary?.commissionRate || 30}% recurring commission every month they stay subscribed</p>
              </div>
            </div>
          </Card>

          {earnings && earnings.length > 0 && (
            <Card className="p-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Recent Earnings</h3>
              <div className="space-y-2">
                {earnings.slice(0, 10).map(earning => (
                  <div key={earning.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={earning.status} />
                        <span className="text-xs text-muted-foreground">{earning.paymentMonth}</span>
                      </div>
                      {earning.unlockAt && earning.status === 'pending' && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Unlocks {format(new Date(earning.unlockAt), 'MMM d, yyyy')}
                        </p>
                      )}
                    </div>
                    <span className="font-mono font-medium">{formatCents(earning.amountCents)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-4 bg-muted/30">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Program Terms</h3>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>Minimum payout: {formatCents(summary?.minimumPayoutCents || 2500)}</li>
              <li>{summary?.payoutDelayDays || 45}-day hold on new commissions</li>
              <li>Commissions paid monthly for active subscriptions</li>
              <li>Self-referrals are not allowed</li>
              <li>Terms may change at any time</li>
            </ul>
          </Card>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
