/**
 * Permanent Processor Registration Service
 * This replaces the corrupted setupQueueProcessor with the proven working pattern
 */

import Bull from 'bull';
import { workflowOrchestrator } from './workflowOrchestrator.js';

export class ProcessorRegistrationService {
  constructor() {
    this.registeredProcessors = new Map();
  }

  /**
   * Register processors using the proven working pattern
   * This is the exact pattern that worked in our emergency fix
   */
  async registerProcessor(queueName, concurrency, processorFunction, jobType) {
    console.log(`🔧 [PERMANENT FIX] Registering processor for ${jobType} on queue ${queueName} with concurrency ${concurrency}`);
    
    try {
      // Create queue connection
      const queue = new Bull(queueName, {
        redis: {
          host: 'localhost',
          port: 6379,
          db: 0
        }
      });

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
      { queueName: 'shopify-sync', jobType: 'shopify_sync', concurrency: 3 },
      { queueName: 'status-update', jobType: 'status_update', concurrency: 10 }
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
    
    // Map queue names to job types
    const queueNameToJobType = {
      'ai-parsing': 'ai_parsing',
      'database-save': 'database_save', 
      'shopify-sync': 'shopify_sync',
      'status-update': 'status_update'
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
      queue = new Bull(queueName, {
        redis: {
          port: 6379,
          host: 'localhost',
          db: 0
        }
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