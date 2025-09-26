/**
 * Debug PDF Processing Status Update
 * Check why the database isn't getting updated despite successful workflow
 */

import { db } from './api/src/lib/db.js'

async function debugPDFStatusUpdate() {
  console.log('🔍 Debugging PDF status update...\n')

  try {
    // Find the latest PDF PO
    const latestPDF = await db.client.purchaseOrder.findFirst({
      where: {
        fileName: {
          endsWith: '.pdf'
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    if (!latestPDF) {
      console.log('❌ No PDF PO found')
      return
    }

    console.log('📄 Latest PDF PO:')
    console.log(`   ID: ${latestPDF.id}`)
    console.log(`   File: ${latestPDF.fileName}`)
    console.log(`   Status: ${latestPDF.status}`)
    console.log(`   Job Status: ${latestPDF.jobStatus}`)
    console.log(`   Confidence: ${latestPDF.confidence}%`)
    console.log(`   Supplier: ${latestPDF.supplierName || 'Not set'}`)
    console.log(`   Total: ${latestPDF.totalAmount || 'Not set'}`)
    console.log(`   Created: ${latestPDF.createdAt.toLocaleString()}`)
    console.log(`   Updated: ${latestPDF.updatedAt.toLocaleString()}`)
    
    if (latestPDF.jobError) {
      console.log(`   Job Error: ${latestPDF.jobError}`)
    }
    
    if (latestPDF.processingNotes) {
      console.log(`   Processing Notes: ${latestPDF.processingNotes}`)
    }

    // Check if there are any line items
    const lineItems = await db.client.pOLineItem.findMany({
      where: { purchaseOrderId: latestPDF.id }
    })

    console.log(`\n📦 Line Items: ${lineItems.length}`)
    if (lineItems.length > 0) {
      lineItems.forEach((item, i) => {
        console.log(`   ${i + 1}. ${item.productName}`)
        console.log(`      SKU: ${item.sku}`)
        console.log(`      Qty: ${item.quantity}`)
        console.log(`      Unit Cost: $${item.unitCost}`)
        console.log(`      Total: $${item.totalCost}`)
        console.log(`      Confidence: ${item.confidence}%`)
      })
    }

    // Let's manually update this PO to test database connectivity
    console.log('\n🧪 Testing manual database update...')
    try {
      const testUpdate = await db.client.purchaseOrder.update({
        where: { id: latestPDF.id },
        data: {
          processingNotes: `Manual test update at ${new Date().toLocaleString()}`
        }
      })
      
      console.log('✅ Manual database update successful!')
      console.log(`   Processing Notes: ${testUpdate.processingNotes}`)
      
      // Verify the update persisted
      const verifyUpdate = await db.client.purchaseOrder.findUnique({
        where: { id: latestPDF.id },
        select: { processingNotes: true }
      })
      
      console.log('✅ Update verification successful!')
      console.log(`   Verified Notes: ${verifyUpdate.processingNotes}`)
      
    } catch (updateError) {
      console.error('❌ Manual database update failed:', updateError.message)
    }

  } catch (error) {
    console.error('❌ Debug failed:', error)
  } finally {
    process.exit(0)
  }
}

// Run the debug
debugPDFStatusUpdate()