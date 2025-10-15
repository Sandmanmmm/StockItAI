# Implementation Plan: Direct Stage-to-Stage Invocation

## 🎯 Objective
Replace the current **cron + Bull queue** architecture with **direct sequential stage execution** to reduce workflow duration from **38 minutes to 3-5 minutes**.

---

## 📊 Current Architecture Analysis

### Current Flow (38 minutes)
```
User uploads file
    ↓
Cron job queues ai_parsing → Bull Queue → Redis
    ↓ (wait 0-60s for cron)
Cron runs → Workers start → Process ai_parsing → Queue database_save
    ↓ (wait 0-60s for cron)
Cron runs → Workers start → Process database_save → Queue product_draft
    ↓ (repeat for 6 stages)
    ↓
Complete after 38 minutes
```

### Target Flow (3-5 minutes)
```
User uploads file
    ↓
Trigger sequential workflow execution
    ↓
ai_parsing (90s) → database_save (5s) → product_draft (10s) 
    → image_attachment (30s) → shopify_sync (45s) → status_update (5s)
    ↓
Complete after 3-5 minutes
```

---

## 🔍 Code Analysis

### Current Processor Structure

All processors are in `workflowOrchestrator.js`:

```javascript
class WorkflowOrchestrator {
  async processAIParsing(job) {
    // Extract data from Bull job
    const { workflowId, data } = job.data
    
    // Process stage
    const aiResult = await enhancedAIService.parseDocument(...)
    
    // Queue next stage (❌ THIS IS THE PROBLEM)
    await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.DATABASE_SAVE, enrichedData)
    
    return aiResult
  }
  
  async processDatabaseSave(job) {
    const { workflowId, data } = job.data
    const { aiResult } = data
    
    // Save to database
    const dbResult = await this.dbService.persistAIResults(aiResult, ...)
    
    // Queue next stage (❌ QUEUES TO BULL)
    await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.PRODUCT_DRAFT_CREATION, enrichedData)
    
    return dbResult
  }
  
  // ... 4 more processors
}
```

### Key Issues
1. ❌ Processors expect Bull `job` object with `job.data`, `job.progress()`
2. ❌ Each processor calls `scheduleNextStage()` which queues to Bull
3. ❌ Data flow depends on Redis `stageResultStore` for persistence
4. ❌ Progress tracking uses `job.progress()` Bull API

---

## 💡 Implementation Strategy

### Phase 1: Create Sequential Execution Engine (New Code)
### Phase 2: Refactor Processors (Modify Existing)
### Phase 3: Update Entry Points (Cron Job)
### Phase 4: Feature Flag & Gradual Rollout
### Phase 5: Cleanup & Deprecation

---

## 📝 Detailed Implementation

## Phase 1: Create Sequential Execution Engine

### 1.1: Create New Sequential Workflow Runner

**File**: `api/src/lib/sequentialWorkflowRunner.js`

```javascript
/**
 * Sequential Workflow Runner
 * 
 * Executes all workflow stages synchronously within a single serverless function.
 * Eliminates 30-minute wait times caused by cron-based Bull queue processing.
 * 
 * Key Features:
 * - Direct stage-to-stage invocation (no queuing)
 * - Respects 300s Vercel timeout with early termination
 * - Comprehensive error handling with stage-level recovery
 * - Progress tracking without Bull queue
 * - Compatible with existing processor code
 */

import { WorkflowOrchestrator, WORKFLOW_STAGES } from './workflowOrchestrator.js'
import { db } from './db.js'
import { redisManager as redisManagerInstance } from './redisManager.js'

// Maximum execution time (270s leaves 30s buffer for Vercel 300s timeout)
const MAX_EXECUTION_TIME_MS = 270000

export class SequentialWorkflowRunner {
  constructor() {
    this.orchestrator = new WorkflowOrchestrator()
    this.startTime = null
  }

  /**
   * Initialize the workflow runner
   */
  async initialize() {
    await this.orchestrator.initialize()
  }

  /**
   * Check if we're approaching timeout
   */
  checkTimeout() {
    const elapsed = Date.now() - this.startTime
    const remaining = MAX_EXECUTION_TIME_MS - elapsed
    
    if (remaining < 30000) { // Less than 30s remaining
      throw new Error(`Timeout approaching (${Math.round(remaining / 1000)}s remaining)`)
    }
    
    return { elapsed, remaining }
  }

  /**
   * Execute entire workflow sequentially
   * 
   * @param {string} workflowId - Workflow execution ID
   * @param {object} initialData - Initial workflow data (upload info, merchant ID, etc)
   * @returns {object} - Final workflow result
   */
  async executeWorkflow(workflowId, initialData) {
    this.startTime = Date.now()
    
    console.log(`🚀 ========== SEQUENTIAL WORKFLOW EXECUTION ==========`)
    console.log(`📋 Workflow ID: ${workflowId}`)
    console.log(`⏰ Started at: ${new Date().toISOString()}`)
    console.log(`⏱️  Timeout budget: ${MAX_EXECUTION_TIME_MS / 1000}s`)

    let stageResults = {}
    let currentData = { ...initialData, workflowId }

    try {
      // Mark workflow as processing
      await this.updateWorkflowStatus(workflowId, 'processing', WORKFLOW_STAGES.AI_PARSING, 0)

      // Stage 1: AI Parsing (expected: 60-90s)
      console.log(`\n${'='.repeat(70)}`)
      console.log(`📊 Stage 1/6: AI Parsing`)
      stageResults.aiParsing = await this.executeStage(
        workflowId,
        WORKFLOW_STAGES.AI_PARSING,
        currentData,
        this.orchestrator.processAIParsing.bind(this.orchestrator)
      )
      currentData = { ...currentData, ...stageResults.aiParsing }
      this.checkTimeout()

      // Stage 2: Database Save (expected: 5-10s)
      console.log(`\n${'='.repeat(70)}`)
      console.log(`📊 Stage 2/6: Database Save`)
      stageResults.databaseSave = await this.executeStage(
        workflowId,
        WORKFLOW_STAGES.DATABASE_SAVE,
        currentData,
        this.orchestrator.processDatabaseSave.bind(this.orchestrator)
      )
      currentData = { ...currentData, ...stageResults.databaseSave }
      this.checkTimeout()

      // Stage 3: Product Draft Creation (expected: 10-20s)
      console.log(`\n${'='.repeat(70)}`)
      console.log(`📊 Stage 3/6: Product Draft Creation`)
      stageResults.productDraft = await this.executeStage(
        workflowId,
        WORKFLOW_STAGES.PRODUCT_DRAFT_CREATION,
        currentData,
        this.orchestrator.processProductDraftCreation.bind(this.orchestrator)
      )
      currentData = { ...currentData, ...stageResults.productDraft }
      this.checkTimeout()

      // Stage 4: Image Attachment (expected: 20-40s)
      console.log(`\n${'='.repeat(70)}`)
      console.log(`📊 Stage 4/6: Image Attachment`)
      stageResults.imageAttachment = await this.executeStage(
        workflowId,
        WORKFLOW_STAGES.IMAGE_ATTACHMENT,
        currentData,
        this.orchestrator.processImageAttachment.bind(this.orchestrator)
      )
      currentData = { ...currentData, ...stageResults.imageAttachment }
      this.checkTimeout()

      // Stage 5: Shopify Sync (expected: 30-60s)
      console.log(`\n${'='.repeat(70)}`)
      console.log(`📊 Stage 5/6: Shopify Sync`)
      stageResults.shopifySync = await this.executeStage(
        workflowId,
        WORKFLOW_STAGES.SHOPIFY_SYNC,
        currentData,
        this.orchestrator.processShopifySync.bind(this.orchestrator)
      )
      currentData = { ...currentData, ...stageResults.shopifySync }
      this.checkTimeout()

      // Stage 6: Status Update (expected: 2-5s)
      console.log(`\n${'='.repeat(70)}`)
      console.log(`📊 Stage 6/6: Status Update`)
      stageResults.statusUpdate = await this.executeStage(
        workflowId,
        WORKFLOW_STAGES.STATUS_UPDATE,
        currentData,
        this.orchestrator.processStatusUpdate.bind(this.orchestrator)
      )

      // Mark workflow as completed
      await this.updateWorkflowStatus(workflowId, 'completed', WORKFLOW_STAGES.STATUS_UPDATE, 100)

      const totalDuration = Date.now() - this.startTime
      console.log(`\n✅ ========== WORKFLOW COMPLETED ==========`)
      console.log(`⏱️  Total duration: ${Math.round(totalDuration / 1000)}s`)
      console.log(`📊 All 6 stages completed successfully`)
      console.log(`⏰ Finished at: ${new Date().toISOString()}`)

      return {
        success: true,
        workflowId,
        duration: totalDuration,
        stageResults
      }

    } catch (error) {
      const failedDuration = Date.now() - this.startTime
      console.error(`\n❌ ========== WORKFLOW FAILED ==========`)
      console.error(`❌ Error: ${error.message}`)
      console.error(`⏱️  Failed after: ${Math.round(failedDuration / 1000)}s`)
      console.error(`📊 Stack trace:`, error.stack)

      // Mark workflow as failed
      await this.updateWorkflowStatus(
        workflowId,
        'failed',
        currentData.currentStage || WORKFLOW_STAGES.AI_PARSING,
        0,
        error.message
      )

      throw error
    }
  }

  /**
   * Execute a single stage
   * 
   * Wraps processor call with timing, progress tracking, and error handling
   */
  async executeStage(workflowId, stageName, data, processorFunction) {
    const stageStart = Date.now()
    console.log(`🎬 Starting ${stageName}...`)

    try {
      // Create a mock Bull job object for compatibility with existing processors
      const mockJob = {
        data: {
          workflowId,
          stage: stageName,
          data
        },
        progress: (percent) => {
          console.log(`   📊 Progress: ${percent}%`)
          // Could publish to Redis for real-time updates
        },
        id: `${workflowId}-${stageName}-${Date.now()}`
      }

      // Call the processor
      const result = await processorFunction(mockJob)

      const stageDuration = Date.now() - stageStart
      console.log(`✅ ${stageName} completed in ${Math.round(stageDuration / 1000)}s`)

      return result

    } catch (error) {
      const stageDuration = Date.now() - stageStart
      console.error(`❌ ${stageName} failed after ${Math.round(stageDuration / 1000)}s`)
      console.error(`❌ Error: ${error.message}`)

      // Rethrow with stage context
      error.stage = stageName
      error.stageDuration = stageDuration
      throw error
    }
  }

  /**
   * Update workflow status in database
   */
  async updateWorkflowStatus(workflowId, status, currentStage, progressPercent, errorMessage = null) {
    try {
      const prisma = await db.getClient()
      await prisma.workflowExecution.update({
        where: { workflowId },
        data: {
          status,
          currentStage,
          progressPercent,
          errorMessage,
          updatedAt: new Date(),
          ...(status === 'completed' && { completedAt: new Date() })
        }
      })
    } catch (error) {
      console.warn(`⚠️ Failed to update workflow status:`, error.message)
      // Don't throw - status update failure shouldn't break workflow
    }
  }
}

// Export singleton instance
export const sequentialWorkflowRunner = new SequentialWorkflowRunner()
```

---

## Phase 2: Refactor Processors for Direct Invocation

### 2.1: Make Processors Return Results (Don't Queue Next Stage)

**File**: `api/src/lib/workflowOrchestrator.js`

**Current Code** (Line ~1181):
```javascript
// Schedule database save stage with enriched data
await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.DATABASE_SAVE, enrichedNextStageData)
```

**Strategy**: Add a feature flag to skip queuing in sequential mode

```javascript
// Line ~1181 in processAIParsing()
const isSequentialMode = process.env.SEQUENTIAL_WORKFLOW === '1'

if (!isSequentialMode) {
  // Legacy: Queue next stage for Bull processing
  await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.DATABASE_SAVE, enrichedNextStageData)
}

// Return result for sequential mode
return {
  aiResult,
  nextStageData: enrichedNextStageData
}
```

Apply same pattern to all 6 processors:
- ✅ `processAIParsing` (line 922)
- ✅ `processDatabaseSave` (line 1338)
- ✅ `processProductDraftCreation` (line 1572)
- ✅ `processImageAttachment` (line 1854)
- ✅ `processShopifySync` (line 2492)
- ✅ `processStatusUpdate` (line 2611)

---

## Phase 3: Update Entry Points

### 3.1: Add Sequential Mode to Cron Job

**File**: `api/process-workflows-cron.js`

**Current Code** (Line ~217):
```javascript
await processorRegistrationService.addJob('ai-parsing', {
  stage: 'ai_parsing',
  workflowId: workflowId,
  data: {
    uploadId: upload.id,
    merchantId: upload.merchantId,
    // ... data
  }
})
```

**New Code**:
```javascript
const useSequentialMode = process.env.SEQUENTIAL_WORKFLOW === '1'

if (useSequentialMode) {
  // NEW: Sequential execution (no Bull queues)
  console.log(`🚀 Starting sequential workflow execution...`)
  const { sequentialWorkflowRunner } = await import('./src/lib/sequentialWorkflowRunner.js')
  await sequentialWorkflowRunner.initialize()
  
  const result = await sequentialWorkflowRunner.executeWorkflow(workflowId, {
    uploadId: upload.id,
    merchantId: upload.merchantId,
    fileUrl: upload.fileUrl,
    fileName: upload.fileName,
    fileSize: upload.fileSize,
    mimeType: upload.mimeType,
    fileType,
    supplierId: upload.supplierId,
    purchaseOrderId: workflow.purchaseOrderId,
    source: 'cron-processing'
  })
  
  console.log(`✅ Sequential workflow completed in ${Math.round(result.duration / 1000)}s`)
} else {
  // LEGACY: Queue to Bull (existing code)
  await processorRegistrationService.addJob('ai-parsing', {
    stage: 'ai_parsing',
    workflowId: workflowId,
    data: {
      uploadId: upload.id,
      merchantId: upload.merchantId,
      // ... existing data
    }
  })
}
```

---

## Phase 4: Feature Flag & Gradual Rollout

### 4.1: Environment Variable Configuration

**File**: `.env.production` (Vercel Environment Variables)

```bash
# Workflow Execution Mode
# "1" = Sequential (direct invocation, 3-5 min)
# "0" = Legacy (Bull queue + cron, 38 min)
SEQUENTIAL_WORKFLOW=0  # Start with legacy mode
```

### 4.2: Per-Merchant Feature Flag (Optional)

Add merchant-level control for gradual rollout:

```javascript
// In cron job, before choosing mode:
const merchantConfig = await prisma.merchantConfig.findUnique({
  where: { merchantId: workflow.merchantId },
  select: { enableSequentialWorkflow: true }
})

const useSequentialMode = merchantConfig?.enableSequentialWorkflow ?? 
                          (process.env.SEQUENTIAL_WORKFLOW === '1')
```

### 4.3: Rollout Plan

| Phase | Duration | Config | Description |
|-------|----------|--------|-------------|
| **Testing** | 1 week | Local only | Test with staging data |
| **Pilot** | 1 week | 10% merchants | Enable for 10 pilot merchants |
| **Beta** | 1 week | 50% merchants | Expand to half of merchants |
| **Production** | Ongoing | 100% merchants | Full rollout |
| **Cleanup** | 1 week | Remove Bull | Deprecate Bull queue code |

---

## Phase 5: Cleanup & Deprecation

### 5.1: Remove Bull Queue Code (After 100% Rollout)

1. ✅ Remove `scheduleNextStage()` calls from processors
2. ✅ Remove Bull queue initialization from `processorRegistrationService.js`
3. ✅ Remove cron job processor initialization delay (3s startup)
4. ✅ Simplify `workflowOrchestrator.js` (remove queue logic)
5. ✅ Update documentation to reflect new architecture

---

## 🚀 Implementation Steps (Ordered)

### Week 1: Build Sequential Runner
1. ✅ Create `sequentialWorkflowRunner.js` (4 hours)
2. ✅ Add feature flag support to all processors (2 hours)
3. ✅ Update cron job entry point (1 hour)
4. ✅ Local testing with sample POs (3 hours)

**Deliverable**: Sequential workflow runs end-to-end in local environment

### Week 2: Production Testing
1. ✅ Deploy with `SEQUENTIAL_WORKFLOW=0` (legacy mode) (1 hour)
2. ✅ Enable for 1 test merchant via merchant config (1 hour)
3. ✅ Monitor for errors, timing, and completion rate (ongoing)
4. ✅ Fix any issues discovered (estimate 4 hours)

**Deliverable**: 1 merchant successfully using sequential mode in production

### Week 3: Gradual Rollout
1. ✅ Increase to 10% of merchants (monitor 2 days)
2. ✅ Increase to 50% of merchants (monitor 2 days)
3. ✅ Increase to 100% of merchants (monitor 3 days)

**Deliverable**: All merchants on sequential mode, 38min → 3-5min improvement confirmed

### Week 4: Cleanup
1. ✅ Remove Bull queue code (2 hours)
2. ✅ Update documentation (1 hour)
3. ✅ Performance analysis and metrics collection (2 hours)

**Deliverable**: Clean codebase with Bull queue fully deprecated

---

## 📊 Success Metrics

### Before (Current State)
- ⏱️ Average workflow duration: **38 minutes**
- 🔄 Cron runs per workflow: **~6 runs** (1 per stage)
- 💰 Vercel function invocations: **~6 invocations**
- ⚠️ Stuck workflow rate: **~5%** (auto-fix required)

### After (Sequential Mode)
- ⏱️ Average workflow duration: **3-5 minutes** (8x improvement)
- 🔄 Cron runs per workflow: **1 run** (single invocation)
- 💰 Vercel function invocations: **1 invocation** (85% reduction)
- ⚠️ Stuck workflow rate: **<1%** (no waiting between stages)

---

## 🛡️ Risk Mitigation

### Risk 1: Timeout (300s Vercel Limit)
**Mitigation**:
- ✅ Monitor execution time per stage
- ✅ Early termination if approaching 270s
- ✅ Fall back to Bull queue for long-running workflows
- ✅ Optimize Vision API timeout (already done: 90-180s)

### Risk 2: Error in Middle Stage
**Mitigation**:
- ✅ Comprehensive try-catch per stage
- ✅ Save progress to database after each stage
- ✅ Resume capability from failed stage (future enhancement)
- ✅ Detailed error logging with stage context

### Risk 3: Database Connection Issues
**Mitigation**:
- ✅ Reuse single Prisma client across all stages
- ✅ Connection pooling already configured
- ✅ Retry logic for transient failures
- ✅ Health check before starting workflow

### Risk 4: Regression in Functionality
**Mitigation**:
- ✅ Feature flag allows instant rollback
- ✅ Gradual rollout catches issues early
- ✅ Mock Bull job object maintains compatibility
- ✅ Integration tests for all 6 stages

---

## 🔬 Testing Strategy

### Unit Tests
```javascript
describe('SequentialWorkflowRunner', () => {
  it('executes all 6 stages in sequence', async () => {
    const result = await runner.executeWorkflow(mockWorkflowId, mockData)
    expect(result.success).toBe(true)
    expect(result.stageResults).toHaveProperty('aiParsing')
    expect(result.stageResults).toHaveProperty('statusUpdate')
  })
  
  it('handles timeout gracefully', async () => {
    // Mock slow Vision API
    jest.spyOn(enhancedAIService, 'parseDocument').mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 300000))
    )
    
    await expect(runner.executeWorkflow(mockWorkflowId, mockData))
      .rejects.toThrow('Timeout approaching')
  })
  
  it('handles stage failure with proper error context', async () => {
    jest.spyOn(orchestrator, 'processDatabaseSave').mockRejectedValue(
      new Error('Database connection failed')
    )
    
    try {
      await runner.executeWorkflow(mockWorkflowId, mockData)
    } catch (error) {
      expect(error.stage).toBe(WORKFLOW_STAGES.DATABASE_SAVE)
      expect(error.message).toContain('Database connection failed')
    }
  })
})
```

### Integration Tests
1. ✅ End-to-end test with real PO file
2. ✅ Verify all 6 stages complete
3. ✅ Check database records created correctly
4. ✅ Validate Shopify sync happened
5. ✅ Confirm duration <5 minutes

### Load Testing
1. ✅ Process 10 concurrent workflows
2. ✅ Verify no resource exhaustion
3. ✅ Check Redis connection handling
4. ✅ Monitor Prisma connection pool

---

## 📋 Checklist

### Pre-Implementation
- [ ] Review this plan with team
- [ ] Get approval for feature flag approach
- [ ] Set up monitoring for workflow duration metrics
- [ ] Create test merchant account for pilot

### Implementation
- [ ] Create `sequentialWorkflowRunner.js`
- [ ] Add feature flag to all 6 processors
- [ ] Update cron job entry point
- [ ] Add environment variable `SEQUENTIAL_WORKFLOW`
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Local testing and debugging

### Deployment
- [ ] Deploy to production with `SEQUENTIAL_WORKFLOW=0`
- [ ] Enable for 1 test merchant
- [ ] Monitor for 24 hours
- [ ] Fix any issues
- [ ] Gradual rollout (10% → 50% → 100%)

### Cleanup
- [ ] Remove Bull queue code
- [ ] Update documentation
- [ ] Collect performance metrics
- [ ] Write blog post about 8x improvement 🎉

---

## 💡 Future Enhancements

### Enhancement 1: Resume Failed Workflows
If a workflow fails at stage 3, resume from stage 3 instead of restarting:

```javascript
async resumeWorkflow(workflowId) {
  const workflow = await prisma.workflowExecution.findUnique({
    where: { workflowId }
  })
  
  const startStage = workflow.currentStage || WORKFLOW_STAGES.AI_PARSING
  // Skip completed stages, start from failed stage
}
```

### Enhancement 2: Parallel Stage Execution
Some stages could run in parallel (e.g., image search while Shopify sync):

```javascript
// Run image attachment and shopify sync in parallel
const [imageResult, shopifyResult] = await Promise.all([
  this.executeStage(workflowId, WORKFLOW_STAGES.IMAGE_ATTACHMENT, data, ...),
  this.executeStage(workflowId, WORKFLOW_STAGES.SHOPIFY_SYNC, data, ...)
])
```

### Enhancement 3: Adaptive Timeout Handling
If approaching timeout, save progress and schedule continuation:

```javascript
if (remaining < 60000) {
  // Less than 1 minute remaining
  await this.saveProgress(workflowId, stageResults)
  await this.scheduleContinuation(workflowId, nextStage)
  return { partial: true, continuationScheduled: true }
}
```

---

## 🎯 Expected Impact Summary

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Workflow Duration** | 38 min | 3-5 min | **8x faster** |
| **User Wait Time** | 38 min | 3-5 min | **8x better UX** |
| **Cron Invocations** | 6 per workflow | 1 per workflow | **6x fewer** |
| **Vercel Costs** | High | Low | **~85% reduction** |
| **Stuck Workflows** | ~5% | <1% | **5x more reliable** |
| **Code Complexity** | High (Bull + Cron) | Low (Direct) | **Simpler** |

---

## ✅ Conclusion

This implementation plan provides a **clear, low-risk path** to achieving **8x faster workflows** by:

1. ✅ **Building** new sequential execution engine
2. ✅ **Preserving** existing code with feature flags
3. ✅ **Testing** thoroughly before rollout
4. ✅ **Rolling out** gradually with instant rollback
5. ✅ **Cleaning up** Bull queue code after success

**Estimated Timeline**: 3-4 weeks from start to full deployment

**Risk Level**: Low (feature flag allows instant rollback)

**Impact**: Critical (8x performance improvement, better UX, lower costs)

**Recommendation**: Proceed with implementation immediately 🚀
