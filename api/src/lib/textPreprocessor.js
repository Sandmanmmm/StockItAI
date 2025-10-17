/**
 * Text Preprocessing Service
 * Optimizes AI parsing by reducing token count 40-60% through intelligent cleaning
 * 
 * Part of Token Optimization Phase 1
 * See: TOKEN_OPTIMIZATION_COMPREHENSIVE_ANALYSIS.md
 */

export class TextPreprocessor {
  constructor() {
    // Common OCR artifacts to remove
    this.ocrArtifacts = [
      /Scanned by [^\n]+/gi,
      /Page \d+ of \d+/gi,
      /--- Page Break ---/gi,
      /\[Barcode: [^\]]+\]/gi,
      /Document ID: [^\n]+/gi,
      /Confidential[^\n]*/gi,
      /Print Date: [^\n]+/gi,
      /Generated on [^\n]+/gi,
      /This document was electronically generated.*/gi,
      /Powered by (?:QuickBooks|Xero|SAP).*/gi,
      /Thank you for your (?:business|order).*/gi,
      /Remit (?:Payment|To):[^\n]*/gi,
      /Please retain for your records.*/gi
    ]
    
    this.vendorArtifacts = new Map([
      ['exotic_wholesale', [
        /Exotic Wholesale(?: Inc\.| LLC)?[^\n]*/gi,
        /Toll Free: 1-800-EXOTIC/gi,
        /Wholesale Portal: https?:\/\/exoticwholesale\.com[^\s]*/gi
      ]],
      ['northern_supply', [
        /Northern Supply (?:LLC|Ltd\.)[^\n]*/gi,
        /Customer Success Desk: [^\n]*/gi,
        /Generated via NorthernOne ERP/gi
      ]]
    ])

    // Common PO field patterns for compression
    this.poPatterns = {
      poNumber: /(?:Purchase\s+Order|PO|P\.O\.)\s*(?:Number|No|#)?:?\s*(\S+)/gi,
      invoiceDate: /(?:Invoice|Order|PO)\s+Date:?\s*(\w+\s+\d+,?\s+\d{4})/gi,
      supplier: /(?:Supplier|Vendor)\s+Name:?\s*([^\n]+)/gi,
      total: /(?:Total|Grand\s+Total|Amount\s+Due):?\s*\$?\s*([\d,]+\.?\d*)/gi
    }

    this.keySignalPatterns = {
      poNumber: /(?:purchase\s+order|po|p\.o\.)\s*(?:number|no\.?|#)/i,
      invoice: /invoice\s*(?:number|no\.?|#)?/i,
      supplier: /\b(supplier|vendor)\b/i,
      totals: /\b(grand\s+)?total\b/i,
      lineItems: /\b(qty|quantity|description|unit\s*price|amount)\b/i
    }
  }

  /**
   * Main preprocessing pipeline
   * @param {string} rawText - Raw extracted text from PDF/OCR
   * @returns {object} - Optimized text and metadata
   */
  preprocess(rawText, options = {}) {
    const startTime = Date.now()
    const originalLength = rawText.length
    
    let optimized = rawText
    
    // Step 1: Remove OCR artifacts
    if (options.removeArtifacts !== false) {
      optimized = this.cleanOCRText(optimized, {
        vendorKey: options.vendorKey || options.merchantId,
        extraArtifacts: options.extraArtifacts || []
      })
    }
    
    // Step 2: Normalize whitespace
    if (options.normalizeWhitespace !== false) {
      optimized = this.normalizeWhitespace(optimized)
    }
    
    // Step 3: Compress PO format patterns
    if (options.compressPatterns !== false) {
      optimized = this.compressPOFormat(optimized)
    }
    
    // Step 4: Extract anchored sections (if enabled)
    if (options.useAnchoredExtraction) {
      optimized = this.extractAnchoredSections(optimized, options.anchors)
    }
    
    // Step 5: Compress line item tables
    if (options.compressTables !== false) {
      optimized = this.compressLineItemTables(optimized)
    }

    const optimizedCandidate = optimized
    const trimmedOptimized = optimizedCandidate.trim()
    const fallbackReasons = []
    let optimizedResult = optimizedCandidate

    if (trimmedOptimized.length === 0) {
      console.warn('⚠️ Text preprocessing removed all content; returning original text to avoid empty AI payload')
      fallbackReasons.push('empty_output')
    } else {
      const originalSignals = this.extractKeySignals(rawText)
      const optimizedSignals = this.extractKeySignals(optimizedCandidate)
      const lostSignals = Object.entries(originalSignals)
        .filter(([key, count]) => count > 0 && (optimizedSignals[key] || 0) === 0)
        .map(([key]) => key)

      if (lostSignals.length > 0) {
        console.warn(`⚠️ Text preprocessing removed key signals (${lostSignals.join(', ')}); restoring original text`)
        fallbackReasons.push(`lost_signals:${lostSignals.join(',')}`)
      }
    }

    if (fallbackReasons.length > 0) {
      optimizedResult = rawText
    }

    const optimizedLength = optimizedResult.length
    const reductionPercent = ((1 - optimizedLength / originalLength) * 100).toFixed(1)
    const duration = Date.now() - startTime
    
    if (fallbackReasons.length > 0) {
      console.log(`↩️ Text preprocessing fallback applied (${fallbackReasons.join('; ')})`)
    }

    console.log(`📉 Text preprocessing: ${originalLength} → ${optimizedLength} chars (${reductionPercent}% reduction) in ${duration}ms`)
    
    return {
      text: optimizedResult,
      metadata: {
        originalLength,
        optimizedLength,
        reductionPercent: parseFloat(reductionPercent),
        estimatedTokenSavings: Math.floor((originalLength - optimizedLength) / 4), // ~4 chars per token
        duration,
        fallbackApplied: fallbackReasons.length > 0,
        fallbackReasons
      }
    }
  }

  /**
   * Remove common OCR artifacts and noise
   */
  cleanOCRText(text, cleanupOptions = {}) {
    let cleaned = text
    const { vendorKey, extraArtifacts = [] } = cleanupOptions
    
    const artifacts = [...this.ocrArtifacts]
    const vendorPatterns = vendorKey ? this.vendorArtifacts.get(vendorKey) : null
    if (vendorPatterns && vendorPatterns.length) {
      artifacts.push(...vendorPatterns)
    }
    if (Array.isArray(extraArtifacts) && extraArtifacts.length) {
      artifacts.push(...extraArtifacts)
    }

    // Remove all configured OCR and vendor artifacts
    artifacts.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '')
    })
    
    // Remove watermarks and stamps
    cleaned = cleaned.replace(/\[DRAFT\]/gi, '')
    cleaned = cleaned.replace(/\[COPY\]/gi, '')
    cleaned = cleaned.replace(/\[DUPLICATE\]/gi, '')
    
    return cleaned
  }

  /**
   * Normalize whitespace and line breaks
   */
  normalizeWhitespace(text) {
    let normalized = text
    
    // Replace tabs with single space
    normalized = normalized.replace(/\t+/g, ' ')
    
    // Replace multiple spaces with single space
    normalized = normalized.replace(/[ ]{2,}/g, ' ')
    
    // Replace 3+ newlines with double newline
    normalized = normalized.replace(/\n{3,}/g, '\n\n')
    
    // Trim whitespace from each line
    normalized = normalized.split('\n').map(line => line.trim()).join('\n')
    
    // Remove empty lines
    normalized = normalized.split('\n').filter(line => line.length > 0).join('\n')
    
    return normalized.trim()
  }

  /**
   * Compress common PO patterns to reduce tokens
   */
  compressPOFormat(text) {
    let compressed = text
    
    // "Purchase Order Number: 12345" → "PO#12345"
    compressed = compressed.replace(
      this.poPatterns.poNumber,
      (match, number) => `PO#${number.trim()}`
    )
    
    // "Invoice Date: April 5, 2025" → "Date:2025-04-05"
    compressed = compressed.replace(
      this.poPatterns.invoiceDate,
      (match, dateStr) => {
        const normalized = this.normalizeDate(dateStr)
        return normalized ? `Date:${normalized}` : match
      }
    )
    
    // "Supplier Name: ExoticWholesale.com" → "Supplier:ExoticWholesale.com"
    compressed = compressed.replace(
      this.poPatterns.supplier,
      (match, name) => `Supplier:${name.trim()}`
    )
    
    // "Total: $1,234.56" → "Total:1234.56"
    compressed = compressed.replace(
      this.poPatterns.total,
      (match, amount) => `Total:${amount.replace(/,/g, '')}`
    )
    
    return compressed
  }

  /**
   * Extract only sections around key anchors
   * Useful when document has lots of noise but key data is near specific keywords
   */
  extractAnchoredSections(text, customAnchors = null) {
    const anchors = customAnchors || [
      'PO#', 'Invoice', 'Supplier', 'Vendor', 'Total', 'Item', 'Qty', 'Quantity',
      'Price', 'Amount', 'Date', 'Description', 'Product', 'SKU'
    ]
    
    const lines = text.split('\n')
    const sections = []
    const contextBefore = 2
    const contextAfter = 3
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      
      // Check if line contains any anchor
      const hasAnchor = anchors.some(anchor => 
        line.toLowerCase().includes(anchor.toLowerCase())
      )
      
      if (hasAnchor) {
        // Extract context around anchor
        const start = Math.max(0, i - contextBefore)
        const end = Math.min(lines.length, i + contextAfter + 1)
        const section = lines.slice(start, end).join('\n')
        sections.push(section)
      }
    }
    
    // Deduplicate overlapping sections
    const deduplicated = this.deduplicateSections(sections)
    
    // Join sections with separator
    return deduplicated.join('\n---\n')
  }

  /**
   * Compress line item tables by removing excessive spacing
   */
  compressLineItemTables(text) {
    const lines = text.split('\n')
    const compressedLines = lines.map(line => {
      // Detect table-like structure (multiple spaces or tabs between values)
      if (/\s{2,}/.test(line) || /\t/.test(line)) {
        // Replace multiple spaces/tabs with pipe separator for clarity
        return line.replace(/\s{2,}|\t+/g, ' | ').trim()
      }
      return line
    })
    
    return compressedLines.join('\n')
  }

  /**
   * Normalize date strings to ISO format (YYYY-MM-DD)
   */
  normalizeDate(dateStr) {
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) {
        return null
      }
      return date.toISOString().split('T')[0]
    } catch (error) {
      console.warn(`Failed to normalize date: ${dateStr}`)
      return null
    }
  }

  /**
   * Remove duplicate sections caused by overlapping context
   */
  deduplicateSections(sections) {
    const seen = new Set()
    return sections.filter(section => {
      // Normalize for comparison (remove extra whitespace)
      const normalized = section.replace(/\s+/g, ' ').trim()
      
      if (seen.has(normalized)) {
        return false
      }
      
      seen.add(normalized)
      return true
    })
  }

  /**
   * Estimate token count (rough approximation: 4 chars ≈ 1 token)
   */
  estimateTokens(text) {
    return Math.ceil(text.length / 4)
  }

  /**
   * Get preprocessing statistics
   */
  getStats(originalText, processedText) {
    const originalTokens = this.estimateTokens(originalText)
    const processedTokens = this.estimateTokens(processedText)
    
    return {
      originalChars: originalText.length,
      processedChars: processedText.length,
      charReduction: originalText.length - processedText.length,
      charReductionPercent: ((1 - processedText.length / originalText.length) * 100).toFixed(1),
      originalTokens,
      processedTokens,
      tokenSavings: originalTokens - processedTokens,
      tokenSavingsPercent: ((1 - processedTokens / originalTokens) * 100).toFixed(1)
    }
  }

  registerVendorArtifacts(vendorKey, patterns = []) {
    if (!vendorKey || typeof vendorKey !== 'string') {
      throw new Error('vendorKey must be a non-empty string')
    }

    const normalized = Array.isArray(patterns) ? patterns : [patterns]

    if (!normalized.every(pattern => pattern instanceof RegExp)) {
      throw new Error('All vendor artifact patterns must be regular expressions')
    }

    const existing = this.vendorArtifacts.get(vendorKey) || []
    this.vendorArtifacts.set(vendorKey, [...existing, ...normalized])
  }

  extractKeySignals(text) {
    if (!text || typeof text !== 'string') {
      return {
        poNumber: 0,
        invoice: 0,
        supplier: 0,
        totals: 0,
        lineItems: 0
      }
    }

    return Object.fromEntries(
      Object.entries(this.keySignalPatterns).map(([key, pattern]) => {
        const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
        const globalPattern = new RegExp(pattern.source, flags)
        const matches = text.match(globalPattern)
        return [key, matches ? matches.length : 0]
      })
    )
  }
}

// Export singleton instance
export const textPreprocessor = new TextPreprocessor()
