// Check Bull queue status for ai_parsing jobs
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

async function checkBullQueues() {
  try {
    // Check ai_parsing queue
    const queueKey = 'bull:ai_parsing';
    
    // Get waiting jobs
    const waiting = await redis.lrange(`${queueKey}:wait`, 0, -1);
    console.log(`\n📥 Waiting jobs in ai_parsing: ${waiting.length}`);
    
    if (waiting.length > 0) {
      console.log(`First few job IDs: ${waiting.slice(0, 5).join(', ')}`);
      
      // Get details of first job
      const firstJobId = waiting[0];
      const jobData = await redis.get(`${queueKey}:${firstJobId}`);
      if (jobData) {
        const parsed = JSON.parse(jobData);
        console.log(`\n📋 First waiting job details:`);
        console.log(`Job ID: ${firstJobId}`);
        console.log(`Workflow ID: ${parsed.data?.workflowId}`);
        console.log(`Created: ${new Date(parsed.timestamp).toISOString()}`);
      }
    }
    
    // Get active jobs
    const active = await redis.lrange(`${queueKey}:active`, 0, -1);
    console.log(`\n⚙️ Active jobs in ai_parsing: ${active.length}`);
    
    // Get delayed jobs
    const delayed = await redis.zcard(`${queueKey}:delayed`);
    console.log(`\n⏰ Delayed jobs in ai_parsing: ${delayed}`);
    
    // Get failed jobs
    const failed = await redis.zcard(`${queueKey}:failed`);
    console.log(`\n❌ Failed jobs in ai_parsing: ${failed}`);
    
    if (failed > 0) {
      const failedJobs = await redis.zrange(`${queueKey}:failed`, 0, 4);
      console.log(`\nFailed job IDs: ${failedJobs.join(', ')}`);
      
      // Get details of first failed job
      if (failedJobs.length > 0) {
        const failedJobId = failedJobs[0];
        const jobData = await redis.get(`${queueKey}:${failedJobId}`);
        if (jobData) {
          const parsed = JSON.parse(jobData);
          console.log(`\n📋 First failed job details:`);
          console.log(`Job ID: ${failedJobId}`);
          console.log(`Workflow ID: ${parsed.data?.workflowId}`);
          console.log(`Failed reason: ${parsed.failedReason}`);
          console.log(`Stack trace: ${parsed.stacktrace?.[0]}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    redis.disconnect();
  }
}

checkBullQueues();
