/**
 * Production File Upload Component
 * Real API integration with progress tracking and error handling
 */

import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  Upload,
  FileText,
  Check,
  Warning,
  X,
  CloudArrowUp,
  FolderOpen,
  Robot,
  Lightning,
  Pause,
  Play,
  ArrowsClockwise,
  Download
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useFileUpload, UploadProgress } from '@/hooks/useFileUpload'
import { PurchaseOrder } from '@/lib/apiService'

interface ProductionPOUploadProps {
  onUploadComplete?: (purchaseOrder: PurchaseOrder) => void
  onUploadError?: (error: string) => void
  autoProcess?: boolean
  supplierId?: string
  confidenceThreshold?: number
}

export function ProductionPOUpload({
  onUploadComplete,
  onUploadError,
  autoProcess = true,
  supplierId,
  confidenceThreshold = 0.8
}: ProductionPOUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadProgress[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { 
    uploadProgress, 
    isUploading, 
    isProcessing, 
    uploadFile, 
    triggerProcessing,
    cancelUpload,
    resetUpload 
  } = useFileUpload({
    autoProcess,
    supplierId,
    confidenceThreshold,
    onStatusChange: (progress) => {
      // Update the current upload in the list
      setUploadedFiles(prev => {
        const existing = prev.findIndex(f => f.poId === progress.poId || f.fileName === progress.fileName)
        if (existing >= 0) {
          const updated = [...prev]
          updated[existing] = progress
          return updated
        } else {
          return [...prev, progress]
        }
      })
    },
    onComplete: (purchaseOrder) => {
      onUploadComplete?.(purchaseOrder)
      toast.success(`Successfully processed: ${purchaseOrder.number}`)
    },
    onError: (error) => {
      onUploadError?.(error)
      toast.error(`Upload failed: ${error}`)
    }
  })

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
      handleFileUpload(files[0]) // Process one file at a time for now
    }
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFileUpload(files[0])
    }
    // Reset the input
    e.target.value = ''
  }, [])

  const handleFileUpload = useCallback(async (file: File) => {
    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png', 
      'image/jpg',
      'image/webp',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]

    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Please upload PDF, images, CSV, or Excel files.')
      return
    }

    // Validate file size (25MB limit)
    const maxSize = 25 * 1024 * 1024
    if (file.size > maxSize) {
      toast.error('File too large. Maximum size is 25MB.')
      return
    }

    await uploadFile(file)
  }, [uploadFile])

  const retryProcessing = useCallback((poId: string) => {
    if (poId) {
      triggerProcessing(poId)
    }
  }, [triggerProcessing])

  const removeFile = useCallback((index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index))
  }, [])

  const clearCompleted = useCallback(() => {
    setUploadedFiles(prev => prev.filter(f => f.status !== 'completed'))
    toast.success('Cleared completed uploads')
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-success'
      case 'failed': return 'text-destructive'
      case 'processing': return 'text-primary'
      case 'uploading': return 'text-primary'
      default: return 'text-muted-foreground'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <Check className="w-4 h-4" />
      case 'failed': return <Warning className="w-4 h-4" />
      case 'processing': return <Robot className="w-4 h-4 animate-pulse" />
      case 'uploading': return <CloudArrowUp className="w-4 h-4 animate-pulse" />
      default: return <FileText className="w-4 h-4" />
    }
  }

  const formatFileSize = (bytes: number) => {
    return (bytes / 1024 / 1024).toFixed(2) + ' MB'
  }

  const formatEstimatedTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    return `${Math.round(seconds / 60)}m`
  }

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload Purchase Order
          </CardTitle>
          <CardDescription>
            Upload PO files for AI processing. Supports PDF, Excel, CSV, and image formats.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <motion.div
            className={cn(
              "border-2 border-dashed rounded-xl p-12 text-center transition-all",
              isDragOver ? "border-primary bg-primary/5 scale-105" : "border-border",
              "hover:border-primary/50 hover:bg-muted/50",
              (isUploading || isProcessing) && "opacity-50 pointer-events-none"
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
                  {isDragOver ? 'Release to upload file' : 'Drag & drop your PO file here'}
                </h3>
                <p className="text-muted-foreground mb-4">
                  Upload a single file for AI processing
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
                  disabled={isUploading || isProcessing}
                  className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90"
                >
                  <FolderOpen className="w-5 h-5 mr-2" />
                  Browse Files
                </Button>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              accept=".pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.webp"
              disabled={isUploading || isProcessing}
            />
          </motion.div>
        </CardContent>
      </Card>

      {/* Current Upload Progress */}
      {uploadProgress && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {getStatusIcon(uploadProgress.status)}
                Current Upload
              </CardTitle>
              <div className="flex items-center gap-2">
                {uploadProgress.status === 'processing' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={cancelUpload}
                  >
                    <Pause className="w-4 h-4 mr-1" />
                    Cancel
                  </Button>
                )}
                {uploadProgress.status === 'failed' && uploadProgress.poId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => retryProcessing(uploadProgress.poId!)}
                  >
                    <ArrowsClockwise className="w-4 h-4 mr-1" />
                    Retry
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  <span className="font-medium">{uploadProgress.fileName}</span>
                  <span className="text-muted-foreground">
                    ({formatFileSize(uploadProgress.fileSize)})
                  </span>
                </div>
                <Badge 
                  variant="outline"
                  className={cn("capitalize", getStatusColor(uploadProgress.status))}
                >
                  {uploadProgress.status}
                </Badge>
              </div>

              {(uploadProgress.status === 'uploading' || uploadProgress.status === 'processing') && (
                <div>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-primary">
                      {uploadProgress.status === 'uploading' ? 'Uploading...' : 'Processing...'}
                    </span>
                    <span>{Math.round(uploadProgress.progress)}%</span>
                  </div>
                  <Progress value={uploadProgress.progress} className="h-3" />
                  {uploadProgress.estimatedTime && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Estimated time: {formatEstimatedTime(uploadProgress.estimatedTime)}
                    </p>
                  )}
                </div>
              )}

              {uploadProgress.error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <p className="text-sm text-destructive font-medium">Error</p>
                  <p className="text-xs text-destructive/80">{uploadProgress.error}</p>
                </div>
              )}

              {uploadProgress.purchaseOrder && (
                <div className="p-3 rounded-lg bg-success/10 border border-success/20">
                  <p className="text-sm text-success font-medium mb-2">Processing Complete!</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">PO Number:</span>
                      <span className="font-medium ml-1">{uploadProgress.purchaseOrder.number}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Supplier:</span>
                      <span className="font-medium ml-1">{uploadProgress.purchaseOrder.supplierName}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total:</span>
                      <span className="font-medium ml-1">
                        {uploadProgress.purchaseOrder.currency} {uploadProgress.purchaseOrder.totalAmount.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Confidence:</span>
                      <span className="font-medium ml-1">{Math.round(uploadProgress.purchaseOrder.confidence * 100)}%</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload History */}
      {uploadedFiles.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Upload History</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={clearCompleted}
              >
                Clear Completed
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-3">
                <AnimatePresence>
                  {uploadedFiles.map((file, index) => (
                    <motion.div
                      key={`${file.fileName}-${index}`}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="border border-border rounded-lg p-3"
                    >
                      <div className="flex items-center gap-3">
                        {getStatusIcon(file.status)}
                        <div className="flex-1">
                          <p className="font-medium text-sm">{file.fileName}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(file.fileSize)} • {file.status}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {file.status === 'failed' && file.poId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => retryProcessing(file.poId!)}
                            >
                              <ArrowsClockwise className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFile(index)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )
}