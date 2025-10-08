// API Routes for Refinement Configuration Management
import { Router } from 'express';
import { RefinementConfigService } from '../services/refinementConfigService.js';
import { db } from '../lib/db.js';

const router = Router();
const refinementConfigService = new RefinementConfigService(db.client);

/**
 * GET /api/refinement-config
 * Get merchant's refinement configuration
 */
router.get('/', async (req, res) => {
  try {
    const merchant = req.merchant;
    
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      });
    }

    const config = await refinementConfigService.getMerchantConfig(merchant.id);
    
    if (!config) {
      // Return default configuration if none exists
      const defaultConfig = await refinementConfigService.updateMerchantConfig(
        merchant.id,
        {} // Will create with defaults
      );
      
      return res.json({
        success: true,
        data: defaultConfig,
        isDefault: true
      });
    }

    res.json({
      success: true,
      data: config,
      isDefault: false
    });

  } catch (error) {
    console.error('Error getting refinement config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get refinement configuration',
      details: error.message
    });
  }
});

/**
 * PUT /api/refinement-config
 * Update merchant's refinement configuration
 */
router.put('/', async (req, res) => {
  try {
    const merchant = req.merchant;
    const configUpdates = req.body;
    
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      });
    }

    const updatedConfig = await refinementConfigService.updateMerchantConfig(
      merchant.id,
      configUpdates
    );

    res.json({
      success: true,
      data: updatedConfig
    });

  } catch (error) {
    console.error('Error updating refinement config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update refinement configuration',
      details: error.message
    });
  }
});

/**
 * POST /api/refinement-config/category-mappings
 * Add a new category mapping rule
 */
router.post('/category-mappings', async (req, res) => {
  try {
    const merchant = req.merchant;
    const mappingData = req.body;
    
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      });
    }

    const mapping = await refinementConfigService.addCategoryMapping(
      merchant.id,
      mappingData
    );

    res.json({
      success: true,
      data: mapping
    });

  } catch (error) {
    console.error('Error adding category mapping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add category mapping',
      details: error.message
    });
  }
});

/**
 * PUT /api/refinement-config/category-mappings/:id
 * Update a category mapping rule
 */
router.put('/category-mappings/:id', async (req, res) => {
  try {
    const merchant = req.merchant;
    const { id } = req.params;
    const mappingData = req.body;
    
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      });
    }

    const mapping = await refinementConfigService.updateCategoryMapping(
      merchant.id,
      id,
      mappingData
    );

    res.json({
      success: true,
      data: mapping
    });

  } catch (error) {
    console.error('Error updating category mapping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update category mapping',
      details: error.message
    });
  }
});

/**
 * POST /api/refinement-config/pricing-rules
 * Add a new pricing rule
 */
router.post('/pricing-rules', async (req, res) => {
  try {
    const merchant = req.merchant;
    const ruleData = req.body;
    
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      });
    }

    const rule = await refinementConfigService.addPricingRule(
      merchant.id,
      ruleData
    );

    res.json({
      success: true,
      data: rule
    });

  } catch (error) {
    console.error('Error adding pricing rule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add pricing rule',
      details: error.message
    });
  }
});

/**
 * POST /api/refinement-config/content-rules
 * Add a new content enrichment rule
 */
router.post('/content-rules', async (req, res) => {
  try {
    const merchant = req.merchant;
    const ruleData = req.body;
    
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      });
    }

    const rule = await refinementConfigService.addContentRule(
      merchant.id,
      ruleData
    );

    res.json({
      success: true,
      data: rule
    });

  } catch (error) {
    console.error('Error adding content rule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add content rule',
      details: error.message
    });
  }
});

/**
 * POST /api/refinement-config/deduplication-rules
 * Add a new deduplication rule
 */
router.post('/deduplication-rules', async (req, res) => {
  try {
    const merchant = req.merchant;
    const ruleData = req.body;
    
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      });
    }

    const rule = await refinementConfigService.addDeduplicationRule(
      merchant.id,
      ruleData
    );

    res.json({
      success: true,
      data: rule
    });

  } catch (error) {
    console.error('Error adding deduplication rule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add deduplication rule',
      details: error.message
    });
  }
});

/**
 * POST /api/refinement-config/test-pricing
 * Test pricing rules against sample data
 */
router.post('/test-pricing', async (req, res) => {
  try {
    const merchant = req.merchant;
    const { sampleProduct } = req.body;
    
    console.log('🔧 TEST-PRICING API Called:');
    console.log('  merchantId:', merchant?.id);
    console.log('  sampleProduct:', JSON.stringify(sampleProduct));
    
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      });
    }

    if (!sampleProduct || !sampleProduct.price) {
      return res.status(400).json({
        success: false,
        error: 'Sample product with price is required'
      });
    }

    const result = await refinementConfigService.testPricingRules(
      merchant.id,
      sampleProduct
    );

    console.log('🔧 TEST-PRICING Result:', JSON.stringify(result, null, 2));

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error testing pricing rules:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test pricing rules',
      details: error.message
    });
  }
});

/**
 * GET /api/refinement-config/defaults
 * Get default configuration template
 */
router.get('/defaults', async (req, res) => {
  try {
    const defaults = await refinementConfigService.getDefaultConfiguration();

    res.json({
      success: true,
      data: defaults
    });

  } catch (error) {
    console.error('Error getting default configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get default configuration',
      details: error.message
    });
  }
});

/**
 * POST /api/refinement-config/validate
 * Validate a configuration object
 */
router.post('/validate', async (req, res) => {
  try {
    const configToValidate = req.body;
    
    const validation = await refinementConfigService.validateConfiguration(configToValidate);

    res.json({
      success: true,
      data: validation
    });

  } catch (error) {
    console.error('Error validating configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate configuration',
      details: error.message
    });
  }
});

/**
 * DELETE /api/refinement-config/category-mappings/:id
 * Delete a category mapping
 */
router.delete('/category-mappings/:id', async (req, res) => {
  try {
    const merchant = req.merchant;
    const { id } = req.params;
    
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      });
    }

    const deleted = await refinementConfigService.deleteCategoryMapping(
      merchant.id,
      id
    );

    res.json({
      success: true,
      data: { deleted, id }
    });

  } catch (error) {
    console.error('Error deleting category mapping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete category mapping',
      details: error.message
    });
  }
});

/**
 * DELETE /api/refinement-config/pricing-rules/:id
 * Delete a pricing rule
 */
router.delete('/pricing-rules/:id', async (req, res) => {
  try {
    const merchant = req.merchant;
    const { id } = req.params;
    
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      });
    }

    const deleted = await refinementConfigService.deletePricingRule(
      merchant.id,
      id
    );

    res.json({
      success: true,
      data: { deleted, id }
    });

  } catch (error) {
    console.error('Error deleting pricing rule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete pricing rule',
      details: error.message
    });
  }
});

/**
 * DELETE /api/refinement-config/content-rules/:id
 * Delete a content rule
 */
router.delete('/content-rules/:id', async (req, res) => {
  try {
    const merchant = req.merchant;
    const { id } = req.params;
    
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      });
    }

    const deleted = await refinementConfigService.deleteContentRule(
      merchant.id,
      id
    );

    res.json({
      success: true,
      data: { deleted, id }
    });

  } catch (error) {
    console.error('Error deleting content rule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete content rule',
      details: error.message
    });
  }
});

/**
 * DELETE /api/refinement-config/deduplication-rules/:id
 * Delete a deduplication rule
 */
router.delete('/deduplication-rules/:id', async (req, res) => {
  try {
    const merchant = req.merchant;
    const { id } = req.params;
    
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      });
    }

    const deleted = await refinementConfigService.deleteDeduplicationRule(
      merchant.id,
      id
    );

    res.json({
      success: true,
      data: { deleted, id }
    });

  } catch (error) {
    console.error('Error deleting deduplication rule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete deduplication rule',
      details: error.message
    });
  }
});

export default router;