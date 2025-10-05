/**
 * Image Review API Routes
 * 
 * Handles merchant image review and approval workflow:
 * - Get image review sessions
 * - Submit image selections
 * - Upload custom images
 * - Get review dashboard data
 */

import express from 'express'
import multer from 'multer'
import { PrismaClient } from '@prisma/client'
import { merchantImageReviewService } from '../lib/merchantImageReviewService.js'
import { imageProcessingService } from '../lib/imageProcessingService.js'
import { shopifyImageService } from '../lib/shopifyImageService.js'

const prisma = new PrismaClient()
const router = express.Router()

// Configure multer for image uploads
const storage = multer.memoryStorage()
const upload = multer({ 
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'))
    }
  }
})

/**
 * GET /api/image-review/sessions/:sessionId
 * Get image review session dashboard data
 */
router.get('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params
    const merchantId = req.merchant?.id || req.shop?.id
    
    if (!merchantId) {
      return res.status(401).json({
        success: false,
        error: 'Merchant ID not found'
      })
    }
    
    console.log(`📋 Getting review session ${sessionId} for merchant ${merchantId}`)
    
    // Try to find by sessionId field first (e.g., img_session_123)
    // If not found, try by id field (e.g., cmg8vfs0a01sl55h8d0guvpvx)
    let session = await prisma.imageReviewSession.findFirst({
      where: {
        sessionId: sessionId,
        merchantId: merchantId
      },
      include: {
        products: {
          include: {
            images: true
          }
        }
      }
    })
    
    if (!session) {
      // Try finding by id field instead
      session = await prisma.imageReviewSession.findFirst({
        where: {
          id: sessionId,
          merchantId: merchantId
        },
        include: {
          products: {
            include: {
              images: true
            }
          }
        }
      })
    }
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Review session not found'
      })
    }
    
    // Transform products to include lineItemId from originalProductData
    const transformedSession = {
      ...session,
      products: session.products.map(product => ({
        ...product,
        lineItemId: product.originalProductData?.lineItemId || 
                    product.originalProductData?.id || 
                    null
      }))
    }
    
    res.json({
      success: true,
      data: transformedSession
    })
    
  } catch (error) {
    console.error('❌ Failed to get review session:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to load review session'
    })
  }
})

/**
 * POST /api/image-review/sessions/:sessionId/selections
 * Submit merchant image selections
 */
router.post('/sessions/:sessionId/selections', async (req, res) => {
  try {
    const { sessionId } = req.params
    const { selections } = req.body
    const merchantId = req.merchant?.id || req.shop?.id
    
    if (!merchantId) {
      console.error('❌ No merchant ID found in request')
      return res.status(401).json({
        success: false,
        error: 'Merchant ID not found'
      })
    }
    
    console.log(`✅ Processing selections for session ${sessionId}, merchant ${merchantId}`)
    console.log(`📝 Selections:`, JSON.stringify(selections, null, 2))
    
    // Find session by sessionId or id field
    let session = await prisma.imageReviewSession.findFirst({
      where: {
        sessionId: sessionId,
        merchantId: merchantId
      }
    })
    
    if (!session) {
      // Try by id field
      session = await prisma.imageReviewSession.findFirst({
        where: {
          id: sessionId,
          merchantId: merchantId
        }
      })
    }
    
    if (!session) {
      console.error('❌ Session not found or access denied')
      return res.status(403).json({
        success: false,
        error: 'Access denied to this review session'
      })
    }
    
    if (session.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        error: 'Review session is not in pending status'
      })
    }
    
    // Process selections - update image approval status
    console.log(`📝 Updating ${selections?.length || 0} products with image selections`)
    
    if (!selections || !Array.isArray(selections) || selections.length === 0) {
      console.error('❌ Invalid selections format:', selections)
      return res.status(400).json({
        success: false,
        error: 'Invalid selections format - expected array of selections'
      })
    }
    
    for (const selection of selections) {
      const { reviewItemId, selectedImageIds } = selection
      
      if (!reviewItemId) {
        console.error('❌ Missing reviewItemId in selection:', selection)
        continue
      }
      
      console.log(`  Updating product ${reviewItemId} with ${selectedImageIds?.length || 0} selected images`)
      
      // Get the review product to access original product data
      const reviewProduct = await prisma.imageReviewProduct.findUnique({
        where: { id: reviewItemId },
        include: {
          images: true
        }
      })
      
      // Update the product review with selected image IDs
      await prisma.imageReviewProduct.update({
        where: { id: reviewItemId },
        data: {
          selectedImageIds: selectedImageIds || [],
          status: 'APPROVED',
          reviewedAt: new Date()
        }
      })
      
      // Mark selected images as approved in review images
      if (selectedImageIds && selectedImageIds.length > 0) {
        await prisma.imageReviewProductImage.updateMany({
          where: {
            id: { in: selectedImageIds },
            productReviewId: reviewItemId
          },
          data: {
            isSelected: true,
            isApproved: true
          }
        })
        console.log(`  ✅ Marked ${selectedImageIds.length} images as approved in review session`)
        
        // IMPORTANT: Also update the ProductImage to reflect the approved image
        // This ensures Quick Sync shows the correct approved image
        if (reviewProduct?.originalProductData?.lineItemId) {
          const lineItemId = reviewProduct.originalProductData.lineItemId
          console.log(`  🔍 Looking for ProductDraft with lineItemId: ${lineItemId}`)
          
          // Find the product draft for this line item
          const productDraft = await prisma.productDraft.findFirst({
            where: { lineItemId },
            include: { images: true }
          })
          
          if (productDraft) {
            console.log(`  ✅ Found ProductDraft: ${productDraft.id} with ${productDraft.images.length} images`)
            
            // Get the approved review images to find their URLs
            const approvedReviewImages = reviewProduct.images.filter(img => 
              selectedImageIds.includes(img.id)
            )
            
            if (approvedReviewImages.length > 0) {
              // Find the first approved image (this will be the primary/displayed image)
              const primaryApprovedImage = approvedReviewImages[0]
              console.log(`  🎯 Primary approved image URL: ${primaryApprovedImage.imageUrl}`)
              
              // Find the corresponding ProductImage by URL match
              const matchingProductImage = productDraft.images.find(img => 
                img.originalUrl === primaryApprovedImage.imageUrl
              )
              
              if (matchingProductImage) {
                console.log(`  🔗 Found matching ProductImage: ${matchingProductImage.id}`)
                
                // Update the ProductImage to mark it as approved and set position to 0 (primary)
                await prisma.productImage.update({
                  where: { id: matchingProductImage.id },
                  data: {
                    position: 0, // Make it the primary image
                    enhancementData: {
                      ...(matchingProductImage.enhancementData || {}),
                      isApproved: true,
                      isSelected: true,
                      approvedAt: new Date().toISOString()
                    }
                  }
                })
                
                console.log(`  ✅ Updated ProductImage ${matchingProductImage.id} as approved (position 0)`)
                
                // Set all other images to position > 0
                const otherImages = productDraft.images.filter(img => img.id !== matchingProductImage.id)
                for (let i = 0; i < otherImages.length; i++) {
                  await prisma.productImage.update({
                    where: { id: otherImages[i].id },
                    data: {
                      position: i + 1,
                      enhancementData: {
                        ...(otherImages[i].enhancementData || {}),
                        isApproved: false,
                        isSelected: false
                      }
                    }
                  })
                }
                console.log(`  ✅ Updated ${otherImages.length} other images to non-primary positions`)
              } else {
                console.log(`  ⚠️ No matching ProductImage found for URL: ${primaryApprovedImage.imageUrl}`)
                console.log(`  Available URLs in ProductDraft:`, productDraft.images.map(img => img.originalUrl))
              }
            } else {
              console.log(`  ⚠️ No approved review images found`)
            }
          } else {
            console.log(`  ❌ ProductDraft not found for lineItemId: ${lineItemId}`)
          }
        } else {
          console.log(`  ⚠️ No lineItemId in originalProductData`)
          console.log(`  originalProductData:`, JSON.stringify(reviewProduct?.originalProductData, null, 2))
        }
      }
    }
    
    // Update session reviewed count
    const reviewedCount = await prisma.imageReviewProduct.count({
      where: {
        sessionId: session.id,
        status: 'APPROVED'
      }
    })
    
    await prisma.imageReviewSession.update({
      where: { id: session.id },
      data: {
        reviewedProducts: reviewedCount,
        status: reviewedCount === session.totalProducts ? 'COMPLETED' : 'PENDING',
        completedAt: reviewedCount === session.totalProducts ? new Date() : null
      }
    })
    
    console.log(`✅ Successfully processed ${selections.length} selections`)
    
    res.json({
      success: true,
      message: 'Image selections processed successfully',
      reviewedCount
    })
    
  } catch (error) {
    console.error('❌ Failed to process selections:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to process image selections'
    })
  }
})

/**
 * POST /api/image-review/sessions/:sessionId/custom-upload
 * Upload custom images for review items
 */
router.post('/sessions/:sessionId/custom-upload', upload.array('images', 10), async (req, res) => {
  try {
    const { sessionId } = req.params
    const { reviewItemId } = req.body
    const merchantId = req.merchant.id
    const files = req.files
    
    console.log(`📤 Uploading ${files.length} custom images for session ${sessionId}`)
    
    // Verify session ownership
    const session = await merchantImageReviewService.getReviewSessionStatus(sessionId)
    if (!session || session.merchant_id !== merchantId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this review session'
      })
    }
    
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No images provided'
      })
    }
    
    // Process each uploaded image
    const uploadResults = []
    
    for (const file of files) {
      try {
        // Convert buffer to image object for processing
        const customImage = {
          buffer: file.buffer,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
        }
        
        // Process custom image
        const processedImage = await merchantImageReviewService.processCustomImage(
          customImage,
          reviewItemId
        )
        
        if (processedImage) {
          uploadResults.push({
            success: true,
            originalName: file.originalname,
            processedImage
          })
        } else {
          uploadResults.push({
            success: false,
            originalName: file.originalname,
            error: 'Failed to process image'
          })
        }
        
      } catch (error) {
        console.error(`❌ Failed to process ${file.originalname}:`, error)
        uploadResults.push({
          success: false,
          originalName: file.originalname,
          error: error.message
        })
      }
    }
    
    const successCount = uploadResults.filter(r => r.success).length
    
    res.json({
      success: successCount > 0,
      message: `Successfully uploaded ${successCount}/${files.length} images`,
      results: uploadResults
    })
    
  } catch (error) {
    console.error('❌ Failed to upload custom images:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to upload custom images'
    })
  }
})

/**
 * GET /api/image-review/merchant/sessions
 * Get all review sessions for merchant
 */
router.get('/merchant/sessions', async (req, res) => {
  try {
    const merchantId = req.merchant.id
    const { status, limit = 20, offset = 0 } = req.query
    
    console.log(`📋 Getting review sessions for merchant ${merchantId}`)
    
    let query = `
      SELECT irs.*, po.supplier_name, po.po_number,
        COUNT(iri.id) as total_items,
        COUNT(CASE WHEN iri.status = 'approved' THEN 1 END) as approved_items
      FROM image_review_sessions irs
      LEFT JOIN purchase_orders po ON irs.purchase_order_id = po.id
      LEFT JOIN image_review_items iri ON irs.id = iri.session_id
      WHERE irs.merchant_id = $1
    `
    
    const params = [merchantId]
    
    if (status) {
      query += ` AND irs.status = $${params.length + 1}`
      params.push(status)
    }
    
    query += `
      GROUP BY irs.id, po.supplier_name, po.po_number
      ORDER BY irs.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `
    
    params.push(limit, offset)
    
    const result = await db.query(query, params)
    
    res.json({
      success: true,
      sessions: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: result.rows.length
      }
    })
    
  } catch (error) {
    console.error('❌ Failed to get merchant sessions:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to load review sessions'
    })
  }
})

/**
 * POST /api/image-review/sessions/:sessionId/approve-all
 * Auto-approve all recommended images
 */
router.post('/sessions/:sessionId/approve-all', async (req, res) => {
  try {
    const { sessionId } = req.params
    const merchantId = req.merchant.id
    
    console.log(`🤖 Auto-approving all images for session ${sessionId}`)
    
    // Verify session ownership
    const session = await merchantImageReviewService.getReviewSessionStatus(sessionId)
    if (!session || session.merchant_id !== merchantId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this review session'
      })
    }
    
    // Auto-approve using recommended images
    await merchantImageReviewService.autoApproveSession(sessionId)
    
    res.json({
      success: true,
      message: 'All recommended images approved successfully'
    })
    
  } catch (error) {
    console.error('❌ Failed to auto-approve session:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to auto-approve images'
    })
  }
})

/**
 * DELETE /api/image-review/sessions/:sessionId
 * Cancel/delete review session
 */
router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params
    const merchantId = req.merchant.id
    
    console.log(`🗑️ Canceling review session ${sessionId}`)
    
    // Verify session ownership
    const session = await merchantImageReviewService.getReviewSessionStatus(sessionId)
    if (!session || session.merchant_id !== merchantId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this review session'
      })
    }
    
    // Update session status to cancelled
    await db.query(`
      UPDATE image_review_sessions 
      SET status = 'cancelled', completed_at = NOW()
      WHERE id = $1
    `, [sessionId])
    
    res.json({
      success: true,
      message: 'Review session cancelled successfully'
    })
    
  } catch (error) {
    console.error('❌ Failed to cancel session:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to cancel review session'
    })
  }
})

/**
 * GET /api/image-review/sessions/by-purchase-order/:poId
 * Get image review session for a specific purchase order
 */
router.get('/sessions/by-purchase-order/:poId', async (req, res) => {
  try {
    const { poId } = req.params
    
    console.log(`🔍 Looking for image review session for PO ${poId}`)
    console.log(`   req.merchant:`, req.merchant)
    console.log(`   req.user:`, req.user)
    console.log(`   req.shop:`, req.shop)
    
    const merchantId = req.merchant?.id || req.shop?.id
    
    if (!merchantId) {
      console.log('❌ No merchantId found in request')
      return res.status(401).json({
        success: false,
        error: 'Merchant ID not found in request'
      })
    }
    
    console.log(`   Using merchantId: ${merchantId}`)
    
    // Get the image review session for this PO
    const session = await merchantImageReviewService.getSessionByPurchaseOrder(poId, merchantId)
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'No image review session found for this purchase order',
        message: 'Images may still be processing in the pipeline'
      })
    }
    
    res.json({
      success: true,
      data: session
    })
    
  } catch (error) {
    console.error('❌ Failed to get image review session by PO:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve image review session'
    })
  }
})

export default router

