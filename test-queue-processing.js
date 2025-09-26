/**
 * Test queue processing to see why AI jobs aren't being processed
 */

import { workflowOrchestrator } from './api/src/lib/workflowOrchestrator.js'

async function testQueueProcessing() {
  try {
    console.log('🧪 Testing queue processing...')
    
    // Wait a moment for the orchestrator to initialize
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Get orchestrator statistics
    const stats = workflowOrchestrator.getStatistics()
    console.log('📊 Orchestrator Stats:', JSON.stringify(stats, null, 2))
    
    // Check if queues exist and are accessible
    const queueTypes = ['ai_parse', 'database_save', 'shopify_sync', 'status_update']
    
    for (const queueType of queueTypes) {
      const queue = workflowOrchestrator.queues.get(queueType)
      if (queue) {
        try {
          const waiting = await queue.getWaiting()
          const active = await queue.getActive()
          const failed = await queue.getFailed()
          const completed = await queue.getCompleted()
          
          console.log(`📋 Queue "${queueType}":`)
          console.log(`  - Waiting: ${waiting.length}`)
          console.log(`  - Active: ${active.length}`)
          console.log(`  - Failed: ${failed.length}`)
          console.log(`  - Completed: ${completed.length}`)
          
          if (waiting.length > 0) {
            console.log(`  - Waiting jobs:`, waiting.map(job => ({
              id: job.id,
              data: job.data.workflowId,
              createdAt: job.timestamp
            })))
          }
          
          if (failed.length > 0) {
            console.log(`  - Failed jobs:`, failed.map(job => ({
              id: job.id,
              error: job.failedReason,
              data: job.data.workflowId
            })))
          }
        } catch (queueError) {
          console.log(`❌ Error accessing queue "${queueType}":`, queueError.message)
        }
      } else {
        console.log(`❌ Queue "${queueType}" not found`)
        console.log(`Available queues:`, Array.from(workflowOrchestrator.queues.keys()))
      }
    }
    
    console.log('✅ Queue test completed')
    
  } catch (error) {
    console.error('❌ Queue test failed:', error.message)
    console.error('Error stack:', error.stack)
  }
}

// Run the test
testQueueProcessing()