/**
 * Simple Workflow Test to isolate the hanging issue
 */

console.log('🔍 Starting simple workflow test...')

async function testWorkflowStep() {
  try {
    console.log('Step 1: Testing imports...')
    
    const { redisManager } = await import('./src/lib/redisManager.js')
    console.log('✅ RedisManager imported')
    
    const { workflowOrchestrator } = await import('./src/lib/workflowOrchestrator.js')
    console.log('✅ WorkflowOrchestrator imported')
    
    console.log('Step 2: Testing Redis connection...')
    await redisManager.waitForConnection(10000)
    console.log('✅ Redis connected')
    
    console.log('Step 3: Testing workflow orchestrator initialization...')
    await workflowOrchestrator.initialize()
    console.log('✅ Workflow orchestrator initialized')
    
    console.log('Step 4: Getting statistics...')
    const stats = workflowOrchestrator.getStatistics()
    console.log('📊 Stats:', JSON.stringify(stats, null, 2))
    
    console.log('🎉 Simple test completed successfully!')
    process.exit(0)
    
  } catch (error) {
    console.error('❌ Simple test failed:', error)
    process.exit(1)
  }
}

// Add timeout to prevent hanging
setTimeout(() => {
  console.error('⏰ Test timed out after 30 seconds')
  process.exit(1)
}, 30000)

testWorkflowStep()