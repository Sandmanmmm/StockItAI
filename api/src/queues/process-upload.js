/**
 * Vercel Queue Handler for Processing Uploaded PO Files
 * 
 * This queue handles the background processing of uploaded purchase order files
 * without blocking the upload endpoint or hitting timeout limits.
 */

import { db } from '../lib/db.js'
import { storageService } from '../lib/storageService.js'
import { workflowIntegration } from '../lib/workflowIntegration.js'

const deriveFileType = (mimeType, fileName) => {
  if (mimeType && mimeType.includes('/')) {
    return mimeType.split('/').pop()
  }

  if (fileName && fileName.includes('.')) {
    return fileName.split('.').pop().toLowerCase()
  }

  return 'unknown'
}

export default async function handler(req, res) {
  // This is a queue handler - extract job data from request body
  const { uploadId, merchantId } = req.body || {}
  
  console.log(`📦 Queue processing started for upload: ${uploadId}`)
  
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
      throw new Error(`Upload not found: ${uploadId}`)
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
    const fileBuffer = await storageService.downloadFile(upload.fileUrl)
    console.log(`✅ File downloaded: ${fileBuffer.length} bytes`)

    // Update progress
    if (workflowId) {
      await prisma.workflowExecution.update({
        where: { workflowId },
        data: {
          currentStage: 'preparing_workflow',
          progressPercent: 20
        }
      })
    }

    // Get merchant AI settings
    const aiSettings = await prisma.merchantAISettings.findUnique({
      where: { merchantId }
    })

    console.log(`⚙️ AI Settings loaded for merchant: ${merchantId}`)

    // Prepare workflow data
    const workflowData = {
      uploadId: upload.id,
      merchantId,
  fileBuffer,
  buffer: fileBuffer,
      fileName: upload.fileName,
      fileType,
      mimeType: upload.mimeType,
      settings: aiSettings || {},
      metadata: {
        uploadedBy: 'user',
        source: 'queue-processing',
        queuedAt: new Date().toISOString()
      }
    }

    // Update progress
    if (workflowId) {
      await prisma.workflowExecution.update({
        where: { workflowId },
        data: {
          currentStage: 'parsing_file',
          progressPercent: 30
        }
      })
    }

    // Process the uploaded file through the workflow
    console.log(`🚀 Starting workflow processing...`)
    const result = await workflowIntegration.processUploadedFile(workflowData)
    
    console.log(`✅ Workflow processing completed successfully`)
    console.log(`📊 Result:`, JSON.stringify(result, null, 2))

    // Update workflow to completed (processUploadedFile should handle this, but double-check)
    if (workflowId) {
      const workflow = await prisma.workflowExecution.findUnique({
        where: { workflowId }
      })
      
      if (workflow && workflow.status !== 'completed') {
        await prisma.workflowExecution.update({
          where: { workflowId },
          data: {
            status: 'completed',
            progressPercent: 100,
            completedAt: new Date()
          }
        })
      }
    }

    // Update upload status
    await prisma.upload.update({
      where: { id: uploadId },
      data: {
        status: 'processed',
        processedAt: new Date()
      }
    })

    console.log(`🎉 Queue processing completed for upload: ${uploadId}`)
    
    return res.status(200).json({
      success: true,
      uploadId,
      workflowId,
      message: 'File processed successfully'
    })

  } catch (error) {
    console.error(`❌ Queue processing failed for upload ${uploadId}:`, error)
    console.error(`Stack trace:`, error.stack)

    // Update workflow status to failed
    if (workflowId) {
      await prisma.workflowExecution.update({
        where: { workflowId },
        data: {
          status: 'failed',
          error: error.message,
          completedAt: new Date()
        }
      }).catch(updateError => {
        console.error(`❌ Failed to update workflow status:`, updateError)
      })
    }

    // Update upload status to failed
    await prisma.upload.update({
      where: { id: uploadId },
      data: {
        status: 'failed',
        error: error.message
      }
    }).catch(updateError => {
      console.error(`❌ Failed to update upload status:`, updateError)
    })

    // Return error response
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
}
