/**
 * Professional Quick Sync Interface
 * Full-screen immersive experience for syncing product drafts to Shopify
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { 
  Lightning, 
  Check, 
  Warning, 
  X, 
  ArrowLeft,
  MagnifyingGlass,
  Package,
  ShoppingBag,
  Storefront,
  TrendUp,
  CurrencyDollar,
  Cube,
  Tag,
  Image as ImageIcon,
  ArrowsClockwise,
  CheckCircle,
  XCircle,
  ClockCounterClockwise,
  FunnelSimple,
  WarningCircle,
  Sparkle,
  Eye,
  ArrowRight
} from '@phosphor-icons/react'
import { useProductDrafts, type ProductDraft } from '../hooks/useProductDrafts'
import { cn } from '@/lib/utils'

interface QuickSyncProProps {
  onBack: () => void
  onViewProductDetail?: (product: ProductDraft) => void
  onProductUpdate?: () => void
  refreshTrigger?: number
}

export function QuickSyncPro({ onBack, onViewProductDetail, onProductUpdate, refreshTrigger }: QuickSyncProProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [syncStatusFilter, setSyncStatusFilter] = useState<string>('not_synced')
  const [sortBy, setSortBy] = useState<string>('po-number')
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set())
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<Map<string, {
    status: 'pending' | 'syncing' | 'success' | 'failed'
    progress: number
    error?: string
    shopifyUrl?: string
  }>>(new Map())

  const { 
    productDrafts, 
    total, 
    stats, 
    loading, 
    error, 
    refetch,
    syncToShopify 
  } = useProductDrafts({
    syncStatus: syncStatusFilter !== 'all' ? syncStatusFilter : undefined
  })

  // Refetch when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      console.log('🔄 Quick Sync: refreshTrigger changed to:', refreshTrigger, '- calling refetch()')
      refetch()
    }
  }, [refreshTrigger, refetch])

  // Filter products based on search and status
  const filteredProducts = productDrafts.filter(product => {
    const matchesSearch = searchTerm === '' || 
      product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.vendor?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = statusFilter === 'all' || product.status === statusFilter
    
    return matchesSearch && matchesStatus
  })

  // Sort products
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    switch (sortBy) {
      case 'po-number':
        // Sort by purchase order number
        const poA = a.purchaseOrder?.number || ''
        const poB = b.purchaseOrder?.number || ''
        return poA.localeCompare(poB)
      
      case 'date-newest':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      
      case 'date-oldest':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      
      case 'price-high':
        return (b.priceRefined || 0) - (a.priceRefined || 0)
      
      case 'price-low':
        return (a.priceRefined || 0) - (b.priceRefined || 0)
      
      case 'title-az':
        return a.title.localeCompare(b.title)
      
      case 'title-za':
        return b.title.localeCompare(a.title)
      
      case 'vendor':
        const vendorA = a.vendor || ''
        const vendorB = b.vendor || ''
        return vendorA.localeCompare(vendorB)
      
      default:
        return 0
    }
  })

  // Select/deselect all
  const toggleSelectAll = () => {
    if (selectedProducts.size === sortedProducts.length) {
      setSelectedProducts(new Set())
    } else {
      setSelectedProducts(new Set(sortedProducts.map(p => p.id)))
    }
  }

  // Toggle individual product
  const toggleProduct = (id: string) => {
    const newSelected = new Set(selectedProducts)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedProducts(newSelected)
  }

  // Start sync process
  const handleSync = async () => {
    if (selectedProducts.size === 0) {
      toast.error('No products selected', {
        description: 'Please select at least one product to sync'
      })
      return
    }

    setIsSyncing(true)
    const productsToSync = Array.from(selectedProducts)
    
    // Initialize progress for all products
    const initialProgress = new Map()
    productsToSync.forEach(id => {
      initialProgress.set(id, { status: 'pending', progress: 0 })
    })
    setSyncProgress(initialProgress)

    toast.info('Sync Started', {
      description: `Syncing ${productsToSync.length} product${productsToSync.length > 1 ? 's' : ''} to Shopify`
    })

    // Sync products one by one (or in batches)
    for (const productId of productsToSync) {
      try {
        // Update status to syncing
        setSyncProgress(prev => new Map(prev).set(productId, {
          status: 'syncing',
          progress: 50
        }))

        // Call sync API
        await syncToShopify([productId])

        // Update status to success
        setSyncProgress(prev => new Map(prev).set(productId, {
          status: 'success',
          progress: 100,
          shopifyUrl: `https://admin.shopify.com/store/products/${productId}`
        }))

        toast.success('Product Synced', {
          description: productDrafts.find(p => p.id === productId)?.title
        })

      } catch (err) {
        // Update status to failed
        setSyncProgress(prev => new Map(prev).set(productId, {
          status: 'failed',
          progress: 0,
          error: err instanceof Error ? err.message : 'Sync failed'
        }))

        toast.error('Sync Failed', {
          description: productDrafts.find(p => p.id === productId)?.title
        })
      }

      // Small delay between products
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    // Completion
    setIsSyncing(false)
    const successCount = Array.from(syncProgress.values()).filter(p => p.status === 'success').length
    
    toast.success('Sync Complete', {
      description: `${successCount}/${productsToSync.length} products synced successfully`
    })

    // Refresh data
    await refetch()
    setSelectedProducts(new Set())
  }

  const getStatusBadge = (status: ProductDraft['status']) => {
    const variants: Record<string, { variant: any, icon: any, label: string }> = {
      draft: { variant: 'secondary', icon: ClockCounterClockwise, label: 'Draft' },
      pending_review: { variant: 'default', icon: Warning, label: 'Pending Review' },
      approved: { variant: 'default', icon: CheckCircle, label: 'Approved' },
      rejected: { variant: 'destructive', icon: XCircle, label: 'Rejected' },
      synced: { variant: 'default', icon: Check, label: 'Synced' }
    }
    
    const config = variants[status] || variants.draft
    const Icon = config.icon
    
    return (
      <Badge variant={config.variant as any} className="flex items-center gap-1">
        <Icon className="w-3 h-3" weight="fill" />
        {config.label}
      </Badge>
    )
  }

  const getSyncStatusBadge = (syncStatus: ProductDraft['syncStatus']) => {
    const variants: Record<string, { variant: any, className: string, label: string }> = {
      not_synced: { variant: 'outline', className: '', label: 'Not Synced' },
      syncing: { variant: 'secondary', className: 'animate-pulse', label: 'Syncing...' },
      synced: { variant: 'default', className: 'bg-green-500', label: 'Synced' },
      failed: { variant: 'destructive', className: '', label: 'Failed' }
    }
    
    const config = variants[syncStatus] || variants.not_synced
    
    return (
      <Badge variant={config.variant as any} className={config.className}>
        {config.label}
      </Badge>
    )
  }

  return (
    <div className="flex flex-col h-screen w-full bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950 overflow-hidden">
      {/* Header */}
      <div className="border-b bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl z-10 shadow-sm flex-shrink-0">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={onBack}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25">
                  <Lightning className="w-6 h-6 text-white" weight="fill" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    Quick Sync
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Push product drafts to your Shopify store
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-2xl font-bold">{selectedProducts.size}</div>
                <div className="text-xs text-muted-foreground">Selected</div>
              </div>
              <Button 
                onClick={handleSync}
                disabled={selectedProducts.size === 0 || isSyncing}
                size="lg"
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg"
              >
                {isSyncing ? (
                  <>
                    <ArrowsClockwise className="w-5 h-5 mr-2 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <Storefront className="w-5 h-5 mr-2" weight="fill" />
                    Sync to Shopify
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex-shrink-0">
        <div className="container mx-auto px-6 py-4">
          <div className="grid grid-cols-5 gap-4">
            <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50 border-blue-200/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold text-blue-600">{stats.not_synced}</div>
                    <div className="text-xs text-muted-foreground font-medium">Ready to Sync</div>
                  </div>
                  <Package className="w-8 h-8 text-blue-600/40" weight="duotone" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/50 border-green-200/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold text-green-600">{stats.synced}</div>
                    <div className="text-xs text-muted-foreground font-medium">Synced</div>
                  </div>
                  <CheckCircle className="w-8 h-8 text-green-600/40" weight="duotone" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-950/50 dark:to-amber-950/50 border-yellow-200/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold text-yellow-600">{stats.syncing}</div>
                    <div className="text-xs text-muted-foreground font-medium">Syncing</div>
                  </div>
                  <ArrowsClockwise className="w-8 h-8 text-yellow-600/40 animate-spin" weight="duotone" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/50 dark:to-rose-950/50 border-red-200/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
                    <div className="text-xs text-muted-foreground font-medium">Failed</div>
                  </div>
                  <XCircle className="w-8 h-8 text-red-600/40" weight="duotone" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/50 dark:to-violet-950/50 border-purple-200/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold text-purple-600">{total}</div>
                    <div className="text-xs text-muted-foreground font-medium">Total Drafts</div>
                  </div>
                  <Cube className="w-8 h-8 text-purple-600/40" weight="duotone" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="border-b bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm flex-shrink-0">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input 
                placeholder="Search by title, SKU, or vendor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <FunnelSimple className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending_review">Pending Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="synced">Synced</SelectItem>
              </SelectContent>
            </Select>

            <Select value={syncStatusFilter} onValueChange={setSyncStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <Storefront className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Sync Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sync Status</SelectItem>
                <SelectItem value="not_synced">Not Synced</SelectItem>
                <SelectItem value="syncing">Syncing</SelectItem>
                <SelectItem value="synced">Synced</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[200px]">
                <TrendUp className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Sort By" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="po-number">PO Number</SelectItem>
                <SelectItem value="date-newest">Date (Newest)</SelectItem>
                <SelectItem value="date-oldest">Date (Oldest)</SelectItem>
                <SelectItem value="price-high">Price (High to Low)</SelectItem>
                <SelectItem value="price-low">Price (Low to High)</SelectItem>
                <SelectItem value="title-az">Title (A-Z)</SelectItem>
                <SelectItem value="title-za">Title (Z-A)</SelectItem>
                <SelectItem value="vendor">Vendor</SelectItem>
              </SelectContent>
            </Select>

            <Button 
              variant="outline" 
              size="sm"
              onClick={toggleSelectAll}
            >
              {selectedProducts.size === sortedProducts.length ? 'Deselect All' : 'Select All'}
            </Button>
          </div>
        </div>
      </div>

      {/* Product Grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-6 py-6">
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center space-y-3">
                <ArrowsClockwise className="w-12 h-12 animate-spin mx-auto text-primary" />
                <p className="text-muted-foreground">Loading product drafts...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center space-y-3">
                <WarningCircle className="w-12 h-12 mx-auto text-destructive" />
                <p className="text-destructive font-medium">Failed to load products</p>
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button onClick={() => refetch()} variant="outline">
                  Try Again
                </Button>
              </div>
            </div>
          ) : sortedProducts.length === 0 ? (
            <div className="flex items-center justify-center h-96">
              <div className="text-center space-y-3">
                <Package className="w-12 h-12 mx-auto text-muted-foreground" />
                <p className="text-muted-foreground font-medium">No products found</p>
                <p className="text-sm text-muted-foreground">
                  {searchTerm ? 'Try adjusting your search or filters' : 'Create some product drafts to get started'}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-6">
              <AnimatePresence mode="popLayout">
                {sortedProducts.map((product, index) => {
                  const isSelected = selectedProducts.has(product.id)
                  const syncState = syncProgress.get(product.id)
                  
                  return (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ delay: index * 0.02 }}
                    >
                      <Card 
                        className={cn(
                          "group cursor-pointer transition-all hover:shadow-xl",
                          isSelected && "ring-2 ring-primary shadow-lg scale-[1.02]",
                          syncState?.status === 'syncing' && "ring-2 ring-yellow-500 animate-pulse",
                          syncState?.status === 'success' && "ring-2 ring-green-500",
                          syncState?.status === 'failed' && "ring-2 ring-red-500"
                        )}
                        onClick={() => !isSyncing && toggleProduct(product.id)}
                      >
                        <CardContent className="p-4 space-y-3">
                          {/* Header */}
                          <div className="flex items-start justify-between gap-2">
                            <Checkbox 
                              checked={isSelected}
                              onCheckedChange={() => toggleProduct(product.id)}
                              onClick={(e) => e.stopPropagation()}
                              disabled={isSyncing}
                            />
                            <div className="flex-1 min-w-0">
                              {getStatusBadge(product.status)}
                            </div>
                            {getSyncStatusBadge(product.syncStatus)}
                          </div>

                          {/* Image */}
                          <div className="aspect-square bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 rounded-lg overflow-hidden">
                            {product.images && product.images.length > 0 ? (
                              (() => {
                                // Prioritize approved/selected image, otherwise use position-based sorting
                                let primaryImage
                                const approvedImage = product.images.find((img: any) => img.isApproved || img.isSelected)
                                
                                // Debug logging
                                if (product.images.length > 1) {
                                  console.log(`🖼️ Product "${product.title}" has ${product.images.length} images:`)
                                  product.images.forEach((img: any, idx: number) => {
                                    console.log(`  [${idx}] Position: ${img.position}, isApproved: ${img.isApproved}, isSelected: ${img.isSelected}, URL: ${img.url}`)
                                  })
                                }
                                
                                if (approvedImage) {
                                  // Use the approved image
                                  primaryImage = approvedImage
                                  console.log(`  ✅ Using approved image for "${product.title}"`)
                                  console.log(`  🎯 Approved image URL: ${approvedImage.url}`)
                                  console.log(`  🎯 Enhanced URL: ${approvedImage.enhancedUrl}`)
                                } else {
                                  // Fall back to position-based sorting (existing behavior)
                                  const sortedImages = [...product.images].sort((a, b) => a.position - b.position)
                                  primaryImage = sortedImages[0]
                                  console.log(`  📍 Using position-based image for "${product.title}" (position ${primaryImage.position})`)
                                }
                                
                                // Use enhanced URL if available, otherwise use original
                                const imageUrl = primaryImage.enhancedUrl || primaryImage.url
                                console.log(`  🖼️ Final image URL being displayed: ${imageUrl}`)
                                
                                return (
                                  <img 
                                    src={imageUrl} 
                                    alt={primaryImage.altText || product.title}
                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                    onError={(e) => {
                                      // Fallback to original URL if enhanced fails
                                      if (primaryImage.enhancedUrl && e.currentTarget.src === primaryImage.enhancedUrl) {
                                        e.currentTarget.src = primaryImage.url
                                      }
                                    }}
                                  />
                                )
                              })()
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ImageIcon className="w-12 h-12 text-slate-400" />
                              </div>
                            )}
                          </div>

                          {/* Product Info */}
                          <div className="space-y-2">
                            <div className="space-y-1">
                              <h3 className="font-semibold text-sm line-clamp-2 min-h-[2.5rem]">
                                {product.refinedTitle || product.title}
                              </h3>
                              {product.refinedTitle && product.refinedTitle !== product.title && (
                                <div className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400">
                                  <Sparkle className="w-3 h-3" weight="fill" />
                                  <span className="italic">AI-refined title</span>
                                </div>
                              )}
                              {product.originalTitle && product.originalTitle !== (product.refinedTitle || product.title) && (
                                <p className="text-xs text-muted-foreground line-clamp-1">
                                  Original: {product.originalTitle}
                                </p>
                              )}
                            </div>
                            
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>SKU: {product.sku || 'N/A'}</span>
                              {product.confidence && (
                                <Badge variant="outline" className="text-xs">
                                  {Math.round(product.confidence * 100)}% AI
                                </Badge>
                              )}
                            </div>

                            {product.purchaseOrder && (
                              <div className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 dark:bg-blue-950/30 px-2 py-1 rounded">
                                <Package className="w-3 h-3" />
                                PO: {product.purchaseOrder.number}
                              </div>
                            )}

                            {product.vendor && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Tag className="w-3 h-3" />
                                {product.vendor}
                              </div>
                            )}

                            {/* Pricing */}
                            {product.priceRefined && (
                              <div className="flex items-baseline gap-2">
                                <span className="text-lg font-bold text-primary">
                                  ${product.priceRefined.toFixed(2)}
                                </span>
                                {product.costPrice && (
                                  <span className="text-xs text-muted-foreground line-through">
                                    ${product.costPrice.toFixed(2)}
                                  </span>
                                )}
                                {product.margin && (
                                  <Badge variant="secondary" className="text-xs">
                                    {product.margin.toFixed(0)}% margin
                                  </Badge>
                                )}
                              </div>
                            )}

                            {/* Variants */}
                            {product.variants && product.variants.length > 0 && (
                              <div className="text-xs text-muted-foreground">
                                {product.variants.length} variant{product.variants.length > 1 ? 's' : ''}
                              </div>
                            )}
                          </div>

                          {/* Sync Status */}
                          {syncState && (
                            <div className="pt-2 border-t space-y-2">
                              {syncState.status === 'syncing' && (
                                <Progress value={syncState.progress} className="h-2" />
                              )}
                              {syncState.status === 'success' && (
                                <div className="flex items-center gap-2 text-xs text-green-600">
                                  <Check className="w-4 h-4" weight="bold" />
                                  <span>Synced successfully!</span>
                                </div>
                              )}
                              {syncState.status === 'failed' && (
                                <div className="flex items-center gap-2 text-xs text-red-600">
                                  <X className="w-4 h-4" weight="bold" />
                                  <span>{syncState.error || 'Sync failed'}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* View Details Button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full mt-2 h-8 text-xs hover:bg-primary/10 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation()
                              e.preventDefault()
                              if (onViewProductDetail) {
                                onViewProductDetail(product)
                              } else {
                                console.log('View Details clicked for product:', product.id)
                                toast.info('Product detail view coming soon!', {
                                  description: `Product: ${product.refinedTitle || product.title}`
                                })
                              }
                            }}
                          >
                            <Eye className="w-3.5 h-3.5 mr-1.5" />
                            View Details
                            <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                          </Button>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
            )}
        </div>
      </div>
    </div>
  )
}
