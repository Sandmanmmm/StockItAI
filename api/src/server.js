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
dotenv.config({ path: '../orderflow-ai/.env' })

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
      frameAncestors: ["'self'", "https://*.shopify.com", "https://*.myshopify.com"]
    }
  }
}))
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'http://localhost:3003', // Allow API server to serve React app
    'https://clear-ontario-awesome-track.trycloudflare.com' // Allow Cloudflare tunnel
  ],
  credentials: true
}))
app.use(morgan('combined'))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Import authentication middleware
import { verifyShopifyRequest, devBypassAuth, generateAuthUrl, handleAuthCallback } from './lib/auth.js'

// Import route handlers
import purchaseOrdersRouter from './routes/purchaseOrders.js'
import uploadRouter from './routes/upload.js'

// Register route handlers
app.use('/api/purchase-orders', process.env.NODE_ENV === 'development' ? devBypassAuth : verifyShopifyRequest, purchaseOrdersRouter)
app.use('/api/upload', process.env.NODE_ENV === 'development' ? devBypassAuth : verifyShopifyRequest, uploadRouter)

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
app.get('/api/merchant/data/dashboard-summary', process.env.NODE_ENV === 'development' ? devBypassAuth : verifyShopifyRequest, async (req, res) => {
  try {
    console.log('Dashboard summary requested for merchant:', req.merchant.shopDomain)
    
    // Mock dashboard data for now - replace with real database queries
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

// Webhook endpoints for Shopify
app.post('/api/webhooks/app/uninstalled', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Verify webhook authenticity
    const hmac = req.get('X-Shopify-Hmac-Sha256')
    const body = req.body
    const shop = req.get('X-Shopify-Shop-Domain')

    // In a full implementation, verify the HMAC
    // const generatedHash = crypto.createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET)
    //   .update(body, 'utf8')
    //   .digest('base64')

    console.log(`App uninstalled from shop: ${shop}`)
    
    // Clean up merchant data if needed
    // await db.client.merchant.update({
    //   where: { shopDomain: shop },
    //   data: { status: 'uninstalled' }
    // })

    res.status(200).send('OK')
  } catch (error) {
    console.error('Webhook error:', error)
    res.status(500).send('Error processing webhook')
  }
})
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
// Start server
app.listen(PORT, () => {
  console.log('API Server running on port', PORT)
  console.log('Health check: http://localhost:' + PORT + '/api/health')
  console.log('Environment:', process.env.NODE_ENV || 'development')
})
