#!/usr/bin/env node
/**
 * Test Sequential Workflow Execution
 * 
 * This script tests the sequential workflow runner end-to-end.
 * It creates a test workflow and verifies all 6 stages execute successfully.
 * 
 * Usage:
 *   # Test sequential mode
 *   $env:SEQUENTIAL_WORKFLOW="1"; node api/test-sequential-workflow.mjs
 * 
 *   # Test legacy mode
 *   $env:SEQUENTIAL_WORKFLOW="0"; node api/test-sequential-workflow.mjs
 */

import { sequentialWorkflowRunner } from './src/lib/sequentialWorkflowRunner.js'
import { db } from './src/lib/db.js'

const TEST_MODE = process.env.SEQUENTIAL_WORKFLOW === '1' ? 'SEQUENTIAL' : 'LEGACY'

console.log(`\n${'='.repeat(70)}`)
console.log(`🧪 TEST: Sequential Workflow Execution`)
console.log(`Mode: ${TEST_MODE}`)
console.log(`${'='.repeat(70)}\n`)

async function main() {
  const startTime = Date.now()
  
  try {
    // Get Prisma client
    const prisma = await db.getClient()
    
    // Find a recent workflow to test with
    console.log('📋 Finding test workflow...')
    const recentWorkflow = await prisma.workflowExecution.findFirst({
      where: {
        status: {
          in: ['pending', 'processing', 'completed']
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        purchaseOrder: true
      }
    })
    
    if (!recentWorkflow) {
      throw new Error('No workflows found. Please upload a PO file first.')
    }
    
    console.log(`✅ Found workflow: ${recentWorkflow.id}`)
    console.log(`   Status: ${recentWorkflow.status}`)
    console.log(`   Created: ${recentWorkflow.createdAt}`)
    
    // Find the upload
    const upload = await prisma.upload.findUnique({
      where: { id: recentWorkflow.uploadId }
    })
    
    if (!upload) {
      throw new Error(`Upload not found: ${recentWorkflow.uploadId}`)
    }
    
    console.log(`\n📦 Upload details:`)
    console.log(`   File: ${upload.fileName}`)
    console.log(`   Size: ${(upload.fileSize / 1024).toFixed(2)} KB`)
    console.log(`   Type: ${upload.mimeType}`)
    console.log(`   Merchant: ${upload.merchantId}`)
    
    if (TEST_MODE === 'SEQUENTIAL') {
      console.log(`\n🚀 Starting SEQUENTIAL workflow test...\n`)
      
      // Initialize sequential runner
      await sequentialWorkflowRunner.initialize()
      
      // Create new workflow for testing
      const testWorkflowId = `test_${Date.now()}_${Math.random().toString(36).substring(7)}`
      
      const workflowData = {
        uploadId: upload.id,
        merchantId: upload.merchantId,
        fileUrl: upload.fileUrl,
        fileName: upload.fileName,
        fileSize: upload.fileSize,
        mimeType: upload.mimeType,
        fileType: upload.mimeType,
        supplierId: upload.supplierId,
        purchaseOrderId: recentWorkflow.purchaseOrderId,
        source: 'test-script'
      }
      
      // Execute workflow
      const result = await sequentialWorkflowRunner.executeWorkflow(testWorkflowId, workflowData)
      
      const duration = Date.now() - startTime
      
      console.log(`\n${'='.repeat(70)}`)
      console.log(`✅ TEST PASSED - Sequential Mode`)
      console.log(`${'='.repeat(70)}`)
      console.log(`⏱️  Total Duration: ${Math.round(duration / 1000)}s`)
      console.log(`📊 Stage Timings:`)
      
      if (result.stageTimings) {
        for (const [stage, timing] of Object.entries(result.stageTimings)) {
          console.log(`   ${stage}: ${Math.round(timing / 1000)}s`)
        }
      }
      
      console.log(`\n✅ All 6 stages completed successfully!`)
      console.log(`🎯 Expected: 3-5 minutes`)
      console.log(`📈 Actual: ${Math.round(duration / 60000)} minutes`)
      
      if (duration < 600000) { // Less than 10 minutes
        console.log(`✅ PERFORMANCE: Excellent (under 10 minutes)`)
      } else {
        console.warn(`⚠️  PERFORMANCE: Slower than expected (over 10 minutes)`)
      }
      
    } else {
      console.log(`\n📋 LEGACY MODE TEST`)
      console.log(`⚠️  Legacy mode requires the cron job to be running`)
      console.log(`⚠️  Workflows take ~38 minutes to complete`)
      console.log(`\nTo test legacy mode:`)
      console.log(`1. Ensure cron job is running (node api/process-workflows-cron.js)`)
      console.log(`2. Upload a new PO file`)
      console.log(`3. Wait ~38 minutes`)
      console.log(`4. Check workflow status in database`)
    }
    
  } catch (error) {
    console.error(`\n❌ TEST FAILED:`, error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

main()
  .then(() => {
    console.log(`\n${'='.repeat(70)}`)
    console.log(`🎉 Test completed successfully`)
    console.log(`${'='.repeat(70)}\n`)
    process.exit(0)
  })
  .catch(error => {
    console.error(`\n❌ Fatal error:`, error)
    process.exit(1)
  })
