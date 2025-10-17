/**
 * Enhanced AI Parsing Service with Confidence Handling
 * 
 * Integrates with error handling service for proper confidence threshold management
 */

import OpenAI from 'openai'
import { errorHandlingService, CONFIDENCE_THRESHOLDS } from './errorHandlingService.js'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 65000, // 65 second timeout (allows 60s Vision API + 5s buffer)
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

Return the data in this JSON format ONLY (do not wrap in markdown code blocks):
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
      
      // Store progressHelper for use in chunk processing
      this.progressHelper = options.progressHelper || null
      
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
        // For images, use vision API with adaptive timeout based on file size
        console.log(`📊 Processing image with vision API...`)
        console.log(`📊 Image size: ${fileContent.length} bytes`)
        console.log(`📊 MIME type: ${fileType.mimeType}`)
        
        try {
          // 🎯 ADAPTIVE TIMEOUT: Scale based on file size
          // Base: 90s for files under 100KB (increased from 60s based on production data)
          // Add 15s per 100KB for larger files, cap at 180s (3 minutes)
          const fileSizeMB = fileContent.length / (1024 * 1024)
          const baseTimeout = 90000 // 90 seconds base (50% increase for API latency)
          const additionalTimeout = Math.min(
            Math.floor(fileContent.length / (100 * 1024)) * 15000, // 15s per 100KB (50% increase)
            90000 // Cap additional time at 90s (max total 180s)
          )
          const adaptiveTimeout = baseTimeout + additionalTimeout
          
          console.log(`⏱️ Adaptive timeout: ${adaptiveTimeout}ms (${(adaptiveTimeout / 1000).toFixed(1)}s) for ${fileSizeMB.toFixed(2)}MB image`)
          
          // Create AbortController for proper request cancellation
          const controller = new AbortController()
          let timeoutId
          
          // 📊 METRIC TRACKING: Start timing the Vision API call
          const visionStartTime = Date.now()
          
          // Create timeout that actually aborts the request
          const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
              const duration = Date.now() - visionStartTime
              console.log(`⏰ Vision API timeout reached (${adaptiveTimeout}ms), aborting request after ${duration}ms...`)
              controller.abort()
              reject(new Error(`VISION_API_TIMEOUT:${duration}`)) // Include duration in error
            }, adaptiveTimeout)
          })
          
          // Create API call promise with abort signal
          const apiCallPromise = openai.chat.completions.create({
            model: "gpt-4o-mini", // Optimized: faster and cheaper for text extraction
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: this.defaultPrompt },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${fileType.mimeType};base64,${fileContent.toString('base64')}`,
                      detail: "low" // Optimized: 10x faster, 85% cheaper, excellent for text extraction
                    }
                  }
                ]
              }
            ],
            max_tokens: 8000, // Optimized: sufficient for 50+ line items, faster response
            temperature: 0 // Set to 0 for deterministic extraction (same image → same result)
          }, {
            signal: controller.signal // Enable request cancellation
          })
          
          console.log(`⏳ Waiting for vision API response (${adaptiveTimeout}ms timeout with abort)...`)
          response = await Promise.race([apiCallPromise, timeoutPromise])
          clearTimeout(timeoutId) // Clear timeout if API completes successfully
          
          // 📊 METRIC: Log successful completion time
          const visionDuration = Date.now() - visionStartTime
          console.log(`✅ Vision API response received successfully in ${visionDuration}ms (${(visionDuration / 1000).toFixed(1)}s)`)
          console.log(`📊 Performance: ${fileSizeMB.toFixed(2)}MB processed in ${(visionDuration / 1000).toFixed(1)}s = ${(fileSizeMB / (visionDuration / 1000)).toFixed(2)}MB/s`)
          
          // 🚨 METRIC: Warn if approaching timeout threshold (>80%)
          if (visionDuration > adaptiveTimeout * 0.8) {
            console.warn(`⚠️ Vision API took ${(visionDuration / adaptiveTimeout * 100).toFixed(1)}% of timeout budget - consider optimizing image`)
          }
          
        } catch (error) {
          console.error('❌ Vision API call failed:', error.message)
          
          // 📊 METRIC: Log failure timing
          if (error.message.startsWith('VISION_API_TIMEOUT:')) {
            const duration = error.message.split(':')[1]
            console.error(`⏱️ Vision API timeout metrics: ${duration}ms elapsed`)
          }
          
          if (error.message.includes('timeout') || error.message.includes('VISION_API_TIMEOUT') || error.name === 'AbortError') {
            // Mark as retryable timeout error for orchestrator to handle
            const timeoutError = new Error(`Vision API timed out. Image processing took too long.`)
            timeoutError.retryable = true // Flag for auto-retry
            timeoutError.stage = 'ai_parsing'
            throw timeoutError
          }
          throw error
        }
        
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
          max_tokens: 16000, // Increased to handle large POs with 50+ line items
          temperature: 0 // Set to 0 for deterministic extraction
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
          // Strip JavaScript-style comments from JSON (AI sometimes adds them)
          let jsonString = jsonMatch[0]
          // Remove single-line comments: // comment
          jsonString = jsonString.replace(/\/\/.*$/gm, '')
          // Remove multi-line comments: /* comment */
          jsonString = jsonString.replace(/\/\*[\s\S]*?\*\//g, '')
          // Remove trailing commas before closing brackets (common AI mistake)
          jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1')
          
          parsedResult = JSON.parse(jsonString)
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
        aiModel: 'gpt-4o-mini' // Optimized model for all document processing
      }
    }

    // CRITICAL: Add top-level model field for database persistence
    enhanced.model = 'gpt-4o-mini' // Optimized model used for all processing (text and images)

    // Validate confidence score - convert to nested structure if needed
    let confidenceValue = 0.5 // Default
    
    if (typeof result.confidence === 'number') {
      confidenceValue = result.confidence
    } else if (typeof result.confidence === 'object' && result.confidence?.overall) {
      confidenceValue = result.confidence.overall
    }
    
    // Normalize confidence to 0-1 range if it's in 0-100 range
    if (confidenceValue > 1) {
      confidenceValue = confidenceValue / 100
    }
    
    // Ensure confidence is valid
    if (confidenceValue < 0 || confidenceValue > 1 || isNaN(confidenceValue)) {
      console.warn(`⚠️ Invalid confidence score for workflow ${workflowId}, defaulting to 0.5`)
      confidenceValue = 0.5
    }
    
    // Store both formats for compatibility
    enhanced.confidence = {
      overall: Math.round(confidenceValue * 100), // Store as percentage (0-100)
      normalized: confidenceValue // Store as decimal (0-1)
    }

    // Add quality assessment
    enhanced.qualityAssessment = this.assessDocumentQuality(result)
    
    // Add extraction completeness score
    enhanced.completenessScore = this.calculateCompletenessScore(result.extractedData)
    
    // Adjust confidence based on quality indicators (pass normalized value)
    const adjustedConfidenceNormalized = this.adjustConfidenceBasedOnQuality(
      confidenceValue, // Pass the normalized (0-1) value
      enhanced.qualityAssessment,
      enhanced.completenessScore
    )

    // Update confidence with adjusted values in both formats
    enhanced.confidence = {
      overall: Math.round(adjustedConfidenceNormalized * 100), // Store as percentage (0-100)
      normalized: adjustedConfidenceNormalized // Store as decimal (0-1)
    }

    console.log(`📊 AI parsing quality assessment for workflow ${workflowId}:`)
    console.log(`  Original confidence: ${Math.round(confidenceValue * 100)}%`)
    console.log(`  Adjusted confidence: ${enhanced.confidence.overall}%`)
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
    // Create AbortController for proper request cancellation
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      console.log('⏰ Vision API reprocess timeout reached (60s), aborting request...')
      controller.abort()
    }, 60000)
    
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Optimized: faster and cheaper for text extraction
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
                  detail: "low" // Optimized: 10x faster, 85% cheaper, excellent for text extraction
                }
              }
            ]
          }
        ],
        max_tokens: 8000, // Optimized: sufficient for 50+ line items, faster response
        temperature: 0 // Changed from 0.3 - we want accuracy, not "different perspective"
      }, {
        signal: controller.signal // Enable request cancellation
      })
      
      clearTimeout(timeoutId)
      
      // Process result similar to main parsing
      const aiResponse = response.choices[0]?.message?.content
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
      
      // Strip JavaScript-style comments from JSON (AI sometimes adds them)
      let jsonString = jsonMatch[0]
      jsonString = jsonString.replace(/\/\/.*$/gm, '') // Remove single-line comments
      jsonString = jsonString.replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
      jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
      
      const parsedResult = JSON.parse(jsonString)
      
      return await this.enhanceAIResult(parsedResult, workflowId)
    } catch (error) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        throw new Error('Vision API reprocess timed out after 60 seconds')
      }
      throw error
    }
  }

  /**
   * Strip markdown code blocks from OpenAI response
   * OpenAI sometimes wraps JSON in ```json ... ``` blocks
   * @param {string} content - The content from OpenAI
   * @returns {string} - Clean JSON string
   */
  _stripMarkdownCodeBlocks(content) {
    if (!content) return '{}'
    
    // Remove markdown code blocks: ```json ... ``` or ``` ... ```
    let cleaned = content.trim()
    
    // Match ```json or ``` at the start
    if (cleaned.startsWith('```')) {
      // Remove opening fence (```json\n or ```\n)
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '')
      // Remove closing fence (\n```)
      cleaned = cleaned.replace(/\n?```\s*$/, '')
    }
    
    return cleaned.trim()
  }

  /**
   * Process text with OpenAI API with enhanced timeout, retry logic, and chunking
   * @param {string} text - The text content to process
   * @returns {Promise<Object>} - OpenAI API response
   */
  async _processWithOpenAI(text) {
    const MAX_RETRIES = 3
  const CHUNK_SIZE = 3200 // Smaller chunks to reduce model truncation on large line-item tables
    const BASE_DELAY = 5000 // 5 second base delay for retries
    
    // Determine if we need to chunk the content
    const needsChunking = text.length > CHUNK_SIZE
    
    if (needsChunking) {
      console.log(`📄 Large document detected (${text.length} chars > ${CHUNK_SIZE}), using chunking strategy`)
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
          max_tokens: 16000, // Increased to handle large POs with 50+ line items
          temperature: 0 // Set to 0 for deterministic extraction
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
  const CHUNK_SIZE = 3200 // Match the threshold in _processWithOpenAI (smaller chunks prevent 20-item cap)
  const OVERLAP_SIZE = 400 // Maintain coverage while limiting chunk size
    
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
    
    // 📊 Progress: Chunking complete (20% of AI stage, 8% global)
    if (this.progressHelper) {
      await this.progressHelper.publishSubStageProgress(
        100,
        10, // Chunking is 10-20% of AI stage
        10, // 10% range
        `Created ${chunks.length} chunks for AI processing`,
        { chunkCount: chunks.length, totalChars: text.length }
      )
    }
    
    // Process first chunk to get the structure
    console.log('🔍 Processing first chunk to establish document structure...')
    
  const firstChunkPrompt = `${this.defaultPrompt}
    
IMPORTANT: This is a large document that has been split into chunks. This is chunk 1 of ${chunks.length}.
Extract as much information as possible from this chunk, but note that some information may be in subsequent chunks.
Focus on identifying the document type, supplier information, and every line item present in this chunk.
There is no cap on the number of line items—include ALL items you find, even if there are more than five. Do not summarize or omit items.

Document Content (Chunk 1/${chunks.length}):\n${chunks[0]}`
    
    let firstResponse
    try {
      // 📊 Progress: Processing first chunk (20-30% of AI stage, 8-12% global)
      if (this.progressHelper) {
        await this.progressHelper.publishSubStageProgress(
          5,
          20, // OpenAI processing is 20-80% of AI stage
          60, // 60% range
          `Processing chunk 1/${chunks.length} with OpenAI API`,
          { currentChunk: 1, totalChunks: chunks.length }
        )
      }
      
      firstResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: firstChunkPrompt }],
        max_tokens: 16000, // Increased to handle large POs with 50+ line items
        temperature: 0 // Set to 0 for deterministic extraction
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
    
    // Process remaining chunks to collect all line items
    console.log(`🔄 Processing remaining ${chunks.length - 1} chunks to collect all line items...`)
    
    const allLineItems = []
    
    // Extract line items from first chunk
    try {
      const rawContent = firstResponse.choices[0]?.message?.content || '{}'
      const cleanContent = this._stripMarkdownCodeBlocks(rawContent)
      const firstResult = JSON.parse(cleanContent)
      if (firstResult.lineItems && Array.isArray(firstResult.lineItems)) {
        allLineItems.push(...firstResult.lineItems)
        console.log(`📋 First chunk: extracted ${firstResult.lineItems.length} line items`)
        
        // 📊 Progress: First chunk complete
        if (this.progressHelper) {
          const chunkProgress = (1 / chunks.length) * 100
          await this.progressHelper.publishSubStageProgress(
            chunkProgress,
            20, // OpenAI processing is 20-80% of AI stage
            60, // 60% range
            `Chunk 1/${chunks.length} complete: extracted ${firstResult.lineItems.length} items`,
            { 
              currentChunk: 1, 
              totalChunks: chunks.length, 
              itemsExtracted: firstResult.lineItems.length,
              totalItems: allLineItems.length
            }
          )
        }
      }
    } catch (error) {
      console.warn('⚠️ Could not parse first chunk response, will try other chunks')
      console.warn('⚠️ Parse error:', error.message)
    }
    
    // Process subsequent chunks to extract additional line items
    for (let i = 1; i < chunks.length; i++) {
      console.log(`🔍 Processing chunk ${i + 1}/${chunks.length}...`)
      
      // 📊 Progress: Processing chunk i+1
      if (this.progressHelper) {
        const chunkProgress = ((i + 0.5) / chunks.length) * 100
        await this.progressHelper.publishSubStageProgress(
          chunkProgress,
          20, // OpenAI processing is 20-80% of AI stage
          60, // 60% range
          `Processing chunk ${i + 1}/${chunks.length} with OpenAI API`,
          { currentChunk: i + 1, totalChunks: chunks.length }
        )
      }
      
  const chunkPrompt = `Extract ONLY the line items from this portion of a purchase order document.
This is chunk ${i + 1} of ${chunks.length} from a larger document.
Return a JSON object with a "lineItems" array containing every product/item found in this chunk.
You must include every line item without any artificial limit—if 12 items exist, return all 12. Do not summarize, group, or omit items.
DO NOT wrap the JSON in markdown code blocks - return ONLY the raw JSON object.

Each line item should have: productCode, description, quantity, unitPrice, total. If a field is missing, set it to null instead of dropping the item.

Document Content (Chunk ${i + 1}/${chunks.length}):\n${chunks[i]}`
      
      try {
        const chunkResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: chunkPrompt }],
          max_tokens: 16000, // Increased to handle large POs with 50+ line items
          temperature: 0 // Set to 0 for deterministic extraction
        })
        
        const rawChunkContent = chunkResponse.choices[0]?.message?.content || '{}'
        const cleanChunkContent = this._stripMarkdownCodeBlocks(rawChunkContent)
        const chunkResult = JSON.parse(cleanChunkContent)
        
        if (chunkResult.lineItems && Array.isArray(chunkResult.lineItems)) {
          allLineItems.push(...chunkResult.lineItems)
          console.log(`📋 Chunk ${i + 1}: extracted ${chunkResult.lineItems.length} line items (total: ${allLineItems.length})`)
          
          // 📊 Progress: Chunk complete
          if (this.progressHelper) {
            const chunkProgress = ((i + 1) / chunks.length) * 100
            await this.progressHelper.publishSubStageProgress(
              chunkProgress,
              20, // OpenAI processing is 20-80% of AI stage
              60, // 60% range
              `Chunk ${i + 1}/${chunks.length} complete: extracted ${chunkResult.lineItems.length} items`,
              { 
                currentChunk: i + 1, 
                totalChunks: chunks.length, 
                itemsExtracted: chunkResult.lineItems.length,
                totalItems: allLineItems.length
              }
            )
          }
        }
        
        // Add small delay between API calls to avoid rate limiting
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
        
      } catch (error) {
        console.warn(`⚠️ Failed to process chunk ${i + 1}:`, error.message)
        // Continue with other chunks even if one fails
      }
    }
    
    // Merge the results - use first chunk structure but with all line items
    try {
      // 📊 Progress: Merging results (80-90% of AI stage, 32-36% global)
      if (this.progressHelper) {
        await this.progressHelper.publishSubStageProgress(
          50,
          80, // Merging is 80-90% of AI stage
          10, // 10% range
          `Merging ${allLineItems.length} items from ${chunks.length} chunks`,
          { totalItems: allLineItems.length, chunkCount: chunks.length }
        )
      }
      
      const rawFinalContent = firstResponse.choices[0]?.message?.content || '{}'
      const cleanFinalContent = this._stripMarkdownCodeBlocks(rawFinalContent)
      const finalResult = JSON.parse(cleanFinalContent)
      
      // Replace line items with the complete merged set
      if (allLineItems.length > 0) {
        finalResult.lineItems = allLineItems

        // Ensure nested extractedData structure reflects the full set
        if (finalResult.extractedData && typeof finalResult.extractedData === 'object') {
          // Ensure downstream consumers reading extractedData.lineItems see the merged list
          finalResult.extractedData.lineItems = allLineItems

          // Maintain legacy alias when some code paths expect extractedData.items
          finalResult.extractedData.items = allLineItems
        }

        console.log(`✅ Multi-chunk processing complete: merged ${allLineItems.length} total line items`)
        
        // 📊 Progress: Merging complete (90% of AI stage, 36% global)
        if (this.progressHelper) {
          await this.progressHelper.publishSubStageProgress(
            100,
            80, // Merging is 80-90% of AI stage
            10, // 10% range
            `Merged ${allLineItems.length} items successfully`,
            { totalItems: allLineItems.length, chunkCount: chunks.length }
          )
        }
      }
      
      // Create a new response object with the merged content
      const mergedResponse = {
        ...firstResponse,
        choices: [{
          ...firstResponse.choices[0],
          message: {
            ...firstResponse.choices[0].message,
            content: JSON.stringify(finalResult, null, 2)
          }
        }]
      }
      
      return mergedResponse
      
    } catch (error) {
      console.error('❌ Failed to merge chunk results:', error.message)
      console.log('⚠️ Falling back to first chunk result')
      return firstResponse
    }
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
