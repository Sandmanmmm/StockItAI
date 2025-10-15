import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkWorkflow() {
  try {
    const workflowId = 'wf_1760541312451_cmgs4uah';
    
    console.log(`\n🔍 Checking workflow: ${workflowId}\n`);
    
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      include: {
        upload: {
          include: {
            purchaseOrder: true
          }
        }
      }
    });
    
    if (!workflow) {
      console.log('❌ Workflow not found');
      return;
    }
    
    console.log('📊 Workflow Status:');
    console.log(`   Status: ${workflow.status}`);
    console.log(`   Progress: ${workflow.progress}%`);
    console.log(`   Current Stage: ${workflow.currentStage || 'N/A'}`);
    console.log(`   Created: ${workflow.createdAt}`);
    console.log(`   Updated: ${workflow.updatedAt}`);
    console.log(`   Completed: ${workflow.completedAt || 'Not completed'}`);
    
    if (workflow.error) {
      console.log(`\n❌ Error: ${workflow.error}`);
    }
    
    // Calculate duration
    const start = new Date(workflow.createdAt);
    const end = workflow.completedAt ? new Date(workflow.completedAt) : new Date();
    const durationMs = end - start;
    const durationSec = Math.floor(durationMs / 1000);
    const durationMin = Math.floor(durationSec / 60);
    const remainingSec = durationSec % 60;
    
    console.log(`\n⏱️  Duration: ${durationMin}m ${remainingSec}s`);
    
    if (workflow.upload?.purchaseOrder) {
      const po = workflow.upload.purchaseOrder;
      console.log(`\n📦 PO Details:`);
      console.log(`   PO ID: ${po.id}`);
      console.log(`   PO Number: ${po.number || 'N/A'}`);
      console.log(`   Status: ${po.status}`);
      console.log(`   Created: ${po.createdAt}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkWorkflow();
