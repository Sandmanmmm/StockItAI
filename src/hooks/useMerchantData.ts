/**
 * Merchant Data Hooks
 * Authenticated React hooks for fetching merchant-specific data
 * Replaces useKV patterns with real API calls
 */

import { useState, useEffect } from 'react'
import { authenticatedRequest } from '../lib/shopifyApiService'

// Type definitions for API responses
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

interface DashboardMetrics {
  totalPOs: number
  pendingPOs: number
  processingPOs: number
  completedPOs: number
  totalAmount: number
  currency: string
  totalSuppliers: number
  activeSuppliers: number
}

interface DashboardSummaryData {
  recentPOs: POSummary[]
  metrics: DashboardMetrics
}

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

interface SuppliersData {
  suppliers: Supplier[]
  total: number
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

interface SupplierMetricsData {
  supplierMetrics: SupplierMetric[]
  period: string
}

interface NotificationAction {
  type: 'retry' | 'view' | 'review'
  poId: string
}

interface Notification {
  id: string
  type: 'error' | 'success' | 'warning' | 'info'
  title: string
  message: string
  details?: string
  timestamp: string
  action?: NotificationAction
}

interface NotificationsData {
  notifications: Notification[]
  unreadCount: number
}

interface PurchaseOrderFilters {
  status?: string
  supplierId?: string
  dateFrom?: string
  dateTo?: string
  limit?: number
  offset?: number
}

// Dashboard summary hook - replaces useKV for recent POs and metrics
export function useDashboardSummary() {
  const [data, setData] = useState<DashboardSummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDashboardSummary = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await authenticatedRequest('/api/merchant/data/dashboard-summary')
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch dashboard summary')
      }
      
      setData(response.data as DashboardSummaryData)
    } catch (err) {
      console.error('Dashboard summary fetch error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboardSummary()
  }, [])

  return {
    recentPOs: data?.recentPOs || [],
    metrics: data?.metrics || {} as DashboardMetrics,
    loading,
    error,
    refetch: fetchDashboardSummary
  }
}

// Suppliers hook - replaces useKV for suppliers list
export function useSuppliers() {
  const [data, setData] = useState<SuppliersData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSuppliers = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await authenticatedRequest('/api/merchant/data/suppliers')
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch suppliers')
      }
      
      setData(response.data as SuppliersData)
    } catch (err) {
      console.error('Suppliers fetch error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSuppliers()
  }, [])

  return {
    suppliers: data?.suppliers || [],
    total: data?.total || 0,
    loading,
    error,
    refetch: fetchSuppliers
  }
}

// Supplier metrics hook - replaces useKV for supplier metrics
export function useSupplierMetrics() {
  const [data, setData] = useState<SupplierMetricsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSupplierMetrics = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await authenticatedRequest('/api/merchant/data/supplier-metrics')
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch supplier metrics')
      }
      
      setData(response.data as SupplierMetricsData)
    } catch (err) {
      console.error('Supplier metrics fetch error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSupplierMetrics()
  }, [])

  return {
    supplierMetrics: data?.supplierMetrics || [],
    period: data?.period || '30 days',
    loading,
    error,
    refetch: fetchSupplierMetrics
  }
}

// Notifications hook - replaces useKV for notifications
export function useNotifications() {
  const [data, setData] = useState<NotificationsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchNotifications = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await authenticatedRequest('/api/merchant/data/notifications')
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch notifications')
      }
      
      setData(response.data as NotificationsData)
    } catch (err) {
      console.error('Notifications fetch error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (notificationId: string) => {
    try {
      // In a real implementation, you'd call an API to mark as read
      // For now, just refetch the notifications
      await fetchNotifications()
    } catch (err) {
      console.error('Mark notification as read error:', err)
    }
  }

  useEffect(() => {
    fetchNotifications()
  }, [])

  return {
    notifications: data?.notifications || [],
    unreadCount: data?.unreadCount || 0,
    loading,
    error,
    refetch: fetchNotifications,
    markAsRead
  }
}

// Purchase Orders hook - enhanced version that uses authenticated API instead of useKV
export function usePurchaseOrders(filters: PurchaseOrderFilters = {}) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPurchaseOrders = async (currentFilters: PurchaseOrderFilters = filters) => {
    try {
      setLoading(true)
      setError(null)
      
      // Build query parameters
      const params = new URLSearchParams()
      if (currentFilters.status) params.set('status', currentFilters.status)
      if (currentFilters.supplierId) params.set('supplierId', currentFilters.supplierId)
      if (currentFilters.dateFrom) params.set('dateFrom', currentFilters.dateFrom)
      if (currentFilters.dateTo) params.set('dateTo', currentFilters.dateTo)
      if (currentFilters.limit) params.set('limit', currentFilters.limit.toString())
      if (currentFilters.offset) params.set('offset', currentFilters.offset.toString())
      
      const url = `/api/purchase-orders${params.toString() ? `?${params.toString()}` : ''}`
      const response = await authenticatedRequest(url)
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch purchase orders')
      }
      
      setData(response.data)
    } catch (err) {
      console.error('Purchase orders fetch error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPurchaseOrders()
  }, [JSON.stringify(filters)]) // Refetch when filters change

  return {
    purchaseOrders: data?.orders || [],
    total: data?.total || 0,
    limit: data?.limit || 50,
    offset: data?.offset || 0,
    loading,
    error,
    refetch: fetchPurchaseOrders
  }
}

// Generic authenticated data hook for other components
export function useAuthenticatedData(endpoint: string, dependencies: any[] = []) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await authenticatedRequest(endpoint)
      
      if (!response.success) {
        throw new Error(response.error || `Failed to fetch data from ${endpoint}`)
      }
      
      setData(response.data)
    } catch (err) {
      console.error(`Fetch error for ${endpoint}:`, err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, dependencies)

  return {
    data,
    loading,
    error,
    refetch: fetchData
  }
}