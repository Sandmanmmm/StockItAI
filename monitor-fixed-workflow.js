import fetch from 'node-fetch';

async function monitorFixedPO() {
    const poId = 'cmfyxngdu000155vkcs36o5jg';
    const workflowId = 'workflow_1758775717714_9qnkkc7bl';
    
    console.log(`🎯 Monitoring FIXED PO: ${poId}`);
    console.log(`🔄 Workflow ID: ${workflowId}`);
    console.log('🔧 Testing our status update fix...');
    console.log('');
    
    for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
        
        try {
            const poResponse = await fetch(`http://localhost:3005/api/purchase-orders/${poId}`);
            if (poResponse.ok) {
                const poData = await poResponse.json();
                if (poData.success && poData.data) {
                    const po = poData.data;
                    console.log(`📊 [${i*3}s] Status: ${po.status}, Confidence: ${po.confidence}%, Supplier: "${po.supplierName}", Amount: ${po.totalAmount} ${po.currency}`);
                    
                    // Check for success indicators
                    if (po.confidence > 0) {
                        console.log('🎉 SUCCESS: Confidence updated! Our fix is working!');
                    }
                    
                    if (po.supplierName !== 'Unknown' && po.supplierName !== 'Processing...') {
                        console.log('🎉 SUCCESS: Supplier name updated! Our fix is working!');
                    }
                    
                    if (po.status === 'completed' || po.status === 'processed') {
                        console.log('✅ Workflow completed successfully!');
                        console.log('📋 Final Results:');
                        console.log(`   - Status: ${po.status} ✅`);
                        console.log(`   - Confidence: ${po.confidence}% ${po.confidence > 0 ? '✅' : '❌'}`);
                        console.log(`   - Supplier: "${po.supplierName}" ${po.supplierName !== 'Unknown' ? '✅' : '❌'}`);
                        console.log(`   - Total: ${po.totalAmount} ${po.currency} ✅`);
                        console.log(`   - Line Items: ${po._count?.lineItems || 'N/A'}`);
                        
                        if (po.confidence > 0 && po.supplierName !== 'Unknown') {
                            console.log('\n🎊 COMPLETE SUCCESS! The database update issue is FIXED! 🎊');
                        } else {
                            console.log('\n⚠️  Partial success - some fields still not updating properly');
                        }
                        break;
                    }
                    
                    if (po.status === 'failed') {
                        console.log('❌ Workflow failed!');
                        if (po.processingNotes) {
                            console.log(`   Error: ${po.processingNotes}`);
                        }
                        break;
                    }
                }
            }
        } catch (error) {
            console.log(`❌ [${i*3}s] Error checking status: ${error.message}`);
        }
    }
    
    console.log('\n📋 Summary:');
    console.log('If confidence and supplier were updated, our fix worked!');
    console.log('If they remain at 0% and "Unknown", we need to investigate further.');
}

monitorFixedPO();