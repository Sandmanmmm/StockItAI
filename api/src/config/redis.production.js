/**
 * Production Redis Configuration
 * Configures Redis for persistence, high availability, and reliability
 */

const REDIS_CONFIG = {
  // Connection settings
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB) || 0,
    
    // Connection pooling
    family: 4,
    keepAlive: true,
    connectTimeout: 10000,
    lazyConnect: true,
    
    // Retry configuration
    retryDelayOnFailover: 100,
    retryConnectOnFailure: true,
    // CRITICAL: Explicitly set to null/false to prevent ioredis from adding defaults that Bull v3 rejects
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    
    // Enable TLS for production
    tls: process.env.REDIS_TLS === 'true' ? {} : null
  },

  // Persistence configuration
  persistence: {
    // RDB (Redis Database) snapshots
    rdb: {
      enabled: true,
      // Save snapshot if at least 1 key changed in 900 seconds (15 min)
      // or 10 keys in 300 seconds (5 min) 
      // or 10000 keys in 60 seconds (1 min)
      savePolicy: '900 1 300 10 60 10000',
      filename: 'dump.rdb',
      compression: true,
      checksumEnabled: true
    },
    
    // AOF (Append Only File) for maximum durability
    aof: {
      enabled: true,
      filename: 'appendonly.aof',
      // fsync policy: 'always', 'everysec', 'no'
      fsyncPolicy: 'everysec', // Good balance of performance and safety
      rewritePercentage: 100, // Auto-rewrite when AOF is 100% larger than RDB
      rewriteMinSize: 67108864 // 64MB minimum size before rewrite
    }
  },

  // Memory management
  memory: {
    policy: 'allkeys-lru', // Evict least recently used keys when memory limit reached
    maxMemory: process.env.REDIS_MAX_MEMORY || '2gb',
    samples: 5 // Number of keys to sample for LRU
  },

  // Security settings
  security: {
    requireAuth: process.env.NODE_ENV === 'production',
    password: process.env.REDIS_PASSWORD,
    // Disable dangerous commands in production
    disabledCommands: ['FLUSHDB', 'FLUSHALL', 'KEYS', 'CONFIG', 'DEBUG'],
    // Client timeout (0 = no timeout)
    timeout: 0
  },

  // Job queue specific settings
  jobQueue: {
    // Default job options
    defaultJobOptions: {
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: 50, // Keep last 50 failed jobs
      attempts: 5, // Maximum retry attempts
      backoff: {
        type: 'exponential',
        delay: 2000 // Start with 2 second delay
      }
    },
    
    // Dead letter queue configuration
    deadLetterQueue: {
      enabled: true,
      queueName: 'failed-jobs',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      maxSize: 1000 // Maximum failed jobs to retain
    },
    
    // Priority levels
    priorities: {
      critical: 10,
      high: 7,
      normal: 5,
      low: 3,
      batch: 1
    }
  },

  // Health check settings
  healthCheck: {
    interval: 30000, // 30 seconds
    timeout: 5000, // 5 second timeout
    retries: 3
  },

  // Monitoring and metrics
  monitoring: {
    metricsEnabled: true,
    slowLogEnabled: true,
    slowLogThreshold: 10000, // 10ms threshold for slow operations
    clientListEnabled: true
  }
};

/**
 * Generate Redis configuration for different environments
 */
function getRedisConfig(environment = 'production') {
  const baseConfig = { ...REDIS_CONFIG };
  
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
        },
        persistence: {
          rdb: { enabled: false },
          aof: { enabled: false }
        }
      };
      
    case 'production':
    default:
      return baseConfig;
  }
}

/**
 * Generate Redis server configuration file content
 */
function generateRedisConf() {
  const config = getRedisConfig('production');
  
  return `# Redis Production Configuration
# Generated automatically - do not edit manually

# Network
bind 127.0.0.1
port ${config.connection.port}
timeout ${config.security.timeout}
tcp-keepalive 300

# Security
${config.security.requireAuth ? `requirepass ${config.security.password}` : '# No password required'}
${config.security.disabledCommands.map(cmd => `rename-command ${cmd} ""`).join('\n')}

# Memory Management
maxmemory ${config.memory.maxMemory}
maxmemory-policy ${config.memory.policy}
maxmemory-samples ${config.memory.samples}

# RDB Persistence
${config.persistence.rdb.enabled ? `
save ${config.persistence.rdb.savePolicy}
stop-writes-on-bgsave-error yes
rdbcompression ${config.persistence.rdb.compression ? 'yes' : 'no'}
rdbchecksum ${config.persistence.rdb.checksumEnabled ? 'yes' : 'no'}
dbfilename ${config.persistence.rdb.filename}
` : 'save ""'}

# AOF Persistence
${config.persistence.aof.enabled ? `
appendonly yes
appendfilename "${config.persistence.aof.filename}"
appendfsync ${config.persistence.aof.fsyncPolicy}
auto-aof-rewrite-percentage ${config.persistence.aof.rewritePercentage}
auto-aof-rewrite-min-size ${config.persistence.aof.rewriteMinSize}
` : 'appendonly no'}

# Logging
loglevel notice
syslog-enabled yes
syslog-ident redis

# Slow Log
slowlog-log-slower-than ${config.monitoring.slowLogThreshold}
slowlog-max-len 128

# Client Management
maxclients 10000
`;
}

// ES6 export
export {
  getRedisConfig,
  generateRedisConf,
  REDIS_CONFIG
};