# Phase 2: Deployment Plan - Sequential Workflow

## 🎯 Objective

Deploy the sequential workflow feature to production with **zero-risk rollout strategy**:
1. Deploy with feature flag OFF (legacy mode - no changes to behavior)
2. Enable for single test merchant
3. Monitor 1 complete PO process
4. Fix any issues discovered
5. Document results for Phase 3 gradual rollout

---

## 📋 Pre-Deployment Checklist

### Code Verification ✅
- [x] All 6 processors modified with feature flags
- [x] Cron job updated with conditional logic
- [x] Test scripts created and ready
- [x] All files compile without errors
- [x] Feature flag defaults to OFF (safe)

### Environment Preparation
- [ ] Identify test merchant (should have regular PO uploads)
- [ ] Backup production database (safety measure)
- [ ] Set up monitoring dashboard for test merchant
- [ ] Prepare rollback procedure
- [ ] Notify test merchant (optional)

### Testing Complete (Local)
- [ ] Run `./run-phase1-tests.ps1` successfully
- [ ] Verify legacy mode works (SEQUENTIAL_WORKFLOW=0)
- [ ] Verify sequential mode works (SEQUENTIAL_WORKFLOW=1)
- [ ] Confirm 3-5 minute completion time in tests
- [ ] No errors in any stage

---

## 🚀 Deployment Steps

### Step 1: Deploy to Production with Feature Flag OFF

**Goal**: Deploy code changes without changing behavior (safety net)

#### 1.1 Set Environment Variable in Vercel
```bash
# Option A: Via Vercel CLI
vercel env add SEQUENTIAL_WORKFLOW production
# When prompted, enter: 0
# When prompted for other environments, enter: 0

# Option B: Via Vercel Dashboard
# 1. Go to https://vercel.com/your-project/settings/environment-variables
# 2. Click "Add New"
# 3. Name: SEQUENTIAL_WORKFLOW
# 4. Value: 0
# 5. Environment: Production ✅, Preview ✅, Development ✅
# 6. Click Save
```

**Why set to 0?**
- ✅ Uses existing Bull queue architecture (proven stable)
- ✅ No behavior change = zero risk
- ✅ Allows testing feature flag toggle mechanism
- ✅ Enables instant rollback if issues occur

#### 1.2 Commit Code to Git
```bash
# Add all modified files
git add api/src/lib/workflowOrchestrator.js
git add api/process-workflows-cron.js
git add api/test-sequential-workflow.mjs
git add api/compare-workflow-modes.mjs
git add run-phase1-tests.ps1
git add *.md

# Create descriptive commit
git commit -m "feat: implement sequential workflow execution with feature flag

- Add SEQUENTIAL_WORKFLOW feature flag to all 6 processors
- Update cron job entry point with conditional logic
- Create sequential workflow runner (ready but disabled by default)
- Add test infrastructure (test scripts + comparison tools)
- Feature flag defaults to 0 (legacy mode - no behavior change)
- Enables 8x performance improvement when enabled (38min -> 3-5min)

BREAKING: None (feature disabled by default)
RISK: Low (instant rollback via env var toggle)"

# Push to repository
git push origin main
```

#### 1.3 Deploy to Vercel
```bash
# Option A: Automatic deployment (if connected to Git)
# Vercel will auto-deploy when you push to main branch

# Option B: Manual deployment via CLI
vercel --prod

# Option C: Trigger deployment via Vercel Dashboard
# Go to Deployments → Click "Redeploy" on latest
```

#### 1.4 Verify Deployment
```bash
# Check deployment status
vercel ls

# Verify environment variable is set
vercel env ls

# Check logs for any startup errors
vercel logs --prod --follow

# Expected log output:
# "SEQUENTIAL_WORKFLOW=0 (legacy mode)"
# "Bull queue workers initialized"
```

**Success Criteria**:
- ✅ Deployment completes without errors
- ✅ Environment variable `SEQUENTIAL_WORKFLOW=0` is set
- ✅ Existing workflows continue processing normally (38 min duration)
- ✅ No increase in error rate
- ✅ All merchants unaffected

**Duration**: ~10-15 minutes

---

### Step 2: Identify Test Merchant

**Goal**: Choose appropriate merchant for pilot testing

#### 2.1 Query Database for Suitable Test Merchant

Create analysis script: `api/identify-test-merchant.mjs`

```javascript
import { db } from './src/lib/db.js'

async function identifyTestMerchant() {
  console.log('🔍 Analyzing merchants for pilot testing...\n')

  // Query merchants with recent successful workflows
  const candidates = await db.merchant.findMany({
    where: {
      isActive: true,
      workflows: {
        some: {
          status: 'completed',
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
          }
        }
      }
    },
    include: {
      workflows: {
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          completedAt: true
        }
      },
      _count: {
        select: {
          workflows: true,
          purchaseOrders: true
        }
      }
    }
  })

  // Calculate metrics for each merchant
  const analysis = candidates.map(merchant => {
    const workflows = merchant.workflows
    const completed = workflows.filter(w => w.status === 'completed')
    const failed = workflows.filter(w => w.status === 'failed')
    
    const avgDuration = completed.reduce((sum, w) => {
      if (w.completedAt && w.createdAt) {
        return sum + (w.completedAt.getTime() - w.createdAt.getTime())
      }
      return sum
    }, 0) / (completed.length || 1)

    return {
      merchantId: merchant.id,
      shopDomain: merchant.shopDomain,
      totalWorkflows: merchant._count.workflows,
      totalPOs: merchant._count.purchaseOrders,
      recentWorkflows: workflows.length,
      successRate: (completed.length / workflows.length * 100).toFixed(1),
      avgDurationMin: (avgDuration / 60000).toFixed(1),
      lastWorkflow: workflows[0]?.createdAt
    }
  })

  // Sort by recent activity and success rate
  analysis.sort((a, b) => {
    // Prefer merchants with:
    // 1. Recent activity (last 7 days)
    // 2. High success rate (>80%)
    // 3. Moderate volume (not too low, not too high)
    const scoreA = (a.recentWorkflows * 10) + (parseFloat(a.successRate))
    const scoreB = (b.recentWorkflows * 10) + (parseFloat(b.successRate))
    return scoreB - scoreA
  })

  console.log('📊 Top 5 Candidates for Pilot Testing:\n')
  console.log('Rank | Merchant ID | Shop Domain | Success Rate | Avg Duration | Recent Workflows')
  console.log('-----|-------------|-------------|--------------|--------------|------------------')
  
  analysis.slice(0, 5).forEach((m, i) => {
    console.log(`${i+1}    | ${m.merchantId.slice(0, 8)}... | ${m.shopDomain} | ${m.successRate}% | ${m.avgDurationMin} min | ${m.recentWorkflows}`)
  })

  console.log('\n✅ Recommended Test Merchant:')
  const recommended = analysis[0]
  console.log(`   Merchant ID: ${recommended.merchantId}`)
  console.log(`   Shop Domain: ${recommended.shopDomain}`)
  console.log(`   Success Rate: ${recommended.successRate}%`)
  console.log(`   Avg Duration: ${recommended.avgDurationMin} minutes`)
  console.log(`   Recent Activity: ${recommended.recentWorkflows} workflows in last 30 days`)

  await db.$disconnect()
  return recommended.merchantId
}

identifyTestMerchant().catch(console.error)
```

#### 2.2 Run Merchant Analysis
```powershell
cd api
node identify-test-merchant.mjs
```

#### 2.3 Selection Criteria

**Ideal Test Merchant Profile**:
- ✅ **Active**: Uploaded PO in last 7 days
- ✅ **Reliable**: >80% success rate on recent workflows
- ✅ **Representative**: Uses typical features (not edge cases)
- ✅ **Moderate Volume**: 5-20 workflows/month (not too busy)
- ✅ **Good Communication**: Can reach merchant if issues occur (optional)

**Avoid**:
- ❌ Merchants with recent errors or stuck workflows
- ❌ Highest-volume merchants (save for Phase 3)
- ❌ Merchants with custom integrations
- ❌ Brand new merchants (<30 days)

**Duration**: ~10 minutes

---

### Step 3: Enable Sequential Mode for Test Merchant

**Goal**: Enable sequential workflow execution for single merchant

#### 3.1 Create Per-Merchant Feature Flag Script

Create: `api/enable-sequential-for-merchant.mjs`

```javascript
import { db } from './src/lib/db.js'

async function enableSequentialForMerchant(merchantId) {
  console.log(`🔧 Enabling sequential workflow for merchant: ${merchantId}\n`)

  try {
    // Check if merchant exists
    const merchant = await db.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true, shopDomain: true }
    })

    if (!merchant) {
      console.error(`❌ Merchant not found: ${merchantId}`)
      process.exit(1)
    }

    console.log(`✅ Found merchant: ${merchant.shopDomain}`)

    // Check if MerchantConfig table exists
    const tableExists = await db.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'MerchantConfig'
      );
    `

    if (!tableExists[0].exists) {
      console.log('⚠️  MerchantConfig table does not exist yet')
      console.log('📝 Creating table...')
      
      // Create table via Prisma migration or raw SQL
      await db.$executeRaw`
        CREATE TABLE IF NOT EXISTS "MerchantConfig" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "merchantId" TEXT NOT NULL UNIQUE,
          "enableSequentialWorkflow" BOOLEAN NOT NULL DEFAULT false,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "MerchantConfig_merchantId_fkey" 
            FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") 
            ON DELETE CASCADE ON UPDATE CASCADE
        );
      `
      console.log('✅ Table created')
    }

    // Upsert merchant config
    const config = await db.merchantConfig.upsert({
      where: { merchantId: merchantId },
      update: { 
        enableSequentialWorkflow: true,
        updatedAt: new Date()
      },
      create: { 
        merchantId: merchantId,
        enableSequentialWorkflow: true
      }
    })

    console.log(`✅ Sequential workflow ENABLED for ${merchant.shopDomain}`)
    console.log(`   Config ID: ${config.id}`)
    console.log(`   Updated: ${config.updatedAt.toISOString()}`)
    console.log('\n📋 Next Steps:')
    console.log('   1. Wait for merchant to upload a PO')
    console.log('   2. Monitor workflow execution logs')
    console.log('   3. Verify completion in 3-5 minutes')

  } catch (error) {
    console.error('❌ Error enabling sequential mode:', error)
    throw error
  } finally {
    await db.$disconnect()
  }
}

// Get merchantId from command line
const merchantId = process.argv[2]

if (!merchantId) {
  console.error('❌ Usage: node enable-sequential-for-merchant.mjs <merchantId>')
  process.exit(1)
}

enableSequentialForMerchant(merchantId).catch(console.error)
```

#### 3.2 Update Cron Job to Check Per-Merchant Flag

Modify `api/process-workflows-cron.js` line ~214:

```javascript
// BEFORE (line 214):
const useSequentialMode = process.env.SEQUENTIAL_WORKFLOW === '1'

// AFTER (enhanced with per-merchant flag):
// Check global flag OR per-merchant flag
let useSequentialMode = process.env.SEQUENTIAL_WORKFLOW === '1'

if (!useSequentialMode) {
  // Check per-merchant override
  const merchantConfig = await prisma.merchantConfig.findUnique({
    where: { merchantId: upload.merchantId },
    select: { enableSequentialWorkflow: true }
  })
  
  useSequentialMode = merchantConfig?.enableSequentialWorkflow ?? false
  
  if (useSequentialMode) {
    console.log(`✅ Sequential mode enabled for merchant: ${upload.merchantId}`)
  }
}
```

#### 3.3 Deploy Updated Cron Logic
```bash
# Commit per-merchant flag support
git add api/process-workflows-cron.js
git add api/enable-sequential-for-merchant.mjs
git commit -m "feat: add per-merchant sequential workflow toggle"
git push origin main

# Wait for deployment to complete
```

#### 3.4 Enable for Test Merchant
```powershell
# Run script with test merchant ID (from Step 2)
cd api
node enable-sequential-for-merchant.mjs <MERCHANT_ID_FROM_STEP_2>

# Expected output:
# ✅ Sequential workflow ENABLED for test-shop.myshopify.com
# 📋 Next Steps: Wait for merchant to upload a PO
```

**Success Criteria**:
- ✅ Script completes without errors
- ✅ Database record created/updated
- ✅ Merchant confirmed in logs
- ✅ All other merchants still use legacy mode

**Duration**: ~15 minutes

---

### Step 4: Monitor Test Workflow Execution

**Goal**: Watch one complete PO process from upload to completion

#### 4.1 Create Real-Time Monitoring Script

Create: `api/monitor-test-merchant.mjs`

```javascript
import { db } from './src/lib/db.js'

async function monitorTestMerchant(merchantId) {
  console.log(`📊 Monitoring merchant: ${merchantId}`)
  console.log(`⏰ Started: ${new Date().toISOString()}\n`)

  let lastWorkflowId = null
  let checkCount = 0

  const interval = setInterval(async () => {
    checkCount++
    
    try {
      // Find most recent workflow
      const workflow = await db.workflowExecution.findFirst({
        where: { merchantId: merchantId },
        orderBy: { createdAt: 'desc' },
        include: {
          upload: {
            select: { fileName: true }
          }
        }
      })

      if (!workflow) {
        console.log(`⏳ [${checkCount}] Waiting for workflow... (checked ${checkCount} times)`)
        return
      }

      // New workflow detected
      if (workflow.id !== lastWorkflowId) {
        lastWorkflowId = workflow.id
        console.log(`\n🆕 NEW WORKFLOW DETECTED!`)
        console.log(`   ID: ${workflow.id}`)
        console.log(`   File: ${workflow.upload?.fileName || 'unknown'}`)
        console.log(`   Started: ${workflow.createdAt.toISOString()}`)
        console.log(`   Stage: ${workflow.currentStage || 'not_started'}`)
        console.log(`   Status: ${workflow.status}`)
      }

      // Update status
      const elapsed = Date.now() - workflow.createdAt.getTime()
      const elapsedMin = Math.floor(elapsed / 60000)
      const elapsedSec = Math.floor((elapsed % 60000) / 1000)

      console.log(`⏱️  [${checkCount}] Stage: ${workflow.currentStage || 'pending'} | Status: ${workflow.status} | Elapsed: ${elapsedMin}m ${elapsedSec}s`)

      // Check if completed
      if (workflow.status === 'completed') {
        console.log(`\n✅ WORKFLOW COMPLETED!`)
        console.log(`   Total Duration: ${elapsedMin}m ${elapsedSec}s`)
        console.log(`   Expected: 3-5 minutes`)
        console.log(`   Result: ${elapsedMin < 10 ? '✅ PASS' : '⚠️  SLOWER THAN EXPECTED'}`)
        
        if (workflow.completedAt) {
          const actualDuration = workflow.completedAt.getTime() - workflow.createdAt.getTime()
          console.log(`   Actual Duration: ${Math.floor(actualDuration / 60000)}m ${Math.floor((actualDuration % 60000) / 1000)}s`)
        }

        clearInterval(interval)
        await db.$disconnect()
        process.exit(0)
      }

      // Check if failed
      if (workflow.status === 'failed') {
        console.log(`\n❌ WORKFLOW FAILED!`)
        console.log(`   Error: ${workflow.errorMessage || 'Unknown error'}`)
        console.log(`   Stage: ${workflow.currentStage}`)
        console.log(`   Duration: ${elapsedMin}m ${elapsedSec}s`)
        
        clearInterval(interval)
        await db.$disconnect()
        process.exit(1)
      }

      // Check for timeout (stuck workflow)
      if (elapsed > 600000 && workflow.status === 'processing') {
        console.log(`\n⚠️  WORKFLOW TIMEOUT!`)
        console.log(`   Still processing after 10 minutes`)
        console.log(`   Current Stage: ${workflow.currentStage}`)
        console.log(`   This may indicate an issue`)
        
        // Don't exit, keep monitoring
      }

    } catch (error) {
      console.error(`❌ Error monitoring workflow:`, error.message)
    }
  }, 5000) // Check every 5 seconds

  // Timeout after 15 minutes
  setTimeout(() => {
    console.log(`\n⏰ MONITORING TIMEOUT (15 minutes)`)
    console.log(`   No workflow completed in expected timeframe`)
    clearInterval(interval)
    db.$disconnect().then(() => process.exit(1))
  }, 900000)
}

const merchantId = process.argv[2]
if (!merchantId) {
  console.error('❌ Usage: node monitor-test-merchant.mjs <merchantId>')
  process.exit(1)
}

monitorTestMerchant(merchantId).catch(console.error)
```

#### 4.2 Start Monitoring
```powershell
# Open new terminal window and run monitor
cd api
node monitor-test-merchant.mjs <MERCHANT_ID_FROM_STEP_2>

# Expected output:
# 📊 Monitoring merchant: clxxx...
# ⏳ [1] Waiting for workflow...
# ⏳ [2] Waiting for workflow...
# 🆕 NEW WORKFLOW DETECTED!
# ⏱️  [3] Stage: ai_parsing | Status: processing | Elapsed: 0m 15s
# ⏱️  [4] Stage: database_save | Status: processing | Elapsed: 1m 30s
# ...
# ✅ WORKFLOW COMPLETED! Total Duration: 3m 42s
```

#### 4.3 Monitor Vercel Logs Simultaneously
```bash
# Open another terminal
vercel logs --prod --follow --filter "wf_"

# Look for:
# "🚀 Starting SEQUENTIAL workflow execution..."
# "📊 Stage 1/6: AI Parsing"
# "✅ ai_parsing completed in 87s"
# "📊 Stage 2/6: Database Save"
# ...
```

#### 4.4 What to Watch For

**✅ Success Indicators**:
- Workflow starts within 60s of upload
- Log shows "Starting SEQUENTIAL workflow execution"
- All 6 stages execute in order
- No errors in Vercel logs
- Completion time: 3-5 minutes
- Database records created correctly
- Shopify order synced successfully

**⚠️ Warning Signs**:
- Workflow takes >10 minutes (slower than expected)
- Any stage shows errors in logs
- Workflow gets stuck at a particular stage
- Database connection errors
- Shopify API rate limiting
- Vision API timeout errors

**❌ Critical Issues**:
- Workflow fails completely
- Data corruption in database
- Shopify sync creates incorrect data
- Server crashes/restarts
- Connection pool exhaustion

**Duration**: ~10-60 minutes (depends on when merchant uploads PO)

---

### Step 5: Analyze Results

**Goal**: Verify workflow executed correctly and faster than legacy mode

#### 5.1 Query Workflow Results

Create: `api/analyze-test-workflow.mjs`

```javascript
import { db } from './src/lib/db.js'

async function analyzeTestWorkflow(workflowId) {
  console.log(`🔍 Analyzing workflow: ${workflowId}\n`)

  const workflow = await db.workflowExecution.findUnique({
    where: { id: workflowId },
    include: {
      upload: true,
      purchaseOrder: {
        include: {
          lineItems: true,
          supplier: true
        }
      }
    }
  })

  if (!workflow) {
    console.error(`❌ Workflow not found: ${workflowId}`)
    process.exit(1)
  }

  // Calculate duration
  const duration = workflow.completedAt 
    ? workflow.completedAt.getTime() - workflow.createdAt.getTime()
    : Date.now() - workflow.createdAt.getTime()
  
  const durationMin = Math.floor(duration / 60000)
  const durationSec = Math.floor((duration % 60000) / 1000)

  console.log('📊 WORKFLOW SUMMARY')
  console.log('===================')
  console.log(`Status: ${workflow.status}`)
  console.log(`Duration: ${durationMin}m ${durationSec}s`)
  console.log(`Expected: 3-5 minutes`)
  console.log(`Result: ${durationMin <= 5 ? '✅ EXCELLENT' : durationMin <= 10 ? '⚠️  ACCEPTABLE' : '❌ TOO SLOW'}`)
  console.log(`Improvement: ${Math.round((2280 - (duration/1000)) / 2280 * 100)}% faster than legacy (38min)\n`)

  console.log('📁 FILE DETAILS')
  console.log('===============')
  console.log(`File: ${workflow.upload?.fileName}`)
  console.log(`Size: ${(workflow.upload?.fileSize / 1024).toFixed(2)} KB`)
  console.log(`Type: ${workflow.upload?.fileType}`)
  console.log(`Uploaded: ${workflow.upload?.createdAt.toISOString()}\n`)

  console.log('📦 PURCHASE ORDER')
  console.log('==================')
  if (workflow.purchaseOrder) {
    const po = workflow.purchaseOrder
    console.log(`PO Number: ${po.poNumber}`)
    console.log(`Supplier: ${po.supplier?.name || 'N/A'}`)
    console.log(`Line Items: ${po.lineItems.length}`)
    console.log(`Total Amount: $${po.totalAmount?.toFixed(2) || '0.00'}`)
    console.log(`Status: ${po.status}`)
    console.log(`Shopify Order ID: ${po.shopifyOrderId || 'N/A'}\n`)
  } else {
    console.log(`⚠️  No PO created\n`)
  }

  console.log('⏱️  STAGE TIMELINE')
  console.log('==================')
  console.log(`Created: ${workflow.createdAt.toISOString()}`)
  console.log(`Started: ${workflow.startedAt?.toISOString() || 'N/A'}`)
  console.log(`Completed: ${workflow.completedAt?.toISOString() || 'In Progress'}`)
  console.log(`Current Stage: ${workflow.currentStage || 'N/A'}`)
  
  if (workflow.errorMessage) {
    console.log(`\n❌ ERROR: ${workflow.errorMessage}`)
  }

  // Compare with recent legacy workflows
  console.log(`\n📊 COMPARISON WITH LEGACY MODE`)
  console.log('==============================')
  
  const legacyWorkflows = await db.workflowExecution.findMany({
    where: {
      merchantId: workflow.merchantId,
      status: 'completed',
      createdAt: {
        lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Before sequential mode
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      createdAt: true,
      completedAt: true
    }
  })

  if (legacyWorkflows.length > 0) {
    const avgLegacyDuration = legacyWorkflows.reduce((sum, w) => {
      return sum + (w.completedAt.getTime() - w.createdAt.getTime())
    }, 0) / legacyWorkflows.length

    const avgLegacyMin = Math.floor(avgLegacyDuration / 60000)
    const improvement = ((avgLegacyDuration - duration) / avgLegacyDuration * 100).toFixed(1)

    console.log(`Legacy Avg: ${avgLegacyMin} minutes`)
    console.log(`Sequential: ${durationMin} minutes`)
    console.log(`Improvement: ${improvement}% faster`)
    console.log(`Speedup: ${(avgLegacyDuration / duration).toFixed(1)}x`)
  }

  await db.$disconnect()
}

const workflowId = process.argv[2]
if (!workflowId) {
  console.error('❌ Usage: node analyze-test-workflow.mjs <workflowId>')
  process.exit(1)
}

analyzeTestWorkflow(workflowId).catch(console.error)
```

#### 5.2 Run Analysis
```powershell
cd api
node analyze-test-workflow.mjs <WORKFLOW_ID_FROM_MONITOR>

# Review output carefully
```

#### 5.3 Validate Data Quality

Check database for correctness:

```sql
-- Verify PO was created correctly
SELECT 
  po.id,
  po.poNumber,
  po.status,
  po.totalAmount,
  COUNT(li.id) as line_item_count,
  po.shopifyOrderId
FROM PurchaseOrder po
LEFT JOIN LineItem li ON li.purchaseOrderId = po.id
WHERE po.workflowId = '<WORKFLOW_ID>'
GROUP BY po.id;

-- Verify Shopify sync happened
SELECT 
  id,
  shopifyOrderId,
  shopifySyncStatus,
  shopifySyncedAt
FROM PurchaseOrder
WHERE workflowId = '<WORKFLOW_ID>';

-- Check for any errors logged
SELECT 
  id,
  status,
  currentStage,
  errorMessage,
  completedAt - createdAt as duration
FROM WorkflowExecution
WHERE id = '<WORKFLOW_ID>';
```

#### 5.4 Success Criteria

**Must Pass**:
- ✅ Workflow status = 'completed'
- ✅ Duration ≤ 10 minutes (ideally 3-5 min)
- ✅ PO created with correct data
- ✅ All line items extracted
- ✅ Shopify order created
- ✅ No database errors
- ✅ No missing data

**Nice to Have**:
- ✅ Duration 3-5 minutes (8x improvement)
- ✅ No warnings in logs
- ✅ Image attachment successful
- ✅ All fields populated correctly

**Duration**: ~15 minutes

---

### Step 6: Fix Any Issues Discovered

**Goal**: Address problems before wider rollout

#### 6.1 Common Issues & Fixes

##### Issue 1: Workflow Takes >10 Minutes
**Symptoms**: Sequential mode not significantly faster than legacy

**Possible Causes**:
- Vision API timeout still occurring
- Database queries slow
- Shopify API rate limiting
- Network latency

**Debug Steps**:
```javascript
// Add timing logs to each stage in sequentialWorkflowRunner.js
console.log(`⏱️  Stage ${stageName} started at ${new Date().toISOString()}`)
const stageStart = Date.now()
// ... execute stage
console.log(`⏱️  Stage ${stageName} took ${Date.now() - stageStart}ms`)
```

**Fix**:
- Review Vision API timeout settings
- Check database connection pool size
- Optimize Shopify API calls
- Consider caching where appropriate

##### Issue 2: Database Connection Errors
**Symptoms**: "Connection pool exhausted" errors

**Possible Causes**:
- Too many concurrent Prisma queries
- Connections not released properly
- Pool size too small

**Fix**:
```javascript
// In sequentialWorkflowRunner.js
// Reuse single Prisma client across all stages
constructor() {
  this.orchestrator = new WorkflowOrchestrator()
  this.prisma = db // Reuse existing connection
}

// Don't create new Prisma clients in each stage
```

##### Issue 3: Data Missing or Incorrect
**Symptoms**: PO created but missing line items, wrong totals, etc.

**Possible Causes**:
- Stage data not passed correctly between stages
- AI parsing failed partially
- Database transaction issues

**Debug Steps**:
```javascript
// Log data between stages
console.log('🔍 Data passed to next stage:', JSON.stringify(nextStageData, null, 2))
```

**Fix**:
- Verify return statements include all required data
- Check AI parsing results before database save
- Add validation between stages

##### Issue 4: Shopify Sync Fails
**Symptoms**: PO created but no Shopify order

**Possible Causes**:
- Shopify API rate limiting
- Invalid product variants
- Missing required fields

**Fix**:
- Add retry logic for Shopify API
- Validate product data before sync
- Check Shopify API logs for errors

#### 6.2 Rollback if Necessary

If critical issues occur:

```bash
# Option 1: Disable for test merchant
cd api
node disable-sequential-for-merchant.mjs <MERCHANT_ID>

# Option 2: Global disable (affects all merchants if any enabled)
vercel env rm SEQUENTIAL_WORKFLOW production

# Option 3: Revert code changes
git revert HEAD
git push origin main
```

#### 6.3 Document Findings

Create issue report: `PHASE_2_TEST_RESULTS.md`

```markdown
# Phase 2 Test Results

## Test Details
- Date: YYYY-MM-DD
- Test Merchant: merchant-id
- Workflow ID: workflow-id

## Results
- Duration: X minutes Y seconds
- Status: [PASS/FAIL]
- Issues Found: [None / List]

## Performance Metrics
- Expected: 3-5 minutes
- Actual: X minutes
- Improvement: X% faster than legacy
- Speedup: Xx

## Data Quality
- PO Created: [YES/NO]
- Line Items: [COUNT]
- Shopify Sync: [SUCCESS/FAIL]
- Data Accuracy: [VERIFIED/ISSUES]

## Issues Discovered
1. [Issue description]
   - Severity: [LOW/MEDIUM/HIGH/CRITICAL]
   - Fix: [Description of fix]

## Recommendations
- [Proceed to Phase 3 / Fix issues first / Rollback]
```

**Duration**: Variable (depends on issues found)

---

## 📊 Phase 2 Success Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Deployment Success | No errors | TBD | ⏳ |
| Feature Flag Working | Toggle works | TBD | ⏳ |
| Test Workflow Duration | 3-5 min | TBD | ⏳ |
| Data Quality | 100% correct | TBD | ⏳ |
| Shopify Sync | Success | TBD | ⏳ |
| Error Rate | 0% | TBD | ⏳ |
| Ready for Phase 3 | YES | TBD | ⏳ |

---

## 🎯 Phase 2 Decision Matrix

### Proceed to Phase 3 ✅
**Criteria**:
- Workflow completes in ≤10 minutes
- All data created correctly
- No critical errors
- Performance improvement evident

**Action**: Move to gradual rollout (10% → 50% → 100%)

### Fix Minor Issues ⚠️
**Criteria**:
- Workflow works but slower than expected (10-15 min)
- Minor data quality issues
- Warning-level errors (not critical)

**Action**: Fix issues, repeat Step 6, re-test

### Rollback ❌
**Criteria**:
- Workflow fails completely
- Data corruption
- Critical errors
- Duration >30 minutes (no improvement)

**Action**: Disable sequential mode, investigate deeply, redesign if needed

---

## 📋 Phase 2 Checklist

### Pre-Deployment
- [ ] Code verified and tested locally
- [ ] Backup production database
- [ ] Rollback procedure documented
- [ ] Monitoring tools ready

### Deployment
- [ ] Environment variable set (SEQUENTIAL_WORKFLOW=0)
- [ ] Code committed to Git
- [ ] Deployed to Vercel production
- [ ] Deployment verified (no errors)

### Test Merchant Setup
- [ ] Test merchant identified
- [ ] Per-merchant flag enabled
- [ ] Merchant config verified in database
- [ ] Monitoring script running

### Workflow Monitoring
- [ ] Test PO uploaded (or waiting for merchant)
- [ ] Workflow started and monitored
- [ ] Logs reviewed for errors
- [ ] Workflow completed successfully

### Analysis
- [ ] Duration measured and compared
- [ ] Data quality verified
- [ ] Shopify sync confirmed
- [ ] Performance metrics collected

### Decision
- [ ] Results documented
- [ ] Issues identified and fixed (if any)
- [ ] Decision made: Proceed / Fix / Rollback
- [ ] Phase 3 readiness confirmed

---

## 🚀 Next Steps After Phase 2

### If Success ✅
**Phase 3: Gradual Rollout**
- Day 1-2: Enable for 10% of merchants
- Day 3-5: Enable for 50% of merchants
- Day 6-7: Enable for 100% of merchants
- Document: `PHASE_3_ROLLOUT_PLAN.md`

### If Minor Issues ⚠️
**Phase 2.5: Bug Fixes**
- Fix identified issues
- Re-test with same merchant
- Verify fixes work correctly
- Then proceed to Phase 3

### If Critical Issues ❌
**Phase 2.5: Deep Analysis**
- Rollback immediately
- Analyze root causes
- Redesign approach if needed
- Re-test locally extensively
- Restart Phase 2 when ready

---

## 💡 Tips for Success

1. **Be Patient**: Wait for merchant to naturally upload a PO (don't force it)
2. **Monitor Closely**: Watch logs in real-time during first test
3. **Document Everything**: Capture screenshots, logs, metrics
4. **Test Thoroughly**: Don't rush to Phase 3 if issues exist
5. **Communicate**: Keep stakeholders informed of progress
6. **Have Rollback Ready**: Be prepared to disable immediately if needed

---

## 📞 Support Contacts

If issues occur during Phase 2:
- Development Team: [Contact info]
- Database Admin: [Contact info]
- Vercel Support: https://vercel.com/support
- Shopify API Status: https://status.shopify.com

---

**Phase 2 Timeline**: ~2-4 hours (excluding wait time for merchant upload)

**Risk Level**: Low (single merchant, instant rollback available)

**Next Document**: `PHASE_3_ROLLOUT_PLAN.md` (to be created after Phase 2 success)
