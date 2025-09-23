/**
 * Shopify API Configuration
 * Production-ready Shopify authentication setup
 */

import { shopifyApi, ApiVersion } from '@shopify/shopify-api'
import '@shopify/shopify-api/adapters/node'
import { restResources } from '@shopify/shopify-api/rest/admin/2024-10'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Validate required environment variables
if (!process.env.SHOPIFY_API_KEY) {
  throw new Error('SHOPIFY_API_KEY is required')
}

if (!process.env.SHOPIFY_API_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('SHOPIFY_API_SECRET is required for production')
}

// Initialize Shopify API
export const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || 'development_secret',
  scopes: ['read_products', 'write_products', 'read_orders', 'write_orders', 'read_inventory', 'write_inventory'],
  hostName: process.env.APP_URL?.replace(/https?:\/\//, '') || 'localhost:3003',
  hostScheme: process.env.NODE_ENV === 'production' ? 'https' : 'http',
  apiVersion: ApiVersion.October24,
  isEmbeddedApp: true,
  restResources,
  billing: undefined, // Add billing configuration if needed
})

/**
 * Validate Shopify session token
 */
export async function validateSessionToken(token) {
  try {
    // Use Shopify's official session token validation
    const payload = await shopify.utils.decodeSessionToken(token)
    
    // Validate the audience (should match our app's API key)
    if (payload.aud !== process.env.SHOPIFY_API_KEY) {
      throw new Error('Invalid audience in session token')
    }

    // Check token expiration
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) {
      throw new Error('Session token has expired')
    }

    return payload
  } catch (error) {
    console.error('Session token validation error:', error.message)
    return null
  }
}

/**
 * Get shop domain from session token
 */
export function getShopFromToken(token) {
  try {
    const payload = shopify.utils.decodeSessionToken(token)
    if (!payload || !payload.dest) {
      return null
    }
    
    // Extract shop domain from the destination URL
    const dest = payload.dest
    const match = dest.match(/https:\/\/([^.]+)\.myshopify\.com/)
    if (match && match[1]) {
      return match[1]
    }
    
    // Fallback: try to extract from dest directly
    return dest.replace('https://', '').replace('.myshopify.com', '')
  } catch (error) {
    console.error('Failed to extract shop from token:', error.message)
    return null
  }
}

/**
 * Generate OAuth URL for shop installation
 */
export function generateAuthUrl(shop, redirectUri) {
  return shopify.auth.buildAuthorizationUrl({
    shop,
    redirectUri,
    isOnline: true,
  })
}