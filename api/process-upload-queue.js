/**
 * Vercel Serverless Function - Queue Handler for Processing Uploaded PO Files
 * 
 * This is a direct serverless function (not routed through Express) that handles
 * background processing of uploaded purchase order files.
 */

import { db } from './src/lib/db.js'
import { storageService } from './src/lib/storageService.js'
import { workflowIntegration } from './src/lib/workflowIntegration.js'
import { processorRegistrationService } from './src/lib/processorRegistrationService.js'

const deriveFileType = (mimeType, fileName) => {
  if (mimeType && mimeType.includes('/')) {
    return mimeType.split('/').pop()
  }

  if (fileName && fileName.includes('.')) {
    return fileName.split('.').pop().toLowerCase()
  }

  return 'unknown'
}

// Track processor initialization state across function invocations
let processorsInitialized = false

export default async function handler(req, res) {
  const startTime = Date.now()
  console.log(`🚀 ========== QUEUE HANDLER INVOKED ==========`)
  console.log(`⏰ Time: ${new Date().toISOString()}`)
  console.log(`📍 Method: ${req.method}`)
  console.log(`📍 URL: ${req.url}`)
  console.log(`📍 Headers:`, JSON.stringify(req.headers, null, 2))
  
  // Only accept POST requests
  if (req.method !== 'POST') {
    console.log(`❌ Rejected: Method ${req.method} not allowed`)
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { uploadId, merchantId } = req.body || {}
  
  console.log(`📦 Queue processing started for upload: ${uploadId}`)
  console.log(`🏪 Merchant ID: ${merchantId}`)
  console.log(`📦 Request body:`, JSON.stringify(req.body, null, 2))
  
  let workflowId = null
  let prisma
  
  try {
    prisma = await db.getClient()

    // Fetch upload record
    const upload = await prisma.upload.findUnique({
      where: { id: uploadId },
      include: {
        merchant: true
      }
    })

    if (!upload) {
      console.error(`❌ Upload not found: ${uploadId}`)
      return res.status(404).json({ error: 'Upload not found' })
    }

  workflowId = upload.workflowId
  const fileType = deriveFileType(upload.mimeType, upload.fileName)
  console.log(`📄 Processing file: ${upload.fileName} (${fileType})`)

    // Update workflow status to processing
    if (workflowId) {
      await prisma.workflowExecution.update({
        where: { workflowId },
        data: {
          status: 'processing',
          currentStage: 'downloading_file',
          progressPercent: 10
        }
      })
    }

    // Download file from Supabase Storage
    console.log(`⬇️ Downloading file from: ${upload.fileUrl}`)
    const downloadResult = await storageService.downloadFile(upload.fileUrl)
    
    if (!downloadResult.success || !downloadResult.buffer) {
      throw new Error(`Failed to download file from storage: ${downloadResult.error || 'Unknown error'}`)
    }

    const fileBuffer = downloadResult.buffer
    console.log(`✅ File downloaded successfully: ${fileBuffer.length} bytes`)

    // Update progress
    if (workflowId) {
      await prisma.workflowExecution.update({
        where: { workflowId },
        data: {
          currentStage: 'processing',
          progressPercent: 30
        }
      })
    }

    // Get merchant AI settings
    // Get or create AI settings with defaults
    let aiSettings = await prisma.aISettings.findUnique({
      where: { merchantId }
    })

    if (!aiSettings) {
      console.log(`📝 Creating default AI settings for merchant: ${merchantId}`)
      aiSettings = await prisma.aISettings.create({
        data: {
          merchantId,
          confidenceThreshold: 0.8,
          autoApproveHigh: false,
          strictMatching: true,
          learningMode: true,
          enableOCR: true,
          enableNLP: true,
          enableAutoMapping: true,
          primaryModel: 'gpt-5-nano',
          fallbackModel: 'gpt-4o-mini',
          maxRetries: 3,
          autoMatchSuppliers: true,
          notifyOnErrors: true,
          notifyOnLowConfidence: true,
          notifyOnNewSuppliers: true
        }
      })
    }

    console.log(`🤖 AI settings loaded for merchant: ${merchantId}`)

    // Update progress
    if (workflowId) {
      await prisma.workflowExecution.update({
        where: { workflowId },
        data: {
          currentStage: 'analyzing',
          progressPercent: 50
        }
      })
    }

    // Extract purchaseOrderId from upload metadata
    const purchaseOrderId = upload.metadata?.purchaseOrderId
    console.log(`📝 Purchase Order ID from upload metadata: ${purchaseOrderId}`)

    // ✅ SEQUENTIAL WORKFLOW: Check global flag OR per-merchant flag
    let useSequentialMode = process.env.SEQUENTIAL_WORKFLOW === '1'
    
    if (!useSequentialMode) {
      // Check per-merchant override
      const settings = typeof upload.merchant?.settings === 'object' ? upload.merchant.settings : {}
      useSequentialMode = settings.enableSequentialWorkflow === true
      
      if (useSequentialMode) {
        console.log(`✅ Sequential mode enabled for merchant: ${upload.merchant?.shopDomain}`)
      }
    }
    
    if (useSequentialMode) {
      // ✅ NEW: Sequential execution via dedicated endpoint (fire-and-forget)
      console.log(`🚀 Triggering SEQUENTIAL workflow execution...`)
      console.log(`   This will complete ALL 6 stages in ~3-5 minutes`)
      console.log(`   Running in dedicated serverless function to avoid timeout`)
      
      // Trigger dedicated sequential workflow endpoint (fire-and-forget)
      const sequentialEndpoint = process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}/api/execute-sequential-workflow`
        : 'http://localhost:3001/api/execute-sequential-workflow'
      
      console.log(`📡 Triggering endpoint: ${sequentialEndpoint}`)
      
      // Fire-and-forget HTTP call (don't await)
      fetch(sequentialEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ workflowId })
      }).then(response => {
        if (response.ok) {
          console.log(`✅ Sequential workflow triggered successfully: ${workflowId}`)
        } else {
          console.error(`❌ Failed to trigger sequential workflow: ${response.status}`)
        }
      }).catch(error => {
        console.error(`❌ Error triggering sequential workflow:`, error.message)
      })
      
      console.log(`✅ Sequential workflow trigger sent (processing in background)`)
      console.log(`📋 Workflow ID: ${workflowId}`)
      
      // Update upload status
      await prisma.upload.update({
        where: { id: uploadId },
        data: {
          status: 'processing',
          workflowId: workflowId,
          updatedAt: new Date()
        }
      })
      
      console.log(`📬 Upload handler completed - sequential workflow running in background`)
      console.log(`⏱️ Total handler execution time: ${Date.now() - startTime}ms`)
      console.log(`✅ ========== SEQUENTIAL TRIGGER COMPLETE ==========`)
      
      return res.status(200).json({
        success: true,
        uploadId,
        workflowId: workflowId,
        message: 'Sequential workflow triggered successfully',
        mode: 'sequential'
      })
    }
    
    // ❌ LEGACY: Queue to Bull (existing code - causes 30-60 minute delays)
    console.log(`🚀 Using LEGACY Bull queue mode (will take ~30-60 minutes)...`)
    
    // Initialize queue processors if not already done (required for workflow execution)
    if (!processorsInitialized) {
      console.log(`🚀 Initializing queue processors...`)
      await processorRegistrationService.initializeAllProcessors()
      processorsInitialized = true
      console.log(`✅ Queue processors initialized successfully`)
    } else {
      console.log(`✅ Queue processors already initialized`)
    }

    // Process the file through workflow integration
    console.log(`🔄 Starting file processing...`)
    const result = await workflowIntegration.processUploadedFile({
      uploadId: upload.id,
      fileName: upload.fileName,
      originalFileName: upload.originalFileName,
      fileSize: upload.fileSize,
      mimeType: upload.mimeType,
      merchantId: upload.merchantId,
      supplierId: upload.supplierId,
      purchaseOrderId: purchaseOrderId,  // Pass the existing PO ID to be updated
      buffer: fileBuffer,  // Changed from fileBuffer to buffer
      fileBuffer,
      fileType,
      aiSettings: aiSettings
    })

    console.log(`✅ File processing queued successfully - workflow ${result.workflowId} started`)

    // Don't mark workflow as completed here - let the workflow orchestrator handle completion
    // after all stages finish. Just update the upload workflow ID reference.
    
    // Update upload status to indicate processing has started
    await prisma.upload.update({
      where: { id: uploadId },
      data: {
        status: 'processing',
        workflowId: result.workflowId,
        updatedAt: new Date()
      }
    })

    console.log(`📬 Queue handler completed - workflow stages running in background`)
    console.log(`⏱️ Queue handler execution time: ${Date.now() - startTime}ms`)
    console.log(`🔄 Workflow ${result.workflowId} will complete asynchronously via Bull queues`)
    console.log(`✅ ========== QUEUE HANDLER COMPLETE ==========`)

    return res.status(200).json({
      success: true,
      uploadId,
      workflowId: result.workflowId,
      message: result.message,
      estimatedCompletionTime: result.estimatedCompletionTime
    })

  } catch (error) {
    console.error(`❌ ========== QUEUE PROCESSING ERROR ==========`)
    console.error(`❌ Upload ID: ${uploadId}`)
    console.error(`❌ Workflow ID: ${workflowId}`)
    console.error(`❌ Error message: ${error.message}`)
    console.error(`❌ Error stack:`, error.stack)
    console.error(`❌ Error details:`, JSON.stringify(error, null, 2))

    // Update workflow to failed
    if (workflowId) {
      try {
        const prismaClient = prisma ?? (await db.getClient())
        await prismaClient.workflowExecution.update({
          where: { workflowId },
          data: {
            status: 'failed',
            errorMessage: error.message,
            completedAt: new Date()
          }
        })
      } catch (updateError) {
        console.error(`Failed to update workflow status:`, updateError)
      }
    }

    // Update upload status to failed
    try {
      const prismaClient = prisma ?? (await db.getClient())
      await prismaClient.upload.update({
        where: { id: uploadId },
        data: {
          status: 'failed',
          errorMessage: error.message
        }
      })
    } catch (updateError) {
      console.error(`Failed to update upload status:`, updateError)
    }

    return res.status(500).json({
      success: false,
      error: error.message,
      uploadId,
      workflowId
    })
  }
}
