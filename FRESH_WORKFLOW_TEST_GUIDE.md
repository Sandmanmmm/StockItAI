# Fresh Workflow Test Guide

## Current System Status ✅

### Deployed Fixes (Commit acdbda7):
1. ✅ Redis connection resilience with retry logic
2. ✅ Shared Prisma client with retry wrapper
3. ✅ Foreign key validation before creating sessions
4. ✅ Line items persistence debugging logs
5. ✅ Connection pool optimization

### Confirmed Working:
- ✅ **Line items ARE persisting** - Database shows 2, 5, and 15 line items for recent POs
- ✅ PDF parsing with pdf2json
- ✅ AI processing with OpenAI
- ✅ Database connections stable
- ✅ No connection pool exhaustion

### What We're Testing:
🎯 **Complete 10-stage workflow progression:**
1. AI_PARSING → 2. DATABASE_SAVE → 3. DATA_NORMALIZATION → 4. MERCHANT_CONFIG → 
5. AI_ENRICHMENT → 6. SHOPIFY_PAYLOAD → 7. PRODUCT_DRAFT_CREATION → 
8. IMAGE_ATTACHMENT → 9. STATUS_UPDATE → 10. COMPLETED

---

## How to Upload a Fresh Test PO

### Option 1: Via Shopify App (Recommended)
1. Open your Shopify store admin: https://orderflow-ai-test.myshopify.com/admin
2. Navigate to the StockIt AI app
3. Click "Upload Purchase Order"
4. Upload one of these test files:
   - `test-files/Grocery-Sample-Receipts-6a54382fcf73a5020837f5360ab5a57b.png`
   - `test-files/AI Refinery PO updated.pdf`
   - Any other test PO PDF

### Option 2: Via API Endpoint (If you have direct access)
```bash
curl -X POST https://stock-it-ai.vercel.app/api/upload/po-file \
  -H "Content-Type: multipart/form-data" \
  -F "file=@path/to/test-po.pdf"
```

---

## What to Watch For

### 1. Workflow Monitor (Currently Running)
The monitor script is checking every 10 seconds and will show:
- ✅ New workflow detection
- 🔄 Stage progression
- 📦 Line items count
- ✅ Success/failure status

### 2. Production Logs (https://vercel.com/dashboard)
Look for these key indicators:

**AI Parsing Stage:**
```
🤖 Starting AI parsing for workflow workflow_XXXXX
✅ AI parsing completed successfully
```

**Database Save Stage (CRITICAL):**
```
💾 Persisting AI results to database...
✅ Line items created in transaction: Count: X, PO ID: xyz
✓ Verification: X line items in transaction before commit
✅ POST-COMMIT VERIFICATION: X line items found for PO xyz  ← KEY SUCCESS INDICATOR
```

**Data Normalization:**
```
🔧 processDataNormalization - Starting normalization...
✅ Data normalization completed
```

**Product Draft Creation:**
```
🎨 Product Draft Creation data: purchaseOrderId: xyz
🔍 DEBUG - Line items query result: X items found
📦 Creating product drafts for X line items
```

**Completion:**
```
✅ Workflow completed successfully
Status: completed
All stages processed
```

---

## Expected Timeline

- **0-60s**: AI Parsing (OpenAI processing)
- **60-90s**: Database Save (with our debugging logs)
- **90-120s**: Data Normalization
- **120-150s**: Merchant Config + AI Enrichment
- **150-180s**: Shopify Payload + Product Drafts
- **180-210s**: Image Attachment + Status Update
- **Total: ~3-4 minutes for complete workflow**

---

## Success Criteria ✅

### Critical Success Indicators:
1. ✅ **Line Items Persist**: POST-COMMIT VERIFICATION shows count > 0
2. ✅ **All 10 Stages Execute**: Workflow progresses through all stages
3. ✅ **Product Drafts Created**: Shopify products created successfully
4. ✅ **PO Status = "completed"**: Not "failed" or stuck in "processing"
5. ✅ **No Connection Errors**: No pool exhaustion or FK violations

### What We're Debugging:
- ❓ Why workflows show `currentStage: 'parsing_file'` instead of progressing
- ❓ Why PO status ends up "failed" even with persisted line items
- ❓ Whether the 10-stage refinement pipeline executes completely

---

## Current Monitor Status

**Running:** `monitor-workflow.js`
- Checks every 10 seconds
- Auto-detects new workflows
- Shows real-time progression
- Displays line items count

**Latest Workflow:** wf_1759908728730_cmgho7ts
- Status: completed
- Stage: parsing_file (❌ NOT progressing through all stages)
- Line Items: 2 (✅ Persisted successfully)
- PO Status: failed (❌ Should be completed)

---

## Next Steps

1. **Upload a fresh PO** via Shopify app
2. **Watch the monitor** for new workflow detection
3. **Check Vercel logs** for detailed stage progression
4. **Look for POST-COMMIT VERIFICATION** in logs
5. **Verify all 10 stages execute** in sequence

**The monitor will automatically detect and track your new upload!**

---

## If Issues Occur

### Scenario 1: Line Items Not Persisting
Look for in logs:
```
❌ CRITICAL: Line items lost after commit! Created X, found 0
```
This would indicate transaction rollback or deletion issue.

### Scenario 2: Workflow Stalls at Stage
Check logs for:
```
❌ [STAGE_NAME] failed: Error: [message]
💥 PROCESSOR ERROR in [stage] job [id]
```

### Scenario 3: Connection Errors
With our new fix, you should see:
```
🔄 [REDIS] Reconnecting on error: [message]
✅ [REDIS] Client connected for [queue]
```

---

**Ready to test! Upload a PO and watch the magic happen! 🚀**
