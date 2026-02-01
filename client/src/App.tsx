import { Switch, Route, Redirect } from "wouter";
import { lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ThemeProvider } from "@/hooks/use-theme";
import { PreferencesProvider } from "@/hooks/use-preferences";
import { Loader2 } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { InstallPrompt } from "@/components/InstallPrompt";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { WelcomeDialog } from "@/components/WelcomeDialog";
import { FeedbackGate } from "@/components/FeedbackGate";
import { RouteLoading } from "@/components/RouteLoading";

// Critical pages - loaded immediately
import AuthPage from "@/pages/AuthPage";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";
import SupportPage from "@/pages/SupportPage";
import NotFound from "@/pages/not-found";

// Lazy-loaded pages - split into separate chunks
const ScansPage = lazy(() => import("@/pages/ScansPage"));
const AnalyzePage = lazy(() => import("@/pages/AnalyzePage"));
const BatchScanPage = lazy(() => import("@/pages/BatchScanPage"));
const YardSaleMode = lazy(() => import("@/pages/YardSaleMode"));
const ItemDetails = lazy(() => import("@/pages/ItemDetails"));
const InventoryPage = lazy(() => import("@/pages/InventoryPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const CookbooksPage = lazy(() => import("@/pages/CookbooksPage"));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage"));
const PartnerPage = lazy(() => import("@/pages/PartnerPage"));
const StatsPage = lazy(() => import("@/pages/StatsPage"));
const AnalyticsPage = lazy(() => import("@/pages/AnalyticsPage"));
const BrandLibraryPage = lazy(() => import("@/pages/BrandLibraryPage"));
const BrandDetailPage = lazy(() => import("@/pages/BrandDetailPage"));
const StreamOverlay = lazy(() => import("@/pages/StreamOverlay"));
const LiveCapture = lazy(() => import("@/pages/LiveCapture"));
const LibraryAdminPage = lazy(() => import("@/pages/LibraryAdminPage"));
const BulkImageUpload = lazy(() => import("@/pages/BulkImageUpload"));
const ARProfitOverlay = lazy(() => import("@/pages/ARProfitOverlay"));
const ProfitDashboard = lazy(() => import("@/pages/ProfitDashboard"));
const OpenMarketSearch = lazy(() => import("@/pages/OpenMarketSearch"));
const ExportPage = lazy(() => import("@/pages/ExportPage"));
const ExpensesPage = lazy(() => import("@/pages/ExpensesPage"));
const AppStoreChecklist = lazy(() => import("@/pages/AppStoreChecklist"));
const CardGradingPage = lazy(() => import("@/pages/CardGradingPage"));
const SportsMemorabiliaPage = lazy(() => import("@/pages/SportsMemorabiliaPage"));

// Protected Route Wrapper - wraps lazy components with Suspense + auth checks
function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <Suspense fallback={<RouteLoading />}>
      <Component />
    </Suspense>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route path="/reset-password">
        <Suspense fallback={<RouteLoading />}>
          <ResetPasswordPage />
        </Suspense>
      </Route>

      {/* Deep Scan - full URL/camera analysis with detailed comps */}
      <Route path="/deep-scan">
        <ProtectedRoute component={AnalyzePage} />
      </Route>

      {/* Legacy redirect for old analyze URL */}
      <Route path="/analyze">
        <Redirect to="/deep-scan" />
      </Route>

      <Route path="/batch">
        <ProtectedRoute component={BatchScanPage} />
      </Route>

      <Route path="/yard-sale">
        <ProtectedRoute component={YardSaleMode} />
      </Route>

      <Route path="/scans">
        <ProtectedRoute component={ScansPage} />
      </Route>

      <Route path="/history">
        <Redirect to="/scans" />
      </Route>

      <Route path="/item/:id">
        <ProtectedRoute component={ItemDetails} />
      </Route>

      <Route path="/inventory">
        <ProtectedRoute component={InventoryPage} />
      </Route>

      <Route path="/expenses">
        <ProtectedRoute component={ExpensesPage} />
      </Route>

      <Route path="/settings">
        <ProtectedRoute component={SettingsPage} />
      </Route>

      <Route path="/export">
        <ProtectedRoute component={ExportPage} />
      </Route>

      <Route path="/partner">
        <ProtectedRoute component={PartnerPage} />
      </Route>

      <Route path="/stats">
        <ProtectedRoute component={StatsPage} />
      </Route>

      <Route path="/analytics">
        <ProtectedRoute component={AnalyticsPage} />
      </Route>

      <Route path="/guides">
        <ProtectedRoute component={CookbooksPage} />
      </Route>

      <Route path="/cookbooks">
        <Redirect to="/guides" />
      </Route>

      <Route path="/brands">
        <ProtectedRoute component={BrandLibraryPage} />
      </Route>

      <Route path="/brands/:slug">
        <ProtectedRoute component={BrandDetailPage} />
      </Route>


      {/* Stream Overlay - standalone page for OBS/streaming */}
      <Route path="/stream-overlay">
        <Suspense fallback={<RouteLoading />}>
          <StreamOverlay />
        </Suspense>
      </Route>

      {/* Live Capture - HIDDEN until feature is production-ready
      <Route path="/live-capture" component={LiveCapture} />
      */}

      {/* Card Grading - AI-powered condition assessment */}
      <Route path="/card-grading">
        <ProtectedRoute component={CardGradingPage} />
      </Route>

      {/* Sports Memorabilia - jerseys, helmets, signed balls */}
      <Route path="/sports-memorabilia">
        <ProtectedRoute component={SportsMemorabiliaPage} />
      </Route>

      {/* Main Scan - camera-based profit scanning (MarginPulse) */}
      <Route path="/scan">
        <ProtectedRoute component={ARProfitOverlay} />
      </Route>

      {/* Legacy redirects for old URLs */}
      <Route path="/pulse">
        <Redirect to="/scan" />
      </Route>
      <Route path="/ar-scan">
        <Redirect to="/scan" />
      </Route>

      {/* Profit Dashboard - gamification and goals */}
      <Route path="/dashboard">
        <ProtectedRoute component={ProfitDashboard} />
      </Route>

      {/* Open Market Search - catch-all for Other category */}
      <Route path="/open-market">
        <ProtectedRoute component={OpenMarketSearch} />
      </Route>

      {/* Admin: Visual Matching Library */}
      <Route path="/admin/library">
        <ProtectedRoute component={LibraryAdminPage} />
      </Route>

      {/* Admin: Bulk Image Upload */}
      <Route path="/admin/bulk-upload">
        <ProtectedRoute component={BulkImageUpload} />
      </Route>

      {/* App Store Readiness Checklist */}
      <Route path="/app-store-checklist">
        <ProtectedRoute component={AppStoreChecklist} />
      </Route>

      {/* Legal Pages - public */}
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/terms" component={TermsOfService} />
      <Route path="/support" component={SupportPage} />

      <Route path="/">
        <Redirect to="/deep-scan" />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <PreferencesProvider>
          <AuthProvider>
            <TooltipProvider>
              <Router />
              <Toaster />
              <InstallPrompt />
              <OfflineIndicator />
              <WelcomeDialog />
              <FeedbackGate />
            </TooltipProvider>
          </AuthProvider>
        </PreferencesProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
