/**
 * Fix stuck workflows by clearing stalled active jobs and resetting workflow state
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Fixing stuck workflows...\n');

  // Find workflows stuck in processing with 0 line items for > 30 minutes
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  
  const stuckWorkflows = await prisma.workflowExecution.findMany({
    where: {
      status: 'processing',
      updatedAt: {
        lt: thirtyMinutesAgo
      }
    }
  });

  console.log(`📋 Found ${stuckWorkflows.length} workflows stuck in processing for > 30 minutes\n`);

  for (const workflow of stuckWorkflows) {
    console.log(`\n🔍 Workflow ${workflow.workflowId}:`);
    console.log(`   PO ID: ${workflow.purchaseOrderId}`);
    console.log(`   Stage: ${workflow.currentStage}`);
    console.log(`   Started: ${workflow.createdAt}`);
    console.log(`   Last Updated: ${workflow.updatedAt}`);

    // Get PO and check line items
    let po = null;
    if (workflow.purchaseOrderId) {
      po = await prisma.purchaseOrder.findUnique({
        where: { id: workflow.purchaseOrderId },
        include: { lineItems: true }
      });
    }

    const lineItemCount = po?.lineItems?.length || 0;
    console.log(`   Line Items: ${lineItemCount}`);

    // If workflow has been stuck with 0 line items, reset it to pending for retry
    if (lineItemCount === 0) {
      console.log(`   ⚠️  No line items found - resetting workflow to pending for retry`);
      
      await prisma.workflowExecution.update({
        where: { id: workflow.id },
        data: {
          status: 'pending',
          currentStage: 'pending',
          errorMessage: null,
          updatedAt: new Date()
        }
      });

      // Also reset the PO status to pending if it's stuck in processing
      if (po && po.status === 'processing') {
        await prisma.purchaseOrder.update({
          where: { id: workflow.purchaseOrderId },
          data: {
            status: 'pending',
            processingStatus: null
          }
        });
      }

      console.log(`   ✅ Reset workflow and PO to pending status`);
    } else {
      console.log(`   ℹ️  Has ${lineItemCount} line items - may be legitimately processing`);
    }
  }

  console.log('\n✅ Done!');
  console.log('💡 The cron job will pick up these pending workflows on its next run (every 5 minutes)');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
