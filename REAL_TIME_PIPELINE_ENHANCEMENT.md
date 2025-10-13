# Real-Time Pipeline Enhancement Plan

## Current State Analysis

### ✅ What's Already Implemented:
1. **Supabase Realtime** (`useRealtimePOData.ts`)
   - Postgres LISTEN/NOTIFY for PO status changes
   - 5-second polling fallback for active POs
   - Activity log tracking via database

2. **Redis Pub/Sub** (`redisManager.js`)
   - Job progress publication channel: `job:progress`
   - Job completion/failure channels
   - **Issue**: Not connected to frontend (no WebSocket bridge)

3. **Progress Tracking** 
   - PO `processingNotes` field stores JSON progress
   - Manual status updates in workflow stages
   - **Issue**: Coarse-grained (5-30% jumps), not real-time

4. **API Endpoints**
   - `/api/workflow/:workflowId/progress` - No-cache headers ✅
   - `/api/monitoring/metrics/live` - Live queue stats
   - `/api/job-monitoring/job-progress/:uploadId` - Job status

### ❌ Current Limitations:

1. **No Server-Sent Events (SSE) / WebSocket**
   - Frontend polls every 5 seconds (high latency)
   - No push notifications from server
   - Redis pub/sub not exposed to clients

2. **Progress Updates Are Manual**
   - Only updated at stage boundaries (ai_parsing → database_save)
   - No sub-stage progress (e.g., "Chunk 2/3 processing...")
   - **Missing**: PDF parsing progress, OpenAI API call progress, chunk-by-chunk updates

3. **No Time Estimates**
   - No ETA calculation based on historical data
   - No "X seconds remaining" feedback
   - No average processing time metrics

4. **Limited Performance Metrics**
   - No throughput tracking (items/second)
   - No stage timing analytics
   - No bottleneck identification

## Enhancement Roadmap

### Phase 1: Server-Sent Events (SSE) Implementation
**Priority: HIGH** | **Effort: Medium** | **Impact: HIGH**

#### Why SSE over WebSocket?
- ✅ Simpler to implement (HTTP-based)
- ✅ Auto-reconnection built-in
- ✅ Works with Vercel serverless (no persistent connections needed)
- ✅ Better for one-way server → client communication
- ✅ Lower overhead than WebSocket for this use case

#### Implementation:

**Backend: New SSE Endpoint**
```javascript
// api/src/routes/realtime.js
import express from 'express'
import { redisManager } from '../lib/redisManager.js'

const router = express.Router()

router.get('/events/:merchantId', async (req, res) => {
  const { merchantId } = req.params
  
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering
  
  // Send initial connection confirmation
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`)
  
  // Subscribe to Redis pub/sub for this merchant
  const subscriber = redisManager.createSubscriber()
  const channels = [
    `merchant:${merchantId}:progress`,
    `merchant:${merchantId}:stage`,
    `merchant:${merchantId}:completion`
  ]
  
  await subscriber.subscribe(...channels)
  
  // Forward Redis messages to SSE client
  subscriber.on('message', (channel, message) => {
    try {
      const data = JSON.parse(message)
      res.write(`event: ${data.type}\n`)
      res.write(`data: ${message}\n\n`)
    } catch (error) {
      console.error('SSE message error:', error)
    }
  })
  
  // Heartbeat to keep connection alive (every 30s)
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`)
  }, 30000)
  
  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat)
    subscriber.unsubscribe()
    subscriber.disconnect()
    res.end()
  })
})

export default router
```

**Frontend: SSE Hook**
```typescript
// src/hooks/useSSEUpdates.ts
import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'

interface SSEEvent {
  type: 'progress' | 'stage' | 'completion' | 'error'
  poId?: string
  workflowId?: string
  progress?: number
  stage?: string
  itemsProcessed?: number
  totalItems?: number
  timestamp: number
}

export function useSSEUpdates() {
  const { merchant } = useAuth()
  const [events, setEvents] = useState<SSEEvent[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  useEffect(() => {
    if (!merchant?.id) return
    
    const eventSource = new EventSource(
      `/api/realtime/events/${merchant.id}`,
      { withCredentials: true }
    )
    
    eventSource.onopen = () => {
      console.log('✅ SSE connected')
      setIsConnected(true)
      setError(null)
    }
    
    eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data)
      setEvents(prev => [data, ...prev].slice(0, 100))
    })
    
    eventSource.addEventListener('stage', (e) => {
      const data = JSON.parse(e.data)
      setEvents(prev => [data, ...prev].slice(0, 100))
    })
    
    eventSource.addEventListener('completion', (e) => {
      const data = JSON.parse(e.data)
      setEvents(prev => [data, ...prev].slice(0, 100))
    })
    
    eventSource.onerror = (e) => {
      console.error('❌ SSE error:', e)
      setIsConnected(false)
      setError('Connection lost. Reconnecting...')
      
      // EventSource will auto-reconnect
    }
    
    return () => {
      eventSource.close()
    }
  }, [merchant?.id])
  
  return { events, isConnected, error }
}
```

---

### Phase 2: Granular Progress Tracking
**Priority: HIGH** | **Effort: Medium** | **Impact: HIGH**

#### Enhanced Progress Updates at Each Sub-Stage:

**1. PDF Parsing Progress**
```javascript
// api/src/lib/fileParsingService.js
async parsePDF(buffer, publishProgress) {
  const totalPages = await getPDFPageCount(buffer)
  
  for (let page = 1; page <= totalPages; page++) {
    const pageText = await extractPageText(buffer, page)
    
    // Publish progress for each page
    await publishProgress({
      stage: 'pdf_parsing',
      progress: Math.round((page / totalPages) * 20), // PDF parsing = 0-20%
      message: `Parsing page ${page}/${totalPages}`,
      timestamp: Date.now()
    })
  }
  
  return combinedText
}
```

**2. OpenAI Chunk Processing Progress**
```javascript
// api/src/lib/enhancedAIService.js - Update _processLargeDocument
async _processLargeDocument(text) {
  const chunks = this._splitIntoChunks(text)
  const totalChunks = chunks.length
  
  // Process first chunk
  const firstResponse = await this._processChunk(chunks[0], 1, totalChunks)
  await this._publishProgress({
    stage: 'ai_parsing',
    progress: 40 + Math.round((1 / totalChunks) * 40), // 40-80% range
    message: `Processed chunk 1/${totalChunks}`,
    chunkProgress: { current: 1, total: totalChunks }
  })
  
  // Process remaining chunks
  for (let i = 1; i < chunks.length; i++) {
    const chunkResponse = await this._processChunk(chunks[i], i + 1, totalChunks)
    
    await this._publishProgress({
      stage: 'ai_parsing',
      progress: 40 + Math.round(((i + 1) / totalChunks) * 40),
      message: `Processed chunk ${i + 1}/${totalChunks}`,
      chunkProgress: { current: i + 1, total: totalChunks }
    })
    
    // Small delay between chunks
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  
  return mergedResponse
}

async _publishProgress(data) {
  if (this.currentWorkflowId && this.currentMerchantId) {
    await redisManager.publish(
      `merchant:${this.currentMerchantId}:progress`,
      JSON.stringify({
        type: 'progress',
        workflowId: this.currentWorkflowId,
        ...data
      })
    )
  }
}
```

**3. Database Save Progress**
```javascript
// api/src/lib/workflowOrchestrator.js - Update processDatabaseSave
async processDatabaseSave(job) {
  const { lineItems } = job.data
  const totalItems = lineItems.length
  
  for (let i = 0; i < lineItems.length; i++) {
    await this._saveLineItem(lineItems[i])
    
    // Update progress every 10 items or on last item
    if (i % 10 === 0 || i === lineItems.length - 1) {
      await this._publishStageProgress({
        stage: 'database_save',
        progress: 80 + Math.round(((i + 1) / totalItems) * 10), // 80-90%
        message: `Saving items ${i + 1}/${totalItems}`,
        itemsProcessed: i + 1,
        totalItems
      })
    }
  }
}
```

---

### Phase 3: Time Estimation System
**Priority: MEDIUM** | **Effort: HIGH** | **Impact: MEDIUM**

#### Historical Performance Tracking:

**1. Store Stage Timing Data**
```javascript
// api/src/lib/performanceTracker.js
export class PerformanceTracker {
  async recordStageCompletion(stage, duration, metadata) {
    await prisma.stagePerformanceMetric.create({
      data: {
        stage,
        durationMs: duration,
        itemCount: metadata.itemCount,
        fileSize: metadata.fileSize,
        chunkCount: metadata.chunkCount,
        completedAt: new Date()
      }
    })
  }
  
  async getAverageStageDuration(stage, metadata) {
    // Get similar jobs (by file size / item count)
    const similar = await prisma.stagePerformanceMetric.findMany({
      where: {
        stage,
        fileSize: {
          gte: metadata.fileSize * 0.8,
          lte: metadata.fileSize * 1.2
        },
        completedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      },
      select: { durationMs: true }
    })
    
    if (similar.length === 0) {
      return this.getDefaultEstimate(stage, metadata)
    }
    
    // Calculate median duration
    const durations = similar.map(s => s.durationMs).sort((a, b) => a - b)
    return durations[Math.floor(durations.length / 2)]
  }
  
  getDefaultEstimate(stage, metadata) {
    // Fallback estimates based on file characteristics
    const baseTime = {
      pdf_parsing: 1000, // 1s per MB
      ai_parsing: 20000, // 20s per chunk
      database_save: 100 // 100ms per item
    }
    
    switch (stage) {
      case 'pdf_parsing':
        return baseTime.pdf_parsing * (metadata.fileSize / (1024 * 1024))
      case 'ai_parsing':
        return baseTime.ai_parsing * metadata.estimatedChunks
      case 'database_save':
        return baseTime.database_save * metadata.itemCount
      default:
        return 30000 // 30s default
    }
  }
}
```

**2. Real-Time ETA Calculation**
```javascript
// api/src/lib/etaCalculator.js
export class ETACalculator {
  constructor(performanceTracker) {
    this.tracker = performanceTracker
    this.stageStartTimes = new Map()
  }
  
  async startStage(stage, metadata) {
    this.stageStartTimes.set(stage, Date.now())
    
    const estimatedDuration = await this.tracker.getAverageStageDuration(stage, metadata)
    
    return {
      stage,
      estimatedDuration,
      estimatedCompletion: Date.now() + estimatedDuration
    }
  }
  
  async completeStage(stage, metadata) {
    const startTime = this.stageStartTimes.get(stage)
    if (!startTime) return
    
    const actualDuration = Date.now() - startTime
    await this.tracker.recordStageCompletion(stage, actualDuration, metadata)
    
    this.stageStartTimes.delete(stage)
  }
  
  async getRemainingTime(currentStage, progress, metadata) {
    const startTime = this.stageStartTimes.get(currentStage)
    if (!startTime) return null
    
    const elapsedTime = Date.now() - startTime
    const estimatedTotal = await this.tracker.getAverageStageDuration(currentStage, metadata)
    
    // Adjust estimate based on actual progress
    if (progress > 0) {
      const actualRate = elapsedTime / progress
      const remainingProgress = 100 - progress
      return actualRate * remainingProgress
    }
    
    return estimatedTotal - elapsedTime
  }
}
```

**3. Frontend ETA Display**
```typescript
// src/components/RealTimeFeedback.tsx - Add ETA display
{po.estimatedCompletion && (
  <div className="flex items-center gap-2 text-xs text-slate-600">
    <Clock className="w-3 h-3" />
    <span>~{formatDuration(po.estimatedCompletion - Date.now())} remaining</span>
  </div>
)}
```

---

### Phase 4: Performance Metrics Dashboard
**Priority: LOW** | **Effort: MEDIUM** | **Impact: MEDIUM**

#### Real-Time Throughput Tracking:

**1. Metrics Collection**
```javascript
// api/src/lib/metricsCollector.js
export class MetricsCollector {
  async recordThroughput(stage, itemsProcessed, durationMs) {
    const throughput = (itemsProcessed / durationMs) * 1000 // items per second
    
    await redisManager.zadd(
      `metrics:throughput:${stage}`,
      Date.now(),
      JSON.stringify({ throughput, timestamp: Date.now() })
    )
    
    // Keep only last hour of data
    const oneHourAgo = Date.now() - 60 * 60 * 1000
    await redisManager.zremrangebyscore(
      `metrics:throughput:${stage}`,
      '-inf',
      oneHourAgo
    )
  }
  
  async getCurrentThroughput(stage) {
    const data = await redisManager.zrange(
      `metrics:throughput:${stage}`,
      Date.now() - 5 * 60 * 1000, // Last 5 minutes
      '+inf',
      'BYSCORE'
    )
    
    const values = data.map(d => JSON.parse(d).throughput)
    return values.reduce((a, b) => a + b, 0) / values.length
  }
}
```

**2. Bottleneck Detection**
```javascript
// api/src/lib/bottleneckDetector.js
export class BottleneckDetector {
  async analyze() {
    const stages = ['pdf_parsing', 'ai_parsing', 'database_save', 'shopify_sync']
    const metrics = {}
    
    for (const stage of stages) {
      const avgDuration = await performanceTracker.getAverageStageDuration(stage, {})
      const throughput = await metricsCollector.getCurrentThroughput(stage)
      const queueLength = await queueMonitor.getQueueLength(stage)
      
      metrics[stage] = {
        avgDuration,
        throughput,
        queueLength,
        bottleneckScore: this.calculateBottleneckScore(avgDuration, queueLength)
      }
    }
    
    // Find stages with highest bottleneck score
    const bottlenecks = Object.entries(metrics)
      .filter(([_, m]) => m.bottleneckScore > 0.7)
      .sort(([_, a], [__, b]) => b.bottleneckScore - a.bottleneckScore)
    
    return {
      metrics,
      bottlenecks: bottlenecks.map(([stage, m]) => ({
        stage,
        severity: m.bottleneckScore > 0.9 ? 'critical' : 'warning',
        recommendation: this.getRecommendation(stage, m)
      }))
    }
  }
  
  getRecommendation(stage, metrics) {
    if (stage === 'ai_parsing' && metrics.avgDuration > 60000) {
      return 'Consider reducing chunk size or increasing OpenAI timeout'
    }
    if (stage === 'database_save' && metrics.queueLength > 100) {
      return 'Database connection pool may need increase'
    }
    return 'Monitor this stage closely'
  }
}
```

---

## Implementation Priority

### Week 1: SSE Foundation
- ✅ Create `/api/realtime/events/:merchantId` SSE endpoint
- ✅ Implement `useSSEUpdates()` hook
- ✅ Update `RealTimeFeedback` to use SSE
- ✅ Test with existing progress updates

### Week 2: Granular Progress
- ✅ Add progress publishing to PDF parsing
- ✅ Add chunk-by-chunk progress to OpenAI processing
- ✅ Add item-by-item progress to database save
- ✅ Test end-to-end progress tracking

### Week 3: Time Estimation
- ✅ Create `PerformanceTracker` service
- ✅ Add `stagePerformanceMetric` Prisma model
- ✅ Implement `ETACalculator`
- ✅ Display ETA in frontend

### Week 4: Performance Metrics
- ✅ Implement `MetricsCollector`
- ✅ Create bottleneck detection
- ✅ Build performance dashboard
- ✅ Add recommendations engine

---

## Expected Improvements

### Before:
- ❌ 5-second polling lag
- ❌ Coarse progress (10%, 50%, 90%)
- ❌ No time estimates
- ❌ No performance visibility

### After:
- ✅ **<100ms** real-time updates via SSE
- ✅ **1-2%** granular progress increments
- ✅ **±10s accuracy** ETA predictions
- ✅ **Live bottleneck detection** and recommendations

### User Experience:
```
Before: "Processing... 50% complete"
After:  "Parsing page 4/5... ~15 seconds remaining"

Before: "AI analyzing..."
After:  "Processing chunk 2/3 (67%)... ~8 seconds remaining"

Before: No visibility into performance
After:  "⚠️ AI parsing taking 2x normal time - check OpenAI API status"
```

---

## Technical Considerations

### Vercel Compatibility:
- ✅ **SSE works** on Vercel serverless (HTTP-based, no persistent connections)
- ⚠️ **Limitations**: 
  - Max connection time: 300s (5 minutes)
  - Must handle reconnections on client side
  - Use Redis pub/sub as intermediary (multiple function instances)

### Scaling:
- Redis pub/sub handles fan-out to multiple SSE connections
- Each merchant gets their own channel (isolation)
- Heartbeat keeps connections alive
- Auto-reconnect on disconnect

### Monitoring:
- Track SSE connection count
- Monitor Redis pub/sub message rate
- Alert on high reconnection rates
- Track message delivery latency

---

## Testing Plan

### Unit Tests:
- ✅ `PerformanceTracker` - timing calculations
- ✅ `ETACalculator` - remaining time accuracy
- ✅ `MetricsCollector` - throughput calculations
- ✅ Progress publishing - Redis pub/sub

### Integration Tests:
- ✅ SSE endpoint - connection lifecycle
- ✅ End-to-end workflow with progress tracking
- ✅ ETA accuracy over multiple jobs
- ✅ Bottleneck detection accuracy

### Load Tests:
- ✅ 100 concurrent SSE connections
- ✅ 1000 messages/second pub/sub rate
- ✅ Memory usage under sustained load
- ✅ Reconnection storm handling

---

## Success Metrics

### Technical:
- **Update latency**: <200ms from stage start to frontend display
- **ETA accuracy**: ±15 seconds for 90% of jobs
- **Throughput visibility**: Real-time items/second calculation
- **Connection stability**: <5% reconnection rate

### User Experience:
- **Perceived responsiveness**: 80% of users report "feels instant"
- **Reduced support tickets**: 50% decrease in "is it stuck?" inquiries
- **Power user adoption**: 70% of users check real-time dashboard regularly

---

## Next Steps

1. **Review this plan** with team
2. **Prioritize phases** based on business impact
3. **Create Jira tickets** for each sub-task
4. **Spike on SSE** in Vercel environment (1 day)
5. **Implement Phase 1** (Week 1)

Would you like me to start implementing any of these phases?
