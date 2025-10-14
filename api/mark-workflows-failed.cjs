/**
 * Mark workflows as failed to stop infinite retry loop
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const workflowIds = [
    'wf_1760424728259_cmgq7fhj',
    'wf_1760423605359_cmgq6rf3'
  ];

  console.log('🛑 Marking workflows as failed to stop retry loop...\n');

  for (const workflowId of workflowIds) {
    const workflow = await prisma.workflowExecution.findUnique({
      where: { workflowId }
    });

    if (!workflow) {
      console.log(`❌ Workflow ${workflowId} not found`);
      continue;
    }

    console.log(`📋 Workflow: ${workflowId}`);
    console.log(`   Current Status: ${workflow.status}`);
    console.log(`   PO ID: ${workflow.purchaseOrderId}`);
    
    // Mark workflow as failed
    await prisma.workflowExecution.update({
      where: { workflowId },
      data: {
        status: 'failed',
        currentStage: 'failed',
        failedStage: workflow.currentStage || 'ai_parsing',
        errorMessage: 'AI parsing failed: Unable to extract valid PO data from file. File may be in wrong format or not a purchase order.',
        completedAt: new Date()
      }
    });

    // Mark PO as failed (with processingNotes instead of processingStatus)
    if (workflow.purchaseOrderId) {
      await prisma.purchaseOrder.update({
        where: { id: workflow.purchaseOrderId },
        data: {
          status: 'failed',
          processingNotes: 'AI parsing failed: Unable to extract valid PO data. Please check file format and try again.'
        }
      });
      console.log(`   ✅ Marked workflow and PO as failed`);
    } else {
      console.log(`   ✅ Marked workflow as failed`);
    }
  }

  console.log('\n✅ Done! These workflows will no longer retry automatically.');
  console.log('💡 Users can manually re-upload the files if needed.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
