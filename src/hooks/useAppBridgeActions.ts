import { useAppBridge } from '../components/AppBridgeProvider'

export function useAppBridgeActions() {
  const { app, isReady } = useAppBridge()

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (!app || !isReady) {
      // Fallback to console if App Bridge is not available
      console.log(`[${type.toUpperCase()}] ${message}`)
      return
    }

    try {
      // Use the modern App Bridge toast API
      if (app && typeof app.toast === 'function') {
        app.toast(message, {
          isError: type === 'error',
          duration: 4000
        })
      } else {
        console.log(`[${type.toUpperCase()}] ${message}`)
      }
    } catch (error) {
      console.error('Failed to show App Bridge toast:', error)
      console.log(`[${type.toUpperCase()}] ${message}`)
    }
  }

  const navigateToAdmin = (path: string) => {
    if (!app || !isReady) {
      console.log(`Would navigate to admin: ${path}`)
      return
    }

    try {
      // Use modern navigation API
      if (app && typeof app.navigation === 'object' && app.navigation.navigate) {
        app.navigation.navigate(`/admin/${path}`)
      } else {
        console.log(`Would navigate to admin: ${path}`)
      }
    } catch (error) {
      console.error('Failed to navigate:', error)
    }
  }

  const openExternalURL = (url: string) => {
    if (!app || !isReady) {
      window.open(url, '_blank')
      return
    }

    try {
      // Use modern navigation API for external URLs
      if (app && typeof app.navigation === 'object' && app.navigation.navigate) {
        app.navigation.navigate(url)
      } else {
        window.open(url, '_blank')
      }
    } catch (error) {
      console.error('Failed to open URL:', error)
      window.open(url, '_blank')
    }
  }

  const getShopifyContext = () => {
    if (!isReady) {
      return null
    }

    const urlParams = new URLSearchParams(window.location.search)
    return {
      shop: urlParams.get('shop'),
      host: urlParams.get('host'),
      timestamp: urlParams.get('timestamp'),
      session: urlParams.get('session'),
      locale: urlParams.get('locale') || 'en',
      embedded: urlParams.get('embedded') !== 'false'
    }
  }

  return {
    showToast,
    navigateToAdmin,
    openExternalURL,
    getShopifyContext,
    isAppBridgeReady: isReady && !!app,
    app
  }
}

export default useAppBridgeActions