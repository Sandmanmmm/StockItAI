import express from 'express'
import { verifyShopifyRequest } from '../lib/auth.js'
import { redisManager } from '../lib/redisManager.js'
import { db } from '../lib/db.js'

const router = express.Router()

/**
 * SSE-specific authentication middleware
 * EventSource cannot send custom headers, so we use shop domain from query params
 * and verify against active merchants in the database
 */
async function verifySSEConnection(req, res, next) {
  try {
    const shop = req.query.shop
    
    if (!shop) {
      console.warn('🔐 SSE Auth rejected: missing shop parameter')
      return res.status(401).json({ error: 'Missing shop parameter' })
    }
    
    // Get merchant from database
    const prisma = await db.getClient()
    const merchant = await prisma.merchant.findFirst({
      where: {
        OR: [
          { shopDomain: shop },
          { shopDomain: `${shop}.myshopify.com` }
        ],
        status: 'active'
      }
    })
    
    if (!merchant) {
      console.warn(`🔐 SSE Auth rejected: merchant not found for shop ${shop}`)
      return res.status(401).json({ error: 'Unauthorized merchant' })
    }
    
    // Add merchant to request (same as verifyShopifyRequest)
    req.merchant = merchant
    req.shop = merchant
    req.shopDomain = merchant.shopDomain
    
    console.log(`🔐 SSE Auth success for merchant ${merchant.id} (${merchant.shopDomain})`)
    next()
  } catch (error) {
    console.error('SSE authentication error:', error)
    return res.status(500).json({ error: 'Authentication failed' })
  }
}

/**
 * SSE endpoint for real-time updates
 * GET /api/realtime/events?shop=example.myshopify.com
 */
router.get('/events', verifySSEConnection, async (req, res) => {
  const merchantId = req.merchant.id
  
  console.log(`📡 SSE connection established for merchant: ${merchantId} (${req.merchant.shopDomain})`)
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering
  
  // Send initial connection message
  res.write(`data: ${JSON.stringify({ 
    type: 'connected', 
    merchantId,
    timestamp: Date.now() 
  })}\n\n`)
  
  // Create Redis subscriber for this connection
  const subscriber = redisManager.createSubscriber()
  const channels = [
    `merchant:${merchantId}:progress`,
    `merchant:${merchantId}:stage`,
    `merchant:${merchantId}:completion`,
    `merchant:${merchantId}:error`
  ]
  
  try {
    await subscriber.subscribe(...channels)
    console.log(`✅ Subscribed to channels:`, channels)
    
    // Forward Redis messages to SSE client
    subscriber.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message)
        
        // Send as SSE event
        if (data.type) {
          res.write(`event: ${data.type}\n`)
        }
        res.write(`data: ${message}\n\n`)
        
        console.log(`📤 Sent SSE event [${channel}]:`, data.type)
      } catch (error) {
        console.error('❌ SSE message error:', error)
      }
    })
    
    // Heartbeat to keep connection alive (every 15s)
    const heartbeat = setInterval(() => {
      res.write(`: heartbeat ${Date.now()}\n\n`)
    }, 15000)
    
    // Cleanup on client disconnect
    req.on('close', () => {
      console.log(`🔌 SSE disconnected for merchant: ${merchantId}`)
      clearInterval(heartbeat)
      subscriber.unsubscribe(...channels)
      subscriber.disconnect()
      res.end()
    })
    
  } catch (error) {
    console.error('❌ SSE setup error:', error)
    res.status(500).end()
  }
})

export default router
