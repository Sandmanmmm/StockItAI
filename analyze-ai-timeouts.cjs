const { PrismaClient } = require('./api/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const count = await prisma.workflowExecution.count({
      where: {
        OR: [
          { errorMessage: { contains: 'Vision API timed out' } },
          { failedStage: 'ai_parsing' }
        ]
      }
    });

    console.log(`Total workflows with AI timeouts or failures: ${count}`);

    const recent = await prisma.workflowExecution.findMany({
      where: {
        OR: [
          { errorMessage: { contains: 'Vision API timed out' } },
          { failedStage: 'ai_parsing' }
        ]
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: {
        workflowId: true,
        status: true,
        errorMessage: true,
        failedStage: true,
        updatedAt: true,
        progressPercent: true,
        purchaseOrderId: true
      }
    });

    for (const row of recent) {
      console.log('\n------------------------------');
      console.log(`Workflow: ${row.workflowId}`);
      console.log(`Status: ${row.status}`);
      console.log(`Failed Stage: ${row.failedStage}`);
      console.log(`Progress: ${row.progressPercent}%`);
      console.log(`Updated: ${row.updatedAt}`);
      if (row.errorMessage) {
        console.log(`Error: ${row.errorMessage}`);
      }
      if (row.purchaseOrderId) {
        const po = await prisma.purchaseOrder.findUnique({
          where: { id: row.purchaseOrderId },
          select: {
            number: true,
            status: true,
            jobStatus: true,
            confidence: true
          }
        });
        if (po) {
          console.log(`PO Number: ${po.number}`);
          console.log(`PO Status: ${po.status}`);
          console.log(`PO Job Status: ${po.jobStatus}`);
          console.log(`PO Confidence: ${po.confidence}`);
        }
      }
    }

  } catch (error) {
    console.error('Error analyzing timeouts:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

run();
