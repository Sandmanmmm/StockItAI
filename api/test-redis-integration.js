/**
 * Redis Integration Test Script  
 * Comprehensive testing of Redis manager, job queue, and monitoring APIs
 */

import dotenv from 'dotenv'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Import our Redis integration components (with error handling)
let redisManager, FileProcessingJobService

try {
  const redisManagerModule = await import('./src/lib/redisManager.js')
  redisManager = redisManagerModule.redisManager || redisManagerModule.default
  
  const jobServiceModule = await import('./src/lib/fileProcessingJobService.js')
  const FileProcessingJobServiceClass = jobServiceModule.FileProcessingJobService || jobServiceModule.default
  
  // Create instance if we have the class
  const fileProcessingJobService = jobServiceModule.fileProcessingJobService || new FileProcessingJobServiceClass()
  
  console.log('✅ Successfully imported Redis integration modules')
} catch (error) {
  console.error('❌ Failed to import modules:', error.message)
  console.log('Will run basic Redis connection test only...')
}

/**
 * Test Redis Manager Connection and Health
 */
async function testRedisManager() {
  console.log('\n🔴 Testing Redis Manager Connection...')
  
  try {
    // Test Redis connection
    const healthStatus = await redisManager.healthCheck()
    console.log('✅ Redis Health Check:', JSON.stringify(healthStatus, null, 2))
    
    // Test Redis memory monitoring
    const memoryStats = await redisManager.monitorMemoryUsage()
    console.log('✅ Redis Memory Stats:', memoryStats)
    
    // Test progress publishing
    await redisManager.publishJobProgress('test-upload-123', 50, 'processing', 'Test progress message')
    console.log('✅ Redis Progress Publishing: Success')
    
    return { success: true, healthStatus }
  } catch (error) {
    console.error('❌ Redis Manager Test Failed:', error.message)
    return { success: false, error: error.message }
  }
}

/**
 * Test Job Queue Operations
 */
async function testJobQueue() {
  console.log('\n⚙️ Testing Job Queue Operations...')
  
  try {
    // Get initial queue statistics
    const initialStats = await fileProcessingJobService.getQueueStatistics()
    console.log('✅ Initial Queue Stats:', JSON.stringify(initialStats.counts, null, 2))
    
    // Test adding a mock job
    const mockFileData = {
      fileName: 'test-po.pdf',
      fileSize: 12345,
      mimeType: 'application/pdf',
      merchantId: 'test-merchant-123',
      supplierId: 'test-supplier-456',
      buffer: Buffer.from('mock file content')
    }
    
    const testUploadId = `test-upload-${Date.now()}`
    console.log(`📤 Adding test job: ${testUploadId}`)
    
    const job = await fileProcessingJobService.addFileProcessingJob(testUploadId, mockFileData)
    console.log('✅ Job Added Successfully:', { id: job.id, name: job.name })
    
    // Test job status retrieval
    setTimeout(async () => {
      try {
        const jobStatus = await fileProcessingJobService.getJobStatus(testUploadId)
        console.log('✅ Job Status:', JSON.stringify(jobStatus, null, 2))
        
        // Get updated queue statistics
        const updatedStats = await fileProcessingJobService.getQueueStatistics()
        console.log('✅ Updated Queue Stats:', JSON.stringify(updatedStats.counts, null, 2))
      } catch (error) {
        console.error('❌ Job Status Check Failed:', error.message)
      }
    }, 2000)
    
    return { success: true, jobId: job.id }
  } catch (error) {
    console.error('❌ Job Queue Test Failed:', error.message)
    return { success: false, error: error.message }
  }
}

/**
 * Test Job Monitoring Features
 */
async function testJobMonitoring() {
  console.log('\n📊 Testing Job Monitoring Features...')
  
  try {
    // Test getting active jobs
    const activeJobs = await fileProcessingJobService.getActiveJobs({ limit: 5 })
    console.log('✅ Active Jobs Retrieved:', {
      count: activeJobs.jobs.length,
      pagination: activeJobs.pagination
    })
    
    // Test getting failed jobs
    const failedJobs = await fileProcessingJobService.getFailedJobs({ limit: 5 })
    console.log('✅ Failed Jobs Retrieved:', {
      count: failedJobs.jobs.length,
      pagination: failedJobs.pagination
    })
    
    // Test processing metrics
    const metrics = await fileProcessingJobService.getProcessingMetrics('1h')
    console.log('✅ Processing Metrics:', JSON.stringify(metrics, null, 2))
    
    return { success: true, activeJobs: activeJobs.jobs.length, failedJobs: failedJobs.jobs.length }
  } catch (error) {
    console.error('❌ Job Monitoring Test Failed:', error.message)
    return { success: false, error: error.message }
  }
}

/**
 * Test Queue Management Operations
 */
async function testQueueManagement() {
  console.log('\n🛠️ Testing Queue Management Operations...')
  
  try {
    // Test queue control (pause/resume)
    console.log('⏸️ Pausing queue...')
    const pauseResult = await fileProcessingJobService.controlQueue('pause')
    console.log('✅ Queue Paused:', pauseResult)
    
    setTimeout(async () => {
      console.log('▶️ Resuming queue...')
      const resumeResult = await fileProcessingJobService.controlQueue('resume')
      console.log('✅ Queue Resumed:', resumeResult)
    }, 1000)
    
    // Test cleanup operations (simulated)
    console.log('🧹 Testing cleanup simulation...')
    const cleanupResult = await fileProcessingJobService.cleanupJobs({
      olderThan: '1d',
      includeCompleted: true,
      includeFailed: false
    })
    console.log('✅ Cleanup Test:', cleanupResult)
    
    return { success: true, pauseResult, cleanupResult }
  } catch (error) {
    console.error('❌ Queue Management Test Failed:', error.message)
    return { success: false, error: error.message }
  }
}

/**
 * Test Redis Performance and Stress
 */
async function testRedisPerformance() {
  console.log('\n⚡ Testing Redis Performance...')
  
  try {
    const startTime = Date.now()
    const iterations = 100
    
    // Test bulk progress publishing
    const promises = []
    for (let i = 0; i < iterations; i++) {
      promises.push(
        redisManager.publishJobProgress(`perf-test-${i}`, i, 'testing', `Performance test ${i}`)
      )
    }
    
    await Promise.all(promises)
    const duration = Date.now() - startTime
    
    console.log(`✅ Published ${iterations} messages in ${duration}ms`)
    console.log(`✅ Average: ${(duration / iterations).toFixed(2)}ms per message`)
    
    return { success: true, iterations, duration, avgPerMessage: duration / iterations }
  } catch (error) {
    console.error('❌ Redis Performance Test Failed:', error.message)
    return { success: false, error: error.message }
  }
}

/**
 * Generate Test Report
 */
function generateTestReport(results) {
  console.log('\n📋 REDIS INTEGRATION TEST REPORT')
  console.log('=' .repeat(50))
  
  const reportData = {
    timestamp: new Date().toISOString(),
    testEnvironment: {
      nodeEnv: process.env.NODE_ENV,
      redisHost: process.env.REDIS_HOST,
      redisPort: process.env.REDIS_PORT
    },
    testResults: results,
    summary: {
      totalTests: Object.keys(results).length,
      passed: Object.values(results).filter(r => r.success).length,
      failed: Object.values(results).filter(r => !r.success).length
    }
  }
  
  console.log('Environment:', JSON.stringify(reportData.testEnvironment, null, 2))
  console.log('Summary:', JSON.stringify(reportData.summary, null, 2))
  
  // Show detailed results
  for (const [testName, result] of Object.entries(results)) {
    const status = result.success ? '✅ PASS' : '❌ FAIL'
    console.log(`${status} - ${testName}`)
    if (!result.success && result.error) {
      console.log(`   Error: ${result.error}`)
    }
  }
  
  return reportData
}

/**
 * Main Test Runner
 */
async function runRedisIntegrationTests() {
  console.log('🚀 Starting Redis Integration Tests...')
  console.log('Environment:', {
    redisHost: process.env.REDIS_HOST || 'localhost',
    redisPort: process.env.REDIS_PORT || 6379,
    nodeEnv: process.env.NODE_ENV || 'development'
  })
  
  const results = {}
  
  try {
    // Run all tests in sequence
    results.redisManager = await testRedisManager()
    results.jobQueue = await testJobQueue()
    results.jobMonitoring = await testJobMonitoring()
    results.queueManagement = await testQueueManagement()
    results.redisPerformance = await testRedisPerformance()
    
    // Wait for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    // Generate and save report
    const report = generateTestReport(results)
    
    // Save report to file
    const reportPath = path.join(__dirname, 'redis-test-report.json')
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2))
    console.log(`\n📄 Test report saved to: ${reportPath}`)
    
    return report
    
  } catch (error) {
    console.error('💥 Critical Test Failure:', error)
    return { error: error.message, results }
  } finally {
    // Graceful shutdown
    console.log('\n🔄 Shutting down Redis connections...')
    await redisManager.shutdown()
    console.log('✅ Redis Integration Tests Complete')
  }
}

// Run tests if script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runRedisIntegrationTests()
    .then(report => {
      const successRate = (report.summary?.passed / report.summary?.totalTests) * 100
      console.log(`\n🎯 Overall Success Rate: ${successRate.toFixed(1)}%`)
      process.exit(successRate === 100 ? 0 : 1)
    })
    .catch(error => {
      console.error('💥 Test runner failed:', error)
      process.exit(1)
    })
}

export { runRedisIntegrationTests }