import express from 'express'
import { db } from '../lib/db.js'

const router = express.Router()

/**
 * Unified search endpoint for global header search
 * Returns matching purchase orders and suppliers for the current merchant
 */
router.get('/', async (req, res) => {
  try {
    const query = (req.query.q || '').toString().trim()
    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 25)
    const supplierLimit = Math.min(parseInt(req.query.supplierLimit, 10) || 5, 25)

    if (!query) {
      return res.json({
        success: true,
        data: {
          purchaseOrders: [],
          suppliers: []
        }
      })
    }

    const merchant = req.merchant
    if (!merchant || !merchant.id) {
      return res.status(401).json({
        success: false,
        error: 'Merchant authentication required'
      })
    }

    const searchTerm = query.replace(/[%_]/g, '') // basic sanitization

    const prisma = await db.getClient()

    const [purchaseOrders, suppliers] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where: {
          merchantId: merchant.id,
          OR: [
            { number: { contains: searchTerm, mode: 'insensitive' } },
            { supplierName: { contains: searchTerm, mode: 'insensitive' } },
            {
              lineItems: {
                some: {
                  productName: { contains: searchTerm, mode: 'insensitive' }
                }
              }
            }
          ]
        },
        select: {
          id: true,
          number: true,
          supplierName: true,
          status: true,
          totalAmount: true,
          currency: true,
          orderDate: true,
          createdAt: true
        },
        orderBy: [
          { createdAt: 'desc' }
        ],
        take: limit
      }),
  prisma.supplier.findMany({
        where: {
          merchantId: merchant.id,
          OR: [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { contactEmail: { contains: searchTerm, mode: 'insensitive' } },
            { contactPhone: { contains: searchTerm, mode: 'insensitive' } }
          ]
        },
        select: {
          id: true,
          name: true,
          status: true,
          contactEmail: true,
          contactPhone: true,
          createdAt: true,
          _count: {
            select: {
              purchaseOrders: true
            }
          },
          purchaseOrders: {
            select: {
              id: true,
              createdAt: true
            },
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        },
        orderBy: [
          { name: 'asc' }
        ],
        take: supplierLimit
      })
    ])

    const transformedSuppliers = suppliers.map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      status: supplier.status,
      contactEmail: supplier.contactEmail,
      contactPhone: supplier.contactPhone,
      createdAt: supplier.createdAt,
      totalOrders: supplier._count?.purchaseOrders || 0,
      lastOrderDate: supplier.purchaseOrders?.[0]?.createdAt || null
    }))

    res.json({
      success: true,
      data: {
        purchaseOrders,
        suppliers: transformedSuppliers
      }
    })
  } catch (error) {
    console.error('Global search error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to perform search'
    })
  }
})

export default router
