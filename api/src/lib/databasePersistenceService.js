import { db, prismaOperation } from './db.js'
import { autoMatchSupplier } from '../services/supplierMatchingService.js'

/**
 * Database Persistence Service for AI Processing Results
 * Handles saving structured AI outputs to the database with audit trails
 */
export class DatabasePersistenceService {
  constructor() {
    // Use shared warmup-aware Prisma client instead of creating new instance
    // This prevents connection pool exhaustion in serverless
    this.prisma = null // Will be set dynamically via db.getClient()
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
    const maxRetries = 3
    let lastError = null

    // Retry loop for transient connection errors
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`� Retry attempt ${attempt}/${maxRetries} after connection error`)
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt - 1), 5000)))
        }

        console.log(`�📊 Persisting AI results to database for ${fileName}`)
        console.log(`   Model: ${aiResult.model}, Confidence: ${(aiResult.confidence?.overall || 0)}%`)
        
        // Get shared Prisma client (warmup-aware)
        const prisma = await db.getClient()
        
        // Validate extracted data
        if (!aiResult.extractedData) {
          throw new Error('No extracted data in AI result')
        }
        
        // Log line items data for debugging
        const lineItemsData = aiResult.extractedData?.lineItems || aiResult.extractedData?.items || []
        console.log(`🔍 DEBUG - AI Result Structure:`)
        console.log(`   - Has extractedData: ${!!aiResult.extractedData}`)
        console.log(`   - extractedData.lineItems: ${aiResult.extractedData?.lineItems?.length || 0}`)
        console.log(`   - extractedData.items: ${aiResult.extractedData?.items?.length || 0}`)
        console.log(`   - extractedData keys:`, Object.keys(aiResult.extractedData || {}))
        console.log(`   - Full extractedData:`, JSON.stringify(aiResult.extractedData, null, 2))
        
        if (lineItemsData.length === 0) {
          console.warn(`⚠️ WARNING: No line items found in extracted data!`)
        }
        
        // Start database transaction with extended timeout for large POs
        const result = await prisma.$transaction(async (tx) => {
        
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
        
        // 3. Delete existing line items if updating (to avoid duplicates/stale data)
        if (options.purchaseOrderId) {
          console.log(`🗑️ Deleting existing line items for PO update...`)
          const deletedCount = await tx.pOLineItem.deleteMany({
            where: { purchaseOrderId: purchaseOrder.id }
          })
          console.log(`✅ Deleted ${deletedCount.count} existing line items`)
        }
        
        // 4. Create line items (fresh or initial creation)
        const lineItems = await this.createLineItems(
          tx,
          aiResult.extractedData?.lineItems || aiResult.extractedData?.items || [],
          purchaseOrder.id,
          aiResult.confidence?.lineItems || {}
        )
        
        console.log(`✅ Line items created in transaction:`)
        console.log(`   Count: ${lineItems.length}`)
        console.log(`   PO ID: ${purchaseOrder.id}`)
        console.log(`   Sample line item IDs: ${lineItems.slice(0, 2).map(li => li.id).join(', ')}`)
        
        // 5. Create AI processing audit record
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
        console.log(`   Line Items saved with PO ID: ${purchaseOrder.id}`)
        
        // Verify line items are actually in the transaction
        const verifyCount = await tx.pOLineItem.count({
          where: { purchaseOrderId: purchaseOrder.id }
        })
        console.log(`   ✓ Verification: ${verifyCount} line items in transaction before commit`)
        console.log(`   Audit ID: ${auditRecord.id}`)
        
        return {
          purchaseOrder,
          supplier,
          lineItems,
          auditRecord,
          processingTime: Date.now() - startTime
        }
      }, {
        maxWait: 20000, // Maximum time to wait to start transaction (20s, reduced from 30s)
        timeout: 60000 // Maximum transaction time (60s = 1 minute, reduced from 2 minutes for serverless)
      })
      
      // Verify line items persisted after transaction commit
        const postCommitCount = await prisma.pOLineItem.count({
          where: { purchaseOrderId: result.purchaseOrder.id }
        })
        console.log(`✅ POST-COMMIT VERIFICATION: ${postCommitCount} line items found for PO ${result.purchaseOrder.id}`)
        
        if (postCommitCount === 0 && result.lineItems.length > 0) {
          console.error(`❌ CRITICAL: Line items lost after commit! Created ${result.lineItems.length}, found ${postCommitCount}`)
        }
        
        // Update supplier performance metrics
        if (result.supplier) {
          await this.updateSupplierMetrics(result.supplier.id, aiResult.confidence?.overall)
        }
        
        // Success - return result and exit retry loop
        return {
          success: true,
          ...result
        }
        
      } catch (error) {
        lastError = error
        console.error(`❌ Database persistence failed (attempt ${attempt}/${maxRetries}):`, error.message)
        
        // Check if error is retryable (connection/engine errors)
        const isRetryable = error.message?.includes('Engine') || 
                           error.message?.includes('empty') ||
                           error.message?.includes('not yet connected') ||
                           error.message?.includes('timeout') ||
                           error.code === 'P1001' || // Can't reach database
                           error.code === 'P2024'    // Timed out fetching
        
        if (!isRetryable || attempt === maxRetries) {
          // Non-retryable error or max retries reached - throw
          throw new Error(`Database persistence failed after ${attempt} attempts: ${error.message}`)
        }
        
        // Will retry on next loop iteration
        console.log(`⏳ Will retry due to transient connection error...`)
      }
    }
    
    // Should never reach here (loop always returns or throws)
    throw new Error(`Database persistence failed after ${maxRetries} attempts: ${lastError?.message}`)
  }

  /**
   * Find existing supplier or create new one with fuzzy matching
   */
  async findOrCreateSupplier(tx, supplierName, vendorData, merchantId) {
    if (!supplierName) return null
    
    try {
      console.log(`🔍 Finding or creating supplier: ${supplierName}`)
      
      // Try exact match first (case-insensitive)
      let supplier = await tx.supplier.findFirst({
        where: {
          merchantId,
          name: {
            equals: supplierName,
            mode: 'insensitive'
          }
        }
      })
      
      if (supplier) {
        console.log(`✅ Found exact match supplier: ${supplier.name} (${supplier.id})`)
        
        // Update existing supplier PO count and info
        supplier = await tx.supplier.update({
          where: { id: supplier.id },
          data: {
            totalPOs: { increment: 1 },
            // Update contact info if provided and missing
            contactEmail: supplier.contactEmail || vendorData?.email || vendorData?.contactEmail,
            contactPhone: supplier.contactPhone || vendorData?.phone || vendorData?.contactPhone,
            address: supplier.address || vendorData?.address,
            website: supplier.website || vendorData?.website,
            updatedAt: new Date()
          }
        })
        
        return supplier
      }
      
      // No exact match - use fuzzy matching
      console.log(`🤖 No exact match, trying fuzzy matching...`)
      
      // Import the matching service inline to avoid circular dependencies
      const { findMatchingSuppliers } = await import('../services/supplierMatchingService.js')
      
      // Prepare parsed supplier data
      const parsedSupplier = {
        name: supplierName,
        email: vendorData?.email || vendorData?.contactEmail,
        phone: vendorData?.phone || vendorData?.contactPhone,
        address: vendorData?.address,
        website: vendorData?.website
      }
      
      // Find matches with high confidence threshold
      const matches = await findMatchingSuppliers(parsedSupplier, merchantId, {
        minScore: 0.85, // High confidence for auto-linking
        maxResults: 1,
        includeInactive: false
      })
      
      if (matches.length > 0) {
        const bestMatch = matches[0]
        console.log(`🎯 Found fuzzy match: ${bestMatch.supplier.name} (score: ${bestMatch.matchScore})`)
        
        // Update the matched supplier
        supplier = await tx.supplier.update({
          where: { id: bestMatch.supplier.id },
          data: {
            totalPOs: { increment: 1 },
            // Update missing contact info
            contactEmail: supplier?.contactEmail || vendorData?.email || vendorData?.contactEmail,
            contactPhone: supplier?.contactPhone || vendorData?.phone || vendorData?.contactPhone,
            address: supplier?.address || vendorData?.address,
            website: supplier?.website || vendorData?.website,
            updatedAt: new Date()
          }
        })
        
        console.log(`✅ Linked to existing supplier via fuzzy match`)
        return supplier
      }
      
      // No match found - create new supplier
      console.log(`📝 No match found, creating new supplier: ${supplierName}`)
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
      
      return supplier
      
    } catch (error) {
      console.warn('⚠️ Supplier creation/update failed:', error.message)
      console.warn('Stack:', error.stack)
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
    
    // Extract PO number from AI result
    const extractedPoNumber = extractedData.poNumber || extractedData.number || `AI-${Date.now()}`
    
    console.log(`📝 Creating purchase order with number: ${extractedPoNumber}`)
    
    try {
      // Try to create the purchase order
      const purchaseOrder = await tx.purchaseOrder.create({
        data: {
          number: extractedPoNumber,
          supplierName: extractedData.vendor?.name || extractedData.supplierName || 'Unknown',
          orderDate: parseDate(extractedData.orderDate || extractedData.date),
          dueDate: parseDate(extractedData.dueDate || extractedData.deliveryDate),
          totalAmount: totalAmount,
          currency: extractedData.currency || 'USD',
          status: status,
          confidence: overallConfidence / 100, // Store as 0-1 range
          rawData: extractedData, // Store all extracted data
          processingNotes: aiResult.processingNotes || (aiResult.model ? `Processed by ${aiResult.model}` : 'Processing in progress...'),
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
      
    } catch (error) {
      // Handle unique constraint violation (duplicate PO number)
      if (error.code === 'P2002') {
        console.log(`⚠️ PO number ${extractedPoNumber} already exists, finding and updating instead...`)
        
        // Find the existing PO
        const existingPO = await tx.purchaseOrder.findFirst({
          where: {
            merchantId: merchantId,
            number: extractedPoNumber
          }
        })
        
        if (existingPO) {
          console.log(`✅ Found existing PO ${existingPO.id}, updating with new AI data...`)
          // Update the existing PO instead
          return await this.updatePurchaseOrder(tx, existingPO.id, aiResult, merchantId, fileName, supplierId, options)
        } else {
          // Shouldn't happen, but fallback to unique number
          console.error(`❌ Unique constraint failed but couldn't find existing PO, generating unique number...`)
          const uniqueNumber = `${extractedPoNumber}-${Date.now()}`
          const purchaseOrder = await tx.purchaseOrder.create({
            data: {
              number: uniqueNumber,
              supplierName: extractedData.vendor?.name || extractedData.supplierName || 'Unknown',
              orderDate: parseDate(extractedData.orderDate || extractedData.date),
              dueDate: parseDate(extractedData.dueDate || extractedData.deliveryDate),
              totalAmount: totalAmount,
              currency: extractedData.currency || 'USD',
              status: status,
              confidence: overallConfidence / 100,
              rawData: extractedData,
              processingNotes: aiResult.processingNotes || (aiResult.model ? `Processed by ${aiResult.model}` : 'Processing in progress...'),
              fileName: fileName,
              fileSize: options.fileSize || null,
              fileUrl: options.fileUrl || null,
              merchantId: merchantId,
              supplierId: supplierId,
              jobStatus: 'completed'
            }
          })
          console.log(`📋 Created purchase order with unique number: ${purchaseOrder.number}`)
          return purchaseOrder
        }
      }
      // Re-throw other errors
      throw error
    }
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
      processingNotes: aiResult.processingNotes || (aiResult.model ? `Processed by ${aiResult.model}` : 'Processing in progress...'),
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
   * Parse currency string to float (handles $, commas, etc.)
   */
  parseCurrency(value) {
    if (value === null || value === undefined || value === '') {
      return 0
    }
    
    // If already a number, return it
    if (typeof value === 'number') {
      return value
    }
    
    // Convert to string and remove currency symbols, commas, spaces
    const cleaned = String(value)
      .replace(/[$€£¥₹,\s]/g, '') // Remove common currency symbols and commas
      .trim()
    
    // Parse to float
    const parsed = parseFloat(cleaned)
    
    // Return 0 if parsing failed (NaN)
    return isNaN(parsed) ? 0 : parsed
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
        // Parse currency values properly
        const quantity = parseInt(item.quantity) || 1
        const unitCost = this.parseCurrency(item.unitPrice || item.price || item.cost || item.unitCost)
        const totalCost = this.parseCurrency(item.totalPrice || item.total || item.lineTotal) 
          || (quantity * unitCost) // Calculate if not provided
        
        console.log(`  💰 Line item ${i + 1} pricing: quantity=${quantity}, unitCost=${unitCost}, totalCost=${totalCost}`)
        
        const lineItem = await tx.pOLineItem.create({
          data: {
            sku: item.sku || item.productCode || item.itemNumber || `AUTO-${i + 1}`,
            productName: item.productName || item.description || item.name || 'Unknown Product',
            description: item.description || item.productName || null,
            quantity: quantity,
            unitCost: unitCost,
            totalCost: totalCost,
            confidence: itemConfidence / 100, // Store as 0-1 range
            status: itemConfidence >= 80 ? 'pending' : 'review_needed',
            aiNotes: `AI extracted: ${JSON.stringify(item)}`,
            purchaseOrder: {
              connect: { id: purchaseOrderId }
            }
          }
        })
        
        lineItems.push(lineItem)
        console.log(`  📦 Line item ${i + 1}: ${lineItem.productName} x${lineItem.quantity} @ $${lineItem.unitCost} = $${lineItem.totalCost}`)
        
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
      await prismaOperation(
        (client) => client.supplier.update({
          where: { id: supplierId },
          data: {
            averageAccuracy: confidence ? confidence / 100 : undefined,
            lastSync: new Date()
          }
        }),
        'Update supplier metrics'
      )
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
      const stats = await prismaOperation(
        (client) => client.aIProcessingAudit.aggregate({
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
        }),
        'Get processing stats aggregate'
      )
      
      const statusCounts = await prismaOperation(
        (client) => client.aIProcessingAudit.groupBy({
          by: ['status'],
          where: {
            createdAt: { gte: startDate },
            purchaseOrder: { merchantId }
          },
          _count: { id: true }
        }),
        'Get status counts'
      )
      
      const modelUsage = await prismaOperation(
        (client) => client.aIProcessingAudit.groupBy({
          by: ['model'],
          where: {
            createdAt: { gte: startDate },
            purchaseOrder: { merchantId }
          },
          _count: { id: true },
          _sum: { tokenCount: true }
        }),
        'Get model usage'
      )
      
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
      return await prismaOperation(
        (client) => client.purchaseOrder.findMany({
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
        }),
        'Get recent processing'
      )
    } catch (error) {
      console.error('❌ Failed to get recent processing:', error.message)
      return []
    }
  }

  /**
   * Close database connection (no-op now that we use shared client)
   */
  async disconnect() {
    // No-op: shared client is managed by db.js
    console.log('📝 DatabasePersistenceService.disconnect() called (no-op with shared client)')
  }
}

export default DatabasePersistenceService