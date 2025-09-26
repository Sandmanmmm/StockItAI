/**
 * Test the exact same queue the server is using with correct processor pattern
 */

import Bull from 'bull';

async function testServerQueuesWithFix() {
    console.log('🔍 Testing server queues with correct processor pattern...');
    
    try {
        // Connect to exact same queue as server
        const queue = new Bull('ai-parsing', {
            redis: {
                host: 'localhost',
                port: 6379,
                db: 0
            }
        });
        
        console.log('📡 Connected to ai-parsing queue (same as server)');
        
        // Check current state
        const initialWaiting = await queue.getWaiting();
        console.log(`📊 Initial state: ${initialWaiting.length} waiting jobs`);
        
        if (initialWaiting.length > 0) {
            console.log('🔍 Sample job:', {
                id: initialWaiting[0].id,
                name: initialWaiting[0].name,
                data: initialWaiting[0].data
            });
        }
        
        // Register processor with CORRECT pattern
        console.log('🔧 Registering processor with correct pattern...');
        let jobsProcessed = 0;
        
        const processor = async (job) => {
            jobsProcessed++;
            console.log(`🎯 PROCESSING JOB ${job.id} (${jobsProcessed} total)`);
            console.log(`📋 Job data:`, job.data);
            // Simulate quick processing
            await new Promise(resolve => setTimeout(resolve, 100));
            return { processed: true, timestamp: Date.now() };
        };
        
        // Use concurrency only (no job name) - this should work
        queue.process(2, processor);
        console.log('✅ Processor registered with concurrency 2');
        
        // Monitor for processing
        console.log('⏳ Monitoring for 15 seconds...');
        let lastWaiting = initialWaiting.length;
        
        for (let i = 0; i < 15; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const waiting = await queue.getWaiting();
            const active = await queue.getActive();
            const completed = await queue.getCompleted();
            
            if (waiting.length !== lastWaiting || active.length > 0) {
                console.log(`📊 ${i+1}s: W=${waiting.length} A=${active.length} C=${completed.length} (Processed: ${jobsProcessed})`);
                lastWaiting = waiting.length;
            }
        }
        
        // Final results
        const finalWaiting = await queue.getWaiting();
        const finalActive = await queue.getActive();
        const finalCompleted = await queue.getCompleted();
        
        console.log('\n📈 Final Results:');
        console.log(`📊 Queue state: W=${finalWaiting.length} A=${finalActive.length} C=${finalCompleted.length}`);
        console.log(`🎯 Jobs processed by our processor: ${jobsProcessed}`);
        console.log(`📉 Jobs eliminated from queue: ${initialWaiting.length - finalWaiting.length}`);
        
        if (jobsProcessed > 0) {
            console.log('\n🎉 SUCCESS: Processors work when configured correctly!');
            console.log('💡 The server needs the processor registration fix');
        } else if (finalWaiting.length < initialWaiting.length) {
            console.log('\n🤔 PARTIAL SUCCESS: Jobs disappeared but our processor not called');
            console.log('💡 Another processor might be handling jobs');
        } else {
            console.log('\n❌ NO PROCESSING: Jobs remained in queue');
            console.log('💡 Issue might be deeper than expected');
        }
        
        await queue.close();
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

testServerQueuesWithFix();