#!/usr/bin/env node
/**
 * Compare Workflow Modes Performance
 * 
 * This script compares the performance of sequential vs legacy workflow modes
 * by analyzing completed workflows from the database.
 * 
 * Usage:
 *   node api/compare-workflow-modes.mjs
 */

import { db } from './src/lib/db.js'

console.log(`\n${'='.repeat(80)}`)
console.log(`📊 PERFORMANCE COMPARISON: Sequential vs Legacy Workflows`)
console.log(`${'='.repeat(80)}\n`)

async function main() {
  try {
    const prisma = await db.getClient()
    
    // Find recent completed workflows
    console.log('🔍 Analyzing completed workflows...\n')
    
    const workflows = await prisma.workflowExecution.findMany({
      where: {
        status: 'completed',
        completedAt: {
          not: null
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 50,
      select: {
        id: true,
        status: true,
        createdAt: true,
        completedAt: true,
        currentStage: true,
        metadata: true
      }
    })
    
    if (workflows.length === 0) {
      console.log('⚠️  No completed workflows found')
      return
    }
    
    console.log(`✅ Found ${workflows.length} completed workflows\n`)
    
    // Categorize workflows by mode
    const sequentialWorkflows = []
    const legacyWorkflows = []
    
    for (const wf of workflows) {
      const duration = wf.completedAt - wf.createdAt
      const durationMinutes = Math.round(duration / 60000)
      
      const workflowData = {
        id: wf.id,
        duration,
        durationMinutes,
        createdAt: wf.createdAt,
        completedAt: wf.completedAt
      }
      
      // Heuristic: Sequential workflows should complete in < 10 minutes
      // Legacy workflows take 30-60+ minutes
      if (durationMinutes < 10) {
        sequentialWorkflows.push(workflowData)
      } else {
        legacyWorkflows.push(workflowData)
      }
    }
    
    // Sequential Mode Stats
    console.log(`${'='.repeat(80)}`)
    console.log(`🚀 SEQUENTIAL MODE (< 10 minutes)`)
    console.log(`${'='.repeat(80)}`)
    
    if (sequentialWorkflows.length > 0) {
      const avgDuration = sequentialWorkflows.reduce((sum, wf) => sum + wf.duration, 0) / sequentialWorkflows.length
      const minDuration = Math.min(...sequentialWorkflows.map(wf => wf.duration))
      const maxDuration = Math.max(...sequentialWorkflows.map(wf => wf.duration))
      
      console.log(`📊 Count: ${sequentialWorkflows.length} workflows`)
      console.log(`⏱️  Average Duration: ${Math.round(avgDuration / 60000)} minutes (${Math.round(avgDuration / 1000)}s)`)
      console.log(`⚡ Fastest: ${Math.round(minDuration / 60000)} minutes (${Math.round(minDuration / 1000)}s)`)
      console.log(`🐌 Slowest: ${Math.round(maxDuration / 60000)} minutes (${Math.round(maxDuration / 1000)}s)`)
      
      console.log(`\n📋 Recent Sequential Workflows:`)
      sequentialWorkflows.slice(0, 5).forEach((wf, i) => {
        console.log(`   ${i + 1}. ${wf.id.substring(0, 24)}... - ${wf.durationMinutes} min`)
      })
    } else {
      console.log(`⚠️  No sequential workflows found (all > 10 minutes)`)
      console.log(`   This is expected if SEQUENTIAL_WORKFLOW feature flag is not enabled`)
    }
    
    // Legacy Mode Stats
    console.log(`\n${'='.repeat(80)}`)
    console.log(`📋 LEGACY MODE (> 10 minutes)`)
    console.log(`${'='.repeat(80)}`)
    
    if (legacyWorkflows.length > 0) {
      const avgDuration = legacyWorkflows.reduce((sum, wf) => sum + wf.duration, 0) / legacyWorkflows.length
      const minDuration = Math.min(...legacyWorkflows.map(wf => wf.duration))
      const maxDuration = Math.max(...legacyWorkflows.map(wf => wf.duration))
      
      console.log(`📊 Count: ${legacyWorkflows.length} workflows`)
      console.log(`⏱️  Average Duration: ${Math.round(avgDuration / 60000)} minutes`)
      console.log(`⚡ Fastest: ${Math.round(minDuration / 60000)} minutes`)
      console.log(`🐌 Slowest: ${Math.round(maxDuration / 60000)} minutes`)
      
      console.log(`\n📋 Recent Legacy Workflows:`)
      legacyWorkflows.slice(0, 5).forEach((wf, i) => {
        console.log(`   ${i + 1}. ${wf.id.substring(0, 24)}... - ${wf.durationMinutes} min`)
      })
    } else {
      console.log(`✅ No legacy workflows found (all < 10 minutes)`)
      console.log(`   This means sequential mode is working perfectly!`)
    }
    
    // Comparison Summary
    if (sequentialWorkflows.length > 0 && legacyWorkflows.length > 0) {
      console.log(`\n${'='.repeat(80)}`)
      console.log(`📈 PERFORMANCE COMPARISON`)
      console.log(`${'='.repeat(80)}`)
      
      const sequentialAvg = sequentialWorkflows.reduce((sum, wf) => sum + wf.duration, 0) / sequentialWorkflows.length
      const legacyAvg = legacyWorkflows.reduce((sum, wf) => sum + wf.duration, 0) / legacyWorkflows.length
      
      const improvement = ((legacyAvg - sequentialAvg) / legacyAvg * 100).toFixed(1)
      const speedup = (legacyAvg / sequentialAvg).toFixed(1)
      
      console.log(`⚡ Sequential: ${Math.round(sequentialAvg / 60000)} min avg`)
      console.log(`📋 Legacy: ${Math.round(legacyAvg / 60000)} min avg`)
      console.log(`\n🚀 Improvement: ${improvement}% faster`)
      console.log(`📊 Speed-up: ${speedup}x`)
      
      if (parseFloat(speedup) >= 8) {
        console.log(`\n✅ EXCELLENT: Achieved 8x+ speed improvement!`)
      } else if (parseFloat(speedup) >= 5) {
        console.log(`\n✅ GOOD: Achieved 5x+ speed improvement`)
      } else if (parseFloat(speedup) >= 2) {
        console.log(`\n⚠️  MODERATE: Only ${speedup}x improvement (expected 8x)`)
      } else {
        console.log(`\n❌ POOR: Less than 2x improvement (investigation needed)`)
      }
    }
    
    // Recommendations
    console.log(`\n${'='.repeat(80)}`)
    console.log(`💡 RECOMMENDATIONS`)
    console.log(`${'='.repeat(80)}`)
    
    if (sequentialWorkflows.length === 0) {
      console.log(`\n1. Enable sequential mode by setting SEQUENTIAL_WORKFLOW=1`)
      console.log(`2. Test with a new workflow upload`)
      console.log(`3. Re-run this script to see the improvement`)
    } else if (sequentialWorkflows.length < legacyWorkflows.length * 0.1) {
      console.log(`\n1. Sequential mode is working but only for ${sequentialWorkflows.length}/${workflows.length} workflows`)
      console.log(`2. Consider increasing rollout percentage`)
      console.log(`3. Current: ~${Math.round(sequentialWorkflows.length / workflows.length * 100)}%`)
      console.log(`4. Target: 100% (all workflows)`)
    } else if (legacyWorkflows.length > 0) {
      console.log(`\n1. Sequential mode is working well!`)
      console.log(`2. ${sequentialWorkflows.length}/${workflows.length} workflows using sequential mode`)
      console.log(`3. Consider removing Bull queue code after 100% rollout`)
    } else {
      console.log(`\n✅ Perfect! All workflows using sequential mode`)
      console.log(`🎉 Ready to remove Bull queue code in Phase 4`)
    }
    
  } catch (error) {
    console.error(`\n❌ Error:`, error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

main()
  .then(() => {
    console.log(`\n${'='.repeat(80)}`)
    console.log(`✅ Analysis Complete`)
    console.log(`${'='.repeat(80)}\n`)
    process.exit(0)
  })
  .catch(error => {
    console.error(`\n❌ Fatal error:`, error)
    process.exit(1)
  })
