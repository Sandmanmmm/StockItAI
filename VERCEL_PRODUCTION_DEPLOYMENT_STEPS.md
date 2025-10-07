# 🚀 Vercel Production Deployment - Exact Steps

## Current Status
✅ Repository connected to Vercel
✅ Code pushed to GitHub (https://github.com/Sandmanmmm/StockIT-AI.git)

---

## Step-by-Step Deployment Guide

### STEP 1: Configure Build Settings in Vercel

1. **Go to your project in Vercel dashboard**
   - Navigate to: https://vercel.com/dashboard
   - Select your `StockIT-AI` project

2. **Configure Build & Development Settings**
   - Go to: **Settings** → **General**
   
   **Framework Preset:** Vite
   
   **Build Command:**
   ```
   npm run vercel-build
   ```
   
   **Output Directory:**
   ```
   dist
   ```
   
   **Install Command:**
   ```
   npm install
   ```
   
   **Root Directory:** `.` (leave as root)

3. **Node.js Version**
   - Go to: **Settings** → **General** → **Node.js Version**
   - Select: **18.x** (recommended) or **20.x**

---

### STEP 2: Configure Environment Variables

Go to: **Settings** → **Environment Variables**

Click **Add New** and add each of these variables:

#### 🗄️ Database (Required)
```
Name: DATABASE_URL
Value: [Your Supabase connection string from Supabase Dashboard → Settings → Database → Connection String → Transaction]
Environments: Production, Preview, Development
```

```
Name: DIRECT_URL
Value: [Your Supabase connection string from Supabase Dashboard → Settings → Database → Connection String → Session]
Environments: Production, Preview, Development
```

#### 🛍️ Shopify (Required)
```
Name: SHOPIFY_API_KEY
Value: [From Shopify Partner Dashboard → Your App → Configuration]
Environments: Production, Preview, Development
```

```
Name: SHOPIFY_API_SECRET
Value: [From Shopify Partner Dashboard → Your App → Configuration]
Environments: Production, Preview, Development
```

```
Name: SHOPIFY_SCOPES
Value: write_products,read_products,write_orders,read_orders,write_inventory,read_inventory,write_customers,read_customers
Environments: Production, Preview, Development
```

```
Name: SHOPIFY_WEBHOOK_SECRET
Value: [Check your local api/.env file OR generate new one - see below]
Environments: Production, Preview, Development
```

**To get your webhook secret from local .env:**
```powershell
# In PowerShell, run:
Get-Content api/.env | Select-String "SHOPIFY_WEBHOOK_SECRET"
```

**OR generate a new one:**
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

#### 🔴 Redis (Required)
```
Name: REDIS_HOST
Value: [Your Redis host - e.g., from Upstash or Redis Cloud]
Environments: Production, Preview, Development
```

```
Name: REDIS_PORT
Value: 6379
Environments: Production, Preview, Development
```

```
Name: REDIS_PASSWORD
Value: [Your Redis password]
Environments: Production, Preview, Development
```

```
Name: REDIS_TLS
Value: true
Environments: Production, Preview, Development
```

#### 🤖 AI Services (Required)
```
Name: OPENAI_API_KEY
Value: [Your OpenAI API key from platform.openai.com]
Environments: Production, Preview, Development
```

```
Name: OPENAI_MODEL
Value: gpt-4-turbo
Environments: Production, Preview, Development
```

#### 🔒 Security (Required)
Generate these using PowerShell:
```powershell
# JWT Secret (copy output)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Session Secret (copy output)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then add to Vercel:
```
Name: JWT_SECRET
Value: [Paste the JWT secret you generated]
Environments: Production, Preview, Development
```

```
Name: SESSION_SECRET
Value: [Paste the session secret you generated]
Environments: Production, Preview, Development
```

#### 🌐 App URLs (Required - will update after first deployment)
```
Name: VITE_API_URL
Value: https://your-project-name.vercel.app
Environments: Production, Preview, Development
```

```
Name: VITE_SHOPIFY_REDIRECT_URI
Value: https://your-project-name.vercel.app/api/auth/callback
Environments: Production, Preview, Development
```

**Note:** After your first deployment, Vercel will give you the actual URL. Come back and update these values.

#### 🔍 Google Search (Optional - for image search feature)
```
Name: GOOGLE_SEARCH_API_KEY
Value: [Your Google API key - optional]
Environments: Production, Preview, Development
```

```
Name: GOOGLE_SEARCH_ENGINE_ID
Value: [Your search engine ID - optional]
Environments: Production, Preview, Development
```

---

### STEP 3: Deploy!

1. **Trigger Deployment**
   - Go to: **Deployments** tab
   - Click: **Redeploy** (if already deployed) OR
   - Push a commit to trigger auto-deploy

2. **Wait for Build**
   - Watch the build logs in real-time
   - Deployment typically takes 2-5 minutes
   - Check for any errors in the logs

3. **Get Your Production URL**
   - Once deployed, you'll see: `✅ Deployed to Production`
   - Copy your production URL (e.g., `stockit-ai.vercel.app`)

---

### STEP 4: Update App URLs (Critical!)

Now that you have your Vercel URL, update these:

#### A. Update Vercel Environment Variables
1. Go back to: **Settings** → **Environment Variables**
2. Update these two variables with your actual URL:
   - `VITE_API_URL` → `https://your-actual-url.vercel.app`
   - `VITE_SHOPIFY_REDIRECT_URI` → `https://your-actual-url.vercel.app/api/auth/callback`
3. Click **Save**
4. **Redeploy** to apply changes (Deployments → Redeploy)

#### B. Update Shopify Partner Dashboard
1. Go to: https://partners.shopify.com
2. Navigate to: **Apps** → Select your app
3. Click: **Configuration**
4. Update these URLs:

   **App URL:**
   ```
   https://your-actual-url.vercel.app
   ```

   **Allowed redirection URL(s):** (Click "Add URL" for each)
   ```
   https://your-actual-url.vercel.app/api/auth/callback
   https://your-actual-url.vercel.app/auth/callback
   ```

5. Click **Save** at the top

---

### STEP 5: Verify Deployment

Run the verification script from your local machine:

```powershell
node verify-vercel-deployment.js https://your-actual-url.vercel.app
```

This will test:
- ✅ Homepage accessibility
- ✅ API health endpoints
- ✅ Webhook endpoints
- ✅ OAuth endpoints
- ✅ CORS configuration

**Expected result:** All tests should pass ✅

---

### STEP 6: Test Installation on Development Store

1. **Create a Test Store** (if you don't have one)
   - Go to: https://partners.shopify.com/organizations
   - Click: **Stores** → **Add store** → **Development store**

2. **Install Your App**
   - In Partner Dashboard → **Apps** → Your app
   - Click: **Test your app**
   - Select your development store
   - Click: **Install app**

3. **Verify OAuth Flow**
   - Should redirect to Shopify
   - Show permission request
   - Redirect back to your app
   - Should see app dashboard

4. **Check Webhooks Were Registered**
   - In Shopify Admin: **Settings** → **Notifications** → **Webhooks**
   - You should see these webhooks registered:
     - ✅ Order creation
     - ✅ Order updated
     - ✅ Order cancelled
     - ✅ Product create
     - ✅ Product update
     - ✅ Inventory levels update
     - ✅ App uninstalled

---

### STEP 7: Test Core Functionality

#### Test 1: Upload a Purchase Order
1. In your app, go to **PO Upload**
2. Upload a test CSV/PDF file
3. Check that:
   - ✅ File uploads successfully
   - ✅ Processing starts
   - ✅ Status updates appear

#### Test 2: AI Processing
1. Wait for AI to process the PO
2. Verify:
   - ✅ Line items are extracted
   - ✅ SKUs are matched
   - ✅ Products are identified

#### Test 3: Shopify Sync
1. Review and approve products
2. Click **Sync to Shopify**
3. Check Shopify Admin → **Products**
4. Verify:
   - ✅ Products were created
   - ✅ Variants are correct
   - ✅ Inventory was updated

---

### STEP 8: Monitor Production

#### Vercel Dashboard Monitoring
- **Deployments:** Track deployment history
- **Functions:** Monitor serverless function invocations
- **Logs:** View real-time application logs
- **Analytics:** See usage metrics

#### Database Monitoring
Check your database for webhook logs:
```sql
-- In Supabase SQL Editor
SELECT * FROM "WebhookLog" 
ORDER BY "createdAt" DESC 
LIMIT 10;
```

Should see webhook events being logged.

---

## 🎯 Production Ready Checklist

Before going live with real merchants:

### Security ✅
- [ ] All environment variables are set
- [ ] Webhook secret is configured
- [ ] JWT secrets are generated and set
- [ ] Database uses SSL/TLS
- [ ] Redis uses TLS

### Functionality ✅
- [ ] OAuth flow works on test store
- [ ] Webhooks are registered automatically
- [ ] PO upload and processing works
- [ ] AI analysis completes successfully
- [ ] Shopify sync creates products correctly
- [ ] No errors in Vercel logs

### Configuration ✅
- [ ] Shopify app URLs are updated
- [ ] Redirect URLs are whitelisted
- [ ] App scopes are correct
- [ ] Vercel environment variables match production needs
- [ ] Custom domain configured (optional)

### Monitoring ✅
- [ ] Vercel analytics enabled
- [ ] Error tracking configured
- [ ] Database monitoring set up
- [ ] Webhook logs are working

---

## 🆘 Troubleshooting

### Build Fails
```
Error: Cannot find module 'X'
```
**Solution:** Add missing dependency to `package.json` and push to GitHub

### Webhooks Not Registering
```
Error: Webhook creation failed
```
**Solution:** 
1. Check `SHOPIFY_WEBHOOK_SECRET` is set in Vercel
2. Verify Shopify API credentials are correct
3. Check Vercel function logs for detailed error

### Database Connection Error
```
Error: Connection refused
```
**Solution:**
1. Verify `DATABASE_URL` is correct
2. Check Supabase allows connections from Vercel
3. Ensure SSL is enabled in connection string

### Redis Connection Error
```
Error: ECONNREFUSED
```
**Solution:**
1. Verify Redis host and password are correct
2. Check `REDIS_TLS=true` is set
3. Verify Redis firewall allows Vercel IPs

### OAuth Redirect Error
```
Error: Invalid redirect URI
```
**Solution:**
1. Check Shopify Partner Dashboard → Configuration
2. Verify redirect URI exactly matches Vercel URL
3. Must include `/api/auth/callback`

---

## 📞 Need Help?

### Resources
- **Vercel Docs:** https://vercel.com/docs
- **Shopify App Docs:** https://shopify.dev/docs/apps
- **Your Documentation:**
  - `WEBHOOK_PRODUCTION_ANALYSIS.md`
  - `WEBHOOK_DEPLOYMENT_STATUS.md`
  - `DEPLOYMENT_CHECKLIST.md`

### Quick Commands

**View Vercel Logs:**
```powershell
vercel logs https://your-actual-url.vercel.app --follow
```

**Check Build Status:**
```powershell
vercel inspect https://your-actual-url.vercel.app
```

**Test API Health:**
```powershell
curl https://your-actual-url.vercel.app/api/health
```

**Test Webhook Health:**
```powershell
curl https://your-actual-url.vercel.app/api/webhooks/health
```

---

## 🎉 Congratulations!

Once all steps are complete and tests pass, your app is **PRODUCTION READY**!

You can now:
- ✅ Submit app for Shopify App Store review (optional)
- ✅ Onboard beta merchants
- ✅ Start processing real purchase orders
- ✅ Monitor performance and scale as needed

**Your production URL:** `https://your-actual-url.vercel.app`

---

*Last updated: October 5, 2025*
