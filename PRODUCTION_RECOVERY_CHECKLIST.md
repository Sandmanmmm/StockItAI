# Production Recovery Deployment Checklist

## Pre-Deployment Steps

### 1. Pause Cron & Queues ⏸️
```powershell
# Pause all queues to stop job processing
node api/manage-queues.js pause

# Verify queues are paused
node api/manage-queues.js status
```

### 2. Clean Failed Jobs 🧹
```powershell
# Remove old failed jobs that will retry with broken code
node api/manage-queues.js clean
```

### 3. Verify Database Schema ✅
```powershell
# Confirm table names match expectations
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

## Deployment

### Fixes Included in This Deploy

1. **Const Reassignment Bug** (`workflowOrchestrator.js:1259`)
   - Changed `productDrafts = draftsFromDb` to `let draftsToProcess`
   - Removed duplicate database query
   - Status: ✅ FIXED

2. **Image Review Table Mismatch** (`refinementPipelineService.js`)
   - Replaced raw SQL using `image_review_options` (doesn't exist)
   - Now uses Prisma `ImageReviewProductImage` model (exists)
   - Status: ✅ FIXED

3. **Prisma Warmup** (from previous commit)
   - All DB operations now use `prismaOperation()` helper
   - Ensures engine is connected before queries
   - Status: ✅ DEPLOYED (previous commit)

### Deploy Commands
```powershell
# Stage changes
git add -A

# Commit
git commit -m "Fix: image review schema mismatch and const reassignment bug

- Replace raw SQL in getApprovedImagesForItem() with Prisma queries
- Fix const reassignment in processImageAttachment
- Use actual PascalCase table names (ImageReviewProduct, etc)
- Add queue management utility for pausing/cleaning queues
- Add table name verification script

Fixes P2010 'relation does not exist' errors in production"

# Push to trigger deployment
git push
```

## Post-Deployment Verification

### 1. Monitor Deployment
Watch Vercel deployment logs for:
- ✅ Build success
- ✅ Prisma client generation
- ✅ Deployment live

### 2. Resume Queues ▶️
```powershell
# Wait ~2 minutes for deployment to complete, then resume
node api/manage-queues.js resume

# Verify queues are running
node api/manage-queues.js status
```

### 3. Test PO Upload Flow
```
1. Upload a new PO file
2. Monitor logs for:
   - ✅ No "Engine is not yet connected" errors
   - ✅ No "relation does not exist" errors
   - ✅ Workflow progresses through stages
   - ✅ Image review session created successfully
3. Check frontend for 404 errors on image review endpoint
```

### 4. Check for Remaining Issues

**Connection Pool:**
- Monitor for "timed out fetching connection" errors
- If present, may need to reduce concurrent queries

**Google API 429:**
- Review image search frequency
- Consider adding rate limiting/backoff

**Cron Job Overload:**
- Current: runs every 1 minute
- Consider: increase to 2-5 minutes if many workflows pending

## Rollback Plan

If deployment fails:

```powershell
# 1. Pause queues immediately
node api/manage-queues.js pause

# 2. Revert git commit
git revert HEAD
git push

# 3. Wait for deployment
# 4. Resume queues after stable
node api/manage-queues.js resume
```

## Success Criteria

- [ ] No P2010 "relation does not exist" errors in logs
- [ ] No "Engine is not yet connected" errors in logs
- [ ] No "Assignment to constant variable" errors
- [ ] PO uploads complete successfully end-to-end
- [ ] Image review sessions created and accessible
- [ ] Connection pool stays under 25 connections
- [ ] No 404 errors on image review API endpoints

## Follow-Up Tasks

After stable deployment:

1. **Queue Configuration**
   - Verify Redis queue definitions exist
   - Add queue names to shared config to avoid "creating temporary queue"

2. **Rate Limiting**
   - Add backoff for Google Image Search (current 429 errors)
   - Implement retry limits for image searches

3. **Legacy Code Cleanup**
   - Remove unused raw SQL methods from merchantImageReviewService.js
   - Fully migrate to Prisma-based image review methods

4. **Connection Hygiene**
   - Add Prisma client closure in db.js for old clients
   - Limit client recreation to prevent pool exhaustion

5. **Cron Optimization**
   - Consider increasing cron interval from 1min to 2-5min
   - Add smarter workflow batching

## Notes

- Database schema is correct (PascalCase tables exist)
- Problem was code using wrong table names, not missing migrations
- Prisma models match database exactly
- No schema changes needed, only code fixes
