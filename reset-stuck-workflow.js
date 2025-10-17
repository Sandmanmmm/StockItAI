import { db } from './api/src/lib/db.js'

async function resetWorkflow() {
  const prisma = await db.getClient()
  
  try {
    const workflowId = 'wf_1760577986789_cmgsqock'
    
    console.log(`\n🔄 Resetting workflow: ${workflowId}\n`)
    
    // Reset workflow to pending
    const updated = await prisma.workflowExecution.update({
      where: { workflowId },
      data: {
        status: 'pending',
        currentStage: null,
        progressPercent: 0,
        errorMessage: null,
        completedAt: null,
        updatedAt: new Date()
      }
    })
    
    console.log(`✅ Workflow reset successfully!`)
    console.log(`   Status: ${updated.status}`)
    console.log(`   Stage: ${updated.currentStage}`)
    console.log(`   Progress: ${updated.progressPercent}%`)
    console.log(`\nWorkflow is now ready for clean execution.`)
    console.log(`Wait ~3 minutes for Vercel deployment, then cron will pick it up.`)
    
  } catch (error) {
    console.error(`❌ Error:`, error.message)
  } finally {
    await prisma.$disconnect()
  }
}

resetWorkflow()
