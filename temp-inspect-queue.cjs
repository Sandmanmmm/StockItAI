const Redis = require('ioredis');

async function main() {
  const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
  if (!redisUrl) {
    console.error('Missing REDIS_URL environment variable');
    process.exit(1);
  }

  let client;
  if (redisUrl.startsWith('redis://') || redisUrl.startsWith('rediss://')) {
    client = new Redis(redisUrl);
  } else {
    console.error('Unsupported Redis URL format:', redisUrl);
    process.exit(1);
  }

  try {
    const queues = ['ai-parsing', 'database-save', 'product-drafts', 'image-attachment', 'status-update'];
    for (const queue of queues) {
      const waiting = await client.llen(`bull:${queue}:wait`);
      const active = await client.llen(`bull:${queue}:active`);
      const delayed = await client.zcard(`bull:${queue}:delayed`);
      const failed = await client.zcard(`bull:${queue}:failed`);
      const completed = await client.zcard(`bull:${queue}:completed`);

      console.log(`Queue ${queue}: wait=${waiting}, active=${active}, delayed=${delayed}, failed=${failed}, completed=${completed}`);
    }
  } finally {
    if (client) {
      await client.quit();
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
