// Refinement Configuration Service
import { db, prismaOperation } from '../lib/db.js';

export class RefinementConfigService {
  constructor(prisma) {
    this.prisma = prisma || null;
  }

  async getPrisma() {
    if (!this.prisma) {
      this.prisma = await db.getClient();
    }
    return this.prisma;
  }

  /**
   * Get merchant's refinement configuration
   */
  async getMerchantConfig(merchantId) {
    // Use retry wrapper for transient connection errors
    const prisma = await this.getPrisma();
    const config = await prismaOperation(
      (client) => client.merchantRefinementConfig.findUnique({
        where: { merchantId }
      }),
      `Get merchant refinement config for ${merchantId}`
    );

    if (!config) return null;

    return config;
  }

  /**
   * Create or update merchant's refinement configuration
   */
  async updateMerchantConfig(merchantId, updates) {
    const prisma = await this.getPrisma();
    const merchant = await prismaOperation(
      (client) => client.merchant.findUnique({
        where: { id: merchantId },
        select: { shopDomain: true }
      }),
      `Find merchant ${merchantId}`
    );

    if (!merchant) {
      throw new Error(`Merchant ${merchantId} not found`);
    }

    // Check if config exists
    const existingConfig = await prismaOperation(
      (client) => client.merchantRefinementConfig.findUnique({
        where: { merchantId }
      }),
      `Find existing refinement config for ${merchantId}`
    );

    let config;
    if (existingConfig) {
      // Update existing configuration
      config = await prisma.merchantRefinementConfig.update({
        where: { merchantId },
        data: {
          isEnabled: updates.isEnabled ?? existingConfig.isEnabled,
          autoApplyRules: updates.autoApplyRules ?? existingConfig.autoApplyRules,
          requireReviewThreshold: updates.requireReviewThreshold ?? existingConfig.requireReviewThreshold,
          pricingConfig: updates.pricing ? 
            this.mergeConfig(existingConfig.pricingConfig, updates.pricing) : 
            existingConfig.pricingConfig,
          categorizationConfig: updates.categorization ? 
            this.mergeConfig(existingConfig.categorizationConfig, updates.categorization) : 
            existingConfig.categorizationConfig,
          contentConfig: updates.content ? 
            this.mergeConfig(existingConfig.contentConfig, updates.content) : 
            existingConfig.contentConfig,
          deduplicationConfig: updates.deduplication ? 
            this.mergeConfig(existingConfig.deduplicationConfig, updates.deduplication) : 
            existingConfig.deduplicationConfig,
          processingConfig: updates.processing ? 
            this.mergeConfig(existingConfig.processingConfig, updates.processing) : 
            existingConfig.processingConfig,
          updatedAt: new Date()
        },
        include: {
          categoryMappings: true,
          pricingRules: true,
          contentRules: true,
          deduplicationRules: true
        }
      });
    } else {
      // Create new configuration with defaults
      config = await prisma.merchantRefinementConfig.create({
        data: {
          merchantId,
          shopDomain: merchant.shopDomain,
          isEnabled: updates.isEnabled ?? true,
          autoApplyRules: updates.autoApplyRules ?? false,
          requireReviewThreshold: updates.requireReviewThreshold ?? 0.8,
          pricingConfig: updates.pricing ?? this.getDefaultPricingConfig(),
          categorizationConfig: updates.categorization ?? this.getDefaultCategorizationConfig(),
          contentConfig: updates.content ?? this.getDefaultContentConfig(),
          deduplicationConfig: updates.deduplication ?? this.getDefaultDeduplicationConfig(),
          processingConfig: updates.processing ?? this.getDefaultProcessingConfig()
        },
        include: {
          categoryMappings: true,
          pricingRules: true,
          contentRules: true,
          deduplicationRules: true
        }
      });
    }

    return this.transformDatabaseConfig(config);
  }

  /**
   * Get default pricing configuration
   */
  getDefaultPricingConfig() {
    return {
      enabled: true,
      globalMarkup: {
        type: 'percentage',
        value: 1.5, // 50% markup
        minMarkup: 1.1,
        maxMarkup: 3.0
      },
      currencyConversion: {
        enabled: false,
        sourceCurrency: 'USD',
        targetCurrency: 'USD',
        exchangeRateSource: 'auto'
      },
      roundingRules: {
        enabled: true,
        rule: 'psychological_99'
      },
      priceValidation: {
        enabled: true,
        minPrice: 0.01,
        validateAgainstCost: true,
        minimumMarginPercentage: 10,
        flagUnusualPrices: true,
        unusualPriceThreshold: 10
      }
    };
  }

  /**
   * Get default categorization configuration
   */
  getDefaultCategorizationConfig() {
    return {
      enabled: true,
      autoMapping: {
        enabled: true,
        algorithm: 'keyword_matching',
        confidenceThreshold: 0.7,
        learnFromCorrections: true,
        useShopifyCollections: true
      },
      defaultCategory: {
        enabled: true,
        defaultCollectionName: 'Imported Products',
        createMissingCollections: true,
        categoryPrefix: 'Auto-'
      },
      hierarchyMapping: {
        enabled: true,
        separators: ['>', '/', '|', '-'],
        maxDepth: 3,
        createSubCollections: false,
        preserveVendorHierarchy: true
      },
      customMappings: []
    };
  }

  /**
   * Get default content configuration
   */
  getDefaultContentConfig() {
    return {
      enabled: true,
      seoOptimization: {
        enabled: true,
        generateDescriptions: true,
        keywordDensity: 2.5,
        metaTagGeneration: true,
        titleOptimization: true,
        maxTitleLength: 255,
        includeSupplierInTitle: false
      },
      brandVoice: {
        enabled: false,
        brandVoicePrompt: 'Write in a professional, customer-focused tone',
        toneKeywords: ['professional', 'helpful', 'clear'],
        rewriteDescriptions: false,
        rewriteTitles: false,
        preserveTechnicalSpecs: true,
        modelToUse: 'gpt-3.5-turbo'
      },
      imageProcessing: {
        enabled: true,
        fallbackImageSearch: true,
        imageEnhancement: false,
        autoAltText: true,
        imageFormats: ['jpg', 'png', 'webp'],
        maxImageSize: 5,
        compressionQuality: 85,
        fallbackSources: []
      },
      contentGeneration: {
        enabled: true,
        generateMissingFields: ['description'],
        templateLibrary: [],
        aiEnrichment: true,
        factChecking: false,
        contentApprovalRequired: false
      }
    };
  }

  /**
   * Get default deduplication configuration
   */
  getDefaultDeduplicationConfig() {
    return {
      enabled: true,
      matchingCriteria: {
        primaryFields: ['sku', 'barcode'],
        secondaryFields: ['title'],
        matchThresholds: {
          exact: 1.0,
          fuzzy: 0.9,
          semantic: 0.8
        },
        ignoreFields: ['description', 'price'],
        caseInsensitive: true,
        normalizeSpaces: true
      },
      duplicateActions: {
        onExactMatch: 'skip',
        onFuzzyMatch: 'queue_review',
        onSemanticMatch: 'queue_review',
        updateBehavior: {
          updateFields: ['price', 'inventory'],
          preserveManualChanges: true,
          backupOriginal: true,
          requireApproval: true,
          mergeStrategy: 'merge'
        },
        variantBehavior: {
          createAsVariant: false,
          variantDifferentiator: 'size',
          maxVariantsPerProduct: 10,
          combineInventory: false
        }
      },
      performanceSettings: {
        batchSize: 100,
        maxConcurrency: 5,
        cacheResults: true,
        cacheDuration: 24,
        enableIndexing: true
      }
    };
  }

  /**
   * Get default processing configuration
   */
  getDefaultProcessingConfig() {
    return {
      enabled: true,
      qualityChecks: {
        enabled: true,
        requiredFields: ['title', 'price'],
        fieldValidation: {
          title: {
            required: true,
            minLength: 3,
            maxLength: 255
          },
          price: {
            required: true,
            pattern: '^\\d+(\\.\\d{1,2})?$'
          },
          sku: {
            required: false,
            minLength: 1,
            maxLength: 100
          }
        },
        dataIntegrityChecks: true,
        flagIncompleteProducts: true,
        qualityScore: true,
        minimumQualityScore: 70
      },
      validation: {
        priceValidation: true,
        inventoryValidation: false,
        categoryValidation: true,
        supplierValidation: false,
        stopOnValidationError: false,
        validationRules: []
      },
      workflow: {
        autoApprove: false,
        autoApproveThreshold: 0.9,
        requireReviewThreshold: 0.7,
        escalationRules: [],
        batchProcessing: true,
        maxBatchSize: 50
      },
      notifications: {
        enabled: true,
        channels: ['dashboard'],
        events: ['processing_complete', 'errors', 'quality_issues'],
        frequency: 'immediate',
        recipients: []
      }
    };
  }

  /**
   * Get default configuration template
   */
  async getDefaultConfiguration() {
    return {
      isEnabled: true,
      autoApplyRules: false,
      requireReviewThreshold: 0.8,
      pricing: this.getDefaultPricingConfig(),
      categorization: this.getDefaultCategorizationConfig(),
      content: this.getDefaultContentConfig(),
      deduplication: this.getDefaultDeduplicationConfig(),
      processing: this.getDefaultProcessingConfig()
    };
  }

  /**
   * Add or update a category mapping rule
   */
  async addCategoryMapping(merchantId, mapping) {
    const prisma = await this.getPrisma();
    const config = await this.ensureConfigExists(merchantId);
    
    return await prisma.categoryMapping.create({
      data: {
        merchantId,
        configId: config.id,
        sourceCategory: mapping.sourceCategory,
        sourcePattern: mapping.sourcePattern,
        targetCollection: mapping.targetCollection,
        targetCollectionId: mapping.targetCollectionId,
        priority: mapping.priority ?? 0
      }
    });
  }

  /**
   * Add or update a pricing rule
   */
  async addPricingRule(merchantId, rule) {
    const prisma = await this.getPrisma();
    const config = await this.ensureConfigExists(merchantId);
    
    return await prisma.pricingRule.create({
      data: {
        merchantId,
        configId: config.id,
        name: rule.name,
        description: rule.description,
        ruleType: rule.ruleType,
        conditions: rule.conditions,
        markupType: rule.markupType,
        markupValue: rule.markupValue,
        roundingRule: rule.roundingRule,
        minPrice: rule.minPrice,
        maxPrice: rule.maxPrice,
        priority: rule.priority ?? 0
      }
    });
  }

  /**
   * Add content rule
   */
  async addContentRule(merchantId, rule) {
    const prisma = await this.getPrisma();
    const config = await this.ensureConfigExists(merchantId);
    
    return await prisma.contentRule.create({
      data: {
        merchantId,
        configId: config.id,
        name: rule.name,
        description: rule.description,
        ruleType: rule.ruleType,
        targetField: rule.targetField,
        sourceFields: rule.sourceFields,
        transformationType: rule.transformationType,
        transformationConfig: rule.transformationConfig,
        conditions: rule.conditions,
        priority: rule.priority ?? 0
      }
    });
  }

  /**
   * Add deduplication rule
   */
  async addDeduplicationRule(merchantId, rule) {
    const prisma = await this.getPrisma();
    const config = await this.ensureConfigExists(merchantId);
    
    return await prisma.deduplicationRule.create({
      data: {
        merchantId,
        configId: config.id,
        name: rule.name,
        description: rule.description,
        matchFields: rule.matchFields,
        matchType: rule.matchType,
        threshold: rule.threshold,
        action: rule.action,
        mergeStrategy: rule.mergeStrategy,
        conditions: rule.conditions,
        priority: rule.priority ?? 0
      }
    });
  }

  /**
   * Update category mapping
   */
  async updateCategoryMapping(merchantId, mappingId, mapping) {
    const prisma = await this.getPrisma();
    return await prisma.categoryMapping.update({
      where: {
        id: mappingId,
        merchantId: merchantId
      },
      data: {
        sourceCategory: mapping.sourceCategory,
        sourcePattern: mapping.sourcePattern,
        targetCollection: mapping.targetCollection,
        targetCollectionId: mapping.targetCollectionId,
        priority: mapping.priority ?? undefined
      }
    });
  }

  /**
   * Delete category mapping
   */
  async deleteCategoryMapping(merchantId, mappingId) {
    const prisma = await this.getPrisma();
    return await prisma.categoryMapping.delete({
      where: {
        id: mappingId,
        merchantId: merchantId
      }
    });
  }

  /**
   * Delete pricing rule
   */
  async deletePricingRule(merchantId, ruleId) {
    const prisma = await this.getPrisma();
    return await prisma.pricingRule.delete({
      where: {
        id: ruleId,
        merchantId: merchantId
      }
    });
  }

  /**
   * Delete content rule
   */
  async deleteContentRule(merchantId, ruleId) {
    const prisma = await this.getPrisma();
    return await prisma.contentRule.delete({
      where: {
        id: ruleId,
        merchantId: merchantId
      }
    });
  }

  /**
   * Delete deduplication rule
   */
  async deleteDeduplicationRule(merchantId, ruleId) {
    const prisma = await this.getPrisma();
    return await prisma.deduplicationRule.delete({
      where: {
        id: ruleId,
        merchantId: merchantId
      }
    });
  }

  /**
   * Test pricing rules against sample data
   */
  async testPricingRules(merchantId, sampleProduct) {
    console.log('🔧 testPricingRules called:');
    console.log('  merchantId:', merchantId);
    console.log('  sampleProduct:', JSON.stringify(sampleProduct));
    
    const config = await this.getMerchantConfig(merchantId);
    
    console.log('🔧 Config loaded:');
    console.log('  exists:', !!config);
    console.log('  pricingConfig exists:', !!config?.pricingConfig);
    console.log('  pricingConfig.enabled:', config?.pricingConfig?.enabled);
    
    if (!config || !config.pricingConfig || !config.pricingConfig.enabled) {
      console.log('❌ Config check failed - returning original price');
      return {
        originalPrice: sampleProduct.price,
        adjustedPrice: sampleProduct.price,
        appliedRules: [],
        markup: 0
      };
    }

    let adjustedPrice = parseFloat(sampleProduct.price);
    const appliedRules = [];

    console.log('✅ Config check passed - applying rules');
    console.log('  Starting price:', adjustedPrice);

    // Apply global markup
    if (config.pricingConfig.globalMarkup && config.pricingConfig.globalMarkup.value) {
      const markup = config.pricingConfig.globalMarkup;
      console.log('  Global markup:', markup);
      
      if (markup.type === 'percentage') {
        adjustedPrice = adjustedPrice * markup.value;
        console.log(`  Applied ${markup.value}x multiplier → $${adjustedPrice}`);
        appliedRules.push({
          type: 'global_markup',
          description: `Applied ${((markup.value - 1) * 100).toFixed(0)}% markup`,
          originalValue: sampleProduct.price,
          newValue: adjustedPrice
        });
      } else if (markup.type === 'fixed') {
        adjustedPrice = adjustedPrice + markup.value;
        appliedRules.push({
          type: 'global_markup',
          description: `Added $${markup.value} fixed markup`,
          originalValue: sampleProduct.price,
          newValue: adjustedPrice
        });
      }
    }

    // Apply rounding rules
    if (config.pricingConfig.roundingRules && config.pricingConfig.roundingRules.enabled) {
      const roundingRule = config.pricingConfig.roundingRules.rule;
      const originalPrice = adjustedPrice;
      
      switch (roundingRule) {
        case 'psychological_99':
          adjustedPrice = Math.floor(adjustedPrice) - 0.01;
          break;
        case 'round_up':
          adjustedPrice = Math.ceil(adjustedPrice);
          break;
        case 'round_down':
          adjustedPrice = Math.floor(adjustedPrice);
          break;
        case 'nearest_dollar':
          adjustedPrice = Math.round(adjustedPrice);
          break;
      }
      
      if (originalPrice !== adjustedPrice) {
        appliedRules.push({
          type: 'rounding',
          description: `Applied ${roundingRule} rounding`,
          originalValue: originalPrice,
          newValue: adjustedPrice
        });
      }
    }

    return {
      originalPrice: parseFloat(sampleProduct.price),
      adjustedPrice: Math.max(0.01, adjustedPrice), // Ensure minimum price
      appliedRules,
      markup: adjustedPrice - parseFloat(sampleProduct.price)
    };
  }

  /**
   * Validate configuration
   */
  async validateConfiguration(config) {
    const errors = [];

    // Validate pricing configuration
    if (config.pricing) {
      if (config.pricing.globalMarkup) {
        const markup = config.pricing.globalMarkup;
        if (markup.value <= 0) {
          errors.push('Markup value must be greater than 0');
        }
        if (markup.minMarkup && markup.maxMarkup && markup.minMarkup > markup.maxMarkup) {
          errors.push('Minimum markup cannot be greater than maximum markup');
        }
      }

      if (config.pricing.priceValidation) {
        const validation = config.pricing.priceValidation;
        if (validation.minPrice && validation.maxPrice && validation.minPrice > validation.maxPrice) {
          errors.push('Minimum price cannot be greater than maximum price');
        }
      }
    }

    // Validate categorization configuration
    if (config.categorization?.autoMapping) {
      const autoMapping = config.categorization.autoMapping;
      if (autoMapping.confidenceThreshold && (autoMapping.confidenceThreshold < 0 || autoMapping.confidenceThreshold > 1)) {
        errors.push('Confidence threshold must be between 0 and 1');
      }
    }

    // Validate content configuration
    if (config.content?.seoOptimization) {
      const seo = config.content.seoOptimization;
      if (seo.keywordDensity && (seo.keywordDensity < 0 || seo.keywordDensity > 10)) {
        errors.push('Keyword density must be between 0 and 10');
      }
      if (seo.maxTitleLength && seo.maxTitleLength < 10) {
        errors.push('Maximum title length must be at least 10 characters');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: []
    };
  }

  /**
   * Ensure configuration exists for merchant
   */
  async ensureConfigExists(merchantId) {
    const prisma = await this.getPrisma();
    let config = await prisma.merchantRefinementConfig.findUnique({
      where: { merchantId }
    });

    if (!config) {
      const merchant = await prisma.merchant.findUnique({
        where: { id: merchantId },
        select: { shopDomain: true }
      });

      if (!merchant) {
        throw new Error(`Merchant ${merchantId} not found`);
      }

      config = await prisma.merchantRefinementConfig.create({
        data: {
          merchantId,
          shopDomain: merchant.shopDomain,
          pricingConfig: this.getDefaultPricingConfig(),
          categorizationConfig: this.getDefaultCategorizationConfig(),
          contentConfig: this.getDefaultContentConfig(),
          deduplicationConfig: this.getDefaultDeduplicationConfig(),
          processingConfig: this.getDefaultProcessingConfig()
        }
      });
    }

    return config;
  }

  /**
   * Transform database config to typed interface
   */
  transformDatabaseConfig(config) {
    return {
      id: config.id,
      merchantId: config.merchantId,
      shopDomain: config.shopDomain,
      configVersion: config.configVersion,
      isEnabled: config.isEnabled,
      autoApplyRules: config.autoApplyRules,
      requireReviewThreshold: config.requireReviewThreshold,
      pricing: config.pricingConfig,
      categorization: config.categorizationConfig,
      content: config.contentConfig,
      deduplication: config.deduplicationConfig,
      processing: config.processingConfig,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt
    };
  }

  /**
   * Deep merge configuration objects
   */
  mergeConfig(existing, updates) {
    if (!updates) return existing;
    
    const merged = { ...existing };
    
    for (const [key, value] of Object.entries(updates)) {
      if (value !== null && value !== undefined) {
        if (typeof value === 'object' && !Array.isArray(value)) {
          merged[key] = this.mergeConfig(merged[key] || {}, value);
        } else {
          merged[key] = value;
        }
      }
    }
    
    return merged;
  }

  /**
   * Calculate refined pricing based on merchant configuration
   */
  async calculateRefinedPricing(unitCost, merchantConfig) {
    const pricing = merchantConfig?.pricing || this.getDefaultPricingConfig();
    const appliedRules = [];
    
    // Start with the unit cost
    let refinedPrice = parseFloat(unitCost) || 0;
    let markup = pricing.globalMarkup?.value || 1.5;
    
    // Apply global markup
    refinedPrice = refinedPrice * markup;
    appliedRules.push({
      type: 'global_markup',
      value: markup,
      description: `Applied ${((markup - 1) * 100).toFixed(1)}% markup`
    });
    
    // Apply minimum markup constraint
    const minMarkup = pricing.globalMarkup?.minMarkup || 1.1;
    if (markup < minMarkup) {
      const oldPrice = refinedPrice;
      refinedPrice = parseFloat(unitCost) * minMarkup;
      appliedRules.push({
        type: 'minimum_markup',
        value: minMarkup,
        description: `Applied minimum markup constraint (${((minMarkup - 1) * 100).toFixed(1)}%)`
      });
    }
    
    // Apply maximum markup constraint
    const maxMarkup = pricing.globalMarkup?.maxMarkup || 3.0;
    if (markup > maxMarkup) {
      const oldPrice = refinedPrice;
      refinedPrice = parseFloat(unitCost) * maxMarkup;
      appliedRules.push({
        type: 'maximum_markup',
        value: maxMarkup,
        description: `Applied maximum markup constraint (${((maxMarkup - 1) * 100).toFixed(1)}%)`
      });
    }
    
    // Round to reasonable precision
    refinedPrice = Math.round(refinedPrice * 100) / 100;
    
    return {
      originalCost: parseFloat(unitCost),
      refinedPrice: refinedPrice,
      markup: refinedPrice / parseFloat(unitCost),
      margin: ((refinedPrice - parseFloat(unitCost)) / refinedPrice * 100),
      appliedRules: appliedRules,
      pricingStrategy: 'global_markup'
    };
  }
}