/**
 * Merchant API routes
 * All routes are protected by Shopify authentication middleware applied in server.js
 */

import express from 'express'
import { db } from '../lib/db.js'

const router = express.Router()

// GET /api/merchant - Get current merchant info
router.get('/', async (req, res) => {
  try {
    // req.shop is set by authentication middleware
    if (!req.shop) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      })
    }

    res.json({
      success: true,
      data: {
        id: req.shop.id,
        shopDomain: req.shop.shopDomain,
        name: req.shop.name,
        email: req.shop.email,
        phone: req.shop.phone,
        address: req.shop.address,
        timezone: req.shop.timezone,
        currency: req.shop.currency,
        plan: req.shop.plan,
        status: req.shop.status,
        settings: req.shop.settings,
        createdAt: req.shop.createdAt,
        updatedAt: req.shop.updatedAt
      }
    })
  } catch (error) {
    console.error('Get merchant error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get merchant information'
    })
  }
})

// PUT /api/merchant - Update merchant info
router.put('/', async (req, res) => {
  try {
    if (!req.shop) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      })
    }

    const prisma = await db.getClient()

    const updatedMerchant = await prisma.merchant.update({
      where: { id: req.shop.id },
      data: {
        name: req.body.name,
        email: req.body.email,
        phone: req.body.phone,
        address: req.body.address,
        timezone: req.body.timezone,
        currency: req.body.currency,
        settings: req.body.settings,
        updatedAt: new Date()
      }
    })

    res.json({
      success: true,
      data: updatedMerchant
    })
  } catch (error) {
    console.error('Update merchant error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to update merchant information'
    })
  }
})

export default router