#!/usr/bin/env node

/**
 * Recover Failed Workflows
 * Updates POs that have data but show failed status
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function recoverFailedWorkflows() {
  console.log('🔧 Starting workflow recovery process...\n');

  // Find all POs with failed status but have line items
  const failedWithData = await prisma.purchaseOrder.findMany({
    where: {
      status: 'failed',
      jobStatus: 'completed'
    },
    include: {
      lineItems: true,
      productDrafts: true,
      _count: {
        select: { lineItems: true, productDrafts: true }
      }
    }
  });

  console.log(`Found ${failedWithData.length} failed POs with completed jobs\n`);

  let recovered = 0;
  let skipped = 0;

  for (const po of failedWithData) {
    const hasLineItems = po._count.lineItems > 0;
    const hasProductDrafts = po._count.productDrafts > 0;

    console.log(`\n📋 ${po.number}`);
    console.log(`   Line Items: ${po._count.lineItems}`);
    console.log(`   Product Drafts: ${po._count.productDrafts}`);

    if (!hasLineItems) {
      console.log(`   ⚠️  Skipping - no line items to recover`);
      skipped++;
      continue;
    }

    // Determine appropriate status
    let newStatus = 'needs_review';
    let newJobStatus = 'completed';

    if (hasProductDrafts) {
      newStatus = 'review_in_progress';
      console.log(`   ✅ Has product drafts - setting to review_in_progress`);
    } else {
      console.log(`   ✅ Has line items - setting to needs_review`);
    }

    // Update the PO
    await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: {
        status: newStatus,
        jobStatus: newJobStatus,
        jobError: null, // Clear any error
        jobCompletedAt: new Date(),
        updatedAt: new Date()
      }
    });

    console.log(`   🎉 Recovered: ${po.status} → ${newStatus}`);
    recovered++;
  }

  // Check for stuck processing POs
  const stuckProcessing = await prisma.purchaseOrder.findMany({
    where: {
      status: 'processing',
      updatedAt: {
        lt: new Date(Date.now() - 30 * 60 * 1000) // 30 minutes ago
      }
    },
    include: {
      _count: { select: { lineItems: true } }
    }
  });

  if (stuckProcessing.length > 0) {
    console.log(`\n\n🔍 Found ${stuckProcessing.length} stuck processing POs:`);
    
    for (const po of stuckProcessing) {
      console.log(`\n📋 ${po.number}`);
      console.log(`   Last updated: ${po.updatedAt.toISOString()}`);
      console.log(`   Line Items: ${po._count.lineItems}`);
      
      if (po._count.lineItems > 0) {
        await prisma.purchaseOrder.update({
          where: { id: po.id },
          data: {
            status: 'needs_review',
            jobStatus: 'completed',
            jobCompletedAt: new Date()
          }
        });
        console.log(`   ✅ Recovered to needs_review`);
        recovered++;
      } else {
        await prisma.purchaseOrder.update({
          where: { id: po.id },
          data: {
            status: 'failed',
            jobStatus: 'failed',
            jobError: 'Workflow abandoned - no data extracted'
          }
        });
        console.log(`   ❌ Marked as truly failed (no data)`);
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('📊 RECOVERY COMPLETE');
  console.log('='.repeat(80));
  console.log(`✅ Recovered: ${recovered}`);
  console.log(`⚠️  Skipped: ${skipped}`);
  console.log('='.repeat(80));
}

recoverFailedWorkflows()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
