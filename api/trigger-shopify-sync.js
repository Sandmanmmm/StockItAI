import { workflowOrchestrator } from './src/lib/workflowOrchestrator.js';

async function triggerShopifySync() {
  try {
    const workflowId = process.argv[2];
    if (!workflowId) {
      console.log('Usage: node trigger-shopify-sync.js <WORKFLOW_ID>');
      process.exit(1);
    }
    
    console.log(`🔧 Manually triggering Shopify sync for workflow: ${workflowId}`);
    
    // Get workflow metadata
    const metadata = await workflowOrchestrator.getWorkflowMetadata(workflowId);
    console.log('📋 Current workflow metadata:');
    console.log(JSON.stringify(metadata, null, 2));
    
    if (!metadata) {
      console.log('❌ Workflow not found');
      return;
    }
    
    // Check if database save is completed
    if (metadata.stages?.database_save?.status !== 'completed') {
      console.log('⚠️ Database save stage not completed yet');
      return;
    }
    
    // Manually schedule Shopify sync
    const nextStageData = {
      ...metadata.data,
      workflowId
    };
    
    console.log('🚀 Scheduling Shopify sync stage...');
    await workflowOrchestrator.scheduleNextStage(workflowId, 'shopify_sync', nextStageData);
    
    console.log('✅ Shopify sync scheduled successfully');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

triggerShopifySync();