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

  // Fetch initial pipeline status from database
  const fetchPipelineStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from(TABLES.PURCHASE_ORDERS)
        .select('status')

      if (error) throw error

      if (data) {
        const statusCounts = data.reduce((acc, po) => {
          const status = po.status?.toLowerCase() || 'unknown'
          if (status === 'queued' || status === 'pending') acc.queued++
          else if (status === 'processing' || status === 'analyzing') acc.processing++
          else if (status === 'completed' || status === 'success') acc.completed++
          else if (status === 'failed' || status === 'error') acc.failed++
          return acc
        }, { queued: 0, processing: 0, completed: 0, failed: 0 })

        setPipelineStatus({
          ...statusCounts,
          total: data.length
        })
      }
    } catch (err) {
      console.error('Error fetching pipeline status:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch pipeline status')
    }
  }, [])

  // Fetch active POs being processed
  const fetchActivePOs = useCallback(async () => {
    try {
      const { data, error} = await supabase
        .from(TABLES.PURCHASE_ORDERS)
        .select(`
          id, 
          number, 
          status, 
          createdAt, 
          updatedAt,
          processingNotes,
          jobStatus,
          POLineItem(id)
        `)
        .order('createdAt', { ascending: false })
        .limit(10)

      if (error) throw error

      if (data) {
        const poProgress: POProgress[] = data.map((po: any) => {
          const status = po.status?.toLowerCase() || 'queued'
          let mappedStatus: POProgress['status'] = 'queued'
          let progress = 0
          let stage = 'Waiting in queue'

          // Get line item count from the array of line items
          const totalItems = po.POLineItem?.length || 0
          let itemsProcessed = 0

          // Parse processing notes for detailed status
          let detailedStage = stage
          if (po.processingNotes) {
            try {
              const notes = JSON.parse(po.processingNotes)
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
          itemsProcessed = Math.floor((progress / 100) * totalItems)

          return {
            id: po.id,
            poNumber: po.number,
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

  // Fetch recent activity logs
  const fetchActivityLogs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from(TABLES.PURCHASE_ORDERS)
        .select(`
          id, 
          number, 
          status, 
          createdAt, 
          updatedAt,
          processingNotes,
          jobStatus,
          syncResults
        `)
        .order('updatedAt', { ascending: false })
        .limit(50)

      if (error) throw error

      if (data) {
        const logs: ActivityLog[] = data.map((po: any) => {
          const status = po.status?.toLowerCase() || 'unknown'
          let type: ActivityLog['type'] = 'processing'
          let message = 'Processing purchase order'
          let details = `Status: ${status}`

          // Parse processing notes for detailed messages
          if (po.processingNotes) {
            try {
              const notes = JSON.parse(po.processingNotes)
              if (notes.message) {
                message = notes.message
              }
              if (notes.details) {
                details = notes.details
              }
            } catch {
              // If not JSON, use as details
              details = po.processingNotes
            }
          }

          // Map status to type and message
          if (status === 'completed' || status === 'success') {
            type = 'success'
            message = message || 'Successfully processed and synced'
            
            // Add sync results if available
            if (po.syncResults) {
              try {
                const results = JSON.parse(po.syncResults)
                if (results.productsCreated) {
                  details = `Created ${results.productsCreated} products in Shopify`
                }
              } catch {}
            }
          } else if (status === 'failed' || status === 'error') {
            type = 'error'
            message = message || 'Processing failed'
          } else if (status === 'syncing') {
            type = 'sync'
            message = message || 'Syncing products to Shopify'
          } else if (status === 'processing' || status === 'analyzing') {
            type = 'processing'
            message = message || 'Analyzing PDF with AI'
          } else if (status === 'queued' || status === 'pending') {
            type = 'processing'
            message = 'Queued for processing'
          }

          return {
            id: po.id,
            timestamp: new Date(po.updatedAt),
            type,
            poNumber: po.number,
            message,
            details
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
