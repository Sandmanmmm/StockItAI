import express from 'express';
import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from '../utils/encryption.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/security/status
 * Check if Shopify credentials are configured
 */
router.get('/status', async (req, res) => {
  try {
    const merchantId = req.session?.merchantId || 'default-merchant';

    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: {
        accessToken: true,
        webhookSecret: true,
        shopDomain: true,
        dataEncryption: true,
        auditLogging: true
      }
    });

    if (!merchant) {
      return res.json({
        configured: false,
        shopDomain: null,
        hasApiKey: false,
        hasWebhookSecret: false,
        dataEncryption: false,
        auditLogging: false
      });
    }

    res.json({
      configured: !!(merchant.accessToken && merchant.shopDomain),
      shopDomain: merchant.shopDomain || null,
      hasApiKey: !!merchant.accessToken,
      hasWebhookSecret: !!merchant.webhookSecret,
      dataEncryption: merchant.dataEncryption,
      auditLogging: merchant.auditLogging
    });
  } catch (error) {
    console.error('Error checking security status:', error);
    res.status(500).json({ error: 'Failed to check security status' });
  }
});

/**
 * POST /api/security/shopify-credentials
 * Save encrypted Shopify credentials
 */
router.post('/shopify-credentials', async (req, res) => {
  try {
    const { apiKey, webhookSecret, shopDomain } = req.body;
    const merchantId = req.session?.merchantId || 'default-merchant';

    // Validate inputs
    if (!apiKey || !shopDomain) {
      return res.status(400).json({ 
        error: 'API key and shop domain are required' 
      });
    }

    // Validate shop domain format
    if (!/^[a-z0-9-]+\.myshopify\.com$/.test(shopDomain)) {
      return res.status(400).json({ 
        error: 'Invalid shop domain format. Must be: your-store.myshopify.com' 
      });
    }

    // Encrypt credentials
    const encryptedApiKey = encrypt(apiKey);
    const encryptedWebhookSecret = webhookSecret ? encrypt(webhookSecret) : null;

    // Update or create merchant record
    const merchant = await prisma.merchant.upsert({
      where: { id: merchantId },
      update: {
        accessToken: encryptedApiKey,
        webhookSecret: encryptedWebhookSecret,
        shopDomain: shopDomain,
        updatedAt: new Date()
      },
      create: {
        id: merchantId,
        shopDomain: shopDomain,
        name: shopDomain.replace('.myshopify.com', ''),
        accessToken: encryptedApiKey,
        webhookSecret: encryptedWebhookSecret,
        dataEncryption: true,
        auditLogging: true
      }
    });

    console.log(`✅ Shopify credentials saved for merchant: ${merchantId}`);

    res.json({ 
      success: true, 
      message: 'Credentials saved successfully',
      shopDomain: merchant.shopDomain
    });
  } catch (error) {
    console.error('Error saving Shopify credentials:', error);
    res.status(500).json({ 
      error: 'Failed to save credentials',
      details: error.message 
    });
  }
});

/**
 * POST /api/security/test-connection
 * Test Shopify API connection without exposing credentials
 */
router.post('/test-connection', async (req, res) => {
  try {
    const merchantId = req.session?.merchantId || 'default-merchant';

    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: {
        accessToken: true,
        shopDomain: true
      }
    });

    if (!merchant || !merchant.accessToken || !merchant.shopDomain) {
      return res.status(400).json({ 
        error: 'Shopify credentials not configured' 
      });
    }

    // Decrypt the API key
    const apiKey = decrypt(merchant.accessToken);

    // Test the Shopify API connection
    try {
      const shopUrl = `https://${merchant.shopDomain}`;
      
      // Simple API test - get shop info
      const response = await fetch(`${shopUrl}/admin/api/2024-01/shop.json`, {
        headers: {
          'X-Shopify-Access-Token': apiKey,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Shopify API test failed:', response.status, errorData);
        
        return res.status(400).json({
          success: false,
          error: 'Invalid API credentials or insufficient permissions',
          status: response.status
        });
      }

      const data = await response.json();
      
      console.log(`✅ Shopify connection test successful for: ${merchant.shopDomain}`);

      res.json({
        success: true,
        message: 'Connection successful',
        shop: {
          name: data.shop?.name,
          domain: data.shop?.domain,
          email: data.shop?.email
        }
      });
    } catch (apiError) {
      console.error('Shopify API error:', apiError);
      res.status(400).json({
        success: false,
        error: 'Failed to connect to Shopify API',
        details: apiError.message
      });
    }
  } catch (error) {
    console.error('Error testing Shopify connection:', error);
    res.status(500).json({ 
      error: 'Failed to test connection',
      details: error.message 
    });
  }
});

/**
 * DELETE /api/security/shopify-credentials
 * Remove stored Shopify credentials
 */
router.delete('/shopify-credentials', async (req, res) => {
  try {
    const merchantId = req.session?.merchantId || 'default-merchant';

    await prisma.merchant.update({
      where: { id: merchantId },
      data: {
        accessToken: null,
        webhookSecret: null,
        updatedAt: new Date()
      }
    });

    console.log(`🗑️ Shopify credentials removed for merchant: ${merchantId}`);

    res.json({ 
      success: true, 
      message: 'Credentials removed successfully' 
    });
  } catch (error) {
    console.error('Error removing Shopify credentials:', error);
    res.status(500).json({ 
      error: 'Failed to remove credentials',
      details: error.message 
    });
  }
});

/**
 * PUT /api/security/settings
 * Update security settings (encryption, audit logging)
 */
router.put('/settings', async (req, res) => {
  try {
    const { dataEncryption, auditLogging } = req.body;
    const merchantId = req.session?.merchantId || 'default-merchant';

    const merchant = await prisma.merchant.update({
      where: { id: merchantId },
      data: {
        dataEncryption: dataEncryption ?? true,
        auditLogging: auditLogging ?? true,
        updatedAt: new Date()
      },
      select: {
        dataEncryption: true,
        auditLogging: true
      }
    });

    console.log(`⚙️ Security settings updated for merchant: ${merchantId}`);

    res.json({ 
      success: true,
      settings: merchant
    });
  } catch (error) {
    console.error('Error updating security settings:', error);
    res.status(500).json({ 
      error: 'Failed to update security settings',
      details: error.message 
    });
  }
});

/**
 * Helper function to get decrypted Shopify credentials for internal use
 * This should only be called from server-side code, never exposed to frontend
 */
export async function getShopifyCredentials(merchantId) {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: {
      accessToken: true,
      webhookSecret: true,
      shopDomain: true
    }
  });

  if (!merchant || !merchant.accessToken) {
    return null;
  }

  return {
    apiKey: decrypt(merchant.accessToken),
    webhookSecret: merchant.webhookSecret ? decrypt(merchant.webhookSecret) : null,
    shopDomain: merchant.shopDomain
  };
}

export default router;
