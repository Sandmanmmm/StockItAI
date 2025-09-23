import { motion } from 'framer-motion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { 
  FileText, 
  Check, 
  Warning,
  Clock,
  Users,
  ArrowRight,
  TrendUp,
  TrendDown,
  Minus,
  Robot,
  Lightning,
  Globe,
  Database,
  Eye,
  Download,
  Funnel,
  Calendar,
  Gauge,
  ShieldCheck,
  WarningCircle,
  Spinner
} from '@phosphor-icons/react'
import { useDashboardSummary, useSupplierMetrics } from '../hooks/useMerchantData'
import { safeFormatDate, safeFormatTime, cn } from '@/lib/utils'

interface POSummary {
  id: string
  poNumber: string
  supplierName: string
  amount: number
  currency: string
  status: string
  itemCount: number
  uploadedAt: string
  fileName?: string
}

interface SupplierMetric {
  id: string
  name: string
  ordersCount: number
  totalAmount: number
  currency: string
  onTimeRate: number
  averageOrderValue: number
  status: string
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

interface DashboardOverviewProps {
  onShowActiveSuppliers?: () => void
  onShowAllPurchaseOrders?: () => void
  onShowPurchaseOrderDetails?: (orderId: string) => void
}

export function DashboardOverview({ onShowActiveSuppliers, onShowAllPurchaseOrders, onShowPurchaseOrderDetails }: DashboardOverviewProps) {
  // Use authenticated hooks instead of placeholder data
  const { recentPOs, metrics, loading: dashboardLoading, error: dashboardError, refetch: refetchDashboard } = useDashboardSummary()
  const { supplierMetrics, loading: metricsLoading, error: metricsError, refetch: refetchMetrics } = useSupplierMetrics()

  const loading = dashboardLoading || metricsLoading
  const error = dashboardError || metricsError
  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner className="w-8 h-8 animate-spin" />
        <span className="ml-2">Loading dashboard data...</span>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <WarningCircle className="w-12 h-12 text-destructive mb-4" />
        <h3 className="text-lg font-semibold mb-2">Failed to Load Dashboard</h3>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={() => { refetchDashboard(); refetchMetrics(); }} variant="outline">
          Try Again
        </Button>
      </div>
    )
  }

  const getStatusBadge = (status: string, confidence?: number) => {
    switch (status) {
      case 'processed':
      case 'completed':
        return (
          <Badge 
            variant={(confidence && confidence > 90) ? 'success' : 'secondary'} 
            className={cn(
              "gap-1.5 font-medium shadow-modern",
              (confidence && confidence > 90) && "animate-pulse"
            )}
          >
            <Check className="w-3 h-3" />
            Processed {confidence ? `(${confidence}%)` : ''}
          </Badge>
        )
      case 'pending':
        return (
          <Badge 
            variant="warning" 
            className="gap-1.5 shadow-modern animate-pulse"
          >
            <Clock className="w-3 h-3 animate-spin" />
            Processing
          </Badge>
        )
      case 'error':
        return (
          <Badge 
            variant="destructive" 
            className="gap-1.5 shadow-modern hover-glow"
          >
            <Warning className="w-3 h-3 animate-bounce" />
            Needs Review
          </Badge>
        )
      default:
        return null
    }
  }

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return (
          <Badge 
            variant="destructive" 
            className="shadow-modern hover-glow animate-pulse"
          >
            High Priority
          </Badge>
        )
      case 'medium':
        return (
          <Badge 
            variant="warning" 
            className="shadow-modern"
          >
            Medium
          </Badge>
        )
      case 'low':
        return (
          <Badge 
            variant="outline" 
            className="shadow-modern"
          >
            Low
          </Badge>
        )
      default:
        return null
    }
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendUp className="w-4 h-4 text-green-500 animate-bounce" />
      case 'down':
        return <TrendDown className="w-4 h-4 text-red-500 animate-bounce" />
      default:
        return <Minus className="w-4 h-4 text-muted-foreground" />
    }
  }

  const getSupplierStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
        return (
          <Badge 
            variant="success" 
            className="gap-1.5 shadow-modern"
          >
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            Online
          </Badge>
        )
      case 'syncing':
        return (
          <Badge 
            variant="warning" 
            className="gap-1.5 shadow-modern"
          >
            <div className="w-2 h-2 bg-yellow-400 rounded-full animate-ping" />
            Syncing
          </Badge>
        )
      case 'offline':
        return (
          <Badge 
            variant="outline" 
            className="gap-1.5 shadow-modern"
          >
            <div className="w-2 h-2 bg-gray-400 rounded-full" />
            Offline
          </Badge>
        )
      default:
        return null
    }
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Enhanced Stats Overview with Modern Glass Cards - Full Width Responsive */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-4">
        <motion.div variants={cardVariants}>
          <Card className="relative overflow-hidden glass shadow-modern hover-lift border-panel bg-gradient-to-br from-primary/10 to-primary/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total POs</CardTitle>
              <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-lg">
                <FileText className="h-5 w-5 text-primary-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold gradient-text">{metrics.totalPOs || 0}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary">
                  <Database className="w-3 h-3" />
                  All time
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {metrics.pendingPOs || 0} pending • {metrics.processingPOs || 0} processing • {metrics.completedPOs || 0} completed
              </div>
            </CardContent>
            <div className="absolute top-0 right-0 w-20 h-20 bg-primary/5 rounded-full -mr-10 -mt-10 blur-xl" />
          </Card>
        </motion.div>

        <motion.div variants={cardVariants}>
          <Card className="relative overflow-hidden glass shadow-modern hover-lift border-panel bg-gradient-to-br from-green-500/10 to-green-500/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Value</CardTitle>
              <div className="p-3 rounded-xl bg-gradient-to-br from-green-500 to-green-600 shadow-lg">
                <Database className="h-5 w-5 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                {metrics.currency} {metrics.totalAmount?.toLocaleString() || '0'}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 text-green-600">
                  <Lightning className="w-3 h-3" />
                  Total processed
                </div>
              </div>
            </CardContent>
            <div className="absolute top-0 right-0 w-20 h-20 bg-green-500/5 rounded-full -mr-10 -mt-10 blur-xl" />
          </Card>
        </motion.div>

        <motion.div variants={cardVariants}>
          <Card className="group relative overflow-hidden glass shadow-modern hover-lift border-panel bg-gradient-to-br from-blue-500/10 to-blue-500/5 cursor-pointer transition-all duration-300"
                onClick={() => {
                  onShowActiveSuppliers?.()
                  // Show notification when accessing detailed view
                  setTimeout(() => {
                    // This would be handled by the notificationService
                    console.log('Accessing Active Suppliers detailed view')
                  }, 100)
                }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Suppliers</CardTitle>
              <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg">
                <Globe className="h-5 w-5 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">{metrics.activeSuppliers || 0}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/10 text-blue-600">
                  <Users className="w-3 h-3" />
                  of {metrics.totalSuppliers || 0} total
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-1">Click to manage suppliers</div>
              <div className="flex items-center justify-center mt-3 opacity-0 group-hover:opacity-100 transition-all duration-300">
                <span className="text-xs text-blue-600 font-medium flex items-center gap-1 px-3 py-1 rounded-full bg-blue-500/10">
                  View Details <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </CardContent>
            <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/5 rounded-full -mr-10 -mt-10 blur-xl" />
          </Card>
        </motion.div>

        <motion.div variants={cardVariants}>
          <Card className="relative overflow-hidden glass shadow-modern hover-lift border-panel bg-gradient-to-br from-purple-500/10 to-purple-500/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Processing Status</CardTitle>
              <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 shadow-lg">
                <Clock className="h-5 w-5 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-600">{metrics.processingPOs || 0}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-purple-500/10 text-purple-600">
                  <Clock className="w-3 h-3" />
                  In progress
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {metrics.pendingPOs || 0} pending analysis
              </div>
            </CardContent>
            <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/5 rounded-full -mr-10 -mt-10 blur-xl" />
          </Card>
        </motion.div>
      </div>

      {/* Enhanced Recent PO Activity */}
      <div className="grid md:grid-cols-2 lg:grid-cols-5 border-2 border-blue-500">
        <motion.div variants={cardVariants} className="md:col-span-1 lg:col-span-3 border-2 border-red-500 pr-4 md:pr-6 lg:pr-8">
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl">Recent Purchase Orders</CardTitle>
                  <CardDescription className="mt-1">
                    Latest PO processing results with AI confidence scores and priority levels
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    <Funnel className="w-4 h-4 mr-2" />
                    Filter
                  </Button>
                  <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                  <Button size="sm" onClick={onShowAllPurchaseOrders}>
                    <Eye className="w-4 h-4 mr-2" />
                    View All
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(recentPOs || []).map((po, index) => (
                  <motion.div
                    key={po.id}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: index * 0.1 }}
                    className="group flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/30 hover:border-muted-foreground/20 transition-all cursor-pointer"
                    onClick={() => onShowPurchaseOrderDetails?.(po.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                          po.status === 'processed' 
                            ? 'bg-success/10 border border-success/20' 
                            : po.status === 'error'
                            ? 'bg-destructive/10 border border-destructive/20'
                            : 'bg-warning/10 border border-warning/20'
                        }`}>
                          <FileText className={`w-5 h-5 ${
                            po.status === 'processed' ? 'text-success' :
                            po.status === 'error' ? 'text-destructive' : 'text-warning'
                          }`} />
                        </div>
                        {/* Remove priority indicator since it's not in new data */}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <div className="font-semibold">{po.poNumber}</div>
                          {/* Remove priority badge since priority not in new data */}
                        </div>
                        <div className="text-sm text-muted-foreground">{po.supplierName}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {po.currency} {po.amount?.toLocaleString?.() || '0'} • {po.itemCount || 0} items
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm font-medium">
                          {safeFormatDate(po.uploadedAt)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {safeFormatTime(po.uploadedAt)}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        {getStatusBadge(po.status)}
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Supplier Performance */}
        <motion.div variants={cardVariants} className="md:col-span-1 lg:col-span-2 border-2 border-green-500 pl-4 md:pl-6 lg:pl-8">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-xl">Supplier Performance</CardTitle>
              <CardDescription>
                Real-time accuracy and processing metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {supplierMetrics?.map((supplier, index) => (
                  <motion.div
                    key={supplier.name}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm">{supplier.name}</div>
                      {getSupplierStatusBadge(supplier.status)}
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1">
                          <Gauge className="w-3 h-3" />
                          On-Time Rate
                        </span>
                        <span className="flex items-center gap-1 font-medium">
                          {supplier.onTimeRate}%
                          {/* Remove trend icon as it's not in new data structure */}
                        </span>
                      </div>
                      <Progress value={supplier.onTimeRate} className="h-1.5" />
                    </div>

                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{supplier.ordersCount} Orders</span>
                      <span>{supplier.currency} {supplier.averageOrderValue.toFixed(0)} avg</span>
                    </div>

                    {index < supplierMetrics.length - 1 && (
                      <Separator className="mt-4" />
                    )}
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Enhanced System Health */}
      <motion.div variants={cardVariants}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">System Health & Performance</CardTitle>
                <CardDescription className="mt-1">
                  Real-time monitoring of AI processing engine and supplier connections
                </CardDescription>
              </div>
              <Button variant="outline" size="sm">
                <Calendar className="w-4 h-4 mr-2" />
                View History
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-success/10">
                    <Robot className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <div className="font-semibold">AI Processing Engine</div>
                    <div className="text-sm text-muted-foreground">Core ML Pipeline</div>
                  </div>
                </div>
                <Badge className="bg-success/10 text-success border-success/20 w-full justify-center py-2">
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  Fully Operational
                </Badge>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Uptime</span>
                    <span className="font-medium">99.8%</span>
                  </div>
                  <Progress value={99.8} className="h-2" />
                  <div className="text-xs text-muted-foreground">30 days: 99.8%</div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-warning/10">
                    <Globe className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <div className="font-semibold">Supplier Connections</div>
                    <div className="text-sm text-muted-foreground">API Integrations</div>
                  </div>
                </div>
                <Badge className="bg-warning/10 text-warning border-warning/20 w-full justify-center py-2">
                  <WarningCircle className="w-4 h-4 mr-2" />
                  Minor Issues Detected
                </Badge>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Connected</span>
                    <span className="font-medium">7 of 8</span>
                  </div>
                  <Progress value={87.5} className="h-2" />
                  <div className="text-xs text-muted-foreground">Premier Wholesale offline</div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Database className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-semibold">Data Processing</div>
                    <div className="text-sm text-muted-foreground">Queue & Storage</div>
                  </div>
                </div>
                <Badge className="bg-success/10 text-success border-success/20 w-full justify-center py-2">
                  <Check className="w-4 h-4 mr-2" />
                  All Systems Normal
                </Badge>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Queue</span>
                    <span className="font-medium">3 pending</span>
                  </div>
                  <Progress value={15} className="h-2" />
                  <div className="text-xs text-muted-foreground">Avg wait: 1.2 minutes</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
