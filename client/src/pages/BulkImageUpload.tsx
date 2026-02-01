import { useState, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, ArrowLeft, Upload, ImageIcon, Check, AlertCircle, FileSpreadsheet, Globe, Search, Zap } from 'lucide-react';
import { Link } from 'wouter';

interface FamilyNeedingImages {
  id: number;
  name: string;
  subcategory: string;
  category: string;
  imageCount: number;
  status: string;
}

export default function BulkImageUpload() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedFamily, setSelectedFamily] = useState<FamilyNeedingImages | null>(null);
  const [imageUrls, setImageUrls] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [scrapedImages, setScrapedImages] = useState<string[]>([]);
  const [selectedScrapedImages, setSelectedScrapedImages] = useState<Set<string>>(new Set());
  const [uploadResult, setUploadResult] = useState<{ added: number; skipped: number; errors: string[] } | null>(null);
  const [inputMethod, setInputMethod] = useState<'paste' | 'csv' | 'scrape'>('paste');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: families, isLoading } = useQuery<FamilyNeedingImages[]>({
    queryKey: ['/api/admin/library/families-needing-images'],
    queryFn: async () => {
      const res = await fetch('/api/admin/library/families-needing-images', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch families');
      return res.json();
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ category, familyId, urls }: { category: string; familyId: number; urls: string[] }) => {
      const res = await apiRequest('POST', '/api/admin/library/bulk-upload', {
        category,
        familyId,
        imageUrls: urls
      });
      return res.json();
    },
    onSuccess: (data) => {
      setUploadResult(data);
      toast({ 
        title: 'Upload complete', 
        description: `Added ${data.added} images, skipped ${data.skipped} duplicates` 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/library/families-needing-images'] });
    },
    onError: (err: any) => {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    },
  });

  const scrapeMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await apiRequest('POST', '/api/admin/library/scrape-images', { url });
      return res.json();
    },
    onSuccess: (data) => {
      setScrapedImages(data.images || []);
      setSelectedScrapedImages(new Set(data.images?.slice(0, 25) || []));
      toast({ 
        title: 'Images found', 
        description: `Found ${data.images?.length || 0} images on the page` 
      });
    },
    onError: (err: any) => {
      toast({ title: 'Scrape failed', description: err.message, variant: 'destructive' });
    },
  });

  const [autoSeedResult, setAutoSeedResult] = useState<{ searched: number; imagesAdded: number; errors: string[] } | null>(null);
  
  const autoSeedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/library/auto-seed-serpapi', {});
      return res.json();
    },
    onSuccess: (data) => {
      setAutoSeedResult(data);
      toast({ 
        title: 'Auto-seed complete', 
        description: `Searched ${data.searched} products, added ${data.imagesAdded} images` 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/library/families-needing-images'] });
    },
    onError: (err: any) => {
      toast({ title: 'Auto-seed failed', description: err.message, variant: 'destructive' });
    },
  });

  const handleUpload = () => {
    if (!selectedFamily) return;
    
    let urls: string[] = [];
    
    if (inputMethod === 'paste') {
      urls = imageUrls
        .split('\n')
        .map(url => url.trim())
        .filter(url => url.startsWith('http'));
    } else if (inputMethod === 'scrape') {
      urls = Array.from(selectedScrapedImages);
    }
    
    if (urls.length === 0) {
      toast({ title: 'No valid URLs', description: 'Select at least one image', variant: 'destructive' });
      return;
    }

    setUploadResult(null);
    uploadMutation.mutate({
      category: selectedFamily.category,
      familyId: selectedFamily.id,
      urls
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      const urls: string[] = [];
      
      for (const line of lines) {
        const cells = line.split(/[,\t]/);
        for (const cell of cells) {
          const cleaned = cell.trim().replace(/^["']|["']$/g, '');
          if (cleaned.startsWith('http') && (cleaned.includes('.jpg') || cleaned.includes('.png') || cleaned.includes('.webp') || cleaned.includes('.jpeg') || cleaned.includes('image'))) {
            urls.push(cleaned);
          }
        }
      }
      
      setImageUrls(urls.join('\n'));
      setInputMethod('paste');
      toast({ title: 'CSV processed', description: `Found ${urls.length} image URLs` });
    };
    reader.readAsText(file);
  };

  const toggleImageSelection = (url: string) => {
    const newSelection = new Set(selectedScrapedImages);
    if (newSelection.has(url)) {
      newSelection.delete(url);
    } else if (newSelection.size < 25) {
      newSelection.add(url);
    }
    setSelectedScrapedImages(newSelection);
  };

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

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'gaming': return 'bg-purple-500/10 text-purple-500';
      case 'antique': return 'bg-amber-500/10 text-amber-500';
      case 'electronics': return 'bg-blue-500/10 text-blue-500';
      case 'toy': return 'bg-pink-500/10 text-pink-500';
      default: return 'bg-gray-500/10 text-gray-500';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto p-4 space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/library">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Bulk Image Upload</h1>
            <p className="text-muted-foreground">Add reference images via CSV, website, or paste URLs</p>
          </div>
        </div>

        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Zap className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">One-Click Auto-Seed</h3>
                  <p className="text-sm text-muted-foreground">
                    Automatically find images for all empty categories using Google Images (uses ~20 API credits)
                  </p>
                </div>
              </div>
              <Button
                onClick={() => autoSeedMutation.mutate()}
                disabled={autoSeedMutation.isPending}
                className="shrink-0"
                data-testid="button-auto-seed"
              >
                {autoSeedMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Auto-seeding...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Auto-Seed All Categories
                  </>
                )}
              </Button>
            </div>
            {autoSeedResult && (
              <div className="mt-4 p-3 bg-background rounded-lg">
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-green-600">{autoSeedResult.imagesAdded} images added</span>
                  <span className="text-muted-foreground">{autoSeedResult.searched} products searched</span>
                  {autoSeedResult.errors.length > 0 && (
                    <span className="text-yellow-600">{autoSeedResult.errors.length} errors</span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>1. Select Product Family</CardTitle>
              <CardDescription>Choose which product needs images</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {families?.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">All families have enough images</p>
                  )}
                  {families?.map((family) => (
                    <div
                      key={`${family.category}-${family.id}`}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedFamily?.id === family.id && selectedFamily?.category === family.category
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                      onClick={() => setSelectedFamily(family)}
                      data-testid={`family-${family.category}-${family.id}`}
                    >
                      <div className="flex flex-col gap-1">
                        <p className="font-medium text-sm truncate">{family.name}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className={`text-xs ${getCategoryColor(family.category)}`}>
                            {family.category}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {family.imageCount}/25
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>2. Add Images</CardTitle>
              <CardDescription>
                {selectedFamily 
                  ? `Adding to: ${selectedFamily.name}`
                  : 'Select a product family first'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs value={inputMethod} onValueChange={(v) => setInputMethod(v as any)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="paste" className="gap-2" data-testid="tab-paste">
                    <Upload className="w-4 h-4" /> Paste URLs
                  </TabsTrigger>
                  <TabsTrigger value="csv" className="gap-2" data-testid="tab-csv">
                    <FileSpreadsheet className="w-4 h-4" /> CSV/Excel
                  </TabsTrigger>
                  <TabsTrigger value="scrape" className="gap-2" data-testid="tab-scrape">
                    <Globe className="w-4 h-4" /> From Website
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="paste" className="space-y-4">
                  <div className="space-y-2">
                    <Label>Image URLs (one per line, up to 25)</Label>
                    <Textarea
                      placeholder={`https://example.com/image1.jpg\nhttps://example.com/image2.jpg`}
                      value={imageUrls}
                      onChange={(e) => setImageUrls(e.target.value)}
                      rows={8}
                      disabled={!selectedFamily}
                      data-testid="textarea-urls"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="csv" className="space-y-4">
                  <div className="space-y-2">
                    <Label>Upload CSV or text file with image URLs</Label>
                    <input
                      type="file"
                      accept=".csv,.txt"
                      onChange={handleFileUpload}
                      ref={fileInputRef}
                      className="hidden"
                    />
                    <div 
                      className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <FileSpreadsheet className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                      <p className="font-medium">Drop CSV file here or click to browse</p>
                      <p className="text-sm text-muted-foreground mt-1">Any column with image URLs will be extracted</p>
                    </div>
                    {imageUrls && (
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-sm">{imageUrls.split('\n').filter(u => u.trim()).length} URLs loaded from file</p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="scrape" className="space-y-4">
                  <div className="space-y-2">
                    <Label>Website URL to scrape images from</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="https://nintendo.com/store/products/..."
                        value={websiteUrl}
                        onChange={(e) => setWebsiteUrl(e.target.value)}
                        disabled={!selectedFamily}
                        data-testid="input-website-url"
                      />
                      <Button
                        onClick={() => scrapeMutation.mutate(websiteUrl)}
                        disabled={!selectedFamily || !websiteUrl.startsWith('http') || scrapeMutation.isPending}
                        data-testid="button-scrape"
                      >
                        {scrapeMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Search className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {scrapedImages.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Select images ({selectedScrapedImages.size}/25)</Label>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setSelectedScrapedImages(new Set(scrapedImages.slice(0, 25)))}
                        >
                          Select first 25
                        </Button>
                      </div>
                      <div className="grid grid-cols-4 gap-2 max-h-[300px] overflow-y-auto p-2 border rounded-lg">
                        {scrapedImages.map((url, i) => (
                          <div 
                            key={i}
                            className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-colors ${
                              selectedScrapedImages.has(url) ? 'border-primary' : 'border-transparent hover:border-primary/50'
                            }`}
                            onClick={() => toggleImageSelection(url)}
                          >
                            <img 
                              src={url} 
                              alt="" 
                              className="w-full h-20 object-cover"
                              onError={(e) => (e.target as HTMLImageElement).style.display = 'none'}
                            />
                            {selectedScrapedImages.has(url) && (
                              <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                                <Check className="w-3 h-3" />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              <Button 
                onClick={handleUpload}
                disabled={!selectedFamily || uploadMutation.isPending || (inputMethod === 'paste' && !imageUrls.trim()) || (inputMethod === 'scrape' && selectedScrapedImages.size === 0)}
                className="w-full"
                data-testid="button-upload"
              >
                {uploadMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Processing images...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload {inputMethod === 'scrape' ? selectedScrapedImages.size : imageUrls.split('\n').filter(u => u.trim().startsWith('http')).length} Images
                  </>
                )}
              </Button>

              {uploadResult && (
                <div className="space-y-2 p-4 bg-muted rounded-lg">
                  <div className="flex items-center gap-2 text-green-600">
                    <Check className="w-4 h-4" />
                    <span>{uploadResult.added} images added</span>
                  </div>
                  {uploadResult.skipped > 0 && (
                    <div className="flex items-center gap-2 text-yellow-600">
                      <ImageIcon className="w-4 h-4" />
                      <span>{uploadResult.skipped} duplicates skipped</span>
                    </div>
                  )}
                  {uploadResult.errors.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-red-600">
                        <AlertCircle className="w-4 h-4" />
                        <span>{uploadResult.errors.length} errors</span>
                      </div>
                      <div className="text-xs text-muted-foreground max-h-24 overflow-y-auto">
                        {uploadResult.errors.slice(0, 5).map((err, i) => (
                          <p key={i}>{err}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
