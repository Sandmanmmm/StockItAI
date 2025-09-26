/**
 * Purchase Orders API routes
 */

import express from 'express'
import { db } from '../lib/db.js'
import { workflowOrchestrator } from '../lib/workflowOrchestrator.js'

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
          rawData: true, // Include AI analysis data
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
        },
        aiAuditTrail: {
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

// POST /api/purchase-orders/:id/deny - Deny a purchase order
router.post('/:id/deny', async (req, res) => {
  try {
    const merchant = await db.getCurrentMerchant()
    if (!merchant) {
      return res.status(401).json({
        success: false,
        error: 'Merchant not found'
      })
    }

    const { reason } = req.body

    // Update the purchase order status to denied
    const updatedOrder = await db.client.purchaseOrder.update({
      where: { 
        id: req.params.id,
        merchantId: merchant.id 
      },
      data: {
        status: 'denied',
        processingNotes: reason || 'Denied by merchant',
        jobStatus: 'completed',
        jobCompletedAt: new Date(),
        updatedAt: new Date()
      }
    })

    console.log(`Purchase order ${req.params.id} denied by merchant: ${reason || 'No reason provided'}`)

    res.json({
      success: true,
      message: 'Purchase order denied successfully',
      data: updatedOrder
    })
  } catch (error) {
    console.error('Deny purchase order error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to deny purchase order'
    })
  }
})

// POST /api/purchase-orders/:id/approve - Approve and sync to Shopify
router.post('/:id/approve', async (req, res) => {
  try {
    const merchant = await db.getCurrentMerchant()
    if (!merchant) {
      return res.status(401).json({
        success: false,
        error: 'Merchant not found'
      })
    }

    const { editedData } = req.body

    // Update the purchase order with any edited data
    const updateData = {
      status: 'completed', // Change from 'approved' to 'completed' - the final successful state
      jobStatus: 'processing',
      jobStartedAt: new Date(),
      updatedAt: new Date()
    }

    // Apply any edited data
    if (editedData) {
      if (editedData.supplierName) updateData.supplierName = editedData.supplierName
      if (editedData.totalAmount) updateData.totalAmount = editedData.totalAmount
      if (editedData.orderDate) updateData.orderDate = new Date(editedData.orderDate)
      if (editedData.dueDate) updateData.dueDate = new Date(editedData.dueDate)
      if (editedData.processingNotes) updateData.processingNotes = editedData.processingNotes
    }

    const updatedOrder = await db.client.purchaseOrder.update({
      where: { 
        id: req.params.id,
        merchantId: merchant.id 
      },
      data: updateData
    })

    console.log(`Purchase order ${req.params.id} approved by merchant - initiating Shopify sync`)

    // TODO: Trigger Shopify sync workflow here
    // For now, just mark as completed (approved and ready)
    await db.client.purchaseOrder.update({
      where: { id: req.params.id },
      data: {
        status: 'completed', // Final successful state after approval
        jobStatus: 'completed',
        jobCompletedAt: new Date(),
        processingNotes: (updateData.processingNotes || '') + ' (Approved by merchant, Shopify sync pending)'
      }
    })

    res.json({
      success: true,
      message: 'Purchase order approved successfully',
      data: updatedOrder
    })
  } catch (error) {
    console.error('Approve purchase order error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to approve purchase order'
    })
  }
})

// POST /api/purchase-orders/:id/edit - Save edited purchase order data
router.post('/:id/edit', async (req, res) => {
  try {
    const merchant = await db.getCurrentMerchant()
    if (!merchant) {
      return res.status(401).json({
        success: false,
        error: 'Merchant not found'
      })
    }

    const { editedData } = req.body

    if (!editedData) {
      return res.status(400).json({
        success: false,
        error: 'No edited data provided'
      })
    }

    // Update the purchase order with edited data
    const updateData = {
      updatedAt: new Date()
    }

    // Apply edited fields
    if (editedData.supplierName) updateData.supplierName = editedData.supplierName
    if (editedData.totalAmount !== undefined) updateData.totalAmount = editedData.totalAmount
    if (editedData.orderDate) updateData.orderDate = new Date(editedData.orderDate)
    if (editedData.dueDate) updateData.dueDate = new Date(editedData.dueDate)
    if (editedData.processingNotes) updateData.processingNotes = editedData.processingNotes
    if (editedData.status) updateData.status = editedData.status

    const updatedOrder = await db.client.purchaseOrder.update({
      where: { 
        id: req.params.id,
        merchantId: merchant.id 
      },
      data: updateData,
      include: {
        supplier: true,
        lineItems: {
          orderBy: { createdAt: 'asc' }
        },
        aiAuditTrail: {
          orderBy: { createdAt: 'asc' }
        }
      }
    })

    // Handle line items updates if provided
    if (editedData.lineItems && Array.isArray(editedData.lineItems)) {
      console.log(`Updating ${editedData.lineItems.length} line items for PO ${req.params.id}`)
      
      // For now, we'll just update existing line items
      // In a full implementation, you'd handle create/update/delete operations
      for (const item of editedData.lineItems) {
        if (item.id) {
          await db.client.pOLineItem.update({
            where: { id: item.id },
            data: {
              sku: item.sku,
              productName: item.productName,
              description: item.description,
              quantity: item.quantity,
              unitCost: item.unitCost,
              totalCost: item.totalCost,
              updatedAt: new Date()
            }
          })
        }
      }
    }

    console.log(`Purchase order ${req.params.id} edited by merchant`)

    res.json({
      success: true,
      message: 'Purchase order updated successfully',
      data: updatedOrder
    })
  } catch (error) {
    console.error('Edit purchase order error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to update purchase order'
    })
  }
})



// POST /api/purchase-orders/:id/reject - Reject a purchase order
router.post('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params
    const { reason } = req.body
    
    // Update PO status to rejected with reason
    const updatedPO = await db.client.purchaseOrder.update({
      where: { id },
      data: {
        status: 'rejected',
        aiResponse: {
          ...updatedPO?.aiResponse || {},
          rejectionReason: reason,
          rejectedAt: new Date().toISOString()
        },
        updatedAt: new Date()
      }
    })
    
    console.log(`Purchase order ${id} rejected: ${reason}`)
    
    res.json({
      success: true,
      message: 'Purchase order rejected successfully',
      data: updatedPO
    })
  } catch (error) {
    console.error('Reject purchase order error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to reject purchase order'
    })
  }
})

// POST /api/purchase-orders/:id/reprocess - Reprocess a purchase order with AI
router.post('/:id/reprocess', async (req, res) => {
  try {
    const { id } = req.params
    
    // Get the PO with upload information
    const po = await db.client.purchaseOrder.findUnique({
      where: { id },
      include: {
        upload: true
      }
    })
    
    if (!po || !po.upload) {
      return res.status(404).json({
        success: false,
        error: 'Purchase order or associated upload not found'
      })
    }
    
    // Use the singleton workflowOrchestrator instance
    // (Already imported at the top of the file)
    
    // Create a new workflow for reprocessing
    // const workflowId = `reprocess_${Date.now()}` // Will be generated by startWorkflow
    
    // Update PO status to processing
    await db.client.purchaseOrder.update({
      where: { id },
      data: {
        status: 'processing',
        updatedAt: new Date()
      }
    })
    
    // Queue AI reprocessing job using the correct orchestrator method
    const workflowId = await workflowOrchestrator.startWorkflow({
      uploadId: po.upload.id,
      fileBuffer: null, // Will be downloaded from storage
      fileName: po.upload.originalFileName,
      merchantId: po.merchantId || 'default',
      options: {
        confidenceThreshold: 0.85,
        strictMatching: true,
        reprocessing: true
      }
    })
    
    console.log(`Purchase order ${id} queued for reprocessing with workflow ${workflowId}`)
    
    res.json({
      success: true,
      message: 'Purchase order queued for reprocessing',
      workflowId
    })
  } catch (error) {
    console.error('Reprocess purchase order error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to reprocess purchase order'
    })
  }
})

export default router