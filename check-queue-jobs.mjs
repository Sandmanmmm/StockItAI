/**
 * Check detailed Bull queue job information
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

async function getJobDetails(queueName, jobId) {
  const jobKey = queueKey(queueName, jobId);
  
  // Get all hash fields
  const fields = await runCommand(['HGETALL', jobKey]);
  
  if (!fields || fields.length === 0) {
    return null;
  }

  // Convert array to object
  const job = {};
  for (let i = 0; i < fields.length; i += 2) {
    job[fields[i]] = fields[i + 1];
  }
  
  return job;
}

async function checkQueue(queueName) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📋 Queue: ${queueName}`);
  console.log('='.repeat(80));
  
  const activeKey = queueKey(queueName, 'active');
  const waitingKey = queueKey(queueName, 'wait');
  const failedKey = queueKey(queueName, 'failed');
  const completedKey = queueKey(queueName, 'completed');
  
  // Get active jobs
  const activeIds = await runCommand(['LRANGE', activeKey, '0', '-1']);
  
  if (activeIds && activeIds.length > 0) {
    console.log(`\n🔄 Active Jobs (${activeIds.length}):`);
    
    for (const jobId of activeIds) {
      const job = await getJobDetails(queueName, jobId);
      
      if (!job) {
        console.log(`\n   ❌ Job ${jobId}: No data found`);
        continue;
      }
      
      console.log(`\n   📦 Job ${jobId}:`);
      console.log(`      Status: ${job.status || 'N/A'}`);
      console.log(`      Progress: ${job.progress || 0}%`);
      
      if (job.processedOn) {
        const processedAt = new Date(parseInt(job.processedOn));
        const age = Date.now() - processedAt.getTime();
        const ageMinutes = Math.floor(age / 60000);
        console.log(`      Started: ${processedAt.toISOString()} (${ageMinutes} min ago)`);
      }
      
      if (job.data) {
        try {
          const data = JSON.parse(job.data);
          console.log(`      Data:`, JSON.stringify(data, null, 8));
        } catch (e) {
          console.log(`      Data: (Could not parse)`);
        }
      }
      
      if (job.stacktrace) {
        console.log(`      ❌ Error Stack:`);
        try {
          const stack = JSON.parse(job.stacktrace);
          console.log(stack.join('\n'));
        } catch (e) {
          console.log(job.stacktrace);
        }
      }
      
      if (job.failedReason) {
        console.log(`      ❌ Failed Reason: ${job.failedReason}`);
      }
    }
  } else {
    console.log(`\n✅ No active jobs`);
  }
}

async function main() {
  const queues = process.argv.slice(2);
  
  if (queues.length === 0) {
    console.log('Usage: node check-queue-jobs.mjs <queue1> [queue2] ...');
    console.log('Example: node check-queue-jobs.mjs ai-parsing database-save');
    process.exit(1);
  }

  for (const queue of queues) {
    await checkQueue(queue);
  }
}

main().catch(console.error);
