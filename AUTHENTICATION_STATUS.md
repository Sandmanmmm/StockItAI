# Authentication Status & Debugging Guide
**Last Updated:** October 6, 2025 - 4:03 PM

## 🎯 Current Status

### ✅ WORKING
1. **File Upload Endpoint** - Fixed! No more 504 timeouts
   - Response time: ~5ms (was 30+ seconds)
   - Async processing working
   - Returns immediately with upload ID

2. **Most API Endpoints** - Working with fresh tokens
   - `/api/merchant/data/dashboard-summary` ✅
   - `/api/merchant/data/supplier-metrics` ✅
   - `/api/refinement-config` ✅
   - `/api/purchase-orders` ✅
   - `/api/upload/po-file` ✅
   - `/api/suppliers/suggest` ✅
   - `/api/files/po/*` ✅

### ⚠️ ISSUES
1. **App Bridge Not Providing Fresh Tokens**
   - Console shows: `⚠️ Using session token from URL parameters (will expire soon)`
   - Should show: `✅ Fresh session token from App Bridge`
   - Tokens expire after 60 seconds causing 401 errors

2. **Token Lifecycle Pattern:**
   ```
   T+0s  - Fresh URL token (exp: 1759780840)
   T+60s - Token expires, 401 errors start
   T+63s - Page refresh, new URL token (exp: 1759780943)
   ```

## 🔍 Debugging Steps

### Latest Deploy (Commit 6c1e7fd)
Added extensive logging to diagnose App Bridge initialization:

**Expected Console Output (when working):**
```javascript
🔧 App Bridge instance type: object
🔧 App Bridge methods: [list of methods]
✅ Shopify App Bridge initialized for real environment
🔧 Config: {shop, host, apiKey}
🔧 Global app set: true
✅ App Bridge found after XXXms (Y attempts)
🔄 Requesting fresh token from App Bridge...
✅ Fresh session token from App Bridge
```

**Actual Console Output (problematic):**
```javascript
⚠️ Using session token from URL parameters (will expire soon)
```

### What to Check After Next Refresh:

1. **Open Browser Console** (F12)
2. **Look for App Bridge logs:**
   - Does it say "App Bridge initialized"?
   - Does it say "App Bridge found after Xms"?
   - Does it say "App Bridge not found after 2000ms"?

3. **Check window object:**
   ```javascript
   console.log('App:', window.__SHOPIFY_APP__)
   ```
   - Should be an object, not undefined

## 🛠️ Technical Details

### Token Flow (How it SHOULD work):
```
1. User loads app → Shopify adds id_token to URL
2. App Bridge initializes → Creates AppBridge instance
3. AppBridge instance saved to window.__SHOPIFY_APP__
4. First API call → getSessionToken waits for App Bridge (up to 2s)
5. App Bridge found → Calls getSessionToken(app)
6. Returns fresh JWT token (60s validity)
7. API call succeeds with fresh token
8. Next API call → Repeats step 4-7 (always fresh token)
```

### Token Flow (Current problematic behavior):
```
1. User loads app → Shopify adds id_token to URL  
2. App Bridge starts initializing...
3. First API call happens IMMEDIATELY (before App Bridge ready)
4. getSessionToken times out waiting for App Bridge
5. Falls back to URL id_token (expires in 60s)
6. API call succeeds with URL token
7. 60 seconds pass...
8. Next API call → URL token expired → 401 error
```

## 📊 Server Logs Analysis

### Success Pattern (Fresh Token):
```
16:01:26 GET 304 /api/merchant/data/dashboard-summary
16:01:26 GET 304 /api/merchant/data/supplier-metrics
16:01:30 GET 304 /api/refinement-config
16:01:35 POST 200 /api/upload/po-file (5ms) ← FAST!
```

### Failure Pattern (Expired Token):
```
16:00:50 GET 401 /api/merchant/data/supplier-metrics
         Session token validation error: jwt expired
16:00:50 GET 401 /api/merchant/data/dashboard-summary
         Session token validation error: jwt expired
16:01:01 POST 401 /api/upload/po-file
         Session token validation error: jwt expired
```

## 🚀 Deployments

| Commit | Time | Fix | Status |
|--------|------|-----|--------|
| d166575 | 15:35 | Wait for App Bridge init | Deployed ✅ |
| c740a26 | 15:45 | Async upload processing | Deployed ✅ |
| 6c1e7fd | 16:03 | App Bridge debugging logs | Deployed ✅ |

## 🔧 Next Steps

1. **Refresh app** after Vercel deployment completes (~5 min from 16:03)
2. **Check console** for new debugging logs
3. **Report back** what the console shows:
   - Is App Bridge initializing?
   - How long does it take to find App Bridge?
   - Is it timing out after 2000ms?

## 💡 Possible Solutions (Based on logs)

### If "App Bridge not found after 2000ms":
- App Bridge isn't initializing at all
- Check if `createApp()` is throwing an error
- Verify API key is correct

### If "App Bridge found after 50ms" but still using URL token:
- App Bridge initializes but getSessionToken fails
- Check import path (should be exact)
- Verify App Bridge version compatibility

### If No App Bridge logs at all:
- AppBridgeProvider not rendering
- Check if app is wrapped in provider
- Verify Shopify environment detection

## 📝 Files Modified

1. `src/lib/shopifyApiService.ts`
   - Added `waitForAppBridge()` with timeout
   - Added detailed logging
   - Import from specific path: `@shopify/app-bridge/utilities/session-token`

2. `src/components/AppBridgeProvider.tsx`
   - Added logging for App Bridge creation
   - Confirms `window.__SHOPIFY_APP__` is set

3. `api/src/routes/upload.js`
   - Made workflow processing async (non-blocking)
   - Returns response immediately
   - Processes in background with `setImmediate()`

## 🎯 Success Criteria

✅ Upload works without timeout (ACHIEVED!)
⏳ Console shows "Fresh session token from App Bridge" (TESTING)
⏳ No 401 errors after 60+ seconds (TESTING)
⏳ All endpoints work continuously (TESTING)
