/**
 * Performance Monitoring Service
 * 
 * Tracks and analyzes performance metrics for supplier fuzzy matching operations.
 * Enables A/B testing between pg_trgm and JavaScript engines.
 * 
 * Features:
 * - Store performance metrics in database
 * - Query and analyze performance trends
 * - Compare engine performance (pg_trgm vs JavaScript)
 * - Generate performance reports
 * - Monitor adoption and success rates
 */

import { db } from './db.js'

/**
 * Store a performance metric in the database
 * 
 * @param {Object} metric - Performance metric data
 * @param {string} metric.merchantId - Merchant ID
 * @param {string} metric.operation - Operation name (e.g., 'findMatchingSuppliers')
 * @param {string} metric.engine - Engine used ('pg_trgm' | 'javascript')
 * @param {number} metric.durationMs - Execution time in milliseconds
 * @param {number} [metric.resultCount] - Number of results returned
 * @param {boolean} [metric.success=true] - Whether operation succeeded
 * @param {string} [metric.error] - Error message if failed
 * @param {Object} [metric.metadata] - Additional context
 * @returns {Promise<Object>} Created metric record
 */
export async function logPerformanceMetric(metric) {
  const {
    merchantId,
    operation,
    engine,
    durationMs,
    resultCount = null,
    success = true,
    error = null,
    metadata = null
  } = metric
  
  try {
    const client = await db.getClient()
    
    const record = await client.performanceMetric.create({
      data: {
        merchantId,
        operation,
        engine,
        durationMs,
        resultCount,
        success,
        error,
        metadata
      }
    })
    
    return record
    
  } catch (err) {
    // Don't fail the main operation if metric logging fails
    console.error('❌ Failed to log performance metric:', err.message)
    return null
  }
}

/**
 * Store multiple performance metrics in batch
 * More efficient than individual inserts
 * 
 * @param {Array<Object>} metrics - Array of metric objects
 * @returns {Promise<number>} Number of metrics created
 */
export async function logPerformanceMetricsBatch(metrics) {
  if (!metrics || metrics.length === 0) {
    return 0
  }
  
  try {
    const client = await db.getClient()
    
    const result = await client.performanceMetric.createMany({
      data: metrics.map(metric => ({
        merchantId: metric.merchantId,
        operation: metric.operation,
        engine: metric.engine,
        durationMs: metric.durationMs,
        resultCount: metric.resultCount || null,
        success: metric.success !== false,
        error: metric.error || null,
        metadata: metric.metadata || null
      })),
      skipDuplicates: true
    })
    
    return result.count
    
  } catch (err) {
    console.error('❌ Failed to log performance metrics batch:', err.message)
    return 0
  }
}

/**
 * Get performance metrics for a specific merchant
 * 
 * @param {string} merchantId - Merchant ID
 * @param {Object} options - Query options
 * @param {string} [options.operation] - Filter by operation
 * @param {string} [options.engine] - Filter by engine
 * @param {Date} [options.startDate] - Start date for range
 * @param {Date} [options.endDate] - End date for range
 * @param {number} [options.limit=100] - Maximum results
 * @returns {Promise<Array>} Array of metrics
 */
export async function getPerformanceMetrics(merchantId, options = {}) {
  const {
    operation,
    engine,
    startDate,
    endDate,
    limit = 100
  } = options
  
  try {
    const client = await db.getClient()
    
    const where = {
      merchantId,
      ...(operation && { operation }),
      ...(engine && { engine }),
      ...(startDate || endDate ? {
        createdAt: {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate })
        }
      } : {})
    }
    
    const metrics = await client.performanceMetric.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit
    })
    
    return metrics
    
  } catch (err) {
    console.error('❌ Failed to get performance metrics:', err.message)
    return []
  }
}

/**
 * Get performance comparison between engines
 * 
 * @param {string} merchantId - Merchant ID
 * @param {Object} options - Query options
 * @param {string} [options.operation='findMatchingSuppliers'] - Operation to compare
 * @param {Date} [options.startDate] - Start date for range
 * @param {Date} [options.endDate] - End date for range
 * @returns {Promise<Object>} Comparison statistics
 */
export async function getPerformanceComparison(merchantId, options = {}) {
  const {
    operation = 'findMatchingSuppliers',
    startDate,
    endDate
  } = options
  
  try {
    const client = await db.getClient()
    
    const where = {
      merchantId,
      operation,
      success: true, // Only compare successful operations
      ...(startDate || endDate ? {
        createdAt: {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate })
        }
      } : {})
    }
    
    // Get JavaScript metrics
    const jsMetrics = await client.performanceMetric.findMany({
      where: { ...where, engine: 'javascript' },
      select: { durationMs: true, resultCount: true }
    })
    
    // Get pg_trgm metrics
    const pgMetrics = await client.performanceMetric.findMany({
      where: { ...where, engine: 'pg_trgm' },
      select: { durationMs: true, resultCount: true }
    })
    
    // Calculate statistics
    const jsStats = calculateStats(jsMetrics.map(m => m.durationMs))
    const pgStats = calculateStats(pgMetrics.map(m => m.durationMs))
    
    return {
      operation,
      period: {
        start: startDate || null,
        end: endDate || null
      },
      javascript: {
        count: jsMetrics.length,
        avgDuration: jsStats.avg,
        minDuration: jsStats.min,
        maxDuration: jsStats.max,
        medianDuration: jsStats.median,
        p95Duration: jsStats.p95,
        totalResults: jsMetrics.reduce((sum, m) => sum + (m.resultCount || 0), 0)
      },
      pg_trgm: {
        count: pgMetrics.length,
        avgDuration: pgStats.avg,
        minDuration: pgStats.min,
        maxDuration: pgStats.max,
        medianDuration: pgStats.median,
        p95Duration: pgStats.p95,
        totalResults: pgMetrics.reduce((sum, m) => sum + (m.resultCount || 0), 0)
      },
      improvement: {
        avgSpeedup: jsStats.avg > 0 ? (jsStats.avg / pgStats.avg).toFixed(2) + 'x' : 'N/A',
        medianSpeedup: jsStats.median > 0 ? (jsStats.median / pgStats.median).toFixed(2) + 'x' : 'N/A',
        p95Speedup: jsStats.p95 > 0 ? (jsStats.p95 / pgStats.p95).toFixed(2) + 'x' : 'N/A'
      }
    }
    
  } catch (err) {
    console.error('❌ Failed to get performance comparison:', err.message)
    return null
  }
}

/**
 * Calculate statistics for an array of numbers
 * @param {Array<number>} values - Array of numeric values
 * @returns {Object} Statistics
 */
function calculateStats(values) {
  if (!values || values.length === 0) {
    return {
      count: 0,
      avg: 0,
      min: 0,
      max: 0,
      median: 0,
      p95: 0
    }
  }
  
  const sorted = [...values].sort((a, b) => a - b)
  const sum = values.reduce((acc, val) => acc + val, 0)
  
  return {
    count: values.length,
    avg: Math.round(sum / values.length),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.floor(sorted.length * 0.95)]
  }
}

/**
 * Get performance summary for all operations
 * 
 * @param {string} merchantId - Merchant ID
 * @param {Object} options - Query options
 * @param {Date} [options.startDate] - Start date for range
 * @param {Date} [options.endDate] - End date for range
 * @returns {Promise<Object>} Performance summary
 */
export async function getPerformanceSummary(merchantId, options = {}) {
  const {
    startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Default: last 7 days
    endDate = new Date()
  } = options
  
  try {
    const client = await db.getClient()
    
    const where = {
      merchantId,
      createdAt: {
        gte: startDate,
        lte: endDate
      }
    }
    
    // Get all metrics
    const allMetrics = await client.performanceMetric.findMany({
      where,
      select: {
        operation: true,
        engine: true,
        durationMs: true,
        success: true,
        createdAt: true
      }
    })
    
    // Group by operation and engine
    const byOperation = {}
    
    for (const metric of allMetrics) {
      if (!byOperation[metric.operation]) {
        byOperation[metric.operation] = {
          javascript: [],
          pg_trgm: []
        }
      }
      
      byOperation[metric.operation][metric.engine].push(metric)
    }
    
    // Calculate summary for each operation
    const summary = {}
    
    for (const [operation, engines] of Object.entries(byOperation)) {
      const jsMetrics = engines.javascript.filter(m => m.success)
      const pgMetrics = engines.pg_trgm.filter(m => m.success)
      
      const jsStats = calculateStats(jsMetrics.map(m => m.durationMs))
      const pgStats = calculateStats(pgMetrics.map(m => m.durationMs))
      
      summary[operation] = {
        totalCalls: jsMetrics.length + pgMetrics.length,
        javascript: {
          calls: jsMetrics.length,
          successRate: jsMetrics.length > 0 ? 
            ((jsMetrics.length / engines.javascript.length) * 100).toFixed(1) + '%' : 'N/A',
          avgDuration: jsStats.avg,
          medianDuration: jsStats.median
        },
        pg_trgm: {
          calls: pgMetrics.length,
          successRate: pgMetrics.length > 0 ?
            ((pgMetrics.length / engines.pg_trgm.length) * 100).toFixed(1) + '%' : 'N/A',
          avgDuration: pgStats.avg,
          medianDuration: pgStats.median
        },
        speedup: jsStats.avg > 0 && pgStats.avg > 0 ? 
          (jsStats.avg / pgStats.avg).toFixed(1) + 'x' : 'N/A'
      }
    }
    
    return {
      period: {
        start: startDate,
        end: endDate,
        days: Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000))
      },
      totalMetrics: allMetrics.length,
      operations: summary
    }
    
  } catch (err) {
    console.error('❌ Failed to get performance summary:', err.message)
    return null
  }
}

/**
 * Get error rate for a specific operation and engine
 * 
 * @param {string} merchantId - Merchant ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Error statistics
 */
export async function getErrorRate(merchantId, options = {}) {
  const {
    operation,
    engine,
    startDate = new Date(Date.now() - 24 * 60 * 60 * 1000), // Default: last 24 hours
    endDate = new Date()
  } = options
  
  try {
    const client = await db.getClient()
    
    const where = {
      merchantId,
      ...(operation && { operation }),
      ...(engine && { engine }),
      createdAt: {
        gte: startDate,
        lte: endDate
      }
    }
    
    const total = await client.performanceMetric.count({ where })
    const failed = await client.performanceMetric.count({
      where: { ...where, success: false }
    })
    
    return {
      total,
      failed,
      success: total - failed,
      errorRate: total > 0 ? ((failed / total) * 100).toFixed(2) + '%' : '0%',
      successRate: total > 0 ? (((total - failed) / total) * 100).toFixed(2) + '%' : '0%'
    }
    
  } catch (err) {
    console.error('❌ Failed to get error rate:', err.message)
    return null
  }
}

/**
 * Clean up old performance metrics
 * Recommended to run periodically to prevent unbounded growth
 * 
 * @param {number} daysToKeep - Number of days of data to retain (default: 30)
 * @returns {Promise<number>} Number of records deleted
 */
export async function cleanupOldMetrics(daysToKeep = 30) {
  try {
    const client = await db.getClient()
    
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000)
    
    const result = await client.performanceMetric.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate
        }
      }
    })
    
    console.log(`🗑️ Cleaned up ${result.count} old performance metrics (older than ${daysToKeep} days)`)
    
    return result.count
    
  } catch (err) {
    console.error('❌ Failed to cleanup old metrics:', err.message)
    return 0
  }
}

/**
 * Get adoption statistics (what percentage using pg_trgm)
 * 
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Adoption statistics
 */
export async function getAdoptionStats(options = {}) {
  const {
    startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    endDate = new Date()
  } = options
  
  try {
    const client = await db.getClient()
    
    const where = {
      createdAt: {
        gte: startDate,
        lte: endDate
      }
    }
    
    const totalCalls = await client.performanceMetric.count({ where })
    const pgTrgmCalls = await client.performanceMetric.count({
      where: { ...where, engine: 'pg_trgm' }
    })
    const jsCalls = await client.performanceMetric.count({
      where: { ...where, engine: 'javascript' }
    })
    
    return {
      period: {
        start: startDate,
        end: endDate
      },
      total: totalCalls,
      pg_trgm: {
        calls: pgTrgmCalls,
        percentage: totalCalls > 0 ? ((pgTrgmCalls / totalCalls) * 100).toFixed(1) + '%' : '0%'
      },
      javascript: {
        calls: jsCalls,
        percentage: totalCalls > 0 ? ((jsCalls / totalCalls) * 100).toFixed(1) + '%' : '0%'
      }
    }
    
  } catch (err) {
    console.error('❌ Failed to get adoption stats:', err.message)
    return null
  }
}

export default {
  logPerformanceMetric,
  logPerformanceMetricsBatch,
  getPerformanceMetrics,
  getPerformanceComparison,
  getPerformanceSummary,
  getErrorRate,
  cleanupOldMetrics,
  getAdoptionStats
}
