import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const poId = 'cmgna8jjx0001jm04qh4nfblg'

try {
  const workflows = await prisma.workflowExecution.findMany({
    where: { 
      purchaseOrderId: poId,
      status: { in: ['pending', 'processing'] }
    }
  })
  
  console.log(`\nFound ${workflows.length} active workflows for PO ${poId}:\n`)
  
  workflows.forEach((w, i) => {
    console.log(`${i + 1}. ${w.workflowId}`)
    console.log(`   Database ID: ${w.id}`)
    console.log(`   Status: ${w.status}`)
    console.log(`   Stage: ${w.currentStage}`)
    console.log(`   Updated: ${w.updatedAt.toISOString()}`)
    console.log()
  })
  
} catch (error) {
  console.error('Error:', error.message)
} finally {
  await prisma.$disconnect()
}
