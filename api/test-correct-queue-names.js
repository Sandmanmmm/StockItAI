/**
 * Test server processors with CORRECT queue names (with dashes)
 */

import Bull from 'bull';

async function testServerProcessorsCorrect() {
    console.log('🔍 Testing server processor registration with CORRECT queue names...');
    
    try {
        // Connect to the CORRECT queue name (with dash)
        const queue = new Bull('ai-parsing', {
            redis: {
                host: 'localhost',
                port: 6379,
                db: 0
            }
        });
        
        console.log('📡 Connected to ai-parsing queue (correct name)');
        
        // Check processors - this should now show the server's processors!
        console.log('🔧 Registered processors:', Object.keys(queue.handlers || {}));
        console.log('📊 Number of processors:', Object.keys(queue.handlers || {}).length);
        
        // Check queue state
        const waiting = await queue.getWaiting();
        const active = await queue.getActive();
        const completed = await queue.getCompleted();
        
        console.log(`📊 Queue state: waiting=${waiting.length}, active=${active.length}, completed=${completed.length}`);
        console.log(`⏸️ Queue paused: ${queue.isPaused()}`);
        console.log(`📡 Redis connection status: ${queue.client.status}`);
        
        if (Object.keys(queue.handlers || {}).length > 0) {
            console.log('🎉 SUCCESS: Server processors are registered!');
            console.log('💡 The queue name mismatch was the issue!');
            
            // Now test if automatic processing works
            console.log('\n🧪 Adding a test job to see if it gets processed automatically...');
            const job = await queue.add({
                simple: 'test',
                timestamp: Date.now(),
                source: 'correct-queue-name-test'
            });
            
            console.log(`✅ Test job ${job.id} added`);
            console.log('⏳ Monitoring for 10 seconds...');
            
            for (let i = 1; i <= 10; i++) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                const newWaiting = await queue.getWaiting();
                const newActive = await queue.getActive();
                const newCompleted = await queue.getCompleted();
                
                console.log(`${i}s: W=${newWaiting.length} A=${newActive.length} C=${newCompleted.length}`);
                
                if (newCompleted.length > completed.length) {
                    console.log('🎯 JOB PROCESSED! Automatic processing is working!');
                    break;
                }
                
                if (i === 10) {
                    console.log('⚠️ Job not processed in 10 seconds - may need more time');
                }
            }
        } else {
            console.log('❌ Still no processors registered - deeper issue exists');
        }
        
        await queue.close();
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

testServerProcessorsCorrect();