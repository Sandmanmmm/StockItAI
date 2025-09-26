import fetch from 'node-fetch';

async function monitorPO() {
    const poId = 'cmfyxipae000155r0zy7qpc48';
    const workflowId = 'workflow_1758775496391_3svior9sk';
    
    console.log(`🎯 Monitoring PO: ${poId}`);
    console.log(`🔄 Workflow ID: ${workflowId}`);
    console.log('👀 Watch the API server window for detailed debug logs...');
    console.log('');
    
    for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
        
        try {
            const poResponse = await fetch(`http://localhost:3005/api/purchase-orders/${poId}`);
            if (poResponse.ok) {
                const poData = await poResponse.json();
                if (poData.success && poData.data) {
                    const po = poData.data;
                    console.log(`📊 [${i*3}s] Status: ${po.status}, Confidence: ${po.confidence}%, Supplier: ${po.supplierName}, Amount: ${po.totalAmount} ${po.currency}`);
                    
                    if (po.status === 'completed' || po.status === 'processed') {
                        console.log('✅ Workflow completed successfully!');
                        console.log('📋 Final PO Details:');
                        console.log(`   - Status: ${po.status}`);
                        console.log(`   - Confidence: ${po.confidence}%`);
                        console.log(`   - Supplier: ${po.supplierName}`);
                        console.log(`   - Total: ${po.totalAmount} ${po.currency}`);
                        console.log(`   - Line Items: ${po._count?.lineItems || 'N/A'}`);
                        if (po.rawData) {
                            console.log(`   - AI Data: Available (${JSON.stringify(po.rawData).length} chars)`);
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
    
    console.log('');
    console.log('🔍 If you see this workflow complete successfully, our database update issue might be fixed!');
    console.log('🔍 If it gets stuck in "processing", check the API server logs for our debug messages.');
}

monitorPO();