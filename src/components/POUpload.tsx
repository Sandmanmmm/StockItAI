import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { 
  Upload,
  FileText,
  Check,
  Warning,
  X,
  Eye,
  Stack,
  Lightning,
  Pause,
  Play,
  ArrowsClockwise,
  Download,
  CloudArrowUp,
  FolderOpen,
  Robot,
  ChartLineUp,
  Trash
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useKV } from '@github/spark/hooks'

interface ParsedItem {
  sku: string
  name: string
  quantity: number
  price: number
  confidence: number
}

interface ParsedPO {
  supplier: string
  poNumber: string
  date: string
  items: ParsedItem[]
  totalItems: number
  totalValue: number
  averageConfidence: number
}

interface UploadedFile {
  id: string
  file: File
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'paused'
  progress: number
  parsedData: ParsedPO | null
  error?: string
  selected: boolean
  processingStarted: number | null
  processingCompleted: number | null
}

interface BatchStats {
  total: number
  pending: number
  processing: number
  completed: number
  failed: number
  totalValue: number
  totalItems: number
  averageConfidence: number
}

export function POUpload() {
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useKV<UploadedFile[]>('bulk-po-uploads', [])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [activeTab, setActiveTab] = useState('upload')
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const processingRef = useRef<NodeJS.Timeout | null>(null)

  // Calculate batch statistics
  const batchStats: BatchStats = uploadedFiles?.reduce((stats, file) => {
    stats.total++
    stats[file.status as keyof Omit<BatchStats, 'total' | 'totalValue' | 'totalItems' | 'averageConfidence'>]++
    
    if (file.parsedData) {
      stats.totalValue += file.parsedData.totalValue
      stats.totalItems += file.parsedData.totalItems
    }
    
    return stats
  }, {
    total: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    totalValue: 0,
    totalItems: 0,
    averageConfidence: 0
  }) || {
    total: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    totalValue: 0,
    totalItems: 0,
    averageConfidence: 0
  }

  // Calculate average confidence
  const completedFiles = uploadedFiles?.filter(f => f.status === 'completed' && f.parsedData) || []
  batchStats.averageConfidence = completedFiles.length > 0 
    ? completedFiles.reduce((sum, f) => sum + (f.parsedData?.averageConfidence || 0), 0) / completedFiles.length 
    : 0

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      addFilesToBatch(files)
    }
  }, [uploadedFiles])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      addFilesToBatch(Array.from(files))
    }
  }, [uploadedFiles])

  const addFilesToBatch = useCallback((files: File[]) => {
    const newFiles: UploadedFile[] = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      status: 'pending' as const,
      progress: 0,
      parsedData: null,
      selected: false,
      processingStarted: null,
      processingCompleted: null
    }))

    setUploadedFiles((current) => [...(current || []), ...newFiles])
    toast.success(`Added ${files.length} file${files.length > 1 ? 's' : ''} to batch`)
    
    // Auto-switch to batch tab if files were added
    if (files.length > 0) {
      setActiveTab('batch')
    }
  }, [setUploadedFiles])

  const startBatchProcessing = useCallback(() => {
    if (isProcessing) return
    
    setIsProcessing(true)
    setIsPaused(false)
    
    const processNextFile = () => {
      if (isPaused) return
      
      setUploadedFiles((current) => {
        const files = current || []
        const nextFile = files.find(f => f.status === 'pending')
        
        if (!nextFile) {
          setIsProcessing(false)
          toast.success('Batch processing completed!')
          return files
        }
        
        // Start processing this file
        const updatedFiles = files.map(f => 
          f.id === nextFile.id 
            ? { ...f, status: 'processing' as const, progress: 0, processingStarted: Date.now() }
            : f
        )
        
        // Simulate processing
        let progress = 0
        const progressInterval = setInterval(() => {
          progress += Math.random() * 15
          
          setUploadedFiles((current) => 
            current?.map(f => 
              f.id === nextFile.id 
                ? { ...f, progress: Math.min(progress, 100) }
                : f
            ) || []
          )
          
          if (progress >= 100) {
            clearInterval(progressInterval)
            
            // Generate mock parsed data
            const mockParsedData: ParsedPO = {
              supplier: ['TechnoSupply Co.', 'Premier Wholesale', 'GlobalTech Systems', 'ModernSupply'][Math.floor(Math.random() * 4)],
              poNumber: 'PO-2024-' + Math.floor(Math.random() * 1000),
              date: new Date().toLocaleDateString(),
              totalItems: Math.floor(Math.random() * 10) + 1,
              totalValue: Math.random() * 5000 + 500,
              averageConfidence: Math.floor(Math.random() * 20) + 80,
              items: Array.from({ length: Math.floor(Math.random() * 5) + 1 }, (_, i) => ({
                sku: `ITEM-${String(i + 1).padStart(3, '0')}`,
                name: `Product ${i + 1}`,
                quantity: Math.floor(Math.random() * 20) + 1,
                price: Math.random() * 100 + 10,
                confidence: Math.floor(Math.random() * 20) + 80
              }))
            }
            
            setUploadedFiles((current) => 
              current?.map(f => 
                f.id === nextFile.id 
                  ? { 
                      ...f, 
                      status: 'completed' as const, 
                      progress: 100, 
                      parsedData: mockParsedData,
                      processingCompleted: Date.now()
                    }
                  : f
              ) || []
            )
            
            // Process next file after a short delay
            processingRef.current = setTimeout(() => {
              if (!isPaused) {
                processNextFile()
              }
            }, 1000)
          }
        }, 200)
        
        return updatedFiles
      })
    }
    
    processNextFile()
  }, [isProcessing, isPaused, setUploadedFiles])

  const pauseProcessing = useCallback(() => {
    setIsPaused(true)
    if (processingRef.current) {
      clearTimeout(processingRef.current)
    }
  }, [])

  const resumeProcessing = useCallback(() => {
    setIsPaused(false)
    if (isProcessing) {
      startBatchProcessing()
    }
  }, [isProcessing, startBatchProcessing])

  const clearCompleted = useCallback(() => {
    setUploadedFiles((current) => 
      current?.filter(f => f.status !== 'completed') || []
    )
    toast.success('Cleared completed files')
  }, [setUploadedFiles])

  const removeFile = useCallback((fileId: string) => {
    setUploadedFiles((current) => 
      current?.filter(f => f.id !== fileId) || []
    )
  }, [setUploadedFiles])

  const toggleFileSelection = useCallback((fileId: string) => {
    setUploadedFiles((current) => 
      current?.map(f => 
        f.id === fileId ? { ...f, selected: !f.selected } : f
      ) || []
    )
  }, [setUploadedFiles])

  const selectAllFiles = useCallback(() => {
    const allSelected = uploadedFiles?.every(f => f.selected) || false
    setUploadedFiles((current) => 
      current?.map(f => ({ ...f, selected: !allSelected })) || []
    )
  }, [uploadedFiles, setUploadedFiles])

  const removeSelectedFiles = useCallback(() => {
    setUploadedFiles((current) => 
      current?.filter(f => !f.selected) || []
    )
    toast.success('Removed selected files')
  }, [setUploadedFiles])

  const approveSelectedFiles = useCallback(() => {
    const selectedCompletedFiles = uploadedFiles?.filter(f => f.selected && f.status === 'completed') || []
    if (selectedCompletedFiles.length === 0) {
      toast.error('No completed files selected')
      return
    }
    
    toast.success(`Approved and synced ${selectedCompletedFiles.length} purchase orders to inventory!`)
    
    // Remove approved files
    setUploadedFiles((current) => 
      current?.filter(f => !(f.selected && f.status === 'completed')) || []
    )
  }, [uploadedFiles, setUploadedFiles])

  const getStatusColor = (status: UploadedFile['status']) => {
    switch (status) {
      case 'pending': return 'text-muted-foreground'
      case 'processing': return 'text-primary'
      case 'completed': return 'text-success'
      case 'failed': return 'text-destructive'
      case 'paused': return 'text-warning'
      default: return 'text-muted-foreground'
    }
  }

  const getStatusBadgeVariant = (status: UploadedFile['status']) => {
    switch (status) {
      case 'pending': return 'secondary'
      case 'processing': return 'default'
      case 'completed': return 'default'
      case 'failed': return 'destructive'
      case 'paused': return 'secondary'
      default: return 'secondary'
    }
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 95) return 'text-success'
    if (confidence >= 85) return 'text-warning'
    return 'text-destructive'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <CloudArrowUp className="w-6 h-6 text-primary" />
            </div>
            Bulk PO Upload & Processing
          </h2>
          <p className="text-muted-foreground mt-1">
            Upload multiple purchase orders for AI-powered batch processing and inventory sync
          </p>
        </div>
        
        {/* Quick Stats */}
        <div className="flex items-center gap-4">
          {batchStats.total > 0 && (
            <>
              <Badge variant="outline" className="gap-2">
                <Stack className="w-4 h-4" />
                {batchStats.total} Files
              </Badge>
              <Badge variant="outline" className="gap-2 text-success">
                <Check className="w-4 h-4" />
                {batchStats.completed} Completed
              </Badge>
            </>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        {/* Enhanced Tab Navigation */}
        <TabsList className="grid grid-cols-3 lg:w-[500px] h-12 bg-muted/30 p-1">
          <TabsTrigger 
            value="upload" 
            className="flex items-center gap-2 h-10 data-[state=active]:bg-card data-[state=active]:shadow-sm"
          >
            <Upload className="w-4 h-4" />
            Upload Files
          </TabsTrigger>
          <TabsTrigger 
            value="batch" 
            className="flex items-center gap-2 h-10 data-[state=active]:bg-card data-[state=active]:shadow-sm"
          >
            <Stack className="w-4 h-4" />
            Batch Queue
            {batchStats.total > 0 && (
              <Badge className="ml-1 h-5 w-5 rounded-full p-0 text-xs">
                {batchStats.total}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="analytics" 
            className="flex items-center gap-2 h-10 data-[state=active]:bg-card data-[state=active]:shadow-sm"
          >
            <ChartLineUp className="w-4 h-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* Upload Tab */}
        <TabsContent value="upload" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Bulk Drop Zone */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderOpen className="w-5 h-5" />
                  Bulk File Upload
                </CardTitle>
                <CardDescription>
                  Drop multiple PO files here or click to browse. Supports PDF, Excel, CSV, and image formats.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <motion.div
                  className={cn(
                    "border-2 border-dashed rounded-xl p-12 text-center transition-all",
                    isDragOver ? "border-primary bg-primary/5 scale-105" : "border-border",
                    "hover:border-primary/50 hover:bg-muted/50"
                  )}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  animate={{ 
                    scale: isDragOver ? 1.02 : 1,
                    borderColor: isDragOver ? 'var(--primary)' : 'var(--border)'
                  }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="space-y-6">
                    <div className="flex items-center justify-center">
                      <div className="relative">
                        <motion.div
                          className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center"
                          animate={{ 
                            scale: isDragOver ? [1, 1.1, 1] : 1,
                            rotate: isDragOver ? [0, 5, -5, 0] : 0
                          }}
                          transition={{ duration: 0.5, repeat: isDragOver ? Infinity : 0 }}
                        >
                          <CloudArrowUp className="w-10 h-10 text-primary" />
                        </motion.div>
                        {isDragOver && (
                          <motion.div
                            className="absolute inset-0 rounded-full border-4 border-primary border-dashed"
                            animate={{ scale: [1, 1.2], opacity: [0.5, 0] }}
                            transition={{ duration: 1, repeat: Infinity }}
                          />
                        )}
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-xl font-semibold mb-2">
                        {isDragOver ? 'Release to upload files' : 'Drag & drop your PO files here'}
                      </h3>
                      <p className="text-muted-foreground mb-4">
                        Upload multiple files at once for batch processing
                      </p>
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-6">
                        <Badge variant="outline" className="gap-1">
                          <FileText className="w-3 h-3" />
                          PDF
                        </Badge>
                        <Badge variant="outline" className="gap-1">
                          <FileText className="w-3 h-3" />
                          Excel
                        </Badge>
                        <Badge variant="outline" className="gap-1">
                          <FileText className="w-3 h-3" />
                          CSV
                        </Badge>
                        <Badge variant="outline" className="gap-1">
                          <FileText className="w-3 h-3" />
                          Images
                        </Badge>
                      </div>
                      <Button
                        size="lg"
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90"
                      >
                        <FolderOpen className="w-5 h-5 mr-2" />
                        Browse Files
                      </Button>
                    </div>
                  </div>
                </motion.div>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                  accept=".pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png"
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Batch Processing Tab */}
        <TabsContent value="batch" className="space-y-6">
          {/* Batch Controls */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Robot className="w-5 h-5" />
                    Batch Processing Queue
                  </CardTitle>
                  <CardDescription>
                    Manage and monitor your bulk PO processing pipeline
                  </CardDescription>
                </div>
                
                <div className="flex items-center gap-2">
                  {!isProcessing ? (
                    <Button
                      onClick={startBatchProcessing}
                      disabled={batchStats.pending === 0}
                      className="bg-gradient-to-r from-primary to-accent"
                    >
                      <Lightning className="w-4 h-4 mr-2" />
                      Start Processing
                    </Button>
                  ) : isPaused ? (
                    <Button onClick={resumeProcessing} variant="outline">
                      <Play className="w-4 h-4 mr-2" />
                      Resume
                    </Button>
                  ) : (
                    <Button onClick={pauseProcessing} variant="outline">
                      <Pause className="w-4 h-4 mr-2" />
                      Pause
                    </Button>
                  )}
                  
                  {batchStats.completed > 0 && (
                    <Button onClick={clearCompleted} variant="outline" size="sm">
                      <ArrowsClockwise className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            
            {/* Batch Stats */}
            {batchStats.total > 0 && (
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-muted-foreground">{batchStats.pending}</div>
                    <div className="text-xs text-muted-foreground">Pending</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">{batchStats.processing}</div>
                    <div className="text-xs text-muted-foreground">Processing</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-success">{batchStats.completed}</div>
                    <div className="text-xs text-muted-foreground">Completed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-destructive">{batchStats.failed}</div>
                    <div className="text-xs text-muted-foreground">Failed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">${batchStats.totalValue.toFixed(0)}</div>
                    <div className="text-xs text-muted-foreground">Total Value</div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* File List */}
          {batchStats.total > 0 ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Processing Queue ({batchStats.total} files)</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectAllFiles}
                    >
                      <Checkbox 
                        checked={uploadedFiles?.every(f => f.selected) || false}
                        className="mr-2"
                      />
                      Select All
                    </Button>
                    {uploadedFiles?.some(f => f.selected) && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={approveSelectedFiles}
                          className="text-success"
                        >
                          <Check className="w-4 h-4 mr-1" />
                          Approve Selected
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={removeSelectedFiles}
                          className="text-destructive"
                        >
                          <Trash className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-3">
                    {uploadedFiles?.map((fileItem) => (
                      <motion.div
                        key={fileItem.id}
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className={cn(
                          "border border-border rounded-lg p-4 transition-all",
                          fileItem.selected && "border-primary bg-primary/5"
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <Checkbox
                            checked={fileItem.selected}
                            onCheckedChange={() => toggleFileSelection(fileItem.id)}
                          />
                          
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <FileText className="w-5 h-5 text-muted-foreground" />
                              <div className="flex-1">
                                <p className="font-medium text-sm">{fileItem.file.name}</p>
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                  <span>{(fileItem.file.size / 1024 / 1024).toFixed(2)} MB</span>
                                  {fileItem.parsedData && (
                                    <>
                                      <span>•</span>
                                      <span>{fileItem.parsedData.supplier}</span>
                                      <span>•</span>
                                      <span>{fileItem.parsedData.poNumber}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            {fileItem.status === 'processing' && (
                              <div className="mt-3">
                                <div className="flex items-center justify-between text-sm mb-1">
                                  <span className="text-primary">Processing...</span>
                                  <span>{Math.round(fileItem.progress)}%</span>
                                </div>
                                <Progress value={fileItem.progress} className="h-2" />
                              </div>
                            )}
                            
                            {fileItem.parsedData && (
                              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                <div>
                                  <span className="text-muted-foreground">Items:</span>
                                  <span className="font-medium ml-1">{fileItem.parsedData.totalItems}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Value:</span>
                                  <span className="font-medium ml-1">${fileItem.parsedData.totalValue.toFixed(2)}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Confidence:</span>
                                  <span className={cn("font-medium ml-1", getConfidenceColor(fileItem.parsedData.averageConfidence))}>
                                    {fileItem.parsedData.averageConfidence}%
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Date:</span>
                                  <span className="font-medium ml-1">{fileItem.parsedData.date}</span>
                                </div>
                              </div>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant={getStatusBadgeVariant(fileItem.status)}
                              className={cn("capitalize", getStatusColor(fileItem.status))}
                            >
                              {fileItem.status}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeFile(fileItem.id)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                    <Stack className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">No files in queue</h3>
                  <p className="text-muted-foreground mb-4">
                    Upload files to start batch processing
                  </p>
                  <Button 
                    variant="outline" 
                    onClick={() => setActiveTab('upload')}
                  >
                    Go to Upload
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Processing Statistics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ChartLineUp className="w-5 h-5" />
                  Processing Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {batchStats.total > 0 ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-4 rounded-lg bg-muted/50">
                        <div className="text-2xl font-bold">{batchStats.averageConfidence.toFixed(1)}%</div>
                        <div className="text-sm text-muted-foreground">Avg Confidence</div>
                      </div>
                      <div className="text-center p-4 rounded-lg bg-muted/50">
                        <div className="text-2xl font-bold">{batchStats.totalItems}</div>
                        <div className="text-sm text-muted-foreground">Total Items</div>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Success Rate</span>
                        <span>{batchStats.total > 0 ? Math.round((batchStats.completed / batchStats.total) * 100) : 0}%</span>
                      </div>
                      <Progress 
                        value={batchStats.total > 0 ? (batchStats.completed / batchStats.total) * 100 : 0} 
                        className="h-2" 
                      />
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No data available</p>
                    <p className="text-sm text-muted-foreground">Process some files to see analytics</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {uploadedFiles?.filter(f => f.status === 'completed').slice(-5).map((file) => (
                    <div key={file.id} className="flex items-center gap-3 text-sm">
                      <Check className="w-4 h-4 text-success" />
                      <div className="flex-1">
                        <p className="font-medium">{file.file.name}</p>
                        <p className="text-muted-foreground">
                          {file.processingCompleted && new Date(file.processingCompleted).toLocaleTimeString()}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {file.parsedData?.averageConfidence}%
                      </Badge>
                    </div>
                  )) || (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">No recent activity</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}