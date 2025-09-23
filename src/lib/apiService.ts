/**
 * API Service for Shopify PO Sync Pro
 * Uses authenticated requests for production-ready Shopify integration
 */

import { authenticatedRequest, isShopifyEnvironment } from './shopifyApiService'

// Base configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3003/api'

// Types for API responses
export interface Merchant {
  id: string
  shopDomain: string
  name: string
  email?: string
  phone?: string
  address?: string
  timezone?: string
  currency: string
  plan: string
  status: string
  settings: any
  createdAt: string
  updatedAt: string
}

export interface Supplier {
  id: string
  name: string
  contactEmail?: string
  contactPhone?: string
  address?: string
  website?: string
  category?: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  connectionType: 'manual' | 'api' | 'email' | 'ftp'
  connectionConfig: any
  status: 'active' | 'inactive' | 'error'
  syncEnabled: boolean
  syncFrequency?: string
  totalPOs: number
  averageAccuracy?: number
  createdAt: string
  updatedAt: string
}

export interface PurchaseOrder {
  id: string
  number: string
  supplierName: string
  supplierId?: string
  orderDate?: string
  dueDate?: string
  totalAmount: number
  currency: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'review_needed'
  confidence: number
  rawData?: any
  processingNotes?: string
  fileName?: string
  fileSize?: number
  createdAt: string
  updatedAt: string
  lineItems?: POLineItem[]
  supplier?: Supplier
}

export interface POLineItem {
  id: string
  sku: string
  productName: string
  description?: string
  quantity: number
  unitCost: number
  totalCost: number
  confidence: number
  status: 'pending' | 'matched' | 'new' | 'updated' | 'error' | 'review_needed'
  shopifyProductId?: string
  shopifyVariantId?: string
  aiNotes?: string
  createdAt: string
  updatedAt: string
}

export interface AISettings {
  id: string
  confidenceThreshold: number
  autoApproveHigh: boolean
  strictMatching: boolean
  learningMode: boolean
  autoMatchSuppliers: boolean
  preferredVendors: string[]
  primaryModel: string
  fallbackModel: string
  maxRetries: number
  enableOCR: boolean
  enableNLP: boolean
  enableAutoMapping: boolean
  customRules: any
  fieldMappings: any
  pricingRules: any
  notifyOnErrors: boolean
  notifyOnLowConfidence: boolean
  notifyOnNewSuppliers: boolean
  createdAt: string
  updatedAt: string
}

export interface APIResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

class ApiService {
  /**
   * Make authenticated API request using Shopify session tokens
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<APIResponse<T>> {
    if (isShopifyEnvironment()) {
      // Use authenticated request in Shopify environment
      const result = await authenticatedRequest<T>(endpoint, options)
      return {
        success: result.success,
        data: result.data,
        error: result.error
      }
    } else {
      // Development mode - direct API calls
      try {
        const url = `${API_BASE_URL}${endpoint}`
        const config: RequestInit = {
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
          ...options,
        }

        const response = await fetch(url, config)
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()
        return { 
          success: true, 
          data: data.data || data 
        }
      } catch (error) {
        console.error(`API request failed:`, error)
        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        }
      }
    }
  }

  // Merchant API methods
  async getMerchant(): Promise<APIResponse<Merchant>> {
    return this.request<Merchant>('/merchant')
  }

  async updateMerchant(merchant: Partial<Merchant>): Promise<APIResponse<Merchant>> {
    return this.request<Merchant>('/merchant', {
      method: 'PUT',
      body: JSON.stringify(merchant),
    })
  }

  // Supplier API methods
  async getSuppliers(): Promise<APIResponse<Supplier[]>> {
    return this.request<Supplier[]>('/suppliers')
  }

  async getSupplier(id: string): Promise<APIResponse<Supplier>> {
    return this.request<Supplier>(`/suppliers/${id}`)
  }

  async createSupplier(supplier: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>): Promise<APIResponse<Supplier>> {
    return this.request<Supplier>('/suppliers', {
      method: 'POST',
      body: JSON.stringify(supplier),
    })
  }

  async updateSupplier(id: string, supplier: Partial<Supplier>): Promise<APIResponse<Supplier>> {
    return this.request<Supplier>(`/suppliers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(supplier),
    })
  }

  async deleteSupplier(id: string): Promise<APIResponse<void>> {
    return this.request<void>(`/suppliers/${id}`, {
      method: 'DELETE',
    })
  }

  // Purchase Order API methods
  async getPurchaseOrders(filters?: {
    status?: string
    supplierId?: string
    dateFrom?: string
    dateTo?: string
    limit?: number
    offset?: number
  }): Promise<APIResponse<{ orders: PurchaseOrder[]; total: number }>> {
    const queryParams = new URLSearchParams()
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString())
        }
      })
    }
    
    const endpoint = `/purchase-orders${queryParams.toString() ? `?${queryParams}` : ''}`
    return this.request<{ orders: PurchaseOrder[]; total: number }>(endpoint)
  }

  async getPurchaseOrder(id: string): Promise<APIResponse<PurchaseOrder>> {
    return this.request<PurchaseOrder>(`/purchase-orders/${id}`)
  }

  async createPurchaseOrder(po: Omit<PurchaseOrder, 'id' | 'createdAt' | 'updatedAt'>): Promise<APIResponse<PurchaseOrder>> {
    return this.request<PurchaseOrder>('/purchase-orders', {
      method: 'POST',
      body: JSON.stringify(po),
    })
  }

  async updatePurchaseOrder(id: string, po: Partial<PurchaseOrder>): Promise<APIResponse<PurchaseOrder>> {
    return this.request<PurchaseOrder>(`/purchase-orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(po),
    })
  }

  async deletePurchaseOrder(id: string): Promise<APIResponse<void>> {
    return this.request<void>(`/purchase-orders/${id}`, {
      method: 'DELETE',
    })
  }

  // Line Item API methods
  async getLineItems(purchaseOrderId: string): Promise<APIResponse<POLineItem[]>> {
    return this.request<POLineItem[]>(`/purchase-orders/${purchaseOrderId}/line-items`)
  }

  async updateLineItem(id: string, lineItem: Partial<POLineItem>): Promise<APIResponse<POLineItem>> {
    return this.request<POLineItem>(`/line-items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(lineItem),
    })
  }

  // AI Settings API methods
  async getAISettings(): Promise<APIResponse<AISettings>> {
    return this.request<AISettings>('/ai-settings')
  }

  async updateAISettings(settings: Partial<AISettings>): Promise<APIResponse<AISettings>> {
    return this.request<AISettings>('/ai-settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    })
  }

  // File Upload API methods
  async uploadPOFile(file: File, options?: {
    autoProcess?: boolean
    supplierId?: string
    confidenceThreshold?: number
    customRules?: any
  }): Promise<APIResponse<{ 
    poId: string
    uploadId: string
    fileName: string
    fileSize: number
    status: string
    estimatedProcessingTime: number
    fileUrl: string
  }>> {
    const formData = new FormData()
    formData.append('file', file)
    if (options?.autoProcess) {
      formData.append('autoProcess', 'true')
    }
    if (options?.supplierId) {
      formData.append('supplierId', options.supplierId)
    }
    if (options?.confidenceThreshold) {
      formData.append('confidenceThreshold', options.confidenceThreshold.toString())
    }
    if (options?.customRules) {
      formData.append('customRules', JSON.stringify(options.customRules))
    }

    if (isShopifyEnvironment()) {
      // Use authenticated request in Shopify environment
      try {
        const result = await authenticatedRequest<any>('/upload/po-file', {
          method: 'POST',
          body: formData
        })
        return {
          success: result.success,
          data: result.data,
          error: result.error
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Upload failed'
        }
      }
    } else {
      // Development mode - direct API calls
      try {
        const response = await fetch(`${API_BASE_URL}/upload/po-file`, {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `Upload failed: ${response.status}`)
        }

        const data = await response.json()
        return { 
          success: true, 
          data: data.data 
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Upload failed'
        }
      }
    }
  }

  async getUploadStatus(poId: string): Promise<APIResponse<{
    poId: string
    uploadId: string
    fileName: string
    fileSize: number
    fileUrl?: string
    uploadedAt: string
    status: string
    progress: number
    message: string
    processingTime?: number
    confidence?: number
    purchaseOrder?: PurchaseOrder
    jobError?: string
  }>> {
    return this.request(`/upload/${poId}/status`)
  }

  async triggerProcessing(poId: string, options?: {
    confidenceThreshold?: number
    customRules?: any
  }): Promise<APIResponse<{
    poId: string
    jobId: string
    status: string
    estimatedTime: number
  }>> {
    return this.request(`/upload/${poId}/process`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    })
  }

  async downloadPOFile(poId: string): Promise<APIResponse<{
    downloadUrl: string
    fileName: string
    fileSize: number
  }>> {
    return this.request(`/upload/${poId}/download`)
  }

  // Analytics API methods
  async getDashboardStats(): Promise<APIResponse<{
    totalPOs: number
    pendingPOs: number
    processedToday: number
    averageAccuracy: number
    totalSuppliers: number
    recentActivity: Array<{
      id: string
      type: string
      message: string
      timestamp: string
    }>
  }>> {
    return this.request('/analytics/dashboard')
  }

  // Shopify Integration API methods
  async syncWithShopify(options?: {
    syncProducts?: boolean
    syncInventory?: boolean
    syncOrders?: boolean
  }): Promise<APIResponse<{
    syncId: string
    status: string
  }>> {
    return this.request('/shopify/sync', {
      method: 'POST',
      body: JSON.stringify(options || {}),
    })
  }

  async getSyncStatus(syncId: string): Promise<APIResponse<{
    status: 'pending' | 'running' | 'completed' | 'failed'
    progress: number
    message?: string
    results?: any
  }>> {
    return this.request(`/shopify/sync/${syncId}/status`)
  }
}

// Export singleton instance
export const apiService = new ApiService()
export default apiService