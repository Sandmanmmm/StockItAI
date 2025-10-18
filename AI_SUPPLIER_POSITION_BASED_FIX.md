# AI Supplier Extraction - Position-Based Fix

## Issue
After deploying the initial three-layer fix (commit d989645), the AI was still extracting the wrong supplier:
- ❌ Extracted: "Sugar Rushed Candy Emporium" (customer from SHIP TO section)
- ✅ Expected: "candyville.ca" (supplier from header)

## Root Cause
The previous fix used vague terms like "header/letterhead" and "visual cues" which weren't specific enough. The AI needs **explicit position rules** based on line numbers and label detection.

## Actual Invoice Structure
```
Lines 1-5: candyville.ca (SUPPLIER) ✅
           140 Finchdene Square / Scarborough ON M1X 1B1
           (416) 725-5304
           info@candyville.ca
           www.candyville.ca

Lines 10-18: SHIP TO label ⚠️
             Roman Sandrock
             Sugar Rushed Candy Emporium (CUSTOMER - DO NOT USE) ❌
             1638 Cyrville Road Unit 2
             sandrockroman@gmail.com
```

## Enhanced Fix Strategy

### 1. Position-Based Rules (Not Aggressive - Just Clear)
```javascript
// OLD (vague):
"found in HEADER/LETTERHEAD (top of page, largest text, return address)"

// NEW (specific):
"extract from TOP of document (first 1-5 lines) BEFORE any 'SHIP TO' or 'BILL TO' labels"
```

### 2. Label-Based Exclusion
```javascript
// Added explicit rule:
"IGNORE any company name that appears after 'SHIP TO:' or 'BILL TO:' - those are ALWAYS the customer"
```

### 3. Email Domain Validation
```javascript
// Enhanced validation rule:
"If supplier email domain doesn't match supplier company name, you extracted the wrong company"
// Example: candyville.ca with info@candyville.ca ✅
//          candyville.ca with sandrockroman@gmail.com ❌ (wrong - that's customer email)
```

### 4. Updated Few-Shot Examples
Changed examples to match real candyville.ca invoice format:
- Supplier contact on separate lines (not pipe-separated)
- Added customer email in SHIP TO/BILL TO sections
- Changed "SHIP TO:" to "SHIP TO" (label on own line)

## Changes Made

### File: `api/src/lib/enhancedAIService.js`

**Change 1:** Enhanced `optimizedPrompt` with position-based rules
- Added: "extract from the TOP of the document BEFORE any 'SHIP TO' or 'BILL TO' labels"
- Added: "IGNORE any company name that appears after 'SHIP TO:' or 'BILL TO:'"
- Added: "Common pattern: Line 1-5 of invoice = supplier info"
- Added: Email domain validation rule

**Change 2:** Updated supplier schema description
- Changed from vague "HEADER/LETTERHEAD area" to specific "TOP of document (first 1-5 lines)"
- Added: "Any company name AFTER 'SHIP TO'/'BILL TO' is the CUSTOMER, not supplier"

**Change 3:** Updated first few-shot example
- Separated contact info onto individual lines (matching real invoice format)
- Added customer email (techsupport@gmail.com) to SHIP TO section
- Changed "SHIP TO:" to "SHIP TO" (label on own line)

**Change 4:** Updated second few-shot example
- Separated contact info onto individual lines
- Added customer email (chef@restaurantabc.com) to BILL TO section
- Changed "BILL TO:" to "BILL TO"

## Validation Criteria

The AI should now correctly extract:
```json
{
  "supplier": {
    "name": "candyville.ca",
    "address": "140 Finchdene Square / Scarborough ON M1X 1B1 / Canada",
    "email": "info@candyville.ca",
    "phone": "(416) 725-5304"
  }
}
```

NOT:
```json
{
  "supplier": {
    "name": "Sugar Rushed Candy Emporium",  // ❌ This is from SHIP TO section
    "email": "sandrockroman@gmail.com",      // ❌ Personal email, not company
    "phone": "+16136175558"                  // ❌ Customer phone
  }
}
```

## Why This Fix is Not Too Aggressive

1. **Uses standard invoice conventions**: All B2B invoices follow this pattern (supplier at top, customer after SHIP TO/BILL TO)
2. **Position rules are industry-standard**: First 1-5 lines = supplier is universal across invoice formats
3. **Label detection is precise**: Only ignores companies AFTER "SHIP TO"/"BILL TO", not blocking legitimate supplier info
4. **Email validation is logical**: Company email domain should match company name (basic consistency check)

## Testing
Test with candyville.ca invoice to verify supplier extraction is correct.

## Deployment
Commit and push changes to trigger Vercel redeployment.
