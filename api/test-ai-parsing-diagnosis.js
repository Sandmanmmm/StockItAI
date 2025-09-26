/**
 * Diagnose AI parsing job data issues
 */

import Bull from 'bull';

async function diagnoseAIParsingJobs() {
    console.log('🔍 Diagnosing AI parsing job data...');
    
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
        
        // Get waiting jobs
        const waiting = await queue.getWaiting();
        const completed = await queue.getCompleted();
        const failed = await queue.getFailed();
        
        console.log(`📊 Queue state: ${waiting.length} waiting, ${completed.length} completed, ${failed.length} failed`);
        
        // Analyze waiting jobs
        if (waiting.length > 0) {
            console.log('\n🔍 Analyzing waiting jobs:');
            for (let i = 0; i < Math.min(waiting.length, 3); i++) {
                const job = waiting[i];
                console.log(`\n📋 Job ${job.id}:`);
                console.log(`  - Name: ${job.name}`);
                console.log(`  - Attempts: ${job.attemptsMade}/${job.opts.attempts}`);
                console.log(`  - Data structure:`);
                
                const data = job.data;
                console.log(`    - workflowId: ${data.workflowId}`);
                console.log(`    - stage: ${data.stage}`);
                console.log(`    - data keys:`, Object.keys(data.data || {}));
                
                // Show fileName if available
                if (data.data && data.data.fileName) {
                    console.log(`    - fileName: ${data.data.fileName}`);
                }
                
                // Check for required AI parsing fields
                const requiredFields = ['parsedContent', 'fileName', 'aiSettings'];
                console.log(`  - AI parsing fields check:`);
                for (const field of requiredFields) {
                    const exists = data[field] !== undefined || (data.data && data.data[field] !== undefined);
                    console.log(`    - ${field}: ${exists ? '✅ Present' : '❌ Missing'}`);
                }
                
                // Check nested data
                if (data.data) {
                    console.log(`    - Nested data keys:`, Object.keys(data.data));
                    if (data.data.fileBuffer) {
                        console.log(`    - fileBuffer type:`, typeof data.data.fileBuffer);
                    }
                }
            }
        }
        
        // Analyze failed jobs
        if (failed.length > 0) {
            console.log('\n❌ Analyzing failed jobs:');
            for (let i = 0; i < Math.min(failed.length, 2); i++) {
                const job = failed[i];
                console.log(`\n📋 Failed Job ${job.id}:`);
                console.log(`  - Failed reason:`, job.failedReason);
                console.log(`  - Stack trace:`, job.stacktrace?.[0]);
            }
        }
        
        // Check if enhancedAIService is accessible
        console.log('\n🤖 Checking AI service availability...');
        try {
            const { enhancedAIService } = await import('../src/services/enhancedAIService.js');
            console.log('✅ enhancedAIService imported successfully');
            
            // Try to check if it has parseDocument method
            if (typeof enhancedAIService.parseDocument === 'function') {
                console.log('✅ parseDocument method exists');
            } else {
                console.log('❌ parseDocument method missing');
            }
        } catch (error) {
            console.log('❌ enhancedAIService import failed:', error.message);
        }
        
        await queue.close();
        
    } catch (error) {
        console.error('❌ Diagnostic error:', error);
        process.exit(1);
    }
}

diagnoseAIParsingJobs();