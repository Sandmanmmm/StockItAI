// Test upload endpoint with live API server
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

const API_BASE = 'http://localhost:3005';
const TEST_PDF = './test-po-1758777151697.pdf';

async function testUploadEndpoint() {
  console.log('🚀 Testing upload endpoint with live API server...');
  
  try {
    // First, check if server is running
    const healthResponse = await axios.get(`${API_BASE}/api/health`);
    console.log('✅ API server health check:', healthResponse.data);
    
    // Create form data with test PDF
    const form = new FormData();
    form.append('file', fs.createReadStream(TEST_PDF));
    form.append('merchantId', 'cmft3moy50000ultcbqgxzz6d'); // Use the same test merchant ID
    
    console.log('📤 Uploading test PDF...');
    const uploadResponse = await axios.post(`${API_BASE}/api/upload/po-file`, form, {
      headers: {
        ...form.getHeaders(),
      },
    });
    
    console.log('✅ Upload successful:', uploadResponse.data);
    
    const { workflowId, poId } = uploadResponse.data.data;
    
    console.log(`🔄 Workflow started: ${workflowId}`);
    console.log(`📋 Purchase Order ID: ${poId}`);
    
    // Monitor workflow progress
    console.log('🕐 Monitoring workflow progress...');
    for (let i = 0; i < 30; i++) { // Monitor for up to 30 seconds
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      try {
        const statusResponse = await axios.get(`${API_BASE}/api/purchase-orders/${poId}/status`);
        const status = statusResponse.data;
        
        console.log(`📊 Status check ${i + 1}: ${status.status} (confidence: ${status.confidenceScore || 'N/A'})`);
        
        if (status.status !== 'processing') {
          console.log('🎉 Workflow completed!');
          console.log('Final status:', JSON.stringify(status, null, 2));
          break;
        }
      } catch (error) {
        console.log(`❌ Status check ${i + 1} failed:`, error.response?.data?.error || error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    console.error('Stack trace:', error.stack);
  }
}

testUploadEndpoint().catch(console.error);