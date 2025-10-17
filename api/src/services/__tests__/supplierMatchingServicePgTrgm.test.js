/**
 * Unit Tests for pg_trgm Supplier Matching Service
 * 
 * Tests the PostgreSQL pg_trgm-based fuzzy matching implementation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { 
  findMatchingSuppliersViaPgTrgm, 
  getBestSupplierMatchViaPgTrgm,
  validatePgTrgmExtension,
  testPgTrgmPerformance
} from '../supplierMatchingServicePgTrgm.js'
import { db } from '../../lib/db.js'

describe('pg_trgm Supplier Matching Service', () => {
  let merchantId
  let testSuppliers = []
  
  beforeAll(async () => {
    // Validate pg_trgm extension is available
    const isAvailable = await validatePgTrgmExtension()
    if (!isAvailable) {
      throw new Error('pg_trgm extension not available - run Phase 1 migration first')
    }
    
    // Create test merchant
    const client = await db.getClient()
    const merchant = await client.merchant.create({
      data: {
        name: 'Test Merchant',
        shopDomain: 'test-pg-trgm.myshopify.com',
        email: 'pg-trgm-test@example.com',
        status: 'active'
      }
    })
    merchantId = merchant.id
    
    console.log(`✅ Created test merchant: ${merchantId}`)
    
    // Create test suppliers
    const suppliers = [
      { name: 'Mega BigBox Inc', contactEmail: 'sales@megabigbox.com', status: 'active' },
      { name: 'MegaBigBox Corporation', contactEmail: 'info@megabigbox.com', status: 'active' },
      { name: 'Big Box Mega LLC', contactEmail: 'contact@bigboxmega.com', status: 'active' },
      { name: 'Mega Store Co', contactEmail: 'orders@megastore.com', status: 'active' },
      { name: 'Walmart Inc', contactEmail: 'supplier@walmart.com', status: 'active' },
      { name: 'Amazon LLC', contactEmail: 'vendor@amazon.com', status: 'active' },
      { name: 'Inactive Supplier', contactEmail: 'old@inactive.com', status: 'inactive' }
    ]
    
    for (const supplier of suppliers) {
      const created = await client.supplier.create({
        data: { 
          merchantId, 
          ...supplier 
        }
      })
      testSuppliers.push(created)
    }
    
    console.log(`✅ Created ${testSuppliers.length} test suppliers`)
  })
  
  afterAll(async () => {
    // Cleanup test data
    const client = await db.getClient()
    
    await client.supplier.deleteMany({ where: { merchantId } })
    await client.merchant.delete({ where: { id: merchantId } })
    
    console.log('✅ Cleaned up test data')
  })
  
  describe('Extension Validation', () => {
    it('should validate pg_trgm extension is installed', async () => {
      const isAvailable = await validatePgTrgmExtension()
      expect(isAvailable).toBe(true)
    })
    
    it('should test pg_trgm performance', async () => {
      const result = await testPgTrgmPerformance(merchantId)
      
      expect(result.success).toBe(true)
      expect(result.elapsedTime).toBeLessThan(500) // Should be fast
      expect(result.performanceLevel).toBe('excellent')
    })
  })
  
  describe('Exact Name Matching', () => {
    it('should find exact match with very high score', async () => {
      const results = await findMatchingSuppliersViaPgTrgm(
        { name: 'Mega BigBox Inc' },
        merchantId,
        { minScore: 0.7, maxResults: 5 }
      )
      
      expect(results.length).toBeGreaterThan(0)
      
      // First result should be exact match
      const firstMatch = results[0]
      expect(firstMatch.supplier.name).toBe('Mega BigBox Inc')
      expect(firstMatch.matchScore).toBeGreaterThan(0.9)
      expect(firstMatch.confidence).toBe('very_high')
      expect(firstMatch.breakdown.exactMatch).toBe(true)
      expect(firstMatch.engine).toBe('pg_trgm')
    })
    
    it('should handle case-insensitive exact matches', async () => {
      const results = await findMatchingSuppliersViaPgTrgm(
        { name: 'MEGA BIGBOX INC' },
        merchantId,
        { minScore: 0.7, maxResults: 5 }
      )
      
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].supplier.name).toBe('Mega BigBox Inc')
      expect(results[0].matchScore).toBeGreaterThan(0.9)
    })
  })
  
  describe('Fuzzy Name Matching', () => {
    it('should find fuzzy matches for similar names', async () => {
      const results = await findMatchingSuppliersViaPgTrgm(
        { name: 'mega big box' },
        merchantId,
        { minScore: 0.6, maxResults: 5 }
      )
      
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].matchScore).toBeGreaterThan(0.6)
      
      // Should match multiple similar suppliers
      const matchedNames = results.map(r => r.supplier.name)
      expect(matchedNames).toContain('Mega BigBox Inc')
      expect(matchedNames.some(name => name.includes('BigBox') || name.includes('Mega'))).toBe(true)
    })
    
    it('should find matches for partial names', async () => {
      const results = await findMatchingSuppliersViaPgTrgm(
        { name: 'MegaBigBox' },
        merchantId,
        { minScore: 0.6, maxResults: 5 }
      )
      
      expect(results.length).toBeGreaterThan(0)
      
      // Should match "MegaBigBox Corporation"
      const hasMegaBigBox = results.some(r => r.supplier.name.includes('MegaBigBox'))
      expect(hasMegaBigBox).toBe(true)
    })
    
    it('should not match completely different names', async () => {
      const results = await findMatchingSuppliersViaPgTrgm(
        { name: 'Completely Different Company' },
        merchantId,
        { minScore: 0.7, maxResults: 5 }
      )
      
      // Should have no high-confidence matches
      expect(results.length).toBe(0)
    })
  })
  
  describe('Multi-Field Scoring', () => {
    it('should boost score when email matches', async () => {
      const results = await findMatchingSuppliersViaPgTrgm(
        { 
          name: 'Mega BigBox',
          email: 'sales@megabigbox.com'
        },
        merchantId,
        { minScore: 0.6, maxResults: 5 }
      )
      
      expect(results.length).toBeGreaterThan(0)
      
      // Find the match with matching email
      const emailMatch = results.find(r => r.supplier.contactEmail === 'sales@megabigbox.com')
      expect(emailMatch).toBeDefined()
      expect(emailMatch.breakdown.emailScore).toBeGreaterThan(0.9)
      
      // Score should be boosted by email match
      expect(emailMatch.matchScore).toBeGreaterThan(0.8)
    })
    
    it('should include breakdown of field scores', async () => {
      const results = await findMatchingSuppliersViaPgTrgm(
        { 
          name: 'Mega BigBox Inc',
          email: 'sales@megabigbox.com'
        },
        merchantId,
        { minScore: 0.6, maxResults: 1 }
      )
      
      expect(results.length).toBe(1)
      
      const match = results[0]
      expect(match.breakdown).toHaveProperty('nameScore')
      expect(match.breakdown).toHaveProperty('emailScore')
      expect(match.breakdown).toHaveProperty('exactMatch')
      expect(match.breakdown).toHaveProperty('availableFields')
      
      // Email should be in available fields
      expect(match.breakdown.availableFields).toContain('email')
    })
  })
  
  describe('Search Options', () => {
    it('should respect minScore threshold', async () => {
      const highThreshold = await findMatchingSuppliersViaPgTrgm(
        { name: 'Mega' },
        merchantId,
        { minScore: 0.9, maxResults: 10 }
      )
      
      const lowThreshold = await findMatchingSuppliersViaPgTrgm(
        { name: 'Mega' },
        merchantId,
        { minScore: 0.3, maxResults: 10 }
      )
      
      // Low threshold should return more results
      expect(lowThreshold.length).toBeGreaterThanOrEqual(highThreshold.length)
      
      // All results should meet threshold
      highThreshold.forEach(result => {
        expect(result.matchScore).toBeGreaterThanOrEqual(0.9)
      })
    })
    
    it('should respect maxResults limit', async () => {
      const results = await findMatchingSuppliersViaPgTrgm(
        { name: 'Mega' },
        merchantId,
        { minScore: 0.3, maxResults: 2 }
      )
      
      expect(results.length).toBeLessThanOrEqual(2)
    })
    
    it('should exclude inactive suppliers by default', async () => {
      const results = await findMatchingSuppliersViaPgTrgm(
        { name: 'Inactive Supplier' },
        merchantId,
        { minScore: 0.5, maxResults: 5, includeInactive: false }
      )
      
      // Should not find inactive supplier
      const hasInactive = results.some(r => r.supplier.status === 'inactive')
      expect(hasInactive).toBe(false)
    })
  })
  
  describe('Performance', () => {
    it('should complete search in under 100ms', async () => {
      const start = Date.now()
      
      await findMatchingSuppliersViaPgTrgm(
        { name: 'Mega BigBox' },
        merchantId,
        { minScore: 0.7, maxResults: 5 }
      )
      
      const elapsed = Date.now() - start
      
      console.log(`⏱️ Search completed in ${elapsed}ms`)
      expect(elapsed).toBeLessThan(100) // Should be much faster than JavaScript (67s)
    })
    
    it('should handle multiple searches efficiently', async () => {
      const searches = [
        'Mega BigBox',
        'Walmart',
        'Amazon',
        'Big Box',
        'Mega Store'
      ]
      
      const start = Date.now()
      
      const results = await Promise.all(
        searches.map(name => 
          findMatchingSuppliersViaPgTrgm(
            { name },
            merchantId,
            { minScore: 0.6, maxResults: 3 }
          )
        )
      )
      
      const elapsed = Date.now() - start
      
      console.log(`⏱️ ${searches.length} searches completed in ${elapsed}ms`)
      expect(elapsed).toBeLessThan(500) // Should handle batch efficiently
      expect(results.length).toBe(searches.length)
    })
  })
  
  describe('Best Match Helper', () => {
    it('should return single best match', async () => {
      const bestMatch = await getBestSupplierMatchViaPgTrgm(
        { name: 'Mega BigBox Inc' },
        merchantId,
        { minScore: 0.85 }
      )
      
      expect(bestMatch).not.toBeNull()
      expect(bestMatch.supplier.name).toBe('Mega BigBox Inc')
      expect(bestMatch.confidence).toBe('very_high')
    })
    
    it('should return null when no match meets threshold', async () => {
      const bestMatch = await getBestSupplierMatchViaPgTrgm(
        { name: 'NonExistent Company XYZ' },
        merchantId,
        { minScore: 0.85 }
      )
      
      expect(bestMatch).toBeNull()
    })
  })
  
  describe('Error Handling', () => {
    it('should handle missing supplier name gracefully', async () => {
      const results = await findMatchingSuppliersViaPgTrgm(
        { email: 'test@example.com' }, // No name
        merchantId,
        { minScore: 0.7, maxResults: 5 }
      )
      
      expect(results).toEqual([])
    })
    
    it('should handle empty supplier name', async () => {
      const results = await findMatchingSuppliersViaPgTrgm(
        { name: '' },
        merchantId,
        { minScore: 0.7, maxResults: 5 }
      )
      
      expect(results).toEqual([])
    })
    
    it('should handle missing merchant ID', async () => {
      const results = await findMatchingSuppliersViaPgTrgm(
        { name: 'Mega BigBox' },
        null, // No merchant ID
        { minScore: 0.7, maxResults: 5 }
      )
      
      expect(results).toEqual([])
    })
  })
  
  describe('Confidence Levels', () => {
    it('should assign very_high confidence for scores >= 0.90', async () => {
      const results = await findMatchingSuppliersViaPgTrgm(
        { name: 'Mega BigBox Inc' },
        merchantId,
        { minScore: 0.85, maxResults: 1 }
      )
      
      expect(results[0].matchScore).toBeGreaterThanOrEqual(0.90)
      expect(results[0].confidence).toBe('very_high')
    })
    
    it('should assign appropriate confidence levels', async () => {
      const results = await findMatchingSuppliersViaPgTrgm(
        { name: 'Mega' },
        merchantId,
        { minScore: 0.3, maxResults: 10 }
      )
      
      results.forEach(result => {
        if (result.matchScore >= 0.90) {
          expect(result.confidence).toBe('very_high')
        } else if (result.matchScore >= 0.80) {
          expect(result.confidence).toBe('high')
        } else if (result.matchScore >= 0.70) {
          expect(result.confidence).toBe('medium')
        } else {
          expect(result.confidence).toBe('low')
        }
      })
    })
  })
  
  describe('Metadata', () => {
    it('should include engine identifier', async () => {
      const results = await findMatchingSuppliersViaPgTrgm(
        { name: 'Mega BigBox' },
        merchantId,
        { minScore: 0.7, maxResults: 1 }
      )
      
      expect(results[0].engine).toBe('pg_trgm')
    })
    
    it('should include performance metadata', async () => {
      const results = await findMatchingSuppliersViaPgTrgm(
        { name: 'Mega BigBox' },
        merchantId,
        { minScore: 0.7, maxResults: 1 }
      )
      
      expect(results[0].metadata).toHaveProperty('queryTimeMs')
      expect(results[0].metadata).toHaveProperty('usedFields')
      expect(typeof results[0].metadata.queryTimeMs).toBe('number')
    })
  })
})
