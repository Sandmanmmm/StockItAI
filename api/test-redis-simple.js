/**
 * Simple Redis Connection Test
 */

import { redisManager } from './src/lib/redisManager.js'

async function testRedisConnection() {
  try {
    console.log('🔍 Testing Redis connection...')
    
    // Wait for connection
    await redisManager.waitForConnection(10000)
    console.log('✅ Redis connected successfully')
    
    // Test basic operations
    const testKey = 'test-key'
    const testValue = 'test-value'
    
    console.log(`🔧 Setting test key: ${testKey} = ${testValue}`)
    await redisManager.set(testKey, testValue, 30)
    
    console.log(`🔍 Getting test key: ${testKey}`)
    const retrievedValue = await redisManager.get(testKey)
    console.log(`📤 Retrieved value: ${retrievedValue}`)
    
    if (retrievedValue === testValue) {
      console.log('✅ Redis operations working correctly!')
    } else {
      console.log('❌ Redis value mismatch!')
    }
    
    // Cleanup
    await redisManager.del(testKey)
    console.log('🧹 Test key cleaned up')
    
    process.exit(0)
    
  } catch (error) {
    console.error('❌ Redis connection test failed:', error)
    process.exit(1)
  }
}

testRedisConnection()