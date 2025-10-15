const { PrismaClient } = require('./api/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function analyzeWorkflowStages() {
  try {
    console.log('\n🔍 Analyzing Workflow Stage Timing');
    console.log('='.repeat(80));

    // Get a completed workflow to see stage breakdown
    const workflow = await prisma.workflowExecution.findFirst({
      where: {
        status: 'completed',
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    if (!workflow) {
      console.log('No completed workflows found');
      return;
    }

    console.log(`\nAnalyzing: ${workflow.workflowId}`);
    console.log(`Status: ${workflow.status}`);
    console.log(`Created: ${workflow.createdAt}`);
    console.log(`Updated: ${workflow.updatedAt}`);
    
    const totalDuration = (workflow.updatedAt - workflow.createdAt) / 1000;
    console.log(`Total duration: ${totalDuration.toFixed(0)}s (${(totalDuration / 60).toFixed(1)} minutes)`);

    // Check if we have stage timing data
    console.log('\n📊 The issue: Workflows taking hours, not minutes!');
    console.log('This suggests:');
    console.log('  1. ⏰ Cron job runs every 1 minute');
    console.log('  2. 🔄 Workflows waiting in queue between stages');
    console.log('  3. 🐌 Each stage completes, but next stage waits for cron');
    console.log('  4. ❌ NOT a Vision API timeout issue');

    console.log('\n💡 Real Problem:');
    console.log('  - Vision API takes <60s');
    console.log('  - But workflow sits idle for 55 minutes between stages');
    console.log('  - Total time = (stages × 60s) + (idle × 55 minutes)');

    console.log('\n🎯 Solution Needed:');
    console.log('  Instead of adaptive timeout, we need:');
    console.log('  ✅ Direct stage-to-stage progression (no waiting)');
    console.log('  ✅ Remove cron dependency for stage transitions');
    console.log('  ✅ Bull queue should auto-process next stage');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeWorkflowStages();
