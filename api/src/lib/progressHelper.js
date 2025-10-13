/**
 * ProgressHelper - Granular Progress Tracking for Multi-Stage Workflows
 * 
 * Converts local stage progress (0-100%) to global progress (0-100%)
 * with proper range allocation across stages.
 * 
 * Stage Ranges:
 * - AI Parsing: 0-40% (40% of total)
 * - Database Save: 40-60% (20% of total)
 * - Shopify Sync: 60-100% (40% of total)
 * 
 * Example:
 *   const helper = new ProgressHelper({
 *     stage: 'ai_parsing',
 *     merchantId: 'cmg...',
 *     purchaseOrderId: 'cmg...',
 *     workflowId: 'wf_...',
 *     redisManager: redisManagerInstance
 *   })
 *   
 *   // Local 50% of ai_parsing (0-40% range) → Global 20%
 *   await helper.publishProgress(50, 'Processing chunk 2/3')
 */

export class ProgressHelper {
  /**
   * @param {Object} config
   * @param {string} config.stage - Current stage ('ai_parsing', 'database_save', 'shopify_sync')
   * @param {string} config.merchantId - Merchant ID for Redis channel
   * @param {string} config.purchaseOrderId - PO ID
   * @param {string} config.workflowId - Workflow ID
   * @param {Object} config.redisManager - Redis manager instance
   */
  constructor({ stage, merchantId, purchaseOrderId, workflowId, redisManager }) {
    this.merchantId = merchantId
    this.purchaseOrderId = purchaseOrderId
    this.workflowId = workflowId
    this.redisManager = redisManager
    
    // Stage progress ranges (total = 100%)
    this.stageRanges = {
      ai_parsing: { start: 0, range: 40 },
      database_save: { start: 40, range: 20 },
      shopify_sync: { start: 60, range: 40 }
    }
    
    this.currentStage = stage
    this.lastPublishedProgress = -1 // Track to avoid duplicate publishes
    
    // Validate stage
    if (!this.stageRanges[stage]) {
      console.warn(`⚠️ ProgressHelper: Unknown stage "${stage}"`)
    }
  }
  
  /**
   * Update the current stage
   * @param {string} stage - New stage name
   */
  setStage(stage) {
    if (!this.stageRanges[stage]) {
      console.warn(`⚠️ ProgressHelper: Unknown stage "${stage}"`)
      return
    }
    
    this.currentStage = stage
    this.lastPublishedProgress = -1 // Reset for new stage
    
    console.log(`📊 ProgressHelper: Stage changed to "${stage}"`)
  }
  
  /**
   * Publish progress update
   * @param {number} localProgress - Progress within current stage (0-100)
   * @param {string} message - User-friendly message
   * @param {Object} details - Additional details (chunk info, item counts, etc.)
   */
  async publishProgress(localProgress, message, details = {}) {
    if (!this.currentStage) {
      console.warn('⚠️ ProgressHelper: No stage set, cannot publish progress')
      return
    }
    
    const stageConfig = this.stageRanges[this.currentStage]
    if (!stageConfig) {
      console.warn(`⚠️ ProgressHelper: Unknown stage "${this.currentStage}"`)
      return
    }
    
    // Calculate global progress (0-100)
    // Formula: globalProgress = stageStart + (localProgress / 100) * stageRange
    const globalProgress = stageConfig.start + (localProgress / 100) * stageConfig.range
    const roundedProgress = Math.round(globalProgress)
    
    // Only publish if progress changed by at least 1%
    if (roundedProgress === this.lastPublishedProgress) {
      return
    }
    
    this.lastPublishedProgress = roundedProgress
    
    // Publish to Redis (which SSE will forward to frontend)
    try {
      await this.redisManager.publishMerchantProgress(this.merchantId, {
        poId: this.purchaseOrderId,
        workflowId: this.workflowId,
        stage: this.currentStage,
        progress: roundedProgress,
        message,
        timestamp: Date.now(),
        ...details
      })
      
      console.log(`📊 Progress: ${roundedProgress}% [${this.currentStage}] - ${message}`, details)
    } catch (error) {
      console.error('❌ ProgressHelper: Failed to publish progress:', error)
    }
  }
  
  /**
   * Helper for linear progress (e.g., processing N items)
   * Automatically calculates local progress based on current/total
   * 
   * @param {number} current - Current item index (0-based)
   * @param {number} total - Total items
   * @param {string} itemName - Name of item being processed
   * @param {Object} additionalDetails - Additional details to include
   */
  async publishLinearProgress(current, total, itemName, additionalDetails = {}) {
    if (total <= 0) {
      console.warn('⚠️ ProgressHelper: Invalid total for linear progress')
      return
    }
    
    // Calculate local progress (0-100%)
    const localProgress = ((current + 1) / total) * 100
    const message = `Processing ${itemName} ${current + 1}/${total}`
    
    await this.publishProgress(localProgress, message, {
      current: current + 1,
      total,
      itemName,
      ...additionalDetails
    })
  }
  
  /**
   * Publish sub-stage progress with custom range within stage
   * 
   * Example: PDF parsing is 0-20% of AI Parsing stage
   *   publishSubStageProgress(50, 0, 20, 'Parsing page 3/5')
   *   → Local 10% of AI stage → Global 4%
   * 
   * @param {number} subStageLocalProgress - Progress within sub-stage (0-100)
   * @param {number} subStageStart - Sub-stage start % within stage (0-100)
   * @param {number} subStageRange - Sub-stage range % within stage
   * @param {string} message - User-friendly message
   * @param {Object} details - Additional details
   */
  async publishSubStageProgress(subStageLocalProgress, subStageStart, subStageRange, message, details = {}) {
    // Convert sub-stage progress to stage-level progress
    const stageLocalProgress = subStageStart + (subStageLocalProgress / 100) * subStageRange
    
    await this.publishProgress(stageLocalProgress, message, details)
  }
  
  /**
   * Publish stage completion (100% of stage)
   * @param {string} message - Completion message
   * @param {Object} details - Additional details
   */
  async publishStageComplete(message, details = {}) {
    await this.publishProgress(100, message, {
      ...details,
      completed: true
    })
  }
}

/**
 * Create a ProgressHelper instance for a specific stage
 * @param {string} stage - Stage name
 * @param {Object} context - Workflow context (merchantId, purchaseOrderId, workflowId, redisManager)
 * @returns {ProgressHelper}
 */
export function createProgressHelper(stage, context) {
  return new ProgressHelper({
    stage,
    merchantId: context.merchantId,
    purchaseOrderId: context.purchaseOrderId,
    workflowId: context.workflowId,
    redisManager: context.redisManager
  })
}
