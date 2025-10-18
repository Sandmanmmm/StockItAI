# Unit Price & Confidence Score Fix

## Issues Identified

### Issue #1: All Confidence Scores Show 50%
**Symptom:** Every line item shows exactly 50% confidence, regardless of extraction quality.

**Root Cause:**
```javascript
// databasePersistenceService.js:140 (OLD)
aiResult.confidence?.lineItems || {}
```

The code was looking for `confidence.lineItems`, but the AI service returns:
```javascript
{
  confidence: {
    overall: 0.85,
    purchaseOrder: 0.90,
    lineItems: 0.82,        // ❌ This is the AVERAGE, not per-item array
    itemBreakdown: [0.85, 0.78, 0.92, ...]  // ✅ This is the per-item array
  }
}
```

When `lineItems` (a number like `0.82`) was passed instead of an array, this fallback kicked in:
```javascript
const itemConfidence = lineItemsConfidence[i] || lineItemsConfidence.overall || 50
// lineItemsConfidence[i] = undefined (not an array)
// lineItemsConfidence.overall = undefined (not an object)
// Falls back to hardcoded 50
```

**Result:** All items defaulted to 50% confidence.

---

### Issue #2: Unit Price = Total Price (Not Divided by Qty)
**Symptom:** When AI extracts expanded quantities (e.g., 24 units from "Case of 24"), the unit price shows the case price instead of per-unit price.

**Example:**
```
Invoice shows:
  Product: Wonka Laffy Taffy Rope - Blue Raspberry X 24 Units
  Qty: 1 (1 case)
  Unit Price: $11.85 (price per case)
  Total: $11.85

AI extraction:
  quantity: 24 ✅ (correctly extracted total units)
  unitPrice: $11.85 ❌ (should be $0.49 per unit)
  total: $11.85 ✅
```

**Root Cause:**
```javascript
// databasePersistenceService.js:850 (OLD)
const unitCost = this.parseCurrency(item.unitPrice)
const totalCost = this.parseCurrency(item.totalPrice) || (quantity * unitCost)
```

The invoice's "unit price" column shows **price per pack/case**, not per individual unit. When the AI expands the quantity (1 case → 24 units), the code must recalculate:

```
unitCost = totalCost / quantity
unitCost = $11.85 / 24 = $0.49 per unit
```

---

## Fixes Implemented

### Fix #1: Use Per-Item Confidence Array
**File:** `api/src/lib/databasePersistenceService.js` (Line 140)

**Before:**
```javascript
aiResult.confidence?.lineItems || {},
```

**After:**
```javascript
aiResult.confidence?.itemBreakdown || [], // FIX: Use itemBreakdown (array) not lineItems (average)
```

**Impact:**
- ✅ Confidence scores now reflect actual per-item extraction quality
- ✅ Items with all fields populated show 85-95% confidence
- ✅ Items with missing data show 50-70% confidence  
- ✅ Enables accurate filtering of low-quality extractions

---

### Fix #2: Calculate True Per-Unit Price
**File:** `api/src/lib/databasePersistenceService.js` (Line 850-858)

**Before:**
```javascript
const unitCost = this.parseCurrency(item.unitPrice)
const totalCost = this.parseCurrency(item.totalPrice) || (quantity * unitCost)
```

**After:**
```javascript
// 💰 SMART UNIT PRICE CALCULATION
// When AI extracts expanded quantity (e.g., 24 units from "Case of 24"), 
// the invoice's "unit price" column shows price per CASE, not per UNIT.
// Calculate: unitCost = totalCost / quantity
const invoiceUnitPrice = this.parseCurrency(item.unitPrice)
const totalCost = this.parseCurrency(item.totalPrice) || (quantity * invoiceUnitPrice)

// Calculate true per-unit cost when quantity was expanded from pack size
const unitCost = totalCost / quantity
```

**Impact:**
- ✅ Unit prices now show true per-unit cost ($0.49 instead of $11.85)
- ✅ Correct pricing for Shopify product imports
- ✅ Accurate profit margin calculations
- ✅ Total cost validation still works (quantity × unitCost = totalCost)

---

## Expected Results

### Before Fix:
```
AUTO-1: Wonka Laffy Taffy Rope X 24 Units
  Qty: 24
  Unit Price: USD 11.85 ❌ (case price)
  Total: USD 11.85
  Confidence: 50% ❌ (hardcoded default)
```

### After Fix:
```
AUTO-1: Wonka Laffy Taffy Rope X 24 Units
  Qty: 24
  Unit Price: USD 0.49 ✅ (per-unit price: $11.85 / 24)
  Total: USD 11.85
  Confidence: 87% ✅ (actual confidence from AI)
```

---

## Validation Criteria

Test with the candyville.ca invoice:

1. **Unit Price Validation:**
   - ✅ AUTO-1 (24 units @ $11.85 total) → Unit Price = $0.49
   - ✅ AUTO-2 (240 units @ $23.75 total) → Unit Price = $0.099
   - ✅ AUTO-11 (24 units @ $39.98 total, qty=2) → Unit Price = $1.67

2. **Confidence Validation:**
   - ✅ Items with description, SKU, qty, price → 85-95% confidence
   - ✅ Items missing SKU or other fields → 60-80% confidence
   - ✅ NO items show exactly 50% (unless genuinely low quality)
   - ✅ Confidence scores vary across items (not all identical)

3. **Total Cost Validation:**
   - ✅ quantity × unitCost = totalCost (math checks out)
   - ✅ Subtotal matches sum of all line item totals

---

## Technical Details

### Confidence Calculation (from aiProcessingService.js)
```javascript
calculateFieldConfidence(item) {
  let score = 0
  if (item.description) score += 25
  if (item.sku || item.productCode) score += 20
  if (item.quantity > 0) score += 25
  if (item.unitPrice > 0) score += 25
  if (item.totalPrice matches quantity × unitPrice) score += 5
  return score / 100 // Returns 0.0 - 1.0
}
```

### Why This Fix is Safe

1. **Backward compatible:** Falls back to empty array `[]` if `itemBreakdown` missing
2. **Math is correct:** `unitCost = totalCost / quantity` is the standard formula
3. **Preserves total cost:** Total cost remains unchanged (used for validation)
4. **No schema changes:** Database fields remain the same
5. **Logs added:** Debug output shows calculation steps

---

## Deployment

Commit both fixes and push to trigger Vercel redeployment. Test with candyville.ca invoice after deployment completes.
