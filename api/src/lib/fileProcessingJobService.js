/**
 * Background Job Processing Service
 * Handles file processing jobs with progress tracking and error handling
 */

import Queue from 'bull'
import { fileParsingService } from './fileParsingService.js'
import { aiProcessingService } from './aiProcessingService.js'
import { redisManager } from './redisManager.js'
import { db } from './db.js'

// Queue will be created lazily when needed
let fileProcessingQueue = null

export class FileProcessingJobService {
  constructor() {
    this.queue = null
    this.isInitialized = false
  }

  /**
   * Initialize the queue with Redis or fallback
   */
  async initializeQueue() {
    if (this.isInitialized) return this.queue

    try {
      console.log('Initializing job processing queue...')
      
      // Wait for Redis configuration (with timeout)
      const redisConfig = await redisManager.getQueueRedisConfig(true)
      
      if (!redisConfig) {
        console.warn('Redis not available, using in-memory queue (development only)')
        this.queue = new Queue('file processing')
      } else {
        console.log('Creating Redis-backed job queue...')
        this.queue = new Queue('file processing', {
          redis: redisConfig,
          defaultJobOptions: {
            attempts: 5,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
            removeOnComplete: 50,
            removeOnFail: 20,
            timeout: 300000, // 5 minutes
          },
          settings: {
            stalledInterval: 30000,
            maxStalledCount: 3,
            retryProcessDelay: 5000,
          }
        })
      }

      this.setupJobProcessors()
      this.setupJobEvents()
      this.isInitialized = true
      
      console.log(`Job queue initialized: ${redisConfig ? 'Redis-backed' : 'In-memory'}`)
      return this.queue
      
    } catch (error) {
      console.error('Failed to initialize job queue:', error)
      // Fallback to in-memory queue
      this.queue = new Queue('file processing')
      this.setupJobProcessors()
      this.setupJobEvents()
      this.isInitialized = true
      return this.queue
    }
  }

  /**
   * Get queue (initialize if needed)
   */
  async getQueue() {
    if (!this.isInitialized) {
      await this.initializeQueue()
    }
    return this.queue
  }

  /**
   * Add file processing job to queue
   */
  async addFileProcessingJob(uploadId, fileData, options = {}) {
    try {
      const queue = await this.getQueue()
      
      const jobData = {
        uploadId,
        fileName: fileData.fileName,
        fileSize: fileData.fileSize,
        mimeType: fileData.mimeType,
        merchantId: fileData.merchantId,
        supplierId: fileData.supplierId,
        buffer: fileData.buffer,
        autoProcess: options.autoProcess !== false,
        aiSettings: options.aiSettings || {}
      }

      const job = await queue.add('processFile', jobData, {
        jobId: uploadId,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: 10,
        removeOnFail: 5
      })

      console.log(`File processing job queued: ${uploadId}`)
      return job
    } catch (error) {
      console.error(`Failed to queue file processing job: ${uploadId}`, error)
      throw error
    }
  }

  /**
   * Get job status and progress
   */
  async getJobStatus(uploadId) {
    try {
      const queue = await this.getQueue()
      const job = await queue.getJob(uploadId)
      
      if (!job) {
        return {
          status: 'not_found',
          progress: 0,
          message: 'Job not found'
        }
      }

      const jobState = await job.getState()
      const progress = job.progress()
      
      return {
        status: jobState,
        progress: progress || 0,
        message: this.getStatusMessage(jobState, progress),
        result: job.returnvalue,
        error: job.failedReason,
        createdAt: new Date(job.timestamp),
        processedOn: job.processedOn ? new Date(job.processedOn) : null,
        finishedOn: job.finishedOn ? new Date(job.finishedOn) : null
      }
    } catch (error) {
      console.error(`Failed to get job status: ${uploadId}`, error)
      return {
        status: 'error',
        progress: 0,
        message: 'Failed to get job status',
        error: error.message
      }
    }
  }

  /**
   * Setup job processors
   */
  setupJobProcessors() {
    this.queue.process('processFile', async (job) => {
      return await this.processFileJob(job)
    })
  }

  /**
   * Setup job event handlers
   */
  setupJobEvents() {
    this.queue.on('completed', (job, result) => {
      console.log(`Job ${job.id} completed successfully`)
    })

    this.queue.on('failed', (job, error) => {
      console.error(`Job ${job.id} failed:`, error)
    })

    this.queue.on('progress', (job, progress) => {
      console.log(`Job ${job.id} progress: ${progress}%`)
    })
  }

  /**
   * Main file processing job handler with enhanced Redis tracking
   */
  async processFileJob(job) {
    const { uploadId, fileName, mimeType, buffer, merchantId, supplierId, aiSettings } = job.data
    
    try {
      console.log(`Starting file processing job: ${uploadId}`)
      
      // Publish job start event
      await redisManager.publishJobProgress(uploadId, 0, 'started', `Processing file: ${fileName}`)
      
      // Step 1: Parse file content (20% progress)
      await this.updateJobProgress(job, uploadId, 20, 'parsing', 'Parsing file content...')
      
      const parsedContent = await fileParsingService.parseFile(buffer, mimeType, fileName)
      
      // Step 2: AI processing (60% progress)  
      await this.updateJobProgress(job, uploadId, 60, 'processing', 'Extracting data with AI...')
      
      const extractedData = await aiProcessingService.extractPurchaseOrderData(
        parsedContent, 
        fileName, 
        aiSettings
      )

      // Step 3: Save to database (80% progress)
      await this.updateJobProgress(job, uploadId, 80, 'saving', 'Saving to database...')
      
      const purchaseOrder = await this.savePurchaseOrderToDatabase(
        extractedData,
        uploadId,
        fileName,
        merchantId,
        supplierId
      )

      // Step 4: Complete (100% progress)
      await this.updateJobProgress(job, uploadId, 100, 'completed', 'Processing completed successfully')
      
      const result = {
        success: true,
        uploadId,
        purchaseOrder,
        confidence: extractedData.confidence,
        processingTime: Date.now() - job.timestamp,
        extractionMethod: extractedData.processingMethod
      }

      // Publish completion event
      await redisManager.publishJobProgress(uploadId, 100, 'completed', 'File processed successfully')

      return result

    } catch (error) {
      console.error(`[${uploadId}] Processing failed:`, error)
      
      // Publish failure event
      await redisManager.publishJobProgress(uploadId, job.progress(), 'failed', error.message)
      
      // Save error state to database
      await this.saveProcessingError(uploadId, merchantId, error.message)
      
      throw error
    }
  }

  /**
   * Update job progress with Redis notification
   */
  async updateJobProgress(job, uploadId, progress, status, message) {
    job.progress(progress)
    console.log(`[${uploadId}] ${message} (${progress}%)`)
    await redisManager.publishJobProgress(uploadId, progress, status, message)
  }

  /**
   * Save processed PO data to database
   */
  async savePurchaseOrderToDatabase(extractedData, uploadId, fileName, merchantId, supplierId) {
    try {
      const { purchaseOrder: poData, lineItems, confidence } = extractedData
      const prisma = await db.getClient()
      
      // Find or create supplier
      let supplier = null
      if (supplierId) {
        supplier = await prisma.supplier.findFirst({
          where: { id: supplierId, merchantId }
        })
      } else if (poData.supplierName) {
        supplier = await prisma.supplier.findFirst({
          where: { 
            name: poData.supplierName,
            merchantId 
          }
        })
      }

      // Create purchase order
      const purchaseOrder = await prisma.purchaseOrder.create({
        data: {
          number: poData.number || `PO-${Date.now()}`,
          supplierName: poData.supplierName,
          orderDate: poData.orderDate ? new Date(poData.orderDate) : null,
          dueDate: poData.dueDate ? new Date(poData.dueDate) : null,
          totalAmount: poData.totalAmount || 0,
          currency: poData.currency || 'USD',
          status: confidence.overall >= 0.8 ? 'completed' : 'review_needed',
          confidence: confidence.overall,
          rawData: extractedData,
          processingNotes: extractedData.extractionNotes || '',
          fileName,
          fileSize: 0, // Will be updated when we add proper file storage
          merchantId,
          supplierId: supplier?.id,
          lineItems: {
            create: lineItems.map(item => ({
              sku: item.sku || '',
              productName: item.productName || item.name || '',
              description: item.description || '',
              quantity: item.quantity || 0,
              unitCost: item.unitCost || 0,
              totalCost: item.totalCost || (item.quantity * item.unitCost) || 0,
              confidence: this.calculateItemConfidence(item),
              status: this.determineItemStatus(item, confidence.overall),
              aiNotes: this.generateAINotesForItem(item)
            }))
          }
        },
        include: {
          lineItems: true,
          supplier: true
        }
      })

      console.log(`Purchase order created: ${purchaseOrder.id}`)
      return purchaseOrder

    } catch (error) {
      console.error('Database save error:', error)
      throw new Error(`Failed to save to database: ${error.message}`)
    }
  }

  /**
   * Save processing error to database
   */
  async saveProcessingError(uploadId, merchantId, errorMessage) {
    try {
      const prisma = await db.getClient()
      await prisma.purchaseOrder.create({
        data: {
          number: `ERROR-${uploadId}`,
          supplierName: 'Unknown',
          totalAmount: 0,
          status: 'failed',
          confidence: 0,
          processingNotes: `Processing failed: ${errorMessage}`,
          fileName: `failed-${uploadId}`,
          merchantId
        }
      })
    } catch (error) {
      console.error('Failed to save processing error:', error)
    }
  }

  /**
   * Calculate confidence score for individual line item
   */
  calculateItemConfidence(item) {
    const confidenceFields = Object.keys(item).filter(key => key.endsWith('Confidence'))
    if (confidenceFields.length === 0) return 0.5
    
    const sum = confidenceFields.reduce((total, field) => total + (item[field] || 0), 0)
    return sum / confidenceFields.length
  }

  /**
   * Determine status for line item based on confidence
   */
  determineItemStatus(item, overallConfidence) {
    const itemConfidence = this.calculateItemConfidence(item)
    
    if (itemConfidence >= 0.9 && overallConfidence >= 0.8) return 'matched'
    if (itemConfidence >= 0.7) return 'updated'
    if (itemConfidence >= 0.5) return 'review_needed'
    return 'error'
  }

  /**
   * Generate AI processing notes for line item
   */
  generateAINotesForItem(item) {
    const notes = []
    const itemConfidence = this.calculateItemConfidence(item)
    
    if (itemConfidence < 0.7) {
      notes.push('Low confidence extraction - manual review recommended')
    }
    
    if (!item.sku || (item.skuConfidence && item.skuConfidence < 0.6)) {
      notes.push('SKU unclear or missing')
    }
    
    if (item.quantityConfidence && item.quantityConfidence < 0.8) {
      notes.push('Quantity may need verification')
    }
    
    return notes.join('; ') || 'AI processing completed successfully'
  }

  /**
   * Setup job event handlers
   */
  setupJobEvents() {
    this.queue.on('completed', (job, result) => {
      console.log(`Job ${job.id} completed successfully`)
    })

    this.queue.on('failed', (job, error) => {
      console.error(`Job ${job.id} failed:`, error)
    })

    this.queue.on('progress', (job, progress) => {
      console.log(`Job ${job.id} progress: ${progress}%`)
    })
  }

  /**
   * Get human-readable status message
   */
  getStatusMessage(status, progress) {
    const messages = {
      'waiting': 'Waiting in queue...',
      'active': `Processing... ${progress}% complete`,
      'completed': 'Processing completed successfully',
      'failed': 'Processing failed',
      'delayed': 'Processing delayed',
      'paused': 'Processing paused'
    }
    
    return messages[status] || `Status: ${status}`
  }

  /**
   * Clean up completed jobs and add monitoring methods
   */
  async cleanupJobs(options = {}) {
    const { olderThan = '1d', includeCompleted = true, includeFailed = false } = options
    
    try {
      const timeThreshold = this.parseTimeString(olderThan)
      let removedCount = 0
      const details = { completed: 0, failed: 0 }
      
      if (includeCompleted) {
        const completed = await this.queue.clean(timeThreshold, 'completed')
        details.completed = completed.length
        removedCount += completed.length
      }
      
      if (includeFailed) {
        const failed = await this.queue.clean(timeThreshold, 'failed')
        details.failed = failed.length
        removedCount += failed.length
      }
      
      console.log(`Cleaned up ${removedCount} old jobs`)
      return { removedCount, details }
    } catch (error) {
      console.error('Failed to cleanup jobs:', error)
      throw error
    }
  }

  /**
   * Get comprehensive queue statistics
   */
  async getQueueStatistics() {
    try {
      const queue = await this.getQueue()
      
      const [
        waiting,
        active,
        completed,
        failed,
        delayed
      ] = await Promise.all([
        queue.getWaiting(),
        queue.getActive(),
        queue.getCompleted(),
        queue.getFailed(),
        queue.getDelayed()
      ])

      // Try to get paused jobs if method exists
      let paused = []
      try {
        if (typeof queue.getPaused === 'function') {
          paused = await queue.getPaused()
        }
      } catch (error) {
        console.log('getPaused method not available, skipping...')
      }

      return {
        counts: {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          delayed: delayed.length,
          paused: paused.length,
          total: waiting.length + active.length + completed.length + failed.length + delayed.length + paused.length
        },
        activeJobs: active.slice(0, 5).map(job => ({
          id: job.id,
          name: job.name,
          progress: job.progress(),
          timestamp: new Date(job.timestamp).toISOString()
        })),
        recentFailed: failed.slice(0, 5).map(job => ({
          id: job.id,
          name: job.name,
          error: job.failedReason,
          timestamp: new Date(job.timestamp).toISOString()
        }))
      }
    } catch (error) {
      console.error('Failed to get queue statistics:', error)
      throw error
    }
  }

  /**
   * Get active jobs with pagination
   */
  async getActiveJobs(options = {}) {
    const { page = 1, limit = 20, status } = options
    
    try {
      let jobs
      switch (status) {
        case 'active':
          jobs = await this.queue.getActive()
          break
        case 'waiting':
          jobs = await this.queue.getWaiting()
          break
        case 'completed':
          jobs = await this.queue.getCompleted()
          break
        case 'failed':
          jobs = await this.queue.getFailed()
          break
        default:
          const [active, waiting] = await Promise.all([
            this.queue.getActive(),
            this.queue.getWaiting()
          ])
          jobs = [...active, ...waiting]
      }

      const startIndex = (page - 1) * limit
      const endIndex = startIndex + limit
      const paginatedJobs = jobs.slice(startIndex, endIndex)

      return {
        jobs: paginatedJobs.map(job => ({
          id: job.id,
          name: job.name,
          status: job.opts?.jobId ? 'active' : 'waiting',
          progress: job.progress(),
          data: job.data,
          timestamp: new Date(job.timestamp).toISOString(),
          attempts: job.attemptsMade || 0
        })),
        pagination: {
          page,
          limit,
          total: jobs.length,
          pages: Math.ceil(jobs.length / limit)
        }
      }
    } catch (error) {
      console.error('Failed to get active jobs:', error)
      throw error
    }
  }

  /**
   * Get failed jobs for debugging
   */
  async getFailedJobs(options = {}) {
    const { page = 1, limit = 20 } = options
    
    try {
      const failedJobs = await this.queue.getFailed()
      const startIndex = (page - 1) * limit
      const endIndex = startIndex + limit
      const paginatedJobs = failedJobs.slice(startIndex, endIndex)

      return {
        jobs: paginatedJobs.map(job => ({
          id: job.id,
          name: job.name,
          error: job.failedReason,
          data: job.data,
          timestamp: new Date(job.timestamp).toISOString(),
          failedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
          attempts: job.attemptsMade || 0
        })),
        pagination: {
          page,
          limit,
          total: failedJobs.length,
          pages: Math.ceil(failedJobs.length / limit)
        }
      }
    } catch (error) {
      console.error('Failed to get failed jobs:', error)
      throw error
    }
  }

  /**
   * Retry failed job
   */
  async retryJob(jobId) {
    try {
      const job = await this.queue.getJob(jobId)
      
      if (!job) {
        return { success: false, error: 'Job not found' }
      }

      const jobState = await job.getState()
      if (jobState !== 'failed') {
        return { success: false, error: 'Job is not in failed state' }
      }

      await job.retry()
      console.log(`Job ${jobId} retried successfully`)
      
      return { success: true, jobId }
    } catch (error) {
      console.error(`Failed to retry job ${jobId}:`, error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Remove job from queue
   */
  async removeJob(jobId) {
    try {
      const job = await this.queue.getJob(jobId)
      
      if (!job) {
        return { success: false, error: 'Job not found' }
      }

      await job.remove()
      console.log(`Job ${jobId} removed successfully`)
      
      return { success: true }
    } catch (error) {
      console.error(`Failed to remove job ${jobId}:`, error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Control queue (pause/resume)
   */
  async controlQueue(action) {
    try {
      if (action === 'pause') {
        await this.queue.pause()
        console.log('Queue paused')
        return { status: 'paused' }
      } else if (action === 'resume') {
        await this.queue.resume()
        console.log('Queue resumed')
        return { status: 'active' }
      }
      
      throw new Error('Invalid action')
    } catch (error) {
      console.error(`Failed to ${action} queue:`, error)
      throw error
    }
  }

  /**
   * Get processing metrics
   */
  async getProcessingMetrics(timeframe = '1h') {
    try {
      const timeThreshold = this.parseTimeString(timeframe)
      const currentTime = Date.now()
      
      const [completed, failed] = await Promise.all([
        this.queue.getCompleted(),
        this.queue.getFailed()
      ])

      const recentCompleted = completed.filter(job => 
        currentTime - job.finishedOn <= timeThreshold
      )
      
      const recentFailed = failed.filter(job => 
        currentTime - job.finishedOn <= timeThreshold
      )

      const processingTimes = recentCompleted
        .filter(job => job.finishedOn && job.processedOn)
        .map(job => job.finishedOn - job.processedOn)

      const avgProcessingTime = processingTimes.length > 0 
        ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length 
        : 0

      return {
        timeframe,
        completed: recentCompleted.length,
        failed: recentFailed.length,
        successRate: recentCompleted.length + recentFailed.length > 0 
          ? (recentCompleted.length / (recentCompleted.length + recentFailed.length)) * 100 
          : 100,
        averageProcessingTime: Math.round(avgProcessingTime / 1000), // seconds
        throughput: {
          completedPerHour: Math.round(recentCompleted.length * (3600000 / timeThreshold)),
          failedPerHour: Math.round(recentFailed.length * (3600000 / timeThreshold))
        }
      }
    } catch (error) {
      console.error('Failed to get processing metrics:', error)
      throw error
    }
  }

  /**
   * Parse time string to milliseconds
   */
  parseTimeString(timeStr) {
    const units = {
      's': 1000,
      'm': 60000,
      'h': 3600000,
      'd': 86400000,
      'w': 604800000
    }
    
    const match = timeStr.match(/^(\d+)([smhdw])$/)
    if (!match) {
      throw new Error('Invalid time format. Use format like: 1h, 30m, 2d')
    }
    
    const [, value, unit] = match
    return parseInt(value) * units[unit]
  }
  async cleanupJobs() {
    await this.queue.clean(24 * 60 * 60 * 1000, 'completed') // Remove completed jobs older than 24 hours
    await this.queue.clean(7 * 24 * 60 * 60 * 1000, 'failed') // Remove failed jobs older than 7 days
  }
}

// Create singleton instance
export const fileProcessingJobService = new FileProcessingJobService()

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down job processing service...')
  await fileProcessingQueue.close()
})

export default fileProcessingJobService