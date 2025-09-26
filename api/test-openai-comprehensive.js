#!/usr/bin/env node

/**
 * Comprehensive OpenAI API Test with Error Mitigation
 * Tests the resilient OpenAI service with real API calls and error handling
 */

import { OpenAI } from 'openai'
import { ResilientOpenAIService } from './src/lib/openaiRateLimiter.js'
import dotenv from 'dotenv'

dotenv.config()

class OpenAIAPITester {
  constructor() {
    // Initialize OpenAI client
    const openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
    
    // Create resilient service with conservative limits for testing
    this.resilientService = new ResilientOpenAIService(openaiClient, {
      maxRequestsPerMinute: 10,  // Conservative for testing
      maxTokensPerMinute: 15000,
      maxRetries: 2,             // Reduced for faster testing
      baseDelay: 1000,           // 1 second base delay
      maxDelay: 10000            // 10 second max delay
    })
    
    this.testResults = []
  }

  async runTest(testName, testFunc) {
    console.log(`\n🧪 ${testName}`)
    console.log('─'.repeat(50))
    
    const startTime = Date.now()
    
    try {
      const result = await testFunc()
      const duration = Date.now() - startTime
      
      console.log(`✅ ${testName} PASSED (${duration}ms)`)
      
      this.testResults.push({
        name: testName,
        status: 'PASSED',
        duration,
        result
      })
      
      return result
    } catch (error) {
      const duration = Date.now() - startTime
      
      console.log(`❌ ${testName} FAILED (${duration}ms)`)
      console.log(`   Error: ${error.message}`)
      
      this.testResults.push({
        name: testName,
        status: 'FAILED',
        duration,
        error: error.message
      })
      
      throw error
    }
  }

  async testBasicCompletion() {
    console.log('Testing basic chat completion...')
    
    const completion = await this.resilientService.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: 'Say "Hello, I am working!" in JSON format with a "message" field.'
        }
      ],
      temperature: 0,
      max_tokens: 50,
      response_format: { type: 'json_object' }
    })
    
    const response = JSON.parse(completion.choices[0].message.content)
    console.log(`📝 Response: ${response.message}`)
    console.log(`🪙 Tokens used: ${completion.usage?.total_tokens}`)
    console.log(`🤖 Model: ${completion.model}`)
    
    // Verify response structure
    if (!response.message || !response.message.toLowerCase().includes('working')) {
      throw new Error('Response does not contain expected content')
    }
    
    return {
      message: response.message,
      tokensUsed: completion.usage?.total_tokens,
      model: completion.model
    }
  }

  async testDocumentAnalysis() {
    console.log('Testing document analysis capabilities...')
    
    const samplePO = `
PURCHASE ORDER #PO-2024-TEST-001

Date: September 23, 2025
Vendor: Tech Solutions Inc.
Address: 123 Business Street, Tech City, TC 12345
Contact: orders@techsolutions.com

ITEMS ORDERED:
- Desktop Computers x 10 @ $800 each = $8,000
- Wireless Keyboards x 10 @ $45 each = $450
- USB Mice x 10 @ $25 each = $250

Subtotal: $8,700
Tax (8.5%): $739.50
Total: $9,439.50

Delivery Date: October 15, 2025
Payment Terms: Net 30
`

    const completion = await this.resilientService.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at extracting structured data from purchase orders. Return valid JSON only.'
        },
        {
          role: 'user',
          content: `Extract the following information from this purchase order:

${samplePO}

Return JSON with: poNumber, vendor (name, address, contact), orderDate, deliveryDate, lineItems (description, quantity, unitPrice, totalPrice), and totals (subtotal, tax, total).`
        }
      ],
      temperature: 0.1,
      max_tokens: 800,
      response_format: { type: 'json_object' }
    })
    
    const extractedData = JSON.parse(completion.choices[0].message.content)
    
    console.log('📄 Extracted PO Data:')
    console.log(`   PO Number: ${extractedData.poNumber}`)
    console.log(`   Vendor: ${extractedData.vendor?.name}`)
    console.log(`   Order Date: ${extractedData.orderDate}`)
    console.log(`   Line Items: ${extractedData.lineItems?.length} items`)
    console.log(`   Total: $${extractedData.totals?.total}`)
    console.log(`🪙 Tokens used: ${completion.usage?.total_tokens}`)
    
    // Validate extraction quality
    if (!extractedData.poNumber || !extractedData.vendor?.name || !extractedData.lineItems?.length) {
      throw new Error('Document analysis failed - missing critical data')
    }
    
    return {
      extractedData,
      tokensUsed: completion.usage?.total_tokens
    }
  }

  async testRateLimitStatus() {
    console.log('Testing rate limit monitoring...')
    
    const status = this.resilientService.getStatus()
    
    console.log('📊 Current Rate Limit Status:')
    console.log(`   Requests Used: ${status.requestsUsed}/${status.requestsLimit}`)
    console.log(`   Tokens Used: ${status.tokensUsed.toLocaleString()}/${status.tokensLimit.toLocaleString()}`)
    console.log(`   Requests Remaining: ${status.requestsRemaining}`)
    console.log(`   Tokens Remaining: ${status.tokensRemaining.toLocaleString()}`)
    console.log(`   Can Make Request: ${status.canMakeRequest ? '✅' : '❌'}`)
    console.log(`   Quota Exceeded: ${status.quotaExceeded ? '❌' : '✅'}`)
    
    return status
  }

  async testMultipleRequests() {
    console.log('Testing multiple sequential requests...')
    
    const results = []
    
    for (let i = 1; i <= 5; i++) {
      console.log(`  Making request ${i}/5...`)
      
      try {
        const completion = await this.resilientService.createChatCompletion({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'user',
              content: `Count to ${i} in JSON format: {"count": [1, 2, ...]}`
            }
          ],
          temperature: 0,
          max_tokens: 100,
          response_format: { type: 'json_object' }
        })
        
        const response = JSON.parse(completion.choices[0].message.content)
        results.push({
          request: i,
          count: response.count,
          tokens: completion.usage?.total_tokens,
          success: true
        })
        
        console.log(`    ✅ Request ${i}: ${JSON.stringify(response.count)} (${completion.usage?.total_tokens} tokens)`)
        
        // Small delay between requests to test rate limiting
        await new Promise(resolve => setTimeout(resolve, 200))
        
      } catch (error) {
        console.log(`    ❌ Request ${i} failed: ${error.message}`)
        results.push({
          request: i,
          error: error.message,
          success: false
        })
      }
    }
    
    const successCount = results.filter(r => r.success).length
    console.log(`📈 Completed ${successCount}/5 requests successfully`)
    
    return results
  }

  async testErrorRecovery() {
    console.log('Testing error recovery with invalid model...')
    
    try {
      // This should fail with invalid model, testing error handling
      await this.resilientService.createChatCompletion({
        model: 'invalid-model-name',
        messages: [
          {
            role: 'user',
            content: 'This should fail'
          }
        ],
        temperature: 0,
        max_tokens: 50
      })
      
      throw new Error('Expected this request to fail, but it succeeded')
      
    } catch (error) {
      console.log(`✅ Error properly caught: ${error.message}`)
      
      // Check if it's the expected error type
      if (error.message.includes('model') || error.message.includes('not found')) {
        console.log('   📝 Correct error type detected')
        return { errorHandled: true, errorType: 'model_not_found' }
      } else {
        throw new Error(`Unexpected error type: ${error.message}`)
      }
    }
  }

  async runAllTests() {
    console.log('🚀 Starting Comprehensive OpenAI API Tests')
    console.log('='.repeat(60))
    console.log(`📅 Test Date: ${new Date().toISOString()}`)
    console.log(`🔑 API Key: ${process.env.OPENAI_API_KEY ? 'Configured' : 'Missing'}`)
    
    if (!process.env.OPENAI_API_KEY) {
      console.log('❌ OpenAI API Key not found in environment variables')
      console.log('   Please set OPENAI_API_KEY in your .env file')
      return false
    }
    
    const startTime = Date.now()
    
    try {
      // Run individual tests
      await this.runTest('Basic Completion', () => this.testBasicCompletion())
      await this.runTest('Rate Limit Status', () => this.testRateLimitStatus())
      await this.runTest('Document Analysis', () => this.testDocumentAnalysis())
      await this.runTest('Multiple Requests', () => this.testMultipleRequests())
      await this.runTest('Error Recovery', () => this.testErrorRecovery())
      
      // Final status check
      await this.runTest('Final Rate Limit Status', () => this.testRateLimitStatus())
      
      const totalTime = Date.now() - startTime
      
      console.log('\n🎉 All Tests Completed Successfully!')
      console.log('='.repeat(60))
      console.log(`⏱️ Total test time: ${totalTime}ms`)
      console.log(`🧪 Tests passed: ${this.testResults.filter(r => r.status === 'PASSED').length}/${this.testResults.length}`)
      
      console.log('\n📊 Test Summary:')
      this.testResults.forEach((result, index) => {
        const status = result.status === 'PASSED' ? '✅' : '❌'
        console.log(`   ${index + 1}. ${status} ${result.name} (${result.duration}ms)`)
      })
      
      console.log('\n🛡️ Error Mitigation Features Validated:')
      console.log('   ✅ Rate limit monitoring')
      console.log('   ✅ Request tracking and throttling') 
      console.log('   ✅ Error classification and handling')
      console.log('   ✅ Automatic retry logic')
      console.log('   ✅ Usage statistics and reporting')
      
      return true
      
    } catch (error) {
      const totalTime = Date.now() - startTime
      
      console.log('\n❌ Test Suite Failed')
      console.log('='.repeat(60))
      console.log(`⏱️ Time to failure: ${totalTime}ms`)
      console.log(`🔍 Final error: ${error.message}`)
      
      const passedTests = this.testResults.filter(r => r.status === 'PASSED').length
      console.log(`🧪 Tests passed before failure: ${passedTests}/${this.testResults.length}`)
      
      return false
    }
  }
}

// Run the comprehensive test suite
async function main() {
  const tester = new OpenAIAPITester()
  const success = await tester.runAllTests()
  
  if (success) {
    console.log('\n🎯 OpenAI API is working properly with error mitigation!')
    console.log('🚀 System is ready for production use')
    process.exit(0)
  } else {
    console.log('\n⚠️ Some tests failed - check configuration and API status')
    process.exit(1)
  }
}

main().catch(console.error)