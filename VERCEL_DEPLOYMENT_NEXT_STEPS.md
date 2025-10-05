# Vercel Deployment - Next Steps

## ✅ Completed
- ✅ Production webhook infrastructure implemented
- ✅ Security middleware and HMAC verification
- ✅ Vercel configuration file created
- ✅ Repository cleaned and pushed to GitHub (https://github.com/Sandmanmmm/StockIT-AI.git)
- ✅ Credentials sanitized in documentation

## 🚀 Deploy to Vercel Now

### Option 1: One-Click Import (Recommended)
1. Visit: https://vercel.com/new
2. Click "Import Git Repository"
3. Select: `Sandmanmmm/StockIT-AI`
4. Vercel will auto-detect the configuration from `vercel.json`

### Option 2: Vercel CLI
```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel
```

## ⚙️ Configure Environment Variables

After importing, add these environment variables in Vercel dashboard:

### Required Variables
```
# Database
DATABASE_URL=your_supabase_postgres_connection_string
DIRECT_URL=your_supabase_direct_connection_string

# Shopify
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_SCOPES=write_products,read_products,write_orders,read_orders,write_inventory,read_inventory,write_customers,read_customers
SHOPIFY_WEBHOOK_SECRET=your_generated_webhook_secret

# Redis
REDIS_HOST=your_redis_host
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_TLS=true

# AI Services
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4-turbo

# Google (Optional)
GOOGLE_SEARCH_API_KEY=your_google_api_key
GOOGLE_SEARCH_ENGINE_ID=your_search_engine_id

# Security
JWT_SECRET=generate_secure_random_32_char_minimum_secret
SESSION_SECRET=generate_secure_random_32_char_minimum_secret

# App URLs (will be provided by Vercel)
VITE_API_URL=https://your-vercel-app.vercel.app
VITE_SHOPIFY_REDIRECT_URI=https://your-vercel-app.vercel.app/api/auth/callback
```

## 📋 Post-Deployment Checklist

### 1. Update Shopify App Settings
- Go to: https://partners.shopify.com/organizations
- Select your app → Configuration
- Update URLs:
  ```
  App URL: https://your-vercel-app.vercel.app
  Allowed redirection URL(s):
    - https://your-vercel-app.vercel.app/api/auth/callback
    - https://your-vercel-app.vercel.app/auth/callback
  ```

### 2. Test Webhook Registration
After first merchant installs the app:
```bash
# Check webhook health
curl https://your-vercel-app.vercel.app/api/webhooks/health

# View registered webhooks in Shopify Admin
# Settings → Notifications → Webhooks
```

### 3. Verify Core Functionality
- [ ] OAuth installation flow works
- [ ] Webhooks are registered automatically
- [ ] Purchase order upload works
- [ ] Shopify sync functions correctly
- [ ] AI processing completes successfully

## 🔒 Security Notes

### Webhook Secret
The webhook secret you generated earlier needs to be added to Vercel:
1. Go to your project settings → Environment Variables
2. Add `SHOPIFY_WEBHOOK_SECRET` with the value you generated
3. The secret is stored in your local `api/.env` file (DO NOT commit this file)

### Generate New Secrets for Production
```bash
# Generate new JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate new session secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate new webhook secret (if you need a fresh one)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 📊 Monitoring

### Vercel Dashboard
- Monitor deployment logs
- Check function invocations
- View error logs
- Monitor bandwidth usage

### Application Logs
Webhook events are logged to:
- PostgreSQL: `WebhookLog` table
- Vercel logs: Available in dashboard

## 🆘 Troubleshooting

### Common Issues

**1. Build Fails**
- Check that all dependencies are in `package.json`
- Verify Node.js version compatibility
- Review build logs in Vercel dashboard

**2. Webhooks Not Registering**
- Verify `SHOPIFY_WEBHOOK_SECRET` is set
- Check that webhook URLs are publicly accessible
- Review logs: `/api/webhooks/health`

**3. Database Connection Issues**
- Use `DIRECT_URL` for migrations
- Use `DATABASE_URL` with connection pooling for app
- Verify SSL/TLS settings for PostgreSQL

**4. Redis Connection Issues**
- Ensure Redis is accessible from Vercel
- Check firewall rules allow Vercel IPs
- Verify `REDIS_TLS=true` for production Redis

## 📚 Additional Resources

- [WEBHOOK_PRODUCTION_ANALYSIS.md](./WEBHOOK_PRODUCTION_ANALYSIS.md) - Webhook implementation details
- [WEBHOOK_DEPLOYMENT_STATUS.md](./WEBHOOK_DEPLOYMENT_STATUS.md) - Deployment verification
- [VERCEL_DEPLOYMENT_GUIDE.md](./VERCEL_DEPLOYMENT_GUIDE.md) - Complete deployment guide
- [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) - Full production checklist

## 🎯 Success Criteria

Your deployment is successful when:
- ✅ App installs on a test store without errors
- ✅ Webhooks appear in Shopify Admin → Notifications → Webhooks
- ✅ Purchase orders can be uploaded and processed
- ✅ AI analysis completes successfully
- ✅ Shopify sync creates/updates products correctly
- ✅ No errors in Vercel function logs

---

**Ready to deploy?** 🚀

1. Go to https://vercel.com/new
2. Import `Sandmanmmm/StockIT-AI`
3. Configure environment variables
4. Deploy!

Good luck! 🎉
