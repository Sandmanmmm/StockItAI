import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkStatus() {
  try {
    console.log('🔍 Checking upload status...');
    const upload = await prisma.upload.findUnique({
      where: { id: 'cmfx9q0td000355046iaobsiv' }
    });
    
    console.log('Upload Status:', upload?.status);
    console.log('Upload Error:', upload?.errorMessage);
    console.log('Workflow ID:', upload?.workflowId);
    
    console.log('\n🔍 Checking purchase order status...');
    const po = await prisma.purchaseOrder.findFirst({
      where: { fileName: 'invoice_3541_250923_204906.pdf' },
      orderBy: { createdAt: 'desc' }
    });
    
    if (po) {
      console.log('PO ID:', po.id);
      console.log('PO Number:', po.number);
      console.log('PO Status:', po.status);
      console.log('Job Status:', po.jobStatus);
      console.log('Job Error:', po.jobError);
      console.log('Supplier:', po.supplierName);
      console.log('Total Amount:', po.totalAmount);
      console.log('Confidence:', po.confidence);
    } else {
      console.log('No purchase order found');
    }
    
    console.log('\n🔍 Checking workflow status...');
    if (upload?.workflowId) {
      const workflow = await prisma.workflow.findUnique({
        where: { id: upload.workflowId }
      });
      
      if (workflow) {
        console.log('Workflow Status:', workflow.status);
        console.log('Current Step:', workflow.currentStep);
        console.log('Steps Completed:', workflow.stepsCompleted);
        console.log('Error Details:', workflow.errorDetails);
      }
    }
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
  }
}

checkStatus();