/**
 * Test PDF Processing in Automatic Workflow
 * 
 * Tests that PDF files can be processed automatically through the workflow orchestrator
 */

import { db } from './api/src/lib/db.js'
import { WorkflowOrchestrator } from './api/src/lib/workflowOrchestrator.js'
import { processorRegistrationService } from './api/src/lib/processorRegistrationService.js'
import redisManager from './api/src/lib/redisManager.js'

async function testPDFWorkflow() {
  console.log('🧪 Testing PDF Processing in Automatic Workflow...\n')

  try {
    // Initialize services
    await db.initialize()
    await redisManager.initializeConnections()
    await processorRegistrationService.initialize()

    const orchestrator = new WorkflowOrchestrator()
    await orchestrator.initialize()

    console.log('✅ Services initialized\n')

    // Find a recent PDF upload that failed
    console.log('📋 Looking for recent PDF uploads...')
    const recentPDFUploads = await db.client.upload.findMany({
      where: {
        mimeType: 'application/pdf',
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 5
    })

    if (recentPDFUploads.length === 0) {
      console.log('❌ No recent PDF uploads found to test')
      return
    }

    console.log(`📊 Found ${recentPDFUploads.length} recent PDF uploads:`)
    recentPDFUploads.forEach((upload, i) => {
      console.log(`   ${i + 1}. ${upload.fileName} (${upload.fileSize} bytes) - Status: ${upload.status}`)
    })
    console.log()

    // Test with the first PDF upload
    const testUpload = recentPDFUploads[0]
    console.log(`🎯 Testing workflow with: ${testUpload.fileName}`)

    // Find associated PO
    const associatedPO = await db.client.purchaseOrder.findFirst({
      where: {
        fileName: testUpload.fileName
      }
    })

    if (!associatedPO) {
      console.log('❌ No associated PO found for this upload')
      return
    }

    console.log(`📄 Associated PO: ${associatedPO.id} (Status: ${associatedPO.status})`)

    // Check if this upload has a workflow
    const workflowKey = `workflow:*`
    const allWorkflowKeys = await redisManager.redis.keys(workflowKey)
    
    console.log(`🔍 Found ${allWorkflowKeys.length} workflows in Redis`)

    // Create a new test workflow for this PDF
    console.log('\n🚀 Starting new workflow for PDF processing...')
    
    const workflowData = {
      uploadId: testUpload.id,
      fileName: testUpload.fileName,
      mimeType: testUpload.mimeType,
      purchaseOrderId: associatedPO.id,
      merchantId: associatedPO.merchantId,
      options: {}
    }

    const workflowId = await orchestrator.startWorkflow(workflowData)
    console.log(`✅ Workflow started with ID: ${workflowId}`)

    // Monitor workflow progress
    console.log('\n📊 Monitoring workflow progress...')
    let attempts = 0
    const maxAttempts = 30
    
    while (attempts < maxAttempts) {
      const metadata = await orchestrator.getWorkflowMetadata(workflowId)
      
      if (!metadata) {
        console.log('❌ Workflow metadata not found')
        break
      }

      console.log(`   Progress: ${metadata.progress}% | Stage: ${metadata.currentStage} | Status: ${metadata.status}`)
      
      if (metadata.status === 'completed') {
        console.log('\n🎉 Workflow completed successfully!')
        console.log('   Final result:', JSON.stringify(metadata.result, null, 2))
        break
      } else if (metadata.status === 'failed') {
        console.log('\n❌ Workflow failed!')
        console.log('   Error:', JSON.stringify(metadata.error, null, 2))
        break
      }

      await new Promise(resolve => setTimeout(resolve, 2000)) // Wait 2 seconds
      attempts++
    }

    if (attempts >= maxAttempts) {
      console.log('\n⏰ Workflow monitoring timeout reached')
      const finalMetadata = await orchestrator.getWorkflowMetadata(workflowId)
      if (finalMetadata) {
        console.log('   Final status:', finalMetadata.status)
        console.log('   Final progress:', finalMetadata.progress + '%')
      }
    }

    // Check final PO status
    const finalPO = await db.client.purchaseOrder.findUnique({
      where: { id: associatedPO.id },
      select: {
        status: true,
        jobStatus: true,
        confidence: true,
        supplierName: true,
        totalAmount: true,
        lineItems: true,
        processingNotes: true,
        jobError: true
      }
    })

    console.log('\n📊 Final PO Status:')
    console.log('   Status:', finalPO?.status)
    console.log('   Job Status:', finalPO?.jobStatus)
    console.log('   Confidence:', finalPO?.confidence + '%')
    console.log('   Supplier:', finalPO?.supplierName)
    console.log('   Total Amount:', finalPO?.totalAmount)
    console.log('   Line Items:', finalPO?.lineItems?.length || 0)
    if (finalPO?.jobError) {
      console.log('   Error:', finalPO.jobError)
    }

  } catch (error) {
    console.error('❌ Test failed:', error)
    console.error(error.stack)
  } finally {
    // Cleanup
    try {
      await processorRegistrationService.cleanup()
      await redisManager.cleanup()
      await db.cleanup()
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError)
    }
  }
}

// Run the test
testPDFWorkflow()