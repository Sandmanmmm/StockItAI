import { PrismaClient } from '@prisma/client'
import { enhancedAIService } from './src/lib/enhancedAIService.js'
import { storageService } from './src/lib/storageService.js'

const prisma = new PrismaClient()

async function processSpecificPO() {
  try {
    const poNumber = process.argv[2]
    if (!poNumber) {
      console.log('Usage: node process-specific-po.js <PO_NUMBER>')
      process.exit(1)
    }
    
    console.log(`🔧 Processing specific PO: ${poNumber}`)
    
    // Find the specific PO
    const po = await prisma.purchaseOrder.findFirst({
      where: {
        number: poNumber
      }
    })
    
    if (!po) {
      console.log(`❌ PO ${poNumber} not found`)
      await prisma.$disconnect()
      return
    }
    
    console.log(`📦 Found PO: ${po.number}`)
    console.log(`   File: ${po.fileName}`)
    console.log(`   File URL: ${po.fileUrl}`)
    console.log(`   Current Status: ${po.status}`)
    console.log(`   Current Confidence: ${po.confidence}%`)
    
    // Download file from storage
    console.log('📁 Downloading file from storage...')
    const fileResult = await storageService.downloadFile(po.fileUrl)
    
    if (!fileResult || !fileResult.success || !fileResult.buffer) {
      console.log('❌ Failed to download file from storage')
      console.log('File result:', fileResult)
      await prisma.$disconnect()
      return
    }
    
    console.log('✅ File downloaded successfully')
    console.log(`📊 Buffer size: ${fileResult.buffer.length} bytes`)
    
    // Detect file type
    const firstBytes = fileResult.buffer.slice(0, 10)
    console.log('🔍 First 10 bytes (hex):', firstBytes.toString('hex'))
    console.log('🔍 First 10 bytes (ascii):', firstBytes.toString('ascii'))
    
    // Check if it's a PDF
    const isPDF = fileResult.buffer.slice(0, 4).toString('ascii') === '%PDF'
    console.log(`📄 Is PDF: ${isPDF}`)
    
    if (isPDF) {
      console.log('🤖 Processing PDF file...')
    } else {
      console.log('🖼️ Processing as image file...')
    }
    
    // Generate unique workflow ID
    const workflowId = `manual_${Date.now()}`
    
    try {
      // Process with AI service
      const aiResult = await enhancedAIService.parseDocument(fileResult.buffer, workflowId, {
        fileName: po.fileName,
        merchantId: po.merchantId,
        aiSettings: {
          confidenceThreshold: 0.7,
          strictMatching: false,
          primaryModel: 'gpt-4o-mini',
          fallbackModel: 'gpt-3.5-turbo'
        }
      })
      
      console.log('✅ AI processing completed!')
      console.log(`   Confidence: ${aiResult.confidence}%`)
      console.log(`   Supplier: ${aiResult.supplierName || 'Unknown'}`)
      console.log(`   Total: $${aiResult.totalAmount || 0}`)
      console.log(`   Line items: ${aiResult.lineItems?.length || 0}`)
      
      // Display full result
      console.log('\n📊 Full AI Result:')
      console.log(JSON.stringify(aiResult, null, 2))
      
    } catch (aiError) {
      console.error('❌ AI processing failed:', aiError.message)
      console.error('Stack trace:', aiError.stack)
    }
    
    await prisma.$disconnect()
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error('Stack trace:', error.stack)
    await prisma.$disconnect()
    process.exit(1)
  }
}

processSpecificPO()