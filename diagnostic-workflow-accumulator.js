#!/usr/bin/env node

/**
 * Diagnostic Test: Workflow Data Accumulator Components
 * 
 * Quick diagnostic test to identify what's causing the hang
 */

console.log('🔍 Starting Workflow Data Accumulator Diagnostic...')

try {
  console.log('📦 Step 1: Testing imports...')
  
  // Test basic imports
  const { stageResultStore } = await import('./api/src/lib/stageResultStore.js')
  console.log('✅ StageResultStore imported successfully')
  
  const { workflowOrchestrator } = await import('./api/src/lib/workflowOrchestrator.js')
  console.log('✅ WorkflowOrchestrator imported successfully')
  
  console.log('📦 Step 2: Testing StageResultStore initialization...')
  
  // Test stageResultStore initialization only
  try {
    await stageResultStore.initialize()
    console.log('✅ StageResultStore initialized successfully')
  } catch (storeError) {
    console.error('❌ StageResultStore initialization failed:', storeError.message)
  }
  
  console.log('📦 Step 3: Testing basic StageResultStore operations...')
  
  // Test basic operations
  const testWorkflowId = `diagnostic-${Date.now()}`
  const testData = {
    test: 'data',
    timestamp: new Date().toISOString()
  }
  
  try {
    await stageResultStore.saveStageResult(testWorkflowId, 'test_stage', testData)
    console.log('✅ Stage result save operation successful')
    
    const retrieved = await stageResultStore.getStageResult(testWorkflowId, 'test_stage')
    console.log('✅ Stage result retrieve operation successful:', !!retrieved)
    
    await stageResultStore.clearWorkflowResults(testWorkflowId)
    console.log('✅ Stage result cleanup operation successful')
  } catch (operationError) {
    console.error('❌ StageResultStore operation failed:', operationError.message)
  }
  
  console.log('📦 Step 4: Testing WorkflowOrchestrator initialization (potential hang point)...')
  
  // Test orchestrator initialization with timeout
  const initPromise = workflowOrchestrator.initialize()
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Initialization timeout after 30 seconds')), 30000)
  })
  
  try {
    await Promise.race([initPromise, timeoutPromise])
    console.log('✅ WorkflowOrchestrator initialized successfully')
  } catch (initError) {
    console.error('❌ WorkflowOrchestrator initialization failed:', initError.message)
    console.log('🔍 This is likely where the hang occurs')
  }
  
  console.log('✅ Diagnostic complete - all components tested')
  
} catch (error) {
  console.error('❌ Diagnostic failed:', error)
  console.error('Stack:', error.stack)
} finally {
  console.log('🔌 Cleaning up connections...')
  process.exit(0)
}