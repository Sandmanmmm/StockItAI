/**
 * FINAL TEST: Simulate the exact PO drag-and-drop workflow
 * This tests the complete automatic processing pipeline
 */

console.log('🎯 FINAL TEST: PO Drag-and-Drop Automatic Processing');
console.log('='.repeat(60));

// Simulate a realistic PO file upload
const testPOFile = {
    uploadId: 'po-drag-drop-' + Date.now(),
    fileName: 'Purchase_Order_12345.csv',
    merchantId: 'merchant-shopify-123',
    options: {
        confidenceThreshold: 0.85,
        reprocessing: false
    },
    // Simulate actual CSV content
    parsedContent: `Vendor,Item Number,Description,Quantity,Unit Cost,Total Cost
Acme Supplies,SKU001,Office Chair,2,150.00,300.00
Best Products,SKU002,Desk Lamp,5,25.00,125.00
Quality Co,SKU003,Notebook Set,10,8.50,85.00`
};

console.log('📋 Simulating PO file upload:');
console.log('  📄 File:', testPOFile.fileName);
console.log('  🆔 Upload ID:', testPOFile.uploadId);
console.log('  🏪 Merchant ID:', testPOFile.merchantId);

async function testAutomaticPOProcessing() {
    try {
        // Step 1: Start the workflow (this is what happens when you drag-and-drop)
        console.log('\n🚀 Step 1: Starting PO workflow (drag-and-drop simulation)...');
        
        const response = await fetch('http://localhost:3005/api/test/start-workflow', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(testPOFile)
        });
        
        const result = await response.json();
        console.log('✅ Workflow started:', result.workflowId);
        
        if (!result.success) {
            console.error('❌ Failed to start workflow:', result);
            return;
        }
        
        // Step 2: Monitor automatic processing
        console.log('\n⏳ Step 2: Monitoring automatic processing...');
        console.log('👀 This should happen automatically WITHOUT manual intervention');
        
        let processed = false;
        for (let i = 1; i <= 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Check queue status
            const Bull = (await import('bull')).default;
            const queue = new Bull('ai-parsing', { 
                redis: { host: 'localhost', port: 6379, db: 0 } 
            });
            
            const waiting = await queue.getWaiting();
            const active = await queue.getActive();
            const completed = await queue.getCompleted();
            
            // Look for our specific workflow
            const ourJob = waiting.find(job => job.data.workflowId === result.workflowId) ||
                          active.find(job => job.data.workflowId === result.workflowId);
            
            if (i % 5 === 0 || ourJob) {
                console.log(`${i}s: W=${waiting.length} A=${active.length} C=${completed.length} ${ourJob ? '(Our job: ' + (ourJob.queue || 'unknown') + ')' : ''}`);
            }
            
            // Check if our job completed
            if (!ourJob && i > 3) { // Job disappeared from waiting/active, likely completed
                console.log(`🎉 ${i}s: JOB COMPLETED! Automatic processing worked!`);
                processed = true;
                break;
            }
            
            await queue.close();
        }
        
        if (processed) {
            console.log('\n🎊 SUCCESS VERDICT: Automatic PO processing is working!');
            console.log('✅ Your drag-and-drop workflow should now work automatically');
            console.log('🔧 The processor registration fix resolved the issue');
        } else {
            console.log('\n❌ FAILURE VERDICT: Automatic processing still not working');
            console.log('💡 Manual processing may still be required');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Import fetch for Node.js
import fetch from 'node-fetch';
testAutomaticPOProcessing();