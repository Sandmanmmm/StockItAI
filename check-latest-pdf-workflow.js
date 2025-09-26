/**
 * Check Latest PDF Workflow Status
 */

import redisManager from './api/src/lib/redisManager.js'

async function checkLatestPDFWorkflow() {
  console.log('🔍 Checking latest PDF workflow status...\n')

  try {
    await redisManager.initializeConnections()
    
    // Get all workflow keys
    const workflowKeys = await redisManager.redis.keys('workflow:*')
    console.log(`Found ${workflowKeys.length} workflows in Redis`)
    
    if (workflowKeys.length === 0) {
      console.log('❌ No workflows found')
      return
    }
    
    // Sort by timestamp to get the latest
    const sortedKeys = workflowKeys.sort((a, b) => {
      const aTime = a.split('_')[1]
      const bTime = b.split('_')[1]
      return parseInt(bTime) - parseInt(aTime)
    })
    
    console.log('📊 Latest workflows:')
    
    // Check the top 3 most recent workflows
    for (let i = 0; i < Math.min(3, sortedKeys.length); i++) {
      const workflowKey = sortedKeys[i]
      const workflowData = await redisManager.redis.get(workflowKey)
      
      if (workflowData) {
        const metadata = JSON.parse(workflowData)
        console.log(`\n${i + 1}. ${workflowKey}:`)
        console.log(`   File: ${metadata.data?.fileName || 'Unknown'}`)
        console.log(`   MIME: ${metadata.data?.mimeType || 'Unknown'}`)
        console.log(`   Status: ${metadata.status}`)
        console.log(`   Progress: ${metadata.progress}%`)
        console.log(`   Current Stage: ${metadata.currentStage}`)
        console.log(`   Created: ${new Date(metadata.startedAt).toLocaleString()}`)
        
        if (metadata.stages) {
          console.log('   📋 Stage Details:')
          Object.entries(metadata.stages).forEach(([stage, details]) => {
            console.log(`     ${stage}: ${details.status}`)
          })
        }
        
        if (metadata.error) {
          console.log('   ❌ Error:', metadata.error.message)
          console.log('   ❌ Stack:', metadata.error.stack?.substring(0, 200) + '...')
        }
        
        // If this is a PDF workflow, show more details
        if (metadata.data?.fileName?.endsWith('.pdf')) {
          console.log('   🎯 PDF WORKFLOW DETECTED!')
          if (metadata.data.parsedContent) {
            console.log(`   📄 Has parsed content: ${metadata.data.parsedContent.length} chars`)
          }
          if (metadata.data.uploadId) {
            console.log(`   📤 Upload ID: ${metadata.data.uploadId}`)
          }
        }
      }
    }

  } catch (error) {
    console.error('❌ Check failed:', error)
  } finally {
    process.exit(0)
  }
}

// Run the check
checkLatestPDFWorkflow()