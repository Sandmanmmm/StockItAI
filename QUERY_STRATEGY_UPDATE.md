# Query Strategy Update - Focus on Specific Products

## Change Summary

### ❌ OLD Strategy (Had Generic Queries)
```javascript
// Query 1: Brand + Product
"Haribo Balla Stixx Strawberry candy"

// Query 2: Full name + type
"Haribo Balla Stixx Strawberry candy"

// Query 3: Brand + type (TOO GENERIC!)
"Haribo candy"  ❌ Returns ALL Haribo products, not the specific one
```

### ✅ NEW Strategy (Specific Product Focus)
```javascript
// Query 1: Brand + Specific Product (Most Targeted)
"Haribo Balla Stixx Strawberry"  ✓ Finds THIS specific product

// Query 2: Full cleaned name (Fallback)
"Haribo Balla Stixx Strawberry"

// Query 3: Specific product only (Last Resort)
"Balla Stixx Strawberry"  ✓ Still specific, just without brand
```

---

## Real Examples

### Example 1: Haribo Balla Stixx
```
Input: "Haribo Balla Stixx Strawberry 140g - Case of 12 UK"

OLD Queries:
  ❌ "Haribo Balla Stixx Strawberry 140g UK candy"
  ❌ "Haribo candy" (TOO GENERIC - finds all Haribo, not Balla Stixx!)

NEW Queries:
  ✅ "Haribo Balla Stixx Strawberry 140g UK"
  ✅ "Balla Stixx Strawberry 140g UK"
```

### Example 2: Cow Tales
```
Input: "Cow Tales Caramel Bars - 36ct"

OLD Queries:
  ❌ "Cow Tales Caramel Bars candy"
  ❌ "Cow Tales candy" (TOO GENERIC - finds all Cow Tales, not Caramel!)

NEW Queries:
  ✅ "Cow Tales Caramel Bars"
  ✅ "Caramel Bars"
```

### Example 3: Charms Blow Pop
```
Input: "Charms Blow Pop Kiwi Berry 48Ct"

OLD Queries:
  ❌ "Charms Blow Pop Kiwi Berry candy"
  ❌ "Charms candy" (TOO GENERIC - finds all Charms, not Blow Pops!)

NEW Queries:
  ✅ "Charms Blow Pop Kiwi Berry"
  ✅ "Blow Pop Kiwi Berry"
```

---

## Why This Matters

### Problem with Generic Queries
- `"Haribo candy"` → Returns images of ANY Haribo product
  - Could get Haribo Gummy Bears
  - Could get Haribo Goldbears
  - Could get Haribo Happy Cola
  - **NOT** Haribo Balla Stixx specifically! ❌

### Solution with Specific Queries
- `"Haribo Balla Stixx"` → Returns images of THAT specific product
  - Gets actual Balla Stixx images ✓
  - Correct packaging ✓
  - Right flavor variant ✓
  - **Exactly** what we need! ✅

---

## Code Changes

### File: `api/src/lib/imageProcessingService.js`

**Method: `buildImageSearchQueries()`**

**Key Changes:**
1. Remove `detectProductType()` calls that added generic "candy" terms
2. Focus on building queries with the specific product name
3. Don't fall back to generic brand searches

```javascript
// OLD - Had generic fallback
queries.push(`${brand} ${productType}`)  // e.g., "Haribo candy" ❌

// NEW - Stays specific
queries.push(specificProduct)  // e.g., "Balla Stixx Strawberry" ✓
```

---

## Testing Results

### Test Script: `test-fixed-queries.js`

**10/10 products** now generate specific queries:
- ✅ No generic "brand candy" queries
- ✅ All queries focus on the specific product
- ✅ Brand provides context without being generic

**Example Output:**
```
Product: Haribo Balla Stixx Strawberry 140g - Case of 12 UK
   Specific Product: Balla Stixx Strawberry 140g UK
   Queries:
      1. "Haribo Balla Stixx Strawberry 140g UK"
      2. "Balla Stixx Strawberry 140g UK"
   ✅ Queries focus on specific product
```

---

## Expected Impact

### Image Search Results
- **Before**: Generic queries return wrong products
  - Search: "Haribo candy"
  - Results: Random Haribo products ❌
  
- **After**: Specific queries return correct products
  - Search: "Haribo Balla Stixx Strawberry"
  - Results: Actual Balla Stixx images ✅

### Success Rate Prediction
- **Current**: 0/52 products finding images (0%)
- **Expected After Fix**: 40-45/52 products finding images (75-85%)
  - Some products may still fail if:
    - Product is very new/rare
    - Product name is misspelled in invoice
    - Product is region-specific with limited online presence

---

## Next Steps

1. ✅ Code changes complete
2. ✅ Tests passing (100% focus on specific products)
3. 🔄 **Server restart needed** to load new code
4. 🧪 **Upload test PO** to verify real-world results
5. 📊 **Monitor logs** for:
   - Correct brand detection
   - Specific product queries
   - Google Images returning results
   - Images being attached to line items

---

## Files Modified

1. `api/src/lib/imageProcessingService.js`
   - `buildImageSearchQueries()` method revised
   - Removed generic brand + type queries
   - Focus on specific product with brand context

2. `test-fixed-queries.js`
   - Updated to test new query strategy
   - Validates no generic queries generated
   - Confirms focus on specific products

3. `IMAGE_SEARCH_FIXES.md`
   - Updated documentation
   - Clarified query strategy
   - Added examples of specific vs generic

4. `QUERY_STRATEGY_UPDATE.md` (THIS FILE)
   - Comprehensive explanation of changes
   - Before/after comparisons
   - Testing results
