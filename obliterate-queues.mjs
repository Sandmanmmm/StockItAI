/**
 * Clear ALL jobs from Bull queues (waiting, active, completed, failed)
 * Use this for a fresh start before testing sequential workflows
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

async function obliterateQueue(queueName) {
  console.log(`\n🗑️  Obliterating ${queueName}...`);
  
  const keys = [
    queueKey(queueName, 'wait'),
    queueKey(queueName, 'active'),
    queueKey(queueName, 'completed'),
    queueKey(queueName, 'failed'),
    queueKey(queueName, 'delayed'),
    queueKey(queueName, 'paused'),
    queueKey(queueName, 'repeat')
  ];

  let totalDeleted = 0;

  for (const key of keys) {
    const type = key.split(':').pop();
    
    try {
      // Try to get count and delete
      let count = 0;
      
      // Try as set first
      try {
        count = await runCommand(['SCARD', key]);
        if (count > 0) {
          console.log(`   🧹 Clearing ${count} jobs from ${type} (set)...`);
          await runCommand(['DEL', key]);
          totalDeleted += count;
        }
      } catch (e1) {
        // If not a set, try as list
        try {
          count = await runCommand(['LLEN', key]);
          if (count > 0) {
            console.log(`   🧹 Clearing ${count} jobs from ${type} (list)...`);
            await runCommand(['DEL', key]);
            totalDeleted += count;
          }
        } catch (e2) {
          // Key might not exist or be a different type, skip it
          console.log(`   ℹ️  Skipping ${type} (doesn't exist or empty)`);
        }
      }
    } catch (error) {
      console.log(`   ⚠️  Error clearing ${type}: ${error.message}`);
    }
  }

  // Also clear any job data keys
  const pattern = `bull:${queueName}:*`;
  let cursor = 0;
  let jobKeysDeleted = 0;

  do {
    const result = await runCommand(['SCAN', cursor.toString(), 'MATCH', pattern, 'COUNT', '100']);
    cursor = parseInt(result[0]);
    const keys = result[1];

    for (const key of keys) {
      // Only delete job data keys (numeric IDs), not the main queue keys
      const parts = key.split(':');
      const lastPart = parts[parts.length - 1];
      if (!isNaN(lastPart) || lastPart.endsWith(':lock')) {
        await runCommand(['DEL', key]);
        jobKeysDeleted++;
      }
    }
  } while (cursor !== 0);

  if (jobKeysDeleted > 0) {
    console.log(`   🧹 Deleted ${jobKeysDeleted} job data keys`);
  }

  console.log(`   ✅ ${queueName} obliterated (${totalDeleted} jobs removed)`);
}

async function main() {
  const queues = [
    'ai-parsing',
    'database-save',
    'product-draft-creation',
    'image-attachment',
    'shopify-sync',
    'status-update',
    'background-image-processing',
    'data-normalization',
    'merchant-config',
    'ai-enrichment',
    'shopify-payload'
  ];

  console.log('💣 OBLITERATING ALL BULL QUEUES...\n');
  console.log('⚠️  This will delete ALL jobs (waiting, active, completed, failed)\n');

  for (const queue of queues) {
    await obliterateQueue(queue);
  }

  console.log('\n✅ All queues obliterated! Fresh slate ready for testing.');
}

main().catch(console.error);
