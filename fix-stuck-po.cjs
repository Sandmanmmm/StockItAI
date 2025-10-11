/**
 * Manually trigger status update for stuck PO
 * Run from api directory: cd api && node ../fix-stuck-po.js
 */

const PrismaClient = require('./api/node_modules/@prisma/client').PrismaClient
const Bull = require('./api/node_modules/bull')

const prisma = new PrismaClient()

async function fixStuckPO() {
  try {
    const poId = 'cmglkop5c0001le04bq574y6c' // The stuck PO
    
    console.log('🔍 Finding PO:', poId)
    
    // First, let's see all recent POs
    const recentPOs = await prisma.purchaseOrder.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 2 * 60 * 60 * 1000) // Last 2 hours
        }
      },
      include: {
        lineItems: true,
        productDrafts: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 10
    })
    
    console.log(`\n📋 Found ${recentPOs.length} recent POs:`)
    recentPOs.forEach((p, i) => {
      console.log(`${i + 1}. ${p.id}`)
      console.log(`   Number: ${p.number || 'N/A'}`)
      console.log(`   Status: ${p.status}`)
      console.log(`   Confidence: ${p.confidence}`)
      console.log(`   Line Items: ${p.lineItems?.length || 0}`)
      console.log(`   Product Drafts: ${p.productDrafts?.length || 0}`)
      console.log(`   Created: ${p.createdAt}`)
      console.log('')
    })
    
    // Find the specific PO
    const po = await prisma.purchaseOrder.findUnique({
      where: {
        id: poId
      },
      include: {
        lineItems: true,
        productDrafts: true
      }
    })
    
    if (!po) {
      console.log('❌ PO not found')
      return
    }
    
    console.log('✅ Found PO:')
    console.log('   ID:', po.id)
    console.log('   Status:', po.status)
    console.log('   Line Items:', po.lineItems?.length || 0)
    console.log('   Product Drafts:', po.productDrafts?.length || 0)
    console.log('')
    
    // Check if we have line items and product drafts
    if (po.lineItems && po.lineItems.length > 0 && po.status === 'processing') {
      console.log('🔧 PO has data but stuck at processing status')
      console.log('🎯 Manually updating status to review_needed...')
      
      // Update the PO status directly
      await prisma.purchaseOrder.update({
        where: { id: po.id },
        data: {
          status: po.confidence && po.confidence >= 0.8 ? 'completed' : 'review_needed',
          jobStatus: 'completed',
          jobCompletedAt: new Date(),
          processingNotes: `Manual status update - workflow appeared stuck. ${po.lineItems.length} line items processed.`,
          updatedAt: new Date()
        }
      })
      
      console.log('✅ Status updated successfully!')
      console.log(`   New status: ${po.confidence && po.confidence >= 0.8 ? 'completed' : 'review_needed'}`)
      
      // Also update the workflow if it exists
      const workflow = await prisma.workflowExecution.findFirst({
        where: { purchaseOrderId: po.id },
        orderBy: { createdAt: 'desc' }
      })
      
      if (workflow) {
        await prisma.workflowExecution.update({
          where: { id: workflow.id },
          data: {
            status: 'completed',
            currentStage: 'status_update',
            progressPercent: 100,
            completedAt: new Date(),
            updatedAt: new Date()
          }
        })
        console.log('✅ Workflow also updated')
      }
    } else if (po.lineItems && po.lineItems.length === 0) {
      console.log('⚠️ PO has no line items - workflow may have failed during database save')
      console.log('❌ Cannot fix automatically - needs investigation')
    } else {
      console.log('✅ PO status looks okay:', po.status)
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

fixStuckPO()
