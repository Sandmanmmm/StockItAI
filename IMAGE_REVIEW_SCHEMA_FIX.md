# Image Review Tables - Schema Alignment Fix

## Problem Identified

**Database Reality:**
- Tables exist with **PascalCase names**: `ImageReviewSession`, `ImageReviewProduct`, `ImageReviewProductImage`
- These were created by Prisma migrations from the schema.prisma models

**Code Reality:**
- Legacy raw SQL queries use **snake_case table names**: `image_review_items`, `image_review_options`, `image_review_sessions`
- These tables DO NOT EXIST in the database

**Result:**
```
P2010: Raw query failed. Code: `42P01`. 
Message: `relation "image_review_options" does not exist`
```

## Root Cause

The service code (`merchantImageReviewService.js` and `refinementPipelineService.js`) contains a mix of:
1. ✅ **New code** using Prisma models (works correctly)
2. ❌ **Legacy code** using raw SQL with wrong table names (fails)

## Solution Options

### Option 1: Fix Raw SQL Queries (Quick Fix)
Update raw SQL to use quoted PascalCase table names:
```sql
-- WRONG (current)
SELECT * FROM image_review_options

-- CORRECT
SELECT * FROM "ImageReviewProductImage"
```

### Option 2: Refactor to Prisma (Recommended)
Replace all raw SQL with Prisma queries for consistency and type safety.

## Implementation Plan

### Step 1: Audit Raw SQL Usage ✅
Locations found:
- `api/src/lib/merchantImageReviewService.js` - Lines 147-195, 216-287
- `api/src/lib/refinementPipelineService.js` - Line 753-764

### Step 2: Replace with Prisma Queries
The service already has Prisma-based methods like:
- `createImageReviewSession()` - ✅ Uses Prisma
- `getImageReviewSessionByPurchaseOrder()` - ✅ Uses Prisma  
- `getSessionByPurchaseOrder()` - ✅ Uses Prisma

But these methods still use raw SQL:
- `storeImageOptions()` - ❌ Uses raw SQL
- `generateReviewDashboard()` - ❌ Uses raw SQL
- `processMerchantSelections()` - ❌ Uses raw SQL
- `getApprovedImagesForItem()` - ❌ Uses raw SQL (in refinementPipelineService)

### Step 3: Map Legacy Fields to Prisma Models

**Legacy table `image_review_items` → Prisma `ImageReviewProduct`:**
- `session_id` → `sessionId`
- `line_item_id` → N/A (not in current schema)
- `product_name` → `productName`
- `sku` → `productSku`
- `status` → `status`

**Legacy table `image_review_options` → Prisma `ImageReviewProductImage`:**
- `review_item_id` → `productReviewId`
- `image_url` → `imageUrl`
- `image_category` → `imageType` or custom `metadata`
- `source_info` → `metadata`
- `is_selected` → `isSelected`
- `is_recommended` → custom `metadata`

## Immediate Fix: Disable Legacy Methods

Since the Prisma-based methods already exist and work, we should:
1. ✅ Use the working Prisma methods (`createImageReviewSession`, etc.)
2. ❌ Comment out or remove the legacy raw SQL methods
3. 🔧 Update callers to use the Prisma-based methods

## Verification

Run this to confirm table names:
```bash
node api/check-table-names.js
```

Expected output:
```
✅ EXISTS - "ImageReviewSession"
✅ EXISTS - "ImageReviewProduct"
✅ EXISTS - "ImageReviewProductImage"
❌ NOT FOUND - "image_review_items"
❌ NOT FOUND - "image_review_options"
```

## Next Steps

1. Fix the const reassignment bug in `workflowOrchestrator.js` ✅ DONE
2. Refactor `getApprovedImagesForItem()` to use Prisma
3. Update callers to use Prisma-based image review methods
4. Remove legacy raw SQL methods after migration complete
