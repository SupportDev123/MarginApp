// Stripe webhook handlers for subscription and payment events
// Reference: stripe integration blueprint

import { getStripeSync } from './stripeClient';
import { storage } from './storage';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);
    
    // Parse the event from the raw payload
    try {
      const event = JSON.parse(payload.toString());
      await WebhookHandlers.handleSubscriptionEvent(event);
      await WebhookHandlers.handleInvoiceEvent(event);
      await WebhookHandlers.handleChargeEvent(event);
    } catch (err) {
      console.error('Error handling webhook event:', err);
    }
  }
  
  static async handleSubscriptionEvent(event: any): Promise<void> {
    // Handle subscription created/updated events
    if (event.type === 'customer.subscription.created' || 
        event.type === 'customer.subscription.updated') {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      const status = subscription.status;
      
      // Find user by stripe customer ID
      const user = await storage.getUserByStripeCustomerId(customerId);
      if (user) {
        // Update subscription tier based on subscription status
        const newTier = (status === 'active' || status === 'trialing') ? 'pro' : 'free';
        await storage.updateUserSubscription(user.id, {
          subscriptionTier: newTier,
          stripeSubscriptionId: subscription.id
        });
        console.log(`[Subscription] Updated user ${user.id} to ${newTier} tier`);
      }
    }
    
    // Handle subscription deleted/canceled - void all pending commissions
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      
      const user = await storage.getUserByStripeCustomerId(customerId);
      if (user) {
        await storage.updateUserSubscription(user.id, {
          subscriptionTier: 'free',
          stripeSubscriptionId: null
        });
        console.log(`[Subscription] Downgraded user ${user.id} to free tier`);
        
        // Void any pending/eligible commissions for this subscription
        const voidedCount = await storage.voidCommissionsForSubscription(
          subscription.id, 
          'cancellation'
        );
        if (voidedCount > 0) {
          console.log(`[Partner] Voided ${voidedCount} commissions for cancelled subscription ${subscription.id}`);
        }
      }
    }
  }

  // Handle invoice.paid events - create partner commissions with 45-day delay
  static async handleInvoiceEvent(event: any): Promise<void> {
    if (event.type !== 'invoice.paid') return;
    
    const invoice = event.data.object;
    
    // Only process subscription invoices with actual payment
    if (!invoice.subscription || invoice.amount_paid <= 0) {
      return;
    }
    
    // Skip trials and zero-amount invoices
    if (invoice.billing_reason === 'subscription_create' && invoice.amount_paid === 0) {
      console.log(`[Partner] Skipping trial invoice ${invoice.id}`);
      return;
    }
    
    const customerId = invoice.customer;
    const user = await storage.getUserByStripeCustomerId(customerId);
    
    if (!user || !user.referredBy) {
      return; // No user found or user wasn't referred
    }
    
    // Prevent self-referral (check if referrer is the same as user)
    if (user.referredBy === user.id) {
      console.log(`[Partner] Blocked self-referral for user ${user.id}`);
      return;
    }
    
    // Check if commission already exists for this invoice (prevent duplicates)
    const existingCommission = await storage.getCommissionByInvoice(invoice.id);
    if (existingCommission) {
      console.log(`[Partner] Commission already exists for invoice ${invoice.id}`);
      return;
    }
    
    // Get partner program settings
    const settings = await storage.getPartnerProgramSettings();
    if (!settings || !settings.isActive) {
      console.log(`[Partner] Partner program is disabled, skipping commission`);
      return;
    }
    
    // Calculate commission (amount_paid is in cents)
    const commissionRate = settings.commissionRate / 100; // Convert 30 to 0.30
    const commissionCents = Math.round(invoice.amount_paid * commissionRate);
    
    // Calculate unlock date (45 days from now by default)
    const unlockAt = new Date();
    unlockAt.setDate(unlockAt.getDate() + settings.payoutDelayDays);
    
    const paymentMonth = new Date().toISOString().slice(0, 7); // "2026-01"
    
    try {
      await storage.createPartnerCommission({
        affiliateId: user.referredBy,
        referredUserId: user.id,
        amountCents: commissionCents,
        stripeInvoiceId: invoice.id,
        stripeSubscriptionId: invoice.subscription,
        paymentMonth,
        unlockAt,
      });
      
      console.log(`[Partner] Created $${(commissionCents / 100).toFixed(2)} commission for partner ${user.referredBy} from user ${user.id} (unlocks ${unlockAt.toISOString().slice(0, 10)})`);
    } catch (err) {
      console.error('[Partner] Failed to create commission:', err);
    }
  }

  // Handle charge.refunded events - void commissions for refunded payments
  static async handleChargeEvent(event: any): Promise<void> {
    if (event.type !== 'charge.refunded') return;
    
    const charge = event.data.object;
    const invoiceId = charge.invoice;
    
    if (!invoiceId) return;
    
    // Find the commission for this invoice and void it
    const commission = await storage.getCommissionByInvoice(invoiceId);
    if (commission && commission.status !== 'paid' && commission.status !== 'void') {
      await storage.voidCommissionsForSubscription(
        commission.stripeSubscriptionId || '', 
        'refund'
      );
      console.log(`[Partner] Voided commission ${commission.id} due to refund on invoice ${invoiceId}`);
    }
  }
}
