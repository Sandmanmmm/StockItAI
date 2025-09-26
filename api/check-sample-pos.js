import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()

const pos = await p.purchaseOrder.findMany({ 
  where: { 
    number: { 
      in: ['PO-1758675057685', 'PO-1758668881105', 'PO-1758668614021'] 
    } 
  }, 
  select: { 
    number: true, 
    supplierName: true, 
    totalAmount: true, 
    rawData: true 
  } 
})

console.log('🔍 Sample PO data from database:')
pos.forEach(po => {
  console.log(`${po.number}:`)
  console.log(`  DB supplierName: "${po.supplierName}"`)
  console.log(`  DB totalAmount: ${po.totalAmount}`)
  console.log(`  Has rawData: ${po.rawData ? 'YES' : 'NO'}`)
  if(po.rawData?.vendor) console.log(`  AI vendor.name: "${po.rawData.vendor.name}"`)
  if(po.rawData?.totals) console.log(`  AI totals.total: ${po.rawData.totals.total}`)
  console.log('')
})

await p.$disconnect()