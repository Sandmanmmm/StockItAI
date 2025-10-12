# 🔴 CRITICAL: Transaction Timeout Analysis & Fix

## ❌ Current Issue

```
Transaction timeout was 120000 ms, however 180041 ms passed since the start of the transaction
```

### Error Timeline (01:48:47 - 01:48:52)
- **01:48:47.552Z**: Dozens of workflows start waiting for PO lock
- **01:48:52.727Z**: Transaction timeout error after 180+ seconds
- **01:48:52.736Z**: Engine connection failure cascade

## 🔍 Root Cause Analysis

### Problem 1: Transaction Taking 180+ Seconds
**File**: `api/src/lib/databasePersistenceService.js`
**Line**: 169 (transaction timeout: 120000ms)

The transaction is configured with:
```javascript
{
  maxWait: 15000,
  timeout: 120000, // ← 2 MINUTES - WAY TOO LONG!
  isolationLevel: 'ReadCommitted'
}
```

But something inside the transaction is taking **3 minutes (180 seconds)**, causing:
1. Transaction times out at 120s (Prisma side)
2. But PostgreSQL query continues with `statement_timeout=180s` (database side)
3. Result: "Transaction already closed" error

### Problem 2: Timeout Misalignment
- **Prisma transaction timeout**: 120,000ms (2 minutes)
- **PostgreSQL statement_timeout**: 180,000ms (3 minutes)
- **These MUST be aligned**: Prisma timeout should be LESS than statement_timeout

### Problem 3: Expensive Operations Still Inside Transaction?
Despite pre-transaction supplier matching (lines 73-76), something is still taking 180s inside the transaction.

Possible culprits:
1. **SKU generation** (if using external service)
2. **Line item creation** (if processing hundreds of items)
3. **Supplier fuzzy matching fallback** (if pre-transaction match failed)
4. **Database lock contention** (if multiple workflows hitting same PO)

## ✅ Recommended Fixes

### Fix 1: Reduce Transaction Timeout to Realistic Value (COMPLETED)
**Status**: ✅ **FIXED** - Changed from 120000ms → 10000ms

```javascript
{
  maxWait: 15000,
  timeout: 10000, // ← FAST WRITES ONLY (10 seconds max)
  isolationLevel: 'ReadCommitted'
}
```

**Rationale**: 
- Supplier matching already moved outside (lines 73-76)
- Transaction should only do fast writes: UPDATE, INSERT, DELETE
- If transaction takes >10s, something is wrong (expensive query inside)

### Fix 2: Add Transaction Timeout Monitoring
**File**: `api/src/lib/databasePersistenceService.js`
**Lines**: 158-162

Changed warning threshold from 7s → 5s:
```javascript
if (txDuration > 5000) {
  console.warn(`⚠️ [${txId}] Transaction took ${txDuration}ms - should be under 5s!`)
}
```

### Fix 3: Investigate What's Taking 180 Seconds (REQUIRED)
**Action Items**:
1. ✅ Check if supplier fuzzy matching is being called INSIDE transaction
2. ⏳ Add timing logs for each operation inside transaction:
   - `updatePurchaseOrder`/`createPurchaseOrder`: Should be <1s
   - `deleteMany` line items: Should be <1s
   - `createLineItems`: Should be <2s (even for 50+ items)
   - `createAIAuditRecord`: Should be <500ms
3. ⏳ Check if any N+1 query problems exist
4. ⏳ Check if any external API calls happening inside transaction

### Fix 4: Add Circuit Breaker for Long Transactions
**Location**: `api/src/lib/databasePersistenceService.js`
**Line**: After line 94 (before transaction start)

```javascript
// Add transaction timeout guard
const TX_TIMEOUT_MS = 10000
const txTimeoutId = setTimeout(() => {
  console.error(`⚠️ [${txId}] Transaction exceeded ${TX_TIMEOUT_MS}ms - likely deadlock or slow query`)
  // Log current operation for debugging
}, TX_TIMEOUT_MS - 1000) // Warn 1s before timeout

try {
  const result = await prisma.$transaction(async (tx) => {
    // ... existing code ...
  }, { timeout: TX_TIMEOUT_MS })
  
  clearTimeout(txTimeoutId)
  return result
} catch (error) {
  clearTimeout(txTimeoutId)
  throw error
}
```

## 📊 Expected Results After Fix

### Before Fix:
- Transaction timeout: 120s
- Actual execution: 180s
- Error rate: 50%+
- Dozens of workflows blocked by lock contention

### After Fix #1 (Timeout Reduction):
- Transaction timeout: 10s
- Actual execution: Should be <5s
- Error rate: If still hitting timeout, will fail FASTER (better for debugging)
- Workflow queue won't build up as much

### After Full Investigation:
- Transaction execution: <3s (target)
- Error rate: <5%
- No lock contention buildup
- Clean workflow progression

## 🔍 Next Steps

1. ✅ **Deploy timeout fix** (10s transaction timeout)
2. ⏳ **Monitor production logs** for:
   - "Transaction took XXXXms" warnings
   - New timeout errors (should fail faster if issue persists)
   - Which specific operation is slow
3. ⏳ **Add detailed timing logs** inside transaction:
   ```javascript
   console.log(`🔒 [${txId}] Starting updatePurchaseOrder...`)
   const t1 = Date.now()
   const purchaseOrder = await this.updatePurchaseOrder(...)
   console.log(`🔒 [${txId}] updatePurchaseOrder took ${Date.now() - t1}ms`)
   
   console.log(`🔒 [${txId}] Starting deleteMany...`)
   const t2 = Date.now()
   await tx.pOLineItem.deleteMany(...)
   console.log(`🔒 [${txId}] deleteMany took ${Date.now() - t2}ms`)
   ```
4. ⏳ **Identify the 180s bottleneck** from timing logs
5. ⏳ **Move slow operation outside transaction** OR optimize it

## 🚨 Emergency Rollback Plan

If timeout fix causes MORE errors:
```bash
git revert HEAD
git push origin main
```

Then investigate with longer timeout but add detailed timing logs to find bottleneck.

## 📝 Timeline

- **2025-10-12 01:48**: Issue discovered (180s transaction timeout)
- **2025-10-12 [current]**: Fix #1 applied (timeout reduced to 10s)
- **Next**: Monitor logs and add detailed timing to identify 180s bottleneck
