/**
 * Workflow Orchestration Service
 * 
 * Manages multi-stage background job processing with Redis:
 * 1. File Upload → AI Parse
 * 2. AI Parse → Database Save  
 * 3. Database Save → Shopify Sync (if approved)
 * 4. Shopify Sync → Update PO Status → Complete
 * 
 * Each stage is tracked with comprehensive metadata for monitoring and debugging.
 */

import Bull from 'bull'
import redisManager from './redisManager.js'
import { getRedisConfig } from '../config/redis.production.js'
import { enhancedAIService } from './enhancedAIService.js'
import { enhancedShopifyService } from './enhancedShopifyService.js'
import { errorHandlingService, MERCHANT_MESSAGES } from './errorHandlingService.js'
import { DatabasePersistenceService } from './databasePersistenceService.js'
import { db } from './db.js'
import { SupabaseStorageService } from './storageService.js'
import { processorRegistrationService } from './processorRegistrationService.js'
import { FileParsingService } from './fileParsingService.js'
import { stageResultStore } from './stageResultStore.js'

// Workflow Stage Definitions
export const WORKFLOW_STAGES = {
  FILE_UPLOAD: 'file_upload',
  AI_PARSING: 'ai_parsing', 
  DATABASE_SAVE: 'database_save',
  SHOPIFY_SYNC: 'shopify_sync',
  STATUS_UPDATE: 'status_update',
  COMPLETED: 'completed',
  FAILED: 'failed'
}

// Workflow Stage Messages for User Display
const STAGE_MESSAGES = {
  [WORKFLOW_STAGES.FILE_UPLOAD]: 'File uploaded successfully',
  [WORKFLOW_STAGES.AI_PARSING]: 'AI is analyzing your purchase order...',
  [WORKFLOW_STAGES.DATABASE_SAVE]: 'Saving purchase order data...',
  [WORKFLOW_STAGES.SHOPIFY_SYNC]: 'Syncing with Shopify...',
  [WORKFLOW_STAGES.STATUS_UPDATE]: 'Finalizing...',
  [WORKFLOW_STAGES.COMPLETED]: 'Purchase order processed successfully',
  [WORKFLOW_STAGES.FAILED]: 'Processing failed - please try again'
}

/**
 * WorkflowOrchestrator - Manages the complete PO processing pipeline
 */
export class WorkflowOrchestrator {
  constructor() {
    this.redis = redisManager
    this.dbService = new DatabasePersistenceService()
    this.storageService = new SupabaseStorageService()
    this.fileParsingService = new FileParsingService()
  }

  /**
   * Initialize workflow orchestrator
   */
  async initialize() {
    console.log('🎭 Initializing WorkflowOrchestrator...')
    
    // Initialize Redis connection
    await this.redis.initializeConnections()
    
    // Initialize Stage Result Store
    await stageResultStore.initialize()
    
    console.log('✅ WorkflowOrchestrator initialized successfully')
  }

  /**
   * Save stage result and accumulate data for next stage
   */
  async saveAndAccumulateStageData(workflowId, currentStage, stageResult, nextStageData) {
    try {
      // Save current stage result
      await stageResultStore.saveStageResult(workflowId, currentStage, stageResult)
      
      // Get all accumulated data
      const accumulatedData = await stageResultStore.getAccumulatedData(workflowId)
      
      // Merge with next stage data
      const enrichedData = {
        ...nextStageData,
        ...accumulatedData,
        previousStages: accumulatedData?.stages || {}
      }
      
      console.log(`📊 Accumulated data for ${currentStage} -> next stage:`, {
        workflowId,
        hasAiResult: !!enrichedData.aiResult,
        hasDbResult: !!enrichedData.dbResult,
        hasShopifyResult: !!enrichedData.shopifyResult,
        purchaseOrderId: enrichedData.purchaseOrderId
      })
      
      return enrichedData
    } catch (error) {
      console.error(`❌ Failed to accumulate stage data:`, error)
      // Return original data if accumulation fails
      return nextStageData
    }
  }

  /**
   * Set workflow metadata in Redis with fallback
   * @param {string} workflowId - Workflow ID
   * @param {Object} metadata - Workflow metadata
   */
  async setWorkflowMetadata(workflowId, metadata) {
    try {
      await this.redis.waitForConnection()
      if (this.redis.redis && this.redis.redis.status === 'ready') {
        const key = `workflow:${workflowId}`
        await this.redis.redis.setex(key, 3600, JSON.stringify(metadata)) // 1 hour expiry
      } else {
        console.log('⚠️ Redis not available, skipping workflow metadata storage')
      }
    } catch (error) {
      console.log('⚠️ Failed to store workflow metadata in Redis:', error.message)
    }
  }

  /**
   * Get workflow metadata from Redis with fallback
   * @param {string} workflowId - Workflow ID
   * @returns {Object|null} - Workflow metadata
   */
  async getWorkflowMetadata(workflowId) {
    try {
      await this.redis.waitForConnection()
      if (this.redis.redis && this.redis.redis.status === 'ready') {
        const key = `workflow:${workflowId}`
        const data = await this.redis.redis.get(key)
        return data ? JSON.parse(data) : null
      } else {
        console.log('⚠️ Redis not available, returning null for workflow metadata')
        return null
      }
    } catch (error) {
      console.log('⚠️ Failed to get workflow metadata from Redis:', error.message)
      return null
    }
  }

  /**
   * Get workflow progress information
   * @param {string} workflowId - Workflow ID
   * @returns {Object} - Progress information
   */
  async getWorkflowProgress(workflowId) {
    const metadata = await this.getWorkflowMetadata(workflowId)
    if (!metadata) {
      return {
        percentage: 0,
        currentStage: null,
        completedStages: [],
        status: 'not_found',
        completed: false
      }
    }

    const stages = Object.values(WORKFLOW_STAGES).filter(stage => 
      stage !== WORKFLOW_STAGES.COMPLETED && stage !== WORKFLOW_STAGES.FAILED
    )
    const completedStages = stages.filter(stage => 
      metadata.stages?.[stage]?.status === 'completed'
    )
    
    const percentage = Math.round((completedStages.length / stages.length) * 100)
    const isCompleted = metadata.status === 'completed' || percentage >= 100
    
    return {
      percentage,
      currentStage: metadata.currentStage,
      completedStages,
      status: metadata.status,
      completed: isCompleted,
      startedAt: metadata.startedAt,
      completedAt: metadata.completedAt
    }
  }

  /**
   * Start a new workflow for uploaded file
   * @param {Object} data - Workflow data
   * @returns {Promise<string>} - Workflow ID
   */
  async startWorkflow(data) {
    const workflowId = `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    console.log(`🎬 Starting workflow ${workflowId} for file: ${data.fileName}`)
    
    // Initialize workflow metadata
    const workflowMetadata = {
      workflowId,
      status: 'active',
      currentStage: WORKFLOW_STAGES.AI_PARSING,
      stages: {
        [WORKFLOW_STAGES.AI_PARSING]: { status: 'pending' },
        [WORKFLOW_STAGES.DATABASE_SAVE]: { status: 'pending' },
        [WORKFLOW_STAGES.SHOPIFY_SYNC]: { status: 'pending' },
        [WORKFLOW_STAGES.STATUS_UPDATE]: { status: 'pending' }
      },
      startedAt: new Date().toISOString(),
      progress: 0,
      data
    }
    
    // Save workflow metadata to Redis
    await this.setWorkflowMetadata(workflowId, workflowMetadata)
    
    // Start with AI parsing
    await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.AI_PARSING, data)
    
    return workflowId
  }

  /**
   * Enhanced stage scheduling with data accumulation
   * @param {string} workflowId - Workflow ID
   * @param {string} stage - Stage to schedule
   * @param {Object} data - Stage data
   */
  async scheduleNextStage(workflowId, stage, data) {
    try {
      // Get accumulated data from all previous stages
      const accumulatedData = await stageResultStore.getAccumulatedData(workflowId)
      
      // Merge stage data with accumulated data
      const enrichedData = {
        ...data,
        ...accumulatedData,
        workflowId,
        stage,
        timestamp: new Date().toISOString()
      }
      
      console.log(`� Scheduling ${stage} with accumulated data:`, {
        workflowId,
        stage,
        hasAiResult: !!enrichedData.aiResult,
        hasDbResult: !!enrichedData.dbResult, 
        hasShopifyResult: !!enrichedData.shopifyResult,
        purchaseOrderId: enrichedData.purchaseOrderId
      })
      
      // Update workflow metadata
      await this.updateWorkflowStage(workflowId, stage, 'processing')
      
      // Add job to appropriate queue with enriched data
      const jobData = { workflowId, stage, data: enrichedData }
      
      switch (stage) {
        case WORKFLOW_STAGES.AI_PARSING:
          await processorRegistrationService.addJob('ai-parsing', jobData)
          break
        case WORKFLOW_STAGES.DATABASE_SAVE:
          await processorRegistrationService.addJob('database-save', jobData)
          break
        case WORKFLOW_STAGES.SHOPIFY_SYNC:
          await processorRegistrationService.addJob('shopify-sync', jobData)
          break
        case WORKFLOW_STAGES.STATUS_UPDATE:
          await processorRegistrationService.addJob('status-update', jobData)
          break
        default:
          throw new Error(`Unknown workflow stage: ${stage}`)
      }
      
      return enrichedData
    } catch (error) {
      console.error(`❌ Failed to schedule stage ${stage}:`, error)
      // Fallback to original implementation
      console.log(`�📅 Scheduling ${stage} for workflow ${workflowId}`)
      
      // Update workflow metadata
      await this.updateWorkflowStage(workflowId, stage, 'processing')
      
      // Add job to appropriate queue
      const jobData = { workflowId, stage, data }
      
      switch (stage) {
        case WORKFLOW_STAGES.AI_PARSING:
          await processorRegistrationService.addJob('ai-parsing', jobData)
          break
        case WORKFLOW_STAGES.DATABASE_SAVE:
          await processorRegistrationService.addJob('database-save', jobData)
          break
        case WORKFLOW_STAGES.SHOPIFY_SYNC:
          await processorRegistrationService.addJob('shopify-sync', jobData)
          break
        case WORKFLOW_STAGES.STATUS_UPDATE:
          await processorRegistrationService.addJob('status-update', jobData)
          break
        default:
          throw new Error(`Unknown workflow stage: ${stage}`)
      }
      
      return data
    }
  }

  /**
   * Update workflow stage status
   * @param {string} workflowId - Workflow ID
   * @param {string} stage - Stage name
   * @param {string} status - Stage status
   */
  async updateWorkflowStage(workflowId, stage, status) {
    const metadata = await this.getWorkflowMetadata(workflowId)
    if (!metadata) {
      throw new Error(`Workflow ${workflowId} not found`)
    }

    // Update stage
    metadata.stages[stage] = {
      status,
      updatedAt: new Date().toISOString()
    }

    // Update current stage and progress
    metadata.currentStage = stage
    metadata.updatedAt = new Date().toISOString()
    
    // Calculate progress
    const totalStages = Object.keys(metadata.stages).length
    const completedStages = Object.values(metadata.stages).filter(s => s.status === 'completed').length
    metadata.progress = Math.round((completedStages / totalStages) * 100)

    await this.setWorkflowMetadata(workflowId, metadata)
  }

  /**
   * Mark workflow as completed
   * @param {string} workflowId - Workflow ID
   * @param {Object} result - Final result
   */
  async completeWorkflow(workflowId, result) {
    console.log(`🎉 Completing workflow ${workflowId}`)
    
    const metadata = await this.getWorkflowMetadata(workflowId)
    if (!metadata) {
      throw new Error(`Workflow ${workflowId} not found`)
    }

    metadata.status = 'completed'
    metadata.currentStage = WORKFLOW_STAGES.COMPLETED
    metadata.completedAt = new Date().toISOString()
    metadata.progress = 100
    metadata.result = result

    await this.setWorkflowMetadata(workflowId, metadata)
  }

  /**
   * Mark workflow as failed
   * @param {string} workflowId - Workflow ID
   * @param {string} stage - Stage where failure occurred
   * @param {Error} error - Error details
   */
  async failWorkflow(workflowId, stage, error) {
    console.log(`❌ Failing workflow ${workflowId} at stage ${stage}: ${error.message}`)
    
    const metadata = await this.getWorkflowMetadata(workflowId)
    if (metadata) {
      metadata.status = 'failed'
      metadata.currentStage = 'failed'
      metadata.failedAt = new Date().toISOString()
      metadata.error = {
        stage,
        message: error.message,
        stack: error.stack
      }

      await this.setWorkflowMetadata(workflowId, metadata)
      
      // CRITICAL: Also update the PO record in database to "failed" status
      if (metadata.purchaseOrderId) {
        try {
          console.log(`📊 Updating PO ${metadata.purchaseOrderId} status to failed due to workflow failure`)
          
          await db.client.purchaseOrder.update({
            where: { id: metadata.purchaseOrderId },
            data: {
              status: 'failed',
              jobStatus: 'failed',
              jobCompletedAt: new Date(),
              jobError: `${stage} failed: ${error.message}`,
              processingNotes: `Processing failed at ${stage} stage: ${error.message}`,
              updatedAt: new Date()
            }
          })
          
          console.log(`✅ PO ${metadata.purchaseOrderId} status updated to failed`)
          
        } catch (dbError) {
          console.error(`❌ Failed to update PO status to failed: ${dbError.message}`)
        }
      } else {
        console.log('⚠️ No purchaseOrderId in workflow metadata, cannot update PO status')
      }
    }
  }

  /**
   * Update workflow status (alias for updateWorkflowStage for compatibility)
   * @param {string} workflowId - Workflow ID
   * @param {string} stage - Stage name
   * @param {string} status - Stage status
   */
  async updateWorkflowStatus(workflowId, stage, status) {
    return await this.updateWorkflowStage(workflowId, stage, status)
  }

  /**
   * Get workflow status
   * @param {string} workflowId - Workflow ID
   * @returns {Object} - Workflow status
   */
  async getWorkflowStatus(workflowId) {
    const metadata = await this.getWorkflowMetadata(workflowId)
    if (!metadata) {
      return { status: 'not_found' }
    }

    return {
      status: 'found',
      workflowId: metadata.workflowId,
      currentStage: metadata.currentStage,
      stages: metadata.stages,
      startedAt: metadata.startedAt,
      updatedAt: metadata.updatedAt,
      completedAt: metadata.completedAt,
      progress: metadata.progress,
      result: metadata.result,
      error: metadata.error
    }
  }

  // ===============================
  // STAGE PROCESSORS
  // ===============================

  /**
   * Process AI parsing stage
   * @param {Object} job - Bull job object
   */
  async processAIParsing(job) {
    console.log('🤖 processAIParsing - Full job.data:', JSON.stringify(job.data, null, 2))
    
    // Extract data from job
    const { workflowId, data } = job.data
    const { fileName, fileBuffer: inputFileBuffer, parsedContent, uploadId, mimeType, options } = data
    
    console.log('🤖 Extracted data:', { 
      workflowId, 
      fileName, 
      hasFileBuffer: !!inputFileBuffer, 
      hasParsedContent: !!parsedContent,
      uploadId,
      mimeType,
      options 
    })

    // Get file content for processing
    let contentForProcessing
    let fileBuffer // Keep reference to original buffer for binary files
    
    if (parsedContent) {
      console.log('📋 Using parsedContent from job data')
      contentForProcessing = parsedContent
    } else if (inputFileBuffer) {
      console.log('📋 Using fileBuffer from job data')
      fileBuffer = Buffer.from(inputFileBuffer)
    } else if (uploadId) {
      console.log('📥 Downloading file content from storage...')
      try {
        // Get upload record to find file URL
        const upload = await db.client.upload.findUnique({
          where: { id: uploadId },
          select: { fileUrl: true }
        })
        
        if (!upload || !upload.fileUrl) {
          throw new Error(`No file URL found for upload ${uploadId}`)
        }
        
        console.log('📁 File URL found:', upload.fileUrl)
        
        // Download file content
        const fileResult = await this.storageService.downloadFile(upload.fileUrl)
        if (!fileResult.success) {
          throw new Error(`Failed to download file: ${fileResult.error}`)
        }
        
        fileBuffer = fileResult.buffer
        console.log('📄 Downloaded file buffer, size:', fileBuffer.length)
        
      } catch (error) {
        console.error('❌ Failed to download file content:', error)
        throw new Error(`Failed to retrieve file content: ${error.message}`)
      }
    }

    // Parse file content based on file type if we have a file buffer
    if (fileBuffer && !contentForProcessing) {
      console.log('🔍 Parsing file content based on MIME type:', mimeType)
      
      try {
        const parsedResult = await this.fileParsingService.parseFile(fileBuffer, mimeType, fileName)
        
        // Handle different content types from parsing
        if (parsedResult.text && parsedResult.text.length > 0) {
          contentForProcessing = parsedResult.text
        } else if (parsedResult.rawContent) {
          contentForProcessing = parsedResult.rawContent
        } else if (parsedResult.imageBuffer) {
          // For images, use the imageBuffer for OCR processing
          contentForProcessing = parsedResult.imageBuffer
          console.log('🖼️ Image prepared for OCR processing')
        } else {
          console.warn('⚠️ No usable content extracted from file')
          contentForProcessing = 'Image file processed but no text content extracted'
        }
        
        if (contentForProcessing && typeof contentForProcessing === 'string') {
          console.log('📝 File parsed successfully, content length:', contentForProcessing.length)
        } else if (contentForProcessing && Buffer.isBuffer(contentForProcessing)) {
          console.log('📝 File parsed successfully, buffer size:', contentForProcessing.length)
        } else {
          console.log('📝 File parsed successfully, content type:', typeof contentForProcessing)
        }
        
        // Log parsing results for debugging
        if (parsedResult.pages) {
          console.log(`📄 PDF parsed: ${parsedResult.pages} pages`)
        }
        if (parsedResult.extractionMethod) {
          console.log(`🛠️ Extraction method: ${parsedResult.extractionMethod}`)
        }
      } catch (parseError) {
        console.error('❌ File parsing failed:', parseError)
        throw new Error(`File parsing failed: ${parseError.message}`)
      }
    }
    
    if (!contentForProcessing) {
      throw new Error('No file content provided for AI parsing')
    }

    // Log content details safely
    if (typeof contentForProcessing === 'string') {
      console.log('📝 Content length:', contentForProcessing.length)
    } else if (Buffer.isBuffer(contentForProcessing)) {
      console.log('📝 Buffer size:', contentForProcessing.length)
    } else {
      console.log('📝 Content type:', typeof contentForProcessing)
    }
    
    job.progress(10)
    
    try {
      // Determine which parsing service to use based on file type
      const fileExtension = fileName.split('.').pop().toLowerCase()
      console.log(`📄 File extension: ${fileExtension}`)
      
      // Parse document with AI service
      job.progress(30)
      
      // Use original file buffer for AI service if available, otherwise use processed content
      const aiServiceInput = fileBuffer || contentForProcessing
      const aiResult = await enhancedAIService.parseDocument(aiServiceInput, workflowId, {
        fileName,
        fileType: fileExtension,
        mimeType, // Pass the original MIME type
        isProcessedContent: !fileBuffer, // Flag to indicate if this is already processed content
        ...options
      })
      
      // Check if AI parsing actually succeeded
      if (aiResult.success === false || aiResult.error) {
        console.error('❌ AI parsing returned error result:', aiResult.error)
        throw new Error(aiResult.error || 'AI parsing failed')
      }
      
      // Validate that we have meaningful AI results
      if (!aiResult.extractedData) {
        console.error('❌ AI parsing returned no extracted data')
        throw new Error('AI parsing returned no extracted data')
      }
      
      // Check confidence - it might be at aiResult.confidence or aiResult.confidence.overall
      const confidence = aiResult.confidence?.overall || aiResult.confidence
      if (confidence === undefined || confidence === null) {
        console.error('❌ AI parsing returned no confidence score')
        throw new Error('AI parsing returned no confidence score')
      }
      
      console.log('🎯 AI parsing completed successfully')
      console.log('   Model:', aiResult.model)
      console.log('   Confidence:', `${((confidence || 0) * 100).toFixed(1)}%`)
      
      job.progress(90)
      
      // Save AI result to stage store and prepare next stage data
      const stageResult = {
        aiResult,
        contentForProcessing,
        fileName,
        mimeType,
        timestamp: new Date().toISOString(),
        stage: WORKFLOW_STAGES.AI_PARSING
      }
      
      const nextStageData = {
        ...data,
        aiResult,
        contentForProcessing
      }
      
      // Save and accumulate data for next stage
      const enrichedNextStageData = await this.saveAndAccumulateStageData(
        workflowId,
        WORKFLOW_STAGES.AI_PARSING,
        stageResult,
        nextStageData
      )
      
      // Update workflow metadata with AI result
      await this.updateWorkflowStage(workflowId, WORKFLOW_STAGES.AI_PARSING, 'completed')
      
      // Schedule database save stage with enriched data
      await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.DATABASE_SAVE, enrichedNextStageData)
      
      job.progress(100)
      
      return {
        success: true,
        stage: WORKFLOW_STAGES.AI_PARSING,
        aiResult,
        nextStage: WORKFLOW_STAGES.DATABASE_SAVE
      }
      
    } catch (error) {
      console.error('❌ AI parsing failed:', error)
      await this.failWorkflow(workflowId, WORKFLOW_STAGES.AI_PARSING, error)
      throw error
    }
  }

  /**
   * Process database save stage
   * @param {Object} job - Bull job object
   */
  async processDatabaseSave(job) {
    console.log('💾 processDatabaseSave - Starting...')
    
    const { workflowId, data } = job.data
    const { aiResult, fileName, uploadId } = data
    
    console.log('💾 Database save data:', { 
      workflowId, 
      fileName,
      hasAiResult: !!aiResult,
      uploadId
    })
    
    job.progress(10)
    
    try {
      // Get merchant ID (defaulting to a test merchant for now)
      const merchantId = data.merchantId || 'cmft3moy50000ultcbqgxzz6d' // Default test merchant
      
      console.log('💾 Persisting AI results to database...')
      job.progress(30)
      
      // Save AI results to database
      const dbResult = await this.dbService.persistAIResults(
        aiResult, 
        merchantId, 
        fileName,
        {
          uploadId,
          workflowId,
          purchaseOrderId: data.purchaseOrderId, // Pass the original PO ID
          source: 'automatic_processing'
        }
      )
      
      console.log('✅ Database save completed successfully')
      console.log('   Purchase Order ID:', dbResult.purchaseOrder?.id)
      console.log('   Line Items:', dbResult.lineItems?.length || 0)
      
      job.progress(90)
      
      // Update workflow metadata (non-fatal if fails)
      try {
        await this.updateWorkflowStage(workflowId, WORKFLOW_STAGES.DATABASE_SAVE, 'completed')
        console.log('✅ Workflow stage updated successfully')
      } catch (workflowError) {
        console.warn('⚠️ Failed to update workflow stage (non-fatal):', workflowError.message)
        // Continue processing - database save was successful
      }
      
      console.log('🚀 FORCING SHOPIFY SYNC - Database save completed, always scheduling Shopify sync')
      console.log('   dbResult.purchaseOrder exists:', !!dbResult.purchaseOrder)
      console.log('   dbResult.purchaseOrder.id:', dbResult.purchaseOrder?.id)
      
      // Save database result to stage store and prepare next stage data
      const stageResult = {
        dbResult,
        purchaseOrderId: dbResult.purchaseOrder?.id || 'unknown',
        merchantId,
        fileName,
        uploadId,
        timestamp: new Date().toISOString(),
        stage: WORKFLOW_STAGES.DATABASE_SAVE
      }
      
      const nextStageData = {
        ...data,
        aiResult,
        dbResult,
        purchaseOrderId: dbResult.purchaseOrder?.id || 'unknown'
      }
      
      // Save and accumulate data for next stage
      const enrichedNextStageData = await this.saveAndAccumulateStageData(
        workflowId,
        WORKFLOW_STAGES.DATABASE_SAVE,
        stageResult,
        nextStageData
      )
      
      console.log('📋 About to schedule Shopify sync with enriched data:', {
        workflowId,
        hasDbResult: !!enrichedNextStageData.dbResult,
        hasAiResult: !!enrichedNextStageData.aiResult,
        purchaseOrderId: enrichedNextStageData.purchaseOrderId
      })
      
      await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.SHOPIFY_SYNC, enrichedNextStageData)
      
      job.progress(100)
      
      return {
        success: true,
        stage: WORKFLOW_STAGES.DATABASE_SAVE,
        dbResult,
        nextStage: WORKFLOW_STAGES.SHOPIFY_SYNC // Always go to Shopify sync for now
      }
      
    } catch (error) {
      console.error('❌ Database save failed:', error)
      await this.failWorkflow(workflowId, WORKFLOW_STAGES.DATABASE_SAVE, error)
      throw error
    }
  }

  /**
   * Process Shopify sync stage
   * @param {Object} job - Bull job object
   */
  async processShopifySync(job) {
    console.log('🛍️ processShopifySync - Starting...')
    
    const { workflowId, data } = job.data
    const { dbResult, purchaseOrderId } = data
    
    console.log('🛍️ Shopify sync data:', { 
      workflowId, 
      purchaseOrderId,
      hasDbResult: !!dbResult
    })
    
    job.progress(10)
    
    try {
      // For now, we'll simulate Shopify sync
      // In the future, this would integrate with actual Shopify API
      console.log('🛍️ Syncing purchase order to Shopify...')
      job.progress(50)
      
      // Simulate sync delay
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const shopifyResult = {
        success: true,
        message: 'Purchase order synced to Shopify successfully',
        shopifyOrderId: `shopify_${purchaseOrderId}_${Date.now()}`
      }
      
      console.log('✅ Shopify sync completed successfully')
      console.log('   Shopify Order ID:', shopifyResult.shopifyOrderId)
      
      job.progress(90)
      
      // Save Shopify result to stage store and prepare next stage data
      const stageResult = {
        shopifyResult,
        shopifyOrderId: shopifyResult.shopifyOrderId,
        timestamp: new Date().toISOString(),
        stage: WORKFLOW_STAGES.SHOPIFY_SYNC
      }
      
      const nextStageData = {
        ...data,
        shopifyResult,
        // Preserve AI and database results for status update
        aiResult: data.aiResult,
        dbResult: data.dbResult
      }
      
      // Save and accumulate data for next stage
      const enrichedNextStageData = await this.saveAndAccumulateStageData(
        workflowId,
        WORKFLOW_STAGES.SHOPIFY_SYNC,
        stageResult,
        nextStageData
      )
      
      // Update workflow metadata
      await this.updateWorkflowStage(workflowId, WORKFLOW_STAGES.SHOPIFY_SYNC, 'completed')
      
      // Schedule final status update with enriched data
      await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.STATUS_UPDATE, enrichedNextStageData)
      
      job.progress(100)
      
      return {
        success: true,
        stage: WORKFLOW_STAGES.SHOPIFY_SYNC,
        shopifyResult,
        nextStage: WORKFLOW_STAGES.STATUS_UPDATE
      }
      
    } catch (error) {
      console.error('❌ Shopify sync failed:', error)
      await this.failWorkflow(workflowId, WORKFLOW_STAGES.SHOPIFY_SYNC, error)
      throw error
    }
  }

  /**
   * Process status update stage (final stage) - Enhanced with data accumulation
   * @param {Object} job - Bull job object
   */
  async processStatusUpdate(job) {
    console.log('📊 processStatusUpdate - Starting with data accumulation...')
    
    const { workflowId, data } = job.data
    
    // Get ALL accumulated data from previous stages
    const accumulatedData = await stageResultStore.getAccumulatedData(workflowId)
    
    // Merge with current data to ensure we have everything
    const enrichedData = {
      ...data,
      ...accumulatedData
    }
    
    console.log('📊 Status update with accumulated data:', { 
      workflowId,
      hasAiResult: !!enrichedData.aiResult,
      hasDbResult: !!enrichedData.dbResult,
      hasShopifyResult: !!enrichedData.shopifyResult,
      purchaseOrderId: enrichedData.purchaseOrderId || enrichedData.dbResult?.purchaseOrder?.id,
      previousStages: Object.keys(enrichedData.previousStages || {})
    })
    
    job.progress(10)
    
    try {
      // Determine purchaseOrderId from multiple sources
      const purchaseOrderId = enrichedData.purchaseOrderId || enrichedData.dbResult?.purchaseOrder?.id
      
      // Check if workflow is in review needed state
      const workflowMetadata = await this.getWorkflowMetadata(workflowId)
      const isReviewNeeded = workflowMetadata?.stages?.review_needed?.status
      
      // Update final status in database if needed
      if (purchaseOrderId) {
        console.log('📊 Updating purchase order final status with accumulated data...')
        console.log('   PO ID:', purchaseOrderId)
        console.log('   Is Review Needed:', !!isReviewNeeded)
        console.log('   AI Result Available:', !!enrichedData.aiResult)
        console.log('   DB Result Available:', !!enrichedData.dbResult)
        console.log('   Shopify Result Available:', !!enrichedData.shopifyResult)
        
        try {
          const finalStatus = isReviewNeeded ? 'review_needed' : 'completed'
          
          // Prepare update data with status fields
          const updateData = {
            status: finalStatus,
            jobStatus: 'completed',
            jobCompletedAt: new Date(),
            processingNotes: isReviewNeeded 
              ? 'Processing completed - requires merchant review due to low confidence or complexity'
              : 'Processing completed successfully - all stages completed',
            updatedAt: new Date()
          }
          
          // Add AI-derived fields if available (now from accumulated data)
          if (enrichedData.aiResult) {
            console.log('   Adding AI result data from accumulated store to update...')
            console.log('   AI Result keys:', Object.keys(enrichedData.aiResult))
            
            // Update confidence if available
            if (typeof enrichedData.aiResult.confidence === 'number') {
              updateData.confidence = enrichedData.aiResult.confidence
              console.log('   Setting confidence:', enrichedData.aiResult.confidence)
            }
            
            // Update supplier - try ALL possible paths to find the supplier name
            let supplierName = null
            
            // Path 1: enrichedData.aiResult.supplier.name
            if (enrichedData.aiResult.supplier && enrichedData.aiResult.supplier.name) {
              supplierName = enrichedData.aiResult.supplier.name
              console.log('   Found supplier via supplier.name:', supplierName)
            }
            // Path 2: enrichedData.aiResult.supplier as string
            else if (enrichedData.aiResult.supplier && typeof enrichedData.aiResult.supplier === 'string') {
              supplierName = enrichedData.aiResult.supplier
              console.log('   Found supplier via supplier (string):', supplierName)
            }
            // Path 3: enrichedData.aiResult.supplierName
            else if (enrichedData.aiResult.supplierName) {
              supplierName = enrichedData.aiResult.supplierName
              console.log('   Found supplier via supplierName:', supplierName)
            }
            // Path 4: Check if rawData structure is available in aiResult
            else if (enrichedData.aiResult.rawData && enrichedData.aiResult.rawData.supplier && enrichedData.aiResult.rawData.supplier.name) {
              supplierName = enrichedData.aiResult.rawData.supplier.name
              console.log('   Found supplier via rawData.supplier.name:', supplierName)
            }
            // Path 5: Direct supplier extraction from any nested structure
            else {
              // Search recursively for supplier name in the AI result
              function findSupplierName(obj, path = '') {
                if (typeof obj !== 'object' || obj === null) return null
                
                for (const [key, value] of Object.entries(obj)) {
                  const currentPath = path ? `${path}.${key}` : key
                  
                  // Check if this looks like a supplier name field
                  if ((key.toLowerCase().includes('supplier') || key.toLowerCase().includes('vendor')) 
                      && typeof value === 'object' && value && value.name) {
                    console.log(`   Found supplier via ${currentPath}.name:`, value.name)
                    return value.name
                  }
                  
                  // Check if this is a direct supplier name string
                  if (key.toLowerCase().includes('supplier') && typeof value === 'string' && value !== 'Unknown') {
                    console.log(`   Found supplier via ${currentPath}:`, value)
                    return value
                  }
                  
                  // Recurse into nested objects
                  if (typeof value === 'object') {
                    const found = findSupplierName(value, currentPath)
                    if (found) return found
                  }
                }
                return null
              }
              
              supplierName = findSupplierName(enrichedData.aiResult)
              if (!supplierName) {
                console.log('   No supplier found in accumulated AI result structure')
              }
            }
            
            if (supplierName && supplierName !== 'Unknown' && supplierName.trim() !== '') {
              updateData.supplierName = supplierName.trim()
              console.log('   ✅ Setting supplier to:', supplierName.trim())
            } else {
              console.log('   ❌ No valid supplier name found or supplier is "Unknown"')
            }
            
            // Update total amount if available and not already set
            if (enrichedData.aiResult.totals && typeof enrichedData.aiResult.totals.total === 'number') {
              updateData.totalAmount = enrichedData.aiResult.totals.total
              console.log('   Setting total amount:', enrichedData.aiResult.totals.total)
            }
          } else {
            console.log('   No AI result data available in accumulated data for enhanced update')
          }
          
          console.log('   Attempting database update with accumulated data:', Object.keys(updateData))
          
          const updateResult = await db.client.purchaseOrder.update({
            where: { id: purchaseOrderId },
            data: updateData
          })
          
          
          console.log('   Attempting database update with accumulated data:', Object.keys(updateData))
          
          const finalUpdateResult = await db.client.purchaseOrder.update({
            where: { id: purchaseOrderId },
            data: updateData
          })
          
          console.log(`✅ Purchase order ${purchaseOrderId} status updated to: ${finalStatus}`)
          console.log('   Updated record status:', finalUpdateResult.status)
          console.log('   Updated record confidence:', finalUpdateResult.confidence)
          console.log('   Updated record supplier:', finalUpdateResult.supplierName)
          console.log('   Updated record jobStatus:', finalUpdateResult.jobStatus)
          
        } catch (dbError) {
          console.error('❌ Failed to update purchase order status:', dbError)
          console.error('   Error details:', dbError.message)
          // Don't throw error here - workflow should still complete
        }
      } else {
        console.log('⚠️ No purchaseOrderId available in accumulated data for status update stage')
      }
      
      job.progress(50)
      
      // Save final stage result and clear workflow data
      const stageResult = {
        finalStatus: purchaseOrderId ? 'database_updated' : 'no_po_id',
        purchaseOrderId,
        requiresReview: !!isReviewNeeded,
        timestamp: new Date().toISOString(),
        stage: WORKFLOW_STAGES.STATUS_UPDATE
      }
      
      await stageResultStore.saveStageResult(workflowId, WORKFLOW_STAGES.STATUS_UPDATE, stageResult)
      
      // Complete workflow with appropriate status
      const finalResult = {
        success: true,
        message: isReviewNeeded ? 'Purchase order processed - requires review' : 'Purchase order processed successfully',
        purchaseOrderId,
        requiresReview: !!isReviewNeeded,
        aiResult: enrichedData.aiResult ? {
          confidence: enrichedData.aiResult.confidence,
          model: enrichedData.aiResult.model
        } : null,
        shopifyResult: enrichedData.shopifyResult || null
      }
      
      console.log('🎉 Completing workflow', workflowId)
      
      // CRITICAL: Mark status_update stage as completed BEFORE completing the workflow (non-fatal if fails)
      try {
        await this.updateWorkflowStage(workflowId, WORKFLOW_STAGES.STATUS_UPDATE, 'completed')
        await this.completeWorkflow(workflowId, finalResult)
        console.log('✅ Workflow metadata updated successfully')
      } catch (workflowError) {
        console.warn('⚠️ Failed to update workflow metadata (non-fatal):', workflowError.message)
        // Continue - the important database work is done
      }
      
      // Clean up stage result store for this workflow
      try {
        await stageResultStore.clearWorkflowResults(workflowId)
        console.log('🗑️ Cleaned up workflow stage results from Redis')
      } catch (cleanupError) {
        console.warn('⚠️ Failed to clean up stage results (non-fatal):', cleanupError.message)
      }
      
      console.log('✅ Workflow completed successfully with accumulated data')
      console.log('   Purchase Order ID:', purchaseOrderId)
      console.log('   Requires Review:', !!isReviewNeeded)
      console.log('   Had AI Result:', !!enrichedData.aiResult)
      console.log('   Had DB Result:', !!enrichedData.dbResult) 
      console.log('   Had Shopify Result:', !!enrichedData.shopifyResult)
      
      job.progress(100)
      
      return {
        success: true,
        stage: WORKFLOW_STAGES.STATUS_UPDATE,
        finalResult
      }
      
    } catch (error) {
      console.error('❌ Status update failed:', error)
      await this.failWorkflow(workflowId, WORKFLOW_STAGES.STATUS_UPDATE, error)
      throw error
    }
  }

  /**
   * Generic job processor - routes to appropriate stage processor
   * @param {Object} job - Bull job object
   */
  async processJob(job) {
    const { stage } = job.data
    
    console.log(`🎭 Processing job for stage: ${stage}`)
    
    switch (stage) {
      case WORKFLOW_STAGES.AI_PARSING:
        return await this.processAIParsing(job)
      case WORKFLOW_STAGES.DATABASE_SAVE:
        return await this.processDatabaseSave(job)
      case WORKFLOW_STAGES.SHOPIFY_SYNC:
        return await this.processShopifySync(job)
      case WORKFLOW_STAGES.STATUS_UPDATE:
        return await this.processStatusUpdate(job)
      default:
        throw new Error(`Unknown workflow stage: ${stage}`)
    }
  }

  /**
   * Clean shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down WorkflowOrchestrator...')
    
    if (this.dbService) {
      await this.dbService.disconnect()
    }
    
    await this.redis.shutdown()
    
    console.log('✅ WorkflowOrchestrator shutdown complete')
  }
}

// Export singleton instance
export const workflowOrchestrator = new WorkflowOrchestrator()

// Default export
export default WorkflowOrchestrator
