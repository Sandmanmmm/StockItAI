import { PrismaClient } from '@prisma/client';

console.log('🔍 Checking the most recent PO: PO-1758768142142...');

const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
});

async function checkRecentPO() {
    try {
        await prisma.$connect();
        console.log('✅ Connected to database');
        
        // Find the specific recent PO
        const po = await prisma.purchaseOrder.findFirst({
            where: { number: 'PO-1758768142142' },
            include: {
                lineItems: true,
                aiAuditTrail: true
            }
        });
        
        if (!po) {
            console.log('❌ PO-1758768142142 not found');
            
            // Show all recent POs to see what we have
            console.log('\n📋 Recent POs in database:');
            const recentPOs = await prisma.purchaseOrder.findMany({
                select: { 
                    number: true, 
                    status: true, 
                    confidence: true, 
                    totalAmount: true, 
                    supplierName: true,
                    createdAt: true,
                    lineItems: {
                        select: { id: true }
                    }
                },
                orderBy: { createdAt: 'desc' },
                take: 5
            });
            
            recentPOs.forEach((po, idx) => {
                console.log(`${idx + 1}. ${po.number}`);
                console.log(`   Status: ${po.status}, Confidence: ${po.confidence}`);
                console.log(`   Amount: $${po.totalAmount}, Supplier: "${po.supplierName}"`);
                console.log(`   Line Items: ${po.lineItems.length}, Created: ${po.createdAt}`);
                console.log('');
            });
            
            return;
        }
        
        console.log('\n📋 Found PO-1758768142142:');
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
            console.log('\n📄 Raw data exists, parsing...');
            try {
                const rawData = JSON.parse(po.rawData);
                console.log('Extracted Data Preview:');
                if (rawData.extractedData) {
                    console.log('- Supplier:', rawData.extractedData.supplier?.name);
                    console.log('- Total:', rawData.extractedData.totals?.grandTotal);
                    console.log('- Line Items:', rawData.extractedData.lineItems?.length);
                    console.log('- Confidence:', rawData.confidence);
                }
            } catch (e) {
                console.log('Raw data parsing error:', e.message);
            }
        } else {
            console.log('\n❌ No raw data - processing may have failed');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkRecentPO();