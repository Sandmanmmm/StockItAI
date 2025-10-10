# Transaction Timeout Fix - Comprehensive Logging

## Problem
Transaction timeouts occurring with message: "59937ms passed since the start of the transaction"
But the transaction should only take 2-3 seconds.

## Root Cause
The error suggests the transaction context from a PREVIOUS operation is being reused.

## Fix Applied
Added comprehensive transaction tracking with unique IDs to identify exactly when/where transactions are created and used.

### Changes Made:

1. **Transaction ID Tracking** (databasePersistenceService.js)
   - Line 76: Generate unique transaction ID for each transaction
   - Track transaction start time
   - Log transaction age at each operation
   - Detect approaching timeout (>7s)

2. **Transaction Lifecycle Logging**
   - Transaction start: Log ID and timestamp
   - Transaction body: Log age when entering
   - Transaction complete: Log total duration
   - Transaction commit: Log success and timing

## Expected Log Output

### Normal Operation (Success):
```
🔒 [tx_1728589425123_abc123] Starting transaction...
🔒 [tx_1728589425123_abc123] Inside transaction (age: 5ms)
🔒 [tx_1728589425123_abc123] Transaction body complete (duration: 2847ms)
🔒 [tx_1728589425123_abc123] Transaction committed successfully (total: 2851ms)
```

### Timeout Warning (Approaching Limit):
```
🔒 [tx_1728589425456_def456] Starting transaction...
🔒 [tx_1728589425456_def456] Inside transaction (age: 8ms)
🔒 [tx_1728589425456_def456] Transaction body complete (duration: 7234ms)
⚠️ [tx_1728589425456_def456] Transaction took 7234ms - approaching 8s timeout!
🔒 [tx_1728589425456_def456] Transaction committed successfully (total: 7238ms)
```

### Transaction Timeout (Error):
```
🔒 [tx_1728589425789_ghi789] Starting transaction...
🔒 [tx_1728589425789_ghi789] Inside transaction (age: 11ms)
❌ Database persistence failed (attempt 1/3): 
   Transaction API error: Transaction already closed: 
   A commit cannot be executed on an expired transaction. 
   The timeout for this transaction was 8000 ms, 
   however 59937 ms passed since the start of the transaction.
```

## What to Look For in Logs

### Case 1: Transaction ID Mismatch
If error shows a **different** transaction ID than the one that started, it means:
- Old transaction context is being reused ❌
- Transaction contexts are leaking across operations ❌
- Need to investigate Prisma client sharing

### Case 2: Transaction ID Match with Long Duration
If error shows the **same** transaction ID but with >8s duration:
- Something inside the transaction is slow ❌
- Pre-transaction optimizations not working ❌
- Need to move more work outside transaction

### Case 3: Transaction ID Match with Short Duration
If error shows **same** transaction ID with <8s actual duration but error says 59s:
- Prisma's internal timing is wrong (unlikely) ❓
- System clock issue (very unlikely) ❓
- Transaction created from stale client instance ❌

## Next Steps After Deployment

1. **Monitor First Workflow:**
   - Watch for transaction IDs in logs
   - Verify ID consistency throughout operation
   - Check actual vs reported duration

2. **If Timeout Occurs:**
   - Note the transaction ID in error message
   - Search logs for when that transaction ID was created
   - Calculate actual time elapsed
   - Determine if IDs match or mismatch

3. **If IDs Mismatch:**
   - Find where transaction context is being cached
   - Check for shared state in service classes
   - Verify Prisma client is not sharing transaction contexts

4. **If IDs Match but Duration is Wrong:**
   - Check what's happening inside transaction
   - Verify pre-transaction optimizations are running
   - Look for blocking operations

## Files Modified

- `api/src/lib/databasePersistenceService.js`:
  - Line 76: Transaction ID generation
  - Line 77: Transaction start logging
  - Line 80: Transaction age logging
  - Line 212: Transaction duration check
  - Line 224: Transaction commit logging

---

**Status:** 🟡 DEPLOYED - MONITORING
**Date:** October 10, 2025
**Time:** 19:05 UTC
