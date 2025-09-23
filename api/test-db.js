import { db } from './src/lib/db.js'

async function testConnection() {
  try {
    console.log('🔍 Testing database connection...')
    await db.client.$connect()
    console.log('✅ Database connected successfully')
    
    const result = await db.client.$queryRaw`SELECT 1 as test`
    console.log('✅ Query test passed:', result)
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message)
    console.error('Error code:', error.code)
  } finally {
    await db.client.$disconnect()
    console.log('🔌 Disconnected')
  }
}

testConnection()