# Vercel Environment Variables Setup Guide

**Purpose:** Add required feature flags to Vercel production environment for Phase 2 fuzzy matching migration.

---

## Required Variables

Add these 3 new environment variables to your Vercel project:

### 1. USE_PG_TRGM_FUZZY_MATCHING

**Value:** `false`  
**Scope:** Production, Preview, Development  
**Description:** Master switch for pg_trgm fuzzy matching engine

```
Name: USE_PG_TRGM_FUZZY_MATCHING
Value: false
```

**Purpose:**
- Controls whether to use pg_trgm (fast) or JavaScript (proven) engine
- Set to `false` initially for safety
- Change to `true` after successful gradual rollout (Week 4)

---

### 2. PG_TRGM_ROLLOUT_PERCENTAGE

**Value:** `0`  
**Scope:** Production, Preview, Development  
**Description:** Percentage of requests using pg_trgm (0-100)

```
Name: PG_TRGM_ROLLOUT_PERCENTAGE
Value: 0
```

**Purpose:**
- Enables gradual rollout (A/B testing)
- 0 = 0% using pg_trgm (all use JavaScript)
- Increase weekly: 5 → 25 → 50 → 100

**Rollout Schedule:**
- Week 1: Set to `5` (5% canary)
- Week 2: Set to `25` (25% rollout)
- Week 3: Set to `50` (50% rollout)
- Week 4: Set `USE_PG_TRGM_FUZZY_MATCHING=true` (100%)

---

### 3. ENABLE_PERFORMANCE_MONITORING

**Value:** `true`  
**Scope:** Production, Preview, Development  
**Description:** Enable database-persisted performance metrics

```
Name: ENABLE_PERFORMANCE_MONITORING
Value: true
```

**Purpose:**
- Tracks performance metrics for both engines
- Stores metrics in PostgreSQL for analysis
- Required for rollout monitoring

---

## How to Add Variables in Vercel

### Method 1: Vercel Dashboard (Recommended)

1. **Go to Vercel Dashboard**
   - Visit https://vercel.com/dashboard
   - Select your project (shopify-po-sync-pro or similar)

2. **Navigate to Settings**
   - Click "Settings" in the top menu
   - Click "Environment Variables" in the left sidebar

3. **Add First Variable**
   - Click "Add New" button
   - Name: `USE_PG_TRGM_FUZZY_MATCHING`
   - Value: `false`
   - Environments: Check ✓ Production, ✓ Preview, ✓ Development
   - Click "Save"

4. **Add Second Variable**
   - Click "Add New" button
   - Name: `PG_TRGM_ROLLOUT_PERCENTAGE`
   - Value: `0`
   - Environments: Check ✓ Production, ✓ Preview, ✓ Development
   - Click "Save"

5. **Add Third Variable**
   - Click "Add New" button
   - Name: `ENABLE_PERFORMANCE_MONITORING`
   - Value: `true`
   - Environments: Check ✓ Production, ✓ Preview, ✓ Development
   - Click "Save"

6. **Redeploy**
   - Go to "Deployments" tab
   - Click "..." menu on latest deployment
   - Click "Redeploy"
   - Wait for deployment to complete (~1-2 minutes)

---

### Method 2: Vercel CLI

```powershell
# Install Vercel CLI (if not installed)
npm i -g vercel

# Login to Vercel
vercel login

# Add environment variables
vercel env add USE_PG_TRGM_FUZZY_MATCHING production
# Enter value: false

vercel env add PG_TRGM_ROLLOUT_PERCENTAGE production
# Enter value: 0

vercel env add ENABLE_PERFORMANCE_MONITORING production
# Enter value: true

# Add to preview and development environments
vercel env add USE_PG_TRGM_FUZZY_MATCHING preview
# Enter value: false

vercel env add PG_TRGM_ROLLOUT_PERCENTAGE preview
# Enter value: 0

vercel env add ENABLE_PERFORMANCE_MONITORING preview
# Enter value: true

# Redeploy
vercel --prod
```

---

### Method 3: Import from .env file

If you have a `.env.production.vercel` file:

```powershell
# Create file with all variables
cat > .env.production.vercel @"
USE_PG_TRGM_FUZZY_MATCHING=false
PG_TRGM_ROLLOUT_PERCENTAGE=0
ENABLE_PERFORMANCE_MONITORING=true
"@

# Import to Vercel
vercel env pull .env.vercel.local
# Manually copy from .env.production.vercel to Vercel dashboard
```

---

## Verification

### Check Variables are Set

**Via Vercel Dashboard:**
1. Go to Settings → Environment Variables
2. Verify all 3 variables are listed
3. Check they're enabled for Production

**Via Vercel CLI:**
```powershell
vercel env ls
```

Expected output:
```
Environment Variables
┌────────────────────────────────────┬─────────────────────┬──────────────┐
│ Name                               │ Value               │ Environments │
├────────────────────────────────────┼─────────────────────┼──────────────┤
│ USE_PG_TRGM_FUZZY_MATCHING         │ false               │ Production   │
│ PG_TRGM_ROLLOUT_PERCENTAGE         │ 0                   │ Production   │
│ ENABLE_PERFORMANCE_MONITORING      │ true                │ Production   │
│ DATABASE_URL                       │ postgresql://...    │ Production   │
│ DIRECT_URL                         │ postgresql://...    │ Production   │
│ ... (other variables)              │                     │              │
└────────────────────────────────────┴─────────────────────┴──────────────┘
```

### Test in Production

After deployment, verify feature flags are working:

```powershell
# Check feature flag status
node manage-feature-flags.js status

# Expected output:
# Feature Flags Status:
# ----------------------
# Master Switch (USE_PG_TRGM_FUZZY_MATCHING): false
# Rollout Percentage: 0%
# Engine: JavaScript (100%)
```

### Verify Performance Monitoring

After some supplier matching activity:

```powershell
# Check if metrics are being recorded
node analyze-performance.js adoption

# Expected output:
# Total Operations: 100+
# JavaScript: 100 (100%)
# pg_trgm: 0 (0%)
```

---

## Existing Variables to Verify

Ensure these are also set correctly:

### DATABASE_URL
```
postgresql://postgres.xxxxx:xxxxx@aws-1-ca-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=50
```
- Must use port **6543** (transaction pooler)
- Must include `pgbouncer=true`
- This is for runtime queries

### DIRECT_URL
```
postgresql://postgres.xxxxx:xxxxx@aws-1-ca-central-1.pooler.supabase.com:5432/postgres
```
- Must use port **5432** (direct connection)
- This is for migrations only

### Other Important Variables
- `REDIS_URL` - Redis connection string
- `OPENAI_API_KEY` - OpenAI API key
- `SHOPIFY_API_KEY` - Shopify app credentials
- `SHOPIFY_API_SECRET` - Shopify app secret
- `SESSION_SECRET` - Session encryption key
- `JWT_SECRET` - JWT signing key

---

## Troubleshooting

### Issue: Variables not showing in app

**Solution:**
1. Verify variables are set for correct environment (Production)
2. Redeploy application
3. Check deployment logs for errors
4. Wait 1-2 minutes for cache to clear

### Issue: Feature flags not working

**Solution:**
```powershell
# Check if variables are loaded
node -e "console.log(process.env.USE_PG_TRGM_FUZZY_MATCHING)"
# Should output: false

# If undefined, variables not loaded
# Redeploy and wait for cache clear
```

### Issue: Deployment fails after adding variables

**Solution:**
1. Check variable names are spelled correctly
2. Check values are valid (no quotes needed in Vercel)
3. Review deployment logs for specific error
4. Verify DATABASE_URL and DIRECT_URL are still valid

---

## Security Notes

- **Never commit sensitive values** to git
- **Use .env.example** for templates only
- **Rotate secrets** periodically
- **Limit access** to Vercel dashboard

---

## Next Steps After Setup

1. ✅ **Verify variables are set** (use verification steps above)
2. ✅ **Deploy to production** (safe mode with pg_trgm disabled)
3. ✅ **Test feature flags** work correctly
4. ✅ **Monitor initial metrics** (should show 100% JavaScript)
5. ⏳ **Begin Week 1 rollout** (set ROLLOUT_PERCENTAGE=5)

---

## Quick Reference

**Safe Initial State (After Setup):**
```
USE_PG_TRGM_FUZZY_MATCHING=false    ← All requests use JavaScript
PG_TRGM_ROLLOUT_PERCENTAGE=0        ← 0% rollout
ENABLE_PERFORMANCE_MONITORING=true  ← Track metrics
```

**Week 1 (5% Canary):**
```
USE_PG_TRGM_FUZZY_MATCHING=false    ← Still using percentage
PG_TRGM_ROLLOUT_PERCENTAGE=5        ← 5% use pg_trgm
ENABLE_PERFORMANCE_MONITORING=true  ← Track metrics
```

**Week 4 (Full Migration):**
```
USE_PG_TRGM_FUZZY_MATCHING=true     ← All requests use pg_trgm
PG_TRGM_ROLLOUT_PERCENTAGE=100      ← 100% rollout (optional, master switch overrides)
ENABLE_PERFORMANCE_MONITORING=true  ← Track metrics
```

**Emergency Rollback:**
```
PG_TRGM_ROLLOUT_PERCENTAGE=0        ← Instant rollback to 0%
# Or
USE_PG_TRGM_FUZZY_MATCHING=false    ← Disable completely
```

---

**Ready to configure production environment!** 🔧
