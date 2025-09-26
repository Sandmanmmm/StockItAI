#!/usr/bin/env node

/**
 * OpenAI API Diagnostic Tool
 * Identifies the root cause of API access issues
 */

import { OpenAI } from 'openai'
import dotenv from 'dotenv'

dotenv.config()

async function diagnoseOpenAIIssue() {
  console.log('🔍 OpenAI API Diagnostic Tool')
  console.log('='.repeat(50))
  console.log(`📅 Date: ${new Date().toISOString()}`)
  
  // Check environment setup
  const apiKey = process.env.OPENAI_API_KEY
  
  if (!apiKey) {
    console.log('❌ OPENAI_API_KEY not found in environment')
    return false
  }
  
  console.log(`🔑 API Key found: ${apiKey.substring(0, 20)}...${apiKey.substring(apiKey.length - 4)}`)
  console.log(`📏 API Key length: ${apiKey.length} characters`)
  
  // Validate key format
  if (!apiKey.startsWith('sk-')) {
    console.log('❌ Invalid API key format - should start with "sk-"')
    return false
  }
  
  console.log('✅ API key format appears valid')
  
  // Initialize OpenAI client with minimal configuration
  const openai = new OpenAI({
    apiKey: apiKey,
    timeout: 30000, // 30 second timeout
    maxRetries: 0   // No retries for diagnostic
  })
  
  console.log('\n📋 Running Diagnostic Tests...\n')
  
  // Test 1: Basic API connectivity
  console.log('1️⃣ Testing basic API connectivity...')
  try {
    // Try the most basic possible request
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 5,
      temperature: 0
    })
    
    console.log('✅ Basic connectivity successful')
    console.log(`   Response: ${response.choices[0].message.content}`)
    console.log(`   Tokens: ${response.usage.total_tokens}`)
    console.log(`   Model: ${response.model}`)
    
  } catch (error) {
    console.log('❌ Basic connectivity failed')
    console.log(`   Error Type: ${error.constructor.name}`)
    console.log(`   HTTP Status: ${error.status || 'N/A'}`)
    console.log(`   Error Code: ${error.code || 'N/A'}`)
    console.log(`   Message: ${error.message}`)
    
    if (error.response) {
      console.log(`   Response Headers: ${JSON.stringify(error.response.headers, null, 2)}`)
      if (error.response.data) {
        console.log(`   Response Data: ${JSON.stringify(error.response.data, null, 2)}`)
      }
    }
    
    // Analyze specific error types
    if (error.status === 429) {
      console.log('\n🔍 Rate Limit Analysis:')
      console.log('   This is a rate limiting error, not a quota error')
      console.log('   Possible causes:')
      console.log('   • Too many requests per minute (RPM limit)')
      console.log('   • Too many tokens per minute (TPM limit)')
      console.log('   • Burst rate limiting')
      
      // Check rate limit headers if available
      if (error.response?.headers) {
        const headers = error.response.headers
        console.log('\n   Rate Limit Headers:')
        Object.keys(headers).forEach(key => {
          if (key.toLowerCase().includes('rate') || key.toLowerCase().includes('limit')) {
            console.log(`   ${key}: ${headers[key]}`)
          }
        })
      }
      
    } else if (error.status === 401) {
      console.log('\n🔍 Authentication Analysis:')
      console.log('   This is an authentication error')
      console.log('   Possible causes:')
      console.log('   • Invalid API key')
      console.log('   • API key has been revoked or expired')
      console.log('   • API key lacks necessary permissions')
      
    } else if (error.status === 403) {
      console.log('\n🔍 Authorization Analysis:')
      console.log('   This is an authorization/access error')
      console.log('   Possible causes:')
      console.log('   • Account has insufficient credits/quota')
      console.log('   • Account is suspended or restricted')
      console.log('   • Model access not permitted for this key')
      
    } else if (error.message.toLowerCase().includes('quota')) {
      console.log('\n🔍 Quota Analysis:')
      console.log('   This appears to be a quota-related error')
      console.log('   Possible causes:')
      console.log('   • Monthly usage quota exceeded')
      console.log('   • Account billing issues')
      console.log('   • Free tier limitations')
    }
  }
  
  // Test 2: Try different models to isolate the issue
  console.log('\n2️⃣ Testing different models...')
  
  const modelsToTest = [
    'gpt-3.5-turbo',
    'gpt-4o-mini',
    'gpt-4'
  ]
  
  for (const model of modelsToTest) {
    console.log(`   Testing ${model}...`)
    try {
      const response = await openai.chat.completions.create({
        model: model,
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 1,
        temperature: 0
      })
      console.log(`   ✅ ${model} - Working (${response.usage.total_tokens} tokens)`)
    } catch (error) {
      if (error.status === 404) {
        console.log(`   ⚠️ ${model} - Not accessible (model not found)`)
      } else {
        console.log(`   ❌ ${model} - Error: ${error.message}`)
      }
    }
  }
  
  // Test 3: Check account/usage information
  console.log('\n3️⃣ Attempting to check account information...')
  try {
    // Try to list available models (this gives info about account status)
    const models = await openai.models.list()
    console.log(`✅ Successfully retrieved models list (${models.data.length} models available)`)
    
    // Show available models
    console.log('   Available models:')
    const relevantModels = models.data
      .filter(model => model.id.includes('gpt'))
      .slice(0, 5) // Show first 5 GPT models
    
    relevantModels.forEach(model => {
      console.log(`   • ${model.id} (owned by: ${model.owned_by})`)
    })
    
    if (relevantModels.length === 0) {
      console.log('   ⚠️ No GPT models found in account')
    }
    
  } catch (error) {
    console.log(`❌ Could not retrieve account information: ${error.message}`)
  }
  
  // Test 4: Try minimal request with different parameters
  console.log('\n4️⃣ Testing with minimal parameters...')
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: '1' }],
      max_tokens: 1
    })
    console.log('✅ Minimal request successful')
    console.log(`   Response: "${response.choices[0].message.content}"`)
  } catch (error) {
    console.log(`❌ Minimal request failed: ${error.message}`)
  }
  
  // Test 5: Raw HTTP request to isolate SDK issues
  console.log('\n5️⃣ Testing raw HTTP request...')
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 1
      })
    })
    
    console.log(`   HTTP Status: ${response.status}`)
    console.log(`   Status Text: ${response.statusText}`)
    
    if (response.ok) {
      const data = await response.json()
      console.log('✅ Raw HTTP request successful')
      console.log(`   Response: ${data.choices[0].message.content}`)
    } else {
      const errorData = await response.text()
      console.log('❌ Raw HTTP request failed')
      console.log(`   Error Response: ${errorData}`)
    }
    
  } catch (error) {
    console.log(`❌ Raw HTTP request error: ${error.message}`)
  }
  
  console.log('\n📊 Diagnostic Summary:')
  console.log('='.repeat(50))
  console.log('If the issue persists, check:')
  console.log('• OpenAI Dashboard: https://platform.openai.com/usage')
  console.log('• Billing Status: https://platform.openai.com/account/billing')
  console.log('• API Key Status: https://platform.openai.com/api-keys')
  console.log('• Rate Limits: https://platform.openai.com/docs/guides/rate-limits')
  
  return true
}

// Run diagnostics
diagnoseOpenAIIssue().catch(console.error)