import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

try {
  console.log('\n🔍 Finding idle/stuck database connections...\n')
  
  // Find connections that are idle in transaction for > 1 minute
  const stuckConnections = await prisma.$queryRaw`
    SELECT 
      pid,
      usename,
      application_name,
      client_addr,
      state,
      state_change,
      EXTRACT(EPOCH FROM (now() - state_change))::int AS idle_seconds,
      query
    FROM pg_stat_activity
    WHERE 
      state IN ('idle in transaction', 'idle in transaction (aborted)')
      AND now() - state_change > interval '1 minute'
      AND datname = current_database()
    ORDER BY state_change;
  `
  
  if (stuckConnections.length === 0) {
    console.log('✅ No stuck connections found')
  } else {
    console.log(`⚠️ Found ${stuckConnections.length} stuck connection(s):\n`)
    
    for (const conn of stuckConnections) {
      console.log(`PID ${conn.pid}:`)
      console.log(`  User: ${conn.usename}`)
      console.log(`  App: ${conn.application_name}`)
      console.log(`  State: ${conn.state}`)
      console.log(`  Idle for: ${conn.idle_seconds}s`)
      console.log(`  Last query: ${conn.query?.substring(0, 100)}`)
      
      // Kill the connection
      console.log(`  🔪 Killing connection ${conn.pid}...`)
      try {
        await prisma.$executeRaw`SELECT pg_terminate_backend(${Number(conn.pid)}::int)`
        console.log(`  ✅ Connection ${conn.pid} terminated`)
      } catch (killError) {
        console.error(`  ❌ Failed to kill ${conn.pid}:`, killError.message)
      }
      console.log()
    }
    
    console.log(`\n🎉 Cleanup complete! Cron should be able to fix PO on next run.`)
  }
  
} catch (error) {
  console.error('Error:', error.message)
  console.error(error.stack)
} finally {
  await prisma.$disconnect()
}
