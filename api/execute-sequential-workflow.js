/**
 * Dedicated Serverless Function for Sequential Workflow Execution
 * 
 * This endpoint runs sequential workflows in their own serverless function
 * with a 300-second timeout, triggered via fire-and-forget HTTP from cron/upload.
 * 
 * This prevents the cron job from timing out while waiting for workflow completion.
 */

import { db } from './src/lib/db.js'
import { sequentialWorkflowRunner } from './src/lib/sequentialWorkflowRunner.js'

export default async function handler(req, res) {
  const startTime = Date.now()
  
  console.log(`🚀 ========== SEQUENTIAL WORKFLOW HANDLER ==========`)
  console.log(`⏰ Time: ${new Date().toISOString()}`)
  console.log(`📍 Method: ${req.method}`)
  
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { workflowId } = req.body || {}
  
  if (!workflowId) {
    return res.status(400).json({ error: 'Missing workflowId' })
  }

  console.log(`📋 Workflow ID: ${workflowId}`)
  console.log(`🔓 Sequential workflow endpoint - internal use only`)
  console.log(`📋 Workflow ID: ${workflowId}`)

  try {
    // CRITICAL: Get Prisma client and ensure full warmup before any queries
    console.log(`🔌 Initializing Prisma connection...`)
    const prisma = await db.getClient()
    console.log(`✅ Prisma client obtained - connection ready`)

    // Fetch workflow execution record
    const workflow = await prisma.workflowExecution.findUnique({
      where: { workflowId },
      select: {
        id: true,
        workflowId: true,
        uploadId: true,
        merchantId: true,
        purchaseOrderId: true,
        status: true
      }
    })

    if (!workflow) {
      console.error(`❌ Workflow not found: ${workflowId}`)
      return res.status(404).json({ error: 'Workflow not found' })
    }

    if (workflow.status === 'completed') {
      console.log(`✅ Workflow already completed: ${workflowId}`)
      return res.status(200).json({
        success: true,
        message: 'Workflow already completed',
        workflowId
      })
    }

    // Fetch upload record for file details
    const upload = await prisma.upload.findUnique({
      where: { id: workflow.uploadId },
      select: {
        id: true,
        fileUrl: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        supplierId: true
      }
    })

    if (!upload) {
      throw new Error(`Upload not found: ${workflow.uploadId}`)
    }

    const fileType = deriveFileType(upload.mimeType, upload.fileName)
    
    console.log(`📦 File: ${upload.fileName} (${fileType})`)
    console.log(`📥 File URL: ${upload.fileUrl}`)
    console.log(`🏪 Merchant: ${workflow.merchantId}`)
    console.log(`📋 PO: ${workflow.purchaseOrderId}`)

    // Initialize sequential runner
    console.log(`🚀 Initializing Sequential Workflow Runner...`)
    await sequentialWorkflowRunner.initialize()

    // Prepare workflow data
    const workflowData = {
      uploadId: upload.id,
      merchantId: workflow.merchantId,
      fileUrl: upload.fileUrl,
      fileName: upload.fileName,
      fileSize: upload.fileSize,
      mimeType: upload.mimeType,
      fileType,
      supplierId: upload.supplierId,
      purchaseOrderId: workflow.purchaseOrderId,
      source: 'dedicated-sequential-handler'
    }

    console.log(`🚀 Executing sequential workflow...`)
    const result = await sequentialWorkflowRunner.executeWorkflow(workflowId, workflowData)

    const duration = Date.now() - startTime
    console.log(`✅ Sequential workflow completed in ${Math.round(duration / 1000)}s`)
    console.log(`📋 Workflow ID: ${workflowId}`)
    console.log(`⏰ All stages processed successfully`)
    console.log(`✅ ========== SEQUENTIAL WORKFLOW COMPLETE ==========`)

    return res.status(200).json({
      success: true,
      workflowId,
      duration,
      message: 'Sequential workflow completed successfully'
    })

  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`❌ ========== SEQUENTIAL WORKFLOW ERROR ==========`)
    console.error(`❌ Workflow ID: ${workflowId}`)
    console.error(`❌ Error message: ${error.message}`)
    console.error(`❌ Error stack:`, error.stack)
    console.error(`❌ Duration: ${duration}ms`)

    // Update workflow to failed
    try {
      const prisma = await db.getClient()
      await prisma.workflowExecution.update({
        where: { workflowId },
        data: {
          status: 'failed',
          errorMessage: error.message,
          completedAt: new Date()
        }
      })
    } catch (updateError) {
      console.error(`Failed to update workflow status:`, updateError)
    }

    return res.status(500).json({
      success: false,
      error: error.message,
      workflowId
    })
  }
}

function deriveFileType(mimeType, fileName) {
  if (mimeType && mimeType.includes('/')) {
    return mimeType.split('/').pop()
  }

  if (fileName && fileName.includes('.')) {
    return fileName.split('.').pop().toLowerCase()
  }

  return 'unknown'
}
