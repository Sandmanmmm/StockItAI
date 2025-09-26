/**
 * Test the server's running orchestrator by hitting the API endpoint
 * This tests the EXACT same workflow as drag-and-drop would use
 */

console.log('🌐 Testing server orchestrator via API endpoint...');
console.log('📡 Server should be running on localhost:3005');

// Test using the actual reprocess endpoint like drag-and-drop would
const testReprocessWithRealPO = async () => {
    try {
        console.log('\n🔍 Getting a PO to test with...');
        
        const listResponse = await fetch('http://localhost:3005/api/purchase-orders');
        const listData = await listResponse.json();
        
        if (!listData.success || !listData.data.orders.length) {
            throw new Error('No POs available for testing');
        }
        
        // Find a PO with "processing" status
        const processingPO = listData.data.orders.find(po => po.status === 'processing');
        if (!processingPO) {
            throw new Error('No processing POs found for testing');
        }
        
        console.log(`📋 Testing with PO: ${processingPO.number} (${processingPO.id})`);
        console.log(`📄 File: ${processingPO.fileName}, Status: ${processingPO.status}`);
        
        console.log('\n🔄 Triggering reprocess via API...');
        console.log('🎯 This should trigger the EXACT same Bull queue workflow as drag-and-drop');
        
        const reprocessResponse = await fetch(
            `http://localhost:3005/api/purchase-orders/${processingPO.id}/reprocess`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );
        
        if (!reprocessResponse.ok) {
            const errorText = await reprocessResponse.text();
            console.error('❌ Reprocess API failed:', errorText);
            return false;
        }
        
        const reprocessData = await reprocessResponse.json();
        console.log('✅ Reprocess API response:', reprocessData);
        
        if (reprocessData.success) {
            console.log('\n⏰ Waiting 10 seconds to see if job gets processed...');
            console.log('👀 Check the server console (in the separate PowerShell window) for:');
            console.log('   🎯 BULL PROCESSOR TRIGGERED for ai_parse job');
            console.log('   🔄 Processing AI parsing job...');
            console.log('   ✅ AI parsing completed successfully');
            
            // Wait and check if the PO status changed
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            console.log('\n🔍 Checking if PO was processed...');
            const checkResponse = await fetch(`http://localhost:3005/api/purchase-orders/${processingPO.id}`);
            const checkData = await checkResponse.json();
            
            if (checkData.success) {
                console.log(`📊 PO Status After Processing: ${checkData.data.status}`);
                console.log(`🎯 Changed from "${processingPO.status}" to "${checkData.data.status}"`);
                
                if (checkData.data.status !== processingPO.status) {
                    console.log('🎉 SUCCESS! The PO status changed - automatic processing is working!');
                    return true;
                } else {
                    console.log('⚠️  PO status unchanged - check server console for processing activity');
                    return false;
                }
            }
        }
        
        return false;
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        return false;
    }
};

// Run the test
testReprocessWithRealPO()
    .then(success => {
        if (success) {
            console.log('\n🎉 RESULT: Automatic processing is working correctly!');
            console.log('✅ The original issue with drag-and-drop PO processing should be resolved.');
        } else {
            console.log('\n❌ RESULT: Automatic processing is still not working');
            console.log('🔍 Check the server console for error messages or missing processor triggers.');
        }
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('💥 Test script error:', error);
        process.exit(1);
    });