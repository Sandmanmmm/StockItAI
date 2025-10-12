import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

try {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
  
  const potentiallyStuckWorkflows = await prisma.workflowExecution.findMany({
    where: {
      status: 'processing',
      updatedAt: {
        lt: fiveMinutesAgo
      }
    },
    include: {
      purchaseOrder: {
        select: {
          id: true,
          status: true,
          _count: {
            select: { lineItems: true }
          }
        }
      }
    },
    orderBy: {
      createdAt: 'asc'
    },
    take: 10
  })
  
  console.log(`\n📋 Found ${potentiallyStuckWorkflows.length} potentially stuck workflows (>5min old):\n`)
  
  potentiallyStuckWorkflows.forEach((w, i) => {
    const age = Math.round((Date.now() - w.updatedAt.getTime()) / 1000)
    const hasLineItems = w.purchaseOrder?._count?.lineItems > 0
    const wouldSkip = hasLineItems
    
    console.log(`${i+1}. ${w.workflowId}`)
    console.log(`   PO: ${w.purchaseOrderId}`)
    console.log(`   Stage: ${w.currentStage}`)
    console.log(`   Age: ${age}s`)
    console.log(`   Line Items: ${w.purchaseOrder?._count?.lineItems || 0}`)
    console.log(`   Would Skip: ${wouldSkip ? '✅ YES (has line items)' : '❌ NO (no line items)'}`)
    console.log()
  })
  
  // Apply the filter
  const stuckWorkflows = potentiallyStuckWorkflows.filter(w => {
    if (!w.purchaseOrder) return true
    const po = w.purchaseOrder
    const hasLineItems = po._count.lineItems > 0
    return !hasLineItems // Only keep workflows without line items
  })
  
  console.log(`\n✅ After filtering: ${stuckWorkflows.length} workflows would be re-queued\n`)
  
  stuckWorkflows.forEach((w) => {
    console.log(`  - ${w.workflowId} (PO: ${w.purchaseOrderId})`)
  })
  
} catch (error) {
  console.error('Error:', error.message)
  console.error(error.stack)
} finally {
  await prisma.$disconnect()
}
