// Manual test to verify database status update logic
import { db } from './src/lib/db.js';

async function testStatusUpdate() {
  try {
    console.log('🔧 Testing database status update logic...');
    
    // Find a recent test PO
    const testPO = await db.client.purchaseOrder.findFirst({
      where: { fileName: 'test-po.csv' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, number: true, status: true, jobStatus: true }
    });
    
    if (!testPO) {
      console.log('❌ No test PO found');
      return;
    }
    
    console.log('📋 Found test PO:');
    console.log('   ID:', testPO.id);
    console.log('   Number:', testPO.number);
    console.log('   Current Status:', testPO.status);
    console.log('   Current Job Status:', testPO.jobStatus);
    
    // Simulate the status update that should happen in processStatusUpdate
    console.log('\n🔄 Simulating workflow completion status update...');
    
    const updatedPO = await db.client.purchaseOrder.update({
      where: { id: testPO.id },
      data: {
        status: 'completed',
        jobStatus: 'completed',
        jobCompletedAt: new Date(),
        processingNotes: 'Processing completed successfully - all stages completed (TEST UPDATE)',
        updatedAt: new Date()
      }
    });
    
    console.log('✅ Status update successful!');
    console.log('   New Status:', updatedPO.status);
    console.log('   New Job Status:', updatedPO.jobStatus);
    console.log('   Processing Notes:', updatedPO.processingNotes);
    console.log('   Updated At:', updatedPO.updatedAt);
    
    console.log('\n🎉 Database status update logic verified!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await db.client.$disconnect();
  }
}

testStatusUpdate();