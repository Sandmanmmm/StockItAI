/**
 * Analyze Failed Jobs in Bull Queues
 * 
 * This script connects to Redis and analyzes failed jobs to identify:
 * - Common error patterns
 * - Which stages are failing most
 * - Whether failures are pre or post Redis fix
 * - Root causes of failures
 */

import { createClient } from 'redis'
import dotenv from 'dotenv'

dotenv.config()

const redisClient = createClient({
  url: process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL,
  socket: {
    tls: true,
    reconnectStrategy: (retries) => Math.min(retries * 50, 500)
  }
})

const QUEUE_NAMES = [
  'ai-parsing',
  'database-save',
  'product-draft-creation',
  'image-attachment',
  'shopify-sync',
  'background-image-processing'
]

async function analyzeFailedJobs() {
  try {
    await redisClient.connect()
    console.log('\n🔍 Connected to Redis - Analyzing Failed Jobs\n')
    console.log('=' .repeat(80))
    
    const analysis = {
      totalFailed: 0,
      byQueue: {},
      errorPatterns: {},
      timestamps: []
    }
    
    for (const queueName of QUEUE_NAMES) {
      console.log(`\n📊 Analyzing queue: ${queueName}`)
      console.log('-'.repeat(80))
      
      // Get failed job IDs
      const failedKey = `bull:${queueName}:failed`
      const failedIds = await redisClient.smembers(failedKey)
      
      if (failedIds.length === 0) {
        console.log(`✅ No failed jobs in ${queueName}`)
        continue
      }
      
      console.log(`❌ Found ${failedIds.length} failed jobs`)
      analysis.totalFailed += failedIds.length
      analysis.byQueue[queueName] = {
        count: failedIds.length,
        errors: [],
        jobs: []
      }
      
      // Analyze first 10 failed jobs in detail
      const jobsToAnalyze = failedIds.slice(0, 10)
      console.log(`   Analyzing ${jobsToAnalyze.length} recent failures in detail...\n`)
      
      for (const jobId of jobsToAnalyze) {
        const jobKey = `bull:${queueName}:${jobId}`
        const jobData = await redisClient.get(jobKey)
        
        if (!jobData) {
          console.log(`   ⚠️ Job ${jobId} not found in Redis`)
          continue
        }
        
        try {
          const job = JSON.parse(jobData)
          
          // Extract key information
          const errorMessage = job.failedReason || job.stacktrace?.[0] || 'Unknown error'
          const timestamp = job.processedOn || job.timestamp
          const attemptsMade = job.attemptsMade || 0
          const workflowId = job.data?.workflowId || 'unknown'
          const poId = job.data?.data?.purchaseOrderId || job.data?.purchaseOrderId || 'unknown'
          
          // Store error pattern
          const errorType = categorizeError(errorMessage)
          analysis.errorPatterns[errorType] = (analysis.errorPatterns[errorType] || 0) + 1
          
          if (timestamp) {
            analysis.timestamps.push(timestamp)
          }
          
          // Add to queue analysis
          analysis.byQueue[queueName].errors.push(errorType)
          analysis.byQueue[queueName].jobs.push({
            jobId,
            workflowId,
            poId,
            error: errorMessage.substring(0, 100),
            attempts: attemptsMade,
            timestamp: timestamp ? new Date(timestamp).toISOString() : 'unknown'
          })
          
          console.log(`   Job ${jobId}:`)
          console.log(`      Workflow: ${workflowId}`)
          console.log(`      PO: ${poId}`)
          console.log(`      Error Type: ${errorType}`)
          console.log(`      Attempts: ${attemptsMade}`)
          console.log(`      Time: ${timestamp ? new Date(timestamp).toISOString() : 'unknown'}`)
          console.log(`      Error: ${errorMessage.substring(0, 150)}${errorMessage.length > 150 ? '...' : ''}`)
          console.log('')
          
        } catch (parseError) {
          console.log(`   ⚠️ Failed to parse job ${jobId}: ${parseError.message}`)
        }
      }
      
      if (failedIds.length > 10) {
        console.log(`   ... and ${failedIds.length - 10} more failed jobs\n`)
      }
    }
    
    // Print summary
    console.log('\n' + '='.repeat(80))
    console.log('📊 SUMMARY')
    console.log('='.repeat(80))
    console.log(`\nTotal Failed Jobs: ${analysis.totalFailed}`)
    
    console.log('\n📋 Failed Jobs by Queue:')
    Object.entries(analysis.byQueue)
      .sort((a, b) => b[1].count - a[1].count)
      .forEach(([queue, data]) => {
        console.log(`   ${queue.padEnd(30)} ${data.count} failures`)
      })
    
    console.log('\n🔍 Error Patterns:')
    Object.entries(analysis.errorPatterns)
      .sort((a, b) => b[1] - a[1])
      .forEach(([error, count]) => {
        const percentage = ((count / analysis.totalFailed) * 100).toFixed(1)
        console.log(`   ${error.padEnd(40)} ${count} (${percentage}%)`)
      })
    
    // Analyze timestamps
    if (analysis.timestamps.length > 0) {
      const sortedTimes = analysis.timestamps.sort()
      const oldest = new Date(sortedTimes[0])
      const newest = new Date(sortedTimes[sortedTimes.length - 1])
      const redisFix = new Date('2025-10-13T18:00:00Z') // Approximate Redis fix deployment time
      
      const preRedisFix = analysis.timestamps.filter(t => new Date(t) < redisFix).length
      const postRedisFix = analysis.timestamps.filter(t => new Date(t) >= redisFix).length
      
      console.log('\n⏰ Timeline:')
      console.log(`   Oldest failure: ${oldest.toISOString()}`)
      console.log(`   Newest failure: ${newest.toISOString()}`)
      console.log(`   Time span: ${Math.round((newest - oldest) / 1000 / 60)} minutes`)
      console.log(`   Redis fix deployed: ${redisFix.toISOString()}`)
      console.log(`   Pre-Redis fix failures: ${preRedisFix}`)
      console.log(`   Post-Redis fix failures: ${postRedisFix}`)
    }
    
    console.log('\n' + '='.repeat(80))
    console.log('💡 RECOMMENDATIONS')
    console.log('='.repeat(80))
    
    // Generate recommendations based on patterns
    const recommendations = generateRecommendations(analysis)
    recommendations.forEach((rec, i) => {
      console.log(`\n${i + 1}. ${rec}`)
    })
    
    console.log('\n')
    
  } catch (error) {
    console.error('❌ Error analyzing failed jobs:', error)
  } finally {
    await redisClient.quit()
  }
}

/**
 * Categorize error messages into common patterns
 */
function categorizeError(errorMessage) {
  const msg = errorMessage.toLowerCase()
  
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'Timeout'
  }
  if (msg.includes('econnrefused') || msg.includes('connect refused')) {
    return 'Redis Connection Refused'
  }
  if (msg.includes('redis') && msg.includes('error')) {
    return 'Redis Error'
  }
  if (msg.includes('openai') || msg.includes('api')) {
    return 'OpenAI API Error'
  }
  if (msg.includes('database') || msg.includes('prisma') || msg.includes('transaction')) {
    return 'Database Error'
  }
  if (msg.includes('file') && msg.includes('not found')) {
    return 'File Not Found'
  }
  if (msg.includes('parse') || msg.includes('parsing')) {
    return 'Parsing Error'
  }
  if (msg.includes('stalled') || msg.includes('lock')) {
    return 'Job Stalled/Lock'
  }
  if (msg.includes('empty') || msg.includes('no data') || msg.includes('no content')) {
    return 'No Content/Empty Result'
  }
  if (msg.includes('validation') || msg.includes('invalid')) {
    return 'Validation Error'
  }
  if (msg.includes('shopify')) {
    return 'Shopify API Error'
  }
  if (msg.includes('unauthorized') || msg.includes('authentication')) {
    return 'Authentication Error'
  }
  
  return 'Other/Unknown'
}

/**
 * Generate actionable recommendations based on failure patterns
 */
function generateRecommendations(analysis) {
  const recommendations = []
  
  // Check for Redis connection issues
  const redisErrors = (analysis.errorPatterns['Redis Connection Refused'] || 0) + 
                      (analysis.errorPatterns['Redis Error'] || 0)
  if (redisErrors > 0) {
    recommendations.push(
      `🔴 **Redis Connection Issues (${redisErrors} failures)**\n` +
      `   - Most failures are likely from BEFORE the Redis Upstash fix (commit 78c5e48)\n` +
      `   - Action: These should stop occurring now that REDIS_URL is configured\n` +
      `   - Verify: Check Vercel logs for "Using REDIS_URL for Upstash connection"\n` +
      `   - Clean up: Run 'node api/manage-queues.js clean' to remove old failed jobs`
    )
  }
  
  // Check for timeout issues
  const timeouts = analysis.errorPatterns['Timeout'] || 0
  if (timeouts > 5) {
    recommendations.push(
      `⏱️ **High Timeout Rate (${timeouts} failures)**\n` +
      `   - Likely OpenAI API taking longer than 25s timeout\n` +
      `   - Action: Review OpenAI timeout settings in enhancedAIService.js\n` +
      `   - Consider: Implementing chunking for large documents\n` +
      `   - Monitor: Check if timeouts occur on specific file types`
    )
  }
  
  // Check for database errors
  const dbErrors = analysis.errorPatterns['Database Error'] || 0
  if (dbErrors > 5) {
    recommendations.push(
      `💾 **Database Errors (${dbErrors} failures)**\n` +
      `   - Could be connection pool exhaustion or lock timeouts\n` +
      `   - Action: Check Prisma connection pool settings\n` +
      `   - Review: databasePersistenceService.js retry logic\n` +
      `   - Monitor: Check if errors occur during high load`
    )
  }
  
  // Check for stalled jobs
  const stalledJobs = analysis.errorPatterns['Job Stalled/Lock'] || 0
  if (stalledJobs > 3) {
    recommendations.push(
      `🔒 **Job Stalling (${stalledJobs} failures)**\n` +
      `   - Jobs are taking longer than stalledInterval (30s)\n` +
      `   - Action: Review Bull queue settings in processorRegistrationService.js\n` +
      `   - Consider: Increasing stalledInterval for AI parsing jobs\n` +
      `   - Check: PO locking mechanism for deadlocks`
    )
  }
  
  // Check for OpenAI API errors
  const openaiErrors = analysis.errorPatterns['OpenAI API Error'] || 0
  if (openaiErrors > 3) {
    recommendations.push(
      `🤖 **OpenAI API Errors (${openaiErrors} failures)**\n` +
      `   - Could be rate limits, invalid requests, or API downtime\n` +
      `   - Action: Check OpenAI API status and rate limits\n` +
      `   - Review: Error logs for specific OpenAI error codes\n` +
      `   - Consider: Implementing exponential backoff for API calls`
    )
  }
  
  // Overall recommendation
  if (analysis.totalFailed > 20) {
    recommendations.push(
      `🧹 **Clean Up Failed Jobs**\n` +
      `   - ${analysis.totalFailed} failed jobs are cluttering the queues\n` +
      `   - Most are likely from pre-Redis-fix deployments\n` +
      `   - Action: Run 'node api/manage-queues.js clean' to clear failed jobs\n` +
      `   - Then: Monitor new uploads to see if failures continue`
    )
  }
  
  if (recommendations.length === 0) {
    recommendations.push(
      `✅ **No Critical Issues Detected**\n` +
      `   - Failure patterns are within normal operating range\n` +
      `   - Continue monitoring for new failures\n` +
      `   - Consider cleaning up old failed jobs for better visibility`
    )
  }
  
  return recommendations
}

// Run analysis
analyzeFailedJobs()
