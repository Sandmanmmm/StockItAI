# 🔍 Monitoring Guide - PO Conflict Fix Validation

**Date:** 2025-10-13  
**Fixes Deployed:**
- ✅ Lock Contention Fix (Verified)
- ✅ PO Number Conflict Resolution (Commit 094e093)

---

## 📊 **Quick Status Check**

### **Command:**
```powershell
Invoke-WebRequest -Uri "https://stock-it-ai.vercel.app/api/queue-admin/status" | 
  Select-Object -ExpandProperty Content | 
  ConvertFrom-Json | 
  ConvertTo-Json -Depth 10
```

### **What to Look For:**

#### ✅ **Success Indicators:**
```json
{
  "queue": "database-save",
  "completed": 1+,     // ← Should increase
  "failed": 6,         // ← Should NOT increase
  "active": 0          // ← Should complete
}
```

#### ❌ **Failure Indicators:**
```json
{
  "queue": "database-save",
  "completed": 0,      // ← Still 0 (not progressing)
  "failed": 7+,        // ← Increased from 6
  "active": 0          // ← No longer processing
}
```

---

## 📝 **Log Analysis Commands**

### **1. Check for Conflict Resolution:**
```powershell
vercel logs --since 30m | Select-String "UPDATE CONFLICT|CREATE CONFLICT"
```

**Expected Output (UPDATE scenario):**
```
[info] 🔄 [CONFLICT RESOLUTION] Resolving PO number conflict...
[info] 📝 [UPDATE CONFLICT] Will skip number change and keep existing PO number
[info]    Existing PO ID: cmgpm4vem0001i804pouhjo7r
[info]    Conflicting number: 1142384989090
[info] ✅ [UPDATE CONFLICT] Will retry UPDATE without changing PO number
[info] 📋 Updated purchase order: TEMP-123 (processing)
```

**Expected Output (CREATE scenario):**
```
[info] 🔄 [CONFLICT RESOLUTION] Resolving PO number conflict...
[info] 📝 [CREATE CONFLICT] Will find available PO number with suffix
[info] ✅ [CREATE CONFLICT] Found available: 1142384989090-3
[info] 🔄 [CREATE CONFLICT] Will retry CREATE with: 1142384989090-3
[info] 📋 Created purchase order: 1142384989090-3 (processing)
```

---

### **2. Check for Transaction Timeouts:**
```powershell
vercel logs --since 30m | Select-String "Transaction already closed"
```

**Expected:** No results (timeout issue is fixed)

---

### **3. Check for Database Save Success:**
```powershell
vercel logs --since 30m | Select-String "Updated purchase order|Created purchase order"
```

**Expected Output:**
```
[info] 📋 Updated purchase order: TEMP-123 (processing)
[info] ✅ Created 2 line items
```

---

### **4. Check for Unique Constraint Errors:**
```powershell
vercel logs --since 30m | Select-String "Unique constraint failed"
```

**Expected:** May see initial error, but should be followed by conflict resolution

---

## 🎯 **Validation Checklist**

### **Phase 1: Initial Deployment (Complete ✅)**
- [x] Code changes deployed (Commit 094e093)
- [x] No build errors
- [x] Queue system initialized

### **Phase 2: First Run (In Progress ⏳)**
- [ ] database_save job completes successfully
- [ ] No new unique constraint failures
- [ ] Logs show UPDATE CONFLICT or CREATE CONFLICT resolution
- [ ] PO record updated/created successfully
- [ ] Line items created

### **Phase 3: Validation (Pending 📋)**
- [ ] Check completed vs failed count
- [ ] Verify workflow progresses to next stage
- [ ] Confirm no transaction timeout errors
- [ ] Monitor for 1 hour for any edge cases

### **Phase 4: Production Stability (Future 🔮)**
- [ ] Monitor for 24 hours
- [ ] Review all completed workflows
- [ ] Document any edge cases
- [ ] Update user documentation

---

## 🚨 **Troubleshooting**

### **Issue: database_save still failing**

#### **Check 1: Is it the same error?**
```powershell
vercel logs --since 10m | Select-String "Database persistence failed"
```

Look for error message to determine if it's:
- ✅ Same PO conflict → Fix may need refinement
- ✅ Different error → New issue to investigate
- ✅ Transaction timeout → Lock contention not fully resolved

---

#### **Check 2: Review full error context**
```powershell
vercel logs --since 10m | Select-String "Database persistence failed" -Context 10
```

This shows 10 lines before and after the error.

---

#### **Check 3: Verify fix is deployed**
```powershell
vercel logs --since 5m | Select-String "UPDATE CONFLICT|CREATE CONFLICT"
```

If no results → Fix not triggered yet or code not deployed
If results → Fix is running, check output

---

### **Issue: database_save taking too long (>2 minutes)**

**Possible Causes:**
1. Large transaction (many line items)
2. Database connection issue
3. AI parsing still running (blocking)
4. Redis/queue coordination issue

**Check:**
```powershell
# Check if AI parsing is still active
Invoke-WebRequest -Uri "https://stock-it-ai.vercel.app/api/queue-admin/status"

# Look for active jobs in ai_parsing queue
# database_save should wait for ai_parsing to complete
```

---

## 📈 **Success Metrics**

### **Before Fix:**
```
database_save:
  - Completed: 0
  - Failed: 6
  - Success Rate: 0%
  - Error: "Unique constraint failed"
```

### **After Fix (Target):**
```
database_save:
  - Completed: 1+
  - Failed: 6 (no increase)
  - Success Rate: 100% (for new jobs)
  - No unique constraint errors on retry
```

---

## 🔄 **Monitoring Schedule**

### **First Hour:**
- Check queue status every 10 minutes
- Review logs for any failures
- Verify first workflow completes successfully

### **First Day:**
- Check queue status every 2 hours
- Monitor failure count (should not increase)
- Review completed workflows for data accuracy

### **First Week:**
- Daily status check
- Review user feedback
- Monitor for any edge cases
- Document any additional scenarios

---

## 📞 **When to Escalate**

### **Immediate Escalation (Critical):**
- ❌ database_save failures increase beyond 6
- ❌ Transaction timeout errors return
- ❌ System completely stops processing
- ❌ Data corruption detected

### **Investigation Needed (High Priority):**
- ⚠️ database_save still failing after 3 attempts
- ⚠️ Conflict resolution not triggering
- ⚠️ New error messages appear
- ⚠️ Performance degradation (>5 minutes per workflow)

### **Monitor and Document (Normal):**
- ℹ️ database_save completes but takes >1 minute
- ℹ️ Multiple conflict resolution attempts needed
- ℹ️ Edge cases in PO number formats
- ℹ️ Specific supplier/merchant patterns causing issues

---

## 📋 **Quick Reference**

### **Current Workflow ID:**
```
wf_1760388961983_cmgpm4w4
```

### **Current PO ID:**
```
cmgpm4vem0001i804pouhjo7r
```

### **Expected Behavior:**
1. AI parsing extracts PO number: `1142384989090`
2. database_save tries UPDATE on PO `cmgpm4vem0001i804pouhjo7r`
3. Conflict detected (another PO has that number)
4. Fix triggers: Skip number change, keep existing
5. UPDATE succeeds with existing PO number
6. Line items created
7. Workflow continues to next stage

---

## 🎯 **Next Actions**

1. **Wait 5-10 more minutes** for database_save to complete
2. **Run status check** to see if completed count increased
3. **Review logs** for UPDATE CONFLICT messages
4. **Verify** no new failures
5. **Document** results in this guide
6. **Update** architecture document with final results

---

**Last Updated:** 2025-10-13 21:35 UTC  
**Status:** ⏳ Monitoring first workflow after fix deployment
