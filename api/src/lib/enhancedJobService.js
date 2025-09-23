/**
 * Enhanced File Processing Job Service with Dead Letter Queue
 * Production-ready job queue implementation with retry mechanisms and failure handling
 */

import Bull from 'bull'
import { RedisManager } from './redisManager.js'
import { getRedisConfig } from '../config/redis.production.js'

export class EnhancedFileProcessingJobService {
  constructor() {
    this.queue = null
    this.deadLetterQueue = null
    this.redisManager = new RedisManager()
    this.isInitialized = false
    this.jobStats = {
      processed: 0,
      completed: 0,
      failed: 0,
      retried: 0,
      deadLettered: 0
    }
    
    // Initialize queues
    this.initializeQueues()
  }

  /**
   * Initialize main job queue and dead letter queue
   */
  async initializeQueues() {
    try {
      await this.redisManager.waitForConnection(15000)
      
      const environment = process.env.NODE_ENV || 'development'
      const config = getRedisConfig(environment)
      const connectionOptions = config.connection
      
      // Main processing queue
      this.queue = new Bull('file-processing', {
        redis: connectionOptions,
        defaultJobOptions: config.jobQueue.defaultJobOptions,
        settings: {
          stalledInterval: 30000, // 30 seconds
          maxStalledCount: 1
        }
      })

      // Dead letter queue for failed jobs
      if (config.jobQueue.deadLetterQueue.enabled) {
        this.deadLetterQueue = new Bull(config.jobQueue.deadLetterQueue.queueName, {
          redis: connectionOptions,
          defaultJobOptions: {
            removeOnComplete: config.jobQueue.deadLetterQueue.maxSize,
            removeOnFail: false,
            attempts: 1 // Dead letter jobs don't retry
          }
        })
      }

      this.setupJobHandlers()
      this.setupEventHandlers()
      this.startHealthMonitoring()

      this.isInitialized = true
      console.log('Enhanced job queues initialized successfully')

    } catch (error) {
      console.error('Failed to initialize job queues:', error)
      throw error
    }
  }

  /**
   * Setup job processors
   */
  setupJobHandlers() {
    // Main queue processor
    this.queue.process('process-file', 3, async (job) => {
      try {
        const result = await this.processFile(job.data)
        this.jobStats.completed++
        this.jobStats.processed++
        return result
      } catch (error) {
        this.jobStats.failed++
        
        // Check if this is the final attempt
        if (job.attemptsMade >= job.opts.attempts) {
          await this.sendToDeadLetterQueue(job, error)
        }
        
        throw error
      }
    })

    // Dead letter queue processor (for manual review/reprocessing)
    if (this.deadLetterQueue) {
      this.deadLetterQueue.process('manual-review', async (job) => {
        // This processor is for manual intervention
        // Jobs here require human review before reprocessing
        console.log(`Dead letter job ${job.id} requires manual review:`, job.data)
        return { status: 'pending_review', reviewedAt: null }
      })
    }
  }

  /**
   * Setup event handlers for monitoring and stats
   */
  setupEventHandlers() {
    // Main queue events
    this.queue.on('completed', (job, result) => {
      console.log(`Job ${job.id} completed successfully`)
    })

    this.queue.on('failed', (job, err) => {
      console.error(`Job ${job.id} failed:`, err.message)
      
      if (job.attemptsMade < job.opts.attempts) {
        this.jobStats.retried++
        console.log(`Job ${job.id} will be retried (attempt ${job.attemptsMade + 1}/${job.opts.attempts})`)
      }
    })

    this.queue.on('stalled', (job) => {
      console.warn(`Job ${job.id} stalled and will be retried`)
    })

    // Dead letter queue events
    if (this.deadLetterQueue) {
      this.deadLetterQueue.on('completed', (job) => {
        console.log(`Dead letter job ${job.id} processed`)
      })
    }
  }

  /**
   * Send failed job to dead letter queue
   */
  async sendToDeadLetterQueue(job, error) {
    if (!this.deadLetterQueue) {
      console.warn('Dead letter queue not configured, job will be lost:', job.id)
      return
    }

    try {
      const deadLetterJobData = {
        originalJobId: job.id,
        originalJobData: job.data,
        failureReason: error.message,
        failureStack: error.stack,
        attemptsMade: job.attemptsMade,
        failedAt: new Date().toISOString(),
        priority: job.opts.priority || 5
      }

      await this.deadLetterQueue.add('manual-review', deadLetterJobData, {
        priority: this.getPriority('critical'), // Dead letter jobs are high priority for review
        delay: 0
      })

      this.jobStats.deadLettered++
      console.log(`Job ${job.id} sent to dead letter queue for review`)

    } catch (dlqError) {
      console.error(`Failed to send job ${job.id} to dead letter queue:`, dlqError)
    }
  }

  /**
   * Add a job to the processing queue with enhanced options
   */
  async addJob(jobType, jobData, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Job service not initialized')
    }

    const jobOptions = {
      priority: this.getPriority(options.priority || 'normal'),
      delay: options.delay || 0,
      attempts: options.attempts || 5,
      backoff: options.backoff || {
        type: 'exponential',
        delay: 2000
      },
      removeOnComplete: options.removeOnComplete || 100,
      removeOnFail: options.removeOnFail || 50
    }

    try {
      const job = await this.queue.add(jobType, jobData, jobOptions)
      console.log(`Job ${job.id} added to queue with priority ${jobOptions.priority}`)
      return job
    } catch (error) {
      console.error('Failed to add job to queue:', error)
      throw error
    }
  }

  /**
   * Get priority value from priority name
   */
  getPriority(priorityName) {
    const environment = process.env.NODE_ENV || 'development'
    const config = getRedisConfig(environment)
    return config.jobQueue.priorities[priorityName] || config.jobQueue.priorities.normal
  }

  /**
   * Process file job implementation
   */
  async processFile(data) {
    const { filePath, fileContent, options } = data
    
    // Simulate file processing
    console.log(`Processing file: ${filePath}`)
    
    // Add actual file processing logic here
    // This could include:
    // - PDF parsing
    // - Data extraction
    // - AI processing
    // - Database operations
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    return {
      success: true,
      filePath,
      processedAt: new Date().toISOString(),
      extractedData: {
        // Mock extracted data
        items: [],
        total: 0
      }
    }
  }

  /**
   * Reprocess a job from dead letter queue
   */
  async reprocessDeadLetterJob(deadLetterJobId, reviewNotes = '') {
    if (!this.deadLetterQueue) {
      throw new Error('Dead letter queue not configured')
    }

    try {
      const deadLetterJob = await this.deadLetterQueue.getJob(deadLetterJobId)
      if (!deadLetterJob) {
        throw new Error(`Dead letter job ${deadLetterJobId} not found`)
      }

      // Add original job back to main queue with review notes
      const originalData = {
        ...deadLetterJob.data.originalJobData,
        reprocessed: true,
        reviewNotes,
        reprocessedAt: new Date().toISOString()
      }

      const newJob = await this.addJob('process-file', originalData, {
        priority: 'high', // Reprocessed jobs get high priority
        attempts: 3 // Fewer attempts for reprocessed jobs
      })

      // Mark dead letter job as reprocessed
      await deadLetterJob.update({
        ...deadLetterJob.data,
        reprocessedAsJobId: newJob.id,
        reprocessedAt: new Date().toISOString(),
        reviewNotes
      })

      console.log(`Dead letter job ${deadLetterJobId} reprocessed as job ${newJob.id}`)
      return newJob

    } catch (error) {
      console.error(`Failed to reprocess dead letter job ${deadLetterJobId}:`, error)
      throw error
    }
  }

  /**
   * Get comprehensive queue statistics
   */
  async getQueueStats() {
    if (!this.isInitialized) {
      return { error: 'Job service not initialized' }
    }

    try {
      const mainQueueStats = await this.queue.getJobCounts()
      const deadLetterStats = this.deadLetterQueue ? 
        await this.deadLetterQueue.getJobCounts() : null

      return {
        mainQueue: mainQueueStats,
        deadLetterQueue: deadLetterStats,
        lifetime: this.jobStats,
        health: {
          isConnected: this.redisManager.isConnected,
          queuesInitialized: this.isInitialized,
          lastHealthCheck: new Date().toISOString()
        }
      }
    } catch (error) {
      console.error('Failed to get queue stats:', error)
      return { error: error.message }
    }
  }

  /**
   * Get dead letter queue jobs for manual review
   */
  async getDeadLetterJobs(status = 'waiting', limit = 50) {
    if (!this.deadLetterQueue) {
      return []
    }

    try {
      const jobs = await this.deadLetterQueue.getJobs([status], 0, limit)
      return jobs.map(job => ({
        id: job.id,
        originalJobId: job.data.originalJobId,
        failureReason: job.data.failureReason,
        failedAt: job.data.failedAt,
        attemptsMade: job.data.attemptsMade,
        priority: job.data.priority,
        reprocessed: !!job.data.reprocessedAsJobId,
        reviewNotes: job.data.reviewNotes || null
      }))
    } catch (error) {
      console.error('Failed to get dead letter jobs:', error)
      return []
    }
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    setInterval(async () => {
      try {
        const stats = await this.getQueueStats()
        
        // Log health metrics
        if (stats.mainQueue) {
          console.log(`Queue Health - Waiting: ${stats.mainQueue.waiting}, Active: ${stats.mainQueue.active}, Failed: ${stats.mainQueue.failed}`)
        }
        
        // Alert on high failure rates
        if (stats.lifetime.failed > 0) {
          const failureRate = stats.lifetime.failed / stats.lifetime.processed
          if (failureRate > 0.1) { // 10% failure rate threshold
            console.warn(`High job failure rate detected: ${(failureRate * 100).toFixed(1)}%`)
          }
        }

      } catch (error) {
        console.error('Health monitoring error:', error)
      }
    }, 60000) // Every minute
  }

  /**
   * Get processing jobs count
   */
  async getProcessingJobsCount() {
    if (!this.isInitialized) return 0
    try {
      const counts = await this.queue.getJobCounts()
      return counts.active + counts.waiting
    } catch (error) {
      console.error('Failed to get processing jobs count:', error)
      return 0
    }
  }

  /**
   * Get completed jobs count
   */
  async getCompletedJobsCount() {
    if (!this.isInitialized) return 0
    try {
      const counts = await this.queue.getJobCounts()
      return counts.completed
    } catch (error) {
      console.error('Failed to get completed jobs count:', error)
      return 0
    }
  }

  /**
   * Get failed jobs count
   */
  async getFailedJobsCount() {
    if (!this.isInitialized) return 0
    try {
      const counts = await this.queue.getJobCounts()
      return counts.failed
    } catch (error) {
      console.error('Failed to get failed jobs count:', error)
      return 0
    }
  }

  /**
   * Get dead letter queue count
   */
  async getDeadLetterQueueCount() {
    if (!this.deadLetterQueue) return 0
    try {
      const counts = await this.deadLetterQueue.getJobCounts()
      return counts.waiting + counts.active + counts.completed
    } catch (error) {
      console.error('Failed to get dead letter queue count:', error)
      return 0
    }
  }

  /**
   * Get recent failed jobs
   */
  async getRecentFailedJobs(limit = 10) {
    if (!this.isInitialized) return []
    try {
      const jobs = await this.queue.getJobs(['failed'], 0, limit)
      return jobs
    } catch (error) {
      console.error('Failed to get recent failed jobs:', error)
      return []
    }
  }

  /**
   * Get processing jobs with pagination
   */
  async getProcessingJobs(limit = 10, page = 1) {
    if (!this.isInitialized) return []
    try {
      const start = (page - 1) * limit
      const activeJobs = await this.queue.getJobs(['active'], start, start + limit - 1)
      const waitingJobs = await this.queue.getJobs(['waiting'], start, start + limit - 1)
      return [...activeJobs, ...waitingJobs].slice(0, limit)
    } catch (error) {
      console.error('Failed to get processing jobs:', error)
      return []
    }
  }

  /**
   * Get completed jobs with pagination
   */
  async getCompletedJobs(limit = 10, page = 1) {
    if (!this.isInitialized) return []
    try {
      const start = (page - 1) * limit
      const jobs = await this.queue.getJobs(['completed'], start, start + limit - 1)
      return jobs
    } catch (error) {
      console.error('Failed to get completed jobs:', error)
      return []
    }
  }

  /**
   * Get failed jobs with pagination
   */
  async getFailedJobs(limit = 10, page = 1) {
    if (!this.isInitialized) return []
    try {
      const start = (page - 1) * limit
      const jobs = await this.queue.getJobs(['failed'], start, start + limit - 1)
      return jobs
    } catch (error) {
      console.error('Failed to get failed jobs:', error)
      return []
    }
  }

  /**
   * Get dead letter jobs with pagination
   */
  async getDeadLetterJobs(limit = 10, page = 1) {
    if (!this.deadLetterQueue) return []
    try {
      const start = (page - 1) * limit
      const jobs = await this.deadLetterQueue.getJobs(['waiting', 'active', 'completed'], start, start + limit - 1)
      return jobs
    } catch (error) {
      console.error('Failed to get dead letter jobs:', error)
      return []
    }
  }

  /**
   * Get jobs by purchase order ID
   */
  async getJobsByPurchaseOrder(purchaseOrderId, status = null) {
    if (!this.isInitialized) return []
    try {
      const statuses = status ? [status] : ['waiting', 'active', 'completed', 'failed']
      const jobs = await this.queue.getJobs(statuses, 0, 100)
      
      const poJobs = jobs.filter(job => 
        job.data && job.data.purchaseOrderId === purchaseOrderId
      )

      // Also check dead letter queue
      if (this.deadLetterQueue && (!status || status === 'dead-letter')) {
        const dlqJobs = await this.deadLetterQueue.getJobs(['waiting', 'active', 'completed'], 0, 100)
        const poDlqJobs = dlqJobs.filter(job => 
          job.data && job.data.originalJobData && job.data.originalJobData.purchaseOrderId === purchaseOrderId
        ).map(job => ({
          ...job,
          status: 'dead-letter'
        }))
        poJobs.push(...poDlqJobs)
      }

      return poJobs
    } catch (error) {
      console.error('Failed to get jobs by purchase order:', error)
      return []
    }
  }

  /**
   * Get stuck jobs (processing for too long)
   */
  async getStuckJobs(thresholdMinutes = 30) {
    if (!this.isInitialized) return []
    try {
      const activeJobs = await this.queue.getJobs(['active'], 0, 100)
      const now = Date.now()
      const threshold = thresholdMinutes * 60 * 1000
      
      return activeJobs.filter(job => {
        const processedTime = job.processedOn || job.timestamp
        return (now - processedTime) > threshold
      })
    } catch (error) {
      console.error('Failed to get stuck jobs:', error)
      return []
    }
  }

  /**
   * Retry a failed job
   */
  async retryFailedJob(jobId) {
    if (!this.isInitialized) {
      return { success: false, error: 'Job service not initialized' }
    }
    try {
      const job = await this.queue.getJob(jobId)
      if (!job) {
        return { success: false, error: 'Job not found' }
      }

      if (job.opts.jobId !== 'failed') {
        await job.retry()
        return { success: true, newJobId: job.id }
      } else {
        // Create new job with same data
        const newJob = await this.addJob(job.name, job.data, {
          priority: 'high',
          attempts: 3
        })
        return { success: true, newJobId: newJob.id }
      }
    } catch (error) {
      console.error('Failed to retry job:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Reprocess dead letter job
   */
  async reprocessDeadLetterJob(jobId) {
    if (!this.deadLetterQueue) {
      return { success: false, error: 'Dead letter queue not configured' }
    }
    try {
      const job = await this.deadLetterQueue.getJob(jobId)
      if (!job) {
        return { success: false, error: 'Dead letter job not found' }
      }

      // Create new job from original data
      const originalData = job.data.originalJobData || job.data
      const newJob = await this.addJob('process-file', {
        ...originalData,
        reprocessed: true,
        reprocessedAt: new Date().toISOString(),
        originalDeadLetterJobId: jobId
      }, {
        priority: 'high',
        attempts: 3
      })

      // Remove from dead letter queue
      await job.remove()

      return { success: true, newJobId: newJob.id }
    } catch (error) {
      console.error('Failed to reprocess dead letter job:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Remove a job
   */
  async removeJob(jobId) {
    if (!this.isInitialized) {
      return { success: false, error: 'Job service not initialized' }
    }
    try {
      // Try main queue first
      let job = await this.queue.getJob(jobId)
      if (job) {
        await job.remove()
        return { success: true }
      }

      // Try dead letter queue
      if (this.deadLetterQueue) {
        job = await this.deadLetterQueue.getJob(jobId)
        if (job) {
          await job.remove()
          return { success: true }
        }
      }

      return { success: false, error: 'Job not found' }
    } catch (error) {
      console.error('Failed to remove job:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('Shutting down job queues...')
    
    if (this.queue) {
      await this.queue.close()
    }
    
    if (this.deadLetterQueue) {
      await this.deadLetterQueue.close()
    }

    console.log('Job queues shut down successfully')
  }
}

// Export singleton instance
export const enhancedJobService = new EnhancedFileProcessingJobService()
export default enhancedJobService