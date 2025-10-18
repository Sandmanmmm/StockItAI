# Confidence Score Calculation Fix

## Issues Identified

### Issue #1: Frontend Display Bug (0.77% instead of 77%)
**Symptom:** Confidence scores displayed as "0.77%" and "0.5%" instead of "77%" and "50%".

**Root Cause:** Database stores confidence as decimal (0.0-1.0), but frontend displayed it directly with `%` sign without multiplying by 100.

**Files Affected:**
- `src/components/admin/MerchantReviewInterface.tsx` (PO header badge, line item badges, color functions)
- `src/components/PurchaseOrderDetails.tsx` (multiple confidence displays)
- `src/components/ProductRefinementDialog.tsx` (AI notes text)

---

### Issue #2: All Line Items = 50% Confidence (Root Cause)
**Symptom:** Every single line item shows exactly 50% confidence, regardless of data quality.

**Root Cause:** The `calculateFieldConfidence` function in `aiProcessingService.js` was looking for fields ending in `Confidence` (like `descriptionConfidence`, `priceConfidence`), but **the AI doesn't return those fields**. When no confidence fields were found, it defaulted to 0.5:

```javascript
// OLD BROKEN CODE:
calculateFieldConfidence(fieldObject) {
  const confidenceFields = Object.keys(fieldObject).filter(key => key.endsWith('Confidence'))
  if (confidenceFields.length === 0) return 0.5  // ❌ Always returned 0.5!
  
  const sum = confidenceFields.reduce((total, field) => total + fieldObject[field], 0)
  return sum / confidenceFields.length
}
```

**The Real Problem:**
The AI extraction returns line items like:
```json
{
  "description": "Wonka Laffy Taffy Rope X 24 Units",
  "quantity": 24,
  "unitPrice": 11.85,
  "total": 11.85,
  "sku": null
}
```

There are **NO** `*Confidence` fields! The function should **calculate** confidence based on which fields are present/valid.

---

## Fixes Implemented

### Fix #1: Frontend Display (3 files)

**File: `src/components/admin/MerchantReviewInterface.tsx`**

1. **PO Header Badge (Line 182):**
```tsx
// Before: {purchaseOrder.confidence}% Confidence
// After:
{Math.round(purchaseOrder.confidence * 100)}% Confidence
```

2. **Line Item Badges (Line ~330):**
```tsx
// Before: {item.confidence}%
// After:
{Math.round(item.confidence * 100)}%
```

3. **Color/Warning Functions (Lines 150-167):**
```tsx
const getConfidenceColor = (confidence: number) => {
  const confidencePercent = confidence * 100  // Convert 0-1 to 0-100
  if (confidencePercent >= 90) return 'bg-green-100 text-green-800'
  if (confidencePercent >= 75) return 'bg-blue-100 text-blue-800'
  // ...
}

const lowConfidenceItems = purchaseOrder.lineItems.filter(item => (item.confidence * 100) < 75)
const hasIssues = lowConfidenceItems.length > 0 || (purchaseOrder.confidence * 100) < 80
```

**File: `src/components/PurchaseOrderDetails.tsx`**

1. **Confidence Display (Line 749):**
```tsx
{Math.round(purchaseOrder.confidence * 100)}% confidence
```

2. **Progress Bar (Line 871):**
```tsx
<Progress value={purchaseOrder.confidence * 100} />  // Was: value={purchaseOrder.confidence}
```

3. **Line Item Badge (Line 1392):**
```tsx
{Math.round(item.confidence * 100)}%
```

4. **Color Function (Line 709):**
```tsx
const getConfidenceColor = (confidence: number) => {
  const confidencePercent = confidence * 100
  if (confidencePercent >= 95) return 'text-success'
  // ...
}
```

**File: `src/components/ProductRefinementDialog.tsx`**

```tsx
// Before:
confidence: item.confidence / 100,  // ❌ Double conversion!
aiNotes: `...with ${item.confidence}% confidence`  // ❌ 0.5% not 50%

// After:
confidence: item.confidence,  // Already 0-1 from database
aiNotes: `...with ${Math.round(item.confidence * 100)}% confidence`  // ✅ 50%
```

---

### Fix #2: Backend Confidence Calculation

**File: `api/src/lib/aiProcessingService.js`**

Rewrote `calculateFieldConfidence` to **actually calculate** confidence based on field completeness:

**For Line Items:**
```javascript
let score = 0

// Description (25 points)
if (fieldObject.description && fieldObject.description.trim().length > 0) score += 25

// SKU/Product Code (20 points)  
if (fieldObject.sku || fieldObject.productCode) score += 20

// Quantity (25 points)
if (fieldObject.quantity && parseFloat(fieldObject.quantity) > 0) score += 25

// Unit Price (25 points)
if (fieldObject.unitPrice && parseFloat(fieldObject.unitPrice) > 0) score += 25

// Total Price Validation Bonus (5 points)
// Check if quantity × unitPrice ≈ total (within 5% tolerance)
if (qty * unitPrice matches total within 5%) score += 5

return score / 100  // Returns 0.0 - 1.0
```

**For PO Headers:**
```javascript
let score = 0

// PO Number (30 points)
if (fieldObject.poNumber) score += 30

// Supplier (30 points)
if (fieldObject.supplier.name) score += 30

// Dates (20 points)
if (fieldObject.orderDate || fieldObject.invoiceDate) score += 20

// Totals (20 points)
if (fieldObject.totalAmount) score += 20

return score / 100
```

---

## Expected Results

### Before Fixes:
```
PO Header: 0.77% Confidence ❌
Line Item 1: 0.5% Confidence ❌ (all items identical)
Line Item 2: 0.5% Confidence ❌
Line Item 3: 0.5% Confidence ❌
...
```

### After Fixes:
```
PO Header: 77% Confidence ✅
Line Item 1 (full data): 100% Confidence ✅ (desc + sku + qty + price + valid total)
Line Item 2 (no SKU): 80% Confidence ✅ (desc + qty + price + valid total)
Line Item 3 (no price): 70% Confidence ✅ (desc + sku + qty)
Line Item 4 (minimal): 50% Confidence ✅ (desc + qty only)
```

---

## Confidence Score Breakdown

### Line Item Scoring (0-100 points):
- **Description/Product Name**: 25 points
- **SKU/Product Code**: 20 points
- **Quantity**: 25 points
- **Unit Price**: 25 points
- **Total Price Validation** (qty × price = total): 5 bonus points

### PO Header Scoring (0-100 points):
- **PO Number**: 30 points
- **Supplier**: 30 points
- **Order/Invoice Date**: 20 points
- **Total Amount**: 20 points

---

## Validation Criteria

Test with the candyville.ca invoice (36 line items):

1. **Display Format:**
   - ✅ PO overall shows "77%" not "0.77%"
   - ✅ Line items show "50%" not "0.5%"

2. **Confidence Variation:**
   - ✅ Items with SKU → 95-100% confidence
   - ✅ Items without SKU → 75-80% confidence
   - ✅ NOT all items showing identical 50%

3. **Color Coding:**
   - ✅ Green badges for 90%+ confidence
   - ✅ Blue badges for 75-89% confidence
   - ✅ Yellow/Red badges for <75% confidence

4. **Math Validation:**
   - ✅ Items where (qty × unitPrice ≈ total) get 5 bonus points
   - ✅ Items with mismatched totals don't get bonus

---

## Technical Details

### Why This Fix is Correct

1. **Field-based confidence is industry standard**: Most AI extraction systems score based on completeness and validation
2. **No schema changes needed**: AI doesn't need to return per-field confidence
3. **Scales with quality**: Better extractions (more fields) = higher confidence
4. **Math validation**: Cross-checks quantity × price = total for accuracy
5. **Backward compatible**: Falls back to legacy `*Confidence` fields if present

### Why the Old Code Was Broken

The old code assumed the AI would return fields like:
```json
{
  "description": "Product Name",
  "descriptionConfidence": 0.95,
  "quantity": 24,
  "quantityConfidence": 0.88,
  "unitPrice": 10.50,
  "unitPriceConfidence": 0.92
}
```

But the actual AI returns:
```json
{
  "description": "Product Name",
  "quantity": 24,
  "unitPrice": 10.50
}
```

No confidence fields → default to 0.5 → **all items = 50%** ❌

---

## Deployment

Commit and push:
- `api/src/lib/aiProcessingService.js` (confidence calculation logic)
- `src/components/admin/MerchantReviewInterface.tsx` (display fixes)
- `src/components/PurchaseOrderDetails.tsx` (display fixes)
- `src/components/ProductRefinementDialog.tsx` (display fix)

Vercel will auto-deploy. Test with candyville.ca invoice after deployment (~2-3 minutes).
