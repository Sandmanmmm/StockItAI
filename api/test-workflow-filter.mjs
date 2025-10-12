import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

try {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
  
  // Test the query with the line items filter
  console.log('\n🔍 Testing stuck workflows query WITH line items filter:')
  const stuckWorkflowsFiltered = await prisma.workflowExecution.findMany({
    where: {
      status: 'processing',
      updatedAt: {
        lt: fiveMinutesAgo
      },
      purchaseOrder: {
        lineItems: {
          none: {}
        }
      }
    },
    include: {
      purchaseOrder: {
        include: {
          lineItems: true
        }
      }
    },
    take: 10
  })
  
  console.log(`Found ${stuckWorkflowsFiltered.length} workflows`)
  stuckWorkflowsFiltered.forEach((w) => {
    console.log(`  - ${w.workflowId}: PO ${w.purchaseOrderId} (${w.purchaseOrder?.lineItems?.length || 0} line items)`)
  })
  
  // Test the query WITHOUT the line items filter
  console.log('\n🔍 Testing stuck workflows query WITHOUT line items filter:')
  const stuckWorkflowsUnfiltered = await prisma.workflowExecution.findMany({
    where: {
      status: 'processing',
      updatedAt: {
        lt: fiveMinutesAgo
      }
    },
    include: {
      purchaseOrder: {
        include: {
          lineItems: true
        }
      }
    },
    take: 10
  })
  
  console.log(`Found ${stuckWorkflowsUnfiltered.length} workflows`)
  stuckWorkflowsUnfiltered.forEach((w) => {
    console.log(`  - ${w.workflowId}: PO ${w.purchaseOrderId} (${w.purchaseOrder?.lineItems?.length || 0} line items)`)
  })
  
} catch (error) {
  console.error('Error:', error.message)
  console.error(error.stack)
} finally {
  await prisma.$disconnect()
}
