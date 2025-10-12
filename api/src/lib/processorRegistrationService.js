/**
 * Processor Registration Service (cleaned)
 * Restores a stable pattern for creating Bull queues and registering processors.
 */

import Bull from 'bull';
import { workflowOrchestrator } from './workflowOrchestrator.js';
import { getRedisConfig } from '../config/redis.production.js';

export class ProcessorRegistrationService {
  constructor() {
    this.registeredProcessors = new Map();
    this.initializationPromise = null;
  }

  getRedisOptions() {
    const config = getRedisConfig();

    return {
      host: config.connection.host,
      port: config.connection.port,
      password: config.connection.password,
      db: config.connection.db,
      tls: config.connection.tls,
      connectTimeout: 15000,
      // Bull v3 / ioredis compatibility
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    };
  }

  /**
   * Register a single processor for a Bull queue
   */
  async registerProcessor(queueName, concurrency, processorFunction, jobType) {
    const start = Date.now();

    try {
      const redisOptions = this.getRedisOptions();

      const queue = new Bull(queueName, { redis: redisOptions });

      // Optional: attach redis client listeners for diagnostics
      try {
        const client = queue.client;
        if (client && client.on) {
          client.on('error', (err) => {
            console.error(`❌ [REDIS] Client error for ${jobType}:`, err.message);
          });
          client.on('reconnecting', () => {
            console.log(`🔄 [REDIS] Reconnecting client for ${jobType}...`);
          });
          client.on('connect', () => {
            console.log(`✅ [REDIS] Client connected for ${jobType}`);
          });
        }
      } catch (err) {
        // ignore diagnostic attach failures
      }

      // Use the proven pattern: queue.process(concurrency, processorFunction)
      queue.process(concurrency, processorFunction);

      console.log(`✅ [PERMANENT FIX] Processor registered successfully for ${jobType}`);

      // Store reference for cleanup
      this.registeredProcessors.set(jobType, queue);

      // Ensure queue is resumed so it can process waiting jobs
      await queue.resume();
      const duration = Date.now() - start;
      console.log(`▶️ [PERMANENT FIX] Queue ${jobType} resumed and ready (took ${duration}ms)`);

      if (process.env.BULL_DIAGNOSTICS === '1') {
        const waitingJobs = await queue.getWaiting();
        if (waitingJobs.length > 0) {
          console.log(`🚀 [PERMANENT FIX][DEBUG] ${waitingJobs.length} waiting jobs in ${jobType} should start processing now...`);
        }
      }

      return queue;
    } catch (error) {
      console.error(`❌ [PERMANENT FIX] Failed to register processor for ${jobType}:`, error.message);
      throw error;
    }
  }

  /**
   * Parallelized initialization of all processors with cached promise
   */
  async initializeAllProcessors() {
    if (this.initializationPromise) {
      console.log('⏳ [PERMANENT FIX] Processor initialization already in progress or complete');
      return this.initializationPromise;
    }

    console.log('🚀 [PERMANENT FIX] Initializing all processors with proven working pattern...');

    const processorConfigs = [
      { queueName: 'ai-parsing', jobType: 'ai_parsing', concurrency: 2 },
      { queueName: 'database-save', jobType: 'database_save', concurrency: 5 },
      { queueName: 'product-draft-creation', jobType: 'product_draft_creation', concurrency: 3 },
      { queueName: 'image-attachment', jobType: 'image_attachment', concurrency: 2 },
      { queueName: 'background-image-processing', jobType: 'background_image_processing', concurrency: 1 },
      { queueName: 'shopify-sync', jobType: 'shopify_sync', concurrency: 3 },
      { queueName: 'status-update', jobType: 'status_update', concurrency: 10 },
      // Refinement pipeline
      { queueName: 'data-normalization', jobType: 'data_normalization', concurrency: 3 },
      { queueName: 'merchant-config', jobType: 'merchant_config', concurrency: 2 },
      { queueName: 'ai-enrichment', jobType: 'ai_enrichment', concurrency: 2 },
      { queueName: 'shopify-payload', jobType: 'shopify_payload', concurrency: 3 }
    ];

    const tasks = processorConfigs.map((config) => {
      const { queueName, concurrency, jobType } = config;
      const processorFunction = async (job) => {
        const startTime = Date.now();
        try {
          console.log(`🎯 [PERMANENT FIX] PROCESSOR TRIGGERED for ${jobType} job ${job.id}`);
          console.log(`📋 Job details:`, {
            workflowId: job.data?.workflowId,
            stage: job.data?.stage,
            attempts: job.attemptsMade,
            name: job.name
          });

          const result = await workflowOrchestrator.processJob(job, jobType);

          const duration = Date.now() - startTime;
          console.log(`✅ [PERMANENT FIX] Completed ${jobType} job ${job.id} in ${duration}ms`);
          return result;
        } catch (err) {
          const duration = Date.now() - startTime;
          console.error(`💥 [PERMANENT FIX] PROCESSOR ERROR in ${jobType} job ${job.id} after ${duration}ms:`, err.message);
          throw err;
        }
      };

      return this.registerProcessor(queueName, concurrency, processorFunction, jobType)
        .then(() => ({ status: 'fulfilled', jobType }))
        .catch((err) => ({ status: 'rejected', jobType, reason: err }));
    });

    this.initializationPromise = Promise.all(tasks)
      .then((results) => {
        const rejected = results.filter((r) => r.status === 'rejected');
        if (rejected.length > 0) {
          console.error(`❌ [PERMANENT FIX] ${rejected.length} processor(s) failed to initialize`);
          rejected.forEach((r) => console.error(`   ↳ ${r.jobType}:`, r.reason && r.reason.message ? r.reason.message : r.reason));
          // clear cache so a future retry can re-attempt
          this.initializationPromise = null;
          throw new Error('One or more processors failed to initialize');
        }

        console.log('🎉 [PERMANENT FIX] All processors initialized successfully');
        console.log('📋 [PERMANENT FIX] Registered processors:', Array.from(this.registeredProcessors.keys()));
        return results;
      })
      .catch((err) => {
        console.error('❌ [PERMANENT FIX] Processor initialization encountered an error:', err.message || err);
        this.initializationPromise = null;
        throw err;
      });

    return this.initializationPromise;
  }

  /**
   * Add a job to a specific queue
   */
  async addJob(queueName, jobData, options = {}) {
    console.log(`📋 [PERMANENT FIX] Adding job to queue: ${queueName}`);

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

    const jobType = queueNameToJobType[queueName];
    let queue = null;

    if (jobType && this.registeredProcessors.has(jobType)) {
      queue = this.registeredProcessors.get(jobType);
      console.log(`✅ [PERMANENT FIX] Found registered queue for ${queueName} (job type: ${jobType})`);
    }

    if (!queue) {
      console.warn(`⚠️ [PERMANENT FIX] Queue ${queueName} not found (jobType: ${jobType}), creating temporary queue`);
      const BullModule = (await import('bull')).default;
      const redisOptions = this.getRedisOptions();
      console.log(`🔌 [REDIS] Creating temporary queue with ${redisOptions.host}:${redisOptions.port}`);
      queue = new BullModule(queueName, { redis: redisOptions });
    }

    const job = await queue.add(jobData, {
      removeOnComplete: 10,
      removeOnFail: 50,
      delay: options.delay || 0,
      attempts: options.attempts || 3,
      backoff: { type: 'exponential', delay: 2000 },
      ...options
    });

    console.log(`✅ [PERMANENT FIX] Job added to ${queueName} with ID: ${job.id}`);
    return job;
  }

  /**
   * Clean up queues
   */
  async cleanup() {
    console.log('🧹 [PERMANENT FIX] Cleaning up registered processors...');
    for (const [jobType, queue] of this.registeredProcessors) {
      try {
        await queue.close();
        console.log(`✅ [PERMANENT FIX] Closed queue for ${jobType}`);
      } catch (err) {
        console.error(`❌ [PERMANENT FIX] Failed to close queue for ${jobType}:`, err.message || err);
      }
    }
    this.registeredProcessors.clear();
  }
}

export const processorRegistrationService = new ProcessorRegistrationService();
export default processorRegistrationService;
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
    this.initializationPromise = null;
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
        if (this.initializationPromise) {
          console.log('⏳ [PERMANENT FIX] Processor initialization already in progress or complete');
          return this.initializationPromise;
        }

        console.log('🚀 [PERMANENT FIX] Initializing all processors with proven working pattern...');

        const processorConfigs = [
          { queueName: 'ai-parsing', jobType: 'ai_parsing', concurrency: 2 },
          { queueName: 'database-save', jobType: 'database_save', concurrency: 5 },
          { queueName: 'product-draft-creation', jobType: 'product_draft_creation', concurrency: 3 },
          { queueName: 'image-attachment', jobType: 'image_attachment', concurrency: 2 },
          { queueName: 'background-image-processing', jobType: 'background_image_processing', concurrency: 1 },
          { queueName: 'shopify-sync', jobType: 'shopify_sync', concurrency: 3 },
          { queueName: 'status-update', jobType: 'status_update', concurrency: 10 },
          // Refinement pipeline
          { queueName: 'data-normalization', jobType: 'data_normalization', concurrency: 3 },
          { queueName: 'merchant-config', jobType: 'merchant_config', concurrency: 2 },
          { queueName: 'ai-enrichment', jobType: 'ai_enrichment', concurrency: 2 },
          { queueName: 'shopify-payload', jobType: 'shopify_payload', concurrency: 3 }
        ];

        const initializationTasks = processorConfigs.map((config) => {
          const taskStart = Date.now();

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

              const result = await workflowOrchestrator.processJob(job, config.jobType);

              const duration = Date.now() - startTime;
              console.log(`✅ [PERMANENT FIX] Completed ${config.jobType} job ${job.id} in ${duration}ms`);

              return result;
            } catch (error) {
              const duration = Date.now() - startTime;
              console.error(`� [PERMANENT FIX] PROCESSOR ERROR in ${config.jobType} job ${job.id} after ${duration}ms:`, error.message);
              throw error;
            }
          };

          return this.registerProcessor(
            config.queueName,
            config.concurrency,
            processorFunction,
            config.jobType
          ).then(() => {
            const taskDuration = Date.now() - taskStart;
            console.log(`⏱️ [PERMANENT FIX] ${config.jobType} initialization finished in ${taskDuration}ms`);
          });
        });

        this.initializationPromise = Promise.allSettled(initializationTasks)
          .then((results) => {
            const failures = results.filter((result) => result.status === 'rejected');
            if (failures.length > 0) {
              console.error(`❌ [PERMANENT FIX] ${failures.length} processor(s) failed to initialize`);
              failures.forEach((failure, index) => {
                console.error(`   ↳ Failure ${index + 1}:`, failure.reason);
              });
              this.initializationPromise = null;
            } else {
              console.log('🎉 [PERMANENT FIX] All processors initialized successfully');
              console.log('📋 [PERMANENT FIX] Registered processors:', Array.from(this.registeredProcessors.keys()));
            }
          })
          .catch((error) => {
            console.error('❌ [PERMANENT FIX] Processor initialization encountered an unexpected error:', error.message);
            this.initializationPromise = null;
            throw error;
          });

        return this.initializationPromise;
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
      const duration = Date.now() - start;
      console.log(`▶️ [PERMANENT FIX] Queue ${jobType} resumed and ready (took ${duration}ms)`);

      if (process.env.BULL_DIAGNOSTICS === '1') {
        const waitingJobs = await queue.getWaiting();
        if (waitingJobs.length > 0) {
          console.log(`🚀 [PERMANENT FIX][DEBUG] ${waitingJobs.length} waiting jobs in ${jobType} should start processing now...`);
        }
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