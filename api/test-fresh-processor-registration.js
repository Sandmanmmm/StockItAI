/**
 * Force fresh processor registration test
 */

import Bull from 'bull';

async function testFreshProcessorRegistration() {
    console.log('🔧 Testing fresh processor registration...');
    
    try {
        // Create fresh queue instance with same config as server
        const queue = new Bull('ai-parsing', {
            redis: {
                host: 'localhost',
                port: 6379,
                db: 0
            }
        });
        
        console.log('📡 Connected to ai-parsing queue');
        console.log('🔍 Initial processors:', Object.keys(queue.handlers || {}));
        
        // Register a test processor using the correct pattern
        console.log('🔧 Registering test processor...');
        
        let jobsProcessed = 0;
        const processor = async (job) => {
            jobsProcessed++;
            console.log(`🎯 PROCESSOR TRIGGERED! Job ${job.id} (${jobsProcessed} total)`);
            console.log(`📋 Job data:`, job.data);
            
            // Simple processing
            await new Promise(resolve => setTimeout(resolve, 100));
            return { processed: true, timestamp: Date.now() };
        };
        
        // Use correct pattern: concurrency only, no job name
        queue.process(2, processor);
        console.log('✅ Processor registered with concurrency 2');
        console.log('🔍 Processors after registration:', Object.keys(queue.handlers || {}));
        
        // Check current queue state
        const initialWaiting = await queue.getWaiting();
        console.log(`📊 Initial waiting jobs: ${initialWaiting.length}`);
        
        if (initialWaiting.length > 0) {
            console.log('⏳ Monitoring existing jobs for processing...');
            
            let processed = false;
            for (let i = 0; i < 15; i++) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                const waiting = await queue.getWaiting();
                const active = await queue.getActive();
                const completed = await queue.getCompleted();
                
                if (waiting.length < initialWaiting.length || active.length > 0 || jobsProcessed > 0) {
                    console.log(`🎯 ${i+1}s: Processing detected! W=${waiting.length} A=${active.length} C=${completed.length} Processed=${jobsProcessed}`);
                    processed = true;
                    break;
                }
                
                if (i % 3 === 0) {
                    console.log(`${i+1}s: W=${waiting.length} A=${active.length} C=${completed.length}`);
                }
            }
            
            if (processed) {
                console.log('🎉 SUCCESS: Fresh processor registration works!');
                console.log('💡 The server processor registration is the issue');
            } else {
                console.log('❌ FAILURE: Even fresh registration doesn\'t work');
                console.log('💡 Deeper Bull/Redis issue exists');
            }
        } else {
            console.log('ℹ️ No waiting jobs to test');
        }
        
        await queue.close();
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

testFreshProcessorRegistration();