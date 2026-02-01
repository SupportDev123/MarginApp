# Margin - Reseller Profit Analysis Tool

## Overview
Margin is a mobile-first Progressive Web Application (PWA) designed to assist resellers in analyzing eBay listings for profitability. It extracts item details from eBay URLs, leverages AI for comparable sales analysis, and provides "buy/pass/risky" recommendations based on net profit calculations after accounting for various fees. The project aims to empower resellers with data-driven insights to maximize their profits and make informed purchasing decisions, focusing on efficiency and accuracy in a competitive market.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Technology Stack**: React 18 with TypeScript, Wouter for routing, TanStack React Query for server state.
- **Styling**: Tailwind CSS with shadcn/ui component library, Framer Motion for animations.
- **Build**: Vite.
- **Design**: Mobile-first approach with a bottom navigation pattern.

### Backend
- **Technology Stack**: Node.js with Express, TypeScript (ESM modules).
- **API**: RESTful, defined by shared Zod schemas.
- **Authentication**: Passport.js with local strategy and session-based authentication using express-session.

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM.
- **Session**: PostgreSQL via connect-pg-simple.
- **Key Entities**: Users, Items, DailyScans, MysteryFlips, PriceAlerts, Brands, and BrandItems.

### User Roles & Subscription Tiers
- **Admin**: Unlimited scans, permanent history.
- **Free Tier**: Limited scans (5/day), history expires (7 days), 25 inventory items.
- **Pro Tier**: Unlimited scans, permanent history, batch scan, yard sale mode, AR scan, PSA verification, grading readiness, expense tracking, tax export, listing tools, analytics.

### AI Integration
- **Provider**: OpenAI API.
- **Functionality**: Extracting item details, analyzing sold comparables, generating profit recommendations.

### Decision Engine
- **Core Logic**: Determines "Flip/Skip" verdicts based on hard gates (e.g., net profit > 0, margin > 25%).
- **Comp Processing**: Employs rigorous cleaning for sold comparables (e.g., median calculation, IQR outlier trimming) to ensure high confidence in `expectedSalePrice`. `maxBuy` is derived from cleaned comps.
- **Condition-Specific Pricing**: Separate pricing logic for "Used" and "New" conditions; never mixed.
- **LOCKED MATH**: Critical formulas and constants (Platform Fee Rate: 13%, Fixed Costs: $5, Margin Threshold: 25%) and decision gates are locked and must not be modified.

### Identification Priority Hierarchy (OCR-FIRST)
1. **OCR Text Extraction**: Uses GPT-4o-mini to extract ALL visible text. If deterministic signals detected (e.g., "Funko" + "Pop!"), objectType and brandDetected are LOCKED.
2. **Barcode Scan**: Direct lookup via PriceCharting API for UPC/EAN barcodes.
3. **Toy Pipeline**: 5-stage strict gating for Funko/LEGO only.
4. **Brand Detection**: GPT-4o-mini for quick visual check.
5. **Embedding Matching**: Jina CLIP 768-dim similarity search against image libraries.
6. **OpenAI Fallback**: GPT-4o vision identifies item from scratch if no strong match.
- **OCR Authority**: Manufacturer brands can ONLY be emitted if OCR detected deterministic text signals.

### Toy-Specific Strict Pipeline (5-Stage Gating)
- **Scope**: Applies to Funko Pop, LEGO sets.
- **Purpose**: Prevents misidentification by enforcing strict multi-stage gating.
- **Stages**: Object-Type Classification, Franchise/Line Detection, Character/Item Name Detection, Candidate Generation, Confidence Aggregation.
- **Confidence-Gated UI**: UI adapts based on confidence level, from generic labels to auto-confirm single items.

### Visual Matching Library Architecture
- **Technology**: Jina CLIP embeddings (768-dim pgvector) for picture-to-picture identification across 10 categories.
- **Card Parallel Knowledge Base**: Comprehensive checklists for trading cards (Sports, Pokemon, etc.).

### Watch Brand-First Identification
- **Brand Detection**: OCR reads brand from watch dial FIRST; pricing blocked if unreadable.
- **Model Selection Thresholds**: Always show 2-5 model candidates for user selection.
- **Completeness Flow**: Prompts for Full Set / Watch Only / Unknown to adjust pricing.
- **Learning**: User-confirmed models in 'unclassified' families flag for admin review.

### Research Mode (User-Selected Comps)
- **Purpose**: For antiques, vintage, and unique items requiring manual comparison.
- **Output**: Pricing math only (profit, margin, expected sale price), no flip/skip verdict or confidence indicators.
- **Data Isolation**: Results are never used for learning, training, or aggregation.

### Global Learning Contract
- **Strict Gates**: Learning only saved when identityConfidence is HIGH, model is confirmed, user explicitly clicked Confirm, and category is present.
- **Additive Learning**: Saves to `user_corrections` table as a separate memory layer.

### One-Tap eBay Listing Generator
- **AI-Powered**: Uses OpenAI to generate optimized eBay listings (Title, Description, Suggested Price, Category, Item Specifics, Keywords).
- **UI**: "List It Now" button with copy-to-clipboard functionality.

### PWA & Offline Support
- **Progressive Web App**: Manifest for standalone mode.
- **Service Worker**: Caches static assets, API responses, and images for offline viewing.
- **IndexedDB Storage**: Local caching of recent scans for offline access.

### Scan Categories
- **6 Core Categories**: Shoes, Watches, Trading Cards, Collectibles, Electronics, Other.
- **Trading Cards**: Includes Sports Cards, Pokemon, Magic the Gathering, Yu-Gi-Oh.
- **Collectibles**: Includes Funko Pop, LEGO, Hot Wheels, Action Figures, Toys, Marvel collectibles.
- **Data Source Priority**: eBay Finding API (FREE) → SerpAPI (paid fallback) → PriceCharting (TCG/video games only).

### Sales Analytics
- **Purpose**: Actionable sourcing feedback.
- **Metrics**: Top-Selling Brands, Category Profit, Sell-Through Rate.
- **Features**: Personalized sourcing recommendations.

### AR Profit Overlay
- **Camera-Based Scanning**: Point phone camera at items to see profit potential.
- **Real-Time Analysis**: Uses GPT-4o-mini vision for instant item identification.
- **Overlay Display**: Shows max buy, expected sale price, and profit overlaid on camera view.

### Open Market Search
- **Catch-All for "Other" Category**: Search any item on eBay sold listings.
- **Use Cases**: Antiques, vintage items, one-of-a-kind treasures.
- **Features**: Price filtering, sort by date/price, select 3+ comps for profit calculation.

### Gamification System
- **Achievements/Badges**: 17 achievement types (First Scan, Flip Master, Whale Finder, etc.).
- **Streak Tracking**: Daily consecutive scan streaks with milestone badges.
- **Profit Goals**: Set daily profit targets with progress tracking.
- **User Stats**: Total scans, flips, profit potential, largest find tracked.

## External Dependencies

### Services
- **PostgreSQL Database**: Primary data store.
- **OpenAI API**: For AI-driven analysis.
- **Data Source Hierarchy (Comps)**: PriceCharting API, SerpAPI eBay Sold Items, eBay Browse API.
- **PSA Public API**: Graded card cert verification and population data.
- **Google Custom Search API**: Optional, for product images.
- **Stripe**: For subscription payments.

### Key NPM Packages
- **drizzle-orm / drizzle-kit**: ORM and migrations.
- **passport / passport-local**: Authentication.
- **express-session / connect-pg-simple**: Session management.
- **@tanstack/react-query**: Server state management.
- **framer-motion**: Animations.
- **zod**: Schema validation.
- **shadcn/ui**: UI components.
- **@ericblade/quagga2**: Barcode scanning.