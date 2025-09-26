/**
 * Check Queue Status for PDF Processing Debug
 */

import redisManager from './api/src/lib/redisManager.js'
import { processorRegistrationService } from './api/src/lib/processorRegistrationService.js'

async function checkQueueStatus() {
  console.log('🔍 Checking queue status for PDF processing debug...\n')

  try {
    await redisManager.initializeConnections()
    
    console.log('📊 Queue Status:')
    const queueNames = ['ai-parsing', 'database-save', 'shopify-sync', 'status-update']
    
    for (const queueName of queueNames) {
      try {
        const queue = processorRegistrationService.queues.get(queueName)
        if (queue) {
          const waiting = await queue.getWaiting()
          const active = await queue.getActive()
          const completed = await queue.getCompleted()
          const failed = await queue.getFailed()
          
          console.log(`\n📋 ${queueName.toUpperCase()} Queue:`)
          console.log(`   Waiting: ${waiting.length}`)
          console.log(`   Active: ${active.length}`)
          console.log(`   Completed: ${completed.length}`)
          console.log(`   Failed: ${failed.length}`)
          
          if (active.length > 0) {
            console.log('   🔄 Active Jobs:')
            active.forEach((job, i) => {
              console.log(`     ${i + 1}. Job ${job.id} - Progress: ${job.progress()}%`)
              console.log(`        Data: ${JSON.stringify(job.data, null, 2)}`)
            })
          }
          
          if (failed.length > 0) {
            console.log('   ❌ Failed Jobs:')
            const recentFailed = failed.slice(-3) // Last 3 failed jobs
            for (const job of recentFailed) {
              console.log(`     Job ${job.id}: ${job.failedReason}`)
              console.log(`     Data: ${JSON.stringify(job.data, null, 2)}`)
            }
          }
        } else {
          console.log(`\n❌ ${queueName} queue not found`)
        }
      } catch (queueError) {
        console.log(`\n❌ Error checking ${queueName} queue:`, queueError.message)
      }
    }

    // Check workflow metadata in Redis
    console.log('\n🎭 Checking workflow metadata...')
    const workflowKeys = await redisManager.redis.keys('workflow:*')
    console.log(`Found ${workflowKeys.length} workflows in Redis`)
    
    if (workflowKeys.length > 0) {
      // Get the most recent workflow (assuming it's our PDF test)
      const recentWorkflowKey = workflowKeys[workflowKeys.length - 1]
      const workflowData = await redisManager.redis.get(recentWorkflowKey)
      
      if (workflowData) {
        const metadata = JSON.parse(workflowData)
        console.log(`\n📊 Workflow ${recentWorkflowKey}:`)
        console.log(`   Status: ${metadata.status}`)
        console.log(`   Progress: ${metadata.progress}%`)
        console.log(`   Current Stage: ${metadata.currentStage}`)
        
        if (metadata.stages) {
          console.log('   📋 Stage Details:')
          Object.entries(metadata.stages).forEach(([stage, details]) => {
            console.log(`     ${stage}: ${details.status}`)
          })
        }
        
        if (metadata.error) {
          console.log('   ❌ Error:', metadata.error)
        }
        
        if (metadata.data) {
          console.log('   📄 Data keys:', Object.keys(metadata.data))
          console.log(`   📁 File: ${metadata.data.fileName}`)
          console.log(`   📄 MIME: ${metadata.data.mimeType}`)
        }
      }
    }

  } catch (error) {
    console.error('❌ Queue status check failed:', error)
  } finally {
    try {
      process.exit(0)
    } catch (cleanup) {
      console.error('Cleanup error:', cleanup)
    }
  }
}

// Run the check
checkQueueStatus()