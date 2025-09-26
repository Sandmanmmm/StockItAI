import { workflowOrchestrator } from './src/lib/workflowOrchestrator.js';

console.log('🔍 Checking queue status after test...');

// Wait for the orchestrator to be fully initialized
await new Promise(resolve => setTimeout(resolve, 2000));

console.log('\n📊 Queue Status:');

// Check each queue
const queueNames = ['ai-parsing', 'database-save', 'shopify-sync', 'status-update'];

for (const queueName of queueNames) {
    try {
        const queue = workflowOrchestrator.queues.get(queueName);
        if (queue) {
            const waiting = await queue.getWaiting();
            const active = await queue.getActive();
            const completed = await queue.getCompleted();
            const failed = await queue.getFailed();
            
            console.log(`🔸 ${queueName}: waiting=${waiting.length}, active=${active.length}, completed=${completed.length}, failed=${failed.length}`);
            
            // Show details of completed jobs
            if (completed.length > 0) {
                console.log(`  ✅ Completed jobs in ${queueName}:`);
                completed.forEach(job => {
                    console.log(`    - Job ${job.id}: ${job.returnvalue ? 'SUCCESS' : 'NO RETURN VALUE'}`);
                });
            }
            
            // Show details of failed jobs
            if (failed.length > 0) {
                console.log(`  ❌ Failed jobs in ${queueName}:`);
                failed.forEach(job => {
                    console.log(`    - Job ${job.id}: ${job.failedReason}`);
                });
            }
        }
    } catch (error) {
        console.log(`❌ Error checking ${queueName}:`, error.message);
    }
}

process.exit(0);