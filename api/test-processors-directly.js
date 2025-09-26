/**
 * Test processors directly via workflowOrchestrator
 */

async function testProcessorsDirectly() {
    console.log('🔍 Testing processors directly via workflowOrchestrator...');
    
    try {
        // Test via REST API trigger
        console.log('🌐 Testing via REST API...');
        
        const initialResponse = await fetch('http://localhost:3005/api/test/queue-status');
        const initialData = await initialResponse.json();
        console.log('📊 Initial ai_parse queue:', initialData.queues.ai_parse);
        
        // Add a job via API
        const triggerResponse = await fetch('http://localhost:3005/api/test/trigger-job?type=ai_parse');
        const triggerData = await triggerResponse.json();
        console.log('➕ Trigger response:', triggerData);
        
        // Wait a bit for processing
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const finalResponse = await fetch('http://localhost:3005/api/test/queue-status');
        const finalData = await finalResponse.json();
        console.log('📊 Final ai_parse queue:', finalData.queues.ai_parse);
        
        // Compare
        const initial = initialData.queues.ai_parse;
        const final = finalData.queues.ai_parse;
        
        console.log('\n📈 Comparison:');
        console.log(`Waiting: ${initial.waiting} → ${final.waiting} (${final.waiting - initial.waiting > 0 ? '+' : ''}${final.waiting - initial.waiting})`);
        console.log(`Active: ${initial.active} → ${final.active} (${final.active - initial.active > 0 ? '+' : ''}${final.active - initial.active})`);
        console.log(`Completed: ${initial.completed} → ${final.completed} (${final.completed - initial.completed > 0 ? '+' : ''}${final.completed - initial.completed})`);
        
        if (final.waiting > initial.waiting) {
            console.log('❌ Job was added but not processed - processors not working');
        } else if (final.completed > initial.completed) {
            console.log('✅ Job was processed - processors are working!');
        } else if (final.active > initial.active) {
            console.log('⚡ Job is being processed - processors triggered!');
        } else {
            console.log('🤔 Unclear state - need to investigate');
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

testProcessorsDirectly();