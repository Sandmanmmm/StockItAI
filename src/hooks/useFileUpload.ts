/**
 * Production File Upload Hook with Real-time Progress Tracking
 * Handles file upload, status polling, and error management
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { apiService } from '@/lib/apiService'
import { PurchaseOrder } from '@/lib/apiService'
import { toast } from 'sonner'

export interface UploadProgress {
  poId?: string
  uploadId?: string
  fileName: string
  fileSize: number
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed'
  progress: number
  estimatedTime?: number
  error?: string
  purchaseOrder?: PurchaseOrder
}

export interface UseFileUploadOptions {
  autoProcess?: boolean
  supplierId?: string
  confidenceThreshold?: number
  onStatusChange?: (status: UploadProgress) => void
  onComplete?: (purchaseOrder: PurchaseOrder) => void
  onError?: (error: string) => void
}

export function useFileUpload(options: UseFileUploadOptions = {}) {
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Clean up intervals on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const updateProgress = useCallback((update: Partial<UploadProgress>) => {
    setUploadProgress(prev => {
      const newProgress = prev ? { ...prev, ...update } : {
        fileName: '',
        fileSize: 0,
        status: 'pending' as const,
        progress: 0,
        ...update
      }
      
      // Call status change callback
      options.onStatusChange?.(newProgress)
      
      return newProgress
    })
  }, [options.onStatusChange])

  const startStatusPolling = useCallback((uploadId: string) => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    const pollStatus = async () => {
      try {
        const response = await apiService.getUploadStatus(uploadId)
        console.log('📊 Upload status response:', JSON.stringify(response, null, 2))
        
        if (response.success && response.data && response.data.workflow) {
          const { workflow } = response.data
          console.log('📦 Workflow data:', workflow)
          const { status, progress, purchaseOrder, jobError } = workflow
          
          updateProgress({
            status: status as any,
            progress: Math.min(progress || 0, 100),
            error: jobError || undefined,
            purchaseOrder
          })

          // Check if processing is complete
          if (status === 'completed') {
            if (intervalRef.current) {
              clearInterval(intervalRef.current)
              intervalRef.current = null
            }
            setIsProcessing(false)
            
            if (purchaseOrder) {
              options.onComplete?.(purchaseOrder)
              toast.success(`Purchase order processed successfully: ${purchaseOrder.number}`)
            }
          } else if (status === 'failed') {
            if (intervalRef.current) {
              clearInterval(intervalRef.current)
              intervalRef.current = null
            }
            setIsProcessing(false)
            
            const errorMessage = jobError || 'Processing failed'
            options.onError?.(errorMessage)
            toast.error(`Processing failed: ${errorMessage}`)
          }
        } else {
          console.error('❌ Invalid status response:', { 
            success: response.success, 
            hasData: !!response.data,
            hasWorkflow: !!(response.data && response.data.workflow),
            data: response.data 
          })
          // If we can't get status, stop polling
          if (intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
          }
          setIsProcessing(false)
          
          const errorMessage = response.error || 'Failed to get processing status'
          updateProgress({ status: 'failed', error: errorMessage })
          options.onError?.(errorMessage)
        }
      } catch (error) {
        console.error('Status polling error:', error)
        // Continue polling on network errors, but log them
      }
    }

    // Start polling immediately
    pollStatus()
    
    // Set up interval for continued polling (every 2 seconds)
    intervalRef.current = setInterval(pollStatus, 2000)
  }, [updateProgress, options])

  const uploadFile = useCallback(async (file: File) => {
    // Reset state
    setIsUploading(true)
    setIsProcessing(false)
    abortControllerRef.current = new AbortController()

    updateProgress({
      fileName: file.name,
      fileSize: file.size,
      status: 'uploading',
      progress: 0,
      error: undefined,
      purchaseOrder: undefined
    })

    try {
      // Upload the file
      const uploadResponse = await apiService.uploadPOFile(file, {
        autoProcess: options.autoProcess ?? true,
        supplierId: options.supplierId,
        confidenceThreshold: options.confidenceThreshold
      })

      if (!uploadResponse.success || !uploadResponse.data) {
        throw new Error(uploadResponse.error || 'Upload failed')
      }

      const { poId, uploadId, status, estimatedProcessingTime } = uploadResponse.data

      setIsUploading(false)
      
      updateProgress({
        poId,
        uploadId,
        status: status as any,
        progress: status === 'processing' ? 10 : 100,
        estimatedTime: estimatedProcessingTime
      })

      // If auto-processing is enabled, start polling for status
      if (status === 'processing') {
        setIsProcessing(true)
        startStatusPolling(uploadId) // Use uploadId instead of poId
        toast.success(`File uploaded successfully. Processing started...`)
      } else {
        toast.success(`File uploaded successfully`)
        // File uploaded but not processing - mark as completed
        updateProgress({
          status: 'completed',
          progress: 100
        })
      }

      return { success: true, poId }

    } catch (error) {
      setIsUploading(false)
      setIsProcessing(false)
      
      const errorMessage = error instanceof Error ? error.message : 'Upload failed'
      updateProgress({
        status: 'failed',
        progress: 0,
        error: errorMessage
      })
      
      options.onError?.(errorMessage)
      toast.error(`Upload failed: ${errorMessage}`)
      
      return { success: false, error: errorMessage }
    }
  }, [options, updateProgress, startStatusPolling])

  const triggerProcessing = useCallback(async (poId: string) => {
    if (!poId) return { success: false, error: 'No PO ID provided' }

    try {
      setIsProcessing(true)
      updateProgress({
        status: 'processing',
        progress: 5
      })

      const response = await apiService.triggerProcessing(poId, {
        confidenceThreshold: options.confidenceThreshold
      })

      if (response.success) {
        startStatusPolling(poId)
        toast.success('Processing started')
        return { success: true }
      } else {
        throw new Error(response.error || 'Failed to start processing')
      }
    } catch (error) {
      setIsProcessing(false)
      const errorMessage = error instanceof Error ? error.message : 'Failed to start processing'
      updateProgress({
        status: 'failed',
        error: errorMessage
      })
      options.onError?.(errorMessage)
      toast.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }, [options, updateProgress, startStatusPolling])

  const cancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setIsUploading(false)
    setIsProcessing(false)
    updateProgress({
      status: 'failed',
      error: 'Upload cancelled by user'
    })
  }, [updateProgress])

  const resetUpload = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setIsUploading(false)
    setIsProcessing(false)
    setUploadProgress(null)
  }, [])

  return {
    uploadProgress,
    isUploading,
    isProcessing,
    uploadFile,
    triggerProcessing,
    cancelUpload,
    resetUpload
  }
}