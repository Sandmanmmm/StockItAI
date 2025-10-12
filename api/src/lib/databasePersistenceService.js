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
        
        // ⚡ CRITICAL OPTIMIZATION #1: Find/create supplier BEFORE transaction starts
        // This avoids expensive fuzzy matching (50+ seconds) inside the 8-second transaction timeout
        console.log(`🔍 [PRE-TRANSACTION] Finding or creating supplier...`)
        const preTransactionStart = Date.now()
        const supplier = await this.findOrCreateSupplier(
          prisma, // Use regular client, not transaction
          aiResult.extractedData?.vendor?.name || aiResult.extractedData?.supplierName,
          aiResult.extractedData?.vendor,
          merchantId
        )
        console.log(`✅ [PRE-TRANSACTION] Supplier resolved in ${Date.now() - preTransactionStart}ms`)
        
        await this.preparePurchaseOrderNumberSuggestion(
          prisma,
          aiResult,
          merchantId,
          Boolean(options.purchaseOrderId)
        )

        // Start database transaction - now only fast writes, no expensive queries
        const txStartTime = Date.now()
        const txId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        console.log(`� [${txId}] Starting transaction...`)
        
        const result = await prisma.$transaction(async (tx) => {
          const txAge = Date.now() - txStartTime
          console.log(`🔒 [${txId}] Inside transaction (age: ${txAge}ms)`)
        // Supplier already resolved above - just use the result
        
        // 2. Update existing purchase order or create new one
        console.log(`🔍 Database save mode check:`)
        console.log(`   options.purchaseOrderId:`, options.purchaseOrderId)
        console.log(`   Will ${options.purchaseOrderId ? 'UPDATE' : 'CREATE'} purchase order`)
        
        const step1Start = Date.now()
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
        console.log(`⏱️ [${txId}] Step 1 (${options.purchaseOrderId ? 'UPDATE' : 'CREATE'} PO) took ${Date.now() - step1Start}ms`)
        
        // 3. Delete existing line items if updating (to avoid duplicates/stale data)
        if (options.purchaseOrderId) {
          console.log(`🗑️ Deleting existing line items for PO update...`)
          const step2Start = Date.now()
          const deletedCount = await tx.pOLineItem.deleteMany({
            where: { purchaseOrderId: purchaseOrder.id }
          })
          console.log(`⏱️ [${txId}] Step 2 (DELETE line items) took ${Date.now() - step2Start}ms - deleted ${deletedCount.count} items`)
        }
        
        // 4. Create line items (fresh or initial creation)
        const step3Start = Date.now()
        const lineItems = await this.createLineItems(
          tx,
          aiResult.extractedData?.lineItems || aiResult.extractedData?.items || [],
          purchaseOrder.id,
          aiResult.confidence?.lineItems || {}
        )
        console.log(`⏱️ [${txId}] Step 3 (CREATE ${lineItems.length} line items) took ${Date.now() - step3Start}ms`)
        
        console.log(`✅ Line items created in transaction:`)
        console.log(`   Count: ${lineItems.length}`)
        console.log(`   PO ID: ${purchaseOrder.id}`)
        console.log(`   Sample line item IDs: ${lineItems.slice(0, 2).map(li => li.id).join(', ')}`)
        
        // 5. Create AI processing audit record
        const step4Start = Date.now()
        const auditRecord = await this.createAIAuditRecord(
          tx,
          aiResult,
          purchaseOrder.id,
          fileName,
          options
        )
        console.log(`⏱️ [${txId}] Step 4 (CREATE audit record) took ${Date.now() - step4Start}ms`)
        console.log(`⏱️ [${txId}] Step 4 (CREATE audit record) took ${Date.now() - step4Start}ms`)
        
        console.log(`✅ Database persistence completed:`)
        console.log(`   PO ID: ${purchaseOrder.id}`)
        console.log(`   Supplier: ${supplier?.name || 'Not matched'}`)
        console.log(`   Line Items: ${lineItems.length}`)
        console.log(`   Line Items saved with PO ID: ${purchaseOrder.id}`)
        
        // Verify line items are actually in the transaction
        const step5Start = Date.now()
        const verifyCount = await tx.pOLineItem.count({
          where: { purchaseOrderId: purchaseOrder.id }
        })
        console.log(`⏱️ [${txId}] Step 5 (VERIFY line items count) took ${Date.now() - step5Start}ms`)
        console.log(`   ✓ Verification: ${verifyCount} line items in transaction before commit`)
        console.log(`   Audit ID: ${auditRecord.id}`)
        
        const txDuration = Date.now() - txStartStart
        console.log(`🔒 [${txId}] Transaction body complete (duration: ${txDuration}ms)`)
        console.log(`📊 [${txId}] Transaction Breakdown:`)
        console.log(`   - Step 1 (PO ${options.purchaseOrderId ? 'update' : 'create'}): ${step1Start ? (Date.now() - txStartTime - (Date.now() - step1Start)) : 0}ms`)
        console.log(`   - Step 2 (Delete line items): ${options.purchaseOrderId ? 'included' : 'skipped'}`)
        console.log(`   - Step 3 (Create line items): timing logged above`)
        console.log(`   - Step 4 (Create audit): timing logged above`)
        console.log(`   - Step 5 (Verify count): timing logged above`)
        
        if (txDuration > 5000) {
          console.error(`🚨 [${txId}] CRITICAL: Transaction took ${txDuration}ms - exceeds 5s threshold!`)
          console.error(`🚨 [${txId}] This indicates a serious performance issue inside the transaction`)
        }
        
        return {
          purchaseOrder,
          supplier,
          lineItems,
          auditRecord,
          processingTime: Date.now() - startTime
        }
      }, {
        maxWait: 15000, // Maximum time to wait to start transaction (15s - handle slow connection acquisition)
        timeout: 10000, // Maximum transaction time (10s - FAST WRITES ONLY, expensive queries already moved outside)
        isolationLevel: 'ReadCommitted' // Reduce lock contention
      })
      
      const txCommitDuration = Date.now() - txStartTime
      console.log(`🔒 [${txId}] Transaction committed successfully (total: ${txCommitDuration}ms)`)
      
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
        
        // Check if error is retryable (connection/engine errors/transaction errors)
        const isRetryable = error.message?.includes('Engine') || 
                           error.message?.includes('empty') ||
                           error.message?.includes('not yet connected') ||
                           error.message?.includes('timeout') ||
                           error.message?.includes('Transaction') || // Transaction errors are retryable
                           error.message?.includes('expired') ||
                           error.message?.includes('closed') ||
                           error.code === 'P1001' || // Can't reach database
                           error.code === 'P2024'    // Timed out fetching
        
        if (!isRetryable || attempt === maxRetries) {
          // Non-retryable error or max retries reached - throw
          throw new Error(`Database persistence failed after ${attempt} attempts: ${error.message}`)
        }
        
        // Transaction expired/closed - force reconnect before retry
        if (error.message?.includes('Transaction') || error.message?.includes('expired') || error.message?.includes('closed')) {
          console.log(`🔄 Transaction error detected, forcing fresh connection before retry...`)
          try {
            await db.forceReconnect()
          } catch (reconnectError) {
            console.warn(`⚠️ Force reconnect failed (will retry anyway):`, reconnectError.message)
          }
        }
        
        // Will retry on next loop iteration
        console.log(`⏳ Will retry due to transient connection/transaction error...`)
      }
    }
    
    // Should never reach here (loop always returns or throws)
    throw new Error(`Database persistence failed after ${maxRetries} attempts: ${lastError?.message}`)
  }

  async preparePurchaseOrderNumberSuggestion(prisma, aiResult, merchantId, isUpdate = false) {
    const extractedData = aiResult?.extractedData
    if (!extractedData || isUpdate) {
      return
    }

    const originalPoNumber = extractedData.poNumber || extractedData.number
    if (!originalPoNumber) {
      return
    }

    try {
      const lookupStart = Date.now()
      const existingPOs = await prisma.purchaseOrder.findMany({
        where: {
          merchantId,
          number: {
            startsWith: originalPoNumber
          }
        },
        select: { number: true }
      })

      console.log(
        `🔍 [PRE-TRANSACTION] PO number scan for ${originalPoNumber} completed in ${Date.now() - lookupStart}ms (found ${existingPOs.length})`
      )

      if (existingPOs.length === 0) {
        return
      }

      const existingSuffixes = new Set()
      existingPOs.forEach((po) => {
        if (po.number === originalPoNumber) {
          existingSuffixes.add(0)
        } else if (po.number.startsWith(`${originalPoNumber}-`)) {
          const suffixPart = po.number.substring(originalPoNumber.length + 1)
          if (/^\d+$/.test(suffixPart)) {
            existingSuffixes.add(parseInt(suffixPart, 10))
          }
        }
      })

      let suffix = 1
      while (existingSuffixes.has(suffix) && suffix <= 100) {
        suffix++
      }

      if (suffix > 100) {
        console.warn(
          `⚠️ [PRE-TRANSACTION] Could not find available suffix for PO number ${originalPoNumber} after 100 attempts`
        )
        return
      }

      const suggestedPoNumber = `${originalPoNumber}-${suffix}`
      console.log(
        `✅ [PRE-TRANSACTION] Suggesting unique PO number ${suggestedPoNumber} (existing suffixes: ${Array.from(existingSuffixes).sort((a, b) => a - b).join(', ')})`
      )

      extractedData.poNumber = suggestedPoNumber
      extractedData.number = suggestedPoNumber
    } catch (error) {
      console.warn(`⚠️ [PRE-TRANSACTION] PO number suggestion failed (non-critical): ${error.message}`)
    }
  }

  /**
   * Find existing supplier or create new one with fuzzy matching
   */
  /**
   * Find existing supplier or create new one
   * @param {Object} client - Prisma client OR transaction client
   * @param {string} supplierName - Supplier name
   * @param {Object} vendorData - Vendor data from AI extraction
   * @param {string} merchantId - Merchant ID
   * @returns {Promise<Object|null>} Supplier record or null
   */
  async findOrCreateSupplier(client, supplierName, vendorData, merchantId) {
    if (!supplierName) return null
    
    try {
      console.log(`🔍 Finding or creating supplier: ${supplierName}`)
      
      // Try exact match first (case-insensitive)
      let supplier = await client.supplier.findFirst({
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
        supplier = await client.supplier.update({
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
        supplier = await client.supplier.update({
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
      supplier = await client.supplier.create({
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
      // OPTIMISTIC LOCKING FALLBACK (Solution 2)
      // Handle unique constraint violation with automatic suffix retry
      if (error.code === 'P2002') {
        console.log(`⚠️ PO number ${extractedPoNumber} conflicts (pre-check race condition or concurrent upload)`)
        console.warn(`⚠️ CONFLICT RESOLUTION INSIDE TRANSACTION - this can be slow!`)
        console.log(`   Using optimistic locking fallback to find next available suffix...`)
        
        // 🔥 CRITICAL FIX: Limit attempts to 10 instead of 100 to prevent transaction timeout
        // If we can't find a free suffix in 10 tries, use timestamp fallback immediately
        const basePoNumber = extractedPoNumber
        let suffix = 1
        let attempts = 0
        const maxAttempts = 10 // ← REDUCED FROM 100 to prevent long transaction times
        
        const conflictResolutionStart = Date.now()
        
        while (attempts < maxAttempts) {
          const tryNumber = `${basePoNumber}-${suffix}`
          
          try {
            console.log(`   Attempt ${attempts + 1}/${maxAttempts}: Trying suffix ${suffix} → ${tryNumber}`)
            
            const purchaseOrder = await tx.purchaseOrder.create({
              data: {
                number: tryNumber,
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
            
            const conflictResolutionTime = Date.now() - conflictResolutionStart
            console.log(`✅ Created purchase order with suffix: ${purchaseOrder.number} (conflict resolution took ${conflictResolutionTime}ms)`)
            return purchaseOrder
            
          } catch (retryError) {
            if (retryError.code === 'P2002') {
              // This suffix is also taken, try next
              suffix++
              attempts++
              console.log(`   ❌ Conflict on ${tryNumber}, trying next...`)
              continue
            }
            // Other error - re-throw
            throw retryError
          }
        }
        
        // 🔥 CRITICAL FIX: Use timestamp IMMEDIATELY after 10 failed attempts
        // Don't keep trying - this prevents transaction timeout
        const conflictResolutionTime = Date.now() - conflictResolutionStart
        console.error(`⚠️ Exhausted ${maxAttempts} suffix attempts in ${conflictResolutionTime}ms, using timestamp fallback`)
        console.error(`⚠️ This indicates MANY duplicate PO numbers - investigate root cause!`)
        const timestampNumber = `${basePoNumber}-${Date.now()}`
        const purchaseOrder = await tx.purchaseOrder.create({
          data: {
            number: timestampNumber,
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
        console.log(`📋 Created purchase order with timestamp: ${purchaseOrder.number}`)
        return purchaseOrder
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
    
    // Update PO number if extracted by AI
    // Note: If conflict occurs, the ENTIRE update will be included in updateData
    // but we'll just skip changing the number (keep existing)
    if (extractedData.poNumber || extractedData.number) {
      const extractedPoNumber = extractedData.poNumber || extractedData.number
      updateData.number = extractedPoNumber
      console.log(`   Attempting to update PO number to: ${extractedPoNumber}`)
    }

    try {
      const purchaseOrder = await tx.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: updateData
      })
      
      console.log(`📋 Updated purchase order: ${purchaseOrder.number} (${status})`)
      return purchaseOrder
      
    } catch (updateError) {
      // OPTIMISTIC LOCKING FALLBACK (Solution 2) - Same as CREATE scenario
      // Handle unique constraint violation with automatic suffix retry
      if (updateError.code === 'P2002') {
        console.log(`⚠️ PO number ${updateData.number} conflicts with existing PO (pre-check race or concurrent update)`)
        console.warn(`⚠️ CONFLICT RESOLUTION INSIDE TRANSACTION - this can be slow!`)
        console.log(`   Using optimistic locking fallback to find next available suffix...`)
        
        // 🔥 CRITICAL FIX: Limit attempts to 10 instead of 100 to prevent transaction timeout
        // If we can't find a free suffix in 10 tries, use timestamp fallback immediately
        const basePoNumber = updateData.number
        let suffix = 1
        let attempts = 0
        const maxAttempts = 10 // ← REDUCED FROM 100 to prevent long transaction times
        
        const conflictResolutionStart = Date.now()
        
        while (attempts < maxAttempts) {
          const tryNumber = `${basePoNumber}-${suffix}`
          
          try {
            console.log(`   Attempt ${attempts + 1}/${maxAttempts}: Trying suffix ${suffix} → ${tryNumber}`)
            
            const purchaseOrder = await tx.purchaseOrder.update({
              where: { id: purchaseOrderId },
              data: { ...updateData, number: tryNumber }
            })
            
            const conflictResolutionTime = Date.now() - conflictResolutionStart
            console.log(`✅ Updated purchase order with suffix: ${purchaseOrder.number} (conflict resolution took ${conflictResolutionTime}ms)`)
            return purchaseOrder
            
          } catch (retryError) {
            if (retryError.code === 'P2002') {
              // This suffix is also taken, try next
              suffix++
              attempts++
              console.log(`   ❌ Conflict on ${tryNumber}, trying next...`)
              continue
            }
            // Other error - re-throw
            throw retryError
          }
        }
        
        // 🔥 CRITICAL FIX: Use timestamp IMMEDIATELY after 10 failed attempts
        // Don't keep trying - this prevents transaction timeout
        const conflictResolutionTime = Date.now() - conflictResolutionStart
        console.error(`⚠️ Exhausted ${maxAttempts} suffix attempts in ${conflictResolutionTime}ms, using timestamp fallback`)
        console.error(`⚠️ This indicates MANY duplicate PO numbers - investigate root cause!`)
        const timestampNumber = `${basePoNumber}-${Date.now()}`
        const purchaseOrder = await tx.purchaseOrder.update({
          where: { id: purchaseOrderId },
          data: { ...updateData, number: timestampNumber }
        })
        console.log(`📋 Updated purchase order with timestamp: ${purchaseOrder.number}`)
        return purchaseOrder
      }
      
      // Handle PO not found (P2025) - fallback to create
      if (updateError.code === 'P2025') {
        console.log(`❌ Purchase order ${purchaseOrderId} not found for update, creating new one instead`)
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
    
    // ⚡ CRITICAL OPTIMIZATION: Use createMany() instead of sequential creates
    // OLD: for loop with 50 items = 50 sequential DB calls = 25+ seconds
    // NEW: single createMany() with 50 items = 1 DB call = ~500ms
    console.log(`⚡ [BATCH CREATE] Creating ${lineItemsData.length} line items in single batch operation...`)
    const batchStart = Date.now()
    
    // Prepare all line item data
    const lineItemsToCreate = lineItemsData.map((item, i) => {
      const itemConfidence = lineItemsConfidence[i] || lineItemsConfidence.overall || 50
      const quantity = parseInt(item.quantity) || 1
      const unitCost = this.parseCurrency(item.unitPrice || item.price || item.cost || item.unitCost)
      const totalCost = this.parseCurrency(item.totalPrice || item.total || item.lineTotal) 
        || (quantity * unitCost)
      
      console.log(`  💰 Line item ${i + 1} pricing: quantity=${quantity}, unitCost=${unitCost}, totalCost=${totalCost}`)
      
      return {
        sku: item.sku || item.productCode || item.itemNumber || `AUTO-${i + 1}`,
        productName: item.productName || item.description || item.name || 'Unknown Product',
        description: item.description || item.productName || null,
        quantity: quantity,
        unitCost: unitCost,
        totalCost: totalCost,
        confidence: itemConfidence / 100,
        status: itemConfidence >= 80 ? 'pending' : 'review_needed',
        aiNotes: `AI extracted: ${JSON.stringify(item)}`,
        purchaseOrderId: purchaseOrderId
      }
    })
    
    // Single batch insert - 50x faster than sequential creates!
    const result = await tx.pOLineItem.createMany({
      data: lineItemsToCreate,
      skipDuplicates: false
    })
    
    console.log(`✅ [BATCH CREATE] Created ${result.count} line items in ${Date.now() - batchStart}ms`)
    
    // Fetch the created items to return them (createMany doesn't return created records)
    const lineItems = await tx.pOLineItem.findMany({
      where: { purchaseOrderId },
      orderBy: { createdAt: 'asc' }
    })
    
    console.log(`  📦 Sample items: ${lineItems.slice(0, 2).map(li => `${li.productName} x${li.quantity}`).join(', ')}`)
    
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