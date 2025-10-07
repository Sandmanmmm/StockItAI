/**
 * Reset Failed Workflows Script
 * 
 * Resets failed workflows back to 'pending' status so they can be retried by the cron job.
 * Also resets associated POs to 'pending' status.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function resetFailedWorkflows() {
  try {
    console.log(`🔍 Finding failed workflows...`)
    
    // Get all failed workflows
    const failedWorkflows = await prisma.workflowExecution.findMany({
      where: { status: 'failed' },
      orderBy: { createdAt: 'desc' }
    })
    
    console.log(`📋 Found ${failedWorkflows.length} failed workflows`)
    
    if (failedWorkflows.length === 0) {
      console.log(`✅ No failed workflows to reset`)
      return
    }
    
    // Reset workflows to pending
    console.log(`🔄 Resetting workflows to 'pending' status...`)
    const workflowUpdate = await prisma.workflowExecution.updateMany({
      where: { status: 'failed' },
      data: {
        status: 'pending',
        currentStage: null,
        errorMessage: null,
        failedStage: null,
        completedAt: null,
        progressPercent: 0
      }
    })
    
    console.log(`✅ Reset ${workflowUpdate.count} workflows to pending`)
    
    // Get PO IDs from failed workflows
    const poIds = failedWorkflows
      .map(w => w.purchaseOrderId)
      .filter(id => id !== null)
    
    console.log(`🔄 Resetting ${poIds.length} associated POs...`)
    
    // Reset POs to pending
    const poUpdate = await prisma.purchaseOrder.updateMany({
      where: {
        id: { in: poIds },
        status: 'processing'
      },
      data: {
        status: 'pending'
      }
    })
    
    console.log(`✅ Reset ${poUpdate.count} POs to pending`)
    
    // Also reset uploads to pending
    const uploadIds = failedWorkflows.map(w => w.uploadId).filter(id => id !== null)
    
    console.log(`🔄 Resetting ${uploadIds.length} associated uploads...`)
    
    const uploadUpdate = await prisma.upload.updateMany({
      where: {
        id: { in: uploadIds },
        status: { in: ['failed', 'processing'] }
      },
      data: {
        status: 'pending',
        errorMessage: null
      }
    })
    
    console.log(`✅ Reset ${uploadUpdate.count} uploads to pending`)
    
    console.log(`\n✅ ========== RESET COMPLETE ==========`)
    console.log(`📊 Summary:`)
    console.log(`   - Workflows reset: ${workflowUpdate.count}`)
    console.log(`   - POs reset: ${poUpdate.count}`)
    console.log(`   - Uploads reset: ${uploadUpdate.count}`)
    console.log(`\n🚀 Workflows will be picked up by the next cron run (within 1 minute)`)
    
  } catch (error) {
    console.error(`❌ Error resetting workflows:`, error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run the script
resetFailedWorkflows()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
