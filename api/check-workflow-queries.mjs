import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const poId = process.argv[2] || 'cmgna8jjx0001jm04qh4nfblg'

try {
  // Check for pending workflows
  const pendingWorkflows = await prisma.workflowExecution.findMany({
    where: {
      purchaseOrderId: poId,
      status: 'pending'
    }
  })
  
  console.log(`\n📋 Pending workflows for PO ${poId}: ${pendingWorkflows.length}`)
  pendingWorkflows.forEach((w, i) => {
    console.log(`  ${i+1}. ${w.workflowId} - ${w.currentStage}`)
  })
  
  // Check for processing workflows
  const processingWorkflows = await prisma.workflowExecution.findMany({
    where: {
      purchaseOrderId: poId,
      status: 'processing'
    }
  })
  
  console.log(`\n⚙️ Processing workflows for PO ${poId}: ${processingWorkflows.length}`)
  processingWorkflows.forEach((w, i) => {
    const age = Math.round((Date.now() - w.updatedAt.getTime()) / 1000)
    console.log(`  ${i+1}. ${w.workflowId} - ${w.currentStage} (${age}s ago)`)
  })
  
  // Check for stuck workflows (>5min)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
  const stuckWorkflows = await prisma.workflowExecution.findMany({
    where: {
      purchaseOrderId: poId,
      status: 'processing',
      updatedAt: {
        lt: fiveMinutesAgo
      }
    }
  })
  
  console.log(`\n🐌 Stuck workflows (>5min) for PO ${poId}: ${stuckWorkflows.length}`)
  stuckWorkflows.forEach((w, i) => {
    const age = Math.round((Date.now() - w.updatedAt.getTime()) / 1000)
    console.log(`  ${i+1}. ${w.workflowId} - ${w.currentStage} (${age}s ago)`)
  })
  
  // Check PO line items
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: {
      lineItems: {
        select: { id: true, description: true }
      }
    }
  })
  
  console.log(`\n📦 PO has ${po.lineItems?.length || 0} line items`)
  
} catch (error) {
  console.error('Error:', error.message)
} finally {
  await prisma.$disconnect()
}
