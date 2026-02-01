# eBay Marketplace Insights API - Application Growth Check Request

## Application Information

**App Name:** Margin - Reseller Profit Analysis Tool

**App Description:** 
Margin is a mobile-first web application designed to help resellers make informed buying decisions. Users scan eBay listings to analyze profitability by comparing against sold comparable items (comps), calculating fees, shipping, and net profit to receive clear FLIP IT / SKIP IT recommendations.

## Requested Scope

`https://api.ebay.com/oauth/api_scope/buy.marketplace.insights`

## Business Justification

### Use Case

Margin helps individual resellers and small business sellers make data-driven purchasing decisions. When a user encounters a potential item to flip (at garage sales, thrift stores, liquidation auctions, or online marketplaces), they need to quickly determine if the item can be resold at a profit.

**Current Workflow:**
1. User scans an eBay listing URL or photographs an item
2. Our system extracts item details (title, condition, shipping costs)
3. We query sold comparable items to establish market value
4. We calculate expected profit after eBay fees, shipping, and cost basis
5. User receives a clear recommendation (FLIP IT / SKIP IT) with confidence level

### Why Marketplace Insights API is Essential

The **Marketplace Insights API** provides access to **actual sold prices** from completed eBay transactions. This is critical for our application because:

1. **Accurate Market Valuation** - Active listing prices don't reflect actual sale prices. Items often sell for 10-20% less than list price. Real sold data ensures our profit calculations are reliable.

2. **30-Day Lookback** - Historical sold data provides trend information and price stability indicators, helping users avoid items with declining values.

3. **Condition-Matched Comps** - Comparing against sold items in the same condition ensures apples-to-apples valuation.

4. **User Trust** - Our recommendations directly influence purchasing decisions. Inaccurate pricing data leads to bad flips and erodes user confidence.

### Current Fallback (Limited Value)

Without Marketplace Insights access, we currently:
- Use Browse API active listing prices (estimated -12% adjustment)
- Provide deep links to eBay sold search for manual research

This fallback is suboptimal because:
- Manual research breaks the user's workflow
- Active listing prices are unreliable (many never sell)
- Users lose the "scan and decide" speed advantage

### Volume & Compliance

- **Expected Call Volume:** 500-2,000 calls/day initially, scaling with user base
- **Rate Limiting:** We implement caching (45-minute TTL) to minimize redundant API calls
- **Data Usage:** Pricing data is used only for real-time analysis; we don't store historical pricing trends or resell eBay data
- **User Transparency:** All recommendations clearly indicate data source (sold comps vs. active estimates)

### Business Model

Margin operates on a subscription model:
- Free tier: 5 scans/day with basic analysis
- Pro tier ($14.99/month): Unlimited scans, tax-ready exports, full history

We do not monetize eBay data directly. The API access enables our core product value proposition.

## Technical Implementation

Our backend is designed with a swappable data source architecture:

```
1. Marketplace Insights API (pending approval) - Real sold data
2. Browse API (fallback) - Active listing estimates
3. Deep Link (last resort) - Manual eBay search redirect
```

Once approved, Marketplace Insights will automatically become the primary data source with no code changes required.

## Compliance Confirmation

- We will not cache eBay data beyond session use for individual analysis
- We will not resell or redistribute eBay pricing data
- We will display appropriate eBay attribution where required
- We will respect all rate limits and API terms of service
- We will not use data for price manipulation or anti-competitive purposes

## Contact Information

**Developer:** [Your Name]  
**Email:** [Your Email]  
**Application URL:** [Your Replit App URL]

---

**Submission Checklist:**
1. [ ] Go to https://developer.ebay.com/grow/application-growth-check
2. [ ] Submit this justification
3. [ ] Wait for eBay Developer Support approval (typically 5-10 business days)
4. [ ] Once approved, the `buy.marketplace.insights` scope will be enabled for your app
5. [ ] Test the integration - sold data will automatically flow through your existing code
