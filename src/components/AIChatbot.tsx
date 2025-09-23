import { useState, useRef, useEffect } from 'react'
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
  Package
} from '@phosphor-icons/react'
import { useKV } from '../hooks/useKV'

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
}

export function AIChatbot({ isOpen, isMinimized, onToggle, onMinimize, onClose }: AIChatbotProps) {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [messages, setMessages] = useKV<ChatMessage[]>('ai-chatbot-messages', [
    {
      id: '1',
      type: 'assistant',
      content: "Hello! I'm your PO Manager Pro AI assistant. I can help you automate purchase order processing, schedule syncs, configure suppliers, analyze data, and much more. What would you like to accomplish today?",
      timestamp: new Date().toISOString(),
      suggestions: [
        "Set up automated PO processing for TechnoSupply Co.",
        "Analyze today's purchase order patterns",
        "Schedule weekly syncs for all suppliers",
        "Configure bulk upload with 30% markup rules"
      ]
    }
  ])
  
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

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString()
    }

    setMessages(prev => [...(prev || []), userMessage])
    setInput('')
    setIsLoading(true)

    try {
      // Create AI prompt for PO Manager Pro context
      const prompt = (window as any).spark.llmPrompt`You are an AI assistant for PO Manager Pro, an advanced Shopify purchase order management system with AI-powered automation. The user just said: "${input.trim()}"

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

      const response = await (window as any).spark.llm(prompt)
      
      // Parse response and suggestions
      const parts = response.split('SUGGESTIONS:')
      const mainResponse = parts[0].trim()
      const suggestionsText = parts[1]?.trim() || ''
      
      const suggestions = suggestionsText
        .split('\n')
        .filter(line => line.trim().startsWith('- '))
        .map(line => line.trim().substring(2))
        .filter(Boolean)

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: mainResponse,
        timestamp: new Date().toISOString(),
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        actionable: true
      }

      setMessages(prev => [...(prev || []), assistantMessage])
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: "I apologize, but I encountered an error processing your request. Please try again or contact support if the issue persists.",
        timestamp: new Date().toISOString()
      }
      setMessages(prev => [...(prev || []), errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion)
    inputRef.current?.focus()
  }

  const quickActions = [
    { icon: Upload, label: "Process PO", prompt: "Help me set up automated processing for new purchase orders" },
    { icon: Calendar, label: "Schedule Sync", prompt: "Configure automated supplier synchronization schedules" },
    { icon: TrendUp, label: "Analytics", prompt: "Show me insights about my purchase order patterns and supplier performance" },
    { icon: Gear, label: "Configure", prompt: "Help me configure bulk upload rules and pricing strategies" },
    { icon: Users, label: "Suppliers", prompt: "Manage my supplier connections and performance settings" },
    { icon: Database, label: "Optimize", prompt: "Analyze my current setup and suggest workflow optimizations" }
  ]

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
      <Card className="w-96 h-[600px] shadow-2xl border-2 border-border bg-card/95 backdrop-blur flex flex-col">
        {/* Header */}
        <CardHeader className="pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Robot className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <CardTitle className="text-lg">PO Manager Pro AI</CardTitle>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  Online & Ready
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={onMinimize}>
                <Minus className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            {quickActions.map((action, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                className="h-auto p-2 flex flex-col items-center gap-1 text-xs"
                onClick={() => handleSuggestionClick(action.prompt)}
              >
                <action.icon className="w-4 h-4" />
                {action.label}
              </Button>
            ))}
          </div>
        </CardHeader>

        {/* Messages */}
        <CardContent className="flex-1 p-0 flex flex-col min-h-0">
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {(messages || []).map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] ${
                    message.type === 'user' 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted text-foreground border border-border'
                  } rounded-lg p-3 space-y-2`}>
                    <p className="text-sm leading-relaxed">{message.content}</p>
                    
                    {/* Suggestions */}
                    {message.suggestions && message.suggestions.length > 0 && (
                      <div className="space-y-2 border-t border-border/50 pt-2 mt-3">
                        <p className="text-xs text-muted-foreground font-medium">Suggestions:</p>
                        <div className="space-y-1">
                          {message.suggestions.map((suggestion, index) => (
                            <Button
                              key={index}
                              variant="ghost"
                              size="sm"
                              className="h-auto p-2 text-xs text-left justify-start w-full hover:bg-accent/10"
                              onClick={() => handleSuggestionClick(suggestion)}
                            >
                              <Lightning className="w-3 h-3 mr-2 flex-shrink-0" />
                              {suggestion}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <p className="text-xs opacity-60">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </motion.div>
              ))}
              
              {/* Loading indicator */}
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="bg-muted text-foreground border border-border rounded-lg p-3 max-w-[85%]">
                    <div className="flex items-center gap-2 text-sm">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                      </div>
                      AI thinking...
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
            <div ref={messagesEndRef} />
          </ScrollArea>

          {/* Input area */}
          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Ask me to automate anything..."
                disabled={isLoading}
                className="flex-1"
              />
              <Button
                onClick={handleSendMessage}
                disabled={!input.trim() || isLoading}
                size="sm"
                className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90"
              >
                <PaperPlaneTilt className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <p>Press Enter to send</p>
              <Badge variant="outline" className="gap-1 text-xs">
                <Sparkle className="w-3 h-3" />
                AI Powered
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
