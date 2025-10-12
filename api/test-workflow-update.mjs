import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const testWorkflowId = 'wf_1760248045530_cmgna8k9'

try {
  console.log(`\n🔍 Testing workflowId lookup: ${testWorkflowId}\n`)
  
  // Try to find by workflowId (what completeWorkflow uses)
  const byWorkflowId = await prisma.workflowExecution.findUnique({
    where: { workflowId: testWorkflowId }
  })
  
  console.log('Query by workflowId:', byWorkflowId ? '✅ FOUND' : '❌ NOT FOUND')
  
  if (byWorkflowId) {
    console.log('  Database ID:', byWorkflowId.id)
    console.log('  Workflow ID:', byWorkflowId.workflowId)
    console.log('  Status:', byWorkflowId.status)
    console.log('  Current Stage:', byWorkflowId.currentStage)
  }
  
  // Try update (what completeWorkflow does)
  console.log('\n🔄 Testing update by workflowId...')
  
  try {
    const updated = await prisma.workflowExecution.update({
      where: { workflowId: testWorkflowId },
      data: {
        status: 'completed',
        currentStage: 'completed',
        progressPercent: 100,
        completedAt: new Date(),
        updatedAt: new Date()
      }
    })
    console.log('✅ Update succeeded!')
    console.log('  New status:', updated.status)
    console.log('  New stage:', updated.currentStage)
  } catch (updateError) {
    console.error('❌ Update failed:', updateError.message)
  }
  
} catch (error) {
  console.error('Error:', error.message)
  console.error(error.stack)
} finally {
  await prisma.$disconnect()
}
