# Production Stability Action Plan

**Date:** 2025-10-09  
**Commits:** f0ca369, 1df0df2  
**Status:** 🚨 REQUIRES MANUAL INTERVENTION

## Problem Summary

Despite deploying fixes, production logs show **old code still running**:
- Expected: `⏳ Waiting 2500ms for engine warmup...`
- Actual: `⏳ Waiting 1500ms for engine warmup...`

**Plus new issue:** "Response from the Engine was empty" errors indicating database connection pool exhaustion.

## Root Causes

### 1. Vercel Deployment Lag
- Code pushed at ~21:00
- Logs at 21:19 still show old code
- Vercel may be:
  - Still building deployment
  - Using cached old deployment
  - Running multiple deployment versions simultaneously

### 2. Database Connection Pool Exhaustion
- Supabase free tier: **60 max connections**
- Each serverless instance creates Prisma client with default pool size (~10-20)
- 6+ concurrent instances = 60-120 attempted connections
- Results in: "Response from the Engine was empty" (engine crash)

## Solutions Deployed

### Commit f0ca369 (Warmup Improvements)
✅ Increased warmup delay: 1500ms → 2500ms  
✅ Added verification retry logic (3 attempts)  
✅ Increased retry attempts: 3 → 5  
✅ Increased retry backoff: 200ms-3000ms  

### Commit 1df0df2 (Connection Pooling)
✅ Limited connection pool: 3 per instance (configurable via env)  
✅ Added connection timeout: 10s (configurable via env)  
✅ Added datasource URL override  
✅ Logs connection pool settings  

## Required Manual Actions

### 🔴 CRITICAL - Step 1: Verify Vercel Deployment Status

**Go to Vercel Dashboard:**
1. Navigate to: https://vercel.com/stock-it-ai/stock-it-ai
2. Click "Deployments" tab
3. Check latest deployment status:
   - ✅ **Ready** = Good, wait 2-3 minutes for all instances to update
   - ⏳ **Building** = Wait for completion
   - ❌ **Error** = Check build logs

**Current deployment should show:**
- Commit: `1df0df2` (latest) or `f0ca369` (previous)
- Status: Ready
- Git: main branch

### 🟡 RECOMMENDED - Step 2: Add Environment Variables

**Go to Vercel Dashboard → Settings → Environment Variables:**

Add these for fine-tuning (optional but recommended):

```bash
# Increase warmup if still seeing errors
PRISMA_WARMUP_MS=3500

# Connection pooling (already has defaults)
PRISMA_CONNECTION_LIMIT=3
PRISMA_CONNECTION_TIMEOUT=10
```

**Why these values:**
- `PRISMA_WARMUP_MS=3500`: Extra 1 second for safety on cold starts
- `PRISMA_CONNECTION_LIMIT=3`: Very conservative (60 total / 20 instances = 3 per instance)
- `PRISMA_CONNECTION_TIMEOUT=10`: 10 seconds should be plenty for pooler

### 🔵 OPTIONAL - Step 3: Force Redeploy

If deployment shows "Ready" but logs still show old code:

**Option A: Manual Redeploy**
1. In Vercel dashboard, go to latest deployment
2. Click "..." menu → "Redeploy"
3. Select "Use existing Build Cache" = OFF
4. Click "Redeploy"

**Option B: Dummy Commit**
```bash
cd "d:\PO Sync\shopify-po-sync-pro"
git commit --allow-empty -m "chore: force Vercel redeploy"
git push
```

## Verification Checklist

After Vercel shows "Ready" status, watch production logs for:

### ✅ Success Indicators
- [ ] Logs show: `⏳ Waiting 2500ms for engine warmup...` (or 3500ms if env var set)
- [ ] Logs show: `Connection pool limit: 3`
- [ ] Logs show: `✅ Engine verified - ready for queries`
- [ ] Fewer "Engine is not yet connected" retries (should succeed by attempt 2-3)
- [ ] No "Response from the Engine was empty" errors
- [ ] Workflows completing all stages without database errors
- [ ] PO uploads succeeding consistently

### ❌ Failure Indicators
- [ ] Still seeing: `⏳ Waiting 1500ms` = Old code still deployed
- [ ] Seeing: `Response from the Engine was empty` = Connection pool exhaustion persists
- [ ] Seeing: "Engine is not yet connected" after 5 retries = Warmup insufficient
- [ ] Workflows failing at database operations

## Monitoring Commands

Watch live logs in Vercel dashboard, or use CLI:
```bash
# Install Vercel CLI (if not already)
npm i -g vercel

# Login
vercel login

# Tail production logs
vercel logs --follow --app stock-it-ai --prod
```

## Escalation Path

### If Still Seeing Issues After 10 Minutes

**Temporary workaround - Reduce Load:**
1. Disable cron jobs temporarily (comment out in `vercel.json`)
2. Test single PO upload in isolation
3. Verify warmup timing and connection pool limits

**Nuclear option - Force Clean Deploy:**
```bash
# Clear all Vercel caches
vercel --prod --force

# Or in dashboard: Settings → Advanced → Clear Build Cache
```

**Long-term solution - Prisma Accelerate:**
- Costs $29/month but eliminates all these issues
- Provides global connection pooling and query caching
- Zero cold start issues
- Recommended for production stability

## Timeline Expectations

| Time | Expected State |
|------|----------------|
| T+0 | Code pushed to GitHub |
| T+1min | Vercel build triggered |
| T+3min | Vercel build complete → "Ready" |
| T+5min | All serverless instances updated |
| T+10min | All cold starts using new code |

**Current Status:** Waiting for Step 3 (all instances updated)

## Decision Matrix

| Scenario | Action |
|----------|--------|
| Deployment shows "Building" | ⏳ Wait for completion |
| Deployment shows "Ready" but logs show old code | 🔄 Force redeploy (Step 3) |
| Deployment shows "Error" | 🔧 Check build logs, fix errors |
| New code deployed but still errors | ➕ Add env vars (Step 2) |
| All else fails | 💰 Consider Prisma Accelerate |

---

**Next Action:** Check Vercel deployment status at https://vercel.com/stock-it-ai/stock-it-ai/deployments

**ETA for stability:** 5-10 minutes after deployment shows "Ready" status
