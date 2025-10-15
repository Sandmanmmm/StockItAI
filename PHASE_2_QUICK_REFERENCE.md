# Phase 2 Deployment - Quick Reference

## 🎯 Goal
Deploy sequential workflow feature to production with **zero-risk rollout**. Test with single merchant to verify 3-5 minute completion time.

---

## 📋 Prerequisites
- [x] Phase 1 complete (all code changes implemented)
- [ ] Local tests passed (run `./run-phase1-tests.ps1`)
- [ ] Vercel account access
- [ ] Database access for monitoring
- [ ] ~2-4 hours of time available

---

## 🚀 Quick Start (6 Steps)

### Step 1: Deploy with Feature Flag OFF (15 min)
```bash
# Set environment variable in Vercel
vercel env add SEQUENTIAL_WORKFLOW production
# Enter value: 0

# Commit and deploy
git add -A
git commit -m "feat: sequential workflow with feature flag (disabled by default)"
git push origin main

# Verify deployment
vercel logs --prod --follow
```

**Expected**: Deployment succeeds, workflows continue using legacy mode (38 min)

---

### Step 2: Identify Test Merchant (10 min)
```powershell
cd api
node identify-test-merchant.mjs

# Example output:
# ✅ Recommended Test Merchant:
#    Merchant ID: clxxx...
#    Success Rate: 95.2%
#    Recent Activity: 8 workflows in last 30 days

# Copy the merchant ID
```

**Expected**: Script recommends merchant with recent activity and high success rate

---

### Step 3: Enable Sequential Mode for Test Merchant (5 min)
```powershell
# Use merchant ID from Step 2
node enable-sequential-for-merchant.mjs <MERCHANT_ID>

# Example:
# node enable-sequential-for-merchant.mjs clxxx...

# Expected output:
# ✅ Sequential workflow ENABLED for test-shop.myshopify.com
```

**Expected**: Database record created, sequential mode enabled for this merchant only

---

### Step 4: Monitor Test Workflow (10-60 min wait time)
```powershell
# Start monitoring (keep terminal open)
node monitor-test-merchant.mjs <MERCHANT_ID>

# Expected output:
# ⏳ Waiting for workflow...
# 🆕 NEW WORKFLOW DETECTED!
# ⏱️  ai_parsing | processing | 0m 30s
# ⏱️  database_save | processing | 1m 45s
# ...
# ✅ WORKFLOW COMPLETED! Total Duration: 3m 42s
```

**Expected**: Workflow completes in 3-5 minutes (copy workflow ID from output)

---

### Step 5: Analyze Results (10 min)
```powershell
# Use workflow ID from Step 4
node analyze-test-workflow.mjs <WORKFLOW_ID>

# Example:
# node analyze-test-workflow.mjs wf_1234567890_abcdef

# Expected output:
# ✅ EXCELLENT - Within target!
# 🎯 PROCEED TO PHASE 3
```

**Expected**: Data quality verified, performance within target, ready for Phase 3

---

### Step 6: Document Results (15 min)
```powershell
# Create results file
New-Item -Path PHASE_2_TEST_RESULTS.md -ItemType File

# Document findings (see template below)
```

**Expected**: Test results documented for team review

---

## 📊 Success Criteria

| Metric | Target | Status |
|--------|--------|--------|
| Workflow Duration | 3-5 min | ⏳ |
| Data Quality | 100% correct | ⏳ |
| Shopify Sync | Success | ⏳ |
| Error Rate | 0% | ⏳ |
| Ready for Phase 3 | YES | ⏳ |

---

## 🔧 Troubleshooting

### Issue: Workflow takes >10 minutes
**Fix**: Check Vercel logs for slow stages, optimize bottlenecks
```bash
vercel logs --prod --filter "<WORKFLOW_ID>"
```

### Issue: Data missing or incorrect
**Fix**: Check AI parsing results, validate database records
```sql
SELECT * FROM PurchaseOrder WHERE workflowId = '<WORKFLOW_ID>';
```

### Issue: Shopify sync fails
**Fix**: Check Shopify API rate limits, verify product variants
```bash
vercel logs --prod --filter "shopify"
```

### Issue: Need to rollback
**Fix**: Disable sequential mode immediately
```powershell
node disable-sequential-for-merchant.mjs <MERCHANT_ID>
# OR set global env var to 0
vercel env add SEQUENTIAL_WORKFLOW 0 production
```

---

## 📝 Phase 2 Test Results Template

```markdown
# Phase 2 Test Results

## Test Details
- **Date**: YYYY-MM-DD HH:MM
- **Test Merchant**: merchant-id
- **Shop Domain**: shop.myshopify.com
- **Workflow ID**: wf_xxx

## Performance Metrics
- **Expected Duration**: 3-5 minutes
- **Actual Duration**: X minutes Y seconds
- **Status**: ✅ PASS / ⚠️ ACCEPTABLE / ❌ FAIL
- **Improvement**: X% faster than legacy (38 min)
- **Speedup Factor**: Xx

## Data Quality
- **PO Created**: ✅ YES / ❌ NO
- **PO Number**: xxx
- **Line Items**: X items extracted
- **Total Amount**: $XXX.XX
- **Shopify Sync**: ✅ SUCCESS / ❌ FAIL
- **Shopify Order ID**: xxx

## Issues Discovered
1. [None / List issues with severity]

## Vercel Logs Review
- [Any warnings or errors observed]

## Database Verification
- [SQL query results confirming data integrity]

## Recommendation
- ✅ **PROCEED TO PHASE 3**: All criteria met
- ⚠️ **FIX MINOR ISSUES**: Address problems, re-test
- ❌ **ROLLBACK**: Critical issues, investigate further

## Next Steps
1. [Action items]
```

---

## 🎯 Decision Matrix

### ✅ Proceed to Phase 3
**Criteria**:
- Duration ≤10 minutes
- All data correct
- No critical errors
- Performance improvement evident

**Action**: Create PHASE_3_ROLLOUT_PLAN.md

### ⚠️ Fix Minor Issues
**Criteria**:
- Duration 10-15 minutes
- Minor data issues
- Non-critical warnings

**Action**: Fix issues, repeat test

### ❌ Rollback
**Criteria**:
- Duration >30 minutes
- Data corruption
- Critical errors

**Action**: Disable, investigate, redesign

---

## 📞 Support

**Scripts Location**: `api/` directory
- `identify-test-merchant.mjs` - Find test merchant
- `enable-sequential-for-merchant.mjs` - Enable feature
- `disable-sequential-for-merchant.mjs` - Disable feature
- `monitor-test-merchant.mjs` - Real-time monitoring
- `analyze-test-workflow.mjs` - Results analysis

**Documentation**: 
- Full plan: `PHASE_2_DEPLOYMENT_PLAN.md`
- Implementation: `PHASE_1_IMPLEMENTATION_COMPLETE.md`

**Vercel Commands**:
```bash
vercel logs --prod --follow        # Watch logs
vercel env ls                      # List env vars
vercel deployments ls              # List deployments
```

---

## ⏱️ Estimated Timeline

| Step | Time | Notes |
|------|------|-------|
| Deploy to production | 15 min | Code deployment |
| Identify test merchant | 10 min | Database analysis |
| Enable sequential mode | 5 min | Single merchant |
| **Wait for PO upload** | **Variable** | **Depends on merchant** |
| Monitor workflow | 5-10 min | Real-time tracking |
| Analyze results | 10 min | Data verification |
| Document findings | 15 min | Create report |
| **Total (excluding wait)** | **~60 min** | **Active work time** |

---

## 💡 Pro Tips

1. **Choose Active Merchant**: Select merchant with daily PO uploads for faster testing
2. **Monitor in Real-Time**: Keep terminal open during test workflow
3. **Document Everything**: Capture logs, screenshots, metrics
4. **Have Rollback Ready**: Know how to disable immediately if needed
5. **Verify Shopify Order**: Check merchant's Shopify admin to confirm sync

---

**Ready to start?** Run Step 1: Deploy to production with feature flag OFF

**Questions?** Review `PHASE_2_DEPLOYMENT_PLAN.md` for detailed instructions
