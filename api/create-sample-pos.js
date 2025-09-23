/**
 * Create sample purchase order data for testing
 */

import { db } from './src/lib/db.js'

async function createSamplePurchaseOrders() {
  try {
    console.log('Creating sample purchase order data...')
    
    // Get or create merchant
    let merchant = await db.client.merchant.findFirst({
      where: { shopDomain: 'dev-test.myshopify.com' }
    })

    if (!merchant) {
      merchant = await db.client.merchant.create({
        data: {
          name: 'Development Test Store',
          shopDomain: 'dev-test.myshopify.com',
          email: 'dev-test@shopify.com',
          status: 'active',
          currency: 'USD',
          plan: 'basic'
        }
      })
    }

    console.log('Merchant ID:', merchant.id)

    // Create suppliers first
    const suppliers = await Promise.all([
      db.client.supplier.upsert({
        where: { 
          merchantId_name: { 
            merchantId: merchant.id, 
            name: 'Acme Electronics Corp' 
          } 
        },
        update: {},
        create: {
          name: 'Acme Electronics Corp',
          contactEmail: 'orders@acmeelectronics.com',
          contactPhone: '+1-555-0123',
          address: '123 Tech Park, Silicon Valley, CA 94000',
          category: 'electronics',
          status: 'active',
          merchantId: merchant.id
        }
      }),
      db.client.supplier.upsert({
        where: { 
          merchantId_name: { 
            merchantId: merchant.id, 
            name: 'Global Office Supplies' 
          } 
        },
        update: {},
        create: {
          name: 'Global Office Supplies',
          contactEmail: 'info@globaloffice.com',
          contactPhone: '+1-555-0456',
          address: '456 Business Blvd, New York, NY 10001',
          category: 'office-supplies',
          status: 'active',
          merchantId: merchant.id
        }
      }),
      db.client.supplier.upsert({
        where: { 
          merchantId_name: { 
            merchantId: merchant.id, 
            name: 'Premium Textiles Ltd' 
          } 
        },
        update: {},
        create: {
          name: 'Premium Textiles Ltd',
          contactEmail: 'sales@premiumtextiles.com',
          contactPhone: '+1-555-0789',
          address: '789 Fashion Ave, Los Angeles, CA 90210',
          category: 'textiles',
          status: 'active',
          merchantId: merchant.id
        }
      })
    ])

    console.log('Created suppliers:', suppliers.map(s => s.name))

    // Create sample purchase orders
    const purchaseOrders = [
      {
        number: 'PO-2025-001',
        supplierName: 'Acme Electronics Corp',
        supplierId: suppliers[0].id,
        orderDate: new Date('2025-09-20'),
        dueDate: new Date('2025-10-05'),
        totalAmount: 2500.00,
        currency: 'USD',
        status: 'completed',
        confidence: 0.95,
        fileName: 'acme_po_001.pdf',
        fileSize: 245760,
        processingNotes: 'Successfully processed with high confidence',
        merchantId: merchant.id
      },
      {
        number: 'PO-2025-002',
        supplierName: 'Global Office Supplies',
        supplierId: suppliers[1].id,
        orderDate: new Date('2025-09-21'),
        dueDate: new Date('2025-10-10'),
        totalAmount: 850.50,
        currency: 'USD',
        status: 'processing',
        confidence: 0.87,
        fileName: 'global_office_po_002.pdf',
        fileSize: 189440,
        processingNotes: 'Currently processing line items',
        merchantId: merchant.id
      },
      {
        number: 'PO-2025-003',
        supplierName: 'Premium Textiles Ltd',
        supplierId: suppliers[2].id,
        orderDate: new Date('2025-09-22'),
        dueDate: new Date('2025-10-15'),
        totalAmount: 4200.75,
        currency: 'USD',
        status: 'review_needed',
        confidence: 0.72,
        fileName: 'premium_textiles_po_003.pdf',
        fileSize: 312320,
        processingNotes: 'Some line items require manual review',
        merchantId: merchant.id
      },
      {
        number: 'PO-2025-004',
        supplierName: 'Acme Electronics Corp',
        supplierId: suppliers[0].id,
        orderDate: new Date('2025-09-23'),
        dueDate: new Date('2025-10-08'),
        totalAmount: 1750.25,
        currency: 'USD',
        status: 'pending',
        confidence: 0.0,
        fileName: 'acme_po_004.pdf',
        fileSize: 198720,
        processingNotes: 'Awaiting processing',
        merchantId: merchant.id
      },
      {
        number: 'PO-2025-005',
        supplierName: 'Global Office Supplies',
        supplierId: suppliers[1].id,
        orderDate: new Date('2025-09-19'),
        dueDate: new Date('2025-10-03'),
        totalAmount: 625.00,
        currency: 'USD',
        status: 'failed',
        confidence: 0.0,
        fileName: 'corrupted_po_005.pdf',
        fileSize: 45600,
        processingNotes: 'File corrupted, unable to process',
        merchantId: merchant.id
      }
    ]

    // Create purchase orders
    for (const poData of purchaseOrders) {
      try {
        const existingPO = await db.client.purchaseOrder.findFirst({
          where: {
            merchantId: merchant.id,
            number: poData.number
          }
        })

        if (!existingPO) {
          const po = await db.client.purchaseOrder.create({
            data: poData
          })
          console.log(`Created PO: ${po.number}`)

          // Add some line items for variety
          if (po.status === 'completed' || po.status === 'processing') {
            const lineItems = [
              {
                sku: 'ELEC-001',
                productName: 'Wireless Mouse',
                description: 'Ergonomic wireless optical mouse',
                quantity: 50,
                unitCost: 12.50,
                totalCost: 625.00,
                confidence: 0.98,
                status: 'matched',
                purchaseOrderId: po.id
              },
              {
                sku: 'ELEC-002', 
                productName: 'USB Cable',
                description: 'USB-C to USB-A cable, 6ft',
                quantity: 100,
                unitCost: 8.75,
                totalCost: 875.00,
                confidence: 0.95,
                status: 'matched',
                purchaseOrderId: po.id
              }
            ]

            for (const item of lineItems.slice(0, Math.floor(Math.random() * 2) + 1)) {
              await db.client.pOLineItem.create({
                data: item
              })
            }
          }
        } else {
          console.log(`PO ${poData.number} already exists, skipping`)
        }
      } catch (error) {
        console.error(`Error creating PO ${poData.number}:`, error)
      }
    }

    console.log('✅ Sample purchase order data created successfully!')

    // Verify data
    const totalPOs = await db.client.purchaseOrder.count({
      where: { merchantId: merchant.id }
    })
    console.log(`Total POs in database: ${totalPOs}`)

  } catch (error) {
    console.error('❌ Error creating sample data:', error)
  } finally {
    await db.client.$disconnect()
  }
}

// Run the script
createSamplePurchaseOrders()