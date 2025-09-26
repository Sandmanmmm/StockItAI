import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function debugAIWorkflow() {
  try {
    console.log('🔍 Debugging AI Workflow...\n');
    
    // Check recent uploads
    console.log('📋 Recent Upload Records:');
    const uploads = await prisma.upload.findMany({
      orderBy: { createdAt: 'desc' },
      take: 3,
      include: {
        merchant: {
          select: { name: true }
        },
        supplier: {
          select: { name: true }
        }
      }
    });
    
    uploads.forEach(upload => {
      console.log(`- Upload ID: ${upload.id}`);
      console.log(`  Status: ${upload.status}`);
      console.log(`  File: ${upload.fileName}`);
      console.log(`  Workflow ID: ${upload.workflowId || 'N/A'}`);
      console.log(`  Merchant: ${upload.merchant?.name || 'N/A'}`);
      console.log(`  Created: ${upload.createdAt}`);
      console.log('');
    });
    
    // Check recent POs
    console.log('📦 Recent Purchase Orders:');
    const pos = await prisma.purchaseOrder.findMany({
      orderBy: { createdAt: 'desc' },
      take: 3,
      include: {
        lineItems: true,
        merchant: {
          select: { name: true }
        }
      }
    });
    
    pos.forEach(po => {
      console.log(`- PO: ${po.number}`);
      console.log(`  Status: ${po.status}`);
      console.log(`  Confidence: ${po.confidence}%`);
      console.log(`  Line Items: ${po.lineItems?.length || 0}`);
      console.log(`  Job Status: ${po.jobStatus || 'N/A'}`);
      console.log(`  Analysis Job ID: ${po.analysisJobId || 'N/A'}`);
      console.log(`  File Name: ${po.fileName || 'N/A'}`);
      console.log(`  Merchant: ${po.merchant?.name || 'N/A'}`);
      console.log('');
    });
    
    // Check workflow executions
    console.log('⚙️ Recent Workflow Executions:');
    const workflows = await prisma.workflowExecution.findMany({
      orderBy: { createdAt: 'desc' },
      take: 3
    });
    
    workflows.forEach(wf => {
      console.log(`- Workflow ID: ${wf.workflowId}`);
      console.log(`  Type: ${wf.type}`);
      console.log(`  Status: ${wf.status}`);
      console.log(`  Current Stage: ${wf.currentStage || 'N/A'}`);
      console.log(`  Started: ${wf.startedAt}`);
      console.log(`  Completed: ${wf.completedAt || 'N/A'}`);
      if (wf.errorMessage) {
        console.log(`  Error: ${wf.errorMessage}`);
      }
      console.log('');
    });
    
    await prisma.$disconnect();
    
  } catch (error) {
    console.error('❌ Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

debugAIWorkflow();