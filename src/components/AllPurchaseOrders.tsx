import { useState, useEffect } from 'react'
import {
  Package,
  TrendUp,
  Clock,
  CheckCircle,
  X,
  MagnifyingGlass,
  FunnelSimple,
  DownloadSimple,
  Eye,
  Calendar,
  Hash,
  FileText,
  Truck,
  MapPin,
  Phone,
  EnvelopeSimple,
  CaretDown,
  CaretUp,
  CaretLeft,
  CaretRight,
  DotsThreeOutline,
  PencilSimple,
  Trash,
  ArrowsClockwise,
  ChartLineUp,
  SortAscending,
  SortDescending,
  Warning,
  Check,
  ArrowLeft,
  WarningCircle
} from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { usePurchaseOrders } from '../hooks/useMerchantData'
import { PurchaseOrderDetails } from './PurchaseOrderDetails'
import { PurchaseOrderReviewPage } from './PurchaseOrderReviewPage'

interface PurchaseOrderItem {
  id: string
  sku: string
  productName: string
  description?: string
  quantity: number
  unitCost: number
  totalCost: number
  confidence: number
  status: 'matched' | 'new' | 'updated' | 'error' | 'review_needed' | 'pending'
  shopifyProductId?: string
  shopifyVariantId?: string
  aiNotes?: string
}

interface PurchaseOrder {
  id: string
  number: string                // PO number from API
  supplierName: string         // Supplier name from API
  orderDate?: string
  dueDate?: string
  totalAmount: number
  currency: string
  status: 'processing' | 'completed' | 'failed' | 'review_needed' | 'pending'
  confidence: number
  fileName?: string
  fileSize?: number
  processingNotes?: string
  rawData?: {                  // AI analysis data - actual nested structure
    extractedData?: {
      supplier?: {
        name?: string
        address?: string
        contact?: {
          email?: string
          phone?: string
        }
      }
      totals?: {
        grandTotal?: number
        total?: number
        totalAmount?: number
        subtotal?: number
        tax?: number
        shipping?: number
      }
      lineItems?: any[]
      confidence?: number
      dates?: any
      poNumber?: string
      notes?: string
    }
    vendor?: {
      name?: string
      address?: string
    }
    supplier?: {
      name?: string
    }
    totals?: {
      total?: number
      grandTotal?: number
      totalAmount?: number
      subtotal?: number
      tax?: number
    }
    total?: {
      amount?: number
    }
    lineItems?: any[]
    confidence?: {
      overall?: number
    } | number
    [key: string]: any  // Allow other properties
  }
  createdAt: string
  updatedAt: string
  
  // Related data from API includes
  supplier?: {
    id: string
    name: string
    status: string
  }
  lineItems?: PurchaseOrderItem[]
  _count?: {
    lineItems: number
  }
  
  // Computed fields for compatibility
  totalItems?: number
}

interface AllPurchaseOrdersProps {
  onBack: () => void
}

export function AllPurchaseOrders({ onBack }: AllPurchaseOrdersProps) {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [reviewOrderId, setReviewOrderId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [sortField, setSortField] = useState<'number' | 'supplierName' | 'createdAt' | 'totalAmount'>('createdAt')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const ordersPerPage = 1000  // Load all purchase orders (set high limit)
  
  // Multi-select state for bulk operations
  const [selectedPOs, setSelectedPOs] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Use authenticated hook for purchase orders - load all at once
  const { purchaseOrders, total, loading, error, refetch } = usePurchaseOrders({
    limit: ordersPerPage,
    offset: 0  // Always start from beginning to get all orders
  })

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <ArrowsClockwise className="w-8 h-8 animate-spin" />
        <span className="ml-2">Loading purchase orders...</span>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <WarningCircle className="w-12 h-12 text-destructive mb-4" />
        <h3 className="text-lg font-semibold mb-2">Failed to Load Purchase Orders</h3>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={() => refetch()} variant="outline">
          Try Again
        </Button>
      </div>
    )
  }

  // Filter and sort purchase orders
  const filteredAndSortedPOs = (purchaseOrders || [])
    .filter(po => {
      const matchesSearch = po.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           po.supplierName.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesStatus = statusFilter === 'all' || po.status === statusFilter
      const matchesSupplier = supplierFilter === 'all' || po.supplierName === supplierFilter
      return matchesSearch && matchesStatus && matchesSupplier
    })
    .sort((a, b) => {
      let aValue: any = a[sortField as keyof PurchaseOrder]
      let bValue: any = b[sortField as keyof PurchaseOrder]
      
      if (sortField === 'createdAt') {
        aValue = new Date(aValue || 0).getTime()
        bValue = new Date(bValue || 0).getTime()
      }
      
      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1
      }
      return aValue < bValue ? 1 : -1
    })

  // Get unique suppliers for filter
  const uniqueSuppliers = Array.from(new Set((purchaseOrders || []).map(po => po.supplierName)))

  // Checkbox handlers for bulk selection
  const toggleSelectAll = () => {
    if (selectedPOs.size === filteredAndSortedPOs.length) {
      setSelectedPOs(new Set())
    } else {
      setSelectedPOs(new Set(filteredAndSortedPOs.map(po => po.id)))
    }
  }

  const toggleSelectPO = (poId: string) => {
    const newSelected = new Set(selectedPOs)
    if (newSelected.has(poId)) {
      newSelected.delete(poId)
    } else {
      newSelected.add(poId)
    }
    setSelectedPOs(newSelected)
  }

  // Bulk delete handler
  const handleBulkDelete = async () => {
    setIsDeleting(true)
    try {
      // Delete each selected PO
      const deletePromises = Array.from(selectedPOs).map(async (poId) => {
        const response = await fetch(`/api/purchase-orders/${poId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          }
        })
        
        if (!response.ok) {
          throw new Error(`Failed to delete PO ${poId}`)
        }
        
        return response.json()
      })

      await Promise.all(deletePromises)
      
      // Clear selection and refresh
      setSelectedPOs(new Set())
      setShowDeleteConfirm(false)
      refetch()
    } catch (error) {
      console.error('Error deleting purchase orders:', error)
      alert('Failed to delete some purchase orders. Please try again.')
    } finally {
      setIsDeleting(false)
    }
  }

  const getStatusBadge = (status: PurchaseOrder['status']) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-success/10 text-success border-success/20"><Check className="w-3 h-3 mr-1" />Completed</Badge>
      case 'processing':
        return <Badge className="bg-primary/10 text-primary border-primary/20"><Clock className="w-3 h-3 mr-1" />Processing</Badge>
      case 'review_needed':
        return <Badge className="bg-warning/10 text-warning border-warning/20"><Warning className="w-3 h-3 mr-1" />Review Needed</Badge>
      case 'failed':
        return <Badge variant="destructive"><X className="w-3 h-3 mr-1" />Failed</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 Bytes'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Enhanced data extraction helper - based on actual rawData structure (nested extractedData)
  const extractEnhancedData = (po: PurchaseOrder) => {
    const rawData = po.rawData
    const extractedData = rawData?.extractedData
    
    // Helper to safely convert to number
    const safeToNumber = (value: any) => {
      if (typeof value === 'number') return value
      if (typeof value === 'string') return parseFloat(value) || 0
      return 0
    }

    if (rawData && extractedData) {
      return {
        supplierName: extractedData.supplier?.name || rawData.vendor?.name || rawData.supplier?.name || po.supplierName || 'Unknown Supplier',
        totalAmount: safeToNumber(
          extractedData.totals?.grandTotal || 
          extractedData.totals?.total || 
          extractedData.totals?.totalAmount || 
          rawData.totals?.total || 
          rawData.totals?.grandTotal || 
          rawData.total?.amount ||
          po.totalAmount || 0
        ),
        // FIXED: Always use database line items count first (po.lineItems.length), then _count, then fallback to AI extracted data
        lineItemsCount: po.lineItems?.length || po._count?.lineItems || po.totalItems || extractedData.lineItems?.length || rawData.lineItems?.length || 0,
        confidence: (() => {
          const conf = rawData.confidence || extractedData.confidence
          if (typeof conf === 'object' && conf?.overall) {
            return conf.overall
          }
          if (typeof conf === 'number') {
            return conf * 100 // Convert to percentage if needed
          }
          return (po.confidence || 0) * 100
        })()
      }
    }

    return {
      supplierName: po.supplierName || 'Unknown Supplier',
      totalAmount: safeToNumber(po.totalAmount || 0),
      // FIXED: Use actual database line items first, then counts
      lineItemsCount: po.lineItems?.length || po._count?.lineItems || po.totalItems || 0,
      confidence: (po.confidence || 0) * 100 // Convert to percentage
    }
  }

  const handleSort = (field: 'number' | 'supplierName' | 'createdAt' | 'totalAmount') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const getSortIcon = (field: string) => {
    if (sortField !== field) return <SortAscending className="w-4 h-4 opacity-50" />
    return sortDirection === 'asc' ? <SortAscending className="w-4 h-4" /> : <SortDescending className="w-4 h-4" />
  }

  const getTotalStats = () => {
    const total = filteredAndSortedPOs.length
    const completed = filteredAndSortedPOs.filter(po => po.status === 'completed').length
    const processing = filteredAndSortedPOs.filter(po => po.status === 'processing').length
    const failed = filteredAndSortedPOs.filter(po => po.status === 'failed').length
    
    // Use enhanced data for more accurate totals
    const totalValue = filteredAndSortedPOs.reduce((sum, po) => {
      const enhancedData = extractEnhancedData(po)
      return sum + enhancedData.totalAmount
    }, 0)
    
    const avgConfidence = filteredAndSortedPOs.reduce((sum, po) => {
      const enhancedData = extractEnhancedData(po)
      return sum + enhancedData.confidence
    }, 0) / (total || 1)

    return { total, completed, processing, failed, totalValue, avgConfidence }
  }

  const stats = getTotalStats()

  // Show detailed view if an order is selected
  if (selectedOrderId) {
    return (
      <PurchaseOrderDetails 
        orderId={selectedOrderId}
        onBack={() => setSelectedOrderId(null)}
      />
    )
  }

  // Show purchase order review page
  if (reviewOrderId) {
    return (
      <PurchaseOrderReviewPage 
        purchaseOrderId={reviewOrderId} 
        onBack={() => {
          setReviewOrderId(null)
          // Refetch purchase orders to show updated status
          refetch()
        }} 
      />
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div>
            <h2 className="text-3xl font-bold tracking-tight">All Purchase Orders</h2>
            <p className="text-muted-foreground">Manage and review all your uploaded purchase orders</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedPOs.size > 0 && (
            <Button 
              variant="destructive" 
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash className="w-4 h-4 mr-2" />
              Delete {selectedPOs.size} Selected
            </Button>
          )}
          <Button variant="outline" size="sm">
            <DownloadSimple className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button size="sm" onClick={() => refetch()}>
            <ArrowsClockwise className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-primary">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total POs</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-success/5 to-success/10 border-success/20">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-success">{stats.completed}</div>
            <div className="text-xs text-muted-foreground">Completed</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-warning/5 to-warning/10 border-warning/20">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-warning">{stats.processing}</div>
            <div className="text-xs text-muted-foreground">Processing</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-destructive/5 to-destructive/10 border-destructive/20">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-destructive">{stats.failed}</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-accent/5 to-accent/10 border-accent/20">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-accent">{formatCurrency(stats.totalValue)}</div>
            <div className="text-xs text-muted-foreground">Total Value</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-muted/30 to-muted/50">
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{Math.round(stats.avgConfidence)}%</div>
            <div className="text-xs text-muted-foreground">Avg Confidence</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <MagnifyingGlass className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by PO number, supplier, or filename..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="review_needed">Review Needed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by supplier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Suppliers</SelectItem>
              {uniqueSuppliers.map((supplier: string) => (
                <SelectItem key={supplier} value={supplier}>{supplier}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Purchase Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Purchase Orders ({filteredAndSortedPOs.length})
          </CardTitle>
          <CardDescription>
            Click on any purchase order to view detailed information and processing results
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={selectedPOs.size === filteredAndSortedPOs.length && filteredAndSortedPOs.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 cursor-pointer"
                    />
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort('number')}>
                    <div className="flex items-center gap-2">
                      PO Number
                      {getSortIcon('number')}
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort('supplierName')}>
                    <div className="flex items-center gap-2">
                      Supplier
                      {getSortIcon('supplierName')}
                    </div>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort('createdAt')}>
                    <div className="flex items-center gap-2">
                      Created Date
                      {getSortIcon('createdAt')}
                    </div>
                  </TableHead>
                  <TableHead className="text-right">
                    Items
                  </TableHead>
                  <TableHead className="cursor-pointer text-right" onClick={() => handleSort('totalAmount')}>
                    <div className="flex items-center gap-2 justify-end">
                      Value
                      {getSortIcon('totalAmount')}
                    </div>
                  </TableHead>
                  <TableHead className="text-right">
                    AI Confidence
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedPOs.map((po) => {
                  const enhancedData = extractEnhancedData(po)
                  return (
                    <TableRow 
                      key={po.id} 
                      className="cursor-pointer hover:bg-muted/50"
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedPOs.has(po.id)}
                          onChange={() => toggleSelectPO(po.id)}
                          className="w-4 h-4 cursor-pointer"
                        />
                      </TableCell>
                      <TableCell onClick={() => setSelectedOrderId(po.id)} className="font-medium">{po.number}</TableCell>
                      <TableCell onClick={() => setSelectedOrderId(po.id)}>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <Package className="w-4 h-4 text-primary" />
                          </div>
                          {enhancedData.supplierName}
                        </div>
                      </TableCell>
                      <TableCell onClick={() => setSelectedOrderId(po.id)}>{getStatusBadge(po.status)}</TableCell>
                      <TableCell onClick={() => setSelectedOrderId(po.id)}>{formatDate(po.createdAt)}</TableCell>
                      <TableCell onClick={() => setSelectedOrderId(po.id)} className="text-right">{enhancedData.lineItemsCount}</TableCell>
                      <TableCell onClick={() => setSelectedOrderId(po.id)} className="text-right font-mono">{formatCurrency(enhancedData.totalAmount)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <div className="w-16 bg-muted rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full transition-all ${
                                enhancedData.confidence >= 90 ? 'bg-success' :
                                enhancedData.confidence >= 70 ? 'bg-warning' : 'bg-destructive'
                              }`}
                              style={{ width: `${enhancedData.confidence}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium">{enhancedData.confidence}%</span>
                        </div>
                      </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end space-x-1">
                        {(po.status === 'review_needed' || po.status === 'processing') && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              setReviewOrderId(po.id)
                            }}
                            className="text-blue-600 hover:text-blue-700"
                          >
                            <PencilSimple className="w-4 h-4 mr-1" />
                            Review
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedOrderId(po.id)
                          }}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Purchase Orders?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Are you sure you want to delete {selectedPOs.size} purchase order{selectedPOs.size > 1 ? 's' : ''}? 
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleBulkDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <ArrowsClockwise className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash className="w-4 h-4 mr-2" />
                    Delete {selectedPOs.size}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
