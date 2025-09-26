import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()

const po = await p.purchaseOrder.findFirst({ 
  where: { 
    number: 'PO-1758675057685'
  }
})

if (po) {
  console.log('🔍 Detailed rawData for PO-1758675057685:')
  console.log('=====================================')
  console.log(`DB supplierName: "${po.supplierName}"`)
  console.log(`DB totalAmount: ${po.totalAmount}`)
  console.log(`DB confidence: ${po.confidence}`)
  
  console.log('\n📄 Full rawData structure:')
  console.log(JSON.stringify(po.rawData, null, 2))
  
  // Test enhanced extraction
  const rawData = po.rawData
  if (rawData) {
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
      lineItemsCount: rawData.lineItems?.length || 0,
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
  }
}

await p.$disconnect()