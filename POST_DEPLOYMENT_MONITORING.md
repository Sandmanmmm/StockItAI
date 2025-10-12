# 🔍 POST-DEPLOYMENT MONITORING GUIDE

## 🎯 What to Look For

### ✅ Success Indicators

Look for these log patterns indicating the fix is working:

```
✅ GOOD: Transaction completes quickly
🔒 [tx_xxx] Transaction body complete (duration: 947ms)
🔒 [tx_xxx] Transaction committed successfully (total: 1123ms)
```

```
✅ GOOD: Detailed timing shows each step
⏱️ [tx_xxx] Step 1 (UPDATE PO) took 234ms
⏱️ [tx_xxx] Step 2 (DELETE line items) took 12ms
⏱️ [tx_xxx] Step 3 (CREATE 2 line items) took 567ms
⏱️ [tx_xxx] Step 4 (CREATE audit record) took 89ms
⏱️ [tx_xxx] Step 5 (VERIFY line items count) took 45ms
```

```
✅ ACCEPTABLE: Conflict resolution completes quickly
⚠️ CONFLICT RESOLUTION INSIDE TRANSACTION - this can be slow!
Attempt 1/10: Trying suffix 1 → PO-1234-1
❌ Conflict on PO-1234-1, trying next...
Attempt 2/10: Trying suffix 2 → PO-1234-2
✅ Created purchase order with suffix: PO-1234-2 (conflict resolution took 1234ms)
```

---

### 🚨 Red Flags

Watch for these patterns indicating issues:

```
🚨 BAD: Transaction taking too long
⚠️ [tx_xxx] Transaction took 8456ms - should be under 5s!
🚨 [tx_xxx] CRITICAL: Transaction took 9234ms - exceeds 5s threshold!
```

```
🚨 BAD: Many conflict resolution attempts
Attempt 10/10: Trying suffix 10 → PO-1234-10
⚠️ Exhausted 10 attempts in 3456ms, using timestamp fallback
⚠️ This indicates MANY duplicate PO numbers - investigate root cause!
```

```
🚨 BAD: Still hitting 10s timeout
❌ Database persistence failed (attempt 1/3): Transaction already closed
Transaction timeout was 10000 ms, however XXXXX ms passed
```

```
🚨 BAD: Excessive lock waiting
⏳ [PO LOCK] Waiting for PO cmgmui2be0001l504p29b1sjy...
(repeated 50+ times rapidly)
```

---

## 📊 Metrics to Track

### 1. Transaction Duration
**Command**: Check Vercel logs for transaction timing
```bash
# Filter for transaction completion logs
grep "Transaction body complete" logs.txt | grep -oP '\(duration: \K[0-9]+'
```

**Expected**:
- Average: <3,000ms (3 seconds)
- P95: <5,000ms (5 seconds)
- Max: <10,000ms (10 seconds)

**Action if exceeded**:
- Check which step is slow using the per-step timing logs
- Investigate database query performance
- Consider further optimization

---

### 2. Conflict Resolution Frequency
**Command**: Check how often conflict resolution happens
```bash
# Count conflict resolution attempts
grep "CONFLICT RESOLUTION INSIDE TRANSACTION" logs.txt | wc -l

# Count total transaction attempts
grep "Starting transaction" logs.txt | wc -l

# Calculate percentage
# Conflicts / Total * 100
```

**Expected**:
- <5% of all transactions should need conflict resolution
- Most transactions should create/update without conflicts

**Action if >10%**:
- Investigate why duplicate PO numbers are common
- Check if duplicate workflow detection is working
- Consider implementing pre-transaction PO number uniqueness check

---

### 3. Conflict Resolution Duration
**Command**: Check how long conflict resolution takes
```bash
# Extract conflict resolution times
grep "conflict resolution took" logs.txt | grep -oP 'took \K[0-9]+'
```

**Expected**:
- Average: <1,500ms (1.5 seconds)
- Max: <3,000ms (3 seconds)

**Action if >3,000ms**:
- Many PO number collisions (10+ attempts)
- Indicates duplicate PO uploads problem
- Implement pre-transaction uniqueness check

---

### 4. Lock Contention
**Command**: Check PO lock waiting frequency
```bash
# Count lock wait messages
grep "[PO LOCK] Waiting" logs.txt | wc -l

# Count by PO ID to find hotspots
grep "[PO LOCK] Waiting" logs.txt | grep -oP 'PO \K[a-z0-9]+' | sort | uniq -c | sort -rn | head -10
```

**Expected**:
- Occasional lock waits are normal
- Same PO should have <10 consecutive waits
- Waits should be brief (<5 seconds total)

**Action if excessive**:
- Check if same PO being processed by many workflows
- Verify duplicate workflow detection is working
- Check cron job deduplication logic

---

### 5. Error Rate
**Command**: Check transaction timeout errors
```bash
# Count transaction timeout errors
grep "Transaction already closed" logs.txt | wc -l
grep "Transaction timeout" logs.txt | wc -l

# Count total persistence attempts
grep "Persisting AI results to database" logs.txt | wc -l

# Calculate error rate
# Errors / Total * 100
```

**Expected**:
- Error rate: <5%
- No "Transaction timeout was 10000ms, however XXXXX passed" errors
- If timeout errors occur, they should fail FAST (at 10s, not 180s)

**Action if >5%**:
- Something is genuinely slow (not just conflict resolution)
- Check per-step timing to identify bottleneck
- Investigate database connection pool health
- Check for database performance issues

---

## 🔧 Troubleshooting Commands

### Check Current Live Errors
```bash
# Tail Vercel logs in real-time
vercel logs --follow

# Filter for errors only
vercel logs --follow | grep -E "ERROR|CRITICAL|Failed"

# Filter for transaction timing
vercel logs --follow | grep -E "tx_|Transaction|⏱️"
```

### Analyze Recent Transactions
```bash
# Get last 100 transaction logs
vercel logs --limit=1000 > recent_logs.txt

# Extract transaction IDs and their durations
grep "Transaction body complete" recent_logs.txt | grep -oP 'tx_[a-z0-9_]+.*\(duration: [0-9]+ms\)'

# Find slowest transactions
grep "Transaction body complete" recent_logs.txt | grep -oP '\(duration: [0-9]+ms\)' | sort -t: -k2 -rn | head -20
```

### Check for Duplicate Workflows
```bash
# Check cron job deduplication
vercel logs | grep "Found.*workflows after PO dedupe"

# Should see patterns like:
# "📋 Found 0 pending + 5 stuck = 1 total workflows after PO dedupe"
# "🚫 Skipping 4 duplicate workflow(s)"
```

### Identify Hot PO IDs
```bash
# Find PO IDs with most activity
vercel logs --limit=5000 | grep "PO cmg" | grep -oP 'cmg[a-z0-9]+' | sort | uniq -c | sort -rn | head -20

# Check specific PO processing
vercel logs | grep "cmgmui2be0001l504p29b1sjy"
```

---

## 📈 Expected Timeline

### Immediate (First 5 minutes)
- ✅ Transactions should complete in <5s
- ✅ Detailed timing logs should appear
- ✅ Lock contention should decrease

### Short-term (First hour)
- ✅ No more 180s transaction timeouts
- ✅ Error rate should drop to <5%
- ✅ Workflow queue should process smoothly

### Long-term (First 24 hours)
- ✅ System stability
- ✅ Consistent transaction times
- ✅ Rare conflict resolution needed
- ✅ No transaction timeout errors

---

## 🚨 Escalation Triggers

### Call for Help If:

1. **Still seeing 180s+ transactions**
   - Fix didn't work - something else is slow
   - Check per-step timing to find bottleneck
   
2. **High conflict resolution rate (>20%)**
   - Duplicate PO number problem
   - Need to investigate data quality
   
3. **Transaction timeout at 10s happening frequently (>10%)**
   - Something legitimately slow
   - May need to increase timeout temporarily
   - But MUST identify what's slow and fix it
   
4. **Excessive lock contention (>50 waits per PO)**
   - Duplicate workflow detection not working
   - Need to fix cron job deduplication

---

## 📝 Success Criteria

### The fix is successful if:

- [x] Transaction duration: <5s average ✅
- [x] Conflict resolution: <5% frequency ✅
- [x] Error rate: <5% ✅
- [x] Lock contention: Minimal (<10 waits per PO) ✅
- [x] No 180s transaction timeouts ✅
- [x] System processing workflows smoothly ✅

### If all criteria met after 24 hours:
🎉 **SUCCESS!** Transaction timeout issue resolved!

### If any criteria not met:
⚠️ **INVESTIGATE** using the troubleshooting commands above
