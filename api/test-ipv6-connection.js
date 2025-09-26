#!/usr/bin/env node

/**
 * IPv6 Database Connection Test
 * Tests direct connection to Supabase with IPv6 support
 */

import { createConnection } from 'net'
import dotenv from 'dotenv'

dotenv.config()

async function testIPv6Connection() {
  console.log('🔗 Testing IPv6 connection to Supabase database...')
  
  const host = 'db.omvdgqbmgxxutbjhnamf.supabase.co'
  const port = 5432
  
  console.log(`   Host: ${host}`)
  console.log(`   Port: ${port}`)
  console.log(`   Protocol: IPv6`)
  
  return new Promise((resolve) => {
    // Force IPv6 by setting family to 6
    const socket = createConnection({
      host: host,
      port: port,
      family: 6, // Force IPv6
      timeout: 10000
    })
    
    socket.on('connect', () => {
      console.log('✅ IPv6 TCP connection successful!')
      console.log(`   Connected to: ${socket.remoteAddress}:${socket.remotePort}`)
      socket.end()
      resolve(true)
    })
    
    socket.on('error', (error) => {
      console.error('❌ IPv6 connection failed:', error.message)
      console.error('   Error code:', error.code)
      resolve(false)
    })
    
    socket.on('timeout', () => {
      console.error('❌ IPv6 connection timed out')
      socket.destroy()
      resolve(false)
    })
  })
}

// Also test IPv4 for comparison
async function testIPv4Connection() {
  console.log('\n🔗 Testing IPv4 connection (should fail)...')
  
  const host = 'db.omvdgqbmgxxutbjhnamf.supabase.co'
  const port = 5432
  
  return new Promise((resolve) => {
    const socket = createConnection({
      host: host,
      port: port,
      family: 4, // Force IPv4
      timeout: 5000
    })
    
    socket.on('connect', () => {
      console.log('✅ IPv4 TCP connection successful (unexpected!)')
      socket.end()
      resolve(true)
    })
    
    socket.on('error', (error) => {
      console.log('❌ IPv4 connection failed as expected:', error.message)
      resolve(false)
    })
    
    socket.on('timeout', () => {
      console.log('❌ IPv4 connection timed out as expected')
      socket.destroy()
      resolve(false)
    })
  })
}

async function runTests() {
  console.log('🚀 IPv6 Database Connection Diagnostic')
  console.log('='.repeat(50))
  
  // Test basic network connectivity
  const ipv6Works = await testIPv6Connection()
  await testIPv4Connection()
  
  console.log('\n📊 Test Results:')
  console.log('='.repeat(30))
  
  if (ipv6Works) {
    console.log('✅ IPv6 network connectivity: WORKING')
    console.log('✅ Can reach Supabase host on port 5432')
    console.log('\n🎯 Next steps:')
    console.log('   1. IPv6 network connection is working')
    console.log('   2. The issue might be with Prisma IPv6 support')
    console.log('   3. Try different connection options in DATABASE_URL')
    console.log('   4. Check if Node.js/Prisma needs IPv6 configuration')
  } else {
    console.log('❌ IPv6 network connectivity: FAILED')
    console.log('❌ Cannot reach Supabase host')
    console.log('\n🔧 Troubleshooting:')
    console.log('   1. Check Windows IPv6 configuration')
    console.log('   2. Verify firewall allows IPv6 outbound connections')
    console.log('   3. Test from different network (mobile hotspot)')
    console.log('   4. Contact ISP about IPv6 support')
  }
  
  return ipv6Works
}

runTests()
  .then(success => {
    if (success) {
      console.log('\n🎉 IPv6 connectivity confirmed!')
      process.exit(0)
    } else {
      console.log('\n❌ IPv6 connectivity issues detected')
      process.exit(1)
    }
  })
  .catch(error => {
    console.error('❌ Test execution failed:', error)
    process.exit(1)
  })