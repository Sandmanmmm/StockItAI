/**
 * Supplier Metrics Calculation Service
 * 
 * Calculates and stores supplier performance metrics including:
 * - Accuracy scores
 * - Processing times
 * - Status breakdowns
 * - Health scores
 */

import { db } from '../lib/db.js'

/**
 * Calculate comprehensive metrics for a specific supplier
 * @param {string} supplierId - The supplier ID
 * @returns {Promise<Object>} Calculated metrics
 */
export async function calculateSupplierMetrics(supplierId) {
  try {
    const client = await db.getClient()
    // Fetch all POs for this supplier
    const purchaseOrders = await client.purchaseOrder.findMany({
      where: { supplierId },
      include: {
        lineItems: true
      }
    })

    if (purchaseOrders.length === 0) {
      return getDefaultMetrics(supplierId)
    }

    // Calculate metrics
    const metrics = {
      supplierId,
      
      // Accuracy & Quality
      averageAccuracy: calculateAverageAccuracy(purchaseOrders),
      dataQualityScore: calculateDataQualityScore(purchaseOrders),
      errorRate: calculateErrorRate(purchaseOrders),
      
      // Performance
      avgProcessingTime: calculateAvgProcessingTime(purchaseOrders),
      onTimeDeliveryRate: calculateOnTimeDeliveryRate(purchaseOrders),
      totalPOs: purchaseOrders.length,
      totalValue: calculateTotalValue(purchaseOrders),
      
      // Recent Activity
      recentPOs7Days: calculateRecentPOs(purchaseOrders, 7),
      recentPOs30Days: calculateRecentPOs(purchaseOrders, 30),
      activityTrend: calculateActivityTrend(purchaseOrders),
      
      // Status Breakdown
      completedCount: purchaseOrders.filter(po => po.status === 'completed').length,
      processingCount: purchaseOrders.filter(po => po.status === 'processing').length,
      failedCount: purchaseOrders.filter(po => po.status === 'failed').length,
      needsReviewCount: purchaseOrders.filter(po => po.status === 'needs_review' || po.status === 'pending_review').length,
      
      // Health Score
      healthScore: 0, // Will be calculated below
      lastHealthCheck: new Date(),
      
      calculatedAt: new Date()
    }

    // Calculate overall health score
    metrics.healthScore = calculateHealthScore(metrics)

    // Store metrics in database
    await client.supplierMetrics.upsert({
      where: { supplierId },
      update: metrics,
      create: metrics
    })

    return metrics
  } catch (error) {
    console.error('Error calculating supplier metrics:', error)
    throw error
  }
}

/**
 * Calculate metrics for all suppliers for a merchant
 * @param {string} merchantId - The merchant ID
 * @returns {Promise<Object[]>} Array of metrics for all suppliers
 */
export async function calculateAllSupplierMetrics(merchantId) {
  try {
    const client = await db.getClient()
    const suppliers = await client.supplier.findMany({
      where: { merchantId },
      select: { id: true }
    })

    const metricsPromises = suppliers.map(supplier => 
      calculateSupplierMetrics(supplier.id).catch(err => {
        console.error(`Failed to calculate metrics for supplier ${supplier.id}:`, err)
        return null
      })
    )

    const allMetrics = await Promise.all(metricsPromises)
    return allMetrics.filter(m => m !== null)
  } catch (error) {
    console.error('Error calculating all supplier metrics:', error)
    throw error
  }
}

/**
 * Get cached metrics or calculate if stale
 * @param {string} supplierId - The supplier ID
 * @param {number} maxAgeMinutes - Maximum age of cached metrics in minutes (default: 60)
 * @returns {Promise<Object>} Supplier metrics
 */
export async function getSupplierMetrics(supplierId, maxAgeMinutes = 60) {
  try {
    const client = await db.getClient()
    // Try to get cached metrics
    const cached = await client.supplierMetrics.findUnique({
      where: { supplierId }
    })

    if (cached) {
      const ageMinutes = (Date.now() - cached.calculatedAt.getTime()) / 1000 / 60
      
      // Return cached if fresh enough
      if (ageMinutes < maxAgeMinutes) {
        return cached
      }
    }

    // Calculate fresh metrics
    return await calculateSupplierMetrics(supplierId)
  } catch (error) {
    console.error('Error getting supplier metrics:', error)
    throw error
  }
}

// ============================================================================
// METRIC CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculate average AI parsing confidence across all POs
 */
function calculateAverageAccuracy(purchaseOrders) {
  if (purchaseOrders.length === 0) return 0
  
  const totalConfidence = purchaseOrders.reduce((sum, po) => sum + (po.confidence || 0), 0)
  return parseFloat((totalConfidence / purchaseOrders.length).toFixed(2))
}

/**
 * Calculate data quality score based on completeness of PO data
 */
function calculateDataQualityScore(purchaseOrders) {
  if (purchaseOrders.length === 0) return 0
  
  const qualityScores = purchaseOrders.map(po => {
    let score = 0
    let checks = 0
    
    // Check essential fields
    if (po.number) { score++; checks++ }
    if (po.supplierName) { score++; checks++ }
    if (po.orderDate) { score++; checks++ }
    if (po.totalAmount > 0) { score++; checks++ }
    if (po.lineItems && po.lineItems.length > 0) { score++; checks++ }
    
    // Check line item completeness
    if (po.lineItems && po.lineItems.length > 0) {
      const completeItems = po.lineItems.filter(item => 
        item.sku && item.productName && item.quantity > 0 && item.unitCost > 0
      ).length
      score += (completeItems / po.lineItems.length)
      checks++
    }
    
    return checks > 0 ? (score / checks) : 0
  })
  
  const avgScore = qualityScores.reduce((sum, score) => sum + score, 0) / purchaseOrders.length
  return parseFloat((avgScore * 100).toFixed(2))
}

/**
 * Calculate error rate (percentage of failed POs)
 */
function calculateErrorRate(purchaseOrders) {
  if (purchaseOrders.length === 0) return 0
  
  const failedCount = purchaseOrders.filter(po => po.status === 'failed').length
  return parseFloat(((failedCount / purchaseOrders.length) * 100).toFixed(2))
}

/**
 * Calculate average processing time from upload to completion
 */
function calculateAvgProcessingTime(purchaseOrders) {
  const completedPOs = purchaseOrders.filter(po => 
    po.jobStartedAt && po.jobCompletedAt && po.status === 'completed'
  )
  
  if (completedPOs.length === 0) return 0
  
  const totalTime = completedPOs.reduce((sum, po) => {
    const startTime = new Date(po.jobStartedAt).getTime()
    const endTime = new Date(po.jobCompletedAt).getTime()
    return sum + (endTime - startTime)
  }, 0)
  
  return Math.round(totalTime / completedPOs.length)
}

/**
 * Calculate on-time delivery rate based on due dates
 */
function calculateOnTimeDeliveryRate(purchaseOrders) {
  const posWithDueDate = purchaseOrders.filter(po => 
    po.dueDate && po.status === 'completed' && po.jobCompletedAt
  )
  
  if (posWithDueDate.length === 0) return 100 // Assume good if no data
  
  const onTimePOs = posWithDueDate.filter(po => {
    const completedDate = new Date(po.jobCompletedAt)
    const dueDate = new Date(po.dueDate)
    return completedDate <= dueDate
  })
  
  return parseFloat(((onTimePOs.length / posWithDueDate.length) * 100).toFixed(2))
}

/**
 * Calculate total value of all POs
 */
function calculateTotalValue(purchaseOrders) {
  const total = purchaseOrders.reduce((sum, po) => sum + (po.totalAmount || 0), 0)
  return parseFloat(total.toFixed(2))
}

/**
 * Calculate number of POs in last N days
 */
function calculateRecentPOs(purchaseOrders, days) {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)
  
  return purchaseOrders.filter(po => 
    new Date(po.createdAt) >= cutoffDate
  ).length
}

/**
 * Calculate activity trend (comparing last 7 days vs previous 7 days)
 */
function calculateActivityTrend(purchaseOrders) {
  const now = new Date()
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const previous7Days = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
  
  const recentCount = purchaseOrders.filter(po => 
    new Date(po.createdAt) >= last7Days
  ).length
  
  const previousCount = purchaseOrders.filter(po => {
    const createdAt = new Date(po.createdAt)
    return createdAt >= previous7Days && createdAt < last7Days
  }).length
  
  if (previousCount === 0) {
    return recentCount > 0 ? 'up' : 'stable'
  }
  
  const change = ((recentCount - previousCount) / previousCount) * 100
  
  if (change > 10) return 'up'
  if (change < -10) return 'down'
  return 'stable'
}

/**
 * Calculate overall health score (0-100)
 * Weighted combination of various metrics
 */
function calculateHealthScore(metrics) {
  const weights = {
    accuracy: 0.25,        // 25% - AI parsing accuracy
    dataQuality: 0.20,     // 20% - Data completeness
    errorRate: 0.20,       // 20% - Inverse of error rate
    processingTime: 0.15,  // 15% - Speed (inverse of time)
    activity: 0.10,        // 10% - Recent activity
    completion: 0.10       // 10% - Completion rate
  }
  
  // Normalize metrics to 0-100 scale
  const accuracyScore = metrics.averageAccuracy * 100
  const dataQualityScore = metrics.dataQualityScore
  const errorScore = 100 - metrics.errorRate
  
  // Processing time score (faster = better, cap at 10 minutes)
  const maxProcessingTime = 10 * 60 * 1000 // 10 minutes
  const processingScore = metrics.avgProcessingTime > 0
    ? Math.max(0, 100 - (metrics.avgProcessingTime / maxProcessingTime) * 100)
    : 100
  
  // Activity score (recent activity is good)
  const activityScore = Math.min(100, (metrics.recentPOs7Days / 7) * 20)
  
  // Completion rate
  const totalProcessed = metrics.completedCount + metrics.failedCount
  const completionScore = totalProcessed > 0
    ? (metrics.completedCount / totalProcessed) * 100
    : 100
  
  // Calculate weighted average
  const healthScore = 
    (accuracyScore * weights.accuracy) +
    (dataQualityScore * weights.dataQuality) +
    (errorScore * weights.errorRate) +
    (processingScore * weights.processingTime) +
    (activityScore * weights.activity) +
    (completionScore * weights.completion)
  
  return parseFloat(Math.min(100, Math.max(0, healthScore)).toFixed(2))
}

/**
 * Get default metrics for suppliers with no PO data
 */
function getDefaultMetrics(supplierId) {
  return {
    supplierId,
    averageAccuracy: 0,
    dataQualityScore: 0,
    errorRate: 0,
    avgProcessingTime: 0,
    onTimeDeliveryRate: 100,
    totalPOs: 0,
    totalValue: 0,
    recentPOs7Days: 0,
    recentPOs30Days: 0,
    activityTrend: 'stable',
    completedCount: 0,
    processingCount: 0,
    failedCount: 0,
    needsReviewCount: 0,
    healthScore: 100,
    lastHealthCheck: new Date(),
    calculatedAt: new Date()
  }
}

export default {
  calculateSupplierMetrics,
  calculateAllSupplierMetrics,
  getSupplierMetrics
}
