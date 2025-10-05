import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { 
  Package, 
  Bell, 
  Settings, 
  Search,
  Menu,
  ChevronDown,
  User,
  HelpCircle,
  Home,
  ChevronRight,
  Factory,
  FileText,
  Loader2,
  AlertCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { cn } from '@/lib/utils'
import { useShopifyEmbedded } from './ShopifyLayoutWrapper'
import { authenticatedRequest } from '@/lib/shopifyApiService'
import { PurchaseOrderSearchResult, SupplierSearchResult, UnifiedSearchResponse } from '@/types/search'

interface ShopifyHeaderProps {
  currentPage?: string
  breadcrumbs?: Array<{ label: string; href?: string }>
  onNotificationsClick?: () => void
  onSettingsClick?: () => void
  unreadNotifications?: number
  className?: string
  onPurchaseOrderSelected?: (purchaseOrderId: string) => void
  onSupplierSelected?: (supplierId: string) => void
}

// Production-ready Shopify header component
export function ShopifyHeader({
  currentPage = "Dashboard",
  breadcrumbs = [],
  onNotificationsClick,
  onSettingsClick,
  unreadNotifications = 0,
  className,
  onPurchaseOrderSelected,
  onSupplierSelected
}: ShopifyHeaderProps) {
  const isEmbedded = useShopifyEmbedded()
  const [searchQuery, setSearchQuery] = useState('')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<{
    purchaseOrders: PurchaseOrderSearchResult[]
    suppliers: SupplierSearchResult[]
  }>({ purchaseOrders: [], suppliers: [] })
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [showResults, setShowResults] = useState(false)
  const debounceRef = useRef<number>()
  const blurTimeoutRef = useRef<number>()
  const activeFetchRef = useRef<number | null>(null)

  const clearBlurTimeout = () => {
    if (blurTimeoutRef.current) {
      window.clearTimeout(blurTimeoutRef.current)
      blurTimeoutRef.current = undefined
    }
  }

  const handleResultSelect = (type: 'purchaseOrder' | 'supplier', id: string) => {
    clearBlurTimeout()
    setShowResults(false)
    setSearchQuery('')
    setSearchResults({ purchaseOrders: [], suppliers: [] })
    setSearchError(null)

    if (type === 'purchaseOrder') {
      onPurchaseOrderSelected?.(id)
    } else {
      onSupplierSelected?.(id)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchResults.purchaseOrders.length > 0) {
      handleResultSelect('purchaseOrder', searchResults.purchaseOrders[0].id)
      return
    }
    if (searchResults.suppliers.length > 0) {
      handleResultSelect('supplier', searchResults.suppliers[0].id)
      return
    }

    // If no results yet, force open the dropdown so the user can see feedback
    if (searchQuery.trim().length >= 2) {
      setShowResults(true)
    }
  }

  const formatCurrency = (value?: number | null, currencyCode?: string | null) => {
    if (value === null || value === undefined) return null
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currencyCode || 'USD',
        maximumFractionDigits: 2
      }).format(value)
    } catch (error) {
      return `${currencyCode || 'USD'} ${value.toFixed(2)}`
    }
  }

  useEffect(() => {
    const query = searchQuery.trim()

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = undefined
    }

    if (query.length < 2) {
      setIsSearching(false)
      setSearchResults({ purchaseOrders: [], suppliers: [] })
      setSearchError(null)
      setShowResults(false)
      return
    }

    setIsSearching(true)
    setSearchError(null)

    let isCancelled = false

    debounceRef.current = window.setTimeout(async () => {
      const fetchId = Date.now()
      activeFetchRef.current = fetchId

      const response = await authenticatedRequest<UnifiedSearchResponse>(
        `/search?q=${encodeURIComponent(query)}`
      )

      if (isCancelled || activeFetchRef.current !== fetchId) {
        return
      }

      if (!response.success || !response.data) {
        setSearchResults({ purchaseOrders: [], suppliers: [] })
        setSearchError(response.error || 'Unable to search right now')
        setShowResults(true)
      } else {
        setSearchResults({
          purchaseOrders: response.data.purchaseOrders || [],
          suppliers: response.data.suppliers || []
        })
        setSearchError(null)
        setShowResults(true)
      }

      setIsSearching(false)
    }, 250)

    return () => {
      isCancelled = true
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current)
        debounceRef.current = undefined
      }
    }
  }, [searchQuery])

  useEffect(() => () => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current)
    }
    clearBlurTimeout()
  }, [])

  // Mock shop data - in real app, this would come from context/props
  const getShopInfo = () => {
    const urlParams = new URLSearchParams(window.location.search)
    const shop = urlParams.get('shop') || 'demo-shop'
    return {
      name: shop.replace('.myshopify.com', '').replace('-', ' '),
      domain: shop
    }
  }

  const shopInfo = getShopInfo()

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        isEmbedded && "border-0 shadow-sm",
        className
      )}
    >
      <div className="flex h-16 w-full items-center px-4 md:px-6">
        {/* Left Section - Logo & Navigation */}
        <div className="flex items-center gap-3 md:gap-4">
          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden p-1 h-8 w-8"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <Menu className="h-4 w-4" />
            <span className="sr-only">Toggle menu</span>
          </Button>

          {/* Logo & Shop Info */}
          <div className="flex items-center gap-2 md:gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground">
              <Package className="w-4 h-4 md:w-5 md:h-5" />
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-medium leading-none">{shopInfo.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Purchase Orders</div>
            </div>
          </div>
        </div>

        {/* Center Section - Search */}
        <div className="flex-1 flex justify-center px-4 md:px-6">
          <form onSubmit={handleSearch} className="w-full max-w-sm md:max-w-xl">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search purchase orders or suppliers..."
                className="h-9 rounded-lg border-0 bg-muted/50 pl-9 pr-4 text-sm transition-colors focus-visible:bg-background"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => {
                  clearBlurTimeout()
                  if (
                    searchQuery.trim().length >= 2 &&
                    (searchResults.purchaseOrders.length > 0 ||
                      searchResults.suppliers.length > 0 ||
                      !!searchError)
                  ) {
                    setShowResults(true)
                  }
                }}
                onBlur={() => {
                  clearBlurTimeout()
                  blurTimeoutRef.current = window.setTimeout(() => {
                    setShowResults(false)
                  }, 120)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    clearBlurTimeout()
                    setShowResults(false)
                  }
                }}
              />

              {searchQuery.trim().length >= 2 && (showResults || isSearching || searchError) && (
                <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-lg border border-border bg-popover shadow-xl">
                  <div className="max-h-96 overflow-y-auto p-3">
                    {isSearching ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Searching...
                      </div>
                    ) : searchError ? (
                      <div className="flex items-center gap-2 text-sm text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        {searchError}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {searchResults.purchaseOrders.length > 0 && (
                          <div>
                            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              <FileText className="h-3 w-3" />
                              Purchase Orders
                            </div>
                            <div className="space-y-1">
                              {searchResults.purchaseOrders.map((po) => {
                                const formattedTotal = formatCurrency(po.totalAmount, po.currency)
                                return (
                                  <button
                                    key={po.id}
                                    type="button"
                                    className="w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-muted focus:bg-muted focus:outline-none"
                                    onMouseDown={(event) => {
                                      event.preventDefault()
                                      handleResultSelect('purchaseOrder', po.id)
                                    }}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-sm font-medium text-foreground">
                                        {po.number || 'Untitled Purchase Order'}
                                      </span>
                                      {po.status && (
                                        <Badge variant="outline" className="text-[11px] capitalize">
                                          {po.status.replace(/_/g, ' ')}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                                      <span className="truncate">
                                        {po.supplierName || 'Unknown supplier'}
                                      </span>
                                      {formattedTotal && (
                                        <span>{formattedTotal}</span>
                                      )}
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {searchResults.suppliers.length > 0 && (
                          <div>
                            {searchResults.purchaseOrders.length > 0 && <Separator className="my-2" />}
                            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              <Factory className="h-3 w-3" />
                              Suppliers
                            </div>
                            <div className="space-y-1">
                              {searchResults.suppliers.map((supplier) => (
                                <button
                                  key={supplier.id}
                                  type="button"
                                  className="w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-muted focus:bg-muted focus:outline-none"
                                  onMouseDown={(event) => {
                                    event.preventDefault()
                                    handleResultSelect('supplier', supplier.id)
                                  }}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium text-foreground">
                                      {supplier.name}
                                    </span>
                                    {typeof supplier.totalOrders === 'number' && (
                                      <span className="text-xs text-muted-foreground">
                                        {supplier.totalOrders} order{supplier.totalOrders === 1 ? '' : 's'}
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                                    <span className="truncate">
                                      {supplier.contactEmail || supplier.contactPhone || 'No contact info'}
                                    </span>
                                    {supplier.status && (
                                      <Badge variant="outline" className="text-[11px] capitalize">
                                        {supplier.status.replace(/_/g, ' ')}
                                      </Badge>
                                    )}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {searchResults.purchaseOrders.length === 0 && searchResults.suppliers.length === 0 && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <AlertCircle className="h-4 w-4" />
                            No matches found. Try a different search term.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Right Section - Actions & User */}
        <div className="flex items-center gap-1 md:gap-2">
          {/* Notifications */}
          <Button
            variant="ghost"
            size="sm"
            className="relative p-2 h-9 w-9 md:h-10 md:w-10"
            onClick={onNotificationsClick}
          >
            <Bell className="w-4 h-4" />
            {unreadNotifications > 0 && (
              <Badge 
                className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center bg-destructive text-destructive-foreground"
                variant="destructive"
              >
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </Badge>
            )}
          </Button>

          {/* Settings */}
          <Button
            variant="ghost"
            size="sm"
            className="p-2 h-9 w-9 md:h-10 md:w-10"
            onClick={onSettingsClick}
          >
            <Settings className="w-4 h-4" />
          </Button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 h-9 px-3 md:h-10 md:px-4">
                <Avatar className="w-6 h-6">
                  <AvatarFallback className="text-xs">AD</AvatarFallback>
                </Avatar>
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">Admin User</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    admin@{shopInfo.domain}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="w-4 h-4 mr-2" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onSettingsClick}>
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem>
                <HelpCircle className="w-4 h-4 mr-2" />
                Help & Support
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Breadcrumb Navigation (when not embedded) */}
      {!isEmbedded && breadcrumbs.length > 0 && (
        <motion.div
          className="border-t border-border bg-muted/30"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="container max-w-screen-2xl px-3 sm:px-4 py-2">
            <div className="flex items-center space-x-2">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href="/" className="flex items-center gap-1">
                      <Home className="w-3 h-3" />
                      Home
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  {breadcrumbs.map((crumb, index) => (
                    <div key={index} className="flex items-center">
                      <BreadcrumbSeparator>
                        <ChevronRight className="w-4 h-4" />
                      </BreadcrumbSeparator>
                      <BreadcrumbItem>
                        {crumb.href && index < breadcrumbs.length - 1 ? (
                          <BreadcrumbLink href={crumb.href}>
                            {crumb.label}
                          </BreadcrumbLink>
                        ) : (
                          <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                        )}
                      </BreadcrumbItem>
                    </div>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </div>
        </motion.div>
      )}
    </header>
  )
}