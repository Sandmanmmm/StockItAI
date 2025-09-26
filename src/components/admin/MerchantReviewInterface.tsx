/**
 * Merchant Review Interface
 * 
 * Allows merchants to review AI-processed purchase orders before Shopify sync
 * Features:
 * - View parsed PO with confidence scores
 * - Edit line items, supplier details
 * - Approve/deny/edit workflow
 * - Auto-approval settings
 */

import React, { useState, useEffect } from 'react'
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card'
import { 
  Button 
} from '@/components/ui/button'
import { 
  Input 
} from '@/components/ui/input'
import { 
  Label 
} from '@/components/ui/label'
import { 
  Badge 
} from '@/components/ui/badge'
import { 
  Textarea 
} from '@/components/ui/textarea'
import { 
  Switch 
} from '@/components/ui/switch'
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  CheckCircle, 
  XCircle, 
  Edit3, 
  Eye, 
  Settings, 
  AlertTriangle,
  TrendingUp,
  Package,
  Building2,
  DollarSign,
  Calendar,
  FileText,
  Brain,
  Zap,
  Clock,
  Target
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
  rawData?: {
    extractedData?: any
    fieldConfidences?: Record<string, number>
    qualityIndicators?: {
      imageClarity?: string
      textLegibility?: string
      documentCompleteness?: string
    }
    issues?: string[]
    suggestions?: string[]
  }
}

interface AISettings {
  confidenceThreshold: number
  autoApproveHigh: boolean
  strictMatching: boolean
  learningMode: boolean
}

interface MerchantReviewInterfaceProps {
  purchaseOrder: PurchaseOrder
  aiSettings: AISettings
  onApprove: (poId: string, editedData?: any) => Promise<void>
  onDeny: (poId: string, reason: string) => Promise<void>
  onEdit: (poId: string, editedData: any) => Promise<void>
  onUpdateSettings: (settings: AISettings) => Promise<void>
  isLoading?: boolean
}

export default function MerchantReviewInterface({
  purchaseOrder,
  aiSettings,
  onApprove,
  onDeny,
  onEdit,
  onUpdateSettings,
  isLoading = false
}: MerchantReviewInterfaceProps) {
  const defaultSettings: AISettings = {
    confidenceThreshold: 85,
    autoApproveHigh: false,
    strictMatching: true,
    learningMode: false
  }
  
  const [isEditing, setIsEditing] = useState(false)
  const [editedPO, setEditedPO] = useState<PurchaseOrder>(purchaseOrder)
  const [showSettings, setShowSettings] = useState(false)
  const [localSettings, setLocalSettings] = useState<AISettings>(aiSettings || defaultSettings)
  const [denyReason, setDenyReason] = useState('')
  const [showDenyDialog, setShowDenyDialog] = useState(false)

  useEffect(() => {
    setEditedPO(purchaseOrder)
  }, [purchaseOrder])

  useEffect(() => {
    if (aiSettings) {
      setLocalSettings(aiSettings)
    }
  }, [aiSettings])

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'bg-green-100 text-green-800'
    if (confidence >= 60) return 'bg-yellow-100 text-yellow-800'
    return 'bg-red-100 text-red-800'
  }

  const getQualityColor = (quality: string | undefined) => {
    switch (quality?.toLowerCase()) {
      case 'high': return 'bg-green-100 text-green-800'
      case 'medium': return 'bg-yellow-100 text-yellow-800'
      case 'low': return 'bg-red-100 text-red-800'
      case 'complete': return 'bg-green-100 text-green-800'
      case 'partial': return 'bg-yellow-100 text-yellow-800'
      case 'incomplete': return 'bg-red-100 text-red-800'
      case 'invalid_document_type': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getConfidenceIcon = (confidence: number) => {
    if (confidence >= 80) return <CheckCircle className="h-4 w-4 text-green-600" />
    if (confidence >= 60) return <AlertTriangle className="h-4 w-4 text-yellow-600" />
    return <XCircle className="h-4 w-4 text-red-600" />
  }

  const shouldAutoApprove = () => {
    if (!aiSettings) return false
    return aiSettings.autoApproveHigh && purchaseOrder.confidence >= aiSettings.confidenceThreshold
  }

  const handleLineItemEdit = (index: number, field: string, value: any) => {
    const updatedLineItems = [...editedPO.lineItems]
    updatedLineItems[index] = {
      ...updatedLineItems[index],
      [field]: value
    }
    
    // Recalculate total cost for line item
    if (field === 'quantity' || field === 'unitCost') {
      updatedLineItems[index].totalCost = updatedLineItems[index].quantity * updatedLineItems[index].unitCost
    }
    
    setEditedPO({
      ...editedPO,
      lineItems: updatedLineItems,
      totalAmount: updatedLineItems.reduce((sum, item) => sum + item.totalCost, 0)
    })
  }

  const handleSupplierEdit = (field: string, value: string) => {
    setEditedPO({
      ...editedPO,
      supplier: {
        ...editedPO.supplier!,
        [field]: value
      }
    })
  }

  const handleApprove = async () => {
    if (isEditing) {
      await onEdit(purchaseOrder.id, editedPO)
      setIsEditing(false)
    } else {
      await onApprove(purchaseOrder.id)
    }
  }

  const handleDeny = async () => {
    await onDeny(purchaseOrder.id, denyReason)
    setShowDenyDialog(false)
    setDenyReason('')
  }

  const handleSaveSettings = async () => {
    await onUpdateSettings(localSettings)
    setShowSettings(false)
  }

  return (
    <div className="space-y-6">
      {/* Header with PO Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div>
                <CardTitle className="text-2xl font-bold">
                  Purchase Order Review
                </CardTitle>
                <p className="text-gray-600">
                  AI-processed purchase order awaiting merchant approval
                </p>
              </div>
              <Badge className={getConfidenceColor(purchaseOrder.confidence)}>
                {getConfidenceIcon(purchaseOrder.confidence)}
                {purchaseOrder.confidence}% confidence
              </Badge>
            </div>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSettings(true)}
              >
                <Settings className="h-4 w-4 mr-2" />
                AI Settings
              </Button>
              {shouldAutoApprove() && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                  <Zap className="h-3 w-3 mr-1" />
                  Auto-Approve Eligible
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center space-x-2">
              <FileText className="h-5 w-5 text-gray-500" />
              <div>
                <p className="text-sm font-medium">PO Number</p>
                <p className="text-lg font-bold">{purchaseOrder.number}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Building2 className="h-5 w-5 text-gray-500" />
              <div>
                <p className="text-sm font-medium">Supplier</p>
                <p className="text-lg font-bold">{purchaseOrder.supplierName}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <DollarSign className="h-5 w-5 text-gray-500" />
              <div>
                <p className="text-sm font-medium">Total Amount</p>
                <p className="text-lg font-bold">
                  ${editedPO.totalAmount.toFixed(2)} {purchaseOrder.currency}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Package className="h-5 w-5 text-gray-500" />
              <div>
                <p className="text-sm font-medium">Line Items</p>
                <p className="text-lg font-bold">{purchaseOrder.lineItems.length}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="lineitems">Line Items</TabsTrigger>
          <TabsTrigger value="supplier">Supplier</TabsTrigger>
          <TabsTrigger value="ai-analysis">AI Analysis</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* PO Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FileText className="h-5 w-5 mr-2" />
                  Purchase Order Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>PO Number</Label>
                    <Input
                      value={editedPO.number}
                      disabled={!isEditing}
                      onChange={(e) => setEditedPO({...editedPO, number: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Badge variant="outline" className="w-full justify-center">
                      {purchaseOrder.status}
                    </Badge>
                  </div>
                </div>
                
                {purchaseOrder.orderDate && (
                  <div>
                    <Label>Order Date</Label>
                    <Input
                      type="date"
                      value={purchaseOrder.orderDate}
                      disabled={!isEditing}
                      onChange={(e) => setEditedPO({...editedPO, orderDate: e.target.value})}
                    />
                  </div>
                )}
                
                {purchaseOrder.dueDate && (
                  <div>
                    <Label>Due Date</Label>
                    <Input
                      type="date"
                      value={purchaseOrder.dueDate}
                      disabled={!isEditing}
                      onChange={(e) => setEditedPO({...editedPO, dueDate: e.target.value})}
                    />
                  </div>
                )}
                
                {purchaseOrder.fileName && (
                  <div>
                    <Label>Source File</Label>
                    <Input value={purchaseOrder.fileName} disabled />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* AI Confidence Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Brain className="h-5 w-5 mr-2" />
                  AI Processing Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>Overall Confidence</span>
                  <Badge className={getConfidenceColor(purchaseOrder.confidence)}>
                    {purchaseOrder.confidence}%
                  </Badge>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">High Confidence Items</span>
                    <span className="text-sm font-medium">
                      {purchaseOrder.lineItems.filter(item => item.confidence >= 80).length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Medium Confidence Items</span>
                    <span className="text-sm font-medium">
                      {purchaseOrder.lineItems.filter(item => item.confidence >= 60 && item.confidence < 80).length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Low Confidence Items</span>
                    <span className="text-sm font-medium">
                      {purchaseOrder.lineItems.filter(item => item.confidence < 60).length}
                    </span>
                  </div>
                </div>

                {purchaseOrder.processingNotes && (
                  <div>
                    <Label>Processing Notes</Label>
                    <Textarea
                      value={purchaseOrder.processingNotes}
                      disabled
                      className="mt-1"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Line Items Tab */}
        <TabsContent value="lineitems">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center">
                  <Package className="h-5 w-5 mr-2" />
                  Line Items ({purchaseOrder.lineItems.length})
                </CardTitle>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(!isEditing)}
                  >
                    <Edit3 className="h-4 w-4 mr-2" />
                    {isEditing ? 'Cancel Edit' : 'Edit Items'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Unit Cost</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {editedPO.lineItems.map((item, index) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {isEditing ? (
                          <Input
                            value={item.productName}
                            onChange={(e) => handleLineItemEdit(index, 'productName', e.target.value)}
                            className="min-w-[200px]"
                          />
                        ) : (
                          <div>
                            <p className="font-medium">{item.productName}</p>
                            {item.description && (
                              <p className="text-sm text-gray-600">{item.description}</p>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input
                            value={item.sku}
                            onChange={(e) => handleLineItemEdit(index, 'sku', e.target.value)}
                          />
                        ) : (
                          item.sku
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => handleLineItemEdit(index, 'quantity', parseInt(e.target.value) || 0)}
                            className="w-20"
                          />
                        ) : (
                          item.quantity
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={item.unitCost}
                            onChange={(e) => handleLineItemEdit(index, 'unitCost', parseFloat(e.target.value) || 0)}
                            className="w-24"
                          />
                        ) : (
                          `$${item.unitCost.toFixed(2)}`
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        ${item.totalCost.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge className={getConfidenceColor(item.confidence)}>
                          {item.confidence}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              <div className="mt-4 flex justify-end">
                <div className="text-right">
                  <p className="text-lg font-bold">
                    Total: ${editedPO.totalAmount.toFixed(2)} {purchaseOrder.currency}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Supplier Tab */}
        <TabsContent value="supplier">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Building2 className="h-5 w-5 mr-2" />
                Supplier Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Supplier Name</Label>
                  <Input
                    value={editedPO.supplier?.name || editedPO.supplierName}
                    disabled={!isEditing}
                    onChange={(e) => handleSupplierEdit('name', e.target.value)}
                  />
                  {editedPO.supplier?.confidence && (
                    <Badge className={`mt-1 ${getConfidenceColor(editedPO.supplier.confidence)}`}>
                      {editedPO.supplier.confidence}% confidence
                    </Badge>
                  )}
                </div>
                
                <div>
                  <Label>Contact Email</Label>
                  <Input
                    type="email"
                    value={editedPO.supplier?.contactEmail || ''}
                    disabled={!isEditing}
                    onChange={(e) => handleSupplierEdit('contactEmail', e.target.value)}
                    placeholder="supplier@company.com"
                  />
                </div>
                
                <div>
                  <Label>Contact Phone</Label>
                  <Input
                    value={editedPO.supplier?.contactPhone || ''}
                    disabled={!isEditing}
                    onChange={(e) => handleSupplierEdit('contactPhone', e.target.value)}
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
                
                <div className="md:col-span-2">
                  <Label>Address</Label>
                  <Textarea
                    value={editedPO.supplier?.address || ''}
                    disabled={!isEditing}
                    onChange={(e) => handleSupplierEdit('address', e.target.value)}
                    placeholder="123 Main St, City, State 12345"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Analysis Tab */}
        <TabsContent value="ai-analysis">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* AI Processing Issues & Feedback */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <AlertTriangle className="h-5 w-5 mr-2 text-amber-500" />
                  Document Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {purchaseOrder.rawData?.issues && purchaseOrder.rawData.issues.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-red-700">Issues Detected:</Label>
                    <div className="space-y-2">
                      {purchaseOrder.rawData.issues.map((issue, index) => (
                        <div key={index} className="flex items-start space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                          <span className="text-sm text-red-800">{issue}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {purchaseOrder.rawData?.suggestions && purchaseOrder.rawData.suggestions.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-blue-700">Suggestions:</Label>
                    <div className="space-y-2">
                      {purchaseOrder.rawData.suggestions.map((suggestion, index) => (
                        <div key={index} className="flex items-start space-x-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <TrendingUp className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                          <span className="text-sm text-blue-800">{suggestion}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {purchaseOrder.processingNotes && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-700">AI Processing Notes:</Label>
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <p className="text-sm text-gray-800">{purchaseOrder.processingNotes}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Document Quality Assessment */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Eye className="h-5 w-5 mr-2 text-green-500" />
                  Quality Assessment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {purchaseOrder.rawData?.qualityIndicators && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3">
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-sm font-medium">Image Clarity:</span>
                        <Badge className={getQualityColor(purchaseOrder.rawData.qualityIndicators.imageClarity)}>
                          {purchaseOrder.rawData.qualityIndicators.imageClarity || 'Unknown'}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-sm font-medium">Text Legibility:</span>
                        <Badge className={getQualityColor(purchaseOrder.rawData.qualityIndicators.textLegibility)}>
                          {purchaseOrder.rawData.qualityIndicators.textLegibility || 'Unknown'}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-sm font-medium">Document Type:</span>
                        <Badge className={getQualityColor(purchaseOrder.rawData.qualityIndicators.documentCompleteness)}>
                          {purchaseOrder.rawData.qualityIndicators.documentCompleteness || 'Unknown'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                )}

                {/* Field-level confidence breakdown */}
                {purchaseOrder.rawData?.fieldConfidences && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-700">Field Confidence Scores:</Label>
                    <div className="space-y-2">
                      {Object.entries(purchaseOrder.rawData.fieldConfidences).map(([field, confidence]) => (
                        <div key={field} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <span className="text-sm capitalize">{field.replace(/([A-Z])/g, ' $1')}</span>
                          <Badge className={getConfidenceColor(typeof confidence === 'number' ? confidence * 100 : 0)}>
                            {typeof confidence === 'number' ? `${(confidence * 100).toFixed(1)}%` : '0%'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Processing Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Brain className="h-5 w-5 mr-2" />
                  Processing Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {purchaseOrder.aiAuditTrail && purchaseOrder.aiAuditTrail.length > 0 ? (
                  <div className="space-y-3">
                    {purchaseOrder.aiAuditTrail.map((audit, index) => (
                      <div key={index} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant="outline">{audit.model}</Badge>
                          <span className="text-sm text-gray-600">
                            {audit.processingTime}ms
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="font-medium">Tokens:</span> {audit.tokenCount}
                          </div>
                          <div>
                            <span className="font-medium">Confidence:</span> {audit.confidence}%
                          </div>
                          <div>
                            <span className="font-medium">Method:</span> {audit.processingMethod}
                          </div>
                          <div>
                            <span className="font-medium">Status:</span> {audit.status}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No detailed processing information available</p>
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Target className="h-5 w-5 mr-2" />
                  Confidence Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {purchaseOrder.lineItems && purchaseOrder.lineItems.length > 0 ? (
                    purchaseOrder.lineItems.map((item, index) => (
                      <div key={item.id} className="flex items-center justify-between">
                        <span className="text-sm truncate flex-1 mr-2">
                          {item.productName}
                        </span>
                        <div className="flex items-center space-x-2">
                          <Badge className={getConfidenceColor(item.confidence)}>
                            {item.confidence}%
                          </Badge>
                          {item.aiNotes && (
                            <div className="relative group">
                              <Eye className="h-4 w-4 text-gray-400 cursor-help" />
                              <div className="absolute right-0 top-6 hidden group-hover:block bg-gray-900 text-white text-xs rounded p-2 whitespace-nowrap z-10">
                                {item.aiNotes}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No line items extracted</p>
                      <p className="text-xs mt-2">The document may not be a valid purchase order</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {shouldAutoApprove() && aiSettings && (
                <div className="flex items-center space-x-2 text-blue-600">
                  <Zap className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Auto-approval enabled for {aiSettings.confidenceThreshold}%+ confidence
                  </span>
                </div>
              )}
            </div>
            
            <div className="flex space-x-3">
              <Dialog open={showDenyDialog} onOpenChange={setShowDenyDialog}>
                <DialogTrigger asChild>
                  <Button variant="destructive" disabled={isLoading}>
                    <XCircle className="h-4 w-4 mr-2" />
                    Deny
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Deny Purchase Order</DialogTitle>
                    <DialogDescription>
                      Please provide a reason for denying this purchase order.
                    </DialogDescription>
                  </DialogHeader>
                  <Textarea
                    value={denyReason}
                    onChange={(e) => setDenyReason(e.target.value)}
                    placeholder="Reason for denial..."
                    className="min-h-[100px]"
                  />
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setShowDenyDialog(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleDeny}
                      disabled={!denyReason.trim()}
                    >
                      Confirm Denial
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              
              <Button
                variant="outline"
                onClick={() => setIsEditing(!isEditing)}
                disabled={isLoading}
              >
                <Edit3 className="h-4 w-4 mr-2" />
                {isEditing ? 'Cancel Edit' : 'Edit PO'}
              </Button>
              
              <Button
                onClick={handleApprove}
                disabled={isLoading}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {isEditing ? 'Save & Approve' : 'Approve & Sync'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Settings className="h-5 w-5 mr-2" />
              AI Processing Settings
            </DialogTitle>
            <DialogDescription>
              Configure automatic approval and AI processing behavior.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Auto-Approval Confidence Threshold</Label>
              <div className="flex items-center space-x-2">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={localSettings?.confidenceThreshold || 85}
                  onChange={(e) => setLocalSettings({
                    ...(localSettings || defaultSettings),
                    confidenceThreshold: parseInt(e.target.value) || 0
                  })}
                  className="w-20"
                />
                <span>%</span>
              </div>
              <p className="text-sm text-gray-600">
                Purchase orders with confidence ≥ this threshold will be auto-approved
              </p>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Enable Auto-Approval</Label>
                <p className="text-sm text-gray-600">
                  Automatically approve high-confidence orders
                </p>
              </div>
              <Switch
                checked={localSettings?.autoApproveHigh || false}
                onCheckedChange={(checked) => setLocalSettings({
                  ...(localSettings || defaultSettings),
                  autoApproveHigh: checked
                })}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Strict Matching</Label>
                <p className="text-sm text-gray-600">
                  Require exact matches for product identification
                </p>
              </div>
              <Switch
                checked={localSettings?.strictMatching || true}
                onCheckedChange={(checked) => setLocalSettings({
                  ...(localSettings || defaultSettings),
                  strictMatching: checked
                })}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Learning Mode</Label>
                <p className="text-sm text-gray-600">
                  Learn from merchant corrections to improve accuracy
                </p>
              </div>
              <Switch
                checked={localSettings?.learningMode || false}
                onCheckedChange={(checked) => setLocalSettings({
                  ...(localSettings || defaultSettings),
                  learningMode: checked
                })}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setLocalSettings(aiSettings)
                setShowSettings(false)
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveSettings}>
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}