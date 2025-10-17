/**
 * Vercel Cron Job: Process Pending Workflows
 * 
 * This cron job runs every minute to process pending workflow executions.
 * It's a reliable alternative to HTTP-triggered background jobs in serverless.
 * 
 * Configured in vercel.json under "crons" section.
 * 
 * CRITICAL FIX 2025-10-12: Uses DIRECT_URL (port 5432) instead of pooler (port 6543)
 * to avoid competing with queue processors during Prisma engine warmup.
 */

import { PrismaClient } from '@prisma/client'
import { processorRegistrationService } from './src/lib/processorRegistrationService.js'

// CRITICAL FIX 2025-10-12: Cron uses dedicated connection pool via DIRECT_URL
// This separates cron traffic from queue processor traffic to prevent cold-start churn
let cronPrisma = null
let cronPrismaInitializing = false

const ENGINE_STARTUP_ERROR_PATTERNS = [
  'Engine is not yet connected',
  'Response from the Engine was empty'
]

const isEngineStartupError = (error) => {
  if (!error) {
    return false
  }

  const message = error.message || error.toString() || ''
  return ENGINE_STARTUP_ERROR_PATTERNS.some((pattern) => message.includes(pattern))
}

async function resetCronPrismaClient() {
  if (cronPrisma) {
    try {
      await cronPrisma.$disconnect()
    } catch (disconnectError) {
      console.warn(`⚠️ [CRON] Failed to disconnect cron Prisma client during reset: ${disconnectError.message}`)
    }
  }

  cronPrisma = null
  return getCronPrismaClient()
}

async function executeWithCronPrisma(prismaInstance, description, operation, attempts = 2) {
  let client = prismaInstance
  let lastError = null

  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (!client) {
      client = await getCronPrismaClient()
    }

    try {
      const result = await operation(client)
      return { result, prisma: client }
    } catch (error) {
      lastError = error

      if (!isEngineStartupError(error) || attempt === attempts) {
        throw error
      }

      console.warn(`⚠️ [CRON] Prisma engine not ready for ${description} (attempt ${attempt}/${attempts}). Resetting client...`)
      client = await resetCronPrismaClient()
    }
  }

  throw lastError
}

async function getCronPrismaClient() {
  if (cronPrisma) {
    return cronPrisma
  }
  
  if (cronPrismaInitializing) {
    // Wait for initialization to complete
    while (cronPrismaInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return cronPrisma
  }
  
  cronPrismaInitializing = true
  
  try {
    console.log(`🔧 [CRON] Creating dedicated Prisma client using DIRECT_URL (port 5432)...`)
    
    // Use DIRECT_URL to bypass pooler and avoid competition with queue processors
    const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL
    
    if (!directUrl) {
      throw new Error('Neither DIRECT_URL nor DATABASE_URL is configured')
    }
    
    console.log(`📊 [CRON] Using direct connection: ${directUrl.includes('5432') ? 'port 5432 (direct)' : 'port 6543 (pooler)'}`)
    
    cronPrisma = new PrismaClient({
      datasources: {
        db: {
          url: directUrl
        }
      },
      log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error']
    })
    
    console.log(`🔌 [CRON] Connecting Prisma client...`)
    await cronPrisma.$connect()
    console.log(`⏳ [CRON] Connection established, warming up query engine...`)
    
    // CRITICAL: Ensure query engine is fully initialized before returning
    // $connect() may return before engine is ready in serverless cold starts
    await cronPrisma.$queryRaw`SELECT 1 as warmup`
    console.log(`✅ [CRON] Prisma client ready and warmed up`)
    
    return cronPrisma
  } finally {
    cronPrismaInitializing = false
  }
}

// Graceful shutdown for cron client
process.on('beforeExit', async () => {
  if (cronPrisma) {
    await cronPrisma.$disconnect()
  }
})

const deriveFileType = (mimeType, fileName) => {
  if (mimeType && mimeType.includes('/')) {
    return mimeType.split('/').pop()
  }

  if (fileName && fileName.includes('.')) {
    return fileName.split('.').pop().toLowerCase()
  }

  return 'unknown'
}

const selectPreferredWorkflow = (current, candidate) => {
  if (!current) return candidate
  if (!candidate) return current

  // Prefer workflows that are still pending over those marked processing
  if (current.status !== candidate.status) {
    if (candidate.status === 'pending') return candidate
    if (current.status === 'pending') return current
  }

  const getTime = (workflow) => {
    const value = workflow?.createdAt
    if (!value) return Number.POSITIVE_INFINITY
    if (value instanceof Date) return value.getTime()
    const timestamp = new Date(value).getTime()
    return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp
  }

  return getTime(candidate) < getTime(current) ? candidate : current
}

const SEQUENTIAL_LOCK_TIMEOUT_MS = 5 * 60 * 1000

const toPlainObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return { ...value }
}

const getSequentialRunnerState = (metadata) => {
  const root = toPlainObject(metadata)
  const runner = toPlainObject(root.sequentialRunner)

  if (!runner.startedAt || !runner.status) {
    return {
      ...runner,
      lockAgeMs: null,
      isActive: false
    }
  }

  const startedAtMs = Date.parse(runner.startedAt)
  const lockAgeMs = Number.isNaN(startedAtMs) ? null : Date.now() - startedAtMs
  const isActive = runner.status === 'running' && lockAgeMs !== null && lockAgeMs < SEQUENTIAL_LOCK_TIMEOUT_MS

  return {
    ...runner,
    lockAgeMs,
    isActive
  }
}

// Track processor initialization state across cron invocations
let processorsInitialized = false
let processorInitializationPromise = null

async function ensureProcessorsInitialized() {
  if (processorsInitialized) {
    return
  }

  if (!processorInitializationPromise) {
    processorInitializationPromise = (async () => {
      console.log(`🚀 Ensuring queue processors are initialized...`)
      
      // CRITICAL FIX 2025-10-12: Defer cron startup to let processors warm up first
      // When cron and processors start simultaneously, they compete for connections
      // during Prisma engine warmup (2.5-2.7s), causing "Engine not yet connected" cascade
      const cronStartupDelayMs = parseInt(process.env.CRON_STARTUP_DELAY_MS || '3000', 10)
      console.log(`⏳ [CRON FIX] Delaying cron startup by ${cronStartupDelayMs}ms to allow processor warmup...`)
      await new Promise(resolve => setTimeout(resolve, cronStartupDelayMs))
      console.log(`✅ [CRON FIX] Warmup delay complete, proceeding with processor initialization`)
      
      await processorRegistrationService.initializeAllProcessors()
      processorsInitialized = true
      console.log(`✅ Queue processors initialized successfully`)
    })()
  } else {
    console.log(`⏳ Queue processor initialization already in progress or completed`)
  }

  try {
    await processorInitializationPromise
  } catch (processorError) {
    console.error(`⚠️ Failed to initialize processors (continuing anyway):`, processorError.message)
    processorsInitialized = false
    processorInitializationPromise = null
  }
}

/**
 * Process a single workflow execution
 */
async function processWorkflow(workflow) {
  const startTime = Date.now()
  console.log(`🚀 ========== PROCESSING WORKFLOW ==========`)
  console.log(`📋 Workflow ID: ${workflow.workflowId}`)
  console.log(`📋 Upload ID: ${workflow.uploadId}`)
  console.log(`📋 Merchant ID: ${workflow.merchantId}`)
  console.log(`📋 PO ID: ${workflow.purchaseOrderId}`)
  console.log(`⏰ Started at: ${new Date().toISOString()}`)

  let workflowId = workflow.workflowId
  let prisma

  try {
    await ensureProcessorsInitialized()

    // CRITICAL FIX 2025-10-12: Use dedicated cron client (DIRECT_URL) instead of shared pooler
    prisma = await getCronPrismaClient()
    
    // Debug: Verify prisma client is available
    if (!prisma) {
      console.error(`❌ FATAL: Cron Prisma client is undefined!`)
      throw new Error('Cron Prisma client not initialized')
    }
    
    console.log(`✅ Cron Prisma client ready for workflow processing`)
    console.log(`🔍 Prisma client type:`, typeof prisma)
    console.log(`🔍 Prisma has $connect:`, typeof prisma.$connect)
    console.log(`🔍 Prisma has workflowExecution:`, typeof prisma.workflowExecution)

    const currentWorkflowRecord = await prisma.workflowExecution.findUnique({
      where: { workflowId },
      select: {
        id: true,
        status: true,
        metadata: true,
        progressPercent: true,
        currentStage: true,
        updatedAt: true
      }
    })

    if (!currentWorkflowRecord) {
      throw new Error(`Workflow execution not found for ID ${workflowId}`)
    }

    const sequentialState = getSequentialRunnerState(currentWorkflowRecord.metadata)

    if (sequentialState.isActive) {
      const lockAgeSeconds = sequentialState.lockAgeMs !== null
        ? Math.round(sequentialState.lockAgeMs / 1000)
        : null
      console.log(
        `⏭️ Sequential runner already active for ${workflowId} (lock ${sequentialState.lockId || 'unknown'}, ${lockAgeSeconds ?? 'unknown'}s old) - skipping re-trigger`
      )
      return {
        success: true,
        workflowId,
        queued: false,
        skipped: true,
        reason: 'sequential_runner_active',
        lockId: sequentialState.lockId || null,
        lockAgeSeconds
      }
    }

    if (sequentialState.status === 'running' && sequentialState.lockAgeMs !== null) {
      console.warn(
        `⚠️ Sequential lock ${sequentialState.lockId || 'unknown'} is stale for ${workflowId} (${Math.round(sequentialState.lockAgeMs / 1000)}s old) - re-triggering`
      )
    }

    // Mark workflow as processing
    await prisma.workflowExecution.update({
      where: { workflowId },
      data: { 
        status: 'processing',
        currentStage: 'ai_parsing',
        progressPercent: 10
      }
    })

    // Get the upload record (minimal data only - don't download file)
    const upload = await prisma.upload.findUnique({
      where: { id: workflow.uploadId },
      select: {
        id: true,
        fileUrl: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        merchantId: true,
        supplierId: true
      }
    })

    if (!upload) {
      throw new Error(`Upload not found: ${workflow.uploadId}`)
    }

  const fileType = deriveFileType(upload.mimeType, upload.fileName)
  console.log(`📦 Queueing file: ${upload.fileName} (${fileType})`)
    console.log(`📥 File URL: ${upload.fileUrl}`)

    // ✅ SEQUENTIAL WORKFLOW: Check global flag OR per-merchant flag
    let useSequentialMode = process.env.SEQUENTIAL_WORKFLOW === '1'
    
    if (!useSequentialMode) {
      // Check per-merchant override
      const merchant = await prisma.merchant.findUnique({
        where: { id: upload.merchantId },
        select: { settings: true, shopDomain: true }
      })
      
      const settings = typeof merchant?.settings === 'object' ? merchant.settings : {}
      useSequentialMode = settings.enableSequentialWorkflow === true
      
      if (useSequentialMode) {
        console.log(`✅ Sequential mode enabled for merchant: ${merchant.shopDomain}`)
      }
    }
    
    if (useSequentialMode) {
      // ✅ NEW: Sequential execution via dedicated endpoint (fire-and-forget)
      console.log(`🚀 Triggering SEQUENTIAL workflow execution...`)
      console.log(`   This will complete ALL 6 stages in ~3-5 minutes`)
      console.log(`   Running in dedicated serverless function to avoid timeout`)
      
      // Trigger dedicated sequential workflow endpoint (fire-and-forget)
      // Use production URL to ensure latest code is running
      const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
      const sequentialEndpoint = productionUrl
        ? `https://${productionUrl}/api/execute-sequential-workflow`
        : 'http://localhost:3001/api/execute-sequential-workflow'
      
      console.log(`📡 Triggering endpoint: ${sequentialEndpoint}`)
      
      // Fire-and-forget HTTP call (don't await)
      fetch(sequentialEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-vercel-internal': 'true',
          'User-Agent': 'Vercel-Cron-Internal'
        },
        body: JSON.stringify({ workflowId })
      }).then(response => {
        if (response.ok) {
          console.log(`✅ Sequential workflow triggered successfully: ${workflowId}`)
        } else {
          console.error(`❌ Failed to trigger sequential workflow: ${response.status}`)
        }
      }).catch(error => {
        console.error(`❌ Error triggering sequential workflow:`, error.message)
      })
      
      console.log(`✅ Sequential workflow trigger sent (processing in background)`)
      console.log(`📋 Workflow ID: ${workflowId}`)
      
    } else {
      // ❌ LEGACY: Queue to Bull (existing code - causes 38-minute delays)
      console.log(`🚀 Scheduling AI parsing job (LEGACY MODE - will take ~38 minutes)...`)
      
      // Queue the AI parsing job - it will handle file download and parsing
      await processorRegistrationService.addJob('ai-parsing', {
        stage: 'ai_parsing',
        workflowId: workflowId,
        data: {
          uploadId: upload.id,
          merchantId: upload.merchantId,
          fileUrl: upload.fileUrl,
          fileName: upload.fileName,
          fileSize: upload.fileSize,
          mimeType: upload.mimeType,
  fileType,
          supplierId: upload.supplierId,
          purchaseOrderId: workflow.purchaseOrderId,
          source: 'cron-processing',
          queuedAt: workflow.createdAt?.toISOString()
        }
      })
      
      console.log(`✅ AI parsing job queued - will download and process file asynchronously`)
      console.log(`📋 Workflow ID: ${workflowId}`)
      console.log(`⏰ File download and processing will happen in background (~30-60 seconds)`)
    }

    // Update upload status to "processing"
    await prisma.upload.update({
      where: { id: workflow.uploadId },
      data: {
        status: 'processing'
      }
    })

    const executionTime = Date.now() - startTime
    console.log(`✅ ========== WORKFLOW QUEUED SUCCESSFULLY ==========`)
    console.log(`⏱️ Cron job execution time: ${executionTime}ms`)
    console.log(`⏰ Workflow will complete asynchronously in ~30-60 seconds`)

    return { success: true, workflowId: workflow.workflowId, executionTime, queued: true }

  } catch (error) {
    console.error(`❌ ========== WORKFLOW PROCESSING ERROR ==========`)
    console.error(`❌ Workflow ID: ${workflow.workflowId}`)
    console.error(`❌ Upload ID: ${workflow.uploadId}`)
    console.error(`❌ Error message: ${error.message}`)
    console.error(`❌ Error stack:`, error.stack)

    // Mark workflow as failed
    try {
      // Use cron client for error updates too
      const prismaClient = prisma ?? (await getCronPrismaClient())
      
      await prismaClient.workflowExecution.update({
        where: { workflowId },
        data: {
          status: 'failed',
          errorMessage: error.message,
          failedStage: 'processing',
          completedAt: new Date()
        }
      })

      // Mark upload as failed
      await prismaClient.upload.update({
        where: { id: workflow.uploadId },
        data: {
          status: 'failed',
          errorMessage: error.message
        }
      })
    } catch (updateError) {
      console.error(`❌ Failed to update workflow/upload status:`, updateError)
    }

    const executionTime = Date.now() - startTime
    console.error(`❌ ========== WORKFLOW FAILED ==========`)
    console.error(`⏱️ Failed after: ${executionTime}ms`)

    return { success: false, workflowId: workflow.workflowId, error: error.message, executionTime }
  }
}


/**
 * Automatically fix stuck POs that have data but are stuck in "processing" status
 * This handles cases where the workflow completed database save but failed before status_update
 */
async function autoFixStuckPOs(prisma) {
  try {
    console.log('🔍 Checking for stuck POs with data...')
    
    // Find POs that are:
    // 1. Still in "processing" status
    // 2. Have line items (data was saved successfully)
    // 3. Last updated >5 minutes ago
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    
    const stuckPOs = await prisma.purchaseOrder.findMany({
      where: {
        status: 'processing',
        updatedAt: {
          lt: fiveMinutesAgo
        }
      },
      include: {
        lineItems: true
      },
      take: 10 // Limit to 10 POs per run
    })
    
    if (stuckPOs.length === 0) {
      console.log('✅ No stuck POs found')
      return { fixed: 0 }
    }
    
    console.log(`📋 Found ${stuckPOs.length} potentially stuck POs`)
    
    let fixedCount = 0
    
    for (const po of stuckPOs) {
      // Only fix if it has line items (data was saved)
      if (po.lineItems && po.lineItems.length > 0) {
        console.log(`🔧 Fixing stuck PO ${po.id}:`)
        console.log(`   Number: ${po.number || 'N/A'}`)
        console.log(`   Line Items: ${po.lineItems.length}`)
        console.log(`   Confidence: ${po.confidence}`)
        console.log(`   Age: ${Math.round((Date.now() - po.updatedAt.getTime()) / 1000)}s`)
        
        try {
          // Determine final status based on confidence
          const finalStatus = (po.confidence && po.confidence >= 0.8) ? 'completed' : 'review_needed'
          
          // CRITICAL FIX: Use $executeRaw with FOR UPDATE SKIP LOCKED to avoid blocking
          // This prevents the update from waiting on locks held by other connections
          const updateResult = await prisma.$executeRaw`
            UPDATE "PurchaseOrder"
            SET 
              "status" = ${finalStatus}::"text",
              "jobStatus" = 'completed',
              "jobCompletedAt" = NOW(),
              "processingNotes" = ${`Auto-recovered from stuck state. ${po.lineItems.length} line items processed. Confidence: ${Math.round((po.confidence || 0) * 100)}%`},
              "updatedAt" = NOW()
            WHERE "id" = ${po.id}
            AND "id" IN (
              SELECT "id" FROM "PurchaseOrder" 
              WHERE "id" = ${po.id}
              FOR UPDATE SKIP LOCKED
            )
          `
          
          if (updateResult === 0) {
            console.log(`⏭️ Skipped PO ${po.id} - locked by another process (will retry next cron run)`)
            continue // Skip to next PO
          }
          
          console.log(`✅ Updated PO ${po.id} status to: ${finalStatus}`)
          
          // Update ALL workflows for this PO (not just the most recent)
          const workflows = await prisma.workflowExecution.findMany({
            where: { 
              purchaseOrderId: po.id,
              status: { in: ['pending', 'processing'] } // Only update active workflows
            }
          })
          
          console.log(`📋 Found ${workflows.length} active workflow(s) to complete for PO ${po.id}`)
          
          for (const workflow of workflows) {
            await prisma.workflowExecution.update({
              where: { id: workflow.id },
              data: {
                status: 'completed',
                currentStage: 'status_update',
                progressPercent: 100,
                stagesCompleted: workflow.stagesTotal || 4,
                completedAt: new Date(),
                updatedAt: new Date(),
                metadata: {
                  ...(workflow.metadata || {}),
                  autoFixApplied: true,
                  autoFixReason: 'PO had data but workflow stuck >5 minutes',
                  autoFixedAt: new Date().toISOString()
                }
              }
            })
            console.log(`   ✅ Completed workflow ${workflow.workflowId} (${workflow.currentStage} -> status_update)`)
          }
          
          console.log(`🎉 Auto-fix complete for PO ${po.id}:`)
          console.log(`   - PO status: ${finalStatus}`)
          console.log(`   - Workflows completed: ${workflows.length}`)
          console.log(`   - Line items: ${po.lineItems.length}`)
          
          fixedCount++
          
        } catch (fixError) {
          console.error(`❌ Failed to fix PO ${po.id}:`, fixError.message)
          console.error(fixError.stack)
        }
      } else {
        console.log(`⏭️ Skipping PO ${po.id} - no line items (workflow may have failed earlier)`)
      }
    }
    
    if (fixedCount > 0) {
      console.log(`🎉 Auto-fixed ${fixedCount} stuck PO(s)`)
    }
    
    return { checked: stuckPOs.length, fixed: fixedCount }
    
  } catch (error) {
    if (isEngineStartupError(error)) {
      throw error
    }
    console.error('❌ Error in autoFixStuckPOs:', error)
    return { checked: 0, fixed: 0, error: error.message }
  }
}

/**
 * Cron handler - processes all pending workflows
 */
export default async function handler(req, res) {
  const cronStartTime = Date.now()
  console.log(`⏰ ========== CRON JOB STARTED ==========`)
  console.log(`⏰ Time: ${new Date().toISOString()}`)

  // Verify this is a legitimate cron request
  // Vercel cron jobs are authenticated at the infrastructure level
  // Additional security: Check for Vercel cron user agent
  const userAgent = req.headers['user-agent'] || ''
  const authHeader = req.headers['authorization']
  
  // Accept requests from Vercel cron system OR with proper authorization
  const isVercelCron = userAgent.includes('vercel-cron')
  const hasValidAuth = authHeader && authHeader.startsWith('Bearer ') && authHeader.includes(process.env.CRON_SECRET || 'vercel-internal')
  
  if (!isVercelCron && !hasValidAuth) {
    console.error(`❌ Unauthorized request - User-Agent: ${userAgent}`)
    return res.status(401).json({ error: 'Unauthorized' })
  }

  console.log(`✅ Authenticated cron request from: ${userAgent}`)

  let prisma

  try {
    console.log(`🧭 Ensuring queue processors are ready before database work...`)
    await ensureProcessorsInitialized()

    // CRITICAL FIX 2025-10-12: Use dedicated cron client on DIRECT_URL
    console.log(`🔧 Initializing dedicated cron database connection...`)
    prisma = await getCronPrismaClient()
    console.log(`✅ Database connected successfully`)

    // CRITICAL: Auto-fix stuck POs before processing new workflows
    // This handles POs that completed database save but got stuck before status_update
    const autoFixExecution = await executeWithCronPrisma(prisma, 'autoFixStuckPOs', autoFixStuckPOs)
    prisma = autoFixExecution.prisma
    const autoFixResult = autoFixExecution.result
    if (autoFixResult.fixed > 0) {
      console.log(`🎯 Auto-fixed ${autoFixResult.fixed} stuck PO(s) in this run`)
    }

    // Find all pending workflows
    const pendingExecution = await executeWithCronPrisma(prisma, 'fetchPendingWorkflows', (client) =>
      client.workflowExecution.findMany({
      where: {
        status: 'pending'
      },
      orderBy: {
        createdAt: 'asc'
      },
      take: 5 // Process up to 5 workflows per cron run to avoid timeout
      })
    )
    prisma = pendingExecution.prisma
    const pendingWorkflows = pendingExecution.result

    // Also find stuck "processing" workflows (processing for more than 5 minutes)
    // CRITICAL: Need to filter out workflows whose PO has completed data
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    const stuckExecution = await executeWithCronPrisma(prisma, 'fetchPotentiallyStuckWorkflows', (client) =>
      client.workflowExecution.findMany({
      where: {
        status: 'processing',
        updatedAt: {
          lt: fiveMinutesAgo
        }
      },
      orderBy: {
        createdAt: 'asc'
      },
      take: 10 // Get more initially since we'll filter
      })
    )
    prisma = stuckExecution.prisma
    const potentiallyStuckWorkflows = stuckExecution.result
    
    // CRITICAL: Filter out workflows whose PO has completed data (auto-fix should handle those)
    // EXCEPTION: Keep sequential workflows even if they have line items (they need to continue through stages 3-6)
    // Need to fetch PO data separately since WorkflowExecution doesn't have purchaseOrder relation
    const stuckWorkflows = []
    for (const workflow of potentiallyStuckWorkflows) {
      if (!workflow.purchaseOrderId) {
        stuckWorkflows.push(workflow)
        continue
      }
      
      // Check if this workflow is using sequential mode
      let isSequential = process.env.SEQUENTIAL_WORKFLOW === '1'
      
      if (!isSequential) {
        // Check per-merchant sequential setting
        const merchantQuery = await prisma.workflowExecution.findUnique({
          where: { workflowId: workflow.workflowId },
          select: {
            upload: {
              select: {
                merchant: {
                  select: { 
                    settings: true,
                    shopDomain: true
                  }
                }
              }
            }
          }
        })
        
        const merchant = merchantQuery?.upload?.merchant
        if (merchant) {
          const settings = typeof merchant.settings === 'object' ? merchant.settings : {}
          isSequential = settings.enableSequentialWorkflow === true
          if (isSequential) {
            console.log(`✅ Stuck workflow ${workflow.workflowId} is sequential mode (${merchant.shopDomain}) - will process`)
          }
        }
      }
      
      // Check if PO has line items
      const po = await prisma.purchaseOrder.findUnique({
        where: { id: workflow.purchaseOrderId },
        select: {
          id: true,
          _count: {
            select: { lineItems: true }
          }
        }
      })
      
      if (!po) {
        // PO doesn't exist, keep workflow for processing
        stuckWorkflows.push(workflow)
        continue
      }
      
      const hasLineItems = po._count.lineItems > 0
      
      if (hasLineItems && !isSequential) {
        // PO has line items BUT not sequential mode - auto-fix will handle it
        console.log(`⏭️ Skipping workflow ${workflow.workflowId} - PO ${po.id} has ${po._count.lineItems} line items (auto-fix will handle)`)
        continue
      }
      
      if (hasLineItems && isSequential) {
        // PO has line items AND sequential mode - keep for processing (needs to continue through remaining stages)
        console.log(`✅ Keeping sequential workflow ${workflow.workflowId} - PO ${po.id} has ${po._count.lineItems} line items (needs to continue through stages 3-6)`)
      }
      
      // PO exists but has no line items, OR has line items but is sequential - workflow needs processing
      stuckWorkflows.push(workflow)
    }
    
    // Take only first 5 stuck workflows to avoid timeout
    const limitedStuckWorkflows = stuckWorkflows.slice(0, 5)

    // Combine and deduplicate workflows
    const allWorkflows = [...pendingWorkflows, ...limitedStuckWorkflows]
    const workflowsByPO = new Map()
    const workflowsWithoutPO = []
    const skippedWorkflows = []

    for (const workflow of allWorkflows) {
      const poId = workflow.purchaseOrderId

      if (!poId) {
        workflowsWithoutPO.push(workflow)
        continue
      }

      if (!workflowsByPO.has(poId)) {
        workflowsByPO.set(poId, workflow)
        continue
      }

      const preferred = selectPreferredWorkflow(workflowsByPO.get(poId), workflow)
      if (preferred === workflowsByPO.get(poId)) {
        skippedWorkflows.push(workflow)
      } else {
        skippedWorkflows.push(workflowsByPO.get(poId))
        workflowsByPO.set(poId, preferred)
      }
    }

    const uniqueWorkflows = [...workflowsWithoutPO, ...workflowsByPO.values()]

    console.log(`📋 Found ${pendingWorkflows.length} pending + ${stuckWorkflows.length} stuck = ${uniqueWorkflows.length} total workflows after PO dedupe`)

    if (skippedWorkflows.length > 0) {
      console.log(
        `🚫 Skipping ${skippedWorkflows.length} duplicate workflow(s) for POs already scheduled in this run:`,
        skippedWorkflows.map(({ workflowId, purchaseOrderId, status }) => ({ workflowId, purchaseOrderId, status }))
      )
    }

    if (uniqueWorkflows.length === 0) {
      console.log(`✅ No pending workflows to process`)
      return res.status(200).json({ 
        success: true, 
        message: 'No pending workflows',
        processed: 0,
        autoFixed: autoFixResult.fixed || 0,
        timestamp: new Date().toISOString()
      })
    }

    // Process workflows sequentially (parallel processing can overwhelm serverless)
    const results = []
    for (const workflow of uniqueWorkflows) {
      console.log(`\n🔄 Processing workflow ${workflow.workflowId}...`)
      const result = await processWorkflow(workflow)
      results.push(result)
      
      // Brief pause between workflows to avoid resource contention
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    const cronExecutionTime = Date.now() - cronStartTime
    const successCount = results.filter(r => r.success).length
    const failureCount = results.filter(r => !r.success).length

    console.log(`✅ ========== CRON JOB COMPLETE ==========`)
    console.log(`📊 Total processed: ${results.length} workflows`)
    console.log(`✅ Successful: ${successCount}`)
    console.log(`❌ Failed: ${failureCount}`)
    if (autoFixResult.fixed > 0) {
      console.log(`🔧 Auto-fixed: ${autoFixResult.fixed} stuck POs`)
    }
    console.log(`⏱️ Total cron execution time: ${cronExecutionTime}ms`)

    res.status(200).json({
      success: true,
      processed: results.length,
      successful: successCount,
      failed: failureCount,
      autoFixed: autoFixResult.fixed || 0,
      results,
      executionTime: cronExecutionTime,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error(`❌ ========== CRON JOB ERROR ==========`)
    console.error(`❌ Error message: ${error.message}`)
    console.error(`❌ Error stack:`, error.stack)

    const cronExecutionTime = Date.now() - cronStartTime
    console.error(`⏱️ Failed after: ${cronExecutionTime}ms`)

    res.status(500).json({
      success: false,
      error: error.message,
      executionTime: cronExecutionTime,
      timestamp: new Date().toISOString()
    })
  } finally {
    // Ensure database connection is properly handled
    if (prisma?.$disconnect) {
      try {
        await prisma.$disconnect()
      } catch (disconnectError) {
        console.warn(`⚠️ Error while disconnecting Prisma client:`, disconnectError.message)
      } finally {
        // Prevent reusing a disconnected Prisma instance on the next cron run
        cronPrisma = null
      }
    }
  }
}
