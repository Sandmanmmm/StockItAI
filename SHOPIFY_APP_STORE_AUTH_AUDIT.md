# Shopify App Store Authentication & Compliance Audit

**Date:** October 9, 2025  
**App:** Stock-It AI (PO Sync Pro)  
**Target:** Public Shopify App Store Distribution

---

## ✅ IMPLEMENTED - Authentication Flow

### 1. Session Token Authentication (Primary)
- ✅ **Token Validation** (`api/src/lib/shopifyConfig.js`)
  - JWT verification with `SHOPIFY_API_SECRET`
  - Audience validation (matches `SHOPIFY_API_KEY`)
  - Expiration checking
  - Shop domain extraction

- ✅ **Middleware** (`api/src/lib/auth.js`)
  - `verifyShopifyRequest` - Production authentication
  - `devBypassAuth` - Development-only bypass
  - Router-level auth application in `server.js`
  - CORS preflight handling

- ✅ **Frontend Integration** (`src/lib/shopifyApiService.ts`)
  - App Bridge token fetching
  - Automatic token refresh (60s expiry)
  - Authorization header injection
  - Robust header merging (all HeadersInit types)

### 2. OAuth Installation Flow
- ✅ **OAuth Endpoints** (`api/src/server.js`)
  - `/api/auth/install` - Generate auth URL
  - `/auth/callback` - Handle OAuth callback
  - `/auth/shopify/callback` - Alternative callback path
  - `/api/auth/callback` - API-namespaced callback

- ✅ **Redirect URLs** (`shopify.app.toml`)
  ```toml
  redirect_urls = [
    "https://forgot-yeah-termination-intelligence.trycloudflare.com/auth/callback",
    "https://forgot-yeah-termination-intelligence.trycloudflare.com/auth/shopify/callback",
    "https://forgot-yeah-termination-intelligence.trycloudflare.com/api/auth/callback"
  ]
  ```

### 3. Merchant Session Management
- ✅ **Database Storage** (Prisma)
  - Merchant records created/updated on auth
  - Last access timestamp tracking
  - Shop domain normalization

- ✅ **Request Context** (`req.merchant`, `req.shop`)
  - Available in all authenticated routes
  - Includes full merchant metadata

---

## ✅ IMPLEMENTED - Scopes & Permissions

### Required Scopes (`shopify.app.toml`)
```toml
scopes = "write_products,read_products,write_inventory,read_inventory,write_orders,read_orders,write_customers,read_customers"
```

### Configured in Code (`api/src/lib/shopifyConfig.js`)
```javascript
scopes: ['read_products', 'write_products', 'read_orders', 'write_orders', 'read_inventory', 'write_inventory']
```

⚠️ **DISCREPANCY FOUND:**
- `shopify.app.toml` includes customers scope
- `shopifyConfig.js` does NOT include customers scope
- **Action Required:** Sync scopes between files

---

## ✅ IMPLEMENTED - Webhooks

### Active Webhooks (`api/src/webhooks/routes/webhookRoutes.js`)
- ✅ `orders/created`
- ✅ `orders/updated`
- ✅ `orders/cancelled`
- ✅ `products/create`
- ✅ `products/update`
- ✅ `inventory_levels/update`
- ✅ `app/uninstalled`

### Webhook Security
- ✅ Signature verification (`api/src/lib/webhookService.js`)
- ✅ HMAC validation
- ✅ Rate limiting
- ✅ Logging & monitoring
- ✅ Bull queue for async processing

---

## ❌ MISSING - GDPR Compliance (CRITICAL FOR APP STORE)

Shopify **REQUIRES** these webhooks for app store approval:

### 1. **customers/data_request** ❌ NOT IMPLEMENTED
**Purpose:** Merchant requests customer data  
**Required By:** GDPR Article 15 (Right to Access)  
**Status:** Missing endpoint

### 2. **customers/redact** ❌ NOT IMPLEMENTED
**Purpose:** Delete customer data after 30 days  
**Required By:** GDPR Article 17 (Right to Erasure)  
**Status:** Missing endpoint

### 3. **shop/redact** ❌ NOT IMPLEMENTED
**Purpose:** Delete shop data 48 hours after uninstall  
**Required By:** GDPR Article 17 (Right to Erasure)  
**Status:** Missing endpoint

**Risk:** App will be **REJECTED** from Shopify App Store without these.

---

## ✅ IMPLEMENTED - Session Storage (UPDATED)

### Production Session Store ✅
**Implementation Complete:** October 9, 2025

```javascript
// api/src/server.js - Now uses production session store
const sessionStore = await createSessionStore()
const sessionConfig = getSessionConfig(sessionStore)
app.use(session(sessionConfig))

// Logs:
// ✅ Session store initialized: RedisStore
// 📦 Using Upstash Redis (serverless, production-ready)
```

### Architecture:
- ✅ **Primary**: Upstash Redis (serverless, fast, TTL support)
- ✅ **Fallback**: Prisma PostgreSQL (`ExpressSession` model)
- ✅ **Dev Only**: In-memory (with warnings)

### Features Implemented:
- ✅ Automatic store selection (Redis → Prisma → Memory)
- ✅ Express-session Store interface (full CRUD)
- ✅ Rolling sessions (24-hour TTL with refresh)
- ✅ Secure cookies (httpOnly, sameSite: 'none' for Shopify)
- ✅ Graceful fallback on store failure
- ✅ Production safety (rejects memory store in prod)

**See:** `SESSION_STORE_IMPLEMENTATION.md` for complete documentation

---

## ⚠️ CONFIGURATION ISSUES

### 1. Hardcoded Tunnel URL
**File:** `shopify.app.toml`
```toml
application_url = "https://forgot-yeah-termination-intelligence.trycloudflare.com"
```

**Issues:**
- Cloudflare tunnel URLs are temporary
- Not suitable for production
- **Action Required:** Replace with permanent domain before app store submission

### 2. Empty Client ID
```toml
client_id = ""
```

**Action Required:** Will be populated by Shopify CLI during app creation

### 3. Scope Mismatch
- Config file has customers scope
- Code doesn't request it
- **Action Required:** Remove from config or add to code

---

## ✅ SECURITY FEATURES IMPLEMENTED

### 1. Authentication
- ✅ JWT token validation
- ✅ Token expiry checking
- ✅ Audience verification
- ✅ Shop domain extraction and validation

### 2. CORS Protection
- ✅ Dynamic origin whitelist
- ✅ Credentials support
- ✅ Preflight caching (24h)
- ✅ Admin origin (`admin.shopify.com`)

### 3. Webhook Security
- ✅ HMAC signature verification
- ✅ Timestamp validation
- ✅ Rate limiting
- ✅ Request validation

### 4. Admin Endpoints
- ✅ Separate admin auth (`ADMIN_API_KEY`)
- ✅ Monitoring endpoints protected
- ✅ DLQ access restricted

---

## 🔧 ACTION ITEMS FOR APP STORE READINESS

### CRITICAL (Blockers)
1. **Implement GDPR Webhooks** ⚠️
   - [ ] `/webhooks/customers/data_request`
   - [ ] `/webhooks/customers/redact`
   - [ ] `/webhooks/shop/redact`
   - [ ] Add handlers to process customer/shop deletion
   - [ ] Log compliance actions

2. **✅ Replace In-Memory Session Store** - COMPLETE
   - [x] Installed `connect-redis@7`
   - [x] Created `PrismaSessionStore` as fallback
   - [x] Configured session persistence (Redis primary)
   - [x] Set proper TTL (24 hours with rolling)
   - [x] Production safety enforced
   - **See:** `SESSION_STORE_IMPLEMENTATION.md`

3. **Fix Production URL** ⚠️
   - [ ] Register permanent domain
   - [ ] Update `shopify.app.toml` with production URL
   - [ ] Update environment variables

### HIGH PRIORITY
4. **Sync OAuth Scopes**
   - [ ] Remove `write_customers,read_customers` from `shopify.app.toml` OR
   - [ ] Add to `shopifyConfig.js` scopes array

5. **Session Token Refresh Strategy**
   - ✅ Already implemented client-side (60s refresh)
   - [ ] Add server-side token refresh endpoint if needed

6. **Merchant Onboarding Flow**
   - [ ] Add welcome screen after installation
   - [ ] Collect merchant preferences
   - [ ] Display setup instructions

### MEDIUM PRIORITY
7. **Access Token Storage**
   - [ ] Currently not storing long-lived tokens
   - [ ] Consider if needed for background jobs
   - [ ] Encrypt if storing in database

8. **Billing Integration**
   ```javascript
   billing: undefined, // Add billing configuration if needed
   ```
   - [ ] Define pricing tiers
   - [ ] Implement billing confirmation flow
   - [ ] Handle subscription webhooks

9. **App Listing Assets**
   - [ ] Prepare app icon (512x512)
   - [ ] Write app description
   - [ ] Create screenshots
   - [ ] Record demo video

### NICE TO HAVE
10. **Session Cleanup**
    - [ ] Implement merchant data cleanup on uninstall
    - [ ] Archive vs. delete strategy
    - [ ] Data retention policy

11. **Monitoring & Analytics**
    - ✅ Health check endpoint exists
    - [ ] Add authentication success/failure metrics
    - [ ] Track webhook processing rates

---

## 📋 PRE-SUBMISSION CHECKLIST

### Authentication & Security
- [x] Session token validation implemented
- [x] OAuth flow working
- [x] CORS properly configured
- [ ] GDPR webhooks implemented ⚠️
- [ ] Session store upgraded from memory ⚠️

### Configuration
- [ ] Production URL configured ⚠️
- [x] Redirect URLs set
- [ ] Scopes synchronized
- [ ] Environment variables documented

### Webhooks
- [x] Order webhooks working
- [x] Product webhooks working
- [x] App uninstalled webhook
- [ ] GDPR webhooks ⚠️
- [x] Webhook signature verification

### User Experience
- [x] Embedded app loads in Shopify admin
- [x] App Bridge integration working
- [ ] Welcome/onboarding flow
- [ ] Error handling for auth failures

### Documentation
- [ ] README with installation instructions
- [ ] Privacy policy URL
- [ ] Terms of service URL
- [ ] Support contact information

---

## 🚀 ESTIMATED EFFORT TO APP STORE READY

| Task | Effort | Priority |
|------|--------|----------|
| GDPR Webhooks Implementation | 4-6 hours | CRITICAL |
| Session Store Migration | 2-3 hours | CRITICAL |
| Production Domain Setup | 1-2 hours | CRITICAL |
| Scope Synchronization | 30 min | HIGH |
| Merchant Onboarding UI | 3-4 hours | MEDIUM |
| Billing Integration | 6-8 hours | MEDIUM |
| App Store Listing | 2-3 hours | MEDIUM |

**Total Critical Path:** ~8-12 hours

---

## 📚 REFERENCES

- [Shopify App Store Requirements](https://shopify.dev/docs/apps/launch/app-store-requirements)
- [GDPR Webhooks](https://shopify.dev/docs/apps/webhooks/configuration/mandatory-webhooks)
- [Session Token Auth](https://shopify.dev/docs/apps/auth/oauth/session-tokens)
- [App Distribution](https://shopify.dev/docs/apps/launch)
