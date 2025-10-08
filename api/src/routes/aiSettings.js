/**
 * AI Settings API routes
 */

import express from 'express'
import { db } from '../lib/db.js'

const router = express.Router()

// GET /api/ai-settings - Get AI settings
router.get('/', async (req, res) => {
  try {
    const merchant = req.merchant
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      })
    }

    const settings = await db.client.aISettings.findFirst({
      where: { merchantId: merchant.id }
    })

    if (!settings) {
      // Create default settings if none exist
      const defaultSettings = await db.client.aISettings.create({
        data: {
          merchantId: merchant.id
        }
      })

      return res.json({
        success: true,
        data: defaultSettings
      })
    }

    res.json({
      success: true,
      data: settings
    })
  } catch (error) {
    console.error('Get AI settings error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get AI settings'
    })
  }
})

// PUT /api/ai-settings - Update AI settings
router.put('/', async (req, res) => {
  try {
    const merchant = req.merchant
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      })
    }

    // Validate confidence threshold
    if (req.body.confidenceThreshold !== undefined) {
      if (req.body.confidenceThreshold < 0 || req.body.confidenceThreshold > 1) {
        return res.status(400).json({
          success: false,
          error: 'Confidence threshold must be between 0 and 1'
        })
      }
    }

    // Check if settings exist
    const existingSettings = await db.client.aISettings.findFirst({
      where: { merchantId: merchant.id }
    })

    let settings
    if (existingSettings) {
      // Update existing settings
      settings = await db.client.aISettings.update({
        where: { merchantId: merchant.id },
        data: req.body
      })
    } else {
      // Create new settings
      settings = await db.client.aISettings.create({
        data: {
          ...req.body,
          merchantId: merchant.id
        }
      })
    }

    res.json({
      success: true,
      data: settings,
      message: 'AI settings updated successfully'
    })
  } catch (error) {
    console.error('Update AI settings error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to update AI settings'
    })
  }
})

// POST /api/ai-settings/test - Test AI configuration
router.post('/test', async (req, res) => {
  try {
    const merchant = req.merchant
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      })
    }

    const settings = await db.client.aISettings.findFirst({
      where: { merchantId: merchant.id }
    })

    if (!settings) {
      return res.status(404).json({
        success: false,
        error: 'AI settings not found'
      })
    }

    // Mock AI test - in a real implementation, this would test the AI models
    const testResult = {
      ocr: settings.enableOCR ? 'Available' : 'Disabled',
      nlp: settings.enableNLP ? 'Available' : 'Disabled',
      primaryModel: {
        model: settings.primaryModel,
        status: 'Connected',
        latency: '120ms'
      },
      fallbackModel: {
        model: settings.fallbackModel,
        status: 'Connected',
        latency: '200ms'
      },
      confidenceThreshold: settings.confidenceThreshold,
      testProcessing: {
        sampleText: 'Invoice #12345 from Acme Corp for $1,500.00',
        extractedData: {
          invoiceNumber: '12345',
          supplierName: 'Acme Corp',
          totalAmount: 1500.00,
          confidence: 0.95
        },
        processingTime: '1.2s'
      }
    }

    res.json({
      success: true,
      data: testResult,
      message: 'AI configuration test completed'
    })
  } catch (error) {
    console.error('AI settings test error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to test AI configuration'
    })
  }
})

export default router