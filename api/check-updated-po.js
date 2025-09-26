import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUpdatedPO() {
    console.log('🔍 Checking the PO we updated...\n');
    
    try {
        const po = await prisma.purchaseOrder.findUnique({
            where: { id: 'cmfywps8y000155jcaxuh8625' },
            include: {
                lineItems: true,
                supplier: true
            }
        });
        
        if (po) {
            console.log('📋 Test PO (cmfywps8y000155jcaxuh8625):');
            console.log('   Number:', po.number);
            console.log('   Status:', po.status);
            console.log('   Job Status:', po.jobStatus);
            console.log('   Confidence:', po.confidence);
            console.log('   Total Amount:', po.totalAmount);
            console.log('   Supplier Name:', po.supplierName);
            console.log('   Line Items:', po.lineItems?.length || 0);
            console.log('   Raw Data Present:', !!po.rawData);
            console.log('   Created At:', po.createdAt);
            console.log('   Updated At:', po.updatedAt);
            
            if (po.confidence > 0 && po.totalAmount > 0) {
                console.log('\n✅ PO WAS SUCCESSFULLY UPDATED!');
            } else {
                console.log('\n❌ PO still shows original processing state');
            }
            
        } else {
            console.log('❌ PO not found');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkUpdatedPO();