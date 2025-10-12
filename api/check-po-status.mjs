/**
 * Check specific PO status and any associated jobs/workflows
 * Usage: node api/check-po-status.mjs <poId>
 */

import { PrismaClient } from '@prisma/client'

const poId = process.argv[2] || 'cmgna8jjx0001jm04qh4nfblg'

console.log(`\n🔍 Checking PO: ${poId}\n`)

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL
    }
  }
})

try {
  await prisma.$connect()
  
  // 1. Get PO details
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: {
      lineItems: true,
      aiAuditTrail: {
        orderBy: { createdAt: 'desc' },
        take: 1
      }
    }
  })
  
  // 2. Get workflows separately (no relation defined in schema)
  const workflows = await prisma.workflowExecution.findMany({
    where: { purchaseOrderId: poId },
    orderBy: { createdAt: 'desc' },
    take: 5
  })

  if (!po) {
    console.log('❌ PO not found')
    process.exit(1)
  }

  console.log('📋 Purchase Order Details:')
  console.log(`   ID: ${po.id}`)
  console.log(`   Number: ${po.number}`)
  console.log(`   Status: ${po.status}`)
  console.log(`   Job Status: ${po.jobStatus}`)
  console.log(`   Line Items: ${po.lineItems.length}`)
  console.log(`   Created: ${po.createdAt}`)
  console.log(`   Updated: ${po.updatedAt}`)
  console.log(`   Age: ${Math.floor((Date.now() - new Date(po.updatedAt).getTime()) / 1000)}s`)
  
  // Check workflows
  console.log('\n📊 Workflows (most recent 5):')
  if (workflows.length === 0) {
    console.log('   ✅ No workflows found')
  } else {
    for (const workflow of workflows) {
      const age = Math.floor((Date.now() - new Date(workflow.updatedAt).getTime()) / 1000)
      console.log(`   - ${workflow.id}`)
      console.log(`     Status: ${workflow.status}`)
      console.log(`     Current Stage: ${workflow.currentStage || 'N/A'}`)
      console.log(`     Updated: ${workflow.updatedAt} (${age}s ago)`)
      console.log(`     Created: ${workflow.createdAt}`)
      
      if (workflow.status === 'processing' && age > 300) {
        console.log(`     ⚠️ WARNING: Workflow stuck in processing for ${age}s (>5 minutes)`)
      } else if (workflow.status === 'pending' && age > 300) {
        console.log(`     ⚠️ WARNING: Workflow pending for ${age}s (>5 minutes)`)
      } else if (workflow.status === 'failed') {
        console.log(`     ❌ Workflow failed`)
      } else if (workflow.status === 'completed') {
        console.log(`     ✅ Workflow completed`)
      }
      console.log('')
    }
  }
  
  // 3. Check AI audits
  console.log('🤖 AI Processing:')
  if (po.aiAuditTrail.length === 0) {
    console.log('   ⚠️ No AI audit records found')
  } else {
    const audit = po.aiAuditTrail[0]
    console.log(`   Confidence: ${audit.overallConfidence}`)
    console.log(`   Model: ${audit.modelVersion}`)
    console.log(`   Processing Time: ${audit.processingTimeMs}ms`)
    console.log(`   Created: ${audit.createdAt}`)
  }
  
  // 4. Check for active workflows in any status
  const activeWorkflows = workflows.filter(w => 
    w.status === 'pending' || w.status === 'processing'
  )
  
  console.log('\n📌 Summary:')
  console.log(`   Total workflows: ${workflows.length}`)
  console.log(`   Active workflows: ${activeWorkflows.length}`)
  console.log(`   Line items: ${po.lineItems.length}`)
  console.log(`   PO Status: ${po.status}`)
  console.log(`   Job Status: ${po.jobStatus}`)
  
  if (activeWorkflows.length > 0) {
    console.log('\n⚠️ ACTIVE WORKFLOWS DETECTED:')
    for (const workflow of activeWorkflows) {
      const age = Math.floor((Date.now() - new Date(workflow.updatedAt).getTime()) / 1000)
      console.log(`   - ${workflow.id}: ${workflow.status} (${workflow.currentStage}) - ${age}s old`)
      
      if (age > 300) {
        console.log(`     🚨 STUCK: This workflow should be processed by auto-fix`)
      }
    }
  } else {
    console.log('\n✅ No active workflows - PO is not stuck')
  }
  
  // 5. Recommendations
  console.log('\n💡 Recommendations:')
  if (po.status === 'draft' && po.lineItems.length > 0) {
    console.log('   ✅ PO has data and is in draft status - ready for user review')
  } else if (po.status === 'draft' && po.lineItems.length === 0) {
    console.log('   ⚠️ PO is draft but has no line items - may need reprocessing')
  } else if (po.jobStatus === 'processing' && activeWorkflows.length === 0) {
    console.log('   ⚠️ PO shows processing but no active workflows - should be updated to completed')
  } else if (activeWorkflows.length > 0 && activeWorkflows.every(w => {
    const age = Math.floor((Date.now() - new Date(w.updatedAt).getTime()) / 1000)
    return age > 300
  })) {
    console.log('   🚨 All active workflows are stuck (>5 min) - run cron to auto-fix')
  } else {
    console.log('   ✅ PO status looks healthy')
  }

} catch (error) {
  console.error('\n❌ Error:', error.message)
  console.error(error.stack)
  process.exit(1)
} finally {
  await prisma.$disconnect()
}
