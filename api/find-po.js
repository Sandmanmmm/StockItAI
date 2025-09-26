import { PrismaClient } from '@prisma/client';

console.log('🔍 Searching for PO-1758767425361...');

const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
});

async function findSpecificPO() {
    try {
        await prisma.$connect();
        console.log('✅ Connected to database');
        
        // Find the exact PO
        const po = await prisma.purchaseOrder.findFirst({
            where: { number: 'PO-1758767425361' },
            include: {
                lineItems: true,
                aiAuditTrail: true
            }
        });
        
        if (!po) {
            console.log('❌ PO-1758767425361 not found');
            
            // Search for recent POs to see what exists
            console.log('\n📋 Recent POs in database:');
            const recentPOs = await prisma.purchaseOrder.findMany({
                select: { number: true, status: true, confidence: true, totalAmount: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 10
            });
            
            recentPOs.forEach((po, idx) => {
                console.log(`${idx + 1}. ${po.number} - Status: ${po.status}, Confidence: ${po.confidence}, Amount: $${po.totalAmount}, Created: ${po.createdAt}`);
            });
            
            return;
        }
        
        console.log('\n📋 Found PO-1758767425361:');
        console.log('ID:', po.id);
        console.log('Status:', po.status);
        console.log('Job Status:', po.jobStatus);
        console.log('Confidence:', po.confidence);
        console.log('Total Amount:', po.totalAmount);
        console.log('Currency:', po.currency);
        console.log('Supplier:', po.supplierName);
        console.log('File Name:', po.fileName);
        console.log('Processing Notes:', po.processingNotes);
        console.log('Job Error:', po.jobError);
        console.log('Line Items Count:', po.lineItems.length);
        console.log('AI Audit Count:', po.aiAuditTrail.length);
        
        if (po.rawData) {
            console.log('\n📄 Raw data exists');
        } else {
            console.log('\n❌ No raw data - processing likely failed');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

findSpecificPO();