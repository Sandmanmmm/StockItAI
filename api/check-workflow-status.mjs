import db from './src/lib/db.js'

/**
 * Check Workflow Status
 * Quick script to check the current status of a workflow
 * 
 * Usage: node check-workflow-status.mjs <workflowId>
 */

async function checkWorkflowStatus(workflowId) {
  try {
    const prisma = await db.getClient()
    
    // Find workflow by workflowId (not id)
    const workflow = await prisma.workflowExecution.findFirst({
      where: { 
        workflowId: workflowId 
      },
      include: {
        stages: {
          orderBy: { stageOrder: 'asc' }
        }
      }
    })

    if (!workflow) {
      console.error(`❌ Workflow not found: ${workflowId}`)
      console.log(`\n💡 Tip: Use the workflowId (e.g., wf_1760496971276_cmgrefwl)`)
      process.exit(1)
    }

    console.log(`\n📊 WORKFLOW STATUS`)
    console.log(`==================`)
    console.log(`Workflow ID:      ${workflow.workflowId}`)
    console.log(`Database ID:      ${workflow.id}`)
    console.log(`Status:           ${workflow.status}`)
    console.log(`Current Stage:    ${workflow.currentStage || 'N/A'}`)
    console.log(`Progress:         ${workflow.progressPercent}%`)
    console.log(`Stages Complete:  ${workflow.stagesCompleted}/${workflow.stagesTotal}`)
    console.log(`Created:          ${workflow.createdAt.toISOString()}`)
    console.log(`Started:          ${workflow.startedAt.toISOString()}`)
    console.log(`Completed:        ${workflow.completedAt?.toISOString() || 'Not yet'}`)
    
    if (workflow.completedAt) {
      const duration = workflow.completedAt.getTime() - workflow.startedAt.getTime()
      const minutes = Math.floor(duration / 60000)
      const seconds = Math.floor((duration % 60000) / 1000)
      console.log(`Duration:         ${minutes}m ${seconds}s`)
    }

    if (workflow.errorMessage) {
      console.log(`\n❌ ERROR:`)
      console.log(`   ${workflow.errorMessage}`)
      console.log(`   Failed Stage: ${workflow.failedStage || 'Unknown'}`)
    }

    // Show stage details
    if (workflow.stages && workflow.stages.length > 0) {
      console.log(`\n📋 STAGE DETAILS`)
      console.log(`================`)
      workflow.stages.forEach(stage => {
        const statusIcon = stage.status === 'completed' ? '✅' : 
                          stage.status === 'processing' ? '⏳' : 
                          stage.status === 'failed' ? '❌' : '⏸️'
        const stageDuration = stage.duration 
          ? `${Math.floor(stage.duration / 60000)}m ${Math.floor((stage.duration % 60000) / 1000)}s`
          : 'N/A'
        
        console.log(`${statusIcon} ${stage.stageName.padEnd(25)} | ${stage.status.padEnd(12)} | ${stageDuration}`)
        
        if (stage.errorMessage) {
          console.log(`   ⚠️  Error: ${stage.errorMessage}`)
        }
      })
    }

    // Show interpretation
    console.log(`\n💡 INTERPRETATION`)
    console.log(`=================`)
    if (workflow.status === 'completed') {
      console.log(`✅ Workflow completed successfully!`)
      console.log(`   Run: node analyze-test-workflow.mjs ${workflow.id}`)
    } else if (workflow.status === 'failed') {
      console.log(`❌ Workflow failed`)
      console.log(`   Check error message above and Vercel logs`)
    } else if (workflow.status === 'processing') {
      console.log(`⏳ Workflow is still processing...`)
      console.log(`   Current stage: ${workflow.currentStage}`)
      console.log(`   Run this script again to check progress`)
    } else {
      console.log(`⏸️  Workflow status: ${workflow.status}`)
      console.log(`   This may indicate the workflow is queued or stuck`)
    }

  } catch (error) {
    console.error('❌ Error checking workflow:', error.message)
    throw error
  }
}

const workflowId = process.argv[2]

if (!workflowId) {
  console.error('❌ Usage: node check-workflow-status.mjs <workflowId>')
  console.error('   Example: node check-workflow-status.mjs wf_1760496971276_cmgrefwl')
  process.exit(1)
}

checkWorkflowStatus(workflowId).catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
