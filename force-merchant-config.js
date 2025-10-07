#!/usr/bin/env node

// Force merchant config to complete by manually saving result to Redis
import { stageResultStore } from './api/src/lib/stageResultStore.js'

async function forceMerchantConfigCompletion() {
  console.log('🔍 Forcing merchant config completion...')
  
  try {
    // Initialize the store
    await stageResultStore.initialize()
    console.log('✅ Stage result store initialized')
    
    const workflowId = 'workflow_1759206489906_d5goz8ai9'
    
    // Get the normalized items
    const accumulatedData = await stageResultStore.getAccumulatedData(workflowId)
    const normalizedItems = accumulatedData?.normalizedItems || []
    
    console.log(`📋 Found ${normalizedItems.length} normalized items`)
    
    if (normalizedItems.length > 0) {
      // Create a mock merchant config result
      const configuredItems = normalizedItems.map(item => ({
        ...item,
        merchantConfigApplied: true,
        configuredAt: new Date().toISOString()
      }))
      
      // Save the merchant config stage result
      const stageResult = { configuredItems }
      await stageResultStore.saveStageResult(workflowId, 'merchant_config', stageResult)
      
      console.log('✅ Saved merchant config stage result with', configuredItems.length, 'items')
      
      // Test that we can retrieve it
      const merchantConfigResult = await stageResultStore.getStageResult(workflowId, 'merchant_config')
      console.log('✅ Verified merchant config result:', !!merchantConfigResult)
      console.log('Configured items count:', merchantConfigResult?.configuredItems?.length || 0)
      
      // Now test accumulated data again
      const newAccumulatedData = await stageResultStore.getAccumulatedData(workflowId)
      console.log('\n📊 Updated accumulated data:')
      console.log('- Stages:', Object.keys(newAccumulatedData?.stages || {}))
      console.log('- Normalized items:', newAccumulatedData?.normalizedItems?.length || 0)
      console.log('- Configured items:', newAccumulatedData?.configuredItems?.length || 0)
      
      console.log('\n🎯 The merchant config stage should now be able to proceed to AI enrichment!')
      console.log('   You can check the workflow status to see if it progresses.')
      
    } else {
      console.log('❌ No normalized items found to configure')
    }
    
  } catch (error) {
    console.error('❌ Failed to force completion:', error)
  }
  
  process.exit(0)
}

forceMerchantConfigCompletion()