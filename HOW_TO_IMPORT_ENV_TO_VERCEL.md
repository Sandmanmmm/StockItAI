# 🚀 How to Import .env File into Vercel

## Quick Import Guide

You have a production-ready environment file: **`.env.production.vercel`**

### ✅ Option 1: Import via Vercel CLI (Fastest - 2 minutes)

#### Step 1: Install Vercel CLI (if not installed)
```powershell
npm i -g vercel
```

#### Step 2: Login to Vercel
```powershell
vercel login
```

#### Step 3: Link Your Project
```powershell
cd "D:\PO Sync\shopify-po-sync-pro"
vercel link
```

Select your project when prompted.

#### Step 4: Import Environment Variables
```powershell
vercel env add .env.production.vercel
```

When prompted:
- Environment: Select **All** (Production, Preview, Development)
- Confirm: **Yes**

That's it! All variables are now in Vercel.

---

### ✅ Option 2: Import via Vercel Dashboard (Manual - 5 minutes)

Vercel doesn't support direct .env file import through the UI, so you'll need to use the CLI method above OR add them manually.

**If you prefer manual:**
1. Open **`.env.production.vercel`** file
2. Go to Vercel Dashboard → Your Project → **Settings** → **Environment Variables**
3. Click **Add New**
4. Copy each `NAME="value"` pair from the file
5. Paste name and value separately
6. Select all environments: ✅ Production ✅ Preview ✅ Development
7. Repeat for all variables

---

## ⚠️ BEFORE DEPLOYING - Action Items

### 1. Set Up Production Redis (5 min)

**Your current Redis credentials are placeholders!**

#### Quick Setup with Upstash:

1. **Go to:** https://upstash.com/
2. **Sign up** (free tier available)
3. **Create Database:**
   - Click: "Create Database"
   - Name: `stockit-redis`
   - Type: Global (for best performance)
   - Click: Create

4. **Get Credentials:**
   - You'll see: `Endpoint`, `Port`, `Password`
   - Example:
     ```
     Endpoint: divine-cat-12345.upstash.io
     Port: 6379
     Password: AaBbCc123456
     ```

5. **Update the .env file:**

   Open `.env.production.vercel` and replace:
   ```env
   REDIS_HOST="your-redis-host.upstash.io"
   REDIS_PASSWORD="your-redis-password-here"
   ```

   With your actual values:
   ```env
   REDIS_HOST="divine-cat-12345.upstash.io"
   REDIS_PASSWORD="AaBbCc123456"
   ```

6. **Save and re-import** (if using CLI method)

---

### 2. Update App URLs After First Deployment

After your first deployment, Vercel gives you a URL (e.g., `stockit-ai.vercel.app`).

**Update these variables:**

```env
VITE_API_URL="https://stockit-ai.vercel.app"
VITE_SHOPIFY_REDIRECT_URI="https://stockit-ai.vercel.app/api/auth/callback"
```

**How to update:**

**Via CLI:**
```powershell
# Remove old values
vercel env rm VITE_API_URL production
vercel env rm VITE_SHOPIFY_REDIRECT_URI production

# Add new values
vercel env add VITE_API_URL production
# Enter: https://your-actual-url.vercel.app

vercel env add VITE_SHOPIFY_REDIRECT_URI production
# Enter: https://your-actual-url.vercel.app/api/auth/callback
```

**Via Dashboard:**
1. Settings → Environment Variables
2. Find `VITE_API_URL` → Click Edit
3. Update value → Save
4. Repeat for `VITE_SHOPIFY_REDIRECT_URI`
5. **Redeploy** to apply changes

---

## 🎯 Complete Import Workflow

### Full Process (15 minutes):

1. **Set up Upstash Redis** (5 min)
   - Create account at https://upstash.com/
   - Create database
   - Copy credentials

2. **Update .env.production.vercel file** (1 min)
   - Replace Redis placeholders with actual values
   - Save file

3. **Import to Vercel** (2 min)
   ```powershell
   vercel env add .env.production.vercel
   ```

4. **Deploy** (2 min)
   ```powershell
   vercel --prod
   ```
   OR in Vercel Dashboard: Deployments → Redeploy

5. **Get Production URL** (1 min)
   - Copy URL from deployment success message
   - Example: `stockit-ai.vercel.app`

6. **Update App URLs** (2 min)
   - Update `VITE_API_URL` with actual URL
   - Update `VITE_SHOPIFY_REDIRECT_URI` with actual URL
   - Redeploy

7. **Update Shopify Partner Dashboard** (2 min)
   - Go to: https://partners.shopify.com
   - Apps → Your App → Configuration
   - Update App URL and Redirect URLs
   - Save

8. **Test** (1 min)
   ```powershell
   node verify-vercel-deployment.js https://your-actual-url.vercel.app
   ```

---

## 📋 Pre-Import Checklist

Before importing, verify these are correct in `.env.production.vercel`:

### ✅ Ready to Use (No Changes Needed):
- [x] `DATABASE_URL` - Supabase connection
- [x] `DIRECT_URL` - Supabase direct connection
- [x] `SHOPIFY_API_KEY` - From Partner Dashboard
- [x] `SHOPIFY_API_SECRET` - From Partner Dashboard
- [x] `SHOPIFY_SCOPES` - Correct permissions
- [x] `SHOPIFY_WEBHOOK_SECRET` - Generated and verified
- [x] `OPENAI_API_KEY` - From OpenAI Platform
- [x] `OPENAI_MODEL` - Set to gpt-4-turbo
- [x] `JWT_SECRET` - Fresh generated (32+ chars)
- [x] `SESSION_SECRET` - Fresh generated (32+ chars)
- [x] `GOOGLE_SEARCH_API_KEY` - From Google Console
- [x] `GOOGLE_SEARCH_ENGINE_ID` - Custom Search ID
- [x] `SUPABASE_URL` - Your Supabase project URL
- [x] `SUPABASE_ANON_KEY` - From Supabase
- [x] `SUPABASE_SERVICE_ROLE_KEY` - From Supabase

### ⚠️ Needs Action:
- [ ] `REDIS_HOST` - Must add Upstash host
- [ ] `REDIS_PASSWORD` - Must add Upstash password
- [ ] `VITE_API_URL` - Update after deployment
- [ ] `VITE_SHOPIFY_REDIRECT_URI` - Update after deployment

---

## 🔒 Security Reminders

1. **Never commit `.env.production.vercel` to Git**
   - Already in `.gitignore`
   - Keep file secure

2. **Production secrets are DIFFERENT from development**
   - JWT_SECRET: ✅ New generated value
   - SESSION_SECRET: ✅ New generated value
   - ENCRYPTION_KEY: ✅ Kept from original

3. **Redis must use TLS in production**
   - `REDIS_TLS="true"` ✅ Already set

4. **Database uses SSL/TLS**
   - Connection strings use secure connections ✅

---

## 🆘 Troubleshooting

### Error: "vercel: command not found"
```powershell
npm i -g vercel
```

### Error: "Project not linked"
```powershell
vercel link
```
Select your project from the list.

### Error: "Invalid environment variable"
Check that there are no line breaks in values. Each variable should be on a single line.

### Can't import file?
Make sure you're in the project directory:
```powershell
cd "D:\PO Sync\shopify-po-sync-pro"
```

---

## ✅ Verification Commands

After importing, verify variables are set:

```powershell
# List all environment variables
vercel env ls

# Pull environment variables to check values
vercel env pull .env.check
```

Then open `.env.check` to verify all variables are present.

---

## 🎉 You're Ready!

Once you complete these steps:
1. ✅ Redis is set up
2. ✅ .env file is updated
3. ✅ Variables are imported to Vercel
4. ✅ App is deployed
5. ✅ URLs are updated

Your app will be **PRODUCTION READY**!

---

## Quick Commands Reference

```powershell
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Link project
vercel link

# Import environment variables
vercel env add .env.production.vercel

# Deploy to production
vercel --prod

# View logs
vercel logs --follow

# List environment variables
vercel env ls
```

---

**Need help?** See `VERCEL_PRODUCTION_DEPLOYMENT_STEPS.md` for detailed deployment guide.
