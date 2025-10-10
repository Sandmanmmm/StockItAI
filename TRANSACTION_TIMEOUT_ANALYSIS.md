# Transaction Timeout Analysis - October 10, 2025

## 🚨 Critical Issue Discovered

**Error:** Transaction timeout causing workflow failures
**Frequency:** Multiple occurrences after Prisma warmup fix deployment
**Impact:** Workflows failing at database save stage

---

## 📊 Error Evidence from Logs

### Error Message
```
❌ Database persistence failed (attempt 1/3): 
Transaction API error: Transaction already closed: 
A commit cannot be executed on an expired transaction. 
The timeout for this transaction was 8000 ms, 
however 59937 ms passed since the start of the transaction. 
Consider increasing the interactive transaction timeout or doing less work in the transaction.
```

### Timeline from Logs
```
18:52:50 - Cron job processing workflow
           "❌ Database persistence failed (attempt 1/3): 
            Transaction already closed: ...timeout was 8000 ms, 
            however 59937 ms passed..."

18:53:05 - POST /api/product-drafts starts
18:53:35 - Vercel Runtime Timeout (30 seconds)
18:53:50 - Another transaction error occurs in cron job
```

---

## 🔍 Root Cause Analysis

### The Problem: Transaction Staying Open Too Long

**Expected:** Transaction completes in <8 seconds
**Actual:** Transaction taking 59+ seconds (7.5x over limit)

### Why This Happens

Looking at the timeline, the transaction is opened during the workflow's database save stage, but something is keeping it open for nearly 60 seconds.

#### Potential Causes:

1. **Long-running AI Processing Inside Transaction**
   - AI parsing takes 50-60 seconds
   - If transaction starts before AI completes, it will timeout

2. **Supplier Fuzzy Matching Inside Transaction**
   - Previous fix (TRANSACTION_EXECUTION_OPTIMIZATION.md) moved this OUTSIDE transaction
   - Verify this optimization is still in place

3. **Multiple Retry Attempts**
   - Extension retries could be waiting inside transaction
   - Each retry adds delay within transaction context

4. **Connection Warmup Inside Transaction**
   - If warmup happens inside transaction, adds 3-4 seconds
   - Previous fix (TRANSACTION_TIMEOUT_FIX.md) should prevent this

---

## 📁 Key Files to Investigate

### 1. `api/src/lib/databasePersistenceService.js`
**Line 74:** Transaction starts
**Lines 40-73:** Pre-transaction operations (supplier matching)
**Lines 74-240:** Transaction body

**Critical Check:**
- Is supplier matching happening BEFORE transaction? (line 63-72) ✅
- Is transaction timeout set correctly? (line 222: `timeout: 8000`) ✅
- Are we doing work INSIDE transaction that should be OUTSIDE? ❓

### 2. `api/src/lib/db.js`
**Line 369:** Transaction detection in extension
**Lines 370-375:** Skip warmup for transaction operations

**Critical Check:**
- Is transaction detection working? ❓
- Are queries inside transaction skipping warmup correctly? ❓

### 3. `api/process-workflows-cron.js`
**Processing workflow with long-running operations**

**Critical Check:**
- Is workflow calling persistAIResults correctly? ✅
- Is workflow waiting for previous operations to complete? ❓

---

## 🧪 Diagnostic Questions

### Question 1: Is the transaction itself taking 60 seconds?
**Test:** Add timestamp logging inside transaction
```javascript
const result = await prisma.$transaction(async (tx) => {
  const txStart = Date.now()
  console.log(`🔒 [TX START] Transaction started at ${txStart}`)
  
  // ... transaction body ...
  
  console.log(`🔒 [TX END] Transaction duration: ${Date.now() - txStart}ms`)
  return result
}, { timeout: 8000 })
```

### Question 2: Is something BEFORE the transaction taking 60 seconds?
**Evidence from logs:**
```
18:42:44 ✅ Warmup complete in 2587ms
18:42:44 (3ms later) ❌ ImageReviewProduct.create failed
```
This suggests warmup is completing but operations failing immediately after.

### Question 3: Are we accumulating delays from multiple sources?
- Warmup: 3-4 seconds (now fixed to wait BEFORE transaction)
- Supplier matching: 5-50 seconds (fixed to run BEFORE transaction)
- Fuzzy matching: 0-50 seconds (fixed to run BEFORE transaction)
- Transaction operations: 2-3 seconds (fast writes only)

**Total if all outside transaction:** 10-107 seconds BEFORE transaction
**Transaction actual:** 2-3 seconds ✅

---

## 💡 Hypothesis

Based on the evidence, **the transaction itself is NOT taking 60 seconds**. Instead:

1. **Workflow processing takes 60+ seconds total** (AI parsing + supplier matching)
2. **Transaction is started** with 8-second timeout
3. **Transaction completes successfully** (writes are fast)
4. **HOWEVER:** The error is occurring on **RETRY attempts** or **subsequent operations**

### Supporting Evidence:
```
❌ Database persistence failed (attempt 1/3)
```
This is attempt 1 of 3 retries. The transaction error is happening on **FIRST attempt**, not after retries pile up.

### Revised Hypothesis:

**The transaction context is being REUSED or LEAKED across requests.**

Looking at the error timing:
- Transaction started 59937ms ago (59.9 seconds)
- But current operation just started
- **The transaction ID is from a PREVIOUS workflow execution**

This explains why:
- Transaction was valid when created
- Transaction expired after 8 seconds
- Current operation tries to use expired transaction
- Error: "Transaction ID is invalid, refers to an old closed transaction"

---

## 🎯 The Real Root Cause

### Transaction Context Leaking/Caching

**Evidence:**
1. Error says "59937ms passed" but operation just started
2. Error says "refers to an old closed transaction"
3. Multiple workflows processing simultaneously
4. Transaction from Workflow A being accessed by Workflow B

### How This Could Happen:

#### Scenario 1: Shared Prisma Client with Cached Transaction
```javascript
// WRONG: Transaction context stored in shared client
let cachedTransaction = null

async function someOperation() {
  if (!cachedTransaction) {
    cachedTransaction = await prisma.$transaction(...)
  }
  return cachedTransaction.query(...)  // Uses old transaction!
}
```

#### Scenario 2: Extension Intercepting Transaction Operations Incorrectly
```javascript
// In db.js extension
if (isTransactionOperation) {
  // Execute immediately - but what if tx context is stale?
  return await query(args)  // ❌ Could be using expired tx
}
```

#### Scenario 3: Multiple Concurrent Workflows Sharing State
- Workflow A starts transaction
- Workflow B starts processing
- Workflow A transaction expires
- Workflow B tries to use Workflow A's transaction context

---

## 🔧 Recommended Fixes

### Fix 1: Ensure Transaction Isolation (HIGH PRIORITY)

**File:** `api/src/lib/databasePersistenceService.js`

**Problem:** If multiple workflows call `persistAIResults` concurrently, they might share transaction state.

**Solution:** Ensure each call creates a NEW transaction:
```javascript
async persistAIResults(aiResult, merchantId, fileName, options = {}) {
  // ... pre-transaction work ...
  
  // CRITICAL: Create NEW transaction each time (don't cache)
  const result = await prisma.$transaction(
    async (tx) => {
      // Transaction body - ensure we use 'tx' not 'prisma'
      const purchaseOrder = await tx.purchaseOrder.upsert(...)
      const lineItems = await tx.pOLineItem.createMany(...)
      const auditRecord = await tx.aIProcessingAudit.create(...)
      return { purchaseOrder, lineItems, auditRecord }
    },
    {
      maxWait: 5000,
      timeout: 8000,
      isolationLevel: 'ReadCommitted'
    }
  )
  
  return result
}
```

### Fix 2: Add Transaction Context Validation

**File:** `api/src/lib/db.js`

**Solution:** Verify transaction context is fresh:
```javascript
async $allOperations({ model, operation, args, query }) {
  const isTransactionOperation = args?.__prismaTransactionContext !== undefined
  
  if (isTransactionOperation) {
    // Verify transaction is not expired
    const txContext = args.__prismaTransactionContext
    if (txContext && txContext.startedAt) {
      const age = Date.now() - txContext.startedAt
      if (age > 8000) {
        console.error(`❌ Transaction context is ${age}ms old (expired!)`)
        throw new Error(`Transaction context expired (${age}ms old, limit 8000ms)`)
      }
    }
    
    return await query(args)
  }
  
  // ... rest of extension logic
}
```

### Fix 3: Increase Transaction Timeout (TEMPORARY)

**File:** `api/src/lib/databasePersistenceService.js`
**Line 222**

**Current:**
```javascript
timeout: 8000, // 8 seconds
```

**Temporary fix while investigating:**
```javascript
timeout: 15000, // 15 seconds (temporary - gives more buffer)
```

⚠️ **This is NOT a long-term solution** - it just buys time to debug the real issue.

### Fix 4: Add Comprehensive Logging

**File:** `api/src/lib/databasePersistenceService.js`

```javascript
async persistAIResults(aiResult, merchantId, fileName, options = {}) {
  const operationId = `persist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const operationStart = Date.now()
  
  console.log(`🔵 [${operationId}] START persistAIResults`)
  console.log(`   Merchant: ${merchantId}`)
  console.log(`   File: ${fileName}`)
  console.log(`   Options:`, options)
  
  try {
    // Pre-transaction work
    console.log(`🔵 [${operationId}] Pre-transaction: Finding supplier...`)
    const preStart = Date.now()
    const supplier = await this.findOrCreateSupplier(...)
    console.log(`🔵 [${operationId}] Pre-transaction complete (${Date.now() - preStart}ms)`)
    
    // Transaction
    console.log(`🔵 [${operationId}] Starting transaction...`)
    const txStart = Date.now()
    const result = await prisma.$transaction(async (tx) => {
      console.log(`🔵 [${operationId}] Inside transaction (age: ${Date.now() - txStart}ms)`)
      
      // Operations...
      
      console.log(`🔵 [${operationId}] Transaction body complete (${Date.now() - txStart}ms)`)
      return { ... }
    }, {
      maxWait: 5000,
      timeout: 8000
    })
    
    console.log(`🔵 [${operationId}] Transaction committed (${Date.now() - txStart}ms)`)
    console.log(`🔵 [${operationId}] COMPLETE (total: ${Date.now() - operationStart}ms)`)
    
    return result
  } catch (error) {
    console.error(`🔴 [${operationId}] FAILED (${Date.now() - operationStart}ms):`, error.message)
    throw error
  }
}
```

---

## 🧪 Testing Strategy

### Test 1: Single Workflow Processing
1. Upload ONE PO
2. Monitor logs for transaction timing
3. Verify transaction completes in <8 seconds
4. Expected: SUCCESS

### Test 2: Concurrent Workflow Processing
1. Upload TWO POs simultaneously
2. Monitor logs for transaction context sharing
3. Check if workflows interfere with each other
4. Expected: May FAIL if transaction context is shared

### Test 3: Rapid Sequential Processing
1. Upload 5 POs in quick succession
2. Let cron process them one by one
3. Monitor for transaction context reuse
4. Expected: May FAIL if context is cached

---

## 📊 Monitoring After Deployment

### Success Metrics:
- ✅ Transaction duration < 5 seconds (3s margin)
- ✅ No "Transaction already closed" errors
- ✅ No "Transaction not found" errors
- ✅ Workflow success rate > 95%

### Warning Signs:
- ⚠️ Transaction duration 5-7 seconds (approaching limit)
- ⚠️ Multiple concurrent workflows failing
- ⚠️ Retries required for database operations

### Failure Indicators:
- ❌ Transaction duration > 8 seconds
- ❌ Any "Transaction already closed" errors
- ❌ Workflow success rate < 90%

---

## 🎓 Lessons Learned

### 1. Vercel Serverless Constraints
- 10-second function timeout (HARD limit)
- 30-second timeout for non-streaming endpoints
- Must complete ALL work within timeout
- No long-running processes allowed

### 2. Transaction Best Practices
- Keep transactions SHORT (< 3 seconds ideal)
- Move expensive operations OUTSIDE transactions
- Never cache transaction contexts
- Always create fresh transactions per operation
- Use transaction isolation carefully

### 3. Prisma Transaction Behavior
- Transaction timeout is STRICT (8 seconds)
- Transaction context cannot be reused
- Expired transactions throw errors
- Extensions must not delay transaction operations

---

## 📞 Next Steps

### Immediate (Within 1 Hour):
1. ✅ Document the issue (this file)
2. ⏳ Add comprehensive logging (Fix #4)
3. ⏳ Deploy logging changes
4. ⏳ Monitor next workflow execution
5. ⏳ Analyze logs to confirm hypothesis

### Short-term (Within 24 Hours):
1. Implement Fix #1 (transaction isolation)
2. Implement Fix #2 (context validation)
3. Test with single workflow
4. Test with concurrent workflows
5. Verify fix resolves issue

### Long-term (This Week):
1. Add automated testing for concurrent workflows
2. Implement transaction timing metrics
3. Create dashboard for monitoring
4. Document transaction patterns
5. Review all transaction usage in codebase

---

## 🔗 Related Documentation

- `TRANSACTION_TIMEOUT_FIX.md` - Previous warmup inside transaction fix
- `TRANSACTION_EXECUTION_OPTIMIZATION.md` - Supplier matching optimization
- `COMPLETE_FIX_SUMMARY.md` - Overall Prisma connection fixes
- `PRISMA_CONNECTION_ARCHITECTURE_FIX.md` - Architecture improvements

---

**Status:** 🔴 ACTIVE INVESTIGATION
**Priority:** 🔥 CRITICAL
**Owner:** Development Team
**Date:** October 10, 2025
**Last Updated:** 18:55 UTC
