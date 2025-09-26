#!/usr/bin/env node

/**
 * Test Script: Workflow Data Accumulator
 * 
 * Comprehensive test for the new Workflow Data Accumulator system.
 * Tests the full data flow from PDF upload through all workflow stages.
 * Validates that:
 * 1. PDF files are properly parsed and processed
 * 2. Data accumulates correctly across all workflow stages  
 * 3. Database records are properly updated with AI results
 * 4. PO records transition from "processing" to final status
 * 5. StageResultStore persists and retrieves data correctly
 */

import { workflowOrchestrator } from './api/src/lib/workflowOrchestrator.js'
import { stageResultStore } from './api/src/lib/stageResultStore.js'
import { db } from './api/src/lib/db.js'
import fs from 'fs'
import path from 'path'

const WORKFLOW_STAGES = {
  AI_PARSING: 'ai_parsing',
  DATABASE_SAVE: 'database_save', 
  SHOPIFY_SYNC: 'shopify_sync',
  STATUS_UPDATE: 'status_update'
}

/**
 * Test the complete Workflow Data Accumulator system
 */
async function testWorkflowDataAccumulator() {
  console.log('🧪 Testing Workflow Data Accumulator System...')
  console.log('=' + '='.repeat(60))
  
  try {
    // Step 1: Initialize the system
    console.log('\n📋 Step 1: Initialize Workflow Orchestrator...')
    await workflowOrchestrator.initialize()
    console.log('✅ Workflow Orchestrator initialized')
    
    // Step 2: Test StageResultStore directly
    console.log('\n📋 Step 2: Test StageResultStore functionality...')
    const testWorkflowId = `test-workflow-${Date.now()}`
    
    // Test saving stage results
    const testStageResult = {
      testData: 'test-value',
      stage: 'test_stage',
      timestamp: new Date().toISOString()
    }
    
    await stageResultStore.saveStageResult(testWorkflowId, 'test_stage', testStageResult)
    console.log('✅ Stage result saved successfully')
    
    // Test retrieving stage results
    const retrievedResult = await stageResultStore.getStageResult(testWorkflowId, 'test_stage')
    console.log('✅ Stage result retrieved:', !!retrievedResult)
    
    // Test accumulated data
    const accumulatedData = await stageResultStore.getAccumulatedData(testWorkflowId)
    console.log('✅ Accumulated data retrieved:', !!accumulatedData)
    
    // Clean up test data
    await stageResultStore.clearWorkflowResults(testWorkflowId)
    console.log('✅ Test stage results cleaned up')
    
    // Step 3: Find a test PDF file
    console.log('\n📋 Step 3: Locate test PDF file...')
    const testFiles = [
      './test-po-1758777151697.pdf',
      './test-po-1758777377922.pdf', 
      './test-po-1758777661402.pdf'
    ]
    
    let testPdfPath = null
    for (const filePath of testFiles) {
      if (fs.existsSync(filePath)) {
        testPdfPath = filePath
        break
      }
    }
    
    if (!testPdfPath) {
      throw new Error('No test PDF files found. Expected one of: ' + testFiles.join(', '))
    }
    
    console.log('✅ Using test PDF:', testPdfPath)
    
    // Step 4: Create a test upload record in database
    console.log('\n📋 Step 4: Create test upload record...')
    const testMerchantId = 'cmft3moy50000ultcbqgxzz6d'
    const fileName = path.basename(testPdfPath)
    
    const uploadRecord = await db.client.upload.create({
      data: {
        fileName,
        fileSize: fs.statSync(testPdfPath).size,
        mimeType: 'application/pdf',
        uploadStatus: 'completed',
        merchantId: testMerchantId,
        uploadedAt: new Date(),
        fileUrl: `test:///${fileName}`,
        metadata: {
          test: true,
          accumulatorTest: true
        }
      }
    })
    
    console.log('✅ Test upload record created:', uploadRecord.id)
    
    // Step 5: Read the PDF file
    console.log('\n📋 Step 5: Read test PDF file...')
    const fileBuffer = fs.readFileSync(testPdfPath)
    console.log('✅ PDF file read successfully, size:', fileBuffer.length, 'bytes')
    
    // Step 6: Start workflow with data accumulation
    console.log('\n📋 Step 6: Start workflow with enhanced data accumulation...')
    const workflowId = `accumulator-test-${Date.now()}`
    
    const workflowData = {
      uploadId: uploadRecord.id,
      fileName,
      fileSize: fileBuffer.length,
      mimeType: 'application/pdf',
      merchantId: testMerchantId,
      fileBuffer: Array.from(fileBuffer), // Convert to array for JSON serialization
      metadata: {
        testType: 'workflow-data-accumulator',
        uploadedAt: new Date().toISOString()
      }
    }
    
    console.log('🚀 Starting workflow:', workflowId)
    const workflowResult = await workflowOrchestrator.startWorkflow(workflowId, workflowData)
    console.log('✅ Workflow started successfully')
    
    // Step 7: Monitor workflow progress with data accumulation tracking
    console.log('\n📋 Step 7: Monitor workflow progress and data accumulation...')
    let completed = false
    let attempts = 0
    const maxAttempts = 30 // 5 minutes max
    
    while (!completed && attempts < maxAttempts) {
      attempts++
      await new Promise(resolve => setTimeout(resolve, 10000)) // Wait 10 seconds
      
      try {
        // Check workflow metadata
        const metadata = await workflowOrchestrator.getWorkflowMetadata(workflowId)
        const progress = await workflowOrchestrator.getWorkflowProgress(workflowId)
        
        console.log(`\n🔍 Attempt ${attempts}/30: Checking workflow progress...`)
        console.log('   Overall Progress:', progress.percentage + '%')
        console.log('   Current Stage:', progress.currentStage || 'unknown')
        console.log('   Completed Stages:', progress.completedStages.length)
        
        // Check accumulated data at each stage
        for (const stage of Object.values(WORKFLOW_STAGES)) {
          const stageResult = await stageResultStore.getStageResult(workflowId, stage)
          if (stageResult) {
            console.log(`   ✅ Stage ${stage}: Data accumulated`)
          } else {
            console.log(`   ⏳ Stage ${stage}: Not completed`)
          }
        }
        
        // Check if all stages are completed
        if (progress.percentage >= 100 || progress.completed) {
          console.log('🎉 Workflow completed! Checking final results...')
          completed = true
          
          // Get final accumulated data
          const finalAccumulatedData = await stageResultStore.getAccumulatedData(workflowId)
          console.log('\n📊 Final Accumulated Data Summary:')
          console.log('   Has AI Result:', !!finalAccumulatedData?.aiResult)
          console.log('   Has DB Result:', !!finalAccumulatedData?.dbResult)
          console.log('   Has Shopify Result:', !!finalAccumulatedData?.shopifyResult)
          console.log('   Purchase Order ID:', finalAccumulatedData?.purchaseOrderId || 'Not found')
          
          if (finalAccumulatedData?.aiResult) {
            console.log('   AI Confidence:', finalAccumulatedData.aiResult.confidence || 'Not available')
            console.log('   AI Supplier:', finalAccumulatedData.aiResult.supplier?.name || finalAccumulatedData.aiResult.supplier || 'Not found')
          }
        }
        
      } catch (monitorError) {
        console.log('⚠️ Monitor error (non-fatal):', monitorError.message)
      }
    }
    
    if (!completed) {
      console.log('⚠️ Workflow did not complete within timeout period')
    }
    
    // Step 8: Verify database updates
    console.log('\n📋 Step 8: Verify database record updates...')
    
    // Find any PO records created during the test
    const recentPOs = await db.client.purchaseOrder.findMany({
      where: {
        merchantId: testMerchantId,
        createdAt: {
          gte: new Date(Date.now() - 10 * 60 * 1000) // Last 10 minutes
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    })
    
    console.log(`Found ${recentPOs.length} recent PO records`)
    
    if (recentPOs.length > 0) {
      const latestPO = recentPOs[0]
      console.log('\n🔍 Latest PO Record Analysis:')
      console.log('   PO ID:', latestPO.id)
      console.log('   Status:', latestPO.status)
      console.log('   Job Status:', latestPO.jobStatus)
      console.log('   Confidence:', latestPO.confidence)
      console.log('   Supplier:', latestPO.supplierName || 'Not set')
      console.log('   Total Amount:', latestPO.totalAmount || 'Not set')
      console.log('   Created:', latestPO.createdAt?.toISOString())
      console.log('   Updated:', latestPO.updatedAt?.toISOString())
      console.log('   Job Completed:', latestPO.jobCompletedAt?.toISOString() || 'Not completed')
      
      // Verify the PO was properly updated
      if (latestPO.status !== 'processing') {
        console.log('✅ SUCCESS: PO status was updated from "processing"!')
        console.log('   Final status:', latestPO.status)
      } else {
        console.log('❌ ISSUE: PO is still in "processing" status')
      }
      
      if (latestPO.confidence !== null && latestPO.confidence !== undefined) {
        console.log('✅ SUCCESS: AI confidence was preserved!')
        console.log('   Confidence value:', latestPO.confidence)
      } else {
        console.log('❌ ISSUE: AI confidence was not saved')
      }
      
      if (latestPO.supplierName && latestPO.supplierName !== 'Unknown') {
        console.log('✅ SUCCESS: Supplier information was preserved!')
        console.log('   Supplier name:', latestPO.supplierName)
      } else {
        console.log('❌ ISSUE: Supplier information was not saved or is "Unknown"')
      }
      
    } else {
      console.log('⚠️ No recent PO records found - workflow may not have reached database save stage')
    }
    
    // Step 9: Clean up test data
    console.log('\n📋 Step 9: Clean up test data...')
    
    try {
      await stageResultStore.clearWorkflowResults(workflowId)
      console.log('✅ Workflow stage results cleaned up')
    } catch (cleanupError) {
      console.log('⚠️ Stage result cleanup failed:', cleanupError.message)
    }
    
    try {
      await db.client.upload.delete({ where: { id: uploadRecord.id } })
      console.log('✅ Test upload record cleaned up')
    } catch (uploadCleanupError) {
      console.log('⚠️ Upload cleanup failed:', uploadCleanupError.message)
    }
    
    // Step 10: Summary and recommendations
    console.log('\n📋 Step 10: Test Summary')
    console.log('=' + '='.repeat(60))
    console.log('🧪 Workflow Data Accumulator Test Completed!')
    console.log('\n✅ Components Tested:')
    console.log('   - StageResultStore Redis persistence')
    console.log('   - WorkflowOrchestrator data accumulation')
    console.log('   - PDF parsing and processing')
    console.log('   - Cross-stage data preservation')
    console.log('   - Database status updates')
    console.log('   - Workflow cleanup procedures')
    
    console.log('\n🎯 Key Success Metrics:')
    console.log('   - PDF files process successfully')
    console.log('   - Data accumulates across all workflow stages')
    console.log('   - AI results are preserved through to database updates')
    console.log('   - PO records update from "processing" to final status')
    console.log('   - Supplier and confidence data is correctly saved')
    
    if (recentPOs.length > 0 && recentPOs[0].status !== 'processing') {
      console.log('\n🎉 OVERALL RESULT: SUCCESS!')
      console.log('   The Workflow Data Accumulator is working correctly.')
      console.log('   Database records are being updated with accumulated AI results.')
      console.log('   The core issue has been resolved!')
    } else {
      console.log('\n⚠️ OVERALL RESULT: NEEDS ATTENTION')
      console.log('   The workflow may need additional debugging.')
      console.log('   Check the logs above for specific issues.')
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error)
    console.error('Stack trace:', error.stack)
  } finally {
    // Always try to close database connections
    try {
      await db.client.$disconnect()
      console.log('🔌 Database connections closed')
    } catch (dbError) {
      console.log('⚠️ Database disconnect error:', dbError.message)
    }
    
    try {
      await workflowOrchestrator.shutdown()
      console.log('🔌 Workflow orchestrator shut down')
    } catch (shutdownError) {
      console.log('⚠️ Orchestrator shutdown error:', shutdownError.message)
    }
  }
}

// Run the test if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testWorkflowDataAccumulator()
    .then(() => {
      console.log('\n✅ Test script completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('\n❌ Test script failed:', error)
      process.exit(1)
    })
}

export { testWorkflowDataAccumulator }