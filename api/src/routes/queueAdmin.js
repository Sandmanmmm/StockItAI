/**
 * Queue Administration Endpoints
 * Admin endpoints for queue management and cleanup
 */

import express from 'express'
import Bull from 'bull'
import { getRedisConfig } from '../config/redis.production.js'

const router = express.Router()

/**
 * Get Redis options for Bull queues
 */
function getRedisOptions() {
  const config = getRedisConfig()
  
  // Handle both URL-based (Upstash) and host/port configurations
  if (typeof config.connection === 'string') {
    // Redis URL (Upstash)
    return config.connection
  }
  
  // Legacy host/port configuration
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

/**
 * Clean failed jobs from all queues
 * GET /api/queue-admin/clean-failed
 */
router.get('/clean-failed', async (req, res) => {
  try {
    console.log('🧹 Starting failed jobs cleanup...')
    
    const queueNames = [
      'ai-parsing',
      'database-save',
      'product-draft-creation',
      'image-attachment',
      'shopify-sync',
      'status-update',
      'data-normalization',
      'merchant-config',
      'ai-enrichment',
      'shopify-payload',
      'background-image-processing'
    ]
    
    const redisOptions = getRedisOptions()
    const results = []
    let totalCleaned = 0
    
    for (const queueName of queueNames) {
      try {
        // Create Bull queue instance directly
        const queue = new Bull(queueName, { redis: redisOptions })
        
        const failedJobs = await queue.getFailed()
        console.log(`🔍 ${queueName}: ${failedJobs.length} failed jobs`)
        
        let cleanedCount = 0
        for (const job of failedJobs) {
          await job.remove()
          cleanedCount++
        }
        
        console.log(`✅ Cleaned ${cleanedCount} failed jobs from ${queueName}`)
        results.push({ 
          queue: queueName, 
          cleaned: cleanedCount 
        })
        totalCleaned += cleanedCount
        
        // Close queue connection
        await queue.close()
        
      } catch (error) {
        console.error(`❌ Error cleaning ${queueName}:`, error.message)
        results.push({ 
          queue: queueName, 
          error: error.message 
        })
      }
    }
    
    console.log(`✅ Total cleaned: ${totalCleaned} failed jobs`)
    
    res.json({
      success: true,
      message: `Cleaned ${totalCleaned} failed jobs`,
      totalCleaned,
      details: results
    })
    
  } catch (error) {
    console.error('❌ Failed to cleanup failed jobs:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup failed jobs',
      message: error.message
    })
  }
})

/**
 * Get queue status for all queues
 * GET /api/queue-admin/status
 */
router.get('/status', async (req, res) => {
  try {
    console.log('📊 Fetching queue status...')
    
    const queueNames = [
      'ai-parsing',
      'database-save',
      'product-draft-creation',
      'image-attachment',
      'shopify-sync',
      'status-update',
      'data-normalization',
      'merchant-config',
      'ai-enrichment',
      'shopify-payload',
      'background-image-processing'
    ]
    
    const redisOptions = getRedisOptions()
    const report = []
    
    for (const queueName of queueNames) {
      try {
        // Create Bull queue instance directly
        const queue = new Bull(queueName, { redis: redisOptions })
        
        const [counts, isPaused] = await Promise.all([
          queue.getJobCounts(),
          queue.isPaused()
        ])
        
        report.push({
          queue: queueName,
          paused: isPaused,
          ...counts
        })
        
        // Close queue connection
        await queue.close()
        
      } catch (error) {
        console.error(`❌ Error checking ${queueName}:`, error.message)
        report.push({ 
          queue: queueName, 
          error: error.message 
        })
      }
    }
    
    res.json({
      success: true,
      queues: report
    })
    
  } catch (error) {
    console.error('❌ Failed to get queue status:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get queue status',
      message: error.message
    })
  }
})

export default router
