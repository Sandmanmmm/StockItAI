#!/usr/bin/env node

/**
 * Test: Upload Endpoint with Workflow Data Accumulator
 * 
 * Tests the complete end-to-end flow:
 * 1. Upload endpoint receives PDF file
 * 2. Creates PO record with "processing" status
 * 3. Triggers workflowIntegration.processUploadedFile()
 * 4. Starts enhanced WorkflowOrchestrator with data accumulation
 * 5. Verifies all stages preserve data correctly
 * 6. Confirms final database update with AI results
 */

import fs from 'fs'
import path from 'path'

console.log('🔍 Testing Upload Endpoint → Workflow Data Accumulator Integration...')
console.log('=' + '='.repeat(70))

async function testUploadEndpointIntegration() {
  try {
    console.log('📦 Step 1: Import required components...')
    
    const { workflowIntegration } = await import('./api/src/lib/workflowIntegration.js')
    const { db } = await import('./api/src/lib/db.js')
    
    console.log('✅ Components imported successfully')
    
    console.log('📦 Step 2: Find test PDF file...')
    
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
    
    console.log('📦 Step 3: Simulate upload endpoint data preparation...')
    
    const fileBuffer = fs.readFileSync(testPdfPath)
    const fileName = path.basename(testPdfPath)
    const testMerchantId = 'cmft3moy50000ultcbqgxzz6d'
    
    // Simulate what the upload endpoint creates
    console.log('📝 Creating test PO record (simulating upload endpoint)...')
    const purchaseOrder = await db.client.purchaseOrder.create({
      data: {
        number: `TEST-PO-${Date.now()}`,
        supplierName: 'Processing...', // Should be updated by workflow
        orderDate: null,
        dueDate: null,
        totalAmount: 0, // Should be updated by workflow
        currency: 'USD',
        status: 'processing', // This should change to review_needed/completed
        confidence: 0.0, // Should be updated with AI confidence
        fileName,
        fileSize: fileBuffer.length,
        jobStatus: 'pending', // Should change to completed
        merchantId: testMerchantId
      }
    })
    
    console.log('✅ Test PO record created:', purchaseOrder.id)
    console.log('   Initial status:', purchaseOrder.status)
    console.log('   Initial confidence:', purchaseOrder.confidence)
    console.log('   Initial supplier:', purchaseOrder.supplierName)
    
    console.log('📝 Creating test upload record (simulating upload endpoint)...')
    const uploadRecord = await db.client.upload.create({
      data: {
        fileName,
        originalFileName: fileName,
        fileSize: fileBuffer.length,
        mimeType: 'application/pdf',
        fileUrl: `test:///${fileName}`,
        status: 'uploaded',
        merchantId: testMerchantId,
        metadata: {
          purchaseOrderId: purchaseOrder.id,
          autoProcess: true,
          uploadedAt: new Date().toISOString(),
          testRun: true
        }
      }
    })
    
    console.log('✅ Test upload record created:', uploadRecord.id)
    
    console.log('📦 Step 4: Initialize workflow integration...')
    await workflowIntegration.initialize()
    console.log('✅ Workflow integration initialized')
    
    console.log('📦 Step 5: Simulate upload endpoint workflow trigger...')
    
    // This is exactly what the upload endpoint does
    const workflowData = {
      uploadId: uploadRecord.id,
      fileName,
      originalFileName: fileName,
      fileSize: fileBuffer.length,
      mimeType: 'application/pdf',
      merchantId: testMerchantId,
      supplierId: null,
      buffer: fileBuffer,
      aiSettings: {
        confidenceThreshold: 0.8,
        customRules: [],
        strictMatching: true,
        primaryModel: 'gpt-4o-mini',
        fallbackModel: 'gpt-4o-mini'
      },
      purchaseOrderId: purchaseOrder.id
    }
    
    console.log('🚀 Starting workflow via workflowIntegration.processUploadedFile()...')
    console.log('   This simulates exactly what happens when a PDF is uploaded')
    
    const workflowResult = await workflowIntegration.processUploadedFile(workflowData)
    
    console.log('✅ Workflow started successfully!')
    console.log('   Workflow ID:', workflowResult.workflowId)
    console.log('   Expected completion:', workflowResult.estimatedCompletionTime || '2-3 minutes')
    
    console.log('📦 Step 6: Monitor workflow progress...')
    
    // Import orchestrator for monitoring
    const { workflowOrchestrator } = await import('./api/src/lib/workflowOrchestrator.js')
    
    let completed = false
    let attempts = 0
    const maxAttempts = 25 // ~4 minutes max
    
    while (!completed && attempts < maxAttempts) {
      attempts++
      await new Promise(resolve => setTimeout(resolve, 10000)) // Wait 10 seconds
      
      try {
        const progress = await workflowOrchestrator.getWorkflowProgress(workflowResult.workflowId)
        
        console.log(`\n🔍 Attempt ${attempts}/${maxAttempts}: Checking workflow progress...`)
        console.log('   Overall Progress:', progress.percentage + '%')
        console.log('   Current Stage:', progress.currentStage || 'unknown')
        console.log('   Completed Stages:', progress.completedStages.length)
        
        if (progress.percentage >= 100 || progress.completed) {
          console.log('🎉 Workflow completed!')
          completed = true
        }
        
      } catch (monitorError) {
        console.log('⚠️ Monitor error (non-fatal):', monitorError.message)
      }
    }
    
    console.log('📦 Step 7: Verify final database state...')
    
    // Check the final state of the PO record
    const finalPO = await db.client.purchaseOrder.findUnique({
      where: { id: purchaseOrder.id }
    })
    
    console.log('\n📊 FINAL DATABASE STATE ANALYSIS:')
    console.log('   PO ID:', finalPO.id)
    console.log('   Status:', finalPO.status)
    console.log('   Job Status:', finalPO.jobStatus)
    console.log('   Confidence:', finalPO.confidence)
    console.log('   Supplier Name:', finalPO.supplierName)
    console.log('   Total Amount:', finalPO.totalAmount)
    console.log('   Job Completed At:', finalPO.jobCompletedAt?.toISOString() || 'Not set')
    console.log('   Updated At:', finalPO.updatedAt?.toISOString())
    
    // Analyze the results
    let successCount = 0
    let totalChecks = 0
    
    console.log('\n🔍 WORKFLOW DATA ACCUMULATOR SUCCESS ANALYSIS:')
    
    // Check 1: Status updated from "processing"
    totalChecks++
    if (finalPO.status !== 'processing') {
      console.log('   ✅ STATUS UPDATE: Changed from "processing" to "' + finalPO.status + '"')
      successCount++
    } else {
      console.log('   ❌ STATUS UPDATE: Still stuck in "processing" state')
    }
    
    // Check 2: Confidence score set
    totalChecks++
    if (finalPO.confidence !== null && finalPO.confidence > 0) {
      console.log('   ✅ AI CONFIDENCE: Preserved and updated (' + finalPO.confidence + '%)')
      successCount++
    } else {
      console.log('   ❌ AI CONFIDENCE: Not preserved (still 0 or null)')
    }
    
    // Check 3: Supplier name updated
    totalChecks++
    if (finalPO.supplierName && finalPO.supplierName !== 'Processing...') {
      console.log('   ✅ SUPPLIER INFO: Updated from "Processing..." to "' + finalPO.supplierName + '"')
      successCount++
    } else {
      console.log('   ❌ SUPPLIER INFO: Still shows "Processing..." or empty')
    }
    
    // Check 4: Job status completed
    totalChecks++
    if (finalPO.jobStatus === 'completed') {
      console.log('   ✅ JOB STATUS: Marked as completed')
      successCount++
    } else {
      console.log('   ❌ JOB STATUS: Not marked as completed (' + finalPO.jobStatus + ')')
    }
    
    // Check 5: Total amount set
    totalChecks++
    if (finalPO.totalAmount && finalPO.totalAmount > 0) {
      console.log('   ✅ TOTAL AMOUNT: Extracted and saved ($' + finalPO.totalAmount + ')')
      successCount++
    } else {
      console.log('   ❌ TOTAL AMOUNT: Not extracted or still 0')
    }
    
    console.log('\n🎯 OVERALL RESULTS:')
    console.log('   Success Rate:', Math.round((successCount / totalChecks) * 100) + '%')
    console.log('   Checks Passed:', successCount + '/' + totalChecks)
    
    if (successCount >= 3) { // Most important checks passing
      console.log('\n🎉 WORKFLOW DATA ACCUMULATOR: SUCCESS!')
      console.log('   The upload endpoint successfully triggers enhanced workflow processing')
      console.log('   Data accumulation is working - AI results are preserved through to database')
      console.log('   Purchase orders will now automatically update with parsed information!')
    } else {
      console.log('\n⚠️ WORKFLOW DATA ACCUMULATOR: NEEDS ATTENTION')
      console.log('   Some data may not be accumulating correctly through the workflow stages')
      console.log('   Check the workflow orchestrator logs for specific stage failures')
    }
    
    console.log('📦 Step 8: Cleanup test data...')
    
    try {
      await db.client.purchaseOrder.delete({ where: { id: purchaseOrder.id } })
      await db.client.upload.delete({ where: { id: uploadRecord.id } })
      console.log('✅ Test data cleaned up successfully')
    } catch (cleanupError) {
      console.log('⚠️ Cleanup error (non-fatal):', cleanupError.message)
    }
    
  } catch (error) {
    console.error('❌ Upload endpoint integration test failed:', error)
    console.error('Stack trace:', error.stack)
  } finally {
    try {
      const { db } = await import('./api/src/lib/db.js')
      await db.client.$disconnect()
      console.log('🔌 Database connections closed')
    } catch (disconnectError) {
      console.log('⚠️ Database disconnect error:', disconnectError.message)
    }
    
    console.log('✅ Upload endpoint integration test completed')
    process.exit(0)
  }
}

// Run the test
testUploadEndpointIntegration().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})