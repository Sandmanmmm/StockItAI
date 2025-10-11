/**
 * Tests for Performance Monitoring Service
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import performanceMonitoring from '../performanceMonitoring.js'
import { db } from '../db.js'

describe('Performance Monitoring Service', () => {
  let testMerchantId
  
  beforeAll(async () => {
    // Create test merchant
    const client = await db.getClient()
    const shopDomain = `perf-test-${Date.now()}.myshopify.com`
    const merchant = await client.merchant.create({
      data: {
        shopDomain: shopDomain,
        name: 'Test Merchant',
        accessToken: 'test_token',
        currency: 'USD',
        plan: 'test',
        status: 'active',
        auditLogging: false,
        dataEncryption: false
      }
    })
    testMerchantId = merchant.id
  })
  
  afterAll(async () => {
    // Cleanup
    const client = await db.getClient()
    
    await client.performanceMetric.deleteMany({
      where: { merchantId: testMerchantId }
    })
    
    await client.merchant.delete({
      where: { id: testMerchantId }
    })
  })
  
  beforeEach(async () => {
    // Clear metrics before each test
    const client = await db.getClient()
    await client.performanceMetric.deleteMany({
      where: { merchantId: testMerchantId }
    })
  })
  
  describe('logPerformanceMetric', () => {
    it('should log a successful metric', async () => {
      const metric = await performanceMonitoring.logPerformanceMetric({
        merchantId: testMerchantId,
        operation: 'findMatchingSuppliers',
        engine: 'pg_trgm',
        durationMs: 45,
        resultCount: 3,
        success: true
      })
      
      expect(metric).toBeDefined()
      expect(metric.merchantId).toBe(testMerchantId)
      expect(metric.operation).toBe('findMatchingSuppliers')
      expect(metric.engine).toBe('pg_trgm')
      expect(metric.durationMs).toBe(45)
      expect(metric.resultCount).toBe(3)
      expect(metric.success).toBe(true)
    })
    
    it('should log a failed metric with error', async () => {
      const metric = await performanceMonitoring.logPerformanceMetric({
        merchantId: testMerchantId,
        operation: 'findMatchingSuppliers',
        engine: 'pg_trgm',
        durationMs: 120,
        resultCount: 0,
        success: false,
        error: 'Connection timeout'
      })
      
      expect(metric).toBeDefined()
      expect(metric.success).toBe(false)
      expect(metric.error).toBe('Connection timeout')
    })
    
    it('should include metadata if provided', async () => {
      const metric = await performanceMonitoring.logPerformanceMetric({
        merchantId: testMerchantId,
        operation: 'findMatchingSuppliers',
        engine: 'javascript',
        durationMs: 2500,
        resultCount: 5,
        success: true,
        metadata: {
          minScore: 0.7,
          maxResults: 10,
          supplierName: 'Test Supplier'
        }
      })
      
      expect(metric).toBeDefined()
      expect(metric.metadata).toBeDefined()
      expect(metric.metadata.minScore).toBe(0.7)
      expect(metric.metadata.supplierName).toBe('Test Supplier')
    })
  })
  
  describe('logPerformanceMetricsBatch', () => {
    it('should log multiple metrics at once', async () => {
      const metrics = [
        {
          merchantId: testMerchantId,
          operation: 'findMatchingSuppliers',
          engine: 'pg_trgm',
          durationMs: 45,
          resultCount: 3,
          success: true
        },
        {
          merchantId: testMerchantId,
          operation: 'findMatchingSuppliers',
          engine: 'javascript',
          durationMs: 2500,
          resultCount: 3,
          success: true
        },
        {
          merchantId: testMerchantId,
          operation: 'autoMatchSupplier',
          engine: 'pg_trgm',
          durationMs: 60,
          resultCount: 1,
          success: true
        }
      ]
      
      const count = await performanceMonitoring.logPerformanceMetricsBatch(metrics)
      
      expect(count).toBe(3)
      
      // Verify they were created
      const client = await db.getClient()
      const stored = await client.performanceMetric.findMany({
        where: { merchantId: testMerchantId }
      })
      
      expect(stored.length).toBe(3)
    })
    
    it('should handle empty array', async () => {
      const count = await performanceMonitoring.logPerformanceMetricsBatch([])
      expect(count).toBe(0)
    })
  })
  
  describe('getPerformanceMetrics', () => {
    beforeEach(async () => {
      // Create test metrics
      await performanceMonitoring.logPerformanceMetricsBatch([
        {
          merchantId: testMerchantId,
          operation: 'findMatchingSuppliers',
          engine: 'pg_trgm',
          durationMs: 45,
          resultCount: 3,
          success: true
        },
        {
          merchantId: testMerchantId,
          operation: 'findMatchingSuppliers',
          engine: 'javascript',
          durationMs: 2500,
          resultCount: 3,
          success: true
        },
        {
          merchantId: testMerchantId,
          operation: 'autoMatchSupplier',
          engine: 'pg_trgm',
          durationMs: 60,
          resultCount: 1,
          success: true
        }
      ])
    })
    
    it('should retrieve all metrics for merchant', async () => {
      const metrics = await performanceMonitoring.getPerformanceMetrics(testMerchantId)
      
      expect(metrics.length).toBe(3)
    })
    
    it('should filter by operation', async () => {
      const metrics = await performanceMonitoring.getPerformanceMetrics(testMerchantId, {
        operation: 'findMatchingSuppliers'
      })
      
      expect(metrics.length).toBe(2)
      expect(metrics.every(m => m.operation === 'findMatchingSuppliers')).toBe(true)
    })
    
    it('should filter by engine', async () => {
      const metrics = await performanceMonitoring.getPerformanceMetrics(testMerchantId, {
        engine: 'pg_trgm'
      })
      
      expect(metrics.length).toBe(2)
      expect(metrics.every(m => m.engine === 'pg_trgm')).toBe(true)
    })
    
    it('should respect limit', async () => {
      const metrics = await performanceMonitoring.getPerformanceMetrics(testMerchantId, {
        limit: 2
      })
      
      expect(metrics.length).toBe(2)
    })
  })
  
  describe('getPerformanceComparison', () => {
    beforeEach(async () => {
      // Create metrics for comparison
      await performanceMonitoring.logPerformanceMetricsBatch([
        // pg_trgm metrics (faster)
        { merchantId: testMerchantId, operation: 'findMatchingSuppliers', engine: 'pg_trgm', durationMs: 40, resultCount: 3, success: true },
        { merchantId: testMerchantId, operation: 'findMatchingSuppliers', engine: 'pg_trgm', durationMs: 50, resultCount: 3, success: true },
        { merchantId: testMerchantId, operation: 'findMatchingSuppliers', engine: 'pg_trgm', durationMs: 45, resultCount: 3, success: true },
        
        // JavaScript metrics (slower)
        { merchantId: testMerchantId, operation: 'findMatchingSuppliers', engine: 'javascript', durationMs: 2000, resultCount: 3, success: true },
        { merchantId: testMerchantId, operation: 'findMatchingSuppliers', engine: 'javascript', durationMs: 2500, resultCount: 3, success: true },
        { merchantId: testMerchantId, operation: 'findMatchingSuppliers', engine: 'javascript', durationMs: 2200, resultCount: 3, success: true }
      ])
    })
    
    it('should compare pg_trgm and JavaScript performance', async () => {
      const comparison = await performanceMonitoring.getPerformanceComparison(testMerchantId)
      
      expect(comparison).toBeDefined()
      expect(comparison.operation).toBe('findMatchingSuppliers')
      
      // pg_trgm should be faster
      expect(comparison.pg_trgm.avgDuration).toBeLessThan(comparison.javascript.avgDuration)
      expect(comparison.pg_trgm.count).toBe(3)
      expect(comparison.javascript.count).toBe(3)
      
      // Should show speedup
      expect(comparison.improvement).toBeDefined()
      expect(comparison.improvement.avgSpeedup).toContain('x')
    })
    
    it('should calculate statistics correctly', async () => {
      const comparison = await performanceMonitoring.getPerformanceComparison(testMerchantId)
      
      expect(comparison.pg_trgm.minDuration).toBe(40)
      expect(comparison.pg_trgm.maxDuration).toBe(50)
      expect(comparison.pg_trgm.medianDuration).toBe(45)
      
      expect(comparison.javascript.minDuration).toBe(2000)
      expect(comparison.javascript.maxDuration).toBe(2500)
    })
  })
  
  describe('getPerformanceSummary', () => {
    beforeEach(async () => {
      await performanceMonitoring.logPerformanceMetricsBatch([
        { merchantId: testMerchantId, operation: 'findMatchingSuppliers', engine: 'pg_trgm', durationMs: 45, resultCount: 3, success: true },
        { merchantId: testMerchantId, operation: 'findMatchingSuppliers', engine: 'javascript', durationMs: 2500, resultCount: 3, success: true },
        { merchantId: testMerchantId, operation: 'autoMatchSupplier', engine: 'pg_trgm', durationMs: 60, resultCount: 1, success: true },
        { merchantId: testMerchantId, operation: 'autoMatchSupplier', engine: 'javascript', durationMs: 3000, resultCount: 1, success: true }
      ])
    })
    
    it('should provide summary for all operations', async () => {
      const summary = await performanceMonitoring.getPerformanceSummary(testMerchantId)
      
      expect(summary).toBeDefined()
      expect(summary.totalMetrics).toBe(4)
      expect(summary.operations).toBeDefined()
      expect(summary.operations.findMatchingSuppliers).toBeDefined()
      expect(summary.operations.autoMatchSupplier).toBeDefined()
    })
    
    it('should calculate speedup for each operation', async () => {
      const summary = await performanceMonitoring.getPerformanceSummary(testMerchantId)
      
      expect(summary.operations.findMatchingSuppliers.speedup).toContain('x')
      expect(summary.operations.autoMatchSupplier.speedup).toContain('x')
    })
  })
  
  describe('getErrorRate', () => {
    beforeEach(async () => {
      await performanceMonitoring.logPerformanceMetricsBatch([
        { merchantId: testMerchantId, operation: 'findMatchingSuppliers', engine: 'pg_trgm', durationMs: 45, success: true },
        { merchantId: testMerchantId, operation: 'findMatchingSuppliers', engine: 'pg_trgm', durationMs: 50, success: true },
        { merchantId: testMerchantId, operation: 'findMatchingSuppliers', engine: 'pg_trgm', durationMs: 100, success: false, error: 'Timeout' },
        { merchantId: testMerchantId, operation: 'findMatchingSuppliers', engine: 'javascript', durationMs: 2500, success: true }
      ])
    })
    
    it('should calculate error rate', async () => {
      const errorRate = await performanceMonitoring.getErrorRate(testMerchantId)
      
      expect(errorRate).toBeDefined()
      expect(errorRate.total).toBe(4)
      expect(errorRate.failed).toBe(1)
      expect(errorRate.success).toBe(3)
      expect(errorRate.errorRate).toBe('25.00%')
      expect(errorRate.successRate).toBe('75.00%')
    })
    
    it('should filter by engine', async () => {
      const pgErrorRate = await performanceMonitoring.getErrorRate(testMerchantId, {
        engine: 'pg_trgm'
      })
      
      expect(pgErrorRate.total).toBe(3)
      expect(pgErrorRate.failed).toBe(1)
      expect(pgErrorRate.errorRate).toBe('33.33%')
    })
  })
  
  describe('cleanupOldMetrics', () => {
    it('should delete old metrics', async () => {
      const client = await db.getClient()
      
      // Create old metric (40 days ago)
      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
      await client.performanceMetric.create({
        data: {
          merchantId: testMerchantId,
          operation: 'findMatchingSuppliers',
          engine: 'pg_trgm',
          durationMs: 45,
          success: true,
          createdAt: oldDate
        }
      })
      
      // Create recent metric
      await performanceMonitoring.logPerformanceMetric({
        merchantId: testMerchantId,
        operation: 'findMatchingSuppliers',
        engine: 'pg_trgm',
        durationMs: 45,
        success: true
      })
      
      // Cleanup (keep last 30 days)
      const deleted = await performanceMonitoring.cleanupOldMetrics(30)
      
      expect(deleted).toBe(1)
      
      // Verify recent metric still exists
      const remaining = await client.performanceMetric.findMany({
        where: { merchantId: testMerchantId }
      })
      
      expect(remaining.length).toBe(1)
    })
  })
  
  describe('getAdoptionStats', () => {
    beforeEach(async () => {
      await performanceMonitoring.logPerformanceMetricsBatch([
        { merchantId: testMerchantId, operation: 'findMatchingSuppliers', engine: 'pg_trgm', durationMs: 45, success: true },
        { merchantId: testMerchantId, operation: 'findMatchingSuppliers', engine: 'pg_trgm', durationMs: 50, success: true },
        { merchantId: testMerchantId, operation: 'findMatchingSuppliers', engine: 'pg_trgm', durationMs: 55, success: true },
        { merchantId: testMerchantId, operation: 'findMatchingSuppliers', engine: 'javascript', durationMs: 2500, success: true }
      ])
    })
    
    it('should show adoption percentage', async () => {
      const stats = await performanceMonitoring.getAdoptionStats()
      
      expect(stats).toBeDefined()
      expect(stats.total).toBeGreaterThanOrEqual(4)
      expect(stats.pg_trgm.calls).toBeGreaterThanOrEqual(3)
      expect(stats.javascript.calls).toBeGreaterThanOrEqual(1)
      expect(stats.pg_trgm.percentage).toContain('%')
    })
  })
})
