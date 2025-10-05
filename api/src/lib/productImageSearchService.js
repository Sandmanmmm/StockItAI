/**
 * Enhanced Product Image Reference Service
 * 
 * Implements accurate product photo generation using:
 * 1. Google Custom Search API to find exact product references
 * 2. Image analysis to extract accurate product details
 * 3. Enhanced AI prompts based on reference analysis
 * 4. Generate copyright-free accurate product photos
 */

import fetch from 'node-fetch'
import crypto from 'crypto'

export class ProductImageReferenceService {
  constructor() {
    // Hardcode the API credentials for now to ensure they work
    this.googleApiKey = process.env.GOOGLE_SEARCH_API_KEY || 'AIzaSyC5KEWxOahxQPHm6JOWplLyfFRJ50YsoLU'
    this.searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID || 'a6dea7adaa5774926'
    this.baseSearchUrl = 'https://www.googleapis.com/customsearch/v1'
    
    // Rate limiting
    this.requestDelay = 100 // ms between requests
    this.maxRetries = 3
    
    // Reference analysis settings
    this.maxReferences = 5
    this.analysisConfidenceThreshold = 0.7
    
    // Image validation settings
    this.minImageWidth = 200
    this.minImageHeight = 200
    this.preferredFormats = ['jpg', 'jpeg', 'png', 'webp']
  }

  /**
   * Find reference images and generate accurate AI product photos
   */
  async generateAccurateProductPhoto(productData, options = {}) {
    console.log(`🎯 Generating accurate product photo for: ${productData.productName}`)
    
    try {
      // Step 1: Find reference images
      const references = await this.findProductReferences(productData)
      
      if (references.length === 0) {
        console.log(`⚠️ No references found, using basic AI generation`)
        return await this.generateBasicAIPhoto(productData)
      }
      
      // Step 2: Analyze references to extract product details
      const analysisResult = await this.analyzeProductReferences(references, productData)
      
      // Step 3: Generate enhanced AI photo based on analysis
      const aiPhoto = await this.generateEnhancedAIPhoto(productData, analysisResult)
      
      return {
        url: aiPhoto.url,
        source: 'ai_generated_from_references',
        confidence: analysisResult.confidence,
        referencesUsed: references.length,
        analysisDetails: analysisResult.details,
        prompt: analysisResult.enhancedPrompt
      }
      
    } catch (error) {
      console.error(`❌ Reference-based generation failed:`, error)
      return await this.generateBasicAIPhoto(productData)
    }
  }

  /**
   * Find product reference images (not for direct use)
   */
  async findProductReferences(productData) {
    console.log(`🔍 Finding reference images for: ${productData.productName}`)
    
    const searchStrategies = [
      // Strategy 1: Exact SKU + Brand search
      this.buildSkuBasedSearch(productData),
      
      // Strategy 2: Product name + model number search
      this.buildModelBasedSearch(productData),
      
      // Strategy 3: Brand + product type search
      this.buildBrandBasedSearch(productData)
    ]

    const allReferences = []
    
    for (const strategy of searchStrategies) {
      if (!strategy.query) continue
      
      try {
        console.log(`🎯 Reference search strategy: ${strategy.name}`)
        console.log(`   Query: "${strategy.query}"`)
        
        const results = await this.executeReferenceSearch(strategy.query)
        
        // Score and validate references
        const scoredResults = await this.scoreReferenceRelevance(results, productData)
        
        allReferences.push(...scoredResults.map(result => ({
          ...result,
          searchStrategy: strategy.name,
          searchQuery: strategy.query
        })))
        
        // If we found high-confidence references, prioritize them
        const highConfidenceRefs = scoredResults.filter(r => r.confidence > 0.8)
        if (highConfidenceRefs.length > 0) {
          console.log(`✅ Found ${highConfidenceRefs.length} high-confidence references`)
          break
        }
        
        await this.delay(this.requestDelay)
        
      } catch (error) {
        console.warn(`⚠️ Reference search ${strategy.name} failed:`, error.message)
        continue
      }
    }

    // Sort by confidence and return top references
    const sortedReferences = allReferences
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.maxReferences)

    console.log(`📊 Found ${sortedReferences.length} reference images`)
    console.log(`   High confidence (>0.8): ${sortedReferences.filter(r => r.confidence > 0.8).length}`)
    console.log(`   Medium confidence (>0.6): ${sortedReferences.filter(r => r.confidence > 0.6).length}`)

    return sortedReferences
  }

  /**
   * Analyze reference images to extract accurate product details
   */
  async analyzeProductReferences(references, productData) {
    console.log(`🔬 Analyzing ${references.length} reference images for product details`)
    
    const analysis = {
      confidence: 0,
      details: {
        colors: [],
        materials: [],
        shape: '',
        size: '',
        features: [],
        style: '',
        category: ''
      },
      enhancedPrompt: '',
      sources: []
    }

    // Analyze each reference
    for (const ref of references) {
      try {
        const refAnalysis = await this.analyzeIndividualReference(ref, productData)
        this.mergeAnalysisResults(analysis, refAnalysis)
        analysis.sources.push({
          url: ref.thumbnailUrl || 'reference',
          confidence: ref.confidence,
          title: ref.title
        })
      } catch (error) {
        console.warn(`⚠️ Failed to analyze reference:`, error.message)
      }
    }

    // Build enhanced prompt from analysis
    analysis.enhancedPrompt = this.buildEnhancedPrompt(productData, analysis.details)
    analysis.confidence = this.calculateOverallConfidence(references, analysis.details)

    console.log(`✅ Reference analysis complete:`)
    console.log(`   Overall confidence: ${(analysis.confidence * 100).toFixed(1)}%`)
    console.log(`   Enhanced prompt: ${analysis.enhancedPrompt.substring(0, 100)}...`)

    return analysis
  }

  /**
   * Analyze individual reference image
   */
  async analyzeIndividualReference(reference, productData) {
    // Extract details from reference metadata
    const analysis = {
      colors: this.extractColorsFromText(reference.title + ' ' + reference.snippet),
      materials: this.extractMaterialsFromText(reference.title + ' ' + reference.snippet),
      features: this.extractFeaturesFromText(reference.title + ' ' + reference.snippet),
      style: this.extractStyleFromText(reference.title + ' ' + reference.snippet),
      category: this.extractCategoryFromText(reference.title + ' ' + reference.snippet)
    }

    return analysis
  }

  /**
   * @deprecated AI image generation has been removed to reduce costs
   * Use Google Images search instead
   */
  async generateEnhancedAIPhoto(productData, analysisResult) {
    console.warn('⚠️ AI image generation is deprecated - relying on Google Images search')
    return null
  }

  /**
   * @deprecated AI image generation has been removed to reduce costs
   */
  async generateBasicAIPhoto(productData) {
    console.warn('⚠️ AI image generation is deprecated - relying on Google Images search')
    return null
  }

  /**
   * Build enhanced prompt from reference analysis
   */
  buildEnhancedPrompt(productData, details) {
    const components = [
      'Professional product photograph of',
      productData.productName
    ]

    // Add analyzed details
    if (details.colors.length > 0) {
      components.push(`in ${details.colors.slice(0, 2).join(' and ')} color`)
    }
    
    if (details.materials.length > 0) {
      components.push(`made of ${details.materials[0]}`)
    }
    
    if (details.style) {
      components.push(`with ${details.style} design`)
    }
    
    if (details.features.length > 0) {
      components.push(`featuring ${details.features.slice(0, 2).join(' and ')}`)
    }

    // Standard photo requirements
    components.push(
      'white background',
      'professional lighting',
      'high resolution',
      'commercial photography style',
      'clean product shot',
      'no shadows',
      'centered composition'
    )

    return components.join(', ')
  }

  /**
   * Extract colors from text
   */
  extractColorsFromText(text) {
    const colors = ['black', 'white', 'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown', 'gray', 'silver', 'gold']
    const foundColors = []
    
    const textLower = text.toLowerCase()
    for (const color of colors) {
      if (textLower.includes(color)) {
        foundColors.push(color)
      }
    }
    
    return foundColors
  }

  /**
   * Extract materials from text
   */
  extractMaterialsFromText(text) {
    const materials = ['metal', 'plastic', 'wood', 'glass', 'leather', 'fabric', 'rubber', 'ceramic', 'steel', 'aluminum', 'carbon']
    const foundMaterials = []
    
    const textLower = text.toLowerCase()
    for (const material of materials) {
      if (textLower.includes(material)) {
        foundMaterials.push(material)
      }
    }
    
    return foundMaterials
  }

  /**
   * Extract features from text
   */
  extractFeaturesFromText(text) {
    const features = ['wireless', 'bluetooth', 'usb', 'rechargeable', 'waterproof', 'portable', 'adjustable', 'foldable', 'touch', 'led']
    const foundFeatures = []
    
    const textLower = text.toLowerCase()
    for (const feature of features) {
      if (textLower.includes(feature)) {
        foundFeatures.push(feature)
      }
    }
    
    return foundFeatures
  }

  /**
   * Extract style from text
   */
  extractStyleFromText(text) {
    const styles = ['modern', 'classic', 'vintage', 'minimalist', 'industrial', 'elegant', 'sleek', 'compact', 'professional']
    
    const textLower = text.toLowerCase()
    for (const style of styles) {
      if (textLower.includes(style)) {
        return style
      }
    }
    
    return ''
  }

  /**
   * Extract category from text
   */
  extractCategoryFromText(text) {
    const categories = ['electronics', 'computer', 'phone', 'tablet', 'accessory', 'tool', 'device', 'equipment', 'gadget']
    
    const textLower = text.toLowerCase()
    for (const category of categories) {
      if (textLower.includes(category)) {
        return category
      }
    }
    
    return ''
  }

  /**
   * Merge analysis results from multiple references
   */
  mergeAnalysisResults(mainAnalysis, newAnalysis) {
    // Merge colors
    newAnalysis.colors.forEach(color => {
      if (!mainAnalysis.details.colors.includes(color)) {
        mainAnalysis.details.colors.push(color)
      }
    })
    
    // Merge materials
    newAnalysis.materials.forEach(material => {
      if (!mainAnalysis.details.materials.includes(material)) {
        mainAnalysis.details.materials.push(material)
      }
    })
    
    // Merge features
    newAnalysis.features.forEach(feature => {
      if (!mainAnalysis.details.features.includes(feature)) {
        mainAnalysis.details.features.push(feature)
      }
    })
    
    // Take first non-empty style and category
    if (!mainAnalysis.details.style && newAnalysis.style) {
      mainAnalysis.details.style = newAnalysis.style
    }
    
    if (!mainAnalysis.details.category && newAnalysis.category) {
      mainAnalysis.details.category = newAnalysis.category
    }
  }

  /**
   * Calculate overall confidence based on references and analysis
   */
  calculateOverallConfidence(references, details) {
    let confidence = 0
    
    // Base confidence from reference quality
    const avgReferenceConfidence = references.reduce((sum, ref) => sum + ref.confidence, 0) / references.length
    confidence += avgReferenceConfidence * 0.6
    
    // Bonus for detailed analysis
    const detailScore = (
      (details.colors.length > 0 ? 0.1 : 0) +
      (details.materials.length > 0 ? 0.1 : 0) +
      (details.features.length > 0 ? 0.1 : 0) +
      (details.style ? 0.05 : 0) +
      (details.category ? 0.05 : 0)
    )
    confidence += detailScore
    
    return Math.min(confidence, 1)
  }

  /**
   * Execute reference search (similar to image search but for analysis)
   */
  async executeReferenceSearch(query) {
    return await this.executeImageSearch(query, { maxResults: 5 })
  }

  /**
   * Score reference relevance
   */
  async scoreReferenceRelevance(results, productData) {
    return await this.scoreAndValidateResults(results, productData)
  }

  /**
   * Build SKU-based search query (highest accuracy)
   */
  buildSkuBasedSearch(productData) {
    const sku = productData.sku || productData.partNumber || productData.modelNumber
    const brand = this.extractBrand(productData)
    
    if (!sku) return { name: 'sku-based', query: null }
    
    const query = [
      brand,
      sku,
      'product',
      'official',
      '-review -manual -spec'
    ].filter(Boolean).join(' ')
    
    return {
      name: 'sku-based',
      query,
      accuracy: 'highest'
    }
  }

  /**
   * Build model-based search query
   */
  buildModelBasedSearch(productData) {
    const productName = productData.productName || productData.name || ''
    const brand = this.extractBrand(productData)
    const modelNumber = this.extractModelNumber(productName)
    
    if (!modelNumber) return { name: 'model-based', query: null }
    
    const query = [
      brand,
      modelNumber,
      'product image',
      'official',
      '-review -unboxing -comparison'
    ].filter(Boolean).join(' ')
    
    return {
      name: 'model-based',
      query,
      accuracy: 'high'
    }
  }

  /**
   * Build brand-based search query
   */
  buildBrandBasedSearch(productData) {
    const productName = productData.productName || productData.name || ''
    const brand = this.extractBrand(productData)
    const productType = this.extractProductType(productName)
    
    if (!brand || !productType) return { name: 'brand-based', query: null }
    
    const query = [
      brand,
      productType,
      'product photo',
      'catalog',
      '-review -manual'
    ].filter(Boolean).join(' ')
    
    return {
      name: 'brand-based',
      query,
      accuracy: 'medium'
    }
  }

  /**
   * Build description-based search query
   */
  buildDescriptionBasedSearch(productData) {
    const description = productData.description || ''
    const productName = productData.productName || productData.name || ''
    
    if (!description && !productName) return { name: 'description-based', query: null }
    
    const keywords = this.extractKeywords(description || productName)
    const query = [
      ...keywords.slice(0, 3), // Top 3 keywords
      'product',
      'image',
      '-diy -tutorial'
    ].join(' ')
    
    return {
      name: 'description-based',
      query,
      accuracy: 'low'
    }
  }

  /**
   * Execute Google Custom Search API request
   */
  async executeImageSearch(query, options = {}) {
    if (!this.googleApiKey || !this.searchEngineId) {
      console.warn('⚠️ Google Search API not configured, using fallback')
      return this.getFallbackResults(query)
    }

    const searchParams = new URLSearchParams({
      key: this.googleApiKey,
      cx: this.searchEngineId,
      q: query,
      searchType: 'image',
      num: options.maxResults || 10,
      imgSize: 'large',
      imgType: 'photo',
      safe: 'active',
      fileType: 'jpg,png,webp',
      rights: 'cc_publicdomain,cc_attribute,cc_sharealike,cc_noncommercial'
    })

    const url = `${this.baseSearchUrl}?${searchParams}`
    
    let attempt = 0
    while (attempt < this.maxRetries) {
      try {
        const response = await fetch(url)
        
        if (!response.ok) {
          throw new Error(`Google Search API error: ${response.status} ${response.statusText}`)
        }
        
        const data = await response.json()
        
        if (!data.items) {
          console.warn(`⚠️ No image results found for: ${query}`)
          return []
        }

        return data.items.map(item => ({
          url: item.link,
          title: item.title,
          snippet: item.snippet,
          contextLink: item.image?.contextLink,
          thumbnailUrl: item.image?.thumbnailLink,
          width: item.image?.width,
          height: item.image?.height,
          size: item.image?.byteSize,
          format: this.getImageFormat(item.link),
          source: 'google_images'
        }))
        
      } catch (error) {
        attempt++
        console.warn(`⚠️ Search attempt ${attempt} failed:`, error.message)
        
        if (attempt >= this.maxRetries) {
          throw error
        }
        
        await this.delay(this.requestDelay * attempt) // Exponential backoff
      }
    }
  }

  /**
   * Score and validate search results for product relevance
   */
  async scoreAndValidateResults(results, productData) {
    const scoredResults = []
    
    for (const result of results) {
      try {
        const score = await this.calculateRelevanceScore(result, productData)
        
        if (score.confidence > 0.3) { // Filter out very low confidence results
          scoredResults.push({
            ...result,
            confidence: score.confidence,
            relevanceScore: score.relevanceScore,
            matchFactors: score.factors
          })
        }
        
      } catch (error) {
        console.warn(`⚠️ Failed to score result: ${result.url}`, error.message)
      }
    }
    
    return scoredResults
  }

  /**
   * Calculate relevance score for an image result
   */
  async calculateRelevanceScore(result, productData) {
    try {
      let confidence = 0
      let relevanceScore = 0
      const factors = []

      // Safely extract text properties with multiple fallbacks
      const titleText = String(result.title || result.name || '').toLowerCase()
      const snippetText = String(result.snippet || result.description || '').toLowerCase()
      const productName = String(productData.productName || '').toLowerCase()
      const sku = String(productData.sku || '').toLowerCase()

      // Factor 1: Title/snippet contains product identifiers
      if (sku && sku.length > 2 && (titleText.includes(sku) || snippetText.includes(sku))) {
        confidence += 0.4
        relevanceScore += 40
        factors.push('sku_match')
      }

      if (productName && productName.length > 2 && (titleText.includes(productName) || snippetText.includes(productName))) {
        confidence += 0.3
        relevanceScore += 30
        factors.push('name_match')
      }

      // Factor 2: Image dimensions (prefer larger, product-appropriate sizes)
      const width = parseInt(result.width || result.image?.width || 0) || 0
      const height = parseInt(result.height || result.image?.height || 0) || 0
      
      if (width && height) {
        if (width >= 500 && height >= 500) {
          confidence += 0.2
          relevanceScore += 20
          factors.push('good_dimensions')
        } else if (width >= this.minImageWidth && height >= this.minImageHeight) {
          confidence += 0.1
          relevanceScore += 10
          factors.push('adequate_dimensions')
        }
      }

      // Factor 3: Source URL reliability
      const imageUrl = String(result.link || result.url || '')
      const contextUrl = String(result.displayLink || result.contextLink || '')
      const sourceScore = this.scoreImageSource(imageUrl, contextUrl)
      confidence += sourceScore.confidence || 0
      relevanceScore += sourceScore.score || 0
      factors.push(...(sourceScore.factors || []))

      // Factor 4: File format preference (extract from URL)
      const urlExtension = imageUrl.toLowerCase().split('.').pop() || ''
      if (this.preferredFormats.includes(urlExtension)) {
        confidence += 0.05
        relevanceScore += 5
        factors.push('preferred_format')
      }

      return {
        confidence: Math.min(confidence, 1), // Cap at 1.0
        relevanceScore,
        factors
      }
    } catch (error) {
      console.warn(`⚠️ Error calculating relevance score:`, error.message)
      return {
        confidence: 0,
        relevanceScore: 0,
        factors: ['error']
      }
    }
  }

  /**
   * Score image source reliability
   */
  scoreImageSource(imageUrl, contextUrl) {
    const score = { confidence: 0, score: 0, factors: [] }
    
    const url = contextUrl || imageUrl || ''
    const urlLower = url.toLowerCase()

    // High-trust sources
    if (urlLower.includes('amazon.com') || 
        urlLower.includes('ebay.com') ||
        urlLower.includes('walmart.com') ||
        urlLower.includes('target.com')) {
      score.confidence += 0.2
      score.score += 20
      score.factors.push('trusted_retailer')
    }

    // Manufacturer/brand websites
    if (urlLower.includes('official') || 
        urlLower.includes('manufacturer') ||
        urlLower.match(/\b[a-z]+\.com\b/)) {
      score.confidence += 0.15
      score.score += 15
      score.factors.push('brand_site')
    }

    // Product catalog sites
    if (urlLower.includes('catalog') || 
        urlLower.includes('product') ||
        urlLower.includes('spec')) {
      score.confidence += 0.1
      score.score += 10
      score.factors.push('catalog_site')
    }

    return score
  }

  /**
   * Extract brand from product data
   */
  extractBrand(productData) {
    const text = [
      productData.productName,
      productData.description,
      productData.brand
    ].filter(Boolean).join(' ')

    // Common brand patterns
    const brandPatterns = [
      /\b(Apple|Samsung|Sony|LG|HP|Dell|Lenovo|Microsoft|Google|Amazon)\b/i,
      /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/, // Two capitalized words
      /\b([A-Z]{2,})\b/ // All caps (like IBM, AMD)
    ]

    for (const pattern of brandPatterns) {
      const match = text.match(pattern)
      if (match) {
        return match[1] || match[0]
      }
    }

    return null
  }

  /**
   * Extract model number from product name
   */
  extractModelNumber(productName) {
    if (!productName) return null

    // Common model number patterns
    const modelPatterns = [
      /\b([A-Z]{1,3}[-]?[0-9]{2,6}[A-Z]*)\b/, // Like "MX-1000A"
      /\b([0-9]{3,6}[A-Z]*)\b/, // Like "1234X"
      /\bModel:?\s*([A-Z0-9-]+)\b/i, // "Model: ABC-123"
      /\b([A-Z]+[0-9]+[A-Z]*)\b/ // Like "ABC123X"
    ]

    for (const pattern of modelPatterns) {
      const match = productName.match(pattern)
      if (match) {
        return match[1]
      }
    }

    return null
  }

  /**
   * Extract product type from name
   */
  extractProductType(productName) {
    if (!productName) return null

    const commonTypes = [
      'laptop', 'desktop', 'monitor', 'keyboard', 'mouse',
      'phone', 'tablet', 'watch', 'headphones', 'speaker',
      'camera', 'lens', 'printer', 'router', 'switch',
      'cable', 'adapter', 'charger', 'battery', 'case'
    ]

    const nameLower = productName.toLowerCase()
    for (const type of commonTypes) {
      if (nameLower.includes(type)) {
        return type
      }
    }

    return null
  }

  /**
   * Extract keywords from text
   */
  extractKeywords(text) {
    if (!text) return []

    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)

    // Remove common stop words
    const stopWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']
    const keywords = words.filter(word => !stopWords.includes(word))

    // Count frequency and return most common
    const frequency = {}
    keywords.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1
    })

    return Object.keys(frequency)
      .sort((a, b) => frequency[b] - frequency[a])
      .slice(0, 5)
  }

  /**
   * Get image format from URL
   */
  getImageFormat(url) {
    const match = url.match(/\.([a-z]{3,4})($|\?)/i)
    return match ? match[1].toLowerCase() : 'unknown'
  }

  /**
   * Fallback results when API is not available
   */
  getFallbackResults(query) {
    console.log(`📝 Using fallback search for: ${query}`)
    
    // Return placeholder structure
    return []
  }

  /**
   * Utility delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export const productImageReferenceService = new ProductImageReferenceService()
