import { db } from './api/src/lib/db.js';

async function analyzeWorkflowIssue() {
    try {
        const poId = 'cmfyxipae000155r0zy7qpc48';
        console.log(`🔍 Analyzing workflow issue for PO: ${poId}`);
        
        const po = await db.client.purchaseOrder.findUnique({
            where: { id: poId },
            include: {
                lineItems: true
            }
        });
        
        if (!po || !po.rawData) {
            console.log('❌ PO or raw data not found');
            return;
        }
        
        console.log('\n📊 Raw AI Analysis Data:');
        console.log('Supplier data:', JSON.stringify(po.rawData.supplier, null, 2));
        console.log('Totals data:', JSON.stringify(po.rawData.totals, null, 2));
        
        // Calculate what the confidence should be
        const lineItemConfidences = po.lineItems.map(item => item.confidence || 0);
        const avgConfidence = lineItemConfidences.length > 0 
            ? lineItemConfidences.reduce((sum, conf) => sum + conf, 0) / lineItemConfidences.length 
            : 0;
        
        console.log('\n🧮 Confidence Analysis:');
        console.log(`Line item confidences: [${lineItemConfidences.join(', ')}]`);
        console.log(`Calculated average: ${avgConfidence.toFixed(2)}%`);
        console.log(`Current PO confidence: ${po.confidence}%`);
        console.log(`Gap: ${(avgConfidence - po.confidence).toFixed(2)}%`);
        
        // Check what the supplier should be
        if (po.rawData.supplier) {
            console.log('\n🏢 Supplier Analysis:');
            console.log(`Raw supplier data:`, po.rawData.supplier);
            console.log(`Current supplier: "${po.supplierName}"`);
            console.log(`Expected: Should be extracted from AI data`);
        }
        
        console.log('\n🎯 THEORY:');
        console.log('1. Database save stage works perfectly (data is all there)');
        console.log('2. Status update stage receives the data but fails to calculate/update fields');
        console.log('3. Our debug logs should show exactly where this fails');
        console.log('4. The issue is likely in the confidence calculation or supplier extraction logic');
        
        console.log('\n🔧 NEXT STEPS:');
        console.log('1. Check API server logs for status update debug messages');
        console.log('2. Look for our enhanced debug logs showing purchaseOrderId validation');
        console.log('3. Find where the database update attempt fails or gets skipped');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

analyzeWorkflowIssue();