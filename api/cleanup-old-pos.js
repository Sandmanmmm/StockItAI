/**
 * Cleanup Old Purchase Orders Script
 * 
 * Removes duplicate/test purchase orders from the database to clean up testing artifacts.
 * 
 * Options:
 *   --all: Delete all POs (dangerous!)
 *   --failed: Delete only failed POs
 *   --duplicate: Delete duplicate POs (keeps the most recent)
 *   --old-days=N: Delete POs older than N days
 *   --dry-run: Show what would be deleted without actually deleting
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Parse command line arguments
const args = process.argv.slice(2)
const options = {
  all: args.includes('--all'),
  failed: args.includes('--failed'),
  duplicate: args.includes('--duplicate'),
  dryRun: args.includes('--dry-run'),
  oldDays: null
}

// Parse --old-days=N
const oldDaysArg = args.find(arg => arg.startsWith('--old-days='))
if (oldDaysArg) {
  options.oldDays = parseInt(oldDaysArg.split('=')[1])
}

async function cleanupOldPOs() {
  try {
    console.log(`🧹 Purchase Order Cleanup Script`)
    console.log(`📋 Options:`, options)
    console.log(``)
    
    if (options.dryRun) {
      console.log(`⚠️  DRY RUN MODE - No data will be deleted`)
      console.log(``)
    }
    
    let posToDelete = []
    
    // Option 1: Delete ALL POs (dangerous!)
    if (options.all) {
      console.log(`⚠️  WARNING: Deleting ALL purchase orders!`)
      if (!options.dryRun) {
        const confirm = 'yes' // In production, you'd want real confirmation
        if (confirm !== 'yes') {
          console.log(`❌ Cancelled by user`)
          return
        }
      }
      
      posToDelete = await prisma.purchaseOrder.findMany({
        select: { id: true, number: true, status: true, createdAt: true }
      })
    }
    
    // Option 2: Delete FAILED POs
    else if (options.failed) {
      console.log(`🔍 Finding failed purchase orders...`)
      posToDelete = await prisma.purchaseOrder.findMany({
        where: { status: 'failed' },
        select: { id: true, number: true, status: true, createdAt: true }
      })
    }
    
    // Option 3: Delete DUPLICATE POs (same PO number, keep most recent)
    else if (options.duplicate) {
      console.log(`🔍 Finding duplicate purchase orders...`)
      
      // Find all PO numbers with duplicates
      const allPOs = await prisma.purchaseOrder.findMany({
        select: { id: true, number: true, createdAt: true },
        orderBy: { createdAt: 'desc' }
      })
      
      const poNumberMap = new Map()
      
      // Group by PO number
      allPOs.forEach(po => {
        if (!poNumberMap.has(po.number)) {
          poNumberMap.set(po.number, [])
        }
        poNumberMap.get(po.number).push(po)
      })
      
      // Find duplicates (keep the most recent one)
      poNumberMap.forEach((pos, poNumber) => {
        if (pos.length > 1) {
          // Keep the first (most recent), delete the rest
          const toDelete = pos.slice(1)
          console.log(`  📦 PO ${poNumber}: Found ${pos.length} copies, keeping most recent, deleting ${toDelete.length}`)
          posToDelete.push(...toDelete.map(po => ({
            id: po.id,
            number: poNumber,
            createdAt: po.createdAt
          })))
        }
      })
    }
    
    // Option 4: Delete OLD POs (older than N days)
    else if (options.oldDays) {
      console.log(`🔍 Finding purchase orders older than ${options.oldDays} days...`)
      
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - options.oldDays)
      
      posToDelete = await prisma.purchaseOrder.findMany({
        where: { createdAt: { lt: cutoffDate } },
        select: { id: true, number: true, status: true, createdAt: true }
      })
    }
    
    // Default: Show stats and prompt for action
    else {
      console.log(`📊 Purchase Order Statistics:`)
      console.log(``)
      
      const totalPOs = await prisma.purchaseOrder.count()
      const byStatus = await prisma.purchaseOrder.groupBy({
        by: ['status'],
        _count: true
      })
      
      console.log(`  Total POs: ${totalPOs}`)
      console.log(`  By Status:`)
      byStatus.forEach(({ status, _count }) => {
        console.log(`    ${status}: ${_count}`)
      })
      console.log(``)
      
      // Find duplicates
      const allPOs = await prisma.purchaseOrder.findMany({
        select: { number: true }
      })
      const poNumbers = allPOs.map(po => po.number)
      const duplicates = poNumbers.filter((num, idx) => poNumbers.indexOf(num) !== idx)
      const uniqueDuplicates = [...new Set(duplicates)]
      
      console.log(`  Duplicate PO Numbers: ${uniqueDuplicates.length}`)
      if (uniqueDuplicates.length > 0) {
        console.log(`  Examples:`, uniqueDuplicates.slice(0, 5))
      }
      console.log(``)
      
      // Show old POs
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const oldPOs = await prisma.purchaseOrder.count({
        where: { createdAt: { lt: thirtyDaysAgo } }
      })
      console.log(`  POs older than 30 days: ${oldPOs}`)
      console.log(``)
      
      console.log(`💡 Usage:`)
      console.log(`  node cleanup-old-pos.js --failed --dry-run      # Preview failed PO deletion`)
      console.log(`  node cleanup-old-pos.js --failed                # Delete failed POs`)
      console.log(`  node cleanup-old-pos.js --duplicate --dry-run   # Preview duplicate removal`)
      console.log(`  node cleanup-old-pos.js --duplicate             # Remove duplicates (keep most recent)`)
      console.log(`  node cleanup-old-pos.js --old-days=30 --dry-run # Preview POs older than 30 days`)
      console.log(`  node cleanup-old-pos.js --old-days=7            # Delete POs older than 7 days`)
      console.log(``)
      
      return
    }
    
    // Execute deletion
    if (posToDelete.length === 0) {
      console.log(`✅ No purchase orders to delete`)
      return
    }
    
    console.log(``)
    console.log(`📋 Found ${posToDelete.length} purchase orders to delete:`)
    
    // Show summary
    const statusCounts = {}
    posToDelete.forEach(po => {
      statusCounts[po.status || 'unknown'] = (statusCounts[po.status || 'unknown'] || 0) + 1
    })
    console.log(`  By Status:`, statusCounts)
    
    // Show first few examples
    console.log(`  Examples:`)
    posToDelete.slice(0, 5).forEach(po => {
      console.log(`    - ${po.number} (${po.status}, ${po.createdAt?.toISOString()})`)
    })
    if (posToDelete.length > 5) {
      console.log(`    ... and ${posToDelete.length - 5} more`)
    }
    console.log(``)
    
    if (options.dryRun) {
      console.log(`✅ DRY RUN COMPLETE - No data was deleted`)
      return
    }
    
    // Delete line items first (foreign key constraint)
    console.log(`🗑️  Deleting associated line items...`)
    const lineItemsDeleted = await prisma.pOLineItem.deleteMany({
      where: { purchaseOrderId: { in: posToDelete.map(po => po.id) } }
    })
    console.log(`✅ Deleted ${lineItemsDeleted.count} line items`)
    
    // Delete workflow executions
    console.log(`🗑️  Deleting associated workflow executions...`)
    const workflowsDeleted = await prisma.workflowExecution.deleteMany({
      where: { purchaseOrderId: { in: posToDelete.map(po => po.id) } }
    })
    console.log(`✅ Deleted ${workflowsDeleted.count} workflow executions`)
    
    // Delete AI audits
    console.log(`🗑️  Deleting associated AI audit records...`)
    const auditsDeleted = await prisma.aIProcessingAudit.deleteMany({
      where: { purchaseOrderId: { in: posToDelete.map(po => po.id) } }
    })
    console.log(`✅ Deleted ${auditsDeleted.count} AI audit records`)
    
    // Delete purchase orders
    console.log(`🗑️  Deleting purchase orders...`)
    const posDeleted = await prisma.purchaseOrder.deleteMany({
      where: { id: { in: posToDelete.map(po => po.id) } }
    })
    console.log(`✅ Deleted ${posDeleted.count} purchase orders`)
    
    console.log(``)
    console.log(`🎉 Cleanup complete!`)
    console.log(``)
    console.log(`📊 Summary:`)
    console.log(`  Purchase Orders: ${posDeleted.count}`)
    console.log(`  Line Items: ${lineItemsDeleted.count}`)
    console.log(`  Workflows: ${workflowsDeleted.count}`)
    console.log(`  AI Audits: ${auditsDeleted.count}`)
    
  } catch (error) {
    console.error(`❌ Error during cleanup:`, error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run the script
cleanupOldPOs()
  .then(() => {
    console.log(`✅ Script completed successfully`)
    process.exit(0)
  })
  .catch((error) => {
    console.error(`❌ Script failed:`, error)
    process.exit(1)
  })
