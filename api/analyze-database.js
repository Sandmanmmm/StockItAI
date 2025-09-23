import { db } from './src/lib/db.js'

async function analyzeDatabase() {
  try {
    console.log('=== DATABASE SCHEMA ANALYSIS ===\n')

    // Get all tables
    const tables = await db.client.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `
    
    console.log('📋 EXISTING TABLES:')
    tables.forEach(row => console.log(`  - ${row.table_name}`))
    console.log()

    // Check PurchaseOrder table structure if it exists
    const purchaseOrderExists = tables.some(t => t.table_name === 'PurchaseOrder')
    
    if (purchaseOrderExists) {
      console.log('🔍 PURCHASEORDER TABLE COLUMNS:')
      const columns = await db.client.$queryRaw`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'PurchaseOrder' 
        AND table_schema = 'public'
        ORDER BY ordinal_position
      `
      
      columns.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(nullable)' : '(required)'}`)
      })
      console.log()
    } else {
      console.log('❌ PurchaseOrder table does not exist!')
    }

    // Check POLineItem table structure if it exists  
    const lineItemExists = tables.some(t => t.table_name === 'POLineItem')
    
    if (lineItemExists) {
      console.log('🔍 POLINEITEM TABLE COLUMNS:')
      const lineItemColumns = await db.client.$queryRaw`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'POLineItem' 
        AND table_schema = 'public'
        ORDER BY ordinal_position
      `
      
      lineItemColumns.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(nullable)' : '(required)'}`)
      })
      console.log()
    } else {
      console.log('❌ POLineItem table does not exist!')
    }

    // Check Supplier table structure if it exists
    const supplierExists = tables.some(t => t.table_name === 'Supplier')
    
    if (supplierExists) {
      console.log('🔍 SUPPLIER TABLE COLUMNS:')
      const supplierColumns = await db.client.$queryRaw`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'Supplier' 
        AND table_schema = 'public'
        ORDER BY ordinal_position
      `
      
      supplierColumns.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(nullable)' : '(required)'}`)
      })
      console.log()
    } else {
      console.log('❌ Supplier table does not exist!')
    }

    // Test basic query to see what's in PurchaseOrder table
    if (purchaseOrderExists) {
      try {
        const poCount = await db.client.purchaseOrder.count()
        console.log(`📊 Total purchase orders in database: ${poCount}`)
        
        if (poCount > 0) {
          const samplePO = await db.client.purchaseOrder.findFirst({
            select: {
              id: true,
              number: true,
              supplierName: true,
              status: true,
              createdAt: true
            }
          })
          console.log('📄 Sample purchase order:')
          console.log(JSON.stringify(samplePO, null, 2))
        }
      } catch (error) {
        console.log('❌ Error querying PurchaseOrder table:', error.message)
      }
    }

  } catch (error) {
    console.error('❌ Database analysis error:', error)
  } finally {
    await db.client.$disconnect()
  }
}

analyzeDatabase()