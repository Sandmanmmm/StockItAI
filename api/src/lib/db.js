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
let prismaVersion = null
let isConnecting = false // Connection lock to prevent concurrent initialization
let connectionPromise = null // Store the connection promise for concurrent requests
const PRISMA_CLIENT_VERSION = 'v4_concurrent_safe' // Increment to force recreation

// Increase process listener limit for Prisma reconnections
process.setMaxListeners(20)

// Initialize Prisma client - CONCURRENT-SAFE v4
async function initializePrisma() {
  try {
    console.log(`🔍 [v4] initializePrisma called, current prisma:`, prisma ? 'exists' : 'null', `isConnecting: ${isConnecting}`)
    
    // If another request is already connecting, wait for it to complete
    if (isConnecting && connectionPromise) {
      console.log(`⏳ Another request is connecting, waiting...`)
      await connectionPromise
      console.log(`✅ Connection completed by other request, returning existing client`)
      return prisma
    }
    
    // Only recreate if version changed (not on every call)
    if (prisma && prismaVersion !== PRISMA_CLIENT_VERSION) {
      console.log(`🔄 Version change detected (${prismaVersion} → ${PRISMA_CLIENT_VERSION}), disconnecting old client`)
      try {
        await prisma.$disconnect()
      } catch (e) {
        console.warn(`⚠️ Error disconnecting old client:`, e.message)
      }
      prisma = null
      prismaVersion = null
    }
    
    // Reuse existing client if version matches AND it's fully connected
    if (prisma && prismaVersion === PRISMA_CLIENT_VERSION) {
      console.log(`✅ Reusing existing Prisma client (version ${PRISMA_CLIENT_VERSION})`)
      // Quick health check - if it fails, we'll reconnect
      try {
        await prisma.$queryRaw`SELECT 1 as healthcheck`
        return prisma // Client is healthy!
      } catch (error) {
        console.warn(`⚠️ Existing client health check failed, reconnecting:`, error.message)
        prisma = null // Force recreation
      }
    }
    
    if (!prisma) {
      // Set connection lock and create promise that other requests can wait on
      isConnecting = true
      connectionPromise = (async () => {
        try {
          console.log(`🔧 Creating new PrismaClient (version ${PRISMA_CLIENT_VERSION})...`)
          console.log(`📊 Environment check:`)
          console.log(`   DATABASE_URL present: ${!!process.env.DATABASE_URL}`)
          console.log(`   DIRECT_URL present: ${!!process.env.DIRECT_URL}`)
          console.log(`   DATABASE_URL port: ${process.env.DATABASE_URL?.includes('5432') ? '5432 (direct)' : process.env.DATABASE_URL?.includes('6543') ? '6543 (pooler)' : 'unknown'}`)
          console.log(`   DIRECT_URL port: ${process.env.DIRECT_URL?.includes('5432') ? '5432 (direct)' : process.env.DIRECT_URL?.includes('6543') ? '6543 (pooler)' : 'unknown'}`)
          
          prisma = new PrismaClient({
            log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
            errorFormat: 'pretty',
          })
          prismaVersion = PRISMA_CLIENT_VERSION
          console.log(`✅ PrismaClient created - using schema datasource config (pooler: port 6543)`)
          
          // Connect immediately after creation
          await prisma.$connect()
          console.log(`✅ Prisma $connect() succeeded`)
          
          // Reduced warmup time since we already verified connection
          console.log(`⏳ Waiting 500ms for engine warmup...`)
          await new Promise(resolve => setTimeout(resolve, 500))
          
          // Quick verification
          await prisma.$queryRaw`SELECT 1 as healthcheck`
          console.log(`✅ Engine verified - ready for queries`)
          
          return prisma
        } finally {
          isConnecting = false
          connectionPromise = null
        }
      })()
      
      await connectionPromise
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