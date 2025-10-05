/**
 * Webhook Authentication and Validation Middleware
 * Production-ready security for Shopify webhooks
 */

import crypto from 'crypto'
import rateLimit from 'express-rate-limit'
import { webhookService } from '../lib/webhookService.js'

/**
 * Rate limiting for webhook endpoints
 */
export const webhookRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many webhook requests',
    message: 'Rate limit exceeded'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use shop domain + IP for rate limiting
    const shop = req.get('X-Shopify-Shop-Domain') || req.ip
    return `webhook:${shop}`
  }
})

/**
 * Webhook authentication middleware
 */
export const webhookAuthentication = async (req, res, next) => {
  try {
    const signature = req.get('X-Shopify-Hmac-Sha256')
    const topic = req.get('X-Shopify-Topic')
    const shop = req.get('X-Shopify-Shop-Domain')
    
    if (!signature) {
      return res.status(401).json({
        error: 'Missing webhook signature',
        message: 'X-Shopify-Hmac-Sha256 header is required'
      })
    }

    if (!topic) {
      return res.status(400).json({
        error: 'Missing webhook topic',
        message: 'X-Shopify-Topic header is required'
      })
    }

    if (!shop) {
      return res.status(400).json({
        error: 'Missing shop domain',
        message: 'X-Shopify-Shop-Domain header is required'
      })
    }

    // Get webhook secret for this shop
    const webhookSecret = await getWebhookSecret(shop)
    
    if (!webhookSecret) {
      console.error(`No webhook secret found for shop: ${shop}`)
      return res.status(401).json({
        error: 'Webhook secret not configured',
        message: 'Unable to verify webhook authenticity'
      })
    }

    // Verify webhook signature
    const isValid = webhookService.verifyWebhookSignature(
      req.rawBody, 
      signature, 
      webhookSecret
    )

    if (!isValid) {
      console.error(`Invalid webhook signature from shop: ${shop}`)
      return res.status(401).json({
        error: 'Invalid webhook signature',
        message: 'Webhook authentication failed'
      })
    }

    // Add verified data to request
    req.webhook = {
      shop,
      topic,
      signature,
      verified: true
    }

    next()

  } catch (error) {
    console.error('Webhook authentication error:', error.message)
    return res.status(500).json({
      error: 'Authentication error',
      message: 'Failed to verify webhook'
    })
  }
}

/**
 * Webhook validation middleware
 */
export const webhookValidation = (req, res, next) => {
  try {
    const { topic } = req.webhook
    
    // Validate webhook topic
    const allowedTopics = [
      'orders/created',
      'orders/updated', 
      'orders/cancelled',
      'products/create',
      'products/update',
      'inventory_levels/update',
      'app/uninstalled'
    ]

    if (!allowedTopics.includes(topic)) {
      return res.status(400).json({
        error: 'Unsupported webhook topic',
        message: `Topic ${topic} is not supported`,
        supportedTopics: allowedTopics
      })
    }

    // Validate payload structure
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        error: 'Invalid payload',
        message: 'Webhook payload must be valid JSON'
      })
    }

    // Topic-specific validation
    const validation = validateTopicPayload(topic, req.body)
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid payload structure',
        message: validation.message,
        required: validation.required
      })
    }

    next()

  } catch (error) {
    console.error('Webhook validation error:', error.message)
    return res.status(500).json({
      error: 'Validation error',
      message: 'Failed to validate webhook'
    })
  }
}

/**
 * Webhook logging middleware
 */
export const webhookLogging = (req, res, next) => {
  const startTime = Date.now()
  
  // Log incoming webhook
  console.log(`📥 Webhook received: ${req.webhook.topic} from ${req.webhook.shop}`)
  
  // Override res.end to log response
  const originalEnd = res.end
  res.end = function(chunk, encoding) {
    const processingTime = Date.now() - startTime
    const statusCode = res.statusCode
    
    if (statusCode >= 200 && statusCode < 300) {
      console.log(`✅ Webhook response: ${statusCode} in ${processingTime}ms`)
    } else {
      console.error(`❌ Webhook error: ${statusCode} in ${processingTime}ms`)
    }
    
    originalEnd.call(this, chunk, encoding)
  }
  
  next()
}

/**
 * Webhook error handling middleware
 */
export const webhookErrorHandler = (error, req, res, next) => {
  console.error('Webhook error:', error.message)
  
  // Log error details
  const errorDetails = {
    error: error.message,
    shop: req.webhook?.shop,
    topic: req.webhook?.topic,
    timestamp: new Date().toISOString()
  }
  
  console.error('Webhook error details:', errorDetails)
  
  // Return appropriate error response
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation error',
      message: error.message
    })
  }
  
  if (error.name === 'AuthenticationError') {
    return res.status(401).json({
      error: 'Authentication error', 
      message: error.message
    })
  }
  
  // Generic error response
  res.status(500).json({
    error: 'Internal server error',
    message: 'Failed to process webhook'
  })
}

/**
 * Raw body parser for webhook signature verification
 */
export const rawBodyParser = (req, res, next) => {
  let data = ''
  
  req.on('data', chunk => {
    data += chunk
  })
  
  req.on('end', () => {
    req.rawBody = data
    
    try {
      req.body = JSON.parse(data)
    } catch (error) {
      req.body = data
    }
    
    next()
  })
}

/**
 * Get webhook secret for shop
 */
async function getWebhookSecret(shopDomain) {
  try {
    // First try environment variable (for development)
    if (process.env.SHOPIFY_WEBHOOK_SECRET) {
      return process.env.SHOPIFY_WEBHOOK_SECRET
    }
    
    // Then try merchant-specific secret from database
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()
    
    const merchant = await prisma.merchant.findUnique({
      where: { shopDomain },
      select: { webhookSecret: true }
    })
    
    if (merchant?.webhookSecret) {
      const { decrypt } = await import('../utils/encryption.js')
      return decrypt(merchant.webhookSecret)
    }
    
    return null
    
  } catch (error) {
    console.error('Failed to get webhook secret:', error.message)
    return null
  }
}

/**
 * Validate topic-specific payload structure
 */
function validateTopicPayload(topic, payload) {
  switch (topic) {
    case 'orders/created':
    case 'orders/updated':
    case 'orders/cancelled':
      return validateOrderPayload(payload)
      
    case 'products/create':
    case 'products/update':
      return validateProductPayload(payload)
      
    case 'inventory_levels/update':
      return validateInventoryPayload(payload)
      
    case 'app/uninstalled':
      return { valid: true }
      
    default:
      return {
        valid: false,
        message: `Unknown topic: ${topic}`
      }
  }
}

/**
 * Validate order webhook payload
 */
function validateOrderPayload(payload) {
  const required = ['id', 'line_items', 'total_price', 'financial_status']
  
  for (const field of required) {
    if (!(field in payload)) {
      return {
        valid: false,
        message: `Missing required field: ${field}`,
        required
      }
    }
  }
  
  if (!Array.isArray(payload.line_items)) {
    return {
      valid: false,
      message: 'line_items must be an array',
      required
    }
  }
  
  return { valid: true }
}

/**
 * Validate product webhook payload
 */
function validateProductPayload(payload) {
  const required = ['id', 'title', 'variants']
  
  for (const field of required) {
    if (!(field in payload)) {
      return {
        valid: false,
        message: `Missing required field: ${field}`,
        required
      }
    }
  }
  
  if (!Array.isArray(payload.variants)) {
    return {
      valid: false,
      message: 'variants must be an array',
      required
    }
  }
  
  return { valid: true }
}

/**
 * Validate inventory webhook payload
 */
function validateInventoryPayload(payload) {
  const required = ['inventory_item_id', 'location_id', 'available']
  
  for (const field of required) {
    if (!(field in payload)) {
      return {
        valid: false,
        message: `Missing required field: ${field}`,
        required
      }
    }
  }
  
  return { valid: true }
}