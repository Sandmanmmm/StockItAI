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
import { authenticatedRequest } from '@/lib/shopifyApiService'

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
  enhancedData?: {
    financialBreakdown?: {
      subtotal: number
      tax: number
      shipping: number
      grandTotal: number
    }
    qualityMetrics?: {
      overall: string
      imageClarity: string
      textLegibility: string
      documentCompleteness: string
      overallScore: number
      completenessScore: number
      issueCount: number
      hasIssues: boolean
    }
    fieldConfidences?: {
      supplier: number
      poNumber: number
      dates: number
      totals: number
      lineItems: number
      notes: number
    }
    processingInfo?: {
      aiModel: string
      workflowId: string
      processedAt: string
      textExtractionLength: number
      pageCount: number
    }
    expectedDeliveryDate?: string | null
    paymentStatus?: 'paid' | 'pending' | 'overdue'
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
  const [documentPreviewLoading, setDocumentPreviewLoading] = useState(false)

  // Helper function to get document URL for preview
  const getDocumentUrl = () => {
    if (!purchaseOrder?.originalFile.url) return null
    return purchaseOrder.originalFile.url
  }

  // Helper function to download document
  const handleDownload = async () => {
    if (!purchaseOrder?.originalFile.url) {
      notificationService.showError(
        'Download Failed',
        'Document not available for download.',
        { category: 'user', priority: 'medium' }
      )
      return
    }

    try {
      const downloadUrl = purchaseOrder.originalFile.url.replace('/api/files/po/', '/api/files/po/') + '/download'
      
      // Create a temporary link to trigger download
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = purchaseOrder.originalFile.name
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      notificationService.showSuccess(
        'Download Started',
        `${purchaseOrder.originalFile.name} is being downloaded.`,
        { category: 'user', priority: 'low' }
      )
    } catch (error) {
      console.error('Error downloading file:', error)
      notificationService.showError(
        'Download Failed',
        'Could not download the document. Please try again.',
        { category: 'system', priority: 'medium' }
      )
    }
  }

  // Fetch real PO data from API
  useEffect(() => {
    const fetchPurchaseOrder = async () => {
      try {
        const result = await authenticatedRequest<any>('/api/purchase-orders')
        
        if (result.success && result.data?.orders) {
          // Find the specific PO by ID or number
          const foundPO = result.data.orders.find((po: any) => 
            po.id === orderId || po.number === orderId
          )
          
          if (foundPO && foundPO.rawData) {
            // Handle both data structures: nested extractedData or direct rawData
            const extractedData = foundPO.rawData.extractedData || foundPO.rawData
            const lineItems = extractedData.lineItems || []
            
            // Debug: Log the actual data structure
            console.log('🔍 Purchase Order Debug Data:')
            console.log('foundPO:', foundPO)
            console.log('rawData:', foundPO.rawData)
            console.log('extractedData:', extractedData)
            console.log('extractedData.totals:', extractedData.totals)
            console.log('extractedData.lineItems sample:', lineItems.slice(0, 2))
            console.log('foundPO.totalAmount:', foundPO.totalAmount)
            console.log('foundPO.currency:', foundPO.currency)
            
            // Transform API data to component format
            const transformedPO: PurchaseOrder = {
              id: foundPO.id,
              number: foundPO.number,
              supplier: {
                name: extractedData.supplier?.name || foundPO.supplierName || 'Unknown Supplier',
                contact: extractedData.supplier?.contact?.name || 'N/A',
                email: extractedData.supplier?.contact?.email || extractedData.supplier?.email || 'N/A',
                phone: extractedData.supplier?.contact?.phone || extractedData.supplier?.phone || 'N/A',
                address: extractedData.supplier?.address || 'N/A'
              },
              date: extractedData.dates?.orderDate || foundPO.orderDate || new Date().toISOString().split('T')[0],
              status: foundPO.status as 'pending' | 'approved' | 'processing' | 'completed' | 'rejected',
              confidence: Math.round((foundPO.confidence || 0) * 100),
              totalAmount: extractedData.totals?.amount || 
                          extractedData.totals?.grandTotal || 
                          extractedData.totals?.total || 
                          extractedData.totals?.totalAmount || 
                          extractedData.total?.amount ||
                          foundPO.totalAmount || 0,
              currency: foundPO.currency || 'USD',
              items: lineItems.map((item: any, index: number) => ({
                id: (index + 1).toString(),
                sku: item.productCode || item.sku || item.itemCode || `ITEM-${index + 1}`,
                name: item.description || item.name || item.product || item.title || 'Unknown Item',
                quantity: parseInt(item.quantity) || parseInt(item.qty) || parseInt(item.amount) || 1,
                unitPrice: parseFloat(item.unitPrice) || parseFloat(item.price) || parseFloat(item.unit_price) || 0,
                totalPrice: parseFloat(item.total) || parseFloat(item.totalPrice) || parseFloat(item.total_price) || 
                           (parseFloat(item.unitPrice || item.price || 0) * parseInt(item.quantity || item.qty || 1)) || 0,
                confidence: Math.round((foundPO.rawData?.fieldConfidences?.lineItems || 0.9) * 100)
              })),
              notes: extractedData.notes || foundPO.processingNotes || 'No additional notes',
              aiProcessingNotes: foundPO.rawData?.qualityAssessment?.overall === 'high' 
                ? `High confidence extraction (${Math.round((foundPO.confidence || 0) * 100)}%). Document processed successfully with ${foundPO.rawData?.qualityIndicators?.documentCompleteness || 'good'} completeness.`
                : `AI processing completed with ${Math.round((foundPO.confidence || 0) * 100)}% confidence. ${foundPO.rawData?.issues?.join('. ') || ''}`,
              originalFile: {
                name: foundPO.fileName || 'document.pdf',
                type: foundPO.fileName?.toLowerCase().includes('.pdf') ? 'pdf' : 'image' as 'pdf' | 'image' | 'excel',
                size: foundPO.fileSize || 0,
                url: `/api/files/po/${foundPO.id}`
              },
              timestamps: {
                uploaded: foundPO.createdAt || new Date().toISOString(),
                processed: foundPO.rawData?.metadata?.processedAt || foundPO.updatedAt || new Date().toISOString(),
                lastModified: foundPO.updatedAt || new Date().toISOString()
              },
              processingFlags: {
                requiresReview: foundPO.status === 'review_needed' || (foundPO.confidence || 0) < 0.85,
                hasDiscrepancies: (foundPO.rawData?.issues?.length || 0) > 0,
                missingInformation: foundPO.status === 'pending' || !extractedData.supplier?.name
              },
              // Enhanced data fields
              enhancedData: {
                financialBreakdown: extractedData.totals ? {
                  subtotal: parseFloat(extractedData.totals.subtotal) || parseFloat(extractedData.totals.sub_total) || 0,
                  tax: parseFloat(extractedData.totals.tax) || parseFloat(extractedData.totals.taxAmount) || 0,
                  shipping: parseFloat(extractedData.totals.shipping) || parseFloat(extractedData.totals.shippingCost) || 0,
                  grandTotal: parseFloat(extractedData.totals.grandTotal) || parseFloat(extractedData.totals.total) || parseFloat(extractedData.totals.totalAmount) || 0
                } : undefined,
                qualityMetrics: foundPO.rawData?.qualityAssessment ? {
                  overall: foundPO.rawData.qualityAssessment.overall || 'unknown',
                  imageClarity: foundPO.rawData.qualityIndicators?.imageClarity || 'unknown',
                  textLegibility: foundPO.rawData.qualityIndicators?.textLegibility || 'unknown',
                  documentCompleteness: foundPO.rawData.qualityIndicators?.documentCompleteness || 'unknown',
                  overallScore: Math.round((foundPO.rawData.qualityAssessment.overallScore || 0) * 100),
                  completenessScore: Math.round((foundPO.rawData.completenessScore || 0) * 100),
                  issueCount: foundPO.rawData.qualityAssessment.issueCount || 0,
                  hasIssues: foundPO.rawData.qualityAssessment.hasIssues || false
                } : undefined,
                fieldConfidences: foundPO.rawData?.fieldConfidences ? {
                  supplier: Math.round((foundPO.rawData.fieldConfidences.supplier || 0) * 100),
                  poNumber: Math.round((foundPO.rawData.fieldConfidences.poNumber || 0) * 100),
                  dates: Math.round((foundPO.rawData.fieldConfidences.dates || 0) * 100),
                  totals: Math.round((foundPO.rawData.fieldConfidences.totals || 0) * 100),
                  lineItems: Math.round((foundPO.rawData.fieldConfidences.lineItems || 0) * 100),
                  notes: Math.round((foundPO.rawData.fieldConfidences.notes || 0) * 100)
                } : undefined,
                processingInfo: {
                  aiModel: foundPO.rawData?.metadata?.aiModel || 'unknown',
                  workflowId: foundPO.rawData?.metadata?.workflowId || 'unknown',
                  processedAt: foundPO.rawData?.metadata?.processedAt || foundPO.updatedAt,
                  textExtractionLength: foundPO.rawData?.extractedTextLength || 0,
                  pageCount: foundPO.rawData?.pageCount || 1
                },
                expectedDeliveryDate: extractedData.dates?.expectedDeliveryDate || null,
                paymentStatus: extractedData.notes?.includes('Paid') ? 'paid' : 'pending'
              }
            }
            
            setPurchaseOrder(transformedPO)
          } else {
            // Fallback to basic PO data without detailed extraction
            const basicPO: PurchaseOrder = {
              id: foundPO.id,
              number: foundPO.number,
              supplier: {
                name: foundPO.supplierName || 'Unknown Supplier',
                contact: 'N/A',
                email: 'N/A',
                phone: 'N/A',
                address: 'N/A'
              },
              date: foundPO.orderDate || new Date().toISOString().split('T')[0],
              status: foundPO.status as 'pending' | 'approved' | 'processing' | 'completed' | 'rejected',
              confidence: Math.round((foundPO.confidence || 0) * 100),
              totalAmount: foundPO.totalAmount || 0,
              currency: foundPO.currency || 'USD',
              items: [],
              notes: foundPO.processingNotes || 'Processing in progress...',
              aiProcessingNotes: foundPO.rawData?.error || 'AI processing data not available',
              originalFile: {
                name: foundPO.fileName || 'document.pdf',
                type: foundPO.fileName?.toLowerCase().includes('.pdf') ? 'pdf' : 'image' as 'pdf' | 'image' | 'excel',
                size: foundPO.fileSize || 0,
                url: `/api/files/po/${foundPO.id}`
              },
              timestamps: {
                uploaded: foundPO.createdAt || new Date().toISOString(),
                processed: foundPO.updatedAt || new Date().toISOString(),
                lastModified: foundPO.updatedAt || new Date().toISOString()
              },
              processingFlags: {
                requiresReview: true,
                hasDiscrepancies: true,
                missingInformation: true
              },
              // Empty enhanced data for basic POs
              enhancedData: undefined
            }
            
            setPurchaseOrder(basicPO)
          }
        }
      } catch (error) {
        console.error('Error fetching purchase order:', error)
        notificationService.showError(
          'Failed to Load Purchase Order',
          'Could not retrieve purchase order details. Please try again.',
          { category: 'system', priority: 'high' }
        )
      }
    }

    fetchPurchaseOrder()
  }, [orderId])

  const handleApprove = async () => {
    if (!purchaseOrder) return
    
    setProcessing(true)
    try {
      const result = await authenticatedRequest<any>(`/api/purchase-orders/${purchaseOrder.id}/approve`, {
        method: 'POST'
      })
      
      if (result.success) {
        setPurchaseOrder({ ...purchaseOrder, status: 'approved' })
        notificationService.showSuccess(
          'Purchase Order Approved',
          `PO ${purchaseOrder.number} has been approved and will be synced to Shopify`,
          { category: 'po', priority: 'high' }
        )
      } else {
        throw new Error('Failed to approve purchase order')
      }
    } catch (error) {
      console.error('Error approving PO:', error)
      notificationService.showError(
        'Approval Failed',
        'Could not approve the purchase order. Please try again.',
        { category: 'system', priority: 'high' }
      )
    }
    setShowApprovalDialog(false)
    setProcessing(false)
  }

  const handleReject = async () => {
    if (!purchaseOrder) return
    
    setProcessing(true)
    try {
      const result = await authenticatedRequest<any>(`/api/purchase-orders/${purchaseOrder.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason }),
        headers: {
          'Content-Type': 'application/json'
        }
      })
      
      if (result.success) {
        setPurchaseOrder({ ...purchaseOrder, status: 'rejected' })
        notificationService.showWarning(
          'Purchase Order Rejected',
          `PO ${purchaseOrder.number} has been rejected: ${rejectReason}`,
          { category: 'po', priority: 'medium' }
        )
      } else {
        throw new Error('Failed to reject purchase order')
      }
    } catch (error) {
      console.error('Error rejecting PO:', error)
      notificationService.showError(
        'Rejection Failed',
        'Could not reject the purchase order. Please try again.',
        { category: 'system', priority: 'high' }
      )
    }
    setShowRejectDialog(false)
    setProcessing(false)
    setRejectReason('')
  }

  const handleReprocess = async () => {
    if (!purchaseOrder) return
    
    setProcessing(true)
    notificationService.showInfo(
      'Reprocessing Purchase Order',
      'AI is re-analyzing the document with updated algorithms',
      { category: 'ai', priority: 'medium' }
    )
    
    try {
      const result = await authenticatedRequest<any>(`/api/purchase-orders/${purchaseOrder.id}/reprocess`, {
        method: 'POST'
      })
      
      if (result.success) {
        // Reload the PO data after reprocessing
        const updatedResult = await authenticatedRequest<any>('/api/purchase-orders')
        
        if (updatedResult.success && updatedResult.data?.orders) {
          const updatedPO = updatedResult.data.orders.find((po: any) => po.id === purchaseOrder.id)
          if (updatedPO) {
            // Refresh the component data
            window.location.reload() // Simple refresh for now
          }
        }
        
        notificationService.showSuccess(
          'Reprocessing Complete',
          'Purchase order has been reanalyzed with improved accuracy',
          { category: 'ai', priority: 'medium' }
        )
      } else {
        throw new Error('Failed to reprocess purchase order')
      }
    } catch (error) {
      console.error('Error reprocessing PO:', error)
      notificationService.showError(
        'Reprocessing Failed',
        'Could not reprocess the purchase order. Please try again.',
        { category: 'system', priority: 'high' }
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
              <div className="bg-muted/30 border-2 border-dashed border-muted rounded-lg min-h-[600px] flex flex-col">
                {/* Document Header */}
                <div className="flex items-center justify-between p-4 border-b border-muted">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <h3 className="font-medium">{purchaseOrder.originalFile.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {(purchaseOrder.originalFile.size / 1024 / 1024).toFixed(1)} MB • {purchaseOrder.originalFile.type.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        const url = getDocumentUrl()
                        if (url) {
                          window.open(url, '_blank')
                        }
                      }}
                      disabled={!getDocumentUrl()}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      View Original
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleDownload}
                      disabled={!purchaseOrder.originalFile.url}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                  </div>
                </div>

                {/* Document Preview Content */}
                <div className="flex-1 p-4">
                  {getDocumentUrl() ? (
                    <div className="w-full h-full min-h-[500px]">
                      {purchaseOrder.originalFile.type === 'pdf' ? (
                        // PDF Preview using iframe
                        <iframe
                          src={`${getDocumentUrl()}#toolbar=1&navpanes=0&scrollbar=1`}
                          className="w-full h-full min-h-[500px] rounded border"
                          title={`PDF Preview: ${purchaseOrder.originalFile.name}`}
                          onLoad={() => setDocumentPreviewLoading(false)}
                          onError={(e) => {
                            console.error('PDF preview error:', e)
                            setDocumentPreviewLoading(false)
                          }}
                        />
                      ) : (
                        // Image Preview
                        <div className="flex items-center justify-center h-full">
                          <img
                            src={getDocumentUrl() || ''}
                            alt={`Document Preview: ${purchaseOrder.originalFile.name}`}
                            className="max-w-full max-h-full rounded border shadow-sm"
                            onLoad={() => setDocumentPreviewLoading(false)}
                            onError={(e) => {
                              console.error('Image preview error:', e)
                              setDocumentPreviewLoading(false)
                            }}
                          />
                        </div>
                      )}
                      
                      {documentPreviewLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                            Loading document preview...
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    // Fallback when document is not available
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <FileText className="w-16 h-16 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium mb-2">Document Not Available</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        The original document could not be loaded for preview.
                      </p>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={handleDownload}
                        disabled={!purchaseOrder.originalFile.url}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Try Download
                      </Button>
                    </div>
                  )}
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

      {/* Enhanced Information Cards */}
      {purchaseOrder.enhancedData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Financial Breakdown */}
          {purchaseOrder.enhancedData.financialBreakdown && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Financial Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>${purchaseOrder.enhancedData.financialBreakdown.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span>${purchaseOrder.enhancedData.financialBreakdown.tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  <span>${purchaseOrder.enhancedData.financialBreakdown.shipping.toFixed(2)}</span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between font-medium">
                  <span>Total</span>
                  <span>${purchaseOrder.enhancedData.financialBreakdown.grandTotal.toFixed(2)}</span>
                </div>
                {purchaseOrder.enhancedData.paymentStatus && (
                  <div className="mt-2">
                    <Badge variant={purchaseOrder.enhancedData.paymentStatus === 'paid' ? 'default' : 'secondary'}>
                      {purchaseOrder.enhancedData.paymentStatus === 'paid' ? 'PAID' : 'PENDING'}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Quality Metrics */}
          {purchaseOrder.enhancedData.qualityMetrics && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendUp className="w-4 h-4" />
                  Quality Assessment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Overall Quality</span>
                    <Badge variant={purchaseOrder.enhancedData.qualityMetrics.overall === 'high' ? 'default' : 'secondary'}>
                      {purchaseOrder.enhancedData.qualityMetrics.overall.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Completeness</span>
                    <span>{purchaseOrder.enhancedData.qualityMetrics.completenessScore}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Overall Score</span>
                    <span>{purchaseOrder.enhancedData.qualityMetrics.overallScore}%</span>
                  </div>
                  {purchaseOrder.enhancedData.qualityMetrics.hasIssues && (
                    <div className="flex items-center gap-2 text-orange-600">
                      <AlertTriangle className="w-3 h-3" />
                      <span className="text-xs">{purchaseOrder.enhancedData.qualityMetrics.issueCount} issues detected</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Field Confidence Scores */}
          {purchaseOrder.enhancedData.fieldConfidences && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Field Confidence
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Supplier</span>
                  <span className="font-medium">{purchaseOrder.enhancedData.fieldConfidences.supplier}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">PO Number</span>
                  <span className="font-medium">{purchaseOrder.enhancedData.fieldConfidences.poNumber}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Totals</span>
                  <span className="font-medium">{purchaseOrder.enhancedData.fieldConfidences.totals}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Line Items</span>
                  <span className="font-medium">{purchaseOrder.enhancedData.fieldConfidences.lineItems}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dates</span>
                  <span className="font-medium">{purchaseOrder.enhancedData.fieldConfidences.dates}%</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Processing Information */}
          {purchaseOrder.enhancedData.processingInfo && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Robot className="w-4 h-4" />
                  AI Processing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Model</span>
                  <span className="font-mono text-xs">{purchaseOrder.enhancedData.processingInfo.aiModel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pages</span>
                  <span>{purchaseOrder.enhancedData.processingInfo.pageCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Text Length</span>
                  <span>{purchaseOrder.enhancedData.processingInfo.textExtractionLength.toLocaleString()} chars</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-muted-foreground text-xs">Workflow ID</span>
                  <span className="font-mono text-xs break-all">{purchaseOrder.enhancedData.processingInfo.workflowId}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

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
