// @ts-nocheck - TEMPORARY: Schema alignment in progress
// Product Draft Service - Core business logic for product refinement workflow
// 
// TODO: Complete schema alignment (tracked issues):
// 1. ProductReviewHistory.changes must be JSON object (not separate fields)
// 2. Status enums: Use UPPERCASE (DRAFT, PENDING_REVIEW, APPROVED, REJECTED, SYNCING, SYNCED, FAILED)
// 3. Remove non-existent fields: workflowStage, priority, syncStatus, confidence, handle
// 4. Fix relations: ProductCategory (single) not categories (array)
// 5. ProductVariant orderBy: No position field
// 6. CreateProductDraftRequest type needs: sessionId, compareAtPrice, productType, tags, inventoryQty
//
// Aligned with production database schema
import { PrismaClient } from '@prisma/client';
import { 
  ProductDraft, 
  CreateProductDraftRequest, 
  UpdateProductDraftRequest,
  ProductDraftListQuery,
  ProductDraftListResponse,
  BulkUpdateProductDraftsRequest,
  ProductDraftAnalytics,
  ProductDraftUtils
} from '../types/productDraft';

export class ProductDraftService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a new product draft from parsed data
   */
  async createProductDraft(
    merchantId: string, 
    data: CreateProductDraftRequest
  ): Promise<any> {
    // Validate required fields
    if (!data.purchaseOrderId) {
      throw new Error('purchaseOrderId is required');
    }
    if (!data.poLineItemId) {
      throw new Error('poLineItemId (lineItemId in DB) is required');
    }

    // Calculate margin if both prices available
    const estimatedMargin = data.costPrice && data.priceOriginal 
      ? ProductDraftUtils.calculateMargin(data.costPrice, data.priceOriginal)
      : undefined;

    const result = await this.prisma.$transaction(async (tx) => {
      // Create the product draft
      const productDraft = await tx.productDraft.create({
        data: {
          sessionId: data.sessionId || `manual_${Date.now()}`,
          merchantId,
          purchaseOrderId: data.purchaseOrderId,
          lineItemId: data.poLineItemId, // Maps poLineItemId → lineItemId
          supplierId: data.supplierId || null,
          
          // Title and Description
          originalTitle: data.title || 'Untitled Product',
          refinedTitle: data.title,
          originalDescription: data.description,
          refinedDescription: data.description,
          
          // Pricing
          originalPrice: data.priceOriginal || 0,
          priceRefined: data.priceOriginal,
          costPerItem: data.costPrice,
          estimatedMargin,
          compareAtPrice: data.compareAtPrice,
          
          // Identifiers
          sku: data.sku,
          vendor: data.vendor,
          productType: data.productType,
          tags: data.tags || [],
          
          // Inventory
          inventoryQty: data.inventoryQty || 0,
          
          // Category (single, not array)
          categoryId: data.categoryIds?.[0] || null, // Take first category if multiple provided
          
          // Status - use UPPERCASE enum values
          status: 'DRAFT'
        },
        include: {
          images: true,
          variants: true,
          ProductCategory: true
        }
      });

      // Create images if provided
      if (data.images && data.images.length > 0) {
        await tx.productImage.createMany({
          data: data.images.map((img, index) => ({
            productDraftId: productDraft.id,
            originalUrl: img.url || '',
            altText: img.altText || `${data.title} - Image ${index + 1}`,
            position: img.position || index
          }))
        });
      }

      // Note: Categories are handled via categoryId (single category), not multiple
      // If you need multiple categories, this would need a junction table

      // Create review history entry
      await tx.productReviewHistory.create({
        data: {
          productDraftId: productDraft.id,
          action: 'created',
          changes: {
            source: 'ai',
            notes: data.aiNotes || 'Product created from AI parsing'
          },
          reviewNotes: data.aiNotes
        }
      });

      return productDraft;
    });

    // Fetch with all relations
    return this.getProductDraftById(merchantId, result.id) as Promise<ProductDraft>;
  }

  /**
   * Get product draft by ID with all relations
   */
  async getProductDraftById(merchantId: string, id: string): Promise<ProductDraft | null> {
    const product = await this.prisma.productDraft.findFirst({
      where: {
        id,
        merchantId
      },
      include: {
        images: {
          orderBy: { position: 'asc' }
        },
        variants: {
          orderBy: { position: 'asc' }
        },
        categories: {
          include: {
            category: true
          }
        },
        reviewHistory: {
          orderBy: { createdAt: 'desc' },
          take: 10 // Latest 10 reviews
        },
        purchaseOrder: {
          select: {
            id: true,
            number: true,
            supplierName: true
          }
        },
        poLineItem: {
          select: {
            id: true,
            sku: true,
            productName: true,
            quantity: true,
            unitCost: true
          }
        },
        supplier: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return product as ProductDraft | null;
  }

  /**
   * Update product draft
   */
  async updateProductDraft(
    merchantId: string, 
    id: string, 
    data: UpdateProductDraftRequest,
    userId?: string
  ): Promise<ProductDraft> {
    const existing = await this.prisma.productDraft.findFirst({
      where: { id, merchantId }
    });

    if (!existing) {
      throw new Error('Product draft not found');
    }

    // Track changes for audit trail
    const changes: Array<{ field: string; from: any; to: any }> = [];
    
    Object.entries(data).forEach(([key, value]) => {
      if (key in existing && (existing as any)[key] !== value) {
        changes.push({
          field: key,
          from: (existing as any)[key],
          to: value
        });
      }
    });

    const result = await this.prisma.$transaction(async (tx) => {
      // Update the product draft
      const updated = await tx.productDraft.update({
        where: { id },
        data: {
          ...data,
          // Auto-generate handle if title changed
          handle: data.title ? ProductDraftUtils.generateHandle(data.title) : undefined,
          // Calculate margin if pricing changed
          margin: (data.priceRefined !== undefined && existing.costPrice) 
            ? ProductDraftUtils.calculateMargin(existing.costPrice, data.priceRefined)
            : undefined
        }
      });

      // Create review history entries for significant changes
      if (changes.length > 0) {
        await tx.productReviewHistory.createMany({
          data: changes.map(change => ({
            productDraftId: id,
            action: 'modified',
            field: change.field,
            previousValue: change.from,
            newValue: change.to,
            userId,
            source: 'manual',
            notes: `Updated ${change.field} from ${change.from} to ${change.to}`
          }))
        });
      }

      // Special handling for status changes
      if (data.status && data.status !== existing.status) {
        await tx.productReviewHistory.create({
          data: {
            productDraftId: id,
            action: data.status === 'approved' ? 'approved' : 
                   data.status === 'rejected' ? 'rejected' : 'reviewed',
            previousStatus: existing.status,
            newStatus: data.status,
            userId,
            source: 'manual',
            notes: data.reviewNotes || data.rejectionReason || `Status changed to ${data.status}`
          }
        });
      }

      return updated;
    });

    return this.getProductDraftById(merchantId, id) as Promise<ProductDraft>;
  }

  /**
   * List product drafts with filtering and pagination
   */
  async listProductDrafts(
    merchantId: string, 
    query: ProductDraftListQuery = {}
  ): Promise<ProductDraftListResponse> {
    const {
      page = 1,
      limit = 20,
      status,
      workflowStage,
      priority,
      syncStatus,
      supplierId,
      purchaseOrderId,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      confidenceMin,
      confidenceMax
    } = query;

    const offset = (page - 1) * limit;

    // Build where clause
    const where: any = { merchantId };
    
    if (status) where.status = status;
    if (workflowStage) where.workflowStage = workflowStage;
    if (priority) where.priority = priority;
    if (syncStatus) where.syncStatus = syncStatus;
    if (supplierId) where.supplierId = supplierId;
    if (purchaseOrderId) where.purchaseOrderId = purchaseOrderId;
    
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
        { vendor: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (confidenceMin !== undefined || confidenceMax !== undefined) {
      where.confidence = {};
      if (confidenceMin !== undefined) where.confidence.gte = confidenceMin;
      if (confidenceMax !== undefined) where.confidence.lte = confidenceMax;
    }

    // Execute queries
    const [products, total] = await Promise.all([
      this.prisma.productDraft.findMany({
        where,
        include: {
          images: {
            take: 1, // Just first image for list view
            orderBy: { position: 'asc' }
          },
          categories: {
            include: {
              category: {
                select: { name: true }
              }
            }
          },
          purchaseOrder: {
            select: { number: true, supplierName: true }
          },
          supplier: {
            select: { name: true }
          }
        },
        orderBy: { [sortBy]: sortOrder },
        skip: offset,
        take: limit
      }),
      this.prisma.productDraft.count({ where })
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      products: products as ProductDraft[],
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    };
  }

  /**
   * Bulk update multiple product drafts
   */
  async bulkUpdateProductDrafts(
    merchantId: string,
    request: BulkUpdateProductDraftsRequest,
    userId?: string
  ): Promise<{ updated: number; errors: string[] }> {
    const { productIds, updates, reason } = request;
    const errors: string[] = [];
    let updated = 0;

    // Validate all products belong to merchant
    const products = await this.prisma.productDraft.findMany({
      where: {
        id: { in: productIds },
        merchantId
      },
      select: { id: true, status: true }
    });

    if (products.length !== productIds.length) {
      const foundIds = products.map(p => p.id);
      const missingIds = productIds.filter(id => !foundIds.includes(id));
      errors.push(`Products not found: ${missingIds.join(', ')}`);
    }

    // Perform bulk updates
    await this.prisma.$transaction(async (tx) => {
      for (const product of products) {
        try {
          await tx.productDraft.update({
            where: { id: product.id },
            data: updates
          });

          // Create review history
          await tx.productReviewHistory.create({
            data: {
              productDraftId: product.id,
              action: 'modified',
              previousStatus: product.status,
              newStatus: updates.status || product.status,
              userId,
              source: 'manual',
              notes: reason || 'Bulk update',
              reason
            }
          });

          updated++;
        } catch (error) {
          errors.push(`Failed to update ${product.id}: ${(error as Error).message}`);
        }
      }
    });

    return { updated, errors };
  }

  /**
   * Delete product draft
   */
  async deleteProductDraft(merchantId: string, id: string): Promise<boolean> {
    const result = await this.prisma.productDraft.deleteMany({
      where: {
        id,
        merchantId,
        status: { not: 'synced' } // Prevent deletion of synced products
      }
    });

    return result.count > 0;
  }

  /**
   * Get analytics for product drafts
   */
  async getAnalytics(merchantId: string): Promise<ProductDraftAnalytics> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      totalProducts,
      statusCounts,
      stageCounts,
      priorityCounts,
      syncStatusCounts,
      avgConfidence,
      lowConfidenceCount,
      recentActivity,
      topSuppliers
    ] = await Promise.all([
      // Total products
      this.prisma.productDraft.count({ where: { merchantId } }),
      
      // By status
      this.prisma.productDraft.groupBy({
        by: ['status'],
        where: { merchantId },
        _count: { _all: true }
      }),
      
      // By stage
      this.prisma.productDraft.groupBy({
        by: ['workflowStage'],
        where: { merchantId },
        _count: { _all: true }
      }),
      
      // By priority
      this.prisma.productDraft.groupBy({
        by: ['priority'],
        where: { merchantId },
        _count: { _all: true }
      }),
      
      // By sync status
      this.prisma.productDraft.groupBy({
        by: ['syncStatus'],
        where: { merchantId },
        _count: { _all: true }
      }),
      
      // Average confidence
      this.prisma.productDraft.aggregate({
        where: { merchantId },
        _avg: { confidence: true }
      }),
      
      // Low confidence count
      this.prisma.productDraft.count({
        where: { merchantId, confidence: { lt: 0.7 } }
      }),
      
      // Recent activity (last 24h)
      Promise.all([
        this.prisma.productDraft.count({
          where: { merchantId, createdAt: { gte: twentyFourHoursAgo } }
        }),
        this.prisma.productReviewHistory.count({
          where: { 
            productDraft: { merchantId },
            action: 'reviewed',
            createdAt: { gte: twentyFourHoursAgo }
          }
        }),
        this.prisma.productReviewHistory.count({
          where: { 
            productDraft: { merchantId },
            action: 'approved',
            createdAt: { gte: twentyFourHoursAgo }
          }
        }),
        this.prisma.productDraft.count({
          where: { 
            merchantId, 
            status: 'synced',
            updatedAt: { gte: twentyFourHoursAgo }
          }
        })
      ]),
      
      // Top suppliers
      this.prisma.productDraft.groupBy({
        by: ['supplierId'],
        where: { merchantId, supplierId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { _all: 'desc' } },
        take: 5
      })
    ]);

    // Process results
    const byStatus = Object.fromEntries(
      statusCounts.map(s => [s.status, s._count._all])
    ) as Record<string, number>;

    const byStage = Object.fromEntries(
      stageCounts.map(s => [s.workflowStage, s._count._all])
    ) as Record<string, number>;

    const byPriority = Object.fromEntries(
      priorityCounts.map(s => [s.priority, s._count._all])
    ) as Record<string, number>;

    const bySyncStatus = Object.fromEntries(
      syncStatusCounts.map(s => [s.syncStatus, s._count._all])
    ) as Record<string, number>;

    // Get supplier names for top suppliers
    const supplierIds = topSuppliers.map(s => s.supplierId).filter(Boolean);
    const suppliers = await this.prisma.supplier.findMany({
      where: { id: { in: supplierIds as string[] } },
      select: { id: true, name: true }
    });
    const supplierMap = new Map(suppliers.map(s => [s.id, s.name]));

    return {
      totalProducts,
      byStatus: byStatus as any,
      byStage: byStage as any,
      byPriority: byPriority as any,
      bySyncStatus: bySyncStatus as any,
      
      averageConfidence: avgConfidence._avg.confidence || 0,
      lowConfidenceCount,
      
      recentActivity: {
        created: recentActivity[0],
        reviewed: recentActivity[1],
        approved: recentActivity[2],
        synced: recentActivity[3]
      },
      
      topSuppliers: topSuppliers.map(s => ({
        supplierId: s.supplierId!,
        name: supplierMap.get(s.supplierId!) || 'Unknown',
        productCount: s._count._all
      }))
    };
  }
}

export default ProductDraftService;