# Cron Job Update Instructions

## File: `api/process-workflows-cron.js`

### Line 214-239: Replace this section

**FIND:**
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

**REPLACE WITH:**
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

## How to Apply

1. Open `api/process-workflows-cron.js` in your editor
2. Find line 214 with the comment `// CRITICAL: Don't download/parse file`
3. Select lines 214-239 (the entire block shown above)
4. Replace with the new code
5. Save the file

## What This Does

- **Checks** `SEQUENTIAL_WORKFLOW` environment variable
- **If "1"**: Uses sequential runner (NEW - all stages execute immediately)
- **If "0" or not set**: Uses Bull queue (LEGACY - 38-minute delays)
- **Backward compatible**: Defaults to legacy mode for safety

## Testing

After making this change:

```powershell
# Test legacy mode (default)
$env:SEQUENTIAL_WORKFLOW="0"
node api/process-workflows-cron.js

# Test sequential mode (new)
$env:SEQUENTIAL_WORKFLOW="1"
node api/process-workflows-cron.js
```

Expected output when sequential mode is enabled:
```
🚀 Starting SEQUENTIAL workflow execution...
   This will complete ALL 6 stages in ~3-5 minutes
✅ Sequential workflow completed in 185s
📋 Workflow ID: wf_xxxxx
⏰ All 6 stages processed without waiting
```
