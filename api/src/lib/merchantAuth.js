/**
 * Enhanced Merchant Authentication Middleware
 * Provides additional security and context for merchant job operations
 */

import { verifyShopifyRequest, devBypassAuth } from './auth.js'
import { db } from './db.js'
import { redisManager } from './redisManager.js'

/**
 * Enhanced merchant authentication with additional job-specific security
 */
export async function authenticateMerchantJobRequest(req, res, next) {
  try {
    // First run standard Shopify authentication
    await new Promise((resolve, reject) => {
      const authMiddleware = process.env.NODE_ENV === 'development' ? devBypassAuth : verifyShopifyRequest
      authMiddleware(req, res, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })

    // Additional merchant-specific validations
    if (!req.shop) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required - shop context missing'
      })
    }

    // Verify merchant has active subscription/plan
    if (req.shop.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: 'Shop account is not active'
      })
    }

    // Add rate limiting context (using Redis)
    const rateLimitKey = `rate_limit:merchant:${req.shop.id}:job_api`
    try {
      const requestCount = await redisManager.client.incr(rateLimitKey)
      if (requestCount === 1) {
        await redisManager.client.expire(rateLimitKey, 60) // Reset every minute
      }

      // Allow 100 requests per minute per merchant
      if (requestCount > 100) {
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded. Please try again later.',
          retryAfter: 60
        })
      }

      // Add rate limit info to response headers
      res.set({
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': Math.max(0, 100 - requestCount),
        'X-RateLimit-Reset': new Date(Date.now() + 60000).toISOString()
      })
    } catch (redisError) {
      // Don't fail the request if Redis is down, just log the error
      console.warn('Redis rate limiting unavailable:', redisError.message)
    }

    // Add merchant context with job permissions
    req.merchantContext = {
      merchantId: req.shop.id,
      shopDomain: req.shop.shopDomain,
      permissions: {
        canViewJobs: true,
        canRetryJobs: true,
        canCancelJobs: true,
        canViewMetrics: true
      },
      rateLimit: {
        remaining: Math.max(0, 100 - (requestCount || 0))
      }
    }

    next()
  } catch (error) {
    console.error('Enhanced merchant auth error:', error)
    return res.status(500).json({
      success: false,
      error: 'Authentication service unavailable'
    })
  }
}

/**
 * Middleware to check specific job permissions
 */
export function requireJobPermission(permission) {
  return (req, res, next) => {
    if (!req.merchantContext || !req.merchantContext.permissions[permission]) {
      return res.status(403).json({
        success: false,
        error: `Missing required permission: ${permission}`
      })
    }
    next()
  }
}

/**
 * Middleware to validate job ownership
 * Ensures merchants can only access their own jobs
 */
export async function validateJobOwnership(req, res, next) {
  try {
    const { jobId } = req.params
    if (!jobId) {
      return next() // No job ID to validate
    }

    // Check if job belongs to this merchant
    // This would typically query the database to verify job ownership
    const jobOwner = await db.client.purchaseOrder.findFirst({
      where: {
        OR: [
          { analysisJobId: jobId },
          { syncJobId: jobId }
        ],
        merchantId: req.shop.id
      }
    })

    if (!jobOwner && process.env.NODE_ENV === 'production') {
      return res.status(404).json({
        success: false,
        error: 'Job not found or access denied'
      })
    }

    next()
  } catch (error) {
    console.error('Job ownership validation error:', error)
    return res.status(500).json({
      success: false,
      error: 'Unable to validate job ownership'
    })
  }
}

/**
 * Create audit log entry for merchant job operations
 */
export function auditLogMiddleware(req, res, next) {
  const originalSend = res.send

  res.send = function(body) {
    // Log the operation after response is sent
    setImmediate(() => {
      if (req.merchantContext) {
        const logEntry = {
          timestamp: new Date().toISOString(),
          merchantId: req.merchantContext.merchantId,
          shopDomain: req.merchantContext.shopDomain,
          method: req.method,
          path: req.path,
          params: req.params,
          query: req.query,
          statusCode: res.statusCode,
          success: res.statusCode < 400,
          userAgent: req.get('User-Agent'),
          ip: req.ip
        }

        // In production, you'd want to store this in a proper audit log
        console.log('Merchant Job API Audit:', JSON.stringify(logEntry))
      }
    })

    originalSend.call(this, body)
  }

  next()
}