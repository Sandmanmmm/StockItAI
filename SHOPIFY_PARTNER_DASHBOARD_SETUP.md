# Shopify Partner Dashboard Configuration

## ✅ Deployment Complete!
Your app is now successfully deployed at: **https://stock-it-ai.vercel.app**

## 🔧 Required Configuration Steps

### Step 1: Update App URLs in Shopify Partner Dashboard

1. **Go to Shopify Partners**: https://partners.shopify.com
2. **Navigate to your app**:
   - Click on "Apps" in the left sidebar
   - Find and click on your app (StockIT-AI or your app name)
3. **Click "Configuration"** in the left sidebar

### Step 2: Update the Following Settings

#### App URL
```
https://stock-it-ai.vercel.app
```

#### Allowed redirection URL(s)
Add BOTH of these URLs (click "+ Add URL" for the second one):
```
https://stock-it-ai.vercel.app/api/auth/callback
https://stock-it-ai.vercel.app/auth/callback
```

#### GDPR Webhooks (if prompted)
- **Customer data request endpoint**: `https://stock-it-ai.vercel.app/api/webhooks/customers/data_request`
- **Customer data erasure endpoint**: `https://stock-it-ai.vercel.app/api/webhooks/customers/redact`
- **Shop data erasure endpoint**: `https://stock-it-ai.vercel.app/api/webhooks/shop/redact`

### Step 3: Save Changes
Click **"Save"** or **"Save and release"** at the top right

---

## 📱 Testing Your App

### Option 1: Install on Development Store

1. In Shopify Partners, click **"Test on development store"**
2. Select your development store
3. Click **"Install"**
4. Authorize the app permissions
5. You'll be redirected to your app at `https://stock-it-ai.vercel.app`

### Option 2: Access from Shopify Admin

Once installed:
1. Go to your Shopify store admin
2. Click **"Apps"** in the left sidebar
3. Click on **"StockIT-AI"** (or your app name)
4. The app will load with proper authentication

---

## 🎯 What to Expect After Installation

### ✅ Should Work:
- App loads in Shopify admin iframe
- App Bridge session tokens generated automatically
- API authentication successful (no more 401 errors)
- Dashboard data loads
- All API endpoints accessible

### ⚠️ Current Known Issues:
- Direct access (outside Shopify) will show 401 errors - **this is correct and expected**
- App must be accessed through Shopify admin for full functionality

---

## 🔍 Verification Checklist

After installation, verify these work:

- [ ] App loads without errors in Shopify admin
- [ ] Dashboard shows merchant data
- [ ] No console errors about authentication
- [ ] Can upload PO files
- [ ] Can view/edit product drafts
- [ ] Supplier matching works
- [ ] Shopify sync functions properly

---

## 🆘 Troubleshooting

### If you see "This page can't load Google Maps correctly"
- This is just a warning about Google Maps API
- Your app will still work fine
- You can ignore it or add a Google Maps API key later

### If authentication still fails:
1. Make sure you're accessing through Shopify admin (not directly)
2. Clear browser cache and cookies
3. Reinstall the app on your development store
4. Check that all URLs in Partner Dashboard are correct

### If app doesn't load:
1. Check browser console for errors
2. Verify all environment variables are set in Vercel
3. Check Vercel deployment logs: `vercel logs https://stock-it-ai.vercel.app`

---

## 📊 Your App URLs Summary

| Purpose | URL |
|---------|-----|
| **Production App** | https://stock-it-ai.vercel.app |
| **API Health Check** | https://stock-it-ai.vercel.app/api/health |
| **OAuth Callback** | https://stock-it-ai.vercel.app/api/auth/callback |
| **Vercel Dashboard** | https://vercel.com/stock-it-ai/stock-it-ai |
| **GitHub Repo** | https://github.com/Sandmanmmm/StockItAI |
| **Shopify Partners** | https://partners.shopify.com |

---

## 🎉 Success Indicators

You'll know everything is working when:
1. ✅ App loads in Shopify admin without errors
2. ✅ Console shows: `🌐 Using configured API URL: https://stock-it-ai.vercel.app`
3. ✅ Console shows: `✅ Using session token from...`
4. ✅ Dashboard data loads (no 401 errors)
5. ✅ Health check returns 200 OK: `curl https://stock-it-ai.vercel.app/api/health`

---

## 📞 Need Help?

If you encounter any issues:
1. Check Vercel logs: `vercel logs https://stock-it-ai.vercel.app`
2. Check browser console for frontend errors
3. Verify all Shopify Partner Dashboard URLs are correct
4. Ensure app is accessed through Shopify admin (not directly)

---

**Ready to proceed?** Follow the steps above to configure your Shopify Partner Dashboard!
