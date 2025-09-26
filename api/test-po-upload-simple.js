#!/usr/bin/env node

/**
 * Simple PO Upload Test - Tests the actual OpenAI processing workflow
 */

import axios from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import path from 'path'

const API_BASE = 'http://localhost:3005/api'

// Create a simple test PO document as CSV
function createTestPO() {
  return `PO Number,Date,Supplier Name,Supplier Address,Bill To,Item Description,Quantity,Unit Price,Total Price,Subtotal,Tax,Grand Total
PO-TEST-${Date.now()},${new Date().toLocaleDateString()},"ABC Office Supplies","123 Supply Street, Business City, CA 90210","Test Store, 456 Commerce Ave, Commerce City, CA 90211","Desk Chair",2,150.00,300.00,435.00,34.80,469.80
,,,,,"Monitor Stand",1,75.00,75.00,,,
,,,,,"USB Cables",5,12.00,60.00,,,`
}

async function testPOUpload() {
  console.log('🧪 Simple PO Upload Test')
  console.log('========================\n')
  
  try {
    // Step 1: Test basic server connectivity
    console.log('📡 Step 1: Testing server connectivity...')
    const healthResponse = await axios.get(`${API_BASE}/health`)
    console.log(`✅ Server responded (${healthResponse.data.status})`)
    console.log(`   OpenAI: ${healthResponse.data.services.openai}`)
    
    // Step 2: Create and upload test PO
    console.log('\n📄 Step 2: Creating test PO document...')
    const testPO = createTestPO()
    const tempFile = path.join(process.cwd(), `test-po-${Date.now()}.csv`)
    fs.writeFileSync(tempFile, testPO)
    console.log(`✅ Created: ${path.basename(tempFile)}`)
    
    // Step 3: Upload the document
    console.log('\n⬆️ Step 3: Uploading PO document...')
    const formData = new FormData()
    formData.append('file', fs.createReadStream(tempFile))
    formData.append('merchantId', 'test-merchant-001')
    formData.append('supplierName', 'ABC Office Supplies')
    formData.append('autoProcess', 'true')
    
    const uploadResponse = await axios.post(`${API_BASE}/upload/po-file`, formData, {
      headers: {
        ...formData.getHeaders(),
        'Content-Type': 'multipart/form-data'
      }
    })
    
    console.log(`✅ Upload successful!`)
    console.log(`   Upload ID: ${uploadResponse.data.data.uploadId}`)
    console.log(`   PO ID: ${uploadResponse.data.data.poId}`)
    console.log(`   Status: ${uploadResponse.data.data.status}`)
    
    // Step 4: Monitor processing
    console.log('\n🔄 Step 4: Monitoring AI processing...')
    const uploadId = uploadResponse.data.data.uploadId
    let attempts = 0
    const maxAttempts = 30 // 30 seconds max
    
    while (attempts < maxAttempts) {
      try {
        const statusResponse = await axios.get(`${API_BASE}/workflow/upload/${uploadId}/status`)
        console.log(`   Attempt ${attempts + 1}: ${statusResponse.data.workflow?.status || 'unknown'}`)
        
        if (statusResponse.data.workflow?.status === 'completed') {
          console.log('✅ Processing completed!')
          console.log('   AI Analysis Results:')
          console.log(`     - Confidence: ${statusResponse.data.workflow?.result?.confidence || 'N/A'}%`)
          console.log(`     - Items found: ${statusResponse.data.workflow?.result?.items?.length || 0}`)
          console.log(`     - Total: $${statusResponse.data.workflow?.result?.total || 'N/A'}`)
          break
        } else if (statusResponse.data.workflow?.status === 'failed') {
          console.log('❌ Processing failed!')
          console.log(`   Error: ${statusResponse.data.workflow?.error}`)
          break
        }
        
        // Wait 1 second before next check
        await new Promise(resolve => setTimeout(resolve, 1000))
        attempts++
      } catch (error) {
        console.log(`   Status check failed: ${error.message}`)
        attempts++
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    
    if (attempts >= maxAttempts) {
      console.log('⏰ Timeout waiting for processing to complete')
    }
    
    // Cleanup
    fs.unlinkSync(tempFile)
    console.log(`🧹 Cleaned up temp file`)
    
  } catch (error) {
    console.log('❌ Test failed:', error.message)
    if (error.response) {
      console.log(`   HTTP ${error.response.status}: ${error.response.statusText}`)
      if (error.response.data) {
        console.log('   Response:', JSON.stringify(error.response.data, null, 2))
      }
    }
  }
  
  console.log('\n✅ Test completed')
}

// Run the test
testPOUpload()