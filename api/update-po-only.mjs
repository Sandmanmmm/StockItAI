import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const poId = 'cmgna8jjx0001jm04qh4nfblg'

try {
  console.log(`\n🔧 Updating PO ${poId} to review_needed...\n`)
  
  const updated = await prisma.purchaseOrder.update({
    where: { id: poId },
    data: {
      status: 'review_needed',
      jobStatus: 'completed',
      jobCompletedAt: new Date(),
      processingNotes: 'Manually fixed from stuck state. 2 line items processed. Confidence: 77%',
      updatedAt: new Date()
    }
  })
  
  console.log(`✅ PO updated successfully!`)
  console.log(`   Status: ${updated.status}`)
  console.log(`   Job Status: ${updated.jobStatus}`)
  
} catch (error) {
  console.error('❌ Error:', error.message)
  console.error(error.stack)
} finally {
  await prisma.$disconnect()
}
