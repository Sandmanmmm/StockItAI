# Non-Deterministic AI Parsing - Root Cause Analysis & Fixes

**Investigation Date:** October 10, 2025  
**Priority:** MEDIUM (Quality Issue - Not Blocking but Important for Production)

---

## 🔍 Problem Summary

The same purchase order image is producing **different extraction results** when parsed multiple times:

### Parse Result #1 (Workflow wucvlq564) ✅
```json
{
  "description": "Sugar",
  "quantity": 1,           // ✅ Correct: number
  "unitPrice": 10.99,      // ✅ Correct: number
  "total": 10.99           // ✅ Correct: number
}
```

### Parse Result #2 (Workflow xywnjmrcc) ❌
```json
{
  "description": "Sugar",
  "quantity": null,        // ❌ MISSING
  "unitPrice": "10.99",    // ❌ Wrong type: string instead of number
  "total": null            // ❌ MISSING
}
```

**Impact:**
- Inconsistent data quality for merchants
- Downstream errors when null values are processed
- Poor user experience (same PO shows different data on retry)
- Wasted compute resources parsing same document multiple times

---

## 🔬 Root Causes Identified

### 1. Temperature Setting Not Optimal for Determinism
**Location:** `api/src/lib/enhancedAIService.js`

**Current Settings:**
- Primary vision API call: `temperature: 0.1` (line 197)
- Retry/reprocess call: `temperature: 0.3` (line 583)
- Text processing call: `temperature: 0.1` (line 237, 638, 746)

**Problem:**
OpenAI's temperature parameter controls randomness:
- `temperature: 0` = Most deterministic (same input → same output)
- `temperature: 0.1` = Slightly random (good for creativity)
- `temperature: 0.3` = More random (explicitly used for "different perspective")

For **data extraction** tasks, we want **perfect determinism** (temperature: 0), not creativity.

**Source Code:**
```javascript
// Line 180-197: Vision API call
const apiCallPromise = openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: this.defaultPrompt },
        {
          type: "image_url",
          image_url: {
            url: `data:${fileType.mimeType};base64,${fileContent.toString('base64')}`,
            detail: "high"
          }
        }
      ]
    }
  ],
  max_tokens: 16000,
  temperature: 0.1  // ❌ Should be 0 for deterministic extraction
})
```

---

### 2. Vague Prompt Without Explicit Schema

**Current Prompt (lines 16-61):**
```javascript
this.defaultPrompt = `
Analyze this purchase order document and extract the following information with high accuracy.
Provide a confidence score (0-1) for each extracted field and an overall confidence score.

Extract:
- PO Number
- Supplier/Vendor Information (name, address, contact)
- Line Items (product codes, descriptions, quantities, unit prices, totals)  // ❌ Too vague
- Dates (order date, expected delivery date)
- Total amounts
- Special instructions or notes

Return the data in this JSON format:
{
  "confidence": 0.95,
  "extractedData": {
    "poNumber": "...",
    "supplier": {...},
    "lineItems": [...],  // ❌ No example structure provided
    "dates": {...},
    "totals": {...},
    "notes": "..."
  },
  ...
}

Be very conservative with confidence scores. Only give high confidence (>0.9) when you're absolutely certain.
`
```

**Problems:**
1. ❌ Mentions "quantities, unit prices, totals" but doesn't specify they're REQUIRED
2. ❌ No example of lineItems array structure
3. ❌ Doesn't specify data types (number vs string)
4. ❌ Doesn't say what to do if quantity/price is unclear (return null or 0 or retry?)
5. ❌ No instruction to preserve numeric types

---

### 3. Weak Validation Allows Incomplete Data

**Location:** `api/src/lib/enhancedAIService.js:497-502`

**Current Validation:**
```javascript
case 'lineItems':
  if (!Array.isArray(fieldValue) || fieldValue.length === 0) return 0
  const validItems = fieldValue.filter(item => 
    item.description && (item.quantity || item.price)  // ❌ Allows EITHER quantity OR price
  )
  return validItems.length / fieldValue.length
```

**Problem:**
- Current logic: Item is "valid" if it has description AND (quantity OR price)
- This means: `{description: "Sugar", quantity: null, price: 10.99}` is considered valid ✅
- But: `{description: "Sugar", quantity: 1, price: null}` is also valid ✅
- **Both are incomplete!** For a line item, we need BOTH quantity AND price to calculate totals

**Missing:**
- No validation that rejects parses where critical fields are null
- No retry mechanism for incomplete extractions
- No logging of validation failures

---

### 4. No Retry Logic for Incomplete Parses

**Current Flow:**
```
1. Parse document with AI
2. Validate fields (weak validation)
3. If confidence < threshold → send to manual review
4. If confidence >= threshold → proceed with incomplete data ❌
```

**Missing:**
```
4b. If lineItems have missing quantity/price → retry parse
4c. If retry still incomplete → flag for manual review
```

---

## ✅ Proposed Fixes

### Fix #1: Set Temperature to 0 for Deterministic Extraction

**File:** `api/src/lib/enhancedAIService.js`

**Changes:**
```javascript
// Line 197: Vision API primary call
temperature: 0  // Changed from 0.1

// Line 237: CSV/text processing
temperature: 0  // Changed from 0.1

// Line 583: Retry/reprocess call
temperature: 0  // Changed from 0.3 (no need for "different perspective" - we want accuracy)

// Line 638: Text processing
temperature: 0  // Changed from 0.1

// Line 746: Additional text processing
temperature: 0  // Changed from 0.1
```

**Expected Impact:**
- Same image will always produce same extraction result
- Eliminates random variations in field detection
- More predictable behavior for merchants

---

### Fix #2: Enhance Prompt with Explicit Schema and Examples

**File:** `api/src/lib/enhancedAIService.js`

**Enhanced Prompt:**
```javascript
this.defaultPrompt = `
You are a specialized purchase order data extraction system. Your task is to extract structured data from purchase order documents with perfect accuracy.

CRITICAL REQUIREMENTS:
- ALL numeric fields must be returned as numbers (not strings)
- If a value is unclear or missing, return null (not empty string)
- For line items, quantity and unitPrice are REQUIRED - if either is missing, set confidence to LOW
- Preserve decimal precision for prices (e.g., 10.99 not 11)

Extract the following information:
- PO Number (string)
- Supplier/Vendor Information (name, address, contact details)
- Line Items with REQUIRED fields:
  * description (string, required)
  * quantity (number, required - if missing or unclear, return null and lower confidence)
  * unitPrice (number, required - if missing or unclear, return null and lower confidence)
  * total (number, required - if missing, calculate from quantity * unitPrice)
  * sku/productCode (string, optional)
- Dates (order date, expected delivery date)
- Total amounts
- Special instructions or notes

Return data in this EXACT JSON structure:
{
  "confidence": 0.95,
  "extractedData": {
    "poNumber": "PO-12345",
    "supplier": {
      "name": "ABC Suppliers Inc",
      "address": "123 Main St",
      "phone": "555-1234",
      "email": "orders@abc.com"
    },
    "lineItems": [
      {
        "description": "Sugar - White Granulated",
        "quantity": 5,                    // MUST BE NUMBER, not string
        "unitPrice": 10.99,               // MUST BE NUMBER, not string
        "total": 54.95,                   // MUST BE NUMBER (quantity * unitPrice)
        "sku": "SUGAR-001"
      }
    ],
    "dates": {
      "orderDate": "2025-10-10",
      "expectedDelivery": "2025-10-17"
    },
    "totals": {
      "subtotal": 54.95,
      "tax": 5.50,
      "total": 60.45
    },
    "notes": "Special delivery instructions..."
  },
  "fieldConfidences": {
    "poNumber": 0.98,
    "supplier": 0.95,
    "lineItems": 0.90
  },
  "qualityIndicators": {
    "imageClarity": "high",
    "textLegibility": "high",
    "documentCompleteness": "complete"
  },
  "issues": [],
  "suggestions": []
}

DATA TYPE RULES (CRITICAL):
- quantity: MUST be a number (e.g., 5) not a string (e.g., "5")
- unitPrice: MUST be a number (e.g., 10.99) not a string (e.g., "10.99")
- total: MUST be a number, calculated as quantity * unitPrice
- If you cannot determine a quantity or price with confidence, return null and reduce confidence score

CONFIDENCE SCORING:
- High confidence (>0.9): All line items have quantity AND unitPrice
- Medium confidence (0.7-0.9): Most line items complete, some missing fields
- Low confidence (<0.7): Many line items missing quantity or unitPrice

Be very conservative with confidence scores. Only give high confidence (>0.9) when ALL required fields are present and clear.
`
```

**Expected Impact:**
- AI understands REQUIRED vs OPTIONAL fields
- Clear examples prevent type confusion (number vs string)
- Explicit instructions on handling missing data
- Better confidence scoring based on completeness

---

### Fix #3: Add Strict Validation for Line Items

**File:** `api/src/lib/enhancedAIService.js`

**Add New Validation Method (after line 540):**
```javascript
/**
 * Validate that line items have all critical fields
 * Returns { isValid: boolean, missingFields: array, invalidItems: array }
 */
validateLineItems(lineItems) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return {
      isValid: false,
      missingFields: ['lineItems'],
      invalidItems: [],
      message: 'No line items found'
    }
  }

  const invalidItems = []
  
  lineItems.forEach((item, index) => {
    const issues = []
    
    // Check required fields
    if (!item.description || typeof item.description !== 'string' || item.description.trim() === '') {
      issues.push('missing or invalid description')
    }
    
    // Quantity must be present and numeric (null is acceptable but flagged)
    if (item.quantity === null || item.quantity === undefined) {
      issues.push('missing quantity')
    } else if (typeof item.quantity !== 'number') {
      issues.push('quantity is not a number')
    }
    
    // UnitPrice must be present and numeric (null is acceptable but flagged)
    if (item.unitPrice === null || item.unitPrice === undefined) {
      issues.push('missing unitPrice')
    } else if (typeof item.unitPrice !== 'number') {
      issues.push('unitPrice is not a number')
    }
    
    // Total should be present
    if (item.total === null || item.total === undefined) {
      issues.push('missing total')
    } else if (typeof item.total !== 'number') {
      issues.push('total is not a number')
    }
    
    if (issues.length > 0) {
      invalidItems.push({
        index: index + 1,
        item: item,
        issues: issues
      })
    }
  })
  
  const validItemCount = lineItems.length - invalidItems.length
  const completenessRatio = validItemCount / lineItems.length
  
  return {
    isValid: invalidItems.length === 0,
    completenessRatio: completenessRatio,
    totalItems: lineItems.length,
    validItems: validItemCount,
    invalidItems: invalidItems,
    message: invalidItems.length > 0 
      ? `${invalidItems.length} of ${lineItems.length} line items have issues`
      : 'All line items valid'
  }
}
```

**Integrate Validation (update enhanceAIResult method around line 380):**
```javascript
async enhanceAIResult(result, workflowId) {
  const enhanced = {
    ...result,
    metadata: {
      workflowId,
      processedAt: new Date().toISOString(),
      aiModel: 'gpt-4o'
    }
  }

  // ... existing code ...

  // NEW: Add strict line item validation
  const lineItemValidation = this.validateLineItems(result.extractedData?.lineItems)
  enhanced.lineItemValidation = lineItemValidation
  
  // Log validation results
  if (!lineItemValidation.isValid) {
    console.warn(`⚠️ Line item validation failed for workflow ${workflowId}:`)
    console.warn(`   Total items: ${lineItemValidation.totalItems}`)
    console.warn(`   Valid items: ${lineItemValidation.validItems}`)
    console.warn(`   Invalid items: ${lineItemValidation.invalidItems.length}`)
    lineItemValidation.invalidItems.forEach(invalid => {
      console.warn(`   Item ${invalid.index}: ${invalid.issues.join(', ')}`)
    })
  }
  
  // Reduce confidence if line items are incomplete
  if (lineItemValidation.completenessRatio < 1.0) {
    console.log(`📊 Reducing confidence due to incomplete line items (${(lineItemValidation.completenessRatio * 100).toFixed(1)}% complete)`)
    confidenceValue *= lineItemValidation.completenessRatio
  }

  // ... rest of existing code ...
}
```

**Expected Impact:**
- Parses with missing quantity/price will be flagged
- Confidence scores will be automatically reduced
- Better visibility into data quality issues
- Type mismatches (string vs number) detected

---

### Fix #4: Add Retry Logic for Incomplete Parses

**File:** `api/src/lib/enhancedAIService.js`

**Update parseDocument method (around line 315):**
```javascript
// Handle confidence and determine next steps
const handlingResult = await errorHandlingService.handleAIParsingResult(
  workflowId, 
  enhancedResult,
  options.confidenceThreshold || CONFIDENCE_THRESHOLDS.MANUAL_REVIEW
)

// NEW: If line items are incomplete and we haven't retried yet, try once more
if (!options.isRetry && 
    enhancedResult.lineItemValidation && 
    !enhancedResult.lineItemValidation.isValid &&
    enhancedResult.lineItemValidation.completenessRatio < 0.8) {
  
  console.log(`🔄 Line items incomplete (${(enhancedResult.lineItemValidation.completenessRatio * 100).toFixed(1)}% valid), retrying parse...`)
  
  // Retry with enhanced prompt focusing on the issues
  const retryOptions = {
    ...options,
    isRetry: true,
    previousValidation: enhancedResult.lineItemValidation
  }
  
  // Add delay to avoid rate limiting
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  return await this.parseDocument(fileContent, workflowId, retryOptions)
}

return {
  ...enhancedResult,
  handlingResult
}
```

**Expected Impact:**
- Incomplete parses automatically retried once
- Second attempt uses same settings (temperature: 0) for consistency
- Prevents accepting low-quality extractions
- Still caps at 2 attempts to avoid infinite loops

---

## 📊 Expected Results After Fixes

### Before Fixes
```
Parse #1: {quantity: 1, unitPrice: 10.99, total: 10.99}      ← Good
Parse #2: {quantity: null, unitPrice: "10.99", total: null}  ← Bad
Parse #3: {quantity: 1, unitPrice: 10.99, total: 10.99}      ← Good
Parse #4: {quantity: null, unitPrice: "10.99", total: null}  ← Bad
```
**Result:** 50% consistency ❌

### After Fixes
```
Parse #1: {quantity: 1, unitPrice: 10.99, total: 10.99}      ← Good
Parse #2: {quantity: 1, unitPrice: 10.99, total: 10.99}      ← Good
Parse #3: {quantity: 1, unitPrice: 10.99, total: 10.99}      ← Good
Parse #4: {quantity: 1, unitPrice: 10.99, total: 10.99}      ← Good
```
**Result:** 100% consistency ✅

---

## 🧪 Testing Plan

### Test 1: Same Image, Multiple Parses
```bash
# Upload same PO image 5 times
# Expected: Identical extraction results every time

# Before fix: 
Parse 1: quantity=1, Parse 2: quantity=null, Parse 3: quantity=1
Result: INCONSISTENT ❌

# After fix:
Parse 1: quantity=1, Parse 2: quantity=1, Parse 3: quantity=1
Result: CONSISTENT ✅
```

### Test 2: Data Type Consistency
```sql
-- Check for string values in numeric fields (should be 0 after fix)
SELECT 
  id,
  workflow_id,
  extracted_data->'lineItems'->0->>'unitPrice' as unit_price,
  pg_typeof(extracted_data->'lineItems'->0->'unitPrice') as price_type
FROM workflow_results
WHERE workflow_stage = 'ai_parsing'
  AND created_at > NOW() - INTERVAL '1 hour'
  AND extracted_data->'lineItems'->0->'unitPrice' IS NOT NULL;

-- Expected: All unitPrice values should be numeric, not text
```

### Test 3: Validation Logging
```bash
# Expected logs after fix:
⚠️ Line item validation failed for workflow xyz123:
   Total items: 3
   Valid items: 1
   Invalid items: 2
   Item 2: missing quantity, unitPrice is not a number
   Item 3: missing total
📊 Reducing confidence due to incomplete line items (33.3% complete)
🔄 Line items incomplete (33.3% valid), retrying parse...
```

### Test 4: Retry Mechanism
```bash
# Expected flow:
1. First parse: 2/5 items have missing quantity
2. Auto-retry triggered
3. Second parse: 5/5 items complete
4. Confidence increased, validation passed ✅
```

---

## 📝 Deployment Checklist

- [ ] **Code Changes:** Update all 5 temperature settings in enhancedAIService.js
- [ ] **Prompt Update:** Replace defaultPrompt with enhanced version
- [ ] **Add Validation:** Implement validateLineItems() method
- [ ] **Add Retry Logic:** Implement parseDocument retry mechanism
- [ ] **Test Locally:** Upload same PO 5 times, verify identical results
- [ ] **Deploy to Staging:** Test with real merchant POs
- [ ] **Monitor Logs:** Check for validation warnings and retry triggers
- [ ] **Verify Database:** Run SQL query to check data type consistency
- [ ] **Deploy to Production:** If staging tests pass for 24 hours

---

## 🔄 Rollback Plan

If fixes cause issues:

1. **Revert temperature to 0.1:**
   ```javascript
   temperature: 0.1  // Restore original value
   ```

2. **Revert prompt to original version**

3. **Remove validation and retry logic**

4. **Monitor for 30 minutes:**
   - Check AI parsing success rate
   - Verify no increase in failures
   - Confirm rollback successful

---

## 📈 Success Metrics

**Target Metrics (30 days post-deployment):**
- ✅ Parsing consistency: >95% (same image → same result)
- ✅ Line item completeness: >90% (quantity AND unitPrice present)
- ✅ Data type accuracy: >99% (numeric fields are numbers, not strings)
- ✅ Retry success rate: >60% (retries produce complete data)
- ✅ Manual review reduction: 20% fewer parses sent to manual review

**Monitor:**
```sql
-- Check parsing consistency (same file_url, different results)
SELECT 
  file_url,
  COUNT(DISTINCT extracted_data) as unique_results,
  COUNT(*) as total_parses
FROM workflow_results
WHERE workflow_stage = 'ai_parsing'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY file_url
HAVING COUNT(*) > 1 AND COUNT(DISTINCT extracted_data) > 1;

-- Expected: 0 rows (perfect consistency)
```

---

## 🎯 Priority Assessment

**Priority:** MEDIUM-HIGH

**Justification:**
- ✅ **Not Blocking:** Current system works, just inconsistent
- ⚠️ **Quality Impact:** Poor user experience and data reliability
- ⚠️ **Cost Impact:** Wasted AI API calls for re-parsing
- ✅ **Easy Fix:** Simple config changes (temperature: 0)
- ⚠️ **Risk:** Low risk (changes improve determinism)

**Recommendation:** Deploy after the 3 CRITICAL fixes (confidence display, duplicate workflows, Prisma connection) are validated in production. This ensures we don't introduce new issues while fixing critical ones.

**Timeline:**
- Deploy CRITICAL fixes: Immediate (today)
- Deploy AI parsing fixes: 2-3 days after critical fixes are stable
- Monitor results: 7-14 days
- Iterate based on metrics: Ongoing

