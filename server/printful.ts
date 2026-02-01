// Printful API Integration
// Documentation: https://developers.printful.com/docs/

const PRINTFUL_API_BASE = "https://api.printful.com";

interface PrintfulProduct {
  id: number;
  external_id: string;
  name: string;
  variants: number;
  synced: number;
  thumbnail_url: string | null;
  is_ignored: boolean;
}

interface PrintfulVariant {
  id: number;
  external_id: string;
  sync_product_id: number;
  name: string;
  synced: boolean;
  variant_id: number;
  retail_price: string;
  currency: string;
  product: {
    variant_id: number;
    product_id: number;
    image: string;
    name: string;
  };
  files: Array<{
    type: string;
    url: string;
    preview_url: string;
  }>;
}

interface PrintfulSyncProduct {
  sync_product: PrintfulProduct;
  sync_variants: PrintfulVariant[];
}

interface PrintfulOrderItem {
  sync_variant_id: number;
  quantity: number;
  retail_price?: string;
}

interface PrintfulRecipient {
  name: string;
  address1: string;
  city: string;
  state_code: string;
  country_code: string;
  zip: string;
  email?: string;
  phone?: string;
}

interface PrintfulOrder {
  id: number;
  external_id: string;
  status: string;
  shipping: string;
  created: number;
  updated: number;
  recipient: PrintfulRecipient;
  items: any[];
  costs: {
    currency: string;
    subtotal: string;
    discount: string;
    shipping: string;
    digitization: string;
    additional_fee: string;
    fulfillment_fee: string;
    retail_delivery_fee: string;
    tax: string;
    vat: string;
    total: string;
  };
  shipments: Array<{
    id: number;
    carrier: string;
    service: string;
    tracking_number: string;
    tracking_url: string;
    created: number;
    ship_date: string;
    shipped_at: number;
    reshipment: boolean;
    items: any[];
  }>;
}

class PrintfulAPI {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${PRINTFUL_API_BASE}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Printful API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.result as T;
  }

  // Get all sync products (your store's products)
  async getSyncProducts(): Promise<PrintfulProduct[]> {
    return this.request<PrintfulProduct[]>("/store/products");
  }

  // Get a specific sync product with variants
  async getSyncProduct(id: number): Promise<PrintfulSyncProduct> {
    return this.request<PrintfulSyncProduct>(`/store/products/${id}`);
  }

  // Create an order
  async createOrder(
    recipient: PrintfulRecipient,
    items: PrintfulOrderItem[],
    externalId?: string
  ): Promise<PrintfulOrder> {
    return this.request<PrintfulOrder>("/orders", {
      method: "POST",
      body: JSON.stringify({
        external_id: externalId,
        recipient,
        items,
      }),
    });
  }

  // Confirm an order (move to production)
  async confirmOrder(orderId: number): Promise<PrintfulOrder> {
    return this.request<PrintfulOrder>(`/orders/${orderId}/confirm`, {
      method: "POST",
    });
  }

  // Get order status
  async getOrder(orderId: number): Promise<PrintfulOrder> {
    return this.request<PrintfulOrder>(`/orders/${orderId}`);
  }

  // Get order by external ID
  async getOrderByExternalId(externalId: string): Promise<PrintfulOrder> {
    return this.request<PrintfulOrder>(`/orders/@${externalId}`);
  }

  // Calculate shipping rates
  async calculateShipping(
    recipient: PrintfulRecipient,
    items: PrintfulOrderItem[]
  ): Promise<any[]> {
    return this.request<any[]>("/shipping/rates", {
      method: "POST",
      body: JSON.stringify({
        recipient,
        items,
      }),
    });
  }
}

// Create Printful client instance
export function createPrintfulClient(): PrintfulAPI | null {
  const apiKey = process.env.PRINTFUL_API_KEY;
  
  if (!apiKey) {
    console.log("Printful API key not configured - shop sync disabled");
    return null;
  }
  
  return new PrintfulAPI(apiKey);
}

// Sync products from Printful to local database
export async function syncPrintfulProducts(db: any, shopProducts: any): Promise<number> {
  const client = createPrintfulClient();
  if (!client) return 0;
  
  try {
    const products = await client.getSyncProducts();
    let syncedCount = 0;
    
    for (const product of products) {
      if (product.is_ignored) continue;
      
      // Get full product details with variants
      const fullProduct = await client.getSyncProduct(product.id);
      
      for (const variant of fullProduct.sync_variants) {
        // Check if product already exists
        const existing = await db.select().from(shopProducts)
          .where((col: any) => col.printfulVariantId.equals(variant.id.toString()))
          .limit(1);
        
        const productData = {
          name: `${product.name} - ${variant.name}`,
          description: null,
          price: variant.retail_price,
          imageUrl: variant.files?.[0]?.preview_url || variant.product?.image || product.thumbnail_url,
          category: "Apparel",
          printfulProductId: product.id.toString(),
          printfulVariantId: variant.id.toString(),
          inStock: variant.synced,
          isActive: true,
        };
        
        if (existing.length > 0) {
          // Update existing
          await db.update(shopProducts)
            .set(productData)
            .where((col: any) => col.id.equals(existing[0].id));
        } else {
          // Insert new
          await db.insert(shopProducts).values(productData);
        }
        
        syncedCount++;
      }
    }
    
    return syncedCount;
  } catch (error) {
    console.error("Printful sync error:", error);
    throw error;
  }
}

// Submit order to Printful
export async function submitOrderToPrintful(
  order: {
    id: number;
    shippingName: string | null;
    shippingAddress: string | null;
    shippingCity: string | null;
    shippingState: string | null;
    shippingZip: string | null;
    shippingCountry: string | null;
  },
  product: {
    printfulVariantId: string | null;
    price: string;
  },
  quantity: number = 1
): Promise<{ printfulOrderId: string; status: string } | null> {
  const client = createPrintfulClient();
  if (!client) {
    console.log("Printful not configured, order not submitted");
    return null;
  }
  
  if (!product.printfulVariantId) {
    console.log("Product has no Printful variant ID");
    return null;
  }
  
  try {
    const recipient: PrintfulRecipient = {
      name: order.shippingName || "Customer",
      address1: order.shippingAddress || "",
      city: order.shippingCity || "",
      state_code: order.shippingState || "",
      country_code: order.shippingCountry || "US",
      zip: order.shippingZip || "",
    };
    
    const items: PrintfulOrderItem[] = [{
      sync_variant_id: parseInt(product.printfulVariantId),
      quantity,
      retail_price: product.price,
    }];
    
    // Create draft order
    const printfulOrder = await client.createOrder(
      recipient,
      items,
      `margin-${order.id}`
    );
    
    // Confirm order to send to production
    const confirmedOrder = await client.confirmOrder(printfulOrder.id);
    
    return {
      printfulOrderId: confirmedOrder.id.toString(),
      status: confirmedOrder.status,
    };
  } catch (error) {
    console.error("Printful order submission error:", error);
    throw error;
  }
}

export { PrintfulAPI };
