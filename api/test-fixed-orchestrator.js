import { workflowOrchestrator } from './src/lib/workflowOrchestrator.js';

console.log('🧪 Testing fixed orchestrator with singleton pattern...');

// Test that we're getting the same singleton instance
const orchestrator1 = workflowOrchestrator;
const orchestrator2 = workflowOrchestrator;

console.log('🔍 Singleton test:', orchestrator1 === orchestrator2 ? '✅ SAME INSTANCE' : '❌ DIFFERENT INSTANCES');

// Test adding a job to the ai-parsing queue
const testJob = {
    id: 'test-fix-' + Date.now(),
    rawData: JSON.stringify({
        vendor: 'TEST VENDOR',
        total: '$100.00',
        items: [{ description: 'Test Item', quantity: 1, price: '$100.00' }]
    }),
    fileName: 'test-fix.pdf'
};

console.log('\n📋 Adding test job to ai-parsing queue...');
console.log('Job ID:', testJob.id);

try {
    const job = await workflowOrchestrator.addJobToQueue('ai_parse', testJob);
    console.log('✅ Job added successfully:', job.id);
    
    // Wait a bit to see if processor gets triggered
    console.log('\n⏳ Waiting 10 seconds to see if processor is triggered...');
    console.log('👀 Watch the server console for: "🎯 BULL PROCESSOR TRIGGERED"');
    
    setTimeout(() => {
        console.log('\n🏁 Test completed. Check server console for processor activity.');
        process.exit(0);
    }, 10000);
    
} catch (error) {
    console.error('❌ Error adding job:', error.message);
    process.exit(1);
}