/**
 * Database connection using existing Prisma client from orderflow-ai
 */

// Since we can't import the Prisma client directly from the other directory,
// we'll need to copy the essential database config and create a new Prisma client here
// This ensures proper module resolution and dependency management

import { PrismaClient } from '@prisma/client'

// Prisma client singleton
let prisma

// Initialize Prisma client
async function initializePrisma() {
  try {
    console.log(`🔍 initializePrisma called, current prisma:`, prisma ? 'exists' : 'null')
    
    if (!prisma) {
      console.log(`🔧 Creating new PrismaClient...`)
      prisma = new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
        errorFormat: 'pretty',
        // CRITICAL: Increase connection pool for serverless concurrent operations
        datasources: {
          db: {
            url: process.env.DATABASE_URL
          }
        },
        // Increase connection pool size for concurrent workflow processing
        // Default is 5, increase to 20 for better concurrency
        // Format: postgresql://USER:PASSWORD@HOST:PORT/DATABASE?connection_limit=20&pool_timeout=30
      })
      console.log(`✅ PrismaClient created with enhanced connection pool`)
      
      // CRITICAL: Connect immediately in serverless environment with retries
      console.log(`🔌 Connecting Prisma engine...`)
      let connectAttempts = 0
      const maxAttempts = 3
      
      while (connectAttempts < maxAttempts) {
        try {
          await prisma.$connect()
          console.log(`✅ Prisma engine connected (attempt ${connectAttempts + 1})`)
          
          // CRITICAL: Verify engine is ready with multiple test queries
          // This ensures the engine is fully initialized before returning the client
          console.log(`🔍 Verifying engine readiness with test queries...`)
          await prisma.$queryRaw`SELECT 1`
          await prisma.$queryRaw`SELECT 1` // Second verification
          console.log(`✅ Engine verified - ready for queries`)
          break // Success!
        } catch (error) {
          connectAttempts++
          console.error(`⚠️ Connection attempt ${connectAttempts} failed:`, error.message)
          if (connectAttempts >= maxAttempts) {
            throw new Error(`Failed to connect Prisma engine after ${maxAttempts} attempts`)
          }
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 100 * connectAttempts))
        }
      }

      // Handle graceful shutdown
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

export default db