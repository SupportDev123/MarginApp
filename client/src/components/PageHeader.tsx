import { Link } from "wouter";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="flex-1">
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {subtitle && (
          <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {children}
        <Link href="/settings">
          <Button 
            size="icon" 
            variant="ghost" 
            className="text-muted-foreground"
            data-testid="button-settings"
          >
            <Settings className="w-5 h-5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
