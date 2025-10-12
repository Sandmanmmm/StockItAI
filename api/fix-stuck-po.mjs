import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const poId = process.argv[2]

if (!poId) {
  console.error('Usage: node fix-stuck-po.mjs <poId>')
  process.exit(1)
}

try {
  console.log(`\n🔧 Manually fixing stuck PO: ${poId}\n`)
  
  // Get PO details
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: {
      lineItems: true
    }
  })
  
  if (!po) {
    console.error(`❌ PO not found: ${poId}`)
    process.exit(1)
  }
  
  console.log(`📋 PO Details:`)
  console.log(`   Number: ${po.number || 'N/A'}`)
  console.log(`   Status: ${po.status}`)
  console.log(`   Job Status: ${po.jobStatus}`)
  console.log(`   Line Items: ${po.lineItems.length}`)
  console.log(`   Confidence: ${po.confidence}`)
  
  if (po.lineItems.length === 0) {
    console.error(`\n❌ PO has no line items - cannot auto-fix`)
    process.exit(1)
  }
  
  // Determine final status
  const finalStatus = (po.confidence && po.confidence >= 0.8) ? 'completed' : 'review_needed'
  
  console.log(`\n📊 Will update PO status to: ${finalStatus}`)
  
  // Update PO
  const updatedPO = await prisma.purchaseOrder.update({
    where: { id: poId },
    data: {
      status: finalStatus,
      jobStatus: 'completed',
      jobCompletedAt: new Date(),
      processingNotes: `Manually fixed from stuck state. ${po.lineItems.length} line items processed. Confidence: ${Math.round((po.confidence || 0) * 100)}%`,
      updatedAt: new Date()
    }
  })
  
  console.log(`✅ PO status updated to: ${updatedPO.status}`)
  
  // Update ALL workflows for this PO
  const workflows = await prisma.workflowExecution.findMany({
    where: { 
      purchaseOrderId: poId,
      status: { in: ['pending', 'processing'] }
    }
  })
  
  console.log(`\n📋 Found ${workflows.length} active workflow(s) to complete`)
  
  for (const workflow of workflows) {
    await prisma.workflowExecution.update({
      where: { id: workflow.id },
      data: {
        status: 'completed',
        currentStage: 'status_update',
        progressPercent: 100,
        stagesCompleted: workflow.stagesTotal || 4,
        completedAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          ...(workflow.metadata || {}),
          manualFixApplied: true,
          manualFixReason: 'PO had data but workflow stuck',
          manualFixedAt: new Date().toISOString()
        }
      }
    })
    console.log(`   ✅ Completed workflow ${workflow.workflowId} (${workflow.currentStage} -> status_update)`)
  }
  
  console.log(`\n🎉 Successfully fixed PO ${poId}!`)
  console.log(`   Final status: ${finalStatus}`)
  console.log(`   Workflows completed: ${workflows.length}`)
  
} catch (error) {
  console.error('\n❌ Error:', error.message)
  console.error(error.stack)
  process.exit(1)
} finally {
  await prisma.$disconnect()
}
