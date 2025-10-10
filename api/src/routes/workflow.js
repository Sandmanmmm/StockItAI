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
 * Trigger workflow processing for an upload
 * POST /api/workflow/trigger/:uploadId
 */
router.post('/trigger/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params
    
    console.log(`🚀 Workflow trigger requested for upload: ${uploadId}`)

    // Import here to avoid circular dependencies
  const { db } = await import('../lib/db.js')
    const { storageService } = await import('../lib/storageService.js')
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

    if (!upload.workflowId) {
      return res.status(400).json({
        success: false,
        error: 'No workflow associated with this upload'
      })
    }

    // Get workflow execution record
  const workflow = await prisma.workflowExecution.findUnique({
      where: { workflowId: upload.workflowId }
    })

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow record not found'
      })
    }

    // Don't re-trigger if already processing/completed
    if (workflow.status === 'processing' || workflow.status === 'completed') {
      return res.json({
        success: true,
        message: `Workflow already ${workflow.status}`,
        uploadId,
        workflowId: upload.workflowId,
        status: workflow.status
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
      message: 'Workflow processing triggered',
      uploadId,
      workflowId: upload.workflowId
    })

    // Start processing in background (after response is sent)
    setImmediate(async () => {
      try {
        console.log(`📝 Starting background workflow for upload ${uploadId}`)
        
        const result = await workflowIntegration.processUploadedFile(workflowData)
        
        console.log(`✅ Workflow processing started: ${result.workflowId}`)
        
      } catch (error) {
        console.error(`❌ Background workflow failed for upload ${uploadId}:`, error)
        
        // Update workflow status to failed
        try {
          await prisma.workflowExecution.update({
            where: { workflowId: upload.workflowId },
            data: {
              status: 'failed',
              errorMessage: error.message,
              failedStage: 'initialization'
            }
          })

          await prisma.upload.update({
            where: { id: uploadId },
            data: {
              status: 'failed',
              errorMessage: error.message
            }
          })
        } catch (updateError) {
          console.error('Failed to update error status:', updateError)
        }
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

/**
 * Get workflow progress by workflow ID
 * GET /api/workflow/:workflowId/progress
 */
router.get('/:workflowId/progress', async (req, res) => {
  try {
    const { workflowId} = req.params
    
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