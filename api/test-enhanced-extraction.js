import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()

// Test the enhanced data extraction logic
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
  console.log('🔍 Testing Enhanced Data Extraction with Real Data:')
  console.log('====================================================')
  console.log(`📦 PO: ${po.number}`)
  
  console.log('\n💾 Raw Database Fields:')
  console.log(`   supplierName: "${po.supplierName}"`)
  console.log(`   totalAmount: ${po.totalAmount}`)
  console.log(`   lineItems count: ${po._count?.lineItems || 0}`)
  console.log(`   confidence: ${po.confidence}`)
  
  console.log('\n🤖 AI Extracted Data (rawData):')
  const rawData = po.rawData
  console.log(`   vendor.name: "${rawData.vendor?.name || 'N/A'}"`)
  console.log(`   totals.total: ${rawData.totals?.total || 'N/A'}`)
  console.log(`   lineItems.length: ${rawData.lineItems?.length || 0}`)
  console.log(`   confidence.overall: ${rawData.confidence?.overall || rawData.confidence || 'N/A'}`)
  
  // Apply the enhanced extraction logic
  const safeToNumber = (value) => {
    if (typeof value === 'number') return value
    if (typeof value === 'string') return parseFloat(value) || 0
    return 0
  }

  const enhanced = {
    supplierName: rawData.vendor?.name || rawData.supplier?.name || po.supplierName || 'Unknown Supplier',
    totalAmount: safeToNumber(
      rawData.totals?.total || 
      rawData.totals?.grandTotal || 
      rawData.totals?.totalAmount || 
      rawData.total?.amount ||
      po.totalAmount || 0
    ),
    lineItemsCount: rawData.lineItems?.length || po._count?.lineItems || 0,
    confidence: (() => {
      const conf = rawData.confidence
      if (typeof conf === 'object' && conf?.overall) {
        return conf.overall
      }
      if (typeof conf === 'number') {
        return conf * 100
      }
      return (po.confidence || 0) * 100
    })()
  }
  
  console.log('\n✨ Enhanced Extraction Result:')
  console.log(`   🏢 Supplier: "${enhanced.supplierName}"`)
  console.log(`   💰 Amount: $${enhanced.totalAmount.toFixed(2)}`)
  console.log(`   📋 Items: ${enhanced.lineItemsCount}`)
  console.log(`   🎯 Confidence: ${enhanced.confidence}%`)
  
  console.log('\n🔄 Comparison (Raw vs Enhanced):')
  console.log(`   Supplier: "${po.supplierName}" → "${enhanced.supplierName}"`)
  console.log(`   Amount: $${po.totalAmount} → $${enhanced.totalAmount.toFixed(2)}`)
  console.log(`   Items: ${po._count?.lineItems || 0} → ${enhanced.lineItemsCount}`)
  console.log(`   Confidence: ${po.confidence} → ${enhanced.confidence}%`)
  
  console.log('\n📈 Benefits:')
  if (po.supplierName !== enhanced.supplierName) console.log('   ✅ Supplier name improved!')
  if (po.totalAmount !== enhanced.totalAmount) console.log('   ✅ Amount improved!')
  if ((po._count?.lineItems || 0) !== enhanced.lineItemsCount) console.log('   ✅ Item count improved!')
  if ((po.confidence || 0) * 100 !== enhanced.confidence) console.log('   ✅ Confidence score improved!')
}

await p.$disconnect()