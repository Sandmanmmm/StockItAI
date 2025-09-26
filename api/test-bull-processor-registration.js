/**
 * Test Bull queue processor registration
 */

import Bull from 'bull';

// Same Redis config as server
function getRedisConfig() {
    return {
        connection: {
            host: 'localhost',
            port: 6379,
            db: 0,
            family: 4,
            keepAlive: true,
            connectTimeout: 10000,
            lazyConnect: true,
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3,
            retryConnectOnFailure: true
        }
    };
}

async function testBullProcessorRegistration() {
    console.log('🔍 Testing Bull processor registration directly...');
    
    try {
        const redisConfig = getRedisConfig();
        const connectionOptions = redisConfig.connection;
        
        // Connect to the exact same queue the server uses
        const queue = new Bull('ai-parsing', {
            redis: connectionOptions
        });
        
        console.log('📡 Connected to ai-parsing queue');
        
        // Check current state
        const waiting = await queue.getWaiting();
        const active = await queue.getActive();
        console.log(`📊 Queue state: ${waiting.length} waiting, ${active.length} active`);
        
        if (waiting.length > 0) {
            console.log('🔍 Sample waiting job:', {
                id: waiting[0].id,
                name: waiting[0].name,
                data: waiting[0].data
            });
        }
        
        // Register a test processor
        console.log('🔧 Registering test processor...');
        
        let processorCalled = false;
        const processor = async (job) => {
            processorCalled = true;
            console.log(`⚡ PROCESSOR CALLED! Job ${job.id} data:`, job.data);
            return { success: true, processed: true, timestamp: Date.now() };
        };
        
        // Use default processor registration (no job name)
        queue.process(1, processor);
        console.log('✅ Test processor registered');
        
        // Add a test job
        console.log('➕ Adding test job...');
        const testJob = await queue.add({ 
            test: true, 
            source: 'direct-bull-test',
            timestamp: Date.now() 
        });
        console.log(`📋 Test job ${testJob.id} added`);
        
        // Wait and check if processor was called
        console.log('⏳ Waiting 5 seconds to see if processor triggers...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const finalWaiting = await queue.getWaiting();
        const finalActive = await queue.getActive();
        const finalCompleted = await queue.getCompleted();
        
        console.log(`📊 Final state: ${finalWaiting.length} waiting, ${finalActive.length} active, ${finalCompleted.length} completed`);
        console.log(`🎯 Processor called: ${processorCalled ? '✅ YES' : '❌ NO'}`);
        
        if (processorCalled) {
            console.log('🎉 SUCCESS: Bull processor system is working!');
            console.log('🔍 This means the server processor registration has an issue');
        } else {
            console.log('❌ FAILURE: Bull processor system not working');
            console.log('🔍 This indicates a deeper Bull/Redis issue');
        }
        
        await queue.close();
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

testBullProcessorRegistration();