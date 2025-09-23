/**
 * Custom React hooks for data management with authenticated API service
 * Provides loading states, error handling, and data caching
 * Now uses production-ready Shopify authentication
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { apiService, APIResponse, PurchaseOrder, Supplier, POLineItem, AISettings } from '@/lib/apiService'
import { authenticatedRequest, isShopifyEnvironment } from '@/lib/shopifyApiService'

// Generic hook for API calls with loading and error states
export function useApi<T>(
  apiCall: () => Promise<APIResponse<T>>,
  deps: unknown[] = []
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await apiCall()
      if (response.success && response.data) {
        setData(response.data)
        setLastFetch(new Date())
      } else {
        setError(response.error || 'Unknown error occurred')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setLoading(false)
    }
  }, deps)

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const refetch = useCallback(() => {
    fetchData()
  }, [fetchData])

  return {
    data,
    loading,
    error,
    lastFetch,
    refetch,
    isAuthenticated: isShopifyEnvironment()
  }
}

// Hook for managing suppliers
export function useSuppliers() {
  const {
    data: suppliers,
    loading,
    error,
    refetch
  } = useApi(() => apiService.getSuppliers(), [])

  const [creating, setCreating] = useState(false)
  const [updating, setUpdating] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const createSupplier = useCallback(async (supplierData: any) => {
    setCreating(true)
    try {
      const response = await apiService.createSupplier(supplierData)
      if (response.success) {
        refetch()
        return { success: true, data: response.data }
      } else {
        return { success: false, error: response.error }
      }
    } finally {
      setCreating(false)
    }
  }, [refetch])

  const updateSupplier = useCallback(async (id: string, updates: any) => {
    setUpdating(id)
    try {
      const response = await apiService.updateSupplier(id, updates)
      if (response.success) {
        refetch()
        return { success: true, data: response.data }
      } else {
        return { success: false, error: response.error }
      }
    } finally {
      setUpdating(null)
    }
  }, [refetch])

  const deleteSupplier = useCallback(async (id: string) => {
    setDeleting(id)
    try {
      const response = await apiService.deleteSupplier(id)
      if (response.success) {
        refetch()
        return { success: true }
      } else {
        return { success: false, error: response.error }
      }
    } finally {
      setDeleting(null)
    }
  }, [refetch])

  return {
    suppliers: suppliers || [],
    loading,
    error,
    creating,
    updating,
    deleting,
    refetch,
    createSupplier,
    updateSupplier,
    deleteSupplier
  }
}

// Hook for managing purchase orders
export function usePurchaseOrders(filters?: any) {
  const {
    data: response,
    loading,
    error,
    refetch
  } = useApi(() => apiService.getPurchaseOrders(filters), [filters])

  const [creating, setCreating] = useState(false)
  const [updating, setUpdating] = useState<string | null>(null)

  const createPurchaseOrder = useCallback(async (poData: any) => {
    setCreating(true)
    try {
      const response = await apiService.createPurchaseOrder(poData)
      if (response.success) {
        refetch()
        return { success: true, data: response.data }
      } else {
        return { success: false, error: response.error }
      }
    } finally {
      setCreating(false)
    }
  }, [refetch])

  const updatePurchaseOrder = useCallback(async (id: string, updates: any) => {
    setUpdating(id)
    try {
      const response = await apiService.updatePurchaseOrder(id, updates)
      if (response.success) {
        refetch()
        return { success: true, data: response.data }
      } else {
        return { success: false, error: response.error }
      }
    } finally {
      setUpdating(null)
    }
  }, [refetch])

  return {
    orders: response?.orders || [],
    total: response?.total || 0,
    loading,
    error,
    creating,
    updating,
    refetch,
    createPurchaseOrder,
    updatePurchaseOrder
  }
}

// Hook for managing a single purchase order with line items
export function usePurchaseOrder(id: string) {
  const {
    data: order,
    loading,
    error,
    refetch
  } = useApi(() => apiService.getPurchaseOrder(id), [id])

  const [updatingLineItem, setUpdatingLineItem] = useState<string | null>(null)

  const updateLineItem = useCallback(async (lineItemId: string, updates: any) => {
    setUpdatingLineItem(lineItemId)
    try {
      const response = await apiService.updateLineItem(lineItemId, updates)
      if (response.success) {
        refetch()
        return { success: true, data: response.data }
      } else {
        return { success: false, error: response.error }
      }
    } finally {
      setUpdatingLineItem(null)
    }
  }, [refetch])

  return {
    order: order || null,
    loading,
    error,
    updatingLineItem,
    refetch,
    updateLineItem
  }
}

// Hook for AI settings
export function useAISettings() {
  const {
    data: settings,
    loading,
    error,
    refetch
  } = useApi(() => apiService.getAISettings(), [])

  const [updating, setUpdating] = useState(false)

  const updateSettings = useCallback(async (updates: Partial<AISettings>) => {
    setUpdating(true)
    try {
      const response = await apiService.updateAISettings(updates)
      if (response.success) {
        refetch()
        return { success: true, data: response.data }
      } else {
        return { success: false, error: response.error }
      }
    } finally {
      setUpdating(false)
    }
  }, [refetch])

  return {
    settings: settings || null,
    loading,
    error,
    updating,
    refetch,
    updateSettings
  }
}

// Hook for file upload with progress tracking
export function useFileUpload() {
  const [uploading, setUploading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [processingProgress, setProcessingProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PurchaseOrder | null>(null)

  const uploadAndProcess = useCallback(async (
    file: File, 
    options?: { autoProcess?: boolean; supplierId?: string }
  ) => {
    setUploading(true)
    setProcessing(false)
    setError(null)
    setResult(null)
    setUploadProgress(0)
    setProcessingProgress(0)

    try {
      // Upload file
      const uploadResponse = await apiService.uploadPOFile(file, options)
      if (!uploadResponse.success) {
        throw new Error(uploadResponse.error || 'Upload failed')
      }

      setUploading(false)
      setUploadProgress(100)

      const { uploadId } = uploadResponse.data!

      // Process file
      if (options?.autoProcess !== false) {
        setProcessing(true)
        
        const processResponse = await apiService.processPOFile(uploadId)
        if (!processResponse.success) {
          throw new Error(processResponse.error || 'Processing failed')
        }

        // Poll for processing status
        let attempts = 0
        const maxAttempts = 60 // 5 minutes max
        
        const pollStatus = async (): Promise<void> => {
          if (attempts >= maxAttempts) {
            throw new Error('Processing timeout')
          }

          const statusResponse = await apiService.getProcessingStatus(uploadId)
          if (!statusResponse.success) {
            throw new Error(statusResponse.error || 'Failed to get processing status')
          }

          const { status, progress, result: processResult } = statusResponse.data!
          setProcessingProgress(progress)

          if (status === 'completed' && processResult) {
            setResult(processResult)
            setProcessing(false)
            return
          }

          if (status === 'failed') {
            throw new Error('Processing failed')
          }

          // Continue polling
          attempts++
          setTimeout(pollStatus, 5000) // Poll every 5 seconds
        }

        await pollStatus()
      }

      return { success: true, uploadId }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      setUploading(false)
      setProcessing(false)
      return { success: false, error: errorMessage }
    }
  }, [])

  const reset = useCallback(() => {
    setUploading(false)
    setProcessing(false)
    setUploadProgress(0)
    setProcessingProgress(0)
    setError(null)
    setResult(null)
  }, [])

  return {
    uploading,
    processing,
    uploadProgress,
    processingProgress,
    error,
    result,
    uploadAndProcess,
    reset
  }
}

// Hook for dashboard statistics
export function useDashboardStats() {
  const {
    data: stats,
    loading,
    error,
    refetch
  } = useApi(() => apiService.getDashboardStats(), [])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(refetch, 30000)
    return () => clearInterval(interval)
  }, [refetch])

  return {
    stats: stats || null,
    loading,
    error,
    refetch
  }
}

// Hook for Shopify sync operations
export function useShopifySync() {
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const activeSyncId = useRef<string | null>(null)

  const startSync = useCallback(async (options?: any) => {
    setSyncing(true)
    setError(null)
    setSyncProgress(0)
    setSyncStatus('Starting sync...')

    try {
      const response = await apiService.syncWithShopify(options)
      if (!response.success) {
        throw new Error(response.error || 'Sync failed to start')
      }

      const { syncId } = response.data!
      activeSyncId.current = syncId

      // Poll sync status
      const pollSync = async (): Promise<void> => {
        if (!activeSyncId.current) return

        const statusResponse = await apiService.getSyncStatus(activeSyncId.current)
        if (!statusResponse.success) {
          throw new Error(statusResponse.error || 'Failed to get sync status')
        }

        const { status, progress, message } = statusResponse.data!
        setSyncProgress(progress)
        setSyncStatus(message || status)

        if (status === 'completed') {
          setSyncing(false)
          activeSyncId.current = null
          return
        }

        if (status === 'failed') {
          throw new Error(message || 'Sync failed')
        }

        // Continue polling
        setTimeout(pollSync, 3000)
      }

      await pollSync()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sync failed'
      setError(errorMessage)
      setSyncing(false)
      activeSyncId.current = null
    }
  }, [])

  const cancelSync = useCallback(() => {
    activeSyncId.current = null
    setSyncing(false)
    setSyncProgress(0)
    setSyncStatus(null)
  }, [])

  return {
    syncing,
    syncProgress,
    syncStatus,
    error,
    startSync,
    cancelSync
  }
}