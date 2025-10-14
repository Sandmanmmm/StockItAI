/**
 * Processor Registration Service (cleaned)
 * Restores a stable pattern for creating Bull queues and registering processors.
 */

import Bull from 'bull';
import Redis from 'ioredis';
import { workflowOrchestrator } from './workflowOrchestrator.js';
import { getRedisConfig } from '../config/redis.production.js';

export class ProcessorRegistrationService {
  constructor() {
    this.registeredProcessors = new Map();
    this.initializationPromise = null;
    this.monitorIntervals = new Map();
    
    // 🔧 SHARED REDIS CONNECTIONS (Fix #2: Connection Pool)
    // Instead of creating 3 connections per queue (11 queues × 3 = 33+ connections),
    // we create 3 shared connections reused by all queues (91% reduction)
    this.sharedClient = null;        // Main client for queue operations
    this.sharedSubscriber = null;    // Subscriber for pub/sub
    this.sharedBclient = null;       // Blocking client for BRPOP operations
    this.connectionInitialized = false;
  }

  /**
   * Initialize shared Redis connections (called once, reused by all queues)
   */
  async initializeSharedConnections() {
    if (this.connectionInitialized) {
      console.log('♻️ Shared Redis connections already initialized, reusing...');
      return;
    }
    
    try {
      console.log('🔗 Creating shared Redis connection pool for Bull queues...');
      
      const config = getRedisConfig();
      const connectionOptions = config.connection;
      
      // Clone the config to avoid mutating the original
      let redisConfig;
      
      if (typeof connectionOptions === 'string') {
        // Redis URL format - use directly
        redisConfig = connectionOptions;
      } else {
        // Object format - clone and ensure Bull v3 compatibility
        redisConfig = {
          ...connectionOptions,
          // Override critical settings for Bull v3 and immediate connection
          lazyConnect: false,              // ❌ Remove lazy connect - connect immediately
          maxRetriesPerRequest: null,      // Bull v3 requirement
          enableReadyCheck: false,         // Bull v3 requirement
          retryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000);
            console.log(`🔄 Redis retry attempt ${times}, delay: ${delay}ms`);
            return delay;
          }
        };
      }
      
      console.log('📡 Connecting to Redis:', typeof redisConfig === 'string' ? 'URL format' : `${redisConfig.host}:${redisConfig.port}`);
      
      // Create 3 shared connections
      this.sharedClient = new Redis(redisConfig);
      this.sharedSubscriber = new Redis(redisConfig);
      this.sharedBclient = new Redis(redisConfig);
      
      // Increase max listeners for shared connections (11 queues share 3 connections)
      // Each queue attaches ~2 event listeners per connection (error, ready, etc.)
      // 11 queues × 2 listeners = 22 needed, set to 25 for safety margin
      this.sharedClient.setMaxListeners(25);
      this.sharedSubscriber.setMaxListeners(25);
      this.sharedBclient.setMaxListeners(25);
      
      // Setup connection event handlers for monitoring
      this.setupSharedConnectionHandlers();
      
      // Wait for connections to be ready
      await Promise.all([
        this.waitForConnection(this.sharedClient, 'client'),
        this.waitForConnection(this.sharedSubscriber, 'subscriber'),
        this.waitForConnection(this.sharedBclient, 'bclient')
      ]);
      
      this.connectionInitialized = true;
      console.log('✅ Shared Redis connection pool established (3 connections)');
      
    } catch (error) {
      console.error('❌ Failed to initialize shared Redis connections:', error);
      throw error;
    }
  }

  /**
   * Wait for a Redis connection to be ready
   */
  async waitForConnection(client, name) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Redis ${name} connection timeout after 10s`));
      }, 10000);
      
      if (client.status === 'ready') {
        clearTimeout(timeout);
        console.log(`✅ Redis ${name} already connected`);
        resolve();
      } else {
        client.once('ready', () => {
          clearTimeout(timeout);
          console.log(`✅ Redis ${name} connected`);
          resolve();
        });
        
        client.once('error', (err) => {
          clearTimeout(timeout);
          console.error(`❌ Redis ${name} connection error:`, err.message);
          reject(err);
        });
      }
    });
  }

  /**
   * Setup connection event handlers for health monitoring
   */
  setupSharedConnectionHandlers() {
    const setupHandlers = (client, name) => {
      client.on('error', (err) => {
        console.error(`❌ [REDIS ${name}] Error:`, err.message);
      });
      
      client.on('close', () => {
        console.warn(`⚠️ [REDIS ${name}] Connection closed`);
      });
      
      client.on('reconnecting', (delay) => {
        console.log(`🔄 [REDIS ${name}] Reconnecting in ${delay}ms...`);
      });
      
      client.on('connect', () => {
        console.log(`🔌 [REDIS ${name}] Connected`);
      });
    };
    
    setupHandlers(this.sharedClient, 'CLIENT');
    setupHandlers(this.sharedSubscriber, 'SUBSCRIBER');
    setupHandlers(this.sharedBclient, 'BCLIENT');
  }

  /**
   * Get Redis options for Bull (returns function to provide shared connections)
   */
  getRedisOptions() {
    // Bull v3 accepts a createClient function to provide existing connections
    // This prevents Bull from creating its own connections (3 per queue)
    return {
      createClient: (type, redisOpts) => {
        console.log(`♻️ [BULL] Reusing shared ${type} connection`);
        
        switch (type) {
          case 'client':
            return this.sharedClient;
          case 'subscriber':
            return this.sharedSubscriber;
          case 'bclient':
            return this.sharedBclient || this.sharedClient;
          default:
            console.warn(`⚠️ Unknown client type: ${type}, using main client`);
            return this.sharedClient;
        }
      }
    };
  }

  /**
   * Register a single processor for a Bull queue
   */
  async registerProcessor(queueName, concurrency, processorFunction, jobType) {
    const start = Date.now();

    try {
      const redisOptions = this.getRedisOptions();

      const queue = new Bull(queueName, { 
        // 🔧 SHARED CONNECTION POOL (Fix #2)
        // Pass createClient directly (NOT wrapped in redis object)
        // Bull will call createClient('client'), createClient('subscriber'), createClient('bclient')
        createClient: redisOptions.createClient,
        
        // 🔧 SERVERLESS-OPTIMIZED SETTINGS (Fix for "Missing lock" and "job stalled" errors)
        // Default Bull settings assume long-running servers, but serverless functions:
        //   - Have cold starts (2-60 seconds for Prisma warmup)
        //   - AI parsing takes 20-30 seconds (OpenAI API)
        //   - Total job time: 45-60 seconds
        // Default lockDuration (30s) < Actual job time (60s) = Lock expires before completion!
        settings: {
          lockDuration: 120000,      // 120 seconds (4x default 30s) - covers cold starts
          lockRenewTime: 60000,      // 60 seconds (renew at 50% of lock duration)
          stalledInterval: 60000,    // 60 seconds (2x default 30s) - more tolerant of serverless delays
          maxStalledCount: 3,        // Allow 3 stalls before permanent failure
          guardInterval: 5000,       // 5 seconds - lock guard checks
          retryProcessDelay: 5000    // 5 seconds - wait before retrying stalled job
        },
        
        // 🔧 RATE LIMITER (Prevents Redis connection pool overwhelm)
        limiter: {
          max: 10,                   // Max 10 jobs
          duration: 5000,            // per 5 seconds
          bounceBack: false          // Don't requeue immediately
        }
      });

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

    // 🔧 INITIALIZE SHARED CONNECTIONS FIRST (Fix #2)
    // This must happen before creating any Bull queues
    // Otherwise each queue will create its own 3 connections (33+ total)
    this.initializationPromise = (async () => {
      try {
        await this.initializeSharedConnections();
        console.log('✅ Shared Redis connection pool ready, proceeding with processor registration...');
        
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

        const results = await Promise.all(tasks);
        
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
        
      } catch (err) {
        console.error('❌ [PERMANENT FIX] Processor initialization encountered an error:', err.message || err);
        this.initializationPromise = null;
        throw err;
      }
    })();

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
   * Clean up queues and shared Redis connections
   */
  async cleanup() {
    console.log('🧹 [PERMANENT FIX] Cleaning up registered processors...');
    
    // Close all Bull queues
    for (const [jobType, queue] of this.registeredProcessors) {
      try {
        await queue.close();
        console.log(`✅ [PERMANENT FIX] Closed queue for ${jobType}`);
      } catch (err) {
        console.error(`❌ [PERMANENT FIX] Failed to close queue for ${jobType}:`, err.message || err);
      }
    }
    this.registeredProcessors.clear();

    // Stop monitoring intervals
    for (const [jobType, intervalId] of this.monitorIntervals) {
      clearInterval(intervalId);
      console.log(`🛑 [PERMANENT FIX] Stopped monitoring interval for ${jobType}`);
    }
    this.monitorIntervals.clear();
    
    // 🔧 CLOSE SHARED REDIS CONNECTIONS (Fix #2)
    // Graceful shutdown prevents leaked connections in serverless
    console.log('🧹 Closing shared Redis connection pool...');
    
    if (this.sharedClient) {
      try {
        await this.sharedClient.quit();
        console.log('✅ Closed shared Redis client');
      } catch (err) {
        console.error('⚠️ Error closing shared client:', err.message);
      }
      this.sharedClient = null;
    }
    
    if (this.sharedSubscriber) {
      try {
        await this.sharedSubscriber.quit();
        console.log('✅ Closed shared Redis subscriber');
      } catch (err) {
        console.error('⚠️ Error closing shared subscriber:', err.message);
      }
      this.sharedSubscriber = null;
    }
    
    if (this.sharedBclient) {
      try {
        await this.sharedBclient.quit();
        console.log('✅ Closed shared Redis bclient');
      } catch (err) {
        console.error('⚠️ Error closing shared bclient:', err.message);
      }
      this.sharedBclient = null;
    }
    
    this.connectionInitialized = false;
    this.initializationPromise = null;
    
    console.log('✅ Cleanup complete');
  }
}

export const processorRegistrationService = new ProcessorRegistrationService();
export default processorRegistrationService;

// 🔧 GRACEFUL SHUTDOWN HANDLERS (Fix #2)
// Register cleanup on serverless function termination to prevent leaked connections
if (typeof process !== 'undefined') {
  process.on('SIGTERM', async () => {
    console.log('⚠️ SIGTERM received, cleaning up Bull queues and Redis connections...');
    try {
      await processorRegistrationService.cleanup();
      console.log('✅ Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during graceful shutdown:', error);
      process.exit(1);
    }
  });
  
  process.on('SIGINT', async () => {
    console.log('⚠️ SIGINT received, cleaning up Bull queues and Redis connections...');
    try {
      await processorRegistrationService.cleanup();
      console.log('✅ Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during graceful shutdown:', error);
      process.exit(1);
    }
  });
  
  process.on('beforeExit', async () => {
    console.log('⚠️ Process beforeExit, cleaning up Bull queues and Redis connections...');
    try {
      await processorRegistrationService.cleanup();
    } catch (error) {
      console.error('❌ Error during beforeExit cleanup:', error);
    }
  });
}
