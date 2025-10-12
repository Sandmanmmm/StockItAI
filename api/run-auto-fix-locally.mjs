import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function runAutoFix() {
  try {
    console.log('🔧 Running auto-fix for stuck POs...\n')
    
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    
    const stuckPOs = await prisma.purchaseOrder.findMany({
      where: {
        status: 'processing',
        updatedAt: {
          lt: fiveMinutesAgo
        }
      },
      include: {
        lineItems: true
      },
      take: 10
    })
    
    if (stuckPOs.length === 0) {
      console.log('✅ No stuck POs found')
      return { fixed: 0 }
    }
    
    console.log(`📋 Found ${stuckPOs.length} potentially stuck POs\n`)
    
    let fixedCount = 0
    
    for (const po of stuckPOs) {
      if (po.lineItems && po.lineItems.length > 0) {
        console.log(`🔧 Fixing stuck PO ${po.id}:`)
        console.log(`   Number: ${po.number || 'N/A'}`)
        console.log(`   Line Items: ${po.lineItems.length}`)
        console.log(`   Confidence: ${po.confidence}`)
        console.log(`   Age: ${Math.round((Date.now() - po.updatedAt.getTime()) / 1000)}s`)
        
        const finalStatus = (po.confidence && po.confidence >= 0.8) ? 'completed' : 'review_needed'
        
        // Update PO
        await prisma.purchaseOrder.update({
          where: { id: po.id },
          data: {
            status: finalStatus,
            jobStatus: 'completed',
            jobCompletedAt: new Date(),
            processingNotes: `Auto-recovered from stuck state. ${po.lineItems.length} line items processed. Confidence: ${Math.round((po.confidence || 0) * 100)}%`,
            updatedAt: new Date()
          }
        })
        
        console.log(`✅ Updated PO ${po.id} status to: ${finalStatus}`)
        
        // Update ALL workflows
        const workflows = await prisma.workflowExecution.findMany({
          where: { 
            purchaseOrderId: po.id,
            status: { in: ['pending', 'processing'] }
          }
        })
        
        console.log(`📋 Found ${workflows.length} active workflow(s) to complete`)
        
        for (const workflow of workflows) {
          console.log(`   🔄 Updating workflow ${workflow.workflowId} (db id: ${workflow.id})...`)
          try {
            await prisma.workflowExecution.update({
              where: { id: workflow.id },
              data: {
                status: 'completed',
                currentStage: 'status_update',
                progressPercent: 100,
                stagesCompleted: workflow.stagesTotal || 4,
                completedAt: new Date(),
                updatedAt: new Date(),
                metadata: {
                  ...(workflow.metadata || {}),
                  autoFixApplied: true,
                  autoFixReason: 'PO had data but workflow stuck >5 minutes',
                  autoFixedAt: new Date().toISOString()
                }
              }
            })
            console.log(`   ✅ Completed workflow ${workflow.workflowId}`)
          } catch (workflowError) {
            console.error(`   ❌ Failed to update workflow ${workflow.workflowId}:`, workflowError.message)
            throw workflowError
          }
        }
        
        console.log(`🎉 Fixed PO ${po.id} (${finalStatus}, ${workflows.length} workflows)\n`)
        fixedCount++
      }
    }
    
    console.log(`\n✅ Auto-fix complete: ${fixedCount} PO(s) fixed`)
    return { fixed: fixedCount }
    
  } catch (error) {
    console.error('❌ Auto-fix error:', error.message)
    console.error(error.stack)
    throw error
  }
}

runAutoFix()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error('Fatal error:', error)
    await prisma.$disconnect()
    process.exit(1)
  })
