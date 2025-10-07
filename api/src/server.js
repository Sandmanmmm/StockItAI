/**
 * API Server for Shopify PO Sync Pro
 * Provides REST endpoints for the React frontend to communicate with the database
 */
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import dotenv from 'dotenv'
import path from 'path'
import session from 'express-session'
import { fileURLToPath } from 'url'

// Load environment variables
dotenv.config() // Load from .env in current directory
dotenv.config({ path: '../.env.local' }) // Also load from root .env.local if exists

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const app = express()
const PORT = process.env.API_PORT || 3003

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'development_session_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}))

// Middleware - Configure helmet for Shopify app embedding
app.use(helmet({
  frameguard: false, // Disable X-Frame-Options to allow Shopify embedding
  contentSecurityPolicy: {
    directives: {
      frameAncestors: ["'self'", "https://*.shopify.com", "https://*.myshopify.com"],
      imgSrc: ["'self'", "data:", "https:", "http:"], // Allow external images for product image scraping
      connectSrc: ["'self'", "https://*.supabase.co", "wss://*.supabase.co", "https://*.trycloudflare.com"] // Allow Supabase API, Realtime WebSocket, and Cloudflare tunnels
    }
  }
}))
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'http://localhost:3003', // Allow API server to serve React app
    'https://forgot-yeah-termination-intelligence.trycloudflare.com' // Allow Cloudflare tunnel
  ],
  credentials: true
}))
app.use(morgan('combined'))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Import authentication middleware
import { verifyShopifyRequest, devBypassAuth, generateAuthUrl, handleAuthCallback, adminAuth } from './lib/auth.js'

// Import route handlers
import purchaseOrdersRouter from './routes/purchaseOrders.js'
import uploadRouter from './routes/upload.js'
import workflowRouter from './routes/workflow.js'
import merchantStatusRouter from './routes/merchantStatus.js'
import merchantJobStatusRouter from './routes/merchantJobStatus.js'
import merchantDataRouter from './routes/merchantData.js'
import monitoringRouter from './routes/monitoring.js'
import analyticsRouter from './routes/analytics.js'
import deadLetterQueueRouter from './routes/deadLetterQueue.js'
import aiSettingsRouter from './routes/aiSettings.js'
import filesRouter from './routes/files.js'
import productDraftsRouter from './routes/productDrafts.js'
import refinementConfigRouter from './routes/refinementConfig.js'
import imageReviewRouter from './routes/imageReview.js'
import aiGenerationRouter from './routes/aiGeneration.js'
import securityRouter from './routes/security.js'
import suppliersRouter from './routes/suppliers.js'
import searchRouter from './routes/search.js'

// Import queue handlers (internal endpoints - no auth required)
import processUploadQueueHandler from './queues/process-upload.js'

// Import workflow system
import { workflowIntegration } from './lib/workflowIntegration.js'
import { processorRegistrationService } from './lib/processorRegistrationService.js'
import { initializeBackgroundJobs, stopBackgroundJobs } from './services/backgroundJobsService.js'

// Register route handlers
app.use('/api/purchase-orders', process.env.NODE_ENV === 'development' ? devBypassAuth : verifyShopifyRequest, purchaseOrdersRouter)
app.use('/api/upload', process.env.NODE_ENV === 'development' ? devBypassAuth : verifyShopifyRequest, uploadRouter)
app.use('/api/workflow', process.env.NODE_ENV === 'development' ? devBypassAuth : verifyShopifyRequest, workflowRouter)
app.use('/api/merchant', process.env.NODE_ENV === 'development' ? devBypassAuth : verifyShopifyRequest, merchantStatusRouter)
app.use('/api/merchant/data', process.env.NODE_ENV === 'development' ? devBypassAuth : verifyShopifyRequest, merchantDataRouter)
app.use('/api/jobs', process.env.NODE_ENV === 'development' ? devBypassAuth : verifyShopifyRequest, merchantJobStatusRouter)
app.use('/api/ai-settings', process.env.NODE_ENV === 'development' ? devBypassAuth : verifyShopifyRequest, aiSettingsRouter)
app.use('/api/product-drafts', process.env.NODE_ENV === 'development' ? devBypassAuth : verifyShopifyRequest, productDraftsRouter)
app.use('/api/refinement-config', process.env.NODE_ENV === 'development' ? devBypassAuth : verifyShopifyRequest, refinementConfigRouter)
app.use('/api/image-review', process.env.NODE_ENV === 'development' ? devBypassAuth : verifyShopifyRequest, imageReviewRouter)
app.use('/api/ai-generation', process.env.NODE_ENV === 'development' ? devBypassAuth : verifyShopifyRequest, aiGenerationRouter)
app.use('/api/security', process.env.NODE_ENV === 'development' ? devBypassAuth : verifyShopifyRequest, securityRouter)
app.use('/api/suppliers', process.env.NODE_ENV === 'development' ? devBypassAuth : verifyShopifyRequest, suppliersRouter)
app.use('/api/search', process.env.NODE_ENV === 'development' ? devBypassAuth : verifyShopifyRequest, searchRouter)
app.use('/api/files', filesRouter) // File serving doesn't need auth verification

// Queue handlers - Internal endpoints, no authentication required
app.post('/api/queues/process-upload', processUploadQueueHandler)
app.post('/api/process-upload-queue', processUploadQueueHandler) // Also support direct serverless endpoint path

// Production monitoring and analytics (admin access)
if (process.env.NODE_ENV === 'production') {
  app.use('/api/monitoring', adminAuth, monitoringRouter)
  app.use('/api/analytics', adminAuth, analyticsRouter)
  app.use('/api/dlq', adminAuth, deadLetterQueueRouter)
} else {
  // Development access without admin auth
  app.use('/api/monitoring', devBypassAuth, monitoringRouter)
  app.use('/api/analytics', devBypassAuth, analyticsRouter)
  app.use('/api/dlq', devBypassAuth, deadLetterQueueRouter)
}

// Health check endpoint (no authentication required)
app.get('/api/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      services: {
        redis: 'unknown',
        database: 'unknown',
        openai: 'unknown'
      }
    }
    
    // Check Redis health
    try {
      const { redisManager } = await import('./lib/redisManager.js')
      const redisHealth = await redisManager.healthCheck()
      health.services.redis = redisHealth.status
    } catch (error) {
      health.services.redis = 'error'
    }
    
    // Check Database health
    try {
      const { db } = await import('./lib/db.js')
      await db.raw('SELECT 1')
      health.services.database = 'healthy'
    } catch (error) {
      health.services.database = 'error'
    }
    
    // Check OpenAI service
    try {
      if (process.env.OPENAI_API_KEY) {
        health.services.openai = 'configured'
        console.log('🤖 OpenAI API Key found, length:', process.env.OPENAI_API_KEY.length)
      } else {
        health.services.openai = 'not_configured'
        console.log('❌ OpenAI API Key not found in environment variables')
      }
    } catch (error) {
      health.services.openai = 'error'
      console.error('❌ OpenAI configuration error:', error.message)
    }
    
    // Determine overall health
    const hasErrors = Object.values(health.services).includes('error')
    if (hasErrors) {
      health.status = 'degraded'
      // Return 200 for degraded status to allow continued operation
      res.status(200)
    }
    
    res.json(health)
    
  } catch (error) {
    console.error('Health check error:', error)
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    })
  }
})

// Development test endpoint
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/test/dashboard', devBypassAuth, async (req, res) => {
    try {
      const summary = {
        totalPOs: 45,
        pendingPOs: 12,
        activeSuppliersCount: 8,
        lastSyncTime: new Date().toISOString(),
        syncStatus: 'active',
        upcomingJobs: 3,
        alertsCount: 2,
        merchantId: req.merchant?.id || 'test-merchant',
        shopDomain: req.merchant?.shopDomain || 'test-store.myshopify.com'
      }
      res.json(summary)
    } catch (error) {
      console.error('Test dashboard error:', error)
      res.status(500).json({ error: 'Failed to fetch test dashboard summary' })
    }
  })

  // Development endpoints that match the React app requirements
  app.get('/api/merchant/data/dashboard-summary', devBypassAuth, async (req, res) => {
    try {
      const summary = {
        totalPOs: 45,
        pendingPOs: 12,
        activeSuppliersCount: 8,
        lastSyncTime: new Date().toISOString(),
        syncStatus: 'active',
        upcomingJobs: 3,
        alertsCount: 2,
        merchantId: req.merchant.id,
        shopDomain: req.merchant.shopDomain
      }
      res.json({ success: true, data: summary })
    } catch (error) {
      console.error('Dashboard summary error:', error)
      res.status(500).json({ success: false, error: 'Failed to fetch dashboard summary' })
    }
  })

  app.get('/api/merchant/data/suppliers', devBypassAuth, async (req, res) => {
    try {
      const suppliers = [
        {
          id: 1,
          name: "Acme Corp",
          email: "orders@acme.com",
          status: "active",
          lastSync: new Date().toISOString(),
          totalPOs: 15,
          pendingPOs: 3
        },
        {
          id: 2,
          name: "Global Supplies Inc",
          email: "po@globalsupplies.com",
          status: "active",
          lastSync: new Date(Date.now() - 3600000).toISOString(),
          totalPOs: 22,
          pendingPOs: 5
        },
        {
          id: 3,
          name: "Quality Products Ltd",
          email: "orders@qualityproducts.com",
          status: "pending",
          lastSync: new Date(Date.now() - 86400000).toISOString(),
          totalPOs: 8,
          pendingPOs: 4
        }
      ]
      res.json({ success: true, data: suppliers })
    } catch (error) {
      console.error('Suppliers error:', error)
      res.status(500).json({ success: false, error: 'Failed to fetch suppliers' })
    }
  })

  app.get('/api/merchant/data/supplier-metrics', devBypassAuth, async (req, res) => {
    try {
      const metrics = {
        totalSuppliers: 8,
        activeSuppliers: 6,
        pendingSuppliers: 2,
        avgResponseTime: "2.3 hours",
        successRate: 94.5,
        lastWeekPOs: 23,
        thisWeekPOs: 18,
        monthlyTrend: [
          { month: "Nov", pos: 45 },
          { month: "Dec", pos: 52 },
          { month: "Jan", pos: 38 }
        ]
      }
      res.json({ success: true, data: metrics })
    } catch (error) {
      console.error('Supplier metrics error:', error)
      res.status(500).json({ success: false, error: 'Failed to fetch supplier metrics' })
    }
  })

  app.get('/api/merchant/data/notifications', devBypassAuth, async (req, res) => {
    try {
      const notifications = [
        {
          id: 1,
          type: "success",
          title: "PO Sync Complete",
          message: "Successfully synced 5 purchase orders with Acme Corp",
          timestamp: new Date().toISOString(),
          read: false
        },
        {
          id: 2,
          type: "warning",
          title: "Supplier Response Delayed",
          message: "Global Supplies Inc hasn't responded to PO #12345 in 24 hours",
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          read: false
        },
        {
          id: 3,
          type: "info",
          title: "New Supplier Added",
          message: "Quality Products Ltd has been added to your supplier network",
          timestamp: new Date(Date.now() - 86400000).toISOString(),
          read: true
        }
      ]
      res.json({ success: true, data: notifications })
    } catch (error) {
      console.error('Notifications error:', error)
      res.status(500).json({ success: false, error: 'Failed to fetch notifications' })
    }
  })
}

// Static files - serve the React app
app.use(express.static(path.join(__dirname, '../dist')))

// Shopify authentication routes
app.get('/', (req, res) => {
  // In development, check if build exists, otherwise show dev message
  const indexPath = path.join(__dirname, '../dist/index.html')
  // Check if the built React app exists
  try {
    res.sendFile(indexPath)
  } catch (error) {
    // Fallback for when React app isn't built yet
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>PO Manager Pro - Building...</title>
        <link rel="stylesheet" href="https://unpkg.com/@shopify/polaris@12.0.0/build/esm/styles.css">
      </head>
      <body>
        <div style="padding: 40px; text-align: center; font-family: -apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif;">
          <h1>🚀 PO Manager Pro</h1>
          <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 16px; border-radius: 8px; margin: 20px auto; max-width: 500px;">
            <h3>⚠️ React App Not Built</h3>
            <p>Please run <code>npm run build</code> in the root directory to build the React application.</p>
            <p>Current API server is running on port ${PORT}</p>
          </div>
        </div>
      </body>
      </html>
    `)
  }
})
// Auth callback route for Shopify OAuth
app.get('/auth/callback', handleAuthCallback)
app.get('/auth/shopify/callback', handleAuthCallback)
app.get('/api/auth/callback', handleAuthCallback)

// OAuth installation route
app.get('/api/auth/install', (req, res) => {
  try {
    const { shop } = req.query
    
    if (!shop) {
      return res.status(400).json({
        success: false,
        error: 'Shop parameter is required',
        code: 'MISSING_SHOP_PARAM'
      })
    }

    const authUrl = generateAuthUrl(shop.replace('.myshopify.com', ''))
    res.json({
      success: true,
      authUrl,
      shop: shop
    })
  } catch (error) {
    console.error('Install route error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to generate installation URL',
      code: 'INSTALL_ERROR'
    })
  }
})

// Session token validation endpoint
app.post('/api/auth/verify', verifyShopifyRequest, (req, res) => {
  res.json({
    success: true,
    merchant: {
      id: req.merchant.id,
      name: req.merchant.name,
      shopDomain: req.merchant.shopDomain,
      email: req.merchant.email
    },
    shop: req.shopDomain
  })
})

// Merchant data endpoints
// Dashboard summary endpoint moved to /routes/merchantData.js for proper database integration
// app.get('/api/merchant/data/dashboard-summary', process.env.NODE_ENV === 'development' ? devBypassAuth : verifyShopifyRequest, async (req, res) => {
//   ... (moved to merchantData route for proper database queries)
// })

app.get('/api/merchant/data/suppliers', process.env.NODE_ENV === 'development' ? devBypassAuth : verifyShopifyRequest, async (req, res) => {
  try {
    console.log('Suppliers requested for merchant:', req.merchant.shopDomain)
    
    // Mock suppliers data - replace with real database queries
    const suppliers = [
      {
        id: 1,
        name: "Acme Corp",
        email: "orders@acme.com",
        status: "active",
        lastSync: new Date().toISOString(),
        totalPOs: 15,
        pendingPOs: 3
      },
      {
        id: 2,
        name: "Global Supplies Inc",
        email: "po@globalsupplies.com",
        status: "active",
        lastSync: new Date(Date.now() - 3600000).toISOString(),
        totalPOs: 22,
        pendingPOs: 5
      },
      {
        id: 3,
        name: "Quality Products Ltd",
        email: "orders@qualityproducts.com",
        status: "pending",
        lastSync: new Date(Date.now() - 86400000).toISOString(),
        totalPOs: 8,
        pendingPOs: 4
      }
    ]
    
    res.json({ success: true, data: suppliers })
  } catch (error) {
    console.error('Suppliers error:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch suppliers' })
  }
})

app.get('/api/merchant/data/supplier-metrics', process.env.NODE_ENV === 'development' ? devBypassAuth : verifyShopifyRequest, async (req, res) => {
  try {
    console.log('Supplier metrics requested for merchant:', req.merchant.shopDomain)
    
    // Mock metrics data - replace with real database queries
    const metrics = {
      totalSuppliers: 8,
      activeSuppliers: 6,
      pendingSuppliers: 2,
      avgResponseTime: "2.3 hours",
      successRate: 94.5,
      lastWeekPOs: 23,
      thisWeekPOs: 18,
      monthlyTrend: [
        { month: "Nov", pos: 45 },
        { month: "Dec", pos: 52 },
        { month: "Jan", pos: 38 }
      ]
    }
    
    res.json({ success: true, data: metrics })
  } catch (error) {
    console.error('Supplier metrics error:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch supplier metrics' })
  }
})

app.get('/api/merchant/data/notifications', process.env.NODE_ENV === 'development' ? devBypassAuth : verifyShopifyRequest, async (req, res) => {
  try {
    console.log('Notifications requested for merchant:', req.merchant.shopDomain)
    
    // Mock notifications data - replace with real database queries
    const notifications = [
      {
        id: 1,
        type: "success",
        title: "PO Sync Complete",
        message: "Successfully synced 5 purchase orders with Acme Corp",
        timestamp: new Date().toISOString(),
        read: false
      },
      {
        id: 2,
        type: "warning",
        title: "Supplier Response Delayed",
        message: "Global Supplies Inc hasn't responded to PO #12345 in 24 hours",
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        read: false
      },
      {
        id: 3,
        type: "info",
        title: "New Supplier Added",
        message: "Quality Products Ltd has been added to your supplier network",
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        read: true
      }
    ]
    
    res.json({ success: true, data: notifications })
  } catch (error) {
    console.error('Notifications error:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch notifications' })
  }
})

// Import webhook routes
import webhookRoutes from './webhooks/routes/webhookRoutes.js'

// Webhook endpoints for Shopify
app.use('/api/webhooks', webhookRoutes)
// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  })
})
// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    message: `${req.method} ${req.originalUrl} not found`
  })
})
// Global error handler
app.use((error, req, res, next) => {
  console.error('API Error:', error)
  res.status(error.status || 500).json({
    success: false,
    error: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  })
})

// Global error handling middleware (must be after all routes)
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error)
  
  // Don't expose internal errors in production
  const isDevelopment = process.env.NODE_ENV === 'development'
  
  // Determine error status code
  const statusCode = error.status || error.statusCode || 500
  
  // Prepare error response
  const errorResponse = {
    success: false,
    error: error.message || 'Internal server error',
    code: error.code || 'INTERNAL_ERROR',
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] || 'unknown'
  }
  
  // Add debugging info in development
  if (isDevelopment) {
    errorResponse.stack = error.stack
    errorResponse.details = error.details
  }
  
  res.status(statusCode).json(errorResponse)
})

// 404 handler for unknown routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    code: 'ROUTE_NOT_FOUND',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  })
})

// Process-level error handlers for production stability
process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error)
  // Log error but don't crash in development
  if (process.env.NODE_ENV === 'production') {
    console.error('⚠️ Server will restart due to uncaught exception')
    process.exit(1)
  }
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason)
  // Log error but don't crash in development
  if (process.env.NODE_ENV === 'production') {
    console.error('⚠️ Server will restart due to unhandled rejection')
    process.exit(1)
  }
})

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  console.log('🔴 SIGTERM received - shutting down gracefully...')
  
  try {
    // Stop background jobs
    stopBackgroundJobs()
    console.log('✅ Background jobs stopped')
  } catch (error) {
    console.error('❌ Error stopping background jobs:', error)
  }
  
  try {
    // Close workflow system
    await workflowIntegration.shutdown()
    console.log('✅ Workflow system shutdown complete')
  } catch (error) {
    console.error('❌ Error during workflow shutdown:', error)
  }
  
  try {
    // Close queue processors
    await processorRegistrationService.cleanup()
    console.log('✅ Queue processors cleanup complete')
  } catch (error) {
    console.error('❌ Error during processor cleanup:', error)
  }
  
  try {
    // Close Redis connections
    const { redisManager } = await import('./lib/redisManager.js')
    await redisManager.disconnect()
    console.log('✅ Redis connections closed')
  } catch (error) {
    console.error('❌ Error closing Redis:', error)
  }
  
  console.log('✅ Graceful shutdown complete')
  process.exit(0)
})

// Start server
app.listen(PORT, async () => {
  console.log('API Server running on port', PORT)
  console.log('Health check: http://localhost:' + PORT + '/api/health')
  console.log('Environment:', process.env.NODE_ENV || 'development')
  
  // Initialize workflow orchestration system
  try {
    console.log('🚀 Initializing Workflow Orchestration System...')
    await workflowIntegration.initialize()
    console.log('✅ Workflow Orchestration System initialized successfully')
    
    // Initialize queue processors
    console.log('🔧 Starting Queue Processors...')
    await processorRegistrationService.initializeAllProcessors()
    console.log('✅ All Queue Processors started successfully')
  } catch (error) {
    console.error('❌ Failed to initialize Workflow System:', error)
    console.warn('⚠️ Server will continue without workflow orchestration')
  }
  
  // Initialize background jobs
  try {
    console.log('⏰ Initializing Background Jobs...')
    initializeBackgroundJobs()
    console.log('✅ Background Jobs initialized successfully')
  } catch (error) {
    console.error('❌ Failed to initialize Background Jobs:', error)
    console.warn('⚠️ Server will continue without background jobs')
  }
})
