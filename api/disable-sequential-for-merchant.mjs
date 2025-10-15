import db from './src/lib/db.js'

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
    // Get Prisma client
    const prisma = await db.getClient()
    
    // Verify merchant exists
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true, shopDomain: true, settings: true }
    })

    if (!merchant) {
      console.error(`❌ Merchant not found: ${merchantId}`)
      process.exit(1)
    }

    console.log(`✅ Found merchant: ${merchant.shopDomain}`)

    // Check current settings
    const currentSettings = typeof merchant.settings === 'object' ? merchant.settings : {}

    if (!currentSettings.enableSequentialWorkflow) {
      console.log(`ℹ️  Sequential workflow is already disabled for this merchant`)
      return
    }

    // Update settings
    const updatedMerchant = await prisma.merchant.update({
      where: { id: merchantId },
      data: { 
        settings: {
          ...currentSettings,
          enableSequentialWorkflow: false
        }
      }
    })

    console.log(`\n✅ Sequential workflow DISABLED for ${merchant.shopDomain}`)
    console.log(`   Merchant ID: ${updatedMerchant.id}`)
    console.log(`   Sequential Enabled: ${updatedMerchant.settings.enableSequentialWorkflow}`)
    console.log(`   Updated: ${updatedMerchant.updatedAt.toISOString()}`)
    console.log(`\n🔄 Merchant will now use legacy Bull queue mode (38 min workflows)`)

    console.log('\n🔄 To Re-Enable Later:')
    console.log('   node enable-sequential-for-merchant.mjs ' + merchantId)

  } catch (error) {
    console.error('❌ Error disabling sequential mode:', error)
    throw error
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
