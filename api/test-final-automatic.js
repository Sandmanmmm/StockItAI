import { workflowOrchestrator } from './src/lib/workflowOrchestrator.js';

console.log('🔥 FINAL TEST: Testing automatic PO processing workflow...');

// Simulate the data that would come from a real PO reprocess
const testPOData = {
    id: 'test-po-' + Date.now(),
    number: 'PO-TEST-AUTO',
    fileName: 'test-automatic-processing.csv',
    rawData: JSON.stringify({
        vendor: 'TEST VENDOR INC',
        poNumber: 'PO-TEST-AUTO',
        date: '2025-09-24',
        total: '$500.00',
        items: [
            { description: 'Test Product 1', quantity: 5, unitPrice: '$50.00', total: '$250.00' },
            { description: 'Test Product 2', quantity: 10, unitPrice: '$25.00', total: '$250.00' }
        ]
    }),
    workflowId: `test_auto_${Date.now()}`,
    reprocessing: true
};

console.log('📦 Test PO Data:', {
    id: testPOData.id,
    number: testPOData.number,
    fileName: testPOData.fileName,
    workflowId: testPOData.workflowId
});

try {
    console.log('\n🚀 Starting workflow orchestrator...');
    
    // Initialize the orchestrator (similar to server startup)
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('\n🎯 Adding job to ai_parse queue...');
    const job = await workflowOrchestrator.addJobToQueue('ai_parse', testPOData);
    
    console.log(`✅ Job added successfully with ID: ${job.id}`);
    console.log('📡 Job data:', {
        queue: job.opts?.queue || 'ai-parsing',
        attempts: job.opts?.attempts || 1,
        delay: job.opts?.delay || 0
    });
    
    console.log('\n⏰ Waiting 15 seconds to monitor queue processing...');
    console.log('👁️  Watch for these messages in the server console:');
    console.log('   🎯 BULL PROCESSOR TRIGGERED: ai_parse');
    console.log('   🔄 Processing AI parsing job...');
    console.log('   ✅ AI parsing completed successfully');
    
    let elapsedTime = 0;
    const checkInterval = setInterval(async () => {
        elapsedTime += 3;
        console.log(`⏳ ${elapsedTime}s elapsed...`);
        
        if (elapsedTime >= 15) {
            clearInterval(checkInterval);
            
            console.log('\n📊 Final Status Check:');
            
            try {
                const queue = workflowOrchestrator.queues.get('ai-parsing');
                if (queue) {
                    const waiting = await queue.getWaiting();
                    const active = await queue.getActive();
                    const completed = await queue.getCompleted();
                    const failed = await queue.getFailed();
                    
                    console.log(`📈 ai-parsing queue: waiting=${waiting.length}, active=${active.length}, completed=${completed.length}, failed=${failed.length}`);
                    
                    if (completed.length > 0) {
                        console.log('🎉 SUCCESS! Job was processed automatically!');
                        console.log('✅ The Bull queue processors are working correctly!');
                    } else if (failed.length > 0) {
                        console.log('⚠️  Job failed - check server console for error details');
                    } else if (active.length > 0) {
                        console.log('🔄 Job is still processing...');
                    } else if (waiting.length > 0) {
                        console.log('❌ Job is still waiting - processors may not be triggered');
                    } else {
                        console.log('🤔 No jobs found - check if job was added correctly');
                    }
                } else {
                    console.log('❌ Could not find ai-parsing queue');
                }
            } catch (error) {
                console.error('❌ Error checking final status:', error.message);
            }
            
            console.log('\n🏁 Test completed. Check server console for detailed processor activity.');
            process.exit(0);
        }
    }, 3000);
    
} catch (error) {
    console.error('❌ Error in test:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
}