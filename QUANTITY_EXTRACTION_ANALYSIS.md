# Quantity Extraction Issue Analysis

## 🔍 Problem Statement

Purchase order line items are displaying **quantity = 1** instead of extracting the actual case/pack quantities from product names like:
- "Kool Aid Soda Blue Raspberry Lemonade 355 ml - **Case of 12**" → Should have quantity: **12**
- "Jell-O Sour Gummie Candy 127 g - **Case of 12**" → Should have quantity: **12**  
- "Reese's PB & J Strawberry Big Cup 39 g - **16 ct**" → Should have quantity: **16**
- "Pop Rocks Dips Sour Strawberry 18 g ( **Case of 18** )" → Should have quantity: **18**

Currently ALL items show quantity: **1** with **50% confidence**.

---

## 🐛 Root Cause Analysis

### Issue #1: Default Fallback Value
**File:** `api/src/lib/databasePersistenceService.js:829`

```javascript
const quantity = parseInt(item.quantity) || 1  // ❌ Defaults to 1!
```

**Problem:** When AI doesn't extract a quantity (returns null/undefined), the code defaults to `1` instead of extracting from the product name.

### Issue #2: AI Not Extracting Pack Quantities
**File:** `api/src/lib/enhancedAIService.js:20-21`

The AI prompt says:
> "Each product should have ONE entry with description, SKU, **quantity**, and prices combined."

**Problem:** The AI is treating the entire product name (including "Case of 12") as the **description**, but NOT parsing out the pack quantity into the separate `quantity` field.

**Example AI Output (from line 2391-2398):**
```javascript
{
  description: "Warheads Wedgies 127g Peg Bag - Case of 12",  // ✅ Full name preserved
  quantity: "1",  // ❌ Should be 12!
  unitPrice: "$1.49",
  total: "$17.88"
}
```

### Issue #3: Missing Pack Quantity Parser
**Current Situation:**
- The `productConsolidationService.js` HAS logic to extract pack quantities (line 126):
  ```javascript
  const packMatch = fullName.match(/Case\s+of\s+(\d+)|(\d+)\s*ct\b|(\d+)\s*(pcs|pack|count)\b/i)
  ```
- BUT this is only used for **display/consolidation**, NOT for setting the actual database quantity field.

---

## 💡 Solution Strategy

### Option A: Enhance AI Prompt (Recommended)
**Modify the AI prompt to explicitly extract pack quantities**

**Current prompt:**
```
Each product should have ONE entry with description, SKU, quantity, and prices combined.
```

**Enhanced prompt:**
```
Each product should have ONE entry with description, SKU, quantity, and prices combined.

CRITICAL QUANTITY EXTRACTION RULES:
1. The "quantity" field must be the TOTAL UNITS being ordered (e.g., if "Case of 12", quantity = 12, NOT 1)
2. Extract case/pack quantities from patterns like:
   - "Case of 12" → quantity: 12
   - "24 ct" → quantity: 24  
   - "Pack of 6" → quantity: 6
   - "18-Pack" → quantity: 18
3. Keep the full product description (including "Case of 12") in the description field
4. If no case/pack quantity is mentioned, default to quantity: 1
```

### Option B: Post-Processing Parser
**Add a fallback parser after AI extraction**

Add to `databasePersistenceService.js` before line 829:

```javascript
// Extract pack quantity from product name if AI didn't extract it
let quantity = parseInt(item.quantity)
if (!quantity || quantity === 1) {
  const productName = item.productName || item.description || ''
  const packMatch = productName.match(/Case\s+of\s+(\d+)|(\d+)\s*ct\b|(\d+)\s*-?(Pack|pcs|count)\b/i)
  if (packMatch) {
    quantity = parseInt(packMatch[1] || packMatch[2] || packMatch[3]) || 1
    console.log(`  📦 Extracted pack quantity ${quantity} from: ${productName}`)
  }
}
quantity = quantity || 1
```

### Option C: Hybrid Approach (Best)
1. **Enhance AI prompt** to extract quantities properly
2. **Add post-processing fallback** for cases where AI misses it
3. **Update AI examples** in the few-shot learning to demonstrate correct quantity extraction

---

## 📋 Implementation Plan

### Phase 1: Immediate Fix (Post-Processing)
- [ ] Add pack quantity extraction logic to `databasePersistenceService.js`
- [ ] Test with existing POs to verify extraction
- [ ] Log extraction results for monitoring

### Phase 2: AI Prompt Enhancement
- [ ] Update `optimizedPrompt` in `enhancedAIService.js`
- [ ] Update `chunkLineItemPrompt` for consistency
- [ ] Add few-shot examples showing correct quantity extraction
- [ ] Update function schema description for `quantity` field

### Phase 3: Validation & Testing
- [ ] Test with sample POs containing various pack formats
- [ ] Verify confidence scores improve
- [ ] Check that totals calculate correctly (unitPrice * quantity = total)
- [ ] Ensure existing POs can be reprocessed with correct quantities

---

## 🎯 Expected Outcome

**Before:**
```
SKU: 860013270451
Product: Kool Aid Soda Blue Raspberry Lemonade 355 ml - Case of 12
Qty: 1          ❌
Unit Price: $22.99
Total: $22.99
```

**After:**
```
SKU: 860013270451  
Product: Kool Aid Soda Blue Raspberry Lemonade 355 ml - Case of 12
Qty: 12         ✅
Unit Price: $1.92   (calculated from $22.99 / 12)
Total: $22.99
```

---

## 📊 Related Files

### Core Processing Files
- `api/src/lib/enhancedAIService.js` - AI prompts and extraction logic
- `api/src/lib/databasePersistenceService.js:829` - Quantity default fallback
- `api/src/lib/poAnalysisJobProcessor.js:273` - Line item saving
- `api/src/lib/productConsolidationService.js:126` - Pack quantity regex (reference)

### Schema
- `api/prisma/schema.prisma:136` - POLineItem.quantity (Int field)

### API Routes  
- `api/src/routes/lineItems.js` - Line item retrieval and display
- `api/src/routes/purchaseOrders.js` - PO creation and updates

---

## 🔧 Testing Data

Use these product names to verify the fix:

| Product Name | Expected Qty |
|--------------|-------------|
| Kool Aid Soda Blue Raspberry Lemonade 355 ml - Case of 12 | 12 |
| Jell-O Sour Gummie Candy 127 g - Case of 12 | 12 |
| Skittles Squishy Cloudz Crazy Sours Pouch 94 g - Case of 18 - UK | 18 |
| Reese's PB & J Strawberry Big Cup 39 g - 16 ct | 16 |
| Pop Rocks Dips Sour Apple 18 g ( Case of 18 ) | 18 |
| Nerds Rope Tropical - Case of 24 | 24 |
| Mike & Ike Lollipop Rings - 24 ct | 24 |
| Toxic Waste Slime Licker Taffy Sour Blue Razz 20 g - 48 ct | 48 |
| Cow Tales Strawberry Bars - 36 ct | 36 |

---

## 🚨 Critical Notes

1. **Unit Price Calculation:** If quantity changes from 1 → 12, the unit price needs recalculation:
   - Current: `unitPrice = $22.99, qty = 1` → Total = $22.99 ✅
   - Fixed: `unitPrice = $1.92, qty = 12` → Total = $22.99 ✅
   
2. **Backwards Compatibility:** Existing POs with quantity=1 may need reprocessing

3. **Confidence Impact:** Correctly extracted quantities should increase overall confidence scores

4. **Total Validation:** Need to verify `totalPrice` matches `quantity × unitPrice` after extraction
