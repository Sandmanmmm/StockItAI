/**
 * Test if we can manually process a job from the queue to debug the processor issue
 */

import { workflowOrchestrator } from './api/src/lib/workflowOrchestrator.js';

async function testManualJobProcessing() {
  try {
    console.log('🧪 Testing manual job processing...');
    
    // Initialize if needed
    if (!workflowOrchestrator.isInitialized) {
      console.log('🚀 Initializing workflow orchestrator...');
      await workflowOrchestrator.initialize();
      console.log('✅ Workflow orchestrator initialized');
    }
    
    // Get the AI parse queue
    const aiParseQueue = workflowOrchestrator.queues.get('ai_parse');
    
    if (!aiParseQueue) {
      console.error('❌ AI parse queue not found');
      return;
    }
    
    // Get waiting jobs
    const waitingJobs = await aiParseQueue.getWaiting();
    console.log(`📋 Found ${waitingJobs.length} waiting jobs`);
    
    if (waitingJobs.length === 0) {
      console.log('ℹ️ No waiting jobs to process');
      return;
    }
    
    // Try to understand why jobs aren't being processed automatically
    console.log('🔍 Checking queue processing status...');
    
    // Check if the queue has processors
    console.log(`📊 Queue details:`);
    console.log(`  - Name: ${aiParseQueue.name}`);
    console.log(`  - Redis connection: ${aiParseQueue.client ? 'connected' : 'disconnected'}`);
    
    // Log first waiting job details
    const firstJob = waitingJobs[0];
    console.log(`🔬 First waiting job:`, {
      id: firstJob.id,
      name: firstJob.name,
      data: firstJob.data,
      opts: firstJob.opts,
      attemptsMade: firstJob.attemptsMade,
      processedOn: firstJob.processedOn,
      delay: firstJob.delay
    });
    
    // Try to check if there are any errors or issues
    const failedJobs = await aiParseQueue.getFailed();
    const activeJobs = await aiParseQueue.getActive();
    
    console.log(`📊 Queue stats: ${waitingJobs.length} waiting, ${activeJobs.length} active, ${failedJobs.length} failed`);
    
    if (failedJobs.length > 0) {
      console.log('❌ Failed jobs found:');
      failedJobs.slice(0, 3).forEach(job => {
        console.log(`  Job ${job.id}: ${job.failedReason}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Manual job processing test failed:', error.message);
    console.error(error.stack);
  }
}

testManualJobProcessing();