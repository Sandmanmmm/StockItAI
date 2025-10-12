import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const redisClient = createClient({
  url: process.env.UPSTASH_REDIS_URL,
  socket: {
    tls: true,
    reconnectStrategy: (retries) => Math.min(retries * 50, 500)
  }
});

async function checkAIParsingJob(workflowId) {
  try {
    await redisClient.connect();
    console.log('\n🔍 Checking AI Parsing Job for:', workflowId);
    
    // Check Bull queue jobs for ai_parsing
    const queueKeys = await redisClient.keys('bull:ai-parsing:*');
    console.log(`\n📊 Found ${queueKeys.length} ai-parsing queue keys`);
    
    // Look for jobs related to this workflow
    const workflowJobs = [];
    for (const key of queueKeys) {
      if (key.includes(workflowId)) {
        const value = await redisClient.get(key);
        workflowJobs.push({ key, value: JSON.parse(value) });
      }
    }
    
    if (workflowJobs.length > 0) {
      console.log(`\n✅ Found ${workflowJobs.length} jobs for workflow:`);
      workflowJobs.forEach((job, i) => {
        console.log(`\nJob ${i + 1}:`);
        console.log('  Key:', job.key);
        console.log('  Data:', JSON.stringify(job.value, null, 2));
      });
    } else {
      console.log('\n❌ No jobs found for workflow in Redis');
    }
    
    // Check active jobs
    const activeKeys = await redisClient.keys('bull:ai-parsing:active');
    if (activeKeys.length > 0) {
      console.log('\n📋 Active jobs:');
      for (const key of activeKeys) {
        const active = await redisClient.smembers(key);
        console.log('  Active job IDs:', active);
      }
    }
    
    // Check waiting jobs
    const waitingKeys = await redisClient.keys('bull:ai-parsing:wait*');
    if (waitingKeys.length > 0) {
      console.log('\n⏳ Waiting jobs:');
      for (const key of waitingKeys) {
        const waiting = await redisClient.lrange(key, 0, -1);
        console.log(`  ${key}:`, waiting);
      }
    }
    
    // Check failed jobs
    const failedKeys = await redisClient.keys('bull:ai-parsing:failed');
    if (failedKeys.length > 0) {
      console.log('\n❌ Failed jobs:');
      for (const key of failedKeys) {
        const failed = await redisClient.smembers(key);
        console.log('  Failed job IDs:', failed);
        
        // Get details of failed jobs
        for (const jobId of failed.slice(0, 5)) {
          const jobKey = `bull:ai-parsing:${jobId}`;
          const jobData = await redisClient.get(jobKey);
          if (jobData) {
            console.log(`\n  Job ${jobId}:`, JSON.parse(jobData));
          }
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await redisClient.quit();
  }
}

const workflowId = process.argv[2] || 'workflow_1760281089113_hhvhcls0s';
checkAIParsingJob(workflowId);
