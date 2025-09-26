/**
 * Test automatic processing workflow
 */

import FormData from 'form-data'
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'

async function testAutomaticProcessing() {
  try {
    console.log('🧪 Testing automatic PO processing workflow...')
    
    // Create a comprehensive test CSV file with all required PO data
    const testCSV = `PO Number,Order Date,Expected Delivery,Supplier Name,Supplier Address,Supplier Contact,Product Code,Product Description,Quantity,Unit Price,Line Total,Notes
PO-2025-TEST-001,2025-09-24,2025-10-01,"Stockup Market Inc","123 Business Street, New York NY 10001","orders@stockupmarket.com (555) 123-4567",ORG001,"Premium Organic Apples - Grade A",100,2.50,250.00,"Fresh produce order"
PO-2025-TEST-001,2025-09-24,2025-10-01,"Stockup Market Inc","123 Business Street, New York NY 10001","orders@stockupmarket.com (555) 123-4567",BAN002,"Fresh Bananas - Premium Quality",50,1.80,90.00,"Rush delivery required"
PO-2025-TEST-001,2025-09-24,2025-10-01,"Stockup Market Inc","123 Business Street, New York NY 10001","orders@stockupmarket.com (555) 123-4567",,,,,,"SUBTOTAL: $340.00, TAX: $27.20, SHIPPING: $15.00, TOTAL: $382.20"`
    
    const testFilePath = path.join(process.cwd(), 'test-po.csv')
    fs.writeFileSync(testFilePath, testCSV)
    console.log('📄 Created test CSV file')
    
    // Simulate drag and drop upload with autoProcess=true
    const formData = new FormData()
    formData.append('file', fs.createReadStream(testFilePath))
    formData.append('autoProcess', 'true')
    formData.append('confidenceThreshold', '0.8')
    
    console.log('📤 Uploading file with auto-processing enabled...')
    const uploadResponse = await fetch('http://localhost:3005/api/upload/po-file', {
      method: 'POST',
      body: formData
    })
    
    const uploadResult = await uploadResponse.json()
    console.log('📥 Upload response:', JSON.stringify(uploadResult, null, 2))
    
    if (!uploadResult.success) {
      throw new Error(`Upload failed: ${uploadResult.error}`)
    }
    
    const { uploadId, poId, status } = uploadResult.data
    console.log(`✅ Upload successful - Upload ID: ${uploadId}, PO ID: ${poId}, Status: ${status}`)
    
    if (status === 'processing') {
      console.log('🔄 File is processing automatically, starting status monitoring...')
      
      // Poll status every 2 seconds for up to 2 minutes
      let attempts = 0
      const maxAttempts = 60
      
      const checkStatus = async () => {
        try {
          console.log(`📊 Checking status (attempt ${attempts + 1})...`)
          
          const statusResponse = await fetch(`http://localhost:3005/api/workflow/upload/${uploadId}/status`)
          const statusResult = await statusResponse.json()
          
          console.log('Status response:', JSON.stringify(statusResult, null, 2))
          
          if (statusResult.success && statusResult.workflow) {
            const { stage, progress, status: workflowStatus } = statusResult.workflow
            console.log(`🔍 Workflow Stage: ${stage}, Progress: ${progress}%, Status: ${workflowStatus}`)
            
            if (stage === 'completed' || workflowStatus === 'completed') {
              console.log('✅ Processing completed! Checking final result...')
              
              // Get the processed PO details
              const poResponse = await fetch(`http://localhost:3005/api/purchase-orders/${poId}`)
              const poResult = await poResponse.json()
              
              console.log('📋 Final PO result:', JSON.stringify(poResult, null, 2))
              return true
            }
            
            if (stage === 'failed' || workflowStatus === 'failed') {
              console.log('❌ Processing failed!')
              return true
            }
          }
          
          attempts++
          if (attempts < maxAttempts) {
            setTimeout(checkStatus, 2000)
          } else {
            console.log('⏰ Timeout reached - processing may still be ongoing')
          }
          
        } catch (error) {
          console.error('❌ Status check error:', error.message)
          attempts++
          if (attempts < maxAttempts) {
            setTimeout(checkStatus, 2000)
          }
        }
      }
      
      checkStatus()
      
    } else {
      console.log('⚠️ File was uploaded but not processing automatically')
      console.log('This indicates the automatic processing workflow is not starting')
    }
    
    // Clean up
    setTimeout(() => {
      try {
        fs.unlinkSync(testFilePath)
        console.log('🧹 Cleaned up test file')
      } catch (e) {}
    }, 5000)
    
  } catch (error) {
    console.error('❌ Test failed:', error.message)
  }
}

// Run the test
testAutomaticProcessing()