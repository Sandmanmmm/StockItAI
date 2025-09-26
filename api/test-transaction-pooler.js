import { PrismaClient } from '@prisma/client';

console.log('Testing Prisma with transaction pooler (port 6543)...');

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: "postgresql://postgres.omvdgqbmgxxutbjhnamf:78eXTjEWiC1aXoOe@aws-1-ca-central-1.pooler.supabase.com:6543/postgres?sslmode=require"
        }
    },
    log: ['query', 'info', 'warn', 'error'],
});

async function testTransactionPooler() {
    try {
        console.log('Attempting connection to transaction pooler...');
        
        // Test basic connection
        await prisma.$connect();
        console.log('✅ Transaction pooler connection successful!');
        
        // Test a simple query
        const result = await prisma.$queryRaw`SELECT NOW() as current_time`;
        console.log('✅ Query successful:', result);
        
    } catch (error) {
        console.error('❌ Transaction pooler connection failed:', error.message);
        console.error('Error code:', error.code);
        if (error.message.includes('prepared statement')) {
            console.log('🔍 This confirms transaction pooler doesn\'t support PREPARE statements');
        }
    } finally {
        await prisma.$disconnect();
        console.log('Connection closed');
    }
}

testTransactionPooler();