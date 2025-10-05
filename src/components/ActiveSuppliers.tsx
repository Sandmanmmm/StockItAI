import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
// Force rebuild: Updated supplier metrics calculation
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { 
  Globe, 
  Lightning,
  TrendUp,
  TrendDown,
  Minus,
  MagnifyingGlass as Search,
  Plus,
  Gear as Settings,
  Eye,
  PencilSimple as Edit,
  Trash,
  Clock,
  Calendar,
  Gauge,
  ShieldCheck,
  Warning,
  CheckCircle,
  X,
  ArrowLeft,
  WarningCircle,
  DownloadSimple as Download,
  UploadSimple as Upload,
  FunnelSimple as Filter,
  DotsThreeVertical as MoreVertical,
  Link,
  Key,
  Bell,
  Pulse,
  Lightning as Zap,
  Database as Server,
  WifiHigh as Wifi,
  WifiSlash as WifiOff,
  ArrowsClockwise
} from '@phosphor-icons/react'
import { useSuppliers } from '../hooks/useMerchantData'
import { safeFormatDate, safeFormatTime } from '@/lib/utils'
import SupplierMetricsCard from './SupplierMetricsCard'
import CreateSupplierDialog from './CreateSupplierDialog'

interface Supplier {
  id: string
  name: string
  contactEmail?: string
  contactPhone?: string
  status: string
  totalOrders: number
  totalSpent: number
  currency: string
  lastOrderDate?: string
  paymentTerms?: string
  categories: string[]
  createdAt: string
}

interface ActiveSuppliersProps {
  onBack: () => void
  initialSupplierId?: string
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
}

const cardVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1 }
}

export function ActiveSuppliers({ onBack, initialSupplierId }: ActiveSuppliersProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('name')
  
  // Track if we've already auto-selected to prevent re-opening
  const hasAutoSelectedRef = useRef(false)

  // Use authenticated hook for suppliers data
  const { suppliers, total, loading, error, refetch } = useSuppliers()

  // Auto-select supplier if initialSupplierId is provided (only once)
  useEffect(() => {
    if (initialSupplierId && suppliers && suppliers.length > 0 && !hasAutoSelectedRef.current) {
      const supplier = suppliers.find(s => s.id === initialSupplierId)
      if (supplier) {
        setSelectedSupplier(supplier)
        hasAutoSelectedRef.current = true
      }
    }
  }, [initialSupplierId, suppliers])

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <ArrowsClockwise className="w-8 h-8 animate-spin" />
        <span className="ml-2">Loading suppliers...</span>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <WarningCircle className="w-12 h-12 text-destructive mb-4" />
        <h3 className="text-lg font-semibold mb-2">Failed to Load Suppliers</h3>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={() => refetch()} variant="outline">
          Try Again
        </Button>
      </div>
    )
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
        return <Wifi className="w-4 h-4 text-success" />
      case 'offline':
        return <WifiOff className="w-4 h-4 text-muted-foreground" />
      case 'syncing':
        return <ArrowsClockwise className="w-4 h-4 text-warning animate-spin" />
      case 'error':
        return <WarningCircle className="w-4 h-4 text-destructive" />
      default:
        return <Server className="w-4 h-4 text-muted-foreground" />
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
        return (
          <Badge className="bg-success/10 text-success border-success/20">
            <div className="w-2 h-2 rounded-full bg-success mr-1" />
            Online
          </Badge>
        )
      case 'syncing':
        return (
          <Badge className="bg-warning/10 text-warning border-warning/20">
            <div className="w-2 h-2 rounded-full bg-warning animate-pulse mr-1" />
            Syncing
          </Badge>
        )
      case 'offline':
        return (
          <Badge variant="outline" className="text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-muted-foreground mr-1" />
            Offline
          </Badge>
        )
      case 'error':
        return (
          <Badge variant="destructive">
            <div className="w-2 h-2 rounded-full bg-destructive-foreground mr-1" />
            Error
          </Badge>
        )
      default:
        return null
    }
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendUp className="w-4 h-4 text-success" />
      case 'down':
        return <TrendDown className="w-4 h-4 text-destructive" />
      default:
        return <Minus className="w-4 h-4 text-muted-foreground" />
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-destructive border-destructive/20 bg-destructive/10'
      case 'medium':
        return 'text-warning border-warning/20 bg-warning/10'
      case 'low':
        return 'text-muted-foreground border-muted bg-muted/50'
      default:
        return 'text-muted-foreground border-muted bg-muted/50'
    }
  }

  const filteredSuppliers = (suppliers || [])
    .filter(supplier => 
      (filterStatus === 'all' || supplier.status === filterStatus) &&
      (searchTerm === '' || 
        supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (supplier.contactEmail && supplier.contactEmail.toLowerCase().includes(searchTerm.toLowerCase())) ||
        supplier.categories.some(cat => cat.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'totalSpent':
          return b.totalSpent - a.totalSpent
        case 'lastOrder':
          return new Date(b.lastOrderDate || 0).getTime() - new Date(a.lastOrderDate || 0).getTime()
        case 'totalOrders':
          return b.totalOrders - a.totalOrders
        default:
          return 0
      }
    })

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Active Suppliers</h1>
            <p className="text-muted-foreground">
              Manage and monitor your supplier connections and performance
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <CreateSupplierDialog onSuccess={() => refetch()} />
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div variants={cardVariants}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/10">
                  <CheckCircle className="w-5 h-5 text-success" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {(suppliers || []).filter(s => s.status === 'online').length}
                  </div>
                  <div className="text-xs text-muted-foreground">Online</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={cardVariants}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-warning/10">
                  <Pulse className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {(suppliers || []).filter(s => s.status === 'syncing').length}
                  </div>
                  <div className="text-xs text-muted-foreground">Syncing</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={cardVariants}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <X className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {(suppliers || []).filter(s => ['offline', 'error'].includes(s.status)).length}
                  </div>
                  <div className="text-xs text-muted-foreground">Issues</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={cardVariants}>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Gauge className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {Math.round((suppliers || []).reduce((acc, s) => acc + s.totalSpent, 0) / (suppliers || []).length) || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">Avg Order Value</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Filters & Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search suppliers by name, company, or categories..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="syncing">Syncing</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="accuracy">Accuracy</SelectItem>
                  <SelectItem value="lastSync">Last Sync</SelectItem>
                  <SelectItem value="totalPOs">Total POs</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Suppliers List */}
      <div className="grid gap-4 lg:grid-cols-2">
        {filteredSuppliers.map((supplier, index) => (
          <motion.div
            key={supplier.id}
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: index * 0.05 }}
          >
            <Card className="group hover:shadow-lg transition-all duration-200 cursor-pointer"
                  onClick={() => setSelectedSupplier(supplier)}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center bg-gradient-to-br ${
                      supplier.status === 'online' ? 'from-success/20 to-success/10' :
                      supplier.status === 'syncing' ? 'from-warning/20 to-warning/10' :
                      supplier.status === 'error' ? 'from-destructive/20 to-destructive/10' :
                      'from-muted to-muted/50'
                    }`}>
                      {getStatusIcon(supplier.status)}
                    </div>
                    <div>
                      <div className="font-semibold text-lg">{supplier.name}</div>
                      <div className="text-sm text-muted-foreground">{supplier.contactEmail || 'No email'}</div>
                      <div className="flex items-center gap-2 mt-1">
                        {getStatusBadge(supplier.status)}
                        <Badge variant="outline">
                          {supplier.totalOrders} Orders
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" onClick={(e) => e.stopPropagation()}>
                        <Settings className="w-4 h-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Configure {supplier.name}</DialogTitle>
                        <DialogDescription>
                          Manage supplier settings, API configuration, and sync preferences
                        </DialogDescription>
                      </DialogHeader>
                      <SupplierConfigForm supplier={supplier} />
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Performance Metrics */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold">${supplier.totalSpent.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">
                      Total Spent
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{supplier.totalOrders}</div>
                    <div className="text-xs text-muted-foreground">Total Orders</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">${Math.round(supplier.totalSpent / (supplier.totalOrders || 1)).toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">Avg Order</div>
                  </div>
                </div>

                <Separator />

                {/* Categories & Info */}
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {supplier.categories.map((category) => (
                      <Badge key={category} variant="secondary" className="text-xs">
                        {category}
                      </Badge>
                    ))}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {supplier.lastOrderDate ? `Last order: ${safeFormatDate(supplier.lastOrderDate)}` : 'No recent orders'}
                  </div>
                </div>

                {/* Progress Bar for Order Activity */}
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Order Activity</span>
                    <span>{supplier.totalOrders > 0 ? 'Active' : 'Inactive'}</span>
                  </div>
                  <Progress value={Math.min(supplier.totalOrders * 10, 100)} className="h-2" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Supplier Detail Modal */}
      <Dialog open={!!selectedSupplier} onOpenChange={() => setSelectedSupplier(null)}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
          {selectedSupplier && (
            <SupplierDetailView supplier={selectedSupplier} />
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

// Supplier Detail View Component
function SupplierDetailView({ supplier }: { supplier: Supplier }) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
        return (
          <Badge className="bg-success/10 text-success border-success/20">
            <div className="w-2 h-2 rounded-full bg-success mr-1" />
            Online
          </Badge>
        )
      case 'syncing':
        return (
          <Badge className="bg-warning/10 text-warning border-warning/20">
            <div className="w-2 h-2 rounded-full bg-warning animate-pulse mr-1" />
            Syncing
          </Badge>
        )
      case 'offline':
        return (
          <Badge variant="outline" className="text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-muted-foreground mr-1" />
            Offline
          </Badge>
        )
      case 'error':
        return (
          <Badge variant="destructive">
            <div className="w-2 h-2 rounded-full bg-destructive-foreground mr-1" />
            Error
          </Badge>
        )
      default:
        return null
    }
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendUp className="w-4 h-4 text-success" />
      case 'down':
        return <TrendDown className="w-4 h-4 text-destructive" />
      default:
        return <Minus className="w-4 h-4 text-muted-foreground" />
    }
  }
  return (
    <>
      <DialogHeader>
        <div className="flex items-center justify-between">
          <div>
            <DialogTitle className="text-2xl">{supplier.name}</DialogTitle>
            <DialogDescription className="mt-1">
              {supplier.contactEmail || 'No contact email'} • {supplier.categories.join(', ') || 'No categories'}
            </DialogDescription>
          </div>
          {getStatusBadge(supplier.status)}
        </div>
      </DialogHeader>

      <Tabs defaultValue="overview" className="mt-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Performance Metrics Tab */}
        <TabsContent value="performance" className="mt-4">
          <SupplierMetricsCard supplierId={supplier.id} />
        </TabsContent>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-sm font-medium">Email</Label>
                  <div className="text-sm text-muted-foreground">{supplier.contactEmail || 'Not provided'}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Phone</Label>
                  <div className="text-sm text-muted-foreground">{supplier.contactPhone || 'Not provided'}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Categories</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {supplier.categories.map((category) => (
                      <Badge key={category} variant="secondary" className="text-xs">
                        {category}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Business Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm">Total Spent</span>
                  <span className="font-medium">${supplier.totalSpent.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Avg Order Value</span>
                  <span className="font-medium">${Math.round(supplier.totalSpent / (supplier.totalOrders || 1)).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Total Orders</span>
                  <span className="font-medium">{supplier.totalOrders}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Member Since</span>
                  <span className="font-medium">{safeFormatDate(supplier.createdAt)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {supplier.paymentTerms && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Payment Terms</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{supplier.paymentTerms}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="performance" className="mt-4">
          <div className="grid gap-6">
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-3xl font-bold">{supplier.totalOrders}</div>
                  <div className="text-sm text-muted-foreground">
                    Total Orders
                  </div>
                  <Progress value={Math.min(supplier.totalOrders * 2, 100)} className="h-2 mt-2" />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-3xl font-bold">${Math.round(supplier.totalSpent / (supplier.totalOrders || 1)).toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">Avg Order Value</div>
                  <div className="text-xs text-muted-foreground mt-2">Per order</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-3xl font-bold">{supplier.status === 'active' ? '100' : '50'}%</div>
                  <div className="text-sm text-muted-foreground">Activity Level</div>
                  <Progress value={supplier.status === 'active' ? 100 : 50} className="h-2 mt-2" />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="configuration" className="mt-4">
          <SupplierConfigForm supplier={supplier} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Sync History</CardTitle>
              <CardDescription>Recent synchronization activities and results</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground text-center py-8">
                Sync history would be displayed here with detailed logs and timestamps.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  )
}

// Supplier Configuration Form Component
function SupplierConfigForm({ supplier }: { supplier?: Supplier }) {
  return (
    <Tabs defaultValue="basic" className="mt-4">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="basic">Basic Info</TabsTrigger>
        <TabsTrigger value="api">API Settings</TabsTrigger>
        <TabsTrigger value="sync">Sync Settings</TabsTrigger>
      </TabsList>

      <TabsContent value="basic" className="space-y-4 mt-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">Supplier Name</Label>
            <Input id="name" defaultValue={supplier?.name || ''} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactEmail">Contact Email</Label>
            <Input id="contactEmail" type="email" defaultValue={supplier?.contactEmail || ''} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactPhone">Contact Phone</Label>
            <Input id="contactPhone" defaultValue={supplier?.contactPhone || ''} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Input id="status" defaultValue={supplier?.status || ''} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="paymentTerms">Payment Terms</Label>
            <Input id="paymentTerms" defaultValue={supplier?.paymentTerms || ''} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="categories">Categories</Label>
          <Input id="categories" defaultValue={supplier?.categories.join(', ') || ''} placeholder="Electronics, Components, etc." />
        </div>
      </TabsContent>

      <TabsContent value="api" className="space-y-4 mt-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="totalSpent">Total Spent</Label>
            <Input id="totalSpent" value={`$${supplier?.totalSpent.toLocaleString()}`} readOnly />
          </div>
          <div className="space-y-2">
            <Label htmlFor="totalOrders">Total Orders</Label>
            <Input id="totalOrders" value={supplier?.totalOrders.toString()} readOnly />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <Input id="currency" value={supplier?.currency || 'USD'} readOnly />
          </div>
        </div>
      </TabsContent>

      <TabsContent value="sync" className="space-y-4 mt-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="lastOrderDate">Last Order Date</Label>
            <Input id="lastOrderDate" value={supplier?.lastOrderDate ? safeFormatDate(supplier.lastOrderDate) : 'No orders yet'} readOnly />
          </div>
          <div className="space-y-2">
            <Label htmlFor="createdAt">Member Since</Label>
            <Input id="createdAt" value={safeFormatDate(supplier?.createdAt)} readOnly />
          </div>
        </div>
      </TabsContent>

      <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
        <Button variant="outline">Cancel</Button>
        <Button>Save Configuration</Button>
      </div>
    </Tabs>
  )
}
