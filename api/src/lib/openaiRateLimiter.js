/**
 * OpenAI Error Mitigation and Rate Limiting Service
 * Implements exponential backoff, rate limiting, and error recovery
 */

import { EventEmitter } from 'events'

export class OpenAIRateLimiter extends EventEmitter {
  constructor(options = {}) {
    super()
    
    // Rate limiting configuration
    this.maxRequestsPerMinute = options.maxRequestsPerMinute || 20
    this.maxTokensPerMinute = options.maxTokensPerMinute || 40000
    this.maxRetries = options.maxRetries || 5
    this.baseDelay = options.baseDelay || 1000 // 1 second
    this.maxDelay = options.maxDelay || 60000 // 1 minute
    this.jitterFactor = options.jitterFactor || 0.1
    
    // Request tracking
    this.requestHistory = []
    this.tokenHistory = []
    this.isThrottled = false
    this.quotaExceeded = false
    
    // Error patterns for different retry strategies
    this.retryableErrors = [
      'rate_limit_exceeded',
      'server_error', 
      'timeout',
      'connection_error',
      'insufficient_quota'
    ]
    
    this.fatalErrors = [
      'invalid_api_key',
      'model_not_found',
      'invalid_request_error'
    ]
  }

  /**
   * Check if we can make a request based on current rate limits
   */
  canMakeRequest(estimatedTokens = 1000) {
    const now = Date.now()
    const oneMinuteAgo = now - 60000

    // Clean old entries
    this.requestHistory = this.requestHistory.filter(time => time > oneMinuteAgo)
    this.tokenHistory = this.tokenHistory.filter(entry => entry.timestamp > oneMinuteAgo)

    // Check request rate limit
    if (this.requestHistory.length >= this.maxRequestsPerMinute) {
      return false
    }

    // Check token rate limit
    const tokensUsedInLastMinute = this.tokenHistory.reduce((sum, entry) => sum + entry.tokens, 0)
    if (tokensUsedInLastMinute + estimatedTokens > this.maxTokensPerMinute) {
      return false
    }

    return true
  }

  /**
   * Record a request for rate limiting tracking
   */
  recordRequest(tokensUsed) {
    const now = Date.now()
    this.requestHistory.push(now)
    this.tokenHistory.push({ timestamp: now, tokens: tokensUsed })
  }

  /**
   * Calculate delay for exponential backoff with jitter
   */
  calculateBackoffDelay(attempt) {
    const exponentialDelay = Math.min(
      this.baseDelay * Math.pow(2, attempt),
      this.maxDelay
    )
    
    // Add random jitter to prevent thundering herd
    const jitter = exponentialDelay * this.jitterFactor * Math.random()
    return exponentialDelay + jitter
  }

  /**
   * Determine if error is retryable
   */
  isRetryableError(error) {
    if (!error) return false
    
    const errorMessage = error.message?.toLowerCase() || ''
    const errorCode = error.code?.toLowerCase() || ''
    
    // Check for specific retryable patterns
    return this.retryableErrors.some(pattern => 
      errorMessage.includes(pattern) || errorCode.includes(pattern)
    ) || error.status >= 500 // Server errors
  }

  /**
   * Check if error indicates quota exceeded
   */
  isQuotaError(error) {
    if (!error) return false
    
    const errorMessage = error.message?.toLowerCase() || ''
    return errorMessage.includes('quota') || 
           errorMessage.includes('billing') ||
           error.status === 429
  }

  /**
   * Wait for rate limit window to reset
   */
  async waitForRateLimit() {
    const now = Date.now()
    const oldestRequest = Math.min(...this.requestHistory)
    const timeToWait = 60000 - (now - oldestRequest) + 1000 // Add 1s buffer
    
    if (timeToWait > 0) {
      console.log(`⏱️ Rate limit reached, waiting ${Math.round(timeToWait/1000)}s...`)
      await this.sleep(timeToWait)
    }
  }

  /**
   * Execute OpenAI request with retry logic and rate limiting
   */
  async executeWithRetry(requestFn, options = {}) {
    const { 
      estimatedTokens = 1000, 
      requestType = 'completion',
      priority = 'normal'
    } = options

    // Check for quota exceeded state
    if (this.quotaExceeded) {
      throw new Error('OpenAI quota exceeded. Please check billing and upgrade plan.')
    }

    let lastError = null
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        // Check rate limits before attempting
        if (!this.canMakeRequest(estimatedTokens)) {
          await this.waitForRateLimit()
        }

        // Execute the request
        const startTime = Date.now()
        const result = await requestFn()
        const duration = Date.now() - startTime
        
        // Record successful request
        const actualTokens = result.usage?.total_tokens || estimatedTokens
        this.recordRequest(actualTokens)
        
        // Emit success event
        this.emit('request_success', {
          attempt: attempt + 1,
          duration,
          tokens: actualTokens,
          type: requestType
        })
        
        return result
        
      } catch (error) {
        lastError = error
        
        // Check if it's a quota error
        if (this.isQuotaError(error)) {
          this.quotaExceeded = true
          this.emit('quota_exceeded', error)
          throw new Error('OpenAI quota exceeded. Please check your billing and usage limits.')
        }
        
        // Check if error is retryable
        if (!this.isRetryableError(error) || attempt === this.maxRetries - 1) {
          this.emit('request_failed', {
            error,
            attempt: attempt + 1,
            final: true
          })
          throw error
        }
        
        // Calculate backoff delay
        const delay = this.calculateBackoffDelay(attempt)
        
        this.emit('request_retry', {
          error: error.message,
          attempt: attempt + 1,
          delay,
          nextRetryIn: delay
        })
        
        console.log(`⚠️ Request failed (attempt ${attempt + 1}/${this.maxRetries}): ${error.message}`)
        console.log(`🔄 Retrying in ${Math.round(delay/1000)}s...`)
        
        await this.sleep(delay)
      }
    }
    
    throw lastError
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus() {
    const now = Date.now()
    const oneMinuteAgo = now - 60000
    
    const recentRequests = this.requestHistory.filter(time => time > oneMinuteAgo)
    const recentTokens = this.tokenHistory
      .filter(entry => entry.timestamp > oneMinuteAgo)
      .reduce((sum, entry) => sum + entry.tokens, 0)
    
    return {
      requestsUsed: recentRequests.length,
      requestsLimit: this.maxRequestsPerMinute,
      requestsRemaining: Math.max(0, this.maxRequestsPerMinute - recentRequests.length),
      tokensUsed: recentTokens,
      tokensLimit: this.maxTokensPerMinute,
      tokensRemaining: Math.max(0, this.maxTokensPerMinute - recentTokens),
      quotaExceeded: this.quotaExceeded,
      canMakeRequest: this.canMakeRequest()
    }
  }

  /**
   * Reset quota exceeded state (call after resolving billing issues)
   */
  resetQuotaState() {
    this.quotaExceeded = false
    this.emit('quota_reset')
  }
}

/**
 * OpenAI Service wrapper with built-in error mitigation
 */
export class ResilientOpenAIService {
  constructor(openaiClient, options = {}) {
    this.client = openaiClient
    this.rateLimiter = new OpenAIRateLimiter(options)
    
    // Set up event listeners for monitoring
    this.rateLimiter.on('request_success', (data) => {
      console.log(`✅ OpenAI request successful (${data.tokens} tokens, ${data.duration}ms)`)
    })
    
    this.rateLimiter.on('request_retry', (data) => {
      console.log(`🔄 Retrying OpenAI request: ${data.error} (attempt ${data.attempt})`)
    })
    
    this.rateLimiter.on('quota_exceeded', () => {
      console.error('❌ OpenAI quota exceeded! Check billing and usage limits.')
    })
  }

  /**
   * Create chat completion with error mitigation
   */
  async createChatCompletion(params) {
    const estimatedTokens = this.estimateTokens(params)
    
    // Handle max_tokens vs max_completion_tokens based on model
    if (params.model?.includes('gpt-4o') && params.max_tokens) {
      params.max_completion_tokens = params.max_tokens
      delete params.max_tokens
    }
    
    return this.rateLimiter.executeWithRetry(
      () => this.client.chat.completions.create(params),
      {
        estimatedTokens,
        requestType: 'chat_completion',
        priority: params.model?.includes('gpt-4') ? 'high' : 'normal'
      }
    )
  }

  /**
   * Estimate token usage for rate limiting
   */
  estimateTokens(params) {
    // Rough estimation: 4 chars = 1 token on average
    let totalChars = 0
    
    if (params.messages) {
      totalChars += params.messages.reduce((sum, msg) => 
        sum + (msg.content?.length || 0), 0
      )
    }
    
    if (params.prompt) {
      totalChars += params.prompt.length
    }
    
    const inputTokens = Math.ceil(totalChars / 4)
    const maxOutputTokens = params.max_tokens || params.max_completion_tokens || 1000
    
    return inputTokens + maxOutputTokens
  }

  /**
   * Get rate limit status
   */
  getStatus() {
    return this.rateLimiter.getRateLimitStatus()
  }

  /**
   * Wait for available capacity
   */
  async waitForCapacity(estimatedTokens = 1000) {
    while (!this.rateLimiter.canMakeRequest(estimatedTokens)) {
      await this.rateLimiter.waitForRateLimit()
    }
  }
}

export default { OpenAIRateLimiter, ResilientOpenAIService }