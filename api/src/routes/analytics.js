/**
 * Analytics API routes
 */

import express from 'express'
import { db } from '../lib/db.js'

const router = express.Router()

// GET /api/analytics/dashboard - Get dashboard statistics
router.get('/dashboard', async (req, res) => {
  try {
    const merchant = req.merchant
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      })
    }

    const prisma = await db.getClient()

    // Get various stats in parallel
    const [
      totalPOs,
      pendingPOs,
      processedTodayCount,
      avgConfidence,
      totalSuppliers,
      recentOrders
    ] = await Promise.all([
      // Total purchase orders
      prisma.purchaseOrder.count({
        where: { merchantId: merchant.id }
      }),
      
      // Pending purchase orders
      prisma.purchaseOrder.count({
        where: { 
          merchantId: merchant.id,
          status: 'pending'
        }
      }),
      
      // Processed today
      prisma.purchaseOrder.count({
        where: {
          merchantId: merchant.id,
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0))
          }
        }
      }),
      
      // Average AI confidence
      prisma.purchaseOrder.aggregate({
        where: { merchantId: merchant.id },
        _avg: { confidence: true }
      }),
      
      // Total active suppliers
      prisma.supplier.count({
        where: { 
          merchantId: merchant.id,
          status: 'active'
        }
      }),
      
      // Recent orders for activity feed
      prisma.purchaseOrder.findMany({
        where: { merchantId: merchant.id },
        include: {
          supplier: {
            select: { name: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      })
    ])

    // Build recent activity
    const recentActivity = recentOrders.map(order => ({
      id: order.id,
      type: 'purchase_order',
      message: `New PO ${order.number} from ${order.supplier?.name || order.supplierName}`,
      timestamp: order.createdAt.toISOString(),
      status: order.status
    }))

    const stats = {
      totalPOs,
      pendingPOs,
      processedToday: processedTodayCount,
      averageAccuracy: avgConfidence._avg.confidence || 0,
      totalSuppliers,
      recentActivity
    }

    res.json({
      success: true,
      data: stats
    })
  } catch (error) {
    console.error('Get dashboard stats error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get dashboard statistics'
    })
  }
})

// GET /api/analytics/suppliers - Get supplier analytics
router.get('/suppliers', async (req, res) => {
  try {
    const merchant = req.merchant
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      })
    }

    const prisma = await db.getClient()

    const suppliers = await prisma.supplier.findMany({
      where: { merchantId: merchant.id },
      include: {
        _count: {
          select: { purchaseOrders: true }
        },
        purchaseOrders: {
          select: {
            totalAmount: true,
            confidence: true,
            status: true,
            createdAt: true
          }
        }
      }
    })

    const supplierStats = suppliers.map(supplier => {
      const orders = supplier.purchaseOrders
      const totalValue = orders.reduce((sum, po) => sum + po.totalAmount, 0)
      const avgConfidence = orders.length > 0 
        ? orders.reduce((sum, po) => sum + po.confidence, 0) / orders.length 
        : 0
      
      const statusCounts = orders.reduce((counts, po) => {
        counts[po.status] = (counts[po.status] || 0) + 1
        return counts
      }, {})

      return {
        id: supplier.id,
        name: supplier.name,
        totalOrders: supplier._count.purchaseOrders,
        totalValue,
        averageConfidence: avgConfidence,
        statusBreakdown: statusCounts,
        lastOrderDate: orders.length > 0 
          ? Math.max(...orders.map(po => new Date(po.createdAt).getTime())) 
          : null
      }
    })

    res.json({
      success: true,
      data: supplierStats
    })
  } catch (error) {
    console.error('Get supplier analytics error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get supplier analytics'
    })
  }
})

// GET /api/analytics/trends - Get processing trends
router.get('/trends', async (req, res) => {
  try {
    const merchant = req.merchant
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      })
    }

    const { period = '7d' } = req.query
    
  const prisma = await db.getClient()

    let startDate
    switch (period) {
      case '24h':
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
        break
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        break
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        break
      default:
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    }

  const orders = await prisma.purchaseOrder.findMany({
      where: {
        merchantId: merchant.id,
        createdAt: {
          gte: startDate
        }
      },
      select: {
        createdAt: true,
        status: true,
        confidence: true,
        totalAmount: true
      },
      orderBy: { createdAt: 'asc' }
    })

    // Group by day
    const dailyStats = {}
    orders.forEach(order => {
      const day = order.createdAt.toISOString().split('T')[0]
      if (!dailyStats[day]) {
        dailyStats[day] = {
          date: day,
          count: 0,
          totalValue: 0,
          avgConfidence: 0,
          statusCounts: {}
        }
      }
      
      dailyStats[day].count++
      dailyStats[day].totalValue += order.totalAmount
      dailyStats[day].avgConfidence += order.confidence
      dailyStats[day].statusCounts[order.status] = 
        (dailyStats[day].statusCounts[order.status] || 0) + 1
    })

    // Calculate averages
    Object.values(dailyStats).forEach(day => {
      day.avgConfidence = day.count > 0 ? day.avgConfidence / day.count : 0
    })

    res.json({
      success: true,
      data: {
        period,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString(),
        dailyStats: Object.values(dailyStats)
      }
    })
  } catch (error) {
    console.error('Get trends error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get processing trends'
    })
  }
})

export default router