/**
 * Production Session Store Configuration
 * Uses Upstash Redis as primary store with Prisma as fallback
 */

import session from 'express-session'
import RedisStore from 'connect-redis'
import { redisManager } from '../lib/redisManager.js'
import { PrismaSessionStore } from '../lib/prismaSessionStore.js'

/**
 * Create production-ready session store
 * Priority: Upstash Redis > Prisma > Memory (dev only)
 */
export async function createSessionStore() {
  const environment = process.env.NODE_ENV || 'development'
  
  // Development: Allow in-memory sessions
  if (environment === 'development' && !process.env.FORCE_PERSISTENT_SESSIONS) {
    console.log('⚠️  Using in-memory session store (development only)')
    return null // express-session will use MemoryStore by default
  }

  try {
    // Primary: Try Upstash Redis (serverless, fast, production-ready)
    if (process.env.REDIS_HOST || process.env.UPSTASH_REDIS_HOST) {
      console.log('🔄 Initializing Redis session store (Upstash)...')
      
      // Wait for Redis to be ready
      await redisManager.waitForConnection(10000)
      
      if (redisManager.isConnected && redisManager.redis) {
        const redisStore = new RedisStore({
          client: redisManager.redis,
          prefix: 'sess:',
          ttl: 86400, // 24 hours in seconds
          disableTouch: false, // Allow session refresh on activity
          disableTTL: false,
        })
        
        console.log('✅ Redis session store initialized (Upstash)')
        return redisStore
      }
    }
    
    // Fallback: Prisma session store
    console.log('⚠️  Redis unavailable, falling back to Prisma session store')
    const prismaStore = new PrismaSessionStore()
    console.log('✅ Prisma session store initialized')
    return prismaStore
    
  } catch (error) {
    console.error('❌ Failed to initialize session store:', error)
    
    // Last resort: Prisma
    if (environment === 'production') {
      console.log('🔄 Attempting Prisma session store as last resort...')
      try {
        const prismaStore = new PrismaSessionStore()
        console.log('✅ Prisma session store initialized (fallback)')
        return prismaStore
      } catch (prismaError) {
        console.error('❌ Prisma session store failed:', prismaError)
        throw new Error('Cannot initialize session store - production requires persistent sessions')
      }
    }
    
    // Development only: Allow memory store
    console.log('⚠️  Falling back to in-memory session store (NOT PRODUCTION SAFE)')
    return null
  }
}

/**
 * Get session configuration for express-session
 */
export function getSessionConfig(store) {
  const isProd = process.env.NODE_ENV === 'production'
  
  return {
    store,
    secret: process.env.SESSION_SECRET || 'development_session_secret_change_in_production',
    resave: false,
    saveUninitialized: false,
    name: 'sessionId', // Custom name (default is 'connect.sid')
    cookie: {
      secure: isProd, // HTTPS only in production
      httpOnly: true, // Prevent XSS attacks
      maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
      sameSite: isProd ? 'none' : 'lax', // 'none' required for Shopify embedded apps
      domain: isProd ? process.env.COOKIE_DOMAIN : undefined,
    },
    rolling: true, // Refresh session expiry on each request
    proxy: isProd, // Trust first proxy (needed for Vercel, Railway, etc.)
  }
}

/**
 * Session cleanup job - runs every hour to remove expired sessions
 */
export async function cleanupExpiredSessions() {
  try {
    const prismaStore = new PrismaSessionStore()
    const deleted = await prismaStore.cleanup()
    console.log(`🧹 Cleaned up ${deleted} expired sessions`)
    return deleted
  } catch (error) {
    console.error('❌ Session cleanup failed:', error)
    return 0
  }
}
