#!/usr/bin/env node

/**
 * Test Database Connection for Upload Route
 */

import { db } from './src/lib/db.js'

async function testDatabaseConnection() {
  console.log('🧪 Testing Database Connection for Upload Route')
  console.log('=' .repeat(50))
  
  try {
    console.log('\n📋 Step 1: Testing db object')
    console.log('db object:', typeof db)
    console.log('db.client:', typeof db.client)
    
    console.log('\n📋 Step 2: Testing basic connection')
    const client = db.client
    console.log('Prisma client initialized:', !!client)
    
    console.log('\n📋 Step 3: Testing simple query')
    const result = await client.$queryRaw`SELECT 1 as test`
    console.log('✅ Basic query successful:', result)
    
    console.log('\n📋 Step 4: Testing purchaseOrder model')
    const count = await client.purchaseOrder.count()
    console.log('✅ PurchaseOrder table accessible, count:', count)
    
    console.log('\n📋 Step 5: Testing upload model')
    const uploadCount = await client.upload.count()
    console.log('✅ Upload table accessible, count:', uploadCount)
    
    console.log('\n✅ All database tests passed!')
    
  } catch (error) {
    console.log('❌ Database test failed:', error.message)
    console.log('Stack trace:', error.stack)
  } finally {
    await db.client.$disconnect()
  }
}

testDatabaseConnection()