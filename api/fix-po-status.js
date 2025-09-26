import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixPOStatus() {
  try {
    console.log('🔧 Fixing PO status...');
    
    // Update the PO to match the successful processing
    const updatedPO = await prisma.purchaseOrder.update({
      where: { id: 'cmfx9pzbq000155048gkmwiuw' },
      data: {
        status: 'processing',
        jobStatus: 'processing', 
        jobError: null,
        updatedAt: new Date()
      }
    });
    
    console.log('✅ Updated PO status to:', updatedPO.status);
    console.log('✅ Updated job status to:', updatedPO.jobStatus);
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
  }
}

fixPOStatus();