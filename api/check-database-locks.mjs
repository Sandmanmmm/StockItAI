import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

try {
  console.log('\n🔍 Checking for database locks on PO table...\n')
  
  const locks = await prisma.$queryRaw`
    SELECT 
      l.locktype,
      l.relation::regclass,
      l.mode,
      l.granted,
      a.usename,
      a.query,
      a.state,
      a.state_change,
      now() - a.query_start AS query_duration
    FROM pg_locks l
    LEFT JOIN pg_stat_activity a ON l.pid = a.pid
    WHERE l.relation = '"PurchaseOrder"'::regclass
    ORDER BY a.query_start;
  `
  
  if (locks.length === 0) {
    console.log('✅ No locks found on PurchaseOrder table')
  } else {
    console.log(`⚠️ Found ${locks.length} lock(s):\n`)
    locks.forEach((lock, i) => {
      console.log(`Lock ${i + 1}:`)
      console.log(`  Type: ${lock.locktype}`)
      console.log(`  Mode: ${lock.mode}`)
      console.log(`  Granted: ${lock.granted}`)
      console.log(`  User: ${lock.usename}`)
      console.log(`  State: ${lock.state}`)
      console.log(`  Duration: ${lock.query_duration}`)
      console.log(`  Query: ${lock.query?.substring(0, 100)}...`)
      console.log()
    })
  }
  
} catch (error) {
  console.error('Error:', error.message)
} finally {
  await prisma.$disconnect()
}
