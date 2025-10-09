/**
 * Refinement Pipeline Service
 * 
 * Implements Step 3 refinement pipeline:
 * 1. Raw parse (already done)
 * 2. Normalization (currencies, numbers, units)
 * 3. Apply merchant configs (pricing, markups, category mappings)
 * 4. Enrichment (GPT descriptions, photo sourcing)
 * 5. Prepare Shopify-ready payload
 * 
 * Uses Redis workers for async processing
 */

import { RefinementConfigService } from '../services/refinementConfigService.js'
import { db, prismaOperation } from './db.js'
import { imageProcessingService } from './imageProcessingService.js'
import { merchantImageReviewService } from './merchantImageReviewService.js'

export class RefinementPipelineService {
  constructor() {
    this.refinementConfig = new RefinementConfigService()
  }

  /**
   * Stage 2: Normalization
   * Standardize currencies, numbers, units, and data formats
   */
  async normalizeLineItems(lineItems, merchantConfig) {
    console.log('🔧 [PIPELINE] Starting normalization stage...')
    
    // Ensure merchantConfig has required properties
    const config = merchantConfig || {}
    const baseCurrency = config.baseCurrency || 'USD'
    
    console.log('🔧 [PIPELINE] Using base currency:', baseCurrency)
    
    const normalizedItems = lineItems.map(item => {
      // Normalize currency amounts
      const normalizedUnitCost = this.normalizeCurrency(item.unitCost || 0, baseCurrency)
      const normalizedTotalCost = this.normalizeCurrency(item.totalCost || 0, baseCurrency)
      
      // Normalize quantities and units
      const normalizedQuantity = this.normalizeQuantity(item.quantity || 1)
      
      // Normalize product names and descriptions
      const normalizedName = this.normalizeProductName(item.productName || item.description || 'Unknown Product')
      const normalizedDescription = this.normalizeDescription(item.description || '')
      
      // Normalize SKU/product codes
      const normalizedSku = this.normalizeSku(item.sku || item.productCode || '')
      
      return {
        ...item,
        unitCost: normalizedUnitCost,
        totalCost: normalizedTotalCost,
        quantity: normalizedQuantity,
        productName: normalizedName,
        description: normalizedDescription,
        sku: normalizedSku,
        normalizedAt: new Date().toISOString()
      }
    })
    
    console.log(`✅ [PIPELINE] Normalized ${normalizedItems.length} line items`)
    return normalizedItems
  }

  /**
   * Stage 3: Apply Merchant Configurations
   * Apply pricing rules, markups, and category mappings
   */
  async applyMerchantConfigs(lineItems, merchantId) {
    console.log('⚙️ [PIPELINE] Applying merchant configurations...')
    
    // Get merchant's refinement configuration
    const merchantConfig = await this.refinementConfig.getMerchantConfig(merchantId)
    
    const configuredItems = await Promise.all(lineItems.map(async (item) => {
      // Apply pricing refinement
      const refinedPricing = await this.refinementConfig.calculateRefinedPricing(
        item.unitCost,
        merchantConfig
      )
      
      // Apply category mapping
      const categoryMappings = merchantConfig.categorizationConfig?.customMappings || {}
      const categoryMapping = this.applyCategoryMapping(item, categoryMappings)
      
      // Apply custom rules
      const customRules = merchantConfig.processingConfig?.workflow?.escalationRules || []
      const customRuleResults = this.applyCustomRules(item, customRules)
      
      return {
        ...item,
        ...refinedPricing,
        category: categoryMapping.category,
        categoryConfidence: categoryMapping.confidence,
        appliedRules: [...(refinedPricing.appliedRules || []), ...(customRuleResults.appliedRules || [])],
        merchantConfigAppliedAt: new Date().toISOString()
      }
    }))
    
    console.log(`✅ [PIPELINE] Applied merchant configs to ${configuredItems.length} items`)
    return configuredItems
  }

  /**
   * Stage 4: AI Enrichment with Comprehensive Image Processing
   * Generate GPT descriptions, source product photos, enhance data
   */
  async enrichWithAI(lineItems, merchantId, purchaseOrderData = null) {
    console.log('🤖 [PIPELINE] Starting AI enrichment with image processing...')
    
    try {
      // Step 1: Extract vendor images from original PO content
      let vendorImages = []
      if (purchaseOrderData?.originalContent) {
        console.log('📸 Extracting vendor images from PO content...')
        const extractedImages = await imageProcessingService.extractVendorImages(
          purchaseOrderData.originalContent,
          purchaseOrderData.parsedData || {}
        )
        vendorImages = [
          ...extractedImages.embedded,
          ...extractedImages.vendorImages
        ]
        console.log(`✅ Extracted ${vendorImages.length} vendor images from PO`)
      }

      // Step 2: Source images for all line items using hierarchy
      console.log('🔍 Sourcing images using fallback hierarchy...')
      const imageResults = await imageProcessingService.sourceImagesWithHierarchy(
        lineItems,
        vendorImages
      )

      // Step 3: Process and enhance images for Shopify
      console.log('✨ Processing and enhancing images...')
      const enhancedImageResults = await imageProcessingService.enhanceImages(imageResults)

      // Step 4: AI enrichment for each item with image context
      const enrichedItems = await Promise.all(lineItems.map(async (item, index) => {
        try {
          const itemImages = enhancedImageResults[index] || { processed: [] }
          
          // Generate enhanced product description using GPT with image context
          const imageContext = this.buildImageContextForAI(itemImages)
          const enhancedDescription = await this.generateEnhancedDescription(item, imageContext)
          
          // Generate product tags and categories
          const aiTags = await this.generateProductTags(item)
          
          // Generate SEO-friendly product title
          const seoTitle = await this.generateSEOTitle(item)
          
          // Generate product specifications
          const specifications = await this.extractSpecifications(item)
          
          return {
            ...item,
            enhancedDescription,
            aiGeneratedTags: aiTags,
            seoTitle,
            specifications,
            enrichedAt: new Date().toISOString(),
            enrichmentConfidence: 0.85,
            // Enhanced image data
            images: {
              vendorImages: itemImages.vendorImages || [],
              webScraped: itemImages.webScraped || [],
              aiGenerated: itemImages.aiGenerated,
              processed: itemImages.processed || [],
              recommended: itemImages.recommended,
              needsReview: this.determineImageReviewNeeded(itemImages),
              totalImages: (itemImages.processed || []).length
            }
          }
        } catch (error) {
          console.error(`⚠️ [PIPELINE] AI enrichment failed for item ${item.id}:`, error.message)
          return {
            ...item,
            enrichmentError: error.message,
            enrichedAt: new Date().toISOString(),
            enrichmentConfidence: 0.0,
            images: {
              vendorImages: [],
              webScraped: [],
              aiGenerated: null,
              processed: [],
              recommended: null,
              needsReview: true,
              totalImages: 0
            }
          }
        }
      }))

      // Step 5: Create merchant review session for items needing image review
      const itemsNeedingReview = enrichedItems.filter(item => 
        item.images?.needsReview
      )
      
      if (itemsNeedingReview.length > 0 && purchaseOrderData?.purchaseOrderId) {
        console.log(`📋 Creating image review session for ${itemsNeedingReview.length} items`)
        
        try {
          // Transform enriched items into format expected by createImageReviewSession
          const lineItemsForReview = itemsNeedingReview.map((item, index) => {
            const imageResult = enhancedImageResults[enrichedItems.indexOf(item)] || {}
            
            // Flatten all image sources into a single array with proper structure
            const allImages = []
            
            // Add vendor images
            if (imageResult.vendorImages && Array.isArray(imageResult.vendorImages)) {
              allImages.push(...imageResult.vendorImages.map(img => ({
                url: img.url || img,
                type: 'vendor',
                source: 'vendor',
                altText: item.productName || item.description,
                metadata: img.metadata || {}
              })))
            }
            
            // Add web scraped images
            if (imageResult.webScraped && Array.isArray(imageResult.webScraped)) {
              allImages.push(...imageResult.webScraped.map(img => ({
                url: img.url || img,
                type: 'web_scraped',
                source: img.source || 'google',
                altText: item.productName || item.description,
                metadata: img.metadata || {}
              })))
            }
            
            // Add processed images
            if (imageResult.processed && Array.isArray(imageResult.processed)) {
              allImages.push(...imageResult.processed.map(img => ({
                url: img.url || img,
                type: 'processed',
                source: img.source || 'processed',
                altText: item.productName || item.description,
                metadata: img.metadata || {}
              })))
            }
            
            return {
              productName: item.productName || item.description,
              sku: item.sku || item.id,
              barcode: item.barcode || null,
              images: allImages
            }
          })
          
          const reviewSession = await merchantImageReviewService.createImageReviewSession({
            purchaseOrderId: purchaseOrderData.purchaseOrderId,
            merchantId: merchantId,
            lineItems: lineItemsForReview
          })
          
          // Add review session info to enrichment results
          for (const item of enrichedItems) {
            if (item.images?.needsReview) {
              item.images.reviewSessionId = reviewSession.sessionId
            }
          }
          
          console.log(`✅ Created review session ${reviewSession.sessionId}`)
        } catch (reviewError) {
          console.error('⚠️ Failed to create image review session:', reviewError)
          // Continue processing without review session
        }
      }

      console.log(`✅ [PIPELINE] AI enrichment completed for ${enrichedItems.length} items`)
      console.log(`   - ${itemsNeedingReview.length} items need merchant image review`)
      console.log(`   - ${enrichedItems.filter(item => item.images?.vendorImages?.length > 0).length} items have vendor images`)
      console.log(`   - ${enrichedItems.filter(item => item.images?.totalImages > 0).length} items have processed images`)
      
      return enrichedItems
      
    } catch (error) {
      console.error('❌ [PIPELINE] AI enrichment with image processing failed:', error)
      throw error
    }
  }

  /**
   * Stage 5: Prepare Shopify-Ready Payload with Approved Images
   * Format data exactly for Shopify API including image handling
   */
  async prepareShopifyPayload(lineItems, purchaseOrderData, merchantId) {
    console.log('🛍️ [PIPELINE] Preparing Shopify-ready payload with images...')
    
    // Get merchant's Shopify configuration
    const merchantConfig = await this.getMerchantShopifyConfig(merchantId)
    
    const shopifyProducts = []
    
    for (const item of lineItems) {
      try {
        // Get approved images for this item (if review was completed)
        const approvedImages = await this.getApprovedImagesForItem(item, purchaseOrderData.purchaseOrderId)
        
        // Create Shopify product structure
        const shopifyProduct = {
          title: item.seoTitle || item.productName,
          body_html: this.formatProductDescription(item),
          vendor: purchaseOrderData.supplierName || 'Unknown Vendor',
          product_type: item.category || 'General',
          tags: this.formatShopifyTags(item),
          status: 'draft', // Start as draft for merchant review
          variants: [
            {
              title: 'Default Title',
              price: item.retailPrice?.toFixed(2) || '0.00',
              compare_at_price: item.compareAtPrice?.toFixed(2) || null,
              cost: item.unitCost?.toFixed(2) || '0.00',
              sku: item.sku || '',
              inventory_quantity: item.quantity || 0,
              inventory_management: 'shopify',
              fulfillment_service: 'manual',
              requires_shipping: true,
              taxable: true,
              weight: this.extractWeight(item) || 0,
              weight_unit: 'lb'
            }
          ],
          options: [
            {
              name: 'Title',
              values: ['Default Title']
            }
          ],
          // Format approved images for Shopify
          images: this.formatShopifyImages(approvedImages),
          metafields: this.createMetafields(item, purchaseOrderData)
        }
        
        shopifyProducts.push({
          shopifyProduct,
          originalLineItem: item,
          approvedImages,
          imageStatus: this.getImageStatus(item, approvedImages),
          processingMetadata: {
            lineItemId: item.id,
            hasImages: approvedImages.length > 0,
            imageReviewCompleted: !item.images?.needsReview || approvedImages.length > 0,
            readyForSync: this.isReadyForShopifySync(item, approvedImages)
          }
        })
        
      } catch (error) {
        console.error(`❌ Failed to prepare Shopify payload for ${item.productName}:`, error)
        
        // Add item without images to continue processing
        shopifyProducts.push({
          shopifyProduct: {
            title: item.productName,
            body_html: item.description || item.productName,
            vendor: purchaseOrderData.supplierName || 'Unknown Vendor',
            product_type: 'General',
            status: 'draft',
            variants: [{
              title: 'Default Title',
              price: item.retailPrice?.toFixed(2) || '0.00',
              sku: item.sku || ''
            }],
            images: [],
            tags: []
          },
          originalLineItem: item,
          approvedImages: [],
          imageStatus: 'error',
          processingMetadata: {
            lineItemId: item.id,
            hasImages: false,
            imageReviewCompleted: false,
            readyForSync: false,
            error: error.message
          }
        })
      }
    }

    const payload = {
      products: shopifyProducts,
      summary: {
        totalProducts: shopifyProducts.length,
        productsWithImages: shopifyProducts.filter(p => p.approvedImages.length > 0).length,
        productsReadyForSync: shopifyProducts.filter(p => p.processingMetadata.readyForSync).length,
        needsImageReview: shopifyProducts.filter(p => !p.processingMetadata.imageReviewCompleted).length
      },
      merchantConfig,
      generatedAt: new Date().toISOString()
    }

    console.log(`✅ [PIPELINE] Shopify payload prepared:`)
    console.log(`   - ${payload.summary.totalProducts} products`)
    console.log(`   - ${payload.summary.productsWithImages} with approved images`)
    console.log(`   - ${payload.summary.productsReadyForSync} ready for sync`)
    console.log(`   - ${payload.summary.needsImageReview} need image review`)
    
    return payload
  }

  // ====== UTILITY METHODS ======

  normalizeCurrency(amount, baseCurrency = 'USD') {
    if (typeof amount === 'string') {
      // Remove currency symbols and parse
      amount = parseFloat(amount.replace(/[$,£€¥]/g, ''))
    }
    return isNaN(amount) ? 0 : parseFloat(amount.toFixed(2))
  }

  normalizeQuantity(quantity) {
    const parsed = parseInt(quantity)
    return isNaN(parsed) || parsed <= 0 ? 1 : parsed
  }

  normalizeProductName(name) {
    return name
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s-]/g, '') // Remove special characters except hyphens
      .substring(0, 100) // Limit length
  }

  normalizeDescription(description) {
    return description
      .trim()
      .replace(/\s+/g, ' ')
      .substring(0, 500) // Limit length
  }

  normalizeSku(sku) {
    return sku
      .trim()
      .toUpperCase()
      .replace(/[^\w-]/g, '') // Remove special characters except hyphens
      .substring(0, 50) // Limit length
  }

  applyCategoryMapping(item, categoryMappings) {
    // Simple keyword-based category mapping
    const itemText = `${item.productName} ${item.description}`.toLowerCase()
    
    for (const [keywords, category] of Object.entries(categoryMappings)) {
      const keywordList = keywords.split(',').map(k => k.trim().toLowerCase())
      const hasMatch = keywordList.some(keyword => itemText.includes(keyword))
      
      if (hasMatch) {
        return { category, confidence: 0.8 }
      }
    }
    
    return { category: 'General', confidence: 0.3 }
  }

  applyCustomRules(item, customRules) {
    const appliedRules = []
    
    customRules.forEach(rule => {
      // Example rule structure: { condition: 'price > 100', action: 'add_tag:expensive' }
      try {
        if (this.evaluateRule(item, rule.condition)) {
          appliedRules.push(rule.action)
        }
      } catch (error) {
        console.warn('Failed to apply custom rule:', rule, error.message)
      }
    })
    
    return appliedRules
  }

  evaluateRule(item, condition) {
    // Simple rule evaluation (could be expanded with a proper expression parser)
    const price = item.unitCost || 0
    
    if (condition.includes('price >')) {
      const threshold = parseFloat(condition.split('>')[1].trim())
      return price > threshold
    }
    
    if (condition.includes('price <')) {
      const threshold = parseFloat(condition.split('<')[1].trim())
      return price < threshold
    }
    
    return false
  }

  async generateEnhancedDescription(item) {
    // Placeholder for GPT integration
    // In real implementation, this would call OpenAI API
    const baseDescription = item.description || item.productName || ''
    
    return `Enhanced ${baseDescription} - Professional grade product with premium features and quality construction. Perfect for commercial and professional use.`
  }

  async generateProductTags(item) {
    // Generate relevant tags based on product name and description
    const text = `${item.productName} ${item.description}`.toLowerCase()
    const tags = []
    
    // Category-based tags
    if (text.includes('electronics')) tags.push('electronics', 'tech')
    if (text.includes('clothing') || text.includes('apparel')) tags.push('clothing', 'fashion')
    if (text.includes('home') || text.includes('kitchen')) tags.push('home', 'household')
    
    // Price-based tags
    if (item.unitCost > 100) tags.push('premium')
    if (item.unitCost < 20) tags.push('budget-friendly')
    
    return tags
  }

  async sourceProductImages(item) {
    // Placeholder for image sourcing
    // In real implementation, this would integrate with image APIs
    return [
      {
        src: `https://via.placeholder.com/400x400?text=${encodeURIComponent(item.productName)}`,
        alt: item.productName,
        position: 1
      }
    ]
  }

  async generateSEOTitle(item) {
    const name = item.productName || 'Product'
    const category = item.category || 'Item'
    return `${name} - Professional ${category} | High Quality`
  }

  async extractSpecifications(item) {
    // Extract technical specifications from description
    return {
      material: 'Not specified',
      dimensions: 'Not specified',
      weight: 'Not specified',
      color: 'Not specified'
    }
  }

  async getMerchantShopifyConfig(merchantId) {
    // Get merchant's Shopify configuration with retry logic
    const merchant = await prismaOperation(
  (prisma) => prisma.merchant.findUnique({
        where: { id: merchantId }
      }),
      `Get merchant Shopify config for ${merchantId}`
    )
    
    return {
      defaultVendor: merchant?.name || 'Unknown Vendor',
      defaultProductType: 'General',
      taxable: true,
      trackInventory: true
    }
  }

  formatProductDescription(item) {
    const parts = []
    
    if (item.enhancedDescription) {
      parts.push(`<p>${item.enhancedDescription}</p>`)
    }
    
    if (item.specifications) {
      parts.push('<h3>Specifications</h3>')
      parts.push('<ul>')
      Object.entries(item.specifications).forEach(([key, value]) => {
        if (value && value !== 'Not specified') {
          parts.push(`<li><strong>${key}:</strong> ${value}</li>`)
        }
      })
      parts.push('</ul>')
    }
    
    return parts.join('')
  }

  formatShopifyTags(item) {
    const tags = []
    
    if (item.aiGeneratedTags) {
      tags.push(...item.aiGeneratedTags)
    }
    
    if (item.category && item.category !== 'General') {
      tags.push(item.category)
    }
    
    return tags.join(', ')
  }

  formatShopifyImages(images) {
    return images.map((img, index) => ({
      src: img.src,
      alt: img.alt || 'Product Image',
      position: index + 1
    }))
  }

  createMetafields(item, purchaseOrderData) {
    return [
      {
        namespace: 'po_sync',
        key: 'purchase_order_id',
        value: purchaseOrderData.id,
        type: 'single_line_text_field'
      },
      {
        namespace: 'po_sync',
        key: 'line_item_id',
        value: item.id,
        type: 'single_line_text_field'
      },
      {
        namespace: 'po_sync',
        key: 'supplier_name',
        value: purchaseOrderData.supplierName || 'Unknown',
        type: 'single_line_text_field'
      },
      {
        namespace: 'po_sync',
        key: 'cost_price',
        value: item.unitCost?.toString() || '0',
        type: 'number_decimal'
      }
    ]
  }

  extractWeight(item) {
    // Try to extract weight from description or specifications
    const text = `${item.description || ''} ${JSON.stringify(item.specifications || {})}`.toLowerCase()
    const weightMatch = text.match(/(\d+\.?\d*)\s*(lb|lbs|pound|pounds|kg|kilogram)/i)
    
    if (weightMatch) {
      const weight = parseFloat(weightMatch[1])
      const unit = weightMatch[2].toLowerCase()
      
      // Convert to pounds
      if (unit.includes('kg') || unit.includes('kilogram')) {
        return weight * 2.20462 // Convert kg to lbs
      }
      return weight
    }
    
    return 1 // Default weight
  }

  // ==========================================
  // IMAGE PROCESSING HELPER METHODS
  // ==========================================

  /**
   * Build image context for AI description generation
   */
  buildImageContextForAI(itemImages) {
    const context = {
      hasImages: false,
      imageTypes: [],
      imageQuality: 'unknown'
    }

    if (itemImages.vendorImages?.length > 0) {
      context.hasImages = true
      context.imageTypes.push('vendor-provided')
      context.imageQuality = 'high'
    }

    if (itemImages.webScraped?.length > 0) {
      context.hasImages = true
      context.imageTypes.push('web-sourced')
      if (context.imageQuality === 'unknown') {
        context.imageQuality = 'medium'
      }
    }

    if (itemImages.aiGenerated) {
      context.hasImages = true
      context.imageTypes.push('ai-generated')
      if (context.imageQuality === 'unknown') {
        context.imageQuality = 'ai-placeholder'
      }
    }

    return context
  }

  /**
   * Determine if item needs merchant image review
   */
  determineImageReviewNeeded(itemImages) {
    // Needs review if:
    // 1. No vendor images available
    // 2. Only AI-generated images
    // 3. No processed images at all
    
    const hasVendorImages = itemImages.vendorImages?.length > 0
    const hasProcessedImages = itemImages.processed?.length > 0
    const onlyAIImages = itemImages.aiGenerated && !hasVendorImages && !itemImages.webScraped?.length
    
    return !hasVendorImages || onlyAIImages || !hasProcessedImages
  }

  /**
   * Enhanced description generation with image context
   */
  async generateEnhancedDescriptionWithContext(item, imageContext = null) {
    try {
      let prompt = `Create a compelling product description for: ${item.productName}`
      
      if (item.description) {
        prompt += `\n\nOriginal description: ${item.description}`
      }
      
      if (imageContext?.hasImages) {
        prompt += `\n\nImage context: This product has ${imageContext.imageTypes.join(', ')} images available with ${imageContext.imageQuality} quality.`
      }
      
      prompt += '\n\nCreate a professional, engaging description that highlights key features and benefits. Keep it concise but informative.'
      
      // TODO: Integrate with actual AI service
      // For now, return enhanced version of original
      return item.description || `Professional ${item.productName} - high quality product perfect for your needs.`
      
    } catch (error) {
      console.error('❌ Failed to generate enhanced description:', error)
      return item.description || item.productName
    }
  }

  // ==========================================
  // IMAGE PAYLOAD HELPER METHODS
  // ==========================================

  /**
   * Get approved images for a line item from review system
   */
  async getApprovedImagesForItem(item, purchaseOrderId) {
    try {
      if (!item.images?.reviewSessionId) {
        // Use processed images directly if no review session
        return item.images?.processed || []
      }

      // Get approved images from review session
      const approvedImages = await db.query(`
        SELECT iro.* 
        FROM image_review_options iro
        JOIN image_review_items iri ON iro.review_item_id = iri.id
        JOIN image_review_sessions irs ON iri.session_id = irs.id
        WHERE irs.purchase_order_id = $1 
          AND iri.line_item_id = $2
          AND iro.is_selected = true
        ORDER BY iro.selection_order ASC
      `, [purchaseOrderId, item.id])

      return approvedImages.rows.map(row => ({
        id: row.id,
        url: row.image_url,
        category: row.image_category,
        sourceInfo: JSON.parse(row.source_info || '{}'),
        position: row.selection_order || 1,
        approved: true
      }))
      
    } catch (error) {
      console.error(`❌ Failed to get approved images for item ${item.id}:`, error)
      return item.images?.processed || []
    }
  }

  /**
   * Format images for Shopify API
   */
  formatShopifyImages(approvedImages) {
    if (!approvedImages || approvedImages.length === 0) {
      return []
    }

    return approvedImages.map((image, index) => ({
      src: image.url,
      alt: image.altText || `Product image ${index + 1}`,
      position: image.position || index + 1
    }))
  }

  /**
   * Get image status for an item
   */
  getImageStatus(item, approvedImages) {
    if (approvedImages.length === 0) {
      return 'no_images'
    }
    
    if (item.images?.needsReview && !item.images?.reviewSessionId) {
      return 'needs_review'
    }
    
    if (approvedImages.some(img => img.category === 'vendor')) {
      return 'vendor_images'
    }
    
    if (approvedImages.some(img => img.category === 'web_scraped')) {
      return 'web_scraped'
    }
    
    if (approvedImages.some(img => img.category === 'ai_generated')) {
      return 'ai_generated'
    }
    
    return 'custom_images'
  }

  /**
   * Check if item is ready for Shopify sync
   */
  isReadyForShopifySync(item, approvedImages) {
    // Ready if has approved images or doesn't need review
    return approvedImages.length > 0 || !item.images?.needsReview
  }
}

export default RefinementPipelineService