import { useState, useEffect, useCallback } from 'react'
import { supabase, TABLES, CHANNELS } from '@/lib/supabaseClient'
import { authenticatedRequest } from '@/lib/shopifyApiService'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useSSEUpdates } from './useSSEUpdates'

export interface PipelineStatus {
  queued: number
  processing: number
  completed: number
  failed: number
  total: number
}

export interface ActivityLog {
  id: string
  timestamp: Date
  type: 'upload' | 'processing' | 'sync' | 'success' | 'error'
  poNumber: string
  message: string
  details?: string
}

export interface ProcessingLog {
  id: string
  timestamp: Date
  message: string
  stage: string
  progress: number
  metadata?: Record<string, any>
  severity: 'info' | 'success' | 'warning' | 'error'
}

export interface POProgress {
  id: string
  poNumber: string
  status: 'queued' | 'processing' | 'syncing' | 'completed' | 'failed'
  progress: number
  stage: string
  itemsProcessed: number
  totalItems: number
  uploadedAt: Date
  logs: ProcessingLog[]
}

export function useRealtimePOData() {
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>({
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    total: 0
  })

  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
  const [activePOs, setActivePOs] = useState<POProgress[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Helper function to determine log severity from message and metadata
  const determineSeverity = (data: any): ProcessingLog['severity'] => {
    const message = data.message?.toLowerCase() || ''
    
    // Error indicators
    if (message.includes('error') || message.includes('failed') || message.includes('invalid')) {
      return 'error'
    }
    
    // Warning indicators
    if (message.includes('warning') || message.includes('retry') || message.includes('skipped')) {
      return 'warning'
    }
    
    // Success indicators
    if (
      message.includes('complete') || 
      message.includes('success') || 
      message.includes('saved') ||
      message.includes('created') ||
      message.includes('extracted') ||
      message.includes('merged')
    ) {
      return 'success'
    }
    
    // Default to info
    return 'info'
  }

  // 🚀 NEW: Use SSE for real-time updates
  const { 
    events: sseEvents, 
    connectionStatus: sseConnectionStatus,
    lastHeartbeat 
  } = useSSEUpdates({
    onProgress: (data) => {
      console.log('📊 SSE Progress received:', data)
      
      // Create log entry from progress event
      const logEntry: ProcessingLog = {
        id: `${data.poId}-${Date.now()}`,
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
        message: data.message,
        stage: data.stage,
        progress: data.progress,
        metadata: {
          currentChunk: (data as any).currentChunk,
          totalChunks: (data as any).totalChunks,
          itemsExtracted: (data as any).itemsExtracted,
          totalItems: (data as any).totalItems,
          lineItems: (data as any).lineItems,
          confidence: (data as any).confidence
        },
        severity: determineSeverity(data)
      }
      
      // Update active PO progress in real-time
      setActivePOs(prev => prev.map(po => {
        if (po.id === data.poId) {
          return {
            ...po,
            progress: data.progress,
            stage: data.message,
            status: 'processing',
            logs: [...(po.logs || []), logEntry].slice(-100) // Keep last 100 logs
          }
        }
        return po
      }))
      
      // Add to activity logs
      const newLog: ActivityLog = {
        id: `${data.poId}-${Date.now()}`,
        timestamp: data.timestamp || new Date(),
        type: 'processing',
        poNumber: data.poId.substring(0, 8),
        message: data.message,
        details: `Progress: ${data.progress}%`
      }
      setActivityLogs(prev => [newLog, ...prev].slice(0, 50))
    },
    
    onStage: (data) => {
      console.log('🎯 SSE Stage received:', data)
      
      // Update active PO stage
      setActivePOs(prev => prev.map(po => {
        if (po.id === data.poId) {
          let progress = po.progress
          let status = po.status
          
          // Map stage to progress
          if (data.stage === 'ai_parsing') {
            progress = data.status === 'started' ? 10 : progress
            status = 'processing'
          } else if (data.stage === 'database_save') {
            progress = data.status === 'started' ? 50 : progress
            status = 'processing'
          } else if (data.stage === 'shopify_sync') {
            progress = data.status === 'started' ? 80 : progress
            status = 'syncing'
          }
          
          return {
            ...po,
            progress,
            stage: data.message,
            status
          }
        }
        return po
      }))
      
      // Add to activity logs
      let logType: ActivityLog['type'] = 'processing'
      if (data.stage === 'shopify_sync') {
        logType = 'sync'
      }
      
      const newLog: ActivityLog = {
        id: `${data.poId}-${Date.now()}`,
        timestamp: data.timestamp || new Date(),
        type: logType,
        poNumber: data.poId.substring(0, 8),
        message: data.message,
        details: `Stage: ${data.stage} - ${data.status}`
      }
      setActivityLogs(prev => [newLog, ...prev].slice(0, 50))
    },
    
    onCompletion: (data) => {
      console.log('🎉 SSE Completion received:', data)
      
      // Update active PO to completed
      setActivePOs(prev => prev.map(po => {
        if (po.id === data.poId) {
          return {
            ...po,
            progress: 100,
            stage: 'Completed successfully',
            status: 'completed'
          }
        }
        return po
      }))
      
      // Add to activity logs
      const newLog: ActivityLog = {
        id: `${data.poId}-${Date.now()}`,
        timestamp: data.timestamp || new Date(),
        type: 'success',
        poNumber: data.poId.substring(0, 8),
        message: `Completed ${data.stage}`,
        details: data.lineItems ? `Processed ${data.lineItems} line items` : undefined
      }
      setActivityLogs(prev => [newLog, ...prev].slice(0, 50))
      
      // Refresh pipeline status to get updated counts
      fetchPipelineStatus()
    },
    
    onError: (data) => {
      console.log('❌ SSE Error received:', data)
      
      // Update active PO to failed
      setActivePOs(prev => prev.map(po => {
        if (po.id === data.poId) {
          return {
            ...po,
            progress: 0,
            stage: 'Processing failed',
            status: 'failed'
          }
        }
        return po
      }))
      
      // Add to activity logs
      const newLog: ActivityLog = {
        id: `${data.poId}-${Date.now()}`,
        timestamp: data.timestamp || new Date(),
        type: 'error',
        poNumber: data.poId.substring(0, 8),
        message: `Error in ${data.stage}`,
        details: data.error
      }
      setActivityLogs(prev => [newLog, ...prev].slice(0, 50))
      
      // Refresh pipeline status
      fetchPipelineStatus()
    }
  })
  
  // Update connection status based on SSE
  useEffect(() => {
    setIsConnected(sseConnectionStatus === 'connected')
    
    if (sseConnectionStatus === 'error') {
      setError('Real-time connection error. Using fallback polling...')
    } else if (sseConnectionStatus === 'connected') {
      setError(null)
    }
  }, [sseConnectionStatus])

  // Fetch initial pipeline status from API
  const fetchPipelineStatus = useCallback(async () => {
    try {
      const result = await authenticatedRequest<any>('/analytics/dashboard')

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to fetch dashboard stats')
      }

      const stats = result.data

      if (stats) {
        // Calculate status counts from the stats
        setPipelineStatus({
          queued: stats.pendingPOs || 0,
          processing: 0, // Will be calculated from active POs
          completed: (stats.totalPOs || 0) - (stats.pendingPOs || 0),
          failed: 0, // Not currently tracked in dashboard stats
          total: stats.totalPOs || 0
        })
      }
    } catch (err) {
      console.error('Error fetching pipeline status:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch pipeline status')
    }
  }, [])

  // Fetch active POs being processed via API
  const fetchActivePOs = useCallback(async () => {
    try {
      // Fetch processing POs from API using authenticated request
      const result = await authenticatedRequest<any>('/purchase-orders?status=processing&limit=20')

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch purchase orders')
      }

      const orders = result.data?.orders || []

      if (orders && Array.isArray(orders)) {
        const poProgress: POProgress[] = orders.map((po: any) => {
          const status = po.status?.toLowerCase() || 'queued'
          let mappedStatus: POProgress['status'] = 'queued'
          let progress = 0
          let stage = 'Waiting in queue'

          // Get line item count
          const totalItems = po.totalItems || po._count?.lineItems || 0
          let itemsProcessed = 0

          // Parse processing notes for detailed status
          let detailedStage = stage
          if (po.processingNotes) {
            try {
              const notes = typeof po.processingNotes === 'string' 
                ? JSON.parse(po.processingNotes) 
                : po.processingNotes
              
              if (notes.currentStep) {
                detailedStage = notes.currentStep
              }
              if (notes.progress !== undefined) {
                progress = notes.progress
              }
              if (notes.itemsProcessed !== undefined) {
                itemsProcessed = notes.itemsProcessed
              }
            } catch {
              // If not JSON, use as plain text
              detailedStage = po.processingNotes
            }
          }

          // Map status to progress
          if (status === 'queued' || status === 'pending') {
            mappedStatus = 'queued'
            progress = progress || 5
            stage = detailedStage || 'Waiting in queue'
          } else if (status === 'processing' || status === 'analyzing') {
            mappedStatus = 'processing'
            progress = progress || 50
            stage = detailedStage || 'Analyzing PDF with AI'
          } else if (status === 'syncing') {
            mappedStatus = 'syncing'
            progress = progress || 75
            stage = detailedStage || 'Syncing to Shopify'
          } else if (status === 'completed' || status === 'success') {
            mappedStatus = 'completed'
            progress = 100
            stage = 'Completed successfully'
          } else if (status === 'failed' || status === 'error') {
            mappedStatus = 'failed'
            progress = 0
            stage = detailedStage || 'Processing failed'
          }

          // Calculate items processed based on progress
          if (itemsProcessed === 0 && totalItems > 0) {
            itemsProcessed = Math.floor((progress / 100) * totalItems)
          }

          return {
            id: po.id,
            poNumber: po.number || 'N/A',
            status: mappedStatus,
            progress,
            stage,
            itemsProcessed,
            totalItems,
            uploadedAt: new Date(po.createdAt),
            logs: [] // Initialize with empty logs array
          }
        })

        setActivePOs(poProgress)
      }
    } catch (err) {
      console.error('Error fetching active POs:', err)
    }
  }, [])

  // Fetch recent activity logs via API
  const fetchActivityLogs = useCallback(async () => {
    try {
      const result = await authenticatedRequest<any>('/analytics/dashboard')

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to fetch dashboard stats')
      }

      const recentActivity = result.data.recentActivity || []

      if (recentActivity && Array.isArray(recentActivity)) {
        const logs: ActivityLog[] = recentActivity.map((activity: any) => {
          const status = activity.status?.toLowerCase() || 'unknown'
          let type: ActivityLog['type'] = 'processing'
          
          // Map status to activity type
          if (status === 'completed' || status === 'success') {
            type = 'success'
          } else if (status === 'failed' || status === 'error') {
            type = 'error'
          } else if (status === 'syncing') {
            type = 'sync'
          } else if (status === 'processing' || status === 'analyzing') {
            type = 'processing'
          } else if (activity.type === 'upload') {
            type = 'upload'
          }

          // Extract PO number from message if not provided
          let poNumber = 'N/A'
          if (activity.message) {
            const poMatch = activity.message.match(/PO[#\s]*(\S+)/)
            if (poMatch) {
              poNumber = poMatch[1]
            }
          }

          return {
            id: activity.id,
            timestamp: new Date(activity.timestamp),
            type,
            poNumber,
            message: activity.message || 'Processing purchase order',
            details: `Status: ${status}`
          }
        })

        setActivityLogs(logs)
      }
    } catch (err) {
      console.error('Error fetching activity logs:', err)
    }
  }, [])

  // Subscribe to real-time changes
  useEffect(() => {
    let channel: RealtimeChannel | null = null

    const setupRealtimeSubscription = async () => {
      try {
        // Initial data fetch
        await Promise.all([
          fetchPipelineStatus(),
          fetchActivePOs(),
          fetchActivityLogs()
        ])

        // Create realtime channel
        channel = supabase
          .channel(CHANNELS.PURCHASE_ORDERS)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: TABLES.PURCHASE_ORDERS
            },
            (payload) => {
              console.log('Real-time update received:', payload)

              // Refresh data when changes occur
              fetchPipelineStatus()
              fetchActivePOs()
              
              // Add to activity log
              if (payload.new && typeof payload.new === 'object' && 'number' in payload.new) {
                const newPO = payload.new as { id: string; number: string; status?: string }
                const status = newPO.status?.toLowerCase() || 'unknown'
                let type: ActivityLog['type'] = 'processing'
                let message = 'Processing purchase order'

                if (status === 'completed' || status === 'success') {
                  type = 'success'
                  message = 'Successfully processed and synced'
                } else if (status === 'failed' || status === 'error') {
                  type = 'error'
                  message = 'Processing failed'
                } else if (status === 'syncing') {
                  type = 'sync'
                  message = 'Syncing products to Shopify'
                } else if (status === 'processing' || status === 'analyzing') {
                  type = 'processing'
                  message = 'Analyzing PDF with AI'
                }

                const newLog: ActivityLog = {
                  id: newPO.id,
                  timestamp: new Date(),
                  type,
                  poNumber: newPO.number,
                  message,
                  details: `Status: ${status}`
                }

                setActivityLogs(prev => [newLog, ...prev].slice(0, 50))
              }
            }
          )
          .subscribe((status) => {
            console.log('Realtime subscription status:', status)
            setIsConnected(status === 'SUBSCRIBED')
            
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              setError('Real-time connection error. Retrying...')
              setTimeout(() => setupRealtimeSubscription(), 3000)
            } else if (status === 'SUBSCRIBED') {
              setError(null)
            }
          })

      } catch (err) {
        console.error('Error setting up realtime subscription:', err)
        setError(err instanceof Error ? err.message : 'Failed to connect to real-time updates')
      }
    }

    setupRealtimeSubscription()

    // Set up automatic polling as backup (every 30 seconds instead of 5)
    // SSE handles real-time updates, polling is just a fallback
    const pollingInterval = setInterval(() => {
      // Only poll if SSE is not connected
      if (sseConnectionStatus !== 'connected') {
        console.log('⚠️ SSE disconnected, using fallback polling...')
        fetchActivePOs()
        fetchActivityLogs()
      }
    }, 30000) // Increased from 5s to 30s since SSE provides real-time updates

    // Cleanup on unmount
    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
      clearInterval(pollingInterval)
    }
  }, [fetchPipelineStatus, fetchActivePOs, fetchActivityLogs, sseConnectionStatus])

  // Refresh data manually
  const refresh = useCallback(async () => {
    await Promise.all([
      fetchPipelineStatus(),
      fetchActivePOs(),
      fetchActivityLogs()
    ])
  }, [fetchPipelineStatus, fetchActivePOs, fetchActivityLogs])

  return {
    pipelineStatus,
    activityLogs,
    activePOs,
    isConnected,
    error,
    refresh
  }
}
