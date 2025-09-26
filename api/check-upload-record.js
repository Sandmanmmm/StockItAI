#!/usr/bin/env node

/**
 * Check Upload Record Status
 */

import { db } from './src/lib/db.js'

async function checkUploadRecord() {
  console.log('🧪 Checking Upload Record Status')
  console.log('=' .repeat(40))
  
  try {
    const uploadId = 'cmfx4oihh000355mc5eixi8hn'
    
    const upload = await db.client.upload.findUnique({
      where: { id: uploadId }
    })
    
    if (upload) {
      console.log('✅ Upload record found:')
      console.log('   ID:', upload.id)
      console.log('   Status:', upload.status)
      console.log('   WorkflowId:', upload.workflowId)
      console.log('   ErrorMessage:', upload.errorMessage)
      console.log('   CreatedAt:', upload.createdAt)
      console.log('   UpdatedAt:', upload.updatedAt)
      console.log('   Metadata:', JSON.stringify(upload.metadata, null, 2))
    } else {
      console.log('❌ Upload record not found')
    }
    
  } catch (error) {
    console.log('❌ Failed to check upload record:', error.message)
  } finally {
    await db.client.$disconnect()
  }
}

checkUploadRecord()