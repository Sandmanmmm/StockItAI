/**
 * Test that mimics our exact orchestrator setup but in minimal form
 */

import Bull from 'bull';

async function testOrchestrator() {
  try {
    console.log('🧪 Testing orchestrator-like setup...');
    
    const redisConfig = {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
      retryDelayOnFailover: 100,
      enableReadyCheck: false
    };
    
    // Create queue exactly like our orchestrator
    const queue = new Bull('test-ai-parsing', {
      redis: redisConfig,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        },
        removeOnComplete: 100,
        removeOnFail: 50,
        timeout: 600000
      },
      settings: {
        stalledInterval: 30000,
        maxStalledCount: 1
      }
    });
    
    console.log('✅ Queue created');
    
    // Mock processJob function like ours
    const processJob = async (job, jobType) => {
      console.log(`📋 Mock processJob called for ${jobType}:`, job.data);
      return { success: true, processed: Date.now() };
    };
    
    // Setup processor exactly like our orchestrator (without concurrency first)
    const processorFunction = async (job) => {
      try {
        console.log(`🎯 PROCESSOR TRIGGERED for job ${job.id}`);
        console.log(`📋 Job data:`, job.data);
        
        const result = await processJob(job, 'ai_parse');
        console.log(`✅ Completed job ${job.id}:`, result);
        return result;
      } catch (error) {
        console.error(`💥 PROCESSOR ERROR:`, error);
        throw error;
      }
    };
    
    // Register processor
    queue.process('ai_parse', processorFunction);
    console.log('✅ Processor registered for ai_parse');
    
    // Add job exactly like our orchestrator does
    const jobData = {
      workflowId: 'test_workflow_123',
      stage: 'ai_parsing',
      data: {
        uploadId: 'test_upload',
        fileName: 'test.csv',
        merchantId: 'test_merchant'
      }
    };
    
    const job = await queue.add('ai_parse', jobData);
    console.log(`📋 Added ai_parse job ${job.id}`);
    
    // Wait and check results
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const waiting = await queue.getWaiting();
    const active = await queue.getActive();
    const completed = await queue.getCompleted();
    const failed = await queue.getFailed();
    
    console.log('📊 Final stats:');
    console.log(`  Waiting: ${waiting.length}`);
    console.log(`  Active: ${active.length}`);
    console.log(`  Completed: ${completed.length}`);
    console.log(`  Failed: ${failed.length}`);
    
    if (completed.length > 0) {
      console.log('✅ SUCCESS: Orchestrator-like setup works!');
    } else if (failed.length > 0) {
      console.log('❌ FAILURE: Jobs failed');
      failed.forEach(job => console.log(`  Failed job ${job.id}: ${job.failedReason}`));
    } else {
      console.log('❌ FAILURE: Jobs stuck in waiting');
    }
    
    await queue.close();
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

testOrchestrator();