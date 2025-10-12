const { PrismaClient } = require('@prisma/client');
const fetch = require('node-fetch');

async function reprocessPO() {
  const prisma = new PrismaClient();
  
  try {
    const poId = 'cmgn729av0001l404um2yvz44';
    
    console.log(`\n🔄 Triggering reprocessing for PO ${poId}...\n`);
    
    // Get PO details
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId }
    });
    
    if (!po) {
      console.log(`❌ PO not found`);
      return;
    }
    
    console.log(`📋 PO Number: ${po.number}`);
    console.log(`📁 File Key: ${po.fileKey}`);
    console.log(`📊 Status: ${po.status}`);
    
    // Call the reprocess API endpoint
    const apiUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}/api/purchase-orders/${poId}/reprocess`
      : `http://localhost:3000/api/purchase-orders/${poId}/reprocess`;
    
    console.log(`\n🌐 Calling: ${apiUrl}\n`);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add auth headers if needed
      }
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log(`✅ Reprocessing triggered successfully!`);
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`❌ Reprocessing failed:`, result);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

reprocessPO();
