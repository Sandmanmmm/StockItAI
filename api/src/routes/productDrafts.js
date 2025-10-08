import express from 'express'
import { SimpleProductDraftService } from '../services/simpleProductDraftService.js'
import { db } from '../lib/db.js'
import { devBypassAuth } from '../lib/auth.js'

const router = express.Router()
const productDraftService = new SimpleProductDraftService(db.client)

// Get product draft by line item ID
router.get('/by-line-item/:lineItemId', devBypassAuth, async (req, res) => {
  try {
    const { lineItemId } = req.params
    
    const productDraft = await db.client.productDraft.findFirst({
      where: { lineItemId },
      include: {
        session: true,
        merchant: true,
        purchaseOrder: true,
        POLineItem: true,
        images: true,
        variants: true,
        reviewHistory: true
      }
    })
    
    if (!productDraft) {
      return res.status(404).json({
        success: false,
        error: 'Product draft not found'
      })
    }

    // Clean the data to avoid JSON serialization issues
    const cleanProductDraft = {
      id: productDraft.id,
      sessionId: productDraft.sessionId,
      merchantId: productDraft.merchantId,
      purchaseOrderId: productDraft.purchaseOrderId,
      lineItemId: productDraft.lineItemId,
      supplierId: productDraft.supplierId,
      originalTitle: productDraft.originalTitle,
      refinedTitle: productDraft.refinedTitle,
      originalDescription: productDraft.originalDescription,
      refinedDescription: productDraft.refinedDescription,
      originalPrice: productDraft.originalPrice,
      priceRefined: productDraft.priceRefined,
      estimatedMargin: productDraft.estimatedMargin,
      shopifyProductId: productDraft.shopifyProductId,
      shopifyVariantId: productDraft.shopifyVariantId,
      status: productDraft.status,
      tags: productDraft.tags,
      categoryId: productDraft.categoryId,
      reviewNotes: productDraft.reviewNotes,
      reviewedBy: productDraft.reviewedBy,
      reviewedAt: productDraft.reviewedAt,
      createdAt: productDraft.createdAt,
      updatedAt: productDraft.updatedAt,
      // Include basic info from relations
      session: productDraft.session ? {
        id: productDraft.session.id,
        shop: productDraft.session.shop
      } : null,
      merchant: productDraft.merchant ? {
        id: productDraft.merchant.id,
        name: productDraft.merchant.name
      } : null,
      lineItem: productDraft.POLineItem ? {
        id: productDraft.POLineItem.id,
        productName: productDraft.POLineItem.productName,
        sku: productDraft.POLineItem.sku
      } : null
    }

    res.json({
      success: true,
      data: cleanProductDraft
    })
  } catch (error) {
    console.error('Error fetching product draft by line item:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product draft'
    })
  }
})

// Get all product drafts for a merchant
router.get('/', devBypassAuth, async (req, res) => {
  try {
    // Get merchantId from authenticated request or query parameter
    const merchantId = req.merchant?.id || req.query.merchantId
    
    if (!merchantId) {
      return res.status(400).json({
        success: false,
        error: 'Merchant ID is required'
      })
    }
    
    // Extract filter parameters
    const { status, syncStatus, supplierId } = req.query
    
    // Build where clause
    const where = { merchantId }
    
    // Handle status filter - map syncStatus to status values
    if (syncStatus) {
      // Map frontend syncStatus to backend status enum
      const statusMap = {
        'not_synced': ['DRAFT', 'PENDING_REVIEW', 'APPROVED'],
        'syncing': 'SYNCING',
        'synced': 'SYNCED',
        'failed': 'FAILED'
      }
      
      const mappedStatus = statusMap[syncStatus]
      if (Array.isArray(mappedStatus)) {
        where.status = { in: mappedStatus }
      } else if (mappedStatus) {
        where.status = mappedStatus
      }
    } else if (status) {
      where.status = status
    }
    
    if (supplierId) {
      where.supplierId = supplierId
    }
    
    // Fetch product drafts with filters
    const productDrafts = await db.client.productDraft.findMany({
      where,
      include: {
        images: true,
        variants: true,
        POLineItem: {
          select: {
            id: true,
            productName: true,
            sku: true,
            quantity: true,
            unitCost: true,
            totalCost: true
          }
        },
        purchaseOrder: {
          select: {
            id: true,
            number: true
          }
        },
        supplier: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
    
    // Calculate stats - map status to syncStatus for frontend
    const stats = {
      not_synced: productDrafts.filter(d => ['DRAFT', 'PENDING_REVIEW', 'APPROVED'].includes(d.status)).length,
      syncing: productDrafts.filter(d => d.status === 'SYNCING').length,
      synced: productDrafts.filter(d => d.status === 'SYNCED').length,
      failed: productDrafts.filter(d => d.status === 'FAILED' || d.status === 'REJECTED').length,
      total: productDrafts.length
    }
    
    // Map status to syncStatus for frontend compatibility
    const mappedDrafts = productDrafts.map(draft => {
      let syncStatus = 'not_synced'
      if (draft.status === 'SYNCING') syncStatus = 'syncing'
      else if (draft.status === 'SYNCED') syncStatus = 'synced'
      else if (draft.status === 'FAILED' || draft.status === 'REJECTED') syncStatus = 'failed'
      
      // Map images: originalUrl -> url, keep enhancedUrl, extract approval status from enhancementData
      const mappedImages = draft.images?.map(img => ({
        id: img.id,
        url: img.originalUrl,
        enhancedUrl: img.enhancedUrl,
        altText: img.altText,
        position: img.position,
        isEnhanced: img.isEnhanced,
        isApproved: img.enhancementData?.isApproved || false,
        isSelected: img.enhancementData?.isSelected || false
      })) || []
      
      return {
        ...draft,
        title: draft.refinedTitle || draft.originalTitle, // Use refined title, fallback to original
        originalTitle: draft.originalTitle,
        refinedTitle: draft.refinedTitle,
        syncStatus,
        images: mappedImages
      }
    })
    
    // Convert BigInt fields to strings for JSON serialization
    const serializedDrafts = JSON.parse(JSON.stringify(mappedDrafts, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ))
    
    res.json({
      success: true,
      data: {
        productDrafts: serializedDrafts,
        total: productDrafts.length,
        stats
      }
    })
  } catch (error) {
    console.error('Error fetching product drafts:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product drafts'
    })
  }
})

// Create a new product draft
router.post('/', devBypassAuth, async (req, res) => {
  try {
    // Get merchant from authenticated request (set by devBypassAuth middleware)
    if (!req.merchant) {
      return res.status(401).json({
        success: false,
        error: 'No authenticated merchant found'
      })
    }
    
    const merchantId = req.merchant.id
    
    const {
      purchaseOrderId,
      lineItemId,
      supplierId,
      originalTitle,
      originalDescription,
      originalPrice,
      priceRefined,
      estimatedMargin,
      reviewNotes
    } = req.body
    
    // Handle supplierId - convert "unknown" to null for database
    const cleanSupplierId = supplierId === 'unknown' || supplierId === '' ? null : supplierId
    
    console.log(`[CREATE DRAFT] Merchant: ${merchantId}, LineItem: ${lineItemId}`)
    
    // Find the session for this merchant
    const session = await db.client.session.findFirst({
      where: { merchantId }
    })
    
    if (!session) {
      return res.status(400).json({
        success: false,
        error: 'No active session found for merchant'
      })
    }
    
    const productDraft = await productDraftService.createProductDraft({
      sessionId: session.id,
      merchantId,
      purchaseOrderId,
      lineItemId,
      supplierId: cleanSupplierId,
      originalTitle,
      originalDescription,
      originalPrice,
      priceRefined,
      estimatedMargin,
      reviewNotes
    })
    
    // Convert BigInt fields to strings for JSON serialization
    const serializedDraft = JSON.parse(JSON.stringify(productDraft, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ))
    
    res.status(201).json({
      success: true,
      data: serializedDraft
    })
  } catch (error) {
    console.error('Error creating product draft:', error)
    
    // Handle unique constraint error (duplicate line item)
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        error: 'Product draft already exists for this line item'
      })
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to create product draft'
    })
  }
})

// Update a product draft
router.patch('/:id', devBypassAuth, async (req, res) => {
  try {
    const { id } = req.params
    const updateData = req.body
    
    const productDraft = await productDraftService.updateProductDraft(id, updateData)
    
    res.json({
      success: true,
      data: productDraft
    })
  } catch (error) {
    console.error('Error updating product draft:', error)
    
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: 'Product draft not found'
      })
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to update product draft'
    })
  }
})

// Delete a product draft
router.delete('/:id', devBypassAuth, async (req, res) => {
  try {
    const { id } = req.params
    
    await productDraftService.deleteProductDraft(id)
    
    res.json({
      success: true,
      message: 'Product draft deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting product draft:', error)
    
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: 'Product draft not found'
      })
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to delete product draft'
    })
  }
})

// Get analytics for product drafts
router.get('/analytics/:merchantId', devBypassAuth, async (req, res) => {
  try {
    const { merchantId } = req.params
    
    const analytics = await productDraftService.getAnalytics(merchantId)
    
    res.json({
      success: true,
      data: analytics
    })
  } catch (error) {
    console.error('Error fetching product draft analytics:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics'
    })
  }
})

// Bulk update product drafts (for batch operations)
router.patch('/bulk/update', devBypassAuth, async (req, res) => {
  try {
    const { productDraftIds, updateData } = req.body
    
    if (!Array.isArray(productDraftIds) || productDraftIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Product draft IDs array is required'
      })
    }
    
    const updatePromises = productDraftIds.map(id => 
      productDraftService.updateProductDraft(id, updateData)
    )
    
    const results = await Promise.allSettled(updatePromises)
    const successful = results.filter(result => result.status === 'fulfilled')
    const failed = results.filter(result => result.status === 'rejected')
    
    res.json({
      success: true,
      data: {
        successful: successful.length,
        failed: failed.length,
        total: productDraftIds.length
      }
    })
  } catch (error) {
    console.error('Error bulk updating product drafts:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to bulk update product drafts'
    })
  }
})

// Sync product drafts to Shopify
router.post('/sync', devBypassAuth, async (req, res) => {
  try {
    const { productIds } = req.body
    
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Product IDs array is required'
      })
    }
    
    // Get merchant from authenticated request
    if (!req.merchant) {
      return res.status(401).json({
        success: false,
        error: 'No authenticated merchant found'
      })
    }
    
    const merchantId = req.merchant.id
    
    // Fetch the product drafts
    const productDrafts = await db.client.productDraft.findMany({
      where: {
        id: { in: productIds },
        merchantId
      },
      include: {
        images: true,
        variants: true,
        POLineItem: true
      }
    })
    
    if (productDrafts.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No product drafts found'
      })
    }
    
    // Update all to syncing status
    await db.client.productDraft.updateMany({
      where: { id: { in: productIds } },
      data: { status: 'SYNCING' }
    })
    
    // Process sync in background (simplified for now)
    // In production, this would use a queue system
    setImmediate(async () => {
      for (const draft of productDrafts) {
        try {
          // Simulate Shopify API call
          // TODO: Replace with actual Shopify Admin API integration
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          // Update to synced status
          await db.client.productDraft.update({
            where: { id: draft.id },
            data: {
              status: 'SYNCED',
              shopifyProductId: `gid://shopify/Product/${Date.now()}`, // Fake ID for now
              shopifyUrl: `https://${req.merchant.shop}/admin/products/123456` // Fake URL
            }
          })
          
          console.log(`✅ Synced product draft ${draft.id}`)
        } catch (error) {
          console.error(`❌ Failed to sync product draft ${draft.id}:`, error)
          
          // Update to failed status
          await db.client.productDraft.update({
            where: { id: draft.id },
            data: {
              status: 'FAILED',
              reviewNotes: `Sync failed: ${error.message}`
            }
          }).catch(err => console.error('Failed to update error status:', err))
        }
      }
    })
    
    res.json({
      success: true,
      message: `Started syncing ${productDrafts.length} product(s) to Shopify`,
      data: {
        queued: productDrafts.length
      }
    })
  } catch (error) {
    console.error('Error syncing product drafts:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to sync product drafts'
    })
  }
})

export default router