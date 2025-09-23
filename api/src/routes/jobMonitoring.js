/**
 * Job Monitoring and Management Routes
 * API endpoints for monitoring Redis job queues and system health
 */

import express from 'express'
import { redisManager } from '../lib/redisManager.js'
import { fileProcessingJobService } from '../lib/fileProcessingJobService.js'
import { verifyShopifyRequest } from '../lib/auth.js'

const router = express.Router()

/**
 * Get Redis and queue system health status
 */
router.get('/health', async (req, res) => {
  try {
    const healthStatus = await redisManager.healthCheck()
    
    res.json({
      success: true,
      health: healthStatus,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Health check failed:', error)
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      message: error.message
    })
  }
})

/**
 * Get comprehensive queue statistics
 */
router.get('/queue-stats', verifyShopifyRequest, async (req, res) => {
  try {
    const queueStats = await fileProcessingJobService.getQueueStatistics()
    
    res.json({
      success: true,
      stats: queueStats,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Failed to get queue stats:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get queue statistics',
      message: error.message
    })
  }
})

/**
 * Get active jobs with pagination
 */
router.get('/active-jobs', verifyShopifyRequest, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query
    const activeJobs = await fileProcessingJobService.getActiveJobs({
      page: parseInt(page),
      limit: parseInt(limit),
      status
    })
    
    res.json({
      success: true,
      jobs: activeJobs,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Failed to get active jobs:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get active jobs',
      message: error.message
    })
  }
})

/**
 * Get failed jobs for debugging
 */
router.get('/failed-jobs', verifyShopifyRequest, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query
    const failedJobs = await fileProcessingJobService.getFailedJobs({
      page: parseInt(page),
      limit: parseInt(limit)
    })
    
    res.json({
      success: true,
      jobs: failedJobs,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Failed to get failed jobs:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get failed jobs',
      message: error.message
    })
  }
})

/**
 * Retry failed job
 */
router.post('/retry-job/:jobId', verifyShopifyRequest, async (req, res) => {
  try {
    const { jobId } = req.params
    const result = await fileProcessingJobService.retryJob(jobId)
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Job retry initiated',
        jobId: result.jobId
      })
    } else {
      res.status(404).json({
        success: false,
        error: 'Job not found or cannot be retried'
      })
    }
  } catch (error) {
    console.error('Failed to retry job:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to retry job',
      message: error.message
    })
  }
})

/**
 * Remove job from queue
 */
router.delete('/remove-job/:jobId', verifyShopifyRequest, async (req, res) => {
  try {
    const { jobId } = req.params
    const result = await fileProcessingJobService.removeJob(jobId)
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Job removed successfully'
      })
    } else {
      res.status(404).json({
        success: false,
        error: 'Job not found'
      })
    }
  } catch (error) {
    console.error('Failed to remove job:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to remove job',
      message: error.message
    })
  }
})

/**
 * Get job processing metrics and performance data
 */
router.get('/metrics', verifyShopifyRequest, async (req, res) => {
  try {
    const { timeframe = '1h' } = req.query
    const metrics = await fileProcessingJobService.getProcessingMetrics(timeframe)
    
    res.json({
      success: true,
      metrics,
      timeframe,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Failed to get metrics:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get processing metrics',
      message: error.message
    })
  }
})

/**
 * Pause/Resume queue processing
 */
router.post('/queue/:action', verifyShopifyRequest, async (req, res) => {
  try {
    const { action } = req.params // 'pause' or 'resume'
    
    if (!['pause', 'resume'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid action. Use "pause" or "resume"'
      })
    }
    
    const result = await fileProcessingJobService.controlQueue(action)
    
    res.json({
      success: true,
      message: `Queue ${action}d successfully`,
      status: result.status
    })
  } catch (error) {
    console.error(`Failed to ${req.params.action} queue:`, error)
    res.status(500).json({
      success: false,
      error: `Failed to ${req.params.action} queue`,
      message: error.message
    })
  }
})

/**
 * Clear completed jobs (cleanup)
 */
router.post('/cleanup', verifyShopifyRequest, async (req, res) => {
  try {
    const { olderThan = '1d', includeCompleted = true, includeFailed = false } = req.body
    
    const result = await fileProcessingJobService.cleanupJobs({
      olderThan,
      includeCompleted,
      includeFailed
    })
    
    res.json({
      success: true,
      message: 'Queue cleanup completed',
      removed: result.removedCount,
      details: result.details
    })
  } catch (error) {
    console.error('Failed to cleanup queue:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup queue',
      message: error.message
    })
  }
})

/**
 * Get real-time job progress (for WebSocket alternative)
 */
router.get('/job-progress/:uploadId', verifyShopifyRequest, async (req, res) => {
  try {
    const { uploadId } = req.params
    const progress = await fileProcessingJobService.getJobStatus(uploadId)
    
    res.json({
      success: true,
      uploadId,
      progress,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Failed to get job progress:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get job progress',
      message: error.message
    })
  }
})

export default router
