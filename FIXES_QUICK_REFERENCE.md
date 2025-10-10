# Quick Reference: Critical Bug Fixes

## ✅ COMPLETED - 2025-10-10

---

## Bug #1: Confidence Score Display (7700% → 77%)

**File:** `api/src/lib/workflowOrchestrator.js` (line ~795)

**Changed:**
```javascript
// OLD: console.log('   Confidence:', `${((confidence || 0) * 100).toFixed(1)}%`)
// NEW:
console.log('   Confidence:', `${aiResult.confidence?.overall || 0}%`)
```

**Result:** Confidence now displays correctly as 0-100% (e.g., "77%" instead of "7700%")

---

## Bug #2: Duplicate Workflow Creation

**Problem:** Two workflows created per upload (workflow_ABC + workflow_XYZ)

**Solution:** Pass existing workflow ID from cron job to prevent duplication

### Changes Made:

#### 1. `api/cron/process-workflows.js` (line ~137)
```javascript
const workflowData = {
  // ... existing fields
  existingWorkflowId: workflowId, // ← ADDED
  metadata: { /* ... */ }
}
```

#### 2. `api/process-workflows-cron.js` (line ~137)
```javascript
const workflowData = {
  // ... existing fields
  existingWorkflowId: workflowId, // ← ADDED
  metadata: { /* ... */ }
}
```

#### 3. `api/src/lib/workflowIntegration.js` (line ~36)
```javascript
// ADDED: Check for existing workflow
let workflowId
if (uploadData.existingWorkflowId) {
  workflowId = uploadData.existingWorkflowId
  await this.orchestrator.scheduleNextStage(workflowId, 'ai_parsing', workflowData)
} else {
  workflowId = await this.orchestrator.startWorkflow(workflowData)
}
```

**Result:** Only ONE workflow per upload, 50% reduction in duplicate processing

---

## Testing

### Quick Test: Confidence Display
```bash
# Upload a PO and check logs:
grep "AI parsing completed successfully" logs/*.log
# Should show: "Confidence: 77%" (not "7700%")
```

### Quick Test: No Duplicates
```sql
-- Should return 0 rows:
SELECT uploadId, COUNT(*) as count
FROM workflowExecution
WHERE createdAt > NOW() - INTERVAL '1 day'
GROUP BY uploadId
HAVING COUNT(*) > 1;
```

---

## Monitoring

**Watch for:**
- ✅ Confidence scores 0-100% (no values > 100%)
- ✅ One workflow per upload (no duplicates)
- ✅ Log message "🔄 Using existing workflow ID" (from cron jobs)
- ✅ No "🎬 Creating new workflow" for cron-processed uploads

**Alerts:**
- Confidence > 100% → ALERT
- Duplicate workflows → ALERT
- Workflow creation rate spike → WARNING

---

## Files Modified

1. ✅ `api/src/lib/workflowOrchestrator.js`
2. ✅ `api/cron/process-workflows.js`
3. ✅ `api/process-workflows-cron.js`
4. ✅ `api/src/lib/workflowIntegration.js`

---

## Next Steps

- [ ] Deploy to staging
- [ ] Run regression tests
- [ ] Monitor for 24 hours
- [ ] Deploy to production
- [ ] Verify metrics improve

---

**Status:** Ready for QA Testing  
**Priority:** CRITICAL - Required before Shopify App Store release
