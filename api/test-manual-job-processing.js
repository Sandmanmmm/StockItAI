/**
 * Manually test job processing to bypass processor registration issues
 */

import Bull from 'bull';

async function manualJobProcessing() {
    console.log('🔧 Manually testing job processing...');
    
    try {
        // Connect to the ai-parsing queue
        const queue = new Bull('ai-parsing', {
            redis: {
                host: 'localhost',
                port: 6379,
                db: 0
            }
        });
        
        console.log('📡 Connected to ai-parsing queue');
        
        // Get a waiting job
        const waiting = await queue.getWaiting();
        if (waiting.length === 0) {
            console.log('❌ No waiting jobs to test');
            return;
        }
        
        const job = waiting[0];
        console.log(`📋 Testing job ${job.id}`);
        console.log('📊 Job data:', JSON.stringify(job.data, null, 2));
        
        // Try to manually process the job using our fixed logic
        console.log('🔧 Attempting manual processing...');
        
        const { workflowOrchestrator } = await import('./src/lib/workflowOrchestrator.js');
        
        try {
            const result = await workflowOrchestrator.processJob(job, 'ai_parse');
            console.log('✅ Manual processing succeeded:', result);
        } catch (processingError) {
            console.log('❌ Manual processing failed:', processingError.message);
            console.log('📋 Full error:', processingError.stack);
        }
        
        await queue.close();
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        console.error('📋 Full stack:', error.stack);
    }
}

manualJobProcessing();