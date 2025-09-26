/**
 * Test adding a job directly to the queue to see if processors are working
 */

import { workflowOrchestrator } from './api/src/lib/workflowOrchestrator.js'

async function testJobProcessing() {
  try {
    console.log('🧪 Testing job processing...')
    
    // Initialize the workflow orchestrator
    await workflowOrchestrator.initialize()
    
    console.log('📋 Queues after initialization:', Array.from(workflowOrchestrator.queues.keys()))
    
    // Create a simple test workflow
    const testWorkflowData = {
      uploadId: 'test-upload-123',
      fileName: 'test.csv',
      parsedContent: 'vendor,item,quantity,price\nTest Supplier,Test Item,1,10.00',
      merchantId: 'test-merchant',
      aiSettings: {
        confidenceThreshold: 0.8
      }
    }
    
    console.log('🚀 Starting test workflow...')
    const workflowId = await workflowOrchestrator.startWorkflow(testWorkflowData)
    console.log(`✅ Test workflow started: ${workflowId}`)
    
    // Wait a moment and check queue status
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    const aiParseQueue = workflowOrchestrator.queues.get('ai_parse')
    if (aiParseQueue) {
      const waiting = await aiParseQueue.getWaiting()
      const active = await aiParseQueue.getActive()
      const failed = await aiParseQueue.getFailed()
      const completed = await aiParseQueue.getCompleted()
      
      console.log('📊 AI Parse Queue Status:')
      console.log(`  - Waiting: ${waiting.length}`)
      console.log(`  - Active: ${active.length}`)
      console.log(`  - Failed: ${failed.length}`)
      console.log(`  - Completed: ${completed.length}`)
      
      if (waiting.length > 0) {
        console.log('📄 Waiting jobs:', waiting.map(job => ({
          id: job.id,
          workflowId: job.data.workflowId,
          attempts: job.attemptsMade
        })))
      }
      
      if (failed.length > 0) {
        console.log('❌ Failed jobs:', failed.map(job => ({
          id: job.id,
          workflowId: job.data.workflowId,
          error: job.failedReason
        })))
      }
      
      if (active.length > 0) {
        console.log('🔄 Active jobs:', active.map(job => ({
          id: job.id,
          workflowId: job.data.workflowId,
          progress: job.progress()
        })))
      }
      
      if (completed.length > 0) {
        console.log('✅ Completed jobs:', completed.map(job => ({
          id: job.id,
          workflowId: job.data.workflowId,
          result: job.returnvalue
        })))
      }
    } else {
      console.log('❌ AI parse queue not found')
    }
    
    // Check workflow status
    const workflowStatus = await workflowOrchestrator.getWorkflowStatus(workflowId)
    console.log('📋 Workflow Status:', JSON.stringify(workflowStatus, null, 2))
    
    console.log('✅ Job processing test completed')
    
  } catch (error) {
    console.error('❌ Job processing test failed:', error.message)
    console.error('Error stack:', error.stack)
  }
}

// Run the test
testJobProcessing().then(() => {
  process.exit(0)
})