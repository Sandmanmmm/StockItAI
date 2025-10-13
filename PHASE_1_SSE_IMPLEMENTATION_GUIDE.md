# Phase 1: Server-Sent Events Implementation Guide

## Quick Start (1-2 Hours)

### Step 1: Create SSE Endpoint

**File**: `api/src/routes/realtime.js`

```javascript
import express from 'express'
import { verifyShopifyRequest } from '../middleware/auth.js'
import { redisManager } from '../lib/redisManager.js'

const router = express.Router()

/**
 * SSE endpoint for real-time updates
 * GET /api/realtime/events
 */
router.get('/events', verifyShopifyRequest, async (req, res) => {
  const merchantId = req.session?.merchantId || req.query.merchantId
  
  if (!merchantId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  
  console.log(`📡 SSE connection established for merchant: ${merchantId}`)
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering
  
  // Send initial connection message
  res.write(`data: ${JSON.stringify({ 
    type: 'connected', 
    merchantId,
    timestamp: Date.now() 
  })}\n\n`)
  
  // Create Redis subscriber for this connection
  const subscriber = redisManager.createSubscriber()
  const channels = [
    `merchant:${merchantId}:progress`,
    `merchant:${merchantId}:stage`,
    `merchant:${merchantId}:completion`,
    `merchant:${merchantId}:error`
  ]
  
  try {
    await subscriber.subscribe(...channels)
    console.log(`✅ Subscribed to channels:`, channels)
    
    // Forward Redis messages to SSE client
    subscriber.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message)
        
        // Send as SSE event
        if (data.type) {
          res.write(`event: ${data.type}\n`)
        }
        res.write(`data: ${message}\n\n`)
        
        console.log(`📤 Sent SSE event [${channel}]:`, data.type)
      } catch (error) {
        console.error('❌ SSE message error:', error)
      }
    })
    
    // Heartbeat to keep connection alive (every 15s)
    const heartbeat = setInterval(() => {
      res.write(`: heartbeat ${Date.now()}\n\n`)
    }, 15000)
    
    // Cleanup on client disconnect
    req.on('close', () => {
      console.log(`🔌 SSE disconnected for merchant: ${merchantId}`)
      clearInterval(heartbeat)
      subscriber.unsubscribe(...channels)
      subscriber.disconnect()
      res.end()
    })
    
  } catch (error) {
    console.error('❌ SSE setup error:', error)
    res.status(500).end()
  }
})

export default router
```

### Step 2: Register Route in Server

**File**: `api/src/server.js`

```javascript
// Add import at top
import realtimeRouter from './routes/realtime.js'

// Add route registration (after other routes)
app.use('/api/realtime', realtimeRouter)
```

### Step 3: Add Redis Publisher Helper

**File**: `api/src/lib/redisManager.js`

Add these methods to the `RedisManager` class:

```javascript
/**
 * Create a new subscriber instance
 */
createSubscriber() {
  const subscriber = new Redis(this.connectionConfig)
  
  subscriber.on('error', (error) => {
    console.error('Redis subscriber error:', error)
  })
  
  return subscriber
}

/**
 * Publish progress update to merchant channel
 */
async publishMerchantProgress(merchantId, data) {
  try {
    const message = JSON.stringify({
      ...data,
      timestamp: Date.now()
    })
    
    await this.publisher.publish(`merchant:${merchantId}:progress`, message)
    console.log(`📢 Published progress for merchant ${merchantId}:`, data.type)
  } catch (error) {
    console.error('Failed to publish merchant progress:', error)
  }
}

/**
 * Publish stage change to merchant channel
 */
async publishMerchantStage(merchantId, data) {
  try {
    const message = JSON.stringify({
      ...data,
      timestamp: Date.now()
    })
    
    await this.publisher.publish(`merchant:${merchantId}:stage`, message)
  } catch (error) {
    console.error('Failed to publish merchant stage:', error)
  }
}

/**
 * Publish completion to merchant channel
 */
async publishMerchantCompletion(merchantId, data) {
  try {
    const message = JSON.stringify({
      ...data,
      timestamp: Date.now()
    })
    
    await this.publisher.publish(`merchant:${merchantId}:completion`, message)
  } catch (error) {
    console.error('Failed to publish merchant completion:', error)
  }
}

/**
 * Publish error to merchant channel
 */
async publishMerchantError(merchantId, data) {
  try {
    const message = JSON.stringify({
      ...data,
      timestamp: Date.now()
    })
    
    await this.publisher.publish(`merchant:${merchantId}:error`, message)
  } catch (error) {
    console.error('Failed to publish merchant error:', error)
  }
}
```

### Step 4: Integrate with Workflow Orchestrator

**File**: `api/src/lib/workflowOrchestrator.js`

Add publishing calls at key points:

```javascript
import { redisManager } from './redisManager.js'

// At start of processAIParsing
async processAIParsing(job) {
  const { merchantId, purchaseOrderId, workflowId } = job.data.data
  
  // Publish stage start
  await redisManager.publishMerchantStage(merchantId, {
    type: 'stage',
    stage: 'ai_parsing',
    poId: purchaseOrderId,
    workflowId,
    status: 'started',
    message: 'AI parsing started'
  })
  
  try {
    // ... existing AI parsing code ...
    
    // Publish completion
    await redisManager.publishMerchantCompletion(merchantId, {
      type: 'completion',
      stage: 'ai_parsing',
      poId: purchaseOrderId,
      workflowId,
      lineItems: result.lineItems.length,
      confidence: result.confidence
    })
    
  } catch (error) {
    // Publish error
    await redisManager.publishMerchantError(merchantId, {
      type: 'error',
      stage: 'ai_parsing',
      poId: purchaseOrderId,
      workflowId,
      error: error.message
    })
    throw error
  }
}

// At progress points in processing
async updateProgress(merchantId, poId, progress, message) {
  await redisManager.publishMerchantProgress(merchantId, {
    type: 'progress',
    poId,
    progress,
    message
  })
}
```

### Step 5: Frontend SSE Hook

**File**: `src/hooks/useSSEUpdates.ts`

```typescript
import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'

export interface SSEProgressEvent {
  type: 'progress'
  poId: string
  workflowId?: string
  progress: number
  message: string
  timestamp: number
}

export interface SSEStageEvent {
  type: 'stage'
  stage: string
  poId: string
  workflowId?: string
  status: 'started' | 'completed'
  message: string
  timestamp: number
}

export interface SSECompletionEvent {
  type: 'completion'
  stage: string
  poId: string
  workflowId?: string
  lineItems?: number
  confidence?: number
  timestamp: number
}

export interface SSEErrorEvent {
  type: 'error'
  stage: string
  poId: string
  workflowId?: string
  error: string
  timestamp: number
}

export type SSEEvent = SSEProgressEvent | SSEStageEvent | SSECompletionEvent | SSEErrorEvent

export function useSSEUpdates() {
  const { merchant } = useAuth()
  const [events, setEvents] = useState<SSEEvent[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>()
  
  const connect = useCallback(() => {
    if (!merchant?.id) return
    
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }
    
    console.log('📡 Connecting to SSE...')
    
    const eventSource = new EventSource(
      `/api/realtime/events?merchantId=${merchant.id}`,
      { withCredentials: true }
    )
    
    eventSourceRef.current = eventSource
    
    eventSource.onopen = () => {
      console.log('✅ SSE connected')
      setIsConnected(true)
      setError(null)
    }
    
    // Listen for progress events
    eventSource.addEventListener('progress', (e) => {
      const data: SSEProgressEvent = JSON.parse(e.data)
      console.log('📊 Progress event:', data)
      setEvents(prev => [data, ...prev].slice(0, 100))
    })
    
    // Listen for stage events
    eventSource.addEventListener('stage', (e) => {
      const data: SSEStageEvent = JSON.parse(e.data)
      console.log('🎯 Stage event:', data)
      setEvents(prev => [data, ...prev].slice(0, 100))
    })
    
    // Listen for completion events
    eventSource.addEventListener('completion', (e) => {
      const data: SSECompletionEvent = JSON.parse(e.data)
      console.log('✅ Completion event:', data)
      setEvents(prev => [data, ...prev].slice(0, 100))
    })
    
    // Listen for error events
    eventSource.addEventListener('error', (e) => {
      const data: SSEErrorEvent = JSON.parse(e.data)
      console.error('❌ Error event:', data)
      setEvents(prev => [data, ...prev].slice(0, 100))
    })
    
    eventSource.onerror = (e) => {
      console.error('❌ SSE connection error:', e)
      setIsConnected(false)
      setError('Connection lost. Reconnecting...')
      
      // EventSource will auto-reconnect, but we'll track the state
      // Retry after 3 seconds if not reconnected
      reconnectTimeoutRef.current = setTimeout(() => {
        if (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED) {
          connect()
        }
      }, 3000)
    }
  }, [merchant?.id])
  
  useEffect(() => {
    connect()
    
    return () => {
      console.log('🔌 Closing SSE connection')
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [connect])
  
  const clearEvents = useCallback(() => {
    setEvents([])
  }, [])
  
  return { 
    events, 
    isConnected, 
    error,
    clearEvents,
    reconnect: connect
  }
}
```

### Step 6: Update RealTimeFeedback Component

**File**: `src/components/RealTimeFeedback.tsx`

```typescript
import { useSSEUpdates } from '@/hooks/useSSEUpdates'

export function RealTimeFeedback() {
  const { 
    events: sseEvents, 
    isConnected: sseConnected, 
    error: sseError 
  } = useSSEUpdates()
  
  // Merge SSE events with existing data
  const [activePOs, setActivePOs] = useState<POProgress[]>([])
  
  useEffect(() => {
    // Update PO progress from SSE events
    sseEvents.forEach(event => {
      if (event.type === 'progress' && event.poId) {
        setActivePOs(prev => prev.map(po => 
          po.id === event.poId 
            ? { ...po, progress: event.progress, stage: event.message }
            : po
        ))
      }
    })
  }, [sseEvents])
  
  return (
    <Card>
      {/* Connection status indicator */}
      <div className="flex items-center gap-2 mb-4">
        {sseConnected ? (
          <div className="flex items-center gap-2 text-green-600">
            <Wifi className="w-4 h-4" />
            <span className="text-sm">Live updates active</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-orange-600">
            <WifiOff className="w-4 h-4" />
            <span className="text-sm">Reconnecting...</span>
          </div>
        )}
      </div>
      
      {/* Rest of component */}
    </Card>
  )
}
```

---

## Testing Checklist

### Backend:
- [ ] SSE endpoint responds with correct headers
- [ ] Connection stays alive for >30 seconds
- [ ] Heartbeat messages are sent every 15s
- [ ] Redis pub/sub messages are forwarded to SSE
- [ ] Multiple concurrent connections work
- [ ] Cleanup happens on disconnect

### Frontend:
- [ ] EventSource connects successfully
- [ ] Progress events update UI in real-time
- [ ] Stage events are displayed
- [ ] Completion events trigger notifications
- [ ] Auto-reconnect works after disconnect
- [ ] No memory leaks on unmount

### End-to-End:
- [ ] Upload PO → see real-time progress
- [ ] Multiple POs show independent progress
- [ ] Network interruption auto-recovers
- [ ] Browser tab sleep/wake reconnects

---

## Debugging

### Check SSE Connection:
```bash
# Terminal test
curl -N -H "Accept: text/event-stream" \
  "http://localhost:3001/api/realtime/events?merchantId=TEST"
```

### Publish Test Message:
```javascript
// In Node.js REPL or debug script
const Redis = require('ioredis')
const redis = new Redis(process.env.REDIS_URL)

await redis.publish('merchant:TEST:progress', JSON.stringify({
  type: 'progress',
  poId: 'test123',
  progress: 50,
  message: 'Test message',
  timestamp: Date.now()
}))
```

### Browser DevTools:
```javascript
// Check EventSource connection
const es = new EventSource('/api/realtime/events?merchantId=YOUR_ID')
es.addEventListener('progress', (e) => console.log('Progress:', e.data))
es.addEventListener('stage', (e) => console.log('Stage:', e.data))
```

---

## Performance Considerations

### Vercel Limits:
- Max function execution: 300s (5 minutes)
- Connection will be terminated after 5 minutes
- Client must reconnect automatically
- Use heartbeat to detect stale connections

### Scaling:
- Redis pub/sub handles fan-out to multiple connections
- Each SSE connection = 1 function instance
- Typical: 1-10 connections per merchant
- Monitor Redis pub/sub message rate

### Memory:
- Keep event buffer small (100 events max)
- Clean up old events regularly
- Use weak references for temporary data

---

## Next Steps After Phase 1

Once SSE is working:
1. ✅ Add granular progress publishing (Phase 2)
2. ✅ Implement ETA calculation (Phase 3)
3. ✅ Build performance dashboard (Phase 4)

---

## Estimated Timeline

- **Backend setup**: 30 minutes
- **Frontend hook**: 30 minutes
- **Integration**: 1 hour
- **Testing**: 1 hour
- **Total**: 3 hours

Let me know when you're ready to start implementing!
