import { useState, useEffect, useCallback } from 'react'
import { supabase, TABLES, CHANNELS } from '@/lib/supabaseClient'
import type { RealtimeChannel } from '@supabase/supabase-js'

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

export interface POProgress {
  id: string
  poNumber: string
  status: 'queued' | 'processing' | 'syncing' | 'completed' | 'failed'
  progress: number
  stage: string
  itemsProcessed: number
  totalItems: number
  uploadedAt: Date
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

  // Fetch initial pipeline status from API
  const fetchPipelineStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/analytics/dashboard', {
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const result = await response.json()
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
      // Fetch processing POs from API
      const response = await fetch('/api/purchase-orders?status=processing&limit=20', {
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const result = await response.json()
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
            uploadedAt: new Date(po.createdAt)
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
      const response = await fetch('/api/analytics/dashboard', {
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const result = await response.json()
      const recentActivity = result.data?.recentActivity || []

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

    // Set up automatic polling as backup (every 5 seconds for active POs)
    const pollingInterval = setInterval(() => {
      fetchActivePOs()
      fetchActivityLogs()
    }, 5000)

    // Cleanup on unmount
    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
      clearInterval(pollingInterval)
    }
  }, [fetchPipelineStatus, fetchActivePOs, fetchActivityLogs])

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
