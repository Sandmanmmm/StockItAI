import db from './src/lib/db.js'

/**
 * Enable Sequential Workflow for Specific Merchant
 * 
 * Creates/updates MerchantConfig to enable sequential workflow execution
 * for a single test merchant during Phase 2 deployment.
 * 
 * Usage: node enable-sequential-for-merchant.mjs <merchantId>
 */

async function enableSequentialForMerchant(merchantId) {
  console.log(`🔧 Enabling sequential workflow for merchant: ${merchantId}\n`)

  try {
    // Get Prisma client
    const prisma = await db.getClient()
    
    // Verify merchant exists
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { 
        id: true, 
        shopDomain: true,
        status: true
      }
    })

    if (!merchant) {
      console.error(`❌ Merchant not found: ${merchantId}`)
      console.error(`   Please verify the merchant ID is correct`)
      process.exit(1)
    }

    if (merchant.status !== 'active') {
      console.warn(`⚠️  Warning: Merchant is not active: ${merchant.shopDomain}`)
      console.warn(`   Status: ${merchant.status}`)
      console.warn(`   Sequential workflow will still be enabled, but merchant may not upload POs`)
    }

    console.log(`✅ Found merchant: ${merchant.shopDomain}`)
    console.log(`   Status: ${merchant.status}`)

    // Get current settings
    const currentSettings = typeof merchant.settings === 'object' ? merchant.settings : {}
    
    // Update settings with sequential workflow flag
    console.log('\n� Updating merchant settings...')
    
    const updatedMerchant = await prisma.merchant.update({
      where: { id: merchantId },
      data: {
        settings: {
          ...currentSettings,
          enableSequentialWorkflow: true
        }
      }
    })

    console.log(`\n✅ Sequential workflow ENABLED for ${merchant.shopDomain}`)
    console.log(`   Merchant ID: ${updatedMerchant.id}`)
    console.log(`   Sequential Enabled: ${updatedMerchant.settings.enableSequentialWorkflow}`)
    console.log(`   Updated: ${updatedMerchant.updatedAt.toISOString()}`)

    // Verify configuration was saved
    const verification = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { settings: true }
    })

    if (verification?.settings?.enableSequentialWorkflow) {
      console.log(`\n🎉 Configuration verified in database!`)
    } else {
      console.error(`\n❌ Configuration verification failed!`)
      console.error(`   The record was updated but enableSequentialWorkflow is not true`)
      process.exit(1)
    }

    // Check recent workflows
    const recentWorkflows = await prisma.workflowExecution.findMany({
      where: { merchantId: merchantId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        status: true,
        createdAt: true,
        completedAt: true
      }
    })

    if (recentWorkflows.length > 0) {
      console.log(`\n📊 Recent Workflows for this Merchant:`)
      console.log(`   Total found: ${recentWorkflows.length} (showing last 5)`)
      recentWorkflows.forEach((w, i) => {
        const duration = w.completedAt 
          ? Math.round((w.completedAt.getTime() - w.createdAt.getTime()) / 60000)
          : 'N/A'
        console.log(`   ${i+1}. ${w.id} - ${w.status} (${duration} min) - ${w.createdAt.toISOString()}`)
      })
    } else {
      console.log(`\n⚠️  No recent workflows found for this merchant`)
    }

    console.log('\n📋 Next Steps:')
    console.log('   1. Start monitoring: node monitor-test-merchant.mjs ' + merchantId)
    console.log('   2. Wait for merchant to upload a PO')
    console.log('   3. Watch for log: "Sequential mode enabled for merchant"')
    console.log('   4. Verify workflow completes in 3-5 minutes')
    console.log('   5. Analyze results: node analyze-test-workflow.mjs <workflowId>')

    console.log('\n🔄 To Disable Later:')
    console.log('   node disable-sequential-for-merchant.mjs ' + merchantId)

  } catch (error) {
    console.error('❌ Error enabling sequential mode:', error)
    console.error('   Error code:', error.code)
    console.error('   Error message:', error.message)
    throw error
  }
}

// Get merchantId from command line
const merchantId = process.argv[2]

if (!merchantId) {
  console.error('❌ Usage: node enable-sequential-for-merchant.mjs <merchantId>')
  console.error('   Example: node enable-sequential-for-merchant.mjs clxxx...')
  console.error('\n💡 Tip: Run identify-test-merchant.mjs first to find a good test merchant')
  process.exit(1)
}

enableSequentialForMerchant(merchantId).catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
