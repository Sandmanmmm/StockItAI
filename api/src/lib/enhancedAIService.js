/**
 * Enhanced AI Parsing Service with Confidence Handling
 * 
 * Integrates with error handling service for proper confidence threshold management
 */

import OpenAI from 'openai'
import { errorHandlingService, CONFIDENCE_THRESHOLDS } from './errorHandlingService.js'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 120000, // 120 second timeout at client level (increased for large documents)
  maxRetries: 2 // Enable automatic retries with exponential backoff
})

export class EnhancedAIService {
  constructor() {
    this.defaultPrompt = `
Analyze this purchase order document and extract the following information with high accuracy.
Provide a confidence score (0-1) for each extracted field and an overall confidence score.

Extract:
- PO Number
- Supplier/Vendor Information (name, address, contact)
- Line Items (product codes, descriptions, quantities, unit prices, totals)
- Dates (order date, expected delivery date)
- Total amounts
- Special instructions or notes

Return the data in this JSON format:
{
  "confidence": 0.95,
  "extractedData": {
    "poNumber": "...",
    "supplier": {...},
    "lineItems": [...],
    "dates": {...},
    "totals": {...},
    "notes": "..."
  },
  "fieldConfidences": {
    "poNumber": 0.98,
    "supplier": 0.95,
    "lineItems": 0.90,
    ...
  },
  "qualityIndicators": {
    "imageClarity": "high|medium|low",
    "textLegibility": "high|medium|low", 
    "documentCompleteness": "complete|partial|incomplete"
  },
  "issues": [...],
  "suggestions": [...]
}

Be very conservative with confidence scores. Only give high confidence (>0.9) when you're absolutely certain.
`
  }

  /**
   * Production-ready file type detection using magic numbers (file signatures)
   */
  detectFileType(fileContent) {
    if (!fileContent || fileContent.length < 4) {
      throw new Error('File content too small to determine type')
    }

    const firstBytes = fileContent.slice(0, 8)
    
    // PDF signature: %PDF
    if (firstBytes.slice(0, 4).toString('ascii') === '%PDF') {
      return { type: 'pdf', mimeType: 'application/pdf' }
    }
    
    // JPEG signature: FF D8 FF
    if (firstBytes[0] === 0xFF && firstBytes[1] === 0xD8 && firstBytes[2] === 0xFF) {
      return { type: 'jpeg', mimeType: 'image/jpeg' }
    }
    
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    if (firstBytes[0] === 0x89 && firstBytes[1] === 0x50 && 
        firstBytes[2] === 0x4E && firstBytes[3] === 0x47 &&
        firstBytes[4] === 0x0D && firstBytes[5] === 0x0A &&
        firstBytes[6] === 0x1A && firstBytes[7] === 0x0A) {
      return { type: 'png', mimeType: 'image/png' }
    }
    
    // GIF signature: GIF87a or GIF89a
    if (firstBytes.slice(0, 3).toString('ascii') === 'GIF' &&
        (firstBytes.slice(3, 6).toString('ascii') === '87a' || 
         firstBytes.slice(3, 6).toString('ascii') === '89a')) {
      return { type: 'gif', mimeType: 'image/gif' }
    }
    
    // WebP signature: RIFF...WEBP
    if (firstBytes.slice(0, 4).toString('ascii') === 'RIFF' && 
        fileContent.slice(8, 12).toString('ascii') === 'WEBP') {
      return { type: 'webp', mimeType: 'image/webp' }
    }
    
    // CSV/text detection (common first characters)
    const textPreview = firstBytes.toString('ascii', 0, Math.min(100, fileContent.length))
    if (/^[A-Za-z0-9\s,";.\-_]+$/.test(textPreview)) {
      return { type: 'csv', mimeType: 'text/csv' }
    }
    
    // Default fallback
    throw new Error(`Unknown file type. First 8 bytes: ${Array.from(firstBytes).map(b => b.toString(16).padStart(2, '0')).join(' ')}`)
  }

  /**
   * Enhanced AI parsing with confidence and quality assessment
   */
  async parseDocument(fileContent, workflowId, options = {}) {
    try {
      console.log(`🤖 Starting AI parsing for workflow ${workflowId}`)
      
      let fileType
      
      // Use provided mimeType if available and not already processed content
      if (options.mimeType && !options.isProcessedContent) {
        console.log(`📄 Using provided MIME type: ${options.mimeType}`)
        if (options.mimeType === 'application/pdf') {
          fileType = { type: 'pdf', mimeType: 'application/pdf' }
        } else if (options.mimeType.startsWith('image/')) {
          fileType = { type: options.mimeType.split('/')[1], mimeType: options.mimeType }
        } else if (options.mimeType === 'text/csv') {
          fileType = { type: 'csv', mimeType: 'text/csv' }
        } else {
          // Fallback to detection for unknown MIME types
          fileType = this.detectFileType(fileContent)
        }
      } else {
        // Detect file format from buffer
        fileType = this.detectFileType(fileContent)
      }
      
      console.log(`📄 Detected file type: ${fileType.type} (${fileType.mimeType})`)
      console.log(`📊 File size: ${fileContent.length} bytes`)
      
      let response
      
      if (fileType.type === 'pdf') {
        // For PDFs, we need to extract text first, then process with text-based AI
        console.log('📄 Processing PDF with text extraction...')
        
        // Import file parsing service to extract text
        const { fileParsingService } = await import('./fileParsingService.js')
        const parseResult = await fileParsingService.parseFile(fileContent, 'application/pdf')
        
        console.log('📊 Parse result:', { hasText: !!parseResult.text, textLength: parseResult.text?.length, pages: parseResult.pages })
        
        if (!parseResult.text || parseResult.text.length === 0) {
          throw new Error('PDF text extraction returned empty content')
        }
        
        console.log(`📝 Extracted ${parseResult.text.length} characters from PDF (${parseResult.pages} pages)`)
        
        // Process extracted text with AI (with enhanced timeout and retry logic)
        console.log('🚀 Making OpenAI API call for PDF text processing...')
        console.log('📊 API Key configured:', !!process.env.OPENAI_API_KEY)
        console.log('📊 Content length:', parseResult.text.length)
        
        response = await this._processWithOpenAI(parseResult.text)
        
      } else if (['jpeg', 'png', 'gif', 'webp'].includes(fileType.type)) {
        // For images, use vision API
        console.log(`� Processing image with vision API...`)
        
        response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: this.defaultPrompt
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${fileType.mimeType};base64,${fileContent.toString('base64')}`,
                    detail: "high"
                  }
                }
              ]
            }
          ],
          max_tokens: 4000,
          temperature: 0.1
        })
        
      } else if (fileType.type === 'csv' || mimeType === 'text/csv') {
        // Handle CSV files with direct text content processing
        console.log('📊 Processing CSV file with text analysis')
        
        // Convert buffer to text content
        const csvContent = fileContent.toString('utf-8')
        console.log('📝 CSV content length:', csvContent.length)
        
        if (!csvContent || csvContent.length === 0) {
          throw new Error('CSV file appears to be empty')
        }
        
        response = await openai.chat.completions.create({
          model: "gpt-4o-mini", // Use default model for CSV processing
          messages: [
            {
              role: 'system',
              content: this.defaultPrompt
            },
            {
              role: 'user',
              content: `Please extract purchase order information from this CSV data:\n\n${csvContent}`
            }
          ],
          max_tokens: 4000,
          temperature: 0.1
        })
        
      } else {
        throw new Error(`Unsupported file type: ${fileType.type}. Supported formats: PDF, JPEG, PNG, GIF, WebP, CSV`)
      }

      const aiResponse = response.choices[0]?.message?.content
      if (!aiResponse) {
        throw new Error('No response from AI service')
      }

      let parsedResult
      try {
        // Extract JSON from response
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
          // If no JSON found, check if it's a rejection message
          if (aiResponse.toLowerCase().includes('unable to extract') || 
              aiResponse.toLowerCase().includes('not a purchase order') ||
              aiResponse.toLowerCase().includes('appears to be') ||
              aiResponse.toLowerCase().includes('not valid')) {
            
            console.log('🚫 AI rejected document as not being a valid PO')
            parsedResult = {
              confidence: 0,
              extractedData: {
                poNumber: null,
                supplier: { name: 'N/A' },
                lineItems: [],
                dates: {},
                totals: {},
                notes: aiResponse
              },
              fieldConfidences: {
                poNumber: 0,
                supplier: 0,
                lineItems: 0
              },
              qualityIndicators: {
                imageClarity: "high",
                textLegibility: "high",
                documentCompleteness: "invalid_document_type"
              },
              issues: ["Document is not a valid purchase order"],
              suggestions: ["Please upload a valid purchase order document"]
            }
          } else {
            throw new Error('No JSON found in AI response')
          }
        } else {
          parsedResult = JSON.parse(jsonMatch[0])
        }
      } catch (parseError) {
        console.error('Failed to parse AI response as JSON:', parseError)
        console.error('AI Response:', aiResponse)
        throw new Error('Invalid JSON response from AI service')
      }

      // Validate and enhance the result
      const enhancedResult = await this.enhanceAIResult(parsedResult, workflowId)
      
      // Handle confidence and determine next steps
      const handlingResult = await errorHandlingService.handleAIParsingResult(
        workflowId, 
        enhancedResult,
        options.confidenceThreshold || CONFIDENCE_THRESHOLDS.MANUAL_REVIEW
      )
      
      return {
        ...enhancedResult,
        handlingResult
      }

    } catch (error) {
      console.error(`❌ AI parsing failed for workflow ${workflowId}:`, error)
      
      // Handle AI parsing error through error handling service
      const handlingResult = await errorHandlingService.handleCriticalError(
        workflowId, 
        'ai_parsing', 
        error
      )
      
      return {
        success: false,
        error: error.message,
        handlingResult
      }
    }
  }

  /**
   * Enhance AI result with additional validation and quality checks
   */
  async enhanceAIResult(result, workflowId) {
    const enhanced = {
      ...result,
      metadata: {
        workflowId,
        processedAt: new Date().toISOString(),
        aiModel: 'gpt-4o'
      }
    }

    // Validate confidence score
    if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) {
      console.warn(`⚠️ Invalid confidence score for workflow ${workflowId}, defaulting to 0.5`)
      enhanced.confidence = 0.5
    }

    // Add quality assessment
    enhanced.qualityAssessment = this.assessDocumentQuality(result)
    
    // Add extraction completeness score
    enhanced.completenessScore = this.calculateCompletenessScore(result.extractedData)
    
    // Adjust confidence based on quality indicators
    enhanced.adjustedConfidence = this.adjustConfidenceBasedOnQuality(
      enhanced.confidence,
      enhanced.qualityAssessment,
      enhanced.completenessScore
    )

    // Use adjusted confidence as the final confidence
    enhanced.confidence = enhanced.adjustedConfidence

    console.log(`📊 AI parsing quality assessment for workflow ${workflowId}:`)
    console.log(`  Original confidence: ${(result.confidence * 100).toFixed(1)}%`)
    console.log(`  Adjusted confidence: ${(enhanced.confidence * 100).toFixed(1)}%`)
    console.log(`  Completeness score: ${(enhanced.completenessScore * 100).toFixed(1)}%`)
    console.log(`  Quality: ${enhanced.qualityAssessment.overall}`)

    return enhanced
  }

  /**
   * Assess document quality based on AI feedback
   */
  assessDocumentQuality(result) {
    const indicators = result.qualityIndicators || {}
    
    // Convert quality indicators to scores
    const qualityScores = {
      imageClarity: this.qualityToScore(indicators.imageClarity),
      textLegibility: this.qualityToScore(indicators.textLegibility),
      documentCompleteness: this.qualityToScore(indicators.documentCompleteness)
    }
    
    // Calculate overall quality score
    const overallScore = Object.values(qualityScores).reduce((sum, score) => sum + score, 0) / 3
    
    return {
      ...qualityScores,
      overall: this.scoreToQuality(overallScore),
      overallScore: overallScore,
      hasIssues: result.issues && result.issues.length > 0,
      issueCount: result.issues ? result.issues.length : 0
    }
  }

  /**
   * Convert quality indicators to numeric scores
   */
  qualityToScore(quality) {
    switch (quality?.toLowerCase()) {
      case 'high': return 1.0
      case 'medium': return 0.6
      case 'low': return 0.3
      default: return 0.5
    }
  }

  /**
   * Convert numeric scores back to quality indicators
   */
  scoreToQuality(score) {
    if (score >= 0.8) return 'high'
    if (score >= 0.6) return 'medium'
    return 'low'
  }

  /**
   * Calculate how complete the extracted data is
   */
  calculateCompletenessScore(extractedData) {
    if (!extractedData) return 0

    const requiredFields = [
      'poNumber',
      'supplier',
      'lineItems',
      'dates',
      'totals'
    ]

    let score = 0
    const fieldScores = []

    // Check each required field
    for (const field of requiredFields) {
      const fieldScore = this.scoreField(extractedData[field], field)
      fieldScores.push(fieldScore)
      score += fieldScore
    }

    return score / requiredFields.length
  }

  /**
   * Score individual fields based on completeness
   */
  scoreField(fieldValue, fieldName) {
    if (!fieldValue) return 0

    switch (fieldName) {
      case 'poNumber':
        return (typeof fieldValue === 'string' && fieldValue.trim().length > 0) ? 1 : 0
        
      case 'supplier':
        const hasName = fieldValue.name && fieldValue.name.trim().length > 0
        const hasContact = fieldValue.email || fieldValue.phone || fieldValue.address
        return hasName ? (hasContact ? 1 : 0.7) : 0.3
        
      case 'lineItems':
        if (!Array.isArray(fieldValue) || fieldValue.length === 0) return 0
        const validItems = fieldValue.filter(item => 
          item.description && (item.quantity || item.price)
        )
        return validItems.length / fieldValue.length
        
      case 'dates':
        const hasOrderDate = fieldValue.orderDate || fieldValue.poDate
        const hasDeliveryDate = fieldValue.deliveryDate || fieldValue.expectedDelivery
        return (hasOrderDate ? 0.6 : 0) + (hasDeliveryDate ? 0.4 : 0)
        
      case 'totals':
        return (fieldValue.total || fieldValue.grandTotal || fieldValue.amount) ? 1 : 0
        
      default:
        return fieldValue ? 0.5 : 0
    }
  }

  /**
   * Adjust confidence based on quality indicators
   */
  adjustConfidenceBasedOnQuality(originalConfidence, qualityAssessment, completenessScore) {
    let adjustedConfidence = originalConfidence

    // Reduce confidence for poor quality documents
    if (qualityAssessment.overallScore < 0.5) {
      adjustedConfidence *= 0.8
    } else if (qualityAssessment.overallScore < 0.7) {
      adjustedConfidence *= 0.9
    }

    // Reduce confidence for incomplete data
    if (completenessScore < 0.6) {
      adjustedConfidence *= 0.8
    } else if (completenessScore < 0.8) {
      adjustedConfidence *= 0.9
    }

    // Reduce confidence if there are many issues
    if (qualityAssessment.issueCount > 3) {
      adjustedConfidence *= 0.8
    } else if (qualityAssessment.issueCount > 1) {
      adjustedConfidence *= 0.9
    }

    // Ensure confidence doesn't go below minimum threshold
    return Math.max(adjustedConfidence, 0.1)
  }

  /**
   * Re-process document with different parameters (for retry scenarios)
   */
  async reprocessDocument(fileContent, workflowId, previousResult, options = {}) {
    console.log(`🔄 Re-processing document for workflow ${workflowId}`)
    
    // Modify prompt based on previous issues
    let enhancedPrompt = this.defaultPrompt
    
    if (previousResult.issues) {
      enhancedPrompt += `\n\nPrevious processing identified these issues: ${previousResult.issues.join(', ')}`
      enhancedPrompt += '\nPlease pay special attention to these areas.'
    }

    // Use higher temperature for retry to get different perspective
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: enhancedPrompt
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${fileContent.toString('base64')}`,
                detail: "high"
              }
            }
          ]
        }
      ],
      max_tokens: 4000,
      temperature: 0.3 // Slightly higher for retry
    })

    // Process result similar to main parsing
    const aiResponse = response.choices[0]?.message?.content
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
    const parsedResult = JSON.parse(jsonMatch[0])
    
    return await this.enhanceAIResult(parsedResult, workflowId)
  }

  /**
   * Process text with OpenAI API with enhanced timeout, retry logic, and chunking
   * @param {string} text - The text content to process
   * @returns {Promise<Object>} - OpenAI API response
   */
  async _processWithOpenAI(text) {
    const MAX_RETRIES = 3
    const CHUNK_SIZE = 12000 // Reduced from 16k to be more conservative
    const BASE_DELAY = 5000 // 5 second base delay for retries
    
    // Determine if we need to chunk the content
    const needsChunking = text.length > CHUNK_SIZE
    
    if (needsChunking) {
      console.log(`📄 Large document detected (${text.length} chars), using chunking strategy`)
      return await this._processLargeDocument(text)
    }
    
    // Process normal-sized documents with retry logic
    let lastError = null
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const startTime = Date.now()
      
      try {
        console.log(`🔍 Attempt ${attempt}/${MAX_RETRIES} - Processing document with OpenAI API...`)
        console.log(`📊 Content length: ${text.length} characters`)
        
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: `${this.defaultPrompt}\n\nDocument Content:\n${text}`
            }
          ],
          max_tokens: 4000,
          temperature: 0.1
        })
        
        const duration = Date.now() - startTime
        console.log(`✅ OpenAI API call completed successfully in ${duration}ms on attempt ${attempt}`)
        
        return response
        
      } catch (error) {
        const duration = Date.now() - startTime
        lastError = error
        
        console.error(`❌ Attempt ${attempt}/${MAX_RETRIES} failed after ${duration}ms:`, error.message)
        console.error('❌ Error type:', error.constructor.name)
        console.error('❌ Error code:', error.code)
        console.error('❌ Error status:', error.status)
        
        // Don't retry on certain error types
        if (error.code === 'invalid_api_key' || error.status === 401) {
          console.error('❌ Authentication error - not retrying')
          throw new Error(`OpenAI API authentication failed: ${error.message}`)
        }
        
        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY * Math.pow(2, attempt - 1) // Exponential backoff
          console.log(`⏳ Waiting ${delay}ms before retry ${attempt + 1}...`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }
    
    // All retries failed
    throw new Error(`OpenAI API failed after ${MAX_RETRIES} attempts. Last error: ${lastError.message}`)
  }

  /**
   * Process large documents by chunking them intelligently
   * @param {string} text - The large text content
   * @returns {Promise<Object>} - Processed response
   */
  async _processLargeDocument(text) {
    const CHUNK_SIZE = 12000
    const OVERLAP_SIZE = 1000 // Overlap between chunks to maintain context
    
    console.log(`📚 Processing large document (${text.length} chars) with intelligent chunking`)
    
    // Validate input
    if (!text || typeof text !== 'string') {
      throw new Error('Invalid text input for chunking')
    }
    
    if (text.length > 1000000) { // 1MB limit
      console.log('⚠️ Extremely large document, truncating to 1MB')
      text = text.substring(0, 1000000)
    }
    
    // Create chunks with overlap
    const chunks = []
    let startIndex = 0
    let iterationCount = 0
    const MAX_ITERATIONS = 50 // More reasonable safety limit
    
    while (startIndex < text.length && iterationCount < MAX_ITERATIONS) {
      const endIndex = Math.min(startIndex + CHUNK_SIZE, text.length)
      const chunk = text.substring(startIndex, endIndex)
      
      if (chunk.length > 0) {
        chunks.push(chunk)
      }
      
      // Move start position forward, but with overlap
      // Fix: ensure we always make progress
      const nextStart = endIndex - OVERLAP_SIZE
      if (nextStart <= startIndex) {
        // If we're not making progress, skip ahead
        startIndex = endIndex
      } else {
        startIndex = nextStart
      }
      
      if (startIndex >= text.length) break
      
      iterationCount++
    }
    
    if (iterationCount >= MAX_ITERATIONS) {
      console.log('⚠️ Hit iteration limit during chunking, proceeding with current chunks')
    }
    
    console.log(`📄 Created ${chunks.length} chunks for processing`)
    
    // Process first chunk to get the structure
    console.log('🔍 Processing first chunk to establish document structure...')
    
    const firstChunkPrompt = `${this.defaultPrompt}
    
IMPORTANT: This is a large document that has been split into chunks. This is chunk 1 of ${chunks.length}.
Extract as much information as possible from this chunk, but note that some information may be in subsequent chunks.
Focus on identifying the document type, supplier information, and any line items present in this chunk.

Document Content (Chunk 1/${chunks.length}):\n${chunks[0]}`
    
    let firstResponse
    try {
      firstResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: firstChunkPrompt }],
        max_tokens: 4000,
        temperature: 0.1
      })
    } catch (error) {
      console.error('❌ Failed to process first chunk:', error.message)
      // Fallback to truncated version of entire document
      const truncatedText = text.substring(0, 8000) + '\n\n[Document truncated due to length]'
      return await this._processWithOpenAI(truncatedText)
    }
    
    // If we only have one chunk or first chunk failed, return first response
    if (chunks.length === 1) {
      console.log('✅ Single chunk processing completed')
      return firstResponse
    }
    
    // For now, return the first chunk result
    // In the future, we could implement more sophisticated chunk merging
    console.log('✅ Large document processing completed (using first chunk result)')
    console.log('💡 Note: Full multi-chunk processing can be implemented for better accuracy')
    
    return firstResponse
  }

  // ==========================================
  // DEPRECATED: AI Image Generation Removed
  // Image sourcing now relies exclusively on Google Images
  // ==========================================

  /**
   * @deprecated AI image generation has been removed to reduce costs
   * Use Google Images search instead via imageProcessingService
   */
  async generateProductImage(prompt, options = {}) {
    console.warn('⚠️ generateProductImage is deprecated - use Google Images search instead')
    return `https://via.placeholder.com/400x400/f0f0f0/999999?text=${encodeURIComponent('Use Google Images')}`
  }

  /**
   * @deprecated AI image generation has been removed to reduce costs
   */
  async generateProductImageVariations(basePrompt, count = 2, options = {}) {
    console.warn('⚠️ generateProductImageVariations is deprecated - use Google Images search instead')
    return []
  }

  /**
   * @deprecated AI image generation has been removed
   */
  generateProductImagePrompt(productData) {
    console.warn('⚠️ generateProductImagePrompt is deprecated')
    return ''
  }
}

// Export singleton instance
export const enhancedAIService = new EnhancedAIService()