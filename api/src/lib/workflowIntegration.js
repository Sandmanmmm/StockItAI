/**
 * Workflow Integration Service
 * 
 * Integrates the WorkflowOrchestrator with existing upload and processing flow.
 * Replaces direct processing calls with orchestrated workflow stages.
 */

import { workflowOrchestrator } from './workflowOrchestrator.js'
import { fileParsingService } from './fileParsingService.js'
import { db } from './db.js'

export class WorkflowIntegrationService {
  constructor() {
    this.orchestrator = workflowOrchestrator
  }

  /**
   * Initialize the workflow system
   */
  async initialize() {
    await this.orchestrator.initialize()
  }

  /**
   * Process uploaded file through workflow orchestration
   * Replaces the old direct processing approach
   */
  async processUploadedFile(uploadData) {
    try {
      console.log(`🚀 Starting workflow processing for upload ${uploadData.uploadId}`)

      // Step 1: Parse the uploaded file first (synchronous)
      const parsedContent = await this.parseFile(uploadData)
      
      // Step 2: Start the workflow with parsed content
      const workflowData = {
        uploadId: uploadData.uploadId,
        fileName: uploadData.fileName,
        fileSize: uploadData.fileSize,
        mimeType: uploadData.mimeType,
        merchantId: uploadData.merchantId,
        supplierId: uploadData.supplierId,
        purchaseOrderId: uploadData.purchaseOrderId, // Pass through the original PO ID
        parsedContent: parsedContent.content,
        aiSettings: uploadData.aiSettings || {},
        metadata: {
          uploadedAt: new Date().toISOString(),
          originalFileName: uploadData.originalFileName,
          fileType: parsedContent.type
        }
      }

      const workflowId = await this.orchestrator.startWorkflow(workflowData)

      // Update upload record with workflow ID
      await this.updateUploadWithWorkflow(uploadData.uploadId, workflowId)

      return {
        success: true,
        workflowId,
        message: 'File processing started in background',
        estimatedCompletionTime: this.estimateCompletionTime()
      }

    } catch (error) {
      console.error('❌ Failed to start workflow for upload:', error)
      
      // Update upload status to failed
      await this.updateUploadStatus(uploadData.uploadId, 'failed', error.message)
      
      throw error
    }
  }

  /**
   * Parse file content (synchronous part of processing)
   */
  async parseFile(uploadData) {
    console.log(`📄 Parsing file: ${uploadData.fileName}`)
    console.log(`📝 Upload data:`, {
      uploadId: uploadData.uploadId,
      fileName: uploadData.fileName,
      mimeType: uploadData.mimeType,
      fileSize: uploadData.fileSize
    })
    
    try {
      // Update upload status to parsing
      await this.updateUploadStatus(uploadData.uploadId, 'parsing')
      
      const parsedContent = await fileParsingService.parseFile(
        uploadData.buffer,
        uploadData.mimeType,
        uploadData.fileName
      )

      // Update upload status to parsed
      await this.updateUploadStatus(uploadData.uploadId, 'parsed')
      
      return parsedContent

    } catch (error) {
      console.error('❌ File parsing failed:', error)
      await this.updateUploadStatus(uploadData.uploadId, 'parse_failed', error.message)
      throw error
    }
  }

  /**
   * Get workflow status for an upload
   */
  async getUploadWorkflowStatus(uploadId) {
    try {
      // Get upload record to find workflow ID
      const upload = await db.client.upload.findUnique({
        where: { id: uploadId }
      })

      if (!upload || !upload.workflowId) {
        return {
          status: 'processing',
          progress: 0,
          message: 'No workflow found for this upload'
        }
      }

      // Get workflow execution to find purchase order
      const workflowExecution = await db.client.workflowExecution.findUnique({
        where: { workflowId: upload.workflowId }
      })

      // Get purchase order if available
      let purchaseOrder = null
      if (workflowExecution?.purchaseOrderId) {
        purchaseOrder = await db.client.purchaseOrder.findUnique({
          where: { id: workflowExecution.purchaseOrderId }
        })
      }

      // Get workflow status from orchestrator
      const workflowStatus = await this.orchestrator.getWorkflowStatus(upload.workflowId)
      
      if (!workflowStatus) {
        return {
          status: 'processing',
          progress: 0,
          message: 'Workflow metadata not found',
          purchaseOrder: purchaseOrder || undefined
        }
      }

      // Map orchestrator status to frontend-expected format
      const progress = this.calculateWorkflowProgress(workflowStatus)
      let status = 'processing'
      
      // Check if workflow is completed or failed based on stages
      const stages = Object.values(workflowStatus.stages || {})
      const allCompleted = stages.length > 0 && stages.every(s => s.status === 'completed')
      const anyFailed = stages.some(s => s.status === 'failed')
      
      if (anyFailed) {
        status = 'failed'
      } else if (allCompleted) {
        status = 'completed'
      }

      return {
        status,
        progress,
        workflowId: upload.workflowId,
        currentStage: workflowStatus.status,
        stages: workflowStatus.stages,
        startedAt: workflowStatus.startedAt,
        updatedAt: workflowStatus.updatedAt,
        purchaseOrder: purchaseOrder || undefined,
        jobError: anyFailed ? stages.find(s => s.status === 'failed')?.error : undefined
      }

    } catch (error) {
      console.error('❌ Failed to get workflow status:', error)
      return {
        status: 'failed',
        progress: 0,
        jobError: error.message
      }
    }
  }

  /**
   * Calculate overall workflow progress percentage
   */
  calculateWorkflowProgress(workflowStatus) {
    // Filter out the special "processing" status stage - only count actual workflow stages
    const workflowStageNames = ['ai_parsing', 'database_save', 'shopify_sync', 'status_update']
    const stages = Object.entries(workflowStatus.stages)
      .filter(([stageName, _]) => workflowStageNames.includes(stageName))
      .map(([_, stageData]) => stageData)
    
    const totalStages = stages.length
    let completedStages = 0
    let currentProgress = 0

    stages.forEach(stage => {
      if (stage.status === 'completed') {
        completedStages++
      } else if (stage.status === 'processing' && stage.progress) {
        currentProgress = stage.progress / 100 // Convert to decimal
      }
    })

    const baseProgress = (completedStages / totalStages) * 100
    const stageProgress = currentProgress * (100 / totalStages)
    
    return Math.min(Math.round(baseProgress + stageProgress), 100)
  }

  /**
   * Get workflow progress for frontend polling
   */
  async getWorkflowProgress(workflowId) {
    try {
      const workflowStatus = await this.orchestrator.getWorkflowStatus(workflowId)
      
      if (!workflowStatus) {
        return { error: 'Workflow not found' }
      }

      return {
        workflowId,
        status: workflowStatus.status,
        progress: this.calculateWorkflowProgress(workflowStatus),
        currentStage: workflowStatus.status,
        stages: Object.entries(workflowStatus.stages).map(([stageName, stageData]) => ({
          name: stageName,
          status: stageData.status,
          startedAt: stageData.startedAt,
          completedAt: stageData.completedAt,
          progress: stageData.progress || 0,
          error: stageData.error
        })),
        estimatedTimeRemaining: this.estimateTimeRemaining(workflowStatus)
      }

    } catch (error) {
      console.error('❌ Failed to get workflow progress:', error)
      return { error: error.message }
    }
  }

  /**
   * Estimate completion time based on stage
   */
  estimateCompletionTime() {
    const now = new Date()
    const estimatedMinutes = 3 // Average processing time
    const completionTime = new Date(now.getTime() + (estimatedMinutes * 60 * 1000))
    
    return {
      estimatedMinutes,
      completionTime: completionTime.toISOString()
    }
  }

  /**
   * Estimate remaining time based on current progress
   */
  estimateTimeRemaining(workflowStatus) {
    const startTime = new Date(workflowStatus.startedAt).getTime()
    const currentTime = Date.now()
    const elapsed = currentTime - startTime
    
    const progress = this.calculateWorkflowProgress(workflowStatus)
    
    if (progress === 0) return null
    
    const totalEstimated = (elapsed / progress) * 100
    const remaining = totalEstimated - elapsed
    
    return {
      remainingMs: Math.max(remaining, 0),
      remainingMinutes: Math.max(Math.round(remaining / 60000), 0)
    }
  }

  /**
   * Update upload record with workflow ID
   */
  async updateUploadWithWorkflow(uploadId, workflowId) {
    await db.client.upload.update({
      where: { id: uploadId },
      data: {
        workflowId,
        status: 'processing',
        updatedAt: new Date()
      }
    })
  }

  /**
   * Update upload status
   */
  async updateUploadStatus(uploadId, status, errorMessage = null) {
    const updateData = {
      status,
      updatedAt: new Date()
    }

    if (errorMessage) {
      updateData.errorMessage = errorMessage
    }

    await db.client.upload.update({
      where: { id: uploadId },
      data: updateData
    })
  }

  /**
   * Get all active workflows with their status
   */
  async getActiveWorkflows(limit = 50) {
    try {
      // This would require implementing a Redis scan for workflow keys
      // For now, return orchestrator statistics
      const stats = this.orchestrator.getStatistics()
      
      return {
        activeWorkflows: stats.workflows.started - stats.workflows.completed - stats.workflows.failed,
        totalStarted: stats.workflows.started,
        totalCompleted: stats.workflows.completed,
        totalFailed: stats.workflows.failed,
        queueStatus: stats.queues
      }

    } catch (error) {
      console.error('❌ Failed to get active workflows:', error)
      return { error: error.message }
    }
  }

  /**
   * Retry failed workflow stage
   */
  async retryWorkflowStage(workflowId, stage) {
    try {
      console.log(`🔄 Retrying workflow ${workflowId} stage ${stage}`)
      
      const workflowStatus = await this.orchestrator.getWorkflowStatus(workflowId)
      
      if (!workflowStatus) {
        throw new Error('Workflow not found')
      }

      const stageData = workflowStatus.stages[stage]
      
      if (!stageData || stageData.status !== 'failed') {
        throw new Error(`Stage ${stage} is not in failed state`)
      }

      // Reset stage status
      await this.orchestrator.updateJobMetadata(workflowId, stage, 'pending')
      
      // Restart from the failed stage
      const jobType = this.orchestrator.getJobTypeForStage(stage)
      
      await this.orchestrator.addJobToQueue(jobType, {
        workflowId,
        stage,
        data: workflowStatus.data // Use original workflow data
      })

      return {
        success: true,
        message: `Stage ${stage} restarted`
      }

    } catch (error) {
      console.error('❌ Failed to retry workflow stage:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Cancel workflow
   */
  async cancelWorkflow(workflowId) {
    try {
      console.log(`❌ Cancelling workflow ${workflowId}`)
      
      await this.orchestrator.updateWorkflowStatus(workflowId, 'cancelled', {
        cancelledAt: new Date().toISOString()
      })

      return {
        success: true,
        message: 'Workflow cancelled'
      }

    } catch (error) {
      console.error('❌ Failed to cancel workflow:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Get orchestrator health status
   */
  async getHealthStatus() {
    try {
      const stats = this.orchestrator.getStatistics()
      
      return {
        healthy: this.orchestrator.isInitialized,
        queues: stats.queues.map(queue => ({
          ...queue,
          healthy: queue.active >= 0 && queue.failed < 10 // Simple health check
        })),
        statistics: stats,
        timestamp: new Date().toISOString()
      }

    } catch (error) {
      console.error('❌ Failed to get health status:', error)
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    await this.orchestrator.shutdown()
  }
}

// Export singleton instance
export const workflowIntegration = new WorkflowIntegrationService()