import { useState, useEffect } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { BottomNav } from "@/components/BottomNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { usePreferences } from "@/hooks/use-preferences";
import { useTheme } from "@/hooks/use-theme";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { Settings, Moon, Sun, Sparkles, Crown, TrendingUp, LogOut, History, CheckCircle, Sliders, Search, Loader2, Users, Copy, DollarSign, Share2, FileSpreadsheet, Lock, User, KeyRound, Eye, EyeOff, Percent, ChevronDown, ShoppingBag, Library, Video, Camera, Trash2, AlertTriangle, Download, Bell } from "lucide-react";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Slider } from "@/components/ui/slider";
import { useMutation } from "@tanstack/react-query";
import { CancellationFlow } from "@/components/CancellationFlow";

interface AffiliateStats {
  referralCode: string;
  referralLink: string;
  totalReferrals: number;
  proReferrals: number;
  totalEarned: string;
  pendingEarnings: string;
  paidEarnings: string;
  commissionRate: number;
  recentEarnings: { id: number; amount: string; month: string; status: string; createdAt: string }[];
}

export default function SettingsPage() {
  const { user, logoutMutation } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { preferences, updatePreference } = usePreferences();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [showCancellationFlow, setShowCancellationFlow] = useState(false);
  const { isSupported: pushSupported, isSubscribed: pushSubscribed, isLoading: pushLoading, subscribe: subscribePush, unsubscribe: unsubscribePush } = usePushNotifications();
  
  // Handle upgrade success from Stripe checkout redirect
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get('upgraded') === 'true') {
      // Invalidate user query to fetch fresh subscription status
      queryClient.invalidateQueries({ queryKey: [api.auth.me.path] });
      toast({ 
        title: "Welcome to Pro!", 
        description: "Your subscription is now active. Enjoy unlimited scans and Batch Scan!" 
      });
      // Clean up URL
      setLocation('/settings', { replace: true });
    }
  }, [searchString, toast, setLocation]);
  
  // Account settings state
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isChangingUsername, setIsChangingUsername] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  
  // Delete account state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  
  // Camera preference (stored in localStorage, defaults to OFF to avoid permission prompts)
  const [cameraEnabled, setCameraEnabled] = useState(() => {
    const stored = localStorage.getItem('margin_camera_enabled');
    return stored === 'true';
  });
  
  // Category profit settings state
  const [categoryProfits, setCategoryProfits] = useState<Record<string, number>>({
    'Watches': 30,
    'Trading Cards': 25,
    'Collectibles': 25,
    'Shoes': 25,
    'Electronics': 20,
    'Other': 25
  });
  
  // Fetch category profit settings
  const { data: categoryProfitData } = useQuery<{ categoryProfitPercents: Record<string, number> }>({
    queryKey: ['/api/user/category-profits'],
    enabled: !!user,
  });
  
  // Update local state when data is fetched
  useEffect(() => {
    if (categoryProfitData?.categoryProfitPercents) {
      setCategoryProfits(categoryProfitData.categoryProfitPercents);
    }
  }, [categoryProfitData]);
  
  // Mutation to save category profit settings
  const saveCategoryProfitsMutation = useMutation({
    mutationFn: async (profits: Record<string, number>) => {
      const res = await apiRequest('POST', '/api/user/category-profits', { categoryProfitPercents: profits });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Profit settings saved" });
      queryClient.invalidateQueries({ queryKey: ['/api/user/category-profits'] });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to save settings", variant: "destructive" });
    }
  });

  const isPro = user?.subscriptionTier === 'pro';
  const isAdmin = user?.isAdmin;

  const { data: affiliateStats } = useQuery<AffiliateStats>({
    queryKey: ['/api/affiliate/stats'],
    enabled: !!user,
  });

  const copyReferralLink = () => {
    if (affiliateStats?.referralLink) {
      navigator.clipboard.writeText(affiliateStats.referralLink);
      toast({ title: "Link copied!", description: "Share it with friends to earn 20% commission." });
    }
  };

  const handleUpgrade = async () => {
    setIsUpgrading(true);
    try {
      const response = await apiRequest("POST", "/api/checkout");
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({ title: "Unable to start checkout", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: error.message || "Checkout failed", variant: "destructive" });
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleChangeUsername = async () => {
    if (!newUsername.trim() || newUsername.trim().length < 3) {
      toast({ title: "Username must be at least 3 characters", variant: "destructive" });
      return;
    }
    
    setIsChangingUsername(true);
    try {
      const response = await apiRequest("POST", "/api/user/change-username", { newUsername: newUsername.trim() });
      const data = await response.json();
      toast({ title: "Username updated successfully" });
      setNewUsername("");
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    } catch (error: any) {
      toast({ title: error.message || "Failed to update username", variant: "destructive" });
    } finally {
      setIsChangingUsername(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      toast({ title: "Please enter your current password", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "New password must be at least 6 characters", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "New passwords don't match", variant: "destructive" });
      return;
    }
    
    setIsChangingPassword(true);
    try {
      await apiRequest("POST", "/api/user/change-password", { currentPassword, newPassword });
      toast({ title: "Password changed successfully" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast({ title: error.message || "Failed to change password", variant: "destructive" });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      toast({ title: "Please enter your password to confirm", variant: "destructive" });
      return;
    }
    
    setIsDeletingAccount(true);
    try {
      await apiRequest("POST", "/api/user/delete-account", { password: deletePassword });
      toast({ title: "Account deleted successfully" });
      setShowDeleteDialog(false);
      logoutMutation.mutate();
    } catch (error: any) {
      toast({ title: error.message || "Failed to delete account", variant: "destructive" });
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleCameraToggle = (enabled: boolean) => {
    setCameraEnabled(enabled);
    localStorage.setItem('margin_camera_enabled', enabled ? 'true' : 'false');
    toast({ 
      title: enabled ? "Camera enabled" : "Camera disabled",
      description: enabled ? "You can now use the camera to scan items" : "Camera access has been disabled"
    });
  };

  const handlePushToggle = async (enabled: boolean) => {
    if (enabled) {
      const success = await subscribePush();
      if (success) {
        toast({
          title: "Notifications enabled",
          description: "You'll receive alerts for price drops and scan results"
        });
      }
    } else {
      await unsubscribePush();
      toast({
        title: "Notifications disabled",
        description: "You won't receive push notifications anymore"
      });
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="p-4 pt-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Settings className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold">Settings</h1>
            <p className="text-sm text-muted-foreground">Personalize your experience</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Account Section */}
          <Card className="p-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Account</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{user?.username || "Guest"}</p>
                <div className="flex items-center gap-2 mt-1">
                  {isAdmin ? (
                    <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-500 border-amber-500/30">
                      <Crown className="w-3 h-3 mr-1" />
                      Admin
                    </Badge>
                  ) : isPro ? (
                    <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                      <Sparkles className="w-3 h-3 mr-1" />
                      Pro
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">Free</Badge>
                  )}
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </Card>

          {/* Quick Links */}
          <Card className="p-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Quick Links</h3>
            <div className="space-y-1">
              <Link href="/scans" className="flex items-center justify-between p-2 -mx-2 rounded-lg hover-elevate cursor-pointer" data-testid="link-history">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <History className="w-4 h-4 text-primary" />
                  </div>
                  <span className="font-medium">Scan History</span>
                </div>
                <span className="text-muted-foreground text-sm">View all scans</span>
              </Link>
              {isAdmin && (
                <Link href="/brands" className="flex items-center justify-between p-2 -mx-2 rounded-lg hover-elevate cursor-pointer" data-testid="link-brands">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Library className="w-4 h-4 text-primary" />
                    </div>
                    <span className="font-medium">Brand Library</span>
                  </div>
                  <span className="text-muted-foreground text-sm">Admin tool</span>
                </Link>
              )}
            </div>
          </Card>

          
          {/* Account Settings - Change Username & Password */}
          <Card className="p-4">
            <div 
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setShowAccountSettings(!showAccountSettings)}
              data-testid="button-toggle-account-settings"
            >
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Account Settings</h3>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Settings className="w-4 h-4" />
              </Button>
            </div>
            
            {showAccountSettings && (
              <div className="mt-4 space-y-6">
                {/* Change Username */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span>Change Username</span>
                  </div>
                  <div className="space-y-2">
                    <Input
                      placeholder="New username"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      data-testid="input-new-username"
                    />
                    <Button 
                      size="sm" 
                      onClick={handleChangeUsername}
                      disabled={isChangingUsername || !newUsername.trim()}
                      data-testid="button-change-username"
                    >
                      {isChangingUsername ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Update Username
                    </Button>
                  </div>
                </div>

                {/* Divider */}
                <div className="h-px bg-border" />

                {/* Change Password */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <KeyRound className="w-4 h-4 text-muted-foreground" />
                    <span>Change Password</span>
                  </div>
                  <div className="space-y-2">
                    <div className="relative">
                      <Input
                        type={showCurrentPassword ? "text" : "password"}
                        placeholder="Current password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        data-testid="input-current-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      >
                        {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                    <div className="relative">
                      <Input
                        type={showNewPassword ? "text" : "password"}
                        placeholder="New password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        data-testid="input-new-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                    <Input
                      type={showNewPassword ? "text" : "password"}
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      data-testid="input-confirm-password"
                    />
                    <Button 
                      size="sm" 
                      onClick={handleChangePassword}
                      disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
                      data-testid="button-change-password"
                    >
                      {isChangingPassword ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Update Password
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Category Profit Settings - Pro/Admin only */}
          {(isPro || isAdmin) && (
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Percent className="w-4 h-4 text-green-500" />
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Profit % by Category</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Set your target profit for each category. Higher % = lower max buy price.
              </p>
              <div className="space-y-4">
                {Object.entries(categoryProfits).map(([category, percent]) => (
                  <div key={category} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label className="text-sm">{category}</Label>
                      <span className="text-sm font-bold text-green-600">{percent}%</span>
                    </div>
                    <Slider
                      value={[percent]}
                      onValueChange={(values) => {
                        const newProfits = { ...categoryProfits, [category]: values[0] };
                        setCategoryProfits(newProfits);
                      }}
                      min={15}
                      max={50}
                      step={5}
                      className="w-full"
                      data-testid={`slider-profit-${category.toLowerCase().replace(/\s+/g, '-')}`}
                    />
                  </div>
                ))}
              </div>
              <Button
                className="w-full mt-4"
                onClick={() => saveCategoryProfitsMutation.mutate(categoryProfits)}
                disabled={saveCategoryProfitsMutation.isPending}
                data-testid="button-save-category-profits"
              >
                {saveCategoryProfitsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save Profit Settings
              </Button>
            </Card>
          )}

          {/* Pro Subscription Management - Only show for Pro users */}
          {isPro && !isAdmin && (
            <Card className="p-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Your Subscription</h3>
              <p className="text-sm text-muted-foreground mb-4">
                You're on the Pro plan with unlimited scans and permanent history.
              </p>
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => setShowCancellationFlow(true)}
                data-testid="button-manage-subscription"
              >
                Manage Subscription
              </Button>
            </Card>
          )}

          {/* Partner Program Section - Show for ALL users */}
          {affiliateStats && (
            <Card className="p-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                <div className="flex items-center gap-2">
                  <Share2 className="w-4 h-4" />
                  Margin Partner Program
                </div>
              </h3>
              <p className="text-sm text-muted-foreground mb-2">
                Earn recurring income for every reseller you refer.
              </p>
              <p className="text-xs text-muted-foreground/70 mb-4">
                Most affiliates earn monthly income as long as referrals stay active.
              </p>
              
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-primary">{affiliateStats.totalReferrals}</div>
                  <div className="text-xs text-muted-foreground">Referrals</div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-primary">{affiliateStats.proReferrals}</div>
                  <div className="text-xs text-muted-foreground">Pro Users</div>
                </div>
                <div className="text-center p-3 bg-muted/30 rounded-lg">
                  <div className="text-2xl font-bold text-green-500">${affiliateStats.totalEarned}</div>
                  <div className="text-xs text-muted-foreground">Earned</div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Your Referral Code</Label>
                  <div className="flex gap-2 mt-1 items-center">
                    <div className="flex-1 px-4 py-3 bg-primary/10 border border-primary/20 rounded-lg text-center">
                      <span className="text-2xl font-bold text-primary tracking-wider">{affiliateStats.referralCode}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Button 
                      variant="default" 
                      className="flex-1"
                      onClick={copyReferralLink}
                      data-testid="button-copy-referral"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copy Share Link
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground/70 mt-2 text-center">
                    Share your code and earn 20% on every Pro subscription
                  </p>
                </div>

                {parseFloat(affiliateStats.pendingEarnings) > 0 && (
                  <div className="flex items-center justify-between p-3 bg-amber-500/10 rounded-lg">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-amber-500" />
                      <span className="text-sm">Pending Payout</span>
                    </div>
                    <span className="font-bold text-amber-500">${affiliateStats.pendingEarnings}</span>
                  </div>
                )}

                {affiliateStats.recentEarnings.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Recent Earnings</Label>
                    {affiliateStats.recentEarnings.slice(0, 3).map((earning) => (
                      <div key={earning.id} className="flex items-center justify-between text-sm p-2 bg-muted/30 rounded">
                        <span className="text-muted-foreground">{earning.month}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">${earning.amount}</span>
                          <Badge variant="outline" className={earning.status === 'paid' ? 'text-green-500' : 'text-amber-500'}>
                            {earning.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                <Link href="/partner">
                  <Button variant="outline" className="w-full" data-testid="button-view-partner-dashboard">
                    View Full Partner Dashboard
                  </Button>
                </Link>
              </div>
            </Card>
          )}

          {/* Pro Upgrade - Only show for free users */}
          {!isPro && !isAdmin && (
            <Card className="p-5 border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-1">
                  <Crown className="w-5 h-5 text-primary" />
                  <h3 className="text-base font-bold">Go Pro</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Source faster. Flip smarter. Profit more.
                </p>
                <div className="space-y-3 mb-5">
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                      <Search className="w-3.5 h-3.5 text-green-400" />
                    </div>
                    <span>Unlimited scans — no daily limits</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                    </div>
                    <span>Deeper comps with higher confidence</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                      <History className="w-3.5 h-3.5 text-green-400" />
                    </div>
                    <span>Full history — never expires</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                      <Sliders className="w-3.5 h-3.5 text-green-400" />
                    </div>
                    <span>Batch scanning for faster sourcing</span>
                  </div>
                </div>
                <Button 
                  size="lg"
                  className="w-full font-semibold shadow-lg shadow-primary/25" 
                  onClick={handleUpgrade}
                  disabled={isUpgrading}
                  data-testid="button-upgrade-pro"
                >
                  {isUpgrading ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-5 h-5 mr-2" />
                  )}
                  {isUpgrading ? "Loading..." : "Upgrade to Pro — $24.99/mo"}
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-3">
                  Avoiding one bad flip pays for itself.
                </p>
              </div>
            </Card>
          )}

          {/* Appearance */}
          <Card className="p-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Appearance</h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {theme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                <span className="font-medium">Theme</span>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={toggleTheme}
                data-testid="button-toggle-theme"
              >
                {theme === 'dark' ? 'Light' : 'Dark'}
              </Button>
            </div>
          </Card>

          {/* Camera & Permissions */}
          <Card className="p-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Permissions</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Camera className="w-5 h-5" />
                  <div>
                    <span className="font-medium">Camera Access</span>
                    <p className="text-xs text-muted-foreground">Allow Margin to use your camera for scanning</p>
                  </div>
                </div>
                <Switch 
                  checked={cameraEnabled}
                  onCheckedChange={handleCameraToggle}
                  data-testid="switch-camera"
                />
              </div>
              {pushSupported && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Bell className="w-5 h-5" />
                    <div>
                      <span className="font-medium">Push Notifications</span>
                      <p className="text-xs text-muted-foreground">Get alerts for price drops and scan results</p>
                    </div>
                  </div>
                  <Switch 
                    checked={pushSubscribed}
                    onCheckedChange={handlePushToggle}
                    disabled={pushLoading}
                    data-testid="switch-push-notifications"
                  />
                </div>
              )}
            </div>
          </Card>

          {/* Data Export */}
          <Card className="p-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Your Data</h3>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Download all your scan history, inventory, and expenses in a portable format.
              </p>
              <Link href="/export">
                <Button variant="outline" className="w-full" data-testid="button-export-data">
                  <Download className="w-4 h-4 mr-2" />
                  Export Your Data
                </Button>
              </Link>
            </div>
          </Card>

          {/* Advanced Settings - Collapsible */}
          <Collapsible>
            <Card className="p-4">
              <CollapsibleTrigger className="flex items-center justify-between gap-2 w-full group" data-testid="trigger-advanced-settings">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Advanced</h3>
                </div>
                <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <p className="text-xs text-muted-foreground mt-2">
                Margin uses optimized defaults. Most users never need to change these.
              </p>
              
              <CollapsibleContent className="pt-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="risk-tolerance" className="text-sm">Risk Tolerance</Label>
                    <Select 
                      value={preferences.riskTolerance} 
                      onValueChange={(v) => updatePreference('riskTolerance', v as any)}
                    >
                      <SelectTrigger id="risk-tolerance" data-testid="select-risk-tolerance">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="conservative">Conservative</SelectItem>
                        <SelectItem value="balanced">Balanced</SelectItem>
                        <SelectItem value="aggressive">Aggressive</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {preferences.riskTolerance === 'conservative' 
                        ? "Fewer Flips, but higher confidence when you do."
                        : preferences.riskTolerance === 'aggressive'
                        ? "More Flips with higher upside, but more borderline calls too."
                        : "Balanced mix of confidence and opportunity."}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="default-fee" className="text-sm">Default Platform Fee</Label>
                    <Select 
                      value={String(preferences.defaultFeeRate)} 
                      onValueChange={(v) => updatePreference('defaultFeeRate', parseFloat(v))}
                    >
                      <SelectTrigger id="default-fee" data-testid="select-default-fee">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0.10">10% (Basic seller)</SelectItem>
                        <SelectItem value="0.13">13% (Standard)</SelectItem>
                        <SelectItem value="0.15">15% (With promoted listings)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="default-shipping" className="text-sm">Default Outbound Shipping</Label>
                    <Select 
                      value={String(preferences.defaultOutboundShipping)} 
                      onValueChange={(v) => updatePreference('defaultOutboundShipping', parseFloat(v))}
                    >
                      <SelectTrigger id="default-shipping" data-testid="select-default-shipping">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">$0 (Buyer pays shipping)</SelectItem>
                        <SelectItem value="5">$5 (Small/light items)</SelectItem>
                        <SelectItem value="8">$8 (Standard)</SelectItem>
                        <SelectItem value="12">$12 (Medium boxes)</SelectItem>
                        <SelectItem value="15">$15 (Large/heavy)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Tax-Ready P&L Export - Pro Feature */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tax-Ready P&L Export</h3>
              {(isPro || isAdmin) ? (
                <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                  <Crown className="w-3 h-3 mr-1" />
                  Pro
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs">
                  <Lock className="w-3 h-3 mr-1" />
                  Pro Only
                </Badge>
              )}
            </div>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Export clean, accountant-ready data for QuickBooks or Excel. Perfect for tax season.
              </p>
              {(isPro || isAdmin) ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    window.location.href = '/api/exports/pnl';
                  }}
                  data-testid="button-export-pnl"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Download P&L Report (CSV)
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="w-full opacity-60"
                  onClick={handleUpgrade}
                  disabled={isUpgrading}
                  data-testid="button-export-pnl-locked"
                >
                  <Lock className="w-4 h-4 mr-2" />
                  Upgrade to Export
                </Button>
              )}
              <p className="text-xs text-muted-foreground/70">
                Includes: item names, dates, costs, sale prices, fees, shipping, and net profit.
              </p>
            </div>
          </Card>

          {/* About */}
          <Card className="p-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">About</h3>
            <div className="text-sm text-muted-foreground space-y-3">
              <div>
                <p className="font-medium text-foreground">Margin v1.0</p>
                <p className="mt-1">Your reselling analysis partner.</p>
              </div>
              
              <button
                onClick={() => {
                  localStorage.removeItem('margin_welcome_shown');
                  window.location.href = '/deep-scan';
                }}
                className="w-full flex items-center justify-between p-2 -mx-2 rounded-lg hover-elevate cursor-pointer"
                data-testid="button-replay-onboarding"
              >
                <span className="font-medium text-foreground">Replay Onboarding</span>
                <span className="text-muted-foreground text-sm">View tutorial</span>
              </button>
              
              <div className="pt-3 border-t border-border">
                <p className="font-medium text-foreground mb-2">Early Access</p>
                <p className="text-xs leading-relaxed">
                  Margin is in early access. Pricing confidence and match accuracy improve continuously as the visual library grows and more real-world data is observed.
                </p>
                <p className="text-xs leading-relaxed mt-2">
                  Always use "Pay up to" guidance as a decision aid — final purchase decisions remain with the buyer.
                </p>
              </div>
            </div>
          </Card>

          {/* Support & Legal */}
          <Card className="p-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Support & Legal</h3>
            <div className="space-y-1">
              <Link href="/support" className="flex items-center justify-between p-2 -mx-2 rounded-lg hover-elevate cursor-pointer" data-testid="link-support">
                <span className="font-medium">Contact Support</span>
                <span className="text-muted-foreground text-sm">Get help</span>
              </Link>
              <Link href="/privacy" className="flex items-center justify-between p-2 -mx-2 rounded-lg hover-elevate cursor-pointer" data-testid="link-privacy">
                <span className="font-medium">Privacy Policy</span>
                <span className="text-muted-foreground text-sm">View</span>
              </Link>
              <Link href="/terms" className="flex items-center justify-between p-2 -mx-2 rounded-lg hover-elevate cursor-pointer" data-testid="link-terms">
                <span className="font-medium">Terms of Service</span>
                <span className="text-muted-foreground text-sm">View</span>
              </Link>
            </div>
            <p className="text-xs text-muted-foreground mt-3 text-center">
              Margin v1.0 • Made for resellers, by resellers
            </p>
          </Card>

          {/* Danger Zone - Delete Account */}
          <Card className="p-4 border-destructive/30">
            <h3 className="text-xs font-bold text-destructive uppercase tracking-wider mb-3">Danger Zone</h3>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Permanently delete your account and all associated data. This action cannot be undone.
              </p>
              <Button 
                variant="destructive" 
                className="w-full"
                onClick={() => setShowDeleteDialog(true)}
                data-testid="button-delete-account"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Account
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Delete Account Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete Account
            </DialogTitle>
            <DialogDescription>
              This will permanently delete your account and all your data including:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>All scan history</li>
                <li>Inventory items</li>
                <li>Expense records</li>
                <li>Achievements and stats</li>
              </ul>
              <p className="mt-3 font-medium text-foreground">This cannot be undone.</p>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="delete-password">Enter your password to confirm</Label>
              <Input 
                id="delete-password"
                type="password"
                placeholder="Your password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                data-testid="input-delete-password"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowDeleteDialog(false);
                setDeletePassword("");
              }}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={isDeletingAccount || !deletePassword}
              data-testid="button-confirm-delete"
            >
              {isDeletingAccount ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              {isDeletingAccount ? "Deleting..." : "Delete Forever"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CancellationFlow 
        open={showCancellationFlow} 
        onClose={() => setShowCancellationFlow(false)} 
      />

      <BottomNav />
    </div>
  );
}
