import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  Calendar,
  Clock,
  Gear,
  Shield,
  Globe,
  FileText,
  Robot,
  Warning,
  Check,
  Info,
  Eye,
  EyeSlash,
  Play,
  TestTube,
  Database,
  Wrench,
  ChartLine,
  Cpu,
  Timer,
  ShieldCheck,
  X,
  Plus
} from '@phosphor-icons/react'
import { toast } from 'sonner'

interface ScheduleConfig {
  // Basic Info
  supplierName: string
  description: string
  category: 'electronics' | 'clothing' | 'home' | 'automotive' | 'industrial' | 'other'
  priority: 'low' | 'medium' | 'high' | 'critical'
  
  // Authentication
  authMethod: 'api_key' | 'oauth2' | 'basic_auth' | 'bearer_token' | 'custom_headers'
  apiKey: string
  apiSecret: string
  username: string
  password: string
  authUrl: string
  bearerToken: string
  customHeaders: { key: string; value: string }[]
  
  // Connection Settings  
  baseUrl: string
  endpoints: {
    orders: string
    products: string
    inventory: string
    status: string
  }
  
  // Schedule Settings
  frequency: 'every_15min' | 'every_30min' | 'hourly' | 'every_4h' | 'daily' | 'weekly' | 'monthly'
  time: string
  timezone: string
  enabled: boolean
  weekdays: string[]
  monthlyDay: number
  
  // AI Configuration
  aiModel: 'gpt-4o' | 'gpt-4o-mini'
  confidenceThreshold: number
  autoApprove: boolean
  parseInstructions: string
  fallbackToManual: boolean
  
  // Data Mapping
  fieldMappings: {
    sku: string
    quantity: string
    price: string
    supplier_code: string
    description: string
    category: string
  }
  
  // Advanced Options
  retryAttempts: number
  timeout: number
  rateLimit: number
  batchSize: number
  
  // Error Handling
  emailNotifications: boolean
  notificationEmail: string
  criticalErrorThreshold: number
  autoDisableOnErrors: boolean
  
  // Data Validation
  validatePricing: boolean
  priceVarianceThreshold: number
  requireApprovalAbove: number
  stockLevelChecks: boolean
}

interface ScheduleConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (config: ScheduleConfig) => void
}

const frequencyOptions = [
  { value: 'every_15min', label: 'Every 15 minutes', description: 'Real-time updates' },
  { value: 'every_30min', label: 'Every 30 minutes', description: 'High frequency' },
  { value: 'hourly', label: 'Hourly', description: 'Standard frequency' },
  { value: 'every_4h', label: 'Every 4 hours', description: 'Business hours only' },
  { value: 'daily', label: 'Daily', description: 'Once per day' },
  { value: 'weekly', label: 'Weekly', description: 'Weekly batch updates' },
  { value: 'monthly', label: 'Monthly', description: 'Monthly reconciliation' }
]

const weekdayOptions = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' }
]

export function ScheduleConfigDialog({ open, onOpenChange, onSave }: ScheduleConfigDialogProps) {
  const [activeTab, setActiveTab] = useState('basic')
  const [showPassword, setShowPassword] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testResults, setTestResults] = useState<{
    authentication: boolean
    connectivity: boolean
    dataFormat: boolean
    rateLimit: boolean
  } | null>(null)
  
  const [config, setConfig] = useState<ScheduleConfig>({
    supplierName: '',
    description: '',
    category: 'other',
    priority: 'medium',
    authMethod: 'api_key',
    apiKey: '',
    apiSecret: '',
    username: '',
    password: '',
    authUrl: '',
    bearerToken: '',
    customHeaders: [],
    baseUrl: '',
    endpoints: {
      orders: '/api/v1/orders',
      products: '/api/v1/products', 
      inventory: '/api/v1/inventory',
      status: '/api/v1/status'
    },
    frequency: 'daily',
    time: '09:00',
    timezone: 'America/New_York',
    enabled: true,
    weekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    monthlyDay: 1,
    aiModel: 'gpt-4o-mini',
    confidenceThreshold: 85,
    autoApprove: false,
    parseInstructions: '',
    fallbackToManual: true,
    fieldMappings: {
      sku: 'product_id',
      quantity: 'quantity_available',
      price: 'unit_price',
      supplier_code: 'supplier_sku',
      description: 'product_name',
      category: 'product_category'
    },
    retryAttempts: 3,
    timeout: 60,
    rateLimit: 60,
    batchSize: 100,
    emailNotifications: true,
    notificationEmail: '',
    criticalErrorThreshold: 5,
    autoDisableOnErrors: false,
    validatePricing: true,
    priceVarianceThreshold: 20,
    requireApprovalAbove: 1000,
    stockLevelChecks: true
  })

  const comprehensiveConnectionTest = async () => {
    setTestingConnection(true)
    setConnectionStatus('testing')
    setTestResults(null)
    
    // Simulate comprehensive testing
    try {
      const results = {
        authentication: false,
        connectivity: false,
        dataFormat: false,
        rateLimit: false
      }
      
      // Test authentication
      await new Promise(resolve => setTimeout(resolve, 800))
      results.authentication = Math.random() > 0.2
      setTestResults({...results})
      
      if (!results.authentication) {
        throw new Error('Authentication failed')
      }
      
      // Test connectivity
      await new Promise(resolve => setTimeout(resolve, 600))
      results.connectivity = Math.random() > 0.15
      setTestResults({...results})
      
      if (!results.connectivity) {
        throw new Error('Connection failed')
      }
      
      // Test data format
      await new Promise(resolve => setTimeout(resolve, 700))
      results.dataFormat = Math.random() > 0.1
      setTestResults({...results})
      
      // Test rate limits
      await new Promise(resolve => setTimeout(resolve, 500))
      results.rateLimit = Math.random() > 0.05
      setTestResults({...results})
      
      if (results.authentication && results.connectivity && results.dataFormat && results.rateLimit) {
        setConnectionStatus('success')
        toast.success('Comprehensive connection test passed! All systems operational.')
      } else {
        throw new Error('Some tests failed')
      }
      
    } catch (error) {
      setConnectionStatus('error')
      toast.error('Connection test failed. Please verify your configuration and try again.')
    } finally {
      setTestingConnection(false)
    }
  }

  const handleSave = () => {
    // Comprehensive validation
    const errors: string[] = []
    
    if (!config.supplierName) errors.push('Supplier name is required')
    if (!config.baseUrl) errors.push('Base API URL is required')
    
    if (config.authMethod === 'api_key' && !config.apiKey) {
      errors.push('API Key is required for API key authentication')
    }
    if (config.authMethod === 'basic_auth' && (!config.username || !config.password)) {
      errors.push('Username and password are required for basic authentication')
    }
    if (config.authMethod === 'oauth2' && (!config.apiKey || !config.apiSecret)) {
      errors.push('Client ID and Secret are required for OAuth 2.0')
    }
    if (config.authMethod === 'bearer_token' && !config.bearerToken) {
      errors.push('Bearer token is required for token authentication')
    }
    
    if (config.emailNotifications && !config.notificationEmail) {
      errors.push('Notification email is required when email notifications are enabled')
    }
    
    if (errors.length > 0) {
      toast.error(`Please fix the following errors:\n${errors.join('\n')}`)
      return
    }
    
    onSave(config)
    onOpenChange(false)
    toast.success('Schedule configuration saved successfully!')
  }

  const addCustomHeader = () => {
    setConfig({
      ...config,
      customHeaders: [...config.customHeaders, { key: '', value: '' }]
    })
  }

  const removeCustomHeader = (index: number) => {
    setConfig({
      ...config,
      customHeaders: config.customHeaders.filter((_, i) => i !== index)
    })
  }

  const updateCustomHeader = (index: number, field: 'key' | 'value', value: string) => {
    const headers = [...config.customHeaders]
    headers[index][field] = value
    setConfig({ ...config, customHeaders: headers })
  }

  const getConnectionStatusIcon = () => {
    switch (connectionStatus) {
      case 'testing':
        return <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      case 'success':
        return <Check className="w-4 h-4 text-success" />
      case 'error':
        return <Warning className="w-4 h-4 text-destructive" />
      default:
        return <TestTube className="w-4 h-4" />
    }
  }

  const renderTestResults = () => {
    if (!testResults) return null
    
    const tests = [
      { key: 'authentication', label: 'Authentication', icon: Shield },
      { key: 'connectivity', label: 'Connectivity', icon: Globe },
      { key: 'dataFormat', label: 'Data Format', icon: Database },
      { key: 'rateLimit', label: 'Rate Limits', icon: Timer }
    ]
    
    return (
      <motion.div 
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        className="space-y-2 mt-4"
      >
        {tests.map(test => {
          const Icon = test.icon
          const passed = testResults[test.key as keyof typeof testResults]
          return (
            <div key={test.key} className="flex items-center justify-between p-2 rounded border">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4" />
                <span className="text-sm">{test.label}</span>
              </div>
              {passed ? (
                <Check className="w-4 h-4 text-success" />
              ) : (
                <Warning className="w-4 h-4 text-destructive" />
              )}
            </div>
          )
        })}
      </motion.div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Calendar className="w-6 h-6 text-primary" />
            </div>
            <div>
              <span className="text-xl">Add New Sync Schedule</span>
              <p className="text-sm font-normal text-muted-foreground mt-1">
                Configure automated AI-powered purchase order retrieval and inventory synchronization
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-6">
          {/* Enhanced Tab Navigation */}
          <div className="w-64 flex-shrink-0">
            <nav className="space-y-1">
              {[
                { id: 'basic', label: 'Basic Information', icon: FileText, desc: 'Supplier details' },
                { id: 'auth', label: 'Authentication', icon: Shield, desc: 'Security & access' },
                { id: 'schedule', label: 'Schedule Config', icon: Clock, desc: 'Timing settings' },
                { id: 'ai', label: 'AI Processing', icon: Robot, desc: 'ML configuration' },
                { id: 'mapping', label: 'Data Mapping', icon: Database, desc: 'Field mappings' },
                { id: 'advanced', label: 'Advanced', icon: Gear, desc: 'Performance tuning' },
                { id: 'monitoring', label: 'Monitoring', icon: ChartLine, desc: 'Alerts & notifications' }
              ].map(tab => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      activeTab === tab.id 
                        ? 'bg-primary text-primary-foreground shadow-sm' 
                        : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-sm">{tab.label}</div>
                        <div className="text-xs opacity-80 truncate">{tab.desc}</div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="flex-1">
            <AnimatePresence mode="wait">
              {/* Basic Information Tab */}
              {activeTab === 'basic' && (
                <motion.div
                  key="basic"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        Supplier Information
                      </CardTitle>
                      <CardDescription>
                        Basic details about your supplier integration
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="supplier-name">Supplier Name *</Label>
                          <Input
                            id="supplier-name"
                            placeholder="e.g., TechnoSupply Co."
                            value={config.supplierName}
                            onChange={(e) => setConfig({...config, supplierName: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="category">Category</Label>
                          <Select
                            value={config.category}
                            onValueChange={(value: any) => setConfig({...config, category: value})}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="electronics">Electronics</SelectItem>
                              <SelectItem value="clothing">Clothing & Apparel</SelectItem>
                              <SelectItem value="home">Home & Garden</SelectItem>
                              <SelectItem value="automotive">Automotive</SelectItem>
                              <SelectItem value="industrial">Industrial</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                          id="description"
                          placeholder="Describe this supplier integration and any special considerations..."
                          value={config.description}
                          onChange={(e) => setConfig({...config, description: e.target.value})}
                          rows={3}
                        />
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="base-url">Base API URL *</Label>
                          <Input
                            id="base-url"
                            placeholder="https://api.supplier.com"
                            value={config.baseUrl}
                            onChange={(e) => setConfig({...config, baseUrl: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="priority">Priority Level</Label>
                          <Select
                            value={config.priority}
                            onValueChange={(value: any) => setConfig({...config, priority: value})}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low - Non-critical</SelectItem>
                              <SelectItem value="medium">Medium - Standard</SelectItem>
                              <SelectItem value="high">High - Important</SelectItem>
                              <SelectItem value="critical">Critical - Mission Critical</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <Separator />

                      <div>
                        <h4 className="font-medium mb-3">API Endpoints</h4>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-1">
                            <Label htmlFor="orders-endpoint">Orders Endpoint</Label>
                            <Input
                              id="orders-endpoint"
                              placeholder="/api/v1/orders"
                              value={config.endpoints.orders}
                              onChange={(e) => setConfig({
                                ...config, 
                                endpoints: {...config.endpoints, orders: e.target.value}
                              })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="products-endpoint">Products Endpoint</Label>
                            <Input
                              id="products-endpoint"
                              placeholder="/api/v1/products"
                              value={config.endpoints.products}
                              onChange={(e) => setConfig({
                                ...config, 
                                endpoints: {...config.endpoints, products: e.target.value}
                              })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="inventory-endpoint">Inventory Endpoint</Label>
                            <Input
                              id="inventory-endpoint"
                              placeholder="/api/v1/inventory"
                              value={config.endpoints.inventory}
                              onChange={(e) => setConfig({
                                ...config, 
                                endpoints: {...config.endpoints, inventory: e.target.value}
                              })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="status-endpoint">Status Check Endpoint</Label>
                            <Input
                              id="status-endpoint"
                              placeholder="/api/v1/status"
                              value={config.endpoints.status}
                              onChange={(e) => setConfig({
                                ...config, 
                                endpoints: {...config.endpoints, status: e.target.value}
                              })}
                            />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Authentication Tab */}
              {activeTab === 'auth' && (
                <motion.div
                  key="auth"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Shield className="w-5 h-5" />
                        Authentication Configuration
                      </CardTitle>
                      <CardDescription>
                        Configure secure authentication for your supplier's API
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="space-y-3">
                        <Label>Authentication Method</Label>
                        <Select
                          value={config.authMethod}
                          onValueChange={(value: any) => setConfig({...config, authMethod: value})}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="api_key">API Key</SelectItem>
                            <SelectItem value="oauth2">OAuth 2.0</SelectItem>
                            <SelectItem value="basic_auth">Basic Authentication</SelectItem>
                            <SelectItem value="bearer_token">Bearer Token</SelectItem>
                            <SelectItem value="custom_headers">Custom Headers</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {config.authMethod === 'api_key' && (
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="api-key">API Key *</Label>
                            <div className="relative">
                              <Input
                                id="api-key"
                                type={showPassword ? "text" : "password"}
                                placeholder="Enter your API key"
                                value={config.apiKey}
                                onChange={(e) => setConfig({...config, apiKey: e.target.value})}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3"
                                onClick={() => setShowPassword(!showPassword)}
                              >
                                {showPassword ? <EyeSlash className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </Button>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="api-secret">API Secret (Optional)</Label>
                            <Input
                              id="api-secret"
                              type="password"
                              placeholder="Enter API secret if required"
                              value={config.apiSecret}
                              onChange={(e) => setConfig({...config, apiSecret: e.target.value})}
                            />
                          </div>
                        </div>
                      )}

                      <Separator />

                      {/* Enhanced Connection Testing */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-base font-medium">Connection Testing</Label>
                            <p className="text-sm text-muted-foreground">
                              Verify authentication and API connectivity
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            onClick={comprehensiveConnectionTest}
                            disabled={testingConnection}
                            className="flex items-center gap-2"
                          >
                            {getConnectionStatusIcon()}
                            {testingConnection ? 'Testing...' : 'Run Full Test'}
                          </Button>
                        </div>
                        
                        {renderTestResults()}
                        
                        {connectionStatus === 'success' && (
                          <Badge variant="default" className="bg-success text-success-foreground w-full justify-center py-2">
                            <ShieldCheck className="w-4 h-4 mr-2" />
                            All Connection Tests Passed
                          </Badge>
                        )}
                        {connectionStatus === 'error' && (
                          <Badge variant="destructive" className="w-full justify-center py-2">
                            <Warning className="w-4 h-4 mr-2" />
                            Connection Tests Failed
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Simplified placeholder tabs for remaining functionality */}
              {activeTab === 'schedule' && (
                <motion.div
                  key="schedule"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Clock className="w-5 h-5" />
                        Schedule Configuration
                      </CardTitle>
                      <CardDescription>Configure sync timing and frequency</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                          <Label>Frequency</Label>
                          <Select
                            value={config.frequency}
                            onValueChange={(value: any) => setConfig({...config, frequency: value})}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {frequencyOptions.map(option => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Time</Label>
                          <Input
                            type="time"
                            value={config.time}
                            onChange={(e) => setConfig({...config, time: e.target.value})}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Timezone</Label>
                          <Select
                            value={config.timezone}
                            onValueChange={(value) => setConfig({...config, timezone: value})}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="America/New_York">Eastern Time</SelectItem>
                              <SelectItem value="America/Chicago">Central Time</SelectItem>
                              <SelectItem value="America/Denver">Mountain Time</SelectItem>
                              <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {activeTab === 'ai' && (
                <motion.div
                  key="ai"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Robot className="w-5 h-5" />
                        AI Configuration
                      </CardTitle>
                      <CardDescription>Configure AI processing settings</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>AI Model</Label>
                          <Select
                            value={config.aiModel}
                            onValueChange={(value: any) => setConfig({...config, aiModel: value})}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="gpt-4o">GPT-4o (More Accurate)</SelectItem>
                              <SelectItem value="gpt-4o-mini">GPT-4o Mini (Faster)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Confidence Threshold: {config.confidenceThreshold}%</Label>
                          <input
                            type="range"
                            min="50"
                            max="99"
                            value={config.confidenceThreshold}
                            onChange={(e) => setConfig({...config, confidenceThreshold: Number(e.target.value)})}
                            className="w-full"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {activeTab === 'mapping' && (
                <motion.div
                  key="mapping"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Database className="w-5 h-5" />
                        Data Mapping
                      </CardTitle>
                      <CardDescription>Map supplier fields to Shopify fields</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>SKU Field</Label>
                          <Input
                            placeholder="product_id"
                            value={config.fieldMappings.sku}
                            onChange={(e) => setConfig({
                              ...config,
                              fieldMappings: {...config.fieldMappings, sku: e.target.value}
                            })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Quantity Field</Label>
                          <Input
                            placeholder="quantity_available"
                            value={config.fieldMappings.quantity}
                            onChange={(e) => setConfig({
                              ...config,
                              fieldMappings: {...config.fieldMappings, quantity: e.target.value}
                            })}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {activeTab === 'advanced' && (
                <motion.div
                  key="advanced"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Gear className="w-5 h-5" />
                        Advanced Settings
                      </CardTitle>
                      <CardDescription>Performance and retry configuration</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                          <Label>Retry Attempts</Label>
                          <Input
                            type="number"
                            min="1"
                            max="10"
                            value={config.retryAttempts}
                            onChange={(e) => setConfig({...config, retryAttempts: Number(e.target.value)})}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Timeout (seconds)</Label>
                          <Input
                            type="number"
                            min="10"
                            max="300"
                            value={config.timeout}
                            onChange={(e) => setConfig({...config, timeout: Number(e.target.value)})}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Rate Limit (req/min)</Label>
                          <Input
                            type="number"
                            min="1"
                            max="1000"
                            value={config.rateLimit}
                            onChange={(e) => setConfig({...config, rateLimit: Number(e.target.value)})}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {activeTab === 'monitoring' && (
                <motion.div
                  key="monitoring"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <ChartLine className="w-5 h-5" />
                        Monitoring & Alerts
                      </CardTitle>
                      <CardDescription>Configure notifications and error handling</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center space-x-3">
                        <Switch
                          id="email-notifications"
                          checked={config.emailNotifications}
                          onCheckedChange={(checked) => setConfig({...config, emailNotifications: checked})}
                        />
                        <Label htmlFor="email-notifications">Enable Email Notifications</Label>
                      </div>
                      {config.emailNotifications && (
                        <div className="space-y-2">
                          <Label>Notification Email</Label>
                          <Input
                            type="email"
                            placeholder="admin@yourstore.com"
                            value={config.notificationEmail}
                            onChange={(e) => setConfig({...config, notificationEmail: e.target.value})}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Enhanced Footer Actions */}
        <div className="flex items-center justify-between pt-6 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel Configuration
          </Button>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={comprehensiveConnectionTest}
              disabled={testingConnection}
              className="flex items-center gap-2"
            >
              {getConnectionStatusIcon()}
              {testingConnection ? 'Testing...' : 'Test & Validate'}
            </Button>
            <Button onClick={handleSave} className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90">
              <Play className="w-4 h-4 mr-2" />
              Create Schedule
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
