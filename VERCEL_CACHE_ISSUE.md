# Vercel Cache Issue - Two-Phase Warmup Not Deployed

## Problem
Two-phase warmup fix (commit 4dceb9b) shows in Git but NOT running in production.

## Evidence
**Production logs show:**
- ❌ 19:31:39 - `ProductDraft.findFirst failed: Engine is not yet connected`
- ❌ 19:30:40 - `ProductDraft.findFirst failed: Engine is not yet connected`
- ❌ 19:29:39 - `WorkflowExecution.update failed: Engine is not yet connected`

**Expected logs (NOT PRESENT):**
- ✅ `Engine verified (Phase 1: Raw SQL) - connection layer ready`
- ✅ `Engine verified (Phase 2: Model Operations) - query planner ready`

## Verification
```bash
git log --oneline -2
6d280e8 (HEAD -> main, origin/main) Add comprehensive transaction logging
4dceb9b fix: Add two-phase warmup verification
```

Code is in main branch and pushed. But Vercel logs show old behavior.

## Root Cause
Vercel function caching or failed redeploy. Even though git push succeeded, the function may be:
1. Using cached build from before 4dceb9b
2. Failed to redeploy silently
3. Deployment succeeded but function cache not cleared

## Solution
Force Vercel to rebuild function:

### Option 1: Redeploy via Vercel Dashboard
1. Go to Vercel dashboard
2. Find latest deployment (6d280e8)
3. Click "Redeploy"
4. Select "Redeploy with existing cache cleared"

### Option 2: Force rebuild via trigger
Add a no-op change to force new build:

```javascript
// In api/src/lib/db.js
// Force rebuild: 2025-10-10-19:35
```

### Option 3: Vercel CLI
```bash
vercel --prod --force
```

## Monitoring
After redeployment, watch for these logs in cron execution:
- ✅ `Engine verified (Phase 1: Raw SQL)`
- ✅ `Engine verified (Phase 2: Model Operations)`

If Phase 2 logs appear, warmup is working.
If errors continue, cache wasn't cleared.
