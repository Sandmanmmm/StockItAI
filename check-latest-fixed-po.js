import { db } from './api/src/lib/db.js';

async function checkFixedPO() {
    try {
        const poId = 'cmfyxngdu000155vkcs36o5jg';
        console.log(`🔍 Checking FIXED PO: ${poId}`);
        
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
        
        console.log('\n📊 FIXED PO Status:');
        console.log(`ID: ${po.id}`);
        console.log(`Status: ${po.status}`);
        console.log(`Confidence: ${po.confidence}% ${po.confidence > 0 ? '✅ FIXED!' : '❌'}`);
        console.log(`Supplier: "${po.supplierName}" ${po.supplierName !== 'Unknown' ? '✅' : '❌ Still needs fix'}`);
        console.log(`Total Amount: ${po.totalAmount} USD`);
        console.log(`Line Items: ${po.lineItems.length}`);
        
        if (po.rawData && po.rawData.supplier) {
            console.log('\n🏢 Raw Supplier Data Analysis:');
            console.log('Raw supplier object:', JSON.stringify(po.rawData.supplier, null, 2));
            console.log('Type of supplier:', typeof po.rawData.supplier);
            console.log('Supplier.name exists:', !!po.rawData.supplier.name);
            console.log('Supplier.name value:', JSON.stringify(po.rawData.supplier.name));
            console.log('Supplier.name type:', typeof po.rawData.supplier.name);
            
            if (po.rawData.supplier.name) {
                console.log('\n🔧 DIAGNOSIS:');
                console.log('✅ AI detected supplier name correctly');
                console.log('❌ Status update stage not extracting it properly');
                console.log('🎯 Need to debug the supplier extraction logic');
            }
        }
        
        console.log('\n📋 SUMMARY:');
        console.log(`✅ Confidence Fix: ${po.confidence > 0 ? 'SUCCESS' : 'FAILED'}`);
        console.log(`${po.supplierName !== 'Unknown' ? '✅' : '❌'} Supplier Fix: ${po.supplierName !== 'Unknown' ? 'SUCCESS' : 'NEEDS WORK'}`);
        
        if (po.confidence > 0 && po.supplierName === 'Unknown') {
            console.log('\n🎯 NEXT ACTION: Fix supplier name extraction in status update logic');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

checkFixedPO();