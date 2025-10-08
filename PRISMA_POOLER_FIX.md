# CRITICAL FIX: Prisma Schema URL Swap

## The Problem
Prisma is connecting to port 5432 (direct connection) instead of port 6543 (pooler), causing connection exhaustion.

## Root Cause
We had `url` and `directUrl` **backwards** in the Prisma schema!

### How Prisma Uses These:
- **`url`** = Used for ALL runtime queries and `$connect()` calls
- **`directUrl`** = Used ONLY for migrations (Prisma Migrate)

### What We Had (WRONG):
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")      // Port 5432 direct
  directUrl = env("DIRECT_URL")        // Port 6543 pooler
}
```
This made Prisma use the direct connection (5432) for everything!

### What We Need (CORRECT):
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DIRECT_URL")        // Port 6543 pooler ← Runtime queries
  directUrl = env("DATABASE_URL")      // Port 5432 direct ← Migrations only
}
```

## Manual Steps

### 1. Edit `api/prisma/schema.prisma`
Find lines 5-8 and change:

**FROM:**
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

**TO:**
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DIRECT_URL")      // Pooler for runtime queries (port 6543)
  directUrl = env("DATABASE_URL")    // Direct for migrations (port 5432)
}
```

### 2. Commit and Push
```bash
git add api/prisma/schema.prisma
git commit -m "fix: Swap url and directUrl - use pooler for runtime

CRITICAL: url is for runtime queries, directUrl is for migrations
- url now uses DIRECT_URL (pooler, port 6543)
- directUrl now uses DATABASE_URL (direct, port 5432)
This fixes persistent port 5432 connection errors"

git push origin main
```

### 3. Wait for Deployment
- Vercel will auto-deploy (2-3 minutes)
- Container rollout (15-20 minutes)

## Expected Result
After deployment, logs should show:
```
✅ PrismaClient created - using schema datasource config (pooler: port 6543)
🔌 Verifying Prisma engine connection...
✅ Prisma $connect() succeeded
```

And connection attempts should go to:
```
aws-1-ca-central-1.pooler.supabase.com:6543
```

Instead of:
```
db.omvdgqbmgxxutbjhnamf.supabase.co:5432
```

## Why This Fixes Everything

1. **Port 6543 = PgBouncer pooler** (200 clients → 15 connections)
2. **Port 5432 = Direct connection** (limited to 15 total)
3. Runtime queries will now use the pooler, avoiding exhaustion
4. Migrations (run locally) will still use direct connection as intended

---

**Status:** Schema file already modified locally, ready to commit!
