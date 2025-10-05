/**
 * Shopify Webhook Routes
 * Production-ready webhook endpoints with proper middleware stack
 */

import express from 'express'
import { 
  webhookRateLimit,
  webhookAuthentication, 
  webhookValidation,
  webhookLogging,
  webhookErrorHandler,
  rawBodyParser
} from '../middleware/webhookAuth.js'
import { webhookService } from '../../lib/webhookService.js'

const router = express.Router()

// Apply middleware stack to all webhook routes
router.use(webhookRateLimit)
router.use(rawBodyParser)
router.use(webhookAuthentication)
router.use(webhookValidation)
router.use(webhookLogging)

/**
 * Order Webhooks
 */

// Order created
router.post('/orders/created', async (req, res) => {
  try {
    const result = await webhookService.processWebhook(
      'orders/created',
      req.body,
      {
        'x-shopify-topic': req.get('X-Shopify-Topic'),
        'x-shopify-shop-domain': req.get('X-Shopify-Shop-Domain'),
        'x-shopify-webhook-id': req.get('X-Shopify-Webhook-Id')
      }
    )
    
    res.status(200).json({
      success: true,
      message: 'Order created webhook processed',
      jobId: result.jobId
    })
    
  } catch (error) {
    console.error('Order created webhook error:', error.message)
    res.status(500).json({
      success: false,
      error: 'Failed to process order created webhook',
      message: error.message
    })
  }
})

// Order updated
router.post('/orders/updated', async (req, res) => {
  try {
    const result = await webhookService.processWebhook(
      'orders/updated',
      req.body,
      {
        'x-shopify-topic': req.get('X-Shopify-Topic'),
        'x-shopify-shop-domain': req.get('X-Shopify-Shop-Domain'),
        'x-shopify-webhook-id': req.get('X-Shopify-Webhook-Id')
      }
    )
    
    res.status(200).json({
      success: true,
      message: 'Order updated webhook processed',
      jobId: result.jobId
    })
    
  } catch (error) {
    console.error('Order updated webhook error:', error.message)
    res.status(500).json({
      success: false,
      error: 'Failed to process order updated webhook',
      message: error.message
    })
  }
})

// Order cancelled
router.post('/orders/cancelled', async (req, res) => {
  try {
    const result = await webhookService.processWebhook(
      'orders/cancelled',
      req.body,
      {
        'x-shopify-topic': req.get('X-Shopify-Topic'),
        'x-shopify-shop-domain': req.get('X-Shopify-Shop-Domain'),
        'x-shopify-webhook-id': req.get('X-Shopify-Webhook-Id')
      }
    )
    
    res.status(200).json({
      success: true,
      message: 'Order cancelled webhook processed',
      jobId: result.jobId
    })
    
  } catch (error) {
    console.error('Order cancelled webhook error:', error.message)
    res.status(500).json({
      success: false,
      error: 'Failed to process order cancelled webhook',
      message: error.message
    })
  }
})

/**
 * Product Webhooks
 */

// Product created
router.post('/products/create', async (req, res) => {
  try {
    const result = await webhookService.processWebhook(
      'products/create',
      req.body,
      {
        'x-shopify-topic': req.get('X-Shopify-Topic'),
        'x-shopify-shop-domain': req.get('X-Shopify-Shop-Domain'),
        'x-shopify-webhook-id': req.get('X-Shopify-Webhook-Id')
      }
    )
    
    res.status(200).json({
      success: true,
      message: 'Product created webhook processed',
      jobId: result.jobId
    })
    
  } catch (error) {
    console.error('Product created webhook error:', error.message)
    res.status(500).json({
      success: false,
      error: 'Failed to process product created webhook',
      message: error.message
    })
  }
})

// Product updated
router.post('/products/update', async (req, res) => {
  try {
    const result = await webhookService.processWebhook(
      'products/update',
      req.body,
      {
        'x-shopify-topic': req.get('X-Shopify-Topic'),
        'x-shopify-shop-domain': req.get('X-Shopify-Shop-Domain'),
        'x-shopify-webhook-id': req.get('X-Shopify-Webhook-Id')
      }
    )
    
    res.status(200).json({
      success: true,
      message: 'Product updated webhook processed',
      jobId: result.jobId
    })
    
  } catch (error) {
    console.error('Product updated webhook error:', error.message)
    res.status(500).json({
      success: false,
      error: 'Failed to process product updated webhook',
      message: error.message
    })
  }
})

/**
 * Inventory Webhooks
 */

// Inventory levels updated
router.post('/inventory_levels/update', async (req, res) => {
  try {
    const result = await webhookService.processWebhook(
      'inventory_levels/update',
      req.body,
      {
        'x-shopify-topic': req.get('X-Shopify-Topic'),
        'x-shopify-shop-domain': req.get('X-Shopify-Shop-Domain'),
        'x-shopify-webhook-id': req.get('X-Shopify-Webhook-Id')
      }
    )
    
    res.status(200).json({
      success: true,
      message: 'Inventory updated webhook processed',
      jobId: result.jobId
    })
    
  } catch (error) {
    console.error('Inventory updated webhook error:', error.message)
    res.status(500).json({
      success: false,
      error: 'Failed to process inventory updated webhook',
      message: error.message
    })
  }
})

/**
 * App Webhooks
 */

// App uninstalled
router.post('/app/uninstalled', async (req, res) => {
  try {
    const result = await webhookService.processWebhook(
      'app/uninstalled',
      req.body,
      {
        'x-shopify-topic': req.get('X-Shopify-Topic'),
        'x-shopify-shop-domain': req.get('X-Shopify-Shop-Domain'),
        'x-shopify-webhook-id': req.get('X-Shopify-Webhook-Id')
      }
    )
    
    res.status(200).json({
      success: true,
      message: 'App uninstalled webhook processed',
      jobId: result.jobId
    })
    
  } catch (error) {
    console.error('App uninstalled webhook error:', error.message)
    res.status(500).json({
      success: false,
      error: 'Failed to process app uninstalled webhook',
      message: error.message
    })
  }
})

/**
 * Webhook Health Check
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Webhook endpoints are healthy',
    timestamp: new Date().toISOString(),
    supportedWebhooks: [
      'orders/created',
      'orders/updated',
      'orders/cancelled', 
      'products/create',
      'products/update',
      'inventory_levels/update',
      'app/uninstalled'
    ]
  })
})

/**
 * Webhook Statistics
 */
router.get('/stats', async (req, res) => {
  try {
    // This would get webhook processing statistics
    const stats = {
      totalProcessed: 0,
      successRate: 0,
      averageProcessingTime: 0,
      queueDepth: 0
    }
    
    res.status(200).json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Webhook stats error:', error.message)
    res.status(500).json({
      success: false,
      error: 'Failed to get webhook statistics',
      message: error.message
    })
  }
})

// Apply error handler last
router.use(webhookErrorHandler)

export default router