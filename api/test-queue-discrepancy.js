/**
 * Test to investigate discrepancy between queue status endpoint and direct queue inspection
 */

import Bull from 'bull';

const QUEUE_TYPES = ['ai_parse', 'database_save', 'shopify_sync', 'status_update'];

async function testQueueDiscrepancy() {
    console.log('🔍 Investigating queue status discrepancy...');
    
    try {
        // Create direct queue connections
        const queues = {};
        
        for (const queueType of QUEUE_TYPES) {
            queues[queueType] = new Bull(queueType, {
                redis: {
                    host: 'localhost',
                    port: 6379,
                    db: 0
                }
            });
        }
        
        console.log('\n📊 Direct queue inspection:');
        for (const [queueType, queue] of Object.entries(queues)) {
            const waiting = await queue.getWaiting();
            const active = await queue.getActive();
            const completed = await queue.getCompleted();
            const failed = await queue.getFailed();
            
            console.log(`${queueType}: W=${waiting.length} A=${active.length} C=${completed.length} F=${failed.length}`);
            
            // Show first few waiting jobs
            if (waiting.length > 0) {
                console.log(`  First waiting job: ${JSON.stringify(waiting[0].data)}`);
            }
        }
        
        // Compare with REST endpoint
        console.log('\n🌐 REST endpoint check:');
        const response = await fetch('http://localhost:3005/api/test/queue-status');
        const data = await response.json();
        console.log('REST response:', JSON.stringify(data, null, 2));
        
        // Add a test job and monitor both ways
        console.log('\n➕ Adding test job and monitoring both ways...');
        const testResponse = await fetch('http://localhost:3005/api/test/trigger-job?type=ai_parse');
        const testData = await testResponse.json();
        console.log('Test job added:', testData);
        
        // Check immediately via direct queue
        const aiParseQueue = queues['ai_parse'];
        const waitingJobs = await aiParseQueue.getWaiting();
        console.log(`Direct check: ${waitingJobs.length} waiting jobs in ai_parse`);
        
        // Check via REST
        const restResponse = await fetch('http://localhost:3005/api/test/queue-status');
        const restData = await restResponse.json();
        console.log('REST check:', restData.queues);
        
        // Close connections
        for (const queue of Object.values(queues)) {
            await queue.close();
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

testQueueDiscrepancy();