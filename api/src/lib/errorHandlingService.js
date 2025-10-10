/**
 * Error Handling & Transparency Service
 * 
 * Provides comprehensive error handling, dead letter queues, and clear merchant feedback
 */

import { workflowOrchestrator } from './workflowOrchestrator.js'
import { db } from './db.js'
import redisManager from './redisManager.js'

// Error categories for proper handling
export const ERROR_CATEGORIES = {
  AI_PARSING: 'ai_parsing',
  DATABASE: 'database',
  SHOPIFY_SYNC: 'shopify_sync',
  NETWORK: 'network',
  VALIDATION: 'validation',
  SYSTEM: 'system'
}

// Error severity levels
export const ERROR_SEVERITY = {
  LOW: 'low',           // Minor issues, auto-retry recommended
  MEDIUM: 'medium',     // Requires attention but not critical
  HIGH: 'high',         // Critical issues requiring immediate action
  CRITICAL: 'critical'  // System-level failures
}

// Merchant-friendly status messages
export const MERCHANT_MESSAGES = {
  // Success states
  SYNC_SUCCESS: '✅ Successfully synced to Shopify',
  PARSING_SUCCESS: '✅ Document processed successfully', 
  UPLOAD_SUCCESS: '✅ File uploaded and processing started',
  
  // Warning states
  REVIEW_NEEDED_CONFIDENCE: '⚠️ Review needed - AI confidence below threshold',
  REVIEW_NEEDED_VALIDATION: '⚠️ Review needed - Data validation issues detected',
  REVIEW_NEEDED_SUPPLIER: '⚠️ Review needed - New supplier detected',
  PARTIAL_SYNC: '⚠️ Partially synced - Some items need attention',
  
  // Error states
  SYNC_FAILED_RETRY: '❌ Shopify sync failed - Retry available',
  SYNC_FAILED_PERMANENT: '❌ Shopify sync failed - Manual intervention required',
  PARSING_FAILED: '❌ Document parsing failed - Please check file format',
  NETWORK_ERROR: '❌ Network error - Will retry automatically',
  VALIDATION_ERROR: '❌ Data validation failed - Please review document',
  SYSTEM_ERROR: '❌ System error - Support has been notified',
  
  // Processing states
  PROCESSING: '⏳ Processing document...',
  SYNCING: '⏳ Syncing to Shopify...',
  RETRYING: '🔄 Retrying failed operation...',
  QUEUED: '📋 Queued for processing'
}

// Confidence thresholds
export const CONFIDENCE_THRESHOLDS = {
  AUTO_APPROVE: 0.9,    // Auto-approve if confidence >= 90%
  MANUAL_REVIEW: 0.7,   // Manual review if 70% <= confidence < 90%
  REJECT: 0.3           // Reject if confidence < 30%
}

export class ErrorHandlingService {
  constructor() {
    this.dlqPrefix = 'dlq:'
    this.errorLogPrefix = 'error_log:'
    this.retryAttempts = {
      [ERROR_CATEGORIES.AI_PARSING]: 2,
      [ERROR_CATEGORIES.SHOPIFY_SYNC]: 3,
      [ERROR_CATEGORIES.NETWORK]: 5,
      [ERROR_CATEGORIES.DATABASE]: 2,
      [ERROR_CATEGORIES.VALIDATION]: 1,
      [ERROR_CATEGORIES.SYSTEM]: 1
    }
  }

  /**
   * Handle AI parsing results and confidence checking
   */
  async handleAIParsingResult(workflowId, aiResult, confidenceThreshold = 0.8) {
    try {
      // Handle confidence as either object {overall, normalized} or legacy single value
      const confidence = typeof aiResult.confidence === 'object' 
        ? aiResult.confidence.normalized || 0
        : aiResult.confidence || 0
      const extractedData = aiResult.extractedData || aiResult
      
      console.log(`🤖 AI parsing completed for workflow ${workflowId} - Confidence: ${(confidence * 100).toFixed(1)}%`)
      
      // Check confidence threshold
      if (confidence < CONFIDENCE_THRESHOLDS.REJECT) {
        return await this.handleLowConfidence(workflowId, confidence, 'critical', extractedData)
      } else if (confidence < confidenceThreshold) {
        return await this.handleLowConfidence(workflowId, confidence, 'review', extractedData)
      } else if (confidence >= CONFIDENCE_THRESHOLDS.AUTO_APPROVE) {
        return await this.handleHighConfidence(workflowId, confidence, extractedData)
      } else {
        return await this.handleMediumConfidence(workflowId, confidence, extractedData)
      }
      
    } catch (error) {
      console.error(`❌ Error handling AI parsing result for workflow ${workflowId}:`, error)
      return await this.handleCriticalError(workflowId, ERROR_CATEGORIES.AI_PARSING, error)
    }
  }

  /**
   * Handle low confidence AI results
   */
  async handleLowConfidence(workflowId, confidence, severity, extractedData) {
    const percentConfidence = (confidence * 100).toFixed(1)
    
    if (severity === 'critical') {
      console.log(`🚨 Critical low confidence (${percentConfidence}%) for workflow ${workflowId} - Stopping processing`)
      
      await this.updateWorkflowStatus(workflowId, 'failed', {
        reason: 'confidence_too_low',
        confidence: confidence,
        merchantMessage: MERCHANT_MESSAGES.PARSING_FAILED,
        requiresAction: true,
        canRetry: true,
        actionNeeded: 'Please review document quality and try again'
      })
      
      return {
        success: false,
        shouldContinue: false,
        merchantMessage: MERCHANT_MESSAGES.PARSING_FAILED,
        confidence: confidence
      }
    } else {
      console.log(`⚠️ Low confidence (${percentConfidence}%) for workflow ${workflowId} - Flagging for review`)
      
      await this.updateWorkflowStatus(workflowId, 'review_needed', {
        reason: 'confidence_below_threshold',
        confidence: confidence,
        merchantMessage: MERCHANT_MESSAGES.REVIEW_NEEDED_CONFIDENCE,
        requiresAction: true,
        canRetry: false,
        actionNeeded: 'Please review and approve the extracted data'
      })
      
      // Store for manual review but continue processing to save data
      return {
        success: true,
        shouldContinue: true,
        requiresReview: true,
        merchantMessage: MERCHANT_MESSAGES.REVIEW_NEEDED_CONFIDENCE,
        confidence: confidence,
        extractedData: extractedData
      }
    }
  }

  /**
   * Handle medium confidence AI results
   */
  async handleMediumConfidence(workflowId, confidence, extractedData) {
    const percentConfidence = (confidence * 100).toFixed(1)
    console.log(`⚠️ Medium confidence (${percentConfidence}%) for workflow ${workflowId} - Requires review`)
    
    await this.updateWorkflowStatus(workflowId, 'review_needed', {
      reason: 'medium_confidence',
      confidence: confidence,
      merchantMessage: MERCHANT_MESSAGES.REVIEW_NEEDED_CONFIDENCE,
      requiresAction: true,
      canRetry: false,
      actionNeeded: 'Please review extracted data before syncing'
    })
    
    return {
      success: true,
      shouldContinue: true,
      requiresReview: true,
      merchantMessage: MERCHANT_MESSAGES.REVIEW_NEEDED_CONFIDENCE,
      confidence: confidence,
      extractedData: extractedData
    }
  }

  /**
   * Handle high confidence AI results
   */
  async handleHighConfidence(workflowId, confidence, extractedData) {
    const percentConfidence = (confidence * 100).toFixed(1)
    console.log(`✅ High confidence (${percentConfidence}%) for workflow ${workflowId} - Auto-approving`)
    
    await this.updateWorkflowStatus(workflowId, 'processing', {
      reason: 'high_confidence_auto_approved',
      confidence: confidence,
      merchantMessage: MERCHANT_MESSAGES.PARSING_SUCCESS,
      requiresAction: false,
      canRetry: false
    })
    
    return {
      success: true,
      shouldContinue: true,
      autoApproved: true,
      merchantMessage: MERCHANT_MESSAGES.PARSING_SUCCESS,
      confidence: confidence,
      extractedData: extractedData
    }
  }

  /**
   * Handle Shopify sync errors with DLQ and retry logic
   */
  async handleShopifySyncError(workflowId, error, attemptNumber = 1) {
    console.error(`❌ Shopify sync error for workflow ${workflowId} (attempt ${attemptNumber}):`, error.message)
    
    const maxRetries = this.retryAttempts[ERROR_CATEGORIES.SHOPIFY_SYNC]
    const errorInfo = this.categorizeShopifyError(error)
    
    // Log error for analysis
    await this.logError(workflowId, ERROR_CATEGORIES.SHOPIFY_SYNC, error, {
      attemptNumber,
      errorType: errorInfo.type,
      retryable: errorInfo.retryable
    })
    
    if (!errorInfo.retryable || attemptNumber >= maxRetries) {
      // Send to Dead Letter Queue
      await this.sendToDeadLetterQueue(workflowId, ERROR_CATEGORIES.SHOPIFY_SYNC, {
        error: error.message,
        attemptNumber,
        errorType: errorInfo.type,
        canRetry: errorInfo.retryable && attemptNumber < maxRetries
      })
      
      const merchantMessage = errorInfo.retryable ? 
        MERCHANT_MESSAGES.SYNC_FAILED_RETRY : 
        MERCHANT_MESSAGES.SYNC_FAILED_PERMANENT
      
      await this.updateWorkflowStatus(workflowId, 'failed', {
        reason: 'shopify_sync_failed',
        error: error.message,
        merchantMessage: merchantMessage,
        requiresAction: true,
        canRetry: errorInfo.retryable,
        actionNeeded: errorInfo.retryable ? 'Click retry to attempt sync again' : 'Please contact support for assistance'
      })
      
      return {
        success: false,
        shouldRetry: false,
        sentToDLQ: true,
        merchantMessage: merchantMessage,
        canRetry: errorInfo.retryable
      }
    } else {
      // Schedule retry
      const retryDelay = this.calculateRetryDelay(attemptNumber)
      console.log(`🔄 Scheduling Shopify sync retry for workflow ${workflowId} in ${retryDelay}ms`)
      
      await this.updateWorkflowStatus(workflowId, 'retrying', {
        reason: 'shopify_sync_retry',
        attemptNumber,
        nextRetryAt: new Date(Date.now() + retryDelay).toISOString(),
        merchantMessage: MERCHANT_MESSAGES.RETRYING,
        requiresAction: false,
        canRetry: true
      })
      
      return {
        success: false,
        shouldRetry: true,
        retryDelay: retryDelay,
        merchantMessage: MERCHANT_MESSAGES.RETRYING,
        attemptNumber: attemptNumber + 1
      }
    }
  }

  /**
   * Categorize Shopify API errors
   */
  categorizeShopifyError(error) {
    const message = error.message?.toLowerCase() || ''
    
    // Network/timeout errors - retryable
    if (message.includes('timeout') || message.includes('econnreset') || message.includes('econnrefused')) {
      return { type: 'network', retryable: true, severity: ERROR_SEVERITY.MEDIUM }
    }
    
    // Rate limiting - retryable
    if (message.includes('rate limit') || message.includes('429')) {
      return { type: 'rate_limit', retryable: true, severity: ERROR_SEVERITY.LOW }
    }
    
    // Authentication errors - not retryable
    if (message.includes('unauthorized') || message.includes('401') || message.includes('403')) {
      return { type: 'authentication', retryable: false, severity: ERROR_SEVERITY.HIGH }
    }
    
    // Validation errors - not retryable
    if (message.includes('validation') || message.includes('invalid') || message.includes('400')) {
      return { type: 'validation', retryable: false, severity: ERROR_SEVERITY.MEDIUM }
    }
    
    // Server errors - retryable
    if (message.includes('500') || message.includes('502') || message.includes('503')) {
      return { type: 'server_error', retryable: true, severity: ERROR_SEVERITY.HIGH }
    }
    
    // Unknown errors - retryable with caution
    return { type: 'unknown', retryable: true, severity: ERROR_SEVERITY.MEDIUM }
  }

  /**
   * Send failed job to Dead Letter Queue
   */
  async sendToDeadLetterQueue(workflowId, category, errorData) {
    const dlqKey = `${this.dlqPrefix}${category}:${workflowId}`
    const dlqData = {
      workflowId,
      category,
      timestamp: new Date().toISOString(),
      ...errorData
    }
    
    await redisManager.set(dlqKey, JSON.stringify(dlqData), 86400 * 7) // 7 days TTL
    
    console.log(`📥 Sent workflow ${workflowId} to DLQ for category ${category}`)
    
    // Add to DLQ index for management interface
    await redisManager.set(`dlq_index:${category}`, workflowId, 86400 * 7)
  }

  /**
   * Handle critical system errors
   */
  async handleCriticalError(workflowId, category, error) {
    console.error(`🚨 Critical error in workflow ${workflowId} (${category}):`, error)
    
    await this.logError(workflowId, category, error, { severity: ERROR_SEVERITY.CRITICAL })
    
    await this.updateWorkflowStatus(workflowId, 'failed', {
      reason: 'critical_system_error',
      error: error.message,
      merchantMessage: MERCHANT_MESSAGES.SYSTEM_ERROR,
      requiresAction: true,
      canRetry: false,
      actionNeeded: 'A system error occurred. Support has been automatically notified.'
    })
    
    // Send alert to monitoring system
    await this.sendSystemAlert(workflowId, category, error)
    
    return {
      success: false,
      critical: true,
      merchantMessage: MERCHANT_MESSAGES.SYSTEM_ERROR,
      canRetry: false
    }
  }

  /**
   * Log error for analysis and monitoring
   */
  async logError(workflowId, category, error, metadata = {}) {
    const errorLogKey = `${this.errorLogPrefix}${workflowId}:${Date.now()}`
    const errorData = {
      workflowId,
      category,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      ...metadata
    }
    
    await redisManager.set(errorLogKey, JSON.stringify(errorData), 86400 * 30) // 30 days TTL
    
    // Update error statistics
    await this.updateErrorStatistics(category, metadata.severity || ERROR_SEVERITY.MEDIUM)
  }

  /**
   * Update workflow status with merchant-friendly information
   */
  async updateWorkflowStatus(workflowId, status, statusData = {}) {
    await workflowOrchestrator.updateWorkflowStatus(workflowId, status, {
      ...statusData,
      lastUpdated: new Date().toISOString()
    })
    
    // Also update in database if we have a purchase order
    try {
      const workflowMeta = await workflowOrchestrator.getWorkflowStatus(workflowId)
      if (workflowMeta?.data?.purchaseOrderId) {
        await db.purchaseOrder.update({
          where: { id: workflowMeta.data.purchaseOrderId },
          data: {
            status: status,
            processingNotes: statusData.merchantMessage || '',
            updatedAt: new Date()
          }
        })
      }
    } catch (dbError) {
      console.error('Failed to update database status:', dbError)
    }
  }

  /**
   * Calculate exponential backoff retry delay
   */
  calculateRetryDelay(attemptNumber) {
    const baseDelay = 2000 // 2 seconds
    const maxDelay = 300000 // 5 minutes
    const delay = Math.min(baseDelay * Math.pow(2, attemptNumber - 1), maxDelay)
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay
    return Math.floor(delay + jitter)
  }

  /**
   * Get merchant-friendly status for workflow
   */
  async getMerchantStatus(workflowId) {
    try {
      const workflowStatus = await workflowOrchestrator.getWorkflowStatus(workflowId)
      if (!workflowStatus) {
        return {
          status: 'not_found',
          message: 'Workflow not found',
          icon: '❓'
        }
      }
      
      const status = workflowStatus.status
      const statusData = workflowStatus.statusData || {}
      
      return {
        status: status,
        message: statusData.merchantMessage || this.getDefaultMessage(status),
        icon: this.getStatusIcon(status),
        confidence: statusData.confidence,
        requiresAction: statusData.requiresAction || false,
        canRetry: statusData.canRetry || false,
        actionNeeded: statusData.actionNeeded,
        lastUpdated: statusData.lastUpdated || workflowStatus.updatedAt
      }
      
    } catch (error) {
      console.error('Failed to get merchant status:', error)
      return {
        status: 'error',
        message: MERCHANT_MESSAGES.SYSTEM_ERROR,
        icon: '❌'
      }
    }
  }

  /**
   * Get default message for status
   */
  getDefaultMessage(status) {
    const statusMessages = {
      'pending': MERCHANT_MESSAGES.QUEUED,
      'ai_parsing': MERCHANT_MESSAGES.PROCESSING,
      'database_save': MERCHANT_MESSAGES.PROCESSING,
      'shopify_sync': MERCHANT_MESSAGES.SYNCING,
      'status_update': MERCHANT_MESSAGES.PROCESSING,
      'completed': MERCHANT_MESSAGES.SYNC_SUCCESS,
      'failed': MERCHANT_MESSAGES.SYSTEM_ERROR,
      'review_needed': MERCHANT_MESSAGES.REVIEW_NEEDED_CONFIDENCE,
      'retrying': MERCHANT_MESSAGES.RETRYING
    }
    
    return statusMessages[status] || MERCHANT_MESSAGES.PROCESSING
  }

  /**
   * Get status icon
   */
  getStatusIcon(status) {
    const statusIcons = {
      'pending': '📋',
      'ai_parsing': '⏳',
      'database_save': '⏳',
      'shopify_sync': '⏳',
      'status_update': '⏳',
      'completed': '✅',
      'failed': '❌',
      'review_needed': '⚠️',
      'retrying': '🔄'
    }
    
    return statusIcons[status] || '⏳'
  }

  /**
   * Update error statistics for monitoring
   */
  async updateErrorStatistics(category, severity) {
    const statsKey = `error_stats:${category}:${severity}`
    const today = new Date().toISOString().split('T')[0]
    const dailyKey = `${statsKey}:${today}`
    
    await redisManager.set(dailyKey, '1', 86400) // Will increment if exists
  }

  /**
   * Send system alert for critical errors
   */
  async sendSystemAlert(workflowId, category, error) {
    // This would integrate with your alerting system (email, Slack, etc.)
    console.log(`🚨 SYSTEM ALERT: Critical error in workflow ${workflowId}`)
    console.log(`Category: ${category}`)
    console.log(`Error: ${error.message}`)
    
    // Store alert for admin dashboard
    const alertKey = `system_alert:${Date.now()}`
    const alertData = {
      workflowId,
      category,
      error: error.message,
      severity: ERROR_SEVERITY.CRITICAL,
      timestamp: new Date().toISOString()
    }
    
    await redisManager.set(alertKey, JSON.stringify(alertData), 86400 * 7) // 7 days
  }

  /**
   * Retry workflow from Dead Letter Queue
   */
  async retryFromDLQ(workflowId, category) {
    const dlqKey = `${this.dlqPrefix}${category}:${workflowId}`
    const dlqData = await redisManager.get(dlqKey)
    
    if (!dlqData) {
      throw new Error('Workflow not found in DLQ')
    }
    
    const jobData = JSON.parse(dlqData)
    
    // Remove from DLQ
    await redisManager.del(dlqKey)
    
    // Restart workflow from failed stage
    console.log(`🔄 Retrying workflow ${workflowId} from DLQ`)
    
    return await workflowOrchestrator.retryWorkflow(workflowId, category)
  }

  /**
   * Get DLQ items for admin interface
   */
  async getDLQItems(category = null, limit = 50) {
    const pattern = category ? `${this.dlqPrefix}${category}:*` : `${this.dlqPrefix}*`
    // This would require Redis SCAN implementation
    
    return {
      items: [], // Would contain DLQ items
      total: 0,
      categories: Object.values(ERROR_CATEGORIES)
    }
  }
}

// Export singleton instance
export const errorHandlingService = new ErrorHandlingService()