/**
 * Test the running server's workflow orchestrator queue status
 */

import fetch from 'node-fetch';

async function testRunningServerQueues() {
  try {
    console.log('🧪 Testing running server workflow orchestrator...');
    
    // Test server connection first
    const serverTest = await fetch('http://localhost:3005/api/purchase-orders');
    if (!serverTest.ok) {
      console.error('❌ Server is not responding');
      return;
    }
    console.log('✅ Server is responding');
    
    // Now test our automatic processing workflow
    console.log('📤 Testing automatic PO processing...');
    
    const formData = new FormData();
    
    // Create a test CSV file content
    const testContent = 'vendor,item,quantity,price\nTest Server Supplier,Test Server Item,1,15.00';
    const blob = new Blob([testContent], { type: 'text/csv' });
    
    formData.append('file', blob, `server-test-${Date.now()}.csv`);
    formData.append('autoProcess', 'true');
    formData.append('merchantId', 'test-merchant-server');
    
    const uploadResponse = await fetch('http://localhost:3005/api/upload/po-file', {
      method: 'POST',
      body: formData
    });
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('❌ Upload failed:', uploadResponse.status, errorText);
      return;
    }
    
    const uploadResult = await uploadResponse.json();
    console.log('📋 Upload Result:', JSON.stringify(uploadResult, null, 2));
    
    if (uploadResult.workflowId) {
      console.log('🔍 Checking workflow status...');
      
      // Wait a bit and check status multiple times
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        
        const statusResponse = await fetch(`http://localhost:3005/api/workflow/upload/${uploadResult.uploadId}/status`);
        
        if (statusResponse.ok) {
          const status = await statusResponse.json();
          console.log(`📊 Status Check ${i + 1}:`, JSON.stringify(status, null, 2));
          
          if (status.status !== 'ai_parsing' && status.status !== 'pending') {
            console.log('✅ Workflow moved past AI parsing stage!');
            break;
          }
        } else {
          console.error('❌ Failed to get status:', statusResponse.status);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error testing server queues:', error.message);
  }
}

testRunningServerQueues();