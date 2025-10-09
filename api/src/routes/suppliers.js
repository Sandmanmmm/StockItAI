/**
 * Suppliers API routes
 */

import express from 'express'
import { db } from '../lib/db.js'
import { getSupplierMetrics, calculateSupplierMetrics } from '../services/supplierMetricsService.js'
import { findMatchingSuppliers, autoMatchSupplier, suggestSuppliers } from '../services/supplierMatchingService.js'

const router = express.Router()

// GET /api/suppliers - Get all suppliers
router.get('/', async (req, res) => {
  try {
    const prisma = await db.getClient()
    const merchant = req.merchant
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      })
    }

    const suppliers = await prisma.supplier.findMany({
      where: { merchantId: merchant.id },
      orderBy: { createdAt: 'desc' }
    })

    res.json({
      success: true,
      data: suppliers
    })
  } catch (error) {
    console.error('Get suppliers error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get suppliers'
    })
  }
})

// GET /api/suppliers/:id - Get single supplier
router.get('/:id', async (req, res) => {
  try {
    const prisma = await db.getClient()
    const merchant = req.merchant
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      })
    }

    const supplier = await prisma.supplier.findFirst({
      where: { 
        id: req.params.id,
        merchantId: merchant.id 
      },
      include: {
        purchaseOrders: {
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      }
    })

    if (!supplier) {
      return res.status(404).json({
        success: false,
        error: 'Supplier not found'
      })
    }

    res.json({
      success: true,
      data: supplier
    })
  } catch (error) {
    console.error('Get supplier error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get supplier'
    })
  }
})

// POST /api/suppliers - Create new supplier
router.post('/', async (req, res) => {
  try {
    const prisma = await db.getClient()
    const merchant = req.merchant
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      })
    }

    // Validate required fields
    if (!req.body.name || !req.body.contactEmail) {
      return res.status(400).json({
        success: false,
        error: 'Name and contact email are required'
      })
    }

    // Prepare supplier data
    const supplierData = {
      name: req.body.name,
      contactEmail: req.body.contactEmail,
      contactPhone: req.body.contactPhone || null,
      address: req.body.address || null,
      website: req.body.website || null,
      status: req.body.status || 'active',
      category: req.body.category || null,
      priority: req.body.priority || 'medium',
      connectionType: req.body.connectionType || 'manual',
      merchantId: merchant.id
    }

    // Handle categories array as JSON
    if (req.body.categories && Array.isArray(req.body.categories)) {
      supplierData.categories = req.body.categories
    }

    const supplier = await prisma.supplier.create({
      data: supplierData
    })

    console.log('✅ Supplier created:', supplier.name)

    res.status(201).json({
      success: true,
      data: supplier,
      message: 'Supplier created successfully'
    })
  } catch (error) {
    console.error('Create supplier error:', error)
    if (error.code === 'P2002') {
      return res.status(400).json({
        success: false,
        error: 'A supplier with this name already exists'
      })
    }
    res.status(500).json({
      success: false,
      error: 'Failed to create supplier'
    })
  }
})

// PUT /api/suppliers/:id - Update supplier
router.put('/:id', async (req, res) => {
  try {
    const prisma = await db.getClient()
    const merchant = req.merchant
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      })
    }

    const supplier = await prisma.supplier.updateMany({
      where: { 
        id: req.params.id,
        merchantId: merchant.id 
      },
      data: req.body
    })

    if (supplier.count === 0) {
      return res.status(404).json({
        success: false,
        error: 'Supplier not found'
      })
    }

    // Fetch updated supplier
    const updatedSupplier = await prisma.supplier.findFirst({
      where: { 
        id: req.params.id,
        merchantId: merchant.id 
      }
    })

    res.json({
      success: true,
      data: updatedSupplier
    })
  } catch (error) {
    console.error('Update supplier error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to update supplier'
    })
  }
})

// DELETE /api/suppliers/:id - Delete supplier
router.delete('/:id', async (req, res) => {
  try {
    const prisma = await db.getClient()
    const merchant = req.merchant
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      })
    }

    // Check if supplier has purchase orders
    const poCount = await prisma.purchaseOrder.count({
      where: { 
        supplierId: req.params.id,
        merchantId: merchant.id 
      }
    })

    if (poCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete supplier with ${poCount} purchase orders. Archive it instead.`
      })
    }

    const supplier = await prisma.supplier.deleteMany({
      where: { 
        id: req.params.id,
        merchantId: merchant.id 
      }
    })

    if (supplier.count === 0) {
      return res.status(404).json({
        success: false,
        error: 'Supplier not found'
      })
    }

    res.json({
      success: true,
      message: 'Supplier deleted successfully'
    })
  } catch (error) {
    console.error('Delete supplier error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to delete supplier'
    })
  }
})

// GET /api/suppliers/:id/metrics - Get supplier performance metrics
router.get('/:id/metrics', async (req, res) => {
  try {
    const prisma = await db.getClient()
    const merchant = req.merchant
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      })
    }

    // Verify supplier belongs to merchant
    const supplier = await prisma.supplier.findFirst({
      where: { 
        id: req.params.id,
        merchantId: merchant.id 
      }
    })

    if (!supplier) {
      return res.status(404).json({
        success: false,
        error: 'Supplier not found'
      })
    }

    // Get cached metrics or calculate if needed
    const maxAgeMinutes = parseInt(req.query.maxAge) || 60
    const forceRecalculate = req.query.refresh === 'true'

    let metrics
    if (forceRecalculate) {
      metrics = await calculateSupplierMetrics(req.params.id)
    } else {
      metrics = await getSupplierMetrics(req.params.id, maxAgeMinutes)
    }

    res.json({
      success: true,
      data: metrics
    })
  } catch (error) {
    console.error('Get supplier metrics error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get supplier metrics'
    })
  }
})

// POST /api/suppliers/:id/metrics/refresh - Force recalculate metrics
router.post('/:id/metrics/refresh', async (req, res) => {
  try {
    const prisma = await db.getClient()
    const merchant = req.merchant
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      })
    }

    // Verify supplier belongs to merchant
    const supplier = await prisma.supplier.findFirst({
      where: { 
        id: req.params.id,
        merchantId: merchant.id 
      }
    })

    if (!supplier) {
      return res.status(404).json({
        success: false,
        error: 'Supplier not found'
      })
    }

    // Force recalculate metrics
    const metrics = await calculateSupplierMetrics(req.params.id)

    res.json({
      success: true,
      data: metrics,
      message: 'Metrics refreshed successfully'
    })
  } catch (error) {
    console.error('Refresh supplier metrics error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to refresh metrics'
    })
  }
})

// POST /api/suppliers/match - Find matching suppliers for parsed supplier data
router.post('/match', async (req, res) => {
  try {
    const merchant = req.merchant
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      })
    }

    const { supplier: parsedSupplier, options = {} } = req.body

    // Validate input
    if (!parsedSupplier || !parsedSupplier.name) {
      return res.status(400).json({
        success: false,
        error: 'Supplier data with name is required'
      })
    }

    console.log('🔍 Matching request for supplier:', parsedSupplier.name)

    // Find matches
    const matches = await findMatchingSuppliers(parsedSupplier, merchant.id, {
      minScore: options.minScore || 0.7,
      maxResults: options.maxResults || 5,
      includeInactive: options.includeInactive || false
    })

    res.json({
      success: true,
      data: {
        parsedSupplier,
        matches,
        matchCount: matches.length
      }
    })
  } catch (error) {
    console.error('Supplier matching error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to match supplier'
    })
  }
})

// POST /api/suppliers/suggest/:purchaseOrderId - Get supplier suggestions for PO
router.post('/suggest/:purchaseOrderId', async (req, res) => {
  try {
    const prisma = await db.getClient()
    const merchant = req.merchant
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      })
    }

    // Get purchase order
    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: {
        id: req.params.purchaseOrderId,
        merchantId: merchant.id
      }
    })

    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        error: 'Purchase order not found'
      })
    }

    // Extract supplier data from PO
    let parsedSupplier = null
    
    if (purchaseOrder.rawData?.extractedData?.supplier) {
      parsedSupplier = purchaseOrder.rawData.extractedData.supplier
    } else if (purchaseOrder.rawData?.supplier) {
      parsedSupplier = purchaseOrder.rawData.supplier
    } else if (purchaseOrder.supplierName) {
      parsedSupplier = { name: purchaseOrder.supplierName }
    }

    if (!parsedSupplier || !parsedSupplier.name) {
      return res.status(400).json({
        success: false,
        error: 'No supplier information found in purchase order'
      })
    }

    // Enhance parsedSupplier with currency from PO if available
    if (purchaseOrder.currency && !parsedSupplier.currency) {
      parsedSupplier.currency = purchaseOrder.currency
    }

    // Get suggestions
    const suggestions = await suggestSuppliers(parsedSupplier, merchant.id)

    res.json({
      success: true,
      data: {
        purchaseOrderId: purchaseOrder.id,
        purchaseOrderNumber: purchaseOrder.number,
        currentSupplierId: purchaseOrder.supplierId,
        ...suggestions
      }
    })
  } catch (error) {
    console.error('Supplier suggestion error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get supplier suggestions'
    })
  }
})

// POST /api/suppliers/auto-match/:purchaseOrderId - Auto-match and link supplier
router.post('/auto-match/:purchaseOrderId', async (req, res) => {
  try {
    const prisma = await db.getClient()
    const merchant = req.merchant
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      })
    }

    // Get purchase order
    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: {
        id: req.params.purchaseOrderId,
        merchantId: merchant.id
      }
    })

    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        error: 'Purchase order not found'
      })
    }

    // Extract supplier data
    let parsedSupplier = null
    
    if (purchaseOrder.rawData?.extractedData?.supplier) {
      parsedSupplier = purchaseOrder.rawData.extractedData.supplier
    } else if (purchaseOrder.rawData?.supplier) {
      parsedSupplier = purchaseOrder.rawData.supplier
    } else if (purchaseOrder.supplierName) {
      parsedSupplier = { name: purchaseOrder.supplierName }
    }

    if (!parsedSupplier || !parsedSupplier.name) {
      return res.status(400).json({
        success: false,
        error: 'No supplier information found in purchase order'
      })
    }

    const { options = {} } = req.body

    // Auto-match supplier
    const result = await autoMatchSupplier(
      purchaseOrder.id,
      parsedSupplier,
      merchant.id,
      {
        autoLink: options.autoLink !== false, // Default true
        minAutoLinkScore: options.minAutoLinkScore || 0.85,
        createIfNoMatch: options.createIfNoMatch || false
      }
    )

    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error('Auto-match supplier error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to auto-match supplier'
    })
  }
})

// PUT /api/suppliers/link/:purchaseOrderId/:supplierId - Manually link supplier to PO
router.put('/link/:purchaseOrderId/:supplierId', async (req, res) => {
  try {
    const prisma = await db.getClient()
    const merchant = req.merchant
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      })
    }

    // Verify purchase order
    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: {
        id: req.params.purchaseOrderId,
        merchantId: merchant.id
      }
    })

    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        error: 'Purchase order not found'
      })
    }

    // Verify supplier
    const supplier = await prisma.supplier.findFirst({
      where: {
        id: req.params.supplierId,
        merchantId: merchant.id
      }
    })

    if (!supplier) {
      return res.status(404).json({
        success: false,
        error: 'Supplier not found'
      })
    }

    // Link supplier to purchase order
    const updatedPO = await prisma.purchaseOrder.update({
      where: { id: purchaseOrder.id },
      data: {
        supplierId: supplier.id,
        supplierName: supplier.name,
        updatedAt: new Date()
      }
    })

    res.json({
      success: true,
      data: {
        purchaseOrder: updatedPO,
        supplier,
        message: 'Supplier linked successfully'
      }
    })
  } catch (error) {
    console.error('Link supplier error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to link supplier'
    })
  }
})

export default router