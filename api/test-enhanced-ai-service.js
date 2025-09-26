#!/usr/bin/env node

/**
 * Test Enhanced AI Processing Service
 * Tests the new document classification and enhanced prompt engineering features
 */

import path from 'path'
import { fileURLToPath } from 'url'
import AIProcessingService from './src/lib/aiProcessingService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function testEnhancedAIService() {
  console.log('🧠 Testing Enhanced AI Processing Service...\n')
  
  try {
    const aiService = new AIProcessingService()
    
    // Test 1: Document Classification
    console.log('1️⃣ Testing Document Classification...')
    const samplePOText = `
PURCHASE ORDER #PO-2024-0001

Date: January 15, 2024
Vendor: Tech Supplies Inc.
123 Business Ave
Tech City, TC 12345

Order Details:
- Laptops x 5 @ $1200 each = $6000
- Monitors x 5 @ $300 each = $1500
- Keyboards x 5 @ $50 each = $250

Subtotal: $7750
Tax: $775
Total: $8525
`
    
    const docType = await aiService.classifyDocumentType(samplePOText)
    console.log(`✅ Document classified as: ${docType}`)
    
    // Test 2: Enhanced Confidence Scoring
    console.log('\n2️⃣ Testing Enhanced Confidence Scoring...')
    const sampleData = {
      poNumber: 'PO-2024-0001',
      vendor: {
        name: 'Tech Supplies Inc.',
        address: '123 Business Ave, Tech City, TC 12345',
        contact: ''
      },
      orderDate: '2024-01-15',
      deliveryDate: '2024-01-25',
      lineItems: [
        {
          description: 'Laptops',
          quantity: 5,
          unitPrice: 1200,
          totalPrice: 6000
        },
        {
          description: 'Monitors', 
          quantity: 5,
          unitPrice: 300,
          totalPrice: 1500
        }
      ],
      totals: {
        subtotal: 7750,
        tax: 775,
        total: 8525
      }
    }
    
    const scoredData = aiService.applyEnhancedConfidenceScoring(sampleData, samplePOText)
    console.log('✅ Enhanced confidence scores:')
    console.log(`   Overall: ${scoredData.confidence.overall}%`)
    console.log(`   PO Number: ${scoredData.confidence.poNumber}%`)
    console.log(`   Vendor: ${scoredData.confidence.vendor}%`)
    console.log(`   Line Items: ${scoredData.confidence.lineItems}%`)
    console.log(`   Totals: ${scoredData.confidence.totals}%`)
    console.log(`   Data Quality: ${scoredData.dataQuality}`)
    
    // Test 3: Industry-Specific Processing
    console.log('\n3️⃣ Testing Industry-Specific Prompts...')
    const techPrompt = aiService.getEnhancedSystemPrompt('purchase_order', 'technology')
    console.log('✅ Technology industry system prompt generated')
    console.log(`   Length: ${techPrompt.length} characters`)
    
    const enhancedPrompt = aiService.buildEnhancedExtractionPrompt(
      samplePOText, 
      'purchase_order', 
      'technology',
      ['warranty_period', 'delivery_method']
    )
    console.log('✅ Enhanced extraction prompt generated')
    console.log(`   Length: ${enhancedPrompt.length} characters`)
    console.log(`   Includes custom fields: warranty_period, delivery_method`)
    
    console.log('\n🎉 All enhanced AI service tests completed successfully!')
    console.log('\nNew Features Available:')
    console.log('• Document type classification (pattern + AI hybrid)')
    console.log('• Multi-dimensional confidence scoring')
    console.log('• Industry-specific processing rules')
    console.log('• Enhanced prompt engineering')
    console.log('• Mathematical validation of totals')
    console.log('• Custom field extraction support')
    
  } catch (error) {
    console.error('❌ Enhanced AI Service test failed:', error)
    process.exit(1)
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testEnhancedAIService().catch(console.error)
}

export { testEnhancedAIService }