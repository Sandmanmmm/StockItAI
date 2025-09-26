// Quick test to check the enhanced data extraction for All Purchase Orders
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function testEnhancedData() {
  try {
    // Get a purchase order with rawData
    const po = await prisma.purchaseOrder.findFirst({
      include: {
        _count: {
          select: {
            lineItems: true
          }
        }
      }
    })

    if (!po) {
      console.log('❌ No purchase orders found')
      return
    }

    console.log('\n🔍 Testing Enhanced Data Extraction:')
    console.log('=====================================')
    console.log(`📦 PO: ${po.number || 'No number'}`)
    
    console.log('\n💾 Raw Database Fields:')
    console.log(`   supplierName: "${po.supplierName}"`)
    console.log(`   totalAmount: ${po.totalAmount}`)
    console.log(`   lineItems count: ${po._count?.lineItems || 0}`)
    console.log(`   confidence: ${po.confidence}`)
    
    if (po.rawData?.extractedData) {
      const extractedData = po.rawData.extractedData
      console.log('\n🤖 AI Extracted Data:')
      console.log(`   supplier.name: "${extractedData.supplier?.name || 'N/A'}"`)
      console.log(`   totals.grandTotal: ${extractedData.totals?.grandTotal || 'N/A'}`)
      console.log(`   totals.total: ${extractedData.totals?.total || 'N/A'}`)
      console.log(`   lineItems.length: ${extractedData.lineItems?.length || 0}`)
      console.log(`   confidence: ${extractedData.confidence || 'N/A'}`)
      
      console.log('\n✨ Enhanced Extraction Result:')
      const safeToNumber = (value) => {
        if (typeof value === 'number') return value
        if (typeof value === 'string') return parseFloat(value) || 0
        return 0
      }
      
      const enhanced = {
        supplierName: extractedData.supplier?.name || po.supplierName || 'Unknown Supplier',
        totalAmount: safeToNumber(
          extractedData.totals?.grandTotal || 
          extractedData.totals?.total || 
          extractedData.totals?.totalAmount || 
          extractedData.total?.amount ||
          po.totalAmount || 0
        ),
        lineItemsCount: extractedData.lineItems?.length || po._count?.lineItems || 0,
        confidence: extractedData.confidence || po.confidence || 0
      }
      
      console.log(`   🏢 Supplier: "${enhanced.supplierName}"`)
      console.log(`   💰 Amount: $${enhanced.totalAmount.toFixed(2)}`)
      console.log(`   📋 Items: ${enhanced.lineItemsCount}`)
      console.log(`   🎯 Confidence: ${enhanced.confidence}%`)
      
      console.log('\n🔄 Comparison:')
      console.log(`   Supplier Changed: ${po.supplierName !== enhanced.supplierName}`)
      console.log(`   Amount Changed: ${po.totalAmount !== enhanced.totalAmount}`)
      console.log(`   Items Changed: ${(po._count?.lineItems || 0) !== enhanced.lineItemsCount}`)
      console.log(`   Confidence Changed: ${po.confidence !== enhanced.confidence}`)
    } else {
      console.log('\n❌ No extractedData found in rawData')
      if (po.rawData) {
        console.log('📄 rawData keys:', Object.keys(po.rawData))
      } else {
        console.log('❌ No rawData at all')
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

testEnhancedData()