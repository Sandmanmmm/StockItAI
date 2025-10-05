export interface PurchaseOrderSearchResult {
  id: string
  number: string
  supplierName?: string | null
  status?: string | null
  totalAmount?: number | null
  currency?: string | null
  orderDate?: string | null
  createdAt?: string | null
}

export interface SupplierSearchResult {
  id: string
  name: string
  status?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  totalOrders?: number
  lastOrderDate?: string | null
  createdAt?: string | null
}

export interface UnifiedSearchResponse {
  purchaseOrders: PurchaseOrderSearchResult[]
  suppliers: SupplierSearchResult[]
}
