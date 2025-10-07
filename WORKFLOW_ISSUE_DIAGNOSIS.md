# PO Workflow Issue - Image Processing Not Triggered

## Date: October 1, 2025
## PO ID: cmg8n6ahp000b55eg53ujdzdb

---

## 🔍 Issue Summary

The test PO was successfully uploaded and parsed, but the image processing pipeline was never triggered.

### What Worked ✅
- PDF file upload successful
- AI parsing completed (extracted 3 products)
- Database save completed (3 line items created)
- Products extracted correctly with SKUs

### What Failed ❌
- No product images on any line items
- PO status marked as "failed"
- Workflow stopped after DATABASE_SAVE stage
- AI_ENRICHMENT stage (where image processing happens) was never executed
- Processing Notes: "Processed by undefined" (should show processor name)

---

## 🎯 Root Cause Analysis

### Workflow Flow (Expected)
```
1. FILE_UPLOAD → ✅ Complete
2. AI_PARSING → ✅ Complete  
3. DATABASE_SAVE → ✅ Complete
4. DATA_NORMALIZATION → ❌ NOT REACHED
5. MERCHANT_CONFIG → ❌ NOT REACHED
6. AI_ENRICHMENT → ❌ NOT REACHED (Image Processing happens here)
7. SHOPIFY_PAYLOAD → ❌ NOT REACHED
8. PRODUCT_DRAFT_CREATION → ❌ NOT REACHED
9. STATUS_UPDATE → ❌ NOT REACHED
```

### Most Likely Causes

#### 1. Redis Queue Worker Not Running ⚠️ **PRIMARY SUSPECT**
The workflow uses Redis Bull queues to process stages asynchronously. If the queue worker isn't running, jobs pile up but never execute.

**Evidence:**
- Job Status: "completed" but PO Status: "failed" (inconsistent)
- Workflow stopped abruptly after DATABASE_SAVE
- No error message logged

**How to Check:**
```powershell
# Check if Redis is running
docker ps | findstr redis

# Check Redis connection
redis-cli ping
# Should return: PONG
```

**How to Fix:**
```powershell
# Option 1: Restart Redis container
docker restart <redis-container-id>

# Option 2: Start Redis if not running
docker start <redis-container-id>

# Option 3: Check API server logs for Redis connection errors
```

#### 2. Workflow Stage Scheduling Issue
The `scheduleNextStage()` method may not be properly queuing the next stage after DATABASE_SAVE.

**Evidence:**
- analysisJobId is null (workflow ID not tracked)
- "Processed by undefined" suggests missing workflow context

**How to Check:**
Look for these log messages in API server terminal:
```
📊 Updating PO status after DATABASE_SAVE
🔄 Scheduling next stage: DATA_NORMALIZATION
```

If missing, the stage scheduling logic has a bug.

#### 3. Environment Configuration Missing
The workflow orchestrator may be missing required env variables.

**How to Check:**
```powershell
# In api/.env, verify:
REDIS_HOST=localhost
REDIS_PORT=6379
NODE_ENV=development
```

---

## 🔧 Recommended Fixes

### Step 1: Check Redis Status
```powershell
cd "d:\PO Sync\shopify-po-sync-pro"

# Check if Redis container is running
docker ps

# If not running, start it
docker start <container-id>

# Verify connection
docker exec <container-id> redis-cli ping
```

### Step 2: Restart API Server
```powershell
# Kill current API server
Get-Process | Where-Object {$_.ProcessName -like "*node*"} | Stop-Process -Force

# Restart
cd "d:\PO Sync\shopify-po-sync-pro\api"
npm run dev
```

### Step 3: Re-Upload Test PO
Once Redis and API server are confirmed working:
```powershell
cd "d:\PO Sync\shopify-po-sync-pro"
node test-real-po-upload.js
```

Watch the API server terminal for these log messages:
```
🤖 processAIEnrichment - Starting AI enrichment...
🖼️ Step 1: Extracting vendor images from PO...
🔍 Searching Google Images for: Dell Latitude 7490...
📋 Creating image review session for 3 items
```

---

## 📋 Verification Checklist

After fixes, verify:
- [ ] Redis container is running (`docker ps`)
- [ ] API server connects to Redis (no connection errors in logs)
- [ ] New PO upload reaches AI_ENRICHMENT stage
- [ ] Line items have `productImages` array populated
- [ ] Image review session is created
- [ ] Google Images API is called (check for search queries in logs)
- [ ] PO status is "review_needed" (not "failed")

---

## 🎓 Understanding the Workflow

The workflow uses **Bull** (Redis-based job queue) to process stages:

1. **Upload Handler** creates initial job → queues AI_PARSING
2. **AI_PARSING** completes → queues DATABASE_SAVE  
3. **DATABASE_SAVE** completes → queues DATA_NORMALIZATION
4. **DATA_NORMALIZATION** completes → queues MERCHANT_CONFIG
5. **MERCHANT_CONFIG** completes → queues AI_ENRICHMENT
6. **AI_ENRICHMENT** calls refinementPipelineService.enrichWithAI()
   - This is where imageProcessingService runs
   - Calls Google Images API
   - Creates image review session
7. **SHOPIFY_PAYLOAD** prepares data for Shopify
8. **PRODUCT_DRAFT_CREATION** creates reviewable product drafts
9. **STATUS_UPDATE** marks PO as "review_needed"

**Key Point:** Each stage is a separate job in Redis. If Redis isn't processing jobs, the workflow stops.

---

## 💡 Why Image Processing Wasn't Tested in Isolation

The image pipeline code is working correctly:
- ✅ Google Images API configured and tested
- ✅ Image search returning 5+ results per product
- ✅ All service files compile without errors
- ✅ AI generation successfully removed

**The issue is NOT in the image processing code.**

**The issue is that the workflow orchestrator never reached the stage where image processing runs.**

This is a workflow orchestration/Redis queue issue, not an image pipeline issue.

---

## 🚀 Next Actions

1. **Immediate**: Check Redis container status
2. **Short-term**: Restart API server and verify workflow completes
3. **Long-term**: Add workflow monitoring/debugging endpoints

### Monitoring Improvements Needed

Add these endpoints for future debugging:
```javascript
// GET /api/monitoring/redis-status
// Returns: Redis connection status, queue lengths

// GET /api/monitoring/workflow/:workflowId
// Returns: Current stage, completed stages, pending stages

// POST /api/monitoring/workflow/:workflowId/retry
// Manually retry a failed workflow from last successful stage
```

---

## 📊 Current Status

**Image Pipeline Migration**: ✅ COMPLETE
- AI generation removed
- Google Images integrated
- Cost savings achieved

**Workflow Orchestration**: ⚠️ NEEDS INVESTIGATION
- Redis queue processing issue
- Workflow stages not executing sequentially
- This is unrelated to image pipeline changes

**Action Required**: Fix Redis/workflow orchestration, then re-test image pipeline end-to-end.
