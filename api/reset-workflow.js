/**
 * Reset Failed Workflow
 * Resets a failed workflow back to pending so it can be retried
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function resetWorkflow(workflowId) {
  try {
    console.log(`\n🔄 Resetting workflow: ${workflowId}`)
    
    const workflow = await prisma.workflowExecution.findUnique({
      where: { workflowId }
    })

    if (!workflow) {
      console.log(`❌ Workflow not found: ${workflowId}`)
      return
    }

    console.log(`📊 Current status: ${workflow.status}`)
    console.log(`📊 Current stage: ${workflow.currentStage || 'none'}`)
    console.log(`📊 Error: ${workflow.errorMessage || 'none'}`)

    // Reset to pending
    const updated = await prisma.workflowExecution.update({
      where: { workflowId },
      data: {
        status: 'pending',
        currentStage: null,
        progressPercent: 0,
        errorMessage: null,
        completedAt: null,
        stagesCompleted: 0
      }
    })

    console.log(`\n✅ Workflow reset to pending`)
    console.log(`📊 New status: ${updated.status}`)
    console.log(`📊 Progress: ${updated.progressPercent}%`)

  } catch (error) {
    console.error(`❌ Error resetting workflow:`, error)
  } finally {
    await prisma.$disconnect()
  }
}

const workflowId = process.argv[2]
if (!workflowId) {
  console.error('Usage: node reset-workflow.js <workflowId>')
  process.exit(1)
}

resetWorkflow(workflowId)
