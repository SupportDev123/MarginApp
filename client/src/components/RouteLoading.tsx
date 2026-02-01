import { Loader2 } from "lucide-react";

/**
 * Lightweight loading fallback for lazy-loaded routes
 * Shown while route chunks are being downloaded
 */
export function RouteLoading() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
