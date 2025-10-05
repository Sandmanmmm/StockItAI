/**
 * Product Drafts Hook
 * Fetches and manages product drafts ready for Shopify sync
 */

import { useState, useEffect, useCallback } from 'react'
import { authenticatedRequest } from '../lib/shopifyApiService'

export interface ProductDraft {
  id: string
  title: string
  originalTitle?: string
  refinedTitle?: string
  description?: string
  vendor?: string
  productType?: string
  tags: string[]
  
  // Pricing
  priceOriginal?: number
  priceRefined?: number
  costPrice?: number
  margin?: number
  currencyOriginal: string
  currencyTarget: string
  
  // Identifiers
  sku?: string
  barcode?: string
  
  // Physical
  weight?: number
  weightUnit: string
  
  // Inventory
  trackQuantity: boolean
  requiresShipping: boolean
  taxable: boolean
  
  // Status
  status: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'synced'
  syncStatus: 'not_synced' | 'syncing' | 'synced' | 'failed'
  confidence: number
  
  // Shopify
  shopifyProductId?: string
  shopifyHandle?: string
  shopifyUrl?: string
  syncError?: string
  lastSyncAt?: string
  
  // Relations
  merchantId: string
  purchaseOrderId?: string
  supplierId?: string
  lineItemId?: string
  
  // Relation objects (populated when included)
  purchaseOrder?: {
    id: string
    number: string
  }
  supplier?: {
    id: string
    name: string
  }
  lineItem?: {
    id: string
    productName: string
    sku?: string
    quantity?: number
    unitCost?: number
    totalCost?: number
  }
  
  // Images & Variants
  images?: Array<{
    id: string
    url: string
    enhancedUrl?: string
    altText?: string
    position: number
    isEnhanced?: boolean
    isApproved?: boolean
    isSelected?: boolean
  }>
  variants?: Array<{
    id: string
    title: string
    sku?: string
    price: number
    compareAtPrice?: number
    inventory?: number
  }>
  
  // Timestamps
  createdAt: string
  updatedAt: string
}

interface ProductDraftsData {
  productDrafts: ProductDraft[]
  total: number
  stats: {
    draft: number
    pending_review: number
    approved: number
    rejected: number
    synced: number
    not_synced: number
    syncing: number
    failed: number
  }
}

export function useProductDrafts(filters?: {
  status?: string
  syncStatus?: string
  supplierId?: string
}) {
  const [data, setData] = useState<ProductDraftsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProductDrafts = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Build query params
      const params = new URLSearchParams()
      if (filters?.status) params.append('status', filters.status)
      if (filters?.syncStatus) params.append('syncStatus', filters.syncStatus)
      if (filters?.supplierId) params.append('supplierId', filters.supplierId)
      
      const queryString = params.toString()
      const url = `/api/product-drafts${queryString ? `?${queryString}` : ''}`
      
      const response = await authenticatedRequest(url)
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch product drafts')
      }
      
      setData(response.data as ProductDraftsData)
    } catch (err) {
      console.error('Product drafts fetch error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [filters?.status, filters?.syncStatus, filters?.supplierId])

  useEffect(() => {
    fetchProductDrafts()
  }, [filters?.status, filters?.syncStatus, filters?.supplierId])

  const syncToShopify = async (productIds: string[]) => {
    try {
      const response = await authenticatedRequest('/api/product-drafts/sync', {
        method: 'POST',
        body: JSON.stringify({ productIds })
      })
      
      if (!response.success) {
        throw new Error(response.error || 'Sync failed')
      }
      
      // Refresh data after sync
      await fetchProductDrafts()
      
      return response.data
    } catch (err) {
      console.error('Sync error:', err)
      throw err
    }
  }

  const updateDraft = async (id: string, updates: Partial<ProductDraft>) => {
    try {
      const response = await authenticatedRequest(`/api/product-drafts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      })
      
      if (!response.success) {
        throw new Error(response.error || 'Update failed')
      }
      
      await fetchProductDrafts()
      return response.data
    } catch (err) {
      console.error('Update error:', err)
      throw err
    }
  }

  return {
    productDrafts: data?.productDrafts || [],
    total: data?.total || 0,
    stats: data?.stats || {
      draft: 0,
      pending_review: 0,
      approved: 0,
      rejected: 0,
      synced: 0,
      not_synced: 0,
      syncing: 0,
      failed: 0
    },
    loading,
    error,
    refetch: fetchProductDrafts,
    syncToShopify,
    updateDraft
  }
}
