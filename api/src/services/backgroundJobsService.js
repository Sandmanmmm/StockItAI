/**
 * Background Job Scheduler
 * 
 * Schedules and runs periodic background jobs including:
 * - Daily supplier metrics calculation
 * - Data cleanup tasks
 * - Health checks
 */

import cron from 'node-cron'
import { db } from '../lib/db.js'
import { calculateAllSupplierMetrics } from './supplierMetricsService.js'

let isInitialized = false
let scheduledJobs = []

/**
 * Initialize all background jobs
 */
export function initializeBackgroundJobs() {
  if (isInitialized) {
    console.log('⚠️  Background jobs already initialized')
    return
  }

  console.log('🚀 Initializing background jobs...')

  // Calculate supplier metrics daily at 2 AM
  const metricsJob = cron.schedule('0 2 * * *', async () => {
    console.log('⏰ Running daily supplier metrics calculation...')
    await calculateAllSupplierMetricsJob()
  })

  scheduledJobs.push({ name: 'Daily Metrics Calculation', job: metricsJob })

  // Run metrics calculation on startup (after 30 seconds)
  setTimeout(() => {
    console.log('🔄 Running initial metrics calculation...')
    calculateAllSupplierMetricsJob().catch(err => {
      console.error('Initial metrics calculation failed:', err)
    })
  }, 30000)

  // Health check every hour
  const healthCheckJob = cron.schedule('0 * * * *', async () => {
    console.log('❤️  Running hourly health check...')
    await performHealthCheck()
  })

  scheduledJobs.push({ name: 'Hourly Health Check', job: healthCheckJob })

  // Auto-link unlinked POs every 15 minutes
  const autoLinkJob = cron.schedule('*/15 * * * *', async () => {
    console.log('🔗 Running auto-link job for unlinked purchase orders...')
    await autoLinkUnlinkedPOs()
  })

  scheduledJobs.push({ name: 'Auto-Link Unlinked POs', job: autoLinkJob })

  isInitialized = true
  console.log(`✅ ${scheduledJobs.length} background jobs initialized`)
}

/**
 * Stop all background jobs
 */
export function stopBackgroundJobs() {
  console.log('🛑 Stopping background jobs...')
  
  scheduledJobs.forEach(({ name, job }) => {
    job.stop()
    console.log(`  ✓ Stopped: ${name}`)
  })

  scheduledJobs = []
  isInitialized = false
  console.log('✅ All background jobs stopped')
}

/**
 * Calculate metrics for all suppliers across all merchants
 */
async function calculateAllSupplierMetricsJob() {
  const startTime = Date.now()
  
  try {
    // Get all active merchants
    const merchants = await db.client.merchant.findMany({
      where: { status: 'active' },
      select: { id: true, name: true }
    })

    console.log(`📊 Calculating metrics for ${merchants.length} merchants...`)

    let totalSuppliers = 0
    let successCount = 0
    let failureCount = 0

    for (const merchant of merchants) {
      try {
        const metrics = await calculateAllSupplierMetrics(merchant.id)
        successCount += metrics.length
        totalSuppliers += metrics.length
        
        console.log(`  ✓ ${merchant.name}: ${metrics.length} suppliers processed`)
      } catch (error) {
        console.error(`  ✗ ${merchant.name}: Failed to calculate metrics`, error)
        failureCount++
      }
    }

    const duration = Date.now() - startTime
    console.log(`✅ Metrics calculation complete:`)
    console.log(`  - Total suppliers: ${totalSuppliers}`)
    console.log(`  - Successful: ${successCount}`)
    console.log(`  - Failed: ${failureCount}`)
    console.log(`  - Duration: ${(duration / 1000).toFixed(2)}s`)

    // Log job execution
    await logJobExecution('supplier_metrics_calculation', {
      merchants: merchants.length,
      suppliers: totalSuppliers,
      successful: successCount,
      failed: failureCount,
      duration
    })

  } catch (error) {
    console.error('❌ Supplier metrics calculation job failed:', error)
    
    await logJobExecution('supplier_metrics_calculation', {
      error: error.message,
      failed: true
    })
  }
}

/**
 * Perform system health check
 */
async function performHealthCheck() {
  const startTime = Date.now()
  
  try {
    const checks = {
      database: false,
      merchants: 0,
      suppliers: 0,
      recentPOs: 0
    }

    // Check database connection
    try {
      await db.client.$queryRaw`SELECT 1`
      checks.database = true
    } catch (error) {
      console.error('❌ Database health check failed:', error)
    }

    // Count active resources
    if (checks.database) {
      checks.merchants = await db.client.merchant.count({
        where: { status: 'active' }
      })

      checks.suppliers = await db.client.supplier.count({
        where: { status: 'active' }
      })

      // Count POs from last 24 hours
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      
      checks.recentPOs = await db.client.purchaseOrder.count({
        where: {
          createdAt: {
            gte: yesterday
          }
        }
      })
    }

    const duration = Date.now() - startTime
    console.log(`✅ Health check passed (${duration}ms):`)
    console.log(`  - Database: ${checks.database ? '✓' : '✗'}`)
    console.log(`  - Active Merchants: ${checks.merchants}`)
    console.log(`  - Active Suppliers: ${checks.suppliers}`)
    console.log(`  - POs (24h): ${checks.recentPOs}`)

    await logJobExecution('health_check', { ...checks, duration })

  } catch (error) {
    console.error('❌ Health check failed:', error)
    await logJobExecution('health_check', {
      error: error.message,
      failed: true
    })
  }
}

/**
 * Auto-link unlinked purchase orders to suppliers using parsed data
 */
async function autoLinkUnlinkedPOs() {
  const startTime = Date.now()
  
  try {
    // Import the supplier matching service
    const { findMatchingSuppliers } = await import('./supplierMatchingService.js')
    
    // Find all unlinked POs with supplier names
    const allUnlinkedPOs = await db.client.purchaseOrder.findMany({
      where: {
        supplierId: null,
        // Only process POs from the last 7 days to avoid reprocessing old ones
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      },
      include: {
        merchant: {
          select: {
            id: true,
            name: true
          }
        }
      },
      take: 100 // Process in batches
    })

    // Filter out POs without supplier names
    const unlinkedPOs = allUnlinkedPOs.filter(po => po.supplierName && po.supplierName.trim() !== '')

    if (unlinkedPOs.length === 0) {
      console.log('  ✓ No unlinked POs found')
      return { linked: 0, total: 0 }
    }

    console.log(`  Found ${unlinkedPOs.length} unlinked POs to process`)

    let linkedCount = 0
    let skippedCount = 0

    for (const po of unlinkedPOs) {
      try {
        // Extract parsed supplier data from rawData
        let parsedSupplier = null
        if (po.rawData?.extractedData?.supplier) {
          parsedSupplier = po.rawData.extractedData.supplier
        } else if (po.rawData?.supplier) {
          parsedSupplier = po.rawData.supplier
        }

        // Build match data with all available information
        // Handle nested contact object structure
        const matchData = {
          name: parsedSupplier?.name || po.supplierName,
          email: parsedSupplier?.email || parsedSupplier?.contactEmail || parsedSupplier?.contact?.email,
          phone: parsedSupplier?.phone || parsedSupplier?.contactPhone || parsedSupplier?.contact?.phone,
          website: parsedSupplier?.website,
          address: parsedSupplier?.address
        }

        // Skip if no useful matching data
        if (!matchData.name && !matchData.email && !matchData.phone && !matchData.website) {
          console.log(`  ⚠️ PO #${po.number}: No supplier data to match, skipping`)
          skippedCount++
          continue
        }

        // Find matching suppliers using fuzzy matching with all data
        const matches = await findMatchingSuppliers(matchData, po.merchantId)

        if (matches && matches.length > 0) {
          const bestMatch = matches[0]
          
          // Auto-link if confidence is high enough (>= 85%)
          if (bestMatch.matchScore >= 85) {
            await db.client.purchaseOrder.update({
              where: { id: po.id },
              data: { supplierId: bestMatch.supplier.id }
            })
            
            console.log(`  ✓ Linked PO #${po.number} to ${bestMatch.supplier.name} (${bestMatch.matchScore}%)`)
            linkedCount++
          } else {
            console.log(`  ⚠️ PO #${po.number}: Low confidence match (${bestMatch.matchScore}%), skipping`)
            skippedCount++
          }
        } else {
          skippedCount++
        }
      } catch (error) {
        console.error(`  ✗ Failed to process PO #${po.number}:`, error.message)
        skippedCount++
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(`  ✅ Auto-link job completed in ${duration}s`)
    console.log(`     Linked: ${linkedCount}, Skipped: ${skippedCount}, Total: ${unlinkedPOs.length}`)

    return { linked: linkedCount, skipped: skippedCount, total: unlinkedPOs.length }
  } catch (error) {
    console.error('Auto-link job failed:', error)
    throw error
  }
}

/**
 * Log job execution to database (optional - for audit trail)
 */
async function logJobExecution(jobName, data) {
  try {
    // You can implement job logging here if needed
    // For now, just console log
    const timestamp = new Date().toISOString()
    console.log(`📝 Job Log [${timestamp}]: ${jobName}`, data)
  } catch (error) {
    console.error('Failed to log job execution:', error)
  }
}

/**
 * Manually trigger a job (useful for testing)
 */
export async function triggerJob(jobName) {
  console.log(`🔧 Manually triggering job: ${jobName}`)
  
  switch (jobName) {
    case 'metrics':
      await calculateAllSupplierMetricsJob()
      break
    case 'health':
      await performHealthCheck()
      break
    case 'autolink':
      await autoLinkUnlinkedPOs()
      break
    default:
      console.error(`Unknown job: ${jobName}`)
      throw new Error(`Unknown job: ${jobName}`)
  }
}

/**
 * Get status of all background jobs
 */
export function getJobsStatus() {
  return {
    initialized: isInitialized,
    jobs: scheduledJobs.map(({ name, job }) => ({
      name,
      running: job.getStatus() !== 'stopped'
    }))
  }
}

export default {
  initializeBackgroundJobs,
  stopBackgroundJobs,
  triggerJob,
  getJobsStatus
}
