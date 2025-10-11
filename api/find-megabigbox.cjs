const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    // Search for recent POs with "Mega BigBox"
    const pos = await prisma.purchaseOrder.findMany({
      where: {
        supplierName: { contains: 'Mega BigBox' }
      },
      include: { lineItems: true },
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    
    console.log(`\n📋 Found ${pos.length} POs with "Mega BigBox":\n`);
    
    for (const po of pos) {
      console.log('=====================================');
      console.log('PO Number:', po.number);
      console.log('Status:', po.status);
      console.log('Job Status:', po.jobStatus);
      console.log('Confidence:', po.confidence + '%');
      console.log('Line Items:', po.lineItems?.length || 0);
      console.log('Total:', po.currency, po.totalAmount);
      console.log('Created:', po.createdAt);
      console.log('Updated:', po.updatedAt);
      console.log('Job Completed:', po.jobCompletedAt);
      
      // Check workflow
      const workflow = await prisma.workflowExecution.findFirst({
        where: { purchaseOrderId: po.id },
        orderBy: { createdAt: 'desc' }
      });
      
      if (workflow) {
        console.log('\n🔄 Workflow:');
        console.log('  Stage:', workflow.currentStage);
        console.log('  Status:', workflow.status);
        console.log('  Updated:', workflow.updatedAt);
        console.log('  Completed:', workflow.completedAt);
      }
      console.log('');
    }
    
  } catch (e) {
    console.error('❌', e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
