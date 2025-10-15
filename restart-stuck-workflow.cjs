const { PrismaClient } = require('./api/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function restartStuckWorkflow() {
  try {
    const workflowId = 'wf_1760455082501_cmgqpi30';
    const poId = 'cmgqpi29t0001l104bpzwjl4k';

    console.log('\n🔧 Restarting stuck workflow:', workflowId);
    console.log('================================================================================');

    // Mark workflow as failed so cron can re-queue it
    await prisma.workflowExecution.update({
      where: { workflowId },
      data: {
        status: 'pending', // Reset to pending so cron picks it up
        currentStage: null,
        progressPercent: 0,
        errorMessage: 'Manually restarted due to stuck ai_parsing stage',
        updatedAt: new Date()
      }
    });

    console.log('✅ Workflow reset to pending');

    // Mark PO as pending
    await prisma.purchaseOrder.update({
      where: { id: poId },
      data: {
        status: 'processing',
        jobStatus: 'pending',
        processingNotes: 'Workflow restarted - stuck in ai_parsing',
        updatedAt: new Date()
      }
    });

    console.log('✅ PO marked for reprocessing');
    console.log('\n🔄 Workflow will be picked up by next cron run (within 1 minute)');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

restartStuckWorkflow();
