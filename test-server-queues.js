/**
 * Test server queue status by checking running server
 */

import fetch from 'node-fetch';

async function testServerQueues() {
  try {
    console.log('🧪 Testing server queue status...');
    
    // Test if server is running
    const response = await fetch('http://localhost:3005/api/purchase-orders');
    
    if (!response.ok) {
      console.error('❌ Server is not responding');
      return;
    }
    
    const serverStatus = await response.json();
    console.log('📊 Server Status:', JSON.stringify(serverStatus, null, 2));
    
  } catch (error) {
    console.error('❌ Error checking server status:', error.message);
  }
}

testServerQueues();