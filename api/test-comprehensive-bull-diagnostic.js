/**
 * Comprehensive Bull + Redis diagnostic
 */

import Bull from 'bull';
import Redis from 'ioredis';

async function comprehensiveBullDiagnostic() {
    console.log('🔍 Running comprehensive Bull + Redis diagnostic...');
    
    try {
        // Test 1: Basic Redis connection
        console.log('\n🔧 Test 1: Basic Redis connection');
        const redis = new Redis({
            host: 'localhost',
            port: 6379,
            db: 0
        });
        
        await redis.ping();
        console.log('✅ Redis connection successful');
        
        // Test 2: Check Redis info
        const info = await redis.info();
        console.log('📊 Redis info available');
        
        // Test 3: Create Bull queue with Redis connection
        console.log('\n🔧 Test 2: Bull queue creation');
        const queue = new Bull('diagnostic-test', {
            redis: {
                host: 'localhost',
                port: 6379,
                db: 0
            }
        });
        
        console.log('✅ Bull queue created');
        
        // Test 4: Add job and check state
        console.log('\n🔧 Test 3: Job addition and immediate state');
        const job = await queue.add({ test: 'diagnostic', timestamp: Date.now() });
        console.log(`✅ Job ${job.id} added`);
        
        // Check immediate state
        const waiting = await queue.getWaiting();
        console.log(`📊 Immediate waiting jobs: ${waiting.length}`);
        
        // Test 5: Register processor and wait
        console.log('\n🔧 Test 4: Processor registration and execution');
        let processorTriggered = false;
        
        const processor = async (job) => {
            processorTriggered = true;
            console.log(`🎯 PROCESSOR EXECUTED! Job ${job.id}`);
            return { success: true, timestamp: Date.now() };
        };
        
        // Register with concurrency only (no job name)
        queue.process(1, processor);
        console.log('✅ Processor registered with concurrency 1');
        
        // Wait for processing
        console.log('⏳ Waiting 10 seconds for processing...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Check final state
        const finalWaiting = await queue.getWaiting();
        const finalCompleted = await queue.getCompleted();
        const finalActive = await queue.getActive();
        
        console.log('\n📊 Final Results:');
        console.log(`Waiting: ${finalWaiting.length}`);
        console.log(`Active: ${finalActive.length}`);
        console.log(`Completed: ${finalCompleted.length}`);
        console.log(`Processor triggered: ${processorTriggered ? '✅ YES' : '❌ NO'}`);
        
        // Test 6: Bull configuration inspection
        console.log('\n🔧 Test 5: Bull queue internals');
        console.log(`Queue name: ${queue.name}`);
        console.log(`Queue client connected: ${queue.client.status}`);
        
        // Clean up
        await queue.close();
        await redis.disconnect();
        
        if (processorTriggered) {
            console.log('\n🎉 DIAGNOSTIC SUCCESS: Bull system is working correctly');
            console.log('💡 The server issue must be in configuration or timing');
        } else {
            console.log('\n❌ DIAGNOSTIC FAILED: Bull system has fundamental issues');
            console.log('💡 This indicates Node.js/Bull/Redis compatibility problems');
        }
        
    } catch (error) {
        console.error('❌ Diagnostic error:', error);
        process.exit(1);
    }
}

comprehensiveBullDiagnostic();