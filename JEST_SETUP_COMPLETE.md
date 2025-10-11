# Jest Setup Complete

**Status:** ✅ Complete  
**Date:** 2025-01-11  

## Overview

Jest is now properly configured for the project with ES modules support, enabling comprehensive testing of all services including the new performance monitoring system.

## What Was Configured

### 1. Package.json Scripts

Added Jest test scripts to `api/package.json`:

```json
"scripts": {
  "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js",
  "test:watch": "node --experimental-vm-modules node_modules/jest/bin/jest.js --watch",
  "test:coverage": "node --experimental-vm-modules node_modules/jest/bin/jest.js --coverage"
}
```

**Usage:**
```bash
cd api

# Run all tests
npm test

# Run specific test file
npm test -- performanceMonitoring.test.js

# Run tests in watch mode (re-run on file changes)
npm run test:watch

# Run with coverage report
npm run test:coverage
```

---

### 2. Dependencies Installed

Added to `devDependencies`:
- `jest@^29.7.0` - Testing framework
- `@jest/globals@^29.7.0` - Global test functions (describe, it, expect, etc.)

---

### 3. Jest Configuration

**File:** `api/jest.config.js`

Key features:
- **ES Modules support** - Works with `import`/`export` syntax
- **Node environment** - Suitable for backend testing
- **Coverage thresholds** - 70% minimum (adjustable)
- **Test patterns** - Finds `*.test.js` and `*.spec.js` files
- **Setup file** - Runs `jest.setup.js` before tests
- **30-second timeout** - For database operations
- **Force exit** - Prevents hanging

```javascript
export default {
  testEnvironment: 'node',
  transform: {},
  moduleFileExtensions: ['js', 'json'],
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/?(*.)+(spec|test).js'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!**/node_modules/**',
    '!**/__tests__/**'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  verbose: true,
  forceExit: true,
  testTimeout: 30000,
  clearMocks: true,
  restoreMocks: true
}
```

---

### 4. Jest Setup File

**File:** `api/jest.setup.js`

Runs before all tests to:
- Load environment variables from `.env.test` or `.env`
- Set `NODE_ENV=test`
- Provide global test utilities

**Global utilities available in tests:**
```javascript
// Generate unique test IDs
const id = global.testUtils.generateTestId()
// => 'test_1760208829216_abc123def'

// Wait for async operations
await global.testUtils.wait(1000) // Wait 1 second

// Suppress console output (optional)
global.testUtils.suppressConsole()
```

---

### 5. Test Environment Template

**File:** `api/.env.test.example`

Template for test-specific environment variables. Copy to `.env.test` and update with your test database credentials:

```bash
# Copy the template
cp .env.test.example .env.test

# Edit with your test credentials
# Use a separate test database to avoid affecting production data
```

**Key settings for testing:**
```bash
# Use test database (separate from production)
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."

# Disable pg_trgm by default in tests (test both engines)
USE_PG_TRGM_FUZZY_MATCHING=false
PG_TRGM_ROLLOUT_PERCENTAGE=0

# Enable performance monitoring
ENABLE_PERFORMANCE_MONITORING=true

# Test environment
NODE_ENV=test
```

---

## Test Results

### Performance Monitoring Tests

**File:** `api/src/lib/__tests__/performanceMonitoring.test.js`

✅ **17 tests passing** (7.6s execution time)

**Test Suites:**
1. **logPerformanceMetric** (3 tests)
   - ✅ Should log a successful metric
   - ✅ Should log a failed metric with error
   - ✅ Should include metadata if provided

2. **logPerformanceMetricsBatch** (2 tests)
   - ✅ Should log multiple metrics at once
   - ✅ Should handle empty array

3. **getPerformanceMetrics** (4 tests)
   - ✅ Should retrieve all metrics for merchant
   - ✅ Should filter by operation
   - ✅ Should filter by engine
   - ✅ Should respect limit

4. **getPerformanceComparison** (2 tests)
   - ✅ Should compare pg_trgm and JavaScript performance
   - ✅ Should calculate statistics correctly

5. **getPerformanceSummary** (2 tests)
   - ✅ Should provide summary for all operations
   - ✅ Should calculate speedup for each operation

6. **getErrorRate** (2 tests)
   - ✅ Should calculate error rate
   - ✅ Should filter by engine

7. **cleanupOldMetrics** (1 test)
   - ✅ Should delete old metrics

8. **getAdoptionStats** (1 test)
   - ✅ Should show adoption percentage

---

## Running Tests

### Run All Tests
```bash
cd api
npm test
```

### Run Specific Test File
```bash
cd api
npm test -- performanceMonitoring.test.js
```

### Run Tests Matching Pattern
```bash
cd api
npm test -- supplier
# Runs all test files with "supplier" in the name
```

### Watch Mode (Auto-rerun on Changes)
```bash
cd api
npm run test:watch
```

### Generate Coverage Report
```bash
cd api
npm run test:coverage
```

Coverage report will be generated in `api/coverage/`:
- `coverage/lcov-report/index.html` - HTML report (open in browser)
- `coverage/lcov.info` - LCOV format (for CI/CD)

---

## Writing New Tests

### Test File Structure

Place test files in `__tests__` directories next to the code they test:

```
api/src/
├── lib/
│   ├── performanceMonitoring.js
│   └── __tests__/
│       └── performanceMonitoring.test.js
├── services/
│   ├── supplierMatchingService.js
│   └── __tests__/
│       └── supplierMatchingService.test.js
```

### Test Template

```javascript
/**
 * Tests for [Service Name]
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import myService from '../myService.js'
import { db } from '../db.js'

describe('My Service', () => {
  let testData
  
  beforeAll(async () => {
    // Run once before all tests
    // Setup test data, connect to test database, etc.
  })
  
  afterAll(async () => {
    // Run once after all tests
    // Cleanup test data, close connections, etc.
  })
  
  beforeEach(async () => {
    // Run before each test
    // Reset state, clear test data, etc.
  })
  
  describe('functionName', () => {
    it('should do something', async () => {
      const result = await myService.functionName()
      
      expect(result).toBeDefined()
      expect(result.success).toBe(true)
    })
    
    it('should handle errors', async () => {
      await expect(
        myService.functionName({ invalid: true })
      ).rejects.toThrow()
    })
  })
})
```

### Common Assertions

```javascript
// Equality
expect(value).toBe(5)
expect(value).toEqual({ foo: 'bar' })

// Truthiness
expect(value).toBeTruthy()
expect(value).toBeFalsy()
expect(value).toBeDefined()
expect(value).toBeNull()

// Numbers
expect(value).toBeGreaterThan(10)
expect(value).toBeLessThan(100)
expect(value).toBeCloseTo(10.5, 1) // Within 0.1

// Strings
expect(value).toContain('substring')
expect(value).toMatch(/regex/)

// Arrays
expect(array).toHaveLength(3)
expect(array).toContain(item)

// Async
await expect(promise).resolves.toBe(value)
await expect(promise).rejects.toThrow()
```

---

## Best Practices

### 1. Isolate Tests
- Each test should be independent
- Use `beforeEach` to reset state
- Clean up test data in `afterEach` or `afterAll`

### 2. Test Database
- Use a separate test database
- Never test against production data
- Consider using in-memory database for faster tests

### 3. Mock External Services
```javascript
import { jest } from '@jest/globals'

// Mock a module
jest.mock('../externalService.js', () => ({
  fetchData: jest.fn().mockResolvedValue({ data: 'mocked' })
}))
```

### 4. Test Edge Cases
- Test happy path
- Test error conditions
- Test edge cases (empty arrays, null values, etc.)
- Test boundary conditions

### 5. Descriptive Test Names
```javascript
// Good
it('should return empty array when no suppliers match', ...)

// Bad
it('test1', ...)
```

### 6. Fast Tests
- Keep tests fast (<100ms each when possible)
- Use mocks for slow operations
- Run slow integration tests separately

---

## Continuous Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          cd api
          npm ci
      
      - name: Run tests
        run: |
          cd api
          npm test
        env:
          DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
          REDIS_URL: ${{ secrets.TEST_REDIS_URL }}
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./api/coverage/lcov.info
```

---

## Troubleshooting

### Issue: "jest is not defined"

**Solution:** Import from `@jest/globals`:
```javascript
import { describe, it, expect, jest } from '@jest/globals'
```

### Issue: "Cannot use import outside a module"

**Solution:** 
1. Ensure `"type": "module"` in `package.json`
2. Use `--experimental-vm-modules` flag (already in scripts)
3. Use `.js` extensions in imports

### Issue: Tests timeout

**Solution:** Increase timeout in `jest.config.js` or per-test:
```javascript
it('slow test', async () => {
  // ...
}, 60000) // 60 second timeout
```

### Issue: Database connection errors

**Solution:**
1. Check `.env.test` has correct credentials
2. Ensure test database exists
3. Run migrations: `npx prisma migrate deploy`

### Issue: Tests hang / don't exit

**Solution:**
1. Check for open database connections
2. Close connections in `afterAll`
3. Use `forceExit: true` in `jest.config.js` (already set)

---

## Next Steps

1. ✅ Jest configured and working
2. ✅ Performance monitoring tests passing (17/17)
3. ⏳ Add tests for other services:
   - `supplierMatchingService.js`
   - `supplierMatchingServicePgTrgm.js`
   - `featureFlags.js`
4. ⏳ Set up CI/CD pipeline with test automation
5. ⏳ Increase code coverage to >80%

---

## Summary

**Files Created/Modified:**
- ✅ `api/package.json` - Added test scripts and Jest dependencies
- ✅ `api/jest.config.js` - Jest configuration
- ✅ `api/jest.setup.js` - Test setup file
- ✅ `api/.env.test.example` - Test environment template
- ✅ `api/src/lib/__tests__/performanceMonitoring.test.js` - 17 passing tests

**Test Results:**
- ✅ 17/17 tests passing
- ✅ 7.6s execution time
- ✅ Full coverage of performanceMonitoring.js

**Ready for:**
- ✅ Writing more tests
- ✅ CI/CD integration
- ✅ TDD (Test-Driven Development) workflow

---

**Jest setup complete! Ready to test with confidence.** 🧪✨
