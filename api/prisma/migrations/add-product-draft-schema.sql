-- Migration: Add Product Draft Schema for Refinement Workflow
-- This creates the data model for handling parsed products that need refinement before Shopify sync

-- Product Draft table - Core refined product data
CREATE TABLE "ProductDraft" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  
  -- Basic Product Information
  "title" TEXT NOT NULL,
  "description" TEXT,
  "vendor" TEXT,
  "productType" TEXT,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Pricing Information
  "priceOriginal" DECIMAL(10,2),
  "priceRefined" DECIMAL(10,2),
  "currencyOriginal" TEXT DEFAULT 'USD',
  "currencyTarget" TEXT DEFAULT 'USD',
  "costPrice" DECIMAL(10,2), -- Wholesale/cost price from PO
  "msrp" DECIMAL(10,2), -- Manufacturer suggested retail price
  "margin" DECIMAL(5,2), -- Profit margin percentage
  
  -- Product Identifiers
  "sku" TEXT,
  "barcode" TEXT,
  "upc" TEXT,
  "isbn" TEXT,
  "mpn" TEXT, -- Manufacturer Part Number
  
  -- Physical Properties
  "weight" DECIMAL(8,2),
  "weightUnit" TEXT DEFAULT 'lb',
  "dimensions" JSONB, -- {length, width, height, unit}
  
  -- Inventory Management
  "trackQuantity" BOOLEAN DEFAULT true,
  "inventoryPolicy" TEXT DEFAULT 'deny', -- deny, continue
  "fulfillmentService" TEXT DEFAULT 'manual',
  "requiresShipping" BOOLEAN DEFAULT true,
  "taxable" BOOLEAN DEFAULT true,
  "taxCode" TEXT,
  
  -- SEO & Marketing
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "handle" TEXT, -- URL handle (auto-generated from title)
  
  -- Status & Workflow
  "status" TEXT NOT NULL DEFAULT 'parsed', -- parsed, in_review, approved, rejected, synced, sync_error
  "workflowStage" TEXT DEFAULT 'initial', -- initial, basic_review, detailed_review, pricing_review, final_review, approved
  "priority" TEXT DEFAULT 'medium', -- low, medium, high, urgent
  
  -- AI Processing Metadata
  "confidence" DECIMAL(3,2) DEFAULT 0.00, -- Overall AI confidence score (0.00-1.00)
  "confidenceBreakdown" JSONB, -- Confidence scores per field
  "aiNotes" TEXT, -- AI processing notes and suggestions
  "extractedData" JSONB, -- Original extracted data from AI
  "processingMethod" TEXT, -- AI method used for extraction
  
  -- Review & Approval
  "reviewedBy" TEXT, -- User ID who reviewed
  "reviewedAt" TIMESTAMP,
  "reviewNotes" TEXT,
  "approvedBy" TEXT, -- User ID who approved
  "approvedAt" TIMESTAMP,
  "rejectionReason" TEXT,
  
  -- Shopify Integration
  "shopifyProductId" TEXT,
  "shopifyHandle" TEXT,
  "syncStatus" TEXT DEFAULT 'pending', -- pending, syncing, synced, error
  "syncAttempts" INTEGER DEFAULT 0,
  "lastSyncAt" TIMESTAMP,
  "syncError" TEXT,
  "shopifyUrl" TEXT,
  
  -- Data Relationships
  "merchantId" TEXT NOT NULL,
  "purchaseOrderId" TEXT, -- Optional: linked to originating PO
  "poLineItemId" TEXT, -- Optional: linked to specific line item
  "supplierId" TEXT, -- Optional: linked to supplier
  
  -- Timestamps
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT "ProductDraft_pkey" PRIMARY KEY ("id")
);

-- Product Images table - Handles multiple images per product
CREATE TABLE "ProductImage" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "productDraftId" TEXT NOT NULL,
  
  -- Image Data
  "url" TEXT NOT NULL, -- Supabase Storage URL or external URL
  "altText" TEXT,
  "position" INTEGER DEFAULT 0, -- Display order
  "width" INTEGER,
  "height" INTEGER,
  "size" INTEGER, -- File size in bytes
  "mimeType" TEXT DEFAULT 'image/jpeg',
  
  -- Image Source & Processing
  "source" TEXT DEFAULT 'upload', -- upload, url, generated, ai_enhanced
  "originalUrl" TEXT, -- Original URL if sourced externally
  "base64Data" TEXT, -- Base64 encoded image data (for temporary storage)
  "processingStatus" TEXT DEFAULT 'pending', -- pending, processing, ready, error
  "processingNotes" TEXT,
  
  -- AI Enhancement
  "aiEnhanced" BOOLEAN DEFAULT false,
  "enhancementType" TEXT, -- background_removal, quality_improvement, etc.
  "originalImageId" TEXT, -- Reference to original before AI enhancement
  
  -- Shopify Integration
  "shopifyImageId" TEXT,
  "shopifyPosition" INTEGER,
  "syncStatus" TEXT DEFAULT 'pending',
  
  -- Timestamps
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductImage_productDraftId_fkey" FOREIGN KEY ("productDraftId") REFERENCES "ProductDraft"("id") ON DELETE CASCADE
);

-- Product Variants table - Handles product options and variants
CREATE TABLE "ProductVariant" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "productDraftId" TEXT NOT NULL,
  
  -- Variant Details
  "title" TEXT NOT NULL, -- Size, Color, etc.
  "option1" TEXT, -- Color
  "option2" TEXT, -- Size
  "option3" TEXT, -- Material
  "position" INTEGER DEFAULT 1,
  
  -- Pricing & Inventory
  "price" DECIMAL(10,2) NOT NULL,
  "compareAtPrice" DECIMAL(10,2), -- Was/MSRP price
  "costPrice" DECIMAL(10,2), -- Wholesale cost
  "inventoryQuantity" INTEGER DEFAULT 0,
  "inventoryItemId" TEXT,
  
  -- Identifiers
  "sku" TEXT,
  "barcode" TEXT,
  "upc" TEXT,
  
  -- Physical Properties
  "weight" DECIMAL(8,2),
  "weightUnit" TEXT DEFAULT 'lb',
  "requiresShipping" BOOLEAN DEFAULT true,
  "taxable" BOOLEAN DEFAULT true,
  "taxCode" TEXT,
  
  -- Fulfillment
  "fulfillmentService" TEXT DEFAULT 'manual',
  "inventoryManagement" TEXT DEFAULT 'shopify',
  "inventoryPolicy" TEXT DEFAULT 'deny',
  
  -- Image
  "imageId" TEXT, -- Reference to ProductImage
  
  -- Status
  "available" BOOLEAN DEFAULT true,
  
  -- Shopify Integration
  "shopifyVariantId" TEXT,
  "shopifyInventoryItemId" TEXT,
  "syncStatus" TEXT DEFAULT 'pending',
  
  -- Timestamps
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductVariant_productDraftId_fkey" FOREIGN KEY ("productDraftId") REFERENCES "ProductDraft"("id") ON DELETE CASCADE
);

-- Product Categories table - Flexible category/collection system
CREATE TABLE "ProductCategory" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "merchantId" TEXT NOT NULL,
  
  -- Category Details
  "name" TEXT NOT NULL,
  "description" TEXT,
  "handle" TEXT NOT NULL, -- URL-safe identifier
  "parentId" TEXT, -- For hierarchical categories
  
  -- Display & SEO
  "sortOrder" INTEGER DEFAULT 0,
  "isVisible" BOOLEAN DEFAULT true,
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "imageUrl" TEXT,
  
  -- Shopify Integration
  "shopifyCollectionId" TEXT,
  "shopifyHandle" TEXT,
  "syncStatus" TEXT DEFAULT 'pending',
  
  -- Timestamps
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProductCategory"("id"),
  CONSTRAINT "ProductCategory_merchantId_name_key" UNIQUE ("merchantId", "name")
);

-- Product-Category Junction table (many-to-many)
CREATE TABLE "ProductDraftCategory" (
  "productDraftId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT "ProductDraftCategory_pkey" PRIMARY KEY ("productDraftId", "categoryId"),
  CONSTRAINT "ProductDraftCategory_productDraftId_fkey" FOREIGN KEY ("productDraftId") REFERENCES "ProductDraft"("id") ON DELETE CASCADE,
  CONSTRAINT "ProductDraftCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE CASCADE
);

-- Product Review History - Audit trail for reviews and changes
CREATE TABLE "ProductReviewHistory" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "productDraftId" TEXT NOT NULL,
  
  -- Review Details
  "action" TEXT NOT NULL, -- created, reviewed, approved, rejected, modified, synced
  "previousStatus" TEXT,
  "newStatus" TEXT,
  "field" TEXT, -- Which field was changed (optional)
  "previousValue" JSONB, -- Previous field value
  "newValue" JSONB, -- New field value
  
  -- User & Context
  "userId" TEXT, -- Who made the change
  "userEmail" TEXT,
  "source" TEXT DEFAULT 'manual', -- manual, ai, import, sync
  "notes" TEXT,
  "reason" TEXT,
  
  -- Timestamps
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT "ProductReviewHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductReviewHistory_productDraftId_fkey" FOREIGN KEY ("productDraftId") REFERENCES "ProductDraft"("id") ON DELETE CASCADE
);

-- Add Foreign Key Constraints to main tables
ALTER TABLE "ProductDraft" 
  ADD CONSTRAINT "ProductDraft_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "ProductDraft_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "ProductDraft_poLineItemId_fkey" FOREIGN KEY ("poLineItemId") REFERENCES "POLineItem"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "ProductDraft_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL;

-- Create Indexes for Performance
CREATE INDEX "ProductDraft_merchantId_idx" ON "ProductDraft"("merchantId");
CREATE INDEX "ProductDraft_status_idx" ON "ProductDraft"("status");
CREATE INDEX "ProductDraft_workflowStage_idx" ON "ProductDraft"("workflowStage");
CREATE INDEX "ProductDraft_syncStatus_idx" ON "ProductDraft"("syncStatus");
CREATE INDEX "ProductDraft_priority_idx" ON "ProductDraft"("priority");
CREATE INDEX "ProductDraft_sku_idx" ON "ProductDraft"("sku");
CREATE INDEX "ProductDraft_barcode_idx" ON "ProductDraft"("barcode");
CREATE INDEX "ProductDraft_handle_idx" ON "ProductDraft"("handle");
CREATE INDEX "ProductDraft_createdAt_idx" ON "ProductDraft"("createdAt");
CREATE INDEX "ProductDraft_confidence_idx" ON "ProductDraft"("confidence");
CREATE INDEX "ProductDraft_purchaseOrderId_idx" ON "ProductDraft"("purchaseOrderId");

CREATE INDEX "ProductImage_productDraftId_idx" ON "ProductImage"("productDraftId");
CREATE INDEX "ProductImage_position_idx" ON "ProductImage"("position");
CREATE INDEX "ProductImage_processingStatus_idx" ON "ProductImage"("processingStatus");

CREATE INDEX "ProductVariant_productDraftId_idx" ON "ProductVariant"("productDraftId");
CREATE INDEX "ProductVariant_sku_idx" ON "ProductVariant"("sku");
CREATE INDEX "ProductVariant_barcode_idx" ON "ProductVariant"("barcode");

CREATE INDEX "ProductCategory_merchantId_idx" ON "ProductCategory"("merchantId");
CREATE INDEX "ProductCategory_handle_idx" ON "ProductCategory"("handle");
CREATE INDEX "ProductCategory_parentId_idx" ON "ProductCategory"("parentId");

CREATE INDEX "ProductReviewHistory_productDraftId_idx" ON "ProductReviewHistory"("productDraftId");
CREATE INDEX "ProductReviewHistory_action_idx" ON "ProductReviewHistory"("action");
CREATE INDEX "ProductReviewHistory_createdAt_idx" ON "ProductReviewHistory"("createdAt");

-- Create unique constraints
CREATE UNIQUE INDEX "ProductDraft_merchantId_sku_key" ON "ProductDraft"("merchantId", "sku") WHERE "sku" IS NOT NULL;
CREATE UNIQUE INDEX "ProductDraft_merchantId_handle_key" ON "ProductDraft"("merchantId", "handle") WHERE "handle" IS NOT NULL;
CREATE UNIQUE INDEX "ProductCategory_merchantId_handle_key" ON "ProductCategory"("merchantId", "handle");