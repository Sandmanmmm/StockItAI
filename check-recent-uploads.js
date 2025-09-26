import { db } from './api/src/lib/db.js';

async function checkRecentUploads() {
    try {
        console.log('🔍 Checking recent uploads to find the broken workflow trigger...');
        
        // Get recent uploads from the last hour
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        
        const uploads = await db.client.upload.findMany({
            where: {
                createdAt: {
                    gte: oneHourAgo
                }
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: 10
        });
        
        console.log(`\n📤 Found ${uploads.length} recent uploads:`);
        
        uploads.forEach((upload, index) => {
            console.log(`\n${index + 1}. Upload ID: ${upload.id}`);
            console.log(`   File: ${upload.originalFileName}`);
            console.log(`   Status: ${upload.status || 'N/A'}`);
            console.log(`   Size: ${upload.fileSize} bytes`);
            console.log(`   Created: ${upload.createdAt}`);
            console.log(`   File URL: ${upload.fileUrl ? 'Available' : 'Missing'}`);
            
            // Check if this upload matches our stuck PO
            if (upload.originalFileName === 'invoice_3541_250923_204906.pdf') {
                console.log('   🎯 THIS IS THE STUCK PO UPLOAD!');
            }
        });
        
        // Check if there are any uploads with PDF files
        const pdfUploads = uploads.filter(u => u.originalFileName?.toLowerCase().endsWith('.pdf'));
        
        if (pdfUploads.length > 0) {
            console.log(`\n📄 Found ${pdfUploads.length} PDF uploads:`);
            pdfUploads.forEach(upload => {
                console.log(`   - ${upload.originalFileName} (${upload.status || 'N/A'})`);
            });
        }
        
        // Look for any uploads that might be missing workflow triggers
        const uploadsWithoutWorkflow = uploads.filter(u => !u.status || u.status === 'uploaded');
        
        if (uploadsWithoutWorkflow.length > 0) {
            console.log(`\n⚠️ Found ${uploadsWithoutWorkflow.length} uploads that may not have triggered workflows:`);
            uploadsWithoutWorkflow.forEach(upload => {
                console.log(`   - ${upload.originalFileName} (Status: ${upload.status || 'None'})`);
            });
        }
        
        console.log('\n🎯 NEXT STEPS:');
        console.log('1. Check if the upload endpoint is properly triggering workflows');
        console.log('2. Verify PDF file processing is working');
        console.log('3. Check Redis/queue system for failed job scheduling');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

checkRecentUploads();