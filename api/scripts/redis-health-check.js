#!/usr/bin/env node
/**
 * Redis Health Check Script
 */

import Redis from 'ioredis'

async function healthCheck() {
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    connectTimeout: 5000,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3
  })

  try {
    console.log('🔍 Running Redis health check...')
    
    // Test basic connectivity
    const pong = await redis.ping()
    console.log(`✅ Ping: ${pong}`)
    
    // Test write/read operations
    const testKey = 'health:check:' + Date.now()
    await redis.set(testKey, 'test-value', 'EX', 60)
    const testValue = await redis.get(testKey)
    console.log(`✅ Write/Read: ${testValue === 'test-value' ? 'OK' : 'FAILED'}`)
    
    // Get server info
    const info = await redis.info()
    const lines = info.split('\n')
    
    const uptime = lines.find(line => line.startsWith('uptime_in_days:'))?.split(':')[1]?.trim()
    const memory = lines.find(line => line.startsWith('used_memory_human:'))?.split(':')[1]?.trim()
    const clients = lines.find(line => line.startsWith('connected_clients:'))?.split(':')[1]?.trim()
    
    console.log(`📊 Uptime: ${uptime} days`)
    console.log(`💾 Memory: ${memory}`)
    console.log(`👥 Clients: ${clients}`)
    
    // Test pub/sub
    const subscriber = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD
    })
    
    await new Promise((resolve) => {
      subscriber.subscribe('health:test')
      subscriber.on('message', (channel, message) => {
        if (channel === 'health:test' && message === 'test') {
          console.log('✅ Pub/Sub: OK')
          resolve()
        }
      })
      redis.publish('health:test', 'test')
    })
    
    await redis.del(testKey)
    await redis.disconnect()
    await subscriber.disconnect()
    
    console.log('🎉 Redis health check passed!')
    process.exit(0)
    
  } catch (error) {
    console.error('❌ Redis health check failed:', error.message)
    process.exit(1)
  }
}

healthCheck()
