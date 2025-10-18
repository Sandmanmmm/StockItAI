import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  PencilSimple as Edit,
  Check,
  X,
  Package,
  CurrencyDollar as DollarSign,
  Tag,
  Image as ImageIcon,
  TrendUp,
  Robot,
  Warning as AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  Plus,
  Trash
} from '@phosphor-icons/react'
import { authenticatedRequest } from '@/lib/shopifyApiService'
import { notificationService } from '@/lib/notificationService'

interface ProductDraft {
  id?: string
  title: string
  description?: string
  vendor?: string
  productType?: string
  tags: string[]
  
  // Pricing
  priceOriginal?: number
  priceRefined?: number
  costPrice?: number
  msrp?: number
  margin?: number
  currencyOriginal: string
  currencyTarget: string
  
  // Identifiers
  sku?: string
  barcode?: string
  
  // Physical Properties
  weight?: number
  weightUnit: string
  
  // Status & Workflow
  status: 'parsed' | 'in_review' | 'approved' | 'rejected'
  workflowStage: 'initial' | 'basic_review' | 'detailed_review' | 'pricing_review' | 'final_review' | 'approved'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  
  // AI Processing
  confidence: number
  aiNotes?: string
  
  // Images
  images?: Array<{
    id?: string
    url: string
    altText?: string
    position: number
  }>
}

interface LineItem {
  id: string
  sku: string
  name: string
  quantity: number
  unitPrice: number
  totalPrice: number
  confidence: number
}

interface ProductRefinementDialogProps {
  isOpen: boolean
  onClose: () => void
  purchaseOrderId: string
  lineItems: LineItem[]
  onRefinementComplete: () => void
}

export function ProductRefinementDialog({ 
  isOpen, 
  onClose, 
  purchaseOrderId, 
  lineItems, 
  onRefinementComplete 
}: ProductRefinementDialogProps) {
  const [productDrafts, setProductDrafts] = useState<ProductDraft[]>([])
  const [selectedProduct, setSelectedProduct] = useState<ProductDraft | null>(null)
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  // Initialize product drafts from line items
  useEffect(() => {
    if (isOpen && lineItems.length > 0) {
      initializeProductDrafts()
    }
  }, [isOpen, lineItems])

  const initializeProductDrafts = () => {
    const drafts = lineItems.map((item, index) => ({
      title: item.name,
      description: '',
      vendor: '',
      productType: '',
      tags: [],
      
      // Pricing from PO
      priceOriginal: item.unitPrice,
      priceRefined: item.unitPrice * 1.5, // Default 50% markup
      costPrice: item.unitPrice,
      msrp: item.unitPrice * 2,
      margin: 50,
      currencyOriginal: 'USD',
      currencyTarget: 'USD',
      
      // Identifiers
      sku: item.sku,
      barcode: '',
      
      // Physical Properties
      weight: 0,
      weightUnit: 'lb',
      
      // Status & Workflow
      status: 'parsed' as const,
      workflowStage: 'initial' as const,
      priority: 'medium' as const,
      
      // AI Processing
      confidence: item.confidence, // Already in 0-1 format from database
      aiNotes: `Extracted from PO line item with ${Math.round(item.confidence * 100)}% confidence`,
      
      // Images
      images: []
    }))
    
    setProductDrafts(drafts)
    setSelectedProduct(drafts[0] || null)
  }

  const updateProductDraft = (updates: Partial<ProductDraft>) => {
    if (!selectedProduct) return
    
    const updatedProduct = { ...selectedProduct, ...updates }
    
    // Recalculate margin if prices changed
    if (updates.priceRefined || updates.costPrice) {
      const refined = updates.priceRefined || selectedProduct.priceRefined || 0
      const cost = updates.costPrice || selectedProduct.costPrice || 0
      
      if (cost > 0 && refined > cost) {
        updatedProduct.margin = ((refined - cost) / refined) * 100
      }
    }
    
    setSelectedProduct(updatedProduct)
    
    // Update in the array
    setProductDrafts(prev => 
      prev.map(draft => 
        draft === selectedProduct ? updatedProduct : draft
      )
    )
  }

  const handleSaveProductDrafts = async () => {
    setProcessing(true)
    
    try {
      // Create product drafts via API
      const createPromises = productDrafts.map(draft => 
        authenticatedRequest('/api/product-drafts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Merchant-ID': 'current-merchant' // Replace with actual merchant ID
          },
          body: JSON.stringify({
            ...draft,
            purchaseOrderId,
            confidence: draft.confidence
          })
        })
      )

      await Promise.all(createPromises)

      notificationService.showSuccess(
        'Product Drafts Created',
        `${productDrafts.length} products have been created for refinement.`,
        { category: 'user', priority: 'high' }
      )

      onRefinementComplete()
      onClose()
    } catch (error) {
      console.error('Error creating product drafts:', error)
      notificationService.showError(
        'Creation Failed',
        'Could not create product drafts. Please try again.',
        { category: 'system', priority: 'high' }
      )
    } finally {
      setProcessing(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any, icon: any, color: string }> = {
      parsed: { variant: 'secondary', icon: Robot, color: 'text-blue-600' },
      in_review: { variant: 'outline', icon: Eye, color: 'text-yellow-600' },
      approved: { variant: 'default', icon: CheckCircle, color: 'text-green-600' },
      rejected: { variant: 'destructive', icon: XCircle, color: 'text-red-600' }
    }
    
    const config = variants[status] || variants.parsed
    const IconComponent = config.icon
    
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <IconComponent className="w-3 h-3" />
        {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
      </Badge>
    )
  }

  const getPriorityBadge = (priority: string) => {
    const colors = {
      low: 'bg-gray-100 text-gray-800',
      medium: 'bg-blue-100 text-blue-800',
      high: 'bg-orange-100 text-orange-800',
      urgent: 'bg-red-100 text-red-800'
    }
    
    return (
      <Badge className={colors[priority as keyof typeof colors]}>
        {priority.charAt(0).toUpperCase() + priority.slice(1)}
      </Badge>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Product Refinement - {productDrafts.length} Products
          </DialogTitle>
          <DialogDescription>
            Review and refine product details before syncing to Shopify. Set pricing, descriptions, and categorization.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex gap-4 min-h-0">
          {/* Left Panel - Product List */}
          <div className="w-80 flex flex-col">
            <div className="mb-4">
              <Label className="text-sm font-medium">Products to Refine</Label>
            </div>
            
            <ScrollArea className="flex-1 border rounded-lg">
              <div className="p-2 space-y-2">
                {productDrafts.map((product, index) => (
                  <motion.div
                    key={index}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedProduct === product 
                        ? 'bg-primary/10 border-primary' 
                        : 'bg-card hover:bg-muted/50'
                    }`}
                    onClick={() => setSelectedProduct(product)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <h4 className="font-medium text-sm leading-tight">{product.title}</h4>
                        <Badge 
                          variant="outline" 
                          className="ml-2 text-xs"
                        >
                          {Math.round(product.confidence * 100)}%
                        </Badge>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>SKU: {product.sku || 'N/A'}</span>
                        <span>${product.priceRefined?.toFixed(2) || '0.00'}</span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        {getStatusBadge(product.status)}
                        {getPriorityBadge(product.priority)}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Right Panel - Product Details */}
          {selectedProduct && (
            <div className="flex-1 flex flex-col">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="pricing">Pricing</TabsTrigger>
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="images">Images</TabsTrigger>
                </TabsList>

                <ScrollArea className="flex-1 mt-4">
                  <TabsContent value="overview" className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Basic Information</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <Label htmlFor="title">Product Title *</Label>
                          <Input
                            id="title"
                            value={selectedProduct.title}
                            onChange={(e) => updateProductDraft({ title: e.target.value })}
                            placeholder="Enter product title"
                          />
                        </div>

                        <div>
                          <Label htmlFor="description">Description</Label>
                          <Textarea
                            id="description"
                            value={selectedProduct.description || ''}
                            onChange={(e) => updateProductDraft({ description: e.target.value })}
                            placeholder="Enter product description"
                            rows={3}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="vendor">Vendor</Label>
                            <Input
                              id="vendor"
                              value={selectedProduct.vendor || ''}
                              onChange={(e) => updateProductDraft({ vendor: e.target.value })}
                              placeholder="Enter vendor name"
                            />
                          </div>

                          <div>
                            <Label htmlFor="productType">Product Type</Label>
                            <Input
                              id="productType"
                              value={selectedProduct.productType || ''}
                              onChange={(e) => updateProductDraft({ productType: e.target.value })}
                              placeholder="e.g., Electronics, Clothing"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="sku">SKU</Label>
                            <Input
                              id="sku"
                              value={selectedProduct.sku || ''}
                              onChange={(e) => updateProductDraft({ sku: e.target.value })}
                              placeholder="Enter SKU"
                            />
                          </div>

                          <div>
                            <Label htmlFor="barcode">Barcode</Label>
                            <Input
                              id="barcode"
                              value={selectedProduct.barcode || ''}
                              onChange={(e) => updateProductDraft({ barcode: e.target.value })}
                              placeholder="Enter barcode"
                            />
                          </div>
                        </div>

                        <div>
                          <Label htmlFor="tags">Tags (comma-separated)</Label>
                          <Input
                            id="tags"
                            value={selectedProduct.tags.join(', ')}
                            onChange={(e) => updateProductDraft({ 
                              tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                            })}
                            placeholder="e.g., new arrival, sale, featured"
                          />
                        </div>
                      </CardContent>
                    </Card>

                    {selectedProduct.aiNotes && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg flex items-center gap-2">
                            <Robot className="w-5 h-5" />
                            AI Processing Notes
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">
                            {selectedProduct.aiNotes}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <Badge variant="outline">
                              Confidence: {Math.round(selectedProduct.confidence * 100)}%
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>

                  <TabsContent value="pricing" className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <DollarSign className="w-5 h-5" />
                          Pricing Strategy
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="costPrice">Cost Price (from PO)</Label>
                            <Input
                              id="costPrice"
                              type="number"
                              step="0.01"
                              value={selectedProduct.costPrice || ''}
                              onChange={(e) => updateProductDraft({ costPrice: parseFloat(e.target.value) || 0 })}
                              placeholder="0.00"
                            />
                          </div>

                          <div>
                            <Label htmlFor="priceRefined">Retail Price *</Label>
                            <Input
                              id="priceRefined"
                              type="number"
                              step="0.01"
                              value={selectedProduct.priceRefined || ''}
                              onChange={(e) => updateProductDraft({ priceRefined: parseFloat(e.target.value) || 0 })}
                              placeholder="0.00"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="msrp">MSRP</Label>
                            <Input
                              id="msrp"
                              type="number"
                              step="0.01"
                              value={selectedProduct.msrp || ''}
                              onChange={(e) => updateProductDraft({ msrp: parseFloat(e.target.value) || 0 })}
                              placeholder="0.00"
                            />
                          </div>

                          <div>
                            <Label>Profit Margin</Label>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="px-3 py-1">
                                {selectedProduct.margin?.toFixed(1) || '0.0'}%
                              </Badge>
                              {selectedProduct.margin && selectedProduct.margin > 50 && (
                                <Badge variant="default" className="bg-green-100 text-green-800">
                                  Good Margin
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="p-4 bg-muted/50 rounded-lg">
                          <h4 className="font-medium mb-2">Pricing Breakdown</h4>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span>Cost Price:</span>
                              <span>${selectedProduct.costPrice?.toFixed(2) || '0.00'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Retail Price:</span>
                              <span>${selectedProduct.priceRefined?.toFixed(2) || '0.00'}</span>
                            </div>
                            <Separator />
                            <div className="flex justify-between font-medium">
                              <span>Profit per Unit:</span>
                              <span className="text-green-600">
                                ${((selectedProduct.priceRefined || 0) - (selectedProduct.costPrice || 0)).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="details" className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Physical Properties</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="weight">Weight</Label>
                            <Input
                              id="weight"
                              type="number"
                              step="0.01"
                              value={selectedProduct.weight || ''}
                              onChange={(e) => updateProductDraft({ weight: parseFloat(e.target.value) || 0 })}
                              placeholder="0.0"
                            />
                          </div>

                          <div>
                            <Label htmlFor="weightUnit">Weight Unit</Label>
                            <Select
                              value={selectedProduct.weightUnit}
                              onValueChange={(value) => updateProductDraft({ weightUnit: value })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="lb">Pounds (lb)</SelectItem>
                                <SelectItem value="kg">Kilograms (kg)</SelectItem>
                                <SelectItem value="oz">Ounces (oz)</SelectItem>
                                <SelectItem value="g">Grams (g)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Workflow Status</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Current Status</Label>
                            <div className="mt-1">
                              {getStatusBadge(selectedProduct.status)}
                            </div>
                          </div>

                          <div>
                            <Label>Priority</Label>
                            <div className="mt-1">
                              {getPriorityBadge(selectedProduct.priority)}
                            </div>
                          </div>
                        </div>

                        <div>
                          <Label htmlFor="priority">Change Priority</Label>
                          <Select
                            value={selectedProduct.priority}
                            onValueChange={(value) => updateProductDraft({ priority: value as any })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low Priority</SelectItem>
                              <SelectItem value="medium">Medium Priority</SelectItem>
                              <SelectItem value="high">High Priority</SelectItem>
                              <SelectItem value="urgent">Urgent</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="images" className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <ImageIcon className="w-5 h-5" />
                          Product Images
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-center py-8 text-muted-foreground">
                          <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>Image management will be implemented in the next phase.</p>
                          <p className="text-sm">For now, focus on product details and pricing.</p>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </ScrollArea>
              </Tabs>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0">
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-muted-foreground">
              {productDrafts.filter(p => p.status === 'approved').length} of {productDrafts.length} products ready for sync
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSaveProductDrafts} disabled={processing}>
                {processing ? 'Creating...' : 'Create Product Drafts'}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}