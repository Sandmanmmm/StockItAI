import { workflowOrchestrator } from './src/lib/workflowOrchestrator.js'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function retriggerAIProcessing() {
  try {
    console.log('🔄 Retriggering AI Processing for stuck uploads...\n')
    
    // Find stuck uploads
    const stuckUploads = await prisma.upload.findMany({
      where: {
        status: 'processing',
        workflowId: { not: null }
      },
      take: 1,
      orderBy: { createdAt: 'desc' }
    })
    
    if (stuckUploads.length === 0) {
      console.log('No stuck uploads found')
      await prisma.$disconnect()
      return
    }
    
    const upload = stuckUploads[0]
    console.log(`📁 Processing upload: ${upload.id}`)
    console.log(`  File: ${upload.fileName}`)
    console.log(`  Workflow ID: ${upload.workflowId}`)
    
    // Check if workflow orchestrator is initialized
    if (!workflowOrchestrator.isInitialized) {
      console.log('🚀 Initializing workflow orchestrator...')
      await workflowOrchestrator.initialize()
    }
    
    // Read file from storage and retrigger processing
    console.log('📄 Attempting to retrigger AI processing...')
    
    // For now, let's just add a job directly to the AI parsing queue
    const jobData = {
      workflowId: upload.workflowId,
      stage: 'ai_parsing',
      data: {
        uploadId: upload.id,
        fileName: upload.fileName,
        fileSize: upload.fileSize,
        mimeType: upload.mimeType,
        merchantId: upload.merchantId,
        supplierId: upload.supplierId,
        metadata: upload.metadata
      }
    }
    
    console.log('🎯 Adding AI parsing job to queue...')
    await workflowOrchestrator.addJobToQueue('ai_parse', jobData)
    
    console.log('✅ AI processing job added to queue!')
    
    await prisma.$disconnect()
    
  } catch (error) {
    console.error('❌ Error retriggering AI processing:', error)
    await prisma.$disconnect()
    process.exit(1)
  }
}

retriggerAIProcessing()