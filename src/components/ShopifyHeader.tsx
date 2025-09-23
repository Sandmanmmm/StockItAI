import { useState } from 'react'
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
  ChevronRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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

interface ShopifyHeaderProps {
  currentPage?: string
  breadcrumbs?: Array<{ label: string; href?: string }>
  onNotificationsClick?: () => void
  onSettingsClick?: () => void
  unreadNotifications?: number
  className?: string
}

// Production-ready Shopify header component
export function ShopifyHeader({
  currentPage = "Dashboard",
  breadcrumbs = [],
  onNotificationsClick,
  onSettingsClick,
  unreadNotifications = 0,
  className
}: ShopifyHeaderProps) {
  const isEmbedded = useShopifyEmbedded()
  const [searchQuery, setSearchQuery] = useState('')
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    console.log('Searching for:', searchQuery)
  }

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
          <form onSubmit={handleSearch} className="w-full max-w-sm md:max-w-lg">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                type="search"
                placeholder="Search orders, suppliers..."
                className="pl-9 pr-4 h-9 bg-muted/50 border-0 focus-visible:bg-background transition-colors text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
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

          {/* Help */}
          <Button variant="ghost" size="sm" className="p-2 h-9 w-9 md:h-10 md:w-10">
            <HelpCircle className="w-4 h-4" />
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