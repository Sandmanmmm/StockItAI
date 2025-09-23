/**
 * Production-ready API Service with Shopify Authentication
 * Uses App Bridge session tokens for secure API calls
 */

// Base configuration - automatically use current origin when running through tunnel
function getApiBaseUrl(): string {
  // If running through Cloudflare tunnel (https), use the same origin for API calls
  if (window.location.origin.includes('trycloudflare.com')) {
    console.log('🌐 Using tunnel origin for API calls:', window.location.origin)
    return window.location.origin
  }
  
  // Otherwise use environment variable or localhost default
  return import.meta.env.VITE_API_BASE_URL || 'http://localhost:3003'
}

const API_BASE_URL = getApiBaseUrl()

/**
 * Get session token from App Bridge using the correct v3+ API
 */
async function getSessionToken(): Promise<string | null> {
  try {
    // First, check for stored initial token
    const initialToken = (window as any).__INITIAL_SESSION_TOKEN__
    if (initialToken) {
      console.log('✅ Using stored initial session token')
      return initialToken
    }

    // Second, try to get from URL parameters for initial load
    const urlParams = new URLSearchParams(window.location.search)
    const idToken = urlParams.get('id_token')
    if (idToken) {
      console.log('✅ Using session token from URL parameters')
      // Store it for future use
      ;(window as any).__INITIAL_SESSION_TOKEN__ = idToken
      return idToken
    }

    // Third, check if we have App Bridge available
    const app = (window as any).__SHOPIFY_APP__
    if (!app) {
      console.warn('⚠️ No App Bridge or URL token available')
      return null
    }

    // App Bridge v3+ session token retrieval
    // For embedded apps, the session token is typically managed by App Bridge
    // Let's try the standard approach first
    try {
      // Check if there's a direct method to get the session token
      if (typeof app.getSessionToken === 'function') {
        const token = await app.getSessionToken()
        console.log('✅ Session token from App Bridge getSessionToken()')
        return token
      }
      
      // Fallback: try getting from app state
      const state = app.getState()
      console.log('🔍 App Bridge state:', state)
      const token = state?.session?.idToken || state?.app?.session?.id_token
      if (token) {
        console.log('✅ Session token from App Bridge state')
        return token
      }

      console.warn('⚠️ No session token available from App Bridge')
      return null
      
    } catch (error) {
      console.error('❌ Error accessing App Bridge session token:', error)
      return null
    }

  } catch (error) {
    console.error('❌ Failed to get session token:', error)
    return null
  }
}

/**
 * Production-ready authenticated API request
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
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
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