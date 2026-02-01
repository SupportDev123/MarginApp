// Stripe product seed script for Pro and Elite subscriptions
// Run with: npx tsx server/seed-stripe-products.ts

import { getUncachableStripeClient } from './stripeClient';

async function createProducts() {
  const stripe = await getUncachableStripeClient();

  // ==================== PRO TIER ($24.99/month) ====================
  const existingProProducts = await stripe.products.search({ 
    query: "name:'Margin Pro'" 
  });
  
  let proProductId: string;
  
  if (existingProProducts.data.length > 0) {
    proProductId = existingProProducts.data[0].id;
    console.log('Margin Pro product already exists:', proProductId);
    
    // Update description
    await stripe.products.update(proProductId, {
      description: 'Unlimited scans, 30-day history, batch scanning, live capture mode',
      metadata: {
        tier: 'pro',
        features: 'unlimited_scans,30_day_history,batch_scanning,live_capture,ar_unlimited'
      }
    });
    
    // Check for existing $24.99 price
    const existingPrices = await stripe.prices.list({
      product: proProductId,
      active: true
    });
    
    const has2499Price = existingPrices.data.some(p => p.unit_amount === 2499 && p.recurring?.interval === 'month');
    
    if (!has2499Price) {
      console.log('Creating new $24.99/month price for Pro...');
      const newPrice = await stripe.prices.create({
        product: proProductId,
        unit_amount: 2499, // $24.99
        currency: 'usd',
        recurring: { interval: 'month' },
        metadata: { plan: 'pro_monthly' }
      });
      console.log('Created $24.99/month price:', newPrice.id);
      
      // Deactivate old prices
      for (const oldPrice of existingPrices.data) {
        if (oldPrice.unit_amount !== 2499) {
          await stripe.prices.update(oldPrice.id, { active: false });
          console.log('Deactivated old price:', oldPrice.id, `($${(oldPrice.unit_amount || 0) / 100}/month)`);
        }
      }
    } else {
      console.log('$24.99/month Pro price already exists');
    }
  } else {
    // Create Pro subscription product
    const product = await stripe.products.create({
      name: 'Margin Pro',
      description: 'Unlimited scans, 30-day history, batch scanning, live capture mode',
      metadata: {
        tier: 'pro',
        features: 'unlimited_scans,30_day_history,batch_scanning,live_capture,ar_unlimited'
      }
    });
    proProductId = product.id;
    console.log('Created Pro product:', product.id);

    // Create monthly price - $24.99/month
    const monthlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: 2499, // $24.99
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: { plan: 'pro_monthly' }
    });
    console.log('Created Pro monthly price:', monthlyPrice.id, '- $24.99/month');
  }

  // ==================== ELITE TIER ($49.99/month) ====================
  const existingEliteProducts = await stripe.products.search({ 
    query: "name:'Margin Elite'" 
  });
  
  let eliteProductId: string;
  
  if (existingEliteProducts.data.length > 0) {
    eliteProductId = existingEliteProducts.data[0].id;
    console.log('Margin Elite product already exists:', eliteProductId);
    
    // Check for existing $49.99 price
    const existingPrices = await stripe.prices.list({
      product: eliteProductId,
      active: true
    });
    
    const has4999Price = existingPrices.data.some(p => p.unit_amount === 4999 && p.recurring?.interval === 'month');
    
    if (!has4999Price) {
      console.log('Creating new $49.99/month price for Elite...');
      const newPrice = await stripe.prices.create({
        product: eliteProductId,
        unit_amount: 4999, // $49.99
        currency: 'usd',
        recurring: { interval: 'month' },
        metadata: { plan: 'elite_monthly' }
      });
      console.log('Created $49.99/month price:', newPrice.id);
    } else {
      console.log('$49.99/month Elite price already exists');
    }
  } else {
    // Create Elite subscription product
    const product = await stripe.products.create({
      name: 'Margin Elite',
      description: 'Everything in Pro + permanent history, 3 team seats, tax reports, data export',
      metadata: {
        tier: 'elite',
        features: 'unlimited_scans,permanent_history,batch_scanning,live_capture,ar_unlimited,team_seats_3,tax_reports,data_export,advanced_analytics'
      }
    });
    eliteProductId = product.id;
    console.log('Created Elite product:', product.id);

    // Create monthly price - $49.99/month
    const monthlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: 4999, // $49.99
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: { plan: 'elite_monthly' }
    });
    console.log('Created Elite monthly price:', monthlyPrice.id, '- $49.99/month');
  }

  console.log('\n==================== SUMMARY ====================');
  console.log('Pro Product ID:', proProductId);
  console.log('Elite Product ID:', eliteProductId);
  console.log('\nProducts created/updated successfully!');
}

createProducts().catch(console.error);
