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
    const prisma = await this._getClient();

    // First create the draft without any heavy relation loading
    const created = await prisma.productDraft.create({
      data
    });

    // Follow up with a lightweight read for just the fields we need downstream
    const productDraft = await prisma.productDraft.findUnique({
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
    });

    if (productDraft && productDraft.POLineItem && !productDraft.lineItem) {
      productDraft.lineItem = productDraft.POLineItem;
    }

    return productDraft;
  }

  /**
   * Get all product drafts for a merchant
   */
  async getProductDrafts(merchantId) {
    const prisma = await this._getClient();
    return await prisma.productDraft.findMany({
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
    });
  }

  /**
   * Update a product draft
   */
  async updateProductDraft(id, data) {
    const prisma = await this._getClient();
    const updateData = { 
      ...data,
      reviewedAt: data.reviewedBy ? new Date() : undefined
    };
    
    return await prisma.productDraft.update({
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
    });
  }

  /**
   * Delete a product draft
   */
  async deleteProductDraft(id) {
    const prisma = await this._getClient();
    return await prisma.productDraft.delete({
      where: { id }
    });
  }

  /**
   * Get analytics for product drafts
   */
  async getAnalytics(merchantId) {
    const prisma = await this._getClient();
    const [
      total,
      byStatus,
      avgMargin,
      recentCount
    ] = await Promise.all([
      // Total count
      prisma.productDraft.count({
        where: { merchantId }
      }),
      
      // Count by status
      prisma.productDraft.groupBy({
        by: ['status'],
        where: { merchantId },
        _count: true
      }),
      
      // Average margin
      prisma.productDraft.aggregate({
        where: { 
          merchantId,
          estimatedMargin: { not: null }
        },
        _avg: { estimatedMargin: true }
      }),
      
      // Recent count (last 7 days)
      prisma.productDraft.count({
        where: {
          merchantId,
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          }
        }
      })
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