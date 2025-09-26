/**
 * Minimal Workflow Test - Just test the workflow without file processing
 */

console.log('🚀 Starting Minimal Workflow Test')
console.log('=====================================')

async function runMinimalWorkflowTest() {
  let workflowId = null
  
  try {
    // Step 1: Initialize the workflow system
    console.log('\n1️⃣ Initializing Workflow System...')
    const { workflowIntegration } = await import('./src/lib/workflowIntegration.js')
    await workflowIntegration.initialize()
    console.log('✅ Workflow system initialized')
    
    // Step 2: Test orchestrator statistics
    console.log('\n2️⃣ Testing Orchestrator Statistics...')
    const { workflowOrchestrator } = await import('./src/lib/workflowOrchestrator.js')
    const initialStats = workflowOrchestrator.getStatistics()
    console.log('📊 Initial Statistics:', JSON.stringify(initialStats, null, 2))
    
    // Step 3: Test Redis connectivity via orchestrator
    console.log('\n3️⃣ Testing Redis Connectivity...')
    const redisManager = workflowOrchestrator.redisManager
    const testKey = 'workflow-test-key'
    const testValue = JSON.stringify({ test: true, timestamp: Date.now() })
    
    await redisManager.set(testKey, testValue, 60)
    const retrievedValue = await redisManager.get(testKey)
    
    if (retrievedValue !== testValue) {
      throw new Error('Redis connectivity test failed: Value mismatch')
    }
    
    await redisManager.del(testKey)
    console.log('✅ Redis connectivity confirmed')
    
    // Step 4: Create minimal workflow data (no file processing)
    console.log('\n4️⃣ Creating Minimal Test Data...')
    const minimalWorkflowData = {
      uploadId: `upload_${Date.now()}_test`,
      fileName: 'test-po.pdf',
      originalFileName: 'test-po.pdf', 
      fileSize: 1024,
      mimeType: 'application/pdf',
      merchantId: 'test-merchant-123',
      supplierId: 'test-supplier-456',
      buffer: Buffer.from('test file content', 'utf8'),
      aiSettings: {
        confidenceThreshold: 0.8,
        strictMatching: true
      }
    }
    console.log('✅ Test data prepared')
    
    // Step 5: Start workflow 
    console.log('\n5️⃣ Starting Workflow...')
    workflowId = await workflowOrchestrator.startWorkflow(minimalWorkflowData)
    console.log('🚀 Workflow started:', workflowId)
    
    // Step 6: Check workflow status
    console.log('\n6️⃣ Checking Workflow Status...')
    const workflowStatus = await workflowOrchestrator.getWorkflowStatus(workflowId)
    console.log('📊 Workflow Status:', JSON.stringify(workflowStatus, null, 2))
    
    // Step 7: Final statistics
    console.log('\n7️⃣ Final Statistics...')
    const finalStats = workflowOrchestrator.getStatistics()
    console.log('📊 Final Statistics:', JSON.stringify(finalStats, null, 2))
    
    console.log('\n🎉 Minimal Workflow Test COMPLETED SUCCESSFULLY!')
    
  } catch (error) {
    console.error('\n❌ Minimal Workflow Test FAILED:', error)
    throw error
  }
}

// Add timeout
setTimeout(() => {
  console.error('⏰ Test timed out after 30 seconds')
  process.exit(1)
}, 30000)

runMinimalWorkflowTest()
  .then(() => {
    console.log('✅ Test completed, exiting...')
    process.exit(0)
  })
  .catch((error) => {
    console.error('💥 Test failed:', error)
    process.exit(1)
  })