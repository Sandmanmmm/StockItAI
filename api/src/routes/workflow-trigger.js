/**
 * Workflow Trigger Endpoint
 * 
 * Separate endpoint to trigger background workflow processing.
 * This prevents 504 timeouts on upload by separating upload from processing.
 */

import express from 'express'
import { workflowIntegration } from '../lib/workflowIntegration.js'
import { db } from '../lib/db.js'
import { storageService } from '../lib/storageService.js'

const router = express.Router()

/**
 * Trigger workflow processing for an upload
 * POST /api/workflow/trigger/:uploadId
 */
router.post('/trigger/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params
    
    console.log(`🚀 Workflow trigger requested for upload: ${uploadId}`)

  const prisma = await db.getClient()

  // Get upload record
  const upload = await prisma.upload.findUnique({
      where: { id: uploadId }
    })

    if (!upload) {
      return res.status(404).json({
        success: false,
        error: 'Upload not found'
      })
    }

    // Get workflow execution record
  const workflow = await prisma.workflowExecution.findUnique({
      where: { workflowId: upload.workflowId }
    })

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      })
    }

    // Get file from storage
    const fileBuffer = await storageService.downloadFile(upload.fileUrl)
    
    if (!fileBuffer) {
      return res.status(500).json({
        success: false,
        error: 'Failed to download file from storage'
      })
    }

    // Get merchant AI settings
  const aiSettings = await prisma.aISettings.findUnique({
      where: { merchantId: upload.merchantId }
    })

    const processingOptions = {
      confidenceThreshold: aiSettings?.confidenceThreshold || 0.8,
      customRules: aiSettings?.customRules || [],
      strictMatching: aiSettings?.strictMatching || true,
      primaryModel: aiSettings?.primaryModel || 'gpt-5-nano',
      fallbackModel: aiSettings?.fallbackModel || 'gpt-4o-mini'
    }

    // Prepare workflow data
    const workflowData = {
      uploadId: upload.id,
      fileName: upload.fileName,
      originalFileName: upload.originalFileName,
      fileSize: upload.fileSize,
      mimeType: upload.mimeType,
      merchantId: upload.merchantId,
      supplierId: upload.supplierId,
      buffer: fileBuffer,
      aiSettings: processingOptions,
      purchaseOrderId: workflow.purchaseOrderId
    }

    // Return immediately - processing happens in background
    res.json({
      success: true,
      message: 'Workflow processing started',
      uploadId,
      workflowId: upload.workflowId
    })

    // Start processing in background (after response is sent)
    // In serverless, we need to use the response callback pattern
    setImmediate(async () => {
      try {
        console.log(`📝 Starting background workflow for upload ${uploadId}`)
        
        const result = await workflowIntegration.processUploadedFile(workflowData)
        
        console.log(`✅ Workflow processing started successfully: ${result.workflowId}`)
        
      } catch (error) {
        console.error(`❌ Background workflow processing failed for upload ${uploadId}:`, error)
        
        // Update workflow status to failed
  await prisma.workflowExecution.update({
          where: { workflowId: upload.workflowId },
          data: {
            status: 'failed',
            errorMessage: error.message,
            failedStage: 'initialization'
          }
        })

        // Update upload status
  await prisma.upload.update({
          where: { id: uploadId },
          data: {
            status: 'failed',
            errorMessage: error.message
          }
        })
      }
    })

  } catch (error) {
    console.error('❌ Failed to trigger workflow:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

export default router
