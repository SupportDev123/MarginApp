import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Library, Wrench, Footprints, Laptop, Gamepad2, Shirt, Loader2, Tag } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
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
}

interface BrandItem {
  id: number;
  brandId: number;
  name: string;
  modelNumber: string | null;
  imageUrl: string | null;
  typicalResaleLow: string | null;
  typicalResaleHigh: string | null;
  searchKeywords: string[] | null;
  isTopItem: boolean;
}

const categoryConfig: Record<string, { icon: typeof Wrench; name: string }> = {
  tools: { icon: Wrench, name: 'Tools' },
  shoes: { icon: Footprints, name: 'Shoes' },
  electronics: { icon: Laptop, name: 'Electronics' },
  gaming: { icon: Gamepad2, name: 'Gaming' },
  apparel: { icon: Shirt, name: 'Apparel' },
};

export default function BrandDetailPage() {
  const [, navigate] = useLocation();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const { data, isLoading, error } = useQuery<{ brand: Brand; items: BrandItem[] }>({
    queryKey: [`/api/brands/${slug}/items`],
    enabled: !!slug,
  });

  const category = data?.brand ? categoryConfig[data.brand.category] : null;
  const CategoryIcon = category?.icon || Library;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="p-4 pt-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/brands")}
          className="mb-4 -ml-2"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Brands
        </Button>

        {isLoading ? (
          <Card className="p-8 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </Card>
        ) : error || !data?.brand ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Brand not found</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/brands")}>
              Back to Brands
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <CategoryIcon className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-display font-bold">{data.brand.name}</h1>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {category?.name || data.brand.category}
                  </Badge>
                  {data.brand.keywords && data.brand.keywords.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {data.brand.keywords.slice(0, 2).join(" · ")}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {data.items && data.items.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-medium text-muted-foreground">Top Resale Items</h2>
                  <span className="text-sm text-primary">{data.items.length} items</span>
                </div>
                {data.items.map((item, index) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card className="p-4" data-testid={`card-item-${item.id}`}>
                      <div className="flex justify-between items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Tag className="w-4 h-4 text-primary shrink-0" />
                            <p className="font-medium">{item.name}</p>
                          </div>
                          {item.modelNumber && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Model: {item.modelNumber}
                            </p>
                          )}
                          {item.searchKeywords && item.searchKeywords.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {item.searchKeywords.slice(0, 3).map((kw, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {kw}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          {item.typicalResaleLow && item.typicalResaleHigh ? (
                            <div className="text-lg font-bold text-primary">
                              ${Number(item.typicalResaleLow).toFixed(0)} - ${Number(item.typicalResaleHigh).toFixed(0)}
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Price varies</span>
                          )}
                          <p className="text-xs text-muted-foreground">Resale range</p>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            ) : (
              <Card className="p-6 text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <CategoryIcon className="h-8 w-8 text-primary" />
                </div>
                <h2 className="font-semibold mb-2">{data.brand.name}</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  No specific items cataloged yet. Scan any {data.brand.name} item to analyze it.
                </p>
                {data.brand.keywords && data.brand.keywords.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-1 mb-4">
                    {data.brand.keywords.map((kw, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {kw}
                      </Badge>
                    ))}
                  </div>
                )}
                <Button 
                  onClick={() => navigate("/scan")}
                  data-testid="button-scan-item"
                >
                  Scan an Item
                </Button>
              </Card>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
