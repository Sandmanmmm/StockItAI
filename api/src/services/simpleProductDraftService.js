// Simple Product Draft Service - Aligned with actual Prisma schema
import { PrismaClient } from '@prisma/client';

export class SimpleProductDraftService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * Create a new product draft using our actual Prisma schema
   */
  async createProductDraft(data) {
    // Build include object based on what's available
    const include = {
      session: true,
      merchant: true,
      purchaseOrder: true,
      POLineItem: true,
      images: true,
      variants: true,
      reviewHistory: true
    };

    // Only include supplier if supplierId is provided
    if (data.supplierId) {
      include.supplier = true;
    }

    return await this.prisma.productDraft.create({
      data: data,
      include: include
    });
  }

  /**
   * Get all product drafts for a merchant
   */
  async getProductDrafts(merchantId) {
    return await this.prisma.productDraft.findMany({
      where: { merchantId },
      include: {
        session: true,
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
    const updateData = { 
      ...data,
      reviewedAt: data.reviewedBy ? new Date() : undefined
    };
    
    return await this.prisma.productDraft.update({
      where: { id },
      data: updateData,
      include: {
        session: true,
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
    return await this.prisma.productDraft.delete({
      where: { id }
    });
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
      this.prisma.productDraft.count({
        where: { merchantId }
      }),
      
      // Count by status
      this.prisma.productDraft.groupBy({
        by: ['status'],
        where: { merchantId },
        _count: true
      }),
      
      // Average margin
      this.prisma.productDraft.aggregate({
        where: { 
          merchantId,
          estimatedMargin: { not: null }
        },
        _avg: { estimatedMargin: true }
      }),
      
      // Recent count (last 7 days)
      this.prisma.productDraft.count({
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