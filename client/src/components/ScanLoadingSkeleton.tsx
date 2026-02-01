import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";

interface ScanLoadingSkeletonProps {
  variant?: 'identifying' | 'analyzing' | 'pricing';
  imageUrl?: string;
}

export function ScanLoadingSkeleton({ variant = 'identifying', imageUrl }: ScanLoadingSkeletonProps) {
  const messages = {
    identifying: ["Reading the item...", "Checking visual library...", "Matching patterns..."],
    analyzing: ["Finding sold comps...", "Calculating median price...", "Checking profit margins..."],
    pricing: ["Running decision engine...", "Generating recommendation...", "Almost ready..."]
  };

  return (
    <Card className="p-6">
      <div className="flex flex-col items-center">
        {imageUrl && (
          <div className="w-24 h-32 rounded-xl overflow-hidden mb-4 ring-2 ring-primary/20">
            <img src={imageUrl} alt="Scanning" className="w-full h-full object-cover" />
          </div>
        )}
        
        <div className="relative w-16 h-16 mb-4">
          <motion.div
            className="absolute inset-0 rounded-full border-4 border-primary/20"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <motion.div
            className="absolute inset-2 rounded-full border-4 border-t-primary border-r-transparent border-b-transparent border-l-transparent"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute inset-4 rounded-full bg-primary/10"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        </div>

        <motion.p
          className="text-sm font-medium text-foreground mb-1"
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          {messages[variant][0]}
        </motion.p>
        <p className="text-xs text-muted-foreground">This usually takes 3-5 seconds</p>
      </div>

      <div className="mt-6 space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-4 flex-1" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-border/50">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
      </div>
    </Card>
  );
}

export function ItemCardSkeleton() {
  return (
    <Card className="p-4">
      <div className="flex justify-between items-start mb-3">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-5 w-full mb-2" />
      <Skeleton className="h-5 w-3/4 mb-3" />
      <div className="flex gap-2 mb-4">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="pt-3 border-t border-border/50">
        <div className="flex justify-between items-center">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-6 w-16" />
        </div>
      </div>
    </Card>
  );
}

export function HistoryPageSkeleton() {
  return (
    <div className="px-4 py-6 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <ItemCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
