/**
 * Vercel Queue Handler for Processing Uploaded PO Files
 * 
 * This queue handles the background processing of uploaded purchase order files
 * without blocking the upload endpoint or hitting timeout limits.
 */

import { queue } from '@vercel/functions'
import { db } from '../lib/db.js'
import { storageService } from '../lib/storageService.js'
import { workflowIntegration } from '../lib/workflowIntegration.js'

export default queue(async ({ uploadId, merchantId }) => {
  console.log(`📦 Queue processing started for upload: ${uploadId}`)
  
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
      throw new Error(`Upload not found: ${uploadId}`)
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
    const fileBuffer = await storageService.downloadFile(upload.fileUrl)
    console.log(`✅ File downloaded: ${fileBuffer.length} bytes`)

    // Update progress
    if (workflowId) {
      await db.client.workflowExecution.update({
        where: { workflowId },
        data: {
          currentStage: 'preparing_workflow',
          progressPercent: 20
        }
      })
    }

    // Get merchant AI settings
    const aiSettings = await db.client.merchantAISettings.findUnique({
      where: { merchantId }
    })

    console.log(`⚙️ AI Settings loaded for merchant: ${merchantId}`)

    // Prepare workflow data
    const workflowData = {
      uploadId: upload.id,
      merchantId,
      fileBuffer,
      fileName: upload.fileName,
      fileType: upload.fileType,
      settings: aiSettings || {},
      metadata: {
        uploadedBy: 'user',
        source: 'queue-processing',
        queuedAt: new Date().toISOString()
      }
    }

    // Update progress
    if (workflowId) {
      await db.client.workflowExecution.update({
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
      const workflow = await db.client.workflowExecution.findUnique({
        where: { workflowId }
      })
      
      if (workflow && workflow.status !== 'completed') {
        await db.client.workflowExecution.update({
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
    await db.client.upload.update({
      where: { id: uploadId },
      data: {
        status: 'processed',
        processedAt: new Date()
      }
    })

    console.log(`🎉 Queue processing completed for upload: ${uploadId}`)
    
    return {
      success: true,
      uploadId,
      workflowId,
      message: 'File processed successfully'
    }

  } catch (error) {
    console.error(`❌ Queue processing failed for upload ${uploadId}:`, error)
    console.error(`Stack trace:`, error.stack)

    // Update workflow status to failed
    if (workflowId) {
      await db.client.workflowExecution.update({
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
    await db.client.upload.update({
      where: { id: uploadId },
      data: {
        status: 'failed',
        error: error.message
      }
    }).catch(updateError => {
      console.error(`❌ Failed to update upload status:`, updateError)
    })

    // Re-throw to mark the queue job as failed (enables Vercel retries)
    throw error
  }
})
