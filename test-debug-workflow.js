import fetch from 'node-fetch';

async function testWorkflowWithDebugLogs() {
    console.log('🔍 Testing workflow with enhanced debug logging...');
    
    try {
        // First, check if server is running
        const healthResponse = await fetch('http://localhost:3005/api/health');
        if (!healthResponse.ok) {
            console.log('❌ Server not ready yet. Please wait for the API server to fully initialize.');
            return;
        }
        
        console.log('✅ Server is ready');
        
        // Get the most recent PO to test with
        const recentResponse = await fetch('http://localhost:3005/api/purchase-orders?limit=1');
        const recentData = await recentResponse.json();
        
        console.log('📋 API Response structure:', JSON.stringify(recentData, null, 2));
        
        if (!recentData.success || !recentData.data || !recentData.data.orders || recentData.data.orders.length === 0) {
            console.log('❌ No recent PO found to test with');
            console.log('Response:', JSON.stringify(recentData, null, 2));
            return;
        }
        
        const latestPO = recentData.data.orders[0];
        console.log(`🎯 Testing with PO ID: ${latestPO.id}`);
        console.log(`📊 Current status: ${latestPO.status}`);
        console.log(`⏰ Last updated: ${latestPO.updated_at}`);
        
        // Trigger manual processing to test our debug logs
        console.log('🚀 Triggering manual processing with debug logs...');
        const processResponse = await fetch(`http://localhost:3005/api/purchase-orders/${latestPO.id}/reprocess`, {
            method: 'POST'
        });
        
        if (processResponse.ok) {
            const result = await processResponse.json();
            console.log('✅ Processing triggered successfully');
            console.log('📝 Response:', JSON.stringify(result, null, 2));
            
            // Monitor the debug logs
            console.log('👀 Check the API server window for detailed debug logs...');
            console.log('🔍 Look for debug messages showing:');
            console.log('   - purchaseOrderId validation');
            console.log('   - Database update attempts');
            console.log('   - Update results and timing');
            
        } else {
            console.log('❌ Failed to trigger processing');
            console.log('Status:', processResponse.status);
            const error = await processResponse.text();
            console.log('Error:', error);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testWorkflowWithDebugLogs();