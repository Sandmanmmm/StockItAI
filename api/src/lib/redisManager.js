/**
 * Redis Configuration and Connection Management
 * Production-ready Redis setup with connection pooling, health checks, and monitoring
 */

import Redis from 'ioredis'
import dotenv from 'dotenv'
import { getRedisConfig } from '../config/redis.production.js'

dotenv.config()

export class RedisManager {
  constructor() {
    this.redis = null
    this.subscriber = null
    this.publisher = null
    this.isConnected = false
    this.connectionAttempts = 0
    this.maxConnectionAttempts = 5
    this.reconnectDelay = 2000
    this.initializationPromise = null
    
    // Start initialization but don't block constructor
    this.initializationPromise = this.initializeConnections()
  }

  /**
   * Wait for Redis to be ready
   */
  async waitForConnection(timeout = 10000) {
    const startTime = Date.now()
    
    while (!this.isConnected && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    return this.isConnected
  }

  /**
   * Initialize Redis connections with production settings
   */
  async initializeConnections() {
    // Prevent double initialization
    if (this.isConnected) {
      console.log('Redis connections already initialized, skipping...')
      return
    }
    
    try {
      const environment = process.env.NODE_ENV || 'development'
      const redisConfig = getRedisConfig(environment)
      const connectionOptions = redisConfig.connection
      
      console.log(`Initializing Redis connections for ${environment} environment...`)
      
      // Main Redis connection for queue operations
      this.redis = new Redis(connectionOptions)
      
      // Separate connections for pub/sub (recommended for production)
      this.subscriber = new Redis(connectionOptions)
      this.publisher = new Redis(connectionOptions)
      
      this.setupConnectionHandlers()
      this.setupHealthChecks()
      
      // Force connection for lazy connect
      await this.redis.connect()
      await this.subscriber.connect()
      await this.publisher.connect()
      
      console.log('Redis connections initialized successfully')
      
    } catch (error) {
      console.error('Failed to initialize Redis connections:', error)
      await this.handleConnectionFailure(error)
    }
  }

  /**
   * Get production Redis configuration (now using external config)
   * Kept for backward compatibility
   */
  getRedisConfig() {
    // Fallback configuration if external config not available
    const config = {
      port: parseInt(process.env.REDIS_PORT) || 6379,
      host: process.env.REDIS_HOST || 'localhost',
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB) || 0,
      
      // Connection settings
      connectTimeout: 10000,
      lazyConnect: true,
      // CRITICAL: Explicitly set to null to prevent ioredis from adding defaults that Bull rejects
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryDelayOnFailover: 100,
      enableOfflineQueue: false,
      
      // Connection pool settings
      family: 4,
      keepAlive: true,
      
      // Production optimizations
      maxmemoryPolicy: 'allkeys-lru',
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'po_sync:',
      
      // Clustering support (if using Redis Cluster)
      maxLoadingTimeout: 5000
    }

    // Add TLS configuration for production Redis services (AWS ElastiCache, etc.)
    if (process.env.REDIS_TLS === 'true') {
      config.tls = {
        checkServerIdentity: () => undefined // For self-signed certificates
      }
    }

    return config
  }

  /**
   * Setup connection event handlers
   */
  setupConnectionHandlers() {
    // Main Redis connection events
    this.redis.on('connect', () => {
      console.log('Redis main connection established')
      this.isConnected = true
      this.connectionAttempts = 0
    })

    this.redis.on('ready', () => {
      console.log('Redis main connection ready')
    })

    this.redis.on('error', (error) => {
      console.error('Redis main connection error:', error)
      this.isConnected = false
      this.handleConnectionFailure(error)
    })

    this.redis.on('close', () => {
      console.log('Redis main connection closed')
      this.isConnected = false
    })

    this.redis.on('reconnecting', (delay) => {
      console.log(`Redis reconnecting in ${delay}ms...`)
      this.connectionAttempts++
    })

    // Subscriber connection events
    this.subscriber.on('error', (error) => {
      console.error('Redis subscriber error:', error)
    })

    this.subscriber.on('ready', () => {
      console.log('Redis subscriber ready')
      this.setupJobProgressSubscription()
    })

    // Publisher connection events
    this.publisher.on('error', (error) => {
      console.error('Redis publisher error:', error)
    })
  }

  /**
   * Setup health checks and monitoring
   */
  setupHealthChecks() {
    // Periodic health check
    setInterval(async () => {
      try {
        await this.healthCheck()
      } catch (error) {
        console.error('Redis health check failed:', error)
      }
    }, 30000) // Every 30 seconds

    // Memory usage monitoring
    setInterval(async () => {
      try {
        await this.monitorMemoryUsage()
      } catch (error) {
        console.error('Redis memory monitoring failed:', error)
      }
    }, 60000) // Every minute
  }

  /**
   * Comprehensive Redis health check
   */
  async healthCheck() {
    if (!this.redis) return { status: 'disconnected' }

    try {
      const start = Date.now()
      await this.redis.ping()
      const latency = Date.now() - start

      const info = await this.redis.info('memory')
      const memoryInfo = this.parseRedisInfo(info)

      const queueStats = await this.getQueueStats()

      return {
        status: 'healthy',
        latency,
        memory: memoryInfo,
        queues: queueStats,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * Monitor Redis memory usage
   */
  async monitorMemoryUsage() {
    try {
      const info = await this.redis.info('memory')
      const memoryInfo = this.parseRedisInfo(info)
      
      const usedMemoryMB = parseInt(memoryInfo.used_memory) / 1024 / 1024
      const maxMemoryMB = parseInt(memoryInfo.maxmemory) / 1024 / 1024
      
      if (maxMemoryMB > 0) {
        const usagePercent = (usedMemoryMB / maxMemoryMB) * 100
        
        if (usagePercent > 90) {
          console.warn(`Redis memory usage high: ${usagePercent.toFixed(1)}% (${usedMemoryMB.toFixed(1)}MB / ${maxMemoryMB.toFixed(1)}MB)`)
        }
      }
      
      return { usedMemoryMB, maxMemoryMB }
    } catch (error) {
      console.error('Failed to monitor Redis memory:', error)
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    try {
      const queueKeys = await this.redis.keys('*file processing*')
      const stats = {}
      
      for (const key of queueKeys) {
        const keyType = await this.redis.type(key)
        if (keyType === 'list') {
          const length = await this.redis.llen(key)
          stats[key] = length
        }
      }
      
      return stats
    } catch (error) {
      console.error('Failed to get queue stats:', error)
      return {}
    }
  }

  /**
   * Setup job progress subscription for real-time updates
   */
  setupJobProgressSubscription() {
    this.subscriber.subscribe('job:progress', 'job:completed', 'job:failed')
    
    this.subscriber.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message)
        this.handleJobProgressUpdate(channel, data)
      } catch (error) {
        console.error('Failed to parse job progress message:', error)
      }
    })
  }

  /**
   * Handle job progress updates
   */
  handleJobProgressUpdate(channel, data) {
    console.log(`Job progress update [${channel}]:`, data)
    
    // Emit to connected clients via WebSocket (implement WebSocket server separately)
    // this.notifyClients(channel, data)
  }

  /**
   * Publish job progress update
   */
  async publishJobProgress(uploadId, progress, status, message = '') {
    try {
      const data = {
        uploadId,
        progress,
        status,
        message,
        timestamp: Date.now()
      }
      
      await this.publisher.publish('job:progress', JSON.stringify(data))
    } catch (error) {
      console.error('Failed to publish job progress:', error)
    }
  }

  /**
   * Parse Redis INFO response
   */
  parseRedisInfo(info) {
    const lines = info.split('\r\n')
    const result = {}
    
    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':')
        result[key] = value
      }
    }
    
    return result
  }

  /**
   * Create a new subscriber instance for SSE connections
   */
  createSubscriber() {
    const subscriber = new Redis(this.connectionConfig)
    
    subscriber.on('error', (error) => {
      console.error('Redis subscriber error:', error)
    })
    
    subscriber.on('ready', () => {
      console.log('✅ Redis subscriber ready for SSE')
    })
    
    return subscriber
  }

  /**
   * Publish progress update to merchant channel
   */
  async publishMerchantProgress(merchantId, data) {
    try {
      const message = JSON.stringify({
        type: 'progress',
        ...data,
        timestamp: Date.now()
      })
      
      await this.publisher.publish(`merchant:${merchantId}:progress`, message)
      console.log(`📢 Published progress for merchant ${merchantId}:`, data.type || 'progress')
    } catch (error) {
      console.error('Failed to publish merchant progress:', error)
    }
  }

  /**
   * Publish stage change to merchant channel
   */
  async publishMerchantStage(merchantId, data) {
    try {
      const message = JSON.stringify({
        type: 'stage',
        ...data,
        timestamp: Date.now()
      })
      
      await this.publisher.publish(`merchant:${merchantId}:stage`, message)
      console.log(`📢 Published stage for merchant ${merchantId}:`, data.stage)
    } catch (error) {
      console.error('Failed to publish merchant stage:', error)
    }
  }

  /**
   * Publish completion to merchant channel
   */
  async publishMerchantCompletion(merchantId, data) {
    try {
      const message = JSON.stringify({
        type: 'completion',
        ...data,
        timestamp: Date.now()
      })
      
      await this.publisher.publish(`merchant:${merchantId}:completion`, message)
      console.log(`📢 Published completion for merchant ${merchantId}:`, data.stage)
    } catch (error) {
      console.error('Failed to publish merchant completion:', error)
    }
  }

  /**
   * Publish error to merchant channel
   */
  async publishMerchantError(merchantId, data) {
    try {
      const message = JSON.stringify({
        type: 'error',
        ...data,
        timestamp: Date.now()
      })
      
      await this.publisher.publish(`merchant:${merchantId}:error`, message)
      console.log(`📢 Published error for merchant ${merchantId}:`, data.stage)
    } catch (error) {
      console.error('Failed to publish merchant error:', error)
    }
  }

  /**
   * Handle connection failures with exponential backoff
   */
  async handleConnectionFailure(error) {
    if (this.connectionAttempts >= this.maxConnectionAttempts) {
      console.error('Max Redis connection attempts reached. Switching to fallback mode.')
      return
    }

    const delay = this.reconnectDelay * Math.pow(2, this.connectionAttempts)
    console.log(`Retrying Redis connection in ${delay}ms (attempt ${this.connectionAttempts + 1}/${this.maxConnectionAttempts})`)
    
    setTimeout(async () => {
      try {
        await this.initializeConnections()
      } catch (retryError) {
        console.error('Redis reconnection failed:', retryError)
      }
    }, delay)
  }

  /**
   * Get Redis connection for Bull queue (async to wait for connection)
   */
  async getQueueRedisConfig(waitForConnection = true) {
    if (waitForConnection && !this.isConnected) {
      console.log('Waiting for Redis connection...')
      const connected = await this.waitForConnection(10000)
      
      if (!connected) {
        console.warn('Redis connection timeout, using in-memory fallback')
        return null
      }
    }
    
    if (!this.isConnected) {
      console.warn('Redis not connected, using in-memory fallback')
      return null
    }

    return {
      port: this.redis.options.port,
      host: this.redis.options.host,
      password: this.redis.options.password,
      db: this.redis.options.db,
      keyPrefix: this.redis.options.keyPrefix,
      maxRetriesPerRequest: this.redis.options.maxRetriesPerRequest
    }
  }

  /**
   * Set a key-value pair in Redis
   */
  async set(key, value, ttlSeconds = null) {
    if (!this.isConnected) {
      throw new Error('Redis not connected')
    }
    
    if (ttlSeconds) {
      return await this.redis.setex(key, ttlSeconds, value)
    } else {
      return await this.redis.set(key, value)
    }
  }

  /**
   * Get a value from Redis
   */
  async get(key) {
    if (!this.isConnected) {
      throw new Error('Redis not connected')
    }
    
    return await this.redis.get(key)
  }

  /**
   * Delete a key from Redis
   */
  async del(key) {
    if (!this.isConnected) {
      throw new Error('Redis not connected')
    }
    
    return await this.redis.del(key)
  }

  /**
   * Check if a key exists in Redis
   */
  async exists(key) {
    if (!this.isConnected) {
      throw new Error('Redis not connected')
    }
    
    return await this.redis.exists(key)
  }

  /**
   * Set expiration for a key
   */
  async expire(key, ttlSeconds) {
    if (!this.isConnected) {
      throw new Error('Redis not connected')
    }
    
    return await this.redis.expire(key, ttlSeconds)
  }

  /**
   * Properly disconnect all Redis connections
   * Essential for preventing hanging in tests and graceful shutdowns
   */
  async disconnect() {
    const promises = []
    
    try {
      if (this.redis && this.redis.status !== 'end') {
        console.log('🔌 Disconnecting main Redis connection...')
        promises.push(this.redis.quit())
      }
      
      if (this.subscriber && this.subscriber.status !== 'end') {
        console.log('🔌 Disconnecting Redis subscriber...')
        promises.push(this.subscriber.quit())
      }
      
      if (this.publisher && this.publisher.status !== 'end') {
        console.log('🔌 Disconnecting Redis publisher...')  
        promises.push(this.publisher.quit())
      }
      
      // Wait for all disconnections
      await Promise.all(promises)
      
      // Reset state
      this.redis = null
      this.subscriber = null
      this.publisher = null
      this.isConnected = false
      
      console.log('✅ All Redis connections closed successfully')
      
    } catch (error) {
      console.error('❌ Error during Redis disconnection:', error)
      
      // Force close if graceful quit fails
      if (this.redis) this.redis.disconnect(false)
      if (this.subscriber) this.subscriber.disconnect(false)
      if (this.publisher) this.publisher.disconnect(false)
      
      this.redis = null
      this.subscriber = null
      this.publisher = null
      this.isConnected = false
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('Shutting down Redis connections...')
    
    try {
      await this.disconnect()
      console.log('Redis connections closed gracefully')
    } catch (error) {
      console.error('Error during Redis shutdown:', error)
    }
  }
}

// Create singleton instance
export const redisManager = new RedisManager()

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  console.log('🔴 SIGTERM received - shutting down gracefully...')
  await redisManager.shutdown()
})

process.on('SIGINT', async () => {
  console.log('🔴 SIGINT received - shutting down gracefully...')
  await redisManager.shutdown()
})

process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error)
  // Don't shutdown on uncaught exceptions during development
  if (process.env.NODE_ENV !== 'production') {
    console.log('⚠️ Development mode - continuing despite error')
    return
  }
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason)
  // Don't shutdown on unhandled rejections during development
  if (process.env.NODE_ENV !== 'production') {
    console.log('⚠️ Development mode - continuing despite error')
    return
  }
})

export default redisManager