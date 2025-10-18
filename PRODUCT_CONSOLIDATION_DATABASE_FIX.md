# Product Consolidation Database Fix

## Problem Summary

The purchase order extraction was showing several issues:
1. **"(# variants)" appearing in product names** - Description field included display text
2. **Unit prices showing $0.00** - Field mapping issue (unitCost vs unitPrice)
3. **All confidence at 50%** - Confidence stored as 0-1 in DB but displayed as 0-100
4. **Quantity showing "11"** - SKU variants were being saved as consolidated objects
5. **Duplicate line items** - Consolidation logic running before database save

## Root Cause

The product consolidation feature was being applied **before database save**, creating nested objects with `isConsolidated`, `variants`, and `variantCount` fields that don't match the database schema.

### Schema Mismatch

**Database Schema (POLineItem):**
```prisma
model POLineItem {
  id          String
  sku         String
  productName String
  description String?
  quantity    Int
  unitCost    Float      // ⚠️ Not unitPrice
  totalCost   Float      // ⚠️ Not totalPrice
  confidence  Float      // ⚠️ Stored as 0-1, not 0-100
  // ... no support for variants, isConsolidated, etc.
}
```

**Consolidated Object Structure:**
```javascript
{
  id: "consolidated-...",
  sku: "070622801051, 070622801031",
  name: "Cow Tales Bars",
  description: "Cow Tales Bars (2 variants)", // ❌ Display text in description
  quantity: 22,  // ❌ Sum of variants
  isConsolidated: true,  // ❌ No such field in DB
  variantCount: 2,       // ❌ No such field in DB
  variants: [...]        // ❌ No such field in DB - nested array!
}
```

## Solution

Apply product consolidation **only in the API response layer**, not before database save:

### 1. Enhanced AI Service - Save Unconsolidated Items

**File:** `api/src/lib/enhancedAIService.js`

```javascript
// ❌ BEFORE: Consolidation before database save
if (enableConsolidation && productConsolidationService.shouldConsolidate(mergedItems)) {
  const consolidatedItems = productConsolidationService.consolidateLineItems(mergedItems)
  finalResult.lineItems = consolidatedItems  // ❌ Consolidated data goes to DB
  finalResult.extractedData.lineItems = consolidatedItems
}

// ✅ AFTER: No consolidation before database save
const mergedItems = this._dedupeLineItems(allLineItems)
finalResult.lineItems = mergedItems  // ✅ Unconsolidated data to DB
finalResult.extractedData.lineItems = mergedItems
```

### 2. Line Items API - Consolidate on Read

**File:** `api/src/routes/lineItems.js`

```javascript
// GET /api/line-items/purchase-order/:poId
const lineItems = await prisma.pOLineItem.findMany({ ... })

// Transform database fields to match frontend expectations
const transformedItems = lineItems.map(item => ({
  id: item.id,
  sku: item.sku,
  productName: item.productName,
  quantity: item.quantity,
  unitPrice: item.unitCost,     // ✅ Map unitCost → unitPrice
  totalPrice: item.totalCost,   // ✅ Map totalCost → totalPrice
  confidence: Math.round(item.confidence * 100), // ✅ Convert 0-1 → 0-100
  // ... with multiple field aliases for compatibility
}))

// Apply consolidation for UI display (optional via query param)
const consolidate = req.query.consolidate !== 'false'
if (consolidate && enableConsolidation && shouldConsolidate(transformedItems)) {
  responseData = productConsolidationService.consolidateLineItems(transformedItems)
}

return { data: responseData, meta: { totalItems, consolidated } }
```

### 3. Product Consolidation Service - Clean Description

**File:** `api/src/lib/productConsolidationService.js`

```javascript
// ❌ BEFORE: Display text in description field
description: `${baseName} (${items.length} variants)`

// ✅ AFTER: Clean description (UI handles display)
description: baseName
```

## Data Flow

### Before Fix (❌ Broken)

```
AI Extraction → Deduplication → Consolidation → Database
                                     ↓
                            Nested structure with variants
                                     ↓
                              ❌ Schema mismatch
                              ❌ Data corruption
```

### After Fix (✅ Working)

```
AI Extraction → Deduplication → Database (flat line items)
                                     ↓
                              ✅ Matches schema
                              ✅ All data preserved

API Request → Database Read → Transform Fields → Consolidate → Response
                                    ↓                ↓
                              unitCost → unitPrice   Group variants
                              0-1 → 0-100 confidence Clean display
```

## Benefits

1. **Database Integrity** - Unconsolidated items saved as flat records
2. **Data Preservation** - All SKU variants preserved in database
3. **Flexible Display** - Consolidation applied on-demand via API
4. **Field Mapping** - Proper transformation between DB schema and frontend
5. **Backward Compatibility** - Multiple field aliases (unitPrice/unit_price/price)

## Testing

### Test Consolidation in API

```bash
# Get unconsolidated line items
curl http://localhost:5001/api/line-items/purchase-order/:poId?consolidate=false

# Get consolidated line items (default)
curl http://localhost:5001/api/line-items/purchase-order/:poId
```

### Expected Results

**Unconsolidated (99 items):**
```json
{
  "data": [
    { "sku": "070622801051", "productName": "Cow Tales Bars Caramel", "quantity": 5 },
    { "sku": "070622801031", "productName": "Cow Tales Bars Brownie", "quantity": 6 },
    ...
  ],
  "meta": { "totalItems": 99, "consolidated": false }
}
```

**Consolidated (55 products):**
```json
{
  "data": [
    {
      "sku": "070622801051, 070622801031",
      "productName": "Cow Tales Bars",
      "description": "Cow Tales Bars",  // ✅ No "(2 variants)"
      "quantity": 11,  // ✅ Sum of variants
      "unitPrice": 0.99,  // ✅ Proper price mapping
      "confidence": 85,   // ✅ Converted to 0-100
      "isConsolidated": true,
      "variantCount": 2,
      "variants": [
        { "sku": "070622801051", "productName": "Cow Tales Bars Caramel", "quantity": 5, "unitPrice": 0.99 },
        { "sku": "070622801031", "productName": "Cow Tales Bars Brownie", "quantity": 6, "unitPrice": 0.99 }
      ]
    },
    ...
  ],
  "meta": { "totalItems": 99, "consolidated": true, "consolidatedCount": 55 }
}
```

## Frontend Integration

### PODetailView.tsx

```typescript
// Fetch line items
const { data, meta } = await api.getLineItems(poId)

// Display consolidated products
data.forEach(item => {
  if (item.isConsolidated) {
    // Show "Cow Tales Bars" with badge "(2 variants)"
    // On click, expand to show variant table
  } else {
    // Show regular line item
  }
})
```

## Configuration

### Environment Variables

```bash
# Disable consolidation globally (default: enabled)
ENABLE_PRODUCT_CONSOLIDATION=false
```

### API Query Parameters

```
GET /api/line-items/purchase-order/:poId?consolidate=false
```

## Related Files

- `api/src/lib/enhancedAIService.js` - Removed consolidation before DB save
- `api/src/lib/productConsolidationService.js` - Fixed description field
- `api/src/routes/lineItems.js` - Added consolidation on API read
- `api/src/lib/databasePersistenceService.js` - Unchanged (saves flat items)

## Status

- ✅ Database save fixed - stores unconsolidated items
- ✅ API consolidation implemented - applies on read
- ✅ Field mapping fixed - unitCost/totalCost/confidence
- ✅ Description field cleaned - no "(# variants)"
- ⏳ Frontend integration pending - PODetailView + ProductDetailView UI updates

## Migration Notes

**No database migration required!** This fix changes when consolidation is applied, but doesn't change the database schema or existing data.

Existing POs with corrupted consolidated objects in the database should be reprocessed:
- Use "Reprocess AI" button in UI
- Or run reprocessPo.js script with correct uploadId
