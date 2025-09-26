import { db } from './api/src/lib/db.js';

async function checkStuckPO() {
    try {
        const poNumber = 'PO-1758776230444';
        console.log(`🔍 Investigating stuck PO: ${poNumber}`);
        
        // Find the PO by number
        const po = await db.client.purchaseOrder.findFirst({
            where: { number: poNumber },
            include: {
                lineItems: true
            }
        });
        
        if (!po) {
            console.log('❌ PO not found');
            return;
        }
        
        // Try to find associated upload separately
        let upload = null;
        try {
            upload = await db.client.upload.findFirst({
                where: { 
                    OR: [
                        { purchaseOrderId: po.id },
                        { originalFileName: { contains: po.number } }
                    ]
                }
            });
        } catch (uploadError) {
            console.log('⚠️ Could not query uploads:', uploadError.message);
        }
        
        console.log('\n📊 Stuck PO Analysis:');
        console.log(`ID: ${po.id}`);
        console.log(`Number: ${po.number}`);
        console.log(`Status: ${po.status}`);
        console.log(`Job Status: ${po.jobStatus || 'N/A'}`);
        console.log(`Analysis Job ID: ${po.analysisJobId || 'N/A'}`);
        console.log(`Sync Job ID: ${po.syncJobId || 'N/A'}`);
        console.log(`Created: ${po.createdAt}`);
        console.log(`Updated: ${po.updatedAt}`);
        console.log(`File Name: ${po.fileName || 'N/A'}`);
        console.log(`Upload Associated: ${!!upload}`);
        
        if (upload) {
            console.log('\n📤 Upload Information:');
            console.log(`Upload ID: ${upload.id}`);
            console.log(`Original File Name: ${upload.originalFileName}`);
            console.log(`File URL: ${upload.fileUrl ? 'Available' : 'Missing'}`);
            console.log(`Upload Status: ${upload.status || 'N/A'}`);
            console.log(`Upload Created: ${upload.createdAt}`);
        }
        
        // Check if there are any job errors
        if (po.jobError) {
            console.log('\n❌ Job Error Found:');
            console.log(po.jobError);
        }
        
        // Check processing timeline
        const timeSinceCreation = Date.now() - new Date(po.createdAt).getTime();
        const minutesSinceCreation = Math.floor(timeSinceCreation / (1000 * 60));
        
        console.log('\n⏰ Timeline Analysis:');
        console.log(`Time since creation: ${minutesSinceCreation} minutes`);
        console.log(`Last update: ${new Date(po.updatedAt).toLocaleString()}`);
        
        if (minutesSinceCreation > 5 && po.status === 'processing') {
            console.log('⚠️  WARNING: PO has been in processing state for over 5 minutes');
            console.log('   This suggests workflow was not started or failed to complete');
        }
        
        // Check raw data
        if (po.rawData) {
            console.log('\n📊 Raw Data: Available (workflow completed some processing)');
        } else {
            console.log('\n❌ Raw Data: Missing (workflow never completed AI parsing)');
        }
        
        console.log('\n🎯 DIAGNOSIS:');
        if (!upload) {
            console.log('❌ No associated upload found - PO was created manually or upload link is broken');
            console.log('   This means workflow was never triggered automatically');
        } else if (!po.analysisJobId && !po.syncJobId) {
            console.log('❌ No job IDs - Workflow was never initiated after upload');
        } else if (po.rawData) {
            console.log('✅ Workflow completed processing but status update failed');
        } else {
            console.log('⚠️  Workflow initiated but failed during processing');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

checkStuckPO();