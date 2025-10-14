import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useRealtimePOData, type POProgress, type ActivityLog } from '@/hooks/useRealtimePOData'
import { ProcessingLogStream } from './ProcessingLogStream'
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  TrendingUp, 
  AlertCircle,
  Zap,
  Database,
  FileText,
  Package,
  ArrowRight,
  RefreshCcw,
  Loader2,
  PlayCircle,
  PauseCircle,
  Upload,
  Wifi,
  WifiOff
} from 'lucide-react'

export function RealTimeFeedback() {
  const { 
    pipelineStatus, 
    activityLogs, 
    activePOs, 
    isConnected, 
    error,
    refresh 
  } = useRealtimePOData()
  
  const [showDisconnected, setShowDisconnected] = useState(false)

  const getStatusIcon = (status: POProgress['status']) => {
    switch (status) {
      case 'queued': return <Clock className="w-4 h-4 text-amber-500" />
      case 'processing': return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
      case 'syncing': return <Database className="w-4 h-4 text-purple-500 animate-pulse" />
      case 'completed': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />
    }
  }

  const getActivityIcon = (type: ActivityLog['type']) => {
    switch (type) {
      case 'upload': return <Upload className="w-4 h-4 text-blue-500" />
      case 'processing': return <Loader2 className="w-4 h-4 text-purple-500" />
      case 'sync': return <Database className="w-4 h-4 text-indigo-500" />
      case 'success': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />
      case 'error': return <XCircle className="w-4 h-4 text-red-500" />
    }
  }

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(date)
  }

  return (
    <div className="space-y-6">
      {/* Real-Time Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
              <Activity className="w-5 h-5 text-white" />
            </div>
            {isConnected && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full animate-pulse ring-2 ring-white" />
            )}
          </div>
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
              Real-Time Pipeline
            </h2>
            <p className="text-sm text-slate-600 font-medium">
              Live monitoring of PO processing and product sync
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {error && (
            <Badge variant="destructive" className="animate-pulse">
              <AlertCircle className="w-3 h-3 mr-1" />
              Connection Error
            </Badge>
          )}
          <motion.button
            onClick={refresh}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <RefreshCcw className="w-4 h-4" />
            Refresh
          </motion.button>
          <motion.div
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium ${
              isConnected
                ? 'bg-emerald-100 text-emerald-700' 
                : 'bg-red-100 text-red-700'
            }`}
          >
            {isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            {isConnected ? 'Connected' : 'Disconnected'}
          </motion.div>
        </div>
      </motion.div>

      {/* Pipeline Status Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="border-2 border-slate-200/60 hover:border-blue-300/60 transition-all">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-600">Total Queued</span>
                <Clock className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-2xl font-bold text-slate-800">{pipelineStatus.queued}</div>
              <Progress value={(pipelineStatus.queued / (pipelineStatus.total || 1)) * 100} className="h-1.5 mt-2" />
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-2 border-blue-200/60 hover:border-blue-300/80 transition-all bg-gradient-to-br from-blue-50/30 to-indigo-50/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-600">Processing</span>
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
              </div>
              <div className="text-2xl font-bold text-blue-700">{pipelineStatus.processing}</div>
              <div className="flex items-center gap-1 mt-2 text-xs text-blue-600">
                <Zap className="w-3 h-3" />
                <span className="font-medium">Active now</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-2 border-emerald-200/60 hover:border-emerald-300/80 transition-all bg-gradient-to-br from-emerald-50/30 to-green-50/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-600">Completed</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-bold text-emerald-700">{pipelineStatus.completed}</div>
              <div className="flex items-center gap-1 mt-2 text-xs text-emerald-600">
                <TrendingUp className="w-3 h-3" />
                <span className="font-medium">+12 today</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="border-2 border-red-200/60 hover:border-red-300/60 transition-all">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-600">Failed</span>
                <XCircle className="w-4 h-4 text-red-500" />
              </div>
              <div className="text-2xl font-bold text-red-700">{pipelineStatus.failed}</div>
              <div className="flex items-center gap-1 mt-2 text-xs text-red-600">
                <AlertCircle className="w-3 h-3" />
                <span className="font-medium">Needs review</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="border-2 border-purple-200/60 hover:border-purple-300/60 transition-all bg-gradient-to-br from-purple-50/30 to-pink-50/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-600">Total</span>
                <Package className="w-4 h-4 text-purple-500" />
              </div>
              <div className="text-2xl font-bold text-purple-700">{pipelineStatus.total}</div>
              <div className="flex items-center gap-1 mt-2 text-xs text-purple-600">
                <Database className="w-3 h-3" />
                <span className="font-medium">All time</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Main Content: Activity Feed & Active POs */}
      <Card className="border-2 border-slate-200/60 shadow-xl">
        <Tabs defaultValue="activity" className="w-full">
          <CardHeader className="pb-4 border-b-2 border-slate-100/80">
            <TabsList className="grid w-full grid-cols-2 max-w-md">
              <TabsTrigger value="activity" className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Activity Feed
              </TabsTrigger>
              <TabsTrigger value="active" className="flex items-center gap-2">
                <RefreshCcw className="w-4 h-4" />
                Active POs
              </TabsTrigger>
            </TabsList>
          </CardHeader>

          <CardContent className="p-6">
            <TabsContent value="activity" className="mt-0">
              <ScrollArea className="h-[500px] pr-4">
                <AnimatePresence>
                  {activityLogs.map((log, index) => (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ delay: index * 0.05 }}
                      className="group relative flex gap-4 p-4 mb-3 bg-gradient-to-r from-white to-slate-50/30 border-2 border-slate-200/60 rounded-xl hover:border-blue-300/60 hover:shadow-lg transition-all"
                    >
                      {/* Timeline indicator with enhanced styling */}
                      <div className="flex flex-col items-center gap-2">
                        <div className="relative w-10 h-10 bg-gradient-to-br from-slate-100 to-slate-200 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                          {getActivityIcon(log.type)}
                          {log.type === 'processing' && (
                            <div className="absolute -inset-1 bg-blue-400/20 rounded-xl animate-pulse" />
                          )}
                        </div>
                        {index < activityLogs.length - 1 && (
                          <div className="w-0.5 flex-1 bg-gradient-to-b from-slate-300 to-slate-100" />
                        )}
                      </div>

                      {/* Enhanced Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge 
                            variant="outline" 
                            className="font-mono text-xs border-2 font-bold"
                          >
                            {log.poNumber}
                          </Badge>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Clock className="w-3 h-3" />
                            <span className="font-medium">{formatTime(log.timestamp)}</span>
                          </div>
                        </div>
                        
                        <p className="font-semibold text-slate-800 mb-1.5 leading-relaxed">
                          {log.message}
                        </p>
                        
                        {log.details && (
                          <div className="flex items-start gap-2 mt-2 p-2 bg-slate-100/50 rounded-lg border border-slate-200/60">
                            <ArrowRight className="w-3.5 h-3.5 text-slate-500 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-slate-600 leading-relaxed">{log.details}</p>
                          </div>
                        )}
                      </div>

                      {/* Enhanced Status badge */}
                      <div className="flex-shrink-0">
                        <Badge 
                          variant={log.type === 'success' ? 'default' : 'secondary'}
                          className={`
                            font-medium capitalize border-2 shadow-sm
                            ${log.type === 'success' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-300' : ''}
                            ${log.type === 'error' ? 'bg-red-100 text-red-700 hover:bg-red-200 border-red-300' : ''}
                            ${log.type === 'processing' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-300' : ''}
                            ${log.type === 'sync' ? 'bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-300' : ''}
                            ${log.type === 'upload' ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-indigo-300' : ''}
                          `}
                        >
                          {log.type === 'processing' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                          {log.type === 'success' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                          {log.type === 'error' && <XCircle className="w-3 h-3 mr-1" />}
                          {log.type === 'sync' && <Database className="w-3 h-3 mr-1" />}
                          {log.type === 'upload' && <Upload className="w-3 h-3 mr-1" />}
                          {log.type}
                        </Badge>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {activityLogs.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                    <Activity className="w-12 h-12 mb-3 opacity-50" />
                    <p className="text-sm font-medium">No activity yet</p>
                    <p className="text-xs">Activity will appear here when POs are uploaded</p>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="active" className="mt-0">
              <ScrollArea className="h-[700px] pr-4">
                <div className="space-y-4">
                  {activePOs.map((po, index) => (
                    <motion.div
                      key={po.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="p-5 bg-gradient-to-br from-white to-slate-50/50 border-2 border-slate-200/60 rounded-xl hover:border-blue-300/60 hover:shadow-lg transition-all"
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            {getStatusIcon(po.status)}
                            {po.status === 'processing' && (
                              <div className="absolute -inset-1 bg-blue-400/20 rounded-full animate-ping" />
                            )}
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-800 text-lg">{po.poNumber}</h4>
                            <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                              <Activity className="w-3 h-3" />
                              {po.stage}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge 
                            variant="outline" 
                            className="font-mono text-base font-bold border-2 px-3 py-1"
                          >
                            {po.itemsProcessed}/{po.totalItems}
                          </Badge>
                          <p className="text-xs text-slate-500 mt-1">items</p>
                        </div>
                      </div>

                      {/* Enhanced Progress Bar with Gradient */}
                      <div className="space-y-2 mb-4">
                        <div className="relative">
                          <Progress 
                            value={po.progress} 
                            className="h-3 bg-slate-200/50"
                          />
                          {/* Progress percentage overlay */}
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xs font-bold text-white drop-shadow-md">
                              {po.progress}%
                            </span>
                          </div>
                        </div>
                        
                        {/* Stage indicators */}
                        <div className="flex items-center justify-between text-xs">
                          <div className={`flex items-center gap-1.5 ${po.progress >= 0 ? 'text-blue-600 font-semibold' : 'text-slate-400'}`}>
                            <FileText className="w-3.5 h-3.5" />
                            <span>AI Parse</span>
                            {po.progress >= 40 && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                          </div>
                          
                          <div className={`flex items-center gap-1.5 ${po.progress >= 40 && po.progress < 60 ? 'text-blue-600 font-semibold' : po.progress >= 60 ? 'text-slate-600' : 'text-slate-400'}`}>
                            <Database className="w-3.5 h-3.5" />
                            <span>Save DB</span>
                            {po.progress >= 60 && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                          </div>
                          
                          <div className={`flex items-center gap-1.5 ${po.progress >= 60 && po.progress < 100 ? 'text-blue-600 font-semibold' : po.progress >= 100 ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                            <Package className="w-3.5 h-3.5" />
                            <span>Shopify</span>
                            {po.progress >= 100 && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                          </div>
                        </div>
                      </div>

                      {/* NEW: Detailed Log Stream */}
                      <div className="mb-4">
                        <ProcessingLogStream 
                          logs={po.logs || []} 
                          autoScroll={true}
                        />
                      </div>

                      {/* Detailed Status Footer */}
                      <div className="flex items-center justify-between pt-3 border-t border-slate-200/60">
                        <div className="flex items-center gap-2 text-xs">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-slate-600 font-medium">{formatTime(po.uploadedAt)}</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {po.status === 'processing' && (
                            <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200">
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              Processing
                            </Badge>
                          )}
                          {po.status === 'completed' && (
                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Complete
                            </Badge>
                          )}
                          {po.status === 'syncing' && (
                            <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-200">
                              <Database className="w-3 h-3 mr-1 animate-pulse" />
                              Syncing
                            </Badge>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}

                  {activePOs.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                      <FileText className="w-12 h-12 mb-3 opacity-50" />
                      <p className="text-sm font-medium">No active purchase orders</p>
                      <p className="text-xs">POs being processed will appear here</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  )
}
