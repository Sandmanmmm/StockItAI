/**
 * Vercel Serverless Function - Queue Handler for Processing Uploaded PO Files
 * 
 * This is a direct serverless function (not routed through Express) that handles
 * background processing of uploaded purchase order files.
 */

import { db } from './src/lib/db.js'
import { storageService } from './src/lib/storageService.js'
import { workflowIntegration } from './src/lib/workflowIntegration.js'

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
  
  try {
    // Fetch upload record
    const upload = await db.client.upload.findUnique({
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
    console.log(`📄 Processing file: ${upload.fileName} (${upload.fileType})`)

    // Update workflow status to processing
    if (workflowId) {
      await db.client.workflowExecution.update({
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
      await db.client.workflowExecution.update({
        where: { workflowId },
        data: {
          currentStage: 'processing',
          progressPercent: 30
        }
      })
    }

    // Get merchant AI settings
    // Get or create AI settings with defaults
    let aiSettings = await db.client.aISettings.findUnique({
      where: { merchantId }
    })

    if (!aiSettings) {
      console.log(`📝 Creating default AI settings for merchant: ${merchantId}`)
      aiSettings = await db.client.aISettings.create({
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
      await db.client.workflowExecution.update({
        where: { workflowId },
        data: {
          currentStage: 'analyzing',
          progressPercent: 50
        }
      })
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
      buffer: fileBuffer,  // Changed from fileBuffer to buffer
      aiSettings: aiSettings
    })

    console.log(`✅ File processing completed successfully`)

    // Update workflow to completed
    if (workflowId) {
      await db.client.workflowExecution.update({
        where: { workflowId },
        data: {
          status: 'completed',
          currentStage: 'completed',
          progressPercent: 100,
          endTime: new Date()
        }
      })
    }

    // Update upload status
    await db.client.upload.update({
      where: { id: uploadId },
      data: {
        status: 'processed',
        processedAt: new Date()
      }
    })

    console.log(`📬 Queue processing completed successfully for upload: ${uploadId}`)
    console.log(`⏱️ Total execution time: ${Date.now() - startTime}ms`)
    console.log(`✅ ========== QUEUE HANDLER COMPLETE ==========`)

    return res.status(200).json({
      success: true,
      uploadId,
      workflowId,
      result
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
        await db.client.workflowExecution.update({
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
      await db.client.upload.update({
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
