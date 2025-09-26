/**
 * Workflow API Routes
 * 
 * Provides REST endpoints for workflow management and monitoring
 */

import express from 'express'
import { workflowIntegration } from '../lib/workflowIntegration.js'
import { workflowOrchestrator } from '../lib/workflowOrchestrator.js'

const router = express.Router()

/**
 * Get workflow status for a specific upload
 * GET /api/workflow/upload/:uploadId/status
 */
router.get('/upload/:uploadId/status', async (req, res) => {
  try {
    const { uploadId } = req.params
    
    const status = await workflowIntegration.getUploadWorkflowStatus(uploadId)
    
    res.json({
      success: true,
      upload: uploadId,
      workflow: status
    })

  } catch (error) {
    console.error('❌ Failed to get upload workflow status:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * Get workflow progress by workflow ID
 * GET /api/workflow/:workflowId/progress
 */
router.get('/:workflowId/progress', async (req, res) => {
  try {
    const { workflowId } = req.params
    
    const progress = await workflowIntegration.getWorkflowProgress(workflowId)
    
    if (progress.error) {
      return res.status(404).json({
        success: false,
        error: progress.error
      })
    }
    
    res.json({
      success: true,
      progress
    })

  } catch (error) {
    console.error('❌ Failed to get workflow progress:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * Get detailed workflow status
 * GET /api/workflow/:workflowId/status
 */
router.get('/:workflowId/status', async (req, res) => {
  try {
    const { workflowId } = req.params
    
    const status = await workflowOrchestrator.getWorkflowStatus(workflowId)
    
    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      })
    }
    
    res.json({
      success: true,
      workflow: status
    })

  } catch (error) {
    console.error('❌ Failed to get workflow status:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * Get all active workflows
 * GET /api/workflow/active
 */
router.get('/active', async (req, res) => {
  try {
    const { limit = 50 } = req.query
    
    const activeWorkflows = await workflowIntegration.getActiveWorkflows(parseInt(limit))
    
    res.json({
      success: true,
      workflows: activeWorkflows
    })

  } catch (error) {
    console.error('❌ Failed to get active workflows:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * Retry a failed workflow stage
 * POST /api/workflow/:workflowId/retry/:stage
 */
router.post('/:workflowId/retry/:stage', async (req, res) => {
  try {
    const { workflowId, stage } = req.params
    
    const result = await workflowIntegration.retryWorkflowStage(workflowId, stage)
    
    if (!result.success) {
      return res.status(400).json(result)
    }
    
    res.json(result)

  } catch (error) {
    console.error('❌ Failed to retry workflow stage:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * Cancel a workflow
 * POST /api/workflow/:workflowId/cancel
 */
router.post('/:workflowId/cancel', async (req, res) => {
  try {
    const { workflowId } = req.params
    
    const result = await workflowIntegration.cancelWorkflow(workflowId)
    
    if (!result.success) {
      return res.status(400).json(result)
    }
    
    res.json(result)

  } catch (error) {
    console.error('❌ Failed to cancel workflow:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * Get orchestrator statistics
 * GET /api/workflow/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = workflowOrchestrator.getStatistics()
    
    res.json({
      success: true,
      statistics: stats,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Failed to get workflow statistics:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * Get system health status
 * GET /api/workflow/health
 */
router.get('/health', async (req, res) => {
  try {
    const health = await workflowIntegration.getHealthStatus()
    
    const httpStatus = health.healthy ? 200 : 503
    
    res.status(httpStatus).json({
      success: health.healthy,
      health
    })

  } catch (error) {
    console.error('❌ Failed to get health status:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * Cleanup old workflows (admin endpoint)
 * POST /api/workflow/cleanup
 */
router.post('/cleanup', async (req, res) => {
  try {
    const { olderThanHours = 24 } = req.body
    
    await workflowOrchestrator.cleanup(olderThanHours)
    
    res.json({
      success: true,
      message: `Cleanup initiated for workflows older than ${olderThanHours} hours`
    })

  } catch (error) {
    console.error('❌ Failed to cleanup workflows:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * WebSocket endpoint for real-time workflow updates
 * This would be implemented if WebSocket support is needed
 */
router.get('/realtime/:workflowId', async (req, res) => {
  res.json({
    success: false,
    message: 'WebSocket endpoint not implemented yet',
    suggestion: 'Use polling on /progress endpoint for now'
  })
})

export default router