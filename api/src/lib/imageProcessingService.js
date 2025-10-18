/**
 * Image Processing Pipeline Service
 * 
 * Implements cost-effective image sourcing and processing:
 * 1. Parse & Extract Vendor Images (PO embedded + catalog URLs)
 * 2. Image Source Hierarchy (vendor → Google Images → placeholder)
 * 3. Google Images Search (for real product photos)
 * 4. Quality Enhancement (resize, background cleanup, deduplication)
 * 5. Staging in Supabase for merchant review
 * 6. Shopify API integration
 * 
 * Note: AI image generation removed to reduce costs (~60-90% savings)
 */

import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import fetch from 'node-fetch'
import sharp from 'sharp'
import { enhancedAIService } from './enhancedAIService.js'
import { ProductImageReferenceService } from './productImageSearchService.js'

export class ImageProcessingService {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
    this.imagesBucket = 'product-images-staging'
    this.maxImageSize = 2048 // Shopify optimal size
    this.supportedFormats = ['jpg', 'jpeg', 'png', 'webp']
    this.googleImageSearchTimeoutMs = 25000 // Increased to 25s to reduce timeouts (was 12s)
    
    // Initialize the reference-based image service
    this.productImageReferenceService = new ProductImageReferenceService()
    
    // Intelligent supplier search configuration
    this.supplierSearchTimeoutMs = 15000 // 15s per supplier website
    this.supplierSearchCache = new Map() // In-memory cache for scraped products
    this.supplierRateLimits = new Map() // Rate limiting per domain
    
    // Industry-specific distributor database
    this.industryDistributors = {
      candy: [
        { domain: 'candywarehouse.com', name: 'Candy Warehouse', searchPattern: '/search?q={query}', platform: 'custom' },
        { domain: 'nassaucandy.com', name: 'Nassau Candy', searchPattern: '/search?q={query}', platform: 'shopify' },
        { domain: 'candyville.ca', name: 'Candyville', searchPattern: '/search?q={query}', platform: 'shopify' },
        { domain: 'allcitycandy.com', name: 'All City Candy', searchPattern: '/search?q={query}', platform: 'bigcommerce' }
      ],
      electronics: [
        { domain: 'digikey.com', name: 'Digi-Key', searchPattern: '/products/en?keywords={query}', platform: 'custom' },
        { domain: 'mouser.com', name: 'Mouser', searchPattern: '/Search/Refine?Keyword={query}', platform: 'custom' },
        { domain: 'arrow.com', name: 'Arrow', searchPattern: '/en/products/search?q={query}', platform: 'custom' }
      ],
      office_supplies: [
        { domain: 'uline.com', name: 'Uline', searchPattern: '/Product/Detail?model={sku}', platform: 'custom' },
        { domain: 'globalindustrial.com', name: 'Global Industrial', searchPattern: '/search?query={query}', platform: 'custom' }
      ],
      automotive: [
        { domain: 'autozone.com', name: 'AutoZone', searchPattern: '/search?searchText={query}', platform: 'custom' },
        { domain: 'advanceautoparts.com', name: 'Advance Auto Parts', searchPattern: '/s?q={query}', platform: 'custom' }
      ],
      hardware: [
        { domain: 'homedepot.com', name: 'Home Depot', searchPattern: '/s/{query}', platform: 'custom' },
        { domain: 'lowes.com', name: "Lowe's", searchPattern: '/search?query={query}', platform: 'custom' },
        { domain: 'mcmaster.com', name: 'McMaster-Carr', searchPattern: '/search?query={query}', platform: 'custom' }
      ],
      generic: [
        { domain: 'amazon.com', name: 'Amazon', searchPattern: '/s?k={query}', platform: 'custom' },
        { domain: 'alibaba.com', name: 'Alibaba', searchPattern: '/trade/search?SearchText={query}', platform: 'custom' }
      ]
    }
    
    // Industry detection keywords
    this.industryKeywords = {
      candy: ['candy', 'chocolate', 'gummy', 'gum', 'sweet', 'confection', 'lollipop', 'taffy', 'mint', 'caramel', 'truffle', 'fudge'],
      electronics: ['electronic', 'resistor', 'capacitor', 'circuit', 'pcb', 'chip', 'diode', 'transistor', 'sensor', 'module', 'led'],
      office_supplies: ['paper', 'pen', 'pencil', 'stapler', 'folder', 'notebook', 'binder', 'desk', 'chair', 'filing', 'envelope'],
      automotive: ['auto', 'car', 'vehicle', 'engine', 'brake', 'tire', 'filter', 'oil', 'spark plug', 'battery', 'alternator'],
      hardware: ['screw', 'bolt', 'nut', 'washer', 'nail', 'hammer', 'drill', 'saw', 'wrench', 'pliers', 'lumber', 'paint']
    }
  }

  // ==========================================
  // STEP 1: PARSE & EXTRACT VENDOR IMAGES
  // ==========================================

  /**
   * Extract images from PO content and vendor catalog URLs
   */
  async extractVendorImages(poContent, parsedData) {
    console.log('🖼️ Step 1: Extracting vendor images from PO...')
    
    const extractedImages = {
      embedded: [],
      catalogUrls: [],
      vendorImages: []
    }

    try {
      // 1. Extract embedded images from PO content
      extractedImages.embedded = await this.extractEmbeddedImages(poContent)
      
      // 2. Extract vendor catalog URLs
      extractedImages.catalogUrls = await this.extractCatalogUrls(parsedData)
      
      // 3. Scrape vendor catalog images
      for (const catalogUrl of extractedImages.catalogUrls) {
        const catalogImages = await this.scrapeVendorCatalog(catalogUrl)
        extractedImages.vendorImages.push(...catalogImages)
      }

      console.log(`✅ Extracted ${extractedImages.embedded.length} embedded images`)
      console.log(`✅ Found ${extractedImages.catalogUrls.length} catalog URLs`)
      console.log(`✅ Scraped ${extractedImages.vendorImages.length} vendor images`)

      return extractedImages
    } catch (error) {
      console.error('❌ Vendor image extraction failed:', error)
      return extractedImages
    }
  }

  /**
   * Extract embedded images from PO document
   */
  async extractEmbeddedImages(poContent) {
    const embeddedImages = []
    
    try {
      // Look for base64 encoded images in PO content
      const base64Regex = /data:image\/([^;]+);base64,([^"'\s]+)/g
      let match
      
      while ((match = base64Regex.exec(poContent)) !== null) {
        const [fullMatch, format, data] = match
        if (this.supportedFormats.includes(format.toLowerCase())) {
          embeddedImages.push({
            type: 'embedded',
            format,
            data,
            source: 'po_document'
          })
        }
      }

      // Look for image URLs in PO content
      const urlRegex = /https?:\/\/[^\s]+\.(?:jpg|jpeg|png|webp)/gi
      const urls = poContent.match(urlRegex) || []
      
      for (const url of urls) {
        embeddedImages.push({
          type: 'url',
          url,
          source: 'po_document'
        })
      }

      return embeddedImages
    } catch (error) {
      console.error('❌ Failed to extract embedded images:', error)
      return []
    }
  }

  /**
   * Extract vendor catalog URLs from parsed PO data
   */
  async extractCatalogUrls(parsedData) {
    const catalogUrls = []
    
    try {
      // Look for catalog URLs in line items
      if (parsedData.lineItems) {
        for (const item of parsedData.lineItems) {
          // Check for catalog URLs in various fields
          const fields = [item.description, item.notes, item.productCode, item.vendorSku]
          
          for (const field of fields) {
            if (field && typeof field === 'string') {
              const urls = this.extractUrlsFromText(field)
              catalogUrls.push(...urls)
            }
          }
        }
      }

      // Look for vendor website in supplier info
      if (parsedData.supplier?.website) {
        catalogUrls.push(parsedData.supplier.website)
      }

      return [...new Set(catalogUrls)] // Remove duplicates
    } catch (error) {
      console.error('❌ Failed to extract catalog URLs:', error)
      return []
    }
  }

  /**
   * Extract URLs from text content
   */
  extractUrlsFromText(text) {
    const urlRegex = /https?:\/\/[^\s]+/g
    return text.match(urlRegex) || []
  }

  /**
   * Intelligent supplier website scraping with product matching
   * Replaces basic scrapeVendorCatalog with smart multi-supplier search
   */
  async scrapeVendorCatalog(catalogUrl, item = null, supplierInfo = null) {
    // If we have item context, use intelligent supplier search
    if (item && supplierInfo) {
      console.log(`🎯 Intelligent supplier search enabled for: ${item.productName}`)
      return this.intelligentSupplierSearch(item, supplierInfo)
    }
    
    // Fallback to basic scraping if no item context
    return this.basicCatalogScrape(catalogUrl)
  }

  /**
   * Basic catalog scraping (legacy fallback)
   */
  async basicCatalogScrape(catalogUrl) {
    const vendorImages = []
    
    try {
      console.log(`🔍 Basic scraping vendor catalog: ${catalogUrl}`)
      
      const response = await this.fetchWithTimeout(catalogUrl, 10000)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      
      const html = await response.text()
      
      // Extract image URLs from HTML (basic regex)
      const imgRegex = /<img[^>]+src="([^"]+)"/gi
      let match
      
      while ((match = imgRegex.exec(html)) !== null) {
        const imageUrl = this.resolveUrl(match[1], catalogUrl)
        if (this.isValidImageUrl(imageUrl)) {
          vendorImages.push({
            type: 'catalog',
            url: imageUrl,
            source: catalogUrl,
            confidence: 0.3 // Low confidence for basic scraping
          })
        }
      }

      console.log(`   ✅ Extracted ${vendorImages.length} images via basic scraping`)
      return vendorImages.slice(0, 5) // Limit to 5 images
    } catch (error) {
      console.error(`   ❌ Basic scraping failed: ${error.message}`)
      return []
    }
  }

  /**
   * Intelligent supplier search - finds product-specific images across multiple suppliers
   */
  async intelligentSupplierSearch(item, supplierInfo) {
    console.log(`\n🔍 ===== INTELLIGENT SUPPLIER SEARCH =====`)
    console.log(`   Product: ${item.productName}`)
    console.log(`   SKU: ${item.sku || 'N/A'}`)
    console.log(`   Supplier: ${supplierInfo?.name || supplierInfo?.website || 'Unknown'}`)
    
    try {
      // STAGE 1: Build search targets
      const searchTargets = this.buildSupplierSearchTargets(item, supplierInfo)
      
      if (searchTargets.length === 0) {
        console.log(`   ⚠️ No search targets found`)
        return []
      }
      
      console.log(`   📋 ${searchTargets.length} search targets identified`)
      
      // STAGE 2: Execute parallel searches with timeout
      const results = await this.executeParallelSupplierSearch(searchTargets, item)
      
      // STAGE 3: Extract & score product images
      const allImages = []
      for (const result of results) {
        if (result.success && result.images) {
          allImages.push(...result.images)
        }
      }
      
      if (allImages.length === 0) {
        console.log(`   ❌ No images found from any supplier`)
        return []
      }
      
      // STAGE 4: Deduplicate & rank by confidence
      const uniqueImages = this.deduplicateImages(allImages)
      const rankedImages = uniqueImages.sort((a, b) => b.confidence - a.confidence)
      
      console.log(`   ✅ Found ${rankedImages.length} unique product images`)
      console.log(`   🎯 Top confidence: ${(rankedImages[0].confidence * 100).toFixed(1)}%`)
      console.log(`\n==========================================\n`)
      
      return rankedImages.slice(0, 10) // Return top 10 images
      
    } catch (error) {
      console.error(`   ❌ Intelligent supplier search failed:`, error)
      return []
    }
  }

  /**
   * Build list of supplier websites to search
   */
  buildSupplierSearchTargets(item, supplierInfo) {
    const targets = []
    
    // 1. Direct supplier website (highest priority)
    if (supplierInfo?.website) {
      const platform = this.detectEcommercePlatform(supplierInfo.website)
      const searchUrls = this.buildPlatformSearchUrls(supplierInfo.website, item, platform)
      
      for (const url of searchUrls) {
        targets.push({
          url,
          domain: supplierInfo.website,
          name: supplierInfo.name || supplierInfo.website,
          platform,
          priority: 1,
          type: 'direct_supplier'
        })
      }
    }
    
    // 2. Industry-specific distributors (medium priority)
    const industry = this.detectIndustry(item.productName)
    const distributors = this.getIndustryDistributors(industry)
    
    for (const distributor of distributors) {
      // Skip if it's the same as direct supplier
      if (supplierInfo?.website && supplierInfo.website.includes(distributor.domain)) {
        continue
      }
      
      const searchUrls = this.buildDistributorSearchUrls(distributor, item)
      for (const url of searchUrls) {
        targets.push({
          url,
          domain: distributor.domain,
          name: distributor.name,
          platform: distributor.platform,
          priority: 2,
          type: 'distributor'
        })
      }
    }
    
    // 3. Manufacturer website (low priority)
    const brand = this.extractBrand(item.productName)
    if (brand) {
      const manufacturerUrls = this.buildManufacturerSearchUrls(brand, item)
      for (const url of manufacturerUrls) {
        targets.push({
          url,
          domain: url.match(/https?:\/\/([^/]+)/)?.[1],
          name: brand,
          platform: 'unknown',
          priority: 3,
          type: 'manufacturer'
        })
      }
    }
    
    // Sort by priority and limit to top 5 targets
    return targets
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 5)
  }

  /**
   * Detect e-commerce platform from URL or HTML
   */
  detectEcommercePlatform(websiteUrl) {
    const urlLower = websiteUrl.toLowerCase()
    
    // Platform detection patterns
    if (urlLower.includes('shopify') || urlLower.includes('myshopify.com')) {
      return 'shopify'
    }
    if (urlLower.includes('bigcommerce')) {
      return 'bigcommerce'
    }
    if (urlLower.includes('woocommerce') || urlLower.includes('wordpress')) {
      return 'woocommerce'
    }
    if (urlLower.includes('squarespace')) {
      return 'squarespace'
    }
    
    return 'generic'
  }

  /**
   * Build platform-specific search URLs
   */
  buildPlatformSearchUrls(website, item, platform) {
    const urls = []
    const baseUrl = website.replace(/\/$/, '') // Remove trailing slash
    
    // Build search query from product name
    const query = this.buildSearchQuery(item)
    const slug = this.productNameToSlug(item.productName)
    
    switch (platform) {
      case 'shopify':
        // Shopify patterns
        urls.push(`${baseUrl}/search?q=${encodeURIComponent(query)}`)
        if (item.sku) {
          urls.push(`${baseUrl}/search?q=${encodeURIComponent(item.sku)}`)
        }
        // Try direct product URL
        urls.push(`${baseUrl}/products/${slug}`)
        break
        
      case 'woocommerce':
        // WooCommerce patterns
        urls.push(`${baseUrl}/?s=${encodeURIComponent(query)}`)
        urls.push(`${baseUrl}/product/${slug}`)
        break
        
      case 'bigcommerce':
        // BigCommerce patterns
        urls.push(`${baseUrl}/search.php?search_query=${encodeURIComponent(query)}`)
        break
        
      default:
        // Generic patterns
        urls.push(`${baseUrl}/search?q=${encodeURIComponent(query)}`)
        urls.push(`${baseUrl}/products/${slug}`)
    }
    
    return urls
  }

  /**
   * Build distributor search URLs
   */
  buildDistributorSearchUrls(distributor, item) {
    const urls = []
    const baseUrl = `https://${distributor.domain}`
    const query = this.buildSearchQuery(item)
    
    // Replace placeholders in search pattern
    let searchUrl = distributor.searchPattern
      .replace('{query}', encodeURIComponent(query))
      .replace('{sku}', encodeURIComponent(item.sku || query))
      .replace('{slug}', this.productNameToSlug(item.productName))
    
    urls.push(`${baseUrl}${searchUrl}`)
    
    return urls
  }

  /**
   * Build manufacturer search URLs
   */
  buildManufacturerSearchUrls(brand, item) {
    const urls = []
    const brandDomain = brand.toLowerCase().replace(/[^a-z0-9]/g, '')
    const query = this.buildSearchQuery(item)
    
    // Try common domain patterns
    const possibleDomains = [
      `${brandDomain}.com`,
      `${brandDomain}.ca`,
      `${brandDomain}.co`
    ]
    
    for (const domain of possibleDomains.slice(0, 1)) { // Only try .com for now
      urls.push(`https://${domain}/search?q=${encodeURIComponent(query)}`)
    }
    
    return urls
  }

  /**
   * Detect industry from product name
   */
  detectIndustry(productName) {
    const nameLower = productName.toLowerCase()
    
    for (const [industry, keywords] of Object.entries(this.industryKeywords)) {
      if (keywords.some(keyword => nameLower.includes(keyword))) {
        return industry
      }
    }
    
    return 'generic'
  }

  /**
   * Get distributors for industry
   */
  getIndustryDistributors(industry) {
    // Return industry-specific distributors, fallback to generic
    const distributors = this.industryDistributors[industry] || []
    const generic = this.industryDistributors.generic || []
    
    // Combine and limit to 3 distributors
    return [...distributors, ...generic].slice(0, 3)
  }

  /**
   * Extract brand from product name
   */
  extractBrand(productName) {
    // Common brand patterns (first word or word before specific keywords)
    const words = productName.split(/\s+/)
    
    // If first word is capitalized and not a descriptor, likely a brand
    const firstWord = words[0]
    if (firstWord && firstWord[0] === firstWord[0].toUpperCase() && firstWord.length > 2) {
      return firstWord
    }
    
    return null
  }

  /**
   * Build optimized search query from item
   */
  buildSearchQuery(item) {
    // Prioritize SKU if available
    if (item.sku) {
      return item.sku
    }
    
    // Otherwise use product name
    // Remove common noise words
    const noiseWords = ['x', 'unit', 'units', 'case', 'pack', 'box', 'ct', 'count']
    const cleanName = item.productName
      .split(/\s+/)
      .filter(word => !noiseWords.includes(word.toLowerCase()))
      .join(' ')
    
    return cleanName || item.productName
  }

  /**
   * Convert product name to URL slug
   */
  productNameToSlug(productName) {
    return productName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
  }

  /**
   * Execute parallel supplier searches with timeout
   */
  async executeParallelSupplierSearch(searchTargets, item) {
    console.log(`   🚀 Executing ${searchTargets.length} parallel searches...`)
    
    const searchPromises = searchTargets.map(async (target) => {
      try {
        console.log(`      🔍 Searching ${target.name} (${target.platform})...`)
        
        const result = await this.scrapeSupplierWebsite(target, item)
        
        if (result.images && result.images.length > 0) {
          console.log(`         ✅ Found ${result.images.length} images (confidence: ${(result.images[0].confidence * 100).toFixed(1)}%)`)
        } else {
          console.log(`         ⚠️ No images found`)
        }
        
        return {
          success: true,
          target,
          ...result
        }
      } catch (error) {
        console.log(`         ❌ Failed: ${error.message}`)
        return {
          success: false,
          target,
          error: error.message
        }
      }
    })
    
    // Execute all searches in parallel
    const results = await Promise.all(searchPromises)
    
    const successful = results.filter(r => r.success).length
    console.log(`   📊 ${successful}/${results.length} searches successful`)
    
    return results
  }

  /**
   * Scrape specific supplier website based on platform
   */
  async scrapeSupplierWebsite(target, item) {
    // Check cache first
    const cacheKey = `${target.domain}:${item.sku || item.productName}`
    const cached = this.getFromCache(cacheKey)
    if (cached) {
      console.log(`         💾 Using cached result`)
      return cached
    }
    
    // Check rate limit
    if (!this.checkRateLimit(target.domain)) {
      throw new Error('Rate limit exceeded')
    }
    
    // Platform-specific scraping
    let result
    switch (target.platform) {
      case 'shopify':
        result = await this.scrapeShopifyProduct(target.url, item)
        break
      case 'woocommerce':
        result = await this.scrapeWooCommerceProduct(target.url, item)
        break
      case 'bigcommerce':
        result = await this.scrapeBigCommerceProduct(target.url, item)
        break
      default:
        result = await this.scrapeGenericEcommerce(target.url, item)
    }
    
    // Cache result for 24 hours
    this.addToCache(cacheKey, result, 24 * 60 * 60 * 1000)
    
    return result
  }

  /**
   * Scrape Shopify product page
   */
  async scrapeShopifyProduct(url, item) {
    try {
      // Try JSON endpoint first (much faster and more reliable)
      const jsonUrl = url.replace(/\?.*$/, '').replace(/\/$/, '') + '.json'
      
      const response = await this.fetchWithTimeout(jsonUrl, this.supplierSearchTimeoutMs)
      
      if (response.ok) {
        const data = await response.json()
        
        // Check if it's a product page or search results
        if (data.product) {
          // Single product page
          const product = data.product
          const matchScore = this.calculateProductMatchScore(product, item)
          
          if (matchScore > 0.5) { // Only return if reasonable match
            return {
              images: product.images.map(img => ({
                url: img.src,
                alt: img.alt || product.title,
                width: img.width,
                height: img.height,
                source: url,
                confidence: matchScore * 0.9, // High confidence for direct match
                platform: 'shopify'
              })),
              product: {
                title: product.title,
                vendor: product.vendor,
                sku: product.variants[0]?.sku,
                price: product.variants[0]?.price
              }
            }
          }
        } else if (data.products) {
          // Search results page
          const products = data.products
          let bestMatch = null
          let bestScore = 0
          
          for (const product of products) {
            const score = this.calculateProductMatchScore(product, item)
            if (score > bestScore) {
              bestScore = score
              bestMatch = product
            }
          }
          
          if (bestMatch && bestScore > 0.5) {
            return {
              images: bestMatch.images.map(img => ({
                url: img.src,
                alt: img.alt || bestMatch.title,
                source: url,
                confidence: bestScore * 0.85,
                platform: 'shopify'
              }))
            }
          }
        }
      }
    } catch (error) {
      // Fallback to HTML scraping if JSON fails
      console.log(`         ⚠️ JSON endpoint failed, trying HTML scraping`)
    }
    
    // Fallback: HTML scraping
    return this.scrapeGenericEcommerce(url, item)
  }

  /**
   * Scrape WooCommerce product page
   */
  async scrapeWooCommerceProduct(url, item) {
    try {
      const response = await this.fetchWithTimeout(url, this.supplierSearchTimeoutMs)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      
      const html = await response.text()
      
      // Extract JSON-LD structured data
      const jsonLd = this.extractJsonLd(html)
      
      if (jsonLd && jsonLd['@type'] === 'Product') {
        const matchScore = this.calculateProductMatchScore(jsonLd, item)
        
        if (matchScore > 0.5) {
          const images = [jsonLd.image].flat().map(imgUrl => ({
            url: imgUrl,
            source: url,
            confidence: matchScore * 0.85,
            platform: 'woocommerce'
          }))
          
          return { images }
        }
      }
    } catch (error) {
      console.log(`         ⚠️ WooCommerce scraping failed: ${error.message}`)
    }
    
    // Fallback to generic scraping
    return this.scrapeGenericEcommerce(url, item)
  }

  /**
   * Scrape BigCommerce product page
   */
  async scrapeBigCommerceProduct(url, item) {
    // BigCommerce doesn't have a public JSON API, use generic scraping
    return this.scrapeGenericEcommerce(url, item)
  }

  /**
   * Generic e-commerce scraping with multi-strategy extraction
   */
  async scrapeGenericEcommerce(url, item) {
    try {
      const response = await this.fetchWithTimeout(url, this.supplierSearchTimeoutMs)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      
      const html = await response.text()
      const images = []
      
      // Strategy 1: Open Graph meta tags
      images.push(...this.extractOpenGraphImages(html, url))
      
      // Strategy 2: JSON-LD structured data
      images.push(...this.extractJsonLdImages(html, url))
      
      // Strategy 3: Common CSS patterns
      images.push(...this.extractCssImages(html, url))
      
      // Strategy 4: Lazy-loaded images
      images.push(...this.extractLazyImages(html, url))
      
      // Deduplicate and add confidence scores
      const uniqueImages = this.deduplicateImages(images)
      
      // Calculate confidence based on image source quality
      return {
        images: uniqueImages.map(img => ({
          ...img,
          confidence: img.confidence || 0.5 // Medium confidence for generic scraping
        }))
      }
      
    } catch (error) {
      console.log(`         ❌ Generic scraping failed: ${error.message}`)
      return { images: [] }
    }
  }

  /**
   * Calculate product match score (0.0-1.0)
   */
  calculateProductMatchScore(scrapedProduct, targetItem) {
    let score = 0
    let maxScore = 100
    
    // SKU matching (50 points - strongest signal)
    if (scrapedProduct.sku && targetItem.sku) {
      const scrapedSku = String(scrapedProduct.sku).toLowerCase()
      const targetSku = String(targetItem.sku).toLowerCase()
      
      if (scrapedSku === targetSku) {
        score += 50
      } else if (scrapedSku.includes(targetSku) || targetSku.includes(scrapedSku)) {
        score += 30
      }
    }
    
    // Product name matching (30 points)
    if (scrapedProduct.title || scrapedProduct.name) {
      const scrapedName = (scrapedProduct.title || scrapedProduct.name).toLowerCase()
      const targetName = targetItem.productName.toLowerCase()
      const matchRatio = this.fuzzyMatch(scrapedName, targetName)
      score += matchRatio * 30
    }
    
    // Brand matching (10 points)
    const targetBrand = this.extractBrand(targetItem.productName)
    if (targetBrand) {
      const scrapedBrand = scrapedProduct.vendor || this.extractBrand(scrapedProduct.title || scrapedProduct.name || '')
      if (scrapedBrand && targetBrand.toLowerCase() === scrapedBrand.toLowerCase()) {
        score += 10
      }
    }
    
    // Price matching (10 points - if available)
    if (scrapedProduct.price && targetItem.unitPrice) {
      const scrapedPrice = parseFloat(scrapedProduct.price)
      const targetPrice = parseFloat(targetItem.unitPrice)
      
      if (!isNaN(scrapedPrice) && !isNaN(targetPrice)) {
        const priceDiff = Math.abs(scrapedPrice - targetPrice) / targetPrice
        if (priceDiff < 0.2) { // Within 20%
          score += 10
        } else if (priceDiff < 0.5) { // Within 50%
          score += 5
        }
      }
    }
    
    return Math.min(score / maxScore, 1.0) // Return 0.0-1.0
  }

  /**
   * Fuzzy string matching (returns 0.0-1.0)
   */
  fuzzyMatch(str1, str2) {
    const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '')
    const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '')
    
    if (s1 === s2) return 1.0
    
    // Count matching words
    const words1 = str1.toLowerCase().split(/\s+/)
    const words2 = str2.toLowerCase().split(/\s+/)
    
    let matches = 0
    for (const word1 of words1) {
      if (words2.some(word2 => word2.includes(word1) || word1.includes(word2))) {
        matches++
      }
    }
    
    return matches / Math.max(words1.length, words2.length)
  }

  /**
   * Extract Open Graph images
   */
  extractOpenGraphImages(html, sourceUrl) {
    const images = []
    const ogImageRegex = /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/gi
    let match
    
    while ((match = ogImageRegex.exec(html)) !== null) {
      images.push({
        url: this.resolveUrl(match[1], sourceUrl),
        source: sourceUrl,
        type: 'og:image',
        confidence: 0.8 // High confidence for OG images
      })
    }
    
    return images
  }

  /**
   * Extract JSON-LD structured data images
   */
  extractJsonLdImages(html, sourceUrl) {
    const images = []
    
    try {
      const jsonLd = this.extractJsonLd(html)
      
      if (jsonLd) {
        // Handle single image or array
        const imageUrls = [jsonLd.image].flat().filter(Boolean)
        
        for (const imgUrl of imageUrls) {
          images.push({
            url: this.resolveUrl(imgUrl, sourceUrl),
            source: sourceUrl,
            type: 'json-ld',
            confidence: 0.85 // Very high confidence for structured data
          })
        }
      }
    } catch (error) {
      // Silently fail if JSON-LD parsing fails
    }
    
    return images
  }

  /**
   * Extract images from common CSS patterns
   */
  extractCssImages(html, sourceUrl) {
    const images = []
    
    // Common product image CSS selectors
    const selectors = [
      /<img[^>]*class="[^"]*product-image[^"]*"[^>]*src="([^"]+)"/gi,
      /<img[^>]*class="[^"]*product-photo[^"]*"[^>]*src="([^"]+)"/gi,
      /<img[^>]*class="[^"]*gallery[^"]*"[^>]*src="([^"]+)"/gi,
      /<img[^>]*itemprop="image"[^>]*src="([^"]+)"/gi
    ]
    
    for (const regex of selectors) {
      let match
      while ((match = regex.exec(html)) !== null) {
        const imgUrl = this.resolveUrl(match[1], sourceUrl)
        if (this.isValidImageUrl(imgUrl)) {
          images.push({
            url: imgUrl,
            source: sourceUrl,
            type: 'css-pattern',
            confidence: 0.6
          })
        }
      }
    }
    
    return images
  }

  /**
   * Extract lazy-loaded images
   */
  extractLazyImages(html, sourceUrl) {
    const images = []
    
    // Lazy loading patterns (data-src, data-lazy, etc.)
    const lazyRegex = /<img[^>]*data-(?:src|lazy|original)="([^"]+)"/gi
    let match
    
    while ((match = lazyRegex.exec(html)) !== null) {
      const imgUrl = this.resolveUrl(match[1], sourceUrl)
      if (this.isValidImageUrl(imgUrl)) {
        images.push({
          url: imgUrl,
          source: sourceUrl,
          type: 'lazy-load',
          confidence: 0.5
        })
      }
    }
    
    return images
  }

  /**
   * Extract JSON-LD structured data
   */
  extractJsonLd(html) {
    try {
      const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis
      const match = jsonLdRegex.exec(html)
      
      if (match && match[1]) {
        const data = JSON.parse(match[1])
        
        // Handle both single object and array
        if (Array.isArray(data)) {
          return data.find(item => item['@type'] === 'Product') || data[0]
        }
        
        return data
      }
    } catch (error) {
      // Silently fail
    }
    
    return null
  }

  /**
   * Deduplicate images by URL
   */
  deduplicateImages(images) {
    const seen = new Set()
    const unique = []
    
    for (const img of images) {
      // Normalize URL for comparison
      const normalizedUrl = img.url.split('?')[0].toLowerCase()
      
      if (!seen.has(normalizedUrl)) {
        seen.add(normalizedUrl)
        unique.push(img)
      }
    }
    
    return unique
  }

  /**
   * Fetch with timeout and retry
   */
  async fetchWithTimeout(url, timeoutMs = 15000, retries = 1) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
        
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': this.getRandomUserAgent(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          }
        })
        
        clearTimeout(timeoutId)
        return response
        
      } catch (error) {
        if (attempt === retries) throw error
        await this.delay(1000 * (attempt + 1)) // Exponential backoff
      }
    }
  }

  /**
   * Get random user agent
   */
  getRandomUserAgent() {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
    ]
    
    return userAgents[Math.floor(Math.random() * userAgents.length)]
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Cache management
   */
  getFromCache(key) {
    const cached = this.supplierSearchCache.get(key)
    if (!cached) return null
    
    // Check if expired
    if (Date.now() > cached.expiresAt) {
      this.supplierSearchCache.delete(key)
      return null
    }
    
    return cached.data
  }

  addToCache(key, data, ttlMs) {
    this.supplierSearchCache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs
    })
    
    // Clean up old cache entries (keep max 100)
    if (this.supplierSearchCache.size > 100) {
      const oldestKey = this.supplierSearchCache.keys().next().value
      this.supplierSearchCache.delete(oldestKey)
    }
  }

  /**
   * Rate limiting
   */
  checkRateLimit(domain) {
    const now = Date.now()
    const limit = this.supplierRateLimits.get(domain) || { count: 0, resetAt: now + 60000 }
    
    // Reset if window expired
    if (now > limit.resetAt) {
      limit.count = 0
      limit.resetAt = now + 60000
    }
    
    // Check limit (10 requests per minute)
    if (limit.count >= 10) {
      return false
    }
    
    limit.count++
    this.supplierRateLimits.set(domain, limit)
    
    return true
  }

  // ==========================================
  // STEP 1.5: GOOGLE IMAGE SEARCH VIA WEB SCRAPING (FREE)
  // ==========================================

  /**
   * Search Google Images via web scraping for actual product photos
   * This is 100% free and provides same quality as Google API
   * Uses single targeted query per product for efficiency
   */
  async searchGoogleProductImages(item) {
    console.log(`\n🔍 LEVEL 2: Searching Google Images for real product photos...`)
    console.log(`   Product: ${item.productName}`)
    
    try {
      const searchQueries = this.buildImageSearchQueries(item)
      const googleImages = []
      
      // Use single query (most targeted)
      const query = searchQueries[0]
      console.log(`   🔎 Searching: "${query}"`)
      
      // Build Google Images search URL
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&hl=en`
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.googleImageSearchTimeoutMs)
      let html = ''
      let scrapingSucceeded = false

      try {
        // Fetch with proper headers to mimic browser
        const response = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          },
          signal: controller.signal
        })

        if (!response.ok) {
          console.log(`      ❌ HTTP ${response.status}: ${response.statusText}`)
        } else {
          html = await response.text()
          scrapingSucceeded = true
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log(`      ⚠️ Google image scraping aborted after ${this.googleImageSearchTimeoutMs}ms`)
        } else {
          console.log(`      ❌ Google image scraping failed: ${error.message}`)
        }
      } finally {
        clearTimeout(timeoutId)
      }

      if (scrapingSucceeded) {
        // Extract image data from Google Images HTML
        const imageData = this.extractGoogleImageData(html, item)
        
        if (imageData.length > 0) {
          console.log(`      ✅ Found ${imageData.length} images via scraping`)
          
          for (const imgData of imageData) {
            googleImages.push({
              url: imgData.url,
              title: imgData.title || item.productName,
              snippet: imgData.snippet || '',
              contextLink: imgData.source || '',
              thumbnailUrl: imgData.thumbnail || imgData.url,
              width: imgData.width || 800,
              height: imgData.height || 600,
              source: 'google_images_scraping',
              type: 'product_photo',
              confidence: this.calculateImageConfidenceFromUrl(imgData.url, item),
              searchQuery: query
            })
          }
        } else {
          console.log(`      ❌ No images found`)
        }
      }

      let sortedImages = googleImages
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3) // Top 3 most relevant images

      if (sortedImages.length > 0) {
        console.log(`   ✅ Found ${sortedImages.length} relevant product images`)
        for (const img of sortedImages) {
          console.log(`      📸 ${img.title.substring(0, 50)} (confidence: ${(img.confidence * 100).toFixed(1)}%)`)
          console.log(`         ${img.url.substring(0, 60)}...`)
        }
      } else {
        console.log(`   ❌ No relevant product images found`)

        // DISABLED: Google Custom Search API fallback (rate limits exceeded)
        // System now relies only on free web scraping. When scraping fails,
        // processing continues without images rather than hitting API limits.
        console.log('   ℹ️ Google API fallback disabled to avoid rate limits')
        console.log('   ⚠️ No images found for:', item.productName)
        
        // Return empty array - allow processing to continue without images
        sortedImages = []
      }

      // Rate limiting: Add delay to avoid being blocked
      await new Promise(resolve => setTimeout(resolve, 500))

      return sortedImages
      
    } catch (error) {
      console.log(`   ❌ Google image search failed: ${error.message}`)
      
      // Rate limiting even on error
      await new Promise(resolve => setTimeout(resolve, 500))
      
      return []
    }
  }

  /**
   * Build search queries optimized for finding specific product images
   * Strategy: Use ONLY the most targeted query - Brand + Specific Product
   */
  buildImageSearchQueries(item) {
    const queries = []
    const productName = item.productName
    const brand = this.extractBrand(productName)
    
    // Clean product name by removing packaging/case details
    const cleanedName = this.cleanProductName(productName)
    
    console.log(`   🎯 Building search queries for: ${productName}`)
    console.log(`      Cleaned name: ${cleanedName}`)
    console.log(`      Brand: ${brand || 'None detected'}`)
    
    // Remove brand from cleaned name to get the specific product
    let specificProduct = cleanedName
    if (brand) {
      specificProduct = cleanedName.replace(new RegExp(`^${brand}\\s+`, 'i'), '').trim()
    }
    
    console.log(`      Specific product: ${specificProduct}`)
    
    // SINGLE QUERY: Brand + Specific Product (most targeted)
    // This ensures we search for the EXACT product, not generic brand results
    if (brand && specificProduct) {
      queries.push(`${brand} ${specificProduct}`)
    } else if (cleanedName) {
      // Fallback if brand detection failed - use full cleaned name
      queries.push(cleanedName)
    }
    
    console.log(`      Generated ${queries.length} search query:`)
    queries.forEach((query, index) => {
      console.log(`         ${index + 1}. "${query}"`)
    })
    
    return queries
  }

  /**
   * Clean product name by removing packaging details
   * Removes: case counts, pack sizes, weights (unless part of core name), UPC/SKU patterns
   */
  cleanProductName(productName) {
    let cleaned = productName
    
    // Remove common packaging patterns (case-insensitive)
    const packagingPatterns = [
      /\s*-?\s*case\s+of\s+\d+/gi,           // "- Case of 12", "Case of 24"
      /\s*-?\s*\d+\s*ct/gi,                   // "12ct", "- 24ct"
      /\s*-?\s*\d+\s*pack/gi,                 // "12 pack", "- 6 pack"
      /\s*-?\s*\d+\s*count/gi,                // "12 count"
      /\s*-?\s*\d+x\d+/gi,                    // "12x24"
      /\s*\(\s*case\s+of\s+\d+\s*\)/gi,      // "(Case of 12)"
      /\s*-?\s*peg\s+bag/gi,                  // "Peg Bag"
      /\s*-?\s*theater\s+box/gi,              // "Theater Box"
      /\s*-?\s*\d+\s*lb/gi,                   // "1lb", "5 lb"
      /\s*-?\s*\d+\s*lbs/gi,                  // "5lbs"
      /\s*\([^)]*USA[^)]*\)/gi,              // "(USA)"
      /\s*\([^)]*UK[^)]*\)/gi,               // "(UK)"
      /\s*\([^)]*EU[^)]*\)/gi,               // "(EU)"
    ]
    
    packagingPatterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '')
    })
    
    // Remove standalone weight/size measurements (but keep if part of product name)
    // Only remove if preceded by space and hyphen/comma
    cleaned = cleaned.replace(/\s*[-,]\s*\d+(\.\d+)?\s*(g|ml|oz|kg|mg|l)\b/gi, '')
    
    // Clean up multiple spaces, leading/trailing spaces and hyphens
    cleaned = cleaned
      .replace(/\s+/g, ' ')           // Multiple spaces to single
      .replace(/\s*-\s*$/, '')        // Trailing hyphen
      .replace(/^\s*-\s*/, '')        // Leading hyphen
      .trim()
    
    return cleaned
  }

  /**
   * Detect product type for better search context
   */
  detectProductType(productName) {
    const nameLower = productName.toLowerCase()
    
    // Food/Candy products
    if (nameLower.match(/candy|gum|chocolate|sweet|sour|taffy|lollipop|gummie|chew/)) {
      return 'candy'
    }
    
    // Beverages
    if (nameLower.match(/soda|drink|juice|water|cola|lemonade/)) {
      return 'beverage'
    }
    
    // Electronics
    if (nameLower.match(/iphone|ipad|laptop|computer|phone|tablet|headphone|airpod/)) {
      return 'electronics'
    }
    
    // Default
    return 'product'
  }

  /**
   * Extract brand name from product name using intelligent pattern detection
   * Works for any type of product: candy, electronics, beverages, etc.
   */
  extractBrand(productName) {
    // Well-known multi-word brands (check these first)
    const knownBrands = [
      /\b(Toxic\s+Waste)\b/i,
      /\b(Dr\.?\s*Pepper)\b/i,
      /\b(Mountain\s+Dew)\b/i,
      /\b(Coca[- ]Cola)\b/i,
      /\b(Kit\s*Kat)\b/i,
      /\b(Mike\s+and\s+Ike|Mike\s*&\s*Ike)\b/i,
      /\b(Sour\s+Punch)\b/i,
      /\b(Pop\s+Rocks)\b/i,
      /\b(Hot\s+Tamales)\b/i,
      /\b(Laffy\s+Taffy)\b/i,
      /\b(Kool\s+Aid)\b/i,
      /\b(Big\s+League)\b/i,
      /\b(Brain\s+Blasterz)\b/i,
      /\b(Gummy\s+Rush)\b/i,
      /\b(Cow\s+Tales)\b/i,
      /\b(Swedish\s+Fish)\b/i,
    ]
    
    // Check for known multi-word brands first
    for (const pattern of knownBrands) {
      const match = productName.match(pattern)
      if (match) {
        return match[1].trim()
      }
    }
    
    // Well-known single-word brands
    const singleWordBrands = [
      /\b(Warheads?|Airheads?|Nerds|Skittles|M&M'?s?|Snickers|Twix|Reeses?|Haribo|Sprite|Pepsi|Fanta)\b/i,
      /\b(Apple|Samsung|Sony|LG|Microsoft|Google|Amazon|Dell|HP|Lenovo|iPhone)\b/i,
      /\b(Nike|Adidas|Puma)\b/i,
      /\b(Smarties|Bugles|Charms|Jell-O|Huer|Elvan|Toffix|Swizzels|Alberts)\b/i,
    ]
    
    for (const pattern of singleWordBrands) {
      const match = productName.match(pattern)
      if (match) {
        return match[1].trim()
      }
    }
    
    // Extract first capitalized word as brand (fallback)
    const words = productName.split(/\s+/)
    
    for (let i = 0; i < Math.min(words.length, 2); i++) {
      const word = words[i]
      
      // Stop at common non-brand indicators
      if (/^(Pack|Case|Box|Bag|Theater|Peg|USA|UK|EU|\d+ct|\d+g|\d+oz|\d+ml)$/i.test(word)) {
        break
      }
      
      // Stop at measurements
      if (/^\d+/.test(word) && /\d+(g|oz|ml|kg|lb|ct|pack)/i.test(word)) {
        break
      }
      
      // Filter out common non-brand words
      const nonBrands = ['The', 'A', 'An', 'And', 'Or', 'Of', 'With', 'Pack', 'Case', 'Fresh', 'New', 'Best', 'Original', 'Classic', 'Premium', 'Organic']
      
      // Return first valid capitalized word
      if (/^[A-Z]/.test(word) && word.length > 2 && !nonBrands.includes(word)) {
        return word
      }
    }
    
    return null
  }

  /**
   * Extract model from product name
   */
  extractModel(productName) {
    // Look for model patterns like numbers, series, etc.
    const modelPatterns = [
      /\b\d+\w*\b/, // Numbers like "15", "Pro", "128GB"
      /\b[A-Z]\d+\w*\b/, // Patterns like "M1", "H7"
      /\bPro\b/i,
      /\bMax\b/i,
      /\bMini\b/i,
      /\bPlus\b/i
    ]
    
    for (const pattern of modelPatterns) {
      const match = productName.match(pattern)
      if (match) {
        return match[0]
      }
    }
    
    return null
  }

  /**
   * Determine if an image result is likely a product image
   */
  isProductImage(imageItem, item) {
    const title = (imageItem.title || '').toLowerCase()
    const snippet = (imageItem.snippet || '').toLowerCase()
    const contextUrl = (imageItem.image?.contextLink || '').toLowerCase()
    
    const productWords = item.productName.toLowerCase().split(' ').filter(word => word.length > 1)
    const searchText = `${title} ${snippet} ${contextUrl}`
    
    console.log(`      🔍 Evaluating: "${imageItem.title}"`)
    console.log(`         Context: ${contextUrl}`)
    
    // Check if product words appear in the image metadata
    const matchedWords = productWords.filter(word => 
      word.length > 2 && searchText.includes(word)
    )
    
    console.log(`         Product words: [${productWords.join(', ')}]`)
    console.log(`         Matched words: [${matchedWords.join(', ')}]`)
    
    // More flexible matching - at least 1 significant word OR brand match
    const hasMinimumMatch = matchedWords.length >= 1
    
    // Check for brand match (more important than word count)
    const brand = this.extractBrand(item.productName)
    const hasBrandMatch = brand && searchText.includes(brand.toLowerCase())
    
    console.log(`         Brand: ${brand}, Brand match: ${hasBrandMatch}`)
    
    if (!hasMinimumMatch && !hasBrandMatch) {
      console.log(`         ❌ Rejected: No sufficient word matches`)
      return false
    }
    
    // Exclude non-product images
    const excludePatterns = [
      'review', 'unbox', 'teardown', 'repair', 'comparison',
      'youtube', 'video', 'blog', 'article', 'news', 'forum',
      'used', 'broken', 'damaged', 'refurbished', 'parts'
    ]
    
    const hasExcluded = excludePatterns.some(pattern => 
      searchText.includes(pattern)
    )
    
    if (hasExcluded) {
      const excludedPattern = excludePatterns.find(pattern => searchText.includes(pattern))
      console.log(`         ❌ Rejected: Contains excluded pattern '${excludedPattern}'`)
      return false
    }
    
    // Prefer certain domains and image types
    const preferredDomains = [
      'amazon.com', 'bestbuy.com', 'target.com', 'walmart.com',
      'apple.com', 'samsung.com', 'sony.com', 'lg.com',
      'newegg.com', 'adorama.com', 'bhphotovideo.com',
      'officialstore', 'official', 'store'
    ]
    
    const isFromPreferredDomain = preferredDomains.some(domain => 
      contextUrl.includes(domain)
    )
    
    console.log(`         Preferred domain: ${isFromPreferredDomain}`)
    
    // Accept if it has good word matches OR is from a trusted domain
    const isAccepted = (hasMinimumMatch || hasBrandMatch) && !hasExcluded
    
    console.log(`         📊 Decision: ${isAccepted ? '✅ ACCEPTED' : '❌ REJECTED'}`)
    
    return isAccepted
  }

  /**
   * Extract image data from Google Images HTML response
   * Google Images embeds image URLs directly in the HTML
   */
  extractGoogleImageData(html, item) {
    const images = []
    
    try {
      // Extract all image URLs with common extensions
      // Google Images HTML contains direct image URLs from source websites
      const imageUrls = html.match(/https?:\/\/[^"'\s<>]+\.(?:jpg|jpeg|png|webp|gif)/gi) || []
      
      const seenUrls = new Set()
      
      for (const url of imageUrls) {
        // Skip Google's own static assets
        if (url.includes('gstatic.com') || url.includes('google.com/images')) {
          continue
        }
        
        // Skip tiny thumbnails (usually have size parameters)
        if (url.includes('s=48') || url.includes('s=120') || url.includes('w=100')) {
          continue
        }
        
        // Skip duplicates
        if (seenUrls.has(url)) {
          continue
        }
        
        seenUrls.add(url)
        
        images.push({
          url: url,
          title: item.productName,
          snippet: '',
          source: this.extractDomainFromUrl(url),
          thumbnail: url,
          width: 800,
          height: 600
        })
        
        // Limit to first 10 quality images
        if (images.length >= 10) break
      }
      
      console.log(`      🔍 Extracted ${images.length} unique image URLs from HTML`)
      
    } catch (error) {
      console.log(`      ⚠️ Error parsing HTML: ${error.message}`)
    }
    
    return images
  }

  /**
   * Extract domain name from URL
   */
  extractDomainFromUrl(url) {
    try {
      const urlObj = new URL(url)
      return urlObj.hostname
    } catch (e) {
      return ''
    }
  }

  /**
   * Calculate confidence score from URL pattern matching (web scraping version)
   * Similar to API version but works with direct URLs
   */
  calculateImageConfidenceFromUrl(url, item) {
    let confidence = 0.3 // Base confidence
    
    const urlLower = url.toLowerCase()
    const productName = item.productName.toLowerCase()
    const productWords = productName.split(' ').filter(word => word.length > 2)
    
    // Brand matching (high value)
    const brand = this.extractBrand(item.productName)
    if (brand && urlLower.includes(brand.toLowerCase())) {
      confidence += 0.25
    }
    
    // Word matching in URL
    const matchedWords = productWords.filter(word => urlLower.includes(word))
    const wordMatchRatio = matchedWords.length / Math.max(productWords.length, 1)
    confidence += wordMatchRatio * 0.25
    
    // SKU matching bonus
    if (item.sku && urlLower.includes(item.sku.toLowerCase())) {
      confidence += 0.2
    }
    
    // Domain reputation bonus
    const trustedDomains = [
      'amazon.com', 'bestbuy.com', 'target.com', 'walmart.com',
      'apple.com', 'samsung.com', 'sony.com', 'lg.com',
      'newegg.com', 'adorama.com', 'bhphotovideo.com'
    ]
    
    if (trustedDomains.some(domain => urlLower.includes(domain))) {
      confidence += 0.15
    }
    
    // Ecommerce domain bonus
    const ecommerceDomains = [
      'ebay.com', 'etsy.com', 'alibaba.com', 'aliexpress.com',
      'costco.com', 'homedepot.com', 'lowes.com'
    ]
    
    if (ecommerceDomains.some(domain => urlLower.includes(domain))) {
      confidence += 0.1
    }
    
    // Cap at reasonable maximum
    return Math.min(confidence, 0.9)
  }

  /**
   * Calculate confidence score for image relevance
   */
  calculateImageConfidence(imageItem, item) {
    let confidence = 0.3 // Lower base confidence to be more realistic
    
    const title = (imageItem.title || '').toLowerCase()
    const snippet = (imageItem.snippet || '').toLowerCase()
    const contextUrl = (imageItem.image?.contextLink || '').toLowerCase()
    const searchText = `${title} ${snippet}`
    
    const productWords = item.productName.toLowerCase().split(' ').filter(word => word.length > 1)
    
    // Word matching score (more generous)
    const matchedWords = productWords.filter(word => 
      word.length > 2 && searchText.includes(word)
    )
    
    const wordMatchRatio = matchedWords.length / Math.max(productWords.length, 1)
    confidence += wordMatchRatio * 0.25
    
    // Brand matching (high value)
    const brand = this.extractBrand(item.productName)
    if (brand && searchText.includes(brand.toLowerCase())) {
      confidence += 0.25
    }
    
    // SKU matching bonus (if available)
    if (item.sku && searchText.includes(item.sku.toLowerCase())) {
      confidence += 0.2
    }
    
    // Domain reputation bonus
    const trustedDomains = [
      'amazon.com', 'bestbuy.com', 'target.com', 'walmart.com',
      'apple.com', 'samsung.com', 'sony.com', 'lg.com',
      'newegg.com', 'adorama.com', 'bhphotovideo.com'
    ]
    
    const ecommerceDomains = [
      'ebay.com', 'etsy.com', 'alibaba.com', 'aliexpress.com',
      'costco.com', 'homedepot.com', 'lowes.com'
    ]
    
    if (trustedDomains.some(domain => contextUrl.includes(domain))) {
      confidence += 0.15
    } else if (ecommerceDomains.some(domain => contextUrl.includes(domain))) {
      confidence += 0.1
    }
    
    // Image size bonus (prefer larger, clearer images)
    const width = imageItem.image?.width || 0
    const height = imageItem.image?.height || 0
    
    if (width >= 400 && height >= 400) {
      confidence += 0.1
    } else if (width >= 250 && height >= 250) {
      confidence += 0.05
    }
    
    // Title quality indicators
    const qualityIndicators = ['product', 'official', 'new', 'genuine', 'original']
    const hasQualityIndicator = qualityIndicators.some(indicator => 
      title.includes(indicator)
    )
    
    if (hasQualityIndicator) {
      confidence += 0.05
    }
    
    // Penalty for potentially problematic indicators
    const negativeIndicators = ['case', 'cover', 'screen protector', 'accessory']
    const hasNegativeIndicator = negativeIndicators.some(indicator => 
      title.includes(indicator) && !item.productName.toLowerCase().includes(indicator)
    )
    
    if (hasNegativeIndicator) {
      confidence -= 0.1
    }
    
    // Ensure confidence is within reasonable bounds
    return Math.max(0.1, Math.min(confidence, 1.0))
  }

  // ==========================================
  // STEP 2: ENHANCED IMAGE SOURCE HIERARCHY
  // ==========================================

  /**
   * Implement enhanced fallback hierarchy for image sourcing
   */
  async sourceImagesWithHierarchy(lineItems, vendorImages, supplierInfo = null) {
    console.log('📋 Step 2: Implementing enhanced image source hierarchy...')
    console.log('   Priority: Vendor → Intelligent Supplier Search → Google Images → Placeholder')
    
    const imageResults = []
    
    for (const item of lineItems) {
      console.log(`\n🔍 Sourcing images for: ${item.productName} (SKU: ${item.sku || 'N/A'})`)
      
      const itemImages = {
        lineItemId: item.id,
        productName: item.productName,
        sku: item.sku,
        vendorImages: [],
        googleImages: [],
        webScraped: [],  // Initialize to empty array (for backward compatibility)
        aiGenerated: null,
        recommended: null,
        allOptions: []
      }

      try {
        // 1. HIGHEST PRIORITY: Vendor-provided images
        itemImages.vendorImages = await this.findVendorImagesForItem(item, vendorImages)
        
        if (itemImages.vendorImages.length > 0) {
          console.log(`   ✅ Found ${itemImages.vendorImages.length} vendor images`)
          itemImages.recommended = {
            source: 'vendor',
            image: itemImages.vendorImages[0],
            confidence: 'high',
            reason: 'vendor_provided'
          }
          itemImages.allOptions.push(...itemImages.vendorImages.map(img => ({ 
            ...img, 
            source: 'vendor', 
            priority: 1 
          })))
          
          // Skip intelligent search and Google if we have vendor images
          console.log(`   🎯 Using vendor images, skipping supplier & Google search`)
        } else {
          console.log(`   ⚠️ No embedded vendor images found`)
        }

        // 2. INTELLIGENT SUPPLIER SEARCH: Search supplier websites for product-specific images
        if (itemImages.vendorImages.length === 0 && supplierInfo) {
          console.log(`   🧠 Attempting intelligent supplier search...`)
          const supplierImages = await this.intelligentSupplierSearch(item, supplierInfo)
          
          if (supplierImages && supplierImages.length > 0) {
            console.log(`   ✅ Found ${supplierImages.length} images via supplier search`)
            
            // Add to vendor images pool (they're high quality)
            itemImages.vendorImages = supplierImages
            
            const bestSupplierImage = supplierImages[0]
            itemImages.recommended = {
              source: 'supplier_website',
              image: bestSupplierImage,
              confidence: bestSupplierImage.confidence >= 0.7 ? 'high' : 
                        bestSupplierImage.confidence >= 0.5 ? 'medium' : 'low',
              reason: 'intelligent_supplier_search'
            }
            
            itemImages.allOptions.push(...supplierImages.map(img => ({ 
              ...img, 
              source: 'supplier_website', 
              priority: 1.5 
            })))
            
            console.log(`   🎯 Using supplier website images (confidence: ${(bestSupplierImage.confidence * 100).toFixed(1)}%)`)
          } else {
            console.log(`   ⚠️ No supplier images found via intelligent search`)
          }
        } else if (itemImages.vendorImages.length === 0 && !supplierInfo) {
          console.log(`   ⚠️ Supplier info not available for intelligent search`)
        }

        // 3. GOOGLE IMAGES FALLBACK: Comprehensive Google Images search for real product photos
        if (itemImages.vendorImages.length === 0) {
          console.log(`   🔍 Searching Google Images with comprehensive strategy...`)
          itemImages.googleImages = await this.searchGoogleProductImages(item)
          
          if (itemImages.googleImages.length > 0) {
            console.log(`   ✅ Found ${itemImages.googleImages.length} Google product images`)
            
            // Use the highest confidence Google image
            const bestGoogleImage = itemImages.googleImages[0]
            
            if (!itemImages.recommended) {
              itemImages.recommended = {
                source: 'google_images',
                image: bestGoogleImage,
                confidence: bestGoogleImage.confidence >= 0.7 ? 'high' : 
                          bestGoogleImage.confidence >= 0.5 ? 'medium' : 'low',
                reason: `real_product_photo_from_google`
              }
            }
            
            itemImages.allOptions.push(...itemImages.googleImages.map(img => ({ 
              ...img, 
              source: 'google_images', 
              priority: 2 
            })))
            
            console.log(`   🎯 Using Google product images as fallback`)
          } else {
            console.log(`   ⚠️ No relevant Google images found with any search strategy`)
          }
        } else {
          console.log(`   ⏭️ Skipping Google image search (supplier images available)`)
        }

        // 4. LAST RESORT: Placeholder if absolutely no images found
        if (!itemImages.recommended) {
          console.log(`   📦 No images found - using generic placeholder`)
          itemImages.placeholder = {
            type: 'placeholder',
            url: `https://via.placeholder.com/400x400/f0f0f0/999999?text=${encodeURIComponent(item.productName || 'Product Image')}`,
            source: 'placeholder',
            warning: 'No product images available - manual upload recommended'
          }
          itemImages.recommended = {
            source: 'placeholder',
            image: itemImages.placeholder,
            confidence: 'none',
            reason: 'no_images_available'
          }
          
          itemImages.allOptions.push({ 
            ...itemImages.placeholder, 
            source: 'placeholder', 
            priority: 4 
          })
        }

        // Log recommendation
        if (itemImages.recommended) {
          console.log(`   🎯 Recommended: ${itemImages.recommended.source} (${itemImages.recommended.confidence} confidence)`)
          console.log(`   📊 Total options available: ${itemImages.allOptions.length}`)
          const extendedCount = itemImages.googleImagesExtended?.length || 0
          console.log(`   🏪 Vendor: ${itemImages.vendorImages.length} | 🔍 Google: ${itemImages.googleImages.length} | �+ Extended: ${extendedCount}`)
        } else {
          console.log(`   ❌ No images found for this product`)
        }

        imageResults.push(itemImages)
        
      } catch (error) {
        console.error(`❌ Failed to source images for ${item.productName}:`, error)
        imageResults.push(itemImages)
      }
    }

    console.log(`✅ Sourced images for ${imageResults.length} line items`)
    return imageResults
  }

  /**
   * Find vendor images that match specific line item
   */
  async findVendorImagesForItem(item, vendorImages) {
    const matchingImages = []
    
    if (vendorImages.length === 0) {
      return matchingImages
    }

    console.log(`   🔍 Checking ${vendorImages.length} vendor images for: ${item.productName}`)
    
    // Strategy 1: Exact matching by keywords in image URL or metadata
    const searchTerms = [
      item.sku?.toLowerCase(),
      item.productCode?.toLowerCase(),
      item.vendorSku?.toLowerCase(),
      ...item.productName.toLowerCase().split(' ').filter(term => term.length > 2)
    ].filter(Boolean)

    // First, try to find exact matches
    for (const vendorImage of vendorImages) {
      const imageUrl = vendorImage.url?.toLowerCase() || ''
      const imageTitle = vendorImage.title?.toLowerCase() || ''
      const searchText = `${imageUrl} ${imageTitle}`
      
      // Check if any search terms appear in the image URL or title
      const matchedTerms = searchTerms.filter(term => searchText.includes(term))
      
      if (matchedTerms.length > 0) {
        matchingImages.push({
          ...vendorImage,
          matchedTerms,
          matchType: 'exact',
          confidence: 'high'
        })
        console.log(`     ✅ Exact match: ${vendorImage.url} (matched: ${matchedTerms.join(', ')})`)
      }
    }

    // Strategy 2: If no exact matches and we have a small number of vendor images,
    // assume they're all relevant (common case for POs with product photos)
    if (matchingImages.length === 0 && vendorImages.length <= 10) {
      console.log(`     🎯 No exact matches found, but PO has ${vendorImages.length} vendor images`)
      console.log(`     📋 Assuming all vendor images are relevant for product: ${item.productName}`)
      
      // Add all vendor images as potential matches
      for (const vendorImage of vendorImages) {
        matchingImages.push({
          ...vendorImage,
          matchedTerms: [],
          matchType: 'assumed_relevant',
          confidence: 'medium'
        })
      }
      
      console.log(`     ✅ Added ${matchingImages.length} vendor images as assumed relevant`)
    }

    // Strategy 3: If we have many vendor images, only use the first few
    if (matchingImages.length > 5) {
      const topImages = matchingImages.slice(0, 5)
      console.log(`     ⚠️ Too many vendor images (${matchingImages.length}), using top 5`)
      return topImages
    }

    return matchingImages
  }

  // ==========================================
  // STEP 3: QUALITY ENHANCEMENT
  // ==========================================

  /**
   * Process and enhance images for Shopify
   */
  async enhanceImages(imageResults) {
    console.log('✨ Step 3: Enhancing image quality...')
    
    const enhancedResults = []
    
    for (const itemImages of imageResults) {
      console.log(`🔧 Processing images for: ${itemImages.productName}`)
      
      const enhancedItem = { ...itemImages, processed: [] }
      
      // Process all available images
      const allImages = [
        ...itemImages.vendorImages,
        ...itemImages.webScraped,
        ...(itemImages.aiGenerated ? [itemImages.aiGenerated] : [])
      ]
      
      for (const image of allImages) {
        try {
          const processedImage = await this.processImageForShopify(image, itemImages.lineItemId)
          if (processedImage) {
            enhancedItem.processed.push(processedImage)
          }
        } catch (error) {
          console.error(`❌ Failed to process image:`, error)
        }
      }
      
      enhancedResults.push(enhancedItem)
    }

    console.log(`✅ Enhanced images for ${enhancedResults.length} items`)
    return enhancedResults
  }

  /**
   * Process individual image for Shopify optimization
   */
  async processImageForShopify(image, lineItemId) {
    try {
      // Download image
      const imageBuffer = await this.downloadImage(image.url)
      if (!imageBuffer) return null

      // Generate hash for deduplication
      const imageHash = this.generateImageHash(imageBuffer)
      
      // Check if we've already processed this image
      const existingImage = await this.findExistingImage(imageHash)
      if (existingImage) {
        console.log(`🔄 Using existing processed image: ${imageHash}`)
        return existingImage
      }

      // Resize and optimize using Sharp
      const processedBuffer = await sharp(imageBuffer)
        .resize(this.maxImageSize, this.maxImageSize, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 90 })
        .toBuffer()

      // Upload to Supabase staging
      const fileName = `${lineItemId}_${imageHash}.jpg`
      const uploadResult = await this.uploadToStaging(fileName, processedBuffer)
      
      if (uploadResult.success) {
        const processedImage = {
          ...image,
          processed: true,
          hash: imageHash,
          fileName,
          stagingUrl: uploadResult.url,
          size: processedBuffer.length,
          dimensions: { width: this.maxImageSize, height: this.maxImageSize }
        }

        // Store in database for deduplication
        await this.storeProcessedImage(processedImage)
        
        return processedImage
      }

      return null
    } catch (error) {
      console.error('❌ Image processing failed:', error)
      return null
    }
  }

  /**
   * Download image from URL
   */
  async downloadImage(url) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status}`)
      }
      
      return await response.buffer()
    } catch (error) {
      console.error(`❌ Failed to download image ${url}:`, error)
      return null
    }
  }

  /**
   * Generate hash for image deduplication
   */
  generateImageHash(buffer) {
    return crypto.createHash('md5').update(buffer).digest('hex')
  }

  /**
   * Upload processed image to Supabase staging
   */
  async uploadToStaging(fileName, buffer) {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.imagesBucket)
        .upload(fileName, buffer, {
          contentType: 'image/jpeg',
          upsert: true
        })

      if (error) throw error

      // Get public URL
      const { data: urlData } = this.supabase.storage
        .from(this.imagesBucket)
        .getPublicUrl(fileName)

      return {
        success: true,
        url: urlData.publicUrl,
        path: data.path
      }
    } catch (error) {
      console.error('❌ Failed to upload to staging:', error)
      return { success: false }
    }
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  /**
   * Resolve relative URL to absolute
   */
  resolveUrl(url, baseUrl) {
    try {
      return new URL(url, baseUrl).href
    } catch {
      return url
    }
  }

  /**
   * Check if URL points to a valid image
   */
  isValidImageUrl(url) {
    try {
      const urlObj = new URL(url)
      const pathname = urlObj.pathname.toLowerCase()
      return this.supportedFormats.some(format => 
        pathname.endsWith(`.${format}`)
      )
    } catch {
      return false
    }
  }

  /**
   * Find existing processed image by hash
   */
  async findExistingImage(hash) {
    // TODO: Implement database lookup
    return null
  }

  /**
   * Store processed image metadata
   */
  async storeProcessedImage(imageData) {
    // TODO: Implement database storage
    console.log(`💾 Storing processed image: ${imageData.fileName}`)
  }
}

export const imageProcessingService = new ImageProcessingService()