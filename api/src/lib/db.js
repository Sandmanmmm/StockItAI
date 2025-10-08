/**
 * Database connection using existing Prisma client from orderflow-ai
 */

// Since we can't import the Prisma client directly from the other directory,
// we'll need to copy the essential database config and create a new Prisma client here
// This ensures proper module resolution and dependency management

import { PrismaClient } from '@prisma/client'
import { withPrismaRetry, createRetryablePrismaClient, prismaOperation } from './prismaRetryWrapper.js'

// Prisma client singleton
let prisma
const PRISMA_CLIENT_VERSION = 'v3_pooler_directurl' // Increment to force recreation

// Initialize Prisma client - FORCED REBUILD v2
async function initializePrisma() {
  try {
    console.log(`🔍 [v2] initializePrisma called, current prisma:`, prisma ? 'exists' : 'null')
    
    // FORCE RECREATION: Always recreate to ensure new code is used
    if (prisma) {
      console.log(`🔄 Force disconnecting old Prisma client (version upgrade to ${PRISMA_CLIENT_VERSION})`)
      try {
        await prisma.$disconnect()
      } catch (e) {
        console.warn(`⚠️ Error disconnecting old client:`, e.message)
      }
      prisma = null
    }
    
    if (!prisma) {
      console.log(`🔧 Creating new PrismaClient...`)
      console.log(`📊 Environment check:`)
      console.log(`   DATABASE_URL present: ${!!process.env.DATABASE_URL}`)
      console.log(`   DIRECT_URL present: ${!!process.env.DIRECT_URL}`)
      console.log(`   DATABASE_URL port: ${process.env.DATABASE_URL?.includes('5432') ? '5432 (direct)' : process.env.DATABASE_URL?.includes('6543') ? '6543 (pooler)' : 'unknown'}`)
      console.log(`   DIRECT_URL port: ${process.env.DIRECT_URL?.includes('5432') ? '5432 (direct)' : process.env.DIRECT_URL?.includes('6543') ? '6543 (pooler)' : 'unknown'}`)
      
      prisma = new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
        errorFormat: 'pretty',
        // REMOVED: datasources override - let Prisma use schema.prisma configuration
        // This allows directUrl (DIRECT_URL env var) to be used for connection pooling
        // DATABASE_URL: Direct connection for migrations (port 5432)
        // DIRECT_URL: Transaction pooler for runtime queries (port 6543)
      })
      console.log(`✅ PrismaClient created - using schema datasource config (pooler: port 6543)`)
    }
    
    // CRITICAL: ALWAYS verify connection, even if client exists
    // In serverless, cached clients may have disconnected engines
    console.log(`🔌 Verifying Prisma engine connection...`)
    let connectAttempts = 0
    const maxAttempts = 3
    
    while (connectAttempts < maxAttempts) {
      try {
        // Force reconnect attempt
        await prisma.$connect()
        console.log(`✅ Prisma $connect() succeeded (attempt ${connectAttempts + 1})`)
        
        // CRITICAL: Wait for engine to fully initialize after connection
        // Under concurrent load, engines need MORE time to stabilize
        // Increased from 300ms → 1000ms → 2000ms due to concurrent workflow crashes
        // Multiple workflows creating product drafts simultaneously cause engine overload
        const engineWarmupDelay = 2000 // 2 seconds warmup (was 1000ms - still too short under load!)
        console.log(`⏳ Waiting ${engineWarmupDelay}ms for engine warmup...`)
        await new Promise(resolve => setTimeout(resolve, engineWarmupDelay))
        
        // CRITICAL: Verify engine is ready with test query
        // Under load, skip multiple test queries to reduce connection strain
        console.log(`🔍 Verifying engine readiness with test query...`)
        
        // Single test query with even more generous retry (was 5 attempts)
        // Under concurrent load, health check itself can fail due to pool exhaustion
        await withPrismaRetry(
          () => prisma.$queryRaw`SELECT 1 as healthcheck`,
          { operationName: 'Engine health check', maxRetries: 8, initialDelayMs: 500 }
        )
        
        console.log(`✅ Engine verified - ready for queries`)
        break // Success!
      } catch (error) {
        connectAttempts++
        console.error(`⚠️ Connection attempt ${connectAttempts} failed:`, error.message)
        if (connectAttempts >= maxAttempts) {
          // Last resort: destroy and recreate client
          console.error(`💀 All connection attempts failed, recreating client...`)
          try {
            await prisma.$disconnect()
          } catch (e) {
            console.error(`⚠️ Disconnect failed:`, e.message)
          }
          prisma = null // Force recreation on next call
          throw new Error(`Failed to connect Prisma engine after ${maxAttempts} attempts`)
        }
        // Wait before retry with longer delays for cold starts (500ms, 1000ms, 1500ms)
        const retryDelay = 500 * connectAttempts
        console.log(`⏳ Waiting ${retryDelay}ms before retry ${connectAttempts + 1}...`)
        await new Promise(resolve => setTimeout(resolve, retryDelay))
      }
    }

    if (!prisma) {
      throw new Error('Prisma client is null after initialization')
    }

    // Handle graceful shutdown (only register once)
    if (!prisma._handlersRegistered) {
      process.on('beforeExit', async () => {
        await prisma.$disconnect()
      })

      process.on('SIGINT', async () => {
        await prisma.$disconnect()
        process.exit(0)
      })

      process.on('SIGTERM', async () => {
        await prisma.$disconnect()
        process.exit(0)
      })
      
      prisma._handlersRegistered = true
    }

    console.log(`✅ Returning prisma client, type:`, typeof prisma)
    return prisma
  } catch (error) {
    console.error(`❌ FATAL ERROR in initializePrisma:`, error)
    console.error(`❌ Error stack:`, error.stack)
    throw error
  }
}

// Database utility functions
export const db = {
  // Get Prisma client instance (async to ensure connection)
  async getClient() {
    return await initializePrisma()
  },
  
  // Synchronous getter for backward compatibility (but may not be connected)
  get client() {
    // Return existing client if available, otherwise create new one
    if (prisma) {
      return prisma
    }
    // If no client exists, create one synchronously (but it won't be connected yet)
    console.warn(`⚠️ Accessing client synchronously - connection may not be established`)
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
      errorFormat: 'pretty'
    })
    return prisma
  },

  // Test database connection
  async testConnection() {
    try {
      await this.client.$queryRaw`SELECT 1`
      return { success: true, message: 'Database connection successful' }
    } catch (error) {
      console.error('Database connection failed:', error)
      return { success: false, error: error.message }
    }
  },

  // Helper functions for authenticated operations
  // Note: These methods expect merchant context to be passed from authenticated routes
  
  // Get merchant by shop domain (used by auth middleware)
  async getMerchantByShop(shopDomain) {
    try {
      const merchant = await this.client.merchant.findUnique({
        where: { shopDomain },
        include: {
          sessions: {
            where: { shop: shopDomain },
            orderBy: { updatedAt: 'desc' },
            take: 1
          }
        }
      })
      return merchant
    } catch (error) {
      console.error('Failed to get merchant by shop:', error)
      return null
    }
  },

  // Create or update merchant during OAuth flow
  async upsertMerchant(shopData, sessionData) {
    try {
      const merchant = await this.client.merchant.upsert({
        where: { shopDomain: shopData.domain },
        create: {
          shopDomain: shopData.domain,
          name: shopData.name || shopData.domain,
          email: shopData.email,
          phone: shopData.phone,
          address: shopData.address,
          timezone: shopData.timezone,
          currency: shopData.currency || 'USD',
          status: 'active'
        },
        update: {
          name: shopData.name || undefined,
          email: shopData.email || undefined,
          phone: shopData.phone || undefined,
          address: shopData.address || undefined,
          timezone: shopData.timezone || undefined,
          currency: shopData.currency || undefined,
          status: 'active',
          updatedAt: new Date()
        }
      })

      // Create or update session separately
      await this.client.session.upsert({
        where: { shop: sessionData.shop },
        create: {
          shop: sessionData.shop,
          state: sessionData.state,
          isOnline: sessionData.isOnline || false,
          scope: sessionData.scope,
          expires: sessionData.expires,
          accessToken: sessionData.accessToken,
          userId: sessionData.userId,
          firstName: sessionData.firstName,
          lastName: sessionData.lastName,
          email: sessionData.email,
          accountOwner: sessionData.accountOwner || false,
          locale: sessionData.locale,
          collaborator: sessionData.collaborator || false,
          emailVerified: sessionData.emailVerified || false,
          merchantId: merchant.id
        },
        update: {
          state: sessionData.state,
          isOnline: sessionData.isOnline,
          scope: sessionData.scope,
          expires: sessionData.expires,
          accessToken: sessionData.accessToken,
          userId: sessionData.userId,
          firstName: sessionData.firstName,
          lastName: sessionData.lastName,
          email: sessionData.email,
          accountOwner: sessionData.accountOwner,
          locale: sessionData.locale,
          collaborator: sessionData.collaborator,
          emailVerified: sessionData.emailVerified,
          updatedAt: new Date()
        }
      })

      return merchant
    } catch (error) {
      console.error('Failed to upsert merchant:', error)
      throw error
    }
  },

  // Get current merchant from authenticated context
  async getCurrentMerchant(shopDomain = null) {
    try {
      const client = this.client
      
      if (shopDomain) {
        // If shop domain is provided (from auth context), use it
        const merchant = await client.merchant.findUnique({
          where: { shopDomain },
          include: {
            sessions: {
              where: {
                OR: [
                  { expires: { gt: new Date() } },
                  { expires: null }
                ]
              },
              orderBy: { updatedAt: 'desc' },
              take: 1
            }
          }
        })

        return merchant
      }
      
      // Fallback: return the first active merchant
      const merchant = await client.merchant.findFirst({
        where: { status: 'active' },
        include: {
          sessions: {
            where: {
              OR: [
                { expires: { gt: new Date() } },
                { expires: null }
              ]
            },
            orderBy: { updatedAt: 'desc' },
            take: 1
          }
        }
      })

      return merchant || {
        id: 1,
        shopDomain: 'development-shop.myshopify.com',
        name: 'Development Shop',
        email: 'dev@example.com',
        status: 'active'
      }
    } catch (error) {
      console.error('Failed to get current merchant:', error)
      // Return a mock merchant to prevent API errors in development
      return {
        id: 1,
        shopDomain: 'development-shop.myshopify.com', 
        name: 'Development Shop',
        email: 'dev@example.com',
        status: 'active'
      }
    }
  }
}

// Export retry utilities for direct use
export { withPrismaRetry, createRetryablePrismaClient, prismaOperation }

export default db