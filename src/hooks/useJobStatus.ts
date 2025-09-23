/**
 * Job Status Management Hooks for Shopify PO Sync Pro
 * Provides merchant-facing job visibility, retry, and management functionality
 */

import { useState, useEffect, useCallback } from 'react'
import { authenticatedRequest } from '../lib/shopifyApiService'
import type { APIResponse } from '../lib/apiService'

export interface JobSummary {
  status: {
    processing: number
    completed: number
    failed: number
    deadLetterQueue: number
  }
  health: {
    score: number
    status: 'excellent' | 'good' | 'warning' | 'critical'
  }
  alerts: JobAlert[]
  lastUpdated: string
}

export interface JobAlert {
  id: string
  type: 'error' | 'critical' | 'warning' | 'success'
  title: string
  message: string
  action?: {
    label: string
    endpoint: string
  }
  count: number
  severity: 'critical' | 'high' | 'medium' | 'info'
  timestamp: string
}

export interface Job {
  id: string
  type: string
  purchaseOrderId: string | null
  fileName: string | null
  status: 'processing' | 'completed' | 'failed' | 'dead-letter'
  priority: 'critical' | 'high' | 'normal' | 'low' | 'batch'
  createdAt: string
  processedAt: string | null
  completedAt: string | null
  progress: number
  error: string | null
  attempts: number
  maxAttempts: number
  canRetry: boolean
  estimatedDuration: number | null
}

export interface PurchaseOrderJobs {
  purchaseOrder: {
    id: string
    fileName: string
    supplier: string
    status: string
    jobStatus: string | null
    analysisJobId: string | null
    syncJobId: string | null
    totalAmount: number
    lineItemsCount: number
  }
  jobs: Job[]
}

/**
 * Hook for getting job summary and alerts
 */
export function useJobSummary(autoRefresh = true, refreshInterval = 30000) {
  const [summary, setSummary] = useState<JobSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSummary = useCallback(async (): Promise<APIResponse<JobSummary>> => {
    setLoading(true)
    setError(null)

    try {
      const result = await authenticatedRequest<JobSummary>('/api/merchant/jobs/summary')
      
      if (result.success && result.data) {
        setSummary(result.data)
      } else {
        setError(result.error || 'Failed to fetch job summary')
      }

      return result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      return { success: false, error: errorMessage }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSummary()

    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(fetchSummary, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetchSummary, autoRefresh, refreshInterval])

  return {
    summary,
    loading,
    error,
    refetch: fetchSummary
  }
}

/**
 * Hook for getting jobs by status
 */
export function useJobsByStatus(
  status: 'processing' | 'completed' | 'failed' | 'dead-letter',
  page = 1,
  limit = 10
) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0
  })

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await authenticatedRequest<{
        jobs: Job[]
        pagination: typeof pagination
      }>(`/api/merchant/jobs/status/${status}?page=${page}&limit=${limit}`)
      
      if (result.success && result.data) {
        setJobs(result.data.jobs)
        setPagination(result.data.pagination)
      } else {
        setError(result.error || 'Failed to fetch jobs')
      }

      return result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      return { success: false, error: errorMessage }
    } finally {
      setLoading(false)
    }
  }, [status, page, limit])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  return {
    jobs,
    loading,
    error,
    pagination,
    refetch: fetchJobs
  }
}

/**
 * Hook for getting jobs for a specific purchase order
 */
export function usePurchaseOrderJobs(purchaseOrderId: string) {
  const [data, setData] = useState<PurchaseOrderJobs | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchJobs = useCallback(async () => {
    if (!purchaseOrderId) return

    setLoading(true)
    setError(null)

    try {
      const result = await authenticatedRequest<PurchaseOrderJobs>(
        `/api/merchant/jobs/purchase-order/${purchaseOrderId}`
      )
      
      if (result.success && result.data) {
        setData(result.data)
      } else {
        setError(result.error || 'Failed to fetch purchase order jobs')
      }

      return result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      return { success: false, error: errorMessage }
    } finally {
      setLoading(false)
    }
  }, [purchaseOrderId])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  return {
    data,
    loading,
    error,
    refetch: fetchJobs
  }
}

/**
 * Hook for job management actions (retry, remove)
 */
export function useJobActions() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const retryJob = useCallback(async (jobId: string) => {
    setLoading(true)
    setError(null)

    try {
      const result = await authenticatedRequest<{
        newJobId: string
        originalJobId: string
      }>(`/api/merchant/jobs/retry/${jobId}`, {
        method: 'POST'
      })
      
      if (!result.success) {
        setError(result.error || 'Failed to retry job')
      }

      return result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      return { success: false, error: errorMessage }
    } finally {
      setLoading(false)
    }
  }, [])

  const retryAllFailedJobs = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await authenticatedRequest<{
        totalJobs: number
        successful: number
        failed: number
        retryRate: number
      }>('/api/merchant/jobs/retry-failed-pos', {
        method: 'POST'
      })
      
      if (!result.success) {
        setError(result.error || 'Failed to retry failed jobs')
      }

      return result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      return { success: false, error: errorMessage }
    } finally {
      setLoading(false)
    }
  }, [])

  const removeJob = useCallback(async (jobId: string) => {
    setLoading(true)
    setError(null)

    try {
      const result = await authenticatedRequest(`/api/merchant/jobs/${jobId}`, {
        method: 'DELETE'
      })
      
      if (!result.success) {
        setError(result.error || 'Failed to remove job')
      }

      return result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      return { success: false, error: errorMessage }
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    loading,
    error,
    retryJob,
    retryAllFailedJobs,
    removeJob
  }
}

/**
 * Hook for getting current alerts
 */
export function useJobAlerts(autoRefresh = true, refreshInterval = 60000) {
  const [alerts, setAlerts] = useState<JobAlert[]>([])
  const [summary, setSummary] = useState({
    totalAlerts: 0,
    criticalAlerts: 0,
    hasIssues: false
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await authenticatedRequest<{
        alerts: JobAlert[]
        summary: typeof summary
      }>('/api/merchant/jobs/alerts')
      
      if (result.success && result.data) {
        setAlerts(result.data.alerts)
        setSummary(result.data.summary)
      } else {
        setError(result.error || 'Failed to fetch alerts')
      }

      return result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      return { success: false, error: errorMessage }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAlerts()

    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(fetchAlerts, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetchAlerts, autoRefresh, refreshInterval])

  return {
    alerts,
    summary,
    loading,
    error,
    refetch: fetchAlerts
  }
}