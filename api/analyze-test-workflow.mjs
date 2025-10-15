import { db } from './src/lib/db.js'

/**
 * Analyze Test Workflow Results
 * 
 * Comprehensive analysis of a workflow execution including:
 * - Duration and performance metrics
 * - Data quality verification
 * - Comparison with legacy mode
 * - Success/failure determination
 * 
 * Usage: node analyze-test-workflow.mjs <workflowId>
 */

async function analyzeTestWorkflow(workflowId) {
  console.log(`🔍 Workflow Analysis Tool`)
  console.log(`=========================`)
  console.log(`Workflow ID: ${workflowId}`)
  console.log(`Analysis Time: ${new Date().toISOString()}\n`)

  try {
    const workflow = await db.workflowExecution.findUnique({
      where: { id: workflowId },
      include: {
        upload: {
          select: {
            fileName: true,
            fileSize: true,
            fileType: true,
            mimeType: true,
            createdAt: true
          }
        },
        purchaseOrder: {
          include: {
            lineItems: {
              select: {
                id: true,
                productName: true,
                quantity: true,
                unitCost: true
              }
            },
            supplier: {
              select: {
                name: true,
                email: true
              }
            }
          }
        }
      }
    })

    if (!workflow) {
      console.error(`❌ Workflow not found: ${workflowId}`)
      console.error(`   Please verify the workflow ID is correct`)
      process.exit(1)
    }

    // ============================================================
    // SECTION 1: WORKFLOW SUMMARY
    // ============================================================
    console.log(`📊 WORKFLOW SUMMARY`)
    console.log(`===================`)
    console.log(`Status:           ${workflow.status}`)
    console.log(`Current Stage:    ${workflow.currentStage || 'N/A'}`)
    console.log(`Merchant ID:      ${workflow.merchantId}`)
    console.log(`Created:          ${workflow.createdAt.toISOString()}`)
    console.log(`Started:          ${workflow.startedAt?.toISOString() || 'N/A'}`)
    console.log(`Completed:        ${workflow.completedAt?.toISOString() || 'In Progress'}`)

    // Calculate duration
    const duration = workflow.completedAt 
      ? workflow.completedAt.getTime() - workflow.createdAt.getTime()
      : Date.now() - workflow.createdAt.getTime()
    
    const durationMin = Math.floor(duration / 60000)
    const durationSec = Math.floor((duration % 60000) / 1000)

    console.log(`Duration:         ${durationMin}m ${durationSec}s`)
    console.log(`Expected:         3-5 minutes`)
    
    let performanceRating = ''
    let performanceIcon = ''
    if (durationMin <= 5) {
      performanceRating = 'EXCELLENT - Within target!'
      performanceIcon = '✅'
    } else if (durationMin <= 10) {
      performanceRating = 'ACCEPTABLE - Better than legacy'
      performanceIcon = '⚠️ '
    } else {
      performanceRating = 'TOO SLOW - Not meeting goals'
      performanceIcon = '❌'
    }
    
    console.log(`Performance:      ${performanceIcon} ${performanceRating}`)

    // Calculate improvement vs legacy (38 minutes)
    const legacyDurationSec = 38 * 60
    const actualDurationSec = duration / 1000
    const improvement = ((legacyDurationSec - actualDurationSec) / legacyDurationSec * 100).toFixed(1)
    const speedup = (legacyDurationSec / actualDurationSec).toFixed(1)
    
    console.log(`Improvement:      ${improvement}% faster than legacy (38 min)`)
    console.log(`Speedup Factor:   ${speedup}x`)

    if (workflow.errorMessage) {
      console.log(`\n❌ ERROR ENCOUNTERED:`)
      console.log(`   ${workflow.errorMessage}`)
    }

    // ============================================================
    // SECTION 2: FILE DETAILS
    // ============================================================
    console.log(`\n📁 FILE DETAILS`)
    console.log(`===============`)
    if (workflow.upload) {
      console.log(`File Name:        ${workflow.upload.fileName}`)
      console.log(`File Size:        ${(workflow.upload.fileSize / 1024).toFixed(2)} KB`)
      console.log(`File Type:        ${workflow.upload.fileType || 'N/A'}`)
      console.log(`MIME Type:        ${workflow.upload.mimeType || 'N/A'}`)
      console.log(`Uploaded:         ${workflow.upload.createdAt.toISOString()}`)
    } else {
      console.log(`⚠️  No upload record found`)
    }

    // ============================================================
    // SECTION 3: PURCHASE ORDER DATA
    // ============================================================
    console.log(`\n📦 PURCHASE ORDER DATA`)
    console.log(`======================`)
    if (workflow.purchaseOrder) {
      const po = workflow.purchaseOrder
      console.log(`✅ PO Created Successfully`)
      console.log(`PO Number:        ${po.poNumber || 'N/A'}`)
      console.log(`Supplier:         ${po.supplier?.name || 'N/A'}`)
      console.log(`Supplier Email:   ${po.supplier?.email || 'N/A'}`)
      console.log(`Line Items:       ${po.lineItems.length}`)
      console.log(`Total Amount:     $${po.totalAmount?.toFixed(2) || '0.00'}`)
      console.log(`Currency:         ${po.currency || 'USD'}`)
      console.log(`Status:           ${po.status}`)
      console.log(`Shopify Order:    ${po.shopifyOrderId || 'Not synced yet'}`)
      console.log(`Sync Status:      ${po.shopifySyncStatus || 'N/A'}`)
      console.log(`Synced At:        ${po.shopifySyncedAt?.toISOString() || 'N/A'}`)

      // Show line items summary
      if (po.lineItems.length > 0) {
        console.log(`\n   Line Items Summary:`)
        po.lineItems.forEach((item, i) => {
          console.log(`   ${i+1}. ${item.productName || 'Unknown'} - Qty: ${item.quantity || 0} @ $${item.unitCost?.toFixed(2) || '0.00'}`)
        })
      }

      // Data quality checks
      console.log(`\n   Data Quality Checks:`)
      console.log(`   ${po.poNumber ? '✅' : '❌'} PO Number present`)
      console.log(`   ${po.supplier ? '✅' : '❌'} Supplier linked`)
      console.log(`   ${po.lineItems.length > 0 ? '✅' : '❌'} Line items extracted`)
      console.log(`   ${po.totalAmount > 0 ? '✅' : '⚠️ '} Total amount calculated`)
      console.log(`   ${po.shopifyOrderId ? '✅' : '⚠️ '} Shopify order created`)

    } else {
      console.log(`❌ No PO created - workflow may have failed`)
    }

    // ============================================================
    // SECTION 4: COMPARISON WITH LEGACY MODE
    // ============================================================
    console.log(`\n📊 COMPARISON WITH LEGACY MODE`)
    console.log(`==============================`)
    
    const legacyWorkflows = await db.workflowExecution.findMany({
      where: {
        merchantId: workflow.merchantId,
        status: 'completed',
        createdAt: {
          lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Before sequential mode enabled
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        createdAt: true,
        completedAt: true
      }
    })

    if (legacyWorkflows.length > 0) {
      const avgLegacyDuration = legacyWorkflows.reduce((sum, w) => {
        return sum + (w.completedAt.getTime() - w.createdAt.getTime())
      }, 0) / legacyWorkflows.length

      const avgLegacyMin = Math.floor(avgLegacyDuration / 60000)
      const avgLegacySec = Math.floor((avgLegacyDuration % 60000) / 1000)
      const actualImprovement = ((avgLegacyDuration - duration) / avgLegacyDuration * 100).toFixed(1)
      const actualSpeedup = (avgLegacyDuration / duration).toFixed(1)

      console.log(`Legacy Mode (Avg):      ${avgLegacyMin}m ${avgLegacySec}s`)
      console.log(`Sequential Mode:        ${durationMin}m ${durationSec}s`)
      console.log(`Improvement:            ${actualImprovement}% faster`)
      console.log(`Speedup:                ${actualSpeedup}x`)
      console.log(`Sample Size:            ${legacyWorkflows.length} workflows`)

      // Show individual legacy workflows
      console.log(`\n   Recent Legacy Workflows:`)
      legacyWorkflows.forEach((w, i) => {
        const legacyDur = w.completedAt.getTime() - w.createdAt.getTime()
        const legacyMin = Math.floor(legacyDur / 60000)
        console.log(`   ${i+1}. ${w.id.substring(0, 20)}... - ${legacyMin} min`)
      })

    } else {
      console.log(`⚠️  No legacy workflows found for comparison`)
      console.log(`   Using standard 38-minute baseline`)
      console.log(`   Legacy Mode (Standard): 38 minutes`)
      console.log(`   Sequential Mode:        ${durationMin} minutes`)
      console.log(`   Improvement:            ${improvement}%`)
      console.log(`   Speedup:                ${speedup}x`)
    }

    // ============================================================
    // SECTION 5: STAGE-BY-STAGE ANALYSIS
    // ============================================================
    console.log(`\n⏱️  STAGE-BY-STAGE TIMING (Estimated)`)
    console.log(`====================================`)
    console.log(`Expected stage durations:`)
    console.log(`   1. AI Parsing:          ~90 seconds`)
    console.log(`   2. Database Save:       ~5 seconds`)
    console.log(`   3. Product Draft:       ~10 seconds`)
    console.log(`   4. Image Attachment:    ~30 seconds`)
    console.log(`   5. Shopify Sync:        ~45 seconds`)
    console.log(`   6. Status Update:       ~5 seconds`)
    console.log(`   TOTAL:                  ~185 seconds (3.1 min)`)
    console.log(`\n   Actual Duration:        ${durationMin}m ${durationSec}s (${Math.floor(duration/1000)}s)`)
    
    const overhead = Math.floor(duration/1000) - 185
    if (overhead > 0) {
      console.log(`   Overhead:               ${overhead}s`)
      console.log(`   ${overhead > 60 ? '⚠️' : 'ℹ️'}  This includes: startup time, network latency, database queries`)
    } else {
      console.log(`   ✅ Completed faster than expected!`)
    }

    // ============================================================
    // SECTION 6: RECOMMENDATIONS
    // ============================================================
    console.log(`\n💡 RECOMMENDATIONS`)
    console.log(`==================`)

    const issues = []
    const successes = []

    // Check workflow status
    if (workflow.status === 'completed') {
      successes.push('Workflow completed successfully')
    } else {
      issues.push(`Workflow status is ${workflow.status}, not completed`)
    }

    // Check duration
    if (durationMin <= 5) {
      successes.push('Duration within 3-5 minute target')
    } else if (durationMin <= 10) {
      issues.push('Duration acceptable but slower than 5-minute target')
    } else {
      issues.push('Duration significantly slower than expected')
    }

    // Check data quality
    if (workflow.purchaseOrder) {
      successes.push('PO created successfully')
      
      if (workflow.purchaseOrder.lineItems.length > 0) {
        successes.push(`${workflow.purchaseOrder.lineItems.length} line items extracted`)
      } else {
        issues.push('No line items extracted')
      }
      
      if (workflow.purchaseOrder.shopifyOrderId) {
        successes.push('Shopify order synced')
      } else {
        issues.push('Shopify order not created')
      }
    } else {
      issues.push('No PO created')
    }

    // Display successes
    if (successes.length > 0) {
      console.log(`✅ Successes:`)
      successes.forEach(s => console.log(`   ✅ ${s}`))
    }

    // Display issues
    if (issues.length > 0) {
      console.log(`\n⚠️  Issues to Address:`)
      issues.forEach(i => console.log(`   ⚠️  ${i}`))
    }

    // Final recommendation
    console.log(`\n🎯 Final Recommendation:`)
    if (issues.length === 0 && durationMin <= 5) {
      console.log(`   ✅ PROCEED TO PHASE 3`)
      console.log(`   This workflow demonstrates excellent performance and data quality.`)
      console.log(`   Ready for gradual rollout to more merchants.`)
    } else if (issues.length <= 2 && durationMin <= 10) {
      console.log(`   ⚠️  FIX MINOR ISSUES THEN PROCEED`)
      console.log(`   Performance is acceptable but some improvements needed.`)
      console.log(`   Address issues above, then test one more workflow.`)
    } else {
      console.log(`   ❌ FIX CRITICAL ISSUES BEFORE ROLLOUT`)
      console.log(`   Multiple problems detected that need resolution.`)
      console.log(`   Do not proceed to Phase 3 until issues are resolved.`)
    }

    // ============================================================
    // SECTION 7: NEXT STEPS
    // ============================================================
    console.log(`\n📋 NEXT STEPS`)
    console.log(`=============`)
    console.log(`1. Document these results in PHASE_2_TEST_RESULTS.md`)
    console.log(`2. Review Vercel logs for any warnings:`)
    console.log(`   vercel logs --prod --filter "${workflowId}"`)
    console.log(`3. Verify Shopify order in merchant's Shopify admin`)
    console.log(`4. Check database for data integrity`)
    
    if (issues.length === 0) {
      console.log(`5. ✅ PROCEED: Run identify-next-test-merchants.mjs for Phase 3`)
    } else {
      console.log(`5. ⚠️  FIX ISSUES: Address problems above before Phase 3`)
    }

    await db.$disconnect()

  } catch (error) {
    console.error('❌ Error analyzing workflow:', error)
    await db.$disconnect()
    throw error
  }
}

// Get workflowId from command line
const workflowId = process.argv[2]

if (!workflowId) {
  console.error('❌ Usage: node analyze-test-workflow.mjs <workflowId>')
  console.error('   Example: node analyze-test-workflow.mjs wf_1234567890_abcdef')
  console.error('\n💡 Tip: Get workflow ID from monitor-test-merchant.mjs output')
  process.exit(1)
}

analyzeTestWorkflow(workflowId).catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
