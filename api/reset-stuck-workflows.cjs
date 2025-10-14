/**
 * Manually reset specific stuck workflows
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const workflowIds = [
    'wf_1760424728259_cmgq7fhj',
    'wf_1760423605359_cmgq6rf3'
  ];

  console.log('🔧 Manually resetting stuck workflows...\n');

  for (const workflowId of workflowIds) {
    const workflow = await prisma.workflowExecution.findUnique({
      where: { workflowId }
    });

    if (!workflow) {
      console.log(`❌ Workflow ${workflowId} not found`);
      continue;
    }

    console.log(`\n📋 Workflow: ${workflowId}`);
    console.log(`   Status: ${workflow.status}`);
    console.log(`   Stage: ${workflow.currentStage}`);
    console.log(`   PO ID: ${workflow.purchaseOrderId}`);
    
    // Reset to pending
    await prisma.workflowExecution.update({
      where: { workflowId },
      data: {
        status: 'pending',
        currentStage: 'pending',
        errorMessage: 'Reset after being stuck in processing for > 4 hours',
        updatedAt: new Date()
      }
    });

    // Reset PO status
    if (workflow.purchaseOrderId) {
      await prisma.purchaseOrder.update({
        where: { id: workflow.purchaseOrderId },
        data: {
          status: 'pending'
        }
      });
      console.log(`   ✅ Reset workflow and PO to pending`);
    } else {
      console.log(`   ✅ Reset workflow to pending`);
    }
  }

  console.log('\n✅ Done! Cron will pick these up in the next run.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
