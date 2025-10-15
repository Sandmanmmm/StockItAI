/**
 * Verify Workflow Timing Hypothesis
 * 
 * This script proves that jobs sit idle in Bull queues waiting for cron runs.
 * It measures:
 * 1. Time between stage completions (should be ~60s if waiting for cron)
 * 2. Actual stage processing time (should be <10s for most stages)
 * 3. Bull queue depths (jobs waiting for workers)
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function analyzeWorkflowTiming() {
  console.log('🔍 ========== WORKFLOW TIMING HYPOTHESIS VERIFICATION ==========\n')

  // Get recent completed workflows
  const workflows = await prisma.workflowExecution.findMany({
    where: {
      status: 'completed',
      completedAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
      }
    },
    orderBy: {
      completedAt: 'desc'
    },
    take: 5
  })

  console.log(`📋 Analyzing ${workflows.length} recent workflows\n`)

  for (const workflow of workflows) {
    console.log(`\n${'='.repeat(70)}`)
    console.log(`📊 Workflow: ${workflow.workflowId}`)
    console.log(`   Status: ${workflow.status}`)
    console.log(`   Created: ${workflow.createdAt?.toISOString()}`)
    console.log(`   Completed: ${workflow.completedAt?.toISOString()}`)
    
    const totalDuration = workflow.completedAt?.getTime() - workflow.createdAt?.getTime()
    const totalMinutes = Math.round(totalDuration / 60000)
    console.log(`   Total Duration: ${totalMinutes} minutes (${totalDuration}ms)`)
    
    // Get stage history from metadata
    const metadata = workflow.metadata || {}
    const stageHistory = metadata.stageHistory || []
    
    if (stageHistory.length > 0) {
      console.log(`\n   📈 Stage Progression (${stageHistory.length} stages):`)
      
      let previousTimestamp = null
      const gaps = []
      
      for (let i = 0; i < stageHistory.length; i++) {
        const stage = stageHistory[i]
        const timestamp = new Date(stage.timestamp)
        const timeFromStart = timestamp.getTime() - workflow.createdAt?.getTime()
        const minutesFromStart = Math.round(timeFromStart / 60000)
        
        let gap = null
        if (previousTimestamp) {
          gap = timestamp.getTime() - previousTimestamp.getTime()
          gaps.push(gap)
        }
        
        console.log(`   ${i + 1}. ${stage.stage} (${stage.status})`)
        console.log(`      Time: ${timestamp.toISOString()}`)
        console.log(`      +${minutesFromStart}min from start`)
        if (gap) {
          const gapSeconds = Math.round(gap / 1000)
          console.log(`      ⏱️  Gap from previous: ${gapSeconds}s`)
          
          if (gapSeconds > 45) {
            console.log(`      ⚠️  LONG GAP - Likely waiting for cron run!`)
          } else if (gapSeconds < 10) {
            console.log(`      ✅ SHORT GAP - Processed immediately`)
          }
        }
        
        previousTimestamp = timestamp.getTime()
      }
      
      // Analyze gaps
      if (gaps.length > 0) {
        const avgGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length
        const maxGap = Math.max(...gaps)
        const minGap = Math.min(...gaps)
        
        console.log(`\n   📊 Gap Analysis:`)
        console.log(`      Average gap: ${Math.round(avgGap / 1000)}s`)
        console.log(`      Max gap: ${Math.round(maxGap / 1000)}s`)
        console.log(`      Min gap: ${Math.round(minGap / 1000)}s`)
        
        if (avgGap > 45000) {
          console.log(`\n   ✅ HYPOTHESIS CONFIRMED:`)
          console.log(`      Average gap of ${Math.round(avgGap / 1000)}s indicates`)
          console.log(`      stages are waiting ~60s for next cron run`)
        } else {
          console.log(`\n   ⚠️ HYPOTHESIS UNCLEAR:`)
          console.log(`      Average gap of ${Math.round(avgGap / 1000)}s is less than expected`)
          console.log(`      Either stages processing quickly or different bottleneck`)
        }
      }
    } else {
      console.log(`\n   ⚠️ No stage history in metadata`)
      console.log(`      Workflow may have been processed with older code`)
    }
    
    // Check if workflow has retry history (Vision API timeout recovery)
    const aiParsingRetries = metadata.aiParsingRetries || 0
    if (aiParsingRetries > 0) {
      console.log(`\n   🔄 AI Parsing Retries: ${aiParsingRetries}`)
      console.log(`      (Vision API timeout was recovered via auto-retry)`)
    }
    
    // Check PO results
    if (workflow.purchaseOrderId) {
      const po = await prisma.purchaseOrder.findUnique({
        where: { id: workflow.purchaseOrderId },
        include: {
          lineItems: true
        }
      })
      
      if (po) {
        console.log(`\n   📦 PO Results:`)
        console.log(`      Number: ${po.number || 'N/A'}`)
        console.log(`      Status: ${po.status}`)
        console.log(`      Line Items: ${po.lineItems?.length || 0}`)
        console.log(`      Confidence: ${po.confidence ? Math.round(po.confidence * 100) : 0}%`)
      }
    }
  }

  console.log(`\n${'='.repeat(70)}`)
  console.log(`\n🎯 VERIFICATION SUMMARY:\n`)
  console.log(`If hypothesis is CORRECT, you should see:`)
  console.log(`  ✅ Average gaps between stages: ~50-70 seconds`)
  console.log(`  ✅ Total workflow duration: 30-45 minutes`)
  console.log(`  ✅ Many "LONG GAP" warnings above`)
  console.log(`\nIf hypothesis is WRONG, you should see:`)
  console.log(`  ❌ Average gaps between stages: <10 seconds`)
  console.log(`  ❌ Total workflow duration: 3-5 minutes`)
  console.log(`  ❌ Many "SHORT GAP" messages above`)
  console.log(`\n${'='.repeat(70)}\n`)
}

async function checkBullQueueDepths() {
  console.log('\n🔍 ========== BULL QUEUE DEPTH ANALYSIS ==========\n')
  console.log('NOTE: This requires Bull queue instances to be initialized.')
  console.log('Run this script FROM the cron job or after processor initialization.\n')
  
  // This would require importing Bull queues, which may not be available
  // in a standalone script. For now, just document the approach.
  
  console.log('To check Bull queue depths, add this to process-workflows-cron.js:')
  console.log(`
async function logQueueDepths() {
  const queueNames = [
    'ai-parsing',
    'database-save', 
    'product-draft-creation',
    'image-attachment',
    'shopify-sync',
    'status-update'
  ]
  
  for (const name of queueNames) {
    const queue = await processorRegistrationService.getQueue(name)
    if (queue) {
      const counts = await queue.getJobCounts()
      console.log(\`📊 [\${name}] Queue Depth:\`, counts)
      
      if (counts.waiting > 0) {
        console.log(\`   ⚠️  \${counts.waiting} jobs waiting - indicates workers not processing\`)
      }
      if (counts.active > 0) {
        console.log(\`   ✅ \${counts.active} jobs active - workers are processing\`)
      }
    }
  }
}
  `)
  
  console.log(`\nIf hypothesis is CORRECT, you should see:`)
  console.log(`  ✅ Many jobs in "waiting" state between cron runs`)
  console.log(`  ✅ Jobs move to "active" only during cron execution`)
  console.log(`  ✅ Queue depths drop to 0 after cron completes\n`)
}

async function main() {
  try {
    await analyzeWorkflowTiming()
    await checkBullQueueDepths()
  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

main()
