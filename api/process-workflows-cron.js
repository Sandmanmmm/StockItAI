/**
 * Vercel Cron Job: Process Pending Workflows
 * 
 * This cron job runs every minute to process pending workflow executions.
 * It's a reliable alternative to HTTP-triggered background jobs in serverless.
 * 
 * Configured in vercel.json under "crons" section.
 */

import { db, prismaOperation } from './src/lib/db.js'
import { storageService } from './src/lib/storageService.js'
import { workflowIntegration } from './src/lib/workflowIntegration.js'
import { processorRegistrationService } from './src/lib/processorRegistrationService.js'

// Track processor initialization state across cron invocations
let processorsInitialized = false
let processorInitializationPromise = null

async function ensureProcessorsInitialized() {
  if (processorsInitialized) {
    return
  }

  if (!processorInitializationPromise) {
    processorInitializationPromise = (async () => {
      console.log(`🚀 Ensuring workflow orchestrator is initialized...`)
      try {
        await workflowIntegration.initialize()
        console.log(`✅ Workflow orchestrator initialized`)
      } catch (orchestratorError) {
        console.error(`⚠️ Failed to initialize orchestrator (continuing anyway):`, orchestratorError.message)
      }

      console.log(`🚀 Ensuring queue processors are initialized...`)
      await processorRegistrationService.initializeAllProcessors()
      processorsInitialized = true
      console.log(`✅ Queue processors initialized successfully`)
    })()
  } else {
    console.log(`⏳ Queue processor initialization already in progress or completed`)
  }

  try {
    await processorInitializationPromise
  } catch (processorError) {
    console.error(`⚠️ Failed to initialize processors (continuing anyway):`, processorError.message)
    processorsInitialized = false
    processorInitializationPromise = null
  }
}

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
  let prisma

  try {
    await ensureProcessorsInitialized()

    // Get a stable reference to the Prisma client (now with proper connection)
    prisma = await db.getClient()
    
    // Debug: Verify prisma client is available
    if (!prisma) {
      console.error(`❌ FATAL: Prisma client is undefined!`)
      console.error(`❌ db object:`, db)
      throw new Error('Prisma client not initialized - getClient returned undefined')
    }
    
    console.log(`✅ Prisma client ready for workflow processing`)
    console.log(`🔍 Prisma client type:`, typeof prisma)
    console.log(`🔍 Prisma has $connect:`, typeof prisma.$connect)
    console.log(`🔍 Prisma has workflowExecution:`, typeof prisma.workflowExecution)

    // Update workflow status to 'processing'
    await prisma.workflowExecution.update({
      where: { workflowId },
      data: { 
        status: 'processing',
        currentStage: 'downloading_file',
        progressPercent: 10
      }
    })

    // Get the upload record
    const upload = await prisma.upload.findUnique({
      where: { id: workflow.uploadId },
      include: {
        merchant: true
      }
    })

    if (!upload) {
      throw new Error(`Upload not found: ${workflow.uploadId}`)
    }

    console.log(`📦 Processing file: ${upload.fileName} (${upload.fileType || 'unknown'})`)
    console.log(`📥 Downloading file from: ${upload.fileUrl}`)

    // Download the file from Supabase Storage
    const downloadResult = await storageService.downloadFile(upload.fileUrl)
    
    if (!downloadResult.success) {
      throw new Error(`Failed to download file: ${downloadResult.error}`)
    }
    
    const fileBuffer = downloadResult.buffer
    console.log(`✅ File downloaded successfully (${fileBuffer.length} bytes)`)

    // Update progress
    await prisma.workflowExecution.update({
      where: { workflowId },
      data: {
        currentStage: 'preparing_workflow',
        progressPercent: 20
      }
    })

    // Get merchant AI settings
    const aiSettings = await prisma.aISettings.findUnique({
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
      existingWorkflowId: workflowId, // Pass existing workflow ID to prevent duplicate creation
      metadata: {
        uploadedBy: 'user',
        source: 'cron-processing',
        queuedAt: workflow.createdAt?.toISOString(),
        processedAt: new Date().toISOString()
      }
    }

    // Update progress
    await prisma.workflowExecution.update({
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
    const finalWorkflow = await prisma.workflowExecution.findUnique({
      where: { workflowId }
    })
    
    if (finalWorkflow && finalWorkflow.status !== 'completed') {
      console.log(`⚠️ Workflow not marked complete, updating status...`)
      await prisma.workflowExecution.update({
        where: { workflowId },
        data: {
          status: 'completed',
          progressPercent: 100,
          completedAt: new Date()
        }
      })
    }

    // Update upload status
    await prisma.upload.update({
      where: { id: workflow.uploadId },
      data: {
        status: 'processed'
        // updatedAt will be automatically updated by Prisma
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
      // Get a fresh client reference in case the original failed
      const prismaClient = prisma ?? (await db.getClient())
      
      await prismaClient.workflowExecution.update({
        where: { workflowId },
        data: {
          status: 'failed',
          errorMessage: error.message,
          failedStage: 'processing',
          completedAt: new Date()
        }
      })

      // Mark upload as failed
      await prismaClient.upload.update({
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
 * Automatically fix stuck POs that have data but are stuck in "processing" status
 * This handles cases where the workflow completed database save but failed before status_update
 */
async function autoFixStuckPOs(prisma) {
  try {
    console.log('🔍 Checking for stuck POs with data...')
    
    // Find POs that are:
    // 1. Still in "processing" status
    // 2. Have line items (data was saved successfully)
    // 3. Last updated >5 minutes ago
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    
    const stuckPOs = await prismaOperation(
      (client) => client.purchaseOrder.findMany({
        where: {
          status: 'processing',
          updatedAt: {
            lt: fiveMinutesAgo
          }
        },
        include: {
          lineItems: true
        },
        take: 10 // Limit to 10 POs per run
      }),
      'Find stuck POs with data'
    )
    
    if (stuckPOs.length === 0) {
      console.log('✅ No stuck POs found')
      return { fixed: 0 }
    }
    
    console.log(`📋 Found ${stuckPOs.length} potentially stuck POs`)
    
    let fixedCount = 0
    
    for (const po of stuckPOs) {
      // Only fix if it has line items (data was saved)
      if (po.lineItems && po.lineItems.length > 0) {
        console.log(`🔧 Fixing stuck PO ${po.id}:`)
        console.log(`   Number: ${po.number || 'N/A'}`)
        console.log(`   Line Items: ${po.lineItems.length}`)
        console.log(`   Confidence: ${po.confidence}`)
        console.log(`   Age: ${Math.round((Date.now() - po.updatedAt.getTime()) / 1000)}s`)
        
        try {
          // Determine final status based on confidence
          const finalStatus = (po.confidence && po.confidence >= 0.8) ? 'completed' : 'review_needed'
          
          // Update PO status
          await prismaOperation(
            (client) => client.purchaseOrder.update({
              where: { id: po.id },
              data: {
                status: finalStatus,
                jobStatus: 'completed',
                jobCompletedAt: new Date(),
                processingNotes: `Auto-recovered from stuck state. ${po.lineItems.length} line items processed. Confidence: ${Math.round((po.confidence || 0) * 100)}%`,
                updatedAt: new Date()
              }
            }),
            `Auto-fix stuck PO ${po.id}`
          )
          
          // Update workflow if it exists
          const workflow = await prismaOperation(
            (client) => client.workflowExecution.findFirst({
              where: { purchaseOrderId: po.id },
              orderBy: { createdAt: 'desc' }
            }),
            `Find workflow for PO ${po.id}`
          )
          
          if (workflow) {
            await prismaOperation(
              (client) => client.workflowExecution.update({
                where: { id: workflow.id },
                data: {
                  status: 'completed',
                  currentStage: 'status_update',
                  progressPercent: 100,
                  completedAt: new Date(),
                  updatedAt: new Date()
                }
              }),
              `Auto-fix workflow ${workflow.id}`
            )
          }
          
          console.log(`✅ Fixed PO ${po.id} - new status: ${finalStatus}`)
          fixedCount++
          
        } catch (fixError) {
          console.error(`❌ Failed to fix PO ${po.id}:`, fixError.message)
        }
      } else {
        console.log(`⏭️ Skipping PO ${po.id} - no line items (workflow may have failed earlier)`)
      }
    }
    
    if (fixedCount > 0) {
      console.log(`🎉 Auto-fixed ${fixedCount} stuck PO(s)`)
    }
    
    return { checked: stuckPOs.length, fixed: fixedCount }
    
  } catch (error) {
    console.error('❌ Error in autoFixStuckPOs:', error)
    return { checked: 0, fixed: 0, error: error.message }
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

  let prisma

  try {
    console.log(`🧭 Ensuring queue processors are ready before database work...`)
    await ensureProcessorsInitialized()

    // Initialize database connection with proper async handling
    console.log(`� Initializing database connection...`)
    prisma = await db.getClient()
    console.log(`✅ Database connected successfully`)

    // CRITICAL: Auto-fix stuck POs before processing new workflows
    // This handles POs that completed database save but got stuck before status_update
    const autoFixResult = await autoFixStuckPOs(prisma)
    if (autoFixResult.fixed > 0) {
      console.log(`🎯 Auto-fixed ${autoFixResult.fixed} stuck PO(s) in this run`)
    }

    // Find all pending workflows
    const pendingWorkflows = await prismaOperation(
      (client) => client.workflowExecution.findMany({
        where: {
          status: 'pending'
        },
        orderBy: {
          createdAt: 'asc'
        },
        take: 5 // Process up to 5 workflows per cron run to avoid timeout
      }),
      'Find pending workflows'
    )

    // Also find stuck "processing" workflows (processing for more than 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    const stuckWorkflows = await prismaOperation(
      (client) => client.workflowExecution.findMany({
        where: {
          status: 'processing',
          updatedAt: {
            lt: fiveMinutesAgo
          }
        },
        orderBy: {
          createdAt: 'asc'
        },
        take: 5
      }),
      'Find stuck workflows'
    )

    // Combine and deduplicate workflows
    const allWorkflows = [...pendingWorkflows, ...stuckWorkflows]
    const uniqueWorkflows = allWorkflows.filter((w, index, self) =>
      index === self.findIndex((t) => t.workflowId === w.workflowId)
    )

    console.log(`📋 Found ${pendingWorkflows.length} pending + ${stuckWorkflows.length} stuck = ${uniqueWorkflows.length} total workflows`)

    if (uniqueWorkflows.length === 0) {
      console.log(`✅ No pending workflows to process`)
      return res.status(200).json({ 
        success: true, 
        message: 'No pending workflows',
        processed: 0,
        autoFixed: autoFixResult.fixed || 0,
        timestamp: new Date().toISOString()
      })
    }

    // Process workflows sequentially (parallel processing can overwhelm serverless)
    const results = []
    for (const workflow of uniqueWorkflows) {
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
    if (autoFixResult.fixed > 0) {
      console.log(`🔧 Auto-fixed: ${autoFixResult.fixed} stuck POs`)
    }
    console.log(`⏱️ Total cron execution time: ${cronExecutionTime}ms`)

    res.status(200).json({
      success: true,
      processed: results.length,
      successful: successCount,
      failed: failureCount,
      autoFixed: autoFixResult.fixed || 0,
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
    if (prisma?.$disconnect) {
      try {
        await prisma.$disconnect()
      } catch (disconnectError) {
        console.warn(`⚠️ Error while disconnecting Prisma client:`, disconnectError.message)
      }
    }
  }
}
