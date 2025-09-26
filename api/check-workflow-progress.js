import Bull from 'bull';

const queue = new Bull('ai-parsing', { 
    redis: { host: 'localhost', port: 6379, db: 0 } 
});

const waiting = await queue.getWaiting();
const active = await queue.getActive();
const completed = await queue.getCompleted();

console.log(`📊 Queue state: waiting=${waiting.length}, active=${active.length}, completed=${completed.length}`);

if (completed.length > 17) {
    console.log('🎉 NEW JOBS COMPLETED!');
    console.log(`✅ Completed jobs: ${completed.length} (was 17 before)`);
} else {
    console.log('⏳ No new completed jobs yet');
}

// Show details of any waiting jobs
if (waiting.length > 0) {
    console.log(`🔍 Waiting jobs: ${waiting.length}`);
    for (let i = 0; i < Math.min(3, waiting.length); i++) {
        const job = waiting[i];
        console.log(`  Job ${job.id}: ${JSON.stringify(job.data.workflowId || 'no-workflow-id')}`);
    }
}

await queue.close();