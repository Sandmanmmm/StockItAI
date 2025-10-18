/**
 * Merchant Review Interface - Streamlined
 * 
 * Focused interface for quick purchase order review and approval
 * Features:
 * - Clear PO summary with confidence indicators
 * - Simple line items list for verification  
 * - Quick approve/deny actions
 * - Link to detailed PO page for in-depth editing
 */

import React, { useState } from 'react'
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription 
} from '@/components/ui/card'
import { 
  Button 
} from '@/components/ui/button'
import { 
  Badge 
} from '@/components/ui/badge'
import { 
  Textarea 
} from '@/components/ui/textarea'
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { 
  Alert,
  AlertDescription
} from '@/components/ui/alert'
import { 
  CheckCircle, 
  XCircle, 
  FileText, 
  AlertTriangle,
  Package,
  Building2,
  DollarSign,
  Eye
} from 'lucide-react'

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
}

interface Supplier {
  id?: string
  name: string
  contactEmail?: string
  contactPhone?: string
  address?: string
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
}

interface AISettings {
  confidenceThreshold: number
  autoApproveHigh: boolean
  strictMatching: boolean
  learningMode: boolean
}

interface MerchantReviewInterfaceProps {
  purchaseOrder: PurchaseOrder
  aiSettings?: AISettings
  onApprove: (poId: string, editedData?: any) => Promise<void>
  onDeny: (poId: string, reason: string) => Promise<void>
  onEdit?: (poId: string, editedData: any) => Promise<void>
  onUpdateSettings?: (settings: AISettings) => Promise<void>
  onViewDetails?: (poId: string) => void
  isLoading?: boolean
}

export default function MerchantReviewInterface({
  purchaseOrder,
  aiSettings,
  onApprove,
  onDeny,
  onViewDetails,
  isLoading = false
}: MerchantReviewInterfaceProps) {
  const [showDenyDialog, setShowDenyDialog] = useState(false)
  const [denyReason, setDenyReason] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const handleApprove = async () => {
    setIsProcessing(true)
    try {
      await onApprove(purchaseOrder.id)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDeny = async () => {
    if (!denyReason.trim()) return
    
    setIsProcessing(true)
    try {
      await onDeny(purchaseOrder.id, denyReason)
      setShowDenyDialog(false)
      setDenyReason('')
    } finally {
      setIsProcessing(false)
    }
  }

  const getConfidenceColor = (confidence: number) => {
    // Convert 0-1 to 0-100 for comparison
    const confidencePercent = confidence * 100
    if (confidencePercent >= 90) return 'bg-green-100 text-green-800'
    if (confidencePercent >= 75) return 'bg-blue-100 text-blue-800'
    if (confidencePercent >= 60) return 'bg-yellow-100 text-yellow-800'
    return 'bg-red-100 text-red-800'
  }

  const getConfidenceBadgeColor = (confidence: number) => {
    // Convert 0-1 to 0-100 for comparison
    const confidencePercent = confidence * 100
    if (confidencePercent >= 90) return 'default'
    if (confidencePercent >= 75) return 'secondary'
    return 'destructive'
  }

  const lowConfidenceItems = purchaseOrder.lineItems.filter(item => (item.confidence * 100) < 75)
  const hasIssues = lowConfidenceItems.length > 0 || (purchaseOrder.confidence * 100) < 80

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Card - PO Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl font-bold flex items-center gap-2">
                <FileText className="h-6 w-6" />
                Purchase Order Review
              </CardTitle>
              <CardDescription className="mt-2">
                Review AI-processed purchase order before syncing to Shopify
              </CardDescription>
            </div>
            <Badge className={getConfidenceColor(purchaseOrder.confidence)} variant="outline">
              {Math.round(purchaseOrder.confidence * 100)}% Confidence
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {/* Summary Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">PO Number</p>
                <p className="text-lg font-bold">{purchaseOrder.number}</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-50 rounded-lg">
                <Building2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Supplier</p>
                <p className="text-lg font-bold truncate">{purchaseOrder.supplierName}</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-50 rounded-lg">
                <Package className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Line Items</p>
                <p className="text-lg font-bold">{purchaseOrder.lineItems.length}</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-50 rounded-lg">
                <DollarSign className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Total Amount</p>
                <p className="text-lg font-bold">
                  ${purchaseOrder.totalAmount.toFixed(2)} {purchaseOrder.currency}
                </p>
              </div>
            </div>
          </div>

          {/* Alerts for issues */}
          {hasIssues && (
            <Alert className="border-yellow-200 bg-yellow-50">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                {lowConfidenceItems.length > 0 && (
                  <span>
                    {lowConfidenceItems.length} line item{lowConfidenceItems.length > 1 ? 's have' : ' has'} low confidence. 
                  </span>
                )}
                {purchaseOrder.confidence < 80 && lowConfidenceItems.length > 0 && <span> </span>}
                {purchaseOrder.confidence < 80 && (
                  <span>Overall PO confidence is below recommended threshold.</span>
                )}
                {' '}Please review carefully before approving.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Line Items Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Line Items
          </CardTitle>
          <CardDescription>
            Review extracted product details and quantities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Unit Cost</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-center">Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseOrder.lineItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-sm">
                      {item.sku}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{item.productName}</div>
                        {item.description && (
                          <div className="text-sm text-gray-500 truncate max-w-md">
                            {item.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">
                      ${item.unitCost.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      ${item.totalCost.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge 
                        variant={getConfidenceBadgeColor(item.confidence)}
                        className="text-xs"
                      >
                        {Math.round(item.confidence * 100)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              {onViewDetails && (
                <Button
                  variant="outline"
                  onClick={() => onViewDetails(purchaseOrder.id)}
                  disabled={isLoading || isProcessing}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Full Details
                </Button>
              )}
              
              {purchaseOrder.fileName && (
                <div className="text-sm text-gray-600">
                  Source: <span className="font-medium">{purchaseOrder.fileName}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Deny Dialog */}
              <Dialog open={showDenyDialog} onOpenChange={setShowDenyDialog}>
                <DialogTrigger asChild>
                  <Button 
                    variant="destructive" 
                    disabled={isLoading || isProcessing}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Deny
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Deny Purchase Order</DialogTitle>
                    <DialogDescription>
                      Please provide a reason for denying PO #{purchaseOrder.number}. 
                      This will prevent it from being synced to Shopify.
                    </DialogDescription>
                  </DialogHeader>
                  <Textarea
                    value={denyReason}
                    onChange={(e) => setDenyReason(e.target.value)}
                    placeholder="Enter reason for denial (e.g., 'Incorrect supplier', 'Duplicate order', 'Data quality issues')..."
                    className="min-h-[120px]"
                  />
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowDenyDialog(false)
                        setDenyReason('')
                      }}
                      disabled={isProcessing}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleDeny}
                      disabled={!denyReason.trim() || isProcessing}
                    >
                      {isProcessing ? 'Denying...' : 'Confirm Denial'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Approve Button */}
              <Button
                onClick={handleApprove}
                disabled={isLoading || isProcessing}
                className="bg-green-600 hover:bg-green-700"
                size="lg"
              >
                <CheckCircle className="h-5 w-5 mr-2" />
                {isProcessing ? 'Approving...' : 'Approve'}
              </Button>
            </div>
          </div>

          {/* Help Text */}
          <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800">
              <strong>Approval Process:</strong> Approving this PO will move it from "Review" status to "Completed" status. 
              Shopify sync can be performed separately from the Purchase Orders list.
            </p>
          </div>

          {/* Processing Notes */}
          {purchaseOrder.processingNotes && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-sm font-medium text-gray-700 mb-1">AI Processing Notes:</p>
              <p className="text-sm text-gray-600">{purchaseOrder.processingNotes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
