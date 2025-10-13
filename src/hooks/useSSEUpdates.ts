import { useState, useEffect, useCallback, useRef } from 'react'

export interface SSEProgress {
  poId: string
  workflowId: string
  stage: string
  progress: number
  message: string
  timestamp?: Date
}

export interface SSEStage {
  stage: string
  poId: string
  workflowId: string
  status: 'started' | 'completed' | 'failed'
  message: string
  timestamp?: Date
}

export interface SSECompletion {
  stage: string
  poId: string
  workflowId: string
  lineItems?: number
  confidence?: number
  purchaseOrderId?: string
  shopifyOrderId?: string
  timestamp?: Date
}

export interface SSEError {
  stage: string
  poId: string
  workflowId: string
  error: string
  timestamp?: Date
}

export type SSEEvent = 
  | { type: 'progress'; data: SSEProgress }
  | { type: 'stage'; data: SSEStage }
  | { type: 'completion'; data: SSECompletion }
  | { type: 'error'; data: SSEError }
  | { type: 'heartbeat'; data: { timestamp: number } }

export interface UseSSEUpdatesOptions {
  reconnectInterval?: number
  maxReconnectAttempts?: number
  onProgress?: (data: SSEProgress) => void
  onStage?: (data: SSEStage) => void
  onCompletion?: (data: SSECompletion) => void
  onError?: (data: SSEError) => void
}

export interface UseSSEUpdatesReturn {
  events: SSEEvent[]
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  lastHeartbeat: Date | null
  reconnectAttempts: number
  clearEvents: () => void
}

/**
 * Custom hook for Server-Sent Events (SSE) real-time updates
 * 
 * Connects to /api/realtime/events and receives real-time workflow updates
 * Automatically handles reconnection and provides connection status
 * 
 * @example
 * ```tsx
 * const { events, connectionStatus } = useSSEUpdates({
 *   onProgress: (data) => console.log('Progress:', data),
 *   onStage: (data) => console.log('Stage:', data),
 *   onCompletion: (data) => console.log('Completed:', data),
 *   onError: (data) => console.log('Error:', data)
 * })
 * ```
 */
export function useSSEUpdates(options: UseSSEUpdatesOptions = {}): UseSSEUpdatesReturn {
  const {
    reconnectInterval = 3000,
    maxReconnectAttempts = 10,
    onProgress,
    onStage,
    onCompletion,
    onError
  } = options

  const [events, setEvents] = useState<SSEEvent[]>([])
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const [lastHeartbeat, setLastHeartbeat] = useState<Date | null>(null)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)

  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Clear events manually
  const clearEvents = useCallback(() => {
    setEvents([])
  }, [])

  // Check for stale heartbeat (no heartbeat for 30 seconds = connection dead)
  const checkHeartbeat = useCallback(() => {
    if (lastHeartbeat) {
      const now = new Date()
      const timeSinceLastHeartbeat = now.getTime() - lastHeartbeat.getTime()
      
      if (timeSinceLastHeartbeat > 30000) {
        console.warn('⚠️ SSE: No heartbeat for 30s, connection may be dead')
        setConnectionStatus('error')
        
        // Close and reconnect
        if (eventSourceRef.current) {
          eventSourceRef.current.close()
          eventSourceRef.current = null
        }
      }
    }
  }, [lastHeartbeat])

  // Set up heartbeat check interval
  useEffect(() => {
    const interval = setInterval(checkHeartbeat, 10000) // Check every 10 seconds
    return () => clearInterval(interval)
  }, [checkHeartbeat])

  // Connect to SSE endpoint
  const connect = useCallback(() => {
    // Don't reconnect if we've exceeded max attempts
    if (reconnectAttempts >= maxReconnectAttempts) {
      console.error('❌ SSE: Max reconnect attempts reached')
      setConnectionStatus('error')
      return
    }

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    // Clear any pending reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    console.log('🔌 SSE: Connecting to /api/realtime/events...')
    setConnectionStatus('connecting')

    try {
      const eventSource = new EventSource('/api/realtime/events')
      eventSourceRef.current = eventSource

      // Connection opened
      eventSource.onopen = () => {
        console.log('✅ SSE: Connected successfully')
        setConnectionStatus('connected')
        setReconnectAttempts(0)
      }

      // Progress events
      eventSource.addEventListener('progress', (e) => {
        try {
          const data: SSEProgress = JSON.parse(e.data)
          data.timestamp = new Date()
          
          const event: SSEEvent = { type: 'progress', data }
          setEvents(prev => [event, ...prev].slice(0, 100)) // Keep last 100 events
          
          if (onProgress) {
            onProgress(data)
          }
          
          console.log('📊 SSE Progress:', data)
        } catch (err) {
          console.error('❌ SSE: Failed to parse progress event:', err)
        }
      })

      // Stage events
      eventSource.addEventListener('stage', (e) => {
        try {
          const data: SSEStage = JSON.parse(e.data)
          data.timestamp = new Date()
          
          const event: SSEEvent = { type: 'stage', data }
          setEvents(prev => [event, ...prev].slice(0, 100))
          
          if (onStage) {
            onStage(data)
          }
          
          console.log('🎯 SSE Stage:', data)
        } catch (err) {
          console.error('❌ SSE: Failed to parse stage event:', err)
        }
      })

      // Completion events
      eventSource.addEventListener('completion', (e) => {
        try {
          const data: SSECompletion = JSON.parse(e.data)
          data.timestamp = new Date()
          
          const event: SSEEvent = { type: 'completion', data }
          setEvents(prev => [event, ...prev].slice(0, 100))
          
          if (onCompletion) {
            onCompletion(data)
          }
          
          console.log('🎉 SSE Completion:', data)
        } catch (err) {
          console.error('❌ SSE: Failed to parse completion event:', err)
        }
      })

      // Error events
      eventSource.addEventListener('error_event', (e) => {
        try {
          const data: SSEError = JSON.parse(e.data)
          data.timestamp = new Date()
          
          const event: SSEEvent = { type: 'error', data }
          setEvents(prev => [event, ...prev].slice(0, 100))
          
          if (onError) {
            onError(data)
          }
          
          console.log('❌ SSE Error:', data)
        } catch (err) {
          console.error('❌ SSE: Failed to parse error event:', err)
        }
      })

      // Heartbeat events (keep connection alive)
      eventSource.addEventListener('heartbeat', (e) => {
        try {
          const data = JSON.parse(e.data)
          const heartbeatTime = new Date()
          setLastHeartbeat(heartbeatTime)
          
          const event: SSEEvent = { type: 'heartbeat', data: { timestamp: data.timestamp } }
          // Don't add heartbeats to events list (too noisy)
          
          console.log('💓 SSE Heartbeat:', heartbeatTime.toISOString())
        } catch (err) {
          console.error('❌ SSE: Failed to parse heartbeat:', err)
        }
      })

      // Connection error or closed
      eventSource.onerror = (err) => {
        console.error('❌ SSE: Connection error:', err)
        setConnectionStatus('error')
        
        // Close the connection
        eventSource.close()
        eventSourceRef.current = null

        // Attempt to reconnect
        setReconnectAttempts(prev => prev + 1)
        
        console.log(`🔄 SSE: Reconnecting in ${reconnectInterval}ms (attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})...`)
        
        reconnectTimeoutRef.current = setTimeout(() => {
          connect()
        }, reconnectInterval)
      }
    } catch (err) {
      console.error('❌ SSE: Failed to create EventSource:', err)
      setConnectionStatus('error')
      
      // Retry connection
      setReconnectAttempts(prev => prev + 1)
      reconnectTimeoutRef.current = setTimeout(() => {
        connect()
      }, reconnectInterval)
    }
  }, [reconnectAttempts, maxReconnectAttempts, reconnectInterval, onProgress, onStage, onCompletion, onError])

  // Connect on mount
  useEffect(() => {
    connect()

    // Cleanup on unmount
    return () => {
      console.log('🔌 SSE: Disconnecting...')
      
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      
      if (heartbeatTimeoutRef.current) {
        clearTimeout(heartbeatTimeoutRef.current)
        heartbeatTimeoutRef.current = null
      }
    }
  }, []) // Only run on mount/unmount

  return {
    events,
    connectionStatus,
    lastHeartbeat,
    reconnectAttempts,
    clearEvents
  }
}
