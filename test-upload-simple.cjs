// Simple test using fetch API to test upload endpoint
const fs = require('fs');
const { FormData, File } = require('buffer');

async function testUpload() {
  try {
    // Read the test file
    const fileBuffer = fs.readFileSync('./test-po-1758777151697.pdf');
    
    // Create FormData
    const formData = new FormData();
    formData.append('file', new File([fileBuffer], 'test-po.pdf', { type: 'application/pdf' }));
    formData.append('merchantId', 'cmft3moy50000ultcbqgxzz6d');
    
    console.log('📤 Sending upload request...');
    
    const response = await fetch('http://localhost:3005/api/upload', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    console.log('✅ Upload response:', result);
    
  } catch (error) {
    console.error('❌ Upload failed:', error.message);
  }
}

testUpload();