import { Link, useLocation } from "wouter";
import { Clock, ScanLine, Package, Settings, BarChart3, Library, ShoppingBag, History, Shuffle, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

export function BottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  const isPro = user?.subscriptionTier === 'pro' || user?.isAdmin;

  const navItems = [
    { href: "/deep-scan", icon: ScanLine, label: "Scan", proOnly: false, adminOnly: false },
    { href: "/inventory", icon: Package, label: "Inventory", proOnly: false, adminOnly: false },
    { href: "/dashboard", icon: Target, label: "Goals", proOnly: false, adminOnly: false },
    { href: "/scans", icon: History, label: "History", proOnly: false, adminOnly: false },
    { href: "/settings", icon: Settings, label: "Settings", proOnly: false, adminOnly: false },
  ];

  const visibleItems = navItems.filter(item => 
    (!item.proOnly || isPro) && (!item.adminOnly || user?.isAdmin)
  );

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border safe-area-bottom">
      <div className="flex justify-around items-center h-16 max-w-md mx-auto px-2">
        {visibleItems.map(({ href, icon: Icon, label }) => {
          const isActive = location === href;
          return (
            <Link key={href} href={href} className={cn(
              "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors duration-100 active:opacity-70",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}>
                <div className={cn(
                  "p-1.5 rounded-lg transition-colors duration-100",
                  isActive && "bg-primary/15"
                )}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className={cn("text-[10px] font-semibold", isActive && "text-primary")}>{label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
