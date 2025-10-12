import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const poId = 'cmgna8jjx0001jm04qh4nfblg'

try {
  console.log(`\n🔧 Updating PO ${poId} with raw SQL...\n`)
  
  // Update PO status
  const poResult = await prisma.$executeRaw`
    UPDATE "PurchaseOrder"
    SET 
      "status" = 'review_needed',
      "jobStatus" = 'completed',
      "jobCompletedAt" = NOW(),
      "processingNotes" = 'Manually fixed from stuck state',
      "updatedAt" = NOW()
    WHERE "id" = ${poId}
  `
  
  console.log(`✅ PO updated! (${poResult} rows affected)`)
  
  // Now update the stuck workflow
  console.log(`\n🔧 Updating stuck workflows...`)
  
  const workflowResult = await prisma.$executeRaw`
    UPDATE "WorkflowExecution"
    SET 
      "status" = 'completed',
      "currentStage" = 'status_update',
      "progressPercent" = 100,
      "completedAt" = NOW(),
      "updatedAt" = NOW()
    WHERE "purchaseOrderId" = ${poId}
    AND "status" IN ('pending', 'processing')
  `
  
  console.log(`✅ Workflows updated! (${workflowResult} rows affected)`)
  
} catch (error) {
  console.error('❌ Error:', error.message)
  console.error(error.stack)
} finally {
  await prisma.$disconnect()
}
