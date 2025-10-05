/**
 * PO Analysis Job Processor
 * Handles asynchronous PO document analysis and data extraction
 */

import { db } from '../lib/db.js'
import { enhancedJobService } from '../lib/enhancedJobService.js'

export class POAnalysisJobProcessor {
  constructor() {
    this.jobType = 'analyze-po'
    this.setupProcessor()
  }

  /**
   * Setup job processor with enhanced job service
   */
  setupProcessor() {
    // Register processor with the enhanced job service
    if (enhancedJobService.queue) {
      enhancedJobService.queue.process(this.jobType, 2, this.processAnalysisJob.bind(this))
      console.log(`📊 PO Analysis job processor registered (concurrency: 2)`)
    }
  }

  /**
   * Process PO analysis job
   */
  async processAnalysisJob(job) {
    const { 
      purchaseOrderId, 
      fileContent, 
      fileName, 
      merchantId, 
      options = {} 
    } = job.data

    console.log(`🔍 Processing PO analysis job ${job.id} for PO ${purchaseOrderId}`)

    try {
      // Update job status in database
      await this.updatePOJobStatus(purchaseOrderId, {
        jobStatus: 'processing',
        jobStartedAt: new Date()
      })

      // Step 1: Extract text from document
      console.log(`📄 Extracting text from ${fileName}...`)
      const extractedText = await this.extractTextFromDocument(fileContent, fileName)

      // Step 2: Analyze with AI/ML
      console.log(`🤖 Analyzing PO content with AI...`)
      const analysisResult = await this.analyzePOContent(extractedText, options)

      // Step 3: Validate and structure data
      console.log(`✅ Validating and structuring data...`)
      const structuredData = await this.validateAndStructureData(analysisResult, options)

      // Step 4: Save results to database
      console.log(`💾 Saving analysis results...`)
      const updatedPO = await this.saveAnalysisResults(purchaseOrderId, structuredData)

      // Step 5: Check if supplier matching is needed
      if (structuredData.supplierName && !updatedPO.supplierId) {
        console.log(`🏢 Attempting supplier matching...`)
        await this.attemptSupplierMatching(purchaseOrderId, structuredData.supplierName, merchantId)
      }

      // Mark job as completed
      await this.updatePOJobStatus(purchaseOrderId, {
        jobStatus: 'completed',
        jobCompletedAt: new Date(),
        jobError: null
      })

      console.log(`✅ PO analysis job ${job.id} completed successfully`)

      return {
        success: true,
        purchaseOrderId,
        confidence: structuredData.confidence,
        lineItemsCount: structuredData.lineItems?.length || 0,
        totalAmount: structuredData.totalAmount,
        processingTime: Date.now() - job.processedOn
      }

    } catch (error) {
      console.error(`❌ PO analysis job ${job.id} failed:`, error)

      // Update database with error
      await this.updatePOJobStatus(purchaseOrderId, {
        jobStatus: 'failed',
        jobCompletedAt: new Date(),
        jobError: error.message
      })

      throw error
    }
  }

  /**
   * Extract text from document based on file type
   */
  async extractTextFromDocument(fileContent, fileName) {
    const fileExt = fileName.toLowerCase().split('.').pop()

    switch (fileExt) {
      case 'pdf':
        return await this.extractFromPDF(fileContent)
      case 'xlsx':
      case 'xls':
        return await this.extractFromExcel(fileContent)
      case 'csv':
        return await this.extractFromCSV(fileContent)
      case 'txt':
        return fileContent.toString()
      default:
        throw new Error(`Unsupported file type: ${fileExt}`)
    }
  }

  /**
   * Extract text from PDF using pdfjs-dist
   */
  async extractFromPDF(fileContent) {
    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js')
      
      const loadingTask = pdfjs.getDocument({
        data: fileContent,
        verbosity: 0
      })
      
      const pdf = await loadingTask.promise
      let fullText = ''
      
      // Extract text from all pages
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const textContent = await page.getTextContent()
        const pageText = textContent.items.map(item => item.str).join(' ')
        fullText += pageText + '\n'
      }
      
      return fullText.trim()
    } catch (error) {
      throw new Error(`PDF extraction failed: ${error.message}`)
    }
  }

  /**
   * Extract data from Excel files
   */
  async extractFromExcel(fileContent) {
    // Would use xlsx library in production
    // For now, return mock data
    return "Mock Excel content extraction"
  }

  /**
   * Extract data from CSV files
   */
  async extractFromCSV(fileContent) {
    return fileContent.toString()
  }

  /**
   * Analyze PO content using AI/ML
   */
  async analyzePOContent(text, options) {
    // This would integrate with actual AI service (OpenAI, etc.)
    // For now, return mock analysis
    
    console.log(`🤖 AI Analysis starting... (${text.length} characters)`)
    
    // Simulate AI processing time
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Mock analysis result
    const mockAnalysis = {
      confidence: 0.85,
      poNumber: this.extractPONumber(text),
      supplierName: this.extractSupplierName(text),
      orderDate: this.extractOrderDate(text),
      dueDate: this.extractDueDate(text),
      totalAmount: this.extractTotalAmount(text),
      currency: this.extractCurrency(text) || 'USD',
      lineItems: this.extractLineItems(text),
      rawExtraction: {
        fullText: text,
        extractedFields: ['po_number', 'supplier', 'total', 'line_items'],
        processingNotes: 'AI analysis completed with high confidence'
      }
    }

    return mockAnalysis
  }

  /**
   * Validate and structure the analyzed data
   */
  async validateAndStructureData(analysisResult, options) {
    const structured = {
      ...analysisResult,
      confidence: Math.min(analysisResult.confidence, 1.0),
      totalAmount: Math.abs(analysisResult.totalAmount || 0),
      lineItems: (analysisResult.lineItems || []).map(item => ({
        ...item,
        quantity: Math.abs(item.quantity || 0),
        unitPrice: Math.abs(item.unitPrice || 0),
        totalPrice: Math.abs(item.totalPrice || 0)
      }))
    }

    // Apply confidence threshold
    const threshold = options.confidenceThreshold || 0.7
    if (structured.confidence < threshold) {
      structured.requiresReview = true
      structured.processingNotes = `Low confidence (${structured.confidence}) - requires manual review`
    }

    return structured
  }

  /**
   * Save analysis results to database
   */
  async saveAnalysisResults(purchaseOrderId, data) {
    const updateData = {
      number: data.poNumber || 'Unknown',
      supplierName: data.supplierName || 'Unknown',
      orderDate: data.orderDate,
      dueDate: data.dueDate,
      totalAmount: data.totalAmount || 0,
      currency: data.currency || 'USD',
      confidence: data.confidence,
      rawData: data.rawExtraction,
      processingNotes: data.processingNotes,
      status: data.requiresReview ? 'review_needed' : 'processing',
      updatedAt: new Date()
    }

    // Update PO
    const updatedPO = await db.client.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: updateData
    })

    // Create/update line items
    if (data.lineItems && data.lineItems.length > 0) {
      await this.saveLineItems(purchaseOrderId, data.lineItems)
    }

    return updatedPO
  }

  /**
   * Save line items to database
   */
  async saveLineItems(purchaseOrderId, lineItems) {
    // Delete existing line items
    await db.client.pOLineItem.deleteMany({
      where: { purchaseOrderId }
    })

    // Create new line items
    const lineItemData = lineItems.map(item => ({
      purchaseOrderId,
      sku: item.sku || '',
      productName: item.productName || item.description || 'Unknown Product',
      description: item.description || '',
      quantity: item.quantity || 0,
      unitPrice: item.unitPrice || 0,
      totalPrice: item.totalPrice || (item.quantity * item.unitPrice),
      confidence: item.confidence || 0.8
    }))

    await db.client.pOLineItem.createMany({
      data: lineItemData
    })
  }

  /**
   * Attempt to match supplier using parsed supplier data (email, phone, website, etc.)
   */
  async attemptSupplierMatching(purchaseOrderId, supplierName, merchantId) {
    try {
      // Get the full PO with parsed data
      const purchaseOrder = await db.client.purchaseOrder.findUnique({
        where: { id: purchaseOrderId },
        select: { rawData: true }
      })

      if (!purchaseOrder) {
        console.log('⚠️ Purchase order not found')
        return null
      }

      // Extract parsed supplier data from rawData
      let parsedSupplier = null
      if (purchaseOrder.rawData?.extractedData?.supplier) {
        parsedSupplier = purchaseOrder.rawData.extractedData.supplier
      } else if (purchaseOrder.rawData?.supplier) {
        parsedSupplier = purchaseOrder.rawData.supplier
      }

      // If no parsed data, fall back to supplier name
      if (!parsedSupplier || (!parsedSupplier.email && !parsedSupplier.phone && !parsedSupplier.website && !parsedSupplier.name && !parsedSupplier.contact)) {
        console.log(`⚠️ No parsed supplier data available for PO ${purchaseOrderId}, skipping auto-match`)
        return null
      }

      // Import the supplier matching service for fuzzy matching
      const { findMatchingSuppliers } = await import('../services/supplierMatchingService.js')
      
      // Use fuzzy matching with all available supplier data
      // Handle nested contact object structure
      const matchData = {
        name: parsedSupplier.name || supplierName,
        email: parsedSupplier.email || parsedSupplier.contactEmail || parsedSupplier.contact?.email,
        phone: parsedSupplier.phone || parsedSupplier.contactPhone || parsedSupplier.contact?.phone,
        website: parsedSupplier.website,
        address: parsedSupplier.address
      }

      console.log(`🔍 Matching supplier with data:`, {
        name: matchData.name,
        hasEmail: !!matchData.email,
        hasPhone: !!matchData.phone,
        hasWebsite: !!matchData.website,
        hasAddress: !!matchData.address
      })

      const matches = await findMatchingSuppliers(matchData, merchantId)

      if (matches && matches.length > 0) {
        // Get the best match
        const bestMatch = matches[0]
        
        // Auto-link if match score is high enough (>= 85%)
        if (bestMatch.matchScore >= 85) {
          await db.client.purchaseOrder.update({
            where: { id: purchaseOrderId },
            data: { supplierId: bestMatch.supplier.id }
          })
          console.log(`🔗 Auto-matched supplier: ${bestMatch.supplier.name} (${bestMatch.matchScore}% confidence)`)
          return bestMatch.supplier
        } else if (bestMatch.matchScore >= 70) {
          // Log potential match for review but don't auto-link
          console.log(`🤔 Potential supplier match found: ${bestMatch.supplier.name} (${bestMatch.matchScore}% confidence) - requires manual review`)
        } else {
          console.log(`⚠️ No strong supplier match found (best: ${bestMatch.matchScore}%)`)
        }
      } else {
        console.log(`ℹ️ No existing supplier found matching the parsed data`)
      }
      
      return null
    } catch (error) {
      console.warn('Supplier matching failed:', error.message)
      return null
    }
  }

  /**
   * Update PO job status in database
   */
  async updatePOJobStatus(purchaseOrderId, statusData) {
    await db.client.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: statusData
    })
  }

  // Helper methods for text extraction (simplified for demo)
  extractPONumber(text) {
    const poMatch = text.match(/(?:PO|P\.O\.?|Purchase Order)[:\s#]*([A-Z0-9-]+)/i)
    return poMatch ? poMatch[1] : null
  }

  extractSupplierName(text) {
    // Simple extraction - would be more sophisticated in production
    const lines = text.split('\n').filter(line => line.trim().length > 0)
    return lines[0] || 'Unknown Supplier'
  }

  extractOrderDate(text) {
    const dateMatch = text.match(/(?:Date|Order Date)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i)
    return dateMatch ? new Date(dateMatch[1]) : null
  }

  extractDueDate(text) {
    const dueMatch = text.match(/(?:Due|Delivery)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i)
    return dueMatch ? new Date(dueMatch[1]) : null
  }

  extractTotalAmount(text) {
    const totalMatch = text.match(/(?:Total|Amount Due)[:\s]*\$?([0-9,]+\.?\d*)/i)
    return totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : 0
  }

  extractCurrency(text) {
    if (text.includes('$') || text.includes('USD')) return 'USD'
    if (text.includes('€') || text.includes('EUR')) return 'EUR'
    if (text.includes('£') || text.includes('GBP')) return 'GBP'
    return 'USD'
  }

  extractLineItems(text) {
    // Simplified line item extraction
    const lines = text.split('\n')
    const items = []
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (this.looksLikeLineItem(line)) {
        const item = this.parseLineItem(line)
        if (item) items.push(item)
      }
    }
    
    return items.slice(0, 20) // Limit to 20 items
  }

  looksLikeLineItem(line) {
    // Simple heuristic - contains numbers and product-like text
    return line.length > 10 && /\d+/.test(line) && !/^(total|subtotal|tax)/i.test(line)
  }

  parseLineItem(line) {
    // Very simple parsing - would be more sophisticated in production
    const parts = line.split(/\s+/)
    if (parts.length < 3) return null
    
    return {
      sku: parts[0] || '',
      description: parts.slice(1, -2).join(' ') || 'Unknown Product',
      quantity: parseInt(parts[parts.length - 2]) || 1,
      unitPrice: parseFloat(parts[parts.length - 1]) || 0,
      confidence: 0.7
    }
  }
}

// Create and export singleton instance
export const poAnalysisJobProcessor = new POAnalysisJobProcessor()
export default poAnalysisJobProcessor