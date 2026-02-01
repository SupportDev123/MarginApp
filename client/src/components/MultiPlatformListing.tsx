import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { SiEbay } from 'react-icons/si';

interface ListingData {
  title: string;
  description: string;
  price: number;
  condition: string;
  category: string;
  keywords: string[];
}

interface MultiPlatformListingProps {
  itemData: {
    title: string;
    description?: string;
    suggestedPrice: number;
    condition?: string;
    category?: string;
    keywords?: string[];
    imageUrl?: string;
  };
  onClose?: () => void;
}

export function MultiPlatformListing({ itemData, onClose }: MultiPlatformListingProps) {
  const { toast } = useToast();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  
  const [listing, setListing] = useState<ListingData>({
    title: itemData.title || '',
    description: itemData.description || '',
    price: itemData.suggestedPrice || 0,
    condition: itemData.condition || 'Used - Good',
    category: itemData.category || '',
    keywords: itemData.keywords || []
  });

  const maxTitleLength = 80;

  const getTitle = (): string => {
    let title = listing.title;
    if (title.length > maxTitleLength) {
      title = title.substring(0, maxTitleLength - 3) + '...';
    }
    return title;
  };

  const getDescription = (): string => {
    return `${listing.description}\n\nShips within 1 business day. Returns accepted within 30 days.`;
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
      toast({
        title: 'Copied!',
        description: `${field} copied to clipboard`
      });
    } catch (err) {
      toast({
        title: 'Failed to copy',
        description: 'Please select and copy manually',
        variant: 'destructive'
      });
    }
  };

  const openEbay = () => {
    window.open('https://www.ebay.com/sl/sell', '_blank');
  };

  const copyAllFields = async () => {
    const allText = `Title: ${getTitle()}

Price: $${listing.price}

Condition: ${listing.condition}

Description:
${getDescription()}

Keywords: ${listing.keywords.join(', ')}`;

    await copyToClipboard(allText, 'All fields');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-6 h-6 rounded flex items-center justify-center text-white bg-blue-500">
                <SiEbay className="w-4 h-4" />
              </span>
              eBay Listing
            </CardTitle>
            <div className="flex gap-1 flex-wrap">
              <Badge variant="secondary" className="text-xs">Auction</Badge>
              <Badge variant="secondary" className="text-xs">Buy It Now</Badge>
              <Badge variant="secondary" className="text-xs">Best Offer</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                Title ({getTitle().length}/{maxTitleLength})
              </Label>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copyToClipboard(getTitle(), 'Title')}
                className="h-6 px-2"
                data-testid="button-copy-title"
              >
                {copiedField === 'Title' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </Button>
            </div>
            <Input 
              value={getTitle()}
              onChange={(e) => setListing({ ...listing, title: e.target.value })}
              className="text-sm"
              data-testid="input-listing-title"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Price</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard(`$${listing.price}`, 'Price')}
                  className="h-6 px-2"
                  data-testid="button-copy-price"
                >
                  {copiedField === 'Price' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
              <Input 
                type="number"
                value={listing.price}
                onChange={(e) => setListing({ ...listing, price: parseFloat(e.target.value) || 0 })}
                className="text-sm"
                data-testid="input-listing-price"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Condition</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard(listing.condition, 'Condition')}
                  className="h-6 px-2"
                  data-testid="button-copy-condition"
                >
                  {copiedField === 'Condition' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
              <Input 
                value={listing.condition}
                onChange={(e) => setListing({ ...listing, condition: e.target.value })}
                className="text-sm"
                data-testid="input-listing-condition"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copyToClipboard(getDescription(), 'Description')}
                className="h-6 px-2"
                data-testid="button-copy-description"
              >
                {copiedField === 'Description' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </Button>
            </div>
            <Textarea 
              value={getDescription()}
              onChange={(e) => setListing({ ...listing, description: e.target.value })}
              className="text-sm min-h-[100px]"
              data-testid="textarea-listing-description"
            />
          </div>

          {listing.keywords.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Keywords</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard(listing.keywords.join(', '), 'Keywords')}
                  className="h-6 px-2"
                  data-testid="button-copy-keywords"
                >
                  {copiedField === 'Keywords' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {listing.keywords.map((keyword, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {keyword}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button 
              onClick={copyAllFields}
              variant="outline"
              className="flex-1 gap-1.5"
              data-testid="button-copy-all"
            >
              <Copy className="w-4 h-4" />
              Copy All
            </Button>
            <Button 
              onClick={openEbay}
              className="flex-1 gap-1.5"
              data-testid="button-open-ebay"
            >
              <ExternalLink className="w-4 h-4" />
              Open eBay Seller
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Copy listing details and paste into eBay. Images must be uploaded separately.
      </p>
    </div>
  );
}
