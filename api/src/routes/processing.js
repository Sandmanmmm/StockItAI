/**
 * Processing API routes
 * Handles file processing operations and status tracking
 */

import express from 'express'
import { fileProcessingJobService } from '../lib/fileProcessingJobService.js'
import { db } from '../lib/db.js'

const router = express.Router()

// POST /api/process/po-file/:uploadId - Process uploaded PO file
router.post('/po-file/:uploadId', async (req, res) => {
  try {
    const merchant = req.merchant
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      })
    }

    const { uploadId } = req.params
    const { confidenceThreshold, customRules, supplierId } = req.body
    
    // Check if upload exists
    global.uploadStorage = global.uploadStorage || {}
    const upload = global.uploadStorage[uploadId]
    
    if (!upload || upload.merchantId !== merchant.id) {
      return res.status(404).json({
        success: false,
        error: 'Upload not found'
      })
    }

    // Check if already processing
    const existingJobStatus = await fileProcessingJobService.getJobStatus(uploadId)
    if (existingJobStatus.status === 'active' || existingJobStatus.status === 'waiting') {
      return res.status(409).json({
        success: false,
        error: 'File is already being processed'
      })
    }

    // Get merchant AI settings
    const aiSettings = await db.client.aiSettings.findUnique({
      where: { merchantId: merchant.id }
    })

    // Update upload with supplier ID if provided
    if (supplierId) {
      upload.supplierId = supplierId
    }

    const processingOptions = {
      autoProcess: true,
      aiSettings: {
        ...aiSettings,
        confidenceThreshold: confidenceThreshold || aiSettings?.confidenceThreshold || 0.8,
        customRules: customRules || aiSettings?.customRules || []
      }
    }

    // Queue for processing
    const job = await fileProcessingJobService.addFileProcessingJob(uploadId, upload, processingOptions)
    
    // Update storage status
    upload.status = 'processing'

    res.json({
      success: true,
      message: 'File processing started',
      data: {
        uploadId,
        jobId: job.id,
        status: 'processing',
        estimatedTime: estimateProcessingTime(upload.fileSize, upload.mimeType)
      }
    })

  } catch (error) {
    console.error('Process PO file error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to start processing',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
})

// GET /api/process/status/:uploadId - Get processing status
router.get('/status/:uploadId', async (req, res) => {
  try {
    const merchant = req.merchant
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      })
    }

    const { uploadId } = req.params
    
    // Get job status
    const jobStatus = await fileProcessingJobService.getJobStatus(uploadId)
    
    if (jobStatus.status === 'not_found') {
      return res.status(404).json({
        success: false,
        error: 'Processing job not found'
      })
    }

    // Map job status to expected format
    const statusMapping = {
      'waiting': 'pending',
      'active': 'processing',
      'completed': 'completed',
      'failed': 'failed',
      'delayed': 'pending',
      'paused': 'pending'
    }

    const response = {
      status: statusMapping[jobStatus.status] || jobStatus.status,
      progress: jobStatus.progress || 0,
      message: jobStatus.message,
      result: jobStatus.result,
      error: jobStatus.error,
      processingTime: jobStatus.finishedOn && jobStatus.createdAt ? 
        jobStatus.finishedOn - jobStatus.createdAt : null
    }

    // If completed, include the purchase order data
    if (jobStatus.status === 'completed' && jobStatus.result?.purchaseOrder) {
      try {
        const purchaseOrder = await db.client.purchaseOrder.findFirst({
          where: {
            id: jobStatus.result.purchaseOrder.id,
            merchantId: merchant.id
          },
          include: {
            lineItems: true,
            supplier: true
          }
        })
        
        if (purchaseOrder) {
          response.result = {
            ...response.result,
            purchaseOrder
          }
        }
      } catch (error) {
        console.error('Error fetching processed PO:', error)
      }
    }

    res.json({
      success: true,
      data: response
    })

  } catch (error) {
    console.error('Get processing status error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get processing status'
    })
  }
})

// POST /api/process/retry/:uploadId - Retry failed processing
router.post('/retry/:uploadId', async (req, res) => {
  try {
    const merchant = req.merchant
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      })
    }

    const { uploadId } = req.params
    
    // Check if upload exists
    global.uploadStorage = global.uploadStorage || {}
    const upload = global.uploadStorage[uploadId]
    
    if (!upload || upload.merchantId !== merchant.id) {
      return res.status(404).json({
        success: false,
        error: 'Upload not found'
      })
    }

    // Get current job status
    const jobStatus = await fileProcessingJobService.getJobStatus(uploadId)
    
    if (jobStatus.status !== 'failed') {
      return res.status(409).json({
        success: false,
        error: 'Can only retry failed processing jobs'
      })
    }

    // Get merchant AI settings
    const aiSettings = await db.client.aiSettings.findUnique({
      where: { merchantId: merchant.id }
    })

    const processingOptions = {
      autoProcess: true,
      aiSettings
    }

    // Generate new upload ID for retry
    const retryUploadId = `${uploadId}_retry_${Date.now()}`
    
    // Queue new processing job
    await fileProcessingJobService.addFileProcessingJob(retryUploadId, {
      ...upload,
      uploadId: retryUploadId
    }, processingOptions)

    res.json({
      success: true,
      message: 'Processing retry started',
      data: {
        originalUploadId: uploadId,
        retryUploadId,
        status: 'processing'
      }
    })

  } catch (error) {
    console.error('Retry processing error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to retry processing'
    })
  }
})

// Helper function to estimate processing time
function estimateProcessingTime(fileSize, mimeType) {
  const baseTimes = {
    'application/pdf': 15,
    'image/jpeg': 20,
    'image/png': 20,
    'image/jpg': 20,
    'image/webp': 22,
    'text/csv': 5,
    'application/vnd.ms-excel': 8,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 8
  }

  const baseTime = baseTimes[mimeType] || 15
  const sizeMB = fileSize / (1024 * 1024)
  const sizeMultiplier = Math.max(1, sizeMB / 5)
  
  return Math.round(baseTime * sizeMultiplier)
}

export default router