#!/usr/bin/env node
// Lightweight re-run helper: invokes WorkflowOrchestrator.processAIParsing()
// Usage:
//   node api/src/scripts/reprocessPo.js --uploadId <uploadId> --fileName <fileName> [--merchantId <merchantId>] [--purchaseOrderId <poId>]
// Example (PowerShell):
//   $env:DEBUG_CHUNK_LINE_ITEMS = 'true'; $env:SEQUENTIAL_WORKFLOW = '1'; node .\\api\\src\\scripts\\reprocessPo.js --uploadId cmgv2ogaz0001ji04slenuti7 --fileName invoice_3541_250923_204906.pdf

import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ⚠️ CRITICAL: Set REDIS_URL directly BEFORE importing WorkflowOrchestrator
// This must happen before any module that calls dotenv.config() loads
// Hardcoded from .env.production.vercel to avoid dotenv loading issues
process.env.REDIS_URL = "rediss://default:AUuiAAIncDJmMGE0NThlZGM1MTc0ZDczYmRlYmFkYjVlNDMxY2I0ZHAyMTkzNjI@enormous-burro-19362.upstash.io:6379"

// Also ensure DATABASE_URLs are set
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:v2uGCTx7xIDTAB5o@po-sync-db-pooler.flycast:5432/po_sync_db?sslmode=disable&pgbouncer=true&connection_limit=5&connect_timeout=10&pool_timeout=10&statement_timeout=180000"
process.env.DIRECT_URL = process.env.DIRECT_URL || "postgresql://postgres:v2uGCTx7xIDTAB5o@po-sync-db.flycast:5432/po_sync_db?sslmode=disable"

console.log('🔧 Upstash Redis URL set directly in script')
console.log('   - REDIS_URL:', process.env.REDIS_URL.substring(0, 30) + '...')

// ⚠️ CRITICAL: Use dynamic import to load WorkflowOrchestrator AFTER setting env vars
// Static imports are hoisted and run before our process.env assignments!
const { WorkflowOrchestrator } = await import('../lib/workflowOrchestrator.js')

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.replace(/^--/, '')
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
    out[key] = val
  }
  return out
}

async function main() {
  // Ensure debug logging is enabled for chunk line items
  process.env.DEBUG_CHUNK_LINE_ITEMS = process.env.DEBUG_CHUNK_LINE_ITEMS || 'true'
  // Run in sequential mode to avoid queueing and make the run synchronous
  process.env.SEQUENTIAL_WORKFLOW = process.env.SEQUENTIAL_WORKFLOW || '1'

  const args = parseArgs(process.argv.slice(2))

  const uploadId = args.uploadId
  const fileName = args.fileName
  const purchaseOrderId = args.purchaseOrderId
  const merchantId = args.merchantId
  const workflowId = args.workflowId || `reprocess_${Date.now()}`

  if (!uploadId && !purchaseOrderId) {
    console.error('Error: please provide --uploadId or --purchaseOrderId')
    process.exit(2)
  }

  console.log('⚡ Reprocess helper starting with:')
  console.log({ workflowId, uploadId, purchaseOrderId, fileName, merchantId })

  // Instantiate orchestrator and run
  const orchestrator = new WorkflowOrchestrator()

  try {
    console.log('🔄 Initializing orchestrator (this includes Redis and DB connections)...')
    await orchestrator.initialize()
    
    // Wait for Redis connection to be fully ready
    console.log('⏳ Waiting for Redis connection...')
    const redisReady = await orchestrator.redis.waitForConnection(15000)
    if (!redisReady) {
      throw new Error('Redis connection timeout after 15 seconds')
    }
    console.log('✅ Redis connected successfully')

    const job = {
      data: {
        workflowId,
        data: {
          uploadId,
          fileName,
          purchaseOrderId,
          merchantId,
          mimeType: 'application/pdf' // Default to PDF for reprocessing
        }
      },
      progress: (pct) => {
        console.log(`  [Job Progress] ${pct}%`)
      }
    }

    console.log('▶️ Invoking processAIParsing() - logs will include DEBUG_CHUNK_LINE_ITEMS output')
    const result = await orchestrator.processAIParsing(job)
    console.log('✅ processAIParsing completed. Result summary:')
    console.log(JSON.stringify({ success: result.success, stage: result.stage, lineItems: result.aiResult?.lineItems?.length || result.aiResult?.extractedData?.lineItems?.length || 0, purchaseOrderId: result.purchaseOrderId }, null, 2))
    process.exit(0)
  } catch (err) {
    console.error('❌ Reprocess failed:', err)
    process.exit(1)
  }
}

main()
