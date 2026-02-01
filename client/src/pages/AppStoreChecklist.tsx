import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Check, 
  X, 
  AlertCircle, 
  Smartphone, 
  Apple, 
  Chrome,
  FileText,
  Image,
  Shield,
  Globe,
  Zap,
  ExternalLink,
  Copy,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { SiAndroid } from "react-icons/si";
import { BottomNav } from "@/components/BottomNav";

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  status: "complete" | "partial" | "todo";
  category: string;
  howTo?: string;
  link?: string;
}

const pwaChecklist: ChecklistItem[] = [
  {
    id: "manifest",
    title: "Web App Manifest",
    description: "manifest.json with name, icons, theme color, and display mode",
    status: "complete",
    category: "Core PWA",
    howTo: "Already configured at /manifest.json"
  },
  {
    id: "https",
    title: "HTTPS Enabled",
    description: "App served over secure HTTPS connection",
    status: "complete",
    category: "Core PWA",
    howTo: "Replit handles HTTPS automatically"
  },
  {
    id: "service-worker",
    title: "Service Worker",
    description: "Registered service worker for offline caching",
    status: "complete",
    category: "Core PWA",
    howTo: "Already configured with Vite PWA plugin"
  },
  {
    id: "icons-192",
    title: "192x192 Icon",
    description: "Required icon size for Android home screen",
    status: "complete",
    category: "Icons"
  },
  {
    id: "icons-512",
    title: "512x512 Icon",
    description: "Required icon size for splash screens",
    status: "complete",
    category: "Icons"
  },
  {
    id: "icons-1024",
    title: "1024x1024 Icon",
    description: "High-res icon for App Store listing",
    status: "complete",
    category: "Icons"
  },
  {
    id: "screenshots",
    title: "App Screenshots",
    description: "Screenshots for store listings (phone + tablet)",
    status: "todo",
    category: "Store Assets",
    howTo: "Capture 5-8 screenshots showing key features: scanning, flip verdict, inventory, expenses"
  },
  {
    id: "feature-graphic",
    title: "Feature Graphic (1024x500)",
    description: "Banner image for Google Play Store",
    status: "todo",
    category: "Store Assets",
    howTo: "Create promotional banner showing app in action"
  },
  {
    id: "privacy-policy",
    title: "Privacy Policy",
    description: "Published privacy policy with URL",
    status: "complete",
    category: "Legal",
    link: "/privacy"
  },
  {
    id: "terms",
    title: "Terms of Service",
    description: "Published terms of service",
    status: "complete",
    category: "Legal",
    link: "/terms"
  },
  {
    id: "offline",
    title: "Offline Functionality",
    description: "App works offline with cached data",
    status: "complete",
    category: "Core PWA",
    howTo: "Recent scans cached via IndexedDB"
  }
];

const androidChecklist: ChecklistItem[] = [
  {
    id: "google-dev",
    title: "Google Play Developer Account",
    description: "$25 one-time registration fee",
    status: "todo",
    category: "Account Setup",
    link: "https://play.google.com/console",
    howTo: "Create account at play.google.com/console"
  },
  {
    id: "bubblewrap",
    title: "Install Bubblewrap CLI",
    description: "Google's official tool for TWA packaging",
    status: "todo",
    category: "Build Setup",
    howTo: "npm i -g @bubblewrap/cli"
  },
  {
    id: "assetlinks",
    title: "Digital Asset Links",
    description: "assetlinks.json for TWA verification",
    status: "todo",
    category: "Build Setup",
    howTo: "Upload .well-known/assetlinks.json to verify app ownership"
  },
  {
    id: "signing-key",
    title: "App Signing Key",
    description: "Keep signing key safe for all future updates",
    status: "todo",
    category: "Build Setup",
    howTo: "Bubblewrap creates this during init. NEVER lose this key!"
  },
  {
    id: "aab-build",
    title: "Android App Bundle (.aab)",
    description: "Build AAB file for Play Store upload",
    status: "todo",
    category: "Build",
    howTo: "Run: bubblewrap build"
  },
  {
    id: "play-listing",
    title: "Play Store Listing",
    description: "App name, description, screenshots, category",
    status: "todo",
    category: "Store Setup"
  },
  {
    id: "content-rating",
    title: "Content Rating",
    description: "Complete content rating questionnaire",
    status: "todo",
    category: "Store Setup"
  },
  {
    id: "play-submit",
    title: "Submit for Review",
    description: "Upload AAB and submit to production track",
    status: "todo",
    category: "Launch"
  }
];

const iosChecklist: ChecklistItem[] = [
  {
    id: "apple-dev",
    title: "Apple Developer Account",
    description: "$99/year subscription required",
    status: "todo",
    category: "Account Setup",
    link: "https://developer.apple.com",
    howTo: "Enroll at developer.apple.com"
  },
  {
    id: "mac-xcode",
    title: "Mac with Xcode",
    description: "Required for building and submitting iOS apps",
    status: "todo",
    category: "Build Setup",
    howTo: "Install Xcode from Mac App Store"
  },
  {
    id: "pwabuilder",
    title: "Generate iOS Package",
    description: "Use PWABuilder to create Xcode project",
    status: "todo",
    category: "Build Setup",
    link: "https://www.pwabuilder.com",
    howTo: "Visit pwabuilder.com, enter your URL, download iOS package"
  },
  {
    id: "bundle-id",
    title: "Configure Bundle ID",
    description: "Unique app identifier (e.g., com.margin.app)",
    status: "todo",
    category: "Build Setup",
    howTo: "Set in Xcode project settings"
  },
  {
    id: "code-signing",
    title: "Code Signing",
    description: "Configure certificates and provisioning profiles",
    status: "todo",
    category: "Build Setup",
    howTo: "Set up in Xcode Signing & Capabilities"
  },
  {
    id: "ios-screenshots",
    title: "iOS Screenshots",
    description: "Screenshots for iPhone and iPad (multiple sizes)",
    status: "todo",
    category: "Store Assets",
    howTo: "6.7\" (iPhone 15 Pro Max), 6.5\" (iPhone 11 Pro Max), 5.5\" (iPhone 8 Plus), iPad Pro"
  },
  {
    id: "appstore-connect",
    title: "App Store Connect Setup",
    description: "Create app listing with metadata",
    status: "todo",
    category: "Store Setup",
    link: "https://appstoreconnect.apple.com"
  },
  {
    id: "ios-build",
    title: "Archive & Upload",
    description: "Build archive and upload via Xcode",
    status: "todo",
    category: "Build",
    howTo: "Product > Archive, then Distribute App"
  },
  {
    id: "ios-submit",
    title: "Submit for Review",
    description: "Submit to App Store review (24-48 hours)",
    status: "todo",
    category: "Launch"
  }
];

function ChecklistSection({ items, title }: { items: ChecklistItem[], title: string }) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  
  const toggleItem = (id: string) => {
    const newSet = new Set(expandedItems);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedItems(newSet);
  };
  
  const categories = Array.from(new Set(items.map(item => item.category)));
  const completedCount = items.filter(i => i.status === "complete").length;
  const progress = (completedCount / items.length) * 100;
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{title}</h3>
        <Badge variant={progress === 100 ? "default" : "secondary"}>
          {completedCount}/{items.length} Complete
        </Badge>
      </div>
      
      <Progress value={progress} className="h-2" />
      
      {categories.map(category => (
        <div key={category} className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">{category}</h4>
          {items.filter(i => i.category === category).map(item => (
            <Card 
              key={item.id} 
              className={`cursor-pointer transition-colors ${
                item.status === "complete" ? "bg-green-500/5 border-green-500/20" : ""
              }`}
              onClick={() => toggleItem(item.id)}
              data-testid={`checklist-item-${item.id}`}
            >
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {item.status === "complete" ? (
                      <Check className="w-5 h-5 text-green-500" />
                    ) : item.status === "partial" ? (
                      <AlertCircle className="w-5 h-5 text-amber-500" />
                    ) : (
                      <X className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{item.title}</span>
                      {expandedItems.has(item.id) ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                    
                    {expandedItems.has(item.id) && (item.howTo || item.link) && (
                      <div className="mt-3 p-2 rounded bg-secondary/50 space-y-2">
                        {item.howTo && (
                          <p className="text-xs">{item.howTo}</p>
                        )}
                        {item.link && (
                          <a 
                            href={item.link} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs text-primary flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Open Link <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function AppStoreChecklist() {
  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center px-4">
          <h1 className="text-lg font-semibold">App Store Readiness</h1>
        </div>
      </header>
      
      <main className="container px-4 py-6 space-y-6">
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Smartphone className="w-8 h-8 text-primary shrink-0" />
              <div>
                <h2 className="font-semibold">Publish Margin to App Stores</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Follow this checklist to publish your PWA to Google Play Store and Apple App Store.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <div className="grid gap-4 md:grid-cols-3">
          <Card data-testid="stat-pwa">
            <CardContent className="p-4 flex items-center gap-3">
              <Globe className="w-8 h-8 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">
                  {pwaChecklist.filter(i => i.status === "complete").length}/{pwaChecklist.length}
                </div>
                <div className="text-xs text-muted-foreground">PWA Ready</div>
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="stat-android">
            <CardContent className="p-4 flex items-center gap-3">
              <SiAndroid className="w-8 h-8 text-green-500" />
              <div>
                <div className="text-2xl font-bold">
                  {androidChecklist.filter(i => i.status === "complete").length}/{androidChecklist.length}
                </div>
                <div className="text-xs text-muted-foreground">Android Ready</div>
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="stat-ios">
            <CardContent className="p-4 flex items-center gap-3">
              <Apple className="w-8 h-8 text-foreground" />
              <div>
                <div className="text-2xl font-bold">
                  {iosChecklist.filter(i => i.status === "complete").length}/{iosChecklist.length}
                </div>
                <div className="text-xs text-muted-foreground">iOS Ready</div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <Tabs defaultValue="pwa" className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="pwa" className="gap-1" data-testid="tab-pwa">
              <Globe className="w-4 h-4" />
              PWA
            </TabsTrigger>
            <TabsTrigger value="android" className="gap-1" data-testid="tab-android">
              <SiAndroid className="w-4 h-4" />
              Android
            </TabsTrigger>
            <TabsTrigger value="ios" className="gap-1" data-testid="tab-ios">
              <Apple className="w-4 h-4" />
              iOS
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="pwa" className="mt-4">
            <ChecklistSection items={pwaChecklist} title="PWA Requirements" />
          </TabsContent>
          
          <TabsContent value="android" className="mt-4">
            <Card className="mb-4 bg-green-500/10 border-green-500/20">
              <CardContent className="p-4">
                <h3 className="font-medium flex items-center gap-2">
                  <Zap className="w-4 h-4 text-green-500" />
                  Android is Easier!
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Google Play supports PWAs via Trusted Web Activity (TWA). One-time $25 fee. 
                  Approval usually takes a few hours to days.
                </p>
              </CardContent>
            </Card>
            <ChecklistSection items={androidChecklist} title="Google Play Store" />
          </TabsContent>
          
          <TabsContent value="ios" className="mt-4">
            <Card className="mb-4 bg-amber-500/10 border-amber-500/20">
              <CardContent className="p-4">
                <h3 className="font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  iOS is Stricter
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Apple requires a Mac, $99/year fee, and often rejects "simple wrappers." 
                  Make sure the app provides genuine value beyond just a web view.
                </p>
              </CardContent>
            </Card>
            <ChecklistSection items={iosChecklist} title="Apple App Store" />
          </TabsContent>
        </Tabs>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Commands</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 rounded-lg bg-secondary/50 font-mono text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-muted-foreground">Install Bubblewrap</span>
                <Button size="icon" variant="ghost" className="h-6 w-6" data-testid="button-copy-bubblewrap">
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
              <code>npm i -g @bubblewrap/cli</code>
            </div>
            
            <div className="p-3 rounded-lg bg-secondary/50 font-mono text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-muted-foreground">Initialize Android Project</span>
              </div>
              <code>bubblewrap init --manifest https://yoursite.com/manifest.json</code>
            </div>
            
            <div className="p-3 rounded-lg bg-secondary/50 font-mono text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-muted-foreground">Build Android App Bundle</span>
              </div>
              <code>bubblewrap build</code>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Helpful Links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <a 
              href="https://www.pwabuilder.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2 rounded hover-elevate"
              data-testid="link-pwabuilder"
            >
              <Globe className="w-4 h-4 text-primary" />
              <span className="text-sm">PWABuilder (iOS + Android packages)</span>
              <ExternalLink className="w-3 h-3 ml-auto text-muted-foreground" />
            </a>
            <a 
              href="https://play.google.com/console" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2 rounded hover-elevate"
              data-testid="link-play-console"
            >
              <SiAndroid className="w-4 h-4 text-green-500" />
              <span className="text-sm">Google Play Console</span>
              <ExternalLink className="w-3 h-3 ml-auto text-muted-foreground" />
            </a>
            <a 
              href="https://appstoreconnect.apple.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2 rounded hover-elevate"
              data-testid="link-appstore-connect"
            >
              <Apple className="w-4 h-4" />
              <span className="text-sm">App Store Connect</span>
              <ExternalLink className="w-3 h-3 ml-auto text-muted-foreground" />
            </a>
            <a 
              href="https://developer.apple.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-2 rounded hover-elevate"
              data-testid="link-apple-dev"
            >
              <Apple className="w-4 h-4" />
              <span className="text-sm">Apple Developer Program</span>
              <ExternalLink className="w-3 h-3 ml-auto text-muted-foreground" />
            </a>
          </CardContent>
        </Card>
      </main>
      
      <BottomNav />
    </div>
  );
}
