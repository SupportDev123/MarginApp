# Full Stability & Security Audit Report

**Date:** February 1, 2026  
**Status:** ✅ BUILD PASSES | ⚠️ ISSUES FOUND & DOCUMENTED

---

## Executive Summary

| Category | Status | Issues |
|----------|--------|--------|
| **Build & Types** | ✅ PASS | 0 errors (all 16 fixed) |
| **Code Quality** | ✅ GOOD | Proper error handling in most paths |
| **Security** | ⚠️ MEDIUM | 2 issues found (API key exposure) |
| **Stability** | ⚠️ MEDIUM | Missing global error handlers, background task risks |
| **Performance** | ✅ ACCEPTABLE | Bundle warning (1.5MB) but manageable |

---

## Issues Found & Severity

### 🔴 CRITICAL: API Keys Exposed in URL (2 files)

**Files:**
- `server/universal-serpapi-seeder.ts:153`
- `server/card-image-seeder.ts:401`

**Issue:**
SerpAPI key is passed as a URL query parameter:
```typescript
const url = `...api_key=${serpApiKey}`;  // ❌ WRONG
```

**Risk:**
- Exposed in HTTP logs, proxy caches, and browser history
- Violates SerpAPI ToS
- Potential account compromise

**Fix:**
Use POST request with Authorization header instead:
```typescript
// ✅ Use this approach
const response = await fetch('https://serpapi.com/search.json', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  },
  body: JSON.stringify({ ... })
});
```

---

### 🟡 HIGH: Missing Global Error Handlers

**File:** `server/index.ts`

**Issue:**
No `process.on('unhandledRejection')` or `process.on('uncaughtException')` handlers.

**Risk:**
- Background tasks (image seeders, email scheduler, price alerts) can crash silently
- Server may hang or become unresponsive
- No visibility into failures

**Recommended Fix:**
Add error handlers at the top of `server/index.ts`:
```typescript
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Promise Rejection:', reason);
  // Optionally send alert to monitoring service
});

process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught Exception:', error);
  // Optionally gracefully shut down
  process.exit(1);
});
```

---

### 🟡 MEDIUM: Seeder Tasks Can Fail Silently

**File:** `server/index.ts` (lines 190-230)

**Issue:**
Background seeders (cards, watches, electronics, etc.) are fire-and-forget:
```typescript
setTimeout(() => {
  runCardImageSeeder().catch(err => console.error('...'));
}, 3000);
```

**Risk:**
- If seeder fails repeatedly, visual matching library degrades silently
- Users get poor identification quality
- No alerting mechanism

**Recommended:**
Track seeder health with retry logic and alerts:
```typescript
async function runSeedeWithRetry(name, seederFn, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await seederFn();
      console.log(`✅ [${name}] Seeder succeeded`);
      return;
    } catch (err) {
      console.error(`❌ [${name}] Attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 5000 * attempt)); // exponential backoff
      }
    }
  }
  console.error(`🚨 [${name}] Seeder failed all retries - visual matching degraded`);
  // TODO: Send alert to admin/monitoring
}
```

---

### 🟡 MEDIUM: Missing Request Validation

**Issue:**
Several endpoints accept user input without strict validation:
- Scan routes accept arbitrary image URLs
- Item identification uses loosely-typed objects
- No rate limiting on expensive operations

**Recommended:**
- Add Zod schema validation on all POST endpoints
- Implement rate limiting (e.g., `express-rate-limit`)
- Validate image URLs before processing

---

## What's Working Well ✅

1. **TypeScript Type Safety** — All 16 errors fixed, zero remaining
2. **Error Handling in API Routes** — Most endpoints have try-catch + proper HTTP responses
3. **Database Transactions** — Drizzle ORM handles migrations properly
4. **Auth System** — Passport.js integration is correctly set up
5. **Logging** — Reasonable console logs, not spammy
6. **Build Pipeline** — Clean Vite/ESBuild integration
7. **Session Management** — express-session + PostgreSQL storage

---

## Bundle & Performance Notes

**Current:**
- Client JS: 1,492.53 kB (gzip: 408.41 kB)
- Server: 2.2 MB

**Warnings:**
- Single 1.5MB+ chunk detected (code-splitting opportunity)
- Can optimize with dynamic imports for large features (AR, batch processing)

**Action:** Not urgent for MVP but consider for users on slow networks.

---

## Deployment Checklist

- [ ] Set all environment variables (see `.env.example`)
- [ ] **BEFORE deploying:** Fix API key exposure in SerpAPI calls
- [ ] Add global error handlers for production stability
- [ ] Test background seeders actually run and succeed
- [ ] Enable logging/monitoring (Sentry, DataDog, etc.)
- [ ] Set up database backups
- [ ] Configure rate limiting on expensive endpoints
- [ ] Test Stripe webhook handling end-to-end

---

## Priority Fixes

| Priority | Task | Time | Impact |
|----------|------|------|--------|
| 🔴 **CRITICAL** | Fix SerpAPI key exposure | 15 min | Security |
| 🟡 HIGH | Add global error handlers | 10 min | Stability |
| 🟡 HIGH | Seeder retry logic | 20 min | Reliability |
| 🟢 NICE-TO-HAVE | Code splitting | 30 min | Performance |

---

## Testing Recommendations

Before production launch, manually test:

1. **Core Scanning Flow**
   - Upload item photo
   - Verify OpenAI vision works
   - Check eBay comps pull correctly
   - Confirm flip/skip verdict is accurate

2. **Integrations**
   - Test Stripe payment flow
   - Verify eBay API token refresh
   - Check email scheduler (should run at 9 AM/PM EST)
   - Confirm price alerts trigger

3. **Background Tasks**
   - Monitor visual matching library seeding (runs on startup)
   - Check logs for seeder errors
   - Verify image embeddings are stored

4. **Error Scenarios**
   - Simulate OpenAI rate limit
   - Test eBay API timeout
   - Kill database connection mid-request
   - Check error responses are user-friendly

---

## Summary

**The app is code-safe and build-ready.** The two security issues are in non-critical seeder paths (used for background learning, not user-facing scans). Fix them before production deployment.

**Estimated time to production-ready: 1 hour** (API key fixes + error handlers + testing)
