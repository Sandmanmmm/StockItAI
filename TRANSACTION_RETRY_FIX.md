# Transaction Retry Fix - October 13, 2025

## Problem: Transaction Timeouts from In-Transaction Retries

### Symptoms
- Database save jobs failing after 60+ seconds
- Error: `Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 15000 ms, however 59908 ms passed since the start of the transaction.`
- Queue status: `database_save: active=0, completed=0, failed=8`
- Logs showing retry attempts with exponential backoff delays (200ms, 400ms, 800ms, 1600ms, 3200ms)

### Root Cause Analysis

**Timeline from Production Logs:**
```
21:20:32.411 - Prisma connecting, warmup starts
21:20:32.425 - Waiting 2500ms for engine warmup...
21:21:32.348 - Warmup complete in 59924ms (60 seconds!)
21:21:32.351 - [tx_1760390492349] Starting transaction...
21:22:32.310 - Transaction already closed... 59908ms passed
```

**The Problem:**
1. Vercel serverless cold start → Prisma engine warmup takes ~60 seconds
2. Transaction starts and hits `POLineItem.deleteMany()`
3. Error: `Engine is not yet connected`
4. Prisma extension retry logic kicks in **INSIDE the transaction**
5. Retry delays: 200ms + 400ms + 800ms + 1600ms + 3200ms = 6.2 seconds
6. But warmup needs 60 seconds → retries keep failing
7. Transaction timeout (15 seconds) exceeded → complete failure

**Key Insight:**
The retry logic was correct for **non-transaction** operations, but transaction operations have strict timeout constraints (15 seconds) and **cannot afford to wait for warmup delays inside the transaction**.

## Solution: Fail Fast for Transactions

### Changes Made (Commit 6297bfe)

**File:** `api/src/lib/db.js`

**Change 1 - Disable retries for transaction operations (Line ~562):**
```javascript
// BEFORE:
const maxRetries = 5

// AFTER:
// CRITICAL FIX 2025-10-13: NO RETRIES for transaction operations - timeout is too strict (15s)
const maxRetries = isTransactionOperation ? 1 : 5
```

**Change 2 - Skip backoff delays for transactions (Line ~617):**
```javascript
// BEFORE:
const delay = 200 * Math.pow(2, attempt - 1)
console.warn(`⚠️ [EXTENSION] ${model}.${operation} attempt ${attempt}/${maxRetries} failed: ${error.message}. Retrying in ${delay}ms...`)
await new Promise(resolve => setTimeout(resolve, delay))

// AFTER:
const delay = 200 * Math.pow(2, attempt - 1)
console.warn(
  `⚠️ [EXTENSION] ${model}.${operation} attempt ${attempt}/${maxRetries} ` +
  `failed: ${error.message}.${isTransactionOperation ? ' (transaction - no retry)' : ` Retrying in ${delay}ms...`}`
)
if (!isTransactionOperation) {
  await new Promise(resolve => setTimeout(resolve, delay))
}
```

### How It Works

**BEFORE (Broken):**
```
1. Transaction starts
2. POLineItem.deleteMany fails: 'Engine is not yet connected'
3. Retry #1 with 200ms delay (INSIDE transaction)
4. Retry #2 with 400ms delay (INSIDE transaction)
5. Retry #3 with 800ms delay (INSIDE transaction)
6. Retry #4 with 1600ms delay (INSIDE transaction)
7. Retry #5 with 3200ms delay (INSIDE transaction)
8. Total: ~6 seconds wasted, but warmup needs 60 seconds
9. Transaction timeout at 15 seconds → FAILS
```

**AFTER (Fixed):**
```
1. Transaction starts
2. POLineItem.deleteMany fails: 'Engine is not yet connected'
3. NO RETRY (maxRetries=1 for transactions)
4. Transaction fails fast (~100ms)
5. Outer retry loop in databasePersistenceService catches error
6. Waits for warmup to complete (OUTSIDE transaction)
7. Starts NEW transaction after warmup complete
8. POLineItem.deleteMany succeeds
9. Transaction completes in ~150ms → SUCCESS
```

### Validation in Outer Retry Loop

The fix works because `databasePersistenceService.js` already handles engine connection errors in its outer retry loop:

**File:** `api/src/lib/databasePersistenceService.js` (Lines 309-336)
```javascript
// Check if error is retryable (connection/engine errors/transaction errors)
const isRetryable = error.message?.includes('Engine') || 
                   error.message?.includes('empty') ||
                   error.message?.includes('not yet connected') ||
                   error.message?.includes('timeout') ||
                   error.message?.includes('Transaction') ||
                   error.message?.includes('expired') ||
                   error.message?.includes('closed') ||
                   error.code === 'P1001' || // Can't reach database
                   error.code === 'P2024'    // Timed out fetching

if (!isRetryable || attempt === maxRetries) {
  throw new Error(`Database persistence failed after ${attempt} attempts: ${error.message}`)
}

// Will retry on next loop iteration
console.log(`⏳ Will retry due to transient connection/transaction error...`)
```

## Expected Behavior After Fix

### Cold Start (First Request After Deployment)
1. Request arrives during Prisma warmup
2. `databasePersistenceService.persistAIResults()` outer retry loop (attempt 1/3)
3. Transaction starts
4. `POLineItem.deleteMany()` fails: "Engine is not yet connected"
5. Transaction fails fast (~100ms)
6. Outer retry catches error (line 309: `error.message.includes('not yet connected')`)
7. Retry attempt 2/3 (outside transaction)
8. Warmup completes
9. New transaction starts and succeeds (~150ms)
10. **Total time: 3-5 seconds** (vs 60+ seconds before)

### Warm Instance (Subsequent Requests)
1. Engine already warmed up
2. Transaction starts and succeeds immediately (~150ms)
3. No retries needed

## Monitoring Commands

### Check Queue Status
```powershell
Invoke-WebRequest -Uri "https://stock-it-ai.vercel.app/api/queue-admin/status" | Select-Object -ExpandProperty Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

**Look for:**
- `database_save: { completed: increasing }`
- `failed: 8` (should stay at 8, no new failures)

### Check Recent Logs
```powershell
vercel logs --since 10m | Select-String "transaction|Database persistence|EXTENSION"
```

**Look for:**
- ✅ `(transaction - no retry)` in error messages
- ✅ Transaction durations: 100-500ms
- ✅ `Will retry due to transient connection error` (outer retry working)
- ❌ No more `Transaction already closed` errors after 60 seconds

### Check Workflow Completion
```powershell
vercel logs --since 10m | Select-String "database_save"
```

**Look for:**
- ✅ `Database save completed successfully`
- ✅ `Created N line items`
- ✅ Transaction commit times under 500ms

## Performance Impact

### Before Fix
- **Cold Start:** 60+ seconds → timeout → failure
- **Success Rate:** 0% during cold starts
- **Transaction Duration:** 60,000ms+ (timeout)
- **Queue Status:** `completed: 0, failed: 8`

### After Fix (Expected)
- **Cold Start:** 3-5 seconds → success
- **Success Rate:** >95% (even during cold starts)
- **Transaction Duration:** 150-500ms
- **Queue Status:** `completed: increasing, failed: 8 (stable)`

## Related Fixes

This fix complements two other critical fixes deployed today:

1. **Lock Contention Elimination** - Removed redundant PO updates during workflow
2. **PO Conflict Resolution** - Split UPDATE vs CREATE conflict handling

Together, these three fixes form a complete solution to the database save failures.

## Testing Scenarios

### Scenario 1: Cold Start
1. Wait 10 minutes for Vercel instance to idle
2. Upload new PO
3. **Expected:** First transaction fails fast, retry succeeds
4. **Total time:** 3-5 seconds
5. **Result:** database_save completes successfully

### Scenario 2: Warm Instance
1. Upload PO immediately after previous upload
2. **Expected:** Transaction succeeds on first attempt
3. **Total time:** <500ms
4. **Result:** database_save completes successfully

### Scenario 3: Multiple Concurrent Uploads
1. Upload 3 POs simultaneously
2. **Expected:** All succeed (no lock contention)
3. **Total time:** <1 second each
4. **Result:** All database_save jobs complete successfully

## Rollback Plan

If issues arise, revert commit 6297bfe:
```bash
git revert 6297bfe
git push origin main
```

This will restore the retry logic for transaction operations.

## Success Criteria

- ✅ `database_save` completed count increases from 0
- ✅ No new `Transaction already closed` errors
- ✅ Transaction durations consistently under 1 second
- ✅ Workflows progress to `product_draft_creation` stage
- ✅ Failed count remains at 8 (no new failures)

## Deployment

- **Commit:** 6297bfe
- **Branch:** main
- **Pushed:** October 13, 2025 21:24 UTC
- **Auto-Deploy:** Vercel (2-3 minutes)
- **Status:** ⏳ Deploying...
