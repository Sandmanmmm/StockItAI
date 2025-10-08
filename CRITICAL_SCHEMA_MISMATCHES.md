# CRITICAL Schema Mismatches Found

## Date: October 7, 2025
## Status: BLOCKERS IDENTIFIED

---

## 🔴 CRITICAL ISSUE #1: Wrong Relation Name `lineItem` → `POLineItem`
**Status:** ✅ FIXED (not yet committed)

**Files Fixed:**
- `api/src/routes/productDrafts.js` (4 occurrences)
- `api/src/lib/workflowOrchestrator.js` (2 occurrences)  
- `api/src/services/simpleProductDraftService.js` (3 occurrences)

**Error Message:**
```
Unknown field `lineItem` for include statement on model `ProductDraft`. 
Available options: POLineItem
```

---

## 🔴 CRITICAL ISSUE #2: Wrong Field Name `poLineItemId` → `lineItemId`
**Status:** ✅ FIXED (not yet committed)

**Files Fixed:**
- `api/src/lib/workflowOrchestrator.js` (line 993: changed findUnique to findFirst)
- `api/src/lib/workflowOrchestrator.js` (line 1045: field name in create call)
- `api/src/services/productDraftService.ts` (lines 31-45: accept both names)

**Error Message:**
```
Unknown argument `poLineItemId`. Did you mean `lineItemId`?
```

---

## 🟡 MEDIUM ISSUE #3: Wrong Relation Name `categories` → No equivalent
**Status:** ⚠️ NEEDS INVESTIGATION

**Production Schema:**
```prisma
model ProductDraft {
  ...
  ProductCategory  ProductCategory? @relation(fields: [categoryId], references: [id])
  ...
}
```

**Reality:** There is only a SINGLE `ProductCategory` relation, NOT a `categories` array!

**Files Affected:**
- `api/src/services/productDraftService.ts` (lines 146-150, 326-332)

**Current Code:**
```typescript
categories: {
  include: {
    category: true
  }
}
```

**What This Means:**
- The code expects a many-to-many relationship through a join table
- The actual schema has a simple one-to-one/many-to-one relationship
- Need to replace with: `ProductCategory: true` or `ProductCategory: { select: { name: true } }`

---

## 🟡 MEDIUM ISSUE #4: Wrong Field Names in Search
**Status:** ⚠️ BLOCKER FOR SEARCH FUNCTIONALITY

**File:** `api/src/services/productDraftService.ts` (line 303)

**Current Code:**
```typescript
where.OR = [
  { title: { contains: search, mode: 'insensitive' } },
  { description: { contains: search, mode: 'insensitive' } },
  ...
]
```

**Production Schema Fields:**
- ❌ `title` → ✅ `originalTitle` or `refinedTitle`
- ❌ `description` → ✅ `originalDescription` or `refinedDescription`

**Correct Code Should Be:**
```typescript
where.OR = [
  { originalTitle: { contains: search, mode: 'insensitive' } },
  { refinedTitle: { contains: search, mode: 'insensitive' } },
  { originalDescription: { contains: search, mode: 'insensitive' } },
  { refinedDescription: { contains: search, mode: 'insensitive' } },
  { sku: { contains: search, mode: 'insensitive' } },
  { vendor: { contains: search, mode: 'insensitive' } }
]
```

---

## 📊 Summary of Schema Reality

### ProductDraft Actual Schema:
```prisma
model ProductDraft {
  id                  String                 @id @default(cuid())
  sessionId           String
  merchantId          String
  purchaseOrderId     String
  lineItemId          String                 @unique
  supplierId          String?
  originalTitle       String                 ← NOT title!
  refinedTitle        String?
  originalDescription String?                ← NOT description!
  refinedDescription  String?
  originalPrice       Float                  ← NOT priceOriginal!
  priceRefined        Float?
  status              ProductDraftStatus     @default(DRAFT)  ← UPPERCASE enums!
  
  # Relations
  ProductCategory     ProductCategory?       ← SINGULAR, not categories!
  POLineItem          POLineItem             ← NOT lineItem!
  merchant            Merchant
  purchaseOrder       PurchaseOrder
  Session             Session
  supplier            Supplier?
  images              ProductImage[]
  reviewHistory       ProductReviewHistory[]
  variants            ProductVariant[]
}
```

---

## 🚀 Action Plan

### IMMEDIATE (Deploy Now):
1. ✅ Commit POLineItem fixes (workflowOrchestrator.js, productDrafts.js, simpleProductDraftService.js)
2. ✅ Commit lineItemId fixes (workflowOrchestrator.js, productDraftService.ts)

### HIGH PRIORITY (Next Deploy):
3. Fix `categories` → `ProductCategory` in productDraftService.ts (2 locations)
4. Fix search fields: `title`/`description` → `originalTitle`/`refinedTitle`/`originalDescription`/`refinedDescription`

### MEDIUM PRIORITY (Future Cleanup):
5. Remove @ts-nocheck from productDraftService.ts
6. Update type definitions in api/src/types/productDraft.ts
7. Update all TypeScript interfaces to match production schema

---

## 📝 Testing Checklist

After deploying these fixes, verify:
- [ ] Product drafts can be created without validation errors
- [ ] Product drafts list loads in dashboard
- [ ] Search functionality works
- [ ] Image attachment completes successfully
- [ ] Shopify sync proceeds without errors
- [ ] Workflows complete end-to-end

---

## 🔍 How We Found These

1. **lineItem → POLineItem**: Vercel logs showed `Unknown field 'lineItem'` error
2. **poLineItemId → lineItemId**: Vercel logs showed `Unknown argument 'poLineItemId'`
3. **categories**: Code review after running `npx prisma db pull`
4. **title/description**: Code review of search queries against actual schema

All discovered through: Production error logs + Schema introspection
