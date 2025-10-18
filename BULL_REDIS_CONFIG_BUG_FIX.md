# 🚨 CRITICAL: Bull v3 Redis Configuration Bug Fix

**Date**: October 18, 2025  
**Status**: 🔴 FATAL - Blocking all cron workflows  
**Environment**: Vercel Production  
**Error Count**: 22 unhandled rejections per cron execution

---

## 🔍 Error Analysis

### Fatal Error Message
```
Error: Using a redis instance with enableReadyCheck or maxRetriesPerRequest for bclient/subscriber is not permitted.
see https://github.com/OptimalBits/bull/issues/1873
```

### Error Location
- **File**: `/var/task/api/node_modules/bull/lib/queue.js:318:15`
- **Stack**: Queue._setupQueueEventListeners → Queue._registerEvent → process.processTicksAndRejections
- **Count**: 22 rejections (11 queues × 2 clients each: bclient + subscriber)

### Affected Queues
All 11 Bull queues crash during initialization:
1. `ai_parsing`
2. `database_save`
3. `product_draft_creation`
4. `image_attachment`
5. `background_image_processing`
6. `shopify_sync`
7. `status_update`
8. `data_normalization`
9. `merchant_config`
10. `ai_enrichment`
11. `shopify_payload`

---

## 🐛 Root Cause

### Issue #1: Mismatched Redis Config Paths

**Current Code** (Line 76-94 in `processorRegistrationService.js`):
```javascript
// Clone the config to avoid mutating the original
let redisConfig;

if (typeof connectionOptions === 'string') {
  // Redis URL format - use directly
  redisConfig = connectionOptions;  // ✅ URL string = CORRECT
} else {
  // Object format - clone and ensure Bull v3 compatibility
  redisConfig = {
    ...connectionOptions,
    // Override critical settings for Bull v3
    lazyConnect: false,              
    maxRetriesPerRequest: null,      // ✅ SET HERE
    enableReadyCheck: false,         // ✅ SET HERE
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      console.log(`🔄 Redis retry attempt ${times}, delay: ${delay}ms`);
      return delay;
    }
  };
}
```

**What Actually Happens in Production**:
1. `REDIS_URL` is set → `connectionOptions = process.env.REDIS_URL` (string)
2. Code path: `if (typeof connectionOptions === 'string')` → `redisConfig = connectionOptions` ✅
3. **PROBLEM**: When creating Redis client from URL string, ioredis v5 **auto-adds defaults**:
   ```javascript
   new Redis("redis://...") // Internally becomes:
   {
     host: "...",
     port: 6379,
     maxRetriesPerRequest: 20,     // ❌ ioredis v5 default
     enableReadyCheck: true         // ❌ ioredis v5 default
   }
   ```

### Issue #2: Bull v3 Incompatibility

**Bull v3 Requirement** (from issue #1873):
- `bclient` and `subscriber` connections **MUST** have:
  - `maxRetriesPerRequest: null` (NOT 20, NOT undefined)
  - `enableReadyCheck: false` (NOT true, NOT undefined)

**Why?**
- Bull v3 uses blocking operations (`BRPOP`) on `bclient`
- Blocking operations cannot use `maxRetriesPerRequest` (would corrupt queue state)
- `enableReadyCheck` conflicts with Bull's own connection management

---

## ✅ The Fix

### Solution: Always Pass Config Object (Never Raw URL)

**Current Flow** (BROKEN):
```
REDIS_URL="redis://..." 
  ↓
connectionOptions = string 
  ↓
new Redis(string)  // ❌ ioredis adds defaults
  ↓
maxRetriesPerRequest: 20 (auto-added)
enableReadyCheck: true (auto-added)
  ↓
Bull rejects connection ❌
```

**Fixed Flow**:
```
REDIS_URL="redis://..." 
  ↓
Parse URL to object
  ↓
redisConfig = {
  host: "...",
  port: 6379,
  maxRetriesPerRequest: null,     // ✅ Explicit
  enableReadyCheck: false         // ✅ Explicit
}
  ↓
new Redis(object)
  ↓
Bull accepts connection ✅
```

---

## 🔧 Implementation

### File to Modify
`api/src/lib/processorRegistrationService.js`

### Lines to Change: 76-100

**OLD CODE**:
```javascript
// Clone the config to avoid mutating the original
let redisConfig;

if (typeof connectionOptions === 'string') {
  // Redis URL format - use directly
  redisConfig = connectionOptions;  // ❌ PROBLEM: URL passes defaults
} else {
  // Object format - clone and ensure Bull v3 compatibility
  redisConfig = {
    ...connectionOptions,
    lazyConnect: false,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      console.log(`🔄 Redis retry attempt ${times}, delay: ${delay}ms`);
      return delay;
    }
  };
}
```

**NEW CODE**:
```javascript
// CRITICAL FIX: Always use object format to set Bull v3 requirements
// Even for URL connections, parse to object and set explicit values
let redisConfig;

if (typeof connectionOptions === 'string') {
  // Parse Redis URL to object format
  // Format: redis://[:password@]host[:port][/db]
  const url = new URL(connectionOptions);
  
  redisConfig = {
    host: url.hostname,
    port: parseInt(url.port) || 6379,
    password: url.password || undefined,
    db: url.pathname ? parseInt(url.pathname.slice(1)) : 0,
    
    // CRITICAL: Explicit settings for Bull v3 compatibility
    lazyConnect: false,
    maxRetriesPerRequest: null,      // ✅ Bull v3 requirement
    enableReadyCheck: false,         // ✅ Bull v3 requirement
    
    // TLS detection from URL protocol
    tls: url.protocol === 'rediss:' ? {} : undefined,
    
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      console.log(`🔄 Redis retry attempt ${times}, delay: ${delay}ms`);
      return delay;
    }
  };
  
  console.log(`🔧 Parsed Redis URL: ${url.hostname}:${redisConfig.port} (TLS: ${!!redisConfig.tls})`);
} else {
  // Object format - clone and ensure Bull v3 compatibility
  redisConfig = {
    ...connectionOptions,
    lazyConnect: false,
    maxRetriesPerRequest: null,      // ✅ Bull v3 requirement
    enableReadyCheck: false,         // ✅ Bull v3 requirement
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      console.log(`🔄 Redis retry attempt ${times}, delay: ${delay}ms`);
      return delay;
    }
  };
}
```

---

## 📊 Expected Behavior After Fix

### Before (Current Logs)
```
2025-10-18T17:50:23.361Z [info] ✅ Shared Redis connection pool ready
2025-10-18T17:50:23.362Z [info] ♻️ [BULL] Reusing shared client connection
2025-10-18T17:50:23.363Z [info] ✅ [PERMANENT FIX] Processor registered for ai_parsing
2025-10-18T17:50:23.363Z [info] ♻️ [BULL] Reusing shared client connection
2025-10-18T17:50:23.368Z [error] Unhandled Rejection: Error: Using a redis instance with enableReadyCheck or maxRetriesPerRequest for bclient/subscriber is not permitted.
  ❌ 22 rejections
  ❌ Process exits with code 128
```

### After (Expected)
```
2025-10-18T17:50:23.361Z [info] 🔧 Parsed Redis URL: master-fly-38745.upstash.io:6379 (TLS: true)
2025-10-18T17:50:23.361Z [info] ✅ Shared Redis connection pool ready
2025-10-18T17:50:23.362Z [info] ♻️ [BULL] Reusing shared client connection
2025-10-18T17:50:23.363Z [info] ✅ [PERMANENT FIX] Processor registered for ai_parsing
2025-10-18T17:50:23.363Z [info] ♻️ [BULL] Reusing shared bclient connection
2025-10-18T17:50:23.364Z [info] ♻️ [BULL] Reusing shared subscriber connection
  ✅ No rejections
  ✅ All 11 queues register successfully
  ✅ Cron completes normally
```

---

## 🎯 Impact Analysis

### Current State
- **Cron Status**: 🔴 Failing (exit code 128)
- **Queue Health**: 0/11 operational
- **User Impact**: No PO processing, no workflow execution
- **Duration**: Since deployment at 17:50:20 UTC

### After Fix
- **Cron Status**: ✅ Operational
- **Queue Health**: 11/11 operational
- **User Impact**: Full service restoration
- **Expected Recovery**: Immediate (next deployment)

---

## 🔬 Verification Steps

### 1. Check Redis Connection Creation
```bash
# Look for URL parsing log
grep "Parsed Redis URL" vercel-logs.txt
# Expected: 🔧 Parsed Redis URL: master-fly-38745.upstash.io:6379 (TLS: true)
```

### 2. Verify No Rejections
```bash
# Search for Bull errors
grep "enableReadyCheck or maxRetriesPerRequest" vercel-logs.txt
# Expected: No results
```

### 3. Confirm Queue Registration
```bash
# Count successful registrations
grep "Processor registered successfully" vercel-logs.txt | wc -l
# Expected: 11
```

### 4. Check Cron Completion
```bash
# Look for successful completion
grep "No pending workflows to process" vercel-logs.txt
# Expected: ✅ No pending workflows to process (normal state)
```

---

## 📚 Reference

### Related Issues
- **Bull Issue #1873**: https://github.com/OptimalBits/bull/issues/1873
- **ioredis v5 Migration**: https://github.com/luin/ioredis/blob/main/Changelog.md#v500-2022-09-21

### Related Code
- `api/src/lib/processorRegistrationService.js` - Processor registration (THIS FIX)
- `api/src/config/redis.production.js` - Redis config (already has correct settings for object format)
- `api/src/lib/redisManager.js` - Alternative Redis manager (not used by Bull)

### Environment Variables
- `REDIS_URL` - Upstash connection string (rediss://...)
- `NODE_ENV` - production
- `VERCEL` - 1

---

## ⚠️ Known Limitations

### Why Not Fix in redis.production.js?
- `redis.production.js` already has correct settings **for object format**
- But when `REDIS_URL` is set, it returns **string format**
- ioredis v5 adds defaults when parsing strings internally
- Only solution: Always use object format in processorRegistrationService

### Why Parse URL in processorRegistrationService?
- Keeps all Bull-specific logic in one place
- Explicit control over every Bull connection parameter
- Future-proof against ioredis version changes
- Clear separation: redis.production.js = generic config, processorRegistrationService = Bull-specific

---

## 🚀 Deployment Priority

**Priority**: 🔴 CRITICAL  
**Blocking**: All workflow processing  
**Risk**: LOW (isolated to Bull connection initialization)  
**Testing**: Can verify in production logs immediately

**Deploy ASAP to restore cron functionality.**
