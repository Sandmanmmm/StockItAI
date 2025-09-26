#!/usr/bin/env node

/**
 * Test AISettings table
 */

import { db } from './src/lib/db.js'

async function testAISettings() {
  console.log('🧪 Testing AISettings table')
  console.log('=' .repeat(30))
  
  try {
    console.log('Testing AISettings count...')
    const count = await db.client.aISettings.count()
    console.log('✅ AISettings table accessible, count:', count)
    
  } catch (error) {
    console.log('❌ AISettings test failed:', error.message)
    console.log('Stack trace:', error.stack)
  } finally {
    await db.client.$disconnect()
  }
}

testAISettings()