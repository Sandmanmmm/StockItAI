/**
 * File Upload API routes with Workflow Orchestration
 */

import express from 'express'
import multer from 'multer'
import https from 'https'
import { db } from '../lib/db.js'
import { storageService } from '../lib/storageService.js'
import { workflowIntegration } from '../lib/workflowIntegration.js'
import path from 'path'

const router = express.Router()

// Configure multer for file uploads
const storage = multer.memoryStorage()
const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit for high-quality scans
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/jpg',
      'image/webp',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only PDF, images, CSV, and Excel files are allowed.'))
    }
  }
})

// POST /api/upload/po-file - Upload PO file with AI processing
router.post('/po-file', upload.single('file'), async (req, res) => {
  try {
    const merchant = await db.getCurrentMerchant()
    if (!merchant) {
      return res.status(401).json({
        success: false,
        error: 'Merchant not found'
      })
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      })
    }

    const { 
      autoProcess = 'true', 
      supplierId,
      confidenceThreshold,
      customRules 
    } = req.body
    
    try {
      // Create initial PO record in database
      const purchaseOrder = await db.client.purchaseOrder.create({
        data: {
          number: `PO-${Date.now()}`, // Temporary number, will be updated by AI processing
          supplierName: 'Processing...', // Will be updated by AI processing
          orderDate: null,
          dueDate: null,
          totalAmount: 0, // Will be updated by AI processing
          currency: 'USD',
          status: 'pending',
          confidence: 0.0,
          fileName: req.file.originalname,
          fileSize: req.file.size,
          jobStatus: autoProcess === 'true' ? 'pending' : 'uploaded',
          merchantId: merchant.id,
          supplierId: supplierId || null
        }
      })

      // Upload file to Supabase Storage
      const uploadResult = await storageService.uploadFile(
        req.file.buffer,
        req.file.originalname,
        merchant.id,
        purchaseOrder.id,
        req.file.mimetype
      )

      if (!uploadResult.success) {
        // If storage upload fails, delete the database record
        await db.client.purchaseOrder.delete({
          where: { id: purchaseOrder.id }
        })
        return res.status(500).json({
          success: false,
          error: 'File storage failed: ' + uploadResult.error
        })
      }

      // Create upload record for workflow tracking
      const uploadRecord = await db.client.upload.create({
        data: {
          fileName: req.file.originalname,
          originalFileName: req.file.originalname,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
          fileUrl: uploadResult.filePath,
          status: 'uploaded',
          merchantId: merchant.id,
          supplierId: supplierId || null,
          metadata: {
            purchaseOrderId: purchaseOrder.id,
            autoProcess: autoProcess === 'true',
            uploadedAt: new Date().toISOString()
          }
        }
      })

      // Update PO record with file URL and upload reference
      const updatedPO = await db.client.purchaseOrder.update({
        where: { id: purchaseOrder.id },
        data: {
          fileUrl: uploadResult.filePath,
          status: autoProcess === 'true' ? 'processing' : 'uploaded'
        }
      })

      // Get merchant AI settings
      const aiSettings = await db.client.aISettings.findUnique({
        where: { merchantId: merchant.id }
      })

      const processingOptions = {
        confidenceThreshold: confidenceThreshold ? parseFloat(confidenceThreshold) : aiSettings?.confidenceThreshold || 0.8,
        customRules: customRules ? JSON.parse(customRules) : aiSettings?.customRules || [],
        strictMatching: aiSettings?.strictMatching || true,
        primaryModel: aiSettings?.primaryModel || 'gpt-5-nano',
        fallbackModel: aiSettings?.fallbackModel || 'gpt-4o-mini'
      }

      // Create a minimal workflow record immediately for tracking
      // Then trigger actual processing via separate endpoint to avoid timeout
      if (autoProcess === 'true') {
        try {
          // Generate a workflow ID and create the workflow execution record
          const workflowId = `wf_${Date.now()}_${uploadRecord.id.slice(0, 8)}`
          
          await db.client.workflowExecution.create({
            data: {
              workflowId,
              type: 'purchase_order_processing',
              status: 'pending',
              currentStage: null,
              stagesTotal: 4,
              stagesCompleted: 0,
              progressPercent: 0,
              inputData: {
                uploadId: uploadRecord.id,
                fileName: req.file.originalname,
                fileSize: req.file.size,
                mimeType: req.file.mimetype
              },
              merchantId: merchant.id,
              uploadId: uploadRecord.id,
              purchaseOrderId: purchaseOrder.id
            }
          })

          // Update upload with workflow ID
          await db.client.upload.update({
            where: { id: uploadRecord.id },
            data: { workflowId }
          })

          console.log(`✅ Workflow record created: ${workflowId} for upload ${uploadRecord.id}`)

          // Trigger queue processing via HTTP call (fire-and-forget)
          // Using native https module for better reliability
          const queueHost = process.env.VERCEL_URL || 'localhost:3001'
          const queuePath = '/api/process-upload-queue'
          const queueData = JSON.stringify({
            uploadId: uploadRecord.id,
            merchantId: merchant.id
          })

          console.log(`🔄 Initiating queue call to: https://${queueHost}${queuePath}`)

          const options = {
            hostname: queueHost.replace('https://', '').replace('http://', ''),
            port: 443,
            path: queuePath,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(queueData)
            }
          }

          const queueReq = https.request(options, (queueRes) => {
            console.log(`📬 Queue response status: ${queueRes.statusCode}`)
            
            if (queueRes.statusCode === 200) {
              console.log(`✅ Queue processing initiated for upload: ${uploadRecord.id}`)
            } else {
              console.error(`❌ Queue processing failed with status: ${queueRes.statusCode}`)
            }
          })

          queueReq.on('error', (queueError) => {
            console.error(`❌ Failed to call queue handler:`, queueError.message)
          })

          queueReq.write(queueData)
          queueReq.end()

        } catch (workflowError) {
          console.error(`❌ Failed to create workflow record for upload ${uploadRecord.id}:`, workflowError)
          // Don't fail the upload - just log the error
        }
      }

      // Return success after workflow has been initiated
      res.json({
        success: true,
        data: {
          poId: purchaseOrder.id,
          uploadId: uploadRecord.id,
          fileName: req.file.originalname,
          fileSize: req.file.size,
          status: autoProcess === 'true' ? 'processing' : 'uploaded',
          message: autoProcess === 'true' 
            ? 'File uploaded successfully. Processing started.' 
            : 'File uploaded successfully',
          fileUrl: uploadResult.fileUrl // Signed URL for immediate access
        },
        message: autoProcess === 'true' ? 
          'File uploaded successfully and workflow started for AI processing' : 
          'File uploaded successfully'
      })

    } catch (dbError) {
      console.error('Database error during upload:', dbError)
      res.status(500).json({
        success: false,
        error: 'Database error during upload',
        details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
      })
    }

  } catch (error) {
    console.error('Upload error:', error)
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 25MB'
      })
    }
    
    if (error.message.includes('Invalid file type')) {
      return res.status(400).json({
        success: false,
        error: error.message
      })
    }
    
    res.status(500).json({
      success: false,
      error: 'File upload failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
})

// GET /api/upload/:poId/status - Get upload and processing status
router.get('/:poId/status', async (req, res) => {
  try {
    const merchant = await db.getCurrentMerchant()
    if (!merchant) {
      return res.status(401).json({
        success: false,
        error: 'Merchant not found'
      })
    }

    const { poId } = req.params
    
    // Get PO record from database
    const purchaseOrder = await db.client.purchaseOrder.findFirst({
      where: {
        id: poId,
        merchantId: merchant.id
      },
      include: {
        lineItems: true,
        supplier: true
      }
    })
    
    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        error: 'Purchase order not found'
      })
    }

    // Check job queue status if there's an active job
    let jobStatus = null
    if (purchaseOrder.analysisJobId) {
      try {
        jobStatus = await fileProcessingJobService.getJobStatus(purchaseOrder.analysisJobId)
      } catch (error) {
        console.error('Error getting job status:', error)
        jobStatus = { status: 'unknown', error: error.message }
      }
    }

    // Get fresh signed URL if file exists
    let fileUrl = null
    if (purchaseOrder.fileUrl) {
      try {
        const urlResult = await storageService.getSignedUrl(purchaseOrder.fileUrl)
        if (urlResult.success) {
          fileUrl = urlResult.signedUrl
        }
      } catch (error) {
        console.error('Error generating signed URL:', error)
      }
    }

    const response = {
      poId: purchaseOrder.id,
      uploadId: purchaseOrder.id, // For backward compatibility
      fileName: purchaseOrder.fileName,
      fileSize: purchaseOrder.fileSize,
      fileUrl: fileUrl,
      uploadedAt: purchaseOrder.createdAt,
      status: jobStatus?.status || purchaseOrder.jobStatus,
      progress: jobStatus?.progress || 0,
      message: jobStatus?.message || 'Processing...',
      processingTime: jobStatus?.result?.processingTime,
      confidence: purchaseOrder.confidence,
      purchaseOrder: {
        id: purchaseOrder.id,
        number: purchaseOrder.number,
        supplierName: purchaseOrder.supplierName,
        totalAmount: purchaseOrder.totalAmount,
        currency: purchaseOrder.currency,
        status: purchaseOrder.status,
        lineItems: purchaseOrder.lineItems,
        supplier: purchaseOrder.supplier
      },
      jobError: purchaseOrder.jobError || jobStatus?.error
    }

    res.json({
      success: true,
      data: response
    })
    
  } catch (error) {
    console.error('Get upload status error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get upload status'
    })
  }
})

// POST /api/upload/:poId/process - Manually trigger processing
router.post('/:poId/process', async (req, res) => {
  try {
    const merchant = await db.getCurrentMerchant()
    if (!merchant) {
      return res.status(401).json({
        success: false,
        error: 'Merchant not found'
      })
    }

    const { poId } = req.params
    const { confidenceThreshold, customRules } = req.body
    
    // Get PO record
    const purchaseOrder = await db.client.purchaseOrder.findFirst({
      where: {
        id: poId,
        merchantId: merchant.id
      }
    })
    
    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        error: 'Purchase order not found'
      })
    }

    // Check if already processing
    if (purchaseOrder.analysisJobId) {
      const existingJobStatus = await fileProcessingJobService.getJobStatus(purchaseOrder.analysisJobId)
      if (existingJobStatus.status === 'active' || existingJobStatus.status === 'waiting') {
        return res.status(409).json({
          success: false,
          error: 'File is already being processed'
        })
      }
    }

    // Get merchant AI settings
    const aiSettings = await db.client.aISettings.findUnique({
      where: { merchantId: merchant.id }
    })

    const processingOptions = {
      autoProcess: true,
      aiSettings: {
        ...aiSettings,
        confidenceThreshold: confidenceThreshold || aiSettings?.confidenceThreshold || 0.8,
        customRules: customRules || aiSettings?.customRules || []
      }
    }

    // Queue for processing
    const jobId = await fileProcessingJobService.addFileProcessingJob(
      purchaseOrder.id,
      {
        uploadId: purchaseOrder.id,
        fileName: purchaseOrder.fileName,
        fileSize: purchaseOrder.fileSize,
        merchantId: merchant.id,
        supplierId: purchaseOrder.supplierId,
        filePath: purchaseOrder.fileUrl
      },
      processingOptions
    )
    
    // Update PO status
    await db.client.purchaseOrder.update({
      where: { id: purchaseOrder.id },
      data: {
        analysisJobId: jobId,
        jobStatus: 'processing',
        jobStartedAt: new Date(),
        jobError: null
      }
    })

    res.json({
      success: true,
      message: 'File queued for processing',
      data: {
        poId: purchaseOrder.id,
        jobId: jobId,
        status: 'processing',
        estimatedTime: estimateProcessingTime(purchaseOrder.fileSize, 'application/pdf')
      }
    })

  } catch (error) {
    console.error('Manual processing trigger error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to start processing'
    })
  }
})

// GET /api/upload/:poId/download - Download original file
router.get('/:poId/download', async (req, res) => {
  try {
    const merchant = await db.getCurrentMerchant()
    if (!merchant) {
      return res.status(401).json({
        success: false,
        error: 'Merchant not found'
      })
    }

    const { poId } = req.params
    
    // Get PO record
    const purchaseOrder = await db.client.purchaseOrder.findFirst({
      where: {
        id: poId,
        merchantId: merchant.id
      }
    })
    
    if (!purchaseOrder || !purchaseOrder.fileUrl) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      })
    }

    // Generate signed URL for download
    const urlResult = await storageService.getSignedUrl(purchaseOrder.fileUrl, 60) // 1 minute expiry for downloads
    
    if (!urlResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate download URL'
      })
    }

    res.json({
      success: true,
      data: {
        downloadUrl: urlResult.signedUrl,
        fileName: purchaseOrder.fileName,
        fileSize: purchaseOrder.fileSize
      }
    })

  } catch (error) {
    console.error('Download error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to generate download link'
    })
  }
})

// GET /api/upload/:uploadId/workflow-status - Get workflow status for upload
router.get('/:uploadId/workflow-status', async (req, res) => {
  try {
    const { uploadId } = req.params
    
    const merchant = await db.getCurrentMerchant()
    if (!merchant) {
      return res.status(401).json({
        success: false,
        error: 'Merchant not found'
      })
    }

    // Get upload record
    const upload = await db.client.upload.findFirst({
      where: {
        id: uploadId,
        merchantId: merchant.id
      }
    })
    
    if (!upload) {
      return res.status(404).json({
        success: false,
        error: 'Upload not found'
      })
    }

    // Get workflow status
    const workflowStatus = await workflowIntegration.getUploadWorkflowStatus(uploadId)
    
    res.json({
      success: true,
      upload: {
        id: upload.id,
        fileName: upload.fileName,
        status: upload.status,
        createdAt: upload.createdAt
      },
      workflow: workflowStatus
    })

  } catch (error) {
    console.error('Workflow status error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get workflow status'
    })
  }
})

// Helper function to estimate processing time
function estimateProcessingTime(fileSize, mimeType) {
  // Base processing times in seconds
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
  
  // Adjust for file size (MB)
  const sizeMB = fileSize / (1024 * 1024)
  const sizeMultiplier = Math.max(1, sizeMB / 5) // Add time for larger files
  
  return Math.round(baseTime * sizeMultiplier)
}

export default router