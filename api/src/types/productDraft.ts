// Product Draft Types for StockIT AI
// Complete TypeScript definitions for the product refinement workflow

export interface ProductDraft {
  id: string;
  
  // Basic Product Information
  title: string;
  description?: string;
  vendor?: string;
  productType?: string;
  tags: string[];
  
  // Pricing Information
  priceOriginal?: number; // Original price from PO
  priceRefined?: number; // User-refined retail price
  currencyOriginal: string;
  currencyTarget: string;
  costPrice?: number; // Wholesale/cost price from PO
  msrp?: number; // Manufacturer suggested retail price
  margin?: number; // Profit margin percentage
  
  // Product Identifiers
  sku?: string;
  barcode?: string;
  upc?: string;
  isbn?: string;
  mpn?: string; // Manufacturer Part Number
  
  // Physical Properties
  weight?: number;
  weightUnit: string;
  dimensions?: ProductDimensions;
  
  // Inventory Management
  trackQuantity: boolean;
  inventoryPolicy: 'deny' | 'continue';
  fulfillmentService: string;
  requiresShipping: boolean;
  taxable: boolean;
  taxCode?: string;
  
  // SEO & Marketing
  seoTitle?: string;
  seoDescription?: string;
  handle?: string; // URL handle (auto-generated from title)
  
  // Status & Workflow
  status: ProductDraftStatus;
  workflowStage: ProductWorkflowStage;
  priority: ProductPriority;
  
  // AI Processing Metadata
  confidence: number; // Overall AI confidence score (0.0-1.0)
  confidenceBreakdown?: Record<string, number>; // Confidence scores per field
  aiNotes?: string; // AI processing notes and suggestions
  extractedData?: any; // Original extracted data from AI
  processingMethod?: string; // AI method used for extraction
  
  // Review & Approval
  reviewedBy?: string; // User ID who reviewed
  reviewedAt?: Date;
  reviewNotes?: string;
  approvedBy?: string; // User ID who approved
  approvedAt?: Date;
  rejectionReason?: string;
  
  // Shopify Integration
  shopifyProductId?: string;
  shopifyHandle?: string;
  syncStatus: ShopifySyncStatus;
  syncAttempts: number;
  lastSyncAt?: Date;
  syncError?: string;
  shopifyUrl?: string;
  
  // Data Relationships
  merchantId: string;
  purchaseOrderId?: string; // Optional: linked to originating PO
  poLineItemId?: string; // Optional: linked to specific line item
  supplierId?: string; // Optional: linked to supplier
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  
  // Related Data
  images?: ProductImage[];
  variants?: ProductVariant[];
  categories?: ProductDraftCategory[];
  reviewHistory?: ProductReviewHistory[];
}

export interface ProductDimensions {
  length?: number;
  width?: number;
  height?: number;
  unit: 'in' | 'cm' | 'ft' | 'm';
}

export interface ProductImage {
  id: string;
  productDraftId: string;
  
  // Image Data
  url: string; // Supabase Storage URL or external URL
  altText?: string;
  position: number; // Display order
  width?: number;
  height?: number;
  size?: number; // File size in bytes
  mimeType: string;
  
  // Image Source & Processing
  source: 'upload' | 'url' | 'generated' | 'ai_enhanced';
  originalUrl?: string; // Original URL if sourced externally
  base64Data?: string; // Base64 encoded image data (for temporary storage)
  processingStatus: 'pending' | 'processing' | 'ready' | 'error';
  processingNotes?: string;
  
  // AI Enhancement
  aiEnhanced: boolean;
  enhancementType?: string; // background_removal, quality_improvement, etc.
  originalImageId?: string; // Reference to original before AI enhancement
  
  // Shopify Integration
  shopifyImageId?: string;
  shopifyPosition?: number;
  syncStatus: ShopifySyncStatus;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductVariant {
  id: string;
  productDraftId: string;
  
  // Variant Details
  title: string; // Size, Color, etc.
  option1?: string; // Color
  option2?: string; // Size
  option3?: string; // Material
  position: number;
  
  // Pricing & Inventory
  price: number;
  compareAtPrice?: number; // Was/MSRP price
  costPrice?: number; // Wholesale cost
  inventoryQuantity: number;
  inventoryItemId?: string;
  
  // Identifiers
  sku?: string;
  barcode?: string;
  upc?: string;
  
  // Physical Properties
  weight?: number;
  weightUnit: string;
  requiresShipping: boolean;
  taxable: boolean;
  taxCode?: string;
  
  // Fulfillment
  fulfillmentService: string;
  inventoryManagement: string;
  inventoryPolicy: 'deny' | 'continue';
  
  // Image
  imageId?: string; // Reference to ProductImage
  
  // Status
  available: boolean;
  
  // Shopify Integration
  shopifyVariantId?: string;
  shopifyInventoryItemId?: string;
  syncStatus: ShopifySyncStatus;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductCategory {
  id: string;
  merchantId: string;
  
  // Category Details
  name: string;
  description?: string;
  handle: string; // URL-safe identifier
  parentId?: string; // For hierarchical categories
  
  // Display & SEO
  sortOrder: number;
  isVisible: boolean;
  seoTitle?: string;
  seoDescription?: string;
  imageUrl?: string;
  
  // Shopify Integration
  shopifyCollectionId?: string;
  shopifyHandle?: string;
  syncStatus: ShopifySyncStatus;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  
  // Related Data
  parent?: ProductCategory;
  children?: ProductCategory[];
  products?: ProductDraftCategory[];
}

export interface ProductDraftCategory {
  productDraftId: string;
  categoryId: string;
  createdAt: Date;
}

export interface ProductReviewHistory {
  id: string;
  productDraftId: string;
  
  // Review Details
  action: ReviewAction;
  previousStatus?: string;
  newStatus?: string;
  field?: string; // Which field was changed (optional)
  previousValue?: any; // Previous field value
  newValue?: any; // New field value
  
  // User & Context
  userId?: string; // Who made the change
  userEmail?: string;
  source: 'manual' | 'ai' | 'import' | 'sync';
  notes?: string;
  reason?: string;
  
  // Timestamps
  createdAt: Date;
}

// Enums and Union Types
export type ProductDraftStatus = 
  | 'parsed'        // Initial AI parsing complete
  | 'in_review'     // Under manual review
  | 'approved'      // Approved for sync
  | 'rejected'      // Rejected, needs fixes
  | 'synced'        // Successfully synced to Shopify
  | 'sync_error';   // Sync failed

export type ProductWorkflowStage = 
  | 'initial'         // Just parsed
  | 'basic_review'    // Basic info review
  | 'detailed_review' // Detailed product info
  | 'pricing_review'  // Pricing and cost review
  | 'final_review'    // Final approval review
  | 'approved';       // Ready for sync

export type ProductPriority = 
  | 'low'
  | 'medium'
  | 'high'
  | 'urgent';

export type ShopifySyncStatus = 
  | 'pending'
  | 'syncing'
  | 'synced'
  | 'error';

export type ReviewAction = 
  | 'created'
  | 'reviewed'
  | 'approved'
  | 'rejected'
  | 'modified'
  | 'synced'
  | 'price_updated'
  | 'images_added'
  | 'category_assigned';

// API Request/Response Types
export interface CreateProductDraftRequest {
  // Basic required fields
  title: string;
  description?: string;
  vendor?: string;
  
  // Optional fields for AI-extracted data
  priceOriginal?: number;
  costPrice?: number;
  sku?: string;
  barcode?: string;
  weight?: number;
  
  // Metadata
  confidence?: number;
  aiNotes?: string;
  extractedData?: any;
  processingMethod?: string;
  
  // Relationships
  purchaseOrderId?: string;
  poLineItemId?: string;
  supplierId?: string;
  
  // Images
  images?: CreateProductImageRequest[];
  
  // Categories
  categoryIds?: string[];
}

export interface CreateProductImageRequest {
  url?: string;
  base64Data?: string;
  altText?: string;
  position?: number;
  source?: 'upload' | 'url' | 'generated';
}

export interface UpdateProductDraftRequest {
  // Any field that can be updated
  title?: string;
  description?: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  
  priceRefined?: number;
  msrp?: number;
  margin?: number;
  
  sku?: string;
  barcode?: string;
  weight?: number;
  weightUnit?: string;
  dimensions?: ProductDimensions;
  
  // Status updates
  status?: ProductDraftStatus;
  workflowStage?: ProductWorkflowStage;
  priority?: ProductPriority;
  
  // Review fields
  reviewNotes?: string;
  rejectionReason?: string;
  
  // SEO
  seoTitle?: string;
  seoDescription?: string;
  handle?: string;
}

export interface ProductDraftListQuery {
  page?: number;
  limit?: number;
  status?: ProductDraftStatus;
  workflowStage?: ProductWorkflowStage;
  priority?: ProductPriority;
  syncStatus?: ShopifySyncStatus;
  supplierId?: string;
  purchaseOrderId?: string;
  search?: string; // Search in title, description, sku
  sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'confidence' | 'priority';
  sortOrder?: 'asc' | 'desc';
  confidenceMin?: number;
  confidenceMax?: number;
}

export interface ProductDraftListResponse {
  products: ProductDraft[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface BulkUpdateProductDraftsRequest {
  productIds: string[];
  updates: {
    status?: ProductDraftStatus;
    workflowStage?: ProductWorkflowStage;
    priority?: ProductPriority;
    categoryIds?: string[];
  };
  reason?: string;
}

export interface SyncToShopifyRequest {
  productIds: string[];
  options?: {
    publishImmediately?: boolean;
    updateExisting?: boolean;
    syncImages?: boolean;
    createCollections?: boolean;
  };
}

export interface SyncToShopifyResponse {
  success: boolean;
  results: {
    productId: string;
    shopifyProductId?: string;
    status: 'success' | 'error';
    error?: string;
  }[];
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

// Dashboard Analytics Types
export interface ProductDraftAnalytics {
  totalProducts: number;
  byStatus: Record<ProductDraftStatus, number>;
  byStage: Record<ProductWorkflowStage, number>;
  byPriority: Record<ProductPriority, number>;
  bySyncStatus: Record<ShopifySyncStatus, number>;
  
  averageConfidence: number;
  lowConfidenceCount: number; // confidence < 0.7
  
  recentActivity: {
    created: number; // Last 24h
    reviewed: number; // Last 24h
    approved: number; // Last 24h
    synced: number; // Last 24h
  };
  
  topSuppliers: {
    supplierId: string;
    name: string;
    productCount: number;
  }[];
}

export interface ProductDraftWorkflowMetrics {
  averageTimeToReview: number; // seconds
  averageTimeToApproval: number; // seconds
  averageTimeToSync: number; // seconds
  
  reviewerPerformance: {
    userId: string;
    reviewCount: number;
    averageReviewTime: number;
    accuracyRate: number; // % of approved items that sync successfully
  }[];
}

// Utility functions and helpers
export const ProductDraftUtils = {
  generateHandle: (title: string): string => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  },
  
  calculateMargin: (costPrice: number, retailPrice: number): number => {
    if (!costPrice || !retailPrice || costPrice >= retailPrice) return 0;
    return ((retailPrice - costPrice) / retailPrice) * 100;
  },
  
  getStatusColor: (status: ProductDraftStatus): string => {
    const colors = {
      parsed: '#6B7280',     // gray
      in_review: '#F59E0B',  // yellow
      approved: '#10B981',   // green
      rejected: '#EF4444',   // red
      synced: '#3B82F6',     // blue
      sync_error: '#DC2626'  // dark red
    };
    return colors[status] || colors.parsed;
  },
  
  getPriorityWeight: (priority: ProductPriority): number => {
    const weights = { low: 1, medium: 2, high: 3, urgent: 4 };
    return weights[priority] || 2;
  },
  
  isReadyForSync: (product: ProductDraft): boolean => {
    return product.status === 'approved' && 
           product.workflowStage === 'approved' &&
           product.syncStatus === 'pending' &&
           !!product.title &&
           !!product.priceRefined;
  },
  
  getNextWorkflowStage: (currentStage: ProductWorkflowStage): ProductWorkflowStage => {
    const stages: ProductWorkflowStage[] = [
      'initial', 'basic_review', 'detailed_review', 'pricing_review', 'final_review', 'approved'
    ];
    const currentIndex = stages.indexOf(currentStage);
    return stages[currentIndex + 1] || 'approved';
  }
};