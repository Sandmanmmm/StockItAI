/**
 * Shopify Service for Product and Inventory Management
 * 
 * Handles:
 * - Product creation and updates via GraphQL Admin API
 * - Inventory quantity adjustments
 * - Vendor/supplier mapping
 * - SKU-based product lookup and management
 */

import fetch from 'node-fetch'

export class ShopifyService {
  constructor(shopDomain, accessToken) {
    this.shopDomain = shopDomain
    this.accessToken = accessToken
    this.graphqlEndpoint = `https://${shopDomain}/admin/api/2024-10/graphql.json`
    this.restEndpoint = `https://${shopDomain}/admin/api/2024-10`
  }

  /**
   * Make GraphQL request to Shopify Admin API
   */
  async graphqlRequest(query, variables = {}) {
    try {
      const response = await fetch(this.graphqlEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': this.accessToken,
        },
        body: JSON.stringify({
          query,
          variables
        })
      })

      const result = await response.json()

      if (result.errors && result.errors.length > 0) {
        throw new Error(`Shopify GraphQL Error: ${JSON.stringify(result.errors)}`)
      }

      return result.data
    } catch (error) {
      console.error('❌ Shopify GraphQL request failed:', error.message)
      throw error
    }
  }

  /**
   * Find product by SKU using GraphQL
   */
  async findProductBySku(sku) {
    const query = `
      query findProductBySku($query: String!) {
        products(first: 1, query: $query) {
          edges {
            node {
              id
              title
              handle
              vendor
              status
              variants(first: 10) {
                edges {
                  node {
                    id
                    sku
                    price
                    inventoryQuantity
                    inventoryItem {
                      id
                    }
                  }
                }
              }
            }
          }
        }
      }
    `

    const variables = {
      query: `sku:${sku}`
    }

    const data = await this.graphqlRequest(query, variables)
    const products = data.products.edges

    if (products.length > 0) {
      const product = products[0].node
      const variant = product.variants.edges.find(v => v.node.sku === sku)
      
      return {
        found: true,
        product,
        variant: variant ? variant.node : null
      }
    }

    return { found: false, product: null, variant: null }
  }

  /**
   * Create new product in Shopify
   */
  async createProduct(productData) {
    const { title, vendor, sku, price, quantity, description, productType } = productData

    const mutation = `
      mutation productCreate($input: ProductInput!) {
        productCreate(input: $input) {
          product {
            id
            title
            handle
            vendor
            status
            variants(first: 1) {
              edges {
                node {
                  id
                  sku
                  price
                  inventoryQuantity
                  inventoryItem {
                    id
                  }
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `

    const variables = {
      input: {
        title,
        vendor: vendor || 'Default Vendor',
        productType: productType || 'Purchase Order Item',
        status: 'DRAFT', // Create as draft initially
        descriptionHtml: description || `Product from purchase order - SKU: ${sku}`,
        variants: [
          {
            sku,
            price: price ? price.toString() : '0.00',
            inventoryQuantities: [
              {
                availableQuantity: quantity || 0,
                locationId: await this.getPrimaryLocationId()
              }
            ],
            inventoryPolicy: 'DENY'
          }
        ]
      }
    }

    const data = await this.graphqlRequest(mutation, variables)
    
    if (data.productCreate.userErrors.length > 0) {
      throw new Error(`Product creation failed: ${JSON.stringify(data.productCreate.userErrors)}`)
    }

    return {
      success: true,
      product: data.productCreate.product,
      variant: data.productCreate.product.variants.edges[0]?.node
    }
  }

  /**
   * Update existing product
   */
  async updateProduct(productId, productData) {
    const { title, vendor, description, productType } = productData

    const mutation = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            title
            vendor
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `

    const variables = {
      input: {
        id: productId,
        ...(title && { title }),
        ...(vendor && { vendor }),
        ...(productType && { productType }),
        ...(description && { descriptionHtml: description })
      }
    }

    const data = await this.graphqlRequest(mutation, variables)
    
    if (data.productUpdate.userErrors.length > 0) {
      throw new Error(`Product update failed: ${JSON.stringify(data.productUpdate.userErrors)}`)
    }

    return {
      success: true,
      product: data.productUpdate.product
    }
  }

  /**
   * Update product variant (price, SKU)
   */
  async updateVariant(variantId, variantData) {
    const { price, sku } = variantData

    const mutation = `
      mutation productVariantUpdate($input: ProductVariantInput!) {
        productVariantUpdate(input: $input) {
          productVariant {
            id
            sku
            price
          }
          userErrors {
            field
            message
          }
        }
      }
    `

    const variables = {
      input: {
        id: variantId,
        ...(price && { price: price.toString() }),
        ...(sku && { sku })
      }
    }

    const data = await this.graphqlRequest(mutation, variables)
    
    if (data.productVariantUpdate.userErrors.length > 0) {
      throw new Error(`Variant update failed: ${JSON.stringify(data.productVariantUpdate.userErrors)}`)
    }

    return {
      success: true,
      variant: data.productVariantUpdate.productVariant
    }
  }

  /**
   * Adjust inventory quantity
   */
  async adjustInventoryQuantity(inventoryItemId, locationId, quantityChange) {
    const mutation = `
      mutation inventoryAdjustQuantity($input: InventoryAdjustQuantityInput!) {
        inventoryAdjustQuantity(input: $input) {
          inventoryLevel {
            id
            available
          }
          userErrors {
            field
            message
          }
        }
      }
    `

    const variables = {
      input: {
        inventoryItemId,
        locationId,
        availableQuantityDelta: quantityChange
      }
    }

    const data = await this.graphqlRequest(mutation, variables)
    
    if (data.inventoryAdjustQuantity.userErrors.length > 0) {
      throw new Error(`Inventory adjustment failed: ${JSON.stringify(data.inventoryAdjustQuantity.userErrors)}`)
    }

    return {
      success: true,
      inventoryLevel: data.inventoryAdjustQuantity.inventoryLevel
    }
  }

  /**
   * Set inventory quantity (absolute value)
   */
  async setInventoryQuantity(inventoryItemId, locationId, newQuantity) {
    // First get current quantity
    const currentLevel = await this.getInventoryLevel(inventoryItemId, locationId)
    const currentQuantity = currentLevel ? currentLevel.available : 0
    
    // Calculate the adjustment needed
    const quantityChange = newQuantity - currentQuantity
    
    if (quantityChange === 0) {
      return {
        success: true,
        message: 'No inventory adjustment needed',
        currentQuantity,
        newQuantity
      }
    }

    return await this.adjustInventoryQuantity(inventoryItemId, locationId, quantityChange)
  }

  /**
   * Get current inventory level
   */
  async getInventoryLevel(inventoryItemId, locationId) {
    const query = `
      query getInventoryLevel($inventoryItemId: ID!, $locationId: ID!) {
        inventoryLevel(inventoryItemId: $inventoryItemId, locationId: $locationId) {
          id
          available
          location {
            id
            name
          }
        }
      }
    `

    const variables = {
      inventoryItemId,
      locationId
    }

    const data = await this.graphqlRequest(query, variables)
    return data.inventoryLevel
  }

  /**
   * Get primary location ID (first location)
   */
  async getPrimaryLocationId() {
    if (this.primaryLocationId) {
      return this.primaryLocationId
    }

    const query = `
      query getLocations {
        locations(first: 1) {
          edges {
            node {
              id
              name
              isActive
            }
          }
        }
      }
    `

    const data = await this.graphqlRequest(query)
    const locations = data.locations.edges

    if (locations.length === 0) {
      throw new Error('No locations found in Shopify store')
    }

    this.primaryLocationId = locations[0].node.id
    return this.primaryLocationId
  }

  /**
   * Sync purchase order line items to Shopify products
   */
  async syncPurchaseOrderToShopify(purchaseOrder, lineItems, supplier) {
    const results = {
      success: true,
      created: [],
      updated: [],
      errors: [],
      summary: {
        totalItems: lineItems.length,
        createdCount: 0,
        updatedCount: 0,
        errorCount: 0
      }
    }

    console.log(`🔄 Starting Shopify sync for PO ${purchaseOrder.number} (${lineItems.length} items)`)

    for (const lineItem of lineItems) {
      try {
        console.log(`   Processing: ${lineItem.productName} (SKU: ${lineItem.sku})`)

        // Step 1: Check if product exists by SKU
        const existingProduct = await this.findProductBySku(lineItem.sku)

        if (existingProduct.found) {
          // Step 2A: Update existing product
          console.log(`   ✏️  Updating existing product: ${existingProduct.product.title}`)

          // Update product vendor if different
          if (existingProduct.product.vendor !== supplier.name) {
            await this.updateProduct(existingProduct.product.id, {
              vendor: supplier.name
            })
          }

          // Update variant price if different
          if (existingProduct.variant && parseFloat(existingProduct.variant.price) !== lineItem.unitCost) {
            await this.updateVariant(existingProduct.variant.id, {
              price: lineItem.unitCost
            })
          }

          // Update inventory quantity
          if (existingProduct.variant && existingProduct.variant.inventoryItem) {
            const locationId = await this.getPrimaryLocationId()
            await this.adjustInventoryQuantity(
              existingProduct.variant.inventoryItem.id,
              locationId,
              lineItem.quantity
            )
          }

          results.updated.push({
            lineItem,
            product: existingProduct.product,
            variant: existingProduct.variant,
            action: 'updated'
          })
          results.summary.updatedCount++

        } else {
          // Step 2B: Create new product
          console.log(`   ➕ Creating new product: ${lineItem.productName}`)

          const newProduct = await this.createProduct({
            title: lineItem.productName,
            vendor: supplier.name,
            sku: lineItem.sku,
            price: lineItem.unitCost,
            quantity: lineItem.quantity,
            description: `Product from purchase order ${purchaseOrder.number}`,
            productType: 'Purchase Order Item'
          })

          results.created.push({
            lineItem,
            product: newProduct.product,
            variant: newProduct.variant,
            action: 'created'
          })
          results.summary.createdCount++
        }

        console.log(`   ✅ Processed: ${lineItem.productName}`)

      } catch (error) {
        console.error(`   ❌ Failed to process ${lineItem.productName}:`, error.message)
        
        results.errors.push({
          lineItem,
          error: error.message
        })
        results.summary.errorCount++
      }
    }

    // Update overall success status
    results.success = results.summary.errorCount === 0

    console.log(`🎯 Shopify sync completed for PO ${purchaseOrder.number}:`)
    console.log(`   ➕ Created: ${results.summary.createdCount}`)
    console.log(`   ✏️  Updated: ${results.summary.updatedCount}`)
    console.log(`   ❌ Errors: ${results.summary.errorCount}`)

    return results
  }

  /**
   * Get Shopify store information
   */
  async getStoreInfo() {
    const query = `
      query getShop {
        shop {
          id
          name
          myshopifyDomain
          plan {
            displayName
          }
          currencyCode
        }
      }
    `

    const data = await this.graphqlRequest(query)
    return data.shop
  }

  /**
   * Test connection to Shopify
   */
  async testConnection() {
    try {
      const shop = await this.getStoreInfo()
      return {
        success: true,
        shop,
        message: `Connected to ${shop.name} (${shop.myshopifyDomain})`
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to connect to Shopify'
      }
    }
  }
}

export default ShopifyService