import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAllRecentPOs() {
    console.log('🔍 Checking all recent POs to see if there are duplicates...\n');
    
    try {
        // Get the most recent POs (last 5)
        const recentPOs = await prisma.purchaseOrder.findMany({
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: {
                lineItems: true,
                supplier: true
            }
        });
        
        console.log(`Found ${recentPOs.length} recent POs:\n`);
        
        recentPOs.forEach((po, index) => {
            console.log(`${index + 1}. PO ID: ${po.id}`);
            console.log(`   Number: ${po.number}`);
            console.log(`   Status: ${po.status}`);
            console.log(`   Job Status: ${po.jobStatus}`);
            console.log(`   Confidence: ${po.confidence}`);
            console.log(`   Total Amount: ${po.totalAmount}`);
            console.log(`   Supplier Name: ${po.supplierName}`);
            console.log(`   File Name: ${po.fileName}`);
            console.log(`   Line Items: ${po.lineItems?.length || 0}`);
            console.log(`   Raw Data Present: ${!!po.rawData}`);
            console.log(`   Created At: ${po.createdAt}`);
            console.log(`   Updated At: ${po.updatedAt}`);
            console.log('');
        });
        
        // Check if any PO has the workflow test data
        const testPO = recentPOs.find(po => 
            po.fileName === 'test-po.csv' && 
            po.confidence > 0 && 
            po.status !== 'processing'
        );
        
        if (testPO) {
            console.log('✅ Found processed test PO:');
            console.log('   ID:', testPO.id);
            console.log('   Status:', testPO.status);
            console.log('   Confidence:', testPO.confidence);
            console.log('   Total Amount:', testPO.totalAmount);
        } else {
            console.log('❌ No processed test PO found - all test POs still show "processing" status');
        }
        
    } catch (error) {
        console.error('❌ Error checking POs:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkAllRecentPOs();