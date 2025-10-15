import { db } from './src/lib/db.js'

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
    // Verify merchant exists
    const merchant = await db.merchant.findUnique({
      where: { id: merchantId },
      select: { 
        id: true, 
        shopDomain: true,
        isActive: true
      }
    })

    if (!merchant) {
      console.error(`❌ Merchant not found: ${merchantId}`)
      console.error(`   Please verify the merchant ID is correct`)
      process.exit(1)
    }

    if (!merchant.isActive) {
      console.warn(`⚠️  Warning: Merchant is not active: ${merchant.shopDomain}`)
      console.warn(`   Sequential workflow will still be enabled, but merchant may not upload POs`)
    }

    console.log(`✅ Found merchant: ${merchant.shopDomain}`)
    console.log(`   Status: ${merchant.isActive ? 'Active' : 'Inactive'}`)

    // Check if MerchantConfig table exists
    let tableExists = false
    try {
      await db.merchantConfig.findFirst()
      tableExists = true
    } catch (error) {
      if (error.code === 'P2021' || error.message.includes('does not exist')) {
        console.log('⚠️  MerchantConfig table does not exist yet')
        console.log('📝 Creating table via Prisma schema...')
        
        // Table should exist from Prisma schema, but if not, guide user
        console.error('❌ Please run: npx prisma migrate dev --name add-merchant-config')
        console.error('   Or create the table manually in your database')
        process.exit(1)
      } else {
        throw error
      }
    }

    // Upsert merchant config
    console.log('💾 Updating merchant configuration...')
    
    const config = await db.merchantConfig.upsert({
      where: { merchantId: merchantId },
      update: { 
        enableSequentialWorkflow: true,
        updatedAt: new Date()
      },
      create: { 
        merchantId: merchantId,
        enableSequentialWorkflow: true
      }
    })

    console.log(`\n✅ Sequential workflow ENABLED for ${merchant.shopDomain}`)
    console.log(`   Config ID: ${config.id}`)
    console.log(`   Merchant ID: ${config.merchantId}`)
    console.log(`   Sequential Enabled: ${config.enableSequentialWorkflow}`)
    console.log(`   Updated: ${config.updatedAt.toISOString()}`)

    // Verify configuration was saved
    const verification = await db.merchantConfig.findUnique({
      where: { merchantId: merchantId }
    })

    if (verification?.enableSequentialWorkflow) {
      console.log(`\n🎉 Configuration verified in database!`)
    } else {
      console.error(`\n❌ Configuration verification failed!`)
      console.error(`   The record was created but enableSequentialWorkflow is not true`)
      process.exit(1)
    }

    // Check recent workflows
    const recentWorkflows = await db.workflowExecution.findMany({
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
  } finally {
    await db.$disconnect()
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
