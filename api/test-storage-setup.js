/**
 * Test script to initialize and test Supabase Storage
 */

import { storageService } from './src/lib/storageService.js'
import dotenv from 'dotenv'

dotenv.config()

async function testStorageSetup() {
  console.log('🔧 Testing Supabase Storage Setup...\n')

  // Check if storage service is available
  console.log('1. Checking storage service availability...')
  const isHealthy = await storageService.checkHealth()
  console.log(`   Health status: ${isHealthy ? '✅ Healthy' : '❌ Not available'}`)

  if (!isHealthy) {
    console.log('   ⚠️  Storage service not available. Check your environment variables.')
    return
  }

  // Initialize bucket
  console.log('\n2. Initializing storage bucket...')
  const bucketInitialized = await storageService.initializeBucket()
  console.log(`   Bucket initialization: ${bucketInitialized ? '✅ Success' : '❌ Failed'}`)

  // Test file operations
  if (bucketInitialized) {
    console.log('\n3. Testing file operations...')
    
    // Create a test file buffer (using PDF mime type which is supported)
    const testContent = '%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n>>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000079 00000 n \n0000000173 00000 n \ntrailer\n<<\n/Size 4\n/Root 1 0 R\n>>\nstartxref\n252\n%%EOF'
    const testBuffer = Buffer.from(testContent, 'utf-8')
    
    try {
      // Upload test file
      console.log('   📤 Uploading test file...')
      const uploadResult = await storageService.uploadFile(
        testBuffer,
        'test-po.pdf',
        'test-merchant-123',
        'test-po-456',
        'application/pdf'
      )
      
      if (uploadResult.success) {
        console.log(`   ✅ Upload successful`)
        console.log(`      File path: ${uploadResult.filePath}`)
        console.log(`      File URL: ${uploadResult.fileUrl}`)
        
        // Test download
        console.log('   📥 Testing file download...')
        const downloadResult = await storageService.downloadFile(uploadResult.filePath)
        
        if (downloadResult.success) {
          const downloadedContent = downloadResult.buffer.toString('utf-8')
          console.log(`   ✅ Download successful`)
          console.log(`      File size matches: ${downloadResult.buffer.length === testBuffer.length ? '✅ Yes' : '❌ No'}`)
          
          // Test signed URL generation
          console.log('   🔗 Testing signed URL generation...')
          const urlResult = await storageService.getSignedUrl(uploadResult.filePath, 3600)
          
          if (urlResult.success) {
            console.log(`   ✅ Signed URL generated successfully`)
          } else {
            console.log(`   ❌ Signed URL generation failed: ${urlResult.error}`)
          }
          
          // Clean up test file
          console.log('   🧹 Cleaning up test file...')
          const deleteResult = await storageService.deleteFile(uploadResult.filePath)
          console.log(`   ${deleteResult.success ? '✅ Cleanup successful' : '❌ Cleanup failed'}`)
          
        } else {
          console.log(`   ❌ Download failed: ${downloadResult.error}`)
        }
      } else {
        console.log(`   ❌ Upload failed: ${uploadResult.error}`)
      }
    } catch (error) {
      console.log(`   ❌ Test failed: ${error.message}`)
    }
  }

  console.log('\n🎉 Storage setup test completed!')
}

// Run the test
testStorageSetup().catch(console.error)