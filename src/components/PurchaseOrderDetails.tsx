import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { 
  ArrowLeft,
  Download,
  PencilSimple as Edit,
  Check,
  X,
  Eye,
  FileText,
  Calendar,
  CurrencyDollar as DollarSign,
  Package,
  Building,
  User,
  Phone,
  EnvelopeSimple as Mail,
  MapPin,
  Clock,
  Warning as AlertTriangle,
  CheckCircle,
  XCircle,
  Robot,
  ArrowsClockwise as Refresh,
  Share,
  Archive,
  Trash,
  ChatCircle as MessageCircle,
  Tag,
  TrendUp,
  ShoppingCart
} from '@phosphor-icons/react'
import { useKV } from '../hooks/useKV'
import { notificationService } from '@/lib/notificationService'

interface PurchaseOrder {
  id: string
  number: string
  supplier: {
    name: string
    contact: string
    email: string
    phone: string
    address: string
  }
  date: string
  status: 'pending' | 'approved' | 'processing' | 'completed' | 'rejected'
  confidence: number
  totalAmount: number
  currency: string
  items: Array<{
    id: string
    sku: string
    name: string
    quantity: number
    unitPrice: number
    totalPrice: number
    confidence: number
  }>
  notes?: string
  aiProcessingNotes?: string
  originalFile: {
    name: string
    type: 'pdf' | 'image' | 'excel'
    size: number
    url?: string
  }
  timestamps: {
    uploaded: string
    processed: string
    lastModified: string
  }
  processingFlags?: {
    requiresReview: boolean
    hasDiscrepancies: boolean
    missingInformation: boolean
  }
}

interface PurchaseOrderDetailsProps {
  orderId: string
  onBack: () => void
}

export function PurchaseOrderDetails({ orderId, onBack }: PurchaseOrderDetailsProps) {
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null>(null)
  const [showApprovalDialog, setShowApprovalDialog] = useState(false)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [processing, setProcessing] = useState(false)

  // Mock data - in real app, this would fetch from API
  useEffect(() => {
    // Simulate loading purchase order data
    const mockPO: PurchaseOrder = {
      id: orderId,
      number: 'PO-2024-001',
      supplier: {
        name: 'TechnoSupply Co.',
        contact: 'Sarah Johnson',
        email: 'sarah@technosupply.com',
        phone: '+1 (555) 123-4567',
        address: '123 Industrial Blvd, Tech City, TC 12345'
      },
      date: '2024-01-15',
      status: 'processing',
      confidence: 95,
      totalAmount: 24567.89,
      currency: 'USD',
      items: [
        {
          id: '1',
          sku: 'LAPTOP-001',
          name: 'MacBook Pro 16" M3 Max',
          quantity: 5,
          unitPrice: 3999.00,
          totalPrice: 19995.00,
          confidence: 98
        },
        {
          id: '2',
          sku: 'MOUSE-001',
          name: 'Magic Mouse 2',
          quantity: 5,
          unitPrice: 79.00,
          totalPrice: 395.00,
          confidence: 95
        },
        {
          id: '3',
          sku: 'KEYBOARD-001',
          name: 'Magic Keyboard with Touch ID',
          quantity: 5,
          unitPrice: 179.00,
          totalPrice: 895.00,
          confidence: 92
        },
        {
          id: '4',
          sku: 'CABLE-USB-C',
          name: 'USB-C Charging Cable 2m',
          quantity: 10,
          unitPrice: 29.99,
          totalPrice: 299.90,
          confidence: 89
        },
        {
          id: '5',
          sku: 'ADAPTER-001',
          name: 'USB-C to Lightning Adapter',
          quantity: 8,
          unitPrice: 19.99,
          totalPrice: 159.92,
          confidence: 91
        }
      ],
      notes: 'Urgent order for Q1 equipment refresh. Delivery required by end of month.',
      aiProcessingNotes: 'High confidence extraction. Minor formatting inconsistencies in item descriptions corrected automatically.',
      originalFile: {
        name: 'TechnoSupply_PO_001_2024.pdf',
        type: 'pdf',
        size: 2847392,
        url: '/mock-po-preview.pdf'
      },
      timestamps: {
        uploaded: '2024-01-15T08:30:00Z',
        processed: '2024-01-15T08:31:45Z',
        lastModified: '2024-01-15T09:15:30Z'
      },
      processingFlags: {
        requiresReview: false,
        hasDiscrepancies: false,
        missingInformation: false
      }
    }
    
    setTimeout(() => setPurchaseOrder(mockPO), 300)
  }, [orderId])

  const handleApprove = async () => {
    setProcessing(true)
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    if (purchaseOrder) {
      setPurchaseOrder({ ...purchaseOrder, status: 'approved' })
      notificationService.showSuccess(
        'Purchase Order Approved',
        `PO ${purchaseOrder.number} has been approved and will be synced to Shopify`,
        { category: 'po', priority: 'high' }
      )
    }
    setShowApprovalDialog(false)
    setProcessing(false)
  }

  const handleReject = async () => {
    setProcessing(true)
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    if (purchaseOrder) {
      setPurchaseOrder({ ...purchaseOrder, status: 'rejected' })
      notificationService.showWarning(
        'Purchase Order Rejected',
        `PO ${purchaseOrder.number} has been rejected: ${rejectReason}`,
        { category: 'po', priority: 'medium' }
      )
    }
    setShowRejectDialog(false)
    setProcessing(false)
    setRejectReason('')
  }

  const handleReprocess = async () => {
    setProcessing(true)
    notificationService.showInfo(
      'Reprocessing Purchase Order',
      'AI is re-analyzing the document with updated algorithms',
      { category: 'ai', priority: 'medium' }
    )
    
    // Simulate reprocessing
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    if (purchaseOrder) {
      setPurchaseOrder({ 
        ...purchaseOrder, 
        confidence: Math.min(100, purchaseOrder.confidence + Math.random() * 5),
        timestamps: {
          ...purchaseOrder.timestamps,
          processed: new Date().toISOString(),
          lastModified: new Date().toISOString()
        }
      })
      notificationService.showSuccess(
        'Reprocessing Complete',
        'Purchase order has been reanalyzed with improved accuracy',
        { category: 'ai', priority: 'medium' }
      )
    }
    setProcessing(false)
  }

  if (!purchaseOrder) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading purchase order details...</p>
        </div>
      </div>
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-success/10 text-success border-success/20'
      case 'rejected': return 'bg-destructive/10 text-destructive border-destructive/20'
      case 'processing': return 'bg-accent/10 text-accent border-accent/20'
      case 'pending': return 'bg-warning/10 text-warning border-warning/20'
      default: return 'bg-muted/10 text-muted-foreground border-muted/20'
    }
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 95) return 'text-success'
    if (confidence >= 85) return 'text-accent'
    if (confidence >= 75) return 'text-warning'
    return 'text-destructive'
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-9 w-9 p-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{purchaseOrder.number}</h1>
            <p className="text-muted-foreground">{purchaseOrder.supplier.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Badge className={getStatusColor(purchaseOrder.status)}>
            {purchaseOrder.status.toUpperCase()}
          </Badge>
          <div className="text-right">
            <div className="text-sm font-medium">
              {purchaseOrder.currency} {purchaseOrder.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className={`text-xs ${getConfidenceColor(purchaseOrder.confidence)}`}>
              {purchaseOrder.confidence}% confidence
            </div>
          </div>
        </div>
      </div>

      {/* Processing Flags */}
      {(purchaseOrder.processingFlags?.requiresReview || 
        purchaseOrder.processingFlags?.hasDiscrepancies || 
        purchaseOrder.processingFlags?.missingInformation) && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center gap-2">
            <span>This purchase order requires attention:</span>
            {purchaseOrder.processingFlags.requiresReview && <Badge variant="outline">Manual Review</Badge>}
            {purchaseOrder.processingFlags.hasDiscrepancies && <Badge variant="outline">Discrepancies</Badge>}
            {purchaseOrder.processingFlags.missingInformation && <Badge variant="outline">Missing Info</Badge>}
          </AlertDescription>
        </Alert>
      )}

      {/* Main Layout: 3 Column Layout */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Sidebar - Actions */}
        <div className="col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {purchaseOrder.status === 'processing' && (
                <>
                  <Button 
                    className="w-full justify-start" 
                    size="sm"
                    onClick={() => setShowApprovalDialog(true)}
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Approve
                  </Button>
                  <Button 
                    variant="destructive" 
                    className="w-full justify-start" 
                    size="sm"
                    onClick={() => setShowRejectDialog(true)}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Reject
                  </Button>
                  <Separator />
                </>
              )}
              
              <Button variant="outline" className="w-full justify-start" size="sm">
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
              
              <Button 
                variant="outline" 
                className="w-full justify-start" 
                size="sm"
                onClick={handleReprocess}
                disabled={processing}
              >
                <Robot className="w-4 h-4 mr-2" />
                {processing ? 'Processing...' : 'Reprocess AI'}
              </Button>
              
              <Button variant="outline" className="w-full justify-start" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              
              <Separator />
              
              <Button variant="outline" className="w-full justify-start" size="sm">
                <Share className="w-4 h-4 mr-2" />
                Share
              </Button>
              
              <Button variant="outline" className="w-full justify-start" size="sm">
                <Archive className="w-4 h-4 mr-2" />
                Archive
              </Button>
              
              <Button variant="outline" className="w-full justify-start text-destructive hover:bg-destructive/10" size="sm">
                <Trash className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </CardContent>
          </Card>

          {/* Processing Status */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">AI Processing</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Confidence</span>
                    <span className={getConfidenceColor(purchaseOrder.confidence)}>
                      {purchaseOrder.confidence}%
                    </span>
                  </div>
                  <Progress 
                    value={purchaseOrder.confidence} 
                    className="h-2"
                  />
                </div>
                
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3 h-3 text-success" />
                    Text extraction
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3 h-3 text-success" />
                    Data validation
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3 h-3 text-success" />
                    Price calculations
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Center - Document Preview */}
        <div className="col-span-7">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Document Preview
                <Badge variant="outline" className="ml-auto">
                  {purchaseOrder.originalFile.type.toUpperCase()}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Document preview area */}
              <div className="bg-muted/30 border-2 border-dashed border-muted rounded-lg p-8 text-center min-h-[600px] flex flex-col items-center justify-center">
                <FileText className="w-16 h-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">{purchaseOrder.originalFile.name}</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {(purchaseOrder.originalFile.size / 1024 / 1024).toFixed(1)} MB • {purchaseOrder.originalFile.type.toUpperCase()}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    <Eye className="w-4 h-4 mr-2" />
                    View Original
                  </Button>
                  <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar - Information */}
        <div className="col-span-3 space-y-4">
          {/* Supplier Information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Building className="w-4 h-4" />
                Supplier Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="font-medium">{purchaseOrder.supplier.name}</div>
                <div className="text-muted-foreground">{purchaseOrder.supplier.contact}</div>
              </div>
              
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="w-3 h-3" />
                  {purchaseOrder.supplier.email}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="w-3 h-3" />
                  {purchaseOrder.supplier.phone}
                </div>
                <div className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span className="text-xs leading-4">{purchaseOrder.supplier.address}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Order Information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="w-4 h-4" />
                Order Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order Date</span>
                <span>{new Date(purchaseOrder.date).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items</span>
                <span>{purchaseOrder.items.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Quantity</span>
                <span>{purchaseOrder.items.reduce((sum, item) => sum + item.quantity, 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Currency</span>
                <span>{purchaseOrder.currency}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-medium">
                <span>Total Amount</span>
                <span>{purchaseOrder.currency} {purchaseOrder.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-success" />
                  <span className="text-muted-foreground">Uploaded</span>
                  <span className="ml-auto text-xs">
                    {new Date(purchaseOrder.timestamps.uploaded).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-success" />
                  <span className="text-muted-foreground">Processed</span>
                  <span className="ml-auto text-xs">
                    {new Date(purchaseOrder.timestamps.processed).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-accent" />
                  <span className="text-muted-foreground">Last Modified</span>
                  <span className="ml-auto text-xs">
                    {new Date(purchaseOrder.timestamps.lastModified).toLocaleString()}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          {purchaseOrder.notes && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MessageCircle className="w-4 h-4" />
                  Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{purchaseOrder.notes}</p>
              </CardContent>
            </Card>
          )}

          {/* AI Processing Notes */}
          {purchaseOrder.aiProcessingNotes && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Robot className="w-4 h-4" />
                  AI Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{purchaseOrder.aiProcessingNotes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Items Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            Line Items ({purchaseOrder.items.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden border rounded-lg">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-4 py-3 text-sm font-medium">SKU</th>
                    <th className="px-4 py-3 text-sm font-medium">Product Name</th>
                    <th className="px-4 py-3 text-sm font-medium text-center">Qty</th>
                    <th className="px-4 py-3 text-sm font-medium text-right">Unit Price</th>
                    <th className="px-4 py-3 text-sm font-medium text-right">Total</th>
                    <th className="px-4 py-3 text-sm font-medium text-center">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {purchaseOrder.items.map((item, index) => (
                    <motion.tr
                      key={item.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 text-sm font-mono">{item.sku}</td>
                      <td className="px-4 py-3 text-sm">{item.name}</td>
                      <td className="px-4 py-3 text-sm text-center">{item.quantity}</td>
                      <td className="px-4 py-3 text-sm text-right">
                        {purchaseOrder.currency} {item.unitPrice.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium">
                        {purchaseOrder.currency} {item.totalPrice.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${getConfidenceColor(item.confidence)}`}
                        >
                          {item.confidence}%
                        </Badge>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Approval Dialog */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Approve Purchase Order</DialogTitle>
            <DialogDescription>
              Are you sure you want to approve PO {purchaseOrder.number}? This will sync the inventory to Shopify.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApprovalDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={processing}>
              {processing ? 'Approving...' : 'Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejection Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Purchase Order</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting PO {purchaseOrder.number}.
            </DialogDescription>
          </DialogHeader>
          <div className="my-4">
            <Textarea
              placeholder="Enter rejection reason..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleReject} 
              disabled={processing || !rejectReason.trim()}
            >
              {processing ? 'Rejecting...' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
