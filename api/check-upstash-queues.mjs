const restUrl = process.env.UPSTASH_REDIS_REST_URL;
const restToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!restUrl || !restToken) {
  console.error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN environment variables.');
  process.exit(1);
}

const QUEUE_NAMES = [
  'ai-parsing',
  'database-save',
  'product-draft-creation',
  'image-attachment',
  'shopify-sync',
  'status-update',
  'data-normalization',
  'merchant-config',
  'ai-enrichment',
  'shopify-payload'
];

async function pipeline(commands) {
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

function makeCommands(queue) {
  const prefix = `bull:${queue}`;
  return [
    ['TYPE', prefix],
    ['LLEN', `${prefix}:wait`],
    ['LLEN', `${prefix}:active`],
    ['ZCARD', `${prefix}:completed`],
    ['ZCARD', `${prefix}:failed`],
    ['LLEN', `${prefix}:delayed`]
  ];
}

(async () => {
  console.log('📊 Upstash Queue Status');
  console.log('='.repeat(60));

  for (const queue of QUEUE_NAMES) {
    try {
  const commands = makeCommands(queue);
  const result = await pipeline(commands);

  const [type, waiting, active, completed, failed, delayed] = result.map(entry => entry.result ?? entry);

      console.log(`\n📋 ${queue}`);
      console.log(`   Type: ${type}`);
      console.log(`   Waiting: ${waiting}`);
      console.log(`   Active: ${active}`);
      console.log(`   Completed: ${completed}`);
      console.log(`   Failed: ${failed}`);
      console.log(`   Delayed: ${delayed}`);
    } catch (error) {
      console.error(`\n❌ Error querying ${queue}:`, error.message);
    }
  }

  console.log('\n' + '='.repeat(60));
})();
