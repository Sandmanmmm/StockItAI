# Phase 2: Quick Start Guide

## 🎯 Goal
Implement hybrid fuzzy matching with pg_trgm (fast) and JavaScript (fallback) using feature flags for gradual rollout.

---

## 📦 What We're Building

```
Current:  JavaScript Levenshtein (67 seconds)
New:      PostgreSQL pg_trgm (<100ms)
Strategy: Keep both, use feature flags to switch
```

---

## 🏗️ Architecture

```
findMatchingSuppliers()
    ↓
Check Feature Flag
    ↓
┌─────────────────┬─────────────────┐
│   pg_trgm       │   JavaScript    │
│   (FAST)        │   (FALLBACK)    │
└─────────────────┴─────────────────┘
```

---

## 📝 Implementation Steps

### 1. Create pg_trgm Service (1 hour)
**File:** `api/src/services/supplierMatchingServicePgTrgm.js`

**Key Functions:**
- `findMatchingSuppliersViaPgTrgm()` - Main function
- `enrichMatchResults()` - Add full supplier data
- `calculateAdditionalFieldScores()` - Email, phone, website scores
- `combineScores()` - Weighted average (same as JavaScript)

### 2. Add Feature Flags (30 min)
**File:** `api/src/config/featureFlags.js`

**Priority Order:**
1. Request-level: `options.engine = "pg_trgm"`
2. Merchant-level: `MerchantConfig.settings.fuzzyMatchingEngine`
3. Global: `process.env.USE_PG_TRGM_FUZZY_MATCHING`
4. Default: `"javascript"` (safe fallback)

### 3. Modify Main Service (1 hour)
**File:** `api/src/services/supplierMatchingService.js`

**Changes:**
- Import pg_trgm service and feature flags
- Check flag before matching
- Route to appropriate engine
- Log performance metrics
- Auto-fallback on error

### 4. Add Monitoring (30 min)
**File:** `api/src/lib/performanceMonitoring.js`

**Track:**
- Engine used (pg_trgm vs javascript)
- Execution time
- Result count
- Merchant ID

### 5. Environment Variables (5 min)
**File:** `api/.env`

```bash
USE_PG_TRGM_FUZZY_MATCHING=false
PG_TRGM_ROLLOUT_PERCENTAGE=0
```

---

## 🧪 Testing

### Unit Tests
```bash
npm test supplierMatchingServicePgTrgm.test.js
```

**Tests:**
- Exact match (score >0.9)
- Fuzzy match (score >0.6)
- No match for different names
- Respects maxResults
- Completes in <100ms

### A/B Test
```bash
node scripts/ab-test-fuzzy-matching.js
```

**Compares:**
- Execution time (pg_trgm vs JavaScript)
- Result count
- Match quality
- Speedup percentage

---

## 📈 Rollout Plan

### Week 1: Development + Testing
```bash
# Test locally
USE_PG_TRGM_FUZZY_MATCHING=false  # Use JavaScript
```

### Week 2: Canary (5%)
```bash
PG_TRGM_ROLLOUT_PERCENTAGE=5  # Enable for 5% of requests
```

### Week 3: Gradual (25% → 50% → 75%)
```bash
PG_TRGM_ROLLOUT_PERCENTAGE=25  # Day 1-2
PG_TRGM_ROLLOUT_PERCENTAGE=50  # Day 3-4
PG_TRGM_ROLLOUT_PERCENTAGE=75  # Day 5-6
```

### Week 4: Full (100%)
```bash
USE_PG_TRGM_FUZZY_MATCHING=true
PG_TRGM_ROLLOUT_PERCENTAGE=100
```

---

## ✅ Success Criteria

### Performance
- ✅ 99%+ faster than JavaScript
- ✅ <100ms per query
- ✅ Scales to 1000+ suppliers

### Quality
- ✅ Matches ≥95% of JavaScript results
- ✅ Same confidence levels
- ✅ No increase in false positives

### Reliability
- ✅ Auto-fallback on error
- ✅ Zero downtime deployment
- ✅ Rollback in <5 minutes

---

## 🚨 Emergency Rollback

If issues arise:

```bash
# Option 1: Global disable
USE_PG_TRGM_FUZZY_MATCHING=false

# Option 2: Per-merchant disable
await merchantConfig.update({
  where: { merchantId },
  data: { 
    settings: { 
      fuzzyMatchingEngine: "javascript" 
    } 
  }
})

# Option 3: Redeploy previous version
vercel rollback
```

---

## 📊 Key Metrics to Monitor

### Performance
- Average execution time (target: <100ms)
- P95 execution time (target: <200ms)
- Error rate (target: <0.1%)

### Business
- PO processing time (target: 60s → 10s)
- Match accuracy (target: ≥95%)
- User complaints (target: 0)

---

## 🎬 Ready to Start?

1. Review full analysis: `PHASE_2_HYBRID_IMPLEMENTATION_ANALYSIS.md`
2. Create pg_trgm service
3. Add feature flags
4. Modify main service
5. Test locally
6. Deploy to staging
7. Gradual rollout to production

**Estimated Time:** 6 hours development + 3 weeks rollout

---

## 💡 Quick Commands

```bash
# Run tests
npm test

# A/B test
node scripts/ab-test-fuzzy-matching.js

# Check adoption rate
node scripts/check-pg-trgm-adoption.js

# Monitor performance
node scripts/compare-performance.js

# Rollback
vercel rollback
```

---

## 📞 Support

- Full documentation: `PHASE_2_HYBRID_IMPLEMENTATION_ANALYSIS.md`
- Phase 1 guide: `PHASE_1_INSTALLATION_GUIDE.md`
- Performance analysis: `DATABASE_SAVE_PERFORMANCE_ANALYSIS.md`
- Fuzzy matching details: `FUZZY_MATCHING_ANALYSIS.md`

---

**Status:** Ready to implement ✅  
**Next Step:** Create `supplierMatchingServicePgTrgm.js`
