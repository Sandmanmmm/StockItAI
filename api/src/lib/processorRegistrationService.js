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
    this.monitorIntervals = new Map();
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

      // Attach optional monitoring hooks for job lifecycle visibility
      if (!this.monitorIntervals.has(jobType)) {
        this.attachQueueMonitors(queue, jobType);
      }

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

  attachQueueMonitors(queue, jobType) {
    const removeCompletedImmediately = process.env.BULL_REMOVE_COMPLETED_IMMEDIATE === '1';
    const monitorIntervalMs = Number(process.env.BULL_MONITOR_INTERVAL_MS || 60000);

    queue.on('completed', async (job) => {
      try {
        console.log(`✅ [BULL] Job ${job.id} for ${jobType} completed (attempts: ${job.attemptsMade})`);
        if (removeCompletedImmediately) {
          await job.remove();
          console.log(`🧹 [BULL] Removed completed job ${job.id} for ${jobType}`);
        }
      } catch (err) {
        console.error(`⚠️ [BULL] Failed to handle completed job ${job.id} for ${jobType}:`, err.message || err);
      }
    });

    queue.on('failed', (job, err) => {
      const errorMessage = err?.message || err
      const isExpectedError = 
        errorMessage.includes('job stalled') ||
        errorMessage.includes('Transaction already closed') ||
        errorMessage.includes('lock timeout')
      
      if (isExpectedError) {
        console.log(`🔄 [BULL] Job ${job.id} for ${jobType} will retry (stalled/lock timeout on attempt ${job.attemptsMade})`)
      } else {
        console.error(`💥 [BULL] Job ${job.id} for ${jobType} failed on attempt ${job.attemptsMade}:`, errorMessage)
      }
    });

    queue.on('stalled', (job) => {
      console.log(`🔄 [BULL] Job ${job.id} for ${jobType} stalled (likely waiting for PO lock); will be retried`);
    });

    if (monitorIntervalMs > 0) {
      const intervalId = setInterval(async () => {
        try {
          const counts = await queue.getJobCounts();
          console.log(`📊 [BULL] Queue health for ${jobType}:`, counts);
        } catch (err) {
          console.error(`⚠️ [BULL] Failed to retrieve job counts for ${jobType}:`, err.message || err);
        }
      }, monitorIntervalMs);

      this.monitorIntervals.set(jobType, intervalId);
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

    // Check for duplicate jobs for the same PO (prevent lock contention)
    const purchaseOrderId = jobData?.data?.purchaseOrderId || jobData?.purchaseOrderId;
    if (purchaseOrderId) {
      try {
        const activeJobs = await queue.getActive();
        const waitingJobs = await queue.getWaiting();
        const allPendingJobs = [...activeJobs, ...waitingJobs];
        
        const duplicateJob = allPendingJobs.find(job => {
          const jobPOId = job.data?.data?.purchaseOrderId || job.data?.purchaseOrderId;
          return jobPOId === purchaseOrderId;
        });
        
        if (duplicateJob) {
          console.log(`⏭️ [DUPLICATE] Skipping job for PO ${purchaseOrderId} - already ${duplicateJob.id in activeJobs ? 'active' : 'waiting'} (job ${duplicateJob.id})`);
          return duplicateJob; // Return existing job instead of creating duplicate
        }
      } catch (error) {
        console.warn(`⚠️ [DUPLICATE] Failed to check for duplicates: ${error.message}`);
        // Continue with job creation if duplicate check fails
      }
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

    for (const [jobType, intervalId] of this.monitorIntervals) {
      clearInterval(intervalId);
      console.log(`🛑 [PERMANENT FIX] Stopped monitoring interval for ${jobType}`);
    }
    this.monitorIntervals.clear();
  }
}

export const processorRegistrationService = new ProcessorRegistrationService();
export default processorRegistrationService;
