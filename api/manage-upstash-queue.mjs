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
  if (!('result' in data)) {
    return data;
  }
  return data.result;
}

async function runPipeline(commands) {
  const response = await fetch(`${restUrl}/pipeline`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${restToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upstash request failed: ${response.status} ${response.statusText}\n${text}`);
  }

  const data = await response.json();
  if (Array.isArray(data)) {
    return data;
  }
  if ('result' in data) {
    return data.result;
  }
  throw new Error(`Unexpected Upstash response: ${JSON.stringify(data)}`);
}

function queueKey(queue, suffix) {
  return `bull:${queue}${suffix ? `:${suffix}` : ''}`;
}

async function pauseQueue(queue) {
  const waitKey = queueKey(queue, 'wait');
  const pausedKey = queueKey(queue, 'paused');
  const metaKey = queueKey(queue, 'meta');

  console.log(`⏸️  Pausing queue ${queue}...`);

  const commands = [
    ['HSET', metaKey, 'paused', 'true'],
    ['DEL', pausedKey],
    ['RENAMENX', waitKey, pausedKey]
  ];

  const result = await runPipeline(commands);
  const [metaRes, delRes, renameRes] = result.map(entry => entry.result ?? entry);

  console.log(`   HSET meta: ${metaRes}`);
  console.log(`   DEL paused: ${delRes}`);
  console.log(`   RENAMENX wait->paused: ${renameRes}`);
}

async function fetchSetMembers(key) {
  const res = await runCommand(['ZRANGE', key, '0', '-1']);
  return res || [];
}

async function fetchListMembers(key) {
  const res = await runCommand(['LRANGE', key, '0', '-1']);
  return res || [];
}

async function deleteKeys(keys) {
  if (keys.length === 0) return 0;

  let deleted = 0;
  const chunkSize = 10;
  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize);
    const res = await runCommand(['DEL', ...chunk]);
    deleted += res ?? 0;
  }
  return deleted;
}

async function scanKeys(pattern) {
  let cursor = '0';
  const keys = [];
  do {
    const res = await runCommand(['SCAN', cursor, 'MATCH', pattern, 'COUNT', '100']);
    cursor = res[0];
    keys.push(...res[1]);
  } while (cursor !== '0');
  return keys;
}

async function clearFailed(queue) {
  const failedKey = queueKey(queue, 'failed');
  const completedKey = queueKey(queue, 'completed');
  const failedIds = await fetchSetMembers(failedKey);

  console.log(`🧹 Clearing failed jobs for ${queue} (${failedIds.length})`);

  if (failedIds.length > 0) {
    const jobKeys = [];
    for (const id of failedIds) {
      jobKeys.push(queueKey(queue, id));
      jobKeys.push(queueKey(queue, `${id}:logs`));
      jobKeys.push(queueKey(queue, `${id}:lock`));
    }
    await deleteKeys(jobKeys);
  }

  await deleteKeys([failedKey, completedKey]);
  console.log('   Cleared failed/completed sets and job payloads');
}

async function drainQueue(queue) {
  const pattern = queueKey(queue, '*');
  console.log(`🧹 Draining queue ${queue} (pattern ${pattern})`);

  const keys = await scanKeys(pattern);
  if (keys.length === 0) {
    console.log('   No keys found');
    return;
  }

  await deleteKeys(keys);
  console.log(`   Deleted ${keys.length} keys for ${queue}`);
}

async function usage() {
  console.log('Usage: node manage-upstash-queue.mjs <command> <queueName>');
  console.log('Commands:');
  console.log('  pause <queue>       - Move waiting jobs to paused and set meta flag');
  console.log('  clear-failed <queue>- Remove failed/completed sets and job payloads');
  console.log('  drain <queue>       - Delete all Redis keys for the queue');
  process.exit(1);
}

const [,, command, queue] = process.argv;

if (!command || ['pause', 'clear-failed', 'drain'].indexOf(command) === -1) {
  usage();
}

if (!queue) {
  usage();
}

(async () => {
  try {
    if (command === 'pause') {
      await pauseQueue(queue);
    } else if (command === 'clear-failed') {
      await clearFailed(queue);
    } else if (command === 'drain') {
      await drainQueue(queue);
    }
    console.log('✅ Done');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
