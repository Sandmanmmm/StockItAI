/**
 * Shopify OAuth routes
 * Handles the complete Shopify app installation and authentication flow
 */

import express from 'express'
import crypto from 'crypto'
import { db } from '../lib/db.js'

const router = express.Router()

// OAuth configuration
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET
const SHOPIFY_SCOPES = process.env.SHOPIFY_SCOPES || 'read_products,write_products,read_orders,write_orders'
const APP_URL = process.env.APP_URL || 'https://your-app.ngrok.io'

/**
 * Step 1: Shopify redirects merchant to your app's OAuth URL
 * GET /auth?shop=my-store.myshopify.com
 */
router.get('/auth', (req, res) => {
  const { shop, hmac, timestamp, ...query } = req.query

  if (!shop) {
    return res.status(400).json({ error: 'Missing shop parameter' })
  }

  // Validate shop domain format
  const shopPattern = /^[a-zA-Z0-9-]+\.myshopify\.com$/
  if (!shopPattern.test(shop)) {
    return res.status(400).json({ error: 'Invalid shop domain' })
  }

  // Generate state parameter for CSRF protection
  const state = crypto.randomBytes(32).toString('hex')
  
  // Store state in session or cache (simplified for this example)
  // In production, use proper session management
  req.session = { state, shop }

  // Build OAuth authorization URL
  const authUrl = new URL(`https://${shop}/admin/oauth/authorize`)
  authUrl.searchParams.append('client_id', SHOPIFY_API_KEY)
  authUrl.searchParams.append('scope', SHOPIFY_SCOPES)
  authUrl.searchParams.append('redirect_uri', `${APP_URL}/auth/callback`)
  authUrl.searchParams.append('state', state)

  // Redirect merchant to Shopify OAuth
  res.redirect(authUrl.toString())
})

/**
 * Step 2: Shopify sends callback with authorization code
 * GET /auth/callback?code=123456&hmac=abcd&shop=my-store.myshopify.com&state=xyz
 */
router.get('/auth/callback', async (req, res) => {
  try {
    const { code, hmac, shop, state, timestamp } = req.query

    if (!code || !shop) {
      return res.status(400).json({ error: 'Missing required parameters' })
    }

    // Verify state parameter (CSRF protection)
    // In production, retrieve from session storage
    if (!state) {
      return res.status(400).json({ error: 'Missing state parameter' })
    }

    // Verify HMAC signature
    if (!verifyShopifyHMAC(req.query, hmac)) {
      return res.status(401).json({ error: 'Invalid HMAC signature' })
    }

    // Exchange authorization code for access token
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code: code
      })
    })

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange authorization code')
    }

    const tokenData = await tokenResponse.json()

    // Get shop information
    const shopResponse = await fetch(`https://${shop}/admin/api/2023-10/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': tokenData.access_token
      }
    })

    if (!shopResponse.ok) {
      throw new Error('Failed to fetch shop information')
    }

    const { shop: shopData } = await shopResponse.json()

    // Create/update merchant and session in database
    const merchant = await db.upsertMerchant({
      domain: shop,
      name: shopData.name,
      email: shopData.email,
      phone: shopData.phone,
      address: shopData.address,
      timezone: shopData.timezone,
      currency: shopData.currency
    }, {
      shop: shop,
      state: state,
      isOnline: false, // This is an offline token
      scope: tokenData.scope,
      accessToken: tokenData.access_token,
      userId: null, // Offline session doesn't have user info
      firstName: null,
      lastName: null,
      email: shopData.email,
      accountOwner: true,
      locale: null,
      collaborator: false,
      emailVerified: false
    })

    // Set up webhooks using enhanced webhook manager
    const { setupMerchantWebhooks } = await import('../lib/webhookManager.js')
    const webhookResult = await setupMerchantWebhooks(shop, tokenData.access_token, APP_URL)
    
    if (!webhookResult.success) {
      console.error('Webhook setup failed:', webhookResult.error)
    }

    // Redirect to app with success
    const appUrl = `https://${shop}/admin/apps/${SHOPIFY_API_KEY}`
    res.redirect(appUrl)

  } catch (error) {
    console.error('OAuth callback error:', error)
    res.status(500).json({ 
      error: 'Authentication failed',
      details: error.message 
    })
  }
})

/**
 * Step 3: Handle app uninstall webhook
 * POST /auth/uninstall
 */
router.post('/uninstall', async (req, res) => {
  try {
    const hmac = req.get('X-Shopify-Hmac-Sha256')
    const body = req.body
    const shop = req.get('X-Shopify-Shop-Domain')

    // Verify webhook authenticity
    if (!verifyWebhookHMAC(body, hmac)) {
      return res.status(401).json({ error: 'Invalid webhook signature' })
    }

    // Mark merchant as uninstalled
    await db.client.merchant.update({
      where: { shopDomain: shop },
      data: { 
        status: 'uninstalled',
        uninstalledAt: new Date()
      }
    })

    console.log(`App uninstalled for shop: ${shop}`)
    res.status(200).send('OK')

  } catch (error) {
    console.error('Uninstall webhook error:', error)
    res.status(500).send('Error processing uninstall')
  }
})

/**
 * Verify Shopify HMAC signature for OAuth callback
 */
function verifyShopifyHMAC(query, hmac) {
  const { hmac: _hmac, signature: _signature, ...params } = query
  
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&')
  
  const calculatedHmac = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(sortedParams)
    .digest('hex')
  
  return crypto.timingSafeEqual(
    Buffer.from(hmac, 'hex'),
    Buffer.from(calculatedHmac, 'hex')
  )
}

/**
 * Verify webhook HMAC signature
 */
function verifyWebhookHMAC(body, hmac) {
  const calculatedHmac = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(JSON.stringify(body))
    .digest('base64')
  
  return crypto.timingSafeEqual(
    Buffer.from(hmac, 'base64'),
    Buffer.from(calculatedHmac, 'base64')
  )
}

/**
 * Set up essential webhooks
 */
async function setupShopifyWebhooks(shop, accessToken) {
  const webhooks = [
    {
      webhook: {
        topic: 'app/uninstalled',
        address: `${APP_URL}/auth/uninstall`,
        format: 'json'
      }
    }
  ]

  for (const webhookData of webhooks) {
    try {
      const response = await fetch(`https://${shop}/admin/api/2023-10/webhooks.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(webhookData)
      })

      if (response.ok) {
        console.log(`Webhook created: ${webhookData.webhook.topic}`)
      }
    } catch (error) {
      console.error('Failed to create webhook:', error)
    }
  }
}

export default router