import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const poId = process.argv[2] || 'cmgna8jjx0001jm04qh4nfblg'

try {
  console.log(`\n🔍 Checking workflows for PO: ${poId}\n`)
  
  const workflows = await prisma.workflowExecution.findMany({
    where: { purchaseOrderId: poId },
    select: {
      workflowId: true,
      status: true,
      currentStage: true,
      progressPercent: true,
      metadata: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: { createdAt: 'asc' }
  })
  
  console.log(`Found ${workflows.length} workflows:\n`)
  
  workflows.forEach((w, i) => {
    console.log(`Workflow ${i + 1}:`)
    console.log(`  ID: ${w.workflowId}`)
    console.log(`  Status: ${w.status}`)
    console.log(`  Stage: ${w.currentStage}`)
    console.log(`  Progress: ${w.progressPercent}%`)
    console.log(`  Created: ${w.createdAt.toISOString()}`)
    console.log(`  Updated: ${w.updatedAt.toISOString()}`)
    const age = Math.round((Date.now() - w.updatedAt.getTime()) / 1000)
    console.log(`  Age: ${age}s`)
    if (w.metadata) {
      console.log(`  Metadata:`, JSON.stringify(w.metadata, null, 4))
    }
    console.log()
  })
  
  // Check the PO status too
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    select: {
      status: true,
      jobStatus: true,
      updatedAt: true
    }
  })
  
  console.log(`PO Status:`)
  console.log(`  Status: ${po.status}`)
  console.log(`  Job Status: ${po.jobStatus}`)
  console.log(`  Updated: ${po.updatedAt.toISOString()}`)
  
} catch (error) {
  console.error('Error:', error.message)
} finally {
  await prisma.$disconnect()
}
