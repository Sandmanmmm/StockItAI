import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Globe, 
  CheckCircle, 
  XCircle, 
  Bell, 
  ArrowSquareOut 
} from '@phosphor-icons/react'
import { useAppBridgeActions } from '../hooks/useAppBridgeActions'

export function AppBridgeStatus() {
  const { 
    showToast, 
    navigateToAdmin, 
    openExternalURL, 
    getShopifyContext, 
    isAppBridgeReady 
  } = useAppBridgeActions()

  const context = getShopifyContext()

  const handleTestToast = () => {
    showToast('🎉 App Bridge is working! This is a test notification.', 'success')
  }

  const handleTestNavigation = () => {
    navigateToAdmin('products')
  }

  const handleTestExternal = () => {
    openExternalURL('https://shopify.dev/apps/app-bridge')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="w-5 h-5" />
          Shopify App Bridge Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span>Connection Status:</span>
          <Badge variant={isAppBridgeReady ? 'default' : 'secondary'} className="flex items-center gap-1">
            {isAppBridgeReady ? (
              <>
                <CheckCircle className="w-3 h-3" />
                Connected
              </>
            ) : (
              <>
                <XCircle className="w-3 h-3" />
                Development Mode
              </>
            )}
          </Badge>
        </div>

        {context && (
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="font-medium">Shop:</span>
                <p className="text-muted-foreground truncate">{context.shop || 'Not available'}</p>
              </div>
              <div>
                <span className="font-medium">Embedded:</span>
                <p className="text-muted-foreground">{context.embedded ? 'Yes' : 'No'}</p>
              </div>
              <div>
                <span className="font-medium">Locale:</span>
                <p className="text-muted-foreground">{context.locale}</p>
              </div>
              <div>
                <span className="font-medium">Host:</span>
                <p className="text-muted-foreground">{context.host ? '✓ Available' : 'Not available'}</p>
              </div>
            </div>
          </div>
        )}

        <div className="border-t pt-4">
          <h4 className="font-medium mb-3">App Bridge Test Actions</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={handleTestToast}
              className="flex items-center gap-2"
            >
              <Bell className="w-3 h-3" />
              Test Toast
            </Button>
            
            <Button 
              size="sm" 
              variant="outline" 
              onClick={handleTestNavigation}
              className="flex items-center gap-2"
              disabled={!isAppBridgeReady}
            >
              <Globe className="w-3 h-3" />
              Navigate
            </Button>
            
            <Button 
              size="sm" 
              variant="outline" 
              onClick={handleTestExternal}
              className="flex items-center gap-2"
            >
              <ArrowSquareOut className="w-3 h-3" />
              External Link
            </Button>
          </div>
          
          <p className="text-xs text-muted-foreground mt-3">
            {isAppBridgeReady 
              ? 'All App Bridge features are available.' 
              : 'Running in development mode. Some features may use fallbacks.'}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

export default AppBridgeStatus