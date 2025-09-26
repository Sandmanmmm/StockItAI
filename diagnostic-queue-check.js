/**
 * Comprehensive queue status check
 */

import { workflowOrchestrator } from './api/src/lib/workflowOrchestrator.js';

async function diagnosticQueueCheck() {
  try {
    console.log('🔬 Comprehensive Queue Diagnostic...');
    
    // Initialize if needed
    if (!workflowOrchestrator.isInitialized) {
      console.log('🚀 Initializing workflow orchestrator...');
      await workflowOrchestrator.initialize();
      console.log('✅ Workflow orchestrator initialized');
    }
    
    // Get all queues
    const queueNames = ['ai_parse', 'database_save', 'shopify_sync', 'status_update'];
    
    console.log('\n📊 Queue Status Report:');
    console.log('========================');
    
    for (const queueName of queueNames) {
      const queue = workflowOrchestrator.queues.get(queueName);
      
      if (!queue) {
        console.log(`❌ Queue ${queueName}: NOT FOUND`);
        continue;
      }
      
      try {
        const waiting = await queue.getWaiting();
        const active = await queue.getActive();
        const completed = await queue.getCompleted();
        const failed = await queue.getFailed();
        const delayed = await queue.getDelayed();
        
        console.log(`\n📋 Queue: ${queueName}`);
        console.log(`   Waiting: ${waiting.length}`);
        console.log(`   Active: ${active.length}`);
        console.log(`   Completed: ${completed.length}`);
        console.log(`   Failed: ${failed.length}`);
        console.log(`   Delayed: ${delayed.length}`);
        
        // Show first few waiting jobs
        if (waiting.length > 0) {
          console.log(`   📄 Sample waiting jobs:`);
          waiting.slice(0, 3).forEach(job => {
            console.log(`      Job ${job.id}: ${job.data?.workflowId || 'no workflow'} (attempts: ${job.attemptsMade})`);
          });
        }
        
        // Show active jobs
        if (active.length > 0) {
          console.log(`   ⚡ Active jobs:`);
          active.forEach(job => {
            console.log(`      Job ${job.id}: ${job.data?.workflowId || 'no workflow'} (processing since: ${job.processedOn})`);
          });
        }
        
      } catch (error) {
        console.log(`❌ Queue ${queueName}: Error getting status - ${error.message}`);
      }
    }
    
    console.log('\n🔍 Orchestrator Stats:');
    const stats = workflowOrchestrator.getStats();
    console.log(JSON.stringify(stats, null, 2));
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error.message);
    console.error(error.stack);
  }
}

diagnosticQueueCheck();