import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Warning, Check, Gear, CurrencyDollar, Tag, FileText, Copy, FloppyDisk, ArrowsClockwise } from '@phosphor-icons/react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { authenticatedRequest } from '@/lib/shopifyApiService'

interface RefinementConfig {
  isEnabled: boolean
  autoApplyRules: boolean
  requireReviewThreshold: number
  pricing: {
    enabled: boolean
    globalMarkup: {
      type: 'percentage' | 'fixed'
      value: number
      minMarkup?: number
      maxMarkup?: number
    }
    roundingRules: {
      enabled: boolean
      rule: 'psychological_99' | 'round_up' | 'round_down' | 'nearest_dollar'
    }
    priceValidation: {
      enabled: boolean
      minPrice: number
      minimumMarginPercentage: number
    }
  }
  categorization: {
    enabled: boolean
    autoMapping: {
      enabled: boolean
      confidenceThreshold: number
    }
    defaultCategory: {
      enabled: boolean
      defaultCollectionName: string
      createMissingCollections: boolean
    }
  }
  content: {
    enabled: boolean
    seoOptimization: {
      enabled: boolean
      generateDescriptions: boolean
      titleOptimization: boolean
      maxTitleLength: number
    }
    brandVoice: {
      enabled: boolean
      brandVoicePrompt: string
      rewriteDescriptions: boolean
    }
  }
  deduplication: {
    enabled: boolean
    matchingCriteria: {
      primaryFields: string[]
      matchThresholds: {
        exact: number
        fuzzy: number
      }
    }
    duplicateActions: {
      onExactMatch: 'skip' | 'update' | 'queue_review'
      onFuzzyMatch: 'skip' | 'update' | 'queue_review'
    }
  }
}

const defaultConfig: RefinementConfig = {
  isEnabled: true,
  autoApplyRules: false,
  requireReviewThreshold: 0.8,
  pricing: {
    enabled: true,
    globalMarkup: {
      type: 'percentage',
      value: 1.5,
      minMarkup: 1.1,
      maxMarkup: 3.0
    },
    roundingRules: {
      enabled: true,
      rule: 'psychological_99'
    },
    priceValidation: {
      enabled: true,
      minPrice: 0.01,
      minimumMarginPercentage: 10
    }
  },
  categorization: {
    enabled: true,
    autoMapping: {
      enabled: true,
      confidenceThreshold: 0.7
    },
    defaultCategory: {
      enabled: true,
      defaultCollectionName: 'Imported Products',
      createMissingCollections: true
    }
  },
  content: {
    enabled: true,
    seoOptimization: {
      enabled: true,
      generateDescriptions: true,
      titleOptimization: true,
      maxTitleLength: 255
    },
    brandVoice: {
      enabled: false,
      brandVoicePrompt: 'Write in a professional, customer-focused tone',
      rewriteDescriptions: false
    }
  },
  deduplication: {
    enabled: true,
    matchingCriteria: {
      primaryFields: ['sku', 'barcode'],
      matchThresholds: {
        exact: 1.0,
        fuzzy: 0.9
      }
    },
    duplicateActions: {
      onExactMatch: 'skip',
      onFuzzyMatch: 'queue_review'
    }
  }
}

export function RefinementConfigPanel() {
  const [config, setConfig] = useState<RefinementConfig>(defaultConfig)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isTestingPricing, setIsTestingPricing] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)
  const [merchantId, setMerchantId] = useState('cmft3moy50000ultcbqgxzz6d') // Real merchant ID from database

  // Load configuration on mount
  useEffect(() => {
    loadConfiguration()
  }, [])

  const loadConfiguration = async () => {
    setIsLoading(true)
    try {
      const result = await authenticatedRequest<RefinementConfig>(`/refinement-config?merchantId=${merchantId}`)
      if (result.success && result.data) {
        setConfig(result.data)
      }
    } catch (error) {
      console.error('Failed to load configuration:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const saveConfiguration = async () => {
    setIsSaving(true)
    try {
      const result = await authenticatedRequest<RefinementConfig>(`/refinement-config?merchantId=${merchantId}`, {
        method: 'PUT',
        body: JSON.stringify(config)
      })
      
      if (result.success && result.data) {
        setConfig(result.data)
        // Show success notification
      }
    } catch (error) {
      console.error('Failed to save configuration:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const testPricingRules = async () => {
    setIsTestingPricing(true)
    try {
      const result = await authenticatedRequest<any>(`/refinement-config/test-pricing?merchantId=${merchantId}`, {
        method: 'POST',
        body: JSON.stringify({
          sampleProduct: {
            title: 'Sample Product',
            price: '10.00'
          }
        })
      })
      
      if (result.success) {
        setTestResult(result.data)
      }
    } catch (error) {
      console.error('Failed to test pricing rules:', error)
    } finally {
      setIsTestingPricing(false)
    }
  }

  const resetToDefaults = () => {
    setConfig(defaultConfig)
  }

  const updateConfig = (path: string, value: any) => {
    setConfig(prev => {
      const newConfig = JSON.parse(JSON.stringify(prev)) // Deep clone
      const keys = path.split('.')
      let current: any = newConfig
      
      // Ensure all intermediate objects exist
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {}
        }
        current = current[keys[i]]
      }
      
      current[keys[keys.length - 1]] = value
      return newConfig
    })
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gear className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg">Product Refinement Configuration</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={config.isEnabled ? "default" : "secondary"}>
              {config.isEnabled ? "Enabled" : "Disabled"}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={resetToDefaults}
              className="text-xs"
            >
              <ArrowsClockwise className="h-3 w-3 mr-1" />
              Reset
            </Button>
            <Button
              onClick={saveConfiguration}
              disabled={isSaving}
              size="sm"
              className="text-xs"
            >
              <FloppyDisk className="h-3 w-3 mr-1" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
        <CardDescription className="text-sm">
          Configure how products are automatically refined during import. These settings apply to all Purchase Orders processed.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Master Enable/Disable */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="space-y-1">
            <Label className="text-sm font-medium">Enable Refinement Engine</Label>
            <p className="text-xs text-gray-600">Apply refinement rules to all imported products</p>
          </div>
          <Switch
            checked={config.isEnabled}
            onCheckedChange={(checked) => updateConfig('isEnabled', checked)}
          />
        </div>

        {config.isEnabled && (
          <Tabs defaultValue="pricing" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="pricing" className="text-xs">
                <CurrencyDollar className="h-3 w-3 mr-1" />
                Pricing
              </TabsTrigger>
              <TabsTrigger value="categorization" className="text-xs">
                <Tag className="h-3 w-3 mr-1" />
                Categories
              </TabsTrigger>
              <TabsTrigger value="content" className="text-xs">
                <FileText className="h-3 w-3 mr-1" />
                Content
              </TabsTrigger>
              <TabsTrigger value="deduplication" className="text-xs">
                <Copy className="h-3 w-3 mr-1" />
                Duplicates
              </TabsTrigger>
            </TabsList>

            {/* Pricing Configuration */}
            <TabsContent value="pricing" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Enable Pricing Rules</Label>
                  <Switch
                    checked={config.pricing?.enabled ?? false}
                    onCheckedChange={(checked) => updateConfig('pricing.enabled', checked)}
                  />
                </div>

                {config.pricing?.enabled && (
                  <div className="space-y-4 pl-4 border-l-2 border-gray-200">
                    {/* Global Markup */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">Markup Type</Label>
                        <Select
                          value={config.pricing?.globalMarkup?.type ?? 'percentage'}
                          onValueChange={(value: 'percentage' | 'fixed') => 
                            updateConfig('pricing.globalMarkup.type', value)
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percentage">Percentage</SelectItem>
                            <SelectItem value="fixed">Fixed Amount</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">
                          Markup Value {config.pricing?.globalMarkup?.type === 'percentage' ? '(Multiplier)' : '($)'}
                        </Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={config.pricing?.globalMarkup?.value ?? 1.5}
                          onChange={(e) => updateConfig('pricing.globalMarkup.value', parseFloat(e.target.value))}
                          className="h-8 text-xs"
                          placeholder={config.pricing?.globalMarkup?.type === 'percentage' ? '1.5' : '5.00'}
                        />
                      </div>
                    </div>

                    {/* Rounding Rules */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">Price Rounding</Label>
                        <Switch
                          checked={config.pricing.roundingRules.enabled}
                          onCheckedChange={(checked) => updateConfig('pricing.roundingRules.enabled', checked)}
                        />
                      </div>
                      {config.pricing.roundingRules.enabled && (
                        <Select
                          value={config.pricing.roundingRules.rule}
                          onValueChange={(value) => updateConfig('pricing.roundingRules.rule', value)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="psychological_99">Psychological ($.99)</SelectItem>
                            <SelectItem value="round_up">Round Up</SelectItem>
                            <SelectItem value="round_down">Round Down</SelectItem>
                            <SelectItem value="nearest_dollar">Nearest Dollar</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    {/* Test Pricing */}
                    <div className="space-y-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={testPricingRules}
                        disabled={isTestingPricing}
                        className="text-xs"
                      >
                        {isTestingPricing ? 'Testing...' : 'Test Pricing Rules'}
                      </Button>
                      {testResult && (
                        <div className="p-2 bg-green-50 rounded text-xs">
                          <p><strong>Test:</strong> $10.00 → <strong>${testResult.adjustedPrice}</strong></p>
                          <p className="text-gray-600">
                            Applied {testResult.appliedRules.length} rule(s)
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Categorization Configuration */}
            <TabsContent value="categorization" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Enable Auto-Categorization</Label>
                  <Switch
                    checked={config.categorization?.enabled ?? false}
                    onCheckedChange={(checked) => updateConfig('categorization.enabled', checked)}
                  />
                </div>

                {config.categorization?.enabled && (
                  <div className="space-y-4 pl-4 border-l-2 border-gray-200">
                    <div className="space-y-2">
                      <Label className="text-xs">Confidence Threshold</Label>
                      <div className="space-y-1">
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          max="1"
                          value={config.categorization?.autoMapping?.confidenceThreshold ?? 0.7}
                          onChange={(e) => updateConfig('categorization.autoMapping.confidenceThreshold', parseFloat(e.target.value))}
                          className="h-8 text-xs"
                        />
                        <Progress 
                          value={(config.categorization?.autoMapping?.confidenceThreshold ?? 0.7) * 100} 
                          className="h-1"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Default Collection Name</Label>
                      <Input
                        value={config.categorization?.defaultCategory?.defaultCollectionName ?? 'Imported Products'}
                        onChange={(e) => updateConfig('categorization.defaultCategory.defaultCollectionName', e.target.value)}
                        className="h-8 text-xs"
                        placeholder="Imported Products"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Create Missing Collections</Label>
                      <Switch
                        checked={config.categorization.defaultCategory.createMissingCollections}
                        onCheckedChange={(checked) => updateConfig('categorization.defaultCategory.createMissingCollections', checked)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Content Configuration */}
            <TabsContent value="content" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Enable Content Enhancement</Label>
                  <Switch
                    checked={config.content?.enabled ?? false}
                    onCheckedChange={(checked) => updateConfig('content.enabled', checked)}
                  />
                </div>

                {config.content?.enabled && (
                  <div className="space-y-4 pl-4 border-l-2 border-gray-200">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">SEO Optimization</Label>
                        <Switch
                          checked={config.content?.seoOptimization?.enabled ?? false}
                          onCheckedChange={(checked) => updateConfig('content.seoOptimization.enabled', checked)}
                        />
                      </div>
                      
                      {config.content?.seoOptimization?.enabled && (
                        <div className="space-y-3 pl-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Generate Descriptions</Label>
                            <Switch
                              checked={config.content?.seoOptimization?.generateDescriptions ?? false}
                              onCheckedChange={(checked) => updateConfig('content.seoOptimization.generateDescriptions', checked)}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Optimize Titles</Label>
                            <Switch
                              checked={config.content?.seoOptimization?.titleOptimization ?? false}
                              onCheckedChange={(checked) => updateConfig('content.seoOptimization.titleOptimization', checked)}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">Brand Voice</Label>
                        <Switch
                          checked={config.content?.brandVoice?.enabled ?? false}
                          onCheckedChange={(checked) => updateConfig('content.brandVoice.enabled', checked)}
                        />
                      </div>
                      
                      {config.content?.brandVoice?.enabled && (
                        <div className="space-y-2 pl-3">
                          <Label className="text-xs">Brand Voice Prompt</Label>
                          <Input
                            value={config.content?.brandVoice?.brandVoicePrompt ?? ''}
                            onChange={(e) => updateConfig('content.brandVoice.brandVoicePrompt', e.target.value)}
                            className="h-8 text-xs"
                            placeholder="Write in a professional, customer-focused tone"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Deduplication Configuration */}
            <TabsContent value="deduplication" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Enable Deduplication</Label>
                  <Switch
                    checked={config.deduplication?.enabled ?? false}
                    onCheckedChange={(checked) => updateConfig('deduplication.enabled', checked)}
                  />
                </div>

                {config.deduplication?.enabled && (
                  <div className="space-y-4 pl-4 border-l-2 border-gray-200">
                    <div className="space-y-2">
                      <Label className="text-xs">Primary Matching Fields</Label>
                      <div className="flex gap-2 flex-wrap">
                        {['sku', 'barcode', 'title'].map(field => (
                          <Badge
                            key={field}
                            variant={config.deduplication?.matchingCriteria?.primaryFields?.includes(field) ? "default" : "outline"}
                            className="text-xs cursor-pointer"
                            onClick={() => {
                              const fields = config.deduplication?.matchingCriteria?.primaryFields ?? []
                              const newFields = fields.includes(field)
                                ? fields.filter(f => f !== field)
                                : [...fields, field]
                              updateConfig('deduplication.matchingCriteria.primaryFields', newFields)
                            }}
                          >
                            {field.toUpperCase()}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">Exact Match Action</Label>
                        <Select
                          value={config.deduplication?.duplicateActions?.onExactMatch ?? 'skip'}
                          onValueChange={(value) => updateConfig('deduplication.duplicateActions.onExactMatch', value)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="skip">Skip Import</SelectItem>
                            <SelectItem value="update">Update Existing</SelectItem>
                            <SelectItem value="queue_review">Queue for Review</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Fuzzy Match Action</Label>
                        <Select
                          value={config.deduplication?.duplicateActions?.onFuzzyMatch ?? 'queue_review'}
                          onValueChange={(value) => updateConfig('deduplication.duplicateActions.onFuzzyMatch', value)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="skip">Skip Import</SelectItem>
                            <SelectItem value="update">Update Existing</SelectItem>
                            <SelectItem value="queue_review">Queue for Review</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}

        {/* Configuration Status */}
        {config.isEnabled && (
          <div className="pt-3 border-t">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Check className="h-3 w-3 text-green-500" />
              <span>Configuration will be applied to all new Purchase Order uploads</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}