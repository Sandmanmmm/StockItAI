# Easy Vercel Deployment Guide

## 🚀 3 Easy Ways to Deploy to Vercel

### Option 1: One-Click Deploy (Easiest)
If your code is already on GitHub:

1. **Go to Vercel Dashboard**: https://vercel.com/dashboard
2. **Click "New Project"**
3. **Import from GitHub**: Select your `StockItAI` repository
4. **Configure Project**:
   - Framework Preset: `Other`
   - Root Directory: `./` (keep default)
   - Build Command: `npm run vercel-build`
   - Output Directory: `dist`
   - Install Command: `npm install && cd api && npm install`

5. **Add Environment Variables** (click "Environment Variables"):
   ```
   NODE_ENV=production
   DATABASE_URL=your_supabase_database_url
   DIRECT_URL=your_supabase_direct_url
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key
   SHOPIFY_API_KEY=your_shopify_api_key
   SHOPIFY_API_SECRET=your_shopify_api_secret
   SHOPIFY_WEBHOOK_SECRET=your_generated_webhook_secret_here
   OPENAI_API_KEY=your_openai_api_key
   GOOGLE_SEARCH_API_KEY=your_google_api_key
   GOOGLE_SEARCH_ENGINE_ID=your_google_engine_id
   JWT_SECRET=your_jwt_secret
   ADMIN_API_KEY=your_admin_api_key
   ENCRYPTION_KEY=your_encryption_key
   ```

6. **Click "Deploy"** 🎉

### Option 2: Vercel CLI (Super Easy)
```bash
# Install Vercel CLI globally
npm i -g vercel

# Navigate to your project
cd "d:/PO Sync/shopify-po-sync-pro"

# Login to Vercel
vercel login

# Deploy (follow prompts)
vercel

# For production deployment
vercel --prod
```

### Option 3: GitHub Integration (Recommended)
1. **Push your code to GitHub** (if not already there)
2. **Connect Vercel to GitHub**:
   - Go to https://vercel.com/dashboard
   - Click "New Project"
   - Click "Import Git Repository"
   - Authorize Vercel to access your GitHub
   - Select your repository

3. **Auto-deploy on push**: Every time you push to main branch, Vercel will auto-deploy!

## 📁 Project Structure for Vercel

Your project is already set up correctly:
```
shopify-po-sync-pro/
├── api/                    # Backend API
│   ├── src/server.js      # Main server file
│   └── package.json       # API dependencies
├── src/                   # Frontend React app
├── public/               # Static assets
├── package.json          # Frontend dependencies
├── vite.config.ts        # Vite configuration
├── vercel.json          # Vercel configuration (created)
└── .env.template        # Environment template
```

## 🔧 Environment Variables Setup

After deployment, add these environment variables in Vercel Dashboard:

### Required Variables:
```bash
# Database
DATABASE_URL="postgresql://postgres.omvdgqbmgxxutbjhnamf:78eXTjEWiC1aXoOe@aws-1-ca-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.omvdgqbmgxxutbjhnamf:78eXTjEWiC1aXoOe@aws-1-ca-central-1.pooler.supabase.com:5432/postgres"

# Supabase
SUPABASE_URL="https://omvdgqbmgxxutbjhnamf.supabase.co"
SUPABASE_ANON_KEY="sb_publishable_MOUSOnPrPHPv3ObEclRNJA_NStX30aL"
SUPABASE_SERVICE_ROLE_KEY="sb_secret_w-WZYKuZquNuJLucZycj8Q_YVCgZOT3"

# Shopify
SHOPIFY_API_KEY="your_shopify_api_key_from_partner_dashboard"
SHOPIFY_API_SECRET="your_shopify_api_secret_from_partner_dashboard"
SHOPIFY_WEBHOOK_SECRET="your_generated_webhook_secret_from_deployment"

# AI Services
OPENAI_API_KEY="sk-proj-your_openai_api_key_here"
GOOGLE_SEARCH_API_KEY="your_google_api_key_here"
GOOGLE_SEARCH_ENGINE_ID="your_search_engine_id_here"

# Security
JWT_SECRET="generate_secure_random_32_char_minimum_secret"
ADMIN_API_KEY="dev_admin_key_minimum_32_chars_replace_in_production_with_secure_random"
ENCRYPTION_KEY="HGAcwnE+5TPX4PwCga6J+VmKpX/2JnF6Iq26jHomcXE="

# Production Settings
NODE_ENV="production"
API_PORT="3005"
```

## 🎯 Quick Deploy Checklist

### Before Deploying:
- [ ] Code is committed to GitHub
- [ ] `vercel.json` is in project root (✅ Created)
- [ ] `package.json` has `vercel-build` script (✅ Added)
- [ ] Environment variables are ready

### After Deploying:
- [ ] Test the deployed URL
- [ ] Update Shopify app URLs to use new Vercel domain
- [ ] Test webhook endpoints
- [ ] Monitor logs for any issues

## 🔗 Vercel URLs After Deployment

Your app will be available at:
- **Production**: `https://your-project-name.vercel.app`
- **API Endpoints**: `https://your-project-name.vercel.app/api/*`
- **Webhook URLs**: `https://your-project-name.vercel.app/api/webhooks/*`

## 🛠️ Troubleshooting

### Common Issues:

**Build Fails:**
- Check that all dependencies are in `package.json`
- Ensure build command is correct: `npm run vercel-build`

**API Routes Not Working:**
- Verify `vercel.json` routes configuration
- Check that API endpoints start with `/api/`

**Environment Variables:**
- Add all required variables in Vercel dashboard
- Don't include quotes around values in Vercel UI

**Database Connection:**
- Use connection pooling URLs for production
- Test database connectivity in Vercel function logs

## 🚀 Recommended Workflow

1. **Use GitHub Integration** for automatic deployments
2. **Set up environment variables** in Vercel dashboard
3. **Test thoroughly** on preview deployments
4. **Promote to production** when ready
5. **Update Shopify app settings** with new URLs

## 📊 Vercel Features You'll Get

- ✅ **Automatic HTTPS**
- ✅ **Global CDN**
- ✅ **Automatic deployments** from GitHub
- ✅ **Preview deployments** for pull requests
- ✅ **Built-in analytics**
- ✅ **Function logging** for debugging
- ✅ **Custom domains** support

---

**Choose Option 1 (One-Click) if you want the easiest deployment experience!** 🎉
