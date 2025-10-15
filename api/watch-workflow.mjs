import db from './src/lib/db.js'

/**
 * Watch Workflow Progress
 * Continuously monitors a specific workflow until completion
 * 
 * Usage: node watch-workflow.mjs <workflowId>
 */

async function watchWorkflow(workflowId) {
  console.log(`\n👁️  WATCHING WORKFLOW: ${workflowId}`)
  console.log(`${'='.repeat(60)}\n`)
  console.log(`⏳ Checking status every 5 seconds...`)
  console.log(`   Press Ctrl+C to stop\n`)

  const prisma = await db.getClient()
  let lastStatus = ''
  let lastStage = ''
  let checkCount = 0

  const checkStatus = async () => {
    try {
      checkCount++
      
      const workflow = await prisma.workflowExecution.findFirst({
        where: { workflowId: workflowId },
        include: {
          stages: {
            orderBy: { stageOrder: 'asc' }
          }
        }
      })

      if (!workflow) {
        console.error(`\n❌ Workflow not found: ${workflowId}`)
        process.exit(1)
      }

      const elapsed = Date.now() - new Date(workflow.startedAt).getTime()
      const elapsedMin = Math.floor(elapsed / 60000)
      const elapsedSec = Math.floor((elapsed % 60000) / 1000)
      const timestamp = new Date().toISOString().substring(11, 19)

      // Show update if status or stage changed
      if (workflow.status !== lastStatus || workflow.currentStage !== lastStage) {
        console.log(`[${timestamp}] ${workflow.currentStage?.padEnd(25) || 'N/A'.padEnd(25)} | ${workflow.status.padEnd(12)} | ${elapsedMin}m ${elapsedSec}s | ${workflow.progressPercent}%`)
        lastStatus = workflow.status
        lastStage = workflow.currentStage
      } else if (checkCount % 6 === 0) {
        // Show periodic update every 30 seconds
        console.log(`[${timestamp}] ${workflow.currentStage?.padEnd(25) || 'N/A'.padEnd(25)} | ${workflow.status.padEnd(12)} | ${elapsedMin}m ${elapsedSec}s | ${workflow.progressPercent}% (checking...)`)
      }

      // Check if completed
      if (workflow.status === 'completed') {
        const duration = workflow.completedAt.getTime() - workflow.startedAt.getTime()
        const durationMin = Math.floor(duration / 60000)
        const durationSec = Math.floor((duration % 60000) / 1000)

        console.log(`\n${'='.repeat(60)}`)
        console.log(`✅ WORKFLOW COMPLETED!`)
        console.log(`${'='.repeat(60)}`)
        console.log(`Workflow ID:      ${workflow.workflowId}`)
        console.log(`Total Duration:   ${durationMin}m ${durationSec}s`)
        console.log(`Expected:         3-5 minutes`)
        
        if (durationMin <= 5) {
          console.log(`Performance:      ✅ EXCELLENT - Within target!`)
        } else if (durationMin <= 10) {
          console.log(`Performance:      ⚠️  ACCEPTABLE - Better than legacy`)
        } else {
          console.log(`Performance:      ❌ TOO SLOW - Not meeting goals`)
        }

        console.log(`\n📋 STAGE SUMMARY:`)
        if (workflow.stages && workflow.stages.length > 0) {
          workflow.stages.forEach(stage => {
            const statusIcon = stage.status === 'completed' ? '✅' : 
                              stage.status === 'failed' ? '❌' : '⏸️'
            const stageDuration = stage.duration 
              ? `${Math.floor(stage.duration / 60000)}m ${Math.floor((stage.duration % 60000) / 1000)}s`
              : 'N/A'
            console.log(`   ${statusIcon} ${stage.stageName.padEnd(25)} ${stageDuration}`)
          })
        }

        console.log(`\n📊 Next Steps:`)
        console.log(`   1. Analyze: node analyze-test-workflow.mjs ${workflow.id}`)
        console.log(`   2. Document results in PHASE_2_TEST_RESULTS.md`)
        
        clearInterval(interval)
        process.exit(0)
      }

      // Check if failed
      if (workflow.status === 'failed') {
        console.log(`\n${'='.repeat(60)}`)
        console.log(`❌ WORKFLOW FAILED`)
        console.log(`${'='.repeat(60)}`)
        console.log(`Error:            ${workflow.errorMessage || 'Unknown'}`)
        console.log(`Failed Stage:     ${workflow.failedStage || 'Unknown'}`)
        console.log(`\n📋 Check Vercel logs for details`)
        
        clearInterval(interval)
        process.exit(1)
      }

      // Timeout after 15 minutes
      if (elapsed > 15 * 60 * 1000) {
        console.log(`\n⏰ TIMEOUT - Workflow taking longer than 15 minutes`)
        console.log(`   Current stage: ${workflow.currentStage}`)
        console.log(`   Status: ${workflow.status}`)
        console.log(`   This may indicate a problem - check Vercel logs`)
        
        clearInterval(interval)
        process.exit(1)
      }

    } catch (error) {
      console.error(`\n❌ Error checking workflow:`, error.message)
    }
  }

  // Initial check
  await checkStatus()

  // Check every 5 seconds
  const interval = setInterval(checkStatus, 5000)
}

const workflowId = process.argv[2]

if (!workflowId) {
  console.error('❌ Usage: node watch-workflow.mjs <workflowId>')
  console.error('   Example: node watch-workflow.mjs wf_1760496971276_cmgrefwl')
  process.exit(1)
}

watchWorkflow(workflowId).catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
