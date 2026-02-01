import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, X, DollarSign, TrendingUp, ExternalLink } from "lucide-react";
import { parseMoney, computeCompsStats } from "@/lib/comps";

interface ManualCompsInputProps {
  value: string[];
  onChange: (comps: string[]) => void;
  maxComps?: number;
  itemTitle?: string;
}

export function ManualCompsInput({ value, onChange, maxComps = 5, itemTitle }: ManualCompsInputProps) {
  const [inputValue, setInputValue] = useState("");
  
  const openEbaySoldSearch = () => {
    if (!itemTitle) return;
    const searchQuery = encodeURIComponent(itemTitle);
    const ebayUrl = `https://www.ebay.com/sch/i.html?_nkw=${searchQuery}&LH_Complete=1&LH_Sold=1&_sop=13`;
    window.open(ebayUrl, '_blank');
  };
  
  // Defensive: ensure value is always an array
  const safeValue = Array.isArray(value) ? value : [];
  const safeLength = safeValue.length;

  const handleAdd = () => {
    try {
      const parsed = parseMoney(inputValue);
      if (parsed !== null && !isNaN(parsed) && isFinite(parsed) && parsed > 0 && safeLength < maxComps) {
        onChange([...safeValue, inputValue.trim()]);
        setInputValue("");
      }
    } catch (err) {
      console.error("MANUAL COMPS - handleAdd error:", err);
    }
  };

  const handleRemove = (index: number) => {
    try {
      onChange(safeValue.filter((_, i) => i !== index));
    } catch (err) {
      console.error("MANUAL COMPS - handleRemove error:", err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  // Defensive: safely parse prices and compute stats
  let parsedPrices: number[] = [];
  let stats: ReturnType<typeof computeCompsStats> = null;
  try {
    parsedPrices = safeValue
      .map(v => parseMoney(v))
      .filter((p): p is number => p !== null && !isNaN(p) && isFinite(p) && p > 0);
    if (parsedPrices.length >= 3) {
      stats = computeCompsStats(parsedPrices);
    }
  } catch (err) {
    console.error("MANUAL COMPS - stats calculation error:", err);
  }
  
  // Safe number formatter
  const safeFixed = (val: number | null | undefined, decimals: number = 2): string => {
    if (val === null || val === undefined || isNaN(val) || !isFinite(val)) return "0.00";
    return val.toFixed(decimals);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-primary" />
          Manual Sold Comps
        </label>
        <Badge variant="outline" className="text-xs" data-testid="badge-comp-count">
          {safeLength}/{maxComps}
        </Badge>
      </div>
      
      <p className="text-xs text-muted-foreground">
        Enter 3-5 recently sold prices from eBay to calculate profit potential.
      </p>
      
      {itemTitle && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openEbaySoldSearch}
          className="w-full text-xs"
          data-testid="button-search-ebay-comps"
        >
          <ExternalLink className="w-3 h-3 mr-1.5" />
          Search eBay Sold Listings
        </Button>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            inputMode="decimal"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. 49.99"
            className="pl-9"
            disabled={safeLength >= maxComps}
            data-testid="input-manual-comp"
          />
        </div>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          onClick={handleAdd}
          disabled={!inputValue || safeLength >= maxComps || parseMoney(inputValue) === null}
          data-testid="button-add-comp"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {safeLength > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="comps-list">
          {safeValue.map((comp, i) => (
            <Badge
              key={i}
              variant="secondary"
              className="pl-2.5 pr-1 py-1 flex items-center gap-1"
              data-testid={`badge-comp-${i}`}
            >
              ${safeFixed(parseMoney(comp))}
              <button
                type="button"
                onClick={() => handleRemove(i)}
                className="ml-1 hover:bg-destructive/20 rounded p-0.5"
                data-testid={`button-remove-comp-${i}`}
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {stats && (
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-1" data-testid="comps-preview-stats">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Avg:</span>
            <span className="font-medium">${safeFixed(stats.avg)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Median:</span>
            <span className="font-medium">${safeFixed(stats.median)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Range:</span>
            <span className="font-medium">${safeFixed(stats.min)} - ${safeFixed(stats.max)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Spread:</span>
            <span className="font-medium">{safeFixed(stats.spread, 1)}%</span>
          </div>
        </div>
      )}

      {safeLength > 0 && safeLength < 3 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Add at least 3 comps for reliable stats.
        </p>
      )}
    </div>
  );
}
