/**
 * Test workflow orchestrator initialization directly
 */

import { workflowOrchestrator } from './api/src/lib/workflowOrchestrator.js'

async function testWorkflowInit() {
  try {
    console.log('🧪 Testing workflow orchestrator initialization...')
    
    console.log('📋 Before initialization:')
    console.log('  - isInitialized:', workflowOrchestrator.isInitialized)
    console.log('  - Available queues:', Array.from(workflowOrchestrator.queues.keys()))
    
    console.log('🚀 Calling initialize()...')
    await workflowOrchestrator.initialize()
    
    console.log('📋 After initialization:')
    console.log('  - isInitialized:', workflowOrchestrator.isInitialized)
    console.log('  - Available queues:', Array.from(workflowOrchestrator.queues.keys()))
    
    // Get statistics
    const stats = workflowOrchestrator.getStatistics()
    console.log('📊 Stats:', JSON.stringify(stats, null, 2))
    
    console.log('✅ Initialization test completed')
    
  } catch (error) {
    console.error('❌ Initialization test failed:', error.message)
    console.error('Error stack:', error.stack)
  }
}

// Run the test
testWorkflowInit()