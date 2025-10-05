/**
 * Shopify Synchronization Service
 * 
 * Orchestrates the synchronization of AI-processed purchase orders to Shopify
 * Handles job scheduling, error handling, and integration with database persistence
 */

import ShopifyService from './shopifyService.js'
import { PrismaClient } from '@prisma/client'

export class ShopifySyncService {
  constructor() {
    this.prisma = new PrismaClient()
    this.shopifyClients = new Map() // Cache Shopify clients by merchant
  }

  /**
   * Get or create Shopify client for a merchant
   */
  async getShopifyClient(merchantId) {
    if (this.shopifyClients.has(merchantId)) {
      return this.shopifyClients.get(merchantId)
    }

    // Get merchant's Shopify credentials from database
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId }
    })

    if (!merchant) {
      throw new Error(`Merchant not found: ${merchantId}`)
    }

    if (!merchant.shopDomain || !merchant.accessToken) {
      throw new Error(`Shopify credentials not configured for merchant: ${merchantId}`)
    }

    const shopifyClient = new ShopifyService(merchant.shopDomain, merchant.accessToken)
    this.shopifyClients.set(merchantId, shopifyClient)

    return shopifyClient
  }

  /**
   * Sync a processed purchase order to Shopify
   */
  async syncPurchaseOrderToShopify(purchaseOrderId, options = {}) {
    const startTime = Date.now()
    
    try {
      console.log(`🔄 Starting Shopify sync for PO ID: ${purchaseOrderId}`)

      // Step 1: Get purchase order data
      const purchaseOrder = await this.prisma.purchaseOrder.findUnique({
        where: { id: purchaseOrderId },
        include: {
          lineItems: true,
          supplier: true,
          merchant: true,
          productDrafts: {
            include: {
              images: true,
              variants: true,
              supplier: true
            }
          }
        }
      })

      if (!purchaseOrder) {
        throw new Error(`Purchase order not found: ${purchaseOrderId}`)
      }

      if (purchaseOrder.status !== 'processing' && !options.forceSync) {
        throw new Error(`Purchase order status is ${purchaseOrder.status}, expected 'processing'`)
      }

      console.log(`📋 PO: ${purchaseOrder.number} (${purchaseOrder.lineItems.length} items)`)
      console.log(`🏪 Merchant: ${purchaseOrder.merchant.shopDomain}`)

      // Step 2: Get Shopify client
      const shopifyClient = await this.getShopifyClient(purchaseOrder.merchantId)

      // Step 3: Test Shopify connection
      const connectionTest = await shopifyClient.testConnection()
      if (!connectionTest.success) {
        throw new Error(`Shopify connection failed: ${connectionTest.error}`)
      }

      console.log(`✅ Connected to Shopify: ${connectionTest.shop.name}`)

      // Step 4: Update PO status to 'syncing'
      await this.prisma.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: { 
          status: 'syncing',
          syncStartedAt: new Date()
        }
      })

      // Step 5: Sync to Shopify
      const syncResult = await shopifyClient.syncPurchaseOrderToShopify(
        purchaseOrder,
        purchaseOrder.lineItems,
        purchaseOrder.supplier,
        options
      )

      // Step 6: Update line items with Shopify data
      await this.updateLineItemsWithShopifyData(syncResult)

      // Step 7: Update PO status based on sync results
      const finalStatus = syncResult.success ? 'synced' : 'sync_error'
      const processingTime = Date.now() - startTime

      await this.prisma.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: {
          status: finalStatus,
          syncCompletedAt: new Date(),
          syncResults: syncResult,
          processingNotes: this.generateSyncNotes(syncResult),
          totalProcessingTime: processingTime
        }
      })

      // Step 8: Create sync audit record
      await this.createSyncAuditRecord(purchaseOrderId, syncResult, processingTime)

      console.log(`✅ Shopify sync completed for PO ${purchaseOrder.number}`)
      console.log(`   Status: ${finalStatus}`)
      console.log(`   Processing Time: ${processingTime}ms`)

      return {
        success: true,
        purchaseOrderId,
        syncResult,
        processingTime,
        status: finalStatus
      }

    } catch (error) {
      console.error(`❌ Shopify sync failed for PO ${purchaseOrderId}:`, error.message)

      // Update PO with error status
      try {
        await this.prisma.purchaseOrder.update({
          where: { id: purchaseOrderId },
          data: {
            status: 'sync_error',
            syncCompletedAt: new Date(),
            processingNotes: `Sync failed: ${error.message}`,
            totalProcessingTime: Date.now() - startTime
          }
        })
      } catch (updateError) {
        console.error('Failed to update PO error status:', updateError.message)
      }

      return {
        success: false,
        error: error.message,
        purchaseOrderId,
        processingTime: Date.now() - startTime
      }
    }
  }

  /**
   * Update line items with Shopify product/variant IDs
   */
  async updateLineItemsWithShopifyData(syncResult) {
    const updates = []

    // Process created products
    for (const item of syncResult.created) {
      updates.push(
        this.prisma.pOLineItem.update({
          where: { id: item.lineItem.id },
          data: {
            shopifyProductId: item.product.id,
            shopifyVariantId: item.variant?.id,
            shopifySync: 'created',
            shopifySyncAt: new Date()
          }
        })
      )

      if (item.draft?.id) {
        updates.push(
          this.prisma.productDraft.update({
            where: { id: item.draft.id },
            data: {
              shopifyProductId: item.product.id,
              shopifyVariantId: item.variant?.id || null,
              status: 'SYNCED'
            }
          })
        )
      }
    }

    // Process updated products
    for (const item of syncResult.updated) {
      updates.push(
        this.prisma.pOLineItem.update({
          where: { id: item.lineItem.id },
          data: {
            shopifyProductId: item.product.id,
            shopifyVariantId: item.variant?.id,
            shopifySync: 'updated',
            shopifySyncAt: new Date()
          }
        })
      )

      if (item.draft?.id) {
        updates.push(
          this.prisma.productDraft.update({
            where: { id: item.draft.id },
            data: {
              shopifyProductId: item.product.id,
              shopifyVariantId: item.variant?.id || null,
              status: 'SYNCED'
            }
          })
        )
      }
    }

    // Process errors
    for (const item of syncResult.errors) {
      updates.push(
        this.prisma.pOLineItem.update({
          where: { id: item.lineItem.id },
          data: {
            shopifySync: 'error',
            shopifySyncAt: new Date(),
            syncError: item.error
          }
        })
      )

      if (item.draft?.id) {
        updates.push(
          this.prisma.productDraft.update({
            where: { id: item.draft.id },
            data: {
              status: 'FAILED',
              reviewNotes: item.error?.slice(0, 500) || undefined
            }
          })
        )
      }
    }

    await Promise.all(updates)
  }

  /**
   * Create audit record for sync operation
   */
  async createSyncAuditRecord(purchaseOrderId, syncResult, processingTime) {
    await this.prisma.shopifySyncAudit.create({
      data: {
        purchaseOrderId,
        syncStartTime: new Date(Date.now() - processingTime),
        syncEndTime: new Date(),
        processingTime,
        success: syncResult.success,
        itemsProcessed: syncResult.summary.totalItems,
        itemsCreated: syncResult.summary.createdCount,
        itemsUpdated: syncResult.summary.updatedCount,
        itemsErrored: syncResult.summary.errorCount,
        syncResults: syncResult,
        errorMessage: syncResult.success ? null : 'Sync completed with errors'
      }
    })
  }

  /**
   * Generate processing notes from sync results
   */
  generateSyncNotes(syncResult) {
    const notes = []
    
    notes.push(`Shopify Sync Summary:`)
    notes.push(`- Total Items: ${syncResult.summary.totalItems}`)
    notes.push(`- Created: ${syncResult.summary.createdCount}`)
    notes.push(`- Updated: ${syncResult.summary.updatedCount}`)
    notes.push(`- Errors: ${syncResult.summary.errorCount}`)

    if (syncResult.errors.length > 0) {
      notes.push(`\nErrors:`)
      syncResult.errors.forEach((error, index) => {
        notes.push(`- ${error.lineItem.productName}: ${error.error}`)
      })
    }

    return notes.join('\n')
  }

  /**
   * Queue purchase order for Shopify sync (job-based)
   */
  async queuePurchaseOrderSync(purchaseOrderId, priority = 'normal') {
    try {
      // Create a sync job record
      const syncJob = await this.prisma.syncJob.create({
        data: {
          purchaseOrderId,
          type: 'shopify_sync',
          status: 'queued',
          priority,
          queuedAt: new Date(),
          retryCount: 0,
          maxRetries: 3
        }
      })

      console.log(`📋 Queued Shopify sync job: ${syncJob.id} for PO: ${purchaseOrderId}`)

      return {
        success: true,
        jobId: syncJob.id,
        message: 'Shopify sync job queued successfully'
      }

    } catch (error) {
      console.error('Failed to queue Shopify sync job:', error.message)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Process queued sync jobs
   */
  async processQueuedSyncJobs(limit = 5) {
    try {
      // Get pending jobs
      const jobs = await this.prisma.syncJob.findMany({
        where: {
          type: 'shopify_sync',
          status: 'queued',
          retryCount: { lt: 3 }
        },
        orderBy: [
          { priority: 'desc' },
          { queuedAt: 'asc' }
        ],
        take: limit,
        include: {
          purchaseOrder: true
        }
      })

      console.log(`🔄 Processing ${jobs.length} queued Shopify sync jobs`)

      const results = []

      for (const job of jobs) {
        try {
          // Update job status to processing
          await this.prisma.syncJob.update({
            where: { id: job.id },
            data: {
              status: 'processing',
              startedAt: new Date()
            }
          })

          // Process the sync
          const syncResult = await this.syncPurchaseOrderToShopify(job.purchaseOrderId)

          // Update job with results
          await this.prisma.syncJob.update({
            where: { id: job.id },
            data: {
              status: syncResult.success ? 'completed' : 'failed',
              completedAt: new Date(),
              results: syncResult,
              errorMessage: syncResult.success ? null : syncResult.error
            }
          })

          results.push({
            jobId: job.id,
            purchaseOrderId: job.purchaseOrderId,
            success: syncResult.success,
            error: syncResult.error
          })

        } catch (error) {
          console.error(`❌ Sync job ${job.id} failed:`, error.message)

          // Update job with failure and increment retry count
          await this.prisma.syncJob.update({
            where: { id: job.id },
            data: {
              status: job.retryCount >= 2 ? 'failed' : 'queued',
              retryCount: { increment: 1 },
              errorMessage: error.message,
              lastFailedAt: new Date()
            }
          })

          results.push({
            jobId: job.id,
            purchaseOrderId: job.purchaseOrderId,
            success: false,
            error: error.message
          })
        }
      }

      return {
        success: true,
        processedJobs: results.length,
        results
      }

    } catch (error) {
      console.error('Failed to process sync jobs:', error.message)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Get sync statistics for a merchant
   */
  async getSyncStats(merchantId, timeRange = '7d') {
    const since = new Date()
    const days = parseInt(timeRange.replace('d', ''))
    since.setDate(since.getDate() - days)

    const stats = await this.prisma.shopifySyncAudit.groupBy({
      by: ['success'],
      where: {
        purchaseOrder: {
          merchantId
        },
        syncStartTime: { gte: since }
      },
      _count: { id: true },
      _sum: {
        itemsCreated: true,
        itemsUpdated: true,
        itemsErrored: true
      }
    })

    return {
      timeRange,
      totalSyncs: stats.reduce((sum, stat) => sum + stat._count.id, 0),
      successfulSyncs: stats.find(s => s.success)?._count.id || 0,
      failedSyncs: stats.find(s => !s.success)?._count.id || 0,
      itemsCreated: stats.reduce((sum, stat) => sum + (stat._sum.itemsCreated || 0), 0),
      itemsUpdated: stats.reduce((sum, stat) => sum + (stat._sum.itemsUpdated || 0), 0),
      itemsErrored: stats.reduce((sum, stat) => sum + (stat._sum.itemsErrored || 0), 0)
    }
  }

  /**
   * Clean up resources
   */
  async disconnect() {
    await this.prisma.$disconnect()
    this.shopifyClients.clear()
  }
}

export const shopifySyncService = new ShopifySyncService()
export default shopifySyncService