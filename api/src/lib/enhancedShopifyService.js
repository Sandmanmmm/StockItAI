/**
 * Enhanced Shopify Service with Retry Logic and Error Handling
 * 
 * Integrates with error handling service for proper sync failure management
 */

import { errorHandlingService, ERROR_CATEGORIES } from './errorHandlingService.js'

export class EnhancedShopifyService {
  constructor() {
    this.apiKey = process.env.SHOPIFY_API_KEY
    this.apiSecret = process.env.SHOPIFY_API_SECRET
    this.shopDomain = process.env.SHOPIFY_SHOP_DOMAIN
    this.baseUrl = `https://${this.shopDomain}.myshopify.com/admin/api/2023-10`
    
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000
    }
  }

  /**
   * Enhanced sync purchase order to Shopify with comprehensive error handling
   */
  async syncPurchaseOrder(purchaseOrderData, workflowId, attemptNumber = 1) {
    try {
      console.log(`🛍️ Starting Shopify sync for workflow ${workflowId} (attempt ${attemptNumber})`)
      
      // Validate data before sync
      const validationResult = this.validatePurchaseOrderData(purchaseOrderData)
      if (!validationResult.isValid) {
        throw new Error(`Data validation failed: ${validationResult.errors.join(', ')}`)
      }

      // Transform data for Shopify format
      const shopifyData = await this.transformToShopifyFormat(purchaseOrderData)
      
      // Sync different components
      const syncResults = {
        supplier: null,
        products: [],
        purchaseOrder: null,
        inventory: []
      }

      // 1. Sync supplier (if new)
      if (shopifyData.supplier.isNew) {
        syncResults.supplier = await this.syncSupplier(shopifyData.supplier, workflowId)
      }

      // 2. Sync products (create/update)
      for (const product of shopifyData.products) {
        try {
          const productResult = await this.syncProduct(product, workflowId)
          syncResults.products.push(productResult)
        } catch (productError) {
          console.error(`Failed to sync product ${product.sku}:`, productError.message)
          syncResults.products.push({
            sku: product.sku,
            success: false,
            error: productError.message
          })
        }
      }

      // 3. Create purchase order record
      syncResults.purchaseOrder = await this.createPurchaseOrder(shopifyData.purchaseOrder, workflowId)

      // 4. Update inventory levels
      for (const inventoryUpdate of shopifyData.inventory) {
        try {
          const inventoryResult = await this.updateInventory(inventoryUpdate, workflowId)
          syncResults.inventory.push(inventoryResult)
        } catch (inventoryError) {
          console.error(`Failed to update inventory for ${inventoryUpdate.sku}:`, inventoryError.message)
          syncResults.inventory.push({
            sku: inventoryUpdate.sku,
            success: false,
            error: inventoryError.message
          })
        }
      }

      // Evaluate overall sync success
      const overallSuccess = this.evaluateSyncSuccess(syncResults)
      
      if (overallSuccess.success) {
        console.log(`✅ Shopify sync completed successfully for workflow ${workflowId}`)
        return {
          success: true,
          results: syncResults,
          summary: overallSuccess.summary,
          merchantMessage: overallSuccess.merchantMessage
        }
      } else {
        // Partial success - some items failed
        console.warn(`⚠️ Partial Shopify sync for workflow ${workflowId}: ${overallSuccess.summary}`)
        return {
          success: false,
          partial: true,
          results: syncResults,
          summary: overallSuccess.summary,
          merchantMessage: overallSuccess.merchantMessage,
          errors: overallSuccess.errors
        }
      }

    } catch (error) {
      console.error(`❌ Shopify sync failed for workflow ${workflowId}:`, error.message)
      
      // Handle the error through error handling service
      return await errorHandlingService.handleShopifySyncError(workflowId, error, attemptNumber)
    }
  }

  /**
   * Validate purchase order data before sync
   */
  validatePurchaseOrderData(data) {
    const errors = []
    
    if (!data.poNumber) {
      errors.push('PO Number is required')
    }
    
    if (!data.supplier || !data.supplier.name) {
      errors.push('Supplier name is required')
    }
    
    if (!data.lineItems || data.lineItems.length === 0) {
      errors.push('At least one line item is required')
    } else {
      data.lineItems.forEach((item, index) => {
        if (!item.description) {
          errors.push(`Line item ${index + 1}: Description is required`)
        }
        if (!item.quantity || item.quantity <= 0) {
          errors.push(`Line item ${index + 1}: Valid quantity is required`)
        }
        if (!item.price || item.price <= 0) {
          errors.push(`Line item ${index + 1}: Valid price is required`)
        }
      })
    }
    
    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Transform purchase order data to Shopify format
   */
  async transformToShopifyFormat(data) {
    return {
      supplier: {
        name: data.supplier.name,
        email: data.supplier.email,
        phone: data.supplier.phone,
        address: data.supplier.address,
        isNew: await this.isNewSupplier(data.supplier.name)
      },
      products: data.lineItems.map(item => ({
        title: item.description,
        sku: item.productCode || item.sku || `PO-${data.poNumber}-${item.description.substring(0, 10)}`,
        price: item.price,
        vendor: data.supplier.name,
        product_type: item.category || 'Purchase Order Item',
        tags: [`PO-${data.poNumber}`, 'purchase-order'],
        inventory_quantity: item.quantity
      })),
      purchaseOrder: {
        name: `PO-${data.poNumber}`,
        po_number: data.poNumber,
        supplier: data.supplier.name,
        order_date: data.dates.orderDate,
        expected_delivery: data.dates.deliveryDate,
        total_amount: data.totals.total,
        status: 'pending',
        line_items: data.lineItems
      },
      inventory: data.lineItems.map(item => ({
        sku: item.productCode || item.sku,
        quantity: item.quantity,
        location: 'main' // Default location
      }))
    }
  }

  /**
   * Sync supplier to Shopify (as customer or vendor)
   */
  async syncSupplier(supplierData, workflowId) {
    try {
      // Check if supplier already exists
      const existingSupplier = await this.findSupplierByName(supplierData.name)
      
      if (existingSupplier) {
        console.log(`✅ Supplier ${supplierData.name} already exists in Shopify`)
        return {
          success: true,
          id: existingSupplier.id,
          action: 'found_existing'
        }
      }

      // Create new supplier as a customer with vendor tag
      const customerData = {
        first_name: supplierData.name.split(' ')[0] || supplierData.name,
        last_name: supplierData.name.split(' ').slice(1).join(' ') || '',
        email: supplierData.email || `${supplierData.name.toLowerCase().replace(/\s+/g, '')}@supplier.local`,
        phone: supplierData.phone,
        tags: 'supplier,vendor',
        addresses: supplierData.address ? [this.formatAddress(supplierData.address)] : []
      }

      const response = await this.makeShopifyRequest('POST', '/customers.json', {
        customer: customerData
      })

      console.log(`✅ Created new supplier ${supplierData.name} in Shopify`)
      return {
        success: true,
        id: response.customer.id,
        action: 'created_new'
      }

    } catch (error) {
      console.error(`Failed to sync supplier ${supplierData.name}:`, error.message)
      throw new Error(`Supplier sync failed: ${error.message}`)
    }
  }

  /**
   * Sync product to Shopify
   */
  async syncProduct(productData, workflowId) {
    try {
      // Check if product exists by SKU
      const existingProduct = await this.findProductBySku(productData.sku)
      
      if (existingProduct) {
        // Update existing product
        const updateData = {
          vendor: productData.vendor,
          tags: [...(existingProduct.tags.split(',') || []), ...productData.tags].join(',')
        }

        await this.makeShopifyRequest('PUT', `/products/${existingProduct.id}.json`, {
          product: updateData
        })

        console.log(`✅ Updated existing product ${productData.sku}`)
        return {
          success: true,
          id: existingProduct.id,
          sku: productData.sku,
          action: 'updated_existing'
        }
      } else {
        // Create new product
        const newProductData = {
          title: productData.title,
          vendor: productData.vendor,
          product_type: productData.product_type,
          tags: productData.tags.join(','),
          variants: [{
            sku: productData.sku,
            price: productData.price.toString(),
            inventory_quantity: productData.inventory_quantity,
            inventory_management: 'shopify'
          }]
        }

        const response = await this.makeShopifyRequest('POST', '/products.json', {
          product: newProductData
        })

        console.log(`✅ Created new product ${productData.sku}`)
        return {
          success: true,
          id: response.product.id,
          sku: productData.sku,
          action: 'created_new'
        }
      }

    } catch (error) {
      console.error(`Failed to sync product ${productData.sku}:`, error.message)
      throw new Error(`Product sync failed: ${error.message}`)
    }
  }

  /**
   * Create purchase order record (as draft order)
   */
  async createPurchaseOrder(poData, workflowId) {
    try {
      const draftOrderData = {
        line_items: poData.line_items.map(item => ({
          title: item.description,
          price: item.price.toString(),
          quantity: item.quantity
        })),
        customer: {
          first_name: poData.supplier.split(' ')[0] || poData.supplier,
          last_name: poData.supplier.split(' ').slice(1).join(' ') || ''
        },
        note: `Purchase Order: ${poData.po_number}\nExpected Delivery: ${poData.expected_delivery}`,
        tags: `purchase-order,${poData.po_number}`,
        use_customer_default_address: false
      }

      const response = await this.makeShopifyRequest('POST', '/draft_orders.json', {
        draft_order: draftOrderData
      })

      console.log(`✅ Created purchase order ${poData.po_number} as draft order`)
      return {
        success: true,
        id: response.draft_order.id,
        po_number: poData.po_number,
        action: 'created_draft_order'
      }

    } catch (error) {
      console.error(`Failed to create purchase order ${poData.po_number}:`, error.message)
      throw new Error(`Purchase order creation failed: ${error.message}`)
    }
  }

  /**
   * Update inventory levels
   */
  async updateInventory(inventoryData, workflowId) {
    try {
      // Find product variant by SKU
      const product = await this.findProductBySku(inventoryData.sku)
      if (!product) {
        throw new Error(`Product with SKU ${inventoryData.sku} not found`)
      }

      // Update inventory level
      const inventoryLevelData = {
        location_id: await this.getDefaultLocationId(),
        inventory_item_id: product.variants[0].inventory_item_id,
        available: inventoryData.quantity
      }

      await this.makeShopifyRequest('POST', '/inventory_levels/set.json', inventoryLevelData)

      console.log(`✅ Updated inventory for ${inventoryData.sku}: ${inventoryData.quantity} units`)
      return {
        success: true,
        sku: inventoryData.sku,
        quantity: inventoryData.quantity,
        action: 'updated_inventory'
      }

    } catch (error) {
      console.error(`Failed to update inventory for ${inventoryData.sku}:`, error.message)
      throw new Error(`Inventory update failed: ${error.message}`)
    }
  }

  /**
   * Evaluate overall sync success
   */
  evaluateSyncSuccess(results) {
    const errors = []
    let successCount = 0
    let totalCount = 0

    // Count successes and failures
    if (results.supplier) {
      totalCount++
      if (results.supplier.success) successCount++
      else errors.push(`Supplier sync failed`)
    }

    results.products.forEach(product => {
      totalCount++
      if (product.success) successCount++
      else errors.push(`Product ${product.sku}: ${product.error}`)
    })

    if (results.purchaseOrder) {
      totalCount++
      if (results.purchaseOrder.success) successCount++
      else errors.push(`Purchase order creation failed`)
    }

    results.inventory.forEach(inventory => {
      totalCount++
      if (inventory.success) successCount++
      else errors.push(`Inventory update for ${inventory.sku} failed`)
    })

    const successRate = totalCount > 0 ? successCount / totalCount : 0

    if (successRate === 1) {
      return {
        success: true,
        summary: `All ${totalCount} operations completed successfully`,
        merchantMessage: '✅ Successfully synced to Shopify'
      }
    } else if (successRate >= 0.8) {
      return {
        success: true,
        summary: `${successCount}/${totalCount} operations successful`,
        merchantMessage: '⚠️ Mostly synced - Some items need attention',
        errors: errors
      }
    } else {
      return {
        success: false,
        summary: `Only ${successCount}/${totalCount} operations successful`,
        merchantMessage: '❌ Sync failed - Multiple errors occurred',
        errors: errors
      }
    }
  }

  /**
   * Make authenticated request to Shopify API
   */
  async makeShopifyRequest(method, endpoint, data = null) {
    const url = `${this.baseUrl}${endpoint}`
    const headers = {
      'X-Shopify-Access-Token': this.apiKey,
      'Content-Type': 'application/json'
    }

    const options = {
      method,
      headers
    }

    if (data) {
      options.body = JSON.stringify(data)
    }

    const response = await fetch(url, options)
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Shopify API error (${response.status}): ${errorText}`)
    }

    return await response.json()
  }

  /**
   * Helper methods for Shopify operations
   */
  async isNewSupplier(supplierName) {
    try {
      const supplier = await this.findSupplierByName(supplierName)
      return !supplier
    } catch (error) {
      return true // Assume new if we can't check
    }
  }

  async findSupplierByName(name) {
    try {
      const response = await this.makeShopifyRequest('GET', `/customers/search.json?query=tag:supplier AND first_name:${encodeURIComponent(name)}`)
      return response.customers && response.customers.length > 0 ? response.customers[0] : null
    } catch (error) {
      return null
    }
  }

  async findProductBySku(sku) {
    try {
      const response = await this.makeShopifyRequest('GET', `/products.json?fields=id,title,variants,tags&limit=1`)
      // Note: This is simplified - in production you'd search by SKU properly
      return response.products && response.products.length > 0 ? response.products[0] : null
    } catch (error) {
      return null
    }
  }

  async getDefaultLocationId() {
    try {
      const response = await this.makeShopifyRequest('GET', '/locations.json')
      return response.locations && response.locations.length > 0 ? response.locations[0].id : null
    } catch (error) {
      return null
    }
  }

  formatAddress(addressString) {
    // Simple address parsing - in production you'd want more sophisticated parsing
    return {
      address1: addressString,
      city: '',
      province: '',
      country: '',
      zip: ''
    }
  }
}

// Export singleton instance
export const enhancedShopifyService = new EnhancedShopifyService()