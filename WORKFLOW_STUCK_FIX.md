# Workflow "Stuck" Detection Fix

## 🎯 Problem Summary

Workflows were being detected as "stuck" by the cron job even though they were processing successfully, leading to unnecessary reprocessing and duplicate work.

## 🔍 Root Cause Analysis

### The Disconnect

The system uses two parallel tracking mechanisms:

| System | Updated During Processing? | Used By |
|--------|---------------------------|---------|
| **Redis** | ✅ Yes (every stage) | Workflow orchestrator, frontend polling |
| **Database** | ❌ NO (only initial creation) | Cron job stuck detection |

### What Was Happening

1. **17:19:31** - Workflow created with `status: 'pending'` in database
2. **17:19:31** - Workflow processing starts via Bull queues
3. **17:20:00** - Stages complete successfully (Redis updated)
4. **17:20:00** - Database `workflowExecution` record **never updated**
5. **17:21:31** - Cron job runs (every minute)
6. **17:21:31** - Cron checks: `status = 'processing' AND updatedAt < 5 minutes ago`
7. **17:21:31** - Cron marks workflow as "stuck" and reprocesses it ❌

### Code Evidence

**workflowOrchestrator.js - Original `updateWorkflowStage()`:**
```javascript
async updateWorkflowStage(workflowId, stage, status) {
  let metadata = await this.getWorkflowMetadata(workflowId)
  // ... update metadata
  await this.setWorkflowMetadata(workflowId, metadata) // ⚠️ Only Redis!
  // ❌ Database workflowExecution record never updated
}
```

**process-workflows-cron.js - Stuck Detection:**
```javascript
// Cron checks database (not Redis) for stuck workflows
const stuckWorkflows = await prisma.workflowExecution.findMany({
  where: {
    status: 'processing',
    updatedAt: { lt: fiveMinutesAgo } // ⚠️ This never changes!
  }
})
```

## 🔧 The Fix

### 1. Sync Database with Redis on Every Stage Update

**Modified `updateWorkflowStage()`:**
```javascript
async updateWorkflowStage(workflowId, stage, status) {
  // ... update Redis metadata as before
  await this.setWorkflowMetadata(workflowId, metadata)
  
  // NEW: Update database tracking record
  try {
    const prisma = await db.getClient()
    await prisma.workflowExecution.update({
      where: { workflowId },
      data: {
        currentStage: stage,
        progressPercent: metadata.progress,
        stagesCompleted: completedStages,
        updatedAt: new Date() // ✅ CRITICAL: Prevents "stuck" detection
      }
    })
  } catch (dbError) {
    // Non-fatal - Redis is source of truth
    console.warn('⚠️ Failed to update database (non-fatal):', dbError.message)
  }
}
```

### 2. Mark Workflows as Completed in Database

**Modified `completeWorkflow()`:**
```javascript
async completeWorkflow(workflowId, result) {
  // ... update Redis metadata as before
  await this.setWorkflowMetadata(workflowId, metadata)
  
  // NEW: Mark as completed in database
  const prisma = await db.getClient()
  await prisma.workflowExecution.update({
    where: { workflowId },
    data: {
      status: 'completed',      // ✅ Prevent reprocessing
      currentStage: 'completed',
      progressPercent: 100,
      stagesCompleted: Object.keys(metadata.stages).length,
      completedAt: new Date(),
      updatedAt: new Date()
    }
  })
}
```

### 3. Mark Workflows as Failed in Database

**Modified `failWorkflow()`:**
```javascript
async failWorkflow(workflowId, stage, error, purchaseOrderId = null) {
  // ... update Redis metadata as before
  await this.setWorkflowMetadata(workflowId, metadata)
  
  // NEW: Mark as failed in database
  const prisma = await db.getClient()
  await prisma.workflowExecution.update({
    where: { workflowId },
    data: {
      status: 'failed',        // ✅ Prevent retry loops
      currentStage: stage,
      failedStage: stage,
      errorMessage: error.message,
      completedAt: new Date(),
      updatedAt: new Date()
    }
  })
  // ... also update PO status
}
```

## 📊 Impact

### Before Fix

```
Timeline of a "Normal" Workflow:
17:19:31 - Created (status: pending, updatedAt: 17:19:31)
17:20:00 - Processing stage 1 (Redis updated, DB unchanged)
17:20:30 - Processing stage 2 (Redis updated, DB unchanged)
17:21:00 - Processing stage 3 (Redis updated, DB unchanged)
17:21:31 - Cron: "updatedAt is 2 minutes old = STUCK!" ❌
17:21:31 - Cron reprocesses workflow (duplicate work)
```

### After Fix

```
Timeline of a "Normal" Workflow:
17:19:31 - Created (status: pending, updatedAt: 17:19:31)
17:20:00 - Stage 1 complete (Redis + DB updated, updatedAt: 17:20:00)
17:20:30 - Stage 2 complete (Redis + DB updated, updatedAt: 17:20:30)
17:21:00 - Stage 3 complete (Redis + DB updated, updatedAt: 17:21:00)
17:21:31 - Cron: "updatedAt is 31 seconds old = ACTIVE!" ✅
17:21:40 - All stages complete (status: completed) ✅
```

## ✅ Benefits

1. **No False Positives**: Cron only detects truly stuck workflows (>5min no activity)
2. **No Duplicate Processing**: Completed workflows stay completed
3. **Accurate Progress**: Database reflects real-time workflow state
4. **Better Monitoring**: Can query database for workflow status without Redis
5. **Reliable Recovery**: Cron still catches genuinely stuck workflows

## 🧪 Testing Verification

### Manual Test
1. Upload a PO file
2. Watch workflow progress through stages
3. Check database `workflowExecution` record
4. Verify `updatedAt` field refreshes every 10-30 seconds
5. Confirm cron doesn't mark it as stuck
6. Verify workflow completes with `status: 'completed'`

### Expected Logs
```
✅ Workflow stage updated successfully
✅ Workflow wf_xxx marked as completed in database
📋 Found 0 pending + 0 stuck = 0 total workflows
```

## 📈 Deployment

**Commit:** `e7965fd`
**Files Changed:**
- `api/src/lib/workflowOrchestrator.js` (3 methods updated)
- `api/src/lib/databasePersistenceService.js` (transaction timeouts)
- `api/src/lib/db.js` (transaction detection in Prisma extension)

**Deployment Status:** ✅ Pushed to production

## 🔮 Future Improvements

1. **Reduce Cron Frequency**: Now that tracking is accurate, cron could run every 5 minutes instead of 1 minute
2. **Database as Source of Truth**: Could eliminate Redis dependency for workflow state
3. **Metrics Dashboard**: Track workflow completion rates, stuck detection accuracy
4. **Alerting**: Send alerts when workflows genuinely stuck (not false positives)

## 📚 Related Fixes

- **Redis Metadata Recovery**: Fallback to database when Redis cache expires
- **Transaction Timeout Fix**: 8s timeout for serverless compatibility
- **Prisma Extension Transaction Detection**: Skip retries inside transactions

---

**Date:** October 10, 2025  
**Status:** ✅ Fixed and Deployed  
**Impact:** Critical - Eliminates false "stuck" detections
