// Fix upload status for processed POs
import { db } from './api/src/lib/db.js';

async function fixUploadStatus() {
  try {
    const uploads = await db.upload.findMany({
      where: { 
        status: 'processing',
        workflowId: { not: null }
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    console.log('📋 Processing uploads that need status update:');
    
    for (const upload of uploads) {
      console.log(`- ${upload.id}: ${upload.fileName} (${upload.workflowId})`);
      
      // Update to completed status
      await db.upload.update({
        where: { id: upload.id },
        data: { 
          status: 'completed',
          updatedAt: new Date()
        }
      });
      console.log(`  ✅ Updated to completed`);
    }

    await db.$disconnect();
    console.log('\n✅ Status updates complete!');
  } catch (error) {
    console.error('❌ Error updating status:', error);
    await db.$disconnect();
  }
}

fixUploadStatus();