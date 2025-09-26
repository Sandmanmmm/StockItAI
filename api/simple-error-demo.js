/**
 * Simple Error Handling Demo
 * 
 * Shows error handling system capabilities with proper Redis initialization
 */

import { redisManager } from './src/lib/redisManager.js'

async function initializeDemo() {
  try {
    console.log('🔌 Initializing Redis connections...')
    await redisManager.initializeConnections()
    console.log('✅ Redis connected successfully')
    
    // Import services after Redis is ready
    const { errorHandlingService, CONFIDENCE_THRESHOLDS, MERCHANT_MESSAGES } = await import('./src/lib/errorHandlingService.js')
    
    console.log('\n🎭 Error Handling & Transparency Demo')
    console.log('='.repeat(60))
    console.log('This demo shows how our system handles different scenarios')
    console.log('and provides clear, actionable feedback to merchants.')
    console.log('='.repeat(60))

    // Scenario 1: Perfect Document - Auto Processing
    console.log('\n📋 SCENARIO 1: High-Quality Document Processing')
    console.log('─'.repeat(50))
    console.log('A merchant uploads a clear, high-quality purchase order.')
    
    const perfectDocument = {
      confidence: 0.96,
      extractedData: {
        poNumber: 'PO-2024-001',
        supplier: {
          name: 'Premium Office Supplies Inc',
          email: 'orders@premiumoffice.com'
        },
        lineItems: [
          { description: 'Executive Office Chair', quantity: 5, price: 299.99 },
          { description: 'Standing Desk Pro', quantity: 2, price: 599.99 }
        ]
      },
      issues: [],
      quality: {
        documentClarity: 0.98,
        dataCompleteness: 1.0,
        structureScore: 0.95
      }
    }

    console.log('🤖 AI Processing Results:')
    console.log(`   Confidence Level: ${(perfectDocument.confidence * 100).toFixed(1)}%`)
    console.log(`   Document Quality: Excellent`)
    console.log(`   Data Completeness: 100%`)

    // Test high confidence handling
    const workflowId = 'perfect-doc-workflow'
    const result = await errorHandlingService.handleAIParsingResult(workflowId, perfectDocument)
    
    console.log(`\n✅ Expected Outcome: ${MERCHANT_MESSAGES.SUCCESS}`)
    console.log(`📊 Result: ${JSON.stringify(result, null, 2)}`)

    // Scenario 2: Low Confidence - Manual Review
    console.log('\n\n📋 SCENARIO 2: Low Confidence Document')
    console.log('─'.repeat(50))
    console.log('A scanned document with unclear text needs human review.')
    
    const lowConfidenceDoc = {
      confidence: 0.75,
      extractedData: {
        poNumber: 'PO-2024-???',  // Unclear
        supplier: {
          name: 'Unclear Supplies Co',
          email: '???@unclear.com'
        },
        lineItems: [
          { description: 'Office Chair (?)', quantity: '5?', price: '299.99?' }
        ]
      },
      issues: [
        'Poor document quality detected',
        'Some text appears blurred or unclear',
        'Price information may be incorrect'
      ],
      quality: {
        documentClarity: 0.6,
        dataCompleteness: 0.8,
        structureScore: 0.7
      }
    }

    console.log('🤖 AI Processing Results:')
    console.log(`   Confidence Level: ${(lowConfidenceDoc.confidence * 100).toFixed(1)}%`)
    console.log(`   Document Quality: Needs Review`)
    console.log(`   Issues Found: ${lowConfidenceDoc.issues.length}`)
    
    const reviewWorkflowId = 'review-needed-workflow'
    const reviewResult = await errorHandlingService.handleAIParsingResult(reviewWorkflowId, lowConfidenceDoc)
    
    console.log(`\n⚠️ Expected Outcome: ${MERCHANT_MESSAGES.REVIEW_NEEDED}`)
    console.log(`📊 Result: ${JSON.stringify(reviewResult, null, 2)}`)

    // Scenario 3: Shopify Sync Error
    console.log('\n\n📋 SCENARIO 3: Shopify Sync Failure')
    console.log('─'.repeat(50))
    console.log('A network error occurs during Shopify synchronization.')
    
    const shopifyError = new Error('Network timeout - Unable to connect to Shopify API')
    shopifyError.code = 'NETWORK_TIMEOUT'
    shopifyError.response = { status: 500 }
    
    const syncWorkflowId = 'shopify-sync-workflow'
    const syncResult = await errorHandlingService.handleShopifySyncError(syncWorkflowId, shopifyError, 1)
    
    console.log(`\n❌ Expected Outcome: ${MERCHANT_MESSAGES.SYNC_FAILED}`)
    console.log(`📊 Result: ${JSON.stringify(syncResult, null, 2)}`)

    // Show merchant status
    console.log('\n\n📊 MERCHANT STATUS DASHBOARD')
    console.log('─'.repeat(50))
    
    const statuses = await Promise.all([
      errorHandlingService.getMerchantStatus(workflowId),
      errorHandlingService.getMerchantStatus(reviewWorkflowId),
      errorHandlingService.getMerchantStatus(syncWorkflowId)
    ])
    
    statuses.forEach((status, index) => {
      const scenarios = ['High Quality Document', 'Low Confidence Document', 'Shopify Sync Error']
      console.log(`\n${index + 1}. ${scenarios[index]}:`)
      console.log(`   Status: ${status.status}`)
      console.log(`   Message: ${status.merchantMessage}`)
      if (status.actions?.length > 0) {
        console.log(`   Available Actions: ${status.actions.join(', ')}`)
      }
    })

    console.log('\n\n🎉 Demo completed successfully!')
    console.log('All error handling scenarios demonstrated.')
    
  } catch (error) {
    console.error('❌ Demo failed:', error.message)
    console.error(error)
  } finally {
    // Clean up Redis connection
    try {
      await redisManager.disconnect()
      console.log('🔌 Redis disconnected')
    } catch (err) {
      console.error('Error disconnecting Redis:', err)
    }
  }
}

// Run the demo
initializeDemo()