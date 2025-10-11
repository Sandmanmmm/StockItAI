# Phase 2.4 Complete: Performance Monitoring

**Status:** ✅ Complete  
**Date:** 2025-01-11  
**Duration:** ~45 minutes  

## Overview

Phase 2.4 adds comprehensive performance monitoring with database persistence for the hybrid supplier matching system. This enables data-driven rollout decisions, performance comparisons, and long-term optimization tracking.

## What Was Built

### 1. Prisma Schema Addition

**File:** `api/prisma/schema.prisma`

Added `PerformanceMetric` model:
```prisma
model PerformanceMetric {
  id          String   @id @default(cuid())
  merchantId  String
  operation   String   // e.g., 'findMatchingSuppliers'
  engine      String   // 'pg_trgm' | 'javascript'
  durationMs  Int      // Execution time in milliseconds
  resultCount Int?     // Number of results returned
  success     Boolean  @default(true)
  error       String?  // Error message if failed
  metadata    Json?    // Additional context
  createdAt   DateTime @default(now())
  
  @@index([merchantId, operation, createdAt])
  @@index([engine, operation])
  @@index([operation, createdAt])
  @@index([createdAt])
  @@map("performance_metrics")
}
```

**Indexes:** 4 compound indexes for optimal query performance

---

### 2. Performance Monitoring Service

**File:** `api/src/lib/performanceMonitoring.js` (500+ lines)

**Functions:**

#### `logPerformanceMetric(metric)`
Store a single performance metric in the database.

```javascript
await logPerformanceMetric({
  merchantId: 'merchant_123',
  operation: 'findMatchingSuppliers',
  engine: 'pg_trgm',
  durationMs: 45,
  resultCount: 3,
  success: true,
  metadata: {
    minScore: 0.7,
    supplierName: 'Acme Corp'
  }
})
```

**Never fails main operation** - all errors are caught and logged.

#### `logPerformanceMetricsBatch(metrics)`
Batch insert for efficiency:

```javascript
await logPerformanceMetricsBatch([
  { merchantId, operation, engine, durationMs, success: true },
  { merchantId, operation, engine, durationMs, success: true }
])
```

#### `getPerformanceMetrics(merchantId, options)`
Query metrics with filters:

```javascript
const metrics = await getPerformanceMetrics('merchant_123', {
  operation: 'findMatchingSuppliers',
  engine: 'pg_trgm',
  startDate: new Date('2025-01-01'),
  endDate: new Date(),
  limit: 100
})
```

#### `getPerformanceComparison(merchantId, options)`
Compare pg_trgm vs JavaScript performance:

```javascript
const comparison = await getPerformanceComparison('merchant_123')

// Returns:
{
  operation: 'findMatchingSuppliers',
  dateRange: { start: Date, end: Date },
  pg_trgm: {
    count: 150,
    avgDuration: 45,
    minDuration: 30,
    maxDuration: 120,
    medianDuration: 42,
    p95Duration: 95
  },
  javascript: {
    count: 50,
    avgDuration: 2340,
    minDuration: 1800,
    maxDuration: 5200,
    medianDuration: 2100,
    p95Duration: 4800
  },
  improvement: {
    avgSpeedup: '52.0x',
    medianSpeedup: '50.0x',
    p95Speedup: '50.5x'
  }
}
```

#### `getPerformanceSummary(merchantId, options)`
Summary of all operations (default: last 7 days):

```javascript
const summary = await getPerformanceSummary('merchant_123')

// Returns:
{
  merchantId: 'merchant_123',
  dateRange: { start: Date, end: Date },
  totalMetrics: 500,
  operations: {
    findMatchingSuppliers: {
      total: 300,
      pg_trgm: { count: 250, avgDuration: 45 },
      javascript: { count: 50, avgDuration: 2340 },
      speedup: '52.0x'
    },
    autoMatchSupplier: {
      total: 200,
      pg_trgm: { count: 180, avgDuration: 38 },
      javascript: { count: 20, avgDuration: 1950 },
      speedup: '51.3x'
    }
  }
}
```

#### `getErrorRate(merchantId, options)`
Calculate error rates (default: last 24 hours):

```javascript
const errorRate = await getErrorRate('merchant_123', {
  engine: 'pg_trgm'
})

// Returns:
{
  merchantId: 'merchant_123',
  engine: 'pg_trgm',
  dateRange: { start: Date, end: Date },
  total: 1000,
  success: 998,
  failed: 2,
  errorRate: '0.20%',
  successRate: '99.80%'
}
```

#### `cleanupOldMetrics(daysToKeep = 30)`
Delete metrics older than specified days:

```javascript
const deleted = await cleanupOldMetrics(30)
console.log(`Deleted ${deleted} old metrics`)
```

Run this periodically (monthly cron) to prevent unbounded growth.

#### `getAdoptionStats(options)`
Track global pg_trgm adoption:

```javascript
const stats = await getAdoptionStats({
  days: 7
})

// Returns:
{
  dateRange: { start: Date, end: Date },
  total: 5000,
  pg_trgm: {
    calls: 3750,
    percentage: '75.00%'
  },
  javascript: {
    calls: 1250,
    percentage: '25.00%'
  }
}
```

---

### 3. Main Service Integration

**File:** `api/src/services/supplierMatchingService.js`

**Changes:**
1. Added import: `import { logPerformanceMetric } from '../lib/performanceMonitoring.js'`
2. Updated all performance logging to use database persistence
3. Added metadata for richer context
4. Added wasFallback indicator

**Example:**
```javascript
await logPerformanceMetric({
  merchantId,
  engine: 'pg_trgm',
  operation: 'findMatchingSuppliers',
  durationMs: elapsedTime,
  resultCount: results.length,
  success: true,
  metadata: {
    minScore: options.minScore,
    maxResults: options.maxResults,
    supplierName: parsedSupplier.name
  }
})
```

---

### 4. Performance Analysis CLI

**File:** `analyze-performance.js` (300+ lines)

Command-line tool for analyzing performance metrics.

#### Commands

**Show Performance Summary:**
```bash
node analyze-performance.js summary <merchantId>
```

Example output:
```
╔════════════════════════════════════════════════════════════╗
║         PERFORMANCE SUMMARY (Last 7 Days)                  ║
╚════════════════════════════════════════════════════════════╝

Merchant: merchant_abc123def456
Date Range: 2025-01-04 → 2025-01-11
Total Metrics: 1,250

Operation: findMatchingSuppliers
  Total Calls:        1000
  pg_trgm:           750 (75.0%)
  JavaScript:        250 (25.0%)
  Performance Gain:  52.0x faster

Operation: autoMatchSupplier
  Total Calls:        250
  pg_trgm:           200 (80.0%)
  JavaScript:        50 (20.0%)
  Performance Gain:  48.7x faster
```

**Compare Engines:**
```bash
node analyze-performance.js compare <merchantId>
```

Example output:
```
╔════════════════════════════════════════════════════════════╗
║          ENGINE COMPARISON (Last 7 Days)                  ║
╚════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────┐
│                    JavaScript Engine                    │
├─────────────────────────────────────────────────────────┤
│ Calls:            250                                   │
│ Avg Duration:     2340ms                                │
│ Median Duration:  2100ms                                │
│ P95 Duration:     4800ms                                │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                     pg_trgm Engine                      │
├─────────────────────────────────────────────────────────┤
│ Calls:            750                                   │
│ Avg Duration:     45ms                                  │
│ Median Duration:  42ms                                  │
│ P95 Duration:     95ms                                  │
└─────────────────────────────────────────────────────────┘

⚡ PERFORMANCE IMPROVEMENT:
  Average Speedup:  52.0x
  Median Speedup:   50.0x
  P95 Speedup:      50.5x
```

**Show Error Rates:**
```bash
node analyze-performance.js errors <merchantId>
```

Example output:
```
╔════════════════════════════════════════════════════════════╗
║             ERROR RATES (Last 24 Hours)                   ║
╚════════════════════════════════════════════════════════════╝

Merchant: merchant_abc123def456

Overall:
  Total Calls:    1000
  Successful:     998 (99.80%)
  Failed:         2 (0.20%)

pg_trgm Engine:
  Total Calls:    750
  Successful:     749 (99.87%)
  Failed:         1 (0.13%)

JavaScript Engine:
  Total Calls:    250
  Successful:     249 (99.60%)
  Failed:         1 (0.40%)
```

**Global Adoption Statistics:**
```bash
node analyze-performance.js adoption
```

Example output:
```
╔════════════════════════════════════════════════════════════╗
║         pg_trgm ADOPTION STATS (Last 7 Days)              ║
╚════════════════════════════════════════════════════════════╝

Total Operations: 5,000

pg_trgm Usage:
  Calls: 3,750
  Adoption: 75.00%
  Progress: ███████████████░░░░░

JavaScript Usage:
  Calls: 1,250
  Adoption: 25.00%
  Progress: █████░░░░░░░░░░░░░░░
```

**Clean Up Old Metrics:**
```bash
node analyze-performance.js cleanup [days]
```

Example:
```bash
# Delete metrics older than 30 days (default)
node analyze-performance.js cleanup

# Delete metrics older than 60 days
node analyze-performance.js cleanup 60
```

**Recent Metrics:**
```bash
node analyze-performance.js recent <merchantId> [limit]
```

Example:
```bash
# Show last 10 metrics
node analyze-performance.js recent merchant_123

# Show last 50 metrics
node analyze-performance.js recent merchant_123 50
```

---

### 5. Database Migration

**File:** `api/prisma/migrations/20251011_add_performance_metrics/migration.sql`

Creates `performance_metrics` table with 4 indexes.

**To apply:**
```bash
cd api
npx prisma migrate dev --name add_performance_metrics
npx prisma generate
```

---

### 6. Comprehensive Tests

**File:** `api/src/lib/__tests__/performanceMonitoring.test.js` (400+ lines)

**Test Coverage:**
- ✅ `logPerformanceMetric` - success, failure, metadata
- ✅ `logPerformanceMetricsBatch` - multiple metrics, empty array
- ✅ `getPerformanceMetrics` - all, filtered by operation, filtered by engine, limit
- ✅ `getPerformanceComparison` - pg_trgm vs JavaScript, statistics calculations
- ✅ `getPerformanceSummary` - all operations, speedup calculations
- ✅ `getErrorRate` - overall, filtered by engine
- ✅ `cleanupOldMetrics` - delete old, keep recent
- ✅ `getAdoptionStats` - adoption percentage

**Run tests:**
```bash
cd api
npm test -- performanceMonitoring.test.js
```

---

## Benefits

### 1. Data-Driven Rollout Decisions
- Monitor pg_trgm adoption percentage
- Track error rates in real-time
- Compare performance across engines
- Identify issues before full rollout

### 2. Performance Validation
- Prove 50-670x speedup with real data
- Track P95 latency (reliability)
- Identify performance regressions
- Validate optimization hypotheses

### 3. Long-Term Optimization
- Historical performance trends
- Identify slow queries
- A/B test future optimizations
- Track impact of code changes

### 4. Business Justification
- Generate performance reports for stakeholders
- Demonstrate ROI of optimization work
- Support infrastructure decisions
- Track user experience improvements

---

## Usage Examples

### During Gradual Rollout

**Week 1: Check initial 5% adoption**
```bash
node analyze-performance.js adoption
# Expected: ~5% pg_trgm usage
```

**Week 2: Monitor error rates**
```bash
node analyze-performance.js errors merchant_123
# Expected: <1% error rate
```

**Week 3: Compare performance**
```bash
node analyze-performance.js compare merchant_123
# Expected: 50-670x speedup
```

### In Production Monitoring

**Daily: Check error rates**
```bash
node analyze-performance.js errors merchant_123
```

**Weekly: Review performance summary**
```bash
node analyze-performance.js summary merchant_123
```

**Monthly: Clean up old metrics**
```bash
node analyze-performance.js cleanup 30
```

### For Debugging

**Check recent metrics for a merchant:**
```bash
node analyze-performance.js recent merchant_123 20
```

**Query specific time range:**
```javascript
const metrics = await getPerformanceMetrics('merchant_123', {
  startDate: new Date('2025-01-10'),
  endDate: new Date('2025-01-11'),
  operation: 'findMatchingSuppliers'
})
```

---

## Database Schema

### Table: `performance_metrics`

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Primary key (CUID) |
| `merchantId` | TEXT | Merchant identifier |
| `operation` | TEXT | Operation name (e.g., 'findMatchingSuppliers') |
| `engine` | TEXT | Engine used ('pg_trgm' or 'javascript') |
| `durationMs` | INTEGER | Execution time in milliseconds |
| `resultCount` | INTEGER | Number of results returned (nullable) |
| `success` | BOOLEAN | Operation success status (default: true) |
| `error` | TEXT | Error message if failed (nullable) |
| `metadata` | JSONB | Additional context (nullable) |
| `createdAt` | TIMESTAMP | Creation timestamp (default: now) |

### Indexes

1. `(merchantId, operation, createdAt)` - Merchant-specific queries
2. `(engine, operation)` - Engine comparison queries
3. `(operation, createdAt)` - Operation-specific time series
4. `(createdAt)` - Date range queries and cleanup

---

## Expected Metrics

### After Full Rollout (100% pg_trgm)

**Performance:**
- Average duration: 30-100ms (vs 2000-67000ms JavaScript)
- P95 duration: <150ms (vs 5000-120000ms JavaScript)
- Speedup: 50-670x depending on supplier count

**Reliability:**
- Error rate: <0.5%
- Success rate: >99.5%
- Fallback usage: <1%

**Business Impact:**
- DATABASE_SAVE: 60-120s → 10-20s
- PO throughput: 3-5x increase
- User experience: Dramatically improved
- Infrastructure: Lower CPU/memory usage

---

## Maintenance

### Automated Cleanup

Add to cron or scheduled job:

```javascript
// Monthly cleanup (keep last 30 days)
import performanceMonitoring from './api/src/lib/performanceMonitoring.js'

async function monthlyCleanup() {
  const deleted = await performanceMonitoring.cleanupOldMetrics(30)
  console.log(`Cleaned up ${deleted} old performance metrics`)
}
```

### Monitoring Queries

**Check if metrics are being recorded:**
```sql
SELECT 
  DATE(created_at) as date,
  COUNT(*) as metrics
FROM performance_metrics
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

**Current adoption rate:**
```sql
SELECT 
  engine,
  COUNT(*) as calls,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM performance_metrics
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY engine;
```

---

## Integration Points

Performance monitoring is automatically integrated into:

1. **supplierMatchingService.js** - All fuzzy matching operations
2. **databasePersistenceService.js** - Via supplier matching calls
3. **backgroundJobsService.js** - Auto-link operations
4. **Suppliers API routes** - Manual matching operations

No code changes needed in consumers - monitoring is transparent.

---

## Next Steps

1. ✅ Run migration: `npx prisma migrate dev`
2. ✅ Run tests: `npm test -- performanceMonitoring.test.js`
3. ⏳ **Phase 2.5:** Final environment setup (5 min)
4. ⏳ Test in development environment
5. ⏳ Begin gradual rollout (Week 1: 5%)

---

## Files Modified/Created

### Modified
- `api/prisma/schema.prisma` - Added PerformanceMetric model
- `api/src/services/supplierMatchingService.js` - Database logging integration

### Created
- `api/src/lib/performanceMonitoring.js` - Monitoring service (500+ lines)
- `analyze-performance.js` - CLI tool (300+ lines)
- `api/prisma/migrations/20251011_add_performance_metrics/migration.sql` - Database migration
- `api/src/lib/__tests__/performanceMonitoring.test.js` - Comprehensive tests (400+ lines)
- `PHASE_2.4_COMPLETE.md` - This documentation

**Total:** 2 modified, 5 created, 1500+ lines of code

---

## Phase 2 Status

- ✅ **Phase 2.1:** pg_trgm Service (COMPLETE)
- ✅ **Phase 2.2:** Feature Flags (COMPLETE)
- ✅ **Phase 2.3:** Hybrid Main Service (COMPLETE)
- ✅ **Phase 2.4:** Performance Monitoring (COMPLETE) ⬅️ YOU ARE HERE
- ⏳ **Phase 2.5:** Final Environment Setup (PENDING - 5 min)

**Phase 2 Progress:** 90% complete

---

**Ready to proceed to Phase 2.5!** 🚀
