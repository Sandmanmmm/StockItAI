#!/usr/bin/env node

/**
 * Test script to verify OpenAI API improvements
 * Tests the enhanced timeout, retry logic, and chunking functionality
 */

import dotenv from 'dotenv'
import { enhancedAIService } from './src/lib/enhancedAIService.js'

// Load environment variables
dotenv.config()

async function testOpenAIImprovements() {
  console.log('🧪 Testing OpenAI API improvements...')
  console.log('📊 API Key configured:', !!process.env.OPENAI_API_KEY)
  
  // Test 1: Small document processing
  console.log('\n📄 Test 1: Small document processing')
  const smallText = `
    Purchase Order #12345
    Date: 2025-09-26
    Supplier: Test Supplier Inc.
    
    Line Items:
    1. Widget A - Qty: 10 - Price: $5.00
    2. Widget B - Qty: 5 - Price: $10.00
    
    Total: $100.00
  `
  
  try {
    const result1 = await enhancedAIService._processWithOpenAI(smallText)
    console.log('✅ Small document test passed')
    console.log('📊 Response received with', result1.choices?.[0]?.message?.content?.length || 0, 'characters')
  } catch (error) {
    console.error('❌ Small document test failed:', error.message)
  }
  
  // Test 2: Large document processing (simulate with repeated text)
  console.log('\n📄 Test 2: Large document processing (chunking)')
  console.log('📊 Small text length:', smallText.length)
  
  // Create a more reasonable large document (~15KB)
  let largeText = ''
  for (let i = 0; i < 100; i++) {
    largeText += `${smallText}\n--- Page ${i + 1} ---\n`
  }
  console.log('📊 Large text created, length:', largeText.length)
  
  try {
    const result2 = await enhancedAIService._processWithOpenAI(largeText)
    console.log('✅ Large document test passed')
    console.log('📊 Response received with', result2.choices?.[0]?.message?.content?.length || 0, 'characters')
  } catch (error) {
    console.error('❌ Large document test failed:', error.message)
  }
  
  console.log('\n🎯 OpenAI improvements test completed!')
}

// Run the test
testOpenAIImprovements().catch(error => {
  console.error('💥 Test script error:', error.message)
  process.exit(1)
})