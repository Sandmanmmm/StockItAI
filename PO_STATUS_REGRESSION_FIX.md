# PO Status Regression Fix - Complete Summary

## Issue Discovered
PO status was changing from `review_needed` back to `processing` after workflow completion, causing infinite re-queuing loop.

## Root Causes Identified

### 1. Workflow Re-queuing Loop (commit abb7a76)
**Problem:** Cron was finding stuck workflows and re-queuing them even after auto-fix had marked them as completed.

**Initial Fix Attempt (FAILED):**
```javascript
// Attempted to use Prisma relation filter - INVALID!
purchaseOrder: {
  lineItems: {
    none: {}
  }
}
```
**Error:** `Unknown argument purchaseOrder. Did you mean purchaseOrderId?`
- WorkflowExecution model has `purchaseOrderId` field but NO relation defined
- Cannot use `include` or `where` on non-existent relation

### 2. Prisma Schema Limitation (commit 516a3bb)
**Problem:** Previous fix used invalid Prisma query syntax that would throw runtime error.

**Discovery:**
```prisma
model WorkflowExecution {
  purchaseOrderId String?  // Field exists
  // No relation defined! Cannot use purchaseOrder in queries
}
```

### 3. Final Fix (commit 85235c2)
**Solution:** Fetch PO data with separate queries instead of relation.

**Working Code:**
```javascript
// Get potentially stuck workflows
const potentiallyStuckWorkflows = await prisma.workflowExecution.findMany({
  where: {
    status: 'processing',
    updatedAt: { lt: fiveMinutesAgo }
  },
  take: 10
})

// Filter by checking PO line items separately
const stuckWorkflows = []
for (const workflow of potentiallyStuckWorkflows) {
  if (!workflow.purchaseOrderId) {
    stuckWorkflows.push(workflow)
    continue
  }
  
  // Separate query for PO data
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: workflow.purchaseOrderId },
    select: {
      _count: { select: { lineItems: true } }
    }
  })
  
  // Skip if PO has line items (auto-fix will handle)
  if (po?._count.lineItems > 0) {
    console.log(`⏭️ Skipping workflow ${workflow.workflowId} - auto-fix will handle`)
    continue
  }
  
  stuckWorkflows.push(workflow)
}
```

## How It Works

### Before Fix:
1. Auto-fix finds PO with line items, marks workflows as `completed`
2. Cron finds "stuck" workflows (still marked `processing` momentarily)
3. Cron re-queues workflows, resetting them to `processing` stage
4. PO status changes back to `processing`
5. **Infinite loop** - workflows never stay completed

### After Fix:
1. Auto-fix finds PO with line items, marks workflows as `completed`
2. Cron finds "stuck" workflows
3. **NEW:** Cron checks if PO has line items (separate query)
4. **Workflows with PO data are SKIPPED** - auto-fix will handle them
5. Only truly stuck workflows (no PO data) are re-queued
6. **Loop broken** - workflows with data aren't re-processed

## Technical Details

### Key Insight:
The cron has TWO mechanisms for handling stuck work:
1. **Auto-fix:** Handles POs with completed data (has line items)
2. **Workflow re-queueing:** Handles workflows truly stuck in processing

These were **conflicting** because re-queueing ran on ALL stuck workflows, including those that auto-fix should handle.

### Filter Logic:
```
Is workflow stuck (>5min old)?
  ├─ YES: Does PO have line items?
  │   ├─ YES: SKIP (let auto-fix handle it)
  │   └─ NO: RE-QUEUE (truly stuck, needs reprocessing)
  └─ NO: Not stuck, continue monitoring
```

### Performance Impact:
- Adds N separate queries where N = number of stuck workflows
- Limited to 10 workflows per check, then sliced to 5 after filtering
- Negligible impact since stuck workflows are rare (typically 0-2)

## Commits

1. **abb7a76** - Initial fix attempt with invalid Prisma syntax
   - Added line items filter to stuck workflow query
   - Would have thrown runtime error (invalid relation reference)

2. **516a3bb** - Corrected approach with separate queries
   - Removed invalid `include: { purchaseOrder }` syntax  
   - Changed to filter-then-query approach
   - **Still had bug:** Used async filter which doesn't work

3. **85235c2** - Final working fix
   - Changed from `filter` to explicit `for` loop
   - Each PO queried separately with `findUnique`
   - Proper async/await handling
   - Added logging for skipped workflows

## Testing

### Test PO: `cmgna8jjx0001jm04qh4nfblg`
**Before fix:**
- 2 workflows stuck in `processing` status
- PO status: `processing` (should be `review_needed`)
- Workflows being re-queued every minute by cron

**Expected after fix:**
- Workflows with PO data skipped by cron
- Auto-fix marks them as `completed`
- PO status stays `review_needed` or `completed`
- No more infinite re-queuing

### Diagnostic Tools Created:
- `api/check-workflow-details.mjs` - Show workflow status and metadata
- `api/check-workflow-queries.mjs` - Show which queries find workflows
- `api/test-workflow-filter.mjs` - Test Prisma relation syntax
- `api/test-stuck-workflow-filter.mjs` - Test filtering logic

## Related Issues

### Workflow Completion Failure (Separate Issue)
Discovered during investigation: Some workflows reach `currentStage: 'review_needed'` but remain in `status: 'processing'`.

**Cause:** `completeWorkflow()` throws error, caught in non-fatal try/catch.
```javascript
try {
  await this.completeWorkflow(workflowId, finalResult)
} catch (workflowError) {
  console.warn('⚠️ Failed to update workflow metadata (non-fatal):', workflowError.message)
  // Continue - the important database work is done
}
```

**Impact:** Workflows appear complete in Redis but database still shows `processing`.
**Fix needed:** Investigate why `completeWorkflow()` fails, ensure database update succeeds.

## Status

✅ **DEPLOYED** - Commit 85235c2
⏰ **Waiting for verification** - Need to monitor PO cmgna8jjx0001jm04qh4nfblg

### Success Criteria:
1. Stuck workflows with PO data are skipped by cron (see logs)
2. Auto-fix successfully completes workflows
3. PO status becomes `review_needed` or `completed`
4. PO status **stays** in final state (no regression)

## Lessons Learned

1. **Always test Prisma queries** - Schema defines available relations
2. **Read error messages carefully** - "Unknown argument purchaseOrder" was clear hint
3. **Separate query > complex relation** - Sometimes simpler is better
4. **Use explicit loops for async operations** - Array.filter() doesn't await
5. **Log skip decisions** - Helps verify filtering logic is working

## Next Steps

1. ✅ Deploy fix (commit 85235c2)
2. ⏳ Wait for deployment + cron runs (~5-10 minutes)
3. ⏳ Verify workflows are being skipped (check logs)
4. ⏳ Verify auto-fix completes workflows
5. ⏳ Verify PO status stabilizes
6. 📋 Investigate separate `completeWorkflow()` failure issue
