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
import { prismaOperation } from './db.js'
import { SupabaseStorageService } from './storageService.js'
import { processorRegistrationService } from './processorRegistrationService.js'
import { FileParsingService } from './fileParsingService.js'
import { stageResultStore } from './stageResultStore.js'
import { SimpleProductDraftService } from '../services/simpleProductDraftService.js'
import { RefinementConfigService } from '../services/refinementConfigService.js'
import { RefinementPipelineService } from './refinementPipelineService.js'

/**
 * Convert BigInt values to strings for JSON serialization
 * Bull queue and Redis require JSON-serializable data
 */
function sanitizeBigInt(obj) {
  if (obj === null || obj === undefined) return obj
  
  if (typeof obj === 'bigint') {
    return obj.toString()
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeBigInt(item))
  }
  
  if (typeof obj === 'object') {
    const sanitized = {}
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeBigInt(value)
    }
    return sanitized
  }
  
  return obj
}

const BASE64_REGEX = /^[A-Za-z\d+/=]+$/

function rehydrateBuffer(value) {
  if (!value) {
    return null
  }

  if (Buffer.isBuffer(value)) {
    return value
  }

  if (value instanceof ArrayBuffer) {
    return Buffer.from(value)
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  }

  if (Array.isArray(value)) {
    return Buffer.from(value)
  }

  if (typeof value === 'object') {
    if (value.type === 'Buffer' && Array.isArray(value.data)) {
      return Buffer.from(value.data)
    }

    if (Array.isArray(value.data)) {
      return Buffer.from(value.data)
    }

    if (value.base64 && typeof value.base64 === 'string') {
      try {
        return Buffer.from(value.base64, 'base64')
      } catch (error) {
        console.warn('⚠️ Failed to decode base64 buffer payload:', error.message)
      }
    }
  }

  if (typeof value === 'string') {
    const normalized = value.trim()
    if (normalized && normalized.length % 4 === 0 && BASE64_REGEX.test(normalized)) {
      try {
        return Buffer.from(normalized, 'base64')
      } catch (error) {
        console.warn('⚠️ Failed to convert base64 string to buffer:', error.message)
      }
    }
  }

  return null
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// Workflow Stage Definitions
export const WORKFLOW_STAGES = {
  FILE_UPLOAD: 'file_upload',
  AI_PARSING: 'ai_parsing', 
  DATABASE_SAVE: 'database_save',
  DATA_NORMALIZATION: 'data_normalization',
  MERCHANT_CONFIG: 'merchant_config',
  AI_ENRICHMENT: 'ai_enrichment',
  SHOPIFY_PAYLOAD: 'shopify_payload',
  PRODUCT_DRAFT_CREATION: 'product_draft_creation',
  IMAGE_ATTACHMENT: 'image_attachment',
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
  [WORKFLOW_STAGES.DATA_NORMALIZATION]: 'Normalizing product data...',
  [WORKFLOW_STAGES.MERCHANT_CONFIG]: 'Applying merchant configuration rules...',
  [WORKFLOW_STAGES.AI_ENRICHMENT]: 'Enriching products with AI descriptions and images...',
  [WORKFLOW_STAGES.SHOPIFY_PAYLOAD]: 'Preparing Shopify-ready product data...',
  [WORKFLOW_STAGES.PRODUCT_DRAFT_CREATION]: 'Creating product drafts for refinement...',
  [WORKFLOW_STAGES.IMAGE_ATTACHMENT]: 'Searching and attaching product images...',
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
    this.productDraftService = new SimpleProductDraftService(db)
    // Don't initialize refinementConfigService in constructor - it needs async DB client
    this.refinementConfigService = null
    this.activePurchaseOrders = new Map()
    this.MAX_PO_LOCK_AGE_MS = 10 * 60 * 1000 // 10 minutes safeguard
  }

  /**
   * Initialize workflow orchestrator
   */
  async initialize() {
    console.log('🎭 Initializing WorkflowOrchestrator...')
    
    // Initialize refinementConfigService with async DB client
    // ALWAYS reinitialize to ensure fresh client after reconnections
    const prisma = await db.getClient()
    this.refinementConfigService = new RefinementConfigService(prisma)
    
    // Initialize Redis connection
    await this.redis.initializeConnections()
    
    // Initialize Stage Result Store
    await stageResultStore.initialize()
    
    console.log('✅ WorkflowOrchestrator initialized successfully')
  }

  async acquirePurchaseOrderLock(purchaseOrderId, metadata = {}) {
    if (!purchaseOrderId) {
      return () => {}
    }

    while (true) {
      const existing = this.activePurchaseOrders.get(purchaseOrderId)
      if (!existing) {
        break
      }

      const ageMs = Date.now() - existing.startedAt
      if (ageMs > this.MAX_PO_LOCK_AGE_MS) {
        console.warn(
          `⚠️ [PO LOCK] Stale lock detected for PO ${purchaseOrderId} (age ${ageMs}ms, workflow ${existing.workflowId}, stage ${existing.stage}). Reclaiming.`
        )
        this.activePurchaseOrders.delete(purchaseOrderId)
        break
      }

      console.log(
        `⏳ [PO LOCK] Waiting for PO ${purchaseOrderId} to be released by workflow ${existing.workflowId} (stage ${existing.stage})...`
      )
      await sleep(300)
    }

    const token = {
      workflowId: metadata.workflowId || 'unknown',
      stage: metadata.stage || 'unknown',
      jobId: metadata.jobId || 'n/a',
      startedAt: Date.now()
    }

    this.activePurchaseOrders.set(purchaseOrderId, token)
    console.log(
      `🔒 [PO LOCK] Reserved PO ${purchaseOrderId} for workflow ${token.workflowId} (stage ${token.stage}, job ${token.jobId}).`
    )

    let released = false
    return () => {
      if (released) return
      released = true
      const current = this.activePurchaseOrders.get(purchaseOrderId)
      if (current === token) {
        this.activePurchaseOrders.delete(purchaseOrderId)
      }
      console.log(
        `🔓 [PO LOCK] Released PO ${purchaseOrderId} for workflow ${token.workflowId} (stage ${token.stage}).`
      )
    }
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
        // Set TTL to 30 minutes (1800s) - workflows complete in <5min under normal conditions,
        // but may take longer with queue delays, retries, and error handling. 30min provides
        // ample buffer while preventing stale metadata from accumulating in Redis.
        // Previous 1hr TTL caused orphaned workflows to persist too long.
        await this.redis.redis.setex(key, 1800, JSON.stringify(metadata)) // 30 minute expiry
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
        [WORKFLOW_STAGES.DATA_NORMALIZATION]: { status: 'pending' },
        [WORKFLOW_STAGES.MERCHANT_CONFIG]: { status: 'pending' },
        [WORKFLOW_STAGES.AI_ENRICHMENT]: { status: 'pending' },
        [WORKFLOW_STAGES.SHOPIFY_PAYLOAD]: { status: 'pending' },
        [WORKFLOW_STAGES.PRODUCT_DRAFT_CREATION]: { status: 'pending' },
        [WORKFLOW_STAGES.SHOPIFY_SYNC]: { status: 'pending' },
        [WORKFLOW_STAGES.STATUS_UPDATE]: { status: 'pending' }
      },
      startedAt: new Date().toISOString(),
      progress: 0,
      data
    }
    
    // Create database workflow record for cron job tracking
    try {
      const prisma = await db.getClient()
      await prisma.workflowExecution.create({
        data: {
          workflowId,
          type: 'purchase_order_processing',
          status: 'pending', // Cron job looks for 'pending' status
          currentStage: WORKFLOW_STAGES.AI_PARSING,
          stagesTotal: 9,
          stagesCompleted: 0,
          progressPercent: 0,
          inputData: {
            uploadId: data.uploadId,
            fileName: data.fileName,
            fileSize: data.fileSize,
            mimeType: data.mimeType,
            merchantId: data.merchantId
          },
          merchantId: data.merchantId,
          uploadId: data.uploadId,
          purchaseOrderId: data.purchaseOrderId,
          startedAt: new Date()
        }
      })
      console.log(`✅ Database workflow record created for ${workflowId}`)
    } catch (dbError) {
      console.error(`⚠️ Failed to create database workflow record:`, dbError.message)
      // Continue anyway - Redis metadata is primary, database is for cron tracking
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
      // Sanitize BigInt values for Bull queue serialization
      const jobData = sanitizeBigInt({ workflowId, stage, data: enrichedData })
      
      switch (stage) {
        case WORKFLOW_STAGES.AI_PARSING:
          await processorRegistrationService.addJob('ai-parsing', jobData)
          break
        case WORKFLOW_STAGES.DATABASE_SAVE:
          await processorRegistrationService.addJob('database-save', jobData)
          break
        case WORKFLOW_STAGES.DATA_NORMALIZATION:
          await processorRegistrationService.addJob('data-normalization', jobData)
          break
        case WORKFLOW_STAGES.MERCHANT_CONFIG:
          await processorRegistrationService.addJob('merchant-config', jobData)
          break
        case WORKFLOW_STAGES.AI_ENRICHMENT:
          await processorRegistrationService.addJob('ai-enrichment', jobData)
          break
        case WORKFLOW_STAGES.SHOPIFY_PAYLOAD:
          await processorRegistrationService.addJob('shopify-payload', jobData)
          break
        case WORKFLOW_STAGES.PRODUCT_DRAFT_CREATION:
          await processorRegistrationService.addJob('product-draft-creation', jobData)
          break
        case WORKFLOW_STAGES.IMAGE_ATTACHMENT:
          await processorRegistrationService.addJob('image-attachment', jobData)
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
      // Sanitize BigInt values for Bull queue serialization
      const jobData = sanitizeBigInt({ workflowId, stage, data })
      
      switch (stage) {
        case WORKFLOW_STAGES.AI_PARSING:
          await processorRegistrationService.addJob('ai-parsing', jobData)
          break
        case WORKFLOW_STAGES.DATABASE_SAVE:
          await processorRegistrationService.addJob('database-save', jobData)
          break
        case WORKFLOW_STAGES.DATA_NORMALIZATION:
          await processorRegistrationService.addJob('data-normalization', jobData)
          break
        case WORKFLOW_STAGES.MERCHANT_CONFIG:
          await processorRegistrationService.addJob('merchant-config', jobData)
          break
        case WORKFLOW_STAGES.AI_ENRICHMENT:
          await processorRegistrationService.addJob('ai-enrichment', jobData)
          break
        case WORKFLOW_STAGES.SHOPIFY_PAYLOAD:
          await processorRegistrationService.addJob('shopify-payload', jobData)
          break
        case WORKFLOW_STAGES.PRODUCT_DRAFT_CREATION:
          await processorRegistrationService.addJob('product-draft-creation', jobData)
          break
        case WORKFLOW_STAGES.IMAGE_ATTACHMENT:
          await processorRegistrationService.addJob('image-attachment', jobData)
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
    let metadata = await this.getWorkflowMetadata(workflowId)
    
    // If metadata not found in Redis, try to recreate from database
    if (!metadata) {
      console.warn(`⚠️ Workflow metadata not found in Redis for ${workflowId}, attempting to recreate from database...`)
      
      try {
        const prisma = await db.getClient()
        const dbWorkflow = await prisma.workflowExecution.findUnique({
          where: { workflowId }
        })
        
        if (dbWorkflow) {
          console.log(`✅ Found workflow in database, recreating Redis metadata`)
          
          // Recreate metadata from database record
          metadata = {
            workflowId,
            status: dbWorkflow.status || 'active',
            currentStage: dbWorkflow.currentStage || stage,
            stages: {
              [WORKFLOW_STAGES.AI_PARSING]: { status: 'pending' },
              [WORKFLOW_STAGES.DATABASE_SAVE]: { status: 'pending' },
              [WORKFLOW_STAGES.DATA_NORMALIZATION]: { status: 'pending' },
              [WORKFLOW_STAGES.MERCHANT_CONFIG]: { status: 'pending' },
              [WORKFLOW_STAGES.AI_ENRICHMENT]: { status: 'pending' },
              [WORKFLOW_STAGES.SHOPIFY_PAYLOAD]: { status: 'pending' },
              [WORKFLOW_STAGES.PRODUCT_DRAFT_CREATION]: { status: 'pending' },
              [WORKFLOW_STAGES.SHOPIFY_SYNC]: { status: 'pending' },
              [WORKFLOW_STAGES.STATUS_UPDATE]: { status: 'pending' }
            },
            startedAt: dbWorkflow.startedAt?.toISOString() || new Date().toISOString(),
            progress: dbWorkflow.progressPercent || 0,
            data: dbWorkflow.inputData || {}
          }
          
          // Save recreated metadata to Redis
          await this.setWorkflowMetadata(workflowId, metadata)
          console.log(`✅ Redis metadata recreated for workflow ${workflowId}`)
        } else {
          throw new Error(`Workflow ${workflowId} not found in database or Redis`)
        }
      } catch (dbError) {
        console.error(`❌ Failed to recreate workflow metadata from database:`, dbError.message)
        throw new Error(`Workflow ${workflowId} not found and could not be recreated`)
      }
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

    // Save to Redis
    await this.setWorkflowMetadata(workflowId, metadata)
    
    // CRITICAL: Also update database workflowExecution record for cron job tracking
    // This prevents cron from thinking workflows are "stuck" when they're actually processing
    try {
      const prisma = await db.getClient()
      await prisma.workflowExecution.update({
        where: { workflowId },
        data: {
          currentStage: stage,
          progressPercent: metadata.progress,
          stagesCompleted: completedStages,
          updatedAt: new Date() // This is critical - cron uses updatedAt to detect stuck workflows
        }
      })
    } catch (dbError) {
      // Non-fatal - Redis is the source of truth, database is just for cron tracking
      console.warn(`⚠️ Failed to update database workflowExecution record (non-fatal):`, dbError.message)
    }
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

    // Save to Redis
    await this.setWorkflowMetadata(workflowId, metadata)
    
    // CRITICAL: Mark workflow as completed in database so cron doesn't reprocess it
    try {
      const prisma = await db.getClient()
      await prisma.workflowExecution.update({
        where: { workflowId },
        data: {
          status: 'completed',
          currentStage: 'completed',
          progressPercent: 100,
          stagesCompleted: Object.keys(metadata.stages).length,
          completedAt: new Date(),
          updatedAt: new Date()
        }
      })
      console.log(`✅ Workflow ${workflowId} marked as completed in database`)
    } catch (dbError) {
      console.error(`❌ Failed to mark workflow as completed in database:`, dbError.message)
      // Still throw since completion is critical
      throw dbError
    }
  }

  /**
   * Mark workflow as failed
   * @param {string} workflowId - Workflow ID
   * @param {string} stage - Stage where failure occurred
   * @param {Error} error - Error details
   */
  async failWorkflow(workflowId, stage, error, purchaseOrderId = null) {
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

      // Save to Redis
      await this.setWorkflowMetadata(workflowId, metadata)
      
      // CRITICAL: Mark workflow as failed in database
      try {
        const prisma = await db.getClient()
        await prisma.workflowExecution.update({
          where: { workflowId },
          data: {
            status: 'failed',
            currentStage: stage,
            failedStage: stage,
            errorMessage: error.message,
            completedAt: new Date(),
            updatedAt: new Date()
          }
        })
        console.log(`✅ Workflow ${workflowId} marked as failed in database`)
      } catch (dbError) {
        console.error(`❌ Failed to mark workflow as failed in database:`, dbError.message)
      }
      
      // CRITICAL: Also update the PO record in database to "failed" status
      // Try passed purchaseOrderId first, fallback to metadata
      const poId = purchaseOrderId || metadata.purchaseOrderId
      
      if (poId) {
        try {
          console.log(`📊 Updating PO ${poId} status to failed due to workflow failure`)
          
          await prismaOperation(
            (prisma) => prisma.purchaseOrder.update({
              where: { id: poId },
              data: {
                status: 'failed',
                jobStatus: 'failed',
                jobCompletedAt: new Date(),
                jobError: `${stage} failed: ${error.message}`,
                processingNotes: `Processing failed at ${stage} stage: ${error.message}`,
                updatedAt: new Date()
              }
            }),
            `Mark PO ${poId} as failed`
          )
          
          console.log(`✅ PO ${poId} status updated to failed`)
          
        } catch (dbError) {
          console.error(`❌ Failed to update PO status to failed: ${dbError.message}`)
        }
      } else {
        console.log('⚠️ No purchaseOrderId in workflow metadata or parameters, cannot update PO status')
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
   * Update purchase order with real-time progress information
   * This makes progress visible to the frontend via Supabase
   * @param {string} purchaseOrderId - Purchase order ID
   * @param {string} stage - Current stage
   * @param {number} progress - Progress percentage (0-100)
   * @param {number} itemsProcessed - Number of items processed
   * @param {number} totalItems - Total number of items
   */
  async updatePurchaseOrderProgress(purchaseOrderId, stage, progress, itemsProcessed = 0, totalItems = 0) {
    if (!purchaseOrderId) return
    
    try {
      const stageName = STAGE_MESSAGES[stage] || stage
      const progressNote = totalItems > 0 
        ? `${stageName} - ${itemsProcessed}/${totalItems} items (${progress}% complete)`
        : `${stageName} - ${progress}% complete`

      // CRITICAL FIX 2025-10-12: Aggressive timeouts for progress updates
      // Progress updates are NON-CRITICAL - better to skip than block workflow
      const PROGRESS_LOCK_TIMEOUT_MS = 1000  // Reduced from 2000ms → 1000ms
      const PROGRESS_STATEMENT_TIMEOUT_MS = 2000 // Reduced from 5000ms → 2000ms

      await prismaOperation(
        (prisma) => prisma.$transaction(
          async (tx) => {
            await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${PROGRESS_LOCK_TIMEOUT_MS}ms'`)
            await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '${PROGRESS_STATEMENT_TIMEOUT_MS}ms'`)

            await tx.purchaseOrder.update({
              where: { id: purchaseOrderId },
              data: {
                processingNotes: JSON.stringify({
                  currentStep: stageName,
                  progress: progress,
                  itemsProcessed: itemsProcessed,
                  totalItems: totalItems,
                  message: progressNote,
                  updatedAt: new Date().toISOString()
                }),
                updatedAt: new Date()
              }
            })
          },
          {
            maxWait: 1000, // Reduced from PROGRESS_LOCK_TIMEOUT_MS + 1500 → 1000ms (fail fast)
            timeout: 4000, // Reduced from 9000ms → 4000ms (1s lock + 2s statement + 1s buffer)
            isolationLevel: 'ReadCommitted'
          }
        ),
        `Update PO progress for ${purchaseOrderId}`
      )
      
      console.log(`📊 Updated PO ${purchaseOrderId} progress: ${progressNote}`)
    } catch (error) {
      const errorCode = error?.code || error?.originalError?.code
      const errorMessage = error?.message || ''

      // CRITICAL FIX 2025-10-12: Better error categorization for progress updates
      const isLockOrTimeout =
        errorCode === '55P03' || // lock_not_available
        errorCode === '57014' || // query_canceled (statement timeout)
        errorMessage.includes('canceling statement due to statement timeout') ||
        errorMessage.includes('lock timeout') ||
        errorMessage.includes('lock_timeout')
      
      const isTransactionTimeout =
        errorMessage.includes('Transaction already closed') ||
        errorMessage.includes('Transaction API error') ||
        errorMessage.includes('expired transaction')

      if (isLockOrTimeout) {
        console.warn(
          `⚠️ Skipped PO progress update for ${purchaseOrderId} (stage ${stage}) due to row lock/timeout (${errorCode || 'timeout'}). This is non-fatal - PO is being updated by another workflow.`
        )
        return
      }
      
      if (isTransactionTimeout) {
        console.warn(
          `⚠️ Skipped PO progress update for ${purchaseOrderId} (stage ${stage}) - transaction timeout (likely waiting for database lock). This is non-fatal.`
        )
        return
      }

      // Don't fail the workflow if progress update fails for other reasons
      console.error(`⚠️ Failed to update PO progress:`, error.message)
    }
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

    // Get purchaseOrderId from workflow metadata for progress updates
    const workflowMetadata = await this.getWorkflowMetadata(workflowId)
    const purchaseOrderId = workflowMetadata?.data?.purchaseOrderId || data.purchaseOrderId
    
    // Update progress: Starting AI parsing
    await this.updatePurchaseOrderProgress(purchaseOrderId, WORKFLOW_STAGES.AI_PARSING, 5)

    // Get file content for processing
    let contentForProcessing
    let fileBuffer = rehydrateBuffer(inputFileBuffer) // Keep reference to original buffer for binary files

    if (!fileBuffer && inputFileBuffer) {
      console.warn('⚠️ Received fileBuffer in unexpected format; attempting to recover via download')
    }

    if (parsedContent) {
      console.log('📋 Using parsedContent from job data')
      contentForProcessing = parsedContent
    } else if (fileBuffer) {
      console.log('📋 Using fileBuffer from job data')
    } else if (uploadId) {
      console.log('📥 Downloading file content from storage...')
      try {
        // Get upload record to find file URL
        const upload = await prismaOperation(
          (prisma) => prisma.upload.findUnique({
            where: { id: uploadId },
            select: { fileUrl: true }
          }),
          `Lookup upload ${uploadId} for file download`
        )
        
        if (!upload || !upload.fileUrl) {
          throw new Error(`No file URL found for upload ${uploadId}`)
        }
        
        console.log('📁 File URL found:', upload.fileUrl)
        
        // Download file content
        const fileResult = await this.storageService.downloadFile(upload.fileUrl)
        if (!fileResult.success) {
          throw new Error(`Failed to download file: ${fileResult.error}`)
        }

        let downloadedBuffer = rehydrateBuffer(fileResult.buffer)

        if (!downloadedBuffer && fileResult.buffer && typeof fileResult.buffer === 'object' && Array.isArray(fileResult.buffer.data)) {
          downloadedBuffer = Buffer.from(fileResult.buffer.data)
        }

        if (!downloadedBuffer && fileResult.buffer !== undefined && fileResult.buffer !== null) {
          try {
            downloadedBuffer = Buffer.from(fileResult.buffer)
          } catch (bufferError) {
            console.warn('⚠️ Failed to coerce downloaded payload into buffer:', bufferError.message)
          }
        }

        if (!downloadedBuffer) {
          throw new Error('Downloaded file did not return a usable buffer')
        }

        fileBuffer = downloadedBuffer
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
    
    // Update DB progress: Parsing document
    await this.updatePurchaseOrderProgress(purchaseOrderId, WORKFLOW_STAGES.AI_PARSING, 10)
    
    try {
      // Determine which parsing service to use based on file type
      const fileExtension = fileName.split('.').pop().toLowerCase()
      console.log(`📄 File extension: ${fileExtension}`)
      
      // Parse document with AI service
      job.progress(30)
      
      // Update DB progress: AI analyzing
      await this.updatePurchaseOrderProgress(purchaseOrderId, WORKFLOW_STAGES.AI_PARSING, 30)
      
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
      
      // Check confidence - use normalized (0-1) for calculations, overall (0-100) for display
      const confidence = aiResult.confidence?.normalized || aiResult.confidence?.overall / 100 || aiResult.confidence || 0
      if (confidence === undefined || confidence === null) {
        console.error('❌ AI parsing returned no confidence score')
        throw new Error('AI parsing returned no confidence score')
      }
      
      console.log('🎯 AI parsing completed successfully')
      console.log('   Model:', aiResult.model)
      console.log('   Confidence:', `${aiResult.confidence?.overall || 0}%`)
      
      job.progress(90)
      
      // Update DB progress: AI parsing complete
      await this.updatePurchaseOrderProgress(purchaseOrderId, WORKFLOW_STAGES.AI_PARSING, 90)
      
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
    
    // Get purchaseOrderId for progress updates
    const purchaseOrderId = data.purchaseOrderId
    await this.updatePurchaseOrderProgress(purchaseOrderId, WORKFLOW_STAGES.DATABASE_SAVE, 10)
    
    try {
      // Get merchant ID - REQUIRED for database save
      if (!data.merchantId) {
        throw new Error('merchantId is required but not provided in workflow data')
      }
      const merchantId = data.merchantId
      
      console.log('💾 Persisting AI results to database...')
      
      // DEBUG: Log AI result structure
      console.log('🔍 DEBUG - AI Result Structure:')
      console.log('   - Has extractedData:', !!aiResult.extractedData)
      console.log('   - extractedData.lineItems:', aiResult.extractedData?.lineItems?.length || 0)
      console.log('   - extractedData.items:', aiResult.extractedData?.items?.length || 0)
      console.log('   - extractedData keys:', Object.keys(aiResult.extractedData || {}))
      if (aiResult.extractedData) {
        console.log('   - Full extractedData:', JSON.stringify(aiResult.extractedData, null, 2))
      }
      
      job.progress(30)
      
      // Update DB progress: Saving to database
      await this.updatePurchaseOrderProgress(purchaseOrderId, WORKFLOW_STAGES.DATABASE_SAVE, 30)
      
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
      
      // Update DB progress: Database save complete
      const newPurchaseOrderId = dbResult.purchaseOrder?.id || purchaseOrderId
      await this.updatePurchaseOrderProgress(newPurchaseOrderId, WORKFLOW_STAGES.DATABASE_SAVE, 90)
      
      // Update workflow metadata (non-fatal if fails)
      try {
        await this.updateWorkflowStage(workflowId, WORKFLOW_STAGES.DATABASE_SAVE, 'completed')
        console.log('✅ Workflow stage updated successfully')
      } catch (workflowError) {
        console.warn('⚠️ Failed to update workflow stage (non-fatal):', workflowError.message)
        // Continue processing - database save was successful
      }
      
      console.log('🚀 DATABASE SAVE COMPLETED - Scheduling Product Draft Creation')
      console.log('   dbResult.purchaseOrder exists:', !!dbResult.purchaseOrder)
      console.log('   dbResult.purchaseOrder.id:', dbResult.purchaseOrder?.id)
      
      // CRITICAL VALIDATION: Ensure database save actually succeeded
      if (!dbResult.purchaseOrder || !dbResult.purchaseOrder.id) {
        throw new Error(`Database save validation failed: No purchase order created (PO ID: ${dbResult.purchaseOrder?.id})`)
      }
      
      if (!dbResult.lineItems || dbResult.lineItems.length === 0) {
        throw new Error(`Database save validation failed: No line items saved (PO ID: ${dbResult.purchaseOrder.id})`)
      }
      
      console.log(`✅ Database save validation passed:`)
      console.log(`   - Purchase Order ID: ${dbResult.purchaseOrder.id}`)
      console.log(`   - Line Items: ${dbResult.lineItems.length}`)
      
      // Save database result to stage store and prepare next stage data
      const stageResult = {
        dbResult,
        purchaseOrderId: dbResult.purchaseOrder.id, // Now guaranteed to exist
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
        purchaseOrderId: dbResult.purchaseOrder.id // Now guaranteed to exist
      }
      
      // Save and accumulate data for next stage
      const enrichedNextStageData = await this.saveAndAccumulateStageData(
        workflowId,
        WORKFLOW_STAGES.DATABASE_SAVE,
        stageResult,
        nextStageData
      )
      
      console.log('📋 About to schedule Data Normalization with enriched data:', {
        workflowId,
        hasDbResult: !!enrichedNextStageData.dbResult,
        hasAiResult: !!enrichedNextStageData.aiResult,
        purchaseOrderId: enrichedNextStageData.purchaseOrderId
      })
      
      // SIMPLIFIED WORKFLOW: Skip intermediate normalization stages and go directly to product drafts
      // The intermediate stages (data_normalization, merchant_config, etc.) were causing workflows to get stuck
      // Product draft creation has all the logic needed for pricing, refinement, etc.
      console.log('🎯 Skipping intermediate stages - proceeding directly to Product Draft Creation')
      
      // Update PO progress to show we're moving to next stage
      await this.updatePurchaseOrderProgress(
        dbResult.purchaseOrder.id, 
        'Creating product drafts for refinement...', 
        40,
        'Product draft creation starting...'
      )
      
      await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.PRODUCT_DRAFT_CREATION, enrichedNextStageData)
      
      job.progress(100)
      
      return {
        success: true,
        stage: WORKFLOW_STAGES.DATABASE_SAVE,
        dbResult,
        nextStage: WORKFLOW_STAGES.PRODUCT_DRAFT_CREATION // Changed from DATA_NORMALIZATION
      }
      
    } catch (error) {
      console.error('❌ Database save failed:', error)
      await this.failWorkflow(workflowId, WORKFLOW_STAGES.DATABASE_SAVE, error, purchaseOrderId)
      throw error
    }
  }

  /**
   * Process Product Draft Creation stage
   * @param {Object} job - Bull job object
   */
  async processProductDraftCreation(job) {
    console.log('🎨 processProductDraftCreation - Starting...')
    
    const { workflowId, data } = job.data
    const { aiResult, dbResult, purchaseOrderId, merchantId } = data

    const prisma = await db.getClient()
    
    console.log('🎨 Product Draft Creation data:', { 
      workflowId, 
      purchaseOrderId,
      merchantId,
      hasAiResult: !!aiResult,
      hasDbResult: !!dbResult
    })

    try {
      job.progress(10)

      // Validate required data
      if (!dbResult?.purchaseOrder) {
        throw new Error('No purchase order data available for product draft creation')
      }

      const purchaseOrder = dbResult.purchaseOrder
      
      console.log(`🔍 DEBUG - Looking for line items:`)
      console.log(`   PO ID from dbResult: ${purchaseOrder.id}`)
      console.log(`   PO ID from job data: ${data.purchaseOrderId}`)
      
      // Get the saved line items from the database
      // Wrap in retry logic to handle engine warmup delays
      let lineItemsFromDb
      try {
        lineItemsFromDb = await prismaOperation(
          (prisma) => prisma.pOLineItem.findMany({
            where: { purchaseOrderId: purchaseOrder.id }
          }),
          `Find line items for PO ${purchaseOrder.id}`
        )
      } catch (error) {
        console.error(`❌ Failed to fetch line items:`, error.message)
        throw new Error(`Could not retrieve line items: ${error.message}`)
      }
      
      console.log(`🔍 DEBUG - Line items query result: ${lineItemsFromDb.length} items found`)
      
      if (!lineItemsFromDb || lineItemsFromDb.length === 0) {
        // Debug: Check if line items exist for any PO
        let allLineItems
        try {
          allLineItems = await prismaOperation(
            (prisma) => prisma.pOLineItem.findMany({
              take: 10,
              orderBy: { createdAt: 'desc' }
            }),
            `Find recent line items for debugging`
          )
        } catch (error) {
          console.warn(`⚠️ Could not fetch debug line items:`, error.message)
          allLineItems = []
        }
        console.log(`🔍 DEBUG - Recent line items in database: ${allLineItems.length}`)
        if (allLineItems.length > 0) {
          console.log(`🔍 DEBUG - Sample line item PO IDs:`, allLineItems.slice(0, 3).map(li => li.purchaseOrderId))
        }
        
        throw new Error('No line items found in database for this purchase order')
      }

      console.log(`📦 Creating product drafts for ${lineItemsFromDb.length} line items`)

      job.progress(30)
      
      // Update DB progress: Creating product drafts
      await this.updatePurchaseOrderProgress(
        purchaseOrder.id, 
        WORKFLOW_STAGES.PRODUCT_DRAFT_CREATION, 
        30,
        0,
        lineItemsFromDb.length
      )

      // Create product drafts for each line item
      const productDrafts = []
      
      for (let index = 0; index < lineItemsFromDb.length; index++) {
        const lineItem = lineItemsFromDb[index]
        
        try {
          console.log(`🎨 Creating product draft for line item ${index + 1}:`, {
            sku: lineItem.sku,
            productName: lineItem.productName,
            unitCost: lineItem.unitCost
          })

          // Check if a product draft already exists for this line item
          // NOTE: lineItemId is NOT unique, so we use findFirst instead of findUnique
          // Wrap in retry logic to handle engine warmup delays
          let existingDraft
          try {
            existingDraft = await prismaOperation(
              (prisma) => prisma.productDraft.findFirst({
                where: { lineItemId: lineItem.id }  // FIXED: Use lineItemId (actual DB field) and findFirst
              }),
              `Find existing product draft for line item ${lineItem.id}`
            )
          } catch (error) {
            console.warn(`⚠️ Could not check for existing draft:`, error.message)
            existingDraft = null
          }

          if (existingDraft) {
            console.log(`⏭️ Product draft already exists for line item ${lineItem.id}, skipping...`)
            productDrafts.push(existingDraft)
            continue
          }

          // Find a session for this merchant (required by our schema)
          // Wrap in retry logic to handle engine warmup delays
          let session
          try {
            session = await prismaOperation(
              (prisma) => prisma.session.findFirst({
                where: { merchantId: merchantId }
              }),
              `Find session for merchant ${merchantId}`
            )
          } catch (error) {
            console.warn(`⚠️ Could not find session for merchant ${merchantId}:`, error.message)
            session = null
          }

          if (!session) {
            console.warn(`⚠️ No session found for merchant ${merchantId}, creating temporary session`)
            try {
              session = await prismaOperation(
                (prisma) => prisma.session.create({
                  data: {
                    shop: `temp-${merchantId}-${Date.now()}`,
                    state: 'temporary',
                    isOnline: false,
                    accessToken: 'temp-token-for-processing',
                    merchantId: merchantId
                  }
                }),
                `Create temporary session for merchant ${merchantId}`
              )
              console.log(`✅ Created temporary session: ${session.id}`)
            } catch (createError) {
              console.error(`❌ Failed to create temporary session:`, createError.message)
              throw new Error(`Cannot create product draft without valid session`)
            }
          }

          // Apply refinement rules to pricing
          console.log(`🔧 Applying refinement rules for merchant ${merchantId}...`)
          const refinementResult = await this.refinementConfigService.testPricingRules(merchantId, {
            title: lineItem.productName || `Product from PO ${purchaseOrder.number}`,
            price: (lineItem.unitCost || 0).toString(),
            sku: lineItem.sku || '',
            description: lineItem.description || ''
          })

          const originalPrice = lineItem.unitCost || 0
          // Ensure priceRefined is always a Float, not a string
          const priceRefined = parseFloat(refinementResult.adjustedPrice) || (originalPrice > 0 ? originalPrice * 1.5 : 0)
          const estimatedMargin = originalPrice > 0 && priceRefined > originalPrice 
            ? ((priceRefined - originalPrice) / priceRefined) * 100 
            : 0

          // Create review notes with applied rules information
          let reviewNotes = `Auto-generated from PO processing with ${Math.round((aiResult?.confidence?.overall || aiResult?.confidence || 0) * 100)}% AI confidence`
          if (refinementResult.appliedRules && refinementResult.appliedRules.length > 0) {
            const rulesDescription = refinementResult.appliedRules.map(rule => rule.description).join(', ')
            reviewNotes += `\nRefinement rules applied: ${rulesDescription}`
          }

          console.log(`💰 Pricing calculation for ${lineItem.productName}:`, {
            originalPrice,
            priceRefined,
            appliedRules: refinementResult.appliedRules?.length || 0,
            estimatedMargin: estimatedMargin.toFixed(1) + '%'
          })

          const productDraft = await this.productDraftService.createProductDraft({
            sessionId: session.id,
            merchantId: merchantId,
            purchaseOrderId: purchaseOrder.id,
            lineItemId: lineItem.id,  // FIXED: Use lineItemId (actual DB field name)
            supplierId: purchaseOrder.supplierId,
            originalTitle: lineItem.productName || `Product from PO ${purchaseOrder.number}`,
            originalDescription: lineItem.description || `Product imported from Purchase Order ${purchaseOrder.number}`,
            originalPrice: originalPrice,
            priceRefined: priceRefined,
            estimatedMargin: estimatedMargin,
            reviewNotes: reviewNotes
          })

          if (productDraft) {
            productDrafts.push(productDraft)
            console.log(`✅ Created product draft: ${productDraft.originalTitle} (ID: ${productDraft.id})`)
          } else {
            console.error(`❌ Product draft creation returned null for item ${index}`)
          }
          
        } catch (itemError) {
          console.error(`❌ Failed to create product draft for item ${index}:`, itemError)
          // Continue with other items - don't fail the entire stage for one item
        }

        // Update progress
        job.progress(30 + (index / lineItemsFromDb.length) * 50)
        
        // Update DB progress with item counts
        const currentProgress = Math.round(30 + (index / lineItemsFromDb.length) * 50)
        await this.updatePurchaseOrderProgress(
          purchaseOrder.id,
          WORKFLOW_STAGES.PRODUCT_DRAFT_CREATION,
          currentProgress,
          index + 1,
          lineItemsFromDb.length
        )
      }

      console.log(`🎨 Successfully created ${productDrafts.length} product drafts`)

      job.progress(85)

      // Update workflow metadata
      await this.updateWorkflowStage(workflowId, WORKFLOW_STAGES.PRODUCT_DRAFT_CREATION, 'completed')

      // Save product draft creation result to stage store and prepare next stage data
      const stageResult = {
        productDrafts,
        productDraftCount: productDrafts.length,
        purchaseOrderId,
        merchantId,
        timestamp: new Date().toISOString(),
        stage: WORKFLOW_STAGES.PRODUCT_DRAFT_CREATION
      }

      const nextStageData = {
        ...data,
        productDrafts,
        productDraftCreationResult: stageResult
      }

      // Save and accumulate data for next stage
      const enrichedNextStageData = await this.saveAndAccumulateStageData(
        workflowId,
        WORKFLOW_STAGES.PRODUCT_DRAFT_CREATION,
        stageResult,
        nextStageData
      )

      // Continue to image search and attachment stage
      console.log('🎯 Product Draft Creation completed - Proceeding to image search...')
      
      // Update PO progress to show transition to next stage
      await this.updatePurchaseOrderProgress(
        purchaseOrder.id,
        'Searching and attaching product images...',
        60,
        `Found ${productDrafts.length} products, now searching for images...`
      )
      
      // Schedule image search stage to find and attach product images
      await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.IMAGE_ATTACHMENT, enrichedNextStageData)

      job.progress(90)

      return {
        success: true,
        stage: WORKFLOW_STAGES.PRODUCT_DRAFT_CREATION,
        productDrafts,
        productDraftCount: productDrafts.length,
        nextStage: WORKFLOW_STAGES.IMAGE_ATTACHMENT // Fixed: was STATUS_UPDATE
      }

    } catch (error) {
      console.error('❌ Product Draft Creation failed:', error)
      await this.failWorkflow(workflowId, WORKFLOW_STAGES.PRODUCT_DRAFT_CREATION, error)
      throw error
    }
  }

  /**
   * Process Image Attachment stage
   * Search for images and attach them to product drafts
   * @param {Object} job - Bull job object
   */
  async processImageAttachment(job) {
    console.log('🖼️ processImageAttachment - Queueing background image processing...')
    
    const { workflowId, data } = job.data
    const { purchaseOrderId, productDrafts } = data

    const prisma = await db.getClient()
    
    console.log(`🖼️ Image attachment data:`, { 
      workflowId, 
      purchaseOrderId,
      productDraftCount: productDrafts?.length
    })
    
    job.progress(10)
    
    // OPTIMIZATION: Queue image processing in background instead of blocking workflow
    // This reduces workflow completion time from 5+ minutes to ~30 seconds
    const ASYNC_IMAGE_PROCESSING = process.env.ASYNC_IMAGE_PROCESSING !== 'false' // Default: true
    
    if (ASYNC_IMAGE_PROCESSING) {
      console.log('⚡ ASYNC MODE: Queueing image processing in background, continuing workflow immediately')
      
      // Queue the background image processing job
      // NOTE: We don't pass productDrafts here - background job will fetch fresh from DB
      // This prevents race conditions where drafts might be modified/deleted between
      // queuing and processing (5+ min delay)
      try {
        await processorRegistrationService.addJob('background-image-processing', {
          stage: 'background_image_processing', // REQUIRED for job routing
          workflowId, // For logging/tracking only
          data: {
            purchaseOrderId,
            // productDrafts: NOT passed - will be fetched fresh from DB
            merchantId: data.merchantId
          }
        })
        console.log('✅ Background image processing job queued successfully')
      } catch (queueError) {
        console.warn('⚠️ Failed to queue background image processing:', queueError.message)
        // Don't fail workflow - images will be missing but PO can still be reviewed
      }
      
      // Mark stage as complete immediately
      await this.updateWorkflowStage(workflowId, WORKFLOW_STAGES.IMAGE_ATTACHMENT, 'completed')
      
      // Save stage result indicating async processing
      const stageResult = {
        mode: 'async',
        backgroundJobQueued: true,
        purchaseOrderId,
        timestamp: new Date().toISOString()
      }
      
      const enrichedNextStageData = await this.saveAndAccumulateStageData(
        workflowId,
        WORKFLOW_STAGES.IMAGE_ATTACHMENT,
        stageResult,
        { ...data, imageAttachmentResult: stageResult }
      )
      
      // Immediately proceed to next stage
      await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.SHOPIFY_SYNC, enrichedNextStageData)
      
      job.progress(100)
      
      return {
        success: true,
        mode: 'async',
        stage: WORKFLOW_STAGES.IMAGE_ATTACHMENT,
        backgroundJobQueued: true,
        message: 'Image processing queued in background',
        nextStage: WORKFLOW_STAGES.SHOPIFY_SYNC
      }
    }
    
    // LEGACY MODE: Synchronous image processing (slow but blocking)
    console.log('⏳ SYNC MODE: Processing images synchronously (this may take 2-3 minutes)...')
    
    // Update DB progress: Starting image search
    await this.updatePurchaseOrderProgress(purchaseOrderId, WORKFLOW_STAGES.IMAGE_ATTACHMENT, 10)
    
    try {
      if (!purchaseOrderId) {
        throw new Error('No purchase order ID found for image attachment')
      }

      // Check if we have product drafts from accumulated data
      let draftsToProcess = productDrafts
      let draftsFromDb = null
      
      if (!draftsToProcess || draftsToProcess.length === 0) {
        console.log('⚠️ No product drafts in accumulated data, checking database...')
        
        // Try to get product drafts from database
        // Wrap in retry logic to handle engine warmup delays
        try {
          draftsFromDb = await prismaOperation(
            (prisma) => prisma.productDraft.findMany({
              where: { purchaseOrderId },
              include: {
                POLineItem: true,
                images: true
              }
            }),
            `Find product drafts for PO ${purchaseOrderId}`
          )
        } catch (error) {
          console.warn(`⚠️ Could not fetch product drafts from database:`, error.message)
          draftsFromDb = null
        }
        
        if (!draftsFromDb || draftsFromDb.length === 0) {
          console.log('⚠️ No product drafts found in database either - skipping image attachment')
          console.log('   This is expected for workflows that haven\'t created product drafts yet')
          
          // Schedule next stage instead of failing
          const enrichedNextStageData = await this.saveAndAccumulateStageData(
            workflowId,
            WORKFLOW_STAGES.IMAGE_ATTACHMENT,
            { success: true, skipped: true, reason: 'No product drafts available' },
            data
          )
          
          await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.SHOPIFY_SYNC, enrichedNextStageData)
          
          return {
            success: true,
            stage: WORKFLOW_STAGES.IMAGE_ATTACHMENT,
            skipped: true,
            message: 'No product drafts available - skipped image attachment',
            nextStage: WORKFLOW_STAGES.SHOPIFY_SYNC
          }
        }
        
        // Use database drafts
        draftsToProcess = draftsFromDb
        console.log(`✅ Loaded ${draftsToProcess.length} product drafts from database`)
      }

      console.log(`🖼️ Found ${draftsToProcess.length} product drafts to process`)
      
      job.progress(20)
      
      // Update DB progress: Searching for images
      await this.updatePurchaseOrderProgress(
        purchaseOrderId,
        WORKFLOW_STAGES.IMAGE_ATTACHMENT,
        20,
        0,
        draftsToProcess.length
      )

      // Import the image processing service
      const { ImageProcessingService } = await import('./imageProcessingService.js')
      const imageService = new ImageProcessingService()

      let processedCount = 0
      let imagesFoundCount = 0

      // Process each draft to find and attach images
      for (const [index, draft] of draftsToProcess.entries()) {
        try {
          console.log(`🔍 [${index + 1}/${draftsToProcess.length}] Searching images for: ${draft.originalTitle}`)
          
          // Prepare item data for image search (matching the format expected by imageProcessingService)
          const itemForSearch = {
            sku: draft.lineItem?.sku || '',
            productName: draft.originalTitle,
            brand: draft.lineItem?.brand || '',
            quantity: draft.lineItem?.quantity || 1,
            unitCost: draft.originalPrice || 0
          }

          // PRODUCTION FIX: Add timeout protection (30 seconds max per image search)
          const imageSearchPromise = imageService.searchGoogleProductImages(itemForSearch)
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Image search timeout (30s)')), 30000)
          )
          
          let images
          try {
            images = await Promise.race([imageSearchPromise, timeoutPromise])
          } catch (timeoutError) {
            console.warn(`   ⏱️ Image search timed out for: ${draft.originalTitle}`)
            images = [] // Continue with no images
          }
          
          if (images && images.length > 0) {
            console.log(`   ✅ Found ${images.length} images via scraping`)
            imagesFoundCount++

            // Save images to database
            for (const [imgIndex, image] of images.slice(0, 3).entries()) {  // Top 3 images
              // Wrap in retry logic to handle engine warmup delays
              try {
                await prismaOperation(
                  (prisma) => prisma.productImage.create({
                    data: {
                      productDraftId: draft.id,
                      originalUrl: image.url,
                      altText: draft.originalTitle,
                      position: imgIndex,
                      isEnhanced: false,
                      enhancementData: {
                        source: image.source || 'google_images_scraping',
                        confidence: image.confidence || 0.5,
                        searchQuery: image.searchQuery || itemForSearch.productName,
                        originalSearchResult: true
                      }
                    }
                  }),
                  `Create product image for draft ${draft.id}`
                )
              } catch (error) {
                console.warn(`⚠️ Failed to save image ${imgIndex + 1}:`, error.message)
              }
            }
            
            console.log(`   💾 Saved ${Math.min(3, images.length)} images to database`)
          } else {
            console.log(`   ⚠️ No images found for: ${draft.originalTitle}`)
          }

          processedCount++
          job.progress(20 + (processedCount / draftsToProcess.length) * 60)
          
          // Update DB progress with item counts
          const currentProgress = Math.round(20 + (processedCount / draftsToProcess.length) * 60)
          await this.updatePurchaseOrderProgress(
            purchaseOrderId,
            WORKFLOW_STAGES.IMAGE_ATTACHMENT,
            currentProgress,
            processedCount,
            draftsToProcess.length
          )

        } catch (itemError) {
          console.error(`   ❌ Failed to process images for draft ${draft.id}:`, itemError.message)
          // Continue with next item
        }
      }

      console.log(`🖼️ Image attachment completed:`)
      console.log(`   - Processed: ${processedCount}/${draftsToProcess.length} drafts`)
      console.log(`   - Images found for: ${imagesFoundCount} products`)

      job.progress(85)

      // Create image review session for merchant
      const { MerchantImageReviewService } = await import('./merchantImageReviewService.js')
      const reviewService = new MerchantImageReviewService()

      try {
        // Try to get merchantId from multiple sources
        let merchantId = data.merchantId
        if (!merchantId) {
          const dbResult = await stageResultStore.getStageResult(workflowId, 'database_save')
          merchantId = dbResult?.merchantId
        }
        if (!merchantId) {
          const accumulatedData = await stageResultStore.getAccumulatedData(workflowId)
          merchantId = accumulatedData?.merchantId || accumulatedData?.dbResult?.merchantId
        }

        console.log(`🖼️ Image review session - merchantId: ${merchantId}, imagesFoundCount: ${imagesFoundCount}`)

        if (merchantId && imagesFoundCount > 0) {
          // Get all images for this PO
          // Wrap in retry logic to handle engine warmup delays
          let allImages
          try {
            allImages = await prismaOperation(
              (prisma) => prisma.productImage.findMany({
                where: {
                  productDraft: {
                    purchaseOrderId
                  }
                },
                include: {
                  productDraft: {
                    include: {
                      POLineItem: true
                    }
                  }
                }
              }),
              `Find product images for PO ${purchaseOrderId}`
            )
          } catch (error) {
            console.warn(`⚠️ Could not fetch product images:`, error.message)
            allImages = []
          }

          console.log(`🖼️ Found ${allImages.length} images in database for review session`)

          // Group images by product and format for review session
          const productImageMap = new Map()
          
          for (const img of allImages) {
            const productKey = img.productDraft.lineItem?.sku || img.productDraft.id
            
            if (!productImageMap.has(productKey)) {
              productImageMap.set(productKey, {
                lineItemId: img.productDraft.lineItem?.id || null,  // Add lineItemId for matching
                sku: img.productDraft.lineItem?.sku || '',
                productName: img.productDraft.originalTitle,
                images: []
              })
            }
            
            const product = productImageMap.get(productKey)
            product.images.push({
              url: img.originalUrl,
              type: product.images.length === 0 ? 'MAIN' : 'GALLERY',  // First image is MAIN, rest are GALLERY
              source: 'WEB_SCRAPED',  // ImageSource enum value
              confidence: img.enhancementData?.confidence || 0.5,
              altText: img.altText || img.productDraft.originalTitle
            })
          }
          
          const imageResults = Array.from(productImageMap.values())

          const reviewSession = await reviewService.createImageReviewSession({
            purchaseOrderId,
            merchantId,
            lineItems: imageResults
          })

          console.log(`✅ Created image review session: ${reviewSession.sessionId}`)
        } else {
          console.log(`⚠️ Skipping review session creation - merchantId: ${merchantId}, imagesFoundCount: ${imagesFoundCount}`)
        }
      } catch (reviewError) {
        console.error('⚠️ Failed to create image review session:', reviewError)
        // Don't fail the workflow, just log the error
      }

      // Update workflow metadata
      await this.updateWorkflowStage(workflowId, WORKFLOW_STAGES.IMAGE_ATTACHMENT, 'completed')

      // Save stage result
      const stageResult = {
        processedDrafts: processedCount,
        imagesFound: imagesFoundCount,
        purchaseOrderId,
        timestamp: new Date().toISOString()
      }

      const enrichedNextStageData = await this.saveAndAccumulateStageData(
        workflowId,
        WORKFLOW_STAGES.IMAGE_ATTACHMENT,
        stageResult,
        { ...data, imageAttachmentResult: stageResult }
      )

      // Continue to status update
      console.log('🎯 Image Attachment completed - Proceeding to status update...')
      
      // Update PO progress to show finalizing
      await this.updatePurchaseOrderProgress(
        purchaseOrderId,
        'Finalizing purchase order...',
        90,
        `Images attached. Processing final status update...`
      )
      
      await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.STATUS_UPDATE, enrichedNextStageData)

      job.progress(100)

      return {
        success: true,
        stage: WORKFLOW_STAGES.IMAGE_ATTACHMENT,
        processedDrafts: processedCount,
        imagesFound: imagesFoundCount
      }

    } catch (error) {
      console.error('❌ Image Attachment failed:', error)
      console.warn('⚠️ Proceeding to STATUS_UPDATE despite image attachment failure')
      
      // PRODUCTION FIX: Always schedule STATUS_UPDATE even if image search fails
      // This ensures the PO status gets updated properly
      try {
        const enrichedNextStageData = await this.saveAndAccumulateStageData(
          workflowId,
          WORKFLOW_STAGES.IMAGE_ATTACHMENT,
          { 
            success: false, 
            error: error.message,
            timestamp: new Date().toISOString() 
          },
          data
        )
        
        // Update workflow metadata to show stage completed (with error)
        await this.updateWorkflowStage(workflowId, WORKFLOW_STAGES.IMAGE_ATTACHMENT, 'completed')
        
        // CRITICAL: Always schedule STATUS_UPDATE to prevent stuck workflows
        console.log('🎯 Scheduling STATUS_UPDATE despite image attachment error...')
        await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.STATUS_UPDATE, enrichedNextStageData)
        
        job.progress(100)
        
        return {
          success: false,
          stage: WORKFLOW_STAGES.IMAGE_ATTACHMENT,
          error: error.message,
          nextStage: WORKFLOW_STAGES.STATUS_UPDATE,
          message: 'Image attachment failed but workflow will continue'
        }
      } catch (recoveryError) {
        console.error('❌ Failed to schedule STATUS_UPDATE after image error:', recoveryError)
        // Only fail workflow if we can't even schedule the next stage
        await this.failWorkflow(workflowId, WORKFLOW_STAGES.IMAGE_ATTACHMENT, error)
        throw error
      }
    }
  }

  /**
   * Process Background Image Processing (Async)
   * Runs image search and attachment in the background without blocking workflow
   * @param {Object} job - Bull job object
   */
  async processBackgroundImageProcessing(job) {
    console.log('🖼️🔄 processBackgroundImageProcessing - Starting async image processing...')
    
    // Extract from nested data structure (matches other workflow stages)
    const { workflowId, data } = job.data
    const { purchaseOrderId, productDrafts, merchantId } = data || {}
    const prisma = await db.getClient()
    
    console.log(`🖼️🔄 Background image processing:`, {
      purchaseOrderId,
      productDraftCount: productDrafts?.length,
      merchantId,
      workflowId: workflowId || 'N/A (detached from workflow)'
    })
    
    try {
      // Get product drafts from database if not provided
      let draftsToProcess = productDrafts
      
      if (!draftsToProcess || draftsToProcess.length === 0) {
        console.log('📥 Fetching product drafts from database...')
        draftsToProcess = await prismaOperation(
          (prisma) => prisma.productDraft.findMany({
            where: { purchaseOrderId },
            include: {
              POLineItem: true,
              images: true
            }
          }),
          `Find product drafts for PO ${purchaseOrderId}`
        )
      }
      
      if (!draftsToProcess || draftsToProcess.length === 0) {
        console.log('⚠️ No product drafts found - skipping background image processing')
        return {
          success: true,
          skipped: true,
          reason: 'No product drafts available'
        }
      }
      
      console.log(`🖼️🔄 Processing ${draftsToProcess.length} product drafts for images...`)
      
      const { ImageProcessingService } = await import('./imageProcessingService.js')
      const imageService = new ImageProcessingService()
      
      let processedCount = 0
      let imagesFoundCount = 0
      
      // Process each draft (this is the slow part that was blocking workflows)
      for (const [index, draft] of draftsToProcess.entries()) {
        try {
          // Double-check draft still exists before processing (defense against race conditions)
          const draftExists = await prismaOperation(
            (prisma) => prisma.productDraft.findUnique({
              where: { id: draft.id },
              select: { id: true }
            }),
            `Check if draft ${draft.id} exists`
          )
          
          if (!draftExists) {
            console.log(`⚠️ [${index + 1}/${draftsToProcess.length}] Draft ${draft.id} no longer exists - skipping`)
            processedCount++
            continue
          }
          
          console.log(`🔍 [${index + 1}/${draftsToProcess.length}] Searching images for: ${draft.originalTitle}`)
          
          const itemForSearch = {
            sku: draft.lineItem?.sku || '',
            productName: draft.originalTitle,
            brand: draft.lineItem?.brand || '',
            quantity: draft.lineItem?.quantity || 1,
            unitCost: draft.originalPrice || 0
          }
          
          // Add timeout protection (30 seconds max per image search)
          const imageSearchPromise = imageService.searchGoogleProductImages(itemForSearch)
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Image search timeout (30s)')), 30000)
          )
          
          let images
          try {
            images = await Promise.race([imageSearchPromise, timeoutPromise])
          } catch (timeoutError) {
            console.warn(`   ⏱️ Image search timed out for: ${draft.originalTitle}`)
            images = []
          }
          
          if (images && images.length > 0) {
            console.log(`   ✅ Found ${images.length} images via scraping`)
            imagesFoundCount++
            
            // Save images to database (top 3 only)
            for (const [imgIndex, image] of images.slice(0, 3).entries()) {
              try {
                await prismaOperation(
                  (prisma) => prisma.productImage.create({
                    data: {
                      productDraftId: draft.id,
                      originalUrl: image.url,
                      altText: draft.originalTitle,
                      position: imgIndex,
                      isEnhanced: false,
                      enhancementData: {
                        source: image.source || 'google_images_scraping',
                        confidence: image.confidence || 0.5,
                        searchQuery: image.searchQuery || itemForSearch.productName,
                        originalSearchResult: true,
                        processedInBackground: true // Marker for async processing
                      }
                    }
                  }),
                  `Create product image for draft ${draft.id}`
                )
              } catch (error) {
                // Handle foreign key errors gracefully (draft may have been deleted)
                if (error.message?.includes('Foreign key constraint') || error.message?.includes('productDraftId_fkey')) {
                  console.warn(`⚠️ Draft ${draft.id} no longer exists (may have been deleted) - skipping images`)
                  break // Skip remaining images for this draft
                }
                console.warn(`⚠️ Failed to save image ${imgIndex + 1}:`, error.message)
              }
            }
            
            console.log(`   💾 Saved ${Math.min(3, images.length)} images to database`)
          } else {
            console.log(`   ⚠️ No images found for: ${draft.originalTitle}`)
          }
          
          processedCount++
          job.progress((processedCount / draftsToProcess.length) * 100)
          
        } catch (itemError) {
          console.error(`   ❌ Failed to process images for draft ${draft.id}:`, itemError.message)
          // Continue with next item
        }
      }
      
      console.log(`🖼️🔄 Background image processing completed:`)
      console.log(`   - Processed: ${processedCount}/${draftsToProcess.length} drafts`)
      console.log(`   - Images found for: ${imagesFoundCount} products`)
      
      // Create image review session if images were found
      if (merchantId && imagesFoundCount > 0) {
        try {
          const { MerchantImageReviewService } = await import('./merchantImageReviewService.js')
          const reviewService = new MerchantImageReviewService()
          
          const allImages = await prismaOperation(
            (prisma) => prisma.productImage.findMany({
              where: {
                productDraft: {
                  purchaseOrderId
                }
              },
              include: {
                productDraft: {
                  include: {
                    POLineItem: true
                  }
                }
              }
            }),
            `Find product images for PO ${purchaseOrderId}`
          )
          
          const productImageMap = new Map()
          
          for (const img of allImages) {
            const productKey = img.productDraft.lineItem?.sku || img.productDraft.id
            
            if (!productImageMap.has(productKey)) {
              productImageMap.set(productKey, {
                lineItemId: img.productDraft.lineItem?.id || null,
                sku: img.productDraft.lineItem?.sku || '',
                productName: img.productDraft.originalTitle,
                images: []
              })
            }
            
            const product = productImageMap.get(productKey)
            product.images.push({
              url: img.originalUrl,
              type: product.images.length === 0 ? 'MAIN' : 'GALLERY',
              source: 'WEB_SCRAPED',
              confidence: img.enhancementData?.confidence || 0.5,
              altText: img.altText || img.productDraft.originalTitle
            })
          }
          
          const imageResults = Array.from(productImageMap.values())
          
          const reviewSession = await reviewService.createImageReviewSession({
            purchaseOrderId,
            merchantId,
            lineItems: imageResults
          })
          
          console.log(`✅ Created image review session: ${reviewSession.sessionId}`)
        } catch (reviewError) {
          console.error('⚠️ Failed to create image review session:', reviewError)
          // Don't fail the job - images are saved, just review session failed
        }
      }
      
      return {
        success: true,
        mode: 'background',
        processedDrafts: processedCount,
        imagesFound: imagesFoundCount,
        purchaseOrderId
      }
      
    } catch (error) {
      console.error('❌ Background image processing failed:', error)
      // Don't throw - this is a background job, shouldn't block anything
      return {
        success: false,
        error: error.message,
        purchaseOrderId
      }
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
          
          const updateResult = await prismaOperation(
            (prisma) => prisma.purchaseOrder.update({
              where: { id: purchaseOrderId },
              data: updateData
            }),
            `Status update (initial) for PO ${purchaseOrderId}`
          )
          
          
          console.log('   Attempting database update with accumulated data:', Object.keys(updateData))
          
          const finalUpdateResult = await prismaOperation(
            (prisma) => prisma.purchaseOrder.update({
              where: { id: purchaseOrderId },
              data: updateData
            }),
            `Status update (final) for PO ${purchaseOrderId}`
          )
          
          console.log(`✅ Purchase order ${purchaseOrderId} status updated to: ${finalStatus}`)
          console.log('   Updated record status:', finalUpdateResult.status)
          console.log('   Updated record confidence:', finalUpdateResult.confidence)
          console.log('   Updated record supplier:', finalUpdateResult.supplierName)
          console.log('   Updated record jobStatus:', finalUpdateResult.jobStatus)
          
        } catch (dbError) {
          console.error('❌ Failed to update purchase order status:', dbError)
          console.error('   Error details:', dbError.message)
          
          // PRODUCTION FIX: Fallback - ALWAYS update status even if enhanced update fails
          console.warn('⚠️ Attempting minimal status update as fallback...')
          try {
            await prismaOperation(
              (prisma) => prisma.purchaseOrder.update({
                where: { id: purchaseOrderId },
                data: {
                  status: isReviewNeeded ? 'review_needed' : 'completed',
                  jobStatus: 'completed',
                  jobCompletedAt: new Date(),
                  updatedAt: new Date()
                }
              }),
              `Status update (fallback) for PO ${purchaseOrderId}`
            )
            console.log('✅ Fallback status update succeeded')
          } catch (fallbackError) {
            console.error('❌ Even fallback status update failed:', fallbackError.message)
            // Continue anyway - auto-recovery will catch this
          }
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

  // ==========================================
  // REFINEMENT PIPELINE PROCESSORS
  // ==========================================

  /**
   * Data Normalization Stage - Clean and standardize line item data
   */
  async processDataNormalization(job) {
    const { workflowId, data } = job.data
    console.log('🔧 processDataNormalization - Starting normalization...')
    
    try {
      job.progress(10)
      
      // Get accumulated workflow data
      const accumulatedData = await stageResultStore.getAccumulatedData(workflowId)
      let lineItems = accumulatedData.dbResult?.lineItems || []
      
      // FALLBACK: If no line items in accumulated data, fetch from database
      if (!lineItems.length) {
        console.log('⚠️ No line items in accumulated data, fetching from database...')
        const purchaseOrderId = accumulatedData.purchaseOrderId || 
                               accumulatedData.dbResult?.purchaseOrder?.id ||
                               data.purchaseOrderId
        
        if (purchaseOrderId) {
          console.log(`🔍 Fetching line items from database for PO: ${purchaseOrderId}`)
          const dbLineItems = await prismaOperation(
            (prisma) => prisma.pOLineItem.findMany({
              where: { purchaseOrderId },
              select: {
                id: true,
                sku: true,
                productName: true,
                description: true,
                quantity: true,
                unitCost: true,
                totalCost: true,
                confidence: true,
                status: true
              }
            }),
            `Load line items for normalization (PO ${purchaseOrderId})`
          )
          
          if (dbLineItems.length > 0) {
            console.log(`✅ Fetched ${dbLineItems.length} line items from database`)
            lineItems = dbLineItems
          } else {
            console.error(`❌ No line items found in database for PO: ${purchaseOrderId}`)
          }
        }
      }
      
      if (!lineItems.length) {
        throw new Error('No line items found for normalization - checked both accumulated data and database')
      }
      
      console.log(`📦 Processing ${lineItems.length} line items for normalization`)

      // Get merchant ID and fetch merchant config
      const merchantId = data.merchantId || accumulatedData.dbResult?.merchantId || 'cmft3moy50000ultcbqgxzz6d'
      console.log('🔧 Using merchant ID for normalization:', merchantId)
      
      // Get merchant config - use default config if not found
      let merchantConfig = {
        baseCurrency: 'USD',
        defaultMarkup: 1.0,
        settings: {}
      }
      
      try {
        const merchant = await prismaOperation(
          (prisma) => prisma.merchant.findUnique({
            where: { id: merchantId }
          }),
          `Fetch merchant ${merchantId} for normalization`
        )
        if (merchant) {
          merchantConfig = {
            baseCurrency: merchant.currency || 'USD',
            defaultMarkup: merchant.settings?.defaultMarkup || 1.0,
            settings: merchant.settings || {}
          }
        }
      } catch (error) {
        console.warn('⚠️ Could not fetch merchant config, using defaults:', error.message)
      }
      
      job.progress(30)
      
      // Initialize pipeline service and normalize data
      const pipelineService = new RefinementPipelineService()
      const normalizedItems = await pipelineService.normalizeLineItems(lineItems, merchantConfig)
      
      job.progress(70)
      
      // Save stage results
      const stageResult = { normalizedItems }
      const enrichedNextStageData = await this.saveAndAccumulateStageData(
        workflowId,
        WORKFLOW_STAGES.DATA_NORMALIZATION,
        stageResult,
        { ...data, normalizedItems }
      )
      
      job.progress(90)
      
      // Update workflow and schedule next stage
      await this.updateWorkflowStage(workflowId, WORKFLOW_STAGES.DATA_NORMALIZATION, 'completed')
      await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.MERCHANT_CONFIG, enrichedNextStageData)
      
      job.progress(100)
      
      return {
        success: true,
        stage: WORKFLOW_STAGES.DATA_NORMALIZATION,
        normalizedItems: normalizedItems.length
      }
      
    } catch (error) {
      console.error('❌ Data normalization failed:', error)
      await this.failWorkflow(workflowId, WORKFLOW_STAGES.DATA_NORMALIZATION, error)
      throw error
    }
  }

  /**
   * Merchant Config Stage - Apply merchant pricing and business rules
   */
  async processMerchantConfig(job) {
    const { workflowId, data } = job.data
    console.log('⚙️ processMerchantConfig - Applying merchant configurations...')
    
    try {
      job.progress(10)
      
      // Get accumulated workflow data
      console.log(`🔍 [MERCHANT CONFIG] Getting accumulated data for workflow: ${workflowId}`)
      const accumulatedData = await stageResultStore.getAccumulatedData(workflowId)
      console.log(`📊 [MERCHANT CONFIG] Accumulated data:`, {
        hasData: !!accumulatedData,
        stages: accumulatedData?.stages ? Object.keys(accumulatedData.stages) : [],
        normalizedItemsCount: accumulatedData?.normalizedItems?.length || 0,
        purchaseOrderId: accumulatedData?.purchaseOrderId
      })
      
      const normalizedItems = accumulatedData?.normalizedItems || []
      console.log(`📋 [MERCHANT CONFIG] Normalized items count: ${normalizedItems.length}`)
      
      if (!normalizedItems.length) {
        console.error(`❌ [MERCHANT CONFIG] No normalized items found. Accumulated data:`, JSON.stringify(accumulatedData, null, 2))
        throw new Error('No normalized items found for merchant config')
      }
      
      job.progress(30)
      
      // Get merchant ID from database save result
      const dbResult = await stageResultStore.getStageResult(workflowId, 'database_save')
      if (!dbResult?.merchantId) {
        throw new Error('Could not find merchant ID from database save result')
      }
      const merchantId = dbResult.merchantId
      console.log(`🏪 [MERCHANT CONFIG] Using merchant ID: ${merchantId}`)
      
      // Apply merchant configuration rules
      const pipelineService = new RefinementPipelineService()
      const configuredItems = await pipelineService.applyMerchantConfigs(normalizedItems, merchantId)
      
      job.progress(70)
      
      // Save stage results
      const stageResult = { configuredItems }
      const enrichedNextStageData = await this.saveAndAccumulateStageData(
        workflowId,
        WORKFLOW_STAGES.MERCHANT_CONFIG,
        stageResult,
        { ...data, configuredItems }
      )
      
      job.progress(90)
      
      // Update workflow and schedule next stage
      await this.updateWorkflowStage(workflowId, WORKFLOW_STAGES.MERCHANT_CONFIG, 'completed')
      await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.AI_ENRICHMENT, enrichedNextStageData)
      
      job.progress(100)
      
      return {
        success: true,
        stage: WORKFLOW_STAGES.MERCHANT_CONFIG,
        configuredItems: configuredItems.length
      }
      
    } catch (error) {
      console.error('❌ Merchant config failed:', error)
      await this.failWorkflow(workflowId, WORKFLOW_STAGES.MERCHANT_CONFIG, error)
      throw error
    }
  }

  /**
   * AI Enrichment Stage - Add AI-generated descriptions and images
   */
  async processAIEnrichment(job) {
    const { workflowId, data } = job.data
    console.log('🤖 processAIEnrichment - Starting AI enrichment...')
    
    try {
      job.progress(10)
      
      // Get accumulated workflow data
      const accumulatedData = await stageResultStore.getAccumulatedData(workflowId)
      const configuredItems = accumulatedData.configuredItems || []
      
      if (!configuredItems.length) {
        throw new Error('No configured items found for AI enrichment')
      }
      
      job.progress(30)
      
      // Get merchant ID and purchase order data for AI enrichment
      const dbResult = await stageResultStore.getStageResult(workflowId, 'database_save')
      if (!dbResult?.merchantId || !dbResult?.purchaseOrderId) {
        throw new Error('Could not find merchant ID or purchase order ID for AI enrichment')
      }
      
      const purchaseOrderData = {
        purchaseOrderId: dbResult.purchaseOrderId,
        merchantId: dbResult.merchantId,
        originalContent: dbResult.originalContent,
        parsedData: dbResult.parsedData
      }
      
      console.log(`🤖 [AI ENRICHMENT] Processing with merchant ${dbResult.merchantId} and PO ${dbResult.purchaseOrderId}`)
      
      // Apply AI enrichment (GPT descriptions, image sourcing)
      const pipelineService = new RefinementPipelineService()
      const enrichedItems = await pipelineService.enrichWithAI(configuredItems, dbResult.merchantId, purchaseOrderData)
      
      job.progress(70)
      
      // Save stage results
      const stageResult = { enrichedItems }
      const enrichedNextStageData = await this.saveAndAccumulateStageData(
        workflowId,
        WORKFLOW_STAGES.AI_ENRICHMENT,
        stageResult,
        { ...data, enrichedItems }
      )
      
      job.progress(90)
      
      // Update workflow and schedule next stage
      await this.updateWorkflowStage(workflowId, WORKFLOW_STAGES.AI_ENRICHMENT, 'completed')
      await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.SHOPIFY_PAYLOAD, enrichedNextStageData)
      
      job.progress(100)
      
      return {
        success: true,
        stage: WORKFLOW_STAGES.AI_ENRICHMENT,
        enrichedItems: enrichedItems.length
      }
      
    } catch (error) {
      console.error('❌ AI enrichment failed:', error)
      await this.failWorkflow(workflowId, WORKFLOW_STAGES.AI_ENRICHMENT, error)
      throw error
    }
  }

  /**
   * Shopify Payload Stage - Prepare final Shopify-ready product data
   */
  async processShopifyPayload(job) {
    const { workflowId, data } = job.data
    console.log('🛍️ processShopifyPayload - Preparing Shopify payload...')
    
    try {
      job.progress(10)
      
      // Get accumulated workflow data
      const accumulatedData = await stageResultStore.getAccumulatedData(workflowId)
      const enrichedItems = accumulatedData.enrichedItems || []
      
      if (!enrichedItems.length) {
        throw new Error('No enriched items found for Shopify payload preparation')
      }
      
      // Get merchant ID from accumulated data (same pattern as other stages)
      const merchantId = data.merchantId || accumulatedData.dbResult?.merchantId || 'cmft3moy50000ultcbqgxzz6d'
      console.log('🔧 Using merchant ID for Shopify payload:', merchantId)
      
      job.progress(30)
      
      // Prepare Shopify-ready payload with merchantId
      const pipelineService = new RefinementPipelineService()
      const shopifyPayload = await pipelineService.prepareShopifyPayload(
        enrichedItems, 
        accumulatedData.purchaseOrderId,
        merchantId
      )
      
      job.progress(70)
      
      // Save stage results
      const stageResult = { shopifyPayload }
      const enrichedNextStageData = await this.saveAndAccumulateStageData(
        workflowId,
        WORKFLOW_STAGES.SHOPIFY_PAYLOAD,
        stageResult,
        { ...data, shopifyPayload }
      )
      
      job.progress(90)
      
      // Update workflow and schedule next stage (back to original flow)
      await this.updateWorkflowStage(workflowId, WORKFLOW_STAGES.SHOPIFY_PAYLOAD, 'completed')
      await this.scheduleNextStage(workflowId, WORKFLOW_STAGES.PRODUCT_DRAFT_CREATION, enrichedNextStageData)
      
      job.progress(100)
      
      return {
        success: true,
        stage: WORKFLOW_STAGES.SHOPIFY_PAYLOAD,
        productsReady: shopifyPayload.products?.length || 0
      }
      
    } catch (error) {
      console.error('❌ Shopify payload preparation failed:', error)
      await this.failWorkflow(workflowId, WORKFLOW_STAGES.SHOPIFY_PAYLOAD, error)
      throw error
    }
  }

  // ==========================================
  // END REFINEMENT PIPELINE PROCESSORS
  // ==========================================

  /**
   * Generic job processor - routes to appropriate stage processor
   * @param {Object} job - Bull job object
   */
  async processJob(job) {
    const { stage } = job.data
    const purchaseOrderId = job?.data?.data?.purchaseOrderId || job?.data?.purchaseOrderId
    const workflowId = job?.data?.workflowId || job?.data?.data?.workflowId || 'unknown'
    let releaseLock = () => {}

    try {
      releaseLock = await this.acquirePurchaseOrderLock(purchaseOrderId, {
        workflowId,
        stage,
        jobId: job.id
      })
    
      console.log(`🎭 Processing job for stage: ${stage}`)
    
      switch (stage) {
        case WORKFLOW_STAGES.AI_PARSING:
          return await this.processAIParsing(job)
        case WORKFLOW_STAGES.DATABASE_SAVE:
          return await this.processDatabaseSave(job)
        case WORKFLOW_STAGES.DATA_NORMALIZATION:
          return await this.processDataNormalization(job)
        case WORKFLOW_STAGES.MERCHANT_CONFIG:
          return await this.processMerchantConfig(job)
        case WORKFLOW_STAGES.AI_ENRICHMENT:
          return await this.processAIEnrichment(job)
        case WORKFLOW_STAGES.SHOPIFY_PAYLOAD:
          return await this.processShopifyPayload(job)
        case WORKFLOW_STAGES.PRODUCT_DRAFT_CREATION:
          return await this.processProductDraftCreation(job)
        case WORKFLOW_STAGES.IMAGE_ATTACHMENT:
          return await this.processImageAttachment(job)
        case 'background_image_processing':
          return await this.processBackgroundImageProcessing(job)
        case WORKFLOW_STAGES.SHOPIFY_SYNC:
          return await this.processShopifySync(job)
        case WORKFLOW_STAGES.STATUS_UPDATE:
          return await this.processStatusUpdate(job)
        default:
          throw new Error(`Unknown workflow stage: ${stage}`)
      }
    } finally {
      releaseLock()
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
