/**
 * Minimal Bull queue test to isolate the processing issue
 */

import Bull from 'bull';
import { redisManager } from './src/lib/redisManager.js';

async function testMinimalBullQueue() {
  try {
    console.log('🧪 Testing minimal Bull queue setup...');
    
    // Get Redis connection options directly
    const redisConfig = {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: null
    };
    
    console.log('📡 Redis config:', redisConfig);
    
    // Create a simple test queue
    const testQueue = new Bull('test-queue', {
      redis: redisConfig,
      defaultJobOptions: {
        attempts: 3,
        removeOnComplete: 10,
        removeOnFail: 5
      }
    });
    
    console.log('✅ Test queue created');
    
    // Set up a simple processor
    testQueue.process('test-job', async (job) => {
      console.log('🎯 PROCESSING TEST JOB:', job.id, job.data);
      return { processed: true, jobId: job.id };
    });
    
    console.log('✅ Processor registered');
    
    // Add a test job
    const job = await testQueue.add('test-job', { 
      message: 'Hello from test job',
      timestamp: Date.now()
    });
    
    console.log('📋 Added test job:', job.id);
    
    // Wait and check if the job gets processed
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const waiting = await testQueue.getWaiting();
    const active = await testQueue.getActive();
    const completed = await testQueue.getCompleted();
    const failed = await testQueue.getFailed();
    
    console.log('📊 Final stats:');
    console.log(`  Waiting: ${waiting.length}`);
    console.log(`  Active: ${active.length}`);
    console.log(`  Completed: ${completed.length}`);
    console.log(`  Failed: ${failed.length}`);
    
    if (completed.length > 0) {
      console.log('✅ SUCCESS: Job was processed!');
      console.log('🎉 Bull queue processing is working');
    } else {
      console.log('❌ FAILURE: Job was not processed');
      console.log('🔍 This indicates a Bull configuration issue');
    }
    
    // Clean up
    await testQueue.close();
    
  } catch (error) {
    console.error('❌ Minimal Bull test failed:', error.message);
    console.error(error.stack);
  }
}

testMinimalBullQueue();