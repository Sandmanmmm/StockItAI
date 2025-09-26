#!/usr/bin/env node

/**
 * Test Workflow Integration
 */

import { workflowIntegration } from './src/lib/workflowIntegration.js'

async function testWorkflowIntegration() {
  console.log('🧪 Testing Workflow Integration')
  console.log('=' .repeat(40))
  
  try {
    console.log('\n📋 Step 1: Testing workflowIntegration object')
    console.log('workflowIntegration object:', typeof workflowIntegration)
    console.log('processUploadedFile method:', typeof workflowIntegration.processUploadedFile)
    
    console.log('\n📋 Step 2: Testing initialization')
    await workflowIntegration.initialize()
    console.log('✅ Workflow integration initialized')
    
    console.log('\n📋 Step 3: Testing with mock data')
    const mockData = {
      uploadId: 'test-upload-123',
      fileName: 'test-po.csv',
      originalFileName: 'test-po.csv',
      fileSize: 1024,
      mimeType: 'text/csv',
      merchantId: 'test-merchant',
      supplierId: null,
      buffer: Buffer.from('PO Number,Item,Quantity\nPO-123,Chair,2'),
      aiSettings: { confidenceThreshold: 0.8 },
      purchaseOrderId: 'test-po-id'
    }
    
    console.log('Mock data created, testing processUploadedFile...')
    const result = await workflowIntegration.processUploadedFile(mockData)
    console.log('✅ processUploadedFile result:', result)
    
  } catch (error) {
    console.log('❌ Workflow integration test failed:', error.message)
    console.log('Stack trace:', error.stack)
  }
}

testWorkflowIntegration()