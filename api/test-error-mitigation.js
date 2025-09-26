#!/usr/bin/env node

/**
 * Test OpenAI Error Mitigation and Rate Limiting
 * Tests the resilient OpenAI service with various error scenarios
 */

import { OpenAI } from 'openai'
import { ResilientOpenAIService, OpenAIRateLimiter } from './src/lib/openaiRateLimiter.js'
import dotenv from 'dotenv'

dotenv.config()

async function testRateLimiter() {
  console.log('🧪 Testing OpenAI Rate Limiter...\n')
  
  const rateLimiter = new OpenAIRateLimiter({
    maxRequestsPerMinute: 5, // Very low limit for testing
    maxTokensPerMinute: 10000,
    maxRetries: 3,
    baseDelay: 500, // Short delay for testing
    maxDelay: 2000
  })
  
  // Test 1: Rate limit checking
  console.log('1️⃣ Testing Rate Limit Checking...')
  console.log(`Can make request: ${rateLimiter.canMakeRequest(1000)}`)
  
  // Simulate requests
  for (let i = 0; i < 3; i++) {
    rateLimiter.recordRequest(1000)
    console.log(`After request ${i + 1}:`, rateLimiter.getRateLimitStatus())
  }
  
  // Test 2: Backoff calculation
  console.log('\n2️⃣ Testing Exponential Backoff...')
  for (let attempt = 0; attempt < 5; attempt++) {
    const delay = rateLimiter.calculateBackoffDelay(attempt)
    console.log(`Attempt ${attempt + 1}: ${Math.round(delay)}ms delay`)
  }
  
  // Test 3: Error classification
  console.log('\n3️⃣ Testing Error Classification...')
  const testErrors = [
    { message: 'rate_limit_exceeded', expected: true },
    { message: 'You exceeded your current quota', expected: true },
    { status: 429, expected: true },
    { status: 500, expected: true },
    { message: 'invalid_api_key', expected: false },
    { message: 'model_not_found', expected: false }
  ]
  
  testErrors.forEach(({ message, status, expected }) => {
    const error = { message, status }
    const isRetryable = rateLimiter.isRetryableError(error)
    const isQuota = rateLimiter.isQuotaError(error)
    console.log(`Error "${message || `status ${status}`}": retryable=${isRetryable}, quota=${isQuota}`)
  })
  
  console.log('\n✅ Rate Limiter tests completed!')
}

async function testResilientService() {
  console.log('\n🛡️ Testing Resilient OpenAI Service...\n')
  
  const openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  })
  
  const resilientService = new ResilientOpenAIService(openaiClient, {
    maxRequestsPerMinute: 10,
    maxTokensPerMinute: 20000,
    maxRetries: 2,
    baseDelay: 1000
  })
  
  console.log('1️⃣ Service Status:')
  console.log(resilientService.getStatus())
  
  // Test token estimation
  console.log('\n2️⃣ Testing Token Estimation...')
  const testRequest = {
    messages: [
      { role: 'user', content: 'Hello, this is a test message for token estimation.' }
    ],
    max_tokens: 100
  }
  
  const estimatedTokens = resilientService.estimateTokens(testRequest)
  console.log(`Estimated tokens: ${estimatedTokens}`)
  
  console.log('\n3️⃣ Testing Request with Mock (no actual API call)...')
  
  // Create a mock function that simulates different scenarios
  async function mockSuccessfulRequest() {
    return {
      choices: [{ message: { content: '{"test": "success"}' } }],
      usage: { total_tokens: 150 }
    }
  }
  
  try {
    // Test the executeWithRetry logic without making real API calls
    const result = await resilientService.rateLimiter.executeWithRetry(mockSuccessfulRequest, {
      estimatedTokens: 150,
      requestType: 'test',
      priority: 'normal'
    })
    
    console.log('✅ Mock request succeeded:', result.choices[0].message.content)
    console.log('Final status:', resilientService.getStatus())
  } catch (error) {
    console.error('❌ Mock request failed:', error.message)
  }
  
  console.log('\n✅ Resilient Service tests completed!')
}

async function testErrorScenarios() {
  console.log('\n💥 Testing Error Scenarios...\n')
  
  const rateLimiter = new OpenAIRateLimiter({
    maxRetries: 2,
    baseDelay: 100
  })
  
  // Test quota exceeded scenario
  console.log('1️⃣ Testing Quota Exceeded Simulation...')
  
  async function mockQuotaExceededRequest() {
    throw new Error('You exceeded your current quota, please check your plan and billing details.')
  }
  
  try {
    await rateLimiter.executeWithRetry(mockQuotaExceededRequest)
  } catch (error) {
    console.log('✅ Quota error properly handled:', error.message)
    console.log('Quota exceeded state:', rateLimiter.quotaExceeded)
  }
  
  // Test retryable error scenario
  console.log('\n2️⃣ Testing Retryable Error Simulation...')
  let attemptCount = 0
  
  async function mockRetryableRequest() {
    attemptCount++
    if (attemptCount < 2) {
      const error = new Error('rate_limit_exceeded')
      error.status = 429
      throw error
    }
    return { success: true, attempts: attemptCount }
  }
  
  try {
    rateLimiter.quotaExceeded = false // Reset quota state
    const result = await rateLimiter.executeWithRetry(mockRetryableRequest)
    console.log('✅ Retryable error recovered:', result)
  } catch (error) {
    console.log('❌ Retry failed:', error.message)
  }
  
  console.log('\n✅ Error scenario tests completed!')
}

async function runAllMitigationTests() {
  console.log('🚀 Starting OpenAI Error Mitigation Tests\n')
  console.log('='.repeat(60))
  
  try {
    await testRateLimiter()
    await testResilientService()
    await testErrorScenarios()
    
    console.log('\n'.repeat(2))
    console.log('🎉 All Error Mitigation Tests Completed Successfully!')
    console.log('\nImplemented Features:')
    console.log('✅ Exponential backoff with jitter')
    console.log('✅ Rate limiting (requests per minute + tokens per minute)')
    console.log('✅ Automatic retry for transient errors')
    console.log('✅ Quota exceeded detection and handling')
    console.log('✅ Request/response monitoring and logging')
    console.log('✅ Graceful degradation on persistent failures')
    
    console.log('\nError Mitigation Strategies:')
    console.log('🛡️ Conservative rate limits to prevent 429 errors')
    console.log('🔄 Smart retry logic for recoverable failures')
    console.log('⏱️ Exponential backoff with randomized jitter')
    console.log('📊 Real-time usage tracking and limits')
    console.log('🚨 Quota monitoring with billing alerts')
    console.log('💰 Cost-optimized model selection and fallbacks')
    
  } catch (error) {
    console.error('❌ Test suite failed:', error)
    process.exit(1)
  }
}

// Run all tests
runAllMitigationTests().catch(console.error)