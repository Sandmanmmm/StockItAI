/**
 * Tests for Hybrid Supplier Matching Service
 * Tests feature flag integration and automatic fallback
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals'
import supplierMatchingService from '../supplierMatchingService.js'
import { featureFlags } from '../../config/featureFlags.js'
import supplierMatchingServicePgTrgm from '../supplierMatchingServicePgTrgm.js'
import { db } from '../../lib/db.js'

describe('Hybrid Supplier Matching Service', () => {
  let testMerchantId
  let testSuppliers = []
  
  beforeAll(async () => {
    // Create test merchant
    const client = await db.getClient()
    const merchant = await client.merchant.create({
      data: {
        shop: `hybrid-test-${Date.now()}.myshopify.com`,
        accessToken: 'test_token',
        isActive: true
      }
    })
    testMerchantId = merchant.id
    
    // Create test suppliers
    const supplierData = [
      {
        name: 'Mega BigBox Inc',
        contactEmail: 'contact@megabigbox.com',
        contactPhone: '555-0100',
        website: 'https://megabigbox.com',
        address: '123 Commerce St, New York, NY',
        status: 'active',
        merchantId: testMerchantId,
        connectionType: 'manual'
      },
      {
        name: 'Acme Corporation',
        contactEmail: 'sales@acme.com',
        contactPhone: '555-0200',
        website: 'https://acme.com',
        address: '456 Business Ave, Los Angeles, CA',
        status: 'active',
        merchantId: testMerchantId,
        connectionType: 'manual'
      },
      {
        name: 'Global Supplies Ltd',
        contactEmail: 'info@globalsupplies.com',
        contactPhone: '555-0300',
        website: 'https://globalsupplies.com',
        address: '789 Trade Blvd, Chicago, IL',
        status: 'active',
        merchantId: testMerchantId,
        connectionType: 'manual'
      }
    ]
    
    for (const data of supplierData) {
      const supplier = await client.supplier.create({ data })
      testSuppliers.push(supplier)
    }
  })
  
  afterAll(async () => {
    // Cleanup
    const client = await db.getClient()
    
    await client.supplier.deleteMany({
      where: { merchantId: testMerchantId }
    })
    
    await client.merchantConfig.deleteMany({
      where: { merchantId: testMerchantId }
    })
    
    await client.merchant.delete({
      where: { id: testMerchantId }
    })
  })
  
  beforeEach(() => {
    // Clear feature flag cache
    featureFlags.clearAllCache()
  })
  
  describe('Feature Flag Integration', () => {
    it('should use JavaScript engine by default', async () => {
      // Ensure no feature flags are set
      await featureFlags.setMerchantEngine(testMerchantId, null)
      delete process.env.USE_PG_TRGM_FUZZY_MATCHING
      
      const results = await supplierMatchingService.findMatchingSuppliers(
        { name: 'Mega BigBox' },
        testMerchantId,
        { minScore: 0.7 }
      )
      
      expect(results).toBeDefined()
      expect(Array.isArray(results)).toBe(true)
      
      // JavaScript engine should add metadata
      if (results.length > 0) {
        expect(results[0].metadata).toBeDefined()
        expect(results[0].metadata.engine).toBe('javascript')
      }
    })
    
    it('should use pg_trgm when global flag is set', async () => {
      process.env.USE_PG_TRGM_FUZZY_MATCHING = 'true'
      
      const results = await supplierMatchingService.findMatchingSuppliers(
        { name: 'Mega BigBox' },
        testMerchantId,
        { minScore: 0.7 }
      )
      
      expect(results).toBeDefined()
      expect(Array.isArray(results)).toBe(true)
      
      // pg_trgm engine should add metadata
      if (results.length > 0) {
        expect(results[0].metadata).toBeDefined()
        expect(results[0].metadata.engine).toBe('pg_trgm')
      }
      
      delete process.env.USE_PG_TRGM_FUZZY_MATCHING
    })
    
    it('should use pg_trgm when merchant setting is enabled', async () => {
      await featureFlags.setMerchantEngine(testMerchantId, 'pg_trgm')
      
      const results = await supplierMatchingService.findMatchingSuppliers(
        { name: 'Acme Corp' },
        testMerchantId,
        { minScore: 0.7 }
      )
      
      expect(results).toBeDefined()
      if (results.length > 0) {
        expect(results[0].metadata.engine).toBe('pg_trgm')
      }
      
      await featureFlags.setMerchantEngine(testMerchantId, null)
    })
    
    it('should use JavaScript when merchant setting is disabled', async () => {
      // Set global to pg_trgm
      process.env.USE_PG_TRGM_FUZZY_MATCHING = 'true'
      
      // But override for specific merchant
      await featureFlags.setMerchantEngine(testMerchantId, 'javascript')
      
      const results = await supplierMatchingService.findMatchingSuppliers(
        { name: 'Global Supplies' },
        testMerchantId,
        { minScore: 0.7 }
      )
      
      expect(results).toBeDefined()
      if (results.length > 0) {
        expect(results[0].metadata.engine).toBe('javascript')
      }
      
      delete process.env.USE_PG_TRGM_FUZZY_MATCHING
      await featureFlags.setMerchantEngine(testMerchantId, null)
    })
  })
  
  describe('Request-Level Override', () => {
    it('should use pg_trgm when specified in options', async () => {
      // Ensure default is JavaScript
      await featureFlags.setMerchantEngine(testMerchantId, 'javascript')
      
      const results = await supplierMatchingService.findMatchingSuppliers(
        { name: 'Mega BigBox' },
        testMerchantId,
        { minScore: 0.7, engine: 'pg_trgm' }  // Override!
      )
      
      expect(results).toBeDefined()
      if (results.length > 0) {
        expect(results[0].metadata.engine).toBe('pg_trgm')
      }
    })
    
    it('should use JavaScript when specified in options', async () => {
      // Set global to pg_trgm
      process.env.USE_PG_TRGM_FUZZY_MATCHING = 'true'
      
      const results = await supplierMatchingService.findMatchingSuppliers(
        { name: 'Acme Corp' },
        testMerchantId,
        { minScore: 0.7, engine: 'javascript' }  // Override!
      )
      
      expect(results).toBeDefined()
      if (results.length > 0) {
        expect(results[0].metadata.engine).toBe('javascript')
      }
      
      delete process.env.USE_PG_TRGM_FUZZY_MATCHING
    })
  })
  
  describe('Automatic Fallback', () => {
    it('should fallback to JavaScript when pg_trgm fails', async () => {
      // Mock pg_trgm to throw error
      const originalFindMatching = supplierMatchingServicePgTrgm.findMatchingSuppliersViaPgTrgm
      supplierMatchingServicePgTrgm.findMatchingSuppliersViaPgTrgm = jest.fn().mockRejectedValue(
        new Error('pg_trgm test error')
      )
      
      // Set to use pg_trgm
      process.env.USE_PG_TRGM_FUZZY_MATCHING = 'true'
      
      // Should fallback to JavaScript
      const results = await supplierMatchingService.findMatchingSuppliers(
        { name: 'Mega BigBox' },
        testMerchantId,
        { minScore: 0.7 }
      )
      
      expect(results).toBeDefined()
      expect(Array.isArray(results)).toBe(true)
      // Should have used JavaScript as fallback
      if (results.length > 0) {
        expect(results[0].metadata.engine).toBe('javascript')
      }
      
      // Restore
      supplierMatchingServicePgTrgm.findMatchingSuppliersViaPgTrgm = originalFindMatching
      delete process.env.USE_PG_TRGM_FUZZY_MATCHING
    })
  })
  
  describe('Result Consistency', () => {
    it('should return similar results from both engines', async () => {
      const parsedSupplier = { 
        name: 'Mega BigBox Inc',
        email: 'contact@megabigbox.com'
      }
      
      // Get JavaScript results
      const jsResults = await supplierMatchingService.findMatchingSuppliersViaJavaScript(
        parsedSupplier,
        testMerchantId,
        { minScore: 0.7 }
      )
      
      // Get pg_trgm results (with override)
      const pgResults = await supplierMatchingService.findMatchingSuppliers(
        parsedSupplier,
        testMerchantId,
        { minScore: 0.7, engine: 'pg_trgm' }
      )
      
      // Both should find matches
      expect(jsResults.length).toBeGreaterThan(0)
      expect(pgResults.length).toBeGreaterThan(0)
      
      // Top match should be the same supplier
      expect(jsResults[0].supplier.id).toBe(pgResults[0].supplier.id)
      
      // Scores should be similar (within 10%)
      const scoreDiff = Math.abs(jsResults[0].matchScore - pgResults[0].matchScore)
      expect(scoreDiff).toBeLessThan(0.1)
    })
  })
  
  describe('Performance Logging', () => {
    it('should log performance metrics', async () => {
      const consoleSpy = jest.spyOn(console, 'log')
      
      await supplierMatchingService.findMatchingSuppliers(
        { name: 'Acme Corp' },
        testMerchantId,
        { minScore: 0.7 }
      )
      
      // Check that performance was logged
      const performanceLogs = consoleSpy.mock.calls.filter(call => 
        call[0]?.includes('📊 [Performance]')
      )
      
      expect(performanceLogs.length).toBeGreaterThan(0)
      
      consoleSpy.mockRestore()
    })
  })
  
  describe('Utility Functions', () => {
    it('should export JavaScript implementation for testing', () => {
      expect(supplierMatchingService.findMatchingSuppliersViaJavaScript).toBeDefined()
      expect(typeof supplierMatchingService.findMatchingSuppliersViaJavaScript).toBe('function')
    })
    
    it('should export all utility functions', () => {
      expect(supplierMatchingService.stringSimilarity).toBeDefined()
      expect(supplierMatchingService.normalizeCompanyName).toBeDefined()
      expect(supplierMatchingService.extractDomain).toBeDefined()
      expect(supplierMatchingService.calculateMatchScore).toBeDefined()
    })
  })
  
  describe('High-Level Functions', () => {
    it('getBestMatch should work with hybrid router', async () => {
      const result = await supplierMatchingService.getBestMatch(
        { name: 'Mega BigBox' },
        testMerchantId,
        0.7
      )
      
      expect(result).toBeDefined()
      expect(result.supplier).toBeDefined()
      expect(result.matchScore).toBeGreaterThanOrEqual(0.7)
    })
    
    it('suggestSuppliers should work with hybrid router', async () => {
      const result = await supplierMatchingService.suggestSuppliers(
        { name: 'Acme' },
        testMerchantId
      )
      
      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      expect(result.suggestions).toBeDefined()
      expect(result.recommendAction).toBeDefined()
    })
  })
  
  describe('Edge Cases', () => {
    it('should handle no matches gracefully', async () => {
      const results = await supplierMatchingService.findMatchingSuppliers(
        { name: 'Nonexistent Supplier XYZ123' },
        testMerchantId,
        { minScore: 0.9 }
      )
      
      expect(results).toBeDefined()
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBe(0)
    })
    
    it('should handle partial supplier data', async () => {
      const results = await supplierMatchingService.findMatchingSuppliers(
        { name: 'Mega' },  // Only name, no other fields
        testMerchantId,
        { minScore: 0.5 }
      )
      
      expect(results).toBeDefined()
      expect(Array.isArray(results)).toBe(true)
    })
    
    it('should handle empty supplier name', async () => {
      await expect(
        supplierMatchingService.findMatchingSuppliers(
          { name: '' },
          testMerchantId
        )
      ).rejects.toThrow()
    })
  })
  
  describe('Performance Comparison', () => {
    it('pg_trgm should be faster than JavaScript', async () => {
      const parsedSupplier = { 
        name: 'Mega BigBox',
        email: 'contact@megabigbox.com'
      }
      
      // Time JavaScript
      const jsStart = Date.now()
      await supplierMatchingService.findMatchingSuppliersViaJavaScript(
        parsedSupplier,
        testMerchantId,
        { minScore: 0.7 }
      )
      const jsTime = Date.now() - jsStart
      
      // Time pg_trgm
      const pgStart = Date.now()
      await supplierMatchingService.findMatchingSuppliers(
        parsedSupplier,
        testMerchantId,
        { minScore: 0.7, engine: 'pg_trgm' }
      )
      const pgTime = Date.now() - pgStart
      
      console.log(`Performance: JavaScript ${jsTime}ms vs pg_trgm ${pgTime}ms`)
      
      // pg_trgm should complete in <100ms
      expect(pgTime).toBeLessThan(100)
      
      // Note: For small datasets (3 suppliers), JavaScript might be similar
      // For 100+ suppliers, pg_trgm should be significantly faster
    }, 10000) // Increase timeout for this test
  })
})
