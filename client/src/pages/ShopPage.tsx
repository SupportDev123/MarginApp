import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "@/components/BottomNav";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShoppingCart, Package, RefreshCw, CheckCircle, XCircle, Crown } from "lucide-react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ShopProduct {
  id: number;
  name: string;
  description: string | null;
  price: string;
  imageUrl: string | null;
  category: string | null;
  printfulProductId: string | null;
  inStock: boolean;
}

interface PrintfulStatus {
  connected: boolean;
  productCount?: number;
  message: string;
}

export default function ShopPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  
  const isPro = user?.subscriptionTier === 'pro' || user?.isAdmin;
  
  const { data: products, isLoading } = useQuery<ShopProduct[]>({
    queryKey: ['/api/shop/products'],
  });

  const { data: printfulStatus } = useQuery<PrintfulStatus>({
    queryKey: ['/api/shop/printful-status'],
    enabled: !!user?.isAdmin,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/shop/sync-printful');
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Sync complete!",
        description: data.message || `Synced ${data.count} products`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/shop/products'] });
    },
    onError: (error: any) => {
      toast({
        title: "Sync failed",
        description: error.message || "Could not sync from Printful",
        variant: "destructive",
      });
    },
  });

  const handleBuyNow = async (product: ShopProduct) => {
    try {
      const res = await apiRequest('POST', '/api/shop/checkout', { productId: product.id });
      const response = await res.json();
      
      if (response.url) {
        window.location.href = response.url;
      }
    } catch (error) {
      toast({
        title: "Checkout failed",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-md mx-auto px-4 py-6">
        <PageHeader 
          title="Shop" 
          subtitle="Official Margin gear for resellers"
        />

        {!isPro ? (
          <Card className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Crown className="w-8 h-8 text-primary" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Pro Members Only</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Get exclusive access to official Margin merch with a Pro subscription.
            </p>
            <Button onClick={() => navigate('/settings')} data-testid="button-upgrade-pro">
              Upgrade to Pro
            </Button>
          </Card>
        ) : (
          <>
        {user?.isAdmin && (
          <Card className="p-4 mb-6 bg-muted/50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Admin: Printful Integration</h3>
              {printfulStatus?.connected ? (
                <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-green-500/30">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
                  <XCircle className="w-3 h-3 mr-1" />
                  Not Connected
                </Badge>
              )}
            </div>
            
            <p className="text-xs text-muted-foreground mb-3">
              {printfulStatus?.connected 
                ? `${printfulStatus.productCount} products in Printful`
                : "Add PRINTFUL_API_KEY to secrets to connect"
              }
            </p>
            
            <Button
              size="sm"
              variant="outline"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending || !printfulStatus?.connected}
              data-testid="button-sync-printful"
            >
              {syncMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1" />
              )}
              Sync from Printful
            </Button>
          </Card>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : products && products.length > 0 ? (
          <div className="grid grid-cols-2 gap-4">
            {products.map((product, index) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="overflow-hidden hover-elevate">
                  <div className="aspect-square bg-muted relative">
                    {product.imageUrl ? (
                      <img 
                        src={product.imageUrl} 
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-12 h-12 text-muted-foreground" />
                      </div>
                    )}
                    {product.category && (
                      <Badge 
                        variant="secondary" 
                        className="absolute top-2 left-2 text-xs"
                      >
                        {product.category}
                      </Badge>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="font-semibold text-sm line-clamp-2 mb-1">
                      {product.name}
                    </h3>
                    <p className="text-lg font-bold text-primary mb-2">
                      ${product.price}
                    </p>
                    <Button 
                      size="sm" 
                      className="w-full"
                      onClick={() => handleBuyNow(product)}
                      disabled={!product.inStock}
                      data-testid={`button-buy-${product.id}`}
                    >
                      <ShoppingCart className="w-4 h-4 mr-1" />
                      {product.inStock ? 'Buy Now' : 'Out of Stock'}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">Coming Soon</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Official Margin merch is on the way. Get notified when it drops!
            </p>
            <p className="text-xs text-muted-foreground">
              T-shirts, hats, and more for the reseller community
            </p>
          </Card>
        )}
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
