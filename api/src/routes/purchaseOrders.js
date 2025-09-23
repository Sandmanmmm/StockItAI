/**
 * Purchase Orders API routes
 */

import express from 'express'
import { db } from '../lib/db.js'

const router = express.Router()

// Test endpoint to verify route registration
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Purchase orders route is working!', merchant: req.merchant?.id })
})

// GET /api/purchase-orders - Get purchase orders with filtering and pagination
router.get('/', async (req, res) => {
  try {
    // Validate database connection
    if (!db || !db.client) {
      console.error('Database client not available')
      return res.status(500).json({
        success: false,
        error: 'Database connection unavailable'
      })
    }

    // Get merchant - with fallback for development
    let merchant
    try {
      merchant = await db.getCurrentMerchant()
      if (!merchant) {
        console.log('No merchant found, attempting to create development merchant')
        // Create a test merchant for development
        merchant = await db.client.merchant.upsert({
          where: { shopDomain: 'dev-test.myshopify.com' },
          update: {},
          create: {
            name: 'Development Test Store',
            shopDomain: 'dev-test.myshopify.com',
            email: 'dev-test@shopify.com',
            status: 'active',
            currency: 'USD',
            plan: 'basic'
          }
        })
      }
    } catch (merchantError) {
      console.error('Merchant lookup/creation error:', merchantError)
      return res.status(500).json({
        success: false,
        error: 'Failed to authenticate merchant'
      })
    }

    // Parse and validate query parameters
    const limit = Math.min(parseInt(req.query.limit) || 50, 100) // Cap at 100
    const offset = Math.max(parseInt(req.query.offset) || 0, 0)   // Non-negative
    const status = req.query.status?.toString().trim()
    const supplierId = req.query.supplierId?.toString().trim()

    // Build where clause
    const where = { merchantId: merchant.id }
    if (status && ['pending', 'processing', 'completed', 'failed', 'review_needed'].includes(status)) {
      where.status = status
    }
    if (supplierId) {
      where.supplierId = supplierId
    }

    // Handle date filtering safely
    if (req.query.dateFrom || req.query.dateTo) {
      where.createdAt = {}
      if (req.query.dateFrom) {
        const fromDate = new Date(req.query.dateFrom)
        if (!isNaN(fromDate.getTime())) {
          where.createdAt.gte = fromDate
        }
      }
      if (req.query.dateTo) {
        const toDate = new Date(req.query.dateTo)
        if (!isNaN(toDate.getTime())) {
          where.createdAt.lte = toDate
        }
      }
    }

    // Execute database queries with error handling
    let orders = []
    let total = 0

    try {
      // Get orders with safe includes
      orders = await db.client.purchaseOrder.findMany({
        where,
        select: {
          id: true,
          number: true,
          supplierName: true,
          orderDate: true,
          dueDate: true,
          totalAmount: true,
          currency: true,
          status: true,
          confidence: true,
          fileName: true,
          fileSize: true,
          processingNotes: true,
          createdAt: true,
          updatedAt: true,
          supplierId: true,
          supplier: {
            select: {
              id: true,
              name: true,
              status: true
            }
          },
          _count: {
            select: {
              lineItems: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      })

      // Get total count
      total = await db.client.purchaseOrder.count({ where })

    } catch (queryError) {
      console.error('Database query error:', queryError)
      // Return empty result instead of failing
      orders = []
      total = 0
    }

    // Transform data to match frontend expectations
    const transformedOrders = orders.map(order => ({
      ...order,
      totalItems: order._count?.lineItems || 0
    }))

    console.log(`Purchase orders endpoint: Found ${orders.length} orders, total: ${total}`)

    res.json({
      success: true,
      data: {
        orders: transformedOrders,
        total,
        limit,
        offset
      }
    })

  } catch (error) {
    console.error('Purchase orders endpoint error:', error)
    res.status(500).json({
      success: false,
      error: 'Server error - please try again later',
      code: 'INTERNAL_ERROR'
    })
  }
})

// GET /api/purchase-orders/:id - Get single purchase order with full details
router.get('/:id', async (req, res) => {
  try {
    const merchant = await db.getCurrentMerchant()
    if (!merchant) {
      return res.status(401).json({
        success: false,
        error: 'Merchant not found'
      })
    }

    const order = await db.client.purchaseOrder.findFirst({
      where: { 
        id: req.params.id,
        merchantId: merchant.id 
      },
      include: {
        supplier: true,
        lineItems: {
          orderBy: { createdAt: 'asc' }
        }
      }
    })

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Purchase order not found'
      })
    }

    res.json({
      success: true,
      data: order
    })
  } catch (error) {
    console.error('Get purchase order error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get purchase order'
    })
  }
})

// POST /api/purchase-orders - Create new purchase order
router.post('/', async (req, res) => {
  try {
    const merchant = await db.getCurrentMerchant()
    if (!merchant) {
      return res.status(401).json({
        success: false,
        error: 'Merchant not found'
      })
    }

    const { lineItems, ...orderData } = req.body

    const order = await db.client.purchaseOrder.create({
      data: {
        ...orderData,
        merchantId: merchant.id,
        lineItems: lineItems ? {
          create: lineItems
        } : undefined
      },
      include: {
        supplier: true,
        lineItems: true
      }
    })

    res.status(201).json({
      success: true,
      data: order
    })
  } catch (error) {
    console.error('Create purchase order error:', error)
    if (error.code === 'P2002') {
      return res.status(400).json({
        success: false,
        error: 'Purchase order number already exists'
      })
    }
    res.status(500).json({
      success: false,
      error: 'Failed to create purchase order'
    })
  }
})

// PUT /api/purchase-orders/:id - Update purchase order
router.put('/:id', async (req, res) => {
  try {
    const merchant = await db.getCurrentMerchant()
    if (!merchant) {
      return res.status(401).json({
        success: false,
        error: 'Merchant not found'
      })
    }

    const order = await db.client.purchaseOrder.updateMany({
      where: { 
        id: req.params.id,
        merchantId: merchant.id 
      },
      data: req.body
    })

    if (order.count === 0) {
      return res.status(404).json({
        success: false,
        error: 'Purchase order not found'
      })
    }

    // Fetch updated order
    const updatedOrder = await db.client.purchaseOrder.findFirst({
      where: { 
        id: req.params.id,
        merchantId: merchant.id 
      },
      include: {
        supplier: true,
        lineItems: true
      }
    })

    res.json({
      success: true,
      data: updatedOrder
    })
  } catch (error) {
    console.error('Update purchase order error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to update purchase order'
    })
  }
})

// DELETE /api/purchase-orders/:id - Delete purchase order
router.delete('/:id', async (req, res) => {
  try {
    const merchant = await db.getCurrentMerchant()
    if (!merchant) {
      return res.status(401).json({
        success: false,
        error: 'Merchant not found'
      })
    }

    const order = await db.client.purchaseOrder.deleteMany({
      where: { 
        id: req.params.id,
        merchantId: merchant.id 
      }
    })

    if (order.count === 0) {
      return res.status(404).json({
        success: false,
        error: 'Purchase order not found'
      })
    }

    res.json({
      success: true,
      message: 'Purchase order deleted successfully'
    })
  } catch (error) {
    console.error('Delete purchase order error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to delete purchase order'
    })
  }
})

export default router