// Check queue status to see if the fix is working
import { redisManager } from './api/src/lib/redisManager.js';
import Queue from 'bull';

async function checkQueueStatus() {
  try {
    console.log('🔄 Initializing Redis connection...');
    await redisManager.initializeConnections();
    
    // Create queue instances
    const aiQueue = new Queue('ai_parsing', {
      redis: {
        host: 'localhost',
        port: 6379,
        db: 0,
      },
    });
    
    console.log('📊 Checking AI parsing queue status...');
    
    // Check queue stats
    const waiting = await aiQueue.getWaiting();
    const active = await aiQueue.getActive();
    const completed = await aiQueue.getCompleted();
    const failed = await aiQueue.getFailed();
    
    console.log('Queue Statistics:');
    console.log(`  Waiting: ${waiting.length}`);
    console.log(`  Active: ${active.length}`);
    console.log(`  Completed: ${completed.length}`);
    console.log(`  Failed: ${failed.length}`);
    
    // Show recent failed jobs
    if (failed.length > 0) {
      console.log('\n❌ Recent failed jobs:');
      for (const job of failed.slice(-3)) {
        console.log(`  Job ${job.id}: ${job.failedReason}`);
        console.log(`  Attempts: ${job.attemptsMade}/${job.opts.attempts}`);
        console.log(`  Data: ${JSON.stringify(job.data, null, 2)}`);
        console.log('  ---');
      }
    }
    
    // Show recent completed jobs
    if (completed.length > 0) {
      console.log('\n✅ Recent completed jobs:');
      for (const job of completed.slice(-3)) {
        console.log(`  Job ${job.id}: Completed successfully`);
        console.log(`  Return value: ${JSON.stringify(job.returnvalue, null, 2)}`);
        console.log('  ---');
      }
    }
    
    await aiQueue.close();
    await redisManager.closeConnections();
    
  } catch (error) {
    console.error('❌ Queue check failed:', error);
  }
}

checkQueueStatus();