/**
 * Dedicated Serverless Function for Sequential Workflow Execution
 * 
 * This endpoint runs sequential workflows in their own serverless function
 * with a 300-second timeout, triggered via fire-and-forget HTTP from cron/upload.
 * 
 * This prevents the cron job from timing out while waiting for workflow completion.
 */

import { randomUUID } from 'crypto'

import { db } from './src/lib/db.js'
import { sequentialWorkflowRunner } from './src/lib/sequentialWorkflowRunner.js'

const SEQUENTIAL_LOCK_TIMEOUT_MS = 5 * 60 * 1000

export default async function handler(req, res) {
  const startTime = Date.now()
  let sequentialLockId = null
  let sequentialLockStartedAt = null
  let lockClaimed = false
  
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
        status: true,
        currentStage: true,
        progressPercent: true,
        metadata: true,
        updatedAt: true
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

    const workflowMetadata = toPlainObject(workflow.metadata)
    const existingRunner = toPlainObject(workflowMetadata.sequentialRunner)
    const now = Date.now()
    const existingStartedAtMs = existingRunner.startedAt ? Date.parse(existingRunner.startedAt) : null
    const lockAgeMs = existingStartedAtMs && !Number.isNaN(existingStartedAtMs)
      ? now - existingStartedAtMs
      : null
    const hasActiveSequentialRun = existingRunner.status === 'running' && lockAgeMs !== null && lockAgeMs < SEQUENTIAL_LOCK_TIMEOUT_MS
    const isStaleSequentialLock = hasStaleLock(existingRunner, lockAgeMs)

    if (hasActiveSequentialRun) {
      const lockAgeSeconds = Math.round(lockAgeMs / 1000)
      console.log(`⚠️ Workflow already claimed by sequential runner ${existingRunner.lockId || 'unknown'} (${lockAgeSeconds}s ago)`)
      return res.status(200).json({
        success: true,
        message: 'Workflow already processing',
        workflowId,
        note: 'Active sequential execution detected',
        lockId: existingRunner.lockId || null,
        lockAgeSeconds
      })
    }

    if (workflow.status === 'failed') {
      console.log(`🔄 Workflow previously failed: ${workflowId}`)
      console.log(`   Will retry execution`)
    }

    const lockId = randomUUID()
    const lockStartedAtIso = new Date().toISOString()
    const hostIdentifier = resolveRunnerHost()

    const newSequentialRunnerMetadata = {
      status: 'running',
      lockId,
      startedAt: lockStartedAtIso,
      host: hostIdentifier,
      previousStatus: existingRunner.status || null
    }

    if (isStaleSequentialLock && existingRunner.lockId) {
      newSequentialRunnerMetadata.reclaimedFrom = existingRunner.lockId || null
      newSequentialRunnerMetadata.reclaimedAt = lockStartedAtIso
    }

    const updatedMetadata = {
      ...workflowMetadata,
      sequentialRunner: newSequentialRunnerMetadata
    }

    await prisma.workflowExecution.update({
      where: { workflowId },
      data: {
        metadata: updatedMetadata,
        status: 'processing',
        currentStage: 'ai_parsing',
        progressPercent: Math.max(workflow.progressPercent ?? 0, 10),
        updatedAt: new Date()
      }
    })

    sequentialLockId = lockId
    sequentialLockStartedAt = Date.now()
    lockClaimed = true

    console.log(`🔒 Sequential lock claimed: ${lockId}`)
    if (existingRunner.lockId && isStaleSequentialLock) {
      const staleSeconds = lockAgeMs !== null ? Math.round(lockAgeMs / 1000) : 'unknown'
      console.log(`   Reclaimed stale lock ${existingRunner.lockId} (age ${staleSeconds}s)`)
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
  await sequentialWorkflowRunner.executeWorkflow(workflowId, workflowData)

    const duration = Date.now() - startTime
    console.log(`✅ Sequential workflow completed in ${Math.round(duration / 1000)}s`)
    console.log(`📋 Workflow ID: ${workflowId}`)
    console.log(`⏰ All stages processed successfully`)
    console.log(`✅ ========== SEQUENTIAL WORKFLOW COMPLETE ==========`)

    if (lockClaimed && sequentialLockId) {
      await updateSequentialRunnerMetadata(prisma, workflowId, sequentialLockId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        durationMs: sequentialLockStartedAt ? Date.now() - sequentialLockStartedAt : null
      })
    }

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

      if (lockClaimed && sequentialLockId) {
        await updateSequentialRunnerMetadata(prisma, workflowId, sequentialLockId, {
          status: 'failed',
          failedAt: new Date().toISOString(),
          error: error.message
        })
      }

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

function toPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return { ...value }
}

function hasStaleLock(runnerMetadata, lockAgeMs) {
  if (!runnerMetadata || runnerMetadata.status !== 'running') {
    return false
  }

  if (lockAgeMs === null || lockAgeMs === undefined) {
    return false
  }

  return lockAgeMs >= SEQUENTIAL_LOCK_TIMEOUT_MS
}

function resolveRunnerHost() {
  return process.env.VERCEL_DEPLOYMENT_ID
    || process.env.VERCEL_URL
    || process.env.VERCEL_PROJECT_PRODUCTION_URL
    || process.env.VERCEL_ENV
    || 'local'
}

async function updateSequentialRunnerMetadata(prisma, workflowId, lockId, patch) {
  try {
    const workflow = await prisma.workflowExecution.findUnique({
      where: { workflowId },
      select: { metadata: true }
    })

    if (!workflow) {
      console.warn(`⚠️ Workflow ${workflowId} not found when updating sequential metadata`)
      return
    }

    const metadata = toPlainObject(workflow.metadata)
    const runnerMetadata = toPlainObject(metadata.sequentialRunner)

    if (!runnerMetadata.lockId) {
      console.warn(`⚠️ Sequential metadata missing lockId for workflow ${workflowId}`)
      return
    }

    if (lockId && runnerMetadata.lockId !== lockId) {
      console.warn(`⚠️ Sequential lock mismatch for workflow ${workflowId} (expected ${lockId}, found ${runnerMetadata.lockId})`)
      return
    }

    const sanitizedPatch = Object.fromEntries(
      Object.entries({ ...patch, lastUpdatedAt: new Date().toISOString() })
        .filter(([, value]) => value !== undefined)
    )

    metadata.sequentialRunner = {
      ...runnerMetadata,
      ...sanitizedPatch
    }

    await prisma.workflowExecution.update({
      where: { workflowId },
      data: { metadata }
    })
  } catch (metaError) {
    console.warn(`⚠️ Failed to update sequential runner metadata for ${workflowId}:`, metaError.message)
  }
}
