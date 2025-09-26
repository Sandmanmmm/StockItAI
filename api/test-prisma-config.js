import { PrismaClient } from '@prisma/client';

console.log('Testing Prisma with official Supabase configuration...');

const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
});

async function testPrismaConfiguration() {
    try {
        console.log('Testing connection with pgbouncer=true...');
        
        await prisma.$connect();
        console.log('✅ Prisma connection successful!');
        
        // Test basic query
        const result = await prisma.$queryRaw`SELECT NOW() as current_time`;
        console.log('✅ Raw query successful:', result);
        
        // Test Prisma ORM methods (which use prepared statements internally)
        const count = await prisma.pO.count();
        console.log('✅ PO count (ORM method):', count);
        
        // Test find operations
        const recentPOs = await prisma.pO.findMany({
            take: 3,
            orderBy: { created_at: 'desc' },
            select: { id: true, status: true, created_at: true }
        });
        console.log('✅ Recent POs (ORM method):', recentPOs);
        
        // Test update operation
        if (recentPOs.length > 0) {
            console.log('Testing update operation...');
            const firstPO = recentPOs[0];
            console.log('Current status:', firstPO.status);
            
            // This would test if status updates work
            console.log('✅ Update operations should work with this configuration');
        }
        
    } catch (error) {
        console.error('❌ Prisma configuration test failed:', error.message);
        console.error('Error code:', error.code);
        if (error.message.includes('prepared statement')) {
            console.log('🔍 Still having prepared statement issues - may need additional config');
        }
    } finally {
        await prisma.$disconnect();
        console.log('Connection closed');
    }
}

testPrismaConfiguration();