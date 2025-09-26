/**
 * AI Processing Service
 * Uses OpenAI GPT-4 to extract structured purchase order data from parsed files
 */

import OpenAI from 'openai'
import { ResilientOpenAIService } from './openaiRateLimiter.js'
import { DatabasePersistenceService } from './databasePersistenceService.js'
import { ShopifySyncService } from './shopifySyncService.js'
import { AI_PROCESSING_FORMAT, validateAIResult } from './aiProcessingFormat.js'
import dotenv from 'dotenv'

dotenv.config()

export class AIProcessingService {
  constructor() {
    // Initialize OpenAI client
    const openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
    
    // Wrap with resilient service for error mitigation
    this.resilientOpenAI = new ResilientOpenAIService(openaiClient, {
      maxRequestsPerMinute: 15, // Conservative limit
      maxTokensPerMinute: 30000, // Reduced for safety
      maxRetries: 3,
      baseDelay: 2000, // 2 second base delay
      maxDelay: 30000 // 30 second max delay
    })
    
    // Keep reference to raw client for non-critical operations
    this.openai = openaiClient
    
    // Initialize database persistence service
    this.dbService = new DatabasePersistenceService()
    
    // Initialize Shopify sync service
    this.shopifyService = new ShopifySyncService()
    
    this.defaultModel = 'gpt-5-nano' // Latest nano model for cost-effective structured extraction
    this.fallbackModel = 'gpt-4o-mini' // Fallback to proven model
    this.visionModel = 'gpt-4o' // Keep vision model for image processing
    
    // Document type patterns for classification
    this.documentPatterns = {
      purchase_order: ['purchase order', 'po#', 'po number', 'order confirmation'],
      invoice: ['invoice', 'bill', 'inv#', 'invoice number'],
      quote: ['quote', 'quotation', 'estimate', 'proposal'],
      receipt: ['receipt', 'transaction', 'payment confirmation'],
      delivery_note: ['delivery', 'shipping', 'packing slip'],
      credit_note: ['credit', 'credit note', 'refund']
    }
    
    // Industry-specific processing rules
    this.industryRules = {
      retail: {
        requiredFields: ['sku', 'upc', 'productName', 'size', 'color'],
        priceFormats: ['unit', 'wholesale', 'retail'],
        commonTerms: ['wholesale', 'retail', 'msrp', 'margin']
      },
      manufacturing: {
        requiredFields: ['partNumber', 'specification', 'leadTime', 'lotSize'],
        priceFormats: ['per_unit', 'per_lot', 'setup_cost'],
        commonTerms: ['manufacturing', 'tooling', 'setup', 'batch']
      },
      food_service: {
        requiredFields: ['productCode', 'brandName', 'packageSize', 'expiryDate'],
        priceFormats: ['case_price', 'unit_price', 'per_pound'],
        commonTerms: ['case', 'each', 'lb', 'kg', 'expiry', 'best before']
      },
      technology: {
        requiredFields: ['modelNumber', 'serialNumber', 'warranty', 'specifications'],
        priceFormats: ['unit_price', 'license_fee', 'support_cost'],
        commonTerms: ['license', 'support', 'warranty', 'maintenance']
      }
    }
  }

  /**
   * Extract structured PO data from parsed file content with GPT-5-nano optimizations
   */
  async extractPurchaseOrderData(parsedContent, fileName, aiSettings = {}) {
    try {
      console.log(`Starting AI extraction for ${fileName} using ${this.defaultModel}`)
      
      const {
        confidenceThreshold = 0.8,
        strictMatching = true,
        customRules = [],
        fieldMappings = {},
        primaryModel = 'gpt-5-nano',
        fallbackModel = 'gpt-4o-mini',
        industry = null,
        customFields = []
      } = aiSettings

      // Update models if specified in settings
      if (primaryModel !== this.defaultModel) {
        console.log(`Using custom primary model: ${primaryModel}`)
        this.defaultModel = primaryModel
      }
      if (fallbackModel !== this.fallbackModel) {
        this.fallbackModel = fallbackModel
      }

      // Step 1: Classify document type
      const documentType = await this.classifyDocumentType(parsedContent.text || parsedContent.extractedText)
      console.log(`Document classified as: ${documentType}`)

      let result
      
      // Use vision model for images, text model for documents
      if (parsedContent.extractionMethod === 'image-ocr-ready') {
        result = await this.processImageWithVision(parsedContent, fileName, { documentType, industry, customFields })
      } else {
        result = await this.processTextContent(parsedContent, fileName, { documentType, industry, customFields })
      }

      // Apply enhanced multi-dimensional confidence scoring
      const scoredResult = await this.applyEnhancedConfidenceScoring(result, parsedContent, documentType, industry)
      
      // Apply custom rules if provided
      const finalResult = this.applyCustomRules(scoredResult, customRules, fieldMappings)
      
      console.log(`AI extraction completed for ${fileName}. Model: ${finalResult.model}, Overall confidence: ${finalResult.confidence?.overall}, Document type: ${documentType}`)
      
      // Return in production format with proper structure
      return {
        success: true,
        model: finalResult.model,
        tokensUsed: finalResult.tokensUsed,
        processingTime: finalResult.processingTime || 0,
        processingMethod: finalResult.processingMethod,
        inputType: parsedContent.type || 'text',
        documentType: documentType,
        industry: industry,
        confidence: finalResult.confidence,
        dataQuality: finalResult.dataQuality,
        extractedData: finalResult, // The actual extracted data
        warnings: finalResult.warnings || [],
        processingNotes: finalResult.processingNotes || `Successfully processed by ${finalResult.model}`
      }
    } catch (error) {
      console.error(`AI processing error for ${fileName}:`, error)
      
      // Return in production error format
      return {
        success: false,
        error: error.message,
        model: 'unknown',
        tokensUsed: 0,
        processingTime: 0,
        processingMethod: 'failed',
        inputType: parsedContent?.type || 'text',
        documentType: 'unknown',
        industry: null,
        confidence: { overall: 0 },
        dataQuality: 'poor',
        extractedData: null,
        warnings: [`Processing failed: ${error.message}`],
        processingNotes: `Failed to extract data from ${fileName}`
      }
    }
  }

  /**
   * Process text content using enhanced prompt engineering
   */
  async processTextContent(parsedContent, fileName, options = {}) {
    const { documentType = 'purchase_order', industry = null, customFields = [] } = options
    const prompt = this.buildEnhancedExtractionPrompt(parsedContent.text, documentType, industry, customFields)
    
    try {
      // Try GPT-5-nano first with enhanced prompting
      const completion = await this.resilientOpenAI.createChatCompletion({
        model: this.defaultModel,
        messages: [
          {
            role: 'system',
            content: this.getEnhancedSystemPrompt(documentType, industry, options.customFields)
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.05, // Very low temperature for consistency
        max_tokens: 4096, // Optimized for structured extraction
        response_format: { type: 'json_object' }
      })

      const extractedData = JSON.parse(completion.choices[0].message.content)
      
      // Apply enhanced confidence scoring
      const enhancedData = this.applyEnhancedConfidenceScoring(extractedData, parsedContent.text)
      
      return {
        ...enhancedData,
        processingMethod: 'text-gpt5-nano-enhanced',
        tokensUsed: completion.usage?.total_tokens || 0,
        model: this.defaultModel,
        documentType,
        industry
      }
      
    } catch (error) {
      console.warn(`GPT-5-nano failed for ${fileName}, falling back to ${this.fallbackModel}:`, error.message)
      
      // Fallback to GPT-4o-mini with simplified prompt
      const completion = await this.resilientOpenAI.createChatCompletion({
        model: this.fallbackModel,
        messages: [
          {
            role: 'system',
            content: this.getEnhancedSystemPrompt(documentType, industry, options.customFields)
          },
          {
            role: 'user',
            content: this.buildSimplifiedExtractionPrompt(parsedContent.text, documentType)
          }
        ],
        temperature: 0.1,
        max_completion_tokens: 2048, // Appropriate for gpt-4o-mini
        response_format: { type: 'json_object' }
      })

      const extractedData = JSON.parse(completion.choices[0].message.content)
      
      // Apply enhanced confidence scoring
      const enhancedData = this.applyEnhancedConfidenceScoring(extractedData, parsedContent.text)
      
      return {
        ...enhancedData,
        processingMethod: 'text-gpt4-mini-fallback',
        tokensUsed: completion.usage?.total_tokens || 0,
        model: this.fallbackModel,
        fallbackReason: error.message,
        documentType,
        industry
      }
    }
  }

  /**
   * Classify document type based on content analysis
   */
  async classifyDocumentType(textContent) {
    try {
      const lowerText = textContent.toLowerCase()
      
      // Quick pattern matching first (most efficient)
      for (const [docType, patterns] of Object.entries(this.documentPatterns)) {
        for (const pattern of patterns) {
          if (lowerText.includes(pattern.toLowerCase())) {
            console.log(`Document type detected via pattern matching: ${docType}`)
            return docType
          }
        }
      }
      
      // If no patterns match, use AI classification for ambiguous documents
      const classificationPrompt = `Analyze this document content and classify it as one of: purchase_order, invoice, quote, receipt, delivery_note, credit_note.

Document content (first 500 characters):
${textContent.substring(0, 500)}

Respond with ONLY the document type (no explanations):`

      const completion = await this.resilientOpenAI.createChatCompletion({
        model: 'gpt-3.5-turbo', // Use cheaper model for classification
        messages: [
          {
            role: 'system',
            content: 'You are a document classification expert. Classify documents accurately based on their content and structure.'
          },
          {
            role: 'user',
            content: classificationPrompt
          }
        ],
        temperature: 0,
        max_tokens: 20
      })

      const classifiedType = completion.choices[0].message.content.trim().toLowerCase()
      console.log(`Document type detected via AI classification: ${classifiedType}`)
      return classifiedType
    } catch (error) {
      console.warn('Document classification failed, defaulting to purchase_order:', error.message)
      return 'purchase_order'
    }
  }

  /**
   * Get enhanced system prompt based on document type and industry
   */
  getEnhancedSystemPrompt(documentType, industry, customFields = []) {
    const basePrompt = `You are an expert document processing AI specialized in extracting purchase order data with high accuracy. Your task is to analyze ${documentType} documents and extract structured data.`
    
    const industryContext = industry && this.industryRules[industry] 
      ? `\n\nIndustry Context: ${industry.toUpperCase()}
Required fields: ${this.industryRules[industry].requiredFields.join(', ')}
Common terms: ${this.industryRules[industry].commonTerms.join(', ')}`
      : ''
      
    const customFieldsContext = customFields.length > 0 
      ? `\n\nCustom fields to extract: ${customFields.join(', ')}`
      : ''

    return `${basePrompt}${industryContext}${customFieldsContext}

CRITICAL REQUIREMENTS:
1. Extract data with maximum precision
2. Return valid JSON with proper structure
3. Calculate confidence scores based on data quality
4. Handle missing data gracefully
5. Validate all extracted values`
  }

  /**
   * Build enhanced extraction prompt with document classification and industry awareness
   */
  buildEnhancedExtractionPrompt(textContent, documentType, industry, customFields) {
    const industrySpecificFields = industry && this.industryRules[industry] 
      ? this.industryRules[industry].requiredFields
      : []
    
    const allCustomFields = [...customFields, ...industrySpecificFields].filter((v, i, a) => a.indexOf(v) === i)

    return `Extract purchase order data from this ${documentType} document:

${textContent}

EXTRACTION REQUIREMENTS:
Document Type: ${documentType}
${industry ? `Industry: ${industry}` : ''}
${allCustomFields.length > 0 ? `Custom Fields: ${allCustomFields.join(', ')}` : ''}

Return a JSON object with this structure:
{
  "poNumber": "string",
  "vendor": {
    "name": "string",
    "address": "string",
    "contact": "string"
  },
  "orderDate": "YYYY-MM-DD",
  "deliveryDate": "YYYY-MM-DD",
  "lineItems": [
    {
      "description": "string",
      "quantity": number,
      "unitPrice": number,
      "totalPrice": number
    }
  ],
  "totals": {
    "subtotal": number,
    "tax": number,
    "total": number
  },
  "confidence": {
    "overall": number,
    "poNumber": number,
    "vendor": number,
    "lineItems": number,
    "totals": number
  },
  "documentType": "${documentType}",
  ${industry ? `"industry": "${industry}",` : ''}
  ${allCustomFields.length > 0 ? `"customFields": { ${allCustomFields.map(field => `"${field}": "string"`).join(', ')} },` : ''}
  "warnings": ["list of any data quality concerns"]
}

Focus on accuracy and provide confidence scores (0-100) for each section based on data clarity and completeness.`
  }

  /**
   * Build simplified extraction prompt for fallback processing
   */
  buildSimplifiedExtractionPrompt(textContent, documentType) {
    return `Extract basic purchase order data from this ${documentType}:

${textContent}

Return JSON with: poNumber, vendor (name, address), orderDate, lineItems (description, quantity, unitPrice), totals (subtotal, tax, total), and confidence scores.`
  }

  /**
   * Apply enhanced confidence scoring across multiple dimensions
   */
  applyEnhancedConfidenceScoring(extractedData, rawText) {
    const scores = {
      overall: 0,
      poNumber: this.scoreField(extractedData.poNumber, rawText, ['po', 'purchase order', 'order number']),
      vendor: this.scoreVendor(extractedData.vendor, rawText),
      lineItems: this.scoreLineItems(extractedData.lineItems),
      totals: this.scoreTotals(extractedData.totals, extractedData.lineItems),
      dateConsistency: this.scoreDateConsistency(extractedData.orderDate, extractedData.deliveryDate),
      formatCompliance: this.scoreFormatCompliance(extractedData)
    }

    // Calculate weighted overall score
    scores.overall = Math.round(
      (scores.poNumber * 0.2) +
      (scores.vendor * 0.2) +
      (scores.lineItems * 0.25) +
      (scores.totals * 0.2) +
      (scores.dateConsistency * 0.1) +
      (scores.formatCompliance * 0.05)
    )

    return {
      ...extractedData,
      confidence: scores,
      dataQuality: this.assessDataQuality(scores)
    }
  }

  /**
   * Score individual field presence and accuracy
   */
  scoreField(fieldValue, rawText, patterns) {
    if (!fieldValue || fieldValue === '') return 0
    if (!rawText || typeof rawText !== 'string') return 50 // Default score if no text context
    
    const foundInText = patterns.some(pattern => 
      rawText.toLowerCase().includes(pattern) && 
      rawText.toLowerCase().includes(fieldValue.toLowerCase())
    )
    
    return foundInText ? 90 : 60 // High if found in context, medium if extracted but not verified
  }

  /**
   * Score vendor information completeness
   */
  scoreVendor(vendor, rawText) {
    if (!vendor) return 0
    
    let score = 0
    if (vendor.name && vendor.name.trim() !== '') score += 50
    if (vendor.address && vendor.address.trim() !== '') score += 30
    if (vendor.contact && vendor.contact.trim() !== '') score += 20
    
    return score
  }

  /**
   * Score line items for completeness and mathematical accuracy
   */
  scoreLineItems(lineItems) {
    if (!Array.isArray(lineItems) || lineItems.length === 0) return 0
    
    let totalScore = 0
    let itemCount = 0
    
    for (const item of lineItems) {
      let itemScore = 0
      if (item.description && item.description.trim() !== '') itemScore += 30
      if (typeof item.quantity === 'number' && item.quantity > 0) itemScore += 25
      if (typeof item.unitPrice === 'number' && item.unitPrice > 0) itemScore += 25
      
      // Check mathematical consistency
      if (item.quantity && item.unitPrice && item.totalPrice) {
        const calculatedTotal = item.quantity * item.unitPrice
        if (Math.abs(calculatedTotal - item.totalPrice) < 0.01) itemScore += 20
      }
      
      totalScore += itemScore
      itemCount++
    }
    
    return itemCount > 0 ? Math.round(totalScore / itemCount) : 0
  }

  /**
   * Score totals for mathematical accuracy
   */
  scoreTotals(totals, lineItems) {
    if (!totals) return 0
    
    let score = 0
    
    // Check if totals are present
    if (typeof totals.subtotal === 'number') score += 30
    if (typeof totals.tax === 'number') score += 20
    if (typeof totals.total === 'number') score += 30
    
    // Verify mathematical accuracy against line items
    if (Array.isArray(lineItems) && lineItems.length > 0) {
      const calculatedSubtotal = lineItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0)
      if (Math.abs(calculatedSubtotal - (totals.subtotal || 0)) < 0.01) score += 20
    }
    
    return score
  }

  /**
   * Score date consistency and validity
   */
  scoreDateConsistency(orderDate, deliveryDate) {
    let score = 50 // Base score for having dates
    
    if (!orderDate && !deliveryDate) return 0
    if (!orderDate || !deliveryDate) return 30
    
    try {
      const order = new Date(orderDate)
      const delivery = new Date(deliveryDate)
      
      if (isNaN(order.getTime()) || isNaN(delivery.getTime())) return 20
      if (delivery >= order) score += 40 // Logical date sequence
      if (delivery.getTime() - order.getTime() <= 365 * 24 * 60 * 60 * 1000) score += 10 // Within 1 year
      
    } catch (error) {
      return 20
    }
    
    return Math.min(score, 100)
  }

  /**
   * Score format compliance and data structure
   */
  scoreFormatCompliance(extractedData) {
    let score = 0
    
    // Check required fields presence
    if (extractedData.poNumber) score += 20
    if (extractedData.vendor && typeof extractedData.vendor === 'object') score += 20
    if (Array.isArray(extractedData.lineItems)) score += 30
    if (extractedData.totals && typeof extractedData.totals === 'object') score += 20
    if (extractedData.orderDate) score += 10
    
    return score
  }

  /**
   * Assess overall data quality based on confidence scores
   */
  assessDataQuality(scores) {
    if (scores.overall >= 80) return 'excellent'
    if (scores.overall >= 65) return 'good'
    if (scores.overall >= 45) return 'fair'
    return 'poor'
  }

  /**
   * Process images using GPT-4 Vision
   */
  async processImageWithVision(parsedContent, fileName) {
    const base64Image = parsedContent.imageBuffer.toString('base64')
    
    const completion = await this.resilientOpenAI.createChatCompletion({
      model: this.visionModel,
      messages: [
        {
          role: 'system',
          content: this.getSystemPrompt()
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: this.buildImageExtractionPrompt()
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Image}`,
                detail: 'high'
              }
            }
          ]
        }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    })

    const extractedData = JSON.parse(completion.choices[0].message.content)
    
    return {
      ...extractedData,
      processingMethod: 'vision-gpt4',
      tokensUsed: completion.usage?.total_tokens || 0,
      model: this.visionModel
    }
  }

  /**
   * System prompt optimized for GPT-5-nano performance
   */
  getSystemPrompt() {
    return `You are a professional purchase order data extraction assistant using GPT-5-nano. Your job is to extract structured data from purchase order documents with maximum accuracy and efficiency.

CRITICAL REQUIREMENTS:
1. Return ONLY valid JSON - no explanations, comments, or additional text
2. Extract ALL line items with complete details - never skip items
3. Calculate precise confidence scores (0-1) for each field based on data clarity
4. Handle multiple currencies, date formats, and document layouts
5. Identify supplier information with high accuracy
6. Extract complete product details: SKUs, descriptions, quantities, prices

CONFIDENCE SCORING (GPT-5-nano optimized):
- 1.0: Perfect, clearly formatted data with no ambiguity
- 0.95: Clear data with minor formatting variations
- 0.9: Visible data requiring minimal interpretation
- 0.85: Good data quality with standard formatting
- 0.8: Acceptable data with some interpretation needed
- 0.7: Partially visible or context-dependent data
- 0.6: Ambiguous data requiring inference
- 0.5 or lower: Poor quality or missing data

PROCESSING EFFICIENCY:
- Process documents systematically from top to bottom
- Prioritize tabular data for line items
- Cross-reference totals for validation
- Use document structure cues for field identification

OUTPUT FORMAT:
Return only the JSON object with the exact structure specified - no additional text, explanations, or markdown formatting.`
  }

  /**
   * Build extraction prompt for text content
   */
  buildExtractionPrompt(textContent) {
    return `Extract purchase order data from the following document content:

${textContent}

Return a JSON object with this structure:
{
  "purchaseOrder": {
    "number": "PO number",
    "numberConfidence": 0.95,
    "supplierName": "Supplier name",
    "supplierConfidence": 0.90,
    "orderDate": "YYYY-MM-DD",
    "dateConfidence": 0.85,
    "dueDate": "YYYY-MM-DD",
    "dueDateConfidence": 0.80,
    "totalAmount": 1234.56,
    "totalConfidence": 0.95,
    "currency": "USD",
    "currencyConfidence": 0.99
  },
  "lineItems": [
    {
      "sku": "product-sku",
      "skuConfidence": 0.90,
      "productName": "Product name",
      "nameConfidence": 0.95,
      "description": "Additional details",
      "descriptionConfidence": 0.80,
      "quantity": 10,
      "quantityConfidence": 0.95,
      "unitCost": 99.99,
      "unitCostConfidence": 0.90,
      "totalCost": 999.90,
      "totalCostConfidence": 0.95
    }
  ],
  "supplierDetails": {
    "contactEmail": "email@supplier.com",
    "contactPhone": "+1-555-0123",
    "address": "Full address",
    "website": "www.supplier.com"
  },
  "extractionNotes": "Any important notes or issues encountered during extraction"
}`
  }

  /**
   * Build extraction prompt for images
   */
  buildImageExtractionPrompt() {
    return `Analyze this purchase order document image and extract all structured data.

Focus on:
1. Purchase order number
2. Supplier/vendor information
3. Order date and due date
4. Line items with SKU, product name, quantity, unit price, total price
5. Total amount and currency
6. Any contact information

Use the same JSON structure as specified in the system prompt. Pay special attention to table data and ensure all line items are captured accurately.`
  }

  /**
   * Apply GPT-5-nano optimized confidence scoring to extracted data
   */
  async applyGPT5NanoConfidenceScoring(extractedData, parsedContent) {
    const { purchaseOrder, lineItems, processingMethod } = extractedData
    
    // Calculate overall confidence scores with GPT-5-nano weighting
    const poConfidence = this.calculateFieldConfidence(purchaseOrder)
    const lineItemsConfidence = lineItems.map(item => this.calculateFieldConfidence(item))
    const avgLineItemConfidence = lineItemsConfidence.reduce((sum, conf) => sum + conf, 0) / lineItemsConfidence.length

    // GPT-5-nano tends to be more conservative with confidence scores
    // Apply slight boost for structured extraction methods
    const modelBoost = processingMethod?.includes('gpt5-nano') ? 0.02 : 0
    const structuredBoost = parsedContent.extractionMethod?.includes('structured') ? 0.03 : 0

    // Overall confidence is weighted average with GPT-5-nano optimizations
    let overallConfidence = (poConfidence * 0.4 + avgLineItemConfidence * 0.6) + modelBoost + structuredBoost
    overallConfidence = Math.min(1.0, overallConfidence) // Cap at 1.0

    return {
      ...extractedData,
      confidence: {
        overall: overallConfidence,
        purchaseOrder: poConfidence,
        lineItems: avgLineItemConfidence,
        itemBreakdown: lineItemsConfidence,
        modelBoost,
        structuredBoost
      },
      processingQuality: this.assessGPT5NanoQuality(overallConfidence, parsedContent, processingMethod),
      recommendedAction: this.getGPT5NanoRecommendedAction(overallConfidence, processingMethod)
    }
  }

  /**
   * Assess processing quality specifically for GPT-5-nano
   */
  assessGPT5NanoQuality(confidence, parsedContent, processingMethod) {
    // GPT-5-nano quality assessment with updated thresholds
    if (confidence >= 0.95) return 'excellent'
    if (confidence >= 0.88) return 'very_good' 
    if (confidence >= 0.8) return 'good'
    if (confidence >= 0.72) return 'acceptable'
    if (confidence >= 0.65) return 'review_needed'
    return 'poor'
  }

  /**
   * Get recommended action based on GPT-5-nano confidence patterns
   */
  getGPT5NanoRecommendedAction(confidence, processingMethod) {
    const isNanoModel = processingMethod?.includes('gpt5-nano')
    
    if (isNanoModel) {
      // GPT-5-nano specific thresholds
      if (confidence >= 0.92) return 'auto_approve'
      if (confidence >= 0.85) return 'light_review'
      if (confidence >= 0.7) return 'manual_review'
      return 'manual_entry'
    } else {
      // Fallback model thresholds
      if (confidence >= 0.9) return 'auto_approve'
      if (confidence >= 0.8) return 'light_review'
      if (confidence >= 0.6) return 'manual_review'
      return 'manual_entry'
    }
  }

  /**
   * Calculate confidence for a set of fields
   */
  calculateFieldConfidence(fieldObject) {
    const confidenceFields = Object.keys(fieldObject).filter(key => key.endsWith('Confidence'))
    if (confidenceFields.length === 0) return 0.5
    
    const sum = confidenceFields.reduce((total, field) => total + fieldObject[field], 0)
    return sum / confidenceFields.length
  }

  /**
   * Apply custom rules and field mappings
   */
  applyCustomRules(extractedData, customRules = [], fieldMappings = {}) {
    let processedData = { ...extractedData }

    // Apply field mappings
    if (Object.keys(fieldMappings).length > 0) {
      processedData = this.applyFieldMappings(processedData, fieldMappings)
    }

    // Apply custom business rules
    customRules.forEach(rule => {
      processedData = this.applyCustomRule(processedData, rule)
    })

    return processedData
  }

  /**
   * Apply field mappings to extracted data
   */
  applyFieldMappings(data, mappings) {
    // Implementation for custom field mapping logic
    return data
  }

  /**
   * Apply individual custom rule
   */
  applyCustomRule(data, rule) {
    // Implementation for custom rule application
    return data
  }

  /**
   * Validate AI extraction results
   */
  validateExtractionResult(result) {
    const required = ['purchaseOrder', 'lineItems']
    const missing = required.filter(field => !result[field])
    
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`)
    }

    if (!Array.isArray(result.lineItems) || result.lineItems.length === 0) {
      throw new Error('No line items extracted')
    }

    if (!result.confidence || result.confidence.overall < 0.1) {
      throw new Error('Extraction confidence too low')
    }

    return true
  }

  /**
   * Complete AI processing with Shopify synchronization
   */
  async processAndSyncToShopify(parsedContent, fileName, merchantId, options = {}) {
    const startTime = Date.now()
    
    try {
      console.log(`🚀 Starting complete AI processing and Shopify sync for ${fileName}`)
      
      // Step 1: Process and persist to database
      const processResult = await this.processAndPersist(parsedContent, fileName, merchantId, options)
      
      if (!processResult.success) {
        throw new Error(`AI processing failed: ${processResult.error}`)
      }
      
      console.log(`✅ AI processing completed, starting Shopify sync...`)
      
      // Step 2: Sync to Shopify (can be async)
      let shopifyResult = null
      
      if (options.syncToShopify !== false) { // Default to true unless explicitly disabled
        try {
          if (options.queueShopifySync) {
            // Queue for later processing
            shopifyResult = await this.shopifyService.queuePurchaseOrderSync(
              processResult.purchaseOrderId,
              options.syncPriority || 'normal'
            )
            console.log(`📋 Shopify sync queued: ${shopifyResult.jobId}`)
          } else {
            // Sync immediately
            shopifyResult = await this.shopifyService.syncPurchaseOrderToShopify(
              processResult.purchaseOrderId,
              options
            )
            console.log(`🔄 Shopify sync completed: ${shopifyResult.success ? 'SUCCESS' : 'FAILED'}`)
          }
        } catch (shopifyError) {
          console.error(`❌ Shopify sync failed:`, shopifyError.message)
          shopifyResult = {
            success: false,
            error: shopifyError.message,
            skipped: false
          }
        }
      } else {
        shopifyResult = {
          success: true,
          skipped: true,
          message: 'Shopify sync skipped by request'
        }
      }
      
      const totalTime = Date.now() - startTime
      
      console.log(`🎯 Complete processing finished in ${totalTime}ms`)
      
      return {
        success: true,
        aiProcessing: processResult,
        shopifySync: shopifyResult,
        totalProcessingTime: totalTime,
        purchaseOrderId: processResult.purchaseOrderId,
        supplierId: processResult.supplierId,
        lineItemsCount: processResult.lineItemsCount,
        auditId: processResult.auditId
      }
      
    } catch (error) {
      console.error('❌ Complete processing failed:', error.message)
      
      return {
        success: false,
        error: error.message,
        totalProcessingTime: Date.now() - startTime
      }
    }
  }

  /**
   * Process and persist AI results to database
   * Main method that handles complete AI processing and database storage
   */
  async processAndPersist(parsedContent, fileName, merchantId, options = {}) {
    const startTime = Date.now()
    
    try {
      console.log(`🚀 Starting AI processing and database persistence for ${fileName}`)
      
      // Step 1: Extract purchase order data using AI
      const aiResult = await this.extractPurchaseOrderData(parsedContent, fileName, {
        ...options,
        industry: options.industry || 'retail',
        customFields: options.customFields || []
      })
      
      // Step 2: Add processing metadata
      aiResult.processingTime = Date.now() - startTime
      aiResult.inputType = parsedContent.type || 'text'
      aiResult.success = true
      
      console.log(`🎯 AI processing completed in ${aiResult.processingTime}ms`)
      console.log(`   Model: ${aiResult.model}, Confidence: ${aiResult.confidence?.overall || 0}%`)
      
      // Step 3: Persist to database
      const persistenceResult = await this.dbService.persistAIResults(
        aiResult,
        merchantId,
        fileName,
        {
          fileSize: options.fileSize,
          fileUrl: options.fileUrl,
          inputSize: typeof parsedContent.text === 'string' ? parsedContent.text.length : null
        }
      )
      
      if (!persistenceResult.success) {
        throw new Error(`Database persistence failed: ${persistenceResult.error}`)
      }
      
      console.log(`✅ Complete processing finished in ${Date.now() - startTime}ms`)
      
      return {
        success: true,
        aiResult,
        persistenceResult,
        processingTime: Date.now() - startTime,
        purchaseOrderId: persistenceResult.purchaseOrder.id,
        supplierId: persistenceResult.supplier?.id,
        lineItemsCount: persistenceResult.lineItems.length,
        auditId: persistenceResult.auditRecord.id
      }
      
    } catch (error) {
      console.error('❌ AI processing and persistence failed:', error.message)
      
      // Try to save error to database if we have basic info
      try {
        if (merchantId) {
          await this.saveProcessingError(error, fileName, merchantId, options)
        }
      } catch (saveError) {
        console.error('❌ Failed to save error to database:', saveError.message)
      }
      
      return {
        success: false,
        error: error.message,
        processingTime: Date.now() - startTime
      }
    }
  }

  /**
   * Save processing error to database for audit trail
   */
  async saveProcessingError(error, fileName, merchantId, options = {}) {
    try {
      // Create a minimal PO record with failed status
      const purchaseOrder = await this.dbService.prisma.purchaseOrder.create({
        data: {
          number: `FAILED-${Date.now()}`,
          supplierName: 'Processing Failed',
          totalAmount: 0,
          status: 'failed',
          confidence: 0,
          processingNotes: `Processing failed: ${error.message}`,
          fileName: fileName,
          fileSize: options.fileSize || null,
          merchantId: merchantId,
          jobStatus: 'failed',
          jobError: error.message
        }
      })
      
      // Create AI audit record for the failure
      await this.dbService.prisma.aIProcessingAudit.create({
        data: {
          model: 'unknown',
          tokenCount: 0,
          processingTime: 0,
          confidence: 0,
          processingMethod: 'failed',
          inputType: options.inputType || 'text',
          fileName: fileName,
          status: 'failure',
          errorMessage: error.message,
          extractedFields: {}, // Add missing required field
          confidenceBreakdown: {}, // Add missing required field
          purchaseOrderId: purchaseOrder.id
        }
      })
      
      console.log(`💾 Error saved to database: ${purchaseOrder.id}`)
      
    } catch (saveError) {
      console.error('Failed to save error to database:', saveError.message)
    }
  }

  /**
   * Get processing statistics for a merchant
   */
  async getProcessingStats(merchantId, timeRange = '30d') {
    return await this.dbService.getProcessingStats(merchantId, timeRange)
  }

  /**
   * Get recent processing results
   */
  async getRecentProcessing(merchantId, limit = 10) {
    return await this.dbService.getRecentProcessing(merchantId, limit)
  }

  /**
   * Clean up resources
   */
  async disconnect() {
    if (this.dbService) {
      await this.dbService.disconnect()
    }
    if (this.shopifyService) {
      await this.shopifyService.disconnect()
    }
  }
}

export const aiProcessingService = new AIProcessingService()
export default aiProcessingService