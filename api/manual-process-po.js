import { PrismaClient } from '@prisma/client'
import { enhancedAIService } from './src/lib/enhancedAIService.js'
import { storageService } from './src/lib/storageService.js'

const prisma = new PrismaClient()

async function manuallyProcessPO() {
  try {
    console.log('🔧 Manually processing stuck PO...\n')
    
    // Get a stuck PO (processing or review_needed with low confidence)
    const stuckPO = await prisma.purchaseOrder.findFirst({
      where: {
        OR: [
          { 
            status: 'processing',
            confidence: { lte: 10 }
          },
          {
            status: 'review_needed', 
            confidence: { lte: 10 }
          }
        ]
      },
      orderBy: { createdAt: 'desc' }
    })
    
    if (!stuckPO) {
      console.log('No stuck PO found')
      await prisma.$disconnect()
      return
    }
    
    console.log(`📦 Processing PO: ${stuckPO.number}`)
    console.log(`   File: ${stuckPO.fileName}`)
    console.log(`   Current Status: ${stuckPO.status}`)
    console.log(`   Current Confidence: ${stuckPO.confidence}%`)
    
    // Download file from storage
    console.log('📁 Downloading file from storage...')
    const fileResult = await storageService.downloadFile(stuckPO.fileUrl)
    
    console.log('📊 Download result type:', typeof fileResult)
    console.log('📊 Download result keys:', fileResult ? Object.keys(fileResult) : 'null/undefined')
    
    if (!fileResult || !fileResult.success || !fileResult.buffer) {
      console.log('❌ Failed to download file from storage or no data returned')
      await prisma.$disconnect()
      return
    }
    
    const fileBuffer = fileResult.buffer
    console.log('✅ File downloaded successfully')
    console.log('📊 Buffer type:', typeof fileBuffer)
    console.log('📊 Is Buffer?', Buffer.isBuffer(fileBuffer))
    
    // Get merchant AI settings
    const aiSettings = await prisma.aISettings.findFirst({
      where: { merchantId: stuckPO.merchantId }
    })
    
    const processingOptions = {
      confidenceThreshold: aiSettings?.confidenceThreshold || 85,
      strictMatching: aiSettings?.strictMatching || true,
      primaryModel: aiSettings?.primaryModel || 'gpt-4o-mini',
      fallbackModel: aiSettings?.fallbackModel || 'gpt-3.5-turbo'
    }
    
    console.log('🤖 Running AI processing...')
    console.log('   Options:', processingOptions)
    
    // Process with AI
    const workflowId = `manual_${Date.now()}`
    
    console.log('📊 File details:')
    console.log('   Buffer length:', fileBuffer.length)
    console.log('   First few bytes:', Array.from(fileBuffer.slice(0, 10)).map(b => b.toString(16)).join(' '))
    
    // Create a temporary debugging version to capture the raw AI response
    const OpenAI = await import('openai').then(m => m.default)
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    
    console.log('🔍 Making direct OpenAI call to debug response...')
    
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `
Analyze this purchase order document and extract the following information with high accuracy.
Provide a confidence score (0-1) for each extracted field and an overall confidence score.

Extract:
- PO Number
- Supplier/Vendor Information (name, address, contact)
- Line Items (product codes, descriptions, quantities, unit prices, totals)
- Dates (order date, expected delivery date)
- Total amounts
- Special instructions or notes

Return the data in this JSON format:
{
  "confidence": 0.95,
  "extractedData": {
    "poNumber": "...",
    "supplier": {...},
    "lineItems": [...],
    "dates": {...},
    "totals": {...},
    "notes": "..."
  },
  "fieldConfidences": {
    "poNumber": 0.98,
    "supplier": 0.95,
    "lineItems": 0.90,
    ...
  },
  "qualityIndicators": {
    "imageClarity": "high|medium|low",
    "textLegibility": "high|medium|low", 
    "documentCompleteness": "complete|partial|incomplete"
  },
  "issues": [...],
  "suggestions": [...]
}

Be very conservative with confidence scores. Only give high confidence (>0.9) when you're absolutely certain.
`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${fileBuffer.toString('base64')}`,
                  detail: "high"
                }
              }
            ]
          }
        ],
        max_tokens: 4000,
        temperature: 0.1
      })

      const aiResponse = response.choices[0]?.message?.content
      console.log('🔍 RAW AI RESPONSE:')
      console.log('=====================================')
      console.log(aiResponse)
      console.log('=====================================')
      console.log(`📊 Response length: ${aiResponse?.length || 0} characters`)
      
      if (!aiResponse) {
        throw new Error('No response from AI service')
      }

      // Try to extract JSON
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
      console.log('🔍 JSON MATCH RESULT:')
      if (jsonMatch) {
        console.log('✅ Found JSON in response')
        console.log('First 300 chars:', jsonMatch[0].substring(0, 300) + '...')
        try {
          const parsed = JSON.parse(jsonMatch[0])
          console.log('✅ JSON parsed successfully')
          console.log('Confidence:', parsed.confidence)
        } catch (parseErr) {
          console.log('❌ JSON parse failed:', parseErr.message)
        }
      } else {
        console.log('❌ No JSON match found in response')
      }
      
    } catch (directError) {
      console.error('❌ Direct OpenAI call failed:', directError.message)
    }
    
    // Now run the normal AI service 
    const aiResult = await enhancedAIService.parseDocument(fileBuffer, workflowId, {
      fileName: stuckPO.fileName,
      mimeType: 'image/jpeg', // Assuming it's the image file
      merchantId: stuckPO.merchantId,
      aiSettings: processingOptions
    })
    
    console.log('✅ AI processing completed!')
    console.log('   Result:', {
      confidence: aiResult.confidence,
      lineItemsCount: aiResult.lineItems?.length || 0,
      supplierName: aiResult.supplierName || 'Unknown'
    })
    
    // Update the PO with AI results
    console.log('💾 Updating PO in database...')
    
    const updatedPO = await prisma.purchaseOrder.update({
      where: { id: stuckPO.id },
      data: {
        supplierName: aiResult.supplierName || 'Unknown Supplier',
        totalAmount: aiResult.totalAmount || 0,
        confidence: aiResult.confidence || 0,
        status: aiResult.confidence >= processingOptions.confidenceThreshold ? 'completed' : 'review_needed',
        jobStatus: 'completed',
        processingNotes: aiResult.notes || 'Processed manually',
        rawData: aiResult,
        jobCompletedAt: new Date()
      }
    })
    
    // Create line items if any
    if (aiResult.lineItems && aiResult.lineItems.length > 0) {
      console.log(`📝 Creating ${aiResult.lineItems.length} line items...`)
      
      for (const item of aiResult.lineItems) {
        await prisma.pOLineItem.create({
          data: {
            sku: item.sku || 'UNKNOWN',
            productName: item.productName || 'Unknown Product',
            description: item.description || '',
            quantity: item.quantity || 1,
            unitCost: item.unitCost || 0,
            totalCost: item.totalCost || 0,
            confidence: item.confidence || 0,
            status: 'pending',
            purchaseOrderId: stuckPO.id,
            aiNotes: item.notes || ''
          }
        })
      }
    }
    
    console.log('✅ PO processing completed!')
    console.log('   Updated Status:', updatedPO.status)
    console.log('   Final Confidence:', updatedPO.confidence + '%')
    
    await prisma.$disconnect()
    
  } catch (error) {
    console.error('❌ Error manually processing PO:', error)
    await prisma.$disconnect()
    process.exit(1)
  }
}

manuallyProcessPO()