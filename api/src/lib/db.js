/**
 * Database connection using existing Prisma client from orderflow-ai
 */

// Since we can't import the Prisma client directly from the other directory,
// we'll need to copy the essential database config and create a new Prisma client here
// This ensures proper module resolution and dependency management

import { PrismaClient } from '@prisma/client'
import { withPrismaRetry, createRetryablePrismaClient } from './prismaRetryWrapper.js'

// Prisma client singleton
let prisma
let rawPrisma // underlying Prisma client before proxy wrapping
let prismaVersion = null
let isConnecting = false // Connection lock to prevent concurrent initialization
let connectionPromise = null // Store the connection promise for concurrent requests
let healthCheckPromise = null // Lock for concurrent health checks
let warmupComplete = false // Track if engine warmup is complete
let warmupPromise = null // Promise for warmup completion
let clientDeprecationWarned = false
const PRISMA_CLIENT_VERSION = 'v5_transaction_recovery' // Increment to force recreation

// Increase process listener limit for Prisma reconnections
process.setMaxListeners(20)

// Helper to detect fatal Prisma errors that require reconnection
function isFatalPrismaError(error) {
  const errorMessage = error?.message || ''
  const errorCode = error?.code
  
  // PostgreSQL transaction abortion
  if (errorMessage.includes('25P02') || errorMessage.includes('current transaction is aborted')) {
    console.error(`🚨 Fatal: Transaction aborted (25P02)`)
    return true
  }
  
  // Engine crashed or stopped responding
  if (errorMessage.includes('Response from the Engine was empty')) {
    console.error(`🚨 Fatal: Prisma engine crashed`)
    return true
  }
  
  // Connection closed
  if (errorMessage.includes('Connection is closed') || errorCode === 'P1017') {
    console.error(`🚨 Fatal: Connection closed`)
    return true
  }
  
  // Network/timeout errors - can't reach database server
  if (errorMessage.includes("Can't reach database server") || 
      errorMessage.includes('connect ETIMEDOUT') ||
      errorMessage.includes('connect ECONNREFUSED')) {
    console.error(`🚨 Fatal: Network/timeout error - database unreachable`)
    return true
  }
  
  return false
}

async function prismaOperationInternal(operation, operationName = 'Database operation') {
  if (typeof operation !== 'function') {
    throw new Error('prismaOperation requires a function argument')
  }

  let retries = 0
  const maxRetries = 2
  
  while (retries <= maxRetries) {
    try {
      const client = await initializePrisma()
      const execute = () => operation(client)
      return await withPrismaRetry(execute, { operationName })
    } catch (error) {
      const errorMessage = error.message || ''
      const isEngineError = 
        errorMessage.includes('Response from the Engine was empty') ||
        errorMessage.includes('Engine is not yet connected') ||
        errorMessage.includes('Connection is closed')
      
      if (isEngineError && retries < maxRetries) {
        console.warn(`⚠️ Engine failure during ${operationName}, reconnecting... (attempt ${retries + 1}/${maxRetries})`)
        await forceDisconnect()
        retries++
        continue
      }
      
      throw error
    }
  }
}

// Force disconnect and clear client (for error recovery)
async function forceDisconnect() {
  if (prisma || rawPrisma) {
    console.log(`🔌 Force disconnecting Prisma client...`)
    try {
      await (rawPrisma ?? prisma)?.$disconnect()
    } catch (e) {
      console.warn(`⚠️ Error during force disconnect:`, e.message)
    }
    prisma = null
    rawPrisma = null
    prismaVersion = null
    isConnecting = false
    connectionPromise = null
    healthCheckPromise = null // Clear health check lock
    warmupComplete = false // Reset warmup state
    warmupPromise = null
    console.log(`✅ Client cleared, next request will create fresh connection`)
  }
}

// Initialize Prisma client - CONCURRENT-SAFE v5 with TRANSACTION RECOVERY
async function initializePrisma() {
  try {
    console.log(`🔍 [v5] initializePrisma called, current prisma:`, prisma ? 'exists' : 'null', `isConnecting: ${isConnecting}`)
    
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
      await forceDisconnect()
    }
    
    // If another request is already reconnecting, wait for it
    if (isConnecting && connectionPromise) {
      console.log(`⏳ Another request is reconnecting, waiting...`)
      await connectionPromise
      console.log(`✅ Reconnection completed by other request`)
      // Recursively call to do health check on new client
      return await initializePrisma()
    }
    
    // WARMUP GATE: If client exists but warmup not complete, wait for it
    if (prisma && !warmupComplete && warmupPromise) {
      console.log(`⏳ Engine warming up, waiting for warmup to complete...`)
      await warmupPromise
      console.log(`✅ Engine warmup completed, proceeding with query`)
      return prisma
    }
    
    // Reuse existing client if version matches AND it's fully connected AND warmed up
    if (prisma && prismaVersion === PRISMA_CLIENT_VERSION && warmupComplete) {
      // If another request is already health-checking, wait for its result
      if (healthCheckPromise) {
        console.log(`⏳ Another request is health-checking, waiting...`)
        const healthCheckResult = await healthCheckPromise
        
        // If health check returned null, it failed and client was disconnected
        if (healthCheckResult === null) {
          console.log(`⚠️ Health check failed, will reconnect`)
          // Don't wait for isConnecting here - just recursively call
          // This will create new client or wait for existing connection
          return await initializePrisma()
        }
        
        console.log(`✅ Health check completed by other request - client is healthy`)
        // Check if client still exists after wait (might have been disconnected)
        if (!prisma) {
          console.log(`⚠️ Client was disconnected during health check, will reconnect`)
          return await initializePrisma()
        }
        return prisma
      }
      
      // Run health check with lock to prevent concurrent checks
      healthCheckPromise = (async () => {
        try {
          // CRITICAL: Check if client still exists before health check
          // It might have been nulled by another concurrent request
          if (!rawPrisma || !prisma) {
            throw new Error('Client was disconnected before health check could run')
          }
          
          // CRITICAL FIX: Wait for warmup before health check
          // Health check must use same warmup state as actual queries
          if (!warmupComplete && warmupPromise) {
            console.log(`⏳ [HEALTH CHECK] Waiting for warmup to complete...`)
            await warmupPromise
          }
          
          // Use simple query that tests engine directly
          // $queryRaw bypasses extension but tests the same engine path
          await rawPrisma.$queryRaw`SELECT 1 as health`
          
          console.log(`✅ Reusing existing Prisma client (version ${PRISMA_CLIENT_VERSION})`)
          console.log(`✅ Reused client health check passed`)
          healthCheckPromise = null // Clear lock
          return prisma // Client is healthy!
        } catch (error) {
          console.warn(`⚠️ Existing client health check failed:`, error.message)
          
          // Clear health check lock immediately
          healthCheckPromise = null
          
          // ANY failure on reused client = force reconnect and recreate
          console.log(`🔄 Forcing full reconnect due to failed health check`)
          await forceDisconnect()
          
          // Don't throw - fall through to create new client
          // This prevents cascading failures when health check fails
          console.log(`♻️ Will create fresh client after health check failure`)
          return null // Signal that reconnection is needed
        }
      })()
      
      const healthCheckResult = await healthCheckPromise
      
      // If health check returned null, client needs recreation
      if (healthCheckResult === null) {
        console.log(`🔄 Health check indicated reconnection needed, creating new client...`)
        // Fall through to creation logic below
      } else {
        return healthCheckResult // Client is healthy, return it
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
          
          // Limit connection pool size for serverless (prevent pool exhaustion)
          // Supabase free tier: 60 max connections
          // With many serverless instances, keep pool small per instance
          // Increased from 3 to 5 to reduce contention while staying safe
          const connectionLimit = parseInt(process.env.PRISMA_CONNECTION_LIMIT || '5', 10)
          const connectionTimeout = parseInt(process.env.PRISMA_CONNECTION_TIMEOUT || '10', 10)
          console.log(`   Connection pool limit: ${connectionLimit}`)
          console.log(`   Connection timeout: ${connectionTimeout}s`)
          
          // Build DATABASE_URL with connection pool parameters
          let databaseUrl = process.env.DATABASE_URL
          if (databaseUrl && !databaseUrl.includes('connection_limit')) {
            const separator = databaseUrl.includes('?') ? '&' : '?'
            databaseUrl = `${databaseUrl}${separator}connection_limit=${connectionLimit}&pool_timeout=${connectionTimeout}`
            console.log(`   📊 Applied connection pool settings to URL`)
          }
          
          rawPrisma = new PrismaClient({
            log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
            errorFormat: 'pretty',
            datasources: {
              db: {
                url: databaseUrl
              }
            }
          })
          prismaVersion = PRISMA_CLIENT_VERSION
          console.log(`✅ PrismaClient created - using schema datasource config (pooler: port 6543)`)
          
          // Connect immediately after creation
          await rawPrisma.$connect()
          console.log(`✅ Prisma $connect() succeeded`)
          
          // Increased warmup time for serverless cold starts with concurrent requests
          const warmupDelayMs = parseInt(process.env.PRISMA_WARMUP_MS || '2500', 10)
          console.log(`⏳ Waiting ${warmupDelayMs}ms for engine warmup...`)
          
          // Set warmup promise to allow other requests to wait
          warmupPromise = (async () => {
            await new Promise(resolve => setTimeout(resolve, warmupDelayMs))
            
            // Quick verification with retry logic
            let verified = false
            for (let i = 0; i < 3; i++) {
              try {
                await rawPrisma.$queryRaw`SELECT 1 as healthcheck`
                console.log(`✅ Engine verified - ready for queries`)
                verified = true
                break
              } catch (error) {
                if (i < 2) {
                  console.warn(`⚠️ Verification attempt ${i + 1}/3 failed, retrying in 500ms...`)
                  await new Promise(resolve => setTimeout(resolve, 500))
                } else {
                  console.error(`❌ Engine verification failed after 3 attempts:`, error.message)
                  throw error
                }
              }
            }
            
            // Mark warmup complete after verification succeeds
            warmupComplete = true
            console.log(`✅ Warmup complete - engine ready for production queries`)
          })()
          
          // Wait for warmup to complete before continuing
          await warmupPromise

          // CRITICAL: Use Prisma Client Extensions (v5+) to intercept ALL queries
          // This ensures warmup is complete before any operation
          // Note: $use() middleware was deprecated in Prisma 5.x, replaced with $extends()
          const extendedPrisma = rawPrisma.$extends({
            name: 'warmupGuard',
            query: {
              $allModels: {
                async $allOperations({ model, operation, args, query }) {
                  // Ensure engine is warmed up before EVERY operation
                  if (!warmupComplete) {
                    if (warmupPromise) {
                      console.log(`⏳ [EXTENSION] Waiting for warmup before ${model}.${operation}...`)
                      await warmupPromise
                    } else {
                      // Warmup not complete but no promise - likely mid-reconnect
                      // Wait a bit and check again (reconnection in progress)
                      console.warn(`⚠️ [EXTENSION] Warmup not complete and no promise - waiting for reconnect to finish...`)
                      await new Promise(resolve => setTimeout(resolve, 100))
                      
                      // Check again after waiting
                      if (!warmupComplete && warmupPromise) {
                        console.log(`⏳ [EXTENSION] Reconnect detected, waiting for new warmup before ${model}.${operation}...`)
                        await warmupPromise
                      } else if (!warmupComplete) {
                        console.warn(`⚠️ [EXTENSION] Still no warmup promise after wait - proceeding with caution for ${model}.${operation}`)
                      }
                    }
                  }
                  
                  // CRITICAL FIX: Skip retry logic for transaction operations
                  // Transactions have strict timeouts (8s) and retries can cause them to timeout
                  // resulting in "Transaction not found" errors
                  // The warmup wait above is sufficient for transaction operations
                  const isTransactionOperation = args?.__prismaTransactionContext !== undefined
                  
                  if (isTransactionOperation) {
                    // Inside a transaction - execute immediately without retries
                    // The transaction timeout is too short for retry delays
                    return await query(args)
                  }
                  
                  // Add retry logic at extension level for non-transaction operations
                  // Reduced to 2 retries to fit within serverless 10s timeout
                  // Total retry time: 500ms + 1000ms = 1.5s max
                  const maxRetries = 2
                  let lastError
                  
                  for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                      return await query(args)
                    } catch (error) {
                      lastError = error
                      const errorMessage = error?.message || ''
                      
                      // Check for engine warmup errors
                      if (errorMessage.includes('Engine is not yet connected') || 
                          errorMessage.includes('Response from the Engine was empty')) {
                        
                        if (attempt < maxRetries) {
                          const delay = 500 * attempt
                          console.warn(
                            `⚠️ [EXTENSION] ${model}.${operation} attempt ${attempt}/${maxRetries} ` +
                            `failed with engine error. Retrying in ${delay}ms...`
                          )
                          await new Promise(resolve => setTimeout(resolve, delay))
                          continue
                        }
                        
                        console.error(
                          `❌ [EXTENSION] ${model}.${operation} failed after ${maxRetries} attempts`
                        )
                      }
                      
                      throw error
                    }
                  }
                  
                  throw lastError
                }
              }
            }
          })
          
          console.log(`✅ Prisma Client Extension installed - all queries will wait for warmup`)

          // Use the extended client instead of raw client for the proxy wrapper
          prisma = createRetryablePrismaClient(extendedPrisma)
          
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
        await rawPrisma?.$disconnect()
      })

      process.on('SIGINT', async () => {
        await rawPrisma?.$disconnect()
        process.exit(0)
      })

      process.on('SIGTERM', async () => {
        await rawPrisma?.$disconnect()
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
export const prismaOperation = prismaOperationInternal

export const db = {
  // Get Prisma client instance (async to ensure connection)
  async getClient() {
    return await initializePrisma()
  },
  
  // Synchronous getter for backward compatibility (but may not be connected)
  get client() {
    const allowLegacyAccess = process.env.ALLOW_LEGACY_DB_CLIENT === '1'

    if (process.env.NODE_ENV === 'production' && !allowLegacyAccess) {
      throw new Error('Direct db.client access is disabled. Use await db.getClient() or prismaOperation instead.')
    }

    if (!clientDeprecationWarned) {
      console.warn('⚠️  db.client getter is deprecated. Use await db.getClient() or prismaOperation to ensure warmup-aware access.')
      clientDeprecationWarned = true
    }

    // Return existing client if available, otherwise create new one
    if (prisma) {
      // Add error handler to detect fatal errors and force reconnect
      if (!prisma._errorHandlerAttached) {
        prisma._errorHandlerAttached = true
        
        // Wrap $queryRaw to catch fatal errors
        const originalQueryRaw = prisma.$queryRaw.bind(prisma)
        prisma.$queryRaw = async (...args) => {
          try {
            return await originalQueryRaw(...args)
          } catch (error) {
            if (isFatalPrismaError(error)) {
              console.error(`🚨 Fatal Prisma error detected, forcing reconnect`)
              await forceDisconnect()
            }
            throw error
          }
        }
      }
      return prisma
    }
    // If no client exists, create one synchronously (but it won't be connected yet)
    console.warn(`⚠️ Accessing client synchronously - connection may not be established`)
    rawPrisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
      errorFormat: 'pretty'
    })
    prismaVersion = PRISMA_CLIENT_VERSION
    prisma = createRetryablePrismaClient(rawPrisma)
    return prisma
  },

  // Test database connection
  async testConnection() {
    try {
      const client = await this.getClient()
      await client.$queryRaw`SELECT 1`
      return { success: true, message: 'Database connection successful' }
    } catch (error) {
      console.error('Database connection failed:', error)
      return { success: false, error: error.message }
    }
  },

  // Lightweight raw query helper used by legacy services that expect
  // a pg-style response ({ rows, rowCount }).
  async query(sql, params = []) {
    const client = await this.getClient()

    const executeQuery = async () => {
      const result = Array.isArray(params) && params.length > 0
        ? await client.$queryRawUnsafe(sql, ...params)
        : await client.$queryRawUnsafe(sql)

      const rows = Array.isArray(result) ? result : []
      return {
        rows,
        rowCount: rows.length
      }
    }

    try {
      return await withPrismaRetry(executeQuery, { operationName: 'db.query' })
    } catch (error) {
      if (isFatalPrismaError(error)) {
        await forceDisconnect()
      }
      throw error
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

      // Create default AI settings if they don't exist
      const existingAISettings = await this.client.aISettings.findUnique({
        where: { merchantId: merchant.id }
      })

      if (!existingAISettings) {
        console.log(`📝 Creating default AI settings for new merchant: ${merchant.shopDomain}`)
        await this.client.aISettings.create({
          data: {
            merchantId: merchant.id,
            confidenceThreshold: 0.8,
            autoApproveHigh: false,
            strictMatching: true,
            learningMode: true,
            enableOCR: true,
            enableNLP: true,
            enableAutoMapping: true,
            primaryModel: 'gpt-5-nano',
            fallbackModel: 'gpt-4o-mini',
            maxRetries: 3,
            autoMatchSuppliers: true,
            notifyOnErrors: true,
            notifyOnLowConfidence: true,
            notifyOnNewSuppliers: true
          }
        })
        console.log(`✅ Default AI settings created for merchant: ${merchant.shopDomain}`)
      }

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
export { withPrismaRetry, createRetryablePrismaClient }

const prismaWarmupPromise = initializePrisma().catch(error => {
  console.error('❌ Initial Prisma warmup failed:', error)
  throw error
})

await prismaWarmupPromise
export default db