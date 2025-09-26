/**
 * Test using the exact same Redis configuration as the server
 */

import Bull from 'bull';

// Exact same Redis config as the server uses
function getRedisConfig(environment = 'development') {
  const baseConfig = {
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB) || 0,
      family: 4,
      keepAlive: true,
      connectTimeout: 10000,
      lazyConnect: true,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      retryConnectOnFailure: true,
      tls: process.env.REDIS_TLS === 'true' ? {} : null
    }
  };
  
  switch (environment) {
    case 'development':
      return {
        ...baseConfig,
        persistence: {
          rdb: { enabled: false },
          aof: { enabled: false }
        },
        security: {
          ...baseConfig.security,
          requireAuth: false,
          disabledCommands: []
        }
      };
    case 'test':
      return {
        ...baseConfig,
        connection: {
          ...baseConfig.connection,
          db: 15 // Use separate DB for tests
        }
      };
    default:
      return baseConfig;
  }
}

async function testWithServerConfig() {
    console.log('🔍 Testing with exact server Redis configuration...');
    
    try {
        const environment = process.env.NODE_ENV || 'development';
        const redisConfig = getRedisConfig(environment);
        const connectionOptions = redisConfig.connection;
        
        console.log('📡 Using Redis config:', {
            host: connectionOptions.host,
            port: connectionOptions.port,
            db: connectionOptions.db,
            environment
        });
        
        // Create queues with exact server configuration
        // Note: server creates queues with different names!
        const queueNames = [
            'ai-parsing',      // Server uses kebab-case names!
            'database-save',
            'shopify-sync', 
            'status-update'
        ];
        
        const queues = {};
        
        for (const queueName of queueNames) {
            queues[queueName] = new Bull(queueName, {
                redis: connectionOptions,
                defaultJobOptions: {
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 5000
                    },
                    removeOnComplete: 100,
                    removeOnFail: 50
                }
            });
        }
        
        console.log('\n📊 Direct server queue inspection:');
        for (const [queueName, queue] of Object.entries(queues)) {
            const waiting = await queue.getWaiting();
            const active = await queue.getActive();
            const completed = await queue.getCompleted();
            const failed = await queue.getFailed();
            
            console.log(`${queueName}: W=${waiting.length} A=${active.length} C=${completed.length} F=${failed.length}`);
            
            // Show job details
            if (waiting.length > 0) {
                console.log(`  Sample waiting job:`, {
                    id: waiting[0].id,
                    name: waiting[0].name,
                    data: waiting[0].data
                });
            }
        }
        
        // Test adding a job to ai-parsing queue
        console.log('\n➕ Adding job to ai-parsing queue with server config...');
        const aiQueue = queues['ai-parsing'];
        const testJob = await aiQueue.add({ 
            test: true, 
            source: 'server-config-test',
            timestamp: Date.now() 
        });
        console.log(`✅ Job ${testJob.id} added successfully`);
        
        // Check immediately
        const waiting = await aiQueue.getWaiting();
        console.log(`📊 Jobs in ai-parsing queue: ${waiting.length}`);
        
        // Close connections
        for (const queue of Object.values(queues)) {
            await queue.close();
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

testWithServerConfig();