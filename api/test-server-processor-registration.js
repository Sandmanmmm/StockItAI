/**
 * Test to verify if server processors are actually registered and working
 */

import Bull from 'bull';

async function testServerProcessorRegistration() {
    console.log('🔍 Testing server processor registration...');
    
    try {
        // Connect to the exact same queue as server
        const queue = new Bull('ai-parsing', {
            redis: {
                host: 'localhost',
                port: 6379,
                db: 0
            }
        });
        
        console.log('📡 Connected to ai-parsing queue');
        
        // Check if the queue has any processors registered
        const processors = queue.handlers;
        console.log('🔧 Registered processors:', Object.keys(processors || {}));
        console.log('📊 Number of processors:', Object.keys(processors || {}).length);
        
        // Check queue settings
        console.log('⚙️ Queue settings:', {
            name: queue.name,
            concurrency: queue.concurrency
        });
        
        // Get current queue state
        const waiting = await queue.getWaiting();
        const active = await queue.getActive();
        const completed = await queue.getCompleted();
        const failed = await queue.getFailed();
        
        console.log('📊 Queue state:', {
            waiting: waiting.length,
            active: active.length, 
            completed: completed.length,
            failed: failed.length
        });
        
        // Check if queue is paused
        const isPaused = await queue.isPaused();
        console.log('⏸️ Queue paused:', isPaused);
        
        // Check Redis connection
        const redisStatus = queue.client.status;
        console.log('📡 Redis connection status:', redisStatus);
        
        // Try adding a simple test job and see if it gets picked up
        console.log('\n🧪 Adding a simple test job...');
        const testJob = await queue.add({ 
            simple: 'test',
            timestamp: Date.now(),
            source: 'processor-registration-test'
        });
        console.log(`✅ Test job ${testJob.id} added`);
        
        // Monitor for 10 seconds
        console.log('⏳ Monitoring for 10 seconds...');
        for (let i = 0; i < 10; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const currentWaiting = await queue.getWaiting();
            const currentActive = await queue.getActive();
            const currentCompleted = await queue.getCompleted();
            
            console.log(`${i+1}s: W=${currentWaiting.length} A=${currentActive.length} C=${currentCompleted.length}`);
            
            // If job disappears from waiting, check if it went to active or completed
            if (currentWaiting.length < waiting.length + 1) {
                console.log('🎯 Job picked up from waiting queue!');
                break;
            }
        }
        
        // Final state
        const finalWaiting = await queue.getWaiting();
        const finalActive = await queue.getActive();
        const finalCompleted = await queue.getCompleted();
        
        console.log('\n📈 Final results:');
        console.log(`Waiting: ${waiting.length} → ${finalWaiting.length}`);
        console.log(`Active: ${active.length} → ${finalActive.length}`);
        console.log(`Completed: ${completed.length} → ${finalCompleted.length}`);
        
        if (finalWaiting.length < waiting.length + 1) {
            console.log('✅ Processors are working - job was picked up');
        } else {
            console.log('❌ Processors not working - job still waiting');
        }
        
        await queue.close();
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

testServerProcessorRegistration();