import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkWorkflowMetadata() {
  const workflow = await prisma.workflowExecution.findFirst({
    where: { workflowId: 'wf_1760457694989_cmgqr22u' }
  })
  
  console.log('Full workflow record:')
  console.log(JSON.stringify(workflow, null, 2))
  
  await prisma.$disconnect()
}

checkWorkflowMetadata()
