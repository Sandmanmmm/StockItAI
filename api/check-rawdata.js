import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()

const pos = await p.purchaseOrder.findMany({ 
  select: { 
    id: true, 
    number: true, 
    supplierName: true, 
    rawData: true 
  } 
})

console.log('🔍 All PO rawData status:')
pos.forEach(po => console.log(`${po.number || po.id}: ${po.rawData ? 'HAS rawData' : 'NO rawData'}`))

await p.$disconnect()