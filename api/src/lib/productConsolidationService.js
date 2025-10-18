/**
 * Product Consolidation Service
 * 
 * Groups SKU variants into parent products for cleaner PO line item display.
 * Example: "Laffy Taffy Rope Strawberry", "Laffy Taffy Rope Sour Apple", "Laffy Taffy Rope Mystery Swirl"
 *          → "Laffy Taffy Rope" with 3 variants
 */

export class ProductConsolidationService {
  /**
   * Consolidate line items by grouping SKU variants under parent products
   */
  consolidateLineItems(lineItems) {
    if (!lineItems || lineItems.length === 0) {
      return []
    }

    console.log(`📦 Consolidating ${lineItems.length} line items...`)

    // Group items by base product name
    const productGroups = this._groupByBaseProduct(lineItems)

    // Convert groups to consolidated line items
    const consolidated = Object.entries(productGroups).map(([baseName, items]) => {
      return this._createConsolidatedProduct(baseName, items)
    })

    console.log(`✅ Consolidated into ${consolidated.length} products (${lineItems.length - consolidated.length} variants grouped)`)

    return consolidated.sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * Group line items by extracting base product names
   */
  _groupByBaseProduct(lineItems) {
    const groups = {}

    for (const item of lineItems) {
      const baseName = this._extractBaseProductName(item.description || item.item_description || item.name || '')
      const variant = this._extractVariantInfo(item.description || item.item_description || item.name || '')

      if (!groups[baseName]) {
        groups[baseName] = []
      }

      groups[baseName].push({
        ...item,
        baseProduct: baseName,
        variantInfo: variant
      })
    }

    return groups
  }

  /**
   * Extract base product name by removing variant-specific details
   * 
   * Examples:
   * "Laffy Taffy Rope Strawberry - Case of 24" → "Laffy Taffy Rope"
   * "Huer Banana Frosty 1 kg" → "Huer Banana Frosty"
   * "Toxic Waste Slime Licker Taffy Sour Blue Razz 20 g - 48 ct" → "Toxic Waste Slime Licker Taffy"
   */
  _extractBaseProductName(fullName) {
    let name = fullName.trim()

    // Remove common suffixes that indicate variants
    const variantPatterns = [
      // Flavors/colors (keep these removal patterns tight to avoid over-matching)
      /\s+(Strawberry|Sour Apple|Blue Razz|Cherry|Grape|Lemon|Orange|Watermelon|Pineapple|Mystery Swirl|Tropical|Assorted|Mixed)(\s|$)/i,
      
      // Sizes and pack info (remove from end)
      /\s+-?\s*\d+\s*(g|kg|lb|oz|ml|L)\s*(-|$)/i,  // "127 g", "1 kg", "355 ml"
      /\s+-?\s*Case\s+of\s+\d+/i,                   // "Case of 12"
      /\s+-?\s*\d+\s*ct\b/i,                        // "36 ct", "48 ct"
      /\s+-?\s*\d+\s*(pcs|pack|count)\b/i,         // "210 pcs"
      /\s+Peg\s+Bag/i,                              // "Peg Bag"
      /\s+Theater\s+Box/i,                          // "Theater Box"
      
      // Country markers
      /\s+\(\s*(UK|USA|EU|Turkey|Canada)\s*\)/i,
      
      // Descriptive additions
      /\s+-\s+\d+\s+(Pops|Bars|Sticks)/i,          // "48 Pops", "36 Bars"
    ]

    for (const pattern of variantPatterns) {
      name = name.replace(pattern, ' ')
    }

    // Clean up multiple spaces and trim
    name = name.replace(/\s+/g, ' ').trim()
    
    // Remove trailing hyphens
    name = name.replace(/\s*-\s*$/, '')

    return name || fullName // Fallback to original if empty
  }

  /**
   * Extract variant-specific information (flavor, size, pack quantity)
   */
  _extractVariantInfo(fullName) {
    const variant = {
      flavor: null,
      size: null,
      packQuantity: null,
      packType: null,
      country: null
    }

    // Extract flavor
    const flavorMatch = fullName.match(/\b(Strawberry|Sour Apple|Blue Razz|Cherry|Grape|Lemon|Orange|Watermelon|Pineapple|Mystery Swirl|Tropical|Assorted|Banana|Cola|Honey Bun|Caramel Brownie|Caramel)\b/i)
    if (flavorMatch) {
      variant.flavor = flavorMatch[1]
    }

    // Extract size/weight
    const sizeMatch = fullName.match(/(\d+(?:\.\d+)?)\s*(g|kg|lb|oz|ml|L)\b/i)
    if (sizeMatch) {
      variant.size = `${sizeMatch[1]} ${sizeMatch[2]}`
    }

    // Extract pack quantity
    const packMatch = fullName.match(/Case\s+of\s+(\d+)|(\d+)\s*ct\b|(\d+)\s*(pcs|pack|count)\b/i)
    if (packMatch) {
      variant.packQuantity = packMatch[1] || packMatch[2] || packMatch[3]
      variant.packType = packMatch[0].includes('Case') ? 'Case' : packMatch[0].includes('ct') ? 'Count' : 'Pack'
    }

    // Extract country
    const countryMatch = fullName.match(/\(\s*(UK|USA|EU|Turkey|Canada)\s*\)/i)
    if (countryMatch) {
      variant.country = countryMatch[1]
    }

    return variant
  }

  /**
   * Create a consolidated product from grouped items
   */
  _createConsolidatedProduct(baseName, items) {
    // If only one item, return it as-is (no consolidation needed)
    if (items.length === 1) {
      const item = items[0]
      return {
        id: item.id || item.sku || `item-${Date.now()}`,
        sku: item.sku || item.item_number || 'N/A',
        name: baseName,
        description: item.description || item.item_description || baseName,
        quantity: item.quantity || item.qty || 0,
        unitPrice: item.unit_price || item.price || 0,
        totalPrice: item.total_price || item.total || 0,
        confidence: item.confidence || 85,
        isConsolidated: false,
        variants: null
      }
    }

    // Multiple items - consolidate
    const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || item.qty || 0), 0)
    const totalPrice = items.reduce((sum, item) => sum + (item.total_price || item.total || 0), 0)
    const avgConfidence = Math.round(items.reduce((sum, item) => sum + (item.confidence || 85), 0) / items.length)

    // Create primary SKU (use first item or concatenate)
    const primarySKU = items.length <= 3 
      ? items.map(i => i.sku || i.item_number).filter(Boolean).join(', ')
      : `${items[0].sku || items[0].item_number} +${items.length - 1} more`

    return {
      id: `consolidated-${items[0].id || items[0].sku || Date.now()}`,
      sku: primarySKU,
      name: baseName,
      description: `${baseName} (${items.length} variants)`,
      quantity: totalQuantity,
      unitPrice: totalPrice / totalQuantity, // Average unit price
      totalPrice: totalPrice,
      confidence: avgConfidence,
      isConsolidated: true,
      variantCount: items.length,
      variants: items.map(item => ({
        id: item.id || item.sku || `variant-${Date.now()}`,
        sku: item.sku || item.item_number || 'N/A',
        name: item.description || item.item_description || item.name || 'Unknown',
        fullDescription: item.description || item.item_description || item.name || '',
        quantity: item.quantity || item.qty || 0,
        unitPrice: item.unit_price || item.price || 0,
        totalPrice: item.total_price || item.total || 0,
        confidence: item.confidence || 85,
        variantInfo: item.variantInfo || {},
        // Preserve all original fields for detailed view
        _original: item
      }))
    }
  }

  /**
   * Get display text for consolidated product
   */
  getConsolidatedDisplayText(product) {
    if (!product.isConsolidated) {
      return product.name
    }

    return `${product.name} (${product.variantCount} variants)`
  }

  /**
   * Check if consolidation should be applied based on item count
   */
  shouldConsolidate(lineItems) {
    if (!lineItems || lineItems.length < 10) {
      return false // Don't consolidate small orders
    }

    // Check if there are potential duplicates (similar names)
    const uniqueBaseNames = new Set()
    for (const item of lineItems) {
      const baseName = this._extractBaseProductName(item.description || item.item_description || item.name || '')
      uniqueBaseNames.add(baseName)
    }

    // If consolidation would reduce items by at least 20%, apply it
    const reductionPercent = ((lineItems.length - uniqueBaseNames.size) / lineItems.length) * 100
    return reductionPercent >= 20
  }
}

export const productConsolidationService = new ProductConsolidationService()
