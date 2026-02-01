# Margin App - Comprehensive Bug Audit

**Date:** January 31, 2026  
**Purpose:** Pre-launch stabilization audit

---

## FIXED ISSUES (This Session)

### 1. Login Case Sensitivity Bug
- **Issue:** Username/email lookup was case-sensitive. "Tim" in DB wouldn't match "tim" input.
- **Root Cause:** `getUserByUsername()` and `getUserByEmail()` used exact match SQL.
- **Fix:** Changed both to use `LOWER()` SQL function for case-insensitive matching.
- **Files Changed:** `server/storage.ts` (lines 116-131)
- **Status:** Fixed, needs publish

### 2. SerpAPI Rate Limiting (429)
- **Issue:** Open Market search fails with "Too Many Requests" when SerpAPI quota exceeded.
- **Root Cause:** No fallback when SerpAPI returns 429.
- **Fix:** Added eBay Finding API (FREE) as automatic fallback.
- **Files Changed:** `server/sold-listings-provider.ts`
- **Status:** Fixed, needs publish

---

## KNOWN ARCHITECTURAL CONCERNS

### 1. Production Deployment Sync
- **Issue:** Production may not immediately reflect code changes after publish.
- **Symptom:** Local works, production returns old behavior.
- **Workaround:** Wait for deployment propagation or republish.

### 2. Session Cookie Configuration
- **Current Settings:**
  - `sameSite: 'none'` (production)
  - `secure: true` (production)
  - `httpOnly: true`
- **Risk:** Cross-origin issues if client/server domains mismatch.
- **Note:** Custom domain app.marginhq.org requires matching cookie settings.

### 3. Password Hash Format
- **Format:** `{hash}.{salt}` (128 hex + "." + 32 hex = 161 chars)
- **Algorithm:** scrypt with 64-byte output
- **Risk:** Password reset must use same algorithm.

---

## POTENTIAL EDGE CASES TO TEST

### Authentication Flow
- [ ] Login with email (lowercase)
- [ ] Login with email (UPPERCASE)
- [ ] Login with username (any case)
- [ ] Session persistence across page refresh
- [ ] Session persistence across browser restart
- [ ] Logout clears session completely
- [ ] Password reset flow end-to-end

### Scanning Flow
- [ ] Photo upload (camera)
- [ ] Photo upload (gallery)
- [ ] AI analysis completes
- [ ] Pricing calculation accurate
- [ ] Flip/Skip verdict displays

### Open Market Search
- [ ] Search returns results (when SerpAPI available)
- [ ] Search falls back to eBay Finding API (when SerpAPI 429)
- [ ] Price filter works
- [ ] Comp selection works
- [ ] Profit calculation accurate

### Payment Flow
- [ ] Stripe checkout loads
- [ ] Payment processes
- [ ] Subscription tier updates
- [ ] Webhook receives confirmation

---

## API KEYS STATUS

| Service | Key Name | Status |
|---------|----------|--------|
| eBay | EBAY_CLIENT_ID/SECRET/DEV_ID | Configured |
| OpenAI | AI_INTEGRATIONS_OPENAI_API_KEY | Configured |
| Stripe | STRIPE_SECRET_KEY | Configured |
| SerpAPI | SERPAPI_KEY | Configured (rate limited) |
| PriceCharting | PRICECHARTING_API_KEY | Configured |
| Resend | RESEND_API_KEY | Configured |

---

## RECOMMENDED NEXT STEPS

1. **Publish** current fixes to production
2. **Test** login on production after publish propagates
3. **Monitor** Open Market search to verify eBay fallback works
4. **Consider** implementing comprehensive automated tests
5. **Set up** error monitoring (Sentry, LogRocket, etc.)

---

## EXPORT INSTRUCTIONS

To move this codebase to GitHub for external development:

1. **Export to GitHub:**
   - Three-dot menu → "Export to GitHub"
   - Creates a full copy of the repo

2. **Key Environment Variables Needed:**
   - All secrets listed above
   - DATABASE_URL (PostgreSQL connection string)
   - SESSION_SECRET

3. **Database:**
   - PostgreSQL with Drizzle ORM
   - Run `npm run db:push` to sync schema
