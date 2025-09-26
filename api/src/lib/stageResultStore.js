import redisManager from './redisManager.js'

/**
 * Service to persist and retrieve workflow stage results in Redis
 * Ensures data is accumulated across all workflow stages
 */
class StageResultStore {
  constructor() {
    this.redis = null
    this.defaultTTL = 7200 // 2 hours
  }

  async initialize() {
    try {
      // Use the main Redis connection from redisManager
      await redisManager.waitForConnection()
      this.redis = redisManager.redis
      if (!this.redis) {
        throw new Error('Redis client not available from RedisManager')
      }
      console.log('✅ StageResultStore initialized successfully')
      return true
    } catch (error) {
      console.error('❌ Failed to initialize StageResultStore:', error)
      throw error
    }
  }

  /**
   * Save the result of a specific workflow stage
   */
  async saveStageResult(workflowId, stage, result) {
    try {
      if (!this.redis) {
        await this.initialize()
      }

      const key = `workflow:${workflowId}:stage:${stage}:result`
      const value = JSON.stringify({
        stage,
        timestamp: new Date().toISOString(),
        result
      })

      await this.redis.setex(key, this.defaultTTL, value)
      console.log(`✅ Saved ${stage} result for workflow ${workflowId}`)
      return true
    } catch (error) {
      console.error(`❌ Failed to save stage result for ${stage}:`, error)
      throw error
    }
  }

  /**
   * Get the result of a specific workflow stage
   */
  async getStageResult(workflowId, stage) {
    try {
      if (!this.redis) {
        await this.initialize()
      }

      const key = `workflow:${workflowId}:stage:${stage}:result`
      const value = await this.redis.get(key)
      
      if (!value) {
        console.log(`⚠️ No result found for ${stage} in workflow ${workflowId}`)
        return null
      }

      const data = JSON.parse(value)
      return data.result
    } catch (error) {
      console.error(`❌ Failed to get stage result for ${stage}:`, error)
      return null
    }
  }

  /**
   * Get all stage results for a workflow
   */
  async getAllStageResults(workflowId) {
    try {
      if (!this.redis) {
        await this.initialize()
      }

      const stages = ['ai_parsing', 'database_save', 'shopify_sync', 'status_update']
      const results = {}

      for (const stage of stages) {
        const result = await this.getStageResult(workflowId, stage)
        if (result) {
          results[stage] = result
        }
      }

      console.log(`📊 Retrieved ${Object.keys(results).length} stage results for workflow ${workflowId}`)
      return results
    } catch (error) {
      console.error(`❌ Failed to get all stage results:`, error)
      return {}
    }
  }

  /**
   * Get accumulated workflow data (combines all stage results)
   */
  async getAccumulatedData(workflowId) {
    try {
      const stageResults = await this.getAllStageResults(workflowId)
      
      // Build accumulated data from all stages
      const accumulated = {
        workflowId,
        timestamp: new Date().toISOString(),
        stages: {}
      }

      // Extract key data from each stage
      if (stageResults.ai_parsing) {
        accumulated.aiResult = stageResults.ai_parsing.aiResult || stageResults.ai_parsing
        accumulated.stages.ai_parsing = {
          completed: true,
          confidence: stageResults.ai_parsing.confidence,
          supplier: stageResults.ai_parsing.supplier,
          lineItems: stageResults.ai_parsing.lineItems
        }
      }

      if (stageResults.database_save) {
        accumulated.dbResult = stageResults.database_save.dbResult || stageResults.database_save
        accumulated.purchaseOrderId = stageResults.database_save.purchaseOrderId || 
                                     stageResults.database_save.purchaseOrder?.id
        accumulated.stages.database_save = {
          completed: true,
          purchaseOrderId: accumulated.purchaseOrderId,
          lineItemsCreated: stageResults.database_save.lineItems?.length || 0
        }
      }

      if (stageResults.shopify_sync) {
        accumulated.shopifyResult = stageResults.shopify_sync.shopifyResult || stageResults.shopify_sync
        accumulated.stages.shopify_sync = {
          completed: true,
          synced: stageResults.shopify_sync.synced || false,
          shopifyOrderId: stageResults.shopify_sync.shopifyOrderId
        }
      }

      return accumulated
    } catch (error) {
      console.error(`❌ Failed to get accumulated data:`, error)
      return null
    }
  }

  /**
   * Clear all stage results for a workflow (cleanup)
   */
  async clearWorkflowResults(workflowId) {
    try {
      if (!this.redis) {
        await this.initialize()
      }

      const pattern = `workflow:${workflowId}:stage:*:result`
      const keys = await this.redis.keys(pattern)
      
      if (keys.length > 0) {
        await this.redis.del(...keys)
        console.log(`🧹 Cleared ${keys.length} stage results for workflow ${workflowId}`)
      }
      
      return true
    } catch (error) {
      console.error(`❌ Failed to clear workflow results:`, error)
      return false
    }
  }

  /**
   * Extend TTL for active workflow results
   */
  async extendTTL(workflowId, ttl = 3600) {
    try {
      if (!this.redis) {
        await this.initialize()
      }

      const pattern = `workflow:${workflowId}:stage:*:result`
      const keys = await this.redis.keys(pattern)
      
      for (const key of keys) {
        await this.redis.expire(key, ttl)
      }
      
      console.log(`⏰ Extended TTL for ${keys.length} stage results in workflow ${workflowId}`)
      return true
    } catch (error) {
      console.error(`❌ Failed to extend TTL:`, error)
      return false
    }
  }
}

// Export singleton instance
export const stageResultStore = new StageResultStore()