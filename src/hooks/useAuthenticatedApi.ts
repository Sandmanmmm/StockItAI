/**
 * Production-ready API hook for Shopify PO Sync Pro
 * Uses authenticated requests and proper error handling
 */

import { useState, useEffect, useCallback } from 'react'
import { authenticatedRequest, isShopifyEnvironment } from '../lib/shopifyApiService'
import type { APIResponse } from '../lib/apiService'

/**
 * Enhanced useApi hook with authentication and error handling
 */
export function useAuthenticatedApi<T>() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<T | null>(null)

  const request = useCallback(async (
    endpoint: string,
    options?: RequestInit
  ): Promise<APIResponse<T>> => {
    setLoading(true)
    setError(null)

    try {
      const result = await authenticatedRequest<T>(endpoint, options)
      
      if (result.success && result.data) {
        setData(result.data)
      } else {
        setError(result.error || 'Request failed')
      }

      return {
        success: result.success,
        data: result.data,
        error: result.error
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const get = useCallback((endpoint: string) => {
    return request(endpoint, { method: 'GET' })
  }, [request])

  const post = useCallback((endpoint: string, body: any) => {
    return request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    })
  }, [request])

  const put = useCallback((endpoint: string, body: any) => {
    return request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
    })
  }, [request])

  const del = useCallback((endpoint: string) => {
    return request(endpoint, { method: 'DELETE' })
  }, [request])

  return {
    loading,
    error,
    data,
    request,
    get,
    post,
    put,
    delete: del,
    isAuthenticated: isShopifyEnvironment(),
    clearError: () => setError(null),
    clearData: () => setData(null)
  }
}

/**
 * Hook for fetching data on component mount with authentication
 */
export function useFetch<T>(endpoint: string, dependencies: any[] = []) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<T | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await authenticatedRequest<T>(endpoint, { method: 'GET' })
      
      if (result.success && result.data) {
        setData(result.data)
      } else {
        setError(result.error || 'Failed to fetch data')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [endpoint])

  useEffect(() => {
    fetchData()
  }, [fetchData, ...dependencies])

  return {
    loading,
    error,
    data,
    refetch: fetchData,
    isAuthenticated: isShopifyEnvironment()
  }
}

export default useAuthenticatedApi