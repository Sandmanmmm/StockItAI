/**
 * Queue Management Utility
 * Pause/resume workflow queues and drain jobs
 */

import Bull from 'bull'
import { getRedisConfig } from './src/config/redis.production.js'

// Queue names from processor registration
const QUEUE_NAMES = [
  'ai-parsing',
  'database-save',
  'product-draft-creation',
  'image-attachment',
  'shopify-sync',
  'status-update',
  'data-normalization',
  'merchant-config',
  'ai-enrichment',
  'shopify-payload'
]

function getRedisOptions() {
  const config = getRedisConfig()
  
  return {
    host: config.connection.host,
    port: config.connection.port,
    password: config.connection.password,
    db: config.connection.db,
    tls: config.connection.tls,
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  }
}

async function pauseAllQueues() {
  console.log('⏸️  Pausing all workflow queues...\n')
  
  const redisOptions = getRedisOptions()
  const results = []
  
  for (const queueName of QUEUE_NAMES) {
    try {
      const queue = new Bull(queueName, { redis: redisOptions })
      await queue.pause()
      
      const counts = await queue.getJobCounts()
      console.log(`✅ Paused: ${queueName}`)
      console.log(`   - Waiting: ${counts.waiting}`)
      console.log(`   - Active: ${counts.active}`)
      console.log(`   - Failed: ${counts.failed}`)
      console.log(`   - Delayed: ${counts.delayed}\n`)
      
      results.push({ queue: queueName, status: 'paused', counts })
      
      await queue.close()
    } catch (error) {
      console.error(`❌ Error pausing ${queueName}:`, error.message)
      results.push({ queue: queueName, status: 'error', error: error.message })
    }
  }
  
  return results
}

async function resumeAllQueues() {
  console.log('▶️  Resuming all workflow queues...\n')
  
  const redisOptions = getRedisOptions()
  const results = []
  
  for (const queueName of QUEUE_NAMES) {
    try {
      const queue = new Bull(queueName, { redis: redisOptions })
      await queue.resume()
      
      const counts = await queue.getJobCounts()
      console.log(`✅ Resumed: ${queueName}`)
      console.log(`   - Waiting: ${counts.waiting}`)
      console.log(`   - Active: ${counts.active}\n`)
      
      results.push({ queue: queueName, status: 'resumed', counts })
      
      await queue.close()
    } catch (error) {
      console.error(`❌ Error resuming ${queueName}:`, error.message)
      results.push({ queue: queueName, status: 'error', error: error.message })
    }
  }
  
  return results
}

async function cleanFailedJobs() {
  console.log('🧹 Cleaning failed jobs from all queues...\n')
  
  const redisOptions = getRedisOptions()
  const results = []
  
  for (const queueName of QUEUE_NAMES) {
    try {
      const queue = new Bull(queueName, { redis: redisOptions })
      
      const failedJobs = await queue.getFailed()
      console.log(`🔍 ${queueName}: ${failedJobs.length} failed jobs`)
      
      let cleanedCount = 0
      for (const job of failedJobs) {
        await job.remove()
        cleanedCount++
      }
      
      console.log(`✅ Cleaned ${cleanedCount} failed jobs from ${queueName}\n`)
      results.push({ queue: queueName, cleaned: cleanedCount })
      
      await queue.close()
    } catch (error) {
      console.error(`❌ Error cleaning ${queueName}:`, error.message)
      results.push({ queue: queueName, error: error.message })
    }
  }
  
  return results
}

async function getQueueStatus() {
  console.log('📊 Queue Status Report\n')
  console.log('='.repeat(60))
  
  const redisOptions = getRedisOptions()
  const report = []
  
  for (const queueName of QUEUE_NAMES) {
    try {
      const queue = new Bull(queueName, { redis: redisOptions })
      
      const [counts, isPaused] = await Promise.all([
        queue.getJobCounts(),
        queue.isPaused()
      ])
      
      console.log(`\n📋 ${queueName}`)
      console.log(`   Status: ${isPaused ? '⏸️  PAUSED' : '▶️  RUNNING'}`)
      console.log(`   Waiting: ${counts.waiting}`)
      console.log(`   Active: ${counts.active}`)
      console.log(`   Completed: ${counts.completed}`)
      console.log(`   Failed: ${counts.failed}`)
      console.log(`   Delayed: ${counts.delayed}`)
      
      report.push({
        queue: queueName,
        paused: isPaused,
        ...counts
      })
      
      await queue.close()
    } catch (error) {
      console.error(`❌ Error checking ${queueName}:`, error.message)
      report.push({ queue: queueName, error: error.message })
    }
  }
  
  console.log('\n' + '='.repeat(60))
  return report
}

// CLI Handler
const command = process.argv[2]

async function main() {
  try {
    switch (command) {
      case 'pause':
        await pauseAllQueues()
        break
      case 'resume':
        await resumeAllQueues()
        break
      case 'clean':
        await cleanFailedJobs()
        break
      case 'status':
        await getQueueStatus()
        break
      default:
        console.log('Queue Management Utility\n')
        console.log('Usage: node manage-queues.js <command>')
        console.log('\nCommands:')
        console.log('  status  - Show status of all queues')
        console.log('  pause   - Pause all queues (stop processing)')
        console.log('  resume  - Resume all queues')
        console.log('  clean   - Remove all failed jobs')
        console.log('\nExample:')
        console.log('  node api/manage-queues.js pause')
        process.exit(1)
    }
    
    console.log('\n✅ Command completed successfully')
    process.exit(0)
  } catch (error) {
    console.error('\n❌ Command failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

main()
