import { db } from './db';
import { priceAlerts } from '@shared/schema';
import { eq, and, asc } from 'drizzle-orm';
import { notifyPriceAlert } from './push-service';

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // Check every 30 minutes
const BATCH_SIZE = 20; // Process 20 alerts per cycle, ordered by lastChecked

interface EbayItemPrice {
  itemId: string;
  currentPrice: number;
  available: boolean;
}

// Token cache to avoid re-authenticating for each item
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getEbayAccessToken(): Promise<string | null> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 5 * 60 * 1000) {
    return cachedToken.token;
  }

  const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID;
  const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;
  
  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) {
    console.log('[PriceAlert] eBay API not configured');
    return null;
  }

  try {
    const authResponse = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
    });

    if (!authResponse.ok) {
      console.error('[PriceAlert] eBay auth failed:', authResponse.status);
      return null;
    }

    const data = await authResponse.json();
    const expiresIn = data.expires_in || 7200; // Default 2 hours
    
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + expiresIn * 1000,
    };
    
    console.log('[PriceAlert] eBay token cached');
    return cachedToken.token;
  } catch (error) {
    console.error('[PriceAlert] eBay auth error:', error);
    return null;
  }
}

async function fetchEbayPrice(ebayItemId: string, accessToken: string): Promise<EbayItemPrice | null> {
  try {
    const itemResponse = await fetch(
      `https://api.ebay.com/buy/browse/v1/item/v1|${ebayItemId}|0`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        },
      }
    );

    if (!itemResponse.ok) {
      if (itemResponse.status === 404 || itemResponse.status === 410) {
        return { itemId: ebayItemId, currentPrice: 0, available: false };
      }
      console.error(`[PriceAlert] eBay API error for ${ebayItemId}: ${itemResponse.status}`);
      return null;
    }

    const item = await itemResponse.json();
    const price = parseFloat(item.price?.value || '0');

    return {
      itemId: ebayItemId,
      currentPrice: price,
      available: item.itemEndDate ? new Date(item.itemEndDate) > new Date() : true,
    };
  } catch (error) {
    console.error('[PriceAlert] Error fetching eBay price:', error);
    return null;
  }
}

async function checkPriceAlerts(): Promise<void> {
  console.log('[PriceAlert] Starting price check cycle...');

  // Get cached token once per cycle
  const accessToken = await getEbayAccessToken();
  if (!accessToken) {
    console.log('[PriceAlert] No eBay access token, skipping cycle');
    return;
  }

  // Get active alerts ordered by lastChecked (null first, then oldest)
  // This ensures rotation through all alerts across cycles
  const activeAlerts = await db
    .select()
    .from(priceAlerts)
    .where(
      and(
        eq(priceAlerts.isActive, true),
        eq(priceAlerts.alertTriggered, false)
      )
    )
    .orderBy(asc(priceAlerts.lastChecked))
    .limit(BATCH_SIZE);

  if (activeAlerts.length === 0) {
    console.log('[PriceAlert] No active alerts to check');
    return;
  }

  console.log(`[PriceAlert] Checking ${activeAlerts.length} alerts...`);

  for (const alert of activeAlerts) {
    if (!alert.ebayItemId) {
      // Mark as checked even without eBay ID
      await db
        .update(priceAlerts)
        .set({ lastChecked: new Date() })
        .where(eq(priceAlerts.id, alert.id));
      continue;
    }

    const priceData = await fetchEbayPrice(alert.ebayItemId, accessToken);
    
    // Always update lastChecked to ensure rotation even on failures
    if (!priceData) {
      await db
        .update(priceAlerts)
        .set({ lastChecked: new Date() })
        .where(eq(priceAlerts.id, alert.id));
      continue;
    }

    // Update the alert with current price
    await db
      .update(priceAlerts)
      .set({
        currentPrice: priceData.currentPrice.toString(),
        lastChecked: new Date(),
        isActive: priceData.available,
      })
      .where(eq(priceAlerts.id, alert.id));

    // Check if price dropped below threshold
    const maxBuyPrice = alert.maxBuyPrice ? parseFloat(alert.maxBuyPrice) : null;
    
    if (maxBuyPrice && priceData.currentPrice <= maxBuyPrice && priceData.available) {
      console.log(`[PriceAlert] Price drop detected for "${alert.title}": $${priceData.currentPrice} <= $${maxBuyPrice}`);
      
      // Trigger notification
      await notifyPriceAlert(
        alert.userId,
        alert.title,
        priceData.currentPrice,
        maxBuyPrice
      );

      // Mark alert as triggered
      await db
        .update(priceAlerts)
        .set({
          alertTriggered: true,
          alertTriggeredAt: new Date(),
        })
        .where(eq(priceAlerts.id, alert.id));
    }

    // Small delay between API calls to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log('[PriceAlert] Price check cycle complete');
}

let checkInterval: NodeJS.Timeout | null = null;

export function startPriceAlertChecker(): void {
  if (checkInterval) {
    console.log('[PriceAlert] Checker already running');
    return;
  }

  console.log('[PriceAlert] Starting background price checker (30 min interval)');
  
  // Run immediately on start
  checkPriceAlerts().catch(err => {
    console.error('[PriceAlert] Initial check failed:', err);
  });

  // Then run every 30 minutes
  checkInterval = setInterval(() => {
    checkPriceAlerts().catch(err => {
      console.error('[PriceAlert] Scheduled check failed:', err);
    });
  }, CHECK_INTERVAL_MS);
}

export function stopPriceAlertChecker(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    console.log('[PriceAlert] Checker stopped');
  }
}

export { checkPriceAlerts };
