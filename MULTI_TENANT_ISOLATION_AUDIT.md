# Multi-Tenant Data Isolation Audit & Fix Plan

## Critical Issue Discovered
**Problem**: `db.getCurrentMerchant()` without parameters returns the **first active merchant** instead of the **authenticated merchant from the request**.

**Impact**: 
- Customer A sees Customer B's data
- Dashboard shows wrong/missing data
- Major security/privacy violation
- Multi-tenant data isolation broken

---

## Systematic Audit Results

### Files Using `db.getCurrentMerchant()` (61 instances across 12 files)

#### 1. **api/src/routes/purchaseOrders.js** - ⚠️ CRITICAL
**Status**: PARTIALLY FIXED (1/8 routes fixed)
- ✅ Line 17: GET `/` - FIXED to use `req.merchant`
- ❌ Line 174: GET `/:id` - Uses `getCurrentMerchant()`
- ❌ Line 221: POST `/` - Uses `getCurrentMerchant()`
- ❌ Line 267: PUT `/:id` - Uses `getCurrentMerchant()`
- ❌ Line 318: DELETE `/:id` - Uses `getCurrentMerchant()`
- ❌ Line 436: POST `/:id/deny` - Uses `getCurrentMerchant()`
- ❌ Line 480: POST `/:id/approve` - Uses `getCurrentMerchant()`
- ❌ Line 546: POST `/:id/edit` - Uses `getCurrentMerchant()`

**Impact**: PO CRUD operations may operate on wrong merchant's data

---

#### 2. **api/src/routes/suppliers.js** - ⚠️ CRITICAL
**Status**: ALL NEED FIXING (11/11 routes affected)
- ❌ Line 15: GET `/` - List suppliers
- ❌ Line 44: GET `/:id` - Get single supplier
- ❌ Line 88: POST `/` - Create supplier
- ❌ Line 152: PUT `/:id` - Update supplier
- ❌ Line 199: DELETE `/:id` - Delete supplier
- ❌ Line 252: POST `/:id/link/:purchaseOrderId` - Link supplier
- ❌ Line 302: GET `/suggest/:purchaseOrderId` - Suggest suppliers
- ❌ Line 345: POST `/auto-match/:purchaseOrderId` - Auto-match
- ❌ Line 392: GET `/categories` - Get categories
- ❌ Line 462: GET `/stats` - Get stats
- ❌ Line 533: POST `/:id/archive` - Archive supplier

**Impact**: Supplier management completely broken across merchants

---

#### 3. **api/src/routes/upload.js** - ⚠️ CRITICAL
**Status**: ALL NEED FIXING (5/5 routes affected)
- ❌ Line 45: POST `/` - Upload PO
- ❌ Line 304: GET `/status/:uploadId` - Check status
- ❌ Line 399: GET `/:uploadId/download` - Download file
- ❌ Line 498: DELETE `/:uploadId` - Delete upload
- ❌ Line 556: GET `/history` - Upload history

**Impact**: File uploads assigned to wrong merchant, security breach

---

#### 4. **api/src/routes/search.js** - ⚠️ CRITICAL
**Status**: NEEDS FIXING (1/1 route affected)
- ❌ Line 26: GET `/` - Unified search

**Impact**: Search returns data from wrong merchant

---

#### 5. **api/src/routes/processing.js** - ⚠️ HIGH
**Status**: ALL NEED FIXING (3/3 routes affected)
- ❌ Line 15: POST `/start` - Start processing
- ❌ Line 95: GET `/status/:jobId` - Check status
- ❌ Line 177: POST `/reprocess/:poId` - Reprocess

**Impact**: Processing jobs may target wrong merchant's data

---

#### 6. **api/src/routes/lineItems.js** - ⚠️ HIGH
**Status**: ALL NEED FIXING (3/3 routes affected)
- ❌ Line 13: GET `/:purchaseOrderId/items` - Get line items
- ❌ Line 57: PUT `/:itemId` - Update line item
- ❌ Line 103: DELETE `/:itemId` - Delete line item

**Impact**: Line item operations on wrong merchant's POs

---

#### 7. **api/src/routes/asyncPOProcessing.js** - ⚠️ HIGH
**Status**: ALL NEED FIXING (5/5 routes affected)
- ❌ Line 22: POST `/queue` - Queue processing
- ❌ Line 135: GET `/status/:jobId` - Get status
- ❌ Line 248: POST `/cancel/:jobId` - Cancel job
- ❌ Line 353: GET `/list` - List jobs
- ❌ Line 424: POST `/retry/:jobId` - Retry job

**Impact**: Async processing jobs mixed between merchants

---

#### 8. **api/src/routes/analytics.js** - ⚠️ HIGH
**Status**: ALL NEED FIXING (3/3 routes affected)
- ❌ Line 13: GET `/overview` - Analytics overview
- ❌ Line 114: GET `/suppliers` - Supplier analytics
- ❌ Line 180: GET `/trends` - Trend analytics

**Impact**: Analytics show mixed data from multiple merchants

---

#### 9. **api/src/routes/aiSettings.js** - ⚠️ MEDIUM
**Status**: ALL NEED FIXING (3/3 routes affected)
- ❌ Line 13: GET `/` - Get AI settings
- ❌ Line 55: PUT `/` - Update AI settings
- ❌ Line 112: POST `/reset` - Reset to defaults

**Impact**: AI settings mixed between merchants

---

### Routes That Are SAFE (Use `req.merchant` correctly)

✅ **api/src/routes/merchantData.js** - All routes use merchant context properly
✅ **api/src/routes/merchantStatus.js** - Uses merchant from auth
✅ **api/src/routes/productDrafts.js** - Need to verify
✅ **api/src/routes/imageReview.js** - Need to verify
✅ **api/src/routes/refinementConfig.js** - Need to verify

---

## Fix Strategy

### Phase 1: Critical Security Fixes (IMMEDIATE)
**Priority**: Data leakage and security issues
1. ✅ **purchaseOrders.js** - GET `/` (DONE)
2. **purchaseOrders.js** - All remaining routes (7 routes)
3. **suppliers.js** - All routes (11 routes)
4. **upload.js** - All routes (5 routes)
5. **search.js** - Unified search (1 route)

### Phase 2: Data Integrity Fixes (HIGH)
**Priority**: Prevent data corruption
1. **processing.js** - All routes (3 routes)
2. **lineItems.js** - All routes (3 routes)
3. **asyncPOProcessing.js** - All routes (5 routes)
4. **analytics.js** - All routes (3 routes)

### Phase 3: Configuration Fixes (MEDIUM)
**Priority**: Settings isolation
1. **aiSettings.js** - All routes (3 routes)

---

## Standard Fix Pattern

### BEFORE (Wrong):
```javascript
const merchant = await db.getCurrentMerchant()
if (!merchant) {
  return res.status(500).json({ 
    success: false, 
    error: 'Merchant not found' 
  })
}
```

### AFTER (Correct):
```javascript
const merchant = req.merchant
if (!merchant || !merchant.id) {
  return res.status(401).json({ 
    success: false, 
    error: 'Merchant authentication required' 
  })
}
```

---

## Verification Steps

After each fix:
1. ✅ Verify `req.merchant` is set by auth middleware
2. ✅ Add logging: `console.log('Merchant:', merchant.shopDomain)`
3. ✅ Test with multiple merchants
4. ✅ Verify data isolation in database queries

---

## Testing Plan

### Test Scenario 1: Two Merchants, Same Feature
1. Merchant A: Upload PO
2. Merchant B: Upload PO
3. Merchant A: List POs → Should see ONLY their PO
4. Merchant B: List POs → Should see ONLY their PO

### Test Scenario 2: Search Isolation
1. Merchant A: Create supplier "ABC Corp"
2. Merchant B: Search for "ABC Corp" → Should NOT find it
3. Merchant A: Search for "ABC Corp" → Should find it

### Test Scenario 3: Analytics Isolation
1. Merchant A: Has 10 POs
2. Merchant B: Has 5 POs
3. Merchant A: Check analytics → Should show 10
4. Merchant B: Check analytics → Should show 5

---

## Deployment Checklist

- [ ] Phase 1 fixes committed
- [ ] Phase 2 fixes committed
- [ ] Phase 3 fixes committed
- [ ] All tests pass
- [ ] Manual testing with 2+ merchants
- [ ] Deploy to staging
- [ ] Verify in production logs
- [ ] Monitor for authentication errors

---

## Estimated Impact

**Total Routes to Fix**: 42 routes across 9 files
**Estimated Time**: 2-3 hours (systematic approach)
**Risk Level**: LOW (pattern-based fix, minimal logic change)
**Testing Time**: 1-2 hours

---

## Success Criteria

✅ Each merchant sees only their own data
✅ No cross-merchant data leakage
✅ No authentication errors
✅ All features work per merchant
✅ Analytics accurate per merchant
✅ Search scoped to merchant

