import React, { createContext, useContext, useEffect, useState } from 'react'
import { createApp, AppConfig } from '@shopify/app-bridge'

interface AppBridgeContextType {
  app: any | null
  isReady: boolean
  shopDomain?: string
}

const AppBridgeContext = createContext<AppBridgeContextType>({
  app: null,
  isReady: false,
})

interface AppBridgeProviderProps {
  children: React.ReactNode
}

export function AppBridgeProvider({ children }: AppBridgeProviderProps) {
  const [app, setApp] = useState<any>(null)
  const [isReady, setIsReady] = useState(false)
  const [shopDomain, setShopDomain] = useState<string>()

  useEffect(() => {
    // Get config from URL parameters (Shopify passes these automatically)
    const urlParams = new URLSearchParams(window.location.search)
    const shop = urlParams.get('shop')
    const host = urlParams.get('host')
    const embedded = urlParams.get('embedded')
    
    console.log('🔍 App Bridge initialization:', { shop, host, embedded })
    setShopDomain(shop || undefined)
    
    // IMPORTANT: All real Shopify stores have .myshopify.com domain
    // Don't confuse "test" in shop name with development mode
    const isRealShopifyStore = shop && shop.endsWith('.myshopify.com')
    
    if (shop && host && isRealShopifyStore) {
      // Real Shopify environment
      const config: AppConfig = {
        apiKey: import.meta.env.VITE_SHOPIFY_API_KEY || '484def5b3b4823489f8ebff0d2e9cadd',
        host: host,
        forceRedirect: false,
      }

      try {
        const appInstance = createApp(config)
        
        console.log('🔧 App Bridge instance type:', typeof appInstance)
        console.log('🔧 App Bridge methods:', Object.keys(appInstance))
        
        setApp(appInstance)
        setIsReady(true)
        
        // Expose app instance globally for API service
        ;(window as any).__SHOPIFY_APP__ = appInstance
        
        console.log('✅ Shopify App Bridge initialized for real environment')
        console.log('🔧 Config:', { shop, host, apiKey: config.apiKey })
        console.log('🔧 Global app set:', !!(window as any).__SHOPIFY_APP__)
        
      } catch (error) {
        console.error('❌ Failed to initialize Shopify App Bridge:', error)
        setIsReady(true)
      }
    } else {
      // Development mode or non-Shopify environment
      console.log('🔧 Running without Shopify App Bridge:', { 
        hasShop: !!shop, 
        hasHost: !!host,
        isRealStore: isRealShopifyStore 
      })
      setIsReady(true)
    }
  }, [])

  if (!isReady) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Initializing Shopify App Bridge...</p>
        </div>
      </div>
    )
  }

  return (
    <AppBridgeContext.Provider value={{ app, isReady }}>
      {children}
    </AppBridgeContext.Provider>
  )
}

export function useAppBridge() {
  const context = useContext(AppBridgeContext)
  if (context === undefined) {
    throw new Error('useAppBridge must be used within an AppBridgeProvider')
  }
  return context
}

export default AppBridgeProvider