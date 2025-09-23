/**
 * Merchant-Facing Job Status Routes
 * Provides job visibility and control for merchants in Shopify Admin
 */

import express from 'express'
import { enhancedJobService } from '../lib/enhancedJobService.js'
import { redisManager } from '../lib/redisManager.js'
import { db } from '../lib/db.js'
import { 
  authenticateMerchantJobRequest, 
  requireJobPermission, 
  validateJobOwnership,
  auditLogMiddleware 
} from '../lib/merchantAuth.js'

const router = express.Router()

// Apply enhanced authentication and audit logging to all routes
router.use(authenticateMerchantJobRequest)
router.use(auditLogMiddleware)

/**
 * GET /api/merchant/jobs/summary - Overall job status summary
 */
router.get('/summary', async (req, res) => {
  try {
    // req.shop is set by authentication middleware
    if (!req.shop) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      })
    }

    const merchant = req.shop

    // Get job counts from all queues
    const [
      processingCount,
      completedCount, 
      failedCount,
      dlqCount
    ] = await Promise.all([
      enhancedJobService.getProcessingJobsCount(),
      enhancedJobService.getCompletedJobsCount(),
      enhancedJobService.getFailedJobsCount(), 
      enhancedJobService.getDeadLetterQueueCount()
    ])

    // Get recent failed jobs for alerts
    const recentFailedJobs = await enhancedJobService.getRecentFailedJobs(5)

    // Calculate health score
    const totalJobs = processingCount + completedCount + failedCount
    const healthScore = totalJobs > 0 ? Math.round((completedCount / totalJobs) * 100) : 100

    const summary = {
      success: true,
      data: {
        status: {
          processing: processingCount,
          completed: completedCount,
          failed: failedCount,
          deadLetterQueue: dlqCount
        },
        health: {
          score: healthScore,
          status: healthScore >= 95 ? 'excellent' : 
                 healthScore >= 80 ? 'good' : 
                 healthScore >= 60 ? 'warning' : 'critical'
        },
        alerts: recentFailedJobs.map(job => ({
          id: job.id,
          type: 'failed_job',
          message: `PO ${job.data?.purchaseOrderId || 'Unknown'} failed to process: ${job.failedReason || 'Unknown error'}`,
          timestamp: job.processedOn,
          canRetry: true,
          severity: job.attemptsMade >= 3 ? 'critical' : 'warning'
        })),
        lastUpdated: new Date().toISOString()
      }
    }

    res.json(summary)
  } catch (error) {
    console.error('Error getting job summary:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get job summary'
    })
  }
})

/**
 * GET /api/merchant/jobs/status/:type - Get jobs by status type
 */
router.get('/status/:type', async (req, res) => {
  try {
    const { type } = req.params
    const { page = 1, limit = 10 } = req.query

    // req.shop is set by authentication middleware
    if (!req.shop) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      })
    }

    const merchant = req.shop

    let jobs = []
    let total = 0

    switch (type) {
      case 'processing':
        jobs = await enhancedJobService.getProcessingJobs(parseInt(limit), parseInt(page))
        total = await enhancedJobService.getProcessingJobsCount()
        break
        
      case 'completed':
        jobs = await enhancedJobService.getCompletedJobs(parseInt(limit), parseInt(page))
        total = await enhancedJobService.getCompletedJobsCount()
        break
        
      case 'failed':
        jobs = await enhancedJobService.getFailedJobs(parseInt(limit), parseInt(page))
        total = await enhancedJobService.getFailedJobsCount()
        break
        
      case 'dead-letter':
        jobs = await enhancedJobService.getDeadLetterJobs(parseInt(limit), parseInt(page))
        total = await enhancedJobService.getDeadLetterQueueCount()
        break
        
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid status type. Use: processing, completed, failed, dead-letter'
        })
    }

    // Format jobs for merchant display
    const formattedJobs = jobs.map(job => ({
      id: job.id,
      type: job.name,
      purchaseOrderId: job.data?.purchaseOrderId || null,
      fileName: job.data?.fileName || null,
      status: type,
      priority: job.opts?.priority || 'normal',
      createdAt: job.timestamp,
      processedAt: job.processedOn,
      completedAt: job.finishedOn,
      progress: job.progress || 0,
      error: job.failedReason || null,
      attempts: job.attemptsMade || 0,
      maxAttempts: job.opts?.attempts || 3,
      canRetry: ['failed', 'dead-letter'].includes(type),
      estimatedDuration: job.data?.estimatedDuration || null
    }))

    res.json({
      success: true,
      data: {
        jobs: formattedJobs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit))
        }
      }
    })
  } catch (error) {
    console.error('Error getting jobs by status:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get jobs'
    })
  }
})

/**
 * GET /api/merchant/jobs/purchase-order/:id - Get all jobs for a specific PO
 */
router.get('/purchase-order/:id', async (req, res) => {
  try {
    const { id: purchaseOrderId } = req.params

    // req.shop is set by authentication middleware
    if (!req.shop) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      })
    }

    const merchant = req.shop

    // Get PO details with job tracking fields
    const purchaseOrder = await db.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: {
        supplier: true,
        lineItems: true
      }
    })

    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        error: 'Purchase order not found'
      })
    }

    // Get all jobs related to this PO
    const allJobs = await Promise.all([
      enhancedJobService.getJobsByPurchaseOrder(purchaseOrderId, 'processing'),
      enhancedJobService.getJobsByPurchaseOrder(purchaseOrderId, 'completed'),
      enhancedJobService.getJobsByPurchaseOrder(purchaseOrderId, 'failed'),
      enhancedJobService.getJobsByPurchaseOrder(purchaseOrderId, 'dead-letter')
    ])

    const jobs = allJobs.flat().map(job => ({
      id: job.id,
      type: job.name,
      status: job.status,
      priority: job.opts?.priority || 'normal',
      createdAt: job.timestamp,
      processedAt: job.processedOn,
      completedAt: job.finishedOn,
      progress: job.progress || 0,
      error: job.failedReason || null,
      attempts: job.attemptsMade || 0,
      maxAttempts: job.opts?.attempts || 3,
      canRetry: ['failed', 'dead-letter'].includes(job.status)
    }))

    res.json({
      success: true,
      data: {
        purchaseOrder: {
          id: purchaseOrder.id,
          fileName: purchaseOrder.fileName,
          supplier: purchaseOrder.supplier?.name,
          status: purchaseOrder.status,
          jobStatus: purchaseOrder.jobStatus,
          analysisJobId: purchaseOrder.analysisJobId,
          syncJobId: purchaseOrder.syncJobId,
          totalAmount: purchaseOrder.totalAmount,
          lineItemsCount: purchaseOrder.lineItems.length
        },
        jobs: jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      }
    })
  } catch (error) {
    console.error('Error getting PO jobs:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get purchase order jobs'
    })
  }
})

/**
 * POST /api/merchant/jobs/retry/:jobId - Retry a failed or dead letter job
 */
router.post('/retry/:jobId', 
  requireJobPermission('canRetryJobs'),
  validateJobOwnership,
  async (req, res) => {
  try {
    const { jobId } = req.params

    // req.shop is set by authentication middleware
    if (!req.shop) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      })
    }

    const merchant = req.shop

    // Try to retry from failed jobs first, then dead letter queue
    let retryResult = await enhancedJobService.retryFailedJob(jobId)
    
    if (!retryResult.success) {
      retryResult = await enhancedJobService.reprocessDeadLetterJob(jobId)
    }

    if (retryResult.success) {
      res.json({
        success: true,
        message: 'Job queued for retry',
        data: {
          newJobId: retryResult.newJobId,
          originalJobId: jobId
        }
      })
    } else {
      res.status(400).json({
        success: false,
        error: retryResult.error || 'Failed to retry job'
      })
    }
  } catch (error) {
    console.error('Error retrying job:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to retry job'
    })
  }
})

/**
 * POST /api/merchant/jobs/retry-failed-pos - Retry all failed PO jobs
 */
router.post('/retry-failed-pos', 
  requireJobPermission('canRetryJobs'),
  async (req, res) => {
  try {
    // req.shop is set by authentication middleware
    if (!req.shop) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      })
    }

    const merchant = req.shop

    const failedJobs = await enhancedJobService.getFailedJobs(50) // Get up to 50 failed jobs
    const deadLetterJobs = await enhancedJobService.getDeadLetterJobs(50)

    const retryPromises = [
      ...failedJobs.map(job => enhancedJobService.retryFailedJob(job.id)),
      ...deadLetterJobs.map(job => enhancedJobService.reprocessDeadLetterJob(job.id))
    ]

    const results = await Promise.allSettled(retryPromises)
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length
    const failed = results.length - successful

    res.json({
      success: true,
      message: `Retry operation completed`,
      data: {
        totalJobs: results.length,
        successful,
        failed,
        retryRate: results.length > 0 ? Math.round((successful / results.length) * 100) : 0
      }
    })
  } catch (error) {
    console.error('Error retrying failed POs:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to retry failed POs'
    })
  }
})

/**
 * DELETE /api/merchant/jobs/:jobId - Cancel/remove a job
 */
router.delete('/:jobId', 
  requireJobPermission('canCancelJobs'),
  validateJobOwnership,
  async (req, res) => {
  try {
    const { jobId } = req.params

    // req.shop is set by authentication middleware
    if (!req.shop) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      })
    }

    const merchant = req.shop

    const result = await enhancedJobService.removeJob(jobId)

    if (result.success) {
      res.json({
        success: true,
        message: 'Job removed successfully'
      })
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Failed to remove job'
      })
    }
  } catch (error) {
    console.error('Error removing job:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to remove job'
    })
  }
})

/**
 * GET /api/merchant/jobs/alerts - Get current alerts for merchant
 */
router.get('/alerts', async (req, res) => {
  try {
    // req.shop is set by authentication middleware
    if (!req.shop) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      })
    }

    const merchant = req.shop

    const [failedJobs, dlqJobs, stuckJobs] = await Promise.all([
      enhancedJobService.getRecentFailedJobs(10),
      enhancedJobService.getDeadLetterJobs(10),
      enhancedJobService.getStuckJobs() // Jobs processing for too long
    ])

    const alerts = []

    // Failed jobs alerts
    if (failedJobs.length > 0) {
      alerts.push({
        id: 'failed-jobs',
        type: 'error',
        title: `${failedJobs.length} PO${failedJobs.length > 1 ? 's' : ''} failed to process`,
        message: 'Click to review and retry failed purchase orders',
        action: {
          label: 'Review Failed Jobs',
          endpoint: '/api/merchant/jobs/status/failed'
        },
        count: failedJobs.length,
        severity: 'high',
        timestamp: new Date().toISOString()
      })
    }

    // Dead letter queue alerts  
    if (dlqJobs.length > 0) {
      alerts.push({
        id: 'dead-letter-jobs',
        type: 'critical',
        title: `${dlqJobs.length} job${dlqJobs.length > 1 ? 's' : ''} moved to dead letter queue`,
        message: 'These jobs have exceeded retry limits and need manual review',
        action: {
          label: 'Review Dead Letter Jobs',
          endpoint: '/api/merchant/jobs/status/dead-letter'
        },
        count: dlqJobs.length,
        severity: 'critical',
        timestamp: new Date().toISOString()
      })
    }

    // Stuck jobs alerts
    if (stuckJobs.length > 0) {
      alerts.push({
        id: 'stuck-jobs',
        type: 'warning',
        title: `${stuckJobs.length} job${stuckJobs.length > 1 ? 's' : ''} may be stuck`,
        message: 'These jobs have been processing for an unusually long time',
        action: {
          label: 'Review Processing Jobs',
          endpoint: '/api/merchant/jobs/status/processing'
        },
        count: stuckJobs.length,
        severity: 'medium',
        timestamp: new Date().toISOString()
      })
    }

    // Success message when no issues
    if (alerts.length === 0) {
      alerts.push({
        id: 'all-good',
        type: 'success',
        title: 'All systems running smoothly',
        message: 'No issues detected with your PO processing',
        count: 0,
        severity: 'info',
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: {
        alerts,
        summary: {
          totalAlerts: alerts.filter(a => a.type !== 'success').length,
          criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
          hasIssues: alerts.some(a => a.type !== 'success')
        }
      }
    })
  } catch (error) {
    console.error('Error getting alerts:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get alerts'
    })
  }
})

export default router