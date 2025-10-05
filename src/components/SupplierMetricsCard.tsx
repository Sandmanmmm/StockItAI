/**
 * Supplier Metrics Card Component
 * 
 * Displays comprehensive performance metrics for a supplier including:
 * - Health score with visual indicator
 * - Accuracy and quality metrics
 * - Performance statistics
 * - Recent activity trends
 * - Status breakdown
 */

import React, { useEffect, useState } from 'react'
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  DollarSign,
  Target,
  Zap,
  RefreshCw
} from 'lucide-react'
import { motion } from 'framer-motion'

interface SupplierMetrics {
  supplierId: string
  averageAccuracy: number
  dataQualityScore: number
  errorRate: number
  avgProcessingTime: number
  onTimeDeliveryRate: number
  totalPOs: number
  totalValue: number
  recentPOs7Days: number
  recentPOs30Days: number
  activityTrend: 'up' | 'down' | 'stable'
  completedCount: number
  processingCount: number
  failedCount: number
  needsReviewCount: number
  healthScore: number
  lastHealthCheck: string
  calculatedAt: string
}

interface SupplierMetricsCardProps {
  supplierId: string
  className?: string
}

export default function SupplierMetricsCard({ supplierId, className = '' }: SupplierMetricsCardProps) {
  const [metrics, setMetrics] = useState<SupplierMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchMetrics = async (forceRefresh = false) => {
    try {
      setError(null)
      if (forceRefresh) setRefreshing(true)
      else setLoading(true)

      const url = forceRefresh 
        ? `/api/suppliers/${supplierId}/metrics?refresh=true`
        : `/api/suppliers/${supplierId}/metrics`

      const response = await fetch(url)
      const data = await response.json()

      if (data.success) {
        setMetrics(data.data)
      } else {
        setError(data.error || 'Failed to load metrics')
      }
    } catch (err) {
      console.error('Error fetching supplier metrics:', err)
      setError('Failed to load metrics')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchMetrics()
  }, [supplierId])

  if (loading) {
    return (
      <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error || !metrics) {
    return (
      <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
        <div className="text-center text-red-600">
          <AlertCircle className="w-12 h-12 mx-auto mb-2" />
          <p>{error || 'No metrics available'}</p>
        </div>
      </div>
    )
  }

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50 border-green-200'
    if (score >= 60) return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    return 'text-red-600 bg-red-50 border-red-200'
  }

  const getTrendIcon = (trend: string) => {
    if (trend === 'up') return <TrendingUp className="w-4 h-4 text-green-600" />
    if (trend === 'down') return <TrendingDown className="w-4 h-4 text-red-600" />
    return <Minus className="w-4 h-4 text-gray-400" />
  }

  const formatProcessingTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-lg shadow ${className}`}
    >
      {/* Header with Health Score */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Performance Metrics
            </h3>
            <p className="text-sm text-gray-500">
              Last updated: {new Date(metrics.calculatedAt).toLocaleString()}
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Health Score Badge */}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 ${getHealthColor(metrics.healthScore)}`}>
              <Activity className="w-5 h-5" />
              <div>
                <div className="text-xs font-medium">Health Score</div>
                <div className="text-2xl font-bold">{metrics.healthScore.toFixed(0)}</div>
              </div>
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => fetchMetrics(true)}
              disabled={refreshing}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
              title="Refresh metrics"
            >
              <RefreshCw className={`w-5 h-5 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {/* Accuracy */}
          <MetricCard
            icon={<Target className="w-5 h-5" />}
            label="Avg Accuracy"
            value={`${(metrics.averageAccuracy * 100).toFixed(0)}%`}
            iconColor="text-blue-600"
            bgColor="bg-blue-50"
          />

          {/* Data Quality */}
          <MetricCard
            icon={<CheckCircle2 className="w-5 h-5" />}
            label="Data Quality"
            value={`${metrics.dataQualityScore.toFixed(0)}%`}
            iconColor="text-green-600"
            bgColor="bg-green-50"
          />

          {/* Processing Speed */}
          <MetricCard
            icon={<Zap className="w-5 h-5" />}
            label="Avg Processing"
            value={formatProcessingTime(metrics.avgProcessingTime)}
            iconColor="text-purple-600"
            bgColor="bg-purple-50"
          />

          {/* Error Rate */}
          <MetricCard
            icon={<AlertCircle className="w-5 h-5" />}
            label="Error Rate"
            value={`${metrics.errorRate.toFixed(1)}%`}
            iconColor={metrics.errorRate > 10 ? "text-red-600" : "text-green-600"}
            bgColor={metrics.errorRate > 10 ? "bg-red-50" : "bg-green-50"}
          />
        </div>

        {/* Activity & Volume */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Recent Activity */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Recent Activity</span>
              {getTrendIcon(metrics.activityTrend)}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900">{metrics.recentPOs7Days}</span>
              <span className="text-sm text-gray-500">last 7 days</span>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {metrics.recentPOs30Days} in last 30 days
            </div>
          </div>

          {/* Total POs */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-600">Total Orders</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{metrics.totalPOs}</div>
            <div className="text-xs text-gray-500 mt-1">
              {metrics.completedCount} completed
            </div>
          </div>

          {/* Total Value */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-600">Total Value</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(metrics.totalValue)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Avg: {metrics.totalPOs > 0 ? formatCurrency(metrics.totalValue / metrics.totalPOs) : '$0'}
            </div>
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Status Breakdown</h4>
          <div className="grid grid-cols-4 gap-2">
            <StatusBadge
              label="Completed"
              count={metrics.completedCount}
              color="bg-green-100 text-green-800"
            />
            <StatusBadge
              label="Processing"
              count={metrics.processingCount}
              color="bg-blue-100 text-blue-800"
            />
            <StatusBadge
              label="Failed"
              count={metrics.failedCount}
              color="bg-red-100 text-red-800"
            />
            <StatusBadge
              label="Needs Review"
              count={metrics.needsReviewCount}
              color="bg-yellow-100 text-yellow-800"
            />
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// Metric Card Sub-component
function MetricCard({ 
  icon, 
  label, 
  value, 
  iconColor, 
  bgColor 
}: { 
  icon: React.ReactNode
  label: string
  value: string
  iconColor: string
  bgColor: string
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className={`w-10 h-10 rounded-lg ${bgColor} flex items-center justify-center mb-3`}>
        <div className={iconColor}>{icon}</div>
      </div>
      <div className="text-sm text-gray-600 mb-1">{label}</div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
    </div>
  )
}

// Status Badge Sub-component
function StatusBadge({ 
  label, 
  count, 
  color 
}: { 
  label: string
  count: number
  color: string
}) {
  return (
    <div className="text-center">
      <div className={`rounded-full px-3 py-1 text-sm font-semibold ${color}`}>
        {count}
      </div>
      <div className="text-xs text-gray-600 mt-1">{label}</div>
    </div>
  )
}
