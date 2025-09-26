import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkLatestPO() {
    console.log('🔍 Checking the latest PO from our test...\n');
    
    try {
        // Get the most recent PO (by creation time)
        const latestPO = await prisma.purchaseOrder.findFirst({
            orderBy: { createdAt: 'desc' },
            include: {
                lineItems: true,
                supplier: true
            }
        });
        
        if (latestPO) {
            console.log('📋 Latest Purchase Order:');
            console.log('   ID:', latestPO.id);
            console.log('   Number:', latestPO.number);
            console.log('   Status:', latestPO.status);
            console.log('   Job Status:', latestPO.jobStatus);
            console.log('   Confidence:', latestPO.confidence);
            console.log('   Total Amount:', latestPO.totalAmount);
            console.log('   Supplier Name:', latestPO.supplierName);
            console.log('   File Name:', latestPO.fileName);
            console.log('   Created At:', latestPO.createdAt);
            console.log('   Line Items:', latestPO.lineItems?.length || 0);
            console.log('   Raw Data Present:', !!latestPO.rawData);
            
            if (latestPO.rawData) {
                console.log('\n📊 Raw Data Sample:');
                console.log('   PO Number:', latestPO.rawData.poNumber);
                console.log('   Supplier:', latestPO.rawData.vendor?.name || latestPO.rawData.supplierName);
                console.log('   Total:', latestPO.rawData.totals?.total || latestPO.rawData.total);
                console.log('   Items Count:', latestPO.rawData.lineItems?.length || 0);
            }
            
            if (latestPO.lineItems && latestPO.lineItems.length > 0) {
                console.log('\n📦 Line Items:');
                latestPO.lineItems.forEach((item, index) => {
                    console.log(`   ${index + 1}. ${item.itemName || 'Unknown'} - Qty: ${item.quantity}, Unit: $${item.unitPrice}, Total: $${item.totalPrice}`);
                });
            }
            
        } else {
            console.log('❌ No purchase orders found in database');
        }
        
        // Also check the recent test PO we just created
        console.log('\n🔍 Looking for test PO from our workflow...');
        const testPO = await prisma.purchaseOrder.findFirst({
            where: {
                fileName: 'test-po.csv'
            },
            orderBy: { createdAt: 'desc' },
            include: {
                lineItems: true,
                supplier: true
            }
        });
        
        if (testPO) {
            console.log('\n📋 Test PO from automatic processing:');
            console.log('   ID:', testPO.id);
            console.log('   Number:', testPO.number);
            console.log('   Status:', testPO.status);
            console.log('   Job Status:', testPO.jobStatus);
            console.log('   Confidence:', testPO.confidence);
            console.log('   Total Amount:', testPO.totalAmount);
            console.log('   Supplier Name:', testPO.supplierName);
            console.log('   File Name:', testPO.fileName);
            console.log('   Line Items:', testPO.lineItems?.length || 0);
            console.log('   Raw Data Present:', !!testPO.rawData);
        } else {
            console.log('❌ No test PO found with filename test-po.csv');
        }
        
    } catch (error) {
        console.error('❌ Error checking POs:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkLatestPO();