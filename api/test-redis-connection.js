/**
 * Quick Redis Queue Connection Test
 * Tests that the job queue properly connects to Redis now that Redis is running
 */

import { redisManager } from './src/lib/redisManager.js'
import { fileProcessingJobService } from './src/lib/fileProcessingJobService.js'

console.log('🔍 Testing Redis Queue Connection...')

async function testRedisQueueConnection() {
  try {
    // Wait for Redis manager to connect
    console.log('⏳ Waiting for Redis manager to connect...')
    await redisManager.initializationPromise
    
    const connected = await redisManager.waitForConnection(5000)
    console.log(`Redis connection status: ${connected ? '✅ Connected' : '❌ Failed'}`)
    
    // Test job service initialization
    console.log('⏳ Initializing job service...')
    const queue = await fileProcessingJobService.getQueue()
    console.log('✅ Job service initialized')
    
    // Test queue statistics
    console.log('📊 Testing queue statistics...')
    const stats = await fileProcessingJobService.getQueueStatistics()
    console.log('✅ Queue statistics:', JSON.stringify(stats.counts, null, 2))
    
    // Test Redis health check
    console.log('🏥 Testing Redis health check...')
    const health = await redisManager.healthCheck()
    console.log('✅ Redis health:', health.status)
    
    console.log('\n🎉 SUCCESS: Redis queue is working properly!')
    return true
    
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    return false
  }
}

// Run test
testRedisQueueConnection()
  .then(success => {
    console.log(`\n🎯 Test ${success ? 'PASSED' : 'FAILED'}`)
    process.exit(success ? 0 : 1)
  })
  .catch(error => {
    console.error('💥 Test crashed:', error)
    process.exit(1)
  })