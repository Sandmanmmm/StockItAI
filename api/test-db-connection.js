import { db } from './src/lib/db.js'

async function testConnection() {
  try {
    console.log('🔄 Testing Supabase connection...')
    
    // Test basic connection
    const result = await db.client.$queryRaw`SELECT 1 as test`
    console.log('✅ Database connected successfully:', result)
    
    // Test merchant table exists
    const merchantCount = await db.client.merchant.count()
    console.log('✅ Merchant table accessible, count:', merchantCount)
    
    // Try to find or create a test merchant
    let merchant = await db.client.merchant.findFirst({
      where: { email: 'dev-test@shopify.com' }
    })
    
    if (!merchant) {
      console.log('Creating test merchant...')
      merchant = await db.client.merchant.create({
        data: {
          name: 'Development Test Store',
          shopDomain: 'dev-test.myshopify.com',
          email: 'dev-test@shopify.com',
          status: 'active',
          currency: 'USD',
          plan: 'basic',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      })
      console.log('✅ Test merchant created:', merchant.name)
    } else {
      console.log('✅ Test merchant found:', merchant.name)
    }
    
  } catch (error) {
    console.error('❌ Database test failed:', error.message)
    console.error('Full error:', error)
  } finally {
    await db.client.$disconnect()
    process.exit()
  }
}

testConnection()