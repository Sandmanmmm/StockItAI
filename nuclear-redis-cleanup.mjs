#!/usr/bin/env node

/**
 * Nuclear Redis Cleanup - Remove ALL Bull queue data and metadata
 * This completely obliterates Bull from Redis to fix corruption issues
 */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || 'https://enormous-burro-19362.upstash.io';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!UPSTASH_TOKEN) {
  console.error('❌ UPSTASH_REDIS_REST_TOKEN environment variable is required');
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${UPSTASH_TOKEN}`,
  'Content-Type': 'application/json'
};

async function redisCommand(command) {
  const response = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(command)
  });
  
  if (!response.ok) {
    throw new Error(`Redis command failed: ${response.statusText}`);
  }
  
  return await response.json();
}

async function scanKeys(pattern) {
  let cursor = '0';
  const allKeys = [];
  
  do {
    const result = await redisCommand(['SCAN', cursor, 'MATCH', pattern, 'COUNT', '100']);
    cursor = result.result[0];
    const keys = result.result[1];
    allKeys.push(...keys);
  } while (cursor !== '0');
  
  return allKeys;
}

async function deleteKeys(keys) {
  if (keys.length === 0) return 0;
  
  // Delete in batches of 100
  let deleted = 0;
  for (let i = 0; i < keys.length; i += 100) {
    const batch = keys.slice(i, i + 100);
    await redisCommand(['DEL', ...batch]);
    deleted += batch.length;
  }
  
  return deleted;
}

async function nukeEverything() {
  console.log('☢️  NUCLEAR REDIS CLEANUP INITIATED');
  console.log('='.repeat(60));
  
  // Get ALL keys related to Bull queues
  const patterns = [
    'bull:*',           // All Bull keys
    'bull_*',           // Alternative prefix
    '*:id',             // Job ID counters
    '*:meta',           // Queue metadata
    '*:events',         // Event streams
    '*:stalled-check',  // Stalled job checks
    '*:limiter',        // Rate limiters
    '*:delay',          // Delayed jobs
    '*:priority',       // Priority queues
    '*:repeat',         // Repeating jobs
  ];
  
  let totalDeleted = 0;
  
  for (const pattern of patterns) {
    console.log(`\n🔍 Scanning for: ${pattern}`);
    const keys = await scanKeys(pattern);
    
    if (keys.length === 0) {
      console.log(`   ✓ No keys found`);
      continue;
    }
    
    console.log(`   Found ${keys.length} keys`);
    
    // Show first 5 keys as sample
    console.log(`   Sample: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`);
    
    const deleted = await deleteKeys(keys);
    totalDeleted += deleted;
    console.log(`   ✓ Deleted ${deleted} keys`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`☢️  NUCLEAR CLEANUP COMPLETE`);
  console.log(`   Total keys deleted: ${totalDeleted}`);
  console.log(`   Redis is now completely clean of Bull data`);
  console.log('='.repeat(60));
}

// Run it
nukeEverything()
  .then(() => {
    console.log('\n✅ Cleanup successful');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Cleanup failed:', error);
    process.exit(1);
  });
