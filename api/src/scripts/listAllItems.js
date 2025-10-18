#!/usr/bin/env node
/**
 * List all extracted line items from a PO upload
 * Usage: node api/src/scripts/listAllItems.js --uploadId <uploadId>
 * Example: node .\api\src\scripts\listAllItems.js --uploadId cmgv2ohbx0003ji04vg1ty1c1
 */

import path from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'
import { redisManager } from '../lib/redisManager.js'
import fs from 'fs'

// Load environment variables
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '../../..')

const prodEnvPath = path.join(rootDir, '.env.production.vercel')
const envPath = path.join(rootDir, '.env')
config({ path: prodEnvPath })
config({ path: envPath })

// Parse command line arguments
const args = process.argv.slice(2)
const argMap = {}
for (let i = 0; i < args.length; i += 2) {
  const key = args[i].replace(/^--/, '')
  const value = args[i + 1]
  argMap[key] = value
}

const UPLOAD_ID = argMap.uploadId || 'cmgv2ohbx0003ji04vg1ty1c1'

async function listAllItems() {
  try {
    console.log(`Fetching workflow results for upload: ${UPLOAD_ID}`)
    console.log('=' .repeat(80))
    
    // Get the workflow ID from upload
    const workflowKey = `upload:${UPLOAD_ID}:workflow`
    let workflowId = await redisManager.get(workflowKey)
    
    if (!workflowId) {
      console.log('No workflow found via upload key. Searching all workflows...')
      
      // Try to find any workflow keys for this upload
      const pattern = `workflow:*`
      const allKeys = await redisManager.keys(pattern)
      console.log(`Scanning ${allKeys.length} workflow keys...`)
      
      // Find workflows for this upload
      for (const key of allKeys) {
        if (key.includes(UPLOAD_ID)) {
          const parts = key.split(':')
          if (parts.length >= 2) {
            workflowId = parts[1]
            console.log(`Found workflow ID: ${workflowId}`)
            break
          }
        }
      }
      
      if (!workflowId) {
        throw new Error(`No workflow found for upload: ${UPLOAD_ID}`)
      }
    } else {
      console.log(`Found workflow ID: ${workflowId}`)
    }
    
    return await getWorkflowResults(workflowId)
    
  } catch (error) {
    console.error('Error fetching items:', error)
    throw error
  }
}

async function getWorkflowResults(workflowId) {
  // Get the AI parsing stage results
  const stageKey = `workflow:${workflowId}:stage:ai_parsing:result`
  const stageResultStr = await redisManager.get(stageKey)
  
  if (!stageResultStr) {
    console.log('No AI parsing results found. Checking all stages...')
    const allStageKeys = await redisManager.keys(`workflow:${workflowId}:stage:*`)
    console.log('Available stages:', allStageKeys)
    throw new Error('No AI parsing results found')
  }
  
  console.log('✓ Found AI parsing results')
  console.log('=' .repeat(80))
  console.log('')
  
  let lineItems = []
  
  // Parse the stage result
  const stageResult = typeof stageResultStr === 'string' ? JSON.parse(stageResultStr) : stageResultStr
  lineItems = stageResult.lineItems || stageResult.line_items || []
  
  console.log(`Found ${lineItems.length} line items\n`)
  
  // Create detailed output
  const outputLines = []
  outputLines.push('=' .repeat(80))
  outputLines.push(`EXTRACTED LINE ITEMS FOR UPLOAD: ${UPLOAD_ID}`)
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
  const outputPath = path.join(rootDir, `extracted_items_${UPLOAD_ID}.txt`)
  fs.writeFileSync(outputPath, outputLines.join('\n'))
  
  console.log(`✓ Output written to: ${outputPath}`)
  console.log(`\nSummary:`)
  console.log(`  Total items: ${lineItems.length}`)
  console.log(`  Unique descriptions: ${Object.keys(itemsByDescription).length}`)
  console.log(`  Unique SKUs: ${Object.keys(itemsBySku).length}`)
  console.log(`  Duplicate description groups: ${dupDescriptions.length}`)
  console.log(`  Duplicate SKU groups: ${dupSkus.length}`)
  
  if (maxDupes > 0) {
    console.log(`  \n⚠️  Potential over-extraction: ${maxDupes} items`)
    console.log(`  Estimated actual count: ${lineItems.length - maxDupes}`)
  } else {
    console.log(`\n✓ No obvious duplicates detected`)
  }
  
  return lineItems
}

// Run the script
listAllItems()
  .then(() => {
    console.log('\n✓ Complete')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n✗ Error:', error.message)
    process.exit(1)
  })
