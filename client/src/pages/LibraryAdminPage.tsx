import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Upload, Image as ImageIcon, Watch, Footprints, CreditCard, ArrowLeft, Trash2, Wrench, ShoppingBag, Gamepad2, Play, Lamp } from 'lucide-react';
import { Link } from 'wouter';

type Category = 'watch' | 'shoe' | 'card' | 'tool' | 'handbag' | 'gaming' | 'antique';

interface LibraryItem {
  id: number;
  category: string;
  brand: string | null;
  modelFamily: string | null;
  modelName: string | null;
  variant: string | null;
  title: string;
  status: string;
  imageCount: number;
  images: {
    id: number;
    imageUrl: string;
    imageType: string | null;
    source: string;
  }[];
}

interface LibraryStats {
  itemCount: number;
  imageCount: number;
  sessionCount: number;
  autoSelectRate: number;
  visionUsageRate: number;
}

export default function LibraryAdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<Category>('watch');
  const [showAddItem, setShowAddItem] = useState(false);
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);

  const [newItem, setNewItem] = useState({
    title: '',
    brand: '',
    modelFamily: '',
    modelName: '',
    variant: '',
  });

  const [newImageUrl, setNewImageUrl] = useState('');
  const [newImageType, setNewImageType] = useState('');

  const { data: stats, isLoading: statsLoading } = useQuery<LibraryStats>({
    queryKey: ['/api/library/stats', selectedCategory],
    queryFn: async () => {
      const res = await fetch(`/api/library/stats?category=${selectedCategory}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
  });

  const { data: items, isLoading: itemsLoading } = useQuery<LibraryItem[]>({
    queryKey: ['/api/library/items', selectedCategory],
    queryFn: async () => {
      const res = await fetch(`/api/library/items?category=${selectedCategory}&limit=100`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch items');
      return res.json();
    },
  });

  const createItemMutation = useMutation({
    mutationFn: async (data: typeof newItem & { category: Category }) => {
      const res = await apiRequest('POST', '/api/admin/library/item', data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: 'Item created', description: `Created ${data.title}` });
      queryClient.invalidateQueries({ queryKey: ['/api/library/items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/library/stats'] });
      setNewItem({ title: '', brand: '', modelFamily: '', modelName: '', variant: '' });
      setShowAddItem(false);
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const addImageMutation = useMutation({
    mutationFn: async ({ itemId, imageUrl, imageType }: { itemId: number; imageUrl: string; imageType?: string }) => {
      const res = await apiRequest('POST', `/api/admin/library/item/${itemId}/images`, { imageUrl, imageType });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Image added', description: 'Reference image added to library' });
      queryClient.invalidateQueries({ queryKey: ['/api/library/items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/library/stats'] });
      setNewImageUrl('');
      setNewImageType('');
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const seedLibraryMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/library/seed', {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: 'Library seeded', 
        description: `Created ${data.itemsCreated} items and ${data.imagesCreated} images` 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/library/items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/library/stats'] });
    },
    onError: (err: any) => {
      toast({ title: 'Seed failed', description: err.message, variant: 'destructive' });
    },
  });

  if (!user?.isAdmin) {
    return (
      <div className="min-h-screen bg-background p-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Admin access required</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getCategoryIcon = (cat: Category) => {
    switch (cat) {
      case 'watch': return <Watch className="w-4 h-4" />;
      case 'shoe': return <Footprints className="w-4 h-4" />;
      case 'card': return <CreditCard className="w-4 h-4" />;
      case 'tool': return <Wrench className="w-4 h-4" />;
      case 'handbag': return <ShoppingBag className="w-4 h-4" />;
      case 'gaming': return <Gamepad2 className="w-4 h-4" />;
      case 'antique': return <Lamp className="w-4 h-4" />;
    }
  };

  const getImageTypes = (cat: Category) => {
    switch (cat) {
      case 'watch': return ['dial', 'side', 'caseback'];
      case 'shoe': return ['side', 'top', 'sole', 'box_label'];
      case 'card': return ['front', 'back'];
      case 'tool': return ['main', 'side', 'label'];
      case 'handbag': return ['front', 'side', 'interior', 'hardware'];
      case 'gaming': return ['front', 'back', 'screen'];
      case 'antique': return ['main', 'detail', 'marking', 'bottom'];
    }
  };

  const runCategorySeederMutation = useMutation({
    mutationFn: async (category: Category) => {
      let endpoint = '';
      switch (category) {
        case 'watch': endpoint = '/api/watch-db/run-seeder'; break;
        case 'shoe': endpoint = '/api/shoe-db/run-seeder'; break;
        case 'tool': endpoint = '/api/tool-db/run-seeder'; break;
        case 'handbag': endpoint = '/api/handbag-db/run-seeder'; break;
        case 'gaming': endpoint = '/api/gaming-db/run-seeder'; break;
        case 'antique': endpoint = '/api/antique-db/run-seeder'; break;
        default: throw new Error('No seeder for this category');
      }
      const res = await apiRequest('POST', endpoint, {});
      return res.json();
    },
    onSuccess: (data, category) => {
      toast({ 
        title: 'Seeder started', 
        description: `${category.charAt(0).toUpperCase() + category.slice(1)} library seeder is running in background` 
      });
    },
    onError: (err: any) => {
      toast({ title: 'Seeder failed', description: err.message, variant: 'destructive' });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-4 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/settings">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Visual Matching Library</h1>
              <p className="text-muted-foreground">Manage reference images for visual matching</p>
            </div>
          </div>
          <Link href="/admin/bulk-upload">
            <Button variant="outline" data-testid="button-bulk-upload">
              <Upload className="w-4 h-4 mr-2" />
              Bulk Upload
            </Button>
          </Link>
        </div>

        <Tabs value={selectedCategory} onValueChange={(v) => {
          const cat = v as Category;
          setSelectedCategory(cat);
          if (cat !== 'card') {
            runCategorySeederMutation.mutate(cat);
          }
        }}>
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="watch" className="gap-1 text-xs px-1" data-testid="tab-watch">
              <Watch className="w-3 h-3" /> Watches
            </TabsTrigger>
            <TabsTrigger value="shoe" className="gap-1 text-xs px-1" data-testid="tab-shoe">
              <Footprints className="w-3 h-3" /> Shoes
            </TabsTrigger>
            <TabsTrigger value="tool" className="gap-1 text-xs px-1" data-testid="tab-tool">
              <Wrench className="w-3 h-3" /> Tools
            </TabsTrigger>
            <TabsTrigger value="handbag" className="gap-1 text-xs px-1" data-testid="tab-handbag">
              <ShoppingBag className="w-3 h-3" /> Bags
            </TabsTrigger>
            <TabsTrigger value="gaming" className="gap-1 text-xs px-1" data-testid="tab-gaming">
              <Gamepad2 className="w-3 h-3" /> Gaming
            </TabsTrigger>
            <TabsTrigger value="antique" className="gap-1 text-xs px-1" data-testid="tab-antique">
              <Lamp className="w-3 h-3" /> Antiques
            </TabsTrigger>
            <TabsTrigger value="card" className="gap-1 text-xs px-1" data-testid="tab-card">
              <CreditCard className="w-3 h-3" /> Cards
            </TabsTrigger>
          </TabsList>

          <TabsContent value={selectedCategory} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Library Stats</CardTitle>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold">{stats?.itemCount || 0}</div>
                      <div className="text-sm text-muted-foreground">Items</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">{stats?.imageCount || 0}</div>
                      <div className="text-sm text-muted-foreground">Images</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">{stats?.sessionCount || 0}</div>
                      <div className="text-sm text-muted-foreground">Scans</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">{stats?.autoSelectRate?.toFixed(0) || 0}%</div>
                      <div className="text-sm text-muted-foreground">Auto-Select</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold">{stats?.visionUsageRate?.toFixed(0) || 0}%</div>
                      <div className="text-sm text-muted-foreground">Vision Used</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-between items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold">
                {selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)} Items
              </h2>
              <div className="flex gap-2 flex-wrap">
                {selectedCategory !== 'card' && (
                  <Button 
                    variant="outline" 
                    onClick={() => runCategorySeederMutation.mutate(selectedCategory)}
                    disabled={runCategorySeederMutation.isPending}
                    data-testid="button-run-seeder"
                  >
                    {runCategorySeederMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Play className="w-4 h-4 mr-2" />
                    )}
                    Run Seeder
                  </Button>
                )}
                {(stats?.itemCount || 0) === 0 && (
                  <Button 
                    variant="outline" 
                    onClick={() => seedLibraryMutation.mutate()}
                    disabled={seedLibraryMutation.isPending}
                    data-testid="button-seed-library"
                  >
                    {seedLibraryMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Upload className="w-4 h-4 mr-2" />
                    )}
                    Seed Library
                  </Button>
                )}
                <Button onClick={() => setShowAddItem(true)} data-testid="button-add-item">
                  <Plus className="w-4 h-4 mr-2" /> Add Item
                </Button>
              </div>
            </div>

            {showAddItem && (
              <Card>
                <CardHeader>
                  <CardTitle>Add New {selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Title (required)</Label>
                      <Input
                        placeholder="e.g., Invicta Pro Diver 8926OB Blue"
                        value={newItem.title}
                        onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                        data-testid="input-item-title"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Brand</Label>
                      <Input
                        placeholder="e.g., Invicta, Nike, Panini"
                        value={newItem.brand}
                        onChange={(e) => setNewItem({ ...newItem, brand: e.target.value })}
                        data-testid="input-item-brand"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Model Family</Label>
                      <Input
                        placeholder="e.g., Pro Diver, Jordan 1, Prizm"
                        value={newItem.modelFamily}
                        onChange={(e) => setNewItem({ ...newItem, modelFamily: e.target.value })}
                        data-testid="input-item-model-family"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Model Name</Label>
                      <Input
                        placeholder="e.g., 8926OB, Dunk Low"
                        value={newItem.modelName}
                        onChange={(e) => setNewItem({ ...newItem, modelName: e.target.value })}
                        data-testid="input-item-model-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Variant / Colorway</Label>
                      <Input
                        placeholder="e.g., Blue Sunburst, Chicago, Silver Prizm"
                        value={newItem.variant}
                        onChange={(e) => setNewItem({ ...newItem, variant: e.target.value })}
                        data-testid="input-item-variant"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => createItemMutation.mutate({ ...newItem, category: selectedCategory })}
                      disabled={!newItem.title || createItemMutation.isPending}
                      data-testid="button-create-item"
                    >
                      {createItemMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Create Item
                    </Button>
                    <Button variant="outline" onClick={() => setShowAddItem(false)}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {selectedItem && (
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{selectedItem.title}</CardTitle>
                      <CardDescription>
                        {selectedItem.brand} {selectedItem.modelFamily} {selectedItem.variant}
                      </CardDescription>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setSelectedItem(null)}>
                      <ArrowLeft className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                    {selectedItem.images.map((img) => (
                      <div key={img.id} className="relative group">
                        <img
                          src={img.imageUrl}
                          alt=""
                          className="w-full aspect-square object-cover rounded-lg"
                        />
                        <Badge className="absolute bottom-1 left-1 text-xs" variant="secondary">
                          {img.imageType || 'unknown'}
                        </Badge>
                      </div>
                    ))}
                  </div>

                  <div className="border-t pt-4 space-y-3">
                    <h4 className="font-medium">Add Reference Image</h4>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Image URL"
                        value={newImageUrl}
                        onChange={(e) => setNewImageUrl(e.target.value)}
                        className="flex-1"
                        data-testid="input-image-url"
                      />
                      <Select value={newImageType} onValueChange={setNewImageType}>
                        <SelectTrigger className="w-32" data-testid="select-image-type">
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                          {getImageTypes(selectedCategory).map((type) => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={() => addImageMutation.mutate({
                          itemId: selectedItem.id,
                          imageUrl: newImageUrl,
                          imageType: newImageType,
                        })}
                        disabled={!newImageUrl || addImageMutation.isPending}
                        data-testid="button-add-image"
                      >
                        {addImageMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {itemsLoading ? (
                <div className="col-span-full flex justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin" />
                </div>
              ) : items?.length === 0 ? (
                <div className="col-span-full text-center py-8 text-muted-foreground">
                  <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No items in library yet</p>
                  <p className="text-sm">Add items and reference images to enable visual matching</p>
                </div>
              ) : (
                items?.map((item) => (
                  <Card
                    key={item.id}
                    className="cursor-pointer hover-elevate"
                    onClick={() => setSelectedItem(item)}
                    data-testid={`card-item-${item.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex gap-3">
                        {item.images[0] ? (
                          <img
                            src={item.images[0].imageUrl}
                            alt=""
                            className="w-16 h-16 object-cover rounded-lg"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
                            {getCategoryIcon(item.category as Category)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium truncate">{item.title}</h3>
                          <p className="text-sm text-muted-foreground truncate">
                            {item.brand} {item.modelFamily}
                          </p>
                          <div className="flex gap-1 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {item.imageCount} images
                            </Badge>
                            {item.variant && (
                              <Badge variant="secondary" className="text-xs">
                                {item.variant}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
