import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { 
  Gear,
  Calculator,
  Percent,
  TrendUp,
  Target,
  ChartLine,
  Lightning,
  Shield,
  Check,
  Warning,
  Info,
  Plus,
  Minus,
  ArrowsClockwise,
  FloppyDisk,
  MagicWand,
  Brain,
  Globe,
  Clock
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useKV } from '../hooks/useKV'

interface PricingRule {
  id: string
  name: string
  enabled: boolean
  conditions: {
    minPrice?: number
    maxPrice?: number
    category?: string
    supplier?: string
    sku?: string
  }
  markupType: 'percentage' | 'fixed' | 'tiered'
  markupValue: number
  roundingStrategy: 'none' | 'up' | 'down' | 'nearest' | 'psychological'
  roundingTarget: 'cent' | 'nickel' | 'dime' | 'dollar'
  psychologicalEnding: string // e.g., '.99', '.49', '.95'
  priority: number
}

interface CategoryMapping {
  supplierCategory: string
  shopifyCategory: string
  defaultMarkup: number
  enabled: boolean
}

interface BulkProcessingConfig {
  batchSize: number
  processingDelay: number // milliseconds between processing each item
  autoApproveThreshold: number // confidence percentage
  skipDuplicates: boolean
  updateExistingProducts: boolean
  createMissingCategories: boolean
  enableImageProcessing: boolean
  enableDescriptionGeneration: boolean
  enableSEOOptimization: boolean
  backupBeforeProcessing: boolean
}

interface AIProcessingConfig {
  confidenceThreshold: number
  enableAdvancedOCR: boolean
  enableDataValidation: boolean
  enableSmartMatching: boolean
  enablePredictiveCorrection: boolean
  customPrompts: {
    productDescription: string
    categoryClassification: string
    priceValidation: string
  }
}

const defaultPricingRules: PricingRule[] = [
  {
    id: 'general-markup',
    name: 'General Markup',
    enabled: true,
    conditions: {},
    markupType: 'percentage',
    markupValue: 40,
    roundingStrategy: 'psychological',
    roundingTarget: 'cent',
    psychologicalEnding: '.99',
    priority: 10
  },
  {
    id: 'electronics-premium',
    name: 'Electronics Premium',
    enabled: true,
    conditions: { category: 'Electronics' },
    markupType: 'percentage',
    markupValue: 35,
    roundingStrategy: 'psychological',
    roundingTarget: 'cent',
    psychologicalEnding: '.49',
    priority: 5
  },
  {
    id: 'low-value-items',
    name: 'Low Value Items',
    enabled: true,
    conditions: { maxPrice: 25 },
    markupType: 'percentage',
    markupValue: 60,
    roundingStrategy: 'psychological',
    roundingTarget: 'cent',
    psychologicalEnding: '.95',
    priority: 3
  }
]

const defaultCategoryMappings: CategoryMapping[] = [
  { supplierCategory: 'Electronics', shopifyCategory: 'Electronics', defaultMarkup: 35, enabled: true },
  { supplierCategory: 'Accessories', shopifyCategory: 'Accessories', defaultMarkup: 50, enabled: true },
  { supplierCategory: 'Components', shopifyCategory: 'Electronics > Components', defaultMarkup: 40, enabled: true },
  { supplierCategory: 'Tools', shopifyCategory: 'Tools & Hardware', defaultMarkup: 45, enabled: true }
]

export function BulkPOConfiguration() {
  const [activeTab, setActiveTab] = useState('pricing')
  const [pricingRules, setPricingRules] = useKV<PricingRule[]>('bulk-po-pricing-rules', defaultPricingRules)
  const [categoryMappings, setCategoryMappings] = useKV<CategoryMapping[]>('bulk-po-category-mappings', defaultCategoryMappings)
  const [bulkConfig, setBulkConfig] = useKV<BulkProcessingConfig>('bulk-po-processing-config', {
    batchSize: 50,
    processingDelay: 500,
    autoApproveThreshold: 95,
    skipDuplicates: true,
    updateExistingProducts: false,
    createMissingCategories: true,
    enableImageProcessing: false,
    enableDescriptionGeneration: true,
    enableSEOOptimization: true,
    backupBeforeProcessing: true
  })
  const [aiConfig, setAiConfig] = useKV<AIProcessingConfig>('bulk-po-ai-config', {
    confidenceThreshold: 85,
    enableAdvancedOCR: true,
    enableDataValidation: true,
    enableSmartMatching: true,
    enablePredictiveCorrection: false,
    customPrompts: {
      productDescription: 'Generate a compelling product description based on the parsed PO data, focusing on features and benefits.',
      categoryClassification: 'Classify this product into the most appropriate Shopify category based on its name and description.',
      priceValidation: 'Validate this price against market standards and flag any anomalies or potential errors.'
    }
  })

  const [selectedRule, setSelectedRule] = useState<PricingRule | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  // Test pricing calculation
  const [testPrice, setTestPrice] = useState<number>(25.00)
  const [testCategory, setTestCategory] = useState<string>('')
  const [testSupplier, setTestSupplier] = useState<string>('')

  const calculatePriceWithRules = useCallback((basePrice: number, category?: string, supplier?: string, sku?: string) => {
    const applicableRules = (pricingRules || [])
      .filter(rule => rule.enabled)
      .filter(rule => {
        const conditions = rule.conditions
        if (conditions.minPrice && basePrice < conditions.minPrice) return false
        if (conditions.maxPrice && basePrice > conditions.maxPrice) return false
        if (conditions.category && category !== conditions.category) return false
        if (conditions.supplier && supplier !== conditions.supplier) return false
        if (conditions.sku && sku !== conditions.sku) return false
        return true
      })
      .sort((a, b) => a.priority - b.priority)

    if (applicableRules.length === 0) return basePrice

    const rule = applicableRules[0] // Use highest priority rule
    let finalPrice = basePrice

    // Apply markup
    switch (rule.markupType) {
      case 'percentage':
        finalPrice = basePrice * (1 + rule.markupValue / 100)
        break
      case 'fixed':
        finalPrice = basePrice + rule.markupValue
        break
      case 'tiered':
        // Simplified tiered logic - could be expanded
        if (basePrice < 20) finalPrice = basePrice * 1.6
        else if (basePrice < 100) finalPrice = basePrice * 1.4
        else finalPrice = basePrice * 1.3
        break
    }

    // Apply rounding
    switch (rule.roundingStrategy) {
      case 'up':
        switch (rule.roundingTarget) {
          case 'cent': finalPrice = Math.ceil(finalPrice * 100) / 100; break
          case 'nickel': finalPrice = Math.ceil(finalPrice * 20) / 20; break
          case 'dime': finalPrice = Math.ceil(finalPrice * 10) / 10; break
          case 'dollar': finalPrice = Math.ceil(finalPrice); break
        }
        break
      case 'down':
        switch (rule.roundingTarget) {
          case 'cent': finalPrice = Math.floor(finalPrice * 100) / 100; break
          case 'nickel': finalPrice = Math.floor(finalPrice * 20) / 20; break
          case 'dime': finalPrice = Math.floor(finalPrice * 10) / 10; break
          case 'dollar': finalPrice = Math.floor(finalPrice); break
        }
        break
      case 'nearest':
        switch (rule.roundingTarget) {
          case 'cent': finalPrice = Math.round(finalPrice * 100) / 100; break
          case 'nickel': finalPrice = Math.round(finalPrice * 20) / 20; break
          case 'dime': finalPrice = Math.round(finalPrice * 10) / 10; break
          case 'dollar': finalPrice = Math.round(finalPrice); break
        }
        break
      case 'psychological':
        const wholePart = Math.floor(finalPrice)
        const ending = parseFloat('0' + rule.psychologicalEnding)
        finalPrice = wholePart + ending
        break
    }

    return finalPrice
  }, [pricingRules])

  const testCalculatedPrice = calculatePriceWithRules(testPrice, testCategory, testSupplier)

  const addNewRule = useCallback(() => {
    const newRule: PricingRule = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'New Pricing Rule',
      enabled: true,
      conditions: {},
      markupType: 'percentage',
      markupValue: 40,
      roundingStrategy: 'psychological',
      roundingTarget: 'cent',
      psychologicalEnding: '.99',
      priority: 10
    }
    setPricingRules(current => [...(current || []), newRule])
    setSelectedRule(newRule)
    setIsEditing(true)
  }, [setPricingRules])

  const saveRule = useCallback((rule: PricingRule) => {
    setPricingRules(current => 
      current?.map(r => r.id === rule.id ? rule : r) || []
    )
    setSelectedRule(null)
    setIsEditing(false)
    toast.success('Pricing rule saved successfully')
  }, [setPricingRules])

  const deleteRule = useCallback((ruleId: string) => {
    setPricingRules(current => 
      current?.filter(r => r.id !== ruleId) || []
    )
    if (selectedRule?.id === ruleId) {
      setSelectedRule(null)
      setIsEditing(false)
    }
    toast.success('Pricing rule deleted')
  }, [setPricingRules, selectedRule])

  const addCategoryMapping = useCallback(() => {
    const newMapping: CategoryMapping = {
      supplierCategory: '',
      shopifyCategory: '',
      defaultMarkup: 40,
      enabled: true
    }
    setCategoryMappings(current => [...(current || []), newMapping])
  }, [setCategoryMappings])

  const updateCategoryMapping = useCallback((index: number, mapping: CategoryMapping) => {
    setCategoryMappings(current => 
      current?.map((m, i) => i === index ? mapping : m) || []
    )
  }, [setCategoryMappings])

  const deleteCategoryMapping = useCallback((index: number) => {
    setCategoryMappings(current => 
      current?.filter((_, i) => i !== index) || []
    )
  }, [setCategoryMappings])

  const saveAllConfigurations = useCallback(() => {
    toast.success('All configurations saved successfully!')
  }, [])

  const quickSetupWizard = useCallback(() => {
    // Apply a common pricing strategy setup
    const commonPricingRules: PricingRule[] = [
      {
        id: 'electronics-premium',
        name: 'Electronics Premium Strategy',
        enabled: true,
        conditions: { category: 'Electronics' },
        markupType: 'percentage',
        markupValue: 35,
        roundingStrategy: 'psychological',
        roundingTarget: 'cent',
        psychologicalEnding: '.99',
        priority: 1
      },
      {
        id: 'accessories-high-margin',
        name: 'Accessories High Margin',
        enabled: true,
        conditions: { category: 'Accessories', maxPrice: 50 },
        markupType: 'percentage',
        markupValue: 60,
        roundingStrategy: 'psychological',
        roundingTarget: 'cent',
        psychologicalEnding: '.49',
        priority: 2
      },
      {
        id: 'bulk-items-competitive',
        name: 'Bulk Items Competitive',
        enabled: true,
        conditions: { minPrice: 100 },
        markupType: 'percentage',
        markupValue: 25,
        roundingStrategy: 'psychological',
        roundingTarget: 'cent',
        psychologicalEnding: '.95',
        priority: 3
      },
      {
        id: 'default-strategy',
        name: 'Default Retail Strategy',
        enabled: true,
        conditions: {},
        markupType: 'percentage',
        markupValue: 40,
        roundingStrategy: 'psychological',
        roundingTarget: 'cent',
        psychologicalEnding: '.99',
        priority: 10
      }
    ]

    setPricingRules(commonPricingRules)
    
    // Apply optimized processing settings
    setBulkConfig(current => ({
      ...current!,
      batchSize: 75,
      processingDelay: 300,
      autoApproveThreshold: 90,
      skipDuplicates: true,
      updateExistingProducts: false,
      createMissingCategories: true,
      enableDescriptionGeneration: true,
      enableSEOOptimization: true
    }))
    
    // Apply optimized AI settings
    setAiConfig(current => ({
      ...current!,
      confidenceThreshold: 85,
      enableAdvancedOCR: true,
      enableDataValidation: true,
      enableSmartMatching: true,
      enablePredictiveCorrection: true
    }))

    toast.success('Quick setup applied! Optimized for retail e-commerce.')
    setActiveTab('pricing')
  }, [setPricingRules, setBulkConfig, setAiConfig])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Gear className="w-6 h-6 text-primary" />
            </div>
            Bulk PO Configuration
          </h2>
          <p className="text-muted-foreground mt-1">
            Configure pricing rules, markups, and processing settings for bulk purchase order automation
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={saveAllConfigurations}>
            <FloppyDisk className="w-4 h-4 mr-2" />
            Save All
          </Button>
          <Button onClick={quickSetupWizard} className="bg-gradient-to-r from-primary to-accent">
            <Lightning className="w-4 h-4 mr-2" />
            Quick Setup
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        {/* Enhanced Tab Navigation */}
        <TabsList className="grid grid-cols-4 lg:w-[600px] h-12 bg-muted/30 p-1">
          <TabsTrigger 
            value="pricing" 
            className="flex items-center gap-2 h-10 data-[state=active]:bg-card data-[state=active]:shadow-sm"
          >
            <Calculator className="w-4 h-4" />
            Pricing Rules
          </TabsTrigger>
          <TabsTrigger 
            value="categories" 
            className="flex items-center gap-2 h-10 data-[state=active]:bg-card data-[state=active]:shadow-sm"
          >
            <Target className="w-4 h-4" />
            Categories
          </TabsTrigger>
          <TabsTrigger 
            value="processing" 
            className="flex items-center gap-2 h-10 data-[state=active]:bg-card data-[state=active]:shadow-sm"
          >
            <ArrowsClockwise className="w-4 h-4" />
            Processing
          </TabsTrigger>
          <TabsTrigger 
            value="ai" 
            className="flex items-center gap-2 h-10 data-[state=active]:bg-card data-[state=active]:shadow-sm"
          >
            <Brain className="w-4 h-4" />
            AI Settings
          </TabsTrigger>
        </TabsList>

        {/* Pricing Rules Tab */}
        <TabsContent value="pricing" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Rules List */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Percent className="w-5 h-5" />
                        Pricing Rules
                      </CardTitle>
                      <CardDescription>
                        Configure markup and rounding strategies for different product categories and conditions
                      </CardDescription>
                    </div>
                    <Button onClick={addNewRule} size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Rule
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-3">
                      {(pricingRules || []).map((rule) => (
                        <motion.div
                          key={rule.id}
                          layout
                          className={cn(
                            "border border-border rounded-lg p-4 cursor-pointer transition-all hover:border-primary/50",
                            selectedRule?.id === rule.id && "border-primary bg-primary/5"
                          )}
                          onClick={() => {
                            setSelectedRule(rule)
                            setIsEditing(false)
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Switch
                                checked={rule.enabled}
                                onCheckedChange={(enabled) => {
                                  setPricingRules(current => 
                                    current?.map(r => 
                                      r.id === rule.id ? { ...r, enabled } : r
                                    ) || []
                                  )
                                }}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div>
                                <p className="font-medium">{rule.name}</p>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Badge variant="outline" className="text-xs">
                                    {rule.markupType === 'percentage' ? `${rule.markupValue}%` : `$${rule.markupValue}`}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    {rule.roundingStrategy}
                                  </Badge>
                                  {rule.roundingStrategy === 'psychological' && (
                                    <Badge variant="outline" className="text-xs">
                                      {rule.psychologicalEnding}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary">Priority {rule.priority}</Badge>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  deleteRule(rule.id)
                                }}
                              >
                                <Minus className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* Rule Editor */}
            <div className="space-y-6">
              {/* Rule Configuration */}
              {selectedRule && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      Rule Configuration
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsEditing(!isEditing)}
                      >
                        {isEditing ? 'Cancel' : 'Edit'}
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {isEditing ? (
                      <RuleEditor
                        rule={selectedRule}
                        onSave={saveRule}
                        onCancel={() => setIsEditing(false)}
                      />
                    ) : (
                      <RuleDisplay rule={selectedRule} />
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Price Calculator */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="w-5 h-5" />
                    Price Calculator
                  </CardTitle>
                  <CardDescription>
                    Test your pricing rules with sample data
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div>
                      <Label>Base Price</Label>
                      <Input
                        type="number"
                        value={testPrice}
                        onChange={(e) => setTestPrice(parseFloat(e.target.value) || 0)}
                        placeholder="25.00"
                        step="0.01"
                      />
                    </div>
                    <div>
                      <Label>Category (optional)</Label>
                      <Input
                        value={testCategory}
                        onChange={(e) => setTestCategory(e.target.value)}
                        placeholder="Electronics"
                      />
                    </div>
                    <div>
                      <Label>Supplier (optional)</Label>
                      <Input
                        value={testSupplier}
                        onChange={(e) => setTestSupplier(e.target.value)}
                        placeholder="TechnoSupply Co."
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="bg-muted/50 rounded-lg p-4">
                    <div className="text-center">
                      <div className="text-sm text-muted-foreground mb-1">Calculated Price</div>
                      <div className="text-3xl font-bold text-primary">
                        ${testCalculatedPrice.toFixed(2)}
                      </div>
                      <div className="text-sm text-muted-foreground mt-2">
                        Markup: {((testCalculatedPrice - testPrice) / testPrice * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="w-5 h-5" />
                    Category Mappings
                  </CardTitle>
                  <CardDescription>
                    Map supplier categories to your Shopify categories with default markup rules
                  </CardDescription>
                </div>
                <Button onClick={addCategoryMapping} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Mapping
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(categoryMappings || []).map((mapping, index) => (
                  <motion.div
                    key={index}
                    layout
                    className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 border border-border rounded-lg"
                  >
                    <div>
                      <Label>Supplier Category</Label>
                      <Input
                        value={mapping.supplierCategory}
                        onChange={(e) => updateCategoryMapping(index, { 
                          ...mapping, 
                          supplierCategory: e.target.value 
                        })}
                        placeholder="Electronics"
                      />
                    </div>
                    <div>
                      <Label>Shopify Category</Label>
                      <Input
                        value={mapping.shopifyCategory}
                        onChange={(e) => updateCategoryMapping(index, { 
                          ...mapping, 
                          shopifyCategory: e.target.value 
                        })}
                        placeholder="Electronics"
                      />
                    </div>
                    <div>
                      <Label>Default Markup (%)</Label>
                      <Input
                        type="number"
                        value={mapping.defaultMarkup}
                        onChange={(e) => updateCategoryMapping(index, { 
                          ...mapping, 
                          defaultMarkup: parseFloat(e.target.value) || 0
                        })}
                        placeholder="40"
                      />
                    </div>
                    <div className="flex items-end">
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={mapping.enabled}
                          onCheckedChange={(enabled) => updateCategoryMapping(index, { 
                            ...mapping, 
                            enabled 
                          })}
                        />
                        <Label>Enabled</Label>
                      </div>
                    </div>
                    <div className="flex items-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteCategoryMapping(index)}
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Processing Tab */}
        <TabsContent value="processing" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowsClockwise className="w-5 h-5" />
                  Batch Processing
                </CardTitle>
                <CardDescription>
                  Configure how bulk uploads are processed
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Batch Size</Label>
                    <span className="text-sm text-muted-foreground">{bulkConfig?.batchSize || 50} items</span>
                  </div>
                  <Slider
                    value={[bulkConfig?.batchSize || 50]}
                    onValueChange={(value) => setBulkConfig(current => ({ ...current!, batchSize: value[0] }))}
                    max={200}
                    min={10}
                    step={10}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Number of items to process in each batch
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Processing Delay</Label>
                    <span className="text-sm text-muted-foreground">{bulkConfig?.processingDelay || 500}ms</span>
                  </div>
                  <Slider
                    value={[bulkConfig?.processingDelay || 500]}
                    onValueChange={(value) => setBulkConfig(current => ({ ...current!, processingDelay: value[0] }))}
                    max={2000}
                    min={100}
                    step={100}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Delay between processing each item to prevent API rate limiting
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Auto-Approve Threshold</Label>
                    <span className="text-sm text-muted-foreground">{bulkConfig?.autoApproveThreshold || 95}%</span>
                  </div>
                  <Slider
                    value={[bulkConfig?.autoApproveThreshold || 95]}
                    onValueChange={(value) => setBulkConfig(current => ({ ...current!, autoApproveThreshold: value[0] }))}
                    max={100}
                    min={70}
                    step={5}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Auto-approve items with AI confidence above this threshold
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Processing Options
                </CardTitle>
                <CardDescription>
                  Control how products are created and updated
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Skip Duplicates</Label>
                      <p className="text-sm text-muted-foreground">Skip products that already exist</p>
                    </div>
                    <Switch
                      checked={bulkConfig?.skipDuplicates || false}
                      onCheckedChange={(skipDuplicates) => setBulkConfig(current => ({ ...current!, skipDuplicates }))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Update Existing</Label>
                      <p className="text-sm text-muted-foreground">Update existing products with new data</p>
                    </div>
                    <Switch
                      checked={bulkConfig?.updateExistingProducts || false}
                      onCheckedChange={(updateExistingProducts) => setBulkConfig(current => ({ ...current!, updateExistingProducts }))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Create Missing Categories</Label>
                      <p className="text-sm text-muted-foreground">Auto-create categories that don't exist</p>
                    </div>
                    <Switch
                      checked={bulkConfig?.createMissingCategories || true}
                      onCheckedChange={(createMissingCategories) => setBulkConfig(current => ({ ...current!, createMissingCategories }))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Generate Descriptions</Label>
                      <p className="text-sm text-muted-foreground">AI-generated product descriptions</p>
                    </div>
                    <Switch
                      checked={bulkConfig?.enableDescriptionGeneration || true}
                      onCheckedChange={(enableDescriptionGeneration) => setBulkConfig(current => ({ ...current!, enableDescriptionGeneration }))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>SEO Optimization</Label>
                      <p className="text-sm text-muted-foreground">Optimize titles and meta descriptions</p>
                    </div>
                    <Switch
                      checked={bulkConfig?.enableSEOOptimization || true}
                      onCheckedChange={(enableSEOOptimization) => setBulkConfig(current => ({ ...current!, enableSEOOptimization }))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Backup Before Processing</Label>
                      <p className="text-sm text-muted-foreground">Create backup before making changes</p>
                    </div>
                    <Switch
                      checked={bulkConfig?.backupBeforeProcessing || true}
                      onCheckedChange={(backupBeforeProcessing) => setBulkConfig(current => ({ ...current!, backupBeforeProcessing }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* AI Settings Tab */}
        <TabsContent value="ai" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="w-5 h-5" />
                  AI Processing Settings
                </CardTitle>
                <CardDescription>
                  Configure AI-powered features and thresholds
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Confidence Threshold</Label>
                    <span className="text-sm text-muted-foreground">{aiConfig?.confidenceThreshold || 85}%</span>
                  </div>
                  <Slider
                    value={[aiConfig?.confidenceThreshold || 85]}
                    onValueChange={(value) => setAiConfig(current => ({ ...current!, confidenceThreshold: value[0] }))}
                    max={100}
                    min={50}
                    step={5}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Minimum confidence level for AI-parsed data acceptance
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Advanced OCR</Label>
                      <p className="text-sm text-muted-foreground">Enhanced optical character recognition</p>
                    </div>
                    <Switch
                      checked={aiConfig?.enableAdvancedOCR || true}
                      onCheckedChange={(enableAdvancedOCR) => setAiConfig(current => ({ ...current!, enableAdvancedOCR }))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Data Validation</Label>
                      <p className="text-sm text-muted-foreground">Validate parsed data against business rules</p>
                    </div>
                    <Switch
                      checked={aiConfig?.enableDataValidation || true}
                      onCheckedChange={(enableDataValidation) => setAiConfig(current => ({ ...current!, enableDataValidation }))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Smart Matching</Label>
                      <p className="text-sm text-muted-foreground">Match products to existing inventory</p>
                    </div>
                    <Switch
                      checked={aiConfig?.enableSmartMatching || true}
                      onCheckedChange={(enableSmartMatching) => setAiConfig(current => ({ ...current!, enableSmartMatching }))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Predictive Correction</Label>
                      <p className="text-sm text-muted-foreground">Auto-correct common data entry errors</p>
                    </div>
                    <Switch
                      checked={aiConfig?.enablePredictiveCorrection || false}
                      onCheckedChange={(enablePredictiveCorrection) => setAiConfig(current => ({ ...current!, enablePredictiveCorrection }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MagicWand className="w-5 h-5" />
                  Custom AI Prompts
                </CardTitle>
                <CardDescription>
                  Customize AI behavior with tailored prompts
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Product Description Generation</Label>
                  <Textarea
                    value={aiConfig?.customPrompts.productDescription || ''}
                    onChange={(e) => setAiConfig(current => ({ 
                      ...current!, 
                      customPrompts: { 
                        ...current!.customPrompts, 
                        productDescription: e.target.value 
                      }
                    }))}
                    placeholder="Generate a compelling product description..."
                    rows={3}
                  />
                </div>

                <div>
                  <Label>Category Classification</Label>
                  <Textarea
                    value={aiConfig?.customPrompts.categoryClassification || ''}
                    onChange={(e) => setAiConfig(current => ({ 
                      ...current!, 
                      customPrompts: { 
                        ...current!.customPrompts, 
                        categoryClassification: e.target.value 
                      }
                    }))}
                    placeholder="Classify this product into the most appropriate category..."
                    rows={3}
                  />
                </div>

                <div>
                  <Label>Price Validation</Label>
                  <Textarea
                    value={aiConfig?.customPrompts.priceValidation || ''}
                    onChange={(e) => setAiConfig(current => ({ 
                      ...current!, 
                      customPrompts: { 
                        ...current!.customPrompts, 
                        priceValidation: e.target.value 
                      }
                    }))}
                    placeholder="Validate this price against market standards..."
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Helper Components
function RuleEditor({ rule, onSave, onCancel }: { rule: PricingRule, onSave: (rule: PricingRule) => void, onCancel: () => void }) {
  const [editedRule, setEditedRule] = useState<PricingRule>({ ...rule })

  return (
    <div className="space-y-4">
      <div>
        <Label>Rule Name</Label>
        <Input
          value={editedRule.name}
          onChange={(e) => setEditedRule(prev => ({ ...prev, name: e.target.value }))}
        />
      </div>

      <div>
        <Label>Markup Type</Label>
        <Select
          value={editedRule.markupType}
          onValueChange={(markupType: 'percentage' | 'fixed' | 'tiered') => 
            setEditedRule(prev => ({ ...prev, markupType }))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="percentage">Percentage</SelectItem>
            <SelectItem value="fixed">Fixed Amount</SelectItem>
            <SelectItem value="tiered">Tiered</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Markup Value</Label>
        <Input
          type="number"
          value={editedRule.markupValue}
          onChange={(e) => setEditedRule(prev => ({ ...prev, markupValue: parseFloat(e.target.value) || 0 }))}
        />
      </div>

      <div>
        <Label>Rounding Strategy</Label>
        <Select
          value={editedRule.roundingStrategy}
          onValueChange={(roundingStrategy: 'none' | 'up' | 'down' | 'nearest' | 'psychological') => 
            setEditedRule(prev => ({ ...prev, roundingStrategy }))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="up">Round Up</SelectItem>
            <SelectItem value="down">Round Down</SelectItem>
            <SelectItem value="nearest">Round to Nearest</SelectItem>
            <SelectItem value="psychological">Psychological Pricing</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {editedRule.roundingStrategy === 'psychological' && (
        <div>
          <Label>Price Ending</Label>
          <Select
            value={editedRule.psychologicalEnding}
            onValueChange={(psychologicalEnding) => 
              setEditedRule(prev => ({ ...prev, psychologicalEnding }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value=".99">$X.99</SelectItem>
              <SelectItem value=".95">$X.95</SelectItem>
              <SelectItem value=".49">$X.49</SelectItem>
              <SelectItem value=".97">$X.97</SelectItem>
              <SelectItem value=".89">$X.89</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div>
        <Label>Priority (lower = higher priority)</Label>
        <Input
          type="number"
          value={editedRule.priority}
          onChange={(e) => setEditedRule(prev => ({ ...prev, priority: parseInt(e.target.value) || 10 }))}
        />
      </div>

      <div className="flex items-center gap-2 pt-4">
        <Button onClick={() => onSave(editedRule)} size="sm">
          <Check className="w-4 h-4 mr-2" />
          Save
        </Button>
        <Button variant="outline" onClick={onCancel} size="sm">
          Cancel
        </Button>
      </div>
    </div>
  )
}

function RuleDisplay({ rule }: { rule: PricingRule }) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-muted-foreground">Markup</Label>
        <p className="font-medium">
          {rule.markupType === 'percentage' ? `${rule.markupValue}%` : `$${rule.markupValue}`}
        </p>
      </div>

      <div>
        <Label className="text-muted-foreground">Rounding</Label>
        <p className="font-medium capitalize">{rule.roundingStrategy}</p>
      </div>

      {rule.roundingStrategy === 'psychological' && (
        <div>
          <Label className="text-muted-foreground">Price Ending</Label>
          <p className="font-medium">{rule.psychologicalEnding}</p>
        </div>
      )}

      <div>
        <Label className="text-muted-foreground">Priority</Label>
        <p className="font-medium">{rule.priority}</p>
      </div>

      {Object.keys(rule.conditions).length > 0 && (
        <div>
          <Label className="text-muted-foreground">Conditions</Label>
          <div className="space-y-1">
            {rule.conditions.category && (
              <Badge variant="outline">Category: {rule.conditions.category}</Badge>
            )}
            {rule.conditions.supplier && (
              <Badge variant="outline">Supplier: {rule.conditions.supplier}</Badge>
            )}
            {rule.conditions.minPrice && (
              <Badge variant="outline">Min: ${rule.conditions.minPrice}</Badge>
            )}
            {rule.conditions.maxPrice && (
              <Badge variant="outline">Max: ${rule.conditions.maxPrice}</Badge>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
