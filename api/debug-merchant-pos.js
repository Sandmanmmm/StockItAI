#!/usr/bin/env node

/**
 * Debug script to check merchant ownership of purchase orders
 */

import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'

// Load environment variables
dotenv.config()

const prisma = new PrismaClient()

async function debugMerchantPOs() {
  console.log('🔍 Debugging merchant and purchase order relationship...')
  
  try {
    // Find our successfully processed PO
    const targetPO = await prisma.purchaseOrder.findUnique({
      where: { id: 'cmg0fhq77000155wokuva4jzk' },
      include: {
        merchant: { select: { id: true, name: true, email: true } },
        _count: { select: { lineItems: true } }
      }
    })
    
    if (targetPO) {
      console.log('🎯 Target PO (our 52-item successful one):')
      console.log(`   PO Number: ${targetPO.number}`)
      console.log(`   PO ID: ${targetPO.id}`)
      console.log(`   Merchant ID: ${targetPO.merchantId}`)
      console.log(`   Merchant Info: ${targetPO.merchant?.name} (${targetPO.merchant?.email})`)
      console.log(`   Line Items: ${targetPO._count.lineItems}`)
      console.log(`   Status: ${targetPO.status}`)
      console.log(`   Total: $${targetPO.totalAmount}`)
    }
    
    // Get all merchants
    console.log('\n📋 All merchants in system:')
    const merchants = await prisma.merchant.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { createdAt: 'desc' }
    })
    
    for (const merchant of merchants) {
      console.log(`   ${merchant.name || 'Unnamed'} (${merchant.email}) - ID: ${merchant.id}`)
      
      // Count POs for this merchant
      const poCount = await prisma.purchaseOrder.count({
        where: { merchantId: merchant.id }
      })
      console.log(`     └── ${poCount} purchase orders`)
    }
    
    // Check what the dev auth middleware is supposed to return
    console.log('\n🔧 Development auth configuration:')
    console.log('   Expected dev merchant email: dev@test.com')
    
    const devMerchant = await prisma.merchant.findFirst({
      where: { email: 'dev@test.com' }
    })
    
    if (devMerchant) {
      console.log(`   ✅ Found dev merchant: ${devMerchant.id} (${devMerchant.name})`)
      
      const devPOCount = await prisma.purchaseOrder.count({
        where: { merchantId: devMerchant.id }
      })
      console.log(`   📊 Dev merchant has ${devPOCount} purchase orders`)
    } else {
      console.log('   ❌ No merchant found with email dev@test.com')
    }
    
  } catch (error) {
    console.error('❌ Database query error:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the debug
debugMerchantPOs().catch(error => {
  console.error('💥 Script error:', error.message)
  process.exit(1)
})