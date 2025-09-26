import { PrismaClient } from '@prisma/client'

/**
 * Database Persistence Service for AI Processing Results
 * Handles saving structured AI outputs to the database with audit trails
 */
export class DatabasePersistenceService {
  constructor() {
    this.prisma = new PrismaClient()
  }

  /**
   * Persist AI processing results to database
   * @param {Object} aiResult - AI processing result from aiProcessingService
   * @param {string} merchantId - Merchant ID for data isolation
   * @param {string} fileName - Original file name
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Database persistence result
   */
  async persistAIResults(aiResult, merchantId, fileName, options = {}) {
    const startTime = Date.now()
    
    try {
      console.log(`📊 Persisting AI results to database for ${fileName}`)
      console.log(`   Model: ${aiResult.model}, Confidence: ${(aiResult.confidence?.overall || 0)}%`)
      
      // Start database transaction
      const result = await this.prisma.$transaction(async (tx) => {
        
        // 1. Find or create supplier
        const supplier = await this.findOrCreateSupplier(
          tx, 
          aiResult.extractedData?.vendor?.name || aiResult.extractedData?.supplierName,
          aiResult.extractedData?.vendor,
          merchantId
        )
        
        // 2. Update existing purchase order or create new one
        console.log(`🔍 Database save mode check:`)
        console.log(`   options.purchaseOrderId:`, options.purchaseOrderId)
        console.log(`   Will ${options.purchaseOrderId ? 'UPDATE' : 'CREATE'} purchase order`)
        
        const purchaseOrder = options.purchaseOrderId 
          ? await this.updatePurchaseOrder(
              tx,
              options.purchaseOrderId,
              aiResult,
              merchantId,
              fileName,
              supplier?.id,
              options
            )
          : await this.createPurchaseOrder(
              tx,
              aiResult,
              merchantId,
              fileName,
              supplier?.id,
              options
            )
        
        // 3. Create line items
        const lineItems = await this.createLineItems(
          tx,
          aiResult.extractedData?.lineItems || aiResult.extractedData?.items || [],
          purchaseOrder.id,
          aiResult.confidence?.lineItems || {}
        )
        
        // 4. Create AI processing audit record
        const auditRecord = await this.createAIAuditRecord(
          tx,
          aiResult,
          purchaseOrder.id,
          fileName,
          options
        )
        
        console.log(`✅ Database persistence completed:`)
        console.log(`   PO ID: ${purchaseOrder.id}`)
        console.log(`   Supplier: ${supplier?.name || 'Not matched'}`)
        console.log(`   Line Items: ${lineItems.length}`)
        console.log(`   Audit ID: ${auditRecord.id}`)
        
        return {
          purchaseOrder,
          supplier,
          lineItems,
          auditRecord,
          processingTime: Date.now() - startTime
        }
      })
      
      // Update supplier performance metrics
      if (result.supplier) {
        await this.updateSupplierMetrics(result.supplier.id, aiResult.confidence?.overall)
      }
      
      return {
        success: true,
        ...result
      }
      
    } catch (error) {
      console.error('❌ Database persistence failed:', error.message)
      return {
        success: false,
        error: error.message,
        processingTime: Date.now() - startTime
      }
    }
  }

  /**
   * Find existing supplier or create new one
   */
  async findOrCreateSupplier(tx, supplierName, vendorData, merchantId) {
    if (!supplierName) return null
    
    try {
      // Try to find existing supplier (case-insensitive)
      let supplier = await tx.supplier.findFirst({
        where: {
          merchantId,
          name: {
            equals: supplierName,
            mode: 'insensitive'
          }
        }
      })
      
      if (!supplier) {
        // Create new supplier
        console.log(`📝 Creating new supplier: ${supplierName}`)
        supplier = await tx.supplier.create({
          data: {
            name: supplierName,
            merchantId,
            contactEmail: vendorData?.email || vendorData?.contactEmail,
            contactPhone: vendorData?.phone || vendorData?.contactPhone,
            address: vendorData?.address,
            website: vendorData?.website,
            status: 'active',
            totalPOs: 1
          }
        })
        console.log(`✅ New supplier created: ${supplier.id}`)
      } else {
        // Update existing supplier PO count
        supplier = await tx.supplier.update({
          where: { id: supplier.id },
          data: {
            totalPOs: { increment: 1 },
            // Update contact info if provided and missing
            contactEmail: supplier.contactEmail || vendorData?.email,
            contactPhone: supplier.contactPhone || vendorData?.phone,
            address: supplier.address || vendorData?.address,
            website: supplier.website || vendorData?.website
          }
        })
        console.log(`📊 Updated existing supplier: ${supplier.name}`)
      }
      
      return supplier
      
    } catch (error) {
      console.warn('⚠️ Supplier creation/update failed:', error.message)
      return null
    }
  }

  /**
   * Create purchase order record
   */
  async createPurchaseOrder(tx, aiResult, merchantId, fileName, supplierId, options) {
    const extractedData = aiResult.extractedData
    const confidence = aiResult.confidence || {}
    
    // Validate we have extracted data
    if (!extractedData) {
      throw new Error('No extracted data available for purchase order creation')
    }
    
    // Parse dates safely
    const parseDate = (dateStr) => {
      if (!dateStr) return null
      try {
        const parsed = new Date(dateStr)
        return isNaN(parsed.getTime()) ? null : parsed
      } catch {
        return null
      }
    }
    
    // Calculate total amount with better fallbacks
    let totalAmount = 0
    if (extractedData.totals?.total) {
      totalAmount = extractedData.totals.total
    } else if (extractedData.total) {
      totalAmount = extractedData.total
    } else if (extractedData.grandTotal) {
      totalAmount = extractedData.grandTotal
    } else if (extractedData.totalAmount) {
      totalAmount = extractedData.totalAmount
    } else if (extractedData.lineItems && Array.isArray(extractedData.lineItems)) {
      totalAmount = extractedData.lineItems.reduce((sum, item) => 
        sum + (parseFloat(item.totalPrice || item.total || item.lineTotal || 0)), 0)
    } else if (extractedData.items && Array.isArray(extractedData.items)) {
      totalAmount = extractedData.items.reduce((sum, item) => 
        sum + (parseFloat(item.totalPrice || item.total || item.lineTotal || 0)), 0)
    }
    
    // Ensure totalAmount is a valid number
    totalAmount = parseFloat(totalAmount) || 0
    
    // Determine status based on confidence
    const overallConfidence = confidence.overall || 0
    let status = 'pending'
    if (overallConfidence >= 90) status = 'processed'
    else if (overallConfidence >= 70) status = 'processing'
    else if (overallConfidence >= 50) status = 'review_needed'
    else status = 'failed'
    
    const purchaseOrder = await tx.purchaseOrder.create({
      data: {
        number: extractedData.poNumber || extractedData.number || `AI-${Date.now()}`,
        supplierName: extractedData.vendor?.name || extractedData.supplierName || 'Unknown',
        orderDate: parseDate(extractedData.orderDate || extractedData.date),
        dueDate: parseDate(extractedData.dueDate || extractedData.deliveryDate),
        totalAmount: totalAmount,
        currency: extractedData.currency || 'USD',
        status: status,
        confidence: overallConfidence / 100, // Store as 0-1 range
        rawData: extractedData, // Store all extracted data
        processingNotes: aiResult.processingNotes || `Processed by ${aiResult.model}`,
        fileName: fileName,
        fileSize: options.fileSize || null,
        fileUrl: options.fileUrl || null,
        merchantId: merchantId,
        supplierId: supplierId,
        jobStatus: 'completed'
      }
    })
    
    console.log(`📋 Created purchase order: ${purchaseOrder.number} (${status})`)
    return purchaseOrder
  }

  /**
   * Update existing purchase order record with AI results
   */
  async updatePurchaseOrder(tx, purchaseOrderId, aiResult, merchantId, fileName, supplierId, options) {
    console.log(`📝 updatePurchaseOrder called:`)
    console.log(`   PO ID: ${purchaseOrderId}`)
    console.log(`   File Name: ${fileName}`)
    console.log(`   AI Confidence: ${aiResult.confidence?.overall}%`)
    
    const extractedData = aiResult.extractedData
    const confidence = aiResult.confidence || {}
    
    // Validate we have extracted data
    if (!extractedData) {
      throw new Error('No extracted data available for purchase order update')
    }
    
    // Parse dates safely
    const parseDate = (dateStr) => {
      if (!dateStr) return null
      try {
        const parsed = new Date(dateStr)
        return isNaN(parsed.getTime()) ? null : parsed
      } catch {
        return null
      }
    }
    
    // Calculate total amount with better fallbacks
    let totalAmount = 0
    if (extractedData.totals?.total) {
      totalAmount = extractedData.totals.total
    } else if (extractedData.total) {
      totalAmount = extractedData.total
    } else if (extractedData.grandTotal) {
      totalAmount = extractedData.grandTotal
    } else if (extractedData.totalAmount) {
      totalAmount = extractedData.totalAmount
    } else if (extractedData.lineItems && Array.isArray(extractedData.lineItems)) {
      totalAmount = extractedData.lineItems.reduce((sum, item) => 
        sum + (parseFloat(item.totalPrice || item.total || item.lineTotal || 0)), 0)
    } else if (extractedData.items && Array.isArray(extractedData.items)) {
      totalAmount = extractedData.items.reduce((sum, item) => 
        sum + (parseFloat(item.totalPrice || item.total || item.lineTotal || 0)), 0)
    }
    
    // Ensure totalAmount is a valid number
    totalAmount = parseFloat(totalAmount) || 0
    
    // Determine status based on confidence
    const overallConfidence = confidence.overall || 0
    let status = 'pending'
    if (overallConfidence >= 90) status = 'processed'
    else if (overallConfidence >= 70) status = 'processing'
    else if (overallConfidence >= 50) status = 'review_needed'
    else status = 'failed'
    
    // Generate a unique PO number that won't conflict
    let poNumber = extractedData.poNumber || extractedData.number || `PO-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    // Ensure PO number is unique by adding timestamp if needed
    if (!extractedData.poNumber && !extractedData.number) {
      poNumber = `AUTO-PO-${Date.now()}-${purchaseOrderId.slice(-8)}`
    }

    // When updating, only update the number if it's empty or if we have a better extracted value
    const updateData = {
      supplierName: extractedData.vendor?.name || extractedData.supplierName || 'Unknown',
      orderDate: parseDate(extractedData.orderDate || extractedData.date),
      dueDate: parseDate(extractedData.dueDate || extractedData.deliveryDate),
      totalAmount: totalAmount,
      currency: extractedData.currency || 'USD',
      status: status,
      confidence: overallConfidence / 100, // Store as 0-1 range
      rawData: extractedData, // Store all extracted data
      processingNotes: aiResult.processingNotes || `Processed by ${aiResult.model}`,
      supplierId: supplierId,
      jobStatus: 'completed',
      updatedAt: new Date()
    }
    
    // Only update the number if we have extracted PO number and it's different
    if (extractedData.poNumber || extractedData.number) {
      const extractedPoNumber = extractedData.poNumber || extractedData.number
      console.log(`   Extracted PO number: ${extractedPoNumber}`)
      
      // Check if this number would conflict by fetching current PO
      try {
        const currentPO = await tx.purchaseOrder.findUnique({
          where: { id: purchaseOrderId },
          select: { number: true, merchantId: true }
        })
        
        if (currentPO && currentPO.number !== extractedPoNumber) {
          // Check if the extracted number conflicts with another PO
          const conflictingPO = await tx.purchaseOrder.findFirst({
            where: {
              merchantId: currentPO.merchantId,
              number: extractedPoNumber,
              id: { not: purchaseOrderId } // Exclude current PO
            }
          })
          
          if (!conflictingPO) {
            updateData.number = extractedPoNumber
            console.log(`   ✅ Updating PO number to: ${extractedPoNumber}`)
          } else {
            console.log(`   ⚠️ PO number ${extractedPoNumber} conflicts with existing PO, keeping current number: ${currentPO.number}`)
          }
        }
      } catch (error) {
        console.log(`   ⚠️ Could not check PO number conflicts, keeping current number:`, error.message)
      }
    }

    try {
      const purchaseOrder = await tx.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: updateData
      })
      
      console.log(`📋 Updated purchase order: ${purchaseOrder.number} (${status})`)
      return purchaseOrder
    } catch (updateError) {
      if (updateError.code === 'P2025') {
        console.log(`❌ Purchase order ${purchaseOrderId} not found for update, creating new one instead`)
        // Fallback to creating a new purchase order
        return await this.createPurchaseOrder(tx, aiResult, merchantId, fileName, supplierId, options)
      }
      throw updateError
    }
  }

  /**
   * Create line items for purchase order
   */
  async createLineItems(tx, lineItemsData, purchaseOrderId, lineItemsConfidence) {
    if (!Array.isArray(lineItemsData) || lineItemsData.length === 0) {
      console.log('⚠️ No line items to create')
      return []
    }
    
    const lineItems = []
    
    for (let i = 0; i < lineItemsData.length; i++) {
      const item = lineItemsData[i]
      const itemConfidence = lineItemsConfidence[i] || lineItemsConfidence.overall || 50
      
      try {
        const lineItem = await tx.pOLineItem.create({
          data: {
            sku: item.sku || item.productCode || item.itemNumber || `AUTO-${i + 1}`,
            productName: item.productName || item.description || item.name || 'Unknown Product',
            description: item.description || item.productName || null,
            quantity: parseInt(item.quantity) || 1,
            unitCost: parseFloat(item.unitPrice || item.price || item.cost || 0),
            totalCost: parseFloat(item.totalPrice || item.total || 
              (item.quantity * (item.unitPrice || item.price || item.cost)) || 0),
            confidence: itemConfidence / 100, // Store as 0-1 range
            status: itemConfidence >= 80 ? 'pending' : 'review_needed',
            aiNotes: `AI extracted: ${JSON.stringify(item)}`,
            purchaseOrderId: purchaseOrderId
          }
        })
        
        lineItems.push(lineItem)
        console.log(`  📦 Line item ${i + 1}: ${lineItem.productName} x${lineItem.quantity}`)
        
      } catch (error) {
        console.warn(`⚠️ Failed to create line item ${i + 1}:`, error.message)
      }
    }
    
    return lineItems
  }

  /**
   * Create AI processing audit record
   */
  async createAIAuditRecord(tx, aiResult, purchaseOrderId, fileName, options) {
    const auditRecord = await tx.aIProcessingAudit.create({
      data: {
        model: aiResult.model || 'unknown',
        tokenCount: aiResult.tokensUsed || 0,
        processingTime: aiResult.processingTime || 0,
        confidence: (aiResult.confidence?.overall || 0) / 100, // Store as 0-1 range
        processingMethod: aiResult.processingMethod || 'unknown',
        inputType: aiResult.inputType || 'text',
        inputSize: options.inputSize || null,
        fileName: fileName,
        documentType: aiResult.documentType || 'purchase_order',
        industry: aiResult.industry || null,
        extractedFields: aiResult.extractedData || {},
        confidenceBreakdown: aiResult.confidence || {},
        dataQuality: aiResult.dataQuality || 'unknown',
        status: aiResult.success ? 'success' : 'failure',
        errorMessage: aiResult.error || null,
        warningMessages: aiResult.warnings || [],
        purchaseOrderId: purchaseOrderId
      }
    })
    
    console.log(`🔍 AI audit record created: ${auditRecord.id}`)
    return auditRecord
  }

  /**
   * Update supplier performance metrics
   */
  async updateSupplierMetrics(supplierId, confidence) {
    try {
      await this.prisma.supplier.update({
        where: { id: supplierId },
        data: {
          averageAccuracy: confidence ? confidence / 100 : undefined,
          lastSync: new Date()
        }
      })
    } catch (error) {
      console.warn('⚠️ Failed to update supplier metrics:', error.message)
    }
  }

  /**
   * Get AI processing statistics for a merchant
   */
  async getProcessingStats(merchantId, timeRange = '30d') {
    const startDate = new Date()
    if (timeRange === '24h') startDate.setHours(startDate.getHours() - 24)
    else if (timeRange === '7d') startDate.setDate(startDate.getDate() - 7)
    else if (timeRange === '30d') startDate.setDate(startDate.getDate() - 30)
    else if (timeRange === '90d') startDate.setDate(startDate.getDate() - 90)
    
    try {
      const stats = await this.prisma.aIProcessingAudit.aggregate({
        where: {
          createdAt: { gte: startDate },
          purchaseOrder: { merchantId }
        },
        _count: { id: true },
        _sum: { tokenCount: true },
        _avg: { 
          confidence: true,
          processingTime: true
        }
      })
      
      const statusCounts = await this.prisma.aIProcessingAudit.groupBy({
        by: ['status'],
        where: {
          createdAt: { gte: startDate },
          purchaseOrder: { merchantId }
        },
        _count: { id: true }
      })
      
      const modelUsage = await this.prisma.aIProcessingAudit.groupBy({
        by: ['model'],
        where: {
          createdAt: { gte: startDate },
          purchaseOrder: { merchantId }
        },
        _count: { id: true },
        _sum: { tokenCount: true }
      })
      
      return {
        totalProcessed: stats._count.id || 0,
        totalTokens: stats._sum.tokenCount || 0,
        avgConfidence: Math.round((stats._avg.confidence || 0) * 100),
        avgProcessingTime: Math.round(stats._avg.processingTime || 0),
        statusBreakdown: statusCounts.reduce((acc, item) => {
          acc[item.status] = item._count.id
          return acc
        }, {}),
        modelUsage: modelUsage.map(item => ({
          model: item.model,
          count: item._count.id,
          tokens: item._sum.tokenCount || 0
        }))
      }
      
    } catch (error) {
      console.error('❌ Failed to get processing stats:', error.message)
      return null
    }
  }

  /**
   * Get recent processing results for dashboard
   */
  async getRecentProcessing(merchantId, limit = 10) {
    try {
      return await this.prisma.purchaseOrder.findMany({
        where: { merchantId },
        include: {
          supplier: { select: { name: true } },
          lineItems: { select: { id: true, productName: true, confidence: true } },
          aiAuditTrail: { 
            select: { model: true, tokenCount: true, confidence: true, status: true },
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit
      })
    } catch (error) {
      console.error('❌ Failed to get recent processing:', error.message)
      return []
    }
  }

  /**
   * Close database connection
   */
  async disconnect() {
    await this.prisma.$disconnect()
  }
}

export default DatabasePersistenceService