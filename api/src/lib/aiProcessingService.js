/**
 * AI Processing Service
 * Uses OpenAI GPT-4 to extract structured purchase order data from parsed files
 */

import OpenAI from 'openai'
import dotenv from 'dotenv'

dotenv.config()

export class AIProcessingService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
    
    this.defaultModel = 'gpt-5-nano' // Latest nano model for cost-effective structured extraction
    this.fallbackModel = 'gpt-4o-mini' // Fallback to proven model
    this.visionModel = 'gpt-4o' // Keep vision model for image processing
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
        fallbackModel = 'gpt-4o-mini'
      } = aiSettings

      // Update models if specified in settings
      if (primaryModel !== this.defaultModel) {
        console.log(`Using custom primary model: ${primaryModel}`)
        this.defaultModel = primaryModel
      }
      if (fallbackModel !== this.fallbackModel) {
        this.fallbackModel = fallbackModel
      }

      let result
      
      // Use vision model for images, text model for documents
      if (parsedContent.extractionMethod === 'image-ocr-ready') {
        result = await this.processImageWithVision(parsedContent, fileName)
      } else {
        result = await this.processTextContent(parsedContent, fileName)
      }

      // Apply GPT-5-nano specific confidence scoring
      const scoredResult = await this.applyGPT5NanoConfidenceScoring(result, parsedContent)
      
      // Apply custom rules if provided
      const finalResult = this.applyCustomRules(scoredResult, customRules, fieldMappings)
      
      console.log(`AI extraction completed for ${fileName}. Model: ${finalResult.model}, Overall confidence: ${finalResult.confidence?.overall}`)
      
      return finalResult
    } catch (error) {
      console.error(`AI processing error for ${fileName}:`, error)
      throw new Error(`AI extraction failed: ${error.message}`)
    }
  }

  /**
   * Process text content using GPT-5-nano with fallback
   */
  async processTextContent(parsedContent, fileName) {
    const prompt = this.buildExtractionPrompt(parsedContent.text)
    
    try {
      // Try GPT-5-nano first
      const completion = await this.openai.chat.completions.create({
        model: this.defaultModel,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.05, // Very low temperature for GPT-5-nano consistency
        max_tokens: 4096, // Optimized for structured extraction
        response_format: { type: 'json_object' }
      })

      const extractedData = JSON.parse(completion.choices[0].message.content)
      
      return {
        ...extractedData,
        processingMethod: 'text-gpt5-nano',
        tokensUsed: completion.usage?.total_tokens || 0,
        model: this.defaultModel
      }
      
    } catch (error) {
      console.warn(`GPT-5-nano failed for ${fileName}, falling back to ${this.fallbackModel}:`, error.message)
      
      // Fallback to GPT-4o-mini
      const completion = await this.openai.chat.completions.create({
        model: this.fallbackModel,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      })

      const extractedData = JSON.parse(completion.choices[0].message.content)
      
      return {
        ...extractedData,
        processingMethod: 'text-gpt4-mini-fallback',
        tokensUsed: completion.usage?.total_tokens || 0,
        model: this.fallbackModel,
        fallbackReason: error.message
      }
    }
  }

  /**
   * Process images using GPT-4 Vision
   */
  async processImageWithVision(parsedContent, fileName) {
    const base64Image = parsedContent.imageBuffer.toString('base64')
    
    const completion = await this.openai.chat.completions.create({
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
}

export const aiProcessingService = new AIProcessingService()
export default aiProcessingService