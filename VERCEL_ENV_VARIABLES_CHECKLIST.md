# 📋 Vercel Environment Variables Checklist

Use this checklist to ensure all environment variables are configured in Vercel.

## How to Add Environment Variables

1. Go to: https://vercel.com/dashboard
2. Select your **StockIT-AI** project
3. Go to: **Settings** → **Environment Variables**
4. Click: **Add New** for each variable below
5. Set: **Environments** = Production, Preview, Development (check all three)

---

## Required Environment Variables

### 🗄️ Database (Supabase)
- [ ] `DATABASE_URL` - Transaction pooler connection string
- [ ] `DIRECT_URL` - Session/direct connection string

**Where to find:**
- Supabase Dashboard → Project Settings → Database → Connection String

---

### 🛍️ Shopify
- [ ] `SHOPIFY_API_KEY` - Your app's API key
- [ ] `SHOPIFY_API_SECRET` - Your app's API secret
- [ ] `SHOPIFY_SCOPES` - `write_products,read_products,write_orders,read_orders,write_inventory,read_inventory,write_customers,read_customers`
- [ ] `SHOPIFY_WEBHOOK_SECRET` - Base64 encoded webhook secret

**Where to find:**
- Shopify Partner Dashboard → Apps → Your App → Configuration

**Generate webhook secret:**
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

### 🔴 Redis (Queue Processing)
- [ ] `REDIS_HOST` - Your Redis host URL
- [ ] `REDIS_PORT` - `6379` (standard port)
- [ ] `REDIS_PASSWORD` - Your Redis password
- [ ] `REDIS_TLS` - `true` (for production)

**Recommended providers:**
- Upstash: https://upstash.com (Serverless Redis)
- Redis Cloud: https://redis.com/try-free

---

### 🤖 AI Services
- [ ] `OPENAI_API_KEY` - Your OpenAI API key
- [ ] `OPENAI_MODEL` - `gpt-4-turbo` (recommended)

**Where to find:**
- OpenAI Platform: https://platform.openai.com/api-keys

---

### 🔒 Security Secrets
- [ ] `JWT_SECRET` - Random 32+ character hex string
- [ ] `SESSION_SECRET` - Random 32+ character hex string

**Generate these:**
```powershell
# JWT Secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Session Secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### 🌐 App URLs (Update after first deployment)
- [ ] `VITE_API_URL` - `https://your-vercel-url.vercel.app`
- [ ] `VITE_SHOPIFY_REDIRECT_URI` - `https://your-vercel-url.vercel.app/api/auth/callback`

**Note:** Leave these blank initially, then update with your actual Vercel URL after first deployment.

---

### 🔍 Google Search (Optional)
- [ ] `GOOGLE_SEARCH_API_KEY` - Google Custom Search API key (optional)
- [ ] `GOOGLE_SEARCH_ENGINE_ID` - Search engine ID (optional)

**Only needed if using image search feature**

---

## Quick Copy Template

Copy this template and fill in your actual values:

```env
# Database
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres

# Shopify
SHOPIFY_API_KEY=your_api_key_here
SHOPIFY_API_SECRET=your_api_secret_here
SHOPIFY_SCOPES=write_products,read_products,write_orders,read_orders,write_inventory,read_inventory,write_customers,read_customers
SHOPIFY_WEBHOOK_SECRET=your_webhook_secret_base64

# Redis
REDIS_HOST=your-redis-host.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_TLS=true

# AI
OPENAI_API_KEY=sk-proj-your_key_here
OPENAI_MODEL=gpt-4-turbo

# Security
JWT_SECRET=your_generated_jwt_secret_hex
SESSION_SECRET=your_generated_session_secret_hex

# App URLs (update after deployment)
VITE_API_URL=https://stockit-ai.vercel.app
VITE_SHOPIFY_REDIRECT_URI=https://stockit-ai.vercel.app/api/auth/callback

# Google (Optional)
GOOGLE_SEARCH_API_KEY=
GOOGLE_SEARCH_ENGINE_ID=
```

---

## Verification Commands

After adding all variables, verify locally:

```powershell
# Get your webhook secret from local .env
Get-Content api/.env | Select-String "SHOPIFY_WEBHOOK_SECRET"

# Test environment variables are accessible
vercel env ls

# Pull environment variables to local (for testing)
vercel env pull .env.local
```

---

## Common Mistakes to Avoid

❌ **Don't:**
- Use local development URLs in production
- Commit `.env` files to Git
- Share secrets in documentation
- Use weak/simple secrets
- Forget to set TLS for Redis
- Skip the "Environments" selection (must check all 3)

✅ **Do:**
- Use production-grade services (not localhost)
- Generate strong random secrets
- Keep secrets secure and backed up
- Use connection pooling for database
- Enable TLS/SSL for all services
- Test in Preview environment first

---

## Post-Configuration Steps

After adding all environment variables:

1. **Redeploy the application:**
   - Go to: Deployments tab
   - Click: Redeploy

2. **Verify deployment succeeded:**
   - Check build logs for errors
   - Look for "✅ Deployed to Production"

3. **Test the deployment:**
   ```powershell
   node verify-vercel-deployment.js https://your-vercel-url.vercel.app
   ```

4. **Update Shopify Partner Dashboard:**
   - Add your Vercel URL to App URL
   - Add redirect URIs

5. **Test OAuth flow:**
   - Install app on development store
   - Verify webhooks are registered

---

## Need to Update a Variable?

1. Go to: Settings → Environment Variables
2. Find the variable
3. Click: **Edit**
4. Update the value
5. Select environments (Production/Preview/Development)
6. Click: **Save**
7. **Important:** Redeploy for changes to take effect!

---

## Environment-Specific Variables (Advanced)

If you need different values per environment:

**Production Only:**
```
REDIS_HOST=production-redis.upstash.io
```

**Preview/Development:**
```
REDIS_HOST=dev-redis.upstash.io
```

Set these by unchecking "Production" for dev values and unchecking "Development/Preview" for prod values.

---

## 🎯 Completion Checklist

Before proceeding to deployment:

- [ ] All **Required** variables are configured
- [ ] Secrets are properly generated (not weak/default values)
- [ ] Database connections are tested
- [ ] Redis connection is verified
- [ ] OpenAI API key is valid
- [ ] All environments are selected (Production/Preview/Development)
- [ ] No `.env` files are committed to Git

**Total Required Variables:** 15 minimum (18 with optional Google)

---

**Ready?** Proceed to deployment! 🚀

See: `VERCEL_PRODUCTION_DEPLOYMENT_STEPS.md` for full deployment guide.
