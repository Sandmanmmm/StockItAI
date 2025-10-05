/**
 * Purchase Order Review Page
 * 
 * Integrates the MerchantReviewInterface with existing app architecture
 * Handles data fetching, state management, and navigation
 */

import { useState, useEffect } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import MerchantReviewInterface from './admin/MerchantReviewInterface'
import { authenticatedRequest } from '../lib/shopifyApiService'
import { notificationService } from '../lib/notificationService'

interface PurchaseOrderReviewPageProps {
  purchaseOrderId: string
  onBack: () => void
}

// Type definitions that match our database schema
interface LineItem {
  id: string
  sku: string
  productName: string
  description?: string
  quantity: number
  unitCost: number
  totalCost: number
  confidence: number
  status: string
  aiNotes?: string
  shopifyProductId?: string
  shopifyVariantId?: string
  shopifySync?: string
  shopifySyncAt?: string
  syncError?: string
}

interface Supplier {
  id: string
  name: string
  contactEmail?: string
  contactPhone?: string
  address?: string
  confidence?: number
}

interface PurchaseOrder {
  id: string
  number: string
  supplierName: string
  orderDate?: string
  dueDate?: string
  totalAmount: number
  currency: string
  status: string
  confidence: number
  processingNotes?: string
  fileName?: string
  lineItems: LineItem[]
  supplier?: Supplier
  aiAuditTrail?: any[]
  syncStartedAt?: string
  syncCompletedAt?: string
  syncResults?: any
}

interface AISettings {
  confidenceThreshold: number
  autoApproveHigh: boolean
  strictMatching: boolean
  learningMode: boolean
}

export function PurchaseOrderReviewPage({ 
  purchaseOrderId, 
  onBack 
}: PurchaseOrderReviewPageProps) {
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null>(null)
  const [aiSettings, setAISettings] = useState<AISettings>({
    confidenceThreshold: 80,
    autoApproveHigh: false,
    strictMatching: true,
    learningMode: true
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch purchase order data
  useEffect(() => {
    fetchPurchaseOrder()
    fetchAISettings()
  }, [purchaseOrderId])

  const fetchPurchaseOrder = async () => {
    try {
      setIsLoading(true)
      const response = await authenticatedRequest(`/purchase-orders/${purchaseOrderId}?include=lineItems,supplier,aiAuditTrail`)
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch purchase order')
      }
      
      setPurchaseOrder(response.data as PurchaseOrder)
    } catch (error) {
      console.error('Error fetching purchase order:', error)
      setError(error instanceof Error ? error.message : 'Failed to load purchase order')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchAISettings = async () => {
    try {
      const response = await authenticatedRequest('/api/ai-settings')
      
      if (response.success && response.data) {
        setAISettings((response.data as any).settings)
      }
    } catch (error) {
      console.error('Error fetching AI settings:', error)
      // Use defaults if settings can't be fetched
    }
  }

  const handleApprove = async (poId: string, editedData?: any) => {
    try {
      setIsLoading(true)
      
      // If edited data is provided, update the PO first
      if (editedData) {
        const updateResponse = await authenticatedRequest(`/purchase-orders/${poId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            purchaseOrder: editedData,
            lineItems: editedData.lineItems,
            supplier: editedData.supplier
          })
        })

        if (!updateResponse.success) {
          throw new Error(updateResponse.error || 'Failed to update purchase order')
        }
      }

      // Approve the PO - changes status from "Review" to "Completed"
      // Does NOT sync to Shopify automatically
      const approveResponse = await authenticatedRequest(`/purchase-orders/${poId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          syncToShopify: false,  // Do not sync to Shopify
          queueShopifySync: false // Do not queue for sync
        })
      })

      if (!approveResponse.success) {
        throw new Error(approveResponse.error || 'Failed to approve purchase order')
      }
      
      // Refresh the purchase order data to show updated status
      await fetchPurchaseOrder()
      
      await notificationService.showSuccess(
        'Purchase Order Approved',
        `PO ${purchaseOrder?.number} has been moved to "Completed" status. You can sync to Shopify from the Purchase Orders list.`
      )

      // Navigate back after a short delay
      setTimeout(() => {
        onBack()  // This will trigger refetch in the parent component
      }, 2000)

    } catch (error) {
      console.error('Error approving purchase order:', error)
      await notificationService.showError(
        'Approval Failed',
        error instanceof Error ? error.message : 'Failed to approve purchase order'
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeny = async (poId: string, reason: string) => {
    try {
      setIsLoading(true)

      const response = await authenticatedRequest(`/purchase-orders/${poId}/deny`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reason
        })
      })

      if (!response.success) {
        throw new Error(response.error || 'Failed to deny purchase order')
      }

      // Refresh the purchase order data to show updated status
      await fetchPurchaseOrder()

      await notificationService.showWarning(
        'Purchase Order Denied',
        `PO ${purchaseOrder?.number} has been denied. Reason: ${reason}`
      )

      // Small delay to show the updated status, then navigate back
      setTimeout(() => {
        onBack()
      }, 2000)

    } catch (error) {
      console.error('Error denying purchase order:', error)
      await notificationService.showError(
        'Denial Failed',
        error instanceof Error ? error.message : 'Failed to deny purchase order'
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleEdit = async (poId: string, editedData: any) => {
    try {
      setIsLoading(true)

      const response = await authenticatedRequest(`/purchase-orders/${poId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          purchaseOrder: editedData,
          lineItems: editedData.lineItems,
          supplier: editedData.supplier
        })
      })

      if (!response.success) {
        throw new Error(response.error || 'Failed to update purchase order')
      }

      const result = response.data as any
      setPurchaseOrder(result.purchaseOrder)

      await notificationService.showSuccess(
        'Purchase Order Updated',
        `PO ${editedData.number} has been updated successfully.`
      )

    } catch (error) {
      console.error('Error updating purchase order:', error)
      await notificationService.showError(
        'Update Failed',
        error instanceof Error ? error.message : 'Failed to update purchase order'
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdateSettings = async (settings: AISettings) => {
    try {
      const response = await authenticatedRequest('/api/ai-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
      })

      if (!response.success) {
        throw new Error(response.error || 'Failed to update AI settings')
      }

      setAISettings(settings)

      await notificationService.showSuccess(
        'AI Settings Updated',
        'Your AI processing settings have been saved.'
      )

    } catch (error) {
      console.error('Error updating AI settings:', error)
      await notificationService.showError(
        'Settings Update Failed',
        error instanceof Error ? error.message : 'Failed to update AI settings'
      )
    }
  }

  if (isLoading && !purchaseOrder) {
    return (
      <Card className="max-w-md mx-auto mt-8">
        <CardContent className="flex items-center justify-center py-8">
          <div className="flex items-center space-x-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading purchase order...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto mt-8">
        <Alert variant="destructive">
          <AlertDescription>
            {error}
          </AlertDescription>
        </Alert>
        <div className="mt-4 text-center">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Purchase Orders
          </Button>
        </div>
      </div>
    )
  }

  if (!purchaseOrder) {
    return (
      <div className="max-w-md mx-auto mt-8">
        <Alert>
          <AlertDescription>
            Purchase order not found.
          </AlertDescription>
        </Alert>
        <div className="mt-4 text-center">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Purchase Orders
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Navigation Header */}
      <div className="flex items-center space-x-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Purchase Orders
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Review Purchase Order</h1>
          <p className="text-gray-600">
            {purchaseOrder.number} • {purchaseOrder.supplierName}
          </p>
        </div>
      </div>

      {/* Merchant Review Interface */}
      <MerchantReviewInterface
        purchaseOrder={purchaseOrder}
        onApprove={handleApprove}
        onDeny={handleDeny}
        onViewDetails={(poId) => {
          // Navigate to detailed PO page for editing
          // This will open PurchaseOrderDetails component
          console.log('View details for PO:', poId)
          // You can implement navigation here if needed
        }}
        isLoading={isLoading}
      />
    </div>
  )
}