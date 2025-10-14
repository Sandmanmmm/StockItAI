import React, { useEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, AlertCircle, Info } from 'lucide-react'
import type { ProcessingLog } from '@/hooks/useRealtimePOData'

interface ProcessingLogStreamProps {
  logs: ProcessingLog[]
  autoScroll?: boolean
}

export function ProcessingLogStream({ logs, autoScroll = true }: ProcessingLogStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  
  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && scrollAreaRef.current) {
      // Find the viewport div inside ScrollArea
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight
      }
    }
  }, [logs, autoScroll])
  
  const getIcon = (severity: ProcessingLog['severity']) => {
    switch (severity) {
      case 'success': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />
      case 'error': return <AlertCircle className="w-4 h-4 text-red-500" />
      case 'warning': return <AlertCircle className="w-4 h-4 text-amber-500" />
      default: return <Info className="w-4 h-4 text-blue-500" />
    }
  }
  
  const getStageEmoji = (stage: string) => {
    switch (stage) {
      case 'ai_parsing': return '🤖'
      case 'database_save': return '💾'
      case 'shopify_sync': return '📦'
      case 'product_draft_creation': return '📦'
      default: return '📊'
    }
  }
  
  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }
  
  return (
    <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden shadow-lg">
      {/* Header */}
      <div className="px-4 py-2 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
          <span className="text-sm font-semibold text-slate-200">Processing Log</span>
        </div>
        <Badge variant="outline" className="font-mono text-xs border-slate-600 text-slate-300 bg-slate-800">
          {logs.length} events
        </Badge>
      </div>
      
      {/* Log Stream */}
      <ScrollArea className="h-[300px]" ref={scrollAreaRef}>
        <div className="p-4 space-y-1 font-mono text-sm" ref={scrollRef}>
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-2 hover:bg-slate-800/50 px-2 py-1.5 rounded transition-colors group"
            >
              {/* Timestamp */}
              <span className="text-slate-500 text-xs whitespace-nowrap mt-0.5 font-medium">
                [{formatTimestamp(log.timestamp)}]
              </span>
              
              {/* Stage Emoji */}
              <span className="text-base leading-none mt-0.5">
                {getStageEmoji(log.stage)}
              </span>
              
              {/* Icon */}
              <span className="mt-0.5">
                {getIcon(log.severity)}
              </span>
              
              {/* Message */}
              <span className={`flex-1 leading-relaxed ${
                log.severity === 'success' ? 'text-emerald-400 font-medium' :
                log.severity === 'error' ? 'text-red-400 font-medium' :
                log.severity === 'warning' ? 'text-amber-400 font-medium' :
                'text-slate-300'
              }`}>
                {log.message}
              </span>
              
              {/* Progress % */}
              <span className="text-slate-500 text-xs font-bold whitespace-nowrap mt-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
                {log.progress}%
              </span>
            </div>
          ))}
          
          {logs.length === 0 && (
            <div className="text-center text-slate-500 py-12">
              <Info className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No processing logs yet</p>
              <p className="text-xs mt-1 opacity-70">Logs will appear here when processing starts</p>
            </div>
          )}
        </div>
      </ScrollArea>
      
      {/* Footer with helper text */}
      {logs.length > 0 && (
        <div className="px-4 py-1.5 bg-slate-800/50 border-t border-slate-700/50">
          <p className="text-xs text-slate-500 flex items-center justify-between">
            <span>Real-time progress updates</span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
              Live
            </span>
          </p>
        </div>
      )}
    </div>
  )
}
