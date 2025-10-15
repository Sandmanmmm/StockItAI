# Phase 1 Implementation Guide: Build Sequential Runner

**Timeline**: Week 1 (5 working days)  
**Effort**: 20-25 hours total  
**Status**: Ready to implement  
**Risk Level**: Low (feature flag prevents production impact)

---

## 📋 Overview

Phase 1 creates the foundation for sequential workflow execution by:
1. ✅ Building the `SequentialWorkflowRunner` class **(DONE)**
2. ⏳ Adding feature flags to all 6 processors
3. ⏳ Updating cron job entry point
4. ⏳ Creating local testing infrastructure

**Goal**: Complete end-to-end sequential workflow execution in local environment

---

## 🎯 Task Breakdown

### Task 1: Create Sequential Workflow Runner ✅ COMPLETE
**File**: `api/src/lib/sequentialWorkflowRunner.js`  
**Status**: ✅ Created (480 lines)  
**Time**: ~4 hours (complete)

**What it does**:
- Executes all 6 stages sequentially
- Monitors timeout (270s budget for 300s Vercel limit)
- Creates mock Bull job objects for compatibility
- Tracks stage timings and progress
- Comprehensive error handling
- Database status updates

**Key Features**:
```javascript
// Initialize once
await sequentialWorkflowRunner.initialize()

// Execute workflow
const result = await sequentialWorkflowRunner.executeWorkflow(workflowId, {
  uploadId, merchantId, fileUrl, fileName, ...
})

// Result includes timing breakdown
console.log(`Duration: ${result.duration}ms`)
console.log(`Stage timings:`, result.stageTimings)
```

---

### Task 2: Add Feature Flags to Processors ⏳ TODO
**File**: `api/src/lib/workflowOrchestrator.js`  
**Status**: ⏳ To implement  
**Time**: ~2 hours  
**Locations**: 6 processors × 2 changes each = 12 code modifications

See `SEQUENTIAL_WORKFLOW_EXACT_CHANGES.md` for precise code changes needed.

**Summary of changes**:
1. **processAIParsing** (line ~1181): Add feature flag + return statement
2. **processDatabaseSave** (line ~1522): Add feature flag + return statement
3. **processProductDraftCreation** (line ~1830): Add feature flag + return statement
4. **processImageAttachment** (lines ~1916, ~1977): Add feature flag (2 locations) + return statement
5. **processShopifySync** (lines ~2201, ~2235): Add feature flag (2 locations) + return statement
6. **processStatusUpdate** (line ~2568): Add feature flag check

**Pattern for each processor**:
```javascript
// Before scheduleNextStage() call:
const isSequentialMode = process.env.SEQUENTIAL_WORKFLOW === '1'

if (!isSequentialMode) {
  await this.scheduleNextStage(...)
} else {
  console.log('   ⚡ [SEQUENTIAL] Skipping queue - will invoke next stage directly')
}

// At end of function:
return {
  [stageResult],
  nextStageData: enrichedNextStageData,
  purchaseOrderId,
  merchantId
}
```

---

### Task 3: Update Cron Job Entry Point ⏳ TODO
**File**: `api/process-workflows-cron.js`  
**Status**: ⏳ To implement  
**Time**: ~1 hour  
**Line**: ~217

**Changes needed**:
1. Check `process.env.SEQUENTIAL_WORKFLOW === '1'`
2. If true → Import and use `sequentialWorkflowRunner`
3. If false → Use existing Bull queue logic
4. Add logging to show which mode is active

See `SEQUENTIAL_WORKFLOW_EXACT_CHANGES.md` Change #7 for exact code.

---

### Task 4: Local Testing Infrastructure ⏳ TODO
**Status**: ⏳ To implement  
**Time**: ~3 hours

#### Files to create:
1. `api/test-sequential-workflow.mjs` - End-to-end test
2. `api/compare-workflow-modes.mjs` - Performance comparison
3. `.env.local` - Local environment variables

#### Test scenarios:
- ✅ Feature flag OFF → Legacy mode
- ✅ Feature flag ON → Sequential mode
- ✅ All 6 stages execute
- ✅ Duration < 5 minutes
- ✅ Error handling works
- ✅ Database updates correctly

---

## 🚀 Day-by-Day Implementation Plan

### Day 1 (Monday): Feature Flags - Processors 1-3
**Time**: 6-8 hours

**Morning (3-4 hours)**:
1. Review `SEQUENTIAL_WORKFLOW_EXACT_CHANGES.md`
2. Backup `workflowOrchestrator.js`
3. Add feature flag to `processAIParsing()` (line 1181)
4. Add return statement to `processAIParsing()`
5. Test compilation

**Afternoon (3-4 hours)**:
1. Add feature flag to `processDatabaseSave()` (line 1522)
2. Add return statement to `processDatabaseSave()`
3. Add feature flag to `processProductDraftCreation()` (line 1830)
4. Add return statement to `processProductDraftCreation()`
5. Test compilation
6. Commit: "feat: add feature flags to processors 1-3"

**Expected Result**: First 3 processors have feature flags

---

### Day 2 (Tuesday): Feature Flags - Processors 4-6
**Time**: 6-8 hours

**Morning (3-4 hours)**:
1. Add feature flags to `processImageAttachment()` (lines 1916, 1977)
2. Add return statement to `processImageAttachment()`
3. Add feature flags to `processShopifySync()` (lines 2201, 2235)
4. Add return statement to `processShopifySync()`

**Afternoon (3-4 hours)**:
1. Add feature flag check to `processStatusUpdate()` (line 2568)
2. Verify all 6 processors modified correctly
3. Test compilation (ensure no syntax errors)
4. Commit: "feat: add feature flags to processors 4-6"

**Expected Result**: All 6 processors have feature flags and return statements

---

### Day 3 (Wednesday): Cron Integration & Testing Setup
**Time**: 6-8 hours

**Morning (3-4 hours)**:
1. Update `process-workflows-cron.js` (line 217)
2. Add sequential mode logic
3. Test cron with `SEQUENTIAL_WORKFLOW=0` (legacy mode)
4. Test cron with `SEQUENTIAL_WORKFLOW=1` (sequential mode)
5. Commit: "feat: add sequential mode to cron entry point"

**Afternoon (3-4 hours)**:
1. Create `test-sequential-workflow.mjs`
2. Create `compare-workflow-modes.mjs`
3. Create `.env.local` with test variables
4. Commit: "test: add testing infrastructure"

**Expected Result**: Cron works in both modes, test scripts ready

---

### Day 4 (Thursday): Integration Testing
**Time**: 6-8 hours

**Morning (3-4 hours)**:
1. Set `SEQUENTIAL_WORKFLOW=0` → Test legacy mode still works
2. Upload test PO file → Verify 38-minute completion
3. Document legacy mode timing

**Afternoon (3-4 hours)**:
1. Set `SEQUENTIAL_WORKFLOW=1` → Test sequential mode
2. Upload test PO file → Verify 3-5 minute completion
3. Compare results between modes
4. Test error scenarios (bad file, missing data, etc.)

**Expected Result**: Both modes work, sequential is 8x faster

---

### Day 5 (Friday): Edge Cases & Documentation
**Time**: 6-8 hours

**Morning (3-4 hours)**:
1. Test large file (500KB+)
2. Test small file (<10KB)
3. Test timeout scenario
4. Test database connection failure
5. Test Redis connection failure

**Afternoon (3-4 hours)**:
1. Document test results
2. Create Phase 2 deployment plan
3. Prepare team demo
4. Code review prep
5. Final commit: "docs: complete Phase 1 implementation"

**Expected Result**: Phase 1 complete, ready for Phase 2

---

## 🧪 Testing Commands

### Test Legacy Mode
```bash
# PowerShell
$env:SEQUENTIAL_WORKFLOW="0"
node api/process-workflows-cron.js
```

### Test Sequential Mode
```bash
# PowerShell
$env:SEQUENTIAL_WORKFLOW="1"
node api/test-sequential-workflow.mjs
```

### Compare Performance
```bash
node api/compare-workflow-modes.mjs
```

### Run Full Test Suite
```bash
# Test legacy mode
$env:SEQUENTIAL_WORKFLOW="0"
node api/test-sequential-workflow.mjs

# Test sequential mode
$env:SEQUENTIAL_WORKFLOW="1"
node api/test-sequential-workflow.mjs

# Compare results
node api/compare-workflow-modes.mjs
```

---

## 📊 Success Criteria

### Functional Requirements ✅
- [ ] All 6 processors have feature flags
- [ ] All 6 processors return results
- [ ] Cron job checks feature flag
- [ ] Sequential mode executes all stages
- [ ] Legacy mode still works
- [ ] No compilation errors

### Performance Requirements ✅
- [ ] Sequential mode: 3-5 minutes total
- [ ] Legacy mode: Still works (38 min)
- [ ] No timeout errors in sequential mode
- [ ] Stage timings meet expectations:
  - ai_parsing: 60-90s ✅
  - database_save: 5-10s ✅
  - product_draft: 10-20s ✅
  - image_attachment: 20-40s ✅
  - shopify_sync: 30-60s ✅
  - status_update: 2-5s ✅

### Quality Requirements ✅
- [ ] Code compiles without errors
- [ ] No regressions in legacy mode
- [ ] Proper error handling
- [ ] Clear logging
- [ ] Documentation complete

---

## 📝 Commit Strategy

```bash
# Commit 1: Sequential Runner (already done)
git add api/src/lib/sequentialWorkflowRunner.js
git commit -m "feat: add sequential workflow runner

- Direct stage-to-stage execution
- Timeout monitoring (270s budget)
- Mock Bull job compatibility
- Comprehensive error handling
- Stage timing tracking

Part of Phase 1: Build Sequential Runner"

# Commit 2: Feature Flags (Processors 1-3)
git add api/src/lib/workflowOrchestrator.js
git commit -m "feat: add feature flags to processors 1-3

Modified:
- processAIParsing() (line 1181)
- processDatabaseSave() (line 1522)
- processProductDraftCreation() (line 1830)

Part of Phase 1: Build Sequential Runner"

# Commit 3: Feature Flags (Processors 4-6)
git add api/src/lib/workflowOrchestrator.js
git commit -m "feat: add feature flags to processors 4-6

Modified:
- processImageAttachment() (lines 1916, 1977)
- processShopifySync() (lines 2201, 2235)
- processStatusUpdate() (line 2568)

Part of Phase 1: Build Sequential Runner"

# Commit 4: Cron Integration
git add api/process-workflows-cron.js
git commit -m "feat: add sequential mode to cron entry point

- Check SEQUENTIAL_WORKFLOW env var
- Import sequential runner when enabled
- Preserve legacy Bull queue mode
- Add mode-specific logging

Part of Phase 1: Build Sequential Runner"

# Commit 5: Testing Infrastructure
git add api/test-sequential-workflow.mjs api/compare-workflow-modes.mjs
git commit -m "test: add testing infrastructure

- test-sequential-workflow.mjs: End-to-end testing
- compare-workflow-modes.mjs: Performance comparison

Part of Phase 1: Build Sequential Runner"
```

---

## ⚠️ Common Issues & Solutions

### Issue 1: `nextStageData is undefined`
**Cause**: Processor doesn't return results  
**Solution**: Add return statement with `nextStageData`

### Issue 2: Both modes run simultaneously
**Cause**: Feature flag check incorrect  
**Solution**: Use `=== '1'` (strict equality with string)

### Issue 3: `Cannot read property 'data' of undefined`
**Cause**: Mock job missing properties  
**Solution**: Check `createMockJob()` includes all required fields

### Issue 4: Timeout at 300s
**Cause**: Stage taking too long  
**Solution**: Check Vision API timeout (90-180s), verify no loops

### Issue 5: Stage 2+ fails with missing data
**Cause**: Data not flowing between stages  
**Solution**: Verify return statement includes all required fields

---

## 🎉 Phase 1 Complete Checklist

### Code ✅
- [x] Sequential runner created (480 lines)
- [ ] All 6 processors have feature flags (12 modifications)
- [ ] Cron job updated (1 modification)
- [ ] Test scripts created (2 files)

### Testing ✅
- [ ] Local test passes end-to-end
- [ ] Legacy mode works (no regressions)
- [ ] Sequential mode works (3-5 min)
- [ ] Error handling tested
- [ ] Edge cases tested

### Documentation ✅
- [x] Implementation guide created
- [x] Exact changes documented
- [ ] Test results documented
- [ ] Deployment plan ready
- [ ] Team briefed

### Ready for Phase 2 ✅
- [ ] Feature flag off by default
- [ ] Code reviewed
- [ ] No blocking bugs
- [ ] Performance validated
- [ ] Production deployment approved

---

## 📞 Questions & Support

### Debugging Checklist
1. ✅ Is `SEQUENTIAL_WORKFLOW` env var set?
2. ✅ Check logs for `[SEQUENTIAL]` or `[LEGACY]` markers
3. ✅ Verify all processors return `nextStageData`
4. ✅ Check database workflow status
5. ✅ Monitor execution time per stage

### Key Log Messages
- `🚀 Starting SEQUENTIAL workflow execution` - Sequential active
- `⚡ [SEQUENTIAL] Skipping queue` - Feature flag working
- `✅ AI Parsing complete` - Stage finished
- `⚠️ TIMEOUT WARNING` - Approaching limit

---

**Next Steps**: Start Day 1 - Add feature flags to processors 1-3  
**Questions**: Review exact changes in `SEQUENTIAL_WORKFLOW_EXACT_CHANGES.md`  
**Ready**: ✅ Sequential runner complete, exact changes documented, plan approved