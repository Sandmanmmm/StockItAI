import { PrismaClient } from '@prisma/client';

console.log('Testing Prisma database connection...');

const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
});

async function testPrismaConnection() {
    try {
        console.log('Attempting Prisma connection...');
        
        // Test basic connection
        await prisma.$connect();
        console.log('✅ Prisma connection successful!');
        
        // Test a simple query
        const result = await prisma.$queryRaw`SELECT NOW() as current_time`;
        console.log('✅ Query successful:', result);
        
        // Test another query to see if connection is stable
        const count = await prisma.pO.count();
        console.log('✅ PO count query successful:', count);
        
    } catch (error) {
        console.error('❌ Prisma connection failed:', error.message);
        console.error('Error code:', error.code);
        console.error('Full error:', error);
    } finally {
        await prisma.$disconnect();
        console.log('Prisma connection closed');
    }
}

testPrismaConnection();