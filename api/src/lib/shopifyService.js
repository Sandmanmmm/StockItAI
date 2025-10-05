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
    const locationId = await this.getPrimaryLocationId()
    const {
      title,
      vendor,
      description,
      descriptionHtml,
      productType,
      status,
      tags,
      variants,
      images,
      options,
      metafields,
      handle
    } = productData

    const normalizedVariants = (Array.isArray(variants) && variants.length > 0
      ? variants
      : [
          {
            sku: productData.sku,
            price: productData.price,
            compareAtPrice: productData.compareAtPrice,
            inventoryQty: productData.quantity,
            barcode: productData.barcode,
            requiresShipping: productData.requiresShipping,
            taxable: productData.taxable
          }
        ]
    )
      .map(variant => this.normalizeVariantInput(variant, locationId))
      .filter(Boolean)

    if (normalizedVariants.length === 0) {
      throw new Error('Unable to create product without at least one variant containing a SKU')
    }

    const mutation = `
      mutation productCreate($input: ProductInput!) {
        productCreate(input: $input) {
          product {
            id
            title
            handle
            vendor
            status
            tags
            productType
            variants(first: 50) {
              edges {
                node {
                  id
                  title
                  sku
                  price
                  compareAtPrice
                  inventoryQuantity
                  requiresShipping
                  taxable
                  barcode
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

    const input = this.compactObject({
      title,
      vendor: vendor || 'Default Vendor',
      productType: productType || 'Purchase Order Item',
      status: status || 'DRAFT',
      descriptionHtml: descriptionHtml ?? description ?? '',
      tags,
      metafields,
      handle,
      options: options || this.buildProductOptionsFromVariants(normalizedVariants),
      variants: normalizedVariants,
      images: Array.isArray(images) && images.length > 0 ? images.map((image, index) => this.normalizeImageInput(image, index)) : undefined
    })

    const variables = { input }

    const data = await this.graphqlRequest(mutation, variables)

    if (data.productCreate.userErrors.length > 0) {
      throw new Error(`Product creation failed: ${JSON.stringify(data.productCreate.userErrors)}`)
    }

    return {
      success: true,
      product: data.productCreate.product,
      variants: data.productCreate.product.variants.edges.map(edge => edge.node)
    }
  }

  /**
   * Update existing product
   */
  async updateProduct(productId, productData) {
    const mutation = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            title
            vendor
            status
            handle
            productType
            tags
          }
          userErrors {
            field
            message
          }
        }
      }
    `

    const input = this.compactObject({
      id: productId,
      title: productData.title,
      vendor: productData.vendor,
      descriptionHtml: productData.descriptionHtml ?? productData.description,
      productType: productData.productType,
      status: productData.status,
      tags: productData.tags,
      metafields: productData.metafields,
      handle: productData.handle
    })

    const data = await this.graphqlRequest(mutation, { input })

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
    const mutation = `
      mutation productVariantUpdate($input: ProductVariantInput!) {
        productVariantUpdate(input: $input) {
          productVariant {
            id
            sku
            price
            compareAtPrice
            requiresShipping
            taxable
            barcode
            weight
            weightUnit
          }
          userErrors {
            field
            message
          }
        }
      }
    `

    const input = this.compactObject({
      id: variantId,
      price: variantData.price != null ? this.formatMoney(variantData.price) : undefined,
      compareAtPrice: variantData.compareAtPrice != null ? this.formatMoney(variantData.compareAtPrice) : undefined,
      sku: variantData.sku,
      barcode: variantData.barcode,
      requiresShipping: variantData.requiresShipping,
      taxable: variantData.taxable,
      weight: variantData.weight != null ? Number(variantData.weight) : undefined,
      weightUnit: this.normalizeWeightUnit(variantData.weightUnit),
      options: variantData.options
    })

    const data = await this.graphqlRequest(mutation, { input })

    if (data.productVariantUpdate.userErrors.length > 0) {
      throw new Error(`Variant update failed: ${JSON.stringify(data.productVariantUpdate.userErrors)}`)
    }

    return {
      success: true,
      variant: data.productVariantUpdate.productVariant
    }
  }

  async createVariant(productId, variantData, locationId) {
    const mutation = `
      mutation productVariantCreate($input: ProductVariantInput!) {
        productVariantCreate(input: $input) {
          productVariant {
            id
            sku
            price
            compareAtPrice
            requiresShipping
            taxable
            barcode
            inventoryQuantity
            inventoryItem {
              id
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `

    const quantity = variantData.inventoryQuantities?.[0]?.availableQuantity ?? variantData.inventoryQty ?? 0
    const resolvedLocationId = variantData.inventoryQuantities?.[0]?.locationId || locationId || await this.getPrimaryLocationId()

    const input = this.compactObject({
      productId,
      sku: variantData.sku,
      price: variantData.price != null ? this.formatMoney(variantData.price) : undefined,
      compareAtPrice: variantData.compareAtPrice != null ? this.formatMoney(variantData.compareAtPrice) : undefined,
      barcode: variantData.barcode,
      requiresShipping: variantData.requiresShipping,
      taxable: variantData.taxable,
      weight: variantData.weight != null ? Number(variantData.weight) : undefined,
      weightUnit: this.normalizeWeightUnit(variantData.weightUnit),
      options: variantData.options,
      inventoryQuantities: [
        {
          availableQuantity: quantity,
          locationId: resolvedLocationId
        }
      ]
    })

    const data = await this.graphqlRequest(mutation, { input })

    if (data.productVariantCreate.userErrors.length > 0) {
      throw new Error(`Variant creation failed: ${JSON.stringify(data.productVariantCreate.userErrors)}`)
    }

    return data.productVariantCreate.productVariant
  }

  async getProductById(productId) {
    if (!productId) {
      return null
    }

    const query = `
      query getProduct($id: ID!) {
        product(id: $id) {
          id
          title
          handle
          vendor
          status
          productType
          tags
          variants(first: 100) {
            edges {
              node {
                id
                title
                sku
                price
                compareAtPrice
                inventoryQuantity
                requiresShipping
                taxable
                barcode
                weight
                weightUnit
                inventoryItem {
                  id
                }
              }
            }
          }
        }
      }
    `

    const data = await this.graphqlRequest(query, { id: productId })
    return data.product || null
  }

  normalizeVariantInput(variant, locationId) {
    if (!variant) {
      return null
    }

    const rawSku = typeof variant.sku === 'string' ? variant.sku.trim() : variant.sku
    if (!rawSku) {
      return null
    }

    const quantity = variant.inventoryQuantities?.[0]?.availableQuantity ?? variant.inventoryQty ?? variant.quantity ?? 0
    const resolvedLocationId = variant.inventoryQuantities?.[0]?.locationId || locationId

    const normalized = this.compactObject({
      sku: rawSku,
      title: variant.title,
      price: this.formatMoney(
        variant.price ??
        variant.priceRefined ??
        variant.unitCost ??
        variant.originalPrice ??
        0
      ),
      compareAtPrice: variant.compareAtPrice != null ? this.formatMoney(variant.compareAtPrice) : undefined,
      barcode: variant.barcode,
      requiresShipping: variant.requiresShipping ?? true,
      taxable: variant.taxable ?? true,
      weight: variant.weight != null ? Number(variant.weight) : undefined,
      weightUnit: this.normalizeWeightUnit(variant.weightUnit),
      options: Array.isArray(variant.options) && variant.options.length > 0
        ? variant.options
        : (variant.title ? [variant.title] : undefined),
      inventoryQuantities: [
        {
          availableQuantity: Number.isFinite(quantity) ? Number(quantity) : 0,
          locationId: resolvedLocationId
        }
      ]
    })

    return normalized
  }

  normalizeImageInput(image, index = 0, fallbackAlt) {
    if (!image) {
      return null
    }

    const src = image.src || image.url || image.enhancedUrl || image.originalUrl || image.stagingUrl
    if (!src) {
      return null
    }

    return this.compactObject({
      src,
      altText: image.altText || fallbackAlt,
      position: image.position != null ? image.position : index + 1
    })
  }

  buildVariantInputsFromDraft(draft, locationId) {
    const fallbackSku = draft?.sku || draft?.lineItem?.sku || (Array.isArray(draft?.variants) && draft.variants[0]?.sku)

    const sourceVariants = Array.isArray(draft?.variants) && draft.variants.length > 0
      ? draft.variants
      : [
          {
            sku: fallbackSku,
            price: draft?.priceRefined ?? draft?.originalPrice ?? draft?.lineItem?.unitCost,
            compareAtPrice: draft?.compareAtPrice,
            inventoryQty: draft?.inventoryQty ?? draft?.lineItem?.quantity,
            barcode: draft?.lineItem?.barcode,
            requiresShipping: true,
            taxable: true,
            title: draft?.refinedTitle || draft?.originalTitle
          }
        ]

    return sourceVariants
      .map((variant, index) => {
        if (!variant?.sku) {
          const generatedSku = index === 0 && fallbackSku
            ? fallbackSku
            : `${fallbackSku || draft?.purchaseOrder?.number || 'SKU'}-${index + 1}`
          variant = { ...variant, sku: generatedSku }
        }
        return this.normalizeVariantInput(variant, locationId)
      })
      .filter(Boolean)
  }

  buildProductOptionsFromVariants(variantInputs) {
    if (!variantInputs || variantInputs.length === 0) {
      return undefined
    }

    const hasMultipleVariants = variantInputs.length > 1
    if (!hasMultipleVariants) {
      return ['Title']
    }

    const maxOptions = variantInputs.reduce((max, variant) => {
      const length = Array.isArray(variant.options) ? variant.options.length : 0
      return Math.max(max, length)
    }, 0)

    if (maxOptions <= 1) {
      return ['Title']
    }

    return Array.from({ length: maxOptions }, (_, index) => `Option ${index + 1}`)
  }

  buildImageInputsFromDraft(draft) {
    if (!draft || !Array.isArray(draft.images) || draft.images.length === 0) {
      return []
    }

    const title = draft.refinedTitle || draft.originalTitle || 'Product Image'

    return draft.images
      .map((image, index) => this.normalizeImageInput(image, index, title))
      .filter(Boolean)
      .slice(0, 10)
  }

  buildProductInputFromDraft(draft, options = {}) {
    const status = options.publish ? 'ACTIVE' : options.status || 'DRAFT'
    const vendor = draft?.vendor || draft?.supplier?.name || draft?.purchaseOrder?.supplierName || 'Unknown Vendor'
    const descriptionHtml = draft?.refinedDescription || draft?.originalDescription || `Generated from purchase order ${draft?.purchaseOrder?.number || ''}`
    const productType = draft?.productType || draft?.lineItem?.productType || 'Purchase Order Item'

    const input = this.compactObject({
      title: draft?.refinedTitle || draft?.originalTitle || 'Untitled Product',
      vendor,
      descriptionHtml,
      productType,
      tags: this.extractTags(draft?.tags),
      status
    })

    if (options.handle || draft?.handle) {
      input.handle = options.handle || draft.handle
    }

    return input
  }

  async syncVariantsForProduct(product, variantInputs, options = {}) {
    if (!product) {
      throw new Error('Product details are required to sync variants')
    }

    const locationId = options.locationId || await this.getPrimaryLocationId()
    const updateInventory = options.updateInventory !== false

    const existingVariants = product?.variants?.edges?.map(edge => edge.node) || []
    const createdVariantIds = []
    const updatedVariantIds = []
    const variantResults = []

    for (const input of variantInputs) {
      if (!input || !input.sku) {
        continue
      }

      const existing = existingVariants.find(variant => variant.sku === input.sku)
      const inventoryQuantity = input.inventoryQuantities?.[0]?.availableQuantity ?? 0

      if (existing) {
        await this.updateVariant(existing.id, input)

        if (updateInventory && existing.inventoryItem?.id) {
          await this.setInventoryQuantity(existing.inventoryItem.id, locationId, inventoryQuantity)
        }

        updatedVariantIds.push(existing.id)
        variantResults.push({
          ...existing,
          price: input.price ?? existing.price,
          compareAtPrice: input.compareAtPrice ?? existing.compareAtPrice,
          requiresShipping: input.requiresShipping ?? existing.requiresShipping,
          taxable: input.taxable ?? existing.taxable,
          barcode: input.barcode ?? existing.barcode
        })
      } else {
        const createdVariant = await this.createVariant(product.id, input, locationId)

        if (updateInventory && createdVariant.inventoryItem?.id) {
          await this.setInventoryQuantity(createdVariant.inventoryItem.id, locationId, inventoryQuantity)
        }

        createdVariantIds.push(createdVariant.id)
        variantResults.push(createdVariant)
      }
    }

    return {
      variants: variantResults,
      createdVariantIds,
      updatedVariantIds
    }
  }

  async syncProductDraft(draft, options = {}) {
    if (!draft) {
      throw new Error('Product draft is required for Shopify sync')
    }

    const locationId = options.locationId || await this.getPrimaryLocationId()
    const variantInputs = this.buildVariantInputsFromDraft(draft, locationId)

    if (variantInputs.length === 0) {
      throw new Error('No variants with SKU available for Shopify sync')
    }

    const primarySku = variantInputs[0]?.sku

    let productId = draft.shopifyProductId || null
    let productDetails = productId ? await this.getProductById(productId) : null

    if (!productDetails && options.preferExisting !== false && primarySku) {
      const existingProduct = await this.findProductBySku(primarySku)
      if (existingProduct.found) {
        productId = existingProduct.product.id
        productDetails = await this.getProductById(productId)
      }
    }

    const baseProductInput = this.buildProductInputFromDraft(draft, {
      publish: options.publish,
      status: options.status,
      handle: options.handle
    })

    const imageInputs = options.syncImages === false ? [] : this.buildImageInputsFromDraft(draft)

    let action = 'created'

    if (!productDetails) {
      const createPayload = {
        ...baseProductInput,
        variants: variantInputs,
        options: this.buildProductOptionsFromVariants(variantInputs),
        images: imageInputs
      }

      const createResult = await this.createProduct(createPayload)
      productId = createResult.product.id
      productDetails = await this.getProductById(productId)
      action = 'created'
    } else {
      await this.updateProduct(productDetails.id, baseProductInput)
      productDetails = await this.getProductById(productDetails.id)
      action = 'updated'
    }

    if (!productDetails) {
      throw new Error('Failed to retrieve product after Shopify sync')
    }

    await this.syncVariantsForProduct(productDetails, variantInputs, {
      locationId,
      updateInventory: options.updateInventory !== false
    })

    const finalProduct = await this.getProductById(productId)
    const finalVariants = finalProduct?.variants?.edges?.map(edge => edge.node) || []
    const primaryVariant = primarySku ? finalVariants.find(variant => variant.sku === primarySku) : finalVariants[0]

    return {
      success: true,
      action,
      productId,
      product: finalProduct,
      variants: finalVariants,
      primaryVariant,
      status: finalProduct?.status,
      handle: finalProduct?.handle
    }
  }

  formatMoney(value, fallback = '0.00') {
    if (value === null || value === undefined) {
      return fallback
    }

    const numeric = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
    if (!Number.isFinite(numeric)) {
      return fallback
    }

    return numeric.toFixed(2)
  }

  normalizeWeightUnit(unit) {
    if (!unit) {
      return undefined
    }

    const normalized = unit.toString().toUpperCase()

    const mapping = {
      G: 'GRAMS',
      GRAM: 'GRAMS',
      GRAMS: 'GRAMS',
      KG: 'KILOGRAMS',
      KGS: 'KILOGRAMS',
      KILOGRAM: 'KILOGRAMS',
      KILOGRAMS: 'KILOGRAMS',
      LB: 'POUNDS',
      LBS: 'POUNDS',
      POUND: 'POUNDS',
      POUNDS: 'POUNDS',
      OZ: 'OUNCES',
      OZS: 'OUNCES',
      OUNCE: 'OUNCES',
      OUNCES: 'OUNCES'
    }

    return mapping[normalized] || normalized
  }

  extractTags(tags) {
    if (!tags) {
      return undefined
    }

    if (Array.isArray(tags)) {
      const cleaned = tags
        .map(tag => (typeof tag === 'string' ? tag.trim() : null))
        .filter(Boolean)

      return cleaned.length > 0 ? cleaned : undefined
    }

    if (typeof tags === 'string') {
      const cleaned = tags
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean)

      return cleaned.length > 0 ? cleaned : undefined
    }

    return undefined
  }

  compactObject(object) {
    return Object.fromEntries(
      Object.entries(object)
        .filter(([, value]) => {
          if (value === undefined || value === null) {
            return false
          }
          if (Array.isArray(value)) {
            return value.length > 0
          }
          return true
        })
    )
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
  async syncPurchaseOrderToShopify(purchaseOrder, lineItems, supplier, options = {}) {
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

    const statusPriority = {
      SYNCED: 6,
      APPROVED: 5,
      SYNCING: 4,
      PENDING_REVIEW: 3,
      DRAFT: 2,
      FAILED: 1,
      REJECTED: 0
    }

    const preferExisting = options.preferExisting !== false
    const updateInventory = options.updateInventory !== false
    const publishProducts = options.publishProducts ?? false
    const productStatus = options.productStatus
    const locationId = options.locationId || await this.getPrimaryLocationId()

    const productDrafts = Array.isArray(purchaseOrder.productDrafts) ? purchaseOrder.productDrafts : []
    const draftByLineItemId = new Map()

    for (const draft of productDrafts) {
      const lineItemId = draft.lineItemId || draft.poLineItemId || draft.lineItem?.id
      if (!lineItemId) {
        continue
      }

      const existing = draftByLineItemId.get(lineItemId)
      if (!existing) {
        draftByLineItemId.set(lineItemId, draft)
        continue
      }

      const existingPriority = statusPriority[existing.status?.toUpperCase()] ?? 0
      const candidatePriority = statusPriority[draft.status?.toUpperCase()] ?? 0

      if (candidatePriority > existingPriority) {
        draftByLineItemId.set(lineItemId, draft)
      } else if (candidatePriority === existingPriority) {
        const existingUpdated = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0
        const candidateUpdated = draft.updatedAt ? new Date(draft.updatedAt).getTime() : 0
        if (candidateUpdated > existingUpdated) {
          draftByLineItemId.set(lineItemId, draft)
        }
      }
    }

    const buildDraftPayload = (lineItem, selectedDraft) => {
      const fallbackTitle = selectedDraft?.refinedTitle || selectedDraft?.originalTitle || lineItem.productName
      const fallbackDescription = selectedDraft?.refinedDescription || selectedDraft?.originalDescription || lineItem.description
      const fallbackPrice = selectedDraft?.priceRefined ?? selectedDraft?.originalPrice ?? lineItem.unitCost
      const fallbackInventory = selectedDraft?.inventoryQty ?? lineItem.quantity
      const fallbackVendor = selectedDraft?.vendor || supplier?.name || purchaseOrder.supplierName || 'Unknown Vendor'

      const variantTemplates = Array.isArray(selectedDraft?.variants) && selectedDraft.variants.length > 0
        ? selectedDraft.variants.map((variant, index) => ({
            sku: variant.sku || (lineItem.sku ? `${lineItem.sku}-${index + 1}` : null),
            title: variant.title || fallbackTitle,
            price: variant.price ?? fallbackPrice,
            compareAtPrice: variant.compareAtPrice ?? selectedDraft?.compareAtPrice,
            inventoryQty: variant.inventoryQty ?? fallbackInventory,
            requiresShipping: variant.requiresShipping ?? true,
            taxable: variant.taxable ?? true,
            weight: variant.weight,
            weightUnit: variant.weightUnit,
            barcode: variant.barcode,
            options: variant.options || (variant.title ? [variant.title] : undefined)
          }))
        : []

      if (variantTemplates.length === 0) {
        variantTemplates.push({
          sku: selectedDraft?.sku || lineItem.sku,
          title: fallbackTitle,
          price: fallbackPrice,
          compareAtPrice: selectedDraft?.compareAtPrice,
          inventoryQty: fallbackInventory,
          requiresShipping: true,
          taxable: true,
          weight: selectedDraft?.weight,
          weightUnit: selectedDraft?.weightUnit,
          barcode: selectedDraft?.barcode
        })
      }

      const imageTemplates = Array.isArray(selectedDraft?.images)
        ? selectedDraft.images.map(image => ({
            src: image.enhancedUrl || image.originalUrl || image.url,
            altText: image.altText,
            position: image.position
          }))
        : []

      return {
        id: selectedDraft?.id,
        originalTitle: selectedDraft?.originalTitle || lineItem.productName,
        refinedTitle: selectedDraft?.refinedTitle,
        originalDescription: selectedDraft?.originalDescription || lineItem.description,
        refinedDescription: selectedDraft?.refinedDescription || fallbackDescription,
        originalPrice: selectedDraft?.originalPrice ?? lineItem.unitCost,
        priceRefined: fallbackPrice,
        compareAtPrice: selectedDraft?.compareAtPrice,
        inventoryQty: fallbackInventory,
        sku: selectedDraft?.sku || lineItem.sku,
        productType: selectedDraft?.productType,
        vendor: fallbackVendor,
        tags: selectedDraft?.tags,
        variants: variantTemplates,
        images: imageTemplates,
        lineItem,
        purchaseOrder,
        supplier: selectedDraft?.supplier || supplier,
        status: selectedDraft?.status,
        handle: selectedDraft?.handle,
        weight: selectedDraft?.weight,
        weightUnit: selectedDraft?.weightUnit
      }
    }

    for (const lineItem of lineItems) {
      const selectedDraft = draftByLineItemId.get(lineItem.id)
      const draftPayload = buildDraftPayload(lineItem, selectedDraft)

      try {
        console.log(`   Processing: ${lineItem.productName} (SKU: ${draftPayload.sku})`)

        const syncDetails = await this.syncProductDraft(draftPayload, {
          publish: publishProducts,
          status: productStatus,
          syncImages: options.syncImages ?? (draftPayload.images && draftPayload.images.length > 0),
          preferExisting,
          updateInventory,
          locationId
        })

        const resultEntry = {
          lineItem,
          draft: selectedDraft ? { id: selectedDraft.id, status: selectedDraft.status } : null,
          product: syncDetails.product,
          variant: syncDetails.primaryVariant,
          action: syncDetails.action,
          details: syncDetails
        }

        if (syncDetails.action === 'created') {
          results.created.push(resultEntry)
          results.summary.createdCount++
        } else {
          results.updated.push(resultEntry)
          results.summary.updatedCount++
        }

        console.log(`   ✅ ${syncDetails.action === 'created' ? 'Created' : 'Updated'}: ${syncDetails.product?.title}`)

      } catch (error) {
        console.error(`   ❌ Failed to process ${lineItem.productName}:`, error.message)

        results.errors.push({
          lineItem,
          draft: selectedDraft ? { id: selectedDraft.id, status: selectedDraft.status } : null,
          error: error.message
        })
        results.summary.errorCount++
      }
    }

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