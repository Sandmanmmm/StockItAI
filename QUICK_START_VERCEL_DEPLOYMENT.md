# ⚡ Quick Start: Deploy to Vercel in 10 Minutes

Follow these steps in order. Don't skip any step!

---

## 🎯 Prerequisites Checklist

Before starting, make sure you have:

- [x] GitHub repository connected to Vercel
- [ ] Supabase project created (database ready)
- [ ] Redis instance (Upstash or Redis Cloud)
- [ ] OpenAI API key
- [ ] Shopify Partner account with app created

**Don't have these?** See setup guides:
- Supabase: https://supabase.com/dashboard/new
- Upstash Redis: https://upstash.com/
- OpenAI: https://platform.openai.com/api-keys

---

## 🚀 10-Minute Deployment

### Step 1: Configure Build Settings (1 min)
1. Open Vercel Dashboard: https://vercel.com/dashboard
2. Select your **StockIT-AI** project
3. Go to: **Settings** → **General**
4. Set:
   - Framework: **Vite**
   - Build Command: `npm run vercel-build`
   - Output Directory: `dist`
   - Node.js Version: **18.x**
5. Click **Save**

---

### Step 2: Add Environment Variables (5 min)

Go to: **Settings** → **Environment Variables**

#### Copy and fill this template with your actual values:

```env
# 🗄️ Database (from Supabase)
DATABASE_URL=postgresql://postgres.[YOUR-PROJECT]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.[YOUR-PROJECT]:[PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres

# 🛍️ Shopify (from Partner Dashboard)
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_SCOPES=write_products,read_products,write_orders,read_orders,write_inventory,read_inventory,write_customers,read_customers

# 🔴 Redis (from Upstash)
REDIS_HOST=your-redis-host.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_TLS=true

# 🤖 AI (from OpenAI)
OPENAI_API_KEY=sk-proj-your_openai_key
OPENAI_MODEL=gpt-4-turbo

# 🌐 App URLs (leave blank for now, update in Step 4)
VITE_API_URL=
VITE_SHOPIFY_REDIRECT_URI=
```

#### Generate these secrets in PowerShell:
```powershell
# Webhook Secret
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# JWT Secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Session Secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then add:
```env
SHOPIFY_WEBHOOK_SECRET=[paste webhook secret]
JWT_SECRET=[paste JWT secret]
SESSION_SECRET=[paste session secret]
```

**For each variable:**
1. Click **Add New**
2. Enter name and value
3. Check all environments: ✅ Production ✅ Preview ✅ Development
4. Click **Save**

---

### Step 3: Deploy! (2 min)
1. Go to: **Deployments** tab
2. Click: **Redeploy** button
3. Wait for build to complete (watch logs)
4. Look for: ✅ **Deployed to Production**
5. Copy your production URL (e.g., `stockit-ai.vercel.app`)

---

### Step 4: Update URLs (2 min)

#### A. Update Vercel Environment Variables
1. Go back to: **Settings** → **Environment Variables**
2. Edit `VITE_API_URL`:
   - Value: `https://your-actual-url.vercel.app`
3. Edit `VITE_SHOPIFY_REDIRECT_URI`:
   - Value: `https://your-actual-url.vercel.app/api/auth/callback`
4. Click **Save**
5. Go to **Deployments** → **Redeploy** (to apply changes)

#### B. Update Shopify Partner Dashboard
1. Go to: https://partners.shopify.com
2. Click: **Apps** → Your app → **Configuration**
3. Update:
   - **App URL:** `https://your-actual-url.vercel.app`
   - **Allowed redirection URLs:**
     - Add: `https://your-actual-url.vercel.app/api/auth/callback`
     - Add: `https://your-actual-url.vercel.app/auth/callback`
4. Click **Save**

---

### Step 5: Verify Deployment (2 min)

Run verification script locally:
```powershell
node verify-vercel-deployment.js https://your-actual-url.vercel.app
```

**Expected:** All tests pass ✅

If any tests fail, check:
- Vercel logs for errors
- Environment variables are set correctly
- Build completed successfully

---

## 🧪 Test Installation

### Test on Development Store

1. **Create Dev Store** (if needed):
   - https://partners.shopify.com → **Stores** → **Add store**

2. **Install App**:
   - Partner Dashboard → **Apps** → Your app → **Test your app**
   - Select development store
   - Click **Install app**

3. **Verify**:
   - ✅ OAuth redirects work
   - ✅ App loads successfully
   - ✅ Dashboard appears

4. **Check Webhooks Registered**:
   - Shopify Admin → **Settings** → **Notifications** → **Webhooks**
   - Should see 7+ webhooks registered automatically

---

## 🎯 You're Done!

Your app is now live at: `https://your-actual-url.vercel.app`

### What's Working:
- ✅ Production-ready deployment
- ✅ Secure webhook processing
- ✅ Database connected
- ✅ Redis queue processing
- ✅ AI analysis ready
- ✅ Shopify OAuth configured

### Next Steps:
1. **Test core features:**
   - Upload a purchase order
   - Verify AI processing
   - Test Shopify sync

2. **Monitor:**
   - Vercel Dashboard → Logs
   - Supabase → Database tables
   - Check webhook logs

3. **Go Live:**
   - Onboard beta merchants
   - Submit to Shopify App Store (optional)

---

## 🆘 Quick Troubleshooting

**Build fails?**
```powershell
# Check build logs in Vercel dashboard
# Common fix: ensure all dependencies in package.json
```

**Can't connect to database?**
```powershell
# Verify DATABASE_URL in Vercel matches Supabase
# Ensure Supabase allows connections from Vercel
```

**Webhooks not registering?**
```powershell
# Check SHOPIFY_WEBHOOK_SECRET is set in Vercel
# Verify Shopify API credentials are correct
```

**OAuth fails?**
```powershell
# Ensure redirect URI in Shopify matches Vercel URL exactly
# Must be: https://your-url.vercel.app/api/auth/callback
```

---

## 📚 Detailed Guides

For more information, see:
- **Full deployment guide:** `VERCEL_PRODUCTION_DEPLOYMENT_STEPS.md`
- **Environment variables:** `VERCEL_ENV_VARIABLES_CHECKLIST.md`
- **Webhook details:** `WEBHOOK_PRODUCTION_ANALYSIS.md`
- **Complete checklist:** `DEPLOYMENT_CHECKLIST.md`

---

## ⏱️ Time Estimate

- **Step 1:** Build settings - 1 minute
- **Step 2:** Environment variables - 5 minutes
- **Step 3:** Deploy - 2 minutes
- **Step 4:** Update URLs - 2 minutes
- **Step 5:** Verify - 2 minutes

**Total:** ~12 minutes (if you have all credentials ready)

---

## 🎉 Success!

Once all steps are complete:
- Visit your production URL
- Install on a test store
- Start processing purchase orders!

**Questions?** Check the detailed guides in your repository.

---

*Quick Start Guide - StockIT-AI v1.0*
*Last updated: October 5, 2025*
