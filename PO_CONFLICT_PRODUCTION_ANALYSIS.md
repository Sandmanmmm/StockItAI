# PO Conflict Handling - Production Readiness Analysis

**Date:** October 10, 2025  
**Status:** 🔴 ISSUES FOUND - Needs fixes before deployment

---

## 🔍 Current Implementation Review

### What We Have Now

**Location:** `api/src/lib/databasePersistenceService.js`

**Two conflict handling mechanisms:**

1. **UPDATE scenario** (lines 587-598): Throws `PO_NUMBER_CONFLICT` error
2. **CREATE scenario** (lines 469-486): Finds existing PO and updates it

**Retry logic** (lines 73-118): Finds next available suffix (3541 → 3541-1 → 3541-2)

---

## 🚨 Critical Issues Found

### Issue #1: Inconsistent Behavior Between CREATE and UPDATE

**UPDATE scenario (with purchaseOrderId):**
```javascript
// Lines 587-598
if (updateError.code === 'P2002') {
  // Throws PO_NUMBER_CONFLICT
  // Triggers retry with suffix logic (3541 → 3541-1)
  throw error  
}
```

**CREATE scenario (no purchaseOrderId):**
```javascript
// Lines 469-486
if (error.code === 'P2002') {
  // Finds existing PO and UPDATES it instead
  const existingPO = await tx.purchaseOrder.findFirst(...)
  return await this.updatePurchaseOrder(tx, existingPO.id, ...)
}
```

**Problem:** Two different behaviors for the same conflict!
- UPDATE: Creates new PO with suffix (3541-1)
- CREATE: Merges into existing PO (updates 3541)

**Which one is correct for production?**

---

### Issue #2: CREATE Conflict Handler Doesn't Use Suffix Logic

When creating a NEW purchase order:
```javascript
// User uploads PO #3541
// PO #3541 already exists in database

// Current behavior:
await tx.purchaseOrder.create({ number: "3541" })  // ❌ Fails with P2002

// Catch handler:
const existingPO = await tx.findFirst({ number: "3541" })
return await this.updatePurchaseOrder(tx, existingPO.id, ...)  // Updates EXISTING PO

// Expected behavior (based on your request):
// Should create NEW PO with number "3541-1"
```

**Problem:** CREATE scenario doesn't use the suffix logic at all!

---

### Issue #3: Race Condition in Suffix Finding

**Code (lines 83-118):**
```javascript
while (true) {
  const existing = await prisma.purchaseOrder.findFirst({
    where: { merchantId, number: uniqueNumber }
  })
  
  if (!existing) {
    break  // Use this number
  }
  
  suffix++
  uniqueNumber = `${basePoNumber}-${suffix}`
}
```

**Scenario:**
```
Time 0ms: Workflow A checks "3541-1" → Not found → Will use it
Time 5ms: Workflow B checks "3541-1" → Not found → Will use it
Time 10ms: Workflow A creates PO "3541-1" → Success
Time 15ms: Workflow B creates PO "3541-1" → P2002 CONFLICT!
```

**Problem:** Two concurrent workflows can find the same "available" number!

---

### Issue #4: Performance - Multiple DB Queries in Loop

**Current code:**
```javascript
while (true) {
  const existing = await prisma.purchaseOrder.findFirst(...)  // DB query
  if (!existing) break
  suffix++
}
```

If conflicts exist for 3541-1, 3541-2, 3541-3, 3541-4...
- Query 1: Check 3541-1 → Found
- Query 2: Check 3541-2 → Found  
- Query 3: Check 3541-3 → Found
- Query 4: Check 3541-4 → Found
- Query 5: Check 3541-5 → Not found ✓

**Problem:** 5 sequential database queries **OUTSIDE** transaction adds latency

---

### Issue #5: Suffix Logic Runs OUTSIDE Transaction

**Code flow:**
```javascript
// OUTSIDE transaction
if (options.poNumberConflict) {
  while (true) {
    const existing = await prisma.purchaseOrder.findFirst(...)  // Query
    // ... find suffix
  }
}

// INSIDE transaction
await prisma.$transaction(async (tx) => {
  const purchaseOrder = await this.updatePurchaseOrder(...)
})
```

**Problem:** 
- Suffix finding happens outside transaction (OK for speed)
- But between finding suffix and creating PO, another workflow could take it
- Race condition window is larger

---

## ✅ Production-Ready Solutions

### Solution Option 1: **Atomic Suffix with Database Function** (BEST)

**Create a PostgreSQL function:**
```sql
CREATE OR REPLACE FUNCTION get_next_po_number(
  base_number TEXT,
  merchant_id TEXT
) RETURNS TEXT AS $$
DECLARE
  suffix INTEGER := 1;
  new_number TEXT;
BEGIN
  LOOP
    new_number := base_number || '-' || suffix;
    
    -- Try to insert, exit if successful
    IF NOT EXISTS (
      SELECT 1 FROM "PurchaseOrder" 
      WHERE "merchantId" = merchant_id 
      AND "number" = new_number
    ) THEN
      RETURN new_number;
    END IF;
    
    suffix := suffix + 1;
    
    -- Safety limit
    IF suffix > 100 THEN
      RETURN base_number || '-' || EXTRACT(EPOCH FROM NOW())::BIGINT;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
```

**Use in Prisma:**
```javascript
const uniqueNumber = await prisma.$queryRaw`
  SELECT get_next_po_number(${basePoNumber}, ${merchantId})
`
```

**Benefits:**
- ✅ Atomic operation (no race conditions)
- ✅ Single database round-trip
- ✅ Transaction-safe
- ✅ Handles concurrency correctly

---

### Solution Option 2: **Optimistic Locking with Retry** (SIMPLER)

**Don't pre-check, just try and retry on conflict:**

```javascript
async createPurchaseOrder(tx, aiResult, merchantId, fileName, supplierId, options) {
  const basePoNumber = aiResult.extractedData?.poNumber || 
                       aiResult.extractedData?.number || 
                       `PO-${Date.now()}`
  
  let suffix = 0
  let attempts = 0
  const maxAttempts = 100
  
  while (attempts < maxAttempts) {
    const poNumber = suffix === 0 ? basePoNumber : `${basePoNumber}-${suffix}`
    
    try {
      const purchaseOrder = await tx.purchaseOrder.create({
        data: { 
          number: poNumber,
          // ... other fields
        }
      })
      
      console.log(`📋 Created purchase order: ${purchaseOrder.number}`)
      if (suffix > 0) {
        console.log(`   ⚠️ Added suffix -${suffix} to resolve conflict`)
      }
      return purchaseOrder
      
    } catch (error) {
      if (error.code === 'P2002') {
        // Conflict - try next suffix
        suffix++
        attempts++
        console.log(`   Conflict on ${poNumber}, trying ${basePoNumber}-${suffix}...`)
        continue
      }
      throw error  // Other errors
    }
  }
  
  // Fallback to timestamp
  const timestampNumber = `${basePoNumber}-${Date.now()}`
  return await tx.purchaseOrder.create({
    data: { number: timestampNumber, /* ... */ }
  })
}
```

**Benefits:**
- ✅ Simple to implement
- ✅ No race conditions (database enforces uniqueness)
- ✅ Works inside transaction
- ✅ Automatic retry on conflict
- ⚠️ Multiple transaction attempts if many conflicts

---

### Solution Option 3: **Pre-check All Existing Suffixes** (CURRENT + FIX)

**Improve current approach:**

```javascript
// OUTSIDE transaction (before retry)
if (options.poNumberConflict) {
  const basePoNumber = options.poNumberConflict
  
  // Get ALL existing POs with this base number in ONE query
  const existingPOs = await prisma.purchaseOrder.findMany({
    where: {
      merchantId: merchantId,
      number: {
        startsWith: basePoNumber  // Finds: 3541, 3541-1, 3541-2, etc.
      }
    },
    select: { number: true }
  })
  
  // Parse all suffixes
  const existingSuffixes = new Set()
  existingSuffixes.add(basePoNumber)  // Base number exists
  
  existingPOs.forEach(po => {
    if (po.number === basePoNumber) {
      existingSuffixes.add(0)  // Base exists
    } else if (po.number.startsWith(`${basePoNumber}-`)) {
      const suffix = po.number.substring(basePoNumber.length + 1)
      if (/^\d+$/.test(suffix)) {  // Only numeric suffixes
        existingSuffixes.add(parseInt(suffix))
      }
    }
  })
  
  // Find first available suffix
  let suffix = 1
  while (existingSuffixes.has(suffix)) {
    suffix++
    if (suffix > 100) break  // Safety
  }
  
  const uniqueNumber = `${basePoNumber}-${suffix}`
  console.log(`✅ Found available PO number: ${uniqueNumber}`)
  
  // Update AI result
  aiResult.extractedData.poNumber = uniqueNumber
  aiResult.extractedData.number = uniqueNumber
}
```

**Benefits:**
- ✅ Single database query
- ✅ Finds lowest available suffix (3541-1, not 3541-5)
- ⚠️ Small race condition window remains (between query and transaction)
- ⚠️ If conflict still happens in transaction, need fallback

---

## 🎯 Recommended Implementation

**Combination approach:**

1. **Use Solution 3** (optimized pre-check) for speed
2. **Add Solution 2 fallback** inside transaction if pre-check number conflicts
3. **Handle both CREATE and UPDATE** the same way

---

## 📋 Implementation Checklist

### Must Fix Before Deployment:

- [ ] **Issue #1:** Make CREATE and UPDATE behavior consistent
  - Both should use suffix logic
  - Remove "find and update existing" from CREATE handler
  
- [ ] **Issue #2:** Implement suffix logic in CREATE scenario
  - Wrap CREATE in retry loop
  - Auto-append suffix on P2002
  
- [ ] **Issue #3:** Fix race condition
  - Use single query to get all existing suffixes
  - Or use optimistic locking with retry
  
- [ ] **Issue #4:** Optimize performance
  - Replace sequential queries with single query
  - Get all conflicts at once
  
- [ ] **Issue #5:** Add transaction-level fallback
  - If pre-checked number still conflicts, retry with timestamp
  - Handle edge cases gracefully

### Should Add:

- [ ] **Logging:** Add clear logs when suffix is added
  - `⚠️ PO number conflict: Using 3541-2 instead of 3541`
  
- [ ] **Metrics:** Track conflict rate
  - How often do conflicts occur?
  - What's the average suffix needed?
  
- [ ] **Notification:** Inform user of number change
  - "Document shows PO #3541, saved as #3541-2 due to conflict"
  
- [ ] **Database Index:** Add index for performance
  ```sql
  CREATE INDEX idx_po_number_prefix ON "PurchaseOrder" 
  ("merchantId", "number" text_pattern_ops);
  ```

### Nice to Have:

- [ ] **Admin UI:** Show POs with suffixes
  - Filter to find "3541*" (3541, 3541-1, 3541-2)
  
- [ ] **Merge tool:** Allow merging duplicate POs
  - If user realizes 3541-1 and 3541-2 are duplicates
  
- [ ] **Validation:** Prevent manual creation of conflicting numbers
  - UI should check availability before submit

---

## 🚀 Deployment Risk Assessment

**Current Code (as committed):**

| Risk | Severity | Likelihood | Impact |
|------|----------|------------|--------|
| Race condition creates duplicate PO numbers | HIGH | MEDIUM | Data integrity violation |
| CREATE and UPDATE behave differently | HIGH | HIGH | Confusing user experience |
| CREATE doesn't use suffix logic | HIGH | HIGH | Unexpected merge behavior |
| Multiple sequential queries slow | MEDIUM | HIGH | Poor performance |
| Transaction timeout from queries | MEDIUM | LOW | Workflow failures |

**Overall Risk:** 🔴 **HIGH - NOT PRODUCTION READY**

**Recommendation:** **DO NOT DEPLOY** current code. Implement Solution 2 or 3 first.

---

## 💡 Quick Fix for Immediate Deployment

If you need to deploy ASAP, here's the minimal fix:

**Change CREATE handler to match UPDATE behavior:**

```javascript
// In createPurchaseOrder, replace lines 469-486:
catch (error) {
  if (error.code === 'P2002') {
    // Throw conflict error instead of finding and updating
    console.log(`⚠️ PO number ${extractedPoNumber} conflicts with existing PO`)
    const conflictError = new Error(`PO_NUMBER_CONFLICT: ${extractedPoNumber}`)
    conflictError.code = 'PO_NUMBER_CONFLICT'
    conflictError.conflictingNumber = extractedPoNumber
    throw conflictError  // Let outer handler add suffix and retry
  }
  throw error
}
```

This makes CREATE behavior consistent with UPDATE (both use suffix logic).

**Time to implement:** 5 minutes  
**Risk reduction:** HIGH → MEDIUM  
**Remaining issues:** Race condition, performance

---

## 📊 Summary

**Current Status:** 🔴 Multiple critical issues

**Recommended Action:** Implement **Solution 2** (Optimistic Locking) or **Solution 3** (Optimized Pre-check)

**Minimum Required:** Quick fix to make CREATE/UPDATE consistent

**Timeline:**
- Quick fix: 5 minutes
- Solution 2: 30 minutes
- Solution 3: 45 minutes
- Solution 1 (DB function): 2 hours

**My Recommendation:** Implement **Solution 2** - it's simple, reliable, and handles concurrency correctly.
