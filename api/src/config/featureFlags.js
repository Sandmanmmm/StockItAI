/**
 * Feature Flags Configuration
 * 
 * Centralized management of feature toggles for gradual rollout and A/B testing.
 * 
 * Priority Order (highest to lowest):
 * 1. Request-level override (options.engine parameter)
 * 2. Merchant-specific setting (database MerchantConfig.settings)
 * 3. Global environment variable (USE_PG_TRGM_FUZZY_MATCHING)
 * 4. Default: "javascript" (safe fallback)
 * 
 * Usage:
 *   const usePgTrgm = await featureFlags.usePgTrgmMatching(merchantId, override)
 */

import { db } from '../lib/db.js'

class FeatureFlags {
  constructor() {
    // In-memory cache for merchant settings
    this.cache = new Map()
    this.cacheTTL = 5 * 60 * 1000 // 5 minutes
    
    // Statistics tracking
    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      dbQueries: 0
    }
    
    console.log('🚩 Feature Flags initialized')
  }
  
  /**
   * Check if pg_trgm fuzzy matching should be used
   * 
   * Priority order:
   * 1. Request-level override (highest priority)
   * 2. Merchant-specific setting
   * 3. Global environment variable
   * 4. Default: false (use JavaScript implementation)
   * 
   * @param {string} merchantId - Merchant ID
   * @param {string} [override] - Optional override ('pg_trgm' | 'javascript')
   * @returns {Promise<boolean>} - True if pg_trgm should be used
   */
  async usePgTrgmMatching(merchantId, override = null) {
    // 1. Request-level override (highest priority)
    if (override === 'pg_trgm') {
      console.log(`🚩 [${merchantId}] Using pg_trgm (request override)`)
      return true
    }
    if (override === 'javascript') {
      console.log(`🚩 [${merchantId}] Using javascript (request override)`)
      return false
    }
    
    // 2. Merchant-specific setting
    const merchantSetting = await this.getMerchantSetting(merchantId, 'fuzzyMatchingEngine')
    if (merchantSetting === 'pg_trgm') {
      console.log(`🚩 [${merchantId}] Using pg_trgm (merchant setting)`)
      return true
    }
    if (merchantSetting === 'javascript') {
      console.log(`🚩 [${merchantId}] Using javascript (merchant setting)`)
      return false
    }
    
    // 3. Global environment variable
    const globalSetting = process.env.USE_PG_TRGM_FUZZY_MATCHING
    if (globalSetting === 'true') {
      console.log(`🚩 [${merchantId}] Using pg_trgm (global env)`)
      return true
    }
    if (globalSetting === 'false') {
      console.log(`🚩 [${merchantId}] Using javascript (global env)`)
      return false
    }
    
    // 4. Check rollout percentage (for gradual rollout)
    const rolloutPercentage = this.getRolloutPercentage()
    if (rolloutPercentage > 0) {
      const shouldUse = this.isInRolloutGroup(merchantId, rolloutPercentage)
      if (shouldUse) {
        console.log(`🚩 [${merchantId}] Using pg_trgm (rollout: ${rolloutPercentage}%)`)
        return true
      }
    }
    
    // 5. Default: false (use JavaScript implementation - safest)
    console.log(`🚩 [${merchantId}] Using javascript (default)`)
    return false
  }
  
  /**
   * Get merchant-specific setting from database
   * Uses caching to minimize database queries
   * 
   * @param {string} merchantId - Merchant ID
   * @param {string} settingKey - Setting key to retrieve
   * @returns {Promise<any>} - Setting value or null
   */
  async getMerchantSetting(merchantId, settingKey) {
    const cacheKey = `${merchantId}:${settingKey}`
    const cached = this.cache.get(cacheKey)
    
    // Check cache first
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      this.stats.cacheHits++
      return cached.value
    }
    
    this.stats.cacheMisses++
    
    // Fetch from database
    try {
      const client = await db.getClient()
      
      // Verify client has merchantConfig model
      if (!client || !client.merchantConfig) {
        console.warn(`⚠️  Prisma client not ready or merchantConfig model not available`)
        return null
      }
      
      this.stats.dbQueries++
      
      const merchantConfig = await client.merchantConfig.findUnique({
        where: { merchantId },
        select: { settings: true }
      })
      
      const value = merchantConfig?.settings?.[settingKey] || null
      
      // Cache result
      this.cache.set(cacheKey, {
        value,
        timestamp: Date.now()
      })
      
      return value
      
    } catch (error) {
      console.error(`❌ Error fetching merchant setting ${settingKey}:`, error.message)
      return null
    }
  }
  
  /**
   * Set merchant-specific feature flag
   * 
   * @param {string} merchantId - Merchant ID
   * @param {string} engine - Engine to use ('pg_trgm' | 'javascript' | null)
   * @returns {Promise<boolean>} - Success status
   */
  async setMerchantEngine(merchantId, engine) {
    if (!['pg_trgm', 'javascript', null].includes(engine)) {
      throw new Error(`Invalid engine: ${engine}. Must be 'pg_trgm', 'javascript', or null`)
    }
    
    try {
      const client = await db.getClient()
      
      // Verify client has merchantConfig model
      if (!client || !client.merchantConfig) {
        console.warn(`⚠️  Prisma client not ready or merchantConfig model not available`)
        return false
      }
      
      // Get or create merchant config
      let config = await client.merchantConfig.findUnique({
        where: { merchantId }
      })
      
      if (!config) {
        // Create new config
        config = await client.merchantConfig.create({
          data: {
            merchantId,
            settings: {
              fuzzyMatchingEngine: engine
            }
          }
        })
      } else {
        // Update existing config
        config = await client.merchantConfig.update({
          where: { merchantId },
          data: {
            settings: {
              ...config.settings,
              fuzzyMatchingEngine: engine
            }
          }
        })
      }
      
      // Clear cache for this merchant
      this.clearMerchantCache(merchantId)
      
      console.log(`✅ Set fuzzy matching engine for ${merchantId}: ${engine}`)
      return true
      
    } catch (error) {
      console.error(`❌ Error setting merchant engine:`, error)
      return false
    }
  }
  
  /**
   * Get rollout percentage from environment
   * 
   * @returns {number} - Percentage (0-100)
   */
  getRolloutPercentage() {
    const percentage = parseInt(process.env.PG_TRGM_ROLLOUT_PERCENTAGE || '0', 10)
    return Math.max(0, Math.min(100, percentage)) // Clamp to 0-100
  }
  
  /**
   * Determine if merchant is in rollout group
   * Uses consistent hashing so same merchant always gets same result
   * 
   * @param {string} merchantId - Merchant ID
   * @param {number} percentage - Rollout percentage (0-100)
   * @returns {boolean} - True if merchant is in rollout group
   */
  isInRolloutGroup(merchantId, percentage) {
    if (percentage === 0) return false
    if (percentage === 100) return true
    
    // Simple hash function for consistent merchant assignment
    const hash = merchantId.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0)
    }, 0)
    
    const bucket = Math.abs(hash) % 100
    return bucket < percentage
  }
  
  /**
   * Clear cache for specific merchant
   * 
   * @param {string} merchantId - Merchant ID
   */
  clearMerchantCache(merchantId) {
    let cleared = 0
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${merchantId}:`)) {
        this.cache.delete(key)
        cleared++
      }
    }
    
    if (cleared > 0) {
      console.log(`🗑️ Cleared ${cleared} cache entries for merchant ${merchantId}`)
    }
  }
  
  /**
   * Clear all cache
   */
  clearAllCache() {
    const size = this.cache.size
    this.cache.clear()
    console.log(`🗑️ Cleared all cache (${size} entries)`)
  }
  
  /**
   * Get percentage of merchants using pg_trgm
   * For monitoring rollout progress
   * 
   * @returns {Promise<Object>} - Adoption statistics
   */
  async getPgTrgmAdoptionRate() {
    try {
      const client = await db.getClient()
      
      const configs = await client.merchantConfig.findMany({
        select: { 
          merchantId: true,
          settings: true 
        }
      })
      
      const total = configs.length
      const pgTrgmCount = configs.filter(
        c => c.settings?.fuzzyMatchingEngine === 'pg_trgm'
      ).length
      const javascriptCount = configs.filter(
        c => c.settings?.fuzzyMatchingEngine === 'javascript'
      ).length
      const defaultCount = total - pgTrgmCount - javascriptCount
      
      return {
        total,
        pgTrgm: {
          count: pgTrgmCount,
          percentage: total > 0 ? ((pgTrgmCount / total) * 100).toFixed(1) : 0
        },
        javascript: {
          count: javascriptCount,
          percentage: total > 0 ? ((javascriptCount / total) * 100).toFixed(1) : 0
        },
        default: {
          count: defaultCount,
          percentage: total > 0 ? ((defaultCount / total) * 100).toFixed(1) : 0
        }
      }
      
    } catch (error) {
      console.error('❌ Error calculating adoption rate:', error)
      return {
        total: 0,
        pgTrgm: { count: 0, percentage: 0 },
        javascript: { count: 0, percentage: 0 },
        default: { count: 0, percentage: 0 }
      }
    }
  }
  
  /**
   * Get cache statistics
   * 
   * @returns {Object} - Cache stats
   */
  getCacheStats() {
    const hitRate = this.stats.cacheHits + this.stats.cacheMisses > 0
      ? ((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100).toFixed(1)
      : 0
    
    return {
      size: this.cache.size,
      hits: this.stats.cacheHits,
      misses: this.stats.cacheMisses,
      hitRate: `${hitRate}%`,
      dbQueries: this.stats.dbQueries
    }
  }
  
  /**
   * Get current configuration summary
   * 
   * @returns {Object} - Configuration summary
   */
  async getConfigSummary() {
    const adoption = await this.getPgTrgmAdoptionRate()
    const cacheStats = this.getCacheStats()
    const rolloutPercentage = this.getRolloutPercentage()
    
    return {
      globalSetting: process.env.USE_PG_TRGM_FUZZY_MATCHING || 'not set',
      rolloutPercentage: `${rolloutPercentage}%`,
      adoption,
      cache: cacheStats
    }
  }
  
  /**
   * Enable pg_trgm for all merchants
   * Use with caution - for final rollout only
   * 
   * @returns {Promise<number>} - Number of merchants updated
   */
  async enablePgTrgmForAll() {
    console.warn('⚠️ Enabling pg_trgm for ALL merchants')
    
    try {
      const client = await db.getClient()
      
      // Get all merchants
      const merchants = await client.merchant.findMany({
        select: { id: true }
      })
      
      let updated = 0
      
      for (const merchant of merchants) {
        const success = await this.setMerchantEngine(merchant.id, 'pg_trgm')
        if (success) updated++
      }
      
      console.log(`✅ Enabled pg_trgm for ${updated}/${merchants.length} merchants`)
      return updated
      
    } catch (error) {
      console.error('❌ Error enabling pg_trgm for all:', error)
      return 0
    }
  }
  
  /**
   * Disable pg_trgm for all merchants (emergency rollback)
   * 
   * @returns {Promise<number>} - Number of merchants updated
   */
  async disablePgTrgmForAll() {
    console.warn('⚠️ Disabling pg_trgm for ALL merchants (emergency rollback)')
    
    try {
      const client = await db.getClient()
      
      // Get all merchants with pg_trgm enabled
      const configs = await client.merchantConfig.findMany({
        where: {
          settings: {
            path: ['fuzzyMatchingEngine'],
            equals: 'pg_trgm'
          }
        }
      })
      
      let updated = 0
      
      for (const config of configs) {
        const success = await this.setMerchantEngine(config.merchantId, 'javascript')
        if (success) updated++
      }
      
      console.log(`✅ Disabled pg_trgm for ${updated} merchants`)
      return updated
      
    } catch (error) {
      console.error('❌ Error disabling pg_trgm for all:', error)
      return 0
    }
  }
}

// Export singleton instance
export const featureFlags = new FeatureFlags()

// Export class for testing
export { FeatureFlags }
