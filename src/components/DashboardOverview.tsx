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
  onShowSupplierDetails?: (supplierId: string) => void
}

export function DashboardOverview({ onShowActiveSuppliers, onShowAllPurchaseOrders, onShowPurchaseOrderDetails, onShowSupplierDetails }: DashboardOverviewProps) {
  // Use authenticated hooks instead of placeholder data
  const { recentPOs, metrics, loading: dashboardLoading, error: dashboardError, refetch: refetchDashboard } = useDashboardSummary()
  const { supplierMetrics, loading: metricsLoading, error: metricsError, refetch: refetchMetrics } = useSupplierMetrics()

  console.log('🎨 [DASHBOARD COMPONENT] Render state:', {
    dashboardLoading,
    metricsLoading,
    dashboardError,
    metricsError,
    recentPOsLength: recentPOs?.length || 0,
    metricsData: metrics,
    supplierMetricsLength: supplierMetrics?.length || 0
  })

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
          {/* Premium Logo Section */}
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="relative group">
              {/* Glow effect */}
              <div className="absolute -inset-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-3xl blur-2xl opacity-30 group-hover:opacity-50 animate-pulse transition-opacity duration-500" />
              
              {/* Logo container */}
              <div className="relative w-20 h-20 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 rounded-3xl flex items-center justify-center shadow-2xl transform group-hover:scale-110 transition-all duration-300">
                <BarChart3 className="w-10 h-10 text-white" strokeWidth={2.5} />
                
                {/* Shine effect */}
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-white/0 via-white/20 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              </div>
            </div>
          </div>

          {/* Premium Branding */}
          <div className="space-y-3">
            <h1 className="text-6xl font-black tracking-tight">
              <span className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 bg-clip-text text-transparent drop-shadow-sm">
                StockIT
              </span>
              {" "}
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                AI
              </span>
            </h1>
            
            <div className="flex items-center justify-center gap-3">
              <div className="h-px w-8 bg-gradient-to-r from-transparent via-blue-500 to-transparent" />
              <p className="text-sm font-semibold text-slate-500 tracking-[0.2em] uppercase">
                Enterprise Intelligence Platform
              </p>
              <div className="h-px w-8 bg-gradient-to-r from-transparent via-blue-500 to-transparent" />
            </div>
            
            <p className="text-lg text-slate-600 max-w-2xl mx-auto font-medium">
              Advanced automation & real-time insights powered by{" "}
              <span className="text-blue-600 font-semibold">machine learning</span>
            </p>
          </div>
        </motion.div>
        {/* Ultra-Modern Stats Grid - Unified Section */}
        <motion.div variants={cardVariants} className="relative mb-12 pb-12 overflow-hidden rounded-3xl">
          {/* Unified Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-emerald-500/5 rounded-3xl" />
          
          <Card className="relative bg-white/90 backdrop-blur-xl border-2 border-slate-200/60 shadow-2xl rounded-3xl overflow-hidden mb-12">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/60">
              
              {/* Total Orders */}
              <div className="group relative p-6 transition-all duration-300 hover:bg-gradient-to-br hover:from-blue-50/50 hover:to-indigo-50/50 overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 rounded-full -mr-16 -mt-16 transition-all duration-500 group-hover:scale-150 blur-2xl" />
                
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4 gap-2">
                    <div className="text-sm font-medium text-slate-600 truncate">Total Orders</div>
                    <div className="w-10 h-10 flex-shrink-0 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-6">
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  
                  <div className="flex items-baseline gap-2 mb-3 flex-wrap min-w-0">
                    <span className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent leading-tight break-words">
                      {metrics.totalPOs || 0}
                    </span>
                    <div className="flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0">
                      <TrendUp className="w-3 h-3" />
                      +12%
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-4 gap-2">
                    <span className="truncate">vs last month</span>
                    <div className="flex items-center gap-1 whitespace-nowrap flex-shrink-0">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                      Live
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs gap-2">
                      <span className="text-slate-500 truncate">Processing</span>
                      <span className="font-medium text-orange-600 flex-shrink-0">{metrics.processingPOs || 0}</span>
                    </div>
                    <Progress value={metrics.totalPOs > 0 ? (metrics.processingPOs / metrics.totalPOs) * 100 : 0} className="h-2" />
                  </div>
                </div>
              </div>

              {/* Total Value */}
              <div className="group relative p-6 transition-all duration-300 hover:bg-gradient-to-br hover:from-emerald-50/50 hover:to-green-50/50 overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-500/10 to-green-500/10 rounded-full -mr-16 -mt-16 transition-all duration-500 group-hover:scale-150 blur-2xl" />
                
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4 gap-2">
                    <div className="text-sm font-medium text-slate-600 truncate">Total Value</div>
                    <div className="w-10 h-10 flex-shrink-0 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-6">
                      <Database className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  
                  <div className="flex items-baseline gap-2 mb-3 flex-wrap min-w-0">
                    <span className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-transparent leading-tight break-words max-w-full">
                      {metrics.currency} {metrics.totalAmount?.toLocaleString() || '0'}
                    </span>
                    <div className="flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0">
                      <TrendUp className="w-3 h-3" />
                      +8.2%
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-4 gap-2">
                    <span className="truncate">Monthly growth</span>
                    <div className="flex items-center gap-1 whitespace-nowrap flex-shrink-0">
                      <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                      High
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gradient-to-r from-emerald-200 to-emerald-400 rounded-full overflow-hidden min-w-0">
                      <div className="h-full w-3/4 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full animate-pulse" />
                    </div>
                    <span className="text-xs font-medium text-emerald-600 whitespace-nowrap flex-shrink-0">75%</span>
                  </div>
                </div>
              </div>

              {/* Active Suppliers */}
              <div className="group relative p-6 cursor-pointer transition-all duration-300 hover:bg-gradient-to-br hover:from-purple-50/50 hover:to-violet-50/50 overflow-hidden" onClick={() => {
                onShowActiveSuppliers?.()
                console.log('Accessing Active Suppliers detailed view')
              }}>
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-500/10 to-violet-500/10 rounded-full -mr-16 -mt-16 transition-all duration-500 group-hover:scale-150 blur-2xl" />
                
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4 gap-2">
                    <div className="text-sm font-medium text-slate-600 truncate">Active Suppliers</div>
                    <div className="w-10 h-10 flex-shrink-0 bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-6">
                      <Users className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  
                  <div className="flex items-baseline gap-2 mb-3 flex-wrap min-w-0">
                    <span className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-violet-600 bg-clip-text text-transparent leading-tight break-words">
                      {metrics.activeSuppliers || 0}
                    </span>
                    <div className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      Online
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-4 gap-2">
                    <span className="truncate">Click to manage</span>
                    <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1 flex-shrink-0" />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-8 bg-gradient-to-br from-purple-100 to-purple-200 rounded-lg flex items-center justify-center">
                        <div className="w-4 h-4 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* AI Processing */}
              <div className="group relative p-6 transition-all duration-300 hover:bg-gradient-to-br hover:from-orange-50/50 hover:to-red-50/50 overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-500/10 to-red-500/10 rounded-full -mr-16 -mt-16 transition-all duration-500 group-hover:scale-150 blur-2xl" />
                
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4 gap-2">
                    <div className="text-sm font-medium text-slate-600 truncate">AI Processing</div>
                    <div className="w-10 h-10 flex-shrink-0 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-6">
                      <Robot className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  
                  <div className="flex items-baseline gap-2 mb-3 flex-wrap min-w-0">
                    <span className="text-4xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent leading-tight break-words">
                      {metrics.processingPOs || 0}
                    </span>
                    <div className="flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0">
                      <Zap className="w-3 h-3" />
                      Active
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-4 gap-2">
                    <span className="truncate">92% accuracy</span>
                    <div className="flex items-center gap-1 whitespace-nowrap flex-shrink-0">
                      <Activity className="w-3 h-3" />
                      Real-time
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse flex-shrink-0" />
                      <span className="text-xs text-slate-600 truncate">Neural processing</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
                      <span className="text-xs text-slate-600 truncate">Queue: {metrics.pendingPOs || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
              
            </div>
          </Card>
        </motion.div>

      {/* Spacer */}
      <div className="h-12"></div>

      {/* Advanced Analytics Section */}
      <div className="flex flex-col lg:flex-row lg:justify-between gap-8 px-1">
        <motion.div variants={cardVariants} className="lg:w-[48%] min-w-0">
          <div className="relative overflow-hidden rounded-3xl">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-100/50 to-blue-100/50 rounded-3xl blur-xl" />
            <Card className="relative bg-white/95 backdrop-blur-xl border-2 border-slate-200/60 shadow-2xl rounded-3xl overflow-hidden">
              <CardHeader className="pb-6 border-b-2 border-slate-100/80 bg-gradient-to-r from-slate-50/50 to-blue-50/30">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                        <Activity className="w-5 h-5 text-white" />
                      </div>
                      <CardTitle className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">Recent Activity</CardTitle>
                    </div>
                    <CardDescription className="text-slate-600 font-medium">Latest purchase order updates with real-time AI confidence scores</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="bg-white/80 border-slate-200/60 hover:bg-white hover:border-blue-300 transition-all">
                      <Funnel className="w-4 h-4 mr-2" />
                      Filter
                    </Button>
                    <Button variant="outline" size="sm" className="bg-white/80 border-slate-200/60 hover:bg-white hover:border-blue-300 transition-all">
                      <Download className="w-4 h-4 mr-2" />
                      Export
                    </Button>
                    <Button size="sm" onClick={onShowAllPurchaseOrders} className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-lg hover:shadow-xl transition-all">
                      <Eye className="w-4 h-4 mr-2" />
                      View All
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="p-6 bg-gradient-to-br from-white to-slate-50/30">
                <div className="space-y-3">
                  {(recentPOs || []).map((po, index) => (
                    <motion.div
                      key={po.id}
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: index * 0.1 }}
                      className="group relative flex items-center gap-4 p-4 bg-white/80 backdrop-blur-sm rounded-2xl border-2 border-slate-200/60 hover:border-blue-300/60 hover:bg-white transition-all duration-300 hover:scale-[1.02] hover:shadow-xl cursor-pointer overflow-hidden"
                      onClick={() => onShowPurchaseOrderDetails?.(po.id)}
                      whileHover={{ y: -2 }}
                    >
                      {/* Hover gradient effect */}
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      
                      <div className="relative w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                        <FileText className="w-7 h-7 text-white" />
                      </div>
                      
                      <div className="relative flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <h4 className="font-bold text-slate-800 truncate text-base">{po.poNumber}</h4>
                          {getStatusBadge(po.status)}
                        </div>
                        <p className="text-sm text-slate-600 truncate font-medium">{po.supplierName} • {po.currency} {po.amount?.toLocaleString() || '0'}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                            {safeFormatDate(po.uploadedAt)}
                          </div>
                          <div className="w-1 h-1 bg-slate-300 rounded-full" />
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Database className="w-3 h-3" />
                            {po.itemCount || 0} items
                          </div>
                        </div>
                      </div>
                      
                      <ArrowRight className="relative w-5 h-5 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all duration-300" />
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>

        {/* Supplier Performance - Enhanced Chart Section */}
        <motion.div variants={cardVariants} className="lg:w-[48%] min-w-0">
          <div className="relative overflow-hidden h-full rounded-3xl">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-100/50 to-pink-100/50 rounded-3xl blur-xl" />
            <Card className="relative bg-white/95 backdrop-blur-xl border-2 border-purple-200/60 shadow-2xl rounded-3xl overflow-hidden h-full">
              <CardHeader className="pb-6 border-b-2 border-purple-100/80 bg-gradient-to-r from-purple-50/50 to-pink-50/30">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg">
                    <TrendUp className="w-5 h-5 text-white" />
                  </div>
                  <CardTitle className="text-2xl font-bold bg-gradient-to-r from-purple-800 to-pink-600 bg-clip-text text-transparent">Top Performers</CardTitle>
                </div>
                <CardDescription className="text-slate-600 font-medium">Real-time supplier accuracy and processing excellence metrics</CardDescription>
              </CardHeader>
              
              <CardContent className="p-6 bg-gradient-to-br from-white to-purple-50/20">
                <div className="space-y-4">
                  {(supplierMetrics || []).map((supplier, index) => (
                    <motion.div
                      key={supplier.name}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="group relative p-4 bg-white/80 backdrop-blur-sm rounded-2xl border-2 border-purple-200/60 hover:border-purple-300/80 hover:bg-white transition-all duration-300 hover:shadow-xl overflow-hidden cursor-pointer"
                      whileHover={{ scale: 1.02, y: -2 }}
                      onClick={() => onShowSupplierDetails?.(supplier.id)}
                    >
                      {/* Hover gradient effect */}
                      <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      
                      <div className="relative flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300">
                          {index + 1}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-slate-800 text-base truncate">{supplier.name}</h4>
                          <div className="flex items-center gap-2 mt-1.5">
                            {getSupplierStatusBadge(supplier.status)}
                          </div>
                        </div>
                      </div>
                      
                      <div className="relative space-y-3">
                        {/* On-Time Rate */}
                        <div className="p-3 bg-gradient-to-br from-purple-50/50 to-pink-50/30 rounded-xl border border-purple-100/60">
                          <div className="flex items-center justify-between text-xs mb-2">
                            <span className="flex items-center gap-1.5 text-slate-700 font-semibold">
                              <Gauge className="w-4 h-4 text-purple-600" />
                              On-Time Delivery
                            </span>
                            <span className="flex items-center gap-1 font-bold text-purple-700 text-sm">
                              {supplier.onTimeRate}%
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2.5 bg-purple-200/50 rounded-full overflow-hidden shadow-inner">
                              <motion.div 
                                className="h-full bg-gradient-to-r from-purple-500 via-purple-600 to-pink-500 rounded-full shadow-sm"
                                initial={{ width: 0 }}
                                animate={{ width: `${supplier.onTimeRate}%` }}
                                transition={{ duration: 1, delay: index * 0.1 + 0.3 }}
                              />
                            </div>
                          </div>
                        </div>
                        
                        {/* Order Stats */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 bg-gradient-to-br from-blue-50/50 to-indigo-50/30 rounded-xl border border-blue-100/60">
                            <div className="flex items-center gap-1.5 mb-1">
                              <FileText className="w-3.5 h-3.5 text-blue-600" />
                              <span className="text-xs text-slate-600 font-medium">Total Orders</span>
                            </div>
                            <span className="text-lg font-bold text-slate-800">{supplier.ordersCount}</span>
                          </div>
                          
                          <div className="p-3 bg-gradient-to-br from-emerald-50/50 to-green-50/30 rounded-xl border border-emerald-100/60">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Database className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-xs text-slate-600 font-medium">Avg Value</span>
                            </div>
                            <span className="text-lg font-bold text-slate-800">{supplier.currency} {supplier.averageOrderValue.toFixed(0)}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      </div>

      {/* Premium System Health & Performance */}
      <motion.div variants={cardVariants}>
        <Card className="border-2 border-slate-200/60 dark:border-slate-700/60 bg-gradient-to-br from-white via-slate-50/30 to-blue-50/20 dark:from-slate-900 dark:via-slate-800/30 dark:to-blue-900/10 shadow-xl">
          <CardHeader className="pb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25">
                    <ShieldCheck className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl font-bold bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 dark:from-white dark:via-slate-100 dark:to-slate-200 bg-clip-text text-transparent">
                      System Health & Performance
                    </CardTitle>
                    <CardDescription className="mt-1 text-sm">
                      Real-time monitoring • Live metrics • AI-powered insights
                    </CardDescription>
                  </div>
                </div>
              </div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button 
                  variant="outline" 
                  size="sm"
                  className="border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-50 dark:border-blue-800 dark:hover:border-blue-600 dark:hover:bg-blue-900/20 shadow-sm transition-all duration-200"
                  onClick={() => {
                    // Trigger data refresh
                    refetchDashboard()
                    refetchMetrics()
                  }}
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Refresh Status
                </Button>
              </motion.div>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {/* AI Processing Engine Card */}
              <motion.div 
                className="group relative"
                whileHover={{ y: -4 }}
                transition={{ duration: 0.2 }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 via-green-500/10 to-teal-500/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-300 opacity-0 group-hover:opacity-100" />
                <div className="relative p-6 rounded-2xl border-2 border-slate-200/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-300 space-y-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div 
                        className={`p-3 rounded-xl shadow-lg ${
                          metrics.completedPOs / Math.max(metrics.totalPOs, 1) >= 0.95 
                            ? 'bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/30' 
                            : metrics.completedPOs / Math.max(metrics.totalPOs, 1) >= 0.80
                            ? 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/30'
                            : 'bg-gradient-to-br from-red-500 to-rose-600 shadow-red-500/30'
                        }`}
                      >
                        <Robot className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <div className="font-bold text-base">AI Processing Engine</div>
                        <div className="text-xs text-muted-foreground">Core ML Pipeline</div>
                      </div>
                    </div>
                  </div>
                  
                  <Badge className={`${
                    metrics.completedPOs / Math.max(metrics.totalPOs, 1) >= 0.95 
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 shadow-lg shadow-emerald-500/10' 
                      : metrics.completedPOs / Math.max(metrics.totalPOs, 1) >= 0.80
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 shadow-lg shadow-amber-500/10'
                      : 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30 shadow-lg shadow-red-500/10'
                  } w-full justify-center py-2.5 font-semibold text-sm`}>
                    {metrics.completedPOs / Math.max(metrics.totalPOs, 1) >= 0.95 ? (
                      <>
                        <ShieldCheck className="w-4 h-4 mr-2" />
                        Fully Operational
                      </>
                    ) : metrics.completedPOs / Math.max(metrics.totalPOs, 1) >= 0.80 ? (
                      <>
                        <WarningCircle className="w-4 h-4 mr-2" />
                        Minor Issues
                      </>
                    ) : (
                      <>
                        <WarningCircle className="w-4 h-4 mr-2" />
                        Performance Degraded
                      </>
                    )}
                  </Badge>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm items-center">
                      <span className="text-muted-foreground font-medium">Success Rate</span>
                      <span className="font-bold text-lg bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                        {metrics.totalPOs > 0 
                          ? ((metrics.completedPOs / metrics.totalPOs) * 100).toFixed(1)
                          : '0.0'}%
                      </span>
                    </div>
                    <div className="relative">
                      <Progress 
                        value={metrics.totalPOs > 0 ? (metrics.completedPOs / metrics.totalPOs) * 100 : 0} 
                        className="h-3 shadow-inner" 
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer rounded-full" />
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 pt-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                      {metrics.completedPOs} of {metrics.totalPOs} POs processed
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Supplier Connections Card */}
              <motion.div 
                className="group relative"
                whileHover={{ y: -4 }}
                transition={{ duration: 0.2 }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 via-cyan-500/10 to-sky-500/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-300 opacity-0 group-hover:opacity-100" />
                <div className="relative p-6 rounded-2xl border-2 border-slate-200/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-300 space-y-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <motion.div 
                        className={`p-3 rounded-xl shadow-lg ${
                          metrics.activeSuppliers === metrics.totalSuppliers 
                            ? 'bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/30' 
                            : metrics.activeSuppliers / Math.max(metrics.totalSuppliers, 1) >= 0.75
                            ? 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/30'
                            : 'bg-gradient-to-br from-red-500 to-rose-600 shadow-red-500/30'
                        }`}
                        animate={{ 
                          scale: [1, 1.1, 1],
                        }}
                        transition={{ 
                          duration: 3,
                          repeat: Infinity,
                          ease: "easeInOut"
                        }}
                      >
                        <Globe className="w-6 h-6 text-white" />
                      </motion.div>
                      <div>
                        <div className="font-bold text-base">Supplier Connections</div>
                        <div className="text-xs text-muted-foreground">API Integrations</div>
                      </div>
                    </div>
                  </div>
                  
                  <Badge className={`${
                    metrics.activeSuppliers === metrics.totalSuppliers 
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 shadow-lg shadow-emerald-500/10' 
                      : metrics.activeSuppliers / Math.max(metrics.totalSuppliers, 1) >= 0.75
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 shadow-lg shadow-amber-500/10'
                      : 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30 shadow-lg shadow-red-500/10'
                  } w-full justify-center py-2.5 font-semibold text-sm`}>
                    {metrics.activeSuppliers === metrics.totalSuppliers ? (
                      <>
                        <ShieldCheck className="w-4 h-4 mr-2" />
                        All Connected
                      </>
                    ) : metrics.activeSuppliers / Math.max(metrics.totalSuppliers, 1) >= 0.75 ? (
                      <>
                        <WarningCircle className="w-4 h-4 mr-2" />
                        Minor Issues Detected
                      </>
                    ) : (
                      <>
                        <WarningCircle className="w-4 h-4 mr-2" />
                        Connection Issues
                      </>
                    )}
                  </Badge>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm items-center">
                      <span className="text-muted-foreground font-medium">Connected</span>
                      <span className="font-bold text-lg bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                        {metrics.activeSuppliers} of {metrics.totalSuppliers}
                      </span>
                    </div>
                    <div className="relative">
                      <Progress 
                        value={metrics.totalSuppliers > 0 ? (metrics.activeSuppliers / metrics.totalSuppliers) * 100 : 0} 
                        className="h-3 shadow-inner" 
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer rounded-full" />
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 pt-1">
                      <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                        metrics.activeSuppliers === metrics.totalSuppliers ? 'bg-emerald-500' : 'bg-amber-500'
                      }`} />
                      {metrics.activeSuppliers === metrics.totalSuppliers 
                        ? 'All suppliers operational'
                        : `${metrics.totalSuppliers - metrics.activeSuppliers} offline`
                      }
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Data Processing Queue Card */}
              <motion.div 
                className="group relative"
                whileHover={{ y: -4 }}
                transition={{ duration: 0.2 }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500/20 via-purple-500/10 to-fuchsia-500/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-300 opacity-0 group-hover:opacity-100" />
                <div className="relative p-6 rounded-2xl border-2 border-slate-200/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-300 space-y-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <motion.div 
                        className={`p-3 rounded-xl shadow-lg ${
                          metrics.pendingPOs + metrics.processingPOs <= 5 
                            ? 'bg-gradient-to-br from-emerald-500 to-green-600 shadow-emerald-500/30' 
                            : metrics.pendingPOs + metrics.processingPOs <= 15
                            ? 'bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-500/30'
                            : 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/30'
                        }`}
                        animate={{ 
                          y: [0, -4, 0],
                        }}
                        transition={{ 
                          duration: 2,
                          repeat: Infinity,
                          ease: "easeInOut"
                        }}
                      >
                        <Database className="w-6 h-6 text-white" />
                      </motion.div>
                      <div>
                        <div className="font-bold text-base">Data Processing</div>
                        <div className="text-xs text-muted-foreground">Queue & Storage</div>
                      </div>
                    </div>
                  </div>
                  
                  <Badge className={`${
                    metrics.pendingPOs + metrics.processingPOs <= 5 
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 shadow-lg shadow-emerald-500/10' 
                      : metrics.pendingPOs + metrics.processingPOs <= 15
                      ? 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30 shadow-lg shadow-blue-500/10'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 shadow-lg shadow-amber-500/10'
                  } w-full justify-center py-2.5 font-semibold text-sm`}>
                    {metrics.pendingPOs + metrics.processingPOs <= 5 ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        All Systems Normal
                      </>
                    ) : metrics.pendingPOs + metrics.processingPOs <= 15 ? (
                      <>
                        <ShieldCheck className="w-4 h-4 mr-2" />
                        Processing Active
                      </>
                    ) : (
                      <>
                        <WarningCircle className="w-4 h-4 mr-2" />
                        Heavy Load
                      </>
                    )}
                  </Badge>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm items-center">
                      <span className="text-muted-foreground font-medium">Queue Status</span>
                      <span className="font-bold text-lg bg-gradient-to-r from-purple-600 to-fuchsia-600 bg-clip-text text-transparent">
                        {metrics.pendingPOs + metrics.processingPOs} {metrics.pendingPOs + metrics.processingPOs === 1 ? 'item' : 'items'}
                      </span>
                    </div>
                    <div className="relative">
                      <Progress 
                        value={Math.min(((metrics.pendingPOs + metrics.processingPOs) / 20) * 100, 100)} 
                        className="h-3 shadow-inner" 
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer rounded-full" />
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 pt-1">
                      <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                        metrics.pendingPOs + metrics.processingPOs <= 5 ? 'bg-emerald-500' : 'bg-blue-500'
                      }`} />
                      {metrics.pendingPOs} pending • {metrics.processingPOs} processing
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
      </motion.div>
    </div>
  )
}
