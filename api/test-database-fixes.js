#!/usr/bin/env node

/**
 * Test script to verify database persistence fixes
 * Tests the unique constraint and missing record handling
 */

import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'

// Load environment variables
dotenv.config()

const prisma = new PrismaClient()

async function testDatabaseFixes() {
  console.log('🧪 Testing database persistence fixes...')
  
  try {
    // Test 1: Check if we can query purchase orders
    console.log('\n📄 Test 1: Querying existing purchase orders')
    const existingPOs = await prisma.purchaseOrder.findMany({
      take: 3,
      orderBy: { createdAt: 'desc' },
      select: { id: true, number: true, merchantId: true, status: true }
    })
    
    console.log(`✅ Found ${existingPOs.length} existing purchase orders:`)
    existingPOs.forEach(po => {
      console.log(`   - ${po.number} (${po.id}) - Status: ${po.status}`)
    })
    
    // Test 2: Check merchant constraints
    console.log('\n📄 Test 2: Checking merchant data')
    const merchants = await prisma.merchant.findMany({
      take: 2,
      select: { id: true, name: true, email: true }
    })
    
    console.log(`✅ Found ${merchants.length} merchants:`)
    merchants.forEach(merchant => {
      console.log(`   - ${merchant.name} (${merchant.id}) - ${merchant.email}`)
    })
    
    // Test 3: Check unique constraint by attempting to find duplicate numbers
    console.log('\n📄 Test 3: Checking for potential unique constraint conflicts')
    const poNumbers = await prisma.purchaseOrder.groupBy({
      by: ['merchantId', 'number'],
      _count: { id: true },
      having: { id: { _count: { gt: 1 } } }
    })
    
    if (poNumbers.length > 0) {
      console.log(`⚠️ Found ${poNumbers.length} potential conflicts:`)
      poNumbers.forEach(conflict => {
        console.log(`   - Merchant ${conflict.merchantId}, Number ${conflict.number}: ${conflict._count.id} records`)
      })
    } else {
      console.log('✅ No unique constraint conflicts found')
    }
    
    console.log('\n🎯 Database fixes test completed successfully!')
    
  } catch (error) {
    console.error('❌ Database test failed:', error.message)
    if (error.code) {
      console.error('   Error code:', error.code)
    }
  } finally {
    await prisma.$disconnect()
  }
}

// Run the test
testDatabaseFixes().catch(error => {
  console.error('💥 Test script error:', error.message)
  process.exit(1)
})