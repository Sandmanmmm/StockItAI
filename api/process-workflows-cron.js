/**
 * Vercel Cron Job: Process Pending Workflows
 * 
 * This cron job runs every minute to process pending workflow executions.
 * It's a reliable alternative to HTTP-triggered background jobs in serverless.
 * 
 * Configured in vercel.json under "crons" section.
 */

import { db } from './src/lib/db.js'
import { storageService } from './src/lib/storageService.js'
import { workflowIntegration } from './src/lib/workflowIntegration.js'

/**
 * Process a single workflow execution
 */
async function processWorkflow(workflow) {
  const startTime = Date.now()
  console.log(`🚀 ========== PROCESSING WORKFLOW ==========`)
  console.log(`📋 Workflow ID: ${workflow.workflowId}`)
  console.log(`📋 Upload ID: ${workflow.uploadId}`)
  console.log(`📋 Merchant ID: ${workflow.merchantId}`)
  console.log(`📋 PO ID: ${workflow.purchaseOrderId}`)
  console.log(`⏰ Started at: ${new Date().toISOString()}`)

  let workflowId = workflow.workflowId

  try {
    // Update workflow status to 'processing'
    await db.client.workflowExecution.update({
      where: { workflowId },
      data: { 
        status: 'processing',
        currentStage: 'downloading_file',
        progressPercent: 10
      }
    })

    // Get the upload record
    const upload = await db.client.upload.findUnique({
      where: { id: workflow.uploadId },
      include: {
        merchant: true
      }
    })

    if (!upload) {
      throw new Error(`Upload not found: ${workflow.uploadId}`)
    }

    console.log(`� Processing file: ${upload.fileName} (${upload.fileType || 'unknown'})`)
    console.log(`�📥 Downloading file from: ${upload.fileUrl}`)

    // Download the file from Supabase Storage
    const fileBuffer = await storageService.downloadFile(upload.fileUrl)
    
    console.log(`✅ File downloaded successfully (${fileBuffer.length} bytes)`)

    // Update progress
    await db.client.workflowExecution.update({
      where: { workflowId },
      data: {
        currentStage: 'preparing_workflow',
        progressPercent: 20
      }
    })

    // Get merchant AI settings
    const aiSettings = await db.client.merchantAISettings.findUnique({
      where: { merchantId: workflow.merchantId }
    })

    console.log(`⚙️ AI Settings loaded for merchant: ${workflow.merchantId}`)

    // Prepare workflow data matching the expected structure
    const workflowData = {
      uploadId: upload.id,
      merchantId: workflow.merchantId,
      fileBuffer,
      fileName: upload.fileName,
      fileSize: upload.fileSize || fileBuffer.length,
      mimeType: upload.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileType: upload.fileType || 'excel',
      originalFileName: upload.fileName,
      supplierId: upload.supplierId,
      purchaseOrderId: workflow.purchaseOrderId,
      aiSettings: aiSettings || {},
      buffer: fileBuffer, // Some methods expect 'buffer' instead of 'fileBuffer'
      metadata: {
        uploadedBy: 'user',
        source: 'cron-processing',
        queuedAt: workflow.createdAt?.toISOString(),
        processedAt: new Date().toISOString()
      }
    }

    // Update progress
    await db.client.workflowExecution.update({
      where: { workflowId },
      data: {
        currentStage: 'parsing_file',
        progressPercent: 30
      }
    })

    // Process the uploaded file through the FULL workflow integration
    console.log(`🚀 Starting complete workflow processing via workflowIntegration...`)
    const result = await workflowIntegration.processUploadedFile(workflowData)
    
    console.log(`✅ Workflow processing completed successfully`)
    console.log(`📊 Result:`, JSON.stringify(result, null, 2))

    // Double-check workflow status (processUploadedFile should handle this)
    const finalWorkflow = await db.client.workflowExecution.findUnique({
      where: { workflowId }
    })
    
    if (finalWorkflow && finalWorkflow.status !== 'completed') {
      console.log(`⚠️ Workflow not marked complete, updating status...`)
      await db.client.workflowExecution.update({
        where: { workflowId },
        data: {
          status: 'completed',
          progressPercent: 100,
          completedAt: new Date()
        }
      })
    }

    // Update upload status
    await db.client.upload.update({
      where: { id: workflow.uploadId },
      data: {
        status: 'processed',
        processedAt: new Date()
      }
    })

    const executionTime = Date.now() - startTime
    console.log(`✅ ========== WORKFLOW COMPLETE ==========`)
    console.log(`⏱️ Total execution time: ${executionTime}ms`)

    return { success: true, workflowId: workflow.workflowId, executionTime }

  } catch (error) {
    console.error(`❌ ========== WORKFLOW PROCESSING ERROR ==========`)
    console.error(`❌ Workflow ID: ${workflow.workflowId}`)
    console.error(`❌ Upload ID: ${workflow.uploadId}`)
    console.error(`❌ Error message: ${error.message}`)
    console.error(`❌ Error stack:`, error.stack)

    // Mark workflow as failed
    try {
      await db.client.workflowExecution.update({
        where: { workflowId },
        data: {
          status: 'failed',
          error: error.message,
          completedAt: new Date()
        }
      })

      // Mark upload as failed
      await db.client.upload.update({
        where: { id: workflow.uploadId },
        data: {
          status: 'failed',
          errorMessage: error.message
        }
      })
    } catch (updateError) {
      console.error(`❌ Failed to update workflow/upload status:`, updateError)
    }

    const executionTime = Date.now() - startTime
    console.error(`❌ ========== WORKFLOW FAILED ==========`)
    console.error(`⏱️ Failed after: ${executionTime}ms`)

    return { success: false, workflowId: workflow.workflowId, error: error.message, executionTime }
  }
}


/**
 * Cron handler - processes all pending workflows
 */
export default async function handler(req, res) {
  const cronStartTime = Date.now()
  console.log(`⏰ ========== CRON JOB STARTED ==========`)
  console.log(`⏰ Time: ${new Date().toISOString()}`)

  // Verify this is a legitimate cron request
  // Vercel cron jobs are authenticated at the infrastructure level
  // Additional security: Check for Vercel cron user agent
  const userAgent = req.headers['user-agent'] || ''
  const authHeader = req.headers['authorization']
  
  // Accept requests from Vercel cron system OR with proper authorization
  const isVercelCron = userAgent.includes('vercel-cron')
  const hasValidAuth = authHeader && authHeader.startsWith('Bearer ') && authHeader.includes(process.env.CRON_SECRET || 'vercel-internal')
  
  if (!isVercelCron && !hasValidAuth) {
    console.error(`❌ Unauthorized request - User-Agent: ${userAgent}`)
    return res.status(401).json({ error: 'Unauthorized' })
  }

  console.log(`✅ Authenticated cron request from: ${userAgent}`)

  try {
    // Find all pending workflows
    const pendingWorkflows = await db.client.workflowExecution.findMany({
      where: {
        status: 'pending'
      },
      orderBy: {
        createdAt: 'asc'
      },
      take: 5 // Process up to 5 workflows per cron run to avoid timeout
    })

    console.log(`📋 Found ${pendingWorkflows.length} pending workflows`)

    if (pendingWorkflows.length === 0) {
      console.log(`✅ No pending workflows to process`)
      return res.status(200).json({ 
        success: true, 
        message: 'No pending workflows',
        processed: 0,
        timestamp: new Date().toISOString()
      })
    }

    // Process workflows sequentially (parallel processing can overwhelm serverless)
    const results = []
    for (const workflow of pendingWorkflows) {
      console.log(`\n🔄 Processing workflow ${workflow.workflowId}...`)
      const result = await processWorkflow(workflow)
      results.push(result)
      
      // Brief pause between workflows to avoid resource contention
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    const cronExecutionTime = Date.now() - cronStartTime
    const successCount = results.filter(r => r.success).length
    const failureCount = results.filter(r => !r.success).length

    console.log(`✅ ========== CRON JOB COMPLETE ==========`)
    console.log(`📊 Total processed: ${results.length} workflows`)
    console.log(`✅ Successful: ${successCount}`)
    console.log(`❌ Failed: ${failureCount}`)
    console.log(`⏱️ Total cron execution time: ${cronExecutionTime}ms`)

    res.status(200).json({
      success: true,
      processed: results.length,
      successful: successCount,
      failed: failureCount,
      results,
      executionTime: cronExecutionTime,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error(`❌ ========== CRON JOB ERROR ==========`)
    console.error(`❌ Error message: ${error.message}`)
    console.error(`❌ Error stack:`, error.stack)

    const cronExecutionTime = Date.now() - cronStartTime
    console.error(`⏱️ Failed after: ${cronExecutionTime}ms`)

    res.status(500).json({
      success: false,
      error: error.message,
      executionTime: cronExecutionTime,
      timestamp: new Date().toISOString()
    })
  } finally {
    // Ensure database connection is properly handled
    await db.client.$disconnect()
  }
}
