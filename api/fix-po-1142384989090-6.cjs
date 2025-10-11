/**
 * Fix specific PO stuck in processing
 */

const { PrismaClient } = require('@prisma/client')

async function fixStuckPO() {
  const prisma = new PrismaClient()
  
  try {
    const po = await prisma.purchaseOrder.findFirst({
      where: { number: '1142384989090-6' },
      include: { lineItems: true }
    })
    
    if (!po) {
      console.log('PO not found')
      return
    }
    
    console.log(`Found PO: ${po.number}`)
    console.log(`  Status: ${po.status}`)
    console.log(`  Confidence: ${(po.confidence * 100).toFixed(1)}%`)
    console.log(`  Line Items: ${po.lineItems.length}`)
    
    if (po.status !== 'processing') {
      console.log(`✅ PO is not stuck (status: ${po.status})`)
      return
    }
    
    const finalStatus = (po.confidence >= 0.8) ? 'completed' : 'review_needed'
    
    console.log(`\n🔧 Fixing PO - changing status to: ${finalStatus}`)
    
    const updated = await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: {
        status: finalStatus,
        jobStatus: 'completed',
        jobCompletedAt: new Date(),
        processingNotes: `Auto-fixed from stuck "processing" state. ${po.lineItems.length} line items processed.`
      }
    })
    
    console.log(`✅ Fixed! New status: ${updated.status}`)
    
    // Update workflow
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
          completedAt: new Date()
        }
      })
      console.log(`✅ Workflow also updated`)
    }
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

fixStuckPO()
