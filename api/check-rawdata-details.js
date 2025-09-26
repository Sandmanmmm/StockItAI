import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()

// Get a PO with rawData
const po = await p.purchaseOrder.findFirst({ 
  where: {
    rawData: {
      not: null
    }
  },
  include: {
    _count: {
      select: { lineItems: true }
    }
  }
})

if (po) {
  console.log('🔍 Found PO with rawData:', po.number)
  console.log('💾 Raw Database Fields:')
  console.log(`   supplierName: "${po.supplierName}"`)
  console.log(`   totalAmount: ${po.totalAmount}`)
  console.log(`   lineItems count: ${po._count?.lineItems || 0}`)
  console.log(`   confidence: ${po.confidence}`)
  
  console.log('\n📄 rawData structure:')
  console.log(JSON.stringify(po.rawData, null, 2))
} else {
  console.log('❌ No PO with rawData found')
}

await p.$disconnect()