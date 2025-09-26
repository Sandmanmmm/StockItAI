import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkRecentPOs() {
  try {
    console.log('📋 Checking recent Purchase Orders...\n');
    
    const recentPOs = await prisma.purchaseOrder.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        number: true,
        status: true,
        jobStatus: true,
        confidence: true,
        totalAmount: true,
        processingNotes: true,
        createdAt: true,
        updatedAt: true,
        fileName: true
      }
    });
    
    if (recentPOs.length === 0) {
      console.log('No purchase orders found.');
      return;
    }
    
    recentPOs.forEach((po, index) => {
      console.log(`${index + 1}. PO: ${po.number || po.id}`);
      console.log(`   ID: ${po.id}`);
      console.log(`   Status: ${po.status}`);
      console.log(`   Job Status: ${po.jobStatus}`);
      console.log(`   Confidence: ${po.confidence ? (po.confidence * 100).toFixed(1) + '%' : 'N/A'}`);
      console.log(`   Total: $${po.totalAmount || 0}`);
      console.log(`   File: ${po.fileName}`);
      console.log(`   Notes: ${po.processingNotes || 'None'}`);
      console.log(`   Created: ${po.createdAt}`);
      console.log(`   Updated: ${po.updatedAt}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error checking POs:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkRecentPOs();