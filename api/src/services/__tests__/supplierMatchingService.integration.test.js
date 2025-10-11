/**
 * Hybrid Service Integration Verification
 * 
 * This script verifies that the hybrid supplier matching service
 * is properly integrated throughout the codebase.
 * 
 * Checks:
 * 1. All imports are correct
 * 2. Function signatures match
 * 3. No breaking changes
 * 4. Backward compatibility maintained
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import supplierMatchingService from '../supplierMatchingService.js'
import { featureFlags } from '../../config/featureFlags.js'
import { db } from '../../lib/db.js'

describe('Hybrid Service Integration Verification', () => {
  let testMerchantId
  let testSupplier
  
  beforeAll(async () => {
    // Create test merchant
    const client = await db.getClient()
    const merchant = await client.merchant.create({
      data: {
        shop: `integration-test-${Date.now()}.myshopify.com`,
        accessToken: 'test_token',
        isActive: true
      }
    })
    testMerchantId = merchant.id
    
    // Create test supplier
    testSupplier = await client.supplier.create({
      data: {
        name: 'Integration Test Supplier Inc',
        contactEmail: 'test@integration.com',
        contactPhone: '555-9999',
        website: 'https://integration.com',
        address: '123 Test St, Test City, TC',
        status: 'active',
        merchantId: testMerchantId,
        connectionType: 'manual'
      }
    })
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
  
  describe('1. Export Verification', () => {
    it('should export all required functions', () => {
      expect(supplierMatchingService).toBeDefined()
      expect(supplierMatchingService.findMatchingSuppliers).toBeDefined()
      expect(supplierMatchingService.getBestMatch).toBeDefined()
      expect(supplierMatchingService.autoMatchSupplier).toBeDefined()
      expect(supplierMatchingService.suggestSuppliers).toBeDefined()
      
      // Utility functions
      expect(supplierMatchingService.stringSimilarity).toBeDefined()
      expect(supplierMatchingService.normalizeCompanyName).toBeDefined()
      expect(supplierMatchingService.extractDomain).toBeDefined()
      expect(supplierMatchingService.calculateMatchScore).toBeDefined()
      
      // New exports
      expect(supplierMatchingService.findMatchingSuppliersViaJavaScript).toBeDefined()
    })
    
    it('should have correct function types', () => {
      expect(typeof supplierMatchingService.findMatchingSuppliers).toBe('function')
      expect(typeof supplierMatchingService.getBestMatch).toBe('function')
      expect(typeof supplierMatchingService.autoMatchSupplier).toBe('function')
      expect(typeof supplierMatchingService.suggestSuppliers).toBe('function')
      expect(typeof supplierMatchingService.stringSimilarity).toBe('function')
      expect(typeof supplierMatchingService.normalizeCompanyName).toBe('function')
      expect(typeof supplierMatchingService.extractDomain).toBe('function')
      expect(typeof supplierMatchingService.calculateMatchScore).toBe('function')
      expect(typeof supplierMatchingService.findMatchingSuppliersViaJavaScript).toBe('function')
    })
  })
  
  describe('2. Function Signature Compatibility', () => {
    it('findMatchingSuppliers should accept correct parameters', async () => {
      // Test with minimal parameters (backward compatible)
      const result1 = await supplierMatchingService.findMatchingSuppliers(
        { name: 'Integration Test' },
        testMerchantId
      )
      expect(Array.isArray(result1)).toBe(true)
      
      // Test with options parameter
      const result2 = await supplierMatchingService.findMatchingSuppliers(
        { name: 'Integration Test' },
        testMerchantId,
        { minScore: 0.7, maxResults: 5 }
      )
      expect(Array.isArray(result2)).toBe(true)
      
      // Test with new engine override parameter
      const result3 = await supplierMatchingService.findMatchingSuppliers(
        { name: 'Integration Test' },
        testMerchantId,
        { engine: 'javascript' }
      )
      expect(Array.isArray(result3)).toBe(true)
    })
    
    it('getBestMatch should accept correct parameters', async () => {
      const result = await supplierMatchingService.getBestMatch(
        { name: 'Integration Test' },
        testMerchantId,
        0.7
      )
      
      // Can be null or object
      expect(result === null || typeof result === 'object').toBe(true)
    })
    
    it('autoMatchSupplier should accept correct parameters', async () => {
      // Create a test PO
      const client = await db.getClient()
      const po = await client.purchaseOrder.create({
        data: {
          number: `TEST-${Date.now()}`,
          merchantId: testMerchantId,
          status: 'pending',
          totalAmount: 1000,
          currency: 'USD'
        }
      })
      
      const result = await supplierMatchingService.autoMatchSupplier(
        po.id,
        { name: 'Integration Test Supplier' },
        testMerchantId,
        { autoLink: false }
      )
      
      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      
      // Cleanup
      await client.purchaseOrder.delete({ where: { id: po.id } })
    })
    
    it('suggestSuppliers should accept correct parameters', async () => {
      const result = await supplierMatchingService.suggestSuppliers(
        { name: 'Integration Test' },
        testMerchantId
      )
      
      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      expect(result.suggestions).toBeDefined()
    })
  })
  
  describe('3. Return Value Compatibility', () => {
    it('findMatchingSuppliers should return array with correct structure', async () => {
      const results = await supplierMatchingService.findMatchingSuppliers(
        { name: 'Integration Test Supplier' },
        testMerchantId,
        { minScore: 0.5 }
      )
      
      expect(Array.isArray(results)).toBe(true)
      
      if (results.length > 0) {
        const match = results[0]
        
        // Required fields (backward compatible)
        expect(match).toHaveProperty('supplier')
        expect(match).toHaveProperty('matchScore')
        expect(match).toHaveProperty('confidence')
        expect(match).toHaveProperty('breakdown')
        expect(match).toHaveProperty('availableFields')
        
        // New field (added by hybrid implementation)
        expect(match).toHaveProperty('metadata')
        expect(match.metadata).toHaveProperty('engine')
        expect(['javascript', 'pg_trgm']).toContain(match.metadata.engine)
        
        // Supplier object structure
        expect(match.supplier).toHaveProperty('id')
        expect(match.supplier).toHaveProperty('name')
        expect(match.supplier).toHaveProperty('status')
      }
    })
    
    it('getBestMatch should return correct structure or null', async () => {
      const result = await supplierMatchingService.getBestMatch(
        { name: 'Integration Test Supplier' },
        testMerchantId,
        0.5
      )
      
      if (result !== null) {
        expect(result).toHaveProperty('supplier')
        expect(result).toHaveProperty('matchScore')
        expect(result).toHaveProperty('confidence')
        expect(result).toHaveProperty('metadata')
      }
    })
    
    it('autoMatchSupplier should return correct structure', async () => {
      const client = await db.getClient()
      const po = await client.purchaseOrder.create({
        data: {
          number: `TEST-${Date.now()}`,
          merchantId: testMerchantId,
          status: 'pending',
          totalAmount: 1000,
          currency: 'USD'
        }
      })
      
      const result = await supplierMatchingService.autoMatchSupplier(
        po.id,
        { name: 'Integration Test Supplier' },
        testMerchantId,
        { autoLink: false }
      )
      
      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('action')
      expect(result).toHaveProperty('matches')
      expect(Array.isArray(result.matches)).toBe(true)
      
      await client.purchaseOrder.delete({ where: { id: po.id } })
    })
    
    it('suggestSuppliers should return correct structure', async () => {
      const result = await supplierMatchingService.suggestSuppliers(
        { name: 'Integration Test' },
        testMerchantId
      )
      
      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('suggestions')
      expect(result.suggestions).toHaveProperty('highConfidence')
      expect(result.suggestions).toHaveProperty('mediumConfidence')
      expect(result.suggestions).toHaveProperty('lowConfidence')
      expect(result.suggestions).toHaveProperty('total')
    })
  })
  
  describe('4. Backward Compatibility', () => {
    it('should work with old-style imports (named exports)', async () => {
      // Simulate old import style
      const { findMatchingSuppliers, getBestMatch } = supplierMatchingService
      
      const results = await findMatchingSuppliers(
        { name: 'Integration Test' },
        testMerchantId
      )
      
      expect(Array.isArray(results)).toBe(true)
    })
    
    it('should work with default export', async () => {
      // Test that default export still works
      const results = await supplierMatchingService.findMatchingSuppliers(
        { name: 'Integration Test' },
        testMerchantId
      )
      
      expect(Array.isArray(results)).toBe(true)
    })
    
    it('should not break existing code that expects specific fields', async () => {
      const results = await supplierMatchingService.findMatchingSuppliers(
        { name: 'Integration Test Supplier' },
        testMerchantId,
        { minScore: 0.5 }
      )
      
      if (results.length > 0) {
        const match = results[0]
        
        // These fields were always present and must remain
        expect(match.supplier.id).toBeDefined()
        expect(match.supplier.name).toBeDefined()
        expect(match.matchScore).toBeDefined()
        expect(typeof match.matchScore).toBe('number')
        expect(match.matchScore).toBeGreaterThanOrEqual(0)
        expect(match.matchScore).toBeLessThanOrEqual(1)
      }
    })
  })
  
  describe('5. Integration with databasePersistenceService', () => {
    it('should work with inline import pattern', async () => {
      // Simulate the import pattern used in databasePersistenceService
      const { findMatchingSuppliers } = await import('../supplierMatchingService.js')
      
      const parsedSupplier = {
        name: 'Integration Test Supplier',
        email: 'test@integration.com',
        phone: '555-9999',
        website: 'https://integration.com'
      }
      
      const matches = await findMatchingSuppliers(parsedSupplier, testMerchantId, {
        minScore: 0.85,
        maxResults: 1,
        includeInactive: false
      })
      
      expect(Array.isArray(matches)).toBe(true)
    })
  })
  
  describe('6. Integration with backgroundJobsService', () => {
    it('should work with inline import pattern', async () => {
      // Simulate the import pattern used in backgroundJobsService
      const { findMatchingSuppliers } = await import('../supplierMatchingService.js')
      
      const matchData = {
        name: 'Integration Test Supplier',
        email: 'test@integration.com',
        phone: '555-9999'
      }
      
      const matches = await findMatchingSuppliers(matchData, testMerchantId)
      
      expect(Array.isArray(matches)).toBe(true)
    })
  })
  
  describe('7. Integration with suppliers routes', () => {
    it('should work with named import pattern', async () => {
      // Simulate the import pattern used in suppliers.js route
      const parsedSupplier = {
        name: 'Integration Test Supplier',
        email: 'test@integration.com'
      }
      
      const matches = await supplierMatchingService.findMatchingSuppliers(
        parsedSupplier,
        testMerchantId,
        {
          minScore: 0.7,
          maxResults: 5,
          includeInactive: false
        }
      )
      
      expect(Array.isArray(matches)).toBe(true)
    })
  })
  
  describe('8. Feature Flag Integration', () => {
    it('should respect feature flags when called from other services', async () => {
      // Test JavaScript mode
      await featureFlags.setMerchantEngine(testMerchantId, 'javascript')
      
      const result1 = await supplierMatchingService.findMatchingSuppliers(
        { name: 'Integration Test' },
        testMerchantId
      )
      
      if (result1.length > 0) {
        expect(result1[0].metadata.engine).toBe('javascript')
      }
      
      // Test pg_trgm mode
      await featureFlags.setMerchantEngine(testMerchantId, 'pg_trgm')
      
      const result2 = await supplierMatchingService.findMatchingSuppliers(
        { name: 'Integration Test' },
        testMerchantId
      )
      
      if (result2.length > 0) {
        expect(result2[0].metadata.engine).toBe('pg_trgm')
      }
      
      // Cleanup
      await featureFlags.setMerchantEngine(testMerchantId, null)
    })
  })
  
  describe('9. Error Handling Compatibility', () => {
    it('should handle errors consistently with old implementation', async () => {
      // Test with invalid merchant ID
      await expect(
        supplierMatchingService.findMatchingSuppliers(
          { name: 'Test' },
          'invalid-merchant-id'
        )
      ).rejects.toThrow()
      
      // Test with missing supplier name
      await expect(
        supplierMatchingService.findMatchingSuppliers(
          { name: '' },
          testMerchantId
        )
      ).rejects.toThrow()
    })
  })
  
  describe('10. Performance Metadata', () => {
    it('should include performance metadata in results', async () => {
      const results = await supplierMatchingService.findMatchingSuppliers(
        { name: 'Integration Test Supplier' },
        testMerchantId
      )
      
      if (results.length > 0) {
        expect(results[0].metadata).toBeDefined()
        expect(results[0].metadata.engine).toBeDefined()
        expect(results[0].metadata.executionTime).toBeDefined()
        expect(typeof results[0].metadata.executionTime).toBe('number')
        expect(results[0].metadata.executionTime).toBeGreaterThan(0)
      }
    })
  })
})
