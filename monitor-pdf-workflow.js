/**
 * Monitor PDF Workflow Progress
 * Real-time monitoring of the PDF workflow we just started
 */

import { db } from './api/src/lib/db.js'

async function monitorPDFWorkflow() {
  console.log('🔍 Monitoring PDF workflow progress...\n')

  try {
    console.log('📊 Connecting to database...')

    // Find the most recent PDF PO
    const recentPDFPO = await db.client.purchaseOrder.findFirst({
      where: {
        fileName: {
          endsWith: '.pdf'
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    if (!recentPDFPO) {
      console.log('❌ No recent PDF PO found')
      return
    }

    console.log(`📄 Monitoring PO: ${recentPDFPO.id}`)
    console.log(`📁 File: ${recentPDFPO.fileName}`)
    console.log(`📊 Current Status: ${recentPDFPO.status}`)
    console.log(`🤖 Job Status: ${recentPDFPO.jobStatus}`)
    console.log(`💰 Confidence: ${recentPDFPO.confidence || 0}%`)
    console.log(`🏢 Supplier: ${recentPDFPO.supplierName || 'Not extracted yet'}`)

    // Also find the corresponding upload record
    const recentUpload = await db.client.upload.findFirst({
      where: {
        fileName: recentPDFPO.fileName,
        merchantId: recentPDFPO.merchantId
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    if (recentUpload) {
      console.log(`📤 Upload ID: ${recentUpload.id}`)
      console.log(`📈 Upload Status: ${recentUpload.status}`)
      console.log(`🎭 Workflow ID: ${recentUpload.workflowId || 'Not set'}`)
    }

    // Monitor for changes
    console.log('\n⏱️ Monitoring for changes (15 seconds)...')
    for (let i = 0; i < 5; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      // Refresh PO data
      const updatedPO = await db.client.purchaseOrder.findUnique({
        where: { id: recentPDFPO.id },
        select: {
          status: true,
          jobStatus: true,
          confidence: true,
          supplierName: true,
          totalAmount: true,
          jobError: true,
          processingNotes: true
        }
      })

      console.log(`   Check ${i + 1}: Status=${updatedPO.status}, Job=${updatedPO.jobStatus}, Confidence=${updatedPO.confidence || 0}%, Supplier=${updatedPO.supplierName || 'None'}`)
      
      if (updatedPO.jobError) {
        console.log(`   ❌ Error: ${updatedPO.jobError}`)
      }
      
      if (updatedPO.status === 'review_needed' || updatedPO.status === 'failed') {
        console.log(`\n🎯 Processing completed with status: ${updatedPO.status}`)
        break
      }
    }

    console.log('\n📋 Final Status Check:')
    const finalPO = await db.client.purchaseOrder.findUnique({
      where: { id: recentPDFPO.id }
    })

    console.log(`   Status: ${finalPO.status}`)
    console.log(`   Job Status: ${finalPO.jobStatus}`)
    console.log(`   Confidence: ${finalPO.confidence || 0}%`)
    console.log(`   Supplier: ${finalPO.supplierName || 'Not extracted'}`)
    console.log(`   Total Amount: ${finalPO.totalAmount || 'Not calculated'}`)
    
    if (finalPO.jobError) {
      console.log(`   ❌ Final Error: ${finalPO.jobError}`)
    }
    
    if (finalPO.processingNotes) {
      console.log(`   📝 Notes: ${finalPO.processingNotes}`)
    }

    // Check if we have line items
    const lineItems = await db.client.pOLineItem.findMany({
      where: { purchaseOrderId: recentPDFPO.id }
    })

    console.log(`   📦 Line Items: ${lineItems.length}`)
    if (lineItems.length > 0) {
      lineItems.forEach((item, i) => {
        console.log(`     ${i + 1}. ${item.productName} - Qty: ${item.quantity}, Unit: $${item.unitCost}`)
      })
    }

  } catch (error) {
    console.error('❌ Monitoring failed:', error)
  } finally {
    // Cleanup
    try {
      await db.cleanup()
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError)
    }
  }
}

// Run the monitor
monitorPDFWorkflow()