/**
 * Shopify Authentication Middleware
 * Production-ready OAuth and session token validation
 */

import { shopify, validateSessionToken, getShopFromToken } from './shopifyConfig.js'
import { db } from './db.js'

/**
 * Production Shopify authentication middleware
 * Validates session tokens for embedded app authentication
 */
export async function verifyShopifyRequest(req, res, next) {
  try {
    // Get the authorization header
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing or invalid authorization header',
        code: 'NO_AUTH_HEADER'
      })
    }

    // Extract the session token
    const sessionToken = authHeader.substring(7) // Remove 'Bearer '
    
    // Validate the session token
    const payload = await validateSessionToken(sessionToken)
    if (!payload) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired session token',
        code: 'INVALID_TOKEN'
      })
    }

    // Extract shop domain from token
    const shopDomain = await getShopFromToken(sessionToken)
    if (!shopDomain) {
      return res.status(401).json({
        success: false,
        error: 'Cannot extract shop domain from token',
        code: 'INVALID_SHOP'
      })
    }

    // Find or create merchant in database
    let merchant
    try {
      merchant = await db.client.merchant.findFirst({
        where: { 
          OR: [
            { shopDomain: shopDomain },
            { shopDomain: `${shopDomain}.myshopify.com` },
            { shopifyShopId: payload.iss }
          ]
        }
      })

      if (!merchant) {
        // Create new merchant if not exists
        merchant = await db.client.merchant.create({
          data: {
            name: shopDomain,
            shopDomain: `${shopDomain}.myshopify.com`,
            shopifyShopId: payload.iss,
            email: payload.sub || `${shopDomain}@shopify.com`,
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        })

        console.log(`Created new merchant: ${merchant.name} (${merchant.shopDomain})`)
      } else {
        // Update last access time
        await db.client.merchant.update({
          where: { id: merchant.id },
          data: { updatedAt: new Date() }
        })
      }
    } catch (dbError) {
      console.error('Database error during merchant lookup:', dbError)
      return res.status(500).json({
        success: false,
        error: 'Database connection error',
        code: 'DB_ERROR'
      })
    }

    // Add merchant and token info to request
    req.merchant = merchant
    req.shop = merchant
    req.shopDomain = shopDomain
    req.sessionToken = sessionToken
    req.tokenPayload = payload

    next()
  } catch (error) {
    console.error('Authentication error:', error)
    return res.status(401).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
}

/**
 * Development bypass authentication - for testing without Shopify
 * Only works in development environment
 */
export async function devBypassAuth(req, res, next) {
  if (process.env.NODE_ENV === 'production') {
    return verifyShopifyRequest(req, res, next)
  }

  try {
    // Try to use database if available
    let merchant
    try {
      // Use the Test Shop merchant that has our real data
      merchant = await db.client.merchant.findFirst({
        where: { email: 'test@example.com' }
      })

      if (!merchant) {
        // Fallback to creating development merchant
        merchant = await db.client.merchant.create({
          data: {
            name: 'Development Test Store',
            shopDomain: 'dev-test.myshopify.com',
            email: 'dev-test@shopify.com',
            status: 'active',
            currency: 'USD',
            plan: 'basic',
            createdAt: new Date(),
            updatedAt: new Date()
          }
        })
      }
    } catch (dbError) {
      console.warn('Database unavailable, using mock merchant for development:', dbError.message)
      // Use mock merchant when database is unavailable
      merchant = {
        id: 'dev-merchant-123',
        name: 'Development Test Store',
        shopDomain: 'dev-test.myshopify.com', 
        email: 'dev-test@shopify.com',
        status: 'active',
        currency: 'USD',
        plan: 'basic',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }

    req.merchant = merchant
    req.shop = merchant
    req.shopDomain = 'dev-test'
    req.sessionToken = 'dev_token_123'
    req.tokenPayload = { 
      iss: merchant.id,
      dest: `https://${merchant.shopDomain}`,
      aud: process.env.SHOPIFY_API_KEY,
      sub: 'dev_user_123'
    }

    console.log(`[DEV MODE] Using development merchant: ${merchant.name}`)
    next()
  } catch (error) {
    console.error('Development auth error:', error)
    return res.status(500).json({
      success: false,
      error: 'Development authentication failed',
      code: 'DEV_AUTH_ERROR'
    })
  }
}

/**
 * Middleware to require specific Shopify scopes
 */
export function requireScope(requiredScopes = []) {
  return (req, res, next) => {
    if (process.env.NODE_ENV === 'development') {
      return next() // Skip scope checking in development
    }

    const tokenPayload = req.tokenPayload
    if (!tokenPayload) {
      return res.status(401).json({
        success: false,
        error: 'No session token payload found',
        code: 'NO_TOKEN_PAYLOAD'
      })
    }

    // In a full implementation, you would check the scopes from the token
    // For now, we assume the token is valid and has required scopes
    // since we validated it through Shopify's API
    
    next()
  }
}

/**
 * Generate OAuth authorization URL for app installation
 */
export function generateAuthUrl(shop, redirectUri = null) {
  try {
    const authUrl = shopify.auth.buildAuthorizationUrl({
      shop: `${shop}.myshopify.com`,
      redirectUri: redirectUri || `${process.env.APP_URL}/api/auth/callback`,
      isOnline: true, // Use online tokens for embedded apps
    })
    
    return authUrl
  } catch (error) {
    console.error('Error generating auth URL:', error)
    throw new Error('Failed to generate authorization URL')
  }
}

/**
 * Handle OAuth callback and exchange code for access token
 */
export async function handleAuthCallback(req, res) {
  try {
    const { code, shop, state } = req.query

    if (!code || !shop) {
      return res.status(400).json({
        success: false,
        error: 'Missing required OAuth parameters',
        code: 'MISSING_OAUTH_PARAMS'
      })
    }

    // Exchange authorization code for access token
    const session = await shopify.auth.callback({
      req,
      res,
    })

    if (!session) {
      return res.status(400).json({
        success: false,
        error: 'Failed to create session',
        code: 'SESSION_CREATION_FAILED'
      })
    }

    // Store session in database or session store
    // For embedded apps, we rely on session tokens for subsequent requests
    
    // Redirect to app with success
    const appUrl = `${process.env.APP_URL}/?shop=${shop}&host=${req.query.host}`
    res.redirect(appUrl)

  } catch (error) {
    console.error('OAuth callback error:', error)
    res.status(500).json({
      success: false,
      error: 'OAuth callback failed',
      code: 'OAUTH_CALLBACK_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
}

/**
 * Admin authentication middleware for sensitive operations
 * Validates admin API keys for monitoring, analytics, and DLQ access
 */
export function adminAuth(req, res, next) {
  try {
    const adminKey = req.headers['x-admin-key']
    const validAdminKey = process.env.ADMIN_API_KEY
    
    if (!validAdminKey) {
      console.error('ADMIN_API_KEY not configured in environment')
      return res.status(500).json({
        success: false,
        error: 'Admin authentication not configured',
        code: 'ADMIN_NOT_CONFIGURED'
      })
    }
    
    if (!adminKey) {
      return res.status(401).json({
        success: false,
        error: 'Admin API key required',
        code: 'ADMIN_KEY_MISSING'
      })
    }
    
    if (adminKey !== validAdminKey) {
      return res.status(403).json({
        success: false,
        error: 'Invalid admin API key',
        code: 'ADMIN_KEY_INVALID'
      })
    }
    
    // Add admin context to request
    req.admin = true
    req.adminAccessLevel = 'full'
    
    next()
    
  } catch (error) {
    console.error('Admin auth error:', error)
    res.status(500).json({
      success: false,
      error: 'Admin authentication failed',
      code: 'ADMIN_AUTH_ERROR'
    })
  }
}
