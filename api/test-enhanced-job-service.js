/**
 * Test Enhanced Job Service with Dead Letter Queue
 * Verify the production-ready job queue functionality
 */

import { enhancedJobService } from './src/lib/enhancedJobService.js'

async function testEnhancedJobService() {
  console.log('🧪 Testing Enhanced Job Service with Dead Letter Queue...')
  
  try {
    // Wait for service initialization
    console.log('⏳ Waiting for job service to initialize...')
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    if (!enhancedJobService.isInitialized) {
      console.log('❌ Job service not initialized')
      return
    }
    
    console.log('✅ Job service initialized successfully')
    
    // Test 1: Add a normal job
    console.log('\n📝 Test 1: Adding normal job...')
    const normalJob = await enhancedJobService.addJob('process-file', {
      filePath: '/test/sample.pdf',
      fileContent: 'test content',
      options: { priority: 'high' }
    }, {
      priority: 'high',
      attempts: 3
    })
    console.log(`✅ Normal job added: ${normalJob.id}`)
    
    // Test 2: Add a job that will fail (to test dead letter queue)
    console.log('\n💥 Test 2: Adding job that will fail...')
    const failingJob = await enhancedJobService.addJob('process-file', {
      filePath: '/test/will-fail.pdf',
      fileContent: null, // This should cause failure
      options: { simulateFailure: true }
    }, {
      priority: 'normal',
      attempts: 2 // Limited attempts to fail quickly
    })
    console.log(`✅ Failing job added: ${failingJob.id}`)
    
    // Test 3: Get queue statistics
    console.log('\n📊 Test 3: Getting queue statistics...')
    const stats = await enhancedJobService.getQueueStats()
    console.log('Queue Stats:', {
      mainQueue: stats.mainQueue,
      deadLetterEnabled: !!stats.deadLetterQueue,
      health: stats.health
    })
    
    // Wait for job processing
    console.log('\n⏳ Waiting for job processing...')
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // Test 4: Check dead letter queue
    if (enhancedJobService.deadLetterQueue) {
      console.log('\n💀 Test 4: Checking dead letter queue...')
      const deadLetterJobs = await enhancedJobService.getDeadLetterJobs('waiting', 10)
      console.log(`Dead letter jobs found: ${deadLetterJobs.length}`)
      
      if (deadLetterJobs.length > 0) {
        console.log('Sample dead letter job:', deadLetterJobs[0])
        
        // Test 5: Reprocess a dead letter job
        console.log('\n🔄 Test 5: Reprocessing dead letter job...')
        try {
          const reprocessedJob = await enhancedJobService.reprocessDeadLetterJob(
            deadLetterJobs[0].id,
            'Reprocessed for testing'
          )
          console.log(`✅ Job reprocessed: ${reprocessedJob.id}`)
        } catch (reprocessError) {
          console.log('⚠️  Reprocess test failed:', reprocessError.message)
        }
      }
    } else {
      console.log('⚠️  Dead letter queue not configured')
    }
    
    // Test 6: Final statistics
    console.log('\n📈 Test 6: Final statistics...')
    const finalStats = await enhancedJobService.getQueueStats()
    console.log('Final Queue Stats:', {
      mainQueue: finalStats.mainQueue,
      lifetime: finalStats.lifetime,
      health: finalStats.health
    })
    
    console.log('\n🎉 Enhanced Job Service test completed!')
    
  } catch (error) {
    console.error('❌ Test failed:', error)
    console.error('Stack trace:', error.stack)
  }
  
  // Graceful shutdown
  try {
    await enhancedJobService.shutdown()
    console.log('✅ Job service shut down gracefully')
  } catch (shutdownError) {
    console.error('⚠️  Shutdown error:', shutdownError)
  }
}

// Run the test
testEnhancedJobService().catch(console.error)