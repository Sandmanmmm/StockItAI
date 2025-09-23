/**
 * Async PO Processing Routes
 * Job queue integrated endpoints for PO analysis and Shopify sync
 */

import express from 'express'
import { enhancedJobService } from '../lib/enhancedJobService.js'
import { db } from '../lib/db.js'
import multer from 'multer'
import '../lib/poAnalysisJobProcessor.js' // Import to register processor
import '../lib/shopifySyncJobProcessor.js' // Import to register processor

const router = express.Router()
const upload = multer({ storage: multer.memoryStorage() })

/**
 * POST /api/analyze-po - Queue PO analysis job
 * Upload and analyze PO document asynchronously
 */
router.post('/analyze-po', upload.single('file'), async (req, res) => {
  try {
    const merchant = await db.getCurrentMerchant()
    if (!merchant) {
      return res.status(401).json({
        success: false,
        error: 'Merchant not found'
      })
    }

    const file = req.file
    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      })
    }

    const { 
      confidenceThreshold = 0.7, 
      priority = 'normal',
      supplierId,
      customRules = {} 
    } = req.body

    // Validate file type
    const allowedTypes = ['application/pdf', 'text/csv', 'application/vnd.ms-excel', 
                         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        error: 'Unsupported file type. Please upload PDF, Excel, or CSV files.'
      })
    }

    // Create PO record in database (pending analysis)
    const purchaseOrder = await db.client.purchaseOrder.create({
      data: {
        number: 'PENDING', // Will be updated after analysis
        supplierName: 'Analyzing...', // Will be updated after analysis
        totalAmount: 0, // Will be updated after analysis
        currency: 'USD',
        status: 'pending',
        jobStatus: 'pending',
        fileName: file.originalname,
        fileSize: file.size,
        merchantId: merchant.id,
        supplierId: supplierId || null
      }
    })

    // Determine job priority based on request and content
    let jobPriority = priority
    if (file.size > 5 * 1024 * 1024) { // Large files get lower priority
      jobPriority = 'low'
    } else if (priority === 'urgent') {
      jobPriority = 'critical'
    }

    // Queue analysis job
    const job = await enhancedJobService.addJob('analyze-po', {
      purchaseOrderId: purchaseOrder.id,
      fileContent: file.buffer,
      fileName: file.originalname,
      merchantId: merchant.id,
      options: {
        confidenceThreshold: parseFloat(confidenceThreshold),
        customRules: JSON.parse(customRules || '{}'),
        supplierId
      }
    }, {
      priority: jobPriority,
      attempts: 3,
      delay: 0
    })

    // Update PO with job ID
    await db.client.purchaseOrder.update({
      where: { id: purchaseOrder.id },
      data: { 
        analysisJobId: job.id.toString(),
        jobStatus: 'queued'
      }
    })

    res.json({
      success: true,
      message: 'PO analysis job queued successfully',
      data: {
        purchaseOrderId: purchaseOrder.id,
        jobId: job.id,
        priority: jobPriority,
        fileName: file.originalname,
        fileSize: file.size,
        estimatedProcessingTime: this.estimateProcessingTime(file.size, jobPriority),
        status: 'queued'
      }
    })

  } catch (error) {
    console.error('Analyze PO error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to queue PO analysis',
      details: error.message
    })
  }
})

/**
 * POST /api/apply-po-changes - Queue Shopify sync job  
 * Apply PO changes to Shopify asynchronously
 */
router.post('/apply-po-changes', async (req, res) => {
  try {
    const merchant = await db.getCurrentMerchant()
    if (!merchant) {
      return res.status(401).json({
        success: false,
        error: 'Merchant not found'
      })
    }

    const { 
      purchaseOrderId,
      syncType = 'full', // 'inventory', 'products', 'purchase_orders', 'full'
      priority = 'normal',
      changes = {},
      options = {}
    } = req.body

    if (!purchaseOrderId) {
      return res.status(400).json({
        success: false,
        error: 'purchaseOrderId is required'
      })
    }

    // Verify PO exists and belongs to merchant
    const purchaseOrder = await db.client.purchaseOrder.findFirst({
      where: {
        id: purchaseOrderId,
        merchantId: merchant.id
      },
      include: {
        lineItems: true
      }
    })

    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        error: 'Purchase order not found'
      })
    }

    // Validate sync type
    const validSyncTypes = ['inventory', 'products', 'purchase_orders', 'full']
    if (!validSyncTypes.includes(syncType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid sync type. Must be one of: ${validSyncTypes.join(', ')}`
      })
    }

    // Determine job priority based on sync type and urgency
    let jobPriority = priority
    if (syncType === 'inventory' && priority === 'urgent') {
      jobPriority = 'critical' // Inventory updates are often time-sensitive
    } else if (syncType === 'full') {
      jobPriority = 'low' // Full syncs are typically batch operations
    }

    // Queue sync job
    const job = await enhancedJobService.addJob('sync-to-shopify', {
      purchaseOrderId,
      merchantId: merchant.id,
      syncType,
      changes,
      options
    }, {
      priority: jobPriority,
      attempts: 5, // More attempts for sync jobs due to API rate limits
      delay: syncType === 'full' ? 5000 : 0, // Delay full syncs slightly
      backoff: {
        type: 'exponential',
        delay: 3000
      }
    })

    // Update PO with sync job ID
    await db.client.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { 
        syncJobId: job.id.toString(),
        jobStatus: 'queued'
      }
    })

    res.json({
      success: true,
      message: 'Shopify sync job queued successfully',
      data: {
        purchaseOrderId,
        jobId: job.id,
        syncType,
        priority: jobPriority,
        changesCount: Object.keys(changes).length,
        estimatedProcessingTime: this.estimateSyncTime(syncType, purchaseOrder.lineItems?.length),
        status: 'queued'
      }
    })

  } catch (error) {
    console.error('Apply PO changes error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to queue Shopify sync',
      details: error.message
    })
  }
})

/**
 * GET /api/po-job-status/:purchaseOrderId - Get job status for a PO
 */
router.get('/po-job-status/:purchaseOrderId', async (req, res) => {
  try {
    const merchant = await db.getCurrentMerchant()
    if (!merchant) {
      return res.status(401).json({
        success: false,
        error: 'Merchant not found'
      })
    }

    const { purchaseOrderId } = req.params

    // Get PO with job information
    const purchaseOrder = await db.client.purchaseOrder.findFirst({
      where: {
        id: purchaseOrderId,
        merchantId: merchant.id
      },
      include: {
        lineItems: true,
        supplier: {
          select: { id: true, name: true }
        }
      }
    })

    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        error: 'Purchase order not found'
      })
    }

    // Get job details from queue
    let analysisJob = null
    let syncJob = null

    if (purchaseOrder.analysisJobId) {
      try {
        analysisJob = await enhancedJobService.queue.getJob(purchaseOrder.analysisJobId)
      } catch (error) {
        console.warn(`Analysis job ${purchaseOrder.analysisJobId} not found in queue`)
      }
    }

    if (purchaseOrder.syncJobId) {
      try {
        syncJob = await enhancedJobService.queue.getJob(purchaseOrder.syncJobId)
      } catch (error) {
        console.warn(`Sync job ${purchaseOrder.syncJobId} not found in queue`)
      }
    }

    res.json({
      success: true,
      data: {
        purchaseOrder: {
          id: purchaseOrder.id,
          number: purchaseOrder.number,
          supplierName: purchaseOrder.supplierName,
          status: purchaseOrder.status,
          totalAmount: purchaseOrder.totalAmount,
          confidence: purchaseOrder.confidence,
          lineItemsCount: purchaseOrder.lineItems?.length || 0,
          jobStatus: purchaseOrder.jobStatus,
          jobStartedAt: purchaseOrder.jobStartedAt,
          jobCompletedAt: purchaseOrder.jobCompletedAt,
          jobError: purchaseOrder.jobError
        },
        jobs: {
          analysis: analysisJob ? {
            id: analysisJob.id,
            status: await analysisJob.getState(),
            progress: analysisJob.progress(),
            createdAt: new Date(analysisJob.timestamp),
            processedOn: analysisJob.processedOn ? new Date(analysisJob.processedOn) : null,
            finishedOn: analysisJob.finishedOn ? new Date(analysisJob.finishedOn) : null,
            failedReason: analysisJob.failedReason
          } : null,
          sync: syncJob ? {
            id: syncJob.id,
            status: await syncJob.getState(),
            progress: syncJob.progress(),
            createdAt: new Date(syncJob.timestamp),
            processedOn: syncJob.processedOn ? new Date(syncJob.processedOn) : null,
            finishedOn: syncJob.finishedOn ? new Date(syncJob.finishedOn) : null,
            failedReason: syncJob.failedReason
          } : null
        }
      }
    })

  } catch (error) {
    console.error('Get PO job status error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get job status',
      details: error.message
    })
  }
})

/**
 * GET /api/po-processing-queue - Get queue status and pending jobs
 */
router.get('/po-processing-queue', async (req, res) => {
  try {
    const merchant = await db.getCurrentMerchant()
    if (!merchant) {
      return res.status(401).json({
        success: false,
        error: 'Merchant not found'
      })
    }

    const { limit = 20, status = 'all' } = req.query

    // Get queue statistics
    const queueStats = await enhancedJobService.getQueueStats()

    // Get merchant's pending/processing POs
    const whereClause = { merchantId: merchant.id }
    if (status !== 'all') {
      whereClause.jobStatus = status
    }

    const purchaseOrders = await db.client.purchaseOrder.findMany({
      where: whereClause,
      include: {
        lineItems: true,
        supplier: {
          select: { id: true, name: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    })

    res.json({
      success: true,
      data: {
        queueStats: {
          main: queueStats.mainQueue,
          deadLetter: queueStats.deadLetterQueue,
          health: queueStats.health
        },
        purchaseOrders: purchaseOrders.map(po => ({
          id: po.id,
          number: po.number,
          supplierName: po.supplierName,
          status: po.status,
          jobStatus: po.jobStatus,
          totalAmount: po.totalAmount,
          confidence: po.confidence,
          fileName: po.fileName,
          lineItemsCount: po.lineItems?.length || 0,
          createdAt: po.createdAt,
          jobStartedAt: po.jobStartedAt,
          jobCompletedAt: po.jobCompletedAt
        }))
      }
    })

  } catch (error) {
    console.error('Get processing queue error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get processing queue',
      details: error.message
    })
  }
})

/**
 * POST /api/retry-failed-po/:purchaseOrderId - Retry failed PO processing
 */
router.post('/retry-failed-po/:purchaseOrderId', async (req, res) => {
  try {
    const merchant = await db.getCurrentMerchant()
    if (!merchant) {
      return res.status(401).json({
        success: false,
        error: 'Merchant not found'
      })
    }

    const { purchaseOrderId } = req.params
    const { jobType = 'analysis' } = req.body // 'analysis' or 'sync'

    const purchaseOrder = await db.client.purchaseOrder.findFirst({
      where: {
        id: purchaseOrderId,
        merchantId: merchant.id,
        jobStatus: 'failed'
      }
    })

    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        error: 'Failed purchase order not found'
      })
    }

    // Reset job status
    await db.client.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: {
        jobStatus: 'pending',
        jobError: null,
        jobStartedAt: null,
        jobCompletedAt: null
      }
    })

    res.json({
      success: true,
      message: `PO ${jobType} retry initiated`,
      data: {
        purchaseOrderId,
        jobType,
        status: 'pending'
      }
    })

  } catch (error) {
    console.error('Retry failed PO error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to retry PO processing',
      details: error.message
    })
  }
})

// Helper methods
router.estimateProcessingTime = function(fileSize, priority) {
  const baseTimes = {
    critical: 30, // 30 seconds
    high: 60,     // 1 minute  
    normal: 120,  // 2 minutes
    low: 300,     // 5 minutes
    batch: 600    // 10 minutes
  }
  
  const baseTime = baseTimes[priority] || baseTimes.normal
  const sizeMultiplier = Math.max(1, fileSize / (1024 * 1024)) // Per MB
  
  return Math.round(baseTime * sizeMultiplier)
}

router.estimateSyncTime = function(syncType, lineItemCount = 0) {
  const baseTimes = {
    inventory: 30,        // 30 seconds
    products: 60,         // 1 minute
    purchase_orders: 20,  // 20 seconds
    full: 120            // 2 minutes
  }
  
  const baseTime = baseTimes[syncType] || baseTimes.full
  const itemMultiplier = Math.max(1, lineItemCount / 10) // Per 10 items
  
  return Math.round(baseTime * itemMultiplier)
}

export default router