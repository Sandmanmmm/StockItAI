import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { 
  Upload, 
  Calendar, 
  Gear, 
  FileText, 
  Check, 
  Warning,
  TrendUp,
  Clock,
  Users,
  Package,
  Bell,
  MagnifyingGlass,
  ChartLine,
  Robot,
  Globe,
  ShoppingBag,
  ArrowRight,
  Lightning,
  Shield,
  Database,
  ArrowsClockwise
} from '@phosphor-icons/react'
import { DashboardOverview } from './components/DashboardOverview'
import { ProductionPOUpload } from './components/ProductionPOUpload'
import { SyncScheduler } from './components/SyncScheduler'
import { SettingsPanel } from './components/SettingsPanel'
import { BulkPOConfiguration } from './components/BulkPOConfiguration'
import { QuickSync } from './components/QuickSync'
import { NotificationsPanel } from './components/NotificationsPanel'
import { ActiveSuppliers } from './components/ActiveSuppliers'
import { AllPurchaseOrders } from './components/AllPurchaseOrders'
import { PurchaseOrderDetails } from './components/PurchaseOrderDetails'
import { AIChatbot } from './components/AIChatbot'
import { useKV } from './hooks/useKV'
import { safeFormatTime } from '@/lib/utils'
import { ShopifyLayoutWrapper } from './components/ShopifyLayoutWrapper'
import { ShopifyHeader } from './components/ShopifyHeader'
import { notificationService } from '@/lib/notificationService'

interface NotificationItem {
  id: string
  type: 'success' | 'warning' | 'info' | 'error'
  title: string
  message: string
  timestamp: string // ISO string timestamp
  read: boolean
}

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [showQuickSync, setShowQuickSync] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showActiveSuppliers, setShowActiveSuppliers] = useState(false)
  const [showAllPurchaseOrders, setShowAllPurchaseOrders] = useState(false)
  const [selectedPurchaseOrderId, setSelectedPurchaseOrderId] = useState<string | null>(null)
  const [unreadNotifications, setUnreadNotifications] = useState(3)
  const [showAIChatbot, setShowAIChatbot] = useState(false)
  const [isAIChatbotMinimized, setIsAIChatbotMinimized] = useState(false)
  const [notifications] = useKV<NotificationItem[]>('notifications', [
    {
      id: '1',
      type: 'success',
      title: 'PO Processed Successfully',
      message: 'TechnoSupply Co. PO-2024-001 processed with 95% confidence',
      timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      read: false
    },
    {
      id: '2',
      type: 'warning',
      title: 'Low Confidence Detection',
      message: 'Premier Wholesale PO requires manual review',
      timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      read: false
    },
    {
      id: '3',
      type: 'info',
      title: 'Sync Scheduled',
      message: 'Next supplier sync in 2 hours',
      timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      read: true
    }
  ])

  // Initialize notification service with settings
  const [notificationSettings] = useKV<any>('notification-settings', {
    enabled: true,
    desktopEnabled: false,
    soundEnabled: true,
    soundVolume: 70,
    successSound: 'chime',
    warningSound: 'bell',
    errorSound: 'alert',
    infoSound: 'soft',
    types: {
      success: true,
      warning: true,
      error: true,
      info: true
    },
    doNotDisturbEnabled: false,
    doNotDisturbStart: '22:00',
    doNotDisturbEnd: '08:00',
    autoDismissEnabled: true,
    autoDismissDelay: 5000
  })

  // Update notification service when settings change
  useEffect(() => {
    if (notificationSettings) {
      notificationService.updateSettings(notificationSettings)
    }
  }, [notificationSettings])

  // Demo: Add some notifications after app loads
  useEffect(() => {
    const timer = setTimeout(() => {
      // Demo notifications to showcase the system
      notificationService.showInfo(
        'Welcome to PO Manager Pro',
        'Your AI-powered inventory management system is ready. Configure your notification preferences in Settings.',
        { category: 'system', priority: 'low' }
      )
    }, 3000)

    return () => clearTimeout(timer)
  }, [])

  // This will be managed by the NotificationsPanel component

  const [currentTime, setCurrentTime] = useState<Date | null>(null)
  useEffect(() => {
    // Set initial time safely
    setCurrentTime(new Date())
    
    const timer = setInterval(() => {
      try {
        setCurrentTime(new Date())
      } catch {
        // If Date constructor fails for some reason, keep previous time
      }
    }, 1000)
    
    return () => clearInterval(timer)
  }, [])

  return (
    <ShopifyLayoutWrapper className="bg-background">
      {/* Production-Ready Shopify Header */}
      <ShopifyHeader
        currentPage={
          showActiveSuppliers ? "Active Suppliers" :
          showAllPurchaseOrders ? "All Purchase Orders" :
          selectedPurchaseOrderId ? "Purchase Order Details" :
          "Dashboard"
        }
        breadcrumbs={
          showActiveSuppliers ? [{ label: "Suppliers", href: "#" }, { label: "Active Suppliers" }] :
          showAllPurchaseOrders ? [{ label: "Purchase Orders", href: "#" }, { label: "All Orders" }] :
          selectedPurchaseOrderId ? [{ label: "Purchase Orders", href: "#" }, { label: "Order Details" }] :
          [{ label: "Home" }]
        }
        onNotificationsClick={() => setShowNotifications(!showNotifications)}
        onSettingsClick={() => setShowSettings(!showSettings)}
        unreadNotifications={unreadNotifications}
      />

      {/* Production-Ready Dashboard Layout */}
      <div className="w-full">
        {/* Main Content Container - Optimized for Shopify */}
        <div className="max-w-[1800px] mx-auto px-1 sm:px-2 md:px-3 lg:px-5 space-y-1 sm:space-y-2 md:space-y-3 lg:space-y-4">
          {/* Navigation Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            {!showActiveSuppliers && !showAllPurchaseOrders && !selectedPurchaseOrderId && (
              <TabsList className="grid w-full grid-cols-4 h-9 md:h-10">
                <TabsTrigger value="dashboard" className="text-sm">Dashboard</TabsTrigger>
                <TabsTrigger value="sync" className="text-sm">Quick Sync</TabsTrigger>
                <TabsTrigger value="upload" className="text-sm">Upload PO</TabsTrigger>
                <TabsTrigger value="settings" className="text-sm">Settings</TabsTrigger>
              </TabsList>
            )}

            {/* Content based on navigation state */}
            {!showActiveSuppliers && !showAllPurchaseOrders && !selectedPurchaseOrderId ? (
              <AnimatePresence mode="wait">
                <>
                <TabsContent value="dashboard" className="space-y-4 md:space-y-6 mt-4 md:mt-6">
                  <motion.div
                    key="dashboard"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <DashboardOverview 
                      onShowActiveSuppliers={() => setShowActiveSuppliers(true)} 
                      onShowAllPurchaseOrders={() => setShowAllPurchaseOrders(true)}
                      onShowPurchaseOrderDetails={(orderId) => setSelectedPurchaseOrderId(orderId)}
                    />
                  </motion.div>
                </TabsContent>

                <TabsContent value="sync" className="space-y-4 md:space-y-6 mt-4 md:mt-6">
                  <motion.div
                    key="sync"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <QuickSync onClose={() => {}} />
                  </motion.div>
                </TabsContent>

                <TabsContent value="upload" className="space-y-4 md:space-y-6 mt-4 md:mt-6">
                  <motion.div
                    key="upload"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <ProductionPOUpload 
                      onUploadComplete={(purchaseOrder) => {
                        console.log('Upload completed:', purchaseOrder)
                      }}
                      onUploadError={(error) => {
                        console.error('Upload error:', error)
                      }}
                      autoProcess={true}
                      confidenceThreshold={0.8}
                    />
                  </motion.div>
                </TabsContent>

                <TabsContent value="settings" className="space-y-4 md:space-y-6 mt-4 md:mt-6">
                  <motion.div
                    key="settings"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <SettingsPanel />
                  </motion.div>
                </TabsContent>
                </>
              </AnimatePresence>
            ) : showActiveSuppliers ? (
              <motion.div
                key="active-suppliers"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="mt-6"
              >
                <ActiveSuppliers onBack={() => setShowActiveSuppliers(false)} />
              </motion.div>
            ) : showAllPurchaseOrders ? (
              <motion.div
                key="all-purchase-orders"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="mt-6"
              >
                <AllPurchaseOrders onBack={() => setShowAllPurchaseOrders(false)} />
              </motion.div>
            ) : selectedPurchaseOrderId ? (
              <motion.div
                key="purchase-order-details"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="mt-6"
              >
                <PurchaseOrderDetails 
                  orderId={selectedPurchaseOrderId!}
                  onBack={() => setSelectedPurchaseOrderId(null)}
                />
              </motion.div>
            ) : null}
        </Tabs>
        </div>
      </div>

      {/* Notifications Panel */}
      <NotificationsPanel
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
        onNotificationUpdate={setUnreadNotifications}
        onOpenSettings={() => {
          setActiveTab('settings')
          // In the future, could also set a specific tab within settings
        }}
      />

      {/* Settings Panel */}
      <Sheet open={showSettings} onOpenChange={setShowSettings}>
        <SheetContent className="w-96">
          <SheetHeader>
            <SheetTitle>Settings</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <SettingsPanel />
          </div>
        </SheetContent>
      </Sheet>

      {/* Quick Sync Modal */}
      <AnimatePresence>
        {showQuickSync && (
          <QuickSync onClose={() => setShowQuickSync(false)} />
        )}
      </AnimatePresence>

      {/* AI Chatbot */}
      <AIChatbot
        isOpen={showAIChatbot}
        isMinimized={isAIChatbotMinimized}
        onToggle={() => setShowAIChatbot(!showAIChatbot)}
        onMinimize={() => setIsAIChatbotMinimized(true)}
        onClose={() => {
          setShowAIChatbot(false)
          setIsAIChatbotMinimized(false)
        }}
      />
    </ShopifyLayoutWrapper>
  )
}

export default App