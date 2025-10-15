const { PrismaClient } = require('./api/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function run(workflowId) {
  try {
    const stages = await prisma.workflowStageExecution.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'asc' }
    });

    if (stages.length === 0) {
      console.log('No stage records found.');
      return;
    }

    console.log(`Stage history for workflow ${workflowId}:`);
    for (const stage of stages) {
      console.log(`- ${stage.stageName}: ${stage.status} (progress ${stage.progress}%)`);
      if (stage.errorMessage) {
        console.log(`  error: ${stage.errorMessage}`);
      }
    }
  } catch (error) {
    console.error('Error querying stages:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

const workflowId = process.argv[2];
if (!workflowId) {
  console.log('Usage: node query-workflow-stages.cjs <workflowId>');
  process.exit(1);
}

run(workflowId);
