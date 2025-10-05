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
  Spinner,
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
  averageProcessingTime: number
  lastOrderDate: string
  status: 'online' | 'offline' | 'processing'
  performance: number
  priority: 'high' | 'medium' | 'low'
}

interface DashboardOverviewProps {
  onShowActiveSuppliers?: () => void
  onViewPO?: (po: POSummary) => void
}

// Modern 2025 Dashboard with Advanced Visual Design
export function DashboardOverview({ onShowActiveSuppliers, onViewPO }: DashboardOverviewProps) {
  const { data: summaryData, isLoading: summaryLoading, error: summaryError } = useDashboardSummary()
  const { data: supplierData, isLoading: supplierLoading, error: supplierError } = useSupplierMetrics()
  const [searchTerm, setSearchTerm] = useState('')
  const [timeFilter, setTimeFilter] = useState('7d')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  
  const { scrollY } = useScroll()
  const headerY = useTransform(scrollY, [0, 300], [0, -50])
  const headerOpacity = useTransform(scrollY, [0, 300], [1, 0.8])

  const metrics = summaryData || {
    totalPOs: 0,
    totalAmount: 0,
    activeSuppliers: 0,
    processingPOs: 0,
    pendingPOs: 0,
    completedPOs: 0,
    currency: 'USD'
  }

  const suppliers = supplierData || []

  const handleRefresh = async () => {
    setIsRefreshing(true)
    // Simulate refresh
    await new Promise(resolve => setTimeout(resolve, 2000))
    setIsRefreshing(false)
  }

  if (summaryLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50 flex items-center justify-center">
        <motion.div 
          className="flex items-center gap-4 px-8 py-6 bg-white/80 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6 }}
        >
          <div className="relative">
            <Spinner className="w-8 h-8 animate-spin text-blue-600" />
            <div className="absolute inset-0 w-8 h-8 border-2 border-blue-200 rounded-full animate-ping" />
          </div>
          <span className="text-lg font-medium text-slate-700">Loading your intelligent dashboard...</span>
        </motion.div>
      </div>
    )
  }

  if (summaryError) {
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
          <p className="text-slate-600 mb-6">{summaryError}</p>
          <Button 
            onClick={handleRefresh}
            className="px-6 py-3 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white font-medium rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry Connection
          </Button>
        </motion.div>
      </div>
    )
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  }

  const cardVariants = {
    hidden: { y: 40, opacity: 0, scale: 0.95 },
    visible: { 
      y: 0, 
      opacity: 1, 
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 15
      }
    }
  }

  const floatingVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { 
      y: 0, 
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 120,
        damping: 20,
        delay: 0.3
      }
    }
  }

  return (
    <div ref={containerRef} className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-100/50 relative overflow-hidden">
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
        <motion.div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-gradient-to-br from-emerald-400/10 to-teal-500/10 rounded-full blur-3xl"
          animate={{ 
            scale: [1, 1.3, 1],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{ 
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      </div>

      <motion.div 
        className="relative z-10"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Modern Header with Floating Design */}
        <motion.div 
          style={{ y: headerY, opacity: headerOpacity }}
          className="sticky top-0 z-50 mb-8"
        >
          <div className="backdrop-blur-2xl bg-white/60 border-b border-white/20 shadow-xl">
            <div className="max-w-7xl mx-auto px-6 py-6">
              <motion.div 
                className="flex flex-col lg:flex-row lg:items-center justify-between gap-6"
                variants={floatingVariants}
              >
                {/* Header Title with Gradient */}
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                      <BarChart3 className="w-6 h-6 text-white" />
                    </div>
                    <div className="absolute -inset-1 bg-gradient-to-r from-blue-400 to-indigo-500 rounded-2xl blur opacity-25 animate-pulse" />
                  </div>
                  <div>
                    <h1 className="text-3xl lg:text-4xl font-bold bg-gradient-to-r from-slate-800 via-blue-800 to-indigo-800 bg-clip-text text-transparent">
                      StockIT AI
                    </h1>
                    <p className="text-slate-600 mt-1">Intelligent automation & insights dashboard</p>
                  </div>
                </div>

                {/* Modern Controls */}
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder="Search orders, suppliers..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2 w-64 bg-white/80 backdrop-blur-sm border-white/20 focus:border-blue-300 focus:ring-blue-200/50 rounded-xl"
                    />
                  </div>
                  <Select value={timeFilter} onValueChange={setTimeFilter}>
                    <SelectTrigger className="w-32 bg-white/80 backdrop-blur-sm border-white/20 rounded-xl">
                      <SelectValue placeholder="Period" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1d">Today</SelectItem>
                      <SelectItem value="7d">7 Days</SelectItem>
                      <SelectItem value="30d">30 Days</SelectItem>
                      <SelectItem value="90d">90 Days</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button 
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg"
                  >
                    <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
                  </Button>
                  <Button 
                    variant="outline"
                    className="px-4 py-2 bg-white/80 backdrop-blur-sm border-white/20 hover:bg-white/90 rounded-xl transition-all duration-300"
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>

        <div className="max-w-7xl mx-auto px-6 space-y-8">
          {/* Ultra-Modern Stats Grid */}
          <motion.div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
            variants={containerVariants}
          >
            {/* Total POs - Enhanced Design */}
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
                        {metrics.totalPOs?.toLocaleString() || '0'}
                      </span>
                      <div className="flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                        <TrendUp className="w-3 h-3" />
                        +12%
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>vs last month</span>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                        Live data
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Processing</span>
                        <span className="font-medium text-orange-600">{metrics.processingPOs || 0}</span>
                      </div>
                      <Progress value={(metrics.processingPOs / metrics.totalPOs) * 100} className="h-2" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </motion.div>

            {/* Total Value - Premium Design */}
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
                        ${metrics.totalAmount?.toLocaleString() || '0'}
                      </span>
                      <div className="flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                        <TrendUp className="w-3 h-3" />
                        +8.2%
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Monthly growth</span>
                      <div className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                        High value
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gradient-to-r from-emerald-200 to-emerald-400 rounded-full overflow-hidden">
                        <div className="h-full w-3/4 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full animate-pulse" />
                      </div>
                      <span className="text-xs font-medium text-emerald-600">75%</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </motion.div>

            {/* Active Suppliers - Interactive */}
            <motion.div variants={cardVariants}>
              <div className="group relative overflow-hidden cursor-pointer" onClick={onShowActiveSuppliers}>
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
                    
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Click to manage</span>
                      <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
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

            {/* AI Processing Status - Futuristic */}
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
                    
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>92% accuracy</span>
                      <div className="flex items-center gap-1">
                        <Activity className="w-3 h-3" />
                        Real-time
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
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
          </motion.div>

          {/* Advanced Analytics Section */}
          <motion.div 
            className="grid lg:grid-cols-3 gap-8"
            variants={containerVariants}
          >
            {/* Recent Activity - Modern List Design */}
            <motion.div variants={cardVariants} className="lg:col-span-2">
              <div className="relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-slate-100/50 to-blue-100/50 rounded-3xl blur-xl" />
                <Card className="relative bg-white/90 backdrop-blur-xl border-white/20 shadow-2xl rounded-3xl overflow-hidden">
                  <CardHeader className="pb-6 border-b border-slate-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-xl font-bold text-slate-800">Recent Activity</CardTitle>
                        <CardDescription className="text-slate-600 mt-1">Latest purchase order updates</CardDescription>
                      </div>
                      <Button variant="outline" size="sm" className="bg-white/80 border-white/40 hover:bg-white">
                        View All
                      </Button>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      {[1, 2, 3, 4].map((item) => (
                        <motion.div 
                          key={item}
                          className="flex items-center gap-4 p-4 bg-white/60 backdrop-blur-sm rounded-2xl border border-white/20 hover:bg-white/80 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg cursor-pointer"
                          whileHover={{ y: -2 }}
                        >
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                            <FileText className="w-6 h-6 text-white" />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold text-slate-800 truncate">PO-2025-{1000 + item}</h4>
                              <Badge className="bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0 rounded-full px-2 py-1 text-xs">
                                Processed
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-600 truncate">TechCorp Industries • $24,500</p>
                            <div className="flex items-center gap-2 mt-2">
                              <div className="text-xs text-slate-500">2 mins ago</div>
                              <div className="w-1 h-1 bg-slate-300 rounded-full" />
                              <div className="text-xs text-slate-500">AI Confidence: 94%</div>
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

            {/* Supplier Performance - Chart Section */}
            <motion.div variants={cardVariants}>
              <div className="relative overflow-hidden h-full">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-100/50 to-pink-100/50 rounded-3xl blur-xl" />
                <Card className="relative bg-white/90 backdrop-blur-xl border-white/20 shadow-2xl rounded-3xl overflow-hidden h-full">
                  <CardHeader className="pb-6">
                    <CardTitle className="text-xl font-bold text-slate-800">Top Performers</CardTitle>
                    <CardDescription className="text-slate-600">Supplier rankings this month</CardDescription>
                  </CardHeader>
                  
                  <CardContent className="p-6">
                    <div className="space-y-6">
                      {[
                        { name: 'TechCorp Inc', score: 98, orders: 24, trend: 'up' },
                        { name: 'Global Supply', score: 94, orders: 18, trend: 'up' },
                        { name: 'Prime Materials', score: 89, orders: 32, trend: 'down' },
                        { name: 'Rapid Logistics', score: 87, orders: 15, trend: 'up' },
                      ].map((supplier, index) => (
                        <motion.div 
                          key={supplier.name}
                          className="flex items-center gap-4 p-3 bg-white/60 backdrop-blur-sm rounded-xl border border-white/20 hover:bg-white/80 transition-all duration-300"
                          whileHover={{ scale: 1.02 }}
                        >
                          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg">
                            {index + 1}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-slate-800 text-sm truncate">{supplier.name}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-1000"
                                  style={{ width: `${supplier.score}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium text-slate-700">{supplier.score}%</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-slate-500">{supplier.orders} orders</span>
                              {supplier.trend === 'up' ? (
                                <TrendUp className="w-3 h-3 text-green-500" />
                              ) : (
                                <TrendDown className="w-3 h-3 text-red-500" />
                              )}
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}