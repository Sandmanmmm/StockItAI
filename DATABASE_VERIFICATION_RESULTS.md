# Database Schema Verification Results

**Date:** 2025-10-09  
**Database:** Supabase PostgreSQL  
**Verification Tool:** `api/check-table-names.js`

## Actual Table Names in Database

### ✅ Tables That EXIST (PascalCase from Prisma)

```
ImageReviewSession          - Main review session container
ImageReviewProduct          - Products being reviewed  
ImageReviewProductImage     - Individual image options per product
```

These tables were created by Prisma migrations and use PascalCase naming.

### ❌ Tables That DO NOT EXIST (Legacy snake_case)

```
image_review_session        - NOT FOUND
image_review_product        - NOT FOUND
image_review_product_image  - NOT FOUND
image_review_items          - NOT FOUND (legacy name)
image_review_options        - NOT FOUND (legacy name)
```

These table names were referenced in raw SQL queries but never existed in production.

## PostgreSQL Case Sensitivity

Important findings:

```sql
-- ✅ WORKS - Quoted PascalCase
SELECT * FROM "ImageReviewSession"

-- ❌ FAILS - Unquoted gets lowercased to "imagereviewsession"
SELECT * FROM ImageReviewSession
Error: relation "imagereviewsession" does not exist

-- ❌ FAILS - snake_case doesn't exist
SELECT * FROM image_review_session
Error: relation "image_review_session" does not exist
```

## Prisma Schema Mapping

From `api/prisma/schema.prisma`:

```prisma
model ImageReviewSession {
  id               String               @id @default(cuid())
  sessionId        String               @unique
  purchaseOrderId  String
  merchantId       String
  status           ImageReviewStatus    @default(PENDING)
  // ... creates table "ImageReviewSession"
}

model ImageReviewProduct {
  id                  String                    @id @default(cuid())
  sessionId           String
  productName         String
  // ... creates table "ImageReviewProduct"
}

model ImageReviewProductImage {
  id              String             @id @default(cuid())
  productReviewId String
  imageUrl        String
  imageType       ImageType
  // ... creates table "ImageReviewProductImage"
}
```

**Note:** No `@@map()` directives, so Prisma uses model names directly as table names.

## Field Mapping (Legacy → Current)

### Legacy `image_review_items` → Current `ImageReviewProduct`

| Legacy Field | Current Field | Type |
|--------------|---------------|------|
| session_id | sessionId | String |
| line_item_id | ❌ Not in schema | - |
| product_name | productName | String |
| sku | productSku | String? |
| status | status | Enum |
| recommended_source | ❌ Not in schema | - |

### Legacy `image_review_options` → Current `ImageReviewProductImage`

| Legacy Field | Current Field | Type |
|--------------|---------------|------|
| review_item_id | productReviewId | String |
| image_url | imageUrl | String |
| image_category | imageType | ImageType enum |
| source_info | metadata | Json |
| position | ❌ Not in schema | - |
| is_recommended | ❌ Not in schema | - |
| is_selected | isSelected | Boolean |
| is_approved | isApproved | Boolean |
| selection_order | ❌ Not in schema | - |

## Query Test Results

```bash
$ node api/check-table-names.js

✅ Query with "ImageReviewSession" (quoted PascalCase): 36 rows
❌ Unquoted query failed: relation "imagereviewsession" does not exist
❌ snake_case failed: relation "image_review_session" does not exist
```

## Code Impact

### Files Using Wrong Table Names (Fixed)

1. **api/src/lib/refinementPipelineService.js**
   - Line 753: Used `image_review_options` in raw SQL
   - **Fix:** Replaced with Prisma query using `ImageReviewProductImage`

2. **api/src/lib/merchantImageReviewService.js**
   - Lines 147-195: `storeImageOptions()` uses legacy tables
   - Lines 216-287: `generateReviewDashboard()` uses legacy tables
   - Lines 300-350: `processMerchantSelections()` uses legacy tables
   - **Status:** ⚠️ NOT FIXED - but has working Prisma alternatives

### Files Using Correct Prisma Models (Working)

1. **api/src/lib/merchantImageReviewService.js**
   - `createImageReviewSession()` - ✅ Uses Prisma
   - `getImageReviewSessionByPurchaseOrder()` - ✅ Uses Prisma
   - `getSessionByPurchaseOrder()` - ✅ Uses Prisma

## Recommendations

### Immediate (Done)
- ✅ Fix `getApprovedImagesForItem()` to use Prisma
- ✅ Document the table naming issue

### Short Term
- Migrate remaining raw SQL methods in `merchantImageReviewService.js`
- Remove unused legacy methods
- Add schema validation tests

### Long Term
- Complete Prisma migration across entire codebase
- Remove all raw SQL in favor of type-safe Prisma
- Consider adding `@@map()` directives if snake_case preferred

## Connection String Verification

```
DATABASE_URL      → Port 6543 (Pooler) ✅
DIRECT_URL        → Port 5432 (Direct) ✅
```

Both connections can access the PascalCase tables correctly when properly quoted or using Prisma.

---

**Conclusion:** The database schema is correct. The issue was code using incorrect table names from an older design that was never deployed to production.
