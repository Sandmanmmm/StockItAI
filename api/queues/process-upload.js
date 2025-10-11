/**
 * Vercel Serverless Function - Queue Handler for Processing Uploaded PO Files
 * 
 * This is a direct serverless function (not routed through Express) that handles
 * background processing of uploaded purchase order files.
 */

import { db } from '../src/lib/db.js'
import { storageService } from '../src/lib/storageService.js'
import { workflowIntegration } from '../src/lib/workflowIntegration.js'

const deriveFileType = (mimeType, fileName) => {
  if (mimeType && mimeType.includes('/')) {
    return mimeType.split('/').pop()
  }

  if (fileName && fileName.includes('.')) {
    return fileName.split('.').pop().toLowerCase()
  }

  return 'unknown'
}

const rehydrateBuffer = (value) => {
  if (!value) {
    return null
  }

  if (Buffer.isBuffer(value)) {
    return value
  }

  if (value instanceof ArrayBuffer) {
    return Buffer.from(value)
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  }

  if (Array.isArray(value)) {
    return Buffer.from(value)
  }

  if (typeof value === 'object') {
    if (value.type === 'Buffer' && Array.isArray(value.data)) {
      return Buffer.from(value.data)
    }

    if (Array.isArray(value.data)) {
      return Buffer.from(value.data)
    }
  }

  if (typeof value === 'string') {
    try {
      return Buffer.from(value, 'base64')
    } catch (error) {
      return null
    }
  }

  return null
}

export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { uploadId, merchantId } = req.body || {}
  
  console.log(`📦 Queue processing started for upload: ${uploadId}`)
  
  let workflowId = null
  let prisma
  
  try {
    prisma = await db.getClient()

    // Fetch upload record
    const upload = await prisma.upload.findUnique({
      where: { id: uploadId },
      include: {
        merchant: true
      }
    })

    if (!upload) {
      console.error(`❌ Upload not found: ${uploadId}`)
      return res.status(404).json({ error: 'Upload not found' })
    }

  workflowId = upload.workflowId
  const fileType = deriveFileType(upload.mimeType, upload.fileName)
  console.log(`📄 Processing file: ${upload.fileName} (${fileType})`)

    // Update workflow status to processing
    if (workflowId) {
      await prisma.workflowExecution.update({
        where: { workflowId },
        data: {
          status: 'processing',
          currentStage: 'downloading_file',
          progressPercent: 10
        }
      })
    }

    // Download file from Supabase Storage
    console.log(`⬇️ Downloading file from: ${upload.fileUrl}`)
    const downloadResult = await storageService.downloadFile(upload.fileUrl)
    if (!downloadResult.success || !downloadResult.buffer) {
      throw new Error(`Failed to download file from storage: ${downloadResult.error || 'unknown error'}`)
    }

    const fileBuffer = rehydrateBuffer(downloadResult.buffer) || Buffer.from(downloadResult.buffer)

    console.log(`✅ File downloaded successfully: ${fileBuffer.length} bytes`)

    // Update progress
    if (workflowId) {
      await prisma.workflowExecution.update({
        where: { workflowId },
        data: {
          currentStage: 'processing',
          progressPercent: 30
        }
      })
    }

    // Get merchant AI settings
    const aiSettings = await prisma.aISettings.findUnique({
      where: { merchantId }
    })

    if (!aiSettings) {
      throw new Error(`AI settings not found for merchant: ${merchantId}`)
    }

    console.log(`🤖 AI settings loaded for merchant: ${merchantId}`)

    // Update progress
    if (workflowId) {
      await prisma.workflowExecution.update({
        where: { workflowId },
        data: {
          currentStage: 'analyzing',
          progressPercent: 50
        }
      })
    }

    // Process the file through workflow integration
    console.log(`🔄 Starting file processing...`)
    const result = await workflowIntegration.processUploadedFile({
      uploadId: upload.id,
      fileName: upload.fileName,
      originalFileName: upload.originalFileName,
      fileSize: upload.fileSize,
      mimeType: upload.mimeType,
      fileType,
      merchantId: upload.merchantId,
      merchant: upload.merchant,
      supplierId: upload.supplierId,
      buffer: fileBuffer,
      fileBuffer,
      aiSettings
    })

    console.log(`✅ File processing completed successfully`)

    // Update workflow to completed
    if (workflowId) {
      await prisma.workflowExecution.update({
        where: { workflowId },
        data: {
          status: 'completed',
          currentStage: 'completed',
          progressPercent: 100,
          endTime: new Date()
        }
      })
    }

    // Update upload status
    await prisma.upload.update({
      where: { id: uploadId },
      data: {
        status: 'processed',
        processedAt: new Date()
      }
    })

    console.log(`📬 Queue processing completed successfully for upload: ${uploadId}`)

    return res.status(200).json({
      success: true,
      uploadId,
      workflowId,
      result
    })

  } catch (error) {
    console.error(`❌ Queue processing error for upload ${uploadId}:`, error)

    // Update workflow to failed
    if (workflowId) {
      try {
        const prismaClient = prisma ?? (await db.getClient())
        await prismaClient.workflowExecution.update({
          where: { workflowId },
          data: {
            status: 'failed',
            error: error.message,
            endTime: new Date()
          }
        })
      } catch (updateError) {
        console.error(`Failed to update workflow status:`, updateError)
      }
    }

    // Update upload status to failed
    try {
      const prismaClient = prisma ?? (await db.getClient())
      await prismaClient.upload.update({
        where: { id: uploadId },
        data: {
          status: 'failed',
          processedAt: new Date()
        }
      })
    } catch (updateError) {
      console.error(`Failed to update upload status:`, updateError)
    }

    return res.status(500).json({
      success: false,
      error: error.message,
      uploadId,
      workflowId
    })
  }
}
