import { db } from './api/src/lib/db.js';

async function checkSpecificPO() {
    try {
        const poId = 'cmfywylab000155vwawjxx4o4';
        console.log(`🔍 Checking PO: ${poId}`);
        
        const po = await db.client.purchaseOrder.findUnique({
            where: { id: poId },
            include: {
                lineItems: true
            }
        });
        
        if (!po) {
            console.log('❌ PO not found');
            return;
        }
        
        console.log('\n📊 Current PO Status:');
        console.log(`ID: ${po.id}`);
        console.log(`Number: ${po.number}`);
        console.log(`Status: ${po.status}`);
        console.log(`Confidence: ${po.confidence}%`);
        console.log(`Supplier: ${po.supplierName}`);
        console.log(`Total Amount: ${po.totalAmount} ${po.currency}`);
        console.log(`Created: ${po.createdAt}`);
        console.log(`Updated: ${po.updatedAt}`);
        console.log(`Line Items: ${po.lineItems.length}`);
        
        if (po.rawData) {
            console.log('\n🤖 AI Analysis Data Available: Yes');
            console.log('Raw Data Size:', JSON.stringify(po.rawData).length, 'characters');
        } else {
            console.log('\n🤖 AI Analysis Data Available: No');
        }
        
        if (po.processingNotes) {
            console.log(`\n📝 Processing Notes: ${po.processingNotes}`);
        }
        
        console.log('\n🔄 Workflow metadata check complete');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

checkSpecificPO();