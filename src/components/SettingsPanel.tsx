import { useState } from 'react'
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

  const [aiSettings, setAISettings] = useKV<AISettings>('ai-settings', {
    confidenceThreshold: 85,
    strictMatching: false,
    autoApproveHigh: true,
    learningMode: true
  })

  const [mappingRules, setMappingRules] = useKV<MappingRule[]>('mapping-rules', [
    { id: '1', pattern: 'TECH-*', field: 'category', action: 'Technology' },
    { id: '2', pattern: 'PRO-*', field: 'category', action: 'Professional' },
    { id: '3', pattern: '*-CLR', field: 'variant', action: 'Clear' }
  ])

  const updateAISetting = (key: keyof AISettings, value: any) => {
    setAISettings((current) => ({
      confidenceThreshold: 85,
      strictMatching: false,
      autoApproveHigh: true,
      learningMode: true,
      ...current,
      [key]: value
    }))
    toast.success('AI settings updated')
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

  const addMappingRule = () => {
    const newRule: MappingRule = {
      id: Date.now().toString(),
      pattern: '',
      field: 'category',
      action: ''
    }
    setMappingRules((current) => [...(current || []), newRule])
  }

  const deleteMappingRule = (id: string) => {
    setMappingRules((current) => (current || []).filter(rule => rule.id !== id))
    toast.success('Mapping rule deleted')
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          Configure supplier connections, AI processing, and mapping rules
        </p>
      </div>

      <Tabs defaultValue="suppliers" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
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
          <motion.div variants={cardVariants}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Supplier Connections</CardTitle>
                    <CardDescription>
                      Manage API keys, email configurations, and FTP connections
                    </CardDescription>
                  </div>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Supplier
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(suppliers || []).map((supplier) => (
                    <div
                      key={supplier.id}
                      className="flex items-center justify-between p-4 border border-border rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Users className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium">{supplier.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {supplier.type.toUpperCase()} • Last sync: {safeFormatDateTime(supplier.lastSync)}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {getStatusBadge(supplier.status)}
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => testConnection(supplier)}
                          >
                            Test Connection
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Gear className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* AI Settings Tab */}
        <TabsContent value="ai" className="space-y-6">
          <motion.div variants={cardVariants}>
            <Card>
              <CardHeader>
                <CardTitle>AI Processing Configuration</CardTitle>
                <CardDescription>
                  Adjust how the AI parses and processes purchase orders
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="confidence-threshold" className="text-base font-medium">
                      Confidence Threshold: {aiSettings?.confidenceThreshold || 85}%
                    </Label>
                    <p className="text-sm text-muted-foreground mb-3">
                      Minimum confidence required for auto-processing
                    </p>
                    <Slider
                      id="confidence-threshold"
                      min={70}
                      max={95}
                      step={5}
                      value={[aiSettings?.confidenceThreshold || 85]}
                      onValueChange={(value) => updateAISetting('confidenceThreshold', value[0])}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>Less strict (70%)</span>
                      <span>More strict (95%)</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="strict-matching" className="text-base font-medium">
                        Strict SKU Matching
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Require exact SKU matches for product identification
                      </p>
                    </div>
                    <Switch
                      id="strict-matching"
                      checked={aiSettings?.strictMatching || false}
                      onCheckedChange={(value) => updateAISetting('strictMatching', value)}
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="auto-approve" className="text-base font-medium">
                        Auto-approve High Confidence
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically sync POs above confidence threshold
                      </p>
                    </div>
                    <Switch
                      id="auto-approve"
                      checked={aiSettings?.autoApproveHigh || true}
                      onCheckedChange={(value) => updateAISetting('autoApproveHigh', value)}
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="learning-mode" className="text-base font-medium">
                        Learning Mode
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Allow AI to learn from your corrections
                      </p>
                    </div>
                    <Switch
                      id="learning-mode"
                      checked={aiSettings?.learningMode || true}
                      onCheckedChange={(value) => updateAISetting('learningMode', value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* Mapping Rules Tab */}
        <TabsContent value="mapping" className="space-y-6">
          <motion.div variants={cardVariants}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Product Mapping Rules</CardTitle>
                    <CardDescription>
                      Define patterns for automatic product categorization and attribute setting
                    </CardDescription>
                  </div>
                  <Button onClick={addMappingRule}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Rule
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(mappingRules || []).map((rule) => (
                    <div
                      key={rule.id}
                      className="flex items-center gap-4 p-4 border border-border rounded-lg"
                    >
                      <div className="flex-1">
                        <Label htmlFor={`pattern-${rule.id}`} className="text-sm">
                          Pattern
                        </Label>
                        <Input
                          id={`pattern-${rule.id}`}
                          value={rule.pattern}
                          placeholder="e.g., TECH-*"
                          className="mt-1"
                        />
                      </div>
                      <div className="flex-1">
                        <Label htmlFor={`field-${rule.id}`} className="text-sm">
                          Field
                        </Label>
                        <Input
                          id={`field-${rule.id}`}
                          value={rule.field}
                          placeholder="e.g., category"
                          className="mt-1"
                        />
                      </div>
                      <div className="flex-1">
                        <Label htmlFor={`action-${rule.id}`} className="text-sm">
                          Value
                        </Label>
                        <Input
                          id={`action-${rule.id}`}
                          value={rule.action}
                          placeholder="e.g., Technology"
                          className="mt-1"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMappingRule(rule.id)}
                        className="mt-6"
                      >
                        <Trash className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  
                  {(!mappingRules || mappingRules.length === 0) && (
                    <div className="text-center py-8 text-muted-foreground">
                      No mapping rules defined
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <motion.div variants={cardVariants}>
            <NotificationSettings />
          </motion.div>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          <motion.div variants={cardVariants}>
            <Card>
              <CardHeader>
                <CardTitle>Security & Privacy</CardTitle>
                <CardDescription>
                  Manage data security, access controls, and privacy settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="api-key" className="text-base font-medium">
                      Shopify API Key
                    </Label>
                    <p className="text-sm text-muted-foreground mb-3">
                      Your Shopify private app credentials
                    </p>
                    <Input
                      id="api-key"
                      type="password"
                      placeholder="shppa_..."
                      className="max-w-md"
                    />
                  </div>

                  <Separator />

                  <div>
                    <Label htmlFor="webhook-secret" className="text-base font-medium">
                      Webhook Secret
                    </Label>
                    <p className="text-sm text-muted-foreground mb-3">
                      Secret for validating webhook requests
                    </p>
                    <Input
                      id="webhook-secret"
                      type="password"
                      placeholder="whsec_..."
                      className="max-w-md"
                    />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base font-medium">
                        Data Encryption
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Encrypt sensitive supplier data at rest
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base font-medium">
                        Audit Logging
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Log all system activities for compliance
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>

                <div className="pt-6">
                  <Button className="w-full">
                    Save Security Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
