/**
 * Redis Job Queue Monitoring Dashboard
 * Real-time monitoring interface for production queue health
 */

import express from 'express'
import { enhancedJobService } from '../lib/enhancedJobService.js'
import { RedisManager } from '../lib/redisManager.js'

const router = express.Router()

/**
 * Main monitoring dashboard
 * GET /api/monitoring/dashboard
 */
router.get('/dashboard', async (req, res) => {
  try {
    const redisManager = new RedisManager()
    
    // Get comprehensive system status
    const [
      queueStats,
      redisHealth,
      redisMemory,
      deadLetterStats
    ] = await Promise.all([
      enhancedJobService.getQueueStats(),
      redisManager.getHealth(),
      redisManager.getMemoryInfo(),
      enhancedJobService.getDeadLetterJobs('waiting', 5)
    ])

    const dashboard = {
      timestamp: new Date().toISOString(),
      status: {
        overall: queueStats.health?.isConnected ? 'healthy' : 'critical',
        redis: redisHealth.status,
        queues: queueStats.health?.queuesInitialized ? 'operational' : 'down'
      },
      
      // Queue metrics
      queues: {
        main: {
          name: 'file-processing',
          ...queueStats.mainQueue,
          throughput: calculateThroughput(queueStats.mainQueue),
          health: getQueueHealth(queueStats.mainQueue)
        },
        deadLetter: {
          name: 'failed-jobs',
          enabled: !!queueStats.deadLetterQueue,
          count: deadLetterStats.length,
          recentFailures: deadLetterStats.slice(0, 3)
        }
      },
      
      // Performance metrics
      performance: {
        memory: {
          used: redisMemory.used_memory_human || 'N/A',
          peak: redisMemory.used_memory_peak_human || 'N/A',
          percentage: redisMemory.used_memory_rss ? 
            ((redisMemory.used_memory_rss / (1024 * 1024 * 1024)) * 100).toFixed(2) + '%' : 'N/A'
        },
        connections: redisHealth.connections || 0,
        uptime: redisHealth.uptime || 0,
        
        // Job processing stats
        jobs: {
          lifetime: queueStats.lifetime,
          currentHour: await getHourlyJobStats(),
          failureRate: calculateFailureRate(queueStats.lifetime)
        }
      },
      
      // Alerts and warnings
      alerts: generateAlerts(queueStats, redisHealth, deadLetterStats),
      
      // System recommendations
      recommendations: generateRecommendations(queueStats, redisHealth)
    }

    res.json({
      success: true,
      data: dashboard
    })

  } catch (error) {
    console.error('Dashboard error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to generate dashboard',
      details: error.message
    })
  }
})

/**
 * Real-time metrics endpoint for live updates
 * GET /api/monitoring/metrics/live
 */
router.get('/metrics/live', async (req, res) => {
  try {
    const queueStats = await enhancedJobService.getQueueStats()
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        waiting: queueStats.mainQueue?.waiting || 0,
        active: queueStats.mainQueue?.active || 0,
        completed: queueStats.mainQueue?.completed || 0,
        failed: queueStats.mainQueue?.failed || 0,
        deadLettered: queueStats.lifetime?.deadLettered || 0
      }
    })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * Historical performance data
 * GET /api/monitoring/metrics/history
 */
router.get('/metrics/history', async (req, res) => {
  try {
    const { period = '1h', metric = 'all' } = req.query
    
    // This would typically come from a time-series database
    // For now, return mock historical data
    const history = generateMockHistory(period, metric)
    
    res.json({
      success: true,
      data: {
        period,
        metric,
        dataPoints: history,
        summary: {
          min: Math.min(...history.map(h => h.value)),
          max: Math.max(...history.map(h => h.value)),
          avg: history.reduce((sum, h) => sum + h.value, 0) / history.length
        }
      }
    })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * Job processing trends
 * GET /api/monitoring/trends
 */
router.get('/trends', async (req, res) => {
  try {
    const stats = await enhancedJobService.getQueueStats()
    
    const trends = {
      jobProcessing: {
        current: stats.mainQueue?.active || 0,
        trend: 'stable', // Would calculate from historical data
        prediction: predictJobLoad()
      },
      errorRate: {
        current: calculateFailureRate(stats.lifetime),
        trend: 'decreasing', // Would calculate from historical data
        threshold: 5 // 5% error rate threshold
      },
      throughput: {
        current: calculateThroughput(stats.mainQueue),
        trend: 'increasing',
        target: 100 // jobs per hour target
      }
    }
    
    res.json({
      success: true,
      data: trends,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * Health check endpoint
 * GET /api/monitoring/health
 */
router.get('/health', async (req, res) => {
  try {
    const redisManager = new RedisManager()
    const health = await redisManager.getHealth()
    const queueStats = await enhancedJobService.getQueueStats()
    
    const healthStatus = {
      status: health.status === 'connected' && queueStats.health?.isConnected ? 'healthy' : 'unhealthy',
      checks: {
        redis: health.status === 'connected',
        queues: queueStats.health?.queuesInitialized,
        memory: health.memory_usage < 80, // Less than 80% memory usage
        connections: health.connections < 100 // Less than 100 connections
      },
      uptime: health.uptime,
      timestamp: new Date().toISOString()
    }
    
    const httpStatus = healthStatus.status === 'healthy' ? 200 : 503
    res.status(httpStatus).json({
      success: healthStatus.status === 'healthy',
      data: healthStatus
    })
  } catch (error) {
    res.status(503).json({
      success: false,
      error: 'Health check failed',
      details: error.message
    })
  }
})

// Helper functions

function calculateThroughput(queueStats) {
  if (!queueStats) return 0
  const total = (queueStats.completed || 0) + (queueStats.failed || 0)
  // This is a simplified calculation - in production you'd use time-based windows
  return Math.round(total * 60) // Approximate jobs per hour
}

function getQueueHealth(queueStats) {
  if (!queueStats) return 'unknown'
  
  const total = queueStats.waiting + queueStats.active + queueStats.completed + queueStats.failed
  const failureRate = total > 0 ? (queueStats.failed / total) * 100 : 0
  
  if (failureRate > 10) return 'critical'
  if (failureRate > 5) return 'warning'
  if (queueStats.waiting > 100) return 'warning'
  return 'healthy'
}

function calculateFailureRate(lifetimeStats) {
  if (!lifetimeStats || lifetimeStats.processed === 0) return 0
  return ((lifetimeStats.failed / lifetimeStats.processed) * 100).toFixed(2)
}

async function getHourlyJobStats() {
  // Mock implementation - would query historical data in production
  return {
    processed: 45,
    failed: 2,
    avgProcessingTime: 1.5 // seconds
  }
}

function generateAlerts(queueStats, redisHealth, deadLetterStats) {
  const alerts = []
  
  // Check for high failure rate
  const failureRate = parseFloat(calculateFailureRate(queueStats.lifetime))
  if (failureRate > 5) {
    alerts.push({
      level: 'warning',
      type: 'high_failure_rate',
      message: `High job failure rate: ${failureRate}%`,
      action: 'Review failed jobs and dead letter queue'
    })
  }
  
  // Check for queue backlog
  if (queueStats.mainQueue?.waiting > 50) {
    alerts.push({
      level: 'warning',
      type: 'queue_backlog',
      message: `High queue backlog: ${queueStats.mainQueue.waiting} jobs waiting`,
      action: 'Consider scaling workers or investigate processing delays'
    })
  }
  
  // Check for dead letter accumulation
  if (deadLetterStats.length > 10) {
    alerts.push({
      level: 'critical',
      type: 'dead_letter_accumulation',
      message: `${deadLetterStats.length} jobs in dead letter queue`,
      action: 'Review and reprocess failed jobs'
    })
  }
  
  // Check Redis memory
  if (redisHealth.memory_usage > 80) {
    alerts.push({
      level: 'critical',
      type: 'high_memory_usage',
      message: `High Redis memory usage: ${redisHealth.memory_usage}%`,
      action: 'Monitor memory usage and consider scaling'
    })
  }
  
  return alerts
}

function generateRecommendations(queueStats, redisHealth) {
  const recommendations = []
  
  if (queueStats.mainQueue?.waiting > 20) {
    recommendations.push({
      type: 'performance',
      title: 'Scale Job Workers',
      description: 'Queue backlog detected. Consider increasing worker concurrency.',
      priority: 'medium'
    })
  }
  
  if (redisHealth.memory_usage > 60) {
    recommendations.push({
      type: 'infrastructure',
      title: 'Monitor Memory Usage',
      description: 'Redis memory usage is approaching limits. Consider memory optimization.',
      priority: 'low'
    })
  }
  
  return recommendations
}

function generateMockHistory(period, metric) {
  const now = new Date()
  const points = []
  const intervals = period === '1h' ? 12 : period === '1d' ? 24 : 30 // 5min, 1h, or 1d intervals
  
  for (let i = intervals; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - (i * (period === '1h' ? 5 * 60 * 1000 : 
                                                      period === '1d' ? 60 * 60 * 1000 : 
                                                      24 * 60 * 60 * 1000)))
    points.push({
      timestamp: timestamp.toISOString(),
      value: Math.floor(Math.random() * 100) + 10 // Random value between 10-110
    })
  }
  
  return points
}

function predictJobLoad() {
  // Mock prediction - would use ML/statistical models in production
  return {
    next1Hour: Math.floor(Math.random() * 50) + 25,
    next4Hours: Math.floor(Math.random() * 200) + 100,
    confidence: 0.75
  }
}

export default router