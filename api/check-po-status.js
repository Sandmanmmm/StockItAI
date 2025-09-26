import { PrismaClient } from '@prisma/client'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '../.env' })

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

console.log('🔍 Checking PO status in database...')

// Initialize prisma
const prisma = new PrismaClient()

try {
  console.log('\n📊 All Purchase Orders:')
  console.log('========================')
  
  const allPOs = await prisma.purchaseOrder.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10 // Show last 10 POs
  })
  
  if (allPOs.length === 0) {
    console.log('❌ No purchase orders found in database')
  } else {
    allPOs.forEach((po, index) => {
      console.log(`${index + 1}. PO-${po.id}`)
      console.log(`   File: ${po.fileName}`)
      console.log(`   Status: ${po.status}`)
      console.log(`   Confidence: ${po.confidence}%`)
      console.log(`   Created: ${po.createdAt.toLocaleString()}`)
      console.log(`   Updated: ${po.updatedAt.toLocaleString()}`)
      console.log('   ---')
    })
  }
  
  console.log('\n📈 Status Summary:')
  console.log('==================')
  
  const statusCounts = await prisma.purchaseOrder.groupBy({
    by: ['status'],
    _count: {
      status: true
    }
  })
  
  statusCounts.forEach(group => {
    console.log(`   ${group.status}: ${group._count.status} POs`)
  })
  
  console.log('\n🔍 Low Confidence POs (<=10%):')
  console.log('==============================')
  
  const lowConfidencePOs = await prisma.purchaseOrder.findMany({
    where: {
      OR: [
        { confidence: { lte: 10 } },
        { confidence: null }
      ]
    },
    orderBy: { createdAt: 'desc' }
  })
  
  if (lowConfidencePOs.length === 0) {
    console.log('   ✅ No low confidence POs found')
  } else {
    lowConfidencePOs.forEach((po) => {
      console.log(`   PO-${po.id}: ${po.fileName} (${po.confidence || 0}% confidence, status: ${po.status})`)
    })
  }
  
  console.log('\n🎯 Processing Status POs:')
  console.log('=========================')
  
  const processingPOs = await prisma.purchaseOrder.findMany({
    where: { status: 'processing' },
    orderBy: { createdAt: 'desc' }
  })
  
  if (processingPOs.length === 0) {
    console.log('   ✅ No POs currently processing')
  } else {
    processingPOs.forEach((po) => {
      console.log(`   PO-${po.id}: ${po.fileName} (${po.confidence || 0}% confidence)`)
    })
  }

} catch (error) {
  console.error('❌ Error checking PO status:', error)
} finally {
  await prisma.$disconnect()
}