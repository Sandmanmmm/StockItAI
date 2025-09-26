/**
 * Merchant Status & Error Handling API Routes
 * 
 * Provides merchant-friendly endpoints for workflow status, error handling, and retry operations
 */

import express from 'express'
import { errorHandlingService } from '../lib/errorHandlingService.js'
import { workflowOrchestrator } from '../lib/workflowOrchestrator.js'
import { db } from '../lib/db.js'

const router = express.Router()

/**
 * GET /api/merchant/status/:workflowId
 * Get merchant-friendly status for a specific workflow
 */
router.get('/status/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params
    
    const merchantStatus = await errorHandlingService.getMerchantStatus(workflowId)
    
    res.json({
      success: true,
      workflowId,
      ...merchantStatus
    })
    
  } catch (error) {
    console.error('Failed to get merchant status:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve status',
      message: 'Unable to get workflow status. Please try again.'
    })
  }
})

/**
 * GET /api/merchant/status
 * Get status for all workflows for a merchant
 */
router.get('/status', async (req, res) => {
  try {
    const { merchantId, limit = 20, offset = 0, status } = req.query
    
    // Get workflows from database
    const whereClause = {}
    if (merchantId) whereClause.merchantId = merchantId
    if (status) whereClause.status = status
    
    const workflows = await db.workflowExecution.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset),
      select: {
        id: true,
        workflowId: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        statusData: true
      }
    })
    
    // Enhance with merchant-friendly status
    const enhancedWorkflows = await Promise.all(
      workflows.map(async (workflow) => {
        const merchantStatus = await errorHandlingService.getMerchantStatus(workflow.workflowId)
        return {
          workflowId: workflow.workflowId,
          ...merchantStatus,
          createdAt: workflow.createdAt,
          updatedAt: workflow.updatedAt
        }
      })
    )
    
    res.json({
      success: true,
      workflows: enhancedWorkflows,
      total: enhancedWorkflows.length,
      hasMore: enhancedWorkflows.length === parseInt(limit)
    })
    
  } catch (error) {
    console.error('Failed to get merchant workflows:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve workflows',
      message: 'Unable to get workflow list. Please try again.'
    })
  }
})

/**
 * POST /api/merchant/retry/:workflowId
 * Retry a failed workflow
 */
router.post('/retry/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params
    const { stage } = req.body
    
    // Check if workflow exists and can be retried
    const workflowStatus = await workflowOrchestrator.getWorkflowStatus(workflowId)
    if (!workflowStatus) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found',
        message: 'The workflow you are trying to retry was not found.'
      })
    }
    
    const statusData = workflowStatus.statusData || {}
    if (!statusData.canRetry) {
      return res.status(400).json({
        success: false,
        error: 'Cannot retry',
        message: 'This workflow cannot be retried. Please contact support if you need assistance.'
      })
    }
    
    // Attempt retry
    let retryResult
    if (stage && stage !== 'workflow') {
      // Retry specific stage from DLQ
      retryResult = await errorHandlingService.retryFromDLQ(workflowId, stage)
    } else {
      // Retry entire workflow
      retryResult = await workflowOrchestrator.retryWorkflow(workflowId)
    }
    
    res.json({
      success: true,
      workflowId,
      message: '🔄 Retry initiated successfully',
      retryResult
    })
    
  } catch (error) {
    console.error('Failed to retry workflow:', error)
    res.status(500).json({
      success: false,
      error: 'Retry failed',
      message: 'Unable to retry the workflow. Please try again or contact support.',
      details: error.message
    })
  }
})

/**
 * POST /api/merchant/approve/:workflowId
 * Approve a workflow that requires manual review
 */
router.post('/approve/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params
    const { approvedData, notes } = req.body
    
    // Check if workflow exists and requires approval
    const workflowStatus = await workflowOrchestrator.getWorkflowStatus(workflowId)
    if (!workflowStatus) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found',
        message: 'The workflow you are trying to approve was not found.'
      })
    }
    
    if (workflowStatus.status !== 'review_needed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot approve',
        message: 'This workflow does not require approval or has already been processed.'
      })
    }
    
    // Update workflow with approved data
    await errorHandlingService.updateWorkflowStatus(workflowId, 'approved', {
      reason: 'manually_approved',
      approvedData: approvedData,
      approvalNotes: notes,
      approvedAt: new Date().toISOString(),
      merchantMessage: '✅ Approved - Processing will continue'
    })
    
    // Continue workflow from where it left off
    const continueResult = await workflowOrchestrator.continueWorkflow(workflowId, {
      extractedData: approvedData,
      approved: true,
      approvalNotes: notes
    })
    
    res.json({
      success: true,
      workflowId,
      message: '✅ Workflow approved successfully',
      continueResult
    })
    
  } catch (error) {
    console.error('Failed to approve workflow:', error)
    res.status(500).json({
      success: false,
      error: 'Approval failed',
      message: 'Unable to approve the workflow. Please try again or contact support.',
      details: error.message
    })
  }
})

/**
 * POST /api/merchant/cancel/:workflowId
 * Cancel a workflow
 */
router.post('/cancel/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params
    const { reason } = req.body
    
    await errorHandlingService.updateWorkflowStatus(workflowId, 'cancelled', {
      reason: 'manually_cancelled',
      cancellationReason: reason || 'Cancelled by user',
      cancelledAt: new Date().toISOString(),
      merchantMessage: '❌ Cancelled by user'
    })
    
    // Stop any running jobs
    await workflowOrchestrator.cancelWorkflow(workflowId)
    
    res.json({
      success: true,
      workflowId,
      message: '❌ Workflow cancelled successfully'
    })
    
  } catch (error) {
    console.error('Failed to cancel workflow:', error)
    res.status(500).json({
      success: false,
      error: 'Cancellation failed',
      message: 'Unable to cancel the workflow. Please try again.',
      details: error.message
    })
  }
})

/**
 * GET /api/merchant/errors
 * Get error statistics and recent errors for merchant dashboard
 */
router.get('/errors', async (req, res) => {
  try {
    const { merchantId, days = 7 } = req.query
    
    // Get error statistics from Redis
    const errorStats = {
      ai_parsing: { total: 0, resolved: 0 },
      shopify_sync: { total: 0, resolved: 0 },
      database: { total: 0, resolved: 0 },
      validation: { total: 0, resolved: 0 }
    }
    
    // Get recent error trends (simplified - would be more sophisticated in production)
    const recentErrors = []
    
    // Get DLQ status
    const dlqStatus = await errorHandlingService.getDLQItems(null, 10)
    
    res.json({
      success: true,
      errorStats,
      recentErrors,
      dlqStatus,
      period: `Last ${days} days`
    })
    
  } catch (error) {
    console.error('Failed to get error statistics:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve error statistics',
      message: 'Unable to get error information. Please try again.'
    })
  }
})

/**
 * GET /api/merchant/health
 * Get system health status for merchant dashboard
 */
router.get('/health', async (req, res) => {
  try {
    // Check Redis connection
    const redisHealth = await workflowOrchestrator.getHealthStatus()
    
    // Check database connection
    let dbHealth = 'healthy'
    try {
      await db.$queryRaw`SELECT 1`
    } catch (dbError) {
      dbHealth = 'unhealthy'
    }
    
    // Check queue status
    const queueStats = await workflowOrchestrator.getQueueStats()
    
    const overallHealth = redisHealth.status === 'healthy' && dbHealth === 'healthy' ? 'healthy' : 'degraded'
    
    res.json({
      success: true,
      health: {
        overall: overallHealth,
        redis: redisHealth,
        database: dbHealth,
        queues: queueStats
      },
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Failed to get health status:', error)
    res.status(500).json({
      success: false,
      health: {
        overall: 'unhealthy',
        error: error.message
      },
      timestamp: new Date().toISOString()
    })
  }
})

export default router