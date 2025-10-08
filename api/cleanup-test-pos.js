/**
 * Cleanup Test Purchase Orders
 * 
 * Removes old test/stuck POs from earlier debugging sessions
 * Keeps POs from the last 2 hours (recent valid workflows)
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function cleanupTestPOs() {
  try {
    console.log(`🧹 Cleaning up test purchase orders...`)
    console.log(``)
    
    // Keep POs from last 2 hours (these are from current valid workflows)
    const twoHoursAgo = new Date()
    twoHoursAgo.setHours(twoHoursAgo.getHours() - 2)
    
    console.log(`⏰ Keeping POs created after: ${twoHoursAgo.toISOString()}`)
    console.log(`🗑️  Deleting older pending/processing POs from testing...`)
    console.log(``)
    
    // Find old stuck POs
    const oldStuckPOs = await prisma.purchaseOrder.findMany({
      where: {
        createdAt: { lt: twoHoursAgo },
        status: { in: ['pending', 'processing'] }
      },
      select: { id: true, number: true, status: true, createdAt: true }
    })
    
    if (oldStuckPOs.length === 0) {
      console.log(`✅ No old test POs to delete`)
      return
    }
    
    console.log(`📋 Found ${oldStuckPOs.length} old test POs:`)
    oldStuckPOs.slice(0, 10).forEach(po => {
      console.log(`  - ${po.number} (${po.status}, ${po.createdAt.toISOString()})`)
    })
    if (oldStuckPOs.length > 10) {
      console.log(`  ... and ${oldStuckPOs.length - 10} more`)
    }
    console.log(``)
    
    const poIds = oldStuckPOs.map(po => po.id)
    
    // Delete associated data
    console.log(`🗑️  Deleting associated line items...`)
    const lineItems = await prisma.pOLineItem.deleteMany({
      where: { purchaseOrderId: { in: poIds } }
    })
    console.log(`✅ Deleted ${lineItems.count} line items`)
    
    console.log(`🗑️  Deleting associated workflows...`)
    const workflows = await prisma.workflowExecution.deleteMany({
      where: { purchaseOrderId: { in: poIds } }
    })
    console.log(`✅ Deleted ${workflows.count} workflows`)
    
    console.log(`🗑️  Deleting associated AI audits...`)
    const audits = await prisma.aIProcessingAudit.deleteMany({
      where: { purchaseOrderId: { in: poIds } }
    })
    console.log(`✅ Deleted ${audits.count} AI audits`)
    
    console.log(`🗑️  Deleting purchase orders...`)
    const pos = await prisma.purchaseOrder.deleteMany({
      where: { id: { in: poIds } }
    })
    console.log(`✅ Deleted ${pos.count} purchase orders`)
    
    console.log(``)
    console.log(`🎉 Cleanup complete!`)
    console.log(``)
    console.log(`📊 Final Statistics:`)
    const remaining = await prisma.purchaseOrder.groupBy({
      by: ['status'],
      _count: true
    })
    console.log(`  Remaining POs:`)
    remaining.forEach(({ status, _count }) => {
      console.log(`    ${status}: ${_count}`)
    })
    
  } catch (error) {
    console.error(`❌ Error:`, error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

cleanupTestPOs()
  .then(() => process.exit(0))
  .catch(() => process.exit(1))
