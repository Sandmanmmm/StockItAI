// Simple upload test for AI parsing fix
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function quickTest() {
  try {
    console.log('🚀 Testing AI parsing fix...');
    
    // Health check
    const health = await axios.get('http://localhost:3005/api/health');
    console.log('✅ Server status:', health.data.status);
    
    // Simple test upload
    const form = new FormData();
    form.append('file', fs.createReadStream('./test-po-1758777151697.pdf'));
    form.append('merchantId', 'test-merchant');
    
    console.log('📤 Testing upload...');
    const response = await axios.post('http://localhost:3005/api/upload/po-file', form, {
      headers: form.getHeaders(),
      timeout: 10000
    });
    
    console.log('✅ Upload response:', response.data);
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

quickTest();