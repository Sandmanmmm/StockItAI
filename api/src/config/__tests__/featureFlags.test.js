/**
 * Tests for Feature Flags Configuration
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals'
import { FeatureFlags } from '../featureFlags.js'
import { db } from '../../lib/db.js'

describe('FeatureFlags', () => {
  let featureFlags
  let testMerchantId
  let originalEnv
  
  beforeAll(async () => {
    // Save original env
    originalEnv = {
      USE_PG_TRGM_FUZZY_MATCHING: process.env.USE_PG_TRGM_FUZZY_MATCHING,
      PG_TRGM_ROLLOUT_PERCENTAGE: process.env.PG_TRGM_ROLLOUT_PERCENTAGE
    }
    
    // Create test merchant
    const client = await db.getClient()
    const merchant = await client.merchant.create({
      data: {
        shopDomain: `feature-flags-test-${Date.now()}.myshopify.com`,
        name: 'Feature Flags Test Merchant',
        email: 'feature-flags-test@example.com',
        status: 'active',
        accessToken: 'test_token'
      }
    })
    testMerchantId = merchant.id
  })
  
  afterAll(async () => {
    // Cleanup test data
    const client = await db.getClient()
    
    if (client.merchantConfig?.deleteMany) {
      await client.merchantConfig.deleteMany({
        where: { merchantId: testMerchantId }
      })
    }
    
    await client.merchant.delete({
      where: { id: testMerchantId }
    })
    
    // Restore env
    if (originalEnv.USE_PG_TRGM_FUZZY_MATCHING) {
      process.env.USE_PG_TRGM_FUZZY_MATCHING = originalEnv.USE_PG_TRGM_FUZZY_MATCHING
    } else {
      delete process.env.USE_PG_TRGM_FUZZY_MATCHING
    }
    
    if (originalEnv.PG_TRGM_ROLLOUT_PERCENTAGE) {
      process.env.PG_TRGM_ROLLOUT_PERCENTAGE = originalEnv.PG_TRGM_ROLLOUT_PERCENTAGE
    } else {
      delete process.env.PG_TRGM_ROLLOUT_PERCENTAGE
    }
  })
  
  beforeEach(() => {
    // Create fresh instance for each test
    featureFlags = new FeatureFlags()
    
    // Clear env variables
    delete process.env.USE_PG_TRGM_FUZZY_MATCHING
    delete process.env.PG_TRGM_ROLLOUT_PERCENTAGE
  })
  
  afterEach(() => {
    // Clear cache after each test
    featureFlags.clearAllCache()
  })
  
  describe('Priority Order', () => {
    it('should prioritize request override over everything', async () => {
      // Set merchant setting to javascript
      await featureFlags.setMerchantEngine(testMerchantId, 'javascript')
      
      // Set env to false
      process.env.USE_PG_TRGM_FUZZY_MATCHING = 'false'
      
      // Request override should win
      const result = await featureFlags.usePgTrgmMatching(testMerchantId, 'pg_trgm')
      expect(result).toBe(true)
    })
    
    it('should prioritize merchant setting over global env', async () => {
      // Set merchant setting to pg_trgm
      await featureFlags.setMerchantEngine(testMerchantId, 'pg_trgm')
      
      // Set env to false
      process.env.USE_PG_TRGM_FUZZY_MATCHING = 'false'
      
      // Merchant setting should win
      const result = await featureFlags.usePgTrgmMatching(testMerchantId)
      expect(result).toBe(true)
    })
    
    it('should use global env when merchant has no setting', async () => {
      // Ensure no merchant setting
      await featureFlags.setMerchantEngine(testMerchantId, null)
      
      // Set env to true
      process.env.USE_PG_TRGM_FUZZY_MATCHING = 'true'
      
      const result = await featureFlags.usePgTrgmMatching(testMerchantId)
      expect(result).toBe(true)
    })
    
    it('should default to false when nothing is set', async () => {
      // Ensure no settings anywhere
      await featureFlags.setMerchantEngine(testMerchantId, null)
      delete process.env.USE_PG_TRGM_FUZZY_MATCHING
      delete process.env.PG_TRGM_ROLLOUT_PERCENTAGE
      
      const result = await featureFlags.usePgTrgmMatching(testMerchantId)
      expect(result).toBe(false)
    })
  })
  
  describe('Request Override', () => {
    it('should use pg_trgm when override is "pg_trgm"', async () => {
      const result = await featureFlags.usePgTrgmMatching(testMerchantId, 'pg_trgm')
      expect(result).toBe(true)
    })
    
    it('should use javascript when override is "javascript"', async () => {
      const result = await featureFlags.usePgTrgmMatching(testMerchantId, 'javascript')
      expect(result).toBe(false)
    })
    
    it('should ignore invalid override values', async () => {
      const result = await featureFlags.usePgTrgmMatching(testMerchantId, 'invalid')
      expect(result).toBe(false) // Falls back to default
    })
  })
  
  describe('Merchant Settings', () => {
    it('should set and retrieve merchant engine preference', async () => {
      await featureFlags.setMerchantEngine(testMerchantId, 'pg_trgm')
      
      const result = await featureFlags.usePgTrgmMatching(testMerchantId)
      expect(result).toBe(true)
    })
    
    it('should update existing merchant setting', async () => {
      await featureFlags.setMerchantEngine(testMerchantId, 'pg_trgm')
      await featureFlags.setMerchantEngine(testMerchantId, 'javascript')
      
      const result = await featureFlags.usePgTrgmMatching(testMerchantId)
      expect(result).toBe(false)
    })
    
    it('should remove merchant setting when set to null', async () => {
      await featureFlags.setMerchantEngine(testMerchantId, 'pg_trgm')
      await featureFlags.setMerchantEngine(testMerchantId, null)
      
      // Should fall back to default
      const result = await featureFlags.usePgTrgmMatching(testMerchantId)
      expect(result).toBe(false)
    })
    
    it('should throw error for invalid engine value', async () => {
      await expect(
        featureFlags.setMerchantEngine(testMerchantId, 'invalid')
      ).rejects.toThrow('Invalid engine')
    })
  })
  
  describe('Caching', () => {
    it('should cache merchant settings', async () => {
      await featureFlags.setMerchantEngine(testMerchantId, 'pg_trgm')
      
      // First call - cache miss
      await featureFlags.getMerchantSetting(testMerchantId, 'fuzzyMatchingEngine')
      
      // Second call - cache hit
      await featureFlags.getMerchantSetting(testMerchantId, 'fuzzyMatchingEngine')
      
      const stats = featureFlags.getCacheStats()
      expect(stats.hits).toBe(1)
      expect(stats.misses).toBeGreaterThanOrEqual(1)
    })
    
    it('should clear cache for specific merchant', async () => {
      await featureFlags.setMerchantEngine(testMerchantId, 'pg_trgm')
      await featureFlags.getMerchantSetting(testMerchantId, 'fuzzyMatchingEngine')
      
      // Clear cache
      featureFlags.clearMerchantCache(testMerchantId)
      
      const stats = featureFlags.getCacheStats()
      expect(stats.size).toBe(0)
    })
    
    it('should clear all cache', async () => {
      await featureFlags.setMerchantEngine(testMerchantId, 'pg_trgm')
      await featureFlags.getMerchantSetting(testMerchantId, 'fuzzyMatchingEngine')
      
      featureFlags.clearAllCache()
      
      const stats = featureFlags.getCacheStats()
      expect(stats.size).toBe(0)
      expect(stats.misses).toBeGreaterThanOrEqual(1)
    })
  })
  
  describe('Rollout Percentage', () => {
    it('should parse rollout percentage from env', () => {
      process.env.PG_TRGM_ROLLOUT_PERCENTAGE = '50'
      expect(featureFlags.getRolloutPercentage()).toBe(50)
    })
    
    it('should default to 0 when not set', () => {
      delete process.env.PG_TRGM_ROLLOUT_PERCENTAGE
      expect(featureFlags.getRolloutPercentage()).toBe(0)
    })
    
    it('should clamp percentage to 0-100 range', () => {
      process.env.PG_TRGM_ROLLOUT_PERCENTAGE = '150'
      expect(featureFlags.getRolloutPercentage()).toBe(100)
      
      process.env.PG_TRGM_ROLLOUT_PERCENTAGE = '-10'
      expect(featureFlags.getRolloutPercentage()).toBe(0)
    })
    
    it('should use consistent hashing for rollout groups', () => {
      // Same merchant should always get same result
      const result1 = featureFlags.isInRolloutGroup(testMerchantId, 50)
      const result2 = featureFlags.isInRolloutGroup(testMerchantId, 50)
      expect(result1).toBe(result2)
    })
    
    it('should include 0% of merchants at 0%', () => {
      const result = featureFlags.isInRolloutGroup(testMerchantId, 0)
      expect(result).toBe(false)
    })
    
    it('should include 100% of merchants at 100%', () => {
      const result = featureFlags.isInRolloutGroup(testMerchantId, 100)
      expect(result).toBe(true)
    })
    
    it('should apply rollout percentage when no other settings exist', async () => {
      await featureFlags.setMerchantEngine(testMerchantId, null)
      delete process.env.USE_PG_TRGM_FUZZY_MATCHING
      process.env.PG_TRGM_ROLLOUT_PERCENTAGE = '100'
      
      const result = await featureFlags.usePgTrgmMatching(testMerchantId)
      expect(result).toBe(true)
    })
  })
  
  describe('Adoption Rate', () => {
    it('should calculate adoption statistics', async () => {
      await featureFlags.setMerchantEngine(testMerchantId, 'pg_trgm')
      
      const adoption = await featureFlags.getPgTrgmAdoptionRate()
      
      expect(adoption).toHaveProperty('total')
      expect(adoption).toHaveProperty('pgTrgm')
      expect(adoption).toHaveProperty('javascript')
      expect(adoption).toHaveProperty('default')
      expect(adoption.pgTrgm).toHaveProperty('count')
      expect(adoption.pgTrgm).toHaveProperty('percentage')
    })
    
    it('should return zero stats for empty database', async () => {
      // This test will run in a clean state in some test environments
      const adoption = await featureFlags.getPgTrgmAdoptionRate()
      
      expect(adoption.total).toBeGreaterThanOrEqual(0)
      expect(adoption.pgTrgm.percentage).toBe(0)
    })
  })
  
  describe('Cache Statistics', () => {
    it('should track cache hit rate', async () => {
      await featureFlags.setMerchantEngine(testMerchantId, 'pg_trgm')
      
      // Cache miss
      await featureFlags.getMerchantSetting(testMerchantId, 'fuzzyMatchingEngine')
      
      // Cache hit
      await featureFlags.getMerchantSetting(testMerchantId, 'fuzzyMatchingEngine')
      
      const stats = featureFlags.getCacheStats()
      
      expect(stats).toHaveProperty('size')
      expect(stats).toHaveProperty('hits')
      expect(stats).toHaveProperty('misses')
      expect(stats).toHaveProperty('hitRate')
      expect(stats).toHaveProperty('dbQueries')
    })
  })
  
  describe('Configuration Summary', () => {
    it('should provide configuration summary', async () => {
      process.env.USE_PG_TRGM_FUZZY_MATCHING = 'true'
      process.env.PG_TRGM_ROLLOUT_PERCENTAGE = '50'
      
      const summary = await featureFlags.getConfigSummary()
      
      expect(summary).toHaveProperty('globalSetting')
      expect(summary).toHaveProperty('rolloutPercentage')
      expect(summary).toHaveProperty('adoption')
      expect(summary).toHaveProperty('cache')
      
      expect(summary.globalSetting).toBe('true')
      expect(summary.rolloutPercentage).toBe('50%')
    })
  })
  
  describe('Bulk Operations', () => {
    it('should enable pg_trgm for specific merchant', async () => {
      const success = await featureFlags.setMerchantEngine(testMerchantId, 'pg_trgm')
      expect(success).toBe(true)
      
      const result = await featureFlags.usePgTrgmMatching(testMerchantId)
      expect(result).toBe(true)
    })
    
    it('should disable pg_trgm for specific merchant', async () => {
      await featureFlags.setMerchantEngine(testMerchantId, 'pg_trgm')
      
      const success = await featureFlags.setMerchantEngine(testMerchantId, 'javascript')
      expect(success).toBe(true)
      
      const result = await featureFlags.usePgTrgmMatching(testMerchantId)
      expect(result).toBe(false)
    })
  })
  
  describe('Integration with usePgTrgmMatching', () => {
    it('should integrate all priority levels correctly', async () => {
      await featureFlags.setMerchantEngine(testMerchantId, null)

      // Test 1: Default (nothing set)
      const result1 = await featureFlags.usePgTrgmMatching(testMerchantId)
      expect(result1).toBe(false)
      
      // Test 2: Global env set
      process.env.USE_PG_TRGM_FUZZY_MATCHING = 'true'
      const result2 = await featureFlags.usePgTrgmMatching(testMerchantId)
      expect(result2).toBe(true)
      
      // Test 3: Merchant setting overrides global
      await featureFlags.setMerchantEngine(testMerchantId, 'javascript')
      const result3 = await featureFlags.usePgTrgmMatching(testMerchantId)
      expect(result3).toBe(false)
      
      // Test 4: Request override wins all
      const result4 = await featureFlags.usePgTrgmMatching(testMerchantId, 'pg_trgm')
      expect(result4).toBe(true)
    })
  })
})
