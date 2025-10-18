# Intelligent Supplier Website Scraping - Integration Analysis

## Current System Analysis

### Existing Implementation Overview

**File:** `api/src/lib/imageProcessingService.js`

#### Current Image Sourcing Hierarchy
```
1. Vendor Images (PRIORITY 1) - from PO embedded images + catalog URLs
   ├─ extractVendorImages() - extracts from PO content
   ├─ extractEmbeddedImages() - finds base64 + direct image URLs
   ├─ extractCatalogUrls() - finds vendor website URLs
   └─ scrapeVendorCatalog() - BASIC scraping (lines 164-200)

2. Google Images (PRIORITY 2) - web scraping Google Images
   └─ searchGoogleProductImages() - scrapes Google (currently timing out)

3. Placeholder (PRIORITY 3) - generic placeholder image
   └─ Generated dynamically when no images found
```

---

## Current Vendor Scraping Implementation (BASIC)

### Location: Lines 164-200 in `imageProcessingService.js`

```javascript
async scrapeVendorCatalog(catalogUrl) {
  const vendorImages = []
  
  try {
    console.log(`🔍 Scraping vendor catalog: ${catalogUrl}`)
    
    // Simple fetch with basic User-Agent
    const response = await fetch(catalogUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch catalog: ${response.status}`)
    }
    
    const html = await response.text()
    
    // BASIC REGEX: Only finds <img src="...">
    const imgRegex = /<img[^>]+src="([^"]+)"/gi
    let match
    
    while ((match = imgRegex.exec(html)) !== null) {
      const imageUrl = this.resolveUrl(match[1], catalogUrl)
      if (this.isValidImageUrl(imageUrl)) {
        vendorImages.push({
          type: 'catalog',
          url: imageUrl,
          source: catalogUrl
        })
      }
    }

    return vendorImages.slice(0, 5) // Limit to 5 images
  } catch (error) {
    console.error(`❌ Failed to scrape vendor catalog ${catalogUrl}:`, error)
    return []
  }
}
```

### Problems with Current Implementation

1. **❌ No Timeout** - Can hang indefinitely on slow websites
2. **❌ Basic Image Extraction** - Only finds `<img src="">`, misses:
   - CSS `background-image: url()`
   - `<picture>` and `<source>` elements
   - Lazy-loaded images (`data-src`, `data-lazy`)
   - JSON-LD structured data with images
   - Open Graph meta tags (`og:image`)
3. **❌ No Product Matching** - Extracts ALL images from page, not product-specific
4. **❌ No Smart Search** - Only scrapes if URL is in PO (rarely happens)
5. **❌ No Multi-Supplier Strategy** - Only checks one website
6. **❌ No E-commerce Detection** - Doesn't recognize Shopify, WooCommerce, etc.
7. **❌ No Rate Limiting** - Can get IP banned
8. **❌ No Caching** - Re-scrapes same URLs repeatedly

---

## Data Flow Analysis

### How Supplier Info Flows Through System

```
1. AI EXTRACTION (enhancedAIService.js)
   └─ Extracts supplier.name, supplier.email, supplier.website
   └─ Returns parsedData with supplier object

2. SUPPLIER MATCHING (supplierMatchingService.js)
   └─ Matches/creates Supplier record in database
   └─ Supplier.website stored in PostgreSQL

3. IMAGE EXTRACTION (imageProcessingService.js)
   extractVendorImages(poContent, parsedData)
   └─ Line 142: if (parsedData.supplier?.website)
   └─ Line 143: catalogUrls.push(parsedData.supplier.website)
   └─ scrapeVendorCatalog(catalogUrl) called per URL

4. IMAGE SOURCING (imageProcessingService.js)
   sourceImagesWithHierarchy(lineItems, vendorImages)
   └─ Vendor images prioritized first
   └─ Falls back to Google if no vendor images
```

### Current Usage Points

**Where `extractVendorImages()` is called:**
- `refinementPipelineService.js` (line 119)
  - During AI enrichment stage
  - Has access to `purchaseOrderData.originalContent` and `purchaseOrderData.parsedData`

**Where supplier website is extracted:**
- `imageProcessingService.extractCatalogUrls()` (line 142)
  - Gets `parsedData.supplier.website` from AI extraction
  - Also checks line item fields for embedded URLs

---

## Proposed Enhancement Strategy

### Goals
1. ✅ **Intelligent Product-Specific Scraping** - Find images for specific SKUs/products
2. ✅ **Multi-Supplier Support** - Search across known supplier databases
3. ✅ **E-commerce Platform Detection** - Recognize Shopify, WooCommerce, BigCommerce patterns
4. ✅ **Generalized for Any Business** - Works for candy, electronics, office supplies, etc.
5. ✅ **Robust & Resilient** - Timeouts, error handling, fallbacks
6. ✅ **Performance Optimized** - Caching, rate limiting, parallel requests

---

## Enhanced Architecture Design

### New Method: `intelligentSupplierSearch(item, supplierInfo)`

```javascript
async intelligentSupplierSearch(item, supplierInfo) {
  // STAGE 1: Build smart search targets
  const searchTargets = await this.buildSupplierSearchTargets(item, supplierInfo)
  // Returns: [
  //   { url: 'https://candyville.ca/search?q=laffy-taffy', priority: 1, platform: 'shopify' },
  //   { url: 'https://supplier-database.com/api/products/12345', priority: 2, platform: 'api' },
  //   ...
  // ]

  // STAGE 2: Execute parallel searches with timeout & retry
  const results = await this.executeParallelSearch(searchTargets, {
    timeout: 15000, // 15s per site
    maxConcurrent: 3, // 3 sites at once
    retryFailed: false // Don't retry on first pass
  })

  // STAGE 3: Extract & score product images
  const productImages = await this.extractProductImages(results, item)
  // Returns scored images with confidence: 0.0-1.0

  // STAGE 4: Deduplicate & rank
  return this.deduplicateAndRank(productImages)
}
```

---

## Implementation Plan

### Phase 1: Build Search Target Generator ✅

**Method:** `buildSupplierSearchTargets(item, supplierInfo)`

**Strategy:**
1. **Direct Supplier Website** (if website in parsedData)
   - Build product search URL patterns based on platform detection
   - Shopify: `/products/{slug}` or `/search?q={query}`
   - WooCommerce: `/product/{slug}` or `/?s={query}`
   - Generic: `/search?q={query}` or `/products/{sku}`

2. **Known Wholesale Distributors** (industry-specific)
   - Maintain database of common suppliers by industry
   - Candy/Confectionery: candywarehouse.com, nassaucandy.com, etc.
   - Electronics: digikey.com, mouser.com, etc.
   - Office Supplies: uline.com, globalindustrial.com, etc.

3. **Manufacturer Websites** (extract from product names)
   - Wonka → wonka.com
   - Huer → huer.com
   - Use brand detection from product name

**Code Structure:**
```javascript
buildSupplierSearchTargets(item, supplierInfo) {
  const targets = []
  
  // 1. Direct supplier website
  if (supplierInfo?.website) {
    const platform = this.detectEcommercePlatform(supplierInfo.website)
    targets.push(...this.buildPlatformSearchUrls(supplierInfo.website, item, platform))
  }
  
  // 2. Industry-specific distributors
  const industry = this.detectIndustry(item.productName) // candy, electronics, etc.
  const distributors = this.getIndustryDistributors(industry)
  for (const distributor of distributors) {
    targets.push(...this.buildDistributorSearchUrls(distributor, item))
  }
  
  // 3. Manufacturer website
  const brand = this.extractBrand(item.productName)
  if (brand) {
    targets.push(...this.buildManufacturerSearchUrls(brand, item))
  }
  
  return this.prioritizeTargets(targets)
}
```

---

### Phase 2: Platform-Specific Scrapers ✅

**E-commerce Platform Patterns:**

#### Shopify Detection & Scraping
```javascript
detectShopify(html) {
  return html.includes('Shopify.theme') || 
         html.includes('cdn.shopify.com') ||
         html.includes('/cart.js')
}

async scrapeShopifyProduct(url, item) {
  // Try JSON endpoint first (MUCH faster)
  const jsonUrl = url.replace(/\/$/, '') + '.json'
  
  try {
    const response = await fetch(jsonUrl, { timeout: 10000 })
    const data = await response.json()
    
    return {
      images: data.product.images.map(img => ({
        url: img.src,
        alt: img.alt,
        width: img.width,
        height: img.height,
        source: url,
        confidence: 0.9 // High confidence for direct product page
      })),
      title: data.product.title,
      vendor: data.product.vendor,
      sku: data.product.variants[0]?.sku
    }
  } catch (error) {
    // Fallback to HTML scraping
    return this.scrapeShopifyHTML(url, item)
  }
}
```

#### WooCommerce Detection & Scraping
```javascript
detectWooCommerce(html) {
  return html.includes('woocommerce') ||
         html.includes('wp-content/plugins/woocommerce')
}

async scrapeWooCommerceProduct(url, item) {
  // WooCommerce uses standard WordPress patterns
  const html = await this.fetchWithTimeout(url, 10000)
  
  // Extract from JSON-LD structured data
  const jsonLd = this.extractJsonLd(html)
  if (jsonLd?.['@type'] === 'Product') {
    return {
      images: [jsonLd.image].flat().map(url => ({
        url,
        source: url,
        confidence: 0.85
      })),
      title: jsonLd.name,
      sku: jsonLd.sku
    }
  }
  
  // Fallback: CSS selectors
  return this.scrapeWithSelectors(html, {
    images: ['.woocommerce-product-gallery__image img', '.product-images img'],
    title: ['.product_title', 'h1.entry-title'],
    sku: ['.sku']
  })
}
```

#### Generic E-commerce Scraping
```javascript
async scrapeGenericEcommerce(url, item) {
  const html = await this.fetchWithTimeout(url, 10000)
  
  // Multi-strategy extraction
  const images = []
  
  // 1. Open Graph meta tags
  images.push(...this.extractOpenGraphImages(html))
  
  // 2. JSON-LD structured data
  images.push(...this.extractJsonLdImages(html))
  
  // 3. Common CSS patterns
  images.push(...this.extractCssImages(html, [
    '.product-image img',
    '.product-gallery img',
    '[class*="product"] [class*="image"] img',
    '[itemprop="image"]'
  ]))
  
  // 4. Lazy-loaded images
  images.push(...this.extractLazyImages(html))
  
  return this.deduplicateImages(images)
}
```

---

### Phase 3: Smart Product Matching ✅

**Challenge:** Scraping homepage gives ALL product images. Need to filter to correct product.

**Solution:** Multi-signal matching algorithm

```javascript
calculateProductMatchScore(scrapedProduct, targetItem) {
  let score = 0
  let maxScore = 100
  
  // SKU matching (50 points - strongest signal)
  if (scrapedProduct.sku && targetItem.sku) {
    if (scrapedProduct.sku.toLowerCase() === targetItem.sku.toLowerCase()) {
      score += 50
    } else if (scrapedProduct.sku.toLowerCase().includes(targetItem.sku.toLowerCase())) {
      score += 30
    }
  }
  
  // Product name matching (30 points)
  const nameMatch = this.fuzzyMatch(scrapedProduct.title, targetItem.productName)
  score += nameMatch * 30
  
  // Brand matching (10 points)
  const targetBrand = this.extractBrand(targetItem.productName)
  const scrapedBrand = scrapedProduct.vendor || this.extractBrand(scrapedProduct.title)
  if (targetBrand && scrapedBrand && targetBrand.toLowerCase() === scrapedBrand.toLowerCase()) {
    score += 10
  }
  
  // Price matching (10 points - if available)
  if (scrapedProduct.price && targetItem.unitPrice) {
    const priceDiff = Math.abs(scrapedProduct.price - targetItem.unitPrice) / targetItem.unitPrice
    if (priceDiff < 0.2) { // Within 20%
      score += 10
    }
  }
  
  return score / maxScore // Return 0.0-1.0
}
```

---

### Phase 4: Industry-Specific Distributor Database ✅

**Approach:** Build curated database of known suppliers per industry

```javascript
const INDUSTRY_DISTRIBUTORS = {
  candy: [
    { domain: 'candywarehouse.com', name: 'Candy Warehouse', searchPattern: '/search?q={query}' },
    { domain: 'nassaucandy.com', name: 'Nassau Candy', searchPattern: '/products/{slug}' },
    { domain: 'candyville.ca', name: 'Candyville', searchPattern: '/search?q={query}' },
    { domain: 'allcitycandy.com', name: 'All City Candy', searchPattern: '/search?q={query}' }
  ],
  
  electronics: [
    { domain: 'digikey.com', name: 'Digi-Key', searchPattern: '/products/en?keywords={query}' },
    { domain: 'mouser.com', name: 'Mouser', searchPattern: '/Search/Refine?Keyword={query}' },
    { domain: 'arrow.com', name: 'Arrow', searchPattern: '/en/products/search?q={query}' }
  ],
  
  office_supplies: [
    { domain: 'uline.com', name: 'Uline', searchPattern: '/Product/Detail?model={sku}' },
    { domain: 'globalindustrial.com', name: 'Global Industrial', searchPattern: '/search?query={query}' }
  ],
  
  generic: [
    { domain: 'amazon.com', name: 'Amazon', searchPattern: '/s?k={query}' },
    { domain: 'alibaba.com', name: 'Alibaba', searchPattern: '/trade/search?SearchText={query}' }
  ]
}

detectIndustry(productName) {
  const keywords = {
    candy: ['candy', 'chocolate', 'gummy', 'sweet', 'confection', 'lollipop', 'taffy'],
    electronics: ['electronic', 'resistor', 'capacitor', 'circuit', 'pcb', 'chip', 'diode'],
    office_supplies: ['paper', 'pen', 'stapler', 'folder', 'notebook', 'desk', 'chair'],
    // Add more industries...
  }
  
  const nameLower = productName.toLowerCase()
  
  for (const [industry, terms] of Object.entries(keywords)) {
    if (terms.some(term => nameLower.includes(term))) {
      return industry
    }
  }
  
  return 'generic'
}
```

---

### Phase 5: Performance & Reliability ✅

#### Caching Strategy
```javascript
// Cache scraped product data for 7 days
const CACHE_KEY = `supplier_product:${supplierDomain}:${productSKU}`
const cached = await this.redis.get(CACHE_KEY)
if (cached) {
  return JSON.parse(cached)
}

// After scraping...
await this.redis.setex(CACHE_KEY, 7 * 24 * 60 * 60, JSON.stringify(result))
```

#### Rate Limiting
```javascript
// Limit: 10 requests per minute per domain
const rateLimitKey = `ratelimit:${domain}`
const count = await this.redis.incr(rateLimitKey)
if (count === 1) {
  await this.redis.expire(rateLimitKey, 60)
}
if (count > 10) {
  throw new Error('Rate limit exceeded')
}
```

#### Timeout & Retry
```javascript
async fetchWithTimeout(url, timeoutMs = 15000, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: this.getRandomUserAgent()
      })
      
      clearTimeout(timeoutId)
      return response
      
    } catch (error) {
      if (attempt === retries) throw error
      await this.delay(1000 * (attempt + 1)) // Exponential backoff
    }
  }
}
```

---

## Integration Points

### Where to Hook Into Existing System

**Option 1: Replace `scrapeVendorCatalog()` (RECOMMENDED)**
- **Location:** `imageProcessingService.js` line 164
- **Impact:** Minimal - drop-in replacement
- **Benefit:** Automatic improvement for all existing flows

```javascript
// OLD (line 164):
async scrapeVendorCatalog(catalogUrl) {
  // Basic regex scraping...
}

// NEW:
async scrapeVendorCatalog(catalogUrl, item = null, supplierInfo = null) {
  // If we have item context, use intelligent search
  if (item && supplierInfo) {
    return this.intelligentSupplierSearch(item, supplierInfo)
  }
  
  // Otherwise fall back to basic scraping
  return this.basicCatalogScrape(catalogUrl)
}
```

**Option 2: Add New Priority Level (MORE ADVANCED)**
- **Location:** `sourceImagesWithHierarchy()` line 820
- **Change:** Add "Intelligent Supplier Search" between vendor images and Google

```javascript
// NEW HIERARCHY:
// 1. Vendor Images (embedded in PO)
// 2. ⭐ Intelligent Supplier Search (NEW!)
// 3. Google Images (fallback)
// 4. Placeholder
```

---

## Expected Results

### Before Enhancement
```
🔍 Sourcing images for: Wonka Laffy Taffy X 24 Units
   ⚠️ No vendor images found
   🔍 Searching Google Images...
   ⏱️ Google scraping timeout after 25s
   ℹ️ API fallback disabled
   📦 Using placeholder image
```

### After Enhancement
```
🔍 Sourcing images for: Wonka Laffy Taffy X 24 Units
   ⚠️ No embedded vendor images in PO
   🎯 Intelligent supplier search enabled
   
   🔍 Searching supplier website: candyville.ca
      ✅ Detected platform: Shopify
      📸 Found product page: /products/wonka-laffy-taffy-24ct
      ✅ Extracted 4 images (confidence: 92%)
   
   🔍 Searching distributor: candywarehouse.com
      📸 Found matching product (SKU match: 95%)
      ✅ Extracted 3 images (confidence: 88%)
   
   📊 Total: 7 images from 2 suppliers
   🎯 Best match: candyville.ca product page (92% confidence)
   ⏭️ Skipping Google search (high-quality supplier images found)
```

---

## Implementation Checklist

### Phase 1: Foundation
- [ ] Create `buildSupplierSearchTargets()` method
- [ ] Add `detectEcommercePlatform()` utility
- [ ] Build URL pattern generator for Shopify, WooCommerce, generic

### Phase 2: Platform Scrapers
- [ ] Implement `scrapeShopifyProduct()` with JSON endpoint
- [ ] Implement `scrapeWooCommerceProduct()` with JSON-LD
- [ ] Implement `scrapeGenericEcommerce()` with multi-strategy extraction
- [ ] Add `extractOpenGraphImages()` helper
- [ ] Add `extractJsonLdImages()` helper
- [ ] Add `extractLazyImages()` helper

### Phase 3: Intelligence
- [ ] Build `calculateProductMatchScore()` algorithm
- [ ] Implement fuzzy string matching for product names
- [ ] Add brand extraction logic
- [ ] Create product matching filters

### Phase 4: Distributor Database
- [ ] Create `INDUSTRY_DISTRIBUTORS` constant
- [ ] Implement `detectIndustry()` from product names
- [ ] Add `getIndustryDistributors()` lookup
- [ ] Build distributor-specific search URL patterns

### Phase 5: Performance
- [ ] Add Redis caching layer (7-day TTL)
- [ ] Implement rate limiting (10 req/min per domain)
- [ ] Add `fetchWithTimeout()` with retry logic
- [ ] Implement exponential backoff
- [ ] Add user-agent rotation

### Phase 6: Integration
- [ ] Update `scrapeVendorCatalog()` signature to accept item context
- [ ] Modify `extractVendorImages()` to pass item context
- [ ] Update `refinementPipelineService.js` call site
- [ ] Add logging for supplier search results

### Phase 7: Testing & Monitoring
- [ ] Test with candyville.ca invoice
- [ ] Test with various industries (electronics, office supplies)
- [ ] Monitor success rate vs Google Images
- [ ] Add metrics: images_found, confidence_scores, source_breakdown

---

## Risk Assessment

### Low Risk
- ✅ Existing `scrapeVendorCatalog()` rarely succeeds anyway (no URLs in POs)
- ✅ New system is additive (doesn't break existing flows)
- ✅ Graceful fallback to Google Images if supplier search fails

### Medium Risk
- ⚠️ Timeout management (15s per supplier × 3 suppliers = 45s max)
- ⚠️ IP blocking from aggressive scraping
- **Mitigation:** Rate limiting, user-agent rotation, respect robots.txt

### High Risk
- ❌ Legal concerns scraping competitor websites
- **Mitigation:** Only scrape supplier/distributor websites where you have business relationship
- **Best Practice:** Add robots.txt checking, respect rate limits

---

## Success Metrics

**Target Goals:**
- 📈 **Image discovery rate:** 30% → 70%+ (with supplier search)
- ⚡ **Average latency:** <15s per product (with caching)
- 🎯 **High-confidence images:** 50%+ with confidence >0.8
- 💰 **Cost savings:** $0/month (vs $49-500/mo for paid APIs)

**Monitoring:**
```javascript
{
  "supplier_search_attempts": 156,
  "supplier_search_successes": 112,
  "success_rate": "71.8%",
  "avg_images_per_product": 3.4,
  "avg_confidence_score": 0.83,
  "sources": {
    "direct_supplier": "45%",
    "distributors": "32%", 
    "manufacturer": "15%",
    "google_fallback": "8%"
  }
}
```

---

## Next Steps

1. **Review & Approve** this analysis
2. **Choose integration approach** (Option 1 or Option 2)
3. **Implement Phase 1** (foundation + URL building)
4. **Test with candyville.ca** invoice
5. **Iterate** based on results
6. **Deploy** to production
7. **Monitor** success rates & performance

---

## Questions for Discussion

1. **Redis Dependency:** Do we have Redis available for caching? Or use in-memory cache?
2. **Industry Database:** Start with candy-only or build multi-industry from day 1?
3. **Legal Review:** Do we need legal approval for scraping supplier websites?
4. **Rate Limits:** What's acceptable latency? 15s per product? 30s?
5. **Fallback Strategy:** Should we still keep Google Images scraping as fallback?
