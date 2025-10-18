# Quantity Extraction Flow - Visual Guide

```
┌─────────────────────────────────────────────────────────────────┐
│                    PURCHASE ORDER UPLOAD                         │
│         "Kool Aid Soda - Case of 12" @ $22.99                   │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                  AI EXTRACTION (Enhanced)                        │
│  ✅ NEW: Prompt includes "Extract quantity from Case of X"      │
│  ✅ NEW: Schema describes quantity extraction patterns          │
│  ✅ NEW: Few-shot examples show Case of 12 → quantity: 12       │
└─────────────────────────────────────────────────────────────────┘
                            ↓
                   ┌────────┴────────┐
                   │                 │
          ┌────────▼────────┐   ┌───▼───────────┐
          │ AI Success ✅   │   │ AI Missed ❌  │
          │ quantity: 12    │   │ quantity: 1   │
          └────────┬────────┘   └───┬───────────┘
                   │                │
                   └────────┬───────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│           POST-PROCESSING PARSER (Fallback)                      │
│  ✅ NEW: Checks if quantity = 1                                 │
│  ✅ NEW: Parses "Case of 12" from product name                  │
│  ✅ NEW: Extracts: 12                                           │
│  📦 Logs: "Extracted pack quantity 12 from: Kool Aid..."        │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                    DATABASE SAVE                                 │
│  sku: "860013270451"                                            │
│  productName: "Kool Aid Soda - Case of 12"                      │
│  quantity: 12 ✅                                                │
│  unitCost: 1.92 (calculated: $22.99 / 12)                       │
│  totalCost: 22.99                                               │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                      UI DISPLAY                                  │
│  SKU: 860013270451                                              │
│  Product: Kool Aid Soda - Case of 12                            │
│  Qty: 12 ✅                                                     │
│  Unit Price: $1.92                                              │
│  Total: $22.99                                                  │
│  Confidence: 80%                                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Extraction Pattern Examples

```
INPUT                                  REGEX MATCH              OUTPUT
────────────────────────────────────────────────────────────────────────
"Product - Case of 12"          →     /Case\s+of\s+(\d+)/  →   qty: 12
"Product - 24 ct"               →     /(\d+)\s*ct\b/       →   qty: 24
"Product (18 ct)"               →     /(\d+)\s*ct\b/       →   qty: 18
"Product - 6-Pack"              →     /(\d+)\s*-?\s*Pack/  →   qty: 6
"Product - 36 pcs"              →     /(\d+)\s*pcs\b/      →   qty: 36
"Product - 12 count"            →     /(\d+)\s*count\b/    →   qty: 12
"Single Product"                →     (no match)           →   qty: 1
```

---

## Regex Breakdown

```javascript
const packMatch = productName.match(
  /Case\s+of\s+(\d+)|         // "Case of 12"
   [-(\s](\d+)\s*ct\b|        // "24 ct" or "(24 ct)" or "- 24 ct"
   [-(\s](\d+)\s*-?\s*(Pack|pcs|count)\b/i  // "6-Pack", "36 pcs", "12 count"
)

// Captures:
// packMatch[1] = number from "Case of X"
// packMatch[2] = number from "X ct"
// packMatch[3] = number from "X Pack/pcs/count"
```

---

## Code Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│  databasePersistenceService.js:827                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  let quantity = parseInt(item.quantity)  // Try AI first    │
│                                                              │
│  if (!quantity || quantity === 1) {                         │
│    ┌────────────────────────────────────────────┐          │
│    │ FALLBACK PARSER                            │          │
│    │                                             │          │
│    │  const productName = item.productName      │          │
│    │  const packMatch = productName.match(...)  │          │
│    │                                             │          │
│    │  if (packMatch) {                          │          │
│    │    quantity = parseInt(packMatch[1..3])    │          │
│    │    console.log(`📦 Extracted...`)          │          │
│    │  }                                          │          │
│    └────────────────────────────────────────────┘          │
│  }                                                           │
│                                                              │
│  quantity = quantity || 1  // Final fallback                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## AI Enhancement Layers

```
LAYER 1: Enhanced Prompt
─────────────────────────
"CRITICAL QUANTITY RULES:
 quantity = total units (Case of 12 → 12)"

        ↓

LAYER 2: Schema Description  
───────────────────────────
quantity: {
  description: "TOTAL units: Case of 12→12, 24 ct→24"
}

        ↓

LAYER 3: Few-Shot Examples
──────────────────────────
Example: {
  description: "Widget - Case of 12",
  quantity: 12
}

        ↓

LAYER 4: Post-Processing
────────────────────────
if (quantity === 1) {
  // Parse from product name
}
```

---

## Decision Tree

```
                    ┌─────────────────┐
                    │  AI Extracts    │
                    │  Quantity       │
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
         ┌──────────▼──────┐   ┌─────▼──────────┐
         │ quantity > 1    │   │ quantity = 1   │
         │ or quantity set │   │ or missing     │
         └──────────┬──────┘   └─────┬──────────┘
                    │                 │
         ┌──────────▼──────┐   ┌─────▼──────────────┐
         │ USE AI VALUE ✅ │   │ CHECK PRODUCT NAME │
         │                 │   └─────┬──────────────┘
         │ Skip parser     │         │
         └─────────────────┘   ┌─────┴──────────┐
                               │                 │
                    ┌──────────▼──────┐   ┌─────▼─────────┐
                    │ Pattern Found   │   │ No Pattern    │
                    │ (Case of 12)    │   │ Found         │
                    └──────────┬──────┘   └─────┬─────────┘
                               │                 │
                    ┌──────────▼──────┐   ┌─────▼─────────┐
                    │ EXTRACT & USE ✅│   │ DEFAULT TO 1  │
                    │ quantity: 12    │   │ quantity: 1   │
                    └─────────────────┘   └───────────────┘
```

---

## Before vs After Comparison

```
╔═══════════════════════════════════════════════════════════════╗
║                         BEFORE                                 ║
╠═══════════════════════════════════════════════════════════════╣
║  AI sees: "Kool Aid - Case of 12"                             ║
║  AI extracts:                                                  ║
║    description: "Kool Aid - Case of 12"                       ║
║    quantity: null                                              ║
║  Code: quantity = parseInt(null) || 1                         ║
║  Database: quantity = 1 ❌                                    ║
║  Display: Qty: 1, Unit Price: $22.99, Total: $22.99          ║
║  Problem: Wrong quantity, wrong unit price!                   ║
╚═══════════════════════════════════════════════════════════════╝

                            ↓↓↓

╔═══════════════════════════════════════════════════════════════╗
║                          AFTER                                 ║
╠═══════════════════════════════════════════════════════════════╣
║  AI sees: "Kool Aid - Case of 12"                             ║
║  AI extracts (enhanced):                                       ║
║    description: "Kool Aid - Case of 12"                       ║
║    quantity: 12  ✅ (from enhanced prompt)                    ║
║  OR if AI missed:                                              ║
║    Parser extracts: 12 from "Case of 12" ✅                   ║
║  Database: quantity = 12 ✅                                   ║
║  Display: Qty: 12, Unit Price: $1.92, Total: $22.99          ║
║  Result: Correct quantity, correct unit price! ✅             ║
╚═══════════════════════════════════════════════════════════════╝
```

---

## Testing Workflow

```
1. UPLOAD PO
   │
   ├─→ AI analyzes with enhanced prompts
   │
   └─→ Extraction begins

2. AI EXTRACTION
   │
   ├─→ ✅ Success: quantity = 12
   │   └─→ Skip to step 4
   │
   └─→ ❌ Missed: quantity = null/1
       └─→ Proceed to step 3

3. POST-PROCESSING
   │
   ├─→ Parse product name
   │
   ├─→ Find "Case of 12"
   │
   ├─→ Extract: 12
   │
   └─→ Log: 📦 Extracted pack quantity 12

4. SAVE TO DATABASE
   │
   └─→ POLineItem.quantity = 12 ✅

5. VERIFY
   │
   ├─→ Check database value
   │
   ├─→ Check UI display
   │
   └─→ Validate total = qty × price
```

---

**Visual Guide Created:** October 18, 2025  
**Status:** Ready for Implementation Testing
