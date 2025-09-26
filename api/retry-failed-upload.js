import { PrismaClient } from '@prisma/client';
import { workflowIntegration } from './src/lib/workflowIntegration.js';
import { storageService } from './src/lib/storageService.js';

const prisma = new PrismaClient();

async function retryFailedUpload() {
  try {
    const uploadId = 'cmfx9q0td000355046iaobsiv';
    
    console.log('🔄 Fetching failed upload details...');
    const upload = await prisma.upload.findUnique({
      where: { id: uploadId },
      include: { merchant: { select: { id: true, name: true, email: true } } }
    });
    
    if (!upload) {
      console.error('❌ Upload not found');
      return;
    }
    
    console.log('📄 Upload Details:');
    console.log('- ID:', upload.id);
    console.log('- Status:', upload.status);
    console.log('- File:', upload.originalFileName);
    console.log('- Size:', upload.fileSize, 'bytes');
    console.log('- Error:', upload.errorMessage);
    
    if (upload.status !== 'failed' && upload.status !== 'Failed') {
      console.log('✅ Upload is not in failed status, no retry needed. Current status:', upload.status);
      return;
    }
    
    // Download file from Supabase Storage
    if (!upload.fileUrl) {
      console.error('❌ No file URL found for upload');
      return;
    }
    
    console.log('📁 Downloading file from storage:', upload.fileUrl);
    const downloadResult = await storageService.downloadFile(upload.fileUrl);
    
    if (!downloadResult.success) {
      console.error('❌ Failed to download file:', downloadResult.error);
      return;
    }
    
    console.log('🚀 Retrying upload processing...');
    
    // Reset upload status
    await prisma.upload.update({
      where: { id: uploadId },
      data: {
        status: 'Processing',
        errorMessage: null,
        updatedAt: new Date()
      }
    });
    
    // Prepare upload data for retry processing
    const uploadData = {
      uploadId: upload.id,
      fileName: upload.originalFileName,
      mimeType: upload.mimeType,
      fileSize: upload.fileSize,
      buffer: downloadResult.buffer
    };
    
    console.log('📝 Starting workflow processing...');
    await workflowIntegration.processUploadedFile(uploadData);
    
    console.log('✅ Retry completed successfully!');
    
  } catch (error) {
    console.error('❌ Retry failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

retryFailedUpload();