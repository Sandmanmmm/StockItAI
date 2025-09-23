/**
 * Dead Letter Queue Management Routes
 * API endpoints for managing failed jobs and manual review processes
 */

import express from 'express'
import { enhancedJobService } from '../lib/enhancedJobService.js'

const router = express.Router()

/**
 * Get dead letter queue jobs for manual review
 * GET /api/dead-letter-jobs
 */
router.get('/', async (req, res) => {
  try {
    const { status = 'waiting', limit = 50, offset = 0 } = req.query
    
    const jobs = await enhancedJobService.getDeadLetterJobs(status, parseInt(limit))
    
    res.json({
      success: true,
      data: {
        jobs,
        total: jobs.length,
        status,
        limit: parseInt(limit)
      }
    })
  } catch (error) {
    console.error('Failed to fetch dead letter jobs:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dead letter jobs',
      details: error.message
    })
  }
})

/**
 * Get specific dead letter job details
 * GET /api/dead-letter-jobs/:jobId
 */
router.get('/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params
    
    if (!enhancedJobService.deadLetterQueue) {
      return res.status(404).json({
        success: false,
        error: 'Dead letter queue not configured'
      })
    }

    const job = await enhancedJobService.deadLetterQueue.getJob(jobId)
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: `Dead letter job ${jobId} not found`
      })
    }

    res.json({
      success: true,
      data: {
        id: job.id,
        originalJobId: job.data.originalJobId,
        originalJobData: job.data.originalJobData,
        failureReason: job.data.failureReason,
        failureStack: job.data.failureStack,
        failedAt: job.data.failedAt,
        attemptsMade: job.data.attemptsMade,
        priority: job.data.priority,
        reprocessed: !!job.data.reprocessedAsJobId,
        reprocessedAsJobId: job.data.reprocessedAsJobId,
        reviewNotes: job.data.reviewNotes,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn
      }
    })
  } catch (error) {
    console.error(`Failed to fetch dead letter job ${req.params.jobId}:`, error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch job details',
      details: error.message
    })
  }
})

/**
 * Reprocess a dead letter job
 * POST /api/dead-letter-jobs/:jobId/reprocess
 */
router.post('/:jobId/reprocess', async (req, res) => {
  try {
    const { jobId } = req.params
    const { reviewNotes = '', priority = 'high', attempts = 3 } = req.body

    const newJob = await enhancedJobService.reprocessDeadLetterJob(
      jobId, 
      reviewNotes
    )

    res.json({
      success: true,
      message: `Dead letter job ${jobId} has been reprocessed`,
      data: {
        originalJobId: jobId,
        newJobId: newJob.id,
        reviewNotes,
        reprocessedAt: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error(`Failed to reprocess dead letter job ${req.params.jobId}:`, error)
    res.status(500).json({
      success: false,
      error: 'Failed to reprocess job',
      details: error.message
    })
  }
})

/**
 * Add review notes to a dead letter job
 * PUT /api/dead-letter-jobs/:jobId/review
 */
router.put('/:jobId/review', async (req, res) => {
  try {
    const { jobId } = req.params
    const { reviewNotes, reviewedBy, resolution } = req.body

    if (!enhancedJobService.deadLetterQueue) {
      return res.status(404).json({
        success: false,
        error: 'Dead letter queue not configured'
      })
    }

    const job = await enhancedJobService.deadLetterQueue.getJob(jobId)
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: `Dead letter job ${jobId} not found`
      })
    }

    // Update job with review information
    await job.update({
      ...job.data,
      reviewNotes,
      reviewedBy,
      resolution, // 'reprocess', 'discard', 'pending'
      reviewedAt: new Date().toISOString()
    })

    res.json({
      success: true,
      message: `Review notes added to job ${jobId}`,
      data: {
        jobId,
        reviewNotes,
        reviewedBy,
        resolution,
        reviewedAt: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error(`Failed to add review notes to job ${req.params.jobId}:`, error)
    res.status(500).json({
      success: false,
      error: 'Failed to add review notes',
      details: error.message
    })
  }
})

/**
 * Bulk reprocess multiple dead letter jobs
 * POST /api/dead-letter-jobs/bulk-reprocess
 */
router.post('/bulk-reprocess', async (req, res) => {
  try {
    const { jobIds, reviewNotes = 'Bulk reprocessed', priority = 'high' } = req.body

    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'jobIds must be a non-empty array'
      })
    }

    const results = []
    const errors = []

    for (const jobId of jobIds) {
      try {
        const newJob = await enhancedJobService.reprocessDeadLetterJob(jobId, reviewNotes)
        results.push({
          originalJobId: jobId,
          newJobId: newJob.id,
          success: true
        })
      } catch (error) {
        errors.push({
          originalJobId: jobId,
          error: error.message,
          success: false
        })
      }
    }

    res.json({
      success: true,
      message: `Bulk reprocess completed: ${results.length} succeeded, ${errors.length} failed`,
      data: {
        succeeded: results,
        failed: errors,
        totalProcessed: jobIds.length,
        successCount: results.length,
        errorCount: errors.length
      }
    })
  } catch (error) {
    console.error('Failed to bulk reprocess jobs:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to bulk reprocess jobs',
      details: error.message
    })
  }
})

/**
 * Delete/discard dead letter jobs that are not recoverable
 * DELETE /api/dead-letter-jobs/:jobId
 */
router.delete('/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params
    const { reason = 'Manually discarded' } = req.body

    if (!enhancedJobService.deadLetterQueue) {
      return res.status(404).json({
        success: false,
        error: 'Dead letter queue not configured'
      })
    }

    const job = await enhancedJobService.deadLetterQueue.getJob(jobId)
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: `Dead letter job ${jobId} not found`
      })
    }

    // Log the discard action before removing
    console.log(`Discarding dead letter job ${jobId}: ${reason}`)
    
    await job.remove()

    res.json({
      success: true,
      message: `Dead letter job ${jobId} has been discarded`,
      data: {
        jobId,
        reason,
        discardedAt: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error(`Failed to discard dead letter job ${req.params.jobId}:`, error)
    res.status(500).json({
      success: false,
      error: 'Failed to discard job',
      details: error.message
    })
  }
})

/**
 * Get dead letter queue statistics
 * GET /api/dead-letter-jobs/stats
 */
router.get('/stats', async (req, res) => {
  try {
    if (!enhancedJobService.deadLetterQueue) {
      return res.json({
        success: true,
        data: {
          enabled: false,
          message: 'Dead letter queue not configured'
        }
      })
    }

    const stats = await enhancedJobService.deadLetterQueue.getJobCounts()
    const jobs = await enhancedJobService.getDeadLetterJobs('waiting', 10)

    // Calculate failure patterns
    const failureReasons = {}
    jobs.forEach(job => {
      const reason = job.failureReason || 'Unknown'
      failureReasons[reason] = (failureReasons[reason] || 0) + 1
    })

    res.json({
      success: true,
      data: {
        enabled: true,
        queueStats: stats,
        recentJobs: jobs.slice(0, 5),
        failurePatterns: failureReasons,
        totalFailures: jobs.length,
        generatedAt: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('Failed to get dead letter queue stats:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get statistics',
      details: error.message
    })
  }
})

export default router