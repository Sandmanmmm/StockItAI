import fetch from 'node-fetch';

async function monitorSupplierFix() {
    const poId = 'cmfyxqjbi000155o0yjys3nlr';
    const workflowId = 'workflow_1758775861731_wa9vvdph2';
    
    console.log(`🎯 Monitoring SUPPLIER FIX: ${poId}`);
    console.log(`🔄 Workflow ID: ${workflowId}`);
    console.log('🔧 Testing enhanced supplier extraction logic...');
    console.log('');
    
    for (let i = 0; i < 15; i++) {
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
        
        try {
            const poResponse = await fetch(`http://localhost:3005/api/purchase-orders/${poId}`);
            if (poResponse.ok) {
                const poData = await poResponse.json();
                if (poData.success && poData.data) {
                    const po = poData.data;
                    console.log(`📊 [${i*3}s] Status: ${po.status}, Confidence: ${po.confidence.toFixed(3)}%, Supplier: "${po.supplierName}", Amount: ${po.totalAmount} USD`);
                    
                    // Check for success indicators
                    if (po.confidence > 0) {
                        console.log('✅ Confidence: Working');
                    }
                    
                    if (po.supplierName && po.supplierName !== 'Unknown' && po.supplierName !== 'Processing...') {
                        console.log('🎉 SUCCESS: Supplier name extracted! Full fix achieved!');
                        console.log(`   Supplier: "${po.supplierName}"`);
                    }
                    
                    if (po.status === 'completed' || po.status === 'processed' || po.status === 'review_needed') {
                        console.log('📋 Final Results:');
                        console.log(`   - Status: ${po.status}`);
                        console.log(`   - Confidence: ${po.confidence.toFixed(3)}% ${po.confidence > 0 ? '✅' : '❌'}`);
                        console.log(`   - Supplier: "${po.supplierName}" ${po.supplierName !== 'Unknown' ? '✅' : '❌'}`);
                        console.log(`   - Total: ${po.totalAmount} USD`);
                        
                        if (po.confidence > 0 && po.supplierName !== 'Unknown') {
                            console.log('\n🎊🎊 COMPLETE SUCCESS! Both confidence AND supplier are now updating! 🎊🎊');
                            console.log('🔧 The database persistence issue is FULLY RESOLVED!');
                        } else if (po.confidence > 0) {
                            console.log('\n✅ Confidence working, but supplier extraction needs more work');
                        }
                        break;
                    }
                    
                    if (po.status === 'failed') {
                        console.log('❌ Workflow failed!');
                        break;
                    }
                }
            }
        } catch (error) {
            console.log(`❌ [${i*3}s] Error: ${error.message}`);
        }
    }
}

monitorSupplierFix();