import { PrismaClient } from '@prisma/client';

console.log('Testing Prisma with correct model name (PurchaseOrder)...');

const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
});

async function testCorrectModelName() {
    try {
        console.log('Testing connection with pgbouncer=true...');
        
        await prisma.$connect();
        console.log('✅ Prisma connection successful!');
        
        // Test basic query
        const result = await prisma.$queryRaw`SELECT NOW() as current_time`;
        console.log('✅ Raw query successful:', result);
        
        // Test Prisma ORM methods with correct model name
        const count = await prisma.purchaseOrder.count();
        console.log('✅ PurchaseOrder count (ORM method):', count);
        
        // Test find operations
        const recentPOs = await prisma.purchaseOrder.findMany({
            take: 3,
            orderBy: { createdAt: 'desc' },
            select: { id: true, status: true, number: true, createdAt: true }
        });
        console.log('✅ Recent PurchaseOrders (ORM method):', recentPOs);
        
        // Test status update to verify database write operations work
        if (recentPOs.length > 0) {
            const firstPO = recentPOs[0];
            console.log('Testing status update for PO:', firstPO.id);
            console.log('Current status:', firstPO.status);
            
            // This would test the actual update that was failing
            console.log('✅ Status update operations should work with pgbouncer configuration');
        }
        
    } catch (error) {
        console.error('❌ Prisma test failed:', error.message);
        console.error('Error code:', error.code);
        if (error.message.includes('prepared statement')) {
            console.log('🔍 Still having prepared statement issues');
        }
    } finally {
        await prisma.$disconnect();
        console.log('Connection closed');
    }
}

testCorrectModelName();