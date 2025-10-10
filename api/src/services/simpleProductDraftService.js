import { prismaOperation } from '../lib/db.js';

export class SimpleProductDraftService {
  constructor(dbProvider) {
    this.db = dbProvider;
  }

  async _getClient() {
    if (this.db?.getClient) {
      return await this.db.getClient();
    }

    if (this.db) {
      return this.db;
    }

    throw new Error('SimpleProductDraftService requires a Prisma client or db provider');
  }

  /**
   * Create a new product draft using our actual Prisma schema
   */
  async createProductDraft(data) {
    // First create the draft without any heavy relation loading
    const created = await prismaOperation(
      (client) => client.productDraft.create({ data }),
      'Create product draft'
    );

    // Follow up with a lightweight read for just the fields we need downstream
    const productDraft = await prismaOperation(
      (client) => client.productDraft.findUnique({
        where: { id: created.id },
        select: {
          id: true,
          lineItemId: true,
          sessionId: true,
          merchantId: true,
          supplierId: true,
          purchaseOrderId: true,
          originalTitle: true,
          refinedTitle: true,
          originalDescription: true,
          refinedDescription: true,
          originalPrice: true,
          priceRefined: true,
          estimatedMargin: true,
          status: true,
          tags: true,
          createdAt: true,
          updatedAt: true,
          POLineItem: {
            select: {
              id: true,
              sku: true,
              productName: true
            }
          }
        }
      }),
      'Find created product draft'
    );

    if (productDraft && productDraft.POLineItem && !productDraft.lineItem) {
      productDraft.lineItem = productDraft.POLineItem;
    }

    return productDraft;
  }

  /**
   * Get all product drafts for a merchant
   */
  async getProductDrafts(merchantId) {
    return await prismaOperation(
      (client) => client.productDraft.findMany({
        where: { merchantId },
        include: {
          Session: true,
          supplier: true,
          purchaseOrder: true,
          POLineItem: true,
          images: true,
          variants: true
        },
        orderBy: { createdAt: 'desc' }
      }),
      'Get product drafts for merchant'
    );
  }

  /**
   * Update a product draft
   */
  async updateProductDraft(id, data) {
    const updateData = { 
      ...data,
      reviewedAt: data.reviewedBy ? new Date() : undefined
    };
    
    return await prismaOperation(
      (client) => client.productDraft.update({
        where: { id },
        data: updateData,
        include: {
          Session: true,
          merchant: true,
          supplier: true,
          purchaseOrder: true,
          POLineItem: true,
          images: true,
          variants: true
        }
      }),
      'Update product draft'
    );
  }

  /**
   * Delete a product draft
   */
  async deleteProductDraft(id) {
    return await prismaOperation(
      (client) => client.productDraft.delete({ where: { id } }),
      'Delete product draft'
    );
  }

  /**
   * Get analytics for product drafts
   */
  async getAnalytics(merchantId) {
    const [
      total,
      byStatus,
      avgMargin,
      recentCount
    ] = await Promise.all([
      // Total count
      prismaOperation(
        (client) => client.productDraft.count({ where: { merchantId } }),
        'Count total product drafts'
      ),
      
      // Count by status
      prismaOperation(
        (client) => client.productDraft.groupBy({
          by: ['status'],
          where: { merchantId },
          _count: true
        }),
        'Group product drafts by status'
      ),
      
      // Average margin
      prismaOperation(
        (client) => client.productDraft.aggregate({
          where: { 
            merchantId,
            estimatedMargin: { not: null }
          },
          _avg: { estimatedMargin: true }
        }),
        'Calculate average margin'
      ),
      
      // Recent count (last 7 days)
      prismaOperation(
        (client) => client.productDraft.count({
          where: {
            merchantId,
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            }
          }
        }),
        'Count recent product drafts'
      )
    ]);

    return {
      total,
      byStatus: byStatus.reduce((acc, item) => ({
        ...acc,
        [item.status]: item._count
      }), {}),
      averageMargin: avgMargin._avg.estimatedMargin || 0,
      recentCount
    };
  }
}