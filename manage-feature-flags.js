/**
 * Feature Flag Management CLI
 * 
 * Utility script for testing and managing feature flags.
 * 
 * Usage:
 *   node manage-feature-flags.js status              # Show current configuration
 *   node manage-feature-flags.js test <merchantId>   # Test flag resolution for merchant
 *   node manage-feature-flags.js enable <merchantId> # Enable pg_trgm for merchant
 *   node manage-feature-flags.js disable <merchantId> # Disable pg_trgm for merchant
 *   node manage-feature-flags.js adoption            # Show adoption statistics
 *   node manage-feature-flags.js enable-all          # Enable for ALL merchants (careful!)
 *   node manage-feature-flags.js disable-all         # Disable for ALL merchants (rollback)
 *   node manage-feature-flags.js cache-stats         # Show cache statistics
 *   node manage-feature-flags.js clear-cache [id]    # Clear cache (optionally for specific merchant)
 */

import { featureFlags } from './api/src/config/featureFlags.js'
import { db } from './api/src/lib/db.js'

async function showStatus() {
  console.log('\n╔════════════════════════════════════════════════════════════╗')
  console.log('║           FEATURE FLAGS - CURRENT CONFIGURATION            ║')
  console.log('╚════════════════════════════════════════════════════════════╝\n')
  
  const summary = await featureFlags.getConfigSummary()
  
  console.log('🌍 GLOBAL SETTINGS:')
  console.log(`   USE_PG_TRGM_FUZZY_MATCHING = ${summary.globalSetting}`)
  console.log(`   PG_TRGM_ROLLOUT_PERCENTAGE = ${summary.rolloutPercentage}`)
  
  console.log('\n📊 ADOPTION STATISTICS:')
  console.log(`   Total Merchants: ${summary.adoption.total}`)
  console.log(`   Using pg_trgm:   ${summary.adoption.pgTrgm.count} (${summary.adoption.pgTrgm.percentage}%)`)
  console.log(`   Using JavaScript: ${summary.adoption.javascript.count} (${summary.adoption.javascript.percentage}%)`)
  console.log(`   Using Default:   ${summary.adoption.default.count} (${summary.adoption.default.percentage}%)`)
  
  console.log('\n💾 CACHE STATISTICS:')
  console.log(`   Size:         ${summary.cache.size} entries`)
  console.log(`   Hits:         ${summary.cache.hits}`)
  console.log(`   Misses:       ${summary.cache.misses}`)
  console.log(`   Hit Rate:     ${summary.cache.hitRate}`)
  console.log(`   DB Queries:   ${summary.cache.dbQueries}`)
  
  console.log('\n═══════════════════════════════════════════════════════════\n')
}

async function testMerchant(merchantId) {
  console.log(`\n🧪 TESTING FLAG RESOLUTION FOR: ${merchantId}\n`)
  
  // Test with no override
  const result1 = await featureFlags.usePgTrgmMatching(merchantId)
  console.log(`1. No Override:        ${result1 ? '✅ pg_trgm' : '❌ javascript'}`)
  
  // Test with pg_trgm override
  const result2 = await featureFlags.usePgTrgmMatching(merchantId, 'pg_trgm')
  console.log(`2. Override pg_trgm:   ${result2 ? '✅ pg_trgm' : '❌ javascript'}`)
  
  // Test with javascript override
  const result3 = await featureFlags.usePgTrgmMatching(merchantId, 'javascript')
  console.log(`3. Override javascript: ${result3 ? '✅ pg_trgm' : '❌ javascript'}`)
  
  // Show merchant-specific setting
  const setting = await featureFlags.getMerchantSetting(merchantId, 'fuzzyMatchingEngine')
  console.log(`\n📋 Merchant Setting: ${setting || '(not set)'}`)
  
  // Show rollout group status
  const percentage = featureFlags.getRolloutPercentage()
  const inRollout = featureFlags.isInRolloutGroup(merchantId, percentage)
  console.log(`🎲 Rollout Group (${percentage}%): ${inRollout ? '✅ Included' : '❌ Excluded'}`)
  
  console.log()
}

async function enableMerchant(merchantId) {
  console.log(`\n🔓 ENABLING pg_trgm FOR: ${merchantId}`)
  
  const success = await featureFlags.setMerchantEngine(merchantId, 'pg_trgm')
  
  if (success) {
    console.log('✅ Successfully enabled pg_trgm')
    
    // Verify
    const result = await featureFlags.usePgTrgmMatching(merchantId)
    console.log(`✓ Verification: ${result ? 'pg_trgm active' : 'ERROR - still using javascript'}`)
  } else {
    console.log('❌ Failed to enable pg_trgm')
  }
  
  console.log()
}

async function disableMerchant(merchantId) {
  console.log(`\n🔒 DISABLING pg_trgm FOR: ${merchantId}`)
  
  const success = await featureFlags.setMerchantEngine(merchantId, 'javascript')
  
  if (success) {
    console.log('✅ Successfully disabled pg_trgm (using JavaScript)')
    
    // Verify
    const result = await featureFlags.usePgTrgmMatching(merchantId)
    console.log(`✓ Verification: ${result ? 'ERROR - still using pg_trgm' : 'JavaScript active'}`)
  } else {
    console.log('❌ Failed to disable pg_trgm')
  }
  
  console.log()
}

async function showAdoption() {
  console.log('\n📊 DETAILED ADOPTION STATISTICS\n')
  
  const adoption = await featureFlags.getPgTrgmAdoptionRate()
  
  console.log('╔════════════════════════════════════════════════════╗')
  console.log('║           FUZZY MATCHING ENGINE ADOPTION          ║')
  console.log('╚════════════════════════════════════════════════════╝\n')
  
  console.log(`Total Merchants: ${adoption.total}\n`)
  
  // pg_trgm bar
  const pgTrgmBar = '█'.repeat(Math.round(adoption.pgTrgm.percentage / 2))
  console.log(`pg_trgm:    ${pgTrgmBar}`)
  console.log(`            ${adoption.pgTrgm.count} merchants (${adoption.pgTrgm.percentage}%)\n`)
  
  // JavaScript bar
  const jsBar = '█'.repeat(Math.round(adoption.javascript.percentage / 2))
  console.log(`JavaScript: ${jsBar}`)
  console.log(`            ${adoption.javascript.count} merchants (${adoption.javascript.percentage}%)\n`)
  
  // Default bar
  const defaultBar = '█'.repeat(Math.round(adoption.default.percentage / 2))
  console.log(`Default:    ${defaultBar}`)
  console.log(`            ${adoption.default.count} merchants (${adoption.default.percentage}%)\n`)
  
  console.log('════════════════════════════════════════════════════\n')
}

async function enableAll() {
  console.log('\n⚠️  WARNING: ENABLING pg_trgm FOR ALL MERCHANTS ⚠️\n')
  console.log('This will switch ALL merchants to pg_trgm fuzzy matching.')
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to proceed...\n')
  
  await new Promise(resolve => setTimeout(resolve, 5000))
  
  console.log('🚀 Enabling pg_trgm for all merchants...\n')
  
  const count = await featureFlags.enablePgTrgmForAll()
  
  console.log(`\n✅ Enabled pg_trgm for ${count} merchants`)
  console.log('Run "node manage-feature-flags.js status" to verify\n')
}

async function disableAll() {
  console.log('\n⚠️  WARNING: DISABLING pg_trgm FOR ALL MERCHANTS ⚠️\n')
  console.log('This will switch ALL merchants back to JavaScript matching.')
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to proceed...\n')
  
  await new Promise(resolve => setTimeout(resolve, 5000))
  
  console.log('🔄 Disabling pg_trgm for all merchants (emergency rollback)...\n')
  
  const count = await featureFlags.disablePgTrgmForAll()
  
  console.log(`\n✅ Disabled pg_trgm for ${count} merchants`)
  console.log('Run "node manage-feature-flags.js status" to verify\n')
}

async function showCacheStats() {
  console.log('\n💾 CACHE STATISTICS\n')
  
  const stats = featureFlags.getCacheStats()
  
  console.log(`Size:       ${stats.size} entries`)
  console.log(`Hits:       ${stats.hits}`)
  console.log(`Misses:     ${stats.misses}`)
  console.log(`Hit Rate:   ${stats.hitRate}`)
  console.log(`DB Queries: ${stats.dbQueries}`)
  
  console.log()
}

async function clearCache(merchantId = null) {
  if (merchantId) {
    console.log(`\n🗑️  CLEARING CACHE FOR: ${merchantId}\n`)
    featureFlags.clearMerchantCache(merchantId)
    console.log('✅ Cache cleared for merchant')
  } else {
    console.log('\n🗑️  CLEARING ALL CACHE\n')
    featureFlags.clearAllCache()
    console.log('✅ All cache cleared')
  }
  
  console.log()
}

async function listMerchants() {
  console.log('\n📋 LISTING ALL MERCHANTS\n')
  
  const client = await db.getClient()
  
  const merchants = await client.merchant.findMany({
    select: {
      id: true,
      shop: true,
      isActive: true
    },
    orderBy: { shop: 'asc' }
  })
  
  console.log(`Found ${merchants.length} merchants:\n`)
  
  for (const merchant of merchants) {
    const status = merchant.isActive ? '🟢' : '🔴'
    const setting = await featureFlags.getMerchantSetting(merchant.id, 'fuzzyMatchingEngine')
    const engine = setting || 'default'
    
    console.log(`${status} ${merchant.shop}`)
    console.log(`   ID: ${merchant.id}`)
    console.log(`   Engine: ${engine}`)
    console.log()
  }
}

// Main CLI
async function main() {
  const command = process.argv[2]
  const arg1 = process.argv[3]
  
  try {
    switch (command) {
      case 'status':
        await showStatus()
        break
      
      case 'test':
        if (!arg1) {
          console.error('❌ Error: Merchant ID required')
          console.error('Usage: node manage-feature-flags.js test <merchantId>')
          process.exit(1)
        }
        await testMerchant(arg1)
        break
      
      case 'enable':
        if (!arg1) {
          console.error('❌ Error: Merchant ID required')
          console.error('Usage: node manage-feature-flags.js enable <merchantId>')
          process.exit(1)
        }
        await enableMerchant(arg1)
        break
      
      case 'disable':
        if (!arg1) {
          console.error('❌ Error: Merchant ID required')
          console.error('Usage: node manage-feature-flags.js disable <merchantId>')
          process.exit(1)
        }
        await disableMerchant(arg1)
        break
      
      case 'adoption':
        await showAdoption()
        break
      
      case 'enable-all':
        await enableAll()
        break
      
      case 'disable-all':
        await disableAll()
        break
      
      case 'cache-stats':
        await showCacheStats()
        break
      
      case 'clear-cache':
        await clearCache(arg1)
        break
      
      case 'list':
        await listMerchants()
        break
      
      default:
        console.log('\n📋 FEATURE FLAG MANAGEMENT CLI\n')
        console.log('Usage:')
        console.log('  node manage-feature-flags.js status              # Show configuration')
        console.log('  node manage-feature-flags.js test <merchantId>   # Test flag resolution')
        console.log('  node manage-feature-flags.js enable <merchantId> # Enable pg_trgm')
        console.log('  node manage-feature-flags.js disable <merchantId> # Disable pg_trgm')
        console.log('  node manage-feature-flags.js adoption            # Show adoption stats')
        console.log('  node manage-feature-flags.js enable-all          # Enable for ALL (careful!)')
        console.log('  node manage-feature-flags.js disable-all         # Disable for ALL (rollback)')
        console.log('  node manage-feature-flags.js cache-stats         # Show cache stats')
        console.log('  node manage-feature-flags.js clear-cache [id]    # Clear cache')
        console.log('  node manage-feature-flags.js list                # List all merchants')
        console.log()
        process.exit(1)
    }
    
    process.exit(0)
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

main()
