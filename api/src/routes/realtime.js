import express from 'express'
import { verifyShopifyRequest } from '../middleware/auth.js'
import { redisManager } from '../lib/redisManager.js'

const router = express.Router()

/**
 * SSE endpoint for real-time updates
 * GET /api/realtime/events
 */
router.get('/events', verifyShopifyRequest, async (req, res) => {
  const merchantId = req.session?.merchantId || req.query.merchantId
  
  if (!merchantId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  
  console.log(`📡 SSE connection established for merchant: ${merchantId}`)
  
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
