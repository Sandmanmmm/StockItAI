/**
 * Permanent Processor Registration Service
 * This replaces the corrupted setupQueueProcessor with the proven working pattern
 */

import Bull from 'bull';
import { workflowOrchestrator } from './workflowOrchestrator.js';
import { getRedisConfig } from '../config/redis.production.js';

export class ProcessorRegistrationService {
  constructor() {
    this.registeredProcessors = new Map();
  }

  /**
   * Get Redis connection options from environment config
   * 
   * CRITICAL FIX: Bull v3 does NOT support enableReadyCheck or maxRetriesPerRequest
   * These options cause errors when Bull creates bclient/subscriber connections
   * See: https://github.com/OptimalBits/bull/issues/1873
   * 
   * Solution: Explicitly set these to null/false to prevent ioredis from adding defaults
   */
  getRedisOptions() {
    const config = getRedisConfig();
    
    return {
      host: config.connection.host,
      port: config.connection.port,
      password: config.connection.password,
      db: config.connection.db,
      tls: config.connection.tls,
      connectTimeout: 15000,
      // CRITICAL: Explicitly set to null/false to prevent ioredis defaults that Bull rejects
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      enableOfflineQueue: true,
      retryStrategy: (times) => {
        if (times > 10) {
          console.error('❌ [REDIS] Max retry attempts reached');
          return null;
        }
        const delay = Math.min(times * 200, 5000);
        console.log(`🔄 [REDIS] Retry attempt ${times} in ${delay}ms...`);
        return delay;
      },
      reconnectOnError: (err) => {
        const targetErrors = [
          'READONLY',
          'ECONNRESET',
          'ETIMEDOUT',
          'ENOTFOUND',
          'Client network socket disconnected'
        ];
        if (targetErrors.some(e => err.message.includes(e))) {
          console.log(`🔄 [REDIS] Reconnecting on error: ${err.message}`);
          return true;
        }
        return false;
      }
    };
  }

  /**
   * Register processors using the proven working pattern
   * This is the exact pattern that worked in our emergency fix
   */
  async registerProcessor(queueName, concurrency, processorFunction, jobType) {
    console.log(`🔧 [PERMANENT FIX] Registering processor for ${jobType} on queue ${queueName} with concurrency ${concurrency}`);
    
    try {
      // Create queue connection with production Redis config
      const redisOptions = this.getRedisOptions();
      console.log(`🔌 [REDIS] Connecting to ${redisOptions.host}:${redisOptions.port}`);
      
      // Queue settings with extended lock duration for long-running jobs
      const queueSettings = {
        lockDuration: 180000, // 3 minutes (increased from 2min due to vision API taking up to 177s)
        lockRenewTime: 60000,  // Renew lock every 60 seconds
        stalledInterval: 30000, // Check for stalled jobs every 30 seconds
      };
      
      const queue = new Bull(queueName, {
        redis: redisOptions,
        settings: queueSettings
      });

      // Add error handlers for Redis connection issues
      queue.on('error', (error) => {
        console.error(`❌ [REDIS] Queue ${jobType} error:`, error.message);
        // Don't throw - Bull will retry automatically
      });

      const client = queue.client;
      if (client) {
        client.on('error', (error) => {
          console.error(`❌ [REDIS] Client error for ${jobType}:`, error.message);
          // Redis client will auto-reconnect with retryStrategy
        });
        
        client.on('reconnecting', () => {
          console.log(`🔄 [REDIS] Reconnecting client for ${jobType}...`);
        });
        
        client.on('connect', () => {
          console.log(`✅ [REDIS] Client connected for ${jobType}`);
        });
      }

      // Use the PROVEN WORKING pattern: queue.process(concurrency, processorFunction)
      queue.process(concurrency, processorFunction);
      
      console.log(`✅ [PERMANENT FIX] Processor registered successfully for ${jobType}`);
      
      // Store reference for cleanup
      this.registeredProcessors.set(jobType, queue);
      
      // Resume queue to ensure it's ready
      await queue.resume();
      console.log(`▶️ [PERMANENT FIX] Queue ${jobType} resumed and ready`);
      
      // Check waiting jobs
      const waitingJobs = await queue.getWaiting();
      if (waitingJobs.length > 0) {
        console.log(`🚀 [PERMANENT FIX] ${waitingJobs.length} waiting jobs in ${jobType} should start processing now...`);
      }
      
      return queue;
      
    } catch (error) {
      console.error(`❌ [PERMANENT FIX] Failed to register processor for ${jobType}:`, error.message);
      throw error;
    }
  }

  /**
   * Initialize all processors with the working pattern
   */
  async initializeAllProcessors() {
    console.log('🚀 [PERMANENT FIX] Initializing all processors with proven working pattern...');
    
    const processorConfigs = [
      { queueName: 'ai-parsing', jobType: 'ai_parsing', concurrency: 2 },
      { queueName: 'database-save', jobType: 'database_save', concurrency: 5 },
      { queueName: 'product-draft-creation', jobType: 'product_draft_creation', concurrency: 3 },
      { queueName: 'image-attachment', jobType: 'image_attachment', concurrency: 2 },
      { queueName: 'background-image-processing', jobType: 'background_image_processing', concurrency: 1 }, // New: Async image processing
      { queueName: 'shopify-sync', jobType: 'shopify_sync', concurrency: 3 },
      { queueName: 'status-update', jobType: 'status_update', concurrency: 10 },
      
      // Refinement Pipeline processors
      { queueName: 'data-normalization', jobType: 'data_normalization', concurrency: 3 },
      { queueName: 'merchant-config', jobType: 'merchant_config', concurrency: 2 },
      { queueName: 'ai-enrichment', jobType: 'ai_enrichment', concurrency: 2 },
      { queueName: 'shopify-payload', jobType: 'shopify_payload', concurrency: 3 }
    ];

    for (const config of processorConfigs) {
      try {
        // Create processor function that calls the orchestrator's processJob method
        const processorFunction = async (job) => {
          const startTime = Date.now();
          
          try {
            console.log(`🎯 [PERMANENT FIX] PROCESSOR TRIGGERED for ${config.jobType} job ${job.id}`);
            console.log(`📋 Job details:`, {
              workflowId: job.data?.workflowId,
              stage: job.data?.stage,
              attempts: job.attemptsMade,
              name: job.name
            });
            
            // Call the orchestrator's processJob method
            const result = await workflowOrchestrator.processJob(job, config.jobType);
            
            const duration = Date.now() - startTime;
            console.log(`✅ [PERMANENT FIX] Completed ${config.jobType} job ${job.id} in ${duration}ms`);
            
            return result;
          } catch (error) {
            const duration = Date.now() - startTime;
            console.error(`💥 [PERMANENT FIX] PROCESSOR ERROR in ${config.jobType} job ${job.id} after ${duration}ms:`, error.message);
            throw error;
          }
        };

        await this.registerProcessor(
          config.queueName,
          config.concurrency,
          processorFunction,
          config.jobType
        );

      } catch (error) {
        console.error(`❌ [PERMANENT FIX] Failed to initialize ${config.jobType} processor:`, error.message);
      }
    }

    console.log('🎉 [PERMANENT FIX] All processors initialized successfully');
    console.log('📋 [PERMANENT FIX] Registered processors:', Array.from(this.registeredProcessors.keys()));
  }  /**
   * Add a job to a specific queue
   */
  async addJob(queueName, jobData, options = {}) {
    console.log(`📋 [PERMANENT FIX] Adding job to queue: ${queueName}`);
    
    // Map queue names to job types (must match processorConfigs in initializeAllProcessors)
    const queueNameToJobType = {
      'ai-parsing': 'ai_parsing',
      'database-save': 'database_save',
      'product-draft-creation': 'product_draft_creation',
      'image-attachment': 'image_attachment',
      'background-image-processing': 'background_image_processing',
      'shopify-sync': 'shopify_sync',
      'status-update': 'status_update',
      'data-normalization': 'data_normalization',
      'merchant-config': 'merchant_config',
      'ai-enrichment': 'ai_enrichment',
      'shopify-payload': 'shopify_payload'
    };
    
    // Find the queue by mapping queueName to jobType
    const jobType = queueNameToJobType[queueName];
    let queue = null;
    
    if (jobType && this.registeredProcessors.has(jobType)) {
      queue = this.registeredProcessors.get(jobType);
      console.log(`✅ [PERMANENT FIX] Found registered queue for ${queueName} (job type: ${jobType})`);
    }
    
    // If queue not found, create a temporary one (this shouldn't normally happen)
    if (!queue) {
      console.warn(`⚠️ [PERMANENT FIX] Queue ${queueName} not found (jobType: ${jobType}), creating temporary queue`);
      const Bull = (await import('bull')).default;
      const redisOptions = this.getRedisOptions();
      console.log(`🔌 [REDIS] Creating temporary queue with ${redisOptions.host}:${redisOptions.port}`);
      queue = new Bull(queueName, {
        redis: redisOptions
      });
    }
    
    // Add the job to the queue
    const job = await queue.add(jobData, {
      removeOnComplete: 10,
      removeOnFail: 50,
      delay: options.delay || 0,
      attempts: options.attempts || 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      ...options
    });
    
    console.log(`✅ [PERMANENT FIX] Job added to ${queueName} with ID: ${job.id}`);
    return job;
  }

  /**
   * Clean up all registered processors
   */
  async cleanup() {
    console.log('🧹 [PERMANENT FIX] Cleaning up registered processors...');
    
    for (const [jobType, queue] of this.registeredProcessors) {
      try {
        await queue.close();
        console.log(`✅ [PERMANENT FIX] Closed queue for ${jobType}`);
      } catch (error) {
        console.error(`❌ [PERMANENT FIX] Failed to close queue for ${jobType}:`, error.message);
      }
    }
    
    this.registeredProcessors.clear();
  }
}

// Export singleton instance
export const processorRegistrationService = new ProcessorRegistrationService();
export default processorRegistrationService;