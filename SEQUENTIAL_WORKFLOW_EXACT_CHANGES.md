# Sequential Workflow - Exact Code Changes

This document shows the **exact code modifications** needed to implement direct stage-to-stage invocation.

---

## 📝 Change 1: Add Feature Flag to processAIParsing()

**File**: `api/src/lib/workflowOrchestrator.js`  
**Line**: ~1181  
**Function**: `processAIParsing()`

### Current Code
```javascript
        // Schedule database save stage with enriched data
        await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.DATABASE_SAVE, enrichedNextStageData)
        
        job.progress(100)
        
        // � Complete stage progress
        await progressHelper.publishStageComplete('AI parsing stage complete', {
```

### Modified Code
```javascript
        // ✅ SEQUENTIAL WORKFLOW: Feature flag to skip queuing
        const isSequentialMode = process.env.SEQUENTIAL_WORKFLOW === '1'
        
        if (!isSequentialMode) {
          // Schedule database save stage with enriched data (LEGACY MODE)
          await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.DATABASE_SAVE, enrichedNextStageData)
        }
        
        job.progress(100)
        
        // � Complete stage progress
        await progressHelper.publishStageComplete('AI parsing stage complete', {
```

### End of Function - Add Return Statement
**Add before the closing brace of `processAIParsing()`**:

```javascript
        console.log('✅ AI Parsing complete')
        
        // ✅ SEQUENTIAL WORKFLOW: Return results for direct invocation
        return {
          aiResult,
          nextStageData: enrichedNextStageData,
          purchaseOrderId,
          merchantId
        }
      }
```

---

## 📝 Change 2: Add Feature Flag to processDatabaseSave()

**File**: `api/src/lib/workflowOrchestrator.js`  
**Line**: ~1522  
**Function**: `processDatabaseSave()`

### Find This Code
```javascript
      // Schedule product draft creation stage
      await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.PRODUCT_DRAFT_CREATION, enrichedNextStageData)
```

### Replace With
```javascript
      // ✅ SEQUENTIAL WORKFLOW: Feature flag to skip queuing
      const isSequentialMode = process.env.SEQUENTIAL_WORKFLOW === '1'
      
      if (!isSequentialMode) {
        // Schedule product draft creation stage (LEGACY MODE)
        await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.PRODUCT_DRAFT_CREATION, enrichedNextStageData)
      }
```

### End of Function - Add Return Statement
```javascript
      console.log('✅ Database Save complete')
      
      // ✅ SEQUENTIAL WORKFLOW: Return results for direct invocation
      return {
        dbResult,
        nextStageData: enrichedNextStageData,
        purchaseOrderId: dbResult.purchaseOrder?.id,
        merchantId
      }
    }
```

---

## 📝 Change 3: Add Feature Flag to processProductDraftCreation()

**File**: `api/src/lib/workflowOrchestrator.js`  
**Line**: ~1830  
**Function**: `processProductDraftCreation()`

### Find This Code
```javascript
      // Schedule next stage
      await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.IMAGE_ATTACHMENT, enrichedNextStageData)
```

### Replace With
```javascript
      // ✅ SEQUENTIAL WORKFLOW: Feature flag to skip queuing
      const isSequentialMode = process.env.SEQUENTIAL_WORKFLOW === '1'
      
      if (!isSequentialMode) {
        // Schedule next stage (LEGACY MODE)
        await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.IMAGE_ATTACHMENT, enrichedNextStageData)
      }
```

### End of Function - Add Return Statement
```javascript
      console.log('✅ Product Draft Creation complete')
      
      // ✅ SEQUENTIAL WORKFLOW: Return results for direct invocation
      return {
        draftResult,
        nextStageData: enrichedNextStageData,
        purchaseOrderId,
        merchantId
      }
    }
```

---

## 📝 Change 4: Add Feature Flag to processImageAttachment()

**File**: `api/src/lib/workflowOrchestrator.js`  
**Line**: ~1916 and ~1977  
**Function**: `processImageAttachment()`

### Find This Code (First Location)
```javascript
      // Schedule next stage: Shopify Sync
      await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.SHOPIFY_SYNC, enrichedNextStageData)
```

### Replace With
```javascript
      // ✅ SEQUENTIAL WORKFLOW: Feature flag to skip queuing
      const isSequentialMode = process.env.SEQUENTIAL_WORKFLOW === '1'
      
      if (!isSequentialMode) {
        // Schedule next stage: Shopify Sync (LEGACY MODE)
        await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.SHOPIFY_SYNC, enrichedNextStageData)
      }
```

### Find This Code (Second Location - Error Path)
```javascript
          // Schedule next stage despite error
          await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.SHOPIFY_SYNC, enrichedNextStageData)
```

### Replace With
```javascript
          // ✅ SEQUENTIAL WORKFLOW: Feature flag to skip queuing
          if (!isSequentialMode) {
            // Schedule next stage despite error (LEGACY MODE)
            await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.SHOPIFY_SYNC, enrichedNextStageData)
          }
```

### End of Function - Add Return Statement
```javascript
      console.log('✅ Image Attachment complete')
      
      // ✅ SEQUENTIAL WORKFLOW: Return results for direct invocation
      return {
        imageResult,
        nextStageData: enrichedNextStageData,
        purchaseOrderId,
        merchantId
      }
    }
```

---

## 📝 Change 5: Add Feature Flag to processShopifySync()

**File**: `api/src/lib/workflowOrchestrator.js`  
**Line**: ~2201 and ~2235  
**Function**: `processShopifySync()`

### Find This Code (First Location - Success Path)
```javascript
      // Schedule status update stage
      await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.STATUS_UPDATE, enrichedNextStageData)
```

### Replace With
```javascript
      // ✅ SEQUENTIAL WORKFLOW: Feature flag to skip queuing
      const isSequentialMode = process.env.SEQUENTIAL_WORKFLOW === '1'
      
      if (!isSequentialMode) {
        // Schedule status update stage (LEGACY MODE)
        await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.STATUS_UPDATE, enrichedNextStageData)
      }
```

### Find This Code (Second Location - Review Path)
```javascript
        // For review_needed, still schedule status update to finalize workflow
        await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.STATUS_UPDATE, enrichedNextStageData)
```

### Replace With
```javascript
        // ✅ SEQUENTIAL WORKFLOW: Feature flag to skip queuing
        if (!isSequentialMode) {
          // For review_needed, still schedule status update to finalize workflow (LEGACY MODE)
          await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.STATUS_UPDATE, enrichedNextStageData)
        }
```

### End of Function - Add Return Statement
```javascript
      console.log('✅ Shopify Sync complete')
      
      // ✅ SEQUENTIAL WORKFLOW: Return results for direct invocation
      return {
        shopifyResult: syncResult,
        nextStageData: enrichedNextStageData,
        purchaseOrderId,
        merchantId
      }
    }
```

---

## 📝 Change 6: Add Feature Flag to processStatusUpdate()

**File**: `api/src/lib/workflowOrchestrator.js`  
**Line**: ~2568  
**Function**: `processStatusUpdate()`

### Find This Code
```javascript
      // No next stage - workflow complete!
      console.log('✅ Workflow complete!')
      
      return {
        success: true,
        workflowId,
```

### Replace With
```javascript
      // ✅ SEQUENTIAL WORKFLOW: No next stage to queue
      const isSequentialMode = process.env.SEQUENTIAL_WORKFLOW === '1'
      
      if (!isSequentialMode) {
        // In legacy mode, no next stage - workflow complete!
        console.log('✅ [LEGACY] Workflow complete!')
      } else {
        console.log('✅ [SEQUENTIAL] Workflow complete!')
      }
      
      return {
        success: true,
        workflowId,
```

---

## 📝 Change 7: Update Cron Job Entry Point

**File**: `api/process-workflows-cron.js`  
**Line**: ~217-240  
**Function**: `processWorkflow()`

### Current Code
```javascript
    // CRITICAL: Don't download/parse file in cron job - takes 40-100+ seconds!
    // Instead, queue the AI parsing job which will download and process the file asynchronously
    console.log(`🚀 Scheduling AI parsing job (file will be downloaded in queue worker)...`)
    
    // Queue the AI parsing job - it will handle file download and parsing
    await processorRegistrationService.addJob('ai-parsing', {
      stage: 'ai_parsing',
      workflowId: workflowId,
      data: {
        uploadId: upload.id,
        merchantId: upload.merchantId,
        fileUrl: upload.fileUrl,
        fileName: upload.fileName,
        fileSize: upload.fileSize,
        mimeType: upload.mimeType,
        fileType,
        supplierId: upload.supplierId,
        purchaseOrderId: workflow.purchaseOrderId,
        source: 'cron-processing',
        queuedAt: workflow.createdAt?.toISOString()
      }
    })
    
    console.log(`✅ AI parsing job queued - will download and process file asynchronously`)
    console.log(`📋 Workflow ID: ${workflowId}`)
    console.log(`⏰ File download and processing will happen in background (~30-60 seconds)`)
```

### Modified Code
```javascript
    // ✅ SEQUENTIAL WORKFLOW: Check feature flag
    const useSequentialMode = process.env.SEQUENTIAL_WORKFLOW === '1'
    
    if (useSequentialMode) {
      // ✅ NEW: Sequential execution (direct invocation, no Bull queues)
      console.log(`🚀 Starting SEQUENTIAL workflow execution...`)
      console.log(`   This will complete ALL 6 stages in ~3-5 minutes`)
      
      const { sequentialWorkflowRunner } = await import('./src/lib/sequentialWorkflowRunner.js')
      await sequentialWorkflowRunner.initialize()
      
      const workflowData = {
        uploadId: upload.id,
        merchantId: upload.merchantId,
        fileUrl: upload.fileUrl,
        fileName: upload.fileName,
        fileSize: upload.fileSize,
        mimeType: upload.mimeType,
        fileType,
        supplierId: upload.supplierId,
        purchaseOrderId: workflow.purchaseOrderId,
        source: 'cron-sequential'
      }
      
      const result = await sequentialWorkflowRunner.executeWorkflow(workflowId, workflowData)
      
      console.log(`✅ Sequential workflow completed in ${Math.round(result.duration / 1000)}s`)
      console.log(`📋 Workflow ID: ${workflowId}`)
      console.log(`⏰ All 6 stages processed without waiting`)
      
    } else {
      // ❌ LEGACY: Queue to Bull (existing code - causes 38-minute delays)
      console.log(`🚀 Scheduling AI parsing job (LEGACY MODE - will take ~38 minutes)...`)
      
      // Queue the AI parsing job - it will handle file download and parsing
      await processorRegistrationService.addJob('ai-parsing', {
        stage: 'ai_parsing',
        workflowId: workflowId,
        data: {
          uploadId: upload.id,
          merchantId: upload.merchantId,
          fileUrl: upload.fileUrl,
          fileName: upload.fileName,
          fileSize: upload.fileSize,
          mimeType: upload.mimeType,
          fileType,
          supplierId: upload.supplierId,
          purchaseOrderId: workflow.purchaseOrderId,
          source: 'cron-processing',
          queuedAt: workflow.createdAt?.toISOString()
        }
      })
      
      console.log(`✅ AI parsing job queued - will download and process file asynchronously`)
      console.log(`📋 Workflow ID: ${workflowId}`)
      console.log(`⏰ File download and processing will happen in background (~30-60 seconds)`)
    }
```

---

## 📝 Change 8: Add Environment Variable

**File**: `.env.production` (Vercel Environment Variables)

### Add This Variable
```bash
# Workflow Execution Mode
# "1" = Sequential (direct invocation, 3-5 min) - NEW
# "0" = Legacy (Bull queue + cron, 38 min) - CURRENT
SEQUENTIAL_WORKFLOW=0
```

### In Vercel Dashboard
1. Go to Project Settings → Environment Variables
2. Add new variable:
   - **Name**: `SEQUENTIAL_WORKFLOW`
   - **Value**: `0` (start with legacy mode)
   - **Environment**: Production, Preview, Development
3. Save and redeploy

---

## 📝 Change 9: Create Sequential Workflow Runner

**File**: `api/src/lib/sequentialWorkflowRunner.js` (NEW FILE)

See full code in `SEQUENTIAL_WORKFLOW_IMPLEMENTATION_PLAN.md` section "Phase 1: Create Sequential Execution Engine"

Key structure:
```javascript
export class SequentialWorkflowRunner {
  async executeWorkflow(workflowId, initialData) {
    // Stage 1: AI Parsing
    const aiResult = await this.executeStage(...)
    
    // Stage 2: Database Save
    const dbResult = await this.executeStage(...)
    
    // ... 4 more stages
    
    return { success: true, duration: 185000 }
  }
  
  async executeStage(workflowId, stageName, data, processorFunction) {
    // Create mock Bull job for compatibility
    const mockJob = { data: { workflowId, stage: stageName, data }, progress: () => {} }
    
    // Call processor
    return await processorFunction(mockJob)
  }
}
```

**File Size**: ~250 lines  
**Time to Create**: ~2 hours

---

## 🧪 Testing Changes

### Test Locally
```bash
# Set environment variable
export SEQUENTIAL_WORKFLOW=1

# Run cron job manually
node api/process-workflows-cron.js

# Expected output:
# 🚀 Starting SEQUENTIAL workflow execution...
# 📊 Stage 1/6: AI Parsing
# ✅ ai_parsing completed in 87s
# 📊 Stage 2/6: Database Save
# ✅ database_save completed in 6s
# ... (4 more stages)
# ✅ ========== WORKFLOW COMPLETED ==========
# ⏱️  Total duration: 203s
```

### Test in Production (Pilot)
```bash
# Deploy with legacy mode (no risk)
vercel deploy --env SEQUENTIAL_WORKFLOW=0

# Enable for 1 test merchant via database
UPDATE MerchantConfig 
SET enableSequentialWorkflow = true 
WHERE id = 'test-merchant-id'

# Monitor logs in Vercel dashboard
# Look for: "Starting SEQUENTIAL workflow execution"
# Verify: Workflow completes in 3-5 minutes
```

---

## 📊 Verification Checklist

After making changes:

- [ ] All 6 processors have feature flag checks
- [ ] All 6 processors return results
- [ ] Cron job has conditional logic
- [ ] Sequential runner file created
- [ ] Environment variable configured
- [ ] Local testing passes
- [ ] Code compiles without errors
- [ ] Feature flag works both ways (on/off)

---

## 🚨 Important Notes

### Do NOT Remove Old Code Yet
Keep the `scheduleNextStage()` calls behind feature flags. This allows instant rollback if issues occur.

### Test Both Modes
```javascript
// Test Legacy Mode
SEQUENTIAL_WORKFLOW=0 node api/process-workflows-cron.js

// Test Sequential Mode  
SEQUENTIAL_WORKFLOW=1 node api/process-workflows-cron.js
```

### Gradual Rollout
1. Week 1: Deploy with `SEQUENTIAL_WORKFLOW=0` (legacy)
2. Week 2: Enable for 1 test merchant
3. Week 3: Enable for 10%, then 50%, then 100%
4. Week 4: Remove Bull queue code after success

---

## 💡 Quick Reference

### Enable Sequential Mode
```bash
# Global (all merchants)
vercel env add SEQUENTIAL_WORKFLOW 1 production

# Per-merchant (gradual rollout)
UPDATE MerchantConfig SET enableSequentialWorkflow = true WHERE ...
```

### Disable Sequential Mode (Rollback)
```bash
# Global
vercel env add SEQUENTIAL_WORKFLOW 0 production

# Per-merchant
UPDATE MerchantConfig SET enableSequentialWorkflow = false WHERE ...
```

---

## ✅ Summary

**Total Changes**: 9 modifications across 3 files + 1 new file

**Estimated Time**: 
- Code changes: 2-3 hours
- Testing: 2-3 hours
- Total: 4-6 hours

**Risk Level**: Low (feature flag allows instant rollback)

**Expected Impact**: 38 min → 3-5 min (8x improvement)

---

*Ready to implement? Start with Change 9 (create `sequentialWorkflowRunner.js`), then apply Changes 1-6 (add feature flags), then Change 7 (update cron), then Change 8 (env var).*
