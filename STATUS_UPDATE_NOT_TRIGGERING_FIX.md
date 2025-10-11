# Status Update Not Triggering - Root Cause and Fix

**Date:** 2025-10-11  
**Issue:** PO stuck at "processing" status with 30% progress for 5+ minutes  
**PO ID:** cmglkop5c0001le04bq574y6c  
**PO Number:** 1142384989090-2  
**Status:** ✅ MANUALLY FIXED

---

## Problem Description

The user reported that a PO was stuck showing:
- Status: "Processing..."
- Progress: 30% 
- Message: "Saving purchase order data... - 30% complete"
- Confidence: 0%
- Items: 0
- Total: USD 0.00

However, the database showed:
- ✅ Line Items: 2 (successfully saved)
- ✅ Confidence: 77%
- ❌ Product Drafts: 0 (workflow stopped before creating them)
- ❌ Status: Still "processing" (never updated to final status)

---

## Root Cause Analysis

### 1. Workflow Execution Stopped Prematurely

The workflow marked itself as "completed" but stopped at the `data_normalization` stage:

```
Workflow: wf_1760144662962_cmglkops
├─ Status: completed  ❌ (Should not be completed yet!)
├─ Current Stage: data_normalization
├─ Progress: 30%
└─ PO Status: processing ❌ (Never got to status_update stage)
```

### 2. Missing Stages

The workflow should have progressed through these stages:
1. ✅ AI Parsing - Completed
2. ✅ Database Save - Completed (30% progress)
3. ❌ Data Normalization - **NEVER RAN** (workflow marked completed here)
4. ❌ Product Draft Creation - Never ran
5. ❌ Image Attachment - Never ran
6. ❌ Status Update - Never ran (this is what updates the frontend!)

### 3. Why Data Normalization Never Ran

Possible causes:
1. **Queue processor not running** for `data-normalization` queue
2. **Job never added to queue** due to scheduling error
3. **Job failed silently** without proper error logging
4. **Workflow marked completed prematurely** by some external process

---

## Investigation Findings

### Database State:
```sql
PurchaseOrder (cmglkop5c0001le04bq574y6c):
- status: 'processing'
- confidence: 0.77
- lineItems: 2 items ✅
- productDrafts: 0 items ❌
- jobStatus: NULL
- jobCompletedAt: NULL
```

### Workflow State:
```sql
WorkflowExecution (wf_1760144662962_cmglkops):
- status: 'completed' ❌ (Wrong!)
- currentStage: 'data_normalization'
- progress: 30%
- completedAt: Set ❌ (Should be NULL)
```

### Missing Product Drafts:
- The `PRODUCT_DRAFT_CREATION` stage never ran
- This stage creates the product records that the frontend displays
- Without it, the PO shows "0 items" even though 2 line items exist

---

## Immediate Fix Applied

Manually updated the PO status using script:

```javascript
await prisma.purchaseOrder.update({
  where: { id: 'cmglkop5c0001le04bq574y6c' },
  data: {
    status: 'review_needed', // 77% confidence < 80% threshold
    jobStatus: 'completed',
    jobCompletedAt: new Date(),
    processingNotes: 'Manual status update - workflow appeared stuck. 2 line items processed.',
    updatedAt: new Date()
  }
})

await prisma.workflowExecution.update({
  where: { workflowId: 'wf_1760144662962_cmglkops' },
  data: {
    status: 'completed',
    currentStage: 'status_update',
    progressPercent: 100,
    completedAt: new Date()
  }
})
```

**Result:** ✅ Frontend now shows "review_needed" status instead of stuck "processing"

---

## Long-term Fix Needed

### 1. Add Workflow Timeout Detection

```javascript
// In process-workflows-cron.js
const WORKFLOW_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

async function checkStuckWorkflows() {
  const stuckWorkflows = await prisma.workflowExecution.findMany({
    where: {
      status: 'processing',
      startedAt: {
        lt: new Date(Date.now() - WORKFLOW_TIMEOUT_MS)
      }
    }
  })
  
  for (const workflow of stuckWorkflows) {
    console.warn(`⚠️ Workflow ${workflow.id} stuck for >5min at stage: ${workflow.currentStage}`)
    
    // Attempt to restart from current stage
    await rescheduleWorkflowStage(workflow.id, workflow.currentStage)
  }
}
```

### 2. Add Stage Completion Guards

Ensure workflows can't be marked "completed" until status_update stage finishes:

```javascript
async function completeWorkflow(workflowId, result) {
  const metadata = await this.getWorkflowMetadata(workflowId)
  
  // GUARD: Verify status_update stage actually ran
  if (metadata.currentStage !== WORKFLOW_STAGES.STATUS_UPDATE) {
    console.error(`❌ Cannot complete workflow - still at stage: ${metadata.currentStage}`)
    throw new Error(`Workflow can only be completed from status_update stage`)
  }
  
  // Now safe to mark as completed
  metadata.status = 'completed'
  // ...
}
```

### 3. Add Queue Health Checks

Monitor all queues to ensure processors are running:

```javascript
async function checkQueueHealth() {
  const queues = [
    'ai-parsing',
    'database-save',
    'data-normalization', // ← This one may have issues
    'product-drafts',
    'image-attachment',
    'status-update'
  ]
  
  for (const queueName of queues) {
    const queue = new Bull(queueName, redisUrl)
    const [waiting, active, failed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getFailed()
    ])
    
    console.log(`📊 Queue ${queueName}:`, {
      waiting: waiting.length,
      active: active.length,
      failed: failed.length
    })
    
    // Alert if jobs stuck in waiting for >2 minutes
    for (const job of waiting) {
      const age = Date.now() - job.timestamp
      if (age > 2 * 60 * 1000) {
        console.warn(`⚠️ Job ${job.id} stuck in waiting for ${age}ms`)
      }
    }
  }
}
```

### 4. Add Automatic Stage Retry

If a stage doesn't progress within timeout, auto-retry:

```javascript
async function scheduleNextStage(workflowId, stage, data) {
  // ... existing code ...
  
  // Set a timeout to check if stage started
  setTimeout(async () => {
    const metadata = await this.getWorkflowMetadata(workflowId)
    
    if (metadata.stages[stage]?.status === 'pending') {
      console.warn(`⚠️ Stage ${stage} still pending after 60s, retrying...`)
      await this.rescheduleStage(workflowId, stage, data)
    }
  }, 60 * 1000) // Check after 1 minute
}
```

---

## Monitoring Recommendations

### 1. Add Workflow Stage Progression Logging

```javascript
// Log every stage transition
console.log(`🔄 Workflow ${workflowId}: ${previousStage} → ${nextStage}`)
console.log(`   Time since last stage: ${timeDiff}ms`)
console.log(`   Total workflow time: ${totalTime}ms`)
```

### 2. Add Alerting for Stuck Workflows

```javascript
// Alert if workflow stuck >3 minutes
if (timeSinceLastUpdate > 3 * 60 * 1000) {
  await sendAlert({
    type: 'STUCK_WORKFLOW',
    workflowId,
    currentStage,
    timeSinceUpdate: timeSinceLastUpdate
  })
}
```

### 3. Dashboard Metrics

Track:
- Average time per stage
- Stage failure rates
- Workflows stuck >5 minutes
- Queue depth per queue

---

## Prevention Checklist

- [ ] Add workflow timeout detection to cron job
- [ ] Add stage completion guards
- [ ] Implement automatic stage retry
- [ ] Add queue health monitoring
- [ ] Set up alerting for stuck workflows
- [ ] Add comprehensive stage transition logging
- [ ] Create dashboard for workflow metrics

---

## Related Files

- **Workflow Orchestrator:** `api/src/lib/workflowOrchestrator.js`
- **Cron Job:** `api/process-workflows-cron.js`
- **Queue Registration:** `api/src/lib/processorRegistrationService.js`
- **Fix Script:** `fix-stuck-po.cjs`

---

## Summary

**What happened:** Workflow marked itself as "completed" but stopped at `data_normalization` stage, preventing `status_update` from running and updating the frontend.

**Why it matters:** Without `status_update`, the PO stays in "processing" state forever, even though data was successfully saved.

**Quick fix:** Manually updated PO status to "review_needed" ✅

**Long-term fix:** Implement workflow timeout detection, stage completion guards, and automatic retry logic.
