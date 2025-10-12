# Week 1 Canary Rollout Guide (5%)

**Date:** October 11, 2025  
**Phase:** Week 1 - Initial canary rollout  
**Target:** 5% of supplier matching operations use pg_trgm  
**Status:** ⏳ Ready to start (after feature flags fix deployment completes)

---

## Prerequisites ✅

- [x] Phase 2 code deployed to production
- [x] Environment variables added to Vercel:
  - `USE_PG_TRGM_FUZZY_MATCHING=false`
  - `PG_TRGM_ROLLOUT_PERCENTAGE=0`
  - `ENABLE_PERFORMANCE_MONITORING=true`
- [x] Feature flags schema fix deployed (commit 3199c83)
- [x] System running in baseline mode (100% JavaScript)

---

## Step 1: Enable 5% Rollout

### Via Vercel Dashboard (Recommended)

1. **Navigate to Environment Variables**
   - Go to https://vercel.com/dashboard
   - Select your project (shopify-po-sync-pro)
   - Click "Settings" → "Environment Variables"

2. **Update Rollout Percentage**
   - Find `PG_TRGM_ROLLOUT_PERCENTAGE`
   - Click "Edit"
   - Change value from `0` to `5`
   - Click "Save"

3. **Redeploy Application**
   - Go to "Deployments" tab
   - Click "..." menu on latest deployment
   - Click "Redeploy"
   - Wait for deployment to complete (~1-2 minutes)

### Via Vercel CLI (Alternative)

```powershell
# Update environment variable
vercel env rm PG_TRGM_ROLLOUT_PERCENTAGE production
vercel env add PG_TRGM_ROLLOUT_PERCENTAGE production
# Enter value: 5

# Redeploy
vercel --prod
```

---

## Step 2: Verify Rollout Active

### Check Environment Variable Loaded

Wait 2-3 minutes after deployment, then check the logs for a supplier matching operation. You should see:

```
🚩 [merchantId] Using pg_trgm (rollout: 5%)
  OR
🚩 [merchantId] Using javascript (default)
```

Approximately 5% should show "pg_trgm", 95% should show "javascript".

### Verify Feature Flags Working

The system will log which engine is being used for each operation:

```
✅ Merchant settings fetched successfully
🚩 [cmgfhmjrg0000js048bs9j2d0] Using javascript (global env)
🚦 [Hybrid Router] Using javascript engine for supplier matching
```

After rollout enabled:
```
✅ Merchant settings fetched successfully
🚩 [cmgfhmjrg0000js048bs9j2d0] Using pg_trgm (rollout: 5%)
🚦 [Hybrid Router] Using pg_trgm engine for supplier matching
```

---

## Step 3: Monitor Performance

### Initial Check (After 1 Hour)

```powershell
# Check adoption rate
node analyze-performance.js adoption
```

**Expected Output:**
```
📊 Fuzzy Matching Engine Adoption
================================

Time Period: Last 24 hours
Total Operations: 20-50 (depending on activity)

Engine Usage:
├─ JavaScript: ~95% (19-47 operations)
└─ pg_trgm: ~5% (1-3 operations)

Rollout Status: ✅ 5% canary active
```

### Performance Comparison

```powershell
# Compare engine performance
node analyze-performance.js compare
```

**Expected Output:**
```
📊 Engine Performance Comparison
================================

JavaScript Engine:
  Operations: 47
  Avg Duration: 150-200ms
  Success Rate: 100%

pg_trgm Engine:
  Operations: 3
  Avg Duration: 5-15ms  ⚡ 15x faster
  Success Rate: 100%
  
Status: ✅ pg_trgm performing as expected
```

---

## Step 4: Daily Monitoring (Week 1)

### Day 1 (Today)
- ✅ Enable 5% rollout
- ✅ Verify deployment successful
- ✅ Check initial metrics (after 1 hour)
- ✅ Verify no errors

### Days 2-7
**Daily checks:**
```powershell
# Morning check
node analyze-performance.js adoption
node analyze-performance.js errors

# Evening check
node analyze-performance.js compare
```

**What to look for:**
- ✅ ~5% adoption rate maintained
- ✅ pg_trgm consistently faster than JavaScript
- ✅ 100% success rate on both engines
- ✅ No error spikes
- ❌ If pg_trgm errors > 5%, investigate immediately

---

## Expected Results (Week 1)

### Performance Metrics

**JavaScript Engine (95% of operations):**
- Duration: 100-200ms per operation
- Success rate: ~100%
- Behavior: Unchanged from baseline

**pg_trgm Engine (5% of operations):**
- Duration: 5-20ms per operation (10-20x faster ⚡)
- Success rate: ~100%
- Behavior: Same results as JavaScript

### Volume Estimates

If you process **20 POs per day** with **5 suppliers each** = **100 supplier matching operations/day**

**Week 1 Totals:**
- Total operations: ~700
- JavaScript: ~665 operations (95%)
- pg_trgm: ~35 operations (5%)

This gives us **~35 real-world data points** for pg_trgm performance validation.

---

## Success Criteria (Go/No-Go for Week 2)

### ✅ GO to Week 2 (25% rollout) if:
1. pg_trgm success rate ≥ 99%
2. pg_trgm faster than JavaScript consistently
3. No pg_trgm-specific errors
4. Automatic fallback working (if any failures)
5. No user complaints about supplier matching

### ❌ STAY at 5% if:
1. pg_trgm success rate < 99%
2. Intermittent errors detected
3. Performance inconsistent
4. Any data accuracy issues

### 🚨 ROLLBACK to 0% if:
1. pg_trgm success rate < 95%
2. Data corruption detected
3. Systematic errors
4. User-reported issues

---

## Rollback Procedure (If Needed)

### Instant Rollback (<30 seconds)

**Via Vercel Dashboard:**
1. Settings → Environment Variables
2. Edit `PG_TRGM_ROLLOUT_PERCENTAGE`
3. Change from `5` to `0`
4. Save → Redeploy

**Via Vercel CLI:**
```powershell
vercel env rm PG_TRGM_ROLLOUT_PERCENTAGE production
vercel env add PG_TRGM_ROLLOUT_PERCENTAGE production
# Enter: 0
vercel --prod
```

**Result:** All operations immediately revert to JavaScript engine (proven system)

---

## Troubleshooting

### Issue: Rollout percentage not taking effect

**Symptoms:**
- Still seeing 100% JavaScript operations
- Logs don't show any pg_trgm usage

**Solutions:**
1. Check Vercel deployment completed successfully
2. Verify environment variable saved for "Production" scope
3. Wait 2-3 minutes for cache to clear
4. Check logs for "🚩 rollout:" messages
5. Redeploy if needed

### Issue: pg_trgm errors detected

**Symptoms:**
- Errors in logs mentioning pg_trgm
- Operations failing more than expected

**Solutions:**
1. Check if automatic fallback working (should see "Falling back to JavaScript")
2. Review error messages for specific issues
3. Verify PostgreSQL pg_trgm extension enabled
4. Check database connection pool not exhausted
5. Consider rolling back to 0% if error rate > 5%

### Issue: Performance not as expected

**Symptoms:**
- pg_trgm not significantly faster than JavaScript
- Inconsistent performance

**Solutions:**
1. Check database CPU/memory usage
2. Verify indexes created correctly
3. Review query plans for pg_trgm queries
4. Check if connection pooler causing latency
5. Compare with baseline JavaScript performance

---

## Communication

### Internal Status Updates

**Daily Slack/Email:**
```
Week 1 Day X Update - 5% Canary Rollout

Status: ✅ On track
Operations today: 100 (JavaScript: 95, pg_trgm: 5)
Performance: pg_trgm 15x faster
Success rate: 100% both engines
Issues: None

Next check: Tomorrow 9am
```

### User Communication

**Not needed for 5% rollout** - This is an internal performance optimization with automatic fallback. Users won't notice any difference.

Only communicate if:
- Rolling out to 100% (Week 4)
- Major issues requiring maintenance window
- Significant performance improvements worth announcing

---

## Timeline

### Week 1 (Current)
- **Day 1:** Enable 5% rollout, monitor closely
- **Days 2-7:** Daily monitoring, collect data
- **Day 7:** Review metrics, go/no-go decision for Week 2

### Week 2 (If successful)
- Increase to 25% rollout
- Continue monitoring
- Collect more performance data

### Week 3 (If successful)
- Increase to 50% rollout
- Majority of operations using pg_trgm
- Validate at scale

### Week 4 (If successful)
- Set `USE_PG_TRGM_FUZZY_MATCHING=true` (100% rollout)
- Disable JavaScript engine (optional)
- Migration complete! 🎉

---

## Data Collection

### Metrics to Track

Create a spreadsheet to track daily:

| Date | Total Ops | pg_trgm Ops | Success Rate | Avg Duration (JS) | Avg Duration (pg) | Errors |
|------|-----------|-------------|--------------|-------------------|-------------------|--------|
| Day 1 | 100 | 5 | 100% | 165ms | 12ms | 0 |
| Day 2 | 120 | 6 | 100% | 158ms | 10ms | 0 |
| ... | | | | | | |

### Weekly Summary Template

```
Week 1 Canary Rollout Summary
=============================

Rollout: 5% pg_trgm, 95% JavaScript
Duration: Oct 11-17, 2025

Total Operations: 700
├─ JavaScript: 665 (95%)
└─ pg_trgm: 35 (5%)

Performance:
├─ JavaScript: 162ms avg
└─ pg_trgm: 11ms avg (14.7x faster ⚡)

Success Rates:
├─ JavaScript: 100%
└─ pg_trgm: 100%

Issues: None
Fallbacks: 0

Decision: ✅ GO to Week 2 (25% rollout)
```

---

## Quick Reference

**Current State:**
```
USE_PG_TRGM_FUZZY_MATCHING=false
PG_TRGM_ROLLOUT_PERCENTAGE=0    ← Currently
ENABLE_PERFORMANCE_MONITORING=true
```

**Week 1 Target:**
```
USE_PG_TRGM_FUZZY_MATCHING=false
PG_TRGM_ROLLOUT_PERCENTAGE=5    ← Change to this
ENABLE_PERFORMANCE_MONITORING=true
```

**Monitoring Commands:**
```powershell
node analyze-performance.js adoption   # Check %
node analyze-performance.js compare    # Compare speed
node analyze-performance.js errors     # Check errors
node analyze-performance.js metrics    # Detailed data
```

**Rollback Command:**
```powershell
# Set percentage back to 0
vercel env rm PG_TRGM_ROLLOUT_PERCENTAGE production
vercel env add PG_TRGM_ROLLOUT_PERCENTAGE production
# Enter: 0
vercel --prod
```

---

## Ready to Start! 🚀

**Status:** All prerequisites complete  
**Risk Level:** Very low (5% rollout, automatic fallback, instant rollback)  
**Expected Impact:** 15-20x speedup for 5% of operations  
**User Impact:** None (transparent to users)

**Next Action:** Update `PG_TRGM_ROLLOUT_PERCENTAGE` to `5` in Vercel Dashboard

---

**Let's ship this performance improvement!** ⚡
