/**
 * Line Items API routes
 */

import express from 'express'
import { db } from '../lib/db.js'
import { productConsolidationService } from '../lib/productConsolidationService.js'

const router = express.Router()

// GET /api/line-items/purchase-order/:poId - Get line items for a purchase order
router.get('/purchase-order/:poId', async (req, res) => {
  try {
    const merchant = req.merchant
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      })
    }

    const prisma = await db.getClient()

    // Verify the purchase order belongs to the merchant
    const po = await prisma.purchaseOrder.findFirst({
      where: { 
        id: req.params.poId,
        merchantId: merchant.id 
      }
    })

    if (!po) {
      return res.status(404).json({
        success: false,
        error: 'Purchase order not found'
      })
    }

    const lineItems = await prisma.pOLineItem.findMany({
      where: { purchaseOrderId: req.params.poId },
      orderBy: { createdAt: 'asc' }
    })

    // Transform database fields to match frontend expectations
    const transformedItems = lineItems.map(item => ({
      id: item.id,
      sku: item.sku,
      productName: item.productName,
      name: item.productName, // Alias for compatibility
      description: item.description || item.productName,
      item_description: item.description, // Alias
      quantity: item.quantity,
      qty: item.quantity, // Alias
      unitPrice: item.unitCost,
      unit_price: item.unitCost, // Alias
      price: item.unitCost, // Alias
      totalPrice: item.totalCost,
      total_price: item.totalCost, // Alias
      total: item.totalCost, // Alias
      confidence: Math.round(item.confidence * 100), // Convert 0-1 to 0-100
      status: item.status,
      shopifyProductId: item.shopifyProductId,
      shopifyVariantId: item.shopifyVariantId,
      aiNotes: item.aiNotes,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }))

    // Check if consolidation is requested (default: enabled for UI display)
    const consolidate = req.query.consolidate !== 'false'
    const enableConsolidation = process.env.ENABLE_PRODUCT_CONSOLIDATION !== 'false'
    
    let responseData = transformedItems
    
    if (consolidate && enableConsolidation && productConsolidationService.shouldConsolidate(transformedItems)) {
      responseData = productConsolidationService.consolidateLineItems(transformedItems)
      console.log(`📦 API consolidation: ${transformedItems.length} items → ${responseData.length} products`)
    }

    res.json({
      success: true,
      data: responseData,
      meta: {
        totalItems: lineItems.length,
        consolidated: responseData.length !== transformedItems.length,
        consolidatedCount: responseData.length
      }
    })
  } catch (error) {
    console.error('Get line items error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get line items'
    })
  }
})

// PUT /api/line-items/:id - Update line item
router.put('/:id', async (req, res) => {
  try {
    const merchant = req.merchant
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      })
    }

    const prisma = await db.getClient()

    // Get the line item to verify merchant access
    const lineItem = await prisma.pOLineItem.findFirst({
      where: { id: req.params.id },
      include: {
        purchaseOrder: {
          select: { merchantId: true }
        }
      }
    })

    if (!lineItem || lineItem.purchaseOrder.merchantId !== merchant.id) {
      return res.status(404).json({
        success: false,
        error: 'Line item not found'
      })
    }

    const updatedLineItem = await prisma.pOLineItem.update({
      where: { id: req.params.id },
      data: req.body
    })

    res.json({
      success: true,
      data: updatedLineItem
    })
  } catch (error) {
    console.error('Update line item error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to update line item'
    })
  }
})

// POST /api/line-items/:id/match-shopify - Match line item to Shopify product
router.post('/:id/match-shopify', async (req, res) => {
  try {
    const merchant = req.merchant
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      })
    }

    const { shopifyProductId, shopifyVariantId } = req.body

    const prisma = await db.getClient()

    // Get the line item to verify merchant access
    const lineItem = await prisma.pOLineItem.findFirst({
      where: { id: req.params.id },
      include: {
        purchaseOrder: {
          select: { merchantId: true }
        }
      }
    })

    if (!lineItem || lineItem.purchaseOrder.merchantId !== merchant.id) {
      return res.status(404).json({
        success: false,
        error: 'Line item not found'
      })
    }

  const updatedLineItem = await prisma.pOLineItem.update({
      where: { id: req.params.id },
      data: {
        shopifyProductId,
        shopifyVariantId,
        status: 'matched',
        aiNotes: 'Manually matched to Shopify product'
      }
    })

    res.json({
      success: true,
      data: updatedLineItem,
      message: 'Line item matched to Shopify product successfully'
    })
  } catch (error) {
    console.error('Match Shopify product error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to match line item to Shopify product'
    })
  }
})

export default router