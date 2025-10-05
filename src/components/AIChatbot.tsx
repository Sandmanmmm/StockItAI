import { useState, useRef, useEffect, type ElementType } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  Robot, 
  X, 
  Minus, 
  PaperPlaneTilt, 
  Sparkle, 
  Lightning, 
  FileText,
  Calendar,
  Gear,
  Upload,
  Database,
  TrendUp,
  Users,
  Package,
  DownloadSimple,
  Trash,
  CopySimple,
  CheckCircle,
  WarningCircle,
  UserCircle
} from '@phosphor-icons/react'
import { useKV } from '../hooks/useKV'
import { authenticatedRequest } from '@/lib/shopifyApiService'
import { UnifiedSearchResponse } from '@/types/search'

interface ChatMessage {
  id: string
  type: 'user' | 'assistant'
  content: string
  timestamp: string
  suggestions?: string[]
  actionable?: boolean
}

interface AIChatbotProps {
  isOpen: boolean
  isMinimized: boolean
  onToggle: () => void
  onMinimize: () => void
  onClose: () => void
  onAction?: (action: ChatbotAction) => void
}

export type ChatbotAction =
  | { type: 'OPEN_DASHBOARD' }
  | { type: 'OPEN_QUICK_SYNC' }
  | { type: 'OPEN_ACTIVE_SUPPLIERS'; supplierId?: string }
  | { type: 'OPEN_ALL_PURCHASE_ORDERS' }
  | { type: 'OPEN_PURCHASE_ORDER'; purchaseOrderId: string; purchaseOrderNumber?: string }
  | { type: 'OPEN_SETTINGS' }
  | { type: 'OPEN_UPLOAD' }
  | { type: 'OPEN_NOTIFICATIONS' }

type ChatbotActionType = ChatbotAction['type']

interface DetectedIntent {
  type: ChatbotActionType
  query?: string
}

interface IntentResolution {
  action?: ChatbotAction
  message?: string
}

type SparkStatus = 'connected' | 'limited' | 'offline'

interface AutomationLogEntry {
  id: string
  type: ChatbotActionType
  label: string
  timestamp: string
  context?: string
}

const ACTION_LABELS: Record<ChatbotActionType, string> = {
  OPEN_DASHBOARD: 'Operations dashboard',
  OPEN_QUICK_SYNC: 'Quick Sync automation',
  OPEN_ACTIVE_SUPPLIERS: 'Active suppliers workspace',
  OPEN_ALL_PURCHASE_ORDERS: 'Purchase order archive',
  OPEN_PURCHASE_ORDER: 'Purchase order detail',
  OPEN_SETTINGS: 'Automation settings',
  OPEN_UPLOAD: 'Bulk upload center',
  OPEN_NOTIFICATIONS: 'Notification hub'
}

const generateMessageId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const createDefaultAssistantMessage = (): ChatMessage => ({
  id: generateMessageId(),
  type: 'assistant',
  content: "Hello! I'm your PO Manager Pro AI assistant. I can help you automate purchase order processing, schedule syncs, configure suppliers, analyze data, and much more. What would you like to accomplish today?",
  timestamp: new Date().toISOString(),
  suggestions: [
    "Set up automated PO processing for TechnoSupply Co.",
    "Analyze today's purchase order patterns",
    "Schedule weekly syncs for all suppliers",
    "Configure bulk upload with 30% markup rules"
  ]
})

const MIN_SEARCH_QUERY_LENGTH = 2

const sanitizeQuery = (value: string) => value.replace(/\s+/g, ' ').trim()

const extractPurchaseOrderQuery = (text: string): string | undefined => {
  if (!text) return undefined

  const quoted = text.match(/["'“”]([^"'“”]{2,})["'“”]/)
  if (quoted?.[1]) {
    return sanitizeQuery(quoted[1])
  }

  const poValue = text.match(/(po[-_#\s]*[a-z0-9-]+)/i)
  if (poValue?.[1]) {
    return sanitizeQuery(poValue[1])
  }

  const numberValue = text.match(/#(\d{3,})/)
  if (numberValue?.[1]) {
    return sanitizeQuery(numberValue[1])
  }

  return undefined
}

const extractSupplierQuery = (text: string): string | undefined => {
  if (!text) return undefined

  const quoted = text.match(/["'“”]([^"'“”]{2,})["'“”]/)
  if (quoted?.[1]) {
    return sanitizeQuery(quoted[1])
  }

  const supplierMatch = text.match(/(?:supplier|vendor)(?: named| called| for)? ([a-z0-9&'\-\s]+)/i)
  if (supplierMatch?.[1]) {
    return sanitizeQuery(supplierMatch[1])
  }

  return undefined
}

const detectDelegateIntent = (text: string, forced?: ChatbotActionType): DetectedIntent | null => {
  const normalized = text.toLowerCase()

  if (forced) {
    return {
      type: forced,
      query:
        forced === 'OPEN_PURCHASE_ORDER'
          ? extractPurchaseOrderQuery(text) ?? sanitizeQuery(text)
          : forced === 'OPEN_ACTIVE_SUPPLIERS'
          ? extractSupplierQuery(text)
          : undefined
    }
  }

  if (
    normalized.includes('quick sync') ||
    normalized.includes('run sync') ||
    normalized.includes('schedule sync') ||
    normalized.includes('start sync')
  ) {
    return { type: 'OPEN_QUICK_SYNC' }
  }

  if (normalized.includes('bulk upload') || normalized.includes('process po') || normalized.includes('upload') || normalized.includes('ingest')) {
    return { type: 'OPEN_UPLOAD' }
  }

  if (normalized.includes('notification') || normalized.includes('alert center') || normalized.includes('alerts')) {
    return { type: 'OPEN_NOTIFICATIONS' }
  }

  if (normalized.includes('settings') || normalized.includes('configure') || normalized.includes('configuration')) {
    return { type: 'OPEN_SETTINGS' }
  }

  if (normalized.includes('analytics') || normalized.includes('reports') || normalized.includes('insights')) {
    return { type: 'OPEN_DASHBOARD' }
  }

  if (normalized.includes('optimize') || normalized.includes('optimization')) {
    return { type: 'OPEN_DASHBOARD' }
  }

  if (normalized.includes('dashboard') || normalized.includes('overview') || normalized.includes('home screen')) {
    return { type: 'OPEN_DASHBOARD' }
  }

  if (normalized.includes('all purchase orders') || normalized.includes('purchase order list') || normalized.includes('purchase orders overview')) {
    return { type: 'OPEN_ALL_PURCHASE_ORDERS' }
  }

  if (normalized.includes('supplier') || normalized.includes('vendor')) {
    const supplierQuery = extractSupplierQuery(text)
    if (supplierQuery && supplierQuery.length >= MIN_SEARCH_QUERY_LENGTH) {
      return { type: 'OPEN_ACTIVE_SUPPLIERS', query: supplierQuery }
    }
    return { type: 'OPEN_ACTIVE_SUPPLIERS' }
  }

  if (
    normalized.includes('purchase order') ||
    normalized.includes(' po ') ||
    normalized.startsWith('po-') ||
    /po\d+/i.test(normalized)
  ) {
    const poQuery = extractPurchaseOrderQuery(text) ?? sanitizeQuery(text)
    return { type: 'OPEN_PURCHASE_ORDER', query: poQuery }
  }

  return null
}

const runUnifiedSearch = async (query: string): Promise<{ data?: UnifiedSearchResponse; error?: string }> => {
  const sanitized = sanitizeQuery(query)

  if (!sanitized || sanitized.length < MIN_SEARCH_QUERY_LENGTH) {
    return { data: undefined }
  }

  const response = await authenticatedRequest<UnifiedSearchResponse>(
    `/search?q=${encodeURIComponent(sanitized)}`
  )

  if (!response.success || !response.data) {
    return { error: response.error || 'search unavailable' }
  }

  return { data: response.data }
}

const resolveDelegateIntent = async (intent: DetectedIntent): Promise<IntentResolution> => {
  switch (intent.type) {
    case 'OPEN_DASHBOARD':
      return {
        action: { type: 'OPEN_DASHBOARD' },
        message: 'Returning you to the operations dashboard.'
      }
    case 'OPEN_QUICK_SYNC':
      return {
        action: { type: 'OPEN_QUICK_SYNC' },
        message: 'Launching the Quick Sync automation suite for you.'
      }
    case 'OPEN_UPLOAD':
      return {
        action: { type: 'OPEN_UPLOAD' },
        message: 'Opening the purchase order upload center to process new orders.'
      }
    case 'OPEN_SETTINGS':
      return {
        action: { type: 'OPEN_SETTINGS' },
        message: 'Redirecting to Settings so you can adjust automation rules.'
      }
    case 'OPEN_NOTIFICATIONS':
      return {
        action: { type: 'OPEN_NOTIFICATIONS' },
        message: 'Bringing up the latest system notifications.'
      }
    case 'OPEN_ALL_PURCHASE_ORDERS':
      return {
        action: { type: 'OPEN_ALL_PURCHASE_ORDERS' },
        message: 'Displaying the full purchase order archive.'
      }
    case 'OPEN_ACTIVE_SUPPLIERS': {
      if (intent.query) {
        const result = await runUnifiedSearch(intent.query)

        if (result.error) {
          return {
            message: `I couldn't access supplier search right now (${result.error}).`
          }
        }

        const supplier = result.data?.suppliers?.[0]

        if (supplier) {
          return {
            action: { type: 'OPEN_ACTIVE_SUPPLIERS', supplierId: supplier.id },
            message: `Opening supplier ${supplier.name} in Active Suppliers.`
          }
        }

        return {
          action: { type: 'OPEN_ACTIVE_SUPPLIERS' },
          message: `I couldn't find a supplier matching "${intent.query}", so I'll open the Active Suppliers workspace instead.`
        }
      }

      return {
        action: { type: 'OPEN_ACTIVE_SUPPLIERS' },
        message: 'Opening the Active Suppliers workspace.'
      }
    }
    case 'OPEN_PURCHASE_ORDER': {
      if (intent.query) {
        const result = await runUnifiedSearch(intent.query)

        if (result.error) {
          return {
            message: `I wasn't able to reach purchase order search (${result.error}).`
          }
        }

        const order = result.data?.purchaseOrders?.[0]

        if (order) {
          return {
            action: {
              type: 'OPEN_PURCHASE_ORDER',
              purchaseOrderId: order.id,
              purchaseOrderNumber: order.number
            },
            message: `Opening purchase order ${order.number || 'details'} now.`
          }
        }

        return {
          action: { type: 'OPEN_ALL_PURCHASE_ORDERS' },
          message: `I couldn't locate that exact purchase order, so I'll open the full purchase order list.`
        }
      }

      return {
        action: { type: 'OPEN_ALL_PURCHASE_ORDERS' },
        message: 'Opening the purchase order list so you can pick the right record.'
      }
    }
    default:
      return {}
  }
}

const getActionContext = (action: ChatbotAction, intent: DetectedIntent): string | undefined => {
  switch (action.type) {
    case 'OPEN_PURCHASE_ORDER':
      return action.purchaseOrderNumber || intent.query
    case 'OPEN_ACTIVE_SUPPLIERS':
      return intent.query
    case 'OPEN_ALL_PURCHASE_ORDERS':
      return intent.query
    default:
      return undefined
  }
}

export function AIChatbot({ isOpen, isMinimized, onToggle, onMinimize, onClose, onAction }: AIChatbotProps) {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [messages, setMessages] = useKV<ChatMessage[]>('ai-chatbot-messages', [createDefaultAssistantMessage()])
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const copyTimeoutRef = useRef<number>()
  const [sparkStatus, setSparkStatus] = useState<SparkStatus>('offline')
  const [automationLog, setAutomationLog] = useState<AutomationLogEntry[]>([])
  const automationLogRef = useRef<HTMLDivElement | null>(null)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, isMinimized])

  useEffect(() => () => {
    if (copyTimeoutRef.current) {
      window.clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    const evaluateSparkStatus = () => {
      const runtime = (window as any).spark
      if (runtime?.llm && runtime?.llmPrompt) {
        setSparkStatus('connected')
      } else if (runtime) {
        setSparkStatus('limited')
      } else {
        setSparkStatus('offline')
      }
    }

    evaluateSparkStatus()
    const intervalId = window.setInterval(evaluateSparkStatus, 5000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [isOpen])

  useEffect(() => {
    if (automationLog.length > 0) {
      automationLogRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [automationLog])

  const pushMessage = (message: ChatMessage) => {
    setMessages(prev => [...(prev || []), message])
  }

  const recordAutomationAction = (type: ChatbotActionType, context?: string) => {
    const label = ACTION_LABELS[type]
    const entry: AutomationLogEntry = {
      id: generateMessageId(),
      type,
      label,
      context,
      timestamp: new Date().toISOString()
    }

    setAutomationLog(prev => [entry, ...prev].slice(0, 12))
  }

  const formatTimestamp = (value: string) => {
    try {
      return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return value
    }
  }

  const handleCopyMessage = async (message: ChatMessage) => {
    try {
      await navigator.clipboard?.writeText(message.content)
      setCopiedMessageId(message.id)
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current)
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopiedMessageId(null)
      }, 1500)
    } catch (error) {
      console.error('Failed to copy message to clipboard:', error)
    }
  }

  const handleResetConversation = () => {
    if (isLoading) return
    const confirmed = window.confirm('Reset the AI conversation? This will clear your current chat history.')
    if (!confirmed) return

    setMessages([createDefaultAssistantMessage()])
    setAutomationLog([])
    setCopiedMessageId(null)
  }

  const handleExportTranscript = () => {
    try {
      const transcriptHeader = 'PO Manager Pro AI Transcript\n=============================';
      const transcriptBody = (messages || [])
        .map(message => {
          const time = formatTimestamp(message.timestamp)
          const speaker = message.type === 'assistant' ? 'Assistant' : 'You'
          const suggestions = message.suggestions?.length
            ? `\n  Suggestions:\n${message.suggestions.map(s => `    - ${s}`).join('\n')}`
            : ''
          return `[${time}] ${speaker}:\n${message.content}${suggestions}`
        })
        .join('\n\n')

      const automationSection = automationLog.length
        ? `\n\nAutomation Log:\n${automationLog
            .map(entry => {
              const time = formatTimestamp(entry.timestamp)
              const context = entry.context ? ` • ${entry.context}` : ''
              return `- [${time}] ${entry.label}${context}`
            })
            .join('\n')}`
        : ''

      const content = `${transcriptHeader}\n\n${transcriptBody}${automationSection}`
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `po-manager-pro-ai-${new Date().toISOString()}.txt`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export transcript:', error)
    }
  }

  const generateAssistantResponse = async (text: string): Promise<ChatMessage> => {
    const fallbackMessage: ChatMessage = {
      id: generateMessageId(),
      type: 'assistant',
      content: "I'm here to help, but I can't reach the PO Manager Pro AI service right now. Please verify your Spark integration and try again.",
      timestamp: new Date().toISOString()
    }

    const sparkRuntime = (window as any).spark

    if (!sparkRuntime?.llm || !sparkRuntime?.llmPrompt) {
      return fallbackMessage
    }

    try {
      const prompt = sparkRuntime.llmPrompt`You are an AI assistant for PO Manager Pro, an advanced Shopify purchase order management system with AI-powered automation. The user just said: "${text}"

Context about PO Manager Pro capabilities:
- AI-powered purchase order processing and parsing
- Automated supplier synchronization and scheduling  
- Bulk upload with configurable markup rules and pricing strategies
- Real-time inventory management and stock tracking
- Supplier relationship management and performance analytics
- Desktop notifications and alert systems
- Advanced reporting and analytics dashboards
- Quick sync functionality for immediate updates
- Purchase order history and detailed views
- Configuration management for suppliers, pricing, and automation rules

Respond as a helpful, professional AI assistant that can:
1. Help automate PO processing workflows
2. Configure suppliers and sync schedules  
3. Set up bulk processing rules and markup strategies
4. Provide analytics insights and recommendations
5. Troubleshoot issues and optimize processes
6. Guide users through complex configurations
7. Suggest workflow improvements and best practices

Provide a concise, actionable response (2-3 sentences max) and include 2-4 helpful suggestions for follow-up actions they might want to take. Format your response as regular text, then add suggestions at the end.

Response format:
[Your helpful response here]

SUGGESTIONS:
- [Suggestion 1]
- [Suggestion 2] 
- [Suggestion 3]
- [Suggestion 4]`

      const response = await sparkRuntime.llm(prompt)

      const parts = response.split('SUGGESTIONS:')
      const mainResponse = parts[0]?.trim() || ''
      const suggestionsText = parts[1]?.trim() || ''

      const suggestions = suggestionsText
        .split('\n')
        .filter(line => line.trim().startsWith('- '))
        .map(line => line.trim().substring(2))
        .filter(Boolean)

      return {
        id: generateMessageId(),
        type: 'assistant',
        content: mainResponse || "Here's what I recommend based on that request.",
        timestamp: new Date().toISOString(),
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        actionable: true
      }
    } catch (error) {
      return {
        id: generateMessageId(),
        type: 'assistant',
        content: error instanceof Error
          ? `I ran into an issue completing that request: ${error.message}`
          : 'I ran into an issue completing that request. Please try again.',
        timestamp: new Date().toISOString()
      }
    }
  }

  const processDelegateIntent = async (text: string, forced?: ChatbotActionType) => {
    const intent = detectDelegateIntent(text, forced)
    if (!intent) return

    const resolution = await resolveDelegateIntent(intent)

    if (resolution.message) {
      pushMessage({
        id: generateMessageId(),
        type: 'assistant',
        content: resolution.message,
        timestamp: new Date().toISOString()
      })
    }

    if (resolution.action) {
      const context = getActionContext(resolution.action, intent)
      recordAutomationAction(resolution.action.type, context)
      onAction?.(resolution.action)
    }
  }

  const processUserMessage = async (rawText: string, options?: { forcedActionType?: ChatbotActionType }) => {
    const text = rawText.trim()
    if (!text || isLoading) return

    const timestamp = new Date().toISOString()
    const messageId = generateMessageId()

    pushMessage({
      id: messageId,
      type: 'user',
      content: text,
      timestamp
    })

    setInput('')
    setIsLoading(true)

    try {
      await processDelegateIntent(text, options?.forcedActionType)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'unexpected error'
      pushMessage({
        id: generateMessageId(),
        type: 'assistant',
        content: `I couldn't complete that action automatically (${errorMessage}).`,
        timestamp: new Date().toISOString()
      })
    }

    try {
      const assistantMessage = await generateAssistantResponse(text)
      pushMessage(assistantMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSendMessage = () => {
    void processUserMessage(input)
  }

  const handleSuggestionClick = (suggestion: string) => {
    if (isLoading) return
    setInput(suggestion)
    inputRef.current?.focus()
  }

  const quickActions: Array<{
    icon: ElementType
    label: string
    description: string
    prompt: string
    actionType: ChatbotActionType
  }> = [
    {
      icon: Upload,
      label: 'Process POs',
      description: 'Automate parsing, enrichment, and sync for new purchase orders',
      prompt: 'Help me set up automated processing for new purchase orders',
      actionType: 'OPEN_UPLOAD'
    },
    {
      icon: Calendar,
      label: 'Schedule Syncs',
      description: 'Orchestrate supplier sync windows and notification cadence',
      prompt: 'Configure automated supplier synchronization schedules',
      actionType: 'OPEN_QUICK_SYNC'
    },
    {
      icon: TrendUp,
      label: 'Analytics Pulse',
      description: 'Surface actionable KPIs from purchase orders and suppliers',
      prompt: 'Show me insights about my purchase order patterns and supplier performance',
      actionType: 'OPEN_DASHBOARD'
    },
    {
      icon: Gear,
      label: 'Automation Rules',
      description: 'Tune bulk upload logic, markups, and exception handling',
      prompt: 'Help me configure bulk upload rules and pricing strategies',
      actionType: 'OPEN_SETTINGS'
    },
    {
      icon: Users,
      label: 'Supplier Ops',
      description: 'Navigate directly to supplier performance and collaboration hubs',
      prompt: 'Manage my supplier connections and performance settings',
      actionType: 'OPEN_ACTIVE_SUPPLIERS'
    },
    {
      icon: Database,
      label: 'Workflow Optimize',
      description: 'Audit current automation coverage and recommend improvements',
      prompt: 'Analyze my current setup and suggest workflow optimizations',
      actionType: 'OPEN_DASHBOARD'
    }
  ]

  const handleQuickAction = (action: (typeof quickActions)[number]) => {
    if (isLoading) return
    void processUserMessage(action.prompt, { forcedActionType: action.actionType })
  }

  const sparkBadge = (() => {
    switch (sparkStatus) {
      case 'connected':
        return {
          label: 'Spark connected',
          className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
          icon: <Sparkle className="w-3 h-3" />
        }
      case 'limited':
        return {
          label: 'Spark limited',
          className: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
          icon: <WarningCircle className="w-3 h-3" />
        }
      default:
        return {
          label: 'Spark offline',
          className: 'border-destructive/40 bg-destructive/10 text-destructive',
          icon: <WarningCircle className="w-3 h-3" />
        }
    }
  })()

  // Floating tab when closed
  if (!isOpen) {
    return (
      <motion.div
        className="fixed bottom-6 right-6 z-50"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
      >
        <Button
          onClick={onToggle}
          size="lg"
          className="h-14 w-14 rounded-full bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-lg border-2 border-background relative overflow-hidden group"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-primary to-accent opacity-0 group-hover:opacity-20 transition-opacity" />
          <Robot className="w-7 h-7 text-primary-foreground relative z-10" />
          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-success border-2 border-background animate-pulse" />
        </Button>
        
        {/* Pulsing hint */}
        <motion.div
          className="absolute -top-2 -left-20 bg-card border border-border rounded-lg px-3 py-1.5 text-sm whitespace-nowrap shadow-lg"
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 2, duration: 0.5 }}
        >
          <div className="flex items-center gap-2">
            <Sparkle className="w-4 h-4 text-accent" />
            AI Assistant
          </div>
          <div className="absolute top-1/2 -right-1 w-2 h-2 bg-card border-r border-b border-border rotate-45 transform -translate-y-1/2" />
        </motion.div>
      </motion.div>
    )
  }

  // Minimized state
  if (isMinimized) {
    return (
      <motion.div
        className="fixed bottom-6 right-6 z-50"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
      >
        <Card className="w-80 shadow-xl border-2 border-border bg-card/95 backdrop-blur">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <Robot className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <CardTitle className="text-base">PO Manager Pro AI</CardTitle>
                  <p className="text-xs text-muted-foreground">Ready to help</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={onToggle}>
                  <Package className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={onClose}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>
      </motion.div>
    )
  }

  // Full chat interface
  return (
    <motion.div
      className="fixed bottom-6 right-6 z-50"
      initial={{ scale: 0.8, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.8, opacity: 0, y: 20 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
    >
      <Card className="w-[min(96vw,900px)] h-[700px] lg:h-[760px] shadow-2xl border border-border/60 bg-gradient-to-br from-background/98 via-background/90 to-background/80 backdrop-blur-xl flex flex-col overflow-hidden">
        <CardHeader className="pb-4 border-b border-border/60 bg-gradient-to-r from-background/95 via-background/80 to-background/70">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-inner">
                <Robot className="w-5 h-5 text-primary-foreground" />
              </div>
              <div className="space-y-2">
                <div>
                  <CardTitle className="text-lg leading-tight">PO Manager Pro AI</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                    <Lightning className="w-3 h-3 text-accent" />
                    Delegating purchase order workflows
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={`gap-1 text-[11px] uppercase tracking-wide ${sparkBadge.className}`}>
                    {sparkBadge.icon}
                    {sparkBadge.label}
                  </Badge>
                  <Badge variant="outline" className="gap-1 text-[11px] uppercase tracking-wide border-primary/30 bg-primary/10 text-primary">
                    <CheckCircle className="w-3 h-3" />
                    Automations ready
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-lg"
                onClick={handleExportTranscript}
                aria-label="Export transcript"
              >
                <DownloadSimple className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-lg"
                onClick={handleResetConversation}
                aria-label="Reset conversation"
              >
                <Trash className="w-4 h-4" />
              </Button>
              <Separator orientation="vertical" className="mx-1 h-6 bg-border/60" />
              <Button
                variant="ghost"
                size="icon"
                className="rounded-lg"
                onClick={onMinimize}
                aria-label="Minimize chatbot"
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-lg"
                onClick={onClose}
                aria-label="Close chatbot"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 p-0 flex flex-col lg:flex-row min-h-0">
          <div className="border-b border-border/50 bg-background/85 px-5 pt-5 pb-4 lg:border-b-0 lg:border-r lg:px-6 lg:py-6 lg:w-[320px] xl:w-[360px] flex flex-col min-h-0">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
              <span className="flex items-center gap-2">
                <Lightning className="w-3 h-3 text-accent" />
                Command center
              </span>
              <Badge variant="outline" className="border-accent/40 bg-accent/10 text-accent">
                Live
              </Badge>
            </div>
            <ScrollArea className="flex-1 h-full mt-4 pr-2">
              <div className="grid grid-cols-1 gap-2">
                {quickActions.map((action) => (
                  <Button
                    key={action.label}
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-auto justify-start rounded-xl border border-border/40 bg-gradient-to-r from-background/95 via-background to-background/90 p-3 text-left shadow-sm transition-all hover:border-accent/60 hover:bg-accent/5"
                    onClick={() => handleQuickAction(action)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="rounded-md border border-border/40 bg-muted/70 p-2 text-muted-foreground">
                        <action.icon className="w-4 h-4" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">{action.label}</p>
                        <p className="text-xs leading-snug text-muted-foreground/90">{action.description}</p>
                      </div>
                    </div>
                  </Button>
                ))}
              </div>

              {automationLog.length > 0 && (
                <div className="mt-4 rounded-xl border border-border/50 bg-background/90 shadow-inner">
                  <div className="flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <Lightning className="w-3 h-3 text-accent" />
                      Automation activity
                    </span>
                    <Badge variant="outline" className="border-border/40 bg-background/70 text-muted-foreground">
                      {automationLog.length}
                    </Badge>
                  </div>
                  <ScrollArea ref={automationLogRef} className="max-h-32">
                    <div className="divide-y divide-border/50">
                      {automationLog.map((entry) => (
                        <div key={entry.id} className="flex items-start justify-between gap-3 px-3 py-2 text-xs text-muted-foreground">
                          <div className="space-y-1">
                            <p className="text-foreground font-medium">{entry.label}</p>
                            {entry.context && (
                              <p className="text-[11px] text-muted-foreground/80">Context: {entry.context}</p>
                            )}
                          </div>
                          <span className="whitespace-nowrap text-[11px]">{formatTimestamp(entry.timestamp)}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </ScrollArea>
          </div>

          <div className="flex-1 flex flex-col min-h-0 bg-background/90">
            <ScrollArea className="flex-1 h-full px-6 py-5">
              <div className="space-y-4">
                {(messages || []).map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex items-end gap-2 ${message.type === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full shadow-inner ${
                        message.type === 'assistant'
                          ? 'bg-primary/15 text-primary'
                          : 'bg-accent/15 text-accent-foreground'
                      }`}>
                        {message.type === 'assistant' ? (
                          <Robot className="h-4 w-4" />
                        ) : (
                          <UserCircle className="h-4 w-4" />
                        )}
                      </div>
                      <div className="max-w-[72%] space-y-2">
                        <div className={`rounded-2xl border p-4 shadow-sm transition-colors ${
                          message.type === 'user'
                            ? 'bg-gradient-to-r from-primary to-accent text-primary-foreground border-primary/30'
                            : 'bg-muted/70 text-foreground border-border/40'
                        }`}>
                          {message.actionable && message.type === 'assistant' && (
                            <Badge variant="outline" className="mb-2 text-[10px] uppercase tracking-wide border-primary/30 bg-primary/10 text-primary">
                              Automation-ready
                            </Badge>
                          )}
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                          {message.suggestions && message.suggestions.length > 0 && (
                            <div className="mt-3 space-y-1">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Suggested follow-ups</p>
                              <div className="flex flex-col gap-1">
                                {message.suggestions.map((suggestion, index) => (
                                  <Button
                                    key={index}
                                    variant="ghost"
                                    size="sm"
                                    className="h-auto justify-start gap-2 px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent/10"
                                    onClick={() => handleSuggestionClick(suggestion)}
                                  >
                                    <Lightning className="h-3 w-3 flex-shrink-0 text-accent" />
                                    {suggestion}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className={`flex items-center gap-2 text-[11px] text-muted-foreground/90 ${
                          message.type === 'user' ? 'justify-end flex-row-reverse gap-3' : 'justify-start'
                        }`}>
                          <span>{formatTimestamp(message.timestamp)}</span>
                          {message.type === 'assistant' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-auto gap-1 px-2 py-1 text-[11px]"
                              onClick={() => handleCopyMessage(message)}
                              aria-label="Copy response"
                            >
                              {copiedMessageId === message.id ? (
                                <>
                                  <CheckCircle className="h-3 w-3 text-success" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <CopySimple className="h-3 w-3" />
                                  Copy
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}

              {isLoading && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                  <div className="flex justify-start">
                    <div className="flex items-end gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary shadow-inner">
                        <Robot className="h-4 w-4" />
                      </div>
                      <div className="rounded-2xl border border-border/60 bg-muted/80 px-3 py-2 text-sm text-muted-foreground flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <div className="h-2 w-2 rounded-full bg-primary animate-bounce" />
                          <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0.12s' }} />
                          <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0.24s' }} />
                        </div>
                        Thinking through your request...
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
              </div>
              <div ref={messagesEndRef} />
            </ScrollArea>

            <div className="border-t border-border/70 bg-background/80 px-6 py-4">
              <div className="flex items-center gap-2">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                  placeholder="Delegate anything across PO Manager Pro..."
                  disabled={isLoading}
                  className="flex-1"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!input.trim() || isLoading}
                  size="sm"
                  className="shrink-0 rounded-lg bg-gradient-to-r from-primary to-accent px-3 py-2 text-primary-foreground hover:from-primary/90 hover:to-accent/90"
                  aria-label="Send message"
                >
                  <PaperPlaneTilt className="w-4 h-4" />
                </Button>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Press Enter to submit · Shift+Enter for newline</span>
                <Badge variant="outline" className="gap-1 text-[11px] border-primary/30 bg-primary/10 text-primary">
                  <Sparkle className="w-3 h-3" />
                  AI powered
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
