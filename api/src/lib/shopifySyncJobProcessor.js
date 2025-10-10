/**
 * Shopify Sync Job Processor
 * Handles asynchronous synchronization of PO data with Shopify
 */

import { db } from '../lib/db.js'
import { enhancedJobService } from '../lib/enhancedJobService.js'

export class ShopifySyncJobProcessor {
  constructor() {
    this.jobType = 'sync-to-shopify'
    this.setupProcessor()
  }

  /**
   * Setup job processor with enhanced job service
   */
  setupProcessor() {
    // Register processor with the enhanced job service
    if (enhancedJobService.queue) {
      enhancedJobService.queue.process(this.jobType, 3, this.processSyncJob.bind(this))
      console.log(`🔄 Shopify sync job processor registered (concurrency: 3)`)
    }
  }

  /**
   * Process Shopify sync job
   */
  async processSyncJob(job) {
    const { 
      purchaseOrderId, 
      merchantId, 
      syncType, // 'inventory', 'products', 'purchase_orders', 'full'
      changes = {},
      options = {} 
    } = job.data

    console.log(`🔄 Processing Shopify sync job ${job.id} for PO ${purchaseOrderId} (type: ${syncType})`)

    try {
      const prisma = await db.getClient()

      // Update job status in database
      await this.updatePOSyncStatus(purchaseOrderId, {
        syncJobId: job.id.toString(),
        jobStatus: 'processing',
        jobStartedAt: new Date()
      })

      // Get merchant session and PO data
      const [merchant, purchaseOrder] = await Promise.all([
        prisma.merchant.findUnique({ where: { id: merchantId } }),
        prisma.purchaseOrder.findUnique({
          where: { id: purchaseOrderId },
          include: {
            lineItems: true,
            supplier: true
          }
        })
      ])

      if (!merchant || !purchaseOrder) {
        throw new Error('Merchant or PurchaseOrder not found')
      }

      // Get Shopify session
      const session = await prisma.session.findFirst({
        where: { merchantId }
      })

      if (!session) {
        throw new Error('No active Shopify session found')
      }

      let syncResults = {}

      // Process different sync types
      switch (syncType) {
        case 'inventory':
          syncResults = await this.syncInventoryUpdates(session, purchaseOrder, changes)
          break
        case 'products':
          syncResults = await this.syncProductData(session, purchaseOrder, changes)
          break
        case 'purchase_orders':
          syncResults = await this.syncPurchaseOrderData(session, purchaseOrder)
          break
        case 'full':
          syncResults = await this.performFullSync(session, purchaseOrder, changes)
          break
        default:
          throw new Error(`Unknown sync type: ${syncType}`)
      }

      // Mark job as completed
      await this.updatePOSyncStatus(purchaseOrderId, {
        jobStatus: 'completed',
        jobCompletedAt: new Date(),
        jobError: null
      })

      console.log(`✅ Shopify sync job ${job.id} completed successfully`)

      return {
        success: true,
        purchaseOrderId,
        syncType,
        ...syncResults,
        processingTime: Date.now() - job.processedOn
      }

    } catch (error) {
      console.error(`❌ Shopify sync job ${job.id} failed:`, error)

      // Update database with error
      await this.updatePOSyncStatus(purchaseOrderId, {
        jobStatus: 'failed',
        jobCompletedAt: new Date(),
        jobError: error.message
      })

      throw error
    }
  }

  /**
   * Sync inventory updates to Shopify
   */
  async syncInventoryUpdates(session, purchaseOrder, changes) {
    console.log('📦 Syncing inventory updates...')

    const inventoryUpdates = []
    const results = {
      updatedProducts: 0,
      skippedProducts: 0,
      errors: []
    }

    for (const lineItem of purchaseOrder.lineItems) {
      try {
        if (lineItem.sku && changes.inventory && changes.inventory[lineItem.sku]) {
          const update = await this.updateProductInventory(
            session,
            lineItem.sku,
            changes.inventory[lineItem.sku]
          )
          
          if (update.success) {
            results.updatedProducts++
            inventoryUpdates.push({
              sku: lineItem.sku,
              oldQuantity: update.oldQuantity,
              newQuantity: update.newQuantity
            })
          } else {
            results.skippedProducts++
            results.errors.push(`${lineItem.sku}: ${update.error}`)
          }
        }
      } catch (error) {
        results.errors.push(`${lineItem.sku}: ${error.message}`)
      }
    }

    return {
      inventoryUpdates,
      ...results
    }
  }

  /**
   * Sync product data to Shopify
   */
  async syncProductData(session, purchaseOrder, changes) {
    console.log('🏷️ Syncing product data...')

    const results = {
      createdProducts: 0,
      updatedProducts: 0,
      skippedProducts: 0,
      errors: []
    }

    for (const lineItem of purchaseOrder.lineItems) {
      try {
        const productData = {
          title: lineItem.productName,
          handle: this.generateHandle(lineItem.productName),
          vendor: purchaseOrder.supplierName,
          product_type: changes.productType || 'General',
          tags: changes.tags || [],
          variants: [{
            sku: lineItem.sku,
            price: lineItem.unitPrice.toString(),
            inventory_quantity: lineItem.quantity,
            inventory_management: 'shopify'
          }]
        }

        // Check if product exists
        const existingProduct = await this.findProductBySku(session, lineItem.sku)
        
        if (existingProduct) {
          // Update existing product
          const updated = await this.updateShopifyProduct(session, existingProduct.id, productData)
          if (updated.success) {
            results.updatedProducts++
          } else {
            results.errors.push(`Update ${lineItem.sku}: ${updated.error}`)
          }
        } else {
          // Create new product
          const created = await this.createShopifyProduct(session, productData)
          if (created.success) {
            results.createdProducts++
          } else {
            results.errors.push(`Create ${lineItem.sku}: ${created.error}`)
          }
        }
      } catch (error) {
        results.errors.push(`${lineItem.sku}: ${error.message}`)
      }
    }

    return results
  }

  /**
   * Sync purchase order data (for reference/tracking)
   */
  async syncPurchaseOrderData(session, purchaseOrder) {
    console.log('📋 Syncing purchase order data...')

    // This could create a draft order or use metafields for tracking
    // For now, return success with metadata
    return {
      purchaseOrderSynced: true,
      shopifyReference: `po-${purchaseOrder.number}`,
      syncedAt: new Date().toISOString()
    }
  }

  /**
   * Perform full sync of all data
   */
  async performFullSync(session, purchaseOrder, changes) {
    console.log('🔄 Performing full sync...')

    const [inventoryResults, productResults, poResults] = await Promise.all([
      this.syncInventoryUpdates(session, purchaseOrder, changes),
      this.syncProductData(session, purchaseOrder, changes),
      this.syncPurchaseOrderData(session, purchaseOrder)
    ])

    return {
      inventory: inventoryResults,
      products: productResults,
      purchaseOrder: poResults
    }
  }

  /**
   * Update product inventory in Shopify
   */
  async updateProductInventory(session, sku, newQuantity) {
    try {
      // Mock Shopify API call - replace with actual Shopify GraphQL/REST API
      console.log(`📦 Updating inventory for ${sku}: ${newQuantity}`)
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Mock successful response
      return {
        success: true,
        oldQuantity: Math.floor(Math.random() * 100),
        newQuantity: newQuantity,
        productId: `gid://shopify/Product/${Math.floor(Math.random() * 10000)}`
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Find product by SKU in Shopify
   */
  async findProductBySku(session, sku) {
    try {
      // Mock Shopify API search - replace with actual API call
      console.log(`🔍 Searching for product with SKU: ${sku}`)
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // Mock response - sometimes product exists, sometimes not
      const exists = Math.random() > 0.5
      return exists ? {
        id: Math.floor(Math.random() * 10000),
        handle: this.generateHandle(sku),
        title: `Product ${sku}`
      } : null
    } catch (error) {
      console.error(`Error searching for product ${sku}:`, error)
      return null
    }
  }

  /**
   * Create new product in Shopify
   */
  async createShopifyProduct(session, productData) {
    try {
      console.log(`🆕 Creating product: ${productData.title}`)
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Mock successful creation
      return {
        success: true,
        productId: `gid://shopify/Product/${Math.floor(Math.random() * 10000)}`,
        handle: productData.handle
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Update existing product in Shopify
   */
  async updateShopifyProduct(session, productId, productData) {
    try {
      console.log(`📝 Updating product: ${productId}`)
      
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 800))
      
      // Mock successful update
      return {
        success: true,
        productId,
        updatedFields: Object.keys(productData)
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Generate Shopify product handle from name
   */
  generateHandle(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
  }

  /**
   * Update PO sync status in database
   */
  async updatePOSyncStatus(purchaseOrderId, statusData) {
    const prisma = await db.getClient()
    await prisma.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: statusData
    })
  }
}

// Create and export singleton instance
export const shopifySyncJobProcessor = new ShopifySyncJobProcessor()
export default shopifySyncJobProcessor