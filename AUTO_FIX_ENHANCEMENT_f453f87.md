# Auto-Fix Enhancement - Commit f453f87

## Problem Identified

When checking PO `cmgna8jjx0001jm04qh4nfblg`, we discovered:

```
📋 PO Status:
- ID: cmgna8jjx0001jm04qh4nfblg
- Status: processing (should be completed!)
- Job Status: completed ✅
- Line Items: 2 ✅ (data exists!)
- Age: 14 minutes

📊 Workflows:
- Workflow 1 (cmgna8m870001l804ev9x5doz):
  Status: processing
  Stage: ai_parsing
  Age: 1156s (19 minutes) 🚨 STUCK!

- Workflow 2 (cmgna8kik0005jm04j5hffiwh):
  Status: processing
  Stage: database_save
  Age: 116s (2 minutes)
```

### The Issue

The cron auto-fix was running and detecting the stuck PO, but:

1. **Only fixed the most recent workflow** - Used `findFirst()` instead of `findMany()`
2. **Left older workflows stuck** - Workflow 1 remained in "processing" for 19 minutes
3. **No audit trail** - No metadata showing auto-fix was applied
4. **Incomplete cleanup** - PO status updated but workflows not completed

## The Fix

### Before (Original Auto-Fix)
```javascript
// Only updated ONE workflow
const workflow = await prisma.workflowExecution.findFirst({
  where: { purchaseOrderId: po.id },
  orderBy: { createdAt: 'desc' }
})

if (workflow) {
  await prisma.workflowExecution.update({
    where: { id: workflow.id },
    data: {
      status: 'completed',
      currentStage: 'status_update',
      progressPercent: 100,
      completedAt: new Date()
    }
  })
}
```

**Problem**: If multiple workflows exist for a PO (retries, duplicates), only the newest one gets completed.

### After (Enhanced Auto-Fix)
```javascript
// Find ALL active workflows
const workflows = await prisma.workflowExecution.findMany({
  where: { 
    purchaseOrderId: po.id,
    status: { in: ['pending', 'processing'] } // Only active ones
  }
})

console.log(`📋 Found ${workflows.length} active workflow(s) to complete`)

// Complete EVERY workflow
for (const workflow of workflows) {
  await prisma.workflowExecution.update({
    where: { id: workflow.id },
    data: {
      status: 'completed',
      currentStage: 'status_update',
      progressPercent: 100,
      stagesCompleted: workflow.stagesTotal || 4,
      completedAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        ...(workflow.metadata || {}),
        autoFixApplied: true,
        autoFixReason: 'PO had data but workflow stuck >5 minutes',
        autoFixedAt: new Date().toISOString()
      }
    }
  })
  console.log(`   ✅ Completed workflow ${workflow.workflowId}`)
}
```

**Benefits**:
- ✅ Completes ALL stuck workflows, not just one
- ✅ Adds metadata audit trail
- ✅ Better logging for monitoring
- ✅ Proper cleanup of orphaned workflows

## New Diagnostic Tool

Created `api/check-po-status.mjs` to inspect POs and workflows:

```bash
node api/check-po-status.mjs <poId>
```

**Output**:
- PO details (status, line items, age)
- All workflows (status, stage, age)
- AI processing audit
- Active workflow detection
- Recommendations for fixes

## Expected Results

After next cron run (every minute):

1. **PO cmgna8jjx0001jm04qh4nfblg will be auto-fixed:**
   - Both workflows marked as completed ✅
   - PO status updated to 'review_needed' (confidence 0.77 < 0.8) ✅
   - Metadata added showing auto-fix applied ✅

2. **Queue health improves:**
   - database-save: Active goes from 1 → 0
   - Workflows no longer stuck in processing

3. **Logs will show:**
   ```
   🔧 Fixing stuck PO cmgna8jjx0001jm04qh4nfblg
   📋 Found 2 active workflow(s) to complete for PO
      ✅ Completed workflow wf_... (ai_parsing -> status_update)
      ✅ Completed workflow workflow_... (database_save -> status_update)
   🎉 Auto-fix complete for PO:
      - PO status: review_needed
      - Workflows completed: 2
      - Line items: 2
   ```

## Testing

### Manual Test
```bash
# Check PO before next cron
node api/check-po-status.mjs cmgna8jjx0001jm04qh4nfblg

# Wait for cron to run (1 minute)
# Check production logs for auto-fix messages

# Check PO after cron
node api/check-po-status.mjs cmgna8jjx0001jm04qh4nfblg
```

**Expected**: 
- Active workflows: 2 → 0
- PO status: processing → review_needed
- Workflow status: processing → completed

### Automated Testing
The cron runs every minute and will automatically detect and fix:
- POs with data (line items exist)
- Status stuck in "processing"
- Last updated >5 minutes ago

## Related Fixes

This completes the trilogy of production stability fixes:

1. **Commit da324db**: Prisma engine cold-start race condition
   - Connection pool 2→5
   - Cron startup delay 3s
   - Separate DIRECT_URL connection

2. **Commit 2a4f369**: Transaction timeout exhaustion
   - Timeout 10s→60s
   - Handle PO lock contention

3. **Commit 2a6eea6**: Cron prismaOperation removal
   - Direct prisma calls
   - No wrapper function

4. **Commit f453f87**: Enhanced auto-fix (THIS FIX)
   - Complete ALL stuck workflows
   - Metadata audit trail
   - Better cleanup

## Monitoring

Watch for these success indicators:

✅ **Logs show complete workflow cleanup**:
```
📋 Found 2 active workflow(s) to complete for PO cmgna8jjx0001jm04qh4nfblg
   ✅ Completed workflow wf_1760248045530_cmgna8k9
   ✅ Completed workflow workflow_1760248047659_mygj4peym
```

✅ **Queue health improves**:
- database-save active: 1 → 0
- All queues show 0 active, 0 waiting

✅ **PO status correct**:
- Status: processing → review_needed (or completed)
- Job Status: completed ✅
- Line Items: Present ✅

⚠️ **Warning signs**:
- Auto-fix runs but workflows still stuck (check logs for errors)
- Same PO detected as stuck multiple times
- Workflow metadata not being set

---

**Status**: Deployed to production (commit f453f87)
**Next Cron Run**: Within 60 seconds
**Expected Fix**: PO cmgna8jjx0001jm04qh4nfblg and 2 workflows completed
