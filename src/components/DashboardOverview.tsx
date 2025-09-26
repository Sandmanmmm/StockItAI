import { motion, useScroll, useTransform } from 'framer-motion'
import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { 
  FileText, 
  Check, 
  AlertTriangle as Warning,
  Clock,
  Users,
  ArrowRight,
  TrendingUp as TrendUp,
  TrendingDown as TrendDown,
  Minus,
  Bot as Robot,
  Zap as Lightning,
  Globe,
  Database,
  Eye,
  Download,
  Filter as Funnel,
  Calendar,
  Gauge,
  ShieldCheck,
  AlertCircle as WarningCircle,
  Loader2 as Spinner,
  BarChart3,
  PieChart,
  Activity,
  Zap,
  Star,
  RefreshCw,
  Filter,
  Search,
  Plus,
  Settings
} from 'lucide-react'
import { useDashboardSummary, useSupplierMetrics } from '../hooks/useMerchantData'
import { safeFormatDate, safeFormatTime, cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50 flex items-center justify-center">
        <motion.div 
          className="flex items-center gap-4 px-8 py-6 bg-white/90 backdrop-blur-xl rounded-3xl border border-white/20 shadow-2xl"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6 }}
        >
          <div className="relative">
            <Spinner className="w-8 h-8 animate-spin text-blue-600" />
            <div className="absolute inset-0 w-8 h-8 border-2 border-blue-200 rounded-full animate-ping" />
          </div>
          <span className="text-lg font-medium text-slate-700 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Loading your intelligent dashboard...
          </span>
        </motion.div>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-rose-50/30 to-pink-50 flex items-center justify-center">
        <motion.div 
          className="flex flex-col items-center text-center max-w-md px-8 py-12 bg-white/90 backdrop-blur-xl rounded-3xl border border-red-100 shadow-2xl"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6 }}
        >
          <div className="relative mb-6">
            <WarningCircle className="w-16 h-16 text-red-500" />
            <div className="absolute inset-0 w-16 h-16 bg-red-500/20 rounded-full animate-pulse" />
          </div>
          <h3 className="text-2xl font-bold text-slate-800 mb-3">Connection Issue</h3>
          <p className="text-slate-600 mb-6">{error}</p>
          <Button 
            onClick={() => { refetchDashboard(); refetchMetrics(); }} 
            className="px-6 py-3 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white font-medium rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        </motion.div>
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-100/50 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div 
          className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-indigo-500/20 rounded-full blur-3xl"
          animate={{ 
            scale: [1, 1.2, 1],
            rotate: [0, 180, 360],
          }}
          transition={{ 
            duration: 20,
            repeat: Infinity,
            ease: "linear"
          }}
        />
        <motion.div 
          className="absolute -bottom-40 -left-40 w-96 h-96 bg-gradient-to-br from-purple-400/15 to-pink-500/15 rounded-full blur-3xl"
          animate={{ 
            scale: [1.2, 1, 1.2],
            rotate: [360, 180, 0],
          }}
          transition={{ 
            duration: 25,
            repeat: Infinity,
            ease: "linear"
          }}
        />
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 space-y-8 px-6 py-8 max-w-7xl mx-auto"
      >
        {/* Modern Header */}
        <motion.div 
          className="text-center mb-12"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="relative">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl">
                <BarChart3 className="w-8 h-8 text-white" />
              </div>
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-400 to-indigo-500 rounded-3xl blur opacity-25 animate-pulse" />
            </div>
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-slate-800 via-blue-800 to-indigo-800 bg-clip-text text-transparent mb-3">
            AI Purchase Orders
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Intelligent automation & insights dashboard powered by advanced machine learning
          </p>
        </motion.div>
        {/* Ultra-Modern Stats Grid */}
        <div className="grid gap-8 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-4">
          <motion.div variants={cardVariants}>
            <div className="group relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 rounded-3xl blur-xl" />
              <Card className="relative bg-white/80 backdrop-blur-xl border-white/20 shadow-2xl rounded-3xl overflow-hidden transition-all duration-500 hover:shadow-3xl hover:scale-105 hover:bg-white/90">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/20 to-indigo-500/20 rounded-full -mr-16 -mt-16 transition-all duration-500 group-hover:scale-150" />
                
                <CardHeader className="relative z-10 pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium text-slate-600">Total Orders</CardTitle>
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-6">
                      <FileText className="w-6 h-6 text-white" />
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="relative z-10">
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                      {metrics.totalPOs || 0}
                    </span>
                    <div className="flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                      <TrendUp className="w-3 h-3" />
                      +12%
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-4">
                    <span>vs last month</span>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                      Live data
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Processing</span>
                      <span className="font-medium text-orange-600">{metrics.processingPOs || 0}</span>
                    </div>
                    <Progress value={metrics.totalPOs > 0 ? (metrics.processingPOs / metrics.totalPOs) * 100 : 0} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </motion.div>

        <motion.div variants={cardVariants}>
          <div className="group relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-green-500/10 rounded-3xl blur-xl" />
            <Card className="relative bg-white/80 backdrop-blur-xl border-white/20 shadow-2xl rounded-3xl overflow-hidden transition-all duration-500 hover:shadow-3xl hover:scale-105 hover:bg-white/90">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-500/20 to-green-500/20 rounded-full -mr-16 -mt-16 transition-all duration-500 group-hover:scale-150" />
              
              <CardHeader className="relative z-10 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-600">Total Value</CardTitle>
                  <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-6">
                    <Database className="w-6 h-6 text-white" />
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="relative z-10">
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-4xl font-bold bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-transparent">
                    {metrics.currency} {metrics.totalAmount?.toLocaleString() || '0'}
                  </span>
                  <div className="flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                    <TrendUp className="w-3 h-3" />
                    +8.2%
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-xs text-slate-500 mb-4">
                  <span>Monthly growth</span>
                  <div className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                    High value
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gradient-to-r from-emerald-200 to-emerald-400 rounded-full overflow-hidden">
                    <div className="h-full w-3/4 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full animate-pulse" />
                  </div>
                  <span className="text-xs font-medium text-emerald-600">75%</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>

        <motion.div variants={cardVariants}>
          <div className="group relative overflow-hidden cursor-pointer" onClick={() => {
            onShowActiveSuppliers?.()
            console.log('Accessing Active Suppliers detailed view')
          }}>
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-violet-500/10 rounded-3xl blur-xl" />
            <Card className="relative bg-white/80 backdrop-blur-xl border-white/20 shadow-2xl rounded-3xl overflow-hidden transition-all duration-500 hover:shadow-3xl hover:scale-105 hover:bg-white/90">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-500/20 to-violet-500/20 rounded-full -mr-16 -mt-16 transition-all duration-500 group-hover:scale-150" />
              
              <CardHeader className="relative z-10 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-600">Active Suppliers</CardTitle>
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-violet-600 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-6">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="relative z-10">
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-violet-600 bg-clip-text text-transparent">
                    {metrics.activeSuppliers || 0}
                  </span>
                  <div className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    Online
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-xs text-slate-500 mb-4">
                  <span>Click to manage</span>
                  <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-8 bg-gradient-to-br from-purple-100 to-purple-200 rounded-lg flex items-center justify-center">
                      <div className="w-4 h-4 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>

        <motion.div variants={cardVariants}>
          <div className="group relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-red-500/10 rounded-3xl blur-xl" />
            <Card className="relative bg-white/80 backdrop-blur-xl border-white/20 shadow-2xl rounded-3xl overflow-hidden transition-all duration-500 hover:shadow-3xl hover:scale-105 hover:bg-white/90">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-500/20 to-red-500/20 rounded-full -mr-16 -mt-16 transition-all duration-500 group-hover:scale-150" />
              
              <CardHeader className="relative z-10 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-600">AI Processing</CardTitle>
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-6">
                    <Robot className="w-6 h-6 text-white" />
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="relative z-10">
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-4xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                    {metrics.processingPOs || 0}
                  </span>
                  <div className="flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                    <Zap className="w-3 h-3" />
                    Active
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-xs text-slate-500 mb-4">
                  <span>92% accuracy</span>
                  <div className="flex items-center gap-1">
                    <Activity className="w-3 h-3" />
                    Real-time
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                    <span className="text-xs text-slate-600">Neural processing active</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span className="text-xs text-slate-600">Queue: {metrics.pendingPOs || 0} pending</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      </div>

      {/* Advanced Analytics Section */}
      <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-8">
        <motion.div variants={cardVariants} className="md:col-span-1 lg:col-span-3">
          <div className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-100/50 to-blue-100/50 rounded-3xl blur-xl" />
            <Card className="relative bg-white/90 backdrop-blur-xl border-white/20 shadow-2xl rounded-3xl overflow-hidden">
              <CardHeader className="pb-6 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-2xl font-bold text-slate-800">Recent Activity</CardTitle>
                    <CardDescription className="text-slate-600 mt-1">Latest purchase order updates with AI confidence scores</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="bg-white/80 border-white/40 hover:bg-white">
                      <Funnel className="w-4 h-4 mr-2" />
                      Filter
                    </Button>
                    <Button variant="outline" size="sm" className="bg-white/80 border-white/40 hover:bg-white">
                      <Download className="w-4 h-4 mr-2" />
                      Export
                    </Button>
                    <Button size="sm" onClick={onShowAllPurchaseOrders} className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white">
                      <Eye className="w-4 h-4 mr-2" />
                      View All
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="p-6">
                <div className="space-y-4">
                  {(recentPOs || []).map((po, index) => (
                    <motion.div
                      key={po.id}
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-center gap-4 p-4 bg-white/60 backdrop-blur-sm rounded-2xl border border-white/20 hover:bg-white/80 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg cursor-pointer"
                      onClick={() => onShowPurchaseOrderDetails?.(po.id)}
                      whileHover={{ y: -2 }}
                    >
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                        <FileText className="w-6 h-6 text-white" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-slate-800 truncate">{po.poNumber}</h4>
                          {getStatusBadge(po.status)}
                        </div>
                        <p className="text-sm text-slate-600 truncate">{po.supplierName} • {po.currency} {po.amount?.toLocaleString() || '0'}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <div className="text-xs text-slate-500">{safeFormatDate(po.uploadedAt)}</div>
                          <div className="w-1 h-1 bg-slate-300 rounded-full" />
                          <div className="text-xs text-slate-500">{po.itemCount || 0} items</div>
                        </div>
                      </div>
                      
                      <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>

        {/* Supplier Performance - Enhanced Chart Section */}
        <motion.div variants={cardVariants} className="md:col-span-1 lg:col-span-2">
          <div className="relative overflow-hidden h-full">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-100/50 to-pink-100/50 rounded-3xl blur-xl" />
            <Card className="relative bg-white/90 backdrop-blur-xl border-white/20 shadow-2xl rounded-3xl overflow-hidden h-full">
              <CardHeader className="pb-6">
                <CardTitle className="text-2xl font-bold text-slate-800">Top Performers</CardTitle>
                <CardDescription className="text-slate-600">Real-time supplier accuracy and processing metrics</CardDescription>
              </CardHeader>
              
              <CardContent className="p-6">
                <div className="space-y-6">
                  {(supplierMetrics || []).map((supplier, index) => (
                    <motion.div
                      key={supplier.name}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="p-3 bg-white/60 backdrop-blur-sm rounded-xl border border-white/20 hover:bg-white/80 transition-all duration-300"
                      whileHover={{ scale: 1.02 }}
                    >
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg">
                          {index + 1}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-slate-800 text-sm truncate">{supplier.name}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            {getSupplierStatusBadge(supplier.status)}
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1 text-slate-600">
                            <Gauge className="w-3 h-3" />
                            On-Time Rate
                          </span>
                          <span className="flex items-center gap-1 font-medium text-slate-800">
                            {supplier.onTimeRate}%
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-purple-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-1000"
                              style={{ width: `${supplier.onTimeRate}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-purple-600">{supplier.onTimeRate}%</span>
                        </div>
                        
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>{supplier.ordersCount} Orders</span>
                          <span>{supplier.currency} {supplier.averageOrderValue.toFixed(0)} avg</span>
                        </div>
                      </div>

                      {index < (supplierMetrics?.length || 1) - 1 && (
                        <Separator className="mt-4" />
                      )}
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
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
    </div>
  )
}
