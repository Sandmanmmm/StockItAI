// Check workflow metadata to understand what's stored
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function inspectWorkflowMetadata() {
  try {
    console.log('\n🔍 Inspecting recent workflow metadata...\n')
    
    const workflows = await prisma.workflowExecution.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 5
    })
    
    for (const wf of workflows) {
      console.log(`\n📋 Workflow ID: ${wf.workflowId}`)
      console.log(`   DB ID: ${wf.id}`)
      console.log(`   Status: ${wf.status}`)
      console.log(`   Stage: ${wf.currentStage}`)
      console.log(`   Retry: ${wf.retryCount}`)
      console.log(`   Error: ${wf.error || 'None'}`)
      
      if (wf.metadata) {
        const meta = typeof wf.metadata === 'string' ? JSON.parse(wf.metadata) : wf.metadata
        console.log(`   Metadata:`, JSON.stringify(meta, null, 2))
      } else {
        console.log(`   Metadata: (empty)`)
      }
      
      // Try to find related PO by searching for this workflow ID in uploads
      const upload = await prisma.upload.findFirst({
        where: {
          workflowId: wf.workflowId
        },
        select: {
          id: true,
          fileName: true,
          purchaseOrderId: true,
          purchaseOrder: {
            select: {
              number: true,
              status: true
            }
          }
        }
      })
      
      if (upload) {
        console.log(`   Related PO: ${upload.purchaseOrder?.number} (${upload.purchaseOrder?.status})`)
        console.log(`   File: ${upload.fileName}`)
      } else {
        console.log(`   Related PO: (not found in uploads)`)
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

inspectWorkflowMetadata()
