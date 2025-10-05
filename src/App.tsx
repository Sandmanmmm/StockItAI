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
import { Toaster } from 'sonner'
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
import { RefinementConfigPanel } from './components/RefinementConfigPanel'
import { SyncScheduler } from './components/SyncScheduler'
import { SettingsPanel } from './components/SettingsPanel'
import { BulkPOConfiguration } from './components/BulkPOConfiguration'
import { QuickSync } from './components/QuickSync'
import { QuickSyncPro } from './components/QuickSyncPro'
import { NotificationsPanel } from './components/NotificationsPanel'
import { ActiveSuppliers } from './components/ActiveSuppliers'
import { AllPurchaseOrders } from './components/AllPurchaseOrders'
import { PurchaseOrderDetails } from './components/PurchaseOrderDetails'
import { ProductDetailView } from './components/ProductDetailView'
import { RealTimeFeedback } from './components/RealTimeFeedback'
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
  const [showProductDetail, setShowProductDetail] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null)
  const [refreshQuickSync, setRefreshQuickSync] = useState(0)
  const [selectedPurchaseOrderId, setSelectedPurchaseOrderId] = useState<string | null>(null)
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null)
  const [unreadNotifications, setUnreadNotifications] = useState(3)
  const [imageApprovedFlag, setImageApprovedFlag] = useState(false)
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
        onPurchaseOrderSelected={(poId) => {
          setActiveTab('dashboard')
          setShowActiveSuppliers(false)
          setShowAllPurchaseOrders(false)
          setSelectedSupplierId(null)
          setSelectedPurchaseOrderId(poId)
        }}
        onSupplierSelected={(supplierId) => {
          setSelectedPurchaseOrderId(null)
          setShowAllPurchaseOrders(false)
          setShowActiveSuppliers(true)
          setSelectedSupplierId(supplierId)
          setActiveTab('suppliers')
        }}
      />

      {/* Production-Ready Dashboard Layout */}
      <div className="w-full overflow-x-hidden">
        {/* Main Content Container - Optimized for Shopify */}
        <div className="max-w-[1600px] mx-auto px-2 sm:px-3 md:px-4 lg:px-6 space-y-1 sm:space-y-2 md:space-y-3 lg:space-y-4">
          {/* Navigation Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            {!showActiveSuppliers && !showAllPurchaseOrders && !selectedPurchaseOrderId && (
              <TabsList className="grid w-full grid-cols-5 h-9 md:h-10">
                <TabsTrigger value="dashboard" className="text-sm">Dashboard</TabsTrigger>
                <TabsTrigger value="suppliers" className="text-sm">Suppliers</TabsTrigger>
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
                      onShowSupplierDetails={(supplierId) => {
                        setSelectedSupplierId(supplierId)
                        setActiveTab('suppliers')
                      }}
                    />
                  </motion.div>
                </TabsContent>

                <TabsContent value="suppliers" className="space-y-4 md:space-y-6 mt-4 md:mt-6">
                  <motion.div
                    key="suppliers"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <ActiveSuppliers 
                      onBack={() => {
                        setActiveTab('dashboard')
                        setSelectedSupplierId(null)
                      }} 
                      initialSupplierId={selectedSupplierId || undefined}
                    />
                  </motion.div>
                </TabsContent>

                <TabsContent value="sync" className="h-[calc(100vh-120px)]">
                  <motion.div
                    key="sync"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className="h-full"
                  >
                    <QuickSyncPro 
                      onBack={() => setActiveTab('dashboard')}
                      onViewProductDetail={(product) => {
                        setSelectedProduct(product)
                        setShowProductDetail(true)
                      }}
                      onProductUpdate={() => {
                        // Trigger a refresh of the product drafts list
                        setRefreshQuickSync(prev => prev + 1)
                      }}
                      refreshTrigger={refreshQuickSync}
                    />
                  </motion.div>
                </TabsContent>

                <TabsContent value="upload" className="space-y-4 md:space-y-6 mt-4 md:mt-6">
                  <motion.div
                    key="upload"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-6"
                  >
                    {/* Refinement Configuration Panel */}
                    <RefinementConfigPanel />
                    
                    {/* Upload Section */}
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

                    {/* Real-Time Feedback Section */}
                    <RealTimeFeedback />
                  </motion.div>
                </TabsContent>

                <TabsContent value="settings" className="space-y-4 md:space-y-6 mt-4 md:mt-6">
                  <motion.div
                    key="settings"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-visible"
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
                <ActiveSuppliers
                  onBack={() => {
                    setShowActiveSuppliers(false)
                    setSelectedSupplierId(null)
                  }}
                  initialSupplierId={selectedSupplierId || undefined}
                />
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

      {/* Product Detail View */}
      {showProductDetail && selectedProduct && (
        <ProductDetailView
          item={{
            id: selectedProduct.lineItemId || selectedProduct.id,
            sku: selectedProduct.sku || '',
            name: selectedProduct.refinedTitle || selectedProduct.originalTitle || selectedProduct.title || 'Unknown Product',
            description: selectedProduct.description || selectedProduct.originalDescription,
            quantity: selectedProduct.lineItem?.quantity || 1,
            unitPrice: selectedProduct.priceRefined || selectedProduct.priceOriginal || 0,
            totalPrice: (selectedProduct.priceRefined || selectedProduct.priceOriginal || 0) * (selectedProduct.lineItem?.quantity || 1),
            confidence: selectedProduct.confidence || 0,
            weight: selectedProduct.weight,
            barcode: selectedProduct.barcode,
            category: selectedProduct.productType,
            vendor: selectedProduct.vendor,
            images: selectedProduct.images ? {
              vendorImages: [],
              webScraped: [],
              aiGenerated: null,
              processed: selectedProduct.images || [],
              recommended: null,
              needsReview: false,
              totalImages: selectedProduct.images?.length || 0
            } : undefined
          }}
          purchaseOrder={{
            id: selectedProduct.purchaseOrderId || selectedProduct.purchaseOrder?.id || '',
            number: selectedProduct.purchaseOrder?.number || 'N/A',
            supplierName: selectedProduct.supplier?.name || 'Unknown Supplier',
            currency: selectedProduct.currencyTarget || selectedProduct.currencyOriginal || 'USD',
            supplier: selectedProduct.supplier ? {
              id: selectedProduct.supplier.id,
              name: selectedProduct.supplier.name
            } : undefined
          }}
          merchantId={selectedProduct.merchantId || ''}
          onClose={() => {
            console.log('🔵 ProductDetailView onClose called, imageApprovedFlag:', imageApprovedFlag)
            setShowProductDetail(false)
            setSelectedProduct(null)
            // Only refresh if images were approved during this session
            if (imageApprovedFlag) {
              console.log('🔄 Triggering refresh due to image approval')
              setRefreshQuickSync(prev => prev + 1)
              setImageApprovedFlag(false)
            }
          }}
          onSave={(updatedItem) => {
            console.log('Product updated:', updatedItem)
            // Trigger refresh of the product drafts list
            setRefreshQuickSync(prev => prev + 1)
            setShowProductDetail(false)
            setSelectedProduct(null)
          }}
          onImageApproved={() => {
            // Set flag that images were approved
            // Actual refresh will happen when modal closes
            console.log('🎯 onImageApproved called, setting flag to true')
            setImageApprovedFlag(true)
            console.log('✅ Image approved - will refresh on modal close')
          }}
        />
      )}

      {/* Toast Notifications */}
      <Toaster position="top-right" richColors />
    </ShopifyLayoutWrapper>
  )
}

export default App