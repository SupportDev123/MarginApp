import { z } from 'zod';
import { items, inventoryItems, inventoryStatuses, businessExpenses, sourcingLocations } from './schema';

export const expenseCategories = [
  'mileage',
  'shipping_supplies',
  'platform_fees',
  'software',
  'equipment',
  'office_supplies',
  'storage',
  'education',
  'other',
] as const;

export const sourcingLocationTypes = [
  'thrift',
  'estate_sale',
  'yard_sale',
  'auction',
  'online',
  'retail_arbitrage',
  'other',
] as const;

export const salePlatforms = [
  'ebay',
  'mercari',
  'poshmark',
  'facebook',
  'offerup',
  'whatnot',
  'other',
] as const;

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  auth: {
    register: {
        method: 'POST' as const,
        path: '/api/register',
        input: z.object({ 
            email: z.string().email(),
            password: z.string(),
            referralCode: z.string().optional(),
        }),
        responses: { 201: z.object({ id: z.number(), username: z.string() }) }
    },
    forgotPassword: {
        method: 'POST' as const,
        path: '/api/forgot-password',
        input: z.object({ email: z.string().email() }),
        responses: { 200: z.object({ message: z.string() }) }
    },
    resetPassword: {
        method: 'POST' as const,
        path: '/api/reset-password',
        input: z.object({ token: z.string(), password: z.string().min(6) }),
        responses: { 200: z.object({ message: z.string() }) }
    },
    login: {
        method: 'POST' as const,
        path: '/api/login',
        input: z.object({ email: z.string().min(1), password: z.string() }),
        responses: { 200: z.object({ id: z.number(), username: z.string() }) }
    },
    logout: {
        method: 'POST' as const,
        path: '/api/logout',
        responses: { 200: z.void() }
    },
    me: {
        method: 'GET' as const,
        path: '/api/user',
        responses: { 200: z.object({ id: z.number(), username: z.string() }).nullable() }
    }
  },
  items: {
    extract: {
      method: 'POST' as const,
      path: '/api/items/extract',
      input: z.object({ url: z.string().url() }),
      responses: {
        200: z.object({
          needsConfirmation: z.boolean(),
          item: z.object({
            title: z.string().optional(),
            price: z.string().optional(),
            condition: z.string().optional(),
            shipping: z.string().optional(),
            url: z.string(),
            suggestedCategory: z.enum(['Collectibles', 'Shoes', 'Watches', 'Trading Cards', 'Electronics', 'Sports Memorabilia', 'Other']).nullable().optional(),
          })
        }),
      },
    },
    confirmAndAnalyze: {
      method: 'POST' as const,
      path: '/api/items/analyze',
      input: z.object({
        url: z.string(),
        title: z.string(),
        price: z.string(),
        condition: z.string(),
        shipping: z.string(),
        category: z.enum(['Collectibles', 'Shoes', 'Watches', 'Trading Cards', 'Electronics', 'Sports Memorabilia', 'Other']).nullable().optional(),
        manualCompPrices: z.array(z.number().positive()).max(5).optional().nullable(),
        compSource: z.enum(['ebay_api', 'manual', 'none']).optional().nullable(),
        sourceType: z.enum(['url', 'camera']).optional(),
        watchBrand: z.string().nullable().optional(),
        watchFamily: z.string().nullable().optional(),
        watchBandType: z.string().nullable().optional(),
        watchMovementType: z.string().nullable().optional(),
        watchDialColor: z.string().nullable().optional(),
        watchDialStyle: z.string().nullable().optional(),
        watchBezelColor: z.string().nullable().optional(),
        scanMode: z.enum(['flip', 'buy']).optional(),
      }),
      responses: {
        200: z.custom<typeof items.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    list: {
      method: 'GET' as const,
      path: '/api/items',
      responses: {
        200: z.array(z.custom<typeof items.$inferSelect>()),
      },
    },
    updateDecision: {
      method: 'PATCH' as const,
      path: '/api/items/:id/decision',
      input: z.object({
        decision: z.enum(['flip', 'skip']).nullable(),
      }),
      responses: {
        200: z.custom<typeof items.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    updateFlipPrice: {
      method: 'PATCH' as const,
      path: '/api/items/:id/flip',
      input: z.object({
        flipPrice: z.number().positive(),
      }),
      responses: {
        200: z.custom<typeof items.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  user: {
    scanStatus: {
      method: 'GET' as const,
      path: '/api/user/scan-status',
      responses: {
        200: z.object({
          tier: z.enum(['free', 'pro']),
          scansRemaining: z.number(),
          scansLimit: z.number(),
          canScan: z.boolean(),
        }),
      },
    },
  },
  inventory: {
    list: {
      method: 'GET' as const,
      path: '/api/inventory',
      responses: {
        200: z.array(z.custom<typeof inventoryItems.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/inventory',
      input: z.object({
        itemId: z.number().optional().nullable(),
        title: z.string(),
        imageUrl: z.string().optional().nullable(),
        estimatedResale: z.string().optional().nullable(),
        purchasePrice: z.string(),
        feesEstimate: z.string().optional().nullable(),
        shippingEstimate: z.string().optional().nullable(),
        condition: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        category: z.string().optional().nullable(),
        brand: z.string().optional().nullable(),
        sourceLocationId: z.number().optional().nullable(),
        sourceLocationName: z.string().optional().nullable(),
        storageLocation: z.string().optional().nullable(),
        salePlatform: z.enum(salePlatforms).optional().nullable(),
        platformFeeActual: z.string().optional().nullable(),
      }),
      responses: {
        201: z.custom<typeof inventoryItems.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/inventory/:id',
      input: z.object({
        status: z.enum(inventoryStatuses).optional(),
        listedDate: z.string().optional().nullable(),
        soldDate: z.string().optional().nullable(),
        actualSalePrice: z.string().optional().nullable(),
        outboundShippingActual: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        sourceLocationId: z.number().optional().nullable(),
        sourceLocationName: z.string().optional().nullable(),
        storageLocation: z.string().optional().nullable(),
        salePlatform: z.enum(salePlatforms).optional().nullable(),
        platformFeeActual: z.string().optional().nullable(),
      }),
      responses: {
        200: z.custom<typeof inventoryItems.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/inventory/:id',
      responses: {
        200: z.object({ success: z.boolean() }),
        404: errorSchemas.notFound,
      },
    },
  },
  expenses: {
    list: {
      method: 'GET' as const,
      path: '/api/expenses',
      responses: {
        200: z.array(z.custom<typeof businessExpenses.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/expenses',
      input: z.object({
        category: z.enum(expenseCategories),
        description: z.string().min(1),
        amount: z.string(),
        date: z.string(),
        miles: z.string().optional().nullable(),
        mileageRate: z.string().optional().nullable(),
        startLocation: z.string().optional().nullable(),
        endLocation: z.string().optional().nullable(),
        receiptUrl: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        taxYear: z.number(),
      }),
      responses: {
        201: z.custom<typeof businessExpenses.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/expenses/:id',
      input: z.object({
        category: z.enum(expenseCategories).optional(),
        description: z.string().min(1).optional(),
        amount: z.string().optional(),
        date: z.string().optional(),
        miles: z.string().optional().nullable(),
        mileageRate: z.string().optional().nullable(),
        startLocation: z.string().optional().nullable(),
        endLocation: z.string().optional().nullable(),
        receiptUrl: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        taxYear: z.number().optional(),
      }),
      responses: {
        200: z.custom<typeof businessExpenses.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/expenses/:id',
      responses: {
        200: z.object({ success: z.boolean() }),
        404: errorSchemas.notFound,
      },
    },
  },
  sourcingLocations: {
    list: {
      method: 'GET' as const,
      path: '/api/sourcing-locations',
      responses: {
        200: z.array(z.custom<typeof sourcingLocations.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/sourcing-locations',
      input: z.object({
        name: z.string().min(1),
        type: z.enum(sourcingLocationTypes),
        address: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      }),
      responses: {
        201: z.custom<typeof sourcingLocations.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/sourcing-locations/:id',
      input: z.object({
        name: z.string().min(1).optional(),
        type: z.enum(sourcingLocationTypes).optional(),
        address: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      }),
      responses: {
        200: z.custom<typeof sourcingLocations.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/sourcing-locations/:id',
      responses: {
        200: z.object({ success: z.boolean() }),
        404: errorSchemas.notFound,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
