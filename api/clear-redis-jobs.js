/**
 * Clear stuck Bull jobs from Redis to get a fresh start
 */

import Bull from 'bull';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

async function clearStuckJobs() {
  try {
    console.log('🧹 Clearing stuck Bull jobs from Redis...\n');
    
    const redisConfig = {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
      retryDelayOnFailover: 100,
      enableReadyCheck: false
    };
    
    const redis = require('redis');
    const client = redis.createClient(redisConfig);
    await client.connect();
    
    // Get all Bull keys
    const allKeys = await client.keys('bull:*');
    console.log(`📊 Found ${allKeys.length} Bull keys in Redis`);
    
    // Group keys by queue name
    const queueGroups = {};
    allKeys.forEach(key => {
      const match = key.match(/bull:([^:]+):/);
      if (match) {
        const queueName = match[1];
        queueGroups[queueName] = (queueGroups[queueName] || []).concat(key);
      }
    });
    
    console.log('📋 Queues found:', Object.keys(queueGroups));
    
    // Clear each queue
    for (const [queueName, keys] of Object.entries(queueGroups)) {
      console.log(`\n🚮 Clearing queue: ${queueName} (${keys.length} keys)`);
      
      try {
        // Create Bull queue instance to use its cleanup methods
        const queue = new Bull(queueName, { redis: redisConfig });
        
        // Get job counts before clearing
        const waiting = await queue.getWaiting();
        const active = await queue.getActive();
        const completed = await queue.getCompleted();
        const failed = await queue.getFailed();
        
        console.log(`  Before: ${waiting.length} waiting, ${active.length} active, ${completed.length} completed, ${failed.length} failed`);
        
        // Clean up old jobs
        await queue.clean(0, 'completed', 100);
        await queue.clean(0, 'failed', 100);
        await queue.clean(0, 'active', 100);
        await queue.clean(0, 'waiting', 100);
        
        // For stuck jobs, use obliterate (nuclear option)
        await queue.obliterate({ force: true });
        
        console.log(`  ✅ Queue ${queueName} cleared`);
        await queue.close();
        
      } catch (error) {
        console.log(`  ❌ Error clearing ${queueName}:`, error.message);
      }
    }
    
    // Double-check by manually deleting any remaining keys
    console.log('\n🔍 Double-checking for remaining keys...');
    const remainingKeys = await client.keys('bull:*');
    if (remainingKeys.length > 0) {
      console.log(`🗑️ Manually deleting ${remainingKeys.length} remaining keys`);
      for (const key of remainingKeys) {
        await client.del(key);
      }
      console.log('✅ All remaining keys deleted');
    } else {
      console.log('✅ No remaining keys found');
    }
    
    await client.quit();
    console.log('\n🎉 Redis cleanup completed! All Bull queues cleared.');
    console.log('💡 Now restart the server to initialize fresh queues.');
    
  } catch (error) {
    console.error('❌ Failed to clear Redis:', error);
  }
}

clearStuckJobs();