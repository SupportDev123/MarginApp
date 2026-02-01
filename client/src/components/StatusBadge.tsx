import { cn } from "@/lib/utils";

type Status = "FLIP" | "SKIP" | "BUY" | "PASS" | "PROFITABLE" | "RISKY" | "MARGINAL";

interface StatusBadgeProps {
  status: string;
  className?: string;
  size?: "sm" | "lg";
}

export function StatusBadge({ status, className, size = "sm" }: StatusBadgeProps) {
  const normalizedStatus = status.toUpperCase() as Status;
  
  // Map all statuses to binary FLIP/SKIP decisions
  const binaryStatus = (() => {
    switch (normalizedStatus) {
      case 'BUY':
      case 'PROFITABLE':
      case 'FLIP':
        return 'FLIP';
      case 'PASS':
      case 'RISKY':
      case 'MARGINAL':
      case 'SKIP':
      default:
        return 'SKIP';
    }
  })();
  
  const variants: Record<string, string> = {
    FLIP: "bg-buy/15 text-buy border-buy/20",
    SKIP: "bg-pass/15 text-pass border-pass/20",
  };

  const displayLabels: Record<string, string> = {
    FLIP: "FLIP IT!",
    SKIP: "SKIP IT!",
  };

  const sizes = {
    sm: "px-2.5 py-0.5 text-xs rounded-md",
    lg: "px-4 py-1.5 text-lg rounded-lg font-bold tracking-wide",
  };

  return (
    <span className={cn(
      "inline-flex items-center justify-center font-semibold border",
      variants[binaryStatus],
      sizes[size],
      className
    )}>
      {displayLabels[binaryStatus]}
    </span>
  );
}
