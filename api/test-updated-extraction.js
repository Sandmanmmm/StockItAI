import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()

const po = await p.purchaseOrder.findFirst({ 
  where: { 
    number: 'PO-1758675057685'
  },
  include: {
    _count: {
      select: { lineItems: true }
    }
  }
})

if (po) {
  console.log('🔍 Testing Updated Enhanced Data Extraction:')
  console.log('============================================')
  
  const rawData = po.rawData
  const extractedData = rawData?.extractedData
  
  // Updated enhanced extraction logic
  const safeToNumber = (value) => {
    if (typeof value === 'number') return value
    if (typeof value === 'string') return parseFloat(value) || 0
    return 0
  }

  const enhanced = {
    supplierName: extractedData?.supplier?.name || rawData?.vendor?.name || rawData?.supplier?.name || po.supplierName || 'Unknown Supplier',
    totalAmount: safeToNumber(
      extractedData?.totals?.grandTotal || 
      extractedData?.totals?.total || 
      extractedData?.totals?.totalAmount || 
      rawData?.totals?.total || 
      rawData?.totals?.grandTotal || 
      rawData?.total?.amount ||
      po.totalAmount || 0
    ),
    lineItemsCount: extractedData?.lineItems?.length || rawData?.lineItems?.length || po._count?.lineItems || 0,
    confidence: (() => {
      const conf = rawData?.confidence || extractedData?.confidence
      if (typeof conf === 'object' && conf?.overall) {
        return conf.overall
      }
      if (typeof conf === 'number') {
        return conf * 100
      }
      return (po.confidence || 0) * 100
    })()
  }
  
  console.log(`Original PO: ${po.number}`)
  console.log(`DB supplierName: "${po.supplierName}"`)
  console.log(`DB totalAmount: ${po.totalAmount}`)
  console.log(`DB lineItems: ${po._count?.lineItems || 0}`)
  console.log(`DB confidence: ${po.confidence}`)
  
  console.log('\n✨ UPDATED Enhanced Extraction Result:')
  console.log(`   🏢 Supplier: "${enhanced.supplierName}"`)
  console.log(`   💰 Amount: $${enhanced.totalAmount.toFixed(2)}`)
  console.log(`   📋 Items: ${enhanced.lineItemsCount}`)
  console.log(`   🎯 Confidence: ${enhanced.confidence}%`)
  
  console.log('\n🚀 Expected Changes:')
  console.log(`   Supplier: "${po.supplierName}" → "${enhanced.supplierName}"`)
  console.log(`   Amount: $${po.totalAmount} → $${enhanced.totalAmount.toFixed(2)}`)
  console.log(`   Items: ${po._count?.lineItems || 0} → ${enhanced.lineItemsCount}`)
  console.log(`   Confidence: ${po.confidence} → ${enhanced.confidence}%`)
}

await p.$disconnect()