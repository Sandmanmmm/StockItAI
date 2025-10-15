import { db } from './src/lib/db.js'

/**
 * Disable Sequential Workflow for Specific Merchant
 * 
 * Disables sequential workflow execution for a merchant,
 * returning them to legacy Bull queue mode.
 * 
 * Usage: node disable-sequential-for-merchant.mjs <merchantId>
 */

async function disableSequentialForMerchant(merchantId) {
  console.log(`🔧 Disabling sequential workflow for merchant: ${merchantId}\n`)

  try {
    // Verify merchant exists
    const merchant = await db.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true, shopDomain: true }
    })

    if (!merchant) {
      console.error(`❌ Merchant not found: ${merchantId}`)
      process.exit(1)
    }

    console.log(`✅ Found merchant: ${merchant.shopDomain}`)

    // Check current config
    const currentConfig = await db.merchantConfig.findUnique({
      where: { merchantId: merchantId }
    })

    if (!currentConfig) {
      console.log(`⚠️  No configuration found for this merchant`)
      console.log(`   Sequential workflow was not enabled`)
      await db.$disconnect()
      return
    }

    if (!currentConfig.enableSequentialWorkflow) {
      console.log(`ℹ️  Sequential workflow is already disabled for this merchant`)
      await db.$disconnect()
      return
    }

    // Update config
    const config = await db.merchantConfig.update({
      where: { merchantId: merchantId },
      data: { 
        enableSequentialWorkflow: false,
        updatedAt: new Date()
      }
    })

    console.log(`\n✅ Sequential workflow DISABLED for ${merchant.shopDomain}`)
    console.log(`   Config ID: ${config.id}`)
    console.log(`   Sequential Enabled: ${config.enableSequentialWorkflow}`)
    console.log(`   Updated: ${config.updatedAt.toISOString()}`)
    console.log(`\n🔄 Merchant will now use legacy Bull queue mode (38 min workflows)`)

    console.log('\n🔄 To Re-Enable Later:')
    console.log('   node enable-sequential-for-merchant.mjs ' + merchantId)

  } catch (error) {
    console.error('❌ Error disabling sequential mode:', error)
    throw error
  } finally {
    await db.$disconnect()
  }
}

const merchantId = process.argv[2]

if (!merchantId) {
  console.error('❌ Usage: node disable-sequential-for-merchant.mjs <merchantId>')
  process.exit(1)
}

disableSequentialForMerchant(merchantId).catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
