# 🎯 Post-Deployment Checklist

## Current Status
⏳ **Deployment in Progress...**

Inspection URL: https://vercel.com/stock-it-ai/stock-it-ai/8PjpdymdYQrFEqe187a4iFboANAV

---

## ✅ Once Deployment Completes

### STEP 1: Get Your Production URL (1 min)

Once the build completes, you'll see:
```
✅ Production: https://stock-it-ai.vercel.app
```

**Copy this URL!** This is your live production URL.

---

### STEP 2: Update Environment Variables with Actual URL (3 min)

Run these commands to update the placeholder URLs:

```powershell
# Update VITE_API_URL
vercel env rm VITE_API_URL production
vercel env add VITE_API_URL production
# When prompted, enter: https://stock-it-ai.vercel.app (your actual URL)

# Update VITE_SHOPIFY_REDIRECT_URI
vercel env rm VITE_SHOPIFY_REDIRECT_URI production
vercel env add VITE_SHOPIFY_REDIRECT_URI production
# When prompted, enter: https://stock-it-ai.vercel.app/api/auth/callback
```

---

### STEP 3: Redeploy with Updated URLs (2 min)

```powershell
vercel --prod
```

Wait for this deployment to complete.

---

### STEP 4: Update Shopify Partner Dashboard (2 min)

1. Go to: https://partners.shopify.com
2. Navigate to: **Apps** → Your App → **Configuration**
3. Update these URLs:

   **App URL:**
   ```
   https://stock-it-ai.vercel.app
   ```

   **Allowed redirection URL(s):** (Click "Add URL" for each)
   ```
   https://stock-it-ai.vercel.app/api/auth/callback
   https://stock-it-ai.vercel.app/auth/callback
   ```

4. Click **Save** at the top

---

### STEP 5: Test Deployment (2 min)

```powershell
node verify-vercel-deployment.js https://stock-it-ai.vercel.app
```

**Expected:** All tests pass ✅

---

### STEP 6: Install on Development Store (5 min)

1. **Create Test Store** (if needed):
   - https://partners.shopify.com → **Stores** → **Add store**

2. **Install App:**
   - Partner Dashboard → **Apps** → Your App
   - Click: **Test your app**
   - Select development store
   - Click: **Install app**

3. **Verify:**
   - OAuth redirects work
   - App loads successfully
   - Dashboard appears

4. **Check Webhooks:**
   - Shopify Admin → **Settings** → **Notifications** → **Webhooks**
   - Should see 7 webhooks automatically registered

---

### STEP 7: Test Core Features (10 min)

1. **Upload a test PO**
   - Go to PO Upload
   - Upload a CSV/PDF file
   - Verify processing starts

2. **Check AI Processing**
   - Wait for AI analysis
   - Verify line items extracted correctly

3. **Test Shopify Sync**
   - Review products
   - Click "Sync to Shopify"
   - Check Shopify Admin → Products

---

## 🔍 Monitor Deployment

### View Live Logs
```powershell
vercel logs https://stock-it-ai.vercel.app --follow
```

### Check Build Status
Visit: https://vercel.com/stock-it-ai/stock-it-ai/deployments

### Monitor Upstash Redis
Visit: https://console.upstash.com/
- Check connection count
- Monitor commands/sec

### Monitor Supabase
Visit: https://supabase.com/dashboard
- Check database activity
- Monitor API requests

---

## 🎯 Success Criteria

Your deployment is successful when:

- [x] Build completes without errors
- [ ] Production URL is accessible
- [ ] Environment variables updated
- [ ] Redeployed with correct URLs
- [ ] Shopify Partner Dashboard updated
- [ ] Verification tests pass
- [ ] App installs on test store
- [ ] Webhooks register automatically
- [ ] OAuth flow works
- [ ] PO upload works
- [ ] AI processing completes
- [ ] Shopify sync creates products

---

## 🆘 Troubleshooting

### Build Fails
- Check build logs in Vercel dashboard
- Verify all dependencies are in package.json
- Check for file conflicts (.ts and .js with same name)

### App Doesn't Load
- Verify VITE_API_URL is set correctly
- Check CORS settings
- Review Vercel function logs

### OAuth Fails
- Ensure redirect URI in Shopify matches Vercel URL exactly
- Check SHOPIFY_API_KEY and SHOPIFY_API_SECRET
- Verify app URLs in Partner Dashboard

### Webhooks Don't Register
- Check SHOPIFY_WEBHOOK_SECRET is set
- Verify API credentials are correct
- Check Vercel function logs for errors

### Database Connection Issues
- Verify DATABASE_URL is correct
- Check Supabase allows connections from Vercel
- Ensure SSL/TLS is enabled

### Redis Connection Issues
- Verify Redis credentials are correct
- Check REDIS_TLS=true
- Verify Upstash allows connections

---

## 📊 Deployment URLs

**Production URL:** (will be shown after deployment)
**Inspection:** https://vercel.com/stock-it-ai/stock-it-ai/8PjpdymdYQrFEqe187a4iFboANAV
**GitHub Repo:** https://github.com/Sandmanmmm/StockIT-AI
**Vercel Dashboard:** https://vercel.com/stock-it-ai/stock-it-ai
**Upstash Console:** https://console.upstash.com/
**Supabase Dashboard:** https://supabase.com/dashboard
**Shopify Partners:** https://partners.shopify.com

---

## 🎉 After Everything Works

1. **Monitor for 24 hours**
   - Check Vercel logs
   - Monitor error rates
   - Watch performance metrics

2. **Optional: Add Custom Domain**
   - Vercel Dashboard → Settings → Domains
   - Add your custom domain
   - Update DNS records
   - Update Shopify Partner Dashboard with new domain

3. **Scale as Needed**
   - Monitor Vercel function usage
   - Check Redis memory usage
   - Monitor database performance
   - Upgrade plans if needed

---

**Current Status:** ⏳ Building...

Check back in a few minutes for your production URL! 🚀

---

*Created: October 5, 2025*
*Deployment ID: 8PjpdymdYQrFEqe187a4iFboANAV*
