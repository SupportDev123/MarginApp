import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Watch, Footprints, Gamepad2, Smartphone, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProductFamily {
  id: string;
  title: string;
  brand: string;
  family: string;
  category: string;
  displayName: string;
}

interface ProductAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (product: ProductFamily) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'Watches':
      return Watch;
    case 'Shoes':
      return Footprints;
    case 'Electronics':
      return Gamepad2;
    default:
      return Package;
  }
};

const getCategoryColor = (category: string) => {
  switch (category) {
    case 'Watches':
      return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    case 'Shoes':
      return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
    case 'Electronics':
      return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
    default:
      return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
  }
};

export function ProductAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Start typing a brand or product...",
  disabled = false,
  className,
}: ProductAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<ProductFamily[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (value.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/product-families/search?q=${encodeURIComponent(value)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
          setIsOpen(data.results?.length > 0);
          setHighlightedIndex(-1);
        }
      } catch (err) {
        console.error('Autocomplete search failed:', err);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (product: ProductFamily) => {
    onChange(product.displayName);
    setIsOpen(false);
    onSelect?.(product);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < results.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev > 0 ? prev - 1 : results.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < results.length) {
          handleSelect(results[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="h-12 pl-10 pr-4"
          data-testid="input-product-autocomplete"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-64 overflow-auto">
          {results.map((product, index) => {
            const Icon = getCategoryIcon(product.category);
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => handleSelect(product)}
                className={cn(
                  "w-full px-3 py-2.5 text-left flex items-center gap-3 hover-elevate transition-colors",
                  highlightedIndex === index && "bg-accent"
                )}
                data-testid={`autocomplete-option-${product.id}`}
              >
                <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm leading-tight">{product.displayName}</div>
                  <div className="text-xs text-muted-foreground">{product.brand}</div>
                </div>
                <Badge 
                  variant="outline" 
                  className={cn("text-xs flex-shrink-0", getCategoryColor(product.category))}
                >
                  {product.category}
                </Badge>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
