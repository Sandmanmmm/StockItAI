/**
 * Shopify Image Integration Service
 * 
 * Handles image upload and management in Shopify:
 * - Upload images to Shopify products via API
 * - Manage image galleries and variants
 * - Handle image approval workflow
 * - Sync with merchant review system
 */

import { enhancedShopifyService } from './enhancedShopifyService.js'

export class ShopifyImageService {
  constructor() {
    this.shopifyService = enhancedShopifyService
    this.maxImagesPerProduct = 10 // Shopify limit
  }

  /**
   * Upload approved images to Shopify product
   */
  async uploadProductImages(productId, approvedImages, merchantId) {
    console.log(`🛍️ Uploading ${approvedImages.length} images to Shopify product ${productId}`)
    
    try {
      const uploadResults = []
      
      for (let i = 0; i < approvedImages.length && i < this.maxImagesPerProduct; i++) {
        const image = approvedImages[i]
        
        console.log(`📤 Uploading image ${i + 1}/${approvedImages.length}: ${image.fileName}`)
        
        const uploadResult = await this.uploadSingleImage(productId, image, i === 0, merchantId)
        uploadResults.push(uploadResult)
        
        // Small delay to avoid rate limits
        await this.delay(500)
      }

      const successCount = uploadResults.filter(r => r.success).length
      console.log(`✅ Successfully uploaded ${successCount}/${approvedImages.length} images`)
      
      return {
        success: successCount > 0,
        uploaded: successCount,
        total: approvedImages.length,
        results: uploadResults
      }
      
    } catch (error) {
      console.error('❌ Shopify image upload failed:', error)
      throw error
    }
  }

  /**
   * Upload single image to Shopify product
   */
  async uploadSingleImage(productId, image, isMainImage, merchantId) {
    try {
      // Prepare image data for Shopify API
      const imageData = {
        image: {
          src: image.stagingUrl,
          alt: image.altText || `Product image`,
          position: image.position || (isMainImage ? 1 : undefined)
        }
      }

      // Add variant IDs if specified
      if (image.variantIds && image.variantIds.length > 0) {
        imageData.image.variant_ids = image.variantIds
      }

      // Upload to Shopify
      const response = await this.shopifyService.makeApiCall(
        merchantId,
        'POST',
        `products/${productId}/images.json`,
        imageData
      )

      if (response.image) {
        return {
          success: true,
          shopifyImageId: response.image.id,
          shopifyUrl: response.image.src,
          originalImage: image
        }
      } else {
        throw new Error('No image data in Shopify response')
      }
      
    } catch (error) {
      console.error(`❌ Failed to upload image ${image.fileName}:`, error)
      return {
        success: false,
        error: error.message,
        originalImage: image
      }
    }
  }

  /**
   * Update product image gallery order
   */
  async updateImageOrder(productId, imageOrder, merchantId) {
    try {
      console.log(`🔄 Updating image order for product ${productId}`)
      
      for (let i = 0; i < imageOrder.length; i++) {
        const imageId = imageOrder[i]
        
        await this.shopifyService.makeApiCall(
          merchantId,
          'PUT',
          `products/${productId}/images/${imageId}.json`,
          {
            image: {
              id: imageId,
              position: i + 1
            }
          }
        )
      }

      console.log(`✅ Updated image order for ${imageOrder.length} images`)
      return { success: true }
      
    } catch (error) {
      console.error('❌ Failed to update image order:', error)
      throw error
    }
  }

  /**
   * Delete image from Shopify product
   */
  async deleteProductImage(productId, imageId, merchantId) {
    try {
      await this.shopifyService.makeApiCall(
        merchantId,
        'DELETE',
        `products/${productId}/images/${imageId}.json`
      )

      console.log(`🗑️ Deleted image ${imageId} from product ${productId}`)
      return { success: true }
      
    } catch (error) {
      console.error(`❌ Failed to delete image ${imageId}:`, error)
      throw error
    }
  }

  /**
   * Get product images from Shopify
   */
  async getProductImages(productId, merchantId) {
    try {
      const response = await this.shopifyService.makeApiCall(
        merchantId,
        'GET',
        `products/${productId}/images.json`
      )

      return response.images || []
      
    } catch (error) {
      console.error(`❌ Failed to get product images:`, error)
      return []
    }
  }

  /**
   * Batch upload images for multiple products
   */
  async batchUploadImages(productImageMap, merchantId) {
    console.log(`📦 Batch uploading images for ${Object.keys(productImageMap).length} products`)
    
    const results = {}
    
    for (const [productId, images] of Object.entries(productImageMap)) {
      try {
        results[productId] = await this.uploadProductImages(productId, images, merchantId)
        
        // Delay between products to avoid rate limits
        await this.delay(1000)
        
      } catch (error) {
        console.error(`❌ Batch upload failed for product ${productId}:`, error)
        results[productId] = {
          success: false,
          error: error.message
        }
      }
    }

    return results
  }

  /**
   * Validate image before upload
   */
  validateImageForShopify(image) {
    const errors = []
    
    // Check file size (Shopify limit: 20MB)
    if (image.size > 20 * 1024 * 1024) {
      errors.push('Image size exceeds 20MB limit')
    }
    
    // Check dimensions (Shopify max: 4472x4472px)
    if (image.dimensions) {
      const { width, height } = image.dimensions
      if (width > 4472 || height > 4472) {
        errors.push('Image dimensions exceed 4472x4472px limit')
      }
    }
    
    // Check URL accessibility
    if (!image.stagingUrl) {
      errors.push('No staging URL provided')
    }
    
    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Prepare image metadata for Shopify
   */
  prepareImageMetadata(image, lineItem) {
    return {
      ...image,
      altText: image.altText || `${lineItem.productName} - Product Image`,
      title: image.title || lineItem.productName,
      shopifyReady: true
    }
  }

  /**
   * Handle image upload error recovery
   */
  async retryImageUpload(productId, image, merchantId, maxRetries = 3) {
    let lastError
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Retry attempt ${attempt}/${maxRetries} for image: ${image.fileName}`)
        
        const result = await this.uploadSingleImage(productId, image, false, merchantId)
        
        if (result.success) {
          return result
        } else {
          lastError = new Error(result.error)
        }
        
      } catch (error) {
        lastError = error
        console.error(`❌ Retry ${attempt} failed:`, error)
        
        // Exponential backoff
        if (attempt < maxRetries) {
          await this.delay(Math.pow(2, attempt) * 1000)
        }
      }
    }
    
    throw lastError
  }

  /**
   * Utility: Sleep for specified milliseconds
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export const shopifyImageService = new ShopifyImageService()