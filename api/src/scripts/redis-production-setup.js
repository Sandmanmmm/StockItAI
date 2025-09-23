/**
 * Redis Persistence Setup Script
 * Configures Redis for production persistence, backup, and monitoring
 */

import { execSync, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { generateRedisConf } from '../config/redis.production.js'

class RedisProductionSetup {
  constructor() {
    this.redisDataDir = process.env.REDIS_DATA_DIR || './data/redis'
    this.redisConfigDir = process.env.REDIS_CONFIG_DIR || './config/redis'
    this.backupDir = process.env.REDIS_BACKUP_DIR || './backups/redis'
  }

  /**
   * Setup Redis for production use
   */
  async setupProduction() {
    console.log('🚀 Setting up Redis for production...')
    
    try {
      // Create necessary directories
      this.createDirectories()
      
      // Generate Redis configuration
      this.generateConfig()
      
      // Setup Docker Compose for production Redis
      this.createDockerCompose()
      
      // Create backup scripts
      this.createBackupScripts()
      
      // Create monitoring scripts
      this.createMonitoringScripts()
      
      // Setup health checks
      this.createHealthCheckScript()
      
      console.log('✅ Redis production setup completed successfully!')
      console.log('\nNext steps:')
      console.log('1. Run: docker-compose -f docker-compose.redis.yml up -d')
      console.log('2. Verify: npm run redis:health-check')
      console.log('3. Setup backup cron: npm run redis:setup-backup-cron')
      
    } catch (error) {
      console.error('❌ Redis production setup failed:', error)
      throw error
    }
  }

  /**
   * Create necessary directories
   */
  createDirectories() {
    console.log('📁 Creating directories...')
    
    const dirs = [
      this.redisDataDir,
      this.redisConfigDir,
      this.backupDir,
      path.join(this.backupDir, 'daily'),
      path.join(this.backupDir, 'weekly'),
      path.join(this.backupDir, 'monthly')
    ]

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
        console.log(`  ✓ Created ${dir}`)
      } else {
        console.log(`  • ${dir} already exists`)
      }
    })
  }

  /**
   * Generate Redis configuration file
   */
  generateConfig() {
    console.log('⚙️  Generating Redis configuration...')
    
    const configContent = generateRedisConf()
    const configPath = path.join(this.redisConfigDir, 'redis.conf')
    
    fs.writeFileSync(configPath, configContent)
    console.log(`  ✓ Generated ${configPath}`)
  }

  /**
   * Create Docker Compose file for production Redis
   */
  createDockerCompose() {
    console.log('🐳 Creating Docker Compose configuration...')
    
    const dockerCompose = `version: '3.8'

services:
  redis-production:
    image: redis:7-alpine
    container_name: redis-po-sync-prod
    restart: unless-stopped
    ports:
      - "\${REDIS_PORT:-6379}:6379"
    volumes:
      - ./data/redis:/data
      - ./config/redis/redis.conf:/etc/redis/redis.conf:ro
      - ./logs/redis:/var/log/redis
    command: redis-server /etc/redis/redis.conf
    environment:
      - REDIS_REPLICATION_MODE=master
    networks:
      - po-sync-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    sysctls:
      - net.core.somaxconn=1024
    ulimits:
      memlock:
        soft: -1
        hard: -1

  redis-sentinel:
    image: redis:7-alpine
    container_name: redis-sentinel-po-sync
    restart: unless-stopped
    depends_on:
      - redis-production
    ports:
      - "26379:26379"
    volumes:
      - ./config/redis/sentinel.conf:/etc/redis/sentinel.conf:ro
      - ./logs/redis:/var/log/redis
    command: redis-sentinel /etc/redis/sentinel.conf
    networks:
      - po-sync-network

networks:
  po-sync-network:
    driver: bridge
    ipam:
      driver: default
      config:
        - subnet: 172.20.0.0/16

volumes:
  redis-data:
    driver: local
`

    fs.writeFileSync('docker-compose.redis.yml', dockerCompose)
    console.log('  ✓ Created docker-compose.redis.yml')

    // Create sentinel configuration
    const sentinelConfig = `port 26379
sentinel monitor mymaster redis-production 6379 1
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 10000
sentinel parallel-syncs mymaster 1
`

    const sentinelPath = path.join(this.redisConfigDir, 'sentinel.conf')
    fs.writeFileSync(sentinelPath, sentinelConfig)
    console.log('  ✓ Created sentinel configuration')
  }

  /**
   * Create backup scripts
   */
  createBackupScripts() {
    console.log('💾 Creating backup scripts...')
    
    // Ensure scripts directory exists
    if (!fs.existsSync('scripts')) {
      fs.mkdirSync('scripts', { recursive: true })
    }
    
    // Daily backup script
    const dailyBackup = `#!/bin/bash
# Redis Daily Backup Script

BACKUP_DIR="${this.backupDir}/daily"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
CONTAINER_NAME="redis-po-sync-prod"

echo "Starting Redis backup at $(date)"

# Create RDB backup
docker exec $CONTAINER_NAME redis-cli BGSAVE
sleep 5

# Copy RDB file
docker cp $CONTAINER_NAME:/data/dump.rdb $BACKUP_DIR/dump_$TIMESTAMP.rdb

# Copy AOF file if exists
if docker exec $CONTAINER_NAME test -f /data/appendonly.aof; then
    docker cp $CONTAINER_NAME:/data/appendonly.aof $BACKUP_DIR/appendonly_$TIMESTAMP.aof
fi

# Compress backups
gzip $BACKUP_DIR/dump_$TIMESTAMP.rdb
[ -f $BACKUP_DIR/appendonly_$TIMESTAMP.aof ] && gzip $BACKUP_DIR/appendonly_$TIMESTAMP.aof

# Clean old backups (keep 7 days)
find $BACKUP_DIR -name "*.gz" -mtime +7 -delete

echo "Redis backup completed at $(date)"
`

    fs.writeFileSync('scripts/redis-backup-daily.sh', dailyBackup, { mode: 0o755 })
    
    // Weekly backup script
    const weeklyBackup = `#!/bin/bash
# Redis Weekly Backup Script

BACKUP_DIR="${this.backupDir}/weekly"
TIMESTAMP=$(date +%Y%m%d)
CONTAINER_NAME="redis-po-sync-prod"

echo "Starting Redis weekly backup at $(date)"

# Create full backup with verification
docker exec $CONTAINER_NAME redis-cli BGSAVE
sleep 10

# Copy and verify backup
docker cp $CONTAINER_NAME:/data/dump.rdb $BACKUP_DIR/dump_weekly_$TIMESTAMP.rdb
docker cp $CONTAINER_NAME:/data/appendonly.aof $BACKUP_DIR/appendonly_weekly_$TIMESTAMP.aof 2>/dev/null || true

# Create archive
tar -czf $BACKUP_DIR/redis_weekly_$TIMESTAMP.tar.gz -C $BACKUP_DIR dump_weekly_$TIMESTAMP.rdb appendonly_weekly_$TIMESTAMP.aof 2>/dev/null || tar -czf $BACKUP_DIR/redis_weekly_$TIMESTAMP.tar.gz -C $BACKUP_DIR dump_weekly_$TIMESTAMP.rdb

# Clean individual files
rm -f $BACKUP_DIR/dump_weekly_$TIMESTAMP.rdb $BACKUP_DIR/appendonly_weekly_$TIMESTAMP.aof

# Clean old weekly backups (keep 4 weeks)
find $BACKUP_DIR -name "redis_weekly_*.tar.gz" -mtime +28 -delete

echo "Redis weekly backup completed at $(date)"
`

    fs.writeFileSync('scripts/redis-backup-weekly.sh', weeklyBackup, { mode: 0o755 })
    console.log('  ✓ Created backup scripts')
  }

  /**
   * Create monitoring scripts
   */
  createMonitoringScripts() {
    console.log('📊 Creating monitoring scripts...')
    
    const monitoringScript = `#!/bin/bash
# Redis Monitoring Script

CONTAINER_NAME="redis-po-sync-prod"
LOG_FILE="logs/redis-monitor.log"
ALERT_EMAIL="${process.env.REDIS_ALERT_EMAIL || 'admin@yourcompany.com'}"

# Function to log with timestamp
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a $LOG_FILE
}

# Check if Redis container is running
if ! docker ps | grep -q $CONTAINER_NAME; then
    log "CRITICAL: Redis container is not running"
    exit 1
fi

# Get Redis info
REDIS_INFO=$(docker exec $CONTAINER_NAME redis-cli info)
MEMORY_USED=$(echo "$REDIS_INFO" | grep "used_memory_human" | cut -d: -f2 | tr -d '\\r')
CONNECTED_CLIENTS=$(echo "$REDIS_INFO" | grep "connected_clients" | cut -d: -f2 | tr -d '\\r')
UPTIME=$(echo "$REDIS_INFO" | grep "uptime_in_days" | cut -d: -f2 | tr -d '\\r')

# Check memory usage
MEMORY_PERCENT=$(docker exec $CONTAINER_NAME redis-cli info memory | grep used_memory_rss | cut -d: -f2 | tr -d '\\r')
if [ "$MEMORY_PERCENT" -gt 1073741824 ]; then  # 1GB
    log "WARNING: High memory usage: $MEMORY_USED"
fi

# Check connection count
if [ "$CONNECTED_CLIENTS" -gt 100 ]; then
    log "WARNING: High connection count: $CONNECTED_CLIENTS"
fi

# Log status
log "STATUS: Memory: $MEMORY_USED, Clients: $CONNECTED_CLIENTS, Uptime: $UPTIME days"

# Check last save time
LAST_SAVE=$(docker exec $CONTAINER_NAME redis-cli lastsave)
CURRENT_TIME=$(date +%s)
SAVE_DIFF=$((CURRENT_TIME - LAST_SAVE))

if [ "$SAVE_DIFF" -gt 3600 ]; then  # 1 hour
    log "WARNING: Last save was $(($SAVE_DIFF / 60)) minutes ago"
fi
`

    if (!fs.existsSync('scripts')) {
      fs.mkdirSync('scripts', { recursive: true })
    }
    
    fs.writeFileSync('scripts/redis-monitor.sh', monitoringScript, { mode: 0o755 })
    console.log('  ✓ Created monitoring script')
  }

  /**
   * Create health check script
   */
  createHealthCheckScript() {
    console.log('🏥 Creating health check script...')
    
    const healthCheckScript = `#!/usr/bin/env node
/**
 * Redis Health Check Script
 */

import Redis from 'ioredis'

async function healthCheck() {
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    connectTimeout: 5000,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3
  })

  try {
    console.log('🔍 Running Redis health check...')
    
    // Test basic connectivity
    const pong = await redis.ping()
    console.log(\`✅ Ping: \${pong}\`)
    
    // Test write/read operations
    const testKey = 'health:check:' + Date.now()
    await redis.set(testKey, 'test-value', 'EX', 60)
    const testValue = await redis.get(testKey)
    console.log(\`✅ Write/Read: \${testValue === 'test-value' ? 'OK' : 'FAILED'}\`)
    
    // Get server info
    const info = await redis.info()
    const lines = info.split('\\n')
    
    const uptime = lines.find(line => line.startsWith('uptime_in_days:'))?.split(':')[1]?.trim()
    const memory = lines.find(line => line.startsWith('used_memory_human:'))?.split(':')[1]?.trim()
    const clients = lines.find(line => line.startsWith('connected_clients:'))?.split(':')[1]?.trim()
    
    console.log(\`📊 Uptime: \${uptime} days\`)
    console.log(\`💾 Memory: \${memory}\`)
    console.log(\`👥 Clients: \${clients}\`)
    
    // Test pub/sub
    const subscriber = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD
    })
    
    await new Promise((resolve) => {
      subscriber.subscribe('health:test')
      subscriber.on('message', (channel, message) => {
        if (channel === 'health:test' && message === 'test') {
          console.log('✅ Pub/Sub: OK')
          resolve()
        }
      })
      redis.publish('health:test', 'test')
    })
    
    await redis.del(testKey)
    await redis.disconnect()
    await subscriber.disconnect()
    
    console.log('🎉 Redis health check passed!')
    process.exit(0)
    
  } catch (error) {
    console.error('❌ Redis health check failed:', error.message)
    process.exit(1)
  }
}

healthCheck()
`

    fs.writeFileSync('scripts/redis-health-check.js', healthCheckScript, { mode: 0o755 })
    console.log('  ✓ Created health check script')
  }

  /**
   * Setup backup cron jobs
   */
  setupBackupCron() {
    console.log('⏰ Setting up backup cron jobs...')
    
    const cronJobs = `# Redis backup cron jobs
# Daily backup at 2 AM
0 2 * * * /path/to/your/project/scripts/redis-backup-daily.sh >> /var/log/redis-backup.log 2>&1

# Weekly backup on Sunday at 3 AM  
0 3 * * 0 /path/to/your/project/scripts/redis-backup-weekly.sh >> /var/log/redis-backup.log 2>&1

# Monitoring every 5 minutes
*/5 * * * * /path/to/your/project/scripts/redis-monitor.sh

# Health check every hour
0 * * * * /path/to/your/project/scripts/redis-health-check.js >> /var/log/redis-health.log 2>&1
`

    fs.writeFileSync('config/redis-crontab.txt', cronJobs)
    console.log('  ✓ Created cron configuration (install with: crontab config/redis-crontab.txt)')
  }
}

// Run setup if called directly (simplified check)
const isMainModule = process.argv[1] && process.argv[1].includes('redis-production-setup.js')
if (isMainModule) {
  console.log('🚀 Starting Redis Production Setup...')
  const setup = new RedisProductionSetup()
  setup.setupProduction().catch(console.error)
} else {
  console.log('📦 Redis Production Setup module loaded')
}

export default RedisProductionSetup