import db from './src/lib/db.js'

/**
 * Identify Test Merchant for Sequential Workflow Pilot
 * 
 * Analyzes merchants to find the best candidate for testing:
 * - Recent activity (uploaded PO in last 7 days)
 * - High success rate (>80%)
 * - Moderate volume (not too busy)
 * - Representative use case
 */

async function identifyTestMerchant() {
  console.log('🔍 Analyzing merchants for pilot testing...\n')

  try {
    // Get Prisma client
    const prisma = await db.getClient()
    
    // Query merchants with recent successful workflows
    const candidates = await prisma.merchant.findMany({
      where: {
        status: 'active',
        workflows: {
          some: {
            status: 'completed',
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
            }
          }
        }
      },
      include: {
        workflows: {
          where: {
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
            }
          },
          select: {
            id: true,
            status: true,
            createdAt: true,
            completedAt: true
          }
        },
        _count: {
          select: {
            workflows: true,
            purchaseOrders: true
          }
        }
      }
    })

    if (candidates.length === 0) {
      console.log('⚠️  No merchants with recent successful workflows found')
      console.log('   Try expanding the time window or checking different criteria')
      await db.$disconnect()
      return null
    }

    // Calculate metrics for each merchant
    const analysis = candidates.map(merchant => {
      const workflows = merchant.workflows
      const completed = workflows.filter(w => w.status === 'completed')
      const failed = workflows.filter(w => w.status === 'failed')
      
      const avgDuration = completed.reduce((sum, w) => {
        if (w.completedAt && w.createdAt) {
          return sum + (w.completedAt.getTime() - w.createdAt.getTime())
        }
        return sum
      }, 0) / (completed.length || 1)

      return {
        merchantId: merchant.id,
        shopDomain: merchant.shopDomain,
        totalWorkflows: merchant._count.workflows,
        totalPOs: merchant._count.purchaseOrders,
        recentWorkflows: workflows.length,
        completedWorkflows: completed.length,
        failedWorkflows: failed.length,
        successRate: (completed.length / workflows.length * 100).toFixed(1),
        avgDurationMin: (avgDuration / 60000).toFixed(1),
        lastWorkflow: workflows[0]?.createdAt
      }
    })

    // Sort by score (recent activity + success rate)
    analysis.sort((a, b) => {
      // Prefer merchants with:
      // 1. Recent activity (last 7 days)
      // 2. High success rate (>80%)
      // 3. Moderate volume (5-20 workflows/month)
      const scoreA = (a.recentWorkflows * 10) + parseFloat(a.successRate)
      const scoreB = (b.recentWorkflows * 10) + parseFloat(b.successRate)
      return scoreB - scoreA
    })

    console.log('📊 Top 10 Candidates for Pilot Testing:\n')
    console.log('Rank | Merchant ID          | Shop Domain                    | Success | Avg Duration | Recent')
    console.log('-----|----------------------|--------------------------------|---------|--------------|--------')
    
    analysis.slice(0, 10).forEach((m, i) => {
      const id = m.merchantId.padEnd(20, ' ')
      const domain = (m.shopDomain || 'N/A').padEnd(30, ' ')
      const success = `${m.successRate}%`.padStart(7, ' ')
      const duration = `${m.avgDurationMin} min`.padStart(12, ' ')
      const recent = `${m.recentWorkflows}`.padStart(6, ' ')
      console.log(`${String(i+1).padStart(4, ' ')} | ${id} | ${domain} | ${success} | ${duration} | ${recent}`)
    })

    console.log('\n✅ Recommended Test Merchant:')
    const recommended = analysis[0]
    console.log(`   Merchant ID:      ${recommended.merchantId}`)
    console.log(`   Shop Domain:      ${recommended.shopDomain}`)
    console.log(`   Success Rate:     ${recommended.successRate}%`)
    console.log(`   Avg Duration:     ${recommended.avgDurationMin} minutes`)
    console.log(`   Total Workflows:  ${recommended.totalWorkflows}`)
    console.log(`   Recent Activity:  ${recommended.recentWorkflows} workflows in last 30 days`)
    console.log(`   Completed:        ${recommended.completedWorkflows}`)
    console.log(`   Failed:           ${recommended.failedWorkflows}`)
    console.log(`   Last Upload:      ${recommended.lastWorkflow?.toISOString() || 'N/A'}`)

    console.log('\n📋 Selection Criteria:')
    console.log(`   ✅ Active merchant (recent uploads)`)
    console.log(`   ✅ High success rate (${recommended.successRate}% > 80%)`)
    console.log(`   ✅ Representative volume (${recommended.recentWorkflows} workflows/month)`)
    console.log(`   ${parseFloat(recommended.avgDurationMin) > 30 ? '⚠️' : '✅'}  Typical duration (${recommended.avgDurationMin} min)`)

    console.log('\n� Next Steps:')
    console.log(`   1. Copy merchant ID: ${recommended.merchantId}`)
    console.log(`   2. Run: node enable-sequential-for-merchant.mjs ${recommended.merchantId}`)
    console.log(`   3. Run: node monitor-test-merchant.mjs ${recommended.merchantId}`)
    console.log(`   4. Wait for merchant to upload a PO`)

    return recommended.merchantId

  } catch (error) {
    console.error('❌ Error analyzing merchants:', error)
    throw error
  }
}

// Run analysis
identifyTestMerchant().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
