import { db } from './src/lib/db.js'

/**
 * Real-Time Workflow Monitor for Test Merchant
 * 
 * Monitors a specific merchant for new workflows and tracks their progress
 * in real-time. Detects when workflows start, shows stage progression,
 * and reports final results with timing.
 * 
 * Usage: node monitor-test-merchant.mjs <merchantId>
 */

async function monitorTestMerchant(merchantId) {
  console.log(`📊 Real-Time Workflow Monitor`)
  console.log(`==============================`)
  console.log(`Merchant ID: ${merchantId}`)
  console.log(`Started:     ${new Date().toISOString()}`)
  console.log(`Mode:        Watching for new workflows...`)
  console.log(`Timeout:     15 minutes\n`)

  let lastWorkflowId = null
  let checkCount = 0
  let workflowDetected = false

  const interval = setInterval(async () => {
    checkCount++
    
    try {
      // Find most recent workflow
      const workflow = await db.workflowExecution.findFirst({
        where: { merchantId: merchantId },
        orderBy: { createdAt: 'desc' },
        include: {
          upload: {
            select: { 
              fileName: true,
              fileSize: true,
              fileType: true
            }
          }
        }
      })

      if (!workflow) {
        if (checkCount % 12 === 0) { // Show message every minute
          console.log(`⏳ [${new Date().toISOString()}] Waiting for workflow... (checked ${checkCount} times, ${Math.floor(checkCount * 5 / 60)} min)`)
        }
        return
      }

      // New workflow detected
      if (workflow.id !== lastWorkflowId) {
        lastWorkflowId = workflow.id
        workflowDetected = true
        console.log(`\n🆕 NEW WORKFLOW DETECTED!`)
        console.log(`================================`)
        console.log(`   Workflow ID:  ${workflow.id}`)
        console.log(`   File Name:    ${workflow.upload?.fileName || 'unknown'}`)
        console.log(`   File Size:    ${workflow.upload?.fileSize ? (workflow.upload.fileSize / 1024).toFixed(2) + ' KB' : 'unknown'}`)
        console.log(`   File Type:    ${workflow.upload?.fileType || 'unknown'}`)
        console.log(`   Started:      ${workflow.createdAt.toISOString()}`)
        console.log(`   Stage:        ${workflow.currentStage || 'not_started'}`)
        console.log(`   Status:       ${workflow.status}`)
        console.log(`================================\n`)
      }

      // Calculate elapsed time
      const elapsed = Date.now() - workflow.createdAt.getTime()
      const elapsedMin = Math.floor(elapsed / 60000)
      const elapsedSec = Math.floor((elapsed % 60000) / 1000)

      // Show progress update
      const timestamp = new Date().toISOString().substring(11, 19)
      const stageDisplay = (workflow.currentStage || 'pending').padEnd(20, ' ')
      const statusDisplay = workflow.status.padEnd(12, ' ')
      const timeDisplay = `${elapsedMin}m ${elapsedSec}s`.padEnd(10, ' ')
      
      console.log(`[${timestamp}] ${stageDisplay} | ${statusDisplay} | ${timeDisplay}`)

      // Check if completed
      if (workflow.status === 'completed') {
        console.log(`\n`)
        console.log(`✅ ========================================`)
        console.log(`✅          WORKFLOW COMPLETED!           `)
        console.log(`✅ ========================================`)
        console.log(`   Workflow ID:      ${workflow.id}`)
        console.log(`   Total Duration:   ${elapsedMin}m ${elapsedSec}s`)
        console.log(`   Expected:         3-5 minutes`)
        
        let performanceRating = ''
        if (elapsedMin <= 5) {
          performanceRating = '✅ EXCELLENT - Within target!'
        } else if (elapsedMin <= 10) {
          performanceRating = '⚠️  ACCEPTABLE - Slower than target but better than legacy'
        } else {
          performanceRating = '❌ TOO SLOW - Not meeting performance goals'
        }
        
        console.log(`   Performance:      ${performanceRating}`)
        
        if (workflow.completedAt) {
          const actualDuration = workflow.completedAt.getTime() - workflow.createdAt.getTime()
          const actualMin = Math.floor(actualDuration / 60000)
          const actualSec = Math.floor((actualDuration % 60000) / 1000)
          console.log(`   Actual Duration:  ${actualMin}m ${actualSec}s`)
          
          // Calculate improvement vs legacy
          const legacyDurationSec = 38 * 60 // 38 minutes
          const actualDurationSec = actualDuration / 1000
          const improvement = ((legacyDurationSec - actualDurationSec) / legacyDurationSec * 100).toFixed(1)
          const speedup = (legacyDurationSec / actualDurationSec).toFixed(1)
          
          console.log(`   Improvement:      ${improvement}% faster than legacy (38 min)`)
          console.log(`   Speedup Factor:   ${speedup}x`)
        }
        
        console.log(`\n📋 Next Steps:`)
        console.log(`   1. Analyze results: node analyze-test-workflow.mjs ${workflow.id}`)
        console.log(`   2. Verify data quality in database`)
        console.log(`   3. Check Shopify order was created`)
        console.log(`   4. Document results in PHASE_2_TEST_RESULTS.md`)
        
        clearInterval(interval)
        await db.$disconnect()
        process.exit(0)
      }

      // Check if failed
      if (workflow.status === 'failed') {
        console.log(`\n`)
        console.log(`❌ ========================================`)
        console.log(`❌          WORKFLOW FAILED!              `)
        console.log(`❌ ========================================`)
        console.log(`   Workflow ID:      ${workflow.id}`)
        console.log(`   Error Message:    ${workflow.errorMessage || 'Unknown error'}`)
        console.log(`   Failed At Stage:  ${workflow.currentStage}`)
        console.log(`   Duration:         ${elapsedMin}m ${elapsedSec}s`)
        console.log(`   Created:          ${workflow.createdAt.toISOString()}`)
        console.log(`   Failed:           ${workflow.updatedAt.toISOString()}`)
        
        console.log(`\n🔍 Debugging Steps:`)
        console.log(`   1. Check Vercel logs: vercel logs --prod --filter "${workflow.id}"`)
        console.log(`   2. Review error message above`)
        console.log(`   3. Check database for partial data`)
        console.log(`   4. Disable sequential mode: node disable-sequential-for-merchant.mjs ${merchantId}`)
        
        clearInterval(interval)
        await db.$disconnect()
        process.exit(1)
      }

      // Check for timeout (stuck workflow)
      if (elapsed > 600000 && workflow.status === 'processing') {
        console.log(`\n⚠️  ========================================`)
        console.log(`⚠️           WORKFLOW TIMEOUT!            `)
        console.log(`⚠️  ========================================`)
        console.log(`   Workflow is still processing after 10 minutes`)
        console.log(`   This may indicate a performance issue`)
        console.log(`   Current Stage:    ${workflow.currentStage}`)
        console.log(`   Current Status:   ${workflow.status}`)
        console.log(`   Elapsed Time:     ${elapsedMin}m ${elapsedSec}s`)
        console.log(`\n   Continuing to monitor... (will timeout at 15 min)`)
      }

    } catch (error) {
      console.error(`❌ [${new Date().toISOString()}] Error monitoring workflow:`, error.message)
    }
  }, 5000) // Check every 5 seconds

  // Timeout after 15 minutes
  setTimeout(() => {
    console.log(`\n⏰ ========================================`)
    console.log(`⏰        MONITORING TIMEOUT (15 min)      `)
    console.log(`⏰ ========================================`)
    if (!workflowDetected) {
      console.log(`   No workflow was detected for this merchant`)
      console.log(`   The merchant may not have uploaded a PO yet`)
      console.log(`\n💡 Options:`)
      console.log(`   1. Run this script again later`)
      console.log(`   2. Manually upload a test PO as this merchant`)
      console.log(`   3. Choose a different test merchant with more activity`)
    } else {
      console.log(`   Workflow did not complete in expected timeframe`)
      console.log(`   Last workflow ID: ${lastWorkflowId}`)
      console.log(`\n💡 Options:`)
      console.log(`   1. Check workflow status manually in database`)
      console.log(`   2. Review Vercel logs for errors`)
      console.log(`   3. Continue monitoring: run this script again`)
    }
    clearInterval(interval)
    db.$disconnect().then(() => process.exit(1))
  }, 900000) // 15 minutes
}

// Get merchantId from command line
const merchantId = process.argv[2]

if (!merchantId) {
  console.error('❌ Usage: node monitor-test-merchant.mjs <merchantId>')
  console.error('   Example: node monitor-test-merchant.mjs clxxx...')
  console.error('\n💡 Tip: Get merchant ID from identify-test-merchant.mjs')
  process.exit(1)
}

console.log('Starting workflow monitor...\n')

monitorTestMerchant(merchantId).catch(error => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
