import { PrismaClient } from '@prisma/client';

console.log('Testing direct connection string from dashboard...');

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: "postgresql://postgres.omvdgqbmgxxutbjhnamf:78eXTjEWiC1aXoOe@db.omvdgqbmgxxutbjhnamf.supabase.co:5432/postgres?sslmode=require"
        }
    },
    log: ['query', 'info', 'warn', 'error'],
});

async function testDirectConnection() {
    try {
        console.log('Testing direct connection...');
        
        await prisma.$connect();
        console.log('✅ Direct connection successful!');
        
        // Test a simple query
        const result = await prisma.$queryRaw`SELECT NOW() as current_time`;
        console.log('✅ Query successful:', result);
        
        // Test table access
        const countResult = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "PO"`;
        console.log('✅ PO count query:', countResult);
        
    } catch (error) {
        console.error('❌ Direct connection failed:', error.message);
        console.error('Error code:', error.code);
    } finally {
        await prisma.$disconnect();
        console.log('Connection closed');
    }
}

testDirectConnection();