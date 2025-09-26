import { db } from './api/src/lib/db.js';

async function checkTestPO() {
    try {
        const poId = 'cmfyxipae000155r0zy7qpc48';
        console.log(`🔍 Checking test PO: ${poId}`);
        
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
        
        console.log('\n📊 Test PO Status:');
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
            console.log('Raw Data Keys:', Object.keys(po.rawData));
            if (po.rawData.confidence) {
                console.log(`AI Confidence: ${po.rawData.confidence}%`);
            }
            if (po.rawData.supplier) {
                console.log(`AI Detected Supplier: ${po.rawData.supplier}`);
            }
        } else {
            console.log('\n🤖 AI Analysis Data Available: No');
        }
        
        if (po.processingNotes) {
            console.log(`\n📝 Processing Notes: ${po.processingNotes}`);
        }
        
        // Check line items
        if (po.lineItems.length > 0) {
            console.log('\n📋 Line Items:');
            po.lineItems.forEach((item, index) => {
                console.log(`  ${index + 1}. ${item.productName} - ${item.quantity} x ${item.unitCost} = ${item.totalCost}`);
                if (item.confidence) {
                    console.log(`     Confidence: ${item.confidence}%`);
                }
            });
        }
        
        console.log('\n🔍 Analysis:');
        if (po.totalAmount > 0 && po.confidence === 0) {
            console.log('⚠️  ISSUE DETECTED: Total amount was extracted but confidence not updated');
            console.log('    This confirms database save is working but status update is failing');
        }
        
        if (po.status === 'review_needed' && po.confidence === 0) {
            console.log('⚠️  ISSUE DETECTED: Status is review_needed but confidence is 0%');
            console.log('    This suggests partial workflow completion');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

checkTestPO();