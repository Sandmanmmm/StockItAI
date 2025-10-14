/**
 * Clear stalled active jobs from Bull queues
 * Active jobs that have been running for > 30 minutes are considered stalled
 */

const restUrl = process.env.UPSTASH_REDIS_REST_URL;
const restToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!restUrl || !restToken) {
  console.error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN environment variables.');
  process.exit(1);
}

async function runCommand(command) {
  const response = await fetch(restUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${restToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upstash request failed: ${response.status} ${response.statusText}\n${text}`);
  }

  const data = await response.json();
  return data.result;
}

function queueKey(queue, suffix) {
  return `bull:${queue}:${suffix}`;
}

async function clearStalledActive(queueName) {
  console.log(`\n🔍 Checking ${queueName} for stalled active jobs...`);
  
  const activeKey = queueKey(queueName, 'active');
  
  // Get all active job IDs
  const activeIds = await runCommand(['LRANGE', activeKey, '0', '-1']);
  
  if (!activeIds || activeIds.length === 0) {
    console.log(`   ✅ No active jobs`);
    return;
  }

  console.log(`   📋 Found ${activeIds.length} active job(s)`);

  // For each active job, check its lock timestamp
  for (const jobId of activeIds) {
    const jobKey = queueKey(queueName, jobId);
    const lockKey = queueKey(queueName, `${jobId}:lock`);
    
    // Get job data (Bull stores as hash)
    const jobDataStr = await runCommand(['HGET', jobKey, 'data']);
    const processedOnStr = await runCommand(['HGET', jobKey, 'processedOn']);
    
    if (!jobDataStr) {
      console.log(`   ⚠️  Job ${jobId}: No data found, removing from active list`);
      await runCommand(['LREM', activeKey, '0', jobId]);
      continue;
    }

    try {
      const processedOn = processedOnStr ? parseInt(processedOnStr) : 0;
      const age = Date.now() - processedOn;
      const ageMinutes = Math.floor(age / 60000);

      console.log(`   📊 Job ${jobId}: Running for ${ageMinutes} minutes`);

      // If job has been running for > 30 minutes, it's stalled
      if (ageMinutes > 30) {
        console.log(`   🚨 Job ${jobId} is stalled (${ageMinutes} min > 30 min threshold)`);
        console.log(`   🧹 Moving to failed state...`);

        // Move to failed
        const failedKey = queueKey(queueName, 'failed');
        
        // Update job hash with failure info
        await runCommand(['HSET', jobKey, 'failedReason', `Stalled: Job ran for ${ageMinutes} minutes without completion`]);
        await runCommand(['HSET', jobKey, 'finishedOn', Date.now().toString()]);
        
        // Move from active to failed
        await runCommand(['LREM', activeKey, '0', jobId]);
        await runCommand(['SADD', failedKey, jobId]);
        
        // Remove lock
        await runCommand(['DEL', lockKey]);
        
        console.log(`   ✅ Job ${jobId} moved to failed state`);
      } else {
        console.log(`   ✅ Job ${jobId} is still within acceptable time window`);
      }
    } catch (err) {
      console.error(`   ❌ Error processing job ${jobId}:`, err.message);
    }
  }
}

async function main() {
  const queues = [
    'ai-parsing',
    'database-save',
    'product-draft-creation',
    'image-attachment',
    'shopify-sync',
    'status-update',
    'background-image-processing'
  ];

  console.log('🔧 Checking for stalled active jobs in all queues...\n');

  for (const queue of queues) {
    await clearStalledActive(queue);
  }

  console.log('\n✅ Done!');
}

main().catch(console.error);
