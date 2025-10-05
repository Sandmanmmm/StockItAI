// TypeScript types for Refinement Engine Configuration
export interface PricingRefinementConfig {
  enabled: boolean;
  globalMarkup: MarkupConfiguration;
  currencyConversion: CurrencyConfiguration;
  roundingRules: RoundingConfiguration;
  priceValidation: PriceValidationConfiguration;
}

export interface MarkupConfiguration {
  type: 'percentage' | 'fixed_amount' | 'margin_based' | 'custom_formula';
  value: number;
  minMarkup?: number;
  maxMarkup?: number;
  customFormula?: string; // JavaScript expression for custom calculation
}

export interface CurrencyConfiguration {
  enabled: boolean;
  sourceCurrency: string;
  targetCurrency: string;
  exchangeRateSource: 'manual' | 'auto' | 'api';
  manualRate?: number;
  autoUpdateInterval?: number; // hours
  apiProvider?: 'fixer' | 'currencylayer' | 'exchangerate';
}

export interface RoundingConfiguration {
  enabled: boolean;
  rule: 'none' | 'nearest_cent' | 'nearest_nickel' | 'nearest_dime' | 
        'nearest_quarter' | 'nearest_half' | 'nearest_dollar' | 
        'psychological_99' | 'psychological_95';
  customRounding?: {
    roundTo: number; // e.g., 0.05 for nickel rounding
    direction: 'up' | 'down' | 'nearest';
  };
}

export interface PriceValidationConfiguration {
  enabled: boolean;
  minPrice?: number;
  maxPrice?: number;
  validateAgainstCost: boolean;
  minimumMarginPercentage?: number;
  flagUnusualPrices: boolean;
  unusualPriceThreshold?: number; // multiplier (e.g., 10x cost)
}

export interface CategorizationRefinementConfig {
  enabled: boolean;
  autoMapping: AutoMappingConfiguration;
  defaultCategory: DefaultCategoryConfiguration;
  hierarchyMapping: HierarchyMappingConfiguration;
  customMappings: CategoryMappingRule[];
}

export interface AutoMappingConfiguration {
  enabled: boolean;
  algorithm: 'keyword_matching' | 'semantic_similarity' | 'ml_classification';
  confidenceThreshold: number;
  learnFromCorrections: boolean;
  useShopifyCollections: boolean;
}

export interface DefaultCategoryConfiguration {
  enabled: boolean;
  defaultCollectionId?: string;
  defaultCollectionName?: string;
  createMissingCollections: boolean;
  categoryPrefix?: string; // e.g., "Imported-"
}

export interface HierarchyMappingConfiguration {
  enabled: boolean;
  separators: string[]; // e.g., [">", "/", "|"]
  maxDepth: number;
  createSubCollections: boolean;
  preserveVendorHierarchy: boolean;
}

export interface CategoryMappingRule {
  id: string;
  name: string;
  priority: number;
  sourcePattern: string; // regex or exact match
  targetCollection: string;
  targetCollectionId?: string;
  conditions?: MappingCondition[];
  isEnabled: boolean;
}

export interface MappingCondition {
  field: 'supplier' | 'price_range' | 'sku_pattern' | 'product_title';
  operator: 'equals' | 'contains' | 'starts_with' | 'ends_with' | 'regex' | 'range';
  value: string | number | [number, number];
}

export interface ContentRefinementConfig {
  enabled: boolean;
  seoOptimization: SEOOptimizationConfiguration;
  brandVoice: BrandVoiceConfiguration;
  imageProcessing: ImageProcessingConfiguration;
  contentGeneration: ContentGenerationConfiguration;
}

export interface SEOOptimizationConfiguration {
  enabled: boolean;
  generateDescriptions: boolean;
  descriptionTemplate?: string;
  keywordDensity: number; // percentage
  metaTagGeneration: boolean;
  titleOptimization: boolean;
  maxTitleLength: number;
  includeSupplierInTitle: boolean;
}

export interface BrandVoiceConfiguration {
  enabled: boolean;
  brandVoicePrompt: string;
  toneKeywords: string[]; // e.g., ["professional", "friendly", "technical"]
  rewriteDescriptions: boolean;
  rewriteTitles: boolean;
  preserveTechnicalSpecs: boolean;
  modelToUse: 'gpt-4' | 'gpt-3.5-turbo' | 'claude';
}

export interface ImageProcessingConfiguration {
  enabled: boolean;
  fallbackImageSearch: boolean;
  imageEnhancement: boolean;
  autoAltText: boolean;
  imageFormats: string[]; // ['jpg', 'png', 'webp']
  maxImageSize: number; // MB
  compressionQuality: number; // 1-100
  fallbackSources: string[]; // URLs or services
}

export interface ContentGenerationConfiguration {
  enabled: boolean;
  generateMissingFields: string[]; // ['description', 'title', 'tags']
  templateLibrary: ContentTemplate[];
  aiEnrichment: boolean;
  factChecking: boolean;
  contentApprovalRequired: boolean;
}

export interface ContentTemplate {
  id: string;
  name: string;
  category: string;
  template: string;
  variables: string[]; // Available template variables
  isEnabled: boolean;
}

export interface DeduplicationRefinementConfig {
  enabled: boolean;
  matchingCriteria: MatchingCriteriaConfiguration;
  duplicateActions: DuplicateActionConfiguration;
  performanceSettings: PerformanceConfiguration;
}

export interface MatchingCriteriaConfiguration {
  primaryFields: string[]; // ['sku', 'barcode', 'title']
  secondaryFields: string[]; // ['description', 'supplier']
  matchThresholds: {
    exact: number;
    fuzzy: number;
    semantic: number;
  };
  ignoreFields: string[]; // Fields to ignore during matching
  caseInsensitive: boolean;
  normalizeSpaces: boolean;
}

export interface DuplicateActionConfiguration {
  onExactMatch: 'skip' | 'update' | 'create_variant' | 'queue_review';
  onFuzzyMatch: 'skip' | 'update' | 'create_variant' | 'queue_review';
  onSemanticMatch: 'skip' | 'update' | 'create_variant' | 'queue_review';
  updateBehavior: UpdateBehaviorConfiguration;
  variantBehavior: VariantBehaviorConfiguration;
}

export interface UpdateBehaviorConfiguration {
  updateFields: string[]; // Which fields to update
  preserveManualChanges: boolean;
  backupOriginal: boolean;
  requireApproval: boolean;
  mergeStrategy: 'overwrite' | 'merge' | 'append';
}

export interface VariantBehaviorConfiguration {
  createAsVariant: boolean;
  variantDifferentiator: string; // What makes it a variant (size, color, etc.)
  maxVariantsPerProduct: number;
  combineInventory: boolean;
}

export interface PerformanceConfiguration {
  batchSize: number;
  maxConcurrency: number;
  cacheResults: boolean;
  cacheDuration: number; // hours
  enableIndexing: boolean;
}

export interface ProcessingRefinementConfig {
  enabled: boolean;
  qualityChecks: QualityCheckConfiguration;
  validation: ValidationConfiguration;
  workflow: WorkflowConfiguration;
  notifications: NotificationConfiguration;
}

export interface QualityCheckConfiguration {
  enabled: boolean;
  requiredFields: string[];
  fieldValidation: Record<string, FieldValidationRule>;
  dataIntegrityChecks: boolean;
  flagIncompleteProducts: boolean;
  qualityScore: boolean;
  minimumQualityScore: number;
}

export interface FieldValidationRule {
  required: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string; // regex
  allowedValues?: string[];
  customValidator?: string; // JavaScript function
}

export interface ValidationConfiguration {
  priceValidation: boolean;
  inventoryValidation: boolean;
  categoryValidation: boolean;
  supplierValidation: boolean;
  stopOnValidationError: boolean;
  validationRules: ValidationRule[];
}

export interface ValidationRule {
  id: string;
  name: string;
  field: string;
  condition: string;
  errorMessage: string;
  severity: 'error' | 'warning' | 'info';
  isEnabled: boolean;
}

export interface WorkflowConfiguration {
  autoApprove: boolean;
  autoApproveThreshold: number;
  requireReviewThreshold: number;
  escalationRules: EscalationRule[];
  batchProcessing: boolean;
  maxBatchSize: number;
}

export interface EscalationRule {
  condition: string;
  action: 'notify' | 'assign' | 'hold' | 'auto_reject';
  recipient?: string;
  message?: string;
}

export interface NotificationConfiguration {
  enabled: boolean;
  channels: ('email' | 'webhook' | 'dashboard')[];
  events: string[]; // Which events to notify about
  frequency: 'immediate' | 'batched' | 'daily_summary';
  recipients: string[];
}

// Main configuration interface
export interface MerchantRefinementConfiguration {
  id: string;
  merchantId: string;
  shopDomain: string;
  configVersion: string;
  isEnabled: boolean;
  autoApplyRules: boolean;
  requireReviewThreshold: number;
  
  pricing: PricingRefinementConfig;
  categorization: CategorizationRefinementConfig;
  content: ContentRefinementConfig;
  deduplication: DeduplicationRefinementConfig;
  processing: ProcessingRefinementConfig;
  
  createdAt: Date;
  updatedAt: Date;
}

// Configuration update interfaces
export interface RefinementConfigUpdate {
  pricing?: Partial<PricingRefinementConfig>;
  categorization?: Partial<CategorizationRefinementConfig>;
  content?: Partial<ContentRefinementConfig>;
  deduplication?: Partial<DeduplicationRefinementConfig>;
  processing?: Partial<ProcessingRefinementConfig>;
  
  isEnabled?: boolean;
  autoApplyRules?: boolean;
  requireReviewThreshold?: number;
}

// Rule execution context
export interface RefinementContext {
  merchantId: string;
  uploadId: string;
  purchaseOrderId: string;
  sourceData: any;
  existingProducts?: any[];
  supplierInfo?: any;
  processingOptions?: any;
}

// Rule execution result
export interface RefinementResult {
  success: boolean;
  originalData: any;
  refinedData: any;
  appliedRules: string[];
  warnings: string[];
  errors: string[];
  qualityScore?: number;
  needsReview: boolean;
  metadata: {
    processingTime: number;
    rulesExecuted: number;
    dataChanges: Record<string, any>;
  };
}