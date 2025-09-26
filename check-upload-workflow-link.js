import { db } from './api/src/lib/db.js';

async function checkUploadWorkflowLink() {
    try {
        const uploadId = 'cmfyxyheo000p55g0ypx32tqi'; // The stuck PDF upload
        console.log(`🔍 Investigating upload: ${uploadId}`);
        
        const upload = await db.client.upload.findUnique({
            where: { id: uploadId }
        });
        
        if (!upload) {
            console.log('❌ Upload not found');
            return;
        }
        
        console.log('\n📤 Upload Details:');
        console.log(`File: ${upload.originalFileName}`);
        console.log(`Status: ${upload.status}`);
        console.log(`Workflow ID: ${upload.workflowId || 'MISSING!'}`);
        console.log(`Error Message: ${upload.errorMessage || 'None'}`);
        console.log(`Metadata: ${upload.metadata ? JSON.stringify(upload.metadata) : 'None'}`);
        
        console.log('\n🎯 DIAGNOSIS:');
        if (!upload.workflowId) {
            console.log('❌ CRITICAL: No workflowId assigned to upload!');
            console.log('   This means the upload endpoint failed to start the workflow');
            console.log('   The workflow orchestrator was never called');
        } else {
            console.log(`✅ Workflow ID present: ${upload.workflowId}`);
            console.log('   Need to check why workflow is not progressing');
        }
        
        if (upload.errorMessage) {
            console.log(`❌ Error found: ${upload.errorMessage}`);
        }
        
        // Check if this is a PDF processing issue
        if (upload.originalFileName.toLowerCase().endsWith('.pdf')) {
            console.log('\n📄 PDF File Analysis:');
            console.log('   This is a PDF file - need to check PDF processing capabilities');
            console.log('   The workflow might not support PDF files yet');
        }
        
        console.log('\n🔧 RECOMMENDED FIXES:');
        console.log('1. Check upload endpoint workflow triggering logic');
        console.log('2. Verify PDF file support in AI parsing');
        console.log('3. Check Redis queue for failed job scheduling');
        console.log('4. Review workflow orchestrator initialization');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

checkUploadWorkflowLink();