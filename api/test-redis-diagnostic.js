/**
 * Redis Connection Diagnostic Script
 * Tests Redis connectivity and provides installation guidance
 */

import Redis from 'ioredis'
import dotenv from 'dotenv'

dotenv.config()

console.log('🔍 Redis Connection Diagnostic')
console.log('=' .repeat(40))

const redisConfig = {
  port: parseInt(process.env.REDIS_PORT) || 6379,
  host: process.env.REDIS_HOST || 'localhost',
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB) || 0,
  connectTimeout: 5000,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryDelayOnFailover: 100
}

console.log('📋 Configuration:', {
  host: redisConfig.host,
  port: redisConfig.port,
  db: redisConfig.db,
  hasPassword: !!redisConfig.password
})

async function testRedisConnection() {
  const redis = new Redis(redisConfig)
  
  try {
    console.log('\n⏳ Attempting Redis connection...')
    
    // Test connection
    await redis.connect()
    console.log('✅ Redis connection established!')
    
    // Test basic operations
    console.log('📝 Testing basic operations...')
    await redis.set('test:connection', 'success')
    const result = await redis.get('test:connection')
    console.log(`✅ Set/Get test: ${result}`)
    
    // Test info command
    const info = await redis.info('server')
    const redisVersion = info.split('\n').find(line => line.startsWith('redis_version:'))
    console.log(`✅ Redis Server: ${redisVersion || 'Version unknown'}`)
    
    // Cleanup
    await redis.del('test:connection')
    await redis.disconnect()
    
    return { success: true, message: 'Redis is working correctly' }
    
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message)
    
    await redis.disconnect().catch(() => {}) // Cleanup on error
    
    return { 
      success: false, 
      error: error.message,
      code: error.code || 'UNKNOWN'
    }
  }
}

async function provideSolutions(testResult) {
  console.log('\n💡 SOLUTIONS:')
  console.log('=' .repeat(40))
  
  if (testResult.success) {
    console.log('✅ Redis is working! No action needed.')
    return
  }
  
  // Analyze error and provide solutions
  const errorCode = testResult.code
  const errorMessage = testResult.error.toLowerCase()
  
  if (errorCode === 'ECONNREFUSED' || errorMessage.includes('connect econnrefused')) {
    console.log('🔴 ISSUE: Redis server is not running or not installed')
    console.log('\n📦 WINDOWS INSTALLATION OPTIONS:')
    console.log('1. Using Docker (Recommended):')
    console.log('   docker run -d -p 6379:6379 --name redis redis:alpine')
    console.log('')
    console.log('2. Using WSL2:')
    console.log('   wsl --install')
    console.log('   # Then in WSL: sudo apt update && sudo apt install redis-server')
    console.log('')
    console.log('3. Using Memurai (Windows Redis alternative):')
    console.log('   Download from: https://www.memurai.com/')
    console.log('')
    console.log('4. Use In-Memory Fallback (Development only):')
    console.log('   Your app will automatically use in-memory queuing')
  }
  
  else if (errorMessage.includes('timeout') || errorMessage.includes('etimedout')) {
    console.log('🔴 ISSUE: Connection timeout')
    console.log('💡 Check firewall settings and Redis configuration')
  }
  
  else if (errorMessage.includes('auth') || errorMessage.includes('noauth')) {
    console.log('🔴 ISSUE: Authentication required')
    console.log('💡 Set REDIS_PASSWORD in your .env file')
  }
  
  else {
    console.log(`🔴 ISSUE: ${testResult.error}`)
    console.log('💡 Check Redis server logs and configuration')
  }
}

async function testInMemoryFallback() {
  console.log('\n🧪 Testing In-Memory Fallback...')
  
  try {
    // Import our job service which should fallback to in-memory
    const { fileProcessingJobService } = await import('./src/lib/fileProcessingJobService.js')
    
    console.log('✅ Job service loaded with fallback mode')
    
    // Test queue statistics (should work even without Redis)
    const stats = await fileProcessingJobService.getQueueStatistics()
    console.log('✅ Queue statistics:', JSON.stringify(stats.counts, null, 2))
    
    return { success: true, message: 'In-memory fallback is working' }
    
  } catch (error) {
    console.error('❌ In-memory fallback test failed:', error.message)
    return { success: false, error: error.message }
  }
}

// Main diagnostic function
async function runDiagnostic() {
  try {
    // Test Redis connection
    const redisResult = await testRedisConnection()
    
    // Provide solutions based on results
    await provideSolutions(redisResult)
    
    // Test fallback mechanism
    console.log('\n🔄 Testing Fallback Mechanism...')
    const fallbackResult = await testInMemoryFallback()
    
    // Generate report
    const report = {
      timestamp: new Date().toISOString(),
      redis: redisResult,
      fallback: fallbackResult,
      recommendation: redisResult.success 
        ? 'Redis is working correctly'
        : fallbackResult.success 
          ? 'Use in-memory fallback for development, install Redis for production'
          : 'Critical: Both Redis and fallback failed'
    }
    
    console.log('\n📊 DIAGNOSTIC SUMMARY:')
    console.log('=' .repeat(40))
    console.log(`Redis Status: ${redisResult.success ? '✅ OK' : '❌ FAILED'}`)
    console.log(`Fallback Status: ${fallbackResult.success ? '✅ OK' : '❌ FAILED'}`)
    console.log(`Recommendation: ${report.recommendation}`)
    
    // Save report
    const fs = await import('fs/promises')
    await fs.writeFile('redis-diagnostic-report.json', JSON.stringify(report, null, 2))
    console.log('\n📄 Diagnostic report saved to: redis-diagnostic-report.json')
    
    return report
    
  } catch (error) {
    console.error('💥 Diagnostic failed:', error)
    process.exit(1)
  }
}

// Run diagnostic
runDiagnostic()
  .then(report => {
    const hasWorkingSolution = report.redis.success || report.fallback.success
    console.log(`\n🎯 Diagnostic ${hasWorkingSolution ? 'COMPLETE' : 'FOUND CRITICAL ISSUES'}`)
    process.exit(hasWorkingSolution ? 0 : 1)
  })
  .catch(error => {
    console.error('💥 Diagnostic runner failed:', error)
    process.exit(1)
  })