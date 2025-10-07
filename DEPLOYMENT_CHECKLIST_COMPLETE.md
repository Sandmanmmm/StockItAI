# ✅ Vercel Deployment - Complete Checklist

## 🎯 Current Status

✅ **Completed:**
- [x] Repository pushed to GitHub
- [x] Webhook system implemented
- [x] Production .env file created (`.env.production.vercel`)
- [x] JWT and Session secrets generated
- [x] Import guide created
- [x] Verification script ready

⚠️ **Action Required:**
- [ ] Set up Production Redis (Upstash)
- [ ] Import environment variables to Vercel
- [ ] Deploy to Vercel
- [ ] Update app URLs
- [ ] Test deployment

---

## 📋 Step-by-Step Deployment

### STEP 1: Set Up Redis (5 minutes)

**Why?** Your app needs Redis for queue processing. Current config is localhost.

1. **Go to:** https://upstash.com/
2. **Sign up** for free account
3. **Create Database:**
   - Click "Create Database"
   - Name: `stockit-redis`
   - Type: Select "Global"
   - Click "Create"

4. **Copy Your Credentials:**
   ```
   Endpoint: [copy this] → This is your REDIS_HOST
   Port: 6379
   Password: [copy this] → This is your REDIS_PASSWORD
   ```

5. **Update `.env.production.vercel`:**
   - Open the file
   - Replace `REDIS_HOST` value with your endpoint
   - Replace `REDIS_PASSWORD` with your password
   - Save

**Example:**
```env
REDIS_HOST="divine-cat-12345.upstash.io"
REDIS_PASSWORD="AaBbCcDd123456789XyZ"
```

---

### STEP 2: Import Environment Variables (2 minutes)

**Using Vercel CLI (Recommended):**

```powershell
# Install Vercel CLI (if needed)
npm i -g vercel

# Login
vercel login

# Navigate to project
cd "D:\PO Sync\shopify-po-sync-pro"

# Link to your Vercel project
vercel link

# Import all environment variables
vercel env add .env.production.vercel
```

When prompted:
- Select: **All environments** (Production, Preview, Development)
- Confirm: Yes

**Verify import:**
```powershell
vercel env ls
```

You should see all your variables listed.

---

### STEP 3: Deploy to Vercel (2 minutes)

**Option A: Using CLI**
```powershell
vercel --prod
```

**Option B: Using Dashboard**
1. Go to: https://vercel.com/dashboard
2. Select your **StockIT-AI** project
3. Click: **Deployments** tab
4. Click: **Redeploy**

**Watch the build:**
- Monitor build logs
- Wait for: ✅ "Deployed to Production"
- Copy your production URL

**Example URL:** `https://stockit-ai-abc123.vercel.app`

---

### STEP 4: Update App URLs (3 minutes)

Now that you have your actual Vercel URL, update these variables:

**Via CLI:**
```powershell
# Update VITE_API_URL
vercel env rm VITE_API_URL production
vercel env add VITE_API_URL production
# When prompted, enter: https://your-actual-url.vercel.app

# Update VITE_SHOPIFY_REDIRECT_URI  
vercel env rm VITE_SHOPIFY_REDIRECT_URI production
vercel env add VITE_SHOPIFY_REDIRECT_URI production
# When prompted, enter: https://your-actual-url.vercel.app/api/auth/callback
```

**Via Dashboard:**
1. Settings → Environment Variables
2. Find and edit each variable
3. Update with your actual URL
4. Save

**Redeploy to apply:**
```powershell
vercel --prod
```

---

### STEP 5: Update Shopify Partner Dashboard (2 minutes)

1. **Go to:** https://partners.shopify.com
2. **Navigate to:** Apps → Your App → Configuration
3. **Update URLs:**

   **App URL:**
   ```
   https://your-actual-vercel-url.vercel.app
   ```

   **Allowed redirection URL(s):** (Click "Add URL" for each)
   ```
   https://your-actual-vercel-url.vercel.app/api/auth/callback
   https://your-actual-vercel-url.vercel.app/auth/callback
   ```

4. **Click:** Save (at the top of the page)

---

### STEP 6: Verify Deployment (2 minutes)

**Run verification script:**
```powershell
node verify-vercel-deployment.js https://your-actual-vercel-url.vercel.app
```

**Expected output:**
```
✅ PASSED: Homepage accessible
✅ PASSED: API health check
✅ PASSED: Webhook health check
✅ PASSED: OAuth callback endpoint
✅ PASSED: Frontend assets loading
✅ PASSED: CORS headers configured
✅ PASSED: Webhook endpoints exist

🎉 All tests passed! Your deployment looks good!
```

---

### STEP 7: Test Installation (5 minutes)

1. **Create Development Store** (if you don't have one)
   - https://partners.shopify.com → Stores → Add store

2. **Install Your App:**
   - Partner Dashboard → Apps → Your App
   - Click "Test your app"
   - Select development store
   - Click "Install app"

3. **Verify:**
   - OAuth redirect works
   - App loads successfully
   - Dashboard displays

4. **Check Webhooks:**
   - Shopify Admin → Settings → Notifications → Webhooks
   - You should see 7 webhooks automatically registered:
     - ✅ orders/create
     - ✅ orders/updated
     - ✅ orders/cancelled
     - ✅ products/create
     - ✅ products/update
     - ✅ inventory_levels/update
     - ✅ app/uninstalled

---

### STEP 8: Test Core Features (10 minutes)

**Test 1: Upload PO**
- Go to PO Upload
- Upload a test CSV/PDF
- Verify: File uploads and processing starts

**Test 2: AI Processing**
- Wait for AI to process
- Check: Line items extracted correctly

**Test 3: Shopify Sync**
- Review products
- Click "Sync to Shopify"
- Check Shopify Admin: Products should be created

---

## 🎯 Deployment Checklist

### Pre-Deployment
- [x] Code pushed to GitHub
- [x] Environment file created
- [ ] **Redis set up on Upstash**
- [ ] **Redis credentials in .env file**
- [ ] Environment variables imported to Vercel

### Deployment
- [ ] First deployment completed
- [ ] Production URL obtained
- [ ] App URLs updated in environment variables
- [ ] Redeployed with updated URLs

### Post-Deployment
- [ ] Shopify Partner Dashboard URLs updated
- [ ] Verification script passed all tests
- [ ] App installed on test store
- [ ] Webhooks registered automatically
- [ ] OAuth flow works
- [ ] PO upload works
- [ ] AI processing works
- [ ] Shopify sync works

---

## 📊 Environment Variables Summary

### Total Variables: 25

**✅ Ready (no action needed): 21**
- Database (2)
- Shopify (4)
- AI (2)
- Security (3)
- Google (2)
- Supabase (3)
- Additional Config (5)

**⚠️ Need Action: 4**
- REDIS_HOST (must add Upstash)
- REDIS_PASSWORD (must add Upstash)
- VITE_API_URL (update after deployment)
- VITE_SHOPIFY_REDIRECT_URI (update after deployment)

---

## ⏱️ Time Estimate

| Step | Task | Time |
|------|------|------|
| 1 | Set up Redis | 5 min |
| 2 | Import env variables | 2 min |
| 3 | Deploy to Vercel | 2 min |
| 4 | Update app URLs | 3 min |
| 5 | Update Shopify dashboard | 2 min |
| 6 | Verify deployment | 2 min |
| 7 | Test installation | 5 min |
| 8 | Test core features | 10 min |
| **Total** | **Complete deployment** | **~30 min** |

---

## 🚨 Common Issues & Solutions

### Issue: Build Fails
**Error:** "Cannot find module"
**Solution:** Check package.json dependencies, push changes, redeploy

### Issue: Redis Connection Error
**Error:** "ECONNREFUSED"
**Solution:** Verify Redis credentials are correct, ensure TLS is enabled

### Issue: Database Connection Error
**Error:** "Connection refused"
**Solution:** Check DATABASE_URL is correct, verify Supabase allows Vercel

### Issue: Webhooks Not Registering
**Error:** "Webhook creation failed"
**Solution:** Check SHOPIFY_WEBHOOK_SECRET is set, verify API credentials

### Issue: OAuth Fails
**Error:** "Invalid redirect URI"
**Solution:** Ensure redirect URI in Shopify exactly matches Vercel URL

---

## 📞 Quick Commands

```powershell
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Link project
vercel link

# Import environment variables
vercel env add .env.production.vercel

# Deploy to production
vercel --prod

# View environment variables
vercel env ls

# View deployment logs
vercel logs --follow

# Test deployment
node verify-vercel-deployment.js https://your-url.vercel.app
```

---

## 🎉 Success Criteria

Your deployment is successful when:

✅ All verification tests pass
✅ App installs without errors
✅ Webhooks appear in Shopify Admin
✅ PO upload works
✅ AI processing completes
✅ Products sync to Shopify
✅ No errors in Vercel logs

---

## 📚 Reference Documents

- **Environment Variables:** `.env.production.vercel`
- **Import Guide:** `HOW_TO_IMPORT_ENV_TO_VERCEL.md`
- **Exact Credentials:** `VERCEL_EXACT_CREDENTIALS.md`
- **Full Deployment Guide:** `VERCEL_PRODUCTION_DEPLOYMENT_STEPS.md`
- **Quick Start:** `QUICK_START_VERCEL_DEPLOYMENT.md`

---

## 🚀 Ready to Deploy?

**Start here:**
1. Open this checklist
2. Follow each step in order
3. Check off items as you complete them
4. Don't skip steps!

**First action:** Set up Redis at https://upstash.com/

**Time needed:** 30 minutes total

**Result:** Production-ready Shopify app! 🎉

---

*Checklist created: October 5, 2025*
*All credentials and guides are ready to use*
