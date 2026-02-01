import webpush from 'web-push';
import { db } from './db';
import { pushSubscriptions } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Generate VAPID keys if not set (run once and save to env)
// const vapidKeys = webpush.generateVAPIDKeys();
// console.log('VAPID Public Key:', vapidKeys.publicKey);
// console.log('VAPID Private Key:', vapidKeys.privateKey);

// Initialize web-push with VAPID details
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = 'mailto:support@marginhq.org';

let pushEnabled = false;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  pushEnabled = true;
  console.log('[Push] Web Push notifications enabled');
} else {
  console.log('[Push] Web Push notifications disabled (missing VAPID keys)');
}

export function isPushEnabled(): boolean {
  return pushEnabled;
}

export function getVapidPublicKey(): string | null {
  return VAPID_PUBLIC_KEY || null;
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  data?: {
    url?: string;
    [key: string]: any;
  };
}

export async function saveSubscription(
  userId: number,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
): Promise<void> {
  // Upsert subscription (replace if endpoint exists)
  await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    });
    
  console.log(`[Push] Saved subscription for user ${userId}`);
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  console.log('[Push] Removed subscription');
}

export async function sendPushToUser(userId: number, payload: PushPayload): Promise<number> {
  if (!pushEnabled) {
    console.log('[Push] Push not enabled, skipping notification');
    return 0;
  }

  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  let sentCount = 0;
  
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        JSON.stringify(payload)
      );
      sentCount++;
    } catch (error: any) {
      // If subscription is invalid/expired, remove it
      if (error.statusCode === 404 || error.statusCode === 410) {
        await removeSubscription(sub.endpoint);
        console.log('[Push] Removed expired subscription');
      } else {
        console.error('[Push] Error sending notification:', error.message);
      }
    }
  }

  return sentCount;
}

// Convenience methods for common notifications
export async function notifyPriceAlert(
  userId: number,
  itemName: string,
  newPrice: number,
  targetPrice: number
): Promise<void> {
  await sendPushToUser(userId, {
    title: 'Price Alert!',
    body: `${itemName} is now $${newPrice.toFixed(2)} (target: $${targetPrice.toFixed(2)})`,
    tag: 'price-alert',
    data: {
      url: '/alerts',
    },
  });
}

export async function notifyScanComplete(
  userId: number,
  verdict: 'flip' | 'skip',
  itemName: string,
  profit?: number
): Promise<void> {
  const title = verdict === 'flip' ? 'Flip It!' : 'Skip It';
  const body = verdict === 'flip' && profit
    ? `${itemName} - Potential profit: $${profit.toFixed(2)}`
    : `${itemName} - Not worth it`;
    
  await sendPushToUser(userId, {
    title,
    body,
    tag: 'scan-result',
    data: {
      url: '/history',
    },
  });
}
