#!/usr/bin/env node

/**
 * Simple database connectivity test
 */

import pkg from 'pg'
import dotenv from 'dotenv'

const { Client } = pkg
dotenv.config()

async function testDirectConnection() {
  console.log('🔄 Testing direct PostgreSQL connection...')
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  })
  
  try {
    await client.connect()
    console.log('✅ Direct PostgreSQL connection successful')
    
    const result = await client.query('SELECT version();')
    console.log('📊 Database version:', result.rows[0].version)
    
    await client.end()
    return true
    
  } catch (error) {
    console.error('❌ Direct connection failed:', error.message)
    console.error('Connection string:', process.env.DATABASE_URL?.replace(/:[^:]*@/, ':****@'))
    return false
  }
}

testDirectConnection()
  .then(success => {
    if (success) {
      console.log('🎯 Database is accessible!')
      process.exit(0)
    } else {
      console.log('❌ Database connectivity issues')
      process.exit(1)
    }
  })
  .catch(error => {
    console.error('Test execution failed:', error)
    process.exit(1)
  })