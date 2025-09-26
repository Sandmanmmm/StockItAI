/**
 * Step-by-step workflow initialization test
 */

console.log('🔍 Starting step-by-step workflow test...')

async function testStepByStep() {
  try {
    console.log('Step 1: Testing WorkflowOrchestrator import...')
    const { workflowOrchestrator } = await import('./src/lib/workflowOrchestrator.js')
    console.log('✅ WorkflowOrchestrator imported')
    
    console.log('Step 2: Testing WorkflowOrchestrator initialization...')
    await workflowOrchestrator.initialize()
    console.log('✅ WorkflowOrchestrator initialized')
    
    console.log('Step 3: Testing WorkflowIntegration import...')
    const { workflowIntegration } = await import('./src/lib/workflowIntegration.js')
    console.log('✅ WorkflowIntegration imported')
    
    console.log('Step 4: Testing WorkflowIntegration initialization...')
    await workflowIntegration.initialize()
    console.log('✅ WorkflowIntegration initialized')
    
    console.log('🎉 All steps completed successfully!')
    process.exit(0)
    
  } catch (error) {
    console.error('❌ Step failed:', error)
    process.exit(1)
  }
}

// Add timeout
setTimeout(() => {
  console.error('⏰ Test timed out after 30 seconds')
  process.exit(1)
}, 30000)

testStepByStep()