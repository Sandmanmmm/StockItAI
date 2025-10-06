/**
 * Production-ready API Service with Shopify Authentication
 * Uses App Bridge session tokens for secure API calls
 */

import { getSessionToken as getAppBridgeSessionToken } from '@shopify/app-bridge/utilities/session-token'

// Base configuration - automatically use current origin when running through tunnel
function getApiBaseUrl(): string {
  // Force use of environment variable for API calls to ensure correct tunnel URL
  const envUrl = import.meta.env.VITE_API_BASE_URL
  if (envUrl) {
    console.log('🌐 Using configured API URL:', envUrl)
    return envUrl
  }
  
  // Fallback: If running through Cloudflare tunnel (https), use the same origin for API calls
  if (window.location.origin.includes('trycloudflare.com')) {
    console.log('🌐 Using tunnel origin for API calls:', window.location.origin)
    return window.location.origin
  }
  
  // Otherwise use localhost default
  return 'http://localhost:3003'
}

const API_BASE_URL = getApiBaseUrl()

/**
 * Wait for App Bridge to be ready (with timeout)
 */
async function waitForAppBridge(timeoutMs = 2000): Promise<any> {
  const startTime = Date.now()
  let attemptCount = 0
  
  while (Date.now() - startTime < timeoutMs) {
    const app = (window as any).__SHOPIFY_APP__
    if (app) {
      console.log(`✅ App Bridge found after ${Date.now() - startTime}ms (${attemptCount} attempts)`)
      return app
    }
    attemptCount++
    // Wait 50ms before checking again
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  
  console.warn(`⚠️ App Bridge not found after ${timeoutMs}ms (${attemptCount} attempts)`)
  return null
}

/**
 * Get fresh session token from App Bridge
 * IMPORTANT: Shopify session tokens expire after ~60 seconds, so we must get a fresh token for each request
 * This uses the official App Bridge v3+ getSessionToken utility
 */
async function getSessionToken(): Promise<string | null> {
  try {
    // Wait for App Bridge to be ready (with timeout)
    const app = await waitForAppBridge(2000)
    
    if (app) {
      try {
        console.log('🔄 Requesting fresh token from App Bridge...')
        const token = await getAppBridgeSessionToken(app)
        console.log('✅ Fresh session token from App Bridge')
        return token
      } catch (error) {
        console.error('❌ Error getting session token from App Bridge:', error)
      }
    } else {
      console.warn('⚠️ App Bridge not available, falling back to URL token')
    }

    // Fallback: try to get from URL parameters (only for initial load)
    // This token will expire quickly, so this is only suitable for the first request
    const urlParams = new URLSearchParams(window.location.search)
    const idToken = urlParams.get('id_token')
    if (idToken) {
      console.log('⚠️ Using session token from URL parameters (will expire soon)')
      return idToken
    }

    console.warn('⚠️ No App Bridge or URL token available')
    return null

  } catch (error) {
    console.error('❌ Failed to get session token:', error)
    return null
  }
}

/**
 * Production-ready authenticated API request
 * Supports both JSON and FormData (for file uploads)
 */
export async function authenticatedRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    // Ensure endpoint starts with /api if it's a relative path
    const apiEndpoint = endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`
    const url = `${API_BASE_URL}${apiEndpoint}`
    
    console.log(`🔄 API Request: ${options.method || 'GET'} ${apiEndpoint}`)
    
    // Get session token for authentication
    const sessionToken = await getSessionToken()
    
    // Check if body is FormData (for file uploads)
    const isFormData = options.body instanceof FormData
    
    const config: RequestInit = {
      headers: {
        // Only set Content-Type for JSON, let browser set it for FormData
        ...(!isFormData && { 'Content-Type': 'application/json' }),
        // Include Shopify session token if available
        ...(sessionToken && { 'Authorization': `Bearer ${sessionToken}` }),
        ...options.headers,
      },
      ...options,
    }

    console.log(`� Authentication: ${sessionToken ? 'Token present' : 'No token - using dev mode'}`)
    
    const response = await fetch(url, config)
    
    if (!response.ok) {
      // Handle authentication errors
      if (response.status === 401) {
        console.error('❌ Authentication failed - unauthorized')
        throw new Error('Authentication required - please refresh the app')
      }
      if (response.status === 403) {
        throw new Error('Access denied - insufficient permissions')
      }
      if (response.status === 404) {
        throw new Error('API endpoint not found')
      }
      if (response.status >= 500) {
        throw new Error('Server error - please try again later')
      }
      throw new Error(`API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    
    if (!data.success) {
      throw new Error(data.error || 'API request failed')
    }

    console.log(`✅ API Success: ${apiEndpoint}`)
    return { success: true, data: data.data }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`❌ API request failed for ${endpoint}:`, errorMessage)
    return { 
      success: false, 
      error: errorMessage
    }
  }
}

/**
 * Check if we're in Shopify environment
 */
export function isShopifyEnvironment(): boolean {
  const urlParams = new URLSearchParams(window.location.search)
  const shop = urlParams.get('shop')
  const host = urlParams.get('host')
  return !!(shop && host && !shop.includes('test'))
}

/**
 * Get shop domain from URL parameters
 */
export function getShopDomain(): string | null {
  const urlParams = new URLSearchParams(window.location.search)
  return urlParams.get('shop')
}