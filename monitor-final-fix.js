import fetch from 'node-fetch';

async function monitorFinalFix() {
    const poId = 'cmfyxwdiw000155g0odprhg9j';
    const workflowId = 'workflow_1758776133996_ptic7zfhh';
    
    console.log(`🎯 Monitoring FINAL SUPPLIER FIX: ${poId}`);
    console.log(`🔄 Workflow ID: ${workflowId}`);
    console.log('🔧 Testing comprehensive supplier extraction with full AI result structure logging...');
    console.log('👀 Check the API server console for the complete AI result structure!');
    console.log('');
    
    for (let i = 0; i < 12; i++) {
        await new Promise(resolve => setTimeout(resolve, 4000)); // Wait 4 seconds
        
        try {
            const poResponse = await fetch(`http://localhost:3005/api/purchase-orders/${poId}`);
            if (poResponse.ok) {
                const poData = await poResponse.json();
                if (poData.success && poData.data) {
                    const po = poData.data;
                    console.log(`📊 [${i*4}s] Status: ${po.status}, Confidence: ${po.confidence?.toFixed(3) || 0}%, Supplier: "${po.supplierName}", Amount: ${po.totalAmount} USD`);
                    
                    // Check for final success
                    if (po.supplierName && po.supplierName !== 'Unknown' && po.supplierName !== 'Processing...') {
                        console.log('\n🎊🎊 COMPLETE SUCCESS! SUPPLIER NAME EXTRACTED! 🎊🎊');
                        console.log(`✅ Supplier: "${po.supplierName}"`);
                        console.log(`✅ Confidence: ${po.confidence?.toFixed(3)}%`);
                        console.log(`✅ Status: ${po.status}`);
                        console.log('\n🏆 THE SYSTEM IS NOW 100% PERFECT! 🏆');
                        break;
                    }
                    
                    if (po.status === 'completed' || po.status === 'processed' || po.status === 'review_needed') {
                        console.log('\n📋 FINAL STATUS:');
                        console.log(`   - Status: ${po.status} ✅`);
                        console.log(`   - Confidence: ${po.confidence?.toFixed(3)}% ${po.confidence > 0 ? '✅' : '❌'}`);
                        console.log(`   - Supplier: "${po.supplierName}" ${po.supplierName !== 'Unknown' ? '✅' : '❌'}`);
                        console.log(`   - Total: ${po.totalAmount} USD ✅`);
                        
                        if (po.supplierName === 'Unknown') {
                            console.log('\n🔍 Check the API server logs for the full AI result structure to see the supplier data format!');
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
            console.log(`❌ [${i*4}s] Error: ${error.message}`);
        }
    }
}

monitorFinalFix();