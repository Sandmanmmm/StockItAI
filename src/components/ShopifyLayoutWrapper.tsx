import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface ShopifyLayoutWrapperProps {
  children: React.ReactNode
  className?: string
}

export function ShopifyLayoutWrapper({ children, className }: ShopifyLayoutWrapperProps) {
  const [isEmbedded, setIsEmbedded] = useState(false)

  useEffect(() => {
    // Check if we're running inside Shopify's iframe
    const isInShopify = window !== window.parent || 
                       window.location.search.includes('shop=') ||
                       window.location.search.includes('host=') ||
                       document.referrer.includes('shopify.com') ||
                       (window as any).shopify !== undefined

    setIsEmbedded(isInShopify)

    // Apply body class for embedded mode
    if (isInShopify) {
      document.body.classList.add('shopify-embedded')
      document.documentElement.style.height = '100%'
      document.body.style.height = '100%'
    }

    return () => {
      document.body.classList.remove('shopify-embedded')
    }
  }, [])

  return (
    <div 
      className={cn(
        "w-full",
        isEmbedded ? "h-screen overflow-y-auto" : "min-h-screen",
        isEmbedded ? "shopify-embedded" : "",
        className
      )}
      style={{
        ...(isEmbedded && {
          height: '100vh'
        })
      }}
    >
      {children}
    </div>
  )
}

// Hook to detect Shopify embedding
export function useShopifyEmbedded() {
  const [isEmbedded, setIsEmbedded] = useState(false)

  useEffect(() => {
    const isInShopify = window !== window.parent || 
                       window.location.search.includes('shop=') ||
                       window.location.search.includes('host=') ||
                       document.referrer.includes('shopify.com') ||
                       (window as any).shopify !== undefined

    setIsEmbedded(isInShopify)
  }, [])

  return isEmbedded
}