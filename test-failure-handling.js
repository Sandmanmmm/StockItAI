import fetch from 'node-fetch';

async function testFailureHandling() {
    const stuckPOId = 'cmfyxygq5000n55g06v34nkny'; // The PDF PO that's stuck
    
    console.log(`🧪 Testing failure handling for stuck PO: ${stuckPOId}`);
    console.log('This PO should fail due to PDF parsing error and update to "failed" status');
    
    try {
        // Try to reprocess the stuck PO
        const response = await fetch(`http://localhost:3005/api/purchase-orders/${stuckPOId}/reprocess`, {
            method: 'POST'
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Reprocess triggered successfully');
            console.log('Response:', JSON.stringify(result, null, 2));
            
            // Monitor the PO to see if it fails properly
            console.log('\n👀 Monitoring PO status...');
            for (let i = 0; i < 10; i++) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                const poResponse = await fetch(`http://localhost:3005/api/purchase-orders/${stuckPOId}`);
                if (poResponse.ok) {
                    const poData = await poResponse.json();
                    if (poData.success && poData.data) {
                        const po = poData.data;
                        console.log(`📊 [${i*3}s] Status: ${po.status}, Job Status: ${po.jobStatus || 'N/A'}`);
                        
                        if (po.status === 'failed') {
                            console.log('🎉 SUCCESS: PO status properly updated to "failed"!');
                            console.log(`Error: ${po.jobError || po.processingNotes || 'N/A'}`);
                            console.log('✅ Failure handling fix is working!');
                            break;
                        }
                        
                        if (po.status === 'completed' || po.status === 'review_needed') {
                            console.log('⚠️ Unexpected: PO completed despite PDF error');
                            break;
                        }
                    }
                }
            }
            
        } else {
            console.log('❌ Reprocess failed');
            const error = await response.text();
            console.log('Error:', error);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testFailureHandling();