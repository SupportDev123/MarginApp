import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from './stripeClient';
import { WebhookHandlers } from './webhookHandlers';
import { startEmailScheduler, triggerTestEmail } from './scheduledEmails';
import { runToolImageSeeder } from './tool-image-seeder';
import { runHandbagImageSeeder } from './handbag-image-seeder';
import { runAntiqueImageSeeder } from './antique-image-seeder';
import { runGamingImageSeeder } from './gaming-image-seeder';
import { runVintageImageSeeder } from './vintage-image-seeder';
import { runElectronicsImageSeeder } from './electronics-image-seeder';
import { runToyImageSeeder } from './toy-image-seeder';
import { runCardImageSeeder } from './card-image-seeder';
import { runSerpApiWatchSeeder as runWatchImageSeeder } from './serpapi-watch-seeder';
import { preWarmOpenAIClient } from './visual-matching';
import { startPriceAlertChecker } from './price-alert-checker';

// SPEED OPTIMIZATION: Pre-warm OpenAI client to avoid cold-start delay on first scan
preWarmOpenAIClient();

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('DATABASE_URL not found, skipping Stripe initialization');
    return;
  }

  try {
    console.log('Initializing Stripe schema...');
    await runMigrations({ databaseUrl });
    console.log('Stripe schema ready');

    const stripeSync = await getStripeSync();

    console.log('Setting up managed webhook...');
    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    if (webhookBaseUrl && webhookBaseUrl !== 'https://undefined') {
      const result = await stripeSync.findOrCreateManagedWebhook(
        `${webhookBaseUrl}/api/stripe/webhook`
      );
      if (result?.webhook) {
        console.log(`Webhook configured: ${result.webhook.url}`);
      } else {
        console.log('Webhook setup skipped (no webhook returned)');
      }
    } else {
      console.log('Webhook setup skipped (no REPLIT_DOMAINS)');
    }

    console.log('Syncing Stripe data...');
    stripeSync.syncBackfill()
      .then(() => console.log('Stripe data synced'))
      .catch((err: any) => console.error('Error syncing Stripe data:', err));
  } catch (error) {
    console.error('Failed to initialize Stripe:', error);
  }
}

// Start Stripe initialization in background (non-blocking to allow server to start quickly)
initStripe().catch(err => console.error('Stripe init error:', err));

app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;
      if (!Buffer.isBuffer(req.body)) {
        console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
        return res.status(500).json({ error: 'Webhook processing error' });
      }

      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

app.use(
  express.json({
    limit: '20mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      // Start email scheduler for daily stats at 9 AM and 9 PM EST
      startEmailScheduler();
      // Start price alert background checker
      startPriceAlertChecker();
      
      // Auto-seed visual matching libraries on startup
      // Priority: Trading Cards > Watches > Electronics (user-selected high-value categories)
      // Stagger by 90 seconds to avoid concurrent rate limits
      setTimeout(() => {
        console.log('[Auto-Seeder] Starting Trading Cards library seeder (priority 1)...');
        runCardImageSeeder().catch(err => console.error('[Auto-Seeder] Card seeder error:', err));
      }, 3000);
      
      setTimeout(() => {
        console.log('[Auto-Seeder] Starting Watch library seeder (priority 2)...');
        runWatchImageSeeder().catch(err => console.error('[Auto-Seeder] Watch seeder error:', err));
      }, 90000);
      
      setTimeout(() => {
        console.log('[Auto-Seeder] Starting Electronics library seeder (priority 3)...');
        runElectronicsImageSeeder().catch(err => console.error('[Auto-Seeder] Electronics seeder error:', err));
      }, 180000);
      
      setTimeout(() => {
        console.log('[Auto-Seeder] Starting Antique library seeder (priority 4 - reduced scope)...');
        runAntiqueImageSeeder().catch(err => console.error('[Auto-Seeder] Antique seeder error:', err));
      }, 270000);
      
      // Lower priority seeders (already at target or nearly there)
      setTimeout(() => {
        console.log('[Auto-Seeder] Starting Gaming library seeder...');
        runGamingImageSeeder().catch(err => console.error('[Auto-Seeder] Gaming seeder error:', err));
      }, 360000);
      
      setTimeout(() => {
        console.log('[Auto-Seeder] Starting Toys library seeder...');
        runToyImageSeeder().catch(err => console.error('[Auto-Seeder] Toy seeder error:', err));
      }, 450000);
      
      setTimeout(() => {
        console.log('[Auto-Seeder] Starting Tool library seeder...');
        runToolImageSeeder().catch(err => console.error('[Auto-Seeder] Tool seeder error:', err));
      }, 540000);
    },
  );
})();

// Admin endpoint to test email sending
app.post('/api/admin/test-email', async (req: any, res) => {
  if (!req.isAuthenticated?.() || !req.user?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  try {
    const success = await triggerTestEmail();
    res.json({ success, message: success ? 'Test email sent' : 'Failed to send email' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
