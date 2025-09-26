#!/usr/bin/env node

/**
 * Check Recent Upload Records
 */

import { db } from './src/lib/db.js'

async function checkRecentUploads() {
  console.log('🧪 Checking Recent Upload Records')
  console.log('=' .repeat(40))
  
  try {
    const uploads = await db.client.upload.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5
    })
    
    console.log(`Found ${uploads.length} recent uploads:`)
    uploads.forEach((upload, index) => {
      console.log(`\n${index + 1}. Upload ${upload.id}:`)
      console.log(`   Status: ${upload.status}`)
      console.log(`   FileName: ${upload.fileName}`)
      console.log(`   MimeType: ${upload.mimeType}`)
      console.log(`   WorkflowId: ${upload.workflowId}`)
      console.log(`   ErrorMessage: ${upload.errorMessage}`)
      console.log(`   CreatedAt: ${upload.createdAt}`)
    })
    
  } catch (error) {
    console.log('❌ Failed to check uploads:', error.message)
  } finally {
    await db.client.$disconnect()
  }
}

checkRecentUploads()