import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Gear,
  Users,
  Brain,
  Shield,
  Link,
  Check,
  Warning,
  Plus,
  Trash,
  Bell
} from '@phosphor-icons/react'
import { useKV } from '../hooks/useKV'
import { toast } from 'sonner'
import { safeFormatDateTime } from '@/lib/utils'
import { NotificationSettings } from './NotificationSettings'

interface SupplierConnection {
  id: string
  name: string
  type: 'api' | 'email' | 'ftp'
  status: 'connected' | 'disconnected' | 'error'
  lastSync: string // ISO string timestamp
}

interface AISettings {
  confidenceThreshold: number
  strictMatching: boolean
  autoApproveHigh: boolean
  learningMode: boolean
}

interface MappingRule {
  id: string
  pattern: string
  field: string
  action: string
}

interface SecurityStatus {
  configured: boolean
  shopDomain: string | null
  hasApiKey: boolean
  hasWebhookSecret: boolean
  dataEncryption: boolean
  auditLogging: boolean
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
}

const cardVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1 }
}

export function SettingsPanel() {
  const [suppliers, setSuppliers] = useKV<SupplierConnection[]>('supplier-connections', [
    {
      id: '1',
      name: 'TechnoSupply Co.',
      type: 'api',
      status: 'connected',
      lastSync: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    },
    {
      id: '2',
      name: 'Global Parts Ltd.',
      type: 'email',
      status: 'connected',
      lastSync: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString()
    },
    {
      id: '3',
      name: 'Premier Wholesale',
      type: 'ftp',
      status: 'error',
      lastSync: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    }
  ])

  // AI Settings state management (from database)
  const [aiSettings, setAISettings] = useState<AISettings>({
    confidenceThreshold: 85,
    strictMatching: false,
    autoApproveHigh: true,
    learningMode: true
  })
  
  const [isLoadingAISettings, setIsLoadingAISettings] = useState(true)
  const [isSavingAISettings, setIsSavingAISettings] = useState(false)

  // Mapping Rules state management (from database)
  const [mappingRules, setMappingRules] = useState<MappingRule[]>([])
  const [isLoadingMappingRules, setIsLoadingMappingRules] = useState(true)

  // Security state management
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus>({
    configured: false,
    shopDomain: null,
    hasApiKey: false,
    hasWebhookSecret: false,
    dataEncryption: true,
    auditLogging: true
  })
  
  const [shopifyApiKey, setShopifyApiKey] = useState('')
  const [shopifyWebhookSecret, setShopifyWebhookSecret] = useState('')
  const [shopifyShopDomain, setShopifyShopDomain] = useState('')
  const [isSavingCredentials, setIsSavingCredentials] = useState(false)
  const [isTestingConnection, setIsTestingConnection] = useState(false)

  // Load AI settings from database on mount
  useEffect(() => {
    const loadAISettings = async () => {
      try {
        setIsLoadingAISettings(true)
        const response = await fetch('/api/ai-settings')
        if (response.ok) {
          const result = await response.json()
          if (result.success && result.data) {
            // Convert confidenceThreshold from 0-1 to 0-100 for slider
            const settings = {
              confidenceThreshold: Math.round(result.data.confidenceThreshold * 100),
              strictMatching: result.data.strictMatching,
              autoApproveHigh: result.data.autoApproveHigh,
              learningMode: result.data.learningMode
            }
            setAISettings(settings)
          }
        }
      } catch (error) {
        console.error('Failed to load AI settings:', error)
        toast.error('Failed to load AI settings')
      } finally {
        setIsLoadingAISettings(false)
      }
    }
    loadAISettings()
  }, [])

  // Load mapping rules from database on mount
  useEffect(() => {
    const loadMappingRules = async () => {
      try {
        setIsLoadingMappingRules(true)
        const response = await fetch(`/api/refinement-config`)
        if (response.ok) {
          const result = await response.json()
          if (result.success && result.data?.categoryMappings) {
            // Convert backend format to frontend format
            const rules = result.data.categoryMappings.map((mapping: any) => ({
              id: mapping.id || Date.now().toString(),
              pattern: mapping.sourceCategory || mapping.sourcePattern || '',
              field: 'category',
              action: mapping.targetCollection || ''
            }))
            setMappingRules(rules)
          }
        }
      } catch (error) {
        console.error('Failed to load mapping rules:', error)
        toast.error('Failed to load mapping rules')
      } finally {
        setIsLoadingMappingRules(false)
      }
    }
    loadMappingRules()
  }, [])

  // Load security status on mount
  useEffect(() => {
    const loadSecurityStatus = async () => {
      try {
        const response = await fetch('/api/security/status')
        if (response.ok) {
          const data = await response.json()
          setSecurityStatus(data)
          if (data.shopDomain) {
            setShopifyShopDomain(data.shopDomain)
          }
        }
      } catch (error) {
        console.error('Failed to load security status:', error)
      }
    }
    loadSecurityStatus()
  }, [])

  const updateAISetting = async (key: keyof AISettings, value: any) => {
    // Update local state immediately for responsiveness
    const updatedSettings = { ...aiSettings, [key]: value }
    setAISettings(updatedSettings)

    // Save to database
    try {
      setIsSavingAISettings(true)
      
      // Convert confidenceThreshold from 0-100 to 0-1 for backend
      const backendSettings: any = { ...updatedSettings }
      if (key === 'confidenceThreshold') {
        backendSettings.confidenceThreshold = value / 100
      } else {
        backendSettings.confidenceThreshold = updatedSettings.confidenceThreshold / 100
      }

      const response = await fetch('/api/ai-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(backendSettings)
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to save AI settings')
      }

      toast.success('AI settings saved')
    } catch (error) {
      console.error('Error saving AI settings:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save AI settings')
      
      // Revert on error
      setAISettings(aiSettings)
    } finally {
      setIsSavingAISettings(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return (
          <Badge variant="default" className="gap-1 bg-success text-success-foreground">
            <Check className="w-3 h-3" />
            Connected
          </Badge>
        )
      case 'disconnected':
        return (
          <Badge variant="secondary" className="gap-1">
            <Warning className="w-3 h-3" />
            Disconnected
          </Badge>
        )
      case 'error':
        return (
          <Badge variant="destructive" className="gap-1">
            <Warning className="w-3 h-3" />
            Error
          </Badge>
        )
      default:
        return null
    }
  }

  const testConnection = (supplier: SupplierConnection) => {
    toast.success(`Testing connection to ${supplier.name}...`)
  }

  const addMappingRule = async () => {
    const newRule: MappingRule = {
      id: Date.now().toString(),
      pattern: '',
      field: 'category',
      action: ''
    }
    
    // Save to database first
    try {
      const response = await fetch(`/api/refinement-config/category-mappings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sourceCategory: newRule.pattern,
          sourcePattern: newRule.pattern,
          targetCollection: newRule.action
        })
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to add mapping rule')
      }

      // Add to local state with the actual ID from database
      const savedRule = {
        id: result.data.id,
        pattern: newRule.pattern,
        field: 'category' as const,
        action: newRule.action
      }
      setMappingRules([...mappingRules, savedRule])

      toast.success('Mapping rule added')
    } catch (error) {
      console.error('Error adding mapping rule:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to add mapping rule')
    }
  }

  const updateMappingRule = async (id: string, field: 'pattern' | 'action', value: string) => {
    // Update local state immediately
    const updatedRules = mappingRules.map(rule => 
      rule.id === id ? { ...rule, [field]: value } : rule
    )
    setMappingRules(updatedRules)
    
    // Find the updated rule
    const updatedRule = updatedRules.find(rule => rule.id === id)
    if (!updatedRule || !updatedRule.pattern || !updatedRule.action) {
      // Don't save incomplete rules
      return
    }
    
    // Save to database with debouncing
    try {
      const response = await fetch(`/api/refinement-config/category-mappings/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sourceCategory: updatedRule.pattern,
          sourcePattern: updatedRule.pattern,
          targetCollection: updatedRule.action
        })
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to update mapping rule')
      }
    } catch (error) {
      console.error('Error updating mapping rule:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to update mapping rule')
    }
  }

  const deleteMappingRule = async (id: string) => {
    // Remove from local state immediately
    const updatedRules = mappingRules.filter(rule => rule.id !== id)
    setMappingRules(updatedRules)
    
    // Delete from database
    try {
      const response = await fetch(`/api/refinement-config/category-mappings/${id}`, {
        method: 'DELETE'
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to delete mapping rule')
      }

      toast.success('Mapping rule deleted')
    } catch (error) {
      console.error('Error deleting mapping rule:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to delete mapping rule')
      
      // Revert on error
      setMappingRules(mappingRules)
    }
  }

  const testMappingRule = (pattern: string, testValue: string): boolean => {
    if (!pattern || !testValue) return false
    
    // Convert wildcard pattern to regex
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
      .replace(/\*/g, '.*') // Convert * to .*
    
    const regex = new RegExp(`^${regexPattern}$`, 'i')
    return regex.test(testValue)
  }

  // Security handlers
  const handleSaveCredentials = async () => {
    if (!shopifyApiKey || !shopifyShopDomain) {
      toast.error('Please provide both API key and shop domain')
      return
    }

    setIsSavingCredentials(true)
    try {
      const response = await fetch('/api/security/shopify-credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          apiKey: shopifyApiKey,
          webhookSecret: shopifyWebhookSecret || undefined,
          shopDomain: shopifyShopDomain
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save credentials')
      }

      toast.success('Credentials saved securely')
      
      // Clear form inputs
      setShopifyApiKey('')
      setShopifyWebhookSecret('')
      
      // Reload security status
      const statusResponse = await fetch('/api/security/status')
      if (statusResponse.ok) {
        const statusData = await statusResponse.json()
        setSecurityStatus(statusData)
      }
    } catch (error) {
      console.error('Error saving credentials:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save credentials')
    } finally {
      setIsSavingCredentials(false)
    }
  }

  const handleTestConnection = async () => {
    if (!securityStatus.hasApiKey) {
      toast.error('Please save your Shopify credentials first')
      return
    }

    setIsTestingConnection(true)
    try {
      const response = await fetch('/api/security/test-connection', {
        method: 'POST'
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Connection test failed')
      }

      toast.success(`Connected successfully to ${data.shop.name}`)
    } catch (error) {
      console.error('Error testing connection:', error)
      toast.error(error instanceof Error ? error.message : 'Connection test failed')
    } finally {
      setIsTestingConnection(false)
    }
  }

  const handleRemoveCredentials = async () => {
    if (!confirm('Are you sure you want to remove your Shopify credentials?')) {
      return
    }

    try {
      const response = await fetch('/api/security/shopify-credentials', {
        method: 'DELETE'
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to remove credentials')
      }

      toast.success('Credentials removed')
      
      // Reload security status
      const statusResponse = await fetch('/api/security/status')
      if (statusResponse.ok) {
        const statusData = await statusResponse.json()
        setSecurityStatus(statusData)
      }
    } catch (error) {
      console.error('Error removing credentials:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to remove credentials')
    }
  }

  const handleUpdateSecuritySettings = async (field: 'dataEncryption' | 'auditLogging', value: boolean) => {
    try {
      const response = await fetch('/api/security/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          [field]: value
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update settings')
      }

      setSecurityStatus(prev => ({ ...prev, [field]: value }))
      toast.success('Security settings updated')
    } catch (error) {
      console.error('Error updating security settings:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to update settings')
    }
  }

  return (
    <div className="w-full max-w-full space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          Configure supplier connections, AI processing, and mapping rules
        </p>
      </div>

      <Tabs defaultValue="suppliers" className="space-y-6 w-full">
        <TabsList className="grid w-full grid-cols-5 max-w-full">
          <TabsTrigger value="suppliers" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Suppliers
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex items-center gap-2">
            <Brain className="w-4 h-4" />
            AI Settings
          </TabsTrigger>
          <TabsTrigger value="mapping" className="flex items-center gap-2">
            <Link className="w-4 h-4" />
            Mapping
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Security
          </TabsTrigger>
        </TabsList>

        {/* Suppliers Tab */}
        <TabsContent value="suppliers" className="space-y-6">
          <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <CardTitle>Supplier Connections</CardTitle>
                    <CardDescription>
                      Manage API keys, email configurations, and FTP connections
                    </CardDescription>
                  </div>
                  <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 flex-shrink-0">
                    <Plus className="w-4 h-4" />
                    Add Supplier
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(suppliers || []).map((supplier) => (
                    <div
                      key={supplier.id}
                      className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 border border-border rounded-lg"
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Users className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium">{supplier.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {supplier.type.toUpperCase()} • Last sync: {safeFormatDateTime(supplier.lastSync)}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
                        {getStatusBadge(supplier.status)}
                        <div className="flex gap-2">
                          <button
                            onClick={() => testConnection(supplier)}
                            className="px-3 py-1.5 border border-input bg-background rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors flex-1 sm:flex-initial"
                          >
                            Test Connection
                          </button>
                          <button className="px-2 py-1.5 hover:bg-accent rounded-md transition-colors flex-shrink-0">
                            <Gear className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
        </TabsContent>

        {/* AI Settings Tab */}
        <TabsContent value="ai" className="space-y-6 max-w-full" style={{ maxWidth: '100vw', overflow: 'hidden' }}>
          {isLoadingAISettings ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center space-y-3">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-muted-foreground font-medium">Loading AI settings...</p>
              </div>
            </div>
          ) : (
            <>
              {/* Status Banner */}
              {isSavingAISettings && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      Saving your AI settings...
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Confidence Threshold Card */}
              <Card className="border-2 max-w-full overflow-hidden">
                  <CardHeader className="pb-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                        <Brain className="w-6 h-6 text-white" weight="duotone" />
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-xl">Confidence Threshold</CardTitle>
                        <CardDescription className="mt-1">
                          Control how strict the AI is when processing purchase orders
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6 max-w-full">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-3xl font-bold text-primary">
                            {aiSettings?.confidenceThreshold || 85}%
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            Current threshold
                          </p>
                        </div>
                        <Badge 
                          variant={
                            (aiSettings?.confidenceThreshold || 85) >= 90 ? "default" :
                            (aiSettings?.confidenceThreshold || 85) >= 80 ? "secondary" :
                            "outline"
                          }
                          className="text-sm px-3 py-1"
                        >
                          {(aiSettings?.confidenceThreshold || 85) >= 90 ? "Very Strict" :
                           (aiSettings?.confidenceThreshold || 85) >= 80 ? "Balanced" :
                           "Permissive"}
                        </Badge>
                      </div>
                      
                      <div className="space-y-3">
                        <Slider
                          id="confidence-threshold"
                          min={70}
                          max={95}
                          step={5}
                          value={[aiSettings?.confidenceThreshold || 85]}
                          onValueChange={(value) => updateAISetting('confidenceThreshold', value[0])}
                          className="w-full"
                        />
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="text-left">
                            <div className="font-medium text-orange-600 dark:text-orange-400">70%</div>
                            <div className="text-muted-foreground">More POs processed</div>
                          </div>
                          <div className="text-center">
                            <div className="font-medium text-blue-600 dark:text-blue-400">80-85%</div>
                            <div className="text-muted-foreground">Recommended</div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium text-green-600 dark:text-green-400">95%</div>
                            <div className="text-muted-foreground">Fewer errors</div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg bg-muted/50 p-4">
                        <p className="text-sm text-muted-foreground">
                          <strong className="text-foreground">What this means:</strong> Only purchase orders with 
                          AI confidence above {aiSettings?.confidenceThreshold || 85}% will be automatically processed. 
                          Lower confidence orders will require manual review.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

              {/* Processing Options Grid */}
              <Card className="border-2 max-w-full overflow-hidden">
                  <CardHeader>
                    <CardTitle className="text-xl">Processing Options</CardTitle>
                    <CardDescription>
                      Fine-tune how the AI handles purchase orders
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="max-w-full">
                    <div className="grid gap-4 max-w-full">
                      {/* Strict SKU Matching */}
                      <div className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors max-w-full">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center flex-shrink-0">
                          <Link className="w-5 h-5 text-white" weight="bold" />
                        </div>
                        <div className="flex-1 space-y-1 min-w-0">
                          <div className="flex items-center justify-between gap-4 max-w-full">
                            <Label htmlFor="strict-matching" className="text-base font-semibold cursor-pointer flex-1 min-w-0">
                              Strict SKU Matching
                            </Label>
                            <Switch
                              id="strict-matching"
                              checked={aiSettings?.strictMatching || false}
                              onCheckedChange={(value) => updateAISetting('strictMatching', value)}
                              className="flex-shrink-0"
                            />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Require exact SKU matches for product identification. Recommended for preventing 
                            mismatched products, but may require more manual reviews.
                          </p>
                          <Badge variant={aiSettings?.strictMatching ? "default" : "secondary"} className="mt-2">
                            {aiSettings?.strictMatching ? "Enabled - Exact matches only" : "Disabled - Fuzzy matching allowed"}
                          </Badge>
                        </div>
                      </div>

                      {/* Auto-approve High Confidence */}
                      <div className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors max-w-full">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center flex-shrink-0">
                          <Check className="w-5 h-5 text-white" weight="bold" />
                        </div>
                        <div className="flex-1 space-y-1 min-w-0">
                          <div className="flex items-center justify-between gap-4 max-w-full">
                            <Label htmlFor="auto-approve" className="text-base font-semibold cursor-pointer flex-1 min-w-0">
                              Auto-approve High Confidence
                            </Label>
                            <Switch
                              id="auto-approve"
                              checked={aiSettings?.autoApproveHigh || true}
                              onCheckedChange={(value) => updateAISetting('autoApproveHigh', value)}
                              className="flex-shrink-0"
                            />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Automatically process and sync POs that exceed your confidence threshold. 
                            Saves time but requires trust in AI accuracy.
                          </p>
                          <Badge variant={aiSettings?.autoApproveHigh ? "default" : "secondary"} className="mt-2">
                            {aiSettings?.autoApproveHigh ? "Enabled - Auto-processing active" : "Disabled - Manual review required"}
                          </Badge>
                        </div>
                      </div>

                      {/* Learning Mode */}
                      <div className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors max-w-full">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center flex-shrink-0">
                          <Brain className="w-5 h-5 text-white" weight="bold" />
                        </div>
                        <div className="flex-1 space-y-1 min-w-0">
                          <div className="flex items-center justify-between gap-4 max-w-full">
                            <Label htmlFor="learning-mode" className="text-base font-semibold cursor-pointer flex-1 min-w-0">
                              Learning Mode
                            </Label>
                            <Switch
                              id="learning-mode"
                              checked={aiSettings?.learningMode || true}
                              onCheckedChange={(value) => updateAISetting('learningMode', value)}
                              className="flex-shrink-0"
                            />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Allow the AI to learn from your corrections and improve over time. 
                            Helps the system adapt to your specific suppliers and products.
                          </p>
                          <Badge variant={aiSettings?.learningMode ? "default" : "secondary"} className="mt-2">
                            {aiSettings?.learningMode ? "Enabled - AI is learning" : "Disabled - Static processing"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

              {/* Info Banner */}
              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950 p-4">
                  <div className="flex gap-3">
                    <Brain className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" weight="duotone" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        AI Settings Auto-Save
                      </p>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        All changes are automatically saved to the database. You can adjust these settings 
                        anytime and they'll be applied to new purchase orders immediately.
                      </p>
                    </div>
                  </div>
                </div>
            </>
          )}
        </TabsContent>

        {/* Mapping Rules Tab */}
        <TabsContent value="mapping" className="space-y-6">
          {isLoadingMappingRules ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center space-y-3">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-muted-foreground font-medium">Loading mapping rules...</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header Card */}
              <Card className="border-2 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20">
                  <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row items-start gap-4">
                      <div className="flex items-start gap-4 flex-1 w-full sm:w-auto">
                        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                          <Gear className="w-6 h-6 text-white" weight="duotone" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-xl font-semibold">Product Mapping Rules</h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            Automatically categorize products using simple pattern matching - no coding required!
                          </p>
                          <div className="flex flex-wrap items-center gap-3 mt-3">
                            <Badge variant="secondary" className="gap-2">
                              <span className="text-lg font-bold">{mappingRules.length}</span>
                              <span>Active {mappingRules.length === 1 ? 'Rule' : 'Rules'}</span>
                            </Badge>
                            <Badge variant="outline" className="gap-2">
                              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                              Auto-saves changes
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <button onClick={addMappingRule} className="px-4 py-2.5 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 flex-shrink-0">
                        <Plus className="w-5 h-5" />
                        Add New Rule
                      </button>
                    </div>
                  </CardContent>
                </Card>

              {/* Quick Start Guide - Show only when no rules */}
              {mappingRules.length === 0 && (
                <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 dark:border-blue-800 dark:from-blue-950/20 dark:to-indigo-950/20">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-lg font-bold">💡</span>
                        </div>
                        <div className="flex-1 space-y-3">
                          <h4 className="font-semibold text-blue-900 dark:text-blue-100">
                            Quick Start: How to Create Your First Rule
                          </h4>
                          <div className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                            <p className="font-medium">Example: Categorize all electronics products</p>
                            <ol className="list-decimal list-inside space-y-1.5 ml-1">
                              <li>Click "Add New Rule" above</li>
                              <li>In "Pattern to Match", type: <code className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900 font-mono">ELEC-*</code></li>
                              <li>In "Category Value", type: <code className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900">Electronics</code></li>
                              <li>That's it! All SKUs starting with "ELEC-" will be categorized as Electronics</li>
                            </ol>
                            <div className="flex items-center gap-2 pt-2">
                              <span className="text-xs font-semibold">Pro Tip:</span>
                              <code className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900 font-mono text-xs">*</code>
                              <span className="text-xs">matches any characters (wildcard)</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
              )}

              {/* Common Pattern Examples */}
              {mappingRules.length === 0 && (
                <Card className="border-2">
                    <CardContent className="pt-6">
                      <h4 className="font-semibold mb-4 flex items-center gap-2">
                        <span>🎯</span>
                        Common Pattern Examples
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2 p-4 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-2">
                            <code className="px-2 py-1 rounded bg-blue-100 dark:bg-blue-900 font-mono text-sm">ELEC-*</code>
                            <span className="text-sm text-muted-foreground">→</span>
                            <span className="text-sm font-medium">Electronics</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Matches: ELEC-001, ELEC-TV, ELEC-PHONE</p>
                        </div>
                        <div className="space-y-2 p-4 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-2">
                            <code className="px-2 py-1 rounded bg-purple-100 dark:bg-purple-900 font-mono text-sm">*-PRO</code>
                            <span className="text-sm text-muted-foreground">→</span>
                            <span className="text-sm font-medium">Professional</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Matches: LAPTOP-PRO, PHONE-PRO, CAM-PRO</p>
                        </div>
                        <div className="space-y-2 p-4 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-2">
                            <code className="px-2 py-1 rounded bg-green-100 dark:bg-green-900 font-mono text-sm">*WIRELESS*</code>
                            <span className="text-sm text-muted-foreground">→</span>
                            <span className="text-sm font-medium">Wireless</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Matches: WIRELESS-MOUSE, HEADSET-WIRELESS</p>
                        </div>
                        <div className="space-y-2 p-4 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-2">
                            <code className="px-2 py-1 rounded bg-amber-100 dark:bg-amber-900 font-mono text-sm">SALE*</code>
                            <span className="text-sm text-muted-foreground">→</span>
                            <span className="text-sm font-medium">On Sale</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Matches: SALE-2024, SALE-WINTER, SALE-XYZ</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
              )}

              {/* Rules List */}
              {mappingRules.length === 0 ? (
                <Card className="border-2 border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-16">
                      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/20 dark:to-blue-900/20 flex items-center justify-center mb-4">
                        <Gear className="w-10 h-10 text-purple-600 dark:text-purple-400" weight="duotone" />
                      </div>
                      <h3 className="text-lg font-semibold mb-2">Ready to Create Your First Rule?</h3>
                      <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
                        Click the button below to start automatically categorizing your products. 
                        It's easy - just specify a pattern and what category to assign!
                      </p>
                      <button onClick={addMappingRule} className="h-10 px-6 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                        <Plus className="w-5 h-5" />
                        Create Your First Rule
                      </button>
                    </CardContent>
                  </Card>
              ) : (
                <div className="space-y-4">
                  {mappingRules.map((rule, index) => (
                    <motion.div
                      key={rule.id}
                      variants={cardVariants}
                      initial="hidden"
                      animate="visible"
                      transition={{ delay: index * 0.1 }}
                    >
                      <Card className="border-2 hover:border-primary/50 transition-colors">
                        <CardContent className="pt-6">
                          <div className="flex items-start gap-4">
                            {/* Rule Number Badge */}
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                              <span className="text-white font-bold text-sm">#{index + 1}</span>
                            </div>

                            {/* Rule Inputs */}
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Pattern Input */}
                              <div className="space-y-2">
                                <Label htmlFor={`pattern-${rule.id}`} className="text-sm font-semibold flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                                  Pattern to Match (SKU/Name)
                                </Label>
                                <Input
                                  id={`pattern-${rule.id}`}
                                  value={rule.pattern}
                                  onChange={(e) => updateMappingRule(rule.id, 'pattern', e.target.value)}
                                  placeholder="e.g., ELEC-*, *WIRELESS*, SALE*"
                                  className="font-mono text-base"
                                />
                                <div className="flex items-start gap-2">
                                  <div className="flex-1">
                                    <p className="text-xs text-muted-foreground">
                                      Use <code className="px-1 py-0.5 rounded bg-muted font-mono">*</code> to match any characters
                                    </p>
                                  </div>
                                  {rule.pattern && (
                                    <Badge variant="outline" className="gap-1 text-xs">
                                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                      Auto-saving
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              {/* Value/Action */}
                              <div className="space-y-2">
                                <Label htmlFor={`action-${rule.id}`} className="text-sm font-semibold flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                                  Category Name
                                </Label>
                                <Input
                                  id={`action-${rule.id}`}
                                  value={rule.action}
                                  onChange={(e) => updateMappingRule(rule.id, 'action', e.target.value)}
                                  placeholder="e.g., Electronics, Wireless, On Sale"
                                  className="text-base"
                                />
                                <div className="flex items-start gap-2">
                                  <p className="text-xs text-muted-foreground flex-1">
                                    Products matching the pattern will be assigned this category
                                  </p>
                                  {rule.action && (
                                    <Badge variant="secondary" className="text-xs">
                                      {rule.action}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Delete Button */}
                            <button
                              onClick={() => deleteMappingRule(rule.id)}
                              className="p-2 hover:bg-destructive hover:text-destructive-foreground rounded-md transition-colors flex-shrink-0"
                              aria-label="Delete rule"
                            >
                              <Trash className="w-5 h-5" />
                            </button>
                          </div>

                          {/* Rule Example/Preview with Live Testing */}
                          {rule.pattern && rule.action && (
                            <div className="mt-4 pt-4 border-t space-y-3">
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2 text-sm flex-1">
                                  <Badge variant="outline" className="gap-2">
                                    <span className="text-muted-foreground">If SKU/Name matches:</span>
                                    <code className="text-blue-600 dark:text-blue-400 font-semibold">{rule.pattern}</code>
                                    <span className="text-muted-foreground">→ Set category to:</span>
                                    <span className="text-purple-600 dark:text-purple-400 font-semibold">{rule.action}</span>
                                  </Badge>
                                </div>
                              </div>
                              
                              {/* Live Pattern Tester */}
                              <div className="flex items-center gap-3 pl-4 border-l-2 border-blue-200 dark:border-blue-800">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs font-semibold text-muted-foreground">Test this pattern:</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    {(() => {
                                      const testCases = [
                                        rule.pattern.replace(/\*/g, '001'),
                                        rule.pattern.replace(/\*/g, 'ABC'),
                                        rule.pattern.replace(/\*/g, 'TEST')
                                      ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3)
                                      
                                      return testCases.map((testCase, idx) => {
                                        const matches = testMappingRule(rule.pattern, testCase)
                                        return (
                                          <div key={idx} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50">
                                            {matches ? (
                                              <span className="w-4 h-4 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0">
                                                <span className="text-green-600 dark:text-green-400 text-xs">✓</span>
                                              </span>
                                            ) : (
                                              <span className="w-4 h-4 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center flex-shrink-0">
                                                <span className="text-red-600 dark:text-red-400 text-xs">✗</span>
                                              </span>
                                            )}
                                            <code className="font-mono">{testCase}</code>
                                          </div>
                                        )
                                      })
                                    })()}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* Empty State Helper */}
                          {(!rule.pattern || !rule.action) && (
                            <div className="mt-4 pt-4 border-t">
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span>💡</span>
                                <span>Fill in both fields to see how this rule will work</span>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Help & Tips Card */}
              {mappingRules.length > 0 && (
                <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50 dark:border-blue-800 dark:from-blue-950/20 dark:to-cyan-950/20">
                    <CardContent className="pt-6">
                      <div className="flex gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-lg">💡</span>
                        </div>
                        <div className="flex-1 space-y-3">
                          <h4 className="font-semibold text-blue-900 dark:text-blue-100">
                            Pro Tips for Better Pattern Matching
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-blue-800 dark:text-blue-200">
                            <div className="space-y-1.5">
                              <div className="flex items-start gap-2">
                                <span className="text-blue-600 dark:text-blue-400">✓</span>
                                <div>
                                  <p className="font-medium">Rules are applied top to bottom</p>
                                  <p className="text-xs text-blue-600 dark:text-blue-400">More specific rules should be placed higher</p>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <div className="flex items-start gap-2">
                                <span className="text-blue-600 dark:text-blue-400">✓</span>
                                <div>
                                  <p className="font-medium">Patterns are case-insensitive</p>
                                  <p className="text-xs text-blue-600 dark:text-blue-400">"ELEC-*" matches "elec-001" and "Elec-TV"</p>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <div className="flex items-start gap-2">
                                <span className="text-blue-600 dark:text-blue-400">✓</span>
                                <div>
                                  <p className="font-medium">Use <code className="px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900 font-mono">*</code> for wildcards</p>
                                  <p className="text-xs text-blue-600 dark:text-blue-400">Matches any number of characters</p>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <div className="flex items-start gap-2">
                                <span className="text-blue-600 dark:text-blue-400">✓</span>
                                <div>
                                  <p className="font-medium">Changes save automatically</p>
                                  <p className="text-xs text-blue-600 dark:text-blue-400">Just edit and we'll handle the rest!</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <NotificationSettings />
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6 max-w-full" style={{ maxWidth: '100vw', overflow: 'hidden' }}>
          <Card className="max-w-full overflow-hidden" style={{ maxWidth: '100%' }}>
              <CardHeader>
                <CardTitle>Security & Privacy</CardTitle>
                <CardDescription>
                  Manage data security, access controls, and privacy settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 max-w-full" style={{ maxWidth: '100%', overflow: 'hidden' }}>
                {/* Connection Status */}
                {securityStatus.configured && (
                  <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950 p-4">
                    <div className="flex items-center gap-3">
                      <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                      <div>
                        <p className="font-medium text-green-900 dark:text-green-100">
                          Connected to Shopify
                        </p>
                        <p className="text-sm text-green-700 dark:text-green-300">
                          {securityStatus.shopDomain}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="shop-domain" className="text-base font-medium">
                      Shop Domain
                    </Label>
                    <p className="text-sm text-muted-foreground mb-3">
                      Your Shopify store domain (e.g., your-store.myshopify.com)
                    </p>
                    <Input
                      id="shop-domain"
                      type="text"
                      placeholder="your-store.myshopify.com"
                      value={shopifyShopDomain}
                      onChange={(e) => setShopifyShopDomain(e.target.value)}
                      className="max-w-md"
                    />
                  </div>

                  <Separator />

                  <div>
                    <Label htmlFor="api-key" className="text-base font-medium">
                      Shopify API Key
                    </Label>
                    <p className="text-sm text-muted-foreground mb-3">
                      Your Shopify private app access token (starts with shpat_)
                    </p>
                    <Input
                      id="api-key"
                      type="password"
                      placeholder="shpat_..."
                      value={shopifyApiKey}
                      onChange={(e) => setShopifyApiKey(e.target.value)}
                      className="max-w-md"
                    />
                    {securityStatus.hasApiKey && (
                      <p className="text-sm text-green-600 dark:text-green-400 mt-2 flex items-center gap-2">
                        <Check className="w-4 h-4" />
                        API key is configured
                      </p>
                    )}
                  </div>

                  <Separator />

                  <div>
                    <Label htmlFor="webhook-secret" className="text-base font-medium">
                      Webhook Secret (Optional)
                    </Label>
                    <p className="text-sm text-muted-foreground mb-3">
                      Secret for validating webhook requests
                    </p>
                    <Input
                      id="webhook-secret"
                      type="password"
                      placeholder="whsec_..."
                      value={shopifyWebhookSecret}
                      onChange={(e) => setShopifyWebhookSecret(e.target.value)}
                      className="max-w-md"
                    />
                    {securityStatus.hasWebhookSecret && (
                      <p className="text-sm text-green-600 dark:text-green-400 mt-2 flex items-center gap-2">
                        <Check className="w-4 h-4" />
                        Webhook secret is configured
                      </p>
                    )}
                  </div>

                  <Separator />

                  <div className="flex items-start gap-4 max-w-full">
                    <div className="flex-1 min-w-0">
                      <Label className="text-base font-medium">
                        Data Encryption
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Encrypt sensitive credentials at rest (AES-256-GCM)
                      </p>
                    </div>
                    <div className="pt-1 flex items-center" style={{ minWidth: '44px' }}>
                      <Switch 
                        checked={securityStatus.dataEncryption}
                        onCheckedChange={(checked) => handleUpdateSecuritySettings('dataEncryption', checked)}
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="flex items-start gap-4 max-w-full">
                    <div className="flex-1 min-w-0">
                      <Label className="text-base font-medium">
                        Audit Logging
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Log all system activities for compliance
                      </p>
                    </div>
                    <div className="pt-1 flex items-center" style={{ minWidth: '44px' }}>
                      <Switch 
                        checked={securityStatus.auditLogging}
                        onCheckedChange={(checked) => handleUpdateSecuritySettings('auditLogging', checked)}
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-6 flex flex-col gap-3 max-w-full w-full">
                  <button 
                    className="block w-full max-w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-center"
                    style={{ 
                      minWidth: '300px',
                      width: '100%',
                      position: 'relative',
                      left: '0',
                      right: '0',
                      transform: 'none'
                    }}
                    onClick={handleSaveCredentials}
                    disabled={isSavingCredentials || !shopifyApiKey || !shopifyShopDomain}
                  >
                    {isSavingCredentials ? 'Saving...' : 'Save Credentials Securely'}
                  </button>
                  
                  {securityStatus.hasApiKey && (
                    <>
                      <button 
                        className="block w-full max-w-full px-4 py-2.5 border border-input bg-background rounded-md font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-center"
                        style={{ 
                          minWidth: '300px',
                          width: '100%',
                          position: 'relative',
                          left: '0',
                          right: '0',
                          transform: 'none'
                        }}
                        onClick={handleTestConnection}
                        disabled={isTestingConnection}
                      >
                        {isTestingConnection ? 'Testing...' : 'Test Connection'}
                      </button>
                      
                      <button 
                        className="block w-full max-w-full px-4 py-2.5 bg-destructive text-destructive-foreground rounded-md font-medium hover:bg-destructive/90 transition-colors text-center"
                        style={{ 
                          minWidth: '300px',
                          width: '100%',
                          position: 'relative',
                          left: '0',
                          right: '0',
                          transform: 'none'
                        }}
                        onClick={handleRemoveCredentials}
                      >
                        Remove Credentials
                      </button>
                    </>
                  )}
                </div>

                <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950 p-4 mt-6">
                  <p className="text-sm text-blue-900 dark:text-blue-100 flex items-start gap-2">
                    <Shield className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>
                      Your credentials are encrypted using AES-256-GCM encryption and stored securely on the server. 
                      They are never exposed to the frontend in plaintext.
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
