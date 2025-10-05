/**
 * Merchant Image Review Service
 * 
 * Handles the merchant review and approval workflow:
 * - Present image options to merchants
 * - Allow image selection and reordering
 * - Handle custom image uploads
 * - Track approval status
 * - Integration with dashboard UI
 */

import { PrismaClient } from '@prisma/client'
import { imageProcessingService } from './imageProcessingService.js'

const prisma = new PrismaClient()

export class MerchantImageReviewService {
  constructor() {
    this.reviewTimeoutHours = 24 // Auto-approve after 24 hours
  }

  /**
   * Create image review session for merchant using new schema
   */
  async createImageReviewSession(sessionData) {
    console.log(`📋 Creating image review session for PO ${sessionData.purchaseOrderId}`)
    
    try {
      // Generate unique session ID
      const sessionId = `img_session_${Date.now()}`
      
      // Create the image review session
      const reviewSession = await prisma.imageReviewSession.create({
        data: {
          sessionId: sessionId,
          purchaseOrderId: sessionData.purchaseOrderId,
          merchantId: sessionData.merchantId,
          status: 'PENDING',
          totalProducts: sessionData.lineItems.length,
          reviewedProducts: 0,
          autoApproveAt: new Date(Date.now() + this.reviewTimeoutHours * 60 * 60 * 1000)
        }
      })

      // Create products and their images for the session
      for (const lineItem of sessionData.lineItems) {
        const reviewProduct = await prisma.imageReviewProduct.create({
          data: {
            sessionId: reviewSession.id,
            productName: lineItem.productName,
            productSku: lineItem.sku,
            barcode: lineItem.barcode || null,
            originalProductData: lineItem,
            status: 'PENDING'
          }
        })

        // Create images for this product
        for (const imageData of lineItem.images) {
          await prisma.imageReviewProductImage.create({
            data: {
              productReviewId: reviewProduct.id,
              imageUrl: imageData.url,
              imageType: imageData.type,
              source: imageData.source,
              altText: imageData.altText,
              isSelected: false,
              isApproved: false,
              metadata: imageData.metadata || {}
            }
          })
        }
      }

      console.log(`✅ Created review session ${sessionId} with ${sessionData.lineItems.length} items`)
      
      return {
        id: reviewSession.id,
        sessionId: reviewSession.sessionId,
        status: reviewSession.status,
        totalProducts: reviewSession.totalProducts,
        reviewedProducts: reviewSession.reviewedProducts,
        autoApproveAt: reviewSession.autoApproveAt
      }
      
    } catch (error) {
      console.error('❌ Failed to create image review session:', error)
      throw error
    }
  }

  /**
   * Get image review session by purchase order ID
   */
  async getImageReviewSessionByPurchaseOrder(purchaseOrderId) {
    try {
      const session = await prisma.imageReviewSession.findFirst({
        where: {
          purchaseOrderId: purchaseOrderId
        },
        include: {
          products: {
            include: {
              images: true
            }
          }
        }
      })

      return session
    } catch (error) {
      console.error('❌ Failed to get image review session:', error)
      throw error
    }
  }

  /**
   * Store image options for line item
   */
  async storeImageOptions(sessionId, itemImages) {
    try {
      // Insert line item review record
      const lineItemReview = await db.query(`
        INSERT INTO image_review_items 
        (session_id, line_item_id, product_name, sku, status, recommended_source)
        VALUES ($1, $2, $3, $4, 'pending', $5)
        RETURNING id
      `, [
        sessionId,
        itemImages.lineItemId,
        itemImages.productName,
        itemImages.sku,
        itemImages.recommended?.source || 'none'
      ])

      const reviewItemId = lineItemReview.rows[0].id

      // Store all image options
      const allImages = [
        ...itemImages.vendorImages.map(img => ({ ...img, category: 'vendor' })),
        ...itemImages.webScraped.map(img => ({ ...img, category: 'web_scraped' })),
        ...(itemImages.aiGenerated ? [{ ...itemImages.aiGenerated, category: 'ai_generated' }] : [])
      ]

      for (let i = 0; i < allImages.length; i++) {
        const image = allImages[i]
        
        await db.query(`
          INSERT INTO image_review_options 
          (review_item_id, image_url, image_category, source_info, position, is_recommended)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          reviewItemId,
          image.stagingUrl || image.url,
          image.category,
          JSON.stringify({
            source: image.source,
            type: image.type,
            matchedTerms: image.matchedTerms,
            warning: image.warning
          }),
          i + 1,
          itemImages.recommended?.image === image
        ])
      }

    } catch (error) {
      console.error(`❌ Failed to store image options for item ${itemImages.lineItemId}:`, error)
      throw error
    }
  }

  /**
   * Generate dashboard data for merchant review
   */
  async generateReviewDashboard(sessionId) {
    try {
      const dashboardData = {
        sessionId,
        items: [],
        summary: {
          totalItems: 0,
          itemsWithVendorImages: 0,
          itemsWithWebImages: 0,
          itemsWithAIImages: 0,
          itemsNeedingAttention: 0
        }
      }

      // Get all review items with their image options
      const reviewItems = await db.query(`
        SELECT 
          iri.*,
          json_agg(
            json_build_object(
              'id', iro.id,
              'imageUrl', iro.image_url,
              'category', iro.image_category,
              'sourceInfo', iro.source_info,
              'position', iro.position,
              'isRecommended', iro.is_recommended
            ) ORDER BY iro.position
          ) as image_options
        FROM image_review_items iri
        LEFT JOIN image_review_options iro ON iri.id = iro.review_item_id
        WHERE iri.session_id = $1
        GROUP BY iri.id
        ORDER BY iri.id
      `, [sessionId])

      for (const item of reviewItems.rows) {
        const imageOptions = item.image_options || []
        
        const dashboardItem = {
          reviewItemId: item.id,
          lineItemId: item.line_item_id,
          productName: item.product_name,
          sku: item.sku,
          status: item.status,
          recommendedSource: item.recommended_source,
          imageOptions: imageOptions,
          selectedImages: [],
          needsAttention: this.determineIfNeedsAttention(item, imageOptions)
        }

        dashboardData.items.push(dashboardItem)
        
        // Update summary
        dashboardData.summary.totalItems++
        if (imageOptions.some(img => img.category === 'vendor')) {
          dashboardData.summary.itemsWithVendorImages++
        }
        if (imageOptions.some(img => img.category === 'web_scraped')) {
          dashboardData.summary.itemsWithWebImages++
        }
        if (imageOptions.some(img => img.category === 'ai_generated')) {
          dashboardData.summary.itemsWithAIImages++
        }
        if (dashboardItem.needsAttention) {
          dashboardData.summary.itemsNeedingAttention++
        }
      }

      return dashboardData
      
    } catch (error) {
      console.error('❌ Failed to generate review dashboard:', error)
      throw error
    }
  }

  /**
   * Determine if item needs merchant attention
   */
  determineIfNeedsAttention(item, imageOptions) {
    // Needs attention if:
    // 1. No vendor images available
    // 2. Only AI-generated images
    // 3. Poor quality web scraped images
    
    const hasVendorImages = imageOptions.some(img => img.category === 'vendor')
    const onlyAIImages = imageOptions.length > 0 && imageOptions.every(img => img.category === 'ai_generated')
    
    return !hasVendorImages || onlyAIImages
  }

  /**
   * Process merchant image selections
   */
  async processMerchantSelections(sessionId, selections) {
    console.log(`✅ Processing merchant selections for session ${sessionId}`)
    
    try {
      const approvedImages = []
      
      for (const selection of selections) {
        const { reviewItemId, selectedImageIds, customImages, imageOrder } = selection
        
        // Update review item status
        await db.query(`
          UPDATE image_review_items 
          SET status = 'approved', approved_at = NOW()
          WHERE id = $1
        `, [reviewItemId])

        // Store selected images
        for (let i = 0; i < selectedImageIds.length; i++) {
          const imageId = selectedImageIds[i]
          const position = imageOrder ? imageOrder.indexOf(imageId) + 1 : i + 1
          
          await db.query(`
            UPDATE image_review_options 
            SET is_selected = true, selection_order = $2
            WHERE id = $1
          `, [imageId, position])
          
          // Get image details for approval list
          const imageDetails = await this.getImageDetails(imageId)
          if (imageDetails) {
            approvedImages.push({
              ...imageDetails,
              reviewItemId,
              position
            })
          }
        }

        // Handle custom uploaded images
        if (customImages && customImages.length > 0) {
          for (const customImage of customImages) {
            const processedCustom = await this.processCustomImage(customImage, reviewItemId)
            if (processedCustom) {
              approvedImages.push(processedCustom)
            }
          }
        }
      }

      // Update session status
      await db.query(`
        UPDATE image_review_sessions 
        SET status = 'completed', completed_at = NOW()
        WHERE id = $1
      `, [sessionId])

      console.log(`✅ Processed ${selections.length} selections, ${approvedImages.length} images approved`)
      
      return {
        success: true,
        approvedImages,
        totalSelections: selections.length
      }
      
    } catch (error) {
      console.error('❌ Failed to process merchant selections:', error)
      throw error
    }
  }

  /**
   * Handle custom image upload from merchant
   */
  async processCustomImage(customImage, reviewItemId) {
    try {
      console.log(`📤 Processing custom image upload for review item ${reviewItemId}`)
      
      // Process the custom image using image processing service
      const processedImage = await imageProcessingService.processImageForShopify(
        customImage,
        `custom_${reviewItemId}`
      )

      if (processedImage) {
        // Store custom image in database
        await db.query(`
          INSERT INTO image_review_options 
          (review_item_id, image_url, image_category, source_info, is_selected, is_custom)
          VALUES ($1, $2, 'custom', $3, true, true)
        `, [
          reviewItemId,
          processedImage.stagingUrl,
          JSON.stringify({
            source: 'merchant_upload',
            originalName: customImage.originalName,
            uploadedAt: new Date().toISOString()
          })
        ])

        return processedImage
      }

      return null
      
    } catch (error) {
      console.error('❌ Failed to process custom image:', error)
      return null
    }
  }

  /**
   * Get image details by ID
   */
  async getImageDetails(imageId) {
    try {
      const result = await db.query(`
        SELECT * FROM image_review_options WHERE id = $1
      `, [imageId])

      if (result.rows.length > 0) {
        const image = result.rows[0]
        return {
          id: image.id,
          imageUrl: image.image_url,
          category: image.image_category,
          sourceInfo: JSON.parse(image.source_info || '{}'),
          isCustom: image.is_custom || false
        }
      }

      return null
      
    } catch (error) {
      console.error(`❌ Failed to get image details for ID ${imageId}:`, error)
      return null
    }
  }

  /**
   * Auto-approve images after timeout
   */
  async autoApproveExpiredSessions() {
    try {
      console.log('🕐 Checking for expired review sessions...')
      
      const expiredSessions = await db.query(`
        SELECT id FROM image_review_sessions 
        WHERE status = 'pending' AND expires_at < NOW()
      `)

      for (const session of expiredSessions.rows) {
        await this.autoApproveSession(session.id)
      }

      console.log(`✅ Auto-approved ${expiredSessions.rows.length} expired sessions`)
      
    } catch (error) {
      console.error('❌ Failed to auto-approve expired sessions:', error)
    }
  }

  /**
   * Auto-approve session using recommended images
   */
  async autoApproveSession(sessionId) {
    try {
      console.log(`🤖 Auto-approving session ${sessionId}`)
      
      // Select recommended images for all items
      await db.query(`
        UPDATE image_review_options 
        SET is_selected = true, selection_order = 1
        WHERE review_item_id IN (
          SELECT id FROM image_review_items WHERE session_id = $1
        ) AND is_recommended = true
      `, [sessionId])

      // Update session status
      await db.query(`
        UPDATE image_review_sessions 
        SET status = 'auto_approved', completed_at = NOW()
        WHERE id = $1
      `, [sessionId])

      console.log(`✅ Auto-approved session ${sessionId}`)
      
    } catch (error) {
      console.error(`❌ Failed to auto-approve session ${sessionId}:`, error)
    }
  }

  /**
   * Get review session status
   */
  async getReviewSessionStatus(sessionId) {
    try {
      const result = await db.query(`
        SELECT * FROM image_review_sessions WHERE id = $1
      `, [sessionId])

      return result.rows[0] || null
      
    } catch (error) {
      console.error(`❌ Failed to get session status:`, error)
      return null
    }
  }

  /**
   * Get image review session by purchase order ID
   */
  async getSessionByPurchaseOrder(poId, merchantId) {
    try {
      const session = await prisma.imageReviewSession.findFirst({
        where: {
          purchaseOrderId: poId,
          merchantId: merchantId
        },
        include: {
          products: {
            include: {
              images: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })

      return session
      
    } catch (error) {
      console.error(`❌ Failed to get session by PO:`, error)
      return null
    }
  }
}

export const merchantImageReviewService = new MerchantImageReviewService()