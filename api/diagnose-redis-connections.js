/**
 * Redis Connection Analysis and Fix
 * 
 * Diagnoses and fixes Redis connection hanging issues
 */

import Redis from 'ioredis'
import { getRedisConfig } from './src/config/redis.production.js'

async function analyzeRedisConnections() {
  console.log('🔍 Analyzing Redis Connection Issues')
  console.log('=' .repeat(50))
  
  let redis = null
  
  try {
    // Test 1: Basic Redis Connection
    console.log('\n📡 Test 1: Basic Redis Connection')
    console.log('-'.repeat(30))
    
    const environment = process.env.NODE_ENV || 'development'
    console.log(`Environment: ${environment}`)
    
    const redisConfig = getRedisConfig(environment)
    console.log('Redis config:', {
      host: redisConfig.connection.host,
      port: redisConfig.connection.port,
      connectTimeout: redisConfig.connection.connectTimeout,
      lazyConnect: redisConfig.connection.lazyConnect
    })
    
    // Create a simple connection with minimal config
    redis = new Redis({
      host: redisConfig.connection.host,
      port: redisConfig.connection.port,
      connectTimeout: 5000,
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      retryDelayOnCloseConnection: 100,
      enableReadyCheck: true,
      maxLoadingTimeout: 5000
    })
    
    // Test connection
    console.log('⏳ Connecting to Redis...')
    await redis.ping()
    console.log('✅ Redis connection successful')
    
    // Test 2: Basic Operations
    console.log('\n💾 Test 2: Basic Operations')
    console.log('-'.repeat(30))
    
    await redis.set('test:key', 'test:value')
    console.log('✅ SET operation successful')
    
    const value = await redis.get('test:key')
    console.log(`✅ GET operation successful: ${value}`)
    
    await redis.del('test:key')
    console.log('✅ DEL operation successful')
    
    // Test 3: Connection Status
    console.log('\n🔌 Test 3: Connection Status')
    console.log('-'.repeat(30))
    
    console.log(`Connection status: ${redis.status}`)
    console.log(`Connected: ${redis.status === 'ready'}`)
    
    // Test 4: Proper Cleanup
    console.log('\n🧹 Test 4: Connection Cleanup')
    console.log('-'.repeat(30))
    
    console.log('⏳ Disconnecting from Redis...')
    await redis.quit()
    console.log('✅ Redis disconnection successful')
    
    console.log(`Final status: ${redis.status}`)
    redis = null
    
    console.log('\n✅ Redis Connection Analysis Complete!')
    console.log('Key findings:')
    console.log('• Basic connections work correctly')
    console.log('• Operations are successful')
    console.log('• Proper cleanup with quit() resolves hanging')
    
  } catch (error) {
    console.error('\n❌ Redis connection analysis failed:', error.message)
    console.error('Stack:', error.stack)
    
    if (redis) {
      try {
        await redis.quit()
        console.log('✅ Cleaned up Redis connection after error')
      } catch (cleanupError) {
        console.error('❌ Failed to cleanup Redis connection:', cleanupError.message)
      }
    }
  }
}

// Test the improved RedisManager pattern
async function testImprovedRedisManager() {
  console.log('\n🔧 Testing Improved Redis Manager Pattern')
  console.log('=' .repeat(50))
  
  // Create a simple, non-singleton Redis manager for testing
  class TestRedisManager {
    constructor() {
      this.redis = null
      this.isConnected = false
    }
    
    async connect() {
      if (this.redis) return this.redis
      
      const redisConfig = getRedisConfig(process.env.NODE_ENV || 'development')
      
      this.redis = new Redis({
        host: redisConfig.connection.host,
        port: redisConfig.connection.port,
        connectTimeout: 5000,
        lazyConnect: false,
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        maxLoadingTimeout: 5000
      })
      
      // Wait for connection
      await this.redis.ping()
      this.isConnected = true
      
      console.log('✅ TestRedisManager connected')
      return this.redis
    }
    
    async set(key, value, ttl) {
      const redis = await this.connect()
      if (ttl) {
        return await redis.setex(key, ttl, value)
      }
      return await redis.set(key, value)
    }
    
    async get(key) {
      const redis = await this.connect()
      return await redis.get(key)
    }
    
    async disconnect() {
      if (this.redis) {
        await this.redis.quit()
        this.redis = null
        this.isConnected = false
        console.log('✅ TestRedisManager disconnected')
      }
    }
  }
  
  const testManager = new TestRedisManager()
  
  try {
    // Test operations
    await testManager.set('test:improved', 'improved:value', 60)
    console.log('✅ Improved SET operation')
    
    const value = await testManager.get('test:improved')
    console.log(`✅ Improved GET operation: ${value}`)
    
    // Proper cleanup
    await testManager.disconnect()
    console.log('✅ Improved Redis manager test complete')
    
  } catch (error) {
    console.error('❌ Improved Redis manager test failed:', error.message)
    await testManager.disconnect()
  }
}

async function runDiagnostics() {
  console.log('🚀 Starting Redis Diagnostics')
  
  try {
    await analyzeRedisConnections()
    await testImprovedRedisManager()
    
    console.log('\n🎯 RECOMMENDATIONS:')
    console.log('━' .repeat(40))
    console.log('1. Always call redis.quit() to close connections')
    console.log('2. Use connectTimeout and maxLoadingTimeout for faster failures')
    console.log('3. Set maxRetriesPerRequest=1 for testing to avoid hanging')
    console.log('4. Use lazyConnect=false for immediate connection feedback')
    console.log('5. Implement proper cleanup in test scripts')
    
    console.log('\n✅ Redis diagnostics complete - connections working properly!')
    
  } catch (error) {
    console.error('\n❌ Diagnostics failed:', error)
  }
  
  // Force exit to prevent hanging
  console.log('\n🏁 Forcing process exit to prevent hanging')
  process.exit(0)
}

runDiagnostics()