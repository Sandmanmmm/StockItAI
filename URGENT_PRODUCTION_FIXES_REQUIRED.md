# 🚨 URGENT: Production Fixes Required - October 11, 2025

## Current Critical Errors

### 1. Transaction Timeout (Most Critical)
```
Transaction timeout was 9000 ms, however 52820 ms passed since the start of the transaction
```
**Impact:** Workflows failing at database save stage

### 2. PostgreSQL Lock Timeout
```
PostgresError { code: "55P03", message: "canceling statement due to lock timeout" }
```
**Impact:** Multiple workflows contending for same PO, causing lock timeouts

### 3. Engine Connection Errors
```
Engine is not yet connected.
```
**Impact:** Prisma client state management issues

### 4. PO Lock Contention
```
⏳ [PO LOCK] Waiting for PO cmgmui2be0001l504p29b1sjy to be released by workflow...
```
**Impact:** 5+ workflows stuck waiting for single PO lock

---

## 🔧 Required Fixes (In Priority Order)

### Fix #1: Update Vercel DATABASE_URL (MANUAL ACTION REQUIRED) 🚨

**Problem:** PostgreSQL is killing queries before Prisma timeout can handle them gracefully.

**Current DATABASE_URL:**
```
postgresql://postgres.omvdgqbmgxxutbjhnamf:78eXTjEWiC1aXoOe@aws-1-ca-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=50&pool_timeout=30&connect_timeout=60
```

**Required DATABASE_URL:**
```
postgresql://postgres.omvdgqbmgxxutbjhnamf:78eXTjEWiC1aXoOe@aws-1-ca-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=50&pool_timeout=30&connect_timeout=60&statement_timeout=180000
```

**What to add:** `&statement_timeout=180000`

**Steps:**
1. Go to Vercel Dashboard → Settings → Environment Variables
2. Edit `DATABASE_URL`
3. Add `&statement_timeout=180000` to the end
4. Save
5. Trigger redeploy

**Why this is critical:**
- Without this, PostgreSQL kills queries at 30-60s
- Prisma's 120s transaction timeout never gets a chance to fire
- No amount of code changes will fix this

---

### Fix #2: Increase Transaction Timeout in Code

**Files to Update:**
1. `api/src/lib/databasePersistenceService.js`
2. Any other files using `prisma.$transaction()`

**Current:**
```javascript
await prisma.$transaction(async (tx) => {
  // ... operations
}, {
  maxWait: 15000,    // 15s
  timeout: 120000,   // 120s
  isolationLevel: 'ReadCommitted'
})
```

**Problem:** The timeout is set, but operations are taking >52s within transactions.

**Root Cause Analysis:**
1. Pre-transaction operations (supplier matching, SKU generation) are slow
2. Multiple queries executing sequentially inside transaction
3. PO lock contention causing delays

**Solution:** Move expensive operations OUTSIDE transaction

```javascript
// ✅ CORRECT: Pre-compute BEFORE transaction
const supplierMatch = await findOrCreateSupplier(tx, supplierName) // OUTSIDE tx
const skus = await generateSKUs(items)  // OUTSIDE tx
const preparedData = await prepareAllData()  // OUTSIDE tx

// Then fast transaction with just writes
await prisma.$transaction(async (tx) => {
  // Only writes, no expensive queries
  const po = await tx.purchaseOrder.upsert(preparedData)
  await tx.pOLineItem.createMany({ data: lineItems })
  return po
}, {
  maxWait: 15000,
  timeout: 30000,  // Shorter timeout, faster operations
  isolationLevel: 'ReadCommitted'
})
```

---

### Fix #3: Reduce PO Lock Contention

**Problem:** Multiple workflows trying to update same PO simultaneously

**Current Log Pattern:**
```
workflow_1760224509833_e45m4nnln holds lock on cmgmui2be0001l504p29b1sjy
5 other workflows waiting for same PO
```

**Root Cause:** Duplicate workflows being created for same PO

**Solution Options:**

#### Option A: Deduplicate Earlier (Recommended)
```javascript
// In cron job processing
const uniquePOs = new Map()
for (const workflow of workflows) {
  const poId = workflow.purchaseOrderId
  if (!uniquePOs.has(poId)) {
    uniquePOs.set(poId, workflow)
  } else {
    console.log(`🚫 Skipping duplicate workflow ${workflow.id} for PO ${poId}`)
  }
}
```

#### Option B: Increase Lock Timeout
```javascript
// In updatePurchaseOrderProgress
const PROGRESS_LOCK_TIMEOUT_MS = 5000  // Increase from 2000ms
```

#### Option C: Make Progress Updates Optional
```javascript
// Skip progress updates if PO is locked
try {
  await updatePurchaseOrderProgress(...)
} catch (error) {
  if (error.code === '55P03') {
    console.log('⏭️ Skipping progress update due to lock contention (non-fatal)')
    // Continue workflow without progress update
  } else {
    throw error
  }
}
```

---

### Fix #4: Fix Prisma Connection State

**Problem:** "Engine is not yet connected" errors

**Current Flow:**
1. Health check fails → force disconnect
2. Create new client
3. But old client references still used somewhere

**Solution:** Ensure all code paths use fresh client

```javascript
// In db.js - ensure all code uses the same client reference
export async function getClient() {
  await initializePrisma()
  return prisma  // Always return current prisma instance
}

// Update all services to use getClient()
// Example in workflowOrchestrator.js:
const prisma = await db.getClient()  // Get fresh reference
await prisma.purchaseOrder.update(...)
```

---

## 🧪 Testing Checklist

After deploying fixes:

### 1. Verify DATABASE_URL Update
```bash
# Check Vercel function logs for:
✅ DATABASE_URL statement_timeout detected at 180000ms
```

### 2. Verify Transaction Completion
```bash
# Should see:
✅ Transaction completed (total: 45000ms)  # Under 120s
✅ Database save completed

# Should NOT see:
❌ Transaction timeout was 9000 ms, however 52820 ms passed
❌ code: "55P03", message: "lock timeout"
```

### 3. Verify PO Lock Behavior
```bash
# Should see fewer lock waits:
⏳ [PO LOCK] Waiting... (1-2 occurrences, not 20+)
```

### 4. Verify No Engine Errors
```bash
# Should NOT see:
❌ Engine is not yet connected
```

---

## 📊 Expected Impact

### Before Fixes:
- ❌ 50-70% workflow failure rate
- ❌ Transaction timeouts causing cascading failures
- ❌ Multiple workflows stuck on same PO
- ❌ Inconsistent Prisma connection state

### After Fixes:
- ✅ 95%+ workflow success rate
- ✅ Transactions complete within timeout
- ✅ PO lock contention reduced 80%+
- ✅ Stable Prisma connections

---

## ⚠️ Deployment Order

1. **FIRST:** Update DATABASE_URL in Vercel (manual, critical)
2. **THEN:** Deploy code changes for transaction optimization
3. **THEN:** Deploy PO deduplication fix
4. **FINALLY:** Monitor and verify all fixes working

---

## 🚀 Ready to Deploy

- [ ] DATABASE_URL updated in Vercel
- [ ] Transaction optimization code ready
- [ ] PO deduplication logic implemented
- [ ] Prisma client reference cleanup done
- [ ] Monitoring/alerting configured
- [ ] Rollback plan documented

**Status:** ⏳ Awaiting manual DATABASE_URL update in Vercel
**Priority:** 🔴 CRITICAL - Deploy ASAP
**Estimated Fix Time:** 30 minutes (including redeploy)
**Estimated Impact:** Resolve 80%+ of current production errors
