const { PrismaClient } = require('@prisma/client')

async function findProcessingPOs() {
  const prisma = new PrismaClient()
  
  try {
    const processingPOs = await prisma.purchaseOrder.findMany({
      where: { status: 'processing' },
      include: { lineItems: true },
      orderBy: { createdAt: 'desc' },
      take: 10
    })
    
    console.log(`\n📋 Found ${processingPOs.length} POs in "processing" status:\n`)
    
    for (const po of processingPOs) {
      const age = Math.round((Date.now() - po.updatedAt.getTime()) / 60000)
      console.log(`${po.number}:`)
      console.log(`   ID: ${po.id}`)
      console.log(`   Line Items: ${po.lineItems.length}`)
      console.log(`   Confidence: ${(po.confidence * 100).toFixed(1)}%`)
      console.log(`   Age: ${age} min ${age > 5 ? '(auto-recovery eligible)' : ''}`)
      console.log('')
    }
    
  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

findProcessingPOs()
