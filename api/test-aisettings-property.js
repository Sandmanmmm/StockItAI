#!/usr/bin/env node

/**
 * Test correct AISettings property name
 */

import { db } from './src/lib/db.js'

async function testAISettingsPropertyName() {
  console.log('🧪 Testing AISettings property name')
  console.log('=' .repeat(40))
  
  try {
    const client = db.client
    console.log('Available properties on client:')
    const properties = Object.getOwnPropertyNames(client)
      .filter(prop => prop.toLowerCase().includes('ai') || prop.toLowerCase().includes('settings'))
    console.log('Properties containing "ai" or "settings":', properties)
    
    // Test different variations
    const variations = ['aiSettings', 'aISettings', 'AISettings']
    
    for (const variation of variations) {
      try {
        console.log(`Testing ${variation}...`)
        if (client[variation]) {
          const count = await client[variation].count()
          console.log(`✅ ${variation} works! Count:`, count)
          break
        } else {
          console.log(`❌ ${variation} is undefined`)
        }
      } catch (error) {
        console.log(`❌ ${variation} failed:`, error.message)
      }
    }
    
  } catch (error) {
    console.log('❌ Test failed:', error.message)
  } finally {
    await db.client.$disconnect()
  }
}

testAISettingsPropertyName()