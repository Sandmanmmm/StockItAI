# Connection Pooling Solutions for Prisma Engine Crashes

## Problem
Prisma engine crashes under concurrent load with errors:
- "Engine is not yet connected"
- "Response from the Engine was empty"
- Multiple workflows competing for database connections
- Current: 25 connections, 1000ms warmup → Still failing

## Root Cause
Serverless functions create NEW Prisma clients on every invocation, causing:
1. **Connection pool exhaustion** (25 connections × multiple concurrent functions)
2. **Engine initialization race conditions** (multiple engines starting simultaneously)
3. **Cold start cascades** (each function initializes its own engine)

---

## Solution 1: Supabase Connection Pooler (RECOMMENDED)

### What It Does
- Uses **PgBouncer** (transaction mode pooling)
- Single pooled connection per serverless function
- Handles 1000s of connections with only 25 database connections
- **No engine warmup needed** - connections are pre-warmed

### Implementation

#### Step 1: Get Pooled Connection String
In Supabase dashboard:
1. Go to **Settings → Database**
2. Find **Connection Pooling** section
3. Copy the **Transaction** mode connection string (port 6543)
4. Format: `postgresql://postgres.xxx:[PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres`

#### Step 2: Update Prisma Schema
```prisma
// api/prisma/schema.prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")          // For migrations/Studio
  directUrl = env("DIRECT_DATABASE_URL")   // For pooled connections
}
```

#### Step 3: Update Environment Variables in Vercel
```bash
# Direct connection (for migrations only)
DATABASE_URL="postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres?connection_limit=25&pool_timeout=20"

# Pooled connection (for all serverless functions) - NEW!
DIRECT_DATABASE_URL="postgresql://postgres.xxx:[PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres"
```

#### Step 4: Update db.js (No Changes Needed!)
Prisma automatically uses `directUrl` for query engine connections when available.

### Benefits
✅ **No more engine crashes** - pooler handles connection management
✅ **No warmup delays** - connections are instant
✅ **Scales to 1000s of concurrent functions**
✅ **Zero code changes** - just environment variables

### Limitations
⚠️ Transaction mode pooling doesn't support:
- Long-running transactions (our workflows are fine - they're quick)
- Prepared statements (Prisma handles this automatically)
- Connection-scoped session variables (we don't use these)

---

## Solution 2: Prisma Accelerate (Cloud Connection Pooling)

### What It Does
- Managed global connection pooler by Prisma team
- Includes query caching for faster responses
- Edge-optimized for serverless

### Implementation

#### Step 1: Sign up for Prisma Accelerate
```bash
npm install @prisma/extension-accelerate
```

#### Step 2: Get Accelerate Connection String
Visit: https://console.prisma.io/
Get connection string like: `prisma://accelerate.prisma-data.net/?api_key=xxx`

#### Step 3: Update db.js
```javascript
import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

const prisma = new PrismaClient().$extends(withAccelerate())
```

### Benefits
✅ **Global edge network** - lowest latency
✅ **Built-in query caching** - 10-100x faster repeated queries
✅ **Connection pooling** - automatic
✅ **Real-time analytics** - query performance monitoring

### Limitations
⚠️ **Paid service** ($25-$250/month depending on scale)
⚠️ **External dependency** - another service to manage

---

## Solution 3: Lazy Connection Initialization (Quick Fix)

### What It Does
- Don't connect until first query
- Share single client across all requests in same container
- Let Prisma handle connection lifecycle

### Implementation

#### Update db.js
```javascript
import { PrismaClient } from '@prisma/client'

let prisma = null

async function getClient() {
  if (!prisma) {
    prisma = new PrismaClient({
      datasources: {
        db: { url: process.env.DATABASE_URL }
      },
      log: ['error', 'warn']
    })
    
    // Don't explicitly connect - let Prisma lazy-load
    // Connection happens automatically on first query
  }
  
  return prisma
}

export default { 
  get client() {
    return prisma
  },
  getClient,
  disconnect: async () => {
    if (prisma) {
      await prisma.$disconnect()
      prisma = null
    }
  }
}
```

### Benefits
✅ **Simple** - minimal code changes
✅ **Fast** - no warmup delays
✅ **Works now** - no external services needed

### Limitations
⚠️ **Still hits connection limits** with many concurrent functions
⚠️ **Slower cold starts** - first query does connection work

---

## Solution 4: Increase Connection Limit + Better Retry Logic

### What It Does
- Increase Supabase connection pool to 50-100
- Add exponential backoff for connection retries
- Better error handling for "engine not connected"

### Implementation

#### Step 1: Update DATABASE_URL in Vercel
```bash
# OLD (25 connections)
postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres?connection_limit=25&pool_timeout=20

# NEW (100 connections for heavy concurrent load)
postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres?connection_limit=100&pool_timeout=30&connect_timeout=10
```

#### Step 2: Add Retry Wrapper with Circuit Breaker
```javascript
// api/src/lib/prismaRetry.js
class CircuitBreaker {
  constructor() {
    this.failures = 0
    this.threshold = 5
    this.timeout = 60000 // 1 minute
    this.nextAttempt = Date.now()
  }

  async execute(fn) {
    if (Date.now() < this.nextAttempt) {
      throw new Error('Circuit breaker open - too many failures')
    }

    try {
      const result = await fn()
      this.failures = 0 // Reset on success
      return result
    } catch (error) {
      this.failures++
      if (this.failures >= this.threshold) {
        this.nextAttempt = Date.now() + this.timeout
        console.error(`🔴 Circuit breaker opened after ${this.failures} failures`)
      }
      throw error
    }
  }
}

const breaker = new CircuitBreaker()

export async function withPrismaRetry(operation, options = {}) {
  const { maxRetries = 5, initialDelay = 1000, backoffMultiplier = 2 } = options

  return breaker.execute(async () => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        if (attempt === maxRetries || !isRetryableError(error)) {
          throw error
        }

        const delay = initialDelay * Math.pow(backoffMultiplier, attempt - 1)
        console.warn(`⚠️ Retry ${attempt}/${maxRetries} after ${delay}ms:`, error.message)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  })
}

function isRetryableError(error) {
  const retryableMessages = [
    'Engine is not yet connected',
    'Connection pool timeout',
    'Too many connections',
    'ECONNREFUSED',
    'ETIMEDOUT'
  ]
  return retryableMessages.some(msg => error.message?.includes(msg))
}
```

### Benefits
✅ **Handles transient failures** gracefully
✅ **Prevents cascade failures** with circuit breaker
✅ **Works with existing code**

### Limitations
⚠️ **Slower** - retries add latency
⚠️ **More complex** - circuit breaker logic to maintain

---

## Recommendation: Solution 1 (Supabase Pooler)

**Why:**
1. **Zero code changes** - just environment variables
2. **Proven at scale** - PgBouncer handles thousands of connections
3. **Free** - included with Supabase
4. **Instant** - no warmup delays
5. **Serverless-optimized** - designed for this exact use case

**Steps to implement:**
1. Get pooled connection string from Supabase (port 6543)
2. Add `DIRECT_DATABASE_URL` to Vercel environment variables
3. Add `directUrl` to Prisma schema
4. Run `npx prisma generate`
5. Deploy

**Expected result:**
- ✅ All "Engine is not yet connected" errors disappear
- ✅ Concurrent workflows run without crashes
- ✅ Response times decrease (no 1-2 second warmup)
- ✅ Can handle 10+ concurrent workflows easily

---

## Current State Analysis

Your logs show:
```
2025-10-08T16:56:27.165Z [info] ✅ Prisma $connect() succeeded (attempt 1)
2025-10-08T16:56:27.165Z [info] ⏳ Waiting 1000ms for engine warmup...
2025-10-08T16:56:28.162Z [info] 🔍 Verifying engine readiness with test query...
2025-10-08T16:56:28.162Z [info] prisma:error Engine is not yet connected
```

**Problem:** Even after successful `$connect()` and 1000ms wait, engine crashes on first real query.

**Why:** Multiple serverless functions starting simultaneously, each creating their own Prisma client and engine, exhausting the 25-connection pool.

**Fix:** Use connection pooler (Solution 1) - each function gets a lightweight pooled connection instead of a full engine.
