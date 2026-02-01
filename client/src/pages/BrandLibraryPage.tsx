import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Search, ChevronRight, Library, Wrench, Footprints, Laptop, Gamepad2, Shirt, Loader2, Settings } from "lucide-react";
import { Link } from "wouter";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BottomNav } from "@/components/BottomNav";

interface Brand {
  id: number;
  name: string;
  slug: string;
  category: string;
  logoUrl: string | null;
  aliases: string[] | null;
  keywords: string[] | null;
  avgResaleMultiplier: string | null;
  isActive: boolean;
}

const categories = [
  { id: 'tools', name: 'Tools', icon: Wrench },
  { id: 'shoes', name: 'Shoes', icon: Footprints },
  { id: 'electronics', name: 'Electronics', icon: Laptop },
  { id: 'gaming', name: 'Gaming', icon: Gamepad2 },
  { id: 'apparel', name: 'Apparel', icon: Shirt },
];

export default function BrandLibraryPage() {
  const [, navigate] = useLocation();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const brandUrl = selectedCategory ? `/api/brands?category=${selectedCategory}` : '/api/brands';
  const { data: brands, isLoading } = useQuery<Brand[]>({
    queryKey: [brandUrl],
  });

  const filteredBrands = brands?.filter(brand => {
    const matchesSearch = !searchQuery || 
      brand.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      brand.aliases?.some(a => a.toLowerCase().includes(searchQuery.toLowerCase())) ||
      brand.keywords?.some(k => k.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSearch;
  }) || [];

  const groupedBrands = categories.map(cat => ({
    ...cat,
    brands: filteredBrands.filter(b => b.category === cat.id)
  }));

  const getCategoryIcon = (categoryId: string) => {
    return categories.find(c => c.id === categoryId)?.icon || Library;
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="p-4 pt-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Library className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-display font-bold">Brand Library</h1>
              <p className="text-sm text-muted-foreground">100 top resale brands</p>
            </div>
          </div>
          <Link href="/settings">
            <Button size="icon" variant="ghost" className="text-muted-foreground" data-testid="button-settings">
              <Settings className="w-5 h-5" />
            </Button>
          </Link>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search brands..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-1 scrollbar-hide">
          <Button
            variant={selectedCategory === null ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(null)}
            data-testid="button-all-categories"
          >
            All
          </Button>
          {categories.map(cat => (
            <Button
              key={cat.id}
              variant={selectedCategory === cat.id ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(cat.id)}
              className="whitespace-nowrap"
              data-testid={`button-category-${cat.id}`}
            >
              <cat.icon className="h-4 w-4 mr-1" />
              {cat.name}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <Card className="p-8 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </Card>
        ) : selectedCategory ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedCategory}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-2"
            >
              {filteredBrands.map((brand, index) => (
                <BrandRow 
                  key={brand.id} 
                  brand={brand} 
                  icon={getCategoryIcon(brand.category)}
                  onClick={() => navigate(`/brands/${brand.slug}`)} 
                  delay={index * 0.02}
                />
              ))}
              {filteredBrands.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  No brands found matching your search.
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="space-y-6">
            {groupedBrands.map(group => (
              group.brands.length > 0 && (
                <motion.div
                  key={group.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <group.icon className="h-4 w-4 text-primary" />
                      </div>
                      <h2 className="font-semibold">{group.name}</h2>
                      <span className="text-sm text-primary">({group.brands.length})</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedCategory(group.id)}
                      className="text-primary"
                      data-testid={`button-view-all-${group.id}`}
                    >
                      View all
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {group.brands.slice(0, 3).map((brand, index) => (
                      <BrandRow 
                        key={brand.id} 
                        brand={brand} 
                        icon={group.icon}
                        onClick={() => navigate(`/brands/${brand.slug}`)} 
                        delay={index * 0.02}
                      />
                    ))}
                  </div>
                </motion.div>
              )
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

function BrandRow({ brand, icon: Icon, onClick, delay }: { 
  brand: Brand; 
  icon: typeof Wrench;
  onClick: () => void;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <Card 
        className="p-4 hover-elevate cursor-pointer"
        onClick={onClick}
        data-testid={`card-brand-${brand.slug}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-medium">{brand.name}</p>
              {brand.keywords && brand.keywords.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {brand.keywords.slice(0, 2).join(" · ")}
                </p>
              )}
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </div>
      </Card>
    </motion.div>
  );
}
