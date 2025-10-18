#!/usr/bin/env node
// Modified reprocess script that outputs all line items to a file
// Usage: node api/src/scripts/listItemsFromReprocess.js --uploadId <uploadId> --fileName <fileName>
// Example: node .\api\src\scripts\listItemsFromReprocess.js --uploadId cmgv2ohbx0003ji04vg1ty1c1 --fileName invoice_3541_250923_204906.pdf

import path from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'
import { WorkflowOrchestrator } from '../lib/workflowOrchestrator.js'
import fs from 'fs'

// Load environment variables from .env or .env.production.vercel
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '../../..')

// Try loading production env first, then fallback to standard .env
const prodEnvPath = path.join(rootDir, '.env.production.vercel')
const envPath = path.join(rootDir, '.env')
config({ path: prodEnvPath })
config({ path: envPath })

console.log('🔧 Environment loaded:')
console.log('   - REDIS_URL:', process.env.REDIS_URL ? 'configured (Upstash)' : 'not set')
console.log('   - DATABASE_URL:', process.env.DATABASE_URL ? 'configured' : 'not set')

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
  // Disable debug logging for cleaner output
  process.env.DEBUG_CHUNK_LINE_ITEMS = 'false'
  // Run in sequential mode to avoid queueing and make the run synchronous
  process.env.SEQUENTIAL_WORKFLOW = process.env.SEQUENTIAL_WORKFLOW || '1'

  const args = parseArgs(process.argv.slice(2))

  const uploadId = args.uploadId
  const fileName = args.fileName
  const purchaseOrderId = args.purchaseOrderId
  const merchantId = args.merchantId
  const workflowId = args.workflowId || `list_items_${Date.now()}`

  if (!uploadId && !purchaseOrderId) {
    console.error('Error: please provide --uploadId or --purchaseOrderId')
    process.exit(2)
  }

  console.log('⚡ Listing items for:')
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

    console.log('▶️ Processing AI parsing to extract line items...')
    
    let lineItems = []
    try {
      const result = await orchestrator.processAIParsing(job)
      
      // Extract line items from various possible locations
      lineItems = result.aiResult?.lineItems || 
                  result.aiResult?.extractedData?.lineItems || 
                  result.lineItems ||
                  result.extractedData?.lineItems ||
                  []
    } catch (error) {
      // Even if the workflow update fails, we might have extracted the items
      console.log('\n⚠️  Workflow update failed, but checking if items were extracted...')
      console.log('Error:', error.message)
      
      // Try to get the data from enhancedAIService directly if it was stored
      // The error happens after AI parsing, so the data should exist
      throw error
    }
    
    console.log(`\n✅ Extraction completed. Found ${lineItems.length} line items`)
    console.log('=' .repeat(80))
    
    // Generate detailed output
    const outputLines = []
    outputLines.push('=' .repeat(80))
    outputLines.push(`EXTRACTED LINE ITEMS`)
    outputLines.push(`Upload ID: ${uploadId}`)
    outputLines.push(`Workflow ID: ${workflowId}`)
    outputLines.push(`Total Count: ${lineItems.length}`)
    outputLines.push(`Generated: ${new Date().toISOString()}`)
    outputLines.push('=' .repeat(80))
    outputLines.push('')
    
    // Group items for analysis
    const itemsByDescription = {}
    const itemsBySku = {}
    
    lineItems.forEach((item, index) => {
      const num = index + 1
      const desc = item.description || item.item_description || 'N/A'
      const sku = item.sku || item.item_number || 'N/A'
      const qty = item.quantity || item.qty || 'N/A'
      const price = item.unit_price || item.price || 'N/A'
      const total = item.total_price || item.total || 'N/A'
      
      // Add to output
      outputLines.push(`--- ITEM ${num} ---`)
      outputLines.push(`Description: ${desc}`)
      outputLines.push(`SKU: ${sku}`)
      outputLines.push(`Quantity: ${qty}`)
      outputLines.push(`Unit Price: ${price}`)
      outputLines.push(`Total: ${total}`)
      outputLines.push('')
      
      // Track for duplicate analysis
      const descKey = desc.toLowerCase().trim()
      if (!itemsByDescription[descKey]) {
        itemsByDescription[descKey] = []
      }
      itemsByDescription[descKey].push({ num, sku, qty, price })
      
      const skuKey = String(sku).toLowerCase().trim()
      if (skuKey !== 'n/a' && skuKey !== '') {
        if (!itemsBySku[skuKey]) {
          itemsBySku[skuKey] = []
        }
        itemsBySku[skuKey].push({ num, desc, qty, price })
      }
    })
    
    // Add duplicate analysis
    outputLines.push('=' .repeat(80))
    outputLines.push('DUPLICATE ANALYSIS')
    outputLines.push('=' .repeat(80))
    outputLines.push('')
    
    // Check for duplicate descriptions
    const dupDescriptions = Object.entries(itemsByDescription).filter(([_, items]) => items.length > 1)
    if (dupDescriptions.length > 0) {
      outputLines.push(`DUPLICATE DESCRIPTIONS (${dupDescriptions.length} groups):`)
      outputLines.push('')
      dupDescriptions.forEach(([desc, items]) => {
        outputLines.push(`  "${desc}"`)
        outputLines.push(`  Appears ${items.length} times in items: ${items.map(i => `#${i.num}`).join(', ')}`)
        items.forEach(item => {
          outputLines.push(`    - Item #${item.num}: SKU ${item.sku}, Qty ${item.qty}, Price ${item.price}`)
        })
        outputLines.push('')
      })
    } else {
      outputLines.push('✓ No duplicate descriptions found')
      outputLines.push('')
    }
    
    // Check for duplicate SKUs
    const dupSkus = Object.entries(itemsBySku).filter(([_, items]) => items.length > 1)
    if (dupSkus.length > 0) {
      outputLines.push(`DUPLICATE SKUs (${dupSkus.length} groups):`)
      outputLines.push('')
      dupSkus.forEach(([sku, items]) => {
        outputLines.push(`  SKU: ${sku}`)
        outputLines.push(`  Appears ${items.length} times in items: ${items.map(i => `#${i.num}`).join(', ')}`)
        items.forEach(item => {
          outputLines.push(`    - Item #${item.num}: "${item.desc}", Qty ${item.qty}, Price ${item.price}`)
        })
        outputLines.push('')
      })
    } else {
      outputLines.push('✓ No duplicate SKUs found')
      outputLines.push('')
    }
    
    // Add summary statistics
    outputLines.push('=' .repeat(80))
    outputLines.push('SUMMARY STATISTICS')
    outputLines.push('=' .repeat(80))
    outputLines.push(`Total items extracted: ${lineItems.length}`)
    outputLines.push(`Unique descriptions: ${Object.keys(itemsByDescription).length}`)
    outputLines.push(`Unique SKUs: ${Object.keys(itemsBySku).length}`)
    outputLines.push(`Duplicate description groups: ${dupDescriptions.length}`)
    outputLines.push(`Duplicate SKU groups: ${dupSkus.length}`)
    outputLines.push('')
    
    // Calculate potential over-extraction
    const descDupes = dupDescriptions.reduce((sum, [_, items]) => sum + (items.length - 1), 0)
    const skuDupes = dupSkus.reduce((sum, [_, items]) => sum + (items.length - 1), 0)
    const maxDupes = Math.max(descDupes, skuDupes)
    
    if (maxDupes > 0) {
      outputLines.push(`⚠️  POTENTIAL OVER-EXTRACTION:`)
      outputLines.push(`   Based on duplicate descriptions: ${descDupes} extra items`)
      outputLines.push(`   Based on duplicate SKUs: ${skuDupes} extra items`)
      outputLines.push(`   Maximum duplicate count: ${maxDupes}`)
      outputLines.push(`   Estimated actual items: ${lineItems.length - maxDupes}`)
      outputLines.push('')
    } else {
      outputLines.push(`✓ No obvious duplicates detected`)
      outputLines.push('')
    }
    
    // Write to file
    const outputPath = path.join(rootDir, `extracted_items_${uploadId}.txt`)
    fs.writeFileSync(outputPath, outputLines.join('\n'))
    
    console.log(`\n✓ Output written to: ${outputPath}`)
    console.log(`\nSummary:`)
    console.log(`  Total items: ${lineItems.length}`)
    console.log(`  Unique descriptions: ${Object.keys(itemsByDescription).length}`)
    console.log(`  Unique SKUs: ${Object.keys(itemsBySku).length}`)
    console.log(`  Duplicate description groups: ${dupDescriptions.length}`)
    console.log(`  Duplicate SKU groups: ${dupSkus.length}`)
    
    if (maxDupes > 0) {
      console.log(`\n⚠️  Potential over-extraction: ${maxDupes} items`)
      console.log(`  Estimated actual count: ${lineItems.length - maxDupes}`)
    } else {
      console.log(`\n✓ No obvious duplicates detected`)
    }
    
    process.exit(0)
  } catch (err) {
    console.error('❌ Failed:', err)
    process.exit(1)
  }
}

main()
