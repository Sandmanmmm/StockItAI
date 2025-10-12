/**
 * Prisma Retry Wrapper
 * 
 * Handles transient "Engine is not yet connected" errors in serverless environments
 * by wrapping Prisma operations with exponential backoff retry logic.
 * 
 * Usage:
 *   const result = await withPrismaRetry(() => prisma.purchaseOrder.update({...}))
 */

/**
 * Sleep utility for retry delays
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Check if an error is a transient Prisma connection error that should be retried
 */
function isRetryableError(error) {
  if (!error) return false
  
  const errorMessage = error.message || ''
  const errorString = String(error)
  
  // Patterns that indicate transient connection issues
  const retryablePatterns = [
    'Engine is not yet connected',
    'Response from the Engine was empty',
    'Can\'t reach database server',
    'Connection pool timeout',
    'Timed out fetching a new connection from the connection pool',
    'Error in Prisma Client request',
    'connect ECONNREFUSED'
  ]
  
  return retryablePatterns.some(pattern => 
    errorMessage.includes(pattern) || errorString.includes(pattern)
  )
}

/**
 * Wrap a Prisma operation with retry logic
 * 
 * @param {Function} operation - Async function that performs Prisma operation
 * @param {Object} options - Retry configuration
 * @param {number} options.maxRetries - Maximum number of retry attempts (default: 5)
 * @param {number} options.initialDelayMs - Initial delay in milliseconds (default: 200)
 * @param {number} options.maxDelayMs - Maximum delay in milliseconds (default: 3000)
 * @param {string} options.operationName - Name for logging (optional)
 * @returns {Promise<any>} - Result of the operation
 * @throws {Error} - Final error if all retries exhausted
 */
export async function withPrismaRetry(operation, options = {}) {
  const {
    maxRetries = 5,
    initialDelayMs = 200,
    maxDelayMs = 3000,
    operationName = 'Prisma operation'
  } = options
  
  let lastError
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Attempt the operation
      const result = await operation()
      
      // Log success if this wasn't the first attempt
      if (attempt > 0) {
        console.log(`✅ [RETRY] ${operationName} succeeded on attempt ${attempt + 1}`)
      }
      
      return result
    } catch (error) {
      lastError = error
      
      // Check if this is a retryable error
      if (!isRetryableError(error)) {
        // Not a retryable error - log as debug/info since caller will handle it
        // (Reduces noise for expected errors like transaction timeouts)
        console.log(`🔄 [RETRY] ${operationName} encountered non-retryable error (caller will handle):`, error.message)
        throw error
      }
      
      // Check if we have retries left
      if (attempt === maxRetries - 1) {
        // No more retries - fail
        console.error(`❌ [RETRY] ${operationName} failed after ${maxRetries} attempts:`, error.message)
        throw error
      }
      
      // Calculate exponential backoff delay: initialDelay * 2^attempt
      // Example: 100ms, 200ms, 400ms, 800ms, 1600ms (capped at maxDelayMs)
      const exponentialDelay = initialDelayMs * Math.pow(2, attempt)
      const delay = Math.min(exponentialDelay, maxDelayMs)
      
      console.warn(
        `⚠️ [RETRY] ${operationName} attempt ${attempt + 1}/${maxRetries} failed: ${error.message}. ` +
        `Retrying in ${delay}ms...`
      )
      
      await sleep(delay)
    }
  }
  
  // Should never reach here, but TypeScript likes it
  throw lastError
}

/**
 * Create a wrapped Prisma client where all common operations have retry logic
 * 
 * @param {PrismaClient} prisma - Prisma client instance
 * @returns {Object} - Wrapped client with retry logic
 */
export function createRetryablePrismaClient(prisma) {
  // This is a lightweight wrapper that adds retry logic to the most common operations
  // For methods not wrapped, the original prisma client is still accessible
  
  return new Proxy(prisma, {
    get(target, prop) {
      const originalValue = target[prop]
      
      // If accessing a model (e.g., prisma.purchaseOrder)
      if (typeof originalValue === 'object' && originalValue !== null) {
        // Wrap the model's methods
        return new Proxy(originalValue, {
          get(modelTarget, modelProp) {
            const modelMethod = modelTarget[modelProp]
            
            // Wrap common CRUD methods with retry logic
            const methodsToWrap = [
              'create', 'createMany',
              'update', 'updateMany', 'upsert',
              'delete', 'deleteMany',
              'findUnique', 'findFirst', 'findMany',
              'count', 'aggregate', 'groupBy'
            ]
            
            if (typeof modelMethod === 'function' && methodsToWrap.includes(modelProp)) {
              // Return wrapped method with retry logic
              return async function(...args) {
                return withPrismaRetry(
                  () => modelMethod.apply(modelTarget, args),
                  { operationName: `${String(prop)}.${String(modelProp)}` }
                )
              }
            }
            
            return modelMethod
          }
        })
      }
      
      // Wrap $queryRaw and $executeRaw
      if (prop === '$queryRaw' || prop === '$executeRaw') {
        return async function(...args) {
          return withPrismaRetry(
            () => originalValue.apply(target, args),
            { operationName: String(prop) }
          )
        }
      }
      
      // Return original value for everything else
      return originalValue
    }
  })
}

/**
 * Convenience wrapper for individual operations (for gradual migration)
 * 
 * Example:
 *   await prismaOperation(
 *     () => prisma.purchaseOrder.update({ where: { id }, data }),
 *     'Update PO'
 *   )
 */
export async function prismaOperation(operation, operationName = 'Database operation') {
  return withPrismaRetry(operation, { operationName })
}

export default {
  withPrismaRetry,
  createRetryablePrismaClient,
  prismaOperation
}
