const { PrismaClient } = require('./api/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function analyzeWorkflowTiming() {
  try {
    console.log('\n🔍 DEEP ANALYSIS: Why Workflows Take 38 Minutes');
    console.log('='.repeat(80));

    // Get the most recent completed workflow
    const workflow = await prisma.workflowExecution.findFirst({
      where: {
        status: { in: ['completed', 'processing'] },
        createdAt: {
          gte: new Date(Date.now() - 2 * 60 * 60 * 1000) // Last 2 hours
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    if (!workflow) {
      console.log('No workflows found');
      return;
    }

    console.log(`\n📋 Analyzing Workflow: ${workflow.workflowId}`);
    console.log(`Status: ${workflow.status}`);
    console.log(`Current Stage: ${workflow.currentStage}`);
    console.log(`Created: ${workflow.createdAt}`);
    console.log(`Last Updated: ${workflow.updatedAt}`);
    
    const totalMinutes = ((workflow.updatedAt - workflow.createdAt) / 1000 / 60).toFixed(1);
    console.log(`Total Duration: ${totalMinutes} minutes`);

    // Check if we have the PO
    if (workflow.purchaseOrderId) {
      const po = await prisma.purchaseOrder.findUnique({
        where: { id: workflow.purchaseOrderId },
        select: {
          number: true,
          status: true,
          jobStatus: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { lineItems: true } }
        }
      });

      if (po) {
        console.log(`\n📦 Purchase Order: ${po.number}`);
        console.log(`PO Status: ${po.status}`);
        console.log(`Job Status: ${po.jobStatus}`);
        console.log(`Line Items: ${po._count.lineItems}`);
      }
    }

    // Now let's trace the workflow execution by looking at database updates
    console.log('\n⏱️ TIMING BREAKDOWN HYPOTHESIS:');
    console.log('='.repeat(80));
    
    console.log('\n🔍 Checking workflow stage progression...');
    
    // Query the workflow execution history to see updates
    const workflowHistory = await prisma.$queryRaw`
      SELECT 
        "workflowId",
        "currentStage",
        "progressPercent",
        "status",
        "createdAt",
        "updatedAt",
        EXTRACT(EPOCH FROM ("updatedAt" - LAG("updatedAt") OVER (ORDER BY "updatedAt"))) as seconds_since_last_update
      FROM "WorkflowExecution"
      WHERE "workflowId" = ${workflow.workflowId}
      ORDER BY "updatedAt" DESC
      LIMIT 1
    `;

    console.log('\n📊 Expected Stages (in order):');
    const expectedStages = [
      'ai_parsing (0-10%)',
      'database_save (10-20%)', 
      'product_draft_creation (20-30%)',
      'image_attachment (30-40%)',
      'shopify_sync (40-60%)',
      'status_update (60-100%)'
    ];
    
    expectedStages.forEach((stage, idx) => {
      console.log(`  ${idx + 1}. ${stage}`);
    });

    console.log('\n🐌 POTENTIAL BOTTLENECKS:');
    console.log('='.repeat(80));

    console.log('\n1️⃣ CRON JOB DELAYS:');
    console.log('   - Cron runs every 1 minute');
    console.log('   - Workflow waits in queue between stages');
    console.log('   - Expected: 6 stages × 1 min = 6 minutes minimum');
    console.log('   - Actual: 38 minutes = 6x slower than expected');

    console.log('\n2️⃣ BULL QUEUE PROCESSING:');
    console.log('   - Each stage should trigger the next immediately');
    console.log('   - scheduleNextStage() should call addJob()');
    console.log('   - Bull workers should auto-process waiting jobs');
    console.log('   - Question: Are workers running in serverless?');

    console.log('\n3️⃣ SERVERLESS COLD STARTS:');
    console.log('   - Vercel function timeout: 300s (5 minutes)');
    console.log('   - Each function invocation starts cold');
    console.log('   - Bull queue workers need persistent connections');
    console.log('   - Question: Are Bull workers running at all?');

    console.log('\n4️⃣ REDIS CONNECTION ISSUES:');
    console.log('   - Bull requires persistent Redis connections');
    console.log('   - Serverless functions disconnect after execution');
    console.log('   - Jobs may be enqueued but never processed');
    console.log('   - Question: Who processes the Bull jobs?');

    console.log('\n🎯 ROOT CAUSE ANALYSIS:');
    console.log('='.repeat(80));

    console.log('\n❓ Key Questions to Answer:');
    console.log('  1. Are Bull queue workers running in Vercel serverless?');
    console.log('  2. Or does cron job manually process each stage?');
    console.log('  3. Why does workflow wait between stages?');
    console.log('  4. Is scheduleNextStage() working correctly?');
    console.log('  5. Are jobs being enqueued but not processed?');

    console.log('\n🔎 Let\'s check the code flow...');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeWorkflowTiming();
