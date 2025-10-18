/**
 * Enhanced AI Parsing Service with Confidence Handling
 * 
 * Integrates with error handling service for proper confidence threshold management
 */

import OpenAI from 'openai'
import { errorHandlingService, CONFIDENCE_THRESHOLDS } from './errorHandlingService.js'
import { extractAnchors } from './anchorExtractor.js'
import { productConsolidationService } from './productConsolidationService.js'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 65000, // 65 second timeout (allows 60s Vision API + 5s buffer)
  maxRetries: 2 // Enable automatic retries with exponential backoff
})

export class EnhancedAIService {
  constructor() {
    this.optimizedPrompt = 'You are StockIt AI, a purchase-order extraction engine. Always respond by calling the extract_purchase_order function. Populate every field you can find, use null when data is missing, and include every line item without truncation. IMPORTANT: Products may span multiple text lines (description on one line, SKU on next line, pricing on another). Group these lines into a single line item. Each product should have ONE entry with description, SKU, quantity, and prices combined.\n\nCRITICAL QUANTITY RULES:\n1. The "quantity" field MUST be the total units ordered (e.g., "Case of 12" means quantity=12, NOT 1)\n2. Extract case/pack quantities: "Case of 24"→24, "18 ct"→18, "Pack of 6"→6, "12-Pack"→12\n3. Keep full product name (including "Case of 12") in description field\n4. Only use quantity=1 if no pack/case quantity is mentioned'
    this.chunkLineItemPrompt = 'You extract purchase-order line items. Each product may span 2-4 text lines (e.g., product name, then SKU line, then quantity/price line). Combine these lines into ONE line item entry. Only call extract_po_line_items once per distinct product, not once per text line. A product is complete when it has description, SKU (if present), quantity, unit price, and total. Never create separate entries for SKU lines or price lines alone.\n\nCRITICAL QUANTITY RULES:\n1. Extract the TOTAL units from pack quantities: "Case of 12"→12, "24 ct"→24, "6-Pack"→6\n2. Keep full product description including the pack info\n3. Default to quantity=1 only if no pack/case/count is mentioned'
    this.defaultPrompt = this.optimizedPrompt
    this.chunkingConfig = {
      maxChunkChars: 4200,
      minChunkChars: 800,
      overlapChars: 180,
      maxIterations: 120,
      maxChunks: 60
    }

    this.segmentPrompts = {
      header: 'Header section below contains supplier/buyer metadata, purchase order identifiers, and key dates. Prioritize this when populating header fields.',
      lineItems: 'Line item section below lists product rows. Capture every row, including partial lines, and do not summarize.',
      totals: 'Totals section below includes subtotal, tax, shipping, and grand totals. Use these values to populate monetary fields.'
    }

    this.segmentLimits = {
      maxLineItemBlocks: 4,
      headerFallbackLines: 12,
      totalsFallbackLines: 8
    }

    const fewShotExampleOneArguments = JSON.stringify({
      confidence: 0.9,
      extractedData: {
        poNumber: 'PO12345',
        supplier: {
          name: 'Acme Industrial'
        },
        lineItems: [
          {
            description: 'Widget A - Case of 12',
            quantity: 12,
            unitPrice: '3.25',
            total: '39.00'
          }
        ],
        totals: {
          subtotal: '39.00',
          tax: '3.51',
          total: '42.51'
        },
        dates: {
          orderDate: '2025-02-18'
        },
        notes: null
      },
      fieldConfidences: {
        poNumber: 0.92,
        supplier: 0.88,
        totals_total: 0.9
      },
      qualityIndicators: {},
      issues: [],
      suggestions: []
    })

    const fewShotExampleTwoArguments = JSON.stringify({
      confidence: 0.82,
      extractedData: {
        poNumber: 'PO-A55',
        supplier: {
          name: 'GreenGrocer Collective',
          address: '221B Market St, Springfield'
        },
        lineItems: [
          {
            description: 'Organic Kale - 24 ct',
            quantity: 24,
            unitPrice: '2.10',
            total: '50.40'
          }
        ],
        totals: {
          subtotal: '50.40',
          shipping: '5.00',
          total: '55.40'
        },
        dates: {
          orderDate: '2025-01-19',
          expectedDelivery: null
        },
        notes: null
      },
      fieldConfidences: {
        poNumber: 0.84,
        totals_total: 0.83,
        dates_orderDate: 0.8
      },
      qualityIndicators: {},
      issues: [],
      suggestions: []
    })

    this.fewShotMessages = [
      {
        role: 'user',
        content: 'Sample purchase order snippet:\nPO#12345 Supplier:Acme Industrial Date:2025-02-18\nLine Items:\nWidget A | 4 | 3.25 | 13.00\nTotals:\nSubtotal:13.00\nTax:1.17\nTotal:14.17'
      },
      {
        role: 'assistant',
        name: 'extract_purchase_order',
        content: null,
        function_call: {
          name: 'extract_purchase_order',
          arguments: fewShotExampleOneArguments
        }
      },
      {
        role: 'user',
        content: 'Sample purchase order snippet:\nPO#PO-A55 Supplier:GreenGrocer Collective Date:2025-01-19\nLine Items:\nOrganic Kale | 8 | 2.10 | 16.80\nShip To:221B Market St\nTotals:\nSubtotal:16.80\nShipping:5.00\nTotal:21.80'
      },
      {
        role: 'assistant',
        name: 'extract_purchase_order',
        content: null,
        function_call: {
          name: 'extract_purchase_order',
          arguments: fewShotExampleTwoArguments
        }
      }
    ]
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

  getStructuredOutputSchema() {
    return {
      name: 'extract_purchase_order',
      description: 'Extract structured purchase order data from the provided document.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          confidence: {
            type: 'number',
            description: 'Overall confidence in the extraction, expressed between 0 and 1.',
            minimum: 0,
            maximum: 1
          },
          extractedData: {
            type: 'object',
            additionalProperties: true,
            properties: {
              poNumber: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              supplier: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  name: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                  address: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                  contact: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                  email: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                  phone: { anyOf: [{ type: 'string' }, { type: 'null' }] }
                }
              },
              lineItems: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: true,
                  properties: {
                    productCode: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                    description: { 
                      anyOf: [{ type: 'string' }, { type: 'null' }],
                      description: 'Full product name including pack/case info (e.g., "Product Name - Case of 12")'
                    },
                    quantity: { 
                      anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'null' }],
                      description: 'TOTAL units ordered. Extract from patterns: "Case of 12"→12, "24 ct"→24, "6-Pack"→6. Only use 1 if no pack quantity mentioned.'
                    },
                    unitPrice: { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'null' }] },
                    total: { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'null' }] },
                    sku: { anyOf: [{ type: 'string' }, { type: 'null' }] }
                  }
                }
              },
              dates: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  orderDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                  expectedDelivery: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                  invoiceDate: { anyOf: [{ type: 'string' }, { type: 'null' }] }
                }
              },
              totals: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  subtotal: { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'null' }] },
                  tax: { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'null' }] },
                  shipping: { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'null' }] },
                  total: { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'null' }] }
                }
              },
              notes: { anyOf: [{ type: 'string' }, { type: 'null' }] }
            },
            required: ['lineItems']
          },
          fieldConfidences: {
            type: 'object',
            additionalProperties: { type: 'number' },
            description: 'Per-field confidence scores (0-1).'
          },
          qualityIndicators: {
            type: 'object',
            additionalProperties: true,
            properties: {
              imageClarity: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              textLegibility: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              documentCompleteness: { anyOf: [{ type: 'string' }, { type: 'null' }] }
            }
          },
          issues: {
            type: 'array',
            items: { type: 'string' }
          },
          suggestions: {
            type: 'array',
            items: { type: 'string' }
          }
        },
        required: ['confidence', 'extractedData', 'fieldConfidences', 'qualityIndicators', 'issues', 'suggestions']
      }
    }
  }

  getLineItemSchema() {
    return {
      name: 'extract_po_line_items',
      description: 'Extract every purchase-order line item present in the provided chunk.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          lineItems: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: true,
              properties: {
                productCode: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                description: { 
                  anyOf: [{ type: 'string' }, { type: 'null' }],
                  description: 'Full product description with pack info intact'
                },
                quantity: { 
                  anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'null' }],
                  description: 'TOTAL units: extract from "Case of 12"→12, "18 ct"→18, etc.'
                },
                unitPrice: { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'null' }] },
                total: { anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'null' }] }
              }
            }
          },
          issues: {
            type: 'array',
            items: { type: 'string' }
          }
        },
        required: ['lineItems']
      }
    }
  }

  _parseStructuredResponse(response) {
    const message = this._getResponseMessage(response)
    if (!message) {
      throw new Error('No message returned from AI service')
    }

    if (message.function_call?.arguments) {
      const rawArgs = message.function_call.arguments
      const sanitized = this._removeJsonComments(rawArgs)
      if (!sanitized) {
        throw new Error('AI response arguments were empty')
      }
      return JSON.parse(sanitized)
    }

    if (message.content) {
      const cleaned = this._stripMarkdownCodeBlocks(message.content)
      const sanitized = this._removeJsonComments(cleaned)
      if (!sanitized) {
        throw new Error('AI response content was empty')
      }
      return JSON.parse(sanitized)
    }

    throw new Error('AI response did not include structured data')
  }

  _removeJsonComments(jsonString) {
    if (typeof jsonString !== 'string') {
      return ''
    }

    return jsonString
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/,(\s*[}\]])/g, '$1')
      .trim()
  }

  _getResponseMessage(response) {
    return response?.choices?.[0]?.message || null
  }

  _looksLikeInvalidPurchaseOrder(content) {
    const normalized = content.toLowerCase()
    return normalized.includes('not a purchase order') ||
      normalized.includes('unable to extract') ||
      normalized.includes('does not appear to be') ||
      normalized.includes('invalid purchase order')
  }

  _buildInvalidPurchaseOrderResult(notes) {
    return {
      confidence: 0,
      extractedData: {
        poNumber: null,
        supplier: { name: 'N/A' },
        lineItems: [],
        dates: {},
        totals: {},
        notes
      },
      fieldConfidences: {
        poNumber: 0,
        supplier: 0,
        lineItems: 0
      },
      qualityIndicators: {
        imageClarity: 'high',
        textLegibility: 'high',
        documentCompleteness: 'invalid_document_type'
      },
      issues: ['Document is not a valid purchase order'],
      suggestions: ['Please upload a valid purchase order document']
    }
  }

  _createChunkPlan(text, overrides = {}) {
    const config = {
      maxChunkChars: this.chunkingConfig.maxChunkChars,
      minChunkChars: this.chunkingConfig.minChunkChars,
      overlapChars: this.chunkingConfig.overlapChars,
      maxIterations: this.chunkingConfig.maxIterations,
      maxChunks: this.chunkingConfig.maxChunks,
      ...overrides
    }

    const totalLength = typeof text === 'string' ? text.length : 0
    if (!text || typeof text !== 'string' || totalLength === 0) {
      return []
    }

    try {
      const intelligentPlan = this._createIntelligentChunkPlan(text, config)
      if (intelligentPlan.length === 0) {
        return this._createSimpleChunkPlan(text, config)
      }

      const maxChunks = config.maxChunks || this.chunkingConfig.maxChunks
      if (intelligentPlan.length > maxChunks) {
        console.warn(`⚠️ Intelligent chunk plan produced ${intelligentPlan.length} chunks (> ${maxChunks}). Falling back to simple chunking.`)
        return this._createSimpleChunkPlan(text, config)
      }

      return intelligentPlan
    } catch (error) {
      console.warn('⚠️ Intelligent chunking failed, falling back to simple chunking:', error.message)
      return this._createSimpleChunkPlan(text, config)
    }
  }

  _summarizeChunkPlan(plan, totalChars) {
    if (!plan || plan.length === 0) {
      return { chunkCount: 0, totalChars }
    }

    const lengths = plan.map(chunk => chunk.length)
    const tokens = plan.map(chunk => chunk.estimatedTokens || this._estimateTokenCount(chunk.length))
    const totalChunkChars = lengths.reduce((sum, value) => sum + value, 0)
    const totalEstimatedTokens = tokens.reduce((sum, value) => sum + value, 0)
    const averageChunkLength = Math.round(totalChunkChars / plan.length)

    return {
      chunkCount: plan.length,
      totalChars,
      averageChunkLength,
      minChunkLength: Math.min(...lengths),
      maxChunkLength: Math.max(...lengths),
      estimatedTokens: totalEstimatedTokens
    }
  }

  _createIntelligentChunkPlan(text, config) {
    const plan = []
    const totalLength = text.length
    const maxSize = Math.max(config.maxChunkChars || 3200, (config.minChunkChars || 600) + 200)
    const minChunk = Math.max(200, config.minChunkChars || 600)
    const baseOverlap = Math.max(0, config.overlapChars || 150)
    const maxIterations = Math.max(1, config.maxIterations || 60)

    let start = 0
    let iterations = 0

    while (start < totalLength && iterations < maxIterations) {
      iterations += 1
      const targetEnd = Math.min(start + maxSize, totalLength)
      let end = targetEnd

      if (end < totalLength) {
        end = this._findPreferredBreak(text, start, targetEnd, minChunk)
      }

      if (end <= start) {
        end = Math.min(start + maxSize, totalLength)
      }

      let chunkText = text.slice(start, end)

      if (chunkText.length < minChunk && plan.length > 0) {
        const previous = plan[plan.length - 1]
        previous.text += chunkText
        previous.end = end
        previous.length = previous.text.length
        start = end
        continue
      }

      const adaptiveOverlap = this._calculateAdaptiveOverlap(chunkText, baseOverlap)

      if (process.env.DEBUG_CHUNK_LINE_ITEMS === 'true') {
        const lastLines = chunkText.trim().split('\n').slice(-3)
        console.log(`[DEBUG CHUNKING] Chunk ${plan.length}:`)
        console.log(`  Ends with: "${lastLines.join(' | ')}"`)
        console.log(`  Overlap: ${adaptiveOverlap} (base: ${baseOverlap})${adaptiveOverlap !== baseOverlap ? ' ✓ REDUCED' : ''}`)
      }

      plan.push({
        index: plan.length,
        start,
        end,
        length: chunkText.length,
        text: chunkText,
        overlap: adaptiveOverlap,
        estimatedTokens: this._estimateTokenCount(chunkText.length)
      })

      if (end >= totalLength) {
        break
      }

      let nextStart = end - adaptiveOverlap
      if (nextStart <= start) {
        nextStart = end
      }
      start = Math.max(nextStart, start + 1)
    }

    if (!plan.length && totalLength > 0) {
      plan.push({
        index: 0,
        start: 0,
        end: totalLength,
        length: totalLength,
        text,
        overlap: 0,
        estimatedTokens: this._estimateTokenCount(totalLength)
      })
    }

    return plan
  }

  _createSimpleChunkPlan(text, config) {
    const plan = []
    const totalLength = text.length
    const maxSize = Math.max(config.maxChunkChars || 3200, 800)
    const overlap = Math.max(0, config.overlapChars || 150)
    let start = 0
    let index = 0

    while (start < totalLength) {
      const end = Math.min(start + maxSize, totalLength)
      const chunkText = text.slice(start, end)
      if (!chunkText.length) {
        break
      }

      plan.push({
        index,
        start,
        end,
        length: chunkText.length,
        text: chunkText,
        overlap,
        estimatedTokens: this._estimateTokenCount(chunkText.length)
      })

      if (end >= totalLength) {
        break
      }

      start = Math.max(end - overlap, start + 1)
      index += 1
    }

    return plan
  }

  _findPreferredBreak(text, start, targetEnd, minChunk) {
    const searchStart = Math.max(start + minChunk, targetEnd - 800)
    const searchEnd = targetEnd
    let bestBreak = start

    // First, try to find a product boundary
    const productBreak = this._findProductBoundary(text, searchStart, searchEnd)
    if (productBreak > searchStart) {
      return productBreak
    }

    // Fallback to line break
    const newlineBreak = text.lastIndexOf('\n', searchEnd - 1)
    if (newlineBreak >= searchStart) {
      bestBreak = newlineBreak + 1
      return bestBreak
    }

    // Fallback to space break
    const spaceBreak = text.lastIndexOf(' ', searchEnd - 1)
    if (spaceBreak >= searchStart) {
      bestBreak = spaceBreak + 1
      return bestBreak
    }

    // Fallback to pipe break
    const pipeBreak = text.lastIndexOf('|', searchEnd - 1)
    if (pipeBreak >= searchStart) {
      bestBreak = pipeBreak + 1
    }

    return bestBreak > start ? bestBreak : targetEnd
  }

  /**
   * Find a natural product boundary to split chunks
   * COMPREHENSIVE: Handles various receipt/PO formats, multi-line products, and international formats
   * 
   * Looks for patterns that indicate the end of a product line item:
   * - Lines ending with price totals (multiple currency formats)
   * - Blank lines
   * - SKU/product code patterns (various formats)
   * - Table headers/footers
   * - Multi-line product boundaries (description → SKU → price)
   */
  _findProductBoundary(text, searchStart, searchEnd) {
    const searchText = text.substring(searchStart, searchEnd)
    const lines = searchText.split('\n')
    
    const debugBoundary = String(process.env.DEBUG_CHUNK_LINE_ITEMS || '').toLowerCase() === 'true'
    
    // Comprehensive price patterns for international formats
    // IMPORTANT: Handles both normalized ($25.99) and spaced ($ 25 . 99) formats
    const pricePatterns = {
      // US/Canada: $ 25.99, $25.99, $ 1,234.56, $ 25 . 99 (with spaces from normalization)
      usd: /(?:\$|USD)\s*[\d\s,]+[.\s]+\d+\s*$/,
      // Europe: 25,99 €, 25.99 EUR, €25,99, 25 , 99 €
      eur: /(?:[\d\s.,]+\s*(?:€|EUR|eur)|(?:€|EUR)\s*[\d\s.,]+)\s*$/,
      // UK: £ 25.99, £25.99, £ 25 . 99, 25.99 GBP
      gbp: /(?:£|GBP)\s*[\d\s,]+[.\s]+\d+\s*$/,
      // Generic: just numbers 25.99, 1,234.56, 25 . 99
      generic: /[\d\s,]+[.,\s]+\d+\s*$/,
      // With decimals only: 25.00, 1234.56, 25 . 00
      decimal: /\d+\s*[.\s]+\s*\d+\s*$/
    }
    
    // Comprehensive product identifier patterns
    const identifierPatterns = {
      sku: /(?:SKU|sku|Sku)[\s:]*[\dA-Z-]+/,
      upc: /(?:UPC|upc|barcode|Barcode)[\s:]*\d{8,14}/,
      ean: /(?:EAN|ean)[\s:]*\d{8,13}/,
      itemCode: /(?:Item|item|Code|code|Product|product)[\s:#]*[\dA-Z-]+/,
      generic: /^[\s]*(?:SKU|UPC|EAN|Item|Code|Product|Barcode)[\s:#]/i
    }
    
    // Table header/footer patterns that indicate section boundaries
    const sectionPatterns = {
      header: /(?:items?|qty|quantity|price|total|subtotal|description|product).*(?:price|total|subtotal)/i,
      footer: /(?:subtotal|total|grand\s*total|tax|shipping|payment)/i,
      separator: /^[\s]*[-=_|*]{3,}\s*$/
    }
    
    // Search backwards through lines to find best boundary
    let cumulativePos = searchText.length
    let bestBoundary = null
    let bestScore = 0
    
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim()
      const prevLine = i > 0 ? lines[i - 1].trim() : ''
      const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : ''
      const next2Line = i < lines.length - 2 ? lines[i + 2].trim() : ''
      
      cumulativePos -= (lines[i].length + 1) // +1 for newline
      
      // Skip if we're too close to the end or invalid position
      if (cumulativePos < 0 || cumulativePos > searchText.length - 30) {
        continue
      }
      
      let score = 0
      let boundaryType = ''
      
      // === PRIORITY 1: Complete Multi-Line Product Boundary ===
      // Pattern: Description line → SKU line → Price line (break AFTER price)
      const hasPricePattern = Object.values(pricePatterns).some(p => p.test(line))
      const prevHasIdentifier = Object.values(identifierPatterns).some(p => p.test(prevLine))
      
      if (hasPricePattern && prevHasIdentifier) {
        // This looks like: [Description] → [SKU: 123] → [1 $25.99] ← BREAK HERE
        score = 100
        boundaryType = 'multi-line-complete'
        
        // Extra points if next line is blank or starts new product
        if (!nextLine || /^[A-Z\d]/.test(nextLine)) {
          score += 20
        }
      }
      
      // === PRIORITY 2: Blank Lines (Universal Separator) ===
      else if (!line && prevLine && i > 0) {
        score = 90
        boundaryType = 'blank-line'
      }
      
      // === PRIORITY 3: Section Headers/Footers ===
      else if (sectionPatterns.header.test(line) || sectionPatterns.footer.test(line)) {
        // Break BEFORE headers, AFTER footers
        const isHeader = sectionPatterns.header.test(line)
        score = 80
        boundaryType = isHeader ? 'section-header' : 'section-footer'
      }
      
      // === PRIORITY 4: Separator Lines ===
      else if (sectionPatterns.separator.test(line)) {
        score = 75
        boundaryType = 'separator-line'
      }
      
      // === PRIORITY 5: Price Line Endings ===
      else if (hasPricePattern) {
        // Line ends with price - likely end of product
        score = 70
        boundaryType = 'price-ending'
        
        // Boost score if followed by identifier or blank line
        if (!nextLine || Object.values(identifierPatterns).some(p => p.test(nextLine))) {
          score += 10
        }
        
        // Boost if followed by capital letter (new product name)
        if (/^[A-Z]/.test(nextLine)) {
          score += 5
        }
      }
      
      // === PRIORITY 6: Identifier Lines (might be mid-product) ===
      else if (Object.values(identifierPatterns).some(p => p.test(line))) {
        // SKU line - could break AFTER if followed by price
        if (Object.values(pricePatterns).some(p => p.test(nextLine))) {
          // Wait for next iteration to catch the price line
          score = 0
        } else if (!nextLine) {
          // End of text after SKU
          score = 50
          boundaryType = 'identifier-eof'
        } else {
          score = 30
          boundaryType = 'identifier-line'
        }
      }
      
      // === PRIORITY 7: Quantity-Price Pattern (new product starting) ===
      else if (/^\s*\d+\s+(?:\$|€|£|USD|EUR|GBP)/.test(line)) {
        // Line starts with "1 $25.99" - break BEFORE this (previous product ended)
        score = 60
        boundaryType = 'qty-price-start'
        cumulativePos -= 0 // Break before this line, not after
      }
      
      // === PRIORITY 8: Double Newlines ===
      else if (!line && !prevLine && i > 1) {
        score = 85
        boundaryType = 'double-blank'
      }
      
      // If this boundary is better than our current best, save it
      if (score > bestScore && score >= 50) {
        const breakPos = searchStart + cumulativePos + lines[i].length + 1
        bestBoundary = {
          position: breakPos,
          score,
          type: boundaryType,
          line: line.substring(0, 60)
        }
        bestScore = score
        
        // If we found a perfect boundary (score >= 100), stop searching
        if (score >= 100) {
          if (debugBoundary) {
            console.log(`[DEBUG BOUNDARY] Found perfect boundary (score ${score}): ${boundaryType}`)
          }
          break
        }
      }
    }
    
    if (bestBoundary && debugBoundary) {
      console.log(`[DEBUG BOUNDARY] Best: ${bestBoundary.type} (score: ${bestBoundary.score}) | "${bestBoundary.line}"`)
    }
    
    return bestBoundary ? bestBoundary.position : -1
  }

  /**
   * Calculate adaptive overlap based on chunk ending quality
   * SMART: Reduces overlap when we end at clean boundaries, increases when mid-product
   */
  _calculateAdaptiveOverlap(chunkText, baseOverlap) {
    const trimmed = chunkText.trimEnd()
    if (!trimmed.length) {
      return baseOverlap
    }

    const lines = trimmed.split('\n')
    if (lines.length < 2) {
      return baseOverlap
    }

    const lastLine = lines[lines.length - 1].trim()
    const secondLastLine = lines.length >= 2 ? lines[lines.length - 2].trim() : ''
    const thirdLastLine = lines.length >= 3 ? lines[lines.length - 3].trim() : ''
    
    const debugOverlap = String(process.env.DEBUG_CHUNK_LINE_ITEMS || '').toLowerCase() === 'true'
    
    // === MINIMAL OVERLAP (30-50 chars) - Clean boundaries ===
    
    // Blank line ending
    if (!lastLine) {
      if (debugOverlap) console.log(`[OVERLAP] Blank line → 30 chars (minimal)`)
      return 30
    }
    
    // Price patterns (international) - handles both compact and spaced formats
    const pricePatterns = [
      /(?:\$|USD)\s*[\d\s,]+[.\s]+\d+\s*$/,                    // $25.99, $ 25 . 99, $ 1,234.56
      /(?:[\d\s.,]+\s*(?:€|EUR)|(?:€|EUR)\s*[\d\s.,]+)\s*$/,  // 25,99 €, 25 . 99 €, €25.99
      /(?:£|GBP)\s*[\d\s,]+[.\s]+\d+\s*$/,                     // £25.99, £ 25 . 99
      /[\d\s,]+[.,\s]+\d+\s*$/                                 // 25.99, 25 . 99, 1.234,56
    ]
    
    const endsWithPrice = pricePatterns.some(p => p.test(lastLine))
    
    // Complete multi-line product (Description → SKU → Price)
    const hasIdentifierPrev = /(?:SKU|UPC|EAN|Item|Code|Product)[\s:#]/i.test(secondLastLine)
    if (endsWithPrice && hasIdentifierPrev) {
      if (debugOverlap) console.log(`[OVERLAP] Multi-line product complete → 30 chars`)
      return 30
    }
    
    // Simple price ending
    if (endsWithPrice) {
      if (debugOverlap) console.log(`[OVERLAP] Price ending → 40 chars`)
      return 40
    }
    
    // Section headers/footers
    const isSectionBoundary = /(?:items?|qty|quantity|price|total|subtotal|description|product).*(?:price|total|subtotal)/i.test(lastLine)
      || /(?:subtotal|total|grand\s*total|tax|shipping|payment)/i.test(lastLine)
    
    if (isSectionBoundary) {
      if (debugOverlap) console.log(`[OVERLAP] Section boundary → 40 chars`)
      return 40
    }
    
    // Separator lines
    if (/^[\s]*[-=_|*]{3,}\s*$/.test(lastLine)) {
      if (debugOverlap) console.log(`[OVERLAP] Separator line → 30 chars`)
      return 30
    }
    
    // === MODERATE OVERLAP (100-120 chars) - Uncertain boundaries ===
    
    // Identifier lines (might be mid-product)
    const hasIdentifier = /(?:SKU|UPC|EAN|Item|Code|Product)[\s:#]/i.test(lastLine)
    if (hasIdentifier) {
      // Next chunk might start with price, need moderate overlap
      if (debugOverlap) console.log(`[OVERLAP] Identifier line → 100 chars (moderate)`)
      return 100
    }
    
    // Short lines (might be partial)
    if (lastLine.length < 30) {
      if (debugOverlap) console.log(`[OVERLAP] Short line (${lastLine.length} chars) → 120 chars`)
      return 120
    }
    
    // === MAXIMUM OVERLAP (180+ chars) - Mid-product splits ===
    
    // Contains table separators mid-line
    const hasTableChars = /[|,\t]/.test(lastLine)
    const notFooter = !/(?:total|subtotal|tax|shipping)/i.test(lastLine)
    if (hasTableChars && notFooter && lastLine.length > 30) {
      // Likely split mid-table-row
      const overlap = Math.min(baseOverlap * 1.5, 250)
      if (debugOverlap) console.log(`[OVERLAP] Mid-table split → ${overlap} chars (high)`)
      return overlap
    }
    
    // Long line without clear ending pattern (might be description mid-line)
    if (lastLine.length > 60 && !endsWithPrice && !hasIdentifier) {
      if (debugOverlap) console.log(`[OVERLAP] Long line, unclear boundary → ${baseOverlap} chars (standard)`)
      return baseOverlap
    }
    
    // === DEFAULT: Standard overlap ===
    if (debugOverlap) console.log(`[OVERLAP] Default → ${baseOverlap} chars`)
    return baseOverlap
  }

  _estimateTokenCount(charCount) {
    if (!charCount || charCount <= 0) {
      return 0
    }
    return Math.max(1, Math.round(charCount / 4))
  }

  _buildFewShotMessages() {
    if (!this.fewShotMessages || this.fewShotMessages.length === 0) {
      return []
    }
    return this.fewShotMessages.map(message => JSON.parse(JSON.stringify(message)))
  }

  async _runTextPreprocessor(text, options = {}) {
    const { textPreprocessor } = await import('./textPreprocessor.js')
    return textPreprocessor.preprocess(text, options)
  }

  _runAnchorExtraction(text, anchorOptions = {}, { progressHelper } = {}) {
    const anchorResult = extractAnchors(text, anchorOptions)

    if (progressHelper) {
      const { snippets = [], stats = {} } = anchorResult
      if (snippets.length > 0) {
        progressHelper.publishSubStageProgress(
          100,
          12,
          5,
          `Anchor extraction kept ${snippets.length} slices (-${stats.reductionPercent}% tokens)`,
          {
            snippetCount: snippets.length,
            reductionPercent: stats.reductionPercent,
            anchorsMatched: stats.anchorsMatched
          }
        ).catch(error => {
          console.warn('⚠️ Failed to publish anchor extraction progress:', error.message)
        })
      }
    }

    return anchorResult
  }

  async _extractTextFromImage(fileContent, fileType, { progressHelper } = {}) {
    const fileSizeMB = fileContent.length / (1024 * 1024)
    const baseTimeout = 90000
    const additionalTimeout = Math.min(
      Math.floor(fileContent.length / (100 * 1024)) * 15000,
      90000
    )
    const adaptiveTimeout = baseTimeout + additionalTimeout

    const controller = new AbortController()
    let timeoutId
    const visionStartTime = Date.now()

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const duration = Date.now() - visionStartTime
        controller.abort()
        reject(new Error(`VISION_TEXT_TIMEOUT:${duration}`))
      }, adaptiveTimeout)
    })

    const apiCallPromise = openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You transcribe purchase order images into clean text. Return only plain text, preserving natural line breaks. Do not summarize or add commentary.'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Transcribe the purchase order image to text. Return only the raw text content.' },
            {
              type: 'image_url',
              image_url: {
                url: `data:${fileType.mimeType};base64,${fileContent.toString('base64')}`,
                detail: 'low'
              }
            }
          ]
        }
      ],
      max_tokens: 6000,
      temperature: 0
    }, {
      signal: controller.signal
    })

    let response
    try {
      response = await Promise.race([apiCallPromise, timeoutPromise])
    } finally {
      clearTimeout(timeoutId)
    }

    const durationMs = Date.now() - visionStartTime

    if (progressHelper) {
      progressHelper.publishSubStageProgress(
        90,
        8,
        6,
        `Vision text extraction completed in ${(durationMs / 1000).toFixed(1)}s`,
        {
          fileSizeMB: Number(fileSizeMB.toFixed(2)),
          durationMs
        }
      ).catch(error => {
        console.warn('⚠️ Failed to publish vision extraction progress:', error.message)
      })
    }

    const message = response?.choices?.[0]?.message
    let extractedText = ''
    if (Array.isArray(message?.content)) {
      extractedText = message.content.map(part => part.text || '').join('\n').trim()
    } else if (typeof message?.content === 'string') {
      extractedText = message.content.trim()
    }

    return {
      text: extractedText,
      durationMs
    }
  }

  _segmentDocument(text, anchorResult = null, fallbackSource = '') {
    if (!text) {
      return {
        header: '',
        lineItems: [],
        totals: '',
        fallback: fallbackSource || ''
      }
    }

    const headerAnchors = new Set(['po_number', 'invoice_number', 'supplier', 'ship_to', 'bill_to'])
    const totalsAnchors = new Set(['totals'])
    const lineItemAnchors = new Set(['line_items'])

    const headerSnippets = []
    const totalsSnippets = []
    const lineItemSnippets = []

    if (anchorResult?.snippets?.length) {
      for (const snippet of anchorResult.snippets) {
        if (headerAnchors.has(snippet.anchorId)) {
          headerSnippets.push(snippet.snippet)
        } else if (totalsAnchors.has(snippet.anchorId)) {
          totalsSnippets.push(snippet.snippet)
        } else if (lineItemAnchors.has(snippet.anchorId)) {
          lineItemSnippets.push(snippet.snippet)
        }
      }
    }

    const fallbackLines = (fallbackSource || text).split('\n')

    const headerText = headerSnippets.length
      ? headerSnippets.join('\n---\n')
      : fallbackLines.slice(0, this.segmentLimits.headerFallbackLines).join('\n')

    const totalsText = totalsSnippets.length
      ? totalsSnippets.join('\n')
      : fallbackLines
          .filter(line => /total|subtotal|balance|amount due/i.test(line))
          .slice(-this.segmentLimits.totalsFallbackLines)
          .join('\n')

    let lineItemBlocks = lineItemSnippets
    if (!lineItemBlocks.length) {
      const tableStartIndex = fallbackLines.findIndex(line => /qty|quantity/.test(line) && /price|amount/.test(line))
      if (tableStartIndex !== -1) {
        lineItemBlocks = [fallbackLines.slice(tableStartIndex, tableStartIndex + 25).join('\n')]
      }
    }

    const limitedLineItems = lineItemBlocks.slice(0, this.segmentLimits.maxLineItemBlocks)

    return {
      header: headerText.trim(),
      lineItems: limitedLineItems.map(block => block.trim()).filter(Boolean),
      totals: totalsText.trim(),
      fallback: fallbackSource || text
    }
  }

  _buildSegmentMessages(segments) {
    if (!segments) {
      return []
    }

    const messages = []

    if (segments.header) {
      messages.push({
        role: 'user',
        content: `HEADER SECTION (use for supplier/buyer metadata, PO numbers, and dates):\n${segments.header}`
      })
    }

    if (segments.lineItems && segments.lineItems.length) {
      segments.lineItems.forEach((block, index) => {
        const label = index + 1
        messages.push({
          role: 'user',
          content: `LINE ITEM SECTION ${label} (convert every row into line_items array entries):\n${block}`
        })
      })
    }

    if (segments.totals) {
      messages.push({
        role: 'user',
        content: `TOTALS SECTION (use for subtotal, tax, shipping, grand total):\n${segments.totals}`
      })
    }

    return messages
  }

  async _processImageWithVisionFallback(fileContent, fileType) {
    console.log('⚠️ Falling back to direct vision structured extraction')

    const fileSizeMB = fileContent.length / (1024 * 1024)
    const baseTimeout = 90000
    const additionalTimeout = Math.min(
      Math.floor(fileContent.length / (100 * 1024)) * 15000,
      90000
    )
    const adaptiveTimeout = baseTimeout + additionalTimeout

    const controller = new AbortController()
    let timeoutId
    const visionStartTime = Date.now()

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const duration = Date.now() - visionStartTime
        console.log(`⏰ Vision API timeout reached (${adaptiveTimeout}ms), aborting request after ${duration}ms...`)
        controller.abort()
        reject(new Error(`VISION_API_TIMEOUT:${duration}`))
      }, adaptiveTimeout)
    })

    const fallbackMessages = [
      {
        role: 'system',
        content: this.optimizedPrompt
      },
      ...this._buildFewShotMessages(),
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Purchase order document image attached. Extract every field and line item.' },
          {
            type: 'image_url',
            image_url: {
              url: `data:${fileType.mimeType};base64,${fileContent.toString('base64')}`,
              detail: 'low'
            }
          }
        ]
      }
    ]

    const apiCallPromise = openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: fallbackMessages,
      functions: [this.getStructuredOutputSchema()],
      function_call: { name: 'extract_purchase_order' },
      max_tokens: 8000,
      temperature: 0
    }, {
      signal: controller.signal
    })

    let response
    try {
      response = await Promise.race([apiCallPromise, timeoutPromise])
    } catch (error) {
      if (error.message.includes('timeout') || error.message.includes('VISION_API_TIMEOUT') || error.name === 'AbortError') {
        const timeoutDuration = error.message.split(':')[1]
        console.error(`⏱️ Vision API timeout metrics: ${timeoutDuration}ms elapsed`)
        const timeoutError = new Error('Vision API timed out. Image processing took too long.')
        timeoutError.retryable = true
        timeoutError.stage = 'ai_parsing'
        throw timeoutError
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }

    const visionDuration = Date.now() - visionStartTime
    console.log(`✅ Vision API fallback response received in ${visionDuration}ms (${(visionDuration / 1000).toFixed(1)}s) for ${fileSizeMB.toFixed(2)}MB image`)

    if (visionDuration > adaptiveTimeout * 0.8) {
      console.warn(`⚠️ Vision API took ${(visionDuration / adaptiveTimeout * 100).toFixed(1)}% of timeout budget - consider optimizing image`)
    }

    return response
  }

  /**
   * Enhanced AI parsing with confidence and quality assessment
   */
  async parseDocument(fileContent, workflowId, options = {}) {
    try {
      console.log(`🤖 Starting AI parsing for workflow ${workflowId}`)
      
  // Store progress helper locally so concurrent parses stay isolated
  const progressHelper = options.progressHelper || null
      
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

  const mimeType = options.mimeType || fileType?.mimeType || ''
      
  let response
  let preprocessingMetadata = null
  let preprocessingIssues = []
      
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
        
        let processedText = parseResult.text
        let anchorResult = null

        if (processedText && processedText.length > 0 && !options.disableTextPreprocessing) {
          try {
            const preprocessOptions = {
              removeArtifacts: true,
              normalizeWhitespace: true,
              compressPatterns: true,
              compressTables: true,
              vendorKey: options.vendorKey || options.merchantId,
              extraArtifacts: options.extraArtifacts || []
            }
            if (parseResult.pages && parseResult.pages > 4) {
              preprocessOptions.useAnchoredExtraction = true
            }
            const preprocessResult = await this._runTextPreprocessor(processedText, preprocessOptions)
            processedText = preprocessResult.text
            preprocessingMetadata = {
              ...(preprocessingMetadata || {}),
              ...preprocessResult.metadata
            }
            console.log(`🧼 Text preprocessing reduced content to ${preprocessResult.metadata.optimizedLength} chars (${preprocessResult.metadata.reductionPercent}% reduction, ~${preprocessResult.metadata.estimatedTokenSavings} tokens saved)`) // eslint-disable-line max-len
            if (progressHelper) {
              try {
                await progressHelper.publishSubStageProgress(
                  100,
                  10,
                  10,
                  `Preprocessed text (-${preprocessResult.metadata.reductionPercent}% characters before AI)`,
                  {
                    originalChars: preprocessResult.metadata.originalLength,
                    optimizedChars: preprocessResult.metadata.optimizedLength,
                    estimatedTokenSavings: preprocessResult.metadata.estimatedTokenSavings
                  }
                )
              } catch (progressError) {
                console.warn('⚠️ Failed to publish preprocessing progress:', progressError.message)
              }
            }
          } catch (preprocessError) {
            console.warn('⚠️ Text preprocessing failed, falling back to raw text:', preprocessError)
            preprocessingMetadata = {
              ...(preprocessingMetadata || {}),
              failed: true,
              error: preprocessError.message
            }
            preprocessingIssues.push('Text preprocessing failed - raw text used for AI parsing')
          }
        }

        if (processedText && typeof processedText === 'string' && !options.disableAnchorExtraction) {
          anchorResult = this._runAnchorExtraction(processedText, options.anchorExtractionOptions || {}, { progressHelper })

          preprocessingMetadata = {
            ...(preprocessingMetadata || {}),
            anchorExtraction: {
              applied: anchorResult.applied,
              snippetCount: anchorResult.snippets.length,
              reductionPercent: anchorResult.stats.reductionPercent,
              anchorsMatched: anchorResult.stats.anchorsMatched
            }
          }

          if (anchorResult.applied) {
            processedText = anchorResult.combinedText
          }
        } else if (!options.disableAnchorExtraction) {
          preprocessingMetadata = {
            ...(preprocessingMetadata || {}),
            anchorExtraction: {
              applied: false,
              snippetCount: 0,
              reductionPercent: 0,
              anchorsMatched: {}
            }
          }
        }

        const segmentData = this._segmentDocument(processedText, anchorResult, parseResult.text)
        preprocessingMetadata = {
          ...(preprocessingMetadata || {}),
          segmentSummary: {
            headerChars: segmentData.header?.length || 0,
            lineItemBlocks: segmentData.lineItems?.length || 0,
            totalsChars: segmentData.totals?.length || 0
          }
        }

        // Process extracted text with AI (with enhanced timeout and retry logic)
        console.log('🚀 Making OpenAI API call for PDF text processing...')
        console.log('📊 API Key configured:', !!process.env.OPENAI_API_KEY)
        console.log('📊 Content length:', processedText.length)

        response = await this._processWithOpenAI(processedText, { preprocessingMetadata, progressHelper, segments: segmentData })
        
      } else if (['jpeg', 'png', 'gif', 'webp'].includes(fileType.type)) {
        console.log('📊 Processing image with OCR text pipeline...')
        let processedText = ''
        let anchorResult = null

        try {
          const extraction = await this._extractTextFromImage(fileContent, fileType, { progressHelper })
          if (!extraction.text) {
            throw new Error('Vision text extraction returned empty content')
          }

          processedText = extraction.text
          preprocessingMetadata = {
            ...(preprocessingMetadata || {}),
            visionExtraction: {
              extractedChars: extraction.text.length,
              durationMs: extraction.durationMs
            }
          }

          if (processedText.length && !options.disableTextPreprocessing) {
            try {
              const preprocessResult = await this._runTextPreprocessor(processedText, {
                removeArtifacts: true,
                normalizeWhitespace: true,
                compressPatterns: true,
                compressTables: true,
                vendorKey: options.vendorKey || options.merchantId,
                extraArtifacts: options.extraArtifacts || []
              })
              processedText = preprocessResult.text
              preprocessingMetadata = {
                ...(preprocessingMetadata || {}),
                ...preprocessResult.metadata
              }
              console.log(`🧼 Vision text preprocessing reduced content to ${preprocessResult.metadata.optimizedLength} chars (${preprocessResult.metadata.reductionPercent}% reduction)`) // eslint-disable-line max-len
            } catch (preprocessError) {
              console.warn('⚠️ Vision text preprocessing failed, using raw OCR text:', preprocessError)
              preprocessingMetadata = {
                ...(preprocessingMetadata || {}),
                failed: true,
                error: preprocessError.message
              }
              preprocessingIssues.push('Image preprocessing failed - raw OCR text used for AI parsing')
            }
          }

          if (processedText && !options.disableAnchorExtraction) {
            anchorResult = this._runAnchorExtraction(processedText, options.anchorExtractionOptions || {}, { progressHelper })
            preprocessingMetadata = {
              ...(preprocessingMetadata || {}),
              anchorExtraction: {
                applied: anchorResult.applied,
                snippetCount: anchorResult.snippets.length,
                reductionPercent: anchorResult.stats.reductionPercent,
                anchorsMatched: anchorResult.stats.anchorsMatched
              }
            }
            if (anchorResult.applied) {
              processedText = anchorResult.combinedText
            }
          } else if (!options.disableAnchorExtraction) {
            preprocessingMetadata = {
              ...(preprocessingMetadata || {}),
              anchorExtraction: {
                applied: false,
                snippetCount: 0,
                reductionPercent: 0,
                anchorsMatched: {}
              }
            }
          }

          const segmentData = this._segmentDocument(processedText, anchorResult, extraction.text)
          preprocessingMetadata = {
            ...(preprocessingMetadata || {}),
            segmentSummary: {
              headerChars: segmentData.header?.length || 0,
              lineItemBlocks: segmentData.lineItems?.length || 0,
              totalsChars: segmentData.totals?.length || 0
            }
          }

          console.log('🚀 Making OpenAI API call for OCR text processing...')
          response = await this._processWithOpenAI(processedText, {
            preprocessingMetadata,
            progressHelper,
            segments: segmentData
          })
        } catch (ocrError) {
          console.error('⚠️ Vision OCR pipeline failed, using structured fallback:', ocrError.message)
          preprocessingIssues.push('Vision OCR pipeline failed - used direct vision fallback')
          preprocessingMetadata = {
            ...(preprocessingMetadata || {}),
            visionFallback: true
          }
          response = await this._processImageWithVisionFallback(fileContent, fileType)
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
        
        let processedCsvContent = csvContent
        let anchorResult = null
        if (!options.disableTextPreprocessing) {
          try {
            const preprocessResult = await this._runTextPreprocessor(processedCsvContent, {
              removeArtifacts: true,
              normalizeWhitespace: true,
              compressPatterns: true,
              compressTables: true,
              vendorKey: options.vendorKey || options.merchantId,
              extraArtifacts: options.extraArtifacts || []
            })
            processedCsvContent = preprocessResult.text
            preprocessingMetadata = {
              ...(preprocessingMetadata || {}),
              ...preprocessResult.metadata
            }
            console.log(`🧼 CSV preprocessing reduced content to ${preprocessResult.metadata.optimizedLength} chars (${preprocessResult.metadata.reductionPercent}% reduction, ~${preprocessResult.metadata.estimatedTokenSavings} tokens saved)`) // eslint-disable-line max-len
          } catch (preprocessError) {
            console.warn('⚠️ CSV preprocessing failed, falling back to raw CSV:', preprocessError)
            preprocessingMetadata = {
              ...(preprocessingMetadata || {}),
              failed: true,
              error: preprocessError.message
            }
            preprocessingIssues.push('CSV preprocessing failed - raw data used for AI parsing')
          }
        }
        
        if (processedCsvContent && !options.disableAnchorExtraction) {
          anchorResult = this._runAnchorExtraction(processedCsvContent, options.anchorExtractionOptions || {}, { progressHelper })

          preprocessingMetadata = {
            ...(preprocessingMetadata || {}),
            anchorExtraction: {
              applied: anchorResult.applied,
              snippetCount: anchorResult.snippets.length,
              reductionPercent: anchorResult.stats.reductionPercent,
              anchorsMatched: anchorResult.stats.anchorsMatched
            }
          }

          if (anchorResult.applied) {
            processedCsvContent = anchorResult.combinedText
          }
        } else if (!options.disableAnchorExtraction && !preprocessingMetadata?.anchorExtraction) {
          preprocessingMetadata = {
            ...(preprocessingMetadata || {}),
            anchorExtraction: {
              applied: false,
              snippetCount: 0,
              reductionPercent: 0,
              anchorsMatched: {}
            }
          }
        }

        const segmentData = this._segmentDocument(processedCsvContent, anchorResult, csvContent)
        preprocessingMetadata = {
          ...(preprocessingMetadata || {}),
          segmentSummary: {
            headerChars: segmentData.header?.length || 0,
            lineItemBlocks: segmentData.lineItems?.length || 0,
            totalsChars: segmentData.totals?.length || 0
          }
        }

        response = await this._processWithOpenAI(processedCsvContent, {
          preprocessingMetadata,
          progressHelper,
          segments: segmentData
        })
        
      } else {
        throw new Error(`Unsupported file type: ${fileType.type}. Supported formats: PDF, JPEG, PNG, GIF, WebP, CSV`)
      }

      let parsedResult
      const rawMessage = this._getResponseMessage(response)
      const rawContent = rawMessage?.content || ''

      try {
        parsedResult = this._parseStructuredResponse(response)
      } catch (parseError) {
        console.error('Failed to parse structured AI response:', parseError)
        if (rawContent && this._looksLikeInvalidPurchaseOrder(rawContent)) {
          console.log('🚫 AI rejected document as not being a valid PO')
          parsedResult = this._buildInvalidPurchaseOrderResult(rawContent)
        } else {
          console.error('AI Response:', rawContent)
          throw new Error('Invalid structured output from AI service')
        }
      }

      // Validate and enhance the result
      if (preprocessingIssues.length > 0) {
        parsedResult.issues = Array.isArray(parsedResult.issues)
          ? [...parsedResult.issues, ...preprocessingIssues]
          : preprocessingIssues
      }

      const enhancedResult = await this.enhanceAIResult(parsedResult, workflowId, { preprocessingMetadata })
      
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
  async enhanceAIResult(result, workflowId, context = {}) {
    const enhanced = {
      ...result,
      metadata: {
        workflowId,
        processedAt: new Date().toISOString(),
        aiModel: 'gpt-4o-mini', // Optimized model for all document processing
        preprocessing: context.preprocessingMetadata || null
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
   * Gather every line-item array the model may return on a chunk response.
   * Keeps duplicates for now; caller decides if dedupe is needed.
   */
  _extractLineItemsFromChunk(result) {
    if (!result || typeof result !== 'object') {
      return []
    }

    const collected = []

    const appendItems = items => {
      if (!Array.isArray(items)) return
      for (const item of items) {
        if (item && typeof item === 'object') {
          collected.push(item)
        }
      }
    }

    appendItems(result.lineItems)
    appendItems(result.items)

    if (result.extractedData && typeof result.extractedData === 'object') {
      appendItems(result.extractedData.lineItems)
      appendItems(result.extractedData.items)
    }

    return collected
  }

  /**
   * Remove duplicates caused by the model echoing the same item list twice in a chunk.
   */
  _dedupeLineItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return []
    }

    const deduped = []
    const seen = new Set()
    const debugDedupe = String(process.env.DEBUG_CHUNK_LINE_ITEMS || '').toLowerCase() === 'true'

    // First pass: Remove exact duplicates and filter out invalid entries
    const validItems = []
    for (const item of items) {
      if (!item || typeof item !== 'object') continue

      // Filter out truncated/incomplete descriptions
      const desc = (item.description ?? '').trim()
      if (desc.length > 0 && desc.length < 10) {
        if (debugDedupe) {
          console.log(`[DEBUG DEDUPE] Filtering out truncated description: "${desc}"`)
        }
        continue
      }

      const key = [
        item.productCode ?? '',
        item.description ?? '',
        item.quantity ?? '',
        item.unitPrice ?? '',
        item.total ?? ''
      ].join('|')

      if (seen.has(key)) {
        if (debugDedupe) {
          console.log(`[DEBUG DEDUPE] Exact duplicate: "${desc.substring(0, 50)}"`)
        }
        continue
      }
      
      seen.add(key)
      validItems.push(item)
    }

    // Second pass: Fuzzy matching for similar descriptions with same price
    for (const item of validItems) {
      let isDuplicate = false
      
      for (const existing of deduped) {
        // Check if this is a fuzzy match
        if (this._areSimilarLineItems(item, existing)) {
          if (debugDedupe) {
            console.log(`[DEBUG DEDUPE] Fuzzy match found:`)
            console.log(`  Item 1: "${(item.description ?? '').substring(0, 60)}"`)
            console.log(`  Item 2: "${(existing.description ?? '').substring(0, 60)}"`)
          }
          
          // Keep the item with the longer/more complete description
          if ((item.description ?? '').length > (existing.description ?? '').length) {
            // Replace existing with this better one
            const idx = deduped.indexOf(existing)
            deduped[idx] = item
            if (debugDedupe) {
              console.log(`  → Replaced with longer description`)
            }
          }
          isDuplicate = true
          break
        }
      }
      
      if (!isDuplicate) {
        deduped.push(item)
      }
    }

    if (debugDedupe) {
      console.log(`[DEBUG DEDUPE] Summary: ${items.length} → ${validItems.length} valid → ${deduped.length} final (removed ${items.length - deduped.length} duplicates)`)
    }

    return deduped
  }

  /**
   * Check if two line items are similar enough to be considered duplicates
   * Uses fuzzy matching on description and exact matching on price/quantity
   */
  _areSimilarLineItems(item1, item2) {
    // Must have same quantity and price to be considered similar
    if ((item1.quantity ?? '') !== (item2.quantity ?? '')) return false
    if ((item1.unitPrice ?? '') !== (item2.unitPrice ?? '')) return false
    if ((item1.total ?? '') !== (item2.total ?? '')) return false
    
    const desc1 = (item1.description ?? '').toLowerCase().trim()
    const desc2 = (item2.description ?? '').toLowerCase().trim()
    
    // Exact match
    if (desc1 === desc2) return true
    
    // Check if one is a substring of the other (truncated description)
    if (desc1.length >= 10 && desc2.length >= 10) {
      if (desc1.includes(desc2) || desc2.includes(desc1)) {
        return true
      }
    }
    
    // Check for high similarity using simple word overlap
    const similarity = this._calculateDescriptionSimilarity(desc1, desc2)
    return similarity > 0.85 // 85% similarity threshold
  }

  /**
   * Calculate similarity between two descriptions based on word overlap
   */
  _calculateDescriptionSimilarity(desc1, desc2) {
    if (!desc1 || !desc2) return 0
    
    // Tokenize into words (alphanumeric sequences)
    const words1 = desc1.match(/\w+/g) || []
    const words2 = desc2.match(/\w+/g) || []
    
    if (words1.length === 0 || words2.length === 0) return 0
    
    // Calculate Jaccard similarity (intersection / union)
    const set1 = new Set(words1)
    const set2 = new Set(words2)
    
    const intersection = new Set([...set1].filter(w => set2.has(w)))
    const union = new Set([...set1, ...set2])
    
    return intersection.size / union.size
  }

  /**
   * Process text with OpenAI API with enhanced timeout, retry logic, and chunking
   * @param {string} text - The text content to process
   * @returns {Promise<Object>} - OpenAI API response
   */
  async _processWithOpenAI(text, context = {}) {
    const MAX_RETRIES = 3
    const chunkThreshold = this.chunkingConfig.maxChunkChars || 3200
    const BASE_DELAY = 5000 // 5 second base delay for retries
    
    // Determine if we need to chunk the content
    const needsChunking = text.length > chunkThreshold
    
    if (needsChunking) {
      console.log(`📄 Large document detected (${text.length} chars > ${chunkThreshold}), using chunking strategy`)
      return await this._processLargeDocument(text, context)
    }
    
    const progressHelper = context.progressHelper || null
    const segmentMessages = this._buildSegmentMessages(context.segments)
    const fewShotMessages = this._buildFewShotMessages()

    if (segmentMessages.length || fewShotMessages.length) {
      const segmentStats = segmentMessages.length
        ? {
            header: Boolean(context.segments?.header),
            lineItemBlocks: context.segments?.lineItems?.length || 0,
            totals: Boolean(context.segments?.totals)
          }
        : null
      console.log('🧩 Using enriched prompts for OpenAI request', {
        segmentsInjected: Boolean(segmentMessages.length),
        fewShotCount: fewShotMessages.length,
        ...(segmentStats ? { segmentStats } : {})
      })
    }

    const documentIntro = segmentMessages.length
      ? `Use the segmented purchase order sections above as primary context. If a field is missing, consult the normalized document below.\n\nNormalized document text:\n${text}`
      : `Purchase order document:\n${text}`

    const messages = [
      {
        role: 'system',
        content: this.optimizedPrompt
      },
      ...fewShotMessages,
      ...segmentMessages,
      {
        role: 'user',
        content: documentIntro
      }
    ]

    // Process normal-sized documents with retry logic
    let lastError = null
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const startTime = Date.now()
      
      try {
        console.log(`🔍 Attempt ${attempt}/${MAX_RETRIES} - Processing document with OpenAI API...`)
        console.log(`📊 Content length: ${text.length} characters`)
        if (progressHelper && attempt === 1) {
          try {
            await progressHelper.publishSubStageProgress(
              5,
              20,
              60,
              'Submitting document to OpenAI for structured parsing',
              {
                attempt,
                messageCount: messages.length,
                segmentInjected: segmentMessages.length > 0,
                fewShotInjected: fewShotMessages.length > 0
              }
            )
          } catch (progressError) {
            console.warn('⚠️ Failed to publish OpenAI submission progress:', progressError.message)
          }
        }

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
          functions: [this.getStructuredOutputSchema()],
          function_call: { name: 'extract_purchase_order' },
          max_tokens: 16000,
          temperature: 0
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
  async _processLargeDocument(text, context = {}) {
    console.log(`📚 Processing large document (${text.length} chars) with intelligent chunking`)
    
    // Validate input
    if (!text || typeof text !== 'string') {
      throw new Error('Invalid text input for chunking')
    }
    
    if (text.length > 1000000) { // 1MB limit
      console.log('⚠️ Extremely large document, truncating to 1MB')
      text = text.substring(0, 1000000)
    }
    
    const progressHelper = context.progressHelper || null

    const chunkingConfig = {
      maxChunkChars: this.chunkingConfig.maxChunkChars,
      minChunkChars: this.chunkingConfig.minChunkChars,
      overlapChars: this.chunkingConfig.overlapChars,
      maxIterations: this.chunkingConfig.maxIterations,
      ...(context.chunkingOverrides || {})
    }

    const chunkPlan = this._createChunkPlan(text, chunkingConfig)
    const totalChunks = chunkPlan.length

    if (!totalChunks) {
      console.warn('⚠️ Chunk plan empty, falling back to single OpenAI call')
      return await this._processWithOpenAI(text, context)
    }

    if (totalChunks > (chunkingConfig.maxChunks || this.chunkingConfig.maxChunks)) {
      console.warn(`⚠️ Chunk plan generated ${totalChunks} chunks (max recommended ${(chunkingConfig.maxChunks || this.chunkingConfig.maxChunks)}). Consider increasing chunk size or reducing overlap.`)
    }

    const chunkSummary = this._summarizeChunkPlan(chunkPlan, text.length)
    console.log(`📄 Created ${chunkSummary.chunkCount} chunks for processing`, chunkSummary)

    // 📊 Progress: Chunking complete (20% of AI stage, 8% global)
    if (progressHelper) {
      await progressHelper.publishSubStageProgress(
        100,
        10, // Chunking is 10-20% of AI stage
        10, // 10% range
        `Created ${totalChunks} chunks for AI processing`,
        {
          chunkCount: totalChunks,
          totalChars: text.length,
          averageChunkChars: chunkSummary.averageChunkLength,
          overlapChars: chunkingConfig.overlapChars,
          estimatedTokens: chunkSummary.estimatedTokens
        }
      )
    }
    
    // Process first chunk to get the structure
    console.log('🔍 Processing first chunk to establish document structure...')
    
    const chunkIssues = []
    let firstResponse
    try {
      // 📊 Progress: Processing first chunk (20-30% of AI stage, 8-12% global)
      if (progressHelper) {
        await progressHelper.publishSubStageProgress(
          5,
          20, // OpenAI processing is 20-80% of AI stage
          60, // 60% range
          `Processing chunk 1/${totalChunks} with OpenAI API`,
          {
            currentChunk: 1,
            totalChunks,
            chunkChars: chunkPlan[0].length,
            overlapChars: chunkPlan[0].overlap,
            estimatedTokens: chunkPlan[0].estimatedTokens
          }
        )
      }
      
      const chunkMessages = [
        { role: 'system', content: this.optimizedPrompt },
        ...this._buildFewShotMessages(),
        {
          role: 'user',
          content: `This is chunk 1 of ${totalChunks} for a large purchase order. Extract every possible field and line item from just this chunk.

IMPORTANT: Products may span multiple text lines:
- Product description (with size/packaging)
- SKU: [number]  
- Quantity UnitPrice Total

Combine these into ONE line item entry per product. Do not create separate entries for SKU lines or price lines.

Document chunk:\n${chunkPlan[0].text}`
        }
      ]

      firstResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: chunkMessages,
        functions: [this.getStructuredOutputSchema()],
        function_call: { name: 'extract_purchase_order' },
        max_tokens: 16000,
        temperature: 0
      })
    } catch (error) {
      console.error('❌ Failed to process first chunk:', error.message)
      // Fallback to truncated version of entire document
      const truncatedText = text.substring(0, 8000) + '\n\n[Document truncated due to length]'
      chunkIssues.push(`Chunk 1 failed (${error.message}) - fell back to truncated document`)
      return await this._processWithOpenAI(truncatedText, context)
    }
    
    // If we only have one chunk or first chunk failed, return first response
    if (totalChunks === 1) {
      console.log('✅ Single chunk processing completed')
      return firstResponse
    }
    
    // Process remaining chunks to collect all line items
    console.log(`🔄 Processing remaining ${totalChunks - 1} chunks to collect all line items...`)
    
  const allLineItems = []
  const debugChunks = String(process.env.DEBUG_CHUNK_LINE_ITEMS || '').toLowerCase() === 'true'
    
    // Extract line items from first chunk
    try {
      const firstResult = this._parseStructuredResponse(firstResponse)
      const rawFirstChunkItems = this._extractLineItemsFromChunk(firstResult)
      if (debugChunks) {
        console.log('[DEBUG] Chunk 1 raw extract count:', rawFirstChunkItems.length)
        console.log('[DEBUG] Chunk 1 sample descriptions:', rawFirstChunkItems.slice(0, 5).map(item => item?.description || '').filter(Boolean))
      }
      const mergedChunkItems = this._dedupeLineItems(rawFirstChunkItems)

      if (mergedChunkItems.length > 0) {
        allLineItems.push(...mergedChunkItems)
        console.log(`📋 First chunk: extracted ${mergedChunkItems.length} line items`)
        
        // 📊 Progress: First chunk complete
        if (progressHelper) {
          const chunkProgress = (1 / totalChunks) * 100
          await progressHelper.publishSubStageProgress(
            chunkProgress,
            20, // OpenAI processing is 20-80% of AI stage
            60, // 60% range
            `Chunk 1/${totalChunks} complete: extracted ${mergedChunkItems.length} items`,
            { 
              currentChunk: 1, 
              totalChunks,
              itemsExtracted: mergedChunkItems.length,
              totalItems: allLineItems.length,
              chunkChars: chunkPlan[0].length,
              overlapChars: chunkPlan[0].overlap,
              estimatedTokens: chunkPlan[0].estimatedTokens
            }
          )
        }
      } else {
        console.log('ℹ️ First chunk returned no line items')
        chunkIssues.push('First chunk returned no line items - downstream chunks may capture them')
      }
    } catch (error) {
      console.warn('⚠️ Could not parse first chunk response, will try other chunks')
      console.warn('⚠️ Parse error:', error.message)
      chunkIssues.push(`Chunk 1 parse failed: ${error.message}`)
    }
    
    // Process subsequent chunks to extract additional line items
    for (let i = 1; i < totalChunks; i++) {
      console.log(`🔍 Processing chunk ${i + 1}/${totalChunks}...`)
      
      // 📊 Progress: Processing chunk i+1
      if (progressHelper) {
        const chunkProgress = ((i + 0.5) / totalChunks) * 100
        await progressHelper.publishSubStageProgress(
          chunkProgress,
          20, // OpenAI processing is 20-80% of AI stage
          60, // 60% range
          `Processing chunk ${i + 1}/${totalChunks} with OpenAI API`,
          {
            currentChunk: i + 1,
            totalChunks,
            chunkChars: chunkPlan[i].length,
            overlapChars: chunkPlan[i].overlap,
            estimatedTokens: chunkPlan[i].estimatedTokens
          }
        )
      }
      
      const chunkInstructions = `Chunk ${i + 1} of ${totalChunks}. Extract line items from this chunk.

CRITICAL: Each product typically spans multiple lines:
- Line 1: Product description with size/packaging
- Line 2: SKU: [number]
- Line 3: Quantity Price Total

Example:
"Warheads Wedgies 127g Peg Bag - Case of 12
SKU: 03213428503
1 $17.88 $17.88"

This is ONE product, not three. Combine into one entry with:
- description: "Warheads Wedgies 127g Peg Bag - Case of 12"
- productCode: "03213428503"
- quantity: "1"
- unitPrice: "17.88"
- total: "17.88"

Only call extract_po_line_items once per complete product.

Document chunk:\n${chunkPlan[i].text}`
      
      try {
        const chunkResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: 'system', content: this.chunkLineItemPrompt },
            { role: 'user', content: chunkInstructions }
          ],
          functions: [this.getLineItemSchema()],
          function_call: { name: 'extract_po_line_items' },
          max_tokens: 16000,
          temperature: 0
        })
        
        const chunkResult = this._parseStructuredResponse(chunkResponse)
        const chunkItems = this._extractLineItemsFromChunk(chunkResult)
        if (debugChunks) {
          console.log(`[DEBUG] Chunk ${i + 1} raw extract count:`, chunkItems.length)
          console.log(`[DEBUG] Chunk ${i + 1} sample descriptions:`, chunkItems.slice(0, 5).map(item => item?.description || '').filter(Boolean))
        }
        
        if (chunkItems.length > 0) {
          allLineItems.push(...chunkItems)
          console.log(`📋 Chunk ${i + 1}: extracted ${chunkItems.length} line items (total: ${allLineItems.length})`)
          
          // 📊 Progress: Chunk complete
          if (progressHelper) {
            const chunkProgress = ((i + 1) / totalChunks) * 100
            await progressHelper.publishSubStageProgress(
              chunkProgress,
              20, // OpenAI processing is 20-80% of AI stage
              60, // 60% range
              `Chunk ${i + 1}/${totalChunks} complete: extracted ${chunkItems.length} items`,
              { 
                currentChunk: i + 1, 
                totalChunks,
                itemsExtracted: chunkItems.length,
                totalItems: allLineItems.length,
                chunkChars: chunkPlan[i].length,
                overlapChars: chunkPlan[i].overlap,
                estimatedTokens: chunkPlan[i].estimatedTokens
              }
            )
          }
        } else {
          console.log(`ℹ️ Chunk ${i + 1} returned no line items`)
          chunkIssues.push(`Chunk ${i + 1} returned no line items`)
        }
        
        // Add small delay between API calls to avoid rate limiting
        if (i < totalChunks - 1) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
        
      } catch (error) {
        console.warn(`⚠️ Failed to process chunk ${i + 1}:`, error.message)
        chunkIssues.push(`Chunk ${i + 1} processing failed: ${error.message}`)
        // Continue with other chunks even if one fails
      }
    }
    
    // Merge the results - use first chunk structure but with all line items
    try {
      // 📊 Progress: Merging results (80-90% of AI stage, 32-36% global)
      if (progressHelper) {
        await progressHelper.publishSubStageProgress(
          50,
          80, // Merging is 80-90% of AI stage
          10, // 10% range
          `Merging ${allLineItems.length} items from ${totalChunks} chunks`,
          { totalItems: allLineItems.length, chunkCount: totalChunks }
        )
      }
      
  const finalResult = this._parseStructuredResponse(firstResponse)
      const chunkingMetadata = {
        chunkCount: totalChunks,
        totalChars: text.length,
        estimatedTokens: chunkSummary.estimatedTokens,
        issues: [...chunkIssues]
      }
      
      // Replace line items with the complete merged set
      if (allLineItems.length > 0) {
        const mergedItems = this._dedupeLineItems(allLineItems)
        
        // ⚠️ CRITICAL FIX: Do NOT consolidate before database save!
        // Consolidation creates nested structures that don't match the database schema.
        // Instead, always save unconsolidated items to DB, and apply consolidation
        // in the API layer when responding to frontend.
        
        // Store unconsolidated items for database save
        finalResult.lineItems = mergedItems
        
        // Ensure nested extractedData structure has unconsolidated items
        if (finalResult.extractedData && typeof finalResult.extractedData === 'object') {
          finalResult.extractedData.lineItems = mergedItems
          finalResult.extractedData.items = mergedItems // Legacy alias
        }

        console.log(`✅ Multi-chunk processing complete: merged ${mergedItems.length} total line items`)
        
        // 📊 Progress: Merging complete (90% of AI stage, 36% global)
        if (progressHelper) {
          await progressHelper.publishSubStageProgress(
            100,
            80, // Merging is 80-90% of AI stage
            10, // 10% range
            `Merged ${finalItems.length} items successfully`,
            { totalItems: finalItems.length, chunkCount: totalChunks }
          )
        }
      }
      
      if (chunkIssues.length > 0) {
        finalResult.issues = Array.isArray(finalResult.issues)
          ? [...finalResult.issues, ...chunkIssues]
          : [...chunkIssues]
      }
      finalResult.chunkingMetadata = chunkingMetadata
      
      // Create a new response object with the merged content
      const mergedResponse = {
        ...firstResponse,
        choices: [{
          ...firstResponse.choices[0],
          message: {
            ...firstResponse.choices[0].message,
            function_call: {
              name: 'extract_purchase_order',
              arguments: JSON.stringify(finalResult)
            },
            content: null
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
