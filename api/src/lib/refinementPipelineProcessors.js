/**
 * Refinement Pipeline Processors
 * 
 * Redis queue processors for the 5-stage refinement pipeline:
 * 1. Raw parse (existing ai_parsing)
 * 2. Normalization
 * 3. Merchant config application  
 * 4. AI enrichment
 * 5. Shopify payload preparation
 */

import { RefinementPipelineService } from './refinementPipelineService.js'
import { db } from './db.js'
import { workflowOrchestrator } from './workflowOrchestrator.js'

const pipelineService = new RefinementPipelineService()

/**
 * Stage 2: Normalization Processor
 * Queue: 'data-normalization'
 */
export async function processNormalization(job) {
  console.log(`🔧 [NORMALIZATION] Processing job ${job.id}`)
  
  let prisma

  try {
    const { purchaseOrderId, lineItems, merchantId } = job.data
    prisma = await db.getClient()
    
    // Get merchant config for normalization
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId }
    })
    
    const merchantConfig = {
      baseCurrency: merchant?.currency || 'USD'
    }
    
    // Normalize the line items
    const normalizedItems = await pipelineService.normalizeLineItems(lineItems, merchantConfig)
    
    // Update line items in database with normalized data
    await Promise.all(normalizedItems.map(async (item) => {
      await prisma.pOLineItem.update({
        where: { id: item.id },
        data: {
          unitCost: item.unitCost,
          totalCost: item.totalCost,
          quantity: item.quantity,
          productName: item.productName,
          description: item.description,
          sku: item.sku,
          status: 'normalized'
        }
      })
    }))
    
    // Update purchase order status
    await prisma.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: {
        status: 'normalized',
        processingNotes: 'Data normalization completed'
      }
    })
    
    // Add next stage to queue: merchant config application
    await workflowOrchestrator.addJobToQueue('merchant-config', {
      purchaseOrderId,
      lineItems: normalizedItems,
      merchantId
    }, { priority: 1 })
    
    console.log(`✅ [NORMALIZATION] Completed job ${job.id}`)
    return { success: true, normalizedItems: normalizedItems.length }
    
  } catch (error) {
    console.error(`❌ [NORMALIZATION] Job ${job.id} failed:`, error)
    
    // Update purchase order with error status
    const prismaClient = prisma ?? (await db.getClient())
    await prismaClient.purchaseOrder.update({
      where: { id: job.data.purchaseOrderId },
      data: {
        status: 'failed',
        processingNotes: `Normalization failed: ${error.message}`
      }
    })
    
    throw error
  }
}

/**
 * Stage 3: Merchant Configuration Processor  
 * Queue: 'merchant-config'
 */
export async function processMerchantConfig(job) {
  console.log(`⚙️ [MERCHANT-CONFIG] Processing job ${job.id}`)
  
  let prisma

  try {
    const { purchaseOrderId, lineItems, merchantId } = job.data
    prisma = await db.getClient()
    
    // Apply merchant configurations
    const configuredItems = await pipelineService.applyMerchantConfigs(lineItems, merchantId)
    
    // Update line items in database with configured data
    await Promise.all(configuredItems.map(async (item) => {
      await prisma.pOLineItem.update({
        where: { id: item.id },
        data: {
          unitCost: item.unitCost,
          totalCost: item.totalCost,
          // Store refined pricing data as JSON
          aiNotes: JSON.stringify({
            refinedPricing: {
              retailPrice: item.retailPrice,
              margin: item.margin,
              marginPercentage: item.marginPercentage,
              appliedRules: item.appliedRules
            },
            category: item.category,
            categoryConfidence: item.categoryConfidence
          }),
          status: 'configured'
        }
      })
    }))
    
    // Update purchase order status
    await prisma.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: {
        status: 'configured',
        processingNotes: 'Merchant configurations applied'
      }
    })
    
    // Add next stage to queue: AI enrichment
    await workflowOrchestrator.addJobToQueue('ai-enrichment', {
      purchaseOrderId,
      lineItems: configuredItems,
      merchantId
    }, { priority: 1 })
    
    console.log(`✅ [MERCHANT-CONFIG] Completed job ${job.id}`)
    return { success: true, configuredItems: configuredItems.length }
    
  } catch (error) {
    console.error(`❌ [MERCHANT-CONFIG] Job ${job.id} failed:`, error)
    
    // Update purchase order with error status
    const prismaClient = prisma ?? (await db.getClient())
    await prismaClient.purchaseOrder.update({
      where: { id: job.data.purchaseOrderId },
      data: {
        status: 'failed',
        processingNotes: `Merchant config failed: ${error.message}`
      }
    })
    
    throw error
  }
}

/**
 * Stage 4: AI Enrichment Processor
 * Queue: 'ai-enrichment'
 */
export async function processAIEnrichment(job) {
  console.log(`🤖 [AI-ENRICHMENT] Processing job ${job.id}`)
  
  let prisma

  try {
    const { purchaseOrderId, lineItems, merchantId } = job.data
    prisma = await db.getClient()
    
    // Apply AI enrichment
    const enrichedItems = await pipelineService.enrichWithAI(lineItems, merchantId)
    
    // Update line items in database with enriched data
    await Promise.all(enrichedItems.map(async (item) => {
      const existingNotes = item.aiNotes ? JSON.parse(item.aiNotes) : {}
      
      await prisma.pOLineItem.update({
        where: { id: item.id },
        data: {
          description: item.enhancedDescription || item.description,
          aiNotes: JSON.stringify({
            ...existingNotes,
            enrichment: {
              enhancedDescription: item.enhancedDescription,
              aiGeneratedTags: item.aiGeneratedTags,
              productImages: item.productImages,
              seoTitle: item.seoTitle,
              specifications: item.specifications,
              enrichmentConfidence: item.enrichmentConfidence,
              enrichedAt: item.enrichedAt
            }
          }),
          status: 'enriched'
        }
      })
    }))
    
    // Update purchase order status
    await prisma.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: {
        status: 'enriched',
        processingNotes: 'AI enrichment completed'
      }
    })
    
    // Add next stage to queue: Shopify payload preparation
    await workflowOrchestrator.addJobToQueue('shopify-payload', {
      purchaseOrderId,
      lineItems: enrichedItems,
      merchantId
    }, { priority: 1 })
    
    console.log(`✅ [AI-ENRICHMENT] Completed job ${job.id}`)
    return { success: true, enrichedItems: enrichedItems.length }
    
  } catch (error) {
    console.error(`❌ [AI-ENRICHMENT] Job ${job.id} failed:`, error)
    
    // Update purchase order with error status
    const prismaClient = prisma ?? (await db.getClient())
    await prismaClient.purchaseOrder.update({
      where: { id: job.data.purchaseOrderId },
      data: {
        status: 'failed',
        processingNotes: `AI enrichment failed: ${error.message}`
      }
    })
    
    throw error
  }
}

/**
 * Stage 5: Shopify Payload Preparation Processor
 * Queue: 'shopify-payload'
 */
export async function processShopifyPayload(job) {
  console.log(`🛍️ [SHOPIFY-PAYLOAD] Processing job ${job.id}`)
  
  let prisma

  try {
    const { purchaseOrderId, lineItems, merchantId } = job.data
    prisma = await db.getClient()
    
    // Get purchase order data for context
    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: {
        supplier: true
      }
    })
    
    // Prepare Shopify-ready payload
    const shopifyProducts = await pipelineService.prepareShopifyPayload(
      lineItems, 
      purchaseOrder, 
      merchantId
    )
    
    // Create product drafts in database
    await Promise.all(shopifyProducts.map(async (productData) => {
      await prisma.productDraft.create({
        data: {
          lineItemId: productData.originalLineItem.id,
          title: productData.shopifyProduct.title,
          description: productData.shopifyProduct.body_html,
          vendor: productData.shopifyProduct.vendor,
          productType: productData.shopifyProduct.product_type,
          tags: productData.shopifyProduct.tags,
          price: parseFloat(productData.shopifyProduct.variants[0].price),
          compareAtPrice: productData.shopifyProduct.variants[0].compare_at_price ? 
            parseFloat(productData.shopifyProduct.variants[0].compare_at_price) : null,
          cost: parseFloat(productData.shopifyProduct.variants[0].cost),
          sku: productData.shopifyProduct.variants[0].sku,
          inventoryQuantity: productData.shopifyProduct.variants[0].inventory_quantity,
          weight: productData.shopifyProduct.variants[0].weight,
          weightUnit: productData.shopifyProduct.variants[0].weight_unit,
          status: 'draft',
          shopifyPayload: JSON.stringify(productData.shopifyProduct),
          processingMetadata: JSON.stringify(productData.processingMetadata)
        }
      })
    }))
    
    // Update purchase order status to completed
    await prisma.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: {
        status: 'completed',
        processingNotes: 'Refinement pipeline completed successfully - products ready for review'
      }
    })
    
    console.log(`✅ [SHOPIFY-PAYLOAD] Completed job ${job.id}`)
    return { success: true, productDrafts: shopifyProducts.length }
    
  } catch (error) {
    console.error(`❌ [SHOPIFY-PAYLOAD] Job ${job.id} failed:`, error)
    
    // Update purchase order with error status
    const prismaClient = prisma ?? (await db.getClient())
    await prismaClient.purchaseOrder.update({
      where: { id: job.data.purchaseOrderId },
      data: {
        status: 'failed',
        processingNotes: `Shopify payload preparation failed: ${error.message}`
      }
    })
    
    throw error
  }
}

export default {
  processNormalization,
  processMerchantConfig,
  processAIEnrichment,
  processShopifyPayload
}