import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

try {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
  
  // This is the auto-fix query
  const stuckPOs = await prisma.purchaseOrder.findMany({
    where: {
      status: 'processing',
      updatedAt: {
        lt: fiveMinutesAgo
      }
    },
    include: {
      lineItems: true
    },
    take: 10
  })
  
  console.log(`\n📋 Auto-fix would find ${stuckPOs.length} stuck POs:\n`)
  
  stuckPOs.forEach((po, i) => {
    const age = Math.round((Date.now() - po.updatedAt.getTime()) / 1000)
    console.log(`${i+1}. PO ${po.id}`)
    console.log(`   Number: ${po.number || 'N/A'}`)
    console.log(`   Status: ${po.status}`)
    console.log(`   Line Items: ${po.lineItems.length}`)
    console.log(`   Confidence: ${po.confidence}`)
    console.log(`   Age: ${age}s`)
    console.log(`   Would fix: ${po.lineItems.length > 0 ? 'YES ✅' : 'NO ❌'}`)
    console.log()
  })
  
} catch (error) {
  console.error('Error:', error.message)
} finally {
  await prisma.$disconnect()
}
