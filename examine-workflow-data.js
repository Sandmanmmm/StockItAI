/**
 * Examine PDF Workflow Data Structure
 */

import redisManager from './api/src/lib/redisManager.js'

async function examineWorkflowData() {
  console.log('🔍 Examining PDF workflow data structure...\n')

  try {
    await redisManager.initializeConnections()
    
    const workflowId = 'workflow_1758777662856_jglfjfdg1'
    const workflowKey = `workflow:${workflowId}`
    
    console.log(`📊 Getting data for: ${workflowKey}`)
    
    const workflowData = await redisManager.redis.get(workflowKey)
    
    if (!workflowData) {
      console.log('❌ Workflow data not found')
      return
    }

    const metadata = JSON.parse(workflowData)
    
    console.log('📋 Workflow Metadata Structure:')
    console.log('   Status:', metadata.status)
    console.log('   Progress:', metadata.progress + '%')
    console.log('   Current Stage:', metadata.currentStage)
    
    if (metadata.data) {
      console.log('\n📦 Workflow Data:')
      console.log('   Keys available:', Object.keys(metadata.data))
      console.log('   Upload ID:', metadata.data.uploadId)
      console.log('   File Name:', metadata.data.fileName)
      console.log('   MIME Type:', metadata.data.mimeType)
      console.log('   Purchase Order ID:', metadata.data.purchaseOrderId)
      console.log('   Has parsed content:', !!metadata.data.parsedContent)
      console.log('   Has AI result:', !!metadata.data.aiResult)
      console.log('   Has DB result:', !!metadata.data.dbResult)
      
      if (metadata.data.parsedContent) {
        console.log(`   Parsed content length: ${metadata.data.parsedContent.length} chars`)
      }
      
      if (metadata.data.aiResult) {
        console.log('\n🤖 AI Result Structure:')
        console.log('   AI Result keys:', Object.keys(metadata.data.aiResult))
        console.log('   AI Confidence:', metadata.data.aiResult.confidence)
        console.log('   AI Supplier:', metadata.data.aiResult.supplier?.name || 'Not found')
        
        if (metadata.data.aiResult.supplier) {
          console.log('   Full AI Supplier data:', JSON.stringify(metadata.data.aiResult.supplier, null, 2))
        }
        
        if (metadata.data.aiResult.totals) {
          console.log('   AI Totals:', JSON.stringify(metadata.data.aiResult.totals, null, 2))
        }
      }
      
      if (metadata.data.dbResult) {
        console.log('\n💾 DB Result Structure:')
        console.log('   DB Result keys:', Object.keys(metadata.data.dbResult))
        console.log('   PO ID from DB result:', metadata.data.dbResult.purchaseOrder?.id)
      }
    }
    
    if (metadata.stages) {
      console.log('\n📋 Stage Results:')
      Object.entries(metadata.stages).forEach(([stage, details]) => {
        console.log(`   ${stage}: ${details.status}`)
        if (details.completedAt) {
          console.log(`     Completed: ${new Date(details.completedAt).toLocaleString()}`)
        }
      })
    }
    
    if (metadata.error) {
      console.log('\n❌ Workflow Error:')
      console.log('   Stage:', metadata.error.stage)
      console.log('   Message:', metadata.error.message)
    }

  } catch (error) {
    console.error('❌ Examination failed:', error)
  } finally {
    process.exit(0)
  }
}

// Run the examination
examineWorkflowData()