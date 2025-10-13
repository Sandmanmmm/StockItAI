/**
 * Queue Administration Endpoints
 * Admin endpoints for queue management and cleanup
 */

import express from 'express'
import { processorRegistrationService } from '../lib/processorRegistrationService.js'

const router = express.Router()

/**
 * Clean failed jobs from all queues
 * GET /api/queue-admin/clean-failed
 */
router.get('/clean-failed', async (req, res) => {
  try {
    console.log('🧹 Starting failed jobs cleanup...')
    
    const queueNames = [
      'ai_parsing',
      'database_save',
      'product_draft_creation',
      'image_attachment',
      'shopify_sync',
      'status_update',
      'data_normalization',
      'merchant_config',
      'ai_enrichment',
      'shopify_payload',
      'background_image_processing'
    ]
    
    const results = []
    let totalCleaned = 0
    
    for (const queueName of queueNames) {
      try {
        // Get queue from registered processors
        const queue = processorRegistrationService.registeredProcessors.get(queueName)
        if (!queue) {
          console.warn(`⚠️ Queue not registered: ${queueName}`)
          results.push({ queue: queueName, error: 'Queue not registered' })
          continue
        }
        
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
      'ai_parsing',
      'database_save',
      'product_draft_creation',
      'image_attachment',
      'shopify_sync',
      'status_update',
      'data_normalization',
      'merchant_config',
      'ai_enrichment',
      'shopify_payload',
      'background_image_processing'
    ]
    
    const report = []
    
    for (const queueName of queueNames) {
      try {
        // Get queue from registered processors
        const queue = processorRegistrationService.registeredProcessors.get(queueName)
        if (!queue) {
          console.warn(`⚠️ Queue not registered: ${queueName}`)
          report.push({ queue: queueName, error: 'Queue not registered' })
          continue
        }
        
        const [counts, isPaused] = await Promise.all([
          queue.getJobCounts(),
          queue.isPaused()
        ])
        
        report.push({
          queue: queueName,
          paused: isPaused,
          ...counts
        })
        
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
