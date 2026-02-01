# Local Development Setup Guide

This guide walks you through setting up Margin locally to mirror your live marginhq.org environment.

## Prerequisites

- **Node.js** 18+ 
- **npm** 9+
- **PostgreSQL** 14+ (local or remote)
- **Git**

## Quick Start

### 1. Clone and Install

```bash
git clone <your-repo>
cd margin-app-export
npm install
```

### 2. Set Up Environment Variables

Copy the example file and fill in your API keys:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your keys. **Critical variables:**

```
DATABASE_URL=postgresql://user:password@localhost:5432/margin
AI_INTEGRATIONS_OPENAI_API_KEY=sk-...
EBAY_CLIENT_ID=...
EBAY_CLIENT_SECRET=...
SERPAPI_KEY=...
STRIPE_SECRET_KEY=...
```

### 3. Set Up Database

If you're using your live database, update `DATABASE_URL` to point to it.

If setting up locally for the first time:

```bash
# Create PostgreSQL database
createdb margin

# Run migrations
npm run db:push
```

### 4. Start Development Server

```bash
npm run dev
```

Server runs on `http://localhost:5000` by default.

Open `http://localhost:3000` in your browser for the client (Vite dev server runs alongside).

## Environment Variables

### Required (App won't run without these)

- **DATABASE_URL** — PostgreSQL connection string
- **AI_INTEGRATIONS_OPENAI_API_KEY** or **OPENAI_API_KEY** — OpenAI API key (used for vision, text extraction)

### Strongly Recommended (Core Features)

- **EBAY_CLIENT_ID** / **EBAY_CLIENT_SECRET** — eBay API credentials (for sold listings)
- **SERPAPI_KEY** — SerpAPI key (fallback for comparables)
- **STRIPE_SECRET_KEY** — Stripe API secret (payment processing)

### Optional (Advanced Features)

- **JINA_API_KEY** — Image embeddings for visual matching library
- **GOOGLE_API_KEY** / **GOOGLE_SEARCH_ENGINE_ID** — Google Search (research mode)
- **VAPID_PUBLIC_KEY** / **VAPID_PRIVATE_KEY** — Web push notifications
- **PRINTFUL_API_KEY** — Print-on-demand integration

### Auto-Set by Replit (Override if Needed)

- **REPLIT_DOMAINS** — Webhook base URL
- **REPLIT_CONNECTORS_HOSTNAME** — Stripe connector endpoint
- **REPL_IDENTITY** / **WEB_REPL_RENEWAL** — Replit auth tokens

See `.env.example` for full list.

## Running Commands

### Development

```bash
npm run dev       # Start dev server (TypeScript auto-compiled)
npm run check     # TypeScript type check (no build)
```

### Production Build & Testing

```bash
npm run build     # Build client & server
npm start         # Run production build locally
```

### Database

```bash
npm run db:push   # Apply Drizzle migrations
```

## Connecting to Live Database

If your live database is accessible from your local machine:

1. Get the production `DATABASE_URL`
2. Update `.env.local`:
   ```
   DATABASE_URL=postgresql://user:password@prod-host:5432/margin
   ```
3. Run `npm run dev`

**Warning:** This will connect to live data. Be cautious with mutations.

## Troubleshooting

### `DATABASE_URL must be set`
Add `DATABASE_URL` to `.env.local` and restart the server.

### `npm run dev` hangs
Check that PostgreSQL is running and `DATABASE_URL` is correct.

### Build fails with TypeScript errors
Run `npm run check` to see all errors, then fix before rebuilding.

### API integration failures
- OpenAI: Check `AI_INTEGRATIONS_OPENAI_API_KEY` or `OPENAI_API_KEY`
- eBay: Verify `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET`
- SerpAPI: Check `SERPAPI_KEY`

## Architecture

- **Client:** React 18 + TypeScript, Vite, Tailwind CSS
- **Server:** Node.js + Express, TypeScript (ESM)
- **Database:** PostgreSQL + Drizzle ORM
- **Authentication:** Passport.js (local strategy)

## Next Steps

1. Set up `.env.local` with all API keys
2. Ensure PostgreSQL is running and `DATABASE_URL` is valid
3. Run `npm run dev`
4. Test core flows: scan, identification, pricing
5. Verify integrations (eBay, OpenAI, Stripe) work end-to-end

## Support

For deployment issues or integration help, check:
- `replit.md` — Full system architecture
- `server/index.ts` — Server initialization
- `server/routes.ts` — API endpoints
